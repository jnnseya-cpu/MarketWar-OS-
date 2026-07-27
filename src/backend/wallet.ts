// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar OS — ACU Wallet & subscription store (the money ledger's other half).
//
// This is the ONE place ACUs are held, credited and debited. It closes both ends
// of the commercial loop that the calculators (subscription.ts / stripe-billing.ts)
// only *described*:
//   • MONEY IN  — a verified Stripe payment credits the org's ACU balance and
//                 activates its plan (applyWebhookOutcome, idempotent by event id).
//   • COST OUT  — every expensive action debits ACUs (debitAcus); when the balance
//                 is exhausted the action is refused, so authenticated users can
//                 never run unlimited AI/search/image on the owner's provider keys.
//
// Persistence: Firestore (org_wallets/{orgId}, processed_events/{eventId}) when the
// Admin SDK is configured; otherwise an in-memory store so zero-config demo keeps
// working. In demo mode there are no accounts, so metering PASSES THROUGH — nothing
// is ever blocked without an authenticated identity to bill.
//
// Idempotency: a redelivered Stripe webhook records event.id in processed_events
// inside the same transaction as the credit, so it can never double-credit.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { WebhookOutcome } from "@/backend/stripe-billing";
import type { AuthResult } from "@/backend/guard";
import { isStaff } from "@/shared/roles";

// New wallets start with a small free allowance so a brand-new public user can
// actually try the AI surfaces before paying (the Free plan's 100 ACUs).
export const FREE_SIGNUP_ACUS = 100;

// Flat per-action ACU estimates (charged on use). These are deliberately simple
// and predictable; the exact figure follows the 4× provider-cost rule elsewhere,
// but for hard-stop metering a fixed estimate per action type is what protects the
// owner's keys. Tune here — every route reads these constants.
export const ACTION_COST_ACU = {
  // AI / provider-cost actions
  llm: 5,        // one AI completion through the gateway
  search: 1,     // one Serper/Google query
  image: 10,     // one generated image
  video: 40,     // one rendered video
  enrich: 2,     // one email/contact enrichment
  post: 25,      // one SEO blog post (long generation + hosting)
  // Owner policy: NOTHING IS FREE. A feature that costs us little to run but
  // delivers real commercial value to the customer is still charged — the ACU is
  // the unit of value, not merely a passthrough of provider cost. These are
  // deliberately cheap so they never feel punitive, but they are never zero.
  publish_page: 15,   // publishing a hosted landing page (real URL + lead capture)
  publish_social: 5,  // a post pushed to a connected channel
  email_send: 1,      // per recipient on a campaign
  crawl: 3,           // a full site crawl / technical audit
  report: 5,          // an exported report or artifact pack
  data_export: 2,     // exporting a dataset (vault, prospects, ledger)
  connector_sync: 2,  // pulling fresh data from a connected provider
} as const;
export type ActionKind = keyof typeof ACTION_COST_ACU;

export type WalletState = {
  orgId: string;
  balanceAcu: number;
  planId: string;
  cycle: "monthly" | "annual" | null;
  lifetimeCreditedAcu: number;
  lifetimeDebitedAcu: number;
  updatedAt: string;
};

const COLLECTION = "org_wallets";
const EVENTS = "processed_events";

// In-memory fallback (per-instance; resets on restart). Fine for a single-instance
// demo/test — Firestore is the durable production path.
const mem = new Map<string, WalletState>();
const memEvents = new Set<string>();

function nowIso() { return new Date().toISOString(); }

