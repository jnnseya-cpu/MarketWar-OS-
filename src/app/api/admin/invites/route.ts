import { NextRequest, NextResponse } from "next/server";
import { createInvite, listInvites, revokeInvite } from "@/backend/invites";
import { requireAuth } from "@/backend/guard";
import { sendEmail } from "@/backend/email";

function inviteHtml(companyName: string, link: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b1220;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;color:#e2e8f0">
    <h1 style="color:#fff;font-size:22px;margin:0 0 8px">You're invited to MarketWar OS</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 20px">
      ${companyName}, your growth command centre is ready. Create your account to run your marketing audit,
      build your strategy, and start acquiring customers — all in one place.</p>
    <a href="${link}" style="display:inline-block;background:#10b981;color:#04120c;font-weight:bold;
      text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px">Accept invite &amp; sign up</a>
    <p style="color:#64748b;font-size:12px;line-height:1.6;margin:22px 0 0">
      Or paste this link into your browser:<br><span style="color:#93c5fd">${link}</span></p>
  </div></body></html>`;
}

// Admin invites — invite a (multi-brand) company to test. Admin-scoped
// (tenant_manage) when Firebase Admin is configured; open in zero-config demo.
// GET  → all invites. POST { email, companyName, planId?, brands?, note? } → create.
// DELETE ?token= → revoke.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "tenant_manage" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ invites: await listInvites() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "tenant_manage" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email : "";
  const companyName = typeof body.companyName === "string" ? body.companyName : "";
  if (!companyName.trim()) return NextResponse.json({ error: "companyName is required" }, { status: 400 });
  const invite = await createInvite({
    email, companyName,
    planId: typeof body.planId === "string" ? body.planId : undefined,
    brands: typeof body.brands === "number" ? body.brands : Number(body.brands) || undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });

  // Auto-email the signup link to the contact. Best-effort: a send failure (or
  // no SMTP) never blocks invite creation — the admin can always copy the link.
  const base = (process.env.NEXT_PUBLIC_PRODUCTION_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.marketwaros.com").replace(/\/$/, "");
  const link = `${base}/signup?invite=${invite.token}`;
  let emailed = false;
  if (email && email.includes("@")) {
    try {
      const res = await sendEmail({
        to: email,
        subject: `You're invited to MarketWar OS — ${companyName}`,
        html: inviteHtml(companyName, link),
      });
      emailed = (res as { mode?: string })?.mode === "live";
    } catch { /* best-effort — link is still returned */ }
  }
  return NextResponse.json({ ok: true, invite, link, emailed });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "tenant_manage" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
  return NextResponse.json(await revokeInvite(token));
}
