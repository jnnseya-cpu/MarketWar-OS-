import { AlertTriangle, ShieldAlert, TrendingUp } from "lucide-react";
import { AreaChart, BarChart, DonutChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";

// Admin Super Control Centre (M-30) — platform-operator view (U10/U11).
// Centrepiece: the ACU margin dashboard that enforces the owner pricing
// doctrine (docs/ai-os/08 §A.1a — every action >= 2x provider cost, i.e.
// margin never below 100%). Demo Intelligence data; production reads
// agent_tasks.acuMarginPct + the acu_ledger.

const MARGIN_BY_AGENT = [
  { label: "Ad Creative", value: 940 },
  { label: "Content Factory", value: 815 },
  { label: "Resurrection Engine", value: 640 },
  { label: "Campaign Commander", value: 460 },
  { label: "Video Commander", value: 385 },
  { label: "Growth Strategist", value: 310 },
  { label: "Competitor Spy", value: 240 },
  { label: "Failure Audit (frontier)", value: 130 },
];

const PROVIDER_MIX = [
  { label: "Cached / recycled", value: 38 },
  { label: "Groq / small models", value: 27 },
  { label: "Gemini Flash", value: 17 },
  { label: "Claude (frontier)", value: 11 },
  { label: "GPT (frontier)", value: 7 },
];

const REVENUE_VS_COST = {
  labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
  revenue: [310, 345, 392, 428, 471, 519, 566, 604, 662, 718, 771, 843],
  providerCost: [61, 66, 71, 74, 79, 84, 88, 91, 97, 102, 106, 112],
};

export default function AdminPage() {
  return (
    <div>
      <PageHeader
        kicker="Admin Super Control Centre"
        title="Platform economics & agent governance"
        subtitle="Operator view (U10/U11). Every AI action is priced at a minimum 2× its fully-loaded provider cost — the margin floor is enforced per task, and this dashboard is where breaches would surface. Demo data."
        actions={<Pill tone="warn">restricted · dual-logged</Pill>}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Blended ACU margin" value="612%" sub="floor: 100% — never breached" tone="good" />
        <StatCard label="Blended LLM cost / task" value="£0.0041" sub="target < £0.005 (spec §13.3)" tone="good" />
        <StatCard label="Tasks on cheap paths" value="65%" sub="cached + Groq/small models (target > 40%)" tone="good" />
        <StatCard label="Floor alerts (30 days)" value="0" sub="actions trending below 2×" tone="good" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold text-white">AI revenue vs provider cost — 12 weeks</h2>
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" /> margin widening
            </span>
          </div>
          <AreaChart
            labels={REVENUE_VS_COST.labels}
            series={[
              { name: "ACU revenue", data: REVENUE_VS_COST.revenue },
              { name: "Provider cost", data: REVENUE_VS_COST.providerCost },
            ]}
            valuePrefix="£"
            height={230}
          />
          <p className="mt-3 text-xs text-slate-500">
            The gap is the doctrine at work: cheaper routing and recycling lower the cost line while prices stay
            competitive — margin comes from the cost base, never from gouging.
          </p>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display font-bold text-white">Task routing mix</h2>
          <DonutChart
            data={PROVIDER_MIX}
            centerValue="65%"
            centerLabel="cheapest-path share"
            size={185}
          />
          <p className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
            The router always tries the cheapest sufficient path first; frontier models are reserved for reasoning
            that earns their cost.
          </p>
        </div>
      </div>

      <div className="mb-8 card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display font-bold text-white">Margin % by agent (30 days)</h2>
          <Pill tone="good">all above the 100% floor</Pill>
        </div>
        <BarChart
          data={MARGIN_BY_AGENT.map((m) => ({ label: m.label, value: m.value }))}
          height={240}
          colorByEntity
        />
        <p className="mt-3 text-xs text-slate-500">
          Frontier-heavy agents (Failure Audit) run closest to the floor — candidates for more caching and
          pre-generation scoring, never for a price rise first.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-400" />
            <h2 className="font-display font-bold text-white">Kill-switches & governance</h2>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              ["Global send-freeze", "armed", "neutral"],
              ["Per-agent freeze (19 agents)", "all running", "good"],
              ["Prompt registry", "v3.0 signed — evals green", "good"],
              ["Policy engine", "autonomy ceilings + spend caps compiled", "good"],
              ["Two-person rule", "price-book & policy edits", "neutral"],
            ].map(([name, state, tone]) => (
              <li key={name} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-2.5">
                <span className="text-slate-300">{name}</span>
                <Pill tone={tone as "good" | "neutral"}>{state}</Pill>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="font-display font-bold text-white">Escalation queue</h2>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-ink-700 bg-ink-850 p-3.5">
              <p className="text-sm font-semibold text-white">No open escalations</p>
              <p className="text-xs text-slate-500">
                L3 actions &gt; £500, confidence &lt; 70% on spend, and 3+ consecutive failures land here with
                full reasoning traces from <code className="text-slate-400">agent_tasks</code>.
              </p>
            </div>
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5 text-xs text-sky-200">
              Every view of this centre is dual-logged (actor + reason) and appears in the audit trail — including
              yours, right now.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
