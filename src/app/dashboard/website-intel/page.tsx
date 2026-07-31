"use client";

// M-33 AI Website Marketing Intelligence Engine (Agent 22) — URL in, unified
// marketing strategy out. Spec: docs/ai-os/10-viral-product-and-website-
// engines.md Part B. Conversational core live via the gateway; the deep-crawl
// service (Cloud Run, robots-respecting) activates once connected.
//
// Honesty rule (owner directive): every capability on this page is badged LIVE
// (produces real, computed output today — demo-deterministic, live with keys) or
// P1 (scaffolded, activates with the crawl / render / publish pipeline). The
// Instant Marketing Audit below is wired to the REAL SiteRaid engine
// (/api/siteraid): authorisation gate, 6-part audit with sub-scores, Business
// DNA, Competitive Attack Map and the Website Truth Layer — all computed live.

import { useEffect, useState } from "react";
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
import SeoDeployPanel from "@/components/SeoDeployPanel";
import { PageHeader, Pill, ScoreBar, StatCard, HowToUse } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { industryPlaceholders } from "@/shared/industry";
import { authedFetch } from "@/frontend/api-client";

type Status = "live" | "p1";

// Small honest status chip (local per the page pattern; not shared across pages).
function StatusChip({ status }: { status: Status }) {
  return status === "live" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Live now
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      <Clock className="h-3 w-3" /> Activate with a connector
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
  { title: "Authorised & monitored", status: "live", desc: "Ownership or permission is confirmed before extraction (live gate below); competitor URLs get public analysis only. Continuous rescans that auto-detect site changes activate with the crawler soon — nothing auto-publishes without approved autopilot rules." },
];

