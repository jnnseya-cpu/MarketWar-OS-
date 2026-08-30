// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// §50 — WHERE THE LADDER MEETS THE MONEY.
//
// `shared/boost-ladder.ts` decides what SHOULD happen to a post: it compares the
// post to the brand's own median, refuses thin evidence, and says which rung is
// next. It knows nothing about ceilings, halts or what an offer can afford, and
// that is deliberate — it is pure so every money-shaped branch is testable.
//
// This file is the composition, and it exists because a decision is not a
// permission. Four things stand between "this post has earned £50" and £50
// leaving, and NONE of them are re-implemented here:
//
//   • `paid-guardrails.withinBudget`  — the daily / campaign / monthly ceilings.
//     A proposal over the headroom is TRIMMED to it, never refused outright and
//     never allowed to step over it.
//   • `paid-guardrails.stopLoss`      — the stop rules. A campaign the stop-loss
//     wants stopped is never simultaneously scaled by the ladder, which is the
//     obvious contradiction and therefore the one to make impossible.
//   • `profit-guard-economics.economicsFor` — what the offer can actually afford
//     per customer. The ladder is TOLD `maxCpaGbp`; it never guesses one.
//   • `emergency-stop.currentHalt`    — the spend lane. If spending is halted,
//     every step is blocked and says so.
//
// THE ORDER MATTERS AND IS NOT ARBITRARY. Facts that need no sample size are
// checked before measurements that do: a halt and a stop-loss are asked first,
// so a halted account is never told a cheerful "raise it to £72" that it cannot
// act on. Reporting an amount somebody cannot spend is the same defect as
// reporting a success that did not happen.

import { currentHalt } from "@/backend/emergency-stop";
import { economicsFor, type OfferEconomics } from "@/backend/profit-guard-economics";
import {
  guardrailsFrom, scaleStep, stopLoss, withinBudget,
  MIN_CONVERSIONS_TO_JUDGE_CPA, type CampaignFacts, type Guardrails,
} from "@/backend/paid-guardrails";
import {
  assessOrganic, nextStep, organicBaseline,
  type LadderStep, type OrganicBaseline, type OrganicPost, type OrganicVerdict, type Rung, type TestResult,
} from "@/shared/boost-ladder";

export type BoostPlan = {
  postId: string;
  rung: Rung;
  baseline: OrganicBaseline;
  organic: OrganicVerdict;
  step: LadderStep;
  /** What may ACTUALLY be spent after every ceiling — this is the figure to act on. */
  approvedGbp: number;
  /** True when the amount was reduced by a ceiling rather than by the ladder. */
  trimmed: boolean;
  /** Everything standing in the way. Empty means the step can be taken now. */
  blockers: string[];
  /** The offer's own ceiling per customer, when an offer was supplied. */
  maxCpaGbp?: number;
  /** Plain sentence naming what happens next and why. */
  summary: string;
};

/**
 * Plan one post's next move, with every ceiling applied.
 *
 * `history` is the brand's OWN past posts — the baseline is computed from them
 * and from nothing else. Passing an empty history is not an error: it produces
 * "there is no normal to beat yet", which is the truthful answer for a new brand
 * and the one place a lesser version of this would have invented a benchmark.
 */