function freshWallet(orgId: string): WalletState {
  return {
    orgId, balanceAcu: FREE_SIGNUP_ACUS, planId: "free", cycle: null,
    lifetimeCreditedAcu: FREE_SIGNUP_ACUS, lifetimeDebitedAcu: 0, updatedAt: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function getWallet(orgId: string): Promise<WalletState> {
  const id = (orgId || "").trim();
  if (!id) return freshWallet("anon");
  if (adminConfigured && adminDb) {
    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      const w = freshWallet(id);
      await ref.set(w, { merge: false });
      return w;
    }
    return snap.data() as WalletState;
  }
  let w = mem.get(id);
  if (!w) { w = freshWallet(id); mem.set(id, w); }
  return w;
}

// ---------------------------------------------------------------------------
// Credit (money in) — additive, never decreases a balance.
// ---------------------------------------------------------------------------
export async function creditAcus(orgId: string, amountAcu: number, planId?: string, cycle?: "monthly" | "annual"): Promise<WalletState> {
  const id = (orgId || "").trim() || "anon";
  const amount = Math.max(0, Math.round(amountAcu || 0));
  if (adminConfigured && adminDb) {
    const ref = adminDb.collection(COLLECTION).doc(id);
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data() as WalletState) : freshWallet(id);
      const next: WalletState = {
        ...cur,
        balanceAcu: cur.balanceAcu + amount,
        lifetimeCreditedAcu: cur.lifetimeCreditedAcu + amount,
        planId: planId ?? cur.planId,
        cycle: cycle ?? cur.cycle,
        updatedAt: nowIso(),
      };
      tx.set(ref, next, { merge: false });
      return next;
    });
  }
  const cur = await getWallet(id);
  const next: WalletState = {
    ...cur, balanceAcu: cur.balanceAcu + amount, lifetimeCreditedAcu: cur.lifetimeCreditedAcu + amount,
    planId: planId ?? cur.planId, cycle: cycle ?? cur.cycle, updatedAt: nowIso(),
  };
  mem.set(id, next);
  return next;
}

// ---------------------------------------------------------------------------
// Debit (cost out) — atomic; refuses when the balance can't cover the charge.
// ---------------------------------------------------------------------------
export type DebitResult = { ok: boolean; balanceAcu: number; charged: number; shortfall: number };

export async function debitAcus(orgId: string, amountAcu: number): Promise<DebitResult> {
  const id = (orgId || "").trim() || "anon";
  const amount = Math.max(0, Math.round(amountAcu || 0));
  if (adminConfigured && adminDb) {
    const ref = adminDb.collection(COLLECTION).doc(id);
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data() as WalletState) : freshWallet(id);
      if (cur.balanceAcu < amount) {
        if (!snap.exists) tx.set(ref, cur, { merge: false });
        return { ok: false, balanceAcu: cur.balanceAcu, charged: 0, shortfall: amount - cur.balanceAcu };
      }
      const next: WalletState = {
        ...cur, balanceAcu: cur.balanceAcu - amount, lifetimeDebitedAcu: cur.lifetimeDebitedAcu + amount, updatedAt: nowIso(),
      };
      tx.set(ref, next, { merge: false });
      return { ok: true, balanceAcu: next.balanceAcu, charged: amount, shortfall: 0 };
    });
  }
  const cur = await getWallet(id);
  if (cur.balanceAcu < amount) return { ok: false, balanceAcu: cur.balanceAcu, charged: 0, shortfall: amount - cur.balanceAcu };
  const next: WalletState = { ...cur, balanceAcu: cur.balanceAcu - amount, lifetimeDebitedAcu: cur.lifetimeDebitedAcu + amount, updatedAt: nowIso() };
  mem.set(id, next);
  return { ok: true, balanceAcu: next.balanceAcu, charged: amount, shortfall: 0 };
}

// ---------------------------------------------------------------------------
// Webhook application — the money-in bridge. Idempotent by event id: the
// processed_events record is written in the SAME transaction as the credit, so a
// redelivered Stripe event never double-credits. Returns what actually happened.
// ---------------------------------------------------------------------------
export type ApplyResult = { applied: boolean; reason: string; wallet?: WalletState; creditedAcu?: number; planId?: string };

