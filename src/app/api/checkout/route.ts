import { NextRequest, NextResponse } from "next/server";
import { createCheckoutLink, checkoutConfigured } from "@/backend/checkout";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";

// Tagged checkout links — POST { brandId, source, amountGbp, productName? } →
// a Stripe Checkout link pre-stamped with the brand/source metadata, so paying
// it auto-attributes revenue (via the webhook). Demo-safe without a key.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "checkout"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  // A checkout link self-attributes revenue to a brand, so in production the
  // caller must own that brand — nobody can mint a link that credits someone
  // else's ledger. With no brandId, just require an authenticated caller. Demo
  // (no Admin) passes through unchanged.
  if (brandId.trim()) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  } else {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await createCheckoutLink({
    brandId,
    source: typeof body.source === "string" ? body.source : "",
    amountGbp: typeof body.amountGbp === "number" ? body.amountGbp : Number(body.amountGbp) || 0,
    productName: typeof body.productName === "string" ? body.productName : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Tagged checkout links — payments self-attribute",
    live: checkoutConfigured,
    doctrine: "Creates a Stripe Checkout Session stamped with metadata.marketwar_brand_id + marketwar_source so the webhook records attributed revenue automatically. No `stripe` package; demo-safe without STRIPE_SECRET_KEY.",
  });
}
