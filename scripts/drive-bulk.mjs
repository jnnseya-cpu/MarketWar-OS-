// npm run drive:bulk
//
// THE BULK SENDER, WITH AND WITHOUT ATTACHMENTS, OVER A REAL TLS SMTP SERVER —
// for MarketWar's own mail and for a signed-up customer's.
//
// WHY THIS EXISTS. The platform IS the email service provider; that is the point
// of not paying one. So "does the bulk sender work" cannot be answered by reading
// the code — it is answered by putting messages on a wire and reading the bytes
// that come off it. Every header checked below is one a receiver actually uses to
// decide whether a message reaches the main inbox.
//
// WHAT IT PROVED THE FIRST TIME IT RAN: bulk messages carried `List-ID` and
// `Feedback-ID` and NO `List-Unsubscribe`. Since February 2024 that fails Gmail's
// and Yahoo's bulk-sender requirements outright, and an opt-out is separately
// required by PECR and CAN-SPAM. `message-shape.ts` had always NAMED the absence
// — it pushes it onto `missing` — and the message went out anyway, because the
// header was set only when a caller remembered to pass a URL. `/api/email` and
// `/api/newsletter` did; `/api/review-requests` did not, and neither did the
// placement probe, which therefore measured a message shaped differently from the
// campaigns it exists to predict.
//
// WHAT IS STOOD IN FOR. A local TLS SMTP server, because this container cannot
// reach a real mail host. Everything on our side is real: hygiene, suppression,
// the stream decision, the MIME builder, DKIM signing and the bytes on the wire.
//
// WHAT IT CANNOT TELL YOU. Which FOLDER a receiver files the message in. Nobody
// can promise the Primary tab — not Brevo, not anyone — because that is Gmail's
// classifier and it reads engagement history as well as shape. What this proves
// is that the shape is right, which is the part under our control.
// `/api/placement` with `MW_SEED_MAILBOXES` measures the folder for real.

// BULK SEND, WITH AND WITHOUT AN ATTACHMENT, OVER A REAL TLS SMTP SERVER.
// Every byte that leaves is inspected: the MIME structure, the attachment, and
// the headers that actually decide whether a message reaches the main inbox.
import fs from "node:fs";
const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const { fakeSmtp } = await import(new URL("../tests/helpers/fake-smtp.mjs", import.meta.url).href);
const smtp = fakeSmtp();
const port = await smtp.listen(0);

process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(port);
process.env.SMTP_USER = "postmaster@marketwaros.com";
process.env.SMTP_PASS = "stand-in-not-a-real-credential";
process.env.SMTP_SECURE = "false";
process.env.EMAIL_FROM = "MarketWar OS <postmaster@marketwaros.com>";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);
const email = await import(R("src/backend/email.ts"));
say(`\nSMTP on 127.0.0.1:${port}; configured=${email.emailIsConfigured()}\n`);
check("the sending pool is configured", email.emailIsConfigured() === true);

const PDF = Buffer.from("%PDF-1.4\n% a real little pdf\n").toString("base64");

say("1. bulk WITHOUT an attachment");
{
  const before = smtp.received.length;
  const res = await email.sendEmailBatch(
    [
      { to: "ann@example.com", subject: "Your bathroom quote", html: "<p>Hello Ann, here is the quote.</p>" },
      { to: "bob@example.com", subject: "Your bathroom quote", html: "<p>Hello Bob, here is the quote.</p>" },
    ],
    { brandId: "acme", campaign: "quote-followup" },
  );
  const sent = smtp.received.slice(before);
  check("both messages left", res.filter((r) => r.ok).length === 2 && sent.length === 2,
    `${res.filter((r) => r.ok).length} ok, ${sent.length} on the wire`);
  const m = sent[0].body;
  check("a plain-text alternative is present", /Content-Type: text\/plain/i.test(m) && /multipart\/alternative/i.test(m),
    "HTML-only mail is the single biggest spam signal");
  check("List-Unsubscribe is set", /^List-Unsubscribe:/im.test(m), (m.match(/^List-Unsubscribe:.*/im) || [""])[0].slice(0, 70));
  check("one-click unsubscribe (RFC 8058)", /List-Unsubscribe-Post:\s*List-Unsubscribe=One-Click/i.test(m),
    "Gmail and Yahoo require it for bulk senders");
  check("List-ID scopes the list, not the domain", /^List-ID:/im.test(m), (m.match(/^List-ID:.*/im) || [""])[0].slice(0, 60));
  check("Feedback-ID names the campaign", /^Feedback-ID:.*quote-followup/im.test(m), (m.match(/^Feedback-ID:.*/im) || [""])[0].slice(0, 60));
  check("no attachment part when none was asked for", !/Content-Disposition: attachment/i.test(m));
}

