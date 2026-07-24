import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import {
  HONEST_PROMISE, POSITIONING, OPERATING_MODES, OPERATING_LOOP, MONEY_MAP,
  classifyIntent, opportunityScore, aiReadinessScore,
} from "@/backend/search-dominance";

// Dynamic Search Dominance Engine — command + transparent scoring API.
// GET  → honest positioning, operating modes, loop, money-map categories.
// POST { action:"intent", query }        → intent classification
// POST { action:"score", inputs }        → transparent Opportunity Score
// POST { action:"aiReadiness", inputs }  → AI-recommendation readiness score
// Pure heuristics on the caller's own inputs — no ranking promise, no PII.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    engine: "MarketWar Dynamic Search Dominance Engine",
    honestPromise: HONEST_PROMISE,
    positioning: POSITIONING,
    operatingModes: OPERATING_MODES,
    operatingLoop: OPERATING_LOOP,
    moneyMap: MONEY_MAP,
    doctrine: "No guaranteed rankings — search engines don't guarantee crawling, indexing or serving. Every score is a transparent, labelled heuristic, never a promise.",
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "search-dominance"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "intent") {
    const query = typeof body.query === "string" ? body.query : "";
    if (!query.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });
    return NextResponse.json({ query, ...classifyIntent(query) });
  }
  if (action === "score") {
    const inputs = (body.inputs && typeof body.inputs === "object" ? body.inputs : {}) as Record<string, number>;
    return NextResponse.json(opportunityScore(inputs));
  }
  if (action === "aiReadiness") {
    const inputs = (body.inputs && typeof body.inputs === "object" ? body.inputs : {}) as Record<string, number>;
    return NextResponse.json(aiReadinessScore(inputs));
  }
  return NextResponse.json({ error: "Unknown action — use intent, score or aiReadiness" }, { status: 400 });
}
