// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// A/B testing with statistics that refuse to lie.
//
// The failure mode this exists to prevent: a tool shows "Variant B is winning
// +40%!" after 12 clicks, the customer kills the better creative, and the tool
// looks clever while costing them money. Three things cause it, and all three
// are handled here explicitly:
//
//   1. SMALL SAMPLES. 3 conversions out of 10 is not 30% — it is somewhere
//      between 7% and 65%. Every rate is reported with a Wilson confidence
//      interval so the uncertainty is visible, not hidden behind a point
//      estimate.
//   2. NO POWER. A test that cannot detect the effect you care about will
//      report "no difference" forever. The required sample size is computed up
//      front from the baseline rate and the smallest lift worth acting on.
//   3. PEEKING. Checking a running test repeatedly and stopping at the first
//      p < 0.05 inflates the false-positive rate far above 5% — with daily
//      checks over two weeks it is roughly one in three. So a winner is only
//      declared once the pre-computed sample size is reached, and the number of
//      looks taken is tracked and reported.
//
// Nothing here is a heuristic. The maths is standard and the implementation is
// written out so it can be audited rather than trusted.

export type Variant = {
  id: string;
  label: string;
  impressions: number;
  conversions: number;
  // What produced this variant — carried through so results can teach the
  // generator which angles and hooks actually work (see creative-learning.ts).
  angleFamily?: string;
  hookFamily?: string;
};

export type VariantResult = Variant & {
  rate: number;              // conversions / impressions, 0-1
  ratePct: number;           // as a percentage, 1dp
  lowPct: number;            // Wilson lower bound
  highPct: number;           // Wilson upper bound
  intervalNote: string;
};

export type ExperimentVerdict =
  | "not_started"
  | "collecting"       // under the required sample size
  | "no_difference"    // enough data, no significant difference
  | "winner";          // enough data AND significant

export type ExperimentReport = {
  verdict: ExperimentVerdict;
  variants: VariantResult[];
  control?: VariantResult;
  challenger?: VariantResult;
  winnerId?: string;
  absoluteLiftPct?: number;    // percentage POINTS, not a relative %
  relativeLiftPct?: number;
  pValue?: number;
  confidencePct?: number;
  requiredPerArm: number;
  observedPerArm: number;
  progressPct: number;
  looksTaken: number;
  headline: string;
  caveats: string[];
};

// ---------------------------------------------------------------------------
// Normal distribution. Abramowitz & Stegun 7.1.26 for erf — accurate to ~1.5e-7,
// which is far beyond what any conversion test needs.
// ---------------------------------------------------------------------------
export function erf(x: number): number {
  // The polynomial leaves a ~1e-9 residue at zero. erf(0) is exactly 0, and
  // pinning it keeps "identical variants" reporting p = 1.0 rather than
  // 0.999999999 — the same answer, but one a reader can trust at a glance.
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Two-sided p-value for a z statistic.
export function twoSidedP(z: number): number {
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))));
}

// z for a given two-sided confidence level. Table lookup for the levels anyone
// actually uses, because inverting the normal CDF numerically here would add
// error for no benefit.
const Z_TWO_SIDED: Record<number, number> = { 0.20: 1.2816, 0.10: 1.6449, 0.05: 1.9600, 0.01: 2.5758 };
const Z_ONE_SIDED: Record<number, number> = { 0.20: 0.8416, 0.10: 1.2816, 0.05: 1.6449, 0.01: 2.3263 };

// ---------------------------------------------------------------------------
// Wilson score interval. Preferred over the textbook normal interval because it
// stays inside [0,1] and behaves at extremes — 0 conversions out of 40 gives a
// sensible upper bound rather than a nonsensical interval of zero width.
// ---------------------------------------------------------------------------
export function wilsonInterval(successes: number, trials: number, confidence = 0.95): { low: number; high: number } {
  if (trials <= 0) return { low: 0, high: 1 };
  const z = Z_TWO_SIDED[Number((1 - confidence).toFixed(2))] ?? 1.96;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

// ---------------------------------------------------------------------------
// Two-proportion z-test (pooled). The standard test for "did conversion rate
// change", and the one every A/B calculator should be using.
// ---------------------------------------------------------------------------
export function twoProportionTest(
  a: { conversions: number; impressions: number },
  b: { conversions: number; impressions: number },
): { z: number; pValue: number } {
  if (a.impressions <= 0 || b.impressions <= 0) return { z: 0, pValue: 1 };
  const p1 = a.conversions / a.impressions;
  const p2 = b.conversions / b.impressions;
  const pooled = (a.conversions + b.conversions) / (a.impressions + b.impressions);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.impressions + 1 / b.impressions));
  if (se === 0) return { z: 0, pValue: 1 };
  const z = (p2 - p1) / se;
  return { z, pValue: twoSidedP(z) };
}

