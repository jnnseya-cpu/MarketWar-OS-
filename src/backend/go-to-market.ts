// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE GO-TO-MARKET PLAN — the part of the result somebody can actually work to.
//
// `discoverOpportunity` has ended with four bullets called `launchStrategy`
// since it was written. They are true and they are not a plan: nobody has ever
// opened a business on "validate with a lead magnet". This is the rest of it —
// ninety days, suppliers, segments, the first hundred customers, acquisition,
// and the arithmetic underneath all of it.
//
// THE ONE RULE THAT SHAPES EVERY LINE BELOW.
//
// A go-to-market plan is the single easiest document in business to fill with
// invented numbers. "Reach 100 customers in 90 days." "Expect a 3% conversion
// rate." "Your CAC will be £40." Every one of those is a fabrication dressed as
// a forecast, and a person who spends their savings against it has been lied to
// by a spreadsheet.
//
// So this plan states ARITHMETIC, never OUTCOMES. It does not say you will get
// a hundred customers. It says: at whatever rate YOU observe, a hundred
// customers requires this many conversations, and here is how to find that many
// people, and here is the number to write down in week one so that by week four
// the plan is running on your rate instead of anybody's guess.
//
// Where a figure genuinely cannot be known — and a conversion rate for a
// business that has not opened cannot be known — the plan says so and gives the
// method for finding it. That is the difference between a plan and a pitch.
//
// KEYLESS AND DETERMINISTIC. No provider call. Somebody evaluating whether to
// start a business should not need an API key to read the plan, and the same
// inputs must produce the same plan — a strategy that changes when you reload
// it is not a strategy.

import { siteUrl } from "@/shared/site";
// The test cap comes from the module that already owns "how much may be risked
// proving something" rather than being a second opinion on the same question.
import { DEFAULT_GUARDRAILS } from "@/backend/paid-guardrails";

export type GtmInput = {
  business: string;
  /** What is being sold. The plan is materially different for goods and services. */
  offer: string;
  model: BusinessModel;
  location?: string;
  /**
   * THE ONE CITY THIS LAUNCHES IN.
   *
   * Separate from `location` on purpose. A plan written for "the UK" is a plan
   * with no supplier to call, no group to post in and no Google Business
   * Profile to claim — every concrete instruction dissolves into a category.
   * Locking one city is the difference between a document and a decision.
   */
  launchCity?: string;
  currency?: string;
  /** Unit price, when known. Drives the arithmetic rather than being decoration. */
  priceGbp?: number;
  /** Landed unit cost, when known. */
  unitCostGbp?: number;
  /** What the founder can actually put in, per week and in total. */
  hoursPerWeek?: number;
  budgetGbp?: number;
  /** A conversion rate the founder has ACTUALLY OBSERVED. Never invented if absent. */
  observedCloseRate?: number;
};

export type Phase = {
  window: "Days 1–30" | "Days 31–60" | "Days 61–90";
  title: string;
  /** The single thing that has to be true at the end of this window. */
  exitCriterion: string;
  actions: { do: string; why: string; tool?: string }[];
  /** What is counted at the end. Counted, not forecast. */
  measure: string[];
};

export type SupplierRoute = {
  route: string;
  bestFor: string;
  typicalMoq: string;
  leadTime: string;
  risk: string;
  firstMove: string;
};

export type Segment = {
  name: string;
  who: string;
  /** Why they buy FIRST — the thing that makes them earlier than the others. */
  whyFirst: string;
  whereTheyAre: string;
  objection: string;
  answer: string;
};

export type FunnelMath = {
  target: number;
  /** Null when nothing has been observed. The plan refuses to invent one. */
  closeRate: number | null;
  conversationsNeeded: number | null;
  weeklyConversations: number | null;
  note: string;
};

export type BudgetLine = {
  phase: "Days 1–30" | "Days 31–60" | "Days 61–90" | "Held back";
  item: string;
  /** Pounds, when a budget was supplied. Null when it can only be a share. */
  amount: number | null;
  /** The share of the total this line takes. Always known, budget or not. */
  sharePct: number;
  why: string;
};

export type Budget = {
  supplied: boolean;
  totalGbp: number | null;
  currency: string;
  lines: BudgetLine[];
  /** What this plan genuinely needs to run, computed from what it asks you to do. */
  minimumViableGbp: number;
  minimumNote: string;
  rules: string[];
  note: string;
};

export type LaunchCity = {
  city: string;
  locked: boolean;
  why: string;
  /** What has to be true before a second city is opened. Not a date. */
  secondCityWhen: string[];
  localMoves: string[];
};

export type GtmPlan = {
  business: string;
  headline: string;
  /** The one sentence the whole plan serves. */
  wedge: string;
  launchCity: LaunchCity;
  budget: Budget;
  phases: Phase[];
  suppliers: { applicable: boolean; routes: SupplierRoute[]; diligence: string[]; terms: string[]; note: string };
  segments: Segment[];
  firstHundred: { math: FunnelMath; channels: { channel: string; play: string; cost: string; realistic: string }[]; sequence: string[] };
  acquisition: { loop: string[]; keepCost: string[]; killCriteria: string[] };
  marketing: { stack: { job: string; where: string; url: string; why: string }[]; note: string };
  economics: { line: string; value: string; how: string }[];
  risks: { risk: string; tell: string; move: string }[];
  honesty: string[];
};

export const BUSINESS_MODELS = ["physical_product", "service", "digital"] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

/**
 * Read a business model off a request.
 *
 * A function rather than an inline check in the route because the route is not
 * reachable from a test, and a grep for the string it contains is not a test —
 * a mutation that kept the parsing and dropped the VALUE sailed through one.
 * Unknown input returns undefined so the caller's own default applies, rather
 * than this quietly deciding somebody sells a service.
 */
export function parseBusinessModel(raw: unknown): BusinessModel | undefined {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (BUSINESS_MODELS as readonly string[]).includes(v) ? (v as BusinessModel) : undefined;
}

