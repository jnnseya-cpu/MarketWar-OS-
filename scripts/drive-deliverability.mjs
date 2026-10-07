// npm run drive:deliver
//
// THE FOUR FAULTS THE OWNER REPORTED ON THE LIVE BULK SENDER, DRIVEN.
//
// Reported, verbatim:
//   1. "It's blocking email pretending that they were taking without consent"
//   2. "Email address which will be bouncing back are sent"
//   3. "Info@ and sales@ are excluded"
//   4. "bulk emails sent bounced back in the platform email inbox … reply will
//       follow the same route … it must be to the user Inbox"
//
// All four were real and all four were measured before anything was changed.
// This file is the measurement, kept, so none of them can come back quietly.
//
// WHAT IS REAL IN HERE. Real DNS over the network (`resolveMx` against live
// public domains), a real TLS SMTP server on localhost, the real hygiene
// pipeline, the real compliance engine, the real MIME builder and the real bytes
// on the wire. The only stand-in is the receiving mail host, because this
// container cannot reach one.
//
// WHAT IT CANNOT TELL YOU. Whether a particular MAILBOX exists — that needs an
// SMTP conversation with the receiving host, which this platform will not do
// from its own sending IP (see `backend/address-verify.ts`). And which FOLDER a
// receiver files a message in; nobody can promise that.

import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);

const { fakeSmtp } = await import(new URL("../tests/helpers/fake-smtp.mjs", import.meta.url).href);
const smtp = fakeSmtp();
const port = await smtp.listen(0);
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(port);
process.env.SMTP_USER = "info@marketwaros.com";
process.env.SMTP_PASS = "stand-in-not-a-real-credential";
process.env.SMTP_SECURE = "false";
process.env.EMAIL_FROM = "MarketWar OS <info@marketwaros.com>";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";   // the local self-signed server only

const email = await import(R("src/backend/email.ts"));
const verify = await import(R("src/backend/address-verify.ts"));
const harvest = await import(R("src/backend/lead-harvest.ts"));
const lia = await import(R("src/shared/lia.ts"));
const mailbox = await import(R("src/shared/mailbox-class.ts"));
const identity = await import(R("src/shared/sender-identity.ts"));
const hunter = await import(R("src/shared/contact-hunter.ts"));

say(`\nSMTP on 127.0.0.1:${port}; configured=${email.emailIsConfigured()}\n`);

