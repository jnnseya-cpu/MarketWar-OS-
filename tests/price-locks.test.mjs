import test from "node:test";
import assert from "node:assert/strict";

// A CUT REACHES YOU TODAY. A RISE WAITS FOR YOUR NEXT BILL.
//
// WHAT THIS REPLACES. The reconciliation screen has printed this warning since
// §173 shipped: *"A rise reaches everyone immediately, including customers
// part-way through a month who budgeted on the old price."* Printing a warning
// is not preventing the thing it warns about. A customer on a £49 plan who
// planned their month around 980 ACUs at 5 ACUs a call does not care that our
// supplier moved on the 14th — from where they sit, what they bought got 40%
// smaller with no notice.
//
// So every branch below decides what a real customer is charged, which is why
// the rule is a pure function and every branch is reachable without a database,
// a clock or an admin session.
//
// THE ONE PLACE IT BENDS, and it has to: the owner's law is that margin on an
// AI action is never below 100% — price at least 2x provider cost. If a
// supplier triples its rate, honouring the old price is not a thinner margin,
// it is a LOSS on every call for up to a month across every customer at once.
// A deferral therefore survives only while the old price still clears the hard
// floor.

const locks = await import("../src/backend/price-locks.ts");
const sub = await import("../src/backend/subscription.ts");

const NOW = "2026-10-30T12:00:00.000Z";
const RISE_AT = "2026-10-20T09:00:00.000Z";

/** A customer mid-cycle, who paid before the correction. */
const paidBefore = { cycle: "monthly", planId: "growth", subscriptionCreditedAt: "2026-10-05T09:00:00.000Z" };
const rise = { kind: "llm", fromAcu: 5, toAcu: 8, at: RISE_AT, by: "admin" };

test("A RISE DOES NOT REACH A CYCLE THAT WAS ALREADY PAID FOR", () => {
  const r = locks.lockedPriceAcu({
    currentAcu: 8, providerCostGbp: 0.02, rise, wallet: paidBefore, nowISO: NOW,
  });
  assert.equal(r.acu, 5, "the customer keeps the price their allowance was bought at");
  assert.equal(r.deferred, true);
  assert.match(r.why, /renewal/i, r.why);
  // And the sentence names the date, because "your price is different" with no
  // reason is worse than no explanation at all.
  assert.match(r.why, /2026-10-20/);
});

test("A CUT REACHES EVERYBODY AT ONCE — there is nothing to defer", () => {
  // Only rises are recorded. With no record the list price is the price, which
  // is exactly what makes a cut immediate: applying one writes nothing.
  const r = locks.lockedPriceAcu({ currentAcu: 2, providerCostGbp: 0.003, rise: null, wallet: paidBefore, nowISO: NOW });
  assert.equal(r.acu, 2);
  assert.equal(r.deferred, false);

  // A record that is not a rise is not honoured either, whatever it claims.
  for (const bogus of [
    { kind: "llm", fromAcu: 8, toAcu: 5, at: RISE_AT, by: "x" },
    { kind: "llm", fromAcu: 5, toAcu: 5, at: RISE_AT, by: "x" },
  ]) {
    const got = locks.lockedPriceAcu({ currentAcu: 2, providerCostGbp: 0.003, rise: bogus, wallet: paidBefore, nowISO: NOW });
    assert.equal(got.acu, 2, "a 'rise' that is not a rise must not lower anybody's charge");
    assert.equal(got.deferred, false);
  }
});

