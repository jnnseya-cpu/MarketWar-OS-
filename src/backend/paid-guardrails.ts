// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE RULES MONEY OBEYS.
//
// `budget.ts` already decides SCALE / FIX / STOP and already reroutes waste. Two
// things it does not do, and this module adds without touching it:
//
//   • Its thresholds are hardwired — ROAS below 1 stops, 3 or above scales. Those
//     are reasonable defaults and they are not everybody's numbers. A florist at
//     70% margin and an agency at 15% cannot share a scale floor.
//   • Nothing enforces a ceiling. There is no daily budget, no campaign budget,
//     no maximum single scale step, so "AI cannot exceed budgets" was a sentence
//     rather than a computation.
//
// THREE RULES THAT MAKE THIS A GUARDRAIL RATHER THAN A NUMBER GENERATOR.
//
// 1. IT REFUSES TO JUDGE THIN EVIDENCE. A campaign with four clicks has a CPA,
//    and that CPA means nothing. `posting-time.ts` already refuses to name a
//    best hour below 40 clicks; the same discipline applies to money, and it
//    matters more. Every decision below either has enough evidence or says it
//    does not — it never splits the difference with a confident guess.
//
// 2. IT SEPARATES "NOT WORKING" FROM "NOT KNOWN YET". Zero conversions on £8 of
//    spend is a Tuesday. Zero conversions on £400 is a decision. The trigger is
//    the test cap being exceeded, not the zero.
//
// 3. SCALING IS A SMALL STEP AND A RECOMMENDATION. The spec is explicit —
//    do not aggressively multiply budget in one step unless explicitly
//    authorised — so the default move is +20% and anything larger requires the
//    caller to say so in as many words.
//
// Nothing here spends money. It produces decisions; the spend lane of the
// emergency stop and the approval queue still stand between a decision and a
// pound leaving.

/** §51's fields, by their names in the spec. */
export type Guardrails = {
  dailyBudgetGbp?: number;
  campaignBudgetGbp?: number;
  monthlyBudgetGbp?: number;
  /** Most we will pay to acquire one customer. Above it, stop. */
  maxCpaGbp?: number;
  /** Below this return on ad spend, stop. */
  minimumRoas: number;
  /** How much may be spent proving a campaign before it must show something. */
  maxTestSpendGbp: number;
  /** The largest single increase, as a percentage. Never "double it". */
  maximumScalePct: number;
  /** ROAS at or above which a campaign is a winner worth feeding. */
  scaleRoas: number;
};

/**
 * Defaults chosen to preserve `budget.ts`'s existing behaviour exactly.
 *
 * `minimumRoas: 1` and `scaleRoas: 3` are the numbers that file already uses, so
 * a deployment that sets nothing behaves precisely as it does today. Making an
 * existing threshold configurable must never quietly change it.
 */
export const DEFAULT_GUARDRAILS: Guardrails = {
  minimumRoas: 1,
  maxTestSpendGbp: 150,
  maximumScalePct: 20,
  scaleRoas: 3,
};

/** Below these, there is not enough evidence to decide anything about money. */
export const MIN_SPEND_TO_JUDGE_GBP = 25;
export const MIN_CONVERSIONS_TO_JUDGE_CPA = 5;

