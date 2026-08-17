// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// A WINNER THAT STOPPED WINNING.
//
// The settings page has advertised "Creative rotation — swap fatigued creatives
// at midnight UTC" as a capability you can dial up, and nothing in the platform
// has ever detected fatigue. The dial moved and nothing happened, which is worse
// than the feature being absent: absent is honest.
//
// An unmounted card also carried "Creative fatigue score 58 · Best hook CTR down
// 22% from peak" — twelve fabricated numbers in a field literally named
// `measured`. This module is the answer to both, and it produces NO SCORE. There
// is no 0–100 fatigue number here, because a number nobody counted is exactly
// what that card was.
//
// WHAT FATIGUE ACTUALLY IS, AND WHY IT IS A DIFFERENT QUESTION.
//
// Everything else in this codebase compares creatives AGAINST EACH OTHER at a
// point in time — `experiments.ts` tests variants, `creative-learning.ts` ranks
// families. Fatigue is a creative measured AGAINST ITS OWN PAST, and against its
// own PEAK rather than its start: a creative that opened slowly, found its
// audience and then decayed is fatigued from the middle, and comparing to week
// one would call that healthy.
//
// THE TRAP THIS MODULE EXISTS TO AVOID.
//
// A declining number is not fatigue. Click-through rates wobble; on a few
// thousand impressions they wobble a lot. A detector that fires on "this week is
// lower than last week" fires constantly, everybody learns to ignore it, and the
// one time it is right nobody looks. So every decline is put through the
// two-proportion test that `experiments.ts` already owns, and a decline that
// does not clear it is reported as `watch` — seen, not acted on.
//
// Below a minimum of evidence the answer is `cannot_judge`, the same discipline
// `posting-time.ts` uses for best-hour and `paid-guardrails.ts` uses for money.

import { twoProportionTest, wilsonInterval } from "@/backend/experiments";

/** One period of a creative's life. Whatever the caller's reporting granularity is. */
export type Window = {
  /** ISO date or label — "2026-08-10" or "week 3". Used only for display. */
  label: string;
  impressions: number;
  clicks?: number;
  /** Any deliberate interaction: likes, saves, shares, comments. */
  engagements?: number;
  conversions?: number;
  spendGbp?: number;
  /** Unique people reached. Needed for saturation; absent means that signal cannot run. */
  reach?: number;
};

export const SIGNALS = ["ctr", "engagement", "conversion", "cpa", "saturation"] as const;
export type SignalId = (typeof SIGNALS)[number];

export const SIGNAL_LABEL: Record<SignalId, string> = {
  ctr: "Click-through rate",
  engagement: "Engagement rate",
  conversion: "Conversion rate",
  cpa: "Cost per customer",
  saturation: "Audience saturation",
};

export type SignalResult = {
  id: SignalId;
  /** `declined` only when the test clears; `drifting` is a fall that did not. */
  verdict: "declined" | "drifting" | "steady" | "cannot_check";
  /** What it was at the creative's best, and what it is now. Counted, both of them. */
  peak: number | null;
  recent: number | null;
  /** Relative change, as a percentage of the peak. Negative is a fall. */
  changePct: number | null;
  /** From the two-proportion test. Absent for the rate-free signals. */
  pValue?: number;
  detail: string;
};

export type FatigueReport = {
  creative: string;
  /**
   * No score. `fatigued` means at least one signal cleared the significance
   * test; `watch` means something is falling and has not; `cannot_judge` means
   * there is not enough to say.
   */
  state: "fresh" | "watch" | "fatigued" | "cannot_judge";
  signals: SignalResult[];
  /** The windows that were actually used, after thin ones were dropped. */
  windowsUsed: number;
  peakLabel: string | null;
  recentLabel: string | null;
  /** What to do, naming the dimension the evidence points at. Never generic. */
  recommendation: string;
  headline: string;
};

/** Under this, a window's rates are noise and are dropped rather than averaged in. */
export const MIN_IMPRESSIONS_PER_WINDOW = 500;
/** Two windows is the minimum comparison; one is a snapshot. */
export const MIN_WINDOWS = 2;
/** The two-proportion test must clear this for a fall to be called a decline. */
export const ALPHA = 0.05;
/** A fall smaller than this is not worth anybody's attention even if significant. */
export const MIN_MEANINGFUL_FALL_PCT = 10;

const rate = (num: number | undefined, den: number): number | null =>
  den > 0 ? Math.max(0, Number(num) || 0) / den : null;

