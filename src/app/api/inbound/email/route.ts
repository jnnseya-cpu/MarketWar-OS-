import { NextRequest, NextResponse } from "next/server";
import { saveInbound, classifyInbound } from "@/backend/inbound";
import { brandForDomain } from "@/backend/sending-domains";
import { brandFromReplyAddress, parseBounceAddress } from "@/backend/reply-routing";

// Inbound mail intake — the sending node POSTs each received message here.
// Secret-gated (EMAIL_WEBHOOK_SECRET) since it writes to a brand's inbox.
// Body: { to, from, fromName?, subject?, text?, html?, receivedAt? }
//   • resolves the owning brand from the recipient domain,
//   • bounces/auto-replies → suppression ledger (not the inbox),
//   • human replies → the brand's unified inbox.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = () => process.env.EMAIL_WEBHOOK_SECRET || process.env.CRON_SECRET || "";

function authorized(req: NextRequest): boolean {
  const secret = SECRET();
  if (!secret) return false; // fail closed
  const provided = req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret") || "";
  return provided === secret;
}

const emailOf = (s: string) => (s || "").match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase() || "";

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const to = emailOf(String(body.to ?? ""));
  const from = emailOf(String(body.from ?? ""));
  const subject = typeof body.subject === "string" ? body.subject : "";
  const text = typeof body.text === "string" ? body.text : undefined;
  const html = typeof body.html === "string" ? body.html : undefined;
  const fromName = typeof body.fromName === "string" ? body.fromName : undefined;
  const receivedAt = typeof body.receivedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(body.receivedAt) ? body.receivedAt : new Date().toISOString();
  if (!to || !from) return NextResponse.json({ error: "to and from required" }, { status: 400 });

  // Headers, when the node forwards them. RFC 3834 says an auto-responder
  // should label itself, and the ones that do are the easiest to get right.
  const headers = (body.headers && typeof body.headers === "object" ? body.headers : {}) as Record<string, string>;

  // CLASSIFY FIRST, THEN FIND THE OWNER. Resolving the brand first looked
  // tidier and dropped every bounce: a delivery failure is addressed to the
  // Return-Path mailbox, which is not a brand reply address and not a brand's
  // sending domain, so it fell out as "no brand owns this" before the bounce
  // branch was ever reached. Caught by driving a real DSN through this handler.
  const { kind, why } = classifyInbound(from, to, subject, headers);

  // The reply address on our own reply host is tried FIRST, because it is the
  // one that works without the customer publishing any DNS at all — which is
  // the whole reason replies now arrive. Then the recipient domain, then the
  // bounce subdomain, which carries the brand's domain inside it.
  const toDomain = to.split("@")[1] || "";
  // A bounce arrives at the envelope sender we chose per message, so it already
  // says whose it was and which address failed.
  const verp = parseBounceAddress(to);
  const brandId =
    verp?.brandId
    || brandFromReplyAddress(to)
    || (await brandForDomain(toDomain))
    || (await brandForDomain(toDomain.replace(/^[a-z0-9]*bounce\./i, "")));

  // ONLY A REAL DELIVERY FAILURE MAY SUPPRESS AN ADDRESS. This used to treat
  // an out-of-office as a bounce and then scrape the first address out of the
  // body to suppress — so "contact colleague@company.com while I am away" could
  // permanently suppress a live colleague who never bounced anything.
  if (kind === "bounce") {
    // The VERP recipient is a fact about the message we sent. The body scrape
    // is a guess about prose written by somebody else's mail server, and a wrong
    // guess suppresses a live customer forever — so it is the fallback, never
    // the first answer.
    let failed = "";
    if (verp && brandId) {
      const { brandEvents } = await import("@/backend/email-events");
      const { recipientFromKey } = await import("@/backend/reply-routing");
      const sentTo = (await brandEvents(brandId).catch(() => []))
        .filter((e) => e.type === "sent").map((e) => e.email);
      failed = recipientFromKey(brandId, verp.key, sentTo);
    }
    // Only if the envelope could not identify it. This is a guess about text
    // another mail server wrote, and a wrong guess suppresses a live customer.
    if (!failed) failed = emailOf(text || html || "");
    if (!brandId) return NextResponse.json({ ok: true, routed: "ignored", why, note: "A delivery failure arrived for a recipient no brand owns." });
    if (failed && failed !== from) {
      const { recordEvent } = await import("@/backend/email-events");
      try { await recordEvent({ brandId, email: failed, type: "bounce", at: receivedAt }); } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true, routed: "suppression", why, suppressed: failed || null });
  }

  if (!brandId) return NextResponse.json({ ok: true, routed: "ignored", note: "No brand owns this recipient address." });

  // An auto-reply is evidence a real person received it. It goes to the Inbox
  // flagged, so the customer sees it and it is not mistaken for a real reply.
  const msg = await saveInbound({
    brandId, from, fromName, to, subject, text, html,
    snippet: text || "", receivedAt, auto: kind === "auto-reply",
  });
  return NextResponse.json({ ok: true, routed: kind === "auto-reply" ? "inbox (auto-reply)" : "inbox", why, id: msg.id });
}

export async function GET() {
  return NextResponse.json({
    webhook: "MarketWar OS inbound mail",
    accepts: "POST { to, from, subject?, text?, html? } from the sending node. Requires EMAIL_WEBHOOK_SECRET (x-webhook-secret header or ?secret=).",
    routing: "human replies → the owning brand's inbox; bounces/auto-replies → suppression ledger.",
  });
}
