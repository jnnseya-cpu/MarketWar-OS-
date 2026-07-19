import { NextRequest, NextResponse } from "next/server";
import { generateLandingPage, selectPageType, type LandingInput } from "@/backend/landing";

// AI Landing Page Creation Engine API (§4.6–§4.14).
// POST { business, objective, offer?, audience?, location?, product?, painPoint? }
//   → full LandingPage (type, structure, copy, form, tracking, 8 scores, A/B).
// GET → the 10 page types + doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const input: LandingInput = {
    business: str("business") || "Brixton Grill House",
    objective: str("objective"), offer: str("offer"), audience: str("audience"),
    location: str("location"), product: str("product"), painPoint: str("painPoint"),
    whatsappNumber: str("whatsappNumber"),
  };
  return NextResponse.json(generateLandingPage(input));
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Landing Page Creation Engine — the central agent (attention → action)",
    pageTypes: ["lead_capture", "whatsapp_conversion", "booking", "order", "app_download", "partner_signup", "event_ticket", "reactivation", "local_seo", "offer_claim"],
    exampleSelection: { "get whatsapp orders": selectPageType("get whatsapp orders"), "book appointments": selectPageType("book appointments"), "sell tickets": selectPageType("sell event tickets") },
    doctrine: "Never a generic page. Every page is built from the business, objective, offer, audience and pain — with the 10-section structure, 8-score matrix, A/B variants and objective-driven forms; scores are estimates, real performance is measured post-launch.",
  });
}
