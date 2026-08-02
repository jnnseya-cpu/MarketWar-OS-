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
    assert.match(src, /if \(!demoFallbackAllowed\(\)\) throw new Error\(LIVE_AI_UNAVAILABLE\)/,
      `${mod} can still serve invented content to a paying customer`);
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
