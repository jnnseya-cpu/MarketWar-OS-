import { NextRequest, NextResponse } from "next/server";
import { crawlSite } from "@/backend/crawler";
// `acquisition` is LOADED ON USE, not imported here — see the call site below.
// It reaches firebase-admin, and a public route that reads somebody's website
// should not pay the Admin SDK's cold start, nor risk a module-level failure
// inside it becoming a 500 before any handler code runs. A throw at module load
// is one no try/catch in this file can catch, and it is the exact shape this
// route was reported with from production.
// THE LIGHT LIMITER, NOT THE ONE BEHIND THE ADMIN SDK.
//
// `@/backend/guard` re-exports `rateLimit`, and importing it from there pulls
// firebase-admin, gRPC and protobufjs into the module graph of a PUBLIC route
// that never authenticates anybody. That is the exact cost `backend/rate-limit`
// was split out to avoid.
//
// It is also a candidate for the production 500 this route was reported with:
// a module-level failure inside the Admin SDK is thrown while the route module
// is being loaded, which no try/catch inside the handler can catch, and which
// Next answers with its own 500 page — the symptom exactly as reported.
import { rateLimit, clientKey } from "@/backend/rate-limit";
import { isDisposableEmail } from "@/backend/human-check";
import { publicSendFailure, sendFailureOf, operatorFix } from "@/shared/send-failure";
import { copyFor, auditHeadline, auditNextStep } from "@/shared/audit-copy";

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

/**
 * NOTHING FROM THIS ROUTE MAY EVER BE A 500.
 *
 * This is the platform's main lead-capture surface: a stranger's first contact,
 * on a page that promises to read their site "right now". A Next error page
 * there costs a lead and tells nobody anything — which is what was reported
 * from production, twice.
 *
 * The crawl was wrapped first, because it is the hostile input. That was not
 * enough: the scoring, ranking and dressing of the findings below it run on
 * whatever the crawl returned, and an unusual site is exactly the shape that
 * produces an unusual report. So the whole handler is wrapped, and the failure
 * is logged WITH THE ADDRESS — the one fact needed to reproduce it.
 *
 * A wrapper is not an excuse to stop finding root causes. It is the floor under
 * the ones not found yet, on the one endpoint where a stranger is watching.
 */
export async function POST(req: NextRequest) {
  try {
    return await handleAudit(req);
  } catch (e) {
    const why = e instanceof Error ? `${e.message}` : "unknown error";
    let where = "";
    try { where = String(((await req.clone().json()) as { url?: unknown }).url ?? ""); } catch { where = "(body unreadable)"; }
    console.error(`[audit] handler threw for ${where}: ${why}`);
    return NextResponse.json({
      ok: false,
      error: "Something on our side broke while building your report. That is our bug, not your site's — it has been logged with the address you gave, and we will fix it.",
      block: null,
    }, { status: 200 });
  }
}

/** The caller's address, as the edge saw it. First hop only — the rest is forgeable. */
function ipOf(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "";
}

/**
 * Who is asking, if anybody, and are they paying?
 *
 * A stranger has neither, which is the ordinary case for this route and is not a
 * failure. Everything is loaded on use and wrapped, because both paths reach
 * firebase-admin and this route must never carry it in its static graph.
 */
async function callerFor(req: NextRequest): Promise<{ accountId: string | null; paid: boolean }> {
  if (!(req.headers.get("authorization") || "").startsWith("Bearer ")) return { accountId: null, paid: false };
  try {
    const { requireAuth } = await import("@/backend/guard");
    const auth = await requireAuth(req);
    if (!auth.ok || !auth.uid) return { accountId: null, paid: false };
    try {
      const { entitlementFor } = await import("@/backend/entitlement");
      const ent = await entitlementFor(auth.uid);
      // Paying means an ACTIVE subscription on a plan that is not the free one.
      // `active` alone is true of a free account, and a lapsed payment inside its
      // grace window is still paying — that is what `entitlementOf` decides, and
      // this route does not get a second opinion about it.
      return { accountId: auth.uid, paid: Boolean(ent.active && ent.planId !== "free") };
    } catch {
      // Signed in, entitlement unreadable: treat as unpaid but ATTRIBUTED. The
      // account id is the fairer counter anyway — a shared office address is not.
      return { accountId: auth.uid, paid: false };
    }
  } catch {
    return { accountId: null, paid: false };
  }
}

