import test from "node:test";
import assert from "node:assert/strict";

// DATA-SUBJECT RIGHTS — the invariants that are LAW, not preference.
//
// WHAT THESE GUARD AGAINST. The export and the erasure read a register of all
// ninety-one stores. `npm run check:register` proves the register is COMPLETE;
// `npm run drive:privacy` proves the chain WORKS (26 proven). Neither proves
// the register is CORRECT — and three of its decisions are the kind that look
// like tidying when someone changes them:
//
//   • A suppression list set to "erase". It reads like respecting the request.
//     It means the platform may mail that person again, because the only record
//     of their objection was the thing deleted.
//   • A financial record set to "erase". Six years of tax evidence, gone on a
//     customer's request we are not allowed to honour that way.
//   • An audit trail set to "erase", which makes it not an audit trail.
//
// Each would pass typecheck, pass the completeness gate, pass the driver, and
// be found by an auditor instead of by us. So each is asserted here by name.
//
// The pseudonymisation tests exist for a different reason: it is the one erasure
// path that KEEPS the row, so "did it actually stop identifying anybody, and do
// the numbers still work?" are both real questions, and the first version got
// the second one wrong.

const privacy = await import("../src/backend/privacy.ts");
const { DATA_STORES, dataRegister, storeFor } = privacy;

test("the register is internally sound — no duplicates, nothing undescribed", () => {
  const names = DATA_STORES.map((s) => s.collection);
  assert.equal(new Set(names).size, names.length, "a collection is declared twice");
  for (const s of DATA_STORES) {
    assert.ok(s.holds.length > 15, `${s.collection}: "holds" must say what it holds in words`);
    assert.ok(!/^[a-z_]+$/.test(s.holds), `${s.collection}: "holds" is a field name, not a description`);
  }
});

test("every store the register cannot reach says why, in a sentence", () => {
  const unreachable = DATA_STORES.filter((s) => s.scope.by === "unreachable");
  assert.ok(unreachable.length > 20, "expected many unreachable stores — most are not brand-keyed");
  for (const s of unreachable) {
    assert.ok(s.scope.why.length > 40, `${s.collection}: the reason must be a sentence a person can act on, not a label`);
  }
});

test("every store that is kept or anonymised states its legal basis", () => {
  for (const s of DATA_STORES) {
    if (s.retention.mode === "erase") continue;
    assert.ok(s.retention.basis.length > 40, `${s.collection}: "${s.retention.basis}" is not a stated basis`);
  }
});

test("a suppression list is NEVER erased — erasing it would permit contact again", () => {
  // Named explicitly. A new suppression store added without a line here is
  // caught by the next test, which asserts the shape rather than the names.
  for (const name of ["email_suppressions", "contact_suppressions", "newsletter_optouts"]) {
    const s = storeFor(name);
    assert.ok(s, `${name} is missing from the register`);
    assert.equal(s.retention.mode, "retain", `${name} must be RETAINED: deleting an unsubscribe record removes the evidence of the objection and permits contact again`);
    assert.match(s.retention.basis, /objection|suppress/i, `${name}: the basis must say why it is kept`);
  }
});

test("anything whose name says suppression or opt-out is retained", () => {
  // The shape rule behind the named test above, so store number ninety-two is
  // covered the day it is added.
  for (const s of DATA_STORES) {
    if (!/suppress|optout|opt_out|unsubscribe/i.test(s.collection)) continue;
    assert.equal(s.retention.mode, "retain", `${s.collection} looks like a suppression store and must not be erased`);
  }
});

test("financial and audit records are retained on a stated basis", () => {
  const financial = ["commission_accruals", "creator_ledger", "creator_payouts", "creator_clawbacks", "payout_attempts", "org_wallets", "brand_float", "referral_attributions"];
  for (const name of financial) {
    const s = storeFor(name);
    assert.ok(s, `${name} is missing from the register`);
    assert.equal(s.retention.mode, "retain", `${name} is a financial record and must be retained`);
    assert.match(s.retention.basis, /tax|financial|money-laundering|fraud|idempoten/i, `${name}: the basis must name the duty`);
  }
  for (const name of ["audit_logs", "security_events"]) {
    const s = storeFor(name);
    assert.equal(s.retention.mode, "retain", `${name} is an audit trail and must be retained`);
  }
});

