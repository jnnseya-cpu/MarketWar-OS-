import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THE FOUR FAULTS REPORTED ON THE LIVE BULK SENDER, each pinned here.
//
//   1. lawful B2B contacts blocked as though they had not consented
//   2. addresses that were always going to bounce sent anyway
//   3. info@ and sales@ excluded from every campaign
//   4. replies to a customer's campaign arriving in MarketWar's mailbox
//
// NO NETWORK IN THIS FILE. Every DNS case is driven for real in
// `npm run drive:deliver` against live domains; what is asserted here is the
// behaviour that does not need a resolver — which includes the removal path,
// because a name with no dot is answered without a lookup.
//
// MUTATION TESTED: 12 mutants, all killed — info@ put back on the system list,
// `sendable` no longer consulting it, a consumer mailbox treated as corporate, a
// corporate subscriber refused, a relationship alone counted as a soft opt-in,
// the necessity test passing with no provenance, the typo check moved after the
// mail-route verdict, a failed lookup removing the address, the account email
// dropped as a reply fallback, one of brand-access's three returns losing it,
// the route sending the unverified list, and the mailbox stem left unstripped.
//
// ONE VACUOUS MUTANT, RECORDED SO IT IS NOT MISTAKEN FOR COVERAGE. My first
// attempt at the failed-lookup mutant added a nonsense property (`accepts2`)
// instead of changing `accepts`, so it altered nothing and "survived" a check
// that was in fact sound. A mutant that does not change behaviour is not
// evidence either way; the real one — `accepts: false, certainty: "certain"` —
// was killed.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// 3. info@ and sales@ are the front door
// ---------------------------------------------------------------------------

test("a business front door is sendable, and an abuse desk is not", async () => {
  const { validateAddress } = await import("../src/backend/email.ts");

  for (const local of ["info", "sales", "contact", "office", "support", "enquiries",
    "hello", "accounts", "bookings", "admin", "quotes", "orders"]) {
    const v = validateAddress(`${local}@acme-plumbing.co.uk`);
    assert.equal(v.sendable, true, `${local}@ must be sendable — for B2B it is often the only published address`);
    assert.equal(v.businessMailbox, true, `${local}@ must be flagged as shared so copy does not open with a first name`);
  }

  // The narrow refusal that remains. Mail to the first three is reported to the
  // domain's own abuse desk; the rest is unread or refused by design.
  for (const local of ["abuse", "postmaster", "hostmaster", "noreply", "no-reply",
    "mailer-daemon", "bounce", "root"]) {
    const v = validateAddress(`${local}@acme-plumbing.co.uk`);
    assert.equal(v.sendable, false, `${local}@ must stay refused`);
    assert.match(v.reason, /abuse-desk or send-only/,
      "and the reason has to say why, or it reads as the old blanket role refusal");
  }
});

test("a suffixed or numbered mailbox is the same kind of mailbox", async () => {
  const { mailboxRole } = await import("../src/shared/mailbox-class.ts");
  // A flat membership test mailed `info@` and refused `info-uk@`, which is the
  // same list-shaped defect one character along.
  for (const local of ["info", "info-uk", "info2", "info_2", "sales2", "sales.team", "support-eu", "info+tag"]) {
    assert.equal(mailboxRole(`${local}@acme.co.uk`), "business", local);
  }
  assert.equal(mailboxRole("dave@acme.co.uk"), "person");
  assert.equal(mailboxRole("abuse@acme.co.uk"), "system");
});

test("the harvester and the mailer give the SAME answer about one address", async () => {
  // THE DEFECT: two lists, same concept, opposite verdicts. `lead-harvest`
  // called info@ the lowest-risk contact a business has; `email.ts` refused it.
  const { classifyEmail } = await import("../src/backend/lead-harvest.ts");
  const { validateAddress } = await import("../src/backend/email.ts");
  for (const a of ["info@acme.co.uk", "sales@acme.co.uk", "office@acme.co.uk"]) {
    assert.equal(classifyEmail(a).contactType, "generic");
    assert.equal(validateAddress(a).sendable, true,
      `${a}: the harvester recommends it and the mailer must not refuse it`);
  }
  // And one source of truth, not two lists that happen to agree today.
  const harvest = codeOf(readFileSync("src/backend/lead-harvest.ts", "utf8"));
  assert.match(harvest, /from "@\/shared\/mailbox-class"/);
  const mailer = codeOf(readFileSync("src/backend/email.ts", "utf8"));
  assert.match(mailer, /from "@\/shared\/mailbox-class"/);
  assert.doesNotMatch(mailer, /ROLE_LOCALPARTS/, "the second list must be gone, not merely unused");
});

