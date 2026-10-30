// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHAT THE PLATFORM ACTUALLY PAYS ITS PROVIDERS — correctable from the invoice.
//
// THE QUESTION THAT PRODUCED THIS FILE. The owner, comparing our presenter
// price to HeyGen's: *"they are very very cheap compared to the price you are
// telling me."* Most of that gap is structural — HeyGen builds its own avatar
// models and we resell them, so we pay their retail API and they pay GPU-seconds
// — but part of it was ours: `PROVIDER_COST_GBP.avatar` is an ESTIMATE, written
// before anybody had an invoice, and its own comment says so:
//
//   "deliberately on the high side — under-costing here breaches the margin
//    floor silently, while over-costing only leaves money on the table.
//    Correct it against the first real invoice; every downstream price
//    re-derives."
//
// That correction required editing source and deploying, which is the wrong
// shape for a number only knowable AFTER a vendor bills you. Now it is typed
// into the Admin Control Centre and every dependent price re-derives within a
// minute, with no deploy — the same mechanism §170 gave the API keys.
//
// WHAT AN OVERRIDE CANNOT DO, because this is the money path:
//   • It cannot breach the margin floor. It sets the believed PROVIDER COST;
//     the customer price is still `priced()`, which takes the higher of 4x that
//     cost and the minimum that clears 100% net profit after infra and Stripe.
//   • It cannot invent a line. Only keys already in `PROVIDER_COST_GBP` are
//     applied; anything else is ignored and counted.
//   • It cannot be absurd. Negative, non-finite and over-£100 values are
//     dropped rather than re-deriving a price of zero or one nobody can pay.
//
// WHERE IT LIVES: `platform_config/provider_costs`, beside the admin API keys.
// No new collection, so the data register is unchanged — and it holds no
// customer data, only what our own suppliers charge us.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { applyProviderCostOverrides, providerCostGbp, ACTION_COST_ACU } from "@/backend/wallet";

const COLLECTION = "platform_config";
const DOC = "provider_costs";

let lastRead = 0;
const TTL_MS = 60_000;

export type CostOverride = {
  key: string; costGbp: number; updatedAt: string; updatedBy: string;
  /**
   * WHERE THIS NUMBER CAME FROM, kept with it.
   *
   * A corrected cost outlives the person who typed it. Six months on, "why is
   * the LLM line £0.0042?" has to be answerable without archaeology — so a
   * reconciliation stores the month, the invoice and the units it divided by,
   * and a hand-typed number says that it was one.
   */
  source?: "invoice" | "manual";
  month?: string;
  units?: number;
  invoiceAmount?: number;
  currency?: string;
  fxToGbp?: number;
};

