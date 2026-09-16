import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// WHAT THESE TESTS ARE FOR.
//
// Every tracking pixel, click wrapper and unsubscribe link this platform has
// produced carried the recipient's address in the URL as base64 — recoverable by
// anybody with a log, a proxy, or a forwarded copy of the message. The HMAC
// after the dot stopped forgery and did nothing about reading.
//
// So the assertion that matters is not "a token round-trips". It is that the
// address CANNOT BE READ OUT of the token by someone without the key — which is
// exactly what the previous format would have passed a round-trip test on.

const { sealToken, openToken, isOpaqueToken } = await import("../src/backend/opaque-token.ts");

const SECRET = "test-secret-value-long-enough-for-hkdf";
const EMAIL = "someone@example.com";

test("the address cannot be read out of a sealed token", () => {
  const t = sealToken(["brand-1", EMAIL, "spring"], "email-tracking", SECRET);

  // The literal address is not in the token.
  assert.ok(!t.includes(EMAIL));
  assert.ok(!t.includes("example.com"));

  // AND NOT UNDER ANY ORDINARY DECODING. This is the assertion the old format
  // failed and a round-trip test would never have caught: base64url the payload
  // and the address falls straight out.
  const body = t.slice(t.indexOf(".") + 1);
  for (const enc of ["base64url", "base64", "hex", "utf8", "latin1"]) {
    const decoded = Buffer.from(body, enc).toString("utf8");
    assert.ok(!decoded.includes("example.com"), `the address was readable as ${enc}`);
    assert.ok(!decoded.includes("someone"), `the local part was readable as ${enc}`);
  }

  // Proof the old shape really did fail this, so the test is anchored to the
  // defect rather than to a format.
  const legacy = Buffer.from(`brand-1|${EMAIL}|spring`).toString("base64url");
  assert.ok(Buffer.from(legacy, "base64url").toString("utf8").includes(EMAIL),
    "the legacy payload was plainly readable — that is what this replaced");
});

test("the fields come back exactly, through the seal", () => {
  const t = sealToken(["brand-1", EMAIL, "spring"], "email-tracking", SECRET);
  assert.deepEqual(openToken(t, "email-tracking", SECRET), ["brand-1", EMAIL, "spring"]);
});

test("a tampered token does not open — the GCM tag replaces the HMAC", () => {
  const t = sealToken(["brand-1", EMAIL, ""], "email-tracking", SECRET);
  const body = t.slice(t.indexOf(".") + 1);
  const raw = Buffer.from(body, "base64url");
  // Flip one bit of the ciphertext.
  raw[raw.length - 1] ^= 0x01;
  const tampered = `v2.${raw.toString("base64url")}`;
  assert.equal(openToken(tampered, "email-tracking", SECRET), null);

  // And a bit flipped in the IV, which is not covered by a naive "verify the
  // last N bytes" scheme but is covered by GCM.
  const raw2 = Buffer.from(body, "base64url");
  raw2[0] ^= 0x01;
  assert.equal(openToken(`v2.${raw2.toString("base64url")}`, "email-tracking", SECRET), null);
});

test("a token sealed for one purpose cannot be opened as another", () => {
  // A newsletter unsubscribe link replayed at the open-tracking endpoint would
  // otherwise record an open for an address that never opened anything.
  const t = sealToken([EMAIL], "newsletter-unsubscribe", SECRET);
  assert.deepEqual(openToken(t, "newsletter-unsubscribe", SECRET), [EMAIL]);
  assert.equal(openToken(t, "email-tracking", SECRET), null);
});

test("a token sealed under one secret cannot be opened under another", () => {
  const t = sealToken([EMAIL], "email-tracking", SECRET);
  assert.equal(openToken(t, "email-tracking", "a-completely-different-secret"), null);
});

test("two tokens for the same address do not match — they cannot be correlated", () => {
  // A deterministic seal would let anybody holding two URLs tell they went to
  // the same person, which gives away most of what the encryption is for.
  const a = sealToken(["b", EMAIL, "c1"], "email-tracking", SECRET);
  const b = sealToken(["b", EMAIL, "c1"], "email-tracking", SECRET);
  assert.notEqual(a, b);
  assert.deepEqual(openToken(a, "email-tracking", SECRET), openToken(b, "email-tracking", SECRET));
});

test("rubbish in never throws — these arrive from URLs anyone can type", () => {
  for (const bad of ["", "v2.", "v2.!!!!", "v2.AAAA", "not-a-token", "a.b", "v2." + "A".repeat(200)]) {
    assert.equal(openToken(bad, "email-tracking", SECRET), null, `threw or returned on ${JSON.stringify(bad)}`);
  }
});

test("the token is URL-safe — it travels in a query string", () => {
  const t = sealToken(["brand-1", "a+b@example.com", "summer/2026"], "email-tracking", SECRET);
  assert.equal(encodeURIComponent(t), t, "it must survive a query string without escaping");
  assert.ok(isOpaqueToken(t));
  assert.deepEqual(openToken(t, "email-tracking", SECRET), ["brand-1", "a+b@example.com", "summer/2026"]);
});

// ---------------------------------------------------------------------------
// THE CALLERS.
// ---------------------------------------------------------------------------

