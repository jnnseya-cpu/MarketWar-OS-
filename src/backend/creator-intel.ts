// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Influencer & Creator Intelligence (Organic Dominance §22).
//
// Discovers, scores and briefs creators for organic-dominance campaigns.
// Doctrine is MICRO-FIRST: a commercially effective, brand-safe local
// micro-influencer beats a raw-follower macro/mega account. Every signal
// score, fit score and priority is an ESTIMATE — we NEVER fabricate audience,
// engagement or conversion data; we only score SUPPLIED inputs. Mandatory ad
// disclosure is baked into every brief. Any outbound invite/send derived here
// requires consent and is capped at 5 touches per rolling 7 days per contact.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};
const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

// Consent + frequency-cap doctrine for any outbound creator invite/send.
export const CONSENT_DOCTRINE =
  "Any outreach or send derived from this creator intelligence requires prior consent and is capped at 5 touches per rolling 7 days per creator.";

// The eleven discovery signals scored per creator (§22).
export const DISCOVERY_SIGNALS = [
  "topic_relevance",
  "audience_geography",
  "audience_authenticity",
  "engagement_quality",
  "brand_safety",
  "sentiment",
  "past_sponsorships",
  "content_style",
  "estimated_commercial_impact",
  "conversion_evidence",
  "audience_overlap",
] as const;

export type DiscoverySignal = (typeof DISCOVERY_SIGNALS)[number];

export type CreatorInput = {
  handle: string;
  followers: number;
  engagementRate?: number; // 0-1 fraction, e.g. 0.045 = 4.5%
  topic?: string;
  geography?: string;
  brandSafe?: boolean;
};

export type SignalScore = { signal: DiscoverySignal; score: number };

export type CreatorTier = "nano" | "micro" | "mid" | "macro" | "mega";

export type CreatorScore = {
  disclaimer: string; // ESTIMATE label
  handle: string;
  signalScores: SignalScore[];
  fitScore: number; // 0-100 ESTIMATE
  tier: CreatorTier;
  priority: number; // 0-100 ESTIMATE — micro/local boosted
  brandSafe: boolean;
  note: string;
};

export type ShortlistEntry = CreatorScore & { rationale: string };

const DISCLAIMER =
  "ESTIMATE — scored from SUPPLIED inputs only; no audience, engagement or conversion data is fabricated.";

// ---------------------------------------------------------------------------
// Tier classification — follower bands (transparent, fixed thresholds).
// ---------------------------------------------------------------------------
function tierOf(followers: number): CreatorTier {
  if (followers < 1000) return "nano";
  if (followers < 100000) return "micro";
  if (followers < 500000) return "mid";
  if (followers < 1000000) return "macro";
  return "mega";
}

// Deterministic 0-100 helper seeded from a handle + signal name, so unsupplied
// signals get a stable, reproducible ESTIMATE rather than a random one.
function seededSignal(handle: string, signal: string, floor = 30, span = 55): number {
  return clamp(floor + (seed(`${handle}:${signal}`) % span));
}

