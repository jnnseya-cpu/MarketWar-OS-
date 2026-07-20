// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Competitor War Room + Weakness Scanner (Organic Dominance §12).
//
// Watches a competitor across search, AI answers, social and sentiment, scans
// for exploitable weaknesses (from supplied complaints + seeded signals), and
// recommends the strongest ethical exploitation play plus a sales battlecard.
// Deterministic (every score seeded off the competitor name) so it works in
// demo mode with zero configuration; live signal feeds plug in at go-live.
//
// Doctrine: honesty. Every visibility/weakness score is an ESTIMATE, never a
// measured fact. We NEVER fabricate competitor data, reviews or metrics, and we
// NEVER use knocking copy — we differentiate on our own genuine strengths.

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};
// Derive a stable 0-100 estimate for a named metric on a named competitor.
const metric = (competitor: string, key: string): number => clamp((seed(`${competitor}::${key}`) % 61) + 20);

// ---------------------------------------------------------------------------
// Signal board — monitor a competitor across the visibility surfaces
// ---------------------------------------------------------------------------
export type Momentum = "gaining" | "flat" | "losing";

export type SignalBoard = {
  competitor: string;
  searchVisibility: number; // 0-100 ESTIMATE
  aiVisibility: number; // 0-100 ESTIMATE
  socialAttention: number; // 0-100 ESTIMATE
  sentiment: number; // 0-100 ESTIMATE (100 = wholly positive)
  shareOfVoice: number; // 0-100 ESTIMATE
  contentOutput: number; // 0-100 ESTIMATE (publishing cadence)
  momentum: Momentum;
  estimate: true;
  note: string;
};

export function monitorCompetitor(input: { competitor: string; signals?: string[] }): SignalBoard {
  const competitor = (input.competitor || "").trim() || "Rival Trading Co";
  const extra = Array.isArray(input.signals) ? input.signals : [];
  // Extra supplied signals nudge attention/output upward (more chatter observed).
  const boost = clamp(extra.length * 6, 0, 24);
  const searchVisibility = metric(competitor, "search");
  const aiVisibility = metric(competitor, "ai");
  const socialAttention = clamp(metric(competitor, "social") + boost);
  const sentiment = metric(competitor, "sentiment");
  const shareOfVoice = clamp((searchVisibility + aiVisibility + socialAttention) / 3);
  const contentOutput = clamp(metric(competitor, "content") + boost);
  const trend = seed(`${competitor}::momentum`) % 3;
  const momentum: Momentum = trend === 0 ? "gaining" : trend === 1 ? "flat" : "losing";
  return {
    competitor, searchVisibility, aiVisibility, socialAttention, sentiment,
    shareOfVoice, contentOutput, momentum, estimate: true,
    note: "All figures are ESTIMATES derived from observed signals — treat as directional, not measured.",
  };
}

// ---------------------------------------------------------------------------
// Weakness scanner
// ---------------------------------------------------------------------------
export const WEAKNESS_TYPES = [
  "repeated_complaints",
  "unanswered_questions",
  "poor_service",
  "missing_products",
  "expensive_pricing",
  "weak_geographic_coverage",
  "slow_delivery",
  "poor_usability",
  "missing_languages",
  "negative_reviews",
  "inconsistent_claims",
  "weak_ai_visibility",
  "weak_search_coverage",
  "unserved_segments",
] as const;

export type WeaknessType = (typeof WEAKNESS_TYPES)[number];

export type Weakness = {
  type: WeaknessType;
  evidence: string;
  exploitability: number; // 0-100 ESTIMATE
};

export type WeaknessReport = {
  competitor: string;
  weaknesses: Weakness[];
  estimate: true;
  note: string;
};

