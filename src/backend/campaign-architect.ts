// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Campaign Architect — SiteRaid's Autonomous Campaign Architect
// (spec F2 §7) + Trend Hijack with Brand Relevance™ (spec F2 §10).
//
// From a business objective it lays out a full funnel architecture across the
// five layers (Awareness → Consideration → Conversion → Retention → Advocacy),
// choosing the right content plays, channel and KPI per layer. And it runs the
// Trend Hijack relevance gate: scoring a candidate trend on brand/audience/
// commercial fit AND on reputation/legal/sensitivity risk — REJECTING trends
// that could damage the brand, exploit tragedy or mislead. Pure + deterministic
// (seeded) so it runs in demo mode and unit-checks. It never fabricates
// performance — every score is a labelled estimate.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const pick = <T>(arr: T[], s: number): T => arr[s % arr.length];

// ---------------------------------------------------------------------------
// Autonomous Campaign Architect — the 5 funnel layers.
// ---------------------------------------------------------------------------
export const FUNNEL_LAYERS = ["awareness", "consideration", "conversion", "retention", "advocacy"] as const;
export type FunnelLayer = typeof FUNNEL_LAYERS[number];

const LAYER_PLAYS: Record<FunnelLayer, string[]> = {
  awareness: ["Viral social content", "Thought leadership", "Educational content", "Founder stories", "Brand stories", "Trend participation"],
  consideration: ["Demonstrations", "Comparisons", "Case studies", "Reviews", "FAQs", "Objection content", "Retargeting videos"],
  conversion: ["Offer ads", "Product ads", "Lead-generation campaigns", "Shopping campaigns", "Booking campaigns", "Cart-recovery content"],
  retention: ["Onboarding", "Customer education", "Replenishment reminders", "Renewal campaigns", "Loyalty campaigns", "Cross-sell campaigns", "Referral campaigns"],
  advocacy: ["Review collection", "UGC requests", "Affiliate programmes", "Ambassador programmes", "Community challenges", "Customer spotlight campaigns"],
};

const LAYER_KPI: Record<FunnelLayer, string> = {
  awareness: "reach / qualified impressions",
  consideration: "engaged sessions / assisted conversions",
  conversion: "cost per acquisition / ROAS",
  retention: "repeat rate / lifetime value",
  advocacy: "referral K-factor / reviews collected",
};

const LAYER_CHANNELS: Record<FunnelLayer, string[]> = {
  awareness: ["TikTok", "Instagram Reels", "YouTube"],
  consideration: ["YouTube", "Retargeting", "Email"],
  conversion: ["Google Search", "Meta Ads", "WhatsApp", "Landing page"],
  retention: ["Email", "SMS", "WhatsApp"],
  advocacy: ["Email", "Community", "Referral"],
};

export type LayerPlan = {
  layer: FunnelLayer;
  goal: string;
  plays: string[];           // selected content plays for this layer
  recommendedChannel: string;
  kpi: string;
  budgetShare: number;       // % of budget (owned-first, conversion-weighted)
};

export type CampaignArchitecture = {
  business: string;
  objective: string;
  layers: LayerPlan[];
  budgetGbp: number | null;
  note: string;
};

// Budget weighting favours the funnel stages that match the objective, but never
// starves awareness (you can't convert traffic you don't have).
const OBJECTIVE_WEIGHTS: Record<string, Partial<Record<FunnelLayer, number>>> = {
  sales: { awareness: 20, consideration: 20, conversion: 40, retention: 12, advocacy: 8 },
  leads: { awareness: 25, consideration: 25, conversion: 35, retention: 8, advocacy: 7 },
  awareness: { awareness: 45, consideration: 25, conversion: 15, retention: 8, advocacy: 7 },
  launch: { awareness: 35, consideration: 25, conversion: 25, retention: 8, advocacy: 7 },
  retention: { awareness: 10, consideration: 12, conversion: 18, retention: 40, advocacy: 20 },
};