export async function applyWebhookOutcome(orgId: string, outcome: WebhookOutcome): Promise<ApplyResult> {
  const id = (orgId || "").trim();
  const eventId = outcome.eventId;

  // Only credit-bearing / plan-activating outcomes touch the wallet.
  const credit = outcome.ledgerEntry?.direction === "credit" ? Math.max(0, Math.round(outcome.ledgerEntry.amountAcu)) : 0;
  const activatesPlan = outcome.action === "allocate_acus" || outcome.action === "renew";
  if (!id) return { applied: false, reason: "No org id on the event — cannot credit a wallet (checkout must stamp client_reference_id / metadata.orgId)." };
  if (credit <= 0 && !activatesPlan) return { applied: false, reason: `Outcome '${outcome.action}' carries no wallet credit.` };

  if (adminConfigured && adminDb) {
    const walletRef = adminDb.collection(COLLECTION).doc(id);
    const eventRef = adminDb.collection(EVENTS).doc(eventId);
    return await adminDb.runTransaction(async (tx) => {
      const evSnap = await tx.get(eventRef);
      if (evSnap.exists) return { applied: false, reason: `Event ${eventId} already processed — idempotent skip.` };
      const wSnap = await tx.get(walletRef);
      const cur = wSnap.exists ? (wSnap.data() as WalletState) : freshWallet(id);
      const next: WalletState = {
        ...cur,
        balanceAcu: cur.balanceAcu + credit,
        lifetimeCreditedAcu: cur.lifetimeCreditedAcu + credit,
        planId: outcome.planId ?? cur.planId,
        updatedAt: nowIso(),
      };
      tx.set(walletRef, next, { merge: false });
      tx.set(eventRef, { eventId, orgId: id, action: outcome.action, creditedAcu: credit, planId: outcome.planId ?? null, at: nowIso() }, { merge: false });
      return { applied: true, reason: `Credited ${credit} ACUs${outcome.planId ? ` + activated ${outcome.planId}` : ""}.`, wallet: next, creditedAcu: credit, planId: outcome.planId };
    });
  }

  // Mem fallback — idempotent by event id set.
  if (memEvents.has(eventId)) return { applied: false, reason: `Event ${eventId} already processed — idempotent skip.` };
  memEvents.add(eventId);
  const wallet = await creditAcus(id, credit, outcome.planId);
  return { applied: true, reason: `Credited ${credit} ACUs${outcome.planId ? ` + activated ${outcome.planId}` : ""}.`, wallet, creditedAcu: credit, planId: outcome.planId };
}

// ---------------------------------------------------------------------------
// Metering helper — the single gate every expensive route calls. It decides,
// from the caller's auth, whether to bill and whether to allow:
//   • Demo / unenforced (no Admin SDK)  → PASS THROUGH (no account to bill).
//   • Admin (executive/owner)           → PASS THROUGH (owner's own testing is free).
//   • Authenticated regular user        → DEBIT; refuse (402) when out of ACUs.
// Returns { allowed, status, error, balanceAcu?, charged? }.
// ---------------------------------------------------------------------------
export type MeterResult = { allowed: boolean; status: number; error?: string; balanceAcu?: number; charged?: number; metered: boolean };

export async function meterAction(auth: AuthResult, kind: ActionKind, units = 1): Promise<MeterResult> {
  if (!auth.ok) return { allowed: false, status: auth.status, error: auth.error, metered: false };
  // Demo / no accounts — nothing to bill, keep zero-config working.
  if (!auth.enforced || !auth.uid) return { allowed: true, status: 200, metered: false };
  // Staff (owner/admin/sales/support) usage is not metered — MarketWar's own team
  // and the owner's live testing + operations must never be blocked by a wallet.
  if (auth.role && isStaff(auth.role)) return { allowed: true, status: 200, metered: false };

  const cost = Math.max(0, Math.round(ACTION_COST_ACU[kind] * Math.max(1, units)));
  const res = await debitAcus(auth.uid, cost);
  if (!res.ok) {
    return {
      allowed: false, status: 402, metered: true, balanceAcu: res.balanceAcu,
      error: `Out of ACUs — this action needs ${cost} ACUs but your balance is ${res.balanceAcu}. Top up on the Billing page to continue.`,
    };
  }
  return { allowed: true, status: 200, metered: true, balanceAcu: res.balanceAcu, charged: res.charged };
}
