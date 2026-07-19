import { NextRequest, NextResponse } from "next/server";
import { webSearch, discoverOpportunity, findLocalLeads, keywordResearch, type SearchType } from "@/backend/search";

// Real-Time Search & Opportunity Intelligence API (Serper-inspired).
// POST { action: "search", query, type?, gl?, hl? }        → structured results
// POST { action: "opportunity", niche, location?, currency? } → opportunity score
// POST { action: "leads", category, location }             → scored local leads
// POST { action: "keywords", seed, location? }             → keyword/PAA proxy
// GET → search types + doctrine + live/demo status

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "search";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

  if (action === "search") {
    const query = str("query");
    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
    const type = (["search", "news", "places", "shopping", "images"].includes(String(body.type)) ? body.type : "search") as SearchType;
    return NextResponse.json(await webSearch({ query, type, gl: str("gl"), hl: str("hl") }));
  }
  if (action === "opportunity") {
    const niche = str("niche");
    if (!niche) return NextResponse.json({ error: "niche is required" }, { status: 400 });
    return NextResponse.json(await discoverOpportunity({ niche, location: str("location"), currency: str("currency") }));
  }
  if (action === "leads") {
    const category = str("category"); const location = str("location");
    if (!category || !location) return NextResponse.json({ error: "category and location are required" }, { status: 400 });
    return NextResponse.json(await findLocalLeads({ category, location }));
  }
  if (action === "keywords") {
    const s = str("seed");
    if (!s) return NextResponse.json({ error: "seed is required" }, { status: 400 });
    return NextResponse.json(keywordResearch({ seed: s, location: str("location") }));
  }
  return NextResponse.json({ error: "Unknown action — use search, opportunity, leads or keywords" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Real-Time Search & Opportunity Intelligence (Serper-inspired)",
    types: ["search", "news", "places", "shopping", "images"],
    live: Boolean(process.env.SERPER_API_KEY),
    doctrine: "External search is an OPTIONAL accelerator — the OS stays fully useful without it. With no key the demo returns structured results; SERPER_API_KEY enables live Google data.",
  });
}
