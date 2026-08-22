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

type Finding = { area: string; label: string; severity: string; detail: string };
type Report = {
  ok: boolean; error?: string; gated?: boolean;
  url?: string; score?: number; grade?: string; loadMs?: number; https?: boolean; title?: string;
  findings?: Finding[]; heldBack?: number; unmeasured?: number; note?: string; recorded?: boolean;
  /** Whether the copy's promise to email the report was actually kept. */
  emailed?: boolean; emailNote?: string;
};

const sev = (s: string) =>
  s === "critical" || s === "high" ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-200"
    : s === "medium" ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-100"
      : "border-white/10 bg-ink-900/50 text-slate-300";

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

          {report.findings?.map((f, i) => (
            <div key={i} className={`rounded-xl border p-4 ${sev(f.severity)}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {f.severity === "good" ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />} {f.label}
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide opacity-70">{f.area}</span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed opacity-90">{f.detail}</p>
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

          {full && (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-xs leading-relaxed text-emerald-100">
              That is the whole audit — every check we could measure on your page. Nothing above is an estimate or an industry average.
              {/* SAY WHICH IT WAS. Telling everybody to check their inbox is how
                  the promise got broken silently in the first place. */}
              {report.emailed
                ? " A copy is on its way to your inbox as well, so you do not have to keep this page open."
                : " It is all on this page — copy it before you close the tab, because we could not email you a copy just now."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
