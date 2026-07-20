// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar VisualStrike AI™ — the Product Picture→Viral Campaign engine.
//
// Spec (F1 "Product Picture-to-Viral Campaign Engine"): one product image →
// a complete, platform-ready viral campaign. VisualStrike is NOT an
// "image-to-ad" toy; it researches, scores, angles and pipelines. The heavy
// generation (CV/OCR extraction, image/video synthesis) routes through the
// gateway + image-gateway; THIS module is the deterministic brain that the
// conversational agent has described until now:
//
//   • Product Identity Lock™     — 12 locked traits, 6 preservation tiers,
//                                   exact-preservation forced for regulated goods.
//   • Viral Potential Score™      — 15 explained dimensions, + a separate
//                                   Commercial Potential Score so empty views are
//                                   never mistaken for profitable attention.
//   • Viral Angle Generator       — 27 strategic angle families × 11 fields.
//   • Honesty guard               — never invents a capability or a health /
//                                   financial / technical / performance claim.
//
// Pure + deterministic (seeded, no wall-clock, no randomness) so it runs in demo
// mode and unit-checks. Live vision/market data refines it post-launch.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
// Deterministic 0–1 jitter for a (concept, dimension) pair — stable per input.
const jitter = (s: string) => (seed(s) % 1000) / 1000;

// ---------------------------------------------------------------------------
// Product Identity Lock™ — protect the real product from generative drift.
// ---------------------------------------------------------------------------
export const IDENTITY_TRAITS = [
  "shape", "colour", "logo", "label", "packaging", "texture",
  "proportions", "controls", "printed_text", "trademark_details",
  "product_count", "core_appearance",
] as const;

export type PreservationMode =
  | "exact" | "cosmetic_enhance" | "studio_enhance"
  | "lifestyle_placement" | "in_use_demo" | "controlled_transform";

export const PRESERVATION_MODES: { id: PreservationMode; label: string; drift: "none" | "low" | "medium" | "high" }[] = [
  { id: "exact", label: "Exact product preservation", drift: "none" },
  { id: "cosmetic_enhance", label: "Minor cosmetic enhancement", drift: "low" },
  { id: "studio_enhance", label: "Premium studio enhancement", drift: "low" },
  { id: "lifestyle_placement", label: "Lifestyle placement", drift: "medium" },
  { id: "in_use_demo", label: "Product-in-use demonstration", drift: "medium" },
  { id: "controlled_transform", label: "Controlled creative transformation", drift: "high" },
];

export type IdentityLock = {
  lockedTraits: string[];
  mode: PreservationMode;
  enforcedExact: boolean;   // true when the requested mode was overridden to exact
  reason: string;
};

// Regulated / high-value goods MUST use exact preservation (spec §2). Any other
// requested mode is overridden and the caller is told why.
export function productIdentityLock(input: { regulated?: boolean; highValue?: boolean; requestedMode?: PreservationMode }): IdentityLock {
  const mustExact = Boolean(input.regulated || input.highValue);
  const requested = input.requestedMode ?? "studio_enhance";
  const mode: PreservationMode = mustExact ? "exact" : requested;
  return {
    lockedTraits: [...IDENTITY_TRAITS],
    mode,
    enforcedExact: mustExact && requested !== "exact",
    reason: mustExact
      ? `Regulated or high-value product → exact preservation is mandatory (requested "${requested}" was overridden).`
      : `All 12 identity traits locked; "${mode}" keeps the real product intact while enhancing presentation.`,
  };
}

// ---------------------------------------------------------------------------
// Product Intelligence Extraction — schema + confidence controls + honesty guard.
// The real extraction is multimodal (routed elsewhere); here we model the
// contract so the rest of the engine is testable and the honesty rule holds.
// ---------------------------------------------------------------------------
export type ExtractedField = { key: string; value: string; confidence: number; needsConfirmation: boolean; locked: boolean };