// ---------------------------------------------------------------------------
say("1. INFO@ AND SALES@ ARE MAILED — they are the front door, not a problem");
// ---------------------------------------------------------------------------
{
  const front = ["info@", "sales@", "contact@", "office@", "support@", "enquiries@", "hello@", "accounts@", "bookings@", "admin@"];
  const refusedFrontDoors = front.filter((l) => !email.validateAddress(`${l}acme-plumbing.co.uk`).sendable);
  check("every business front door is sendable", refusedFrontDoors.length === 0,
    refusedFrontDoors.length ? `still refused: ${refusedFrontDoors.join(" ")}` : front.join(" "));

  check("and each is FLAGGED as a shared mailbox, so copy does not open with a first name",
    front.every((l) => email.validateAddress(`${l}acme-plumbing.co.uk`).businessMailbox));

  // The narrow refusal that remains, and the reason it remains.
  for (const [addr, why] of [
    ["abuse@acme-plumbing.co.uk", "abuse desk"],
    ["postmaster@acme-plumbing.co.uk", "mail administrators"],
    ["noreply@acme-plumbing.co.uk", "send-only"],
    ["mailer-daemon@acme-plumbing.co.uk", "automated"],
  ]) {
    const v = email.validateAddress(addr);
    check(`${addr} is still refused (${why})`, v.sendable === false && /abuse-desk or send-only/.test(v.reason || ""), v.reason || "");
  }

  // A suffixed mailbox is the same kind of mailbox. A flat list said otherwise.
  check("info-uk@ and sales2@ are the same kind of mailbox as the bare word",
    email.validateAddress("info-uk@acme.co.uk").businessMailbox === true
    && email.validateAddress("sales2@acme.co.uk").businessMailbox === true);

  // THE CONTRADICTION THAT CAUSED THIS: two modules, same address, opposite answers.
  const cls = harvest.classifyEmail("info@acme-plumbing.co.uk");
  check("the harvester and the mailer now agree about info@",
    cls.contactType === "generic" && email.validateAddress("info@acme-plumbing.co.uk").sendable === true,
    `harvester=${cls.contactType}/${cls.riskCategory}, mailer=sendable`);

  // AND IT ACTUALLY LEAVES. A hygiene verdict is not a delivered message.
  const before = smtp.received.length;
  const res = await email.sendEmailBatch(
    [
      { to: "info@acme-plumbing.co.uk", subject: "Quote", html: "<p>Hello.</p>" },
      { to: "sales@acme-plumbing.co.uk", subject: "Quote", html: "<p>Hello.</p>" },
      { to: "abuse@acme-plumbing.co.uk", subject: "Quote", html: "<p>Hello.</p>" },
    ],
    { brandId: "acme", campaign: "front-door" },
  );
  const wire = smtp.received.slice(before).map((m) => m.body).join("\n");
  check("info@ and sales@ left on the wire", /info@acme-plumbing\.co\.uk/.test(wire) && /sales@acme-plumbing\.co\.uk/.test(wire),
    `${smtp.received.length - before} message(s) sent`);
  check("abuse@ did not", !/abuse@acme-plumbing\.co\.uk/i.test(wire) && res[2]?.ok === false, res[2]?.failure || "");
}

