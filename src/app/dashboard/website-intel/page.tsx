"use client";

// M-33 AI Website Marketing Intelligence Engine (Agent 22) — URL in, unified
// marketing strategy out. Spec: docs/ai-os/10-viral-product-and-website-
// engines.md Part B. Conversational core live via the gateway; the deep-crawl
// service (Cloud Run, robots-respecting) lands with the connector phase (P1).
//
// Honesty rule (owner directive): every capability on this page is badged LIVE
// (produces real, computed output today — demo-deterministic, live with keys) or
// P1 (scaffolded, activates with the crawl / render / publish pipeline). The
// Instant Marketing Audit below is wired to the REAL SiteRaid engine
// (/api/siteraid): authorisation gate, 6-part audit with sub-scores, Business
// DNA, Competitive Attack Map and the Website Truth Layer — all computed live.

import { useState } from "react";
import {
  Blocks,
  CheckCircle2,
  Clock,
  Filter,
  Gauge,
  Globe,
  Loader2,
  Palette,
  Radar,
  Rocket,
  ShieldCheck,
  Sprout,
  Swords,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, ScoreBar, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Status = "live" | "p1";

// Small honest status chip (local per the page pattern; not shared across pages).
function StatusChip({ status }: { status: Status }) {
  return status === "live" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Live now
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      <Clock className="h-3 w-3" /> Coming at P1
    </span>
  );
}

const CRAWL_EXTRACTS = [
  "Products", "Services", "Pricing", "Images", "Videos", "Brand identity",
  "Fonts", "Colours", "Logos", "Audience", "CTAs", "Trust signals",
  "Reviews", "FAQs", "SEO metadata", "Content hierarchy", "Navigation",
  "Offers", "Blog content", "Contact info", "Social links",
];

const GUARANTEES: { title: string; desc: string; status: Status }[] = [
  { title: "Website Truth Layer™", status: "live", desc: "Every claim links to its source and carries a classification — verified, user-confirmed, inferred-awaiting-confirmation or prohibited. 'Best in the UK' is blocked unless substantiated. No hallucinated advertising, ever." },
  { title: "Business DNA Builder™", status: "live", desc: "A continuously updated 24-field profile — model, offers, segments, value proposition, objections and every gap (trust, content, conversion, SEO, GEO, social) — that all campaigns draw from." },
  { title: "Competitive Attack Map", status: "live", desc: "Where to win without copying: competitor weaknesses, saturated angles, unclaimed topics — prioritised from quick revenue wins to long-term defensibility." },
  { title: "Authorised & monitored", status: "live", desc: "Ownership or permission is confirmed before extraction (live gate below); competitor URLs get public analysis only. Continuous rescans that auto-detect site changes activate with the crawler at P1 — nothing auto-publishes without approved autopilot rules." },
];

// Each suite: what it produces TODAY vs what needs the crawl / render pipe (P1).
const SUITES: { icon: typeof Blocks; title: string; desc: string; status: Status; note: string }[] = [
  { icon: Blocks, title: "AI Campaign Factory", status: "live", note: "Plans, calendars & sequences generated live by the strategy agent below.", desc: "Social calendars, 30-day content plans, 90-day growth strategies, seasonal campaigns, launches, promotional calendars, email/SMS/WhatsApp/push sequences, nurture funnels." },
  { icon: Palette, title: "AI Creative Generator", status: "p1", note: "On-brand SVG creatives render today in Brand Studio; photoreal graphics/video need an image/video-model key.", desc: "On-brand social graphics, video ads, display banners, blog graphics, infographics, mockups, hero and website banners, story templates, presentation decks." },
  { icon: Filter, title: "AI Funnel Builder", status: "p1", note: "Funnel copy & structure generate live; hosted page building + checkout wiring land with connectors.", desc: "Landing pages, lead magnets, sales/webinar/appointment/course/e-commerce funnels, abandoned-cart flows, checkout optimisation, upsell journeys." },
  { icon: Radar, title: "AI Competitor Intelligence", status: "live", note: "Powered by the Competitive Attack Map engine — run it live below.", desc: "Benchmarks products, pricing, SEO, keywords, advertising, social presence, messaging and sentiment — highlights market gaps and differentiation plays." },
  { icon: Sprout, title: "AI Growth Opportunities", status: "live", note: "Ranked opportunities (revenue impact × effort) come from the live attack map + strategy agent.", desc: "New products, subscriptions, memberships, bundles, geographic expansion, partnerships, affiliate/influencer/marketplace plays — each with revenue impact, effort and ROI." },
  { icon: Gauge, title: "AI Brand Consistency Engine", status: "p1", note: "Enforced at generation time — activates with the creative render pipeline.", desc: "Every generated asset locks to the site's logo, colours, typography, tone of voice, messaging and visual style — enforced at generation time." },
  { icon: Globe, title: "Site-to-Story Engine™", status: "live", note: "Founder / customer / origin stories generated live by the strategy agent from verified facts.", desc: "Turns website facts into founder journeys, customer transformations, origin and mission stories — every story traceable to verified business information." },
  { icon: Radar, title: "Trend Hijack with Brand Relevance™", status: "p1", note: "The 8-factor relevance gate is defined; live trend monitoring needs the trends feed (P1).", desc: "Monitors trends the business can credibly join, scored through an 8-factor relevance gate — rejects anything that damages the brand, exploits tragedy or misleads." },
  { icon: Rocket, title: "Website-to-Influencer Campaign", status: "p1", note: "Briefs generate live; creator marketplace matching lands at P2.", desc: "Creator briefs with talking points, prohibited claims, mandatory disclosure, shot lists, tracking links and performance scorecards — marketplace matching at P2." },
];