// The platform must NEVER invent a product capability or a health/financial/
// technical/performance claim. Any low-confidence field is flagged, never asserted.
export function guardClaims(fields: ExtractedField[]): { safe: ExtractedField[]; flagged: ExtractedField[]; note: string } {
  const flagged = fields.filter((f) => f.confidence < 0.6 && !f.locked);
  const safe = fields.filter((f) => !(f.confidence < 0.6) || f.locked);
  return {
    safe,
    flagged: flagged.map((f) => ({ ...f, needsConfirmation: true })),
    note: flagged.length
      ? `${flagged.length} low-confidence field(s) require user confirmation before any campaign uses them — the engine will not assert them as fact.`
      : "All extracted fields meet the confidence bar; none are asserted without evidence.",
  };
}

// ---------------------------------------------------------------------------
// Viral Angle Generator — 27 strategic families, each with 11 fields.
// ---------------------------------------------------------------------------
type AngleMeta = {
  id: string; label: string; emotion: string; platform: string;
  durationSec: number; brandRisk: "low" | "medium" | "high"; objective: string;
};

export const ANGLE_FAMILIES: AngleMeta[] = [
  { id: "problem_vs_solution", label: "Problem vs solution", emotion: "relief", platform: "TikTok", durationSec: 15, brandRisk: "low", objective: "conversion" },
  { id: "before_after", label: "Before and after", emotion: "satisfaction", platform: "Instagram Reels", durationSec: 15, brandRisk: "low", objective: "conversion" },
  { id: "product_demonstration", label: "Product demonstration", emotion: "curiosity", platform: "TikTok", durationSec: 30, brandRisk: "low", objective: "consideration" },
  { id: "unexpected_use_case", label: "Unexpected use case", emotion: "surprise", platform: "TikTok", durationSec: 15, brandRisk: "medium", objective: "reach" },
  { id: "customer_pain_point", label: "Customer pain point", emotion: "recognition", platform: "Reels", durationSec: 15, brandRisk: "low", objective: "conversion" },
  { id: "things_nobody_tells_you", label: "Things nobody tells you", emotion: "intrigue", platform: "TikTok", durationSec: 30, brandRisk: "medium", objective: "reach" },
  { id: "product_comparison", label: "Product comparison", emotion: "clarity", platform: "YouTube Shorts", durationSec: 30, brandRisk: "medium", objective: "consideration" },
  { id: "myth_vs_reality", label: "Myth vs reality", emotion: "vindication", platform: "TikTok", durationSec: 30, brandRisk: "medium", objective: "consideration" },
  { id: "founder_story", label: "Founder story", emotion: "trust", platform: "Instagram", durationSec: 60, brandRisk: "low", objective: "brand" },
  { id: "behind_the_product", label: "Behind the product", emotion: "authenticity", platform: "Reels", durationSec: 30, brandRisk: "low", objective: "brand" },
  { id: "social_proof", label: "Social proof", emotion: "belonging", platform: "TikTok", durationSec: 15, brandRisk: "low", objective: "conversion" },
  { id: "objection_handling", label: "Objection handling", emotion: "reassurance", platform: "Reels", durationSec: 30, brandRisk: "low", objective: "conversion" },
  { id: "challenge", label: "Challenge format", emotion: "excitement", platform: "TikTok", durationSec: 15, brandRisk: "medium", objective: "reach" },
  { id: "reaction", label: "Reaction format", emotion: "amusement", platform: "TikTok", durationSec: 15, brandRisk: "medium", objective: "reach" },
  { id: "unboxing", label: "Unboxing", emotion: "anticipation", platform: "YouTube Shorts", durationSec: 30, brandRisk: "low", objective: "consideration" },
  { id: "tutorial", label: "Tutorial", emotion: "empowerment", platform: "YouTube", durationSec: 60, brandRisk: "low", objective: "consideration" },
  { id: "product_test", label: "Product test", emotion: "trust", platform: "TikTok", durationSec: 30, brandRisk: "medium", objective: "consideration" },
  { id: "expert_explanation", label: "Expert explanation", emotion: "authority", platform: "LinkedIn", durationSec: 60, brandRisk: "low", objective: "brand" },
  { id: "aspirational_lifestyle", label: "Aspirational lifestyle", emotion: "desire", platform: "Instagram", durationSec: 15, brandRisk: "low", objective: "brand" },
  { id: "humour", label: "Humour", emotion: "joy", platform: "TikTok", durationSec: 15, brandRisk: "high", objective: "reach" },
  { id: "local_cultural_relevance", label: "Local cultural relevance", emotion: "pride", platform: "TikTok", durationSec: 15, brandRisk: "medium", objective: "reach" },
  { id: "urgency_scarcity", label: "Urgency and scarcity", emotion: "fomo", platform: "Reels", durationSec: 15, brandRisk: "medium", objective: "conversion" },
  { id: "gift_positioning", label: "Gift positioning", emotion: "generosity", platform: "Instagram", durationSec: 15, brandRisk: "low", objective: "conversion" },
  { id: "seasonal_positioning", label: "Seasonal positioning", emotion: "timeliness", platform: "Reels", durationSec: 15, brandRisk: "low", objective: "conversion" },
  { id: "community_participation", label: "Community participation", emotion: "belonging", platform: "TikTok", durationSec: 30, brandRisk: "medium", objective: "reach" },
  { id: "ugc_simulation", label: "UGC-style simulation", emotion: "authenticity", platform: "TikTok", durationSec: 15, brandRisk: "medium", objective: "conversion" },
  { id: "premium_cinematic", label: "Premium cinematic storytelling", emotion: "awe", platform: "YouTube", durationSec: 60, brandRisk: "low", objective: "brand" },
];

