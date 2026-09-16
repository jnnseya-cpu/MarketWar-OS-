import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// WHO IS A SUPPRESSION FOR — this brand, or everybody?
//
// THE DEFECT. `email.ts` kept ONE process-global Set holding bounces, complaints
// AND unsubscribes, with no brand key, while the durable ledger keys every row
// by `brandId`. `validateAddress` consults the global one for every tenant, so
// on a warm process one tenant's unsubscribe made that address unsendable for
// EVERY other tenant — and a person leaving MarketWar's own newsletter was
// removed from every customer's campaign list too, which the newsletter's own
// comment said must never happen, one line above the call that did it.
//
// It OVER-suppressed, so nothing ever looked broken; it just quietly shrank
// other people's lists. Found by the module harness failing on its second run
// inside one server process.
//
// TWO DIRECTIONS, AND THEY ARE NOT SYMMETRICAL. Over-suppression costs a tenant
// reach. UNDER-suppression mails somebody who asked not to be mailed, which is
// the thing this platform exists to prevent. So the tests below check both, and
// the under-suppression ones are the ones that matter most.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("an unsubscribe is NOT written to the process-global ledger", async () => {
  const email = await import("../src/backend/email.ts");
  const events = await import("../src/backend/email-events.ts");

  const addr = `leaver-${Date.now()}@example.com`;
  await events.recordEvent({ brandId: "brand-A", email: addr, type: "unsubscribe", at: new Date().toISOString() });

  // `validateAddress` reads the global set. A brand-scoped opt-out must not
  // appear there, or every OTHER tenant loses this address.
  assert.equal(email.validateAddress(addr).checks.suppressed, false,
    "one brand's unsubscribe must not suppress the address platform-wide");
  assert.equal(email.validateAddress(addr).sendable, true);
});

test("BUT the brand they left still cannot mail them — the durable row is written", async () => {
  // THE UNDER-SUPPRESSION CHECK, and the reason the change is safe. The campaign
  // send, the preview and list health all load `suppressedEmails(brandId)`
  // independently of the in-memory set.
  const events = await import("../src/backend/email-events.ts");
  const addr = `leaver2-${Date.now()}@example.com`;
  await events.recordEvent({ brandId: "brand-A", email: addr, type: "unsubscribe", at: new Date().toISOString() });

  const forA = await events.suppressedEmails("brand-A");
  assert.ok(forA.has(addr), "the brand they unsubscribed from must never mail them again");

  const forB = await events.suppressedEmails("brand-B");
  assert.ok(!forB.has(addr), "a different brand is a different relationship");
});

test("a hard bounce IS global — the mailbox is dead for everybody", async () => {
  const email = await import("../src/backend/email.ts");
  const events = await import("../src/backend/email-events.ts");

  const addr = `dead-${Date.now()}@example.com`;
  await events.recordEvent({ brandId: "brand-A", email: addr, type: "bounce", at: new Date().toISOString() });

  assert.equal(email.validateAddress(addr).checks.suppressed, true,
    "a dead mailbox is dead for every tenant, and they all share the sending pool");
  assert.equal(email.validateAddress(addr).sendable, false);
});

test("a spam complaint is global too — every tenant shares the IPs that earned it", async () => {
  const email = await import("../src/backend/email.ts");
  const events = await import("../src/backend/email-events.ts");

  const addr = `angry-${Date.now()}@example.com`;
  await events.recordEvent({ brandId: "brand-A", email: addr, type: "complaint", at: new Date().toISOString() });
  assert.equal(email.validateAddress(addr).checks.suppressed, true);
});

test("leaving the MarketWar newsletter does not remove you from a customer's list", async () => {
  // The exact reversal. The newsletter's own comment said "a customer leaving
  // AxionOS's campaigns must not stop MarketWar writing to the AxionOS OWNER,
  // and the reverse" — and then called the brandless `suppress()`.
  const env = { NEWSLETTER_SECRET: "newsletter-secret-long-enough-here" };
  const nl = await import("../src/backend/newsletter.ts");
  const email = await import("../src/backend/email.ts");

  const addr = `reader-${Date.now()}@example.com`;
  const res = await nl.unsubscribe(nl.unsubscribeToken(addr, env), env);
  assert.equal(res.ok, true);

  // Gone from the newsletter…
  assert.equal(await nl.hasOptedOut(addr), true,
    "the newsletter opt-out must still be honoured — this is the under-suppression direction");

  // …and still reachable by the business they actually subscribed to.
  assert.equal(email.validateAddress(addr).sendable, true,
    "a newsletter opt-out must not silence every customer's campaigns");
});

test("the newsletter's own send path still refuses an opted-out address", async () => {
  // Proof the opt-out is enforced WITHOUT the global ledger: `resolveRecipients`
  // consults `hasOptedOut`, which reads memOptOuts and the durable collection.
  const src = codeOf(readFileSync("src/backend/newsletter.ts", "utf8"));
  assert.match(src, /if \(await hasOptedOut\(email\)\) \{ skipped\.opted_out \+= 1; continue; \}/,
    "the newsletter must filter on its own opt-out list before sending");
  assert.match(src, /collection\(OPTOUTS\)\.doc\(hid\(email\)\)\.set/,
    "and that list must be durable, not only in memory");
  assert.doesNotMatch(src, /\n\s*suppress\(email\);/,
    "the newsletter must not write a brandless suppression");
});

test("nothing routes an unsubscribe into the global ledger any more", () => {
  const src = codeOf(readFileSync("src/backend/email-events.ts", "utf8"));
  // The global call must be gated on hard failures only.
  assert.match(src, /if \(ev\.type === "bounce" \|\| ev\.type === "complaint"\) suppress\(e\.email\);/);
  // And the durable per-brand row must still be written for all three, or an
  // unsubscribe would be recorded nowhere at all.
  assert.match(src, /ev\.type === "unsubscribe"[\s\S]{0,200}addSuppression\(e\.brandId/);
});

test("the one-off send honours a named brand's opt-outs", () => {
  // `sendEmail` reads the global set and cannot know about a brand nobody named.
  // Where a caller names one, its durable opt-outs apply in full.
  const src = codeOf(readFileSync("src/app/api/email/route.ts", "utf8"));
  assert.match(src, /const scopeBrand = typeof body\.brandId === "string"/);
  assert.match(src, /suppressedEmails\(scopeBrand\)/);
  assert.match(src, /failure: "suppressed"/);
  // And it must check the caller owns that brand before reading its ledger.
  assert.match(src, /resolveBrandAccess\(req, scopeBrand\)/);
});
