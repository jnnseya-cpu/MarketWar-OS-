import { NextRequest, NextResponse } from "next/server";
import { citationRadar, geoAudit, MAGNET_TOOLS } from "@/backend/geo";

// Strike-phase API (MW-04 / MW-02 / MW-09).
// POST { action: "audit", business, website, signals? } → GEO Readiness Score
// POST { action: "citation", business, competitors[], prompts[] } → Citation SoV
// GET                                                    → magnet-tool cluster

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "audit") {
    return NextResponse.json(
      geoAudit({
        business: typeof body.business === "string" ? body.business : undefined,
        website: typeof body.website === "string" ? body.website : undefined,
        signals: typeof body.signals === "object" && body.signals ? (body.signals as Record<string, boolean>) : undefined,
      })
    );
  }

  if (body.action === "citation") {
    return NextResponse.json(
      citationRadar({
        business: typeof body.business === "string" ? body.business : undefined,
        competitors: Array.isArray(body.competitors) ? body.competitors.map(String) : undefined,
        prompts: Array.isArray(body.prompts) ? body.prompts.map(String) : undefined,
      })
    );
  }

  return NextResponse.json({ error: "Unknown action — use audit or citation" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Organic Dominance — Strike phase (MW-02 / MW-04 / MW-09)",
    magnets: MAGNET_TOOLS,
    doctrine: "The free GEO audit is the acquisition front door; readiness/visibility is measured, never claimed as attribution.",
  });
}
