import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import { citationRadar, geoAudit, MAGNET_TOOLS } from "@/backend/geo";
import { geoReadiness } from "@/backend/geo-readiness";
import { measureCitations, defaultPrompts } from "@/backend/citation-measure";

// Strike-phase API (MW-04 / MW-02 / MW-09).
// POST { action: "audit", business, website, signals? } → GEO Readiness Score
// POST { action: "citation", business, competitors[], prompts[] } → Citation SoV
// GET                                                    → magnet-tool cluster

export async function POST(req: NextRequest) {
  // P1 denial-of-wallet: this route spends real provider budget (AI/search/crawl).
  // Rate-limit always; require auth + meter ACUs once accounts are enforced.
  const _rl = rateLimit(clientKey(req, "geo"), 60, 60_000, Date.now());
  if (!_rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(_rl.retryAfterSec) } });
  const _auth = await requireAuth(req);
  if (!_auth.ok) return NextResponse.json({ error: _auth.error }, { status: _auth.status });
  const _meter = await meterAction(_auth, "search");
  if (!_meter.allowed) return NextResponse.json({ error: _meter.error }, { status: _meter.status });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "audit") {
    // MEASURED when we have a website: fetch the site and check the signals in
    // code. The modelled geoAudit() below only runs with no URL to crawl — it can
    // never contradict a real measurement (that mismatch is why the page showed
    // 51 from one engine and 18 from another for the same business).
    const website = typeof body.website === "string" ? body.website.trim() : "";
    if (website) {
      const report = await geoReadiness(website);
      if (report.reachable) return NextResponse.json({ ...report, measured: true });
      return NextResponse.json({ ...report, measured: false });
    }
    return NextResponse.json({
      ...geoAudit({
        business: typeof body.business === "string" ? body.business : undefined,
        signals: typeof body.signals === "object" && body.signals ? (body.signals as Record<string, boolean>) : undefined,
      }),
      measured: false,
      note: "No website supplied — this is a MODELLED readiness estimate, not a measurement. Add your site URL to get the real audit.",
    });
  }

  if (body.action === "citation") {
    // MEASURED: actually ask the configured models and count who is named.
    const business = typeof body.business === "string" ? body.business : "";
    const competitors = Array.isArray(body.competitors) ? body.competitors.map(String).filter(Boolean) : [];
    const market = typeof body.market === "string" ? body.market : undefined;
    const category = typeof body.category === "string" ? body.category : undefined;
    const prompts = Array.isArray(body.prompts) && body.prompts.length
      ? body.prompts.map(String)
      : defaultPrompts(business, market, category);
    if (business) {
      const measured = await measureCitations({ business, competitors, prompts, market });
      if (measured.measured) return NextResponse.json(measured);
      // No provider key → return the honest "cannot measure" result, NOT invented shares.
      return NextResponse.json(measured);
    }
    return NextResponse.json(citationRadar({ competitors, prompts }));
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
