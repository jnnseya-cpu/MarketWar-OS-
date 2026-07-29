import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { listInbound, getInbound, markRead, unreadCount } from "@/backend/inbound";

// Unified in-app inbox — the brand owner reads/handles replies here.
// GET  ?brandId=…                                   → messages + unread count
// POST { action:"markRead", brandId, id, read? }    → mark a message read/unread
// POST { action:"reply", brandId, id, html, fromEmail, subject? } → send a reply
// Ownership-enforced on every path.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reserves the platform maximum. This route does slow external work (processes inbound mail and may reply),
// and without a budget the function is killed part-way through: the caller
// gets no JSON at all — just "Request failed" — and any work already done
// goes unreported, which is how a send gets repeated.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const [messages, unread] = await Promise.all([listInbound(brandId), unreadCount(brandId)]);
  return NextResponse.json({ messages, unread });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const id = typeof body.id === "string" ? body.id : "";
  if (!brandId || !id) return NextResponse.json({ error: "brandId and id required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "markRead") {
    await markRead(brandId, id, body.read !== false);
    return NextResponse.json({ ok: true });
  }

  if (action === "reply") {
    const msg = await getInbound(brandId, id);
    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    const html = typeof body.html === "string" ? body.html : "";
    if (!html.trim()) return NextResponse.json({ error: "Reply body required" }, { status: 400 });
    // Send AS the brand's authenticated domain (DKIM-signed) to the original sender.
    const fromEmail = typeof body.fromEmail === "string" && body.fromEmail.includes("@") ? body.fromEmail.trim() : (msg.to || "");
    const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject : (msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`);
    const { signingFor } = await import("@/backend/sending-domains");
    const { sendEmail } = await import("@/backend/email");
    const dkim = (await signingFor(brandId, fromEmail.split("@")[1] || "")) ?? undefined;
    const wrapped = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">${html}</div>`;
    const r = await sendEmail({ to: msg.from, subject, html: wrapped, from: fromEmail, replyTo: fromEmail, dkim, transactional: true });
    await markRead(brandId, id, true);
    return NextResponse.json({ ok: r.ok, provider: r.provider, detail: r.detail });
  }

  return NextResponse.json({ error: "Unknown action — use markRead or reply" }, { status: 400 });
}
