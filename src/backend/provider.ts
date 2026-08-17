// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

import { claimReport } from "@/backend/claim-guard";
import { AGENTS } from "@/shared/agents";
import { gatewayComplete, GatewayUnconfiguredError, demoFallbackAllowed, LIVE_AI_UNAVAILABLE } from "@/backend/gateway";
import { aiUnavailableMessage } from "@/backend/capabilities";
import { withConciseStyle } from "@/backend/agent-style";
import type { AgentResult } from "@/shared/types";

/**
 * How long an agent's answer is reused.
 *
 * Deliberately short. The cost saving argues for hours and the product argues
 * for minutes: a customer who presses the same button twice in eight seconds
 * wants one answer, and a customer who comes back after lunch wants a fresh
 * one. Fifteen minutes is where a repeat is almost certainly the first case.
 */
export const AGENT_CACHE_TTL_MS = 15 * 60 * 1000;

// Runs an agent through the AI Gateway (Claude → OpenAI → Gemini with
// automatic failover). With no provider keys configured the platform runs in
// Demo Intelligence mode using the agent's deterministic simulated output,
// so every module works with zero config.
export async function runAgent(
  agentId: string,
  input: Record<string, string>,
  lang?: string,
  /**
   * How long the caller can still wait. An agent writes a full strategy, not a
   * chat reply, so the route's remaining budget is passed down rather than left
   * to the gateway's chat-sized default.
   */
  budget?: { budgetMs?: number; perCallMs?: number; paid?: boolean; regenerate?: boolean },
): Promise<AgentResult> {
  const agent = AGENTS[agentId];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  const generatedAt = new Date().toISOString();
  const userPrompt = [
    "Business context:",
    ...Object.entries(input)
      .filter(([, v]) => v && String(v).trim().length > 0)
      .map(([k, v]) => `- ${k}: ${v}`),
    "",
    "Execute your directive against this business now.",
  ].join("\n");

  try {
    // NEVER PAY TWICE FOR THE SAME ANSWER — scoped to the brand, so nothing is
    // ever shared across tenants, and short enough that a deliberate re-run
    // later is genuinely fresh. Fifteen minutes is the window in which a repeat
    // is a double click rather than a request for a different answer; press
    // Regenerate and it goes straight to the provider.
    const scope = (input.brandId || "").trim();
    const result = await gatewayComplete({
      system: withConciseStyle(agent.systemPrompt),
      prompt: userPrompt,
      lang,
      cache: scope ? { scope, ttlMs: AGENT_CACHE_TTL_MS, regenerate: budget?.regenerate } : undefined,
    }, budget ?? {});
    return {
      agentId: agent.id,
      agentName: agent.name,
      mode: "live",
      output: result.text,
      generatedAt,
      cached: result.cached || undefined,
      cachedAt: result.cachedAt,
      // Code gate: scan what the model produced BEFORE the user can act on it.
      // A prompt rule can be ignored; this cannot. Supplied inputs are passed in
      // so a figure the CUSTOMER gave us is never flagged as fabricated.
      claims: claimReport(result.text, Object.values(input).join(" ")),
    };
  } catch (err) {
    if (err instanceof GatewayUnconfiguredError) {
      // A hosted production build NEVER returns the canned narrative: it is
      // invented financials about a real business, and a small "Demo
      // intelligence" pill does not undo a page of confident prose. See
      // demoFallbackAllowed() for why this is no longer left to an env var.
      if (!demoFallbackAllowed()) throw new Error(aiUnavailableMessage());
      // Zero-config demo (local/dev/no-key): deterministic output so nothing breaks.
      const demoText = agent.demoOutput(input);
      return {
        agentId: agent.id,
        agentName: agent.name,
        mode: "demo",
        output: demoText,
        generatedAt,
        claims: claimReport(demoText, Object.values(input).join(" ")),
      };
    }
    throw err;
  }
}