// ---------------------------------------------------------------------------
// 1. A company contact has a lawful basis without anybody's consent
// ---------------------------------------------------------------------------

test("subscriber type follows PECR, not whether the mailbox has a name on it", async () => {
  const { subscriberType } = await import("../src/shared/mailbox-class.ts");

  const named = subscriberType("dave@acme-plumbing.co.uk");
  assert.equal(named.type, "corporate");
  assert.equal(named.personalData, true, "it identifies a person, so UK GDPR applies to the processing");
  assert.match(named.why, /regulation 22 does not require consent/);

  const shared = subscriberType("info@acme-plumbing.co.uk");
  assert.equal(shared.type, "corporate");
  assert.equal(shared.personalData, false, "a shared mailbox identifies nobody");

  const consumer = subscriberType("dave@gmail.com");
  assert.equal(consumer.type, "individual");
  assert.match(consumer.why, /consent, or a soft opt-in/);

  // THE CAVEAT IS CARRIED, NOT ASSUMED AWAY: a sole trader on their own domain
  // is an individual subscriber and looks identical to a limited company here.
  assert.equal(named.soleTraderRisk, true);
  assert.equal(subscriberType("dave@acme.co.uk", { soleTrader: true }).type, "individual");
  assert.equal(consumer.soleTraderRisk, false, "a consumer mailbox is already individual — the risk is not open");
});

test("a named UK business mailbox can be contacted, on legitimate interests", async () => {
  const { assessCompliance, buildContactRecord } = await import("../src/backend/lead-harvest.ts");
  const record = buildContactRecord({
    email: "dave@acme-plumbing.co.uk", country: "GB",
    sourceUrl: "https://acme-plumbing.co.uk/contact",
  });
  const v = assessCompliance({ record });
  // THE OLD BEHAVIOUR: canContact false, lawfulBasis "none", "cannot contact
  // until a lawful basis is established" — on a published business address.
  assert.equal(v.canContact, true);
  assert.equal(v.lawfulBasis, "legitimate_interest");
  assert.match(v.reasons.join(" "), /corporate subscriber/);
  assert.ok(v.requirements.some((r) => /sole trader/i.test(r)),
    "the one thing the address cannot reveal has to travel with the verdict");
  assert.ok(v.requirements.some((r) => /object/i.test(r)),
    "the right to object is the condition that makes legitimate interests lawful");
});

test("a personal mailbox with no relationship is still refused", async () => {
  const { assessCompliance, buildContactRecord } = await import("../src/backend/lead-harvest.ts");
  const record = buildContactRecord({ email: "dave.smith@gmail.com", country: "GB", sourceUrl: "x" });

  const bare = assessCompliance({ record });
  assert.equal(bare.canContact, false, "this refusal is the one that is genuinely unlawful — it stays");
  assert.match(bare.reasons.join(" "), /individual subscriber/,
    "and it is refused as an individual subscriber, not as 'no consent recorded'");

  // All three soft opt-in conditions, or none.
  const full = assessCompliance({ record, relationship: "purchase", similarProducts: true, optOutOfferedAtCollection: true });
  assert.equal(full.canContact, true);
  for (const partial of [
    { relationship: "purchase", similarProducts: true, optOutOfferedAtCollection: false },
    { relationship: "purchase", similarProducts: false, optOutOfferedAtCollection: true },
    { relationship: "none", similarProducts: true, optOutOfferedAtCollection: true },
  ]) {
    assert.equal(assessCompliance({ record, ...partial }).canContact, false,
      `two of three is not a soft opt-in: ${JSON.stringify(partial)}`);
  }
});

