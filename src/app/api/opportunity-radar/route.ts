import { NextRequest, NextResponse } from "next/server";
import { listBoard, addToBoard, moveOnBoard } from "@/backend/opportunity-board-store";
import { boardView, type Column } from "@/shared/opportunity-board";
import { resolveBrandAccess } from "@/backend/brand-access";
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
// --- §95, the board that scoring feeds ---
// POST { action: "board",  brandId }                 → the columns, and what has stalled
// POST { action: "adopt",  brandId, id, topic, opportunityScore? } → onto the board
// POST { action: "move",   brandId, id, to, note? }  → between columns, rules enforced
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

  // The board. Brand-scoped like everything that belongs to somebody.
  if (action === "board" || action === "adopt" || action === "move") {
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    if (!brandId) return NextResponse.json({ error: "brandId is required — a board is always somebody's." }, { status: 400 });
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const at = new Date().toISOString();
    const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "you";
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (action === "board") {
      return NextResponse.json(boardView(await listBoard(brandId), at));
    }
    if (action === "adopt") {
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      if (!id || !topic) return NextResponse.json({ error: "adopt needs an id and a topic" }, { status: 400 });
      const r = await addToBoard({
        brandId, id, topic, at, by,
        opportunityScore: typeof body.opportunityScore === "number" ? body.opportunityScore : undefined,
      });
      return r.ok ? NextResponse.json({ item: r.item }) : NextResponse.json({ error: r.error }, { status: 409 });
    }
    const to = typeof body.to === "string" ? (body.to as Column) : ("" as Column);
    const note = typeof body.note === "string" ? body.note : undefined;
    const r = await moveOnBoard({ brandId, id, to, by, note, at });
    // 400 rather than 500: a refused move is the board working, not failing.
    return r.ok ? NextResponse.json({ item: r.item }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown action — use score, rank, board, adopt or move" }, { status: 400 });
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
