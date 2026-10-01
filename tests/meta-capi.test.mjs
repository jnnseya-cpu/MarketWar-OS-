import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// THE CONVERSIONS API, AND THE TWO WAYS IT IS WORSE THAN NOT HAVING ONE.
//
//   1. IT DOUBLE-COUNTS. Meta de-duplicates a Pixel event against a server event
//      when `event_name` AND `event_id` both match. Get the id wrong and every
//      payment is two conversions: revenue in Ads Manager twice what the bank
//      says, ROAS twice what it is, and the bidding trained on it. The first
//      test is the one that matters.
//
//   2. IT SENDS WITHOUT CONSENT. A server-to-server call bypasses the cookie
//      banner, Consent Mode, the ad blocker and the browser's own tracking
//      prevention — the one tracking path a person cannot refuse by any means
//      available to them.
//
// Everything else here is detail.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("THE DE-DUPLICATION KEY: both sides derive the same id from the same place", async () => {
  const { conversionEventId } = await import("../src/shared/capi.ts");
  const { conversionsFor } = await import("../src/shared/conversion-report.ts");

  const credit = {
    eventId: "evt_1Abc", kind: "subscription", acu: 980, planId: "growth",
    cycle: "monthly", amountMinor: 4900, currency: "GBP", at: new Date().toISOString(),
  };

  // The BROWSER's id, as ConversionReporter would pass it to `track`.
  const decision = conversionsFor(credit, new Set());
  const browserId = decision.events[0].eventId;

  // The SERVER's id, as `buildCapiEvent` derives it from the same Stripe event.
  const { buildCapiEvent } = await import("../src/shared/capi.ts");
  const built = buildCapiEvent({
    name: "subscribe", stripeEventId: credit.eventId, atMs: Date.now(), nowMs: Date.now(),
    value: 49, currency: "GBP", hashed: { em: "x" },
  });
  assert.equal(built.ok, true, built.ok === false ? built.why : "");

  assert.equal(browserId, built.event.event_id,
    "the browser and the server must send the SAME event_id or Meta counts the payment twice");
  assert.ok(browserId.includes("evt_1Abc"), "it must be derived from Stripe's event id, not generated");
  assert.equal(conversionEventId("evt_1Abc", "subscribe"), browserId);

  // And the NAME is part of it, because the same payment may produce two events
  // and Meta matches on the pair.
  assert.notEqual(conversionEventId("evt_1Abc", "subscribe"), conversionEventId("evt_1Abc", "topup"));
  // Nothing to derive from is an empty string, which `buildCapiEvent` refuses.
  assert.equal(conversionEventId("", "subscribe"), "");
  assert.equal(conversionEventId("evt_1", ""), "");
});

test("a random event id is never used for a money event", () => {
  // The failure mode this guards: somebody simplifies ConversionReporter back to
  // `track(e.name, e.params)`, the id falls back to a UUID, and every payment is
  // reported twice with nothing failing.
  const reporter = codeOf(readFileSync("src/components/ConversionReporter.tsx", "utf8"));
  assert.match(reporter, /track\(e\.name, e\.params, \{ eventId: e\.eventId \}\)/,
    "the derived id must be passed through to the transport");

  const analytics = codeOf(readFileSync("src/frontend/analytics.ts", "utf8"));
  assert.match(analytics, /const id = opts\?\.eventId \|\| eventId\(\);/,
    "a caller-supplied id must win over the random one");
  assert.match(analytics, /\{ eventID: id \}/, "and it must be what reaches fbq");
});

test("no send without a recorded consent, and every refusal says why", async () => {
  const c = await import("../src/backend/analytics-consent.ts");

  const none = await c.mayReportConversions(null);
  assert.equal(none.ok, false);
  assert.match(none.why, /no account/i);

  const uid = `capi-consent-${Date.now()}`;
  const unasked = await c.mayReportConversions(uid);
  assert.equal(unasked.ok, false, "an account that has never chosen must not be reported on");
  assert.match(unasked.why, /has not made a cookie choice/i);

  await c.recordAnalyticsConsent({ uid, choice: "denied" });
  const refused = await c.mayReportConversions(uid);
  assert.equal(refused.ok, false, "a refusal in the browser is a refusal on the server");
  assert.match(refused.why, /refused analytics cookies/i);

  await c.recordAnalyticsConsent({ uid, choice: "granted" });
  const allowed = await c.mayReportConversions(uid);
  assert.equal(allowed.ok, true, allowed.why);

  // AN OLD YES DOES NOT COVER A NEW USE. The browser bumps its storage key when
  // the purposes change; a stored consent against the old version must stop
  // authorising sends at the same moment, or the bump only applies to half the
  // platform.
  await c.recordAnalyticsConsent({ uid, choice: "granted" });
  const stale = { uid, choice: "granted", version: "mw-cookie-consent-v0", at: new Date().toISOString() };
  const checked = c.consentFromStored(uid, stale);
  assert.equal(checked.version, "mw-cookie-consent-v0");
  assert.notEqual(checked.version, c.CONSENT_VERSION, "the test fixture must actually be stale");
});

