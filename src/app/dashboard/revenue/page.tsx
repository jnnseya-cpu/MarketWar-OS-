import AgentRunner from "@/components/AgentRunner";
import { AreaChart, BarChart, DonutChart } from "@/components/charts";
import { PageHeader, StatCard } from "@/components/ui";
import { demoCampaigns, demoDaily, demoMetrics } from "@/lib/data/demo";

export default function RevenuePage() {
  const m = demoMetrics;
  const rows = demoCampaigns.map((c) => ({
    name: c.name,
    channel: c.channel,
    spend: c.spend,
    revenue: c.revenue,
    roas: c.spend > 0 ? (c.revenue / c.spend).toFixed(1) + "x" : c.revenue > 0 ? "∞" : "—",
  }));

  return (
    <div>
      <PageHeader
        kicker="Revenue Intelligence"
        title="Where the money actually came from"
        subtitle="Attribution by campaign and channel — orders and revenue, never vanity metrics."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (month)" value={`£${m.revenueMonth}`} tone="good" />
        <StatCard label="Blended ROAS" value={`${m.roas}x`} tone="good" />
        <StatCard label="Orders" value={`${m.ordersMonth}`} />
        <StatCard label="Leaking" value="£240" sub="in unanswered threads" tone="bad" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h2 className="mb-3 font-display font-bold text-white">Daily revenue vs spend — 14 days</h2>
          <AreaChart
            labels={demoDaily.labels}
            series={[
              { name: "Revenue", data: demoDaily.revenue },
              { name: "Ad spend", data: demoDaily.spend },
            ]}
            valuePrefix="£"
            height={230}
          />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display font-bold text-white">Revenue share by campaign</h2>
          <DonutChart
            size={185}
            centerValue={`£${demoMetrics.revenueMonth}`}
            centerLabel="this month"
            data={demoCampaigns
              .filter((c) => c.revenue > 0)
              .map((c) => ({ label: c.name.replace(" Reactivation", ""), value: c.revenue }))}
          />
        </div>
      </div>

      <div className="mb-8 card p-5">
        <h2 className="mb-3 font-display font-bold text-white">Return on ad spend by campaign</h2>
        <BarChart
          colorByEntity
          data={demoCampaigns
            .filter((c) => c.spend > 0)
            .map((c) => ({ label: c.name, value: Number((c.revenue / c.spend).toFixed(1)) }))}
          height={210}
        />
        <p className="mt-2 text-xs text-slate-500">
          Values are revenue ÷ spend (x). Sunday Roast Reactivation excluded — zero-cost WhatsApp channel.
        </p>
      </div>

      <div className="mb-8 card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-4 py-3 font-semibold">Channel</th>
              <th className="px-4 py-3 text-right font-semibold">Spend</th>
              <th className="px-4 py-3 text-right font-semibold">Revenue</th>
              <th className="px-4 py-3 text-right font-semibold">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-ink-800 last:border-0">
                <td className="px-4 py-3 font-semibold text-white">{r.name}</td>
                <td className="px-4 py-3 text-slate-400">{r.channel}</td>
                <td className="px-4 py-3 text-right text-slate-300">£{r.spend}</td>
                <td className="px-4 py-3 text-right font-display font-bold text-white">£{r.revenue}</td>
                <td className={`px-4 py-3 text-right font-display font-bold ${r.revenue > r.spend * 2 ? "text-emerald-400" : r.revenue === 0 ? "text-rose-400" : "text-amber-400"}`}>
                  {r.roas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-4 font-display text-lg font-bold text-white">Run the Revenue Intelligence Agent</h2>
      <AgentRunner
        agentId="revenue-intelligence"
        buttonLabel="Analyse & forecast"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "monthRevenue", label: "Revenue this month (£)", defaultValue: "1494" },
          { key: "monthSpend", label: "Ad spend this month (£)", defaultValue: "332" },
          { key: "notes", label: "Anything unusual?", placeholder: "e.g. rainy week, new competitor deal", textarea: true },
        ]}
      />
    </div>
  );
}
