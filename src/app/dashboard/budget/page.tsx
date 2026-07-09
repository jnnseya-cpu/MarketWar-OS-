import AgentRunner from "@/components/AgentRunner";
import { PageHeader, StatCard, VerdictBadge } from "@/components/ui";
import { demoCampaigns } from "@/lib/data/demo";

export default function BudgetProtectionPage() {
  return (
    <div>
      <PageHeader
        kicker="Budget Protection Engine"
        title="The Financial Shield"
        subtitle="Campaigns that spend without producing leads get paused automatically. Budget flows to proven winners — with a receipt."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="Protected this week" value="£130" sub="waste stopped + rerouted" tone="good" />
        <StatCard label="Campaigns killed" value="1" sub="Generic Brand Awareness" tone="bad" />
        <StatCard label="Reroute return" value="+£320" sub="projected from scale order" tone="good" />
      </div>

      <div className="mb-8 card p-5">
        <h2 className="mb-4 font-display font-bold text-white">Standing protection orders</h2>
        <div className="space-y-3">
          {demoCampaigns.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-850 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-white">{c.name}</p>
                <p className="mt-0.5 text-sm text-slate-400">{c.verdictReason}</p>
              </div>
              <VerdictBadge verdict={c.verdict} />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-ink-600 p-3.5 text-sm text-slate-400">
          <span className="font-bold text-slate-200">Autonomy level:</span> Guarded — the shield pauses
          waste automatically but asks before scaling. Levels: Manual → Guarded → Autonomous.
        </div>
      </div>

      <h2 className="mb-4 font-display text-lg font-bold text-white">Run the Budget Protection Agent</h2>
      <AgentRunner
        agentId="budget-protection"
        buttonLabel="Issue protection orders"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "weeklyBudget", label: "Weekly budget (£)", defaultValue: "150" },
          { key: "campaigns", label: "Campaign figures", defaultValue: "Family Platter: £84 → £610 rev · Catering: £112 → £380 · Awareness: £96 → £0 · Student Night: £40 → £133", textarea: true },
        ]}
      />
    </div>
  );
}
