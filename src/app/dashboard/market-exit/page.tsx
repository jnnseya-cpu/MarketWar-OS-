"use client";

// MARKET EXIT CAPTURE — the tool.
//
// WHAT THIS PAGE USED TO BE. The engine's doctrine rendered against a hardcoded
// Kingsway Plumbing, a hardcoded Northgate Heating and hardcoded source rows.
// Every rule on it was real and every value was fake, and there was no box to
// type a company into.
//
// WHAT IT IS NOW. Type a company name. It reads the company register, that
// company's own pages and the press, and shows every source — including the
// ones that found nothing and the ones that could not run — and then what the
// evidence rule made of it.
//
// THE REFUSAL IS THE PRODUCT, AND IT IS RENDERED AS PROMINENTLY AS A FINDING.
// Most of the time the honest answer about a business is "no evidence it has
// closed", and a screen that only lights up for a hit teaches its user that the
// tool is broken when it is working. So an UNVERIFIED result gets the same
// space, the same evidence panel and the same explanation as a published one —
// the difference is the verdict, not the amount of detail.

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Pill } from "@/components/ui";
import {
  AlertTriangle, Ban, Building2, CheckCircle2, FileSearch, Gavel, Loader2,
  Search, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { useActiveBrand } from "@/frontend/brand-context";
import {
  MATCH_WEIGHTS, MANDATORY_CONTROLS, REQUIRED_DISCLOSURE,
  PUBLISH_CONFIDENCE_FLOOR, CLOSURE_SOURCES,
  type ClosureAssessment, type WeighedSignal,
} from "@/shared/market-exit";

type DetectionSource = { id: string; checked: boolean; outcome: string; evidenceUrl?: string };
type Detection = { company: string; website?: string; signals: unknown[]; sources: DetectionSource[]; note: string };
type DetectResponse = {
  detection: Detection;
  assessment: ClosureAssessment;
  businessId: string;
  balanceAcu?: number;
};

const tierTone = (t: string) =>
  t === "official" ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
  : t === "operator" ? "border-sky-500/30 bg-sky-500/[0.06] text-sky-300"
  : t === "observed" ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
  : "border-rose-500/30 bg-rose-500/[0.06] text-rose-300";

function Verdict({ a }: { a: ClosureAssessment }) {
  const good = a.publishable;
  return (
    <div className={`rounded-xl border p-4 ${good ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-white/10 bg-ink-900/50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {good ? <ShieldAlert className="h-4 w-4 text-emerald-400" /> : <ShieldCheck className="h-4 w-4 text-slate-400" />}
        <span className="font-display text-sm font-bold text-white">{a.status.replace(/_/g, " ")}</span>
        <Pill>{a.confidenceScore} confidence</Pill>
        {a.humanReviewRequired && <Pill>Needs a person</Pill>}
        {!good && <Pill>Nothing may be built on this</Pill>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">{a.why}</p>
      {a.contradictions.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {a.contradictions.length} {a.contradictions.length === 1 ? "signal says" : "signals say"} this business is still trading, so nothing publishes.
        </p>
      )}
    </div>
  );
}

function Evidence({ signals }: { signals: WeighedSignal[] }) {
  if (signals.length === 0) return <p className="text-xs text-slate-500">No usable signal was produced.</p>;
  return (
    <ul className="space-y-1.5">
      {signals.map((s, i) => (
        <li key={`${s.source}-${s.signalType}-${i}`} className="rounded-lg border border-white/[0.07] bg-ink-950/40 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tierTone(s.tier)}`}>{s.tier}</span>
            <span className="text-[13px] font-semibold text-white">{CLOSURE_SOURCES.find((c) => c.id === s.source)?.label ?? s.source}</span>
            <span className="text-[11px] text-slate-500">{s.independence}</span>
            <span className="ml-auto text-[13px] font-bold text-white">{s.weight}</span>
            {s.clamped && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">capped</span>}
            {s.counter && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">still trading</span>}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{s.note}</p>
          {s.evidenceUrl && (
            <a href={s.evidenceUrl} target="_blank" rel="noreferrer noopener"
               className="mt-1 block truncate text-[11px] text-sky-300 hover:underline">{s.evidenceUrl}</a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function MarketExitPage() {
  const { activeBrand } = useActiveBrand();
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DetectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doctrine, setDoctrine] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        const r = await authedFetch("/api/market-exit");
        const d = await r.json().catch(() => ({}));
        if (r.ok) setDoctrine(String(d.doctrine || ""));
      } catch { /* the tool works without the doctrine block */ }
    })();
  }, []);

  const run = useCallback(async () => {
    if (!company.trim()) { setError("Which business? A name is the minimum."); return; }
    setBusy(true); setError(null); setRes(null);
    try {
      const r = await authedFetch("/api/market-exit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "detect",
          brandId: activeBrand?.id || "demo",
          company: company.trim(),
          website: website.trim() || undefined,
          where: where.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 402) { setError(`${d.error} Balance: ${d.balanceAcu ?? 0} ACUs.`); return; }
      if (!r.ok) { setError(d.error || "The check could not run."); return; }
      setRes(d as DetectResponse);
    } catch { setError("Network error — nothing was charged."); } finally { setBusy(false); }
  }, [company, website, where, activeBrand?.id]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Market Exit Capture"
        subtitle="Name a business. This reads the company register, their own pages and the press, and tells you what the evidence is actually worth — refusing to publish a closure on anything thin."
      />

      {/* THE INPUT. */}
      <section className="card p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Business name</span>
            <input
              value={company} onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
              placeholder="Kingsway Plumbing Ltd"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Their website <span className="font-normal normal-case tracking-normal text-slate-500">— optional</span>
            </span>
            <input
              value={website} onChange={(e) => setWebsite(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
              placeholder="kingswayplumbing.co.uk"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Where <span className="font-normal normal-case tracking-normal text-slate-500">— optional</span>
            </span>
            <input
              value={where} onChange={(e) => setWhere(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
              placeholder="Leeds"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void run()} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {busy ? "Reading the register and their pages…" : "Check for a closure"}
          </button>
          <span className="text-[11px] leading-relaxed text-slate-500">
            Most of the time the answer is &ldquo;no evidence of closure&rdquo;, and that is the tool working.
            Nothing publishes below {PUBLISH_CONFIDENCE_FLOOR} confidence, and never on one source.
          </span>
        </div>
        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3 text-xs leading-relaxed text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
      </section>

      {res && (
        <>
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
              <Building2 className="h-4 w-4 text-emerald-400" /> {res.detection.company}
            </h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <Verdict a={res.assessment} />
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Every signal, and what it was worth</p>
                <Evidence signals={res.assessment.evidence} />
              </div>
            </div>
          </section>

          {/* EVERY SOURCE, INCLUDING THE ONES THAT FOUND NOTHING. A source that
              could not run and a source that ran and found nothing are
              different facts, and collapsing them is how "0 signals" becomes
              unactionable. */}
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
              <FileSearch className="h-4 w-4 text-emerald-400" /> Where we looked
            </h2>
            <div className="mt-3 space-y-2">
              {res.detection.sources.map((s, i) => (
                <div key={`${s.id}-${i}`} className={`rounded-lg border p-3 ${s.checked ? "border-white/10 bg-ink-950/40" : "border-amber-500/20 bg-amber-500/[0.04]"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {CLOSURE_SOURCES.find((c) => c.id === s.id)?.label ?? (s.id === "none" ? "Their own site" : s.id)}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${s.checked ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"}`}>
                      {s.checked ? "checked" : "could not run"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.outcome}</p>
                  {s.evidenceUrl && (
                    <a href={s.evidenceUrl} target="_blank" rel="noreferrer noopener"
                       className="mt-1 block truncate text-[11px] text-sky-300 hover:underline">{s.evidenceUrl}</a>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{res.detection.note}</p>
          </section>

          {/* What happens next, and what does not. */}
          <section className={`card p-5 ${res.assessment.publishable ? "" : "opacity-90"}`}>
            <h2 className="font-display text-base font-bold text-white">What can be built on this</h2>
            {res.assessment.publishable ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                The evidence rule is satisfied, so an opportunity can be created for this exit —
                replacement businesses ranked on {MATCH_WEIGHTS.map((w) => `${w.weight}% ${w.label.toLowerCase()}`).join(" + ")},
                with displaced demand counted or left null. Every asset produced carries the disclosure below.
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-amber-100">
                <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Nothing. No opportunity, no page, no campaign — the absence is the gate, not a warning
                on something that was built anyway. {res.assessment.why}
              </p>
            )}
          </section>
        </>
      )}

      {/* The controls, always. */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
          <Gavel className="h-4 w-4 text-emerald-400" /> What this engine refuses to do
        </h2>
        {doctrine && <p className="mt-2 text-xs leading-relaxed text-slate-400">{doctrine}</p>}
        <ul className="mt-3 space-y-2">
          {MANDATORY_CONTROLS.map((c) => (
            <li key={c} className="flex items-start gap-2 text-xs leading-relaxed text-slate-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg border border-white/10 bg-ink-950/40 p-3 text-xs italic leading-relaxed text-slate-400">
          &ldquo;{REQUIRED_DISCLOSURE}&rdquo; — carried on every page, ad and message this engine produces.
        </p>
      </section>
    </div>
  );
}
