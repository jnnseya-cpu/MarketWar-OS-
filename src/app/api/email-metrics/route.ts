import { NextRequest, NextResponse } from "next/server";
import { emailPosture } from "@/backend/email-metrics";

// Email Deliverability Posture API (M-34 Email Command Center intelligence).
// POST { business?, listSize?, days? } → projected deliverability posture:
//   list-hygiene composition, sendable count, projected inbox/spam/bounce split
//   (all ESTIMATES) and an N-day delivery PROJECTION series. NOT sent history —
//   replaced in place by real provider telemetry once sends go live.
// GET → engine doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const business = typeof body.business === "string" ? body.business : "";
  const listSize = typeof body.listSize === "number" ? body.listSize : undefined;
  const days = typeof body.days === "number" ? body.days : 14;
  return NextResponse.json(emailPosture(business, listSize, days));
}

export async function GET() {
  return NextResponse.json({
    engine: "Email Deliverability Posture Engine (M-34)",
    doctrine:
      "Headline posture is COMPUTED from the brand + list size, not hardcoded. List-hygiene composition, sendable count and the projected inbox/spam/bounce split are clearly-labelled ESTIMATES; the N-day series is a delivery PROJECTION, never booked send history. Real provider telemetry replaces these estimates in place once sends go live.",
    outputs: ["composition", "sendableCount", "listHealthPct", "projectedInboxRatePct", "projectedSpamRatePct", "projectedBounceRatePct", "series"],
  });
}
