// A PIECE OF AI WORK THAT OUTLIVES THE REQUEST THAT STARTED IT.
//
// WHY THIS EXISTS. `AiWorkIncompleteError` (gateway) says a run could not finish
// inside its invocation and must continue elsewhere. Until now nothing picked it
// up: the platform told the customer honestly that the work was unfinished,
// which beat handing back half a document, and then it stopped. Under the effort
// law an unfinished run is not an outcome — it is a run that has not finished
// yet, and something has to carry it.
//
// MODELLED ON `backend/video-jobs.ts` ON PURPOSE. That store already solved the
// hard parts — a claim that two workers cannot both win, a lease so a process
// that dies mid-job releases it, oldest-first ordering. This is the same
// mechanism against a different payload, and the shape is deliberately familiar
// so the two read alike.
//
// ONE DIFFERENCE, AND IT IS THE WHOLE POINT.
//
// `video-jobs` retires a job after `MAX_ATTEMPTS = 3`: "Gave up after 3
// attempts." That is exactly what the effort law forbids. Attempts here are
// counted for VISIBILITY and never spent: no number of them ends the work. A job
// stops for one reason only — the request itself cannot succeed, which the
// gateway reports through `ai-effort`'s `give_up` — or because a human pressed
// the emergency stop.
//
// THE RUNAWAY THIS CREATES, SAID OUT LOUD. A job that can never fail can loop.
// The law is explicit that cost is not a reason to stop, so the answer is not a
// cap; it is that the loop is VISIBLE (every attempt and every error is on the
// job) and STOPPABLE (the emergency stop already exists, and is the owner's
// deliberate lever). A silent cap that contradicts the law would be worse than a
// loud loop somebody can end.

export type AiJobStatus = "queued" | "running" | "done" | "failed";

/** What the work is for. Chosen by the caller; carried through to the charge. */
export type AiJobKind = "document" | "campaign" | "analysis" | "rewrite";

export type AiJobRecord = {
  id: string;
  brandId: string;
  kind: AiJobKind;
  status: AiJobStatus;
  /** How many slices have run. Counted to be SHOWN, never to stop on. */
  attempts: number;
  createdAt: string;
  claimedAt?: string | null;
  finishedAt?: string | null;
  /** The finished text, once there is one. */
  result?: string;
  /** Set ONLY for a request that cannot succeed however often it is tried. */
  error?: string;
  /** Running total actually charged, in ACUs. */
  chargedAcu: number;
  /** The last thing that happened, for somebody watching a slow job. */
  note?: string;
};

/** A claim older than this is presumed dead and the job becomes takeable again. */
export const STALE_MS = 10 * 60 * 1000;

export type ClaimVerdict =
  | { act: "claim"; why: string }
  | { act: "skip"; why: string };

/**
 * May this job be picked up now?
 *
 * NOTE WHAT CANNOT APPEAR HERE: an attempt ceiling. `video-jobs` has one and is
 * right to — a render that has failed three times is broken. An AI run that has
 * been continued thirty times is a long piece of work, and under the effort law
 * that is a description, not a problem.
 */
export function claimVerdict(job: Pick<AiJobRecord, "status" | "claimedAt" | "attempts">, now = Date.now(), staleMs = STALE_MS): ClaimVerdict {
  if (job.status === "done" || job.status === "failed") {
    return { act: "skip", why: `Already ${job.status}.` };
  }
  if (job.status === "queued") {
    return { act: "claim", why: `Queued, attempt ${job.attempts + 1}.` };
  }
  // running — only takeable if the claim has gone stale, which means the process
  // holding it died. Without this a killed invocation strands the job forever,
  // which under this law is the one failure mode that matters.
  const claimedAt = Date.parse(job.claimedAt || "");
  if (!Number.isFinite(claimedAt)) {
    return { act: "claim", why: "Running with no claim time recorded — treated as abandoned rather than stranded." };
  }
  const age = now - claimedAt;
  if (age >= staleMs) {
    return { act: "claim", why: `Claimed ${Math.round(age / 1000)}s ago and never finished, so the process holding it is gone. Reclaiming.` };
  }
  return { act: "skip", why: `Claimed ${Math.round(age / 1000)}s ago and still within its lease.` };
}

/**
 * How a slice ended, translated into what the job becomes.
 *
 * `incomplete` goes back to QUEUED, not failed. That is the whole feature: the
 * next slice picks it straight back up.
 */
export type SliceOutcome =
  | { kind: "finished"; text: string }
  | { kind: "incomplete"; note: string }
  | { kind: "hopeless"; error: string };

export function applySlice(job: AiJobRecord, outcome: SliceOutcome, at: string): AiJobRecord {
  if (outcome.kind === "finished") {
    return { ...job, status: "done", result: outcome.text, finishedAt: at, claimedAt: null, note: "Finished." };
  }
  if (outcome.kind === "hopeless") {
    // The ONLY route to `failed`. If this ever becomes reachable from a timeout
    // or an attempt count, the law has been broken in the place it matters most.
    return { ...job, status: "failed", error: outcome.error, finishedAt: at, claimedAt: null };
  }
  return { ...job, status: "queued", claimedAt: null, note: outcome.note };
}

/**
 * What a person waiting on this should be told.
 *
 * A QUEUED JOB WITH ATTEMPTS BEHIND IT IS NOT STUCK, and must not read as if it
 * were. "Still working, 4 passes so far" is the truth; "queued" on its own
 * invites somebody to conclude nothing is happening and start again.
 */
export function progressLine(job: AiJobRecord): string {
  if (job.status === "done") return "Finished.";
  if (job.status === "failed") return job.error || "This request cannot be completed.";
  if (job.attempts === 0) return "Queued — the first pass has not started yet.";
  return `Still working: ${job.attempts} pass${job.attempts === 1 ? "" : "es"} so far, and it continues until the work is complete. `
    + `${job.note ? job.note : ""}`.trim();
}