test("tracking tokens are minted sealed and legacy ones still open", async () => {
  process.env.EMAIL_TRACKING_SECRET = "tracking-secret-for-this-test-abcdef";
  const ev = await import("../src/backend/email-events.ts");

  const t = ev.signToken("brand-9", "Person@Example.com", "camp-1");
  assert.ok(isOpaqueToken(t), "new tokens must be sealed");
  assert.ok(!t.includes("Example.com") && !t.toLowerCase().includes("person"));
  assert.deepEqual(ev.verifyToken(t), { brandId: "brand-9", email: "person@example.com", campaign: "camp-1" });

  // THE ALREADY-DELIVERED MESSAGE STILL WORKS. One message has been sent in this
  // platform's life and its unsubscribe link is in the old format; refusing it
  // would leave that recipient unable to opt out, which the bulk-sender rules
  // do not permit and which is worse than the disclosure it would tidy up.
  const { createHmac } = await import("node:crypto");
  const b64 = Buffer.from("brand-9|person@example.com|camp-1").toString("base64url");
  const sig = createHmac("sha256", process.env.EMAIL_TRACKING_SECRET).update(b64).digest("base64url").slice(0, 24);
  assert.deepEqual(ev.verifyToken(`${b64}.${sig}`),
    { brandId: "brand-9", email: "person@example.com", campaign: "camp-1" });

  // A legacy token with a wrong signature is still refused.
  assert.equal(ev.verifyToken(`${b64}.wrongsignaturevaluehere`), null);
  assert.equal(ev.verifyToken("v2.garbage"), null);
});

test("a campaign name containing the separator survives, which it did not before", async () => {
  process.env.EMAIL_TRACKING_SECRET = "tracking-secret-for-this-test-abcdef";
  const ev = await import("../src/backend/email-events.ts");
  const t = ev.signToken("b", "p@e.com", "spring|summer");
  assert.equal(ev.verifyToken(t).campaign, "spring|summer",
    "the legacy parser split on | into three consts and dropped the rest");
});

test("the newsletter unsubscribe token is sealed too, and its old links still work", async () => {
  const env = { NEWSLETTER_SECRET: "newsletter-secret-long-enough-here" };
  const nl = await import("../src/backend/newsletter.ts");

  const t = nl.unsubscribeToken("Reader@Example.com", env);
  assert.ok(isOpaqueToken(t));
  assert.ok(!t.includes("Example.com") && !t.toLowerCase().includes("reader"));

  const ok = await nl.unsubscribe(t, env);
  assert.equal(ok.ok, true);
  assert.equal(ok.email, "reader@example.com");

  // Legacy newsletter link — still honoured, for the same reason.
  const { createHmac } = await import("node:crypto");
  const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const legacy = `${b64url(Buffer.from("old@example.com"))}.${b64url(createHmac("sha256", env.NEWSLETTER_SECRET).update("old@example.com").digest())}`;
  const old = await nl.unsubscribe(legacy, env);
  assert.equal(old.ok, true);
  assert.equal(old.email, "old@example.com");

  // And a forged one is still refused.
  const forged = `${b64url(Buffer.from("victim@example.com"))}.notasignature`;
  assert.equal((await nl.unsubscribe(forged, env)).ok, false);
});

test("no token minted anywhere still base64s an address into a URL", () => {
  // THE TWIN-DEFECT GUARD. The tracking token was fixed once before this file
  // existed; the newsletter had the identical fault in its own function, and
  // fixing one instance while leaving its twin is a failure catalogued twice in
  // STATE.md. This fails if either comes back, or if a third appears.
  const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const f of ["src/backend/email-events.ts", "src/backend/newsletter.ts"]) {
    const code = codeOf(readFileSync(f, "utf8"));
    // Minting is what matters: a base64 of an address heading into a token.
    assert.doesNotMatch(code, /b64url\(Buffer\.from\(e\)\)/, `${f} base64s an address into a token`);
    assert.doesNotMatch(code, /Buffer\.from\(payload\)\.toString\("base64url"\)/, `${f} base64s a payload into a token`);
    assert.match(code, /sealToken\(/, `${f} must mint through the sealed primitive`);
  }
});

test("a sending deployment on the fallback tracking secret is told so", async () => {
  const { launchReport, readLaunchEnv } = await import("../src/backend/launch-check.ts");
  const find = (r, id) => r.findings.find((x) => x.id === id);

  // Sending configured, no tracking secret → warned.
  const warned = launchReport(readLaunchEnv({ SMTP_HOST: "mail.example.com", SMTP_USER: "u" }));
  assert.ok(find(warned, "tracking-secret-default"), "a sending deployment must be told");
  assert.equal(find(warned, "tracking-secret-default").severity, "warning",
    "nothing is broken and nobody is charged for nothing — it is not a blocker");

  // Set → silent.
  const quiet = launchReport(readLaunchEnv({
    SMTP_HOST: "mail.example.com", SMTP_USER: "u", EMAIL_TRACKING_SECRET: "x".repeat(40),
  }));
  assert.equal(find(quiet, "tracking-secret-default"), undefined);

  // NOT SENDING → SILENT. A deployment that mints no tokens puts no address
  // anywhere, and a permanent red light nobody can clear is one people learn to
  // ignore. This is the half that makes the rule a combination rather than a
  // variable check.
  const demo = launchReport(readLaunchEnv({}));
  assert.equal(find(demo, "tracking-secret-default"), undefined);

  // And the finding must never print the secret itself.
  const text = JSON.stringify(warned.findings);
  assert.ok(!text.includes("x".repeat(20)));
});