// ---- Live engine response types (mirror src/backend/siteraid.ts exports) ----
type IngestionDecision = { allowed: boolean; mode: string; reason: string };
type AuditSection = { area: string; overall: number; verdict: "strong" | "improve" | "urgent"; dimensions: { name: string; score: number }[] };
type SiteAudit = { sections: AuditSection[]; overall: number; headline: string };
type BusinessDNA = {
  marketCategory: string; businessModel: string; revenueModel: string; valueProposition: string;
  brandPersonality: string; mainConversionAction: string; competitiveAdvantages: string[];
  trustGaps: string[]; contentGaps: string[]; conversionGaps: string[]; seoGaps: string[]; geoGaps: string[]; socialGaps: string[];
};
type AttackMove = { gap: string; opportunity: number; priority: string; play: string };
type AttackMap = { moves: AttackMove[]; note: string };
type ClaimVerdict = { text: string; classification: string; publishable: boolean; reason: string; source?: string };
type TruthReport = { verdicts: ClaimVerdict[]; publishable: ClaimVerdict[]; blocked: ClaimVerdict[] };

type AuditReport = { ingestion: IngestionDecision; audit: SiteAudit; dna: BusinessDNA; attack: AttackMap; truth: TruthReport };

const VERDICT_TONE: Record<AuditSection["verdict"], "good" | "warn" | "bad"> = { strong: "good", improve: "warn", urgent: "bad" };
const CLASS_TONE: Record<string, "good" | "warn" | "bad" | "info"> = {
  verified_website: "good", verified_business_data: "good", user_confirmed: "info", inferred_pending: "warn", prohibited: "bad",
};
const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const AUTHS: { value: string; label: string }[] = [
  { value: "own", label: "I own this site" },
  { value: "manage", label: "I manage it for the owner" },
  { value: "have_permission", label: "I have the owner's permission" },
  { value: "competitor_public", label: "Competitor — public analysis only" },
];

