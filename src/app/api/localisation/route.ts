import { NextRequest, NextResponse } from "next/server";
import {
  localiseCampaign,
  demoLocalisation,
  LOCALISATION_AXES,
  type LocaliseInput,
} from "@/backend/localisation";

// Global Localisation Engine API (VisualStrike F1 §11) — transcreation, not translation.
// POST { action: "localise", input } → transcreated campaign + media plan
// GET                                → doctrine + the 17 axes + demo output

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "localise") {
    const input = body.input as LocaliseInput | undefined;
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "Missing 'input' object" }, { status: 400 });
    }
    if (typeof input.headline !== "string" || input.headline.trim() === "") {
      return NextResponse.json({ error: "Missing input.headline" }, { status: 400 });
    }
    if (typeof input.body !== "string" || input.body.trim() === "") {
      return NextResponse.json({ error: "Missing input.body" }, { status: 400 });
    }
    if (!input.target || typeof input.target !== "object" || typeof input.target.country !== "string" || input.target.country.trim() === "") {
      return NextResponse.json({ error: "Missing input.target.country" }, { status: 400 });
    }
    return NextResponse.json(localiseCampaign(input));
  }

  return NextResponse.json({ error: "Unknown action — use localise" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Global Localisation Engine (VisualStrike F1 §11)",
    doctrine:
      "Transcreation, not translation — we rebuild idioms, humour and cultural references per market, " +
      "adapt currency via a fixed rate table, and flag religion/legal-sensitive markets for human review. " +
      "Outputs are ESTIMATES; marketing sends require consent and a cap of max 5 touches per 7 days.",
    axes: LOCALISATION_AXES,
    demo: demoLocalisation(),
  });
}
