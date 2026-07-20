"use client";

// AI Growth Strategist — daily briefing. The "recent results" list is the brand's
// REAL ledger (attributed revenue events), not sample orders. Empty until the
// brand has activity. The strategist agent below fills from the active brand and
// runs live with an AI key.

import { Wallet, Building2 } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { useResults } from "@/frontend/results-context";

export default function BriefingPage() {
  const { activeBrand } = useActiveBrand();
  const { events, summary } = useResults();
  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

  return (
    <div>
      <PageHeader
        kicker="AI Growth Strategist"
        title="Daily strategic briefing"
        subtitle="The senior officer above all agents reads every module and issues today's orders — ranked by £ impact. Recent results are your brand's real attributed revenue, never sample data."
      />

      <div className="mb-8 card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display font-bold text-white">Recent results{activeBrand ? ` — ${activeBrand.name}` : ""}</h2>
          {!summary.isEmpty && <span className="text-sm font-semibold text-emerald-400">{money(summary.revenueGbp)} attributed · {summary.orders} orders</span>}
        </div>
        {!activeBrand ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Building2 className="h-6 w-6 text-emerald-500/60" />
            <p className="text-sm text-slate-400">Add a brand in the sidebar to see its results here.</p>
          </div>
        ) : summary.isEmpty ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Wallet className="h-6 w-6 text-emerald-500/60" />
            <p className="max-w-sm text-sm text-slate-400">No results captured yet for {activeBrand.name}. Log or capture your first order (Revenue) and it appears here — real money, not a sample.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400"><Wallet className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{e.source}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{e.type === "lead" ? "New lead" : `${money(e.amountGbp)} ${e.type}`}{e.note ? ` · ${e.note}` : ""}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-400">{e.at.slice(0, 10)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-4 font-display text-lg font-bold text-white">Generate a fresh briefing</h2>
      <AgentRunner
        agentId="growth-strategist"
        buttonLabel="Issue today's briefing"
        fields={[
          { key: "business", label: "Business" },
          { key: "goal", label: "Current goal" },
          { key: "situation", label: "Situation notes", placeholder: "What changed this week? Wins, blockers, competitor moves…", textarea: true },
        ]}
      />
    </div>
  );
}
