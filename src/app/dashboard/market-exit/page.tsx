"use client";

// MARKET EXIT CAPTURE — the screen.
//
// WHAT IT PUTS IN FRONT OF SOMEBODY, AND WHY IN THIS ORDER. Every other engine's
// dashboard leads with the opportunity. This one leads with the EVIDENCE,
// because the person using it is about to build a campaign around the claim that
// a named business has shut, and the only question that matters first is how we
// know.
//
// So the evidence panel is not a detail view behind a chevron — it is the thing
// the page is about. Each signal shows its source, what that source is worth,
// and whether the number the caller supplied was capped on the way in. An
// assessment that cannot be published says so at the top in the same size type
// as one that can, and there is no way to proceed from it.
//
// THERE IS NO "ESTIMATED DISPLACED CUSTOMERS" BADGE. When the demand was
// counted, the count is shown with what it was counted from. When it was not,
// the panel says what to supply. A dash that explains itself beats a plausible
// number nobody can defend, and this is the one screen where a made-up figure
// would go straight into an advertising budget.

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Pill } from "@/components/ui";
import { AlertTriangle, CheckCircle2, FileSearch, Gavel, Loader2, ScanSearch, ShieldAlert, Users } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import {
  CLOSURE_SOURCES, MATCH_WEIGHTS, MANDATORY_CONTROLS, REQUIRED_DISCLOSURE,
  PUBLISH_CONFIDENCE_FLOOR, TIER_MAX_INFLUENCE,
  type ClosureAssessment, type WeighedSignal, type DemandOpportunity,
  type ReplacementMatch, type IneligibleCandidate, type CoverageGap, type AllocationResult,
} from "@/shared/market-exit";

type Demo = {
  publishable: ClosureAssessment;
  refused: ClosureAssessment;
  opportunity: DemandOpportunity | null;
  matched: { matches: ReplacementMatch[]; ineligible: IneligibleCandidate[]; note: string };
  coverage: CoverageGap | null;
  allocation: AllocationResult;
};

type Doctrine = { doctrine: string; demo: Demo };

const tierTone = (t: string) =>
  t === "official" ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
  : t === "operator" ? "border-sky-500/30 bg-sky-500/[0.06] text-sky-300"
  : t === "observed" ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
  : "border-rose-500/30 bg-rose-500/[0.06] text-rose-300";

