import test from "node:test";
import assert from "node:assert/strict";

// TURNING AN INVOICE INTO A PRICE.
//
// WHY THIS EXISTS. §172 made provider costs correctable from the admin screen,
// which moved the problem instead of solving it. The arithmetic is one division
// — invoice total ÷ units bought in the same month — and the owner could see
// the invoice but NOT the units. Two of the four numbers were on no screen
// anywhere.
//
// What this module does is therefore: divide, in a currency that is usually not
// ours, by a count that is sometimes measured and sometimes inferred, and hand
// the answer to the thing that decides what every customer pays. Each of those
// clauses is a way to be confidently wrong, so each has a test:
//
//   • a foreign total with no rate must be REFUSED, not read as 1:1
//   • there must be no division by a count of zero
//   • a figure the Apply button cannot store must be refused at the PREVIEW
//   • the margin floor must survive any invoice at all
//   • computing the preview must not change anybody's price
//   • a derived unit count must never be labelled as a counted one

const rec = await import("../src/backend/cost-reconciliation.ts");
const wallet = await import("../src/backend/wallet.ts");
const costs = await import("../src/backend/provider-costs.ts");

const restore = () => wallet.applyProviderCostOverrides({});

// ---------------------------------------------------------------------------
// The division
// ---------------------------------------------------------------------------

test("the division is the one on the invoice", () => {
  // A real shape: a dollar invoice, a sterling cost table, a counted call total.
  const r = rec.reconcile({ key: "llm", units: 1200, invoiceAmount: 412.8, currency: "USD", fxToGbp: 0.79 });
  assert.ok(!("error" in r), r.error);
  assert.equal(r.invoiceGbp, 412.8 * 0.79);
  // Computed from the inputs rather than read back off the result — a number
  // compared to itself proves only that it exists.
  assert.ok(Math.abs(r.costPerUnitGbp - (412.8 * 0.79) / 1200) < 1e-12);
  assert.equal(r.currency, "USD");
  assert.equal(r.units, 1200);
});

test("A FOREIGN TOTAL WITH NO RATE IS REFUSED, NOT READ AS 1:1", () => {
  // The defect this prevents is silent and large. HeyGen and every LLM provider
  // bill in dollars; our cost table is in pounds. Treating $412.80 as £412.80
  // overstates the cost by about a quarter, in a direction nobody notices,
  // and that overstatement is multiplied into every customer's price.
  const r = rec.reconcile({ key: "llm", units: 1200, invoiceAmount: 412.8, currency: "USD" });
  assert.ok("error" in r, "a dollar invoice with no rate must not be converted at par");
  assert.match(r.error, /USD/, "the refusal must name the currency it cannot convert");

  for (const fx of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "", "about 0.79"]) {
    const bad = rec.reconcile({ key: "llm", units: 1200, invoiceAmount: 412.8, currency: "USD", fxToGbp: fx });
    assert.ok("error" in bad, `${String(fx)} is not a usable rate`);
  }
  // A numeric STRING is coerced rather than refused, because the rate arrives
  // from a text input and "0.79" is what somebody typed, not a mistake.
  const typed = rec.reconcile({ key: "llm", units: 1200, invoiceAmount: 412.8, currency: "USD", fxToGbp: "0.79" });
  assert.ok(!("error" in typed), "a rate typed into a text box must be read as a number");
  assert.equal(typed.fxToGbp, 0.79);
});

test("a sterling invoice needs no rate, and gets one of exactly 1", () => {
  const r = rec.reconcile({ key: "llm", units: 1000, invoiceAmount: 50 });
  assert.ok(!("error" in r), r.error);
  assert.equal(r.fxToGbp, 1);
  assert.equal(r.invoiceGbp, 50);
  assert.equal(r.currency, "GBP");

  // INCLUDING WHEN THE RATE BOX IS EMPTY. Switching the currency to GBP and
  // clearing the rate is the obvious thing to do with a sterling invoice, and
  // "an invoice in GBP needs the rate you are converting at" is a refusal with
  // no sensible answer.
  for (const fx of ["", undefined, 0, Number.NaN]) {
    const blank = rec.reconcile({ key: "llm", units: 1000, invoiceAmount: 50, currency: "gbp", fxToGbp: fx });
    assert.ok(!("error" in blank), `GBP with a rate of ${String(fx)} must still convert at 1`);
    assert.equal(blank.fxToGbp, 1);
    assert.equal(blank.currency, "GBP", "the currency is normalised, so the case typed does not matter");
  }
});

