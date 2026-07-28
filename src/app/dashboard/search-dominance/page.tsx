"use client";

// Dynamic Search Dominance Engine — command surface. Presents the honest
// positioning + operating model, and two live, transparent tools: intent
// classification and the Opportunity Score. The autonomous website work
// (crawl → audit → implement) runs through the Organic Dominance OS onboarding
// once a site + Search Console are connected — cross-linked below.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Radar, Search, Gauge, ArrowRight, ShieldCheck, RefreshCcw, Wrench, Copy, Check } from "lucide-react";
import { PageHeader, Pill, HowToUse } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type SeoArtifact = { key: string; label: string; format: string; content: string; note: string };

function CopyBox({ a }: { a: SeoArtifact }) {
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-display text-xs font-bold text-white">{a.label} <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{a.format}</span></span>
        <button onClick={async () => { try { await navigator.clipboard.writeText(a.content); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* blocked */ } }} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-ink-800 hover:text-emerald-300">{done ? <><Check className="h-3 w-3 text-emerald-400" /> copied</> : <><Copy className="h-3 w-3" /> copy</>}</button>
      </div>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-ink-950 p-2 font-mono text-[11px] leading-relaxed text-slate-300">{a.content}</pre>
      <p className="mt-1 text-[10px] text-slate-500">{a.note}</p>
    </div>
  );
}

