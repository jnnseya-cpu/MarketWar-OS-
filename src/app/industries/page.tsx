import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Industries · MarketWar OS",
  description: "MarketWar OS adapts to restaurants, local services, ecommerce, agencies, SaaS, clinics, hospitality, education and more.",
};

const INDUSTRIES: { name: string; pain: string; plays: string[] }[] = [
  { name: "Restaurants & takeaways", pain: "Empty tables midweek, over-reliance on delivery apps that own the customer.", plays: ["Local-demand heatmaps + geo campaigns", "WhatsApp booking + re-order flows", "Review-to-social proof engine", "Owned customer list, not the delivery app's"] },
  { name: "Local services & trades", pain: "Feast-or-famine lead flow, no-shows, quotes that go cold.", plays: ["Request-a-Quote marketplace + booking with deposits", "Missed-call & abandoned-quote recovery", "Local SEO service-area pages at scale", "Deal-probability scoring on every enquiry"] },
  { name: "Ecommerce & retail", pain: "Rising ad costs, cart abandonment, thin margins.", plays: ["Product-picture → viral campaign (VisualStrike)", "Cart & win-back automation", "ROI engine buys the cheapest next customer", "OfferForge builds bundles from real margins"] },
  { name: "Agencies", pain: "Managing many clients, proving ROI, white-label reporting.", plays: ["Multi-brand workspaces + client approvals", "White-label reports + margin-by-client", "Bulk campaign generation", "Creator marketplace + attribution"] },
  { name: "SaaS & startups", pain: "Finding ICP, content velocity, AI-search visibility.", plays: ["ICP builder + buying-intent radar", "SEO + GEO (AI answer) visibility", "Programmatic SEO at scale", "Revenue attribution across the funnel"] },
  { name: "Clinics & professional services", pain: "Trust-sensitive marketing, compliance, referrals.", plays: ["Reputation shield + review management", "Consent-gated, compliant outreach", "Booking + reminder engine", "Regulated-claim verification before publish"] },
  { name: "Hospitality & events", pain: "Seasonality, occupancy, last-minute demand.", plays: ["Seasonal-takeover campaign mode", "Local + influencer campaigns", "Trend-hijack (brand-safe) content", "Loyalty & referral network"] },
  { name: "Education & nonprofits", pain: "Tight budgets, community reach, storytelling.", plays: ["Site-to-Story engine (fact-traceable)", "Low-cost, owned-channel-first ROI", "Community + creator programmes", "Multilingual localisation"] },
];

export default function IndustriesPage() {
  return (
    <MarketingShell
      kicker="Industries"
      title="One operating system, tuned to your market"
      subtitle="A viral format that works in London may flop in Lagos, and a restaurant's playbook isn't a law firm's. MarketWar OS adapts the strategy, channels and compliance to your industry — automatically."
    >
      <Prose>
        <div className="grid gap-4 sm:grid-cols-2">
          {INDUSTRIES.map((i) => (
            <div key={i.name} className="card p-5">
              <h3 className="font-display text-base font-bold text-white">{i.name}</h3>
              <p className="mt-1.5 text-sm text-slate-400"><span className="font-semibold text-slate-300">The pain:</span> {i.pain}</p>
              <ul className="mt-3 space-y-1.5">
                {i.plays.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13px] text-slate-300">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <H2>Don't see yours?</H2>
        <p>
          The engines are industry-agnostic — onboarding builds your Business DNA, personas, keyword and prompt
          universes, and a 90-day plan from your website and inputs, whatever the vertical.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/get-started" className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400">Start free</Link>
          <Link href="/contact" className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-emerald-500">Talk to us</Link>
        </div>
      </Prose>
    </MarketingShell>
  );
}
