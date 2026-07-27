// Real executable tests for the money-critical and honesty-critical logic.
// Run: npm test    (node --test, no framework, no network, no keys required)
//
// These EXECUTE the code and assert on real return values. They are not a
// compile check. Every assertion below would have caught a defect that shipped
// to production during this project.

import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Ad copy extraction — a colour spec was printed on a real ad's CTA button
// ("white on red"). These lock that shut.
// ---------------------------------------------------------------------------
const { extractAdCopy, looksLikeSpec, looksLikeBrief } = await import("../src/shared/ad-copy.ts");

const BRIEF = `Brand Theme
Primary \`#0B1F3A\` navy → background
Accent \`#14B8A6\` teal → CTA button
CTA text \`#FFFFFF\` white on red
Creative Direction
Logo: top-left, 120px safe zone, no overlap.
Headline: "One CDE. Zero Data Chaos."
Offer: "From $149/mo"
CTA: "Book a Demo"`;

test("extractAdCopy pulls the real quoted copy, not style specs", () => {
  const c = extractAdCopy(BRIEF);
  assert.equal(c.headline, "One CDE. Zero Data Chaos.");
  assert.equal(c.offerText, "From $149/mo");
  assert.equal(c.cta, "Book a Demo");
});

test("colour/layout specs are rejected as ad copy", () => {
  for (const spec of ["white on red", "navy → background", "#0B1F3A", "top-left, 120px", "1080×1350"]) {
    assert.equal(looksLikeSpec(spec), true, `should reject: ${spec}`);
  }
  for (const copy of ["Book a Demo", "One CDE. Zero Data Chaos.", "From $149/mo"]) {
    assert.equal(looksLikeSpec(copy), false, `should accept: ${copy}`);
  }
});

test("a design brief is detected so it is never posted as a caption", () => {
  assert.equal(looksLikeBrief(BRIEF), true);
  assert.equal(looksLikeBrief("Try our new service today. Book a demo."), false);
});

// ---------------------------------------------------------------------------
// Product label — 130 hooks rendered ungrammatically because the whole product
// description was interpolated where a NAME belongs.
// ---------------------------------------------------------------------------
const { productLabel } = await import("../src/backend/visualstrike.ts");

test("productLabel reduces a description to a nameable label", () => {
  assert.equal(productLabel("VERYX is a Work-Centric Common Data Environment"), "VERYX");
  assert.equal(productLabel("a premium leather wallet, handmade"), "premium leather wallet");
  assert.equal(productLabel("Brixton Grill House"), "Brixton Grill House"); // already short
  assert.equal(productLabel(""), "this product");
});

// ---------------------------------------------------------------------------
// ACU wallet — the money path. Credit on payment, debit on use, and a
// redelivered Stripe event must NEVER double-credit.
// ---------------------------------------------------------------------------
const wallet = await import("../src/backend/wallet.ts");

test("new wallet starts with the free allowance", async () => {
  const w = await wallet.getWallet("test-org-a");
  assert.equal(w.balanceAcu, wallet.FREE_SIGNUP_ACUS);
});

test("credit increases balance and lifetime credited", async () => {
  const before = await wallet.getWallet("test-org-b");
  const after = await wallet.creditAcus("test-org-b", 500);
  assert.equal(after.balanceAcu, before.balanceAcu + 500);
  assert.equal(after.lifetimeCreditedAcu, before.lifetimeCreditedAcu + 500);
});

test("debit succeeds within balance and REFUSES beyond it", async () => {
  await wallet.creditAcus("test-org-c", 100);
  const ok = await wallet.debitAcus("test-org-c", 50);
  assert.equal(ok.ok, true);
  assert.equal(ok.charged, 50);

  const tooMuch = await wallet.debitAcus("test-org-c", 10_000_000);
  assert.equal(tooMuch.ok, false, "must refuse to overdraw");
  assert.equal(tooMuch.charged, 0);
  assert.ok(tooMuch.shortfall > 0);

  const w = await wallet.getWallet("test-org-c");
  assert.ok(w.balanceAcu >= 0, "balance must never go negative");
});

test("a redelivered Stripe event never double-credits (idempotency)", async () => {
  const outcome = {
    eventId: "evt_test_duplicate_1",
    eventType: "checkout.session.completed",
    handled: true,
    action: "allocate_acus",
    planId: "growth",
    acusAllocated: 980,
    ledgerEntry: { type: "subscription_allocation", direction: "credit", amountAcu: 980, idempotencyKey: "evt_test_duplicate_1" },
    note: "test",
  };
  const first = await wallet.applyWebhookOutcome("test-org-d", outcome);
  assert.equal(first.applied, true, "first delivery must credit");
  const balAfterFirst = (await wallet.getWallet("test-org-d")).balanceAcu;

  const second = await wallet.applyWebhookOutcome("test-org-d", outcome); // SAME event id
  assert.equal(second.applied, false, "redelivery must be skipped");
  const balAfterSecond = (await wallet.getWallet("test-org-d")).balanceAcu;
  assert.equal(balAfterSecond, balAfterFirst, "balance must not change on redelivery");
});

test("an event with no org id credits nobody (cannot guess a wallet)", async () => {
  const res = await wallet.applyWebhookOutcome("", {
    eventId: "evt_test_no_org", eventType: "checkout.session.completed", handled: true,
    action: "allocate_acus", acusAllocated: 500,
    ledgerEntry: { type: "x", direction: "credit", amountAcu: 500, idempotencyKey: "evt_test_no_org" }, note: "",
  });
  assert.equal(res.applied, false);
});

// ---------------------------------------------------------------------------
// Stripe webhook signature — an unsigned/forged event must be rejected.
// ---------------------------------------------------------------------------
const { verifyStripeSignature, handleStripeEvent } = await import("../src/backend/stripe-billing.ts");
const crypto = await import("node:crypto");

test("a forged Stripe signature is rejected", () => {
  const v = verifyStripeSignature("{}", "t=1,v1=deadbeef", "whsec_testsecret");
  assert.equal(v.valid, false);
});

test("a correctly signed Stripe payload is accepted", () => {
  const secret = "whsec_testsecret";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  const v = verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, t);
  assert.equal(v.valid, true);
});

test("a replayed (stale-timestamp) event is rejected", () => {
  const secret = "whsec_testsecret";
  const payload = "{}";
  const t = Math.floor(Date.now() / 1000) - 10_000; // way outside tolerance
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  const v = verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, Math.floor(Date.now() / 1000));
  assert.equal(v.valid, false);
});

test("only allowlisted billing events are actioned", () => {
  const ignored = handleStripeEvent({ id: "e1", type: "charge.refunded" });
  assert.equal(ignored.handled, false);
  assert.equal(ignored.action, "ignored");
});

// ---------------------------------------------------------------------------
// ACU pricing floor — the owner's margin law: price is never below 2× cost.
// ---------------------------------------------------------------------------
const { requiredAcus, MARKUP_FLOOR } = await import("../src/backend/subscription.ts");

test("markup can never be set below the 2x floor", () => {
  const cheat = requiredAcus(1.0, 0.5); // try to charge under cost
  assert.ok(cheat.markup >= MARKUP_FLOOR, "markup floor must hold");
  assert.ok(cheat.customerChargeGbp >= 2.0, "charge must be >= 2x provider cost");
});