export async function planBoost(input: {
  post: OrganicPost;
  history: OrganicPost[];
  rung?: Rung;
  test?: TestResult;
  currentBudgetGbp?: number;
  testBudgetGbp?: number;
  /** The offer being sold, so the affordable cost per customer is computed not guessed. */
  offer?: OfferEconomics;
  guardrails?: Partial<Guardrails>;
  spentTodayGbp?: number;
  spentThisMonthGbp?: number;
  campaignSpentGbp?: number;
  /** Emergency-stop scope, normally the brand id. */
  scope?: string;
  nowISO?: string;
}): Promise<BoostPlan> {
  const g = guardrailsFrom(input.guardrails ?? {});
  const rung: Rung = input.rung ?? "organic";
  const blockers: string[] = [];

  // A post must never sit in its own baseline. Comparing something to a median
  // it helped set drags the bar toward itself — an outstanding post pulls the
  // median up and partly hides its own outperformance.
  const history = input.history.filter((p) => p.id !== input.post.id);
  const baseline = organicBaseline(history);
  const organic = assessOrganic(input.post, baseline, input.nowISO);

  // ---- Facts that need no sample size, asked first -------------------------
  const halt = await currentHalt(input.scope || "*").catch(() => null);
  if (halt) blockers.push("Spending is halted by the emergency stop.");

  // What the offer can afford per customer. Never guessed: with no offer the
  // ladder is told nothing rather than told a plausible number.
  const economics = input.offer ? economicsFor(input.offer) : null;
  const maxCpaGbp = economics
    ? Math.round((economics.maxCpaPence / 100) * 100) / 100
    : g.maxCpaGbp;

  // The stop-loss and the ladder must never disagree about the same campaign.
  const facts: CampaignFacts | null = input.test
    ? { name: input.post.id, spendGbp: input.test.spendGbp, revenueGbp: input.test.revenueGbp, conversions: input.test.conversions }
    : null;
  const stop = facts ? stopLoss(facts, { ...input.guardrails, ...(maxCpaGbp !== undefined ? { maxCpaGbp } : {}) }) : null;
  if (stop?.action === "stop") blockers.push(`The stop-loss wants this paused: ${stop.detail}`);

  const testBudgetGbp = Math.max(0, Number(input.testBudgetGbp ?? g.maxTestSpendGbp) || 0);

  const step = nextStep({
    rung, organic, test: input.test, testBudgetGbp,
    currentBudgetGbp: input.currentBudgetGbp,
    ...(maxCpaGbp !== undefined ? { maxCpaGbp } : {}),
    scalePct: g.maximumScalePct,
    scaleRoas: g.scaleRoas,
    minConversions: MIN_CONVERSIONS_TO_JUDGE_CPA,
  });
  blockers.push(...step.blockers);

  // ---- Apply the ceilings -------------------------------------------------
  //
  // Only to a step that actually proposes money. Running a budget check on a
  // hold would produce a cheerful "£40 is inside every ceiling" beside a
  // decision to spend nothing, which reads as an approval for a spend nobody
  // proposed.
  let approvedGbp = 0;
  let trimmed = false;

  if (step.proposedGbp > 0) {
    // A scale step goes through `scaleStep` as well, so the ladder can never
    // out-scale the guardrail that owns that arithmetic — this is the one place
    // the two could drift, so the guardrail's answer wins.
    if (step.action === "scale" && facts) {
      const s = scaleStep(
        { campaign: facts, currentBudgetGbp: input.currentBudgetGbp ?? 0, spentThisMonthGbp: input.spentThisMonthGbp },
        input.guardrails ?? {},
      );
      if (s.action === "scale") {
        approvedGbp = Math.min(step.proposedGbp, s.toGbp);
        trimmed = s.cappedByBudget || approvedGbp < step.proposedGbp;
      } else {
        approvedGbp = 0;
        trimmed = true;
        blockers.push(s.detail);
      }
    } else {
      const verdict = withinBudget({
        proposedGbp: step.proposedGbp,
        spentTodayGbp: input.spentTodayGbp,
        spentThisMonthGbp: input.spentThisMonthGbp,
        campaignSpentGbp: input.campaignSpentGbp,
      }, input.guardrails ?? {});
      approvedGbp = verdict.allowed ? verdict.allowedGbp : 0;
      trimmed = verdict.allowedGbp < step.proposedGbp;
      if (!verdict.allowed) blockers.push(verdict.reason);
    }
  }

  // A blocker means nothing is approved, whatever the arithmetic produced. This
  // is stated once, here, rather than trusted to every branch above.
  if (blockers.length) approvedGbp = 0;

  const summary = blockers.length
    ? `${step.reason} Nothing goes ahead yet: ${blockers.join(" ")}`
    : approvedGbp > 0
      ? `${step.reason}${trimmed ? ` Trimmed to £${approvedGbp.toFixed(2)} by a budget ceiling.` : ""}`
      : step.reason;

  return {
    postId: input.post.id, rung, baseline, organic, step,
    approvedGbp, trimmed, blockers,
    ...(maxCpaGbp !== undefined ? { maxCpaGbp } : {}),
    summary,
  };
}

/**
 * Plan every post in one pass, ordered by what deserves attention first.
 *
 * The baseline is computed ONCE from the whole set rather than per post, so a
 * hundred posts do not produce a hundred slightly different versions of "your
 * normal" — and the ordering puts money decisions above observations, because a
 * list sorted by engagement buries the one post that is about to be retired.
 */
export async function planBoosts(input: {
  posts: { post: OrganicPost; rung?: Rung; test?: TestResult; currentBudgetGbp?: number }[];
  history: OrganicPost[];
  offer?: OfferEconomics;
  guardrails?: Partial<Guardrails>;
  testBudgetGbp?: number;
  spentTodayGbp?: number;
  spentThisMonthGbp?: number;
  scope?: string;
  nowISO?: string;
}): Promise<BoostPlan[]> {
  const plans: BoostPlan[] = [];
  for (const row of input.posts) {
    plans.push(await planBoost({
      post: row.post, history: input.history, rung: row.rung, test: row.test,
      currentBudgetGbp: row.currentBudgetGbp,
      testBudgetGbp: input.testBudgetGbp, offer: input.offer, guardrails: input.guardrails,
      spentTodayGbp: input.spentTodayGbp, spentThisMonthGbp: input.spentThisMonthGbp,
      scope: input.scope, nowISO: input.nowISO,
    }));
  }
  const weight: Record<LadderStep["action"], number> = { retire: 0, scale: 1, start_test: 2, cap: 3, hold: 4 };
  return plans.sort((a, b) => weight[a.step.action] - weight[b.step.action] || b.approvedGbp - a.approvedGbp);
}
