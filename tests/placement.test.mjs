import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeImap } from "./helpers/fake-imap.mjs";
import { tlsCreds } from "./helpers/fake-smtp.mjs";
import { placementOf, placementReport, REACHED_INBOX } from "../src/shared/placement.ts";
import { findByToken } from "../src/backend/imap.ts";

// ---------------------------------------------------------------------------
// WHERE THE MESSAGE LANDED — the half of deliverability this platform could not
// answer, now measured.
//
// §135 built the SHAPE of a message and said plainly what it could not do: "the
// platform can say what shape a message has, and cannot yet tell you which tab
// it reached." Everything here is about closing that, and about one rule that
// decides whether the answer is worth having:
//
//   A SEED THAT DID NOT REPORT IS NOT AN INBOX. It is missing, and a report with
//   anything missing refuses to quote a rate — because a rate computed over the
//   seeds that happened to answer flatters exactly the runs that went worst.
// ---------------------------------------------------------------------------

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const haveTls = Boolean(tlsCreds());
const wire = haveTls ? {} : { skip: "openssl unavailable — cannot run a TLS-capable fake IMAP server" };

// ---------------------------------------------------------------------------
// 1. The decision itself.
// ---------------------------------------------------------------------------

test("Gmail's tab is a LABEL, not a folder — reading the folder alone reports a lie", () => {
  // A promoted message is still in \Inbox. A reader that looked only at the
  // folder would call every Promotions message an inbox hit, which is the exact
  // flattering answer this whole feature exists to refuse.
  assert.equal(placementOf({ mailbox: "INBOX", labels: ["\\Inbox", "CATEGORY_PROMOTIONS"] }), "promotions");
  assert.equal(placementOf({ mailbox: "INBOX", labels: ["\\Inbox", "CATEGORY_PERSONAL"] }), "inbox");
  assert.equal(placementOf({ mailbox: "INBOX", labels: ["\\Inbox", "CATEGORY_UPDATES"] }), "updates");
  // No labels at all: a receiver with no tabs, or Gmail with tabs switched off.
  assert.equal(placementOf({ mailbox: "INBOX", labels: [] }), "inbox");
});

test("the spam folder beats any label it still carries", () => {
  // Gmail keeps CATEGORY_* on a message it has ALSO junked. Reading the label
  // first would report a spam-foldered message as "promotions" — the single
  // most damaging direction for this number to be wrong in.
  assert.equal(placementOf({ mailbox: "[Gmail]/Spam", labels: ["\\Spam", "CATEGORY_PROMOTIONS"] }), "spam");
  assert.equal(placementOf({ mailbox: "Junk E-mail", labels: [] }), "spam");
  assert.equal(placementOf({ mailbox: "Junk", labels: [] }), "spam");
});

test("nothing found is missing — never quietly counted as delivered", () => {
  assert.equal(placementOf(null), "missing");
  assert.equal(placementOf(undefined), "missing");
  // Found in some other folder entirely — a user filter, an archive. Not the
  // inbox, and calling it one would be the flattering guess.
  assert.equal(placementOf({ mailbox: "Archive", labels: [] }), "missing");
});

// ---------------------------------------------------------------------------
// 2. The report, and its refusal to invent a number.
// ---------------------------------------------------------------------------

const seed = (address, receiver, placement) => ({ address, receiver, placement, evidence: "" });

test("one seed that did not report withholds every rate", () => {
  const r = placementReport([
    seed("a@gmail.com", "Gmail", "inbox"),
    seed("b@gmail.com", "Gmail", "promotions"),
    seed("c@outlook.com", "Microsoft", "missing"),
  ]);
  assert.equal(r.inboxRatePct, null, "a rate over the seeds that answered flatters the worst runs");
  assert.equal(r.spamRatePct, null);
  assert.match(r.verdict, /2 of 3 seeds reported/);
  assert.match(r.advice.join(" "), /hole in the measurement/);
  // And it is withheld per receiver too, not just in the headline.
  const ms = r.receivers.find((x) => x.receiver === "Microsoft");
  assert.equal(ms.inboxRatePct, null);
  assert.equal(r.receivers.find((x) => x.receiver === "Gmail").inboxRatePct, 100);
});

