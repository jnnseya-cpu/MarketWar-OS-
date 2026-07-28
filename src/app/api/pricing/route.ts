import { NextResponse } from "next/server";
import { planCards, pricingFaq } from "@/backend/plan-value";
import { topUps } from "@/backend/subscription";

// Plan comparison + FAQ, computed from the SAME price table the wallet debits
// against. A pricing page assembled by hand drifts out of date and quietly
// becomes a lie; this one cannot, because every count is derived.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    plans: planCards(),
    topUps: topUps(),
    faq: pricingFaq(),
    doctrine:
      "Allowances are shown as the work they buy, at the prices actually charged, rather than as an opaque credit count. Every action's price is visible before it is spent, and running out pauses spending rather than triggering a bill.",
  });
}
