"use client";

// Executive Command Center — per-brand, money-honest. All figures come from the
// real results ledger (src/frontend/results-context): attributed revenue, orders
// and leads for the ACTIVE brand. NO fabricated money — empty until the brand
// has real activity. Switch brand in the sidebar to see that brand's numbers.

import Link from "next/link";
import { AreaChart, DonutChart } from "@/components/charts";
import { PageHeader, StatCard } from "@/components/ui";
import { ArrowRight, Building2, Crosshair, Hammer, Target, Wallet, Zap } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { useResults } from "@/frontend/results-context";

export default function CommandCenterPage() {
  const { activeBrand } = useActiveBrand();
  const { events, summary } = useResults();
  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

  if (!activeBrand) {
    return (
      <div>
        <PageHeader kicker="Executive Command Center" title="Add your first brand" subtitle="One account, one bill, many brands. Add a brand in the sidebar to see its real numbers here." />
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Building2 className="h-8 w-8 text-emerald-500/60" />
          <p className="max-w-sm text-sm text-slate-400">Use the brand switcher at the top of the sidebar to add your first real brand — then every module works for that brand.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Executive Command Center"
        title={activeBrand.name}
        subtitle={[activeBrand.industry, activeBrand.location, activeBrand.goal && `Goal: ${activeBrand.goal}`].filter(Boolean).join(" · ") || "Your brand command center"}
        actions={<Link href="/dashboard/briefing" className="btn-primary"><Zap className="h-4 w-4" /> Today&apos;s briefing</Link>}
      />

      {/* Real per-brand money — zeros, never fake figures, when empty */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Attributed revenue" value={money(summary.revenueGbp)} tone={summary.revenueGbp > 0 ? "good" : "neutral"} sub="through MarketWar" />
        <StatCard label="Orders" value={`${summary.orders}`} />
        <StatCard label="Leads" value={`${summary.leads}`} tone={summary.leads > 0 ? "good" : "neutral"} />
        <StatCard label="Avg order value" value={summary.orders > 0 ? money(summary.avgOrderGbp) : "—"} />
      </div>

      {summary.isEmpty ? (
        <div className="mt-8 card border-emerald-500/25 bg-emerald-500/[0.04] p-6">
          <div className="mb-2 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">No activity yet for {activeBrand.name}</h2></div>
          <p className="mb-4 max-w-2xl text-sm text-slate-400">This dashboard shows real money as it comes in — nothing is fabricated. Build a campaign, then log or capture the orders it produces and they appear here, attributed to their source.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/create" className="btn-primary"><Hammer className="h-4 w-4" /> Make anything</Link>
            <Link href="/dashboard/warfare" className="btn-ghost"><Target className="h-4 w-4" /> Design a campaign</Link>
            <Link href="/dashboard/revenue" className="btn-ghost"><Wallet className="h-4 w-4" /> Log a result</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-6 lg:grid-cols-5">
            <div className="card p-5 lg:col-span-3">
              <h2 className="mb-3 font-display font-bold text-white">Attributed revenue by day</h2>
              <AreaChart labels={summary.byDay.map((d) => d.day.slice(5))} series={[{ name: "Revenue", data: summary.byDay.map((d) => d.revenueGbp) }]} valuePrefix="£" height={230} />
            </div>
            <div className="card p-5 lg:col-span-2">
              <h2 className="mb-3 font-display font-bold text-white">Revenue by source</h2>
              {summary.bySource.some((s) => s.revenueGbp > 0) ? (
                <DonutChart size={190} centerValue={money(summary.revenueGbp)} centerLabel="attributed" data={summary.bySource.filter((s) => s.revenueGbp > 0).map((s) => ({ label: s.source, value: s.revenueGbp }))} />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">Leads only so far — log an order to see revenue by source.</p>
              )}
            </div>
          </div>

          <div className="mt-8 card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-bold text-white">Recent results</h2>
              <Link href="/dashboard/revenue" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Revenue <ArrowRight className="inline h-3 w-3" /></Link>
            </div>
            <div className="space-y-2">
              {events.slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">{e.source}</p>
                    <p className="text-xs text-slate-500">{e.at.slice(0, 10)} · {e.type}{e.note ? ` · ${e.note}` : ""}</p>
                  </div>
                  <span className="shrink-0 font-display font-bold text-white">{e.type === "lead" ? "lead" : money(e.amountGbp)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-8 card flex flex-wrap items-center justify-between gap-4 border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-3">
          <Crosshair className="h-5 w-5 text-emerald-400" />
          <p className="text-sm text-slate-300">Run the <span className="font-semibold text-white">Marketing Failure Audit</span> for {activeBrand.name} to find where spend leaks before you scale.</p>
        </div>
        <Link href="/dashboard/audit" className="btn-primary">Run the audit</Link>
      </div>
    </div>
  );
}
