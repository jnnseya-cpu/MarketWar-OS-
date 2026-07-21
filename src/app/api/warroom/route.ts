import { NextRequest, NextResponse } from "next/server";
import { buildWarBoard } from "@/backend/warroom";
import { brandSummary } from "@/backend/ledger";

// Campaign War Room Engine API.
// POST { business?, brandId? } → the live campaign board: active campaigns each
//   with channel, status, spend, results, ROAS and a Stop/Fix/Scale verdict,
//   plus roll-up metrics. When brandId is supplied, real attributed revenue is
//   pulled from the results ledger and folded onto matching campaigns (mode →
//   "live"); otherwise it is deterministic demo intelligence, badged.
// GET → engine doctrine.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const business = typeof body.business === "string" ? body.business : "";
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";

  let ledger = null;
  if (brandId) {
    try { ledger = await brandSummary(brandId); } catch { ledger = null; }
  }
  return NextResponse.json(buildWarBoard(business, ledger));
}

export async function GET() {
  return NextResponse.json({
    engine: "Campaign War Room Engine (live campaign board + Stop/Fix/Scale verdicts)",
    doctrine: "Every campaign carries a verdict — losers die, winners get scale orders. The board is deterministic demo intelligence until an ad account is connected; real attributed revenue is pulled from the results ledger when a brandId is supplied and folded onto matching campaigns (marked Live). No fabricated figures.",
    verdicts: ["SCALE", "FIX", "STOP", "TESTING"],
    perCampaign: ["channel", "status", "spend", "leads", "messages", "orders", "revenue", "roas", "costPerOrder", "verdict"],
    mode: "demo-intelligence | live (with ledger)",
  });
}