const money = (n: number, cur = "£") => `${cur}${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

// ---------------------------------------------------------------------------
// Suppliers — only for the model that has any
// ---------------------------------------------------------------------------

/**
 * How to actually find somebody to make or supply the thing.
 *
 * Written as routes with their real trade-offs rather than "find a supplier on
 * Alibaba", because the choice between a domestic wholesaler and a factory in
 * another country is the choice between a £300 first order and a £6,000 one,
 * and that is the decision that ends most product businesses before they start.
 */
export function supplierRoutes(model: GtmInput["model"], location = "the UK"): SupplierRoute[] {
  if (model !== "physical_product") return [];
  return [
    {
      route: "Domestic wholesaler / distributor",
      bestFor: "Proving demand before committing capital. Nothing else lets you buy twelve units.",
      typicalMoq: "1–24 units, often no minimum",
      leadTime: "2–7 days",
      risk: "Worst margin of any route — you are paying somebody else's markup. Fine while you are learning, fatal if you stay.",
      firstMove: `Search the trade directories for "${location} wholesale" plus your category, and call three. Ask for a trade account and a price list. Buying twelve units to sell to ten people teaches you more than any market research.`,
    },
    {
      route: "White label / private label supplier",
      bestFor: "A recognisable product you put your own brand on, without designing anything.",
      typicalMoq: "50–500 units",
      leadTime: "3–8 weeks including artwork",
      risk: "Your competitors can buy the identical product. The brand is the only difference, so it has to be a real one.",
      firstMove: "Ask three suppliers for the same spec and compare the quotes line by line — unit, tooling, artwork setup, carton, freight. The cheapest unit price is routinely the most expensive order.",
    },
    {
      route: "Contract manufacturer, direct",
      bestFor: "Something genuinely your own, once you know it sells.",
      typicalMoq: "500–5,000 units",
      leadTime: "8–16 weeks for a first run",
      risk: "The largest cash commitment and the slowest feedback. Do not take this route before you have sold the wholesaler's version to real people.",
      firstMove: "Go to one trade show for your category. A day of face-to-face beats three months of email, and the factories worth using are the ones that turn up.",
    },
    {
      route: "Local maker / small-batch producer",
      bestFor: "Food, craft, cosmetics, anything where provenance is part of the sell.",
      typicalMoq: "Very low, often per-batch",
      leadTime: "1–3 weeks",
      risk: "Capacity. A maker who can do 200 units a month cannot do 2,000, and finding that out during your best month is the worst possible time.",
      firstMove: "Ask the capacity question in the first conversation, not the price question. \"What is the most you could make in a month if I needed it?\"",
    },
    {
      route: "Dropship / print-on-demand",
      bestFor: "Testing a design or a niche with no inventory at all.",
      typicalMoq: "1",
      leadTime: "Immediate to list, 5–15 days to the customer",
      risk: "You control neither quality nor delivery, and the customer blames you for both. A test channel, not a business.",
      firstMove: "Order one to yourself first. If the unboxing embarrasses you, it will embarrass your customer.",
    },
  ];
}

export const SUPPLIER_DILIGENCE = [
  "Order a sample AND pay for it. A free sample is the supplier's best work; a paid one is closer to what arrives in the box.",
  "Ask for the last three customers in your country and call one. A supplier who will not give references has a reason.",
  "Check the company actually exists where it says it does — the register in its own country, not the marketplace profile.",
  "Get the price in writing broken down: unit, tooling, artwork, carton, pallet, freight, duty. \"£4 a unit\" is not a price.",
  "Confirm who owns the artwork and the mould. If they own the tooling you have rented your own product.",
  "Ask what happens when a batch is wrong — replacement, credit, or an argument. Get the answer before you need it.",
  "For food, cosmetics or anything worn: ask for the certification BEFORE the sample. If it does not exist, nothing else matters.",
];

export const SUPPLIER_TERMS = [
  "Never pay 100% up front on a first order. 30% deposit / 70% before shipping is standard and negotiable.",
  "Agree Incoterms explicitly — EXW means you are arranging freight from their factory door, and people find that out when the pallet does not move.",
  "Put the lead time in the order, with what happens if it slips. A verbal \"three weeks\" becomes six with no consequence.",
  "Keep the first order small enough that losing it entirely does not stop you. That number is your real risk budget.",
  "Reorder point, not reorder date: order again when stock falls to lead time × weekly sales, or you will be out for a month.",
];

// ---------------------------------------------------------------------------
// The first hundred — arithmetic, not a promise
// ---------------------------------------------------------------------------

/**
 * What a hundred customers actually requires.
 *
 * If no close rate has been OBSERVED, this returns nulls and says so. That is
 * the entire point. A plan that fills the gap with "assume 3%" produces a
 * confident number from nothing, and the founder budgets against it.
 */
export function firstHundredMath(input: { target?: number; observedCloseRate?: number; weeks?: number }): FunnelMath {
  const target = Math.max(1, Math.round(input.target ?? 100));
  const rate = input.observedCloseRate;
  const weeks = Math.max(1, Math.round(input.weeks ?? 12));

  if (!rate || !Number.isFinite(rate) || rate <= 0 || rate > 1) {
    return {
      target, closeRate: null, conversationsNeeded: null, weeklyConversations: null,
      note: `Nobody knows your conversion rate yet, and this plan will not invent one — a rate you did not measure produces a customer number you cannot hit and a budget built on it. WEEK ONE'S REAL JOB: have 20 conversations and count how many buy. That fraction is the only input this arithmetic needs, and from then on it tells you exactly how many people you must reach for ${target} customers.`,
    };
  }

  const conversations = Math.ceil(target / rate);
  return {
    target, closeRate: rate,
    conversationsNeeded: conversations,
    weeklyConversations: Math.ceil(conversations / weeks),
    note: `At the ${(rate * 100).toFixed(1)}% you have actually observed, ${target} customers takes ${conversations.toLocaleString()} real conversations — about ${Math.ceil(conversations / weeks)} a week for ${weeks} weeks. If that number is impossible for you, the answer is a better offer or a warmer channel, not more hours.`,
  };
}

// ---------------------------------------------------------------------------
// The money — dividing a real number, never inventing one
// ---------------------------------------------------------------------------

/**
 * The budget, allocated.
 *
 * THE LINE THIS WALKS. A go-to-market document is asked for "real budget
 * figures" and the dishonest way to give them is to write "£2,000 launch
 * budget" over a business whose owner never said they had £2,000. That is a
 * number invented for somebody else to spend.
 *
 * So: if a budget is supplied, this DIVIDES IT — real pounds, on real line
 * items, adding to exactly what was given. If none is supplied, every line
 * still carries its share as a percentage, and the plan says supply the number
 * and these become pounds. Either way nothing here is conjured.
 *
 * THE SHAPE OF THE SPLIT IS AN ARGUMENT, NOT A CONVENTION:
 *
 *   • Days 1–30 spend almost nothing on advertising, deliberately. The first
 *     month buys evidence, and evidence comes from conversations. Paid
 *     acquisition against an unproven offer funds your own education.
 *   • Days 31–60 is the only genuine test spend, capped per channel at the same
 *     figure `paid-guardrails.ts` uses, because that module already owns the
 *     question of how much may be risked proving something.
 *   • Days 61–90 is the largest share and it is CONDITIONAL. It is only spent
 *     behind a channel that produced customers twice.
 *   • A fifth is HELD BACK and never allocated. The first order always costs
 *     more than the quote once freight and duty land, and running out of money
 *     in week ten is what kills a business that was working.
 */
