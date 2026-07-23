"use client";

// Live Market Intelligence — the Serper-inspired discovery command surface.
// Opportunity Radar + Local Lead Hunter + real-time structured search, wired to
// /api/search. Zero-config demo returns structured results; SERPER_API_KEY
// enables live Google data. External search is an optional accelerator.

import { useState } from "react";
import { Loader2, Radar, Search, MapPin, TrendingUp } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";

type Opportunity = {
  niche: string; location: string; opportunityScore: number; demandLevel: string; competitionLevel: string;
  suggestedProduct: string; targetCustomer: string; recommendedPrice: string; launchStrategy: string[];
  signals: { source: string; note: string }[]; honesty: string;
};
type Lead = { name: string; website?: string; phone?: string; address?: string; rating?: number; leadScore: number; flags: string[]; outreachAngle: string };
type LeadReport = { category: string; location: string; mode: string; leads: Lead[]; summary: string };

const tone = (n: number): "good" | "warn" | "bad" => (n >= 70 ? "good" : n >= 50 ? "warn" : "bad");

export default function DiscoverPage() {
  const [niche, setNiche] = useState("food delivery");
  const [location, setLocation] = useState("");
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [leads, setLeads] = useState<LeadReport | null>(null);
  const [busy, setBusy] = useState<"" | "opp" | "leads">("");

  async function run(kind: "opp" | "leads") {
    setBusy(kind);
    try {
      const res = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "opp"
          ? { action: "opportunity", niche, location }
          : { action: "leads", category: niche, location }),
      });
      const data = await res.json();
      if (kind === "opp") setOpp(data); else setLeads(data);
    } finally { setBusy(""); }
  }

  return (
    <div>
      <PageHeader
        kicker="Live Market Intelligence · Serper-powered"
        title="See the market before your competitors move"
        subtitle="Scan live web data — Search, News, Places, Shopping — to discover profitable niches, score demand vs competition, and turn the map into a scored local lead list. External search is an optional accelerator: the OS works with zero config (structured demo) and switches to live Google data with a Serper key."
        actions={<Pill tone="info">Opportunity Radar · Lead Hunter · demo-safe</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Niche / category</label><input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} /></div>
          <div><label className="label">Location</label><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City or area (e.g. your town)" /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => run("opp")} disabled={busy === "opp"}>
            {busy === "opp" ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</> : <><Radar className="h-4 w-4" /> Opportunity Radar</>}
          </button>
          <button className="btn-ghost" onClick={() => run("leads")} disabled={busy === "leads"}>
            {busy === "leads" ? <><Loader2 className="h-4 w-4 animate-spin" /> Hunting…</> : <><MapPin className="h-4 w-4" /> Hunt local leads</>}
          </button>
        </div>
      </div>

      {opp && (
        <div className="mb-6 card p-6">
          <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-400" /><h3 className="font-display text-lg font-bold text-white">Opportunity: {opp.niche} · {opp.location}</h3><Pill tone={tone(opp.opportunityScore)}>{opp.opportunityScore}/100</Pill></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Demand" value={opp.demandLevel} tone={opp.demandLevel === "high" ? "good" : opp.demandLevel === "medium" ? "warn" : "bad"} />
            <StatCard label="Competition" value={opp.competitionLevel} tone={opp.competitionLevel === "low" ? "good" : opp.competitionLevel === "medium" ? "warn" : "bad"} />
            <StatCard label="Rec. price" value={opp.recommendedPrice} />
          </div>
          <p className="mt-3 text-sm text-slate-300"><span className="text-slate-500">Wedge:</span> {opp.suggestedProduct}</p>
          <p className="mt-1 text-sm text-slate-300"><span className="text-slate-500">Target:</span> {opp.targetCustomer}</p>
          <div className="mt-3"><p className="label">Launch strategy</p><ol className="space-y-1 text-sm text-slate-300">{opp.launchStrategy.map((s, i) => <li key={i}>{i + 1}. {s}</li>)}</ol></div>
          <div className="mt-3 flex flex-wrap gap-2">{opp.signals.map((s, i) => <Pill key={i} tone="neutral">{s.source}: {s.note}</Pill>)}</div>
          <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200/80">{opp.honesty}</p>
        </div>
      )}

      {leads && (
        <div className="mb-6 card p-6">
          <div className="mb-3 flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-400" /><h3 className="font-display text-lg font-bold text-white">Local leads</h3><Pill tone={leads.mode === "live" ? "good" : "neutral"}>{leads.mode}</Pill></div>
          <p className="mb-3 text-sm text-slate-400">{leads.summary}</p>
          <div className="space-y-2">
            {leads.leads.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                <div>
                  <p className="font-semibold text-white">{l.name} {l.rating != null && <span className="text-xs text-amber-300">★{l.rating}</span>}</p>
                  <p className="text-xs text-slate-500">{l.website || "no website"} · {l.phone || "—"}</p>
                  <p className="mt-1 text-xs text-emerald-300/80">{l.outreachAngle}</p>
                </div>
                <div className="flex items-center gap-2">
                  {l.flags.map((f) => <Pill key={f} tone={f.includes("no website") ? "bad" : f.includes("low") ? "warn" : "neutral"}>{f}</Pill>)}
                  <Pill tone={tone(l.leadScore)}>{l.leadScore}</Pill>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AgentRunner agentId="opportunity-scout" buttonLabel="Scout opportunities" fields={[
          { key: "industry", label: "Niche / industry", defaultValue: "food delivery" },
          { key: "location", label: "Location", defaultValue: "Your location" },
        ]} />
        <AgentRunner agentId="lead-hunter" buttonLabel="Hunt leads" fields={[
          { key: "industry", label: "Business category", defaultValue: "grill house" },
          { key: "location", label: "Location", defaultValue: "Your location" },
        ]} />
      </div>
    </div>
  );
}
