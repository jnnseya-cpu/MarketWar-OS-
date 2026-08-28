// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHEN A REFERRED ACCOUNT PAYS **US**, THE CREATOR GETS PAID.
//
// LAUNCH-AUDIT FINDING D-12 (P2). §101 already linked a creator's click to the
// account that signed up — `attributeSignup` persists it, `getAttribution`
// reads it back, and the share2earn dashboard showed the referral. And then
// nothing happened. No code path connected a MarketWar SUBSCRIPTION PAYMENT to
// `accrue()`, so the one revenue-share promise the platform makes was tracked
// in full and paid never. A creator could send twenty paying customers and see
// twenty attributions and a zero balance.
//
// Every part of the chain existed on both sides of this file:
//   attributeSignup / getAttribution  — who referred this account
//   netEligibleValue                  — what the sale is worth after exclusions
//   saleCommissionPence               — what that earns
//   settlementState                   — when it becomes payable
//   accrue                            — writes the append-only row
//   splitOrder / executePayout        — moves the money
// The middle was missing, which is this codebase's oldest shape: a rule
// described everywhere and enforced nowhere.
//
// THREE THINGS THIS REFUSES TO DO, each of which a naive version gets wrong:
//
//   1. COMMISSION ON VAT. Stripe's `amount_paid` is gross. Paying a creator a
//      percentage of the tax we collect and remit to HMRC is paying them out of
//      money that was never ours. The invoice's tax is passed through to
//      `netEligibleValue` as an excluded line, exactly as a shop's order tax is.
//
//   2. A ZERO-VALUE ACCRUAL. A £0 invoice — a 100% coupon, a trial converting,
//      a proration that nets to nothing — must not write a row. STATE.md names
//      this directly: a zero-value ledger event bypasses the 10,000-pence
//      payout gate, so enough of them turn an unpayable balance into a payable
//      one without a penny of revenue behind it.
//
//   3. GUESSING THE PAYMENT NUMBER. Whether a renewal earns at all is the
//      programme's rule (`renewalCommissionable`), and it needs to know which
//      payment this is. It is COUNTED from the accruals already written for
//      this account, not assumed to be the first and not read from anything the
//      caller could get wrong.

import { getAttribution } from "@/backend/signup-attribution";
import { accrue, listForCode, type AccrueInput, type AccrueResult } from "@/backend/commission-ledger";
import { FUNDING_MODES, type FundingPolicy } from "@/backend/profit-guard-economics";

/** The platform default, read from the one place funding modes are defined. */
function revenueLockedPolicy(): FundingPolicy {
  const p = FUNDING_MODES.find((m) => m.mode === "revenue_locked");
  if (!p) throw new Error("revenue_locked funding mode is missing from FUNDING_MODES");
  return p;
}

export type CommissionOutcome =
  | { ok: true; accrualId: string; earnedPence: number; eligiblePence: number; paymentNumber: number; created: boolean }
  /** Nothing owed, and nothing wrong. The common case. */
  | { ok: false; terminal: true; reason: string; code: "not_referred" | "no_money" | "not_commissionable" }
  /** Owed, and we could not write it down. RETRY THIS. */
  | { ok: false; terminal: false; reason: string; code: "store_failed" };

/**
 * Post the commission a MarketWar subscription payment earned.
 *
 * Idempotent: `paymentId` (the Stripe invoice or event id) is the order id, and
 * `accrue` returns the first row rather than writing a second for an id it has
 * already seen. A redelivered webhook therefore pays nobody twice.
 */