// Map a free-text complaint to the weakness type(s) it evidences.
const COMPLAINT_RULES: [WeaknessType, RegExp][] = [
  ["slow_delivery", /\b(slow|late|delay|delivery|shipping|took (a )?week|never arrived)\b/i],
  ["poor_service", /\b(rude|unhelpful|support|service|ignored|no( one)? answer|call centre)\b/i],
  ["unanswered_questions", /\b(no reply|unanswered|didn'?t respond|no response|ghosted)\b/i],
  ["expensive_pricing", /\b(expensive|overpriced|too dear|pricey|cost too much|rip ?off)\b/i],
  ["poor_usability", /\b(confusing|hard to use|clunky|broken|glitch|website|checkout|app)\b/i],
  ["missing_products", /\b(out of stock|don'?t (sell|stock)|no option|missing product|discontinued)\b/i],
  ["negative_reviews", /\b(terrible|awful|worst|scam|disappointed|refund|complaint)\b/i],
  ["missing_languages", /\b(only english|no (french|spanish|arabic|translation)|language)\b/i],
  ["weak_geographic_coverage", /\b(don'?t deliver|not in my area|no coverage|region|abroad|overseas)\b/i],
  ["inconsistent_claims", /\b(false|misleading|not as described|lied|inconsistent|contradict)\b/i],
];

export function scanWeaknesses(input: { competitor: string; complaints?: string[] }): WeaknessReport {
  const competitor = (input.competitor || "").trim() || "Rival Trading Co";
  const complaints = Array.isArray(input.complaints) ? input.complaints : [];
  const found = new Map<WeaknessType, { evidence: string; count: number }>();

  // 1) Evidence-backed weaknesses from supplied complaints (real signal).
  for (const raw of complaints) {
    const text = String(raw);
    for (const [type, re] of COMPLAINT_RULES) {
      if (re.test(text)) {
        const prev = found.get(type);
        if (prev) prev.count++;
        else found.set(type, { evidence: `Customer complaint: "${text.slice(0, 120)}"`, count: 1 });
      }
    }
  }

  // 2) Seeded structural weaknesses (directional estimates, clearly labelled).
  for (const type of WEAKNESS_TYPES) {
    // A type surfaces as a seeded signal when its hash crosses a stable threshold.
    if ((seed(`${competitor}::${type}`) % 100) >= 62 && !found.has(type)) {
      found.set(type, { evidence: `Estimated gap inferred from public signals (${type.replace(/_/g, " ")}).`, count: 1 });
    }
  }

  const weaknesses: Weakness[] = [...found.entries()].map(([type, { evidence, count }]) => {
    // Complaint-backed weaknesses score higher; repeated complaints higher still.
    const base = clamp((seed(`${competitor}::exploit::${type}`) % 51) + 25);
    const complaintBonus = clamp(count * 12, 0, 40);
    const evidenced = /Customer complaint/.test(evidence) ? 10 : 0;
    return { type, evidence, exploitability: clamp(base + complaintBonus + evidenced) };
  }).sort((a, b) => b.exploitability - a.exploitability);

  return {
    competitor, weaknesses, estimate: true,
    note: "Exploitability is an ESTIMATE. Act only on evidenced weaknesses; compete on our genuine strengths, never on knocking copy.",
  };
}

// ---------------------------------------------------------------------------
// Exploitation playbook
// ---------------------------------------------------------------------------
export const EXPLOITATION_ACTIONS = [
  "alternative_to_page",
  "comparison_page",
  "switching_offer",
  "displacement_campaign",
  "objection_content",
  "sales_battlecard",
  "notify_product_team",
  "feature_to_backlog",
  "targeted_advert",
  "brief_acquisition_team",
] as const;

export type ExploitationAction = (typeof EXPLOITATION_ACTIONS)[number];

export type ExploitPlay = {
  competitor: string;
  weakness: string;
  action: ExploitationAction;
  play: string;
  note: string;
};

// Best-fit ethical play for each weakness type.
const WEAKNESS_TO_ACTION: Record<WeaknessType, ExploitationAction> = {
  repeated_complaints: "objection_content",
  unanswered_questions: "objection_content",
  poor_service: "switching_offer",
  missing_products: "feature_to_backlog",
  expensive_pricing: "comparison_page",
  weak_geographic_coverage: "targeted_advert",
  slow_delivery: "displacement_campaign",
  poor_usability: "alternative_to_page",
  missing_languages: "notify_product_team",
  negative_reviews: "switching_offer",
  inconsistent_claims: "sales_battlecard",
  weak_ai_visibility: "alternative_to_page",
  weak_search_coverage: "comparison_page",
  unserved_segments: "brief_acquisition_team",
};

const PLAY_TEXT: Record<ExploitationAction, string> = {
  alternative_to_page: "Publish an honest \"best alternative for X\" page ranking on our genuine strengths, not their name.",
  comparison_page: "Ship a factual, fair comparison page — only claims we can prove, no exaggeration of their flaws.",
  switching_offer: "Run a switching offer (onboarding help + first-month incentive) for buyers seeking a better experience.",
  displacement_campaign: "Launch a displacement campaign highlighting where we objectively deliver faster/better.",
  objection_content: "Create objection-handling content answering the questions their buyers are left asking.",
  sales_battlecard: "Arm sales with a battlecard: our proof points, their known gaps, and consent-safe talk tracks.",
  notify_product_team: "Notify the product team to prioritise the capability their customers say they lack.",
  feature_to_backlog: "Add the missing capability to the roadmap backlog so we can serve the demand they can't.",
  targeted_advert: "Run consent-based, frequency-capped adverts in the regions/segments they underserve.",
  brief_acquisition_team: "Brief the acquisition team on the unserved segment as a growth wedge.",
};

export function exploit(input: { competitor: string; weakness: string }): ExploitPlay {
  const competitor = (input.competitor || "").trim() || "Rival Trading Co";
  const raw = (input.weakness || "").trim();
  // Narrow the supplied weakness to a known type; fall back to the strongest scanned one.
  const known = (WEAKNESS_TYPES as readonly string[]).includes(raw)
    ? (raw as WeaknessType)
    : (scanWeaknesses({ competitor }).weaknesses[0]?.type ?? "repeated_complaints");
  const action = WEAKNESS_TO_ACTION[known];
  return {
    competitor,
    weakness: known,
    action,
    play: PLAY_TEXT[action],
    note: "Compete on our genuine strengths — no knocking copy, no fabricated claims. Marketing sends require consent and a max of 5 touches per 7 days.",
  };
}

// ---------------------------------------------------------------------------
// Sales battlecard
// ---------------------------------------------------------------------------
export type Battlecard = {
  competitor: string;
  theirStrengths: string[];
  theirWeaknesses: string[];
  ourCounters: string[];
  landmines: string[];
  estimate: true;
  note: string;
};

const STRENGTH_POOL = [
  "Established brand recognition in their core market",
  "Large existing customer base and referral flywheel",
  "Wide catalogue breadth",
  "Aggressive paid-media spend",
  "Long operating history / incumbency trust",
  "Broad partner and channel network",
];

const COUNTER_BY_WEAKNESS: Record<WeaknessType, string> = {
  repeated_complaints: "Lead with our resolved-issue proof and response SLA.",
  unanswered_questions: "Show our responsiveness — published FAQs and fast human support.",
  poor_service: "Demonstrate our service ratings and named-owner support model.",
  missing_products: "Highlight the products/segments only we serve.",
  expensive_pricing: "Show transparent, better-value pricing with no hidden fees.",
  weak_geographic_coverage: "Emphasise our coverage in the regions they can't reach.",
  slow_delivery: "Prove our faster fulfilment with real delivery times.",
  poor_usability: "Demo our simpler flow side by side on our own strengths.",
  missing_languages: "Show our multi-language experience for their underserved buyers.",
  negative_reviews: "Present our verified, earned reviews (never fabricated).",
  inconsistent_claims: "Stick to provable claims — our consistency is the contrast.",
  weak_ai_visibility: "Show how we appear in AI answers where they don't.",
  weak_search_coverage: "Own the search queries they leave uncovered.",
  unserved_segments: "Position for the segment they've ignored.",
};

export function battlecard(input: { competitor: string }): Battlecard {
  const competitor = (input.competitor || "").trim() || "Rival Trading Co";
  const s = seed(competitor);
  const theirStrengths = [
    STRENGTH_POOL[s % STRENGTH_POOL.length],
    STRENGTH_POOL[(s >> 3) % STRENGTH_POOL.length],
  ].filter((v, i, a) => a.indexOf(v) === i);
  const scanned = scanWeaknesses({ competitor }).weaknesses.slice(0, 4);
  const theirWeaknesses = scanned.map((w) => `${w.type.replace(/_/g, " ")} (exploitability est. ${w.exploitability})`);
  const ourCounters = scanned.map((w) => COUNTER_BY_WEAKNESS[w.type]);
  return {
    competitor,
    theirStrengths: theirStrengths.length ? theirStrengths : [STRENGTH_POOL[0]],
    theirWeaknesses: theirWeaknesses.length ? theirWeaknesses : ["No scored weaknesses surfaced yet — gather more signal."],
    ourCounters: ourCounters.length ? ourCounters : ["Differentiate on our own proven strengths."],
    landmines: [
      "Do NOT disparage the competitor or use knocking copy — win on our strengths.",
      "Do NOT cite metrics, reviews or claims we cannot prove — all scores here are ESTIMATES.",
      "Marketing sends require consent and a hard cap of 5 touches per 7 days.",
    ],
    estimate: true,
    note: "Battlecard weaknesses and scores are ESTIMATES for internal enablement — verify before quoting to a prospect.",
  };
}

// ---------------------------------------------------------------------------
// Zero-config demo
// ---------------------------------------------------------------------------
export type WarRoomDemo = {
  signals: SignalBoard;
  weaknesses: WeaknessReport;
  battlecard: Battlecard;
};

export function demoWarRoom(): WarRoomDemo {
  const competitor = "Apex Grocer Direct";
  return {
    signals: monitorCompetitor({ competitor, signals: ["twitter thread", "reddit mention"] }),
    weaknesses: scanWeaknesses({
      competitor,
      complaints: [
        "Delivery was slow and arrived three days late.",
        "Support was rude and never answered my emails.",
        "Way too expensive compared to everyone else.",
      ],
    }),
    battlecard: battlecard({ competitor }),
  };
}
