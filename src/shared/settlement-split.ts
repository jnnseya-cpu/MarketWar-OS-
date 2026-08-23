// WHO GETS WHICH PENNY OF ONE PAID ORDER.
//
// The commercial model was already decided and built: `netEligibleValue` says
// what a commission may be computed on, `saleCommissionPence` says how much,
// `settlementState` says when it becomes payable, and ProfitGuard caps it at a
// share of the growth pool so the brand's protected margin is never reachable.
//
// What did not exist is the step where money actually moves. `reservedPence` was
// a number written on a mission record — nothing held it, nothing collected it,
// and the public mission card told creators it was "money that already exists".
// This is the arithmetic that Stripe Connect will carry out: for one order that
// has been paid, how much is the creator's, how much is the platform's, and how
// much is remitted to the brand.
//
// THE LAW OF THIS FILE: MONEY IS NEITHER INVENTED NOR LOST.
//
//     creator + platform + brand === gross, exactly, always.
//
// Percentages of pennies do not divide evenly, and the natural instinct is to
// round each share separately — which silently creates or destroys a penny per
// order. Across a million orders that is a reconciliation failure nobody can
// find. So every share is computed in whole pence and the REMAINDER goes to the
// brand, deliberately and in one named place.
//
// The brand is chosen for the remainder for a reason: it is the party whose
// money this was to begin with, and the party who can see the order in their own
// books. Rounding towards the platform would be taking a penny that nobody
// agreed to, from someone who cannot easily check.

export type SplitInput = {
  /** Everything the customer actually paid, in pence. Never negative. */
  grossPence: number;
  /**
   * The creator's commission BEFORE the settlement window is applied — from
   * `saleCommissionPence(netEligibleValue(...).eligiblePence)`.
   */
  commissionPence: number;
  /** MarketWar's own fee on this order, in pence. */
  platformFeePence: number;
  /**
   * 0, 50 or 100, from `settlementState`. Money still inside the refund window
   * is not the creator's yet, so it stays with the brand until it settles.
   */
  payablePct: number;
};

export type Split = {
  creatorPence: number;
  platformPence: number;
  /** What is remitted to the brand. Carries the rounding remainder. */
  brandPence: number;
  /** Commission earned but not yet released — settles when the window closes. */
  heldPence: number;
  note: string;
};

export type SplitRefusal = { ok: false; error: string };
export type SplitResult = ({ ok: true } & Split) | SplitRefusal;

const whole = (n: number) => Math.max(0, Math.round(n || 0));

/**
 * Split one paid order.
 *
 * Refuses rather than producing a negative remittance: an order whose commission
 * and fee exceed what the customer paid is a configuration error, and paying it
 * out would mean MarketWar funding somebody else's commission from its own
 * balance sheet — which is the exact exposure this whole model exists to avoid.
 */
export function splitOrder(input: SplitInput): SplitResult {
  const gross = whole(input.grossPence);
  const fee = whole(input.platformFeePence);
  const earned = whole(input.commissionPence);

  const pct = input.payablePct;
  if (pct !== 0 && pct !== 50 && pct !== 100) {
    return { ok: false, error: `payablePct must be 0, 50 or 100 — got ${input.payablePct}. It comes from settlementState, never from a caller's arithmetic.` };
  }
  if (gross <= 0) {
    return { ok: false, error: "No money arrived on this order, so there is nothing to split." };
  }

  // Released now vs still inside the refund window. Rounded once, here.
  const creator = Math.round((earned * pct) / 100);
  const held = earned - creator;

  if (creator + fee > gross) {
    return {
      ok: false,
      error: `The commission (£${(creator / 100).toFixed(2)}) and platform fee (£${(fee / 100).toFixed(2)}) exceed the £${(gross / 100).toFixed(2)} the customer paid. Nothing is paid out — this is a pricing error, not a rounding one.`,
    };
  }

  // THE REMAINDER, IN ONE PLACE. Everything the customer paid that is not the
  // creator's and not the platform's belongs to the brand, including any penny
  // left by the percentage above.
  const brand = gross - creator - fee;

  return {
    ok: true,
    creatorPence: creator,
    platformPence: fee,
    brandPence: brand,
    heldPence: held,
    note: held > 0
      ? `£${(creator / 100).toFixed(2)} released to the creator now and £${(held / 100).toFixed(2)} held until the refund window closes. The held amount stays with the brand until it settles — it is not ours to hold.`
      : pct === 0
        ? `Nothing released yet: £${(held / 100).toFixed(2)} is earned but inside the refund window, so it stays with the brand for now.`
        : `£${(creator / 100).toFixed(2)} to the creator, £${(fee / 100).toFixed(2)} to the platform, £${(brand / 100).toFixed(2)} remitted to the brand.`,
  };
}

/**
 * Prove the split conserved the money.
 *
 * Exported so a caller can assert it before instructing a transfer, and so the
 * invariant is checkable at the point money moves rather than only in a test.
 */
export function conserves(gross: number, s: Split): boolean {
  return whole(gross) === s.creatorPence + s.platformPence + s.brandPence;
}
