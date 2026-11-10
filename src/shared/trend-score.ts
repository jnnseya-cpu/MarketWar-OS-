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
