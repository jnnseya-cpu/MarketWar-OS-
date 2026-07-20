import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose, FeatureCard } from "@/components/marketing";

export const metadata: Metadata = {
  title: "About · MarketWar OS",
  description: "MarketWar OS is the AI-powered customer-acquisition operating system — owned growth infrastructure, not another rented marketing tool.",
};

export default function AboutPage() {
  return (
    <MarketingShell
      kicker="About"
      title="The AI growth engine businesses actually own"
      subtitle="MarketWar OS replaces a dozen disconnected marketing tools with one operating system that diagnoses why growth stalls, builds the whole campaign, captures and recovers customers, and scales only what makes money."
    >
      <Prose>
        <p>
          Most businesses don't fail at marketing because they lack tools — they fail because those tools are
          disconnected, rented, and optimised for vanity metrics instead of revenue. MarketWar OS was built on a
          different premise: <strong className="text-white">you should own your customer-acquisition infrastructure</strong>,
          and every AI action should be judged by the money it makes, not the likes it earns.
        </p>

        <H2>What we believe</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard title="Own your growth">
            Customer database, landing pages, CRM, automation, referral and local SEO all live inside the OS. External
            platforms (Meta, Google, WhatsApp) are optional pipes — disconnect any and the platform keeps working.
          </FeatureCard>
          <FeatureCard title="Money, not vanity">
            Every dashboard leads with revenue, cost per customer and ROI, and says plainly what to stop, fix or scale.
          </FeatureCard>
          <FeatureCard title="Honesty by default">
            No invented results, reviews or ratings. Every score is a labelled estimate, re-ranked on your real
            performance. Unsubstantiated claims are blocked before they publish.
          </FeatureCard>
          <FeatureCard title="Never spam">
            Marketing is consent-gated and capped at five touches a week; an opt-out or a purchase ends the sequence
            immediately.
          </FeatureCard>
        </div>

        <H2>How it's built</H2>
        <p>
          Under the hood, MarketWar OS is a fleet of deterministic, demo-safe intelligence engines — from Campaign
          Warfare and VisualStrike AI to SiteRaid, ModelGate (our provider-neutral AI gateway) and a utility-company
          ACU economy. Every AI action is priced transparently, every provider is interchangeable, and your data is
          field-level encrypted per business.
        </p>
        <p>
          The platform runs in a zero-config demo mode out of the box, so you can see every engine working before a
          single API key or payment method is added.
        </p>

        <H2>The stack</H2>
        <p className="text-slate-400">
          Hostinger controls the domain, Vercel delivers the experience, Firebase operates the business, and ModelGate
          controls every AI provider, every ACU and every pound of AI cost — a provider-independent platform that scales
          from a free solo founder to a multinational without a rebuild.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/get-started" className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400">Get started free</Link>
          <Link href="/how-it-works" className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-emerald-500">See how it works</Link>
        </div>
      </Prose>
    </MarketingShell>
  );
}
