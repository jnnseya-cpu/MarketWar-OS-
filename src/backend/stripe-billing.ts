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

/**
 * THE HOST STRIPE MUST POST TO.
 *
 * THE INCIDENT. This was the literal string "marketwaros.com" — the apex — and
 * the deployment serves `www.marketwaros.com`. Stripe DOES NOT FOLLOW
 * REDIRECTS, so every delivery to the apex was recorded against an endpoint
 * that never reached this application. The value was then copied into five
 * documents (DEPLOYMENT, GO-LIVE, LAUNCH-BLOCKERS, LAUNCH-READINESS,
 * REQUIREMENTS-COVERAGE), each instructing the owner to configure precisely the
 * host that could not work. The documentation WAS the defect, and a hard-coded
 * guess about somebody else's DNS is what produced it.
 *
 * So it is now an env var first, and every caller that HAS a real request
 * passes the host that request actually arrived on — which is the only host
 * known for certain to serve this app. `/api/health/stripe` compares the two
 * and prints the URL to paste into Stripe.
 *
 * Set `MW_SITE_HOST` to the canonical host if it is ever neither of these. The
 * scheme and any trailing slash are stripped, because a pasted value usually
 * carries them and a URL with two schemes in it fails silently.
 */
export const MAIN_DOMAIN = (process.env.MW_SITE_HOST || "www.marketwaros.com")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "");

export const STRIPE_WEBHOOK_PATH = "/api/webhooks/stripe";

/**
 * The endpoint URL to configure in Stripe.
 *
 * Pass the request's own host wherever there is one. The default is a
 * configured guess and is only correct until somebody moves the site.
 */