export function guardrailsFrom(partial: Partial<Guardrails> = {}): Guardrails {
  const n = (v: unknown, fallback: number, min: number, max: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? x : fallback;
  };
  const g: Guardrails = {
    minimumRoas: n(partial.minimumRoas, DEFAULT_GUARDRAILS.minimumRoas, 0, 100),
    maxTestSpendGbp: n(partial.maxTestSpendGbp, DEFAULT_GUARDRAILS.maxTestSpendGbp, 1, 1_000_000),
    // Capped at 100%: the spec forbids aggressive multiplication in one step, so
    // the ceiling on the ceiling is "never more than double, ever".
    maximumScalePct: n(partial.maximumScalePct, DEFAULT_GUARDRAILS.maximumScalePct, 1, 100),
    scaleRoas: n(partial.scaleRoas, DEFAULT_GUARDRAILS.scaleRoas, 0, 100),
  };
  if (partial.dailyBudgetGbp !== undefined) g.dailyBudgetGbp = n(partial.dailyBudgetGbp, 0, 0, 10_000_000);
  if (partial.campaignBudgetGbp !== undefined) g.campaignBudgetGbp = n(partial.campaignBudgetGbp, 0, 0, 10_000_000);
  if (partial.monthlyBudgetGbp !== undefined) g.monthlyBudgetGbp = n(partial.monthlyBudgetGbp, 0, 0, 10_000_000);
  if (partial.maxCpaGbp !== undefined) g.maxCpaGbp = n(partial.maxCpaGbp, 0, 0, 1_000_000);
  // A scale floor below the stop floor would mean every campaign is both a
  // winner and a loser. Enforced by derivation rather than by asking the caller
  // to be careful.
  if (g.scaleRoas < g.minimumRoas) g.scaleRoas = g.minimumRoas;
  return g;
}

// ---------------------------------------------------------------------------
// §53 — stop-loss
// ---------------------------------------------------------------------------

