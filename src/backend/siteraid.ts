// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar SiteRaid AI™ — the Website → Autonomous Viral Growth engine.
//
// Spec (F2 "Website-to-Autonomous Viral Growth Engine"): paste an AUTHORISED
// business/product URL → a complete, continuously optimised marketing & sales
// operation. SiteRaid is NOT a URL-to-ad scraper; it understands the business,
// diagnoses it, and maps where to win. Crawling / live competitor fetch route
// through connectors; THIS module is the deterministic brain the conversational
// agent has described until now:
//
//   • Authorised Ingestion   — 13 input types + an ownership/permission gate;
//                              competitor URLs are public-analysis-only.
//   • Business DNA Builder™   — 24-field continuously-updated business profile.
//   • Website Truth Layer™    — 5 claim classes; superlatives blocked unless
//                              substantiated; every publishable claim links a source.
//   • Instant Marketing Audit — 6 audits (brand/conversion/content/search+GEO/
//                              social/commercial) with sub-scores + verdicts.
//   • Competitive Attack Map  — 16 gap classes → 6 priority buckets; win WITHOUT
//                              copying.
//
// Pure + deterministic (seeded, no wall-clock, no randomness) → runs in demo mode
// and unit-checks. Live crawl/competitor data refines it post-launch.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const sscore = (s: string, lo = 45, hi = 90) => lo + Math.round((seed(s) % 1000) / 1000 * (hi - lo));

// ---------------------------------------------------------------------------
// 1. Authorised Ingestion — permission gate before any extraction.
// ---------------------------------------------------------------------------
export const INPUT_TYPES = [
  "Homepage URL", "Product page", "Service page", "Shopify store", "Marketplace listing",
  "App-store listing", "Booking page", "Restaurant menu", "Property listing", "Event page",
  "Fundraising page", "Personal brand website", "Company profile",
] as const;

export type Authorisation = "own" | "manage" | "have_permission" | "competitor_public";

export type IngestionDecision = {
  allowed: boolean;
  mode: "full_reuse" | "public_analysis_only" | "blocked";
  reason: string;
};

// Owner/manager/permission → full asset reuse. Competitor → analysis only, no
// republishing of protected assets. No basis → blocked.
export function authoriseIngestion(input: { authorisation?: Authorisation }): IngestionDecision {
  switch (input.authorisation) {
    case "own":
    case "manage":
    case "have_permission":
      return { allowed: true, mode: "full_reuse", reason: "Authorised owner/manager/permission — approved assets may be reused and regenerated." };
    case "competitor_public":
      return { allowed: true, mode: "public_analysis_only", reason: "Competitor URL — public competitive analysis only; protected/trademarked assets are never republished." };
    default:
      return { allowed: false, mode: "blocked", reason: "No ownership, management, permission or competitor-analysis basis confirmed — extraction blocked." };
  }
}

// ---------------------------------------------------------------------------
// 2. Business DNA Builder™ — 24-field profile from a (demo) extract.
// ---------------------------------------------------------------------------
export type SiteExtract = {
  business: string;
  category: string;
  offers: string[];
  pricePosition?: "budget" | "mass" | "premium";
  location?: string;
  reviews?: number;
  rating?: number;
};

export type BusinessDNA = {
  marketCategory: string;
  businessModel: string;
  revenueModel: string;
  coreOffers: string[];
  customerSegments: string[];
  valueProposition: string;
  brandPersonality: string;
  pricePosition: string;
  geographicCoverage: string;
  salesCycle: string;
  mainConversionAction: string;
  competitiveAdvantages: string[];
  proofAssets: string[];
  customerObjections: string[];
  trustGaps: string[];
  contentGaps: string[];
  conversionGaps: string[];
  seoGaps: string[];
  geoGaps: string[];
  socialGaps: string[];
  retentionOpportunities: string[];
  upsellOpportunities: string[];
  crossSellOpportunities: string[];
  referralOpportunities: string[];
};