test("THERE IS NO DIVISION BY A COUNT OF ZERO", () => {
  // £412 ÷ 0 units is Infinity, which re-derives a price nobody can pay and
  // would be typed in by somebody who picked a month the platform was idle in.
  for (const units of [0, -5, Number.NaN, undefined, null, "1200"]) {
    const r = rec.reconcile({ key: "llm", units, invoiceAmount: 412.8 });
    if (units === "1200") {
      assert.ok(!("error" in r), "a numeric string is coerced, not refused — it comes off a text input");
      continue;
    }
    assert.ok("error" in r, `${String(units)} units must be refused`);
    assert.match(r.error, /units|month/i);
  }
});

test("a line the platform does not have cannot be reconciled into existence", () => {
  const r = rec.reconcile({ key: "not_a_real_action", units: 10, invoiceAmount: 10 });
  assert.ok("error" in r);
  // And neither can a blank one.
  assert.ok("error" in rec.reconcile({ key: "", units: 10, invoiceAmount: 10 }));
});

test("a zero invoice is a legitimate answer, not an error", () => {
  // A month inside a provider's free tier really did cost nothing, and the
  // price floor is what keeps that safe — see the floor test below.
  const r = rec.reconcile({ key: "llm", units: 1000, invoiceAmount: 0 });
  assert.ok(!("error" in r), r.error);
  assert.equal(r.costPerUnitGbp, 0);
  assert.ok(r.newPriceAcu >= 1, "a free month must still produce a chargeable price");
});

// ---------------------------------------------------------------------------
// The two boundaries this codebase keeps breaking
// ---------------------------------------------------------------------------

test("A FIGURE THE APPLY BUTTON CANNOT STORE IS REFUSED AT THE PREVIEW", async () => {
  // The recurring defect in this repository is a value on one side of a
  // boundary that never reaches the other. `setProviderCost` refuses anything
  // over MAX_COST_GBP per unit; a preview that shows £500/unit beside an Apply
  // button is that defect with money attached.
  const over = rec.reconcile({ key: "llm", units: 1, invoiceAmount: costs.MAX_COST_GBP + 1 });
  assert.ok("error" in over, "a per-unit cost over the ceiling must be refused before it is offered");
  assert.match(over.error, /unit count|ceiling/i, "and the refusal must name the likely cause");

  // THE SAME NUMBER, DRIVEN AGAINST THE REAL APPLIER. This is the half that
  // makes the test above mean something: the ceiling the preview enforces is
  // the applier's ceiling, not a second constant that can drift away from it.
  const refused = await costs.setProviderCost("llm", costs.MAX_COST_GBP + 1, "test");
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 400, "the applier must refuse it on the cost, not on the database");

  const under = await costs.setProviderCost("llm", costs.MAX_COST_GBP - 1, "test");
  assert.equal(under.ok, false);
  assert.equal(under.status, 503, "just under the ceiling the applier gets as far as the database — so the ceilings agree");

  // And just under it, the preview goes through.
  const ok = rec.reconcile({ key: "llm", units: 1, invoiceAmount: costs.MAX_COST_GBP - 1 });
  assert.ok(!("error" in ok), "just under the ceiling must still preview");
});

test("THE MARGIN FLOOR SURVIVES ANY INVOICE", () => {
  try {
    // The whole risk of this feature: a number typed off a PDF decides what
    // every customer pays. Whatever the invoice says, the price must clear the
    // owner's floor — at least 4x the provider bill, and never free.
    for (const amount of [0, 0.01, 1, 12.5, 412.8, 5000]) {
      for (const units of [1, 37, 1200, 98_000]) {
        const r = rec.reconcile({ key: "llm", units, invoiceAmount: amount });
        if ("error" in r) continue; // the ceiling case, already covered
        assert.ok(
          r.newPriceAcu / 100 >= r.costPerUnitGbp * 4 - 1e-9,
          `£${amount}/${units}: ${r.newPriceAcu} ACUs is under 4x £${r.costPerUnitGbp}`,
        );
        assert.ok(r.newPriceAcu >= 1, `£${amount}/${units}: produced a price of ${r.newPriceAcu}`);
      }
    }
  } finally { restore(); }
});

