"use client";

// Conversion Architect — AI Landing Page Creation Engine (§4.6–§4.14).
// The central agent: selects the page type, builds the 10-section structure,
// objective-driven form, A/B variants A–D and the 8-score matrix. Wired to
// /api/landing. Renders the structured JSON the frontend would build from.

import { useState } from "react";
import { Loader2, LayoutTemplate, Star, FlaskConical, ListChecks } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";

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
  const [form, setForm] = useState({ business: "Brixton Grill House", objective: "get whatsapp orders", offer: "20% off your first order, ends tonight", audience: "hungry locals within 3 miles", location: "Brixton, London", product: "restaurant takeaway", painPoint: "cold, late, overpriced app delivery" });
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/landing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setPage(await res.json());
    } finally { setBusy(false); }
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
        <button className="btn-primary mt-4" onClick={generate} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Architecting…</> : <><LayoutTemplate className="h-4 w-4" /> Generate landing page</>}
        </button>
      </div>

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
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "industry", label: "Industry", defaultValue: "food delivery" },
          { key: "location", label: "Location", defaultValue: "Brixton, London" },
          { key: "offer", label: "Offer", defaultValue: "20% off first order" },
        ]} />
      </div>
    </div>
  );
}
