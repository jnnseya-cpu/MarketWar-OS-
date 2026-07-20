import { NextRequest, NextResponse } from "next/server";
import { createTopupCheckout } from "@/backend/checkout";
import { ACU_PER_GBP } from "@/backend/acu";
import { rateLimit, clientKey } from "@/backend/guard";

// ACU top-up — POST { amountGbp, acus?, orgId?, planId? } → a Stripe Checkout
// link that credits ACUs to the wallet on payment (via the webhook). If acus is
// omitted it's derived at £1 = 100 ACUs. No discount on top-ups. Demo-safe.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "topup"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const amountGbp = typeof body.amountGbp === "number" ? body.amountGbp : Number(body.amountGbp) || 0;
  if (!(amountGbp > 0)) return NextResponse.json({ error: "amountGbp must be greater than zero" }, { status: 400 });
  const acus = typeof body.acus === "number" && body.acus > 0 ? Math.round(body.acus) : Math.round(amountGbp * ACU_PER_GBP);

  const result = await createTopupCheckout({
    amountGbp, acus,
    orgId: typeof body.orgId === "string" ? body.orgId : undefined,
    planId: typeof body.planId === "string" ? body.planId : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
