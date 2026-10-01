import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";

// THE CONVERSIONS API OVER A REAL SOCKET.
//
// WHY THIS IS A SECOND FILE. `capiConfigured` and the pixel id are read at module
// load, and `tests/meta-capi.test.mjs` asserts the OFF state — that a deployment
// with no token says so instead of failing. One process, one module instance, so
// the ON state needs its own file. Stated because a reader will otherwise assume
// the split is accidental and merge them, and then one of the two suites is
// measuring the wrong configuration.
//
// WHAT STANDS IN AND WHAT DOES NOT. graph.facebook.com is unreachable from CI and
// from the sandbox this was written in, so a local server plays Meta. Everything
// on our side is real: the consent check, the hashing, the JSON body, an actual
// HTTP round trip, the response reading and the timeout. `fetch` is intercepted
// only to rewrite the HOST, so what arrives at the stand-in is byte-for-byte what
// Meta would receive.
//
// A MUTATION THAT MADE THIS NECESSARY: `if (received < events.length)` → `if
// (false)`, which reports "sent" for a request Meta accepted and counted ZERO
// events from. Every structural assertion still passed. Only driving it catches
// that, and "200 is not the same as counted" is a confusion this platform has
// already shipped once on a money path.

const TOKEN = "stand-in-token-not-a-real-credential";
const PIXEL = "1080646761094543";
process.env.META_CAPI_ACCESS_TOKEN = TOKEN;
process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL;
delete process.env.META_CAPI_TEST_CODE;

const received = [];
let reply = { status: 200, body: { events_received: 1, fbtrace_id: "trace-1" } };
let delayMs = 0;

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(raw || "{}") });
    const send = () => {
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    };
    if (delayMs) setTimeout(send, delayMs); else send();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  return url.startsWith("https://graph.facebook.com/")
    ? realFetch(url.replace("https://graph.facebook.com", `http://127.0.0.1:${PORT}`), init)
    : realFetch(input, init);
};
test.after(() => { globalThis.fetch = realFetch; server.close(); });

const capi = await import("../src/backend/meta-capi.ts");
const consent = await import("../src/backend/analytics-consent.ts");
const { conversionEventId } = await import("../src/shared/capi.ts");

const UID = `capi-wire-${Date.now()}`;
const EMAIL = "ann@example.com";
const DIGEST = createHash("sha256").update(EMAIL, "utf8").digest("hex");
await consent.recordAnalyticsConsent({ uid: UID, choice: "granted" });

const send = (over = {}) => capi.sendCapiConversion({
  name: "subscribe", stripeEventId: "evt_wire", uid: UID,
  value: 49, currency: "GBP", plan: "growth",
  user: { email: EMAIL, clientIp: "1.2.3.4", userAgent: "UA/1" },
  ...over,
});

test("configured, and the request is the one Meta documents", async () => {
  reply = { status: 200, body: { events_received: 1, fbtrace_id: "trace-1" } };
  assert.equal(capi.capiConfigured(), true, "this file exists to test the ON state");
  const before = received.length;
  const r = await send();
  assert.equal(r.sent, true, r.sent === false ? r.why : "");
  assert.equal(received.length, before + 1, "exactly one request per conversion");

  const req = received[received.length - 1];
  assert.match(req.url, new RegExp(`/${PIXEL}/events$`), "the pixel's events edge");
  assert.equal(req.auth, `Bearer ${TOKEN}`, "the token is a header");
  assert.ok(!req.url.includes(TOKEN), "a secret must never travel in a URL");

  const ev = req.body.data[0];
  assert.equal(ev.event_name, "Subscribe");
  assert.equal(ev.event_id, conversionEventId("evt_wire", "subscribe"), "derived, so the Pixel copy de-duplicates");
  assert.deepEqual(ev.user_data.em, [DIGEST], "the address goes hashed, as an array");
  assert.equal(ev.custom_data.value, 49);
  assert.equal(req.body.test_event_code, undefined, "no test code — this would be a real conversion");

  // THE WHOLE POINT OF THE HASHING, checked against the serialised request rather
  // than against the object we built.
  assert.ok(!JSON.stringify(req.body).includes(EMAIL), "no plaintext address anywhere in the request");
});

