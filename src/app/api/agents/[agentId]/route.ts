import { NextRequest, NextResponse } from "next/server";
import { AGENTS } from "@/shared/agents";
import { runAgent } from "@/backend/provider";
import { gatewayLangFrom } from "@/backend/gateway";
import { logAgentRun } from "@/backend/db";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// Denial-of-wallet defence: every AI call can spend real provider budget once
// keys are live, so cap requests per caller. 240/min is generous for genuine
// use (and for the smoke suite's ~39 sequential calls) but stops a runaway.
const AGENT_RATE_LIMIT = 240;
const AGENT_WINDOW_MS = 60_000;

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId } = params;
  if (!AGENTS[agentId]) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });
  }

  const rl = rateLimit(clientKey(req, "agents"), AGENT_RATE_LIMIT, AGENT_WINDOW_MS, Date.now());
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded — slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  // Require auth + meter ACUs (demo passes through; staff are not metered).
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const meter = await meterAction(auth, "llm");
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  let input: Record<string, string> = {};
  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      input = Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, String(v ?? "")])
      );
    }
  } catch {
    // empty body is fine — agent runs on defaults
  }

  try {
    const result = await runAgent(agentId, input, gatewayLangFrom(req));
    // Persist the run when Firebase is configured; never block the response.
    logAgentRun(result, input).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({
    agents: Object.values(AGENTS).map(({ id, name, role, description }) => ({
      id,
      name,
      role,
      description,
    })),
  });
}
