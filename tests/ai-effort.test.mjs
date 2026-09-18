import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextAction, isTerminal, isHopeless, EFFORT_LAW } from "../src/shared/ai-effort.ts";

// THE OWNER DIRECTIVE THIS ENFORCES:
//
//   "Every AI powered work must have no time limit and ACUs limit, regardless
//    how long it can take and how much it will cost. The AI powered functions
//    must work until produce the highly expected results."
//
// A policy is only worth the test that fails when it stops being true, and the
// first test below is the one that matters: it enumerates thousands of states
// and asserts that NO amount of elapsed time and NO number of attempts ever
// produces a stop on its own. That is the property; everything else is detail.

const base = {
  attemptsMade: 0,
  truncated: false,
  lastFailure: null,
  invocationRemainingMs: 60_000,
  minAttemptMs: 8_000,
};

test("NOTHING stops for time, attempts or cost — swept, not spot-checked", () => {
  // A spot check would pass against a rule like "give up after 50 attempts".
  // This sweeps the space where such a rule would hide.
  let checked = 0;
  for (const attemptsMade of [0, 1, 2, 5, 17, 99, 1000, 100_000]) {
    for (const invocationRemainingMs of [8_000, 30_000, 600_000, 86_400_000]) {
      for (const kind of [null, "rate_limited", "no_credit", "server", "network", "unknown", "no_key", "no_model", "no_access"]) {
        const v = nextAction({
          ...base, attemptsMade, invocationRemainingMs,
          lastFailure: kind ? { kind } : null,
        });
        assert.notEqual(v.act, "give_up",
          `gave up after ${attemptsMade} attempts with ${invocationRemainingMs}ms left and ${kind} — `
          + "no resource may ever end the work");
        checked++;
      }
    }
  }
  assert.ok(checked > 200, `the sweep must actually sweep (checked ${checked})`);
});

test("the ONLY stop is a request no provider could ever accept", () => {
  for (const kind of ["content_refused", "bad_request"]) {
    const v = nextAction({ ...base, lastFailure: { kind } });
    assert.equal(v.act, "give_up", `${kind} cannot be fixed by trying again`);
    assert.equal(isTerminal(v), true);
    // And it must say so in terms of the REQUEST, never in terms of resources,
    // or the customer reads "we gave up" and tops up an account that was fine.
    assert.match(v.why, /refused the request itself|malformed/);
    assert.match(v.why, /Nothing was stopped for time or cost/);
  }
  assert.equal(isHopeless("content_refused"), true);
  assert.equal(isHopeless("rate_limited"), false);
  assert.equal(isHopeless(null), false);
});

test("running out of INVOCATION is a hand-off, never a failure", () => {
  // The distinction the whole design rests on. A serverless function has a hard
  // ceiling; the work does not. Reporting this as a failure would tell somebody
  // their run died when it is simply continuing.
  const v = nextAction({ ...base, invocationRemainingMs: 500, minAttemptMs: 8_000 });
  assert.equal(v.act, "hand_off");
  assert.equal(isTerminal(v), false, "a hand-off must never be reported as a terminal failure");
  assert.match(v.why, /continues outside it|not over/);
});

test("a truncated answer is a reason to continue, never a result", () => {
  const v = nextAction({ ...base, truncated: true });
  assert.equal(v.act, "continue_output");
  assert.equal(isTerminal(v), false);
  assert.match(v.why, /incomplete|half a document/);
});

test("a hopeless request beats everything, including a truncation", () => {
  // Ordering matters: asking for more output on a prompt the provider refuses
  // would loop forever producing nothing.
  const v = nextAction({ ...base, truncated: true, lastFailure: { kind: "content_refused" } });
  assert.equal(v.act, "give_up");
});

test("no room to continue beats a truncation — a continuation is itself an attempt", () => {
  // Asking for the rest needs somewhere to run. Answering "continue_output"
  // with no time left would send the caller into an attempt that cannot start.
  const v = nextAction({ ...base, truncated: true, invocationRemainingMs: 100 });
  assert.equal(v.act, "hand_off");
});

