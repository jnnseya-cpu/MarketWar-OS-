// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHAT IS OWED, TO WHOM, AND WHETHER IT IS PAYABLE YET.
//
// The missing middle of the chain. Everything either side of it already existed:
// `netEligibleValue` and `saleCommissionPence` say how much, `settlementState`
// says when, `splitOrder` says who gets which penny, and `executePayout` moves
// it. Nothing recorded the accrual, so none of them was ever reached by a real
// sale.
//
// APPEND-ONLY. An accrual is never edited and never deleted. A refund does not
// erase the original row — it writes a VOID row against it, so the history still
// shows that a sale happened and then reversed. A ledger you can edit is not a
// ledger, and the first time somebody asks "why was this creator paid £40 in
// March" the answer has to survive.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { netEligibleValue, saleCommissionPence } from "@/backend/share2earn";
import { settlementState, type FundingPolicy } from "@/backend/profit-guard-economics";
import { renewalCommissionable, type RenewalPolicy, DEFAULT_RENEWAL_POLICY } from "@/shared/referral-attribution";

export type AccrualState = "unfunded" | "pending" | "part_settled" | "settled" | "void";

export type Accrual = {
  id: string;
  brandId: string;
  code: string;
  orderId: string;
  /** What the commission was computed ON, after tax/delivery/refunds came out. */
  eligiblePence: number;
  /** The full commission this sale earned, before the settlement window. */
  earnedPence: number;
  /** Released so far. Never more than `earnedPence`. */
  releasedPence: number;
  state: AccrualState;
  /** Why it is in this state, in words a creator can read. */
  why: string;
  paymentNumber: number;
  recurring: boolean;
  paidAtISO: string;
  createdAt: string;
  /** Set when a later event reversed it. The original row is never removed. */
  voidedAt?: string;
  voidReason?: string;
};

const COLLECTION = "commission_accruals";
const useDb = () => Boolean(adminConfigured && adminDb);
const mem = new Map<string, Accrual>();

export const accrualId = (brandId: string, orderId: string, paymentNumber: number) =>
  `a_${createHash("sha256").update(`${brandId}|${orderId}|${paymentNumber}`).digest("hex").slice(0, 24)}`;

export type AccrueInput = {
  brandId: string;
  code: string;
  orderId: string;
  checkoutTotalPence: number;
  lines: Parameters<typeof netEligibleValue>[0];
  paymentNumber: number;
  recurring: boolean;
  paidAtISO: string;
  nowISO: string;
  policy: FundingPolicy;
  renewalPolicy?: RenewalPolicy;
};

export type AccrueResult =
  | { ok: true; accrual: Accrual; created: boolean }
  | { ok: false; error: string; reason: string };

/**
 * Record what one paid order owes.
 *
 * Returns `created: false` for an order already accrued — the caller may safely
 * retry, and the FIRST result is returned rather than a second row.
 */
export async function accrue(input: AccrueInput): Promise<AccrueResult> {
  const id = accrualId(input.brandId, input.orderId, input.paymentNumber);
  const existing = await getAccrual(id);
  if (existing) return { ok: true, accrual: existing, created: false };

  // A renewal only earns if the programme says so, and the answer is part of
  // the offer the creator accepted rather than a decision made here.
  const renewal = renewalCommissionable(input.paymentNumber, input.renewalPolicy ?? DEFAULT_RENEWAL_POLICY);
  if (!renewal.commissionable) {
    return { ok: false, error: "This payment is not commissionable.", reason: renewal.reason };
  }

  const eligible = netEligibleValue(input.lines);
  const earned = saleCommissionPence(eligible.eligiblePence);

  const st = settlementState({
    policy: input.policy,
    paidAt: input.paidAtISO,
    refunded: Boolean(input.lines.cancelled) || (input.lines.refundedPence ?? 0) >= (input.lines.productPence ?? 0),
    chargedBack: false,
    nowISO: input.nowISO,
  });

  const accrual: Accrual = {
    id,
    brandId: input.brandId,
    code: input.code.toUpperCase(),
    orderId: input.orderId,
    eligiblePence: eligible.eligiblePence,
    earnedPence: earned,
    releasedPence: Math.round((earned * st.payablePct) / 100),
    state: st.state,
    why: earned === 0 ? eligible.note : st.why,
    paymentNumber: input.paymentNumber,
    recurring: input.recurring,
    paidAtISO: input.paidAtISO,
    createdAt: input.nowISO,
  };

  await persist(accrual);
  return { ok: true, accrual, created: true };
}

