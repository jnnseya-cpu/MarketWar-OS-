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
];

export default function WebsiteIntelPage() {
  return (
    <div>
      <PageHeader
        kicker="AI Website Marketing Intelligence Engine"
        title="Paste a URL. Get the whole marketing strategy."
        subtitle="Deep-crawls any website, store or listing — extracts the full brand and catalogue dossier, scores the AI Marketing Health Score across 10 dimensions, then generates on-brand campaigns, creatives, funnels, competitor benchmarks and growth opportunities."
        actions={<Pill tone="info">Module M-33 · Agent 22 · crawler service lands at P1</Pill>}
      />

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