test("the platform writes the balancing test, and it can fail", async () => {
  const { legitimateInterestAssessment } = await import("../src/shared/lia.ts");
  const base = {
    controller: "Acme Bathrooms Ltd", subject: "dave@acme-plumbing.co.uk",
    sellsWhat: "bathroom installation", recipientContext: "a plumbing contractor",
    source: "https://acme-plumbing.co.uk/contact", purpose: "trade supply terms",
    nowISO: "2026-10-07", personalData: true,
  };
  const ok = legitimateInterestAssessment(base);
  assert.equal(ok.passed, true);
  assert.equal(ok.parts.length, 3, "purpose, necessity, balancing — the ICO's three");
  assert.equal(ok.assessedAt, "2026-10-07", "a record carries its date or it is not a record");

  // A MISSING INPUT FAILS THE PART IT BELONGS TO rather than being filled in
  // with a plausible sentence. A fabricated balancing test is worse than none:
  // it is the document that would be produced to a regulator.
  const noSource = legitimateInterestAssessment({ ...base, source: "" });
  assert.equal(noSource.passed, false);
  assert.equal(noSource.parts.find((p) => p.part === "necessity").passed, false);
  assert.match(noSource.outcome, /missing input, not a refusal by the recipient/);

  const noPurpose = legitimateInterestAssessment({ ...base, purpose: "" });
  assert.equal(noPurpose.parts.find((p) => p.part === "balancing").passed, false);
  const noSeller = legitimateInterestAssessment({ ...base, sellsWhat: "" });
  assert.equal(noSeller.parts.find((p) => p.part === "purpose").passed, false);
});

test("a failed assessment refuses the contact, with the reason", async () => {
  const { assessCompliance, buildContactRecord } = await import("../src/backend/lead-harvest.ts");
  const { legitimateInterestAssessment } = await import("../src/shared/lia.ts");
  const record = buildContactRecord({ email: "dave@acme-plumbing.co.uk", country: "GB", sourceUrl: "x" });
  const failed = legitimateInterestAssessment({
    controller: "", subject: "dave@acme-plumbing.co.uk", sellsWhat: "", recipientContext: "",
    source: "", purpose: "", nowISO: "2026-10-07", personalData: true,
  });
  const v = assessCompliance({ record, lia: failed });
  assert.equal(v.canContact, false);
  assert.match(v.reasons.join(" "), /did not pass/);
});

test("the readiness model no longer blocks a lawful B2B contact", async () => {
  const { readiness } = await import("../src/shared/contact-hunter.ts");
  const { assessCompliance, buildContactRecord } = await import("../src/backend/lead-harvest.ts");
  const compliance = assessCompliance({
    record: buildContactRecord({ email: "dave@acme-plumbing.co.uk", country: "GB", sourceUrl: "https://acme-plumbing.co.uk/contact" }),
  });
  const evidence = [{
    sourceType: "company_website", sourceUrl: "https://acme-plumbing.co.uk/contact",
    sourceDomain: "acme-plumbing.co.uk", observedAt: "2026-10-01", publishedBusinessContext: true,
  }];
  const r = readiness({
    icpFit: 80,
    employment: { status: "confirmed", confidence: 0.9, jobTitle: "Owner", why: "named on the site", evidence: [] },
    email: { value: "dave@acme-plumbing.co.uk", emailStatus: "VERIFIED", provenance: "confirmed", evidence },
    evidence,
    compliance: { canContact: compliance.canContact, lawfulBasis: compliance.lawfulBasis, reasons: compliance.reasons },
    refreshedAt: "2026-10-01", asOf: "2026-10-07",
  });
  assert.equal(r.blocks.filter((b) => /lawful basis/i.test(b)).length, 0, r.blocks.join(" | "));
  assert.ok(Number.isFinite(r.score), "and the score is a number — a NaN here was my own bad fixture, not the model");
});

// ---------------------------------------------------------------------------
// 2. The bounces are removed before the send
// ---------------------------------------------------------------------------