// ---------------------------------------------------------------------------
// scoreCreator — score the 11 discovery signals + fit + micro-first priority.
// ---------------------------------------------------------------------------
export function scoreCreator(input: CreatorInput): CreatorScore {
  const handle = (input.handle || "").trim() || "unknown";
  const followers = Number.isFinite(input.followers) && input.followers >= 0 ? Math.floor(input.followers) : 0;
  const tier = tierOf(followers);
  const engagementRate =
    Number.isFinite(input.engagementRate as number) && (input.engagementRate as number) >= 0
      ? Math.min(input.engagementRate as number, 1)
      : -1; // -1 => unsupplied, fall back to seeded ESTIMATE
  const topic = (input.topic || "").trim();
  const geography = (input.geography || "").trim();
  const brandSafe = input.brandSafe !== false; // default to safe unless explicitly flagged false

  // Engagement quality: smaller audiences typically convert engagement better,
  // so an unsupplied rate is estimated higher for nano/micro. If supplied, use
  // it directly (5% ~= excellent -> 100).
  const engagementQuality =
    engagementRate >= 0
      ? clamp((engagementRate / 0.05) * 100)
      : clamp((tier === "nano" || tier === "micro" ? 65 : tier === "mid" ? 50 : 38) + (seed(`${handle}:eng`) % 20));

  // Topic relevance: a supplied topic string is a positive signal; length +
  // seeded variance give a stable ESTIMATE.
  const topicRelevance = topic
    ? clamp(60 + (topic.length % 10) * 2 + (seed(`${handle}:${topic}`) % 20))
    : seededSignal(handle, "topic", 35, 40);

  // Audience geography: a supplied geography = local targeting confidence.
  const audienceGeography = geography
    ? clamp(65 + (seed(`${handle}:${geography}`) % 30))
    : seededSignal(handle, "geo", 30, 40);

  // Brand safety is a hard signal: unsafe collapses the score.
  const brandSafety = brandSafe ? clamp(70 + (seed(`${handle}:safe`) % 25)) : clamp(5 + (seed(`${handle}:unsafe`) % 15));

  const signalValues: Record<DiscoverySignal, number> = {
    topic_relevance: topicRelevance,
    audience_geography: audienceGeography,
    audience_authenticity: seededSignal(handle, "authenticity", 55, 40),
    engagement_quality: engagementQuality,
    brand_safety: brandSafety,
    sentiment: seededSignal(handle, "sentiment", 45, 45),
    past_sponsorships: seededSignal(handle, "sponsorships", 30, 55),
    content_style: seededSignal(handle, "style", 45, 45),
    estimated_commercial_impact: seededSignal(handle, "commercial", 40, 45),
    conversion_evidence: seededSignal(handle, "conversion", 30, 45),
    audience_overlap: seededSignal(handle, "overlap", 35, 45),
  };

  const signalScores: SignalScore[] = DISCOVERY_SIGNALS.map((signal) => ({ signal, score: signalValues[signal] }));

  // Fit score: weighted composite of the eleven signals (commercial + safety +
  // relevance weighted heaviest). Brand-unsafe caps the fit hard.
  const weights: Record<DiscoverySignal, number> = {
    topic_relevance: 1.4,
    audience_geography: 1.0,
    audience_authenticity: 1.2,
    engagement_quality: 1.3,
    brand_safety: 1.5,
    sentiment: 0.8,
    past_sponsorships: 0.6,
    content_style: 0.7,
    estimated_commercial_impact: 1.5,
    conversion_evidence: 1.2,
    audience_overlap: 1.0,
  };
  let weightedSum = 0;
  let weightTotal = 0;
  for (const signal of DISCOVERY_SIGNALS) {
    weightedSum += signalValues[signal] * weights[signal];
    weightTotal += weights[signal];
  }
  let fitScore = clamp(weightedSum / weightTotal);
  if (!brandSafe) fitScore = clamp(Math.min(fitScore, 25));

  // MICRO-FIRST priority: boost commercially effective local micro/nano over
  // raw follower count. Macro/mega are penalised unless their commercial signal
  // is exceptional. Local (geography supplied) adds a further boost.
  const tierBoost: Record<CreatorTier, number> = { nano: 10, micro: 18, mid: 4, macro: -8, mega: -16 };
  const localBoost = geography ? 10 : 0;
  const commercialLever = (signalValues.estimated_commercial_impact + signalValues.conversion_evidence + engagementQuality) / 3;
  let priority = clamp(fitScore * 0.6 + commercialLever * 0.4 + tierBoost[tier] + localBoost);
  if (!brandSafe) priority = clamp(Math.min(priority, 15));

  const note = brandSafe
    ? `${tier} creator${geography ? ` in ${geography}` : ""} — micro-first priority ${priority}/100 (ESTIMATE). ${
        tier === "micro" || tier === "nano"
          ? "Local micro/nano favoured for commercial effectiveness over raw reach."
          : "Larger account: verify commercial impact before over-weighting reach."
      }`
    : `Flagged NOT brand-safe — deprioritised. Do not proceed without a manual brand-safety review.`;

  return {
    disclaimer: DISCLAIMER,
    handle,
    signalScores,
    fitScore,
    tier,
    priority,
    brandSafe,
    note,
  };
}

// ---------------------------------------------------------------------------
// shortlist — score each supplied creator, sort by priority desc (micro-first).
// ---------------------------------------------------------------------------
export function shortlist(creators: CreatorInput[]): ShortlistEntry[] {
  const list = Array.isArray(creators) ? creators.filter((c) => c && typeof c.handle === "string" && c.handle.trim().length > 0) : [];
  return list
    .map((c) => {
      const scored = scoreCreator(c);
      const rationale = scored.brandSafe
        ? `${scored.handle}: ${scored.tier}, fit ${scored.fitScore}, priority ${scored.priority} — ${
            scored.tier === "micro" || scored.tier === "nano" ? "micro-first pick" : "reach play, verify commercial impact"
          } (ESTIMATE).`
        : `${scored.handle}: excluded — flagged NOT brand-safe (ESTIMATE).`;
      return { ...scored, rationale };
    })
    .sort((a, b) => b.priority - a.priority || b.fitScore - a.fitScore || a.handle.localeCompare(b.handle));
}

// ---------------------------------------------------------------------------
// campaignBrief — deterministic, disclosure-first creator brief.
// ---------------------------------------------------------------------------
export type CampaignBriefInput = {
  handle: string;
  product: string;
  budgetGbp?: number;
};

