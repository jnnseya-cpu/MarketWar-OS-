import test from "node:test";
import assert from "node:assert/strict";
import {
  stripeKeyMode, mayCreateBillableObjects, endpointDelivers, chooseProvocation, driveVerdict,
} from "../src/shared/stripe-drive.ts";

// WHAT THESE TESTS ARE FOR.
//
// Every branch here decides something that only a real Stripe account can put in
// front of it, which is precisely the condition under which this repository has
// shipped an unexercised branch before: `probeTargets` was inline in a route,
// was mutated open, and nothing failed, because the container has no key. So the
// account shapes are constructed here and the decisions are driven directly.
//
// The one that matters most is the safety gate. A live key must never create a
// billable object, and "must never" is a claim that needs a test which fails
// when it stops being true.

const rec = (n) => ({ lastVerifiedAt: n ? `2026-09-14T00:00:0${n}Z` : null, verifiedCount: n });

test("the key's mode is read from its prefix, standard and restricted alike", () => {
  assert.equal(stripeKeyMode("sk_test_abc"), "test");
  assert.equal(stripeKeyMode("rk_test_abc"), "test");
  assert.equal(stripeKeyMode("sk_live_abc"), "live");
  assert.equal(stripeKeyMode("rk_live_abc"), "live");
  assert.equal(stripeKeyMode(""), "none");
  assert.equal(stripeKeyMode(undefined), "none");
  // A key that will not say is NOT assumed safe.
  assert.equal(stripeKeyMode("whsec_something_pasted_in_the_wrong_slot"), "unknown");
});

test("ONLY a recognised test key may create a billable object", () => {
  assert.equal(mayCreateBillableObjects("test"), true);
  for (const m of ["live", "unknown", "none"]) {
    assert.equal(mayCreateBillableObjects(m), false, `${m} must not be allowed to create billable objects`);
  }
});

test("a live key is never offered the invoice path, however well subscribed the endpoint is", () => {
  // The endpoint subscribes to EVERYTHING, so the only thing that can stop an
  // invoice here is the key's mode. If this ever returns "invoice", a diagnostic
  // has invoiced somebody.
  const p = chooseProvocation({ mode: "live", enabledEvents: ["*"] });
  assert.equal(p.kind, "customer");
  assert.equal(p.exercisesWallet, false);
  assert.match(p.why, /LIVE/);
});

test("a restricted key that will not reveal its mode is treated as live", () => {
  const p = chooseProvocation({ mode: "unknown", enabledEvents: ["*"] });
  assert.equal(p.kind, "customer");
  assert.equal(p.exercisesWallet, false);
});

test("a test key with a subscribed endpoint gets the invoice, which is the only whole-loop proof", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["invoice.paid", "customer.created"] });
  assert.equal(p.kind, "invoice");
  assert.equal(p.eventType, "invoice.paid");
  assert.equal(p.exercisesWallet, true);
});

test("a test key whose endpoint does NOT subscribe to invoice.paid falls back, and says the fallback proves less", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["customer.created"] });
  assert.equal(p.kind, "customer");
  // THE POINT OF THE FALLBACK IS THAT IT CLAIMS LESS. If this ever reports true,
  // a run that moved no money would be reported as proving the wallet credit.
  assert.equal(p.exercisesWallet, false);
  assert.match(p.why, /not subscribed to `invoice\.paid`/);
});

test("an endpoint subscribed to neither is reported as nothing-to-do, with the reason", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["charge.succeeded"] });
  assert.equal(p.kind, null);
  assert.match(p.blocker, /delivers only what an endpoint asks for/);
  // The remedy names the free event, not the billable one.
  assert.match(p.blocker, /customer\.created/);
});

test("no key at all is a skip with a reason, never a silent pass", () => {
  const p = chooseProvocation({ mode: "none", enabledEvents: ["*"] });
  assert.equal(p.kind, null);
  assert.match(p.blocker, /demo-mode/);
});

