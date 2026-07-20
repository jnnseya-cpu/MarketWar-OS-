import { NextRequest, NextResponse } from "next/server";
import {
  crisisSeverity,
  earlyWarning,
  demoCrisis,
  WARNING_SIGNALS,
  SEVERITY_FACTORS,
  CRISIS_WORKFLOWS,
  type CrisisSeverityInput,
  type Mention,
} from "@/backend/crisis-command";

// Reputation & Crisis Command API (Organic Dominance §19).
// POST { action: "severity",      input: { factors?, signals? } }
// POST { action: "early-warning", mentions: [{ text, sentiment?, authorReach? }] }
// GET  → doctrine + warning signals + severity factors + workflows + demo.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "severity") {
    if (typeof body.input !== "object" || body.input === null) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }
    return NextResponse.json(crisisSeverity(body.input as CrisisSeverityInput));
  }

  if (action === "early-warning") {
    if (!Array.isArray(body.mentions)) {
      return NextResponse.json({ error: "mentions must be an array" }, { status: 400 });
    }
    return NextResponse.json(earlyWarning(body.mentions as Mention[]));
  }

  return NextResponse.json(
    { error: "Unknown action — use severity or early-warning" },
    { status: 400 },
  );
}

export async function GET() {
  return NextResponse.json({
    engine: "Reputation & Crisis Command (Organic Dominance §19)",
    doctrine:
      "Detect early warning signals, score crisis severity across ten factors, and escalate along the Monitor -> Respond -> Coordinate -> Executive ladder. All severity, velocity and sentiment numbers are ESTIMATES, never measured facts — we never fabricate mentions, metrics, reviews or testimonials. No content is auto-published: every response and every higher level REQUIRES human approval, and any outbound marketing send needs consent and a cap of 5 touches per 7 days.",
    actions: ["severity", "early-warning"],
    warningSignals: WARNING_SIGNALS,
    severityFactors: SEVERITY_FACTORS,
    crisisWorkflows: CRISIS_WORKFLOWS,
    demo: demoCrisis(),
  });
}