test("with room and a transient failure, it simply goes again", () => {
  for (const kind of ["rate_limited", "server", "network", "no_credit", "unknown"]) {
    const v = nextAction({ ...base, lastFailure: { kind }, attemptsMade: 3 });
    assert.equal(v.act, "retry_provider", `${kind} must be retried`);
    assert.match(v.why, /Attempt 4/);
  }
});

test("the law is stated once and says all three parts out loud", () => {
  // It said "no cost limit", and the owner corrected that: ACUs are not a cap to
  // be removed, they are a requirement. The sentence has to carry the
  // distinction, because this constant is what surfaces quote.
  assert.match(EFFORT_LAW, /no time limit/i);
  assert.match(EFFORT_LAW, /no attempt limit/i);
  assert.match(EFFORT_LAW, /handed on/i);
  assert.doesNotMatch(EFFORT_LAW, /no cost limit/i,
    "ACUs are not a cap that was removed — sufficient credit is required");
  assert.match(EFFORT_LAW, /sufficient credit must be\s+available/i);
  assert.match(EFFORT_LAW, /waits for a top-up rather than\s+failing/i);
});

// ---------------------------------------------------------------------------
// THE GATEWAY, which is where every AI call in the platform goes through.
// ---------------------------------------------------------------------------

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Just the provider loop inside `gatewayComplete`.
 *
 * SCOPED ON PURPOSE. The first version of this test asserted over the whole
 * file and failed on `askProvider`, which is a different function with the
 * opposite job: it asks ONE named assistant and reports exactly what that
 * assistant did, truncation included, because the AI-visibility monitor measures
 * per-assistant and falling over to another would be a fabricated measurement.
 * Forbidding truncation there would have broken a measurement to satisfy a rule
 * about deliverables — a check failing for a reason unrelated to what it tests.
 */
function providerLoop(src) {
  const start = src.indexOf("const runProviders");
  assert.ok(start > 0, "the provider loop could not be located");
  return codeOf(src.slice(start));
}