export function buildArchitecture(input: { business: string; objective?: string; channels?: string[]; budgetGbp?: number }): CampaignArchitecture {
  const objective = (input.objective ?? "sales").toLowerCase();
  const weights = OBJECTIVE_WEIGHTS[objective] ?? OBJECTIVE_WEIGHTS.sales;
  const layers: LayerPlan[] = FUNNEL_LAYERS.map((layer) => {
    const s = seed(input.business + objective + layer);
    // Pick 3 plays deterministically from the layer's play list.
    const pool = LAYER_PLAYS[layer];
    const plays = [pick(pool, s), pick(pool, s + 7), pick(pool, s + 13)].filter((v, i, a) => a.indexOf(v) === i);
    const channelPool = (input.channels && input.channels.length ? input.channels : LAYER_CHANNELS[layer]);
    return {
      layer,
      goal: layerGoal(layer),
      plays,
      recommendedChannel: pick(channelPool, s),
      kpi: LAYER_KPI[layer],
      budgetShare: weights[layer] ?? 15,
    };
  });
  return {
    business: input.business,
    objective,
    layers,
    budgetGbp: input.budgetGbp ?? null,
    note: `Full-funnel architecture for "${input.objective ?? "sales"}" — budget weighted to the objective but awareness is never starved. Plays and channels are recommendations; spend shares are labelled estimates.`,
  };
}

function layerGoal(layer: FunnelLayer): string {
  return {
    awareness: "Get discovered by the right buyers.",
    consideration: "Turn attention into intent with proof.",
    conversion: "Convert intent into revenue at a healthy CAC.",
    retention: "Keep customers and grow their value.",
    advocacy: "Turn happy customers into a growth engine.",
  }[layer];
}

// ---------------------------------------------------------------------------
// Trend Hijack with Brand Relevance™ — the relevance + risk gate.
// ---------------------------------------------------------------------------
export const TREND_CATEGORIES = [
  "social_audio", "memes", "search_spikes", "news_themes", "seasonal_moments",
  "cultural_conversations", "product_category_trends", "local_events",
  "competitor_activity", "creator_formats", "customer_questions",
] as const;
export type TrendCategory = typeof TREND_CATEGORIES[number];

// Positive fit factors + risk factors (spec §10).
export const TREND_FIT_FACTORS = ["brand_relevance", "audience_relevance", "commercial_potential", "speed_requirement"] as const;
export const TREND_RISK_FACTORS = ["reputation_risk", "legal_risk", "sensitivity", "content_saturation"] as const;

// Words that should hard-block a trend (tragedy/harm/misleading associations).
const UNSAFE_MARKERS = ["tragedy", "disaster", "death", "shooting", "war", "scandal", "hate", "funeral", "victims", "crisis"];

export type TrendVerdict = {
  trend: string;
  category: string;
  fit: { factor: string; score: number }[];
  risk: { factor: string; score: number }[];
  fitScore: number;
  riskScore: number;
  verdict: "join" | "watch" | "reject";
  reason: string;
};

export function trendHijackGate(input: { trend: string; category?: string; business?: string; sensitiveMarkers?: string[] }): TrendVerdict {
  const trend = input.trend;
  const lc = trend.toLowerCase();
  const business = input.business ?? "the brand";
  const markers = [...UNSAFE_MARKERS, ...(input.sensitiveMarkers ?? [])];
  const unsafe = markers.some((m) => lc.includes(m));

  const fit = TREND_FIT_FACTORS.map((factor) => ({ factor, score: clamp(40 + (seed(trend + business + factor) % 55)) }));
  const risk = TREND_RISK_FACTORS.map((factor) => {
    let score = clamp(10 + (seed(trend + factor) % 45));
    if (unsafe && (factor === "reputation_risk" || factor === "sensitivity" || factor === "legal_risk")) score = clamp(85 + (seed(trend + factor) % 15));
    return { factor, score };
  });
  const fitScore = clamp(fit.reduce((s, f) => s + f.score, 0) / fit.length);
  const riskScore = clamp(risk.reduce((s, f) => s + f.score, 0) / risk.length);

  let verdict: TrendVerdict["verdict"];
  let reason: string;
  if (unsafe || risk.some((r) => (r.factor === "reputation_risk" || r.factor === "legal_risk" || r.factor === "sensitivity") && r.score >= 75)) {
    verdict = "reject";
    reason = `REJECT: this trend carries unacceptable reputation/legal/sensitivity risk — joining it could damage the brand, exploit tragedy or mislead. Never hijack it.`;
  } else if (fitScore >= 60 && riskScore < 45) {
    verdict = "join";
    reason = `JOIN: strong brand/audience fit (${fitScore}/100) with low risk (${riskScore}/100) — move fast while it's fresh.`;
  } else {
    verdict = "watch";
    reason = `WATCH: fit ${fitScore}/100 vs risk ${riskScore}/100 — not a clear win; only join with a genuinely on-brand angle.`;
  }
  return { trend, category: input.category ?? "cultural_conversations", fit, risk, fitScore, riskScore, verdict, reason };
}

