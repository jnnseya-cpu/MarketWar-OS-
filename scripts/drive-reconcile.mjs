// npm run drive:reconcile
//
// TWO INVOICES, TYPED IN.
//
// THE OWNER'S QUESTION, verbatim: *"How to [get] two invoices — HeyGen and
// whichever LLM carries the most traffic — and type them in. Every number above
// is still a guess until then, and the llm line is where the leverage is."*
//
// Every provider cost in this platform is an estimate, set deliberately high so
// the margin floor can never be breached silently, and every customer price
// stacks on it. §172 made those estimates correctable; it did not make them
// correctABLE in practice, because the arithmetic is
//
//     cost per unit = invoice total ÷ units bought in the same month
//
// and the second number was on no screen anywhere. `/api/admin/ai-spend` has
// counted the platform's provider calls since the day it was written and
// NOTHING HAS EVER CALLED IT.
//
// So this driver walks the whole correction as a person does it: read the units,
// divide the invoice, see what it does to the price, apply. It uses the real
// route handler, the real pricing law and the real refusals — nothing here is
// arithmetic written in a comment.

import fs from "node:fs";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

process.env.NODE_ENV = "test";

const { NextRequest } = await import("next/server");
const route = await import("../src/app/api/admin/costs/route.ts");
const rec = await import("../src/backend/cost-reconciliation.ts");
const wallet = await import("../src/backend/wallet.ts");
const costs = await import("../src/backend/provider-costs.ts");

const gbp = (acu) => `£${(acu / 100).toFixed(2)}`;

say("");
say("Two invoices, typed in.");
say("");

// --- 1. The door -----------------------------------------------------------
//
// This action changes what every customer is charged. The manual set was already
// gated; the reconcile action is a SECOND way in and has to be gated too — a new
// verb on an old route is exactly how an authorisation hole gets added to a
// route somebody already checked.
const posted = await route.POST(new NextRequest("https://mw.test/api/admin/costs", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "reconcile", key: "llm", units: 1000, invoiceAmount: 50, currency: "GBP", fxToGbp: 1 }),
}));
const postedBody = await posted.json();
check(
  "an unidentified caller cannot reconcile a cost, not just cannot set one",
  (posted.status === 403 || posted.status === 503) && !postedBody.preview,
  `status ${posted.status}`,
);
const previewed = await route.POST(new NextRequest("https://mw.test/api/admin/costs", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "preview", key: "llm", units: 1000, invoiceAmount: 50 }),
}));
check(
  "and cannot even PREVIEW the platform's cost base",
  previewed.status === 403 || previewed.status === 503,
  `status ${previewed.status}`,
);

// --- 2. The denominator ----------------------------------------------------
say("");
say("  WHAT THE PLATFORM BOUGHT, which is the half nobody could see:");
say("");
const month = rec.recentMonths()[0];
const units = await rec.unitsForMonth(month);
if (units.lines.length === 0) {
  say(`    ${month}: ${units.note}`);
  say("");
  check(
    "with no database it says the ledgers do not exist, rather than counting zero",
    /database|Firebase/i.test(units.note),
    "a reported zero would be divided by",
  );
} else {
  for (const l of units.lines) {
    say(`    ${l.key.padEnd(18)} ${String(l.units).padStart(10)} ${l.unit.padEnd(32)} ${l.source}`);
  }
  say("");
  check("every correctable line has a unit count", units.lines.length > 0, units.note);
}

// A counted line and a derived line, driven directly, because the labelling is
// the dangerous part: a figure that looks measured and is actually inferred is
// how a confident wrong price gets typed in.
const labelled = rec.unitLinesFrom({
  calls: 48_300, avatarMinutes: 112.5, translateMinutes: 18,
  byKind: { search: wallet.ACTION_COST_ACU.search * 640 },
});
const llmLine = labelled.find((l) => l.key === "llm");
const searchLine = labelled.find((l) => l.key === "search");
check(
  "a counted unit comes from a ledger that counted the thing itself",
  llmLine.source === "counted" && llmLine.units === 48_300,
  `${llmLine.units} ${llmLine.unit}, ${llmLine.source}`,
);
check(
  "a derived unit says it is derived AND why that matters",
  searchLine.source === "derived" && /DERIVED/.test(searchLine.caveat || ""),
  `${searchLine.units} ${searchLine.unit} inferred from ACUs charged`,
);

