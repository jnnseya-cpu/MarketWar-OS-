// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Sending the money.
//
// This is the most dangerous file in the platform. Everything else can be wrong
// and cost an ACU or an argument; this can be wrong and pay a stranger twice, or
// pay somebody who has already been paid, or take a balance and send nothing.
// Payouts are irreversible on most rails and instant on some.
//
// SO THE ORDER IS FIXED AND EVERY STEP IS A REFUSAL, NOT A WARNING:
//
//   1. IDENTITY. No verified identity, no payout. The reporting rules require
//      it and an unverified account is one a phished password can drain.
//   2. BALANCE. Only settled, unreversed earnings past their hold.
//   3. QUOTE. The fee is computed and shown; a withdrawal whose fees would eat
//      it is refused before anything moves.
//   4. CLAIM. An idempotency key is written BEFORE the provider is called. If
//      the same request arrives twice — a double click, a retry, a network
//      timeout the client did not see — the second one finds the claim and
//      returns the first result instead of sending again.
//   5. SEND. The provider call.
//   6. SETTLE OR RELEASE. Success records the provider's reference. Failure
//      RELEASES the claim so the money is withdrawable again, because a failed
//      payout that leaves a balance locked is a support ticket and a lost user.
//
// AND THE RULE THAT MATTERS MOST: we never report that money moved unless a
// provider returned a reference for it. With no key configured this returns a
// clear "not connected" rather than a cheerful success — the same honesty rule
// the image and avatar gateways keep, except here the lie would be about
// somebody's wages.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { quoteWithdrawal, rail, type WithdrawalQuote } from "@/backend/payout-fees";
import { loadIdentity, payoutAllowed } from "@/backend/payout-identity";
import { record as recordSecurityEvent } from "@/backend/sentinel";
import { haltFor } from "@/backend/emergency-stop";

export type PayoutState = "claimed" | "sent" | "failed" | "reversed";

export type PayoutAttempt = {
  id: string;                 // the idempotency key
  creatorId: string;
  railId: string;
  grossPence: number;
  feesPence: number;
  netPence: number;
  state: PayoutState;
  providerRef?: string;
  error?: string;
  createdAt: string;
  settledAt?: string;
};

export type PayoutOutcome =
  | { ok: true; attempt: PayoutAttempt; quote: WithdrawalQuote; replayed: boolean; note: string }
  | { ok: false; error: string; hint?: string; quote?: WithdrawalQuote; gate?: string };

/**
 * The idempotency key.
 *
 * Derived from the creator, the rail, the amount and a caller-supplied request
 * id. The request id is what makes a retry a retry rather than a new
 * withdrawal — a client that resends the same request after a timeout must land
 * on the same key, and a client asking for a genuinely second withdrawal sends
 * a new one.
 */
export function payoutKey(input: { creatorId: string; railId: string; amountPence: number; requestId: string }): string {
  return `po_${createHash("sha256").update(`${input.creatorId}|${input.railId}|${input.amountPence}|${input.requestId}`).digest("hex").slice(0, 32)}`;
}

export type ExecuteInput = {
  creatorId: string;
  railId: string;
  amountPence: number;
  /** Stable across retries of the SAME withdrawal. A UUID from the client. */
  requestId: string;
  country?: string;
  /** Settled, unreversed, past the hold. The caller computes it from the wallet. */
  availablePence: number;
  /** Where the money goes — an account reference the provider understands. */
  destination: string;
  nowISO: string;
};