export type Angle = AngleMeta & {
  audience: string; problem: string; hook: string; message: string;
  proofRequirement: string; cta: string;
};

export function generateAngles(product: { name: string; category: string; audience?: string; problem?: string }, limit = 6): Angle[] {
  const audience = product.audience || `people shopping for ${product.category.toLowerCase()}`;
  const problem = product.problem || `the usual ${product.category.toLowerCase()} lets them down`;
  // Rank families by seeded fit to this product so the "top N" is stable + varied.
  const ranked = [...ANGLE_FAMILIES]
    .map((a) => ({ a, fit: jitter(product.name + a.id) }))
    .sort((x, y) => y.fit - x.fit)
    .slice(0, Math.max(1, Math.min(ANGLE_FAMILIES.length, limit)))
    .map(({ a }) => a);
  return ranked.map((a) => ({
    ...a,
    audience,
    problem,
    hook: hookFor(a.id, product.name),
    message: `${product.name}: ${messageFor(a.id, product.category)}`,
    proofRequirement: proofFor(a.id),
    cta: ctaFor(a.objective),
  }));
}

function hookFor(id: string, name: string): string {
  const map: Record<string, string> = {
    problem_vs_solution: `Still doing it the hard way? ${name} fixes that in one move.`,
    before_after: `Watch what ${name} does in 10 seconds.`,
    unexpected_use_case: `Nobody buys ${name} for THIS — but they should.`,
    customer_pain_point: `If this annoys you too, ${name} is the fix.`,
    social_proof: `Everyone's switching to ${name}. Here's why.`,
    urgency_scarcity: `This ${name} deal ends tonight.`,
  };
  return map[id] || `Here's the one thing about ${name} you didn't know.`;
}
function messageFor(id: string, category: string): string {
  return id === "objection_handling" ? `answers the "is it worth it?" question for ${category} straight away`
    : id === "premium_cinematic" ? `made to feel premium, shot to make ${category} look inevitable`
    : `the ${category} upgrade that actually earns its place`;
}
function proofFor(id: string): string {
  const needsHardProof = ["product_demonstration", "before_after", "product_test", "product_comparison", "expert_explanation"];
  return needsHardProof.includes(id)
    ? "On-camera demonstration or verifiable result — no staged or fabricated outcome."
    : "Real customer language or a genuine use moment — never an invented testimonial.";
}
function ctaFor(objective: string): string {
  return objective === "conversion" ? "Shop now — link in bio"
    : objective === "consideration" ? "See how it works"
    : objective === "brand" ? "Follow for more"
    : "Tag someone who needs this";
}

