import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import PartnerApplyForm from "@/components/PartnerApplyForm";
import { CREATOR_TIERS, COMMISSION_MODEL, PROGRAMME_STEPS, PORTFOLIO, PRIORITY_ORDER, STRATEGY_NOTE } from "@/shared/creator-program";

export const metadata: Metadata = {
  title: "Growth & Influencers · MarketWar OS",
  description: "Earn by growing the MarketWar OS portfolio — a creator, affiliate and partner programme for trusted niche educators, operators and reviewers. Performance-based, fraud-protected, paid on verified revenue.",
};

const TIER_PAY: Record<string, string> = { micro: "Performance commission", authority: "High-value partnership", local_viral: "Local performance deal" };

export default function GrowthPage() {
  return (
    <MarketingShell
      kicker="Growth & Influencers · Early access"
      title="Get paid to grow the portfolio"
      subtitle="We reward trusted niche creators — educators, operators, reviewers and problem-solvers — who create real demand. Performance-based deals, long-term partnerships, fraud-protected tracking, paid on verified revenue, never empty reach."
    >
      <Prose>
        <div className="mb-8 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
          <p className="text-sm font-semibold text-emerald-200">Applications are open — apply below and we&rsquo;ll onboard you as your tier goes live.</p>
          <p className="mt-1 text-[13px] text-slate-400">The form below is a real application: your details are captured and reviewed. The programme opens in phases — we onboard partners tier by tier as tracking, payouts and the partner dashboard go live, and email you when yours is ready. Honest by design: no fabricated numbers, no fake dashboard shown as working.</p>
        </div>

        <div className="mb-8 rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-[13px] leading-relaxed text-slate-300"><span className="font-semibold text-white">Our approach:</span> {STRATEGY_NOTE}</p>
        </div>

        <H2>Three creator tiers</H2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CREATOR_TIERS.map((t) => (
            <div key={t.key} className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-white">{t.label}</h3>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">{TIER_PAY[t.key]}</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-emerald-300/80">{t.audience}</p>
              <p className="mt-2 text-sm text-slate-400">{t.bestFor}</p>
            </div>
          ))}
        </div>

        <H2>Products &amp; the creators who fit</H2>
        <p className="text-slate-400">Each product in the portfolio recruits a specific creator profile — trust travels within a niche. Pick the product you already speak to when you apply.</p>
        <div className="not-prose mt-4 grid gap-3 sm:grid-cols-2">
          {PORTFOLIO.map((p) => (
            <div key={p.key} className="rounded-xl border border-white/[0.08] bg-ink-900/50 p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-bold text-white">{p.name}</h3>
                {p.priority && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Recruiting first</span>}
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-500">{p.category}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.targetProfiles.map((prof) => (
                  <span key={prof} className="rounded-md border border-white/[0.07] bg-ink-950/60 px-2 py-0.5 text-[11px] text-slate-300">{prof}</span>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">{p.why}</p>
            </div>
          ))}
        </div>

        <H2>Where we&rsquo;re recruiting first</H2>
        <ol className="space-y-1.5">
          {PRIORITY_ORDER.map((p) => (
            <li key={p.key} className="flex items-start gap-3 text-[14px] text-slate-300">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-300">{p.priority}</span>
              <span><span className="font-semibold text-white">{p.name}</span> — {p.category.toLowerCase()} creators can build trust and demand fastest here.</span>
            </li>
          ))}
        </ol>

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