// ---------------------------------------------------------------------------
// Autonomy & Approval Levels (spec) — how much the AI may publish on its own.
// High-risk categories are hard-capped at Level 0/1 (never full autopilot).
// ---------------------------------------------------------------------------
export const AUTONOMY_LEVELS = [
  { level: 0, id: "draft_only", label: "Draft Only", detail: "AI creates content but cannot publish." },
  { level: 1, id: "user_approval", label: "User Approval Required", detail: "Every asset requires approval." },
  { level: 2, id: "campaign_approval", label: "Campaign Approval", detail: "User approves strategy; AI creates + publishes permitted variations." },
  { level: 3, id: "guarded_autopilot", label: "Guarded Autopilot", detail: "AI publishes within approved brand/budget/channel/compliance limits." },
  { level: 4, id: "revenue_autopilot", label: "Revenue Autopilot", detail: "AI reallocates budget + generates assets by profitability." },
] as const;

// Categories that must stay human-gated.
const HIGH_RISK_CATEGORIES = ["regulated", "health", "financial", "political", "children", "alcohol", "gambling", "legal_claims"];

export type AutonomyDecision = {
  requestedLevel: number;
  maxLevel: number;
  grantedLevel: number;
  capped: boolean;
  reason: string;
};

export function autonomyGate(input: { riskCategory?: string; brandRiskScore?: number; requestedLevel?: number }): AutonomyDecision {
  const requested = Math.max(0, Math.min(4, Math.round(input.requestedLevel ?? 1)));
  const cat = (input.riskCategory ?? "").toLowerCase();
  const highRisk = HIGH_RISK_CATEGORIES.some((c) => cat.includes(c)) || (input.brandRiskScore ?? 0) >= 70;
  const maxLevel = highRisk ? 1 : 4;
  const grantedLevel = Math.min(requested, maxLevel);
  return {
    requestedLevel: requested,
    maxLevel,
    grantedLevel,
    capped: grantedLevel < requested,
    reason: highRisk
      ? `High-risk category "${input.riskCategory ?? "high brand risk"}" — capped at Level ${maxLevel} (${AUTONOMY_LEVELS[maxLevel].label}); autopilot is never allowed here.`
      : `Granted Level ${grantedLevel} (${AUTONOMY_LEVELS[grantedLevel].label}). Nothing publishes above the approved brand/budget/compliance limits.`,
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo so the engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoCampaignArchitect() {
  return {
    architecture: buildArchitecture({ business: "Brixton Grill House", objective: "sales", budgetGbp: 2000 }),
    trends: [
      trendHijackGate({ trend: "viral 'grill flip' sound", category: "social_audio", business: "Brixton Grill House" }),
      trendHijackGate({ trend: "capitalising on a local disaster", category: "news_themes", business: "Brixton Grill House" }),
    ],
    autonomy: [
      autonomyGate({ requestedLevel: 4 }),
      autonomyGate({ riskCategory: "health", requestedLevel: 3 }),
    ],
  };
}
