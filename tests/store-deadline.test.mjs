import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A `try/catch` IS NOT A BOUND ON HOW LONG A CALL TAKES.
//
// MEASURED, with Firebase Admin configured and Firestore unreachable:
//
//   recordVerifiedDelivery (a single-document transaction)  > 75,000ms
//   lastVerifiedDelivery   (a single-document read)           41,459ms
//
// Both sat inside a `try/catch` whose comment promised that a failed bookkeeping
// write could never affect the Stripe response. The promise could not be kept: the
// catch cannot run until the gRPC client has finished retrying UNAVAILABLE, and
// that is far longer than the webhook invocation lives. The route is killed, Stripe
// receives no answer, and the delivery is redelivered — the exact retry storm the
// comment said was impossible.
//
// Healthy, on the same store: write 2547ms COLD then 18-46ms, read under 31ms. The
// deadlines are picked from those numbers, because one under the real cold-start
// cost would silently drop the first receipt after every deploy.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a call that never answers is bounded, and the bound is named as ours", { timeout: 10_000 }, async () => {
  const { withStoreDeadline } = await import("../src/shared/store-failure.ts");
  const t0 = Date.now();
  const r = await withStoreDeadline("the test call", 150, () => new Promise(() => {}));
  const took = Date.now() - t0;

  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.equal(r.failure.kind, "deadline");
  assert.ok(took >= 140 && took < 1_500, `waited ${took}ms for a 150ms deadline`);
  // It must say the bound was OURS. "The datastore timed out" sends somebody to
  // check Firestore's status page for a limit this code imposed.
  assert.match(r.failure.why, /bound the caller imposed/);
  assert.match(r.failure.why, /150ms/);
  assert.equal(r.failure.retryable, true);
  // `costly` matters: a caller must not answer a deadline by escalating to a
  // bigger read. That is the defect `store-failure.ts` was written for.
  assert.equal(r.failure.costly, true);
});

test("a fast call is untouched, and its value comes back", async () => {
  const { withStoreDeadline } = await import("../src/shared/store-failure.ts");
  const r = await withStoreDeadline("the test call", 5_000, async () => 42);
  assert.deepEqual(r, { ok: true, value: 42 });
});

test("a real store error is classified, not reported as a timeout", async () => {
  const { withStoreDeadline } = await import("../src/shared/store-failure.ts");
  // gRPC 8 is RESOURCE_EXHAUSTED — out of quota, which must never be answered
  // with a more expensive read.
  const quota = Object.assign(new Error("Quota exceeded"), { code: 8 });
  const r = await withStoreDeadline("the test call", 5_000, () => Promise.reject(quota));
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, false, "a failure is not a timeout, and the remedies differ");
  assert.equal(r.failure.kind, "quota");
  assert.equal(r.failure.costly, true);

  const gone = Object.assign(new Error("UNAVAILABLE: connection refused"), { code: 14 });
  const u = await withStoreDeadline("the test call", 5_000, () => Promise.reject(gone));
  assert.equal(u.failure.kind, "unavailable");
  assert.equal(u.failure.retryable, true);
});