// ---------------------------------------------------------------------------
// Sample size per arm, computed BEFORE the test runs. This is the number that
// makes "stop peeking" enforceable instead of advisory.
//
//   n = (z_alpha * sqrt(2*p̄*(1-p̄)) + z_beta * sqrt(p1(1-p1) + p2(1-p2)))^2 / delta^2
//
// mdeAbsolute is in RATE POINTS: a baseline of 3% with an MDE of 0.01 means
// "detect a move to 4%". Expressing it absolutely avoids the endless confusion
// between "20% better" and "20 points better".
// ---------------------------------------------------------------------------
export function requiredSampleSize(input: {
  baselineRate: number;      // 0-1
  mdeAbsolute: number;       // 0-1, rate points
  alpha?: number;            // false-positive rate, default 0.05
  power?: number;            // default 0.80
}): number {
  const p1 = Math.max(0.0001, Math.min(0.9999, input.baselineRate));
  const delta = Math.abs(input.mdeAbsolute);
  if (delta <= 0) return Number.POSITIVE_INFINITY;
  const p2 = Math.max(0.0001, Math.min(0.9999, p1 + delta));
  const alpha = input.alpha ?? 0.05;
  const power = input.power ?? 0.8;
  const zA = Z_TWO_SIDED[Number(alpha.toFixed(2))] ?? 1.96;
  const zB = Z_ONE_SIDED[Number((1 - power).toFixed(2))] ?? 0.8416;
  const pBar = (p1 + p2) / 2;
  const n =
    Math.pow(zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) /
    Math.pow(delta, 2);
  return Math.ceil(n);
}

const pct = (v: number) => Math.round(v * 1000) / 10;

function describe(v: Variant, confidence: number): VariantResult {
  const rate = v.impressions > 0 ? v.conversions / v.impressions : 0;
  const { low, high } = wilsonInterval(v.conversions, v.impressions, confidence);
  return {
    ...v,
    rate,
    ratePct: pct(rate),
    lowPct: pct(low),
    highPct: pct(high),
    intervalNote:
      v.impressions === 0
        ? "No data yet."
        : `${pct(rate)}% — but the true rate is somewhere between ${pct(low)}% and ${pct(high)}% on this much data.`,
  };
}