test("COMPUTING A PREVIEW DOES NOT CHANGE ANYBODY'S PRICE", () => {
  try {
    // An earlier version of this computed the hypothetical by writing the new
    // cost into the live price table and reading the answer back out. Every
    // customer in flight was briefly priced off a number an admin was still
    // thinking about.
    const before = { ...wallet.ACTION_COST_ACU };
    const beforeCosts = { ...wallet.providerCostGbp() };
    for (let i = 0; i < 5; i++) rec.reconcile({ key: "llm", units: 1200, invoiceAmount: 1 + i });
    assert.deepEqual({ ...wallet.ACTION_COST_ACU }, before, "the live price table must be untouched");
    assert.deepEqual({ ...wallet.providerCostGbp() }, beforeCosts, "and so must the cost table");
  } finally { restore(); }
});

test("the direction is measured against what we charge now", () => {
  try {
    wallet.applyProviderCostOverrides({ llm: 0.01 });
    const current = wallet.ACTION_COST_ACU.llm;

    const cheaper = rec.reconcile({ key: "llm", units: 1_000_000, invoiceAmount: 1 });
    assert.ok(!("error" in cheaper));
    assert.equal(cheaper.currentPriceAcu, current, "the comparison must use the live price, not a recomputed guess");
    assert.ok(cheaper.newPriceAcu <= current);
    assert.ok(["cheaper", "same"].includes(cheaper.direction));

    const dearer = rec.reconcile({ key: "llm", units: 10, invoiceAmount: 40 });
    assert.ok(!("error" in dearer));
    assert.equal(dearer.direction, "dearer");
    assert.ok(dearer.newPriceAcu > current);
    // A RISE SAYS IT IS A RISE, in the sentence a person reads before pressing.
    assert.match(dearer.verdict, /RAISES|dearer/, dearer.verdict);
  } finally { restore(); }
});

