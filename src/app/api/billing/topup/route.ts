import { NextRequest, NextResponse } from "next/server";
import { createTopupCheckout } from "@/backend/checkout";
import { MIN_TOPUP_GBP } from "@/backend/subscription";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// ACU top-up — POST { amountGbp, acus?, orgId?, planId? } → a Stripe Checkout
// link that credits ACUs to the wallet on payment (via the webhook). If acus is
// omitted it's derived at £1 = 100 ACUs. No discount on top-ups. Demo-safe.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "topup"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const amountGbp = typeof body.amountGbp === "number" ? body.amountGbp : Number(body.amountGbp) || 0;
  if (!(amountGbp > 0)) return NextResponse.json({ error: "amountGbp must be greater than zero" }, { status: 400 });
  // Below the minimum, Stripe's fixed 20p fee makes the top-up unprofitable —
  // the action margin would fall under the owner's 100% net floor. Refuse rather
  // than sell at a loss.
  if (amountGbp < MIN_TOPUP_GBP) {
    return NextResponse.json({ error: `The minimum top-up is £${MIN_TOPUP_GBP}. Smaller amounts are consumed by payment fees.` }, { status: 400 });
  }
  // HOW MANY ACUs IS NOT THE CLIENT'S TO SAY.
  //
  // This read `body.acus` and passed it on. It was saved only by the checkout
  // ignoring the argument and deriving the count from the amount itself — so
  // the leak was latent, not absent: honouring that unused parameter, which is
  // exactly what a tidy-up would do, turns "pay £1" into "get a million ACUs".
  // The count is derived from the money, at the one place that also sets the
  // price Stripe charges, and it is not accepted from anywhere else.

  // WHOSE WALLET GETS THE ACUs is decided by the session, never by the request.
  // This used to read body.orgId, so the client chose the wallet the webhook
  // would credit — a customer could pay and have the ACUs land anywhere, and a
  // typo'd id would strand a real payment in a wallet nobody owns. The
  // authenticated uid is the only identity we have actually verified. (In demo
  // there is no Admin SDK and uid is null; the checkout still works, and the
  // wallet only activates once accounts are enforced.)
  const result = await createTopupCheckout({
    amountGbp,
    orgId: auth.uid ?? undefined,
    planId: typeof body.planId === "string" ? body.planId : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
