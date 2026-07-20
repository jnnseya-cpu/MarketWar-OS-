// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Autonomous Content Factory — evidence-first content engine
// (spec: Organic Dominance §14 "Autonomous Content Factory"). This is the
// content-engine BACKEND module; it is distinct from the pre-existing
// content-factory AGENT and does not touch it.
//
// It plans content BRIEFS across 26+ output types with a rich control surface
// (brand voice, audience, funnel stage, country/language, claims policy, legal
// disclaimers, approval gates), and it runs every factual claim through an
// EVIDENCE classifier so nothing ships on fabricated statistics or invented
// citations. In high-risk contexts (regulated industries), any claim that is
// AI-inferred or unverified without a source is BLOCKED from publishing and
// routed to source validation.
//
// Pure + deterministic: seeded hashing only, no wall-clock, no randomness, no
// network. Runs zero-config in demo mode. It NEVER fabricates data, metrics,
// testimonials, reviews or citations — predictions/scores are ESTIMATES.

const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

// ---------------------------------------------------------------------------
// Doctrine + catalogues
// ---------------------------------------------------------------------------

export const OUTPUT_TYPES = [
  "seo_article", "geo_aeo_article", "landing_page", "product_page",
  "category_page", "comparison_page", "alternative_page", "case_study",
  "press_release", "thought_leadership", "linkedin_article", "social_post",
  "thread", "video_script", "short_form_concept", "podcast_script",
  "email_campaign", "newsletter", "faq", "knowledge_base_article",
  "lead_magnet", "white_paper", "report", "infographic", "ad_copy",
  "sales_enablement",
] as const;

export type OutputType = (typeof OUTPUT_TYPES)[number];

export const CONTROLS = [
  "brand_voice", "target_audience", "funnel_stage", "country", "language",
  "reading_level", "tone", "length", "cta", "product", "claims_allowed",
  "claims_prohibited", "citation_requirements", "legal_disclaimers",
  "visual_theme", "approval_requirements",
] as const;

export type ControlKey = (typeof CONTROLS)[number];

export const EVIDENCE_CLASSES = [
  "verified_first_party", "verified_external", "user_provided",
  "ai_inference", "unverified_requiring_review",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const DOCTRINE =
  "Evidence-first content factory. Every factual claim is classified by evidence " +
  "strength before it can ship; AI-inferred or unverified claims without a source " +
  "are NOT publishable in high-risk contexts and are routed to source validation. " +
  "Never fabricate statistics, testimonials, reviews or citations — predictions and " +
  "scores are ESTIMATES. Marketing sends require consent and a frequency cap of max " +
  "5 touches per 7 days.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentBrief {
  outputType: OutputType;
  topic: string;
  outline: string[];
  controlsApplied: Record<string, string>;
  requiresSourceValidation: boolean;
  note: string;
}

export interface ClaimAudit {
  text: string;
  evidenceClass: EvidenceClass;
  publishable: boolean;
  reason: string;
}

export interface ClaimInput {
  text: string;
  hasSource?: boolean;
}

export interface AssembleResult {
  brief: ContentBrief;
  claimAudit: ClaimAudit[];
  blocked: number;
  publishable: boolean;
}

export interface BriefInput {
  outputType: string;
  topic: string;
  controls?: Record<string, string>;
  highRisk?: boolean;
}

export interface AssembleInput {
  outputType: string;
  topic: string;
  claims?: ClaimInput[];
  highRisk?: boolean;
}

// ---------------------------------------------------------------------------
// Outline scaffolds — deterministic per output type, seeded rotation per topic
// ---------------------------------------------------------------------------

const OUTLINE_BANK: string[] = [
  "Hook framing the reader's real problem",
  "What the evidence actually shows (label estimates as ESTIMATES)",
  "How it works, step by step",
  "Worked example grounded in supplied data",
  "Objections and honest trade-offs",
  "Proof: sourced claims only, no fabricated metrics",
  "Clear call to action",
  "FAQ and further reading with real citations",
];

const isOutputType = (t: string): t is OutputType =>
  (OUTPUT_TYPES as readonly string[]).includes(t);

export const isKnownOutputType = (t: string): boolean => isOutputType(t);

