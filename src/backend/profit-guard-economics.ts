// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// ProfitGuard AI™ — the unit-economics governor above every SHARE2EARN campaign.
//
// SIBLING, NOT REPLACEMENT. `profit-guard.ts` already carries ProfitGuard's
// nine pre-scale checks — in stock, offer valid, price correct, margin clears
// the floor, delivery capacity, page and checkout working, CAC viable, AI cost
// controlled. That module answers "is it safe to scale this clip?". This one
// answers a different question: "what can this offer actually afford to pay a
// creator?" They are the same product and deliberately separate files, because
// a checklist and a waterfall are different shapes.
//
// The rule the whole module exists to enforce, in the owner's words:
//
//   Creators earn from the value they create — never from the survival margin
//   of the business.
//
// A conventional affiliate system pays for activity and hopes the maths works.
// This one computes the maths FIRST and refuses any configuration that does not
// survive it. The order is fixed and nothing may reorder it:
//
//   Revenue → Variable costs → Protected margin → Available growth pool
//                                                   → Creator + Platform + Reserve
//
// The creator never has access to the protected margin. There is no setting for
// it, no override, and no "advanced" checkbox — a floor that can be switched off
// is not a floor.
//
// ── ONE WORD THIS MODULE REFUSES TO MISUSE ─────────────────────────────────
//
// "INCREMENTAL". A sale attributed to a creator's link is not proof the sale
// would not have happened anyway, and the difference is the entire argument for
// whether a channel is worth running. Classifying a buyer as "new" does not
// establish incrementality either — plenty of new customers were going to find
// the shop that week regardless.
//
// So: with no holdout configured, every figure here says ATTRIBUTED, because
// that is what was measured. Configure a holdout and lift is computed properly
// against it, and only then does this module use the word incremental. A CFO who
// catches the product calling attributed revenue "incremental" once will never
// trust another number on the screen, and they would be right not to.

// ---------------------------------------------------------------------------
// The economics of one offer
// ---------------------------------------------------------------------------
export type OfferEconomics = {
  /** What the customer actually pays, in pence. */
  pricePence: number;
  cogsPence: number;
  fulfilmentPence: number;
  paymentFeePence: number;
  /** VAT or sales tax the business does not keep. */
  taxPence: number;
  /** Reserved against refunds and chargebacks, as a percentage of price. */
  returnsAllowancePct: number;
  otherVariablePence: number;
  /**
   * The margin the business keeps no matter what. Either an absolute amount or
   * a percentage of price — whichever is set. If both, the LARGER is protected,
   * because the point of a floor is to be the binding one.
   */
  minProtectedMarginPence?: number;
  minProtectedMarginPct?: number;
  /**
   * Spend against expected lifetime value rather than the first order.
   *
   * Real practice, and real risk: it is borrowing against revenue that has not
   * arrived. Off unless explicitly set, never inferred, and the result always
   * says it is in use.
   */
  ltvMultiple?: number;
};

export type Economics = {
  pricePence: number;
  variableCostPence: number;
  contributionPence: number;
  protectedMarginPence: number;
  /** Everything acquisition is allowed to consume. The ceiling on all rewards. */
  growthPoolPence: number;
  contributionMarginPct: number;
  /** Spend = contribution. Above this ROAS the campaign is losing money outright. */
  breakEvenRoas: number;
  /** Spend = the growth pool. Below this the protected margin is being eaten. */
  minPermittedRoas: number;
  maxCpaPence: number;
  ltvApplied: boolean;
  notes: string[];
};

const round = (n: number) => Math.round(n);
const pct = (n: number) => Math.round(n * 1000) / 10;

/**
 * Safe Reward Ceiling™ — the arithmetic, with nothing hidden.
 *
 * Worked against the owner's own example: £100 revenue, £55 variable, £20
 * protected → £25 pool. Not £45, and definitely not £100.
 */
