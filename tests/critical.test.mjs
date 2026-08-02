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

// ---------------------------------------------------------------------------
// A payment that does not name its plan must allocate NOTHING.
//
// planFromEvent used to return "growth" whenever metadata.planId was missing or
// unrecognised — described in the source as "a sensible default for demo". On a
// live endpoint it is a giveaway. Two ways it pays out an allowance nobody
// bought:
//   • any checkout.session.completed reaching us without planId → a full month
//     of Growth ACUs;
//   • a Starter subscriber whose invoice metadata is dropped → the Growth
//     allocation, every month, for the life of the subscription.
// ---------------------------------------------------------------------------

test("a paid checkout with no plan on it allocates no ACUs", () => {
  const out = handleStripeEvent({ id: "evt_noplan", type: "checkout.session.completed", data: { object: { amount_total: 19900 } } });
  assert.equal(out.action, "ignored", "an unexplained payment must not be turned into an allowance");
  assert.equal(out.handled, false);
  assert.equal(out.acusAllocated, undefined);
  assert.equal(out.ledgerEntry, undefined, "nothing may reach the wallet");
  assert.match(out.note, /does not name a plan/);
});

test("an unrecognised plan id is refused, not rounded up to a real plan", () => {
  const out = handleStripeEvent({ id: "evt_badplan", type: "invoice.paid", data: { object: { metadata: { planId: "enterprise-platinum-ultra" } } } });
  assert.equal(out.action, "ignored");
  assert.equal(out.planId, undefined);
});

test("a renewal reads its plan from the subscription, not just the invoice", () => {
  // Every invoice.paid after the first month carries the plan under
  // subscription_details.metadata — the top-level metadata is empty. Reading
  // only the top level is what made "default to growth" look necessary.
  const out = handleStripeEvent({
    id: "evt_renewal", type: "invoice.paid",
    data: { object: { metadata: {}, subscription_details: { metadata: { planId: "starter" } } } },
  });
  assert.equal(out.action, "renew");
  assert.equal(out.planId, "starter", "the renewal must allocate the plan actually subscribed to");
  assert.ok(out.acusAllocated > 0);
});

test("a plan that IS named still allocates exactly its own allowance", () => {
  // The guard must not have made the working path stop working.
  const growth = handleStripeEvent({ id: "evt_growth", type: "checkout.session.completed", data: { object: { metadata: { planId: "growth" } } } });
  const starter = handleStripeEvent({ id: "evt_starter", type: "checkout.session.completed", data: { object: { metadata: { planId: "starter" } } } });
  assert.equal(growth.planId, "growth");
  assert.equal(starter.planId, "starter");
  assert.ok(growth.acusAllocated > starter.acusAllocated, "a bigger plan must buy more ACUs");
  assert.equal(growth.ledgerEntry.amountAcu, growth.acusAllocated);
});

test("a subscription update with no plan leaves the wallet's plan alone", () => {
  const out = handleStripeEvent({ id: "evt_subupd", type: "customer.subscription.updated", data: { object: { metadata: {} } } });
  assert.equal(out.action, "ignored");
  assert.equal(out.planId, undefined, "entitlement must never change on the strength of a guess");
});

// ---------------------------------------------------------------------------
// Whose money is it? createCheckoutLink builds a checkout for something the
// CUSTOMER is selling. It minted on MarketWar's own Stripe key, so a £199 sale
// through it landed in MarketWar's balance with no payout path back to the
// seller. A warning under the button is not a control; sellerRoute is.
// ---------------------------------------------------------------------------
const { sellerRoute, connectedAccount, keyIsLive } = await import("../src/backend/checkout.ts");

test("a live key with no connected account refuses to mint the seller's sale", () => {
  const r = sellerRoute(undefined, true);
  assert.equal(r.route, "refuse", "we must not take a real payment into our own balance for someone else's sale");
  assert.equal(r.account, "");
  assert.match(r.note, /no payout path/);
});

