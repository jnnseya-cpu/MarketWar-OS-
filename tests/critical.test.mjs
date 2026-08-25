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
  assert.match(route, /body\.action === "preview"/);
  assert.match(route, /source = "template"/, "a templateId must be previewed as a template");
  assert.match(route, /resolveBrandAccess/, "a preview renders real contacts and needs the same ownership proof as the send");

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
  assert.match(route, /webhookEndpointUrl\(req\.headers\.get\("host"\)/, "the GET must report the host it is actually served on");
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
  assert.match(route, /publicSendFailure\(sent\.failure\)/, "the route must map the category rather than pass the raw detail out");
  assert.match(route, /console\.warn/, "the precise server line has to go somewhere the operator can find it");
  assert.doesNotMatch(route, /emailNote = sent\.detail/, "the raw SMTP line must not be handed to a visitor");
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
