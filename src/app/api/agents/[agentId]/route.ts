import { NextRequest, NextResponse } from "next/server";

import { AGENTS } from "@/shared/agents";
import { runAgent } from "@/backend/provider";
import { gatewayLangFrom } from "@/backend/gateway";
import { logAgentRun } from "@/backend/db";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import { checkDomainAuth, normaliseDomain, type DomainAuthReport } from "@/backend/dns-auth";
import { nextStepFrom } from "@/backend/next-step";

// Denial-of-wallet defence: every AI call can spend real provider budget once
// keys are live, so cap requests per caller. 240/min is generous for genuine
// use (and for the smoke suite's ~39 sequential calls) but stops a runaway.
const AGENT_RATE_LIMIT = 240;
const AGENT_WINDOW_MS = 60_000;

// Agents call the AI gateway, which budgets up to 50s. A route that calls it must
// reserve more, or the function is killed mid-call and the customer sees nothing.
export const maxDuration = 60;

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

  // Pre-flight: gather the facts the agent would otherwise ASK FOR.
  //
  // The Deliverability Commander used to end every report with "send me the
  // sending domain so I can check its live SPF/DKIM/DMARC records" — a dead end,
  // because the domain was already in the form above it and there was nowhere to
  // reply. SPF, DKIM and DMARC are public DNS records, so the platform reads them
  // itself and hands the agent the answer instead of the question.
  let domainAuth: DomainAuthReport | undefined;
  if (agentId === "email-commander") {
    const domain = normaliseDomain(input.website || input.domain || input.business || "");
    if (domain) {
      try {
        domainAuth = await checkDomainAuth(domain);
        input.liveDnsFacts = [
          `LIVE DNS for ${domainAuth.domain} — read from public records just now. These are FACTS. Do not ask the user for them, and do not tell them to send you the domain; you have it and you have checked it.`,
          ...domainAuth.checks.map((c) => `- ${c.label}: ${c.status.toUpperCase()}${c.value ? ` — ${c.value}` : ""}. ${c.detail}`),
          `Authentication score ${domainAuth.score}/100. Ready to send: ${domainAuth.readyToSend ? "yes" : "no"}.`,
          domainAuth.blockers.length ? `Blocking: ${domainAuth.blockers.join(" | ")}` : "",
          "Build the plan around this ACTUAL state. End with the next action the user takes in this product, never with a request for information already given.",
        ].filter(Boolean).join("\n");
      } catch { /* the agent still runs; it just has less to work with */ }
    }
  }

  try {
    const result = await runAgent(agentId, input, gatewayLangFrom(req));
    // Persist the run when Firebase is configured; never block the response.
    logAgentRun(result, input).catch(() => {});
    // The report travels beside the prose so the UI can render the records and
    // the exact values to publish, rather than leaving the customer to retype
    // them out of a paragraph.
    // The closing "Next:" line, routed to the engine that performs it. Without
    // this the plan stalls one step from being used: good advice, no button.
    const nextStep = nextStepFrom(result.output, agentId);
    return NextResponse.json({ ...result, ...(domainAuth ? { domainAuth } : {}), ...(nextStep ? { nextStep } : {}) });
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
