import { NextRequest, NextResponse } from "next/server";
import { scoreIntent, radar, demoIntentRadar, INTENT_TYPES, type CompanySignals } from "@/backend/intent-radar";

// Buying Intent Radar API (Apollo-class B2B intent — the DemandWar Room).
// POST { action: "score", input }        → intent radar for one target company
// POST { action: "radar", companies }    → batch, sorted hottest intent first
// GET → doctrine + INTENT_TYPES + demoIntentRadar()
// Distinct from /api/intent (intent-router routes USER requests to tools);
// this reads B2B BUYING intent for target companies. Scores are ESTIMATES.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "score") {
    const input = body.input as CompanySignals | undefined;
    if (!input || typeof input.company !== "string" || input.company.trim().length === 0) {
      return NextResponse.json({ error: "input.company is required" }, { status: 400 });
    }
    return NextResponse.json(scoreIntent(input));
  }

  if (action === "radar") {
    const companies = body.companies as CompanySignals[] | undefined;
    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: "companies must be a non-empty array" }, { status: 400 });
    }
    if (companies.some((c) => !c || typeof c.company !== "string" || c.company.trim().length === 0)) {
      return NextResponse.json({ error: "every company entry requires a non-empty company name" }, { status: 400 });
    }
    return NextResponse.json({ results: radar(companies) });
  }

  return NextResponse.json({ error: "Unknown action — use score or radar" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Buying Intent Radar (Apollo-class B2B intent) — DemandWar Room",
    doctrine: "Reads B2B BUYING intent for TARGET COMPANIES across ten signal types. Every sub-score and composite is a labelled ESTIMATE, derived only from the signals supplied — we never fabricate signals, metrics or testimonials. Distinct from the user-request intent router. Where these scores feed marketing sends, honour consent and a frequency cap of max 5 touches per 7 days.",
    intentTypes: INTENT_TYPES,
    demo: demoIntentRadar(),
  });
}
