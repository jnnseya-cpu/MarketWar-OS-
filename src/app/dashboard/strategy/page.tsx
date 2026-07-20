"use client";

// Marketing Strategy Chain — the connected 7-agent workflow.
// Customer Avatar → Message Weapon → Channel Commander → 90-Day Content →
// Funnel Architect → Paid-Ads Risk-Control → Battle Plan. Each stage reuses the
// prior output. Wired to /api/strategy ("full" runs the whole chain).

import { useEffect, useState } from "react";
import { Loader2, Target, ListChecks } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Full = {
  avatar: { summaryParagraph: string; scores: Record<string, number> };
  messaging: { mainBrandMessage: string; uniqueValueProposition: string; objections: { objection: string; response: string }[] };
  channels: { recommendedChannels: { channel: string; reason: string }[]; channelsToAvoid: { channel: string; reason: string }[] };
  content: { contentPillars: { name: string }[]; repurposing: string };
  funnel: { stages: { stage: string }[]; landingPageType: string };
  paidAds: { ready: boolean; message?: string; fixFirst?: string[]; recommendedPlatform?: string | null };
  battlePlan: { uniqueValueProposition: string; mainMessage: string; topChannels: string[]; topKpis: string[]; landingPageRequirement: string; paidAdsApproach: string; thirtyDayActionPlan: { week: number; focus: string; actions: string[]; successMetric: string }[] };
};

const STAGES = ["Customer Avatar", "Message Weapon", "Channel Commander", "90-Day Content", "Funnel Architect", "Paid-Ads Risk-Control", "Battle Plan"];