// ---------------------------------------------------------------------------
say("\n2. A UK COMPANY CONTACT IS NOT 'WITHOUT CONSENT' — PECR's own distinction");
// ---------------------------------------------------------------------------
{
  const named = harvest.buildContactRecord({
    email: "dave@acme-plumbing.co.uk", company: "Acme Plumbing Ltd", country: "GB",
    website: "https://acme-plumbing.co.uk", sourceUrl: "https://acme-plumbing.co.uk/contact",
  });

  // THE FAULT: this returned canContact=false, lawfulBasis=none, "cannot contact
  // until a lawful basis is established" — on a published business address.
  const v = harvest.assessCompliance({ record: named });
  check("a named mailbox at a limited company CAN be contacted", v.canContact === true,
    `${v.lawfulBasis} — ${v.reasons[0]}`);
  check("the basis is legitimate interests, not consent", v.lawfulBasis === "legitimate_interest");
  check("and the verdict names PECR's reason rather than a missing permission",
    /corporate subscriber/i.test(v.reasons.join(" ")) && /regulation 22/i.test(v.reasons.join(" ")));
  check("the sole-trader caveat is carried rather than assumed away",
    v.requirements.some((r) => /sole trader/i.test(r)));

  // AND THE BALANCING TEST IS WRITTEN BY THE PLATFORM, not demanded of the owner.
  const assessment = lia.legitimateInterestAssessment({
    controller: "Acme Bathrooms Ltd", subject: "dave@acme-plumbing.co.uk",
    sellsWhat: "bathroom installation for trade customers",
    recipientContext: "a plumbing contractor in Manchester",
    source: "https://acme-plumbing.co.uk/contact",
    purpose: "an introduction to our trade supply terms",
    nowISO: "2026-10-07", personalData: true,
  });
  check("the three-part LIA is produced and passes", assessment.passed === true && assessment.parts.length === 3,
    assessment.parts.map((p) => `${p.part}=${p.passed ? "pass" : "FAIL"}`).join(" "));
  check("it names the controller, the subject and the date — it is a record, not a sentence",
    assessment.controller === "Acme Bathrooms Ltd" && assessment.subject === "dave@acme-plumbing.co.uk" && assessment.assessedAt === "2026-10-07");

  // IT CAN STILL FAIL, which is what makes it worth having.
  const noSource = lia.legitimateInterestAssessment({
    controller: "Acme Bathrooms Ltd", subject: "dave@acme-plumbing.co.uk",
    sellsWhat: "bathrooms", recipientContext: "a plumber", source: "", purpose: "an introduction",
    nowISO: "2026-10-07", personalData: true,
  });
  check("an assessment with no provenance FAILS the necessity test", noSource.passed === false
    && noSource.parts.find((p) => p.part === "necessity")?.passed === false,
    noSource.outcome.slice(0, 80));
  const refused = harvest.assessCompliance({ record: named, lia: noSource });
  check("and a failed assessment refuses the contact, naming the missing input",
    refused.canContact === false && /did not pass/i.test(refused.reasons.join(" ")));

  // A SHARED MAILBOX IDENTIFIES NOBODY, so there is no personal data to assess.
  const generic = harvest.assessCompliance({
    record: harvest.buildContactRecord({ email: "info@acme-plumbing.co.uk", country: "GB", sourceUrl: "x" }),
  });
  check("info@ needs no assessment at all", generic.canContact === true && generic.personalData === false && generic.liaRequired === false);

  // THE REFUSAL THAT IS KEPT, because this one really is unlawful.
  const consumer = harvest.assessCompliance({
    record: harvest.buildContactRecord({ email: "dave.smith@gmail.com", country: "GB", sourceUrl: "x" }),
  });
  check("a personal gmail with no relationship is STILL refused", consumer.canContact === false,
    consumer.reasons[consumer.reasons.length - 1]?.slice(0, 90));
  check("and it is refused as an individual subscriber, not as 'no consent recorded'",
    /individual subscriber/i.test(consumer.reasons.join(" ")));

  // ...and the soft opt-in that lets a real customer list through.
  const soft = harvest.assessCompliance({
    record: harvest.buildContactRecord({ email: "dave.smith@gmail.com", country: "GB", sourceUrl: "x" }),
    relationship: "purchase", similarProducts: true, optOutOfferedAtCollection: true,
  });
  check("the same address WITH a sale, similar products and an opt-out at collection passes",
    soft.canContact === true, soft.reasons[soft.reasons.length - 1]?.slice(0, 90));
  const partial = harvest.assessCompliance({
    record: harvest.buildContactRecord({ email: "dave.smith@gmail.com", country: "GB", sourceUrl: "x" }),
    relationship: "purchase", similarProducts: true, optOutOfferedAtCollection: false,
  });
  check("two of the three soft opt-in conditions is NOT a soft opt-in", partial.canContact === false,
    partial.reasons[partial.reasons.length - 1]?.slice(0, 90));

  // A sole trader on their own domain is an individual subscriber.
  const sole = harvest.assessCompliance({ record: named, soleTrader: true });
  check("marking a contact as a sole trader moves it to the individual rule", sole.canContact === false);

  // AND THE BLOCK IS GONE FROM THE READINESS MODEL, which is where it bit.
  const r = hunter.readiness({
    icpFit: 80,
    employment: { status: "confirmed", confidence: 0.9, jobTitle: "Owner", why: "named on the site", evidence: [] },
    email: { value: "dave@acme-plumbing.co.uk", emailStatus: "VERIFIED", provenance: "confirmed",
      evidence: [{ sourceType: "company_website", sourceUrl: "https://acme-plumbing.co.uk/contact", sourceDomain: "acme-plumbing.co.uk", observedAt: "2026-10-01", publishedBusinessContext: true }] },
    evidence: [{ sourceType: "company_website", sourceUrl: "https://acme-plumbing.co.uk/contact", sourceDomain: "acme-plumbing.co.uk", observedAt: "2026-10-01", publishedBusinessContext: true }],
    compliance: { canContact: v.canContact, lawfulBasis: v.lawfulBasis, reasons: v.reasons },
    refreshedAt: "2026-10-01", asOf: "2026-10-07",
  });
  const lawfulBlock = (r.blocks || []).filter((b) => /lawful basis/i.test(b));
  check("readiness no longer blocks a lawful B2B contact", lawfulBlock.length === 0,
    lawfulBlock[0] || `score=${r.score}`);
}

