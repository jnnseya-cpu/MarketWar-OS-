// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar ACU Economics Engine — the utility-company pricing layer.
//
// Doctrine (owner pricing law + docs/ai-os/08 §A): MarketWar OS never sells AI
// at cost. Every AI action must generate positive gross margin, floored at
// 100% (retail ≥ 2× provider cost) and targeted far higher. Users only ever
// see ACUs — provider costs are never exposed. Every request flows:
//
//   User Request → AI Gateway → Cost Engine → Margin Engine → ACU Calculator
//                → Profit-Protection check → Provider Arbitration → Execution
//
// This module is the Cost/Margin/ACU/Profit/Arbitration core. It is pure and
// deterministic so it works in demo mode and can be unit-checked.

export const ACU_PER_GBP = 100; // £1 = 100 ACUs (platform-wide constant)
export const MARGIN_FLOOR = 2; // never below 2× provider cost (100% margin)
export const STRATEGIC_TARGET_MARGIN = 4; // 400%+ average platform target

// ---------------------------------------------------------------------------
// Action classes — margin bands by cost tier (spec: low/medium/high/very-high)
// ---------------------------------------------------------------------------
export type ActionClass = "low" | "medium" | "high" | "very_high";

export const ACTION_CLASSES: Record<ActionClass, {
  label: string;
  examples: string[];
  marginMin: number; // low end of the band
  marginMax: number; // high end of the band
  resourceWeight: number; // heavier actions cost more ACUs
}> = {
  low: {
    label: "Low cost", examples: ["simple chat", "email draft", "social post", "text rewrite"],
    marginMin: 5, marginMax: 8, resourceWeight: 1,
  },
  medium: {
    label: "Medium cost", examples: ["research", "market analysis", "website copy", "business plan"],
    marginMin: 4, marginMax: 6, resourceWeight: 1.4,
  },
  high: {
    label: "High cost", examples: ["image generation", "brand design", "logo variations", "product mockups"],
    marginMin: 3, marginMax: 5, resourceWeight: 2,
  },
  very_high: {
    label: "Very high cost", examples: ["video generation", "voice cloning", "long-form rendering"],
    marginMin: 4, marginMax: 8, resourceWeight: 3,
  },
};

// NOTE (owner directive 2026-07-19): every SPECIFIC price / membership tier /
// subscription fee / ACU allotment below is an INDICATIVE PLACEHOLDER — the
// owner sets the final numbers at launch. What is fixed here is the MACHINERY
// (the margin floor + target, the pricing formula, profit protection and
// arbitration); the tunable values are config, not doctrine.

// Speed and premium-model multipliers charge extra ACUs (spec revenue
// multipliers). Values indicative — final numbers set at launch.
export const SPEED_TIERS = { normal: 20, priority: 50, instant: 100 } as const;
export const MODEL_TIERS = { standard: 50, premium: 120 } as const;
export type SpeedTier = keyof typeof SPEED_TIERS;

// Subscription + ACU hybrid plans. Unused ACUs expire monthly (predictable
// revenue). Allotments indicative placeholders — owner finalises at launch.
export const PLANS = [
  { id: "starter", label: "Starter", acusIncluded: 500, indicative: true },
  { id: "growth", label: "Growth", acusIncluded: 5000, indicative: true },
  { id: "business", label: "Business", acusIncluded: 25000, indicative: true },
  { id: "enterprise", label: "Enterprise", acusIncluded: null as number | null, indicative: true }, // negotiated
];

const clampMargin = (m: number) => Math.max(MARGIN_FLOOR, m);
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

// ---------------------------------------------------------------------------
// Dynamic ACU pricing (spec formula)
//   ACUs = Provider Cost × Complexity × Resource Weight × Margin × Demand
// ---------------------------------------------------------------------------
export type AcuQuoteInput = {
  providerCostGbp: number; // true provider cost — NEVER exposed to the user
  actionClass: ActionClass;
  complexity?: number; // 1 = simple … 3 = very complex
  demandMultiplier?: number; // 1 = normal … >1 under peak load
  marginMultiplier?: number; // override the band; still floored at 2×
  variants?: number;
  speed?: SpeedTier;
  premiumModel?: boolean;
};

export type AcuQuote = {
  acus: number;
  retailGbp: number; // what the ACUs are worth — for internal margin math only
  marginMultiplier: number;
  marginPct: number; // gross margin %
  addOnAcus: number; // speed + premium-model surcharges
  breakdown: string[];
  estimatedSeconds: number;
  // Provider cost is deliberately NOT returned to any client surface.
};

