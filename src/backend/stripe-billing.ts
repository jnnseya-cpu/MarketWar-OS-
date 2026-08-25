// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar OS — Stripe billing / webhook handler.
//
// Turns verified Stripe events into ACU-ledger + subscription outcomes. Kept
// dependency-free: the Stripe signature is verified with Node's built-in crypto
// (HMAC-SHA256 over `${t}.${payload}`), so no `stripe` package is required and
// the platform's zero-config demo mode keeps working. Event handling is pure
// and deterministic; the route (src/app/api/webhooks/stripe) does the I/O.
//
// Main domain: marketwaros.com → webhook endpoint https://marketwaros.com/api/webhooks/stripe
// (Configure this exact URL in the Stripe dashboard; set STRIPE_WEBHOOK_SECRET.)

import crypto from "node:crypto";
import { PLANS, planEconomics } from "@/backend/subscription";
import { type RevenueEvent } from "@/shared/results";

export const MAIN_DOMAIN = "marketwaros.com";
export const STRIPE_WEBHOOK_PATH = "/api/webhooks/stripe";
export function webhookEndpointUrl(domain = MAIN_DOMAIN): string {
  return `https://${domain}${STRIPE_WEBHOOK_PATH}`;
}

// Events we act on (others are acknowledged 200 + ignored, per Stripe guidance).
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  // MONEY GOING BACK OUT. Without these, ACUs were a one-way door: buy them,
  // spend them, then refund or dispute the charge and keep the work. Prepaid
  // credit with no reversal is the oldest fraud in the model.
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.funds_withdrawn",
] as const;