async function readDoc(): Promise<Record<string, CostOverride>> {
  if (!adminConfigured || !adminDb) return {};
  try {
    const snap = await adminDb.collection(COLLECTION).doc(DOC).get();
    const data = snap.exists ? snap.data() : null;
    if (!data || typeof data !== "object") return {};
    const out: Record<string, CostOverride> = {};
    for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Partial<CostOverride>;
      if (typeof r.costGbp !== "number" || !Number.isFinite(r.costGbp)) continue;
      out[key] = {
        key,
        costGbp: r.costGbp,
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
        updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : "",
        ...(r.source === "invoice" || r.source === "manual" ? { source: r.source } : {}),
        ...(typeof r.month === "string" ? { month: r.month } : {}),
        ...(typeof r.units === "number" ? { units: r.units } : {}),
        ...(typeof r.invoiceAmount === "number" ? { invoiceAmount: r.invoiceAmount } : {}),
        ...(typeof r.currency === "string" ? { currency: r.currency } : {}),
        ...(typeof r.fxToGbp === "number" ? { fxToGbp: r.fxToGbp } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Load the overrides and re-derive every price that depends on one.
 *
 * TTL-cached and never throws: this runs inside `meterAction`, which is the
 * function that takes a customer's money, and a store hiccup must never be the
 * reason a paid action fails. A failed read leaves the previous prices in
 * place, which are the estimates — the state the platform was in before this
 * file existed.
 */
export async function ensureProviderCosts(): Promise<void> {
  if (!adminConfigured || !adminDb) return;
  if (Date.now() - lastRead < TTL_MS) return;
  lastRead = Date.now();
  try {
    const doc = await readDoc();
    const overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(doc)) overrides[k] = v.costGbp;

    // THE PRESENTER PRICE FOLLOWS THE PROVIDER THAT WILL ACTUALLY RENDER IT.
    //
    // `PROVIDER_COST_GBP.avatar` is one number for "a presenter minute", but
    // the pool holds three suppliers at three different rates, and it now
    // routes to the cheapest. Leaving the price on the catalogue estimate would
    // mean configuring a cheaper provider made the margin quietly fatter
    // instead of making the customer's price lower — which is the opposite of
    // the owner's pricing law: win on a lower cost base.
    //
    // An explicit admin correction still wins, because that one came off an
    // invoice and this one is an estimate. Imported dynamically so this module
    // and the gateway never form a cycle.
    if (!("avatar" in overrides)) {
      try {
        const { activeAvatarCostGbp } = await import("@/backend/avatar-gateway");
        const active = activeAvatarCostGbp();
        if (typeof active === "number" && active >= 0) overrides.avatar = active;
      } catch { /* the catalogue estimate stands */ }
    }

    applyProviderCostOverrides(overrides);
  } catch { /* the estimates stand */ }
}

/**
 * The most any one of these can plausibly be, per unit.
 *
 * Exported because a reconciliation divides an invoice by a unit count and can
 * land above it — and a preview that offers an Apply button the applier will
 * refuse is the defect this codebase keeps producing: a value on one side of a
 * boundary that never reaches the other.
 */
export const MAX_COST_GBP = 100;

export type SetCostResult =
  | { ok: true; key: string; costGbp: number; wasAcu: number; nowAcu: number }
  | { ok: false; status: number; error: string };

/** Record what a provider really charges, and re-derive the prices now. */
export async function setProviderCost(
  key: string,
  costGbp: number,
  by: string,
  provenance?: { source: "invoice" | "manual"; month?: string; units?: number; invoiceAmount?: number; currency?: string; fxToGbp?: number },
): Promise<SetCostResult> {
  const known = providerCostGbp();
  if (!(key in known)) {
    return { ok: false, status: 400, error: `${key} is not a provider cost this platform has. Only a line that already exists can be corrected.` };
  }
  if (typeof costGbp !== "number" || !Number.isFinite(costGbp) || costGbp < 0) {
    return { ok: false, status: 400, error: "A provider cost has to be a number of pounds, zero or more." };
  }
  if (costGbp > MAX_COST_GBP) {
    return { ok: false, status: 400, error: `That is over £${MAX_COST_GBP} per unit. Every one of these is a per-call, per-minute or per-thousand-character cost, so a number that large is almost certainly a misread invoice — and it would re-derive a price nobody can pay.` };
  }
  if (!adminConfigured || !adminDb) {
    return { ok: false, status: 503, error: "No database is configured, so a corrected cost has nowhere to live. It would be lost on the next deploy." };
  }

  const wasAcu = ACTION_COST_ACU[key as keyof typeof ACTION_COST_ACU] ?? 0;
  await adminDb.collection(COLLECTION).doc(DOC).set({
    [key]: {
      key, costGbp, updatedAt: new Date().toISOString(), updatedBy: by || "admin",
      source: provenance?.source || "manual",
      ...(provenance?.month ? { month: provenance.month } : {}),
      ...(typeof provenance?.units === "number" ? { units: provenance.units } : {}),
      ...(typeof provenance?.invoiceAmount === "number" ? { invoiceAmount: provenance.invoiceAmount } : {}),
      ...(provenance?.currency ? { currency: provenance.currency } : {}),
      ...(typeof provenance?.fxToGbp === "number" ? { fxToGbp: provenance.fxToGbp } : {}),
    },
  }, { merge: true });

  // Apply to THIS instance immediately so the admin sees the new price in the
  // same breath as saving it; every other instance picks it up within a minute.
  lastRead = 0;
  await ensureProviderCosts();
  const nowAcu = ACTION_COST_ACU[key as keyof typeof ACTION_COST_ACU] ?? 0;
  return { ok: true, key, costGbp, wasAcu, nowAcu };
}

/** Drop a correction and go back to the built-in estimate. */
export async function clearProviderCost(key: string, _by: string): Promise<SetCostResult> {
  if (!adminConfigured || !adminDb) {
    return { ok: false, status: 503, error: "No database is configured, so there is no stored correction to remove." };
  }
  const wasAcu = ACTION_COST_ACU[key as keyof typeof ACTION_COST_ACU] ?? 0;
  const { FieldValue } = await import("firebase-admin/firestore");
  await adminDb.collection(COLLECTION).doc(DOC).set({ [key]: FieldValue.delete() }, { merge: true });
  lastRead = 0;
  await ensureProviderCosts();
  const nowAcu = ACTION_COST_ACU[key as keyof typeof ACTION_COST_ACU] ?? 0;
  return { ok: true, key, costGbp: providerCostGbp()[key] ?? 0, wasAcu, nowAcu };
}

export type CostLine = {
  key: string;
  /** What we believe we pay, per unit. */
  costGbp: number;
  /** True when that belief is a correction rather than the built-in estimate. */
  corrected: boolean;
  updatedAt?: string;
  /** How this correction was arrived at, when it is one. */
  from?: string;
  /** What the customer pays for one unit, after the pricing law. */
  priceAcu: number;
  priceGbp: number;
  /** The multiple of provider cost the customer price represents. */
  markup: number | null;
  /** The unit this is per — minutes, calls, thousands of characters. */
  unit: string;
};

/**
 * Which unit each cost is per, so the admin screen cannot invite somebody to
 * type a per-video price into a per-minute line. Written out rather than
 * inferred, because a wrong unit here re-derives a wrong price everywhere.
 */
const UNITS: Record<string, string> = {
  llm: "per AI call",
  search: "per web search",
  image: "per generated image",
  video: "per generated second",
  enrich: "per free enrichment",
  enrich_paid: "per paid enrichment",
  post: "per published post",
  voice: "per 1,000 characters of speech",
  dub: "per minute of dubbed video",
  avatar: "per minute of presenter video",
  avatar_translate: "per minute, per language",
};

/** Every cost line with what it currently produces, for the admin screen. */
export async function costInventory(): Promise<{ lines: CostLine[]; note: string }> {
  await ensureProviderCosts();
  const doc = await readDoc();
  const costs = providerCostGbp();
  const lines: CostLine[] = Object.keys(costs).map((key) => {
    const costGbp = costs[key];
    const priceAcu = ACTION_COST_ACU[key as keyof typeof ACTION_COST_ACU] ?? 0;
    const priceGbp = priceAcu / 100;
    return {
      key,
      costGbp,
      corrected: Boolean(doc[key]),
      ...(doc[key]?.updatedAt ? { updatedAt: doc[key].updatedAt } : {}),
      ...(doc[key]
        ? {
            from: doc[key].source === "invoice" && doc[key].month
              ? `${doc[key].currency || "GBP"} ${doc[key].invoiceAmount ?? "?"} ÷ ${doc[key].units ?? "?"} units, ${doc[key].month}`
              : "typed in by hand",
          }
        : {}),
      priceAcu,
      priceGbp,
      markup: costGbp > 0 ? Math.round((priceGbp / costGbp) * 10) / 10 : null,
      unit: UNITS[key] || "per unit",
    };
  });
  const corrected = lines.filter((l) => l.corrected).length;
  return {
    lines,
    note: corrected
      ? `${corrected} of ${lines.length} costs are corrected from a real invoice. The rest are the built-in estimates, which are deliberately on the high side — so the prices derived from them are too.`
      : "Every cost here is a built-in ESTIMATE, deliberately on the high side so the margin floor can never be breached silently. That means the prices derived from them are higher than they need to be. Correct one against a real invoice and its price re-derives immediately.",
  };
}