export function allocateBudget(input: {
  budgetGbp?: number;
  model: BusinessModel;
  currency?: string;
}): Budget {
  const cur = input.currency || "£";
  const total = Number.isFinite(input.budgetGbp) && (input.budgetGbp as number) > 0
    ? Math.round(input.budgetGbp as number)
    : null;
  const physical = input.model === "physical_product";
  const testCap = DEFAULT_GUARDRAILS.maxTestSpendGbp;

  // Shares. They add to 100 and the reserve is the last thing touched.
  const shape: { phase: BudgetLine["phase"]; item: string; sharePct: number; why: string }[] = physical
    ? [
        { phase: "Days 1–30", item: "First stock — smallest wholesale order you can sell by hand", sharePct: 25, why: "Twelve units sold to ten people teaches you more than three months of research, and costs less than the research." },
        { phase: "Days 1–30", item: "Samples, packaging, and getting the thing photographed properly", sharePct: 5, why: "One good photograph outsells a month of adjectives, and you only need one." },
        { phase: "Days 31–60", item: `Channel tests — no more than ${cur}${testCap} on any single one`, sharePct: 20, why: "Three channels tested properly beats seven gestures, and a cap per channel is what stops one of them quietly eating the month." },
        { phase: "Days 31–60", item: "Reorder of whatever actually sold", sharePct: 10, why: "Being out of stock in the month it starts working is the most expensive kind of caution." },
        { phase: "Days 61–90", item: "Scaling the ONE channel that produced customers twice", sharePct: 20, why: "Conditional. If no channel has produced twice, this is not spent — it is held." },
        { phase: "Held back", item: "Untouched reserve", sharePct: 20, why: "Freight and duty land after the quote, and running out in week ten kills a business that was working." },
      ]
    : [
        { phase: "Days 1–30", item: "Domain, one landing page, and the tools to take a booking or a payment", sharePct: 10, why: "One page, one offer, one button. A five-page site delays you three weeks and converts no better." },
        { phase: "Days 1–30", item: "Getting in front of people — travel, coffees, a stall, a local event", sharePct: 10, why: "The first customers come from conversations, and conversations have a cost that is not advertising." },
        { phase: "Days 31–60", item: `Channel tests — no more than ${cur}${testCap} on any single one`, sharePct: 30, why: "The only genuine test spend in the ninety days. Capped per channel so one cannot quietly eat the month." },
        { phase: "Days 61–90", item: "Scaling the ONE channel that produced customers twice", sharePct: 30, why: "Conditional. If no channel has produced twice, this is not spent — it is held." },
        { phase: "Held back", item: "Untouched reserve", sharePct: 20, why: "Something always costs more than expected, and running out in week ten kills a business that was working." },
      ];

  // Pence-exact: the last allocated line takes the rounding so the column adds
  // to the number that was supplied, not to something near it.
  const lines: BudgetLine[] = shape.map((l) => ({ ...l, amount: total === null ? null : Math.floor((total * l.sharePct) / 100) }));
  if (total !== null) {
    const allocated = lines.reduce((a, l) => a + (l.amount ?? 0), 0);
    const drift = total - allocated;
    if (drift !== 0) {
      const last = lines[lines.length - 1];
      last.amount = (last.amount ?? 0) + drift;
    }
  }

  // WHAT THE PLAN ACTUALLY NEEDS, computed from what it asks you to do rather
  // than from a figure somebody thought sounded right.
  const minimum = physical
    ? Math.round(120 + testCap)   // a smallest wholesale order + one channel test
    : Math.round(30 + testCap);   // a domain and a page + one channel test
  const minimumNote = physical
    ? `${cur}${minimum} is the floor this plan runs on: roughly ${cur}120 for a smallest-possible wholesale order you can sell by hand, plus ${cur}${testCap} for one channel test in month two. Below that you can still do all of month one — the conversations, the reviews, the page — for nothing.`
    : `${cur}${minimum} is the floor this plan runs on: about ${cur}30 for a domain and a page, plus ${cur}${testCap} for one channel test in month two. Month one costs nothing but hours, so a smaller number is not a blocker to starting.`;

  return {
    supplied: total !== null,
    totalGbp: total,
    currency: cur,
    lines,
    minimumViableGbp: minimum,
    minimumNote,
    rules: [
      `Nothing goes on paid acquisition until an offer has converted for free. Paid amplifies what is there, including nothing.`,
      `No single channel test exceeds ${cur}${testCap} before it has produced a customer.`,
      `The reserve is not a rainy-day fund, it is the money you have already spent and do not know it yet — freight, duty, the reprint, the thing that broke.`,
      `Day 61–90 money is CONDITIONAL on a channel producing customers twice. No winner, no spend.`,
      `When cost per customer exceeds your gross margin with no measured repeat purchase, stop — the answer is the offer, not more budget.`,
    ],
    note: total === null
      ? `No budget was supplied, so these are shares rather than pounds — enter what you can actually put in and every line becomes a real figure. That is deliberate: writing a launch budget for somebody who never named one is a number invented for them to spend.`
      : `${cur}${total.toLocaleString()} divided across ninety days. The column adds to exactly what you supplied, and a fifth of it is never allocated.`,
  };
}

// ---------------------------------------------------------------------------
// One city
// ---------------------------------------------------------------------------

