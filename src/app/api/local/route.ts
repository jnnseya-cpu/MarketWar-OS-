import { NextRequest, NextResponse } from "next/server";
import { analyzeLocalPresence, demoLocalReport } from "@/backend/local";

// Local Domination Engine API (Own-your-postcode pack).
// POST { business?, location? } → local-presence intelligence: map-pack rank
//   estimate, GBP completeness signals, review velocity/rating trend, citation
//   gaps, and a prioritized local action list.
// GET → engine doctrine + zero-config demo report.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const business = typeof body.business === "string" ? body.business : "";
  const location = typeof body.location === "string" ? body.location : "";
  return NextResponse.json(analyzeLocalPresence({ business, location }));
}

export async function GET() {
  return NextResponse.json({
    engine: "Local Domination Engine (map-pack rank, GBP completeness, review velocity, citation gaps → prioritized local actions)",
    doctrine:
      "Given a business + location, compute local-presence intelligence and rank the actions that move local ranking. Every rank/score/count/trend is a DETERMINISTIC ESTIMATE, clearly badged — never measured telemetry. Live Google Business Profile, map-pack and citation feeds replace the estimates when connected. Review asks are consent-based.",
    outputs: ["mapPackRank", "profile.completeness", "reviews.velocity", "citations", "actions"],
    demo: demoLocalReport(),
  });
}