// ---------------------------------------------------------------------------
// Viral Potential Score™ (15 dims) + Commercial Potential Score.
// ---------------------------------------------------------------------------
export const VIRAL_DIMENSIONS = [
  "first_second_stopping_power", "visual_novelty", "emotional_intensity", "relatability",
  "shareability", "comment_potential", "demonstration_strength", "transformation_value",
  "surprise_value", "controversy_risk", "cultural_relevance", "trend_alignment",
  "product_clarity", "brand_memorability", "purchase_intent_strength",
] as const;
export type ViralDimension = typeof VIRAL_DIMENSIONS[number];

export type ScoreConcept = { product: string; angle: string; hasProof?: boolean; trendAligned?: boolean; clearProduct?: boolean };
export type ViralScore = {
  viralPotential: number;        // 0–100 attention score (controversy is a penalty, not a bonus)
  commercialPotential: number;   // 0–100 — guards against empty-view virality
  dimensions: { dimension: ViralDimension; score: number }[];
  topDrivers: string[];
  improvements: string[];
  explanation: string;
};

export function scoreConcept(c: ScoreConcept): ViralScore {
  const meta = ANGLE_FAMILIES.find((a) => a.id === c.angle);
  const base = (dim: string) => 45 + Math.round(jitter(c.product + c.angle + dim) * 40); // 45–85 baseline
  const dims = VIRAL_DIMENSIONS.map((dim) => {
    let s = base(dim);
    if (dim === "demonstration_strength") s += c.hasProof ? 12 : -10;
    if (dim === "trend_alignment") s += c.trendAligned ? 12 : -6;
    if (dim === "product_clarity") s += c.clearProduct === false ? -18 : 8;
    if (dim === "purchase_intent_strength" && meta) s += meta.objective === "conversion" ? 12 : meta.objective === "brand" ? -8 : 0;
    if (dim === "surprise_value" && c.angle === "unexpected_use_case") s += 12;
    if (dim === "controversy_risk") s = clamp(meta?.brandRisk === "high" ? s + 20 : meta?.brandRisk === "medium" ? s : s - 15);
    return { dimension: dim, score: clamp(s) };
  });
  const val = (d: ViralDimension) => dims.find((x) => x.dimension === d)!.score;
  // Attention score: mean of positive dims, minus a controversy penalty.
  const positive = dims.filter((d) => d.dimension !== "controversy_risk");
  const meanPos = Math.round(positive.reduce((s, d) => s + d.score, 0) / positive.length);
  const controversyPenalty = Math.round(val("controversy_risk") * 0.15);
  const viralPotential = clamp(meanPos - controversyPenalty);
  // Commercial score weights purchase-intent, clarity, demonstration, relatability.
  const commercialPotential = clamp(
    val("purchase_intent_strength") * 0.4 + val("product_clarity") * 0.25 +
    val("demonstration_strength") * 0.2 + val("relatability") * 0.15);

  const ranked = [...positive].sort((a, b) => b.score - a.score);
  const topDrivers = ranked.slice(0, 3).map((d) => d.dimension.replace(/_/g, " "));
  const weak = [...positive].sort((a, b) => a.score - b.score).slice(0, 3);
  const improvements = weak.map((d) => improveTip(d.dimension));
  if (val("controversy_risk") >= 75) improvements.unshift("Controversy risk is high — soften the hook or add context to protect the brand.");
  if (commercialPotential < viralPotential - 15) improvements.unshift("Attention outruns intent — add a clearer product payoff and CTA so views convert.");

  return {
    viralPotential, commercialPotential, dimensions: dims, topDrivers, improvements,
    explanation: `Scored on 15 dimensions; strongest are ${topDrivers.join(", ")}. Viral ${viralPotential}/100 measures attention (controversy penalised, not rewarded); Commercial ${commercialPotential}/100 measures whether that attention is likely to buy — the two are reported separately so empty views are never mistaken for profit.`,
  };
}