export default function StrategyPage() {
  const { activeBrand } = useActiveBrand();
  const [form, setForm] = useState({ business: "Brixton Grill House", product: "restaurant takeaway", audience: "hungry locals within 3 miles", location: "Brixton, London", offer: "20% off first WhatsApp order", monthlyBudgetGbp: 600 });
  const [data, setData] = useState<Full | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the chain from the active brand; re-seed on brand switch.
  useEffect(() => {
    if (!activeBrand) return;
    setForm((f) => ({
      ...f,
      business: activeBrand.name || f.business,
      product: activeBrand.product || f.product,
      audience: activeBrand.audience || f.audience,
      location: activeBrand.location || f.location,
      offer: activeBrand.offer || f.offer,
    }));
    setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: k === "monthlyBudgetGbp" ? Number(e.target.value) : e.target.value }));

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "full", ...form }) });
      setData(await res.json());
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Marketing Strategy Chain · 7 connected agents"
        title="From confused to a clear 30-day plan"
        subtitle="One connected strategy engine — not isolated prompts. Each agent reuses the last: customer avatar → message → channels → 90-day content → funnel → paid-ads (risk-gated) → one-page Battle Plan. The funnel always requires a landing page; paid ads are blocked until you're ready."
        actions={<Pill tone="info">avatar → … → battle plan</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">Business</label><input className="input" value={form.business} onChange={set("business")} /></div>
          <div><label className="label">Product</label><input className="input" value={form.product} onChange={set("product")} /></div>
          <div><label className="label">Audience</label><input className="input" value={form.audience} onChange={set("audience")} /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={set("location")} /></div>
          <div><label className="label">Offer</label><input className="input" value={form.offer} onChange={set("offer")} /></div>
          <div><label className="label">Monthly budget (£)</label><input className="input" type="number" value={form.monthlyBudgetGbp} onChange={set("monthlyBudgetGbp")} /></div>
        </div>
        <button className="btn-primary mt-4" onClick={run} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Running the chain…</> : <><Target className="h-4 w-4" /> Run the strategy chain</>}
        </button>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {STAGES.map((s, i) => <Pill key={s} tone={data ? "good" : "neutral"}>{i + 1}. {s}</Pill>)}
        </div>
      </div>

      {data && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="mb-2 font-display font-bold text-white">Customer avatar</h3>
            <p className="text-sm text-slate-300">{data.avatar.summaryParagraph}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {Object.entries(data.avatar.scores).map(([k, v]) => <StatCard key={k} label={k.replace(/([A-Z])/g, " $1")} value={`${v}`} tone={v >= 70 ? "good" : v >= 55 ? "warn" : "bad"} />)}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h3 className="mb-2 font-display font-bold text-white">Message weapon</h3>
              <p className="text-sm text-white">{data.messaging.mainBrandMessage}</p>
              <p className="mt-1 text-sm text-emerald-300">{data.messaging.uniqueValueProposition}</p>
              <div className="mt-2 space-y-1 text-xs text-slate-400">{data.messaging.objections.map((o, i) => <p key={i}><span className="text-slate-500">"{o.objection}"</span> → {o.response}</p>)}</div>
            </div>
            <div className="card p-6">
              <h3 className="mb-2 font-display font-bold text-white">Channel commander</h3>
              {data.channels.recommendedChannels.map((c) => <p key={c.channel} className="text-sm text-slate-300">✓ <span className="text-white">{c.channel}</span> — {c.reason}</p>)}
              {data.channels.channelsToAvoid.map((c) => <p key={c.channel} className="mt-1 text-xs text-slate-500">✗ Avoid {c.channel}: {c.reason}</p>)}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h3 className="mb-2 font-display font-bold text-white">90-day content + funnel</h3>
              <p className="text-sm text-slate-400">Pillars: {data.content.contentPillars.map((p) => p.name).join(" · ")}</p>
              <p className="mt-1 text-xs text-slate-500">{data.content.repurposing}</p>
              <p className="mt-2 text-sm text-slate-300">10-stage funnel → landing page: <span className="text-emerald-300">{data.funnel.landingPageType}</span></p>
            </div>
            <div className="card p-6">
              <h3 className="mb-2 font-display font-bold text-white">Paid-ads risk control</h3>
              <Pill tone={data.paidAds.ready ? "good" : "bad"}>{data.paidAds.ready ? "Ready" : "Do not spend yet"}</Pill>
              {data.paidAds.ready ? <p className="mt-2 text-sm text-slate-300">{data.paidAds.recommendedPlatform}</p> : <ul className="mt-2 text-sm text-amber-200/80">{data.paidAds.fixFirst?.map((f, i) => <li key={i}>· {f}</li>)}</ul>}
            </div>
          </div>

          <div className="card border-emerald-500/30 p-6">
            <div className="mb-2 flex items-center gap-2"><ListChecks className="h-5 w-5 text-emerald-400" /><h3 className="font-display text-lg font-bold text-white">One-page Battle Plan</h3></div>
            <p className="text-sm text-white">{data.battlePlan.mainMessage}</p>
            <p className="mt-1 text-sm text-slate-400">Channels: {data.battlePlan.topChannels.join(" · ")} · KPIs: {data.battlePlan.topKpis.join(" · ")}</p>
            <p className="mt-1 text-xs text-emerald-300/80">{data.battlePlan.landingPageRequirement}</p>
            <p className="mt-1 text-xs text-slate-500">{data.battlePlan.paidAdsApproach}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {data.battlePlan.thirtyDayActionPlan.map((w) => (
                <div key={w.week} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                  <p className="text-sm font-semibold text-white">Week {w.week}: {w.focus}</p>
                  <ul className="mt-1 text-xs text-slate-400">{w.actions.map((a, i) => <li key={i}>· {a}</li>)}</ul>
                  <p className="mt-1 text-[11px] text-emerald-300/70">✓ {w.successMetric}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AgentRunner agentId="customer-avatar" buttonLabel="Build the avatar" fields={[
          { key: "audience", label: "Audience", defaultValue: "hungry locals within 3 miles" },
          { key: "location", label: "Location", defaultValue: "Brixton, London" },
        ]} />
        <AgentRunner agentId="marketing-battle-plan" buttonLabel="Write the battle plan" fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "industry", label: "Industry", defaultValue: "food delivery" },
          { key: "location", label: "Location", defaultValue: "Brixton, London" },
        ]} />
      </div>
    </div>
  );
}
