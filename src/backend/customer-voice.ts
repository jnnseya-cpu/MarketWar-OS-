// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Customer Voice Intelligence + Product Backlog Bridge
// (Organic Dominance §21).
//
// Turns raw marketing/support/sales feedback into clustered voice-of-customer
// intelligence, then bridges a validated insight into an evidence-backed
// product requirement (problem → feature → acceptance criteria → priority).
//
// Deterministic so it works in demo mode with zero config. Every scored or
// derived value uses a seeded hash — NO Date.now(), NO new Date(), NO
// Math.random(). Doctrine: NEVER fabricate feedback, testimonials or reviews.
// The engine only clusters SUPPLIED items and labels every output an ESTIMATE.
// Where marketing sends/invites are implied, consent is required and touches
// are capped at 5 per rolling 7 days.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};
const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

// The twelve accepted sources of customer voice (§21).
export const INPUT_TYPES = [
  "reviews",
  "surveys",
  "support_tickets",
  "chats",
  "calls",
  "emails",
  "refund_reasons",
  "cancellation_reasons",
  "sales_objections",
  "lost_deal_notes",
  "product_feedback",
  "nps_comments",
] as const;

export type InputType = (typeof INPUT_TYPES)[number];

// Consent + frequency-cap doctrine for any marketing touch derived from voice.
export const CONSENT_DOCTRINE =
  "Any outbound touch derived from this voice intelligence requires prior consent and is capped at 5 touches per rolling 7 days per contact.";

export type VoiceItem = {
  text: string;
  type?: string;
  sentiment?: string; // optional caller-supplied label: positive | neutral | negative
};

export type VoiceInput = { items: VoiceItem[] };

export type PainTheme = {
  theme: string;
  count: number;
  examples: string[]; // verbatim supplied text — never fabricated
};

export type VoiceAnalysis = {
  disclaimer: string; // ESTIMATE label
  itemsAnalysed: number;
  topPains: PainTheme[];
  featureRequests: string[];
  defectionReasons: string[];
  priceObjections: string[];
  emotionalDrivers: string[];
  revenueAtRiskGbp: number; // ESTIMATE
  retentionOpportunities: string[];
  consentDoctrine: string;
};

