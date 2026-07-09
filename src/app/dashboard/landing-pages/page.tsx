import AgentRunner from "@/components/AgentRunner";
import { PageHeader } from "@/components/ui";
import { CheckCircle2 } from "lucide-react";

const PAGE_ANATOMY = [
  "Headline that repeats the ad's promise",
  "Offer block with price, deadline and cap",
  "Problem → benefits in customer language",
  "Proof: reviews, counters, local names",
  "FAQ that kills the top 3 objections",
  "Single CTA: one-tap WhatsApp button",
  "Lead form fallback (2 fields max)",
  "Tracking pixels + A/B variant slot",
];

export default function LandingPagesPage() {
  return (
    <div>
      <PageHeader
        kicker="AI Landing Page Generator"
        title="Every campaign gets a conversion page"
        subtitle="The Lead Capture Agent designs the page, the WhatsApp flow and the 48-hour follow-up sequence as one system."
      />

      <div className="mb-6 card p-5">
        <h2 className="mb-3 font-display font-bold text-white">Anatomy of a MarketWar page</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAGE_ANATOMY.map((item) => (
            <p key={item} className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> {item}
            </p>
          ))}
        </div>
      </div>

      <AgentRunner
        agentId="lead-capture"
        buttonLabel="Design my capture system"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Location", defaultValue: "Brixton, London" },
          { key: "campaign", label: "Campaign", defaultValue: "Family Platter Friday" },
          { key: "offer", label: "Offer", defaultValue: "Feed 4 for £25, Fridays only" },
          { key: "goal", label: "Conversion goal", defaultValue: "WhatsApp orders" },
        ]}
      />
    </div>
  );
}
