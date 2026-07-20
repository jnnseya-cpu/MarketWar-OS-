import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Growth & Influencers · MarketWar OS",
  description: "Earn by growing MarketWar OS — the creator, affiliate and promoter network. Get paid for results with transparent tiers and fraud-protected tracking.",
};

const TIERS = [
  ["Promoter", "Anyone with an audience — share your link, earn on referrals that convert.", "Referral commission"],
  ["Creator", "Make content for brands on the platform; get briefed, approved and paid on milestones.", "Per-campaign + performance"],
  ["Affiliate Partner", "Drive signups at scale with tracked links, coupon codes and a dashboard.", "Recurring revenue share"],
  ["Agency Partner", "Bring clients onto MarketWar OS under your own white-label workspace.", "Margin by client"],
];

export default function GrowthPage() {
  return (
    <MarketingShell
      kicker="Growth & Influencers"
      title="Get paid to grow the network"
      subtitle="MarketWar rewards the people who create demand — creators, promoters, affiliates and agencies. Transparent tiers, fraud-protected tracking, and payment for real results, not empty reach."
    >
      <Prose>
        <H2>Ways to earn</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TIERS.map(([name, what, pay]) => (
            <div key={name} className="card p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-white">{name}</h3>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">{pay}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{what}</p>
            </div>
          ))}
        </div>

        <H2>How the creator programme works</H2>
        <ol className="space-y-2">
          {[
            "Apply and get scored — audience fit, engagement quality and brand safety (micro & local creators welcome).",
            "Get matched to brands and receive a clear brief: talking points, prohibited claims, mandatory disclosure.",
            "Create — with mandatory AI-content disclosure and rights records kept on file.",
            "Track performance with a unique link + coupon code; get paid on milestones, not vibes.",
            "Reuse the winning content (with rights) across the brand's campaigns.",
          ].map((s, i) => (
            <li key={s} className="flex items-start gap-3 text-[14px] text-slate-300">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-300">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        <H2>Built-in trust</H2>
        <p className="text-slate-400">
          Every payout is fraud-scored, every endorsement carries AI-disclosure, and we never fabricate testimonials or
          clone a creator without consent. Attribution is transparent — you see exactly which content drove which
          conversion.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/contact" className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400">Apply to the network</Link>
          <Link href="/get-started" className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-emerald-500">Start a brand account</Link>
        </div>
      </Prose>
    </MarketingShell>
  );
}
