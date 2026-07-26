import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionCheckout, checkoutConfigured } from "@/backend/checkout";
import { PLANS, planEconomics } from "@/backend/subscription";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// Choose-a-plan checkout — POST { planId, cycle: "monthly"|"annual" }.
// Free → no checkout (activate immediately). Paid → a Stripe subscription
// checkout at the monthly or annual (30% off) price. Demo-safe without a key.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "subscribe"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

  // B4 guard: never grant a PAID plan without a real payment. If Stripe isn't
  // configured on a PRODUCTION deployment, refuse rather than returning a demo
  // "continue" path that the client would treat as activation. (Demo/dev without
  // Stripe stays explorable — there are no real accounts or entitlements there.)
  if (!checkoutConfigured && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, billingUnavailable: true, error: "Payments aren't enabled on this deployment yet — set STRIPE_SECRET_KEY. No paid plan is granted without a completed payment." },
      { status: 503 },
    );
  }

  const eco = planEconomics(plan);
  const amountGbp = cycle === "annual" ? eco.annualGbp : eco.monthlyGbp;
  // Thread the authenticated user's uid as the org id so the webhook credits the
  // right wallet on payment. In demo (no Admin) uid is null — the checkout still
  // works; the wallet only activates once accounts are enforced.
  const result = await createSubscriptionCheckout({ planId: plan.id, planName: plan.name, cycle, amountGbp, orgId: auth.uid ?? undefined });
  return NextResponse.json({ ...result, free: false, amountGbp }, { status: result.ok ? 200 : 400 });
}