// ---------------------------------------------------------------------------
// Theme taxonomy — deterministic keyword clustering (naive, transparent).
// ---------------------------------------------------------------------------
const THEMES: [string, RegExp][] = [
  ["speed/delivery", /\b(slow|late|delay|wait|speed|deliver|shipping|took (too )?long)\b/i],
  ["reliability/bugs", /\b(bug|crash|broke|broken|error|glitch|down|outage|fail)\b/i],
  ["price/value", /\b(price|pricing|expensive|cost|costly|too much|value|cheaper|afford)\b/i],
  ["usability/ux", /\b(confus|hard to|difficult|complicated|clunky|unintuitive|can'?t find|couldn'?t find)\b/i],
  ["support/service", /\b(support|service|response|reply|rude|unhelpful|ignored|no one|nobody)\b/i],
  ["features/missing", /\b(missing|no way to|wish|would love|please add|need|feature|lacks|doesn'?t have)\b/i],
  ["onboarding/setup", /\b(setup|set up|onboard|getting started|configure|install)\b/i],
  ["performance", /\b(lag|laggy|freeze|slow to load|performance|sluggish)\b/i],
];

// Signals that classify an item beyond the topic clusters.
const FEATURE_RE = /\b(wish|would love|please add|need|missing|feature request|it should|could you add|no way to)\b/i;
const DEFECTION_RE = /\b(cancel|cancell|refund|left|leaving|switch|churn|quit|unsubscrib|competitor|moved to|moving to)\b/i;
const PRICE_RE = /\b(price|pricing|expensive|cost|costly|too much|overpriced|value for money|cheaper|afford)\b/i;
const EMOTION_RE: [string, RegExp][] = [
  ["frustration", /\b(frustrat|annoyed|angry|fed up|furious|hate)\b/i],
  ["trust/safety", /\b(trust|secure|safe|scam|worried|reliable|confidence)\b/i],
  ["delight", /\b(love|amazing|brilliant|delight|fantastic|excellent|thrilled)\b/i],
  ["anxiety/effort", /\b(stress|anxious|overwhelm|too much effort|exhaust|struggle)\b/i],
  ["belonging", /\b(community|recommend|friends|team|together|belong)\b/i],
];

function naiveSentiment(item: VoiceItem): number {
  // Returns -1 (negative), 0 (neutral), 1 (positive). Prefers caller label.
  if (item.sentiment) {
    const s = item.sentiment.toLowerCase();
    if (s.startsWith("pos")) return 1;
    if (s.startsWith("neg")) return -1;
    return 0;
  }
  const pos = /\b(love|great|amazing|brilliant|excellent|happy|good|fast|easy|recommend|fantastic|perfect)\b/i.test(item.text);
  const neg = /\b(slow|late|bug|crash|broke|broken|hate|bad|awful|terrible|confus|expensive|refund|cancel|rude|poor|disappoint|frustrat)\b/i.test(item.text);
  if (neg && !pos) return -1;
  if (pos && !neg) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// analyseVoice — cluster supplied items into themes + §21 outputs.
// ---------------------------------------------------------------------------
export function analyseVoice(input: VoiceInput): VoiceAnalysis {
  const items = Array.isArray(input.items) ? input.items.filter((i) => i && typeof i.text === "string" && i.text.trim().length > 0) : [];

  // Cluster by keyword overlap against the theme taxonomy.
  const clusters = new Map<string, { count: number; examples: string[]; negWeight: number }>();
  for (const item of items) {
    const senti = naiveSentiment(item);
    for (const [theme, re] of THEMES) {
      if (re.test(item.text)) {
        const bucket = clusters.get(theme) || { count: 0, examples: [], negWeight: 0 };
        bucket.count += 1;
        if (bucket.examples.length < 3) bucket.examples.push(item.text.trim());
        if (senti < 0) bucket.negWeight += 1;
        clusters.set(theme, bucket);
      }
    }
  }

  // Top pains = negative-leaning clusters, ranked by count then negativity.
  const topPains: PainTheme[] = [...clusters.entries()]
    .filter(([, b]) => b.negWeight > 0)
    .sort((a, b) => b[1].count - a[1].count || b[1].negWeight - a[1].negWeight || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([theme, b]) => ({ theme, count: b.count, examples: b.examples }));

  const dedupe = (arr: string[]): string[] => [...new Set(arr)];

  const featureRequests = dedupe(items.filter((i) => FEATURE_RE.test(i.text)).map((i) => i.text.trim())).slice(0, 8);
  const defectionReasons = dedupe(items.filter((i) => DEFECTION_RE.test(i.text)).map((i) => i.text.trim())).slice(0, 8);
  const priceObjections = dedupe(items.filter((i) => PRICE_RE.test(i.text)).map((i) => i.text.trim())).slice(0, 8);

  const emotionalDrivers = EMOTION_RE
    .map(([label, re]) => ({ label, count: items.filter((i) => re.test(i.text)).length }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((e) => `${e.label} (${e.count} mention${e.count === 1 ? "" : "s"})`);

  // Revenue-at-risk ESTIMATE: deterministic, seeded from the defection/price
  // signal volume. NOT a promise — a transparent, reproducible proxy.
  const riskSignals = defectionReasons.length + priceObjections.length;
  const perSignalEstimate = 40 + (seed("customer-voice-risk") % 60); // £40–£99 per signal, fixed per build
  const revenueAtRiskGbp = riskSignals * perSignalEstimate;

  const retentionOpportunities: string[] = [];
  if (topPains[0]) retentionOpportunities.push(`Fix top pain "${topPains[0].theme}" (${topPains[0].count} mentions) — highest-leverage retention move (ESTIMATE).`);
  if (defectionReasons.length) retentionOpportunities.push(`Trigger a consented win-back sequence for ${defectionReasons.length} defection signal(s), capped at 5 touches / 7 days.`);
  if (priceObjections.length) retentionOpportunities.push(`Test value-framing or a right-sized tier against ${priceObjections.length} price objection(s).`);
  if (featureRequests.length) retentionOpportunities.push(`Bridge ${featureRequests.length} feature request(s) into the backlog via backlogBridge().`);
  if (retentionOpportunities.length === 0) retentionOpportunities.push("No acute risk signal in the supplied items — keep listening.");

  return {
    disclaimer: "ESTIMATE — clustered from SUPPLIED items only; no feedback is fabricated.",
    itemsAnalysed: items.length,
    topPains,
    featureRequests,
    defectionReasons,
    priceObjections,
    emotionalDrivers,
    revenueAtRiskGbp,
    retentionOpportunities,
    consentDoctrine: CONSENT_DOCTRINE,
  };
}

// ---------------------------------------------------------------------------
// backlogBridge — validated insight → evidence-backed product requirement.
// ---------------------------------------------------------------------------
export type BacklogInput = {
  theme: string;
  mentionVolume: number;
  segment?: string;
  revenueImpactGbp?: number;
};

export type ProductRequirement = {
  disclaimer: string;
  problemStatement: string;
  evidence: string;
  customerSegment: string;
  mentionVolume: number;
  revenueImpactGbp: number; // ESTIMATE
  proposedFeature: string;
  acceptanceCriteria: string[];
  priority: "P0" | "P1" | "P2" | "P3";
};

function prioritise(mentionVolume: number, revenueImpactGbp: number): "P0" | "P1" | "P2" | "P3" {
  // Deterministic priority from evidence weight + revenue ESTIMATE.
  const score = mentionVolume * 2 + revenueImpactGbp / 100;
  if (score >= 120) return "P0";
  if (score >= 50) return "P1";
  if (score >= 15) return "P2";
  return "P3";
}

export function backlogBridge(input: BacklogInput): ProductRequirement {
  const theme = (input.theme || "unspecified theme").trim();
  const mentionVolume = Number.isFinite(input.mentionVolume) && input.mentionVolume > 0 ? Math.floor(input.mentionVolume) : 0;
  const customerSegment = (input.segment && input.segment.trim()) || "all customers";
  const revenueImpactGbp = Number.isFinite(input.revenueImpactGbp as number) && (input.revenueImpactGbp as number) >= 0
    ? Math.round(input.revenueImpactGbp as number)
    : mentionVolume * (40 + (seed(`backlog:${theme}`) % 60)); // seeded ESTIMATE when unsupplied

  const priority = prioritise(mentionVolume, revenueImpactGbp);

  return {
    disclaimer: "ESTIMATE — revenue impact and priority are derived proxies, not measured facts.",
    problemStatement: `${customerSegment} repeatedly raise "${theme}" (${mentionVolume} mention${mentionVolume === 1 ? "" : "s"}), signalling unmet need or friction that threatens retention and conversion.`,
    evidence: `${mentionVolume} clustered mention${mentionVolume === 1 ? "" : "s"} of "${theme}" across supplied customer-voice sources (${INPUT_TYPES.length} channels). Evidence is aggregated from real supplied items — none fabricated.`,
    customerSegment,
    mentionVolume,
    revenueImpactGbp,
    proposedFeature: `Address "${theme}" for ${customerSegment}: ship the smallest change that removes the friction and measurably reduces mention volume.`,
    acceptanceCriteria: [
      `Given a ${customerSegment} user affected by "${theme}", when the fix ships, then the friction is removed on the primary path.`,
      `Mention volume for "${theme}" drops by a target margin within two measurement windows (ESTIMATE baseline: ${mentionVolume}).`,
      `No regression in adjacent flows; the change is behind a flag and reversible.`,
      `Outcome is instrumented so retention/revenue impact can be re-measured — no fabricated metrics.`,
    ],
    priority,
  };
}

// ---------------------------------------------------------------------------
// Demo — zero-config example over a supplied demo set.
// ---------------------------------------------------------------------------
export function demoCustomerVoice(): { analysis: VoiceAnalysis; backlogItem: ProductRequirement } {
  const demoItems: VoiceItem[] = [
    { text: "The app crashed twice this week and I lost my draft. Really frustrating.", type: "support_tickets", sentiment: "negative" },
    { text: "Delivery was slow and took too long, arrived cold.", type: "reviews", sentiment: "negative" },
    { text: "I wish there was a way to export my reports to PDF, that feature is missing.", type: "product_feedback" },
    { text: "Please add a dark mode, I would love that.", type: "nps_comments" },
    { text: "It's too expensive compared to competitors, I can't afford this pricing.", type: "sales_objections", sentiment: "negative" },
    { text: "Cancelling because I'm switching to a cheaper competitor.", type: "cancellation_reasons", sentiment: "negative" },
    { text: "Support ignored my email for days, no one replied.", type: "emails", sentiment: "negative" },
    { text: "Love the product, it's brilliant and the team is fantastic — highly recommend.", type: "reviews", sentiment: "positive" },
    { text: "The setup was confusing and hard to configure, couldn't find the settings.", type: "chats", sentiment: "negative" },
    { text: "Value for money is poor, the price is too much for what you get.", type: "refund_reasons", sentiment: "negative" },
  ];
  const analysis = analyseVoice({ items: demoItems });
  const top = analysis.topPains[0];
  const backlogItem = backlogBridge({
    theme: top ? top.theme : "reliability/bugs",
    mentionVolume: top ? top.count : 2,
    segment: "active paying customers",
    revenueImpactGbp: analysis.revenueAtRiskGbp,
  });
  return { analysis, backlogItem };
}