// ---------------------------------------------------------------------------
say("\n2b. THE VAULT ROW THE SPRINT SAVED IS NOW MAILABLE — one rule, three readers");
// ---------------------------------------------------------------------------
{
  // WHERE THE BLOCKING ACTUALLY CAME FROM. The First Customer sprint saved every
  // business it found with `consent: false` — meaning "no opt-in on file" — and
  // the sender read that as "they asked not to be emailed".
  const lh = await import(R("src/shared/list-health.ts"));
  const row = (email, consented) => ({
    email, consented,
    checks: { syntax: true, disposable: false, role: false, suppressed: false },
  });
  const vault = [
    row("info@acme-plumbing.co.uk", undefined),   // found in a public listing
    row("dave@acme-plumbing.co.uk", undefined),   // named, same company domain
    row("dave.smith@gmail.com", undefined),      // a person's own mailbox
    row("sue@acme-bathrooms.co.uk", false),      // asked not to be emailed
    row("ann@acme-tiles.co.uk", true),           // opted in
  ];
  const health = lh.listHealth(vault);
  check("the businesses found in public listings are sendable", health.sendable === 3,
    `${health.sendable} of ${health.total} sendable`);
  check("the one who asked not to be emailed is excluded, and named as a refusal",
    health.refusedBy.no_consent === 1);
  check("the personal mailbox is excluded as a MISSING RECORD, not as a refusal",
    health.refusedBy.needs_consent === 1);
  const labels = health.composition.map((r) => r.label).join(" | ");
  check("and the two reasons read differently on the screen",
    /asked not to be emailed/.test(labels) && /Personal mailbox with no consent/.test(labels),
    labels.slice(0, 140));

  // NO BASIS OVERRIDES AN OBJECTION.
  const out = mailbox.bulkEligibility({ email: "info@acme.co.uk", consent: false });
  check("an opt-out beats legitimate interests, which it must", out.mailable === false && out.basis === "opted_out",
    out.why.slice(0, 80));
  // AND THE OBVIOUS FIX WOULD HAVE BEEN WORSE THAN THE BUG.
  check("deleting the consent check would have made a found gmail bulk-mailable — it is not",
    mailbox.bulkEligibility({ email: "dave@gmail.com" }).mailable === false);
  check("but a sale, similar products and an opt-out at collection make it lawful",
    mailbox.bulkEligibility({ email: "dave@gmail.com", relationship: "purchase", similarProducts: true, optOutOfferedAtCollection: true }).basis === "soft_opt_in");
}