type Mode = { key: string; label: string; desc: string; risk: string };
type Cat = { key: string; label: string; desc: string };
type Module = { n: number; key: string; label: string; scope: string; status: "live" | "foundation" | "connect" | "blueprint"; route?: string };
type Agent = { n: number; name: string; role: string };
type Division = { division: string; agents: Agent[] };
type RiskTier = { tier: string; gate: string; examples: string[] };
type Comp = { key: string; label: string; action: string };
type Phase = { phase: string; builds: string[] };
type Info = { honestPromise: string; positioning: { what: string; promise: string; edge: string }; operatingModes: Mode[]; operatingLoop: string[]; moneyMap: Cat[]; modules: Module[]; workforce: Division[]; riskTiers: RiskTier[]; executiveMetrics: string[]; dominanceComponents: Comp[]; guardrails: string[]; activationPhases: Phase[]; mvpCriteria: string[]; finalPositioning: { master: string; punchy: string; competitor: string; aiDiscovery: string; standard: string } };

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
  const [dom, setDom] = useState<Record<string, number>>({});
  const [domScore, setDomScore] = useState<{ score: number; weakest: { label: string; value: number; action: string }[] } | null>(null);
  const [busyDom, setBusyDom] = useState(false);
  const { activeBrand } = useActiveBrand();
  const [seoTopic, setSeoTopic] = useState("");
  const [artifacts, setArtifacts] = useState<SeoArtifact[] | null>(null);
  const [busySeo, setBusySeo] = useState(false);
  const [seoErr, setSeoErr] = useState("");
  // Live Search Console → auto-fills the measurable Dominance components.
  const [gsc, setGsc] = useState<{ connected: boolean; avgPosition?: number; clicks?: number; impressions?: number; queries?: number; needsSelection?: boolean; sites?: string[]; note?: string } | null>(null);

  // Pull the brand's real Search Console figures and translate them into the two
  // components SC actually measures — technical eligibility (indexed & serving)
  // and search-demand coverage (how many queries you appear for). Others stay 0
  // until rank/authority/AI sources connect — never invented.
  useEffect(() => {
    if (!activeBrand) return;
    let on = true;
    (async () => {
      try {
        const r = await authedFetch("/api/seo-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "search-console", brandId: activeBrand.id, website: (activeBrand as { website?: string }).website }) });
        const d = await r.json();
        if (!on) return;
        if (d.connected && d.report?.totals) {
          const t = d.report.totals as { avgPosition: number; clicks: number; impressions: number };
          const queries = Array.isArray(d.report.rows) ? d.report.rows.length : 0;
          setGsc({ connected: true, avgPosition: t.avgPosition, clicks: t.clicks, impressions: t.impressions, queries });
          const cl = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
          const derived = {
            technicalEligibility: t.impressions > 0 ? cl(105 - (t.avgPosition || 20) * 5) : 0,
            searchDemandCoverage: cl(queries * 4),
          };
          setDom(derived);
          const sr = await fetch("/api/search-dominance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dominanceScore", inputs: derived }) });
          setDomScore(await sr.json().catch(() => null));
        } else setGsc({ connected: false, needsSelection: Boolean(d.needsSelection), sites: Array.isArray(d.sites) ? d.sites.map((x: { siteUrl: string }) => x.siteUrl) : [], note: typeof d.note === "string" ? d.note : "" });
      } catch { if (on) setGsc({ connected: false }); }
    })();
    return () => { on = false; };
  }, [activeBrand]);

  async function generateArtifacts() {
    if (!activeBrand) { setSeoErr("Pick a brand in the sidebar first."); return; }
    setBusySeo(true); setSeoErr(""); setArtifacts(null);
    try {
      const res = await authedFetch("/api/seo-artifacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id, brand: activeBrand, topic: seoTopic.trim() || undefined }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setSeoErr(d.error || "Generation failed"); return; }
      setArtifacts(Array.isArray(d.artifacts) ? d.artifacts : []);
    } finally { setBusySeo(false); }
  }

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
  async function runDom() {
    setBusyDom(true);
    try {
      const r = await fetch("/api/search-dominance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dominanceScore", inputs: dom }) });
      setDomScore(await r.json());
    } finally { setBusyDom(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Dynamic Search Dominance Engine"
        title="Be found first. Be trusted faster. Be recommended more."
        subtitle="The autonomous organic customer-acquisition engine — discovers demand, builds authority, improves the website, creates winning content, earns trusted citations, and converts search visibility into revenue."
        actions={<Pill tone="info">SEO · AI discovery · social search</Pill>}
      />

      <HowToUse
        does="Win organic customers without paying for ads — generate real SEO assets now, and prioritise what to fix."
        steps={[
          "1. Press Generate my SEO assets below for copy-paste-ready schema, llms.txt and meta tags from your brand.",
          "2. Classify any search query to see its intent, and score opportunities to rank them.",
          "3. Score your brand on the Dominance components to get your weakest areas + the next action.",
        ]}
        connector="Google Search Console + analytics attach real rankings, clicks and revenue estimates to every recommendation."
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

      {/* LIVE SEO Workbench — real deliverables from your brand, no external data */}
      <div className="mb-8 card border-emerald-500/30 p-5">
        <div className="mb-1 flex items-center gap-2"><Wrench className="h-5 w-5 text-emerald-400" /><h2 className="font-display text-lg font-bold text-white">SEO Workbench — generate real assets now</h2><Pill tone="good">live</Pill></div>
        <p className="mb-3 text-xs text-slate-500">Produces valid, copy-paste-ready <span className="text-slate-300">JSON-LD structured data</span>, an <span className="text-slate-300">llms.txt</span> (for AI answer engines) and <span className="text-slate-300">optimised meta tags</span> from {activeBrand?.name || "your active brand"} — no external tool, no waiting. It never invents ratings or prices; missing facts are omitted, not faked.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-[320px]" value={seoTopic} onChange={(e) => setSeoTopic(e.target.value)} placeholder="Optional: a page topic for the meta tags (e.g. emergency plumbing)" />
          <button className="btn-primary" onClick={generateArtifacts} disabled={busySeo || !activeBrand}>{busySeo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Generate my SEO assets</button>
        </div>
        {seoErr && <p className="mt-2 text-xs text-rose-300">{seoErr}</p>}
        {artifacts && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {artifacts.map((a) => <CopyBox key={a.key} a={a} />)}
          </div>
        )}
      </div>

      {/* §39 — non-negotiable rules */}
      {info?.guardrails && (
        <div className="mb-8 card border-rose-500/20 bg-rose-500/[0.03] p-5">
          <h2 className="mb-3 font-display text-sm font-bold text-white">Non-negotiable rules — the discipline that protects you</h2>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {info.guardrails.map((g) => (
              <p key={g} className="flex items-start gap-1.5 text-[11px] text-slate-400"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-rose-400" /> {g}</p>
            ))}
          </div>
        </div>
      )}

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

      {/* §35 — Search Dominance Score */}
      {info?.dominanceComponents && (
        <div className="mb-8 card p-5">
          <div className="mb-2 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">MarketWar Search Dominance Score</h2></div>
          <p className="mb-3 text-xs text-slate-500">Rate each component 0–100 (leave blank for unmeasured = 0, so gaps show honestly). You get a 0–100 score and the weakest areas, each with the recommended next action. Cost/revenue estimates attach when a real data source (Search Console, analytics) is connected — never invented.</p>
          {gsc?.connected && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-slate-300">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-300"><Check className="h-3.5 w-3.5" /> Search Console live</span>
              <span>Avg position <span className="font-semibold text-white">{gsc.avgPosition}</span></span>
              <span>Queries <span className="font-semibold text-white">{gsc.queries}</span></span>
              <span>Impressions <span className="font-semibold text-white">{gsc.impressions?.toLocaleString()}</span></span>
              <span className="text-slate-500">→ Technical Eligibility + Search Demand Coverage auto-filled from your live data. Other components stay 0 until authority/AI/analytics sources connect.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {info.dominanceComponents.map((c) => (
              <label key={c.key} className="text-[11px] text-slate-400" title={c.action}>
                {c.label}
                <input type="number" min={0} max={100} className="input mt-0.5 w-full" placeholder="0" value={dom[c.key] ?? ""}
                  onChange={(e) => setDom((s) => { const v = e.target.value; const n = { ...s }; if (v === "") delete n[c.key]; else n[c.key] = Number(v); return n; })} />
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3" onClick={runDom} disabled={busyDom}>{busyDom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} Score my brand</button>
          {domScore && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
                <p className="font-display text-4xl font-bold text-emerald-300">{domScore.score}</p><p className="text-[10px] text-slate-500">dominance<br/>/100</p>
              </div>
              <div className="flex-1 rounded-lg border border-ink-700 bg-ink-850 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Fix these first</p>
                <ul className="space-y-1">
                  {domScore.weakest.map((w) => (
                    <li key={w.label} className="text-xs text-slate-300"><span className="font-semibold text-white">{w.label} ({w.value})</span> — <span className="text-slate-400">{w.action}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* §33 safety + §34 executive metrics */}
      {info?.riskTiers && (
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Permissions &amp; safety — you approve what matters</h2></div>
            <div className="space-y-2">
              {info.riskTiers.map((t) => (
                <div key={t.tier} className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
                  <div className="mb-1 flex items-center gap-2"><Pill tone={t.tier === "low" ? "good" : t.tier === "medium" ? "warn" : "neutral"}>{t.tier} risk</Pill><span className="text-xs text-slate-400">{t.gate}</span></div>
                  <p className="text-[11px] text-slate-500">{t.examples.join(" · ")}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">Command-centre metrics</h2>
            <div className="flex flex-wrap gap-1.5">
              {info.executiveMetrics.map((m) => <span key={m} className="rounded-full border border-ink-700 bg-ink-850 px-2 py-0.5 text-[11px] text-slate-300">{m}</span>)}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">The daily priority panel surfaces the single highest-value next action (e.g. &ldquo;improve this page to capture £X estimated annual demand&rdquo;) once your site + Search Console are connected.</p>
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

      {/* §31 — the 53-agent AI workforce */}
      {info?.workforce && (
        <div className="mb-8">
          <h2 className="mb-1 font-display text-sm font-bold text-white">Search-Dominance AI Workforce</h2>
          <p className="mb-3 text-xs text-slate-500">{info.workforce.reduce((n, d) => n + d.agents.length, 0)} specialist agents across {info.workforce.length} divisions — coordinated under the operating modes + Approvals controls.</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {info.workforce.map((d) => (
              <div key={d.division} className="card p-4">
                <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-emerald-400">{d.division} <span className="text-slate-600">· {d.agents.length}</span></p>
                <ul className="space-y-1.5">
                  {d.agents.map((a) => (
                    <li key={a.n} className="text-xs">
                      <span className="font-semibold text-slate-200">{a.n}. {a.name}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{a.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* §40 phases + §41 MVP criteria */}
      {info?.activationPhases && (
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">Activation phases</h2>
            <div className="space-y-2">
              {info.activationPhases.map((p) => (
                <div key={p.phase} className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
                  <p className="mb-1 font-display text-xs font-bold text-emerald-300">{p.phase}</p>
                  <p className="text-[11px] text-slate-500">{p.builds.join(" · ")}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">MVP definition of done</h2>
            <ul className="grid gap-1">
              {info.mvpCriteria.map((c) => (
                <li key={c} className="flex items-start gap-1.5 text-[11px] text-slate-400"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-400" /> {c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* §42 — final positioning */}
      {info?.finalPositioning && (
        <div className="mb-8 card border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-6">
          <p className="font-display text-lg font-bold text-white">{info.finalPositioning.punchy}</p>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">{info.finalPositioning.master}</p>
          <p className="mt-3 max-w-3xl text-xs text-slate-400"><span className="font-semibold text-slate-300">vs. SEO tools:</span> {info.finalPositioning.competitor}</p>
          <p className="mt-1 max-w-3xl text-xs text-slate-400"><span className="font-semibold text-slate-300">AI discovery:</span> {info.finalPositioning.aiDiscovery}</p>
          <p className="mt-3 border-t border-emerald-500/15 pt-3 text-[11px] italic text-emerald-200/80">{info.finalPositioning.standard}</p>
        </div>
      )}

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