test("the erasure receipt's identity consent evidence is kept, not deleted", () => {
  // A likeness consent protects a THIRD PARTY — the person depicted. The brand
  // asking for erasure is not that person, and destroying the evidence that
  // their face was used with permission removes the only defence to their
  // complaint.
  const s = storeFor("likeness_consents");
  assert.equal(s.retention.mode, "retain");
  assert.match(s.retention.basis, /third party|depicted|consent/i);
});

test("dataRegister() counts are computed, not typed", () => {
  const r = dataRegister();
  // Recomputed here INDEPENDENTLY. An earlier coverage assertion in this
  // repository compared a summary line against the same summary and passed for
  // a mutant claiming everything was covered.
  const expectStores = DATA_STORES.length;
  const expectPersonal = DATA_STORES.filter((s) => s.personal).length;
  const expectUnreachable = DATA_STORES.filter((s) => s.scope.by === "unreachable").length;
  const expectRetain = DATA_STORES.filter((s) => s.retention.mode === "retain").length;
  assert.equal(r.stores, expectStores);
  assert.equal(r.personalStores, expectPersonal);
  assert.equal(r.unreachable, expectUnreachable);
  assert.equal(r.retain, expectRetain);
  assert.equal(r.brandScoped + r.unreachable, r.stores, "every store must be either reachable or declared unreachable");
  assert.equal(r.erase + r.anonymise + r.retain, r.stores, "every store must have exactly one erasure outcome");
  assert.equal(r.entries.length, expectStores);
});

test("the transparency register leaks no tenant data", () => {
  const text = JSON.stringify(dataRegister());
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(text), "the register must describe stores, never their contents");
});

// ---------------------------------------------------------------------------
// The one erasure path that KEEPS the row.
// ---------------------------------------------------------------------------

const events = await import("../src/backend/email-events.ts");

test("pseudonymisation removes the address, keeps the row, and keeps the counts", async () => {
  const brand = `t-pseudo-${Math.random().toString(36).slice(2, 8)}`;
  const at = (n) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
  // THREE SENDS TO TWO PEOPLE. The same person must be sent to TWICE or this
  // test cannot see the property it claims to test: with one send each, a
  // per-row random hash still yields two distinct values and the unique count
  // looks right. That mutant survived the first version of this test.
  await events.recordEvent({ brandId: brand, email: "One@Example.test", type: "sent", at: at(1) });
  await events.recordEvent({ brandId: brand, email: "two@example.test", type: "sent", at: at(2) });
  await events.recordEvent({ brandId: brand, email: "one@example.test", type: "sent", at: at(4) });
  await events.recordEvent({ brandId: brand, email: "One@Example.test", type: "open", at: at(3) });

  const before = await events.eventStats(brand);
  assert.equal(before.sent, 3, "three sends");
  assert.equal(before.sentUnique, 2, "to two distinct recipients");
  assert.equal(before.open, 1);

  const rewritten = await events.pseudonymiseBrandEvents(brand);
  assert.equal(rewritten, 4, "every event for the brand is rewritten");

  const rows = await events.brandEvents(brand);
  assert.equal(rows.length, 4, "the events are KEPT — this store is not erased");
  for (const r of rows) {
    assert.ok(!/example\.test/i.test(r.email), `the address survived in the field: ${r.email}`);
    assert.ok(r.email.startsWith("anon:"), `expected a hash, got ${r.email}`);
    // THE KEY CARRIED THE ADDRESS TOO. This is the half a field-delete misses.
    assert.ok(!/example\.test/i.test(r.id), `the address survived in the document id: ${r.id}`);
  }

  // The same person must still hash to the same value, or every unique count on
  // the platform collapses to one and every open rate is withheld.
  const after = await events.eventStats(brand);
  assert.equal(after.sentUnique, 2, "unique recipients must survive pseudonymisation — a per-row random hash would read as three");
  assert.equal(after.sent, 3);
  assert.equal(after.open, 1);
  assert.equal(after.openRate, before.openRate, "the rate must be unchanged — the numbers are what this store is kept for");
});