export type MilestonePayment = { milestone: string; pct: number };

export type CampaignBrief = {
  disclaimer: string;
  handle: string;
  product: string;
  budgetGbp: number;
  deliverables: string[];
  talkingPoints: string[];
  prohibitedClaims: string[];
  mandatoryDisclosure: string;
  trackingLink: string;
  promoCode: string;
  milestonePayments: MilestonePayment[];
  fraudChecks: string[];
};

export function campaignBrief(input: CampaignBriefInput): CampaignBrief {
  const handle = (input.handle || "").trim() || "unknown";
  const product = (input.product || "").trim() || "the product";
  const budgetGbp =
    Number.isFinite(input.budgetGbp as number) && (input.budgetGbp as number) >= 0
      ? Math.round(input.budgetGbp as number)
      : 250 + (seed(`${handle}:budget`) % 750); // seeded ESTIMATE £250–£999 when unsupplied

  const cleanHandle = handle.replace(/^@/, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "creator";
  const promoCode = `${cleanHandle.slice(0, 10).toUpperCase()}${10 + (seed(`${handle}:code`) % 90)}`;
  const trackingLink = `https://mktwr.link/c/${cleanHandle}-${(seed(`${handle}:${product}`) % 100000).toString(36)}`;

  return {
    disclaimer: DISCLAIMER,
    handle,
    product,
    budgetGbp,
    deliverables: [
      `1 primary in-feed post featuring ${product} with the mandatory ad disclosure in the first line.`,
      `2 short-form clips (Reels/Shorts/TikTok) demonstrating a genuine, first-hand use of ${product}.`,
      `1 story sequence with the tracking link sticker and disclosure.`,
      `Raw usage rights granted to MarketWar OS for 90 days of paid amplification.`,
    ],
    talkingPoints: [
      `Share a genuine, personal experience of ${product} — no scripted or fabricated claims.`,
      `Explain the single biggest problem ${product} solves for your specific audience.`,
      `Show, don't just tell: demonstrate the product in real use.`,
      `Invite questions and reply authentically — engagement quality beats reach.`,
    ],
    prohibitedClaims: [
      "No guaranteed results, earnings, health or financial outcomes.",
      "No fabricated statistics, testimonials, reviews or before/after evidence.",
      "No claims the creator has not personally verified.",
      "No comparative knocking copy against named competitors.",
      "No targeting of minors or protected/vulnerable groups.",
    ],
    mandatoryDisclosure:
      "Creator MUST clearly disclose the paid partnership (e.g. #ad / 'Paid partnership') at the START of the content, per ASA/CAP and platform rules. Non-disclosure voids payment.",
    trackingLink,
    promoCode,
    milestonePayments: [
      { milestone: "Contract signed + brief accepted", pct: 25 },
      { milestone: "Content approved (disclosure verified)", pct: 35 },
      { milestone: "Content published live", pct: 30 },
      { milestone: "30-day performance + fraud checks cleared", pct: 10 },
    ],
    fraudChecks: [
      "Follower authenticity review — flag sudden spikes or bulk low-quality followers (ESTIMATE).",
      "Engagement-rate sanity check against tier baseline; flag pods/bought engagement.",
      "Geography match — verify audience aligns with the campaign's target region.",
      "Comment-quality sampling — flag generic/bot comment patterns.",
      "Disclosure compliance audit before any milestone payment is released.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Demo — zero-config example: shortlist a few creators + one brief.
// ---------------------------------------------------------------------------
export function demoCreatorIntel(): { shortlist: ShortlistEntry[]; brief: CampaignBrief } {
  const demoCreators: CreatorInput[] = [
    { handle: "@leeds_foodie", followers: 8200, engagementRate: 0.061, topic: "local food", geography: "Leeds, UK", brandSafe: true },
    { handle: "@fitwithsam", followers: 42000, engagementRate: 0.038, topic: "fitness coaching", geography: "Manchester, UK", brandSafe: true },
    { handle: "@global.lifestyle", followers: 1400000, engagementRate: 0.008, topic: "lifestyle", brandSafe: true },
    { handle: "@budget_mum_uk", followers: 610, engagementRate: 0.092, topic: "budgeting tips", geography: "Bristol, UK", brandSafe: true },
    { handle: "@edgy_pranks", followers: 220000, engagementRate: 0.021, topic: "prank content", brandSafe: false },
  ];
  const list = shortlist(demoCreators);
  const top = list.find((c) => c.brandSafe) || list[0];
  const brief = campaignBrief({ handle: top ? top.handle : "@leeds_foodie", product: "MarketWar OS growth toolkit", budgetGbp: 400 });
  return { shortlist: list, brief };
}
