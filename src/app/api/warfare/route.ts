import { NextRequest, NextResponse } from "next/server";
import { designCampaign, designCampaignWritten, type WarfareInput } from "@/backend/warfare";
import { requireAuth } from "@/backend/guard";
import { meterAction, creditAcus } from "@/backend/wallet";
import { gatewayLangFrom } from "@/backend/gateway";

// M-36 Autonomous Campaign Warfare Engine API.
// POST { product, audience, result, budget, location, offer?, currency?, autonomy? }
//   → the full campaign ecosystem + a readiness check on the brief (STEPS 1–11).
// GET → the six questions the OS needs and the ecosystem it returns.
//
// The STRUCTURE of a campaign is deterministic — vertical, objective, offers,
// formats, distribution, governance. Only the COPY goes through a model, and
// only when one is connected. Without one the campaign still builds; its words
// are labelled as assembled rather than written, and no AI charge is kept.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

  // Copy written for this brand, metered as the AI action it is. If no model is
  // reachable the deterministic campaign is returned instead and the charge is
  // refunded — a customer must never pay AI prices for concatenation.
  const auth = await requireAuth(req);
  if (auth.ok) {
    const meter = await meterAction(auth, "llm");
    if (meter.allowed) {
      const written = await designCampaignWritten(input, { lang: gatewayLangFrom(req) });
      if (written.written !== "ai" && meter.metered && meter.charged && auth.uid) {
        await creditAcus(auth.uid, meter.charged).catch(() => {});
      }
      return NextResponse.json({ ...written, chargedAcu: written.written === "ai" ? meter.charged ?? 0 : 0, balanceAcu: meter.balanceAcu });
    }
    // Out of ACUs. The campaign STRUCTURE costs nothing to compute and is still
    // worth having, so it is returned — but the copy is template copy, and
    // saying so is the whole point. Silently serving concatenated words on a
    // page labelled AI is exactly the failure this codebase keeps fixing.
    return NextResponse.json({
      ...designCampaign(input),
      written: "template",
      copyBlocked: true,
      balanceAcu: meter.balanceAcu,
      copyNote:
        `The plan below is real — objective, offers, formats, budget split and governance are computed from your brief. ` +
        `THE WORDS ARE NOT WRITTEN: ${meter.error ?? "you are out of ACUs."} Top up and run this again and the copy is written for your brand instead of assembled from a template.`,
    });
  }
  return NextResponse.json({
    ...designCampaign(input),
    written: "template",
    copyNote:
      "The plan below is computed from your brief and is real. The COPY is assembled from a template — sign in, with an AI provider connected, and it is written for your brand instead.",
  });
}

export async function GET() {
  return NextResponse.json({
    engine: "M-36 Autonomous Campaign Warfare Engine (STEPS 1–11 + brief readiness check)",
    answerOnly: ["What do you sell?", "Who do you want?", "What result?", "Budget?", "Location?", "Promotion/offer? (optional)"],
    returns: [
      "businessAnalysis", "objective", "psychology", "offers (scored)", "visuals",
      "copy (AIDA/PAS/hooks/CTA)", "hashtags (scored)", "payloads (multi-platform)",
      "landingPage spec", "distribution plan", "campaignScore (8 dims)", "autonomy plan",
    ],
    doctrine: "One prompt → the whole ecosystem. Score is a probability estimate, never a guarantee; offers stay inside the margin floor; distribution respects the frequency cap.",
  });
}
