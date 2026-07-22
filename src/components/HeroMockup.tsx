"use client";

import { Bell, Crosshair, LayoutDashboard, MessageCircle, Search, Shield, TrendingUp, Zap } from "lucide-react";
import { AreaChart, DonutChart, Sparkline } from "@/components/charts";
import { BrandLockup } from "@/components/Logo";
import { SERIES } from "@/shared/palette";

// Photorealistic in-browser product mockup for the landing hero.
export default function HeroMockup() {
  return (
    <div className="gradient-border animate-float-slow rounded-2xl shadow-[0_40px_120px_-20px_rgba(16,185,129,0.25)]">
      <div className="overflow-hidden rounded-2xl bg-ink-900">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 border-b border-white/5 bg-ink-850/80 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-md bg-ink-950/80 px-3 py-1.5 text-[11px] text-slate-500">
            <Shield className="h-3 w-3 text-emerald-500" />
            app.marketwar.os/dashboard
          </div>
          <Bell className="h-3.5 w-3.5 text-slate-600" />
        </div>

        <div className="flex">
          {/* Mini sidebar */}
          <div className="hidden w-40 shrink-0 border-r border-white/5 bg-ink-950/50 p-3 sm:block">
            <div className="mb-3 flex items-center gap-1.5 px-1">
              <BrandLockup markClass="h-4 w-auto" textClass="font-display text-[11px] font-bold text-white" />
            </div>
            {[
              { icon: LayoutDashboard, label: "Command Center", active: true },
              { icon: Crosshair, label: "War Room" },
              { icon: MessageCircle, label: "WhatsApp" },
              { icon: TrendingUp, label: "Revenue Intel" },
              { icon: Zap, label: "Daily Briefing" },
            ].map((n) => (
              <div
                key={n.label}
                className={`mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium ${
                  n.active ? "bg-emerald-500/10 text-emerald-300" : "text-slate-500"
                }`}
              >
                <n.icon className="h-3 w-3" />
                {n.label}
              </div>
            ))}
          </div>

          {/* Dashboard body */}
          <div className="min-w-0 flex-1 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                  Operational Ledger
                </p>
                <p className="font-display text-sm font-bold text-white">Alex Carter</p>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-ink-850 px-2.5 py-1.5 text-[10px] text-slate-500">
                <Search className="h-3 w-3" /> Ask the OS anything…
              </div>
            </div>

            {/* Stat row */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                { label: "Total Revenue", value: "$124,560", delta: "+24.5% vs last 30 days", spark: [4, 6, 5, 8, 9, 11, 14], color: SERIES[1] },
                { label: "New Customers", value: "2,345", delta: "+18.2% vs last 30 days", spark: [3, 4, 6, 5, 7, 8, 10], color: SERIES[0] },
                { label: "AI Opportunity Score", value: "94", delta: "High", spark: [5, 6, 6, 7, 8, 8, 9], color: SERIES[4] },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-white/5 bg-ink-850/80 p-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
                  <div className="flex items-end justify-between gap-1">
                    <div>
                      <p className="font-display text-sm font-bold text-white">{s.value}</p>
                      <p className="text-[9px] font-bold text-emerald-400">{s.delta}</p>
                    </div>
                    <Sparkline data={s.spark} color={s.color} width={56} height={26} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2">
              {/* Area chart */}
              <div className="col-span-3 rounded-lg border border-white/5 bg-ink-850/80 p-3">
                <p className="mb-1 text-[10px] font-bold text-white">Revenue vs spend — 14 days</p>
                <AreaChart
                  labels={["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]}
                  series={[
                    { name: "Revenue", data: [42, 58, 51, 74, 88, 96, 110, 98, 122, 134, 128, 155, 171, 190] },
                    { name: "Ad spend", data: [18, 20, 19, 22, 24, 23, 26, 24, 27, 28, 26, 30, 31, 33] },
                  ]}
                  height={150}
                  valuePrefix="£"
                  showLegend={false}
                />
                <div className="mt-1 flex gap-3 text-[9px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-sm" style={{ background: SERIES[0] }} /> Revenue
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-sm" style={{ background: SERIES[1] }} /> Ad spend
                  </span>
                </div>
              </div>

              {/* Donut + feed */}
              <div className="col-span-2 space-y-2">
                <div className="rounded-lg border border-white/5 bg-ink-850/80 p-3">
                  <p className="mb-1 text-[10px] font-bold text-white">Revenue Breakdown</p>
                  <DonutChart
                    size={104}
                    centerValue="100%"
                    centerLabel="revenue mix"
                    data={[
                      { label: "Products", value: 64 },
                      { label: "Services", value: 22 },
                      { label: "Other", value: 14 },
                    ]}
                  />
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300">
                    <Zap className="h-3 w-3 animate-ticker" /> AI Commander
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-slate-400">
                    Opportunity Score <span className="font-bold text-emerald-300">94 (High)</span> — winning
                    campaign scaled +40%; underperforming ad set paused, budget rerouted.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
