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
import { isStaff, type Role } from "@/shared/roles";
import { recordSpend } from "@/backend/agent-spend";

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
  // Synthetic presenter (HeyGen / D-ID / Synthesia), per MINUTE of rendered
  // video — these providers bill by duration, so a flat per-render charge would
  // overcharge a 15-second clip and lose money on a two-minute one.
  //
  // ROUTING AVATARS THROUGH `video` WAS A MISPRICING. `video` is costed against
  // a £0.10 generated clip; a presenter minute is several times that, so the
  // margin would have collapsed to roughly nothing on the owner's own pricing
  // law. This is its own line for that reason.
  //
  // The 0.45 is an ESTIMATE from the providers' published per-minute rates and
  // is deliberately on the high side — under-costing here breaches the margin
  // floor silently, while over-costing only leaves money on the table. Correct
  // it against the first real invoice; every downstream price re-derives.
  avatar: 0.45,
} as const;

// Actions that persist a large artifact carry extra storage/egress cost.
const PERSISTS: Partial<Record<keyof typeof PROVIDER_COST_GBP, boolean>> = { image: true, video: true, post: true, voice: true, dub: true, avatar: true };

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
  avatar: priced("avatar"),    // per minute of synthetic-presenter video
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
   * WHEN THE SUBSCRIPTION ENDED, and until when a failed payment is forgiven.
   *
   * Stripe's `customer.subscription.deleted` was classified as a downgrade and
   * then discarded: `applyBillingOutcome` refuses any outcome carrying no
   * credit, so the wallet was never touched and `planId` went on saying
   * "growth" for ever. Cancelling therefore cost the customer their monthly
   * allocation — £9.80 of ACUs on a £49 plan — and nothing else, so topping up
   * on demand was strictly cheaper than subscribing. `invoice.payment_failed`
   * had the same hole: a card that stopped working bought a permanent free
   * account.
   *
   * Both are absent on every wallet written before this existed, and absent
   * means "never lapsed" — an existing paying customer is not retro-lapsed by
   * a field being added.
   */
  lapsedAt?: string | null;
  /** A failed payment is forgiven until this instant, then treated as lapsed. */
  graceUntil?: string | null;
  /**
   * ACUs reversed by a refund or a chargeback that the balance could not cover
   * — because they had already been spent on work we had already paid for.
   *
   * A balance is never driven negative (a negative wallet breaks every read and
   * every sum downstream), so the shortfall is carried here and netted off the
   * next real payment. Same shape as the creator clawback on a rail that cannot
   * be recalled: never silently written off, never reported as recovered.
   */
  owedAcu?: number;
  /**
   * AN ANNUAL PLAN'S REMAINING ALLOCATION, released a month at a time.
   *
   * The published model is "annual ACUs released monthly", and nothing
   * implemented it: the webhook credited `monthlyAcus` whatever the cycle, and
   * an annual invoice arrives ONCE A YEAR. So an annual Growth customer paid
   * £411 and received 980 ACUs for the whole year instead of 8,232 — short by
   * 88%, on the plan we ask people to commit hardest to.
   *
   * Released lazily, inside the debit transaction, so there is no scheduler to
   * miss a run and the balance is always right at the moment it is spent.
   */
  annualRelease?: { perMonth: number; remainingMonths: number; nextAt: string } | null;
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


/** Roughly a month, in ms. Calendar months differ; an allocation cadence does not need to. */
const RELEASE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Hand over any monthly instalments of an annual allocation that have come due.
 *
 * Pure, so the schedule can be tested without a clock or a database, and it
 * catches up: an account nobody touched for five months releases five
 * instalments the next time it is looked at, rather than losing four.
 */
