import { NextRequest, NextResponse } from "next/server";
import {
  checkAnswer,
  causalSafeguard,
  demoAiAccuracy,
  AI_ENGINES,
  ISSUE_TYPES,
  FIX_ACTIONS,
  type CheckAnswerInput,
  type CausalSafeguardInput,
} from "@/backend/ai-accuracy";

// AI Answer Accuracy Monitor API
// (Organic Dominance §10 — Generative Search Visibility).
//
// POST { action: "check",  input: CheckAnswerInput }   → audit one AI answer
// POST { action: "causal", input: CausalSafeguardInput } → control-adjusted lift
// GET  → doctrine + AI_ENGINES + ISSUE_TYPES + demoAiAccuracy()
//
// Doctrine: scores are ESTIMATES; the engine never fabricates data. The causal
// safeguard exists so we never claim ALL AI-referral growth was caused by our
// optimisation — growth is control-adjusted before it is ever attributed.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "check") {
    const input = body.input as CheckAnswerInput | undefined;
    if (!input || typeof input.brand !== "string" || input.brand.trim().length === 0) {
      return NextResponse.json({ error: "check requires input.brand (non-empty string)" }, { status: 400 });
    }
    if (typeof input.engine !== "string" || input.engine.length === 0) {
      return NextResponse.json({ error: "check requires input.engine (string)" }, { status: 400 });
    }
    if (typeof input.answerText !== "string") {
      return NextResponse.json({ error: "check requires input.answerText (string)" }, { status: 400 });
    }
    return NextResponse.json(checkAnswer(input));
  }

  if (action === "causal") {
    const input = body.input as CausalSafeguardInput | undefined;
    if (
      !input ||
      typeof input.treatedTrafficBefore !== "number" ||
      typeof input.treatedTrafficAfter !== "number" ||
      typeof input.controlTrafficBefore !== "number" ||
      typeof input.controlTrafficAfter !== "number"
    ) {
      return NextResponse.json(
        { error: "causal requires input with numeric treatedTrafficBefore/After and controlTrafficBefore/After" },
        { status: 400 },
      );
    }
    return NextResponse.json(causalSafeguard(input));
  }

  return NextResponse.json({ error: "Unknown action — use check or causal" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Answer Accuracy Monitor (Organic Dominance §10 — Generative Search Visibility)",
    doctrine:
      "Audits what generative-search engines actually say about a brand. Scores are ESTIMATES; the engine never fabricates data, metrics or reviews. The causal safeguard control-adjusts growth so we never claim ALL AI-referral growth was caused by our optimisation.",
    actions: ["check", "causal"],
    aiEngines: AI_ENGINES,
    issueTypes: ISSUE_TYPES,
    fixActions: FIX_ACTIONS,
    demo: demoAiAccuracy(),
  });
}
