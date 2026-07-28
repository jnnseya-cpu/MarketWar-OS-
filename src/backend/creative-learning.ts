// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The LEARN half of the loop — results feed back into what gets generated.
//
// Without this, a creative engine is a slot machine: it produces the same
// distribution of angles forever, no matter which ones actually sold anything.
// This module reads finished experiments and produces a weighting the generator
// uses to favour angle and hook families that have earned it for THIS brand.
//
// The discipline that keeps it honest, and the reason it is not simply
// "generate more of whatever won last time":
//
//   • Evidence, not anecdote. A family is only credited from experiments that
//     reached their sample size. One lucky post teaches nothing.
//   • Shrinkage toward the mean. A family with 2 wins out of 2 is not twice as
//     good as one with 40 wins out of 60 — it is barely evidence at all. Every
//     rate is pulled toward the brand's overall average in proportion to how
//     little data supports it (empirical-Bayes style), so small samples cannot
//     dominate.
//   • Exploration floor. No family is ever driven to zero. A family that lost
//     three times may still be the one that works for the next product, and a
//     generator that stops producing it can never find out.
//   • Per-brand. What works for a plumber does not transfer to a SaaS. Learning
//     is scoped to the brand that earned it.

import { evaluateExperiment, type Variant } from "@/backend/experiments";

export type ExperimentRecord = {
  id: string;
  brandId: string;
  variants: Variant[];
  mdeAbsolute?: number;
  createdAt: string;
};

export type FamilyPerformance = {
  family: string;
  experiments: number;      // how many CONCLUDED experiments included it
  impressions: number;
  conversions: number;
  rawRatePct: number;       // what it actually did
  adjustedRatePct: number;  // after shrinkage — what we are willing to believe
  wins: number;
  weight: number;           // multiplier the generator applies, 0.5-2.0
  confidence: "none" | "weak" | "moderate" | "strong";
  note: string;
};

export type LearningReport = {
  brandId: string;
  concludedExperiments: number;
  ignoredExperiments: number;      // still collecting — deliberately not used
  baselineRatePct: number;
  angleFamilies: FamilyPerformance[];
  hookFamilies: FamilyPerformance[];
  recommendations: string[];
  note: string;
};

// Shrinkage strength: the number of impressions at which a family's own rate is
// believed as much as the brand average. Below this, the average dominates;
// above it, the family's own evidence does. 2,000 is roughly where a conversion
// rate of a few percent starts to be measurable at all.
const PRIOR_STRENGTH = 2000;

// A family is never weighted out of existence, and never allowed to take over.
const MIN_WEIGHT = 0.5;
const MAX_WEIGHT = 2.0;

function confidenceFor(impressions: number, experiments: number): FamilyPerformance["confidence"] {
  if (experiments === 0 || impressions === 0) return "none";
  if (impressions < PRIOR_STRENGTH / 4 || experiments < 2) return "weak";
  if (impressions < PRIOR_STRENGTH * 2) return "moderate";
  return "strong";
}

type Tally = { impressions: number; conversions: number; experiments: Set<string>; wins: number };

function tallyBy(
  records: ExperimentRecord[],
  key: "angleFamily" | "hookFamily",
): { tallies: Map<string, Tally>; concluded: number; ignored: number; totalImpressions: number; totalConversions: number } {
  const tallies = new Map<string, Tally>();
  let concluded = 0;
  let ignored = 0;
  let totalImpressions = 0;
  let totalConversions = 0;

  for (const rec of records) {
    const report = evaluateExperiment({ variants: rec.variants, mdeAbsolute: rec.mdeAbsolute });
    // Only finished experiments teach anything. An experiment still collecting
    // is exactly the noise this whole module exists to avoid learning from.
    if (report.verdict !== "winner" && report.verdict !== "no_difference") { ignored++; continue; }
    concluded++;

    for (const v of rec.variants) {
      const family = v[key];
      if (!family) continue;
      const t = tallies.get(family) ?? { impressions: 0, conversions: 0, experiments: new Set<string>(), wins: 0 };
      t.impressions += v.impressions;
      t.conversions += v.conversions;
      t.experiments.add(rec.id);
      if (report.verdict === "winner" && report.winnerId === v.id) t.wins++;
      tallies.set(family, t);
      totalImpressions += v.impressions;
      totalConversions += v.conversions;
    }
  }
  return { tallies, concluded, ignored, totalImpressions, totalConversions };
}

const pct = (v: number) => Math.round(v * 1000) / 10;

