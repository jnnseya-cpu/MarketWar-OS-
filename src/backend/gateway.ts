// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar AI Gateway — one door to Claude (Anthropic), OpenAI and Gemini.
//
// The gateway owns provider routing so the rest of the platform never talks to
// a vendor API directly:
//   runAgent() → gateway.complete() → [anthropic → openai → gemini] → text
//
// - Providers are tried in AI_GATEWAY_ORDER (default: anthropic,openai,gemini),
//   skipping any without an API key configured.
// - Each provider gets retries with exponential backoff on 429/5xx/network
//   errors; a provider that still fails hands over to the next one (failover).
// - With no keys at all the caller falls back to Demo Intelligence mode.

export type ProviderId = "anthropic" | "openai" | "gemini";

export interface GatewayRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface GatewayResponse {
  text: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  attempts: { provider: ProviderId; error: string }[];
}

export interface ProviderStatus {
  id: ProviderId;
  configured: boolean;
  model: string;
}

const DEFAULT_MAX_TOKENS = 4096;
const RETRIES_PER_PROVIDER = 3;

interface Adapter {
  id: ProviderId;
  model: () => string;
  configured: () => boolean;
  complete: (req: GatewayRequest) => Promise<string>;
}

// ---------------------------------------------------------------- Anthropic
// Claude Messages API. Adaptive thinking is set explicitly (on Opus-tier
// models omitting `thinking` runs without thinking).
const anthropic: Adapter = {
  id: "anthropic",
  model: () => process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async complete(req) {
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropic.model(),
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    const data = (await res.json()) as {
      stop_reason?: string;
      content: { type: string; text?: string }[];
    };
    if (data.stop_reason === "refusal") {
      throw new Error("anthropic: request declined by safety classifiers");
    }
    const text = data.content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("anthropic: empty completion");
    return text;
  },
};

// ------------------------------------------------------------------ OpenAI
// Responses API (POST /v1/responses).
const openai: Adapter = {
  id: "openai",
  model: () => process.env.OPENAI_MODEL || "gpt-5-mini",
  configured: () => Boolean(process.env.OPENAI_API_KEY),
  async complete(req) {
    const res = await fetchWithRetry("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: openai.model(),
        instructions: req.system,
        input: req.prompt,
        max_output_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
    });
    const data = (await res.json()) as {
      output?: { type: string; content?: { type: string; text?: string }[] }[];
    };
    const text = (data.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text" && c.text)
      .map((c) => c.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("openai: empty completion");
    return text;
  },
};

// ------------------------------------------------------------------ Gemini
// Google Generative Language API (generateContent).
const gemini: Adapter = {
  id: "gemini",
  model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
  configured: () => Boolean(process.env.GEMINI_API_KEY),
  async complete(req) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${gemini.model()}:generateContent`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY as string,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: { maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS },
      }),
    });
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("gemini: empty completion");
    return text;
  },
};

const ADAPTERS: Record<ProviderId, Adapter> = { anthropic, openai, gemini };

function routingOrder(): Adapter[] {
  const raw = process.env.AI_GATEWAY_ORDER || "anthropic,openai,gemini";
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderId => s in ADAPTERS);
  const unique = [...new Set(ids)];
  return unique.map((id) => ADAPTERS[id]);
}

export function gatewayStatus(): { order: ProviderId[]; providers: ProviderStatus[]; live: boolean } {
  const order = routingOrder();
  const providers = order.map((a) => ({
    id: a.id,
    configured: a.configured(),
    model: a.model(),
  }));
  return {
    order: order.map((a) => a.id),
    providers,
    live: providers.some((p) => p.configured),
  };
}

// Run a completion through the gateway. Throws only when every configured
// provider fails; throws a specific error when none is configured so callers
// can fall back to demo mode.
export class GatewayUnconfiguredError extends Error {
  constructor() {
    super("No AI provider configured");
    this.name = "GatewayUnconfiguredError";
  }
}

export async function gatewayComplete(req: GatewayRequest): Promise<GatewayResponse> {
  const candidates = routingOrder().filter((a) => a.configured());
  if (candidates.length === 0) throw new GatewayUnconfiguredError();

  const attempts: { provider: ProviderId; error: string }[] = [];
  for (const adapter of candidates) {
    const started = Date.now();
    try {
      const text = await adapter.complete(req);
      return {
        text,
        provider: adapter.id,
        model: adapter.model(),
        latencyMs: Date.now() - started,
        attempts,
      };
    } catch (err) {
      attempts.push({
        provider: adapter.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw new Error(
    `All AI providers failed: ${attempts.map((a) => `${a.provider} (${a.error})`).join("; ")}`
  );
}

// Shared HTTP layer: retries 429/5xx and network errors with exponential
// backoff, honouring Retry-After when present. Non-retryable statuses throw
// immediately with the provider's error body for diagnosis.
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES_PER_PROVIDER; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const body = await res.text().catch(() => "");
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        const retryAfter = Number(res.headers.get("retry-after"));
        const delay = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("HTTP ")) throw err;
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("provider unreachable");
}