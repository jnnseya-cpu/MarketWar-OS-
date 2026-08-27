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
  Scissors,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import HeroMockup from "@/components/HeroMockup";
import SiteAuthLinks from "@/components/SiteAuthLinks";
import LandingVisuals from "@/components/LandingVisuals";
import { FunnelChart, HBarList, Sparkline } from "@/components/charts";
import { SERIES } from "@/shared/palette";
import { AGENT_LIST } from "@/shared/agents";
// The operating targets are READ FROM THE RULES, never typed beside them.
import { DEFAULT_GUARDRAILS, MIN_SPEND_TO_JUDGE_GBP, MIN_CONVERSIONS_TO_JUDGE_CPA } from "@/backend/paid-guardrails";
import { MARKUP_FLOOR } from "@/backend/subscription";
import { ARMY, DIVISIONS } from "@/shared/warlord-roster";
import { INCLUDED_TOOLS, includedSummary } from "@/shared/included-tools";
import { BrandLockup } from "@/components/Logo";

const PILLARS = [
  {
    icon: Compass,
    color: SERIES[0],
    title: "Opportunity Discovery",
    desc: "Find profitable markets, trending niches, high-demand products, and untapped customer pain points before anyone else.",
    cta: "Discover Opportunities",
    href: "/signup",
  },
  {
    icon: Factory,
    color: SERIES[1],
    title: "Product & Offer Creation",
    desc: "Create products, offers, pricing, funnels, launch plans, and go-to-market strategies powered by AI.",
    cta: "Create & Launch",
    href: "/signup",
  },
  {
    icon: Crosshair,
    color: SERIES[2],
    title: "AI Marketing Engine",
    desc: "Generate ads, landing pages, emails, social campaigns, images and brand content that convert — plus vertical clips cut straight out of your long videos, captioned and branded in the browser. A generated ad stays editable: the headline is a string you can retype and every placement is a fresh layout rather than a crop, so fixing a typo costs nothing instead of a whole new generation.",
    cta: "Create Campaigns",
    href: "/signup",
  },
  {
    icon: Workflow,
    color: SERIES[4],
    title: "Customer Acquisition System",
    desc: "Attract, convert, retarget, and retain customers across all major channels with AI-optimised strategies — including email sent from your own authenticated domain on the platform's own infrastructure, DKIM-signed and tracked, with no third-party provider. Plus the two local plays that happen off the screen: review requests to customers you really served, on the platforms that permit asking, and print-ready flyers specified in millimetres rather than in social-post pixels.",
    cta: "Acquire Customers",
    href: "/signup",
  },
  {
    icon: TrendingUp,
    color: SERIES[6],
    title: "Commerce & Revenue Optimisation",
    desc: "Track performance, optimise pricing, increase order value, and unlock new income streams — with a Money Ledger that only ever shows revenue you actually recorded, against the cost you actually entered.",
    cta: "Optimise Revenue",
    href: "/signup",
  },
  {
    icon: Users,
    color: SERIES[3],
    title: "An audience that sells for you",
    desc: "Turn customers and creators into a performance-based distribution network. SHARE2EARN pays 0.5% of a verified sale with no follower requirement at all; the creator programme pays 0.75% and 1% on verified counts. Commission is only ever charged on sales those people produced, capped at 5% of the value generated, and the platform refuses any reward that would breach the margin you chose to protect.",
    cta: "See how creators earn",
    href: "/blog/creator-earning-programmes",
  },
  {
    icon: Globe2,
    color: SERIES[7],
    title: "Business Automation",
    desc: "Automate workflows, operations, customer support, reporting, and growth execution from one central dashboard — including chains of agents that work one job in order, on a schedule you set, sharing what they already know about your business. They draft; anything that would spend, send or publish waits for you.",
    cta: "Automate Everything",
    href: "/signup",
  },
];

// Illustrative scenarios — NOT customer endorsements. The platform is new and
// we do not publish invented testimonials or fabricated results. Each card
// describes a situation the OS is built to handle and the engine that handles
// it, so the value is concrete without pretending a specific customer said it.
const SCENARIOS = [
  {
    situation:
      "£2,400 on boosted posts, a handful of orders, no idea where the money leaked.",
    mechanism:
      "The Marketing Failure Audit finds the leak; the WhatsApp funnel turns ad clicks into qualified, tracked orders instead of vanity reach.",
    engine: "Failure Audit → WhatsApp funnel",
  },
  {
    situation:
      "A campaign you're emotionally attached to that's quietly losing money.",
    mechanism:
      "Budget Protection scores real spend against real return and gives a plain STOP / FIX / SCALE verdict — before the loss compounds.",
    engine: "Budget Protection engine",
  },
  {
    situation:
      "Money already sitting in your own customer list, before you spend a penny on cold ads.",
    mechanism:
      "The Recovery engine scores your imported vault and drafts win-back offers to the contacts most likely to buy again — owned channels first.",
    engine: "Customer Recovery engine",
  },
];

