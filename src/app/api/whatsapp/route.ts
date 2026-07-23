import { NextRequest, NextResponse } from "next/server";
import { whatsappOverview, emptyWhatsappOverview } from "@/backend/whatsapp";

// WhatsApp Center Engine API.
// POST { business? } → messaging overview: conversation funnel
//   (new → engaged → qualified → booked/ordered), response-time + conversion
//   metrics, a 14-day thread trend and the template pipeline. Deterministic
//   demo intelligence — badged, never fabricated "live" numbers.
// GET → engine doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const business = typeof body.business === "string" ? body.business : "";
  // No live WhatsApp traffic source is wired yet → honest empty (real funnel
  // fills from actual conversations once WHATSAPP_TOKEN + inbound are live).
  // The deterministic demo overview stays available for internal/marketing use.
  const allowDemo = body.demo === true && !process.env.WHATSAPP_TOKEN;
  return NextResponse.json(allowDemo ? whatsappOverview(business) : emptyWhatsappOverview(business));
}

export async function GET() {
  return NextResponse.json({
    engine: "WhatsApp Center Engine (conversation funnel + response/conversion metrics + template pipeline)",
    doctrine: "Ad → WhatsApp → AI qualification → offer → order → follow-up. The overview is computed deterministically from the brand as DEMO INTELLIGENCE — never fabricated live numbers. Live sending activates via the platform's shared WhatsApp pool (WHATSAPP_TOKEN). Every marketing message is consent-gated and frequency-capped.",
    funnelStages: ["new", "engaged", "qualified", "booked"],
    templates: ["welcome", "abandoned", "booking", "review-request"],
    mode: "demo-intelligence",
  });
}
