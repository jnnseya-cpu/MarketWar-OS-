// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// HAVE WE TRIED THIS BEFORE, AND WHAT HAPPENED? (§38)
//
// `experiments.ts` knows whether a test that is RUNNING has a winner. Nothing
// knew whether the idea being proposed today had already been run and lost six
// weeks ago. So the generator kept re-proposing angles the brand had already
// paid to disprove, and every rediscovery cost another test's worth of traffic.
//
// THE DISTINCTION THIS MODULE EXISTS TO PROTECT.
//
// "We tried it and it lost" and "we tried it and stopped early" are not the same
// sentence, and collapsing them is the expensive mistake. A test abandoned at
// 30% of its required sample proves nothing at all — treating it as a failure
// retires a good idea on no evidence, which is worse than never having tested
// it, because now nobody will try again.
//
//   tried_and_won      — it won, significantly. Reuse it rather than re-test it.
//   tried_and_lost     — it lost, significantly. Real evidence against.
//   tried_no_difference— enough data, no difference found. Evidence of "not worth it".
//   tried_inconclusive — stopped before it could answer. NOT evidence. Say so.
//   untried            — nothing on record.
//
// AND EVIDENCE AGES. A result from a different season, a different price and a
// different market is weaker than one from last month. Age is reported and the
// strength is downgraded past a threshold rather than a stale verdict being
// stated with the same confidence as a fresh one.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { ExperimentReport } from "@/backend/experiments";

const COLLECTION = "experiment_history";
const useDb = () => adminConfigured && Boolean(adminDb);
const mem = new Map<string, PastExperiment[]>();

/** Beyond this, a result is reported as weak evidence rather than a settled answer. */
export const STALE_AFTER_DAYS = 180;

/** Under this fraction of the required sample, a stopped test proves nothing. */
export const INCONCLUSIVE_BELOW_PROGRESS_PCT = 80;

export type Outcome =
  | "tried_and_won"
  | "tried_and_lost"
  | "tried_no_difference"
  | "tried_inconclusive";

export type PastExperiment = {
  id: string;
  brandId: string;
  /** What was tested, in the words it was proposed in. */
  idea: string;
  /** Structured handles, so matching is not a guess about prose. */
  angleFamily?: string;
  hookFamily?: string;
  channel?: string;
  outcome: Outcome;
  /** Percentage POINTS, signed. Present only when the test actually concluded. */
  absoluteLiftPct?: number;
  progressPct: number;
  concludedAt: string;
  /** Why it stopped, when it stopped early. The most useful field on the record. */
  stoppedBecause?: string;
};

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// FUNCTION WORDS CARRY NO MEANING AND MUST NOT MATCH.
//
// A length filter was not enough: "with" is four letters, so "Lead with the
// price" and "Lead with the delivery speed" shared two "meaningful" words and
// were declared the same idea. The generator would then have been told an
// untried angle had already been disproved — the worst thing this module can
// do, because the idea is never run again and nobody knows why.
const STOPWORDS = new Set([
  "with", "from", "that", "this", "your", "their", "them", "they", "have", "been",
  "will", "would", "into", "onto", "over", "under", "than", "then", "when", "what",
  "which", "while", "about", "after", "before", "more", "most", "less", "just",
  "make", "makes", "made", "using", "used", "some", "such", "only", "also", "very",
  "lead", "leading", "test", "testing", "version", "variant", "copy", "line",
]);

const meaningfulWords = (s: string): Set<string> =>
  new Set(norm(s).split(" ").filter((w) => w.length > 3 && !STOPWORDS.has(w)));

/**
 * Turn a finished experiment into a record.
 *
 * The verdict is derived from the report rather than supplied, so nobody can
 * file a stopped test as a failure by hand — which is the exact way this data
 * would rot into "we tried everything and nothing works".
 */
