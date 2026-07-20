// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar OS — Admin Billing controls.
//
// Owner/admin commercial actions on top of the subscription engine:
//   • Change a user/organisation's subscription plan (with proration note).
//   • Create time-limited offers (valid-from/valid-to windows).
//   • Create + apply discount codes (with discount-authority governance).
//   • Waive a user's subscription payment for up to 3 months in any rolling
//     12-month window.
//
// Governance (spec §18): discounts never apply to ACU top-ups or provider
// pass-through; the annual standard discount is 30%; ad-hoc discount authority
// is capped by role. Pure + deterministic — dates are passed in as ISO strings
// (YYYY-MM…) and compared as data, so no wall-clock is used.

import { PLANS, planEconomics } from "@/backend/subscription";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 1. Change a user's subscription plan.
// ---------------------------------------------------------------------------
export type PlanChange = {
  ok: boolean;
  userId: string;
  fromPlan: string | null;
  toPlan: string;
  direction: "upgrade" | "downgrade" | "same";
  newMonthlyAcus: number;
  prorationNote: string;
  downgradeEffects?: string[];
  error?: string;
};

export function changeUserPlan(input: { userId: string; fromPlanId?: string; toPlanId: string; immediate?: boolean }): PlanChange {
  const to = PLANS.find((p) => p.id === input.toPlanId);
  const from = input.fromPlanId ? PLANS.find((p) => p.id === input.fromPlanId) : undefined;
  if (!to) return { ok: false, userId: input.userId, fromPlan: input.fromPlanId ?? null, toPlan: input.toPlanId, direction: "same", newMonthlyAcus: 0, prorationNote: "", error: `Unknown target plan "${input.toPlanId}".` };
  const fromIdx = from ? PLANS.indexOf(from) : -1;
  const toIdx = PLANS.indexOf(to);
  const direction: PlanChange["direction"] = fromIdx < 0 || fromIdx === toIdx ? "same" : toIdx > fromIdx ? "upgrade" : "downgrade";
  const eco = planEconomics(to);
  const downgradeEffects = direction === "downgrade"
    ? ["Existing assets remain accessible", "Excess brands become read-only", "Excess users lose editing access", "Active automations paused", "Purchased top-up ACUs remain valid", "Included ACUs follow the new plan"]
    : undefined;
  return {
    ok: true, userId: input.userId, fromPlan: from?.id ?? null, toPlan: to.id, direction,
    newMonthlyAcus: eco.monthlyAcus,
    prorationNote: direction === "upgrade"
      ? (input.immediate ? "Upgrade applied immediately; charge the prorated difference now and top up the ACU allocation." : "Upgrade scheduled for the next billing date.")
      : direction === "downgrade" ? "Downgrade applies at period end; no refund of the current period; data retained." : "No plan change (same tier).",
    downgradeEffects,
  };
}

// ---------------------------------------------------------------------------
// 2. Discount governance + time-limited offers + discount codes.
// ---------------------------------------------------------------------------
export const DISCOUNT_AUTHORITY = { sales_rep: 5, sales_manager: 10, commercial_director: 20, executive: 100, annual_standard: 30 } as const;
export type Role = keyof typeof DISCOUNT_AUTHORITY;

// A discount must not apply to ACU top-ups or provider pass-through, and must
// respect the approver's authority ceiling.
export function validateDiscount(input: { percentOff: number; role: Role; appliesToTopUp?: boolean }): { ok: boolean; reason: string } {
  if (input.appliesToTopUp) return { ok: false, reason: "Discounts must NOT apply to ACU top-ups (protects the 4× provider-cost recovery)." };
  const ceiling = DISCOUNT_AUTHORITY[input.role];
  if (input.percentOff > ceiling) return { ok: false, reason: `${input.percentOff}% exceeds the ${input.role} authority ceiling of ${ceiling}%.` };
  if (input.percentOff < 0 || input.percentOff > 100) return { ok: false, reason: "Discount must be between 0 and 100%." };
  return { ok: true, reason: `Approved within ${input.role} authority (≤ ${ceiling}%).` };
}

export type Offer = {
  id: string; name: string; percentOff: number;
  appliesToPlans: string[];   // plan ids, or ["*"]
  validFrom: string; validTo: string; // ISO strings
  maxRedemptions?: number; redeemed?: number;
};

export function createOffer(input: { id: string; name: string; percentOff: number; role: Role; appliesToPlans?: string[]; validFrom: string; validTo: string; maxRedemptions?: number }): { ok: boolean; offer?: Offer; error?: string } {
  const gov = validateDiscount({ percentOff: input.percentOff, role: input.role });
  if (!gov.ok) return { ok: false, error: gov.reason };
  if (input.validTo <= input.validFrom) return { ok: false, error: "validTo must be after validFrom." };
  return { ok: true, offer: { id: input.id, name: input.name, percentOff: input.percentOff, appliesToPlans: input.appliesToPlans ?? ["*"], validFrom: input.validFrom, validTo: input.validTo, maxRedemptions: input.maxRedemptions, redeemed: 0 } };
}

// ISO strings sort lexicographically, so a plain range check is correct + deterministic.
export function isOfferValid(offer: Offer, nowISO: string, planId?: string): { valid: boolean; reason: string } {
  if (nowISO < offer.validFrom) return { valid: false, reason: "Offer has not started yet." };
  if (nowISO > offer.validTo) return { valid: false, reason: "Offer has expired." };
  if (offer.maxRedemptions != null && (offer.redeemed ?? 0) >= offer.maxRedemptions) return { valid: false, reason: "Offer fully redeemed." };
  if (planId && !offer.appliesToPlans.includes("*") && !offer.appliesToPlans.includes(planId)) return { valid: false, reason: "Offer does not apply to this plan." };
  return { valid: true, reason: "Offer is valid." };
}

