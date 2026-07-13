// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

import { AGENTS } from "@/shared/agents";
import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";
import type { AgentResult } from "@/shared/types";

// Runs an agent through the AI Gateway (Claude → OpenAI → Gemini with
// automatic failover). With no provider keys configured the platform runs in
// Demo Intelligence mode using the agent's deterministic simulated output,
// so every module works with zero config.
export async function runAgent(
  agentId: string,
  input: Record<string, string>
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
    const result = await gatewayComplete({
      system: agent.systemPrompt,
      prompt: userPrompt,
    });
    return {
      agentId: agent.id,
      agentName: agent.name,
      mode: "live",
      output: result.text,
      generatedAt,
    };
  } catch (err) {
    if (err instanceof GatewayUnconfiguredError) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        mode: "demo",
        output: agent.demoOutput(input),
        generatedAt,
      };
    }
    throw err;
  }
}