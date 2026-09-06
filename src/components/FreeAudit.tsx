"use client";

// The free audit, on the outside of the login.
//
// This is the organic acquisition machine, and it is one box and one button.
// A small business owner types their address, waits fifteen seconds, and reads
// three true things about their own website that nobody has told them before.
// Then — and only then — they are asked for an email.
//
// The order matters more than anything else on this page. Every version of this
// that asks first converts a fraction of the version that gives first, because
// the thing being asked for is trust and we have not earned any yet.

import { useState } from "react";
import { ArrowRight, CheckCircle2, Download, Loader2, Search, TriangleAlert } from "lucide-react";
import { track } from "@/frontend/analytics";
import { auditReportDocument, auditReportFilename } from "@/shared/audit-email";

type Finding = {
  area: string; label: string; severity: string; detail: string;
  /** What this costs them, in their words. Present on anything not passing. */
  costs?: string;
  /** What to change. */
  fix?: string;
  /** What MarketWar does about it — the honest bridge to signing up. */
  ours?: string;
};
type Report = {
  ok: boolean; error?: string; gated?: boolean;
  url?: string; score?: number; grade?: string; loadMs?: number; https?: boolean; title?: string;
  quotaReached?: boolean; quotaHeadline?: string; quotaCta?: string; quotaCtaHref?: string;
  areaScores?: {
    area: string; score: number | null; grade: string | null; measured: number; checks: number;
    failures: number; warnings: number; weightShare: number; coveragePct: number; worst: string; note: string;
  }[];
  findings?: Finding[]; heldBack?: number; unmeasured?: number; note?: string; recorded?: boolean;
  /** Every page this report is based on. Shown, because a claim about "your website" has to name what was read. */
  pagesRead?: string[]; pagesTried?: string[];
  /** Checks that are not a question about this kind of business. Never failures. */
  notApplicable?: { label: string; area: string; why: string }[];
  headline?: string; nextStep?: string; failures?: number; warnings?: number;
  /** Whether the copy's promise to email the report was actually kept. */
  emailed?: boolean; emailNote?: string; emailFailure?: string;
};

// THE SEVERITY COLOURS HAVE NEVER WORKED.
//
// This matched "critical", "high" and "medium". The crawler has only ever
// emitted "pass", "warn" and "fail" — so every finding fell through to the grey
// default and a broken page looked exactly like a healthy one. The icon had the
// same fault, testing for "good" against a value that is "pass", which is why a
// passing HTTPS check was shown under a warning triangle.
const sev = (s: string) =>
  s === "fail" ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-100"
    : s === "warn" ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-100"
      : "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-100";

/** The path a reader recognises, not the whole absolute URL. */
const pathOf = (u: string) => { try { return new URL(u).pathname.replace(/\/$/, "") || "/"; } catch { return u; } };

/**
 * `initialUrl` lets the landing page hand an address straight over.
 *
 * The hero used to show a PICTURE of a dashboard with invented revenue in it.
 * The strongest thing this platform owns is a product that runs before signup,
 * so the hero now takes the address itself and this page starts with it already
 * typed — one field, one journey, no retyping. It is not auto-run: a stranger
 * arriving from an ad has not agreed to us fetching their site, and a button
 * they press is a different thing from a page that acts on arrival.
 */