export async function commissionForPayment(input: {
  /** The paying MarketWar account. */
  orgId: string;
  /** Stripe invoice id, or the event id. THE IDEMPOTENCY KEY. */
  paymentId: string;
  /** Gross, in pence, exactly as Stripe reports it. */
  amountPaidPence: number;
  /** Tax included in the gross, in pence. Excluded from the commissionable value. */
  taxPence?: number;
  /** Anything refunded against this payment already. */
  refundedPence?: number;
  paidAtISO: string;
  nowISO: string;
  /**
   * Injectable ONLY so a test can make the ledger write fail. Product code
   * never passes it — the default is the real `accrue`, so there is no second
   * path to drift. Storage failures here are money somebody earned and we did
   * not write down, and that branch must be drivable rather than inferred.
   */
  write?: (i: AccrueInput) => Promise<AccrueResult>;
  /** Injectable for the same reason as `write` — see above. */
  read?: (code: string) => Promise<Awaited<ReturnType<typeof listForCode>>>;
}): Promise<CommissionOutcome> {
  const orgId = (input.orgId || "").trim();
  if (!orgId) return { ok: false, terminal: true, code: "not_referred", reason: "The payment carried no account id." };

  // WAS THIS ACCOUNT REFERRED? Most are not, and that is not a failure — it is
  // the ordinary case and must not read as one in a log.
  let attribution;
  try {
    attribution = await getAttribution(orgId);
  } catch (e) {
    return {
      ok: false, terminal: false, code: "store_failed",
      reason: `Could not read the referral attribution for ${orgId}: ${e instanceof Error ? e.message : "unknown storage error"}`,
    };
  }
  if (!attribution) {
    return { ok: false, terminal: true, code: "not_referred", reason: "This account was not referred by a creator." };
  }

  const gross = Math.max(0, Math.round(input.amountPaidPence || 0));
  const tax = Math.max(0, Math.round(input.taxPence || 0));
  const refunded = Math.max(0, Math.round(input.refundedPence || 0));

  // NO MONEY, NO ROW. See (2) above — a zero-value accrual is how the payout
  // floor gets walked past without revenue.
  if (gross - tax - refunded <= 0) {
    return {
      ok: false, terminal: true, code: "no_money",
      reason: `Nothing commissionable on this payment (gross ${gross}p, tax ${tax}p, refunded ${refunded}p). No row written — a zero-value accrual would count toward the payout floor without revenue behind it.`,
    };
  }

  // HAS THIS INVOICE ALREADY BEEN ACCRUED? Asked FIRST, by invoice id, because
  // the invoice id is the only thing about a payment that never changes.
  //
  // TWO WRONG VERSIONS PRECEDED THIS ONE, and both paid a creator twice.
  // `accrue` keys its row on (brandId, orderId, paymentNumber), so anything
  // that moves the payment number moves the id. Deriving that number by
  // counting prior accruals broke the moment the first row existed. Excluding
  // the row's own order id fixed the immediate case and still broke when a
  // LATER payment had since been recorded — a redelivery of invoice #1 counted
  // invoice #2 and came out as payment 2.
  //
  // The lesson is the general one: an idempotency key must not be derived from
  // mutable state. So the mutable part is never consulted for a payment already
  // on the ledger.
  let prior;
  try {
    prior = (await (input.read ?? listForCode)(attribution.code)).filter((a) => a.brandId === orgId);
  } catch (e) {
    return {
      ok: false, terminal: false, code: "store_failed",
      reason: `Could not read prior accruals for ${orgId}: ${e instanceof Error ? e.message : "unknown storage error"}`,
    };
  }

  const already = prior.find((a) => a.orderId === input.paymentId);
  if (already) {
    return {
      ok: true, accrualId: already.id, earnedPence: already.earnedPence,
      eligiblePence: already.eligiblePence, paymentNumber: already.paymentNumber, created: false,
    };
  }

  // WHICH PAYMENT IS THIS? Only reached for an invoice never seen before, so
  // counting is safe. Void rows are excluded: a reversed first month must not
  // make the second look like the third and fall outside the commissionable
  // window the creator was promised.
  const paymentNumber = prior.filter((a) => a.state !== "void").length + 1;

  const write = input.write ?? accrue;
  let result;
  try {
    result = await write({
      brandId: orgId,
      code: attribution.code,
      orderId: input.paymentId,
      checkoutTotalPence: gross,
      // Tax and refunds travel as EXCLUDED LINES, so the commission is computed
      // on what MarketWar actually kept. `netEligibleValue` derives the
      // commissionable amount from `productPence` MINUS refunds — `taxPence` is
      // carried for the breakdown a creator reads, and cannot move the money on
      // its own. Both are passed so the row explains itself.
      // `productPence` is the subscription fee itself: the gross less the tax
      // we remit. There is no delivery, tip or gift card on a SaaS invoice, so
      // those lines are genuinely absent rather than defaulted to zero to keep
      // a type happy.
      lines: {
        checkoutTotalPence: gross,
        productPence: Math.max(0, gross - tax),
        taxPence: tax,
        refundedPence: refunded,
      },
      paymentNumber,
      recurring: paymentNumber > 1,
      paidAtISO: input.paidAtISO,
      nowISO: input.nowISO,
      policy: revenueLockedPolicy(),
    });
  } catch (e) {
    return {
      ok: false, terminal: false, code: "store_failed",
      reason: `Could not write the accrual for ${orgId}: ${e instanceof Error ? e.message : "unknown storage error"}`,
    };
  }

  if (!result.ok) {
    // The programme said this payment does not earn — a renewal past the
    // commissionable window, most often. Terminal, and correct.
    return { ok: false, terminal: true, code: "not_commissionable", reason: result.reason };
  }

  return {
    ok: true,
    accrualId: result.accrual.id,
    earnedPence: result.accrual.earnedPence,
    eligiblePence: result.accrual.eligiblePence,
    paymentNumber,
    created: result.created,
  };
}
