// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Runs a Marketing Strategy Agent through the AI Gateway. Chains prior outputs
// in as context so the 7 agents form one connected strategy. Live with a
// provider key; deterministic preview otherwise (honest "activating" error
// under REQUIRE_LIVE).

import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";
import { STRATEGY_BY_ID } from "@/shared/strategy-agents";

export type StrategyResult = { agentId: string; agentName: string; mode: "live" | "demo"; output: string };

export async function runStrategyAgent(
  agentId: string,
  input: Record<string, string>,
  priorContext?: string,
  lang?: string
): Promise<StrategyResult> {
  const agent = STRATEGY_BY_ID[agentId];
  if (!agent) throw new Error(`Unknown strategy agent: ${agentId}`);

  const userPrompt = [
    "Business context:",
    ...Object.entries(input)
      .filter(([, v]) => v && String(v).trim().length > 0)
      .map(([k, v]) => `- ${k}: ${v}`),
    priorContext ? `\nPrior strategy outputs (build on these, stay consistent):\n${priorContext}` : "",
    "\nProduce your section now.",
  ].join("\n");

  try {
    const res = await gatewayComplete({ system: agent.systemPrompt, prompt: userPrompt, lang });
    return { agentId: agent.id, agentName: agent.name, mode: "live", output: res.text };
  } catch (err) {
    if (err instanceof GatewayUnconfiguredError) {
      if (process.env.REQUIRE_LIVE) {
        throw new Error("Live AI is activating — the AI provider key isn't reachable yet. Please retry in a moment.");
      }
      return { agentId: agent.id, agentName: agent.name, mode: "demo", output: demoOutput(agent.name, input) };
    }
    throw err;
  }
}

function demoOutput(name: string, input: Record<string, string>): string {
  const biz = input.business || "your business";
  return [
    `## ${name} — preview`,
    ``,
    `A deterministic preview for **${biz}**. Add an AI provider key to generate the full, specific strategy.`,
    ``,
    `- Output is specific and ROI-first in live mode.`,
    `- Owned channels prioritised over paid.`,
    `- Every step tied to a customer and a measurable outcome.`,
  ].join("\n");
}
