// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// A PRICE CUT REACHES YOU TODAY. A PRICE RISE WAITS FOR YOUR NEXT BILL.
//
// WHY THIS EXISTS. §172 made provider costs correctable from a text field and
// §173 made them the result of dividing an invoice by a unit count. Both are
// improvements and both created the same hazard, which the reconciliation
// screen has been printing in capitals since the day it shipped:
//
//   "A rise reaches everyone immediately, including customers part-way through
//    a month who budgeted on the old price."
//
// Saying it is not the same as preventing it. A customer on a £49 plan who
// planned their month around 980 ACUs at 5 ACUs a call does not care that our
// supplier put its prices up on the 14th; from where they are sitting, the
// product they bought got 40% smaller without warning. Every serious platform
// resolves this the same way, and it is the only resolution that is fair in
// both directions:
//
//   • A CUT applies the moment it is applied. Immediately, to everyone.
//   • A RISE applies at the customer's next billing cycle. The allowance they
//     have already paid for keeps the purchasing power it was sold with.
//
// ───────────────────────────────────────────────────────────────────────────
// THE ONE PLACE THIS BENDS, AND WHY IT HAS TO
// ───────────────────────────────────────────────────────────────────────────
//
// The owner's pricing law is not negotiable by a convenience: profit margin on
// an AI action is NEVER below 100% — price at least twice what the provider
// charges. Honouring an old price after a large rise would breach exactly that.
// If a supplier triples its rate, the old price is no longer a thinner margin,
// it is a LOSS on every call, for up to a month, across every customer at once.
//
// So the deferral is bounded by the hard floor rather than by optimism: a rise
// is deferred only while the OLD price still clears `MARKUP_FLOOR` against the
// NEW cost. A correction too large for that applies immediately, and the
// reason is reported rather than buried — the customer is told the supplier
// moved by more than the platform can absorb.
//
// This conflict is recorded in REQUIREMENTS-COVERAGE.md §Gaps rather than
// resolved silently, because two owner directives genuinely meet here.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT "YOUR NEXT BILLING CYCLE" MEANS TO A WALLET
// ───────────────────────────────────────────────────────────────────────────
//
// `subscriptionCreditedAt` — written in the same transaction as a subscription
// credit, so it exists only when a plan payment genuinely landed. If it is
// EARLIER than the rise, the customer paid before the rise and is protected
// until their next payment. If it is later, they bought at the new price.
//
// Three cases are decided deliberately rather than by accident:
//
//   • NO SUBSCRIPTION AT ALL (free, or top-ups only). Nothing was budgeted on
//     a monthly allowance, so there is nothing to grandfather and the rise
//     applies now. A top-up buys ACUs, not a fixed basket of actions.
//   • A WALLET WRITTEN BEFORE THIS FIELD EXISTED. Absent is read as "paid
//     before the rise", which is the customer-favouring reading — an existing
//     paying customer must never lose protection because a field was added.
//     The exposure is bounded by the cap below and by the margin floor.
//   • A LAPSED CUSTOMER WHO NEVER RENEWS would otherwise hold the old price
//     for ever, since no next payment ever arrives. The deferral therefore
//     expires on its own: 40 days for a monthly cycle, 400 for an annual one
//     (an annual plan releases its ACUs monthly but was paid for up front, so
//     the whole year was bought at the old price).

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { MARKUP_FLOOR, ACU_PER_GBP } from "@/backend/subscription";

const COLLECTION = "platform_config";
const DOC = "price_rises";
const TTL_MS = 60_000;

/** How long a deferral can outlive the payment that earned it. */
const MAX_DEFER_DAYS = { monthly: 40, annual: 400 } as const;

export type PriceRise = {
  kind: string;
  /** What the action cost before the correction — the price being honoured. */
  fromAcu: number;
  /** What it costs after it, which is what new cycles pay. */
  toAcu: number;
  /** When the correction was applied. */
  at: string;
  by: string;
};

/**
 * Enough of a wallet to answer "had this customer paid before the rise?".
 *
 * Structural rather than an import of `WalletState`, because `wallet.ts` is
 * what calls this and a type import either way round would be a cycle.
 */
export type CycleAnchor = {
  cycle?: "monthly" | "annual" | null;
  subscriptionCreditedAt?: string | null;
  planId?: string;
};

