import { NextRequest, NextResponse } from "next/server";
import { compareChannels, campaignReadiness, type ReadinessInput } from "@/backend/roi-engine";

// AI Marketing ROI Engine API — the growth-channel arbitrator.
// POST { action: "channels", business, objective, budgetGbp?, avgOrderValueGbp? }
//   → per-channel predicted CAC / conversion / ROI + budget allocation + the
//     cheapest next customer (owned channels favoured).
// POST { action: "readiness", ...flags } → AI Marketing Guarantee Score.
// GET → engine doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "channels";
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : undefined);

  if (action === "channels") {
    return NextResponse.json(compareChannels({
      business: typeof body.business === "string" ? body.business : undefined,
      objective: typeof body.objective === "string" ? body.objective : undefined,
      budgetGbp: num("budgetGbp"),
      avgOrderValueGbp: num("avgOrderValueGbp"),
      currency: typeof body.currency === "string" ? body.currency : undefined,
    }));
  }
  if (action === "readiness") {
    const flags = body as unknown as ReadinessInput;
    return NextResponse.json(campaignReadiness(flags));
  }
  return NextResponse.json({ error: "Unknown action — use channels or readiness" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Marketing ROI Engine — buy the cheapest next customer, not the most reach",
    doctrine: "Owned channels first (they lower CAC and build the moat); rented ad platforms are ROI amplifiers. Predictions are estimates, re-ranked on real performance; the engine never bypasses platform policy, scrapes protected data, or guarantees results.",
    positioning: "We don't sell advertising — we help allocate budget to the highest-return channels and optimise on measurable performance.",
  });
}
