// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// TURNING AN INVOICE INTO A PRICE.
//
// §172 made provider costs correctable from the admin screen, which moved the
// problem rather than solving it: the arithmetic is `invoice total ÷ units
// consumed in the same month`, and the owner could see the invoice but NOT the
// units. Two of the four numbers in that division were on no screen anywhere —
// `/api/admin/ai-spend` has reported the platform's own call count since it was
// written and **nothing has ever called it**, and presenter minutes were only
// ever implied by an ACU total.
//
// So this module answers the one question that makes a correction possible:
// HOW MANY UNITS DID WE BUY LAST MONTH? Paste the invoice beside it and the
// cost per unit falls out.
//
// ───────────────────────────────────────────────────────────────────────────
// COUNTED VERSUS DERIVED, AND WHY THE DIFFERENCE IS PRINTED
// ───────────────────────────────────────────────────────────────────────────
//
// Three lines have a ledger that counted the thing itself:
//
//   • `llm` — `ai_spend_months/{month}.calls`, incremented once per provider
//     call, platform-wide and durable.
//   • `avatar` — the `minutes` on every row in `avatar_renders` for the month.
//   • `avatar_translate` — the same, from `avatar_translations`.
//
// Everything else is DERIVED: `agent_spend` records the ACUs charged per
// action kind, so units = ACUs ÷ the price of that action. That is exact only
// while the price has not moved. If a cost was corrected mid-month, the derived
// figure is wrong in proportion — so it is labelled `derived`, carries the
// caveat, and the screen shows it differently. A number that looks measured and
// is actually inferred is how a confident wrong price gets typed in.
//
// WHAT IT CANNOT SEE, stated: `agent_spend` is one document per wallet with the
// rows inside it, so a platform-wide month needs a scan rather than a query.
// It is capped, and the cap is reported rather than silently truncating.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { ACTION_COST_ACU, providerCostGbp, priceForCost } from "@/backend/wallet";
import { MAX_COST_GBP } from "@/backend/provider-costs";
import type { AgentSpendRow } from "@/shared/agent-economics";

/** How many wallet documents a reconciliation will read before it stops. */
const WALLET_SCAN_CAP = 500;

export type UnitSource = "counted" | "derived" | "none";

export type UnitLine = {
  /** The cost line this counts units for. */
  key: string;
  /** What one unit is, in the owner's words. */
  unit: string;
  units: number;
  source: UnitSource;
  /** Where the number came from, so it can be argued with. */
  how: string;
  /** Present when the number is an inference rather than a count. */
  caveat?: string;
};

export type MonthUnits = {
  month: string;
  lines: UnitLine[];
  /** What our own meter thinks we spent, which is NOT the invoice. */
  measured: { totalUsd: number; unpaidUsd: number; calls: number; usdPerCall: number | null } | null;
  walletsScanned: number;
  walletsCapped: boolean;
  note: string;
};