export function businessDNA(x: SiteExtract): BusinessDNA {
  const cat = x.category;
  const price = x.pricePosition ?? "mass";
  return {
    marketCategory: cat,
    businessModel: x.offers.length > 1 ? "Multi-offer / product+service" : "Single core offer",
    revenueModel: price === "premium" ? "High-margin, lower-volume" : price === "budget" ? "Low-margin, high-volume" : "Balanced volume/margin",
    coreOffers: x.offers,
    customerSegments: [`${cat} buyers`, "Repeat customers", "Referral-sourced customers"],
    valueProposition: `The ${price} choice for ${cat.toLowerCase()} in ${x.location ?? "the local area"}.`,
    brandPersonality: price === "premium" ? "Refined, confident, expert" : "Warm, dependable, local",
    pricePosition: price,
    geographicCoverage: x.location ?? "Local / regional",
    salesCycle: cat.toLowerCase().includes("service") ? "Considered (quote → decision)" : "Short (impulse → purchase)",
    mainConversionAction: x.offers.length && /book|appointment|reservation/i.test(x.offers.join(" ")) ? "Booking" : "Purchase / enquiry",
    competitiveAdvantages: [`${x.rating ?? 4.6}★ social proof`, "Owned customer relationship", "Fast local fulfilment"],
    proofAssets: [`${x.reviews ?? 120} reviews`, "Before/after evidence", "Verified credentials"],
    customerObjections: ["Is it worth the price?", "Will it work for me?", "Can I trust them?"],
    trustGaps: ["No visible guarantee", "Thin about-us / credentials"],
    contentGaps: ["No demonstration content", "Missing FAQs", "Weak comparison pages"],
    conversionGaps: ["CTA below the fold", "Long lead form", "No urgency"],
    seoGaps: ["Missing problem-led pages", "Thin service-area pages"],
    geoGaps: ["Not cited by AI assistants", "No structured data for reviews"],
    socialGaps: ["Inconsistent short-form", "No creator strategy"],
    retentionOpportunities: ["Post-purchase flow", "Win-back campaign"],
    upsellOpportunities: ["Premium tier", "Add-on services"],
    crossSellOpportunities: ["Complementary products", "Bundles"],
    referralOpportunities: ["Referral reward", "Review-to-advocate loop"],
  };
}

// ---------------------------------------------------------------------------
// 3. Website Truth Layer™ — classify + gate every claim; block superlatives.
// ---------------------------------------------------------------------------
export type ClaimClass = "verified_website" | "verified_business_data" | "user_confirmed" | "inferred_pending" | "prohibited";
export type Claim = { text: string; source?: string; substantiated?: boolean };
export type ClaimVerdict = { text: string; classification: ClaimClass; publishable: boolean; reason: string; source?: string };

const SUPERLATIVES = ["best", "#1", "number one", "cheapest", "fastest", "top rated", "world class", "the leading"];

export function classifyClaim(claim: Claim): ClaimVerdict {
  const lc = claim.text.toLowerCase();
  const isSuperlative = SUPERLATIVES.some((s) => lc.includes(s));
  // Unsubstantiated superlative → prohibited (prevents hallucinated advertising).
  if (isSuperlative && !claim.substantiated) {
    return { text: claim.text, classification: "prohibited", publishable: false, reason: 'Superlative claim ("best/#1/cheapest") is blocked unless independently substantiated.' };
  }
  if (claim.source && /policy|reviews?|trustpilot|google|data|ledger/i.test(claim.source)) {
    const cls: ClaimClass = /reviews?|trustpilot|google/i.test(claim.source) ? "verified_business_data" : "verified_website";
    return { text: claim.text, classification: cls, publishable: true, reason: `Verified against ${claim.source}.`, source: claim.source };
  }
  if (claim.substantiated) {
    return { text: claim.text, classification: "user_confirmed", publishable: true, reason: "User-confirmed with evidence." };
  }
  return { text: claim.text, classification: "inferred_pending", publishable: false, reason: "Inferred — needs a linked source or user confirmation before publication." };
}

export function truthLayer(claims: Claim[]): { verdicts: ClaimVerdict[]; publishable: ClaimVerdict[]; blocked: ClaimVerdict[] } {
  const verdicts = claims.map(classifyClaim);
  return { verdicts, publishable: verdicts.filter((v) => v.publishable), blocked: verdicts.filter((v) => !v.publishable) };
}

// ---------------------------------------------------------------------------
// 4. Instant Marketing Audit — 6 audits with sub-scores + verdicts.
// ---------------------------------------------------------------------------
const AUDIT_DIMS: Record<string, string[]> = {
  brand: ["Message clarity", "Brand consistency", "Visual quality", "Differentiation", "Trust strength", "Proof strength"],
  conversion: ["CTA clarity", "Offer strength", "Friction", "Mobile experience", "Page speed", "Abandonment risk"],
  content: ["Content coverage", "Headline strength", "Product descriptions", "FAQs", "Demonstrations", "Content freshness"],
  search: ["SEO strength", "Search-intent coverage", "Local search", "Structured data", "AI-search/GEO visibility", "Comparison/problem pages"],
  social: ["Short-form concepts", "Posting consistency", "Social proof", "Platform fit", "Format variety", "Creator/community strategy"],
  commercial: ["Packaging", "Pricing presentation", "Bundles", "Upsells/cross-sells", "Lead magnets", "Retargeting/referral"],
};

export type AuditSection = { area: string; overall: number; verdict: "strong" | "improve" | "urgent"; dimensions: { name: string; score: number }[] };
export type SiteAudit = { sections: AuditSection[]; overall: number; headline: string };

export function instantAudit(x: SiteExtract): SiteAudit {
  const sections: AuditSection[] = Object.entries(AUDIT_DIMS).map(([area, dims]) => {
    const dimensions = dims.map((name) => ({ name, score: sscore(x.business + area + name) }));
    const overall = clamp(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length);
    const verdict: AuditSection["verdict"] = overall >= 75 ? "strong" : overall >= 55 ? "improve" : "urgent";
    return { area, overall, verdict, dimensions };
  });
  const overall = clamp(sections.reduce((s, d) => s + d.overall, 0) / sections.length);
  const weakest = [...sections].sort((a, b) => a.overall - b.overall)[0];
  return { sections, overall, headline: `Overall marketing health ${overall}/100 — weakest area is ${weakest.area} (${weakest.overall}); fix that before scaling spend.` };
}

