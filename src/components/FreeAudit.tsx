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
import { ArrowRight, CheckCircle2, Loader2, Search, TriangleAlert } from "lucide-react";
import { track } from "@/frontend/analytics";

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

export default function FreeAudit() {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  async function run(withEmail: boolean) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withEmail ? { url, email } : { url }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "That did not run — try again."); return; }
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
        });
      }
    } catch { setError("Network error — try again."); } finally { setBusy(false); }
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

      {report && report.ok === false && (
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
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                One address, used to send you this report and nothing else until you say otherwise. No card, no trial to cancel, and the rest of the findings appear on this page immediately.
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
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-xs leading-relaxed text-emerald-100">
              That is the whole audit — every check we could measure on your page. Nothing above is an estimate or an industry average.
              {/* SAY WHICH IT WAS. Telling everybody to check their inbox is how
                  the promise got broken silently in the first place. */}
              {/* SAY WHICH IT WAS, AND WHY.
                  The route has always returned the reason and this line always
                  threw it away, so "never send any emails" could not be told
                  apart from "no mail server configured", "the server refused the
                  password" and "that address is suppressed" — three problems
                  with three different fixes. The reason travels now. */}
              {report.emailed
                ? " A copy is on its way to your inbox as well, so you do not have to keep this page open."
                : ` It is all on this page — copy it before you close the tab${report.emailNote ? `, because ${report.emailNote}` : ", because we could not email you a copy just now"}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
