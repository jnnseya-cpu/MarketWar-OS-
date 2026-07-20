// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Reputation & Crisis Command (Organic Dominance §19).
//
// Detects early reputation-warning signals from a stream of mentions, scores
// crisis severity across ten weighted factors, maps the result to a four-level
// escalation ladder (Monitor -> Respond -> Coordinate -> Executive), and hands
// back the human-run workflow for that level. Deterministic (every derived
// value is seeded off its inputs) so it runs in demo mode with zero config;
// live listening feeds plug in at go-live.
//
// Doctrine: honesty. Every severity/velocity number is an ESTIMATE, never a
// measured fact — we NEVER fabricate mentions, metrics, reviews or testimonials.
// No content is auto-published: higher levels REQUIRE human approval, and any
// outbound marketing send needs consent and a cap of 5 touches per 7 days.

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};

// ---------------------------------------------------------------------------
// Signal + factor vocabularies
// ---------------------------------------------------------------------------
export const WARNING_SIGNALS = [
  "sudden_negative_sentiment",
  "unusual_mention_volume",
  "viral_complaints",
  "executive_controversy",
  "product_safety",
  "employee_allegations",
  "misinformation",
  "fake_accounts",
  "impersonation",
  "boycott_language",
  "regulatory_discussion",
  "media_pickup",
  "influencer_criticism",
] as const;
export type WarningSignal = (typeof WARNING_SIGNALS)[number];

export const SEVERITY_FACTORS = [
  "mention_velocity",
  "negative_sentiment",
  "author_influence",
  "media_pickup",
  "geographic_spread",
  "claim_severity",
  "customer_impact",
  "legal_implications",
  "executive_involvement",
  "spread_probability",
] as const;
export type SeverityFactor = (typeof SEVERITY_FACTORS)[number];

// ---------------------------------------------------------------------------
// Crisis workflows — one human-run playbook per escalation level
// ---------------------------------------------------------------------------
export type CrisisLevel = 1 | 2 | 3 | 4;
export type CrisisWorkflow = {
  level: CrisisLevel;
  label: string;
  autoPublish: false; // never — reputation actions require human approval
  requiresHumanApproval: boolean;
  actions: string[];
};

export const CRISIS_WORKFLOWS: Record<CrisisLevel, CrisisWorkflow> = {
  1: {
    level: 1,
    label: "Monitor",
    autoPublish: false,
    requiresHumanApproval: false,
    actions: [
      "Observe the conversation without engaging",
      "Collect and log every mention with source + timestamp",
      "Hold — issue no public response yet",
    ],
  },
  2: {
    level: 2,
    label: "Respond",
    autoPublish: false,
    requiresHumanApproval: true,
    actions: [
      "Draft a public reply for human review before posting",
      "Assign a community manager as single point of contact",
      "Notify customer support to expect related tickets",
    ],
  },
  3: {
    level: 3,
    label: "Coordinate",
    autoPublish: false,
    requiresHumanApproval: true,
    actions: [
      "Open an incident room and assign an incident lead",
      "Notify communications, legal and leadership",
      "Freeze scheduled content and promotions",
      "Prepare a holding statement for human approval",
    ],
  },
  4: {
    level: 4,
    label: "Executive",
    autoPublish: false,
    requiresHumanApproval: true,
    actions: [
      "Stand up the executive crisis dashboard",
      "Build the stakeholder map (customers, staff, regulators, press, investors)",
      "Prepare media scripts and spokesperson briefing",
      "Publish a customer FAQ once approved",
      "Issue misinformation corrections against verified facts only",
      "Maintain an authoritative incident timeline",
      "Coordinate regulatory notification with legal",
    ],
  },
};

export const CRISIS_LEVEL_LABELS: Record<CrisisLevel, string> = {
  1: "Monitor",
  2: "Respond",
  3: "Coordinate",
  4: "Executive",
};

// ---------------------------------------------------------------------------
// Severity scoring
// ---------------------------------------------------------------------------
export type FactorScore = { factor: SeverityFactor; score: number };

export type CrisisSeverityInput = {
  factors?: Partial<Record<string, number>>;
  signals?: string[];
};

export type CrisisSeverityResult = {
  factorScores: FactorScore[];
  crisisSeverityScore: number; // 0-100 composite ESTIMATE
  level: CrisisLevel;
  levelLabel: string;
  detectedSignals: WarningSignal[];
  estimate: true;
  workflow: CrisisWorkflow;
};

const levelFromScore = (score: number): CrisisLevel => {
  if (score >= 75) return 4;
  if (score >= 50) return 3;
  if (score >= 25) return 2;
  return 1;
};

