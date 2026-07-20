import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Get started · MarketWar OS",
  description: "Start free, upgrade as you grow. Manage every brand under one account and pay only for the AI you use.",
};

const STEPS = [
  ["Create your account", "Sign up in under a minute — email or Google. Start free, no card required."],
  ["Point us at your business", "Paste your website or product URL. Onboarding builds your Business DNA, personas, keyword & prompt universes and a 90-day plan."],
  ["See the engines work", "Everything runs in demo mode instantly — diagnose failures, generate campaigns, score opportunities — before you connect a single account."],
  ["Launch & scale", "Connect the channels that increase ROI, publish with guardrails, and let the OS reallocate toward what makes money."],
];

const PLANS = [
  ["Free", "£0", "Explore the platform · 1 brand · 100 ACUs / year"],
  ["Starter", "£19/mo", "Freelancers & solo · 380 ACUs/mo · 1 brand"],
  ["Growth", "£49/mo", "Small business · 980 ACUs/mo · 3 brands"],
  ["Scale", "£149/mo", "SMEs & agencies · 2,980 ACUs/mo · 10 brands"],
];

export default function GetStartedPage() {
  return (
    <MarketingShell
      kicker="Get started"
      title="From idea to income — in one platform"
      subtitle="Start free, upgrade as you grow, and keep complete control of budgets. One account, every brand, one predictable bill — pay only for the AI you use."
    >
      <Prose>
        <div className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <div key={t} className="card p-5">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-300">{i + 1}</div>
              <h3 className="font-display text-base font-bold text-white">{t}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{d}</p>
            </div>
          ))}
        </div>

        <H2>Pick a starting plan</H2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map(([name, price, blurb]) => (
            <div key={name} className="card p-4">
              <p className="font-display text-sm font-bold text-white">{name}</p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-400">{price}</p>
              <p className="mt-2 text-[12px] text-slate-400">{blurb}</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-slate-500">Business, Enterprise, Corporate and Global plans available — see the full ladder and ACU allowances on the <Link href="/dashboard/billing" className="text-emerald-400 hover:text-emerald-300">billing page</Link>. Save 30% with annual billing.</p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-ink-950 hover:bg-emerald-400">Create free account</Link>
          <Link href="/how-it-works" className="rounded-lg border border-ink-700 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-emerald-500">See how it works</Link>
        </div>
      </Prose>
    </MarketingShell>
  );
}
