import { NextRequest, NextResponse } from "next/server";
import { crawlSite } from "@/backend/crawler";
import { addProspect, recordAttempt, setStage } from "@/backend/acquisition";
import { rateLimit, clientKey } from "@/backend/guard";
import { isDisposableEmail } from "@/backend/human-check";
import { publicSendFailure, sendFailureOf, operatorFix } from "@/shared/send-failure";

// THE FREE AUDIT — the front door for organic acquisition.
//
// The owner's question: what can be done ORGANICALLY to see customer
// acquisition. This is the answer, and it is not another engine.
//
// MarketWar's single best asset for winning a small business owner is a real,
// measured audit of their actual website — their numbers, their page, their
// problems, in ninety seconds. It has existed since SiteRaid shipped and it has
// been BEHIND A SIGNUP the whole time, which means it has never won anybody.
// The entire category of tool that grows organically — Website Grader, the free
// checkers every SEO company runs — works because the valuable thing is on the
// OUTSIDE of the login. Ours was on the inside.
//
// POST { url }                → the real crawl, the score, the first findings. No signup.
// POST { url, email, name? }  → the full report, and the lead is recorded.
//
// WHY THIS IS THE ORGANIC MACHINE:
//   • It is the page search traffic can land on, because it needs no account.
//   • It gives something true and specific before asking for anything.
//   • Every completed audit creates a REAL named prospect in the acquisition
//     run — somebody who typed their own website in, which is the warmest
//     inbound signal a marketing tool can get.
//   • It costs nothing to run: the crawl is a fetch and a parse, no AI, no
//     provider, no key. It works on the deployment as it stands today.
//
// NOT METERED, and it never will be. A free audit that debits a wallet is not
// free, and the visitor does not have a wallet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** The platform's own pipeline. Inbound leads for MarketWar land here. */
const PLATFORM_BRAND = "marketwar_platform";

/** How much is given away before anything is asked for. */
const FREE_FINDINGS = 3;