/**
 * Re-evaluate an accrual as the refund window passes.
 *
 * Called by the scheduler. Never moves money backwards: a released amount stays
 * released, because it may already have been paid out and un-paying somebody is
 * not something a status recomputation gets to do.
 */
export async function ripen(id: string, policy: FundingPolicy, nowISO: string): Promise<Accrual | null> {
  const a = await getAccrual(id);
  if (!a || a.state === "void") return a;
  const st = settlementState({ policy, paidAt: a.paidAtISO, refunded: false, chargedBack: false, nowISO });
  const nextReleased = Math.max(a.releasedPence, Math.round((a.earnedPence * st.payablePct) / 100));
  if (nextReleased === a.releasedPence && st.state === a.state) return a;
  const updated: Accrual = { ...a, state: st.state, releasedPence: nextReleased, why: st.why };
  await persist(updated);
  return updated;
}

/**
 * Reverse an accrual after a refund or chargeback.
 *
 * Writes the void ONTO the row rather than deleting it, and reports what was
 * already released — because money already paid out cannot be recalled by a
 * status change, and the caller needs to know it must be clawed back through
 * the payout rail instead of quietly forgotten.
 */
export async function voidAccrual(id: string, reason: string, nowISO: string): Promise<{ accrual: Accrual | null; clawbackPence: number }> {
  const a = await getAccrual(id);
  if (!a) return { accrual: null, clawbackPence: 0 };
  if (a.state === "void") return { accrual: a, clawbackPence: 0 };
  const updated: Accrual = {
    ...a, state: "void", why: reason, voidedAt: nowISO, voidReason: reason,
    // What was NOT yet released simply never becomes payable.
    releasedPence: a.releasedPence,
  };
  await persist(updated);
  return { accrual: updated, clawbackPence: a.releasedPence };
}

async function persist(a: Accrual): Promise<void> {
  mem.set(a.id, a);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(a.id).set(a); } catch { /* memory holds it */ }
  }
}

export async function getAccrual(id: string): Promise<Accrual | null> {
  const local = mem.get(id);
  if (local) return local;
  if (!useDb()) return null;
  try {
    const doc = await adminDb!.collection(COLLECTION).doc(id).get();
    return doc.exists ? (doc.data() as Accrual) : null;
  } catch { return null; }
}

export async function listForCode(code: string): Promise<Accrual[]> {
  const key = code.toUpperCase();
  const local = [...mem.values()].filter((a) => a.code === key);
  if (!useDb()) return local;
  try {
    const snap = await adminDb!.collection(COLLECTION).where("code", "==", key).get();
    const byId = new Map<string, Accrual>();
    for (const r of local) byId.set(r.id, r);
    snap.forEach((d) => { const r = d.data() as Accrual; byId.set(r.id, r); });
    return [...byId.values()];
  } catch { return local; }
}

/** What a creator may actually withdraw, and what is still held. */
export async function balanceFor(code: string): Promise<{ releasedPence: number; heldPence: number; voidedPence: number; orders: number }> {
  const rows = await listForCode(code);
  let released = 0, held = 0, voided = 0;
  for (const a of rows) {
    if (a.state === "void") { voided += a.earnedPence; continue; }
    released += a.releasedPence;
    held += Math.max(0, a.earnedPence - a.releasedPence);
  }
  return { releasedPence: released, heldPence: held, voidedPence: voided, orders: rows.filter((a) => a.state !== "void").length };
}

/** Test seam. Never called by product code. */
export function __resetAccruals(): void { mem.clear(); }
