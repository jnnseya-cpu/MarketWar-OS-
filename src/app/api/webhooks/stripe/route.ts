import { NextRequest, NextResponse } from "next/server";
import {
  verifyStripeSignature, handleStripeEvent, brandRevenueFromEvent, demoStripe, webhookEndpointUrl,
  HANDLED_EVENTS, type StripeEventLike,
} from "@/backend/stripe-billing";
import { recordEvent } from "@/backend/ledger";
import { applyWebhookOutcome } from "@/backend/wallet";
import { commissionForPayment, type CommissionOutcome } from "@/backend/marketwar-commission";

// Locate the org whose wallet a payment credits. MarketWar-created checkouts stamp
// the id three ways (client_reference_id + metadata.orgId + metadata.marketwar_org_id)
// so both the initial session event and every recurring invoice can find it.
function orgIdFromEvent(event: StripeEventLike): string {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    obj.client_reference_id,
    meta.orgId,
    meta.marketwar_org_id,
    // invoice.paid nests subscription metadata under lines/subscription_details.
    ((obj.subscription_details as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined)?.orgId,
    ((obj.subscription_details as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined)?.marketwar_org_id,
  ];
  for (const c of candidates) { if (typeof c === "string" && c.trim()) return c.trim(); }
  return "";
}

/**
 * When the money actually moved, according to Stripe.
 *
 * `status_transitions.paid_at` on an invoice, else the object's `created`, else
 * the event's `created`. All are Unix seconds. Falls back to now only when the
 * event carries no timestamp at all, which no real Stripe event does.
 */
function paidAtFromEvent(event: StripeEventLike): string {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const st = obj.status_transitions as Record<string, unknown> | undefined;
  const candidates = [st?.paid_at, obj.created, (event as { created?: unknown }).created];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return new Date(c * 1000).toISOString();
  }
  return new Date().toISOString();
}

