// §50 — ORGANIC EARNS THE MONEY BEFORE THE MONEY IS SPENT.
//
// The platform could already recommend amplifying a post (`amplify.ts`) and
// could already decide how much to spend once a campaign was running
// (`paid-guardrails.ts`, `budget.ts`). Nothing joined the two, so the most
// expensive decision in paid media — WHICH piece of content deserves a budget at
// all — was left to whoever was looking at the dashboard.
//
// This is the ladder that joins them. A post climbs it, or it does not:
//
//   organic    Live and gathering evidence. No money. Most content stays here.
//   proven     It beat the brand's OWN organic median by enough, for long enough.
//   testing    A small fixed budget is live. The only rung where money is spent
//              without proof that this content converts.
//   validated  The test produced enough conversions at an affordable cost.
//   scaling    Budget rises one small step at a time, re-gated at every step.
//   capped     At the ceiling the guardrails allow. Not a failure — a limit.
//   retired    It failed a gate. No further money, and the reason is recorded.
//
// ---------------------------------------------------------------------------
// THE FOUR THINGS THAT MAKE THIS A LADDER RATHER THAN A STATE MACHINE
// ---------------------------------------------------------------------------
//
// 1. IT COMPARES A POST TO THE BRAND'S OWN MEDIAN, NEVER TO A CONSTANT.
//    "Engagement above 3%" is the kind of number that sounds like expertise and
//    is worthless: a plumber's audience and a fashion label's audience do not
//    share a benchmark, and a brand whose whole account runs at 8% would have
//    every post promoted. The bar is the brand's own median times a multiple, so
//    "this one is unusually good FOR YOU" is what earns money. A brand with no
//    history has no median, and the honest answer there is "not yet", not 0.
//
// 2. IT REFUSES THIN EVIDENCE AND YOUNG POSTS, SEPARATELY.
//    `paid-guardrails.ts` already refuses to judge money below £25 of spend, and
//    `posting-time.ts` refuses to name a best hour below 40 clicks. The same
//    discipline, twice over: a post with 60 impressions has an engagement rate
//    that means nothing, AND a post three hours old has not finished being seen.
//    Both are "not known yet". Neither is "no".
//
// 3. A GATE THAT CANNOT BE MEASURED IS NEVER PASSED BY DEFAULT.
//    If the brand has no conversion tracking, the test rung cannot tell a winner
//    from a loser, so the ladder REFUSES to promote past `testing` and says why.
//    Scaling on engagement because revenue was unavailable is how ad budgets are
//    lost, and "we had no data so we assumed it worked" is the exact sentence
//    this codebase exists to make impossible.
//
// 4. NOTHING HERE SPENDS. It returns a decision, an amount and a reason. The
//    budget ceilings, the emergency stop's spend lane and the approval queue all
//    still stand between this and a pound leaving — see `backend/boost-ladder.ts`,
//    which is where those are applied.

export const RUNGS = ["organic", "proven", "testing", "validated", "scaling", "capped", "retired"] as const;
export type Rung = (typeof RUNGS)[number];

export const RUNG_MEANING: Record<Rung, string> = {
  organic: "Live and being measured. No money is behind it.",
  proven: "It beat your own median by enough, for long enough, to earn a paid test.",
  testing: "A small fixed budget is live. This is the one rung where money runs ahead of proof.",
  validated: "The test converted enough times, at a cost the offer can afford.",
  scaling: "Budget is rising one small step at a time, re-checked at every step.",
  capped: "As high as your guardrails allow. Raise a ceiling to go further.",
  retired: "It failed a gate. No more money goes to it, and the reason is recorded.",
};

/** Below these, a rate is arithmetic without meaning. */
export const MIN_IMPRESSIONS_TO_JUDGE = 400;
/** A post is not finished being seen for at least this long. */
export const MIN_HOURS_LIVE = 24;
/** How far above the brand's own median a post must sit to earn a test. */
export const PROVEN_MULTIPLE = 1.5;
/** A brand needs this many past posts before it has a median worth comparing to. */
export const MIN_POSTS_FOR_BASELINE = 5;

/** One organic post, as measured. Every field is a count, never a rate. */
export type OrganicPost = {
  id: string;
  impressions: number;
  engagements: number;
  clicks?: number;
  /** Conversions attributed to it, when the brand tracks them at all. */
  conversions?: number;
  publishedAtISO: string;
};

