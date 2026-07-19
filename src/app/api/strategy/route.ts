import { NextRequest, NextResponse } from "next/server";
import {
  buildCustomerAvatar, buildMessaging, buildChannelStrategy, buildContentPlan,
  buildFunnel, buildPaidAdsStrategy, buildBattlePlan, type StrategyInput,
} from "@/backend/strategy";

// 7-Agent Marketing Strategy Chain API.
// POST { action: "avatar"|"messaging"|"channels"|"content"|"funnel"|"paidads"|"full", ...input }
//   "full" runs the whole connected chain → one Battle Plan.
// GET → the 7-stage workflow order.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "full";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : undefined);
  const input: StrategyInput = {
    business: str("business") || "Brixton Grill House",
    product: str("product"), audience: str("audience"), location: str("location"),
    offer: str("offer"), priceGbp: num("priceGbp"), painPoint: str("painPoint"),
    monthlyBudgetGbp: num("monthlyBudgetGbp"),
  };

  if (action === "avatar") return NextResponse.json(buildCustomerAvatar(input));
  if (action === "messaging") return NextResponse.json(buildMessaging(input, buildCustomerAvatar(input)));
  if (action === "channels") return NextResponse.json(buildChannelStrategy(input));
  if (action === "content") return NextResponse.json(buildContentPlan(input, buildChannelStrategy(input).recommendedChannels));
  if (action === "funnel") return NextResponse.json(buildFunnel(input));
  if (action === "paidads") return NextResponse.json(buildPaidAdsStrategy(input));
  if (action === "full") return NextResponse.json(buildBattlePlan(input));

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "7-Agent Marketing Strategy Chain (connected, each reuses the prior output)",
    workflow: ["customer_avatar", "message_weapon", "channel_commander", "content_war_plan", "funnel_architect", "paid_ads_risk_control", "marketing_battle_plan"],
    doctrine: "The Funnel Architect always requires a landing page (the central agent). Paid ads are risk-gated — 'do not spend yet' until the offer/page/tracking/follow-up are ready. Owned channels first.",
  });
}