// ---------------------------------------------------------------------------
// Evaluate. The control is the FIRST variant; every other variant is compared
// against it.
// ---------------------------------------------------------------------------
export function evaluateExperiment(input: {
  variants: Variant[];
  mdeAbsolute?: number;   // smallest lift worth acting on; default 1 rate point
  alpha?: number;
  power?: number;
  looksTaken?: number;    // how many times this test has been checked
}): ExperimentReport {
  const alpha = input.alpha ?? 0.05;
  const confidence = 1 - alpha;
  const variants = input.variants.map((v) => describe(v, confidence));
  const looksTaken = Math.max(0, input.looksTaken ?? 0);
  const caveats: string[] = [];

  const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
  const control = variants[0];
  const baseline = control && control.impressions > 0 ? control.rate : 0.02;
  const mde = input.mdeAbsolute ?? 0.01;
  const requiredPerArm = requiredSampleSize({ baselineRate: baseline, mdeAbsolute: mde, alpha, power: input.power });
  const observedPerArm = variants.length ? Math.min(...variants.map((v) => v.impressions)) : 0;
  const progressPct = Number.isFinite(requiredPerArm) && requiredPerArm > 0
    ? Math.min(100, Math.round((observedPerArm / requiredPerArm) * 100))
    : 0;

  if (variants.length < 2) {
    return {
      verdict: "not_started", variants, requiredPerArm, observedPerArm, progressPct, looksTaken,
      headline: "A test needs at least two variants.",
      caveats: ["Add a challenger to compare against the control."],
    };
  }

  if (totalImpressions === 0) {
    return {
      verdict: "not_started", variants, control, requiredPerArm, observedPerArm, progressPct, looksTaken,
      headline: `Not started. Each variant needs about ${requiredPerArm.toLocaleString()} impressions to detect a ${pct(mde)}-point change.`,
      caveats: [],
    };
  }

  // Best challenger by observed rate — but "best so far" is NOT a winner.
  const challengers = variants.slice(1);
  const challenger = challengers.reduce((best, v) => (v.rate > best.rate ? v : best), challengers[0]);
  const { pValue } = twoProportionTest(control, challenger);
  const absoluteLift = challenger.rate - control.rate;
  const relativeLift = control.rate > 0 ? (challenger.rate / control.rate - 1) * 100 : 0;

  // Peeking: repeated looks inflate the false-positive rate well above alpha.
  // Say so plainly rather than pretending a mid-flight p-value means what a
  // final one would.
  if (looksTaken > 3) {
    caveats.push(
      `This test has been checked ${looksTaken} times. Repeatedly looking and stopping at the first significant result inflates the false-positive rate far above ${Math.round(alpha * 100)}% — which is why the result below waits for the full sample rather than the first good-looking day.`,
    );
  }

  // NOT ENOUGH DATA — the common case, and the one where tools lie.
  if (observedPerArm < requiredPerArm) {
    const leader = challenger.rate > control.rate ? challenger : control;
    const overlap = challenger.lowPct <= control.highPct && control.lowPct <= challenger.highPct;
    caveats.push(
      overlap
        ? "The variants' confidence intervals still overlap — the difference you can see may be noise."
        : "The intervals have separated, but the sample is still short of the planned size. Wait for it.",
    );
    return {
      verdict: "collecting", variants, control, challenger,
      absoluteLiftPct: pct(absoluteLift), relativeLiftPct: Math.round(relativeLift * 10) / 10,
      pValue, requiredPerArm, observedPerArm, progressPct, looksTaken,
      headline:
        `Still collecting — ${observedPerArm.toLocaleString()} of ~${requiredPerArm.toLocaleString()} impressions per variant (${progressPct}%). ` +
        `"${leader.label}" is ahead so far, but there is not yet enough data to call it. Do not switch off the other one.`,
      caveats,
    };
  }

  // ENOUGH DATA.
  if (pValue >= alpha) {
    caveats.push(
      `A null result is useful: it means any real difference is probably smaller than the ${pct(mde)}-point change this test was sized to detect. Test a bigger idea rather than a bigger sample.`,
    );
    return {
      verdict: "no_difference", variants, control, challenger,
      absoluteLiftPct: pct(absoluteLift), relativeLiftPct: Math.round(relativeLift * 10) / 10,
      pValue, confidencePct: Math.round((1 - pValue) * 100),
      requiredPerArm, observedPerArm, progressPct, looksTaken,
      headline: `No significant difference. With a full sample, "${challenger.label}" and "${control.label}" perform the same within the margin of error (p = ${pValue.toFixed(3)}).`,
      caveats,
    };
  }

  const winner = challenger.rate > control.rate ? challenger : control;
  const loser = winner.id === challenger.id ? control : challenger;
  return {
    verdict: "winner", variants, control, challenger,
    winnerId: winner.id,
    absoluteLiftPct: pct(absoluteLift), relativeLiftPct: Math.round(relativeLift * 10) / 10,
    pValue, confidencePct: Math.round((1 - pValue) * 100),
    requiredPerArm, observedPerArm, progressPct, looksTaken,
    headline:
      `"${winner.label}" wins: ${winner.ratePct}% versus ${loser.ratePct}% ` +
      `(p = ${pValue.toFixed(4)}, ${Math.round((1 - pValue) * 100)}% confidence, full sample reached).`,
    caveats,
  };
}