export default function FreeAudit({ initialUrl = "" }: { initialUrl?: string } = {}) {
  const [url, setUrl] = useState(initialUrl);
  const [email, setEmail] = useState("");
  // "…and nothing else UNTIL YOU SAY OTHERWISE" is the promise printed under
  // this form. This is where they say otherwise, and it is off by default —
  // a pre-ticked box is not consent under UK GDPR, and a platform whose whole
  // argument is that it does not fake things cannot fake an opt-in.
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  async function run(withEmail: boolean) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withEmail ? { url, email, optIn } : { url }),
      });

      // READ THE BODY AS TEXT FIRST, then try to parse it.
      //
      // THE DEFECT THIS REPLACES, reported from production: the audit stopped
      // working and every failure said "That did not run — try again." That
      // sentence is what is printed when `res.json()` throws AND the response
      // carried no `error` field — which is precisely the case where the route
      // did not answer at all: a platform 502/504, an HTML error page, a
      // function killed at its duration limit. The one situation where the
      // reason matters most was the one situation where it was discarded.
      //
      // The route's own refusals are already good — they name the host's 403,
      // the DNS failure, the private address. This only affects the case where
      // something ELSE answered, and there it now shows the status and the
      // first line of whatever came back, so the failure can be diagnosed from
      // a screenshot instead of guessed at.
      const raw = await res.text();
      let d: Record<string, unknown> = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }

      if (!res.ok) {
        const stated = typeof d.error === "string" ? d.error : "";
        if (stated) { setError(stated); return; }
        // Nothing readable came back. Say what DID come back — a status alone
        // is enough to tell a timeout from a block from a crash.
        const snippet = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        setError(
          res.status === 504 || res.status === 502
            ? `The audit did not finish in time (HTTP ${res.status}). Large or slow sites can exceed the limit — try again, and if it keeps happening tell us the address.`
            : res.status === 429
              ? "Too many requests in a short time. Wait a minute and try again."
              : `The audit could not run — the server answered HTTP ${res.status}${snippet ? ` and said: ${snippet}` : " with no readable message"}. Please tell us the address you used.`,
        );
        return;
      }
      setReport(d as Report);
      if (withEmail) setFull(true);
      // Fired on the RESULT, not the submit. A refused crawl is not an audit and
      // an address that failed validation is not a lead; counting either would
      // teach the ad platform to find people who cannot complete the form.
      // The score is a number, the grade a single letter — the URL and the
      // address are deliberately not passed, and would be dropped if they were.
      if ((d as Report).ok) {
        track(withEmail ? "audit_lead" : "audit_started", {
          score: typeof (d as Report).score === "number" ? (d as Report).score : undefined,
          grade: (d as Report).grade,
          // The SEO score as a scalar, because "which area is weak" is the one
          // thing worth knowing across many audits — and this call takes numbers
          // and letters only, never the URL, the address or a nested object.
          seoScore: (d as Report).areaScores?.find((a) => a.area === "SEO")?.score ?? undefined,
        });
      }
    } catch (e) {
      // The request never completed. Distinguish that from a server refusal —
      // "network error" and "the server said no" send somebody to different
      // places, and the previous message could mean either.
      setError(`Could not reach the audit service — ${e instanceof Error ? e.message : "the request did not complete"}. Check your connection and try again.`);
    } finally { setBusy(false); }
  }

  /**
   * Hand them the document, whether or not the email went.
   *
   * Built in the browser from the report already on screen — no round trip, no
   * second crawl, and it is the SAME renderer the email uses, so the file and
   * the message cannot drift into two different reports.
   */
  function downloadReport(r: Report) {
    const url = r.url || "";
    const doc = auditReportDocument({
      url,
      score: r.score ?? 0,
      grade: r.grade ?? "",
      findings: (r.findings ?? []).map((f) => ({
        area: f.area, label: f.label, detail: f.detail,
        severity: f.severity === "fail" || f.severity === "warn" ? f.severity : "pass",
      })),
      unmeasuredCount: r.unmeasured,
      title: r.title,
    });
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = auditReportFilename(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    track("audit_report_downloaded", { score: typeof r.score === "number" ? r.score : undefined, grade: r.grade });
  }

  return (
    <div className="not-prose">
      <form onSubmit={(e) => { e.preventDefault(); void run(false); }} className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5">
        <label className="block text-sm font-semibold text-white">Your website</label>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          We read the actual page, right now — no account, no card, nothing to install. Everything you get back was measured on your site in the last few seconds.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={url} onChange={(e) => setUrl(e.target.value)} required
            placeholder="yourbusiness.co.uk"
            className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
          />
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {busy ? "Reading your page…" : "Audit my site"}
          </button>
        </div>
        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200">{error}</p>}
      </form>

      {/* RUNNING OUT IS NOT AN ERROR — it is the free tier ending, and it is the
          single moment an interested person is most likely to pay. Rendering it
          in the same amber "something went wrong" box as a failed crawl would
          throw that away and read as a fault on our side. It gets its own
          treatment, the reason in plain words, and the way forward. */}
      {report && report.ok === false && report.quotaReached && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5">
          <p className="font-display text-base font-bold text-white">{report.quotaHeadline || "You have used your free audits"}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{report.error}</p>
          <a
            href={report.quotaCtaHref || "/pricing"}
            className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-ink-950 hover:bg-emerald-400"
          >
            {report.quotaCta || "See the plans"}
          </a>
        </div>
      )}

      {report && report.ok === false && !report.quotaReached && (
        <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm text-amber-100">{report.error}</p>
      )}

      {report && report.ok && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-ink-900/60 p-5">
            <div className="text-center">
              <p className="font-display text-4xl font-bold text-white">{report.score}<span className="text-lg text-slate-500">/100</span></p>
              <p className="text-xs font-bold text-emerald-300">Grade {report.grade}</p>
            </div>
            <div className="min-w-[200px] flex-1">
              <p className="text-sm font-semibold text-white">{report.title || report.url}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {report.https ? "HTTPS" : "No HTTPS"}{report.loadMs != null ? ` · answered in ${report.loadMs}ms` : ""}
              </p>
            </div>
          </div>

          {/* THE SCORE BY AREA. "How is my SEO?" is the question people arrive
              with, and one number for the whole site cannot answer it — a site
              can be 82 overall while its SEO is 55, and the 82 is exactly what
              stops somebody acting. Free, because gating the answer to the
              question that brought them here is what kept this tool from ever
              winning anybody.

              An area with nothing measured shows a dash, never a 0: zero reads
              as "you failed every SEO check" when the truth is "we could not
              read any of them", and those want opposite actions. */}
          {report.areaScores && report.areaScores.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-ink-900/40 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Your score, by area</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {report.areaScores.map((a) => {
                  const tone =
                    a.score == null ? "text-slate-500"
                      : a.score >= 75 ? "text-emerald-300"
                        : a.score >= 50 ? "text-amber-300"
                          : "text-rose-300";
                  return (
                    <div key={a.area} className="rounded-lg border border-white/5 bg-ink-950/40 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-slate-200">{a.area}</span>
                        <span className={`font-display text-lg font-bold ${tone}`}>
                          {a.score == null ? "—" : a.score}
                          {a.score != null && <span className="ml-0.5 text-[10px] font-normal text-slate-600">/100</span>}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        {a.score == null
                          ? "Nothing here could be read — an unknown, not a zero."
                          : a.failures || a.warnings
                            ? `${a.failures ? `${a.failures} failing` : ""}${a.failures && a.warnings ? ", " : ""}${a.warnings ? `${a.warnings} to improve` : ""}${a.worst ? ` · worst: ${a.worst}` : ""}`
                            : `All ${a.measured} checks pass.`}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Each area is scored by the same rule as the overall number, on its own checks only — so a
                weak area is visible even when the total looks healthy. A dash means nothing in that area
                could be read from the page, which is an unknown rather than a failure.
              </p>
            </div>
          )}

          {/* WHAT WAS READ, before anything is claimed about it.
              A live audit told a business with a working /contact page that
              there was "no obvious way to get in touch" — true of the homepage,
              false about them, and the kind of wrong that discredits every
              correct finding beside it. The audit follows the contact links
              now, and the report names the pages so nobody has to take its
              word for what it looked at. */}
          {report.pagesRead && report.pagesRead.length > 0 && (
            <p className="rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-300">
                Read {report.pagesRead.length === 1 ? "1 page" : `${report.pagesRead.length} pages`}:
              </span>{" "}
              {report.pagesRead.map((u) => pathOf(u)).join(", ")}
              {report.pagesTried && report.pagesTried.length > 0 && (
                <> · could not read {report.pagesTried.map((u) => pathOf(u)).join(", ")}</>
              )}
              . Everything below was measured on {report.pagesRead.length === 1 ? "it" : "these"} just now.
            </p>
          )}

          {/* THE VERDICT, before the list. Somebody who reads one line should
              get the answer to the question the page asked them. */}
          {report.headline && (
            <p className={`rounded-xl border p-4 text-sm font-semibold leading-relaxed ${report.failures ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-100" : report.warnings ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-100" : "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-100"}`}>
              {report.headline}
            </p>
          )}

          {report.findings?.map((f, i) => (
            <div key={i} className={`rounded-xl border p-4 ${sev(f.severity)}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {f.severity === "pass" ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />} {f.label}
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide opacity-70">{f.area}</span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed opacity-90">{f.detail}</p>
              {/* WHAT IT COSTS, then WHAT TO DO. A linter line tells somebody
                  nothing they can act on; this is the difference between a
                  report and a diagnosis. */}
              {f.costs && (
                <p className="mt-2.5 border-t border-current/15 pt-2.5 text-xs leading-relaxed opacity-95">
                  <span className="font-bold">What this costs you. </span>{f.costs}
                </p>
              )}
              {f.fix && (
                <p className="mt-1.5 text-xs leading-relaxed opacity-80">
                  <span className="font-bold">The fix. </span>{f.fix}
                </p>
              )}
              {f.ours && f.severity !== "pass" && (
                <p className="mt-1.5 text-xs leading-relaxed opacity-70">
                  <span className="font-bold">With MarketWar. </span>{f.ours}
                </p>
              )}
            </div>
          ))}

          {report.gated && !full && (
            <form onSubmit={(e) => { e.preventDefault(); void run(true); }} className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
              <p className="text-sm font-semibold text-white">
                {report.heldBack} more {report.heldBack === 1 ? "thing" : "things"} were measured on your page.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{report.note}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={email} onChange={(e) => setEmail(e.target.value)} required type="email"
                  placeholder="you@yourbusiness.co.uk"
                  className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
                />
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Show the rest
                </button>
              </div>
              {/* THE "UNLESS YOU SAY OTHERWISE" HALF, MADE REAL.
                  The line below has always promised the address would be used
                  for this report "and nothing else until you say otherwise" —
                  and there was nowhere to say otherwise. Every address was kept
                  and none of them could ever be written to, which is the worst
                  of both: the record exists and the permission does not.
                  Unticked by default, because a pre-ticked box is not consent. */}
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[12px] leading-relaxed text-slate-400">
                <input
                  type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
                />
                <span>Also send me occasional, practical things about getting found online. One click stops it, any time.</span>
              </label>
              {/* PROMISE ONLY WHAT THIS PAGE CONTROLS.
                  This used to open with "used to send you this report", so the
                  whole ask rested on an email arriving — and when the mail
                  server refused our password the page had to end by admitting
                  it, after the address had been handed over. Asking for
                  something on the strength of a promise we cannot keep from here
                  costs more trust than the lead is worth.

                  What is guaranteed is what is offered: the rest of the findings
                  render on this page the moment the address is accepted, and the
                  whole report downloads from the button below them. The emailed
                  copy is stated as an extra, and the line at the end of the
                  report says whether it actually went. */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                One address. The rest of the findings appear on this page immediately and the full report downloads with one click — no card, no trial to cancel. We will email you a copy as well, and tell you plainly if that does not go through.
              </p>
            </form>
          )}

          {/* WHAT WE DID NOT COUNT AGAINST YOU, AND WHY.
              An API company was told it was losing customers for having no
              shopfront phone number, in language about standing in the rain.
              Shown rather than silently dropped: a check that vanishes looks
              like a check we forgot, and the reason is the part that proves
              the report understood who it was reading. */}
          {report.notApplicable && report.notApplicable.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
              <p className="text-xs font-semibold text-slate-300">
                {report.notApplicable.length} {report.notApplicable.length === 1 ? "check does" : "checks do"} not apply to you
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{report.notApplicable[0].why}</p>
              <p className="mt-1.5 text-xs text-slate-400">
                {report.notApplicable.map((f) => f.label).join(", ")} — counted neither for nor against you.
              </p>
            </div>
          )}

          {/* WHAT TO DO NEXT. It names the alternative — take the list to your
              own developer — because a report that pretends there is no
              alternative is a report nobody believes. */}
          {report.nextStep && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
              <p className="text-sm font-semibold text-white">So what do you do about it?</p>
              <p className="mt-1.5 text-xs leading-relaxed text-emerald-100/90">{report.nextStep}</p>
              <a href="/signup" onClick={() => track("audit_cta_signup")} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400">
                <ArrowRight className="h-4 w-4" /> Start free — no card
              </a>
            </div>
          )}

          {full && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-xs leading-relaxed text-emerald-100">
              <p>
                That is the whole audit — every check we could measure on your page. Nothing above is an estimate or an industry average.
                {/* SAY WHICH IT WAS, AND WHY.
                    The route has always returned the reason and this line always
                    threw it away, so "never send any emails" could not be told
                    apart from "no mail server configured", "the server refused the
                    password" and "that address is suppressed" — three problems
                    with three different fixes. The reason travels now. */}
                {report.emailed
                  ? " A copy is on its way to your inbox as well, so you do not have to keep this page open."
                  : ` The emailed copy did not go out${report.emailNote ? ` — ${report.emailNote}` : ""}. That is our problem to fix, not yours to work around: take the report with you below.`}
              </p>
              {/* THE DOCUMENT, NOT AN INSTRUCTION TO COPY THE PAGE BY HAND.
                  Offered whether or not the email went — an inbox copy that did
                  arrive is still an inbox copy, and somebody who wants the file
                  should not have to have working email to get it. It is built
                  from the report already on screen, by the same renderer the
                  email uses. */}
              <button
                type="button" onClick={() => downloadReport(report)}
                className={`mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold ${report.emailed ? "border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10" : "bg-emerald-500 text-ink-950 hover:bg-emerald-400"}`}
              >
                <Download className="h-4 w-4" /> Download the full report
              </button>
              <span className="ml-2 text-[11px] text-emerald-100/70">Opens in your browser · print or save as PDF.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
