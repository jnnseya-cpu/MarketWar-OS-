// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Content Opportunity Radar (Organic Dominance §13). Merges every
// demand signal — social conversations, search queries, AI prompts, competitor
// content, support issues, reviews, sales objections, analytics, seasonal/
// cultural events, news, product availability — and ranks each candidate by a
// TRANSPARENT, EDITABLE Opportunity Score:
//
//   Opportunity Score = Demand × Commercial Intent × Relevance × Timing
//                       × Authority Probability × Conversion Probability
//                       ÷ Competition
//
// The point is transparency: every factor is shown and can be re-weighted, so
// the ranking is auditable rather than a black box. Pure + deterministic
// (seeded) so it runs in demo mode and unit-checks. Signals are only scored,
// never fabricated.

const clamp01 = (n: number) => Math.max(0.01, Math.min(1, n));
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

export const SIGNAL_SOURCES = [
  "social_conversations", "search_queries", "ai_prompts", "competitor_content",
  "support_issues", "reviews", "sales_objections", "website_analytics",
  "seasonal_events", "cultural_events", "news", "product_availability",
] as const;
export type SignalSource = typeof SIGNAL_SOURCES[number];

export const OPPORTUNITY_CATEGORIES = [
  "high_traffic", "high_conversion", "low_competition", "emerging_trend",
  "reputation_defence", "competitor_displacement", "local_market", "product_education",
  "customer_retention", "thought_leadership", "viral_potential", "ai_citation_potential",
  "backlink_potential", "press_opportunity",
] as const;
export type OpportunityCategory = typeof OPPORTUNITY_CATEGORIES[number];

// The 7 transparent factors (0–1 each, competition is a divisor).
export type Factors = {
  demand: number;
  commercialIntent: number;
  relevance: number;
  timing: number;
  authorityProbability: number;
  conversionProbability: number;
  competition: number;
};

// Callers may re-weight any factor; defaults are all 1 (pure formula).
export type FactorWeights = Partial<Record<keyof Factors, number>>;

export type Opportunity = {
  topic: string;
  category: OpportunityCategory;
  sources: string[];
  factors: Factors;
  opportunityScore: number;   // 0–100 (normalised)
  rawScore: number;           // the un-normalised formula product
  breakdown: string;          // transparent maths, human-readable
};

export type OpportunityInput = {
  topic: string;
  category?: OpportunityCategory;
  sources?: string[];
  factors?: Partial<Factors>; // any omitted factor is seeded from the topic
};

function factorsFor(input: OpportunityInput): Factors {
  const s = seed(input.topic);
  const f = input.factors ?? {};
  const def = (k: keyof Factors, salt: number) => clamp01(((s + salt) % 100) / 100 * 0.8 + 0.15);
  return {
    demand: clamp01(f.demand ?? def("demand", 1)),
    commercialIntent: clamp01(f.commercialIntent ?? def("commercialIntent", 7)),
    relevance: clamp01(f.relevance ?? def("relevance", 13)),
    timing: clamp01(f.timing ?? def("timing", 19)),
    authorityProbability: clamp01(f.authorityProbability ?? def("authorityProbability", 23)),
    conversionProbability: clamp01(f.conversionProbability ?? def("conversionProbability", 29)),
    competition: clamp01(f.competition ?? def("competition", 31)),
  };
}

export function scoreOpportunity(input: OpportunityInput, weights: FactorWeights = {}): Opportunity {
  const factors = factorsFor(input);
  const w = (k: keyof Factors) => weights[k] ?? 1;
  // Weighted transparent formula (competition divides).
  const numerator =
    (factors.demand * w("demand")) *
    (factors.commercialIntent * w("commercialIntent")) *
    (factors.relevance * w("relevance")) *
    (factors.timing * w("timing")) *
    (factors.authorityProbability * w("authorityProbability")) *
    (factors.conversionProbability * w("conversionProbability"));
  const rawScore = numerator / (factors.competition * w("competition"));
  // Normalise: the max meaningful raw (all factors 1, competition 0.01) is 100.
  const opportunityScore = clamp(rawScore * 100);
  return {
    topic: input.topic,
    category: input.category ?? "high_traffic",
    sources: input.sources ?? [],
    factors,
    opportunityScore,
    rawScore: round(rawScore, 3),
    breakdown: `Demand ${round(factors.demand, 2)} × Intent ${round(factors.commercialIntent, 2)} × Relevance ${round(factors.relevance, 2)} × Timing ${round(factors.timing, 2)} × Authority ${round(factors.authorityProbability, 2)} × Conversion ${round(factors.conversionProbability, 2)} ÷ Competition ${round(factors.competition, 2)} = ${round(rawScore, 3)} → ${opportunityScore}/100`,
  };
}

export function rankOpportunities(inputs: OpportunityInput[], weights: FactorWeights = {}): { opportunities: Opportunity[]; note: string } {
  const opportunities = inputs.map((i) => scoreOpportunity(i, weights)).sort((a, b) => b.opportunityScore - a.opportunityScore);
  return {
    opportunities,
    note: "Ranked by a transparent, re-weightable formula (Demand × Intent × Relevance × Timing × Authority × Conversion ÷ Competition). Every factor is shown so the ranking is auditable. Signals are scored from supplied inputs — never fabricated.",
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo so the engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoOpportunityRadar() {
  return rankOpportunities([
    { topic: "best gluten-free restaurant in Brixton", category: "high_conversion", sources: ["search_queries", "ai_prompts"], factors: { commercialIntent: 0.9, competition: 0.3, demand: 0.6 } },
    { topic: "why is my delivery cold — fixes", category: "reputation_defence", sources: ["reviews", "support_issues"], factors: { demand: 0.5, competition: 0.2, timing: 0.8 } },
    { topic: "vegan grill recipes trend", category: "emerging_trend", sources: ["social_conversations", "news"], factors: { timing: 0.95, demand: 0.7, competition: 0.5 } },
    { topic: "Rival Smokehouse alternative", category: "competitor_displacement", sources: ["ai_prompts", "competitor_content"], factors: { commercialIntent: 0.85, competition: 0.25 } },
  ]);
}