function performanceFrom(tallies: Map<string, Tally>, baseline: number): FamilyPerformance[] {
  const out: FamilyPerformance[] = [];
  for (const [family, t] of tallies) {
    const raw = t.impressions > 0 ? t.conversions / t.impressions : 0;
    // Empirical-Bayes shrinkage: blend the family's own rate with the brand
    // baseline, weighted by how much data stands behind it.
    const adjusted =
      (t.conversions + baseline * PRIOR_STRENGTH) / (t.impressions + PRIOR_STRENGTH);
    // Weight is the adjusted rate relative to the baseline, clamped. Using the
    // ADJUSTED rate is the whole point: a 2-for-2 family barely moves.
    const ratio = baseline > 0 ? adjusted / baseline : 1;
    const weight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Number(ratio.toFixed(2))));
    const confidence = confidenceFor(t.impressions, t.experiments.size);
    out.push({
      family,
      experiments: t.experiments.size,
      impressions: t.impressions,
      conversions: t.conversions,
      rawRatePct: pct(raw),
      adjustedRatePct: pct(adjusted),
      wins: t.wins,
      weight,
      confidence,
      note:
        confidence === "weak"
          ? `${pct(raw)}% observed, but on only ${t.impressions.toLocaleString()} impressions — treated as ${pct(adjusted)}% until there is more evidence.`
          : weight > 1.1
            ? `Outperforming: ${pct(adjusted)}% against a ${pct(baseline)}% baseline. Generated more often.`
            : weight < 0.9
              ? `Underperforming: ${pct(adjusted)}% against a ${pct(baseline)}% baseline. Generated less often — never dropped.`
              : `Performing at the brand average. No adjustment.`,
    });
  }
  return out.sort((a, b) => b.weight - a.weight || b.impressions - a.impressions);
}

export function learnFromExperiments(brandId: string, records: ExperimentRecord[]): LearningReport {
  const mine = records.filter((r) => r.brandId === brandId);
  const angles = tallyBy(mine, "angleFamily");
  const hooks = tallyBy(mine, "hookFamily");

  const baseline = angles.totalImpressions > 0 ? angles.totalConversions / angles.totalImpressions : 0;
  const angleFamilies = performanceFrom(angles.tallies, baseline);
  const hookBaseline = hooks.totalImpressions > 0 ? hooks.totalConversions / hooks.totalImpressions : baseline;
  const hookFamilies = performanceFrom(hooks.tallies, hookBaseline);

  const recommendations: string[] = [];
  if (angles.concluded === 0) {
    recommendations.push(
      mine.length === 0
        ? "Nothing to learn from yet — publish two variants of a concept and let them run."
        : `${angles.ignored} experiment${angles.ignored === 1 ? " is" : "s are"} still collecting. Nothing is learned from a test that has not finished, so generation is unweighted for now.`,
    );
  } else {
    const strong = angleFamilies.filter((f) => f.weight > 1.1 && f.confidence !== "weak");
    const weak = angleFamilies.filter((f) => f.weight < 0.9 && f.confidence !== "weak");
    if (strong.length) recommendations.push(`Lean into ${strong.slice(0, 3).map((f) => f.family).join(", ")} — they beat this brand's baseline on real, concluded tests.`);
    if (weak.length) recommendations.push(`${weak.slice(0, 3).map((f) => f.family).join(", ")} underperform here. Still generated, just less often — a family that failed on one product can win on the next.`);
    const untested = angleFamilies.filter((f) => f.confidence === "none" || f.confidence === "weak");
    if (untested.length) recommendations.push(`${untested.length} famil${untested.length === 1 ? "y has" : "ies have"} too little data to judge. They keep their normal share so they get the chance to prove themselves.`);
  }

  return {
    brandId,
    concludedExperiments: angles.concluded,
    ignoredExperiments: angles.ignored,
    baselineRatePct: pct(baseline),
    angleFamilies,
    hookFamilies,
    recommendations,
    note:
      "Learned only from experiments that reached their planned sample size. Rates are shrunk toward this brand's own baseline, so a family with two lucky wins does not outrank one with a long record. No family is ever weighted to zero — that would guarantee never discovering it works.",
  };
}

// Apply the learning to a set of candidates. Returns them reordered, with the
// weight attached so the UI can show WHY the order changed.
export function applyLearning<T extends { family: string; score?: number }>(
  candidates: T[],
  report: LearningReport,
  kind: "angle" | "hook" = "angle",
): (T & { learnedWeight: number; learnedNote?: string })[] {
  const table = new Map((kind === "angle" ? report.angleFamilies : report.hookFamilies).map((f) => [f.family, f]));
  return candidates
    .map((c) => {
      const perf = table.get(c.family);
      return {
        ...c,
        learnedWeight: perf?.weight ?? 1,
        learnedNote: perf?.note,
        score: Math.round((c.score ?? 50) * (perf?.weight ?? 1)),
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
