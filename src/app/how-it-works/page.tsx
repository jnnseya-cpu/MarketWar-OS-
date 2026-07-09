import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

const PHASES = [
  {
    phase: "Phase 1 — Brain Sync",
    title: "Tell the OS what you sell, who you want and where you operate",
    detail:
      "Ten questions build your Business Brain: product, pricing, margins, location, target customer, past spend and results. You never need to be a marketer — the OS carries the strategy from here.",
  },
  {
    phase: "Phase 2 — Failure Diagnosis",
    title: "Find out exactly why past marketing produced nothing",
    detail:
      "The Marketing Failure Audit scores conversion risk, offer weakness, audience mismatch, trust, landing experience and follow-up readiness — then maps every leak in your funnel and names the top five reasons money was wasted.",
  },
  {
    phase: "Phase 3 — Offer Engineering",
    title: "Rebuild the offer until it forces action",
    detail:
      "The Offer Builder engineers volume, margin and recovery offers with deadlines, caps and guarantees — each one checked for margin safety before it ships.",
  },
  {
    phase: "Phase 4 — Campaign Warfare",
    title: "Launch small-budget experiments with kill criteria locked",
    detail:
      "The Campaign Commander deploys £15/day tests: one offer, three hooks, a WhatsApp destination. Kill and scale criteria are exact numbers agreed before launch, so no losing ad survives on hope.",
  },
  {
    phase: "Phase 5 — Capture & Conversion",
    title: "Every click lands somewhere that converts",
    detail:
      "Generated landing pages and the WhatsApp Sales Center qualify leads, send offers and book orders. Follow-up sequences fire at 1h, 24h and 48h so no lead dies of silence.",
  },
  {
    phase: "Phase 6 — Budget Protection",
    title: "The Financial Shield watches every pound",
    detail:
      "Campaigns that spend without producing leads are paused automatically and the budget is rerouted to proven winners — with a weekly 'money saved' receipt.",
  },
  {
    phase: "Phase 7 — Recovery & Compounding",
    title: "Mine the revenue you already own, then scale",
    detail:
      "The Customer Vault scores every contact for recovery probability. Reactivation waves, referral loops and local domination compound growth while Revenue Intelligence forecasts next month's money.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to MarketWar OS
        </Link>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Mission protocol</p>
        <h1 className="font-display text-4xl font-bold text-white">How MarketWar OS works</h1>
        <p className="mt-4 text-lg text-slate-400">
          Seven phases take a business from &ldquo;boosted posts and hope&rdquo; to an autonomous
          customer acquisition machine.
        </p>

        <ol className="mt-12 space-y-0">
          {PHASES.map((p, i) => (
            <li key={p.phase} className="relative border-l border-ink-600 pb-10 pl-8 last:pb-0">
              <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/50 bg-ink-900 font-display text-xs font-bold text-emerald-400">
                {i + 1}
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">{p.phase}</p>
              <h2 className="mt-1 font-display text-xl font-bold text-white">{p.title}</h2>
              <p className="mt-2 text-slate-400">{p.detail}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 text-center">
          <Link href="/onboarding" className="btn-primary text-base">
            Start Phase 1 now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
