"use client";

// Agent chains — several agents on one job, in order, sharing what they know.
//
// The screen is deliberately explicit about two things a customer cannot see
// from the output alone: which steps will NOT run on their own (anything that
// spends, sends or publishes), and what the run is allowed to cost when nobody
// is watching.

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, Lock, PlayCircle, Workflow } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Step = { id: string; agentId: string; effect: "draft" | "spend" | "send" | "publish"; purpose: string; costAcu: number };
type ChainView = { id: string; label: string; goal: string; steps: Step[]; runnableSteps: number; approvalSteps: number; plannedCostAcu: number };
type StepResult = { stepId: string; agentName: string; effect: string; status: string; costAcu: number; output?: string; approvalId?: string; reason?: string };
type Run = { chainId: string; steps: StepResult[]; spentAcu: number; ran: number; queued: number; skipped: number; doctrine: string };
type Budget = { capAcu: number; spentAcu: number; remainingAcu: number; day: string };

const EFFECT: Record<Step["effect"], { tone: "good" | "warn" | "bad" | "info"; label: string }> = {
  draft: { tone: "good", label: "drafts — runs on its own" },
  spend: { tone: "bad", label: "spends money — needs you" },
  send: { tone: "bad", label: "contacts people — needs you" },
  publish: { tone: "warn", label: "goes public — needs you" },
};

const STATUS: Record<string, { tone: "good" | "warn" | "bad" | "info"; label: string }> = {
  ran: { tone: "good", label: "drafted" },
  queued_for_approval: { tone: "warn", label: "waiting for you" },
  skipped_daily_cap: { tone: "info", label: "skipped — daily ceiling" },
  failed: { tone: "bad", label: "failed" },
};

export default function ChainsPage() {
  const { activeBrand } = useActiveBrand();
  const [chains, setChains] = useState<ChainView[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [doctrine, setDoctrine] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = activeBrand?.id ? `?brandId=${encodeURIComponent(activeBrand.id)}` : "";
    fetch(`/api/orchestrator${q}`)
      .then((r) => r.json())
      .then((d) => {
        setChains(Array.isArray(d?.chains) ? d.chains : []);
        setBudget(d?.budget || null);
        setDoctrine(d?.doctrine || "");
      })
      .catch(() => setError("Could not load the chains."));
  }, [activeBrand?.id]);

  async function go(chainId: string) {
    if (!activeBrand?.id) { setError("Pick a brand first."); return; }
    setBusy(chainId); setError(""); setRun(null);
    try {
      const res = await fetch("/api/orchestrator", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run", chainId, brandId: activeBrand.id,
          input: { business: activeBrand.name, industry: activeBrand.industry, location: activeBrand.location },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "The chain did not run."); return; }
      setRun(data);
    } catch { setError("Could not reach the orchestrator."); } finally { setBusy(""); }
  }

  return (
    <div>
      <PageHeader
        kicker="Agent chains"
        title="Several agents, one job, in order"
        subtitle="Each step is handed what the brand's memory holds and what the earlier steps produced, so the output is one connected answer rather than several unrelated ones. Anything that would spend, send or publish stops and waits for you."
        actions={<Pill tone="info">drafts freely · acts never</Pill>}
      />

      {doctrine && (
        <p className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-400">{doctrine}</p>
      )}

      {budget && (
        <div className="mb-6 card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Lock className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-300">
              Unattended ceiling today: <span className="tabular-nums text-white">{budget.spentAcu}</span> / {budget.capAcu} ACUs used
            </span>
            <Pill tone={budget.remainingAcu > 0 ? "good" : "warn"}>{budget.remainingAcu} left</Pill>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            This limits what the orchestrator spends on its own initiative overnight. Anything you run yourself is governed by your ACU balance, not by this.
          </p>
        </div>
      )}

      {error && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {chains.map((c) => (
          <div key={c.id} className="card p-5">
            <div className="mb-1 flex items-center gap-2">
              <Workflow className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display text-lg font-bold text-white">{c.label}</h2>
            </div>
            <p className="mb-3 text-sm text-slate-400">{c.goal}</p>
            <ol className="mb-3 space-y-1.5">
              {c.steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-ink-900/40 p-2.5">
                  <span className="mt-0.5 text-[11px] font-bold text-slate-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{s.purpose}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="font-mono">{s.agentId}</span>
                      <Pill tone={EFFECT[s.effect].tone}>{EFFECT[s.effect].label}</Pill>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={() => go(c.id)} disabled={busy === c.id}>
                {busy === c.id ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : <><PlayCircle className="h-4 w-4" /> Run the chain</>}
              </button>
              <span className="text-xs text-slate-500">
                {c.runnableSteps} drafted · {c.approvalSteps} for you · ~{c.plannedCostAcu} ACUs
              </span>
            </div>
          </div>
        ))}
      </div>

      {run && (
        <div className="mt-8 card border-emerald-500/30 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ChevronRight className="h-5 w-5 text-emerald-400" />
            <h2 className="font-display text-lg font-bold text-white">Result</h2>
            <Pill tone="good">{run.ran} drafted</Pill>
            {run.queued > 0 && <Pill tone="warn">{run.queued} waiting for you</Pill>}
            {run.skipped > 0 && <Pill tone="info">{run.skipped} skipped</Pill>}
            <span className="ml-auto text-xs text-slate-500">{run.spentAcu} ACUs</span>
          </div>
          <div className="space-y-3">
            {run.steps.map((s) => {
              const st = STATUS[s.status] || { tone: "info" as const, label: s.status };
              return (
                <div key={s.stepId} className="rounded-xl border border-white/10 bg-ink-900/50 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">{s.agentName}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    {s.approvalId && <span className="text-[11px] text-slate-500">approval {s.approvalId}</span>}
                  </div>
                  {s.reason && (
                    <p className="mb-1.5 flex gap-1.5 text-xs leading-relaxed text-amber-200/80">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{s.reason}
                    </p>
                  )}
                  {s.output && (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">{s.output}</pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
