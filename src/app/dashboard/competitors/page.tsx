import AgentRunner from "@/components/AgentRunner";
import { HBarList } from "@/components/charts";
import { PageHeader, Pill } from "@/components/ui";
import { demoCompetitors } from "@/shared/demo";

export default function CompetitorsPage() {
  return (
    <div>
      <PageHeader
        kicker="Competitor Intelligence Center"
        title="The threat board"
        subtitle="Rival offers, ads, pricing and positioning — tracked, scored and turned into counter-campaigns."
      />

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {demoCompetitors.map((c) => (
          <div key={c.id} className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-white">{c.name}</h2>
              <Pill tone={c.threatLevel >= 70 ? "bad" : c.threatLevel >= 40 ? "warn" : "neutral"}>
                threat {c.threatLevel}
              </Pill>
            </div>
            <div className="mt-3 space-y-2.5 text-sm">
              <p><span className="text-slate-500">Offer:</span> <span className="text-slate-300">{c.offer}</span></p>
              <p><span className="text-slate-500">Pricing:</span> <span className="text-slate-300">{c.pricePosition}</span></p>
              <p><span className="text-slate-500">Ad activity:</span> <span className="text-slate-300">{c.adActivity}</span></p>
              <p><span className="text-slate-500">Last move:</span> <span className="text-slate-300">{c.lastMove}</span></p>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">
              <span className="font-bold">Exploitable weakness:</span> {c.weakness}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-8 card p-5">
        <h2 className="mb-4 font-display font-bold text-white">Threat level by competitor</h2>
        <HBarList
          data={demoCompetitors.map((c) => ({ label: c.name, value: c.threatLevel, note: c.adActivity }))}
        />
      </div>

      <h2 className="mb-4 font-display text-lg font-bold text-white">Run the Competitor Spy Agent</h2>
      <AgentRunner
        agentId="competitor-spy"
        buttonLabel="Analyse the battlefield"
        fields={[
          { key: "business", label: "Your business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Market", defaultValue: "Brixton, London" },
          { key: "competitors", label: "Known competitors", defaultValue: "Flame Republic, Peri Palace, The Grill Room SW2", textarea: true },
        ]}
      />
    </div>
  );
}
