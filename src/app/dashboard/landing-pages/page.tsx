"use client";

// AI Landing Page Generator — now MERGED with the Conversion Architect engine:
// it builds a REAL hosted page (published to /b/{brandId}/{slug}) AND runs the
// Lead Capture Agent for the matching WhatsApp flow + 48h follow-up copy. One
// surface: a live page you can visit + the conversation system that works it.

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Rocket, ExternalLink, Copy, Check } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { brandDefaults } from "@/shared/brand";

const PAGE_ANATOMY = [
  "Headline that repeats the ad's promise",
  "Offer block with price, deadline and cap",
  "Problem → benefits in customer language",
  "Proof: reviews, counters, local names",
  "FAQ that kills the top 3 objections",
  "Single CTA: one-tap WhatsApp button",
  "Lead form fallback (2 fields max)",
  "Tracking pixels + A/B variant slot",
];

type SavedPage = { slug: string; headline: string; pageType: string; publishedAt?: string; url: string; absoluteUrl: string; conversionScore?: number };

export default function LandingPagesPage() {
  const { activeBrand } = useActiveBrand();
  const [form, setForm] = useState({ business: "", location: "", campaign: "", offer: "", goal: "" });
  const [publishing, setPublishing] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pages, setPages] = useState<SavedPage[]>([]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Load this brand's published pages so they're always findable (retrieved from
  // the store — surviving reloads and navigation).
  async function loadPages() {
    if (!activeBrand) { setPages([]); return; }
    try {
      const res = await authedFetch("/api/landing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list", brandId: activeBrand.id }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.pages)) setPages(d.pages);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    if (!activeBrand) return;
    const d = brandDefaults(activeBrand);
    setForm((f) => ({ ...f, business: f.business || d.business || "", location: f.location || d.location || "", offer: f.offer || d.offer || "" }));
    loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand]);

  async function publish() {
    if (!activeBrand) return;
    setPublishing(true); setLiveUrl(null);
    try {
      const res = await authedFetch("/api/landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          brandId: activeBrand.id, brandName: activeBrand.name,
          logoUrl: activeBrand.logoUrl, brandColours: activeBrand.brandColours,
          business: form.business || activeBrand.name,
          objective: form.goal, offer: form.offer, location: form.location,
          product: form.campaign, audience: brandDefaults(activeBrand).audience,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.absoluteUrl) { setLiveUrl(data.absoluteUrl); loadPages(); }
    } finally { setPublishing(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="AI Landing Page Generator"
        title="Every campaign gets a real conversion page"
        subtitle="Build a live, visitable landing page in one click — then the Lead Capture Agent designs the matching WhatsApp flow and 48-hour follow-up. Every form submission lands in your Customer Vault as a consented lead."
        actions={<Pill tone="info">live page · WhatsApp flow · vault capture</Pill>}
      />

      {/* Build & publish a REAL page */}
      <div className="mb-6 card border-emerald-500/30 p-6">
        <h2 className="mb-3 font-display font-bold text-white">Build &amp; publish the live page</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">Business</label><input className="input" value={form.business} onChange={set("business")} /></div>
          <div><label className="label">Campaign / product</label><input className="input" value={form.campaign} onChange={set("campaign")} placeholder="Family Platter Friday" /></div>
          <div><label className="label">Offer</label><input className="input" value={form.offer} onChange={set("offer")} placeholder="Feed 4 for £25, Fridays only" /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={set("location")} /></div>
          <div><label className="label">Conversion goal</label><input className="input" value={form.goal} onChange={set("goal")} placeholder="get whatsapp orders" /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-primary !bg-emerald-500 hover:!bg-emerald-400" onClick={publish} disabled={publishing || !activeBrand}>
            {publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</> : <><Rocket className="h-4 w-4" /> Publish live page</>}
          </button>
          {!activeBrand && <span className="text-xs text-amber-400">Add a brand to publish.</span>}
        </div>
        {liveUrl && (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.06] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">Live</span>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-sm text-emerald-300 hover:underline">{liveUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
              <button onClick={() => { navigator.clipboard?.writeText(liveUrl); setCopied(true); }} className="text-slate-400 hover:text-white" title="Copy">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">Share it or run ads to it. Submissions become consented leads in your Customer Vault. Edit the full design in <span className="text-emerald-300">Conversion Architect</span>.</p>
          </div>
        )}
      </div>

      {/* Your published pages — always findable; survives reloads (from the store) */}
      <div className="mb-6 card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-white">Your published pages</h2>
          <Pill tone={pages.length > 0 ? "good" : "neutral"}>{pages.length} live</Pill>
        </div>
        {pages.length === 0 ? (
          <p className="text-sm text-slate-400">No published pages yet for {activeBrand?.name || "this brand"}. Publish one above and it appears here — every page you publish stays listed, so you can always reopen or share it.</p>
        ) : (
          <div className="space-y-2">
            {pages.map((p) => (
              <div key={p.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{p.headline || p.slug}</p>
                  <a href={p.absoluteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-emerald-300 hover:underline">{p.absoluteUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3 shrink-0" /></a>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {typeof p.conversionScore === "number" && <span className="text-xs text-slate-400">Conv {p.conversionScore}</span>}
                  <button onClick={() => navigator.clipboard?.writeText(p.absoluteUrl)} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">Copy link</button>
                  <a href={p.absoluteUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">Open</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 card p-5">
        <h2 className="mb-3 font-display font-bold text-white">Anatomy of a MarketWar page</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAGE_ANATOMY.map((item) => (
            <p key={item} className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> {item}
            </p>
          ))}
        </div>
      </div>

      <h2 className="mb-3 font-display text-lg font-bold text-white">The WhatsApp flow + 48h follow-up</h2>
      <AgentRunner
        agentId="lead-capture"
        buttonLabel="Design my capture system"
        fields={[
          { key: "business", label: "Business", defaultValue: brandDefaults(activeBrand).business ?? "" },
          { key: "location", label: "Location", defaultValue: brandDefaults(activeBrand).location ?? "" },
          { key: "campaign", label: "Campaign", defaultValue: form.campaign || "" },
          { key: "offer", label: "Offer", defaultValue: brandDefaults(activeBrand).offer ?? "" },
          { key: "goal", label: "Conversion goal", defaultValue: "WhatsApp orders" },
        ]}
      />
    </div>
  );
}