/** "2026-10" → the ISO bounds of that month, for a string range query. */
function monthBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${next}-01` };
}

/** The months a correction can sensibly be made for: this one and the 11 before. */
export function recentMonths(now = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 0; i < 12; i++) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

/** The two ledgers that record minutes. Named here so `check:register` can see them. */
const AVATAR_RENDERS = "avatar_renders";
const AVATAR_TRANSLATIONS = "avatar_translations";

/** How many rows one month's minutes may be summed from. */
const MINUTE_ROW_CAP = 5000;

/**
 * Sum the `minutes` on every row a query returns.
 *
 * Takes the QUERY rather than the collection name, so the name stays a literal
 * at the call site: `check:register` resolves `.collection("x")` and
 * `.collection(CONST)`, and a collection named by a parameter is invisible to
 * the data register — which is how a store ends up outside the GDPR export.
 */
async function sumMinutes(query: { get(): Promise<{ docs: { data(): unknown }[] }> }): Promise<number> {
  try {
    const snap = await query.get();
    let total = 0;
    for (const d of snap.docs) {
      const raw = d.data();
      const m = raw && typeof raw === "object" ? (raw as { minutes?: unknown }).minutes : undefined;
      if (typeof m === "number" && Number.isFinite(m) && m > 0) total += m;
    }
    return total;
  } catch {
    return 0;
  }
}

/** ACUs charged per action kind across every wallet, for the month. */
async function acusByKind(start: string, end: string): Promise<{ byKind: Record<string, number>; scanned: number; capped: boolean }> {
  const byKind: Record<string, number> = {};
  if (!adminDb) return { byKind, scanned: 0, capped: false };
  try {
    const snap = await adminDb.collection("agent_spend").limit(WALLET_SCAN_CAP).get();
    for (const d of snap.docs) {
      const raw = d.data();
      const rows = raw && typeof raw === "object" ? (raw as { rows?: unknown }).rows : undefined;
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        const row = r as Partial<AgentSpendRow>;
        if (typeof row.at !== "string" || row.at < start || row.at >= end) continue;
        if (typeof row.kind !== "string" || typeof row.acus !== "number") continue;
        byKind[row.kind] = (byKind[row.kind] || 0) + row.acus;
      }
    }
    return { byKind, scanned: snap.size, capped: snap.size >= WALLET_SCAN_CAP };
  } catch {
    return { byKind, scanned: 0, capped: false };
  }
}

const UNIT_LABEL: Record<string, string> = {
  llm: "AI calls",
  search: "web searches",
  image: "generated images",
  video: "generated video seconds",
  enrich: "free enrichments",
  enrich_paid: "paid enrichments",
  post: "published posts",
  voice: "thousands of characters spoken",
  dub: "dubbed minutes",
  avatar: "presenter minutes",
  avatar_translate: "translated minutes",
};

/**
 * Turn raw ledger readings into labelled unit lines.
 *
 * Pure, and separate from the reads, for one reason: the labelling is the
 * dangerous part. A derived figure presented as a counted one is exactly how a
 * confident wrong price gets typed into the screen above, and a boundary
 * reachable only through Firestore is a boundary nobody tests. This one can be
 * driven directly with the readings that produce each label.
 */
export function unitLinesFrom(readings: {
  calls: number;
  avatarMinutes: number;
  translateMinutes: number;
  byKind: Record<string, number>;
}): UnitLine[] {
  const lines: UnitLine[] = [];
  const add = (key: string, units: number, source: UnitSource, how: string, caveat?: string) => {
    lines.push({ key, unit: UNIT_LABEL[key] || "units", units: Math.round(units * 100) / 100, source, how, ...(caveat ? { caveat } : {}) });
  };

  const { calls, avatarMinutes, translateMinutes, byKind } = readings;

  add("llm", calls, calls > 0 ? "counted" : "none",
    "Counted once per provider call in ai_spend_months, platform-wide.",
    calls > 0 ? undefined : "Nothing was recorded for this month — either no AI ran, or the month predates this ledger.");

  add("avatar", avatarMinutes, avatarMinutes > 0 ? "counted" : "none",
    "Summed from the minutes on every presenter render started in the month.");

  add("avatar_translate", translateMinutes, translateMinutes > 0 ? "counted" : "none",
    "Summed from the minutes on every translation started in the month.");

  for (const key of Object.keys(providerCostGbp())) {
    if (key === "llm" || key === "avatar" || key === "avatar_translate") continue;
    const acus = byKind[key] || 0;
    const price = ACTION_COST_ACU[key as keyof typeof ACTION_COST_ACU];
    const units = typeof price === "number" && price > 0 ? acus / price : 0;
    add(
      key, units, acus > 0 ? "derived" : "none",
      // A line nobody used did not have a figure INFERRED for it — it has no
      // figure. Printing "inferred from 0 ACUs, divided by its price" beside a
      // zero reads as a measurement, which is the mislabelling this whole
      // counted/derived split exists to prevent.
      acus > 0
        ? `Inferred from ${acus} ACUs charged for this action, divided by its current price of ${price} ACUs.`
        : "Nothing was charged for this action in the month, so there is nothing to divide. An invoice covering it needs the unit count typed in by hand.",
      acus > 0
        ? "DERIVED, not counted. It is exact only while the price has not moved — if this cost was corrected during the month, the real unit count differs in proportion."
        : undefined,
    );
  }

  return lines;
}

/**
 * How many units of each billable thing the platform bought in a month.
 *
 * The denominator of every correction. Counted where a ledger counted the thing
 * itself, derived from ACUs where it did not, and never guessed.
 */
export async function unitsForMonth(month: string): Promise<MonthUnits> {
  const bounds = monthBounds(month);
  if (!bounds) {
    return { month, lines: [], measured: null, walletsScanned: 0, walletsCapped: false, note: "That is not a month. Use YYYY-MM." };
  }
  if (!adminConfigured || !adminDb) {
    return {
      month, lines: [], measured: null, walletsScanned: 0, walletsCapped: false,
      note: "No database is configured, so nothing was recorded to count. A reconciliation needs the ledgers that only exist once Firebase Admin is set.",
    };
  }

  const { start, end } = bounds;

  // --- counted -------------------------------------------------------------
  let calls = 0;
  let measured: MonthUnits["measured"] = null;
  try {
    const d = await adminDb.collection("ai_spend_months").doc(month).get();
    const raw = d.exists ? d.data() : null;
    if (raw && typeof raw === "object") {
      const r = raw as { totalUsd?: unknown; unpaidUsd?: unknown; calls?: unknown };
      const totalUsd = typeof r.totalUsd === "number" ? r.totalUsd : 0;
      const unpaidUsd = typeof r.unpaidUsd === "number" ? r.unpaidUsd : 0;
      calls = typeof r.calls === "number" ? r.calls : 0;
      measured = { totalUsd, unpaidUsd, calls, usdPerCall: calls > 0 ? totalUsd / calls : null };
    }
  } catch { /* the line below reports zero, which is the truth we have */ }

  const avatarMinutes = await sumMinutes(
    adminDb.collection(AVATAR_RENDERS).where("startedAt", ">=", start).where("startedAt", "<", end).limit(MINUTE_ROW_CAP),
  );
  const translateMinutes = await sumMinutes(
    adminDb.collection(AVATAR_TRANSLATIONS).where("startedAt", ">=", start).where("startedAt", "<", end).limit(MINUTE_ROW_CAP),
  );

  // --- derived -------------------------------------------------------------
  const { byKind, scanned, capped } = await acusByKind(start, end);

  const lines = unitLinesFrom({ calls, avatarMinutes, translateMinutes, byKind });

  return {
    month, lines, measured, walletsScanned: scanned, walletsCapped: capped,
    note: capped
      ? `Read ${scanned} wallets, which is the cap. The derived lines are therefore a FLOOR, not a total — the counted lines are unaffected.`
      : `Read ${scanned} wallets. Three lines are counted directly; the rest are derived from ACUs charged and are labelled as such.`,
  };
}

// ---------------------------------------------------------------------------
// The division
// ---------------------------------------------------------------------------

export type Reconciliation = {
  key: string;
  units: number;
  invoiceAmount: number;
  currency: string;
  fxToGbp: number;
  invoiceGbp: number;
  /** What the invoice says one unit really cost. */
  costPerUnitGbp: number;
  /** What we currently believe it cost. */
  currentCostGbp: number;
  currentPriceAcu: number;
  /** What the customer would pay once this is applied. */
  newPriceAcu: number;
  direction: "cheaper" | "dearer" | "same";
  changePct: number;
  verdict: string;
};

export type ReconcileInput = {
  key: string;
  units: number;
  invoiceAmount: number;
  currency?: string;
  /** How many pounds one unit of `currency` is worth. 1 for GBP. */
  fxToGbp?: number;
};

/**
 * Work out what an invoice says a unit costs, and what that would do to the
 * price — WITHOUT applying anything.
 *
 * Pure on purpose. The thing that changes what every customer is charged should
 * be shown in full and pressed deliberately, not computed inside the same call
 * that commits it. It also means the arithmetic is testable without a database,
 * an admin session or a provider.
 */
export function reconcile(input: ReconcileInput): Reconciliation | { error: string } {
  const key = (input.key || "").trim();
  const costs = providerCostGbp();
  if (!(key in costs)) return { error: `${key} is not a provider cost this platform has.` };

  const units = Number(input.units);
  if (!Number.isFinite(units) || units <= 0) {
    return { error: "There are no units to divide by. Pick a month the platform actually did this work in, or enter the unit count by hand." };
  }
  const invoiceAmount = Number(input.invoiceAmount);
  if (!Number.isFinite(invoiceAmount) || invoiceAmount < 0) {
    return { error: "The invoice total has to be a number, zero or more." };
  }
  const currency = (input.currency || "GBP").trim().toUpperCase().slice(0, 3);
  // A sterling invoice converts at 1 whatever the rate box says, including when
  // it says nothing: refusing "an invoice in GBP needs the rate you are
  // converting at" because a field was cleared is a dead end with no sensible
  // answer. A rate given explicitly still wins, for every currency.
  const given = Number(input.fxToGbp);
  const fxToGbp = Number.isFinite(given) && given > 0 ? given : currency === "GBP" ? 1 : 0;
  if (!Number.isFinite(fxToGbp) || fxToGbp <= 0) {
    // CURRENCY IS NOT OPTIONAL AND THIS IS WHY. Our cost table is in pounds;
    // HeyGen and every LLM provider bill in dollars. A total pasted without a
    // rate is roughly 25% wrong in a direction nobody notices, and it would be
    // applied to every customer's price.
    return { error: `An invoice in ${currency} needs the rate you are converting at. One ${currency} is how many pounds?` };
  }

  const invoiceGbp = invoiceAmount * fxToGbp;
  const costPerUnitGbp = invoiceGbp / units;

  // THE APPLIER'S LIMIT, CHECKED HERE. `setProviderCost` refuses anything over
  // MAX_COST_GBP per unit, and a preview that shows a figure the Apply button
  // cannot store is the recurring defect in this codebase: a value on one side
  // of a boundary that never reaches the other. So the division is refused where
  // it would be refused, and the message names the likely cause rather than the
  // rule — a per-unit cost that large almost always means the denominator is
  // wrong, not that the vendor charges that much.
  if (costPerUnitGbp > MAX_COST_GBP) {
    return {
      error: `That works out at £${costPerUnitGbp.toFixed(2)} per unit, which is over the £${MAX_COST_GBP} ceiling and cannot be saved. Every line here is per call, per minute or per thousand characters, so a figure that large almost always means the unit count is too small — check it is the same month as the invoice, and that nothing capped it.`,
    };
  }

  const currentCostGbp = costs[key];
  const currentPriceAcu = ACTION_COST_ACU[key as keyof typeof ACTION_COST_ACU] ?? 0;

  // What the price WOULD be, computed by the same law that will compute it for
  // real — never by multiplying by four here, which would drift the moment the
  // floor moved, and never by mutating the live table to find out.
  const newPriceAcu = priceForCost(key, costPerUnitGbp);

  const direction = newPriceAcu < currentPriceAcu ? "cheaper" : newPriceAcu > currentPriceAcu ? "dearer" : "same";
  const changePct = currentPriceAcu > 0 ? Math.round(((newPriceAcu - currentPriceAcu) / currentPriceAcu) * 1000) / 10 : 0;

  return {
    key, units, invoiceAmount, currency, fxToGbp, invoiceGbp,
    costPerUnitGbp, currentCostGbp, currentPriceAcu, newPriceAcu, direction, changePct,
    verdict:
      direction === "same"
        ? `The price does not move: ${currentPriceAcu} ACUs either way. The floor that guarantees 100% net profit is holding it there, not the markup.`
        : direction === "cheaper"
          ? `The invoice says we pay £${costPerUnitGbp.toFixed(4)} where we assumed £${currentCostGbp.toFixed(4)}. Applying it takes the customer price from ${currentPriceAcu} to ${newPriceAcu} ACUs — ${Math.abs(changePct)}% cheaper, with the margin rule untouched.`
          : `The invoice says we pay £${costPerUnitGbp.toFixed(4)} where we assumed £${currentCostGbp.toFixed(4)}. Applying it RAISES the customer price from ${currentPriceAcu} to ${newPriceAcu} ACUs, ${changePct}% dearer. A rise reaches everyone immediately, including customers part-way through a month who budgeted on the old price.`,
  };
}