export function outcomeFrom(report: Pick<ExperimentReport, "verdict" | "progressPct" | "absoluteLiftPct">): Outcome {
  if (report.verdict === "winner") {
    return (report.absoluteLiftPct ?? 0) >= 0 ? "tried_and_won" : "tried_and_lost";
  }
  // Enough data and no difference is a real answer. Not enough data is not.
  if (report.verdict === "no_difference" && report.progressPct >= INCONCLUSIVE_BELOW_PROGRESS_PCT) {
    return "tried_no_difference";
  }
  return "tried_inconclusive";
}

export async function recordOutcome(input: {
  brandId: string;
  idea: string;
  angleFamily?: string;
  hookFamily?: string;
  channel?: string;
  report: Pick<ExperimentReport, "verdict" | "progressPct" | "absoluteLiftPct">;
  stoppedBecause?: string;
  nowISO?: string;
}): Promise<PastExperiment> {
  const at = input.nowISO || new Date().toISOString();
  const row: PastExperiment = {
    id: `xh_${input.brandId}_${norm(input.idea).slice(0, 40).replace(/ /g, "-")}_${at.slice(0, 10)}`,
    brandId: input.brandId,
    idea: input.idea,
    angleFamily: input.angleFamily,
    hookFamily: input.hookFamily,
    channel: input.channel,
    outcome: outcomeFrom(input.report),
    absoluteLiftPct: input.report.absoluteLiftPct,
    progressPct: input.report.progressPct,
    concludedAt: at,
    stoppedBecause: input.stoppedBecause,
  };
  const local = mem.get(input.brandId) || [];
  mem.set(input.brandId, [...local.filter((r) => r.id !== row.id), row]);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(row.id).set(row); } catch { /* memory holds it */ }
  }
  return row;
}

export async function allFor(brandId: string): Promise<PastExperiment[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).get();
    const byId = new Map<string, PastExperiment>();
    for (const r of local) byId.set(r.id, r);
    snap.forEach((d) => { const r = d.data() as PastExperiment; byId.set(r.id, r); });
    return [...byId.values()];
  } catch {
    return [...local];
  }
}

export type Match = PastExperiment & {
  ageDays: number;
  /** How the match was made — so a person can judge it rather than trust it. */
  matchedOn: ("angle" | "hook" | "channel" | "wording")[];
  stale: boolean;
};

export type HistoryVerdict = {
  /** The strongest thing that can honestly be said. */
  status: Outcome | "untried";
  /** True only when there is a CONCLUDED result to lean on. */
  isEvidence: boolean;
  matches: Match[];
  headline: string;
  /** What to do with it, in a sentence. Never "do not try this" on thin evidence. */
  advice: string;
};

/**
 * Ask before proposing.
 *
 * Matching is structural first — angle, hook and channel are fields the
 * generator already sets — and falls back to significant word overlap in the
 * wording. It deliberately does NOT call a model: a recall step that costs a
 * provider call is a recall step that gets skipped to save money, and then the
 * expensive mistake happens anyway.
 */
