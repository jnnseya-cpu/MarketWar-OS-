// HOW HARD THE PLATFORM TRIES — which, by owner directive, is: until it is done.
//
// THE LAW THIS IMPLEMENTS.
//
//   "Every AI powered work must have no time limit and ACUs limit, regardless
//    how long it can take and how much it will cost. The AI powered functions
//    must work until produce the highly expected results."
//
// So nothing in this file may ever stop work because a clock ran out or because
// the work is getting expensive. There is exactly one reason to stop that is not
// success: the request CANNOT succeed however many times it is tried — a refused
// prompt, a malformed request. Everything else is "keep going", and where this
// invocation cannot keep going, the work is HANDED ON rather than abandoned.
//
// WHAT THAT DOES NOT MEAN, because getting this wrong produces fewer results
// rather than more, and the distinction is the whole design:
//
//   A SINGLE HTTP CALL TO A PROVIDER STILL HAS A TIMEOUT. That timeout is not a
//   limit on effort, it is what makes effort possible. Both large providers
//   occasionally accept a connection and hold it open forever; without a
//   per-call deadline that one socket consumes the entire invocation and the
//   customer receives NOTHING. The timeout is what lets the work move to another
//   provider and carry on. Removing it would be obeying the letter of the law
//   and breaking it in fact.
//
//   AND AN INVOCATION IS NOT THE WORK. Serverless functions are killed at a
//   fixed ceiling — no configuration makes one run for an hour. "No time limit"
//   is therefore delivered by CONTINUING across invocations, never by writing a
//   bigger number into a timeout that the platform will ignore. A run that
//   cannot finish here must hand on with its state intact, which is `hand_off`
//   below and is the single most important verdict in this file.
//
// TRUNCATION IS NOT AN ANSWER. A model that stopped at its token ceiling has
// produced half a document, and returning that as a result is the precise
// opposite of "until it produces the highly expected result". It is a reason to
// continue, never a reason to finish.

import type { FailureKind } from "@/shared/provider-failure";

/** The directive, in one place, so a surface can quote it rather than paraphrase. */
export const EFFORT_LAW =
  "AI work has no time limit and no attempt limit. It runs until it produces the expected result, or until the "
  + "request is one that cannot succeed however often it is tried. Running out of time or attempts is never a "
  + "reason to stop — the work continues, and where an invocation cannot continue it, the work is handed on with "
  + "its state intact. ACUs are the exception and are not a cap but a requirement: sufficient credit must be "
  + "available, and a pass that cannot be paid for does not run — the work waits for a top-up rather than "
  + "failing, and nothing is charged while it waits.";

export type EffortAct =
  /** Transient trouble. Go round again — a different provider, or the same one later. */
  | "retry_provider"
  /** The model stopped at its ceiling. Ask for the rest; never hand back half. */
  | "continue_output"
  /** This invocation cannot fit another attempt. Resume elsewhere; do NOT abandon. */
  | "hand_off"
  /** The only honest stop: no number of further attempts can succeed. */
  | "give_up";

export type EffortVerdict = { act: EffortAct; why: string };

/**
 * The failures that more attempts cannot fix.
 *
 * Deliberately SHORT. Everything not named here is treated as transient, because
 * the cost of retrying something hopeless is some wasted time, and the cost of
 * giving up on something recoverable is the customer not getting their work —
 * and under this directive the second is the one that is not allowed.
 *
 * `content_refused` and `bad_request` come from `readProviderFailure`, which
 * already marks them `tryAnotherProvider: false`: the prompt itself is the
 * problem, so the ninth provider refuses it exactly like the first.
 */
const HOPELESS: ReadonlySet<FailureKind> = new Set<FailureKind>(["content_refused", "bad_request"]);

export function isHopeless(kind: FailureKind | null | undefined): boolean {
  return kind ? HOPELESS.has(kind) : false;
}

/**
 * What should happen next.
 *
 * NOTE WHAT IS ABSENT FROM THE SIGNATURE: there is no budget, no cost, no spend
 * and no maximum attempt count, because none of them may influence the answer. A
 * test enumerates thousands of states and asserts that no combination of elapsed
 * time or attempts ever produces `give_up` on its own.
 */
export function nextAction(input: {
  /** Attempts already made. Recorded for the explanation, never to stop on. */
  attemptsMade: number;
  /** Did the last attempt stop at the model's token ceiling? */
  truncated: boolean;
  /** How the last attempt failed, if it failed. */
  lastFailure: { kind: FailureKind } | null;
  /** Milliseconds of THIS invocation still safely usable. */
  invocationRemainingMs: number;
  /** The least time in which a fresh attempt could plausibly finish. */
  minAttemptMs: number;
}): EffortVerdict {
  const { attemptsMade, truncated, lastFailure, invocationRemainingMs, minAttemptMs } = input;

  // 1. THE ONE HONEST STOP, and it is about the REQUEST, not about resources.
  if (lastFailure && isHopeless(lastFailure.kind)) {
    return {
      act: "give_up",
      why: `The provider refused the request itself (${lastFailure.kind}), which every other provider will do too. `
        + "This is the only kind of stop that is not a success: more attempts cannot change a refused prompt or a "
        + "malformed request. Nothing was stopped for time or cost.",
    };
  }

  // 2. ROOM TO KEEP WORKING HERE? Asked BEFORE truncation is handled, because a
  //    continuation is itself another provider call and needs somewhere to run.
  //    A hand-off is not a failure and must never be reported as one.
  if (invocationRemainingMs < minAttemptMs) {
    return {
      act: "hand_off",
      why: `This invocation has ${Math.max(0, Math.round(invocationRemainingMs))}ms left and an attempt needs at `
        + `least ${minAttemptMs}ms, so the work continues outside it rather than being cut short. `
        + `${attemptsMade} attempt(s) so far. The run is not over; it is moving.`,
    };
  }

  // 3. HALF A DOCUMENT IS NOT A DOCUMENT.
  if (truncated) {
    return {
      act: "continue_output",
      why: "The model stopped at its output ceiling, so the result is incomplete. Asking for the remainder is the "
        + "work continuing; returning what arrived would be handing over half a document and calling it finished.",
    };
  }

  // 4. Everything else is transient by construction.
  return {
    act: "retry_provider",
    why: lastFailure
      ? `${lastFailure.kind} is recoverable — another provider or another attempt. Attempt ${attemptsMade + 1}.`
      : `Attempt ${attemptsMade + 1}.`,
  };
}

/**
 * Is this verdict a stop that the caller may report as finished-unsuccessfully?
 *
 * Only `give_up` is. `hand_off` is work in progress and a surface that renders it
 * as a failure would be telling the customer their run died when it did not —
 * which is this codebase's oldest defect class wearing new clothes.
 */
export function isTerminal(v: EffortVerdict): boolean {
  return v.act === "give_up";
}
