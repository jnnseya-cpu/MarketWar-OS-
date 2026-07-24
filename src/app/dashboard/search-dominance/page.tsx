"use client";

// Dynamic Search Dominance Engine — command surface. Presents the honest
// positioning + operating model, and two live, transparent tools: intent
// classification and the Opportunity Score. The autonomous website work
// (crawl → audit → implement) runs through the Organic Dominance OS onboarding
// once a site + Search Console are connected — cross-linked below.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Radar, Search, Gauge, ArrowRight, ShieldCheck, RefreshCcw } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";

type Mode = { key: string; label: string; desc: string; risk: string };
type Cat = { key: string; label: string; desc: string };
type Module = { n: number; key: string; label: string; scope: string; status: "live" | "foundation" | "connect" | "blueprint"; route?: string };
type Info = { honestPromise: string; positioning: { what: string; promise: string; edge: string }; operatingModes: Mode[]; operatingLoop: string[]; moneyMap: Cat[]; modules: Module[] };

const STATUS_TONE: Record<string, "good" | "info" | "warn" | "neutral"> = { live: "good", foundation: "info", connect: "warn", blueprint: "neutral" };
const STATUS_LABEL: Record<string, string> = { live: "live", foundation: "ready", connect: "connect a source", blueprint: "blueprint" };

const SCORE_FIELDS: { key: string; label: string; kind: "pos" | "neg" }[] = [
  { key: "demand", label: "Search demand", kind: "pos" },
  { key: "purchaseIntent", label: "Purchase intent", kind: "pos" },
  { key: "conversionProbability", label: "Conversion probability", kind: "pos" },
  { key: "lifetimeValue", label: "Lifetime value", kind: "pos" },
  { key: "rankingFeasibility", label: "Ranking feasibility", kind: "pos" },
  { key: "authorityPotential", label: "Authority potential", kind: "pos" },
  { key: "strategicImportance", label: "Strategic importance", kind: "pos" },
  { key: "competition", label: "Competition", kind: "neg" },
  { key: "cost", label: "Cost", kind: "neg" },
  { key: "timeToImpact", label: "Time to impact", kind: "neg" },
];