test("the verdict never claims a move the numbers do not show", () => {
  try {
    wallet.applyProviderCostOverrides({ llm: 0 });
    // At a provider cost of zero the floor, not the markup, sets the price —
    // so a tiny invoice cannot move it, and the sentence must say so rather
    // than promising a saving that will not arrive.
    const r = rec.reconcile({ key: "llm", units: 1_000_000, invoiceAmount: 0.01 });
    assert.ok(!("error" in r));
    if (r.newPriceAcu === r.currentPriceAcu) {
      assert.equal(r.direction, "same");
      assert.match(r.verdict, /does not move/i, r.verdict);
      assert.equal(r.changePct, 0);
    }
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// The denominator
// ---------------------------------------------------------------------------

test("A DERIVED UNIT COUNT IS NEVER LABELLED AS A COUNTED ONE", () => {
  // The quiet way this feature produces a wrong price: `search` units are not
  // measured anywhere. They are inferred from ACUs charged ÷ the current price,
  // which is exact only while the price has not moved. A figure that looks
  // measured and is actually inferred is how a confident wrong number gets
  // typed in, so the label and the caveat are part of the contract.
  const lines = rec.unitLinesFrom({
    calls: 4200,
    avatarMinutes: 31.5,
    translateMinutes: 6,
    byKind: { search: wallet.ACTION_COST_ACU.search * 50, post: 0 },
  });
  const by = (k) => lines.find((l) => l.key === k);

  assert.equal(by("llm").source, "counted");
  assert.equal(by("llm").units, 4200);
  assert.equal(by("avatar").source, "counted");
  assert.equal(by("avatar").units, 31.5);
  assert.equal(by("avatar_translate").source, "counted");

  const search = by("search");
  assert.equal(search.source, "derived", "an inferred count must be labelled derived");
  assert.equal(search.units, 50, "and the inference must be ACUs ÷ price");
  assert.ok(search.caveat && /DERIVED/.test(search.caveat), "a derived line must carry its caveat");

  // A line with nothing charged is neither counted nor derived — it is nothing,
  // and a zero presented as a count invites a division by it. It must not claim
  // a figure was inferred either: "inferred from 0 ACUs, divided by its price"
  // beside a zero reads as a measurement, which is the mislabelling this whole
  // split exists to prevent.
  assert.equal(by("post").source, "none");
  assert.equal(by("post").units, 0);
  assert.doesNotMatch(by("post").how, /Inferred/, `a line nobody used must not claim an inference: ${by("post").how}`);
  assert.match(by("post").how, /nothing to divide/i);
  assert.equal(by("post").caveat, undefined, "and must not carry the derived caveat");

  // No counted line may carry the derived caveat, and no derived line may be
  // missing it. This is the pair that keeps the two kinds apart.
  for (const l of lines) {
    if (l.source === "counted") assert.ok(!/DERIVED/.test(l.caveat || ""), `${l.key} is counted but warns of inference`);
    if (l.source === "derived") assert.ok(/DERIVED/.test(l.caveat || ""), `${l.key} is derived with no caveat`);
    assert.ok(l.unit && l.unit.length > 2, `${l.key} must say what a unit is`);
    assert.ok(l.how && l.how.length > 20, `${l.key} must say where its number came from`);
  }
});

test("every cost line the admin screen can correct has a unit count beside it", () => {
  // The screen offers a correction for every line in the cost table. A line with
  // no unit row is a correction with no denominator, which is an invitation to
  // guess one.
  const lines = rec.unitLinesFrom({ calls: 0, avatarMinutes: 0, translateMinutes: 0, byKind: {} });
  const keys = new Set(lines.map((l) => l.key));
  for (const key of Object.keys(wallet.providerCostGbp())) {
    assert.ok(keys.has(key), `${key} is correctable but has no unit count`);
  }
  assert.equal(lines.length, keys.size, "and no line appears twice");
});

test("a derived count follows the price it was divided by", () => {
  try {
    // 100 ACUs of search at a price of 10 is 10 searches; at a price of 5 it is
    // 20. The inference has to track the live price, or the denominator silently
    // belongs to a price that no longer exists.
    const acus = 100;
    const first = wallet.ACTION_COST_ACU.search;
    const before = rec.unitLinesFrom({ calls: 0, avatarMinutes: 0, translateMinutes: 0, byKind: { search: acus } });
    assert.equal(before.find((l) => l.key === "search").units, Math.round((acus / first) * 100) / 100);

    wallet.applyProviderCostOverrides({ search: wallet.providerCostGbp().search * 4 });
    const second = wallet.ACTION_COST_ACU.search;
    assert.notEqual(second, first, "this test needs the price to actually move");
    const after = rec.unitLinesFrom({ calls: 0, avatarMinutes: 0, translateMinutes: 0, byKind: { search: acus } });
    assert.equal(after.find((l) => l.key === "search").units, Math.round((acus / second) * 100) / 100);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// The months
// ---------------------------------------------------------------------------

test("the months offered are this one and the eleven before it, newest first", () => {
  const m = rec.recentMonths(new Date("2026-10-30T00:00:00Z"));
  assert.equal(m.length, 12);
  assert.equal(m[0], "2026-10", "this month must be first — it is the one an invoice usually covers");
  assert.equal(m[11], "2025-11");
  assert.equal(new Set(m).size, 12, "a month must not appear twice");
  for (const s of m) assert.match(s, /^\d{4}-\d{2}$/);

  // JANUARY, which is where a month list written with subtraction goes wrong.
  const jan = rec.recentMonths(new Date("2026-01-15T00:00:00Z"));
  assert.equal(jan[0], "2026-01");
  assert.equal(jan[1], "2025-12");
  assert.equal(jan[11], "2025-02");

  // AND THE 31st, where setting the month on a date that is already the 31st
  // skips a month entirely (31 March minus one month is 31 February).
  const end = rec.recentMonths(new Date("2026-03-31T23:00:00Z"));
  assert.equal(end[0], "2026-03");
  assert.equal(end[1], "2026-02", "the 31st must not skip February");
});

test("a month that is not a month is refused, and nothing is invented", async () => {
  for (const bad of ["", "2026", "2026-13", "nonsense", "26-10"]) {
    const r = await rec.unitsForMonth(bad);
    assert.deepEqual(r.lines, [], `${bad} must produce no unit counts`);
    assert.equal(r.measured, null);
    assert.ok(r.note.length > 10, "and must say why");
  }
});

test("with no database it says there is nothing to count, rather than counting zero", async () => {
  // Demo mode. The honest answer is that the ledgers do not exist, NOT that the
  // platform bought nothing — a reported zero would be divided by.
  const r = await rec.unitsForMonth("2026-10");
  assert.deepEqual(r.lines, []);
  assert.equal(r.measured, null);
  assert.match(r.note, /database|Firebase/i, r.note);
  assert.equal(r.walletsCapped, false);
});