const pct1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Is this creative worn out?
 *
 * Windows must be in chronological order — the caller owns their own reporting
 * period, and imposing one here would make this untestable against real data.
 */
export function detectFatigue(input: { creative: string; windows: Window[] }): FatigueReport {
  const creative = input.creative || "this creative";
  const usable = (input.windows || []).filter((w) => (Number(w.impressions) || 0) >= MIN_IMPRESSIONS_PER_WINDOW);

  const empty = (headline: string, recommendation: string): FatigueReport => ({
    creative, state: "cannot_judge", signals: [], windowsUsed: usable.length,
    peakLabel: null, recentLabel: null, recommendation, headline,
  });

  if (usable.length < MIN_WINDOWS) {
    return empty(
      `Not enough data on ${creative} to say. ${usable.length} of ${(input.windows || []).length} reporting periods cleared ${MIN_IMPRESSIONS_PER_WINDOW} impressions.`,
      "Keep it running. A creative judged on a few hundred impressions is judged on noise, and pulling a winner early costs more than leaving a loser up a week longer.",
    );
  }

  const recent = usable[usable.length - 1];
  const earlier = usable.slice(0, -1);

  // PEAK, NOT START. A creative that opened slowly, found its audience and then
  // decayed is fatigued from the middle — comparing to the first window would
  // call that healthy.
  const byCtr = earlier
    .map((w) => ({ w, r: rate(w.clicks, w.impressions) }))
    .filter((x): x is { w: Window; r: number } => x.r !== null);
  const peak = (byCtr.length ? byCtr.reduce((a, b) => (b.r > a.r ? b : a)).w : earlier[earlier.length - 1]);

  const signals: SignalResult[] = [];

  /** The three rate signals share one shape, so they share one implementation. */
  const rateSignal = (
    id: SignalId,
    numerator: (w: Window) => number | undefined,
    denominator: (w: Window) => number,
    missing: string,
  ): SignalResult => {
    const pn = numerator(peak);
    const rn = numerator(recent);
    if (pn === undefined || rn === undefined) {
      return { id, verdict: "cannot_check", peak: null, recent: null, changePct: null, detail: missing };
    }
    const pd = denominator(peak);
    const rd = denominator(recent);
    const pr = rate(pn, pd);
    const rr = rate(rn, rd);
    if (pr === null || rr === null) {
      return { id, verdict: "cannot_check", peak: null, recent: null, changePct: null, detail: missing };
    }

    const changePct = pr > 0 ? ((rr - pr) / pr) * 100 : 0;
    const { pValue } = twoProportionTest(
      { conversions: Math.round(pn), impressions: Math.round(pd) },
      { conversions: Math.round(rn), impressions: Math.round(rd) },
    );

    const fell = changePct < -MIN_MEANINGFUL_FALL_PCT;
    const significant = pValue < ALPHA;
    const ci = wilsonInterval(Math.round(rn), Math.round(rd));

    return {
      id,
      verdict: !fell ? "steady" : significant ? "declined" : "drifting",
      peak: pct1(pr * 100), recent: pct1(rr * 100), changePct: pct1(changePct), pValue: Math.round(pValue * 1000) / 1000,
      detail: !fell
        ? `${SIGNAL_LABEL[id]} is ${pct1(rr * 100)}% against a peak of ${pct1(pr * 100)}% — no meaningful fall.`
        : significant
          ? `${SIGNAL_LABEL[id]} has fallen from ${pct1(pr * 100)}% at its peak (${peak.label}) to ${pct1(rr * 100)}% now (${recent.label}), ${Math.abs(pct1(changePct))}% down. On ${Math.round(rd).toLocaleString()} impressions that is unlikely to be noise (p=${(Math.round(pValue * 1000) / 1000).toFixed(3)}); the true rate now sits between ${pct1(ci.low * 100)}% and ${pct1(ci.high * 100)}%.`
          : `${SIGNAL_LABEL[id]} looks ${Math.abs(pct1(changePct))}% down on its peak, but on this much data that could be noise (p=${(Math.round(pValue * 1000) / 1000).toFixed(3)}). Worth watching, not worth acting on.`,
    };
  };

  signals.push(rateSignal("ctr", (w) => w.clicks, (w) => w.impressions, "No click figures supplied, so click-through cannot be judged."));
  signals.push(rateSignal("engagement", (w) => w.engagements, (w) => w.impressions, "No engagement figures supplied, so engagement cannot be judged."));
  signals.push(rateSignal("conversion", (w) => w.conversions, (w) => Math.max(1, Number(w.clicks) || 0), "No conversion or click figures supplied, so conversion cannot be judged."));

  // COST PER CUSTOMER — money rather than a rate, so no proportion test applies.
  // Reported as the counted change with the conversions behind it, and never
  // called a decline on a handful.
  const cpaOf = (w: Window): number | null => {
    const conv = Number(w.conversions) || 0;
    const spend = Number(w.spendGbp) || 0;
    return conv > 0 && spend > 0 ? spend / conv : null;
  };
  const peakCpa = cpaOf(peak);
  const recentCpa = cpaOf(recent);
  if (peakCpa === null || recentCpa === null) {
    signals.push({ id: "cpa", verdict: "cannot_check", peak: null, recent: null, changePct: null,
      detail: "Cost per customer needs both spend and conversions in each period, and one of them is missing." });
  } else {
    const changePct = ((recentCpa - peakCpa) / peakCpa) * 100;
    const rose = changePct > MIN_MEANINGFUL_FALL_PCT;
    const conv = Number(recent.conversions) || 0;
    const thin = conv < 5;
    signals.push({
      id: "cpa",
      // Rising cost on five conversions is not a finding, so it drifts rather
      // than declares — the same rule the paid guardrails use.
      verdict: !rose ? "steady" : thin ? "drifting" : "declined",
      peak: pct1(peakCpa), recent: pct1(recentCpa), changePct: pct1(changePct),
      detail: !rose
        ? `Cost per customer is £${pct1(recentCpa)} against £${pct1(peakCpa)} at peak — no meaningful rise.`
        : thin
          ? `Cost per customer is up ${pct1(changePct)}% to £${pct1(recentCpa)}, but only ${conv} conversion${conv === 1 ? "" : "s"} produced that figure, which is too few to act on.`
          : `Cost per customer has risen ${pct1(changePct)}% — £${pct1(peakCpa)} at peak (${peak.label}) to £${pct1(recentCpa)} now (${recent.label}), across ${conv} conversions.`,
    });
  }

  // AUDIENCE SATURATION — the same people seeing it repeatedly. Frequency is
  // impressions per person reached, and a rise in it with flat reach is the
  // literal definition of running out of audience.
  const freqOf = (w: Window): number | null => {
    const r = Number(w.reach) || 0;
    return r > 0 ? w.impressions / r : null;
  };
  const peakFreq = freqOf(peak);
  const recentFreq = freqOf(recent);
  if (peakFreq === null || recentFreq === null) {
    signals.push({ id: "saturation", verdict: "cannot_check", peak: null, recent: null, changePct: null,
      detail: "Saturation needs unique reach per period, which was not supplied. Impressions alone cannot tell you whether the same people are seeing it twice." });
  } else {
    const changePct = ((recentFreq - peakFreq) / peakFreq) * 100;
    const reachGrowth = (Number(peak.reach) || 0) > 0 ? (((Number(recent.reach) || 0) - (Number(peak.reach) || 0)) / (Number(peak.reach) || 1)) * 100 : 0;
    const saturating = changePct > 25 && reachGrowth < 10;
    signals.push({
      id: "saturation",
      verdict: saturating ? "declined" : changePct > 25 ? "drifting" : "steady",
      peak: pct1(peakFreq), recent: pct1(recentFreq), changePct: pct1(changePct),
      detail: saturating
        ? `Each person now sees this ${pct1(recentFreq)} times, up from ${pct1(peakFreq)}, while the number of people reached moved ${pct1(reachGrowth)}%. The same audience is seeing it repeatedly — that is running out of audience, not running out of appeal.`
        : changePct > 25
          ? `Frequency is up to ${pct1(recentFreq)} per person from ${pct1(peakFreq)}, but reach grew ${pct1(reachGrowth)}% too, so it is finding new people as well.`
          : `Each person sees this ${pct1(recentFreq)} times against ${pct1(peakFreq)} at peak — no saturation.`,
    });
  }

  const declined = signals.filter((s) => s.verdict === "declined");
  const drifting = signals.filter((s) => s.verdict === "drifting");
  const checkable = signals.filter((s) => s.verdict !== "cannot_check");

  if (!checkable.length) {
    return {
      ...empty(
        `Nothing about ${creative} can be judged — none of the five signals had the figures it needs.`,
        "Supply clicks, conversions, spend and unique reach per reporting period and this becomes answerable.",
      ),
      signals, windowsUsed: usable.length, peakLabel: peak.label, recentLabel: recent.label,
    };
  }

  const state: FatigueReport["state"] = declined.length ? "fatigued" : drifting.length ? "watch" : "fresh";

  return {
    creative, state, signals,
    windowsUsed: usable.length,
    peakLabel: peak.label, recentLabel: recent.label,
    headline: declined.length
      ? `${creative} is worn out: ${declined.map((d) => SIGNAL_LABEL[d.id].toLowerCase()).join(", ")} moved against it beyond what noise explains.`
      : drifting.length
        ? `${creative} is drifting — ${drifting.map((d) => SIGNAL_LABEL[d.id].toLowerCase()).join(", ")} is falling, but not yet beyond noise on this much data.`
        : `${creative} is still working. Nothing has moved against it since ${peak.label}.`,
    recommendation: recommendFor(declined, drifting),
  };
}

