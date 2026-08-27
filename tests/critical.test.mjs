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

// ---------------------------------------------------------------------------
// The launch pre-flight reports CONSEQUENCES, not variables.
//
// Every dangerous state in this platform has two halves that each look fine on
// their own. A live Stripe key is good; a missing webhook secret is survivable;
// together they charge the card and credit nothing. Firebase Admin configured
// is good; no encryption key is fine in demo; together every PII write is
// refused in total silence. A per-variable checklist cannot see either.
// ---------------------------------------------------------------------------
const { launchReport, readLaunchEnv } = await import("../src/backend/launch-check.ts");

const baseEnv = {
  stripeSecretKey: "sk_live_x", stripeWebhookSecret: "whsec_x",
  firebaseAdminConfigured: true, fieldEncryptionKey: "x".repeat(32),
  platformAdminEmails: "owner@example.com",
  aiKeys: { anthropic: true, openai: true, gemini: false },
  cronSecret: "c", humanCheckSecret: "h", aiMonthlyCeilingUsd: "50",
  legalEntityName: "Example Ltd", legalEntityAddress: "1 Example Street, London",
  vercelEnv: "production",
};
const idsOf = (r) => r.findings.map((f) => f.id);

test("a fully configured production deployment is clear to launch", () => {
  const r = launchReport(baseEnv);
  assert.equal(r.goPublic, true, `expected no blockers, got: ${JSON.stringify(idsOf(r))}`);
  assert.equal(r.blockers, 0);
  assert.equal(r.warnings, 0, "a clean config must not invent warnings either");
});

test("a live Stripe key with no webhook secret is a blocker, not a note", () => {
  const r = launchReport({ ...baseEnv, stripeWebhookSecret: "" });
  const hit = r.findings.find((f) => f.id === "stripe-webhook-missing");
  assert.equal(hit.severity, "blocker");
  assert.equal(r.goPublic, false);
  assert.match(hit.consequence, /charged and served nothing/);
});

test("a TEST Stripe key on a production deployment is a blocker", () => {
  const r = launchReport({ ...baseEnv, stripeSecretKey: "sk_test_x" });
  assert.ok(idsOf(r).includes("stripe-test-in-production"));
  assert.equal(r.goPublic, false);
});

test("a TEST Stripe key on a preview deployment is not a blocker", () => {
  // A rehearsal is supposed to use test keys. Crying wolf there teaches the
  // owner to ignore the panel that matters on launch morning.
  const r = launchReport({ ...baseEnv, stripeSecretKey: "sk_test_x", vercelEnv: "preview" });
  assert.ok(!idsOf(r).includes("stripe-test-in-production"));
});

test("real persistence with no encryption key is a blocker", () => {
  const r = launchReport({ ...baseEnv, fieldEncryptionKey: "" });
  const hit = r.findings.find((f) => f.id === "encryption-key-missing");
  assert.equal(hit.severity, "blocker");
  assert.match(hit.consequence, /silent/i, "the danger is that it fails invisibly");
});

test("a short encryption key is treated as no key at all", () => {
  // encryptionConfigured requires 32+ chars, so a 10-character value configures
  // nothing while looking set in a presence check.
  const r = launchReport({ ...baseEnv, fieldEncryptionKey: "tooshort" });
  assert.ok(idsOf(r).includes("encryption-key-missing"));
});

test("demo mode is never told to set an encryption key it does not need", () => {
  const r = launchReport({ ...baseEnv, firebaseAdminConfigured: false, fieldEncryptionKey: "" });
  assert.ok(!idsOf(r).includes("encryption-key-missing"), "nothing is persisted, so nothing is at risk");
});

test("one AI provider is a warning about failover, not silence", () => {
  const solo = launchReport({ ...baseEnv, aiKeys: { anthropic: true, openai: false, gemini: false } });
  assert.ok(idsOf(solo).includes("single-ai-provider"));
  assert.equal(solo.goPublic, true, "one provider still works — it is not a blocker");

  const none = launchReport({ ...baseEnv, aiKeys: { anthropic: false, openai: false, gemini: false } });
  assert.ok(idsOf(none).includes("no-ai"));
  assert.equal(none.goPublic, false);
  assert.ok(!idsOf(none).includes("single-ai-provider"), "no providers is not 'one provider'");
});

test("an unnamed trader blocks a public launch but not a preview", () => {
  const prod = launchReport({ ...baseEnv, legalEntityName: "", legalEntityAddress: "" });
  assert.ok(idsOf(prod).includes("no-legal-entity"));
  assert.equal(prod.goPublic, false);
  const prev = launchReport({ ...baseEnv, legalEntityName: "", legalEntityAddress: "", vercelEnv: "preview" });
  assert.ok(!idsOf(prev).includes("no-legal-entity"));
});

test("a half-named trader is still an unnamed trader", () => {
  const r = launchReport({ ...baseEnv, legalEntityAddress: "" });
  assert.ok(idsOf(r).includes("no-legal-entity"), "a name with no address does not identify a trader");
});

test("the spend ceiling and scheduled work are warnings, never blockers", () => {
  const r = launchReport({ ...baseEnv, aiMonthlyCeilingUsd: "", cronSecret: "", humanCheckSecret: "" });
  for (const id of ["no-spend-ceiling", "no-cron-secret", "no-human-check-secret"]) {
    assert.equal(r.findings.find((f) => f.id === id).severity, "warning", id);
  }
  assert.equal(r.goPublic, true, "these cost the owner or annoy a user — they do not take money for nothing");
});

test("a zero ceiling counts as no ceiling", () => {
  assert.ok(idsOf(launchReport({ ...baseEnv, aiMonthlyCeilingUsd: "0" })).includes("no-spend-ceiling"));
});

test("the pre-flight reads only booleans out of the environment, never a value", () => {
  const e = readLaunchEnv({
    STRIPE_SECRET_KEY: "sk_live_SUPERSECRET", FIELD_ENCRYPTION_MASTER_KEY: "k".repeat(40),
    FIREBASE_CLIENT_EMAIL: "a@b.c", FIREBASE_PRIVATE_KEY: "PRIVATE", VERCEL_ENV: "production",
    ANTHROPIC_API_KEY: "sk-ant-SECRET", OPENAI_API_KEY: "sk-SECRET",
  });
  const r = launchReport(e);
  const serialised = JSON.stringify(r);
  for (const secret of ["SUPERSECRET", "sk-ant-SECRET", "PRIVATE", "kkkkkkkk"]) {
    assert.ok(!serialised.includes(secret), `the report leaked ${secret}`);
  }
  // And it still did its job on that input.
  assert.ok(idsOf(r).includes("stripe-webhook-missing"));
});

test("firebase admin needs BOTH halves of its credential to count as configured", () => {
  const half = readLaunchEnv({ FIREBASE_CLIENT_EMAIL: "a@b.c" });
  assert.equal(half.firebaseAdminConfigured, false, "a lone client email sends the owner looking in the wrong place");
  const whole = readLaunchEnv({ FIREBASE_CLIENT_EMAIL: "a@b.c", FIREBASE_PRIVATE_KEY: "x" });
  assert.equal(whole.firebaseAdminConfigured, true);
});

test("every finding says what breaks AND how to fix it", () => {
  // A pre-flight that names a problem without a fix is a source of panic on
  // launch morning, not a tool.
  const r = launchReport({
    stripeSecretKey: "", stripeWebhookSecret: "", firebaseAdminConfigured: true,
    fieldEncryptionKey: "", platformAdminEmails: "",
    aiKeys: { anthropic: false, openai: false, gemini: false },
    cronSecret: "", humanCheckSecret: "", aiMonthlyCeilingUsd: "",
    legalEntityName: "", legalEntityAddress: "", vercelEnv: "production",
  });
  assert.ok(r.findings.length >= 7, "the worst possible config must surface most rules");
  for (const x of r.findings) {
    assert.ok(x.consequence.length > 60, `${x.id}: consequence must describe real harm`);
    assert.ok(x.fix.length > 20, `${x.id}: every finding needs an actionable fix`);
    assert.ok(["blocker", "warning", "ok"].includes(x.severity));
  }
  assert.equal(r.goPublic, false);
});

// ---------------------------------------------------------------------------
// A hosted production build never serves the canned narrative.
//
// The demo fallbacks are not neutral placeholders. growth-strategist returns
// "AxionOS has a proven winner (7.3x ROAS), £1,240 of dormant revenue in the
// vault... confirm the £190 catering booking in WhatsApp" — invented financials
// about a REAL business, with the only warning a small "Demo intelligence" pill
// beside a page of confident prose. A customer who believes one of those
// numbers is worse off than one who sees an error.
//
// The guard for this was REQUIRE_LIVE, set in apphosting.yaml — a Firebase App
// Hosting file, on a platform this project has since left. On Vercel it applies
// only if someone remembered to add it, and a safety net that depends on being
// remembered is not one.
// ---------------------------------------------------------------------------
const { demoFallbackAllowed, LIVE_AI_UNAVAILABLE } = await import("../src/backend/gateway.ts");

test("a hosted production build refuses the canned fallback with no env var set", () => {
  assert.equal(demoFallbackAllowed({ NODE_ENV: "production" }), false);
});

test("local, dev and CI keep working with no keys at all", () => {
  // The zero-config promise is to developers, and it is untouched.
  assert.equal(demoFallbackAllowed({ NODE_ENV: "development" }), true);
  assert.equal(demoFallbackAllowed({}), true, "an unset NODE_ENV is a local run");
  assert.equal(demoFallbackAllowed({ NODE_ENV: "test" }), true);
});

test("REQUIRE_LIVE still forces live-only anywhere", () => {
  assert.equal(demoFallbackAllowed({ NODE_ENV: "development", REQUIRE_LIVE: "1" }), false);
});

test("the refusal message says nothing was charged", () => {
  // The route refunds on failure. A customer reading an error mid-run needs to
  // know that before they decide whether to retry.
  assert.match(LIVE_AI_UNAVAILABLE, /Nothing was charged/);
  assert.match(LIVE_AI_UNAVAILABLE, /retry/i);
});