test("the gateway never returns a truncated completion as a finished one", () => {
  const code = providerLoop(readFileSync("src/backend/gateway.ts", "utf8"));
  // It used to `return { text, truncated: out.truncated, … }` — a half-written
  // document handed back with a flag callers were free to ignore, and at least
  // one did.
  assert.doesNotMatch(code, /truncated:\s*out\.truncated/,
    "a truncated completion must be continued, not returned with a flag on it");
  assert.match(code, /if \(out\.truncated\) \{/, "truncation must be handled before the success path");
  assert.match(code, /sawTruncation = true/);
  assert.match(code, /truncated: false,/,
    "a response that reaches the caller is complete by construction, and the field should say so");
});

test("the gateway asks the effort policy, rather than deciding on its own clock", () => {
  const code = providerLoop(readFileSync("src/backend/gateway.ts", "utf8"));
  assert.match(code, /nextAction\(\{/, "the decision lives in one tested place");
  assert.match(code, /AiWorkIncompleteError/, "and running out of invocation must be its own outcome");
  // The old ending. If this string comes back, the loop has gone back to giving
  // up when a single pass over the providers produced nothing.
  assert.doesNotMatch(code, /All AI providers failed/,
    "a pass that produced nothing is a reason to go round again, not to stop");
});

test("NO ACUs MEANS NO AI WORK — and nothing runs on credit", async () => {
  // OWNER DIRECTIVE, correcting an earlier reading of the effort law. "No time
  // and ACUs limit" means sufficient ACUs must be AVAILABLE; it does not put the
  // platform on credit. An earlier version charged with a call that could not
  // refuse and recorded the shortfall as owed — that is gone, and this is the
  // test that fails if it comes back.
  const wallet = codeOf(readFileSync("src/backend/wallet.ts", "utf8"));
  assert.doesNotMatch(wallet, /export async function settleAcus/,
    "a charge that cannot refuse would let work run with no ACUs behind it");
  assert.doesNotMatch(wallet, /owedAcu: Math\.max\(0, Math\.round\(cur\.owedAcu \|\| 0\)\) \+ short/,
    "an AI pass must never add to owed — owed is for refunds and chargebacks, which is what it was there for");

  // The job path charges with the ORDINARY debit, which refuses when short.
  const jobs = codeOf(readFileSync("src/backend/ai-jobs.ts", "utf8"));
  assert.match(jobs, /const paid = await debitAcus\(walletId, cost\);/,
    "the charge is the same debit every other spending path uses");
  assert.match(jobs, /if \(!paid\.ok\) \{/, "and a pass that cannot be paid for does not run");
  assert.doesNotMatch(jobs, /settleAcus/);
});

test("the rate is the one that was always there, and the door only CHECKS", () => {
  // Two things the owner asked to be left exactly as they were: the multiplier,
  // and the number of times a piece of provider work is charged for.
  const jobs = codeOf(readFileSync("src/backend/ai-jobs.ts", "utf8"));
  assert.match(jobs, /const cost = ACTION_COST_ACU\.llm;/,
    "the rate comes from the existing table, never from a new number");

  // The start gate must not ALSO charge, or a job is billed twice for its first
  // pass — once at the door and once when a provider is actually called.
  const route = codeOf(readFileSync("src/app/api/ai-jobs/route.ts", "utf8"));
  assert.match(route, /canAffordAction\(access, "llm", 1\)/);
  // AND IT MUST ACT ON THE ANSWER. A structural check, and said to be one: the
  // route needs brand access and a datastore, so the refusal is asserted here
  // rather than driven. Removing this line let a wallet with nothing in it
  // commission work, and every other test in the file still passed.
  assert.match(route, /if \(!afford\.ok\) return NextResponse\.json\(\{ error: afford\.error \}, \{ status: 402 \}\);/,
    "no ACUs must refuse at the door, not merely be noticed there");
  assert.doesNotMatch(route, /meterAction\(/,
    "checking and charging at the door double-bills the first pass");
});

test("canAffordAction refuses a short wallet without taking anything", async () => {
  const w = await import("../src/backend/wallet.ts");
  const id = `afford-${Date.now()}`;
  const before = (await w.getWallet(id)).balanceAcu;

  // `enforced: true` matters: without it `meteringExempt` correctly exempts the
  // caller, because a deployment with no accounts enforced has no wallet to
  // bill and zero-config demo mode must keep working. The first version of this
  // test left it out and measured the exemption instead of the refusal.
  const auth = { ok: true, uid: id, enforced: true, status: 200 };
  const rich = await w.canAffordAction(auth, "llm", 1);
  assert.equal(rich.ok, true, "a funded wallet can start");
  assert.equal((await w.getWallet(id)).balanceAcu, before, "a CHECK must not move the balance");

  // Drain it, then ask again.
  await w.debitAcus(id, before);
  const broke = await w.canAffordAction(auth, "llm", 1);
  assert.equal(broke.ok, false);
  assert.match(broke.error, /Out of ACUs/);
  assert.equal(broke.needed, w.ACTION_COST_ACU.llm, "it asks for the rate in the existing table");
});

test("the provider loop has no pass ceiling", () => {
  // A STRUCTURAL CHECK, AND SAID TO BE ONE. The loop cannot be driven from here
  // — every adapter posts to a real provider host — so this asserts the shape
  // instead: an unbounded outer loop whose only exits are the two verdicts.
  // A mutation to `pass < 1` restores exactly the single-pass behaviour the
  // directive forbids and survived every other test in this file.
  const code = providerLoop(readFileSync("src/backend/gateway.ts", "utf8"));
  assert.match(code, /for \(let pass = 0; ; pass\+\+\) \{/,
    "the outer loop must be unbounded — a pass limit is an attempt limit wearing a different name");
  assert.doesNotMatch(code, /for \(let pass = 0; pass [<!]/,
    "a bounded pass loop is the single-pass give-up this replaced");
});
