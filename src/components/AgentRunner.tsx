"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { AgentMarkdown, Pill } from "@/components/ui";
import type { AgentResult } from "@/shared/types";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { brandDefaults, BRAND_FIELD_KEYS } from "@/shared/brand";
import ExportButton from "@/components/ExportButton";

// Light, safe markdown → HTML for the branded export report. Escapes first
// (no HTML injection from agent output), then applies a small subset: ##/###
// headings, **bold**, and •/- bullets. The report body is white-space:pre-wrap,
// so remaining line breaks render as-is.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  return esc(md || "")
    .replace(/^###\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\s*[-•]\s+(.+)$/gm, "• $1");
}

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
  onResult,
}: {
  agentId: string;
  buttonLabel: string;
  fields: AgentField[];
  autoRunLabel?: string;
  // Optional: surfaces the agent's result to a parent (e.g. to seed a Publish
  // action with the freshly generated copy). Non-breaking — most callers omit it.
  onResult?: (result: AgentResult) => void;
}) {
  const { activeBrand } = useActiveBrand();
  // A field is filled from the ACTIVE brand when its key is a known brand field
  // (business/product/audience/location/offer/industry/goal/website); otherwise
  // the page's own default stands. Switching brand refills the form below.
  // Brand fields fill from the active brand; on a clean slate (no brand) they
  // stay BLANK rather than showing a sample business. Non-brand fields keep
  // their page default (budgets, toggles, etc.).
  const fillFor = (brandFill: Record<string, string>) =>
    Object.fromEntries(
      fields.map((f) => [f.key, brandFill[f.key] ?? (BRAND_FIELD_KEYS.has(f.key) ? "" : f.defaultValue ?? "")])
    );
  const [values, setValues] = useState<Record<string, string>>(() => fillFor(brandDefaults(activeBrand)));
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-skin the form when the active brand changes.
  useEffect(() => {
    setValues(fillFor(brandDefaults(activeBrand)));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/agents/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data as AgentResult);
      onResult?.(data as AgentResult);
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
          {activeBrand && (
            <p className="text-center text-[11px] text-slate-500">
              Running for <span className="font-semibold" style={{ color: activeBrand.color }}>{activeBrand.name}</span> · switch brand in the sidebar
            </p>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </div>

      <div className="card p-5 lg:col-span-3">
        {result ? (
          <div>
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-ink-700 pb-3">
              <p className="font-display text-sm font-bold text-white">{result.agentName}</p>
              <div className="flex items-center gap-2">
                <Pill tone={result.mode === "live" ? "good" : "info"}>
                  {result.mode === "live" ? "Live intelligence" : "Demo intelligence"}
                </Pill>
                <ExportButton
                  dataset={agentId}
                  label="Export"
                  report={{ title: result.agentName, bodyHtml: mdToHtml(result.output) }}
                  json={{ agent: result.agentName, mode: result.mode, output: result.output }}
                />
              </div>
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
