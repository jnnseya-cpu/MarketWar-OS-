"use client";

// M-36 Autonomous Campaign Warfare — the flagship command surface.
// The operator answers six questions; the OS returns the whole ecosystem
// (STEPS 1–11) and the AI Campaign Score™. Wired to /api/warfare; the score
// is a probability estimate, labelled honestly, never a guarantee.

import { useEffect, useState } from "react";
import { Loader2, Swords, Target, Brain, BadgePercent, Image as ImageIcon, PenLine, Hash, Share2, Layout, Send, Gauge } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Ecosystem = {
  vertical: string;
  businessAnalysis: { read: string; demandSignal: string };
  objective: { objective: string; why: string; primaryChannel: string };
  psychology: { triggers: string[]; fears: string[]; aspirations: string[]; motivations: string[]; slang: string[] };
  offers: { archetype: string; offer: string; score: number; marginFlag: boolean; note: string }[];
  recommendedOffer: { archetype: string };
  visuals: { platform: string; concept: string; attentionTriggers: string[] }[];
  copy: { headline: string; aida: string; pas: string; hooks: string[]; cta: string };
  hashtags: { tag: string; class: string; score: number }[];
  payloads: { channel: string; format: string; asset: string }[];
  landingPage: { objective: string; sections: string[]; conversionNote: string };
  distribution: { where: string[]; when: string; frequencyCap: string; sequence: string; budgetSplit: { label: string; amount: number; currency: string }[]; note: string };
  campaignScore: { composite: number; verdict: string; dimensions: { name: string; score: number; driver: string }[]; honesty: string };
  autonomy: { level: number; name: string; runs: string; youApprove: string };
};

const scoreTone = (n: number): "good" | "warn" | "bad" => (n >= 75 ? "good" : n >= 55 ? "warn" : "bad");