test("the consent version is the same string the browser keys its choice by", () => {
  // FIRST DEFECT CLASS. The gate bumps `STORAGE_KEY` when the purposes change. If
  // the server's version does not move with it, an old yes keeps authorising
  // server-side sends after the browser has stopped honouring it.
  const gate = readFileSync("src/components/CookieConsent.tsx", "utf8");
  const key = (gate.match(/const STORAGE_KEY = "([^"]+)"/) || [])[1];
  const server = readFileSync("src/backend/analytics-consent.ts", "utf8");
  const version = (server.match(/export const CONSENT_VERSION = "([^"]+)"/) || [])[1];
  assert.ok(key, "the gate must declare a storage key");
  assert.equal(version, key,
    "CONSENT_VERSION and the banner's STORAGE_KEY must be the same string, or bumping one leaves the other authorising");
});

test("a stored document is checked, never trusted — half a record is not a yes", async () => {
  const { consentFromStored } = await import("../src/backend/analytics-consent.ts");
  const good = { choice: "granted", version: "mw-cookie-consent-v1", at: "2026-10-01T00:00:00Z" };
  assert.ok(consentFromStored("u", good));

  for (const bad of [
    null, undefined, "granted", 42, {},
    { choice: "yes", version: "v1", at: "t" },
    { choice: "granted", version: "", at: "t" },
    { choice: "granted", version: "v1", at: "" },
    { choice: "granted", at: "t" },
    { version: "v1", at: "t" },
  ]) {
    assert.equal(consentFromStored("u", bad), null,
      `${JSON.stringify(bad)} must not read as a consent to send somebody's data to Meta`);
  }
});

test("the sender checks consent BEFORE it assembles anything", () => {
  // Order matters: checking last leaves this function one edit away from building
  // and posting an event for somebody who said no.
  const code = codeOf(readFileSync("src/backend/meta-capi.ts", "utf8"));
  const consent = code.indexOf("mayReportConversions(input.uid)");
  const build = code.indexOf("buildCapiEvent({");
  const post = code.indexOf("postEvents([built.event])");
  assert.ok(consent > 0 && build > consent, "consent must be checked before the event is built");
  assert.ok(post > build, "and certainly before it is posted");
  assert.match(code, /if \(!permitted\.ok\) return \{ sent: false, why: permitted\.why \};/,
    "and the answer must be acted on, not merely obtained");
});

test("identifiers are hashed the way Meta hashes its own copy", async () => {
  const { hashUserData } = await import("../src/backend/meta-capi.ts");
  const expected = createHash("sha256").update("ann@example.com", "utf8").digest("hex");

  // Normalisation is not cosmetic: Meta normalises before hashing too, so a
  // difference in case or whitespace drops the match rate to zero and nothing
  // reports an error.
  for (const input of ["ann@example.com", "  Ann@Example.COM  ", "ANN@EXAMPLE.COM"]) {
    assert.equal(hashUserData({ email: input }).em, expected, `${JSON.stringify(input)} must hash to the same digest`);
  }

  // A DIGEST OF RUBBISH IS STILL A DISCLOSURE, and matches nobody.
  for (const bad of [null, undefined, "", "not-an-email", "a@b"]) {
    assert.equal(hashUserData({ email: bad }).em, undefined, `${JSON.stringify(bad)} must not be hashed and sent`);
  }

  // A LOCAL PHONE NUMBER IS NOT SENT. "07700900123" is a different string from
  // the "447700900123" Meta holds, and guessing the country code is inventing
  // data about a person.
  assert.equal(hashUserData({ phone: "07700 900123" }).ph, undefined, "a local number matches nobody");
  assert.equal(hashUserData({ phone: "+44 7700 900123" }).ph,
    createHash("sha256").update("447700900123", "utf8").digest("hex"));
});