async function handleAudit(req: NextRequest) {
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
  // A BOUND ON THE INPUT, because this is a public endpoint that makes an
  // outbound request out of whatever it is given. Found by fuzzing this route: a
  // ten-million-character `url` passed every check above and was carried all the
  // way into a real fetch attempt, on an unauthenticated path, for the cost of
  // one request. The longest URL any browser will follow is well under 2,048
  // characters, so nothing legitimate is refused here.
  const nowISO = new Date().toISOString();
  const MAX_URL_CHARS = 2_048;
  if (url.length > MAX_URL_CHARS) {
    return NextResponse.json({ error: "That address is far longer than any real web address — check it and try again." }, { status: 400 });
  }

  // WHO IS ASKING, AND HAVE THEY HAD THEIR FREE AUDITS?
  //
  // Owner directive: the free audit is for a person checking their own site, not
  // for companies running it as a service. Ten looks at one address, three
  // websites, fifteen in total, per ninety days — unlimited on a paid plan.
  // The numbers live in `shared/audit-quota.ts`; nothing here re-states them.
  //
  // LOADED ON USE, like `acquisition` below and for the same reason: this module
  // reaches firebase-admin, and a public route that reads somebody's website
  // must not carry the Admin SDK in its static graph. A module-level failure
  // there is an uncatchable 500 on the platform's front door, which is exactly
  // the defect this route was reported with.
  //
  // CHECKED BEFORE THE CRAWL, so a refused visitor does not cost us a fetch —
  // and RECORDED AFTER a real report, so a site that blocks our crawler never
  // spends somebody's allowance on nothing.
  let quota: { allowed: boolean; refusal?: { headline: string; detail: string; cta: string }; paid: boolean; remaining?: number } = { allowed: true, paid: false };
  try {
    const [{ checkAuditQuota }, { quotaRefusalCopy }] = await Promise.all([
      import("@/backend/audit-quota"),
      import("@/shared/audit-quota"),
    ]);
    const who = await callerFor(req);
    const verdict = await checkAuditQuota({ url, ip: ipOf(req), accountId: who.accountId, paid: who.paid, nowISO });
    quota = {
      allowed: verdict.allowed,
      paid: Boolean(verdict.unlimited),
      remaining: verdict.allowed ? (verdict as { remainingForSite?: number }).remainingForSite : 0,
      ...(verdict.allowed ? {} : { refusal: quotaRefusalCopy(verdict) }),
    };
  } catch (e) {
    // The quota could not be evaluated. ALLOW — see `audit-quota.ts`: closing
    // the acquisition front door because a counter is unavailable costs more
    // than the handful of free crawls it would save.
    console.error(`[audit] quota check failed, allowing: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!quota.allowed && quota.refusal) {
    // 200, not 429. This is not a rate limit and it is not an error — it is the
    // free tier ending, which is a SALES MOMENT and the one point at which an
    // interested person is most likely to pay. It renders as a message, not a
    // failure, and it names what to do about it.
    return NextResponse.json({
      ok: false,
      quotaReached: true,
      error: quota.refusal.detail,
      // Deliberately NOT `headline`/`cta`: `headline` already means the audit's
      // own summary line ("2 things are costing you enquiries") on a successful
      // report. One field with two meanings is a defect waiting for whoever
      // renders it next.
      quotaHeadline: quota.refusal.headline,
      quotaCta: quota.refusal.cta,
      quotaCtaHref: "/pricing",
      block: null,
    }, { status: 200 });
  }

  // THE CRAWL IS WRAPPED. It reads an arbitrary third-party site, which is the
  // most hostile input this platform accepts, and it was the ONE await in this
  // handler with nothing around it — the prospect record and the email below
  // were both already guarded.
  //
  // REPORTED FROM PRODUCTION: `/api/audit` answered HTTP 500 with Next's own
  // error page. `crawlSite` returns a failure REPORT for the cases it
  // anticipates — a 403, a DNS failure, a private address — and those were
  // handled. Anything it did not anticipate threw instead, escaped the handler,
  // and became a 500 on the platform's main lead-capture surface. A visitor saw
  // a generic failure, no lead was recorded, and nothing on our side said which
  // address caused it.
  //
  // A crawler cannot enumerate what the web will do to it. So the unanticipated
  // case is caught, reported to the visitor in the same shape as every
  // anticipated one, and LOGGED WITH THE URL — that is the single fact needed to
  // reproduce it, and without it a report like the one that found this is
  // unactionable.
  let report;
  try {
    report = await crawlSite(url);
  } catch (e) {
    const why = e instanceof Error ? e.message : "unknown error";
    console.error(`[audit] crawl threw for ${url}: ${why}`);
    return NextResponse.json({
      ok: false,
      error: "We could not read that page — something about it broke our reader rather than simply refusing us. That is our bug, not your site's. It has been logged and we will fix it.",
      block: null,
    }, { status: 200 });
  }

  if (!report.ok) {
    return NextResponse.json({ ok: false, error: report.error || "That page could not be read.", block: report.block }, { status: 200 });
  }

  // WORST FIRST, AND "WORST" MEANS BROKEN — not heavy.
  //
  // This sorted on weight alone, so the three findings shown free were whatever
  // carried the most points regardless of whether they passed. On a decent site
  // that meant a visitor was shown "Served over HTTPS", "Title present" and
  // "Mobile viewport set" — three things that are FINE — and then asked for
  // their email to see the rest. Nobody trades an address for good news about
  // their own website, and they should not have to: the whole promise on the
  // page is that we will tell them what is quietly losing them enquiries.
  //
  // Severity first, then weight. A failure always outranks a pass.
  const rank = (s: string) => (s === "fail" ? 0 : s === "warn" ? 1 : 2);
  const ranked = [...report.findings].sort((a, b) => rank(a.severity) - rank(b.severity) || b.weight - a.weight);
  // WHAT COUNTS, and two separate reasons for what does not.
  //
  // `measured: false` — we could not read it from the response.
  // `applicable: false` — it is not a question about this kind of business.
  //
  // An API company was told it was losing customers for having no shopfront
  // phone number, in language about standing in the rain. Both exclusions are
  // reported, separately, because telling somebody "we could not read this"
  // when the truth is "this does not apply to you" is the same wrong
  // explanation in a friendlier voice.
  const measured = ranked.filter((f) => f.measured !== false && f.applicable !== false);
  const notApplicable = ranked.filter((f) => f.applicable === false);

  // WHAT EACH FINDING COSTS, in the reader's language rather than a linter's.
  // A finding with no copy carries its technical detail alone — silence is
  // better than a wrong explanation, and a check added tomorrow still renders.
  const dress = (f: (typeof measured)[number]) => {
    const c = copyFor(f.label);
    return c && f.severity !== "pass"
      ? { ...f, costs: c.costs, fix: c.fix, ours: c.ours }
      : c
        ? { ...f, fix: c.fix, ours: c.ours }
        : f;
  };

  const failures = measured.filter((f) => f.severity === "fail").length;
  const warnings = measured.filter((f) => f.severity === "warn").length;
  const worst = measured.find((f) => f.severity !== "pass")?.label;
  const headline = auditHeadline({ failures, warnings, worst, score: report.score });

  const email = str("email").toLowerCase();

  // ONE COMPLETED AUDIT, RECORDED ONCE. Placed here — after the crawl succeeded
  // and before either response is built — so both the free view and the emailed
  // report count exactly the same, and a refused crawl counts for nothing.
  // Never awaited into the response: a failure to record is a free audit
  // somebody got for nothing, which is the safe direction, and must not cost
  // them the report they already have.
  if (!quota.paid) {
    void (async () => {
      try {
        const { recordAuditUse } = await import("@/backend/audit-quota");
        const who = await callerFor(req);
        await recordAuditUse({ url: report.finalUrl || report.url, ip: ipOf(req), accountId: who.accountId, paid: who.paid, nowISO });
      } catch (e) {
        console.error(`[audit] could not record the use: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }

  // No email: give the score and the first three properly, and say exactly how
  // many are being held back rather than implying there are hundreds.
  if (!email) {
    return NextResponse.json({
      ok: true,
      gated: measured.length > FREE_FINDINGS,
      url: report.finalUrl || report.url,
      score: report.score,
      grade: report.grade,
      // THE SCORE BY AREA, GIVEN AWAY FREE. "How is my SEO?" is the question
      // people arrive with, and the six numbers are the most persuasive thing on
      // the page — a visitor who sees SEO 55 against Technical 90 knows exactly
      // what to fix, and that is what makes the report worth an address.
      // Holding it back would gate the answer to the question that brought them.
      areaScores: report.areaScores,
      loadMs: report.loadMs,
      https: report.https,
      title: report.title,
      findings: measured.slice(0, FREE_FINDINGS).map(dress),
      headline,
      failures,
      warnings,
      nextStep: auditNextStep({ failures, warnings, free: true }),
      // WHAT THIS REPORT IS BASED ON. A finding that says "no way to get in
      // touch" is only believable beside the list of pages that were looked at.
      pagesRead: report.pagesRead,
      pagesTried: report.pagesTried,
      notApplicable: notApplicable.map((f) => ({ label: f.label, area: f.area, why: f.notApplicable || "" })),
      heldBack: Math.max(0, measured.length - FREE_FINDINGS),
      unmeasured: ranked.filter((f) => f.measured === false).length,
      note: measured.length > FREE_FINDINGS
        ? `${measured.length} things were measured on this page. The ${FREE_FINDINGS} that matter most are above; the other ${measured.length - FREE_FINDINGS} come with the written report.`
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
    const { addProspect, recordAttempt, setStage } = await import("@/backend/acquisition");
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
    // A THROW IS NOT AN UNKNOWN FAILURE — it is a known one, and this branch
    // used to discard the only evidence of it.
    //
    // `sendEmail` returns a classified `failure` on every one of its `ok: false`
    // paths, so reaching here means the sending path never got far enough to
    // classify anything: the dynamic import failed, or something threw inside
    // it. Reporting that as `unknown` produced "the send did not complete" —
    // true, useless, and indistinguishable from a mail server timing out. The
    // owner read that sentence with every setting correctly in place and had no
    // way to learn that the mail settings were not the problem.
    emailFailure = "crashed";
    emailNote = publicSendFailure("crashed");
    console.error(`[audit] send threw for ${report.finalUrl || report.url}: ${e instanceof Error ? e.message : String(e)} — ${operatorFix("crashed")}`);
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
    areaScores: report.areaScores,
    loadMs: report.loadMs,
    https: report.https,
    title: report.title,
    metaDescription: report.metaDescription,
    wordCount: report.wordCount,
    imagesNoAlt: report.imagesNoAlt,
    robotsTxt: report.robotsTxt,
    sitemapXml: report.sitemapXml,
    structuredDataTypes: report.structuredDataTypes,
    findings: measured.map(dress),
    notApplicable: notApplicable.map((f) => ({ label: f.label, area: f.area, why: f.notApplicable || "" })),
    pagesRead: report.pagesRead,
    pagesTried: report.pagesTried,
    headline,
    failures,
    warnings,
    nextStep: auditNextStep({ failures, warnings, free: false }),
    unmeasuredFindings: ranked.filter((f) => f.measured === false),
    recorded,
    note: "Everything above was measured on your page just now — nothing is estimated and nothing is an industry average. The checks we could not read from the response are listed separately rather than counted against you.",
    charged: false,
  });
}
