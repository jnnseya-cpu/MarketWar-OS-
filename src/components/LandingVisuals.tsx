"use client";

// Landing visual showcase — "people like visuals, not walls of text."
// A colorful spread of the OS's real dashboards + charts (the actual chart kit +
// demo data), each shown as a product "screen". Purely presentational.

import type { ReactNode } from "react";
import { AreaChart, BarChart, DonutChart, FunnelChart, Sparkline } from "@/components/charts";
import { StatCard, VerdictBadge } from "@/components/ui";
import { demoCampaigns, demoChannelOrders, demoDaily, demoFunnel, demoMetrics } from "@/shared/demo";
import { SERIES } from "@/shared/palette";

// A product "screen" mockup: browser chrome + a rainbow top accent.
function Screen({ title, accent, children, className = "" }: { title: string; accent: number; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-ink-900/70 shadow-2xl shadow-black/40 backdrop-blur-xl ${className}`}>
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${SERIES[accent % SERIES.length]}, ${SERIES[(accent + 2) % SERIES.length]}, ${SERIES[(accent + 4) % SERIES.length]})` }} />
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-ink-950/50 px-3 py-2">
        <span className="h-2 w-2 rounded-full" style={{ background: SERIES[5] }} />
        <span className="h-2 w-2 rounded-full" style={{ background: SERIES[2] }} />
        <span className="h-2 w-2 rounded-full" style={{ background: SERIES[1] }} />
        <span className="ml-2 text-[11px] font-semibold text-slate-400">{title}</span>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-emerald-400">live</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function LandingVisuals() {
  const roasData = demoCampaigns.filter((c) => c.spend > 0).map((c) => ({ label: c.name, value: Number((c.revenue / c.spend).toFixed(1)) }));

  return (
    <section id="visuals" className="relative border-y border-white/5 py-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(56,189,248,0.10),transparent_70%)]" />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-400">One colourful cockpit</p>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">See the whole operation — <span className="text-gradient">at a glance</span></h2>
          <p className="mt-4 text-slate-400">No spreadsheets, no guessing. Every number, chart and verdict is on one screen — colour-coded so you know what to do in seconds.</p>
        </div>

        {/* KPI strip — colourful accents */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {[
            { label: "Revenue", value: `£${demoMetrics.revenueMonth}`, tone: "good" as const, a: 1 },
            { label: "Blended ROAS", value: `${demoMetrics.roas}x`, tone: "good" as const, a: 0 },
            { label: "Orders", value: `${demoMetrics.ordersMonth}`, tone: "neutral" as const, a: 2 },
            { label: "Leads", value: `${demoMetrics.leadsMonth}`, tone: "good" as const, a: 4 },
            { label: "Cost / order", value: `£${demoMetrics.costPerOrder}`, tone: "good" as const, a: 6 },
            { label: "Recoverable", value: `£${demoMetrics.recoverableRevenue}`, tone: "warn" as const, a: 3 },
          ].map((k) => (
            <div key={k.label} className={`accent-${k.a + 1} rounded-xl`}>
              <StatCard label={k.label} value={k.value} tone={k.tone} />
            </div>
          ))}
        </div>

        {/* Dashboard gallery */}
        <div className="grid gap-5 lg:grid-cols-3">
          <Screen title="Revenue vs ad spend — 14 days" accent={1} className="lg:col-span-2">
            <AreaChart labels={demoDaily.labels} series={[{ name: "Revenue", data: demoDaily.revenue }, { name: "Ad spend", data: demoDaily.spend }]} valuePrefix="£" height={220} />
          </Screen>
          <Screen title="Orders by channel" accent={0}>
            <DonutChart size={180} data={demoChannelOrders} centerValue={`${demoMetrics.ordersMonth}`} centerLabel="orders" />
          </Screen>

          <Screen title="Campaign verdicts — kill or scale" accent={5}>
            <div className="space-y-2">
              {demoCampaigns.slice(0, 4).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.channel} · £{c.spend} → £{c.revenue}</p>
                  </div>
                  <VerdictBadge verdict={c.verdict} />
                </div>
              ))}
            </div>
          </Screen>
          <Screen title="Return on ad spend by campaign" accent={2}>
            <BarChart colorByEntity data={roasData} height={200} />
          </Screen>
          <Screen title="Conversion funnel" accent={4}>
            <FunnelChart stages={demoFunnel} />
          </Screen>
        </div>

        {/* Autopilot + trend band */}
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Screen title="Revenue Autopilot — while you slept" accent={3} className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3"><p className="text-[10px] uppercase tracking-wider text-emerald-300/70">Auto-executed</p><p className="font-display text-2xl font-bold text-emerald-400">4</p></div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3"><p className="text-[10px] uppercase tracking-wider text-amber-300/70">Need approval</p><p className="font-display text-2xl font-bold text-amber-400">1</p></div>
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3"><p className="text-[10px] uppercase tracking-wider text-sky-300/70">Projected pipeline</p><p className="font-display text-2xl font-bold text-white">£959</p></div>
            </div>
            <p className="mt-3 text-xs text-slate-400">&ldquo;Overnight I prospected 68 new leads, reactivated 35 dormant customers and launched your Friday offer — 1 move is waiting for your approval.&rdquo;</p>
          </Screen>
          <Screen title="Demand trend" accent={6}>
            <Sparkline data={demoDaily.revenue} width={260} height={70} />
            <p className="mt-2 text-xs text-slate-500">Weekly order demand, trending up 24% — the OS shifts budget to the winner automatically.</p>
          </Screen>
        </div>
      </div>
    </section>
  );
}
