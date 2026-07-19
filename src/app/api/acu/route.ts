import { NextRequest, NextResponse } from "next/server";
import {
  quoteAcu, preflightQuote, profitCheck, arbitrateProvider,
  ACTION_CLASSES, PLANS, SPEED_TIERS, MODEL_TIERS, STRATEGIC_TARGET_MARGIN, MARGIN_FLOOR,
  type ActionClass, type SpeedTier, type ProviderCandidate,
} from "@/backend/acu";

// ACU Economics Engine API.
// POST { action: "quote" | "preflight", providerCostGbp, actionClass, ... }
// POST { action: "profit", expectedRevenueGbp, expectedCostGbp, ... }
// POST { action: "arbitrate", candidates[], minQuality }
// GET  → action classes, plans, tiers, margin doctrine (no provider costs)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "quote";
  const num = (k: string, d = 0) => (typeof body[k] === "number" ? (body[k] as number) : d);

  if (action === "quote" || action === "preflight") {
    const actionClass = (["low", "medium", "high", "very_high"].includes(String(body.actionClass)) ? body.actionClass : "medium") as ActionClass;
    const input = {
      providerCostGbp: num("providerCostGbp"),
      actionClass,
      complexity: num("complexity", 1),
      demandMultiplier: num("demandMultiplier", 1),
      marginMultiplier: typeof body.marginMultiplier === "number" ? body.marginMultiplier : undefined,
      variants: num("variants", 1),
      speed: (["normal", "priority", "instant"].includes(String(body.speed)) ? body.speed : undefined) as SpeedTier | undefined,
      premiumModel: Boolean(body.premiumModel),
    };
    // Quote never returns providerCostGbp — users only ever see ACUs.
    return NextResponse.json(action === "preflight" ? preflightQuote(input) : quoteAcu(input));
  }

  if (action === "profit") {
    return NextResponse.json(profitCheck({
      expectedRevenueGbp: num("expectedRevenueGbp"),
      expectedCostGbp: num("expectedCostGbp"),
      userAcuBalance: typeof body.userAcuBalance === "number" ? body.userAcuBalance : undefined,
      requiredAcus: typeof body.requiredAcus === "number" ? body.requiredAcus : undefined,
      minMarginMultiplier: typeof body.minMarginMultiplier === "number" ? body.minMarginMultiplier : undefined,
    }));
  }

  if (action === "arbitrate") {
    const candidates = Array.isArray(body.candidates) ? (body.candidates as ProviderCandidate[]) : [];
    const winner = arbitrateProvider(candidates, num("minQuality", 0));
    return NextResponse.json({ winner, note: "Cheapest capable provider; the user receives the result and never learns which model ran it." });
  }

  return NextResponse.json({ error: "Unknown action — use quote, preflight, profit or arbitrate" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "ACU Economics Engine — the utility-company pricing layer",
    doctrine: `Never sell AI at cost. Gross margin floored at ${MARGIN_FLOOR}× (100%), strategic target ${STRATEGIC_TARGET_MARGIN}×+. Provider costs are never exposed — users only see ACUs. Every price/tier below is an indicative placeholder; the owner sets finals at launch.`,
    formula: "ACUs = Provider Cost × Complexity × Resource Weight × Margin × Demand (+ speed/premium add-ons)",
    actionClasses: ACTION_CLASSES,
    speedTiers: SPEED_TIERS,
    modelTiers: MODEL_TIERS,
    plans: PLANS,
  });
}
