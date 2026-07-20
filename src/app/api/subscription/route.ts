import { NextRequest, NextResponse } from "next/server";
import {
  allPlanEconomics, planEconomics, requiredAcus, markupToMargin, topUps,
  upgradeRecommendation, netContribution, demoSubscription,
  PLANS, EXPIRY_RULES, ADDONS, WALLET_MODELS, ORG_HIERARCHY,
  STANDARD_MARKUP, ENTERPRISE_FEES, COMMERCIAL_PROTECTION,
  PROVIDER_COST_ADJUSTMENT_CLAUSE, DISCOUNT_EXCLUSIONS, PRICING_MESSAGE, type Usage,
} from "@/backend/subscription";

// Subscription, ACU & Commercial Profitability API.
// Separates platform access (subscription) from AI consumption (ACUs).
// POST { action: "quote-acus", providerCostGbp, markup? }   → Required ACUs = cost × 4 × 100
// POST { action: "plan", planId }                            → one plan's economics
// POST { action: "upgrade", usage }                          → upgrade recommendation
// POST { action: "contribution", acuRevenueGbp, providerCostGbp, ... } → net AI contribution + margin band
// GET  → plans, top-ups, expiry rules, add-ons, wallets, markup correction, demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "quote-acus";

  if (action === "quote-acus") {
    if (typeof body.providerCostGbp !== "number" || body.providerCostGbp < 0) return NextResponse.json({ error: "quote-acus requires a non-negative providerCostGbp" }, { status: 400 });
    const markup = typeof body.markup === "number" ? body.markup : STANDARD_MARKUP;
    return NextResponse.json(requiredAcus(body.providerCostGbp, markup));
  }

  if (action === "plan") {
    const plan = PLANS.find((p) => p.id === body.planId);
    if (!plan) return NextResponse.json({ error: `plan requires a valid planId (${PLANS.map((p) => p.id).join(", ")})` }, { status: 400 });
    return NextResponse.json(planEconomics(plan));
  }

  if (action === "upgrade") {
    const usage = body.usage as Usage | undefined;
    if (!usage || typeof usage.planId !== "string") return NextResponse.json({ error: "upgrade requires usage.planId" }, { status: 400 });
    return NextResponse.json(upgradeRecommendation(usage));
  }

  if (action === "contribution") {
    if (typeof body.acuRevenueGbp !== "number" || typeof body.providerCostGbp !== "number") return NextResponse.json({ error: "contribution requires acuRevenueGbp and providerCostGbp" }, { status: 400 });
    return NextResponse.json(netContribution({
      acuRevenueGbp: body.acuRevenueGbp, providerCostGbp: body.providerCostGbp,
      processingCostGbp: typeof body.processingCostGbp === "number" ? body.processingCostGbp : undefined,
      paymentCostGbp: typeof body.paymentCostGbp === "number" ? body.paymentCostGbp : undefined,
    }));
  }

  return NextResponse.json({ error: "Unknown action — use quote-acus, plan, upgrade or contribution" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Subscription, ACU & Commercial Profitability engine",
    doctrine: "Platform access = predictable subscription; AI consumption = metered ACUs (£1 = 100 ACUs). Pricing rule: Customer ACU Charge = Provider Cost × 4 → a 300% MARKUP = 75% GROSS MARGIN (margin can never exceed 100%). Every plan auto-allocates 20% of the price paid as ACUs; annual = 30% off with ACUs released monthly. Provider cost never exposed to the customer.",
    markupCorrection: markupToMargin(STANDARD_MARKUP),
    orgHierarchy: ORG_HIERARCHY,
    walletModels: WALLET_MODELS,
    expiryRules: EXPIRY_RULES,
    addOns: ADDONS,
    enterpriseFees: ENTERPRISE_FEES,
    commercialProtection: COMMERCIAL_PROTECTION,
    providerCostAdjustmentClause: PROVIDER_COST_ADJUSTMENT_CLAUSE,
    discountExclusions: DISCOUNT_EXCLUSIONS,
    pricingMessage: PRICING_MESSAGE,
    topUps: topUps(),
    plans: allPlanEconomics(),
    demo: demoSubscription(),
  });
}
