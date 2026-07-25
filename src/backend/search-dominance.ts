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
  { n: 24, key: "social", label: "Social Search Dominance", scope: "In-platform discovery for TikTok/Instagram/YouTube/LinkedIn/Reddit — captions, on-screen text, hooks, topic consistency. Reddit: help genuinely, disclose relationships, no spam.", status: "connect", route: "/dashboard/amplify" },
  { n: 25, key: "reputation", label: "Search Reputation Defence", scope: "Monitor reviews, brand searches, misinformation, impersonation, counterfeit listings; factual response + owned-channel correction + recovery tracking. Never fake reviews or suppress legitimate criticism.", status: "live", route: "/dashboard/reputation" },
  { n: 26, key: "conversion", label: "Search Conversion Optimisation", scope: "Per organic page: impressions→CTR→engagement→lead→purchase→revenue→margin. Improve above-the-fold, CTA, trust, pricing, proof, speed, forms, checkout.", status: "foundation", route: "/dashboard/landing-builder" },
  { n: 27, key: "attribution", label: "Search Revenue Attribution", scope: "Query→appearance→click→page→lead→sale→revenue→margin→LTV. Revenue by query/page/topic/location/engine/AI/social/content/backlink. Stop chasing valueless traffic.", status: "connect", route: "/dashboard/roi" },
  { n: 28, key: "rankloss", label: "Rank-Loss Response", scope: "On a visibility drop: detect→identify pages/queries→check technical→compare competitors→estimate revenue at risk→repair→validate→track recovery.", status: "connect" },
  { n: 29, key: "refresh", label: "Continuous Content Refresh", scope: "Freshness policy per page; triggers (decline, price/product/intent change, expired stats, seasonal) → update facts/evidence/FAQs/images/offers/links + recrawl.", status: "foundation", route: "/dashboard/content" },
  { n: 30, key: "experiment", label: "Search Experimentation", scope: "Controlled tests on titles/descriptions/CTAs/intros/structure/links/FAQs with version history, protected high-performers, rollback, and ranking-vs-conversion separation.", status: "blueprint" },
];