test("THE 2x FLOOR OUTRANKS THE DEFERRAL — a supplier that triples its rate is not absorbed", () => {
  // 5 ACUs is £0.05. At a provider cost of £0.03 the old price is 1.67x, below
  // the floor: honouring it would lose money on every call for up to a month.
  const r = locks.lockedPriceAcu({
    currentAcu: 12, providerCostGbp: 0.03, rise: { ...rise, toAcu: 12 }, wallet: paidBefore, nowISO: NOW,
  });
  assert.equal(r.acu, 12, "the new price applies immediately when the old one breaches the floor");
  assert.equal(r.deferred, false);
  assert.equal(r.refusedDeferral, "floor");
  assert.match(r.why, /floor/i, r.why);

  // The boundary itself, computed from the law rather than typed in: at exactly
  // 2x the old price the deferral is still allowed.
  const exactlyFloor = 5 / sub.ACU_PER_GBP / sub.MARKUP_FLOOR; // £0.025
  const at = locks.lockedPriceAcu({
    currentAcu: 12, providerCostGbp: exactlyFloor, rise: { ...rise, toAcu: 12 }, wallet: paidBefore, nowISO: NOW,
  });
  assert.equal(at.acu, 5, `at exactly ${sub.MARKUP_FLOOR}x the old price the deferral must hold`);
  assert.equal(at.deferred, true);

  // A hair above it, and it does not.
  const over = locks.lockedPriceAcu({
    currentAcu: 12, providerCostGbp: exactlyFloor * 1.001, rise: { ...rise, toAcu: 12 }, wallet: paidBefore, nowISO: NOW,
  });
  assert.equal(over.deferred, false);
  assert.equal(over.refusedDeferral, "floor");
});

test("a customer who paid AFTER the correction is on the new price, and is not told otherwise", () => {
  const r = locks.lockedPriceAcu({
    currentAcu: 8, providerCostGbp: 0.02, rise,
    wallet: { cycle: "monthly", planId: "growth", subscriptionCreditedAt: "2026-10-25T09:00:00.000Z" },
    nowISO: NOW,
  });
  assert.equal(r.acu, 8);
  assert.equal(r.deferred, false);
  assert.equal(r.refusedDeferral, "paid_after");
});

test("A TOP-UP CUSTOMER WITH NO PLAN GETS THE CURRENT PRICE, and the reason is stated", () => {
  // A deferral protects an ALLOWANCE bought at a price. A top-up buys ACUs, not
  // a fixed basket of actions, so there is nothing to grandfather — and saying
  // that is better than a rule nobody can predict.
  for (const wallet of [
    null,
    { cycle: null, planId: "free" },
    { cycle: "monthly", planId: "free", subscriptionCreditedAt: "2026-10-01T00:00:00.000Z" },
    { cycle: null, planId: "growth", subscriptionCreditedAt: "2026-10-01T00:00:00.000Z" },
  ]) {
    const r = locks.lockedPriceAcu({ currentAcu: 8, providerCostGbp: 0.02, rise, wallet, nowISO: NOW });
    assert.equal(r.acu, 8, `${JSON.stringify(wallet)} must pay the current price`);
    assert.equal(r.refusedDeferral, "no_subscription");
  }
});

test("A WALLET WRITTEN BEFORE THE ANCHOR EXISTED IS PROTECTED, not punished", () => {
  // `subscriptionCreditedAt` is new. Absent must read as "paid before the rise",
  // because the alternative is that every existing paying customer loses the
  // protection the moment a field is added to a document.
  const r = locks.lockedPriceAcu({
    currentAcu: 8, providerCostGbp: 0.02, rise,
    wallet: { cycle: "monthly", planId: "growth" },
    nowISO: NOW,
  });
  assert.equal(r.acu, 5, "an existing customer must not lose protection because a field was added");
  assert.equal(r.deferred, true);
});

