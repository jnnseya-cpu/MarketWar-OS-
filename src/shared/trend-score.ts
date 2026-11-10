// OPPORTUNITY AND CONFIDENCE, COMPUTED SEPARATELY — Trend Intelligence AI v2.3
// §5.4, §5.5 and §17.
//
// TWO NUMBERS, AND KEEPING THEM APART IS THE WHOLE IDEA. "How good would this
// be if it is true" and "how much do we believe it" are different questions,
// and a single blended score cannot answer either. A strong opportunity on one
// syndicated story and a modest one corroborated by three independent families
// score the same when they are multiplied together, and only one of them should
// ever reach a live change. So:
//
//   • OPPORTUNITY (§5.4) = 25% demand + 25% platform fit + 20% commercial
//     intent + 15% timing + 15% readiness. Hard vetoes override it entirely.
//   • CONFIDENCE (§5.5) = 35% source quality + 25% independent corroboration +
//     20% sample/coverage + 20% freshness. **Capped at 69 for a single source
//     family**, which is the rule that stops one feed authorising anything.
//
// BOTH must clear their own threshold before a brief exists, and the gate is in
// `decide` below rather than in a caller, because a threshold table copied into
// two callers is two thresholds.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT IS NOT IN THESE NUMBERS, deliberately:
//
//   • "Model certainty is excluded" (§5.5). A language model's confidence in
//     its own answer is not evidence about the world, and letting it in makes a
//     fluent guess outrank a measured fact.
//   • Readiness cannot be inferred. §5.4: "Missing readiness blocks
//     activation." With no stock, no approved claim or no available target,
//     readiness is 0 and a live change is vetoed — not scored lower.
//
// ───────────────────────────────────────────────────────────────────────────
// THIS IS NOT `opportunity-radar.ts`, AND THE DIFFERENCE IS RECORDED.
//
// `backend/opportunity-radar.ts` publishes a different, multiplicative score —
// `Demand × Intent × Relevance × Timing × Authority × Conversion ÷ Competition`
// — for ranking CONTENT opportunities for one brand, and the landing pages
// describe it. This one is a weighted sum on a fixed 0–100 scale that decides
// whether a demand opportunity may become an approved brief at all.
//
// They are not the same function and neither replaces the other. Keeping both
// is the additive-only law; the conflict and this resolution are recorded in
// REQUIREMENTS-COVERAGE.md §Gaps and in TREND-INTELLIGENCE-COVERAGE.md. What
// must never happen is one of them quietly becoming the other.
//
// Pure, deterministic, no clock of its own, no store, no model. §21's TI-03
// gives the expected outputs for the spec's own example inputs and this file is
// written to produce them exactly: 86.25 and 83.5, unrounded before the
// decision.

export type OpportunityInputs = {
  /** 0–100, from calibrated per-source scores (see `demandFromCountFeed`). */
  demand: number;
  /** 0–100. Product, category, geography and persona match, from the profile. */
  fit: number;
  /** 0–100. Explicit behaviour and taxonomy, from the profile. */
  intent: number;
  /** 0–100. How much of the actionable window is left. */
  timing: number;
  /** 0–100. Stock, partner coverage, capacity, approved assets. 0 vetoes a live change. */
  readiness: number;
};

export type ConfidenceInputs = {
  /** 0–100. Mean of the configured quality scores of the contributing families. */
  sourceQuality: number;
  /** How many INDEPENDENT source families corroborate this topic, market and window. */
  independentFamilies: number;
  /** 0–100. Mean valid observed/expected window ratio × 100. */
  coverage: number;
  /** 0–100. 100 at window close, tapering linearly to 0 at the stale-after limit. */
  freshness: number;
};

/** §5.4 weights. Exported so a test can derive the expectation instead of copying a number. */
export const OPPORTUNITY_WEIGHTS = { demand: 0.25, fit: 0.25, intent: 0.20, timing: 0.15, readiness: 0.15 } as const;
/** §5.5 weights. */
export const CONFIDENCE_WEIGHTS = { sourceQuality: 0.35, corroboration: 0.25, coverage: 0.20, freshness: 0.20 } as const;

/** §5.5: "As a starting rule, cap a single source family at 69." */
export const SINGLE_FAMILY_CAP = 69;

