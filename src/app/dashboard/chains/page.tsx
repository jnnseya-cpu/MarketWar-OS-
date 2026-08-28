"use client";

// Agent chains — several agents on one job, in order, sharing what they know.
//
// The screen is deliberately explicit about three things the output alone
// cannot show: which steps will NOT run on their own, what a run is allowed to
// cost when nobody is watching, and — when you compose your own — that the
// effect of a step is decided by the agent rather than by you.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronRight, Loader2, Lock, PlayCircle, Plus, Trash2, Workflow } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import OneClickCampaign from "@/components/OneClickCampaign";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Effect = "draft" | "spend" | "send" | "publish";
type Step = { id: string; agentId: string; effect: Effect; purpose: string; costAcu: number };
type ChainView = { id: string; label: string; goal: string; custom: boolean; steps: Step[]; runnableSteps: number; approvalSteps: number; plannedCostAcu: number };
type AgentOption = { id: string; name: string; role: string; effect: Effect };
type Schedule = { chainId: string; enabled: boolean; cadenceDays: number; lastRunAt?: string; due: boolean };
type StepResult = { stepId: string; agentName: string; effect: string; status: string; costAcu: number; output?: string; approvalId?: string; reason?: string };
type Run = { chainId: string; steps: StepResult[]; spentAcu: number; ran: number; queued: number; skipped: number; doctrine: string };
type Budget = { capAcu: number; spentAcu: number; remainingAcu: number; day: string };