test("A DEFERRAL EXPIRES ON ITS OWN, so a lapsed customer cannot hold the old price for ever", () => {
  // Nobody renews, so no next payment ever closes the deferral. The cap is what
  // stops it being eternal, and it differs by cycle because an annual plan was
  // paid for up front — the whole year was bought at the old price.
  const monthlyLate = locks.lockedPriceAcu({
    currentAcu: 8, providerCostGbp: 0.02, rise,
    wallet: { cycle: "monthly", planId: "growth", subscriptionCreditedAt: "2026-10-05T00:00:00.000Z" },
    nowISO: "2026-12-30T00:00:00.000Z", // 71 days after the rise
  });
  assert.equal(monthlyLate.acu, 8);
  assert.equal(monthlyLate.refusedDeferral, "expired");
  assert.match(monthlyLate.why, /ran out/i);

  // The same wallet on an annual cycle is still inside its window.
  const annual = locks.lockedPriceAcu({
    currentAcu: 8, providerCostGbp: 0.02, rise,
    wallet: { cycle: "annual", planId: "growth", subscriptionCreditedAt: "2026-10-05T00:00:00.000Z" },
    nowISO: "2026-12-30T00:00:00.000Z",
  });
  assert.equal(annual.acu, 5, "an annual customer paid for the year at the old price");
  assert.equal(annual.deferred, true);

  // And an annual deferral does not last for ever either.
  const annualLate = locks.lockedPriceAcu({
    currentAcu: 8, providerCostGbp: 0.02, rise,
    wallet: { cycle: "annual", planId: "growth", subscriptionCreditedAt: "2026-10-05T00:00:00.000Z" },
    nowISO: "2028-10-30T00:00:00.000Z",
  });
  assert.equal(annualLate.refusedDeferral, "expired");
});

test("a recorded rise the live price has moved past is not honoured", () => {
  // The price was corrected up to 8, then corrected again to 11 by a different
  // route — or the whole line was reset. The stored record describes a journey
  // that no longer ends where the table is, so the table wins.
  const r = locks.lockedPriceAcu({ currentAcu: 11, providerCostGbp: 0.02, rise, wallet: paidBefore, nowISO: NOW });
  assert.equal(r.acu, 11);
  assert.equal(r.deferred, false);
  assert.match(r.why, /moved again/i);
});

test("an unreadable date never produces a free or absurd charge", () => {
  for (const [at, now] of [["not-a-date", NOW], [RISE_AT, "nonsense"], ["", ""]]) {
    const r = locks.lockedPriceAcu({
      currentAcu: 8, providerCostGbp: 0.02, rise: { ...rise, at }, wallet: paidBefore, nowISO: now,
    });
    assert.equal(r.acu, 8, "a date that cannot be read falls back to the price everybody else pays");
    assert.equal(r.deferred, false);
  }
});

test("the price charged is always a whole number of ACUs, and never negative", () => {
  const r = locks.lockedPriceAcu({
    currentAcu: 8.7, providerCostGbp: 0.02, rise: { ...rise, fromAcu: 5.4, toAcu: 8.7 }, wallet: paidBefore, nowISO: NOW,
  });
  assert.ok(Number.isInteger(r.acu), `${r.acu} is not a whole number of ACUs`);
  assert.ok(r.acu >= 0);

  const negative = locks.lockedPriceAcu({
    currentAcu: -4, providerCostGbp: 0, rise: null, wallet: paidBefore, nowISO: NOW,
  });
  assert.equal(negative.acu, 0, "a negative price must never be charged, or it would credit the wallet");
});

// ---------------------------------------------------------------------------
// The record, and the door that reads it
// ---------------------------------------------------------------------------

const wallet = await import("../src/backend/wallet.ts");

test("ONLY A RISE IS RECORDED, AND A CUT CANCELS ONE", async () => {
  // This asymmetry IS the feature. A rise leaves a record so the customers who
  // already paid can be held at the old price; a cut leaves none, which is what
  // makes a cut immediate for everybody with no code to special-case it.
  assert.equal(await locks.notePriceChange("llm", 5, 8, "test"), "deferred");
  assert.equal(locks.riseFor("llm")?.fromAcu, 5);
  assert.equal(locks.riseFor("llm")?.toAcu, 8);
  assert.equal(locks.risesInEffect().length, 1);

  // A CUT ON THE SAME LINE MUST CLEAR IT. Otherwise the wallets being held at
  // the old price would be held ABOVE the price everybody else now pays —
  // a protection that turned into a penalty.
  assert.equal(await locks.notePriceChange("llm", 8, 3, "test"), "cleared");
  assert.equal(locks.riseFor("llm"), null);
  assert.deepEqual(locks.risesInEffect(), []);

  // And a cut where nothing was deferred is simply immediate.
  assert.equal(await locks.notePriceChange("llm", 8, 3, "test"), "immediate");
});