test("every AI surface that has a canned fallback goes through the one predicate", async () => {
  // Four modules invent prose a customer could act on or publish. A fifth added
  // later must not quietly reintroduce the hole.
  const fs = await import("node:fs");
  for (const mod of ["provider", "strategy-run", "growth-plan", "blog-generator"]) {
    const src = fs.readFileSync(`src/backend/${mod}.ts`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // The PREDICATE is the invariant. Which honest sentence gets thrown is not:
    // `provider.ts` throws `aiUnavailableMessage()`, which names what still
    // works on a deployment with no key instead of telling somebody to retry
    // something that cannot succeed. Pinning the constant here made the stricter
    // message look like a regression, so the two halves are asserted separately.
    assert.match(src, /if \(!demoFallbackAllowed\(\)\) throw new Error\(/,
      `${mod} can still serve invented content to a paying customer`);
    assert.match(src, /if \(!demoFallbackAllowed\(\)\) throw new Error\((LIVE_AI_UNAVAILABLE|aiUnavailableMessage\(\))\)/,
      `${mod} refuses, but not with one of the two honest messages`);
    assert.ok(!/process\.env\.REQUIRE_LIVE/.test(src),
      `${mod} still decides for itself instead of asking the one predicate`);
  }
});

// ---------------------------------------------------------------------------
// The Instant Marketing Audit measured nothing.
//
//   dims.map((name) => ({ name, score: sscore(x.business + area + name) }))
//
// sscore is a hash. "Message clarity: 72/100" was a stable pseudo-random number
// derived from the letters of the customer's own business name — as were all
// thirty-six sub-scores, the six area scores, the overall, and the sentence
// naming their weakest area. Type a different name and the diagnosis changes;
// change the site and it does not move at all.
//
// Same defect as the "Rated 4.7 by 213 reviewers" that came out of useState,
// and worse in one respect: a customer can check a review count, and cannot
// check a marketing-health index.
// ---------------------------------------------------------------------------
const sr = await import("../src/backend/siteraid.ts");

const SITE = { business: "AxionOS", category: "construction intelligence", offers: ["CDE platform"] };

const emptyExtraction = () => ({
  url: "https://evandeli.com/", brand: { name: "AxionOS", tagline: "", lang: "en", siteName: "AxionOS" },
  products: { values: [], source: "markup" }, services: { values: [], source: "markup" },
  pricing: [], images: [], videos: [], logos: [], colours: [], fonts: [], ctas: [],
  trustSignals: [], reviews: [], faqs: [], hierarchy: [], navigation: [], offers: [],
  blogLinks: [], contact: { emails: [], phones: [], address: "" }, socialLinks: [],
  audience: null, notExtracted: [], found: 0,
});

test("with nothing crawled, the audit refuses to produce a score", () => {
  const a = sr.instantAudit(SITE);
  assert.equal(a.overall, null, "a number here would be a number about the business NAME");
  assert.equal(a.coverage.measured, 0);
  for (const s of a.sections) {
    assert.equal(s.overall, null);
    assert.equal(s.verdict, "not measured");
    for (const d of s.dimensions) assert.equal(d.score, null, `${s.area}/${d.name} invented a score`);
  }
  assert.match(a.headline, /No marketing health score/);
  assert.match(a.headline, /derived from the business name/);
});

test("the business name no longer moves a single score", () => {
  // The exact defect: two businesses with identical sites must audit identically.
  const evidence = {
    audit: { ok: true, url: "https://a.com", https: true, score: 0, grade: "C", title: "A", metaDescription: "d", h1Count: 1, wordCount: 900, imagesNoAlt: 0, robotsTxt: true, sitemapXml: true, structuredDataTypes: ["Organization"], loadMs: 700, findings: [] },
    extraction: { ...emptyExtraction(), ctas: ["Book a demo", "Start free trial"], faqs: [{ q: "Q", a: "A" }] },
  };
  const one = sr.instantAudit({ ...SITE, business: "AxionOS" }, evidence);
  const two = sr.instantAudit({ ...SITE, business: "Completely Different Ltd" }, evidence);
  assert.deepEqual(
    one.sections.map((s) => [s.area, s.overall, s.dimensions.map((d) => d.score)]),
    two.sections.map((s) => [s.area, s.overall, s.dimensions.map((d) => d.score)]),
    "the same site must audit the same however the business is named",
  );
});

test("the same business audits differently when the site changes", () => {
  // The other half: a real measurement has to MOVE when the thing it measures does.
  const base = { audit: { ok: true, url: "https://a.com", https: true, score: 0, grade: "C", findings: [] }, extraction: emptyExtraction() };
  const rich = {
    audit: { ...base.audit, title: "A", metaDescription: "d", h1Count: 1, wordCount: 1400, imagesNoAlt: 0, robotsTxt: true, sitemapXml: true, structuredDataTypes: ["Organization", "FAQPage", "Product", "LocalBusiness"], loadMs: 600 },
    extraction: {
      ...emptyExtraction(),
      ctas: ["Book a demo", "Get a quote", "Start free trial", "Contact us"],
      faqs: [1, 2, 3, 4, 5, 6].map((i) => ({ q: `Q${i}`, a: `A${i}` })),
      trustSignals: ["ISO 27001", "Money-back guarantee", "Trusted by 400 firms", "GDPR", "10 years"],
      contact: { emails: ["a@b.c"], phones: ["+44"], address: "1 Street, London" },
    },
  };
  const poor = sr.instantAudit(SITE, base);
  const good = sr.instantAudit(SITE, rich);
  assert.ok(good.overall > poor.overall, `a better site must score better (${good.overall} vs ${poor.overall})`);
  assert.ok(good.coverage.measured >= poor.coverage.measured);
});

test("a dimension the crawl cannot read stays null and says what it would need", () => {
  const a = sr.instantAudit(SITE, { audit: { ok: true, url: "u", https: true, score: 0, grade: "C", findings: [] }, extraction: emptyExtraction() });
  const all = a.sections.flatMap((s) => s.dimensions);
  const unreadable = ["Visual quality", "Differentiation", "Mobile experience", "Abandonment risk", "Posting consistency", "Upsells/cross-sells"];
  for (const name of unreadable) {
    const d = all.find((x) => x.name === name);
    assert.ok(d, `${name} missing`);
    assert.equal(d.score, null, `${name} cannot be read from HTML and must not carry a number`);
    assert.match(d.basis, /^Not scored — /);
  }
});

test("every dimension shows the count its score came from", () => {
  const a = sr.instantAudit(SITE, {
    audit: { ok: true, url: "u", https: true, score: 0, grade: "C", title: "T", h1Count: 1, wordCount: 500, loadMs: 900, findings: [] },
    extraction: { ...emptyExtraction(), ctas: ["Buy now", "Book"], trustSignals: ["Guarantee"] },
  });
  for (const s of a.sections) for (const d of s.dimensions) {
    assert.ok(d.basis && d.basis.length > 20, `${s.area}/${d.name} has no basis — a score nobody can check`);
  }
  const cta = a.sections.find((s) => s.area === "conversion").dimensions.find((d) => d.name === "CTA clarity");
  assert.match(cta.basis, /2 call\(s\) to action/, "the basis must name the actual count");
  assert.match(cta.basis, /Buy now/, "and show what was found, so it can be checked");
});

test("an area score averages only what was measured", () => {
  const a = sr.instantAudit(SITE, {
    audit: { ok: true, url: "u", https: true, score: 0, grade: "C", findings: [] },
    extraction: emptyExtraction(),
  });
  for (const s of a.sections) {
    const scored = s.dimensions.filter((d) => d.score !== null);
    assert.equal(s.measured, scored.length);
    assert.equal(s.total, s.dimensions.length);
    if (scored.length) {
      const expected = Math.round(scored.reduce((n, d) => n + d.score, 0) / scored.length);
      assert.equal(s.overall, expected, `${s.area} averaged unmeasured dimensions into its score`);
    }
  }
  assert.ok(a.coverage.measured < a.coverage.total, "some dimensions are genuinely unreadable and must stay so");
});

test("SiteRaid has no score generator left in it at all", async () => {
  // The strongest form of this guarantee: seed/sscore have no callers, so they
  // are gone. A convincing-looking score generator sitting unused in the file
  // is an invitation for the next person in a hurry.
  const fs = await import("node:fs");
  const code = fs.readFileSync("src/backend/siteraid.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\bsscore\b/.test(code), "sscore must not exist in SiteRaid");
  assert.ok(!/Math\.imul\(/.test(code), "nor the hash it was built on");
});

test("images and videos are counted, not measured by a function's arity", () => {
  // SiteExtraction.images is a plain array. `images.values` is
  // Array.prototype.values, and `.length` on a FUNCTION is its arity — zero.
  // TypeScript accepts it happily and every count silently reads nothing.
  const a = sr.instantAudit(SITE, {
    audit: { ok: true, url: "u", https: true, score: 0, grade: "C", findings: [] },
    extraction: {
      ...emptyExtraction(),
      images: [1, 2, 3, 4].map((i) => ({ url: `i${i}.jpg`, label: "" })),
      videos: [{ url: "https://youtube.com/x", label: "" }],
    },
  });
  const demo = a.sections.find((s) => s.area === "content").dimensions.find((d) => d.name === "Demonstrations");
  assert.match(demo.basis, /1 video\(s\) and 4 real image\(s\)/, "the counts must be the array lengths");
  assert.ok(demo.score > 15, "and must move the score");
});

// ---------------------------------------------------------------------------
// The Attack Map's ranking was the same hash.
//
//   const opportunity = sscore(x.business + gap, 30, 95);
//
// It decided which of sixteen moves a customer should do FIRST. "Your biggest
// opportunity is trust gaps" was a sentence about the spelling of their company
// name. The plays are real advice and are untouched; the ORDER was a checksum.
// ---------------------------------------------------------------------------

test("with no crawl, no move is ranked", () => {
  const m = sr.attackMap(SITE);
  assert.equal(m.ranked, 0);
  for (const move of m.moves) {
    assert.equal(move.opportunity, null);
    assert.ok(move.play.length > 10, "the advice must survive losing the number");
    assert.match(move.evidence, /Not ranked/);
  }
  assert.match(m.note, /an order derived from the business name would be an order derived from nothing/);
});

test("the business name no longer decides what to do first", () => {
  const ev = { extraction: { ...emptyExtraction(), trustSignals: ["ISO 9001"], faqs: [{ q: "a", a: "b" }] } };
  const a = sr.attackMap({ ...SITE, business: "AxionOS" }, ev);
  const b = sr.attackMap({ ...SITE, business: "Zzz Holdings Incorporated" }, ev);
  assert.deepEqual(a.moves.map((m) => [m.gap, m.opportunity]), b.moves.map((m) => [m.gap, m.opportunity]));
});

test("a measured gap ranks higher when it is actually more open", () => {
  const bare = sr.attackMap(SITE, { extraction: emptyExtraction() });
  const covered = sr.attackMap(SITE, {
    extraction: { ...emptyExtraction(), trustSignals: ["ISO", "Guarantee", "Insured", "GDPR", "10 years"] },
  });
  const gapOf = (m) => m.moves.find((x) => x.gap === "trust_gaps").opportunity;
  assert.ok(gapOf(bare) > gapOf(covered), `a site with no trust signals has the bigger trust gap (${gapOf(bare)} vs ${gapOf(covered)})`);
  assert.ok(gapOf(covered) >= 0);
});

test("a gap a crawl cannot see keeps its play and loses its number", () => {
  const m = sr.attackMap(SITE, { extraction: emptyExtraction() });
  const rival = m.moves.find((x) => x.gap === "competitor_strengths");
  assert.equal(rival.opportunity, null, "one site is not a market");
  assert.ok(rival.play.length > 10);
  assert.match(rival.evidence, /competitor data|review corpora|ad-platform/);
  assert.ok(m.ranked > 0 && m.ranked < m.moves.length, "some ranked, some honestly not");
});

test("every ranked move shows the count it was ranked on", () => {
  const m = sr.attackMap(SITE, { extraction: { ...emptyExtraction(), faqs: [{ q: "a", a: "b" }, { q: "c", a: "d" }] } });
  const objections = m.moves.find((x) => x.gap === "unaddressed_objections");
  assert.ok(objections.opportunity > 0);
  assert.match(objections.evidence, /2 question\(s\) answered/);
});

// ---------------------------------------------------------------------------
// "We could not see it" is not "it is not there".
//
// The first live run of the MEASURED audit was against evandeli.com, one of the
// two brands this platform is being tested with. The host answered 403 — a bot
// rule in front of the site refused us — and the audit scored it anyway:
// 16/100, "urgent" in all six areas, "0 words on the entry page", "title tag
// missing", "0 product(s) named", "no way to make contact published".
//
// Every one of those sentences was false about a real customer's real website,
// and they read as measurements because that is exactly what they were shaped
// like. The old hash was obviously arbitrary once you knew. This was
// confidently, specifically wrong, which is worse.
//
// crawler.ts had already classified the refusal correctly. The audit was not
// asking.
// ---------------------------------------------------------------------------

const blockedCrawl = {
  ok: false, url: "https://evandeli.com", https: true, score: 0, grade: "F", httpStatus: 403, loadMs: 226, findings: [],
  block: { blocked: true, kind: "forbidden", vendor: "", status: 403,
    message: "The host refused the request (HTTP 403). Something in front of your site is turning away automated requests.",
    action: 'If this is your site, allowlist the user agent "MarketWarBot/1.0" in whatever sits in front of it — a WAF, a bot-protection rule, or a rate limit.' },
};

test("a site that refused the crawl is not scored as a bad site", () => {
  const a = sr.instantAudit(SITE, { audit: blockedCrawl, extraction: emptyExtraction() });
  assert.equal(a.overall, null, "a 403 must never become a marketing-health score");
  assert.equal(a.coverage.measured, 0);
  for (const s of a.sections) {
    assert.equal(s.overall, null, `${s.area} scored a site it never read`);
    for (const d of s.dimensions) assert.equal(d.score, null, `${s.area}/${d.name} scored a page we were refused`);
  }
});

test("the blocked headline says we were refused, and how to let us in", () => {
  const a = sr.instantAudit(SITE, { audit: blockedCrawl, extraction: emptyExtraction() });
  assert.match(a.headline, /could not read the site/);
  assert.match(a.headline, /HTTP 403/);
  assert.match(a.headline, /MarketWarBot/, "the customer needs the fix, not just the diagnosis");
  assert.ok(!/\d+\/100/.test(a.headline), "no score may appear in a headline about an unread site");
  assert.match(a.coverage.note, /fact about the crawl, not a finding about the website/);
});

test("a blocked crawl leaves no gap ranked either", () => {
  // An empty extraction from a 403 would otherwise rank EVERY gap wide open and
  // tell the customer their site is missing everything.
  const m = sr.attackMap(SITE, { audit: blockedCrawl, extraction: emptyExtraction() });
  assert.equal(m.ranked, 0);
  for (const move of m.moves) assert.equal(move.opportunity, null);
  assert.match(m.moves[0].evidence, /could not read the site/);
  assert.match(m.note, /could not be read/);
});

test("a JavaScript shell is a reading problem, not a content problem", () => {
  // The other half of the same mistake: a React app serves an empty <div> and a
  // bundle. Scoring that describes our crawler, not their website.
  const shell = {
    ok: true, url: "https://x.com", https: true, score: 0, grade: "C", httpStatus: 200, loadMs: 300, wordCount: 12, findings: [],
    renderGap: { jsShell: true, framework: "Next.js", markers: ["__NEXT_DATA__"], words: 12, scriptBytes: 90000, htmlBytes: 100000, scriptShare: 0.9,
      note: "The HTML holds 12 visible words and is 90% script — this is a JavaScript shell, so the page's real content is not in what we can read." },
  };
  const a = sr.instantAudit(SITE, { audit: shell, extraction: emptyExtraction() });
  assert.equal(a.overall, null);
  assert.match(a.headline, /JavaScript shell/);
  assert.match(a.headline, /almost certainly fine/, "the customer must not read this as a fault");
});

test("a page that WAS readable is still scored — the gate is not a blanket refusal", () => {
  const fine = {
    ok: true, url: "https://x.com", https: true, score: 0, grade: "B", httpStatus: 200, loadMs: 500,
    title: "T", metaDescription: "d", h1Count: 1, wordCount: 900, imagesNoAlt: 0, findings: [],
  };
  const a = sr.instantAudit(SITE, { audit: fine, extraction: { ...emptyExtraction(), ctas: ["Buy now"] } });
  assert.ok(a.overall !== null, "a readable page must still produce a score");
  assert.ok(a.coverage.measured > 0);
});

// ---------------------------------------------------------------------------
// A hash decided whether a real domain had a mail server.
//
//   const mx       = domainOk && (s % 100) > 8;   // "~8% no-MX (deterministic)"
//   const catchAll = domainOk && (s % 100) > 82;  // "~18% catch-all"
//
// s is seed(email). "MX present" was therefore a statement about the SPELLING
// of the address. Roughly one address in twelve was declared undeliverable and
// hard-failed to "reject" for no reason at all, and the other eleven were
// declared deliverable on the same non-evidence. That verdict is what a
// customer reads before emailing a stranger who never asked to hear from them,
// and it is what protects the owner's own sending reputation.
// ---------------------------------------------------------------------------
const lh = await import("../src/backend/lead-harvest.ts");

test("an unchecked mail server is reported as unchecked, not as present", () => {
  const r = lh.verifyEmail("hello@example.com");
  const mx = r.checks.find((c) => c.name === "mx_record");
  assert.equal(mx.pass, null, "nothing looked this up, so it cannot pass");
  assert.match(mx.detail, /Not run/);
  assert.match(mx.detail, /DNS lookup/);
  assert.ok(r.notRun.includes("mx_record"));
});

test("an address is never called safe on checks that never ran", () => {
  const r = lh.verifyEmail("hello@example.com");
  assert.equal(r.verdict, "risky", "'safe' is a claim and needs the deliverability checks to have happened");
  assert.match(r.note, /not because anything failed, but because nothing confirmed it/);
});

test("a real DNS answer is used when the caller has one", () => {
  const good = lh.verifyEmail("hello@example.com", {
    mxByDomain: new Map([["example.com", true]]),
    catchAllByDomain: new Map([["example.com", false]]),
  });
  assert.equal(good.checks.find((c) => c.name === "mx_record").pass, true);
  assert.equal(good.notRun.length, 0);
  assert.equal(good.verdict, "safe", "everything measured and clean must be able to reach safe");

  const bad = lh.verifyEmail("hello@example.com", { mxByDomain: new Map([["example.com", false]]) });
  assert.equal(bad.verdict, "reject", "a MEASURED missing MX still hard-fails");
});

test("a spelling no longer decides deliverability", () => {
  // Under the hash, these two addresses at the same domain could disagree about
  // whether that domain had a mail server.
  const a = lh.verifyEmail("aaaaaaaa@same-domain.com");
  const b = lh.verifyEmail("zz@same-domain.com");
  assert.equal(
    a.checks.find((c) => c.name === "mx_record").pass,
    b.checks.find((c) => c.name === "mx_record").pass,
    "MX is a property of the domain, not of the mailbox name",
  );
  assert.equal(a.verdict, b.verdict);
});

test("a harvested contact carries no confidence nobody measured", () => {
  // It was clamp(60 + seed(email) % 35) — a 60–95 figure from the letters of
  // the address, which reads as "probably fine" for every address ever
  // harvested, including the ones that are not.
  const rec = lh.buildContactRecord({ email: "hello@example.com", sourceUrl: "https://example.com/contact" });
  assert.equal(rec.confidence, null);
  const measured = lh.buildContactRecord({ email: "hello@example.com", sourceUrl: "https://x", confidence: 82 });
  assert.equal(measured.confidence, 82, "a caller that DID measure can still supply one");
});

test("passedCount counts passes, not not-runs", () => {
  const r = lh.verifyEmail("hello@example.com");
  assert.equal(r.passedCount, r.checks.filter((c) => c.pass === true).length);
  assert.ok(r.passedCount < r.checks.length, "an unrun check must not inflate the score");
});

// ---------------------------------------------------------------------------
// The step that was missing: a long video in, clips out.
//
// video-intelligence.ts calls itself "the clip-intelligence brain (OpusClip
// class)" and it does rank moments and score them across eight commercial
// dimensions — but rankMoments() takes moments SOMEBODY ELSE produced. Grep the
// repo: the only callers pass straight through from the request body. So the
// Clip Lab was a scoring form. A customer had to watch their own two-hour
// recording, write down the timestamps of the good bits and type them in, which
// is the job they came here to have done.
// ---------------------------------------------------------------------------
const cf = await import("../src/backend/clip-finder.ts");

// A transcript shaped like Whisper's real output: fragments that break wherever
// the model felt like breaking, several sentences to a segment, mid-sentence
// splits. This is the input that makes naive clipping cut through words.
const SEGMENTS = [
  { start: 0, end: 6, text: "Hello and welcome back to the show." },
  { start: 6, end: 12, text: "So then he told me the same thing again." },
  { start: 12, end: 20, text: "Here's the mistake most people make with pricing." },
  { start: 20, end: 27, text: "They set a number and never test it." },
  { start: 27, end: 35, text: "We raised ours by 40% and lost two customers out of ninety." },
  { start: 35, end: 44, text: "So that's the lesson: your price is a hypothesis, not a fact." },
  { start: 44, end: 52, text: "Subscribe if you want the rest of the pricing series." },
  { start: 52, end: 61, text: "Anyway, that reminds me of something else entirely." },
];

test("sentences are rebuilt so a clip never starts mid-word", () => {
  // Whisper segments are 5-15s fragments, not sentences. Cutting on one starts
  // the clip halfway through a word — the single clearest tell of automated
  // clipping.
  const merged = cf.sentencesFrom([
    { start: 0, end: 5, text: "Here is the first half of a" },
    { start: 5, end: 9, text: "sentence that spans two segments." },
  ]);
  assert.equal(merged.length, 1, "one sentence, not two fragments");
  assert.equal(merged[0].text, "Here is the first half of a sentence that spans two segments.");
  assert.equal(merged[0].startSec, 0, "it starts when the first fragment started");
  assert.equal(merged[0].endSec, 9, "and ends when the last one ended");
});

test("several sentences inside one segment are split with interpolated times", () => {
  const out = cf.sentencesFrom([{ start: 10, end: 20, text: "First one. Second one here." }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].startSec, 10);
  assert.equal(out[1].endSec, 20);
  assert.ok(out[0].endSec > 10 && out[0].endSec < 20, "the internal boundary falls inside the segment");
  assert.ok(out[1].startSec >= out[0].endSec - 0.01, "and the second starts where the first ended");
});

test("every clip begins and ends on a sentence boundary", () => {
  const r = cf.findClips(SEGMENTS, { minSec: 15, maxSec: 60, limit: 5 });
  assert.ok(r.clips.length > 0, r.note);
  const sentences = cf.sentencesFrom(SEGMENTS);
  const starts = new Set(sentences.map((s) => Math.round(s.startSec * 100)));
  const ends = new Set(sentences.map((s) => Math.round(s.endSec * 100)));
  for (const c of r.clips) {
    assert.ok(starts.has(Math.round(c.startSec * 100)), `clip starts at ${c.startSec}, not on a sentence boundary`);
    assert.ok(ends.has(Math.round(c.endSec * 100)), `clip ends at ${c.endSec}, not on a sentence boundary`);
  }
});

test("a clip that opens mid-thought is marked down for it", () => {
  // "So then he told me the same thing" is a fine sentence and a terrible
  // opening line: "he" and "the same thing" are in the ninety minutes the
  // viewer did not watch.
  const dangling = cf.hookSignals("So then he told me the same thing again.");
  const standalone = cf.hookSignals("Here's the mistake most people make with pricing.");
  const alone = (sig) => sig.find((s) => s.name === "Stands alone").score;
  assert.ok(alone(dangling) < alone(standalone), `${alone(dangling)} should be below ${alone(standalone)}`);
  assert.match(dangling.find((s) => s.name === "Stands alone").evidence, /points at something the viewer has not seen/);
});

test("the hook score counts what is in the opening line and names it", () => {
  const strong = cf.hookSignals("Here's the mistake most people make with your pricing.");
  const flat = cf.hookSignals("The weather was quite mild that afternoon.");
  const hookOf = (sig) => sig.find((s) => s.name === "Hook");
  assert.ok(hookOf(strong).score > hookOf(flat).score);
  assert.match(hookOf(strong).evidence, /curiosity phrase/);
  assert.match(hookOf(flat).evidence, /nothing in the opening line asks the viewer to stay/);
});

test("pace is measured off the real timestamps, not guessed", () => {
  const brisk = cf.bodySignals("word ".repeat(60).trim(), 20, 60);   // 3.0 w/s
  const deadAir = cf.bodySignals("word ".repeat(10).trim(), 20, 10); // 0.5 w/s
  const paceOf = (sig) => sig.find((s) => s.name === "Pace");
  assert.ok(paceOf(brisk).score > paceOf(deadAir).score);
  assert.match(paceOf(brisk).evidence, /60 words in 20s — 3\.0 words\/second/);
});

test("every signal on every clip carries the count it came from", () => {
  const r = cf.findClips(SEGMENTS, { minSec: 15, maxSec: 60, limit: 5 });
  for (const c of r.clips) {
    assert.equal(c.signals.length, 7, "seven signals: hook, stands-alone, payoff, pace, length, buying, ask");
    for (const s of c.signals) {
      assert.ok(s.evidence && s.evidence.length > 10, `${c.id}/${s.name} has no evidence — a score nobody can check`);
      assert.ok(s.score >= 0 && s.score <= 100);
    }
    // The headline score is the plain average of the six, so anyone can redo it.
    const expected = Math.round(c.signals.reduce((n, s) => n + s.score, 0) / c.signals.length);
    assert.equal(c.score, expected, "the score must be reproducible from the signals shown");
  }
});

test("clips are not ten variations of the same forty seconds", () => {
  const r = cf.findClips(SEGMENTS, { minSec: 15, maxSec: 60, limit: 10 });
  for (let i = 0; i < r.clips.length; i++) {
    for (let j = i + 1; j < r.clips.length; j++) {
      const share = cf.overlapShare(r.clips[i], r.clips[j]);
      assert.ok(share <= 0.5, `clips ${i} and ${j} share ${Math.round(share * 100)}% of the same footage`);
    }
  }
});

test("no transcript means no clips, and it says why", () => {
  const r = cf.findClips([]);
  assert.deepEqual(r.clips, []);
  assert.match(r.note, /no transcript to cut/);
  assert.match(r.note, /nothing here guesses where the good bits are/);
});

test("a source shorter than a clip returns nothing rather than something", () => {
  const r = cf.findClips([{ start: 0, end: 4, text: "Very short." }], { minSec: 15, maxSec: 60 });
  assert.equal(r.clips.length, 0);
  assert.match(r.note, /No clip fits between 15s and 60s/);
});

test("the clip's own subtitles start at zero, not at 42 minutes", () => {
  // An .srt whose first cue is at 00:42:17 is useless against a clip that is
  // forty seconds long. This is what makes the output usable with no renderer.
  const srt = cf.srtForClip(SEGMENTS, 12, 44);
  assert.match(srt, /^1\n00:00:00,000 --> /, "the first cue must start at zero");
  assert.ok(!/00:00:4[5-9]|00:00:5\d/.test(srt), "nothing past the clip's own end may appear");
  assert.match(srt, /mistake most people make/, "and the clip's actual words are in it");
});

test("subtitle cues are clipped to the clip, not just shifted", () => {
  // A segment straddling the out-point must be truncated, or the last caption
  // hangs past the end of the video.
  const srt = cf.srtForClip([{ start: 0, end: 30, text: "Long segment." }], 5, 15);
  assert.match(srt, /00:00:00,000 --> 00:00:10,000/);
});

test("the ranking moves when the words move — it is not a checksum", () => {
  // The whole point. Two transcripts of the same length and shape must rank
  // differently when one of them actually says something.
  const flat = cf.findClips([
    { start: 0, end: 12, text: "The weather was mild. It was quite pleasant." },
    { start: 12, end: 24, text: "We walked around for a while. Then we went home." },
    { start: 24, end: 36, text: "It was an ordinary day. Nothing much happened." },
  ], { minSec: 15, maxSec: 60, limit: 1 });
  const sharp = cf.findClips([
    { start: 0, end: 12, text: "Here's the mistake most people make with your pricing." },
    { start: 12, end: 24, text: "We raised ours 40% and lost two customers out of ninety." },
    { start: 24, end: 36, text: "So that's the lesson: your price is a hypothesis, not a fact." },
  ], { minSec: 15, maxSec: 60, limit: 1 });
  assert.ok(sharp.clips[0].score > flat.clips[0].score,
    `a clip that says something must beat one that does not (${sharp.clips[0].score} vs ${flat.clips[0].score})`);
});

// ---------------------------------------------------------------------------
// The eight commercial scores were a hash of the clip id.
//
//   const s    = (salt) => seed(input.clipId + salt) % 30;
//   const hook = input.hookStrength ?? 50 + s("hook");
//
// A clip with no measured signals still produced eight confident numbers —
// reach, conversion, profitability — from the characters of its own
// identifier. Rename the clip and its business case changed.
// ---------------------------------------------------------------------------
const vi = await import("../src/backend/video-intelligence.ts");

test("a clip nobody measured is not given eight commercial scores", () => {
  const r = vi.scoreClip({ clipId: "clip_0_2000" });
  for (const s of r.scores) assert.equal(s.score, null, `${s.dimension} was scored from nothing`);
  assert.equal(r.headline, "not scored");
  assert.match(r.note, /Nothing was measured for this clip/);
});

test("renaming a clip no longer changes its business case", () => {
  const a = vi.scoreClip({ clipId: "aaaa", hookStrength: 70, ctaPresent: true });
  const b = vi.scoreClip({ clipId: "zzzzzzzzzzzz", hookStrength: 70, ctaPresent: true });
  assert.deepEqual(a.scores, b.scores);
});

test("dimensions whose inputs were measured are scored; the rest stay blank", () => {
  // hookStrength IS measurable from a transcript. Emotional intensity, buyer
  // intent and reputation risk are not, so those dimensions must stay empty.
  const r = vi.scoreClip({ clipId: "c1", hookStrength: 80, ctaPresent: true });
  const by = Object.fromEntries(r.scores.map((s) => [s.dimension, s.score]));
  assert.ok(by.retention !== null, "retention needs only hook strength");
  assert.equal(by.conversion, null, "conversion needs buyer intent, which no transcript reveals");
  assert.equal(by.brand_safety, null, "brand safety needs a risk reading nobody took");
  assert.match(r.note, /left blank rather than filled in/);
});

test("a fully measured clip still gets all eight", () => {
  const r = vi.scoreClip({ clipId: "c1", hookStrength: 80, emotionalIntensity: 60, buyerIntent: 70, reputationRisk: 5, ctaPresent: true, productVisible: true });
  assert.ok(r.scores.every((s) => s.score !== null));
  assert.match(r.headline, /\d+\/100/);
});

test("a moment's rank no longer carries points from a hash of its id", () => {
  const [a, b] = vi.rankMoments([
    { id: "aaaaaaaaaaaaaaaa", startSec: 0, endSec: 20, transcript: "the same words" },
    { id: "b", startSec: 30, endSec: 50, transcript: "the same words" },
  ]);
  assert.equal(a.momentScore, b.momentScore, "identical signals must rank identically whatever the ids are");
});

test("renaming a file no longer changes what genre the platform thinks it is", () => {
  const one = vi.detectGenre({ title: "recording-2024-final-v3", transcript: "" });
  const two = vi.detectGenre({ title: "zzz", transcript: "" });
  assert.equal(one.genre, two.genre, "with no evidence either way, the answer must not come from the filename");
});

test("video-intelligence has no score generator left in it", async () => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../src/backend/video-intelligence.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\bseed\s*\(/.test(code), "seed() must not exist here");
  assert.ok(!/Math\.imul\(/.test(code), "nor the hash it was built on");
});

test("clip-finder never had one and must never grow one", async () => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../src/backend/clip-finder.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/Math\.imul\(|Math\.random\(/.test(code), "a clip score decides what a customer publishes under their own name");
});

test("buying language is counted, and the dimensions it feeds stop being blank", () => {
  // buyerIntent used to default to a hash of the clip id. Commercial vocabulary
  // IS countable from a transcript, so it is measured — while emotional
  // intensity and reputation risk stay out, because a transcript records that
  // someone said "worth every penny", not how they said it or whether the claim
  // behind it holds up.
  const sells = cf.bodySignals("Our price is £40 and the ROI pays for itself. Customers save money.", 30, 90);
  const chat = cf.bodySignals("It was a nice afternoon and we walked along the river for a while.", 30, 90);
  const buy = (sig) => sig.find((s) => s.name === "Buying signal");
  assert.ok(buy(sells).score > buy(chat).score);
  assert.match(buy(sells).evidence, /commercial term\(s\)/);
  assert.match(buy(chat).evidence, /will not sell anything by itself/);
});

test("the clip route hands on only signals it actually measured", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/app/api/video/clips/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /scoreClip\(\{[^}]*hookStrength: hook[^}]*buyerIntent: buying/,
    "hook and buyer intent are measured and must be passed");
  assert.ok(!/emotionalIntensity:/.test(src), "a transcript does not reveal emotional intensity");
  assert.ok(!/reputationRisk:/.test(src), "nor whether the claim behind the words is defensible");
});

// ---------------------------------------------------------------------------
// "We can render" is not "we can render THIS".
//
// The hosted FFmpeg API takes a flat list of options and cannot run
// filter_complex, so anything compositing a second source over the frame —
// `brand` (a logo) and `broll` (picture-in-picture) — only ever runs on the
// self-hosted worker. With the hosted key set and no worker, which is exactly
// how this platform is deployed, enqueueVideoJob charged anyway: buildRecipe
// succeeded because the recipe is valid FFmpeg, the wallet was debited, the
// hosted-submit block was skipped because the kind is unsupported, and the job
// was written to the queue as "queued" on a worker queue with no worker.
//
// The customer paid 18 ACUs for a render that could never start, and nothing
// errored — the job just sat there. Charged, nothing delivered, no error on
// either side: the same shape as every other money defect found this week.
// ---------------------------------------------------------------------------
const vj = await import("../src/backend/video-jobs.ts");

const withEnv = async (env, fn) => {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === null) delete process.env[k]; else process.env[k] = v;
  }
  try { return await fn(); } finally { process.env = saved; }
};

test("a render the hosted API cannot do is refused BEFORE the wallet is touched", async () => {
  await withEnv({ FFMPEG_CLOUD_API_KEY: "test-key", VIDEO_WORKER_SECRET: null }, async () => {
    const org = "render-guard-org";
    await wallet.creditAcus(org, 500);
    const before = (await wallet.getWallet(org)).balanceAcu;

    const res = await vj.enqueueVideoJob({
      brandId: org, kind: "brand",
      sourceUrl: "https://example.com/v.mp4",
      params: { logoUrl: "https://example.com/logo.png" },
    });

    assert.equal(res.ok, false, "a job nothing can run must not be accepted");
    assert.equal((await wallet.getWallet(org)).balanceAcu, before, "not one ACU may be taken");
    assert.match(res.error, /you have not been charged/);
    assert.match(res.error, /filter_complex/, "and it must say why, not just refuse");
  });
});

test("the kinds the hosted API CAN do still go through", async () => {
  // The guard must not have switched off the five that work.
  await withEnv({ FFMPEG_CLOUD_API_KEY: "test-key", VIDEO_WORKER_SECRET: null }, () => {
    for (const kind of ["trim", "clips", "captions_burn", "bg_remove", "upscale"]) {
      assert.equal(vj.canRenderKind(kind).ok, true, `${kind} runs on the hosted API and must stay available`);
      assert.equal(vj.canRenderKind(kind).via, "cloud");
    }
  });
});

test("a self-hosted worker can run everything, including the composites", async () => {
  await withEnv({ VIDEO_WORKER_SECRET: "s", FFMPEG_CLOUD_API_KEY: null }, () => {
    for (const kind of ["trim", "clips", "captions_burn", "brand", "broll", "bg_remove", "upscale"]) {
      assert.equal(vj.canRenderKind(kind).ok, true, `${kind} must run on the worker`);
      assert.equal(vj.canRenderKind(kind).via, "worker");
    }
  });
});

test("with no renderer at all, nothing is charged and the browser is offered instead", async () => {
  await withEnv({ FFMPEG_CLOUD_API_KEY: null, VIDEO_WORKER_SECRET: null }, async () => {
    const org = "no-renderer-org";
    await wallet.creditAcus(org, 500);
    const before = (await wallet.getWallet(org)).balanceAcu;
    const res = await vj.enqueueVideoJob({ brandId: org, kind: "clips", sourceUrl: "https://x/v.mp4", params: { moments: [{ startSec: 0, endSec: 20 }] } });
    assert.equal(res.ok, false);
    assert.equal((await wallet.getWallet(org)).balanceAcu, before);
    assert.match(res.error, /does not need one — the Clip Finder does that in your browser/);
  });
});

test("the render guard runs before the debit, not after", async () => {
  // Order is the whole fix. A check after debitAcus would still take the money
  // and then hand it back, which is a refund, not a refusal — and refunds only
  // work when the code that issues them actually runs.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/backend/video-jobs.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const guard = src.indexOf("canRenderKind(input.kind)");
  // The brand id no longer names the wallet — spending resolves the OWNING
  // ACCOUNT first (walletIdForBrand). The property under test is unchanged: the
  // guard must still come before the money moves.
  const debit = src.indexOf("await debitAcus(walletId, cost)");
  assert.ok(guard > 0 && debit > 0, "both must exist");
  assert.ok(guard < debit, "the guard must come first");
});

test("every render kind still clears the owner's 2x margin floor", async () => {
  // The hosted renderer bills per processing minute, so this is now a real
  // provider cost on a live path rather than a hypothetical one.
  for (const [kind, acu] of Object.entries(vj.JOB_COST_ACU)) {
    const cost = vj.RENDER_PROVIDER_COST_GBP[kind];
    const revenue = acu / 100; // £1 = 100 ACUs
    assert.ok(revenue >= cost * 2, `${kind}: charges £${revenue} against £${cost} cost — under the 2x floor`);
  }
});

test("a refused queued render points at the browser, not at a container to deploy", async () => {
  await withEnv({ FFMPEG_CLOUD_API_KEY: "test-key", VIDEO_WORKER_SECRET: null }, () => {
  // brand and broll are no longer gated capabilities — clip-render.ts does both
  // at the same size and position. The queued version is what is unavailable,
  // and telling someone to stand up infrastructure for something the product
  // already does is the kind of advice that gets acted on and wastes a day.
    const r = vj.canRenderKind("brand");
    assert.equal(r.ok, false, "the hosted API still cannot queue a composite");
    assert.match(r.reason, /The capability itself is not missing/);
    assert.match(r.reason, /in your browser/);
    assert.match(r.reason, /same size and position/);
  });
});

// ---------------------------------------------------------------------------
// Where a business actually sells, and what that makes of its numbers.
//
// The brand carried `location: string` — free text, used as a prompt hint.
// Nothing could answer "is this traffic from somewhere I sell to", so nothing
// did. A customer's impressions climb, most of them from Pakistan, and they
// sell in the UK: the headline moved, the business did not, and the platform
// reported the rise as a win. That is a metric pointing the opposite way to
// reality, and someone who trusts it keeps making the content that caused it.
// ---------------------------------------------------------------------------
const mk = await import("../src/shared/market.ts");

test("every spelling of a country resolves to the same code", () => {
  // Search Console returns lower-case alpha-3; ad platforms return alpha-2;
  // humans type names. A mismatch silently reads as "out of market", which
  // would tell a UK business that none of its traffic is from the UK.
  for (const v of ["GB", "gb", "GBR", "gbr", "United Kingdom", "uk", "U.K.", "Britain", "england", "Scotland"]) {
    assert.equal(mk.normaliseCountry(v), "GB", `${v} must resolve to GB`);
  }
  assert.equal(mk.normaliseCountry("pak"), "PK");
  assert.equal(mk.normaliseCountry("USA"), "US");
  assert.equal(mk.normaliseCountry("america"), "US");
});

test("an unrecognised country resolves to nothing rather than to a guess", () => {
  // A wrong code would move traffic into or out of the market and change a
  // number the customer acts on, with nothing on screen to say it happened.
  for (const v of ["", "  ", "Zorbia", "XX", "ZZZ", null, undefined, "123"]) {
    assert.equal(mk.normaliseCountry(v), "", `${v} must not resolve to a country`);
  }
});

const UK_FIRST = { countries: [{ code: "GB", tier: "primary" }, { code: "IE", tier: "secondary" }], cities: [] };

test("the case that started this: the total is up and the business is not", () => {
  const rows = [
    { country: "pak", value: 6000 },   // Search Console spelling
    { country: "ind", value: 2000 },
    { country: "gbr", value: 1500 },
    { country: "irl", value: 500 },
  ];
  const fit = mk.marketFit(rows, UK_FIRST, "impressions");
  assert.equal(fit.total, 10000);
  assert.equal(fit.primary, 1500, "only the UK counts as the main market");
  assert.equal(fit.secondary, 500);
  assert.equal(fit.outside, 8000);
  assert.equal(fit.inMarketPct, 20);
  // The headline must lead with the real number, not the flattering one.
  assert.match(fit.headline, /^1,500 impressions from your main market — not 10,000/);
  assert.match(fit.headline, /60% of it from Pakistan alone|Pakistan/);
  assert.equal(fit.topOutside[0].name, "Pakistan");
});

test("out-of-market traffic is never added to the headline, and never called worthless", () => {
  const fit = mk.marketFit([{ country: "gbr", value: 100 }, { country: "pak", value: 900 }], UK_FIRST);
  assert.ok(!fit.headline.includes("1,000 impressions from your main market"));
  assert.match(fit.note, /not necessarily worthless/, "a country that keeps appearing may be a market worth entering");
  assert.match(fit.note, /never be added to a number you use to judge/);
});