test("pseudonymisation is idempotent — a second erasure request rewrites nothing", async () => {
  const brand = `t-idem-${Math.random().toString(36).slice(2, 8)}`;
  await events.recordEvent({ brandId: brand, email: "x@example.test", type: "sent", at: new Date().toISOString() });
  assert.equal(await events.pseudonymiseBrandEvents(brand), 1);
  assert.equal(await events.pseudonymiseBrandEvents(brand), 0, "an already-hashed address must not be hashed again");
});

test("pseudonymisation touches only the brand that asked", async () => {
  const mine = `t-mine-${Math.random().toString(36).slice(2, 8)}`;
  const theirs = `t-theirs-${Math.random().toString(36).slice(2, 8)}`;
  const at = new Date().toISOString();
  await events.recordEvent({ brandId: mine, email: "mine@example.test", type: "sent", at });
  await events.recordEvent({ brandId: theirs, email: "theirs@example.test", type: "sent", at });
  await events.pseudonymiseBrandEvents(mine);
  const others = await events.brandEvents(theirs);
  assert.equal(others.length, 1);
  assert.equal(others[0].email, "theirs@example.test", "another tenant's events must be untouched — this is the isolation rule, in the erasure path");
});

// ---------------------------------------------------------------------------
// The end-to-end behaviour, in memory.
// ---------------------------------------------------------------------------