test("an event with nothing to match on is refused, not sent", async () => {
  const { buildCapiEvent } = await import("../src/shared/capi.ts");
  const now = Date.now();
  const base = { name: "subscribe", stripeEventId: "evt_x", atMs: now, nowMs: now, value: 49, currency: "GBP" };

  // Meta ACCEPTS an identifier-less event, attributes it to nobody and reports no
  // error — so it arrives, counts as delivered, and does nothing.
  const blind = buildCapiEvent({ ...base, hashed: {} });
  assert.equal(blind.ok, false);
  assert.match(blind.why, /attribute this event to nobody|attribute it to nobody/i);

  // An IP alone is weak but real, so that IS enough.
  assert.equal(buildCapiEvent({ ...base, hashed: {}, clientIp: "1.2.3.4" }).ok, true);
  assert.equal(buildCapiEvent({ ...base, hashed: {}, fbp: "fb.1.123.456" }).ok, true);

  // Not a money event: nothing else is sent server-side.
  const wrong = buildCapiEvent({ ...base, name: "audit_lead", hashed: { em: "x" } });
  assert.equal(wrong.ok, false);
  assert.match(wrong.why, /no Conversions API equivalent/);

  // OLDER THAN SEVEN DAYS is a rejected request, not a conversion.
  const old = buildCapiEvent({ ...base, hashed: { em: "x" }, atMs: now - 8 * 24 * 3600 * 1000 });
  assert.equal(old.ok, false);
  assert.match(old.why, /older than 7 days/);
});

test("the event body is what Meta's schema expects", async () => {
  const { buildCapiEvent, CAPI_EVENT_NAMES } = await import("../src/shared/capi.ts");
  const now = 1_790_000_000_000;
  const r = buildCapiEvent({
    name: "topup", stripeEventId: "evt_t", atMs: now - 5_000, nowMs: now,
    value: 20, currency: "gbp", plan: "growth",
    hashed: { em: "deadbeef" }, clientIp: "9.9.9.9", userAgent: "UA", fbp: "fb.1.2.3",
    sourceUrl: "https://marketwaros.com/dashboard/billing",
  });
  assert.equal(r.ok, true, r.ok === false ? r.why : "");
  const e = r.event;
  assert.equal(e.event_name, "Purchase", "a top-up is a Purchase to Meta");
  assert.equal(CAPI_EVENT_NAMES.subscribe, "Subscribe");
  assert.equal(e.event_time, Math.floor((now - 5_000) / 1000), "seconds, and the payment's time not ours");
  assert.equal(e.action_source, "website",
    "a person bought this on the website; a webhook confirming it is our plumbing, not Meta's concern");
  assert.deepEqual(e.user_data.em, ["deadbeef"], "hashed identifiers go as arrays");
  assert.equal(e.user_data.client_ip_address, "9.9.9.9");
  assert.equal(e.user_data.fbp, "fb.1.2.3");
  assert.equal(e.custom_data.value, 20);
  assert.equal(e.custom_data.currency, "GBP", "upper-cased, as the schema wants");
  assert.equal(e.custom_data.content_name, "growth");
  assert.equal(e.event_source_url, "https://marketwaros.com/dashboard/billing");

  // No value means no value KEY — not a zero, which is a conversion worth nothing.
  const free = buildCapiEvent({ name: "subscribe", stripeEventId: "e", atMs: now, nowMs: now, hashed: { em: "x" } });
  assert.equal(free.ok, true);
  assert.equal(free.event.custom_data, undefined, "an event with no amount must carry no value at all");
});

test("off by default, and it says so rather than failing", async () => {
  const { capiConfigured, capiStatus, sendCapiConversion } = await import("../src/backend/meta-capi.ts");
  // No token in this environment, which is the zero-config state every deployment
  // starts in. It must be a stated absence, not an error.
  assert.equal(capiConfigured(), false);
  const s = capiStatus();
  assert.equal(s.configured, false);
  assert.match(s.note, /META_CAPI_ACCESS_TOKEN/);
  assert.match(s.note, /Events Manager/, "the remedy must name where the token comes from");
  assert.doesNotMatch(JSON.stringify(s), /[A-Za-z0-9_-]{30,}/, "the status must never echo a token");

  const res = await sendCapiConversion({ name: "subscribe", stripeEventId: "evt_1", uid: "anyone", value: 49 });
  assert.equal(res.sent, false);
  assert.match(res.why, /not set/);
  // And it must say the Pixel still works, or an operator reads this as "no
  // tracking at all" and goes looking for a fault that is not there.
  assert.match(capiStatus().note, /browser Pixel still reports/);
});

