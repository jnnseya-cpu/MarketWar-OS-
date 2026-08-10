// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Withdrawals — what it costs a creator to take their money out, and where.
//
// Builds on `creator-engine.ts`, which already routes Africa to BitriPay and
// everywhere else to Stripe and keeps the release ledger idempotent. This adds
// the two things that were missing: the FEE the creator actually pays, and the
// TAX position of someone who is not an employee.
//
import { jurisdiction } from "@/backend/payout-identity";

// ── THE TAX POSITION, STATED PLAINLY ───────────────────────────────────────
//
// Creators are not employees. Nothing is withheld: no income tax, no National
// Insurance, no PAYE. They are paid gross and are responsible for declaring
// their own earnings wherever they live.
//
// That is NOT the same as the platform having no obligation. Since January 2024
// the UK's reporting rules for digital platforms (the OECD model rules, DAC7 in
// the EU) require a platform that pays sellers for services to collect their
// identity details and report annual earnings to HMRC. So the platform's duty is
// to KNOW who it paid and to hand both HMRC and the creator the same number —
// not to deduct anything from it.
//
// None of this is tax advice, and it is labelled as such everywhere it surfaces.
//
// ── THE FEES ───────────────────────────────────────────────────────────────
//
// Two charges sit on a withdrawal, and they are different things:
//
//   1. The PROCESSING FEE, which belongs to the rail the creator chose. It is a
//      pass-through: we charge what it costs, and it varies by rail because
//      moving £50 to an M-Pesa wallet in Kinshasa does not cost what moving £50
//      to a UK bank costs.
//   2. The ADMIN FEE, which is ours: 3% OF THE PROCESSING FEE.
//
// A NOTE ON THAT 3%, because the instruction admits two readings. "The
// processing fee ... and a 3% of that charge as admin fees" — "that charge"
// reads most directly as the processing fee, which is what is implemented: a 3%
// handling margin on the rail cost. On a £2 processing fee that is 6p.
//
// The other reading is 3% of the WITHDRAWAL, which on a £100 withdrawal is £3 —
// fifty times more, and six times the 0.5% commission the creator earned to get
// there. Given how hard the rest of this system works to protect the small
// participant, the smaller reading is the one that fits. It is a single constant
// and a single flag: flip `ADMIN_FEE_BASIS` to change it.

export type AdminFeeBasis = "processing_fee" | "withdrawal_amount";

/** Ours, on top of the rail's own cost. */
export const ADMIN_FEE_RATE = 0.03;
export const ADMIN_FEE_BASIS: AdminFeeBasis = "processing_fee";

export type RailId =
  | "stripe_bank" | "stripe_card" | "paypal" | "wise"
  | "mpesa" | "orange_money" | "airtel_money" | "africell_money"
  | "local_bank";

export type PayoutRail = {
  id: RailId;
  label: string;
  /** Where it works. "*" means broadly available. */
  regions: string[];
  /** The rail's own pricing. Percentage of the amount plus a fixed charge. */
  feePct: number;
  feeFixedPence: number;
  /** Below this the fees are a silly share of the money. */
  minWithdrawalPence: number;
  speed: string;
  /** True where the money genuinely moves today. */
  envKey: string;
  note: string;
};

/**
 * Rail pricing.
 *
 * These are ESTIMATES from the providers' published rates and are deliberately
 * on the high side — quoting a creator less than they are charged is the one
 * error here that produces an angry person with a screenshot. Correct them
 * against the first real settlement report; every quote re-derives.
 */