test("a country we cannot identify is its own bucket, not folded into either side", () => {
  // Folding it into "outside" overstates the problem; folding it into "in
  // market" hides it. Both are ways of being confidently wrong.
  const fit = mk.marketFit([{ country: "gbr", value: 100 }, { country: "zzz", value: 50 }], UK_FIRST);
  assert.equal(fit.primary, 100);
  assert.equal(fit.outside, 0);
  assert.equal(fit.unknown, 50);
  assert.match(fit.note, /could not identify and are excluded from both sides rather than guessed/);
});

test("with no market set, the number is reported as a total and says why", () => {
  const fit = mk.marketFit([{ country: "gbr", value: 100 }], { countries: [], cities: [] });
  assert.equal(fit.primary, 0);
  assert.match(fit.headline, /no target market is set/);
  assert.match(fit.note, /It is a total, not a result/i);
});

test("a healthy split does not manufacture an alarm", () => {
  const fit = mk.marketFit([{ country: "gbr", value: 950 }, { country: "fra", value: 50 }], UK_FIRST);
  assert.ok(!/not 1,000/.test(fit.headline), "5% leakage is not the Pakistan case");
  assert.match(fit.headline, /95% of 1,000 total/);
});

test("tiers are the customer's, and no country is built in as important", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/shared/market.ts", "utf8");
  // A shipped ranking of countries would be an opinion applied to every
  // customer who never asked for it.
  assert.ok(!/third.world|developing|first.world|tier.?1 countr/i.test(src),
    "no built-in ranking of countries may exist");
  assert.equal(mk.tierOf("GB", UK_FIRST), "primary");
  assert.equal(mk.tierOf("IE", UK_FIRST), "secondary");
  assert.equal(mk.tierOf("PK", UK_FIRST), null, "outside the market is null, not a lower tier");
});

test("presets are a starting point and every one is editable", () => {
  const ukThen = mk.MARKET_PRESETS.find((p) => p.id === "uk-then-english").build();
  assert.deepEqual(ukThen.countries.filter((c) => c.tier === "primary").map((c) => c.code), ["GB"]);
  assert.ok(ukThen.countries.filter((c) => c.tier === "secondary").length >= 4);
  for (const p of mk.MARKET_PRESETS) {
    const m = p.build();
    assert.ok(m.countries.length > 0, `${p.id} builds an empty market`);
    assert.ok(m.countries.every((c) => mk.normaliseCountry(c.code) === c.code), `${p.id} has an unresolvable code`);
  }
});

test("a city market beats a country market when searching", () => {
  // "plumber in Croydon" returns something useful; "plumber in the United
  // Kingdom" does not.
  assert.equal(mk.geoQualifier({ countries: [{ code: "GB", tier: "primary" }], cities: ["Croydon"] }), "Croydon");
  assert.equal(mk.geoQualifier(UK_FIRST), "United Kingdom", "secondary markets are not searched by default");
  assert.equal(mk.geoQualifier({ countries: [], cities: [] }), "", "empty, so a caller concatenating it never makes a dangling 'in '");
});