test("Stripe's `*` covers everything, and an exact list covers only itself", () => {
  assert.equal(endpointDelivers(["*"], "invoice.paid"), true);
  assert.equal(endpointDelivers(["invoice.paid"], "invoice.paid"), true);
  assert.equal(endpointDelivers(["invoice.paid"], "customer.created"), false);
  assert.equal(endpointDelivers([], "invoice.paid"), false);
});

// ---------------------------------------------------------------------------
// THE VERDICT. Three failures that look identical and have different fixes.
// ---------------------------------------------------------------------------

const credited = { orgId: "org_1", creditedAcu: 980, planId: "growth" };

test("a receipt that MOVED is the proof; a receipt that was already non-empty is not", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const moved = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(3), after: rec(4), walletOutcome: credited });
  assert.equal(moved.proven, true);
  assert.equal(moved.walletProven, true);
  assert.equal(moved.outcome, "verified");

  // Same non-empty receipt before and after: nothing happened on THIS run.
  const stalled = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(3), after: rec(3) });
  assert.equal(stalled.proven, false);
});

test("a verified free event proves the secret and NEVER the wallet", () => {
  const p = chooseProvocation({ mode: "live", enabledEvents: ["*"] });
  const v = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(0), after: rec(1) });
  assert.equal(v.proven, true);
  // The strictly stronger claim must not ride along with the weaker one.
  assert.equal(v.walletProven, false);
  assert.match(v.verdict, /NOT proven by this/);
});

// AN OUTSTANDING DELIVERY ATTEMPT HAS TWO CAUSES WITH OPPOSITE FIXES.
//
// The first version of this file asserted the DNS/redirect one. Driving a
// deliberately wrong signing secret produced exactly that state — the delivery
// arrived, the route answered 400, Stripe left the attempt outstanding — and the
// run told the operator to go and check DNS. These three cases hold the
// discrimination that replaced it.

test("outstanding attempts + a REACHABLE address means the secret, not the network", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 1, before: rec(0), after: rec(0), endpointReachable: true });
  assert.equal(v.outcome, "delivered_not_verified");
  assert.match(v.fix, /reveal ITS secret/);
  assert.doesNotMatch(v.fix, /selfDelivery/);
  // And it admits what the reachability probe cannot see, rather than
  // overclaiming from a localhost round trip.
  assert.match(v.verdict, /starts inside this deployment/);
});

test("outstanding attempts + an UNREACHABLE address means the address", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 1, before: rec(0), after: rec(0), endpointReachable: false });
  assert.equal(v.outcome, "not_delivered");
  assert.match(v.fix, /selfDelivery/);
  assert.doesNotMatch(v.fix, /reveal ITS secret/);
});

test("outstanding attempts with reachability UNKNOWN asserts neither cause and gives both, in order", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 1, before: rec(0), after: rec(0) });
  assert.equal(v.outcome, "not_delivered");
  assert.match(v.verdict, /TWO different faults/);
  assert.match(v.verdict, /neither is asserted/);
  // BOTH remedies, because picking one would be picking wrong half the time.
  assert.match(v.fix, /selfDelivery/);
  assert.match(v.fix, /reveal ITS secret/);
  assert.match(v.fix, /FIRST, reachability/);
});

test("no attempts outstanding and no receipt means something else accepted it", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(0), after: rec(0) });
  assert.equal(v.outcome, "delivered_not_verified");
  assert.match(v.verdict, /just not this deployment/);
});

test("a test key against a live-mode secret is named as a mode mismatch, not as a broken money path", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({ provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(0), after: rec(0), modeMismatch: true });
  assert.equal(v.proven, false);
  assert.match(v.verdict, /SEPARATE signing secrets/);
  // And it must not be read as evidence about live either way.
  assert.match(v.fix, /not evidence about the live path/);
});