test("a test code is reported as a test code — a tagged event is not a conversion", async () => {
  const { capiStatus } = await import("../src/backend/meta-capi.ts");
  const code = codeOf(readFileSync("src/backend/meta-capi.ts", "utf8"));
  assert.match(code, /META_CAPI_TEST_CODE/);
  assert.match(code, /\.\.\.\(code \? \{ test_event_code: code \} : \{\}\)/,
    "the code must actually reach the request body");
  // READ AT CALL TIME. A module-level snapshot means an operator who sets the
  // variable finds it takes effect only on the next cold start, and a toggle that
  // needs a redeploy is not a toggle.
  assert.match(code, /const testCode = \(\) =>/, "the test code must not be snapshotted at module load");
  // The status line must distinguish the two, because "server-side conversions
  // are on" while every event is tagged TEST is a false green.
  assert.match(code, /do NOT count as real conversions/);
  assert.equal(capiStatus().testMode, false, "unset in this environment");
});

test("the webhook reports from the wallet stamp, never from the Stripe event alone", () => {
  const route = codeOf(readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8"));
  // The stamp is written in the same transaction as the credit, so its presence
  // is the proof money landed. §143: the commercial-loop driver claimed a credit
  // from the event TYPE and printed "PROVEN END TO END" for a delivery that
  // credited nothing.
  assert.match(route, /const credit = wallet\.lastCredit;/);
  assert.match(route, /credit\.eventId !== event\.id/,
    "a stamp from an EARLIER payment must not be reported as this event's sale");
  assert.match(route, /walletApplied\?\.applied/, "and only when the credit actually applied");

  // It must never turn a good payment into a redelivery.
  assert.doesNotMatch(route, /conversion[\s\S]{0,400}status: 500/,
    "a failed conversion report must never produce a 500 — Stripe reads that as 'send it again'");
  assert.match(route, /conversion = \{ sent: false, why: `conversion reporting failed/,
    "a throw must be captured, not propagated");
});

test("a replayed webhook reports nothing, because the credit did not apply", () => {
  // applyWebhookOutcome is idempotent by event id and returns applied:false on a
  // redelivery, and the conversion block is gated on applied — so a Stripe
  // redelivery cannot produce a second conversion even before Meta's own
  // de-duplication is considered. Two independent guards on the same failure.
  const route = codeOf(readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8"));
  const gate = route.indexOf("if (outcome.handled && walletApplied?.applied) {\n    try {\n      const orgId");
  assert.ok(gate > 0, "the conversion send must sit behind the applied gate");
});

test("nothing logs a plaintext identifier", () => {
  const capi = readFileSync("src/backend/meta-capi.ts", "utf8");
  const route = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
  // The point of hashing is undone by an error line quoting the address it failed
  // on. There is no console call in the sender at all, which is the simplest
  // version of that guarantee.
  assert.doesNotMatch(codeOf(capi), /console\.(log|error|warn|info)/,
    "the Conversions API sender must not log — a failure line is where a plaintext address escapes");
  assert.doesNotMatch(codeOf(route), /console\.[a-z]+\([^)]*email/i, "and the webhook must not log the address either");
  // The email is read and passed, never stored or returned.
  assert.doesNotMatch(codeOf(route), /conversion = \{[^}]*email/, "the response body must not carry the address");
});

// ---------------------------------------------------------------------------
// WHICH ADVERT CLICK A PAYMENT BELONGS TO.
//
// An email match tells Meta that a customer bought. It does not tell Meta which
// click they came from, which is the question an ad campaign is paying to have
// answered. `_fbp` and `_fbc` are Meta's own cookies and exist only in a browser,
// so they are read when checkout starts and carried to the webhook on the Stripe
// session's metadata.
// ---------------------------------------------------------------------------

test("the click ids are read off a real Cookie header, and only the valid ones", async () => {
  const { clickIdsFromCookie, isMetaClickId } = await import("../src/shared/click-attribution.ts");
  const fbp = "fb.1.1790000000000.1234567890";
  const fbc = "fb.1.1790000000000.AbCdEf_click-123";

  const got = clickIdsFromCookie(`sessionid=abc; _fbp=${fbp}; other=1; _fbc=${fbc}`);
  assert.deepEqual(got, { fbp, fbc });

  // URL-encoded, which is how a browser may send it.
  assert.equal(clickIdsFromCookie(`_fbc=${encodeURIComponent(fbc)}`).fbc, fbc);

  // VALIDATED, NOT JUST READ. Meta rejects a malformed value, and a rejected
  // event is a rejected request rather than a conversion.
  for (const bad of ["", "nonsense", "fb.1.abc.def", "xx.1.1790000000000.a", `fb.1.1790000000000.${"x".repeat(500)}`]) {
    assert.equal(clickIdsFromCookie(`_fbp=${bad}`).fbp, undefined, `${bad.slice(0, 24)} must not be sent`);
    assert.equal(isMetaClickId(bad), false);
  }
  assert.deepEqual(clickIdsFromCookie(null), {});
  assert.deepEqual(clickIdsFromCookie(""), {});
  // A cookie that merely CONTAINS the name must not be read as it.
  assert.deepEqual(clickIdsFromCookie(`not_fbp=${fbp}`), {});
});

test("they are re-validated on the way back out of Stripe metadata", async () => {
  const { clickIdsFromMetadata, FBP_META_KEY, FBC_META_KEY } = await import("../src/shared/click-attribution.ts");
  const fbp = "fb.1.1790000000000.1234567890";
  assert.equal(clickIdsFromMetadata({ [FBP_META_KEY]: fbp }).fbp, fbp);
  // Metadata is a free-text store and is editable in the Stripe dashboard, so a
  // value checked on the way in can arrive changed. Trusting a round trip is how
  // a checked value becomes an unchecked one.
  assert.equal(clickIdsFromMetadata({ [FBP_META_KEY]: "edited-by-hand" }).fbp, undefined);
  assert.equal(clickIdsFromMetadata({ [FBC_META_KEY]: 12345 }).fbc, undefined);
  assert.deepEqual(clickIdsFromMetadata(undefined), {});
});

test("checkout stamps the click, and the webhook reads it back", () => {
  const checkout = codeOf(readFileSync("src/backend/checkout.ts", "utf8"));
  // Both checkouts, because a top-up is an advert conversion too.
  assert.equal((checkout.match(/prefixed\("metadata", clickMetadata\(input\.click \?\? \{\}\)\)/g) || []).length, 2,
    "the subscription AND the top-up must carry the click");

  for (const route of ["src/app/api/billing/subscribe/route.ts", "src/app/api/billing/topup/route.ts"]) {
    const code = codeOf(readFileSync(route, "utf8"));
    assert.match(code, /clickIdsFromCookie\(req\.headers\.get\("cookie"\)\)/,
      `${route} must read the click from the request, which is the only place it exists`);
    assert.match(code, /click/, `${route} must pass it on`);
  }

  const webhook = codeOf(readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8"));
  assert.match(webhook, /clickIdsFromMetadata\(\{/);
  // A RENEWAL finds the original click on the SUBSCRIPTION's metadata, not the
  // invoice's — otherwise a customer who came from an advert in January is
  // unattributed when they renew in June.
  assert.match(webhook, /obj\.subscription_details as \{ metadata\?: Record<string, unknown> \} \| undefined/,
    "a renewal's click lives on the subscription metadata");
  assert.match(webhook, /user: \{ email, fbp: click\.fbp, fbc: click\.fbc \}/);
});

test("the click ids are NOT hashed — hashing them would break the match", async () => {
  const { hashUserData } = await import("../src/backend/meta-capi.ts");
  const { buildCapiEvent } = await import("../src/shared/capi.ts");
  const fbp = "fb.1.1790000000000.1234567890";
  // They are Meta's own opaque identifiers, issued by Meta's own script, and Meta
  // matches them in plaintext. `hashUserData` must not touch them.
  assert.deepEqual(hashUserData({ fbp, fbc: fbp }), {}, "only the email and phone are hashed");
  const now = Date.now();
  const r = buildCapiEvent({ name: "subscribe", stripeEventId: "e", atMs: now, nowMs: now, hashed: {}, fbp });
  assert.equal(r.ok, true);
  assert.equal(r.event.user_data.fbp, fbp, "and it reaches Meta exactly as the cookie held it");
});