test("a mistyped consumer domain is removed even though it accepts mail", async () => {
  const { verifyRecipients } = await import("../src/backend/address-verify.ts");
  // NO DNS IS USED FOR THIS CASE, deliberately: a known typo is removed before
  // any lookup, which is also why the check cannot be fooled by the squatter's
  // own mail server. Measured: gmial.com resolves to a live host and gnail.com
  // publishes real MX records at mx1.oweb.cn, because collecting misdirected
  // mail is the point of registering them. So this would be DELIVERED to a
  // stranger rather than bounce, which is worse.
  const res = await verifyRecipients(["c@gmial.com", "f@gnail.com", "h@hotmai.com"]);
  assert.equal(res.deliverable.length, 0);
  assert.equal(res.removed.length, 3);
  assert.equal(res.domainsChecked, 0, "a known typo must cost no DNS query at all");
  assert.deepEqual(res.removed.map((r) => r.kind), ["typo", "typo", "typo"]);
  assert.equal(res.removed[0].suggestion, "c@gmail.com");
  assert.match(res.removed[0].reason, /DELIVERED to a stranger/);
  // OFFERED, NEVER APPLIED. Rewriting an address somebody typed is a guess about
  // their intent, and a wrong guess mails a stranger.
  assert.ok(!res.deliverable.includes("c@gmail.com"), "the correction must not be sent to");
});

test("a name nothing can accept mail for is removed, with no lookup needed", async () => {
  const { verifyRecipients } = await import("../src/backend/address-verify.ts");
  const res = await verifyRecipients(["a@localhost", "b@notadomain"]);
  assert.equal(res.removed.length, 2);
  assert.equal(res.deliverable.length, 0);
  assert.match(res.note, /removed before sending/);
});

test("an unanswered lookup KEEPS the address and says so", async () => {
  // The real SERVFAIL case is driven in `npm run drive:deliver` against
  // dnssec-failed.org. What is pinned here is that the branch exists and which
  // way it falls, because getting it the other way round silently deletes real
  // customers whenever a resolver is slow — a failure nobody ever finds out about.
  const code = codeOf(readFileSync("src/backend/address-verify.ts", "utf8"));
  assert.match(code, /certainty: "unknown"/);
  assert.match(code, /if \(route\.certainty === "unknown"\) \{ unknown\+\+; deliverable\.push\(a\); continue; \}/);
  assert.match(code, /accepts: true, certainty: "unknown", kind: "lookup-failed"/,
    "accepts must stay TRUE on a failed lookup or the address is dropped");
});

test("RFC 5321's implicit MX is honoured, or working addresses get deleted", async () => {
  const code = codeOf(readFileSync("src/backend/address-verify.ts", "utf8"));
  assert.match(code, /implicit-a/);
  assert.match(code, /resolve4\(d\)\.catch\(\(\) => resolver\.resolve6\(d\)\)/,
    "no MX is not the end of the question — an address record is an implicit mail exchanger");
  // RFC 7505: a single "." MX is an explicit refusal of all mail.
  assert.match(code, /m\.exchange !== "\."/);
});

test("the send and the preview apply the SAME verification", async () => {
  // A preview that counts people the send will remove is this codebase's
  // second-oldest defect, and it has been fixed twice before in this exact file.
  const route = codeOf(readFileSync("src/app/api/email/route.ts", "utf8"));
  const preview = codeOf(readFileSync("src/backend/email-preview.ts", "utf8"));
  for (const [name, code] of [["route", route], ["preview", preview]]) {
    assert.match(code, /verifyRecipients/, `${name} must run the verification`);
  }
  assert.match(route, /const sendable = dns\.deliverable/,
    "the verified list must be what is actually sent to");
  // And the removal is remembered only when it can never work.
  assert.match(route, /dns\.removed\.filter\(\(r\) => r\.permanent\)/);
});

// ---------------------------------------------------------------------------
// 4. Replies come back to the customer
// ---------------------------------------------------------------------------

