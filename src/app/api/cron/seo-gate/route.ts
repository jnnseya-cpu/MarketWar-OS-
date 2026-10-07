import { NextRequest, NextResponse } from "next/server";
import { cronAuthorised } from "@/backend/guard";
import { sweepPublished, MIN_SCORE } from "@/backend/blog-seo-gate";

// RE-SCORE EVERY PUBLISHED ARTICLE, and hold anything that has fallen below the
// bar.
//
// The publication gate stops a bad article going out. This stops a good one
// going bad — and that is the case that actually happened: the three articles
// found at 75 had correct titles when they were written, and only became wrong
// when a suffix was appended to all of them at once. No publication step would
// ever have seen that.
//
// Scheduler-authorised only: it unpublishes, so an anonymous caller must never
// reach it. `cronAuthorised` fails closed when CRON_SECRET is unset rather than
// treating an unconfigured deployment as an open one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Crawling every article is slower than a page render.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = cronAuthorised(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 });

  const result = await sweepPublished();

  // AND WHILE WE ARE HERE, CHECK WHAT GOOGLE IS BEING TOLD TWICE.
  //
  // Search Console emailed "Blocked by robots.txt" and named no URLs, because
  // the Coverage report has never had an API. The fix was one thing; making sure
  // it cannot come back quietly is another, and it cannot be done by a person
  // remembering to open a console. This runs daily on our own origin: it reads
  // the robots.txt the deployment publishes, walks the pages the sitemap offers,
  // and reports every URL that is linked from an indexable page and refused by
  // robots. Silent when there is nothing to say.
  let indexability: unknown = null;
  try {
    const { auditIndexability } = await import("@/backend/indexability");
    const { siteOrigin } = await import("@/shared/site");
    const report = await auditIndexability({ origin: siteOrigin(), maxPages: 60, budgetMs: 120_000 });
    indexability = {
      findings: report.findings.length, reportable: report.reportable,
      pagesRead: report.pagesRead, partial: report.partial, note: report.note,
      faults: report.findings.map((f) => ({ fault: f.fault, path: f.path, rule: f.rule, remedy: f.remedy })),
    };

    // TOLD, NOT LOGGED. A finding in a cron response that nobody reads is the
    // same defect as a console nobody opens. The owner's own address is the one
    // already on record as a platform admin.
    if (report.findings.length > 0) {
      const to = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean)[0];
      if (to) {
        const { sendEmail } = await import("@/backend/email");
        const rows = report.findings
          .map((f) => `<li><strong>${f.path}</strong> — ${f.fault.replace(/_/g, " ")}. ${f.remedy}</li>`)
          .join("");
        await sendEmail({
          to,
          subject: `${report.findings.length} page(s) on marketwaros.com are being told two different things`,
          html: `<p>${report.note}</p><ul>${rows}</ul>`
            + `<p>This is the check that answers Search Console's "Blocked by robots.txt" without opening Search Console. `
            + `Nothing was changed automatically.</p>`,
          transactional: true,
        }).catch(() => null);
      }
    }
  } catch (e) {
    // The article sweep is this route's job; the audit is an addition and must
    // never take it down. Reported as unknown rather than as clean.
    indexability = { error: (e as Error).message, note: "The indexability audit did not complete, so nothing is known about it this run." };
  }

  return NextResponse.json({ ok: true, bar: MIN_SCORE, ...result, indexability });
}

// Vercel Cron issues GET. Same authorisation.
export async function GET(req: NextRequest) {
  return POST(req);
}