test("THE DOOR CHARGES THE WALLET'S OWN PRICE, not the list price", async () => {
  try {
    const list = wallet.ACTION_COST_ACU.llm;
    assert.equal(await locks.notePriceChange("llm", Math.max(1, list - 2), list, "test"), "deferred");

    const held = await wallet.unitPriceAcu("llm", { cycle: "monthly", planId: "growth", subscriptionCreditedAt: "2020-01-01T00:00:00.000Z" });
    assert.equal(held.acu, Math.max(1, list - 2), "a wallet that paid before the rise is charged the old price");
    assert.equal(held.deferred, true);

    const fresh = await wallet.unitPriceAcu("llm", { cycle: "monthly", planId: "growth", subscriptionCreditedAt: new Date().toISOString() });
    assert.equal(fresh.acu, list, "a wallet that paid after it is charged the new one");
    assert.equal(fresh.deferred, false);

    // No wallet at all — an engine asking for the list price must get it rather
    // than accidentally inheriting somebody's deferral.
    const anonymous = await wallet.unitPriceAcu("llm", null);
    assert.equal(anonymous.acu, list);
  } finally {
    await locks.notePriceChange("llm", 999, 1, "test");
  }
});

test("THE CHECK AND THE CHARGE READ THE SAME PRICE", async () => {
  // The recurring defect in this codebase is a value that exists on one side of
  // a boundary and never gets carried across. Here that would mean a door
  // checking the list price and a charge taking the locked one: the check
  // refuses work the customer could afford, or passes work they cannot pay for.
  //
  // `canAffordAction` and `meterAction` are the two doors. Both must size the
  // charge from `unitPriceAcu`, and this reads the source to prove it, because
  // the branch itself is unreachable without an enforced account: with no
  // Firebase every caller is metering-exempt and nothing is charged at all.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/backend/wallet.ts", import.meta.url), "utf8");

  for (const [fn, assigns] of [["canAffordAction", "needed"], ["meterAction", "cost"]]) {
    const start = src.indexOf(`export async function ${fn}(`);
    assert.ok(start > 0, `${fn} not found`);
    const body = src.slice(start, src.indexOf("\nexport ", start + 10));
    assert.match(body, /await unitPriceAcu\(/, `${fn} must ask for the wallet's own price`);
    // THE ONE LINE THAT DECIDES THE MONEY. Whatever else the function computes,
    // the value it then checks or debits must come from the resolver — and this
    // reads that exact assignment rather than scanning the whole body, because
    // a guard that accepts "unitPriceAcu appears somewhere above" let a mutant
    // through once already.
    const m = body.match(new RegExp(`const ${assigns} = ([^;]+);`));
    assert.ok(m, `${fn} must assign ${assigns} once, plainly`);
    assert.match(m[1], /unit\.acu/, `${fn} sizes ${assigns} from ${m[1].trim()} instead of the wallet's own price`);
    assert.doesNotMatch(m[1], /ACTION_COST_ACU/, `${fn} sizes ${assigns} straight from the list price`);
  }

  // And both go through the same converter, so "price x units" cannot drift
  // into two different roundings.
  assert.match(src, /export function chargeFor\(/);
  assert.equal(wallet.chargeFor(5, 3), 15);
  assert.equal(wallet.chargeFor(5, 0), 5, "a unitless action still costs one unit");
  assert.equal(wallet.chargeFor(-5, 3), 0, "a negative price can never credit a wallet");
  // FRACTIONAL UNITS ARE REAL: presenter video is charged per MINUTE and a
  // ninety-second render is 1.5 of them. Rounding down there would hand out a
  // silent discount on every part-minute, so a half rounds up.
  assert.equal(wallet.chargeFor(5, 1.5), 8, "a half unit must not round down into a discount");
  assert.equal(wallet.chargeFor(180, 1.5), 270);
});

test("with no store configured nothing is deferred by default, and nothing throws", async () => {
  await locks.ensurePriceRises();
  assert.equal(locks.riseFor("avatar"), null);
  const timing = await locks.notePriceChange("avatar", 180, 100, "test");
  assert.ok(["immediate", "cleared"].includes(timing), timing);
});