test("a reply never goes to the platform when an account email exists", async () => {
  const { replyTarget } = await import("../src/shared/sender-identity.ts");
  const platformFrom = "info@marketwaros.com";

  // THE FAULT, reproduced: nothing supplied, which is what the live route had.
  const broken = replyTarget({ platformFrom });
  assert.equal(broken.address, "");
  assert.equal(broken.toPlatform, true, "and it must SAY it would come to us, not return a quiet empty string");

  const fixed = replyTarget({ accountEmail: "dave@acmebathrooms.co.uk", platformFrom });
  assert.equal(fixed.address, "dave@acmebathrooms.co.uk");
  assert.equal(fixed.source, "account");
  assert.equal(fixed.toPlatform, false);
  assert.match(fixed.why, /needs no DNS/);

  // THE ONE THAT MUST NEVER BE CHOSEN. A campaign sent from the platform's own
  // shared sender must not reply to it — the customer's prospect would be
  // writing to MarketWar.
  const shared = replyTarget({ fromEmail: platformFrom, accountEmail: "acc@acme.co.uk", platformFrom });
  assert.equal(shared.address, "acc@acme.co.uk");
  assert.equal(shared.source, "account");
  // Including a subdomain of it — SPF and reputation treat them as one estate.
  const sub = replyTarget({ fromEmail: "os@notifications.marketwaros.com", accountEmail: "acc@acme.co.uk", platformFrom });
  assert.equal(sub.source, "account");
});

test("reply precedence: stated, then the brand's host, then its From, then the account", async () => {
  const { replyTarget } = await import("../src/shared/sender-identity.ts");
  const all = {
    stated: "me@mine.com",
    brandReplyAddress: "r.acme.ab12cd@reply.marketwaros.com",
    fromEmail: "hello@acme.co.uk",
    accountEmail: "acc@acme.co.uk",
    platformFrom: "info@marketwaros.com",
  };
  assert.equal(replyTarget(all).source, "stated");
  assert.equal(replyTarget({ ...all, stated: "" }).source, "platform-reply-host");
  assert.equal(replyTarget({ ...all, stated: "", brandReplyAddress: "" }).source, "brand-from");
  assert.equal(replyTarget({ ...all, stated: "", brandReplyAddress: "", fromEmail: "" }).source, "account");
  assert.equal(replyTarget({ ...all, stated: "", brandReplyAddress: "", fromEmail: "", accountEmail: "" }).source, "none");
});