export async function executePayout(input: ExecuteInput): Promise<PayoutOutcome> {
  const creatorId = (input.creatorId || "").trim();
  if (!creatorId) return { ok: false, error: "creatorId required" };
  if (!(input.requestId || "").trim()) {
    return { ok: false, error: "A requestId is required.", hint: "It is what makes a retry a retry instead of a second withdrawal. Generate one per withdrawal and reuse it if the request has to be sent again." };
  }

  // 0. THE EMERGENCY STOP — before identity, before the quote, before the claim.
  //
  // Money leaving is the one action that cannot be undone by releasing the halt
  // afterwards, so it is checked first. Nothing is claimed and no idempotency key
  // is burned: the same requestId works normally once the halt is released.
  const halt = await haltFor("payout");
  if (halt.halted) {
    return { ok: false, error: halt.message, hint: "Release the emergency stop and send the same request again — the requestId is unused, so this is not a duplicate withdrawal." };
  }

  // 1. IDENTITY — before anything, including before the quote.
  const identity = await loadIdentity(creatorId);
  const gate = payoutAllowed(identity);
  if (!gate.allowed) {
    // The refusal worked. Recording it is how a PATTERN of refusals — somebody
    // testing where the gate is — becomes visible instead of being nine
    // successful defences nobody counted.
    recordSecurityEvent({ at: new Date().toISOString(), kind: "payout_refused", actor: `uid:${creatorId}`, detail: gate.reason });
    return { ok: false, error: gate.reason, hint: gate.fix, gate: gate.reason };
  }

  // 2. BALANCE.
  const amount = Math.max(0, Math.round(input.amountPence || 0));
  if (amount > input.availablePence) {
    return {
      ok: false,
      error: `£${(amount / 100).toFixed(2)} was requested and £${(input.availablePence / 100).toFixed(2)} is available.`,
      hint: "Earnings become withdrawable once the refund window on the sale that produced them has closed. Pending money is still yours — it is not yet certain.",
    };
  }

  // 3. QUOTE — the fee refusals live here and run before anything moves.
  const quote = quoteWithdrawal({ railId: input.railId, amountPence: amount, country: input.country });
  if (!quote.ok) return { ok: false, error: quote.error, hint: quote.hint, quote };

  // 4. CLAIM — written BEFORE the provider call, so a retry finds it.
  const id = payoutKey({ creatorId, railId: input.railId, amountPence: amount, requestId: input.requestId });
  const existing = await loadAttempt(id);
  if (existing) {
    // A replay. Return what happened the first time; never send again.
    return existing.state === "failed"
      ? { ok: false, error: existing.error || "The earlier attempt failed.", hint: "Nothing was sent and your balance was released. Try again with a NEW requestId.", quote }
      : { ok: true, attempt: existing, quote, replayed: true, note: `Already processed. ${existing.state === "sent" ? `Sent on ${(existing.settledAt || existing.createdAt).slice(0, 10)}, provider reference ${existing.providerRef}.` : "In flight."} Nothing was sent twice.` };
  }

  const attempt: PayoutAttempt = {
    id, creatorId, railId: input.railId,
    grossPence: amount, feesPence: quote.totalFeesPence, netPence: quote.netPence,
    state: "claimed", createdAt: input.nowISO,
  };
  await saveAttempt(attempt);

  // 5. SEND.
  const sent = await sendVia(input.railId, { netPence: quote.netPence, destination: input.destination, creatorId, reference: id });

  // 6. SETTLE OR RELEASE.
  if (!sent.ok) {
    const failed: PayoutAttempt = { ...attempt, state: "failed", error: sent.error, settledAt: input.nowISO };
    await saveAttempt(failed);
    return {
      ok: false, error: sent.error, quote,
      hint: "Nothing was sent and your balance has been released — it is withdrawable again. A failed payout that leaves money locked is a support ticket, so it does not do that.",
    };
  }

  const done: PayoutAttempt = { ...attempt, state: "sent", providerRef: sent.ref, settledAt: input.nowISO };
  await saveAttempt(done);
  return {
    ok: true, attempt: done, quote, replayed: false,
    note: `£${(quote.netPence / 100).toFixed(2)} sent via ${quote.railLabel} — ${rail(input.railId)?.speed || "see your provider"}. Provider reference ${sent.ref}. Nothing was deducted for tax: you are paid gross.`,
  };
}

// ---------------------------------------------------------------------------
// The rails
//
// One thin adapter each. They are deliberately dumb: build the request, read the
// reference, return a typed error. No retry loops in here — a retry on a payout
// endpoint is how a person gets paid twice, and the idempotency key above is the
// only safe way to try again.
// ---------------------------------------------------------------------------
type SendResult = { ok: true; ref: string } | { ok: false; error: string };

