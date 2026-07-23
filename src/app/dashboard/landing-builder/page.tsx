"use client";

// Conversion Architect — AI Landing Page Creation Engine (§4.6–§4.14).
// The central agent: selects the page type, builds the 10-section structure,
// objective-driven form, A/B variants A–D and the 8-score matrix. Wired to
// /api/landing. Renders the structured JSON the frontend would build from.

import { useEffect, useState } from "react";
import { Loader2, LayoutTemplate, Star, FlaskConical, ListChecks, Rocket, ExternalLink, Copy, Check } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { brandDefaults } from "@/shared/brand";

type Scores = Record<string, number>;
type Section = { type: string; heading: string; body: string; items?: string[] };
type ABVariant = { variant: string; focus: string; headline: string; subheadline: string; hypothesis: string };
type FormField = { key: string; label: string; type: string; required: boolean };
type Page = {
  pageType: string; title: string; slug: string; headline: string; subheadline: string; offerText: string;
  primaryCta: string; secondaryCta: string; sections: Section[]; formConfig: { enabled: boolean; fields: FormField[]; submitAction: string };
  whatsappConfig: { enabled: boolean; prefilledMessage: string }; scores: Scores; abVariants: ABVariant[];
  optimisationRecommendations: string[]; publishUrl: string;
};

const tone = (n: number): "good" | "warn" | "bad" => (n >= 75 ? "good" : n >= 60 ? "warn" : "bad");
const SCORE_LABELS: Record<string, string> = { conversionScore: "Conversion", clarityScore: "Clarity", trustScore: "Trust", urgencyScore: "Urgency", mobileScore: "Mobile", emotionalScore: "Emotional", frictionScore: "Friction", leadQualityScore: "Lead quality" };

