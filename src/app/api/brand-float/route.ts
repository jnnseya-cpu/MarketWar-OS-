import { NextRequest, NextResponse } from "next/server";
import { balance, startTopUp, stripeConfigured } from "@/backend/brand-float";
import { floatSummary } from "@/shared/float-ledger";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

// THE BRAND'S COMMISSION FLOAT.
//
// GET  ?brandId=…        → the balance, and whether money can be added at all
// POST { brandId, gbp }  → a Stripe Checkout URL to top it up
//
// Nothing here credits anything. Only the Stripe webhook credits a float, on a
// payment Stripe has confirmed — crediting on a redirect back from checkout
// would let anyone mint float by visiting a URL.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brandId = (req.nextUrl.searchParams.get("brandId") || "").trim();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const state = await balance(brandId);
  return NextResponse.json({
    ...state,
    summary: floatSummary(state),
    canTopUp: stripeConfigured(),
    // Said plainly, because a mission cannot be funded without it and the owner
    // would otherwise be left wondering why the button does nothing.
    note: stripeConfigured()
      ? "Money held here funds creator commissions. A mission cannot promise more than is available."
      : "Payments are not configured on this deployment (STRIPE_SECRET_KEY), so the float cannot be topped up and no mission can be funded.",
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "brand-float"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const gbp = Number(body.gbp);
  if (!Number.isFinite(gbp) || gbp < 1) {
    return NextResponse.json({ error: "Enter an amount of £1 or more." }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const res = await startTopUp({
    brandId,
    pence: Math.round(gbp * 100),
    returnUrl: `${origin}/dashboard/partner-network?topup=done`,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 503 });
  return NextResponse.json({ ok: true, url: res.url, sessionId: res.sessionId });
}