// --- 3. THE TWO INVOICES ---------------------------------------------------
//
// The numbers below are ILLUSTRATIVE, and labelled as such — nobody has sent us
// a bill yet. What is real is everything computed from them: the division, the
// pricing law, the floor and the verdict are the shipped ones.
say("");
say("  THE TWO INVOICES THE OWNER ASKED ABOUT (amounts illustrative, maths real):");
say("");

const invoices = [
  {
    what: "the LLM line — where the leverage is",
    key: "llm",
    // A month of real traffic on a cheap-model-first router.
    units: 48_300, amount: 182.4, currency: "USD", fx: 0.79,
    note: "48,300 provider calls in the month, billed in dollars.",
  },
  {
    what: "the presenter line — the one HeyGen undercuts",
    key: "avatar",
    units: 112.5, amount: 58.0, currency: "USD", fx: 0.79,
    note: "112.5 minutes of presenter video rendered in the month.",
  },
];

for (const inv of invoices) {
  const r = rec.reconcile({ key: inv.key, units: inv.units, invoiceAmount: inv.amount, currency: inv.currency, fxToGbp: inv.fx });
  say(`    ${inv.what}`);
  say(`      ${inv.note}`);
  if ("error" in r) {
    say(`      REFUSED: ${r.error}`);
    check(`${inv.key}: the worked example divides`, false, r.error);
    continue;
  }
  say(`      ${inv.currency} ${inv.amount} x ${inv.fx} = £${r.invoiceGbp.toFixed(2)} ÷ ${r.units} = £${r.costPerUnitGbp.toFixed(5)} per unit`);
  say(`      we assume    £${r.currentCostGbp.toFixed(5)}  →  customer pays ${r.currentPriceAcu} ACU (${gbp(r.currentPriceAcu)})`);
  say(`      the invoice  £${r.costPerUnitGbp.toFixed(5)}  →  customer pays ${r.newPriceAcu} ACU (${gbp(r.newPriceAcu)})`);
  say(`      ${r.direction.toUpperCase()}${r.direction === "same" ? "" : ` by ${Math.abs(r.changePct)}%`}`);
  say("");
  check(
    `${inv.key}: the invoice reaches the customer's price`,
    r.newPriceAcu !== r.currentPriceAcu || r.direction === "same",
    `${r.currentPriceAcu} → ${r.newPriceAcu} ACU`,
  );
  check(
    `${inv.key}: and the margin floor holds at the corrected cost`,
    r.newPriceAcu / 100 >= r.costPerUnitGbp * 4 - 1e-9 && r.newPriceAcu >= 1,
    `${gbp(r.newPriceAcu)} against a cost of £${r.costPerUnitGbp.toFixed(5)}`,
  );
}

// --- 4. The refusals a person will actually hit ----------------------------
say("  WHAT IT REFUSES, AND WHY EACH REFUSAL EARNS ITS PLACE:");
say("");
const refusals = [
  {
    label: "a dollar invoice with no rate",
    input: { key: "llm", units: 48_300, invoiceAmount: 182.4, currency: "USD" },
    why: "read at par it overstates the cost by a quarter, on every customer's price, invisibly",
  },
  {
    label: "a month the platform was idle in",
    input: { key: "llm", units: 0, invoiceAmount: 182.4 },
    why: "dividing by zero re-derives a price nobody can pay",
  },
  {
    label: "an invoice divided by one unit",
    input: { key: "llm", units: 1, invoiceAmount: 5000 },
    why: "the applier refuses anything over the ceiling, so the preview must too",
  },
  {
    label: "a line the platform does not have",
    input: { key: "gpu_hours", units: 10, invoiceAmount: 10 },
    why: "a correction cannot invent a price line",
  },
];
for (const r of refusals) {
  const out = rec.reconcile(r.input);
  check(r.label, "error" in out, "error" in out ? out.error.slice(0, 100) : "WAS ACCEPTED");
  if ("error" in out) say(`              because ${r.why}`);
}