export function crisisSeverity(input: CrisisSeverityInput): CrisisSeverityResult {
  const supplied = input.factors ?? {};
  const signalList = Array.isArray(input.signals) ? input.signals : [];
  const detectedSignals = WARNING_SIGNALS.filter((s) => signalList.includes(s));

  // A signal load raises the seeded baseline for factors that lack a value.
  const signalPressure = clamp(detectedSignals.length * 6, 0, 40);

  const factorScores: FactorScore[] = SEVERITY_FACTORS.map((factor) => {
    const given = supplied[factor];
    const score = typeof given === "number" && Number.isFinite(given)
      ? clamp(given)
      : clamp((seed(`crisis::${factor}::${signalList.join(",")}`) % 61) + signalPressure);
    return { factor, score };
  });

  const total = factorScores.reduce((sum, f) => sum + f.score, 0);
  const crisisSeverityScore = clamp(total / factorScores.length);
  const level = levelFromScore(crisisSeverityScore);

  return {
    factorScores,
    crisisSeverityScore,
    level,
    levelLabel: CRISIS_LEVEL_LABELS[level],
    detectedSignals,
    estimate: true,
    workflow: CRISIS_WORKFLOWS[level],
  };
}

// ---------------------------------------------------------------------------
// Early warning — scan a mention stream for warning signals
// ---------------------------------------------------------------------------
export type Mention = { text: string; sentiment?: string; authorReach?: number };

export type CrisisAlert = { signal: WarningSignal; detail: string };

export type EarlyWarningResult = {
  alerts: CrisisAlert[];
  negativeEstimate: number; // 0-100 share of negative mentions (ESTIMATE)
  velocityEstimate: number; // 0-100 volume-pressure ESTIMATE
  recommendedLevel: CrisisLevel;
  recommendedLevelLabel: string;
  estimate: true;
};

// Keyword cues per signal — a lightweight, deterministic scan.
const SIGNAL_CUES: Record<WarningSignal, string[]> = {
  sudden_negative_sentiment: ["angry", "furious", "disappointed", "worst"],
  unusual_mention_volume: ["everyone", "trending", "blowing up"],
  viral_complaints: ["viral", "shared", "retweet", "spreading"],
  executive_controversy: ["ceo", "founder", "executive"],
  product_safety: ["unsafe", "danger", "injury", "recall", "defect"],
  employee_allegations: ["employee", "worker", "harassment", "toxic"],
  misinformation: ["false", "fake news", "not true", "misleading"],
  fake_accounts: ["fake account", "bot", "sockpuppet"],
  impersonation: ["impersonat", "pretending to be", "fake profile"],
  boycott_language: ["boycott", "cancel", "never buy", "delete"],
  regulatory_discussion: ["regulator", "lawsuit", "illegal", "compliance", "fine"],
  media_pickup: ["journalist", "press", "article", "reporter", "news"],
  influencer_criticism: ["influencer", "creator", "review", "callout"],
};

export function earlyWarning(mentions: Mention[]): EarlyWarningResult {
  const list = Array.isArray(mentions) ? mentions : [];
  const alerts: CrisisAlert[] = [];

  const corpus = list.map((m) => (typeof m.text === "string" ? m.text.toLowerCase() : "")).join(" \n ");

  for (const signal of WARNING_SIGNALS) {
    const hit = SIGNAL_CUES[signal].find((cue) => corpus.includes(cue));
    if (hit) {
      alerts.push({ signal, detail: `Matched cue "${hit}" in the mention stream (ESTIMATE)` });
    }
  }

  const negativeCount = list.filter((m) => {
    const s = typeof m.sentiment === "string" ? m.sentiment.toLowerCase() : "";
    return s === "negative" || s === "very_negative";
  }).length;
  const negativeEstimate = list.length > 0 ? clamp((negativeCount / list.length) * 100) : 0;

  const reachPressure = list.reduce((sum, m) => sum + (typeof m.authorReach === "number" ? m.authorReach : 0), 0);
  const velocityEstimate = clamp(list.length * 8 + reachPressure / 5000);

  const composite = clamp(negativeEstimate * 0.4 + velocityEstimate * 0.3 + alerts.length * 8);
  const recommendedLevel = levelFromScore(composite);

  return {
    alerts,
    negativeEstimate,
    velocityEstimate,
    recommendedLevel,
    recommendedLevelLabel: CRISIS_LEVEL_LABELS[recommendedLevel],
    estimate: true,
  };
}

// ---------------------------------------------------------------------------
// Demo — a fully-populated high-severity example (zero-config)
// ---------------------------------------------------------------------------
export function demoCrisis(): {
  severity: CrisisSeverityResult;
  earlyWarning: EarlyWarningResult;
} {
  const severity = crisisSeverity({
    factors: {
      mention_velocity: 88,
      negative_sentiment: 82,
      author_influence: 70,
      media_pickup: 76,
      geographic_spread: 64,
      claim_severity: 85,
      customer_impact: 78,
      legal_implications: 72,
      executive_involvement: 60,
      spread_probability: 80,
    },
    signals: ["viral_complaints", "product_safety", "media_pickup", "boycott_language"],
  });

  const warning = earlyWarning([
    { text: "This is going viral — the product is unsafe and caused an injury", sentiment: "very_negative", authorReach: 240000 },
    { text: "Journalists are picking this up, expect an article soon", sentiment: "negative", authorReach: 80000 },
    { text: "Time to boycott and delete the app", sentiment: "negative", authorReach: 12000 },
  ]);

  return { severity, earlyWarning: warning };
}
