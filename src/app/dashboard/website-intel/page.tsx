"use client";

// M-33 AI Website Marketing Intelligence Engine (Agent 22) — URL in, unified
// marketing strategy out. Spec: docs/ai-os/10-viral-product-and-website-
// engines.md Part B. Conversational core live via the gateway; the deep-crawl
// service (Cloud Run, robots-respecting) lands with the connector phase (P1).

import {
  Blocks,
  Filter,
  Gauge,
  Globe,
  Palette,
  Radar,
  Rocket,
  Sprout,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill } from "@/components/ui";

const CRAWL_EXTRACTS = [
  "Products", "Services", "Pricing", "Images", "Videos", "Brand identity",
  "Fonts", "Colours", "Logos", "Audience", "CTAs", "Trust signals",
  "Reviews", "FAQs", "SEO metadata", "Content hierarchy", "Navigation",
  "Offers", "Blog content", "Contact info", "Social links",
];

const HEALTH_DIMENSIONS = [
  "SEO", "Speed", "UX", "Accessibility", "Mobile", "Conversion",
  "Technical", "Brand consistency", "Security", "Performance",
];

const SUITES = [
  { icon: Blocks, title: "AI Campaign Factory", desc: "Social calendars, 30-day content plans, 90-day growth strategies, seasonal campaigns, launches, promotional calendars, email/SMS/WhatsApp/push sequences, nurture funnels." },
  { icon: Palette, title: "AI Creative Generator", desc: "On-brand social graphics, video ads, display banners, blog graphics, infographics, mockups, hero and website banners, story templates, presentation decks." },
  { icon: Filter, title: "AI Funnel Builder", desc: "Landing pages, lead magnets, sales/webinar/appointment/course/e-commerce funnels, abandoned-cart flows, checkout optimisation, upsell journeys." },
  { icon: Radar, title: "AI Competitor Intelligence", desc: "Benchmarks products, pricing, SEO, keywords, advertising, social presence, messaging and sentiment — highlights market gaps and differentiation plays." },
  { icon: Sprout, title: "AI Growth Opportunities", desc: "New products, subscriptions, memberships, bundles, geographic expansion, partnerships, affiliate/influencer/marketplace plays — each with revenue impact, effort and ROI." },
  { icon: Gauge, title: "AI Brand Consistency Engine", desc: "Every generated asset locks to the site's logo, colours, typography, tone of voice, messaging and visual style — enforced at generation time." },
  { icon: Globe, title: "Site-to-Story Engine™", desc: "Turns website facts into founder journeys, customer transformations, origin and mission stories — every story traceable to verified business information." },
  { icon: Radar, title: "Trend Hijack with Brand Relevance™", desc: "Monitors trends the business can credibly join, scored through an 8-factor relevance gate — rejects anything that damages the brand, exploits tragedy or misleads." },
  { icon: Rocket, title: "Website-to-Influencer Campaign", desc: "Creator briefs with talking points, prohibited claims, mandatory disclosure, shot lists, tracking links and performance scorecards — marketplace matching at P2." },
];

export default function WebsiteIntelPage() {
  return (
    <div>
      <PageHeader
        kicker="MarketWar SiteRaid AI™"
        title="Paste an authorised URL. Launch a growth operation."
        subtitle="Converts a website into a complete, continuously optimised marketing and sales operation: Business DNA™, a Website Truth Layer™ that blocks unverified claims, six audits in one scan, a Competitive Attack Map and five-layer campaign architecture — nothing publishes without your rules."
        actions={<Pill tone="info">Module M-33 · Agent 22 · crawler + monitoring lands at P1</Pill>}
      />

      {/* v2 operation guarantees */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Website Truth Layer™", desc: "Every claim links to its source and carries a classification — verified, user-confirmed, inferred-awaiting-confirmation or prohibited. 'Best in the UK' is blocked unless substantiated. No hallucinated advertising, ever." },
          { title: "Business DNA Builder™", desc: "A continuously updated 24-field profile — model, offers, segments, value proposition, objections and every gap (trust, content, conversion, SEO, GEO, social) — that all campaigns draw from." },
          { title: "Competitive Attack Map", desc: "Where to win without copying: competitor weaknesses, saturated angles, unclaimed topics — prioritised from quick revenue wins to long-term defensibility." },
          { title: "Authorised & monitored", desc: "Ownership or permission confirmed before extraction; competitor URLs get public analysis only. Continuous rescans detect changes and propose updates — nothing auto-publishes without approved autopilot rules." },
        ].map((c) => (
          <div key={c.title} className="card border-emerald-500/20 p-4">
            <h3 className="font-display text-sm font-bold text-emerald-300">{c.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Input + crawl contract */}
      <div className="mb-8 card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-5 w-5 text-emerald-400" />
          <p className="font-display font-bold text-white">Works on any URL</p>
          <span className="text-xs text-slate-500">
            — business sites, Shopify/WooCommerce stores, Amazon listings, Etsy shops, SaaS, restaurants, portfolios,
            booking sites
          </span>
        </div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Deep crawl extracts</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CRAWL_EXTRACTS.map((c) => (
            <span key={c} className="rounded-full bg-ink-850 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
              {c}
            </span>
          ))}
        </div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
          AI Marketing Health Score — 10 dimensions
        </p>
        <div className="flex flex-wrap gap-1.5">
          {HEALTH_DIMENSIONS.map((h) => (
            <span key={h} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* Suites grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SUITES.map((s) => (
          <div key={s.title} className="card p-4 transition hover:border-emerald-500/40">
            <s.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the engine</h2>
      </div>
      <AgentRunner
        agentId="website-intelligence"
        buttonLabel="Crawl + generate the strategy"
        fields={[
          { key: "website", label: "Website URL", defaultValue: "brixtongrillhouse.co.uk" },
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Market", defaultValue: "Brixton, London" },
          {
            key: "goal",
            label: "What should the strategy optimise for?",
            defaultValue: "More direct WhatsApp orders and office catering leads — off the aggregator apps",
            textarea: true,
          },
        ]}
      />
    </div>
  );
}
