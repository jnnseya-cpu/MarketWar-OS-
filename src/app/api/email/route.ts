import { NextRequest, NextResponse } from "next/server";
import { emailConfigured, filterList, sendEmail } from "@/backend/email";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";

// M-34 email engine API.
// POST { action: "validate", emails: string[] }  → hygiene verdicts
// POST { action: "send", to, subject, html }     → filtered, then sent
// GET                                            → engine status
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "email"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "validate") {
    const emails = Array.isArray(body.emails) ? body.emails.map(String) : [];
    if (!emails.length) {
      return NextResponse.json({ error: "emails[] required" }, { status: 400 });
    }
    const { sendable, filtered } = filterList(emails.slice(0, 1000));
    return NextResponse.json({
      total: emails.length,
      sendableCount: sendable.length,
      filteredCount: filtered.length,
      sendable,
      filtered,
    });
  }

  if (body.action === "send") {
    // Real send — MUST be authenticated. Unauthenticated send would turn the
    // platform's authenticated sending domain into an open phishing relay.
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { to, subject, html } = body as { to?: string; subject?: string; html?: string };
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "to, subject and html required" }, { status: 400 });
    }
    const result = await sendEmail({ to, subject, html, transactional: true });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  return NextResponse.json({ error: "Unknown action — use validate or send" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "M-34 AI Transactional Email Engine",
    mode: emailConfigured ? "live" : "demo",
    hygiene: ["syntax", "disposable-domain", "role-address", "suppression-ledger"],
    doctrine: "Inbox placement is earned: authentication + warm-up + consent + hygiene. Bounces are prevented pre-send and never repeated.",
  });
}