export async function checkHistoricalExperiments(input: {
  brandId: string;
  idea: string;
  angleFamily?: string;
  hookFamily?: string;
  channel?: string;
  nowISO?: string;
}): Promise<HistoryVerdict> {
  const now = Date.parse(input.nowISO || new Date().toISOString());
  const rows = await allFor(input.brandId);
  const words = meaningfulWords(input.idea);

  const matches: Match[] = [];
  for (const r of rows) {
    const on: Match["matchedOn"] = [];
    if (input.angleFamily && r.angleFamily && input.angleFamily === r.angleFamily) on.push("angle");
    if (input.hookFamily && r.hookFamily && input.hookFamily === r.hookFamily) on.push("hook");
    if (input.channel && r.channel && input.channel === r.channel) on.push("channel");
    if (words.size) {
      const theirs = meaningfulWords(r.idea);
      let shared = 0;
      for (const w of words) if (theirs.has(w)) shared += 1;
      // TWO shared words minimum, AND half the meaningful words both ways.
      //
      // The half-rule alone let "Lead with the price" match "Lead with the
      // delivery speed" on the single word "lead" — a short idea has few
      // meaningful words, so one of them clears half of two. A false match here
      // is the worst outcome this module can produce: it tells the generator an
      // untried idea has already been disproved, and the idea is never run.
      if (shared >= 2 && shared >= Math.ceil(Math.min(words.size, theirs.size) / 2)) on.push("wording");
    }
    // A channel match ALONE is not a match: everything runs on some channel.
    const meaningful = on.filter((m) => m !== "channel");
    if (meaningful.length === 0) continue;

    const ageDays = Math.max(0, Math.round((now - Date.parse(r.concludedAt)) / 86_400_000));
    matches.push({ ...r, ageDays, matchedOn: on, stale: ageDays > STALE_AFTER_DAYS });
  }

  matches.sort((a, b) => a.ageDays - b.ageDays);

  if (matches.length === 0) {
    return {
      status: "untried", isEvidence: false, matches: [],
      headline: "Nothing like this has been tested on this brand.",
      advice: "Run it. There is no prior result to lean on either way.",
    };
  }

  // The strongest CONCLUDED result wins the verdict. An inconclusive record
  // never outranks one that actually finished.
  const concluded = matches.filter((m) => m.outcome !== "tried_inconclusive");
  const best = concluded[0];

  if (!best) {
    const m = matches[0];
    return {
      status: "tried_inconclusive", isEvidence: false, matches,
      headline: `Tried ${m.ageDays} day${m.ageDays === 1 ? "" : "s"} ago and stopped at ${m.progressPct}% of the data it needed.`,
      advice: `That is not a result. ${m.stoppedBecause ? `It stopped because: ${m.stoppedBecause}. ` : ""}Run it again and let it reach its sample size, or decide not to — but not on the grounds that it failed, because it never got the chance to.`,
    };
  }

  const lift = best.absoluteLiftPct;
  const when = `${best.ageDays} day${best.ageDays === 1 ? "" : "s"} ago`;
  const weak = best.stale ? " That was long enough ago that the market, the price and the season have all moved — treat it as a hint rather than an answer." : "";

  if (best.outcome === "tried_and_won") {
    return {
      status: best.outcome, isEvidence: true, matches,
      headline: `This won ${when}${lift != null ? `, by ${lift.toFixed(1)} points` : ""}.`,
      advice: `Use it rather than re-testing it. Re-running a settled winner spends traffic to learn something already known.${weak}`,
    };
  }
  if (best.outcome === "tried_and_lost") {
    return {
      status: best.outcome, isEvidence: true, matches,
      headline: `This lost ${when}${lift != null ? `, by ${Math.abs(lift).toFixed(1)} points` : ""}.`,
      advice: `Change something real before running it again — the angle, the offer or the audience. Repeating it unchanged buys the same answer twice.${weak}`,
    };
  }
  return {
    status: best.outcome, isEvidence: true, matches,
    headline: `This was tested ${when} with enough data, and made no difference.`,
    advice: `Not a failure, but not worth the slot either. Spend the traffic on something untried.${weak}`,
  };
}

export const HISTORY_DOCTRINE = [
  "A test that stopped early is not a test that failed. Collapsing the two retires good ideas on no evidence, and nobody tries them again.",
  "The verdict is derived from the experiment report, never filed by hand, so a stopped test cannot be recorded as a loss.",
  "A channel match alone is not a match — everything runs on some channel.",
  "Recall never calls a model. A recall step that costs a provider call is one that gets skipped to save money, and then the expensive mistake happens anyway.",
  "Evidence ages. Past six months it is reported as a hint, not an answer.",
];

/** Test seam. Never called by product code. */
export function __resetHistory(): void { mem.clear(); }
