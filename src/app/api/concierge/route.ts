import { NextRequest, NextResponse } from "next/server";
import { concierge, demoConcierge } from "@/backend/concierge";

// AI Local Concierge — natural-language front-end over the owned Local
// Marketplace engine. POST { action: "ask", text } returns the parsed intent
// plus ranked, booking-ready matches (or a clarifying question). GET returns
// the doctrine and a fully-populated demo output. No provider cost or secrets
// are ever exposed; matches are labelled estimates.

const DOCTRINE = {
  engine: "concierge",
  summary:
    "A deterministic, language layer over discoverLocal / requestQuote / bookingOffer. Type a request in plain English; get ranked local matches with transparent reasons and a booking or quote CTA.",
  honesty:
    "Matches and price expectations are labelled estimates. Availability is a summary of marketplace signal — never a fabricated live slot count, rating or testimonial.",
  consent:
    "Booking reminders are transactional and respect the frequency architecture (max 5 marketing touches per 7 days); the concierge never initiates marketing sends.",
  reuse: "Rents no new capability — pure front-end over the owned local-marketplace engine.",
  actions: ["ask"],
};

export async function POST(req: NextRequest) {
  let body: { action?: string; text?: string };
  try {
    body = (await req.json()) as { action?: string; text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;

  switch (action) {
    case "ask": {
      const text = body.text as string | undefined;
      if (typeof text !== "string" || text.trim().length === 0) {
        return NextResponse.json({ error: "Missing required input: text" }, { status: 400 });
      }
      return NextResponse.json(concierge(text));
    }
    default:
      return NextResponse.json(
        { error: `Unknown action: ${String(action)}. Supported: ask` },
        { status: 400 },
      );
  }
}

export async function GET() {
  return NextResponse.json({ doctrine: DOCTRINE, demo: demoConcierge() });
}
