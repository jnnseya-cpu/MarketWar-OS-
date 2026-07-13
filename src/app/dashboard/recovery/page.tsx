import { RefreshCcw } from "lucide-react";
import { BarChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { demoCustomers } from "@/shared/demo";

const CAMPAIGN_TYPES = [
  { name: "Inactive customer comeback", desc: "“We miss you” + 20% deadline offer to 60d+ inactive contacts.", est: "£670" },
  { name: "Abandoned quote recovery", desc: "Leads who asked for a price and vanished get the quote plus a 48h bonus.", est: "£240" },
  { name: "Repeat buyer offer", desc: "Customers 2+ orders deep get early access to the Friday cap.", est: "£190" },
  { name: "VIP early access", desc: "Top 10% spenders unlock next week's menu before anyone else.", est: "£90" },
  { name: "Referral reward", desc: "Recovered customers get a share-to-WhatsApp reward loop.", est: "£50" },
];

export default function RecoveryPage() {
  const inactive = demoCustomers.filter((c) => c.recoveryValue > 0);
  const recoverable = 1240;

  return (
    <div>
      <PageHeader
        kicker="AI Customer Resurrection Engine"
        title="Lead Recovery Center"
        subtitle="Recover money from the database you already own before spending a penny on cold ads."
      />

      <div className="mb-8 card border-emerald-500/40 bg-emerald-500/5 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">AI Revenue Recovery Score™</p>
        <p className="mt-2 font-display text-4xl font-bold text-white">
          £{recoverable.toLocaleString()} <span className="text-lg font-semibold text-slate-400">recoverable</span>
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Your database contains 118 inactive contacts with prior purchase history. Wave 1 (26 contacts)
          converted at 54% with zero ad spend. Waves 2–3 are queued below.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="Recovered so far" value="£371" sub="wave 1, zero ad cost" tone="good" />
        <StatCard label="Contacts queued" value="118" sub="waves 2–3" />
        <StatCard label="Projected this month" value="£670+" tone="warn" />
      </div>

      <div className="mb-8 card p-5">
        <h2 className="mb-3 font-display font-bold text-white">Recoverable revenue by campaign type</h2>
        <BarChart
          colorByEntity
          valuePrefix="£"
          height={210}
          data={CAMPAIGN_TYPES.map((t) => ({ label: t.name.replace(" recovery", "").replace(" customer", ""), value: Number(t.est.replace(/[£,]/g, "")) }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-display font-bold text-white">Recovery campaign types</h2>
          <div className="space-y-3">
            {CAMPAIGN_TYPES.map((t) => (
              <div key={t.name} className="flex items-start justify-between gap-3 rounded-lg bg-ink-850 p-3.5">
                <div>
                  <p className="font-semibold text-slate-200">{t.name}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{t.desc}</p>
                </div>
                <Pill tone="good">{t.est}</Pill>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-display font-bold text-white">Highest-value recoverable contacts</h2>
          <div className="space-y-3">
            {inactive
              .sort((a, b) => b.recoveryValue - a.recoveryValue)
              .map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg bg-ink-850 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                    <RefreshCcw className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.purchaseCount} past orders · £{c.totalSpend} lifetime · silent {c.lastActivityDays}d
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-emerald-400">£{c.recoveryValue}</p>
                    <p className="text-[11px] text-slate-500">est. recovery</p>
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-sm text-emerald-200">
            <span className="font-bold">Queued message (James, 96d silent):</span> &ldquo;James — your
            usual Friday order is one tap away. 20% off this weekend only, then this offer&apos;s gone. Reply
            YES and it&apos;s locked in.&rdquo;
          </div>
        </div>
      </div>
    </div>
  );
}
