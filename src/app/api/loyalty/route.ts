import { NextRequest, NextResponse } from "next/server";
import {
  tierFor, earnPoints, referralInvite, kFactor, demoLoyalty, TIERS,
} from "@/backend/loyalty";

// Loyalty & Referral Network Engine API (Referral Engine + Brevo loyalty).
// POST { action: "tier", points }
// POST { action: "earn", action, amountGbp? }
// POST { action: "referral", customerId }
// POST { action: "kfactor", invitesSent, inviteAcceptRate, purchaseRate }
// GET  → engine doctrine + TIERS + demo output.
//
// Doctrine: growth projections are ESTIMATES, never guarantees; referral
// invites require consent and honour a hard cap of max 5 touches per 7 days.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "tier") {
    if (typeof body.points !== "number") {
      return NextResponse.json({ error: "tier requires numeric 'points'" }, { status: 400 });
    }
    return NextResponse.json(tierFor(body.points as number));
  }

  if (action === "earn") {
    const earnAction = typeof body.earnAction === "string"
      ? (body.earnAction as string)
      : (typeof body.subject === "string" ? (body.subject as string) : "");
    if (!earnAction) {
      return NextResponse.json({ error: "earn requires 'earnAction' (e.g. purchase, review, referral_signup, referral_purchase, birthday)" }, { status: 400 });
    }
    const amountGbp = typeof body.amountGbp === "number" ? (body.amountGbp as number) : undefined;
    return NextResponse.json(earnPoints(earnAction, amountGbp));
  }

  if (action === "referral") {
    if (typeof body.customerId !== "string" || !body.customerId) {
      return NextResponse.json({ error: "referral requires non-empty string 'customerId'" }, { status: 400 });
    }
    return NextResponse.json(referralInvite(body.customerId as string));
  }

  if (action === "kfactor") {
    if (typeof body.invitesSent !== "number" || typeof body.inviteAcceptRate !== "number" || typeof body.purchaseRate !== "number") {
      return NextResponse.json({ error: "kfactor requires numeric 'invitesSent', 'inviteAcceptRate' and 'purchaseRate'" }, { status: 400 });
    }
    return NextResponse.json(kFactor(body.invitesSent as number, body.inviteAcceptRate as number, body.purchaseRate as number));
  }

  return NextResponse.json({ error: "Unknown action — use tier, earn, referral or kfactor" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Loyalty & Referral Network Engine (Referral Engine + Brevo loyalty)",
    doctrine: "Growth projections, k-factor and cycle forecasts are ESTIMATES, never guarantees, and no metric is fabricated. Referral invites require recipient consent and honour a hard cap of max 5 touches per 7 days.",
    actions: ["tier", "earn", "referral", "kfactor"],
    tiers: TIERS,
    demo: demoLoyalty(),
  });
}
