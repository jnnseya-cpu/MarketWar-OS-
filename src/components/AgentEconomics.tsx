"use client";

// §100's surface — WHICH AGENTS EARN THEIR KEEP.
//
// The screen's job is to stop one specific misreading, because acting on it
// costs the owner the agents they most need: an agent with real cost and no
// attributed revenue is NOT a failing agent. It is an agent nothing has been
// tagged against. Those two states get different words, different colours and
// different next actions, and the "cost only" line says exactly what to tag to
// turn it into a profit line.
//
// The bar chart is the spend, because "where is the money going" is the first
// question and a table of nineteen rows answers it slowly.

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, Coins, TrendingUp, TrendingDown, HelpCircle, Clock } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import type { AgentEconomics as Report, AgentLine, AgentVerdict } from "@/shared/agent-economics";

const VERDICT: Record<AgentVerdict, { label: string; text: string; bar: string; Icon: typeof Coins }> = {
  earning: { label: "Earning", text: "text-emerald-300", bar: "bg-emerald-400", Icon: TrendingUp },
  losing: { label: "Losing", text: "text-rose-300", bar: "bg-rose-400", Icon: TrendingDown },
  cost_only: { label: "Cost only", text: "text-slate-400", bar: "bg-slate-500", Icon: HelpCircle },
  not_enough_runs: { label: "Too early", text: "text-slate-500", bar: "bg-slate-600", Icon: Clock },
};

const money = (n: number) => `£${n.toFixed(2)}`;

export default function AgentEconomics() {
  const { activeBrand } = useActiveBrand();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await authedFetch("/api/agent-economics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand?.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "That did not go through.");
      setReport(d as Report);
    } catch (e) {
      // "Could not ask" is not "nothing was spent".
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [activeBrand]);

  useEffect(() => { void load(); }, [load]);

  const max = report?.lines.reduce((m, l) => Math.max(m, l.acus), 0) ?? 0;

  return (
    <div className="card mb-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Coins className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">What each agent costs, and what it earns back</h2>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Cost is measured exactly. Revenue is counted only where a result&apos;s source <strong className="text-slate-300">names</strong> the agent — so &ldquo;cost only&rdquo; means nothing has been tagged, never that the agent earned nothing.
      </p>

      {error && <p className="mb-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>}

      {!loading && !error && report && (
        <>
          <p className="mb-4 text-sm text-slate-300">{report.headline}</p>

          {report.lines.length === 0 ? (
            <p className="rounded-lg border border-ink-800 bg-ink-950/40 p-3 text-sm text-slate-400">
              Nothing metered yet. Run an agent and its cost appears here — with what it earned, once a result is tagged with its name.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {report.lines.map((l: AgentLine) => {
                const v = VERDICT[l.verdict];
                const width = max > 0 ? Math.max(2, Math.round((l.acus / max) * 100)) : 0;
                return (
                  <li key={l.agent} className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <v.Icon className={`h-4 w-4 shrink-0 ${v.text}`} />
                      <span className="truncate text-sm font-medium text-slate-200">{l.agent}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${v.text}`}>{v.label}</span>
                      <span className="ml-auto flex items-baseline gap-3 tabular-nums">
                        <span className="text-xs text-slate-500">{l.runs} run{l.runs === 1 ? "" : "s"}</span>
                        <strong className="text-sm text-white">{money(l.costGbp)}</strong>
                        {/* Only rendered when it EXISTS. A null revenue must never
                            reach the screen as a 0 — that is the whole point. */}
                        {l.attributedRevenueGbp !== null && (
                          <span className={l.netGbp !== null && l.netGbp >= 0 ? "text-sm text-emerald-300" : "text-sm text-rose-300"}>
                            {money(l.attributedRevenueGbp)} back
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
                      <div className={`h-full rounded-full ${v.bar}`} style={{ width: `${width}%` }} />
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-slate-400">{l.reason}</p>

                    {l.byKind.length > 1 && (
                      <p className="mt-1.5 text-[11px] text-slate-600">
                        {l.byKind.map((k) => `${k.kind} ${k.runs}×`).join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
