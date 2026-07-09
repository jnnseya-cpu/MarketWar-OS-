import { DonutChart, HBarList } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { demoCustomers } from "@/lib/data/demo";
import type { Customer } from "@/lib/types";

const STATUS_TONE: Record<Customer["status"], "good" | "bad" | "warn" | "info" | "neutral"> = {
  hot: "good",
  vip: "info",
  active: "neutral",
  inactive: "warn",
  lost: "bad",
};

export default function CustomerVaultPage() {
  const totalLtv = demoCustomers.reduce((s, c) => s + c.totalSpend, 0);
  const recoverable = demoCustomers.reduce((s, c) => s + c.recoveryValue, 0);
  const hot = demoCustomers.filter((c) => c.status === "hot").length;
  const atRisk = demoCustomers.filter((c) => c.churnRisk >= 60).length;

  return (
    <div>
      <PageHeader
        kicker="Customer Intelligence Vault"
        title="Your database is a marketing asset"
        subtitle="Every contact scored for engagement, intent, churn risk and recoverable revenue. Import CSV, CRM, Shopify, Stripe or WhatsApp exports."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Contacts" value={`${demoCustomers.length}`} sub="demo sample of 156 total" />
        <StatCard label="Lifetime value" value={`£${totalLtv.toLocaleString()}`} tone="good" />
        <StatCard label="Hot leads now" value={`${hot}`} tone="good" />
        <StatCard label="At churn risk" value={`${atRisk}`} sub={`£${recoverable} recoverable`} tone="warn" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-display font-bold text-white">Vault by status</h2>
          <DonutChart
            size={185}
            centerValue="156"
            centerLabel="contacts"
            data={[
              { label: "Active", value: 58 },
              { label: "Hot leads", value: 21 },
              { label: "Inactive 60d+", value: 47 },
              { label: "VIP", value: 12 },
              { label: "Lost", value: 18 },
            ]}
          />
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-display font-bold text-white">Lifetime value — top customers</h2>
          <HBarList
            valuePrefix="£"
            data={[...demoCustomers]
              .sort((a, b) => b.totalSpend - a.totalSpend)
              .slice(0, 5)
              .map((c) => ({ label: c.name, value: c.totalSpend, note: `${c.purchaseCount} orders` }))}
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Segment</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 text-right font-semibold">Spend</th>
              <th className="px-4 py-3 text-right font-semibold">Orders</th>
              <th className="px-4 py-3 text-right font-semibold">Intent</th>
              <th className="px-4 py-3 text-right font-semibold">Churn risk</th>
              <th className="px-4 py-3 text-right font-semibold">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {demoCustomers.map((c) => (
              <tr key={c.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-850/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-white">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.location} · {c.phone}</p>
                </td>
                <td className="px-4 py-3">
                  <Pill tone={STATUS_TONE[c.status]}>{c.segment}</Pill>
                </td>
                <td className="px-4 py-3 text-slate-400">{c.source}</td>
                <td className="px-4 py-3 text-right font-display font-bold text-white">£{c.totalSpend}</td>
                <td className="px-4 py-3 text-right text-slate-300">{c.purchaseCount}</td>
                <td className={`px-4 py-3 text-right font-display font-bold ${c.intentScore >= 75 ? "text-emerald-400" : c.intentScore >= 50 ? "text-amber-400" : "text-slate-500"}`}>
                  {c.intentScore}
                </td>
                <td className={`px-4 py-3 text-right font-display font-bold ${c.churnRisk >= 60 ? "text-rose-400" : c.churnRisk >= 30 ? "text-amber-400" : "text-emerald-400"}`}>
                  {c.churnRisk}%
                </td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {c.lastActivityDays === 0 ? "today" : `${c.lastActivityDays}d ago`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-600">
        AI segments available: hot leads · ready to buy · inactive customers · abandoned leads · repeat
        buyers · VIP · price-sensitive · referral-ready · high churn risk · high LTV · urgent follow-up.
      </p>
    </div>
  );
}
