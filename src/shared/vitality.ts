// THE BUSINESS VITALITY INDEX, WITHOUT THE INVENTED NUMBERS.
//
// The BVI panel shipped with twelve hardcoded dimension scores in a field called
// `measured`: "4.5× vs 2.0× industry benchmark", "CAC £7.38 — 21% of LTV",
// "Flame Republic spend up 24% in 7 days". None of it was measured. It was
// mounted nowhere, which is the only reason it never reached a customer, and it
// was one import away from breaching the rule this platform is built on:
//
//   NEVER PRESENT A NUMBER AS A MEASUREMENT UNLESS SOMETHING COUNTED IT.
//
// The weights below are binding (docs/ai-os/03 §2.1) and all twelve dimensions
// are kept — nothing is deleted. What changes is where the scores come from:
// each dimension names the component that feeds it, and a dimension with no
// source is returned UNMEASURED with the thing to connect, never with a number.
//
// AND THE COMPOSITE REFUSES ITSELF. A weighted index computed over 16% of its
// own weight is not an index; it is one number wearing the authority of twelve.
// Below MIN_COVERAGE_PCT there is no score at all, and the panel says which
// dimensions would have to be connected to produce one.
//
// Pure and shared so the panel can use it directly: a client component must
// never import a backend module, and a scorer the surface cannot run is a
// scorer the surface will re-implement slightly differently.

/** A scored component from the results ledger. Structurally the backend's `ScoreComponent`. */
export type VitalityInput = { name: string; score: number | null; note: string };

export type DimensionStatus = "healthy" | "watch" | "alert" | "unmeasured";

export type VitalityDimension = {
  name: string;
  /** Percent of the composite. Binding — docs/ai-os/03 §2.1. */
  weight: number;
  /**
   * The component that genuinely measures this, or null when nothing does.
   *
   * A null here is a statement, not an omission: it says this platform cannot
   * currently measure the dimension at all, and `connect` says what would.
   */
  fedBy: string | null;
  /** What a customer would have to connect for this to become measurable. */
  connect: string;
};

export const MIN_COVERAGE_PCT = 50;

export const VITALITY_DIMENSIONS: VitalityDimension[] = [
  { name: "Campaign ROAS health", weight: 15, fedBy: "Marketing Efficiency", connect: "Ad spend from a connected ad account." },
  { name: "Revenue trend", weight: 15, fedBy: null, connect: "Revenue recorded across at least two comparable periods. A single total is not a trend." },
  { name: "Lead flow velocity", weight: 12, fedBy: "Demand Capture", connect: "Already measured from the results ledger." },
  { name: "Customer acquisition cost", weight: 12, fedBy: "Marketing Efficiency", connect: "Ad spend from a connected ad account." },
  { name: "Customer retention rate", weight: 10, fedBy: "Retention", connect: "Repeat-purchase or subscription data." },
  { name: "Audience health", weight: 8, fedBy: null, connect: "Ad frequency and saturation from a connected ad account." },
  { name: "Dormant revenue risk", weight: 8, fedBy: "Revenue Recovery", connect: "Cart, payment or dormant-customer data." },
  { name: "Creative fatigue", weight: 7, fedBy: null, connect: "Per-creative performance over time. The fatigue engine judges one creative against its own peak; it does not roll up to a brand." },
  { name: "Competitor threat level", weight: 5, fedBy: "Competitor Advantage", connect: "Competitor tracking." },
  { name: "Budget efficiency", weight: 4, fedBy: "Profitability", connect: "Costs — spend, fees and cost of goods." },
  { name: "Opportunity capture rate", weight: 2, fedBy: "Conversion", connect: "Already measured from the results ledger." },
  { name: "Platform engagement", weight: 2, fedBy: "Growth Readiness", connect: "Already measured from the results ledger." },
];

export type ScoredDimension = VitalityDimension & {
  score: number | null;
  status: DimensionStatus;
  /** Where the number came from, or why there isn't one. Never a benchmark. */
  evidence: string;
};

export type Vitality = {
  /** null whenever coverage is below MIN_COVERAGE_PCT — the refusal is the point. */
  score: number | null;
  /** Percent of the total weight that is actually measured. */
  coveragePct: number;
  dimensions: ScoredDimension[];
  /** The measured dimension with the lowest score, or null when nothing is measured. */
  weakest: ScoredDimension | null;
  /** Unmeasured dimensions in weight order — the shortest route to a real index. */
  missing: ScoredDimension[];
  note: string;
};

const statusOf = (score: number | null): DimensionStatus =>
  score === null ? "unmeasured" : score >= 70 ? "healthy" : score >= 40 ? "watch" : "alert";

/**
 * Compute the index from whatever is genuinely measured.
 *
 * @param components  Scored components. A component absent from this list, or
 *                    present with a null score, leaves its dimension unmeasured.
 */
export function computeVitality(components: VitalityInput[]): Vitality {
  const byName = new Map(components.map((c) => [c.name, c]));

  const dimensions: ScoredDimension[] = VITALITY_DIMENSIONS.map((d) => {
    const source = d.fedBy ? byName.get(d.fedBy) : undefined;
    const score = source && typeof source.score === "number" ? Math.max(0, Math.min(100, Math.round(source.score))) : null;
    return {
      ...d,
      score,
      status: statusOf(score),
      evidence: score === null
        ? d.fedBy
          ? `Not measured. ${d.connect}`
          : `Nothing in this platform measures it yet. ${d.connect}`
        : `${score}/100, from ${d.fedBy} — ${source!.note}`,
    };
  });

  const measured = dimensions.filter((d) => d.score !== null);
  const coverageWeight = measured.reduce((a, d) => a + d.weight, 0);
  const totalWeight = VITALITY_DIMENSIONS.reduce((a, d) => a + d.weight, 0);
  const coveragePct = totalWeight === 0 ? 0 : Math.round((coverageWeight / totalWeight) * 100);

  // Weighted over the MEASURED weight only. Dividing by the full 100 would
  // silently score every unconnected dimension as zero, which is the same lie
  // as inventing one — just pointed downwards.
  const score = coveragePct >= MIN_COVERAGE_PCT && coverageWeight > 0
    ? Math.round(measured.reduce((a, d) => a + (d.score as number) * d.weight, 0) / coverageWeight)
    : null;

  const weakest = measured.length ? [...measured].sort((a, b) => (a.score as number) - (b.score as number))[0] : null;
  const missing = dimensions.filter((d) => d.score === null).sort((a, b) => b.weight - a.weight);

  return {
    score, coveragePct, dimensions, weakest, missing,
    note: score !== null
      ? `Weighted across ${measured.length} of ${dimensions.length} dimensions — ${coveragePct}% of the index's weight. The rest are listed unmeasured rather than assumed.`
      : measured.length === 0
        ? "Nothing is measured yet, so there is no index. The dimensions below say what each one needs."
        : `Only ${coveragePct}% of the index's weight is measured, against the ${MIN_COVERAGE_PCT}% needed for a composite to mean anything. ${measured.length} dimension${measured.length === 1 ? " is" : "s are"} shown on its own below; the rest name what to connect.`,
  };
}