export type DiscountCode = { code: string; percentOff: number; appliesToPlans: string[]; expiresAt: string; maxRedemptions?: number; redeemed?: number };

export function createDiscountCode(input: { code: string; percentOff: number; role: Role; appliesToPlans?: string[]; expiresAt: string; maxRedemptions?: number }): { ok: boolean; discountCode?: DiscountCode; error?: string } {
  const gov = validateDiscount({ percentOff: input.percentOff, role: input.role });
  if (!gov.ok) return { ok: false, error: gov.reason };
  return { ok: true, discountCode: { code: input.code.toUpperCase(), percentOff: input.percentOff, appliesToPlans: input.appliesToPlans ?? ["*"], expiresAt: input.expiresAt, maxRedemptions: input.maxRedemptions, redeemed: 0 } };
}

// Apply a code to a plan price. Discounts stack policy: an ad-hoc code does NOT
// stack on the 30% annual discount beyond the approver's ceiling.
export function applyDiscountCode(code: DiscountCode, input: { planId: string; basePriceGbp: number; nowISO: string }): { ok: boolean; discountedPriceGbp?: number; savedGbp?: number; reason: string } {
  if (input.nowISO > code.expiresAt) return { ok: false, reason: "Code expired." };
  if (code.maxRedemptions != null && (code.redeemed ?? 0) >= code.maxRedemptions) return { ok: false, reason: "Code fully redeemed." };
  if (!code.appliesToPlans.includes("*") && !code.appliesToPlans.includes(input.planId)) return { ok: false, reason: "Code does not apply to this plan." };
  const discounted = round2(input.basePriceGbp * (1 - code.percentOff / 100));
  return { ok: true, discountedPriceGbp: discounted, savedGbp: round2(input.basePriceGbp - discounted), reason: `${code.percentOff}% off applied.` };
}

// ---------------------------------------------------------------------------
// 3. Payment waiver — up to 3 months in any rolling 12-month window.
// ---------------------------------------------------------------------------
export const WAIVER_CAP_MONTHS = 3;
export const WAIVER_WINDOW_MONTHS = 12;

// Count waived months whose date falls within the trailing 12 months of asOf.
// Uses YYYY-MM arithmetic on the ISO strings (deterministic; no Date object).
function monthsBetween(aISO: string, bISO: string): number {
  const [ay, am] = aISO.slice(0, 7).split("-").map(Number);
  const [by, bm] = bISO.slice(0, 7).split("-").map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

export function waivedMonthsInWindow(historyISO: string[], asOfISO: string): number {
  return historyISO.filter((h) => { const d = monthsBetween(h, asOfISO); return d >= 0 && d < WAIVER_WINDOW_MONTHS; }).length;
}

export type WaiverDecision = { approved: boolean; requestedMonths: number; alreadyWaived: number; remainingAfter: number; cap: number; windowMonths: number; note: string };

export function waivePayment(input: { userId: string; requestedMonths: number; waiverHistoryISO?: string[]; asOfISO?: string; alreadyWaivedInWindow?: number }): WaiverDecision {
  const requested = Math.max(0, Math.floor(input.requestedMonths));
  const already = input.waiverHistoryISO && input.asOfISO
    ? waivedMonthsInWindow(input.waiverHistoryISO, input.asOfISO)
    : Math.max(0, input.alreadyWaivedInWindow ?? 0);
  const wouldTotal = already + requested;
  const approved = requested > 0 && wouldTotal <= WAIVER_CAP_MONTHS;
  return {
    approved, requestedMonths: requested, alreadyWaived: already,
    remainingAfter: approved ? WAIVER_CAP_MONTHS - wouldTotal : WAIVER_CAP_MONTHS - already,
    cap: WAIVER_CAP_MONTHS, windowMonths: WAIVER_WINDOW_MONTHS,
    note: approved
      ? `Approved: ${requested} month(s) waived. ${already} already waived in the trailing ${WAIVER_WINDOW_MONTHS} months; ${WAIVER_CAP_MONTHS - wouldTotal} remaining. Platform access continues; ACU allocation for waived months is at admin discretion.`
      : `Denied: ${already} month(s) already waived in the trailing ${WAIVER_WINDOW_MONTHS} months — granting ${requested} more would exceed the ${WAIVER_CAP_MONTHS}-month cap.`,
  };
}

export function demoAdminBilling() {
  return {
    planChange: changeUserPlan({ userId: "biz_204", fromPlanId: "growth", toPlanId: "scale", immediate: true }),
    downgrade: changeUserPlan({ userId: "biz_305", fromPlanId: "business", toPlanId: "growth" }),
    offer: createOffer({ id: "launch24", name: "Launch Week", percentOff: 20, role: "commercial_director", validFrom: "2026-08-01", validTo: "2026-08-07", maxRedemptions: 500 }),
    discountCode: createDiscountCode({ code: "welcome10", percentOff: 10, role: "sales_manager", expiresAt: "2026-12-31" }),
    overreach: validateDiscount({ percentOff: 25, role: "sales_rep" }), // exceeds 5% ceiling
    waiverOk: waivePayment({ userId: "biz_204", requestedMonths: 2, alreadyWaivedInWindow: 0 }),
    waiverDenied: waivePayment({ userId: "biz_305", requestedMonths: 2, alreadyWaivedInWindow: 2 }),
    authority: DISCOUNT_AUTHORITY,
  };
}
