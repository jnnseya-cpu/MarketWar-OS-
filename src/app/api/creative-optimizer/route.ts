import { NextRequest, NextResponse } from "next/server";
import {
  buildTestMatrix, classifyPerformance, optimisationLoop, demoOptimizer,
  TEST_VARIABLES, type VariableSpec, type VariantResult, type Variant,
} from "@/backend/creative-optimizer";

// Creative Optimizer API — VisualStrike Autonomous Testing & Optimisation.
// Optimises on REAL supplied metrics; never fabricates performance data.
// POST { action: "matrix", variables: VariableSpec[], cap? }        → controlled test matrix
// POST { action: "classify", result: VariantResult }                → one of 6 performance distinctions
// POST { action: "optimise", results: VariantResult[], variants: Variant[] } → 8-step loop
// GET  → doctrine, the 19 variables, demo optimisation run

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "matrix";

  if (action === "matrix") {
    const variables = Array.isArray(body.variables) ? (body.variables as VariableSpec[]) : [];
    if (!variables.length) return NextResponse.json({ error: "matrix requires variables[]" }, { status: 400 });
    const cap = typeof body.cap === "number" ? body.cap : 12;
    return NextResponse.json(buildTestMatrix(variables, cap));
  }

  if (action === "classify") {
    const result = body.result as VariantResult | undefined;
    if (!result || typeof result.views !== "number") return NextResponse.json({ error: "classify requires result{views,clicks,conversions,...}" }, { status: 400 });
    return NextResponse.json(classifyPerformance(result));
  }

  if (action === "optimise") {
    const results = Array.isArray(body.results) ? (body.results as VariantResult[]) : [];
    const variants = Array.isArray(body.variants) ? (body.variants as Variant[]) : [];
    if (!results.length || !variants.length) return NextResponse.json({ error: "optimise requires results[] and variants[]" }, { status: 400 });
    return NextResponse.json(optimisationLoop(results, variants));
  }

  return NextResponse.json({ error: "Unknown action — use matrix, classify or optimise" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Creative Optimizer — VisualStrike Autonomous Testing & Optimisation",
    doctrine: "Builds a controlled test matrix, promotes winners, kills waste, recombines winning elements and remembers rejected ones. Distinguishes the 6 ways a variant looks good but isn't (high views/low intent, strong sales/poor margin, ...) so attention is never mistaken for profit. Operates on real supplied metrics — never fabricates performance.",
    testVariables: TEST_VARIABLES,
    demo: demoOptimizer(),
  });
}
