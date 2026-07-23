import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import PartnerApplyForm from "@/components/PartnerApplyForm";
import { COMMISSION_MODEL, PROGRAMME_STEPS, STRATEGY_NOTE, MIN_PAYOUT_FOLLOWERS, MAX_PROGRAMMES, EARNING_TIERS } from "@/shared/creator-program";

export const metadata: Metadata = {
  title: "Growth & Influencers · MarketWar OS",
  description: "Earn by growing the MarketWar OS portfolio — a creator, affiliate and partner programme for trusted niche educators, operators and reviewers. Performance-based, fraud-protected, paid on verified revenue.",
};

export default function GrowthPage() {
  return (
    <MarketingShell
      kicker="Growth & Influencers · Early access"
      title="Get paid to grow the portfolio"
      subtitle="We reward trusted niche creators — educators, operators, reviewers and problem-solvers — who create real demand. Performance-based deals, long-term partnerships, fraud-protected tracking, paid on verified revenue, never empty reach."
    >
      <Prose>
        <div className="mb-8 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
          <p className="text-sm font-semibold text-emerald-200">Apply now. Get your tracked code. Start earning on verified sales.</p>
          <p className="mt-1 text-[13px] text-slate-400">One profile, up to {MAX_PROGRAMMES} programmes, one wallet. You earn 0.75% of every referred customer&rsquo;s eligible net revenue — tracked to the line, paid on real outcomes, never vanity metrics. {MIN_PAYOUT_FOLLOWERS.toLocaleString()}+ combined followers unlocks recurring cash commission; under that you earn ACUs per referral and auto-upgrade the moment you cross the line.</p>
        </div>

        <div className="mb-8 rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-[13px] leading-relaxed text-slate-300"><span className="font-semibold text-white">Our approach:</span> {STRATEGY_NOTE}</p>
        </div>

        <div className="not-prose mb-8 grid gap-3 sm:grid-cols-3">
          <div className="card p-5"><p className="font-display text-2xl font-bold text-white">1–{MAX_PROGRAMMES}</p><p className="mt-1 text-xs text-slate-400">programmes you can subscribe to — a unique code/link for each product you promote.</p></div>
          <div className="card p-5"><p className="font-display text-2xl font-bold text-white">{MIN_PAYOUT_FOLLOWERS.toLocaleString()}+</p><p className="mt-1 text-xs text-slate-400">followers across all your socials + YouTube to unlock payout — you can still promote + accrue below it. Your funds accumulate until you reach 10K, then pay out.</p></div>
          <div className="card p-5"><p className="font-display text-2xl font-bold text-emerald-300">0.75%</p><p className="mt-1 text-xs text-slate-400">of each referred customer&rsquo;s eligible net revenue is yours (platform takes 0.25%). The 1% is charged to the promoted brand as their acquisition cost — never to you or the customer.</p></div>
        </div>

        <H2>Four ways to earn</H2>
        <div className="not-prose grid gap-4 sm:grid-cols-2">
          {EARNING_TIERS.map((t) => (
            <div key={t.key} className="card p-5">
              <div className="flex items-center justify-between gap-2"><h3 className="font-display text-base font-bold text-white">{t.label}</h3><span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">{t.model}</span></div>
              <p className="mt-2 text-sm text-slate-400">{t.forWhom}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unlock: {t.unlock}</p>
            </div>
          ))}
        </div>

        <H2>How you get paid</H2>
        <ul className="space-y-1.5">
          {COMMISSION_MODEL.map((c) => (
            <li key={c} className="flex items-start gap-2 text-[14px] text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />{c}</li>
          ))}
        </ul>

        <H2>How the creator programme works</H2>
        <ol className="space-y-2">
          {PROGRAMME_STEPS.map((s, i) => (
            <li key={s} className="flex items-start gap-3 text-[14px] text-slate-300">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-300">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        <H2>Apply now — it&rsquo;s a real application</H2>
        <PartnerApplyForm />

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/get-started" className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-emerald-500">Start a brand account</Link>
        </div>
      </Prose>
    </MarketingShell>
  );
}