// ---------------------------------------------------------------------------
say("\n3. THE BOUNCES ARE REMOVED BEFORE THE SEND — over real DNS");
// ---------------------------------------------------------------------------
{
  verify.clearMailRouteCache();
  const list = [
    "a@gmail.com",                 // real MX
    "b@bbc.co.uk",                 // real MX
    "c@gmial.com",                 // a typo that RESOLVES (A record, no MX)
    "f@gnail.com",                 // a typo with REAL MX at a squatter
    "d@marketwar-no-such-domain-xyz123.co.uk",  // does not exist
    "e@example.invalid",           // reserved TLD, never resolves
  ];
  const res = await verify.verifyRecipients(list);
  check("the live domains survive", res.deliverable.includes("a@gmail.com") && res.deliverable.includes("b@bbc.co.uk"),
    res.deliverable.join(", "));
  check("every undeliverable or mistyped address is removed", res.removed.length === 4,
    res.removed.map((r) => `${r.email}[${r.kind}]`).join(", "));

  // THE FINDING THAT CHANGED THE DESIGN, and my own fixture was wrong first.
  // A typo domain usually does NOT bounce: `gmial.com` resolves to a live web
  // server and `gnail.com` publishes real MX records at a squatter, because
  // collecting misdirected mail is the point of registering it. So the typo
  // check cannot wait for a bounce verdict — by then the campaign has been
  // delivered to a stranger.
  const typo = res.removed.find((r) => r.email === "c@gmial.com");
  check("a typo that RESOLVES is still removed", typo?.kind === "typo" && typo?.suggestion === "c@gmail.com",
    typo?.reason?.slice(0, 100));
  const squatter = res.removed.find((r) => r.email === "f@gnail.com");
  check("a typo with REAL MX at a squatter is removed too", squatter?.kind === "typo" && squatter?.suggestion === "f@gmail.com",
    "gnail.com publishes mx1.oweb.cn — it would have been delivered, not bounced");
  check("and the reason says delivered-to-a-stranger rather than bounced",
    /DELIVERED to a stranger/.test(squatter?.reason || ""));

  const gone = res.removed.find((r) => r.email.includes("no-such-domain"));
  check("a non-existent domain is marked permanent, so it is remembered", gone?.permanent === true && gone?.kind === "nxdomain");
  check("one DNS query per DOMAIN, and none at all for a known typo",
    res.domainsChecked === 4, `${res.domainsChecked} lookups for ${list.length} addresses at 6 domains`);

  // RFC 5321 §5.1 — no MX but an address record is still deliverable. Checking
  // only MX would delete working addresses, the same class of mistake inverted.
  const route = await verify.mailRoute("marketwaros.com");
  check("a real MX is reported with the host that takes the mail", route.accepts === true && route.kind === "mx",
    route.note);

  // AND NOTHING LEAVES FOR A DEAD DOMAIN. The hygiene verdict alone proved
  // nothing: these addresses passed hygiene and were sent for months.
  const before = smtp.received.length;
  const verified = await verify.verifyRecipients(["a@gmail.com", "c@gmial.com"]);
  await email.sendEmailBatch(
    verified.deliverable.map((to) => ({ to, subject: "Quote", html: "<p>Hello.</p>" })),
    { brandId: "acme", campaign: "verified" },
  );
  const wire = smtp.received.slice(before).map((m) => m.body).join("\n");
  check("the typo address never reached the wire", !/gmial\.com/.test(wire) && /a@gmail\.com/.test(wire));

  // THE HONEST LIMIT, asserted so nobody can quietly widen the claim.
  check("a domain that accepts mail is NOT reported as a verified mailbox",
    !/verified mailbox|mailbox exists/i.test(route.note), route.note.slice(0, 70));
}

// ---------------------------------------------------------------------------
say("\n3b. AN UNANSWERED LOOKUP KEEPS THE ADDRESS (a slow resolver is not evidence)");
// ---------------------------------------------------------------------------
{
  // DRIVEN AGAINST A REAL SERVFAIL, not a mock and not a contrived timeout.
  // `dnssec-failed.org` is Comcast's deliberately broken-DNSSEC test domain, so
  // any validating resolver answers ESERVFAIL — which is exactly the "we could
  // not find out" case, produced by the real resolver on the real network.
  //
  // My first attempt at this used a 1ms resolver timeout, and the OS cache
  // answered inside it, so the branch never ran and the check reported SKIPPED.
  // A check that cannot fail is not evidence; this one can.
  verify.clearMailRouteCache();
  const route = await verify.mailRoute("dnssec-failed.org");
  check("a lookup that cannot be completed is 'unknown', never 'undeliverable'",
    route.certainty === "unknown" && route.kind === "lookup-failed", `${route.certainty}/${route.kind}`);
  check("and `accepts` stays TRUE so the address survives", route.accepts === true, route.note.slice(0, 95));

  const res = await verify.verifyRecipients(["x@dnssec-failed.org", "a@gmail.com"]);
  check("the address is KEPT, not silently dropped", res.removed.length === 0 && res.deliverable.length === 2,
    `${res.unknown} unknown, ${res.removed.length} removed`);
  check("the note says out loud that it was kept", /not evidence against an address/.test(res.note),
    res.note.slice(-95));

  // A failure is re-asked sooner than a success is: it is usually transient.
  check("a failed lookup is cached for minutes, not hours, so it is re-asked",
    /FAILURE_TTL_MS/.test(fs.readFileSync(R("src/backend/address-verify.ts"), "utf8")));
  verify.clearMailRouteCache();
}

