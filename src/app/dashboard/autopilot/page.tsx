"use client";

// Revenue Autopilot — find customers while you sleep.
// Runs an acquisition cycle for the active brand, governed by the autonomy dial.
// Auto-executes owned/low-risk moves, queues the rest for approval. Real revenue
// shows in Revenue as customers convert — Autopilot never fabricates money.

import { useState } from "react";
import Link from "next/link";
import { Loader2, Moon, ShieldCheck, Zap, CheckCircle2, Clock, Building2, Wallet, ArrowRight } from "lucide-react";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Action = { id: string; kind: string; title: string; rationale: string; channel: string; riskCategory: string; requiredLevel: number; projectedValueGbp: number; decision: "auto_executed" | "queued_for_approval" };
type Run = { brandName: string; grantedLevel: number; requestedLevel: number; autonomyCapped: boolean; autonomyReason: string; budgetGbp: number; opportunitiesScanned: number; actions: Action[]; autoExecuted: number; queued: number; projectedRevenueGbp: number; digest: string; guardrails: string[] };

const LEVELS = ["L0 · Draft", "L1 · Approve each", "L2 · Campaign approval", "L3 · Guarded autopilot", "L4 · Revenue autopilot"];

export default function AutopilotPage() {
  const { activeBrand } = useActiveBrand();
  const [level, setLevel] = useState(3);
  const [budget, setBudget] = useState("0");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  async function runCycle() {
    if (!activeBrand) return;
    setBusy(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: activeBrand, requestedLevel: level, budgetGbp: Number(budget) || 0 }),
      });
      setRun(await res.json());
    } finally { setBusy(false); }
  }

  if (!activeBrand) {
    return (
      <div>
        <PageHeader kicker="Revenue Autopilot" title="Find customers while you sleep" subtitle="Add a brand to let the agents work for it unattended." />
        <div className="card flex flex-col items-center gap-3 p-12 text-center"><Building2 className="h-8 w-8 text-emerald-500/60" /><p className="max-w-sm text-sm text-slate-400">Add a brand in the sidebar, then Autopilot runs its acquisition loop for that brand.</p></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Revenue Autopilot"
        title="Find customers while you sleep"
        subtitle="The agents scan the highest-£ acquisition moves for your brand and, within your autonomy limits, run the owned/low-risk ones automatically — queuing the rest for approval. Real revenue appears in Revenue as customers convert; Autopilot never invents money."
        actions={<span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300"><Building2 className="h-3.5 w-3.5" style={{ color: activeBrand.color }} /> {activeBrand.name}</span>}
      />

      {/* Controls */}
      <div className="mb-6 card p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="label">Autonomy level</label>
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map((l, i) => (
                <button key={l} onClick={() => setLevel(i)} className={`flex-1 rounded-md px-2 py-2 text-[11px] font-bold transition ${i === level ? "bg-emerald-500 text-ink-950" : "bg-ink-700/60 text-slate-300 hover:bg-ink-700"}`} title={l}>L{i}</button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{LEVELS[level]} — high-risk categories (children, health, regulated) are always capped to approval.</p>
          </div>
          <div>
            <label className="label">Spend cap for this cycle (£)</label>
            <input className="input" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0 = owned channels only" />
          </div>
        </div>
        <button className="btn-primary mt-4" onClick={runCycle} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Running a cycle…</> : <><Zap className="h-4 w-4" /> Run a cycle now</>}
        </button>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Moon className="h-3.5 w-3.5" /> Schedule this nightly (cron → POST /api/autopilot) and it runs while you sleep — see docs/AUTOPILOT.md.</p>
      </div>

      {run && (
        <>
          <div className="mb-6 card border-emerald-500/25 bg-emerald-500/[0.04] p-5">
            <div className="mb-1 flex items-center gap-2"><Moon className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">While you were away</h2></div>
            <p className="text-sm text-slate-300">{run.digest}</p>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Moves scanned" value={`${run.opportunitiesScanned}`} />
            <StatCard label="Auto-executed" value={`${run.autoExecuted}`} tone={run.autoExecuted > 0 ? "good" : "neutral"} />
            <StatCard label="Queued for you" value={`${run.queued}`} tone={run.queued > 0 ? "warn" : "neutral"} />
            <StatCard label="Projected pipeline" value={money(run.projectedRevenueGbp)} sub="estimate — not booked" />
          </div>

          <div className="mb-6 space-y-2.5">
            {run.actions.map((a) => (
              <div key={a.id} className="card flex items-start gap-3 p-4">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${a.decision === "auto_executed" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                  {a.decision === "auto_executed" ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{a.title}</p>
                    <Pill tone={a.decision === "auto_executed" ? "good" : "warn"}>{a.decision === "auto_executed" ? "auto-executed" : "queued — approve"}</Pill>
                    {a.riskCategory === "high" && <Pill tone="bad">high-risk · gated</Pill>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-400">{a.rationale}</p>
                  <p className="mt-1 text-xs text-slate-500">{a.channel} · projected {money(a.projectedValueGbp)} · needs L{a.requiredLevel}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-6 card p-5">
            <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Guardrails</h3></div>
            <ul className="space-y-1 text-xs text-slate-400">{run.guardrails.map((g, i) => <li key={i}>• {g}</li>)}</ul>
          </div>

          <div className="card flex flex-wrap items-center justify-between gap-4 border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-emerald-400" /><p className="text-sm text-slate-300">Real money from these moves appears in <span className="font-semibold text-white">Revenue</span> as customers convert — nothing here is booked revenue.</p></div>
            <Link href="/dashboard/revenue" className="btn-primary">Open Revenue <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </>
      )}
    </div>
  );
}