test("a preview changes nothing and reports what an erasure would do", async () => {
  const brand = `t-prev-${Math.random().toString(36).slice(2, 8)}`;
  const contacts = await import("../src/backend/contacts.ts");
  await contacts.saveContacts(brand, [{ name: "Ada Lovelace", email: "ada@preview.test" }], new Date().toISOString());

  const preview = await privacy.eraseBrandData(brand, { dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.ok(preview.documentsErased >= 1, "the preview must count what would go");
  assert.equal((await contacts.listContacts(brand)).length, 1, "a preview must not delete");

  const receipt = await privacy.eraseBrandData(brand);
  assert.equal(receipt.dryRun, false);
  assert.equal((await contacts.listContacts(brand)).length, 0, "the erasure must actually delete");
  assert.ok(receipt.stores.some((s) => s.action === "retained"), "the receipt must name what it kept");
  assert.ok(receipt.notReachable.length > 20, "the receipt must name what it could not reach");
  assert.ok(receipt.statement.join(" ").length > 200, "the receipt must explain itself in words");
});

test("the export reports stores it could not read instead of calling them empty", async () => {
  const brand = `t-exp-${Math.random().toString(36).slice(2, 8)}`;
  const out = await privacy.exportBrandData(brand);
  assert.equal(out.persistence, "memory", "no Firebase credentials in the test environment");
  const unread = out.stores.filter((s) => s.note);
  assert.ok(unread.length > 0, "in demo mode most stores have nowhere to read from, and must say so");
  for (const s of unread) assert.ok(s.note.length > 30, `${s.collection}: a note must explain, not label`);
  // A store with a reader was READ, so it must not carry a note.
  const contacts = out.stores.find((s) => s.collection === "contacts");
  assert.equal(contacts.note, undefined, "contacts has an in-memory reader and must be read, not skipped");
  assert.equal(contacts.count, 0, "a fresh brand holds nothing");
});

test("after an erasure, nothing the export can still see was reported as erased", async () => {
  // THE GENERAL INVARIANT, and it is here because the first version of
  // privacy.ts failed it. With no database configured the erasure swept
  // Firestore, removed nothing, and reported `erased, 0 documents` — while a
  // revenue event the export could still read sat untouched in the process. Zero
  // was a true count of what a Firestore sweep deleted and a false account of
  // what happened to the data.
  //
  // So this asserts the only thing a receipt must never do: claim a store was
  // erased while the export can still read rows from it. Retained,
  // anonymised and skipped-with-a-reason are all honest; "erased" is not.
  const brand = `t-agree-${Math.random().toString(36).slice(2, 8)}`;
  const at = new Date().toISOString();

  const contacts = await import("../src/backend/contacts.ts");
  const ledger = await import("../src/backend/ledger.ts");
  const inbound = await import("../src/backend/inbound.ts");
  const landing = await import("../src/backend/landing-store.ts");

  await contacts.saveContacts(brand, [{ name: "Ada Lovelace", email: "ada@agree.test" }], at);
  await ledger.recordEvent({ id: "e1", brandId: brand, type: "sale", amountGbp: 250, at });
  await inbound.saveInbound({ brandId: brand, from: "them@agree.test", to: "us@agree.test", subject: "Re: hello", text: "interested", receivedAt: at });
  await landing.savePage({ brandId: brand, brandName: "Agree Ltd", slug: "offer", publishedAt: at, live: true, headline: "x", sections: [], sub: "", cta: "", colours: [] });

  const before = await privacy.exportBrandData(brand);
  const seen = (e, c) => e.stores.find((s) => s.collection === c)?.count ?? 0;
  assert.ok(seen(before, "contacts") >= 1, "the contact must be visible before");
  assert.ok(seen(before, "results") >= 1, "the revenue event must be visible before");
  assert.ok(seen(before, "inbound_messages") >= 1, "the reply must be visible before");
  assert.ok(seen(before, "landing_pages") >= 1, "the page must be visible before");

  const receipt = await privacy.eraseBrandData(brand);
  const after = await privacy.exportBrandData(brand);

  for (const row of receipt.stores) {
    if (row.action !== "erased") continue;
    assert.equal(
      seen(after, row.collection), 0,
      `${row.collection} was reported ERASED but the export still reads ${seen(after, row.collection)} record(s) from it`,
    );
  }
  // And every skipped store must say why, so a stated limit is never mistaken
  // for a silent one.
  for (const row of receipt.stores.filter((r) => r.action === "skipped")) {
    assert.ok(row.note && row.note.length > 60, `${row.collection}: a skipped store must carry the reason`);
  }
  // The four stores with real erasers must actually be empty.
  for (const c of ["contacts", "results", "inbound_messages", "landing_pages"]) {
    assert.equal(seen(after, c), 0, `${c} must be empty after an erasure, with or without a database`);
  }
});

test("with no database, a store with no in-memory eraser is reported SKIPPED, never erased", async () => {
  // THE HALF THE AGREEMENT TEST CANNOT SEE. A store with no reader shows
  // nothing in the export whether or not it was erased, so relabelling every
  // skipped store as "erased" passed that test. This reads the receipt against
  // what the code can actually do: no database and no module eraser means
  // nothing was removed, and the receipt may not say otherwise.
  const brand = `t-label-${Math.random().toString(36).slice(2, 8)}`;
  const receipt = await privacy.eraseBrandData(brand);
  assert.equal(receipt.persistence, "memory", "this suite runs without Firebase credentials");

  let checkedSkipped = 0, checkedErased = 0;
  for (const row of receipt.stores) {
    const store = storeFor(row.collection);
    if (!store || store.retention.mode === "retain") continue;
    if (privacy.hasModuleEraser(row.collection)) {
      assert.notEqual(row.action, "skipped", `${row.collection} has an in-memory eraser and must not be skipped`);
      checkedErased++;
    } else {
      assert.equal(row.action, "skipped", `${row.collection} has no in-memory eraser and no database, so it cannot have been erased`);
      assert.ok(row.note, `${row.collection}: a skipped store must carry its reason`);
      checkedSkipped++;
    }
  }
  assert.ok(checkedErased >= 4, `expected the four stores with erasers to be acted on, saw ${checkedErased}`);
  assert.ok(checkedSkipped > 20, `expected most stores to be honestly skipped here, saw ${checkedSkipped}`);
});
