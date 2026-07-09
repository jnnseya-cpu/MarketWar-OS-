import AgentRunner from "@/components/AgentRunner";
import { PageHeader, StatCard } from "@/components/ui";

export default function LocalDominationPage() {
  return (
    <div>
      <PageHeader
        kicker="Local Domination Engine"
        title="Own your postcode"
        subtitle="Google Business attack plans, community distribution and geo-targeted offers — the channels ad platforms can't rent back to you."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Map pack rank" value="#5" sub={`for "grill near me" · target #3`} tone="warn" />
        <StatCard label="Review velocity" value="2/mo" sub="pack leader: 9/mo" tone="bad" />
        <StatCard label="GBP actions" value="41" sub="calls + directions this month" />
        <StatCard label="Local search views" value="1,860" sub="+12% vs last month" tone="good" />
      </div>

      <AgentRunner
        agentId="local-growth"
        buttonLabel="Build my domination plan"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Location", defaultValue: "Brixton, London (SW9)" },
          { key: "serviceAreas", label: "Service areas", defaultValue: "SW9, SW2, SW4, SE24" },
          { key: "product", label: "Product / service", defaultValue: "Flame-grilled meals, family platters, office catering", textarea: true },
        ]}
      />
    </div>
  );
}
