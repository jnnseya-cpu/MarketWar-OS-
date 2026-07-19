"use client";

// Organic Dominance — Strike phase command surface (docs/ai-os/13 Part 2).
// MW-09 free GEO audit (acquisition front door) + MW-02 Citation Radar + the
// Magnet Foundry tool cluster + the MW-04/MW-02 agents. Live GEO audit and
// citation radar wired to /api/geo; live LLM firing arrives with provider keys.

import { useState } from "react";
import { Gauge, Loader2, Radar, Rocket, Search, Sparkles, Wrench } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { BarChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";

type Audit = {
  overall: number;
  tier: string;
  verdict: string;
  categories: { name: string; score: number; note: string }[];
  fixes: { severity: string; title: string; fix: string; autoFix: boolean }[];
};
type Radar = {
  mode: string;
  shareOfVoice: number;
  engines: { engine: string; rate: number; competitorCited: number }[];
  topPrompts: { prompt: string; cited: boolean; position: number | null; competitor: string | null }[];
  note: string;
};

const MAGNETS = [
  "GEO Audit", "llms.txt Generator", "Missing Keywords", "Robots.txt Checker",
  "Sitemap Checker", "H1 Checker", "Meta Description Checker", "SERP Snippet Preview", "Competitor Snapshot",
];

const SEV: Record<string, "bad" | "warn" | "info"> = { critical: "bad", high: "warn", medium: "info" };

export default function OrganicPage() {
  const [business, setBusiness] = useState("Brixton Grill House");
  const [audit, setAudit] = useState<Audit | null>(null);
  const [radar, setRadar] = useState<Radar | null>(null);
  const [busy, setBusy] = useState<"" | "audit" | "citation">("");

  async function run(action: "audit" | "citation") {
    setBusy(action);
    try {
      const res = await fetch("/api/geo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, business, competitors: ["Flame Republic"] }),
      });
      const data = await res.json();
      if (action === "audit") setAudit(data);
      else setRadar(data);
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Organic Dominance · Strike phase"
        title="Get recommended by the AI everyone asks"
        subtitle="AI assistants are the new results page. This is the acquisition front door: the free GEO audit ('Does ChatGPT recommend your business?'), the Citation Radar that tracks your share of AI answers, and the fixes that get you cited — earned, measured honestly, never faked."
        actions={<Pill tone="info">MW-02 · MW-04 · MW-09 · live GEO firing at go-live</Pill>}
      />

      {/* Free GEO audit — the flagship magnet */}
      <div className="mb-8 card border-emerald-500/30 p-6">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display font-bold text-white">Free GEO Audit — does ChatGPT recommend you?</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          The single best lead magnet in the category, and it runs live in the backend right now.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Business</span>
            <input
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60"
            />
          </label>
          <button type="button" onClick={() => run("audit")} disabled={busy === "audit"} className="btn-primary disabled:opacity-60">
            {busy === "audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} Run GEO audit
          </button>
          <button type="button" onClick={() => run("citation")} disabled={busy === "citation"} className="rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-emerald-500/50 disabled:opacity-60">
            {busy === "citation" ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Radar className="mr-1 inline h-4 w-4" />} Citation radar
          </button>
        </div>

        {audit && (
          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <StatCard label="GEO Readiness Score" value={`${audit.overall}`} sub={`tier: ${audit.tier}`} tone={audit.overall >= 60 ? "good" : audit.overall >= 40 ? "warn" : "bad"} />
              <p className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">{audit.verdict}</p>
            </div>
            <div className="lg:col-span-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Priority fixes</h3>
              <div className="space-y-2">
                {audit.fixes.map((f) => (
                  <div key={f.title} className="flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-850 p-3">
                    <Pill tone={SEV[f.severity] ?? "neutral"}>{f.severity}</Pill>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">
                        {f.title} {f.autoFix && <span className="ml-1 text-[10px] font-bold text-emerald-400">AUTO-FIX</span>}
                      </p>
                      <p className="text-xs text-slate-500">{f.fix}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {radar && (
          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <StatCard label="Citation Share of Voice" value={`${radar.shareOfVoice}%`} sub="of AI answers mention you" tone={radar.shareOfVoice >= 50 ? "good" : "warn"} />
              <p className="mt-3 text-[11px] text-slate-500">{radar.note}</p>
            </div>
            <div className="card p-4 lg:col-span-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">You vs competitor, by AI engine</h3>
              <BarChart
                data={radar.engines.map((e) => ({ label: e.engine, value: e.rate }))}
                height={170}
                colorByEntity
              />
            </div>
          </div>
        )}
      </div>

      {/* Magnet Foundry cluster */}
      <div className="mb-8 card p-5">
        <div className="mb-1 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-emerald-400" />
          <h2 className="font-display font-bold text-white">Magnet Foundry — the free-tool cluster</h2>
          <Pill tone="info">MW-09 · self-growth engine</Pill>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Each tool is a ranked page + email capture + one-click upgrade — the acquisition machine that grows MarketWar
          itself (doc 01 §1.6) and is reusable across every portfolio brand.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MAGNETS.map((m) => (
            <span key={m} className={`rounded-full px-3 py-1.5 text-xs font-bold ${m === "GEO Audit" ? "bg-emerald-500/15 text-emerald-300" : "bg-ink-850 text-slate-400"}`}>
              {m}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Strike-phase agents</h2>
      </div>
      <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
        <Search className="h-3.5 w-3.5" /> GEO Recon (MW-04) and Citation Radar (MW-02) — run either against your business.
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <AgentRunner
          agentId="geo-recon"
          buttonLabel="Run GEO Recon"
          fields={[
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
            { key: "location", label: "Market", defaultValue: "Brixton, London" },
            { key: "website", label: "Website", defaultValue: "brixtongrillhouse.co.uk" },
          ]}
        />
        <AgentRunner
          agentId="citation-radar"
          buttonLabel="Scan citation share"
          fields={[
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
            { key: "location", label: "Market", defaultValue: "Brixton, London" },
            { key: "competitors", label: "Main competitor", defaultValue: "Flame Republic" },
          ]}
        />
      </div>
    </div>
  );
}
