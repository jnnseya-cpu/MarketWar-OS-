// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// HOW THE DATABASE IS ACTUALLY BEHAVING — under whatever load it is under.
//
// WHY THIS EXISTS. "Quota and latency only exist under real load" was true and
// was being used as a reason not to know. It is a reason not to SIMULATE them;
// it is the opposite of a reason not to measure them. A platform that cannot
// answer "is the database slow" or "are we being refused for quota" finds out
// from a customer, and finds out as "the site is broken".
//
// So every store operation that matters is timed, and every failure is
// classified by `shared/store-failure.ts` rather than counted as one
// undifferentiated lump. Out of quota, refused by rules, and simply slow have
// three different remedies, and a single "errors: 14" hides all of them.
//
// WHAT IT HONESTLY IS, SAID HERE SO NO SURFACE HAS TO GUESS.
//
// IN-PROCESS AND ROLLING. This deployment runs on serverless instances that come
// and go, so this is ONE instance's recent view — not a fleet-wide metric and
// not a historical record. That is worth having: an instance being refused for
// quota knows it immediately, and knowing immediately is the whole point. It is
// not worth pretending to be more, so the report says which it is.
//
// NO SAMPLE, NO PERCENTILES. Below a handful of operations a p95 is one number
// wearing a statistic's clothes, and this repository has already shipped that
// mistake twice — `eventStats` withholding rates, and the placement report
// refusing to quote a share. Same rule, third time.

import { readStoreFailure, type StoreFailureKind } from "@/shared/store-failure";

type Sample = { at: number; ms: number; op: string; kind: StoreFailureKind | "ok" };

/** Rolling window. Small on purpose: this is "what is happening now", not history. */
const WINDOW = 500;
const samples: Sample[] = [];

/** The point at which a percentile is a statistic rather than an anecdote. */
export const MIN_SAMPLE = 20;

/** A read that takes longer than this is worth naming, whatever the percentile says. */
export const SLOW_MS = 1500;

function record(s: Sample): void {
  samples.push(s);
  if (samples.length > WINDOW) samples.splice(0, samples.length - WINDOW);
}

/**
 * Time one store operation and classify how it ended.
 *
 * IT NEVER CHANGES THE OUTCOME. The error is re-thrown exactly as it arrived:
 * a measurement that swallows what it measures is how "no data" started meaning
 * seven different things in this platform. The caller's behaviour is unaffected
 * whether this is wrapped around it or not.
 */
export async function timed<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    record({ at: t0, ms: Date.now() - t0, op, kind: "ok" });
    return out;
  } catch (e) {
    record({ at: t0, ms: Date.now() - t0, op, kind: readStoreFailure(e).kind });
    throw e;
  }
}

const percentile = (sorted: number[], p: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

export type StoreHealth = {
  /** Operations in the window. */
  operations: number;
  /** NULL until there are enough to mean anything. */
  p50Ms: number | null;
  p95Ms: number | null;
  slowestMs: number | null;
  slowest: string;
  /** Count per failure kind. Absent kinds are absent, not zero rows. */
  failures: Partial<Record<StoreFailureKind, number>>;
  failed: number;
  /** TRUE when the database is refusing us for quota RIGHT NOW. */
  quotaRefusals: number;
  verdict: string;
  advice: string[];
  scope: string;
};

export function storeHealth(now = Date.now(), windowMs = 15 * 60_000): StoreHealth {
  const recent = samples.filter((s) => now - s.at <= windowMs);
  const ok = recent.filter((s) => s.kind === "ok");
  const bad = recent.filter((s) => s.kind !== "ok");
  const durations = [...ok.map((s) => s.ms)].sort((a, b) => a - b);

  const failures: Partial<Record<StoreFailureKind, number>> = {};
  for (const s of bad) failures[s.kind as StoreFailureKind] = (failures[s.kind as StoreFailureKind] ?? 0) + 1;
  const quotaRefusals = failures.quota ?? 0;

  const slowestSample = [...ok].sort((a, b) => b.ms - a.ms)[0];
  const enough = ok.length >= MIN_SAMPLE;

  const advice: string[] = [];
  if (quotaRefusals) {
    advice.push(
      `${quotaRefusals} operation(s) were refused for QUOTA in the last ${Math.round(windowMs / 60_000)} minutes. `
      + "Nothing in the code will change that: check the Firebase console's usage tab. On Spark it resets at midnight "
      + "Pacific; on Blaze a budget cap was hit.",
    );
  }
  if (failures.index) {
    advice.push(
      `${failures.index} operation(s) failed for a MISSING INDEX. That is deployable in a minute and it is refusing `
      + "queries outright until it is. `npm run check:indexes` exists to catch this before it ships.",
    );
  }
  if (failures.permission || failures.unauthenticated) {
    advice.push(
      "The database is refusing us on credentials or rules, which on a server path means the Admin SDK is not really "
      + "loading — it bypasses rules when it is.",
    );
  }
  if (enough && percentile(durations, 95) > SLOW_MS) {
    advice.push(
      `The slowest 5% of reads are over ${SLOW_MS}ms. That is almost always a query scanning more than it should, `
      + "not the database being tired.",
    );
  }

  return {
    operations: recent.length,
    p50Ms: enough ? percentile(durations, 50) : null,
    p95Ms: enough ? percentile(durations, 95) : null,
    slowestMs: slowestSample ? slowestSample.ms : null,
    slowest: slowestSample ? slowestSample.op : "",
    failures, failed: bad.length, quotaRefusals,
    verdict: !recent.length
      ? "This instance has not touched the database recently, so there is nothing to report. That is not a health score."
      : quotaRefusals
        ? `Being refused for quota: ${quotaRefusals} of ${recent.length} operation(s).`
        : bad.length
          ? `${bad.length} of ${recent.length} operation(s) failed — see the breakdown, the kinds have different fixes.`
          : enough
            ? `${recent.length} operations, all succeeded, median ${percentile(durations, 50)}ms.`
            : `${recent.length} operation(s), all succeeded — too few for a percentile to mean anything (${MIN_SAMPLE} needed).`,
    advice,
    // STATED EVERY TIME. A number without its scope invites being read as the
    // fleet's, and acted on as if it were.
    scope: "One instance, last 15 minutes, in memory. Serverless instances come and go, so this is what THIS process "
      + "has seen — immediate and local, never a fleet-wide or historical metric.",
  };
}

/** Tests only: start from nothing. */
export function __resetStoreHealth(): void { samples.length = 0; }