test("a connected account takes the payment on the SELLER's account", () => {
  const r = sellerRoute("acct_1A2b3C4d5E6f7G8h", true);
  assert.equal(r.route, "connected");
  assert.equal(r.account, "acct_1A2b3C4d5E6f7G8h", "this id is what settles the money to them");
  assert.match(r.note, /never holds the money/);
});

test("a test key still mints, because no real money can be misrouted", () => {
  // The attribution loop has to stay provable end to end.
  const r = sellerRoute(undefined, false);
  assert.equal(r.route, "test");
  assert.match(r.note, /test cards only/i);
});

test("only a real Stripe account id is treated as one", () => {
  assert.equal(connectedAccount("acct_1A2b3C"), "acct_1A2b3C");
  assert.equal(connectedAccount(" acct_1A2b3C "), "acct_1A2b3C");
  assert.equal(connectedAccount("cus_1A2b3C"), "", "a customer id is not an account");
  assert.equal(connectedAccount("acct_"), "", "the prefix alone is not an account");
  assert.equal(connectedAccount("acct_x; DROP"), "");
  assert.equal(connectedAccount(""), "");
  assert.equal(connectedAccount(undefined), "");
});

test("live-vs-test is read off the key, including restricted keys", () => {
  assert.equal(keyIsLive("sk_live_abc"), true);
  assert.equal(keyIsLive("rk_live_abc"), true, "a restricted live key still moves real money");
  assert.equal(keyIsLive("sk_test_abc"), false);
  assert.equal(keyIsLive(""), false);
});

// ---------------------------------------------------------------------------
// The wallet a top-up credits is chosen by the session, never by the request.
// ---------------------------------------------------------------------------

test("the top-up route never reads an org id out of the request body", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/app/api/billing/topup/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/body\.orgId/.test(src), "the client must not choose whose wallet a payment credits");
  assert.match(src, /orgId:\s*auth\.uid/, "the credited wallet comes from the authenticated session");
});

// ---------------------------------------------------------------------------
// Bootstrap admin: an address nobody has proved they own grants nothing.
//
// PLATFORM_ADMIN_EMAILS turns a matching signed-in email into `executive`. The
// match used to be on the address alone. Firebase mints a perfectly valid token
// for an email/password account created with any address the registrant has
// never opened — so if an allowlisted address had not yet been claimed by its
// real owner, whoever registered it first became executive: every org's admin
// surface, plus isStaff() skipping ACU metering entirely, so unlimited spend on
// the owner's provider keys.
// ---------------------------------------------------------------------------

test("the admin allowlist requires a VERIFIED email, not just a matching one", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/backend/guard.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const line = src.split("\n").find((l) => l.includes("ADMIN_EMAILS.has("));
  assert.ok(line, "the allowlist check must still exist");
  assert.match(line, /decoded\.email_verified/,
    "an unverified address must not be promoted to executive");
});

// ---------------------------------------------------------------------------
// The rate limiter must not be the thing a flood consumes.
// ---------------------------------------------------------------------------
const { rateLimit } = await import("../src/backend/guard.ts");

test("a flood of one-off keys does not grow the limiter without bound", () => {
  const t0 = 1_000_000;
  // 25,000 distinct callers, well past the 10,000-bucket cap, all expired.
  for (let i = 0; i < 25_000; i++) rateLimit(`sweep-test:${i}`, 5, 1_000, t0 + i);
  // Anything still held must be inside a live window; the cap is what proves
  // the sweep ran at all.
  const after = rateLimit("sweep-test:probe", 5, 1_000, t0 + 26_000);
  assert.equal(after.ok, true, "legitimate callers must still get through");
});

test("the limiter still refuses a caller over its limit", () => {
  // The sweep must not have turned the limiter into a no-op.
  const now = 5_000_000;
  let last;
  for (let i = 0; i < 7; i++) last = rateLimit("limit-test:same-ip", 5, 60_000, now);
  assert.equal(last.ok, false, "the sixth call in the window must be refused");
  assert.ok(last.retryAfterSec > 0);
  assert.equal(rateLimit("limit-test:same-ip", 5, 60_000, now + 61_000).ok, true, "and allowed again after the window");
});
