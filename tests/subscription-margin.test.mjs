import test from "node:test";
import assert from "node:assert/strict";

// THE TWO BUCKETS A CUSTOMER PAYS FROM, AND WHY THE MARGIN CANNOT MOVE.
//
// THE OWNER'S STATEMENT, which this file turns into a gate: *"People will have
// their subscription and top up if required and our margins remain unchanged."*
//
// That is three claims, and the third is the one worth proving, because §173
// made every provider cost CORRECTABLE FROM A TEXT FIELD. If a corrected
// invoice could move the margin on a subscription, then a mis-typed invoice
// could sell the platform at a loss, quietly, for every customer at once.
//
// It cannot, and the reason is arithmetic rather than vigilance:
//
//   • A plan's allowance is ACU_ALLOCATION_RATE (20%) of the price paid.
//   • Every action is priced at AT LEAST STANDARD_MARKUP (4×) of what the
//     provider charges — so one ACU can never buy more than 1/4 of its own
//     face value in provider cost.
//
// 20% × 25% = 5%. The worst a fully-consumed allowance can cost us is five
// pence in the pound of subscription revenue, on every plan, at every provider
// cost, forever. A reconciliation changes what an ACU BUYS. It cannot change
// what an ACU EARNS.
//
// WHAT THIS FILE DOES NOT CLAIM. The 95% is on AI delivery. Storage retained
// for years, and compute on the routes that do not meter, are subscription-level
// costs that no ACU funds — see the note at the end.

const sub = await import("../src/backend/subscription.ts");
const wallet = await import("../src/backend/wallet.ts");

const restore = () => wallet.applyProviderCostOverrides({});

/**
 * The dearest ACU in the platform: the action where one charged ACU buys the
 * most provider spend. Computed, never assumed — the whole point is that the
 * bound holds whichever line happens to be worst.
 */
function worstProviderCostPerAcu() {
  let worst = { key: "", perAcu: 0, acu: 0, cost: 0 };
  for (const [key, cost] of Object.entries(wallet.providerCostGbp())) {
    const acu = wallet.ACTION_COST_ACU[key];
    if (!acu) continue;
    const perAcu = cost / acu;
    if (perAcu > worst.perAcu) worst = { key, perAcu, acu, cost };
  }
  return worst;
}

test("ONE ACU CAN NEVER BUY MORE THAN A QUARTER OF ITS FACE VALUE IN PROVIDER COST", () => {
  try {
    const ceiling = 1 / sub.STANDARD_MARKUP / sub.ACU_PER_GBP; // £ per ACU
    for (const line of Object.keys(wallet.providerCostGbp())) {
      const acu = wallet.ACTION_COST_ACU[line];
      const cost = wallet.providerCostGbp()[line];
      assert.ok(
        cost / acu <= ceiling + 1e-12,
        `${line}: £${cost} over ${acu} ACU is £${(cost / acu).toFixed(6)} per ACU, above the £${ceiling} ceiling the 4× markup implies`,
      );
    }
  } finally { restore(); }
});

test("A FULLY-CONSUMED ALLOWANCE COSTS AT MOST 5p IN THE POUND — ON EVERY PLAN", () => {
  try {
    const worst = worstProviderCostPerAcu();
    // Derived from the two rates, not typed in, so a change to either rate
    // changes the expectation rather than breaking a hardcoded 5%.
    const expected = sub.ACU_ALLOCATION_RATE / sub.STANDARD_MARKUP;

    for (const plan of sub.allPlanEconomics()) {
      if (plan.monthlyGbp <= 0) continue;
      const worstSpend = plan.monthlyAcus * worst.perAcu;
      const share = worstSpend / plan.monthlyGbp;
      assert.ok(
        share <= expected + 1e-6,
        `${plan.id}: spending all ${plan.monthlyAcus} ACUs on ${worst.key} costs £${worstSpend.toFixed(2)} of £${plan.monthlyGbp} — ${(share * 100).toFixed(2)}%, over the ${(expected * 100).toFixed(0)}% the rates allow`,
      );
      // And the margin that leaves, stated as the number it is.
      const grossPct = ((plan.monthlyGbp - worstSpend) / plan.monthlyGbp) * 100;
      assert.ok(grossPct >= 95 - 1e-6, `${plan.id}: ${grossPct.toFixed(2)}% gross in the worst month`);
    }
  } finally { restore(); }
});

test("AND A CORRECTED INVOICE CANNOT MOVE IT — cheaper OR dearer", () => {
  try {
    const baseline = sub.allPlanEconomics()
      .filter((p) => p.monthlyGbp > 0)
      .map((p) => ({ id: p.id, share: (p.monthlyAcus * worstProviderCostPerAcu().perAcu) / p.monthlyGbp }));

    // Every line reconciled at once, across four orders of magnitude: a month
    // inside a free tier, a plausible invoice, the estimates, and a provider
    // that quadrupled its prices overnight.
    for (const factor of [0, 0.01, 0.25, 1, 4]) {
      const overrides = {};
      for (const [k, c] of Object.entries(wallet.providerCostGbp())) overrides[k] = c * factor;
      wallet.applyProviderCostOverrides(overrides);

      const worst = worstProviderCostPerAcu();
      for (const plan of sub.allPlanEconomics()) {
        if (plan.monthlyGbp <= 0) continue;
        const share = (plan.monthlyAcus * worst.perAcu) / plan.monthlyGbp;
        const before = baseline.find((b) => b.id === plan.id).share;
        assert.ok(
          share <= before + 1e-9,
          `at ${factor}× provider cost, ${plan.id} worst-case share moved from ${(before * 100).toFixed(3)}% to ${(share * 100).toFixed(3)}%`,
        );
        assert.ok(share <= sub.ACU_ALLOCATION_RATE / sub.STANDARD_MARKUP + 1e-9);
      }
    }
  } finally { restore(); }
});

