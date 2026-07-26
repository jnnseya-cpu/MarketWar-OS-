import { NextRequest, NextResponse } from "next/server";
import { runStrategyAgent } from "@/backend/strategy-run";
import { STRATEGY_AGENTS } from "@/shared/strategy-agents";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import { gatewayLangFrom } from "@/backend/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  → the 7 strategy agents (metadata, no system prompts)
// POST { agentId, input, priorContext? } → run one agent
export async function GET() {
  return NextResponse.json({
    agents: STRATEGY_AGENTS.map(({ systemPrompt: _sp, ...a }) => a),
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "ai-agents"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  // Require auth + meter ACUs (demo passes through; staff are not metered).
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const meter = await meterAction(auth, "llm");
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const agentId = typeof body.agentId === "string" ? body.agentId : "";
  const input = (body.input && typeof body.input === "object") ? (body.input as Record<string, string>) : {};
  const priorContext = typeof body.priorContext === "string" ? body.priorContext : undefined;
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  try {
    return NextResponse.json(await runStrategyAgent(agentId, input, priorContext, gatewayLangFrom(req)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Agent error" }, { status: 502 });
  }
}