export const STOP_REASONS = [
  "cpa_over_max", "test_spend_exceeded", "roas_below_minimum",
  "conversion_collapse", "platform_error", "compliance_issue",
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export type CampaignFacts = {
  name: string;
  spendGbp: number;
  revenueGbp?: number;
  conversions?: number;
  clicks?: number;
  /** Set when the ad platform itself is refusing to run it. */
  platformError?: string;
  /** Set when a compliance check flagged the creative. */
  complianceIssue?: string;
};

export type StopDecision = {
  action: "stop" | "watch" | "continue" | "cannot_judge";
  reasons: StopReason[];
  /** Plain sentence, with the numbers that produced it. */
  detail: string;
  /** Every figure quoted above, so nothing is a bare assertion. */
  evidence: { spendGbp: number; revenueGbp: number; roas: number | null; cpaGbp: number | null; conversions: number };
};

/**
 * Should this campaign be paused?
 *
 * A platform error or a compliance flag stops it regardless of evidence — those
 * are facts, not measurements, and waiting for statistical confidence while a
 * rejected ad burns budget is not prudence.
 */
export function stopLoss(c: CampaignFacts, gIn: Partial<Guardrails> = {}): StopDecision {
  const g = guardrailsFrom(gIn);
  const spend = Math.max(0, Number(c.spendGbp) || 0);
  const revenue = Math.max(0, Number(c.revenueGbp) || 0);
  const conversions = Math.max(0, Number(c.conversions) || 0);
  const roas = spend > 0 ? revenue / spend : null;
  const cpa = conversions > 0 ? spend / conversions : null;
  const evidence = { spendGbp: spend, revenueGbp: revenue, roas, cpaGbp: cpa, conversions };

  const reasons: StopReason[] = [];

  // Facts first — these need no sample size.
  if (c.platformError) reasons.push("platform_error");
  if (c.complianceIssue) reasons.push("compliance_issue");
  if (reasons.length) {
    return {
      action: "stop", reasons, evidence,
      detail: [
        c.platformError ? `The ad platform is refusing this campaign: ${c.platformError}.` : "",
        c.complianceIssue ? `A compliance check flagged the creative: ${c.complianceIssue}.` : "",
        "Neither needs a sample size — spend against a campaign that cannot run is spend for nothing.",
      ].filter(Boolean).join(" "),
    };
  }

  // The test cap is a spend fact, so it applies before the evidence gate: the
  // whole point is that it fires when a campaign has spent enough to have shown
  // something and has not.
  if (spend > g.maxTestSpendGbp && revenue <= 0) {
    reasons.push("test_spend_exceeded");
    return {
      action: "stop", reasons, evidence,
      detail: `£${spend.toFixed(2)} spent with no revenue at all, past the £${g.maxTestSpendGbp} test cap. Zero return on a few pounds is a Tuesday; on £${spend.toFixed(0)} it is a decision.`,
    };
  }

  // Below this there is no judgement to make, and saying so is the honest
  // answer rather than a verdict dressed up as one.
  if (spend < MIN_SPEND_TO_JUDGE_GBP) {
    return {
      action: "cannot_judge", reasons: [], evidence,
      detail: `Only £${spend.toFixed(2)} spent. Nothing can be concluded below £${MIN_SPEND_TO_JUDGE_GBP} — a campaign with four clicks has a CPA and it means nothing.`,
    };
  }

  if (roas !== null && roas < g.minimumRoas) reasons.push("roas_below_minimum");
  if (g.maxCpaGbp !== undefined && cpa !== null && conversions >= MIN_CONVERSIONS_TO_JUDGE_CPA && cpa > g.maxCpaGbp) {
    reasons.push("cpa_over_max");
  }
  if (conversions === 0 && spend >= g.maxTestSpendGbp / 2) reasons.push("conversion_collapse");

  // A CPA read from too few conversions is a warning, not a kill order — but it
  // must still be SAID. The first version of this computed it and then dropped
  // it whenever nothing else had failed, so a campaign at £45 a customer against
  // a £20 ceiling was reported as "inside every guardrail". The `watch` state
  // existed in the type and nothing ever produced it, which is the tell.
  const thinCpa = g.maxCpaGbp !== undefined && cpa !== null && conversions < MIN_CONVERSIONS_TO_JUDGE_CPA && cpa > g.maxCpaGbp;

  if (!reasons.length) {
    if (thinCpa) {
      return {
        action: "watch", reasons, evidence,
        detail: `£${spend.toFixed(2)} spent at ${(roas ?? 0).toFixed(2)}× return — inside the return floor. But £${(cpa ?? 0).toFixed(2)} per customer is above the £${g.maxCpaGbp} ceiling, and only ${conversions} conversion${conversions === 1 ? "" : "s"} produced that figure, which is too few to act on. Watch it.`,
      };
    }
    return {
      action: "continue", reasons, evidence,
      detail: `£${spend.toFixed(2)} spent, ${roas !== null ? `${roas.toFixed(2)}× return` : "no return recorded"}${cpa !== null ? `, £${cpa.toFixed(2)} per customer` : ""}. Inside every guardrail.`,
    };
  }

  const parts = [
    reasons.includes("roas_below_minimum") ? `${(roas ?? 0).toFixed(2)}× return is below the ${g.minimumRoas}× floor` : "",
    reasons.includes("cpa_over_max") ? `£${(cpa ?? 0).toFixed(2)} per customer is above the £${g.maxCpaGbp} ceiling, across ${conversions} conversions` : "",
    reasons.includes("conversion_collapse") ? `no conversions at all on £${spend.toFixed(2)}` : "",
  ].filter(Boolean);

  return {
    action: "stop", reasons, evidence,
    detail: `Pause it: ${parts.join("; ")}.${thinCpa ? ` Cost per customer also looks high but only ${conversions} conversion${conversions === 1 ? "" : "s"} produced it, which is too few to rely on.` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// §52 — scale the winner, one step at a time
// ---------------------------------------------------------------------------

export type ScaleDecision = {
  action: "scale" | "hold" | "cannot_judge";
  /** The new daily or campaign figure being proposed. */
  fromGbp: number;
  toGbp: number;
  stepPct: number;
  detail: string;
  /** True when the step was trimmed to stay inside a budget ceiling. */
  cappedByBudget: boolean;
};

/**
 * How much more, if any.
 *
 * The default is +20% and the ceiling on any single step is whatever
 * `maximumScalePct` says, itself capped at 100%. A caller who genuinely wants a
 * bigger jump passes `authorisedPct` — which is what "unless explicitly
 * authorised" has to mean if it is to mean anything.
 */
export function scaleStep(input: {
  campaign: CampaignFacts;
  currentBudgetGbp: number;
  spentThisMonthGbp?: number;
  authorisedPct?: number;
}, gIn: Partial<Guardrails> = {}): ScaleDecision {
  const g = guardrailsFrom(gIn);
  const c = input.campaign;
  const spend = Math.max(0, Number(c.spendGbp) || 0);
  const revenue = Math.max(0, Number(c.revenueGbp) || 0);
  const current = Math.max(0, Number(input.currentBudgetGbp) || 0);
  const roas = spend > 0 ? revenue / spend : 0;

  const flat = (detail: string, action: ScaleDecision["action"]): ScaleDecision =>
    ({ action, fromGbp: current, toGbp: current, stepPct: 0, detail, cappedByBudget: false });

  if (spend < MIN_SPEND_TO_JUDGE_GBP) {
    return flat(`Only £${spend.toFixed(2)} spent — too little to call anything a winner. Nothing is scaled on a hunch.`, "cannot_judge");
  }
  if (roas < g.scaleRoas) {
    return flat(`${roas.toFixed(2)}× return is below the ${g.scaleRoas}× winner floor, so this is not something to feed yet.`, "hold");
  }

  const requested = Math.min(Math.max(1, input.authorisedPct ?? g.maximumScalePct), Math.max(g.maximumScalePct, input.authorisedPct ?? 0));
  const stepPct = input.authorisedPct !== undefined
    ? Math.min(Math.max(1, input.authorisedPct), 100)
    : Math.min(g.maximumScalePct, requested);

  let target = Math.round(current * (1 + stepPct / 100) * 100) / 100;
  let cappedByBudget = false;

  // §51: the AI cannot exceed a budget, so the step is trimmed rather than the
  // ceiling being ignored.
  const spentThisMonth = Math.max(0, Number(input.spentThisMonthGbp) || 0);
  if (g.monthlyBudgetGbp !== undefined) {
    const headroom = Math.max(0, g.monthlyBudgetGbp - spentThisMonth);
    if (target > headroom) { target = Math.round(headroom * 100) / 100; cappedByBudget = true; }
  }
  if (g.campaignBudgetGbp !== undefined && target > g.campaignBudgetGbp) {
    target = g.campaignBudgetGbp; cappedByBudget = true;
  }
  if (g.dailyBudgetGbp !== undefined && target > g.dailyBudgetGbp) {
    target = g.dailyBudgetGbp; cappedByBudget = true;
  }

  if (target <= current) {
    // Reporting `current` here would name money that is not available: if the
    // monthly headroom is £60 and the campaign is running at £100, £100 is not
    // "as high as the guardrails allow" — it is already over. The honest figure
    // is what is actually left.
    const reachable = Math.min(current, target);
    return {
      action: "hold", fromGbp: current, toGbp: reachable, stepPct: 0, cappedByBudget: true,
      detail: reachable < current
        ? `${roas.toFixed(2)}× return earns more budget, but only £${reachable.toFixed(2)} is left under the ceiling — below the £${current.toFixed(2)} it is running at now. Lower it or raise the ceiling.`
        : `${roas.toFixed(2)}× return earns more budget, but £${current.toFixed(2)} is already as high as the guardrails allow.`,
    };
  }

  const actualPct = current > 0 ? Math.round(((target - current) / current) * 1000) / 10 : stepPct;
  return {
    action: "scale", fromGbp: current, toGbp: target, stepPct: actualPct, cappedByBudget,
    detail: `${roas.toFixed(2)}× return over £${spend.toFixed(2)} of spend. Raise £${current.toFixed(2)} to £${target.toFixed(2)} — ${actualPct}%${cappedByBudget ? ", trimmed to stay inside the budget ceiling" : ""}. One step, then measure again.`,
  };
}

// ---------------------------------------------------------------------------
// §51 — the ceiling itself
// ---------------------------------------------------------------------------

export type BudgetVerdict = {
  allowed: boolean;
  /** What may actually be spent, which can be less than was asked for. */
  allowedGbp: number;
  reason: string;
  /** Which ceiling bit, when one did. */
  limit?: "daily" | "campaign" | "monthly";
};

/** May this spend go ahead? Computed, so "AI cannot exceed budgets" is a fact rather than a policy. */
export function withinBudget(input: {
  proposedGbp: number;
  spentTodayGbp?: number;
  spentThisMonthGbp?: number;
  campaignSpentGbp?: number;
}, gIn: Partial<Guardrails> = {}): BudgetVerdict {
  const g = guardrailsFrom(gIn);
  const proposed = Math.max(0, Number(input.proposedGbp) || 0);
  const checks: { limit: "daily" | "campaign" | "monthly"; headroom: number; ceiling: number }[] = [];

  if (g.dailyBudgetGbp !== undefined) checks.push({ limit: "daily", ceiling: g.dailyBudgetGbp, headroom: g.dailyBudgetGbp - Math.max(0, Number(input.spentTodayGbp) || 0) });
  if (g.campaignBudgetGbp !== undefined) checks.push({ limit: "campaign", ceiling: g.campaignBudgetGbp, headroom: g.campaignBudgetGbp - Math.max(0, Number(input.campaignSpentGbp) || 0) });
  if (g.monthlyBudgetGbp !== undefined) checks.push({ limit: "monthly", ceiling: g.monthlyBudgetGbp, headroom: g.monthlyBudgetGbp - Math.max(0, Number(input.spentThisMonthGbp) || 0) });

  if (!checks.length) {
    return { allowed: true, allowedGbp: proposed, reason: "No budget ceiling is set, so nothing here limits this. Set one to make the limit real." };
  }

  const tightest = checks.reduce((a, b) => (b.headroom < a.headroom ? b : a));
  const headroom = Math.max(0, Math.round(tightest.headroom * 100) / 100);

  if (headroom <= 0) {
    return { allowed: false, allowedGbp: 0, limit: tightest.limit, reason: `The ${tightest.limit} budget of £${tightest.ceiling} is already spent. Nothing further goes out until it resets or the ceiling is raised.` };
  }
  if (proposed > headroom) {
    return { allowed: true, allowedGbp: headroom, limit: tightest.limit, reason: `£${proposed.toFixed(2)} was proposed and £${headroom.toFixed(2)} is left under the ${tightest.limit} budget of £${tightest.ceiling}. Trimmed to the headroom rather than refused.` };
  }
  return { allowed: true, allowedGbp: proposed, reason: `£${proposed.toFixed(2)} is inside every ceiling — £${headroom.toFixed(2)} of ${tightest.limit} headroom remains.` };
}

export const GUARDRAIL_DOCTRINE = [
  "It refuses to judge thin evidence. A campaign with four clicks has a cost per customer and that number means nothing — below the floor the answer is \"cannot judge\", never a confident verdict.",
  "\"Not working\" and \"not known yet\" are different. Zero conversions on £8 is a Tuesday; zero on £400 is a decision. The trigger is the test cap, not the zero.",
  "Scaling is one small step. The default is +20% and no single step may ever more than double, because a spec that says \"do not aggressively multiply unless explicitly authorised\" needs authorisation to be an argument somebody passes, not a comment.",
  "A budget ceiling trims the step rather than being ignored. \"AI cannot exceed budgets\" is a computation here, not a policy anybody has to remember.",
  "Defaults reproduce the existing thresholds exactly. Making a hardwired number configurable must never quietly change it.",
  "Nothing here spends money. It produces decisions — the spend lane of the emergency stop and the approval queue still stand between a decision and a pound leaving.",
];
