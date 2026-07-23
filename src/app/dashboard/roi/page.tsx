"use client";

// AI Marketing ROI Engine — the growth-channel arbitrator command surface.
// "Where is the next customer cheapest?" Compares channels by predicted CAC /
// conversion / ROI, allocates budget (owned channels first), and gates spend
// behind the AI Marketing Guarantee Score. Wired to /api/roi. Estimates only —
// re-ranked on real performance; no guaranteed results, no policy bypass.

import { useState, useEffect } from "react";
import { Loader2, Coins, Target, ShieldAlert, TrendingDown } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type ChannelROI = { channel: string; label: string; owned: boolean; predictedCacGbp: number; conversionProbability: number; predictedRoi: number; recommended: boolean; note: string };
type RoiReport = { business: string; objective: string; budgetGbp: number; channels: ChannelROI[]; nextCheapestCustomer: { label: string; cacGbp: number; why: string }; allocation: { channel: string; label: string; amountGbp: number; share: number; owned: boolean }[]; ownedShare: number; doctrine: string; honesty: string };
type Readiness = { scores: { name: string; score: number }[]; overall: number; verdict: string; blockers: string[]; recommendation: string };

const roiTone = (n: number): "good" | "warn" | "bad" => (n >= 3 ? "good" : n >= 1.5 ? "warn" : "bad");

export default function RoiPage() {
  const { activeBrand } = useActiveBrand();
  // No fake example business — prefill from the active brand, else empty.
  const [business, setBusiness] = useState("");
  useEffect(() => { setBusiness((b) => b || activeBrand?.name || ""); }, [activeBrand]);
  const [objective, setObjective] = useState("get orders");
  const [budget, setBudget] = useState(600);
  const [aov, setAov] = useState(40);
  const [report, setReport] = useState<RoiReport | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState<"" | "channels" | "readiness">("");

  async function runChannels() {
    setBusy("channels");
    try {
      const res = await fetch("/api/roi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "channels", business, objective, budgetGbp: budget, avgOrderValueGbp: aov }) });
      setReport(await res.json());
    } finally { setBusy(""); }
  }
  async function runReadiness() {
    setBusy("readiness");
    try {
      const res = await fetch("/api/roi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "readiness", hasOffer: true, offerStrength: 90, hasWebsite: true, hasCreatives: true, hasTargeting: false, hasTracking: false, hasFollowUp: true }) });
      setReadiness(await res.json());
    } finally { setBusy(""); }
  }

  return (
    <div>
      <PageHeader
        kicker="AI Marketing ROI Engine · Growth OS"
        title="Buy the cheapest next customer — not the most reach"
        subtitle="Every campaign starts with one question: where is your next customer cheapest? The engine compares every channel by predicted CAC, conversion probability and ROI, allocates budget to the highest-return mix (owned channels first — they lower CAC and build the moat), and blocks spend on campaigns that aren't ready. Predictions are estimates, re-ranked on real performance — no guaranteed results, no policy bypass."
        actions={<Pill tone="info">CAC · ROI · owned-first · readiness-gated</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="label">Business</label><input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder={activeBrand?.name || "Your business name"} /></div>
          <div><label className="label">Objective</label><input className="input" value={objective} onChange={(e) => setObjective(e.target.value)} /></div>
          <div><label className="label">Budget (£)</label><input className="input" type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></div>
          <div><label className="label">Avg order value (£)</label><input className="input" type="number" value={aov} onChange={(e) => setAov(Number(e.target.value))} /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={runChannels} disabled={busy === "channels"}>
            {busy === "channels" ? <><Loader2 className="h-4 w-4 animate-spin" /> Comparing…</> : <><Coins className="h-4 w-4" /> Find the cheapest customer</>}
          </button>
          <button className="btn-ghost" onClick={runReadiness} disabled={busy === "readiness"}>
            {busy === "readiness" ? <><Loader2 className="h-4 w-4 animate-spin" /> Scoring…</> : <><ShieldAlert className="h-4 w-4" /> Guarantee Score</>}
          </button>
        </div>
      </div>

      {report && (
        <div className="mb-6 space-y-4">
          <div className="card border-emerald-500/30 p-5">
            <div className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Cheapest next customer: {report.nextCheapestCustomer.label}</h3><Pill tone="good">£{report.nextCheapestCustomer.cacGbp} CAC</Pill></div>
            <p className="mt-1 text-sm text-slate-400">{report.nextCheapestCustomer.why}</p>
          </div>

          <div className="card p-6">
            <h3 className="mb-3 font-display font-bold text-white">Channel comparison</h3>
            <div className="space-y-2">
              {report.channels.map((c) => (
                <div key={c.channel} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm ${c.recommended ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/[0.07] bg-ink-900/50"}`}>
                  <span className="font-semibold text-white">{c.label} <Pill tone={c.owned ? "good" : "neutral"}>{c.owned ? "owned" : "rented"}</Pill></span>
                  <span className="flex items-center gap-3 text-xs text-slate-400">
                    <span>CAC <span className="text-slate-200">£{c.predictedCacGbp}</span></span>
                    <span>conv <span className="text-slate-200">{Math.round(c.conversionProbability * 100)}%</span></span>
                    <Pill tone={roiTone(c.predictedRoi)}>ROI {c.predictedRoi}×</Pill>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Budget allocation</h3><Pill tone="good">{Math.round(report.ownedShare * 100)}% to owned</Pill></div>
            <div className="space-y-1.5">
              {report.allocation.map((a) => (
                <div key={a.channel} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{a.label} {a.owned && <span className="text-emerald-400/70">· owned</span>}</span>
                  <span className="font-semibold text-white">£{a.amountGbp} <span className="text-slate-500">({Math.round(a.share * 100)}%)</span></span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">{report.doctrine}</p>
            <p className="mt-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-2.5 text-xs text-amber-200/80">{report.honesty}</p>
          </div>
        </div>
      )}

      {readiness && (
        <div className="mb-6 card p-6">
          <div className="mb-3 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">AI Marketing Guarantee Score</h3><Pill tone={readiness.verdict === "launch" ? "good" : readiness.verdict === "improve first" ? "warn" : "bad"}>{readiness.overall} · {readiness.verdict}</Pill></div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {readiness.scores.map((s) => <StatCard key={s.name} label={s.name} value={`${s.score}`} tone={s.score >= 70 ? "good" : s.score >= 55 ? "warn" : "bad"} />)}
          </div>
          <p className="mt-3 text-sm font-semibold text-emerald-300">{readiness.recommendation}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AgentRunner agentId="growth-roi-strategist" buttonLabel="Allocate for ROI" fields={[
          { key: "business", label: "Business", defaultValue: "Your business" },
          { key: "goal", label: "Objective", defaultValue: "get orders" },
          { key: "budget", label: "Budget", defaultValue: "£600" },
        ]} />
        <AgentRunner agentId="executive-email-writer" buttonLabel="Write the executive email" fields={[
          { key: "product", label: "Product / service", defaultValue: "AI customer-acquisition OS" },
          { key: "target", label: "Target company / sector", defaultValue: "mid-market retail" },
          { key: "role", label: "Recipient role", defaultValue: "CFO" },
          { key: "objective", label: "Objective", defaultValue: "book a 15-minute ROI teardown" },
        ]} />
      </div>
    </div>
  );
}
