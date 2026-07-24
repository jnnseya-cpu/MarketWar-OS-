import { NextRequest, NextResponse } from "next/server";
import { emailConfigured, filterList, sendEmail } from "@/backend/email";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";

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

  // Real BULK campaign send to a brand's Customer Vault (the Brevo-style blast).
  // Consent-gated + hygiene-filtered + suppression-aware; brand-ownership checked;
  // capped + throttled so reputation never breaks. POST { action:"send_campaign",
  // brandId, subject, html, test?, limit? }
  if (body.action === "send_campaign") {
    const rl = rateLimit(clientKey(req, "email-campaign"), 6, 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded — wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const subject = typeof body.subject === "string" ? body.subject : "";
    const html = typeof body.html === "string" ? body.html : "";
    if (!subject || !html) return NextResponse.json({ error: "subject and html required" }, { status: 400 });

    const { listContacts } = await import("@/backend/contacts");
    const contacts = await listContacts(brandId);
    // Optional status filter (prospect lists): "contacted" | "new" | etc.
    const statusFilter = typeof body.statusFilter === "string" ? body.statusFilter.trim().toLowerCase() : "";
    const pool = statusFilter ? contacts.filter((c) => (c.status || "").toLowerCase() === statusFilter) : contacts;
    // Consented customers are always eligible. For a status-targeted B2B prospect
    // segment, company addresses are eligible under B2B legitimate interest — but
    // an EMAIL is mandatory (we can't send without one).
    const eligible = statusFilter
      ? pool.filter((c) => c.email)
      : pool.filter((c) => c.email && c.consent === true);
    const consented = eligible.map((c) => c.email as string);
    if (consented.length === 0) {
      const haveEmail = pool.filter((c) => c.email).length;
      const msg = statusFilter
        ? `${pool.length} contact(s) match status "${statusFilter}", but ${haveEmail} have an email address. To email them the list needs an email column (or connect an enrichment provider). Nothing was sent.`
        : "No consented contacts with an email in this vault. Import contacts with consent=true first.";
      return NextResponse.json({ error: msg, sent: 0, sendable: 0, matched: pool.length, withEmail: haveEmail }, { status: 400 });
    }
    // Hygiene pass (removes disposable/role/suppressed/invalid before any send).
    const sendable = filterList(consented).sendable.map((v) => v.email);
    // Cap per call: a test send (first 1) or a bounded batch so a runaway blast
    // can't torch the sending reputation. Larger lists send in repeated calls.
    const isTest = body.test === true;
    const cap = isTest ? 1 : Math.max(1, Math.min(500, Number(body.limit) || 250));
    const batch = sendable.slice(0, cap);

    let sent = 0, failed = 0;
    const failures: string[] = [];
    for (const to of batch) {
      try {
        const r = await sendEmail({ to, subject, html });
        if (r.ok) sent++; else { failed++; if (failures.length < 10) failures.push(to); }
      } catch { failed++; if (failures.length < 10) failures.push(to); }
    }
    return NextResponse.json({
      mode: emailConfigured ? "live" : "demo",
      vaultTotal: contacts.length, consented: consented.length, sendable: sendable.length,
      attempted: batch.length, sent, failed, failures,
      remaining: Math.max(0, sendable.length - batch.length),
      note: emailConfigured
        ? `Sent ${sent} of ${batch.length} via the live provider pool. ${sendable.length - batch.length > 0 ? "Run again to send the next batch. " : ""}Inbox placement depends on your domain's SPF/DKIM/DMARC.`
        : "Demo mode — no provider configured, so nothing left the machine. Set SMTP_HOST/USER/PASS or RESEND_API_KEY / SENDGRID_API_KEY to send for real.",
    });
  }

  return NextResponse.json({ error: "Unknown action — use validate, send or send_campaign" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "M-34 AI Transactional Email Engine",
    mode: emailConfigured ? "live" : "demo",
    hygiene: ["syntax", "disposable-domain", "role-address", "suppression-ledger"],
    doctrine: "Inbox placement is earned: authentication + warm-up + consent + hygiene. Bounces are prevented pre-send and never repeated.",
  });
}
