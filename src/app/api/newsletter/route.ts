import { NextRequest, NextResponse } from "next/server";
import {
  audience, buildIssue, weekKey, alreadySent, markSent,
  unsubscribeUrl, newsletterConfigured, NEWSLETTER_DOCTRINE,
} from "@/backend/newsletter";
import { sendEmail } from "@/backend/email";
import { haltFor } from "@/backend/emergency-stop";
import { record as auditRecord } from "@/backend/audit-log";
import { rateLimit, clientKey, requireAuth, cronAuthorised } from "@/backend/guard";

// THE WEEKLY NEWSLETTER.
//
// POST (scheduler or signed-in owner) → send this week's issue to everyone
//                                       registered who has not opted out
// GET                                  → this week's issue, sent to nobody
//
// Leaving the list is /api/unsubscribe — a separate route on purpose.
//
// TWO GATES, BOTH DELIBERATE.
//
// Sending requires the CRON_SECRET or a signed-in caller — an open endpoint that
// mails every registered user is an abuse vector aimed at the platform's own
// sending reputation. Unsubscribing requires NEITHER, because a person trying to
// leave a mailing list must never be asked to log in; that is the friction that
// makes people press "spam" instead, and a spam complaint is charged to every
// customer sending through the same domain.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const nowISO = new Date().toISOString();
  const week = weekKey(nowISO);
  const who = await audience();
  const issue = buildIssue({ week, unsubscribeHref: "#preview-not-a-real-link" });

  return NextResponse.json({
    configured: newsletterConfigured(),
    week,
    audience: { count: who.recipients.length, skipped: who.skipped, note: who.note },
    issue: { subject: issue.subject, preheader: issue.preheader, links: issue.links, live: issue.live, dark: issue.dark, html: issue.html },
    doctrine: NEWSLETTER_DOCTRINE,
    note: "Nothing was sent. This is what the issue would say.",
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = typeof body.action === "string" ? body.action : "send";

  // Leaving lives at /api/unsubscribe, which is the only newsletter path the
  // human gate lets through unauthenticated. Keeping it off THIS route is what
  // stops that exemption reaching the endpoint that sends.
  if (action === "unsubscribe") {
    return NextResponse.json({ error: "Unsubscribe at /api/unsubscribe — this route sends." }, { status: 400 });
  }

  const cronOk = cronAuthorised(req).ok;
  const auth = cronOk ? null : await requireAuth(req);
  if (auth && !auth.ok) {
    return NextResponse.json({ error: "Unauthorised — call it as the scheduler or sign in." }, { status: auth.status });
  }

  if (!newsletterConfigured()) {
    return NextResponse.json({
      error: "Nothing was sent. Set NEWSLETTER_SECRET (at least 16 characters) and redeploy. Without a durable secret the unsubscribe link would verify on the server that minted it and fail on every other one — readers would press \"spam\" instead, and that complaint rate is charged to every customer sending through this domain.",
    }, { status: 503 });
  }

  // Marketing mail. A halt stops it, and nobody is locked out of anything by
  // missing a newsletter.
  const halt = await haltFor("send");
  if (halt.halted) return NextResponse.json({ error: halt.message }, { status: 409 });

  const nowISO = new Date().toISOString();
  const week = weekKey(nowISO);
  const who = await audience();

  let sent = 0;
  let skippedAlreadySent = 0;
  const failures: { email: string; detail: string }[] = [];

  for (const r of who.recipients) {
    if (await alreadySent(week, r.email)) { skippedAlreadySent += 1; continue; }
    const href = unsubscribeUrl(r.email);
    const issue = buildIssue({ week, recipientName: r.name, unsubscribeHref: href });

    // CLAIMED BEFORE THE SEND, so a crash mid-run cannot mail somebody twice on
    // the retry. The same shape the payout and publication ledgers use.
    await markSent(week, r.email, nowISO);

    const res = await sendEmail({
      to: r.email,
      subject: issue.subject,
      html: issue.html,
      listUnsubscribe: href,
      // Explicitly NOT transactional. It is marketing, and marking it otherwise
      // to dodge the emergency stop would be a lie with a compliance edge.
      transactional: false,
    });
    if (res.ok) sent += 1;
    else failures.push({ email: r.email, detail: res.detail });
  }

  auditRecord({
    actorType: cronOk ? "system" : "user",
    actor: cronOk ? "system:scheduler" : (auth && auth.ok ? auth.uid || "operator" : "operator"),
    action: "newsletter.sent",
    resource: "newsletter", resourceId: week,
    after: { week, sent: String(sent), audience: String(who.recipients.length), failed: String(failures.length) },
    nowISO,
  });

  return NextResponse.json({
    ok: true, week,
    sent, skippedAlreadySent,
    audience: who.recipients.length,
    skipped: who.skipped,
    failures: failures.slice(0, 20),
    note: who.recipients.length === 0
      ? who.note
      : `${sent} sent, ${skippedAlreadySent} already had this week's issue.${failures.length ? ` ${failures.length} could not be delivered.` : ""}`,
  });
}