export default function SearchDominancePage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<{ intent: string; commercial: boolean; funnel: string; signals: string[] } | null>(null);
  const [busyIntent, setBusyIntent] = useState(false);
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [score, setScore] = useState<{ score: number; confidence: number } | null>(null);
  const [busyScore, setBusyScore] = useState(false);

  useEffect(() => { fetch("/api/search-dominance").then((r) => r.json()).then(setInfo).catch(() => setInfo(null)); }, []);

  async function runIntent() {
    if (!query.trim()) return;
    setBusyIntent(true);
    try {
      const r = await fetch("/api/search-dominance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "intent", query }) });
      setIntent(await r.json());
    } finally { setBusyIntent(false); }
  }
  async function runScore() {
    setBusyScore(true);
    try {
      const r = await fetch("/api/search-dominance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", inputs }) });
      setScore(await r.json());
    } finally { setBusyScore(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Dynamic Search Dominance Engine"
        title="Be found first. Be trusted faster. Be recommended more."
        subtitle="The autonomous organic customer-acquisition engine — discovers demand, builds authority, improves the website, creates winning content, earns trusted citations, and converts search visibility into revenue."
        actions={<Pill tone="info">SEO · AI discovery · social search</Pill>}
      />

      {/* Honesty banner — no guaranteed rankings */}
      <div className="mb-6 card border-amber-500/25 bg-amber-500/[0.05] p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-xs leading-relaxed text-amber-100/90">
            <span className="font-bold">What we promise (and what we don&rsquo;t).</span>{" "}
            {info?.honestPromise || "Continuous competitive optimisation, maximum eligible visibility and measurable organic revenue growth. No one can guarantee a permanent #1 or first-page ranking, so we don't."}
          </p>
        </div>
      </div>

      {/* Positioning */}
      {info && (
        <div className="mb-8 grid gap-3 md:grid-cols-3">
          <div className="card p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-400">The engine</p><p className="mt-1 text-sm text-slate-300">{info.positioning.what}</p></div>
          <div className="card p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-400">The promise</p><p className="mt-1 text-sm text-slate-300">{info.positioning.promise}</p></div>
          <div className="card p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-400">The edge</p><p className="mt-1 text-sm text-slate-300">{info.positioning.edge}</p></div>
        </div>
      )}

      {/* Operating modes */}
      {info && (
        <div className="mb-8">
          <h2 className="mb-3 font-display text-sm font-bold text-white">Operating modes — you stay in control</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {info.operatingModes.map((m) => (
              <div key={m.key} className="card p-3">
                <div className="mb-1 flex items-center justify-between"><span className="font-display text-sm font-bold text-white">{m.label}</span><Pill tone={m.risk === "none" ? "good" : m.risk === "low" ? "neutral" : "warn"}>{m.risk === "none" ? "safe" : m.risk + " risk"}</Pill></div>
                <p className="text-[11px] leading-relaxed text-slate-400">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operating loop */}
      {info && (
        <div className="mb-8 card p-5">
          <h2 className="mb-3 font-display text-sm font-bold text-white">The permanent operating loop</h2>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            {info.operatingLoop.map((step, i) => (
              <span key={step} className="flex items-center gap-1">
                <span className="rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-slate-300">{step}</span>
                {i < info.operatingLoop.length - 1 && <ArrowRight className="h-3 w-3 text-slate-600" />}
              </span>
            ))}
            <span className="ml-1 flex items-center gap-1"><RefreshCcw className="h-3 w-3 text-emerald-400" /><span className="text-[11px] font-semibold text-emerald-300">repeat continuously</span></span>
          </div>
        </div>
      )}

      {/* Money map */}
      {info && (
        <div className="mb-8">
          <h2 className="mb-3 font-display text-sm font-bold text-white">Search Money Map — opportunities by type</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {info.moneyMap.map((c) => (
              <div key={c.key} className="card p-4"><p className="font-display text-sm font-bold text-emerald-300">{c.label}</p><p className="mt-1 text-xs text-slate-400">{c.desc}</p></div>
            ))}
          </div>
        </div>
      )}

      {/* Engine modules (§10–§23) — mapped to real OS engines or honest status */}
      {info?.modules && (
        <div className="mb-8">
          <h2 className="mb-3 font-display text-sm font-bold text-white">Engine modules</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {info.modules.map((m) => {
              const inner = (
                <>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-white">{m.label}</span>
                    <Pill tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Pill>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">{m.scope}</p>
                  {m.route && <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">Open <ArrowRight className="h-3 w-3" /></p>}
                </>
              );
              return m.route
                ? <Link key={m.key} href={m.route} className="card p-4 transition hover:border-emerald-500/40">{inner}</Link>
                : <div key={m.key} className="card p-4">{inner}</div>;
            })}
          </div>
        </div>
      )}

      {/* Live tools */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Intent classifier */}
        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2"><Search className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Search intent classifier</h2></div>
          <p className="mb-3 text-xs text-slate-500">Type a query — see its intent, funnel stage and commercial signals, so you build the right page for it (not a generic blog post).</p>
          <div className="flex gap-2">
            <input className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runIntent(); }} placeholder='e.g. "best emergency plumber near me"' />
            <button className="btn-primary" onClick={runIntent} disabled={busyIntent || !query.trim()}>{busyIntent ? <Loader2 className="h-4 w-4 animate-spin" /> : "Classify"}</button>
          </div>
          {intent && (
            <div className="mt-3 rounded-lg border border-ink-700 bg-ink-850 p-3 text-sm">
              <p className="text-white">Intent: <span className="font-bold text-emerald-300">{intent.intent.replace(/_/g, " ")}</span> · funnel: <span className="text-slate-300">{intent.funnel}</span> · {intent.commercial ? <span className="text-emerald-300">commercial</span> : <span className="text-slate-400">informational</span>}</p>
              {intent.signals.length > 0 && <p className="mt-1 text-xs text-slate-500">Signals: {intent.signals.join(", ")}</p>}
            </div>
          )}
        </div>

        {/* Opportunity score */}
        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Opportunity Score</h2></div>
          <p className="mb-3 text-xs text-slate-500">Rate each driver 0–100 (leave blank for neutral). A transparent priority score — revenue drivers up, difficulty down. It&rsquo;s a heuristic, never a ranking promise.</p>
          <div className="grid grid-cols-2 gap-2">
            {SCORE_FIELDS.map((f) => (
              <label key={f.key} className="text-[11px] text-slate-400">
                <span className={f.kind === "neg" ? "text-amber-300/80" : ""}>{f.label}{f.kind === "neg" ? " (harder)" : ""}</span>
                <input type="number" min={0} max={100} className="input mt-0.5 w-full" placeholder="50"
                  onChange={(e) => setInputs((s) => { const v = e.target.value; const n = { ...s }; if (v === "") delete n[f.key]; else n[f.key] = Number(v); return n; })} />
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3" onClick={runScore} disabled={busyScore}>{busyScore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} Score it</button>
          {score && (
            <div className="mt-3 flex items-center gap-4 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
              <div><p className="font-display text-3xl font-bold text-emerald-300">{score.score}</p><p className="text-[10px] text-slate-500">priority /100</p></div>
              <div className="text-xs text-slate-400">Confidence {score.confidence}% <span className="text-slate-600">(based on how many drivers you filled in)</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Cross-link to the autonomous website engine */}
      <div className="card border-emerald-500/25 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Radar className="mt-0.5 h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="font-display font-bold text-white">Run the autonomous website workup</h2>
              <p className="mt-1 max-w-2xl text-xs text-slate-400">The crawl → Search Revenue Audit → keyword/prompt universe → scored opportunities runs in the Organic Dominance OS. Connect your site + Search Console there; this engine turns those findings into prioritised, revenue-mapped action — honestly, with no fabricated rankings or citations.</p>
            </div>
          </div>
          <Link href="/dashboard/organic-dominance" className="btn-primary shrink-0">Open Organic Dominance OS <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </div>
  );
}