export function quoteAcu(input: AcuQuoteInput): AcuQuote {
  const cls = ACTION_CLASSES[input.actionClass];
  const complexity = Math.max(1, input.complexity ?? 1);
  const demand = Math.max(1, input.demandMultiplier ?? 1);
  const variants = Math.max(1, input.variants ?? 1);
  // Default margin = midpoint of the class band; floored at 2×.
  const margin = clampMargin(input.marginMultiplier ?? (cls.marginMin + cls.marginMax) / 2);

  const providerCost = Math.max(0, input.providerCostGbp) * variants;
  const retailGbp = providerCost * complexity * cls.resourceWeight * margin * demand;
  const baseAcus = Math.ceil(retailGbp * ACU_PER_GBP);

  const speedAcus = input.speed ? SPEED_TIERS[input.speed] - SPEED_TIERS.normal : 0;
  const premiumAcus = input.premiumModel ? MODEL_TIERS.premium - MODEL_TIERS.standard : 0;
  const addOnAcus = Math.max(0, speedAcus) + Math.max(0, premiumAcus);
  const acus = baseAcus + addOnAcus;

  const marginPct = providerCost > 0 ? round((retailGbp - providerCost) / providerCost * 100, 0) : 0;
  const estimatedSeconds = Math.round(complexity * cls.resourceWeight * 40 * variants / (input.speed === "instant" ? 4 : input.speed === "priority" ? 2 : 1));

  return {
    acus,
    retailGbp: round(retailGbp, 3),
    marginMultiplier: round(margin, 2),
    marginPct,
    addOnAcus,
    breakdown: [
      `class "${cls.label}" (×${cls.resourceWeight} resource), complexity ×${complexity}, demand ×${demand}`,
      `margin ×${round(margin, 2)} (band ${cls.marginMin}–${cls.marginMax}×, floor ${MARGIN_FLOOR}×) → ${baseAcus} ACUs`,
      addOnAcus ? `+ ${addOnAcus} ACUs add-ons (${input.speed ?? "normal"} speed${input.premiumModel ? ", premium model" : ""})` : "no add-ons",
      `≈ £${round(retailGbp, 2)} value · gross margin ${marginPct}%`,
    ],
    estimatedSeconds,
  };
}

// Pre-execution approval object — "This task will consume N ACUs. Generate?"
export function preflightQuote(input: AcuQuoteInput): { acus: number; estimatedSeconds: number; prompt: string } {
  const q = quoteAcu(input);
  return {
    acus: q.acus,
    estimatedSeconds: q.estimatedSeconds,
    prompt: `This task will consume ${q.acus} ACUs · est. ${q.estimatedSeconds < 60 ? `${q.estimatedSeconds}s` : `${Math.ceil(q.estimatedSeconds / 60)} min`}. Generate?`,
  };
}

// ---------------------------------------------------------------------------
// Profit Protection Engine — no task runs at a loss (spec)
// ---------------------------------------------------------------------------
export type ProfitDecision = {
  marginPct: number;
  ok: boolean;
  action: "run" | "switch_provider" | "cheaper_model" | "reduce_quality" | "request_topup" | "queue";
  reason: string;
};

export function profitCheck(input: {
  expectedRevenueGbp: number; // ACUs the user will spend, in £
  expectedCostGbp: number; // provider cost
  userAcuBalance?: number; // if known, gate on affordability
  requiredAcus?: number;
  minMarginMultiplier?: number; // threshold; default the 2× floor
}): ProfitDecision {
  const floor = clampMargin(input.minMarginMultiplier ?? MARGIN_FLOOR);
  const cost = Math.max(0, input.expectedCostGbp);
  const marginX = cost > 0 ? input.expectedRevenueGbp / cost : Infinity;
  const marginPct = cost > 0 ? round((input.expectedRevenueGbp - cost) / cost * 100, 0) : 100;

  if (input.userAcuBalance != null && input.requiredAcus != null && input.userAcuBalance < input.requiredAcus) {
    return { marginPct, ok: false, action: "request_topup", reason: `Balance ${input.userAcuBalance} < required ${input.requiredAcus} ACUs — request top-up.` };
  }
  if (marginX >= floor) {
    return { marginPct, ok: true, action: "run", reason: `Margin ${marginPct}% ≥ floor (${floor}×) — run.` };
  }
  // Below floor → escalate cost-reduction in order of least user impact.
  return { marginPct, ok: false, action: "switch_provider", reason: `Margin ${marginPct}% below ${floor}× floor — arbitrate to a cheaper capable provider before running (else cheaper model → reduce quality → queue).` };
}

// ---------------------------------------------------------------------------
// Provider Arbitration Engine — cheapest model that clears the quality bar
// ---------------------------------------------------------------------------
export type ProviderCandidate = { id: string; costGbp: number; qualityScore: number; healthy?: boolean };

export function arbitrateProvider(candidates: ProviderCandidate[], minQuality: number): ProviderCandidate | null {
  const capable = candidates
    .filter((c) => c.qualityScore >= minQuality && c.healthy !== false)
    .sort((a, b) => a.costGbp - b.costGbp);
  return capable[0] ?? null;
}