export type LockedPrice = {
  acu: number;
  /** True when the customer is paying less than the current list price. */
  deferred: boolean;
  /** Present only when a deferral was possible but refused, with the reason. */
  refusedDeferral?: "floor" | "no_subscription" | "expired" | "paid_after";
  why: string;
};

// ---------------------------------------------------------------------------
// The rule. Pure, so the dangerous input can be driven directly.
// ---------------------------------------------------------------------------

/**
 * What THIS wallet pays for one unit of this action, right now.
 *
 * Pure on purpose, and for the reason this codebase keeps relearning: a
 * boundary reachable only through Firestore is a boundary nobody tests. Every
 * branch below decides what a real customer is charged, so every branch is
 * reachable from a test with no database, no clock and no admin session.
 */
export function lockedPriceAcu(input: {
  currentAcu: number;
  /** The provider cost the CURRENT price is derived from. */
  providerCostGbp: number;
  rise: PriceRise | null;
  wallet: CycleAnchor | null;
  nowISO: string;
}): LockedPrice {
  const current = Math.max(0, Math.round(input.currentAcu));
  const rise = input.rise;

  // No recorded rise: the list price IS the price. A cut leaves no record
  // precisely so that this is the answer the moment one is applied.
  if (!rise || !(rise.toAcu > rise.fromAcu)) {
    return { acu: current, deferred: false, why: "The current price, with no deferred rise against it." };
  }

  // A rise that has since been superseded by a cut, or by a correction that
  // landed somewhere else entirely, is not the rise we are honouring. Trust the
  // live table over a stored record of how we got here.
  if (current !== rise.toAcu) {
    return { acu: current, deferred: false, why: "The price has moved again since that rise, so the recorded one no longer applies." };
  }

  const old = Math.max(0, Math.round(rise.fromAcu));

  // THE OWNER'S FLOOR, CHECKED BEFORE ANYTHING ELSE. Honouring the old price
  // has to leave at least a 2x margin on what we now pay, or the deferral is a
  // loss on every call rather than a thinner profit on each.
  const cost = Number.isFinite(input.providerCostGbp) && input.providerCostGbp > 0 ? input.providerCostGbp : 0;
  if (cost > 0 && old / ACU_PER_GBP < cost * MARKUP_FLOOR - 1e-12) {
    return {
      acu: current, deferred: false, refusedDeferral: "floor",
      why: `This supplier's rate moved by more than the platform can absorb: holding the old ${old} ACUs against a cost of £${cost.toFixed(5)} would be below the ${MARKUP_FLOOR}× floor the pricing law requires, so the new price of ${current} ACUs applies now.`,
    };
  }

  const w = input.wallet;
  const onAPlan = Boolean(w && w.cycle && w.planId && w.planId !== "free");
  if (!onAPlan) {
    return {
      acu: current, deferred: false, refusedDeferral: "no_subscription",
      why: "A deferral protects an allowance already paid for. This wallet has no subscription cycle, so the current price applies.",
    };
  }

  const riseAt = Date.parse(rise.at);
  const now = Date.parse(input.nowISO);
  if (!Number.isFinite(riseAt) || !Number.isFinite(now)) {
    return { acu: current, deferred: false, why: "The current price — a deferral needs a readable date on both sides." };
  }

  // Paid AFTER the rise: they bought at the new price and know it.
  const paidAt = w?.subscriptionCreditedAt ? Date.parse(w.subscriptionCreditedAt) : NaN;
  if (Number.isFinite(paidAt) && paidAt >= riseAt) {
    return {
      acu: current, deferred: false, refusedDeferral: "paid_after",
      why: "This cycle was paid for after the correction, so it is already on the new price.",
    };
  }

  // A deferral that nobody ever closed by renewing. Bounded rather than eternal.
  const days = MAX_DEFER_DAYS[w?.cycle === "annual" ? "annual" : "monthly"];
  if (now - riseAt > days * 86_400_000) {
    return {
      acu: current, deferred: false, refusedDeferral: "expired",
      why: `The deferral on this rise ran out ${days} days after it was applied, which is longer than the cycle it was protecting.`,
    };
  }

  return {
    acu: old, deferred: true,
    why: `Held at ${old} ACUs rather than ${current} until your next renewal: the allowance in this cycle was bought before the correction on ${rise.at.slice(0, 10)}.`,
  };
}

