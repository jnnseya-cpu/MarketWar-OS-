// Regression test for the payout double-send race (audit F-4).
// The claim on a withdrawal must be ATOMIC: of N concurrent identical requests,
// exactly one may proceed to send; the rest must be told it is a replay so no
// second payment leaves. Runs on the in-memory path (no Firebase/keys needed),
// which is the single-instance atomic guard; the Firestore path uses create()
// (ALREADY_EXISTS) for the same guarantee across instances.
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

const { claimAttempt } = await import("../src/backend/payout-execute.ts");

const attempt = (id) => ({
  id, creatorId: "c1", railId: "stripe_bank",
  grossPence: 5000, feesPence: 0, netPence: 5000,
  state: "claimed", createdAt: new Date().toISOString(),
});

test("first claim wins, second identical claim is a replay (never a second send)", async () => {
  const id = "pay_" + Math.random().toString(36).slice(2);
  const first = await claimAttempt(attempt(id));
  const second = await claimAttempt(attempt(id));
  assert.equal(first.ok, true, "first claim must succeed");
  assert.equal(second.ok, false, "second claim must NOT succeed");
  assert.equal(second.replay, true, "second claim must be flagged as a replay, not an error");
});

test("N concurrent identical claims yield exactly one winner", async () => {
  const id = "pay_" + Math.random().toString(36).slice(2);
  const results = await Promise.all(Array.from({ length: 25 }, () => claimAttempt(attempt(id))));
  const winners = results.filter((r) => r.ok === true).length;
  const replays = results.filter((r) => r.ok === false && r.replay === true).length;
  assert.equal(winners, 1, "exactly one concurrent claim may win");
  assert.equal(replays, 24, "every other concurrent claim must be a replay");
});

test("different ids each get their own claim", async () => {
  const a = await claimAttempt(attempt("pay_a_" + Math.random().toString(36).slice(2)));
  const b = await claimAttempt(attempt("pay_b_" + Math.random().toString(36).slice(2)));
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});
