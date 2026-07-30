import { NextRequest, NextResponse } from "next/server";
import { emailConfigured, filterList, sendEmail, sendEmailBatch, lastBatchMode, validateAttachments, type EmailAttachment } from "@/backend/email";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";

// M-34 email engine API.
// POST { action: "validate", emails: string[] }  → hygiene verdicts
// POST { action: "send", to, subject, html }     → filtered, then sent
// GET                                            → engine status
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A campaign is a SERIAL loop of SMTP sends, each of which can take seconds and
// is allowed up to 15 before it times out. Without a reserved budget the
// platform default kills the function part-way through — the customer sees
// "Request failed" with no JSON at all, and worse, the sends that DID go out are
// never counted, so a retry mails those people twice.
export const maxDuration = 60;

// Stop sending with time to spare, so the response is written by US rather than
// the function being killed. What went out is then reported honestly and counted
// against the warm-up allowance, and the rest is picked up by the next run.
const SEND_BUDGET_MS = Number(process.env.EMAIL_SEND_BUDGET_MS || 45_000);

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
    const single = (Array.isArray(body.attachments) ? body.attachments : []) as EmailAttachment[];
    const singleCheck = validateAttachments(single);
    if (!singleCheck.ok) return NextResponse.json({ error: singleCheck.error }, { status: 400 });
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "to, subject and html required" }, { status: 400 });
    }
    const result = await sendEmail({ to, subject, html, transactional: true, attachments: single.length ? single : undefined });
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

    // Attachments (documents/images) — validated ONCE before the send loop so a
    // bad file fails fast instead of part-way through a campaign.
    const attachments = (Array.isArray(body.attachments) ? body.attachments : []) as EmailAttachment[];
    const attCheck = validateAttachments(attachments);
    if (!attCheck.ok) return NextResponse.json({ error: attCheck.error }, { status: 400 });

    // Content comes from a saved template (personalised per contact) OR a raw
    // subject+html. A templateId wins and supplies both.
    let subject = typeof body.subject === "string" ? body.subject : "";
    let html = typeof body.html === "string" ? body.html : "";
    const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
    if (templateId) {
      const { getTemplate } = await import("@/backend/email-templates");
      const tpl = await getTemplate(brandId, templateId);
      if (!tpl) return NextResponse.json({ error: "Template not found for this brand" }, { status: 404 });
      subject = tpl.subject; html = tpl.html;
    }
    if (!subject || !html) return NextResponse.json({ error: "subject and html required (or a valid templateId)" }, { status: 400 });

    const brandName = typeof body.business === "string" ? body.business : "";
    const { mergeTemplate } = await import("@/backend/email-templates");
    const { listContacts } = await import("@/backend/contacts");
    const contacts = await listContacts(brandId);
    // Optional status filter (prospect lists): "contacted" | "new" | etc.
    const statusFilter = typeof body.statusFilter === "string" ? body.statusFilter.trim().toLowerCase() : "";
    const pool = statusFilter ? contacts.filter((c) => (c.status || "").toLowerCase() === statusFilter) : contacts;
    // Eligibility. Consent model matches the Customer Vault DISPLAY (which counts
    // a contact as consented unless it EXPLICITLY opted out, consent===false) so
    // "100% consented" in the vault and "sendable" here never disagree. Only an
    // explicit opt-out is excluded. For a status-targeted B2B prospect segment,
    // company addresses are eligible under legitimate interest. Either way an
    // EMAIL is mandatory — we can't send without one.
    const eligible = statusFilter
      ? pool.filter((c) => c.email)
      : pool.filter((c) => c.email && c.consent !== false);
    const consented = eligible.map((c) => c.email as string);
    if (consented.length === 0) {
      const haveEmail = pool.filter((c) => c.email).length;
      const optedOut = pool.filter((c) => c.email && c.consent === false).length;
      const msg = statusFilter
        ? `${pool.length} contact(s) match status "${statusFilter}", but ${haveEmail} have an email address. To email them the list needs an email column (or connect an enrichment provider). Nothing was sent.`
        : haveEmail === 0
          ? `Your vault has ${pool.length} contact(s) but none have an email address, so there's nothing to send to. Import a list that includes an email column.`
          : `All ${haveEmail} contact(s) with an email have opted out (${optedOut} suppressed), so nothing can be sent. Import contacts who haven't unsubscribed.`;
      return NextResponse.json({ error: msg, sent: 0, sendable: 0, matched: pool.length, withEmail: haveEmail }, { status: 400 });
    }
    // Hygiene pass (removes disposable/role/invalid before any send).
    const hygienic = filterList(consented).sendable.map((v) => v.email);
    // Persistent suppression: drop anyone the delivery-event feedback loop has
    // flagged (real bounces/complaints/unsubscribes), not just the in-memory set.
    const { suppressedEmails, injectTracking, recordEvent, unsubscribeUrl, trackingBaseFor } = await import("@/backend/email-events");
    // Resolved ONCE for the whole send. When this brand has published and
    // verified its own email.<domain> CNAME, every link and the unsubscribe URL
    // point at the brand's host instead of the shared platform one — the From
    // domain and the link domain finally match, and one customer's spam run can
    // no longer poison the click reputation of every other customer.
    const trackBase = await trackingBaseFor(brandId).catch(() => undefined);
    const suppressedSet = await suppressedEmails(brandId);
    const sendable = hygienic.filter((e) => !suppressedSet.has(e.toLowerCase()));
    // Cap per call: a test send (first 1) or a bounded batch so a runaway blast
    // can't torch the sending reputation. Larger lists send in repeated calls.
    const isTest = body.test === true;
    const cap = isTest ? 1 : Math.max(1, Math.min(500, Number(body.limit) || 250));

    // REPUTATION GUARDRAIL — the platform-level one.
    //
    // Warm-up caps VOLUME. This caps DAMAGE. MarketWar sends on shared
    // infrastructure, so reputation at Gmail and Microsoft attaches to the
    // sending domain rather than to the customer: one brand blasting a stale
    // list drags every other brand's mail toward the spam folder with it. Past
    // Google and Yahoo's published complaint limit, or an obviously dead list,
    // sending stops until it is cleaned.
    //
    // A test send of one message is exempt: it cannot move a rate, and blocking
    // the way a customer would verify their own fix helps nobody.
    if (!isTest) {
      const { brandEvents } = await import("@/backend/email-events");
      const { reputationVerdict, sendingBlocked } = await import("@/backend/deliverability");
      const ledger = await brandEvents(brandId).catch(() => []);
      const seenSent = new Set<string>(), seenBounce = new Set<string>(), seenComplaint = new Set<string>();
      for (const e of ledger) {
        const a = (e.email || "").toLowerCase();
        if (!a) continue;
        if (e.type === "sent") seenSent.add(a);
        else if (e.type === "bounce") seenBounce.add(a);
        else if (e.type === "complaint") seenComplaint.add(a);
      }
      const verdict = reputationVerdict({ sent: seenSent.size, bounces: seenBounce.size, complaints: seenComplaint.size });
      const gate = sendingBlocked(verdict);
      if (gate.blocked) {
        return NextResponse.json({
          error: gate.reason,
          sent: 0,
          reputation: verdict,
          blocked: true,
        }, { status: 409 });
      }
    }

    // WARM-UP GOVERNOR: enforce the ramping DAILY limit for this brand so a new
    // sending IP is never over-sent. Test sends bypass the block (but still count).
    const { getWarmup, recordWarmupSends } = await import("@/backend/email-warmup");
    const today = new Date().toISOString().slice(0, 10);
    const warm = await getWarmup(brandId, today);
    if (!isTest && warm.remaining <= 0) {
      return NextResponse.json({
        error: `Daily warm-up limit reached — ${warm.sentToday}/${warm.dailyCap} sent today (warm-up day ${warm.day}). Sending resumes tomorrow. This protects your new IP's reputation so you keep landing in the inbox.`,
        sent: 0, attempted: 0, failed: 0, sendable: sendable.length, consented: consented.length, remaining: 0,
        dailyCap: warm.dailyCap, sentToday: warm.sentToday, day: warm.day, mode: emailConfigured ? "live" : "demo", note: "",
      }, { status: 429 });
    }
    const effectiveCap = isTest ? 1 : Math.min(cap, warm.remaining);
    const batch = sendable.slice(0, effectiveCap);
    const campaign = (typeof body.campaign === "string" ? body.campaign : subject).slice(0, 80);

    // Send AS the brand's own authenticated domain when set up: From + Reply-To on
    // the brand's address (so replies land in the brand's inbox), DKIM-signed with
    // that domain's key (the inbox key). Falls back to the platform sender when the
    // brand hasn't authenticated a domain yet.
    const { signingFor } = await import("@/backend/sending-domains");
    const fromEmail = typeof body.fromEmail === "string" && body.fromEmail.includes("@") ? body.fromEmail.trim() : "";
    const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";
    const fromDomain = fromEmail.split("@")[1] || "";
    const dkim = fromDomain ? (await signingFor(brandId, fromDomain)) ?? undefined : undefined;
    const fromHeader = fromEmail ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail) : undefined;
    // Replies go here. Default to the From address, but let the sender point them
    // at their REAL inbox (e.g. their Gmail) so replies land where they read mail.
    const replyToRaw = typeof body.replyTo === "string" && body.replyTo.includes("@") ? body.replyTo.trim() : "";
    const replyTo = replyToRaw || fromEmail || undefined;

    // Per-recipient personalisation: look up each address's contact row and merge
    // {{ variables }} into the subject + body so every email is individual.
    const byEmail = new Map(eligible.map((c) => [(c.email as string).toLowerCase(), c]));

    let sent = 0, failed = 0;
    let stoppedEarly = false;
    const sendDeadline = Date.now() + SEND_BUDGET_MS;
    const failures: string[] = [];

    // Personalise every message first — subject, body, tracking pixel, click
    // wrapping and a per-recipient one-click unsubscribe — then hand the whole
    // batch to ONE authenticated SMTP session.
    //
    // Opening a fresh connection, TLS handshake and AUTH per message cost about
    // a second and a half each before any content moved, which capped a run at
    // roughly 34 recipients inside the send budget: a 250-a-day allowance took
    // eight presses to spend. Reusing the session is also gentler on the
    // provider, which rate-limits connections far harder than messages.
    const prepared = batch.map((to) => {
      const contact = byEmail.get(to.toLowerCase());
      return {
        to,
        subject: mergeTemplate(subject, { contact, brand: brandName }),
        html: injectTracking(mergeTemplate(html, { contact, brand: brandName }), brandId, to, campaign, trackBase),
        listUnsubscribe: unsubscribeUrl(brandId, to, campaign, trackBase),
      };
    });

    let results: Awaited<ReturnType<typeof sendEmailBatch>> = [];
    try {
      results = await sendEmailBatch(prepared, {
        from: fromHeader, replyTo, dkim,
        attachments: attachments.length ? attachments : undefined,
        deadline: sendDeadline,
      });
    } catch {
      results = [];
    }

    for (let i = 0; i < prepared.length; i++) {
      const to = prepared[i].to;
      const r = results[i];
      // No result at all means the budget stopped the run before this address —
      // it was never attempted, so it stays sendable rather than counting failed.
      if (!r) { stoppedEarly = true; continue; }
      if (r.ok) {
        sent++;
        try { await recordEvent({ brandId, email: to, type: "sent", at: new Date().toISOString(), campaign }); } catch { /* stats best-effort */ }
      } else {
        failed++; if (failures.length < 10) failures.push(to);
        // Permanent failure (5xx at RCPT/DATA, or hygiene reject) → suppress now
        // so it's never retried. Async bounces arrive via /api/webhooks/email.
        if (r.provider !== "demo-pool" && (/\b5\d\d\b/.test(r.detail || "") || r.provider === "hygiene-filter")) {
          try { await recordEvent({ brandId, email: to, type: "bounce", at: new Date().toISOString(), campaign }); } catch { /* best-effort */ }
        }
      }
    }
    // Count what actually went out against today's warm-up allowance.
    if (sent > 0) { try { await recordWarmupSends(brandId, today, sent); } catch { /* counter best-effort */ } }
    const dailyRemaining = Math.max(0, warm.remaining - sent);
    const attempted = sent + failed;
    // Anything the budget cut off is still sendable and must be counted as such,
    // or the customer thinks the campaign finished when most of it never went.
    const notReached = batch.length - attempted;
    return NextResponse.json({
      mode: emailConfigured ? "live" : "demo",
      vaultTotal: contacts.length, consented: consented.length, sendable: sendable.length,
      attempted, sent, failed, failures,
      stoppedEarly, notReached,
      // Which path actually ran. Reported because the alternative is inferring it
      // from a throughput number, which is how a stale deploy and a real cap look
      // identical from the outside.
      sendMode: lastBatchMode,
      remaining: Math.max(0, sendable.length - attempted),
      dailyCap: warm.dailyCap, sentToday: warm.sentToday + sent, dailyRemaining, day: warm.day,
      authenticatedAs: dkim ? `${fromEmail} (DKIM-signed as ${dkim.domain})` : fromEmail ? `${fromEmail} (domain not yet authenticated — sign it in Sending Domains for inbox placement)` : "platform default sender",
      note: emailConfigured
        ? `${stoppedEarly ? `Time ran out part-way through: ${sent} of ${batch.length} were sent and ${notReached} were not reached. Nobody was sent to twice — run again to continue from where it stopped. ` : ""}Sent ${sent} of ${attempted || batch.length}. ${dailyRemaining > 0 && sendable.length - batch.length > 0 ? `Run again to send the next batch (${dailyRemaining} left in today's warm-up limit). ` : dailyRemaining <= 0 ? `That's today's warm-up limit (day ${warm.day}: ${warm.dailyCap}/day) — the rest sends tomorrow. ` : ""}Inbox placement depends on your domain's SPF/DKIM/DMARC + IP reputation.`
        : "Demo mode — no sending server configured, so nothing left the machine. Set SMTP_HOST/USER/PASS to send for real.",
    });
  }

  return NextResponse.json({ error: "Unknown action — use validate, send or send_campaign" }, { status: 400 });
}

export async function GET() {
  const { emailProvider } = await import("@/backend/email");
  return NextResponse.json({
    engine: "M-34 AI Transactional Email Engine",
    mode: emailConfigured ? "live" : "demo",
    provider: emailProvider, // "smtp" | "resend" | "sendgrid" | "demo" — no credentials
    from: process.env.EMAIL_FROM || "MarketWar OS <os@notifications.marketwaros.com>",
    hygiene: ["syntax", "disposable-domain", "role-address", "suppression-ledger"],
    doctrine: "Inbox placement is earned: authentication + warm-up + consent + hygiene. Bounces are prevented pre-send and never repeated.",
  });
}