/**
 * What to change, from what actually moved.
 *
 * "Generate fresh variants" on its own is the advice that makes people rebuild
 * a working creative from scratch. Which dimension to vary follows from which
 * signal fired, and saturation in particular is not a creative problem at all.
 */
function recommendFor(declined: SignalResult[], drifting: SignalResult[]): string {
  const ids = new Set(declined.map((d) => d.id));
  if (!ids.size) {
    return drifting.length
      ? "Leave it running and check again next period. Acting on a fall that noise explains is how a working creative gets killed."
      : "Leave it running. Nothing here justifies replacing something that is working.";
  }
  const parts: string[] = [];
  if (ids.has("saturation")) {
    parts.push("Widen or change the audience before touching the creative — the same people are seeing it repeatedly, which no new artwork fixes.");
  }
  if (ids.has("ctr")) {
    parts.push("Vary the hook and the opening frame first: click-through is what the scroll decides, and it decides in the first second.");
  }
  if (ids.has("engagement")) {
    parts.push("Vary the angle rather than the artwork — engagement falling while clicks hold usually means the message has been heard, not that it looks tired.");
  }
  if (ids.has("conversion")) {
    parts.push("Look past the creative at the offer and the landing page: people are still clicking and no longer buying, which is rarely the ad's fault.");
  }
  if (ids.has("cpa")) {
    parts.push("Cap the spend on this one while you test replacements — every day at the higher cost per customer is money that buys fewer of them.");
  }
  parts.push("`buildTestMatrix` in creative-optimizer.ts builds the replacement set without generating every permutation, and `applyLearning` in creative-learning.ts weights it towards what has already won for this brand.");
  return parts.join(" ");
}

