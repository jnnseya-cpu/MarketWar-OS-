import { AGENTS } from "@/lib/ai/agents";
import type { AgentResult } from "@/lib/types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Runs an agent. With ANTHROPIC_API_KEY set the call goes to the live model;
// without it the platform runs in Demo Intelligence mode using the agent's
// deterministic simulated output, so every module works with zero config.
export async function runAgent(
  agentId: string,
  input: Record<string, string>
): Promise<AgentResult> {
  const agent = AGENTS[agentId];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const generatedAt = new Date().toISOString();

  if (!apiKey) {
    return {
      agentId: agent.id,
      agentName: agent.name,
      mode: "demo",
      output: agent.demoOutput(input),
      generatedAt,
    };
  }

  const userPrompt = [
    "Business context:",
    ...Object.entries(input)
      .filter(([, v]) => v && String(v).trim().length > 0)
      .map(([k, v]) => `- ${k}: ${v}`),
    "",
    "Execute your directive against this business now.",
  ].join("\n");

  const res = await fetchWithRetry(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 2048,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const output = data.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n");

  return {
    agentId: agent.id,
    agentName: agent.name,
    mode: "live",
    output,
    generatedAt,
  };
}

// Transient 429/5xx errors retry with exponential backoff.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("AI provider unreachable");
}