/** §5.3 initial count-feed gates, both "adjustable by source and geography". */
export const COUNT_GATE = { minCount: 20, minZ: 2 } as const;
/** §5.3: "With fewer than four comparable periods, label insufficient history and keep draft-only." */
export const MIN_COMPARABLE_PERIODS = 4;

/** Reasons a live change is refused outright, whatever the score (§5.4). */
export const VETOES = [
  "out_of_market", "unsupported_claim", "restricted_topic",
  "inventory_unavailable", "illegal_targeting", "readiness_missing",
] as const;
export type Veto = (typeof VETOES)[number];

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/**
 * §5.4. Full precision, and rounded only for display.
 *
 * The spec says so and TI-03 enforces it: *"Neither score is rounded before the
 * decision."* 74.6 rounds to 75 and 75 is the threshold for creating a brief —
 * so rounding first turns a watch item into an approved instruction.
 */
export function opportunityScore(i: OpportunityInputs): number {
  const w = OPPORTUNITY_WEIGHTS;
  return clamp(num(i.demand)) * w.demand
    + clamp(num(i.fit)) * w.fit
    + clamp(num(i.intent)) * w.intent
    + clamp(num(i.timing)) * w.timing
    + clamp(num(i.readiness)) * w.readiness;
}

/**
 * §17: corroboration is a step function, not a curve.
 *
 * "Assign corroboration 0 for one independent family, 80 for two and 100 for
 * three or more." One family corroborates nothing — that is the definition of
 * the word — so it scores zero rather than something generous.
 */
export function corroborationScore(independentFamilies: number): number {
  const n = Math.max(0, Math.floor(num(independentFamilies)));
  if (n >= 3) return 100;
  if (n === 2) return 80;
  return 0;
}

/** §5.5 + §17, including the single-family cap. */
export function confidenceScore(i: ConfidenceInputs): number {
  const w = CONFIDENCE_WEIGHTS;
  const raw = clamp(num(i.sourceQuality)) * w.sourceQuality
    + corroborationScore(i.independentFamilies) * w.corroboration
    + clamp(num(i.coverage)) * w.coverage
    + clamp(num(i.freshness)) * w.freshness;
  // THE CAP IS APPLIED LAST AND IT IS NOT A WEIGHT. A single family with
  // perfect quality, coverage and freshness scores 75 on the weights alone,
  // which would clear the ≥75 brief threshold on one feed. The cap is what
  // makes "one source is never enough" true rather than merely likely.
  const families = Math.max(0, Math.floor(num(i.independentFamilies)));
  return families <= 1 ? Math.min(SINGLE_FAMILY_CAP, raw) : raw;
}

// ---------------------------------------------------------------------------
// §17 · turning a raw count feed into a 0–100 demand score, reproducibly
// ---------------------------------------------------------------------------

/**
 * §5.3's movement statistics, written out because the spec writes them out.
 *
 * `lift = ln((c+1)/(b+1))` and
 * `z = (log1p(c) − median(log1p(x))) / max(1.4826 × MAD(log1p(x)), 0.2)`
 *
 * The 1.4826 is the constant that makes a median absolute deviation comparable
 * to a standard deviation for normal data; the 0.2 floor stops a feed with
 * almost no historical variation producing an enormous z from one quiet week.
 */