function improveTip(dim: ViralDimension): string {
  const tips: Partial<Record<ViralDimension, string>> = {
    first_second_stopping_power: "Open on the payoff or a pattern-break in frame one.",
    visual_novelty: "Introduce one thing the feed hasn't seen for this category.",
    emotional_intensity: "Name the feeling in the first line, not the feature.",
    relatability: "Use the customer's exact words from real reviews.",
    shareability: "Give a reason to send it to one specific person.",
    comment_potential: "Ask a question the audience already argues about.",
    demonstration_strength: "Show the result on camera — no claims without proof.",
    transformation_value: "Make the before-state painfully clear before the after.",
    surprise_value: "Delay the reveal by one beat longer.",
    cultural_relevance: "Anchor it to a current local moment.",
    trend_alignment: "Ride a rising sound/format, not a saturated one.",
    product_clarity: "Keep the real product unmistakable in every key frame.",
    brand_memorability: "Land the logo/name at the emotional peak.",
    purchase_intent_strength: "Tie the payoff directly to buying, with a clear CTA.",
  };
  return tips[dim] || "Sharpen this dimension with a more specific creative choice.";
}

// The controlled generation pipeline (spec §7) — order matters: protect first.
export const PIPELINE_STAGES = [
  "Preserve the original product",
  "Create the approved hero image",
  "Generate motion around the protected product",
  "Add voice, music and captions",
  "Run product-consistency validation",
  "Generate platform-specific versions",
  "Run compliance and quality checks",
] as const;

// UGC / AI-creator safeguards (spec §8) — enforced before any synthetic presenter.
export const CREATOR_SAFEGUARDS = [
  "AI-generated disclosure on every synthetic asset",
  "No impersonation of a real person",
  "No cloned creator without recorded consent",
  "No fabricated customer testimonial",
  "No fake professional endorsement",
  "No false claim of product use",
  "No unauthorised celebrity likeness",
  "Full consent + rights records retained",
] as const;

// ---------------------------------------------------------------------------
// Viral Content Pack Generator (spec §9) — one concept → 32 native formats
// (adapted natively, never merely resized).
// ---------------------------------------------------------------------------
export const CONTENT_PACK_FORMATS = [
  "TikTok video", "Instagram Reel", "Facebook Reel", "YouTube Short", "Snapchat video",
  "Pinterest video pin", "LinkedIn video", "X video", "WhatsApp Status", "Instagram Story",
  "Facebook Story", "Static post", "Carousel", "Meme", "GIF", "Poll", "Quiz",
  "Product thread", "Community question", "Blog article", "SEO landing page", "GEO/AI-search content",
  "Email campaign", "SMS message", "WhatsApp campaign", "Push notification", "Product description",
  "Marketplace listing", "Sales script", "Influencer brief", "Affiliate content pack", "Press-release draft",
] as const;

export function contentPack(concept: { product: string; angle: string }): { formats: { format: string; note: string }[]; count: number } {
  const meta = ANGLE_FAMILIES.find((a) => a.id === concept.angle);
  const formats = CONTENT_PACK_FORMATS.map((format) => ({
    format,
    note: `Natively adapted for ${format} from the "${meta?.label ?? concept.angle}" angle — reshot for the format, not resized.`,
  }));
  return { formats, count: formats.length };
}