export function applyDueReleases(cur: WalletState, nowISO: string): { wallet: WalletState; released: number } {
  const sched = cur.annualRelease;
  if (!sched || sched.remainingMonths <= 0 || !sched.nextAt) return { wallet: cur, released: 0 };
  const now = Date.parse(nowISO);
  if (!Number.isFinite(now)) return { wallet: cur, released: 0 };

  let due = 0;
  let nextAt = Date.parse(sched.nextAt);
  let remaining = sched.remainingMonths;
  while (Number.isFinite(nextAt) && nextAt <= now && remaining > 0) {
    due += sched.perMonth;
    remaining -= 1;
    nextAt += RELEASE_INTERVAL_MS;
  }
  if (due <= 0) return { wallet: cur, released: 0 };

  return {
    released: due,
    wallet: {
      ...cur,
      balanceAcu: cur.balanceAcu + due,
      lifetimeCreditedAcu: cur.lifetimeCreditedAcu + due,
      annualRelease: remaining > 0 ? { perMonth: sched.perMonth, remainingMonths: remaining, nextAt: new Date(nextAt).toISOString() } : null,
      updatedAt: nowISO,
    },
  };
}

export async function debitAcus(orgId: string, amountAcu: number): Promise<DebitResult> {
  const id = (orgId || "").trim() || "anon";
  const amount = Math.max(0, Math.round(amountAcu || 0));
  if (adminConfigured && adminDb) {
    const ref = adminDb.collection(COLLECTION).doc(id);
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.exists ? (snap.data() as WalletState) : freshWallet(id);
      // Any annual instalments that have come due are handed over BEFORE the
      // balance is judged — otherwise a customer is refused for lacking ACUs
      // they have already paid for.
      const { wallet: cur, released } = applyDueReleases(stored, nowIso());
      if (released > 0) tx.set(ref, cur, { merge: false });
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
export type ApplyResult = {
  applied: boolean;
  reason: string;
  wallet?: WalletState;
  creditedAcu?: number;
  planId?: string;
  /**
   * True when the failure is the STORE's, not the event's — the payment is
   * real and the credit must be retried rather than dropped. The webhook route
   * turns this into a 500 so Stripe redelivers.
   */
  retriable?: boolean;
};

/** How long a failed payment is forgiven before service is restricted. */
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What a billing outcome does to the wallet's ENTITLEMENT, as opposed to its
 * balance. Purchased ACUs are never taken back — the customer paid for those,
 * and clawing them back on cancellation is how a chargeback starts.
 */
function entitlementPatch(action: string, nowISO: string): Partial<WalletState> {
  if (action === "downgrade") {
    // The plan drops to free and the lapse is dated. The balance is untouched.
    // Future instalments stop with the subscription that bought them. What is
    // already IN the balance stays — that was released and is theirs.
    return { planId: "free", cycle: null, lapsedAt: nowISO, graceUntil: null, annualRelease: null };
  }
  if (action === "grace_period") {
    // Service continues, unchanged, until the grace ends. Only then does the
    // account read as lapsed — which the entitlement check works out from the
    // date, so no second webhook is needed to close the window.
    return { graceUntil: new Date(Date.parse(nowISO) + GRACE_MS).toISOString() };
  }
  return {};
}

export async function applyWebhookOutcome(orgId: string, outcome: WebhookOutcome): Promise<ApplyResult> {
  const id = (orgId || "").trim();
  const eventId = outcome.eventId;

  // Only credit-bearing / plan-activating outcomes touch the wallet.
  const credit = outcome.ledgerEntry?.direction === "credit" ? Math.max(0, Math.round(outcome.ledgerEntry.amountAcu)) : 0;
  const activatesPlan = outcome.action === "allocate_acus" || outcome.action === "renew";
  // A downgrade and a grace period change what the account is ENTITLED to
  // without moving a penny. They used to fall through the guard below — which
  // only asked about credit — so the note describing the downgrade was the only
  // thing that ever happened.
  const changesEntitlement = outcome.action === "downgrade" || outcome.action === "grace_period";
  // Money going back out. Debits from a webhook are reversals, never charges.
  const reversal = outcome.ledgerEntry?.direction === "debit" ? Math.max(0, Math.round(outcome.ledgerEntry.amountAcu)) : 0;
  if (!id) return { applied: false, reason: "No org id on the event — cannot credit a wallet (checkout must stamp client_reference_id / metadata.orgId)." };
  if (credit <= 0 && reversal <= 0 && !activatesPlan && !changesEntitlement) return { applied: false, reason: `Outcome '${outcome.action}' carries no wallet credit.` };

  if (adminConfigured && adminDb) {
    const walletRef = adminDb.collection(COLLECTION).doc(id);
    const eventRef = adminDb.collection(EVENTS).doc(eventId);
    return await adminDb.runTransaction(async (tx) => {
      const evSnap = await tx.get(eventRef);
      if (evSnap.exists) return { applied: false, reason: `Event ${eventId} already processed — idempotent skip.` };
      const wSnap = await tx.get(walletRef);
      const cur = wSnap.exists ? (wSnap.data() as WalletState) : freshWallet(id);
      const now = nowIso();
      // A real payment pays down anything a refund or chargeback could not take
      // back, BEFORE it lands as spendable balance.
      const owedBefore = Math.max(0, Math.round(cur.owedAcu || 0));
      const settled = Math.min(owedBefore, credit);
      const spendable = credit - settled;
      // A reversal takes what is there and remembers the rest.
      const taken = Math.min(cur.balanceAcu + spendable, reversal);
      const unrecovered = reversal - taken;
      const next: WalletState = {
        ...cur,
        balanceAcu: cur.balanceAcu + spendable - taken,
        owedAcu: owedBefore - settled + unrecovered,
        lifetimeCreditedAcu: cur.lifetimeCreditedAcu + credit,
        planId: outcome.planId ?? cur.planId,
        // A payment clears any lapse: paying again is the whole point.
        ...(activatesPlan ? { lapsedAt: null, graceUntil: null } : {}),
        // An annual payment schedules its remaining instalments. A RENEWAL
        // replaces the schedule rather than adding to it, so a second year
        // cannot stack twenty-two months of releases onto one wallet.
        ...(outcome.scheduleRelease
          ? { annualRelease: { perMonth: outcome.scheduleRelease.perMonth, remainingMonths: outcome.scheduleRelease.months, nextAt: new Date(Date.parse(now) + RELEASE_INTERVAL_MS).toISOString() } }
          : {}),
        ...entitlementPatch(outcome.action, now),
        updatedAt: now,
      };
      tx.set(walletRef, next, { merge: false });
      tx.set(eventRef, { eventId, orgId: id, action: outcome.action, creditedAcu: credit, planId: outcome.planId ?? null, at: nowIso() }, { merge: false });
      const what = outcome.action === "reverse_credit"
        ? `Reversed ${taken} ACUs${unrecovered > 0 ? `; ${unrecovered} had already been spent and is owed, to be netted off the next payment` : ""}.`
        : outcome.action === "downgrade" ? "Subscription ended — plan set to free; purchased ACUs kept."
        : outcome.action === "grace_period" ? `Payment failed — service continues until ${next.graceUntil}.`
        : `Credited ${credit} ACUs${outcome.planId ? ` + activated ${outcome.planId}` : ""}.`;
      return { applied: true, reason: what, wallet: next, creditedAcu: credit, planId: outcome.planId };
    });
  }

  // ----------------------------------------------------------------------
  // NO DURABLE STORE. In production this is a REFUSAL, not a fallback.
  //
  // THE HOLE THIS CLOSES, and it is the worst one found in this codebase.
  // Without Firebase Admin the code below credits an in-memory Map that dies
  // with the serverless invocation, and returns `applied: true` with the words
  // "Credited N ACUs". So on a production deployment where Admin is not
  // initialising — which is the state this platform has actually been in —
  // every real payment produced: Stripe recording a 200 and a green delivery,
  // the webhook reporting a successful credit, and NOTHING IN THE CUSTOMER'S
  // ACCOUNT. The customer paid, every system said yes, and the ACUs never
  // existed. That is the platform's own recurring defect — a success reported
  // when nothing happened — sitting on the money path.
  //
  // Failing here returns a 500, so Stripe RETRIES for up to three days. The
  // credit then lands by itself the moment the store is reachable, instead of
  // being lost with an acknowledgement.
  //
  // The in-memory path stays exactly as it was for demo and development, where
  // there is no real money and the zero-config rule applies.
  if (process.env.NODE_ENV === "production") {
    return {
      applied: false,
      retriable: true,
      reason: "No durable wallet store — Firebase Admin is not configured on this deployment, so this credit cannot be persisted. Refusing to acknowledge a payment that would leave no ACUs in the account; Stripe will retry.",
    };
  }

  // Mem fallback — idempotent by event id set.
  if (memEvents.has(eventId)) return { applied: false, reason: `Event ${eventId} already processed — idempotent skip.` };
  memEvents.add(eventId);
  const before = await getWallet(id);
  const owedBefore = Math.max(0, Math.round(before.owedAcu || 0));
  const settled = Math.min(owedBefore, credit);
  const credited = await creditAcus(id, credit - settled, outcome.planId);
  const taken = Math.min(credited.balanceAcu, reversal);
  const unrecovered = reversal - taken;
  const patch = {
    ...(activatesPlan ? { lapsedAt: null, graceUntil: null } : {}),
    ...(reversal > 0 || settled > 0 ? { balanceAcu: credited.balanceAcu - taken, owedAcu: owedBefore - settled + unrecovered } : {}),
    ...(outcome.scheduleRelease
      ? { annualRelease: { perMonth: outcome.scheduleRelease.perMonth, remainingMonths: outcome.scheduleRelease.months, nextAt: new Date(Date.now() + RELEASE_INTERVAL_MS).toISOString() } }
      : {}),
    ...entitlementPatch(outcome.action, nowIso()),
  };
  const wallet: WalletState = Object.keys(patch).length ? { ...credited, ...patch, updatedAt: nowIso() } : credited;
  if (Object.keys(patch).length) mem.set(id, wallet);
  const what = outcome.action === "reverse_credit"
    ? `Reversed ${taken} ACUs${unrecovered > 0 ? `; ${unrecovered} had already been spent and is owed, to be netted off the next payment` : ""}.`
    : outcome.action === "downgrade" ? "Subscription ended — plan set to free; purchased ACUs kept."
    : outcome.action === "grace_period" ? `Payment failed — service continues until ${wallet.graceUntil}.`
    : `Credited ${credit} ACUs${outcome.planId ? ` + activated ${outcome.planId}` : ""}.`;
  return { applied: true, reason: what, wallet, creditedAcu: credit, planId: outcome.planId };
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

/**
 * The caller, reduced to the three things that decide whether they pay.
 *
 * `AuthResult` and `BrandAccess` both satisfy this shape, which is the point:
 * the rule below is asked the same question by a route holding either, and by
 * the engines those routes call.
 */
export type Spender = { enforced?: boolean; uid?: string | null; role?: Role | null };

/**
 * WHO NEVER PAYS — and this is the ONLY place that decides it.
 *
 * There used to be two answers to this question. `meterAction` knew that staff
 * are not metered; the four paths that call `debitAcus` directly — the video
 * render queue, the video gateway, the SEO autopilot and the scheduled trends
 * sweep — did not, because they receive a wallet id rather than a caller. So an
 * executive with a zero balance was waved through every AI route on the platform
 * and refused by video and by the blog autopilot: the same account, the same
 * session, two different rules, and a 402 the owner could not top up their way
 * out of without granting themselves credits they are not supposed to need.
 *
 * That is this codebase's oldest defect wearing its twentieth hat — a value
 * (the caller's role) that exists on one side of a boundary and is never carried
 * across. The fix is not to copy the staff check into four more files. It is to
 * put the rule in one function, have `meterAction` ask it, and give the direct
 * spenders a way to ask it too.
 */
export function meteringExempt(who: Spender | null | undefined): { exempt: boolean; why: string } {
  // No caller at all — a cron, a queue worker, a webhook. There is nobody whose
  // role could exempt this, so it is charged. Stated rather than assumed: work
  // SCHEDULED by staff still spends the brand's ACUs, because by the time it
  // runs the token that proved who asked for it is long gone.
  if (!who) return { exempt: false, why: "No signed-in caller — background work is charged to the brand's wallet." };
  // Demo / no accounts — nothing to bill, keep zero-config working.
  if (!who.enforced || !who.uid) return { exempt: true, why: "No accounts are enforced on this deployment, so there is no wallet to bill." };
  // Staff (owner/admin/sales/support) usage is not metered — MarketWar's own team
  // and the owner's live testing + operations must never be blocked by a wallet.
  if (who.role && isStaff(who.role)) return { exempt: true, why: `${who.role} is MarketWar staff — platform AI is not metered for the team that runs it.` };
  return { exempt: false, why: "A customer account pays for what it uses." };
}

/**
 * `agent` is what makes §100 possible, and its absence is what made it
 * impossible for as long as this function has existed.
 *
 * Every caller has always known which agent or engine was spending; `debitAcus`
 * takes a wallet id and an amount, so that knowledge died at this line and the
 * wallet ended up knowing a total and nothing else. Optional, defaulting to the
 * action kind, so all forty-two existing call sites keep working unchanged and
 * still record more than the nothing they recorded before — a caller that names
 * itself simply gets a better answer.
 */
export async function meterAction(auth: AuthResult, kind: ActionKind, units = 1, agent?: string): Promise<MeterResult> {
  if (!auth.ok) return { allowed: false, status: auth.status, error: auth.error, metered: false };
  if (meteringExempt(auth).exempt) return { allowed: true, status: 200, metered: false };
  // Belt and braces, and it is also what narrows `uid` for the debit below:
  // `meteringExempt` already returns exempt for a missing uid, so reaching here
  // without one would mean the two disagreed — which is exactly the split this
  // function was collapsed into one rule to prevent.
  if (!auth.uid) return { allowed: true, status: 200, metered: false };

  const cost = Math.max(0, Math.round(ACTION_COST_ACU[kind] * Math.max(1, units)));
  const res = await debitAcus(auth.uid, cost);
  if (!res.ok) {
    return {
      allowed: false, status: 402, metered: true, balanceAcu: res.balanceAcu,
      error: `Out of ACUs — this action needs ${cost} ACUs but your balance is ${res.balanceAcu}. Top up on the Billing page to continue.`,
    };
  }
  // Only after a debit that actually happened, and never allowed to throw — the
  // customer has been charged by this point and their work must proceed.
  await recordSpend({ walletId: auth.uid, agent: agent || kind, kind, acus: res.charged });
  return { allowed: true, status: 200, metered: true, balanceAcu: res.balanceAcu, charged: res.charged };
}

export type SpendResult =
  | { ok: true; charged: number; exempt: boolean; why: string; balanceAcu?: number }
  | { ok: false; charged: 0; exempt: false; why: string; balanceAcu: number; error: string };

/**
 * Take ACUs from a named wallet, unless the CALLER is exempt.
 *
 * `debitAcus` is the arithmetic and knows only a wallet id. This is the same
 * debit with the caller attached, and it is what an engine should use when it
 * spends on somebody's behalf: pass the `BrandAccess` (or `AuthResult`) the
 * route already resolved, and staff stop being billed for their own platform.
 *
 * Pass `null` deliberately for scheduled or queued work — it charges, and the
 * `why` says why it charged, so a reader never has to guess whether an exemption
 * was considered and rejected or simply never asked about.
 */
export async function spendAcus(who: Spender | null, walletId: string, cost: number, label?: { agent?: string; kind?: string }): Promise<SpendResult> {
  const verdict = meteringExempt(who);
  // NOT A ZERO-COST DEBIT. A debit of zero writes a ledger entry saying this
  // account paid nothing, which is a different claim from "this account was
  // never billed" — and the ledger is what the owner's economics are read from.
  if (verdict.exempt) return { ok: true, charged: 0, exempt: true, why: verdict.why };
  const res = await debitAcus(walletId, Math.max(0, Math.round(cost)));
  if (!res.ok) {
    return {
      ok: false, charged: 0, exempt: false, why: verdict.why, balanceAcu: res.balanceAcu,
      error: `Not enough ACUs — this costs ${cost} ACUs and the balance is ${res.balanceAcu}. Top up on Billing.`,
    };
  }
  // Same record as `meterAction` writes, for the engines that debit directly.
  // Without it the video queue, the gateway and the SEO autopilot — three of the
  // biggest spenders — would be the three missing from the cost report.
  await recordSpend({ walletId, agent: label?.agent || label?.kind || "engine", kind: label?.kind || "llm", acus: res.charged });
  return { ok: true, charged: res.charged, exempt: false, why: verdict.why, balanceAcu: res.balanceAcu };
}
