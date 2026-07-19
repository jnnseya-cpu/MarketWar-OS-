"use client";

// M-35 Viral Amplification & Retargeting — Reach Amplifier.
// Spec: docs/ai-os/12-amplification-engine.md. Live viral-coefficient math +
// frequency-governance explainer wired to the real backend (/api/amplify);
// full loop automation and channel execution land at P1.

import { useState } from "react";
import {
  GitBranch,
  Loader2,
  Repeat,
  Rocket,
  ShieldCheck,
  Share2,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { AreaChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";

const PRINCIPLES = [
  { icon: Share2, title: "Reach is earned", desc: "Viral loops compound through people who choose to share — referral rewards, UGC, affiliates. We measure the viral coefficient honestly and never claim a fixed multiplier." },
  { icon: UserCheck, title: "Follow-up is consented", desc: "Retargeting reaches only people who touched your funnel — clicked, messaged, started a form — on channels they opted into. Never strangers, never cross-web surveillance." },
  { icon: Repeat, title: "Relentless, until they act", desc: "Each lead advances through the sequence until they convert or opt out — the persistence you want, aimed only where it's lawful and welcome." },
  { icon: ShieldCheck, title: "Frequency governed", desc: "Hard cap of 5 touches per rolling 7 days per person across all channels. This keeps your ad accounts live, your domain out of spam, and you inside PECR." },
];

export default function AmplifyPage() {
  const [inputs, setInputs] = useState({ seedAudience: 1000, shareRate: 0.15, invitesPerSharer: 3, inviteConversion: 0.25, cycles: 6 });
  const [proj, setProj] = useState<{ k: number; viral: boolean; totalReach: number; perCycle: number[]; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function calc() {
    setBusy(true);
    try {
      const res = await fetch("/api/amplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "virality", ...inputs }),
      });
      setProj(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof inputs, label: string, step: string, max?: number) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-400">{label}</span>
      <input
        type="number"
        step={step}
        value={inputs[key]}
        onChange={(e) => setInputs((v) => ({ ...v, [key]: Math.min(max ?? Infinity, Math.max(0, Number(e.target.value))) }))}
        className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60"
      />
    </label>
  );

  return (
    <div>
      <PageHeader
        kicker="Reach Amplifier"
        title="Maximum reach, relentless follow-up — the legal way"
        subtitle="Earned virality that compounds through people who choose to share, plus consent-based retargeting that pursues every lead until they convert or opt out. Built inside frequency caps and PECR — so it keeps working instead of getting you banned."
        actions={<Pill tone="info">Module M-35 · Agent 24 · loop automation at P1</Pill>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="card border-emerald-500/20 p-4">
            <p.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-emerald-300">{p.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Live viral coefficient calculator */}
      <div className="mb-8 card p-5">
        <div className="mb-1 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-emerald-400" />
          <h2 className="font-display font-bold text-white">Viral coefficient calculator</h2>
          <span className="text-xs text-slate-500">— the honest math, computed live in the backend</span>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          K = invites per sharer × invite conversion × share rate. K ≥ 1 means a self-sustaining loop; below 1 it
          amplifies then tapers. No inflated multipliers — just what the mechanics actually produce.
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {field("seedAudience", "Seed audience", "50")}
          {field("shareRate", "Share rate (0–1)", "0.01", 1)}
          {field("invitesPerSharer", "Invites per sharer", "0.5")}
          {field("inviteConversion", "Invite conversion (0–1)", "0.01", 1)}
          {field("cycles", "Cycles", "1")}
        </div>
        <button type="button" onClick={calc} disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />} Project reach
        </button>

        {proj && (
          <div className="mt-5 grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatCard label="Viral coefficient K" value={`${proj.k}`} sub={proj.viral ? "self-sustaining" : "amplifying, not self-sustaining"} tone={proj.viral ? "good" : "warn"} />
              <StatCard label="Projected total reach" value={proj.totalReach.toLocaleString()} sub={`from ${inputs.seedAudience.toLocaleString()} seed`} tone="good" />
              <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">{proj.note}</p>
            </div>
            <div className="card p-4 lg:col-span-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">New reach per cycle</h3>
              <AreaChart
                labels={proj.perCycle.map((_, idx) => `C${idx + 1}`)}
                series={[{ name: "New reach", data: proj.perCycle.length ? proj.perCycle : [0] }]}
                height={180}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the Amplification Strategist</h2>
      </div>
      <AgentRunner
        agentId="amplification-strategist"
        buttonLabel="Design the viral loop + retargeting sequence"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Market", defaultValue: "Brixton, London" },
          {
            key: "offer",
            label: "Offer to amplify & the audience you already have",
            defaultValue:
              "Friday £25 family platter; a vault of ~1,240 past orderers and leads with WhatsApp/email consent, plus new ad traffic",
            textarea: true,
          },
        ]}
      />
    </div>
  );
}
