import { NextRequest, NextResponse } from "next/server";
import {
  buildArchitecture, trendHijackGate, autonomyGate, demoCampaignArchitect,
  FUNNEL_LAYERS, TREND_CATEGORIES, AUTONOMY_LEVELS,
} from "@/backend/campaign-architect";

// Campaign Architect API — SiteRaid Autonomous Campaign Architect + Trend
// Hijack relevance gate + Autonomy levels. Deterministic; scores are estimates.
// POST { action: "architecture", business, objective?, channels?, budgetGbp? }
// POST { action: "trend", trend, category?, business?, sensitiveMarkers? }
// POST { action: "autonomy", riskCategory?, brandRiskScore?, requestedLevel? }
// GET  → doctrine, funnel layers, trend categories, autonomy levels, demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "architecture";

  if (action === "architecture") {
    if (typeof body.business !== "string" || body.business.trim() === "") return NextResponse.json({ error: "architecture requires business" }, { status: 400 });
    return NextResponse.json(buildArchitecture({
      business: body.business,
      objective: typeof body.objective === "string" ? body.objective : undefined,
      channels: Array.isArray(body.channels) ? (body.channels as string[]) : undefined,
      budgetGbp: typeof body.budgetGbp === "number" ? body.budgetGbp : undefined,
    }));
  }

  if (action === "trend") {
    if (typeof body.trend !== "string" || body.trend.trim() === "") return NextResponse.json({ error: "trend requires trend" }, { status: 400 });
    return NextResponse.json(trendHijackGate({
      trend: body.trend,
      category: typeof body.category === "string" ? body.category : undefined,
      business: typeof body.business === "string" ? body.business : undefined,
      sensitiveMarkers: Array.isArray(body.sensitiveMarkers) ? (body.sensitiveMarkers as string[]) : undefined,
    }));
  }

  if (action === "autonomy") {
    return NextResponse.json(autonomyGate({
      riskCategory: typeof body.riskCategory === "string" ? body.riskCategory : undefined,
      brandRiskScore: typeof body.brandRiskScore === "number" ? body.brandRiskScore : undefined,
      requestedLevel: typeof body.requestedLevel === "number" ? body.requestedLevel : undefined,
    }));
  }

  return NextResponse.json({ error: "Unknown action — use architecture, trend or autonomy" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Campaign Architect — Autonomous Campaign Architecture + Trend Hijack + Autonomy levels",
    doctrine: "Lays out a full 5-layer funnel (awareness→advocacy) weighted to the objective without starving awareness. The Trend Hijack gate REJECTS trends that could damage the brand, exploit tragedy or mislead. Autonomy is capped by risk category — high-risk categories never reach autopilot. All scores are labelled estimates.",
    funnelLayers: FUNNEL_LAYERS,
    trendCategories: TREND_CATEGORIES,
    autonomyLevels: AUTONOMY_LEVELS,
    demo: demoCampaignArchitect(),
  });
}
