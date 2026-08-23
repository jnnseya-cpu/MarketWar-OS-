// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// GETTING MONEY BACK AFTER A CHARGEBACK.
//
// `voidAccrual` computes what was already released to a creator when a sale
// later reverses. Computing it is not recovering it: the creator may have
// withdrawn weeks ago, and on most rails the money is gone.
//
// ────────────────────────────────────────────────────────────────────────────
// TWO OUTCOMES, AND THE SECOND ONE IS THE HONEST PART
// ────────────────────────────────────────────────────────────────────────────
//
//   1. REVERSIBLE — Stripe Connect. The transfer can be reversed at the rail,
//      the money comes back, and it is over.
//
//   2. NOT REVERSIBLE — PayPal payouts, Wise, mobile money. Once sent, it is
//      sent. There is no API that takes it back, and pretending otherwise would
//      be the platform's worst habit: reporting a recovery that never happened.
//      So a DEBT is recorded against the creator and offset against what they
//      earn next. It is never silently written off, and it is never presented as
//      recovered.
//
// A creator is TOLD either way. Money quietly disappearing from a future payout,
// with no explanation, is how a creator programme loses the creators who actually
// sell things.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
// Delegated, never called directly: exactly one file in this codebase may
// talk to a payout provider, and a reversal is money moving too.
import { reversePayout } from "@/backend/payout-execute";

export type ClawbackOutcome = "reversed" | "debt_recorded" | "nothing_owed" | "failed";

export type ClawbackRecord = {
  id: string;
  creatorId: string;
  accrualId: string;
  pence: number;
  outcome: ClawbackOutcome;
  /** Said plainly — the creator reads this. */
  explanation: string;
  /** The rail's own reference when a reversal really happened. */
  reversalRef?: string;
  /** Still to recover from future earnings. Zero once settled. */
  outstandingPence: number;
  at: string;
};

const COLLECTION = "creator_clawbacks";
const useDb = () => Boolean(adminConfigured && adminDb);
const mem = new Map<string, ClawbackRecord>();

/** Rails whose transfers can genuinely be pulled back. */
export const REVERSIBLE_RAILS = new Set(["stripe_bank", "stripe_card"]);

const rid = (accrualId: string) => `cb_${createHash("sha256").update(accrualId).digest("hex").slice(0, 24)}`;

export type ClawbackInput = {
  creatorId: string;
  accrualId: string;
  /** What `voidAccrual` said had already been released. */
  pence: number;
  /** The rail the original payout used, and its reference. */
  railId?: string;
  payoutRef?: string;
  reason: string;
  nowISO: string;
};

/**
 * Recover a commission whose sale reversed.
 *
 * Idempotent by accrual id: a chargeback webhook that fires twice must not claw
 * back twice.
 */
export async function clawback(input: ClawbackInput): Promise<ClawbackRecord> {
  const id = rid(input.accrualId);
  const existing = await getClawback(id);
  if (existing) return existing;

  const pence = Math.max(0, Math.round(input.pence || 0));
  const base = { id, creatorId: input.creatorId, accrualId: input.accrualId, pence, at: input.nowISO };

  // Nothing had been released, so the void already handled it in full.
  if (pence === 0) {
    return persist({
      ...base, outcome: "nothing_owed", outstandingPence: 0,
      explanation: `The sale reversed (${input.reason}) before any of this commission was released, so nothing is owed and nothing has been taken from you.`,
    });
  }

  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  const reversible = input.railId ? REVERSIBLE_RAILS.has(input.railId) : false;

  if (reversible && input.payoutRef && key) {
    const res = await reversePayout({ railId: input.railId!, providerRef: input.payoutRef, pence, idempotencyKey: id });
    if (res.ok) {
      return persist({
        ...base, outcome: "reversed", reversalRef: res.ref, outstandingPence: 0,
        explanation: `£${(pence / 100).toFixed(2)} was returned because the sale it came from reversed (${input.reason}). The commission was paid on money the customer took back.`,
      });
    }
    // The rail refused — most often because the creator has already paid it out
    // of their Stripe balance. That is a debt, not a failure to record.
    return persist({
      ...base, outcome: "debt_recorded", outstandingPence: pence,
      explanation: `The sale reversed (${input.reason}), so £${(pence / 100).toFixed(2)} of commission was not earned. It could not be returned automatically (${res.error}), so it will be taken from your next earnings. Nothing has been removed from your bank.`,
    });
  }

  // PayPal, Wise, mobile money: once sent, it is sent. Say so.
  return persist({
    ...base, outcome: "debt_recorded", outstandingPence: pence,
    explanation: `The sale reversed (${input.reason}), so £${(pence / 100).toFixed(2)} of commission was not earned. Payouts on this rail cannot be recalled, so it will be offset against what you earn next rather than taken back.`,
  });
}

/**
 * What must come off the next payout, and how much of it this payout clears.
 *
 * A debt never blocks a withdrawal entirely and never turns a balance negative —
 * it takes what it can from this payout and waits for the rest. A creator who
 * cannot withdraw anything at all until an old debt clears simply stops selling.
 */
export function applyDebt(availablePence: number, outstandingPence: number): { payablePence: number; recoveredPence: number; stillOwedPence: number } {
  const avail = Math.max(0, Math.round(availablePence || 0));
  const owed = Math.max(0, Math.round(outstandingPence || 0));
  const recovered = Math.min(avail, owed);
  return { payablePence: avail - recovered, recoveredPence: recovered, stillOwedPence: owed - recovered };
}

export async function outstandingFor(creatorId: string): Promise<number> {
  const rows = await listClawbacks(creatorId);
  return rows.reduce((n, r) => n + Math.max(0, r.outstandingPence), 0);
}

/** Record recovery from a later payout, so a debt is only collected once. */
export async function settleDebt(id: string, pence: number, nowISO: string): Promise<ClawbackRecord | null> {
  const r = await getClawback(id);
  if (!r) return null;
  const taken = Math.min(r.outstandingPence, Math.max(0, Math.round(pence || 0)));
  if (taken === 0) return r;
  return persist({
    ...r,
    outstandingPence: r.outstandingPence - taken,
    explanation: `${r.explanation} £${(taken / 100).toFixed(2)} of this was recovered from a later payout on ${nowISO.slice(0, 10)}.`,
  });
}

async function persist(r: ClawbackRecord): Promise<ClawbackRecord> {
  mem.set(r.id, r);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(r.id).set(r); } catch { /* memory holds it */ }
  }
  return r;
}

export async function getClawback(id: string): Promise<ClawbackRecord | null> {
  const local = mem.get(id);
  if (local) return local;
  if (!useDb()) return null;
  try {
    const doc = await adminDb!.collection(COLLECTION).doc(id).get();
    return doc.exists ? (doc.data() as ClawbackRecord) : null;
  } catch { return null; }
}

export async function listClawbacks(creatorId: string): Promise<ClawbackRecord[]> {
  const local = [...mem.values()].filter((r) => r.creatorId === creatorId);
  if (!useDb()) return local;
  try {
    const snap = await adminDb!.collection(COLLECTION).where("creatorId", "==", creatorId).get();
    const byId = new Map<string, ClawbackRecord>();
    for (const r of local) byId.set(r.id, r);
    snap.forEach((d) => { const r = d.data() as ClawbackRecord; byId.set(r.id, r); });
    return [...byId.values()];
  } catch { return local; }
}

/** Test seam. Never called by product code. */
export function __resetClawbacks(): void { mem.clear(); }