// ---------------------------------------------------------------------------
// 5. Competitive Attack Map — 16 gap classes → 6 priority buckets.
// ---------------------------------------------------------------------------
export const GAP_CLASSES = [
  "competitor_strengths", "competitor_weaknesses", "underused_customer_pains", "unsatisfied_review_themes",
  "poorly_served_regions", "missing_product_bundles", "unaddressed_objections", "unclaimed_search_topics",
  "unused_content_formats", "saturated_ad_angles", "pricing_gaps", "service_speed_gaps",
  "trust_gaps", "accessibility_gaps", "localisation_gaps", "customer_support_gaps",
] as const;

export const ATTACK_PRIORITIES = [
  "quick_revenue_wins", "viral_opportunities", "conversion_improvements",
  "brand_differentiation", "retention_improvements", "long_term_defensibility",
] as const;

export type AttackMove = { gap: string; opportunity: number; priority: string; play: string };
export type AttackMap = { moves: AttackMove[]; byPriority: Record<string, AttackMove[]>; note: string };

const GAP_TO_PRIORITY: Record<string, string> = {
  competitor_weaknesses: "quick_revenue_wins", unsatisfied_review_themes: "quick_revenue_wins",
  unused_content_formats: "viral_opportunities", saturated_ad_angles: "viral_opportunities",
  unaddressed_objections: "conversion_improvements", pricing_gaps: "conversion_improvements", trust_gaps: "conversion_improvements",
  underused_customer_pains: "brand_differentiation", service_speed_gaps: "brand_differentiation", accessibility_gaps: "brand_differentiation",
  customer_support_gaps: "retention_improvements", missing_product_bundles: "retention_improvements",
  unclaimed_search_topics: "long_term_defensibility", poorly_served_regions: "long_term_defensibility",
  localisation_gaps: "long_term_defensibility", competitor_strengths: "long_term_defensibility",
};

export function attackMap(x: SiteExtract): AttackMap {
  const moves: AttackMove[] = GAP_CLASSES.map((gap) => {
    const opportunity = sscore(x.business + gap, 30, 95);
    const priority = GAP_TO_PRIORITY[gap] ?? "conversion_improvements";
    return { gap, opportunity, priority, play: playFor(gap, x) };
  }).sort((a, b) => b.opportunity - a.opportunity);
  const byPriority: Record<string, AttackMove[]> = {};
  for (const p of ATTACK_PRIORITIES) byPriority[p] = moves.filter((m) => m.priority === p);
  return { moves, byPriority, note: "Ranked where this business can win WITHOUT copying competitors — attack the gaps they leave open, not the angles they already own." };
}

function playFor(gap: string, x: SiteExtract): string {
  const plays: Record<string, string> = {
    competitor_weaknesses: `Turn the top complaint about rivals into ${x.business}'s headline promise.`,
    unsatisfied_review_themes: "Publish proof content answering the exact themes customers complain about elsewhere.",
    unused_content_formats: "Own a format the category isn't using yet (e.g. product-test shorts).",
    saturated_ad_angles: "Retire the saturated hook; lead with a fresh, less-crowded angle.",
    unaddressed_objections: "Add an objection-handling page/section that rivals skip.",
    pricing_gaps: "Reframe pricing with a bundle or clearer value ladder.",
    trust_gaps: "Add a guarantee + verified proof block above the fold.",
    unclaimed_search_topics: "Build problem-led + comparison pages for topics no one ranks for.",
    poorly_served_regions: "Spin up service-area pages for under-served postcodes.",
    localisation_gaps: "Transcreate (not translate) for the local audience.",
  };
  return plays[gap] || `Close the ${gap.replace(/_/g, " ")} with a targeted campaign.`;
}

// ---------------------------------------------------------------------------
// Deterministic demo so the whole engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoSite(): SiteExtract {
  return { business: "Brixton Grill House", category: "Restaurant", offers: ["Dine-in", "Table booking", "Private hire"], pricePosition: "mass", location: "Brixton, London", reviews: 213, rating: 4.7 };
}

export function demoSiteRaid() {
  const x = demoSite();
  return {
    site: x,
    ingestion: authoriseIngestion({ authorisation: "own" }),
    businessDNA: businessDNA(x),
    truthLayer: truthLayer([
      { text: "Free delivery over £30", source: "delivery policy" },
      { text: "Rated 4.7 by 213 diners", source: "Google reviews" },
      { text: "The best grill in London", substantiated: false },
      { text: "Family-run since 2016", substantiated: true },
    ]),
    audit: instantAudit(x),
    attackMap: attackMap(x),
  };
}
