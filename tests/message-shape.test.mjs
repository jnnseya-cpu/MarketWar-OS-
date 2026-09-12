import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSmtp, tlsCreds } from "./helpers/fake-smtp.mjs";
import { smtpSendMany } from "../src/backend/email.ts";
import {
  messageShape, streamOf, encodeHeaderWord, encodeAddressHeader, composeBody,
} from "../src/shared/message-shape.ts";
import { textPartFrom } from "../src/shared/html-text.ts";

// ---------------------------------------------------------------------------
// WHERE THE MAIL LANDS — the shape half of it, which is the half we control.
//
// Nobody can promise the Primary tab; it is a classifier on Google's side. What
// a sender decides is the SHAPE of the message, and the shape was wrong in the
// same way for every message this platform had ever sent:
//
//   • HTML and nothing else — no plain-text alternative, one of the oldest and
//     most reliable signals that a message is bulk rather than written,
//   • the `transactional` flag reaching the mailer and stopping there, so a
//     one-to-one message could not be shaped differently from a campaign,
//   • a pound sign in a subject line going out as a raw high byte.
//
// These assert on the BYTES THAT REACH A REAL SOCKET, not on a stub's idea of
// them, because the defect they cover is precisely a value that looked right one
// function before the wire and never arrived.
// ---------------------------------------------------------------------------

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const haveTls = Boolean(tlsCreds());
const wire = haveTls ? {} : { skip: "openssl unavailable — cannot run a TLS-capable fake SMTP server" };
const node = (port) => ({ label: "test", host: "127.0.0.1", port, user: "u", pass: "p", secure: false });

/** Split a captured DATA blob into its header block and its body. */
const parts = (raw) => {
  const s = String(raw).replace(/\r\n/g, "\n");
  const i = s.indexOf("\n\n");
  return { headers: i === -1 ? s : s.slice(0, i), body: i === -1 ? "" : s.slice(i + 2) };
};
const headerValue = (raw, name) => {
  const m = parts(raw).headers.match(new RegExp(`^${name}:[ \\t]*(.*)$`, "im"));
  return m ? m[1].trim() : null;
};

// ---------------------------------------------------------------------------
// 1. The stream decision, on its own.
// ---------------------------------------------------------------------------

test("a one-to-one message never carries the header that files it under Promotions", () => {
  const shape = messageShape({ transactional: true, listUnsubscribe: "https://x.test/u?t=1" });
  assert.equal(shape.stream, "conversational");
  assert.equal(shape.headers["List-Unsubscribe"], undefined,
    "an unsubscribe header on a personal message tells the classifier it is bulk marketing");
  assert.equal(shape.headers["Precedence"], undefined);
  assert.equal(shape.headers["List-ID"], undefined);
  assert.match(shape.dropped.join(" "), /List-Unsubscribe/,
    "and dropping it is reported, never silent — a caller asked for something it did not get");
});

test("a bulk message carries everything the sender rules require of bulk mail", () => {
  const shape = messageShape({
    transactional: false, listUnsubscribe: "https://x.test/u?t=1",
    brandId: "Koda Ltd", campaign: "Spring Offer", fromDomain: "koda.co.uk",
  });
  assert.equal(shape.stream, "bulk");
  assert.equal(shape.headers["List-Unsubscribe"], "<https://x.test/u?t=1>");
  assert.equal(shape.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click",
    "the URL alone is not one-click; the POST instruction is what makes it one");
  assert.equal(shape.headers["Precedence"], "bulk");
  assert.equal(shape.headers["List-ID"], "<koda-ltd.lists.koda.co.uk>");
  assert.equal(shape.headers["Feedback-ID"], "spring-offer:koda-ltd:bulk:marketwaros");
  assert.equal(shape.missing.length, 0);
});

test("bulk mail with no unsubscribe url is NAMED, not quietly sent", () => {
  const shape = messageShape({ transactional: false, brandId: "b", fromDomain: "b.test" });
  assert.equal(shape.headers["List-Unsubscribe"], undefined);
  assert.match(shape.missing.join(" "), /List-Unsubscribe/);
  assert.match(shape.missing.join(" "), /Google|Yahoo|Apple|Microsoft/,
    "and says who requires it, because that is the part that decides whether it reaches anyone");
});