test("the search modules take the market instead of hardcoding a country", async () => {
  const { readFileSync: rf } = await import("node:fs");
  // prospecting fell back to a literal "United Kingdom" for every customer on
  // earth, whoever they were and wherever they sold.
  for (const route of ["prospecting", "search", "ai-visibility"]) {
    const src = rf(`src/app/api/${route}/route.ts`, "utf8");
    assert.match(src, /marketLocation\(/, `${route} must resolve the brand's market`);
  }
  // Comments stripped: this file DISCUSSES the hardcoded "United Kingdom" it
  // replaced, and an assertion that matched prose would fail on the
  // explanation rather than on the code.
  const helper = rf("src/backend/brand-market.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(helper, /if \(typed\) return typed;/, "an explicit location must always win");
  assert.ok(!/"United Kingdom"/.test(helper), "no hardcoded country fallback in the code");
});

// ---------------------------------------------------------------------------
// What a market implies: a clock, a currency, a spelling, an ad-targeting spec.
//
// The four remaining modules each solved this badly on their own — or, in one
// case, with a hash. `bestSendTime` was
// `hours[seed(sent + ":" + delivered) % hours.length]`: the recommended hour to
// email a list, drawn from a checksum of that list's own delivery counts. A
// customer schedules a campaign on it.
// ---------------------------------------------------------------------------

test("a send time is arithmetic, and it survives daylight saving", () => {
  // London is UTC+0 in January and UTC+1 in July. A lookup table would send the
  // summer campaign an hour early for six months and nobody would connect the
  // two, so the offset is read out of Intl at the actual date.
  const uk = { countries: [{ code: "GB", tier: "primary" }], cities: [] };
  const winter = mk.sendWindows(uk, 9, new Date("2026-01-15T00:00:00Z"));
  const summer = mk.sendWindows(uk, 9, new Date("2026-07-15T00:00:00Z"));
  assert.equal(winter.windows[0].utcHour, 9, "09:00 London in January is 09:00 UTC");
  assert.equal(summer.windows[0].utcHour, 8, "09:00 London in July is 08:00 UTC");
  assert.equal(summer.windows[0].tz, "Europe/London");
});

test("a market spanning countries gets one window each, not an average", () => {
  const spread = { countries: [{ code: "GB", tier: "primary" }, { code: "AU", tier: "primary" }], cities: [] };
  const r = mk.sendWindows(spread, 9, new Date("2026-07-15T00:00:00Z"));
  assert.equal(r.windows.length, 2);
  assert.notEqual(r.windows[0].utcHour, r.windows[1].utcHour, "London and Sydney cannot share a UTC hour");
  assert.match(r.note, /a single time cannot be 09:00 in all of them/);
});

test("a country spanning time zones says so instead of pretending", () => {
  const us = { countries: [{ code: "US", tier: "primary" }], cities: [] };
  const r = mk.sendWindows(us, 9, new Date("2026-07-15T00:00:00Z"));
  assert.equal(r.windows[0].multiZone, true);
  assert.match(r.windows[0].note, /spans several time zones/);
  assert.match(r.windows[0].note, /receives it earlier or later/);
});

test("with no market, no send time is recommended at all", () => {
  const r = mk.sendWindows({ countries: [], cities: [] }, 9, new Date("2026-07-15T00:00:00Z"));
  assert.deepEqual(r.windows, []);
  assert.match(r.note, /nobody has said where this list is/);
});

test("the campaign report no longer hashes its send time", async () => {
  const eng = await import("../src/backend/engagement.ts");
  const base = { sent: 4200, delivered: 4083, opens: 1755, clicks: 421 };
  // Same list, different market → different advice. Under the hash the two were
  // identical, because the hash never looked at where anyone was.
  const uk = eng.campaignAnalytics({ ...base, market: { countries: [{ code: "GB", tier: "primary" }], cities: [] }, now: new Date("2026-07-15T00:00:00Z") });
  const au = eng.campaignAnalytics({ ...base, market: { countries: [{ code: "AU", tier: "primary" }], cities: [] }, now: new Date("2026-07-15T00:00:00Z") });
  assert.notEqual(uk.bestSendTime, au.bestSendTime);
  assert.match(uk.bestSendTime, /08:00 UTC \(09:00 in Europe\/London\)/);

  // And with no market it declines rather than producing something that reads
  // like advice.
  const blind = eng.campaignAnalytics({ ...base });
  assert.equal(blind.bestSendTime, "");
  assert.match(blind.sendTimeNote, /nobody has said where this list is/);

  const { readFileSync } = await import("node:fs");
  const code = readFileSync("src/backend/engagement.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/const bestSendTime = hours\[/.test(code), "the hashed hour must be gone");
});

test("ad targeting names where to spend and insists on excluding the rest", () => {
  const uk = { countries: [{ code: "GB", tier: "primary" }, { code: "IE", tier: "secondary" }], cities: [] };
  const t = mk.adTargeting(uk);
  assert.deepEqual(t.includeCountries.map((c) => c.code), ["GB", "IE"]);
  assert.deepEqual(t.currencies, ["GBP", "EUR"]);
  assert.match(t.note, /exclude everywhere else/);
  assert.match(t.note, /Prices appear in GBP, EUR/, "one hardcoded currency will be wrong for someone");
  assert.match(t.note, /buys the cheapest impressions available/);
});

test("a city market targets the city, not the country around it", () => {
  const t = mk.adTargeting({ countries: [{ code: "GB", tier: "primary" }], cities: ["Croydon"] });
  assert.deepEqual(t.includeCities, ["Croydon"]);
  assert.match(t.note, /Target Croydon specifically/);
});

test("with no market, no ad targeting is written and it says what that costs", () => {
  const t = mk.adTargeting({ countries: [], cities: [] });
  assert.deepEqual(t.includeCountries, []);
  assert.match(t.note, /spends wherever impressions are cheapest, which is rarely where the customers are/);
});

test("the ad batch plan carries its targeting", async () => {
  const ba = await import("../src/backend/batch-ads.ts");
  const plan = ba.planBatch({
    business: "AxionOS", product: "CDE platform",
    market: { countries: [{ code: "GB", tier: "primary" }], cities: [] },
  });
  assert.ok(plan.variants.length > 0);
  assert.deepEqual(plan.targeting.includeCountries.map((c) => c.code), ["GB"]);
});

test("a mixed British/American market is told it cannot have one article", () => {
  // The cheapest localisation mistake to make and the easiest to miss.
  const mixed = mk.localisationTargets({ countries: [{ code: "GB", tier: "primary" }, { code: "US", tier: "secondary" }], cities: [] });
  assert.equal(mixed.spellingSplit, true);
  assert.match(mixed.note, /optimise.*reads as a typo|optimize/);

  const single = mk.localisationTargets({ countries: [{ code: "GB", tier: "primary" }], cities: [] });
  assert.equal(single.spellingSplit, false);
});

test("localisation targets carry the locale and currency, not just a name", () => {
  const t = mk.localisationTargets({ countries: [{ code: "DE", tier: "primary" }], cities: [] });
  assert.equal(t.targets[0].locale, "de-DE");
  assert.equal(t.targets[0].currency, "EUR");
  assert.equal(t.targets[0].spelling, null, "Germany has no English spelling expectation");
});

test("trends are searched where the business sells", () => {
  const r = mk.trendRegion({ countries: [{ code: "GB", tier: "primary" }], cities: [] });
  assert.equal(r.query, "United Kingdom");
  assert.match(r.note, /is not an opportunity for it, however large it is elsewhere/);

  const local = mk.trendRegion({ countries: [{ code: "GB", tier: "primary" }], cities: ["Croydon"] });
  assert.equal(local.query, "Croydon", "a local business wants local news");

  const none = mk.trendRegion({ countries: [], cities: [] });
  assert.equal(none.query, "", "empty, so the query is never appended with a dangling region");
  assert.match(none.note, /searched globally/);
});

test("the region reaches the actual news query", async () => {
  const { readFileSync: rf } = await import("node:fs");
  const src = rf("src/backend/trend-watch.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /region\.query \? `\$\{s\} \$\{region\.query\}` : s/,
    "the region must be in the search, not filtered afterwards");
});

test("all four modules take the market rather than asking for it again", async () => {
  const { readFileSync: rf } = await import("node:fs");
  for (const [file, needle] of [
    ["src/app/api/batch-ads/route.ts", /brandMarket\(/],
    ["src/app/api/engagement/route.ts", /brandMarket\(/],
    ["src/app/api/trends/scheduled/route.ts", /market: await brandMarket\(s\.brandId\)/],
    ["src/backend/localisation.ts", /localesFromMarket/],
  ]) {
    assert.match(rf(file, "utf8"), needle, `${file} does not read the brand's market`);
  }
});

// ---------------------------------------------------------------------------
// See it before two thousand people do.
//
// The Email Centre could send from three places — typed by hand, generated by
// the writer, a saved template — and none of them showed what would actually
// arrive. The editor rendered the template's own HTML, which is not the same
// thing: the send path merges each contact's fields, injects a tracking pixel,
// rewrites every link through the click redirector and appends an unsubscribe
// block. A campaign that looks right in the editor can still go out with a raw
// {{ salesRep }} in the greeting.
// ---------------------------------------------------------------------------
const ep = await import("../src/backend/email-preview.ts");

const CONTACTS = [
  { id: "1", brandId: "b", email: "marie@rawbank.cd", name: "Marie Jolaine", company: "Rawbank", consent: true },
  { id: "2", brandId: "b", email: "noname@example.com", consent: true },        // no name at all
  { id: "3", brandId: "b", email: "opted@example.com", name: "Opted Out", consent: false },
];

test("the preview shows a contact with a MISSING name first", async () => {
  // A made-up "John Smith" has every field filled in, which is the one case
  // that never goes wrong. The contact with no name is where the fallback
  // fires, and that is the substitution worth seeing before it goes out.
  const p = await ep.buildEmailPreview({
    brandId: "b", subject: "Hi {{ firstName }}", html: "<p>Hello {{ firstName }}, from {{ brand }}.</p>",
    brandName: "AxionOS", contacts: CONTACTS, source: "written", samples: 2,
  });
  assert.equal(p.samples[0].name, "", "the incomplete record leads");
  assert.match(p.samples[1].subject, /Hi Marie/);
  // And what it exposes: a BARE {{ firstName }} has no fallback on the send
  // path, so this contact receives "Hi " with a gap in it. The defaults in
  // shared/merge-tokens are applied by fixTokens(), which rewrites template
  // text — the send calls mergeTemplate directly and never sees them.
  assert.equal(p.samples[0].subject, "Hi ");
  const gap = p.checks.find((c) => /has no fallback/.test(c.message));
  assert.ok(gap, "the preview must name this, or it is the thing the preview exists to catch and misses");
  assert.match(gap.message, /1 contact\(s\)/);
  assert.match(gap.message, /\{\{ firstName \| there \}\}/, "and give the one-keystroke fix");
});

test("an opted-out contact is excluded, exactly as the send excludes it", async () => {
  const p = await ep.buildEmailPreview({
    brandId: "b", subject: "s", html: "<p><a href='https://x.test'>x</a></p>",
    contacts: CONTACTS, source: "written",
  });
  assert.equal(p.recipients, 2, "a preview counting a different population than the send is a lie about the send");
  assert.ok(!p.samples.some((s) => s.to.includes("opted")));
});

test("the preview runs the SEND path, not a second renderer", async () => {
  const p = await ep.buildEmailPreview({
    brandId: "b", subject: "s", html: "<p>Hi <a href=\"https://example.com/offer\">see the offer</a></p>",
    contacts: CONTACTS, source: "written", samples: 1,
  });
  const html = p.samples[0].html;
  // Everything injectTracking adds must be in the preview, or the preview is
  // showing a different email from the one that gets delivered.
  assert.match(html, /\/api\/track\/open\?t=/, "the tracking pixel");
  assert.match(html, /\/api\/track\/click\?t=/, "links rewritten through the redirector");
  assert.match(html, /\/api\/track\/unsubscribe\?t=/, "the unsubscribe line the send appends");
  assert.ok(!/href="https:\/\/example\.com\/offer"/.test(html), "the raw link must not survive un-wrapped");
});

test("an unknown merge tag blocks the send", async () => {
  // The catastrophic one: "{{ salesRep }}" reaching every inbox verbatim.
  const p = await ep.buildEmailPreview({
    brandId: "b", subject: "A note from {{ salesRep }}", html: "<p><a href='https://x.test'>x</a></p>",
    contacts: CONTACTS, source: "ai",
  });
  assert.equal(p.sendable, false);
  const b = p.checks.find((c) => c.level === "blocker" && c.where === "subject");
  assert.match(b.message, /\{\{ salesRep \}\}/);
  assert.match(b.message, /not a field we hold/);
});

test("an empty subject blocks the send", async () => {
  const p = await ep.buildEmailPreview({ brandId: "b", subject: "  ", html: "<p>x</p>", contacts: CONTACTS, source: "written" });
  assert.equal(p.sendable, false);
  assert.ok(p.checks.some((c) => c.level === "blocker" && /no subject line/.test(c.message)));
});

test("a link that goes nowhere blocks the send", async () => {
  const p = await ep.buildEmailPreview({
    brandId: "b", subject: "s", html: '<p><a href="#">Buy now</a></p>', contacts: CONTACTS, source: "written",
  });
  assert.equal(p.sendable, false);
  assert.ok(p.checks.some((c) => c.level === "blocker" && /points nowhere/.test(c.message)));
});

test("an empty list blocks the send", async () => {
  const p = await ep.buildEmailPreview({ brandId: "b", subject: "s", html: "<p>x</p>", contacts: [], source: "written" });
  assert.equal(p.sendable, false);
  assert.equal(p.samples.length, 0);
  assert.ok(p.checks.some((c) => c.level === "blocker" && c.where === "list"));
});

test("a clean campaign is sendable and says so", async () => {
  const p = await ep.buildEmailPreview({
    brandId: "b", subject: "Your July offer",
    html: '<p>Hi {{ firstName | there }} — <a href="https://axion.test/offer">see it</a></p><img src="x.png" alt="Offer">',
    brandName: "AxionOS", contacts: CONTACTS, source: "template",
  });
  assert.equal(p.sendable, true, JSON.stringify(p.checks));
  assert.equal(p.checks.filter((c) => c.level === "blocker").length, 0);
  assert.match(p.note, /Not a mock-up of it/);
});

test("warnings do not block, and name what the reader loses", async () => {
  const long = "This subject line is considerably longer than sixty characters and will be cut";
  const p = await ep.buildEmailPreview({
    brandId: "b", subject: long, html: '<p><a href="http://x.test">x</a></p><img src="a.png">',
    contacts: CONTACTS, source: "written",
  });
  assert.equal(p.sendable, true, "none of these is fatal");
  const msgs = p.checks.filter((c) => c.level === "warning").map((c) => c.message).join(" ");
  assert.match(msgs, /Most inboxes cut it around 60/);
  assert.match(msgs, /http rather than https/);
  assert.match(msgs, /no alt text/);
});

test("the preheader is what the inbox shows, and hidden things stay hidden", async () => {
  // A tracking pixel or a display:none block would otherwise become the first
  // line a recipient reads beside the subject.
  const text = ep.htmlToText('<div style="display:none">preheader hack</div><p>Real opening line.</p>');
  assert.ok(!text.includes("preheader hack"));
  assert.match(text, /Real opening line/);
  assert.equal(ep.preheaderOf("<p>" + "x".repeat(200) + "</p>").length, 90, "truncated to what an inbox shows");
});

test("a real address is never printed in full by the preview", async () => {
  const p = await ep.buildEmailPreview({ brandId: "b", subject: "s", html: "<p>x</p>", contacts: CONTACTS, source: "written", samples: 3 });
  for (const s of p.samples) {
    assert.ok(!/marie@rawbank\.cd/.test(s.to), "a preview is not a reason to print a contact list");
    assert.match(s.to, /@/, "but it must still be identifiable");
  }
});

test("all three sources go through one preview, and the send is gated on it", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("src/app/api/email/route.ts", "utf8");

  const centre = readFileSync("src/app/dashboard/email/page.tsx", "utf8");
  // ONE html string feeds both the preview and the send. Two wrappers that look
  // the same today drift the first time one is edited.
  assert.match(centre, /payload\.html = composedHtml;/);
  assert.match(centre, /html=\{templateId \? undefined : composedHtml\}/);
  assert.match(centre, /!canSend \|\| previewBlockers > 0/, "the campaign send is held while the preview shows blockers");

  const editor = readFileSync("src/app/dashboard/email-templates/page.tsx", "utf8");
  assert.match(editor, /<EmailPreview/, "the template editor uses the same panel");
});

// ---------------------------------------------------------------------------
// Who the email is from — filled in, because the platform already knows.
//
// Three empty boxes with placeholders on every campaign: a From name the brand
// record holds, a Reply-to the signed-in account holds, and a From address that
// Sending Domains holds. The platform was asking a question it could answer.
//
// EXCEPT one of the three is not safe to guess, and that is the whole design.
// A From address only works if its domain is DKIM-authenticated. Prefilling
// hello@theirdomain.com because it LOOKS right produces mail that spam-folders,
// and the customer has no idea why — the field looked filled in, so it looked
// correct.
// ---------------------------------------------------------------------------
const ident = await import("../src/shared/email-identity.ts");

test("a verified domain is prefilled as the From address", () => {
  const d = ident.emailIdentityDefaults({
    brandName: "VeryX", userEmail: "Justin@Gmail.com",
    domains: [{ domain: "veryx.com", status: "verified" }],
  });
  assert.equal(d.fromName, "VeryX");
  assert.equal(d.fromEmail, "hello@veryx.com");
  assert.equal(d.replyTo, "justin@gmail.com", "normalised, because addresses are not case-sensitive");
  assert.match(d.fromNote, /your own verified domain \(veryx\.com\)/);
});

test("an UNVERIFIED domain is never prefilled, and the blank says why", () => {
  // The one that matters. A filled-in field that spam-folders is worse than an
  // empty one, because it looks correct.
  const d = ident.emailIdentityDefaults({
    brandName: "VeryX", userEmail: "justin@gmail.com",
    domains: [{ domain: "veryx.com", status: "pending" }],
    platformFrom: "MarketWar OS <info@marketwaros.com>",
  });
  assert.equal(d.fromEmail, "", "an unauthenticated domain must not be suggested");
  assert.match(d.fromNote, /not verified yet, so this is left blank on purpose/);
  assert.match(d.fromNote, /lands in spam/);
  assert.match(d.fromNote, /info@marketwaros\.com/, "and it must say what goes out instead");
  // The other two are still filled: they carry no deliverability risk.
  assert.equal(d.fromName, "VeryX");
  assert.equal(d.replyTo, "justin@gmail.com");
});

test("no domains at all is a different sentence from an unverified one", () => {
  const d = ident.emailIdentityDefaults({ brandName: "VeryX", userEmail: "a@b.com", domains: [] });
  assert.equal(d.fromEmail, "");
  assert.match(d.fromNote, /have not authenticated a domain of your own yet/);
  assert.ok(!/not verified yet/.test(d.fromNote), "telling someone to finish DNS they never started is a dead end");
});

test("the platform's own address is explained but never prefilled", () => {
  // It is MarketWar's address, not the customer's. Putting it in their From
  // field would make their campaign look like it came from us.
  const d = ident.emailIdentityDefaults({
    brandName: "VeryX", userEmail: "a@b.com", domains: [],
    platformFrom: "MarketWar OS <info@marketwaros.com>",
  });
  assert.equal(d.fromEmail, "");
  assert.match(d.fromNote, /info@marketwaros\.com/);
});

test("only the first verified domain is used, and only a verified one", () => {
  const d = ident.emailIdentityDefaults({
    brandName: "B", userEmail: "a@b.com",
    domains: [
      { domain: "pending.com", status: "pending" },
      { domain: "good.com", status: "verified" },
      { domain: "other.com", status: "verified" },
    ],
  });
  assert.equal(d.fromEmail, "hello@good.com");
});

test("a prefill never overwrites something the customer typed", () => {
  // Type a From name, switch brand to check something, come back — the text
  // must still be there.
  const typed = { fromName: "Justin at VeryX", fromEmail: "sales@veryx.com", replyTo: "me@work.com" };
  const out = ident.applyDefaults(typed, {
    fromName: "VeryX", fromEmail: "hello@veryx.com", replyTo: "other@gmail.com", fromNote: "",
  });
  assert.deepEqual(out, typed);

  // …but an empty field is filled.
  const half = ident.applyDefaults({ fromName: "", fromEmail: "  ", replyTo: "me@work.com" }, {
    fromName: "VeryX", fromEmail: "hello@veryx.com", replyTo: "other@gmail.com", fromNote: "",
  });
  assert.deepEqual(half, { fromName: "VeryX", fromEmail: "hello@veryx.com", replyTo: "me@work.com" });
});

test("a hand-typed address gets the check the prefilled one never needed", () => {
  const domains = [{ domain: "veryx.com", status: "verified" }, { domain: "half.com", status: "pending" }];
  assert.equal(ident.fromAddressWarning("hello@veryx.com", domains), "", "a verified domain is fine");
  assert.equal(ident.fromAddressWarning("", domains), "", "blank means the platform sender — not a problem");
  assert.match(ident.fromAddressWarning("hi@half.com", domains), /added but not verified yet/);
  assert.match(ident.fromAddressWarning("hi@stranger.com", domains), /not authenticated for sending here/);
  assert.match(ident.fromAddressWarning("not-an-address", domains), /does not look like an email address/);
});

test("the Email Centre actually applies the defaults, and shows the reason", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("src/app/dashboard/email/page.tsx", "utf8");
  assert.match(page, /emailIdentityDefaults\(\{/);
  assert.match(page, /applyDefaults\(\{ fromName, fromEmail, replyTo \}, defaults\)/,
    "it must merge rather than overwrite");
  assert.match(page, /userEmail: user\?\.email/, "the reply-to comes from the signed-in account");
  assert.match(page, /brandName: activeBrand\.name/);
  assert.match(page, /\{fromNote &&/, "a blank field must say it was left blank on purpose");
  assert.match(page, /fromAddressWarning\(fromEmail, domains\)/);
});

// ---------------------------------------------------------------------------
// The human gate: a check the customer could not pass, on a page that moved
// no money.
//
// Three defects, one screen. The owner opened the Share2Earn earnings dashboard
// on a phone and got a full-screen proof-of-work; filled in a whole mission and
// pressed Publish and got "your check was 21 minutes ago" with no way to pass
// one. Every assertion below fails against the code as it was.
// ---------------------------------------------------------------------------
process.env.HUMAN_CHECK_SECRET = process.env.HUMAN_CHECK_SECRET || "test-secret-for-the-gate-only";

const pow = await import("../src/shared/proof-of-work.ts");
const gate = await import("../src/backend/human-gate.ts");
const retry = await import("../src/shared/human-retry.ts");

test("the fast digest is byte-identical to WebCrypto, so the puzzle cannot drift", async () => {
  // The server verifies with crypto.subtle. If the browser's solver computed
  // even one digest differently, every real customer would be rejected while
  // the difficulty stayed exactly as easy for anyone using the server's rule.
  // Block boundaries (55/56/63/64/65 bytes) are where a padding bug hides.
  const shapes = ["", "a", "abc", "mwpow1:deadbeef:0", "£ € 日本語 🙂",
    "x".repeat(55), "x".repeat(56), "x".repeat(63), "x".repeat(64), "x".repeat(65), "y".repeat(1000)];
  for (const s of shapes) {
    assert.equal(pow.sha256HexSync(s), await pow.sha256Hex(s), `digest differs for a ${s.length}-char input`);
  }
  for (let i = 0; i < 300; i++) {
    const s = pow.powInput(`nonce${i}`, i * 7919);
    assert.equal(pow.sha256HexSync(s), await pow.sha256Hex(s));
  }
});

test("a solved challenge still passes the async verifier the server uses", async () => {
  // 10 bits keeps the test quick; the path exercised is the shipped one.
  const solved = await pow.solve("a1b2c3d4e5f60718", 10);
  assert.ok(solved, "the solver returned nothing at trivial difficulty");
  assert.equal(await pow.meetsDifficulty("a1b2c3d4e5f60718", solved.solution, 10), true);
});

test("reading a sensitive PAGE needs a session, not a fresh check", async () => {
  // The whole lockout: /dashboard/earnings demanded a check passed in the last
  // 15 minutes, so opening it a quarter of an hour later meant redoing a
  // proof-of-work that measured seven seconds on a server and far worse on a
  // phone — to LOOK at a page. Money still cannot move without freshness.
  assert.equal(gate.requiresFreshCheck("/api/share2earn"), true);
  assert.equal(gate.requiresFreshCheck("/api/creator-engine/payout"), true);
  assert.equal(gate.requiresFreshCheck("/dashboard/earnings"), false);
  assert.equal(gate.requiresFreshCheck("/dashboard/settings"), false);
  // Still marked sensitive — reporting is unchanged, only enforcement moved.
  assert.equal(gate.isSensitivePath("/dashboard/earnings"), true);

  const binding = await gate.bindingFor({ headers: { get: () => null } });
  const stale = Date.now() - 21 * 60_000;
  const session = await gate.issueSession(binding, stale);

  const page = await gate.decide({ path: "/dashboard/earnings", cookie: session.value, binding });
  assert.equal(page.allow, true, "a 21-minute-old session must still open the earnings page");
  assert.equal(page.sensitivity, "sensitive", "the page is still reported as sensitive");

  const money = await gate.decide({ path: "/api/share2earn", cookie: session.value, binding });
  assert.equal(money.allow, false, "the money route must still demand a fresh check");
  assert.equal(money.action, "reverify");
});

// A stand-in for fetch that records every attempt.
const fakeSend = (responses) => {
  const attempts = [];
  return {
    attempts,
    send: async (attempt) => { attempts.push(attempt); return responses[attempts.length - 1](); },
  };
};
const gateRefusal = () => new Response(
  JSON.stringify({ error: "This action moves money or credentials, so it needs a check passed in the last 15 minutes. Yours was 21 minutes ago.", humanCheckRequired: true, action: "reverify", where: "/verify-human" }),
  { status: 403, headers: { "content-type": "application/json" } },
);

test("the gate's 403 is read, the check is run, and the request is sent again", async () => {
  const { attempts, send } = fakeSend([gateRefusal, () => new Response(JSON.stringify({ ok: true }), { status: 200 })]);
  let checks = 0;
  const res = await retry.fetchWithHumanRetry({ send, check: async () => { checks++; return { ok: true }; } });
  assert.equal(checks, 1, "the check has to actually run");
  assert.deepEqual(attempts, [1, 2], "the original request has to be sent again after it passes");
  assert.equal(res.status, 200);
});

test("exactly one retry — a refusal that survives a passed check is a real refusal", async () => {
  const { attempts, send } = fakeSend([gateRefusal, gateRefusal]);
  const res = await retry.fetchWithHumanRetry({ send, check: async () => ({ ok: true }) });
  assert.equal(attempts.length, 2, "looping would respin the proof-of-work forever");
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.match(body.error, /the check passed/i, "repeating 'your check was 21 minutes ago' would now be untrue");
});

test("a failed check leaves the person somewhere to go, not on a dead end", async () => {
  const { attempts, send } = fakeSend([gateRefusal]);
  const res = await retry.fetchWithHumanRetry({ send, check: async () => ({ ok: false, error: "WebCrypto unavailable" }) });
  assert.equal(attempts.length, 1, "nothing is re-sent when the check did not pass");
  const body = await res.json();
  assert.match(body.error, /verify-human/, "the message must name the page that can issue a check");
  assert.match(body.error, /nothing you have typed on this screen is lost/i);
  assert.match(body.error, /WebCrypto unavailable/, "the reason it failed is worth having");
});

test("an ordinary 403 never triggers a proof-of-work", async () => {
  // A brand-ownership refusal is not a gate refusal. Solving a puzzle would
  // cost the person seconds and change nothing about the answer.
  const { attempts, send } = fakeSend([() => new Response(JSON.stringify({ error: "That brand is not yours." }), { status: 403 })]);
  let checks = 0;
  const res = await retry.fetchWithHumanRetry({ send, check: async () => { checks++; return { ok: true }; } });
  assert.equal(checks, 0);
  assert.equal(attempts.length, 1);
  assert.equal((await res.json()).error, "That brand is not yours.", "the caller still gets the server's own message");
});

test("a body that cannot be sent twice is never half-sent", async () => {
  const { attempts, send } = fakeSend([gateRefusal]);
  let checks = 0;
  const res = await retry.fetchWithHumanRetry({ send, bodyReplayable: false, check: async () => { checks++; return { ok: true }; } });
  assert.equal(checks, 0, "no point passing a check for a request that cannot be replayed");
  assert.equal(attempts.length, 1);
  assert.equal(res.status, 403);
  assert.equal(retry.replayable(JSON.stringify({ a: 1 })), true);
  assert.equal(retry.replayable(undefined), true);
  assert.equal(retry.replayable(new ReadableStream()), false);
});

// ---------------------------------------------------------------------------
// Signup attribution — the eight metres between the click and the account.
//
// The ledger, the wallet, the cap-and-recycle cycle and the payout rails were
// all built and tested. Nothing turned "this person arrived on a creator's
// link" into a row any of it could read, so the sub-10k ACU referral programme
// could not pay out from a link at all. Every assertion here fails against the
// code as it was, because none of these functions existed.
// ---------------------------------------------------------------------------
const sa = await import("../src/shared/signup-attribution.ts");
const engine = await import("../src/backend/creator-engine.ts");
const signupAttr = await import("../src/backend/signup-attribution.ts");

test("a referral code is validated, not trusted, wherever it arrives from", () => {
  assert.equal(sa.normaliseCode("abc123"), "ABC123");
  assert.equal(sa.normaliseCode("  mw-creator_7 "), "MW-CREATOR_7");
  assert.equal(sa.normaliseCode("ab"), null, "too short to be a minted code");
  assert.equal(sa.normaliseCode("../../etc/passwd"), null);
  assert.equal(sa.normaliseCode("<script>alert(1)</script>"), null);
  assert.equal(sa.normaliseCode(null), null);
  assert.equal(sa.normaliseCode("A".repeat(40)), null);
  // Both spellings, because the brand redirect writes both.
  const p = new URLSearchParams("utm_source=x&mw_ref=code99");
  assert.equal(sa.refFromParams(p), "CODE99");
});

test("last touch wins, and it restarts the 90 days", () => {
  const now = Date.UTC(2026, 7, 25);
  const old = { code: "FIRST1", at: now - 40 * 86_400_000 };

  // A fresh click beats a stored one — the whole rule, in one assertion.
  assert.deepEqual(sa.lastTouch(old, "SECOND2", now), { code: "SECOND2", at: now });
  // Re-clicking the same link restarts the clock rather than doing nothing.
  assert.deepEqual(sa.lastTouch(old, "FIRST1", now), { code: "FIRST1", at: now });
  // No new click: the stored one survives inside the window.
  assert.deepEqual(sa.lastTouch(old, null, now), old);
  // ...and is gone outside it. 91 days, not 89.
  assert.equal(sa.lastTouch({ code: "FIRST1", at: now - 91 * 86_400_000 }, null, now), null);
  assert.equal(sa.lastTouch({ code: "FIRST1", at: now - 89 * 86_400_000 }, null, now)?.code, "FIRST1");
  // A cookie dated in the future is a clock nobody can expire anything with.
  assert.equal(sa.lastTouch({ code: "FIRST1", at: now + 400 * 86_400_000 }, null, now), null);
  // Junk in the query string stores nothing rather than storing junk.
  assert.equal(sa.lastTouch(null, "not a code!", now), null);
});

test("the cookie round-trips, and a corrupted one reads as absent", () => {
  const a = { code: "ROUND1", at: 1_756_000_000_000 };
  assert.deepEqual(sa.decodeAttribution(sa.encodeAttribution(a)), a);
  for (const bad of ["", "NOCODE", "ABCD.", ".123", "ABCD.notanumber", "ab.123", null, 42]) {
    assert.equal(sa.decodeAttribution(bad), null, `"${bad}" must not decode to an attribution`);
  }
});

test("a signup on a creator's link is linked to the creator — without touching the ledger", async () => {
  engine.__resetCreatorEngine?.();
  signupAttr.__resetReferralAttribution();
  const nowISO = "2026-08-25T10:00:00.000Z";

  const prog = await engine.createProgramme({
    brandId: "brand_attr", brandName: "Attr Ltd", name: "Referral", product: "MarketWar OS",
    description: "Send businesses our way", destinationUrl: "", nowISO,
  });
  const creator = await engine.upsertCreator({ name: "Ada", email: "ada@example.com", tier: "micro", followers: 800, nowISO });
  const sub = await engine.subscribe(creator.id, prog.id, nowISO);
  assert.ok(sub.subscription, `subscribe failed: ${sub.error}`);
  const code = sub.subscription.code;

  const res = await signupAttr.attributeSignup({ accountId: "acct_new", code, email: "someone@else.com", via: "visit", nowISO });
  assert.equal(res.ok, true, `attribution refused: ${res.ok === false ? res.reason : ""}`);
  assert.equal(res.alreadyAttributed, false);
  assert.equal(res.record.creatorId, creator.id);

  // The link exists and can be read from either end.
  assert.equal((await signupAttr.getAttribution("acct_new"))?.creatorId, creator.id);
  assert.deepEqual((await signupAttr.attributionsForCreator(creator.id)).map((r) => r.accountId), ["acct_new"]);

  // AND NOTHING REACHED THE COMMISSION LEDGER.
  //
  // The obvious implementation wrote a £0 conversion so the wallet would count
  // it. fraudScore exists to refuse exactly that: "5 fake £0 conversions would
  // satisfy the proven-conversion exception and bypass the 10K gate". This
  // assertion is what keeps a future version of me from re-opening it.
  assert.equal((await engine.listLedger(creator.id)).length, 0, "a signup is not revenue and must never post as a conversion");
  const wallet = await engine.creatorWallet(creator.id);
  assert.equal(wallet.referralCount, 0, "referralCount counts customers who produced revenue — a signup alone is not one");
  assert.equal(wallet.payableGbp, 0);
});

test("one account is attributed once, ever", async () => {
  engine.__resetCreatorEngine?.();
  signupAttr.__resetReferralAttribution();
  const nowISO = "2026-08-25T10:00:00.000Z";
  const prog = await engine.createProgramme({ brandId: "b_once", brandName: "Once", name: "P", product: "x", description: "d", nowISO });
  const c1 = await engine.upsertCreator({ name: "One", email: "one@example.com", tier: "micro", followers: 100, nowISO });
  const c2 = await engine.upsertCreator({ name: "Two", email: "two@example.com", tier: "micro", followers: 100, nowISO });
  const s1 = await engine.subscribe(c1.id, prog.id, nowISO);
  const s2 = await engine.subscribe(c2.id, prog.id, nowISO);

  const first = await signupAttr.attributeSignup({ accountId: "acct_dup", code: s1.subscription.code, nowISO });
  assert.equal(first.ok && first.alreadyAttributed, false);

  // A retried request, a second tab, or a second creator's code arriving late.
  const again = await signupAttr.attributeSignup({ accountId: "acct_dup", code: s1.subscription.code, nowISO });
  assert.equal(again.ok && again.alreadyAttributed, true, "a refresh must not mint a second referral");
  const other = await signupAttr.attributeSignup({ accountId: "acct_dup", code: s2.subscription.code, nowISO });
  assert.equal(other.ok && other.record.creatorId, c1.id, "the first recorded attribution stands — it cannot be overwritten later");

  assert.equal((await engine.creatorWallet(c2.id)).referralCount, 0, "the second creator must not be credited");
});

test("a creator cannot refer their own account, and a typo credits nobody", async () => {
  engine.__resetCreatorEngine?.();
  signupAttr.__resetReferralAttribution();
  const nowISO = "2026-08-25T10:00:00.000Z";
  const prog = await engine.createProgramme({ brandId: "b_self", brandName: "Self", name: "P", product: "x", description: "d", nowISO });
  const me = await engine.upsertCreator({ name: "Me", email: "me@example.com", tier: "micro", followers: 100, nowISO });
  const sub = await engine.subscribe(me.id, prog.id, nowISO);

  const self = await signupAttr.attributeSignup({ accountId: "acct_self", code: sub.subscription.code, email: "ME@Example.com ", nowISO });
  assert.equal(self.ok, false);
  assert.match(self.reason, /cannot refer their own/i);
  assert.equal(await signupAttr.getAttribution("acct_self"), null, "a refused referral stores nothing");

  const typo = await signupAttr.attributeSignup({ accountId: "acct_typo", code: "NOSUCHCODE", nowISO });
  assert.equal(typo.ok, false);
  assert.match(typo.reason, /unknown referral code/i);
  assert.equal(await signupAttr.getAttribution("acct_typo"), null, "a dangling attribution nobody can trace is worse than none");
});

test("a stored attribution missing its fields reads as absent, never as a wrong creator", () => {
  // The .data() cast crashed two production pages. This one decides who gets
  // paid, so it fails towards 'not yet attributed' rather than towards credit.
  assert.equal(signupAttr.recordFromStored(null), null);
  assert.equal(signupAttr.recordFromStored({ code: "X1234" }), null, "no accountId, no record");
  assert.equal(signupAttr.recordFromStored({ accountId: "a", code: "X1234" }), null, "no creatorId, no record");
  const ok = signupAttr.recordFromStored({ accountId: "a", code: "X1234", creatorId: "cr_1", createdAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(ok.via, "visit", "an unknown `via` must not read as the stronger claim");
  assert.equal(ok.touchedAt, "2026-01-01T00:00:00.000Z", "a record written before touchedAt existed falls back rather than emptying");
});

test("the referral redirect no longer throws the code away", async () => {
  // The defect: a programme with no destinationUrl redirected to "/" and
  // discarded the code, so real traffic from a creator's link landed on the
  // home page with nothing carrying who sent them — and recordClick's
  // per-day-rotating hash means it could never be reconstructed afterwards.
  const { GET } = await import("../src/app/r/[code]/route.ts");
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";

  const bare = await engine.createProgramme({ brandId: "b_bare", brandName: "Bare", name: "NoDest", product: "x", description: "d", nowISO });
  const withDest = await engine.createProgramme({ brandId: "b_dest", brandName: "Dest", name: "HasDest", product: "x", description: "d", destinationUrl: "https://brand.example/offer?utm=x", nowISO });
  const cr = await engine.upsertCreator({ name: "Rae", email: "rae@example.com", tier: "micro", followers: 100, nowISO });
  const a = (await engine.subscribe(cr.id, bare.id, nowISO)).subscription;
  const b = (await engine.subscribe(cr.id, withDest.id, nowISO)).subscription;

  const call = async (code) => {
    const res = await GET(new Request(`https://marketwaros.com/r/${code}`), { params: Promise.resolve({ code }) });
    return new URL(res.headers.get("location"));
  };

  const noDest = await call(a.code);
  assert.equal(noDest.pathname, "/", "no destination still lands on our home page");
  assert.equal(noDest.searchParams.get("ref"), a.code, "and it now CARRIES THE CODE — this is the whole fix");

  const branded = await call(b.code);
  assert.equal(branded.host, "brand.example", "a configured programme still leads to the brand, never back to us");
  assert.equal(branded.searchParams.get("ref"), b.code);
  assert.equal(branded.searchParams.get("mw_ref"), b.code);
  assert.equal(branded.searchParams.get("utm"), "x", "the brand's own query string survives");

  // A code nobody minted must not create an attribution nobody can trace.
  const junk = await call("NOSUCHCODE");
  assert.equal(junk.pathname, "/");
  assert.equal(junk.searchParams.get("ref"), null);
});

// ---------------------------------------------------------------------------
// SHARE2EARN pays cash from the first sale (owner ruling, 2026-08-25).
//
// The partner dashboard showed "Pending (to 10K)" and "you're on the ACU
// referral programme" directly above "SHARE2EARN — 0.5%. Open to everyone. No
// follower count, no application, no audience test." Two owner rulings, live
// together, contradicting each other on one screen — and only the older one was
// implemented, so a SHARE2EARN creator's cash sat in pending for ever.
// ---------------------------------------------------------------------------
const cprog = await import("../src/shared/creator-program.ts");

test("a creator with no followers is paid cash, not parked on ACUs", async () => {
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";
  const prog = await engine.createProgramme({ brandId: "b_cash", brandName: "Cash", name: "P", product: "x", description: "d", nowISO });
  // Zero followers, unverified — exactly who the old gate parked.
  const cr = await engine.upsertCreator({ name: "Small", email: "small@example.com", tier: "micro", followers: 0, nowISO });
  const sub = await engine.subscribe(cr.id, prog.id, nowISO);

  await engine.recordConversion({ code: sub.subscription.code, grossGbp: 4000, referredRef: "cust_1", idempotencyKey: "ord_1", nowISO });
  const w = await engine.creatorWallet(cr.id);

  assert.equal(w.programme, "main", "nobody is placed on the ACU programme instead of being paid");
  assert.ok(w.payableGbp > 0, "earnings must be payable with no follower count involved");
  assert.equal(w.pendingGbp, 0, "nothing waits behind a follower gate any more");
  assert.equal(w.payoutEligible, true);
  assert.equal(w.band.id, "share2earn", "the RATE still follows the verified follower count");
  assert.equal(w.band.creatorRate, cprog.SHARE2EARN_RATE);
  // ACUs were a substitute for cash; they are now paid as well, so nobody loses.
  assert.ok(w.acusEarned > 0, "the SHARE2EARN band keeps its ACUs per referred customer");
  assert.doesNotMatch(w.gateNote, /sub-10K|auto-switch/i, "the note must not still describe the gate");
});

test("the withdrawal floor delays a payment, and never refuses an earning", async () => {
  assert.equal(cprog.withdrawable(0).ok, false);
  assert.equal(cprog.withdrawable(cprog.MIN_WITHDRAWAL_GBP).ok, true);
  const small = cprog.withdrawable(3.5);
  assert.equal(small.ok, false);
  assert.match(small.reason, /is yours and stays yours/, "a floor that reads like a confiscation is the thing we were avoiding");
  assert.doesNotMatch(small.reason, /follower/i);

  // And the payout path enforces it rather than the follower count.
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";
  const prog = await engine.createProgramme({ brandId: "b_floor", brandName: "Floor", name: "P", product: "x", description: "d", nowISO });
  const cr = await engine.upsertCreator({ name: "Tiny", email: "tiny@example.com", tier: "micro", followers: 0, nowISO });
  const sub = await engine.subscribe(cr.id, prog.id, nowISO);
  await engine.recordConversion({ code: sub.subscription.code, grossGbp: 100, referredRef: "c1", idempotencyKey: "o1", nowISO });

  const res = await engine.requestPayout(cr.id, "other", nowISO);
  assert.equal(res.ok, false, "50p cannot be withdrawn");
  assert.match(res.reason, /Withdrawals start at £20/);
  assert.doesNotMatch(res.reason, /10,?000|follower/i, "the refusal must not be about followers");
});

// ---------------------------------------------------------------------------
// Auto-fill on the Partner Network — the numbers already exist, so stop asking
// for them twice.
//
// Reported live: "ProfitGuard — Price (p) 0.19 … Publish the mission → This
// mission pays on a sale, so it needs the offer's economics." The catalogue two
// panels up already held that product at £19.00 with its full economics, and
// the form made the owner retype all seven in PENCE beside a catalogue printed
// in POUNDS — so £19 was entered as 0.19 and ProfitGuard was asked what
// nineteen-hundredths of a penny could afford.
// ---------------------------------------------------------------------------
test("the mission form fills its economics from the catalogue, and says what a pence box means", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/Share2Earn.tsx", import.meta.url), "utf8");

  // The fill exists and reads the stored offer rather than a typed guess.
  assert.match(src, /function fillFromProduct/);
  for (const field of ["pricePence", "cogsPence", "fulfilmentPence", "paymentFeePence", "taxPence", "returnsAllowancePct", "minProtectedMarginPence"]) {
    assert.match(src, new RegExp(`p\\.offer\\.${field}`), `${field} is not filled from the catalogue`);
  }
  // Every pence box echoes itself in pounds — the unit was only in the label,
  // and a unit that is only in the label is a unit somebody reads once.
  assert.match(src, /const money2 = /);
  assert.ok((src.match(/money2\(/g) || []).length >= 6, "each money box must say what it means in pounds");

  // "Already committed" comes from the float's own held total, not from memory.
  assert.match(src, /d\.heldPence/);
  assert.match(src, /setCommitted\(String\(d\.heldPence\)\)/);

  // AND "verified contribution generated" is NOT prefilled. The whole 5% ceiling
  // is computed from it, so a guess in a box labelled "verified" would be the
  // one number this platform must never invent.
  // The only thing allowed to write it is the person typing into it. (The first
  // version of this assertion banned the string `setGenerated(` and caught the
  // onChange handler — a check failing for a reason unrelated to what it tests,
  // which is the second defect class this repo tracks.)
  const writes = src.match(/setGenerated\([^)]*\)/g) || [];
  assert.deepEqual(
    [...new Set(writes)].sort(),
    ["setGenerated(e.target.value)"],
    "a figure labelled 'verified' must only ever be written by the person typing it",
  );
});

test("prefilled forms stop filling the moment somebody types", async () => {
  const { readFileSync } = await import("node:fs");
  // A fill that keeps reasserting itself is worse than no fill: it overwrites a
  // half-finished programme every time the brand context re-renders.
  for (const [file, flag] of [["../src/app/dashboard/partner-network/page.tsx", "touchedProgramme"], ["../src/components/PromotionCatalogue.tsx", "touched"]]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, new RegExp(`if \\(!activeBrand \\|\\| ${flag}\\) return;`), `${file} keeps refilling after an edit`);
    // Only empty boxes are filled — the updater form is what guarantees it.
    assert.match(src, /setP?\w+\(\(v\) => v \|\|/, `${file} overwrites a value somebody already typed`);
  }
  // The catalogue fills identity, never economics: a cost of goods nobody typed
  // is the one number that must not be invented, because the commission is
  // checked against it.
  const cat = readFileSync(new URL("../src/components/PromotionCatalogue.tsx", import.meta.url), "utf8");
  for (const guessed of ["setPrice((v)", "setCogs((v)", "setFulfil((v)", "setTax((v)"]) {
    assert.ok(!cat.includes(guessed), `${guessed} — economics must never be prefilled`);
  }
});

// ---------------------------------------------------------------------------
// A brand can pause or delete its own programmes and catalogue products.
//
// `Programme.active` had gated `subscribe()` since the engine was written and
// nothing in the codebase could ever set it to false — a policy with no switch,
// the third defect class this repository keeps producing. And a product could
// be listed but never taken down.
//
// The rule both of them follow: PAUSE is always available and never breaks a
// link somebody has already published; DELETE is refused the moment a creator
// holds a link or has earned through it, because a creator cannot edit a post
// from three weeks ago.
// ---------------------------------------------------------------------------
const promo = await import("../src/backend/promotable.ts");

test("pausing a programme stops new creators, and never touches what exists", async () => {
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";
  const prog = await engine.createProgramme({ brandId: "b_pause", brandName: "Pause Ltd", name: "P", product: "x", description: "d", nowISO });
  const early = await engine.upsertCreator({ name: "Early", email: "early@example.com", tier: "micro", followers: 0, nowISO });
  const late = await engine.upsertCreator({ name: "Late", email: "late@example.com", tier: "micro", followers: 0, nowISO });

  const first = await engine.subscribe(early.id, prog.id, nowISO);
  assert.ok(first.subscription, "a live programme must accept a creator");

  const paused = await engine.setProgrammeActive(prog.id, false, nowISO);
  assert.equal(paused.active, false);

  const refused = await engine.subscribe(late.id, prog.id, nowISO);
  assert.equal(refused.subscription, undefined, "a paused programme must not take a new creator");
  assert.match(refused.error, /inactive/i);

  // The link already issued is untouched — this is the whole point.
  const stillThere = await engine.subscriptionByCode(first.subscription.code);
  assert.equal(stillThere?.programmeId, prog.id, "a published link must keep resolving after a pause");
  // And it still earns.
  const conv = await engine.recordConversion({ code: first.subscription.code, grossGbp: 100, referredRef: "c1", idempotencyKey: "o1", nowISO });
  assert.ok(conv.event, `a pause must not stop an existing creator earning: ${conv.error}`);

  const resumed = await engine.setProgrammeActive(prog.id, true, nowISO);
  assert.equal(resumed.active, true);
  assert.ok((await engine.subscribe(late.id, prog.id, nowISO)).subscription, "resuming must let a new creator in again");
});

test("a programme somebody has earned through cannot be deleted", async () => {
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";
  const empty = await engine.createProgramme({ brandId: "b_del", brandName: "Del", name: "Nobody", product: "x", description: "d", nowISO });
  const used = await engine.createProgramme({ brandId: "b_del", brandName: "Del", name: "Somebody", product: "y", description: "d", nowISO });
  const cr = await engine.upsertCreator({ name: "C", email: "c@example.com", tier: "micro", followers: 0, nowISO });
  await engine.subscribe(cr.id, used.id, nowISO);

  // Nobody claimed this one — it goes.
  const gone = await engine.deleteProgramme(empty.id);
  assert.equal(gone.ok, true);
  assert.equal(await engine.getProgramme(empty.id), null);

  // This one has a creator holding a link. Refused, with the pause named.
  const kept = await engine.deleteProgramme(used.id);
  assert.equal(kept.ok, false, "deleting under a creator's feet must be refused");
  assert.equal(kept.subscriptions, 1);
  assert.match(kept.reason, /Pause it instead/i, "a refusal has to say what to do instead");
  assert.ok(await engine.getProgramme(used.id), "the refused programme must still exist");
});

test("pausing a product works in an OPEN catalogue too", async () => {
  // `promotable: false` used to be read only in curated mode, so a brand on an
  // open catalogue had no way to take one item off without inventing an
  // exclusion reason for it. A pause is not an accusation about the product.
  promo.__resetPromotable();
  const nowISO = "2026-08-25T10:00:00.000Z";
  await promo.setPolicy({ brandId: "b_open", mode: "open_catalogue", nowISO });
  const p = await promo.saveProduct({
    brandId: "b_open", name: "Widget", url: "https://x.test/w",
    offer: { pricePence: 10_000, cogsPence: 2_000, fulfilmentPence: 0, paymentFeePence: 0, taxPence: 0, returnsAllowancePct: 0, otherVariablePence: 0, minProtectedMarginPence: 1_000 },
    nowISO,
  });
  const policy = await promo.getPolicy("b_open", nowISO);
  assert.equal(promo.brandAllows(p, policy).ok, true, "an open catalogue lists it by default");

  const paused = await promo.setProductPaused({ brandId: "b_open", productId: p.id, paused: true, nowISO });
  assert.equal(paused.paused, true);
  assert.equal(paused.promotable, true, "pause must not touch the curated switch — they mean different things");
  const verdict = promo.brandAllows(paused, policy);
  assert.equal(verdict.ok, false, "a paused product must be closed in an open catalogue as well");
  assert.match(verdict.reason, /paused/i);
  assert.doesNotMatch(verdict.reason, /excluded/i, "a pause must not read as an accusation about the product");

  // Another brand cannot pause it.
  assert.equal(await promo.setProductPaused({ brandId: "someone_else", productId: p.id, paused: true, nowISO }), null);
});

test("a claimed product cannot be deleted out from under the link", async () => {
  promo.__resetPromotable();
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";
  await promo.setPolicy({ brandId: "b_cat", mode: "open_catalogue", nowISO });
  const offer = { pricePence: 10_000, cogsPence: 2_000, fulfilmentPence: 0, paymentFeePence: 0, taxPence: 0, returnsAllowancePct: 0, otherVariablePence: 0, minProtectedMarginPence: 1_000 };
  const free = await promo.saveProduct({ brandId: "b_cat", name: "Untouched", url: "https://x.test/a", offer, nowISO });
  const taken = await promo.saveProduct({ brandId: "b_cat", name: "Claimed", url: "https://x.test/b", offer, nowISO });

  const cr = await engine.upsertCreator({ name: "K", email: "k@example.com", tier: "micro", followers: 0, nowISO });
  const pol = await promo.getPolicy("b_cat", nowISO);
  const claim = await promo.claimProduct({ creatorId: cr.id, product: taken, policy: pol, brandName: "Cat Ltd", nowISO });
  assert.equal(claim.ok, true, `claim failed: ${claim.ok === false ? claim.reason : ""}`);

  assert.equal((await promo.deleteProduct({ brandId: "b_cat", productId: free.id })).ok, true);
  const refused = await promo.deleteProduct({ brandId: "b_cat", productId: taken.id });
  assert.equal(refused.ok, false);
  assert.equal(refused.claimed, true);
  assert.match(refused.reason, /Pause it instead/i);
  assert.ok(await promo.getProduct(taken.id), "the refused product must still exist");

  // And a different brand cannot delete it either.
  assert.equal((await promo.deleteProduct({ brandId: "not_mine", productId: taken.id })).ok, false);
});

// ---------------------------------------------------------------------------
// A programme the brand created by hand had no way to reach a creator.
//
// Reported from the live dashboard, with the count on screen: "Your programmes
// (4)" — SHARE2EARN · MarketWar (Starter), MarketWar (brand), SHARE2EARN ·
// MarketWar (Growth), SHARE2EARN · MartketWar (Scale) — while the partner claim
// shelf offered six things, none of which was the brand-scope one.
//
// Three of the four were minted by `claimProduct` and each has a product card,
// so a creator can find them. The fourth was typed into the create form on the
// Partner Network screen, had no product behind it, and discovery lists
// PRODUCTS. It was invisible to every creator on the platform, and the only way
// in was the brand pressing "Subscribe partner" for somebody by hand.
// ---------------------------------------------------------------------------
test("a hand-created programme is discoverable, and its auto-minted siblings are not listed twice", async () => {
  promo.__resetPromotable();
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";
  const brandId = "b_four";
  await promo.setPolicy({ brandId, mode: "open_catalogue", nowISO });

  const offer = { pricePence: 4_900, cogsPence: 500, fulfilmentPence: 0, paymentFeePence: 0, taxPence: 0, returnsAllowancePct: 0, otherVariablePence: 0, minProtectedMarginPence: 500 };
  const product = await promo.saveProduct({ brandId, name: "MarketWar (Growth)", url: "https://mw.test/growth", offer, nowISO });

  // The one somebody typed in: whole-brand scope, no product behind it.
  await engine.createProgramme({
    brandId, brandName: "MarketWar", name: "MarketWar", scope: "brand", target: "MarketWar",
    product: "MarketWar", description: "Promote the whole brand", destinationUrl: "https://mw.test", nowISO,
  });

  // And the one a claim mints, which the product card already covers.
  const cr = await engine.upsertCreator({ name: "C", email: "c4@example.com", tier: "micro", followers: 0, nowISO });
  const pol = await promo.getPolicy(brandId, nowISO);
  assert.equal((await promo.claimProduct({ creatorId: cr.id, product, policy: pol, brandName: "MarketWar", nowISO })).ok, true);
  assert.equal((await engine.listProgrammes(brandId)).length, 2, "one typed in, one minted by the claim");

  const joinable = await promo.claimableProgrammes(brandId, pol);
  assert.deepEqual(joinable.map((g) => g.name), ["MarketWar"], "the hand-created one must be joinable, the minted one must not be listed twice");
  assert.equal(joinable[0].scope, "brand");

  // And it reaches cross-brand discovery, which is where a new creator looks.
  const brands = await promo.discoverable();
  const mine = brands.find((b) => b.brandId === brandId);
  assert.ok(mine, "the brand must appear in discovery");
  assert.equal(mine.programmes.length, 1);
  assert.equal(mine.products.length, 1, "the product is still listed on its own card");
});

test("a programme with nowhere to send traffic is never offered", async () => {
  // A tracked code pointing at nothing is a dead link on somebody's post — a
  // worse outcome than not being listed.
  promo.__resetPromotable();
  engine.__resetCreatorEngine?.();
  const nowISO = "2026-08-25T10:00:00.000Z";
  await promo.setPolicy({ brandId: "b_nodest", mode: "open_catalogue", nowISO });
  await engine.createProgramme({ brandId: "b_nodest", brandName: "N", name: "No destination", scope: "brand", target: "N", product: "N", description: "d", nowISO });
  const pol = await promo.getPolicy("b_nodest", nowISO);
  assert.deepEqual(await promo.claimableProgrammes("b_nodest", pol), []);

  // A paused one is not offered either, and mission-only brands offer nothing.
  const live = await engine.createProgramme({ brandId: "b_nodest", brandName: "N", name: "Live", scope: "brand", target: "L", product: "L", description: "d", destinationUrl: "https://n.test", nowISO });
  assert.equal((await promo.claimableProgrammes("b_nodest", pol)).length, 1);
  await engine.setProgrammeActive(live.id, false, nowISO);
  assert.deepEqual(await promo.claimableProgrammes("b_nodest", pol), [], "a paused programme must leave discovery");

  await engine.setProgrammeActive(live.id, true, nowISO);
  const missionOnly = await promo.setPolicy({ brandId: "b_nodest", mode: "mission_only", nowISO });
  assert.deepEqual(await promo.claimableProgrammes("b_nodest", missionOnly), [], "a mission-only brand offers nothing self-serve");
});

// ---------------------------------------------------------------------------
// A payment that persisted nowhere must never be acknowledged.
//
// Reported as "stripe webhook is not working", with Stripe showing the endpoint
// Active and 246 events delivered. Both were true, and that was the problem.
//
// Without Firebase Admin, `applyWebhookOutcome` fell through to an in-memory Map
// that dies with the serverless invocation — and returned `applied: true` with
// the words "Credited N ACUs". The route then answered 200. So on a deployment
// where Admin is not initialising, which is the state this platform has actually
// been in, a real payment produced: a green delivery in Stripe, a log line
// saying the credit succeeded, and nothing whatsoever in the customer's account.
//
// A 200 is the instruction NOT to retry. The credit was not delayed, it was
// thrown away with a receipt.
// ---------------------------------------------------------------------------
test("in production, a credit with no durable store is refused so Stripe retries", async () => {
  const w = await import("../src/backend/wallet.ts");
  const outcome = {
    handled: true, action: "allocate_acus", eventId: "evt_no_store_1", planId: "growth",
    ledgerEntry: { direction: "credit", amountAcu: 980, reason: "test" },
  };

  const wasProd = process.env.NODE_ENV;
  try {
    // Development / demo: the in-memory path is deliberately unchanged, because
    // the zero-config rule applies and no real money exists there.
    process.env.NODE_ENV = "development";
    const dev = await w.applyWebhookOutcome("org_dev", outcome);
    assert.equal(dev.applied, true, "demo mode must keep working with no keys");
    assert.notEqual(dev.retriable, true);

    // Production with no Admin: refuse, and say it is retriable.
    process.env.NODE_ENV = "production";
    const prod = await w.applyWebhookOutcome("org_prod", { ...outcome, eventId: "evt_no_store_2" });
    assert.equal(prod.applied, false, "a credit that persists nowhere must not report success");
    assert.equal(prod.retriable, true, "the payment is real — it has to be retried, not dropped");
    assert.match(prod.reason, /Firebase Admin is not configured/i);
    assert.match(prod.reason, /Stripe will retry/i);
    assert.doesNotMatch(prod.reason, /Credited/, "the old path said 'Credited' for a credit that never existed");
  } finally {
    process.env.NODE_ENV = wasProd;
  }
});

test("the webhook route answers 500 on a retriable failure, not 200", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
  // A 200 tells Stripe to stop retrying. The old code returned one no matter
  // what happened to the wallet, and its own comment said "Stripe would retry"
  // — which a 200 is the instruction not to do.
  assert.match(src, /if \(res\.retriable\)/, "the route must act on a retriable failure");
  assert.match(src, /status: 500/, "a retriable failure has to be a 500 so Stripe redelivers");
  assert.doesNotMatch(src, /Never fail the webhook on a wallet hiccup/, "the reasoning that produced the bug must not survive the fix");
  // The catch must not swallow a storage fault into a 200 either.
  const catchBlock = src.slice(src.indexOf("} catch (e) {"), src.indexOf("// Automatic revenue attribution"));
  assert.match(catchBlock, /status: 500/, "an exception in the wallet write must not be acknowledged as delivered");
});

// ---------------------------------------------------------------------------
// The webhook host is derived, not typed.
//
// `MAIN_DOMAIN` was the literal "marketwaros.com" — the apex — while the
// deployment serves www. Stripe does not follow redirects, so 246 events were
// recorded against an endpoint that never reached the application. The literal
// was then copied into five documents, each instructing the owner to configure
// the one host that could not work.
// ---------------------------------------------------------------------------
test("the Stripe endpoint host comes from config or the request, never a bare guess", async () => {
  const { readFileSync } = await import("node:fs");
  const sb = await import("../src/backend/stripe-billing.ts");

  // Overridable, so nobody has to edit source to move a domain.
  assert.match(readFileSync(new URL("../src/backend/stripe-billing.ts", import.meta.url), "utf8"), /process\.env\.MW_SITE_HOST/);

  // A pasted value usually carries a scheme and a trailing slash, and a URL with
  // two schemes in it fails silently rather than loudly.
  assert.equal(sb.webhookEndpointUrl("https://example.com/"), "https://example.com/api/webhooks/stripe");
  assert.equal(sb.webhookEndpointUrl("http://EXAMPLE.com"), "https://EXAMPLE.com/api/webhooks/stripe");
  assert.equal(sb.webhookEndpointUrl(""), `https://${sb.MAIN_DOMAIN}/api/webhooks/stripe`);
  assert.doesNotMatch(sb.webhookEndpointUrl("https://x.test"), /https:\/\/https/);

  // The route that tells an operator what to configure must read its own host
  // rather than print the constant that caused this.
  const route = readFileSync(new URL("../src/app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
});

test("no runbook still points Stripe at a host the code does not name", async () => {
  const { readFileSync } = await import("node:fs");
  const sb = await import("../src/backend/stripe-billing.ts");
  // REQUIREMENTS-COVERAGE is archaeology and is deliberately not edited in
  // place, so it is excluded — §102 there records the correction instead.
  for (const doc of ["DEPLOYMENT.md", "GO-LIVE.md", "LAUNCH-BLOCKERS.md", "LAUNCH-READINESS.md"]) {
    const text = readFileSync(new URL(`../docs/${doc}`, import.meta.url), "utf8");
    for (const url of text.match(/https:\/\/[a-z0-9.-]+\/api\/webhooks\/stripe/g) || []) {
      const host = url.slice("https://".length).split("/")[0];
      assert.equal(host, sb.MAIN_DOMAIN, `${doc} tells Stripe to post to ${host}, which is not the host the code serves (${sb.MAIN_DOMAIN})`);
    }
  }
});

// ---------------------------------------------------------------------------
// A machine lane matched on the PATH refused the humans who share it.
//
// Surfaced by opening a webhook URL in a browser and getting: "This path is a
// machine lane and the request carried no provider signature." That one is
// expected. Pulling the thread found three real failures behind the same rule:
//
//   1. /api/inbound is BOTH the mail provider's delivery endpoint AND what
//      /dashboard/inbox reads and writes through. Matched on the prefix alone,
//      the lane refused every request the dashboard made. The whole page was
//      dead in enforced mode.
//   2. Meta's webhook verification is a GET carrying hub.verify_token and no
//      signature header, so it was refused before it could reach the check that
//      authenticates it. The Meta webhook could never be verified.
//   3. The Stripe route's own diagnostic GET was unreachable for the same
//      reason — while we were using it to diagnose the Stripe webhook.
//
// The module's doctrine says every request must be attributable "either to a
// verified human session or to a machine we invited". This branch only ever
// answered the second half.
// ---------------------------------------------------------------------------
test("a signed-in person is not refused just for using a path a machine also uses", async () => {
  const binding = "bind";
  const now = 1_800_000_000_000;
  const base = { binding, now, env: { HUMAN_CHECK_SECRET: "x" } };
  const session = await gate.issueSession(binding, now);

  // The dashboard inbox: a real session, on the mail provider's own path.
  const read = await gate.decide({ ...base, path: "/api/inbound", cookie: session.value, method: "GET" });
  assert.equal(read.allow, true, "the inbox page was refused by a rule about the mail provider");
  assert.equal(read.lane, "human", "an attributable person must be judged as a person, not as a failed machine");

  const write = await gate.decide({ ...base, path: "/api/inbound", cookie: session.value, method: "POST" });
  assert.equal(write.allow, true, "marking a message read is the same person on the same path");

  // A Firebase bearer token counts too — that is how authedFetch identifies.
  assert.equal((await gate.decide({ ...base, path: "/api/inbound", cookie: "", authorization: "Bearer id-token", method: "POST" })).allow, false,
    "a bearer alone is not a human session — it falls through and is judged, not waved past");

  // AND THE REFUSAL STILL STANDS for what it was written for: an anonymous
  // script with no session, no bearer and no signature.
  const script = await gate.decide({ ...base, path: "/api/inbound", cookie: "", method: "POST" });
  assert.equal(script.allow, false, "an uninvited script must still have no lane");
  assert.equal(script.lane, "machine");
  assert.match(script.reason, /no provider signature/i);

  // A stale session on a machine path is refused as a stale session — by the
  // human evaluation, with a reverify action — rather than as a missing
  // signature, which would send the person to fix the wrong thing.
  const stale = await gate.decide({ ...base, path: "/api/inbound", cookie: (await gate.issueSession(binding, now - gate.SESSION_TTL_MS - 60_000)).value, method: "POST" });
  assert.equal(stale.allow, false);
  assert.equal(stale.lane, "human", "the reason given must be the real one");
});

// ---------------------------------------------------------------------------
// "never send any emails" — and the screen could not say why.
//
// `sendEmail` returns a failure CATEGORY and a detail. The audit route carried
// both back. The page that rendered it said, for every one of them: "we could
// not email you a copy just now." So three different problems with three
// different fixes — nothing configured, the server refusing the credentials, a
// suppressed address — were indistinguishable to the only person looking.
// ---------------------------------------------------------------------------
test("a failed send names which problem it was, without showing a stranger our config", async () => {
  const sf = await import("../src/shared/send-failure.ts");

  // Every category says something DIFFERENT. That is the whole point: a person
  // reading these must never have to ask which one it was.
  const notes = ["not_configured", "provider", "hygiene", "halted", "unknown"].map((c) => sf.publicSendFailure(c));
  assert.equal(new Set(notes).size, notes.length, "two categories read the same, so the message identifies nothing");

  assert.match(sf.publicSendFailure("not_configured"), /no mail server is set up/i);
  assert.match(sf.publicSendFailure("provider"), /refused/i);
  assert.match(sf.publicSendFailure("hygiene"), /bounced or unsubscribed/i);

  // A member of the public typed their website into a free tool. They get a
  // reason, never our sending host, account name or an SMTP transcript.
  for (const c of ["not_configured", "provider", "hygiene", "halted", "unknown", "garbage", null, 7]) {
    assert.doesNotMatch(sf.publicSendFailure(c), /SMTP|password|credential|smtp_|whsec|@/i, `"${c}" leaked configuration to a visitor`);
  }

  // Anything unrecognised degrades to a sentence rather than throwing or
  // printing the raw value.
  assert.equal(sf.sendFailureOf(undefined), "unknown");
  assert.equal(sf.sendFailureOf("provider"), "provider");
  assert.equal(sf.sendFailureOf("PROVIDER"), "unknown", "the category is matched exactly, never case-folded into a guess");

  // The operator gets somewhere to go, and it is the endpoint that actually
  // opens a connection rather than a runbook nobody has open.
  assert.match(sf.operatorFix("not_configured"), /SMTP_HOST \+ SMTP_USER \+ SMTP_PASS/);
  assert.match(sf.operatorFix("provider"), /health\/email/);
  assert.match(sf.operatorFix("hygiene"), /working as intended/i);
});

test("the audit page renders the reason instead of one sentence for every failure", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/components/FreeAudit.tsx", import.meta.url), "utf8");
  assert.match(page, /report\.emailNote/, "the page must render the reason the route sent it");
  assert.match(page, /emailFailure\?: string/, "the category has to survive the type as well as the render");
  const route = readFileSync(new URL("../src/app/api/audit/route.ts", import.meta.url), "utf8");
});

// ---------------------------------------------------------------------------
// "Authenticated" is not "sending".
//
// The email health probe stopped at AUTH and returned the verdict "SENDING.
// Connected and authenticated against the mail server just now." The owner read
// that while no email had ever arrived. It was not false — the password IS
// accepted — it was overclaiming: authenticating proves nothing about whether
// the server will accept a message FROM that address TO that recipient. A relay
// that authenticates you and then refuses RCPT TO for anything outside its own
// domain is the commonest way a correctly configured client sends nothing, and
// this probe could not see it.
// ---------------------------------------------------------------------------
test("the email probe proves an envelope, not just a password", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/api/health/email/route.ts", import.meta.url), "utf8");

  // The conversation continues past AUTH into a real envelope...
  for (const stage of ["mail-from", "rcpt-to", "rset"]) {
    assert.ok(src.includes(`stage === "${stage}"`), `the probe never reaches ${stage}, so it cannot know whether a message would be accepted`);
  }
  assert.match(src, /send\("RSET"\)/, "the transaction must be abandoned — a health check may never deliver a message");
  assert.doesNotMatch(src, /send\("DATA"\)/, "a probe that sent a body would be sending mail, not testing it");

  // ...and the verdict no longer claims sending on the strength of a password.
  assert.doesNotMatch(src, /"SENDING\. Connected and authenticated against the mail server just now\."/,
    "the overclaiming verdict must not survive the fix");
  assert.match(src, /accepted an envelope just now/, "the verdict has to name what was actually proved");

  // The two refusals that look identical from outside are told apart, because
  // they have different fixes: the SENDER address versus the RECIPIENT.
  assert.match(src, /probe\?\.stage === "rcpt-to"/);
  assert.match(src, /probe\?\.stage === "mail-from"/);

  // And the reason an authenticated relay still delivers nothing is checked
  // rather than left for somebody to guess at.
  assert.match(src, /resolveTxt\(fromDomain\)/, "SPF on the From domain is the usual cause and must be read, not assumed");
  assert.match(src, /_dmarc\./);
  assert.match(src, /cannot confirm the relay's sending IP is inside the SPF record/,
    "the check must say what it does NOT prove — an SPF record that omits the relay looks identical to one that includes it");
});

// ---------------------------------------------------------------------------
// The health check tested a different envelope sender from the real send.
//
// The probe reported "SENDING. Authenticated AND the server accepted an
// envelope just now (info@marketwaros.com → …)" while no mail had ever arrived.
// Both facts were true, because `sendViaSmtp` does NOT put the visible From in
// MAIL FROM — it puts the bounce RETURN-PATH there, so that bounce
// notifications come to us instead of into the sender's inbox. Many relays only
// accept a MAIL FROM that is the authenticated mailbox or a real alias, and
// `bounce@…` is usually neither.
//
// So every real send could fail at a step the diagnostic never performed. A
// check that tests a different path from the real one is worse than no check:
// it rules out the actual cause.
// ---------------------------------------------------------------------------
test("a relay that refuses the bounce return-path still gets the message", async () => {
  const { fakeSmtp } = await import("./helpers/fake-smtp.mjs");
  const email = await import("../src/backend/email.ts");

  // A relay that behaves like Hostinger: the authenticated mailbox may send,
  // `bounce@…` may not. The bounce address is STATED here, because the default
  // is now empty — an envelope sender nobody configured was the fault, not a
  // feature, and the downgrade path this test guards only exists for an address
  // somebody chose.
  const savedBounce = process.env.MW_BOUNCE_ADDRESS;
  process.env.MW_BOUNCE_ADDRESS = "bounce@marketwaros.com";
  const server = fakeSmtp({ rejectSenders: new Set(["bounce@marketwaros.com"]) });
  const port = await server.listen();
  const saved = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.EMAIL_FROM, tls: process.env.NODE_TLS_REJECT_UNAUTHORIZED };
  // The fake server's STARTTLS cert is self-signed, as in tests/smtp-batch.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = "appuser@marketwaros.com";
  process.env.SMTP_PASS = "pw";
  process.env.EMAIL_FROM = "MarketWar OS <info@marketwaros.com>";

  try {
    const sent = await email.sendEmail({
      to: "someone@example.com",
      subject: "Your audit",
      html: "<p>report</p>",
      transactional: true,
    });

    // THE POINT: bounce attribution is worth having, and it is not worth more
    // than the message. Before this, the 553 at MAIL FROM ended the send.
    assert.equal(sent.ok, true, `the message was lost to a refused return-path: ${sent.detail}`);
    assert.equal(server.received.length, 1, "nothing reached the server");
    assert.equal(server.received[0].to, "someone@example.com");
    assert.equal(server.received[0].from, "info@marketwaros.com",
      "the retry must use the visible From — the address the relay actually accepts");
  } finally {
    await server.close();
    process.env.SMTP_HOST = saved.host; process.env.SMTP_PORT = saved.port;
    process.env.SMTP_USER = saved.user; process.env.SMTP_PASS = saved.pass;
    if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from;
    if (saved.tls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = saved.tls;
    if (savedBounce === undefined) delete process.env.MW_BOUNCE_ADDRESS; else process.env.MW_BOUNCE_ADDRESS = savedBounce;
  }
});

// ---------------------------------------------------------------------------
// THREE ADDRESSES, NONE OF THEM THE SAME.
//
// The owner's report was "email never been delivered, ever", and every check
// built to answer it came back healthy. It took the owner explaining their own
// mail setup to see it: `appuser@` is the account the host creates, `info@` is
// the address the business puts its name to. So one send carried
//
//   AUTH LOGIN   appuser@marketwaros.com   the mailbox that exists
//   MAIL FROM    bounce@marketwaros.com    a default invented in this codebase
//   From:        info@marketwaros.com      what the recipient would have seen
//
// The relay accepted it and issued a queue id — which is why every diagnostic
// passed — and nothing arrived. Nothing bounced either, because the Return-Path
// named a mailbox nobody had ever created: THE DELIVERY FAILURE DESTROYED ITS
// OWN EVIDENCE, and that is why this survived four rounds of investigation.
//
// These tests drive the REAL sender against a real socket and read the bytes on
// the wire, because the previous three attempts at this each built a better
// probe and each probe tested a path the sender does not take.
// ---------------------------------------------------------------------------
test("the envelope sender is a mailbox that exists, not one invented in code", async () => {
  const { resolveSender, alignmentRemedy } = await import("../src/shared/sender-identity.ts");

  // Production's exact shape.
  const live = resolveSender({ from: "MarketWar OS <info@marketwaros.com>", authUser: "appuser@marketwaros.com", bounce: "" });
  assert.equal(live.envelopeFrom, "appuser@marketwaros.com",
    "with no configured bounce address the envelope must be the account, which exists by definition");
  assert.equal(live.envelopeSource, "authenticated-account");
  assert.equal(live.headerFrom, "MarketWar OS <info@marketwaros.com>",
    "the visible From is the owner's decision and must never be rewritten");
  assert.equal(live.senderHeader, "appuser@marketwaros.com",
    "RFC 5322 §3.6.2: when From is not the submitter, Sender: names the submitter");
  assert.equal(live.aligned, false);
  assert.match(alignmentRemedy(live), /SMTP_USER to info@marketwaros\.com/,
    "the remedy must name the one change that removes the mismatch entirely");

  // A stated bounce address is still honoured — nothing delivered is withdrawn.
  const withBounce = resolveSender({ from: "info@marketwaros.com", authUser: "appuser@marketwaros.com", bounce: "b.veryx.abc.def@bounces.marketwaros.com" });
  assert.equal(withBounce.envelopeFrom, "b.veryx.abc.def@bounces.marketwaros.com");
  assert.equal(withBounce.envelopeSource, "configured-bounce");

  // The state to aim at: one address, three roles, no Sender: header and no
  // remedy to print.
  const aligned = resolveSender({ from: "MarketWar OS <info@marketwaros.com>", authUser: "info@marketwaros.com", bounce: "" });
  assert.equal(aligned.aligned, true);
  assert.equal(aligned.envelopeFrom, "info@marketwaros.com");
  assert.equal(aligned.senderHeader, "", "Sender: equal to From is a spam signal, not a nicety");
  assert.equal(alignmentRemedy(aligned), "");

  // No account at all (an HTTP provider): fall back to the From rather than
  // inventing anything.
  const noAccount = resolveSender({ from: "info@marketwaros.com", authUser: "", bounce: "" });
  assert.equal(noAccount.envelopeFrom, "info@marketwaros.com");
  assert.equal(noAccount.senderHeader, "");
});

test("a real send puts the account on the envelope and declares it in Sender:", async () => {
  const { fakeSmtp } = await import("./helpers/fake-smtp.mjs");
  const email = await import("../src/backend/email.ts");

  const server = fakeSmtp({});
  const port = await server.listen();
  const saved = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.EMAIL_FROM, tls: process.env.NODE_TLS_REJECT_UNAUTHORIZED, bounce: process.env.MW_BOUNCE_ADDRESS };
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = "appuser@marketwaros.com";
  process.env.SMTP_PASS = "pw";
  process.env.EMAIL_FROM = "MarketWar OS <info@marketwaros.com>";
  delete process.env.MW_BOUNCE_ADDRESS;

  try {
    const sent = await email.sendEmail({ to: "someone@example.com", subject: "Your audit", html: "<p>report</p>", transactional: true });
    assert.equal(sent.ok, true, `the send failed: ${sent.detail}`);
    assert.equal(server.received.length, 1, "nothing reached the server");

    const [msg] = server.received;
    // THE BYTES ON THE WIRE, not a re-derivation of what they ought to be.
    assert.equal(msg.from, "appuser@marketwaros.com",
      "MAIL FROM must be the authenticated account — bounce@ was never a real mailbox");
    assert.match(msg.body, /^From: MarketWar OS <info@marketwaros\.com>$/m,
      "the business's own address stays on the message");
    assert.match(msg.body, /^Sender: appuser@marketwaros\.com$/m,
      "a From that is not the submitter, with no Sender: header, reads as a forgery");

    // And it is written down, so the next 'it never arrived' is answerable
    // without asking the owner for another screenshot.
    const ledger = await import("../src/backend/send-ledger.ts");
    const rows = await ledger.recentSends(5);
    const row = rows.find((r) => r.to === "someone@example.com");
    assert.ok(row, "the send left no record");
    assert.equal(row.envelopeFrom, "appuser@marketwaros.com");
    assert.equal(row.headerFrom, "MarketWar OS <info@marketwaros.com>");
  } finally {
    await server.close();
    process.env.SMTP_HOST = saved.host; process.env.SMTP_PORT = saved.port;
    process.env.SMTP_USER = saved.user; process.env.SMTP_PASS = saved.pass;
    if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from;
    if (saved.tls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = saved.tls;
    if (saved.bounce === undefined) delete process.env.MW_BOUNCE_ADDRESS; else process.env.MW_BOUNCE_ADDRESS = saved.bounce;
  }
});

test("aligning the account with the From removes the Sender header entirely", async () => {
  const { fakeSmtp } = await import("./helpers/fake-smtp.mjs");
  const email = await import("../src/backend/email.ts");

  const server = fakeSmtp({});
  const port = await server.listen();
  const saved = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.EMAIL_FROM, tls: process.env.NODE_TLS_REJECT_UNAUTHORIZED, bounce: process.env.MW_BOUNCE_ADDRESS };
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  // The owner's fix: log in as the address you send as.
  process.env.SMTP_USER = "info@marketwaros.com";
  process.env.SMTP_PASS = "pw";
  process.env.EMAIL_FROM = "MarketWar OS <info@marketwaros.com>";
  delete process.env.MW_BOUNCE_ADDRESS;

  try {
    const sent = await email.sendEmail({ to: "someone@example.com", subject: "Your audit", html: "<p>report</p>", transactional: true });
    assert.equal(sent.ok, true, `the send failed: ${sent.detail}`);
    const msg = server.received[server.received.length - 1];
    assert.equal(msg.from, "info@marketwaros.com", "one address in all three roles");
    assert.doesNotMatch(msg.body, /^Sender: /m,
      "with the account and the From the same mailbox there is no second party to declare");
  } finally {
    await server.close();
    process.env.SMTP_HOST = saved.host; process.env.SMTP_PORT = saved.port;
    process.env.SMTP_USER = saved.user; process.env.SMTP_PASS = saved.pass;
    if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from;
    if (saved.tls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = saved.tls;
    if (saved.bounce === undefined) delete process.env.MW_BOUNCE_ADDRESS; else process.env.MW_BOUNCE_ADDRESS = saved.bounce;
  }
});

test("a VERP bounce address is only used on a host that can receive one", async () => {
  const reply = await import("../src/backend/reply-routing.ts");
  const saved = process.env.MW_BOUNCE_HOST;
  try {
    delete process.env.MW_BOUNCE_HOST;
    assert.equal(reply.bounceHostConfigured(), false,
      "the default bounce host is a subdomain nobody has created — issuing envelopes on it loses every failure notice");
    process.env.MW_BOUNCE_HOST = "bounces.marketwaros.com";
    assert.equal(reply.bounceHostConfigured(), true);
    // The PARSER keeps its default, because addresses issued before this change
    // are already in flight and must still be recognised on the way back.
    assert.ok(reply.parseBounceAddress(reply.bounceAddressFor("veryx", "a@b.com")),
      "an address this code issues must be one this code can read back");
  } finally {
    if (saved === undefined) delete process.env.MW_BOUNCE_HOST; else process.env.MW_BOUNCE_HOST = saved;
  }
});

test("the health check probes the envelope sender a real send uses", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/api/health/email/route.ts", import.meta.url), "utf8");
  assert.match(src, /bounceReturnPath\(\)/, "the probe must test the return-path, not just EMAIL_FROM");
  assert.match(src, /resolveSender\(/,
    "the probe and the sender must resolve the envelope with the SAME function, or they drift apart again");
  assert.match(src, /realEnvelopeFrom/, "the real envelope sender has to be what the first probe uses");
  // And when the return-path is refused it probes the From as well, because the
  // DIFFERENCE between the two answers is the diagnosis.
  assert.match(src, /probe\.stage === "mail-from" && realEnvelopeFrom !== fromAddr/);
  assert.match(src, /THIS IS THE CAUSE/, "a check that identifies the cause should say so outright");
});

// ---------------------------------------------------------------------------
// The probe was the wrong instrument.
//
// Three rounds of this endpoint reported healthy while no mail arrived, and each
// round I built a better PROBE: connect, then authenticate, then an envelope,
// then the REAL envelope sender. Every one of them reimplemented a piece of
// SMTP, so every one could differ from the code that actually sends — which is
// precisely the fault the third round found in the second.
//
// `?send=` calls sendEmail itself, so the answer covers the whole real path:
// the pool, the hygiene and suppression checks, the emergency stop, the SMTP
// client, the return-path fallback.
// ---------------------------------------------------------------------------
test("the real-send test uses the real code path, and is not an open relay", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/api/health/email/route.ts", import.meta.url), "utf8");

  // It calls the shipped sender, not another hand-rolled conversation.
  assert.match(src, /const \{ sendEmail \} = await import\("@\/backend\/email"\)/,
    "a test that reimplements sending can differ from sending, which is the whole bug");
  assert.match(src, /transactional: true/, "a test the operator asked for by name must not be silenced by a marketing pause");

  // AND IT CANNOT BE USED TO MAIL A STRANGER. The first version of this gate
  // demanded an admin session or the scheduler bearer — both HEADERS, which a
  // browser address bar cannot send, so it was unsatisfiable by the only person
  // it meant to admit, and a secret in the query string is forbidden outright.
  // The RECIPIENT is constrained instead: the sending account's own mailbox or
  // an address the owner listed. Nobody can mail a stranger through it whatever
  // they type, and testing your own deployment needs no credential.
  const branch = src.slice(src.indexOf("const sendTo ="), src.indexOf("const vars ="));
  assert.match(branch, /PLATFORM_ADMIN_EMAILS/);
  assert.match(branch, /allowedWithoutCredential/);
  assert.match(branch, /cronAuthorised\(req\)/, "a credential must still widen it for anyone who has one");
  assert.match(branch, /requireAuth\(req, \{ scope: "platform_admin" \}\)/);
  assert.ok(branch.indexOf("allowedWithoutCredential") < branch.indexOf("sendEmail"),
    "the recipient check has to happen BEFORE anything is sent");
  assert.match(branch, /rateLimit\(clientKey\(req, "email-send-test"\)/, "a real send spends the allowance and the domain's reputation");
  // The refusal has to say what WOULD work, or it is another dead end.
  assert.match(branch, /allowedRightNow/);
  assert.match(branch, /\?send=self/);

  // Slow external work needs reserved time, or the diagnostic dies mid-request
  // and reports nothing — which is worse than reporting the wrong thing.
  assert.match(src, /export const maxDuration = 30;/);
});

test("DKIM is checked, because 'delivered to spam' reads exactly like 'never sent'", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/api/health/email/route.ts", import.meta.url), "utf8");
  assert.match(src, /_domainkey\.\$\{fromDomain\}/, "SPF and DMARC passing while DKIM is absent is the classic spam-folder combination");
  assert.match(src, /hostingermail1/, "the provider actually in use has to be among the selectors asked for");
  // And it must not overclaim: selectors cannot be enumerated, so finding none
  // is suggestive rather than proof.
  assert.match(src, /this proves nothing/, "a check that cannot be exhaustive must say so");
});

// ---------------------------------------------------------------------------
// Nothing recorded that a message had ever been sent.
//
// "never send any emails" took five rounds to answer, and the reason it took
// five is that every check built to answer it measured the CONFIGURATION —
// credentials, envelope, DNS — while nothing anywhere recorded that a message
// had existed. The only trace was `recordNodeSend`: an in-memory counter, per
// serverless instance, per day, that dies with the invocation. The provider's
// own queue id arrived on the `250 ... queued as ...` line and was discarded.
//
// So "did Tuesday's audit email go out?" had no answer in the system, and the
// honest reply was a request for another screenshot.
// ---------------------------------------------------------------------------
test("every send attempt is written down, and a failed write never stops the mail", async () => {
  const ledger = await import("../src/backend/send-ledger.ts");
  ledger.__resetSendLedger();

  await ledger.recordAttempt({ to: "a@example.com", subject: "One", providerId: "MSG1", node: "primary", ok: true, failure: "", detail: "", at: "2026-08-25T10:00:00.000Z" });
  await ledger.recordAttempt({ to: "b@example.com", subject: "Two", providerId: "", node: "primary", ok: false, failure: "provider", detail: "553 refused", at: "2026-08-25T10:01:00.000Z" });

  const rows = await ledger.recentSends(10);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].to, "b@example.com", "newest first — the last thing that happened is the thing being asked about");
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].detail, "553 refused", "the provider's own words, not a paraphrase");
  assert.equal(rows[1].providerId, "MSG1", "the queue id is the whole point — it is what a support desk can act on");

  // A row written before a field existed must not take down the page somebody is
  // using to find out why their mail is missing.
  assert.equal(ledger.attemptFromStored(null), null);
  assert.equal(ledger.attemptFromStored({ subject: "no recipient" }), null);
  const partial = ledger.attemptFromStored({ to: "c@example.com", at: "2026-08-25T10:02:00.000Z" });
  assert.equal(partial.ok, false, "an unreadable outcome must not read as a success");
  assert.equal(partial.providerId, "");
});

test("the ledger is wired into both send paths, and cannot fail a send", async () => {
  const { readFileSync } = await import("node:fs");
  const email = readFileSync(new URL("../src/backend/email.ts", import.meta.url), "utf8");
  // Single send: success AND failure both leave a trace. A ledger that only
  // recorded successes would answer "did it send?" with silence either way.
  assert.ok((email.match(/recordAttempt\(\{/g) || []).length >= 3, "both paths and both outcomes must be recorded");
  assert.match(email, /ok: true, failure: "", detail: "", headerFrom:/);
  // Both sender addresses travel with the queue id, because an id alone cannot
  // say WHO the relay thought was sending — which is the question that took a
  // month to answer.
  assert.ok((email.match(/envelopeFrom: identity\.envelopeFrom/g) || []).length >= 2,
    "success and failure both have to record the envelope sender");
  assert.match(email, /ok: false, failure: "provider", detail: smtpError/);
  // Never awaited into the send path: a ledger that could stop a message going
  // out would be worse than no ledger.
  assert.doesNotMatch(email, /await recordAttempt\(/, "the ledger must never be able to block or fail a send");
  assert.match(email, /void recordAttempt\(/);
});

// ---------------------------------------------------------------------------
// Queued by the relay, never delivered — and every check still passed.
//
// `?send=self` returned ok:true with a Postfix queue id (B92FD8E3CF), so the
// relay took the message into its own queue. It never reached the mailbox, on
// the same server, of the account that sent it. Nothing bounced.
//
// The one mismatch every report has shown and none has flagged: the From header
// is <info@marketwaros.com> while the deployment authenticates as
// <appuser@marketwaros.com>. Relays commonly ACCEPT such a message, issue a
// queue id, and drop it AFTER queueing because the account may not send as that
// address — and the bounce goes to the Return-Path, which is usually not a real
// mailbox either. Total silence, while every check reports healthy.
//
// This is not asserted as the cause. It is made TESTABLE: send twice, change
// only the From, compare.
// ---------------------------------------------------------------------------
test("the From header is compared with the account that authenticates", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/api/health/email/route.ts", import.meta.url), "utf8");

  // The three addresses are RECONCILED now rather than printed side by side,
  // and the report carries the owner's remedy instead of an experiment to run.
  assert.match(src, /aligned: identity\.aligned/, "the addresses must be compared, not just both printed");
  assert.match(src, /alignmentRemedy\(identity\)/,
    "a mismatch this consequential has to come with the fix, not be left for somebody to notice in two adjacent fields");
  assert.match(src, /bounceAddressConfigured/,
    "whether the return-path was chosen or invented is the difference between a traceable failure and a silent one");
  // The note must name the EXPERIMENT rather than assert a cause, because five
  // rounds of asserting causes is what made this take five rounds.
  assert.match(src, /\?send=self&from=account/, "the report has to say how to settle it");

  // And the experiment changes exactly one thing.
  assert.match(src, /const askedFrom =/);
  assert.match(src, /\.\.\.\(overrideFrom \? \{ from: `MarketWar OS <\$\{overrideFrom\}>` \} : \{\}\)/,
    "the override must reach sendEmail, or the second send is the same as the first");

  // It cannot be used to forge a sender: the account itself, or its own domain.
  assert.match(src, /askedFrom\.endsWith\(`@\$\{ownDomain\}`\)/);
  assert.match(src, /cannot be used to forge a sender/);
  const branch = src.slice(src.indexOf("const askedFrom ="), src.indexOf("const { sendEmail }"));
  assert.ok(branch.includes("status: 403"), "an address outside the domain has to be refused before anything is sent");
});

// ---------------------------------------------------------------------------
// The free audit was showing the good news.
//
// Reported from the live page. A site scoring 89/100 was shown three findings
// for free: "Served over HTTPS", "Title present (56 chars)", "Mobile viewport
// set" — three things that are FINE — and then asked for an email address to
// see the rest. The page's own promise is to tell somebody what is quietly
// losing them enquiries, and it was answering with a linter's pass list.
//
// The ranking sorted on WEIGHT alone, so the heaviest checks led whether or not
// they had found anything. And two render faults made it worse: the severity
// colours matched "critical/high/medium" against values that are only ever
// "pass/warn/fail", so a broken page looked identical to a healthy one, and the
// icon tested for "good" against "pass", so passes wore a warning triangle.
// ---------------------------------------------------------------------------
const auditCopy = await import("../src/shared/audit-copy.ts");

test("a broken page leads with what is broken, never with what passes", async () => {
  const { crawlSite } = await import("../src/backend/crawler.ts");
  const http = await import("node:http");

  // A page that passes the heavy checks and fails the ones that cost enquiries.
  const bad = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
    <title>A perfectly reasonable title for a business</title></head>
    <body><p>Short.</p></body></html>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(bad); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    const report = await crawlSite(`http://127.0.0.1:${port}/`);
    assert.equal(report.ok, true, `crawl failed: ${report.error}`);

    const rank = (s) => (s === "fail" ? 0 : s === "warn" ? 1 : 2);
    const ranked = [...report.findings].sort((a, b) => rank(a.severity) - rank(b.severity) || b.weight - a.weight);
    const firstThree = ranked.slice(0, 3);
    assert.ok(firstThree.every((f) => f.severity !== "pass"),
      `the free three still lead with passes: ${firstThree.map((f) => `${f.label}=${f.severity}`).join(", ")}`);

    // And the deeper checks exist, because seventeen was not worth an email.
    const labels = new Set(report.findings.map((f) => f.label));
    for (const added of ["Phone number", "Contact route", "Local address", "Local business schema", "Mixed content", "Page weight", "Render-blocking scripts", "Favicon", "Heading structure", "Social profiles", "Copyright year", "www and root both work"]) {
      assert.ok(labels.has(added), `the deeper audit is missing "${added}"`);
    }
    assert.ok(report.findings.length >= 28, `only ${report.findings.length} checks — the page promises a deep read`);

    // This page has no phone, no contact route and almost no text. Each of those
    // is a real answer to "what is quietly losing you enquiries".
    const byLabel = Object.fromEntries(report.findings.map((f) => [f.label, f]));
    assert.equal(byLabel["Contact route"].severity, "fail");
    assert.equal(byLabel["Phone number"].severity, "fail");
    assert.notEqual(byLabel["Content depth"].severity, "pass");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

// ---------------------------------------------------------------------------
// A GO-LIVE INSTRUCTION THAT SATISFIES NOTHING.
//
// The launch check's legal-entity blocker told the owner to set
// NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED_ADDRESS, and read that same name to
// decide whether the blocker cleared. The component that actually prints the
// trader's details reads NEXT_PUBLIC_REGISTERED_ADDRESS.
//
// So following the instruction exactly turned the blocker green while the
// footer still said the trader is not named — on the one finding that exists
// because a UK trader selling to the public is legally required to be
// identified. Nobody would have noticed until it mattered.
//
// The rule: every variable named in a `fix` must be a variable something
// actually reads.
// ---------------------------------------------------------------------------
test("every variable a go-live fix names is one the code actually reads", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { execSync } = await import("node:child_process");
  const check = readFileSync(new URL("../src/backend/launch-check.ts", import.meta.url), "utf8");
  void readdirSync;

  // Every NEXT_PUBLIC_* / SECRET / KEY name that appears inside a fix string.
  const fixes = [...check.matchAll(/fix: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(fixes.length >= 5, "the launch check should carry several fixes");
  const named = new Set();
  for (const fix of fixes) for (const v of fix.match(/\b[A-Z][A-Z0-9_]{6,}\b/g) || []) named.add(v);
  assert.ok(named.size >= 8, `only ${named.size} variables named across the fixes`);

  // THE CORPUS EXCLUDES THIS FILE. The first version of this test grepped all
  // of src/ including launch-check.ts itself, so a fix naming a variable that
  // exists NOWHERE ELSE still matched — inside its own fix string. It passed on
  // the exact defect it was written for. A check must never be able to satisfy
  // itself with its own text.
  const src = execSync("grep -rho --exclude=launch-check.ts '[A-Z][A-Z0-9_]\\{6,\\}' src/ || true", { encoding: "utf8" });
  const readSomewhere = new Set(src.split("\n"));
  const orphans = [...named].filter((v) => !readSomewhere.has(v));
  assert.deepEqual(orphans, [],
    `the launch check tells the owner to set variables nothing reads: ${orphans.join(", ")}`);
});

test("the trader's details clear the blocker only when the footer can print them", async () => {
  const { readFileSync } = await import("node:fs");
  const lc = await import("../src/backend/launch-check.ts");
  const component = readFileSync(new URL("../src/components/LegalEntity.tsx", import.meta.url), "utf8");

  // The names the RENDERER reads are the names the check must accept.
  assert.match(component, /NEXT_PUBLIC_REGISTERED_ADDRESS/);
  assert.match(component, /NEXT_PUBLIC_LEGAL_ENTITY_NAME/);

  const base = {
    VERCEL_ENV: "production",
    STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x",
    ANTHROPIC_API_KEY: "k", NEXT_PUBLIC_LEGAL_ENTITY_NAME: "JNN Groupe Ltd",
  };
  const without = lc.launchReport(lc.readLaunchEnv({ ...base }));
  assert.ok(without.findings.some((x) => x.id === "no-legal-entity"),
    "with no address the trader is not named and that is a blocker");

  // The name the page reads clears it...
  const withRendered = lc.launchReport(lc.readLaunchEnv({ ...base, NEXT_PUBLIC_REGISTERED_ADDRESS: "1 High St, London" }));
  assert.ok(!withRendered.findings.some((x) => x.id === "no-legal-entity"),
    "the address the footer prints must be the address that clears the blocker");

  // ...and so does the older spelling, because somebody may have set it on the
  // strength of the instruction that was wrong.
  const withLegacy = lc.launchReport(lc.readLaunchEnv({ ...base, NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED_ADDRESS: "1 High St, London" }));
  assert.ok(!withLegacy.findings.some((x) => x.id === "no-legal-entity"));
});

// ---------------------------------------------------------------------------
// THE AUDIT PAGE HAS TO SELL, AND EVERY CLAIM ON IT HAS TO BE TRUE.
//
// The page is the front door for organic acquisition, and it was a form with two
// paragraphs of explanation after it. What it can say that no competitor can is
// the CATALOGUE — the named checks, each with the sentence saying what it costs
// — because printing the list is only possible when the list is real.
//
// The moment a marketing page types its own count, it starts drifting from the
// software: a check gets added and the page still says seventeen, or a check
// gets removed and the page keeps promising it. So the count and the list both
// come from the file the report itself reads, and these tests hold that.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// NOBODY BUYS A FOUR-SECOND VIDEO.
//
// Owner's call: "we need between 8, 12 and 15 second and best price on best
// model to be competitive." Neither engine renders 12 or 15 seconds in one
// call — Veo caps at 8, Sora's longest step is 12 — so those lengths are made
// of clips that sum EXACTLY to what is on the button, priced as the sum, on
// whichever configured engine makes them most cheaply.
//
// The failure this must never allow: a fifteen-second ad whose second clip
// never started, delivered as eight seconds at the fifteen-second price. That
// is the fault the whole change exists to remove, so it is guarded here rather
// than in the source text.
// ---------------------------------------------------------------------------
test("a length is made of clips that sum exactly to it, at the sum of their prices", async () => {
  const g = await import("../src/backend/video-gateway.ts");

  assert.deepEqual(g.OFFERED_SECONDS, [8, 12, 15], "four seconds is not a product anybody buys");

  // COVERAGE FIRST, THEN EXACTNESS. The first version of this test skipped
  // every null plan, so a planner that simply gave up passed it — the greedy
  // version strands a 1-, 2- or 3-second tail Veo cannot render and returns
  // null for 9, 10 and 11 seconds, and the test never looked. A check that
  // only inspects the answers it was given cannot notice a missing one.
  for (let n = 4; n <= 40; n++) {
    assert.ok(g.segmentPlan("veo", n), `Veo has no plan for ${n}s — every whole length from 4 up is reachable with 4-8s clips`);
  }
  assert.deepEqual(g.segmentPlan("veo", 9), [5, 4], "a greedy 8 strands a 1s tail Veo cannot render");
  assert.deepEqual(g.segmentPlan("veo", 11), [7, 4]);
  assert.equal(g.segmentPlan("veo", 3), null, "below the engine's minimum there is no plan to make");

  // Exact, on every length either engine will admit to, at any target.
  for (const p of ["veo", "sora"]) {
    for (let n = 1; n <= 60; n++) {
      const plan = g.segmentPlan(p, n);
      if (!plan) continue;
      assert.equal(plan.reduce((a, b) => a + b, 0), n,
        `${p} plans ${plan.join("+")} for ${n}s — a plan that misses is either an overcharge or a short video`);
      for (const seg of plan) {
        assert.equal(g.supportedSeconds(p, seg), seg, `${p} cannot render the ${seg}s clip its own plan asks for`);
      }
    }
  }

  // The price of a length IS the price of its clips. Nothing rounds in our
  // favour between the two.
  for (const p of ["veo", "sora"]) {
    for (const n of g.OFFERED_SECONDS) {
      const plan = g.segmentPlan(p, n);
      if (!plan) continue;
      assert.equal(g.videoPlanAcus(p, n), plan.reduce((acc, sec) => acc + g.videoRenderAcus(sec, p), 0));
    }
  }

  // BEST PRICE ON THE BEST MODEL. 12s is one Sora call and two Veo calls, so it
  // must route to Sora; 15s is unreachable on Sora's steps, so it must route to
  // Veo rather than being served as something shorter.
  assert.equal(g.bestVideoProviderFor(12, ["veo", "sora"]).provider, "sora");
  assert.equal(g.bestVideoProviderFor(15, ["veo", "sora"]).provider, "veo");
  assert.equal(g.bestVideoProviderFor(15, ["sora"]), null, "Sora must not be offered a length its steps cannot total");

  // A cheaper rate on one engine moves the choice, which is what makes
  // "competitive" a computation rather than a hope.
  const saved = process.env.VIDEO_COST_PER_SECOND_GBP_VEO;
  try {
    process.env.VIDEO_COST_PER_SECOND_GBP_VEO = "0.01";
    assert.equal(g.bestVideoProviderFor(12, ["veo", "sora"]).provider, "veo",
      "a cheaper per-second rate must actually change which engine is picked");
  } finally {
    if (saved === undefined) delete process.env.VIDEO_COST_PER_SECOND_GBP_VEO; else process.env.VIDEO_COST_PER_SECOND_GBP_VEO = saved;
  }
});

// ---------------------------------------------------------------------------
// A BRAND KIT HALF THE PLATFORM HONOURS IS NOT A BRAND KIT.
//
// Owner: "VIDEO CREATION AND EVERYTHING ELSE MUST BE BRANDED PER THE CUSTOMER
// BRAND ON LOGO AND COLOURS, NOT A VERY RANDOM COLOUR AND LOGO."
//
// The ad canvas and ad styles have read logoUrl and brandColours for months.
// The video gateway forwarded the raw prompt and nothing else, so every render
// invented its own palette and put a made-up mark on screen — in frames the
// customer had paid for.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// "NO WAY TO DOWNLOAD."
//
// The owner, with a screenshot: a 12-second video they had paid for, playing
// in a browser tab at a googleapis URL, with no way to get it onto their
// machine. The panel's "Download MP4" button was
// `<a href={videoUrl} download>` pointing at Firebase Storage — and the
// `download` attribute is IGNORED ON A CROSS-ORIGIN LINK by every browser. So
// the click navigated to storage, storage said Content-Type: video/mp4, and
// the browser did the only thing it can: play it.
//
// The attribute cannot be made to work across origins. The bytes have to come
// back through our own origin with Content-Disposition: attachment.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// "I NEED TO DOWNLOAD THIS AS IT IS SAVED NOW."
//
// The filing worked — the owner pasted the library entry, title, timestamp and
// all. What the library then offered was a button that writes `item.output` to
// a MARKDOWN FILE. For every kind the library had ever held that is right: the
// output IS the deliverable, a document. A video's output is a URL, so the
// button handed over one line of text while the video played in a browser tab.
// ---------------------------------------------------------------------------
test("a saved video plays and downloads from the library, not as a text file", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/dashboard/library/page.tsx", import.meta.url), "utf8");


  // The markdown download SURVIVES — it is correct for every document — and a
  // file download appears beside it only when there is a file.
  assert.match(page, /title="Download as Markdown"/, "documents must still download as documents");
  assert.match(page, /mediaUrlsOf\(item\)\.length > 0 && \(/, "the file button only belongs on items that have one");
  assert.match(page, /mediaDownloadHref\(item, /);

  // And it PLAYS. A saved video rendered as a paragraph of URL is the reason
  // the owner could not tell whether it had been kept at all.
  assert.match(page, /<video src=\{u\} controls/);
  // A multi-clip render is one URL per line, and each gets its own button.
  assert.match(page, /mediaDownloadHref\(item, i\)/);

  // OUR OWN STORAGE ONLY, on both sides. A saved output can contain any link an
  // engine wrote into it; rendering an arbitrary one in a <video> tag or
  // streaming it through the route would fetch somebody else's server on the
  // customer's behalf.
  assert.match(page, /const MEDIA_HOSTS = \["firebasestorage\.googleapis\.com", "storage\.googleapis\.com"\]/);

  // The file arrives named after the item, and the markdown download survives
  // untouched for everything that is genuinely a document.
  assert.match(page, /function mediaDownloadHref/);
});

test("the download button uses the one download proxy, and needs no header", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const panel = readFileSync(new URL("../src/components/VideoRenderAndPublish.tsx", import.meta.url), "utf8");
  const library = readFileSync(new URL("../src/app/dashboard/library/page.tsx", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../src/app/api/download/route.ts", import.meta.url), "utf8");

  // TWO FAULTS IN A ROW, BOTH MINE, BOTH THE SAME SHAPE: a plain <a> cannot
  // carry what an XHR can.
  //
  //   1. `<a href={videoUrl} download>` — the download attribute is IGNORED on
  //      a cross-origin link, so the click navigated to storage and the browser
  //      played the video.
  //   2. A new route behind resolveBrandAccess — a browser navigation cannot
  //      send an Authorization header, so it answered
  //      {"error":"Authentication required"}.
  //
  // /api/download has done this correctly since the ad canvas needed it. ONE
  // proxy, not three.
  for (const [name, src] of [["panel", panel], ["library", library]]) {
    assert.match(src, /\/api\/download\?url=\$\{encodeURIComponent\(/, `the ${name} does not use the shared proxy`);
    assert.doesNotMatch(src, /<a href=\{job\.videoUrl\} download/, `the ${name} is back to a cross-origin download attribute`);
    assert.doesNotMatch(src, /api\/work\/download|api\/video-render\/download/, `the ${name} points at a route that no longer exists`);
  }

  // The duplicates are GONE. One source of truth per concept — two download
  // proxies is how they drift apart and one of them stops being maintained.
  assert.equal(existsSync(new URL("../src/app/api/work/download/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/api/video-render/download/route.ts", import.meta.url)), false);

  // The proxy itself does the two things that make a browser save a file, and
  // refuses to fetch anything that is not hosted media.
  assert.match(proxy, /"Content-Disposition": `attachment; filename="\$\{filename\}"`/);
  assert.match(proxy, /hostAllowed\(target\.hostname\)/);
  assert.doesNotMatch(proxy, /requireAuth|resolveBrandAccess/,
    "adding auth here would break every plain download link on the platform");

  // And the file arrives with a name a person can find again.
  assert.match(panel, /function videoFileName/);
  assert.match(library, /function mediaDownloadHref/);
});

test("a paid render can always be put in the library by hand", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/components/VideoRenderAndPublish.tsx", import.meta.url), "utf8");

  // The render files itself on completion. A filing that fails must not leave a
  // paid video with nowhere to live — the owner has already lost one that way,
  // so there is a second door and it reports which outcome it got.
  assert.match(ui, /async function saveToLibrary/);
  assert.match(ui, /authedFetch\("\/api\/work"/, "a plain fetch omits the token and the route refuses it");
  assert.match(ui, /kind: "video"/);
  assert.match(ui, /brandId: activeBrand\.id/, "the brand object is not a brand id");
  assert.match(ui, /setSaved\(r\.ok \? "done" : "failed"\)/,
    "a save that failed must not read as a save that worked");
});

test("the joined file is measured, and a short one is refunded not handed over", async () => {
  const { mp4Duration, durationMatches } = await import("../src/shared/mp4-duration.ts");
  const { readFileSync } = await import("node:fs");

  // Build a minimal MP4 header: ftyp, then moov > mvhd carrying timescale and
  // duration. This is the only fact that decides whether the customer got what
  // they paid for, and the join service does not report it.
  const box = (type, payload) => {
    const b = Buffer.alloc(8 + payload.length);
    b.writeUInt32BE(8 + payload.length, 0);
    b.write(type, 4, "ascii");
    payload.copy(b, 8);
    return b;
  };
  const mvhdV0 = (timescale, duration) => {
    const p = Buffer.alloc(100);
    p[0] = 0;                       // version 0
    p.writeUInt32BE(timescale, 12);
    p.writeUInt32BE(duration, 16);
    return box("mvhd", p);
  };
  const file = (timescale, duration) =>
    Buffer.concat([box("ftyp", Buffer.from("isom")), box("moov", mvhdV0(timescale, duration))]);

  assert.equal(mp4Duration(file(600, 9000)), 15, "15s at a 600 timescale");
  assert.equal(mp4Duration(file(1000, 12000)), 12);
  assert.equal(mp4Duration(file(90000, 8 * 90000)), 8);

  // 64-bit (version 1) headers too.
  const mvhdV1 = (timescale, duration) => {
    const p = Buffer.alloc(112);
    p[0] = 1;
    p.writeUInt32BE(timescale, 20);
    p.writeUInt32BE(0, 24);
    p.writeUInt32BE(duration, 28);
    return box("mvhd", p);
  };
  assert.equal(mp4Duration(Buffer.concat([box("ftyp", Buffer.from("isom")), box("moov", mvhdV1(600, 9000))])), 15);

  // JUNK IN, NULL OUT — never a wrong number, and never a read past the end.
  assert.equal(mp4Duration(Buffer.from("not a video at all")), null);
  assert.equal(mp4Duration(Buffer.alloc(0)), null);
  // A box claiming to be bigger than the file must not be followed.
  const lying = Buffer.alloc(16);
  lying.writeUInt32BE(0xffffff, 0); lying.write("moov", 4, "ascii");
  assert.equal(mp4Duration(lying), null);

  // THE DECISION. A 15s order that comes back as 8s is the join having produced
  // one clip instead of two — a failure, not a delivery.
  assert.equal(durationMatches(8, 15), false);
  assert.equal(durationMatches(14.6, 15), true, "a re-encode lands a fraction either side");
  assert.equal(durationMatches(15.2, 15), true);
  // An unreadable header is not evidence of a short video, so it must not fail
  // a render on our own parser's limitations.
  assert.equal(durationMatches(null, 15), true);

  // And the gateway acts on it: refund, keep the clips, do not hand it over.
  const src = readFileSync(new URL("../src/backend/video-gateway.ts", import.meta.url), "utf8");
  assert.match(src, /!durationMatches\(measured, ordered\)/);
  assert.match(src, /if \(job\.chargedAcu\) await creditAcus\(walletId, job\.chargedAcu\)/,
    "a video that is not the length ordered must be refunded, not delivered");

  // THE JOIN SERVICE'S URL EXPIRES IN TEN MINUTES. Handing it over would be the
  // owner's original report — "a firebase link then all GONE" — with a shorter
  // fuse. It is re-hosted on our own permanent URL first.
  assert.match(src, /const hosted = await uploadPublicMedia\(bytes/);
  assert.match(src, /job\.videoUrl = hosted;/);
  assert.doesNotMatch(src, /job\.videoUrl = dl\.url/,
    "an expiring signed URL is being handed to the customer as their video");
});

test("a length that cannot arrive as one file is not sold", async () => {
  const g = await import("../src/backend/video-gateway.ts");
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/backend/video-gateway.ts", import.meta.url), "utf8");

  // OWNER'S DIRECTIVE: "I want both 12 and 15 second video to be in 1 clips."
  // 12 is one Sora call. 15 is not one call on anything, so it is 8 + 7 joined
  // — and joining needs the render service. Without it the row is withheld
  // rather than sold and part-delivered.
  const saved = { g: process.env.GEMINI_API_KEY, o: process.env.OPENAI_API_KEY, f: process.env.FFMPEG_CLOUD_API_KEY };
  try {
    process.env.GEMINI_API_KEY = "k"; process.env.OPENAI_API_KEY = "k";
    delete process.env.FFMPEG_CLOUD_API_KEY;

    const menu = g.videoLengthOptions();
    for (const l of menu) {
      assert.equal(l.segments.length, 1,
        `${l.delivered}s is offered as ${l.segments.length} clips with no way to join them`);
    }
    assert.ok(menu.some((l) => l.delivered === 12), "12s is one Sora call and must still be on the menu");
    assert.ok(!menu.some((l) => l.delivered === 15), "15s cannot be one file here and must not be sold");

    // Withheld, NAMED. A menu that quietly loses a length reads as a bug.
    const withheld = g.withheldLengths();
    assert.deepEqual(withheld.map((w) => w.seconds), [15]);
    assert.match(withheld[0].why, /FFMPEG_CLOUD_API_KEY/, "the owner is owed the setting that brings it back");
    assert.deepEqual(withheld[0].segments, [8, 7]);

    // With a joiner, everything is back — as one file.
    process.env.FFMPEG_CLOUD_API_KEY = "k";
    const full = g.videoLengthOptions();
    assert.deepEqual(full.map((l) => l.delivered), [8, 12, 15]);
    assert.deepEqual(g.withheldLengths(), []);
  } finally {
    for (const [k, v] of [["GEMINI_API_KEY", saved.g], ["OPENAI_API_KEY", saved.o], ["FFMPEG_CLOUD_API_KEY", saved.f]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }

  // THE JOIN IS A STAGE WITH AN END, and the job is not ready before it.
  //
  // My own first version fired the join and immediately set status "ready" with
  // videoUrl = clips[0] — an 8-second clip presented as the 15 seconds that had
  // been paid for. The same defect as every other one on this page, committed
  // while fixing it.
  assert.match(src, /if \(!job\.stitchRef\)/, "the join must be submitted once and then polled");
  assert.match(src, /const state = toQueueStatus\(status\.job\.status\)/);
  assert.match(src, /if \(state === "queued" \|\| state === "running"\) return job/,
    "a job whose join is still running must not be reported ready");
  // The ready path takes the JOINED file — re-hosted on our own permanent URL —
  // never the first clip and never the join service's expiring link.
  assert.match(src, /job\.videoUrl = hosted;\n  job\.status = "ready"/);
  assert.doesNotMatch(src, /job\.videoUrl = job\.clips\[0\];\s*\n\s*job\.status = "ready"/,
    "the first clip is being handed over as the finished video again");
});

test("a video render carries the customer's colours, and never invents their logo", async () => {
  const g = await import("../src/backend/video-gateway.ts");

  const branded = g.brandedVideoPrompt("8-second vertical clip of the flame-grilled platter", {
    name: "Evan Deli", product: "flame-grilled platters",
    brandColours: ["#0B7D5A", "#F4C542"], logoUrl: "https://example.com/logo.png",
  });

  // The exact hexes, not a description of them.
  assert.match(branded, /#0B7D5A/);
  assert.match(branded, /#F4C542/);
  assert.match(branded, /no competing accent/i, "naming colours without excluding others just adds a fourth colour");
  assert.match(branded, /Evan Deli/);
  // The customer's own words survive intact at the top.
  assert.match(branded, /^8-second vertical clip of the flame-grilled platter/);

  // NEVER ASK A MODEL TO DRAW SOMEBODY'S LOGO. It approximates it, and an
  // approximated logo is a legal and brand problem wearing the customer's name
  // — and it has to be edited out of frames they have already paid for.
  assert.match(branded, /Do NOT draw, letter or invent any logo/);
  assert.match(branded, /Leave a clean, uncluttered area/,
    "space for the real logo has to be asked for, or there is nowhere to put it");

  // With no logo on file the instruction is still to invent nothing.
  const noLogo = g.brandedVideoPrompt("A clip", { name: "X", brandColours: [] });
  assert.match(noLogo, /Do NOT invent a logo/);
  assert.doesNotMatch(noLogo, /BRAND COLOURS/,
    "a colour instruction naming no colour is noise the model fills in itself");

  // No brand on file changes nothing at all — never half-brand a render.
  assert.equal(g.brandedVideoPrompt("A clip", null), "A clip");

  // Junk in the colour list is dropped rather than passed to the model.
  const dirty = g.brandedVideoPrompt("A clip", { name: "X", brandColours: ["not-a-colour", "#123456"] });
  assert.doesNotMatch(dirty, /not-a-colour/);
  assert.match(dirty, /#123456/);
});

test("a paid render is filed in the library, and a multi-clip job needs every clip", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/backend/video-gateway.ts", import.meta.url), "utf8");

  // THE OWNER'S REPORT: "big money spent generated a 12 second video which is
  // not autosave to the work library and not possible to download as the
  // download MP4 give you a firebase link then all GONE."
  //
  // All true. Nothing anywhere called saveWork for a video, so the only record
  // of a paid render was React state in the panel — one refresh and a video the
  // customer had paid for was gone from every surface they could reach, while
  // the MP4 itself sat in Storage on a permanent URL nobody could find again.
  assert.match(src, /import \{ saveWork \} from "@\/backend\/work-library"/);
  assert.match(src, /async function fileInLibrary/);
  // Both terminal paths file it — the single clip and the segmented one.
  assert.ok((src.match(/fileInLibrary\(/g) || []).length >= 3,
    "a finished render must be filed on every path that can finish");
  assert.match(src, /kind: "video"/);
  // And a failed filing tells the customer where their file is rather than
  // swallowing it: the money is already spent either way.
  assert.match(src, /copy this link before you close the tab/);

  // MY OWN ERROR, GUARDED. The multi-clip poll path was written and never
  // saved to disk — a scripted edit failed its last assertion and wrote
  // nothing — so a 12-second render charged for two clips, polled only the
  // first, and would have gone READY as an eight-second video. Typecheck and
  // 1558 tests all passed, because nothing asserted the path existed.
  assert.match(src, /if \(job\.segments && job\.segments\.length > 1\) return await pollSegments\(job\)/,
    "a segmented job must be polled as a segmented job");
  assert.match(src, /async function pollSegments/);
  // Ready ONLY when every clip has a hosted URL.
  assert.match(src, /const done = segs\.every\(\(x\) => Boolean\(x\.url\)\)/);
  assert.match(src, /if \(!done\)/, "a partial set of clips must stay 'rendering'");
});

test("the video panel points at where the file was kept", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/components/VideoRenderAndPublish.tsx", import.meta.url), "utf8");
  // The note from the server carries "saved to your library"; the panel must
  // actually show that note rather than replacing it with its own wording.
  assert.match(ui, /job\.note/, "the panel must show the server's own account of what happened");
});

test("the margin floor holds on every length, not just the ones in one call", async () => {
  const g = await import("../src/backend/video-gateway.ts");

  // The owner's law: price is never below twice provider cost. A segmented
  // length must clear it too — the floor is per render, and a length that is
  // several renders could otherwise be sold under the sum of its own costs.
  for (const p of ["veo", "sora"]) {
    const rate = g.videoCostPerSecondGbp(p);
    for (const n of g.OFFERED_SECONDS) {
      const acus = g.videoPlanAcus(p, n);
      if (acus == null) continue;
      const costPence = rate * n * 100;
      assert.ok(acus >= costPence * 2,
        `${n}s on ${p} sells at ${acus} ACUs against a ${Math.round(costPence)}p cost — under the 2x floor`);
    }
  }
});

// ---------------------------------------------------------------------------
// THE FEATURE SECTIONS, READ AGAINST THE ENGINES THEY DESCRIBE.
//
// War Room, Clip Lab and the Recovery engine were substantially true — the
// Financial Shield really is budget.ts, the seven clip signals really are
// counted, the vault really scores imported contacts and shows zero when there
// are none. The WhatsApp section was not.
// ---------------------------------------------------------------------------
test("the page does not claim WhatsApp automation that does not exist", async () => {
  const { readFileSync } = await import("node:fs");
  // STRIP THE COMMENTS FIRST. The comment explaining why a claim was removed
  // necessarily QUOTES that claim, so a whole-file scan finds the sentence it
  // is checking for the absence of and fails on its own explanation. Four
  // tests in this repository have died that way; this is the fifth and last.
  const copyOf = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  const page = copyOf(readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8"));
  const route = readFileSync(new URL("../src/app/api/whatsapp/route.ts", import.meta.url), "utf8");

  // NOTHING SENDS A WHATSAPP MESSAGE. No Graph API call, no scheduler, no
  // thread store — and the route serving that panel says so in its own comment
  // while returning a ZEROED funnel rather than inventing one. The page was
  // claiming the opposite four screens above it.
  assert.match(route, /No live WhatsApp traffic source is wired yet/);
  assert.doesNotMatch(page, /fires follow-ups at 1h, 24h and 48h/);
  assert.doesNotMatch(page, /qualifies the lead with AI, sends the offer, books the order/);
  assert.doesNotMatch(page, /AI qualification with intent scoring on every thread/);
  assert.match(page, /nothing here messages your customers on its own/);

  // The honest empty state must stay honest.
  const wa = await import("../src/backend/whatsapp.ts");
  const empty = wa.emptyWhatsappOverview("Test Co");
  assert.match(empty.note, /nothing is fabricated/);
  for (const stage of empty.funnel) assert.equal(stage.value, 0, "the empty funnel must be zero, not a sample");
  // And the deterministic demo figures are only ever served on an explicit
  // demo flag with no live token — never by default.
  assert.match(route, /body\.demo === true && !process\.env\.WHATSAPP_TOKEN/);
});

test("the Clip Lab's seven signals are seven signals that are actually counted", async () => {
  const cf = await import("../src/backend/clip-finder.ts");
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/backend/clip-finder.ts", import.meta.url), "utf8");

  // The page names seven: hook, stands alone, payoff, pace, length, buying
  // signal, ask. Each must exist, and each must carry the evidence it was
  // scored on — "so you can disagree with it" is the whole claim.
  const names = [...new Set((src.match(/name: "([^"]+)"/g) || []).map((m) => m.slice(7, -1)))];
  for (const want of ["Hook", "Stands alone", "Payoff", "Pace", "Length", "Buying signal", "Ask"]) {
    assert.ok(names.includes(want), `the page names the "${want}" signal and the finder has no such signal`);
  }
  // Captions rebased to zero, as claimed.
  assert.equal(typeof cf.srtForClip, "function");
  assert.match(src, /timings starting at zero/);
});

test("the Recovery engine claims only the imports and figures it has", async () => {
  const { readFileSync } = await import("node:fs");
  // Comments stripped, for the reason given in the WhatsApp test above.
  const copyOf = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  const page = copyOf(readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8"));
  const rec = await import("../src/backend/recovery.ts");

  // "Import CSV, CRM, Shopify, Stripe or WhatsApp exports" read as five
  // connectors. The vault takes a CSV — which is what all of those give you on
  // export, so the capability was real and the wording was not.
  assert.doesNotMatch(page, /Import CSV, CRM, Shopify, Stripe or WhatsApp exports/);
  assert.match(page, /including the exports Shopify, Stripe, your CRM or WhatsApp hand you/);

  // There is no scoring system called an "AI Revenue Recovery Score". The
  // engine computes totalRecoverableGbp; a trademark on a name that appears
  // nowhere in the code is a claim about a product that does not exist.
  assert.doesNotMatch(page, /Revenue Recovery Score/);

  // The honest empty report stays honest.
  const empty = rec.emptyRecovery("Test Co");
  assert.equal(empty.live, false);
  assert.equal(empty.totalRecoverableGbp, 0, "no contacts must mean no recoverable pounds, not a sample");
});

test("the Financial Shield named on the page is a real engine", async () => {
  const { readFileSync } = await import("node:fs");
  const budget = readFileSync(new URL("../src/backend/budget.ts", import.meta.url), "utf8");
  // Named on the page; this is the module. protectedGbp is the money stopped
  // and rerouted, rerouteReturnGbp is explicitly a PROJECTION and its field
  // name says so.
  assert.match(budget, /Budget Protection Engine \(The Financial Shield\)/);
  assert.match(budget, /protectedGbp: number/);
  assert.match(budget, /rerouteReturnGbp: number; \/\/ projected/);
});

// ---------------------------------------------------------------------------
// THIRTY-NINE AGENT CARDS, READ AGAINST THE PROMPTS THAT SERVE THEM.
//
// A card is a promise the customer buys on. Most held — several exactly, and
// two (Lead Hunter, Campaign Warfare) were already policing themselves better
// than this test could. These are the ones that did not, kept as assertions so
// a description cannot quietly outrun its prompt again.
// ---------------------------------------------------------------------------
test("no agent card promises a channel or an engine its prompt never asks for", async () => {
  const { AGENTS } = await import("../src/shared/agents.ts");

  // AD CREATIVE promised LinkedIn copy and video prompts; the prompt asked for
  // Meta, TikTok, Google and one image prompt. The prompt now asks for both.
  const ad = AGENTS["ad-creative"];
  for (const want of ["LinkedIn", "Video Prompt", "Image Prompt", "TikTok", "Google"]) {
    assert.ok(ad.systemPrompt.includes(want), `ad-creative promises ${want} and never asks for it`);
  }

  // CITATION RADAR said it fires prompts at "ChatGPT, Claude, Gemini and
  // Perplexity". The gateway has three adapters — anthropic, openai, gemini.
  // There is no Perplexity adapter, so a Perplexity row would be a measurement
  // of something never asked.
  const radar = AGENTS["citation-radar"];
  assert.doesNotMatch(radar.description, /Perplexity/,
    "the card claims an engine this platform cannot query");
  assert.match(radar.systemPrompt, /no Perplexity adapter/,
    "the prompt must forbid reporting an engine that was not queried");

  // CONTENT FACTORY promised a 30-day calendar; the prompt asked for 7 days.
  assert.match(AGENTS["content-factory"].systemPrompt, /30-DAY content calendar/);

  // VIRAL HOOK promised "dozens"; it returns twenty.
  assert.doesNotMatch(AGENTS["viral-hook"].description, /dozens/);

  // SITERAID called its ten-part health score a "six-part marketing audit".
  assert.doesNotMatch(AGENTS["website-intelligence"].description, /six-part/);
});

test("no agent is told to invent a number the customer will spend against", async () => {
  const { AGENTS } = await import("../src/shared/agents.ts");

  // Three prompts ASKED for figures nobody could have: £ estimates on revenue
  // leaks, an expected £ impact per daily order, and a predicted ROAS before a
  // pound is spent. Each is now constrained to arithmetic the business supplied.
  assert.match(AGENTS["revenue-intelligence"].systemPrompt, /an invented pound in a revenue report/);
  assert.match(AGENTS["growth-strategist"].systemPrompt, /ONLY when the business gave you the numbers/);
  assert.match(AGENTS["viral-product-engine"].systemPrompt, /Do NOT print a predicted ROAS/);
  assert.doesNotMatch(AGENTS["viral-product-engine"].systemPrompt, /predicted ROAS, purchase-intent/);
});

test("an agent with no live source says so instead of inventing one", async () => {
  const { AGENTS } = await import("../src/shared/agents.ts");

  // THE PATTERN THE LEAD HUNTER ALREADY GOT RIGHT: the agents route injects a
  // site crawl and nothing else — no search results, no prospect data. Two
  // agents were written as though a live layer fed them, and would have
  // produced invented search signals and invented company names with a Deal
  // Probability beside each one.
  assert.match(AGENTS["lead-hunter"].systemPrompt, /only if a live source is connected/i,
    "the reference implementation of this rule must not be weakened");
  assert.match(AGENTS["opportunity-scout"].systemPrompt, /you have no search data and must say so/);
  assert.match(AGENTS["icp-architect"].systemPrompt, /ONLY from a connected source/);
  assert.match(AGENTS["icp-architect"].systemPrompt, /FORMAT EXAMPLE/);
});

test("the budget agent recommends; it does not spend or stop money by itself", async () => {
  const { AGENTS } = await import("../src/shared/agents.ts");
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

  // "Stops waste automatically" / "Pauses campaigns" / "Automatic pause when
  // spend produces no leads" — nothing in this codebase pauses a campaign.
  // There is no pauseCampaign, no status write, no channel call that stops
  // spend, and the platform's own rule four sections down the same page says
  // "They draft; anything that would spend, send or publish waits for you."
  const bp = AGENTS["budget-protection"];
  assert.doesNotMatch(bp.role, /automatically/i);
  assert.doesNotMatch(bp.description, /\bPauses campaigns\b/);
  assert.match(bp.description, /one click to apply/);
  assert.doesNotMatch(page, /Automatic pause when spend produces no leads/);
});

// ---------------------------------------------------------------------------
// THE FRONT PAGE PRINTED THREE NUMBERS NOTHING ENFORCED.
//
// Under a heading that read "Operating targets built into the automation rules
// — not averaged customer results", four stats. Three were false:
//
//   "4.0x+ blended ROAS before scaling"  — the guardrail scales at THREE times
//     return, and this same page said "only above 3× return" a few sections
//     lower. The headline contradicted the body; the code agreed with the body.
//   "48h kill-window"                    — no forty-eight-hour rule exists in
//     paid-guardrails, budget or the war room. The real stop is evidence, not a
//     clock.
//   "10 min reply SLA"                   — the inbox SLA defaults to SIXTY
//     minutes. Ten came from a line of advice copy, which is not a rule.
//
// A number nobody computes is exactly what the audit page refuses to print
// about a stranger's website, and it was sitting on our own front page.
// ---------------------------------------------------------------------------
test("every operating target on the front page is read from the rule that enforces it", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const guards = await import("../src/backend/paid-guardrails.ts");
  const sub = await import("../src/backend/subscription.ts");

  // Imported, not typed.
  assert.match(page, /import \{ DEFAULT_GUARDRAILS, MIN_SPEND_TO_JUDGE_GBP, MIN_CONVERSIONS_TO_JUDGE_CPA \} from "@\/backend\/paid-guardrails"/);
  assert.match(page, /import \{ MARKUP_FLOOR \} from "@\/backend\/subscription"/);
  assert.match(page, /\$\{DEFAULT_GUARDRAILS\.scaleRoas\}×/);
  assert.match(page, /\+\$\{DEFAULT_GUARDRAILS\.maximumScalePct\}%/);
  assert.match(page, /\$\{MARKUP_FLOOR\}×/);

  // The three fictions must not come back.
  assert.doesNotMatch(page, /"4\.0x\+"/, "a ROAS target nothing enforces");
  assert.doesNotMatch(page, /"48h"/, "a kill-window no rule implements");
  assert.doesNotMatch(page, /"10 min", label: "reply SLA/, "an SLA the inbox does not use");

  // And the rules themselves are what the page now claims.
  assert.equal(guards.DEFAULT_GUARDRAILS.scaleRoas, 3);
  assert.equal(guards.DEFAULT_GUARDRAILS.maximumScalePct, 20);
  assert.equal(guards.MIN_SPEND_TO_JUDGE_GBP, 25);
  assert.equal(guards.MIN_CONVERSIONS_TO_JUDGE_CPA, 5);
  assert.equal(sub.MARKUP_FLOOR, 2, "the owner's pricing floor is the one number that may never move quietly");

  // THE OTHER PLACE THE SAME RULE IS STATED. `included-tools.ts` describes the
  // ad-spend monitor in prose, and it is `shared/`, so it cannot import a
  // backend constant — the layer rule forbids it. A test is the only thing that
  // can hold the two together, and a page contradicting itself is exactly how
  // the 4.0x got through: one section said four, another said three.
  const tools = readFileSync(new URL("../src/shared/included-tools.ts", import.meta.url), "utf8");
  assert.match(tools, new RegExp(`\\+${guards.DEFAULT_GUARDRAILS.maximumScalePct}% steps`),
    "the prose scaling step no longer matches DEFAULT_GUARDRAILS.maximumScalePct");
  assert.match(tools, new RegExp(`above ${guards.DEFAULT_GUARDRAILS.scaleRoas}× return`),
    "the prose scaling threshold no longer matches DEFAULT_GUARDRAILS.scaleRoas");
});

test("the front page's counts are counted, never typed", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const ag = await import("../src/shared/agents.ts");
  const wl = await import("../src/shared/warlord-roster.ts");
  const tools = await import("../src/shared/included-tools.ts");
  const cp = await import("../src/shared/creator-program.ts");

  // 39 agents, 26 front-line units, 6 divisions under one commander — all
  // derived, which is why they survived a change that broke the stats above.
  assert.equal(ag.AGENT_LIST.length, 39);
  assert.equal(wl.ARMY.length, 26);
  assert.equal(wl.DIVISIONS.length - 1, 6, "the page says DIVISIONS.length - 1 divisions under WARLORD");
  assert.match(page, /\{DIVISIONS\.length - 1\} divisions/);
  assert.match(page, /AGENT_LIST/);
  assert.match(page, /ARMY/);

  // "12 things … 9 of them work with no keys" is generated from the list.
  const sum = tools.includedSummary();
  assert.equal(sum.total, tools.INCLUDED_TOOLS.length);
  assert.equal(sum.total, 12);
  assert.equal(sum.keyless, 9);
  assert.match(page, /includedSummary/);

  // The commission rates the page quotes are the rates the engine pays.
  assert.equal(cp.SHARE2EARN_RATE_CAP, 0.005, "SHARE2EARN is quoted as 0.5%");
  assert.equal(cp.INFLUENCER_RATE_5K, 0.0075, "the creator programme is quoted as 0.75%");
  assert.equal(cp.INFLUENCER_RATE_10K, 0.01, "and 1% on verified counts");
});

// ---------------------------------------------------------------------------
// A CAPABILITY WITH NO SURFACE IS NOT A CAPABILITY.
//
// /api/admin/grant-acus has worked for months: resolve an email to a uid,
// credit the wallet, optionally set the plan, platform_admin only. Nothing in
// the product ever called it. So the only way to comp a design partner or
// unstick a pilot was a hand-crafted authenticated POST — which is to say it
// never happened, and the owner's own account sat at 100 ACUs looking at a page
// selling them eight subscription tiers.
// ---------------------------------------------------------------------------
test("the grant-ACUs route has a surface that actually calls it", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/components/AdminGrantAcus.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/dashboard/admin/page.tsx", import.meta.url), "utf8");

  assert.match(page, /<AdminGrantAcus \/>/, "the panel has to be mounted, not merely written");
  assert.match(ui, /authedFetch\("\/api\/admin\/grant-acus"/,
    "authedFetch, not fetch — a plain fetch omits the token and the route 401s");
  assert.match(ui, /method: "POST"/);
  // Both directions: look one up before granting, so the operator sees what
  // they are changing rather than firing blind.
  assert.match(ui, /grant-acus\?email=/, "an operator has to be able to read a balance before changing it");

  // THE BALANCE AFTER A GRANT COMES FROM THE SERVER. A component that adds the
  // amount to what it last saw will disagree with the wallet the moment two
  // grants race, and this is money.
  assert.match(ui, /balanceAcu: d\.balanceAcu/, "the new balance must be the server's, never computed here");
  assert.doesNotMatch(ui, /balanceAcu:.*\+\s*amount/, "never add the grant to a remembered balance");

  // What it costs, beside the button that spends it. ACUs are pennies.
  assert.match(ui, /given away/, "a grant is real provider money and the page has to say so");
});

test("the operator is told they are not a customer, and nothing is hidden from them", async () => {
  const { readFileSync } = await import("node:fs");
  const billing = readFileSync(new URL("../src/app/dashboard/billing/page.tsx", import.meta.url), "utf8");

  assert.match(billing, /useIsAdmin\(\)/);
  assert.match(billing, /operator here, not a customer/);
  assert.match(billing, /\/dashboard\/admin/, "it has to point at the tool they came for");

  // NOT HIDDEN. The plan table is the only place the pricing can be read the way
  // a customer reads it, and removing it from the owner would take away the one
  // surface where the margin floor can be checked against what is charged.
  assert.doesNotMatch(billing, /isAdmin \s*&&\s*\(?\s*null/, "the commercial surface is not removed for admins");
  const plansIdx = billing.indexOf("ACU top-ups");
  assert.ok(plansIdx > 0, "the top-up table must still be on the page");
});

// ---------------------------------------------------------------------------
// "RED BUT THE KEY IS PRESENT."
//
// Reported by the owner about the Serper panel, and both halves were true. Every
// failed probe that was not a quota error produced ONE sentence — "key present
// but REJECTED" — printed for a network failure, a timeout, and any HTTP status
// at all. That is a specific accusation against the key, and it sends the owner
// hunting for the one thing the same sentence has already ruled out.
// ---------------------------------------------------------------------------
test("a probe that could not reach a provider does not blame the key", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/api/health/serper/route.ts", import.meta.url), "utf8");

  // Unreachable is its own outcome, and its sentence says the key is untested.
  assert.match(src, /unreachable: true/);
  assert.match(src, /present and UNTESTED/, "not reaching a service is not being refused by it");
  // A refusal is still called a refusal — only when the status actually says so.
  assert.match(src, /p\.httpStatus === 401 \|\| p\.httpStatus === 403/);
  assert.match(src, /REFUSED the key/);
  // And the old catch-all accusation is gone.
  assert.doesNotMatch(src, /Serper key present but rejected/,
    "one sentence for four different causes is what made this unactionable");
  // A timeout is named, because "we waited 12s" and "there is no route" have
  // different next moves.
  assert.match(src, /timedOut/);
});

// ---------------------------------------------------------------------------
// THE AUDIT ACCUSED A SITE OF A FAULT IT DID NOT HAVE.
//
// Reported by the owner from a live run against their own site, kodajnn.com:
//
//   Contact route — "No phone link, email link or form on this page."
//   "There is no obvious way to get in touch from this page … Every visitor
//    who wanted to hire you had to go looking, and looking is where they stop."
//
// The site has a /contact page, linked from its own navigation. Both statements
// were true OF THE HOMEPAGE and false about the business — and the second one
// told the owner they were losing customers over a problem they had solved.
//
// This is the worst possible failure for this particular page. The audit is the
// platform's front door, its whole argument is that nothing in it is invented,
// and a reader who catches one false accusation stops believing the twenty-eight
// correct findings beside it. "Unquestionable" is the requirement.
// ---------------------------------------------------------------------------
test("a site with a linked contact page is not told it has no way to be contacted", async () => {
  const { crawlSite } = await import("../src/backend/crawler.ts");
  const http = await import("node:http");

  // The shape that produced the false report: a homepage with no tel:, no
  // mailto: and no form, linking to a contact page that has all three.
  const home = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
    <title>KODA — the SMS is the API, verification anywhere</title></head>
    <body><nav><a href="/contact">Contact</a></nav><h1>KODA</h1><p>Mobile money verification.</p></body></html>`;
  const contact = `<!doctype html><html lang="en"><head><title>Contact KODA</title></head>
    <body><h1>Contact</h1><p>Call <a href="tel:+442079460000">020 7946 0000</a></p>
    <p>SW1A 1AA</p><form><input name="email"></form></body></html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(req.url.startsWith("/contact") ? contact : home);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    const report = await crawlSite(`http://127.0.0.1:${port}/`);
    assert.equal(report.ok, true, `crawl failed: ${report.error}`);
    const by = (label) => report.findings.find((f) => f.label === label);

    // THE THREE THAT WERE WRONG.
    assert.equal(by("Contact route").severity, "pass",
      `a site with a linked contact page carrying a phone link, an address and a form was told: "${by("Contact route").detail}"`);
    assert.equal(by("Phone number").severity, "pass",
      `the phone number is on /contact and the report said: "${by("Phone number").detail}"`);
    assert.equal(by("Local address").severity, "pass",
      `the postcode is on /contact and the report said: "${by("Local address").detail}"`);

    // AND IT SAYS WHERE IT LOOKED, so nobody has to take its word for it.
    assert.ok(report.pagesRead.length >= 2, `only read ${report.pagesRead.length} page(s)`);
    assert.ok(report.pagesRead.some((u) => u.includes("/contact")), "the contact page must be in the record");
    assert.match(by("Contact route").detail, /\/contact/,
      "a finding answered from another page has to name that page");
  } finally {
    server.close();
  }
});

test("an API company is not told it is losing customers like a plumber", async () => {
  const { crawlSite } = await import("../src/backend/crawler.ts");
  const http = await import("node:http");

  // THE REPORTED CASE. A B2B verification API was told, of a missing tel:
  // link: "For a local business the phone number is the conversion … somebody
  // standing in the rain has to copy it by hand." Nobody stands in the rain to
  // buy an API. The measurement was true and the FINDING was nonsense, and a
  // reader who catches one of those stops believing the twenty-six beside it.
  const api = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
    <title>KODA — the SMS is the API</title></head><body>
    <h1>Verification anywhere the code exists</h1>
    <p>Call our REST API from any stack. The SDK ships with a sandbox, and every
       endpoint is covered in the documentation. Point a webhook at your service
       and you are live.</p></body></html>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(api); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    const report = await crawlSite(`http://127.0.0.1:${port}/`);
    assert.equal(report.ok, true, `crawl failed: ${report.error}`);
    const by = (label) => report.findings.find((f) => f.label === label);

    for (const label of ["Phone number", "Local address", "Local business schema"]) {
      assert.equal(by(label).applicable, false, `"${label}" is still being counted against an API company`);
      assert.match(by(label).notApplicable, /software or API business/);
    }

    // NEVER DRESSED AS A PASS. A point awarded for a question we did not ask is
    // the same lie as a point deducted for one they could not answer.
    assert.notEqual(by("Phone number").severity, "pass",
      "an inapplicable check must not be turned into a free point");

    // And it is out of the score entirely, so the grade is of what was asked.
    assert.ok(report.score > 0 && report.score <= 100);
  } finally {
    server.close();
  }
});

test("a local business is still asked for its phone number and its address", async () => {
  const { crawlSite } = await import("../src/backend/crawler.ts");
  const http = await import("node:http");

  // THE OTHER HALF, and the reason the test is POSITIVE evidence of software
  // rather than the absence of local evidence: "no postcode, therefore not
  // local, therefore no postcode needed" is circular and would silence this
  // check for every trade that needs it most.
  const trade = `<!doctype html><html lang="en"><head><title>Evan Deli — emergency plumbing in Leeds</title></head>
    <body><h1>Emergency plumbing</h1><p>We cover Leeds and Wakefield, same day.</p></body></html>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(trade); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const report = await crawlSite(`http://127.0.0.1:${port}/`);
    const phone = report.findings.find((f) => f.label === "Phone number");
    const addr = report.findings.find((f) => f.label === "Local address");
    assert.notEqual(phone.applicable, false, "a plumber with no phone number must still be told");
    assert.equal(phone.severity, "fail");
    assert.notEqual(addr.applicable, false);
  } finally {
    server.close();
  }
});

test("a business that publishes an address is never reclassified as software", async () => {
  const { siteIsSoftware } = await import("../src/backend/crawler.ts");

  // A published address settles it. Plenty of real local businesses talk about
  // their booking API or their integration with a supplier, and the one thing
  // that cannot be argued with is a business telling us where it is.
  const devHeavy = "<body>Our API, SDK and webhook endpoint are documented in the sandbox.</body>";
  assert.equal(siteIsSoftware(devHeavy, [], false), true);
  assert.equal(siteIsSoftware(devHeavy, [], true), false, "a published address must outrank developer vocabulary");
  assert.equal(siteIsSoftware("<body>We fix boilers in Leeds.</body>", [], false), false);
  // Schema is enough on its own.
  assert.equal(siteIsSoftware("<body>Hello</body>", ["SoftwareApplication"], false), true);
  // One term repeated is one signal, not three.
  assert.equal(siteIsSoftware("<body>API API API API API</body>", [], false), false,
    "repetition of a single word must not classify a business");
});

test("a site with genuinely no contact route is still told so, and told where we looked", async () => {
  const { crawlSite } = await import("../src/backend/crawler.ts");
  const http = await import("node:http");

  // THE OTHER HALF. Softening the check until nothing ever fails would be the
  // same disservice in the opposite direction — a report that cannot say no.
  const bare = `<!doctype html><html lang="en"><head><title>A business with no way to reach it</title></head>
    <body><h1>Hello</h1><p>We do things.</p></body></html>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(bare); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const report = await crawlSite(`http://127.0.0.1:${port}/`);
    const contact = report.findings.find((f) => f.label === "Contact route");
    assert.equal(contact.severity, "fail", "a page with no phone, no email and no form has no contact route");
    assert.equal(report.pagesRead.length, 1, "there was nothing to follow");
    assert.match(contact.detail, /this page/, "with one page read the claim must be about that page");
  } finally {
    server.close();
  }
});

test("the crawl only ever follows links on the site it was given", async () => {
  const { crawlSite } = await import("../src/backend/crawler.ts");
  const http = await import("node:http");

  // A public endpoint that follows links is a public endpoint that can be aimed
  // at somebody else's network. Same origin only, and the guard runs on every
  // hop regardless.
  let elsewhereHit = 0;
  const elsewhere = http.createServer((_req, res) => { elsewhereHit++; res.writeHead(200, { "content-type": "text/html" }); res.end("<html><body>secret</body></html>"); });
  await new Promise((r) => elsewhere.listen(0, "127.0.0.1", r));
  const otherPort = elsewhere.address().port;

  const home = `<!doctype html><html lang="en"><head><title>Links away from here</title></head><body>
    <a href="http://127.0.0.1:${otherPort}/contact">Contact</a>
    <a href="https://example.com/contact">Contact us</a>
    </body></html>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(home); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const report = await crawlSite(`http://127.0.0.1:${port}/`);
    assert.equal(report.ok, true, `crawl failed: ${report.error}`);
    assert.equal(elsewhereHit, 0, "a contact link to another origin must never be followed");
    assert.equal(report.pagesRead.length, 1, `followed something it should not have: ${report.pagesRead.join(", ")}`);
  } finally {
    server.close(); elsewhere.close();
  }
});

test("the page's catalogue is generated from the checks that actually run", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/audit/page.tsx", import.meta.url), "utf8");
  const copy = await import("../src/shared/audit-copy.ts");

  // Nothing about the catalogue is typed into the page.
  assert.match(page, /auditCheckCount\(\)/, "the number of checks must be counted, never typed");
  assert.match(page, /checksByArea\(\)/, "the list must come from the checks that run");
  // A hard-coded count anywhere in the copy is the drift this prevents.
  const prose = page.replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(prose, /\b(seventeen|twenty-nine|29|30)\s+(checks|things)/i,
    "a count typed into the copy stops agreeing with the software the day a check is added");

  // Every check the page lists has a cost sentence to open, or the disclosure
  // is empty and the whole device is decorative.
  for (const { area, checks } of copy.checksByArea()) {
    assert.ok(checks.length > 0, `${area} has no checks`);
    for (const c of checks) {
      assert.ok(c.costs && c.costs.length > 40, `${c.label} has nothing to say about what it costs`);
    }
  }
});

test("the count on the page is the number of checks EVERY page gets", async () => {
  const copy = await import("../src/shared/audit-copy.ts");
  const { crawlSite } = await import("../src/backend/crawler.ts");
  const http = await import("node:http");

  // A plain page that triggers no conditional check.
  const html = `<!doctype html><html lang="en"><head><title>A business</title></head><body><p>Hello.</p></body></html>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const report = await crawlSite(`http://127.0.0.1:${port}/`);
    assert.equal(report.ok, true, `crawl failed: ${report.error}`);

    // THE NUMBER THE PAGE PRINTS IS THE NUMBER THAT RAN. Not the largest number
    // available: a conditional check must not be counted into a promise made to
    // every visitor.
    assert.equal(report.findings.length, copy.auditCheckCount(),
      `the page promises ${copy.auditCheckCount()} checks and a real crawl produced ${report.findings.length}`);

    // And the AREAS agree, so the page groups them exactly as the report does.
    for (const f of report.findings) {
      const c = copy.copyFor(f.label);
      assert.ok(c, `the crawler emits "${f.label}" and the page has no entry for it`);
      assert.equal(c.area, f.area,
        `"${f.label}" is ${f.area} in the crawler and ${c.area} on the page`);
    }
  } finally {
    server.close();
  }
});

test("the page's structured data promises only what the page contains", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/audit/page.tsx", import.meta.url), "utf8");

  // The FAQ rendered and the FAQ marked up are the SAME array. Marking up
  // questions a page does not answer is a manual action waiting to happen, and
  // we tell other people not to do it on their own sites.
  assert.match(page, /mainEntity: FAQ\.map/);
  assert.match(page, /\{FAQ\.map\(\(f\) =>/, "the questions in the markup must also be on the page");
  assert.match(page, /siteUrl\("\/audit"\)/, "breadcrumb items must be absolute — Google reads them as @id");
});

test("every finding can say what it costs, and none of it is invented", async () => {
  const { readFileSync } = await import("node:fs");
  const crawler = readFileSync(new URL("../src/backend/crawler.ts", import.meta.url), "utf8");

  // Copy exists for every check the crawler emits — an unexplained finding is
  // the linter output this was replacing.
  const labels = [...crawler.matchAll(/add\("(?:SEO|Technical|Mobile|Social|Content|Structured data)",\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labels.length >= 28, `only ${labels.length} checks parsed`);
  const missing = labels.filter((l) => !auditCopy.copyFor(l));
  assert.deepEqual(missing, [], `these findings have no plain-English cost: ${missing.join(", ")}`);

  // NO INVENTED NUMBERS. Not a percentage, not a pound sign, not "the average
  // business". Every line is a mechanism the reader can check against their own
  // experience — which is what makes it persuasive, and what a fabricated
  // statistic is not.
  for (const [label, c] of Object.entries(auditCopy.AUDIT_COPY)) {
    const all = `${c.costs} ${c.fix} ${c.ours}`;
    assert.doesNotMatch(all, /\d+\s?%/, `"${label}" quotes a percentage nobody measured`);
    assert.doesNotMatch(all, /[£$€]\s?\d/, `"${label}" quotes a money figure nobody measured`);
    assert.doesNotMatch(all, /\b(?:average|typical|most businesses lose|studies show)\b/i, `"${label}" leans on an invented statistic`);
    assert.ok(c.costs.length > 60, `"${label}" does not actually say what it costs`);
  }
});

test("the headline and the next step state counts, and name the alternative", () => {
  const bad = auditCopy.auditHeadline({ failures: 3, warnings: 2, worst: "No phone number", score: 61 });
  assert.match(bad, /3 things/);
  assert.match(bad, /costing you enquiries/);
  // The label VERBATIM. It was lower-cased, which produced "The most expensive
  // is phone number." — a sentence nobody wrote, in a report whose credibility
  // is the entire product.
  assert.match(bad, /“No phone number”/, "the finding's own label, not a mangled version of it");

  const clean = auditCopy.auditHeadline({ failures: 0, warnings: 0, score: 100 });
  assert.match(clean, /Nothing on this page is broken/);
  assert.doesNotMatch(clean, /costing/, "a clean page must not be told it is losing money");

  // The bridge to signing up has to name the alternative, or nobody believes it.
  const next = auditCopy.auditNextStep({ failures: 3, warnings: 1, free: true });
  assert.match(next, /whoever built your site/i, "a report that pretends there is no alternative is a report nobody believes");
  assert.match(next, /No card/);
  assert.match(auditCopy.auditNextStep({ failures: 0, warnings: 0, free: true }), /nothing to fix/i);
});

test("the audit page colours a failure differently from a pass", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/components/FreeAudit.tsx", import.meta.url), "utf8");
  // The severities the crawler actually emits — the old code matched three
  // values it has never produced, so everything rendered grey.
  assert.match(page, /s === "fail" \?/);
  assert.match(page, /s === "warn" \?/);
  assert.doesNotMatch(page, /s === "critical" \|\| s === "high"/, "the colours must match the values that exist");
  assert.match(page, /f\.severity === "pass" \? <CheckCircle2/, "a passing check must not wear a warning triangle");
  // And the cost, the fix and the bridge all reach the reader.
  for (const field of ["f.costs", "f.fix", "f.ours", "report.headline", "report.nextStep"]) {
    assert.ok(page.includes(field), `${field} never reaches the page`);
  }
});
