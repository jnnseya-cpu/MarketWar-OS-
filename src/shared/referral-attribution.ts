// WHICH CREATOR EARNED THIS SALE, AND FOR HOW LONG.
//
// The two decisions the flow document flagged as undecided. They are commercial
// rather than technical, so they are written here ONCE, in the open, with the
// reasoning attached — rather than left implicit in three call sites where they
// would silently disagree.
//
// ────────────────────────────────────────────────────────────────────────────
// THE LIMITATION THIS FILE IS HONEST ABOUT
// ────────────────────────────────────────────────────────────────────────────
//
// The click happens on OUR redirect (`/r/{CODE}`). The purchase happens on the
// BRAND'S OWN SITE, in their checkout, on their domain. There is no shared
// cookie across that boundary and there is no way to build one — so we cannot
// match an individual visitor from click to sale. Anybody claiming otherwise is
// describing third-party cookies that no longer work.
//
// What actually happens: the brand's site captures `?ref=CODE`, keeps it in
// their own session, and hands it back on the postback. **The brand's cookie is
// the attribution, not ours.**
//
// So the window below is a SANITY CHECK, not a per-person match: a sale claiming
// a code must have a click on that code inside the window. It catches a stale or
// guessed code being posted back months later. It cannot prove this buyer is
// that clicker, and the code does not pretend to.

/**
 * How long after a click a sale may still claim the code.
 *
 * 30 days is the ordinary affiliate window — long enough for a considered
 * purchase, short enough that a creator is not still being paid for traffic from
 * last spring. Overridable per programme; never silently zero, which would pay
 * nobody, and never unbounded, which would pay everybody forever.
 */
export const ATTRIBUTION_WINDOW_DAYS = 30;
export const MIN_ATTRIBUTION_WINDOW_DAYS = 1;
export const MAX_ATTRIBUTION_WINDOW_DAYS = 180;

export function attributionWindowDays(configured?: number): number {
  if (typeof configured !== "number" || !Number.isFinite(configured)) return ATTRIBUTION_WINDOW_DAYS;
  return Math.min(MAX_ATTRIBUTION_WINDOW_DAYS, Math.max(MIN_ATTRIBUTION_WINDOW_DAYS, Math.round(configured)));
}

export type ClickRecord = { code: string; atISO: string };

export type AttributionResult =
  | { attributed: true; code: string; clickAtISO: string; ageDays: number; reason: string }
  | { attributed: false; reason: string };

/**
 * May this sale claim this code?
 *
 * LAST CLICK WINS, which is the industry norm and the one a creator expects. The
 * most recent click inside the window is the one credited.
 */
export function attributeSale(input: {
  code: string;
  saleAtISO: string;
  clicks: ClickRecord[];
  windowDays?: number;
}): AttributionResult {
  const code = (input.code || "").trim().toUpperCase();
  if (!code) return { attributed: false, reason: "The sale carried no referral code." };

  const saleAt = Date.parse(input.saleAtISO);
  if (!Number.isFinite(saleAt)) return { attributed: false, reason: "The sale has no usable timestamp." };

  const days = attributionWindowDays(input.windowDays);
  const windowMs = days * 86_400_000;

  const eligible = input.clicks
    .filter((c) => (c.code || "").trim().toUpperCase() === code)
    .map((c) => ({ c, t: Date.parse(c.atISO) }))
    .filter((x) => Number.isFinite(x.t))
    // A click AFTER the sale cannot have caused it. This is not pedantry: a
    // creator posting a link the day after a customer bought would otherwise be
    // credited with the sale.
    .filter((x) => x.t <= saleAt && saleAt - x.t <= windowMs)
    .sort((a, b) => b.t - a.t);

  if (!eligible.length) {
    return {
      attributed: false,
      reason: `No click on ${code} in the ${days} days before this sale, so nothing here connects the two.`,
    };
  }
  const winner = eligible[0];
  const ageDays = Math.floor((saleAt - winner.t) / 86_400_000);
  return {
    attributed: true,
    code,
    clickAtISO: winner.c.atISO,
    ageDays,
    reason: `Last click on ${code} was ${ageDays} day${ageDays === 1 ? "" : "s"} before the sale, inside the ${days}-day window.`,
  };
}

// ---------------------------------------------------------------------------
// Subscriptions: does a renewal earn anything?
// ---------------------------------------------------------------------------
//
// THE DECISION, AND WHY.
//
//   • First payment only    — cheapest, and the weakest reason to promote a
//                             subscription product at all.
//   • Every renewal forever — an unbounded liability per creator. A £49/month
//                             customer who stays four years costs 0.5% × 48
//                             payments, owed to somebody who posted once.
//   • Renewals for N months — bounded, still worth promoting. THE DEFAULT.
//
// Twelve months is the choice: it matches how most subscription businesses think
// about first-year value, it is a round number a creator can understand without
// a calculator, and the total liability per referred customer is knowable in
// advance — which is the property that lets ProfitGuard cap it.
//
// This number is part of the OFFER. Changing it after a creator has joined is
// changing the deal they signed up to, so it is versioned with the programme
// rather than edited in place.

export type RenewalPolicy =
  | { mode: "first_only" }
  | { mode: "months"; months: number }
  | { mode: "forever" };

export const DEFAULT_RENEWAL_POLICY: RenewalPolicy = { mode: "months", months: 12 };

export type RenewalVerdict = { commissionable: boolean; reason: string };

/**
 * Is payment number `n` of a subscription commissionable?
 *
 * `paymentNumber` is 1 for the first payment, 2 for the first renewal, and so on.
 */
export function renewalCommissionable(paymentNumber: number, policy: RenewalPolicy = DEFAULT_RENEWAL_POLICY): RenewalVerdict {
  const n = Math.round(paymentNumber);
  if (!Number.isFinite(n) || n < 1) {
    return { commissionable: false, reason: "Payment number must be 1 or more — 1 is the first payment, 2 the first renewal." };
  }
  if (n === 1) return { commissionable: true, reason: "The first payment is always commissionable." };

  if (policy.mode === "first_only") {
    return { commissionable: false, reason: "This programme pays on the first payment only, which is stated on the creator's offer." };
  }
  if (policy.mode === "forever") {
    return { commissionable: true, reason: "This programme pays on every renewal for as long as the customer stays." };
  }
  const months = Math.max(1, Math.round(policy.months));
  return n <= months
    ? { commissionable: true, reason: `Payment ${n} of the ${months} this programme pays on.` }
    : { commissionable: false, reason: `This programme pays on the first ${months} payments; this is payment ${n}.` };
}

/**
 * The most a single referred subscriber can ever cost, so it can be capped
 * before it is offered.
 *
 * Returns null for `forever`, deliberately: an unbounded liability has no
 * maximum, and returning a large number instead of null would let a caller
 * treat a guess as a limit.
 */
export function maxLiabilityPence(monthlyPricePence: number, ratePct: number, policy: RenewalPolicy = DEFAULT_RENEWAL_POLICY): number | null {
  const per = Math.round(Math.max(0, monthlyPricePence) * ratePct);
  if (policy.mode === "forever") return null;
  const payments = policy.mode === "first_only" ? 1 : Math.max(1, Math.round(policy.months));
  return per * payments;
}
