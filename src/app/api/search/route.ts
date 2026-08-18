import { NextRequest, NextResponse } from "next/server";
import { webSearch, discoverOpportunity, findLocalLeads, keywordResearch, type SearchType } from "@/backend/search";
import { parseBusinessModel } from "@/backend/go-to-market";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { marketLocation } from "@/backend/brand-market";
import { meterAction } from "@/backend/wallet";

// Real-Time Search & Opportunity Intelligence API (Serper-inspired).
// POST { action: "search", query, type?, gl?, hl? }        → structured results
// POST { action: "opportunity", niche, location?, currency? } → opportunity score
// POST { action: "leads", category, location }             → scored local leads
// POST { action: "keywords", seed, location? }             → keyword/PAA proxy
// GET → search types + doctrine + live/demo status

export const runtime = "nodejs";
// Reserves the platform maximum. This route does slow external work (calls the live search provider),
// and without a budget the function is killed part-way through: the caller
// gets no JSON at all — just "Request failed" — and any work already done
// goes unreported, which is how a send gets repeated.
export const maxDuration = 60;


export async function POST(req: NextRequest) {
  // Denial-of-wallet defence: Serper spends real budget per query. Rate-limit
  // always; require auth + meter ACUs once accounts are enforced (demo passes through).
  const rl = rateLimit(clientKey(req, "search"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "search";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

  // Explicit location wins; otherwise the brand's own market answers.
  // Empty when neither is set — a hardcoded country fallback is how a
  // business in one place gets results from another.
  const geo = async (explicit: string | undefined) =>
    await marketLocation(str("brandId"), explicit, (body.targetMarket as never) ?? null);

  // Meter the actions that hit the external search provider (keywords is local).
  if (action === "search" || action === "opportunity" || action === "leads") {
    const meter = await meterAction(auth, "search");
    if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });
  }

  if (action === "search") {
    const query = str("query");
    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
    const type = (["search", "news", "places", "shopping", "images"].includes(String(body.type)) ? body.type : "search") as SearchType;
    return NextResponse.json(await webSearch({ query, type, gl: str("gl"), hl: str("hl") }));
  }
  if (action === "opportunity") {
    const niche = str("niche");
    if (!niche) return NextResponse.json({ error: "niche is required" }, { status: 400 });
    // The business model is CARRIED ACROSS, not dropped. The page asks which it
    // is because it changes the plan materially — only a physical product has
    // suppliers to source — and a route that quietly defaults everybody to
    // "service" would hand a product business no supplier routes at all. This
    // is the codebase's oldest defect shape: a value that exists on one side of
    // a boundary and never reaches the other.
    return NextResponse.json(await discoverOpportunity({
      niche,
      location: await geo(str("location")),
      currency: str("currency"),
      model: parseBusinessModel(body.model),
    }));
  }
  if (action === "leads") {
    const category = str("category"); const location = await geo(str("location"));
    if (!category || !location) return NextResponse.json({ error: "category and location are required" }, { status: 400 });
    return NextResponse.json(await findLocalLeads({ category, location }));
  }
  if (action === "keywords") {
    const s = str("seed");
    if (!s) return NextResponse.json({ error: "seed is required" }, { status: 400 });
    return NextResponse.json(keywordResearch({ seed: s, location: await geo(str("location")) }));
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
