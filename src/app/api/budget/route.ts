import { NextRequest, NextResponse } from "next/server";
import { protectBudget, type BudgetCampaignInput } from "@/backend/budget";

// Budget Protection Engine API (The Financial Shield).
// POST { business?, monthlyBudget?, campaigns? } → computed protection board:
//   per-campaign Stop/Fix/Scale verdict, waste protected, projected saving,
//   reroute return and standing-order rules. Every figure is an ESTIMATE /
//   demo intelligence — never a hardcoded absolute.
// GET → engine doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const business = typeof body.business === "string" ? body.business : "";
  const monthlyBudget = typeof body.monthlyBudget === "number" ? body.monthlyBudget : 600;
  const campaigns = Array.isArray(body.campaigns) ? (body.campaigns as BudgetCampaignInput[]) : undefined;
  return NextResponse.json(protectBudget(business, monthlyBudget, campaigns));
}

export async function GET() {
  return NextResponse.json({
    engine: "Budget Protection Engine (The Financial Shield)",
    doctrine:
      "Spend allocation is COMPUTED per brand from the monthly budget and campaign efficiency — no hardcoded absolutes. Campaigns that spend without producing revenue are killed and their budget rerouted to proven winners. Every figure is a clearly-labelled ESTIMATE / demo intelligence until live ad-account spend replaces the modelled campaigns in place.",
    verdicts: ["STOP", "FIX", "SCALE"],
  });
}