// Each suite: what it produces TODAY. Key-gated suites carry a `cap` + `liveNote`
// and flip to Live when the provider key is present (health-driven).
type Cap = "image" | "video";
const CAP_LABELS: Record<Cap, string> = { image: "Photoreal image backgrounds", video: "Video render (Veo/Sora)" };
type Suite = { icon: typeof Blocks; title: string; desc: string; status: Status; note: string; cap?: Cap; liveNote?: string };
const SUITES: Suite[] = [
  { icon: Blocks, title: "AI Campaign Factory", status: "live", note: "Plans, calendars & sequences generated live by the strategy agent below.", desc: "Social calendars, 30-day content plans, 90-day growth strategies, seasonal campaigns, launches, promotional calendars, email/SMS/WhatsApp/push sequences, nurture funnels." },
  { icon: Palette, title: "AI Creative Generator", status: "p1", cap: "image", note: "On-brand SVG creatives render today in Brand Studio; photoreal graphics/video need an image/video-model key.", liveNote: "On-brand creatives + photoreal graphics (gpt-image-1) and video (Veo/Sora) render live — build them in Brand Studio / Video War Room.", desc: "On-brand social graphics, video ads, display banners, blog graphics, infographics, mockups, hero and website banners, story templates, presentation decks." },
  { icon: Filter, title: "AI Funnel Builder", status: "live", note: "Copy, structure, the hosted page and the checkout are live — pages publish to /b/<brand>/<slug>, and the Product / CTA link in Landing Builder takes your own payment link (Stripe, PayPal, SumUp, Square, Shopify). It is validated: http is refused, and the processor is named under the button. The buyer pays you directly — the money never passes through MarketWar, so there is no cut and no per-sale fee.", desc: "Landing pages, lead magnets, sales/webinar/appointment/course/e-commerce funnels, abandoned-cart flows, checkout optimisation, upsell journeys." },
  { icon: Radar, title: "AI Competitor Intelligence", status: "live", note: "Powered by the Competitive Attack Map engine — run it live below.", desc: "Benchmarks products, pricing, SEO, keywords, advertising, social presence, messaging and sentiment — highlights market gaps and differentiation plays." },
  { icon: Sprout, title: "AI Growth Opportunities", status: "live", note: "Ranked opportunities (revenue impact × effort) come from the live attack map + strategy agent.", desc: "New products, subscriptions, memberships, bundles, geographic expansion, partnerships, affiliate/influencer/marketplace plays — each with revenue impact, effort and ROI." },
  { icon: Gauge, title: "AI Brand Consistency Engine", status: "p1", cap: "image", note: "Enforced at generation time — activates with the creative render pipeline.", liveNote: "Your logo + brand colours (Brand Studio) lock onto every creative at generation time — live.", desc: "Every generated asset locks to the site's logo, colours, typography, tone of voice, messaging and visual style — enforced at generation time." },
  { icon: Globe, title: "Site-to-Story Engine™", status: "live", note: "Founder / customer / origin stories generated live by the strategy agent from verified facts.", desc: "Turns website facts into founder journeys, customer transformations, origin and mission stories — every story traceable to verified business information." },
  { icon: Radar, title: "Trend Hijack with Brand Relevance™", status: "p1", note: "The 8-factor relevance gate runs live; continuous trend monitoring activates once a trends data feed is connected.", desc: "Monitors trends the business can credibly join, scored through an 8-factor relevance gate — rejects anything that damages the brand, exploits tragedy or misleads." },
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
  // Industry-neutral defaults: derive from the ACTIVE brand / its industry, never
  // a hardcoded "Restaurant / Dine-in" vertical.
  const ph = industryPlaceholders(activeBrand);
  const [website, setWebsite] = useState(activeBrand?.website || "");
  const [business, setBusiness] = useState(activeBrand?.name || "");
  const [category, setCategory] = useState(activeBrand?.industry || ph.industry);
  const [offers, setOffers] = useState(activeBrand?.offer || ph.offer);
  const [location, setLocation] = useState(activeBrand?.location || "");
  const [price, setPrice] = useState<"budget" | "mass" | "premium">("mass");
  const [authorisation, setAuthorisation] = useState("own");

  const [report, setReport] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live crawl — a REAL measured audit of the actual page (no third party).
  type Finding = { area: string; label: string; severity: "pass" | "warn" | "fail"; detail: string; measured?: boolean };
  type Crawl = { coveragePct?: number; unreadable?: string[]; scoreNote?: string; ok: boolean; url: string; finalUrl?: string; httpStatus?: number; https: boolean; loadMs?: number; score: number; grade: string; title?: string; metaDescription?: string; h1Count?: number; wordCount?: number; imagesTotal?: number; imagesNoAlt?: number; internalLinks?: number; externalLinks?: number; robotsTxt?: boolean; sitemapXml?: boolean; structuredDataTypes?: string[]; findings: Finding[]; renderGap?: { jsShell?: boolean; framework?: string; words?: number; scriptShare?: number; note?: string }; block?: { kind: string; vendor?: string; message: string; action: string }; error?: string };
  const [crawl, setCrawl] = useState<Crawl | null>(null);
  const [crawling, setCrawling] = useState(false);

  // Deep crawl — several pages, robots-obeying, with extraction.
  type Deep = {
    note: string;
    partial: boolean;
    robots: { present: boolean; disallowed: string[]; crawlDelayMs: number };
    pages: { url: string; ok: boolean; skipped?: string }[];
    extraction: null | {
      products: { values: string[] }; services: { values: string[] };
      pricing: { value: string; declared: boolean }[];
      images: { url: string; label: string }[]; logos: string[]; colours: string[]; fonts: string[];
      ctas: string[]; trustSignals: string[]; offers: string[];
      faqs: { q: string }[]; socialLinks: { url: string; label: string }[];
      reviews: { rating?: string; count?: string; source: string }[];
      contact: { emails: string[]; phones: string[]; address: string };
      notExtracted: { field: string; reason: string }[];
      found: number;
    };
    error?: string;
  };
  const [deep, setDeep] = useState<Deep | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  // Reviews and rating are MEASURED or absent — never invented.
  //
  // These were hardcoded: useState(213) and useState(4.7). They were passed to
  // the Truth Layer with the source label "Google reviews", and it cleared
  // "Rated 4.7 by 213 reviewers" as VERIFIED BUSINESS DATA — PUBLISHABLE. The
  // one component whose whole job is blocking unverified claims was certifying
  // a number nobody had measured, on a screen telling the customer they may put
  // it in an advert. Now they come from the AggregateRating in the site's own
  // structured data, read by the deep crawl, or they do not exist.
  const measured = deep?.extraction?.reviews?.[0];
  const rating = measured?.rating ? Number(measured.rating) : null;
  const reviews = measured?.count ? Number(measured.count) : null;

  async function runDeep() {
    if (!website.trim()) return;
    setDeepBusy(true); setDeep(null);
    try {
      const r = await authedFetch("/api/siteraid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deep", url: website }) });
      const d = await r.json();
      setDeep(r.ok ? d : { note: d.error || "The deep crawl failed.", partial: false, robots: { present: false, disallowed: [], crawlDelayMs: 0 }, pages: [], extraction: null });
    } catch { setDeep({ note: "Couldn't reach the crawler.", partial: false, robots: { present: false, disallowed: [], crawlDelayMs: 0 }, pages: [], extraction: null }); }
    finally { setDeepBusy(false); }
  }
  async function runCrawl() {
    if (!website.trim()) return;
    setCrawling(true); setCrawl(null);
    try {
      const r = await authedFetch("/api/siteraid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "crawl", url: website }) });
      setCrawl(await r.json());
    } catch { setCrawl({ ok: false, url: website, https: false, score: 0, grade: "F", findings: [], error: "Crawl request failed." }); }
    finally { setCrawling(false); }
  }

  // Live capability probe — flips creative/consistency suites to Live when the
  // image/video keys are present (health-driven, no hardcoded "P1").
  const [caps, setCaps] = useState<Record<Cap, boolean>>({ image: false, video: false });
  useEffect(() => {
    let on = true;
    fetch("/api/health/live").then((r) => r.json()).then((d) => {
      if (!on || !Array.isArray(d?.capabilities)) return;
      const ready = (label: string) => Boolean(d.capabilities.find((c: { capability: string; ready: boolean }) => c.capability === label)?.ready);
      setCaps({ image: ready(CAP_LABELS.image), video: ready(CAP_LABELS.video) });
    }).catch(() => {});
    return () => { on = false; };
  }, []);
  const effStatus = (s: Suite): Status => (s.cap ? (caps[s.cap] ? "live" : "p1") : s.status);
  const effNote = (s: Suite): string => (s.cap && caps[s.cap] && s.liveNote ? s.liveNote : s.note);

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
        // Zero, not a flattering placeholder: an audit that assumes 213 reviews
        // scores social proof for a business that may have none.
        reviews: reviews ?? 0,
        rating: rating ?? 0,
      };
      // Every claim carries where it ACTUALLY came from. An offer you typed into
      // this form is something you told us, not something verified against a
      // delivery policy we have never seen — mislabelling its source is how an
      // unchecked sentence ends up marked publishable.
      const claims = [
        ...site.offers.map((o) => ({ text: o, source: "supplied by you in this form" })),
        // Included only when the site's own structured data actually says so.
        ...(rating && reviews
          ? [{ text: `Rated ${rating} by ${reviews} reviewers`, source: `AggregateRating in the structured data on ${website}` }]
          : []),
        { text: `The best ${category.toLowerCase()} in ${location.split(",")[0]}`, substantiated: false },
      ];
      const post = (body: Record<string, unknown>) =>
        authedFetch("/api/siteraid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
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
        actions={<Pill tone="good">website intelligence · live crawler</Pill>}
      />

      {/* Live crawl — a REAL measured audit of the actual page (no connector). */}
      <div className="mb-6 card border-sky-500/25 p-5">
        <div className="mb-1 flex items-center gap-2"><Radar className="h-4 w-4 text-sky-400" /><h2 className="font-display font-bold text-white">Live site crawl</h2><Pill tone="good">real · measured</Pill></div>
        <p className="mb-3 text-xs text-slate-400">Enter a URL — we fetch the actual page and measure real SEO, technical, mobile, social and structured-data signals, plus robots.txt and sitemap. No third party, no key.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input min-w-[240px] flex-1" placeholder="yourwebsite.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <button className="btn-primary" onClick={runCrawl} disabled={crawling || !website.trim()}>{crawling ? <><Loader2 className="h-4 w-4 animate-spin" /> Crawling…</> : <><Radar className="h-4 w-4" /> Crawl site</>}</button>
        </div>

        {/* A block is a door with a lock on it, not a broken site — so it names
            the product doing the blocking and what the owner can do about it. */}
        {crawl && !crawl.ok && (
          <div className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {crawl.block ? (
              <>
                <p className="font-semibold">{crawl.block.message}</p>
                {crawl.block.action && <p className="mt-1 text-xs text-rose-200/80">{crawl.block.action}</p>}
              </>
            ) : crawl.error}
          </div>
        )}
        {crawl && crawl.ok && (
          <div className="mt-4">
            {/* The render gap: the most valuable finding on the page, because it
                is exactly what the AI answer engines cannot see either. */}
            {crawl.renderGap?.jsShell && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-200">
                  Rendered by JavaScript{crawl.renderGap.framework ? ` · ${crawl.renderGap.framework}` : ""}
                </p>
                <p className="text-[11px] leading-relaxed text-amber-100/85">{crawl.renderGap.note}</p>
                <p className="mt-1.5 text-[11px] text-amber-100/60">
                  The content checks below are marked <em>not readable</em> rather than failed, and are left out of the score — an absence in this HTML is not proof of an absence on your page.
                </p>
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-4">
              {/* A grade never travels without the share of the audit it came
                  from — 89/B computed from a page we mostly could not read
                  would tell a customer their site is fine when what we
                  established is that we could not see it. */}
              <div className="shrink-0">
                <div className={`flex h-16 w-16 flex-col items-center justify-center rounded-full text-white ${(crawl.coveragePct ?? 100) < 100 ? "bg-slate-600" : crawl.score >= 75 ? "bg-emerald-500" : crawl.score >= 60 ? "bg-amber-500" : "bg-rose-500"}`}>
                  <span className="font-display text-xl font-bold leading-none">{crawl.grade}</span><span className="text-[10px]">{crawl.score}/100</span>
                </div>
                {(crawl.coveragePct ?? 100) < 100 && (
                  <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">{crawl.coveragePct}% read</p>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
                <span>Status <span className="font-semibold text-white">{crawl.httpStatus}</span></span>
                <span>HTTPS <span className={`font-semibold ${crawl.https ? "text-emerald-300" : "text-rose-300"}`}>{crawl.https ? "yes" : "no"}</span></span>
                <span>Load <span className="font-semibold text-white">{crawl.loadMs}ms</span></span>
                <span>Words <span className="font-semibold text-white">{crawl.wordCount}</span></span>
                <span>Images <span className="font-semibold text-white">{crawl.imagesTotal}</span>{crawl.imagesNoAlt ? <span className="text-amber-300"> ({crawl.imagesNoAlt} no alt)</span> : null}</span>
                <span>Links <span className="font-semibold text-white">{crawl.internalLinks}</span> int / <span className="font-semibold text-white">{crawl.externalLinks}</span> ext</span>
                <span>robots.txt <span className={crawl.robotsTxt ? "text-emerald-300" : "text-slate-500"}>{crawl.robotsTxt ? "✓" : "—"}</span></span>
                <span>sitemap <span className={crawl.sitemapXml ? "text-emerald-300" : "text-slate-500"}>{crawl.sitemapXml ? "✓" : "—"}</span></span>
              </div>
            </div>
            {crawl.scoreNote && <p className="mb-3 rounded-md bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-slate-400">{crawl.scoreNote}</p>}
            <div className="space-y-1.5">
              {crawl.findings.map((f, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-ink-900/40 px-3 py-2">
                  <span className={`mt-0.5 text-xs font-bold ${f.measured === false ? "text-slate-500" : f.severity === "pass" ? "text-emerald-400" : f.severity === "warn" ? "text-amber-400" : "text-rose-400"}`}>{f.measured === false ? "?" : f.severity === "pass" ? "✓" : f.severity === "warn" ? "!" : "✕"}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white">{f.label} <span className="text-[10px] uppercase tracking-wide text-slate-600">{f.area}</span>{f.measured === false && <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">not readable</span>}</p>
                    <p className="text-xs text-slate-400">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The crawl above finds the gaps; this closes them on the actual page.
          Sits directly underneath because the two are one job — a finding the
          customer has to go and fix by hand somewhere else is homework. */}
      <SeoDeployPanel brand={activeBrand} crawl={crawl && crawl.ok ? crawl : null} className="mb-6" />

      <HowToUse
        does="Turn your business into a full marketing audit + attack plan — works for any industry, no crawler needed."
        steps={[
          "1. Scroll to the Instant Marketing Audit and fill in your business, category and offers.",
          "2. Set your authorisation basis and press Run instant audit.",
          "3. Read your 6-part scores, Business DNA, the ranked Competitive Attack Map and Truth-Layer checks.",
        ]}
        connector="The Live site crawl above already fetches your real page and measures SEO/technical/mobile/social signals — no connector needed. The audit below adds the DNA + attack-map layer."
      />

      {/* Honesty legend — what computes real output today vs what needs the crawler */}
      <div className="mb-8 card border-white/[0.08] p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <span className="font-display font-bold text-white">What&apos;s real today:</span>
          <span className="flex items-center gap-1.5"><StatusChip status="live" /> computes real output now (deterministic in demo; full quality with keys)</span>
          <span className="flex items-center gap-1.5"><StatusChip status="p1" /> production-ready — activates once the deep-crawler / trends connector is set</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          The intelligence — authorisation gate, Business DNA, the 6-part marketing audit with sub-scores, the Competitive Attack
          Map and the Website Truth Layer — runs live in the <span className="text-emerald-300">Instant Marketing Audit</span> below.
          Auto-crawling a live URL and continuous change-monitoring <span className="text-amber-300">activate once a crawler connector is set</span>.
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

      {/* Deep crawl extracts — honestly badged: the crawler that auto-extracts these activates with a connector */}
      <div className="mb-8 card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-5 w-5 text-emerald-400" />
          <p className="font-display font-bold text-white">Works on any URL</p>
          <span className="text-xs text-slate-500">
            — business sites, Shopify/WooCommerce stores, Amazon listings, Etsy shops, SaaS, restaurants, portfolios,
            booking sites
          </span>
        </div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Deep crawl extracts</p>
          <StatusChip status="live" />
          <button className="btn-primary ml-auto !py-1 text-xs" onClick={runDeep} disabled={deepBusy || !website.trim()}>
            {deepBusy ? <><Loader2 className="h-3 w-3 animate-spin" /> Reading the site…</> : <><Radar className="h-3 w-3" /> Deep crawl this site</>}
          </button>
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          Reads several pages of your real site — sitemap first, then your own navigation — obeying robots.txt and any Crawl-delay it sets, and pulls the list below out of the HTML. No connector, no third party, no key.
        </p>

        {deep && (
          <div className="mb-3 rounded-lg border border-white/[0.08] p-3">
            <p className="text-[11px] leading-relaxed text-slate-300">{deep.note}</p>
            {deep.robots.disallowed.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-200/80">
                Not fetched, because your robots.txt disallows them: {deep.robots.disallowed.join(", ")}
              </p>
            )}
            {deep.extraction && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["Products", deep.extraction.products.values],
                  ["Services", deep.extraction.services.values],
                  ["CTAs", deep.extraction.ctas],
                  ["Colours", deep.extraction.colours],
                  ["Fonts", deep.extraction.fonts],
                  ["Trust signals", deep.extraction.trustSignals],
                  ["Offers", deep.extraction.offers],
                  ["FAQs", deep.extraction.faqs.map((f) => f.q)],
                  ["Social links", deep.extraction.socialLinks.map((l) => l.label || l.url)],
                  ["Contact", [...deep.extraction.contact.emails, ...deep.extraction.contact.phones, deep.extraction.contact.address].filter(Boolean)],
                  ["Logos", deep.extraction.logos],
                  ["Images", deep.extraction.images.map((i) => i.label || i.url)],
                ] as [string, string[]][]).filter(([, v]) => v.length > 0).map(([label, values]) => (
                  <div key={label} className="rounded-lg bg-ink-900/50 p-2.5">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label} <span className="text-slate-600">({values.length})</span></p>
                    <p className="text-[11px] leading-relaxed text-slate-300">{values.slice(0, 6).map((v) => String(v).slice(0, 60)).join(" · ")}{values.length > 6 ? ` … +${values.length - 6}` : ""}</p>
                  </div>
                ))}
              </div>
            )}
            {/* What we refused to guess, and why — never quietly omitted. */}
            {deep.extraction && deep.extraction.notExtracted.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">Not extracted</p>
                {deep.extraction.notExtracted.map((n) => (
                  <p key={n.field} className="text-[11px] leading-relaxed text-amber-100/80"><strong>{n.field}.</strong> {n.reason}</p>
                ))}
              </div>
            )}
            {deep.extraction && deep.extraction.pricing.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-400">
                <span className="font-semibold text-white">Pricing:</span>{" "}
                {deep.extraction.pricing.map((p) => `${p.value}${p.declared ? "" : " (seen in text, not declared in structured data)"}`).slice(0, 6).join(" · ")}
              </p>
            )}
          </div>
        )}

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
          Computed by the SiteRaid engine from the fields you fill in below.
        </p>
        {/* The sub-scores are a deterministic function of the text in this form,
            not a measurement of the website. Saying so here is the difference
            between a structured self-assessment and a fake instrument. */}
        <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          <strong>Read the numbers correctly.</strong> The sub-scores below are computed deterministically from what you type in this form — the same inputs always give the same scores. They are a structured way to compare areas against each other and to rank what to fix first; they are <strong>not measurements of your website</strong>. The measured numbers are in the <span className="text-sky-300">Live site crawl</span> and <span className="text-sky-300">Deep crawl</span> at the top of this page, and the Truth Layer below only certifies a claim when it has a real source.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Website URL</label>
            <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbusiness.com" />
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
        {SUITES.map((s) => { const st = effStatus(s); return (
          <div key={s.title} className="card p-4 transition hover:border-emerald-500/40">
            <div className="mb-2.5 flex items-center justify-between">
              <s.icon className="h-5 w-5 text-emerald-400" />
              <StatusChip status={st} />
            </div>
            <h3 className="font-display text-sm font-bold text-white">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.desc}</p>
            <p className={`mt-2 text-[11px] font-medium ${st === "live" ? "text-emerald-300/80" : "text-amber-300/80"}`}>{effNote(s)}</p>
          </div>
        ); })}
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
          { key: "website", label: "Website URL", defaultValue: activeBrand?.website || "yourbusiness.com" },
          { key: "business", label: "Business", defaultValue: activeBrand?.name || "Your business" },
          { key: "location", label: "Market", defaultValue: activeBrand?.location || "your market" },
          {
            key: "goal",
            label: "What should the strategy optimise for?",
            defaultValue: activeBrand?.goal || "More direct enquiries and sales from your own channels",
            textarea: true,
          },
        ]}
      />
    </div>
  );
}
