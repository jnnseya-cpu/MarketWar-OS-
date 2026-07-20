"use client";

// Landing visual showcase — premium, cinematic, ultra-real. "People like visuals."
// A big perspective-tilted "cockpit" device frame + a layered gallery of the OS's
// real dashboards and charts (the actual chart kit + validated palette). Purely
// presentational.

import type { ReactNode } from "react";
import { AreaChart, BarChart, DonutChart, FunnelChart, Sparkline } from "@/components/charts";
import { StatCard, VerdictBadge } from "@/components/ui";
import { demoCampaigns, demoChannelOrders, demoDaily, demoFunnel, demoMetrics } from "@/shared/demo";
import { SERIES } from "@/shared/palette";

// A product "screen" — browser chrome + a rainbow top accent + deep shadow.
function Screen({ title, accent, children, className = "" }: { title: string; accent: number; children: ReactNode; className?: string }) {
  return (
    <div className={`group overflow-hidden rounded-2xl border border-white/10 bg-ink-900/70 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl transition duration-500 hover:-translate-y-1 hover:border-white/20 ${className}`}>
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${SERIES[accent % SERIES.length]}, ${SERIES[(accent + 2) % SERIES.length]}, ${SERIES[(accent + 4) % SERIES.length]})` }} />
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-ink-950/60 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[5] }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[2] }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[1] }} />
        <span className="ml-2 text-[11px] font-semibold text-slate-400">{title}</span>
        <span className="ml-auto flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />live</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function LandingVisuals() {
  const roasData = demoCampaigns.filter((c) => c.spend > 0).map((c) => ({ label: c.name, value: Number((c.revenue / c.spend).toFixed(1)) }));

  return (
    <section id="visuals" className="relative overflow-hidden border-y border-white/5 py-24">
      {/* Ambient cinematic glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[6%] h-72 w-72 rounded-full opacity-25 blur-[90px]" style={{ background: SERIES[4] }} />
        <div className="absolute right-[10%] top-[2%] h-72 w-72 rounded-full opacity-20 blur-[90px]" style={{ background: SERIES[0] }} />
        <div className="absolute bottom-[10%] left-[40%] h-72 w-72 rounded-full opacity-20 blur-[90px]" style={{ background: SERIES[6] }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-400">One colourful cockpit</p>
          <h2 className="font-display text-3xl font-bold text-white sm:text-5xl">See the whole operation — <span className="text-gradient">at a glance</span></h2>
          <p className="mt-4 text-lg text-slate-400">No spreadsheets, no guessing. Every number, chart and verdict on one screen — colour-coded so you know what to do in seconds.</p>
        </div>

        {/* Cinematic hero device — perspective-tilted cockpit */}
        <div className="mb-16 [perspective:2000px]">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[20px] border border-white/12 bg-ink-900/80 shadow-[0_60px_140px_-40px_rgba(0,0,0,0.95)] backdrop-blur-2xl transition-transform duration-700 [transform:rotateX(6deg)_rotateY(-3deg)] hover:[transform:rotateX(2deg)_rotateY(0deg)]">
            <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${SERIES[1]}, ${SERIES[4]}, ${SERIES[5]}, ${SERIES[2]}, ${SERIES[0]})` }} />
            <div className="flex items-center gap-1.5 border-b border-white/[0.07] bg-ink-950/70 px-4 py-2.5">
              <span className="h-3 w-3 rounded-full" style={{ background: SERIES[5] }} />
              <span className="h-3 w-3 rounded-full" style={{ background: SERIES[2] }} />
              <span className="h-3 w-3 rounded-full" style={{ background: SERIES[1] }} />
              <span className="mx-auto rounded-md bg-ink-900 px-3 py-0.5 text-[11px] text-slate-400">app.marketwaros.com/dashboard</span>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-3">
              <div className="lg:col-span-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: "Revenue", v: `£${demoMetrics.revenueMonth}`, a: 1 },
                  { l: "ROAS", v: `${demoMetrics.roas}x`, a: 0 },
                  { l: "Orders", v: `${demoMetrics.ordersMonth}`, a: 2 },
                  { l: "Recoverable", v: `£${demoMetrics.recoverableRevenue}`, a: 3 },
                ].map((k) => (
                  <div key={k.l} className="rounded-xl border border-white/[0.07] bg-ink-950/50 p-3" style={{ boxShadow: `inset 0 2px 0 -1px ${SERIES[k.a]}` }}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{k.l}</p>
                    <p className="font-display text-2xl font-bold text-white">{k.v}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-ink-950/40 p-4 lg:col-span-2">
                <p className="mb-2 text-xs font-semibold text-slate-300">Revenue vs ad spend</p>
                <AreaChart labels={demoDaily.labels} series={[{ name: "Revenue", data: demoDaily.revenue }, { name: "Ad spend", data: demoDaily.spend }]} valuePrefix="£" height={190} />
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-ink-950/40 p-4">
                <p className="mb-2 text-xs font-semibold text-slate-300">Orders by channel</p>
                <DonutChart size={150} data={demoChannelOrders} centerValue={`${demoMetrics.ordersMonth}`} centerLabel="orders" />
              </div>
            </div>
          </div>
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
