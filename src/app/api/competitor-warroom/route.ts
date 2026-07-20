import { NextRequest, NextResponse } from "next/server";
import {
  monitorCompetitor,
  scanWeaknesses,
  exploit,
  battlecard,
  demoWarRoom,
  WEAKNESS_TYPES,
  EXPLOITATION_ACTIONS,
} from "@/backend/competitor-warroom";

// Competitor War Room + Weakness Scanner API (Organic Dominance §12).
// POST { action: "monitor",   input: { competitor, signals? } }
// POST { action: "scan",      input: { competitor, complaints? } }
// POST { action: "exploit",   input: { competitor, weakness } }
// POST { action: "battlecard",input: { competitor } }
// GET  → doctrine + weakness types + exploitation actions + demo war room.

type MonitorInput = { competitor: string; signals?: string[] };
type ScanInput = { competitor: string; complaints?: string[] };
type ExploitInput = { competitor: string; weakness: string };
type BattlecardInput = { competitor: string };

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const input = (body.input ?? {}) as Record<string, unknown>;
  const competitor = typeof input.competitor === "string" ? input.competitor.trim() : "";

  if (action === "monitor") {
    if (!competitor) return NextResponse.json({ error: "input.competitor is required" }, { status: 400 });
    return NextResponse.json(monitorCompetitor(body.input as MonitorInput));
  }

  if (action === "scan") {
    if (!competitor) return NextResponse.json({ error: "input.competitor is required" }, { status: 400 });
    return NextResponse.json(scanWeaknesses(body.input as ScanInput));
  }

  if (action === "exploit") {
    if (!competitor) return NextResponse.json({ error: "input.competitor is required" }, { status: 400 });
    if (typeof input.weakness !== "string" || !input.weakness.trim()) {
      return NextResponse.json({ error: "input.weakness is required" }, { status: 400 });
    }
    return NextResponse.json(exploit(body.input as ExploitInput));
  }

  if (action === "battlecard") {
    if (!competitor) return NextResponse.json({ error: "input.competitor is required" }, { status: 400 });
    return NextResponse.json(battlecard(body.input as BattlecardInput));
  }

  return NextResponse.json(
    { error: "Unknown action — use monitor, scan, exploit or battlecard" },
    { status: 400 },
  );
}

export async function GET() {
  return NextResponse.json({
    engine: "Competitor War Room + Weakness Scanner (Organic Dominance §12)",
    doctrine:
      "Watch competitors across search, AI answers, social and sentiment; scan for exploitable weaknesses; recommend the strongest ETHICAL play. All scores are ESTIMATES, never measured facts. We never fabricate competitor data or use knocking copy — we win on our genuine strengths. Marketing sends require consent and a cap of 5 touches per 7 days.",
    actions: ["monitor", "scan", "exploit", "battlecard"],
    weaknessTypes: WEAKNESS_TYPES,
    exploitationActions: EXPLOITATION_ACTIONS,
    demo: demoWarRoom(),
  });
}