export function economicsFor(o: OfferEconomics): Economics {
  const price = Math.max(0, round(o.pricePence || 0));
  const returns = Math.max(0, Math.min(100, o.returnsAllowancePct || 0)) / 100 * price;
  const variable = Math.max(0, round(
    (o.cogsPence || 0) + (o.fulfilmentPence || 0) + (o.paymentFeePence || 0) +
    (o.taxPence || 0) + (o.otherVariablePence || 0) + returns,
  ));
  const contribution = price - variable;

  // The binding floor is the larger of the two ways of expressing it.
  const byPct = o.minProtectedMarginPct != null ? (Math.max(0, Math.min(100, o.minProtectedMarginPct)) / 100) * price : 0;
  const byAbs = Math.max(0, o.minProtectedMarginPence || 0);
  const protectedMargin = Math.min(Math.max(byPct, byAbs), Math.max(0, contribution));

  const notes: string[] = [];
  if (contribution <= 0) notes.push(`This offer contributes ${contribution < 0 ? "less than nothing" : "nothing"} before any marketing: £${(price / 100).toFixed(2)} in, £${(variable / 100).toFixed(2)} of variable cost out. No acquisition budget can exist here — the problem is the offer, not the channel.`);
  if (byPct > 0 && byAbs > 0 && byPct !== byAbs) notes.push(`Two protection floors were given (£${(byAbs / 100).toFixed(2)} and ${o.minProtectedMarginPct}% = £${(byPct / 100).toFixed(2)}); the larger binds, because a floor that yields to the other is not a floor.`);
  if (Math.max(byPct, byAbs) > contribution) notes.push(`The protection asked for exceeds the whole contribution, so it has been capped at £${(Math.max(0, contribution) / 100).toFixed(2)} and the growth pool is zero. Nothing can be spent acquiring this customer.`);

  let pool = Math.max(0, contribution - protectedMargin);
  const ltvApplied = Boolean(o.ltvMultiple && o.ltvMultiple > 1);
  if (ltvApplied) {
    pool = round(pool * (o.ltvMultiple as number));
    notes.push(`Spending against ${o.ltvMultiple}× lifetime value, so the pool is larger than this single order can fund. That is borrowing against revenue that has not arrived — if repeat purchase does not materialise, the loss is real. Turn it off to spend only what this order supports.`);
  }

  return {
    pricePence: price,
    variableCostPence: variable,
    contributionPence: contribution,
    protectedMarginPence: round(protectedMargin),
    growthPoolPence: round(pool),
    contributionMarginPct: price > 0 ? pct(contribution / price) : 0,
    breakEvenRoas: contribution > 0 ? Math.round((price / contribution) * 100) / 100 : Infinity,
    minPermittedRoas: pool > 0 ? Math.round((price / pool) * 100) / 100 : Infinity,
    maxCpaPence: round(pool),
    ltvApplied,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Campaign limits
// ---------------------------------------------------------------------------
export type CampaignLimits = {
  maxCpaPence: number;
  maxCplPence: number;
  maxCreatorCommissionPence: number;
  maxTotalSpendPence: number;
  breakEvenRoas: number;
  minPermittedRoas: number;
  basis: string;
};

/**
 * What a campaign may spend, per unit and in total.
 *
 * `leadToSaleRate` is the customer's own observed rate. Without one, a lead
 * cannot be priced — so it returns zero rather than inventing a conversion rate
 * and pricing a lead against a number nobody measured.
 */
export function campaignLimits(e: Economics, input: {
  targetCustomers: number;
  leadToSaleRate?: number;
  platformFeeShare?: number;    // fraction of the pool MarketWar takes
  reserveShare?: number;        // fraction held back for refunds/fraud
}): CampaignLimits {
  const targets = Math.max(1, Math.round(input.targetCustomers || 1));
  const platformShare = clamp01(input.platformFeeShare ?? 0.2);
  const reserveShare = clamp01(input.reserveShare ?? 0.1);
  const creatorShare = Math.max(0, 1 - platformShare - reserveShare);

  const rate = input.leadToSaleRate;
  const maxCpl = rate && rate > 0 ? round(e.maxCpaPence * Math.min(1, rate)) : 0;

  return {
    maxCpaPence: e.maxCpaPence,
    maxCplPence: maxCpl,
    maxCreatorCommissionPence: round(e.growthPoolPence * creatorShare),
    maxTotalSpendPence: round(e.growthPoolPence * targets),
    breakEvenRoas: e.breakEvenRoas,
    minPermittedRoas: e.minPermittedRoas,
    basis: rate && rate > 0
      ? `A lead is worth at most ${pct(Math.min(1, rate))}% of a customer because that is the rate at which your leads become customers.`
      : "No lead price is set, because no lead-to-sale rate has been measured for this offer. Pricing a lead against an assumed conversion rate is how acquisition budgets disappear.",
  };
}

// ---------------------------------------------------------------------------
// Commission Waterfall™ — every transaction passes through it
// ---------------------------------------------------------------------------
export type Allocation = {
  creatorPence: number;
  platformPence: number;
  reservePence: number;
  squadPence: number;
};

export type WaterfallResult =
  | {
      ok: true;
      economics: Economics;
      allocation: Allocation;
      allocatedPence: number;
      unspentPence: number;
      merchantKeepsPence: number;
      lines: { label: string; pence: number; kind: "in" | "cost" | "protected" | "reward" }[];
      note: string;
    }
  | { ok: false; economics: Economics; error: string; overspendPence: number; hint: string };

/**
 * THE REJECTION THAT MATTERS.
 *
 * Any configuration where creator + platform + reserve + squad exceeds the
 * available acquisition margin is refused. Not warned about, not flagged amber —
 * refused, because by the time a campaign is running the creators have already
 * done the work and the money is already owed.
 */
export function waterfall(o: OfferEconomics, alloc: Allocation): WaterfallResult {
  const e = economicsFor(o);
  const allocated = Math.max(0, round(alloc.creatorPence)) + Math.max(0, round(alloc.platformPence))
    + Math.max(0, round(alloc.reservePence)) + Math.max(0, round(alloc.squadPence));

  if (allocated > e.growthPoolPence) {
    const over = allocated - e.growthPoolPence;
    return {
      ok: false, economics: e,
      overspendPence: over,
      error: `This pays out £${(allocated / 100).toFixed(2)} per sale and only £${(e.growthPoolPence / 100).toFixed(2)} is available. It is £${(over / 100).toFixed(2)} into your protected margin.`,
      hint: e.growthPoolPence <= 0
        ? "There is no acquisition budget in this offer at all. Raise the price, cut a variable cost, or lower the margin you are protecting — a campaign cannot create money that the unit economics do not contain."
        : `Reduce the rewards to £${(e.growthPoolPence / 100).toFixed(2)} or less, or lower the protected margin deliberately. The creator never reaches the protected margin, which is the point of it.`,
    };
  }

  const unspent = e.growthPoolPence - allocated;
  return {
    ok: true, economics: e,
    allocation: {
      creatorPence: round(alloc.creatorPence), platformPence: round(alloc.platformPence),
      reservePence: round(alloc.reservePence), squadPence: round(alloc.squadPence),
    },
    allocatedPence: allocated,
    unspentPence: unspent,
    merchantKeepsPence: e.protectedMarginPence + unspent,
    lines: [
      { label: "Customer pays", pence: e.pricePence, kind: "in" },
      { label: "Variable costs", pence: -e.variableCostPence, kind: "cost" },
      { label: "Contribution before marketing", pence: e.contributionPence, kind: "in" },
      { label: "Protected margin — never available to a creator", pence: -e.protectedMarginPence, kind: "protected" },
      { label: "Available growth pool", pence: e.growthPoolPence, kind: "in" },
      { label: "Creator", pence: -round(alloc.creatorPence), kind: "reward" },
      { label: "MarketWar", pence: -round(alloc.platformPence), kind: "reward" },
      { label: "Squad / referral", pence: -round(alloc.squadPence), kind: "reward" },
      { label: "Refund & fraud reserve", pence: -round(alloc.reservePence), kind: "reward" },
      { label: "Merchant keeps", pence: e.protectedMarginPence + unspent, kind: "in" },
    ],
    note: `The business keeps £${((e.protectedMarginPence + unspent) / 100).toFixed(2)} of a £${(e.pricePence / 100).toFixed(2)} order — its protected £${(e.protectedMarginPence / 100).toFixed(2)} plus £${(unspent / 100).toFixed(2)} the campaign did not need.`,
  };
}

// ---------------------------------------------------------------------------
// IncrementalityGuard™
//
// Two separate things live here and conflating them is the trap.
//
//   CLASSIFICATION is knowable: whether this buyer has bought before, and how
//   recently, is a fact in the customer vault. Paying less for a customer who
//   was already active is a sound rule and it prevents obvious margin leakage.
//
//   INCREMENTALITY is not knowable from classification. A brand-new customer may
//   have been about to buy anyway. The only way to know is a HOLDOUT — a share
//   of the audience deliberately not exposed — and without one this module will
//   not use the word.
// ---------------------------------------------------------------------------
export type CustomerClass = "new" | "returning_inactive" | "existing_active" | "organic" | "self_referral";

export type ClassPolicy = { id: CustomerClass; label: string; rewardMultiplier: number; why: string };

export const DEFAULT_CLASS_POLICY: ClassPolicy[] = [
  { id: "new", label: "New customer", rewardMultiplier: 1, why: "Never bought before. The full reward — this is the customer the campaign exists to find." },
  { id: "returning_inactive", label: "Returning after a long gap", rewardMultiplier: 0.5, why: "Bought before but had gone quiet. Waking them is worth paying for, but less than finding someone new." },
  { id: "existing_active", label: "Already an active customer", rewardMultiplier: 0.1, why: "Bought recently and was coming back regardless. Paying full commission here is paying for a sale you already had." },
  { id: "organic", label: "Arrived without the creator's link", rewardMultiplier: 0, why: "No attribution to pay against." },
  { id: "self_referral", label: "The creator's own purchase", rewardMultiplier: 0, why: "Buying through your own link is not a referral." },
];

export function classifyCustomer(input: {
  hasPurchasedBefore: boolean;
  daysSinceLastPurchase?: number | null;
  cameViaCreatorLink: boolean;
  buyerMatchesCreator: boolean;
  /** Past this many days without buying, a returning customer counts as woken. */
  inactiveAfterDays?: number;
}): CustomerClass {
  if (input.buyerMatchesCreator) return "self_referral";
  if (!input.cameViaCreatorLink) return "organic";
  if (!input.hasPurchasedBefore) return "new";
  const gap = input.daysSinceLastPurchase ?? 0;
  return gap >= (input.inactiveAfterDays ?? 180) ? "returning_inactive" : "existing_active";
}

export function rewardFor(baseRewardPence: number, cls: CustomerClass, policy: ClassPolicy[] = DEFAULT_CLASS_POLICY): { pence: number; policy: ClassPolicy } {
  const p = policy.find((x) => x.id === cls) || DEFAULT_CLASS_POLICY[3];
  return { pence: round(Math.max(0, baseRewardPence) * p.rewardMultiplier), policy: p };
}

/**
 * Lift, and the refusal to claim it without a holdout.
 *
 * With a holdout the comparison is real: conversion among those who saw the
 * campaign against those who did not. Without one, what exists is attributed
 * revenue, and this says so rather than relabelling it.
 */
export type LiftResult = {
  measured: boolean;
  liftPct: number | null;
  incrementalSales: number | null;
  headline: string;
  caveat: string;
};

export function measuredLift(input: {
  exposed: number; exposedSales: number;
  holdout: number; holdoutSales: number;
}): LiftResult {
  const { exposed, exposedSales, holdout, holdoutSales } = input;
  // A holdout of a handful of people measures noise. 300 a side is the point at
  // which a few percentage points of difference stops being coin-flipping.
  if (!holdout || holdout < 300 || !exposed || exposed < 300) {
    return {
      measured: false, liftPct: null, incrementalSales: null,
      headline: `${exposedSales} sales attributed to the campaign.`,
      caveat: holdout
        ? `A holdout exists but is too small to measure lift (${holdout} held out, ${exposed} exposed — 300 a side is the minimum). These are attributed sales, not proven incremental ones.`
        : "No holdout is configured, so these are ATTRIBUTED sales — the campaign was credited with them. Whether they would have happened anyway is not knowable without holding part of the audience back. Configure a holdout to find out.",
    };
  }
  const eRate = exposedSales / exposed;
  const hRate = holdoutSales / holdout;
  const lift = hRate > 0 ? (eRate - hRate) / hRate : eRate > 0 ? Infinity : 0;
  const incremental = Math.round((eRate - hRate) * exposed);
  return {
    measured: true,
    liftPct: Number.isFinite(lift) ? pct(lift) : null,
    incrementalSales: incremental,
    headline: incremental > 0
      ? `${incremental} incremental sales — ${exposedSales} among ${exposed} exposed at ${pct(eRate)}%, against ${pct(hRate)}% among ${holdout} held back.`
      : `No measurable lift: the exposed group converted at ${pct(eRate)}% and the holdout at ${pct(hRate)}%. The campaign is being credited with sales that were happening anyway.`,
    caveat: "Measured against a real holdout, so 'incremental' is earned here rather than assumed.",
  };
}

// ---------------------------------------------------------------------------
// The Kill Switch
// ---------------------------------------------------------------------------
export type CampaignHealth = {
  spendPence: number;
  revenuePence: number;
  customers: number;
  leads: number;
  refundRatePct: number;
  fraudRatePct: number;
  budgetPence: number;
  /** Conversion rate now against the campaign's own earlier rate. */
  conversionRateNow?: number;
  conversionRateBaseline?: number;
};

export type Trip = { id: string; tripped: boolean; severity: "pause" | "throttle" | "note"; what: string; action: string };

export type KillSwitchResult = {
  trips: Trip[];
  verdict: "running" | "throttled" | "paused";
  throttlePct: number;
  message: string;
};

export const MAX_REFUND_RATE_PCT = 12;
export const MAX_FRAUD_RATE_PCT = 3;

export function killSwitch(e: Economics, h: CampaignHealth, limits: CampaignLimits): KillSwitchResult {
  const cpa = h.customers > 0 ? h.spendPence / h.customers : 0;
  const roas = h.spendPence > 0 ? h.revenuePence / h.spendPence : Infinity;
  const convDrop = h.conversionRateBaseline && h.conversionRateNow != null && h.conversionRateBaseline > 0
    ? 1 - h.conversionRateNow / h.conversionRateBaseline : 0;

  const trips: Trip[] = [
    { id: "cpa", tripped: h.customers >= 5 && cpa > limits.maxCpaPence, severity: "throttle",
      what: `Cost per customer is £${(cpa / 100).toFixed(2)} against a safe maximum of £${(limits.maxCpaPence / 100).toFixed(2)}.`,
      action: "Creator acquisition is reduced until it comes back inside the ceiling." },
    { id: "roas", tripped: h.spendPence > 0 && h.customers >= 5 && roas < e.minPermittedRoas, severity: "pause",
      what: `Return on spend is ${roas.toFixed(2)}× against a minimum of ${e.minPermittedRoas.toFixed(2)}×. Below that the protected margin is being consumed.`,
      action: "Paused. Nothing further accrues until the economics or the offer change." },
    { id: "margin", tripped: e.growthPoolPence <= 0, severity: "pause",
      what: "This offer has no acquisition budget at all once its costs and protected margin are taken out.",
      action: "Paused. No configuration of rewards can be funded from it." },
    { id: "budget", tripped: h.budgetPence > 0 && h.spendPence >= h.budgetPence, severity: "pause",
      what: `The campaign budget of £${(h.budgetPence / 100).toFixed(2)} is spent.`,
      action: "Paused. Raise the budget to continue." },
    { id: "refunds", tripped: h.refundRatePct > MAX_REFUND_RATE_PCT, severity: "pause",
      what: `${h.refundRatePct.toFixed(1)}% of orders were refunded, against a ${MAX_REFUND_RATE_PCT}% threshold. Commission paid on refunded orders is money out with no revenue behind it.`,
      action: "Paused, and unsettled commission stays unsettled while it is investigated." },
    { id: "fraud", tripped: h.fraudRatePct > MAX_FRAUD_RATE_PCT, severity: "pause",
      what: `${h.fraudRatePct.toFixed(1)}% of conversions were flagged as fraudulent, against a ${MAX_FRAUD_RATE_PCT}% threshold.`,
      action: "Paused pending review." },
    { id: "conversion_quality", tripped: convDrop > 0.4, severity: "throttle",
      what: `Conversion has fallen ${Math.round(convDrop * 100)}% against this campaign's own earlier rate.`,
      action: "Throttled — the traffic arriving now is worth materially less than the traffic that set the price." },
  ];

  const hit = trips.filter((t) => t.tripped);
  const paused = hit.some((t) => t.severity === "pause");
  const throttled = hit.some((t) => t.severity === "throttle");
  // How hard to throttle: enough to bring CPA back under the ceiling.
  const throttlePct = throttled && cpa > 0 && limits.maxCpaPence > 0
    ? Math.min(80, Math.max(10, Math.round((1 - limits.maxCpaPence / cpa) * 100)))
    : 0;

  return {
    trips,
    verdict: paused ? "paused" : throttled ? "throttled" : "running",
    throttlePct: paused ? 100 : throttlePct,
    message: paused
      ? `ProfitGuard intervention — campaign paused. ${hit.filter((t) => t.severity === "pause").map((t) => t.what).join(" ")}`
      : throttled
        ? `ProfitGuard intervention. ${hit.filter((t) => t.severity === "throttle").map((t) => t.what).join(" ")} Creator acquisition reduced by ${throttlePct}%.`
        : "Within every limit. Nothing to do.",
  };
}

// ---------------------------------------------------------------------------
// Dynamic creator commission
//
// NOT an optimiser pretending to know a response curve nobody has measured.
// This is a CONTROLLER: it compares the CPA actually being paid against the
// ceiling, and moves the reward toward the headroom that exists. It will not
// move at all below a real volume, because adjusting a price on four
// conversions is reacting to noise.
// ---------------------------------------------------------------------------
export const MIN_CONVERSIONS_TO_TUNE = 20;

export function tuneCommission(input: {
  currentRewardPence: number;
  limits: CampaignLimits;
  conversions: number;
  spendPence: number;
}): { rewardPence: number; changed: boolean; reason: string } {
  const { currentRewardPence, limits, conversions, spendPence } = input;
  const ceiling = limits.maxCreatorCommissionPence;

  if (currentRewardPence > ceiling) {
    return { rewardPence: ceiling, changed: true, reason: `Reduced to the ceiling of £${(ceiling / 100).toFixed(2)} — the reward was above what this offer's margin can fund.` };
  }
  if (conversions < MIN_CONVERSIONS_TO_TUNE) {
    return { rewardPence: currentRewardPence, changed: false, reason: `Left alone: ${conversions} conversion(s) is not enough to tell a trend from noise. It moves after ${MIN_CONVERSIONS_TO_TUNE}.` };
  }

  const cpa = conversions > 0 ? spendPence / conversions : 0;
  const headroom = limits.maxCpaPence > 0 ? 1 - cpa / limits.maxCpaPence : 0;

  // Comfortably inside the ceiling → there is room to pay creators more and
  // attract more of them, and the business still keeps its protected margin.
  if (headroom > 0.35) {
    const next = Math.min(ceiling, round(currentRewardPence * 1.15));
    return next > currentRewardPence
      ? { rewardPence: next, changed: true, reason: `Raised to £${(next / 100).toFixed(2)}. You are acquiring at £${(cpa / 100).toFixed(2)} against a ceiling of £${(limits.maxCpaPence / 100).toFixed(2)}, so there is room to pay more and still keep the protected margin.` }
      : { rewardPence: currentRewardPence, changed: false, reason: "Already at the ceiling this offer can fund." };
  }
  // Running close to the ceiling → come down before the kill switch does it.
  if (headroom < 0.1) {
    const next = Math.max(1, round(currentRewardPence * 0.85));
    return { rewardPence: next, changed: true, reason: `Reduced to £${(next / 100).toFixed(2)}. Acquisition is at £${(cpa / 100).toFixed(2)} against a ceiling of £${(limits.maxCpaPence / 100).toFixed(2)} — trimming now is cheaper than being paused.` };
  }
  return { rewardPence: currentRewardPence, changed: false, reason: `Held. £${(cpa / 100).toFixed(2)} per customer sits comfortably inside the £${(limits.maxCpaPence / 100).toFixed(2)} ceiling.` };
}

// ---------------------------------------------------------------------------
// Funding mode — Revenue-Locked Rewards™ and Business Survival Mode™
// ---------------------------------------------------------------------------
export type FundingMode = "prepaid" | "revenue_locked";

export type FundingPolicy = {
  mode: FundingMode;
  /** Days after payment before commission settles — the refund window. */
  settlementDays: number;
  /** Pay half on payment and half after the cancellation window. */
  splitSettlement: boolean;
  label: string;
  meaning: string;
};

export const FUNDING_MODES: FundingPolicy[] = [
  {
    mode: "revenue_locked", settlementDays: 30, splitSettlement: false,
    label: "Cash-Protected Growth (Revenue-Locked)",
    meaning: "Nothing is paid before the customer's money has arrived. Commission is funded out of the transaction it came from, so a shop with no marketing budget can still activate hundreds of creators. Earnings show as pending until the refund window closes.",
  },
  {
    mode: "prepaid", settlementDays: 14, splitSettlement: false,
    label: "Prepaid budget",
    meaning: "The business funds the campaign up front. Needed for rewards that are not tied to a sale — clicks, leads, content — because there is no transaction to fund them from.",
  },
];

/** Is this reward payable yet, given how it was funded and where the order is? */
export function settlementState(input: {
  policy: FundingPolicy;
  paidAt: string | null;
  refunded: boolean;
  chargedBack: boolean;
  nowISO: string;
}): { state: "unfunded" | "pending" | "part_settled" | "settled" | "void"; payablePct: number; why: string } {
  if (input.refunded || input.chargedBack) {
    return { state: "void", payablePct: 0, why: "The order was refunded or charged back, so the commission never becomes payable. There is no revenue behind it." };
  }
  if (input.policy.mode === "revenue_locked" && !input.paidAt) {
    return { state: "unfunded", payablePct: 0, why: "The customer has not paid yet. In Cash-Protected Growth nothing accrues until their money has arrived." };
  }
  const from = input.paidAt ? new Date(input.paidAt).getTime() : Date.now();
  const days = (new Date(input.nowISO).getTime() - from) / 86_400_000;
  if (days >= input.policy.settlementDays) {
    return { state: "settled", payablePct: 100, why: `The ${input.policy.settlementDays}-day refund window has closed.` };
  }
  if (input.policy.splitSettlement) {
    return { state: "part_settled", payablePct: 50, why: `Half released on payment; the rest settles when the ${input.policy.settlementDays}-day cancellation window closes.` };
  }
  return { state: "pending", payablePct: 0, why: `Held until the ${input.policy.settlementDays}-day refund window closes on this order.` };
}

// ---------------------------------------------------------------------------
// The owner's dashboard — profit first
// ---------------------------------------------------------------------------
export function campaignProfit(input: {
  economics: Economics;
  customers: number;
  revenuePence: number;
  creatorPayoutsPence: number;
  platformFeePence: number;
  lift?: LiftResult;
}) {
  const { economics: e, customers, revenuePence, creatorPayoutsPence, platformFeePence } = input;
  const grossProfit = round(revenuePence * (e.contributionMarginPct / 100));
  const spend = creatorPayoutsPence + platformFeePence;
  const retained = grossProfit - spend;
  const perPound = spend > 0 ? Math.round((retained / spend) * 100) / 100 : null;
  const proven = input.lift?.measured === true;
  const word = proven ? "incremental" : "attributed";

  return {
    label: word,
    revenuePence, grossProfitPence: grossProfit,
    creatorPayoutsPence, platformFeePence,
    retainedContributionPence: retained,
    customers,
    returnPerPound: perPound,
    headline: `£${(revenuePence / 100).toLocaleString("en-GB")} ${word} revenue · £${(grossProfit / 100).toLocaleString("en-GB")} ${word} gross profit · £${(spend / 100).toLocaleString("en-GB")} spent · £${(retained / 100).toLocaleString("en-GB")} contribution retained.`,
    perPoundLine: perPound == null
      ? "Nothing has been spent yet."
      : `Every £1 spent through SHARE2EARN produced £${perPound.toFixed(2)} of ${word} contribution.`,
    caveat: proven
      ? (input.lift?.caveat || "")
      : "These are ATTRIBUTED figures — the campaign was credited with these sales. Without a holdout there is no way to know how many would have happened anyway, so this is not a measure of incremental profit and must not be read as one.",
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const PROFIT_GUARD_DOCTRINE = [
  "Creators earn from the value they create — never from the survival margin of the business. The order is fixed: revenue, then variable costs, then the margin you protect, and only what is left can fund acquisition.",
  "The protected margin has no override. A floor that can be switched off in a hurry is not a floor, and the hurry is exactly when it gets switched off.",
  "Any reward configuration that exceeds the available pool is refused rather than warned about. By the time a campaign is running the creators have done the work and the money is owed.",
  "A lead is only priced when a lead-to-sale rate has actually been measured. Pricing one against an assumed conversion rate is how acquisition budgets disappear.",
  "\"Incremental\" requires a holdout. Without one these are ATTRIBUTED figures, and the product says so — a CFO who catches it calling attributed revenue incremental once will never trust another number on the screen.",
  "Commission is tuned by a controller, not an optimiser: it moves toward the headroom that actually exists, and does not move at all below 20 conversions, because adjusting a price on four is reacting to noise.",
];

// ---------------------------------------------------------------------------
// GrowthGuard™ — the 5% law
//
// Owner ruling: the total cost of SHARE2EARN must never exceed 5% of the
// verified economic value it generates. Not a default, not a setting — an
// absolute system ceiling. There is no parameter here that raises it, because a
// ceiling a merchant can nudge upward in a good week is not a ceiling.
//
//   Allowed rate = MIN(5%, the rate this merchant's own economics can survive)
//
// So a SaaS business may run at the full 5%, a restaurant at 2%, a supermarket
// at well under 1% — and none of them has to work that out for themselves.
//
// THE MODULE EARNS BEFORE IT SPENDS. Capacity is created by verified
// transactions, one at a time. Generate nothing and the performance-funded
// budget is nothing; there is no starting balance to burn through.
//
// ── THE BASIS, AND A DISCREPANCY WORTH NAMING ──────────────────────────────
//
// The instruction says the 5% is computed "against verified incremental
// contribution generated, not simply gross sales" — and separately gives an
// example where a £100 purchase yields £5 of allowance, which is 5% of REVENUE.
// Those are different numbers on any offer that does not have a 100% margin.
//
// This implements the PRINCIPLE (contribution), because it is the stricter of
// the two and it is the one that protects a thin-margin business: 5% of the
// revenue of a supermarket basket would be most of its profit. The
// revenue-equivalent is reported alongside so the difference is visible rather
// than buried, and `basis` switches it in one place if the owner wants the
// looser reading.

/** The absolute ceiling. Deliberately not a parameter anywhere. */
export const GROWTHGUARD_CEILING = 0.05;

export type ValueBasis = "contribution" | "revenue";

/**
 * The share of contribution this merchant's own economics can survive.
 *
 * The growth pool over the contribution it came out of — i.e. how much of each
 * pound of margin is genuinely available to acquisition once the protected
 * margin is set aside.
 */
export function merchantSafeRate(e: Economics): number {
  if (e.contributionPence <= 0) return 0;
  return Math.max(0, Math.min(1, e.growthPoolPence / e.contributionPence));
}

export type AllowedRate = {
  rate: number;
  ceiling: number;
  merchantSafe: number;
  binding: "growthguard" | "merchant" | "none";
  why: string;
};

export function allowedRate(e: Economics, survivalFloorPct?: number): AllowedRate {
  const safe = merchantSafeRate(e);
  // Lock 3 — the Survival Floor. The merchant names the share of contribution it
  // must retain; anything that would break it reduces spend further, even when
  // the 5% has not been reached.
  const floor = survivalFloorPct != null ? Math.max(0, 1 - clamp01(survivalFloorPct / 100)) : 1;
  const merchantCap = Math.min(safe, floor);
  const rate = Math.min(GROWTHGUARD_CEILING, merchantCap);
  const binding = rate === 0 ? "merchant"
    : merchantCap < GROWTHGUARD_CEILING ? "merchant" : "growthguard";
  return {
    rate, ceiling: GROWTHGUARD_CEILING, merchantSafe: merchantCap, binding,
    why: rate === 0
      ? "This offer supports no reward spend at all once its costs and the margin you protect are taken out."
      : binding === "growthguard"
        ? `Your economics could support ${pct(merchantCap)}%, but GrowthGuard caps the whole module at ${pct(GROWTHGUARD_CEILING)}% of the value it generates. The lower number wins, always.`
        : `GrowthGuard allows up to ${pct(GROWTHGUARD_CEILING)}%, but your economics safely support only ${pct(merchantCap)}%${survivalFloorPct != null && floor < safe ? ` once your ${survivalFloorPct}% survival floor is respected` : ""}. MarketWar uses the lower number without being asked.`,
  };
}

export type RewardCapacity = {
  generatedPence: number;
  basis: ValueBasis;
  ratePct: number;
  maxSpendPence: number;
  committedPence: number;
  availablePence: number;
  merchantRetainsPence: number;
  equivalentPctOfRevenue: number | null;
  measured: boolean;
  headline: string;
  caveat: string;
};

/**
 * Real-Time Reward Capacity™ — what the module is allowed to owe, right now.
 *
 * `verifiedContributionPence` is contribution from transactions that have
 * SETTLED and not been refunded. Pending money creates no capacity, because a
 * reward funded by an order that later reverses is a reward paid out of the
 * merchant's own pocket.
 */
export function rewardCapacity(input: {
  e: Economics;
  verifiedContributionPence: number;
  verifiedRevenuePence?: number;
  committedPence: number;
  survivalFloorPct?: number;
  basis?: ValueBasis;
  lift?: LiftResult;
}): RewardCapacity {
  const basis = input.basis ?? "contribution";
  const allowed = allowedRate(input.e, input.survivalFloorPct);
  const generated = Math.max(0, round(
    basis === "contribution" ? input.verifiedContributionPence : (input.verifiedRevenuePence ?? input.verifiedContributionPence),
  ));
  const maxSpend = round(generated * allowed.rate);
  const committed = Math.max(0, round(input.committedPence));
  const available = Math.max(0, maxSpend - committed);
  const measured = input.lift?.measured === true;
  const word = measured ? "incremental" : "attributed";

  return {
    generatedPence: generated,
    basis,
    ratePct: pct(allowed.rate),
    maxSpendPence: maxSpend,
    committedPence: committed,
    availablePence: available,
    merchantRetainsPence: Math.max(0, generated - maxSpend),
    equivalentPctOfRevenue: input.verifiedRevenuePence && input.verifiedRevenuePence > 0
      ? pct(maxSpend / input.verifiedRevenuePence) : null,
    measured,
    headline: `£${(generated / 100).toLocaleString("en-GB")} of ${word} ${basis} generated · £${(maxSpend / 100).toLocaleString("en-GB")} maximum spend at ${pct(allowed.rate)}% · £${(committed / 100).toLocaleString("en-GB")} committed · £${(available / 100).toLocaleString("en-GB")} of reward capacity left · you keep £${(Math.max(0, generated - maxSpend) / 100).toLocaleString("en-GB")}.`,
    caveat: [
      allowed.why,
      measured
        ? "Capacity is computed on measured incremental contribution, against a real holdout."
        : "Capacity is computed on ATTRIBUTED contribution — the module was credited with these sales. Without a holdout there is no way to know how many would have happened anyway, so this is the more generous reading. Configure a holdout and the capacity becomes stricter and truer.",
      "Generate nothing and the performance-funded budget is nothing. There is no starting balance to burn through.",
    ].join(" "),
  };
}

/** One settled transaction's worth of new capacity. This is how the pool grows. */
export function capacityFromTransaction(e: Economics, survivalFloorPct?: number): { pence: number; note: string } {
  const allowed = allowedRate(e, survivalFloorPct);
  const pence = round(Math.max(0, e.contributionPence) * allowed.rate);
  return {
    pence,
    note: `This sale contributes £${(Math.max(0, e.contributionPence) / 100).toFixed(2)}, so it adds £${(pence / 100).toFixed(2)} of reward capacity at ${pct(allowed.rate)}%. The other £${((Math.max(0, e.contributionPence) - pence) / 100).toFixed(2)} stays with the merchant.`,
  };
}

/**
 * How the allowance is divided — the owner's split, as shares of whatever
 * capacity exists rather than fixed amounts.
 *
 * From £500 of allowance: £300 creators, £75 MarketWar, £50 referral/squad,
 * £50 refund and fraud reserve, £25 performance bonuses.
 */
export const CAPACITY_SPLIT = [
  { id: "creator", label: "Creators", share: 0.6 },
  { id: "platform", label: "MarketWar", share: 0.15 },
  { id: "referral", label: "Referral & squad", share: 0.1 },
  { id: "reserve", label: "Refund & fraud reserve", share: 0.1 },
  { id: "bonus", label: "Performance bonuses", share: 0.05 },
] as const;

export function splitCapacity(availablePence: number): { id: string; label: string; pence: number }[] {
  const total = Math.max(0, round(availablePence));
  const rows = CAPACITY_SPLIT.map((s) => ({ id: s.id, label: s.label, pence: round(total * s.share) }));
  // Rounding must never invent a penny of liability beyond the ceiling.
  const drift = rows.reduce((a, r) => a + r.pence, 0) - total;
  if (drift !== 0 && rows.length) rows[0].pence = Math.max(0, rows[0].pence - drift);
  return rows;
}

/**
 * The gate every new commitment passes.
 *
 * "MarketWar must never create another £1 of liability once that ceiling is
 * reached" — so this refuses rather than warns, exactly like the waterfall.
 */
export function canCommit(capacity: RewardCapacity, wantPence: number): { ok: boolean; grantedPence: number; why: string } {
  const want = Math.max(0, round(wantPence));
  if (want <= capacity.availablePence) {
    return { ok: true, grantedPence: want, why: `£${(want / 100).toFixed(2)} committed against £${(capacity.availablePence / 100).toFixed(2)} of capacity.` };
  }
  return {
    ok: false,
    grantedPence: capacity.availablePence,
    why: capacity.availablePence <= 0
      ? `No reward capacity. SHARE2EARN has generated £${(capacity.generatedPence / 100).toFixed(2)} of verified value, and its ${capacity.ratePct}% allowance is already fully committed. Capacity returns as soon as the next transaction settles — the module earns before it spends.`
      : `£${(want / 100).toFixed(2)} was requested and £${(capacity.availablePence / 100).toFixed(2)} of capacity remains. Rewards are capped at ${capacity.ratePct}% of the value generated, so the rest cannot be promised until more value exists.`,
  };
}

export const GROWTHGUARD_DOCTRINE = [
  `The whole module costs at most ${pct(GROWTHGUARD_CEILING)}% of the value it generates — creator rewards, referral and squad bonuses, incentives, reserve and MarketWar's fee, all of it inside that one number. You keep at least ${pct(1 - GROWTHGUARD_CEILING)}%.`,
  "It is a system ceiling, not a setting. There is no parameter that raises it, because a ceiling that can be nudged upward in a good week is not a ceiling.",
  "The rate used is the LOWER of that ceiling and what your own economics can survive. A SaaS business may run at the full rate; a supermarket will run at a fraction of it, and neither has to work that out.",
  "Capacity is created by settled transactions, one at a time. Generate nothing and the performance-funded budget is nothing — there is no starting balance to burn through.",
  "Once the ceiling is reached no further liability is created. A creator is told what they can earn UP TO from verified results, never promised a figure the results have not funded.",
];
