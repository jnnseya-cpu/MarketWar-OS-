// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MARKETWAR DYNAMIC SEARCH DOMINANCE ENGINE — command layer.
// Source: docs/reference/dynamic-search-dominance-engine.md.
//
// This UPGRADES (does not replace) the Organic Dominance OS (organic-dominance.ts):
// it adds the engine's command concepts — the honest positioning, the five
// operating modes, the 13-stage operating loop, the Search Money-Map categories,
// the transparent Opportunity Score, and the AI-Recommendation-Readiness score.
//
// OWNER HONESTY LAW (overrides ranking promises): no guaranteed first-page/#1
// rankings. Search engines don't guarantee crawling, indexing or serving, and
// manipulative tactics cause harm. The engine promises CONTINUOUS competitive
// optimisation, MAXIMUM ELIGIBLE visibility and MEASURABLE organic revenue
// growth — never an impossible ranking guarantee. Every score here is a
// transparent, labelled heuristic computed from inputs, never a promise.

export const HONEST_PROMISE =
  "Continuous competitive optimisation, maximum eligible visibility, and measurable organic revenue growth. No one can guarantee a permanent #1 or first-page ranking — search engines don't guarantee crawling, indexing or serving — so we don't. We make your business the strongest, clearest, most useful answer wherever customers search, and measure the revenue it produces.";

export const POSITIONING = {
  what: "The autonomous organic customer-acquisition engine — discovers demand, builds authority, improves the website, creates winning content, earns trusted citations, and converts search visibility into revenue.",
  promise: "Be found first. Be trusted faster. Be recommended more. Convert the demand.",
  edge: "Competitors chase keywords. MarketWar captures entire customer decisions.",
};

// §3 — Operating modes for the Dynamic SEO Commander Agent.
export type OperatingMode = "observe" | "recommend" | "assisted" | "autonomous" | "emergency";
export const OPERATING_MODES: { key: OperatingMode; label: string; desc: string; risk: "none" | "low" | "medium" }[] = [
  { key: "observe", label: "Observe", desc: "Analyses and reports. Makes no changes.", risk: "none" },
  { key: "recommend", label: "Recommend", desc: "Proposes changes for your approval.", risk: "none" },
  { key: "assisted", label: "Assisted", desc: "Drafts the changes; you approve publication.", risk: "low" },
  { key: "autonomous", label: "Autonomous", desc: "Implements pre-approved, low-risk improvements within defined controls.", risk: "medium" },
  { key: "emergency", label: "Emergency Recovery", desc: "Pauses harmful deployments, restores metadata, repairs indexation, rolls back damage.", risk: "low" },
];

// §4 — The permanent operating loop (never a one-off project).
export const OPERATING_LOOP: string[] = [
  "Discover demand",
  "Analyse search intent",
  "Inspect competitors",
  "Audit website eligibility",
  "Prioritise revenue opportunities",
  "Create or improve the best answer",
  "Strengthen internal authority",
  "Earn external authority",
  "Submit and validate",
  "Distribute across search & social",
  "Measure rankings, citations & revenue",
  "Learn, refresh & defend",
];

// §5 — Search Money-Map categories.
export type MoneyMapCategory = "immediate_win" | "ranking_opportunity" | "content_gap" | "authority_gap" | "competitor_displacement" | "ai_recommendation";
export const MONEY_MAP: { key: MoneyMapCategory; label: string; desc: string }[] = [
  { key: "immediate_win", label: "Immediate Wins", desc: "Existing visibility you can convert to revenue quickly." },
  { key: "ranking_opportunity", label: "Ranking Opportunities", desc: "Pages that can move with focused improvement." },
  { key: "content_gap", label: "Content Gaps", desc: "Profitable topics not yet covered." },
  { key: "authority_gap", label: "Authority Gaps", desc: "Where stronger evidence and references are needed." },
  { key: "competitor_displacement", label: "Competitor Displacement", desc: "Queries where competitors are weak, outdated or misaligned." },
  { key: "ai_recommendation", label: "AI Recommendation", desc: "Questions where the brand could become a cited, recommended source." },
];

// §10–§23 — the engine's modules, each mapped to a REAL destination or an honest
// status. `live` = wired to a working OS engine; `foundation` = defined/surfaced
// here now; `connect` = needs an authorised data source (never fabricated);
// `blueprint` = designed, implemented behind Approvals + source gates.
export type ModuleStatus = "live" | "foundation" | "connect" | "blueprint";
export type EngineModule = { n: number; key: string; label: string; scope: string; status: ModuleStatus; route?: string };