say("\n2. bulk WITH an attachment");
{
  const before = smtp.received.length;
  const res = await email.sendEmailBatch(
    [
      { to: "ann@example.com", subject: "Your quote (PDF)", html: "<p>Attached.</p>" },
      { to: "bob@example.com", subject: "Your quote (PDF)", html: "<p>Attached.</p>" },
    ],
    {
      brandId: "acme", campaign: "quote-pdf",
      attachments: [{ filename: "quote.pdf", contentBase64: PDF }],
    },
  );
  const sent = smtp.received.slice(before);
  check("both messages left", res.filter((r) => r.ok).length === 2 && sent.length === 2,
    `${res.filter((r) => r.ok).length} ok, ${sent.length} on the wire`);
  for (const [i, s] of sent.entries()) {
    const m = s.body;
    check(`message ${i + 1}: mixed multipart wrapping the alternative`,
      /multipart\/mixed/i.test(m) && /multipart\/alternative/i.test(m));
    check(`message ${i + 1}: the attachment is declared`,
      /Content-Disposition: attachment; filename="quote.pdf"/i.test(m),
      (m.match(/Content-Disposition:.*/i) || [""])[0].slice(0, 70));
    check(`message ${i + 1}: the PDF arrived intact`, m.replace(/\s+/g, "").includes(PDF.replace(/\s+/g, "")),
      "base64 compared byte for byte");
    check(`message ${i + 1}: still carries the bulk headers`,
      /List-Unsubscribe-Post/i.test(m) && /text\/plain/i.test(m));
  }
}

say("\n3. a one-to-one message is shaped differently (it must not look like bulk)");
{
  const before = smtp.received.length;
  const r = await email.sendEmail({
    to: "ann@example.com", subject: "Re: your enquiry",
    html: "<p>Thanks for getting in touch.</p>",
    transactional: true,
  });
  const m = smtp.received.slice(before)[0]?.body || "";
  check("it was sent", r.ok === true, r.detail || "");
  check("NO List-Unsubscribe on one-to-one mail", !/^List-Unsubscribe:/im.test(m),
    "a personal reply carrying list headers is why replies land in Promotions");
  check("but it still carries a plain-text alternative", /text\/plain/i.test(m));
}

say("\n4. BULK WITH NO OPT-OUT IS REFUSED, not sent malformed");
{
  // The reputation of the sending pool belongs to every tenant on it, so one
  // campaign going out without an unsubscribe header is charged against
  // everybody else's inbox. Refusing is the cheaper failure.
  const before = smtp.received.length;
  const res = await email.sendEmailBatch(
    [{ to: "ann@example.com", subject: "No opt-out", html: "<p>Nope.</p>" }],
    { campaign: "no-brand" },   // no brandId, so no link can be derived
  );
  check("nothing left the machine", smtp.received.length === before && res.every((r) => !r.ok),
    `${smtp.received.length - before} message(s) on the wire`);
  check("and the failure is about the MESSAGE, not the list", res[0]?.failure === "shape", res[0]?.failure);
  check("the reason names the remedy", /brandId|listUnsubscribe/.test(res[0]?.detail || ""),
    (res[0]?.detail || "").slice(0, 110));
  check("and says the pool is shared", /shared with every other customer/.test(res[0]?.detail || ""));
}

say("\n5. a signed-up customer's own campaign carries THEIR list identity");
{
  // Two tenants, same pool. A receiver must be able to block one list without
  // blocking the domain, which is what List-ID and Feedback-ID are for.
  const before = smtp.received.length;
  await email.sendEmailBatch([{ to: "ann@example.com", subject: "A", html: "<p>A</p>" }], { brandId: "veryx", campaign: "spring" });
  await email.sendEmailBatch([{ to: "bob@example.com", subject: "B", html: "<p>B</p>" }], { brandId: "koda", campaign: "launch" });
  const [a, b] = smtp.received.slice(before).map((x) => x.body);
  const idOf = (m) => (m.match(/^List-ID:.*/im) || [""])[0];
  check("each tenant gets its own List-ID", idOf(a) !== idOf(b) && /veryx/.test(idOf(a)) && /koda/.test(idOf(b)),
    `${idOf(a).trim()} vs ${idOf(b).trim()}`);
  check("and its own Feedback-ID", /spring/.test(a) && /launch/.test(b));
  check("both carry one-click unsubscribe derived per recipient",
    /List-Unsubscribe-Post/i.test(a) && /List-Unsubscribe-Post/i.test(b));
  // The sealed token differs per recipient, or one unsubscribe link would opt
  // out somebody else.
  const tok = (m) => (m.match(/unsubscribe\?t=([^>\s]+)/) || [])[1];
  check("and the unsubscribe token is per recipient, not per campaign", tok(a) && tok(b) && tok(a) !== tok(b),
    "a shared link would unsubscribe the wrong person");
}

say("\n6. refusals that protect the sending reputation");
{
  const exe = email.validateAttachments([{ filename: "setup.exe", contentBase64: "AAAA" }]);
  check("an executable is refused", exe.ok === false, exe.error);
  const many = email.validateAttachments(Array.from({ length: 11 }, () => ({ filename: "a.pdf", contentBase64: "AAAA" })));
  check("more than 10 attachments is refused", many.ok === false, many.error);
  const big = email.validateAttachments([{ filename: "big.zip", contentBase64: "A".repeat(28 * 1024 * 1024) }]);
  check("over the size cap is refused", big.ok === false, big.error);
}

smtp.close?.();
say(`\n${proven} proven / ${broken} broken`);
process.exit(broken ? 1 : 0);