test("the account email actually crosses the brand-access boundary", async () => {
  // THE OLDEST DEFECT CLASS IN THIS CODEBASE: `requireAuth` decoded the verified
  // email on line one and `resolveBrandAccess` dropped it, so the route that
  // needed it had nothing to route a reply to.
  const access = codeOf(readFileSync("src/backend/brand-access.ts", "utf8"));
  assert.equal((access.match(/email: auth\.email/g) || []).length, 3,
    "all three success returns must carry it, or one path still loses the reply");

  const route = codeOf(readFileSync("src/app/api/email/route.ts", "utf8"));
  assert.match(route, /accountEmail: access\.email \|\| ""/);
  assert.match(route, /const replyTo = reply\.address \|\| undefined/);
  assert.match(route, /replyRouting: \{/, "and the send must report where replies will go");

  // The review request asks "how was it?" — a reply is the whole point of it.
  const reviews = codeOf(readFileSync("src/app/api/review-requests/route.ts", "utf8"));
  assert.match(reviews, /replyTarget\(/);
  assert.match(reviews, /replyTo: reply\.address \|\| undefined/);
});

test("bounces still come back to the platform, and that is deliberate", async () => {
  // THE DISTINCTION THE FIX RESTS ON. A delivery failure must reach the platform
  // — it is the platform that parses it and suppresses the dead address, and the
  // pool's reputation depends on that happening. Only REPLIES belong to the
  // customer. Collapsing the two would mean either the customer drowning in
  // failure notices or nobody suppressing anything.
  const code = readFileSync("src/shared/sender-identity.ts", "utf8");
  assert.match(code, /Reply-To and Return-Path are not two settings of one thing/);
  const { bounceAddressFor } = await import("../src/backend/reply-routing.ts");
  const verp = bounceAddressFor("acme", "dave@example.com");
  assert.ok(verp.includes("@"), "the envelope sender stays ours and stays per-recipient");
  assert.ok(!verp.startsWith("dave@"), "and it is not the recipient's own address");
});

// ---------------------------------------------------------------------------
// 1b. Where the blocking actually came from: the platform's own prospecting
// ---------------------------------------------------------------------------

test("an unrecorded consent is not a refusal, and an opt-out still is", async () => {
  const { bulkEligibility } = await import("../src/shared/mailbox-class.ts");

  // THE CASE THAT WAS BROKEN. The First Customer sprint saved businesses found
  // in public listings with `consent: false` — meaning "no opt-in on file" — and
  // the sender read it as "they asked not to be emailed".
  const business = bulkEligibility({ email: "info@acme-plumbing.co.uk" });
  assert.equal(business.mailable, true);
  assert.equal(business.basis, "legitimate_interest");

  const named = bulkEligibility({ email: "dave@acme-plumbing.co.uk" });
  assert.equal(named.mailable, true, "a named mailbox at a company is a corporate subscriber too");

  // AN OBJECTION OUTRANKS EVERY BASIS, and nothing may override it.
  const out = bulkEligibility({ email: "info@acme-plumbing.co.uk", consent: false });
  assert.equal(out.mailable, false);
  assert.equal(out.basis, "opted_out");
  assert.match(out.why, /No lawful basis overrides an objection/);

  // AND THE REFUSAL THAT IS KEPT. Deleting the consent check outright would have
  // made this one sendable, which is the case that really is unlawful.
  const personal = bulkEligibility({ email: "dave.smith@gmail.com" });
  assert.equal(personal.mailable, false);
  assert.equal(personal.basis, "needs_consent");
  assert.match(personal.why, /missing record, not a refusal/);

  assert.equal(bulkEligibility({ email: "dave.smith@gmail.com", consent: true }).basis, "consent");
  assert.equal(bulkEligibility({
    email: "dave.smith@gmail.com", relationship: "purchase", similarProducts: true, optOutOfferedAtCollection: true,
  }).basis, "soft_opt_in");
  // All three, or none.
  assert.equal(bulkEligibility({
    email: "dave.smith@gmail.com", relationship: "purchase", similarProducts: true,
  }).mailable, false);
});

test("the sprint no longer writes an opt-out onto a business it found", async () => {
  // NOT THROUGH `codeOf`, AND THAT IS THE POINT OF THIS COMMENT. The first
  // version of this check ran the file through `codeOf` and asserted the string
  // was absent — and it passed with the defect reinstated, because `codeOf`
  // strips `/* … */` and a .tsx file is full of `{/* … */}` JSX comments, so the
  // span it removed swallowed the code being asserted on. The check was vacuous
  // and only mutation testing said so.
  //
  // An ANCHORED line pattern needs no stripping and cannot match a comment: a
  // commented mention starts with `//`, so `^\s+consent: false,$` sees only the
  // real object property.
  const page = readFileSync("src/app/dashboard/first-customer/page.tsx", "utf8");
  assert.doesNotMatch(page, /^\s+consent: false,$/m,
    "a found business has no consent ON FILE, which is not the same as having refused");
  // And the copy must not tell the owner the opposite of what the sender does.
  assert.doesNotMatch(page, /marked NOT consented/);
});

test("the send, the preview and the donut use ONE eligibility rule", async () => {
  // Three implementations of "who receives this" is how a preview comes to
  // disagree with the button underneath it. This codebase has paid for it twice.
  for (const f of ["src/app/api/email/route.ts", "src/backend/email-preview.ts", "src/shared/list-health.ts"]) {
    const code = codeOf(readFileSync(f, "utf8"));
    assert.match(code, /bulkEligibility/, `${f} must ask the shared rule`);
    assert.doesNotMatch(code, /consent !== false/, `${f} must not keep its own version of it`);
  }
});

test("the donut separates a refusal from a missing record", async () => {
  const { listHealth } = await import("../src/shared/list-health.ts");
  const v = (email, consented) => ({
    email, consented,
    checks: { syntax: true, disposable: false, role: false, suppressed: false },
  });
  const h = listHealth([
    v("info@acme.co.uk", undefined),          // corporate, no record → mailable
    v("dave@acme.co.uk", undefined),          // corporate, named → mailable
    v("dave@gmail.com", undefined),           // individual, nothing on file
    v("sue@acme.co.uk", false),               // asked not to be emailed
  ]);
  assert.equal(h.sendable, 2);
  assert.equal(h.refusedBy.no_consent, 1, "one opt-out");
  assert.equal(h.refusedBy.needs_consent, 1, "one missing record — a different fact and a different fix");
  const labels = h.composition.map((r) => r.label).join(" | ");
  assert.match(labels, /asked not to be emailed/);
  assert.match(labels, /Personal mailbox with no consent/);
});