export default function LandingBuilderPage() {
  const { activeBrand } = useActiveBrand();
  const [form, setForm] = useState({ business: "", objective: "", offer: "", audience: "", location: "", product: "", painPoint: "" });
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Prefill from the active brand so the page is built from real brand context.
  useEffect(() => {
    if (!activeBrand) return;
    const d = brandDefaults(activeBrand);
    setForm((f) => ({
      ...f,
      business: f.business || d.business || "",
      offer: f.offer || d.offer || "",
      audience: f.audience || d.audience || "",
      location: f.location || d.location || "",
      product: f.product || d.product || "",
    }));
  }, [activeBrand]);

  async function generate() {
    setBusy(true); setLiveUrl(null);
    try {
      const res = await authedFetch("/api/landing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setPage(await res.json());
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!activeBrand) return;
    setPublishing(true);
    try {
      const res = await authedFetch("/api/landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, action: "publish",
          brandId: activeBrand.id, brandName: activeBrand.name,
          logoUrl: activeBrand.logoUrl, brandColours: activeBrand.brandColours,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.absoluteUrl) { setLiveUrl(data.absoluteUrl); if (data.page) setPage(data.page); }
    } finally { setPublishing(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Conversion Architect · Landing Page Engine"
        title="Where attention becomes action"
        subtitle="The central agent. From your objective it selects the right page type (of 10), builds the full 10-section structure, the objective-driven form, A/B variants A–D and the 8-score matrix — never a generic page. Scores are estimates, re-ranked on real performance after launch."
        actions={<Pill tone="info">10 types · 8 scores · A/B A–D</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">Business</label><input className="input" value={form.business} onChange={set("business")} /></div>
          <div><label className="label">Objective</label><input className="input" value={form.objective} onChange={set("objective")} /></div>
          <div><label className="label">Offer</label><input className="input" value={form.offer} onChange={set("offer")} /></div>
          <div><label className="label">Audience</label><input className="input" value={form.audience} onChange={set("audience")} /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={set("location")} /></div>
          <div><label className="label">Pain point</label><input className="input" value={form.painPoint} onChange={set("painPoint")} /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={generate} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Architecting…</> : <><LayoutTemplate className="h-4 w-4" /> Generate landing page</>}
          </button>
          {page && activeBrand && (
            <button className="btn-primary !bg-emerald-500 hover:!bg-emerald-400" onClick={publish} disabled={publishing}>
              {publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</> : <><Rocket className="h-4 w-4" /> Publish live page</>}
            </button>
          )}
          {page && !activeBrand && <span className="text-xs text-amber-400">Add a brand to publish a live page.</span>}
        </div>
      </div>

      {liveUrl && (
        <div className="mb-6 card border-emerald-500/40 bg-emerald-500/[0.06] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">Live</span>
            <span className="text-sm font-semibold text-white">Your landing page is live:</span>
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-sm text-emerald-300 hover:underline">
              {liveUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <button onClick={() => { navigator.clipboard?.writeText(liveUrl); setCopied(true); }} className="text-slate-400 hover:text-white" title="Copy">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">Share it or run ads to it. Every form submission lands in this brand&apos;s Customer Vault as a consented lead — ready to score, segment and follow up.</p>
        </div>
      )}

      {page && (
        <div className="space-y-6">
          {/* Hero + scores */}
          <div className="card border-emerald-500/30 p-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Pill tone="info">{page.pageType}</Pill>
              <Pill tone={tone(page.scores.conversionScore)}>Conversion {page.scores.conversionScore}</Pill>
              <span className="text-xs text-slate-500">{page.publishUrl}</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-white">{page.headline}</h2>
            <p className="mt-1 text-slate-400">{page.subheadline}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="btn-primary !cursor-default">{page.primaryCta}</span>
              <span className="btn-ghost !cursor-default">{page.secondaryCta}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {Object.entries(page.scores).map(([k, v]) => <StatCard key={k} label={SCORE_LABELS[k] || k} value={`${v}`} tone={tone(v)} />)}
            </div>
          </div>

          {/* Structure */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Page structure</h3></div>
            <div className="space-y-2">
              {page.sections.map((s, i) => (
                <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-emerald-400/80">{s.type}</p>
                  <p className="font-semibold text-white">{s.heading}</p>
                  {s.body && <p className="text-sm text-slate-400">{s.body}</p>}
                  {s.items && <p className="mt-1 text-xs text-slate-500">{s.items.join(" · ")}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Form + A/B */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Lead form</h3><Pill tone="neutral">{page.formConfig.submitAction}</Pill></div>
              {page.formConfig.enabled ? (
                <div className="space-y-1.5 text-sm">
                  {page.formConfig.fields.map((f) => <div key={f.key} className="flex justify-between"><span className="text-slate-300">{f.label}</span><span className="text-slate-500">{f.type}{f.required ? " · required" : ""}</span></div>)}
                </div>
              ) : <p className="text-sm text-slate-400">WhatsApp-first — no form. Pre-filled: "{page.whatsappConfig.prefilledMessage}"</p>}
            </div>
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">A/B variants</h3></div>
              <div className="space-y-2">
                {page.abVariants.map((v) => (
                  <div key={v.variant} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-2.5">
                    <p className="text-sm font-semibold text-white">{v.variant} · {v.focus}</p>
                    <p className="text-xs text-slate-400">{v.headline}</p>
                    <p className="text-[11px] text-slate-500">{v.hypothesis}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fixes */}
          <div className="card p-6">
            <div className="mb-2 flex items-center gap-2"><Star className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Optimisation recommendations</h3></div>
            <ol className="space-y-1 text-sm text-slate-300">{page.optimisationRecommendations.map((r, i) => <li key={i}>{i + 1}. {r}</li>)}</ol>
          </div>
        </div>
      )}

      <div className="mt-6">
        <AgentRunner agentId="landing-page-architect" buttonLabel="Architect the page" fields={[
          { key: "business", label: "Business", defaultValue: brandDefaults(activeBrand).business ?? "" },
          { key: "industry", label: "Industry", defaultValue: brandDefaults(activeBrand).industry ?? "" },
          { key: "location", label: "Location", defaultValue: brandDefaults(activeBrand).location ?? "" },
          { key: "offer", label: "Offer", defaultValue: brandDefaults(activeBrand).offer ?? "" },
        ]} />
      </div>
    </div>
  );
}