test("with every seed reporting, the rates are real and the tabs still count as the inbox", () => {
  const r = placementReport([
    seed("a@gmail.com", "Gmail", "inbox"),
    seed("b@gmail.com", "Gmail", "promotions"),
    seed("c@outlook.com", "Microsoft", "spam"),
    seed("d@yahoo.com", "Yahoo", "inbox"),
  ]);
  assert.equal(r.inboxRatePct, 75, "Promotions is still the inbox — filed, not rejected");
  assert.equal(r.spamRatePct, 25);
  assert.match(r.verdict, /3 of 4 reached an inbox; 1 were junked/);
  assert.match(r.advice[0], /authentication first/i,
    "junked mail is an authentication and complaint question before it is a content question");
});

test("all-Promotions is reported as correct, not as a fault", () => {
  const r = placementReport([
    seed("a@gmail.com", "Gmail", "promotions"),
    seed("b@gmail.com", "Gmail", "promotions"),
  ]);
  assert.equal(r.spamRatePct, 0);
  assert.equal(r.inboxRatePct, 100);
  assert.match(r.advice.join(" "), /correct place and not a fault/,
    "a campaign belongs in Promotions; telling a customer to fight that is how a domain gets burned");
  assert.match(r.advice.join(" "), /one-to-one mail from the vault/);
});

test("no seeds at all says so, rather than reporting a perfect score over nothing", () => {
  const r = placementReport([]);
  assert.equal(r.seeds, 0);
  assert.equal(r.inboxRatePct, null);
  assert.match(r.verdict, /never been measured/);
  assert.equal(REACHED_INBOX.includes("spam"), false);
});

// ---------------------------------------------------------------------------
// 3. THE READER, against a real socket. The bugs live in the protocol.
// ---------------------------------------------------------------------------

const cfg = (port) => ({ host: "127.0.0.1", port, user: "seed@example.com", pass: "pw" });

test("the reader finds the message by its token and reads Gmail's labels", wire, async () => {
  const f = fakeImap({ folders: {
    "INBOX": [
      { uid: "9", subject: "Something else entirely", labels: ["\\Inbox"] },
      { uid: "10", subject: "Checking our email is reaching you [MWP-ABC123]", labels: ["\\Inbox", "CATEGORY_PROMOTIONS"] },
    ],
  } });
  const port = await f.listen();
  try {
    const s = await findByToken(cfg(port), "MWP-ABC123");
    assert.ok(s, "the message was in the inbox and was not found");
    assert.equal(s.uid, "10", "it matched the wrong message — the other one has a different subject");
    assert.equal(s.mailbox, "INBOX");
    assert.deepEqual(s.labels, ["\\Inbox", "CATEGORY_PROMOTIONS"]);
    assert.equal(placementOf(s), "promotions");
  } finally { await f.close(); }
});

test("the reader looks in the junk folders too, and names the one it found", wire, async () => {
  const f = fakeImap({ folders: {
    "INBOX": [],
    "[Gmail]/Spam": [{ uid: "3", subject: "Hello [MWP-XYZ]", labels: ["\\Spam", "CATEGORY_PROMOTIONS"] }],
  } });
  const port = await f.listen();
  try {
    const s = await findByToken(cfg(port), "MWP-XYZ");
    assert.equal(s.mailbox, "[Gmail]/Spam");
    assert.equal(placementOf(s), "spam", "the folder must beat the label it still carries");
  } finally { await f.close(); }
});

test("a receiver with no tabs is read correctly, not treated as an error", wire, async () => {
  // Asking a non-Gmail server for X-GM-LABELS returns BAD. That is not a
  // failure — it is a receiver with no tabs, and the message is in the inbox.
  const f = fakeImap({ supportsLabels: false, folders: {
    "INBOX": [{ uid: "1", subject: "Hi [MWP-Q]", labels: [] }],
  } });
  const port = await f.listen();
  try {
    const s = await findByToken(cfg(port), "MWP-Q");
    assert.equal(s.mailbox, "INBOX");
    assert.deepEqual(s.labels, []);
    assert.equal(placementOf(s), "inbox");
  } finally { await f.close(); }
});