test("an unmarked message is bulk, because guessing the other way is the dangerous guess", () => {
  // Treating an unknown message as one-to-one would strip the unsubscribe header
  // off real marketing, which is a compliance failure and the spam folder. The
  // wrong guess in this direction only costs the Promotions tab.
  assert.equal(streamOf({}), "bulk");
  assert.equal(streamOf({ transactional: false }), "bulk");
  assert.equal(streamOf({ transactional: true }), "conversational");
});

test("an automatic reply says so, and a reply threads", () => {
  const auto = messageShape({ transactional: true, autoReply: true });
  assert.equal(auto.headers["Auto-Submitted"], "auto-replied",
    "RFC 3834 — without it two auto-responders write to each other for ever");
  const reply = messageShape({ transactional: true, inReplyTo: "<abc@their.test>" });
  assert.equal(reply.headers["In-Reply-To"], "<abc@their.test>");
  assert.equal(reply.headers["References"], "<abc@their.test>");
});

// ---------------------------------------------------------------------------
// 2. RFC 2047 — a header is seven-bit ASCII, whatever the customer typed.
// ---------------------------------------------------------------------------

test("a pound sign in a subject is encoded; a plain subject is left alone", () => {
  assert.equal(encodeHeaderWord("Your April invoice"), "Your April invoice",
    "ASCII must pass through untouched or every normal subject becomes unreadable on the wire");
  const enc = encodeHeaderWord("Save £50 this April");
  assert.match(enc, /^=\?UTF-8\?B\?/);
  assert.ok(!/[^\x20-\x7E\r\n]/.test(enc), "nothing above 0x7E may survive into a header");
  assert.equal(Buffer.from(enc.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, ""), "base64").toString("utf8"),
    "Save £50 this April", "and it must decode back to exactly what was typed");
});

test("a long non-ASCII subject folds into encoded words that are each legal", () => {
  const enc = encodeHeaderWord("Économie garantie sur chaque commande passée avant le déjeuner de mardi prochain");
  for (const word of enc.split("\r\n ")) {
    assert.ok(word.length <= 75, `an encoded-word may not exceed 75 characters — got ${word.length}`);
    assert.match(word, /^=\?UTF-8\?B\?.*\?=$/);
  }
  const decoded = enc.split("\r\n ")
    .map((w) => Buffer.from(w.slice(10, -2), "base64").toString("utf8")).join("");
  assert.equal(decoded, "Économie garantie sur chaque commande passée avant le déjeuner de mardi prochain",
    "splitting on a byte boundary instead of a character boundary is how this becomes mojibake");
});

test("only the display name of an address is encoded — never the address", () => {
  const enc = encodeAddressHeader("Jean Noël <jean@koda.test>");
  assert.ok(enc.endsWith("<jean@koda.test>"), "wrapping the mailbox produces a name with no address behind it");
  assert.match(enc, /^=\?UTF-8\?B\?/);
  assert.equal(encodeAddressHeader("plain@koda.test"), "plain@koda.test");
});

// ---------------------------------------------------------------------------
// 3. The body — a text alternative on every message.
// ---------------------------------------------------------------------------

test("the text part keeps the destination of a real link and drops a tracking wrapper", () => {
  const text = textPartFrom(
    '<p>Hello.</p><p><a href="https://koda.test/book">Book a slot</a></p>' +
    '<p><a href="https://t.koda.test/api/track/click?t=x&u=y">Read more</a></p>',
  );
  assert.match(text, /Book a slot \(https:\/\/koda\.test\/book\)/,
    "a text-only reader must still be able to act, and the label alone is not actionable");
  assert.ok(!text.includes("/api/track/"),
    "a redirector URL is unreadable, identifies the recipient, and is the most spam-like thing on the page");
  assert.match(text, /Read more/, "the label stays; only the wrapper goes");
});