export const PAYOUT_RAILS: PayoutRail[] = [
  {
    id: "stripe_bank", label: "Bank transfer (Stripe)", regions: ["GB", "EU", "US", "CA", "AU", "*"],
    feePct: 0, feeFixedPence: 20, minWithdrawalPence: 500, speed: "1–3 working days",
    envKey: "STRIPE_SECRET_KEY",
    note: "Cheapest where it is available. A payout in a currency other than your balance carries the provider's FX spread on top.",
  },
  {
    id: "stripe_card", label: "Instant to debit card (Stripe)", regions: ["GB", "EU", "US", "*"],
    feePct: 0.015, feeFixedPence: 20, minWithdrawalPence: 500, speed: "Usually within 30 minutes",
    envKey: "STRIPE_SECRET_KEY",
    note: "You are paying for speed. The same money costs less on a bank transfer if you can wait a day.",
  },
  {
    id: "paypal", label: "PayPal", regions: ["*"],
    feePct: 0.02, feeFixedPence: 0, minWithdrawalPence: 500, speed: "Minutes to hours",
    envKey: "PAYPAL_CLIENT_ID",
    note: "Convenient and rarely the cheapest. Cross-border payouts also carry PayPal's FX margin.",
  },
  {
    id: "wise", label: "Wise", regions: ["*"],
    feePct: 0.006, feeFixedPence: 30, minWithdrawalPence: 1_000, speed: "Same day to 2 days",
    envKey: "WISE_API_TOKEN",
    note: "Usually the best rate on a cross-border withdrawal, because the FX is at the mid-market rate rather than a spread.",
  },
  {
    id: "mpesa", label: "M-Pesa (BitriPay)", regions: ["KE", "TZ", "CD", "GH", "MZ"],
    feePct: 0.015, feeFixedPence: 25, minWithdrawalPence: 200, speed: "Minutes",
    envKey: "BITRIPAY_API_KEY",
    note: "No bank account needed. The low minimum is deliberate — this is the rail where small, frequent withdrawals are normal.",
  },
  {
    id: "orange_money", label: "Orange Money (BitriPay)", regions: ["CD", "CI", "SN", "ML", "CM"],
    feePct: 0.018, feeFixedPence: 25, minWithdrawalPence: 200, speed: "Minutes",
    envKey: "BITRIPAY_API_KEY", note: "Mobile wallet. No bank account needed.",
  },
  {
    id: "airtel_money", label: "Airtel Money (BitriPay)", regions: ["CD", "KE", "TZ", "UG", "ZM", "MW"],
    feePct: 0.018, feeFixedPence: 25, minWithdrawalPence: 200, speed: "Minutes",
    envKey: "BITRIPAY_API_KEY", note: "Mobile wallet. No bank account needed.",
  },
  {
    id: "africell_money", label: "Africell Money (BitriPay)", regions: ["CD", "SL", "GM", "AO"],
    feePct: 0.02, feeFixedPence: 25, minWithdrawalPence: 200, speed: "Minutes",
    envKey: "BITRIPAY_API_KEY", note: "Mobile wallet. No bank account needed.",
  },
  {
    id: "local_bank", label: "Local bank transfer", regions: ["*"],
    feePct: 0.005, feeFixedPence: 100, minWithdrawalPence: 2_000, speed: "2–5 working days",
    envKey: "BITRIPAY_API_KEY",
    note: "The fixed charge makes this poor value on a small withdrawal and good value on a large one.",
  },
];

export const rail = (id: string): PayoutRail | null => PAYOUT_RAILS.find((r) => r.id === id) || null;

/** Rails available where the creator actually is. */
export function railsForCountry(iso2: string): PayoutRail[] {
  const c = (iso2 || "").trim().toUpperCase();
  if (!c) return PAYOUT_RAILS;
  return PAYOUT_RAILS.filter((r) => r.regions.includes("*") || r.regions.includes(c));
}

export const railConfigured = (r: PayoutRail): boolean => Boolean(process.env[r.envKey]);

// ---------------------------------------------------------------------------
// The quote
//
// Shown BEFORE the creator confirms, itemised, with the net they will actually
// receive in the largest type. A withdrawal screen that shows a gross figure and
// surprises afterwards is how a platform loses the people it depends on.
// ---------------------------------------------------------------------------

/**
 * Above this share of the withdrawal, the fees are not worth paying and the
 * quote says so rather than letting somebody take £1 out and receive 40p.
 */
