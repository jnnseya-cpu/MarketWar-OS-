import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THE WEBHOOK MUST ANSWER, EVEN BADLY.
//
// Stripe reported 35 consecutive deliveries with "other errors" — its category
// for an exchange that produced NO HTTP STATUS AT ALL — and scheduled the
// endpoint for disabling. A route that answers 500 is retried for three days.
// A route that answers NOTHING is counted as broken and switched off.
//
// This platform had already written the diagnosis down, in §155, about a
// different file: "a try/catch bounds what happens when a call FAILS, never how
// long it takes to fail — the route is killed first, so Stripe gets no answer
// at all." That fix bounded the receipt write and stopped there. The wallet
// transaction, the commission accrual, the wallet read, the Firebase Auth
// lookup and the ledger write stayed unbounded, and the route stated no
// `maxDuration`, so it ran under the platform's invisible default.

const sf = await import("../src/shared/store-failure.ts");
const ROUTE = readFileSync(new URL("../src/app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");

test("THE CEILING IS STATED, not inherited from the platform", () => {
  // Every other heavy route here states its own. This one never did, which is
  // how a handler doing six network calls came to run under a short default.
  assert.match(ROUTE, /export const maxDuration = \d+/, "the webhook must state its own ceiling");
  const ceiling = Number(/export const maxDuration = (\d+)/.exec(ROUTE)[1]);
  // It has to outlive the internal budget, or the budget can never produce the
  // 500 it exists to produce — the invocation dies first and Stripe gets
  // silence again.
  const budget = Math.max(
    ...[...ROUTE.matchAll(/^const \w*DEADLINE_MS = ([\d_]+);/gm)].map((m) => Number(m[1].replace(/_/g, ""))),
    Number(/^const ACK_TARGET_MS = ([\d_]+);/m.exec(ROUTE)[1].replace(/_/g, "")),
  );
  assert.ok(ceiling * 1000 > budget * 2, `the ceiling (${ceiling}s) must comfortably outlive the internal budget (${budget}ms)`);
});

test("EVERY call on the money path is bounded", () => {
  // THE IMPORT BLOCK IS NOT A CALL SITE. The first version of this searched the
  // whole file and matched the `import { applyWebhookOutcome }` line, then
  // reported the route as unbounded while it was correctly bounded — the
  // instrument wrong rather than the code, which is this session's refrain.
  const body = ROUTE.slice(ROUTE.indexOf("export const runtime"));

  // Named individually rather than counted: a count passes while the one that
  // matters is the one left out.
  for (const call of [
    "applyWebhookOutcome",   // the Firestore transaction that credits the wallet
    "commissionForPayment",  // the accrual
    "getWallet",             // the read behind conversion reporting
    "getUser",               // Firebase Auth — a network call with no ceiling of its own
    "recordEvent",           // the revenue ledger write
  ]) {
    const sites = [...body.matchAll(new RegExp(`\\b${call}\\(`, "g"))].map((m) => m.index);
    assert.ok(sites.length > 0, `${call} is no longer on this path — if that is deliberate, remove it from this list`);
    for (const at of sites) {
      const before = body.slice(Math.max(0, at - 300), at);
      assert.ok(
        before.lastIndexOf("withStoreDeadline(") > before.lastIndexOf(";"),
        `${call} is called without a deadline — a try/catch around it bounds failure, never duration`,
      );
    }
  }

  // And nothing is awaited bare on the money path any more.
  for (const bare of ["applyWebhookOutcome", "commissionForPayment", "getWallet", "recordEvent"]) {
    assert.ok(!body.includes(`await ${bare}(`), `await ${bare}( is unbounded`);
  }
});

test("a money-path timeout is a RETRIABLE 500, never a silent success", async () => {
  // The rule that makes a 500 safe: every write on this path is idempotent, so
  // Stripe redelivering for three days costs nothing and loses nothing.
  const hang = await sf.withStoreDeadline("the wallet credit", 40, () => new Promise(() => {}));
  assert.equal(hang.ok, false);
  assert.equal(hang.timedOut, true);
  assert.equal(hang.failure.kind, "deadline");
  assert.equal(hang.failure.retryable, true, "a timeout must be retriable, or Stripe is told to stop");

  // And the route turns that into a 500 with willRetry, not a 200.
  const walletBlock = ROUTE.slice(ROUTE.indexOf("the wallet credit"), ROUTE.indexOf("the wallet credit") + 900);
  assert.match(walletBlock, /status: 500/);
  assert.match(walletBlock, /willRetry: true/);
  assert.match(walletBlock, /timedOut/, "the two are different problems and the answer says which");
});

test("the BEST-EFFORT tail is abandoned instead of delaying the acknowledgement", () => {
  // Three network calls on a payment whose money already persisted. None of
  // them can fail the webhook — that was true of errors and false of time.
  const tail = ROUTE.slice(ROUTE.indexOf("THE TAIL NEVER DELAYS"));
  assert.match(tail, /elapsed\(\) > ACK_TARGET_MS/, "past the budget the tail must be skipped outright");
  assert.match(tail, /skipped:/);
  // A tail failure must never become a 500: that would make Stripe redeliver a
  // payment that landed perfectly.
  const conversionBlock = tail.slice(0, tail.indexOf("return NextResponse.json({ received: true"));
  assert.doesNotMatch(conversionBlock, /status: 500/, "a conversion report must never fail a payment");
});

test("a bounded call that SUCCEEDS is not disturbed", async () => {
  // The bound must be invisible when the store is healthy, or every payment
  // pays for the protection.
  const fast = await sf.withStoreDeadline("a healthy write", 5_000, async () => "done");
  assert.equal(fast.ok, true);
  assert.equal(fast.value, "done");

  // A rejection still arrives as a failure rather than a timeout — the two are
  // distinguished, because "refused us" and "never answered" need different fixes.
  const refused = await sf.withStoreDeadline("a refused write", 5_000, async () => { throw new Error("PERMISSION_DENIED"); });
  assert.equal(refused.ok, false);
  assert.equal(refused.timedOut, false);
});

test("the acknowledgement carries how long it took", () => {
  // 35 deliveries failed and nothing on this side could say whether the handler
  // had been slow, because the number was never recorded. Stripe shows the
  // response body on every delivery, so this is where it is cheapest to put.
  assert.match(ROUTE, /received: true, ms: elapsed\(\)/);
  assert.match(ROUTE, /const startedAt = Date\.now\(\)/, "and it is measured from arrival, not from part-way through");
});
