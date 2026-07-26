import { NextRequest, NextResponse } from "next/server";
import { verifyZernioSignature, handleZernioEvent, zernioWebhookConfigured, type ZernioEvent } from "@/backend/zernio-webhook";

// Zernio webhook endpoint — https://marketwaros.com/api/webhooks/zernio
// Configure this exact URL in the Zernio dashboard and set ZERNIO_WEBHOOK_SECRET.
// The signature is verified with Node crypto (HMAC-SHA256 over the raw body) with
// a static-token fallback; verified events update real post/account status.
// Idempotent by event id. Fails CLOSED in production if the secret is missing.
//
// Node runtime so we can read the raw body for signature verification.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;

  // Never accept unsigned events in production — an unauthenticated POST could
  // otherwise write arbitrary post/account status.
  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json({ error: "Webhook signing secret not configured — refusing unsigned event." }, { status: 500 });
  }

  const verdict = verifyZernioSignature(raw, {
    signature: req.headers.get("x-zernio-signature") || req.headers.get("x-webhook-signature") || req.headers.get("x-signature") || req.headers.get("zernio-signature"),
    token: req.headers.get("x-zernio-token") || req.headers.get("authorization"),
  }, secret);
  if (!verdict.valid) return NextResponse.json({ error: verdict.reason || "Invalid signature" }, { status: 400 });

  let event: ZernioEvent;
  try { event = raw ? (JSON.parse(raw) as ZernioEvent) : {}; } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const result = await handleZernioEvent(event);
  // Always ack 200 so Zernio doesn't retry a successfully-received event.
  return NextResponse.json({ received: true, method: verdict.method, ...result });
}

export async function GET() {
  return NextResponse.json({
    engine: "Zernio webhook — publish/account event sink",
    doctrine: "Verifies the Zernio signature (Node crypto HMAC-SHA256 over the raw body, token fallback), then records post outcomes (published/failed/scheduled) and account connect/disconnect events. Idempotent by event id so a redelivered event is processed once. Secret values are never returned.",
    endpointPath: "/api/webhooks/zernio",
    configured: zernioWebhookConfigured(),
    handledEvents: ["post.published", "post.failed", "post.scheduled", "account.connected", "account.disconnected"],
  });
}