test("a message with a text part is multipart/alternative, text first", () => {
  const c = composeBody("<p>Hi</p>", "Hi", []);
  assert.match(c.contentType, /^multipart\/alternative; boundary="/);
  const textAt = c.body.indexOf("text/plain");
  const htmlAt = c.body.indexOf("text/html");
  assert.ok(textAt > -1 && htmlAt > -1 && textAt < htmlAt,
    "RFC 2046: a client shows the LAST part it can render, so HTML first means everyone reads the plain text");
});

test("with attachments the alternative is nested inside the mixed part, not replaced by it", () => {
  const c = composeBody("<p>Hi</p>", "Hi", [{ filename: "a.pdf", contentBase64: "AAAA" }]);
  assert.match(c.contentType, /^multipart\/mixed; boundary="/);
  assert.match(c.body, /Content-Type: multipart\/alternative/,
    "attaching a file must not cost the recipient their plain-text alternative");
  assert.match(c.body, /filename="a\.pdf"/);
});

test("no text to offer means the previous single-part shape, not an empty half", () => {
  const c = composeBody("<p>Hi</p>", "", []);
  assert.equal(c.contentType, "text/html; charset=utf-8");
  assert.equal(c.hasText, false);
});

// ---------------------------------------------------------------------------
// 4. THE WIRE. Everything above is a claim about a function; this is what a
//    receiving server actually gets.
// ---------------------------------------------------------------------------

test("every message reaching the socket carries a plain-text alternative", wire, async () => {
  const f = fakeSmtp();
  const port = await f.listen();
  try {
    await smtpSendMany(node(port), "s@marketwaros.com", [
      { to: "a@example.com", subject: "Hello", html: "<p>Come and see us on Tuesday.</p>" },
    ], { deadline: Date.now() + 20_000 });
    assert.equal(f.received.length, 1);
    const raw = f.received[0].body;
    assert.match(headerValue(raw, "Content-Type"), /^multipart\/alternative/,
      "HTML with no text alternative is one of the oldest bulk-mail signals there is");
    assert.match(raw, /Content-Type: text\/plain; charset=utf-8/);
    assert.match(raw, /Come and see us on Tuesday\./);
  } finally { await f.close(); }
});

test("a one-to-one message reaches the wire with no bulk clothing on it", wire, async () => {
  const f = fakeSmtp();
  const port = await f.listen();
  try {
    await smtpSendMany(node(port), "s@marketwaros.com", [{
      to: "a@example.com", subject: "Your report", html: "<p>Here it is.</p>",
      extra: { transactional: true, brandId: "koda", listUnsubscribe: "https://x.test/u?t=1" },
    }], { deadline: Date.now() + 20_000 });
    const raw = f.received[0].body;
    assert.equal(headerValue(raw, "List-Unsubscribe"), null,
      "this is the header that files a personal message under Promotions");
    assert.equal(headerValue(raw, "List-Unsubscribe-Post"), null);
    assert.equal(headerValue(raw, "Precedence"), null);
    assert.equal(headerValue(raw, "List-ID"), null);
    assert.equal(headerValue(raw, "Feedback-ID"), null);
  } finally { await f.close(); }
});

test("a campaign reaches the wire compliant, with one-click unsubscribe intact", wire, async () => {
  const f = fakeSmtp();
  const port = await f.listen();
  try {
    await smtpSendMany(node(port), "s@koda.co.uk", [{
      to: "a@example.com", subject: "Spring offer", html: "<p>Half price.</p>",
      extra: { transactional: false, brandId: "koda", campaign: "spring", listUnsubscribe: "https://x.test/u?t=1" },
    }], { deadline: Date.now() + 20_000 });
    const raw = f.received[0].body;
    assert.equal(headerValue(raw, "List-Unsubscribe"), "<https://x.test/u?t=1>");
    assert.equal(headerValue(raw, "List-Unsubscribe-Post"), "List-Unsubscribe=One-Click");
    assert.equal(headerValue(raw, "Precedence"), "bulk");
    assert.equal(headerValue(raw, "List-ID"), "<koda.lists.koda.co.uk>");
    assert.equal(headerValue(raw, "Feedback-ID"), "spring:koda:bulk:marketwaros");
  } finally { await f.close(); }
});

test("a pound sign typed into a subject line reaches the wire legal", wire, async () => {
  const f = fakeSmtp();
  const port = await f.listen();
  try {
    await smtpSendMany(node(port), "s@marketwaros.com", [
      { to: "a@example.com", subject: "Save £50 in April", html: "<p>Offer.</p>" },
    ], { deadline: Date.now() + 20_000 });
    const headers = parts(f.received[0].body).headers;
    assert.ok(!headers.includes("£"), "a raw high byte in a header is grounds for a receiver to reject the message");
    const subject = headerValue(f.received[0].body, "Subject");
    assert.equal(Buffer.from(subject.slice(10, -2), "base64").toString("utf8"), "Save £50 in April");
  } finally { await f.close(); }
});

test("the single-send path and the batch path build the SAME message", wire, async () => {
  // They were two near-identical header blocks under a comment warning that
  // building the map twice is how a DKIM signature silently stops matching.
  // This asserts they are one builder now, by comparing what arrives.
  const { sendEmail } = await import("../src/backend/email.ts");
  const f = fakeSmtp();
  const port = await f.listen();
  const saved = { pool: process.env.MW_SENDING_POOL, from: process.env.EMAIL_FROM };
  process.env.MW_SENDING_POOL = JSON.stringify([{ label: "test", host: "127.0.0.1", port, user: "u", pass: "p", secure: false }]);
  process.env.EMAIL_FROM = "s@marketwaros.com";
  try {
    await smtpSendMany(node(port), "s@marketwaros.com", [
      { to: "a@example.com", subject: "Same", html: "<p>Body.</p>", extra: { transactional: true } },
    ], { deadline: Date.now() + 20_000 });
    await sendEmail({ to: "b@example.com", subject: "Same", html: "<p>Body.</p>", transactional: true });
    assert.equal(f.received.length, 2, "both paths must have reached the same fake server");
    const shapeOf = (raw) => parts(raw).headers
      .split("\n").map((l) => l.split(":")[0].toLowerCase()).filter(Boolean).sort().join(",");
    assert.equal(shapeOf(f.received[0].body), shapeOf(f.received[1].body),
      "one builder means one header set — a difference here is the duplication coming back");
  } finally {
    process.env.MW_SENDING_POOL = saved.pool; process.env.EMAIL_FROM = saved.from;
    if (saved.pool === undefined) delete process.env.MW_SENDING_POOL;
    if (saved.from === undefined) delete process.env.EMAIL_FROM;
    await f.close();
  }
});

// ---------------------------------------------------------------------------
// 5. The panel that has to say all this to the customer before they press send.
// ---------------------------------------------------------------------------

test("the preview names a link domain that does not match the From domain", async () => {
  const { previewChecks } = await import("../src/backend/email-preview.ts");
  const base = {
    subject: "Spring", html: '<p><a href="https://koda.co.uk/book">Book</a></p>',
    rendered: [{ subject: "Spring", html: "<p>x</p>" }], recipients: 10,
  };
  const mismatched = previewChecks({ ...base, fromEmail: "hi@koda.co.uk", trackingBase: "https://marketwaros.com" });
  assert.ok(mismatched.some((c) => /points at marketwaros\.com/.test(c.message)),
    "mail from one domain carrying links to another is the shape of a phishing message");

  const aligned = previewChecks({ ...base, fromEmail: "hi@koda.co.uk", trackingBase: "https://email.koda.co.uk" });
  assert.ok(!aligned.some((c) => /points at/.test(c.message)),
    "a verified sending domain puts the links on the customer's own domain, and the warning must then go");

  const unknown = previewChecks(base);
  assert.ok(!unknown.some((c) => /points at/.test(c.message)),
    "with no From chosen yet the check stays silent rather than guessing at a domain");
});

test("the preview names a body that would produce an empty text alternative", async () => {
  const { previewChecks } = await import("../src/backend/email-preview.ts");
  const checks = previewChecks({
    subject: "Sale", html: '<img src="https://x.test/a.png" alt="Sale">',
    rendered: [{ subject: "Sale", html: "x" }], recipients: 5,
  });
  assert.ok(checks.some((c) => /no readable plain text/.test(c.message)),
    "an all-image message leaves a watch, a screen reader and a spam filter with nothing");
});
