import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSmtp, tlsCreds } from "./helpers/fake-smtp.mjs";
import { smtpSendMany } from "../src/backend/email.ts";

// ---------------------------------------------------------------------------
// Campaign sending over one authenticated SMTP session.
//
// The single-send path opened a TCP connection, negotiated TLS and authenticated
// for EVERY message — about a second and a half of handshake before any content
// moved. Inside the send budget that capped a campaign at roughly 34 recipients
// per press, so a 250-a-day warm-up allowance took eight presses to spend.
//
// These run against a real socket, not a stub, because that is what caught the
// bug the stubs missed: after the STARTTLS upgrade the socket was reassigned but
// the timeout stayed on the discarded plaintext one, so a connection that died
// mid-session hung forever instead of failing.
// ---------------------------------------------------------------------------

// The client validates the server certificate. A per-run self-signed cert is not
// in any trust store, so verification is disabled for THIS test process only —
// never in product code.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const haveTls = Boolean(tlsCreds());
const opts = haveTls ? {} : { skip: "openssl unavailable — cannot run a TLS-capable fake SMTP server" };
const node = (port) => ({ label: "test", host: "127.0.0.1", port, user: "u", pass: "p", secure: false });
const msgs = (n, prefix = "r") =>
  Array.from({ length: n }, (_, i) => ({ to: `${prefix}${i}@example.com`, subject: `Subject ${i}`, html: `<p>Hello ${prefix}${i}@example.com</p>` }));

test("one connection carries the whole batch, each message personalised", opts, async () => {
  const f = fakeSmtp();
  const port = await f.listen();
  try {
    const res = await smtpSendMany(node(port), "s@marketwaros.com", msgs(20), { deadline: Date.now() + 20_000 });
    assert.equal(res.filter((r) => r.ok).length, 20);
    assert.equal(f.connections(), 1, "20 messages must not cost 20 TLS handshakes — that is the 34-per-press cap");
    assert.equal(f.received.length, 20);
    assert.ok(f.received.every((m) => m.body.includes(`Hello ${m.to}`)),
      "sharing a connection must not share content — every recipient keeps their own merged body");
  } finally { await f.close(); }
});

test("a rejected recipient fails alone; the batch carries on", opts, async () => {
  const f = fakeSmtp({ rejectRecipients: new Set(["r2@example.com"]) });
  const port = await f.listen();
  try {
    const res = await smtpSendMany(node(port), "s@marketwaros.com", msgs(6), { deadline: Date.now() + 20_000 });
    assert.equal(res.length, 6, "every address must be accounted for");
    const bad = res.find((r) => r.to === "r2@example.com");
    assert.equal(bad.ok, false);
    assert.match(bad.error, /550/, "and carry the provider's real reason, so it can be suppressed correctly");
    assert.equal(res.filter((r) => r.ok).length, 5, "one bad address must not cost the other five");
    assert.equal(f.received.length, 5);
  } finally { await f.close(); }
});

test("a connection that dies mid-batch reports exactly what was delivered", opts, async () => {
  // The double-send hazard. If we over-report, the retry mails those people
  // again; if we under-report, real sends are repeated too.
  const f = fakeSmtp({ dropAfter: 12 });
  const port = await f.listen();
  try {
    const res = await smtpSendMany(node(port), "s@marketwaros.com", msgs(40), { deadline: Date.now() + 20_000 });
    const sent = res.filter((r) => r.ok).length;
    assert.equal(sent, f.received.length,
      `reported ${sent} sent but the server accepted ${f.received.length} — a mismatch double-sends or drops on retry`);
    assert.equal(res.length, 40, "every address must be accounted for, sent or not");
  } finally { await f.close(); }
});

test("a dead connection settles instead of hanging", opts, async () => {
  // Regression: the timeout used to stay on the pre-STARTTLS socket, so this
  // never returned at all — the shape of a request that dies with no response.
  const f = fakeSmtp({ dropAfter: 1 });
  const port = await f.listen();
  try {
    const started = Date.now();
    const res = await smtpSendMany(node(port), "s@marketwaros.com", msgs(10), { deadline: Date.now() + 20_000 });
    assert.ok(Date.now() - started < 15_000, "it must not wait on a socket nothing is watching");
    assert.equal(res.length, 10);
  } finally { await f.close(); }
});

test("the deadline leaves unreached addresses UNTRIED, not failed", opts, async () => {
  const f = fakeSmtp();
  const port = await f.listen();
  try {
    const res = await smtpSendMany(node(port), "s@marketwaros.com", msgs(200), { deadline: Date.now() + 25 });
    assert.ok(res.length < 200, "the budget should have cut this short");
    assert.equal(res.filter((r) => !r.ok).length, 0,
      "an address never attempted is not a failure — marking it one would drop it from the next run");
    assert.equal(res.filter((r) => r.ok).length, f.received.length, "and the count must match what the server took");
  } finally { await f.close(); }
});

test("parallel sessions deliver every recipient exactly once", opts, async () => {
  const f = fakeSmtp();
  const port = await f.listen();
  try {
    const all = msgs(120);
    const lanes = [[], [], [], []];
    all.forEach((m, i) => lanes[i % 4].push(m));
    const res = (await Promise.all(
      lanes.map((lane) => smtpSendMany(node(port), "s@marketwaros.com", lane, { deadline: Date.now() + 20_000 })),
    )).flat();
    assert.equal(res.filter((r) => r.ok).length, 120);
    assert.equal(f.received.length, 120, "no duplicates across lanes");
    assert.equal(new Set(f.received.map((m) => m.to)).size, 120, "and nobody mailed twice");
    assert.equal(f.connections(), 4, "four lanes, four connections — not one per message");
  } finally { await f.close(); }
});