function Verdict({ a }: { a: ClosureAssessment }) {
  const good = a.publishable;
  return (
    <div className={`rounded-xl border p-4 ${good ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-rose-500/25 bg-rose-500/[0.05]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {good ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-rose-400" />}
        <span className="font-display text-sm font-bold text-white">{a.status.replace(/_/g, " ")}</span>
        <Pill>{a.confidenceScore} confidence</Pill>
        {a.humanReviewRequired && <Pill>Needs a person</Pill>}
        {!good && <Pill>Nothing may be built on this</Pill>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">{a.why}</p>
      {a.contradictions.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {a.contradictions.length} {a.contradictions.length === 1 ? "signal says" : "signals say"} this business is still trading.
        </p>
      )}
    </div>
  );
}

function Evidence({ signals }: { signals: WeighedSignal[] }) {
  if (signals.length === 0) return <p className="text-xs text-slate-500">No signals.</p>;
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
        </li>
      ))}
    </ul>
  );
}

export default function MarketExitPage() {
  const [data, setData] = useState<Doctrine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRefused, setShowRefused] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/market-exit");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not read the engine."); return; }
      setData(d as Doctrine);
    } catch { setError("Network error."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="p-6"><p className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-4 text-sm text-rose-200">{error}</p></div>;
  if (!data) return <div className="flex items-center gap-2 p-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const d = data.demo;
  const shown = showRefused ? d.refused : d.publishable;
  const demand = d.opportunity?.displacedDemand;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Market Exit Capture"
        subtitle="A business closes; the demand it served does not. This finds verified exits and turns each into an expiring opportunity for a business that is actually trading — and refuses to do any of it on thin evidence."
      />

      <p className="rounded-xl border border-white/10 bg-ink-900/50 p-4 text-sm leading-relaxed text-slate-300">
        {data.doctrine}
      </p>

      {/* THE EVIDENCE FIRST. Both cases are on the page, and the toggle is not a
          gimmick — the refused one is what this engine does most of the time,
          and a screen that only ever shows the success is a screen that teaches
          somebody to expect one. */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
            <FileSearch className="h-4 w-4 text-emerald-400" /> The evidence, and what it was allowed to prove
          </h2>
          <div className="flex gap-1.5">
            <button onClick={() => setShowRefused(false)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${!showRefused ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>Published</button>
            <button onClick={() => setShowRefused(true)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${showRefused ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>Refused</button>
          </div>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Verdict a={shown} />
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Every signal, and what it was worth</p>
            <Evidence signals={shown.evidence} />
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Publishing needs an official register entry, or two sources that could have failed independently —
          and a report from a member of the public is never one of the two. Confidence combines the strongest
          signal per independent source, so ten observations of the same fact count once. Nothing publishes
          below {PUBLISH_CONFIDENCE_FLOOR}.
        </p>
      </section>

      {/* Displaced demand — counted, or a dash that explains itself. */}
      {d.opportunity && demand && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
            <Users className="h-4 w-4 text-emerald-400" /> Displaced demand
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-ink-950/40 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Customers a month</p>
              <p className="text-lg font-bold text-white">{demand.customersPerMonth ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-ink-950/40 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Monthly value</p>
              <p className="text-lg font-bold text-white">{demand.monthlyValueGbp !== null ? `£${demand.monthlyValueGbp.toLocaleString("en-GB")}` : "—"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-ink-950/40 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Window</p>
              <p className="text-lg font-bold text-white">{d.opportunity.competitionLevel}</p>
              <p className="text-[10px] text-slate-500">expires {new Date(d.opportunity.expiresAt).toLocaleDateString("en-GB")}</p>
            </div>
          </div>
          {demand.basis.length > 0 && (
            <ul className="mt-3 space-y-1">
              {demand.basis.map((b) => <li key={b} className="text-xs leading-relaxed text-slate-400">✓ {b}</li>)}
            </ul>
          )}
          {demand.missing.length > 0 && (
            <ul className="mt-2 space-y-1">
              {demand.missing.map((m) => <li key={m} className="text-xs leading-relaxed text-amber-200/90">— {m}</li>)}
            </ul>
          )}
        </section>
      )}

      {/* Matching, with the formula printed beside the scores. */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
          <ScanSearch className="h-4 w-4 text-emerald-400" /> Replacement businesses
        </h2>
        <p className="mt-1 text-xs text-slate-400">{MATCH_WEIGHTS.map((w) => `${w.weight}% ${w.label}`).join(" + ")}</p>
        <div className="mt-3 space-y-2">
          {d.matched.matches.map((m) => (
            <div key={m.candidateId} className="rounded-lg border border-white/10 bg-ink-950/40 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-bold text-white">{m.name}</span>
                <span className="ml-auto text-sm font-bold text-emerald-300">{m.matchScore}/100</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MATCH_WEIGHTS.map((w) => (
                  <span key={w.key} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {w.label} {m.factors[w.key]}
                  </span>
                ))}
              </div>
              {m.reasons.length > 0 && <p className="mt-2 text-xs leading-relaxed text-slate-400">{m.reasons.join(" ")}</p>}
              {m.unmeasured.length > 0 && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200/80">Not measured: {m.unmeasured.join(" ")}</p>
              )}
            </div>
          ))}
          {d.matched.ineligible.map((i) => (
            <div key={i.id} className="rounded-lg border border-white/[0.06] bg-ink-950/30 p-3 opacity-80">
              <p className="text-sm font-semibold text-slate-400">{i.name} — not offered</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{i.reasons.join(" ")}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{d.matched.note}</p>
        {d.coverage && d.coverage.severity !== "covered" && (
          <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-100">
            Coverage {d.coverage.severity} for {d.coverage.category} in {d.coverage.city} {d.coverage.postcodePrefix}:{" "}
            {d.coverage.eligibleCount} eligible, {d.coverage.ineligibleCount} excluded.
            {d.coverage.commonestBlocker ? ` Commonest reason: ${d.coverage.commonestBlocker}` : ""}
          </p>
        )}
      </section>

      {/* Allocation. The tier cap is stated on the screen, because "how are leads
          shared out" is the question a paying supplier asks first. */}
      <section className="card p-5">
        <h2 className="font-display text-base font-bold text-white">Where the leads went</h2>
        <div className="mt-3 space-y-1.5">
          {d.allocation.allocations.map((a) => (
            <div key={a.candidateId} className="flex flex-wrap items-baseline gap-2 rounded-lg border border-white/10 bg-ink-950/40 p-2.5">
              <span className="text-sm font-semibold text-white">{a.name}</span>
              <span className="text-sm font-bold text-emerald-300">{a.leads}</span>
              <span className="w-full text-[11px] leading-relaxed text-slate-500">{a.why}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {d.allocation.note} Match quality decides the order and the share; a subscription plan moves it by
          at most {Math.round(TIER_MAX_INFLUENCE * 100)}%, and a business&rsquo;s stated capacity is a ceiling
          rather than another weight.
        </p>
      </section>

      {/* The controls, in full. They are the product here. */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
          <Gavel className="h-4 w-4 text-emerald-400" /> What this engine refuses to do
        </h2>
        <ul className="mt-3 space-y-2">
          {MANDATORY_CONTROLS.map((c) => (
            <li key={c} className="flex items-start gap-2 text-xs leading-relaxed text-slate-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg border border-white/10 bg-ink-950/40 p-3 text-xs italic leading-relaxed text-slate-400">
          &ldquo;{REQUIRED_DISCLOSURE}&rdquo; — carried on every page, ad and message this engine produces. Copy
          without it is not published with a warning; it is not published.
        </p>
      </section>
    </div>
  );
}
