import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import PartnerApplyForm from "@/components/PartnerApplyForm";
import { COMMISSION_MODEL, PROGRAMME_STEPS, STRATEGY_NOTE, MIN_PAYOUT_FOLLOWERS, MAX_PROGRAMMES, EARNING_TIERS, COMMISSION_BANDS, ratePct, INFLUENCER_RATE_10K, INFLUENCER_RATE_5K, SHARE2EARN_RATE, RATE_PLATFORM } from "@/shared/creator-program";

export const metadata: Metadata = {
  title: "Growth & Influencers · MarketWar OS",
  description: "Earn by growing the MarketWar OS portfolio — a creator, affiliate and partner programme for trusted niche educators, operators and reviewers. Performance-based, fraud-protected, paid on verified revenue.",
};

export default function GrowthPage() {
  return (
    <MarketingShell
      kicker="Growth & Influencers"
      title="Get paid to grow the portfolio"
      subtitle="We reward trusted niche creators — educators, operators, reviewers and problem-solvers — who create real demand. Performance-based deals, long-term partnerships, fraud-protected tracking, paid on verified revenue, never empty reach."
    >
      <Prose>
        <div className="mb-8 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
          <p className="text-sm font-semibold text-emerald-200">Apply now. Get your tracked code. Start earning on verified sales.</p>
          <p className="mt-1 text-[13px] text-slate-400">One profile, up to {MAX_PROGRAMMES} programmes, one wallet. {ratePct(INFLUENCER_RATE_10K)} of every referred customer&rsquo;s eligible net revenue at {MIN_PAYOUT_FOLLOWERS.toLocaleString()}+ verified followers, {ratePct(INFLUENCER_RATE_5K)} between 5,000 and 9,999 — tracked to the line, paid on real outcomes, never vanity metrics. Below 5,000 you are not turned away: SHARE2EARN pays {ratePct(SHARE2EARN_RATE)} with no follower gate at all, and you still accrue ACUs per referral.</p>
        </div>

        {/* The other door. This page is the REVIEWED one — it asks for your
            channels because the influencer bands pay more and a verified
            follower count is what unlocks them. Anyone who does not want to be
            reviewed should not be reading a form; they should be earning. */}
        <div className="mb-8 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-4">
          <p className="text-sm font-semibold text-sky-100">Don&rsquo;t want to apply? You don&rsquo;t have to.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
            This page is the reviewed door: you state your channels, we verify the follower count, and the count is what unlocks {ratePct(INFLUENCER_RATE_10K)} and {ratePct(INFLUENCER_RATE_5K)}. <Link href="/share2earn" className="font-semibold text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200">SHARE2EARN</Link> has no application at all — a name and an email, and you are earning {ratePct(SHARE2EARN_RATE)} of the eligible net value of every verified sale from the first one. It is the same account either way: join now, grow, apply later, and nothing already earned is lost.
          </p>
        </div>

        <div className="mb-8 rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-[13px] leading-relaxed text-slate-300"><span className="font-semibold text-white">Our approach:</span> {STRATEGY_NOTE}</p>
        </div>

        <div className="not-prose mb-8 grid gap-3 sm:grid-cols-3">
          <div className="card p-5"><p className="font-display text-2xl font-bold text-white">1–{MAX_PROGRAMMES}</p><p className="mt-1 text-xs text-slate-400">programmes you can subscribe to — a unique code/link for each product you promote.</p></div>
          <div className="card p-5"><p className="font-display text-2xl font-bold text-white">0</p><p className="mt-1 text-xs text-slate-400">followers needed to start earning. SHARE2EARN has no gate; the influencer bands open at 5,000 and step up at {MIN_PAYOUT_FOLLOWERS.toLocaleString()}, verified across all your socials + YouTube.</p></div>
          <div className="card p-5"><p className="font-display text-2xl font-bold text-emerald-300">{ratePct(INFLUENCER_RATE_10K)}</p><p className="mt-1 text-xs text-slate-400">of each referred customer&rsquo;s eligible net revenue is yours at {MIN_PAYOUT_FOLLOWERS.toLocaleString()}+ followers, {ratePct(INFLUENCER_RATE_5K)} from 5,000, {ratePct(SHARE2EARN_RATE)} on SHARE2EARN with no gate. The platform takes {ratePct(RATE_PLATFORM)} on top, charged to the promoted brand as their acquisition cost — never to you or the customer.</p></div>
        </div>

        {/* The questions a creator actually asks before applying, and the ones
            most programmes leave until after you have signed up. */}
        <H2>Getting paid</H2>
        <div className="not-prose mb-8 grid gap-4 sm:grid-cols-2">
          {[
            {
              h: "Withdraw wherever you are",
              p: "Bank transfer, instant to card, PayPal, Wise, or mobile money on M-Pesa, Orange Money, Airtel and Africell. The mobile rails need a phone number and nothing else, and their minimum is £2 rather than the £5–£20 of the bank rails — small, frequent withdrawals are normal there and a high floor would exclude the people this is for.",
            },
            {
              h: "Every fee, before you confirm",
              p: "The payout provider's processing fee is passed through at cost, and our administration fee is 3% of that fee — not of your withdrawal. On a £2 PayPal fee that is 6p. Each line says whose the charge is, and if another rail would leave you with more the quote tells you unprompted.",
            },
            {
              h: "Nothing is withheld for tax",
              p: "You are not an employee, so you are paid gross: no income tax, no National Insurance, no PAYE. We report annual earnings to the tax authority and hand you a copy of the same figure — reporting what you were paid and deducting from it are different things. If your country issues no individual tax reference, that fact is reported and you are never asked for a number that does not exist.",
            },
            {
              h: "Earned, not granted",
              p: "Once a sale settles and its refund window closes, the money is yours. A brand can dispute a specific earning on stated grounds — a refund, a chargeback, a self-referral — and you are told which. It cannot quietly hold a commission you earned.",
            },
          ].map((c) => (
            <div key={c.h} className="card p-5">
              <h3 className="font-display text-base font-bold text-white">{c.h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.p}</p>
            </div>
          ))}
        </div>
        <p className="mb-8 text-[13px] leading-relaxed text-slate-400">
          The full detail is in{" "}
          <Link href="/blog/creator-payout-economics" className="font-semibold text-emerald-400 hover:text-emerald-300">creator payout economics</Link>, and if your country issues no tax reference,{" "}
          <Link href="/blog/creator-payouts-no-tax-reference" className="font-semibold text-emerald-400 hover:text-emerald-300">how that is handled</Link>. Cash only ever comes from a verified sale — views, shares, clicks and streaks earn XP, rank and access to higher-value campaigns instead, which is what stops a merchant&rsquo;s margin being spent on engagement that produced nothing.
        </p>

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
