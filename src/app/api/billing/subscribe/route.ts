import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionCheckout } from "@/backend/checkout";
import { PLANS, planEconomics } from "@/backend/subscription";
import { rateLimit, clientKey } from "@/backend/guard";

// Choose-a-plan checkout — POST { planId, cycle: "monthly"|"annual" }.
// Free → no checkout (activate immediately). Paid → a Stripe subscription
// checkout at the monthly or annual (30% off) price. Demo-safe without a key.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "subscribe"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const planId = typeof body.planId === "string" ? body.planId : "";
  const cycle = body.cycle === "annual" ? "annual" : "monthly";
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return NextResponse.json({ error: `Unknown plan (${PLANS.map((p) => p.id).join(", ")})` }, { status: 400 });

  // Free plan: nothing to pay — activate straight away.
  if (plan.monthlyGbp === 0) {
    return NextResponse.json({ ok: true, free: true, planId: plan.id, cycle, url: null, note: "Free plan activated — no payment needed." });
  }

  const eco = planEconomics(plan);
  const amountGbp = cycle === "annual" ? eco.annualGbp : eco.monthlyGbp;
  const result = await createSubscriptionCheckout({ planId: plan.id, planName: plan.name, cycle, amountGbp });
  return NextResponse.json({ ...result, free: false, amountGbp }, { status: result.ok ? 200 : 400 });
}
