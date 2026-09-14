import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readTrafficStats, postmasterVerdict, SPAM_WARN_PCT, SPAM_HALT_PCT,
} from "../src/shared/postmaster.ts";
import { sendingDomain, postmasterStatus } from "../src/backend/postmaster.ts";

// ---------------------------------------------------------------------------
// WHAT GMAIL THINKS OF THE DOMAIN — the other half of inbox placement.
//
// The seed probe measures where ONE message landed in mailboxes we own: it works
// at any volume and measures how Gmail treats a STRANGER. This measures what
// Gmail concluded about the DOMAIN from everything it actually delivered to real
// people. Both are needed; neither substitutes for the other.
//
// The rule that decides whether any of it is worth reading: Postmaster reports
// NOTHING below a few hundred authenticated messages a day. An empty response is
// an absence, and rendering it as "0% spam, LOW reputation" would manufacture
// the most alarming reading available out of nothing.
// ---------------------------------------------------------------------------

test("a ratio becomes a percentage, and an ABSENT field stays absent", () => {
  const d = readTrafficStats({
    name: "domains/marketwaros.com/trafficStats/20260913",
    userReportedSpamRatio: 0.001,
    dkimSuccessRatio: 1,
    spfSuccessRatio: 0.94,
    domainReputation: "HIGH",
  });
  assert.equal(d.date, "2026-09-13", "the date lives in the resource name, not a field");
  assert.equal(d.spamRatePct, 0.1, "0.001 is one tenth of one per cent — the difference between fine and blocked");
  assert.equal(d.dkimSuccessPct, 100);
  assert.equal(d.spfSuccessPct, 94);
  assert.equal(d.domainReputation, "HIGH");
  // THE ONE THAT MATTERS. A field Google did not send is null, never 0 — they
  // are different facts and collapsing them invents a finding.
  assert.equal(d.dmarcSuccessPct, null, "a missing DMARC figure is not a DMARC failure");
  assert.equal(d.tlsInboundPct, null);
});

test("an unknown reputation is UNKNOWN, not the worst one", () => {
  assert.equal(readTrafficStats({ name: "x/trafficStats/20260101" }).domainReputation, "UNKNOWN");
  assert.equal(readTrafficStats({ name: "x/trafficStats/20260101", domainReputation: "nonsense" }).domainReputation, "UNKNOWN");
});

test("no data from Google is reported as NO SCORE, never as a bad one", () => {
  const v = postmasterVerdict("marketwaros.com", []);
  assert.equal(v.belowThreshold, true);
  assert.equal(v.latest, null);
  assert.equal(v.blockers.length, 0, "an absence must never block a send");
  assert.match(v.verdict, /not a bad score — it is no score/);
  assert.match(v.verdict, /few hundred authenticated messages a day/,
    "the reader needs to know what would END the absence");
  assert.match(v.advice.join(" "), /seed probe/,
    "and that the other half already answers at any volume");
});

test("a run of empty days at the end does not become the current state", () => {
  // Postmaster commonly returns recent days with nothing in them. Reading the
  // LAST row would report an absence as today's reputation.
  const v = postmasterVerdict("x.com", [
    readTrafficStats({ name: "d/trafficStats/20260901", domainReputation: "HIGH", userReportedSpamRatio: 0.0002 }),
    readTrafficStats({ name: "d/trafficStats/20260902" }),
    readTrafficStats({ name: "d/trafficStats/20260903" }),
  ]);
  assert.equal(v.belowThreshold, false);
  assert.equal(v.latest.date, "2026-09-01", "the latest day with figures, not the latest day");
  assert.equal(v.latest.domainReputation, "HIGH");
});