test("a folder the server does not have is skipped, not fatal", wire, async () => {
  // The reader asks for six folder names and most servers have two of them. A
  // SELECT that comes back NO must be stepped over, because "this server has no
  // [Gmail]/Spam" is the normal case on every receiver that is not Gmail.
  //
  // The inbox is empty here ON PURPOSE: the reader stops at the first folder the
  // message is in, so a message sitting in INBOX would never exercise the
  // fall-through at all. This was the first version of this test and it asserted
  // a folder search that correctly never happened.
  const f = fakeImap({ folders: {
    "INBOX": [],
    "Junk": [{ uid: "1", subject: "Hi [MWP-R]", labels: [] }],
  } });
  const port = await f.listen();
  try {
    const s = await findByToken(cfg(port), "MWP-R");
    assert.equal(s.mailbox, "Junk", "it walked past two folders this server does not have and found the third");
    assert.equal(placementOf(s), "spam");
    assert.ok(f.log.some((l) => /SELECT "\[Gmail\]\/Spam"/.test(l)), "the Gmail spam folder should have been tried and refused");
  } finally { await f.close(); }
});

test("measuring a seed mailbox does not change it", wire, async () => {
  // A seed that gets marked read by the act of measuring it is a seed whose NEXT
  // measurement is different because we looked. BODY.PEEK and no STORE.
  const f = fakeImap({ folders: { "INBOX": [{ uid: "1", subject: "Hi [MWP-S]", labels: ["\\Inbox"] }] } });
  const port = await f.listen();
  try {
    await findByToken(cfg(port), "MWP-S");
    assert.equal(f.state.seenFlagsTouched.length, 0, "the reader set a flag on a mailbox it does not own");
    assert.ok(!f.log.some((l) => /\bSTORE\b/.test(l)), "no STORE may ever be sent to a seed mailbox");
  } finally { await f.close(); }
});

test("a token that is nowhere reports missing, not an error", wire, async () => {
  const f = fakeImap({ folders: { "INBOX": [{ uid: "1", subject: "Unrelated", labels: ["\\Inbox"] }] } });
  const port = await f.listen();
  try {
    assert.equal(await findByToken(cfg(port), "MWP-NOTHERE"), null);
    assert.equal(placementOf(await findByToken(cfg(port), "MWP-NOTHERE")), "missing");
  } finally { await f.close(); }
});

test("a mailbox that refuses the login fails loudly rather than reading as empty", wire, async () => {
  // THE DIFFERENCE THAT MATTERS. A seed we cannot log into is a hole in the
  // measurement; reporting it as "nothing found" would report a broken reader as
  // a receiver that junked the message.
  const f = fakeImap({ refuseLogin: true, folders: { "INBOX": [] } });
  const port = await f.listen();
  try {
    await assert.rejects(() => findByToken(cfg(port), "MWP-A"), /refused the login/);
  } finally { await f.close(); }
});

// ---------------------------------------------------------------------------
// 4. THE WHOLE THING, END TO END. Send over a real socket, let a mail system
//    file it, read it back, report where it went.
//
//    The two halves are proved separately above. This is the join, and the join
//    is where this repository's defects live: a value that is right on one side
//    of a boundary and never arrives on the other. The probe mints a token, puts
//    it in the subject, sends through the ORDINARY bulk path, and then has to
//    find that exact message again in somebody else's mailbox.
// ---------------------------------------------------------------------------

