import { NextRequest, NextResponse } from "next/server";
import { designCampaign, type WarfareInput } from "@/backend/warfare";

// M-36 Autonomous Campaign Warfare Engine API.
// POST { product, audience, result, budget, location, offer?, currency?, autonomy? }
//   → the full campaign ecosystem + AI Campaign Score™ (STEPS 1–11).
// GET → the six questions the OS needs and the ecosystem it returns.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const input: WarfareInput = {
    product: str("product"),
    audience: str("audience"),
    result: str("result"),
    budget: typeof body.budget === "number" ? body.budget : Number(body.budget) || 0,
    location: str("location"),
    offer: str("offer") || undefined,
    currency: str("currency") || undefined,
    autonomy: body.autonomy === 2 || body.autonomy === 3 ? (body.autonomy as 2 | 3) : 1,
  };

  if (!input.product.trim()) {
    return NextResponse.json({ error: "product is required — the OS needs to know what you sell" }, { status: 400 });
  }

  return NextResponse.json(designCampaign(input));
}

export async function GET() {
  return NextResponse.json({
    engine: "M-36 Autonomous Campaign Warfare Engine (STEPS 1–11 + AI Campaign Score™)",
    answerOnly: ["What do you sell?", "Who do you want?", "What result?", "Budget?", "Location?", "Promotion/offer? (optional)"],
    returns: [
      "businessAnalysis", "objective", "psychology", "offers (scored)", "visuals",
      "copy (AIDA/PAS/hooks/CTA)", "hashtags (scored)", "payloads (multi-platform)",
      "landingPage spec", "distribution plan", "campaignScore (8 dims)", "autonomy plan",
    ],
    doctrine: "One prompt → the whole ecosystem. Score is a probability estimate, never a guarantee; offers stay inside the margin floor; distribution respects the frequency cap.",
  });
}
