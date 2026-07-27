// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Fully-loaded unit economics — what an action ACTUALLY costs us.
//
// The 4x markup only ever covered the AI provider bill. It ignored everything
// else the business pays to deliver that action:
//   • Google Cloud / Firebase — Firestore reads+writes, Storage, egress
//   • Vercel — function execution, bandwidth, build minutes
//   • Stripe — 1.5% + 20p on every UK payment that funds the wallet
//   • Platform overhead — domains, email infra, monitoring, support time
//
// Charging 4x provider cost while absorbing those silently means the true margin
// is far below the headline. This module computes the LOADED cost per action and
// the markup actually required to clear the owner's floor:
//
//   OWNER LAW: net profit >= 100% of fully-loaded cost  (price >= 2x TOTAL cost)
//
// Every figure here is our internal cost and is NEVER exposed to a customer.

import { ACU_PER_GBP } from "@/backend/subscription";

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// The cost stack (GBP). Tune these as real invoices come in — every downstream
// price re-derives automatically.
// ---------------------------------------------------------------------------
export const COST_STACK = {
  // Infrastructure attributable to ONE metered action: a few Firestore
  // reads/writes, a function invocation, some egress. Storage-heavy actions add
  // their own weight below.
  infraPerActionGbp: 0.0015,

  // Extra infra for actions that persist a large artifact (image/video/page).
  storagePerArtifactGbp: 0.0020,

  // Stripe: 1.5% + £0.20 per transaction (UK cards). Charged when the customer
  // TOPS UP or pays a subscription, so it is amortised across the ACUs that
  // payment buys — not charged per action.
  stripePct: 0.015,
  stripeFixedGbp: 0.20,

  // Platform overhead as a share of revenue: domains, email infra, monitoring,
  // error tracking, support time, the free tier that never converts.
  overheadPct: 0.12,

  // Failed/retried work we absorb (a provider 500, a regenerate). Real cost with
  // no revenue attached.
  wastagePct: 0.05,
} as const;

// The owner's floor, restated against TOTAL cost rather than provider cost.
export const NET_PROFIT_FLOOR = 1.0; // 100% profit => price >= 2x loaded cost

export type LoadedCost = {
  providerCostGbp: number;
  infraGbp: number;
  storageGbp: number;
  paymentGbp: number;      // amortised Stripe share
  overheadGbp: number;
  wastageGbp: number;
  loadedCostGbp: number;   // everything above
};

// Amortised Stripe cost per £1 of ACU value, given the typical top-up size. A
// small top-up carries the 20p fixed fee across few ACUs, so it costs us more
// per ACU than a large one — worth knowing when setting minimum top-ups.
export function paymentCostPerGbp(typicalPaymentGbp = 49): number {
  if (typicalPaymentGbp <= 0) return 0;
  const fee = typicalPaymentGbp * COST_STACK.stripePct + COST_STACK.stripeFixedGbp;
  return round4(fee / typicalPaymentGbp);
}

// What one action truly costs us, all-in.
export function loadedCost(input: {
  providerCostGbp: number;
  retailGbp: number;          // what we intend to charge, for %-of-revenue costs
  persistsArtifact?: boolean;
  typicalPaymentGbp?: number;
}): LoadedCost {
  const provider = Math.max(0, input.providerCostGbp);
  const infra = COST_STACK.infraPerActionGbp;
  const storage = input.persistsArtifact ? COST_STACK.storagePerArtifactGbp : 0;
  const payment = Math.max(0, input.retailGbp) * paymentCostPerGbp(input.typicalPaymentGbp);
  const overhead = Math.max(0, input.retailGbp) * COST_STACK.overheadPct;
  const wastage = provider * COST_STACK.wastagePct;
  const total = provider + infra + storage + payment + overhead + wastage;
  return {
    providerCostGbp: round4(provider), infraGbp: round4(infra), storageGbp: round4(storage),
    paymentGbp: round4(payment), overheadGbp: round4(overhead), wastageGbp: round4(wastage),
    loadedCostGbp: round4(total),
  };
}

export type PriceVerdict = {
  retailGbp: number;
  retailAcus: number;
  loaded: LoadedCost;
  netProfitGbp: number;
  netProfitPct: number;      // profit as a % of loaded cost — the owner's metric
  grossMarginPct: number;    // profit as a % of revenue
  meetsFloor: boolean;
  note: string;
};

// Does a given price clear "100% profit on fully-loaded cost"?
export function verdictForPrice(input: {
  providerCostGbp: number;
  retailAcus: number;
  persistsArtifact?: boolean;
  typicalPaymentGbp?: number;
}): PriceVerdict {
  const retailGbp = input.retailAcus / ACU_PER_GBP;
  const loaded = loadedCost({ providerCostGbp: input.providerCostGbp, retailGbp, persistsArtifact: input.persistsArtifact, typicalPaymentGbp: input.typicalPaymentGbp });
  const net = retailGbp - loaded.loadedCostGbp;
  const netPct = loaded.loadedCostGbp > 0 ? round2((net / loaded.loadedCostGbp) * 100) : 0;
  const grossPct = retailGbp > 0 ? round2((net / retailGbp) * 100) : 0;
  const meets = net > 0 && netPct >= NET_PROFIT_FLOOR * 100;
  return {
    retailGbp: round4(retailGbp), retailAcus: input.retailAcus, loaded,
    netProfitGbp: round4(net), netProfitPct: netPct, grossMarginPct: grossPct, meetsFloor: meets,
    note: meets
      ? `Clears the floor: ${netPct}% net profit on fully-loaded cost (${grossPct}% gross margin).`
      : `BELOW FLOOR: ${netPct}% net profit on fully-loaded cost — the owner's law requires at least ${NET_PROFIT_FLOOR * 100}%. Raise the price or cut the cost base.`,
  };
}

// The minimum ACUs that clear the floor for a given provider cost. Solves for
// price directly, because the %-of-revenue costs (payment, overhead) scale WITH
// the price — a naive "cost x 2" undershoots.
//
//   price = 2 * (provider + infra + storage + wastage + price*(pay + overhead))
//   price * (1 - 2*(pay + overhead)) = 2 * fixedCosts
export function minimumAcusFor(input: {
  providerCostGbp: number;
  persistsArtifact?: boolean;
  typicalPaymentGbp?: number;
}): { minAcus: number; minRetailGbp: number; impossible: boolean; note: string } {
  const provider = Math.max(0, input.providerCostGbp);
  const fixed = provider + COST_STACK.infraPerActionGbp
    + (input.persistsArtifact ? COST_STACK.storagePerArtifactGbp : 0)
    + provider * COST_STACK.wastagePct;
  const variableRate = paymentCostPerGbp(input.typicalPaymentGbp) + COST_STACK.overheadPct;
  const multiple = 1 + NET_PROFIT_FLOOR; // 2x
  const denom = 1 - multiple * variableRate;
  if (denom <= 0) {
    return { minAcus: 0, minRetailGbp: 0, impossible: true, note: `Percentage costs (${round2(variableRate * 100)}% of revenue) are too high to ever reach ${NET_PROFIT_FLOOR * 100}% net profit. Cut overhead or payment fees.` };
  }
  const minRetail = (multiple * fixed) / denom;
  const minAcus = Math.ceil(minRetail * ACU_PER_GBP);
  return {
    minAcus, minRetailGbp: round4(minRetail), impossible: false,
    note: `At least ${minAcus} ACUs (£${round2(minRetail)}) to clear ${NET_PROFIT_FLOOR * 100}% net profit once infra, Stripe, overhead and wastage are included.`,
  };
}