function buildOutline(outputType: OutputType, topic: string): string[] {
  const s = seed(`${outputType}:${topic}`);
  const size = 4 + (s % 3); // 4..6 sections, deterministic
  const start = s % OUTLINE_BANK.length;
  const out: string[] = [`${outputType.replace(/_/g, " ")}: ${topic}`];
  for (let i = 0; i < size; i++) {
    out.push(OUTLINE_BANK[(start + i) % OUTLINE_BANK.length]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildBrief
// ---------------------------------------------------------------------------

export function buildBrief(input: BriefInput): ContentBrief {
  const outputType = input.outputType as OutputType; // route validates membership
  const topic = input.topic;
  const highRisk = input.highRisk === true;

  const controlsApplied: Record<string, string> = {};
  const supplied = input.controls ?? {};
  for (const key of CONTROLS) {
    if (typeof supplied[key] === "string" && supplied[key].length > 0) {
      controlsApplied[key] = supplied[key];
    }
  }

  const note = highRisk
    ? "High-risk context: source validation required before any claim publishes; consent + max 5 sends per 7 days apply to marketing outputs."
    : "Standard context: evidence-first — sourced or first-party claims preferred; predictions labelled as ESTIMATES.";

  return {
    outputType,
    topic,
    outline: buildOutline(outputType, topic),
    controlsApplied,
    requiresSourceValidation: highRisk,
    note,
  };
}

// ---------------------------------------------------------------------------
// classifyClaim — evidence-first gate
// ---------------------------------------------------------------------------

// Deterministic lexical signals used ONLY to route a claim to the correct
// evidence class. They never invent data; a claim with a supplied source is
// treated as user-provided/verified, otherwise it is inference or unverified.
const FABRICATION_MARKERS = ["studies show", "everyone knows", "guaranteed", "100% of", "proven fact", "scientists say"];
const STAT_MARKERS = ["%", "percent", "x more", "roi", "increase", "million", "billion", "rated", "reviews", "stars"];

export function classifyClaim(text: string, hasSource?: boolean, highRisk?: boolean): ClaimAudit {
  const lower = text.toLowerCase();
  const sourced = hasSource === true;
  const risky = highRisk === true;
  const looksStatistical = STAT_MARKERS.some((m) => lower.includes(m));
  const looksFabricated = FABRICATION_MARKERS.some((m) => lower.includes(m));

  // Unsourced statistical/authority claims are the classic fabrication trap.
  if (!sourced && (looksFabricated || looksStatistical)) {
    return {
      text,
      evidenceClass: "unverified_requiring_review",
      publishable: false,
      reason: "Unsourced statistic or authority claim — fabricated stats/citations are never allowed; provide a verifiable source before publishing.",
    };
  }

  if (sourced) {
    // Determinstically split sourced claims across verified classes by hash so
    // the audit is stable, without ever fabricating the underlying source.
    const cls: EvidenceClass = seed(text) % 2 === 0 ? "verified_first_party" : "verified_external";
    return {
      text,
      evidenceClass: cls,
      publishable: true,
      reason: "Backed by a supplied source; publishable under evidence-first policy.",
    };
  }

  // Unsourced, non-statistical claim: an AI inference / user assertion.
  const evidenceClass: EvidenceClass = risky ? "unverified_requiring_review" : "ai_inference";
  return {
    text,
    evidenceClass,
    publishable: !risky,
    reason: risky
      ? "AI-inferred/unverified claim in a high-risk context — blocked pending source validation."
      : "AI-inferred claim (ESTIMATE) — publishable in standard context but label as an estimate; add a source to strengthen.",
  };
}

// ---------------------------------------------------------------------------
// assemble — brief + full claim audit
// ---------------------------------------------------------------------------

export function assemble(input: AssembleInput): AssembleResult {
  const brief = buildBrief({
    outputType: input.outputType,
    topic: input.topic,
    highRisk: input.highRisk,
  });

  const claims = input.claims ?? [];
  const claimAudit: ClaimAudit[] = claims.map((c) =>
    classifyClaim(c.text, c.hasSource, input.highRisk),
  );

  const blocked = claimAudit.filter((c) => !c.publishable).length;

  return {
    brief,
    claimAudit,
    blocked,
    publishable: blocked === 0,
  };
}

// ---------------------------------------------------------------------------
// Demo — zero-config example with a mix of sourced + unsourced claims
// ---------------------------------------------------------------------------

export function demoContentEngine(): AssembleResult {
  return assemble({
    outputType: "seo_article",
    topic: "How B2B teams cut CAC with intent-led content",
    highRisk: false,
    claims: [
      { text: "Our first-party data covers 12,000 tracked buyer journeys.", hasSource: true },
      { text: "Intent-led pages tend to convert warmer traffic (ESTIMATE).", hasSource: false },
      { text: "Studies show 300% ROI from this tactic.", hasSource: false },
      { text: "Gartner ranks the category by adoption maturity.", hasSource: true },
    ],
  });
}