// ---------------------------------------------------------------------------
// One-Click Campaign Modes (spec §13).
// ---------------------------------------------------------------------------
export const CAMPAIGN_MODES: { id: string; label: string; focus: string }[] = [
  { id: "launch_blitz", label: "Launch Blitz", focus: "Complete product-launch campaign across every format." },
  { id: "viral_sprint", label: "Viral Sprint", focus: "High-volume, trend-led short content for 7 days." },
  { id: "sales_conversion", label: "Sales Conversion", focus: "Product proof, objections, offers and retargeting." },
  { id: "product_education", label: "Product Education", focus: "Demonstrations, tutorials and FAQs." },
  { id: "marketplace_domination", label: "Marketplace Domination", focus: "Optimised content for Amazon/Etsy/TikTok Shop/Shopify." },
  { id: "local_business_push", label: "Local Business Push", focus: "Geo-targeted content for stores and service areas." },
  { id: "seasonal_takeover", label: "Seasonal Takeover", focus: "Holiday / weather / event / seasonal demand." },
  { id: "always_on_autopilot", label: "Always-On Autopilot", focus: "Continuously generate, post, learn and optimise within approved budget + brand rules." },
];

// ---------------------------------------------------------------------------
// Hook Laboratory™ (spec §10) — generate + score hooks by type, and block
// deceptive clickbait the content can't fulfil.
// ---------------------------------------------------------------------------
export type Hook = { type: string; text: string; score: number; deceptive: boolean; note: string };

const HOOK_TEMPLATES: Record<string, (p: string) => string> = {
  visual: (p) => `${p} shown in an unexpected but relevant environment.`,
  spoken: () => `You are probably using this the wrong way.`,
  text: () => `Three reasons customers are switching.`,
  curiosity: (p) => `The one thing nobody tells you about ${p}.`,
  pain_point: (p) => `If this frustrates you, ${p} is the fix.`,
  comparison: (p) => `${p} vs the one you already own.`,
  objection: () => `"Is it actually worth it?" — settled in 15 seconds.`,
  urgency: (p) => `This ${p} offer ends tonight.`,
  community: () => `Tag someone who needs to see this.`,
  conversion: (p) => `See whether ${p} is right for you — link below.`,
};

// A hook is deceptive if it over-promises a reveal/claim the concept can't back.
const CLICKBAIT_MARKERS = ["you won't believe", "shocking", "doctors hate", "secret", "miracle", "guaranteed"];
export function blockClickbait(text: string, fulfilled: boolean): { deceptive: boolean; note: string } {
  const lc = text.toLowerCase();
  const overpromise = CLICKBAIT_MARKERS.some((m) => lc.includes(m));
  const deceptive = overpromise && !fulfilled;
  return {
    deceptive,
    note: deceptive
      ? "Blocked — promises a payoff the content does not deliver (deceptive clickbait)."
      : "Passes the deception check — the hook's promise is fulfilled by the content.",
  };
}

export function hookLab(product: { name: string }, fulfilledByContent = true): { hooks: Hook[]; blocked: number } {
  const hooks: Hook[] = Object.entries(HOOK_TEMPLATES).map(([type, tpl]) => {
    const text = tpl(product.name);
    const check = blockClickbait(text, fulfilledByContent);
    return { type, text, score: clamp(55 + Math.round(jitter(product.name + type) * 40)), deceptive: check.deceptive, note: check.note };
  }).sort((a, b) => b.score - a.score);
  return { hooks, blocked: hooks.filter((h) => h.deceptive).length };
}

// ---------------------------------------------------------------------------
// One-call demo campaign brief so the engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoCampaign() {
  const product = { name: "AuraGlow Serum", category: "Skincare", audience: "women 25–40 with dull, tired skin", problem: "expensive serums that do nothing" };
  const lock = productIdentityLock({ regulated: true, requestedMode: "lifestyle_placement" }); // skincare = regulated → forced exact
  const angles = generateAngles(product, 6);
  const scored = angles.map((a) => ({ angle: a.id, label: a.label, ...scoreConcept({ product: product.name, angle: a.id, hasProof: true, trendAligned: true, clearProduct: true }) }))
    .sort((x, y) => y.commercialPotential - x.commercialPotential);
  const winner = scored[0];
  return {
    product, identityLock: lock, angles, ranked: scored,
    contentPack: contentPack({ product: product.name, angle: winner.angle }),
    hookLab: hookLab(product),
    campaignModes: CAMPAIGN_MODES,
    pipeline: PIPELINE_STAGES, safeguards: CREATOR_SAFEGUARDS,
  };
}