test("a probe sends for real, is filed, and is found where it was filed", wire, async () => {
  const { fakeSmtp } = await import("./helpers/fake-smtp.mjs");
  const smtp = fakeSmtp();
  const smtpPort = await smtp.listen();

  // The "mail system": whatever the relay accepted gets filed into a mailbox,
  // the way a real receiver would. Gmail is told to put it under Promotions,
  // Microsoft to junk it — the two answers a customer most needs to tell apart.
  const inbox = { "INBOX": [], "[Gmail]/Spam": [] };
  const junked = { "INBOX": [], "Junk": [] };
  const gmail = fakeImap({ folders: inbox });
  const micro = fakeImap({ folders: junked, supportsLabels: false });
  const gPort = await gmail.listen();
  const mPort = await micro.listen();

  const saved = { pool: process.env.MW_SENDING_POOL, seeds: process.env.MW_SEED_MAILBOXES, from: process.env.EMAIL_FROM };
  process.env.MW_SENDING_POOL = JSON.stringify([{ label: "t", host: "127.0.0.1", port: smtpPort, user: "u", pass: "p", secure: false }]);
  process.env.EMAIL_FROM = "MarketWar OS <os@marketwaros.com>";
  process.env.MW_SEED_MAILBOXES = JSON.stringify([
    { address: "seed@gmail.com", host: "127.0.0.1", port: gPort, user: "seed@gmail.com", pass: "pw" },
    { address: "seed@outlook.com", host: "127.0.0.1", port: mPort, user: "seed@outlook.com", pass: "pw" },
  ]);

  try {
    const { runPlacementProbe, seedStatus } = await import("../src/backend/placement-probe.ts");
    assert.equal(seedStatus().count, 2, "both seeds should be read out of the environment");

    // Deliver whatever the relay accepts, as a mail system would, while the
    // probe is waiting. The subject carries the token, which is the only thing
    // the reader will have to go on.
    const deliver = setInterval(() => {
      while (smtp.received.length) {
        const m = smtp.received.shift();
        const subject = (/^Subject:\s*(.*)$/im.exec(m.body) || [])[1] || "";
        if (/gmail/i.test(m.to)) inbox["INBOX"].push({ uid: "1", subject, labels: ["\\Inbox", "CATEGORY_PROMOTIONS"] });
        else junked["Junk"].push({ uid: "1", subject, labels: [] });
      }
    }, 50);

    const outcome = await runPlacementProbe({ waitMs: 1500 });
    clearInterval(deliver);

    assert.equal(outcome.sent, 2, `the relay should have accepted both seeds — ${outcome.sendNote}`);
    assert.match(outcome.token, /^MWP-/);

    const g = outcome.results.find((r) => r.address === "seed@gmail.com");
    const m = outcome.results.find((r) => r.address === "seed@outlook.com");
    assert.equal(g.placement, "promotions", `Gmail seed: ${g.evidence}`);
    assert.equal(m.placement, "spam", `Microsoft seed: ${m.evidence}`);

    // BOTH REPORTED, so the rates are real and are quoted.
    assert.equal(outcome.report.inboxRatePct, 50);
    assert.equal(outcome.report.spamRatePct, 50);
    assert.match(outcome.report.advice.join(" "), /authentication first/i);
    // And the evidence names the mailbox, so a surprising result can be checked
    // by a person opening that folder.
    assert.match(g.evidence, /found in INBOX/);
    assert.match(m.evidence, /found in Junk/);
  } finally {
    process.env.MW_SENDING_POOL = saved.pool; process.env.MW_SEED_MAILBOXES = saved.seeds; process.env.EMAIL_FROM = saved.from;
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[{ pool: "MW_SENDING_POOL", seeds: "MW_SEED_MAILBOXES", from: "EMAIL_FROM" }[k]];
    await smtp.close(); await gmail.close(); await micro.close();
  }
});

test("a probe with no seeds configured measures nothing and says so", async () => {
  const saved = process.env.MW_SEED_MAILBOXES;
  delete process.env.MW_SEED_MAILBOXES;
  try {
    const { runPlacementProbe } = await import("../src/backend/placement-probe.ts");
    const outcome = await runPlacementProbe({ waitMs: 0 });
    assert.equal(outcome.sent, 0, "nothing may be sent when there is nowhere to send it");
    assert.equal(outcome.report.inboxRatePct, null, "a deployment that measured nothing has no rate, not a 0% one");
    assert.match(outcome.sendNote, /No seed mailboxes are configured/);
  } finally { if (saved === undefined) delete process.env.MW_SEED_MAILBOXES; else process.env.MW_SEED_MAILBOXES = saved; }
});

test("when a token matches twice, the reader reads the NEWEST copy", wire, async () => {
  // A retry, a forwarded copy, or a receiver that shows one message under two
  // UIDs all produce more than one hit for a token that is supposed to be
  // unique. The last UID is the most recent, and the most recent is the one
  // whose placement is the current answer — an older copy may have been filed
  // before a DNS or reputation change that is exactly what the probe is
  // measuring. Taking the first would report the stale verdict as today's.
  const f = fakeImap({ folders: {
    "INBOX": [
      { uid: "4", subject: "Older copy [MWP-DUP]", labels: ["\\Inbox", "CATEGORY_PROMOTIONS"] },
      { uid: "8", subject: "Newest copy [MWP-DUP]", labels: ["\\Inbox", "CATEGORY_PERSONAL"] },
    ],
  } });
  const port = await f.listen();
  try {
    const s = await findByToken(cfg(port), "MWP-DUP");
    assert.equal(s.uid, "8", "the newest match is the current answer");
    assert.equal(placementOf(s), "inbox");
  } finally { await f.close(); }
});
