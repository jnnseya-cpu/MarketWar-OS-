"use client";

// LeadWar Room — B2B prospecting command surface (Apollo-inspired).
// ICP Architect → enriched prospect discovery with the MarketWar Deal
// Probability Score → outreach sequence. Wired to /api/prospecting. Demo-safe;
// live data provider plugs in at go-live. Compliant-first (UK/EU B2B).

import { useEffect, useState } from "react";
import { Loader2, Crosshair, Building2, Send, ShieldCheck, Bookmark, BellRing, Bell, Play, Trash2 } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { LEAD_TEMPLATES, type LeadTemplate } from "@/shared/lead-templates";

type ICP = { persona: string; bestJobTitles: string[]; bestIndustries: string[]; bestCompanySize: string; bestRegions: string[]; exclusionRules: string[]; scoringFormula: string; outreachAngle: string };
type DealScore = { dealProbability: number; expectedDealValueGbp: number; whyNow: string; band: string; fit: number; intent: number; authority: number };
type Prospect = { companyName: string; website: string; industry: string; employeeCount: number; contactEmail: string; emailType: string; contactTitle: string; complianceFlags: string[]; dealScore: DealScore };

const bandTone = (b: string): "good" | "warn" | "bad" => (b === "hot" ? "good" : b === "warm" ? "warn" : "bad");

// A saved lead search — persisted per-brand in the browser so it works with
// zero config. `alert` marks it for a daily lead check at go-live.
type SavedSearch = {
  id: string;
  name: string;
  product: string;
  industry: string;
  dealSize: number;
  pain: string;
  country?: string;
  companySize?: string;
  alert: boolean;
};