// The ceiling is one constant, checked on both sides of the boundary — the
// recurring defect here is a value on one side that never reaches the other.
const over = await costs.setProviderCost("llm", costs.MAX_COST_GBP + 1, "drive");
const under = await costs.setProviderCost("llm", costs.MAX_COST_GBP - 1, "drive");
check(
  "the preview's ceiling IS the applier's ceiling",
  over.ok === false && over.status === 400 && under.ok === false && under.status === 503,
  `over → ${over.status} (the cost), under → ${under.status} (the database)`,
);

// --- 5. Purity -------------------------------------------------------------
const before = { ...wallet.ACTION_COST_ACU };
for (let i = 1; i <= 25; i++) rec.reconcile({ key: "llm", units: 1000 * i, invoiceAmount: i });
check(
  "asking what a price WOULD be never changes what it is",
  JSON.stringify({ ...wallet.ACTION_COST_ACU }) === JSON.stringify(before),
  "an earlier version computed the hypothetical by writing it into the live table",
);

// --- 6. WHAT A CORRECTION DOES NOT TOUCH ------------------------------------
//
// THE OWNER'S STATEMENT: *"People will have their subscription and top up if
// required and our margins remain unchanged."* The third clause is the one
// worth proving, because §173 made every provider cost correctable from a text
// field — if a corrected invoice could move the margin on a subscription, then
// a mis-typed one could sell the platform at a loss for every customer at once.
//
// It cannot, and the reason is arithmetic rather than vigilance: a plan's
// allowance is 20% of the price paid, and no ACU can buy more than a quarter of
// its own face value in provider cost. 20% x 25% = 5%.
const sub = await import("../src/backend/subscription.ts");

const worstPerAcu = () => {
  let worst = { key: "", perAcu: 0 };
  for (const [key, cost] of Object.entries(wallet.providerCostGbp())) {
    const acu = wallet.ACTION_COST_ACU[key];
    if (!acu) continue;
    const perAcu = cost / acu;
    if (perAcu > worst.perAcu) worst = { key, perAcu, acu, cost };
  }
  return worst;
};

say("  WHAT A CORRECTION DOES NOT TOUCH:");
say("");
const shares = [];
for (const [label, factor] of [["at today's estimates", 1], ["every line reconciled 4x cheaper", 0.25], ["a provider that doubled its prices", 2]]) {
  const overrides = {};
  for (const [k, c] of Object.entries(wallet.providerCostGbp())) overrides[k] = c * factor;
  if (factor !== 1) wallet.applyProviderCostOverrides(overrides);
  const w = worstPerAcu();
  const growth = sub.allPlanEconomics().find((p) => p.id === "growth");
  const spend = growth.monthlyAcus * w.perAcu;
  const share = spend / growth.monthlyGbp;
  shares.push(share);
  say(`    ${label.padEnd(34)} dearest ACU ${w.key.padEnd(17)} £${w.perAcu.toFixed(5)}/ACU`);
  say(`    ${" ".repeat(34)} Growth £${growth.monthlyGbp} / ${growth.monthlyAcus} ACU spent in full → £${spend.toFixed(2)} of provider cost, ${((1 - share) * 100).toFixed(1)}% gross`);
  wallet.applyProviderCostOverrides({});
}
say("");
check(
  "a reconciliation changes what an ACU BUYS, never what an ACU EARNS",
  shares.every((s) => Math.abs(s - shares[0]) < 1e-9),
  `worst-case share of revenue identical at every cost level: ${(shares[0] * 100).toFixed(2)}%`,
);
check(
  "and it is the two rates that guarantee it, not a number anybody typed",
  Math.abs(shares[0] - sub.ACU_ALLOCATION_RATE / sub.STANDARD_MARKUP) < 1e-9,
  `${sub.ACU_ALLOCATION_RATE * 100}% allowance x 1/${sub.STANDARD_MARKUP} markup = ${(shares[0] * 100).toFixed(0)}% of subscription revenue, worst case`,
);

say("");
say(`drive:reconcile — ${proven} proven, ${broken} broken.`);
say("");
say("WHAT IS STILL A GUESS: the invoice amounts above. Nobody has billed us yet,");
say("so every cost line is the built-in estimate and every price derived from one");
say("is higher than it needs to be. The screen is now the only thing standing");
say("between a real invoice and a lower price — paste the total, check the unit");
say("count it divides by, and press apply.");
process.exit(broken ? 1 : 0);