export function movement(current: number, history: number[]): { lift: number; z: number; comparablePeriods: number; insufficientHistory: boolean } {
  const c = Math.max(0, num(current));
  const xs = (Array.isArray(history) ? history : []).map(num).filter((n) => n >= 0);
  const logs = xs.map((x) => Math.log1p(x));
  const med = median(logs);
  const mad = median(logs.map((l) => Math.abs(l - med)));
  const denom = Math.max(1.4826 * mad, 0.2);
  const b = xs.length ? Math.expm1(med) : 0;
  return {
    lift: Math.log((c + 1) / (b + 1)),
    z: logs.length ? (Math.log1p(c) - med) / denom : 0,
    comparablePeriods: xs.length,
    insufficientHistory: xs.length < MIN_COMPARABLE_PERIODS,
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type CountFeedDemand = {
  demand: number;
  z: number;
  lift: number;
  /** False when the volume or history gate is unmet — monitor, do not act. */
  passesGate: boolean;
  why: string;
};

/**
 * §17's reference mapping for count feeds: `clamp(50 + 10 × z, 0, 100)`, applied
 * **after** the volume and history gates.
 *
 * The order matters. Mapping first and gating afterwards produces a demand
 * score for a feed that has not earned one, and a number on a screen is read
 * whether or not a flag beside it says to ignore it.
 */
export function demandFromCountFeed(current: number, history: number[], gate = COUNT_GATE): CountFeedDemand {
  const m = movement(current, history);
  const c = Math.max(0, num(current));
  const volumeOk = c >= gate.minCount;
  const zOk = m.z >= gate.minZ;
  const passesGate = volumeOk && zOk && !m.insufficientHistory;
  const demand = passesGate ? clamp(50 + 10 * m.z) : 0;
  const why = !volumeOk
    ? `Only ${c} observations this window, under the gate of ${gate.minCount}. A rise on a handful of events is noise.`
    : m.insufficientHistory
      ? `Only ${m.comparablePeriods} comparable period(s) of history; ${MIN_COMPARABLE_PERIODS} are needed before a movement means anything. Draft only.`
      : !zOk
        ? `Movement z=${m.z.toFixed(2)} is under the gate of ${gate.minZ}, so this is within normal variation.`
        : `${c} observations, z=${m.z.toFixed(2)}, lift=${m.lift.toFixed(2)}.`;
  return { demand, z: m.z, lift: m.lift, passesGate, why };
}

// ---------------------------------------------------------------------------
// §5's decision table
// ---------------------------------------------------------------------------

export type Band = "archive" | "watch" | "brief" | "auto_eligible";

export type Decision = {
  band: Band;
  opportunity: number;
  confidence: number;
  vetoes: Veto[];
  /** True only for the top band, and only with explicit opt-in. */
  mayActAutomatically: boolean;
  reason: string;
};

/**
 * §5's table, exactly:
 *
 *   < 60 score OR < 55 confidence        → archive with reason
 *   60–74 score OR 55–74 confidence      → watch or draft internally
 *   ≥ 75 and ≥ 75, no veto               → create a reviewable brief
 *   ≥ 85 and ≥ 85, explicit opt-in       → bounded automatic action
 *
 * A VETO IS NOT A LOW SCORE. An out-of-market topic with a score of 95 is not
 * "95 but risky" — it is refused, and the reason is named so somebody can fix
 * the cause rather than argue with the number.
 */
export function decide(input: {
  opportunity: number;
  confidence: number;
  vetoes?: Veto[];
  /** §5: the top band requires the tenant to have asked for it, in writing. */
  autoActionOptIn?: boolean;
}): Decision {
  const opportunity = clamp(num(input.opportunity));
  const confidence = clamp(num(input.confidence));
  const vetoes = [...new Set(input.vetoes || [])];

  if (vetoes.length) {
    return {
      band: "watch", opportunity, confidence, vetoes, mayActAutomatically: false,
      reason: `Held: ${vetoes.join(", ")}. A veto is not a low score — no live change can be made until the cause is resolved, whatever the numbers say.`,
    };
  }
  if (opportunity < 60 || confidence < 55) {
    return {
      band: "archive", opportunity, confidence, vetoes, mayActAutomatically: false,
      reason: `Archived: opportunity ${opportunity.toFixed(2)} and confidence ${confidence.toFixed(2)}; the cutoffs are 60 and 55. It reopens on new evidence.`,
    };
  }
  if (opportunity >= 85 && confidence >= 85) {
    return {
      band: input.autoActionOptIn ? "auto_eligible" : "brief",
      opportunity, confidence, vetoes,
      mayActAutomatically: Boolean(input.autoActionOptIn),
      reason: input.autoActionOptIn
        ? `Eligible for bounded automatic action in approved low-risk classes only (opportunity ${opportunity.toFixed(2)}, confidence ${confidence.toFixed(2)}).`
        : `A reviewable brief (opportunity ${opportunity.toFixed(2)}, confidence ${confidence.toFixed(2)}). Automatic action needs an explicit opt-in this installation has not given.`,
    };
  }
  if (opportunity >= 75 && confidence >= 75) {
    return {
      band: "brief", opportunity, confidence, vetoes, mayActAutomatically: false,
      reason: `A reviewable brief (opportunity ${opportunity.toFixed(2)}, confidence ${confidence.toFixed(2)}). External actions still require policy and channel approval.`,
    };
  }
  return {
    band: "watch", opportunity, confidence, vetoes, mayActAutomatically: false,
    reason: `Watch or draft internally (opportunity ${opportunity.toFixed(2)}, confidence ${confidence.toFixed(2)}). No live change until both clear 75.`,
  };
}

/** Both scores and the decision in one call, from the component inputs. */
export function assess(input: {
  opportunity: OpportunityInputs;
  confidence: ConfidenceInputs;
  vetoes?: Veto[];
  autoActionOptIn?: boolean;
}): Decision {
  // §5.4: missing readiness BLOCKS activation rather than lowering the score.
  const vetoes = [...(input.vetoes || [])];
  if (clamp(num(input.opportunity.readiness)) <= 0 && !vetoes.includes("readiness_missing")) {
    vetoes.push("readiness_missing");
  }
  return decide({
    opportunity: opportunityScore(input.opportunity),
    confidence: confidenceScore(input.confidence),
    vetoes,
    autoActionOptIn: input.autoActionOptIn,
  });
}

// ---------------------------------------------------------------------------
// §3 · WHICH FAMILY A SIGNAL BELONGS TO — the part that makes corroboration
// mean something on THIS platform rather than in the abstract
// ---------------------------------------------------------------------------
//
// The step function above counts INDEPENDENT FAMILIES, and the whole cap at 69
// rests on that word. Counting sources instead of families is the mistake it
// exists to prevent: four news articles about one press release are one piece of
// evidence repeated four times, and so are a support ticket, a sales objection
// and a website session from the same unhappy week.
//
// The names below are not invented for this spec. They are exactly the twelve
// `SIGNAL_SOURCES` the Content Opportunity Radar has published since §13, so
// there is one vocabulary of sources on the platform and this adds the grouping
// rather than a second list. `tests/trend-intelligence.test.mjs` fails if a
// source is ever added to that list without a family here, because an unmapped
// source would silently count as its own family and inflate corroboration.
//
// WHY THESE GROUPINGS, specifically:
//
//   • `support_issues`, `sales_objections` and `website_analytics` are ONE
//     family — `first_party`. They are all our own records of our own
//     customers, so they share every bias our customer base has. Three of them
//     agreeing is one view held three times.
//   • `seasonal_events` and `cultural_events` are ONE family — `calendar`.
//     Both are a date that was known in advance; neither is observation.
//   • `search_queries` and `ai_prompts` are SEPARATE. One is what people type
//     into a search engine, the other what they ask an assistant; the
//     populations and the phrasing differ, and treating them as one would
//     discard the only corroboration most topics can get.
export const SOURCE_FAMILY = {
  social_conversations: "social",
  search_queries: "search",
  ai_prompts: "ai_surface",
  competitor_content: "competitor",
  support_issues: "first_party",
  sales_objections: "first_party",
  website_analytics: "first_party",
  reviews: "review",
  seasonal_events: "calendar",
  cultural_events: "calendar",
  news: "news",
  product_availability: "inventory",
} as const;

export type SourceFamily = (typeof SOURCE_FAMILY)[keyof typeof SOURCE_FAMILY];

/**
 * §5.5's "configured quality scores of the contributing families", configured.
 *
 * These are a judgement, which is why they are declared in ONE place with the
 * reasoning attached rather than inlined at a call site where nobody would ever
 * find them. The ordering is the defensible part:
 *
 *   • `first_party` is highest because it is our own measurement of our own
 *     customers — the only evidence here that is not somebody's report of
 *     something else.
 *   • `news` is middling and deliberately not high. A news article is a report
 *     ABOUT demand, not an observation OF it, and twenty outlets carrying one
 *     press release is one source.
 *   • `calendar` is lowest. A date in a calendar was knowable a year ago; it is
 *     context, not a signal that something is happening now.
 */
export const FAMILY_QUALITY: Record<SourceFamily, number> = {
  first_party: 90,
  review: 80,
  search: 75,
  inventory: 75,
  social: 65,
  ai_surface: 60,
  news: 60,
  competitor: 55,
  calendar: 40,
};

/** The mean configured quality of the families present. 0 when there are none. */
export function sourceQualityOf(families: readonly SourceFamily[]): number {
  if (!families.length) return 0;
  return families.reduce((t, f) => t + (FAMILY_QUALITY[f] ?? 0), 0) / families.length;
}

export type FamilyBreakdown = {
  /** The distinct families, sorted, so the count is reproducible. */
  families: SourceFamily[];
  /** What `confidenceScore` should be told. */
  independentFamilies: number;
  /** Sources we were given and have no family for. Never counted. */
  unmapped: string[];
  why: string;
};

/**
 * The distinct families behind a candidate.
 *
 * AN UNMAPPED SOURCE IS NOT A FAMILY. Defaulting an unknown string to "its own
 * family" is the generous reading and it is the dangerous one: it lets anything
 * that can name three sources clear corroboration, which is the single check
 * standing between one syndicated story and an automatic action. An unmapped
 * source is reported by name instead, so somebody adds it to the map on
 * purpose.
 */
export function familiesOf(sources: readonly string[] | null | undefined): FamilyBreakdown {
  const map = SOURCE_FAMILY as Record<string, SourceFamily | undefined>;
  const families = new Set<SourceFamily>();
  const unmapped: string[] = [];
  for (const raw of sources || []) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const fam = map[s];
    if (fam) families.add(fam);
    else if (!unmapped.includes(s)) unmapped.push(s);
  }
  const list = [...families].sort();
  return {
    families: list,
    independentFamilies: list.length,
    unmapped,
    why: [
      list.length
        ? `${list.length} independent source famil${list.length === 1 ? "y" : "ies"}: ${list.join(", ")}.`
        : "No recognised source family — nothing here corroborates anything.",
      list.length === 1
        ? `One family alone caps confidence at ${SINGLE_FAMILY_CAP}, so it can never authorise action however strong the signal looks.`
        : "",
      unmapped.length
        ? `Not counted, because no family is declared for ${unmapped.join(", ")} — an unmapped source would otherwise inflate corroboration by pretending to be independent.`
        : "",
    ].filter(Boolean).join(" "),
  };
}

// ---------------------------------------------------------------------------
// §5.5 · FRESHNESS, measured from what the provider actually said
// ---------------------------------------------------------------------------

/** §5.5: freshness tapers to 0 at the stale-after limit. Thirty days, in hours. */
export const STALE_AFTER_HOURS = 30 * 24;
/** Anything inside this is as fresh as it gets; a signal is not fresher for being minutes old. */
export const FULLY_FRESH_HOURS = 24;

/**
 * "2 hours ago", "3 days ago", "Mar 3, 2026" → hours of age, or null.
 *
 * Returning NULL for text it cannot read is the point. A parser that answers
 * "0 hours" when it did not understand the input reports every unreadable date
 * as breaking news, which is the most expensive possible way to be wrong here.
 */
export function ageHoursFrom(date: unknown, nowMs: number): number | null {
  const raw = String(date ?? "").trim();
  if (!raw) return null;

  const rel = raw.toLowerCase().match(/^(\d+)\s*(minute|min|hour|hr|day|week|month|year)s?\s+ago$/);
  if (rel) {
    const n = Number(rel[1]);
    const per: Record<string, number> = {
      minute: 1 / 60, min: 1 / 60, hour: 1, hr: 1, day: 24, week: 168, month: 730, year: 8760,
    };
    const h = n * (per[rel[2]] ?? 0);
    return Number.isFinite(h) ? Math.max(0, h) : null;
  }
  if (/^(just now|moments? ago|today)$/i.test(raw)) return 0;
  if (/^yesterday$/i.test(raw)) return 24;

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  // A publication date in the future is not freshness, it is a bad record.
  return Math.max(0, (nowMs - parsed) / 3_600_000);
}

/** 100 up to FULLY_FRESH_HOURS, then straight down to 0 at STALE_AFTER_HOURS. */
export function freshnessFrom(ageHours: number | null): number {
  if (ageHours === null || !Number.isFinite(ageHours)) return 0;
  if (ageHours <= FULLY_FRESH_HOURS) return 100;
  if (ageHours >= STALE_AFTER_HOURS) return 0;
  const span = STALE_AFTER_HOURS - FULLY_FRESH_HOURS;
  return clamp(100 * (1 - (ageHours - FULLY_FRESH_HOURS) / span));
}
