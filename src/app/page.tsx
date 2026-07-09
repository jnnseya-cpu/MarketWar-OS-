import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Bot,
  Crosshair,
  Factory,
  Flame,
  MapPin,
  MessageCircle,
  PiggyBank,
  Radar,
  RefreshCcw,
  Shield,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { AGENT_LIST } from "@/lib/ai/agents";

const MODULES = [
  { icon: Stethoscope, title: "Marketing Failure Audit", desc: "A blunt 'why you got 0 customers' report: conversion risk, offer weakness, trust and funnel-leak scores before a penny is spent." },
  { icon: Crosshair, title: "Campaign War Room", desc: "Every live campaign with a SCALE / FIX / STOP verdict, cost per lead, best hook and what to kill today." },
  { icon: BadgePercent, title: "Offer Builder", desc: "Engineers offers that force action — bundles, deadlines, guarantees — scored for margin safety." },
  { icon: Factory, title: "Content Factory", desc: "30-day calendars, reels and post scripts where every asset routes attention into channels you own." },
  { icon: Flame, title: "Landing Page Generator", desc: "Conversion pages with proof, FAQ, WhatsApp button and tracking — generated per campaign." },
  { icon: MessageCircle, title: "WhatsApp Sales Center", desc: "Ad → WhatsApp → AI qualification → order. The conversion engine small businesses actually close in." },
  { icon: Users, title: "Customer Intelligence Vault", desc: "Your customer database becomes a private marketing asset: segments, intent scores, churn risk, LTV." },
  { icon: RefreshCcw, title: "Lead Recovery Engine", desc: "Finds the revenue sleeping in your contacts and runs reactivation campaigns before you buy cold ads." },
  { icon: PiggyBank, title: "Budget Protection", desc: "Watches every pound. Pauses spend that produces no leads and reroutes it to what works." },
  { icon: Radar, title: "Competitor Spy", desc: "Tracks rival offers, ads and pricing — then turns their weaknesses into your campaigns." },
  { icon: MapPin, title: "Local Domination", desc: "Google Business attack plans, community distribution and geo-offers for hyper-local demand." },
  { icon: TrendingUp, title: "Revenue Intelligence", desc: "Attribution that shows what actually produced orders, plus 30-day forecasts and leak detection." },
];

const STEPS = [
  { n: "01", title: "Diagnose", desc: "Answer 10 questions. The Failure Audit scores your offer, audience, trust and funnel — and tells you why past spend produced nothing." },
  { n: "02", title: "Rebuild the offer", desc: "The Offer Builder engineers a deadline-bound offer your margin can survive and your market can't ignore." },
  { n: "03", title: "Launch small tests", desc: "The Campaign Commander deploys £15/day experiments with kill criteria locked before launch." },
  { n: "04", title: "Capture everything", desc: "Every click lands in WhatsApp or a generated landing page. Follow-up sequences fire automatically." },
  { n: "05", title: "Kill losers, scale winners", desc: "Budget Protection stops waste in 48 hours. Winners get scale orders with exact budget changes." },
  { n: "06", title: "Recover and compound", desc: "The vault reactivates old customers, referrals kick in, and revenue intelligence tells you tomorrow's move." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-ink-950">
              <Shield className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold text-white">
              MarketWar <span className="text-emerald-400">OS</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-400 sm:flex">
            <a href="#modules" className="hover:text-white">Modules</a>
            <a href="#agents" className="hover:text-white">AI Agents</a>
            <Link href="/how-it-works" className="hover:text-white">How it works</Link>
          </nav>
          <Link href="/onboarding" className="btn-primary !py-2 text-sm">
            Start free audit
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.12),transparent_55%)]" />
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-20 text-center sm:pt-28">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
            <Bot className="h-3.5 w-3.5" />
            The AI-powered growth &amp; commerce operating system
          </p>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight text-white sm:text-6xl">
            Stop guessing. <span className="text-emerald-400">Launch, test, kill,</span> improve and convert — automatically.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            You spent £100s on ads and got nothing. MarketWar OS diagnoses why, rebuilds your offer,
            runs small-budget experiments, protects every pound, recovers old customers and tells you
            exactly what to do next — from one unified platform.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/onboarding" className="btn-primary text-base">
              Run my free failure audit <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/dashboard" className="btn-ghost text-base">
              Explore the live demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            No credit card. The demo runs on simulated intelligence — connect your own AI key to go live.
          </p>
        </div>
      </section>

      {/* Problem strip */}
      <section className="border-y border-ink-700/60 bg-ink-900/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-12 text-center sm:grid-cols-3">
          {[
            ["Why did the marketing fail?", "The Failure Audit answers it with scores, not opinions."],
            ["What should run today?", "Daily orders ranked by £ impact, from the AI Growth Strategist."],
            ["Where is revenue leaking?", "Funnel-leak maps and a recovery plan for money you already earned."],
          ].map(([q, a]) => (
            <div key={q}>
              <p className="font-display text-lg font-bold text-white">{q}</p>
              <p className="mt-2 text-sm text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="mx-auto max-w-6xl px-5 py-20">
        <p className="mb-1 text-center text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
          One platform, every weapon
        </p>
        <h2 className="text-center font-display text-3xl font-bold text-white">Platform modules</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="card p-5 transition hover:border-emerald-500/40">
              <m.icon className="mb-3 h-5 w-5 text-emerald-400" />
              <h3 className="font-display font-bold text-white">{m.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="border-t border-ink-700/60 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="mb-1 text-center text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
            The agent corps
          </p>
          <h2 className="text-center font-display text-3xl font-bold text-white">
            {AGENT_LIST.length} specialised AI agents on your side
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
            Most tools create content. MarketWar OS diagnoses the business, rebuilds the offer,
            launches experiments, tracks leads and issues blunt SCALE / FIX / STOP verdicts.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_LIST.map((a) => (
              <div key={a.id} className="card p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                    <Bot className="h-4 w-4" />
                  </span>
                  <h3 className="font-display text-sm font-bold text-white">{a.name}</h3>
                </div>
                <p className="text-sm text-slate-400">{a.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-center font-display text-3xl font-bold text-white">The battle rhythm</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-5">
              <p className="font-display text-2xl font-bold text-emerald-500/60">{s.n}</p>
              <h3 className="mt-1 font-display font-bold text-white">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/onboarding" className="btn-primary text-base">
            Build my acquisition machine <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-700/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-sm text-slate-500">
          <p>
            MarketWar <span className="text-emerald-400">OS</span> — stop guessing, start converting.
          </p>
          <nav className="flex gap-5">
            <Link href="/how-it-works" className="hover:text-slate-300">How it works</Link>
            <Link href="/dashboard" className="hover:text-slate-300">Live demo</Link>
            <Link href="/onboarding" className="hover:text-slate-300">Free audit</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