test("200 with nothing counted is NOT success", async () => {
  // THE MUTATION THIS EXISTS FOR. Meta can accept a request and count zero
  // events; reporting that as sent is the "a 200 means it worked" confusion this
  // platform has already shipped once on a money path.
  reply = { status: 200, body: { events_received: 0 } };
  const r = await send({ stripeEventId: "evt_zero" });
  assert.equal(r.sent, false);
  assert.match(r.why, /counted 0 of 1/);

  // And a partial batch is the same fault.
  reply = { status: 200, body: { events_received: 1 } };
  const two = await capi.postEvents([
    { event_name: "Subscribe", event_time: 1, event_id: "a", action_source: "website", user_data: { em: ["x"] } },
    { event_name: "Purchase", event_time: 1, event_id: "b", action_source: "website", user_data: { em: ["y"] } },
  ]);
  assert.equal(two.sent, false);
  assert.match(two.why, /counted 1 of 2/);
});

test("Meta's refusal is read, not guessed at", async () => {
  // Credit-before-rate-limit is the same lesson `provider-failure.ts` learnt: a
  // bad token, a pixel the token cannot write to and a malformed event arrive as
  // the same status and want three different remedies.
  reply = { status: 400, body: { error: { message: "Invalid parameter", code: 100 } } };
  const bad = await send({ stripeEventId: "evt_400" });
  assert.equal(bad.sent, false);
  assert.match(bad.why, /Invalid parameter/, "Meta's own words must survive");
  assert.notEqual(bad.retriable, true, "a rejected event is not fixed by sending it again");

  reply = { status: 500, body: { error: { message: "Internal", code: 1 } } };
  const srv = await send({ stripeEventId: "evt_500" });
  assert.equal(srv.sent, false);
  assert.equal(srv.retriable, true, "a 5xx is worth another attempt");

  reply = { status: 429, body: { error: { message: "Too many", code: 4 } } };
  const slow = await send({ stripeEventId: "evt_429" });
  assert.equal(slow.retriable, true);
});

test("a hanging Meta does not hold the payment path open", async () => {
  // The webhook's real job — crediting the wallet — is already done. A conversion
  // report that never returns would make Stripe time out and redeliver a payment
  // that landed perfectly.
  reply = { status: 200, body: { events_received: 1 } };
  delayMs = 9_000;
  const t0 = Date.now();
  const r = await send({ stripeEventId: "evt_hang" });
  const took = Date.now() - t0;
  delayMs = 0;
  assert.equal(r.sent, false);
  assert.ok(took < 8_000, `it waited ${took}ms — the per-call timeout must bound this`);
  assert.match(r.why, /did not answer/);
  assert.match(r.why, /payment is credited/, "and it must say the money is safe, or this reads as a lost payment");
});

test("a refused consent stops the request before the socket, not after", async () => {
  reply = { status: 200, body: { events_received: 1 } };
  const uid = `${UID}-denied`;
  await consent.recordAnalyticsConsent({ uid, choice: "denied" });
  const before = received.length;
  const r = await send({ uid, stripeEventId: "evt_denied" });
  assert.equal(r.sent, false);
  assert.match(r.why, /refused analytics cookies/);
  assert.equal(received.length, before,
    "nothing may leave the process for somebody who said no — not even a request Meta would discard");
});

test("a test code is sent when set, and marks the event as not real", async () => {
  // NO MODULE RELOAD. `import("…?x=1")` resolves to the SAME module under tsx, so
  // the first version of this test set the env, re-imported, and measured the
  // original instance — it failed, correctly, and the fix was to stop snapshotting
  // the environment at module load. A toggle an operator flips while watching Test
  // Events must not need a cold start, and a setting read at call time is also the
  // only kind that can be tested in both states in one process.
  reply = { status: 200, body: { events_received: 1 } };
  process.env.META_CAPI_TEST_CODE = "TEST12345";
  const before = received.length;
  const r = await capi.sendCapiConversion({
    name: "topup", stripeEventId: "evt_test", uid: UID, value: 20, currency: "GBP",
    user: { email: EMAIL },
  });
  assert.equal(r.sent, true, r.sent === false ? r.why : "");
  assert.equal(received.length, before + 1);
  assert.equal(received[received.length - 1].body.test_event_code, "TEST12345",
    "the code must reach the request body or the events appear as real conversions");
  const status = capi.capiStatus();
  assert.equal(status.testMode, true);
  assert.match(status.note, /do NOT count as real conversions/);
  delete process.env.META_CAPI_TEST_CODE;
});
