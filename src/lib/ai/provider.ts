import { AGENTS } from "@/lib/ai/agents";
import { gatewayComplete, GatewayUnconfiguredError } from "@/lib/ai/gateway";
import type { AgentResult } from "@/lib/types";

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
