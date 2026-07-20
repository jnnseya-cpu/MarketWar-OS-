import { NextRequest, NextResponse } from "next/server";
import {
  verifyStripeSignature, handleStripeEvent, brandRevenueFromEvent, demoStripe, webhookEndpointUrl,
  HANDLED_EVENTS, type StripeEventLike,
} from "@/backend/stripe-billing";
import { recordEvent } from "@/backend/ledger";

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

  const verdict = verifyStripeSignature(raw, sig, secret, 300, nowSec);
  if (!verdict.valid) {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  let event: StripeEventLike;
  try { event = JSON.parse(raw) as StripeEventLike; } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return NextResponse.json({ error: "Malformed Stripe event (missing id/type)" }, { status: 400 });
  }

  // In production the caller records event.id first (idempotency) before applying
  // the ledger credit inside a Firestore transaction. Here we compute the outcome.
  const outcome = handleStripeEvent(event);

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

  return NextResponse.json({ received: true, demoSignature: verdict.demo ?? false, outcome, attributed });
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