export default function WarfarePage() {
  // Clean slate: brand fields start blank and fill from the ACTIVE brand.
  const [form, setForm] = useState({
    product: "",
    audience: "",
    result: "",
    budget: 600,
    location: "",
    offer: "",
    autonomy: 2 as 1 | 2 | 3,
  });
  const [eco, setEco] = useState<Ecosystem | null>(null);
  const [busy, setBusy] = useState(false);
  const { activeBrand } = useActiveBrand();

  // Seed from the active brand; re-seed on brand switch (blank if none).
  useEffect(() => {
    setForm((f) => ({
      ...f,
      product: activeBrand?.product ?? "",
      audience: activeBrand?.audience ?? "",
      result: activeBrand?.goal ?? "",
      location: activeBrand?.location ?? "",
      offer: activeBrand?.offer ?? "",
    }));
    setEco(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: k === "budget" ? Number(e.target.value) : k === "autonomy" ? (Number(e.target.value) as 1 | 2 | 3) : e.target.value }));

  async function design() {
    setBusy(true);
    try {
      const res = await fetch("/api/warfare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setEco(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Autonomous Campaign Warfare · M-36"
        title="Answer six questions. The OS builds the whole campaign."
        subtitle="Not a picture and a caption — a results-driven ecosystem: business analysis, objective, customer psychology, scored offers, visual concepts, AIDA/PAS copy, hashtags, native multi-platform payloads, a landing-page spec, a frequency-governed distribution plan and the AI Campaign Score™ that predicts probability before you spend."
        actions={<Pill tone="info">STEPS 1–11 · margin-guarded · frequency-capped</Pill>}
      />

      {/* The six questions */}
      <div className="mb-8 card border-emerald-500/30 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Swords className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">The only six questions the OS needs</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">What do you sell?</label><input className="input" value={form.product} onChange={set("product")} /></div>
          <div><label className="label">Who do you want?</label><input className="input" value={form.audience} onChange={set("audience")} /></div>
          <div><label className="label">What result?</label><input className="input" value={form.result} onChange={set("result")} /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={set("location")} /></div>
          <div><label className="label">Budget</label><input className="input" type="number" value={form.budget} onChange={set("budget")} /></div>
          <div><label className="label">Promotion / offer (optional)</label><input className="input" value={form.offer} onChange={set("offer")} /></div>
          <div>
            <label className="label">Autonomy level</label>
            <select className="input" value={form.autonomy} onChange={set("autonomy")}>
              <option value={1}>Level 1 — Assisted (approve everything)</option>
              <option value={2}>Level 2 — Semi-Autonomous (approve launch)</option>
              <option value={3}>Level 3 — Fully Autonomous (guardrailed)</option>
            </select>
          </div>
        </div>
        <button className="btn-primary mt-5" onClick={design} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Designing the ecosystem…</> : <><Swords className="h-4 w-4" /> Design the campaign</>}
        </button>
      </div>

      {eco && (
        <div className="space-y-6">
          {/* AI Campaign Score™ */}
          <div className="card border-emerald-500/30 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-emerald-400" />
              <h2 className="font-display text-lg font-bold text-white">AI Campaign Score™</h2>
              <Pill tone={scoreTone(eco.campaignScore.composite)}>{eco.campaignScore.composite}/100</Pill>
            </div>
            <p className="mb-4 text-sm font-semibold text-emerald-300">{eco.campaignScore.verdict}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {eco.campaignScore.dimensions.map((d) => (
                <StatCard key={d.name} label={d.name} value={`${d.score}`} sub={d.driver} tone={scoreTone(d.score)} />
              ))}
            </div>
            <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200/80">{eco.campaignScore.honesty}</p>
          </div>

          {/* Analysis + objective */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Brain className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Business analysis</h3></div>
              <p className="text-sm text-slate-300">{eco.businessAnalysis.read}</p>
              <p className="mt-2 text-sm text-slate-400">{eco.businessAnalysis.demandSignal}</p>
              <div className="mt-3"><Pill tone="info">Vertical: {eco.vertical}</Pill></div>
            </div>
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Objective</h3></div>
              <p className="text-lg font-semibold text-white">{eco.objective.objective}</p>
              <p className="mt-1 text-sm text-slate-400">{eco.objective.why}</p>
              <p className="mt-2 text-sm text-emerald-300">Primary channel: {eco.objective.primaryChannel}</p>
            </div>
          </div>

          {/* Psychology */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2"><Brain className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Customer psychology</h3></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 text-sm">
              {([["Triggers", eco.psychology.triggers], ["Fears", eco.psychology.fears], ["Aspirations", eco.psychology.aspirations], ["Motivations", eco.psychology.motivations], ["Local slang", eco.psychology.slang]] as const).map(([k, v]) => (
                <div key={k}><p className="label">{k}</p><ul className="space-y-1 text-slate-300">{v.map((x) => <li key={x}>· {x}</li>)}</ul></div>
              ))}
            </div>
          </div>

          {/* Offers */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2"><BadgePercent className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Scored offers</h3><Pill tone="good">Recommended: {eco.recommendedOffer.archetype}</Pill></div>
            <div className="space-y-3">
              {eco.offers.map((o) => (
                <div key={o.archetype} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-4">
                  <div className="flex items-center justify-between"><span className="font-semibold text-white">{o.archetype}</span><Pill tone={o.marginFlag ? "bad" : scoreTone(o.score)}>{o.score}/100</Pill></div>
                  <p className="mt-1 text-sm text-slate-300">{o.offer}</p>
                  <p className={`mt-1 text-xs ${o.marginFlag ? "text-red-300" : "text-slate-500"}`}>{o.note}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Copy + Visuals */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><PenLine className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Copy (AIDA / PAS)</h3></div>
              <p className="mb-3 text-base font-semibold text-white">{eco.copy.headline}</p>
              <p className="label">AIDA</p><pre className="mb-3 whitespace-pre-wrap text-sm text-slate-300">{eco.copy.aida}</pre>
              <p className="label">PAS</p><pre className="mb-3 whitespace-pre-wrap text-sm text-slate-300">{eco.copy.pas}</pre>
              <p className="label">Hooks</p><ul className="space-y-1 text-sm text-slate-300">{eco.copy.hooks.map((h) => <li key={h}>· {h}</li>)}</ul>
              <p className="mt-2 text-sm text-emerald-300">CTA: {eco.copy.cta}</p>
            </div>
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Visual concepts</h3></div>
              <div className="space-y-3">
                {eco.visuals.map((v) => (
                  <div key={v.platform} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                    <p className="font-semibold text-white">{v.platform}</p>
                    <p className="text-sm text-slate-300">{v.concept}</p>
                    <p className="mt-1 text-xs text-emerald-300/80">Triggers: {v.attentionTriggers.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Hashtags + Payloads */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Hash className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Scored hashtags</h3></div>
              <div className="flex flex-wrap gap-2">
                {eco.hashtags.map((h) => (
                  <span key={h.tag} className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-ink-900/50 px-2.5 py-1 text-xs text-slate-300">
                    {h.tag}<span className="text-emerald-400">{h.score}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Share2 className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Multi-platform payloads</h3><Pill tone="info">one campaign → {eco.payloads.length} formats</Pill></div>
              <div className="space-y-2 text-sm">
                {eco.payloads.map((p) => (
                  <div key={p.channel} className="flex gap-3"><span className="w-32 shrink-0 font-semibold text-white">{p.channel}</span><span className="text-slate-400">{p.asset}</span></div>
                ))}
              </div>
            </div>
          </div>

          {/* Landing page + Distribution */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Layout className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Landing page spec</h3></div>
              <ol className="space-y-1 text-sm text-slate-300">{eco.landingPage.sections.map((s, i) => <li key={i}>{i + 1}. {s}</li>)}</ol>
              <p className="mt-3 text-xs text-slate-500">{eco.landingPage.conversionNote}</p>
            </div>
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Send className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Distribution plan</h3></div>
              <p className="text-sm text-slate-300"><span className="text-slate-500">Where:</span> {eco.distribution.where.join(" · ")}</p>
              <p className="mt-1 text-sm text-slate-300"><span className="text-slate-500">When:</span> {eco.distribution.when}</p>
              <p className="mt-1 text-sm text-slate-300"><span className="text-slate-500">Sequence:</span> {eco.distribution.sequence}</p>
              <div className="mt-3 space-y-1 text-sm">
                {eco.distribution.budgetSplit.map((b) => (
                  <div key={b.label} className="flex justify-between"><span className="text-slate-400">{b.label}</span><span className="font-semibold text-white">{b.amount} {b.currency}</span></div>
                ))}
              </div>
              <p className="mt-3 text-xs text-emerald-300/80">{eco.distribution.frequencyCap}</p>
              <p className="mt-1 text-xs text-slate-500">{eco.distribution.note}</p>
            </div>
          </div>

          {/* Autonomy */}
          <div className="card border-emerald-500/20 p-6">
            <div className="mb-2 flex items-center gap-2"><Swords className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Autonomy — Level {eco.autonomy.level}: {eco.autonomy.name}</h3></div>
            <p className="text-sm text-slate-300">{eco.autonomy.runs}</p>
            <p className="mt-1 text-sm text-slate-400">You approve: <span className="text-white">{eco.autonomy.youApprove}</span></p>
          </div>
        </div>
      )}

      {/* The flagship agent */}
      <div className="mt-8">
        <AgentRunner
          agentId="campaign-warfare-strategist"
          buttonLabel="Design the full campaign"
          fields={[
            { key: "product", label: "What do you sell?", defaultValue: "Restaurant takeaway & catering" },
            { key: "audience", label: "Who do you want?", defaultValue: "Hungry locals within 3 miles" },
            { key: "result", label: "What result?", defaultValue: "Get WhatsApp orders" },
            { key: "location", label: "Location", defaultValue: "Your location" },
            { key: "offer", label: "Promotion / offer (optional)", defaultValue: "Friday platter — 40 only" },
          ]}
        />
      </div>
    </div>
  );
}
