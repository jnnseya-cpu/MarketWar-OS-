import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Bot,
  CheckCircle2,
  Compass,
  Crosshair,
  Factory,
  Globe2,
  LineChart,
  MessageCircle,
  PiggyBank,
  Quote,
  Radar,
  RefreshCcw,
  Rocket,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import HeroMockup from "@/components/HeroMockup";
import { FunnelChart, HBarList, Sparkline } from "@/components/charts";
import { SERIES } from "@/lib/palette";
import { AGENT_LIST } from "@/lib/ai/agents";

const PILLARS = [
  {
    icon: Compass,
    color: SERIES[0],
    title: "Opportunity Discovery",
    desc: "Find profitable markets, trending niches, high-demand products, and untapped customer pain points before anyone else.",
    cta: "Discover Opportunities",
    href: "/dashboard/competitors",
  },
  {
    icon: Factory,
    color: SERIES[1],
    title: "Product & Offer Creation",
    desc: "Create products, offers, pricing, funnels, launch plans, and go-to-market strategies powered by AI.",
    cta: "Create & Launch",
    href: "/dashboard/offers",
  },
  {
    icon: Crosshair,
    color: SERIES[2],
    title: "AI Marketing Engine",
    desc: "Generate ads, landing pages, emails, social campaigns, videos, images, and brand content that convert — in minutes, not days.",
    cta: "Create Campaigns",
    href: "/dashboard/campaigns",
  },
  {
    icon: Workflow,
    color: SERIES[4],
    title: "Customer Acquisition System",
    desc: "Attract, convert, retarget, and retain customers across all major channels with AI-optimised strategies.",
    cta: "Acquire Customers",
    href: "/dashboard/war-room",
  },
  {
    icon: TrendingUp,
    color: SERIES[6],
    title: "Commerce & Revenue Optimisation",
    desc: "Track performance, optimise pricing, increase order value, and unlock new income streams.",
    cta: "Optimise Revenue",
    href: "/dashboard/revenue",
  },
  {
    icon: Globe2,
    color: SERIES[7],
    title: "Business Automation",
    desc: "Automate workflows, operations, customer support, reporting, and growth execution from one central dashboard.",
    cta: "Automate Everything",
    href: "/dashboard/briefing",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I spent £2,400 on boosted posts and got 3 orders. MarketWar OS found the leak in a week — now WhatsApp brings 40+ orders every Friday at £3.82 each.",
    name: "Justine Mensah",
    role: "Owner, Brixton Grill House",
    metric: "7.3x ROAS",
  },
  {
    quote:
      "The Budget Protection agent killed a campaign I was emotionally attached to. It was right. That single 'STOP' verdict paid for a year of the platform.",
    name: "Sofia Reyes",
    role: "Founder, Luna Beauty Studio",
    metric: "£4,100 waste stopped",
  },
  {
    quote:
      "We recovered £11,300 from our own customer database before spending anything on cold ads. Nobody else even told us that money existed.",
    name: "David Okonkwo",
    role: "Director, ProFit Gyms (3 sites)",
    metric: "£11.3k recovered",
  },
];

const PLANS = [
  {
    name: "Recon",
    price: "Free",
    period: "",
    desc: "Diagnose why marketing failed before you spend another pound.",
    features: ["Marketing Failure Audit", "Funnel leak map", "Recommended first campaign", "Demo intelligence mode"],
    cta: "Run the free audit",
    href: "/onboarding",
    featured: false,
  },
  {
    name: "Commander",
    price: "£49",
    period: "/mo",
    desc: "The full acquisition machine for a single business.",
    features: [
      "All 12 AI agents, live intelligence",
      "Campaign War Room + Budget Protection",
      "WhatsApp Sales Center & follow-up engine",
      "Customer Vault + Lead Recovery",
      "Landing pages, content factory, local SEO",
    ],
    cta: "Start 14-day trial",
    href: "/onboarding",
    featured: true,
  },
  {
    name: "War Council",
    price: "£199",
    period: "/mo",
    desc: "Agencies and multi-location operators.",
    features: [
      "Unlimited businesses / clients",
      "White-label reports",
      "Multi-location intelligence",
      "Priority AI throughput",
      "API access",
    ],
    cta: "Talk to us",
    href: "/onboarding",
    featured: false,
  },
];

