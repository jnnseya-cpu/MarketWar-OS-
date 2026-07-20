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
  action: "allocate_acus" | "grace_period" | "downgrade" | "renew" | "ignored";
  planId?: string;
  acusAllocated?: number;
  ledgerEntry?: { type: string; direction: "credit" | "debit"; amountAcu: number; idempotencyKey: string };
  note: string;
};

function planFromEvent(obj: Record<string, unknown> | undefined): string {
  // Plan id is carried in metadata (checkout session / subscription).
  const meta = (obj?.metadata as Record<string, unknown> | undefined) ?? {};
  const fromMeta = typeof meta.planId === "string" ? meta.planId : undefined;
  const known = PLANS.find((p) => p.id === (fromMeta ?? ""));
  return known ? known.id : "growth"; // sensible default for demo
}

export function handleStripeEvent(event: StripeEventLike): WebhookOutcome {
  const obj = event.data?.object;
  const base = { eventId: event.id, eventType: event.type };

  if (event.type === "checkout.session.completed" || event.type === "invoice.paid") {
    const planId = planFromEvent(obj);
    const plan = PLANS.find((p) => p.id === planId)!;
    const acus = planEconomics(plan).monthlyAcus;
    return {
      ...base, handled: true,
      action: event.type === "invoice.paid" ? "renew" : "allocate_acus",
      planId, acusAllocated: acus,
      ledgerEntry: { type: event.type === "invoice.paid" ? "subscription_allocation" : "subscription_allocation", direction: "credit", amountAcu: acus, idempotencyKey: event.id },
      note: `Credit ${acus} ACUs (20% of the ${plan.name} price) to the org wallet — append-only, idempotency key = event id so a redelivered event never double-credits.`,
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
    ],
  };
}