const EFFECT: Record<Effect, { tone: "good" | "warn" | "bad" | "info"; label: string }> = {
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
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [authoringNote, setAuthoringNote] = useState("");
  const [maxSteps, setMaxSteps] = useState(12);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [doctrine, setDoctrine] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // Composer state
  const [label, setLabel] = useState("");
  const [goal, setGoal] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);

  const load = useCallback(async () => {
    const q = activeBrand?.id ? `?brandId=${encodeURIComponent(activeBrand.id)}` : "";
    try {
      const d = await (await authedFetch(`/api/orchestrator${q}`)).json();
      setChains(Array.isArray(d?.chains) ? d.chains : []);
      setAgents(Array.isArray(d?.authoring?.agents) ? d.authoring.agents : []);
      setAuthoringNote(d?.authoring?.note || "");
      setMaxSteps(Number(d?.authoring?.maxSteps) || 12);
      setSchedules(Array.isArray(d?.schedules) ? d.schedules : []);
      setBudget(d?.budget || null);
      setDoctrine(d?.doctrine || "");
    } catch { setError("Could not load the chains."); }
  }, [activeBrand?.id]);

  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>, tag: string) {
    if (!activeBrand?.id) { setError("Pick a brand first."); return null; }
    setBusy(tag); setError("");
    try {
      const res = await authedFetch("/api/orchestrator", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || (Array.isArray(data?.errors) ? data.errors.join(" · ") : "That did not work.")); return null; }
      return data;
    } catch { setError("Could not reach the orchestrator."); return null; } finally { setBusy(""); }
  }

  async function go(chainId: string) {
    setRun(null);
    const data = await post({
      action: "run", chainId,
      input: { business: activeBrand?.name, industry: activeBrand?.industry, location: activeBrand?.location },
    }, `run:${chainId}`);
    if (data) setRun(data);
  }

  async function save() {
    const data = await post({ action: "save", chain: { label, goal, steps: picked.map((agentId) => ({ agentId })) } }, "save");
    if (data) { setNotes(Array.isArray(data.notes) ? data.notes : []); setLabel(""); setGoal(""); setPicked([]); load(); }
  }

  async function schedule(chainId: string, enabled: boolean, cadenceDays: number) {
    if (await post({ action: "schedule", chainId, enabled, cadenceDays }, `sched:${chainId}`)) load();
  }

  const scheduleOf = (id: string) => schedules.find((s) => s.chainId === id);

  return (
    <div>
      <PageHeader
        kicker="Agent chains"
        title="Several agents, one job, in order"
        subtitle="Each step is handed what the brand's memory holds and what the earlier steps produced, so the output is one connected answer rather than several unrelated ones. Anything that would spend, send or publish stops and waits for you — including overnight."
        actions={<Pill tone="info">drafts freely · acts never</Pill>}
      />

      {/* §102 — say what you want; the plan comes back before anything runs. */}
      <OneClickCampaign />

      {doctrine && <p className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-400">{doctrine}</p>}

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
            This limits what the orchestrator spends on its own overnight. Anything you run yourself is governed by your ACU balance, not by this.
          </p>
        </div>
      )}

      {error && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {chains.map((c) => {
          const s = scheduleOf(c.id);
          return (
            <div key={c.id} className="card p-5">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Workflow className="h-4 w-4 text-emerald-400" />
                <h2 className="font-display text-lg font-bold text-white">{c.label}</h2>
                {c.custom && <Pill tone="info">yours</Pill>}
                {s?.enabled && <Pill tone="good"><CalendarClock className="mr-1 inline h-3 w-3" />every {s.cadenceDays}d</Pill>}
              </div>
              <p className="mb-3 text-sm text-slate-400">{c.goal}</p>
              <ol className="mb-3 space-y-1.5">
                {c.steps.map((st, i) => (
                  <li key={st.id} className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-ink-900/40 p-2.5">
                    <span className="mt-0.5 text-[11px] font-bold text-slate-600">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{st.purpose}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="font-mono">{st.agentId}</span>
                        <Pill tone={EFFECT[st.effect].tone}>{EFFECT[st.effect].label}</Pill>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-primary" onClick={() => go(c.id)} disabled={busy === `run:${c.id}`}>
                  {busy === `run:${c.id}` ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : <><PlayCircle className="h-4 w-4" /> Run it</>}
                </button>
                <select
                  className="input max-w-[190px]"
                  value={s?.enabled ? String(s.cadenceDays) : "off"}
                  onChange={(e) => schedule(c.id, e.target.value !== "off", e.target.value === "off" ? 7 : Number(e.target.value))}
                  disabled={busy === `sched:${c.id}`}
                >
                  <option value="off">Not scheduled</option>
                  <option value="1">Run daily</option>
                  <option value="7">Run weekly</option>
                  <option value="30">Run monthly</option>
                </select>
                {c.custom && (
                  <button className="btn-ghost" onClick={async () => { if (await post({ action: "delete", chainId: c.id }, `del:${c.id}`)) load(); }}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                )}
                <span className="text-xs text-slate-500">{c.runnableSteps} drafted · {c.approvalSteps} for you · ~{c.plannedCostAcu} ACUs</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compose your own */}
      <div className="mt-8 card border-violet-500/30 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Plus className="h-5 w-5 text-violet-400" />
          <h2 className="font-display text-lg font-bold text-white">Build your own chain</h2>
        </div>
        <p className="mb-3 text-sm text-slate-400">
          Pick the agents, in the order you want them to think. Each one is handed what the ones before it produced.
        </p>
        {authoringNote && <p className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-400">{authoringNote}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Name</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Monday morning look" /></div>
          <div><label className="label">What it is for</label><input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Find the one thing worth doing this week" /></div>
        </div>

        <div className="mt-3">
          <label className="label">Steps ({picked.length}/{maxSteps})</label>
          <ol className="mb-2 space-y-1.5">
            {picked.map((id, i) => {
              const a = agents.find((x) => x.id === id);
              return (
                <li key={`${id}-${i}`} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-ink-900/40 p-2.5">
                  <span className="text-[11px] font-bold text-slate-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{a?.name || id}</p>
                    <p className="text-[11px] text-slate-500">{a?.role}</p>
                  </div>
                  {a && <Pill tone={EFFECT[a.effect].tone}>{EFFECT[a.effect].label}</Pill>}
                  <button className="text-slate-500 hover:text-rose-300" onClick={() => setPicked(picked.filter((_, j) => j !== i))} aria-label="Remove step">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ol>
          <select
            className="input"
            value=""
            onChange={(e) => { if (e.target.value && picked.length < maxSteps) setPicked([...picked, e.target.value]); }}
          >
            <option value="">Add an agent…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
          </select>
        </div>

        <button className="btn-primary mt-4" onClick={save} disabled={busy === "save" || !label || !goal || !picked.length}>
          {busy === "save" ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Plus className="h-4 w-4" /> Save the chain</>}
        </button>
        {notes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {notes.map((n, i) => <li key={i} className="text-xs leading-relaxed text-amber-200/80">· {n}</li>)}
          </ul>
        )}
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
                  {s.output && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">{s.output}</pre>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
