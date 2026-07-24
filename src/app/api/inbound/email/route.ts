import { NextRequest, NextResponse } from "next/server";
import { saveInbound, looksAutomated } from "@/backend/inbound";
import { brandForDomain } from "@/backend/sending-domains";

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

  // Route bounces / auto-replies to suppression, not the inbox.
  if (looksAutomated(from, to, subject)) {
    const brandId = await brandForDomain(to.split("@")[1] || "");
    // A bounce carries the FAILED recipient in the body; best-effort extract it.
    const failed = emailOf(text || html || "");
    if (brandId && failed && failed !== from) {
      const { recordEvent } = await import("@/backend/email-events");
      try { await recordEvent({ brandId, email: failed, type: "bounce", at: receivedAt }); } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true, routed: "suppression" });
  }

  const brandId = await brandForDomain(to.split("@")[1] || "");
  if (!brandId) return NextResponse.json({ ok: true, routed: "ignored", note: "No brand owns this recipient domain." });

  const msg = await saveInbound({ brandId, from, fromName, to, subject, text, html, snippet: text || "", receivedAt });
  return NextResponse.json({ ok: true, routed: "inbox", id: msg.id });
}

export async function GET() {
  return NextResponse.json({
    webhook: "MarketWar OS inbound mail",
    accepts: "POST { to, from, subject?, text?, html? } from the sending node. Requires EMAIL_WEBHOOK_SECRET (x-webhook-secret header or ?secret=).",
    routing: "human replies → the owning brand's inbox; bounces/auto-replies → suppression ledger.",
  });
}