// ---------------------------------------------------------------------------
// The store. One document beside the corrected costs — no new collection.
// ---------------------------------------------------------------------------

let cached: Record<string, PriceRise> = {};
let lastRead = 0;

function fromStored(key: string, raw: unknown): PriceRise | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<PriceRise>;
  if (typeof r.fromAcu !== "number" || typeof r.toAcu !== "number") return null;
  if (!Number.isFinite(r.fromAcu) || !Number.isFinite(r.toAcu) || r.toAcu <= r.fromAcu) return null;
  if (typeof r.at !== "string" || !r.at) return null;
  return { kind: key, fromAcu: r.fromAcu, toAcu: r.toAcu, at: r.at, by: typeof r.by === "string" ? r.by : "" };
}

/**
 * Load the deferred rises, TTL-cached to one read a minute.
 *
 * Never throws, for the same reason `ensureProviderCosts` never throws: this
 * runs inside the door where money is taken, and a store hiccup must not fail a
 * paid action. A failed read leaves the previous map standing, which charges
 * the list price — the state the platform was in before this file existed.
 */
export async function ensurePriceRises(): Promise<void> {
  if (!adminConfigured || !adminDb) return;
  if (Date.now() - lastRead < TTL_MS) return;
  lastRead = Date.now();
  try {
    const snap = await adminDb.collection(COLLECTION).doc(DOC).get();
    const data = snap.exists ? snap.data() : null;
    const out: Record<string, PriceRise> = {};
    if (data && typeof data === "object") {
      for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
        const r = fromStored(key, raw);
        if (r) out[key] = r;
      }
    }
    cached = out;
  } catch { /* the previous map stands */ }
}

/** The rise recorded against one action, if there is one. */
export function riseFor(kind: string): PriceRise | null {
  return cached[kind] || null;
}

/** Every deferred rise, for the admin screen. */
export function risesInEffect(): PriceRise[] {
  return Object.values(cached).slice().sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Record that a price went UP, so the wallets that already paid keep the old
 * one — or, when it went down, drop any deferral, because a cut is immediate
 * and a stale record would hold customers above the price everybody else pays.
 *
 * Called from `setProviderCost`, which already knows both prices.
 */
export async function notePriceChange(kind: string, wasAcu: number, nowAcu: number, by: string): Promise<"deferred" | "immediate" | "cleared"> {
  if (!adminConfigured || !adminDb) {
    // NO DURABLE STORE. The record is kept in memory for the life of the
    // instance, for the reason `wallet.ts` keeps a memory fallback: the path a
    // customer takes has to be the path that was tested, and a branch
    // reachable only with Firebase configured is a branch nobody exercises.
    // Nothing is charged in this mode anyway — `meteringExempt` passes every
    // caller through when there is no account to bill.
    if (nowAcu > wasAcu) {
      cached = { ...cached, [kind]: { kind, fromAcu: wasAcu, toAcu: nowAcu, at: new Date().toISOString(), by: by || "admin" } };
      return "deferred";
    }
    const had = Boolean(cached[kind]);
    const { [kind]: _dropped, ...rest } = cached;
    cached = rest;
    return had ? "cleared" : "immediate";
  }
  const ref = adminDb.collection(COLLECTION).doc(DOC);
  try {
    if (nowAcu > wasAcu) {
      const rise: PriceRise = { kind, fromAcu: wasAcu, toAcu: nowAcu, at: new Date().toISOString(), by: by || "admin" };
      await ref.set({ [kind]: rise }, { merge: true });
      lastRead = 0;
      await ensurePriceRises();
      return "deferred";
    }
    // A CUT SUPERSEDES A DEFERRAL. If this line had a deferred rise against it
    // and the price has now come back down, every wallet should be on the new
    // lower price at once — including the ones that were being held at the old
    // one, which is now the HIGHER of the two.
    const existing = riseFor(kind);
    const { FieldValue } = await import("firebase-admin/firestore");
    await ref.set({ [kind]: FieldValue.delete() }, { merge: true });
    lastRead = 0;
    await ensurePriceRises();
    return existing ? "cleared" : "immediate";
  } catch {
    return "immediate";
  }
}
