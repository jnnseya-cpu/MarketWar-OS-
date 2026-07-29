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

// ---------------------------------------------------------------------------
// Pricing — DERIVED, not hand-picked. Two rules, applied consistently:
//
//   1. IT COSTS US MONEY  → charge 4x our provider cost (the owner's standard
//      markup: 300% markup = 75% gross margin, floored at 2x by requiredAcus).
//      This covers AI generation AND any paid third-party API (search,
//      enrichment, rank data) — a bought API is a provider cost like any other.
//
//   2. IT COSTS US (ALMOST) NOTHING → charge a token amount only. Publishing a
//      page, exporting a file or pushing a queued post costs us compute we have
//      already paid for, so the customer pays a nominal 1-2 ACUs (1-2p). Never
//      free — the ACU stays the unit of account for every action — but never
//      priced as if it burned an API.
//
// PROVIDER_COST_GBP is our true cost per action, kept here so the markup can be
// re-derived when a provider changes price. It is NEVER exposed to a customer.
// ---------------------------------------------------------------------------
import { requiredAcus } from "@/backend/subscription";
import { minimumAcusFor } from "@/backend/unit-economics";

const PROVIDER_COST_GBP = {
  llm: 0.0125,     // one completion (blended across providers)
  search: 0.0025,  // one Serper query
  image: 0.025,    // one generated image
  video: 0.10,     // one rendered clip
  enrich: 0.005,   // one contact/email lookup
  post: 0.0625,    // a long-form article (several completions)
  // ElevenLabs. Speech is billed per character and dubbing per minute, so these
  // are per-UNIT costs and the caller passes the unit count to meterAction:
  //   voice → per 1,000 characters spoken   (Flash v2.5, ~0.5 credits/char)
  //   dub   → per minute of dubbed video    (transcribe + translate + re-voice)
  voice: 0.085,
  dub: 0.35,
} as const;

// Actions that persist a large artifact carry extra storage/egress cost.
const PERSISTS: Partial<Record<keyof typeof PROVIDER_COST_GBP, boolean>> = { image: true, video: true, post: true, voice: true, dub: true };

// The price is the HIGHER of:
//   (a) 4x the provider bill — the owner's headline markup, and
//   (b) the minimum that still yields 100% NET profit once Google Cloud/Firebase,
//       Vercel, Stripe fees, platform overhead and wastage are included.
// (b) matters because 4x provider alone can silently lose money on a cheap API
// call: a Serper query costs £0.0025, so 4x is 1 ACU (1p) — but infra, payment
// and overhead push the loaded cost to ~£0.0055, leaving only 82% net profit.
// Taking the max keeps the headline markup AND guarantees the owner's floor.
const priced = (k: keyof typeof PROVIDER_COST_GBP) => Math.max(
  requiredAcus(PROVIDER_COST_GBP[k]).requiredAcus,
  minimumAcusFor({ providerCostGbp: PROVIDER_COST_GBP[k], persistsArtifact: PERSISTS[k] }).minAcus,
);

// Nominal charges for actions with no meaningful marginal cost to us.
const NOMINAL = 1;      // 1 ACU = 1p
const NOMINAL_HEAVY = 2; // slightly more work (bandwidth, storage, fan-out)

export const ACTION_COST_ACU = {
  // --- Rule 1: real provider cost, charged at 4x -------------------------
  llm: priced("llm"),          // 5
  search: priced("search"),    // 1
  image: priced("image"),      // 10
  video: priced("video"),      // 40
  enrich: priced("enrich"),    // 2
  post: priced("post"),        // 25
  voice: priced("voice"),      // per 1,000 characters of speech
  dub: priced("dub"),          // per minute of dubbed video
  // --- Rule 2: costs us ~nothing, so a token charge only -----------------
  publish_page: NOMINAL,       // hosting a page we already serve
  publish_social: NOMINAL,     // handing a post to a connected account
  email_send: NOMINAL,         // per recipient on our own sending infra
  crawl: NOMINAL_HEAVY,        // our own bandwidth, no paid API
  report: NOMINAL,             // rendering data the customer already owns
  data_export: NOMINAL,        // their own data, back to them
  connector_sync: NOMINAL,     // a free provider API call
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
  /**
   * Has the one-off free signup allowance been handed over?
   *
   * Optional because wallets created before the human check existed do not
   * carry it. Those wallets were already credited, so absent is read as
   * "claimed" — an existing customer must never be asked to prove themselves
   * to keep ACUs they already have.
   */
  signupGrantClaimed?: boolean;
};