export default function ProspectingPage() {
  const { activeBrand } = useActiveBrand();
  const [product, setProduct] = useState("AI customer-acquisition OS");
  const [industry, setIndustry] = useState("marketing services");
  const [dealSize, setDealSize] = useState(5000);
  const [pain, setPain] = useState("wasted ad spend and no follow-up");
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [companySize, setCompanySize] = useState<string | undefined>(undefined);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [icp, setIcp] = useState<ICP | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [mode, setMode] = useState("");
  const [seq, setSeq] = useState<{ name: string; plan: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState<"" | "icp" | "search" | string>("");
  const [saved, setSaved] = useState<SavedSearch[]>([]);

  const storeKey = `mw.leadSearches.${activeBrand?.id || "demo"}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      setSaved(raw ? (JSON.parse(raw) as SavedSearch[]) : []);
    } catch { setSaved([]); }
  }, [storeKey]);

  function persist(next: SavedSearch[]) {
    setSaved(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* private mode */ }
  }

  function applyTemplate(t: LeadTemplate) {
    if (t.filters.product) setProduct(t.filters.product);
    if (t.filters.targetIndustry) setIndustry(t.filters.targetIndustry);
    if (typeof t.filters.dealSizeGbp === "number") setDealSize(t.filters.dealSizeGbp);
    if (t.filters.painPoint) setPain(t.filters.painPoint);
    setCountry(t.filters.targetCountry);
    setCompanySize(t.filters.companySize);
    setActiveTemplate(t.id);
    void buildIcp({
      productOverride: t.filters.product,
      industryOverride: t.filters.targetIndustry,
      dealSizeOverride: t.filters.dealSizeGbp,
      painOverride: t.filters.painPoint,
      countryOverride: t.filters.targetCountry,
      companySizeOverride: t.filters.companySize,
    });
  }

  function saveCurrentSearch() {
    // Deterministic id from the search itself — no Date.now (keeps re-runs stable).
    const label = activeTemplate
      ? LEAD_TEMPLATES.find((t) => t.id === activeTemplate)?.name || industry
      : `${industry} · £${dealSize}`;
    const id = `${industry}|${dealSize}|${pain}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const entry: SavedSearch = { id, name: label, product, industry, dealSize, pain, country, companySize, alert: false };
    persist([entry, ...saved.filter((s) => s.id !== id)]);
  }

  function toggleAlert(id: string) {
    persist(saved.map((s) => (s.id === id ? { ...s, alert: !s.alert } : s)));
  }

  function removeSaved(id: string) {
    persist(saved.filter((s) => s.id !== id));
  }

  function runSaved(s: SavedSearch) {
    setProduct(s.product); setIndustry(s.industry); setDealSize(s.dealSize); setPain(s.pain);
    setCountry(s.country); setCompanySize(s.companySize); setActiveTemplate(null);
    void buildIcp({
      productOverride: s.product, industryOverride: s.industry, dealSizeOverride: s.dealSize,
      painOverride: s.pain, countryOverride: s.country, companySizeOverride: s.companySize,
    });
  }

  async function buildIcp(o?: {
    productOverride?: string; industryOverride?: string; dealSizeOverride?: number;
    painOverride?: string; countryOverride?: string; companySizeOverride?: string;
  }) {
    setBusy("icp");
    try {
      const res = await fetch("/api/prospecting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "icp",
        product: o?.productOverride ?? product,
        targetIndustry: o?.industryOverride ?? industry,
        dealSizeGbp: o?.dealSizeOverride ?? dealSize,
        painPoint: o?.painOverride ?? pain,
        targetCountry: o?.countryOverride ?? country,
        companySize: o?.companySizeOverride ?? companySize,
      }) });
      setIcp(await res.json()); setProspects([]); setSeq(null);
    } finally { setBusy(""); }
  }
  async function search() {
    if (!icp) return;
    setBusy("search");
    try {
      const res = await fetch("/api/prospecting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "search", icp, industry, dealSizeGbp: dealSize }) });
      const data = await res.json();
      setProspects(data.prospects || []); setMode(data.mode);
    } finally { setBusy(""); }
  }
  async function sequence(p: Prospect) {
    setBusy(p.companyName);
    try {
      const res = await fetch("/api/prospecting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sequence", icp, prospect: p }) });
      setSeq({ name: p.companyName, plan: await res.json() });
    } finally { setBusy(""); }
  }

  return (
    <div>
      <PageHeader
        kicker="LeadWar Room · B2B Prospecting"
        title="From what you sell to a booked meeting"
        subtitle="The ICP Architect builds your ideal customer profile, discovers enriched B2B prospects, and scores each with the MarketWar Deal Probability Score — then the Outreach Commander writes the compliant multi-step sequence. UK/EU B2B compliant-first: corporate emails prioritised, personal data flagged, no private-individual scraping."
        actions={<Pill tone="info">ICP · Deal Probability · compliant outreach</Pill>}
      />

      <div className="mb-6 card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-emerald-400" />
          <h3 className="font-display text-sm font-bold text-white">Saved search templates</h3>
          <Pill tone="info">ready-made</Pill>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {LEAD_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t)}
              disabled={busy === "icp"}
              className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                activeTemplate === t.id
                  ? "border-emerald-500/50 bg-emerald-500/[0.08]"
                  : "border-white/[0.07] bg-ink-900/50 hover:border-emerald-500/30"
              }`}
            >
              <p className="text-sm font-semibold text-white">{t.name}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>
              <p className="mt-1.5 text-[11px] text-slate-500">{t.seniority.join(" · ")}</p>
            </button>
          ))}
        </div>
      </div>

      {saved.length > 0 && (
        <div className="mb-6 card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BellRing className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">Your saved searches</h3>
            <Pill tone="neutral">{saved.length}</Pill>
          </div>
          <div className="space-y-2">
            {saved.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                <div>
                  <p className="text-sm font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.industry} · £{s.dealSize}{s.country ? ` · ${s.country}` : ""}{s.alert ? " · daily alert on" : ""}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="btn-ghost !py-1.5 !text-xs" onClick={() => runSaved(s)} disabled={busy === "icp"}><Play className="h-3.5 w-3.5" /> Run</button>
                  <button
                    className={`btn-ghost !py-1.5 !text-xs ${s.alert ? "!text-emerald-300" : ""}`}
                    onClick={() => toggleAlert(s.id)}
                    title={s.alert ? "Daily lead alert on — disable" : "Turn on a daily lead alert for this search"}
                  >
                    {s.alert ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />} {s.alert ? "Alert on" : "Alert"}
                  </button>
                  <button className="btn-ghost !py-1.5 !text-xs !text-rose-300" onClick={() => removeSaved(s.id)} title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Saved to this brand. Searches marked with a daily alert are queued for the automated lead check that runs when live data is connected.</p>
        </div>
      )}

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="label">What you sell</label><input className="input" value={product} onChange={(e) => setProduct(e.target.value)} /></div>
          <div><label className="label">Target industry</label><input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} /></div>
          <div><label className="label">Deal size (£)</label><input className="input" type="number" value={dealSize} onChange={(e) => setDealSize(Number(e.target.value))} /></div>
          <div><label className="label">Buyer pain point</label><input className="input" value={pain} onChange={(e) => setPain(e.target.value)} /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => { setActiveTemplate(null); void buildIcp(); }} disabled={busy === "icp"}>
            {busy === "icp" ? <><Loader2 className="h-4 w-4 animate-spin" /> Building…</> : <><Crosshair className="h-4 w-4" /> Build ICP</>}
          </button>
          <button className="btn-ghost" onClick={saveCurrentSearch} title="Save this search — turn it into a daily lead alert below">
            <Bookmark className="h-4 w-4" /> Save search
          </button>
          {icp && <button className="btn-ghost" onClick={search} disabled={busy === "search"}>
            {busy === "search" ? <><Loader2 className="h-4 w-4 animate-spin" /> Finding…</> : <><Building2 className="h-4 w-4" /> Find prospects</>}
          </button>}
        </div>
      </div>

      {icp && (
        <div className="mb-6 card p-6">
          <h3 className="mb-2 font-display font-bold text-white">Ideal Customer Profile</h3>
          <p className="text-sm text-slate-300">{icp.persona}</p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">Best titles:</span> {icp.bestJobTitles.join(", ")}</p>
            <p><span className="text-slate-500">Industries:</span> {icp.bestIndustries.join(", ")}</p>
            <p><span className="text-slate-500">Company size:</span> {icp.bestCompanySize}</p>
            <p><span className="text-slate-500">Regions:</span> {icp.bestRegions.join(", ")}</p>
          </div>
          <p className="mt-2 text-xs text-slate-500">Scoring: {icp.scoringFormula}</p>
          <p className="mt-1 text-sm text-emerald-300">{icp.outreachAngle}</p>
        </div>
      )}

      {prospects.length > 0 && (
        <div className="mb-6 card p-6">
          <div className="mb-3 flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Prospects</h3><Pill tone={mode === "live" ? "good" : "neutral"}>{mode}</Pill></div>
          <div className="space-y-2">
            {prospects.map((p) => (
              <div key={p.companyName} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{p.companyName} <span className="text-xs text-slate-500">· {p.contactTitle} · {p.employeeCount} staff</span></p>
                    <p className="text-xs text-slate-500">{p.contactEmail} <Pill tone={p.emailType === "generic" ? "good" : "warn"}>{p.emailType}</Pill></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={bandTone(p.dealScore.band)}>Deal {p.dealScore.dealProbability} · {p.dealScore.band}</Pill>
                    <span className="text-xs text-emerald-300">~£{p.dealScore.expectedDealValueGbp}</span>
                    <button className="btn-ghost !py-1.5 !text-xs" onClick={() => sequence(p)} disabled={busy === p.companyName}>
                      {busy === p.companyName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Sequence</>}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-400">Why now: {p.dealScore.whyNow}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {seq && (
        <div className="mb-6 card border-emerald-500/20 p-6">
          <div className="mb-2 flex items-center gap-2"><Send className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Outreach sequence — {seq.name}</h3></div>
          <div className="space-y-2 text-sm">
            {(seq.plan.steps as { day: number; channel: string; purpose: string; message: string }[]).map((s, i) => (
              <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-2.5">
                <p className="font-semibold text-white">Day {s.day} · {s.channel} <span className="text-xs text-slate-500">— {s.purpose}</span></p>
                <p className="whitespace-pre-wrap text-xs text-slate-400">{s.message}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-2.5 text-xs text-amber-200/80"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {String(seq.plan.compliance)}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AgentRunner agentId="icp-architect" buttonLabel="Architect the ICP" fields={[
          { key: "industry", label: "Target industry", defaultValue: "marketing services" },
          { key: "location", label: "Location", defaultValue: "United Kingdom" },
        ]} />
        <AgentRunner agentId="outreach-commander" buttonLabel="Command the outreach" fields={[
          { key: "industry", label: "Prospect industry", defaultValue: "hospitality" },
          { key: "location", label: "Location", defaultValue: "London" },
        ]} />
      </div>
    </div>
  );
}