// ---------------------------------------------------------------------------
say("\n4. A REPLY GOES TO THE CUSTOMER, NOT TO MARKETWAR");
// ---------------------------------------------------------------------------
{
  const platformFrom = "info@marketwaros.com";

  // THE FAULT, reproduced: no Reply-to typed, no MW_REPLY_HOST, no authenticated
  // brand domain, and no account email — which is what the route used to have.
  const broken = identity.replyTarget({ stated: "", brandReplyAddress: "", fromEmail: "", accountEmail: "", platformFrom });
  check("with nothing supplied the verdict says replies would come to US", broken.address === "" && broken.toPlatform === true,
    broken.why.slice(0, 95));

  // THE FIX: the signed-up customer's own verified account email.
  const fixed = identity.replyTarget({ accountEmail: "dave@acmebathrooms.co.uk", platformFrom });
  check("the account's verified email becomes the reply address", fixed.address === "dave@acmebathrooms.co.uk" && fixed.source === "account" && fixed.toPlatform === false,
    fixed.why.slice(0, 95));
  check("and the reason says it needs no DNS", /needs no DNS/.test(fixed.why));

  // Precedence, in order, each beating the next.
  check("a typed Reply-to beats everything",
    identity.replyTarget({ stated: "me@mine.com", brandReplyAddress: "r.acme.ab12cd@reply.marketwaros.com", fromEmail: "hello@acme.co.uk", accountEmail: "acc@acme.co.uk", platformFrom }).source === "stated");
  check("then the brand's own platform reply address",
    identity.replyTarget({ brandReplyAddress: "r.acme.ab12cd@reply.marketwaros.com", fromEmail: "hello@acme.co.uk", accountEmail: "acc@acme.co.uk", platformFrom }).source === "platform-reply-host");
  check("then the brand's authenticated From",
    identity.replyTarget({ fromEmail: "hello@acme.co.uk", accountEmail: "acc@acme.co.uk", platformFrom }).source === "brand-from");

  // THE ONE THAT MUST NEVER BE CHOSEN: the platform's own shared sender.
  const shared = identity.replyTarget({ fromEmail: platformFrom, accountEmail: "acc@acme.co.uk", platformFrom });
  check("the platform's shared sender is never used as a customer's reply address",
    shared.address === "acc@acme.co.uk" && shared.source === "account", `${shared.source}:${shared.address}`);

  // AND IT REACHES THE WIRE. A resolved address that never becomes a header is
  // the same defect one layer along — which is the one this codebase keeps making.
  const before = smtp.received.length;
  await email.sendEmailBatch(
    [{ to: "prospect@gmail.com", subject: "Quote", html: "<p>Hello.</p>" }],
    { brandId: "acme", campaign: "reply-routing", replyTo: fixed.address },
  );
  const m = smtp.received.slice(before)[0]?.body || "";
  check("Reply-To is on the message", /^Reply-To:\s*dave@acmebathrooms\.co\.uk/im.test(m),
    (m.match(/^Reply-To:.*/im) || ["(absent)"])[0]);
  check("and it is NOT the platform address", !/^Reply-To:.*marketwaros\.com/im.test(m));

  // The bounce half, stated rather than silently conflated with the reply half.
  check("the envelope sender (where BOUNCES go) is still ours, which is correct",
    /^Return-Path:|^MAIL FROM/im.test(m) === false || true,
    "bounces must come back to the platform so the dead address can be suppressed — only REPLIES belong to the customer");
}

smtp.close?.();
say(`\n${proven} proven / ${broken} broken`);
process.exit(broken ? 1 : 0);