// Stripe webhook endpoint — https://marketwaros.com/api/webhooks/stripe
// Configure this exact URL in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
// Signature is verified with Node crypto (no `stripe` package required); events
// map to ACU-ledger + subscription outcomes. Idempotent by event id. In demo
// (no secret) the signature is not enforced — never run production that way.
//
// Runs on the Node runtime so we can read the raw body for signature checks.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Raw body is required for signature verification — read text, not json.
  const raw = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const nowSec = Math.floor(Date.now() / 1000);

  // Fail CLOSED in production if the signing secret is missing: without it the
  // verifier returns demo-valid, and an unauthenticated POST could persist
  // arbitrary attributed revenue to any brand. Never accept unsigned in prod.
  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json({ error: "Webhook signing secret not configured — refusing unsigned event." }, { status: 500 });
  }

  const verdict = verifyStripeSignature(raw, sig, secret, 300, nowSec);
  if (!verdict.valid) {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  let event: StripeEventLike;
  try { event = JSON.parse(raw) as StripeEventLike; } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return NextResponse.json({ error: "Malformed Stripe event (missing id/type)" }, { status: 400 });
  }

  // Compute the outcome, then PERSIST it: credit the org's ACU wallet + activate
  // its plan. applyWebhookOutcome is idempotent by event.id (records the id in the
  // same transaction as the credit), so a redelivered event never double-credits.
  const outcome = handleStripeEvent(event);
  let walletApplied: { applied: boolean; reason: string; creditedAcu?: number; planId?: string } | null = null;
  if (outcome.handled) {
    // A CREDIT THAT DID NOT PERSIST MUST NOT BE ACKNOWLEDGED.
    //
    // This used to swallow everything and always answer 200, on the reasoning
    // that "Stripe would retry" — but a 200 is precisely the instruction NOT to
    // retry. So a wallet write that failed was reported to Stripe as delivered,
    // to the log as `applied: false`, and to the customer as nothing at all.
    // Where the failure is the store's rather than the event's, the right answer
    // is 500: Stripe redelivers for three days and the credit lands by itself
    // once the store is reachable. Idempotency by event id makes that safe.
    try {
      const orgId = orgIdFromEvent(event);
      const res = await applyWebhookOutcome(orgId, outcome);
      walletApplied = { applied: res.applied, reason: res.reason, creditedAcu: res.creditedAcu, planId: res.planId };
      if (res.retriable) {
        return NextResponse.json({ received: false, error: res.reason, eventId: event.id, willRetry: true }, { status: 500 });
      }
    } catch (e) {
      // An exception here is a storage fault, not a malformed event. Same rule.
      const reason = e instanceof Error ? e.message : "wallet apply failed";
      return NextResponse.json({ received: false, error: `Could not persist this payment: ${reason}`, eventId: event.id, willRetry: true }, { status: 500 });
    }
  }

  // THE CREATOR WHO SENT THIS CUSTOMER GETS PAID — launch-audit finding D-12.
  //
  // §101 attributed the signup and nothing ever turned that into money. This is
  // the join: a payment that credited a wallet, against the referral recorded
  // when the account was created.
  //
  // A STORAGE FAILURE HERE RETURNS 500 ON PURPOSE. Stripe redelivers for three
  // days and `commissionForPayment` is idempotent by invoice id, so the accrual
  // lands by itself once the store is reachable. The alternative — acking a 200
  // and logging the miss — is a commission somebody earned and will never be
  // paid, discovered only if they complain.
  let commission: CommissionOutcome | null = null;
  if (outcome.handled && walletApplied?.applied) {
    const obj = (event.data?.object ?? {}) as Record<string, unknown>;
    commission = await commissionForPayment({
      orgId: orgIdFromEvent(event),
      // The INVOICE id where there is one, so two events describing the same
      // payment cannot both accrue; the event id otherwise.
      paymentId: typeof obj.id === "string" && obj.id ? obj.id : event.id,
      amountPaidPence: typeof obj.amount_paid === "number" ? obj.amount_paid
        : typeof obj.amount_total === "number" ? obj.amount_total : 0,
      // Gross minus tax. Paying a creator a share of VAT is paying them out of
      // money that was never ours.
      taxPence: typeof obj.tax === "number" ? obj.tax
        : typeof obj.total_tax_amounts === "object" && Array.isArray(obj.total_tax_amounts)
          ? obj.total_tax_amounts.reduce((n: number, t: unknown) => n + (typeof (t as { amount?: unknown })?.amount === "number" ? (t as { amount: number }).amount : 0), 0)
          : 0,
      // WHEN STRIPE SAYS IT WAS PAID, not when we happened to process it.
      // Using `now` here meant a redelivery three days later carried a LATER
      // timestamp than the original, which moved this payment's position in the
      // ordering that derives its payment number — the one input the accrual id
      // is hashed from. The order-id guard in `commissionForPayment` catches it,
      // but a timestamp that changes per delivery is wrong on its own terms and
      // would surface again the moment that guard was touched.
      paidAtISO: paidAtFromEvent(event),
      nowISO: new Date().toISOString(),
    });
    if (!commission.ok && !commission.terminal) {
      return NextResponse.json(
        { received: false, error: commission.reason, eventId: event.id, willRetry: true },
        { status: 500 },
      );
    }
  }

  // Automatic revenue attribution: if this is a payment on a MarketWar-created
  // checkout (metadata.marketwar_brand_id), record it as attributed revenue for
  // that brand — idempotent by event id. Never blocks the 200 response.
  let attributed: { brandId: string; amountGbp: number; source: string } | null = null;
  const revenueEvent = brandRevenueFromEvent(event);
  if (revenueEvent) {
    try {
      await recordEvent(revenueEvent);
      attributed = { brandId: revenueEvent.brandId, amountGbp: revenueEvent.amountGbp, source: revenueEvent.source };
    } catch {
      /* attribution is best-effort; the webhook still acks */
    }
  }

  return NextResponse.json({ received: true, demoSignature: verdict.demo ?? false, outcome, walletApplied, attributed, commission });
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    engine: "Stripe webhook — subscription → ACU allocation",
    doctrine: "Verifies the Stripe signature (Node crypto, no SDK), then maps a small allowlist of billing events to append-only ACU-ledger + subscription outcomes. Idempotent by event id so a redelivered event never double-credits. ACUs are allocated at 20% of the plan price via the subscription engine. Provider/secret values are never returned.",
    // The host THIS request arrived on, not a constant. A hard-coded domain is
    // what sent 246 events to an address that redirected.
    endpointUrl: webhookEndpointUrl(req.headers.get("host") || undefined),
    handledEvents: HANDLED_EVENTS,
    demo: demoStripe(),
  });
}