const FAQS = [
  {
    q: "I'm not a marketer. Can I actually use this?",
    a: "That's the operating principle of the whole platform. You tell the OS what you sell, who you want and where you operate — it handles diagnosis, strategy, campaigns, copy, landing pages, follow-up and budget decisions, then tells you exactly what to do each day in plain language.",
  },
  {
    q: "How is this different from an AI content tool?",
    a: "Content tools create posts. MarketWar OS diagnoses the business, rebuilds the offer, launches tracked experiments, qualifies leads in WhatsApp, protects the budget and attributes every pound to revenue. Content is one weapon of twelve, not the product.",
  },
  {
    q: "What happens to campaigns that don't work?",
    a: "They die fast. Every campaign launches with kill criteria agreed in advance — exact cost-per-lead and CTR thresholds. The Budget Protection agent pauses waste automatically and reroutes the budget to proven winners, with a weekly 'money saved' receipt.",
  },
  {
    q: "Do I need a big ad budget?",
    a: "No. The OS starts with money you already own: your customer database (the Lead Recovery engine typically finds £1,000+ of dormant revenue), local SEO and referral loops. Paid tests start at £15/day and only scale on evidence.",
  },
  {
    q: "Which AI powers the agents?",
    a: "The platform ships with a zero-config demo mode so you can explore everything instantly. Connect your own Anthropic API key and every agent runs on live frontier-model intelligence with your business context.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-950">
      {/* ============================== NAV ============================== */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-2xl border border-white/10 bg-ink-950/70 px-5 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:mx-6 lg:mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-ink-950 shadow-lg shadow-emerald-500/30">
              <Shield className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold text-white">
              MarketWar <span className="text-emerald-400">OS</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-400 md:flex">
            <a href="#platform" className="transition hover:text-white">Platform</a>
            <a href="#agents" className="transition hover:text-white">AI Agents</a>
            <a href="#results" className="transition hover:text-white">Results</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <Link href="/how-it-works" className="transition hover:text-white">How it works</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="hidden text-sm font-semibold text-slate-300 transition hover:text-white sm:block">
              Live demo
            </Link>
            <Link
              href="/onboarding"
              className="rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 shadow-lg shadow-emerald-500/25 transition hover:shadow-emerald-500/40"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* ============================== HERO ============================= */}
      <section className="relative pt-36 sm:pt-44">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute right-[-10%] top-40 h-96 w-96 rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="pointer-events-none absolute left-[-10%] top-80 h-96 w-96 rounded-full bg-violet-500/10 blur-[120px]" />

        <div className="relative mx-auto max-w-6xl px-5 text-center">
          <div className="animate-fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            The AI-powered growth &amp; commerce operating system
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">v1.0</span>
          </div>

          <h1 className="animate-fade-up mx-auto max-w-4xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl" style={{ animationDelay: "0.08s" }}>
            One Operating System.{" "}
            <span className="text-gradient">Every Growth Weapon.</span>
          </h1>

          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl" style={{ animationDelay: "0.16s" }}>
            MarketWar OS is the AI-powered growth and commerce command centre that helps you
            discover opportunities, build products, market them, acquire customers, automate
            operations, optimise revenue, and scale — from one unified platform.
          </p>

          <div className="animate-fade-up mt-6 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "0.2s" }}>
            {["AI-Powered", "All-in-One Platform", "Built for Scale"].map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {b}
              </span>
            ))}
          </div>

          <div className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: "0.24s" }}>
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-7 py-3.5 text-base font-bold text-ink-950 shadow-xl shadow-emerald-500/30 transition hover:shadow-emerald-500/50"
            >
              Enter MarketWar OS
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition hover:border-emerald-500/50 hover:bg-white/10"
            >
              Watch Demo
            </Link>
          </div>

          {/* Product mockup */}
          <div className="animate-fade-up relative mx-auto mt-16 max-w-4xl" style={{ animationDelay: "0.4s" }}>
            <div className="pointer-events-none absolute -inset-x-10 top-10 -bottom-10 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.15),transparent_65%)]" />
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* ======================== SOCIAL PROOF STRIP ===================== */}
      <section className="relative mt-20 border-y border-white/5 bg-ink-900/40 py-8">
        <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-600">
          Trusted by founders &amp; teams
        </p>
        <div className="relative overflow-hidden">
          <div className="animate-marquee flex w-max gap-14 px-7">
            {[...Array(3)].flatMap((_, half) =>
              [
                "ELEVATE DIGITAL", "NEXORA LABS", "VERTEX COMMERCE", "QUANTUM BRANDS", "ZENITH GROWTH",
              ].map((name) => (
                <span key={`${half}-${name}`} className="whitespace-nowrap font-display text-lg font-bold text-slate-600">
                  {name}
                </span>
              ))
            )}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-ink-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-ink-950 to-transparent" />
        </div>
      </section>

      {/* ========================= SIX PILLARS =========================== */}
      <section id="platform" className="relative mx-auto max-w-6xl px-5 py-24">
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">The all-in-one growth OS</p>
        <h2 className="mx-auto max-w-2xl text-center font-display text-3xl font-bold text-white sm:text-5xl">
          Everything You Need to Build, Grow &amp; Scale
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-400">
          Powerful AI agents and tools working together — so you can focus on scaling, not juggling.
        </p>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/70 p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl hover:shadow-black/50"
            >
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40"
                style={{ background: p.color }}
              />
              <span
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `${p.color}26`, color: p.color }}
              >
                <p.icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{p.desc}</p>
              <Link
                href={p.href}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 transition group-hover:text-emerald-300"
              >
                {p.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ====================== FEATURE DEEP DIVES ======================= */}
      <section className="relative border-t border-white/5 bg-ink-900/30">
        <div className="mx-auto max-w-6xl space-y-24 px-5 py-24">
          {/* War room */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                <Crosshair className="h-4 w-4" /> Campaign War Room
              </p>
              <h3 className="font-display text-3xl font-bold text-white sm:text-4xl">
                Every campaign gets a verdict. <span className="text-gradient">Not a maybe.</span>
              </h3>
              <p className="mt-4 text-lg text-slate-400">
                SCALE, FIX or STOP — with the exact budget change and the reason. Kill criteria are
                locked before launch so no losing ad survives on hope, and the Financial Shield
                reroutes every recovered pound to a proven winner.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                {["Cost-per-order tracked against your real margins", "Automatic pause when spend produces no leads", "Weekly 'money saved' receipt"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass rounded-2xl p-5 shadow-2xl shadow-black/40">
              <p className="mb-4 text-sm font-bold text-white">Live campaign grid</p>
              <div className="space-y-2.5">
                {[
                  { name: "Family Platter Friday", spend: 84, rev: 610, verdict: "SCALE", vc: "text-emerald-400 bg-emerald-500/15 border-emerald-500/40", spark: [3, 5, 4, 7, 9, 12, 14], color: SERIES[1] },
                  { name: "Office Lunch Catering", spend: 112, rev: 380, verdict: "FIX", vc: "text-amber-400 bg-amber-500/15 border-amber-500/40", spark: [5, 6, 5, 6, 7, 6, 7], color: SERIES[2] },
                  { name: "Student Night 2-for-1", spend: 40, rev: 133, verdict: "TESTING", vc: "text-sky-400 bg-sky-500/15 border-sky-500/40", spark: [2, 3, 3, 4, 5, 5, 6], color: SERIES[0] },
                  { name: "Brand Awareness", spend: 96, rev: 0, verdict: "STOP", vc: "text-rose-400 bg-rose-500/15 border-rose-500/40", spark: [4, 3, 3, 2, 2, 1, 1], color: SERIES[5] },
                ].map((c) => (
                  <div key={c.name} className="flex items-center gap-3 rounded-xl border border-white/5 bg-ink-900/80 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                      <p className="text-xs text-slate-500">£{c.spend} spend → £{c.rev} revenue</p>
                    </div>
                    <Sparkline data={c.spark} color={c.color} width={72} height={28} />
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${c.vc}`}>{c.verdict}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* WhatsApp funnel */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="glass order-2 rounded-2xl p-5 shadow-2xl shadow-black/40 lg:order-1">
              <p className="mb-4 text-sm font-bold text-white">Ad → WhatsApp → Order — this week</p>
              <FunnelChart
                stages={[
                  { label: "Ad reach", value: 18400 },
                  { label: "Clicks", value: 862 },
                  { label: "WhatsApp threads", value: 214 },
                  { label: "Qualified", value: 121 },
                  { label: "Orders", value: 45 },
                ]}
              />
              <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                <Zap className="mr-1 inline h-3 w-3" /> AI insight: threads answered inside 10 minutes convert at 3x the rate — 9 need replies now.
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                <MessageCircle className="h-4 w-4" /> WhatsApp Sales Center
              </p>
              <h3 className="font-display text-3xl font-bold text-white sm:text-4xl">
                Clicks become <span className="text-gradient">conversations that close.</span>
              </h3>
              <p className="mt-4 text-lg text-slate-400">
                For real businesses, WhatsApp outsells websites. The OS routes every ad into a
                one-tap thread, qualifies the lead with AI, sends the offer, books the order and
                fires follow-ups at 1h, 24h and 48h — automatically.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                {["AI qualification with intent scoring on every thread", "Ghosted leads recovered with deadline offers", "Every conversation attributed to its campaign"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Revenue recovery */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                <RefreshCcw className="h-4 w-4" /> Lead Recovery Engine
              </p>
              <h3 className="font-display text-3xl font-bold text-white sm:text-4xl">
                Mine the revenue <span className="text-gradient">you already own.</span>
              </h3>
              <p className="mt-4 text-lg text-slate-400">
                Before you buy a single cold click, the Customer Vault scores every contact for
                recovery probability and the AI Revenue Recovery Score™ puts a number on the money
                sleeping in your database. Then reactivation waves go get it — at zero ad cost.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                {["Import CSV, CRM, Shopify, Stripe or WhatsApp exports", "Churn-risk and intent scoring on every contact", "Comeback, VIP and referral campaigns pre-built"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass rounded-2xl p-5 shadow-2xl shadow-black/40">
              <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">AI Revenue Recovery Score™</p>
                <p className="mt-1 font-display text-3xl font-bold text-white">£1,240 <span className="text-sm font-semibold text-slate-400">recoverable</span></p>
              </div>
              <p className="mb-3 text-sm font-bold text-white">Recoverable revenue by segment</p>
              <HBarList
                valuePrefix="£"
                data={[
                  { label: "Inactive 60d+ customers", value: 670 },
                  { label: "Abandoned quotes", value: 240 },
                  { label: "Repeat-buyer offers", value: 190 },
                  { label: "VIP early access", value: 90 },
                  { label: "Referral loop", value: 50 },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ========================== AGENT CORPS ========================== */}
      <section id="agents" className="relative mx-auto max-w-6xl px-5 py-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(144,133,233,0.08),transparent_70%)]" />
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">The agent corps</p>
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-5xl">
          {AGENT_LIST.length} AI specialists. Zero generic advice.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-400">
          Every agent operates under the Master Directive: money first, blunt verdicts, local
          fidelity — never &ldquo;best practices&rdquo; fluff.
        </p>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENT_LIST.map((a, i) => (
            <div
              key={a.id}
              className="group rounded-2xl border border-white/10 bg-ink-900/70 p-5 transition hover:-translate-y-0.5 hover:border-white/20"
            >
              <span
                className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: `${SERIES[i % SERIES.length]}22`, color: SERIES[i % SERIES.length] }}
              >
                <Bot className="h-5 w-5" />
              </span>
              <h3 className="font-display text-sm font-bold text-white">{a.name}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{a.role}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{a.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ========================== METRICS BAND ========================= */}
      <section id="results" className="border-y border-white/5 bg-gradient-to-b from-ink-900/60 to-ink-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 text-center sm:grid-cols-4">
          {[
            { value: "4.5x", label: "average blended ROAS", color: SERIES[1] },
            { value: "48h", label: "max lifetime of a losing ad", color: SERIES[5] },
            { value: "£1,240", label: "avg. dormant revenue found per vault", color: SERIES[2] },
            { value: "3x", label: "conversion lift from 10-min replies", color: SERIES[4] },
          ].map((m) => (
            <div key={m.label}>
              <p className="font-display text-4xl font-bold sm:text-5xl" style={{ color: m.color }}>{m.value}</p>
              <p className="mt-2 text-sm text-slate-400">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ========================= TESTIMONIALS ========================== */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">From the front line</p>
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-5xl">Operators, not spectators</h2>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="flex flex-col rounded-2xl border border-white/10 bg-ink-900/70 p-6">
              <Quote className="mb-4 h-6 w-6 text-emerald-500/50" />
              <blockquote className="flex-1 text-sm leading-relaxed text-slate-300">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                <div>
                  <p className="text-sm font-bold text-white">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.role}</p>
                </div>
                <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">{t.metric}</span>
              </figcaption>
              <div className="mt-3 flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </figure>
          ))}
        </div>
      </section>

      {/* ============================ PRICING ============================ */}
      <section id="pricing" className="border-t border-white/5 bg-ink-900/30 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">Pricing</p>
          <h2 className="text-center font-display text-3xl font-bold text-white sm:text-5xl">
            Cheaper than one wasted boost
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-slate-400">
            Most owners waste more than a year of MarketWar OS on a single bad campaign.
          </p>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl p-7 ${
                  p.featured
                    ? "gradient-border bg-ink-900 shadow-[0_30px_80px_-20px_rgba(16,185,129,0.3)]"
                    : "border border-white/10 bg-ink-900/70"
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 px-3 py-1 text-[11px] font-bold text-ink-950">
                    MOST POPULAR
                  </span>
                )}
                <h3 className="font-display text-lg font-bold text-white">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{p.desc}</p>
                <p className="mt-5 font-display text-4xl font-bold text-white">
                  {p.price}
                  <span className="text-base font-semibold text-slate-500">{p.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-300">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.href}
                  className={`mt-7 rounded-xl py-3 text-center text-sm font-bold transition ${
                    p.featured
                      ? "bg-gradient-to-r from-emerald-400 to-emerald-500 text-ink-950 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50"
                      : "border border-white/15 text-white hover:border-emerald-500/50"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== FAQ ============================== */}
      <section className="mx-auto max-w-3xl px-5 py-24">
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-4xl">Questions, answered bluntly</h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-xl border border-white/10 bg-ink-900/70 px-5 transition open:border-emerald-500/30">
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="ml-4 shrink-0 text-emerald-400 transition group-open:rotate-45">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </span>
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* =========================== FINAL CTA =========================== */}
      <section className="relative overflow-hidden border-t border-white/5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(16,185,129,0.15),transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl px-5 py-28 text-center">
          <span className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-ink-950 shadow-2xl shadow-emerald-500/40">
            <Rocket className="h-7 w-7" />
          </span>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">Built for winners</p>
          <h2 className="font-display text-3xl font-bold text-white sm:text-5xl">
            From Idea to Income —<br />
            <span className="text-gradient">In One Platform.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
            MarketWar OS is more than software. It&apos;s your unfair advantage.
            <br />
            Strategy. Execution. Automation. Revenue. All in one place.
          </p>
          <Link
            href="/dashboard"
            className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-8 py-4 text-base font-bold text-ink-950 shadow-xl shadow-emerald-500/30 transition hover:shadow-emerald-500/50"
          >
            Enter MarketWar OS
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <p className="mt-4 text-xs font-semibold text-slate-500">
            Start Building Your Growth Machine • 14-Day Free Trial
          </p>
        </div>
      </section>

      {/* ============================= FOOTER ============================ */}
      <footer className="border-t border-white/5 bg-ink-950">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-ink-950">
                  <Shield className="h-5 w-5" />
                </span>
                <span className="font-display text-lg font-bold text-white">
                  MarketWar <span className="text-emerald-400">OS</span>
                </span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Autonomous Business Growth &amp; Commerce Infrastructure.
              </p>
            </div>
            <FooterCol
              title="Products"
              links={[
                ["Campaign Packs", "/dashboard/campaigns"],
                ["AI Video Studio", "/dashboard/video"],
                ["Conversion Engine", "/dashboard/whatsapp"],
              ]}
            />
            <FooterCol
              title="Intelligence"
              links={[
                ["Failure Audit", "/dashboard/audit"],
                ["Market Scan", "/dashboard/competitors"],
                ["Warfare Protocol", "/how-it-works"],
              ]}
            />
            <FooterCol
              title="Platform"
              links={[
                ["ACU Ledger", "/dashboard/budget"],
                ["Independence", "/dashboard/local"],
                ["Business Brain", "/onboarding"],
              ]}
            />
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Mechanics</p>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li>· 66% Competitive Margin</li>
                <li>· Layer 4.6 Architect</li>
                <li>· Autonomous ACU Logic</li>
                <li>· Primary Revenue Ledger</li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-6 text-xs text-slate-600">
            <p>© {new Date().getFullYear()} MarketWar Infrastructure Systems</p>
            <p className="flex items-center gap-4">
              <Link href="/how-it-works" className="hover:text-slate-400">Mission Protocol</Link>
              <span className="flex items-center gap-1.5">
                <LineChart className="h-3.5 w-3.5 text-emerald-500" /> Privacy Shield
              </span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <ul className="space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-sm text-slate-400 transition hover:text-emerald-300">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