test("a rejection that arrives AFTER the deadline does not crash the process", { timeout: 15_000 }, async () => {
  // THE FAILURE MODE THIS GUARDS, and it is the reason the attempt is settled
  // before the race rather than inside it: the caller gives up at 100ms, the
  // underlying Firestore call fails at 60s, and an unhandled rejection takes the
  // whole process down a minute after the request it belonged to was answered.
  const { withStoreDeadline } = await import("../src/shared/store-failure.ts");
  const seen = [];
  const onUnhandled = (e) => seen.push(e);
  process.on("unhandledRejection", onUnhandled);
  try {
    const r = await withStoreDeadline("the late call", 100, () =>
      new Promise((_, rej) => setTimeout(() => rej(new Error("late failure")), 400)));
    assert.equal(r.timedOut, true);
    await new Promise((res) => setTimeout(res, 700));
    assert.deepEqual(seen, [], "a late rejection must already be handled");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("the timer does not keep the event loop alive after a fast call", { timeout: 10_000 }, async () => {
  // `Promise.race` with a `setTimeout` leaves the timer pending unless it is
  // cleared, so a 6s deadline on an 18ms write would hold a serverless invocation
  // open for the remaining 5,982ms — a bound that costs more than it saves.
  const { withStoreDeadline } = await import("../src/shared/store-failure.ts");
  const before = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  await withStoreDeadline("the test call", 60_000, async () => "done");
  const after = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  assert.ok(after <= before, `left ${after - before} timer(s) pending`);
});

// ---------------------------------------------------------------------------
// THE WEBHOOK RECEIPT ITSELF.
// ---------------------------------------------------------------------------

test("both store calls on the webhook receipt are bounded", () => {
  const code = codeOf(readFileSync("src/backend/webhook-receipt.ts", "utf8"));
  // A STRUCTURAL CHECK, AND SAID TO BE ONE: making Firestore unreachable inside a
  // unit test is not possible without a store, so the behaviour is driven below
  // where one exists and asserted here where it does not.
  assert.match(code, /withStoreDeadline\("the webhook receipt write", WRITE_DEADLINE_MS/);
  assert.match(code, /withStoreDeadline\("the webhook receipt read", READ_DEADLINE_MS/);
  // The shape that could not keep its promise. `await db.runTransaction(` with
  // nothing around it is the 75-second block.
  assert.doesNotMatch(code, /await adminDb\.runTransaction\(/,
    "an unwrapped transaction is the unbounded call this replaced");
  assert.doesNotMatch(code, /await adminDb\.collection\(COLLECTION\)\.doc\(DOC\)\.get\(\)/,
    "an unwrapped read is the 41-second block this replaced");

  // The deadline must clear the MEASURED cold start, or a healthy deployment
  // loses the first receipt after every deploy — the one that matters most.
  const write = Number((code.match(/WRITE_DEADLINE_MS = ([0-9_]+)/) || [])[1]?.replace(/_/g, ""));
  assert.ok(write >= 5_000, `a ${write}ms write deadline is under the 2547ms cold start plus headroom`);
  assert.ok(write <= 15_000, `a ${write}ms write deadline is most of a webhook invocation for a bookkeeping write`);
});

test("the fact that a delivery verified survives, with or without a store", { timeout: 25_000 }, async () => {
  // The receipt's job is to answer "did the signing secret ever verify?". A store
  // outage must downgrade that to per-instance, never to silence — the launch
  // report reads "never proven" as a blocker.
  //
  // WRITTEN TO HOLD IN BOTH CONFIGURATIONS. The first version asserted
  // `verifiedCount === 1`, which is only true of the in-memory fallback: with a
  // store present the counter carries whatever earlier deliveries left there, and
  // the test failed for a reason unrelated to what it tests. It also called itself
  // "a store that cannot be reached" while making nothing unreachable — the
  // unreachable case is the child-process test at the end of this file, which is
  // the only way to create it.
  const admin = await import("../src/backend/firebase-admin.ts");
  const wr = await import("../src/backend/webhook-receipt.ts");
  wr.__resetWebhookReceipt();
  const before = (await wr.lastVerifiedDelivery()).verifiedCount;
  await wr.recordVerifiedDelivery("invoice.paid");
  const got = await wr.lastVerifiedDelivery();
  assert.equal(got.lastEventType, "invoice.paid");
  assert.ok(got.lastVerifiedAt, "the fact that a delivery verified must survive");
  assert.equal(got.verifiedCount, before + 1,
    admin.adminConfigured ? "the stored counter must advance by one" : "the in-memory counter must advance by one");
});

test("a stored document is checked, so half a record is not a receipt", async () => {
  // Replaced two casts. `snap.data() as WebhookReceipt` is the programmer
  // promising the compiler something nobody verified, and what is being promised
  // is "the money path is proven".
  const code = codeOf(readFileSync("src/backend/webhook-receipt.ts", "utf8"));
  assert.match(code, /function receiptFromStored\(raw: unknown\)/);
  assert.doesNotMatch(code, /as WebhookReceipt \| null/);
  assert.doesNotMatch(code, /as Partial<WebhookReceipt> \| null/);
  // A document with no timestamp is NOT a receipt, however many other fields it
  // carries — "not proven" is the safe direction and the launch report relies on it.
  assert.match(code, /if \(typeof d\.lastVerifiedAt !== "string" \|\| !d\.lastVerifiedAt\) return \{ \.\.\.EMPTY \};/);
});

test("a store outage is distinguishable from nothing having verified", { timeout: 20_000 }, async () => {
  // The two look identical in a report and want different actions: one says "your
  // webhook has never worked", the other says "we could not ask".
  const wr = await import("../src/backend/webhook-receipt.ts");
  wr.__resetWebhookReceipt();
  assert.equal(wr.receiptStoreNote(), null, "a clean slate reports no store trouble");
  const code = codeOf(readFileSync("src/backend/webhook-receipt.ts", "utf8"));
  assert.match(code, /lastStoreFailure = done\.failure\.why;/, "the write must record why");
  assert.match(code, /lastStoreFailure = got\.failure\.why;/, "and so must the read");
});

// ---------------------------------------------------------------------------
// DRIVEN AGAINST A STORE THAT IS GENUINELY UNREACHABLE.
//
// This is the only test here that reproduces the original fault, so it SKIPS
// LOUDLY rather than passing quietly when there is nothing to drive. A silent
// skip on the one case that matters is how a regression ships.
// ---------------------------------------------------------------------------

test("a dead Firestore returns inside the deadline instead of blocking for a minute", { timeout: 120_000 }, async (t) => {
  const admin = await import("../src/backend/firebase-admin.ts");
  if (!admin.adminConfigured) {
    t.skip("SKIPPED: Firebase Admin is not configured here, so the bounded store path cannot be driven. "
      + "Set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY to run it.");
    return;
  }

  // IN A CHILD PROCESS, AND THAT IS THE POINT. `firebase-admin.ts` initialises its
  // client on first import and reads FIRESTORE_EMULATOR_HOST then, so setting the
  // variable in THIS process after the module is cached redirects nothing — the
  // first version of this test did exactly that, wrote to the live emulator,
  // succeeded, and failed on "the store trouble is on the record" because there
  // was none. A fresh process is the only way to point the client at a port
  // nothing is listening on.
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const deadPort = probe.address().port;
  await new Promise((r) => probe.close(r));

  // An absolute FILESYSTEM path, not a file:// URL: tsx's loader transforms the
  // former and hands back the raw module for the latter, which is why the first
  // attempt reported `recordVerifiedDelivery is not a function`.
  const mod = (rel) => JSON.stringify(fileURLToPath(new URL(rel, import.meta.url)));
  const script = `
    const wr = await import(${mod("../src/backend/webhook-receipt.ts")});
    const admin = await import(${mod("../src/backend/firebase-admin.ts")});
    const t0 = Date.now();
    await wr.recordVerifiedDelivery("invoice.paid");
    const writeMs = Date.now() - t0;
    const t1 = Date.now();
    const got = await wr.lastVerifiedDelivery();
    process.stdout.write(JSON.stringify({
      configured: admin.adminConfigured,
      writeMs, readMs: Date.now() - t1,
      lastEventType: got.lastEventType,
      note: wr.receiptStoreNote(),
    }));
    process.exit(0);
  `;

  // A REAL FILE, not `-e`. tsx's loader does not transform the TypeScript imported
  // from an eval'd module, so `-e` produced "recordVerifiedDelivery is not a
  // function" twice before this was the answer. Written to a temp directory so the
  // repository is not touched.
  const dir = mkdtempSync(join(tmpdir(), "mw-deadline-"));
  const file = join(dir, "probe.mjs");
  writeFileSync(file, script);

  const started = Date.now();
  const child = spawnSync(process.execPath, ["--import", "tsx", file], {
    encoding: "utf8",
    timeout: 90_000,
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${deadPort}`, NODE_ENV: "test" },
  });
  const wall = Date.now() - started;
  rmSync(dir, { recursive: true, force: true });

  const out = (child.stdout || "").slice((child.stdout || "").indexOf("{"));
  let r = null;
  try { r = JSON.parse(out); } catch { /* reported below */ }
  assert.ok(r, `the child produced no result (status ${child.status}, signal ${child.signal}): ${(child.stderr || "").slice(-400)}`);
  assert.equal(r.configured, true, "the child must have Admin configured or it proves nothing");

  // THE NUMBER THIS TEST EXISTS FOR. Unbounded, this write blocked for over
  // 75,000ms and the read for 41,459ms.
  assert.ok(r.writeMs < 12_000, `the write took ${r.writeMs}ms against a dead store — the deadline is not holding`);
  assert.ok(r.readMs < 12_000, `the read took ${r.readMs}ms against a dead store — the deadline is not holding`);
  assert.ok(wall < 60_000, `the whole attempt took ${wall}ms, which is longer than a webhook invocation lives`);

  // And the fact still survives, with the reason on the record rather than swallowed.
  assert.equal(r.lastEventType, "invoice.paid", "the receipt must still land in memory");
  assert.ok(r.note, "a store outage must be reportable, not silent");
});

test("a failed store read falls back to what this instance verified, not to nothing", { timeout: 25_000 }, async () => {
  // FOUND BY DRIVING A DEAD STORE, and it was a defect in the fix rather than in
  // the original: the write fell back to memory and the read returned EMPTY over
  // the top of it, so within one invocation the write landed and the read said
  // "never verified". The fallback was write-only.
  const code = codeOf(readFileSync("src/backend/webhook-receipt.ts", "utf8"));
  assert.match(code, /if \(!got\.ok\) \{[\s\S]{0,200}?return \{ \.\.\.mem \};/,
    "a failed read must return what this process knows");
  // And a store that answers "nothing here" while this instance holds a verified
  // delivery is a store that lost the write — the delivery still happened.
  assert.match(code, /if \(!stored\.lastVerifiedAt && mem\.lastVerifiedAt\) return \{ \.\.\.mem \};/);

  // STILL SAFE IN THE DIRECTION THAT MATTERS: with nothing ever verified, a store
  // outage must read as NOT proven, because the launch report treats that as a
  // blocker and the opposite would clear a blocker on a database error.
  const wr = await import("../src/backend/webhook-receipt.ts");
  wr.__resetWebhookReceipt();
  const fresh = await import("../src/backend/firebase-admin.ts");
  if (!fresh.adminConfigured) {
    const empty = await wr.lastVerifiedDelivery();
    assert.equal(empty.lastVerifiedAt, null, "a clean slate must never read as proven");
    assert.equal(empty.verifiedCount, 0);
  }
});
