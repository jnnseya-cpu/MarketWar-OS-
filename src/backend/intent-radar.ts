// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Buying Intent Radar (Apollo-class B2B intent) — the DemandWar Room.
//
// Scores how ready a TARGET COMPANY is to buy, from the signals we are given.
// Distinct from src/backend/intent-router.ts (which routes USER REQUESTS to
// tools); this reads B2B BUYING intent across ten signal types and returns an
// ESTIMATE with a "why now" and an offer angle. Deterministic + demo-safe: all
// sub-scores are derived by hashing the company name + provided signals, so the
// same input always yields the same radar. House doctrine: every number is a
// labelled ESTIMATE; we never invent signals the caller did not supply.

const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

// ---------------------------------------------------------------------------
// Intent taxonomy — exactly these ten B2B buying-intent signal types
// ---------------------------------------------------------------------------
export const INTENT_TYPES = [
  "topic",
  "search",
  "hiring",
  "funding",
  "expansion",
  "competitor",
  "technology_change",
  "tender_procurement",
  "news_trigger",
  "website_change",
] as const;

export type IntentType = (typeof INTENT_TYPES)[number];

// Keyword cues that push a raw signal string toward a given intent type.
const TYPE_CUES: Record<IntentType, string[]> = {
  topic: ["topic", "research", "content", "whitepaper", "guide", "webinar", "downloaded"],
  search: ["search", "searched", "keyword", "query", "google", "serp"],
  hiring: ["hiring", "hire", "job", "recruit", "vacancy", "new cto", "new cmo", "head of", "role", "headcount"],
  funding: ["funding", "raised", "round", "series a", "series b", "seed", "investment", "vc", "capital"],
  expansion: ["expansion", "expanding", "new office", "new market", "opening", "growth", "scaling", "international"],
  competitor: ["competitor", "switching", "alternative", "vs ", "replace", "churn", "unhappy with"],
  technology_change: ["technology", "tech stack", "migration", "adopted", "implementing", "replatform", "deprecated", "integration"],
  tender_procurement: ["tender", "procurement", "rfp", "rfq", "bid", "framework", "contract award", "public sector"],
  news_trigger: ["news", "announcement", "press", "acquisition", "merger", "launch", "award", "regulatory"],
  website_change: ["website", "pricing page", "relaunch", "redesign", "new page", "landing page", "site change"],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type CompanySignals = {
  company: string;
  signals?: string[];
  sector?: string;
  sizeEmployees?: number;
};

export type SubScore = { type: IntentType; score: number };

export type IntentLevel = "cold" | "warm" | "hot";

export type IntentResult = {
  company: string;
  subScores: SubScore[];
  intentScore: number;
  level: IntentLevel;
  whyNow: string;
  recommendedOfferAngle: string;
  estimate: true;
};

// ---------------------------------------------------------------------------
// scoreIntent — score one company across all ten intent types
// ---------------------------------------------------------------------------
export function scoreIntent(input: CompanySignals): IntentResult {
  const company = input.company.trim();
  const signals = (input.signals ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  const haystack = signals.join(" | ").toLowerCase();
  const base = seed(company + "::" + haystack);

  const subScores: SubScore[] = INTENT_TYPES.map((type, idx) => {
    // Deterministic baseline hum (10–40) so the radar is never flat, but low.
    const k = seed(company + type + String(base + idx * 2654435761));
    let score = 10 + (k % 31);
    // A provided signal that mentions this type boosts it materially.
    const cues = TYPE_CUES[type];
    const hits = cues.filter((c) => haystack.includes(c)).length;
    if (hits > 0) score += 40 + Math.min(30, hits * 15) + (k % 10);
    return { type, score: clamp(score) };
  });

  // Composite: weight the strongest signals, then blend in the average so a
  // single spike does not alone create a "hot" verdict.
  const sorted = [...subScores].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const secondaryAvg = sorted.slice(1, 4).reduce((sum, s) => sum + s.score, 0) / 3;
  const overallAvg = subScores.reduce((sum, s) => sum + s.score, 0) / subScores.length;
  const sectorNudge = input.sector ? 3 : 0;
  const sizeNudge = typeof input.sizeEmployees === "number" ? Math.min(6, input.sizeEmployees / 200) : 0;
  const intentScore = clamp(top.score * 0.5 + secondaryAvg * 0.3 + overallAvg * 0.2 + sectorNudge + sizeNudge);

  const level: IntentLevel = intentScore >= 70 ? "hot" : intentScore >= 45 ? "warm" : "cold";

  return {
    company,
    subScores,
    intentScore,
    level,
    whyNow: buildWhyNow(company, top, signals, level),
    recommendedOfferAngle: buildOfferAngle(top.type, input),
    estimate: true,
  };
}

function buildWhyNow(company: string, top: SubScore, signals: string[], level: IntentLevel): string {
  if (signals.length === 0) {
    return `ESTIMATE: no signals supplied for ${company} — baseline "${top.type}" reads highest, but this is a cold guess, not observed intent. Provide signals to sharpen the radar.`;
  }
  const evidence = matchingSignal(top.type, signals) ?? signals[0];
  const strength = level === "hot" ? "strong buying window open now" : level === "warm" ? "an emerging window worth a timely touch" : "a faint early signal — nurture, do not hard-pitch";
  return `ESTIMATE: strongest signal is "${top.type}" (${top.score}/100), inferred from "${evidence}" — ${strength}.`;
}

function matchingSignal(type: IntentType, signals: string[]): string | undefined {
  const cues = TYPE_CUES[type];
  return signals.find((s) => cues.some((c) => s.toLowerCase().includes(c)));
}

function buildOfferAngle(type: IntentType, input: CompanySignals): string {
  const sector = input.sector ? ` (${input.sector})` : "";
  const angles: Record<IntentType, string> = {
    topic: `They are researching the problem${sector} — lead with an educational teardown or benchmark, not a pitch.`,
    search: `Active search intent${sector} — meet the query: a direct "here's how we solve exactly that" landing offer.`,
    hiring: `Hiring to scale${sector} — position as the leverage that lets a smaller team hit the same output; offer a capacity audit.`,
    funding: `Freshly funded${sector} — budget is unlocked; offer a fast-deploy package that shows ROI inside the first quarter.`,
    expansion: `Expanding${sector} — pitch the growth-enablement angle: repeatable acquisition for the new market or office.`,
    competitor: `Competitor dissatisfaction${sector} — a low-friction switch offer: migration help + a side-by-side proof.`,
    technology_change: `Mid tech change${sector} — position as the integration that de-risks the migration; offer a compatibility review.`,
    tender_procurement: `Procurement in motion${sector} — supply a compliant proposal + references; respond to the RFP framing, not cold outreach.`,
    news_trigger: `News-triggered${sector} — reference the event directly and offer the timely response it creates demand for.`,
    website_change: `Website/pricing change${sector} — signals a go-to-market shift; offer a conversion or positioning teardown of the new page.`,
  };
  return `ESTIMATE: ${angles[type]}`;
}

// ---------------------------------------------------------------------------
// radar — score a batch, hottest first
// ---------------------------------------------------------------------------
export function radar(companies: CompanySignals[]): IntentResult[] {
  return companies.map(scoreIntent).sort((a, b) => b.intentScore - a.intentScore);
}

// ---------------------------------------------------------------------------
// Zero-config demo — four companies with varied signals
// ---------------------------------------------------------------------------
export function demoIntentRadar(): IntentResult[] {
  return radar([
    {
      company: "Northgate Logistics",
      sector: "supply chain / logistics",
      sizeEmployees: 320,
      signals: ["Raised a Series B funding round last month", "Hiring a new Head of Growth", "Opening a second distribution centre"],
    },
    {
      company: "Brixton Dental Group",
      sector: "healthcare",
      sizeEmployees: 45,
      signals: ["Downloaded a patient-acquisition whitepaper", "Searched for 'dental marketing agency'"],
    },
    {
      company: "Meridian SaaS",
      sector: "technology / SaaS",
      sizeEmployees: 90,
      signals: ["Published an RFP for a new marketing platform", "Migration off their old CRM", "Unhappy with current agency"],
    },
    {
      company: "Oakwell Joinery",
      sector: "construction / trades",
      sizeEmployees: 12,
      signals: [],
    },
  ]);
}