test("A TOP-UP IS SOLD AT FACE VALUE, AT EVERY TIER — a volume discount would eat the markup", () => {
  // The margin on a top-up IS the markup, so a 10% discount on a £500 top-up
  // is 10% off the only protection the platform has. Every tier must be exactly
  // £1 = 100 ACUs.
  const tiers = sub.topUps();
  assert.ok(tiers.length >= 5);
  for (const t of tiers) {
    assert.equal(t.acus, t.gbp * sub.ACU_PER_GBP, `£${t.gbp} must buy exactly ${t.gbp * sub.ACU_PER_GBP} ACUs — no bulk discount`);
  }
  // And the smallest tier is the one Stripe's fixed 20p makes safe.
  assert.equal(Math.min(...tiers.map((t) => t.gbp)), sub.MIN_TOPUP_GBP);
});

test("the smallest top-up still clears the floor once Stripe has taken its cut", () => {
  try {
    const worst = worstProviderCostPerAcu();
    const gbp = sub.MIN_TOPUP_GBP;
    // Stripe UK: 1.5% + 20p on the top-up payment. The fixed part is what makes
    // a small top-up dangerous, which is why there is a minimum at all.
    const r = sub.netContribution({
      acuRevenueGbp: gbp,
      providerCostGbp: worst.perAcu * gbp * sub.ACU_PER_GBP,
      paymentCostGbp: gbp * 0.015 + 0.2,
    });
    assert.ok(r.netContributionGbp > 0, `a £${gbp} top-up spent on ${worst.key} must not lose money: £${r.netContributionGbp}`);
    assert.notEqual(r.band, "blocked", `a £${gbp} top-up lands in the ${r.band} band: ${r.note}`);
    // Stated rather than implied: this bucket is thinner than the subscription
    // one, because subscription ACUs are sold at 5x face and top-ups at face.
    assert.ok(r.grossMarginPct < 95, "a top-up cannot be as rich as a subscription ACU — if it were, the plan allowance would be mispriced");
  } finally { restore(); }
});

test("the free plan's one-off allowance cannot cost more than loose change", () => {
  try {
    const free = sub.allPlanEconomics().find((p) => p.id === "free");
    const worst = worstProviderCostPerAcu();
    const spend = free.annualAcus * worst.perAcu;
    assert.ok(free.monthlyAcus === 0, "the free plan is a one-off grant, not a monthly allowance");
    assert.ok(spend <= 0.5, `a free account can cost at most £${spend.toFixed(2)} of provider spend, which must stay trivial`);
  } finally { restore(); }
});

test("ROLLOVER IS THE ONLY THING THAT CONCENTRATES THE SPEND, AND IT IS CAPPED", () => {
  try {
    // The 5% bound is on the allowance ISSUED, not on a calendar month. Unused
    // subscription ACUs roll over, so a customer can save up and spend several
    // months of allowance inside one — which is fine, because they paid for
    // every one of them, but the cap is what stops it being unbounded.
    const cap = sub.EXPIRY_RULES.monthly_subscription.maxBalanceMonths;
    assert.equal(typeof cap, "number");
    assert.ok(cap >= 1 && cap <= 6, `a max balance of ${cap} months is outside anything defensible`);

    const worst = worstProviderCostPerAcu();
    for (const plan of sub.allPlanEconomics()) {
      if (plan.monthlyGbp <= 0) continue;
      const worstMonth = plan.monthlyAcus * cap * worst.perAcu;
      const share = worstMonth / plan.monthlyGbp;
      assert.ok(
        share <= (sub.ACU_ALLOCATION_RATE / sub.STANDARD_MARKUP) * cap + 1e-6,
        `${plan.id}: a saved-up month could cost ${(share * 100).toFixed(1)}% of one month's price`,
      );
      // Which still leaves the subscription profitable in that single month.
      assert.ok(worstMonth < plan.monthlyGbp * 0.2, `${plan.id}: £${worstMonth.toFixed(2)} against £${plan.monthlyGbp}`);
    }
  } finally { restore(); }
});

test("WHAT NO ACU FUNDS IS WRITTEN DOWN, so the 95% is not read as the whole picture", () => {
  // Honesty gate rather than an arithmetic one. The margin above is on AI
  // DELIVERY. Two costs sit outside it and are paid out of the subscription:
  // storage a plan includes and keeps for years, and compute on routes that do
  // not meter. Both are named in the plan table and the exposure report rather
  // than being discovered later.
  const plans = sub.PLANS.filter((p) => p.monthlyGbp > 0);
  for (const p of plans) {
    assert.ok(typeof p.storageGb === "number" && p.storageGb > 0, `${p.id} must declare the storage it includes`);
  }
  // And storage beyond the plan is sold, not absorbed.
  assert.ok(Object.keys(sub.ADDONS.storageGbp).length >= 3, "extra storage must have a price");
});