export const ENGINE_MODULES: EngineModule[] = [
  { n: 10, key: "technical", label: "Technical SEO Engineer", scope: "Crawl/render/index eligibility: status codes, canonicals, redirects, duplicates, sitemaps, Core Web Vitals.", status: "connect", route: "/dashboard/website-intel" },
  { n: 11, key: "sitemap", label: "Sitemap & Indexing (IndexNow)", scope: "Dynamic canonical-only sitemaps + IndexNow notify on change. Signals, not guarantees.", status: "blueprint" },
  { n: 12, key: "schema", label: "Structured Data Intelligence", scope: "Recommend/generate/validate JSON-LD (Product, LocalBusiness, Review…). Never fake ratings/prices.", status: "blueprint" },
  { n: 16, key: "internal", label: "Internal Authority Engine", scope: "Orphans, hubs, contextual links, anchors, crawl depth — link flow to commercial pages.", status: "blueprint" },
  { n: 17, key: "backlinks", label: "Ethical Authority & Backlinks", scope: "Strongest RELEVANT authority via PR, research, citations. No paid networks/spam/negative SEO.", status: "connect" },
  { n: 18, key: "ai", label: "AI Search & Recommendation", scope: "Eligibility for AI Overviews/Copilot/Perplexity + readiness score. Live answer monitoring needs a source.", status: "connect" },
  { n: 19, key: "entity", label: "Brand Entity & Knowledge", scope: "One brand truth layer (name, locations, products, prices, policies, awards); flag conflicts across profiles.", status: "foundation", route: "/dashboard/studio" },
  { n: 20, key: "local", label: "Local Search Domination", scope: "Location pages, local schema, profile accuracy, reviews, citations, map + call conversions.", status: "live", route: "/dashboard/local" },
  { n: 21, key: "ecommerce", label: "Ecommerce Search Growth", scope: "Feeds, titles, schema, availability, price consistency → views, add-to-cart, checkout, revenue, margin.", status: "connect" },
  { n: 22, key: "visual", label: "Image & Visual Search", scope: "Original product/lifestyle images, alt text, captions, Google Lens readiness — accurate, never misleading.", status: "live", route: "/dashboard/product-engine" },
  { n: 23, key: "video", label: "Video & YouTube Search", scope: "Topics → videos/Shorts + titles, chapters, captions, schema, thumbnails, CTA tracking, clip repurposing.", status: "live", route: "/dashboard/video" },
];

// §19 — the Brand Entity record fields (the consistent brand-truth layer).
export const ENTITY_RECORD_FIELDS = [
  "legalName", "tradingName", "description", "founders", "locations", "contact",
  "products", "services", "categories", "prices", "serviceAreas", "socialAccounts",
  "policies", "awards", "certifications", "trustedReferences",
] as const;

// §19 — external surfaces where brand info must stay consistent (needs sources).
export const CONSISTENCY_SOURCES = [
  "Website", "Local profiles", "Social platforms", "Directories", "Review sites",
  "Merchant feeds", "Knowledge panels", "Partner sites", "Press coverage",
] as const;

// §7 — Intent classification from commercial signals (deterministic, transparent).
const SIGNALS: { intent: string; words: string[]; commercial: boolean }[] = [
  { intent: "transactional", words: ["buy", "book", "order", "quote", "demo", "trial", "price", "cost", "cheap", "deal", "discount", "delivery", "installation", "available today", "for sale"], commercial: true },
  { intent: "commercial", words: ["best", "top", "review", "reviews", "vs", "compare", "comparison", "alternative", "supplier", "which", "rated"], commercial: true },
  { intent: "local", words: ["near me", "nearby", "in ", "local", "open now", "directions"], commercial: true },
  { intent: "problem_aware", words: ["how to", "why", "fix", "problem", "not working", "help", "guide", "tutorial"], commercial: false },
  { intent: "navigational", words: ["login", "sign in", "official", "contact", "phone", "hours", "website"], commercial: false },
  { intent: "informational", words: ["what is", "meaning", "definition", "explained", "examples"], commercial: false },
];

