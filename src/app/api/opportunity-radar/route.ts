import { NextRequest, NextResponse } from "next/server";
import {
  scoreOpportunity, rankOpportunities, demoOpportunityRadar,
  SIGNAL_SOURCES, OPPORTUNITY_CATEGORIES,
  type OpportunityInput, type FactorWeights,
} from "@/backend/opportunity-radar";

// Content Opportunity Radar API (Organic Dominance §13). Merges demand signals
// into a transparent, re-weightable Opportunity Score. Signals are scored only
// from supplied inputs — never fabricated.
// POST { action: "score", input, weights? }         → one scored opportunity
// POST { action: "rank", inputs[], weights? }        → ranked opportunities
// GET  → doctrine, signal sources, categories, the formula, demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "rank";
  const weights = (body.weights as FactorWeights) ?? {};

  if (action === "score") {
    const input = body.input as OpportunityInput | undefined;
    if (!input || typeof input.topic !== "string" || input.topic.trim() === "") return NextResponse.json({ error: "score requires input.topic" }, { status: 400 });
    return NextResponse.json(scoreOpportunity(input, weights));
  }

  if (action === "rank") {
    const inputs = Array.isArray(body.inputs) ? (body.inputs as OpportunityInput[]) : null;
    if (!inputs || inputs.length === 0 || inputs.some((i) => !i || typeof i.topic !== "string" || i.topic.trim() === "")) {
      return NextResponse.json({ error: "rank requires a non-empty inputs[] where every item has a topic" }, { status: 400 });
    }
    return NextResponse.json(rankOpportunities(inputs, weights));
  }

  return NextResponse.json({ error: "Unknown action — use score or rank" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Content Opportunity Radar — transparent, re-weightable opportunity scoring",
    doctrine: "Merges 12 demand-signal sources into candidates ranked by a transparent, editable formula: Demand × Commercial Intent × Relevance × Timing × Authority × Conversion ÷ Competition. Every factor is shown so the ranking is auditable, and callers can re-weight any factor. Signals are scored from supplied inputs — never fabricated.",
    formula: "Opportunity Score = Demand × Commercial Intent × Relevance × Timing × Authority Probability × Conversion Probability ÷ Competition",
    signalSources: SIGNAL_SOURCES,
    categories: OPPORTUNITY_CATEGORIES,
    demo: demoOpportunityRadar(),
  });
}