/** The brand's own normal, computed from its own history. */
export type OrganicBaseline = {
  /** Null when there is not enough history to have a median. */
  engagementRate: number | null;
  clickRate: number | null;
  posts: number;
  /** True when the medians are safe to compare against. */
  usable: boolean;
  why: string;
};

const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/**
 * Exported because §77's knowledge graph asks the same question one level up —
 * "did posts using this hook beat your normal?" — and a second median written
 * beside this one is exactly how two parts of a platform come to disagree about
 * what a brand's normal is. Median, not mean, for the reason given above.
 */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * The brand's own normal.
 *
 * MEDIAN, NOT MEAN, and that is the whole point. One post that went unusually
 * far drags a mean up far enough that nothing afterwards can clear it — the
 * brand's single best day would silently become the bar every future post has to
 * beat. A median is unmoved by it.
 *
 * Posts below the impression floor are excluded from the baseline as well as
 * from judgement: a handful of 30-impression posts with one like each would
 * otherwise set a median engagement rate of 3% out of noise.
 */
export function organicBaseline(history: OrganicPost[]): OrganicBaseline {
  const usableposts = history.filter((p) => (Number(p.impressions) || 0) >= MIN_IMPRESSIONS_TO_JUDGE);
  const posts = usableposts.length;

  if (posts < MIN_POSTS_FOR_BASELINE) {
    return {
      engagementRate: null, clickRate: null, posts, usable: false,
      why: `Only ${posts} post${posts === 1 ? "" : "s"} with enough reach to measure. A median needs at least ${MIN_POSTS_FOR_BASELINE}, so there is no "normal" to beat yet — that is not a verdict on the content.`,
    };
  }

  const eng = median(usableposts.map((p) => (Number(p.engagements) || 0) / (Number(p.impressions) || 1)));
  const clk = median(usableposts.map((p) => (Number(p.clicks) || 0) / (Number(p.impressions) || 1)));
  return {
    engagementRate: eng, clickRate: clk, posts, usable: true,
    why: `Measured across ${posts} of your own posts. This is your normal, not an industry average.`,
  };
}

export type OrganicVerdict = {
  proven: boolean;
  /** "not_yet" is not "no" — it is the honest answer while evidence accumulates. */
  status: "proven" | "not_yet" | "below_median";
  reason: string;
  evidence: {
    impressions: number;
    hoursLive: number;
    engagementRate: number | null;
    /** How many times the brand's own median this post achieved. */
    multipleOfMedian: number | null;
  };
};

/**
 * Has this post earned a paid test?
 *
 * The two refusals come FIRST and are deliberately separate from the comparison:
 * a post that is too young or too small is not being judged badly, it is not
 * being judged at all, and telling somebody their content underperformed when it
 * has been live for two hours is a lie the numbers cannot support.
 */
export function assessOrganic(post: OrganicPost, baseline: OrganicBaseline, nowISO?: string): OrganicVerdict {
  const impressions = Math.max(0, Number(post.impressions) || 0);
  const engagements = Math.max(0, Number(post.engagements) || 0);
  const now = nowISO ? Date.parse(nowISO) : Date.now();
  const published = Date.parse(post.publishedAtISO);
  const hoursLive = Number.isFinite(published) ? Math.max(0, (now - published) / 3_600_000) : 0;
  const er = rate(engagements, impressions);

  const evidence = { impressions, hoursLive: Math.round(hoursLive * 10) / 10, engagementRate: er, multipleOfMedian: null as number | null };

  if (hoursLive < MIN_HOURS_LIVE) {
    return { proven: false, status: "not_yet", evidence,
      reason: `Live for ${evidence.hoursLive} hours. Nothing is judged before ${MIN_HOURS_LIVE} — a post is still being distributed, and an early number is not a small version of the final one.` };
  }
  if (impressions < MIN_IMPRESSIONS_TO_JUDGE) {
    return { proven: false, status: "not_yet", evidence,
      reason: `${impressions} impressions. Below ${MIN_IMPRESSIONS_TO_JUDGE} the engagement rate is arithmetic without meaning, so this is not measured rather than not good.` };
  }
  if (!baseline.usable || baseline.engagementRate === null) {
    return { proven: false, status: "not_yet", evidence, reason: baseline.why };
  }

  // A baseline of exactly zero would make every post an infinite multiple of it,
  // so the comparison is only made where there is something to be a multiple OF.
  if (baseline.engagementRate <= 0) {
    return { proven: false, status: "not_yet", evidence,
      reason: "Your median engagement rate is zero, so there is no ratio to beat. Nothing is promoted on a comparison to nothing." };
  }

  const multiple = (er ?? 0) / baseline.engagementRate;
  evidence.multipleOfMedian = Math.round(multiple * 100) / 100;

  if (multiple < PROVEN_MULTIPLE) {
    return { proven: false, status: "below_median", evidence,
      reason: `${(er! * 100).toFixed(2)}% engagement against your median of ${(baseline.engagementRate * 100).toFixed(2)}% — ${evidence.multipleOfMedian}×. A paid test needs ${PROVEN_MULTIPLE}×, because money should go behind content that is unusually good for you, not merely average.` };
  }

  return { proven: true, status: "proven", evidence,
    reason: `${(er! * 100).toFixed(2)}% engagement is ${evidence.multipleOfMedian}× your own median of ${(baseline.engagementRate * 100).toFixed(2)}%, over ${impressions} impressions and ${Math.round(hoursLive)} hours. That has earned a paid test.` };
}