export function classifyIntent(query: string): { intent: string; commercial: boolean; funnel: "top" | "middle" | "bottom"; signals: string[] } {
  const q = ` ${query.toLowerCase().trim()} `;
  const hits: { intent: string; commercial: boolean; word: string }[] = [];
  for (const s of SIGNALS) for (const w of s.words) if (q.includes(` ${w}`) || q.includes(`${w} `) || q.includes(w)) hits.push({ intent: s.intent, commercial: s.commercial, word: w });
  if (hits.length === 0) return { intent: "informational", commercial: false, funnel: "top", signals: [] };
  // Prefer the most commercial, most specific signal.
  const order = ["transactional", "local", "commercial", "navigational", "problem_aware", "informational"];
  hits.sort((a, b) => order.indexOf(a.intent) - order.indexOf(b.intent));
  const top = hits[0];
  const funnel = top.intent === "transactional" || top.intent === "local" ? "bottom" : top.intent === "commercial" ? "middle" : "top";
  return { intent: top.intent, commercial: top.commercial, funnel, signals: [...new Set(hits.map((h) => h.word))].slice(0, 8) };
}

// §6 — Opportunity Score. The spec's formula is Demand × Intent × Conversion ×
// LTV × Feasibility × Authority × Strategic ÷ Competition ÷ Cost ÷ Time. We
// express it as a BOUNDED, transparent 0–100 heuristic: the mean of the positive
// drivers, discounted by the mean of the negative drivers. It is a PRIORITY
// signal, never a ranking promise. Inputs are 0–100 (missing → neutral 50).
export type OpportunityInputs = {
  demand?: number; purchaseIntent?: number; conversionProbability?: number; lifetimeValue?: number;
  rankingFeasibility?: number; authorityPotential?: number; strategicImportance?: number; // positives
  competition?: number; cost?: number; timeToImpact?: number; // negatives (higher = worse)
};

const clamp01to100 = (n: unknown) => Math.max(0, Math.min(100, typeof n === "number" && Number.isFinite(n) ? n : 50));

export function opportunityScore(inp: OpportunityInputs): { score: number; confidence: number; drivers: { label: string; value: number; kind: "positive" | "negative" }[] } {
  const positives = {
    "Search demand": clamp01to100(inp.demand),
    "Purchase intent": clamp01to100(inp.purchaseIntent),
    "Conversion probability": clamp01to100(inp.conversionProbability),
    "Lifetime value": clamp01to100(inp.lifetimeValue),
    "Ranking feasibility": clamp01to100(inp.rankingFeasibility),
    "Authority potential": clamp01to100(inp.authorityPotential),
    "Strategic importance": clamp01to100(inp.strategicImportance),
  };
  const negatives = {
    "Competition": clamp01to100(inp.competition),
    "Cost": clamp01to100(inp.cost),
    "Time to impact": clamp01to100(inp.timeToImpact),
  };
  const posMean = Object.values(positives).reduce((a, b) => a + b, 0) / Object.values(positives).length;
  const negMean = Object.values(negatives).reduce((a, b) => a + b, 0) / Object.values(negatives).length;
  const score = Math.round((posMean / 100) * (1 - 0.5 * (negMean / 100)) * 100);
  // Confidence = how many inputs were actually supplied (data completeness).
  const supplied = Object.values(inp).filter((v) => typeof v === "number" && Number.isFinite(v)).length;
  const confidence = Math.round((supplied / 10) * 100);
  const drivers = [
    ...Object.entries(positives).map(([label, value]) => ({ label, value, kind: "positive" as const })),
    ...Object.entries(negatives).map(([label, value]) => ({ label, value, kind: "negative" as const })),
  ];
  return { score: Math.max(0, Math.min(100, score)), confidence, drivers };
}

// §18 — AI Recommendation Readiness. Transparent mean of the readiness components
// (0–100 each; missing → 0 so gaps show honestly). Measures eligibility to be a
// cited/recommended source in AI answers — not a guarantee of being recommended.
export const AI_READINESS_COMPONENTS = [
  "entityClarity", "topicalAuthority", "citationAvailability", "productDataQuality",
  "brandConsistency", "externalCorroboration", "reviewCredibility", "answerCompleteness",
  "freshness", "trust", "geographicRelevance",
] as const;
export type AiReadinessInput = Partial<Record<(typeof AI_READINESS_COMPONENTS)[number], number>>;

export function aiReadinessScore(inp: AiReadinessInput): { score: number; weakest: { key: string; value: number }[] } {
  const vals = AI_READINESS_COMPONENTS.map((k) => ({ key: k, value: clamp01to100(inp[k] ?? 0) }));
  const score = Math.round(vals.reduce((a, b) => a + b.value, 0) / vals.length);
  const weakest = [...vals].sort((a, b) => a.value - b.value).slice(0, 3);
  return { score, weakest };
}