// ---------------------------------------------------------------------------
// Signature verification — Stripe scheme: header "t=<ts>,v1=<hex>", signed
// payload = "<t>.<rawBody>", HMAC-SHA256 with the endpoint secret.
// ---------------------------------------------------------------------------
export function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined, toleranceSec = 300, nowSec?: number): { valid: boolean; reason: string; demo?: boolean } {
  if (!secret) return { valid: true, demo: true, reason: "No STRIPE_WEBHOOK_SECRET set — demo mode: signature not enforced (never do this in production)." };
  if (!signatureHeader) return { valid: false, reason: "Missing Stripe-Signature header." };
  const parts = Object.fromEntries(signatureHeader.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1) return { valid: false, reason: "Malformed Stripe-Signature header." };
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  let match = false;
  try { match = crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex")); } catch { match = false; }
  if (!match) return { valid: false, reason: "Signature mismatch — request is not from Stripe." };
  if (toleranceSec > 0 && nowSec != null) {
    const age = Math.abs(nowSec - Number(t));
    if (age > toleranceSec) return { valid: false, reason: `Timestamp outside tolerance (${age}s > ${toleranceSec}s) — possible replay.` };
  }
  return { valid: true, reason: "Signature verified." };
}

// ---------------------------------------------------------------------------
// Event → outcome. Idempotent by event.id (the caller records processed ids;
// this function reports the intended ledger/subscription action).
// ---------------------------------------------------------------------------
export type StripeEventLike = {
  id: string;
  type: string;
  created?: number; // unix seconds (Stripe includes this on every event)
  data?: { object?: Record<string, unknown> };
};

export type WebhookOutcome = {
  eventId: string;
  eventType: string;
  handled: boolean;
  action: "allocate_acus" | "grace_period" | "downgrade" | "renew" | "reverse_credit" | "ignored";
  /** monthly | annual, when the event names one. */
  cycle?: "monthly" | "annual";
  /** The instalments still owed on an annual allocation. */
  scheduleRelease?: { perMonth: number; months: number };
  planId?: string;
  acusAllocated?: number;
  ledgerEntry?: { type: string; direction: "credit" | "debit"; amountAcu: number; idempotencyKey: string };
  note: string;
};

/**
 * Which plan did this event pay for — or NOTHING, if it did not say.
 *
 * This used to default to "growth" when the metadata was missing or unknown,
 * described as "a sensible default for demo". On a live endpoint it is not a
 * default, it is a giveaway: any checkout.session.completed or invoice.paid
 * that reached us without metadata.planId allocated a full month of Growth
 * ACUs, and a Starter customer whose metadata got dropped would be topped up
 * at the Growth rate every month for as long as the subscription ran.
 *
 * A payment that does not name its plan is a payment we do not understand, and
 * the safe response to not understanding a payment is to allocate nothing and
 * say so loudly. Our own checkout stamps planId in two places (session metadata
 * and subscription_data metadata), so a missing one means something is wrong
 * and wants looking at — not papering over.
 *
 * `invoice.paid` also carries the subscription's metadata under
 * subscription_details, which is where every RENEWAL after the first month
 * finds its plan.
 */
function planFromEvent(obj: Record<string, unknown> | undefined): string | null {
  const meta = (obj?.metadata as Record<string, unknown> | undefined) ?? {};
  const subMeta = ((obj?.subscription_details as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined) ?? {};
  for (const candidate of [meta.planId, subMeta.planId]) {
    if (typeof candidate !== "string") continue;
    const known = PLANS.find((p) => p.id === candidate.trim());
    if (known) return known.id;
  }
  return null;
}

/**
 * Monthly or annual — read from the same metadata the checkout stamps in two
 * places. It was stamped and never read, so every allocation used the MONTHLY
 * figure and an annual invoice arrives once a year: an annual Growth customer
 * paid £411 and got 980 ACUs for the year instead of 8,232.
 */
function cycleFromEvent(obj: Record<string, unknown> | undefined): "monthly" | "annual" {
  const meta = (obj?.metadata as Record<string, unknown> | undefined) ?? {};
  const subMeta = ((obj?.subscription_details as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined) ?? {};
  for (const candidate of [meta.cycle, subMeta.cycle]) {
    if (typeof candidate === "string" && candidate.trim() === "annual") return "annual";
  }
  return "monthly";
}

export function handleStripeEvent(event: StripeEventLike): WebhookOutcome {
  const obj = event.data?.object;
  const base = { eventId: event.id, eventType: event.type };

  // ACU top-up payment (metadata.marketwar_topup) → credit the specified ACUs to
  // the wallet. Idempotency key = event id (a redelivered webhook never
  // double-credits). Checked before subscription so a top-up isn't mis-handled.
  const meta = (obj?.metadata as Record<string, unknown> | undefined) ?? {};
  if ((event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") && String(meta.marketwar_topup) === "true") {
    // CREDIT WHAT WAS PAID, NOT WHAT THE METADATA ASKED FOR.
    //
    // The ACU count was read straight off metadata. Our own checkout derives it
    // from the amount and stamps both, so they normally agree — but a Stripe
    // COUPON or promotion code reduces `amount_total` and leaves the metadata
    // untouched, so a 90%-off code bought the full ACUs for a tenth of the
    // money. A partial capture does the same. 1 ACU is 1 penny, so the amount
    // actually received IS the credit; the metadata is now only a ceiling.
    const intended = Math.max(0, Math.round(Number(meta.marketwar_acus) || 0));
    const paidPence = Math.max(0, Math.round(Number(obj?.amount_total ?? obj?.amount_received ?? obj?.amount ?? 0)));
    const acus = paidPence > 0 ? Math.min(intended, paidPence) : intended;
    return {
      ...base, handled: true, action: "allocate_acus", acusAllocated: acus,
      ledgerEntry: { type: "acu_topup", direction: "credit", amountAcu: acus, idempotencyKey: event.id },
      note: acus < intended
        ? `Credit ${acus} top-up ACUs — the metadata asked for ${intended} but only ${paidPence}p was actually received (a discount code or a partial capture), and a wallet is credited from money that arrived, never from an intention.`
        : `Credit ${acus} top-up ACUs to the org wallet — append-only, idempotency key = event id. Top-ups carry no discount (4× recovery protected).`,
    };
  }

  // ONE ALLOCATION PER PERIOD, AND THE INVOICE IS THE PERIOD.
  //
  // Stripe fires BOTH `checkout.session.completed` and `invoice.paid` when a
  // subscription starts. Both named the plan, both allocated a full month, and
  // the idempotency key is the event id — which differs — so every new
  // subscriber was credited TWICE for their first month. On Growth that is 980
  // ACUs given away per signup, and it would have scaled linearly with success.
  //
  // The invoice is the payment for a period; the session is only the signup. So
  // a subscription checkout activates the plan and allocates nothing, and every
  // allocation — first month and every renewal — comes from an invoice.
  if (event.type === "checkout.session.completed" && String(obj?.mode ?? "") === "subscription") {
    const planId = planFromEvent(obj);
    if (!planId) {
      return {
        ...base, handled: false, action: "ignored",
        note: "Subscription checkout completed but it names no plan, so nothing was activated — guessing would hand out an entitlement nobody paid for.",
      };
    }
    return {
      ...base, handled: true, action: "renew", planId, acusAllocated: 0,
      note: `Subscription started on ${planId} — plan activated. The ACUs for this period are allocated by the invoice, so that this and invoice.paid cannot both credit the same month.`,
    };
  }

  if (event.type === "checkout.session.completed" || event.type === "invoice.paid") {
    const planId = planFromEvent(obj);
    if (!planId) {
      return {
        ...base, handled: false, action: "ignored",
        note: "Payment received but it does not name a plan (no metadata.planId on the session or the subscription), so no ACUs were allocated — guessing a plan would hand out an allowance nobody paid for. Every checkout MarketWar creates stamps planId; an event without it came from somewhere else, or the metadata was lost. Check the session in the Stripe dashboard and allocate by hand if it was a genuine subscription.",
      };
    }
    const plan = PLANS.find((p) => p.id === planId)!;
    const econ = planEconomics(plan);
    const cycle = cycleFromEvent(obj);
    // An annual payment buys a YEAR of allocation, released a month at a time —
    // the published model, which nothing implemented. The first instalment is
    // credited now and the other eleven are scheduled on the wallet.
    const acus = cycle === "annual" ? econ.annualMonthlyReleaseAcus : econ.monthlyAcus;
    return {
      ...base, handled: true,
      action: event.type === "invoice.paid" ? "renew" : "allocate_acus",
      planId, cycle, acusAllocated: acus,
      ...(cycle === "annual"
        ? { scheduleRelease: { perMonth: econ.annualMonthlyReleaseAcus, months: 11 } }
        : {}),
      ledgerEntry: { type: "subscription_allocation", direction: "credit", amountAcu: acus, idempotencyKey: event.id },
      note: cycle === "annual"
        ? `Credit ${acus} ACUs now and schedule 11 more instalments of ${econ.annualMonthlyReleaseAcus} — an annual plan buys ${econ.annualAcus} ACUs for the year, released monthly. Idempotency key = event id.`
        : `Credit ${acus} ACUs (20% of the ${plan.name} price) to the org wallet — append-only, idempotency key = event id so a redelivered event never double-credits.`,
    };
  }
  // A REFUND OR A DISPUTE TAKES THE CREDIT BACK.
  //
  // Buy ACUs, spend them, then refund the payment or raise a chargeback: the
  // work was done, the provider was paid, and the money went home. Prepaid
  // credit with no reversal path is the oldest fraud in this model, and nothing
  // here handled it.
  //
  // The reversal is the amount that actually went back, in pence, because 1 ACU
  // is 1 penny. It cannot make a balance negative — what cannot be taken is
  // recorded as owed and netted off the next payment, the same way a creator
  // clawback on an unrecallable rail is handled.
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created" || event.type === "charge.dispute.funds_withdrawn") {
    const back = Math.max(0, Math.round(Number(
      obj?.amount_refunded ?? (obj as { amount?: unknown } | undefined)?.amount ?? 0,
    )));
    if (back <= 0) {
      return { ...base, handled: false, action: "ignored", note: "Refund or dispute carried no amount, so nothing was reversed rather than guessing one." };
    }
    return {
      ...base, handled: true, action: "reverse_credit", acusAllocated: -back,
      ledgerEntry: { type: "acu_reversal", direction: "debit", amountAcu: back, idempotencyKey: event.id },
      note: `${event.type === "charge.refunded" ? "Refunded" : "Disputed"} — reverse ${back} ACUs. A balance is never driven negative; anything already spent is recorded as owed and netted off the next payment.`,
    };
  }

  if (event.type === "invoice.payment_failed") {
    return { ...base, handled: true, action: "grace_period", note: "Enter grace period; retry payment; restrict service + hard-stop ACUs after grace expires (no new charges)." };
  }
  if (event.type === "customer.subscription.deleted") {
    return { ...base, handled: true, action: "downgrade", note: "Downgrade: assets stay readable, excess brands/users become read-only, automations pause; purchased top-up ACUs remain valid." };
  }
  if (event.type === "customer.subscription.updated") {
    const planId = planFromEvent(obj);
    // Same rule as a payment: a subscription that does not name its plan is not
    // one we can sync. Writing a guessed plan onto a wallet would change what
    // the customer is entitled to on the strength of nothing.
    if (!planId) {
      return { ...base, handled: false, action: "ignored", note: "Subscription updated, but it carries no recognised metadata.planId, so the wallet's plan was left as it is rather than changed to a guess." };
    }
    return { ...base, handled: true, action: "renew", planId, note: `Subscription updated → sync plan (${planId}); next allocation follows the new plan.` };
  }
  return { ...base, handled: false, action: "ignored", note: "Event acknowledged (200) but not actioned — MarketWar only acts on a small allowlist of billing events." };
}

// Attributed revenue from a Stripe payment webhook. When a MarketWar-created
// checkout carries metadata.marketwar_brand_id (+ optional marketwar_source),
// a successful payment is recorded as attributed revenue for that brand — so
// real customer payments count automatically, no manual logging. Idempotent:
// the RevenueEvent id IS the Stripe event id, so a redelivered webhook overwrites
// rather than double-counting. Returns null for non-payment or un-tagged events.
const PAYMENT_EVENTS = new Set(["checkout.session.completed", "invoice.paid", "charge.succeeded", "payment_intent.succeeded"]);

export function brandRevenueFromEvent(event: StripeEventLike): RevenueEvent | null {
  if (!PAYMENT_EVENTS.has(event.type)) return null;
  const obj = event.data?.object ?? {};
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  const brandId = typeof meta.marketwar_brand_id === "string" ? meta.marketwar_brand_id.trim() : "";
  if (!brandId) return null;
  const source = typeof meta.marketwar_source === "string" && meta.marketwar_source.trim() ? meta.marketwar_source.trim() : "Stripe checkout";
  const pence = Number(obj.amount_total ?? obj.amount_paid ?? obj.amount ?? 0);
  const amountGbp = Math.max(0, pence / 100);
  const at = event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString();
  return { id: event.id, brandId, type: "sale", source, amountGbp, note: "Stripe payment", at };
}

export function demoStripe() {
  return {
    endpointUrl: webhookEndpointUrl(),
    handledEvents: HANDLED_EVENTS,
    signatureDemo: verifyStripeSignature("{}", "t=1,v1=deadbeef", undefined),
    exampleOutcomes: [
      handleStripeEvent({ id: "evt_demo_1", type: "checkout.session.completed", data: { object: { metadata: { planId: "growth" } } } }),
      handleStripeEvent({ id: "evt_demo_2", type: "invoice.payment_failed" }),
      handleStripeEvent({ id: "evt_demo_3", type: "customer.subscription.deleted" }),
      handleStripeEvent({ id: "evt_demo_4", type: "charge.refunded" }),
      // A payment with no plan on it: allocates nothing, on purpose.
      handleStripeEvent({ id: "evt_demo_5", type: "checkout.session.completed", data: { object: {} } }),
    ],
  };
}
