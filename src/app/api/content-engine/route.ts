import { NextRequest, NextResponse } from "next/server";
import {
  buildBrief, classifyClaim, assemble, demoContentEngine, isKnownOutputType,
  OUTPUT_TYPES, CONTROLS, EVIDENCE_CLASSES, DOCTRINE,
  type BriefInput, type AssembleInput,
} from "@/backend/content-engine";

// Autonomous Content Factory API (Organic Dominance §14) — evidence-first.
// This is the content-engine backend; distinct from the content-factory agent.
// POST { action: "brief", input:{ outputType, topic, controls?, highRisk? } }
// POST { action: "classify", text, hasSource?, highRisk? }
// POST { action: "assemble", input:{ outputType, topic, claims?, highRisk? } }
// GET  → doctrine, output types, controls, evidence classes, demo output.
// Never exposes provider cost or secrets; never fabricates stats or citations.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "brief") {
    const input = body.input as BriefInput | undefined;
    if (!input || typeof input.outputType !== "string" || typeof input.topic !== "string" || input.topic.length === 0) {
      return NextResponse.json({ error: "brief requires input.outputType and input.topic" }, { status: 400 });
    }
    if (!isKnownOutputType(input.outputType)) {
      return NextResponse.json({ error: `Unknown outputType — use one of: ${OUTPUT_TYPES.join(", ")}` }, { status: 400 });
    }
    return NextResponse.json(buildBrief(input));
  }

  if (action === "classify") {
    if (typeof body.text !== "string" || body.text.length === 0) {
      return NextResponse.json({ error: "classify requires text" }, { status: 400 });
    }
    const hasSource = body.hasSource === true;
    const highRisk = body.highRisk === true;
    return NextResponse.json(classifyClaim(body.text as string, hasSource, highRisk));
  }

  if (action === "assemble") {
    const input = body.input as AssembleInput | undefined;
    if (!input || typeof input.outputType !== "string" || typeof input.topic !== "string" || input.topic.length === 0) {
      return NextResponse.json({ error: "assemble requires input.outputType and input.topic" }, { status: 400 });
    }
    if (!isKnownOutputType(input.outputType)) {
      return NextResponse.json({ error: `Unknown outputType — use one of: ${OUTPUT_TYPES.join(", ")}` }, { status: 400 });
    }
    return NextResponse.json(assemble(input));
  }

  return NextResponse.json({ error: "Unknown action — use brief, classify or assemble" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Autonomous Content Factory — evidence-first content engine",
    doctrine: DOCTRINE,
    outputTypes: OUTPUT_TYPES,
    controls: CONTROLS,
    evidenceClasses: EVIDENCE_CLASSES,
    demo: demoContentEngine(),
  });
}
