// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar AI Answer Accuracy Monitor
// (Organic Dominance §10 — Generative Search Visibility).
//
// Audits what generative-search engines (AI Overviews, ChatGPT, Perplexity,
// Copilot, Gemini, Claude) actually SAY about a brand: is the brand mentioned,
// is it cited, and does the answer contain factual errors (wrong price, wrong
// location, missing product, brand confusion, negative framing, stale
// citations)? Produces an accuracy ESTIMATE and a prioritised fix plan.
//
// Doctrine: honesty first. Scores are labelled ESTIMATES; the engine never
// fabricates metrics or reviews. The causal safeguard exists precisely so we
// never claim ALL AI-referral growth was caused by our optimisation — growth
// is measured against a control group before it is ever attributed.
//
// Pure + deterministic: no Date.now / new Date / Math.random. Any derived
// pseudo-random value comes from the seeded hash below.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const round1 = (n: number): number => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------
export const AI_ENGINES = [
  "google_ai_overviews",
  "chatgpt",
  "perplexity",
  "copilot",
  "gemini",
  "claude",
] as const;
export type AiEngine = (typeof AI_ENGINES)[number];

export const ISSUE_TYPES = [
  "incorrect_description",
  "outdated_price",
  "incorrect_location",
  "missing_product",
  "false_comparison",
  "negative_framing",
  "brand_confusion",
  "obsolete_citation",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const FIX_ACTIONS = [
  "source_page_correction",
  "structured_data_improvement",
  "faq_creation",
  "entity_clarification",
  "authoritative_content",
  "external_citation_campaign",
  "knowledge_graph_update",
] as const;
export type FixAction = (typeof FIX_ACTIONS)[number];

export type Severity = "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// checkAnswer — audit one AI answer against supplied ground-truth facts
// ---------------------------------------------------------------------------
export type AnswerFacts = {
  prices?: string[];
  locations?: string[];
  products?: string[];
};

export type CheckAnswerInput = {
  brand: string;
  engine: string;
  answerText: string;
  facts?: AnswerFacts;
};

export type AnswerIssue = {
  type: IssueType;
  detail: string;
  severity: Severity;
};

export type AnswerCheckResult = {
  engine: string;
  brandMentioned: boolean;
  brandCited: boolean;
  issues: AnswerIssue[];
  accuracyScore: number; // 0–100 (ESTIMATE)
  recommendedFixes: string[];
};

// Known confusable brands: if any of these surface in the answer while the
// audited brand is discussed, that is a brand-confusion signal.
const CONFUSABLE_BRANDS = [
  "amazon", "apple", "google", "meta", "shopify", "stripe", "square",
  "wix", "squarespace", "hubspot", "salesforce", "mailchimp", "klaviyo",
];

const NEGATIVE_TERMS = [
  "scam", "overpriced", "avoid", "poor", "unreliable", "worst",
  "disappointing", "terrible", "fraud", "outdated", "clunky",
];

function normalise(text: string): string {
  return text.toLowerCase();
}

function containsFact(haystack: string, fact: string): boolean {
  const f = fact.trim().toLowerCase();
  return f.length > 0 && haystack.includes(f);
}

export function checkAnswer(input: CheckAnswerInput): AnswerCheckResult {
  const brand = (input.brand || "").trim();
  const engine = input.engine || "chatgpt";
  const answer = normalise(input.answerText || "");
  const facts: AnswerFacts = input.facts || {};

  const brandLower = brand.toLowerCase();
  const brandMentioned = brandLower.length > 0 && answer.includes(brandLower);
  // Citation proxy: brand mentioned alongside a link/source/citation cue.
  const brandCited = brandMentioned && /\b(source|according to|cited|reference|https?:\/\/|\.com|\.co\.|\.io)\b/i.test(input.answerText || "");

  const issues: AnswerIssue[] = [];
  const fixSet = new Set<FixAction>();

  // Outdated / missing price: any supplied price string that does NOT appear.
  const prices = facts.prices || [];
  for (const price of prices) {
    if (!containsFact(answer, price)) {
      issues.push({
        type: "outdated_price",
        detail: `Ground-truth price "${price}" is absent from the ${engine} answer — the engine may be quoting a stale or missing price.`,
        severity: "high",
      });
      fixSet.add("source_page_correction");
      fixSet.add("structured_data_improvement");
    }
  }

  // Incorrect / missing location.
  const locations = facts.locations || [];
  for (const loc of locations) {
    if (!containsFact(answer, loc)) {
      issues.push({
        type: "incorrect_location",
        detail: `Ground-truth location "${loc}" does not appear in the ${engine} answer — location may be wrong or omitted.`,
        severity: "medium",
      });
      fixSet.add("structured_data_improvement");
      fixSet.add("knowledge_graph_update");
    }
  }

  // Missing product.
  const products = facts.products || [];
  for (const product of products) {
    if (!containsFact(answer, product)) {
      issues.push({
        type: "missing_product",
        detail: `Product "${product}" is not mentioned in the ${engine} answer for ${brand || "the brand"}.`,
        severity: "medium",
      });
      fixSet.add("faq_creation");
      fixSet.add("authoritative_content");
    }
  }

  // Brand confusion: a confusable competitor brand appears in the answer.
  for (const other of CONFUSABLE_BRANDS) {
    if (other !== brandLower && answer.includes(other)) {
      issues.push({
        type: "brand_confusion",
        detail: `The answer references "${other}" while discussing ${brand || "the brand"} — the engine may be conflating the two entities.`,
        severity: "high",
      });
      fixSet.add("entity_clarification");
      fixSet.add("knowledge_graph_update");
      break;
    }
  }

  // Negative framing.
  const negativeHit = NEGATIVE_TERMS.find((t) => answer.includes(t));
  if (negativeHit) {
    issues.push({
      type: "negative_framing",
      detail: `Negative language ("${negativeHit}") is present in the ${engine} answer — reputation framing needs authoritative counter-content.`,
      severity: "medium",
    });
    fixSet.add("authoritative_content");
    fixSet.add("external_citation_campaign");
  }

  // Brand not mentioned at all → treated as an incorrect_description gap.
  if (!brandMentioned && brandLower.length > 0) {
    issues.push({
      type: "incorrect_description",
      detail: `${brand} is not mentioned in the ${engine} answer — no generative visibility for this query yet.`,
      severity: "high",
    });
    fixSet.add("authoritative_content");
    fixSet.add("source_page_correction");
  }

  // Accuracy score (ESTIMATE): start at 100, subtract by severity, reward citation.
  const penalty = issues.reduce((a, iss) => a + (iss.severity === "high" ? 22 : iss.severity === "medium" ? 12 : 6), 0);
  const citationBonus = brandCited ? 6 : 0;
  const accuracyScore = clamp(100 - penalty + citationBonus);

  const recommendedFixes = [...fixSet].map((f) => fixActionLabel(f));

  return {
    engine,
    brandMentioned,
    brandCited,
    issues,
    accuracyScore,
    recommendedFixes: recommendedFixes.length
      ? recommendedFixes
      : ["No factual issues detected against the supplied facts — monitor on the next crawl (ESTIMATE)."],
  };
}

function fixActionLabel(action: FixAction): string {
  switch (action) {
    case "source_page_correction": return "source_page_correction: update the canonical source page so engines re-crawl the correct fact.";
    case "structured_data_improvement": return "structured_data_improvement: add/repair Product, LocalBusiness & Offer schema.org markup.";
    case "faq_creation": return "faq_creation: publish an FAQ block covering the missing product/answer.";
    case "entity_clarification": return "entity_clarification: disambiguate the brand entity (sameAs, distinct naming) to stop confusion.";
    case "authoritative_content": return "authoritative_content: publish authoritative, citable content the engines can quote.";
    case "external_citation_campaign": return "external_citation_campaign: earn third-party citations that engines trust.";
    case "knowledge_graph_update": return "knowledge_graph_update: submit corrections to the knowledge graph / business listings.";
    default: return action;
  }
}

// ---------------------------------------------------------------------------
// causalSafeguard — lift vs a control group, so growth isn't over-claimed
// ---------------------------------------------------------------------------
export type CausalSafeguardInput = {
  treatedTrafficBefore: number;
  treatedTrafficAfter: number;
  controlTrafficBefore: number;
  controlTrafficAfter: number;
};

export type CausalSafeguardResult = {
  treatedLiftPct: number;
  controlLiftPct: number;
  attributableLiftPct: number; // treated - control
  verdict: "attributable" | "likely_market_wide" | "inconclusive";
  note: string;
};

function liftPct(before: number, after: number): number {
  if (before <= 0) return 0;
  return round1(((after - before) / before) * 100);
}

export function causalSafeguard(input: CausalSafeguardInput): CausalSafeguardResult {
  const treatedLiftPct = liftPct(input.treatedTrafficBefore, input.treatedTrafficAfter);
  const controlLiftPct = liftPct(input.controlTrafficBefore, input.controlTrafficAfter);
  const attributableLiftPct = round1(treatedLiftPct - controlLiftPct);

  const haveSignal = input.treatedTrafficBefore > 0 && input.controlTrafficBefore > 0;
  let verdict: CausalSafeguardResult["verdict"];
  if (!haveSignal) {
    verdict = "inconclusive";
  } else if (attributableLiftPct >= 5) {
    verdict = "attributable";
  } else if (controlLiftPct >= 5 && attributableLiftPct < 5) {
    verdict = "likely_market_wide";
  } else {
    verdict = "inconclusive";
  }

  const note = verdict === "attributable"
    ? `ESTIMATE: treated group grew ${treatedLiftPct}% vs control ${controlLiftPct}%. ~${attributableLiftPct}pp appears attributable to the optimisation — we do NOT claim the full ${treatedLiftPct}%, only the control-adjusted difference.`
    : verdict === "likely_market_wide"
      ? `ESTIMATE: the control group also grew ${controlLiftPct}%, so most of the treated ${treatedLiftPct}% is likely market-wide, not caused by the optimisation. Only ~${attributableLiftPct}pp is attributable.`
      : `ESTIMATE: signal is too weak or baselines too small to attribute growth. Do not claim causation — collect more data before crediting the optimisation.`;

  return { treatedLiftPct, controlLiftPct, attributableLiftPct, verdict, note };
}

// ---------------------------------------------------------------------------
// Demo (zero-config): a planted price + brand-confusion error + a causal example
// ---------------------------------------------------------------------------
export type DemoAiAccuracy = {
  brand: string;
  check: AnswerCheckResult;
  causal: CausalSafeguardResult;
};

export function demoAiAccuracy(): DemoAiAccuracy {
  const brand = "BitriPay";
  // Planted errors: answer quotes an old price ("£19/mo") not matching the
  // ground-truth "£29/mo", and mentions "Stripe" (brand confusion).
  const s = seed(brand); // deterministic touch so the demo is reproducible.
  const answerText =
    `BitriPay is a payments tool that costs around £${19 + (s % 1)}/mo. It is similar to Stripe ` +
    `and is based in London. According to their site https://bitripay.example it supports card and crypto payouts.`;
  const check = checkAnswer({
    brand,
    engine: "chatgpt",
    answerText,
    facts: {
      prices: ["£29/mo"],
      locations: ["London"],
      products: ["card payouts", "crypto payouts"],
    },
  });
  const causal = causalSafeguard({
    treatedTrafficBefore: 1000,
    treatedTrafficAfter: 1450,
    controlTrafficBefore: 1000,
    controlTrafficAfter: 1120,
  });
  return { brand, check, causal };
}