export async function POST(req: NextRequest) {
  // Tighter than the signed-in routes: this is public and it makes an outbound
  // fetch on behalf of whoever calls it, so it is the one endpoint that could be
  // pointed at somebody else's server in volume.
  const rl = rateLimit(clientKey(req, "public-audit"), 12, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "A few too many audits from here — try again in a minute." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid submission" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const url = str("url");
  if (!url) return NextResponse.json({ error: "Put your website address in and we will read the actual page." }, { status: 400 });

  const report = await crawlSite(url);
  if (!report.ok) {
    return NextResponse.json({ ok: false, error: report.error || "That page could not be read.", block: report.block }, { status: 200 });
  }

  // Worst first — the visitor should see the thing that is costing them most,
  // not the first check that happened to run.
  const ranked = [...report.findings].sort((a, b) => b.weight - a.weight);
  const measured = ranked.filter((f) => f.measured !== false);
  const email = str("email").toLowerCase();

  // No email: give the score and the first three properly, and say exactly how
  // many are being held back rather than implying there are hundreds.
  if (!email) {
    return NextResponse.json({
      ok: true,
      gated: measured.length > FREE_FINDINGS,
      url: report.finalUrl || report.url,
      score: report.score,
      grade: report.grade,
      loadMs: report.loadMs,
      https: report.https,
      title: report.title,
      findings: measured.slice(0, FREE_FINDINGS),
      heldBack: Math.max(0, measured.length - FREE_FINDINGS),
      unmeasured: ranked.filter((f) => f.measured === false).length,
      note: measured.length > FREE_FINDINGS
        ? `${measured.length} things were measured on this page. Three are above; the other ${measured.length - FREE_FINDINGS} come with the written report.`
        : "That is everything measured on this page — there is nothing else being held back.",
      charged: false,
    });
  }

  if (isDisposableEmail(email)) {
    return NextResponse.json({ error: "That is a throwaway mailbox, and the report is worth having somewhere you can read it. Use an address you actually check." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
    return NextResponse.json({ error: "That address does not look right — check it and try again." }, { status: 400 });
  }

  // A person typed their own website into a stranger's audit tool and then gave
  // an address to receive the answer. That is the warmest inbound signal this
  // business can get, and until now there was nowhere for it to go.
  const name = str("name") || (report.title ? report.title.slice(0, 80) : url);
  let recorded = false;
  try {
    const host = new URL(report.finalUrl || report.url).hostname.replace(/^www\./, "");
    const added = await addProspect({
      brandId: PLATFORM_BRAND, targetId: "marketwar",
      name: `${name} (${host})`,
      contact: email,
      where: report.finalUrl || report.url,
      // The lawful basis, written where it is created rather than assumed:
      // they asked for this, on our page, in their own words.
      source: `Ran the free audit on ${host} and asked for the full report`,
      nowISO: new Date().toISOString(),
    });
    if (added.ok) {
      // Inbound is not "contacted" — WE have not said anything yet. It is
      // recorded as their message to us, which is what it is.
      await recordAttempt({
        id: added.prospect.id, channel: "inbound",
        message: `Requested the full audit for ${host}. Score ${report.score}/100 (${report.grade}). Top issue: ${measured[0]?.label || "none measured"}.`,
        by: "audit-page", nowISO: new Date().toISOString(),
      });
      await setStage({ id: added.prospect.id, stage: "replied", reply: `Asked for the audit of ${host}`, nowISO: new Date().toISOString() });
      recorded = true;
    }
  } catch { /* a failed record must never cost the visitor their report */ }

  // AND ACTUALLY SEND IT.
  //
  // The form says "One address, used to send you this report". Recording the
  // prospect and rendering the findings on the page satisfied us and not them:
  // the visitor was told something would arrive, and nothing ever did. It is
  // sent here, and whether it went is reported back rather than assumed — with
  // no sending server the send is refused, and saying "check your inbox" then
  // would be the same broken promise with extra steps.
  let emailed = false;
  let emailNote = "";
  let emailFailure = "";
  try {
    const { sendEmail } = await import("@/backend/email");
    const { auditEmailHtml, auditEmailSubject } = await import("@/shared/audit-email");
    const finalUrl = report.finalUrl || report.url;
    const sent = await sendEmail({
      to: email,
      subject: auditEmailSubject({ url: finalUrl, score: report.score }),
      html: auditEmailHtml({
        url: finalUrl,
        score: report.score,
        grade: report.grade,
        findings: measured.map((f) => ({ area: f.area, label: f.label, severity: f.severity, detail: f.detail })),
        unmeasuredCount: ranked.filter((f) => f.measured === false).length,
        title: report.title,
      }),
      // They asked for this specific document, one time. That is transactional,
      // and it must not be stoppable by a marketing halt — a stranger left
      // holding nothing is exactly the reputational damage the stop exists to
      // avoid causing.
      transactional: true,
    });
    emailed = sent.ok;
    if (!sent.ok) {
      // The CATEGORY travels, so the page can say which of three different
      // problems it was instead of "we could not email you a copy just now".
      // The raw server line stays here and in the log — a member of the public
      // has no use for an SMTP rejection carrying our host and account name.
      emailFailure = sendFailureOf(sent.failure);
      emailNote = publicSendFailure(sent.failure);
      console.warn(`[audit] send failed (${emailFailure}) for ${finalUrl}: ${sent.detail} — ${operatorFix(sent.failure)}`);
    }
  } catch (e) {
    emailFailure = "unknown";
    emailNote = publicSendFailure("unknown");
    console.warn(`[audit] send threw for ${report.finalUrl || report.url}: ${e instanceof Error ? e.message : String(e)}`);
  }

  return NextResponse.json({
    ok: true,
    gated: false,
    // Whether the promise on the form was kept. The page reads this instead of
    // telling everybody to check an inbox nothing was sent to.
    emailed,
    emailFailure,
    emailNote,
    url: report.finalUrl || report.url,
    score: report.score,
    grade: report.grade,
    loadMs: report.loadMs,
    https: report.https,
    title: report.title,
    metaDescription: report.metaDescription,
    wordCount: report.wordCount,
    imagesNoAlt: report.imagesNoAlt,
    robotsTxt: report.robotsTxt,
    sitemapXml: report.sitemapXml,
    structuredDataTypes: report.structuredDataTypes,
    findings: measured,
    unmeasuredFindings: ranked.filter((f) => f.measured === false),
    recorded,
    note: "Everything above was measured on your page just now — nothing is estimated and nothing is an industry average. The checks we could not read from the response are listed separately rather than counted against you.",
    charged: false,
  });
}