test("Google's own thresholds decide a blocker, and the numbers are theirs not ours", () => {
  assert.equal(SPAM_WARN_PCT, 0.1);
  assert.equal(SPAM_HALT_PCT, 0.3);

  const warn = postmasterVerdict("x.com", [readTrafficStats({
    name: "d/trafficStats/20260913", domainReputation: "MEDIUM", userReportedSpamRatio: 0.0015,
  })]);
  assert.equal(warn.blockers.length, 0, "0.15% is over the limit but not over the rejection line");
  assert.match(warn.advice.join(" "), /That is the list, not the message/,
    "complaints are a list problem before they are a copy problem");

  const halt = postmasterVerdict("x.com", [readTrafficStats({
    name: "d/trafficStats/20260913", domainReputation: "BAD", userReportedSpamRatio: 0.004,
  })]);
  assert.ok(halt.blockers.length >= 2, "0.4% complaints AND a BAD reputation are both blockers");
  assert.match(halt.blockers.join(" "), /Stop sending campaigns/);
  assert.match(halt.verdict, /in trouble at Gmail/);
});

test("authentication failures name the one thing that is entirely ours to fix", () => {
  const v = postmasterVerdict("x.com", [readTrafficStats({
    name: "d/trafficStats/20260913", domainReputation: "HIGH",
    dkimSuccessRatio: 0.7, spfSuccessRatio: 0.6, dmarcSuccessRatio: 0.55,
  })]);
  const all = v.advice.join(" ");
  assert.match(all, /DKIM passed on only 70%/);
  assert.match(all, /SPF passed on only 60%/);
  assert.match(all, /DMARC passed on only 55%/);
  assert.match(all, /Alignment, not just presence/,
    "a published DMARC record that never aligns is the commonest version of this");
  assert.equal(v.blockers.length, 0, "poor authentication is urgent, but it is not a reason to stop a send today");
});

test("a healthy domain says so in one line, with no invented advice", () => {
  const v = postmasterVerdict("x.com", [readTrafficStats({
    name: "d/trafficStats/20260913", domainReputation: "HIGH",
    userReportedSpamRatio: 0.0001, dkimSuccessRatio: 1, spfSuccessRatio: 1, dmarcSuccessRatio: 1, inboundEncryptionRatio: 1,
  })]);
  assert.equal(v.advice.length, 0, "nothing to say is a valid answer and padding it destroys the signal");
  assert.equal(v.blockers.length, 0);
  assert.match(v.verdict, /healthy at Gmail/);
});

// ---------------------------------------------------------------------------
// The client's own refusals — each naming ONE cause with its own fix.
// ---------------------------------------------------------------------------

test("the sending domain is read out of EMAIL_FROM, however it is written", () => {
  const saved = process.env.EMAIL_FROM;
  try {
    process.env.EMAIL_FROM = "MarketWar OS <os@notifications.marketwaros.com>";
    assert.equal(sendingDomain(), "notifications.marketwaros.com");
    process.env.EMAIL_FROM = "plain@marketwaros.com";
    assert.equal(sendingDomain(), "marketwaros.com");
    delete process.env.EMAIL_FROM;
    assert.equal(sendingDomain(), "");
  } finally { if (saved === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved; }
});

test("with no Google credential it says which credential, not 'could not read'", async () => {
  const st = postmasterStatus();
  assert.equal(st.configured, false, "this container has no Google credential");
  assert.match(st.blocker, /No Google credential/);
  assert.match(st.blocker, /Search Console already uses/,
    "naming the credential the platform already has is the difference between a remedy and a shrug");
});

test("the route's refusals are distinguishable — 404 and 403 have different fixes", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/backend/postmaster.ts", import.meta.url), "utf8");
  assert.match(src, /res\.status === 404/);
  assert.match(src, /postmaster\.google\.com\/managedomains/,
    "a domain that was never registered needs the page that registers it — there is no API for that step");
  assert.match(src, /res\.status === 403/);
  assert.match(src, /VERIFIED under in Postmaster Tools/,
    "403 is a different problem from 404 and collapsing them is the wrong-remedy defect");
});

// ---------------------------------------------------------------------------
// QUOTA AND LATENCY — the answer to "those only exist under real load".
//
// True, and it was being used as a reason not to KNOW. It is a reason not to
// simulate them; it is the opposite of a reason not to measure them. A platform
// that cannot answer "is the database slow" or "are we being refused for quota"
// finds out from a customer, as "the site is broken".
// ---------------------------------------------------------------------------