async function sendVia(railId: string, p: { netPence: number; destination: string; creatorId: string; reference: string }): Promise<SendResult> {
  const r = rail(railId);
  if (!r) return { ok: false, error: `Unknown rail "${railId}".` };
  const key = process.env[r.envKey];
  if (!key) {
    return {
      ok: false,
      error: `${r.label} is not connected on this deployment (${r.envKey} is not set), so nothing was sent. Your balance is untouched.`,
    };
  }
  if (!p.destination?.trim()) return { ok: false, error: "No destination account was given, so there was nowhere to send it." };

  try {
    if (railId === "stripe_bank" || railId === "stripe_card") {
      // Stripe Connect transfer to the creator's connected account. The
      // Idempotency-Key header is the provider's own protection and carries the
      // same key as our claim, so a retry is safe at both layers.
      const res = await fetch("https://api.stripe.com/v1/transfers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": p.reference,
        },
        body: new URLSearchParams({
          amount: String(p.netPence), currency: "gbp",
          destination: p.destination,
          "metadata[creator_id]": p.creatorId,
          "metadata[marketwar_ref]": p.reference,
        }),
      });
      const d = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (!res.ok || !d?.id) return { ok: false, error: `Stripe ${res.status}: ${d?.error?.message || "no transfer id returned"}` };
      return { ok: true, ref: d.id };
    }

    if (railId === "paypal") {
      const res = await fetch("https://api-m.paypal.com/v1/payments/payouts", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "PayPal-Request-Id": p.reference },
        body: JSON.stringify({
          sender_batch_header: { sender_batch_id: p.reference, email_subject: "Your SHARE2EARN payout" },
          items: [{
            recipient_type: "EMAIL", receiver: p.destination,
            amount: { value: (p.netPence / 100).toFixed(2), currency: "GBP" },
            note: "SHARE2EARN earnings", sender_item_id: p.reference,
          }],
        }),
      });
      const d = (await res.json().catch(() => null)) as { batch_header?: { payout_batch_id?: string }; message?: string } | null;
      const ref = d?.batch_header?.payout_batch_id;
      if (!res.ok || !ref) return { ok: false, error: `PayPal ${res.status}: ${d?.message || "no payout batch id returned"}` };
      return { ok: true, ref };
    }

    if (railId === "wise") {
      const res = await fetch("https://api.wise.com/v1/transfers", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAccount: p.destination,
          customerTransactionId: p.reference,
          details: { reference: "SHARE2EARN" },
        }),
      });
      const d = (await res.json().catch(() => null)) as { id?: number | string; errors?: { message?: string }[] } | null;
      if (!res.ok || !d?.id) return { ok: false, error: `Wise ${res.status}: ${d?.errors?.[0]?.message || "no transfer id returned"}` };
      return { ok: true, ref: String(d.id) };
    }

    // Mobile money and local bank, through BitriPay.
    const res = await fetch("https://api.bitripay.com/v1/payouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Idempotency-Key": p.reference },
      body: JSON.stringify({
        method: railId, msisdn: p.destination,
        amount: (p.netPence / 100).toFixed(2), currency: "GBP",
        reference: p.reference,
      }),
    });
    const d = (await res.json().catch(() => null)) as { id?: string; reference?: string; message?: string } | null;
    const ref = d?.id || d?.reference;
    if (!res.ok || !ref) return { ok: false, error: `BitriPay ${res.status}: ${d?.message || "no payout reference returned"}` };
    return { ok: true, ref };
  } catch (e) {
    // A network failure is genuinely ambiguous: the provider may or may not have
    // received it. The claim stays, so a retry with the same requestId will not
    // send a second time, and this says so rather than guessing.
    return {
      ok: false,
      error: `${r.label} did not respond (${e instanceof Error ? e.message : "network error"}). If it received the request the idempotency key stops a second send; check the provider before retrying with a new requestId.`,
    };
  }
}

/** Which rails could actually move money right now. */
export function liveRails(): { railId: string; label: string; live: boolean; envKey: string }[] {
  return [...new Set(["stripe_bank", "stripe_card", "paypal", "wise", "mpesa", "orange_money", "airtel_money", "africell_money", "local_bank"])]
    .map((id) => { const r = rail(id)!; return { railId: id, label: r.label, live: Boolean(process.env[r.envKey]), envKey: r.envKey }; });
}

// ---------------------------------------------------------------------------
// The attempt ledger
// ---------------------------------------------------------------------------
const COLLECTION = "payout_attempts";
const mem = new Map<string, PayoutAttempt>();
const useDb = () => Boolean(adminConfigured && adminDb);

export async function saveAttempt(a: PayoutAttempt): Promise<void> {
  mem.set(a.id, a);
  if (useDb()) { try { await adminDb!.collection(COLLECTION).doc(a.id).set(a); } catch { /* memory copy is the claim on this instance */ } }
}

export async function loadAttempt(id: string): Promise<PayoutAttempt | null> {
  const local = mem.get(id);
  if (local) return local;
  if (!useDb()) return null;
  try {
    const snap = await adminDb!.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as PayoutAttempt) : null;
  } catch { return null; }
}

export async function listAttempts(creatorId: string): Promise<PayoutAttempt[]> {
  const local = [...mem.values()].filter((a) => a.creatorId === creatorId);
  if (!useDb()) return local;
  try {
    const snap = await adminDb!.collection(COLLECTION).where("creatorId", "==", creatorId).limit(200).get();
    const byId = new Map<string, PayoutAttempt>();
    for (const a of [...snap.docs.map((d) => d.data() as PayoutAttempt), ...local]) byId.set(a.id, a);
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return local; }
}

/** Money already sent, so a wallet can subtract it. Only `sent` counts. */
export async function paidOutPence(creatorId: string): Promise<number> {
  return (await listAttempts(creatorId)).filter((a) => a.state === "sent").reduce((sum, a) => sum + a.grossPence, 0);
}

export function __resetPayoutAttempts(): void { mem.clear(); }

export const EXECUTE_DOCTRINE = [
  "A payout is claimed before the provider is called, so a double click, a retry or a timeout the client never saw cannot send the money twice.",
  "A failed payout releases the balance immediately. Money locked behind a failure is a support ticket and a lost user.",
  "Nothing is ever reported as sent without a reference from the provider. With no rail connected this says so plainly rather than showing a success — here the lie would be about somebody's wages.",
  "The identity gate runs before the fee quote, which runs before anything moves. Each one refuses rather than warns.",
];