test("nothing attempted is never reported as proven, and carries the blocker forward", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["charge.succeeded"] });
  const v = driveVerdict({ provocation: p, eventId: null, pendingWebhooks: null, before: rec(0), after: rec(0) });
  assert.equal(v.proven, false);
  assert.equal(v.outcome, "not_attempted");
  assert.equal(v.fix, p.blocker);
});

test("an event Stripe never returned an id for implicates nothing downstream", () => {
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({ provocation: p, eventId: null, pendingWebhooks: null, before: rec(2), after: rec(2) });
  assert.equal(v.outcome, "not_attempted");
  assert.match(v.verdict, /webhook is not implicated/);
});

test("THE WALLET CLAIM IS MEASURED, NEVER INFERRED FROM THE EVENT TYPE", () => {
  // The defect this replaces: `walletProven` was `provocation.exercisesWallet`,
  // a fact about the event TYPE. The receipt moves on signature verification,
  // before anything downstream can fail, so a delivery that verified and then
  // credited NOTHING produced an identical green tick on the money path.
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  assert.equal(p.exercisesWallet, true, "the invoice path is the one that claims the wallet");

  const nothingRecorded = driveVerdict({
    provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(0), after: rec(1), walletOutcome: null,
  });
  assert.equal(nothingRecorded.proven, true, "the delivery itself did verify");
  assert.equal(nothingRecorded.walletProven, false, "but nothing says the wallet moved");
  assert.match(nothingRecorded.verdict, /HALF PROVEN/);
  assert.match(nothingRecorded.verdict, /charged and served nothing/);
  assert.notEqual(nothingRecorded.fix, "", "a half-proven money path must carry a next step");

  // A record that exists but credited zero is not a credit either.
  const zero = driveVerdict({
    provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(0), after: rec(1),
    walletOutcome: { orgId: "org_1", creditedAcu: 0, planId: null },
  });
  assert.equal(zero.walletProven, false);
});

test("a free provocation never claims the wallet even when a credit is somehow recorded", () => {
  // Defence in depth: the customer path moves no money, so a wallet record
  // against it would be somebody else's event and must not be borrowed as proof.
  const p = chooseProvocation({ mode: "live", enabledEvents: ["*"] });
  const v = driveVerdict({
    provocation: p, eventId: "evt_1", pendingWebhooks: 0, before: rec(0), after: rec(1), walletOutcome: credited,
  });
  assert.equal(v.proven, true);
  assert.equal(v.walletProven, false);
  assert.equal(v.fix, "", "a free provocation that verified has nothing outstanding");
});

test("a receipt whose COUNT moved but whose timestamp did not still counts as movement", () => {
  // The mirror of the case below, and it was the one mutation that survived:
  // every other case moved both fields at once, so the count clause was never
  // exercised on its own. Two deliveries inside the same millisecond produce
  // exactly this — an identical ISO string with the count one higher — and
  // without this clause a real verified delivery reads as a failure.
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({
    provocation: p, eventId: "evt_1", pendingWebhooks: 0,
    before: { lastVerifiedAt: "2026-09-14T00:00:00.500Z", verifiedCount: 5 },
    after: { lastVerifiedAt: "2026-09-14T00:00:00.500Z", verifiedCount: 6 },
    walletOutcome: credited,
  });
  assert.equal(v.proven, true);
});

test("a receipt whose timestamp changed but whose count did not still counts as movement", () => {
  // Concurrency makes the count approximate — the receipt's own comment says so.
  // A run that insisted on the count alone would report a real delivery as a
  // failure on any deployment serving more than one instance.
  const p = chooseProvocation({ mode: "test", enabledEvents: ["*"] });
  const v = driveVerdict({
    provocation: p, eventId: "evt_1", pendingWebhooks: 0,
    before: { lastVerifiedAt: "2026-09-14T00:00:00Z", verifiedCount: 5 },
    after: { lastVerifiedAt: "2026-09-14T00:00:09Z", verifiedCount: 5 },
  });
  assert.equal(v.proven, true);
});