export function lockLaunchCity(city: string | undefined, model: BusinessModel): LaunchCity {
  const named = (city || "").trim();
  const c = named || "one city you can reach in an hour";
  return {
    city: c,
    locked: Boolean(named),
    why: named
      ? `Everything in this plan is written for ${named} and nowhere else. One city means a real supplier to call, a real group to post in, a real Google Business Profile to claim and real people who can meet you — and it means the reviews, the referrals and the local search all compound in the same place instead of being spread thin across a map.`
      : `No city is locked, and that is the single most expensive gap in this plan. "Nationwide" has no supplier to call, no group to post in and no profile to claim — every concrete instruction below dissolves into a category. Name the city you can reach in an hour and the plan becomes a set of things to do on Monday.`,
    secondCityWhen: [
      "The first city has produced customers from one channel twice, at a cost you can state in pounds.",
      "Delivery works without you personally being in the room for every one.",
      "You could stop marketing for a fortnight and still take orders — that is what \"established\" means, and it is the only honest signal to expand.",
      "NOT when the first city feels slow. A second city does not fix a first city that is not working; it gives you two that are not working.",
    ],
    localMoves: named
      ? [
          `Claim and complete the Google Business Profile for ${named} — photographs, hours, service area, every field.`,
          `Join the two or three ${named} groups where your buyers already complain about this, and answer questions for a month before mentioning what you sell.`,
          `Find the ${named} businesses with the same customers and a different product. One conversation can put you in front of hundreds.`,
          model === "physical_product"
            ? `Search the trade directories for wholesalers within reach of ${named} — a supplier you can drive to solves problems a supplier you email cannot.`
            : `Do the first three jobs in ${named} in person even if the work is remote. What they say while you are in the room is the product.`,
          `Ask every ${named} customer for a review the same day, and for one introduction at the moment you deliver.`,
        ]
      : ["Name the city first. Every move here depends on it."],
  };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export function buildGtmPlan(input: GtmInput): GtmPlan {
  const cur = input.currency || "£";
  // The LOCKED CITY wins over the loose location. A plan that says "your area"
  // in one paragraph and "Birmingham" in the next is two plans.
  const city = lockLaunchCity(input.launchCity || input.location, input.model);
  const where = city.locked ? city.city : (input.location || "your area").trim();
  const budget = allocateBudget({ budgetGbp: input.budgetGbp, model: input.model, currency: cur });
  const business = (input.business || "your business").trim();
  const offer = (input.offer || "your offer").trim();
  const physical = input.model === "physical_product";
  const hours = input.hoursPerWeek ?? 0;

  const margin = input.priceGbp && input.unitCostGbp
    ? input.priceGbp - input.unitCostGbp
    : null;

  const phases: Phase[] = [
    {
      window: "Days 1–30",
      title: "Sell it before you build it",
      exitCriterion: `You have taken money from at least 3 people who are not related to you, or you have a written reason why they said no. Both are a pass. "Still setting up" is a fail.`,
      actions: [
        { do: `Write the offer as one sentence a stranger repeats correctly: what ${offer} is, who it is for in ${where}, and what it costs.`, why: "If you cannot say it in one sentence, no advert will fix that, and every pound spent on ads amplifies the confusion.", tool: siteUrl("/dashboard/offers") },
        { do: "Talk to 20 people in your target group. Not a survey — conversations. Ask what they use now and what annoys them about it.", why: "Twenty conversations is the smallest number that produces a pattern rather than an anecdote. It is also where your first customers come from.", tool: siteUrl("/dashboard/acquisition") },
        { do: "Count how many of those 20 buy. Write the fraction down.", why: "That single number turns every target in this plan from a hope into arithmetic. Nothing else in the first month matters as much." },
        physical
          ? { do: "Buy the smallest possible quantity from a domestic wholesaler and sell it by hand.", why: "Twelve units sold to ten people teaches you more than three months of research, and it costs less than the research." }
          : { do: "Deliver the service manually to your first three, badly and expensively in your own time.", why: "You are buying information, not profit. What they ask for while you are in the room is the product." },
        { do: "Put up one page that takes an enquiry. Not a website — one page, one offer, one button.", why: "A five-page site delays you by three weeks and converts no better than one page that says the thing.", tool: siteUrl("/dashboard/landing-builder") },
        { do: "Claim your Google Business Profile and get 3 reviews from those first customers.", why: `Local intent converts higher than anything you can buy, and in ${where} it is free. Three reviews is the point where a profile stops looking abandoned.`, tool: siteUrl("/dashboard/local") },
      ],
      measure: [
        "Conversations had (target 20 — this is the number, not revenue)",
        "Paying customers (target 3)",
        "Your observed close rate, written down",
        "Reviews collected (target 3)",
      ],
    },
    {
      window: "Days 31–60",
      title: "Find the channel that repeats",
      exitCriterion: "One channel has produced customers twice in a row, at a cost you can state in pounds. One. Not four half-working ones.",
      actions: [
        { do: "Take the exact words your first customers used and put them in the offer.", why: "Their language outsells your language every time, and you now have it written down from month one." },
        { do: "Pick THREE channels and run each properly for two weeks — not seven for two days.", why: "A channel tested for two days tells you nothing except that you are busy. Three real tests beat seven gestures.", tool: siteUrl("/dashboard/campaigns") },
        { do: "Ask every customer to bring one person, and give both sides a reason.", why: "Referral is the only channel that gets cheaper as it grows. Starting it at ten customers rather than a hundred compounds for the whole life of the business.", tool: siteUrl("/dashboard/amplify") },
        { do: "Publish one genuinely useful thing a week answering a question buyers actually type.", why: "It compounds while you sleep and costs nothing but the hour. Twelve weeks of this is a permanent acquisition channel.", tool: siteUrl("/dashboard/organic") },
        { do: "Write down cost per customer per channel. Actual pounds spent divided by actual customers.", why: "Without this you will scale the channel that felt best rather than the one that worked.", tool: siteUrl("/dashboard/roi") },
        physical
          ? { do: "Now approach white-label suppliers with real sales numbers in hand.", why: "A supplier quotes differently to somebody who has sold 60 units than to somebody with a plan. You will get better terms for having waited." }
          : { do: "Productise the service into a fixed scope at a fixed price.", why: "Bespoke quoting caps you at your own hours. A fixed scope is the first thing that can be sold without you." },
      ],
      measure: [
        "Cost per customer, per channel, in pounds",
        "Customers from referral (any number above zero is the signal)",
        "Repeat purchase or repeat booking rate",
        "Which channel produced customers twice — name it",
      ],
    },
    {
      window: "Days 61–90",
      title: "Pour fuel on the one that works, kill the rest",
      exitCriterion: `You know what a customer costs and what they are worth. If cost is below value, spend more. If not, the offer changes — not the budget.`,
      actions: [
        { do: "Stop every channel that has not produced a customer in 30 days.", why: "Keeping a dead channel alive out of hope is the most common way a small budget dies. Stopping is a decision, not a failure.", tool: siteUrl("/dashboard/budget") },
        { do: "Increase the working channel's budget by 20%, then wait two weeks and measure again.", why: "Doubling a budget changes the auction, the audience and the creative fatigue all at once, and you learn nothing from the result." },
        { do: "Build the second offer for people who already bought.", why: "Selling again to somebody who trusts you is the cheapest revenue that exists, and most businesses do not attempt it until year two." },
        { do: "Write down the three things that break if you get ten times busier, and fix the cheapest one.", why: "Growth breaks operations before it breaks marketing. The failure is usually delivery capacity, not demand." },
        { do: "Set the stop-loss rules in writing: max cost per customer, minimum return, maximum test spend.", why: "Rules written when you are calm are the ones that protect you in the month when you are not.", tool: siteUrl("/dashboard/budget") },
      ],
      measure: [
        "Cost per customer vs value of a customer — the only ratio that matters",
        "Revenue from repeat buyers as a share of the total",
        "Hours you personally spend per customer (this must be falling)",
        "Customers acquired in days 61–90 vs days 1–30",
      ],
    },
  ];

  const segments: Segment[] = [
    {
      name: "The already-looking",
      who: `People in ${where} actively searching for ${offer} this week.`,
      whyFirst: "They are the cheapest customers you will ever get because you do not have to create the demand — only be findable and credible when they look.",
      whereTheyAre: "Google and Maps searches, local Facebook groups, \"can anyone recommend\" posts.",
      objection: "\"I have never heard of you.\"",
      answer: "Reviews and a real address. Three genuine reviews outrank a year of advertising for this group.",
    },
    {
      name: "The badly served",
      who: "People already buying this from somebody who is letting them down — slow, expensive, rude, unreliable.",
      whyFirst: "Demand is proven and the switch costs them nothing. You are not selling the category, only yourself.",
      whereTheyAre: "One-star and three-star reviews of your competitors. Read them; the complaints are your marketing copy.",
      objection: "\"They are all the same.\"",
      answer: "Name the specific failure and guarantee against it. Specific beats superlative every time.",
    },
    {
      name: "The nearly-buyers",
      who: "People who want it but have not found a reason to act this month.",
      whyFirst: "Cheap to reach once the first two groups have paid for the channel, and they convert on a deadline rather than a discount.",
      whereTheyAre: "Your own enquiry list and anybody who visited and did not buy.",
      objection: "\"Not right now.\"",
      answer: "A reason that expires and is real. A fake deadline is noticed once and costs you the relationship.",
    },
    {
      name: "The referrers",
      who: "Customers and local businesses whose customers are also yours, without competing.",
      whyFirst: "Not first to buy — first to compound. Their recommendation converts at a rate no advert reaches.",
      whereTheyAre: "The people you have already served, and the shop next door with the same customers.",
      objection: "\"What do I get?\"",
      answer: "Something worth having, paid on a result you can verify, capped so it can never cost more than the customer is worth.",
    },
  ];

  const math = firstHundredMath({ observedCloseRate: input.observedCloseRate, weeks: 12 });

  const channels = [
    { channel: "Direct conversation", play: `Ask 20 people in ${where} personally. In person, on the phone, in the group where they already are.`, cost: "Free, and costs hours", realistic: "First 5–15 customers. Nothing else works this reliably at zero." },
    { channel: "Google Business Profile", play: "Claim it, photograph it properly, collect reviews from every customer while they are still pleased.", cost: "Free", realistic: "Compounds from week 3. The single highest-intent free channel for a local business." },
    { channel: "One useful page a week", play: "Answer the question buyers actually type, not the one you wish they typed.", cost: "Free, one hour", realistic: "Slow for 8 weeks, then permanent. Start on day 1 precisely because it is slow." },
    { channel: "Referral with a real reward", play: "Both sides get something. Ask at the moment of delivery, not in a later email.", cost: "A share of margin", realistic: "The cheapest customers after the first twenty. Gets cheaper as it grows." },
    { channel: "Partner businesses", play: "Same customer, different product. One conversation can put you in front of hundreds.", cost: "Free or revenue share", realistic: "Lumpy — most say no, one says yes and changes the month." },
    { channel: "Paid social / search", play: `Only after a channel has worked organically. Test with ${money(Math.min(150, input.budgetGbp ?? 150), cur)}, not with everything.`, cost: "Real money, immediately", realistic: "Fastest and least forgiving. Amplifies a working offer and burns a broken one." },
  ];

  const marketing = [
    { job: "Find out whether anybody wants it", where: "Opportunity Radar", url: siteUrl("/dashboard/discover"), why: "Reads real search and local signals for your niche instead of guessing, and says so when the signal is thin." },
    { job: "See where you are actually losing customers", where: "Free website audit", url: siteUrl("/audit"), why: "A real crawl of a real page, with findings. No account, no card, nothing to configure." },
    { job: "Sharpen the offer until it sells itself", where: "Offer Builder", url: siteUrl("/dashboard/offers"), why: "Refuses an offer whose margin cannot support its own promotion — the arithmetic runs before the copy." },
    { job: "Know who your buyer really is", where: "Audience Segments", url: siteUrl("/dashboard/segments"), why: "Built from your own customer data rather than a persona template." },
    { job: "See what rivals are doing and where they are weak", where: "Competitor Spy", url: siteUrl("/dashboard/competitors"), why: "Turns their complaints and gaps into your positioning." },
    { job: "Make the ads without a designer", where: "Ad Canvas", url: siteUrl("/dashboard/studio"), why: "Your own photograph in, a postable PNG out at real placement size, contrast-checked. Needs no keys." },
    { job: "Get found by people already searching", where: "Local Domination", url: siteUrl("/dashboard/local"), why: "The highest-intent free channel a local business has." },
    { job: "Turn a visit into an enquiry", where: "Conversion Architect", url: siteUrl("/dashboard/landing-builder"), why: "One page, one offer, one button — live in an hour, not three weeks." },
    { job: "Find and contact the right businesses", where: "LeadWar Room", url: siteUrl("/dashboard/prospecting"), why: "ICP → discovery → scoring → a personalised sequence, so outreach is not bulk." },
    { job: "Stop a campaign losing money", where: "Budget Protection", url: siteUrl("/dashboard/budget"), why: "Stop-loss, a +20% scale step and computed ceilings — and it refuses to judge on thin evidence rather than guessing." },
    { job: "Know which pound produced which customer", where: "ROI Engine", url: siteUrl("/dashboard/roi"), why: "Attribution from campaign to creative to sale, so you scale the channel that worked rather than the one that felt best." },
    { job: "Get customers to bring customers", where: "Reach Amplifier / Share2Earn", url: siteUrl("/dashboard/amplify"), why: "Rewards capped so a referral can never cost more than the customer is worth." },
    { job: "Ask for reviews without being a nuisance", where: "Reputation Shield", url: siteUrl("/dashboard/reputation"), why: "Timing and consent handled, because the ask lands or annoys depending on the hour." },
    { job: "Run the whole loop on a schedule", where: "Command Centre", url: siteUrl("/dashboard"), why: "Today's revenue, leads, live campaigns and what needs approving, in one screen." },
  ];

  const economics: { line: string; value: string; how: string }[] = [
    { line: "Price", value: input.priceGbp ? money(input.priceGbp, cur) : "not supplied", how: "What a customer pays, once." },
    { line: "Unit cost", value: input.unitCostGbp ? money(input.unitCostGbp, cur) : "not supplied", how: physical ? "Landed cost: product + freight + duty + packaging. Not the factory quote." : "Your time at a real hourly rate, plus anything you buy in." },
    { line: "Gross margin per sale", value: margin !== null ? money(margin, cur) : "cannot be computed — supply price and cost", how: "Price minus unit cost. This is the money that has to pay for finding the customer." },
    { line: "Most you can pay for a customer", value: margin !== null ? `under ${money(margin, cur)} on the first sale` : "unknown until margin is known", how: "Spend more than your margin and you are buying customers at a loss, which is only ever justified by repeat purchase you have measured." },
    { line: "Break-even customers per month", value: "your fixed monthly costs ÷ gross margin per sale", how: "Write your real fixed costs down. This number is the one that tells you whether the business works." },
  ];

  return {
    business,
    launchCity: city,
    budget,
    headline: `${business}: sell it by hand for 30 days, find the one channel that repeats by day 60, and spend only behind what worked by day 90.`,
    wedge: `Win in ${where} on the specific thing the incumbents are getting wrong — named, guaranteed against, and proved by three reviews before you spend a pound on advertising.`,
    phases,
    suppliers: {
      applicable: physical,
      routes: supplierRoutes(input.model, where),
      diligence: physical ? SUPPLIER_DILIGENCE : [],
      terms: physical ? SUPPLIER_TERMS : [],
      note: physical
        ? "Start on the worst-margin route deliberately. A domestic wholesaler lets you buy twelve units and find out whether anybody wants them; a factory makes you buy five hundred to find out the same thing. Move down this list as evidence arrives, not before."
        : `${input.model === "service" ? "A service" : "A digital product"} has no supply chain — your constraint is your own capacity, and the equivalent of supplier diligence is deciding what you will NOT do. Skip to the segments.`,
    },
    segments,
    firstHundred: {
      math,
      channels,
      sequence: [
        "1–20: conversations you have personally. No advertising. This is where you learn the words your buyers use.",
        "21–50: the review flywheel plus referral from the first twenty. Still nearly free, and now compounding.",
        "51–100: the one channel that produced customers twice, funded by margin you have actually banked.",
        "Only then: paid. Paid acquisition applied to an unproven offer is a fast way to fund your own education.",
      ],
    },
    acquisition: {
      loop: [
        "REACH somebody who already has the problem — do not create demand you cannot afford to create.",
        "PROVE it in one line: the specific failure you fix, not a superlative.",
        "ASK for something small — a reply, a booking, a £5 sample — before asking for the full price.",
        "DELIVER visibly better than expected, once, on purpose.",
        "CAPTURE the review while they are still pleased. An hour later is a different answer.",
        "ASK for the referral at the moment of delivery, not in an email next week.",
        "MEASURE what it cost, and repeat only the step that produced a customer.",
      ],
      keepCost: [
        `Serve one place well. ${where} beats "nationwide" for the first hundred, every time.`,
        "One offer. A menu of five splits your budget and your message and converts worse than any single one would alone.",
        "Reuse one piece of work across every channel rather than making new work per channel.",
        "Ask every single customer for a referral. The ones who would have said yes and were never asked are the cheapest customers you never got.",
        "Never buy attention for an offer that has not converted organically. Paid amplifies what is there, including nothing.",
      ],
      killCriteria: [
        "A channel with 30 days and no customer: stop it. Not \"give it another month\".",
        "Cost per customer above your gross margin, with no measured repeat purchase: stop.",
        "An offer nobody buys after 20 real conversations: change the offer, not the advert.",
        "You cannot say which channel produced last week's customers: stop everything except one, until you can.",
      ],
    },
    marketing: {
      stack: marketing,
      note: `Every one of those runs at ${siteUrl("/")} — and the free website audit and the ad canvas need no account, no card and no API key at all, so the first month of this plan costs nothing but your hours.${hours > 0 && hours < 10 ? ` At ${hours} hours a week, do the first three rows and ignore the rest until day 30.` : ""}`,
    },
    economics,
    risks: [
      { risk: "Building for three months before selling anything", tell: "You are still \"getting ready\" in week 6.", move: "Sell the wholesaler's version, or deliver the service by hand, this week. Readiness is not a stage, it is an excuse with a calendar." },
      { risk: "Spending on ads to fix an offer nobody wants", tell: "Clicks arrive, nobody buys.", move: "Stop the spend. Twenty conversations. The problem is upstream of the advert and no budget reaches it." },
      { risk: physical ? "A first order too large to lose" : "Bespoke work that only you can deliver", tell: physical ? "The order is more than you could walk away from." : "Every job is quoted from scratch.", move: physical ? "Halve it. Twice, if it still frightens you." : "Fix the scope and the price. It is the first thing that can be sold without you." },
      { risk: "Four channels at 20% effort", tell: "You cannot say which one produced last week's customers.", move: "Pick one. Run it properly for two weeks. Then the next." },
      { risk: "Growth breaking delivery", tell: "The good month is the one the reviews get worse.", move: "Write down the three things that break at ten times the volume, and fix the cheapest one now." },
    ],
    honesty: [
      "This plan contains no forecast of your results, deliberately. Nobody can know what a business that has not opened will convert at, and a number invented here becomes a budget you spend against.",
      math.closeRate === null
        ? "The first-hundred arithmetic is unfinished on purpose: it needs your observed close rate, and week one's real job is to measure it from 20 conversations."
        : `The first-hundred arithmetic uses the ${(math.closeRate * 100).toFixed(1)}% you supplied as observed. If that was an estimate rather than a count, the whole funnel below it is an estimate too.`,
      margin === null
        ? "Unit economics cannot be computed without a price and a cost. Until they exist, \"what can I afford to pay for a customer\" has no answer and any advertising budget is a guess."
        : `Margin of ${money(margin, cur)} a sale is the ceiling on what a customer may cost you before repeat purchase is proven.`,
      "Timings assume you act every week. A 90-day plan worked at weekends is a 250-day plan, and that is fine as long as you know which one you are running.",
    ],
  };
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/**
 * The whole plan as a file somebody can keep.
 *
 * Markdown rather than PDF, and that is a decision rather than a shortcut: this
 * document is meant to be EDITED. The founder will change the city, argue with
 * the budget split and add the supplier they actually found, and a PDF makes
 * every one of those a retype. Markdown opens in anything, pastes into Docs and
 * Word with the headings intact, and prints.
 *
 * EVERY SECTION IS HERE. A download that quietly drops the risks or the honesty
 * block because they did not fit is worse than no download — the reader has no
 * way to know something is missing, and the parts most likely to be trimmed are
 * the parts that stop them losing money.
 */
export function toMarkdown(plan: GtmPlan, opts: { generatedOn?: string } = {}): string {
  const cur = plan.budget.currency;
  const L: string[] = [];
  const h = (level: number, text: string) => L.push("", `${"#".repeat(level)} ${text}`, "");
  const p = (text: string) => L.push(text, "");
  const bullets = (items: string[]) => { for (const i of items) L.push(`- ${i}`); L.push(""); };

  L.push(`# GO-TO-MARKET — ${plan.business}`);
  L.push("");
  p(`**${plan.headline}**`);
  p(plan.wedge);
  if (opts.generatedOn) p(`_Prepared ${opts.generatedOn}. Every figure below is either supplied by you or computed from something supplied by you._`);

  // --- 1. City -------------------------------------------------------------
  h(2, `1. Launch city — ${plan.launchCity.city}`);
  p(plan.launchCity.locked ? `**Locked: ${plan.launchCity.city}.**` : "**Not locked yet — read this first.**");
  p(plan.launchCity.why);
  h(3, "What to do here specifically");
  bullets(plan.launchCity.localMoves);
  h(3, "A second city only when");
  bullets(plan.launchCity.secondCityWhen);

  // --- 2. Budget -----------------------------------------------------------
  h(2, "2. The budget");
  p(plan.budget.note);
  L.push(`| Phase | Line | Share | ${plan.budget.supplied ? "Amount" : "Amount (supply a budget)"} |`);
  L.push("|---|---|---:|---:|");
  for (const line of plan.budget.lines) {
    L.push(`| ${line.phase} | ${line.item} | ${line.sharePct}% | ${line.amount === null ? "—" : `${cur}${line.amount.toLocaleString()}`} |`);
  }
  if (plan.budget.supplied && plan.budget.totalGbp !== null) {
    L.push(`| **Total** | | **100%** | **${cur}${plan.budget.totalGbp.toLocaleString()}** |`);
  }
  L.push("");
  for (const line of plan.budget.lines) L.push(`- **${line.item}** — ${line.why}`);
  L.push("");
  h(3, "The floor");
  p(plan.budget.minimumNote);
  h(3, "Rules the money obeys");
  bullets(plan.budget.rules);

  // --- 3. The 90 days ------------------------------------------------------
  h(2, "3. The ninety days");
  for (const phase of plan.phases) {
    h(3, `${phase.window} — ${phase.title}`);
    p(`**Done when:** ${phase.exitCriterion}`);
    phase.actions.forEach((a, i) => {
      L.push(`${i + 1}. **${a.do}**`);
      L.push(`   ${a.why}`);
      if (a.tool) L.push(`   → ${a.tool}`);
    });
    L.push("");
    p(`**Count at the end:** ${phase.measure.join(" · ")}`);
  }

  // --- 4. Suppliers --------------------------------------------------------
  h(2, "4. Suppliers and sourcing");
  p(plan.suppliers.note);
  if (plan.suppliers.applicable) {
    L.push("| Route | Best for | MOQ | Lead time |");
    L.push("|---|---|---|---|");
    for (const r of plan.suppliers.routes) L.push(`| ${r.route} | ${r.bestFor} | ${r.typicalMoq} | ${r.leadTime} |`);
    L.push("");
    for (const r of plan.suppliers.routes) {
      h(3, r.route);
      p(`**Risk:** ${r.risk}`);
      p(`**First move:** ${r.firstMove}`);
    }
    h(3, "Before you place an order");
    bullets(plan.suppliers.diligence);
    h(3, "Terms");
    bullets(plan.suppliers.terms);
  }

  // --- 5. Segments ---------------------------------------------------------
  h(2, "5. Who buys first");
  for (const seg of plan.segments) {
    h(3, seg.name);
    p(seg.who);
    p(`**Why they are first:** ${seg.whyFirst}`);
    p(`**Where they are:** ${seg.whereTheyAre}`);
    p(`**"${seg.objection}"** → ${seg.answer}`);
  }

  // --- 6. First 100 --------------------------------------------------------
  h(2, `6. The first ${plan.firstHundred.math.target} customers`);
  p(plan.firstHundred.math.note);
  if (plan.firstHundred.math.conversationsNeeded !== null) {
    p(`**${plan.firstHundred.math.conversationsNeeded.toLocaleString()} conversations · ${plan.firstHundred.math.weeklyConversations} a week for 12 weeks.**`);
  }
  h(3, "In this order");
  bullets(plan.firstHundred.sequence);
  h(3, "Channels");
  L.push("| Channel | Play | Cost | Realistically |");
  L.push("|---|---|---|---|");
  for (const c of plan.firstHundred.channels) L.push(`| ${c.channel} | ${c.play} | ${c.cost} | ${c.realistic} |`);
  L.push("");

  // --- 7. Acquisition ------------------------------------------------------
  h(2, "7. The acquisition loop");
  plan.acquisition.loop.forEach((step, i) => L.push(`${i + 1}. ${step}`));
  L.push("");
  h(3, "Keeping it cheap");
  bullets(plan.acquisition.keepCost);
  h(3, "When to stop");
  bullets(plan.acquisition.killCriteria);

  // --- 8. Economics --------------------------------------------------------
  h(2, "8. Unit economics");
  L.push("| Line | Value | What it means |");
  L.push("|---|---|---|");
  for (const e of plan.economics) L.push(`| ${e.line} | ${e.value} | ${e.how} |`);
  L.push("");

  // --- 9. Risks ------------------------------------------------------------
  h(2, "9. What kills this");
  for (const r of plan.risks) {
    L.push(`- **${r.risk}**`);
    L.push(`  - Tell: ${r.tell}`);
    L.push(`  - Move: ${r.move}`);
  }
  L.push("");

  // --- 10. Stack -----------------------------------------------------------
  h(2, "10. Run it here");
  L.push("| Job | Where | Why |");
  L.push("|---|---|---|");
  for (const m of plan.marketing.stack) L.push(`| ${m.job} | [${m.where}](${m.url}) | ${m.why} |`);
  L.push("");
  p(plan.marketing.note);

  // --- 11. Honesty ---------------------------------------------------------
  h(2, "11. What this plan does not claim");
  bullets(plan.honesty);

  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * The same document as a printable page.
 *
 * Markdown is for editing; this is for the version somebody prints, emails to a
 * partner or takes to a bank. It is built from the SAME plan object rather than
 * from the markdown, so neither can gain a section the other lacks.
 *
 * Print CSS rather than a PDF library on purpose: every browser turns this into
 * a PDF, it costs no dependency, and the reader can adjust the paper size. The
 * page breaks are set so a section never starts two lines before the bottom.
 */
export function toHtml(plan: GtmPlan, opts: { generatedOn?: string } = {}): string {
  const cur = plan.budget.currency;
  const esc = (v: string) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const B = plan.budget;

  const rows = (head: string[], body: string[][]) => `
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>GO-TO-MARKET — ${esc(plan.business)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14181f; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: -0.3pt; }
  h2 { font-size: 13pt; margin: 22pt 0 6pt; padding-bottom: 4pt; border-bottom: 1.5pt solid #0f7a52; color: #0f7a52; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 12pt 0 3pt; page-break-after: avoid; }
  p { margin: 0 0 7pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9pt; page-break-inside: avoid; }
  th { text-align: left; border-bottom: 1pt solid #14181f; padding: 4pt 6pt 4pt 0; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4pt; }
  td { border-bottom: 0.5pt solid #d7dbe2; padding: 5pt 6pt 5pt 0; vertical-align: top; }
  td.num, th.num { text-align: right; padding-right: 0; }
  .lede { font-size: 12pt; font-weight: 700; margin-bottom: 8pt; }
  .wedge { border-left: 2.5pt solid #0f7a52; padding-left: 10pt; margin: 0 0 12pt; }
  .meta { color: #5b6472; font-size: 8.5pt; margin-bottom: 16pt; }
  .why { color: #5b6472; font-size: 9pt; display: block; margin-top: 2pt; }
  .callout { border: 1pt solid #c9a227; background: #fdf8e8; padding: 8pt 10pt; margin: 8pt 0 12pt; page-break-inside: avoid; }
  .callout p:last-child, .callout ul:last-child { margin-bottom: 0; }
  .phase { border: 0.75pt solid #d7dbe2; padding: 9pt 11pt; margin-bottom: 9pt; page-break-inside: avoid; }
  .done { background: #f4f6f9; padding: 5pt 8pt; margin: 4pt 0 7pt; font-size: 9.5pt; }
  .total td { border-top: 1pt solid #14181f; border-bottom: none; font-weight: 700; }
  a { color: #0f7a52; text-decoration: none; }
  footer { margin-top: 20pt; padding-top: 8pt; border-top: 0.5pt solid #d7dbe2; color: #5b6472; font-size: 8pt; }
</style></head><body>

<h1>GO-TO-MARKET</h1>
<p class="lede">${esc(plan.business)}</p>
<p class="wedge">${esc(plan.headline)}<br><span class="why">${esc(plan.wedge)}</span></p>
${opts.generatedOn ? `<p class="meta">Prepared ${esc(opts.generatedOn)}. Every figure below is either supplied by you or computed from something supplied by you — nothing here is a forecast.</p>` : ""}

<h2>1. Launch city — ${esc(plan.launchCity.city)}</h2>
${plan.launchCity.locked
  ? `<p><strong>Locked: ${esc(plan.launchCity.city)}.</strong> ${esc(plan.launchCity.why)}</p>`
  : `<div class="callout"><p><strong>Not locked yet.</strong> ${esc(plan.launchCity.why)}</p></div>`}
${plan.launchCity.locked ? `<h3>Do these here specifically</h3>${list(plan.launchCity.localMoves)}` : ""}
<h3>A second city only when</h3>${list(plan.launchCity.secondCityWhen)}

<h2>2. The budget</h2>
<p>${esc(B.note)}</p>
${rows(["Phase", "Line", "Share", "Amount"], [
  ...B.lines.map((l) => [
    esc(l.phase),
    `${esc(l.item)}<span class="why">${esc(l.why)}</span>`,
    `<span class="num">${l.sharePct}%</span>`,
    `<span class="num">${l.amount === null ? "—" : `${cur}${l.amount.toLocaleString()}`}</span>`,
  ]),
  ...(B.supplied && B.totalGbp !== null
    ? [["<strong>Total</strong>", "", "<strong>100%</strong>", `<strong>${cur}${B.totalGbp.toLocaleString()}</strong>`]]
    : []),
])}
<h3>The floor</h3><p>${esc(B.minimumNote)}</p>
<h3>Rules the money obeys</h3>${list(B.rules)}

<h2>3. The ninety days</h2>
${plan.phases.map((ph) => `
  <div class="phase">
    <h3>${esc(ph.window)} — ${esc(ph.title)}</h3>
    <p class="done"><strong>Done when:</strong> ${esc(ph.exitCriterion)}</p>
    <ol>${ph.actions.map((a) => `<li><strong>${esc(a.do)}</strong><span class="why">${esc(a.why)}</span>${a.tool ? `<span class="why"><a href="${esc(a.tool)}">${esc(a.tool)}</a></span>` : ""}</li>`).join("")}</ol>
    <p class="why"><strong>Count at the end:</strong> ${esc(ph.measure.join(" · "))}</p>
  </div>`).join("")}

<h2>4. Suppliers and sourcing</h2>
<p>${esc(plan.suppliers.note)}</p>
${plan.suppliers.applicable ? `
  ${rows(["Route", "Best for", "MOQ", "Lead time"], plan.suppliers.routes.map((r) => [esc(r.route), esc(r.bestFor), esc(r.typicalMoq), esc(r.leadTime)]))}
  ${plan.suppliers.routes.map((r) => `<h3>${esc(r.route)}</h3><p><strong>Risk:</strong> ${esc(r.risk)}</p><p><strong>First move:</strong> ${esc(r.firstMove)}</p>`).join("")}
  <h3>Before you place an order</h3>${list(plan.suppliers.diligence)}
  <h3>Terms</h3>${list(plan.suppliers.terms)}` : ""}

<h2>5. Who buys first</h2>
${plan.segments.map((s) => `<h3>${esc(s.name)}</h3><p>${esc(s.who)}</p><p><strong>Why they are first:</strong> ${esc(s.whyFirst)}</p><p><strong>Where they are:</strong> ${esc(s.whereTheyAre)}</p><p><strong>&ldquo;${esc(s.objection)}&rdquo;</strong> → ${esc(s.answer)}</p>`).join("")}

<h2>6. The first ${plan.firstHundred.math.target} customers</h2>
${plan.firstHundred.math.closeRate === null
  ? `<div class="callout"><p>${esc(plan.firstHundred.math.note)}</p></div>`
  : `<p><strong>${plan.firstHundred.math.conversationsNeeded?.toLocaleString()} conversations · ${plan.firstHundred.math.weeklyConversations} a week for 12 weeks.</strong></p><p>${esc(plan.firstHundred.math.note)}</p>`}
<h3>In this order</h3>${list(plan.firstHundred.sequence)}
${rows(["Channel", "Play", "Cost", "Realistically"], plan.firstHundred.channels.map((c) => [esc(c.channel), esc(c.play), esc(c.cost), esc(c.realistic)]))}

<h2>7. The acquisition loop</h2>
<ol>${plan.acquisition.loop.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
<h3>Keeping it cheap</h3>${list(plan.acquisition.keepCost)}
<h3>When to stop</h3>${list(plan.acquisition.killCriteria)}

<h2>8. Unit economics</h2>
${rows(["Line", "Value", "What it means"], plan.economics.map((e) => [esc(e.line), `<strong>${esc(e.value)}</strong>`, esc(e.how)]))}

<h2>9. What kills this</h2>
${rows(["Risk", "The tell", "The move"], plan.risks.map((r) => [`<strong>${esc(r.risk)}</strong>`, esc(r.tell), esc(r.move)]))}

<h2>10. Run it here</h2>
${rows(["Job", "Where", "Why"], plan.marketing.stack.map((m) => [esc(m.job), `<a href="${esc(m.url)}">${esc(m.where)}</a>`, esc(m.why)]))}
<p>${esc(plan.marketing.note)}</p>

<h2>11. What this plan does not claim</h2>
<div class="callout">${list(plan.honesty)}</div>

<footer>GO-TO-MARKET — ${esc(plan.business)} · Produced by MarketWar OS. This document contains no forecast of results; every number is supplied by you or computed from one that was.</footer>
</body></html>`;
}

/** The filename. Named for what it is, not for a timestamp nobody reads. */
export function documentFilename(plan: GtmPlan, ext: "md" | "html" = "md"): string {
  const slug = plan.business.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
  return `GO-TO-MARKET-${slug}.${ext}`;
}

export const GTM_DOCTRINE = [
  "The plan states arithmetic, never outcomes. It does not say you will get 100 customers; it says what 100 customers requires at whatever rate you actually observe.",
  "Where a number cannot be known it says so and gives the method for finding it. A conversion rate for a business that has not opened cannot be known, and filling that gap with \"assume 3%\" is how a founder budgets against a fabrication.",
  "Suppliers are routes with real trade-offs, not \"find one on a marketplace\". The choice between a wholesaler and a factory is the choice between a £300 first order and a £6,000 one, and it ends most product businesses before they start.",
  "The first customers come from conversations, not advertising. Paid acquisition applied to an unproven offer funds your own education.",
  "Keyless and deterministic. Somebody deciding whether to start a business should not need an API key to read the plan, and a strategy that changes when you reload it is not a strategy.",
];