/** What the test rung produced, once money has run. */
export type TestResult = {
  spendGbp: number;
  revenueGbp?: number;
  conversions?: number;
  /** False when the brand cannot attribute revenue at all — see gate 3. */
  conversionTracking: boolean;
};

export type LadderStep = {
  from: Rung;
  to: Rung;
  action: "hold" | "start_test" | "scale" | "retire" | "cap";
  /** The budget this step proposes, before any ceiling is applied. Zero means none. */
  proposedGbp: number;
  reason: string;
  /** Everything standing between this decision and a pound leaving. Empty when clear. */
  blockers: string[];
};

/**
 * The next rung, from where a post stands now.
 *
 * PURE, and every branch is drivable without a database or an ad account —
 * which is the only way the money-shaped edges of this get tested rather than
 * assumed. The ceilings, the emergency stop and the approval queue are applied
 * by `backend/boost-ladder.ts`; this decides only what SHOULD happen.
 */
export function nextStep(input: {
  rung: Rung;
  organic: OrganicVerdict;
  test?: TestResult;
  /** The fixed amount a first test is allowed to spend. */
  testBudgetGbp: number;
  /** What the campaign is running at now, once it is running. */
  currentBudgetGbp?: number;
  /** Most the offer can afford to pay for one customer. From `economicsFor`. */
  maxCpaGbp?: number;
  /** The step size the guardrails allow, as a percentage. */
  scalePct: number;
  /** Return at or above which this is a winner worth feeding. */
  scaleRoas: number;
  /** Conversions needed before a cost per customer means anything. */
  minConversions: number;
}): LadderStep {
  const rung = input.rung;
  const hold = (to: Rung, reason: string, blockers: string[] = []): LadderStep =>
    ({ from: rung, to, action: "hold", proposedGbp: 0, reason, blockers });

  if (rung === "retired") {
    return hold("retired", "This was retired. A retired post is not reconsidered automatically — republish it as new content if you believe the first read was wrong.");
  }
  if (rung === "capped") {
    return hold("capped", "Already at the highest budget your guardrails allow. Raise a ceiling to go further; nothing here will step over one.");
  }

  // ---- organic → proven → testing -----------------------------------------
  if (rung === "organic" || rung === "proven") {
    if (!input.organic.proven) {
      // "below_median" is a real answer; "not_yet" is the absence of one. They
      // must not collapse into the same word, because one means wait and the
      // other means this is not the post to spend on.
      return hold("organic", input.organic.reason);
    }
    const budget = Math.max(0, Number(input.testBudgetGbp) || 0);
    if (budget <= 0) {
      return hold("proven", `${input.organic.reason} No test budget is set, though, so nothing starts. Set one and this begins.`, ["No test budget is set."]);
    }
    return {
      from: rung, to: "testing", action: "start_test", proposedGbp: budget, blockers: [],
      reason: `${input.organic.reason} Starting a fixed £${budget.toFixed(2)} test — capped, so a wrong call costs that and nothing more.`,
    };
  }

  // ---- testing → validated / retired --------------------------------------
  if (rung === "testing") {
    const t = input.test;
    if (!t) return hold("testing", "The test is live and has produced no figures yet. Nothing is decided on an empty result.");

    const spend = Math.max(0, Number(t.spendGbp) || 0);
    const conversions = Math.max(0, Number(t.conversions) || 0);
    const revenue = Math.max(0, Number(t.revenueGbp) || 0);

    // GATE 3, and the one that matters most. Without attribution the test cannot
    // distinguish a winner from a loser, so it never graduates — no matter how
    // good the engagement looks.
    if (!t.conversionTracking) {
      return hold("testing",
        "This brand has no conversion tracking, so the test can measure spend but not what it bought. Nothing is scaled on engagement standing in for revenue — connect conversion tracking and this decides itself.",
        ["Conversion tracking is not connected."]);
    }

    const cap = Math.max(0, Number(input.testBudgetGbp) || 0);
    if (conversions < input.minConversions) {
      // "Not working" and "not known yet" are different, and the trigger is the
      // cap being spent — not the zero.
      if (cap > 0 && spend >= cap) {
        return {
          from: rung, to: "retired", action: "retire", proposedGbp: 0, blockers: [],
          reason: `£${spend.toFixed(2)} spent — the whole test budget — for ${conversions} conversion${conversions === 1 ? "" : "s"}, against the ${input.minConversions} needed to judge a cost per customer. The test was given its full run and did not produce one. Retired.`,
        };
      }
      return hold("testing", `£${spend.toFixed(2)} spent and ${conversions} conversion${conversions === 1 ? "" : "s"} so far, against the ${input.minConversions} needed before a cost per customer means anything. Still running.`);
    }

    const cpa = conversions > 0 ? spend / conversions : null;
    if (input.maxCpaGbp !== undefined && cpa !== null && cpa > input.maxCpaGbp) {
      return {
        from: rung, to: "retired", action: "retire", proposedGbp: 0, blockers: [],
        reason: `£${cpa.toFixed(2)} to acquire a customer, against the £${input.maxCpaGbp.toFixed(2)} this offer can afford. It converts — it just cannot be paid for. Retired rather than scaled into a loss.`,
      };
    }

    const roas = spend > 0 ? revenue / spend : 0;
    return {
      from: rung, to: "validated", action: "hold", proposedGbp: 0, blockers: [],
      reason: `${conversions} conversions at £${cpa!.toFixed(2)} each${input.maxCpaGbp !== undefined ? `, inside the £${input.maxCpaGbp.toFixed(2)} this offer affords` : ""}${spend > 0 ? `, a ${roas.toFixed(2)}× return` : ""}. The test paid for itself; this is ready to scale.`,
    };
  }

  // ---- validated / scaling → scaling / capped ------------------------------
  const t = input.test;
  const current = Math.max(0, Number(input.currentBudgetGbp) || 0);
  if (!t) return hold(rung, "No campaign figures, so there is nothing to scale on.");

  const spend = Math.max(0, Number(t.spendGbp) || 0);
  const revenue = Math.max(0, Number(t.revenueGbp) || 0);
  const roas = spend > 0 ? revenue / spend : 0;

  if (roas < input.scaleRoas) {
    return hold(rung, `${roas.toFixed(2)}× return is below the ${input.scaleRoas}× winner floor. Held at £${current.toFixed(2)} — it is not losing money, it has simply not earned more.`);
  }

  const step = Math.max(1, Math.min(100, Number(input.scalePct) || 0));
  const to = Math.round(current * (1 + step / 100) * 100) / 100;
  return {
    from: rung, to: "scaling", action: "scale", proposedGbp: to, blockers: [],
    reason: `${roas.toFixed(2)}× return over £${spend.toFixed(2)}. Raise £${current.toFixed(2)} to £${to.toFixed(2)} — one ${step}% step, then measure again.`,
  };
}

export const LADDER_DOCTRINE = [
  "A post is compared to the brand's own median, never to an industry constant. A plumber and a fashion label do not share a benchmark, and a brand with no history has no median — which is answered \"not yet\", never zero.",
  "The median is a median, not a mean. One unusually far-travelling post would otherwise become the bar every future post has to clear.",
  "Too young and too small are refused separately, and neither is a verdict. A post live for two hours has not finished being seen.",
  "A gate that cannot be measured is never passed by default. With no conversion tracking the ladder refuses to promote past the test rung and says so, because scaling on engagement standing in for revenue is how budgets are lost.",
  "Spending the whole test budget with nothing to show retires the post; spending part of it does not. The trigger is the cap, not the zero.",
  "Converting at a cost the offer cannot afford is retired, not scaled. It works and it still cannot be paid for.",
  "Nothing here spends money. Ceilings, the emergency stop's spend lane and the approval queue all still stand between a decision and a pound leaving.",
];