export function webhookEndpointUrl(domain = MAIN_DOMAIN): string {
  const host = (domain || MAIN_DOMAIN).trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${host}${STRIPE_WEBHOOK_PATH}`;
}

// Events we act on (others are acknowledged 200 + ignored, per Stripe guidance).
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  // A TOP-UP THAT ARRIVES AS A BARE PAYMENT INTENT WAS MISSING FROM THIS LIST.
  //
  // The dispatcher below acts on `payment_intent.succeeded` — it is half of the
  // ACU top-up branch — and this list, which is what the diagnostic and the
  // setup instructions tell an owner to subscribe to, did not name it. Nothing
  // broke loudly: the list does not gate dispatch, so an event that arrived was
  // still handled. It broke QUIETLY, by telling somebody configuring the
  // endpoint to tick eight boxes when the code needs nine, so a top-up paid
  // through a payment intent would never reach the wallet and the money would
  // simply not appear.
  //
  // The boundary again: a value that exists on one side (the dispatcher) and is
  // never carried to the other (the advertised list). A test now derives the
  // dispatcher's own branches from source and fails if the two disagree.
  "payment_intent.succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  // MONEY GOING BACK OUT. Without these, ACUs were a one-way door: buy them,
  // spend them, then refund or dispute the charge and keep the work. Prepaid
  // credit with no reversal is the oldest fraud in the model.
  //
  // WHY `refund.created` AND NOT `charge.refunded`, which this used to name.
  // The object on `charge.refunded` is the CHARGE, and its `amount_refunded` is
  // CUMULATIVE. Two partial refunds of £10 on a £30 charge arrive as two events
  // carrying 1000 and 2000, so reversing each one took £30 of ACUs back for £20
  // of money returned. `refund.created` carries the Refund itself — this
  // refund's own amount and its own id — which is the delta and is what
  // Stripe's own documentation points at from the `charge.refunded` entry.
  "refund.created",
  // ONE DISPUTE, ONE REVERSAL. `charge.dispute.created` and
  // `charge.dispute.funds_withdrawn` are two events, with two event ids, about
  // the same dispute and the same amount — and idempotency keyed on the event
  // id cannot see that, so subscribing to both took the ACUs back TWICE. The
  // reversal belongs on the one that means the money has actually left.
  "charge.dispute.funds_withdrawn",
  // AND IF WE WIN IT, THE CUSTOMER GETS THEM BACK. Without this the reversal
  // was permanent whatever the outcome: a customer who disputed a charge, lost
  // the dispute, and had the money taken back off them by their own bank was
  // still short the ACUs we clawed back.
  "charge.dispute.funds_reinstated",
] as const;

/**
 * THE EVENTS TO TICK IN THE STRIPE DASHBOARD — the complete list, and the only
 * list.
 *
 * `HANDLED_EVENTS` is what the DISPATCHER acts on. This is one longer, because
 * `charge.succeeded` is read by `brandRevenueFromEvent` for a customer's own
 * sales through our checkout and never reaches the dispatcher at all. An owner
 * ticking boxes needs one list; two lists is how a box goes unticked.
 *
 * Everything not on this list is acknowledged with 200 and ignored, so
 * subscribing to more than this costs delivery volume and buys nothing.
 */
export const SUBSCRIBE_EVENTS = [...HANDLED_EVENTS, "charge.succeeded"] as const;

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

/**
 * The identity of the money that moved, for idempotency.
 *
 * A Firestore document id, so it has to be safe to use as one: the provider's
 * ids are already `re_…` / `du_…`, but a hostile or malformed payload must not
 * be able to write outside its own document, which a `/` in an id would do.
 * Falls back to the charge when the object carries no id of its own, and to
 * nothing at all when neither is readable — and the caller then uses the event
 * id, which is the behaviour this replaced and is still correct for a
 * redelivery.
 */
function movementKey(kind: "refund" | "dispute", obj: Record<string, unknown> | undefined): string {
  const raw = obj && typeof obj === "object" ? obj : {};
  const id = typeof raw.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : typeof raw.charge === "string" && raw.charge.trim() ? `charge_${raw.charge.trim()}` : "";
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);
  return safe ? `${kind}_${safe}` : "";
}

export type WebhookOutcome = {
  eventId: string;
  eventType: string;
  handled: boolean;
  action: "allocate_acus" | "grace_period" | "downgrade" | "renew" | "reverse_credit" | "restore_credit" | "ignored";
  /**
   * THE KEY THAT DECIDES WHETHER THIS HAS ALREADY BEEN APPLIED, when the event
   * id is the wrong question.
   *
   * Two different events can describe one movement of money — a dispute opening
   * and its funds being withdrawn — and idempotency on the event id cannot see
   * that they are the same £30. Where a movement has an identity of its own
   * (the refund, the dispute), this carries it and the wallet dedupes on it
   * instead. Absent for everything else, where the event id is exactly right.
   */
  dedupeKey?: string;
  /** monthly | annual, when the event names one. */
  cycle?: "monthly" | "annual";
  /** The instalments still owed on an annual allocation. */
  scheduleRelease?: { perMonth: number; months: number };
  planId?: string;
  acusAllocated?: number;
  ledgerEntry?: { type: string; direction: "credit" | "debit"; amountAcu: number; idempotencyKey: string };
  /**
   * THE MONEY THAT ACTUALLY ARRIVED, in minor units, as Stripe reported it.
   *
   * Not the plan's list price. A coupon, a proration, a partial capture or a
   * currency other than GBP all make the list price wrong, and the one place
   * this is used — the conversion value sent to Meta and the GTM container — is
   * the place where a wrong number trains an ad algorithm to bid for the wrong
   * customers. The top-up path above already learnt this lesson for the ACU
   * credit ("a wallet is credited from money that arrived, never from an
   * intention"); the reported revenue gets the same treatment.
   *
   * Absent when the event carries no amount, and absent must never be read as
   * zero: a zero-value Purchase is worse than no Purchase at all.
   */
  payment?: { amountMinor: number; currency: string };
  note: string;
};

/**
 * What Stripe says was paid, across the three shapes that carry it.
 *
 * `checkout.session.completed` has `amount_total`, `invoice.paid` has
 * `amount_paid`, `payment_intent.succeeded` has `amount_received`. Returns
 * undefined rather than 0 when none of them is present or positive, because the
 * caller must be able to tell "nothing arrived" from "we could not read it".
 */
function paymentFromEvent(obj: Record<string, unknown> | undefined): { amountMinor: number; currency: string } | undefined {
  const raw = obj?.amount_paid ?? obj?.amount_total ?? obj?.amount_received ?? obj?.amount;
  const amountMinor = Math.round(Number(raw) || 0);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return undefined;
  const cur = typeof obj?.currency === "string" ? obj.currency.trim().toUpperCase() : "";
  return { amountMinor, currency: cur || "GBP" };
}

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
      payment: paymentFromEvent(obj),
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
      payment: paymentFromEvent(obj),
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
  // ONE MOVEMENT OF MONEY, ONE REVERSAL — AND THE KEY THAT GUARANTEES IT.
  //
  // Idempotency used to be the event id alone, which is correct for a
  // REDELIVERY of the same event and blind to two DIFFERENT events describing
  // the same movement. `dedupeKey` is derived from the refund or the dispute,
  // so the second event about one dispute is an idempotent skip even if both
  // are subscribed — the fix does not depend on which boxes are ticked in a
  // dashboard, which is exactly the property it needs, because that selection
  // is not ours to control.
  if (event.type === "refund.created") {
    // The Refund object: this refund's OWN amount, which is the delta.
    const back = Math.max(0, Math.round(Number((obj as { amount?: unknown } | undefined)?.amount ?? 0)));
    if (back <= 0) {
      return { ...base, handled: false, action: "ignored", note: "The refund carried no amount, so nothing was reversed rather than guessing one." };
    }
    const key = movementKey("refund", obj);
    return {
      ...base, handled: true, action: "reverse_credit", acusAllocated: -back,
      dedupeKey: key,
      ledgerEntry: { type: "acu_reversal", direction: "debit", amountAcu: back, idempotencyKey: key },
      note: `Refunded — reverse ${back} ACUs. This refund's own amount, not the charge's running total, so two partial refunds take back exactly what went home. A balance is never driven negative; anything already spent is recorded as owed and netted off the next payment.`,
    };
  }

  if (event.type === "charge.dispute.funds_withdrawn") {
    const back = Math.max(0, Math.round(Number((obj as { amount?: unknown } | undefined)?.amount ?? 0)));
    if (back <= 0) {
      return { ...base, handled: false, action: "ignored", note: "The dispute carried no amount, so nothing was reversed rather than guessing one." };
    }
    const key = movementKey("dispute", obj);
    return {
      ...base, handled: true, action: "reverse_credit", acusAllocated: -back,
      dedupeKey: key,
      ledgerEntry: { type: "acu_reversal", direction: "debit", amountAcu: back, idempotencyKey: key },
      note: `Disputed and the funds have left our account — reverse ${back} ACUs. Keyed on the dispute, so the earlier charge.dispute.created cannot reverse the same money a second time.`,
    };
  }

  if (event.type === "charge.dispute.funds_reinstated") {
    const backIn = Math.max(0, Math.round(Number((obj as { amount?: unknown } | undefined)?.amount ?? 0)));
    if (backIn <= 0) {
      return { ...base, handled: false, action: "ignored", note: "The reinstatement carried no amount, so nothing was restored rather than guessing one." };
    }
    const key = `${movementKey("dispute", obj)}_reinstated`;
    return {
      // NOT a sale, and deliberately not `allocate_acus`: no plan is activated
      // and no conversion is reported. A won dispute reported as a Purchase
      // would teach the ad platform to bid for customers who charge back.
      ...base, handled: true, action: "restore_credit", acusAllocated: backIn,
      dedupeKey: key,
      ledgerEntry: { type: "acu_reinstatement", direction: "credit", amountAcu: backIn, idempotencyKey: key },
      note: `The dispute was resolved in our favour and the funds came back — restore ${backIn} ACUs. Anything that was recorded as owed because the balance could not cover the reversal is settled by this first.`,
    };
  }

  // THE TWO EVENTS THAT LOOK LIKE THEY SHOULD REVERSE, AND MUST NOT.
  //
  // Both are acknowledged and explained rather than left to the generic
  // fall-through, because "why did my refund not take the ACUs back" is a
  // question somebody will ask of the log, and the log should answer it.
  if (event.type === "charge.refunded") {
    return {
      ...base, handled: false, action: "ignored",
      note: "Acknowledged, not actioned: the amount_refunded on a charge is CUMULATIVE, so reversing it would take back the whole running total every time a partial refund is issued. The reversal is on refund.created, which carries this refund's own amount.",
    };
  }
  if (event.type === "charge.dispute.created") {
    return {
      ...base, handled: false, action: "ignored",
      note: "Acknowledged, not actioned: a dispute being opened is a notification, not a movement of money. The reversal is on charge.dispute.funds_withdrawn, when the funds have actually left — reversing on both would take the same money back twice.",
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
