"use client";

// Strategy Agents — the 7 core marketing strategy agents as one connected
// workflow. Each agent runs through the live AI gateway and its output chains
// into the next as context: avatar → message → channels → 90-day content →
// funnel → paid-ads → battle plan.

import { useState } from "react";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { PageHeader, Pill, AgentMarkdown } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { STRATEGY_AGENTS } from "@/shared/strategy-agents";

type Result = { output: string; mode: "live" | "demo" };

export default function AiAgentsPage() {
  const { activeBrand } = useActiveBrand();
  const [business, setBusiness] = useState("");
  const [fields, setFields] = useState<Record<string, Record<string, string>>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const businessText = business.trim() || activeBrand?.name || "";

  function setField(agentId: string, name: string, value: string) {
    setFields((prev) => ({ ...prev, [agentId]: { ...(prev[agentId] || {}), [name]: value } }));
  }

  function priorContext(order: number): string {
    return STRATEGY_AGENTS
      .filter((a) => a.order < order && results[a.id])
      .map((a) => `### ${a.name}\n${results[a.id].output.slice(0, 1400)}`)
      .join("\n\n");
  }

  async function run(agentId: string, order: number) {
    if (!businessText) { setError("Add your business context at the top first."); return; }
    setBusyId(agentId); setError(null);
    try {
      const res = await authedFetch("/api/ai-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, input: { business: businessText, ...(fields[agentId] || {}) }, priorContext: priorContext(order) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Agent failed"); return; }
      setResults((prev) => ({ ...prev, [agentId]: { output: data.output, mode: data.mode } }));
    } catch {
      setError("Could not reach the agent.");
    } finally {
      setBusyId(null);
    }
  }

  const done = Object.keys(results).length;

  return (
    <div>
      <PageHeader
        kicker="AI Marketing Command"
        title="Strategy Agents"
        subtitle="Seven connected AI agents that turn a confused business into a clear customer, message, channels, funnel and 30-day plan. Each agent builds on the last."
        actions={<Pill tone="info">{done}/{STRATEGY_AGENTS.length} complete</Pill>}
      />

      <div className="card mb-6 p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">Your business (used by every agent)</span>
          <textarea
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            rows={2}
            placeholder={activeBrand?.name ? `${activeBrand.name} — describe what you sell, to whom, and where` : "Describe your business: what you sell, to whom, and where"}
            className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60"
          />
        </label>
      </div>

      {error && <div className="card mb-4 border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">{error}</div>}

      <div className="space-y-4">
        {STRATEGY_AGENTS.map((a) => {
          const r = results[a.id];
          const busy = busyId === a.id;
          return (
            <div key={a.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">{a.order}</span>
                    <h3 className="font-display text-sm font-bold text-white">{a.name}</h3>
                    {r && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {r?.mode === "demo" && <Pill tone="warn">preview</Pill>}
                  </div>
                  <p className="text-xs text-slate-400">{a.purpose}</p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-slate-500">{a.acu} ACUs</span>
              </div>

              {a.fields.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {a.fields.map((f) => (
                    <label key={f.name} className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-400">{f.label}</span>
                      <input
                        value={fields[a.id]?.[f.name] || ""}
                        onChange={(e) => setField(a.id, f.name, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60"
                      />
                    </label>
                  ))}
                </div>
              )}

              <button onClick={() => run(a.id, a.order)} disabled={busy} className="btn-primary mt-3 justify-center disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {r ? "Regenerate" : "Run agent"}
              </button>

              {r && (
                <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950/40 p-4">
                  <AgentMarkdown text={r.output} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