// §31 — the Search-Dominance AI Workforce: 53 named specialist agents in 9
// divisions. Defined as the roster; each maps to an engine module / capability
// above and is orchestrated within the operating modes + Approvals controls.
export type WorkforceAgent = { n: number; name: string; role: string };
export const SEARCH_WORKFORCE: { division: string; agents: WorkforceAgent[] }[] = [
  { division: "Executive", agents: [
    { n: 1, name: "Dynamic SEO Commander", role: "Owns the entire organic growth strategy." },
    { n: 2, name: "Organic Revenue Director", role: "Connects visibility to leads, revenue and margin." },
    { n: 3, name: "Search Strategy", role: "Defines market, topic and channel priorities." },
  ]},
  { division: "Demand", agents: [
    { n: 4, name: "Keyword Intelligence", role: "Builds and maintains the keyword universe." },
    { n: 5, name: "Search Intent", role: "Classifies commercial intent." },
    { n: 6, name: "AI Prompt Discovery", role: "Maps customer questions asked in AI systems." },
    { n: 7, name: "Social Search", role: "Maps discovery behaviour on social platforms." },
    { n: 8, name: "Trend Detection", role: "Finds emerging demand." },
    { n: 9, name: "Local Demand", role: "Finds geographic opportunities." },
  ]},
  { division: "Technical", agents: [
    { n: 10, name: "Crawlability", role: "Monitors crawler access." },
    { n: 11, name: "Indexation", role: "Tracks index eligibility and coverage." },
    { n: 12, name: "JavaScript Rendering", role: "Checks rendered content." },
    { n: 13, name: "Sitemap", role: "Maintains sitemaps." },
    { n: 14, name: "Canonicalisation", role: "Controls duplicates." },
    { n: 15, name: "Redirect", role: "Manages URL changes." },
    { n: 16, name: "Site Architecture", role: "Improves navigation and crawl depth." },
    { n: 17, name: "Performance", role: "Monitors speed and user experience." },
    { n: 18, name: "Structured Data", role: "Creates and validates markup." },
  ]},
  { division: "Content", agents: [
    { n: 19, name: "Topic Authority", role: "Builds topical coverage." },
    { n: 20, name: "Content Gap", role: "Finds missing opportunities." },
    { n: 21, name: "Content Superiority", role: "Improves depth, evidence and differentiation." },
    { n: 22, name: "Commercial Content", role: "Creates transactional pages." },
    { n: 23, name: "Comparison Content", role: "Creates accurate comparison assets." },
    { n: 24, name: "FAQ", role: "Captures customer questions." },
    { n: 25, name: "Content Refresh", role: "Maintains freshness." },
    { n: 26, name: "Expert Evidence", role: "Adds credible evidence and expert review." },
  ]},
  { division: "Authority", agents: [
    { n: 27, name: "Internal Link", role: "Builds internal authority." },
    { n: 28, name: "Digital PR", role: "Creates newsworthy opportunities." },
    { n: 29, name: "Backlink Opportunity", role: "Finds relevant editorial opportunities." },
    { n: 30, name: "Brand Mention", role: "Finds unlinked mentions." },
    { n: 31, name: "Local Citation", role: "Improves local consistency." },
    { n: 32, name: "Partnership Authority", role: "Creates partner-led authority opportunities." },
  ]},
  { division: "AI Discovery", agents: [
    { n: 33, name: "AI Visibility", role: "Measures mentions and citations." },
    { n: 34, name: "Entity Knowledge", role: "Maintains brand facts." },
    { n: 35, name: "Citation Readiness", role: "Improves source quality." },
    { n: 36, name: "Answer Formatting", role: "Creates clear, extractable answers." },
    { n: 37, name: "AI Recommendation Monitor", role: "Tracks recommendation share." },
  ]},
  { division: "Media", agents: [
    { n: 38, name: "Image Search", role: "Optimises images." },
    { n: 39, name: "Video Search", role: "Optimises video." },
    { n: 40, name: "YouTube Growth", role: "Builds YouTube discovery." },
    { n: 41, name: "Social Search", role: "Optimises platform-native search." },
    { n: 42, name: "Podcast Discovery", role: "Optimises audio content and transcripts." },
  ]},
  { division: "Commercial", agents: [
    { n: 43, name: "Search Conversion", role: "Improves landing-page conversion." },
    { n: 44, name: "Organic Attribution", role: "Connects visibility to revenue." },
    { n: 45, name: "Search Offer", role: "Builds search-specific offers." },
    { n: 46, name: "Revenue Forecast", role: "Forecasts organic revenue." },
    { n: 47, name: "Search Budget", role: "Allocates content and authority budgets." },
  ]},
  { division: "Defence", agents: [
    { n: 48, name: "Rank Loss", role: "Investigates ranking declines." },
    { n: 49, name: "Reputation Search", role: "Protects branded search." },
    { n: 50, name: "Spam Risk", role: "Prevents manipulative tactics." },
    { n: 51, name: "Content Quality", role: "Prevents low-value publication." },
    { n: 52, name: "Change Control", role: "Approves and rolls back changes." },
    { n: 53, name: "Competitor Response", role: "Builds rapid legitimate counter-strategies." },
  ]},
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

// §38 — Core data model: the canonical opportunity record the engine produces
// and moves through its lifecycle.
export type SearchOpportunity = {
  id: string; workspaceId: string; websiteId: string;
  topic: string; query?: string;
  intent: "INFORMATIONAL" | "COMMERCIAL" | "TRANSACTIONAL" | "LOCAL" | "NAVIGATIONAL" | "COMPARISON";
  currentUrl?: string; currentPosition?: number;
  demandScore: number; commercialIntentScore: number; feasibilityScore: number;
  authorityGapScore: number; conversionProbability: number; competitorStrength: number;
  estimatedTraffic: number; estimatedLeads: number; estimatedRevenue: number;
  estimatedProfit: number; estimatedCost: number;
  recommendedAction: string; confidenceScore: number;
  status: "DISCOVERED" | "RECOMMENDED" | "APPROVED" | "IN_PROGRESS" | "PUBLISHED" | "MEASURING" | "COMPLETED" | "REJECTED";
};

// §39 — Non-negotiable rules. The engine's hard guardrails; every agent + action
// is bound by them. Surfaced verbatim so the discipline is visible, not buried.
export const GUARDRAILS: string[] = [
  "Never guarantee permanent rankings.",
  "Never generate fake backlinks.",
  "Never create fake reviews.",
  "Never fabricate expert credentials.",
  "Never publish mass low-value content.",
  "Never attack competitor websites.",
  "Never cloak (deceive users vs crawlers).",
  "Never alter a website without permission.",
  "Never optimise traffic without measuring conversion.",
  "Never chase search volume without commercial relevance.",
  "Never publish unverified regulated claims.",
  "Never allow autonomous changes without audit and rollback.",
  "Never confuse indexing submission with guaranteed indexing.",
  "Never confuse visibility with revenue.",
  "Never allow AI-generated errors to become brand facts.",
];

// §40 — Activation phases (build/rollout order).
export const ACTIVATION_PHASES: { phase: string; builds: string[] }[] = [
  { phase: "P1 · Search Foundation", builds: ["Website connection", "Crawl engine", "Search Console + Bing", "Technical audit", "Opportunity map", "Keyword/intent universe", "Core dashboard"] },
  { phase: "P2 · Dynamic Optimisation", builds: ["Metadata", "Internal-link recs", "Schema engine", "Sitemap automation", "IndexNow", "Content-gap analysis", "Content refresh", "Approval workflow"] },
  { phase: "P3 · Authority & Competition", builds: ["Competitor War Room", "Authority engine", "Digital PR", "Comparison content", "Local search", "Reputation monitoring"] },
  { phase: "P4 · AI & Social Discovery", builds: ["AI prompt tracking", "AI citation monitoring", "Entity knowledge layer", "YouTube/TikTok/Instagram discovery", "Social-search attribution"] },
  { phase: "P5 · Autonomous Operations", builds: ["Dynamic SEO Commander", "Controlled automatic changes", "Experiments", "Rank-loss response", "Organic budget allocation", "Forecasting", "Cross-channel optimisation"] },
];

// §41 — MVP acceptance criteria (the definition of done for the first release).
export const MVP_CRITERIA: string[] = [
  "Connect a website", "Connect Google Search Console", "Connect Bing Webmaster Tools",
  "Receive a technical search audit", "See indexation & crawl issues", "See high-value query opportunities",
  "See competitor content gaps", "Receive prioritised revenue recommendations", "Generate improved metadata",
  "Generate structured-data recommendations", "Receive internal-link suggestions", "Create an optimised commercial page",
  "Submit approved updates through the CMS", "Trigger IndexNow where supported", "Track ranking & traffic changes",
  "Track leads & revenue from organic traffic", "Review a complete change audit",
];

// §42 — Final positioning statements.
export const FINAL_POSITIONING = {
  master: "Continuously discovers what customers want, strengthens every website signal, builds trusted authority, improves AI recommendation readiness, and converts organic discovery into measurable revenue.",
  punchy: "Own the search. Win the answer. Capture the customer.",
  competitor: "SEO tools tell you what happened. MarketWar finds the opportunity, builds the answer, strengthens the authority, deploys the improvement and measures the money.",
  aiDiscovery: "Be the business search engines understand, AI systems cite and customers choose.",
  standard: "Every search action must increase the probability that the right customer discovers the user, trusts the user, chooses the user and produces measurable commercial value.",
};

// §33 — Permissions & safety framework. Ties directly to the Approvals engine:
// higher risk → stronger gate. No agent may act above its tier without approval.
export const RISK_TIERS: { tier: "low" | "medium" | "high"; gate: string; examples: string[] }[] = [
  { tier: "low", gate: "May be auto-approved (Autonomous mode)", examples: ["Broken-link alerts", "Sitemap updates", "IndexNow notifications", "Metadata drafts", "Internal-link suggestions", "Image compression", "Missing-alt-text recommendations", "Structured-data validation", "Monitoring alerts"] },
  { tier: "medium", gate: "Requires campaign / workspace approval", examples: ["Metadata publishing", "Internal-link insertion", "FAQ additions", "Schema publication", "Content refresh", "Redirect implementation"] },
  { tier: "high", gate: "Requires explicit approval (never automatic)", examples: ["Page deletion", "Mass redirects", "Sitewide canonical changes", "Large content generation", "URL restructuring", "Navigation changes", "Competitor comparison claims", "Regulated-industry content", "Reputation responses", "Major automated publishing"] },
];

// §34 — Command-centre executive metrics + daily priority examples.
export const EXECUTIVE_METRICS = [
  "Organic revenue", "Organic profit", "Qualified organic leads", "Search conversion rate",
  "Non-branded visibility", "Branded visibility", "Top-three positions", "First-page coverage",
  "Featured appearances", "AI recommendation share", "AI citation share", "Social-search visibility",
  "Local visibility", "Authority growth", "Indexation health", "Search revenue at risk",
];

// §35 — MarketWar Search Dominance Score (0–100). Transparent mean of 14
// components (each 0–100; unmeasured → 0 so gaps are honest, not hidden). Every
// weakness maps to a recommended action. Cost/revenue/time/confidence estimates
// attach only when a real data source is connected (never fabricated here).
export const DOMINANCE_COMPONENTS: { key: string; label: string; action: string }[] = [
  { key: "technicalEligibility", label: "Technical Eligibility", action: "Fix crawl/index/render blockers (canonicals, redirects, Core Web Vitals)." },
  { key: "searchDemandCoverage", label: "Search Demand Coverage", action: "Cover the missing high-intent queries with the right page type." },
  { key: "contentAuthority", label: "Content Authority", action: "Deepen the strongest topic clusters with original evidence." },
  { key: "commercialIntentCoverage", label: "Commercial Intent Coverage", action: "Build transactional/comparison pages for buyer queries." },
  { key: "internalAuthority", label: "Internal Authority", action: "Link hubs to commercial pages; fix orphans and depth." },
  { key: "externalAuthority", label: "External Authority", action: "Earn relevant editorial links via PR, research, citations." },
  { key: "entityStrength", label: "Entity Strength", action: "Make brand facts consistent everywhere; add Organisation schema." },
  { key: "aiRecommendationReadiness", label: "AI Recommendation Readiness", action: "Add concise, extractable answers + corroborating evidence." },
  { key: "localVisibility", label: "Local Visibility", action: "Complete profile, reviews, local pages and citations." },
  { key: "socialSearchVisibility", label: "Social Search Visibility", action: "Optimise in-platform discovery on TikTok/IG/YouTube/LinkedIn." },
  { key: "searchConversion", label: "Search Conversion", action: "Improve above-the-fold, CTA, proof, speed and checkout." },
  { key: "reputation", label: "Reputation", action: "Correct owned channels; respond factually to reviews/press." },
  { key: "freshness", label: "Freshness", action: "Refresh declining/expired pages; update facts and offers." },
  { key: "competitivePosition", label: "Competitive Position", action: "Displace weak competitor pages with a stronger answer." },
];
export type DominanceInput = Partial<Record<string, number>>;

export function dominanceScore(inp: DominanceInput): { score: number; weakest: { key: string; label: string; value: number; action: string }[]; measured: number } {
  const vals = DOMINANCE_COMPONENTS.map((c) => ({ ...c, value: clamp01to100(inp[c.key] ?? 0) }));
  const score = Math.round(vals.reduce((a, b) => a + b.value, 0) / vals.length);
  const weakest = [...vals].sort((a, b) => a.value - b.value).slice(0, 5).map(({ key, label, value, action }) => ({ key, label, value, action }));
  const measured = Object.keys(inp).filter((k) => typeof inp[k] === "number").length;
  return { score, weakest, measured };
}

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
