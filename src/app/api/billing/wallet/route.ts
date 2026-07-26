import { NextRequest, NextResponse } from "next/server";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import { getWallet, FREE_SIGNUP_ACUS } from "@/backend/wallet";

// Live ACU wallet — GET returns the signed-in org's real balance, plan and
// lifetime credited/debited totals (the numbers the webhook credits and the AI
// routes debit). Demo/zero-config (no accounts) returns a modelled starter
// wallet so the Billing page still renders. Never returns another org's wallet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "wallet-read"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Demo / no accounts enforced: there is no per-user wallet — return a modelled
  // starter balance and say so, so the UI shows honest "estimate" figures.
  if (!auth.enforced || !auth.uid) {
    return NextResponse.json({
      live: false,
      wallet: { orgId: "demo", balanceAcu: FREE_SIGNUP_ACUS, planId: "free", cycle: null, lifetimeCreditedAcu: FREE_SIGNUP_ACUS, lifetimeDebitedAcu: 0 },
      note: "Demo mode — sign-in with accounts enforced to get a real, metered wallet.",
    });
  }

  const wallet = await getWallet(auth.uid);
  return NextResponse.json({ live: true, wallet });
}