export default function WebsiteIntelPage() {
  const { activeBrand } = useActiveBrand();
  const [website, setWebsite] = useState(activeBrand?.website || "brixtongrillhouse.co.uk");
  const [business, setBusiness] = useState(activeBrand?.name || "");
  const [category, setCategory] = useState(activeBrand?.industry || "Restaurant");
  const [offers, setOffers] = useState(activeBrand?.offer || "Dine-in, Table booking, Private hire");
  const [location, setLocation] = useState(activeBrand?.location || "");
  const [price, setPrice] = useState<"budget" | "mass" | "premium">("mass");
  const [authorisation, setAuthorisation] = useState("own");
  const [reviews] = useState(213);
  const [rating] = useState(4.7);

  const [report, setReport] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAudit() {
    setBusy(true);
    setError(null);
    try {
      const site = {
        business,
        category,
        offers: offers.split(",").map((o) => o.trim()).filter(Boolean),
        pricePosition: price,
        location,
        reviews,
        rating,
      };
      const claims = [
        ...site.offers.map((o) => ({ text: o, source: "delivery policy" })),
        { text: `Rated ${rating} by ${reviews} reviewers`, source: "Google reviews" },
        { text: `The best ${category.toLowerCase()} in ${location.split(",")[0]}`, substantiated: false },
      ];
      const post = (body: Record<string, unknown>) =>
        fetch("/api/siteraid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      const [ingestion, audit, dna, attack, truth] = await Promise.all([
        post({ action: "authorise", authorisation }),
        post({ action: "audit", site }),
        post({ action: "dna", site }),
        post({ action: "attack", site }),
        post({ action: "truth", claims }),
      ]);
      if (audit?.error) throw new Error(audit.error);
      setReport({ ingestion, audit, dna, attack, truth });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="MarketWar SiteRaid AI™"
        title="Paste an authorised URL. Launch a growth operation."
        subtitle="Converts a website into a complete, continuously optimised marketing and sales operation: Business DNA™, a Website Truth Layer™ that blocks unverified claims, six audits in one scan, a Competitive Attack Map and five-layer campaign architecture — nothing publishes without your rules."
        actions={<Pill tone="info">Module M-33 · Agent 22 · deep crawler + monitoring lands at P1</Pill>}
      />

      {/* Honesty legend — what computes real output today vs what needs the crawler */}
      <div className="mb-8 card border-white/[0.08] p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <span className="font-display font-bold text-white">What&apos;s real today:</span>
          <span className="flex items-center gap-1.5"><StatusChip status="live" /> computes real output now (deterministic in demo; full quality with keys)</span>
          <span className="flex items-center gap-1.5"><StatusChip status="p1" /> scaffolded — activates with the deep crawler / render / publish pipeline</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          The intelligence — authorisation gate, Business DNA, the 6-part marketing audit with sub-scores, the Competitive Attack
          Map and the Website Truth Layer — runs live in the <span className="text-emerald-300">Instant Marketing Audit</span> below.
          Auto-crawling a live URL and continuous change-monitoring are marked <span className="text-amber-300">Coming at P1</span>.
        </p>
      </div>

      {/* v2 operation guarantees */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GUARANTEES.map((c) => (
          <div key={c.title} className="card border-emerald-500/20 p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-emerald-300">{c.title}</h3>
              <StatusChip status={c.status} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Deep crawl extracts — honestly badged: the crawler that auto-extracts these lands at P1 */}
      <div className="mb-8 card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-5 w-5 text-emerald-400" />
          <p className="font-display font-bold text-white">Works on any URL</p>
          <span className="text-xs text-slate-500">
            — business sites, Shopify/WooCommerce stores, Amazon listings, Etsy shops, SaaS, restaurants, portfolios,
            booking sites
          </span>
        </div>
        <div className="mb-1.5 flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Deep crawl extracts</p>
          <StatusChip status="p1" />
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          Auto-extraction from a live URL activates with the robots-respecting crawler at P1. Today, describe the business in the
          <span className="text-emerald-300"> Instant Marketing Audit</span> below and the engine computes the full audit, DNA and attack map now.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CRAWL_EXTRACTS.map((c) => (
            <span key={c} className="rounded-full bg-ink-850 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* LIVE Instant Marketing Audit — wired to the real SiteRaid engine */}
      <div className="mb-8 card border-emerald-500/30 p-6">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Instant Marketing Audit</h2>
          <StatusChip status="live" />
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Authorisation gate → Business DNA → 6-part audit with sub-scores → Competitive Attack Map → Website Truth Layer.
          Computed live by the SiteRaid engine; deterministic so it runs with zero keys.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Website URL</label>
            <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <div>
            <label className="label">Business</label>
            <input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} />
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="label">Offers (comma-separated)</label>
            <input className="input" value={offers} onChange={(e) => setOffers(e.target.value)} />
          </div>
          <div>
            <label className="label">Location / market</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <label className="label">Price position</label>
            <select className="input" value={price} onChange={(e) => setPrice(e.target.value as "budget" | "mass" | "premium")}>
              <option value="budget">Budget</option>
              <option value="mass">Mass-market</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label">Authorisation basis</label>
            <select className="input" value={authorisation} onChange={(e) => setAuthorisation(e.target.value)}>
              {AUTHS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </div>

        <button className="btn-primary mt-4" onClick={runAudit} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Auditing…</> : <><Gauge className="h-4 w-4" /> Run instant audit</>}
        </button>
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

        {report && (
          <div className="mt-6 space-y-6">
            {/* Authorisation gate */}
            <div className={`rounded-lg border p-3 text-sm ${report.ingestion.allowed ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-rose-500/30 bg-rose-500/[0.05]"}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${report.ingestion.allowed ? "text-emerald-400" : "text-rose-400"}`} />
                <span className="font-semibold text-white">Ingestion {report.ingestion.allowed ? "authorised" : "blocked"}</span>
                <Pill tone={report.ingestion.mode === "full_reuse" ? "good" : report.ingestion.mode === "public_analysis_only" ? "warn" : "bad"}>{pretty(report.ingestion.mode)}</Pill>
              </div>
              <p className="mt-1 text-xs text-slate-400">{report.ingestion.reason}</p>
            </div>

            {/* Overall health */}
            <div>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <StatCard label="Marketing health" value={`${report.audit.overall}/100`} tone={report.audit.overall >= 75 ? "good" : report.audit.overall >= 55 ? "warn" : "bad"} />
                <StatCard label="Audit areas" value={`${report.audit.sections.length}`} sub="each with 6 sub-scores" />
                <StatCard label="Attack moves" value={`${report.attack.moves.length}`} sub="gaps → prioritised fixes" />
              </div>
              <p className="text-xs text-slate-400">{report.audit.headline}</p>
            </div>

            {/* 6-part audit with sub-scores */}
            <div className="grid gap-4 lg:grid-cols-2">
              {report.audit.sections.map((s) => (
                <div key={s.area} className="card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-bold capitalize text-white">{s.area}</h3>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-white">{s.overall}</span>
                      <Pill tone={VERDICT_TONE[s.verdict]}>{s.verdict}</Pill>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {s.dimensions.map((d) => <ScoreBar key={d.name} label={d.name} score={d.score} />)}
                  </div>
                </div>
              ))}
            </div>

            {/* Business DNA snapshot */}
            <div className="card p-4">
              <h3 className="mb-2 font-display text-sm font-bold text-white">Business DNA snapshot</h3>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="text-slate-500">Category:</span> <span className="text-slate-300">{report.dna.marketCategory}</span></p>
                <p><span className="text-slate-500">Model:</span> <span className="text-slate-300">{report.dna.businessModel}</span></p>
                <p><span className="text-slate-500">Revenue:</span> <span className="text-slate-300">{report.dna.revenueModel}</span></p>
                <p><span className="text-slate-500">Main conversion:</span> <span className="text-slate-300">{report.dna.mainConversionAction}</span></p>
                <p className="sm:col-span-2"><span className="text-slate-500">Value proposition:</span> <span className="text-slate-300">{report.dna.valueProposition}</span></p>
              </div>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">Priority gaps to close</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[...report.dna.conversionGaps, ...report.dna.trustGaps, ...report.dna.seoGaps, ...report.dna.geoGaps].slice(0, 8).map((g, i) => (
                  <span key={i} className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-300">{g}</span>
                ))}
              </div>
            </div>

            {/* Competitive Attack Map — the fixes, ranked */}
            <div className="card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Swords className="h-4 w-4 text-emerald-400" />
                <h3 className="font-display text-sm font-bold text-white">Competitive Attack Map — top fixes</h3>
              </div>
              <div className="space-y-2">
                {report.attack.moves.slice(0, 6).map((m) => (
                  <div key={m.gap} className="rounded-lg border border-white/[0.06] bg-ink-900/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{pretty(m.gap)}</span>
                      <div className="flex items-center gap-2">
                        <Pill tone="info">{pretty(m.priority)}</Pill>
                        <Pill tone={m.opportunity >= 75 ? "good" : m.opportunity >= 55 ? "warn" : "neutral"}>opportunity {m.opportunity}</Pill>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{m.play}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">{report.attack.note}</p>
            </div>

            {/* Website Truth Layer verdicts */}
            <div className="card p-4">
              <h3 className="mb-2 font-display text-sm font-bold text-white">
                Website Truth Layer — {report.truth.publishable.length} publishable, {report.truth.blocked.length} blocked
              </h3>
              <div className="space-y-2">
                {report.truth.verdicts.map((v, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-900/50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-200">&ldquo;{v.text}&rdquo;</p>
                      <p className="text-[11px] text-slate-500">{v.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={CLASS_TONE[v.classification] ?? "neutral"}>{pretty(v.classification)}</Pill>
                      <Pill tone={v.publishable ? "good" : "bad"}>{v.publishable ? "publishable" : "blocked"}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suites grid — each honestly badged live vs P1 */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SUITES.map((s) => (
          <div key={s.title} className="card p-4 transition hover:border-emerald-500/40">
            <div className="mb-2.5 flex items-center justify-between">
              <s.icon className="h-5 w-5 text-emerald-400" />
              <StatusChip status={s.status} />
            </div>
            <h3 className="font-display text-sm font-bold text-white">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.desc}</p>
            <p className={`mt-2 text-[11px] font-medium ${s.status === "live" ? "text-emerald-300/80" : "text-amber-300/80"}`}>{s.note}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the strategy agent</h2>
        <StatusChip status="live" />
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
