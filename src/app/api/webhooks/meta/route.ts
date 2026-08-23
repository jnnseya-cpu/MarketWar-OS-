import { NextRequest, NextResponse } from "next/server";
import { verifyMetaSignature, metaVerifyToken, normaliseMetaEvents, metaWebhookConfigured } from "@/backend/meta-webhook";

// THE INSTAGRAM / MESSENGER WEBHOOK.
//
// GET  — Meta's one-time subscription handshake: echo hub.challenge back if the
//        verify token matches.
// POST — every comment, DM, story reply and mention, signed.
//
// Node runtime, because the signature is computed over the RAW body and the edge
// runtime does not give it to us intact.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's subscription handshake.
 *
 * Compared against META_VERIFY_TOKEN. With no token configured this refuses —
 * echoing the challenge back to anybody who asks would let a stranger point
 * their own Meta app at this endpoint and start delivering events into it.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge") || "";

  const expected = metaVerifyToken();
  if (!expected) {
    return NextResponse.json({ error: "META_VERIFY_TOKEN is not set on this deployment." }, { status: 503 });
  }
  if (mode !== "subscribe" || token !== expected) {
    return NextResponse.json({ error: "Verification failed." }, { status: 403 });
  }
  // Meta requires the raw challenge as plain text, not JSON.
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  // RAW body first, always. Parsing and re-serialising changes whitespace and
  // key order, and the signature then never matches.
  const raw = await req.text();

  if (!metaWebhookConfigured()) {
    // 503, not 200: a 200 tells Meta the event was handled and it is never
    // resent. Saying "not now" keeps the event in their retry queue until this
    // deployment can actually verify it.
    return NextResponse.json({ error: "Webhook not configured (FB_APP_SECRET)." }, { status: 503 });
  }

  const verdict = verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"));
  if (!verdict.valid) {
    // Never retried, deliberately: a request that cannot be proved to come from
    // Meta will not become valid on a second attempt, and this endpoint is
    // public. Nothing about the body is echoed back.
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  // Resolving a receiving account to a brand needs the connection store, which
  // is not wired yet — so nothing is ACTED on. Events are normalised and
  // counted, which is what makes the subscription verifiable end to end (Meta
  // sends real test events during App Review) without any risk of the platform
  // messaging a stranger before the trigger rules have a surface.
  const events = normaliseMetaEvents(body, () => null);

  // 200 REGARDLESS OF WHAT WE DID WITH IT. Meta retries a non-200 with backoff
  // and disables a subscription that keeps failing; an event we could not match
  // to a brand is not a delivery failure and must not look like one.
  return NextResponse.json({ ok: true, received: events.length });
}