const COLLECTION = "org_wallets";
const EVENTS = "processed_events";

// In-memory fallback (per-instance; resets on restart). Fine for a single-instance
// demo/test — Firestore is the durable production path.
const mem = new Map<string, WalletState>();
const memEvents = new Set<string>();

function nowIso() { return new Date().toISOString(); }

/**
 * A brand-new wallet.
 *
 * In production the free allowance is NOT handed out here. Creating a wallet
 * takes one unauthenticated-looking HTTP request from a script, and granting
 * 100 ACUs on that request means a bot farm converts signups directly into the
 * owner's provider spend. The allowance is claimed instead — once, by an
 * account that has passed the human check and verified its email — through
 * claimSignupGrant below.
 *
 * With Firebase Admin absent (zero-config demo and CI) there is no account
 * system to farm and nothing real to spend, so the allowance is granted
 * immediately and the demo stays usable with no keys.
 */
function freshWallet(orgId: string): WalletState {
  const opening = adminConfigured ? 0 : FREE_SIGNUP_ACUS;
  return {
    orgId, balanceAcu: opening, planId: "free", cycle: null,
    lifetimeCreditedAcu: opening, lifetimeDebitedAcu: 0, updatedAt: nowIso(),
    signupGrantClaimed: !adminConfigured,
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

/**
 * Has this wallet already had its free allowance?
 *
 * Wallets created before the human check existed carry no flag at all. They
 * were credited when they were made, so an unflagged wallet that has ever been
 * credited counts as claimed — otherwise every existing customer would be
 * handed a second 100 ACUs the first time they signed in after this shipped.
 */
export function signupGrantClaimed(w: WalletState): boolean {
  if (typeof w.signupGrantClaimed === "boolean") return w.signupGrantClaimed;
  return w.lifetimeCreditedAcu > 0;
}

export type GrantResult = { granted: number; already: boolean; balanceAcu: number };

/**
 * Hand over the free signup allowance — exactly once per account.
 *
 * The caller is responsible for having established that a human is behind the
 * account; this function is responsible for it happening only once. The flag is
 * written in the SAME transaction as the credit, so two requests racing each
 * other cannot both see "unclaimed" and both pay out.
 */
export async function claimSignupGrant(orgId: string): Promise<GrantResult> {
  const id = (orgId || "").trim();
  if (!id) return { granted: 0, already: true, balanceAcu: 0 };
  const amount = FREE_SIGNUP_ACUS;

  if (adminConfigured && adminDb) {
    const ref = adminDb.collection(COLLECTION).doc(id);
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data() as WalletState) : freshWallet(id);
      if (signupGrantClaimed(cur)) {
        if (!snap.exists) tx.set(ref, cur, { merge: false });
        return { granted: 0, already: true, balanceAcu: cur.balanceAcu };
      }
      const next: WalletState = {
        ...cur,
        balanceAcu: cur.balanceAcu + amount,
        lifetimeCreditedAcu: cur.lifetimeCreditedAcu + amount,
        signupGrantClaimed: true,
        updatedAt: nowIso(),
      };
      tx.set(ref, next, { merge: false });
      return { granted: amount, already: false, balanceAcu: next.balanceAcu };
    });
  }

  const cur = await getWallet(id);
  if (signupGrantClaimed(cur)) return { granted: 0, already: true, balanceAcu: cur.balanceAcu };
  const next: WalletState = {
    ...cur, balanceAcu: cur.balanceAcu + amount,
    lifetimeCreditedAcu: cur.lifetimeCreditedAcu + amount,
    signupGrantClaimed: true, updatedAt: nowIso(),
  };
  mem.set(id, next);
  return { granted: amount, already: false, balanceAcu: next.balanceAcu };
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
