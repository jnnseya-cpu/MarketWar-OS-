import Link from "next/link";
import { Plus } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { SERIES } from "@/shared/palette";
import { PageHeader, Pill, StatCard, VerdictBadge } from "@/components/ui";
import { demoCampaignSparks, demoCampaigns, demoMetrics } from "@/shared/demo";

const SPARK_COLOR: Record<string, string> = {
  SCALE: SERIES[1],
  FIX: SERIES[2],
  STOP: SERIES[5],
  TESTING: SERIES[0],
};

export default function WarRoomPage() {
  const m = demoMetrics;
  return (
    <div>
      <PageHeader
        kicker="Campaign War Room"
        title="Live campaign grid"
        subtitle="Every campaign carries a verdict. Losers die in 48 hours; winners get scale orders."
        actions={
          <Link href="/dashboard/campaigns" className="btn-primary">
            <Plus className="h-4 w-4" /> New campaign
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Money spent" value={`£${m.spendMonth}`} sub="this month" />
        <StatCard label="Leads generated" value={`${m.leadsMonth}`} tone="good" />
        <StatCard label="Cost per lead" value={`£${m.costPerLead}`} tone="good" />
        <StatCard label="Cost per order" value={`£${m.costPerOrder}`} tone="good" />
      </div>

      <div className="space-y-4">
        {demoCampaigns.map((c) => (
          <div key={c.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display font-bold text-white">{c.name}</h2>
                  <VerdictBadge verdict={c.verdict} />
                  <Pill>{c.channel}</Pill>
                  <Pill tone="info">{c.goal}</Pill>
                  {c.status !== "active" && <Pill tone="bad">{c.status}</Pill>}
                </div>
                <p className="mt-1.5 text-sm italic text-slate-400">&ldquo;{c.hook}&rdquo;</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">7-day leads</p>
                  <Sparkline data={demoCampaignSparks[c.id] ?? [1, 1, 1, 1, 1, 1, 1]} color={SPARK_COLOR[c.verdict]} width={110} height={32} />
                </div>
                <p className="text-xs text-slate-500">day {c.startedDaysAgo}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              <Metric label="Spend" value={`£${c.spend}`} />
              <Metric label="Leads" value={`${c.leads}`} />
              <Metric label="Messages" value={`${c.messages}`} />
              <Metric label="Orders" value={`${c.bookings}`} />
              <Metric label="Revenue" value={`£${c.revenue}`} good={c.revenue > c.spend * 2} />
              <Metric
                label="Cost/order"
                value={c.bookings > 0 ? `£${(c.spend / c.bookings).toFixed(2)}` : "—"}
                good={c.bookings > 0 && c.spend / c.bookings < 6}
              />
            </div>

            <div
              className={`mt-4 rounded-lg border p-3.5 text-sm ${
                c.verdict === "SCALE"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                  : c.verdict === "STOP"
                    ? "border-rose-500/30 bg-rose-500/5 text-rose-200"
                    : c.verdict === "FIX"
                      ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
                      : "border-sky-500/30 bg-sky-500/5 text-sky-200"
              }`}
            >
              <span className="font-bold">Commander&apos;s order:</span> {c.verdictReason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg bg-ink-850 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`font-display text-lg font-bold ${good ? "text-emerald-400" : "text-white"}`}>{value}</p>
    </div>
  );
}