export const FEE_WARNING_SHARE = 0.1;
export const FEE_REFUSAL_SHARE = 0.25;

export type WithdrawalQuote =
  | {
      ok: true;
      railId: RailId;
      railLabel: string;
      grossPence: number;
      processingFeePence: number;
      adminFeePence: number;
      totalFeesPence: number;
      netPence: number;
      feeSharePct: number;
      speed: string;
      lines: { label: string; pence: number; whose: "creator" | "rail" | "platform" }[];
      warning?: string;
      cheaper?: { railId: RailId; label: string; netPence: number };
      note: string;
    }
  | { ok: false; error: string; hint: string; minimumPence?: number };

const round = (n: number) => Math.round(n);

export function processingFee(r: PayoutRail, amountPence: number): number {
  return round(Math.max(0, amountPence) * r.feePct + r.feeFixedPence);
}

export function adminFee(processingFeePence: number, amountPence: number): number {
  return round((ADMIN_FEE_BASIS === "processing_fee" ? processingFeePence : amountPence) * ADMIN_FEE_RATE);
}

export function quoteWithdrawal(input: { railId: string; amountPence: number; country?: string }): WithdrawalQuote {
  const r = rail(input.railId);
  if (!r) return { ok: false, error: `No payout rail "${input.railId}".`, hint: `Available: ${PAYOUT_RAILS.map((x) => x.id).join(", ")}` };

  const gross = round(Math.max(0, input.amountPence || 0));
  if (gross <= 0) return { ok: false, error: "There is nothing to withdraw.", hint: "Earnings become withdrawable once the refund window on the sale that produced them has closed." };

  if (input.country && !railsForCountry(input.country).some((x) => x.id === r.id)) {
    return {
      ok: false,
      error: `${r.label} does not pay out to ${input.country.toUpperCase()}.`,
      hint: `From there you can use: ${railsForCountry(input.country).map((x) => x.label).join(", ")}.`,
    };
  }

  if (gross < r.minWithdrawalPence) {
    return {
      ok: false,
      error: `${r.label} needs at least £${(r.minWithdrawalPence / 100).toFixed(2)} to be worth doing.`,
      hint: `Below that the fees are most of the money. Let it build, or choose a rail with a lower minimum — ${PAYOUT_RAILS.filter((x) => x.minWithdrawalPence < r.minWithdrawalPence).map((x) => `${x.label} (£${(x.minWithdrawalPence / 100).toFixed(2)})`).join(", ") || "there is none lower"}.`,
      minimumPence: r.minWithdrawalPence,
    };
  }

  const processing = processingFee(r, gross);
  const admin = adminFee(processing, gross);
  const fees = processing + admin;
  const net = gross - fees;
  const share = gross > 0 ? fees / gross : 0;

  // The hard refusal: fees taking a quarter of the money is not a withdrawal,
  // it is an erosion, and no amount of small print makes it acceptable.
  if (share >= FEE_REFUSAL_SHARE || net <= 0) {
    return {
      ok: false,
      error: `Fees would take £${(fees / 100).toFixed(2)} of a £${(gross / 100).toFixed(2)} withdrawal — ${Math.round(share * 100)}% of it.`,
      hint: "That is refused rather than offered. Wait for the balance to build, or pick a rail with a lower fixed charge; the same fee on a larger amount is a much smaller share.",
    };
  }

  // Is another rail simply better for this amount and place?
  const alternatives = railsForCountry(input.country || "")
    .filter((x) => x.id !== r.id && gross >= x.minWithdrawalPence)
    .map((x) => { const p = processingFee(x, gross); return { railId: x.id, label: x.label, netPence: gross - p - adminFee(p, gross) }; })
    .sort((a, b) => b.netPence - a.netPence);
  const best = alternatives[0] && alternatives[0].netPence > net ? alternatives[0] : undefined;

  return {
    ok: true,
    railId: r.id, railLabel: r.label,
    grossPence: gross, processingFeePence: processing, adminFeePence: admin,
    totalFeesPence: fees, netPence: net,
    feeSharePct: Math.round(share * 1000) / 10,
    speed: r.speed,
    lines: [
      { label: "Your earnings", pence: gross, whose: "creator" },
      { label: `${r.label} processing fee`, pence: -processing, whose: "rail" },
      { label: `MarketWar admin fee (${Math.round(ADMIN_FEE_RATE * 100)}% of the processing fee)`, pence: -admin, whose: "platform" },
      { label: "You receive", pence: net, whose: "creator" },
    ],
    warning: share >= FEE_WARNING_SHARE
      ? `Fees are ${Math.round(share * 100)}% of this withdrawal. Waiting until the balance is larger would leave you with more of it — the fixed part of the charge does not grow with the amount.`
      : undefined,
    cheaper: best,
    note: `${r.note} Nothing is deducted for tax: you are not an employee and are paid gross.`,
  };
}