// The real 8-tier model (src/backend/subscription.ts). Platform access is the
// subscription; AI actions draw from a monthly ACU allowance (top up anytime) —
// the two are separate so you only pay for what you use.
const PLANS = [
  { name: "Free", price: "£0", period: "", desc: "Diagnose + try the whole OS.", features: ["1 brand · 1 user", "100 AI credits to start", "Every module + AI agent to explore", "Business DNA + Marketing Audit", "1 campaign + 1 landing page"], cta: "Start free", href: "/signup", featured: false },
  { name: "Starter", price: "£19", period: "/mo", desc: "Your first real campaigns.", features: ["1 brand · 2 users · 3 socials", "380 AI credits/mo", "First-Customer sprint to real sales", "Email from your own domain", "WhatsApp funnel + on-brand content"], cta: "Start", href: "/signup", featured: false },
  { name: "Growth", price: "£49", period: "/mo", desc: "The full acquisition machine.", features: ["3 brands · 5 users · 10 socials", "980 AI credits/mo", `Full ${AGENT_LIST.length}-agent AI workforce`, "Search Dominance + SEO workbench", "Competitor intel + lead recovery", "Revenue Autopilot + own email sending"], cta: "Start 14-day trial", href: "/signup", featured: true },
  { name: "Scale", price: "£149", period: "/mo", desc: "Multi-brand operators.", features: ["10 brands · 15 users · 30 socials", "2,980 AI credits/mo", "Approvals + collaboration workflow", "Per-brand wallets + white-label", "OMNIRANK + dedicated sending domains"], cta: "Choose Scale", href: "/signup", featured: false },
  { name: "Business", price: "£399", period: "/mo", desc: "Agencies + franchises.", features: ["30 brands · 40 users · 100 socials", "7,980 AI credits/mo", "White-label included", "ROI + revenue-attribution ledger", "Priority support"], cta: "Choose Business", href: "/signup", featured: false },
  { name: "Enterprise", price: "£999", period: "/mo", desc: "Large multi-location.", features: ["100 brands · 100 users", "19,980 AI credits/mo", "Unlimited campaigns", "Controlled wallets + org hierarchy", "API access + SSO", "Onboarding + training"], cta: "Talk to us", href: "/contact", featured: false },
  { name: "Corporate", price: "£2,499", period: "/mo", desc: "Networks + resellers.", features: ["300 brands · 300 users", "49,980 AI credits/mo", "Unlimited campaigns", "Full controlled-wallet governance", "Dedicated onboarding + throughput"], cta: "Talk to us", href: "/contact", featured: false },
  { name: "Global", price: "£7,499", period: "/mo", desc: "Custom at any scale.", features: ["Custom brands + users", "~149,980 AI credits/mo", "Unlimited campaigns", "Dedicated infrastructure", "White-glove implementation + SLAs"], cta: "Talk to us", href: "/contact", featured: false },
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
    a: "No. The OS starts with money you already own: your existing customer list. Import it and dormant customers — people who bought before and stopped — are surfaced and ranked, which is the cheapest sale any business can make. Local SEO and referral loops cost nothing but time. If you do run paid ads, tests start small and only scale on evidence you can see.",
  },
  {
    q: "Will it email my customers or post publicly without me?",
    a: "No, and that is enforced in the code rather than promised in the copy. Agents can run in chains, on a schedule, overnight — but every step declares what it does, and only the ones that DRAFT are allowed to run on their own. Anything that would send a message, publish a page or spend money becomes an item waiting for your approval, with the draft attached. That holds for scheduled runs too: you wake up to work you can read, not to messages you did not see go out.",
  },
  {
    q: "How much can it spend while I am not watching?",
    a: "A fixed ceiling per brand per day, reserved before each step rather than counted afterwards, so a job that gets stuck cannot run up a bill on the grounds that failing is free. When the ceiling is reached the remaining steps stop and say so rather than disappearing quietly. It only limits what the platform does on its own initiative — anything you run yourself is governed by your own ACU balance, which is shown next to every action before you click it.",
  },
  {
    q: "Can you get me more reviews and followers?",
    a: "More reviews, yes — from people you actually served. The platform reads your customer list, works out who is eligible (a real order, finished long enough ago to have an opinion, not asked recently, consent intact), builds the correct review link for the platform you choose, and paces the sending so a sudden burst does not trip the filters. Everyone eligible gets the same link, because screening for the happy ones first is illegal under the UK DMCC Act 2024 and the US FTC rule. Supplied reviews and bought followers are not available here at any price: the penalty for them lands on your page, not ours, and bought followers make your reach worse because every feed ranks by engagement rate.",
  },
  {
    q: "Which AI powers the agents, and do I need my own account?",
    a: "You need no AI account of your own. The intelligence is included in your plan and priced in ACUs — the unit shown next to every action before you click it — so there is nothing to sign up for, no separate bill and no keys to manage. The agents run on frontier models, and the platform routes across more than one provider, so a single provider having a bad day does not stop your work. If you would rather use your own provider account you can connect it on higher tiers, but nobody has to.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-950">
      {/* ============================== NAV ============================== */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-2xl border border-white/10 bg-ink-950/70 px-5 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:mx-6 lg:mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLockup />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-400 md:flex">
            <a href="#platform" className="transition hover:text-white">Product</a>
            <a href="#agents" className="transition hover:text-white">Solutions</a>
            <Link href="/how-it-works" className="transition hover:text-white">Resources</Link>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <Link href="/about" className="transition hover:text-white">About</Link>
          </nav>
          <div className="flex items-center gap-3">
            <SiteAuthLinks
              ctaClassName="rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 shadow-lg shadow-emerald-500/25 transition hover:shadow-emerald-500/40"
            />
          </div>
        </div>
      </header>

      {/* ============================== HERO ============================= */}
      <section className="relative pt-36 sm:pt-44">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(ellipse_55%_50%_at_50%_-5%,rgba(16,185,129,0.20),transparent_68%)]" />
        <div className="pointer-events-none absolute right-[-12%] top-52 h-[26rem] w-[26rem] rounded-full bg-emerald-500/[0.07] blur-[140px]" />
        <div className="pointer-events-none absolute left-[-12%] top-96 h-80 w-80 rounded-full bg-emerald-400/[0.05] blur-[130px]" />

        <div className="relative mx-auto max-w-6xl px-5 text-center">
          <div className="animate-fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            The AI customer-acquisition &amp; revenue-growth operating system
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">v1.0</span>
          </div>

          <h1 className="animate-fade-up mx-auto max-w-4xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl" style={{ animationDelay: "0.08s" }}>
            More customers. More revenue.{" "}
            <span className="text-gradient">Less waste.</span>
          </h1>

          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl" style={{ animationDelay: "0.16s" }}>
            MarketWar doesn&rsquo;t help you look busy — it helps you make money. From day one it
            shows you where the money is, what&rsquo;s blocking it, and the exact action that
            unlocks it: find demand, acquire customers, convert sales, recover lost revenue and
            outperform competitors — from one operating system.
          </p>

          <div className="animate-fade-up mt-6 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "0.2s" }}>
            {["More customers", "More revenue", "Less waste"].map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {b}
              </span>
            ))}
          </div>

          <div className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: "0.24s" }}>
            {/* THE FIRST ASK IS NOT "SIGN UP".
                A stranger who has never heard of us will not create an account
                to find out whether we are any good. They will, however, type
                their own website into a box to see what is wrong with it — and
                that is the same product, on the outside of the login. */}
            <Link
              href="/audit"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-7 py-3.5 text-base font-bold text-ink-950 shadow-xl shadow-emerald-500/30 transition hover:shadow-emerald-500/50"
            >
              Audit my website free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition hover:border-emerald-500/50 hover:bg-white/10"
            >
              Get started free
            </Link>
          </div>

          {/* Product mockup */}
          <div className="animate-fade-up relative mx-auto mt-16 max-w-4xl" style={{ animationDelay: "0.4s" }}>
            <div className="pointer-events-none absolute -inset-x-10 top-10 -bottom-10 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.15),transparent_65%)]" />
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* ======================== INFRASTRUCTURE STRIP ===================== */}
      {/* Honest: we're invitation-only and new, so no invented customer logos.
          Instead we show the real production stack the OS runs on — every name
          here is a service we genuinely build on. */}
      <section className="relative mt-20 border-y border-white/5 bg-ink-900/40 py-8">
        <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-600">
          Built on production-grade infrastructure
        </p>
        <div className="relative overflow-hidden">
          <div className="animate-marquee flex w-max gap-14 px-7">
            {[...Array(3)].flatMap((_, half) =>
              [
                "VERCEL", "CLOUDFLARE", "FIREBASE", "STRIPE", "ANTHROPIC CLAUDE",
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

      {/* ==================== VISUAL SHOWCASE (dashboards) ================ */}
      <LandingVisuals />

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
                {/* "Automatic pause" was not true and could not be: NOTHING in this
                    codebase pauses a campaign — there is no pauseCampaign, no
                    status write, no channel call that stops spend. It also
                    contradicted the platform's own rule, stated four sections
                    below on this same page: "They draft; anything that would
                    spend, send or publish waits for you." The verdict and the
                    exact budget change are real and computed; applying them is
                    one click, by a person. */}
                {["Cost-per-order tracked against your real margins", "A STOP verdict the moment spend produces no leads — one click to apply", "Weekly 'money saved' receipt"].map((f) => (
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
                For real businesses, WhatsApp outsells websites. The OS points every ad at a
                one-tap thread with the message already written, and hands you the four that
                close it — first reply, stalled thread, order confirmation, review request.
                You send them; nothing here messages your customers on its own.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                {/* It said "AI qualification with intent scoring on every thread",
                    "Ghosted leads recovered" and "Every conversation attributed
                    to its campaign". Nothing sends a WhatsApp message: no Graph
                    API call, no scheduler, no thread store. The route serving
                    this panel says so itself — "No live WhatsApp traffic source
                    is wired yet" — and returns a ZEROED funnel with the note
                    "nothing is fabricated" rather than inventing one, which is
                    the right behaviour and deserved a page that matched it. */}
                {["Pre-filled wa.me links your ads and pages route into", "The four messages that matter, written for your business", "The funnel fills from real conversations once WhatsApp is connected — until then it shows zero, not a guess"].map((f) => (
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
                Before you buy a single cold click, the Customer Vault scores every contact you
                import for engagement, intent, churn risk and lifetime value, and totals the
                revenue those contacts could still be worth. Then it drafts the reactivation
                waves that go and get it — at zero ad cost. With nothing imported it shows zero
                and says so, rather than a sample base.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                {/* It listed "CRM, Shopify, Stripe or WhatsApp" as if each were a
                    connector. The vault takes a CSV — which is what all four of
                    those give you when you export, so the capability is real and
                    the wording was not. */}
                {["Import a CSV — including the exports Shopify, Stripe, your CRM or WhatsApp hand you", "Engagement, intent, churn-risk and lifetime-value scoring on every contact", "Comeback, VIP and referral waves drafted for you"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass rounded-2xl p-5 shadow-2xl shadow-black/40">
              <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                {/* The engine computes `totalRecoverableGbp` from imported
                    contacts. There is no separate scoring system called an "AI
                    Revenue Recovery Score", and a ™ on a name that appears
                    nowhere in the code is a claim about a product that does not
                    exist. The figure is real; the branding around it was not. */}
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Recoverable revenue · illustrative</p>
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

          {/* Clip Lab — one long video in, vertical clips out */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="glass order-2 rounded-2xl p-5 shadow-2xl shadow-black/40 lg:order-1">
              <p className="mb-1 text-sm font-bold text-white">Clips found in a 68-minute recording</p>
              <p className="mb-4 text-[11px] text-slate-500">Example of the output shape — your clips come from your own video.</p>
              <div className="space-y-2.5">
                {[
                  { at: "12:04 → 12:51", quote: "The reason your quotes go cold is nobody follows up on day two.", signals: ["Hook", "Stands alone", "Payoff", "Ask"] },
                  { at: "31:20 → 32:09", quote: "We stopped running ads for a month and sales went up. Here's why.", signals: ["Hook", "Payoff", "Pace"] },
                  { at: "47:55 → 48:32", quote: "If you only fix one thing this week, fix the first reply.", signals: ["Stands alone", "Buying signal", "Ask"] },
                ].map((c) => (
                  <div key={c.at} className="rounded-xl border border-white/5 bg-ink-900/80 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[11px] text-emerald-300">{c.at}</p>
                      <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">9:16 · captions burned in</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-200">&ldquo;{c.quote}&rdquo;</p>
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {c.signals.map((s) => (
                        <span key={s} className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">{s}</span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                <Scissors className="h-4 w-4" /> Clip Lab
              </p>
              <h3 className="font-display text-3xl font-bold text-white sm:text-4xl">
                One long video in. <span className="text-gradient">Vertical clips out.</span>
              </h3>
              <p className="mt-4 text-lg text-slate-400">
                Point it at a recording — a webinar, a podcast, a walkthrough — and it transcribes the audio, reads
                the transcript and returns the moments worth posting, with the exact in and out points and a caption
                file already rebased to start at zero. Every clip shows the signals it was picked on, so you can
                disagree with it.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                {[
                  "Seven counted signals per clip — hook, stands alone, payoff, pace, length, buying signal, ask",
                  "Cropped to 9:16 with captions burned in, your logo and a B-roll overlay",
                  "Rendered in your browser: nothing uploaded to a render service, no render bill",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ========================== AGENT CORPS ========================== */}
      <section id="agents" className="relative mx-auto max-w-6xl px-5 py-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(144,133,233,0.08),transparent_70%)]" />
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">The revenue army</p>
        {/* The count is DERIVED from the list rendered below it. It used to read
            "26-agent" above a grid of 39 cards anybody could count, because the
            26 belongs to a different roster — the Command Centre's front-line
            units. Both numbers are now taken from their own source. */}
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-5xl">
          A {AGENT_LIST.length}-agent revenue army. Zero generic advice.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-400">
          Money first, blunt verdicts, local fidelity — and never a number about your business that
          you did not give it. In the Command Centre, {ARMY.length} front-line units are grouped
          into {DIVISIONS.length - 1} divisions under one commander (WARLORD), each carrying a
          revenue KPI. Every pound they make you is stamped in a live Money Ledger with your ROI.
          No agent exists for &ldquo;activity.&rdquo;
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

      {/* ========================== TARGETS BAND ========================= */}
      {/* Honest: we're new and invitation-only, so these are the operating
          targets the OS is engineered to hit — the thresholds its automation
          rules enforce — NOT averaged customer results. Labelled as such. */}
      <section id="results" className="border-y border-white/5 bg-gradient-to-b from-ink-900/60 to-ink-950">
        <p className="mx-auto max-w-6xl px-5 pt-16 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">
          What the OS is engineered to enforce
        </p>
        <p className="mx-auto max-w-2xl px-5 pt-2 text-center text-sm text-slate-500">
          Operating targets built into the automation rules — not averaged customer results. We&rsquo;re new; we don&rsquo;t publish numbers we haven&rsquo;t earned.
        </p>
        {/* EVERY NUMBER HERE IS READ OUT OF THE RULE THAT ENFORCES IT.
            This block used to be four typed literals under a heading promising
            they were "built into the automation rules", and three of the four
            were not:
              • "4.0x+ blended ROAS before scaling" — the guardrail scales at
                THREE times return (DEFAULT_GUARDRAILS.scaleRoas), and this same
                page said "only above 3× return" four sections further down. The
                headline contradicted the body and the code agreed with the body.
              • "48h kill-window" — no forty-eight-hour rule exists anywhere in
                paid-guardrails, budget or the war room. The real stop is
                EVIDENCE, not a clock: nothing is judged below £25 of spend or
                five conversions, and a campaign that spends without producing is
                stopped whenever that threshold is crossed.
              • "10 min reply SLA" — the inbox SLA defaults to SIXTY minutes.
                The ten-minute figure came from a line of advice copy, which is
                not a rule the software runs.
            A number nobody computes is the exact thing the audit page refuses to
            print about a stranger's website, and it had been sitting on our own
            front page. These are imported now, so the claim moves when the rule
            moves and cannot drift back. */}
        <div className="mx-auto grid max-w-6xl gap-8 px-5 pb-16 pt-8 text-center sm:grid-cols-4">
          {[
            { value: `${DEFAULT_GUARDRAILS.scaleRoas}×`, label: "return a campaign must clear before the budget agent will scale it at all", color: SERIES[1] },
            { value: `+${DEFAULT_GUARDRAILS.maximumScalePct}%`, label: "the largest step it will take when it does — never a doubling on a good week", color: SERIES[5] },
            { value: `£${MIN_SPEND_TO_JUDGE_GBP}`, label: `spend and ${MIN_CONVERSIONS_TO_JUDGE_CPA} conversions before it will judge anything — under that it refuses to have an opinion`, color: SERIES[2] },
            { value: `${MARKUP_FLOOR}×`, label: "provider cost is the floor under every AI action's price, enforced in code", color: SERIES[4] },
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
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">Illustrative scenarios · not customer endorsements</p>
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-5xl">What the system is built to do</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-400">We&rsquo;re new, so we don&rsquo;t publish invented reviews or made-up numbers. These are real situations the OS is designed to handle — and the engine that handles each one.</p>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {SCENARIOS.map((s) => (
            <figure key={s.engine} className="flex flex-col rounded-2xl border border-white/10 bg-ink-900/70 p-6">
              <Quote className="mb-4 h-6 w-6 text-emerald-500/50" />
              <blockquote className="flex-1 text-sm leading-relaxed text-slate-300">&ldquo;{s.situation}&rdquo;</blockquote>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">{s.mechanism}</p>
              <figcaption className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Illustrative</p>
                <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">{s.engine}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ================ WHAT YOU WOULD OTHERWISE PAY FOR ================ */}
      {/*
          The page sold the strategy and left out the tools. A reader could not
          tell that the recorder puts YOU on the recording, that bulk email goes
          from your own domain with attachments, or that a long video comes back
          as clips — and those are three separate monthly bills for most people.

          Every row names something that ships. Where a key is needed the row
          says so: a feature list that overstates is a refund in week two.
      */}
      <section id="included" className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-5xl px-5">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">One subscription, not eleven</p>
          <h2 className="mx-auto max-w-3xl text-center font-display text-3xl font-bold text-white sm:text-5xl">
            The tools you are already paying for, included
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-400">
            {includedSummary().line}
          </p>

          <div className="mt-12 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/40">
            {INCLUDED_TOOLS.map((t) => (
              <div key={t.insteadOf} className="grid gap-2 p-5 sm:grid-cols-[220px_1fr] sm:gap-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Instead of</p>
                  <p className="mt-1 font-display text-sm font-bold text-white">{t.insteadOf}</p>
                  {t.keyless ? (
                    <span className="mt-2 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                      Works with no keys
                    </span>
                  ) : (
                    <span className="mt-2 inline-block rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Needs one connection
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-[15px] leading-relaxed text-slate-300">{t.included}</p>
                  {/* The limit is printed next to the promise, not in a footnote. */}
                  {t.limit && <p className="mt-1.5 text-xs text-slate-500">{t.limit}</p>}
                </div>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-400">
            Every one of these is behind the same monthly price and the same credit allowance. There is no per-tool bill,
            no per-seat surprise on the tools, and nothing here is a separate add-on.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/audit" className="btn-primary">Audit my website free</a>
            <a href="#pricing" className="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5">See the price</a>
          </div>
        </div>
      </section>

      {/* ============================ PRICING ============================ */}
      <section id="pricing" className="border-t border-white/5 bg-ink-900/30 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">Pricing</p>
          <h2 className="text-center font-display text-3xl font-bold text-white sm:text-5xl">
            One Marketing OS. <span className="text-gradient">Every Brand. Every Campaign.</span> One Predictable Bill.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-400">
            Eight tiers from free to global — start where you are, scale when it pays. <span className="text-slate-200">Platform access + AI consumption are separate:</span> every plan includes a monthly ACU allowance for AI actions, and you top up only what you use.
          </p>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl p-6 ${
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
            href="/signup"
            className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-8 py-4 text-base font-bold text-ink-950 shadow-xl shadow-emerald-500/30 transition hover:shadow-emerald-500/50"
          >
            Get started free
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
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <BrandLockup />
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                The AI-powered customer-acquisition operating system. One account, every brand, one predictable bill.
              </p>
            </div>
            <FooterCol
              title="Company"
              links={[
                ["About", "/about"],
                ["Industries", "/industries"],
                ["Blog", "/blog"],
                ["Contact", "/contact"],
              ]}
            />
            <FooterCol
              title="Product"
              links={[
                ["How it works", "/how-it-works"],
                ["Developers", "/developers"],
                ["Get started", "/get-started"],
                ["Growth & Influencers", "/growth"],
              ]}
            />
            <FooterCol
              title="Legal & status"
              links={[
                ["Terms of Service", "/terms"],
                ["Privacy Policy", "/privacy"],
                ["All policies", "/policies"],
                ["Platform status", "/status"],
              ]}
            />
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
