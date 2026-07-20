import { NextRequest, NextResponse } from "next/server";
import {
  changeUserPlan, createOffer, createDiscountCode, applyDiscountCode, validateDiscount,
  isOfferValid, waivePayment, demoAdminBilling,
  DISCOUNT_AUTHORITY, WAIVER_CAP_MONTHS, type Role, type DiscountCode,
} from "@/backend/admin-billing";

// Admin Billing API (owner/admin only). Change a user's plan, create
// time-limited offers + discount codes (with discount-authority governance),
// and waive a user's payment up to 3 months per rolling 12-month window.
// POST { action: "change-plan", userId, fromPlanId?, toPlanId, immediate? }
// POST { action: "offer", id, name, percentOff, role, appliesToPlans?, validFrom, validTo, maxRedemptions? }
// POST { action: "discount-code", code, percentOff, role, appliesToPlans?, expiresAt, maxRedemptions? }
// POST { action: "apply-code", code{…}, planId, basePriceGbp, nowISO }
// POST { action: "waive", userId, requestedMonths, alreadyWaivedInWindow? | waiverHistoryISO?, asOfISO? }
// GET  → discount authority, waiver cap, demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : undefined);

  if (action === "change-plan") {
    if (!str("userId") || !str("toPlanId")) return NextResponse.json({ error: "change-plan requires userId and toPlanId" }, { status: 400 });
    return NextResponse.json(changeUserPlan({ userId: str("userId")!, fromPlanId: str("fromPlanId"), toPlanId: str("toPlanId")!, immediate: Boolean(body.immediate) }));
  }

  if (action === "offer") {
    if (!str("id") || !str("name") || num("percentOff") === undefined || !str("role") || !str("validFrom") || !str("validTo"))
      return NextResponse.json({ error: "offer requires id, name, percentOff, role, validFrom, validTo" }, { status: 400 });
    const r = createOffer({ id: str("id")!, name: str("name")!, percentOff: num("percentOff")!, role: str("role") as Role, appliesToPlans: Array.isArray(body.appliesToPlans) ? (body.appliesToPlans as string[]) : undefined, validFrom: str("validFrom")!, validTo: str("validTo")!, maxRedemptions: num("maxRedemptions") });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }

  if (action === "discount-code") {
    if (!str("code") || num("percentOff") === undefined || !str("role") || !str("expiresAt"))
      return NextResponse.json({ error: "discount-code requires code, percentOff, role, expiresAt" }, { status: 400 });
    const r = createDiscountCode({ code: str("code")!, percentOff: num("percentOff")!, role: str("role") as Role, appliesToPlans: Array.isArray(body.appliesToPlans) ? (body.appliesToPlans as string[]) : undefined, expiresAt: str("expiresAt")!, maxRedemptions: num("maxRedemptions") });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }

  if (action === "apply-code") {
    const code = body.code as DiscountCode | undefined;
    if (!code || typeof code.percentOff !== "number" || !str("planId") || num("basePriceGbp") === undefined || !str("nowISO"))
      return NextResponse.json({ error: "apply-code requires code{}, planId, basePriceGbp, nowISO" }, { status: 400 });
    return NextResponse.json(applyDiscountCode(code, { planId: str("planId")!, basePriceGbp: num("basePriceGbp")!, nowISO: str("nowISO")! }));
  }

  if (action === "validate-discount") {
    if (num("percentOff") === undefined || !str("role")) return NextResponse.json({ error: "validate-discount requires percentOff and role" }, { status: 400 });
    return NextResponse.json(validateDiscount({ percentOff: num("percentOff")!, role: str("role") as Role, appliesToTopUp: Boolean(body.appliesToTopUp) }));
  }

  if (action === "waive") {
    if (!str("userId") || num("requestedMonths") === undefined) return NextResponse.json({ error: "waive requires userId and requestedMonths" }, { status: 400 });
    return NextResponse.json(waivePayment({
      userId: str("userId")!, requestedMonths: num("requestedMonths")!,
      alreadyWaivedInWindow: num("alreadyWaivedInWindow"),
      waiverHistoryISO: Array.isArray(body.waiverHistoryISO) ? (body.waiverHistoryISO as string[]) : undefined,
      asOfISO: str("asOfISO"),
    }));
  }

  return NextResponse.json({ error: "Unknown action — use change-plan, offer, discount-code, apply-code, validate-discount or waive" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Admin Billing — plan changes, offers, discount codes, payment waivers",
    doctrine: `Admin commercial controls with governance: discounts never apply to ACU top-ups (protects the 4× recovery) and are capped by role authority; payment waivers are capped at ${WAIVER_CAP_MONTHS} months per rolling 12-month window. Downgrades preserve data (excess brands/users go read-only). Not a customer surface — owner/admin only.`,
    discountAuthority: DISCOUNT_AUTHORITY,
    waiverCapMonths: WAIVER_CAP_MONTHS,
    exampleOfferValid: (() => { const o = createOffer({ id: "x", name: "x", percentOff: 10, role: "sales_manager", validFrom: "2026-08-01", validTo: "2026-08-31" }); return o.offer ? isOfferValid(o.offer, "2026-08-15") : null; })(),
    demo: demoAdminBilling(),
  });
}