test("timing an operation never changes its outcome", async () => {
  const { timed, __resetStoreHealth, storeHealth } = await import("../src/backend/store-health.ts");
  __resetStoreHealth();

  assert.equal(await timed("ok", async () => 42), 42, "the value must pass through untouched");

  // THE ERROR IS RE-THROWN EXACTLY AS IT ARRIVED. A measurement that swallows
  // what it measures is how "no data" came to mean seven different things here.
  const original = Object.assign(new Error("RESOURCE_EXHAUSTED"), { code: 8 });
  await assert.rejects(() => timed("bad", async () => { throw original; }), (e) => e === original);

  const h = storeHealth();
  assert.equal(h.operations, 2);
  assert.equal(h.quotaRefusals, 1, "and the refusal was still counted on the way past");
});

test("failures are counted by KIND, because the kinds have different fixes", async () => {
  const { timed, __resetStoreHealth, storeHealth } = await import("../src/backend/store-health.ts");
  __resetStoreHealth();
  const throwing = (err) => timed("x", async () => { throw err; }).catch(() => {});
  await throwing(Object.assign(new Error("quota"), { code: 8 }));
  await throwing(Object.assign(new Error("quota"), { code: 8 }));
  await throwing(Object.assign(new Error("denied"), { code: 7 }));
  await throwing(new Error("The query requires an index. https://console.firebase.google.com/x"));

  const h = storeHealth();
  assert.equal(h.failures.quota, 2);
  assert.equal(h.failures.permission, 1);
  assert.equal(h.failures.index, 1);
  assert.equal(h.failed, 4);
  // "errors: 4" would hide three different remedies.
  assert.match(h.advice.join(" "), /refused for QUOTA/);
  assert.match(h.advice.join(" "), /MISSING INDEX/);
  assert.match(h.advice.join(" "), /Admin SDK is not really/);
});

test("too few operations means NO percentile, not a percentile of two", async () => {
  const { timed, __resetStoreHealth, storeHealth, MIN_SAMPLE } = await import("../src/backend/store-health.ts");
  __resetStoreHealth();
  for (let i = 0; i < 3; i++) await timed("x", async () => i);
  const few = storeHealth();
  assert.equal(few.p50Ms, null, "a p50 over three samples is one number wearing a statistic's clothes");
  assert.equal(few.p95Ms, null);
  assert.match(few.verdict, new RegExp(`${MIN_SAMPLE} needed`));

  __resetStoreHealth();
  for (let i = 0; i < MIN_SAMPLE; i++) await timed("x", async () => i);
  const enough = storeHealth();
  assert.equal(typeof enough.p50Ms, "number", "at the threshold the figures become real");
  assert.match(enough.verdict, /all succeeded, median/);
});

test("an idle instance reports nothing rather than a perfect score", async () => {
  const { __resetStoreHealth, storeHealth } = await import("../src/backend/store-health.ts");
  __resetStoreHealth();
  const h = storeHealth();
  assert.equal(h.operations, 0);
  assert.equal(h.p50Ms, null);
  assert.match(h.verdict, /nothing to report. That is not a health score/);
});

test("the report says what it is — one instance, in memory, recent", async () => {
  const { storeHealth } = await import("../src/backend/store-health.ts");
  const h = storeHealth();
  assert.match(h.scope, /One instance/);
  assert.match(h.scope, /never a fleet-wide or historical metric/,
    "a number without its scope gets read as the fleet's and acted on as if it were");
});

test("the heaviest reads are the ones that are timed", async () => {
  // Wiring, checked as wiring. These are the two reads that will meet a quota
  // ceiling first: the whole vault, and the whole suppression list.
  const { readFileSync } = await import("node:fs");
  const contacts = readFileSync(new URL("../src/backend/contacts.ts", import.meta.url), "utf8");
  const events = readFileSync(new URL("../src/backend/email-events.ts", import.meta.url), "utf8");
  assert.match(contacts, /timed\("contacts\.listPage", \(\) => page\.get\(\)\)/);
  assert.match(events, /timed\("suppressions\.page", \(\) => page\.get\(\)\)/);
});