/** Several creatives at once, worst first — what a rotation job would work through. */
export function fatigueSweep(creatives: { creative: string; windows: Window[] }[]): {
  reports: FatigueReport[];
  fatigued: number;
  watching: number;
  note: string;
} {
  const order = { fatigued: 0, watch: 1, cannot_judge: 2, fresh: 3 } as const;
  const reports = creatives.map(detectFatigue).sort((a, b) => order[a.state] - order[b.state]);
  const fatigued = reports.filter((r) => r.state === "fatigued").length;
  const watching = reports.filter((r) => r.state === "watch").length;
  return {
    reports, fatigued, watching,
    note: fatigued
      ? `${fatigued} of ${reports.length} creative${reports.length === 1 ? "" : "s"} ${fatigued === 1 ? "is" : "are"} worn out. Replace those; leave the rest alone.`
      : `Nothing is worn out. ${watching ? `${watching} worth watching. ` : ""}Replacing a creative that is still working costs money and learns nothing.`,
  };
}

export const FATIGUE_DOCTRINE = [
  "There is no fatigue score. A 0–100 number here would be exactly the fabrication the unmounted BVI card carried — twelve invented figures in a field called `measured`.",
  "A declining number is not fatigue. Every fall goes through the two-proportion test experiments.ts already owns, and one that does not clear it is reported as drifting rather than acted on.",
  "The comparison is against the creative's own PEAK, not its start. One that opened slowly, found its audience and then decayed is fatigued from the middle.",
  "Saturation is not a creative problem. When the same people are seeing it repeatedly the answer is a wider audience, and no new artwork fixes it.",
  "Below the evidence floor the answer is \"cannot judge\". Pulling a winner early costs more than leaving a loser up one week longer.",
];
