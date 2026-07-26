import { NextRequest, NextResponse } from "next/server";
import {
  verifyStripeSignature, handleStripeEvent, brandRevenueFromEvent, demoStripe, webhookEndpointUrl,
  HANDLED_EVENTS, type StripeEventLike,
} from "@/backend/stripe-billing";
import { recordEvent } from "@/backend/ledger";
import { applyWebhookOutcome } from "@/backend/wallet";

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
    try {
      const orgId = orgIdFromEvent(event);
      const res = await applyWebhookOutcome(orgId, outcome);
      walletApplied = { applied: res.applied, reason: res.reason, creditedAcu: res.creditedAcu, planId: res.planId };
    } catch (e) {
      // Never fail the webhook on a wallet hiccup — Stripe would retry, and the
      // idempotency key still protects against a double-credit on that retry.
      walletApplied = { applied: false, reason: e instanceof Error ? e.message : "wallet apply failed" };
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

  return NextResponse.json({ received: true, demoSignature: verdict.demo ?? false, outcome, walletApplied, attributed });
}

export async function GET() {
  return NextResponse.json({
    engine: "Stripe webhook — subscription → ACU allocation",
    doctrine: "Verifies the Stripe signature (Node crypto, no SDK), then maps a small allowlist of billing events to append-only ACU-ledger + subscription outcomes. Idempotent by event id so a redelivered event never double-credits. ACUs are allocated at 20% of the plan price via the subscription engine. Provider/secret values are never returned.",
    endpointUrl: webhookEndpointUrl(),
    handledEvents: HANDLED_EVENTS,
    demo: demoStripe(),
  });
}
