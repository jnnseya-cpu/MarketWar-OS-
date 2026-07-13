"use client";

import { useState } from "react";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { AgentMarkdown, Pill } from "@/components/ui";
import type { AgentResult } from "@/shared/types";

export interface AgentField {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  textarea?: boolean;
}

// Generic client harness: renders an intake form for an agent, POSTs to the
// agent API and renders the markdown result. Used across every module page.
export default function AgentRunner({
  agentId,
  buttonLabel,
  fields,
  autoRunLabel,
}: {
  agentId: string;
  buttonLabel: string;
  fields: AgentField[];
  autoRunLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? ""]))
  );
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data as AgentResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent execution failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="card p-5 lg:col-span-2">
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`${agentId}-${f.key}`}>
                {f.label}
              </label>
              {f.textarea ? (
                <textarea
                  id={`${agentId}-${f.key}`}
                  className="input min-h-[84px]"
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  id={`${agentId}-${f.key}`}
                  className="input"
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? "Agent working…" : buttonLabel}
          </button>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </div>

      <div className="card p-5 lg:col-span-3">
        {result ? (
          <div>
            <div className="mb-4 flex items-center justify-between border-b border-ink-700 pb-3">
              <p className="font-display text-sm font-bold text-white">{result.agentName}</p>
              <Pill tone={result.mode === "live" ? "good" : "info"}>
                {result.mode === "live" ? "Live intelligence" : "Demo intelligence"}
              </Pill>
            </div>
            <AgentMarkdown text={result.output} />
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
            <Sparkles className="mb-3 h-8 w-8 text-emerald-500/60" />
            <p className="max-w-xs text-sm text-slate-500">
              {autoRunLabel ??
                "Fill in the mission parameters and deploy the agent. Output renders here."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
