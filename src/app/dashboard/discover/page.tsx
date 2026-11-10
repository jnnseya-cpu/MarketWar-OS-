"use client";

// Live Market Intelligence — the Serper-inspired discovery command surface.
// Opportunity Radar + Local Lead Hunter + real-time structured search, wired to
// /api/search. Zero-config demo returns structured results; SERPER_API_KEY
// enables live Google data. External search is an optional accelerator.

import { useState } from "react";
import { Loader2, Radar, Search, MapPin, TrendingUp } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import OpportunityBoard from "@/components/OpportunityBoard";
import { authedFetch } from "@/frontend/api-client";
import GtmPlanView, { type GtmPlan } from "@/components/GtmPlanView";

type Opportunity = {
  niche: string; location: string; opportunityScore: number; demandLevel: string; competitionLevel: string;
  suggestedProduct: string; targetCustomer: string; recommendedPrice: string; launchStrategy: string[];
  signals: { source: string; note: string }[]; honesty: string;
  gtm?: GtmPlan;
};
type Lead = { name: string; website?: string; phone?: string; address?: string; rating?: number; leadScore: number; flags: string[]; outreachAngle: string };
type LeadReport = { category: string; location: string; mode: string; leads: Lead[]; summary: string };

const tone = (n: number): "good" | "warn" | "bad" => (n >= 70 ? "good" : n >= 50 ? "warn" : "bad");

export default function DiscoverPage() {
  const [niche, setNiche] = useState("food delivery");
  const [location, setLocation] = useState("");
  // Asked, not assumed: a service has no supply chain, and defaulting everybody
  // to "product" would hand a consultant five supplier routes they cannot use.
  const [model, setModel] = useState<"physical_product" | "service" | "digital">("service");
  // The two the plan needs to stop being generic: one city, and real money.
  const [launchCity, setLaunchCity] = useState("");
  const [budgetGbp, setBudgetGbp] = useState("");
  const [priceGbp, setPriceGbp] = useState("");
  const [unitCostGbp, setUnitCostGbp] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [leads, setLeads] = useState<LeadReport | null>(null);
  const [busy, setBusy] = useState<"" | "opp" | "leads">("");

  async function run(kind: "opp" | "leads") {
    setBusy(kind);
    try {
      const res = await authedFetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "opp"
          ? { action: "opportunity", niche, location, model, launchCity, budgetGbp, priceGbp, unitCostGbp }
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

      {/* §95 — scoring had nowhere to put its result until this. */}
      <OpportunityBoard />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Niche / category</label><input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} /></div>
          <div><label className="label">Location</label><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City or area (e.g. your town)" /></div>
        </div>
        <div className="mt-4">
          <label className="label">What are you selling?</label>
          <div className="flex flex-wrap gap-2">
            {([["service", "A service"], ["physical_product", "A physical product"], ["digital", "Something digital"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setModel(id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${model === id ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:border-white/20"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600">
            It changes the plan materially — only a physical product has suppliers to source.
          </p>
        </div>

        {/* THE TWO FIELDS THAT STOP THE PLAN BEING GENERIC.
            A plan for "the UK" has no supplier to call and no profile to claim.
            A budget nobody supplied cannot be divided into real figures — and
            inventing one would be writing somebody else's cheque. Both are
            optional and the plan says plainly what it cannot do without them. */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Launch city</label>
            <input className="input" value={launchCity} onChange={(e) => setLaunchCity(e.target.value)} placeholder="Birmingham" />
            <p className="mt-1 text-[11px] text-slate-600">Locks the plan to one place.</p>
          </div>
          <div>
            <label className="label">Budget (£)</label>
            <input className="input" inputMode="decimal" value={budgetGbp} onChange={(e) => setBudgetGbp(e.target.value)} placeholder="1500" />
            <p className="mt-1 text-[11px] text-slate-600">Divided across 90 days.</p>
          </div>
          <div>
            <label className="label">Price (£)</label>
            <input className="input" inputMode="decimal" value={priceGbp} onChange={(e) => setPriceGbp(e.target.value)} placeholder="25" />
            <p className="mt-1 text-[11px] text-slate-600">What one customer pays.</p>
          </div>
          <div>
            <label className="label">Unit cost (£)</label>
            <input className="input" inputMode="decimal" value={unitCostGbp} onChange={(e) => setUnitCostGbp(e.target.value)} placeholder="9" />
            <p className="mt-1 text-[11px] text-slate-600">Landed, not the quote.</p>
          </div>
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

      {/* The plan itself. It has been in the API response since the engine was
          written and this screen showed four bullets — the engine is right and
          the last six inches were missing, for the fourth time this month. */}
      {opp?.gtm && (
        <div className="mb-6">
          <GtmPlanView
            plan={opp.gtm}
            downloading={downloading}
            onDownload={async () => {
              setDownloading(true);
              try {
                // Fetched from the server rather than assembled here, so the
                // document and the screen come from one function and a section
                // added to one cannot go missing from the other.
                const res = await authedFetch("/api/go-to-market", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    business: niche, offer: niche, model, launchCity, location,
                    budgetGbp, priceGbp, unitCostGbp, format: "markdown",
                  }),
                });
                if (!res.ok) return;
                const text = await res.text();
                const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1]
                  || `GO-TO-MARKET-${niche.replace(/\W+/g, "-").toLowerCase()}.md`;
                const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
                const a = document.createElement("a");
                a.href = url; a.download = name;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
              } finally {
                setDownloading(false);
              }
            }}
          />
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