// ---------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------
export type TaxPosition = {
  withholdingPence: number;
  employed: false;
  statements: string[];
  platformObligations: string[];
  creatorObligations: string[];
  disclaimer: string;
};

export function taxPosition(input: { earnedThisYearPence: number; country?: string }): TaxPosition {
  const gbp = (input.earnedThisYearPence / 100).toFixed(2);
  const jur = jurisdiction(input.country || "");
  return {
    // The number that matters, and it is zero.
    withholdingPence: 0,
    employed: false,
    statements: [
      `You have earned £${gbp} through SHARE2EARN this tax year, paid gross.`,
      "Nothing has been deducted — no income tax, no National Insurance, no PAYE. You are not an employee of MarketWar or of any brand you promote.",
      "An annual earnings statement is available to download, and it shows the same figure we report.",
    ],
    platformObligations: [
      "MarketWar collects your name, address, date of birth and tax reference before your first payout, because a platform that pays for services is required to know who it paid.",
      "Under the UK's reporting rules for digital platforms — the OECD model rules, DAC7 in the EU — annual earnings are reported to the tax authority, and you receive a copy of exactly what was reported.",
      "We do not deduct tax on your behalf and cannot. Reporting what you were paid and withholding from it are different things.",
      jur.situation === "not_issued"
        ? `Your country issues no individual tax reference — ${jur.note} That fact is reported in place of a number; you are never asked for one that does not exist.`
        : jur.situation === "rarely_held"
          ? `${jur.note} If you hold no reference, a stated reason is reported in its place and that is a normal answer rather than a problem.`
          : "Your tax reference is reported alongside the amount, which is what makes the return filable.",
    ],
    creatorObligations: [
      "What you earn here is your income and you declare it where you live. In the UK that usually means Self Assessment once your total self-employed income passes the trading allowance.",
      "Keep the statements. They are the evidence of what you received and when.",
      input.country && input.country.toUpperCase() !== "GB"
        ? `You are paid from the UK to ${input.country.toUpperCase()}, so your own country's rules on foreign income apply as well as anything local.`
        : "If this is your only self-employed income, the trading allowance may mean there is nothing to pay — but there may still be something to declare.",
    ],
    disclaimer: "This is a description of how the platform pays you, not tax advice. Thresholds, allowances and reporting rules change and differ by country; check with an accountant before relying on any of it.",
  };
}

export const PAYOUT_DOCTRINE = [
  "You are not an employee. You are paid gross, nothing is withheld, and what you do about tax where you live is yours to handle — we tell you what you earned and report the same figure, we do not deduct from it.",
  "Withdraw wherever you are: bank transfer, card, PayPal, Wise, or mobile money on M-Pesa, Orange, Airtel and Africell. A bank account is not required.",
  "The processing fee is the rail's, passed through at cost, and it differs by rail because moving money to a mobile wallet does not cost what moving it to a bank costs.",
  `MarketWar's admin fee is ${Math.round(ADMIN_FEE_RATE * 100)}% of that processing fee — not of your withdrawal.`,
  "Every fee is itemised before you confirm, and a withdrawal where fees would take a quarter of the money is refused rather than offered.",
];
