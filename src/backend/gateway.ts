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
  lang?: string; // target output language (English display name, e.g. "French"); English = no-op
}

// Read the caller's target language from the request (x-mw-lang header carries a
// BCP-47 code like "fr" or "fr-FR"). Returns the English language NAME for the
// gateway's lang hook, or undefined for English/unknown (a no-op). Every route
// can pass `lang: gatewayLangFrom(req)` into gatewayComplete to localise output.
export function gatewayLangFrom(req: { headers: { get(name: string): string | null } }): string | undefined {
  const code = (req.headers.get("x-mw-lang") || "").trim();
  if (!code || /^en/i.test(code)) return undefined;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code.split("-")[0]);
    return name && !/^en/i.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
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
  cooling?: boolean;
}

const DEFAULT_MAX_TOKENS = 4096;
const RETRIES_PER_PROVIDER = 3;

// ---------------------------------------------------------------------------
// Deadlines. This is what makes the gateway RELIABLE rather than usually-fine.
//
// Without a per-request timeout, a provider that accepts a connection and then
// holds it open blocks until the serverless function is killed. The caller gets
// nothing, no error is logged, and it cannot be reproduced — the exact shape of
// "it worked yesterday". Both big providers do this occasionally under load.
//
// A single timeout is not enough either. With three retries and exponential
// backoff, one slow provider can consume the whole function budget, so the
// FALLBACK provider that exists for reliability never gets tried. So there are
// two budgets: one per HTTP call, and one for the whole gateway call, and every
// wait is checked against the overall deadline before it is taken.
// ---------------------------------------------------------------------------

// Longest any single provider call may take. Generous enough for a long
// completion, short enough that a hang leaves time to fall over to the next
// provider.
const PER_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 25_000);
// Longest the whole gatewayComplete may take, across every provider and retry.
// Deliberately under the tightest route budget so the caller returns an ERROR
// the customer can read, rather than the platform returning nothing at all.
const OVERALL_TIMEOUT_MS = Number(process.env.AI_TOTAL_TIMEOUT_MS || 50_000);
// Backoff is capped: an 8-second sleep inside a 50-second budget is most of the
// budget spent waiting rather than working.
const MAX_BACKOFF_MS = 4_000;
// The least time worth giving a provider. Below this, starting the call only
// guarantees another timeout, so the slot is better spent on the next one.
const MIN_PROVIDER_MS = 8_000;
// How long a provider that just failed is moved to the BACK of the order.
//
// Without this, a provider that is timing out costs its full slice on EVERY
// request — the customer waits 25 seconds for a failure before the working
// provider is even tried, on every page, all day. Demoting it means the first
// request pays that once and the rest go straight to what works. It is a
// demotion and not a ban: if every provider is cooling, the order is unchanged
// and all of them are still attempted, so a blip can never take the AI offline.
const PROVIDER_COOLDOWN_MS = Number(process.env.AI_PROVIDER_COOLDOWN_MS || 300_000);
const coolingUntil = new Map<ProviderId, number>();

/** Record that a provider failed, so the next request does not wait on it first. */
export function markProviderCooling(id: ProviderId, now = Date.now()): void {
  coolingUntil.set(id, now + PROVIDER_COOLDOWN_MS);
}
export function providerCooling(id: ProviderId, now = Date.now()): boolean {
  return (coolingUntil.get(id) ?? 0) > now;
}
/** Test seam — the cooldown is process state and would otherwise leak between tests. */
export function __resetProviderCooldowns(): void { coolingUntil.clear(); }

/** Healthy providers first, cooling ones after, each group keeping its configured order. */
export function preferHealthy<T extends { id: ProviderId }>(list: T[], now = Date.now()): T[] {
  const healthy = list.filter((a) => !providerCooling(a.id, now));
  const cooling = list.filter((a) => providerCooling(a.id, now));
  return [...healthy, ...cooling];
}

interface Adapter {
  id: ProviderId;
  model: () => string;
  configured: () => boolean;
  // `deadline` is an absolute epoch-ms budget for the whole gateway call, so a
  // slow provider cannot spend the time its fallback needs.
  complete: (req: GatewayRequest, deadline?: number) => Promise<string>;
}

// ---------------------------------------------------------------- Anthropic
// Claude Messages API. Adaptive thinking is set explicitly (on Opus-tier
// models omitting `thinking` runs without thinking).
const anthropic: Adapter = {
  id: "anthropic",
  model: () => process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  configured: () => Boolean(anthropicKey()),
  async complete(req, deadline) {
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropic.model(),
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      }),
    }, deadline);
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
  configured: () => Boolean(openaiKey()),
  async complete(req, deadline) {
    const res = await fetchWithRetry("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openaiKey()}`,
      },
      body: JSON.stringify({
        model: openai.model(),
        instructions: req.system,
        input: req.prompt,
        max_output_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
    }, deadline);
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
// Google publishes this key under two names depending on which console you
// generate it from; accepting both stops a correctly-purchased key sitting
// unused because it was pasted under the other one.
// Every key is read through here. A value pasted into a dashboard often carries
// a trailing newline or a leading space; sent as an HTTP header that either
// throws "invalid header value" or is rejected by the provider, and both surface
// as "the provider is broken" rather than "the value has whitespace on it".
function envKey(...names: string[]): string {
  for (const n of names) {
    const v = (process.env[n] || "").trim();
    if (v) return v;
  }
  return "";
}
function geminiKey(): string { return envKey("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"); }
function anthropicKey(): string { return envKey("ANTHROPIC_API_KEY"); }
function openaiKey(): string { return envKey("OPENAI_API_KEY"); }

const gemini: Adapter = {
  id: "gemini",
  model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
  configured: () => Boolean(geminiKey()),
  async complete(req, deadline) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${gemini.model()}:generateContent`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiKey(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: { maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS },
      }),
    }, deadline);
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

const DEFAULT_ORDER: ProviderId[] = ["anthropic", "openai", "gemini"];

/** Entries in AI_GATEWAY_ORDER that name no known provider — almost always a typo. */
export function unknownProvidersInOrder(raw = process.env.AI_GATEWAY_ORDER || ""): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((s) => !(s in ADAPTERS));
}

/**
 * AI_GATEWAY_ORDER expresses PREFERENCE, never permission.
 *
 * It used to be an allowlist: any provider not named in it was dropped from the
 * gateway entirely. So a deployment with a valid, paid GEMINI_API_KEY in
 * production never called Gemini once — not because the key was missing, but
 * because an ordering variable did not mention it. The failure then read "All AI
 * providers failed: anthropic…; openai…", with no hint that a third working
 * provider had been excluded by configuration.
 *
 * That is the worst class of bug in a platform like this: a paid capability
 * silently switched off, invisible in the error, and impossible to diagnose from
 * the outside. A variable whose job is to order a list must never be able to
 * remove things from it. Named providers now come first in the order given, and
 * every other known provider follows — so the only thing that decides whether a
 * provider is used is whether its key is set.
 *
 * Separator is any comma or whitespace, so a value pasted with a stray newline
 * or an extra space still parses. Unknown words are ignored for routing and
 * reported by unknownProvidersInOrder() so a typo is visible instead of silent.
 */
function routingOrder(): Adapter[] {
  const raw = process.env.AI_GATEWAY_ORDER || "";
  const named = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderId => s in ADAPTERS);
  const preferred = [...new Set(named)];
  const rest = DEFAULT_ORDER.filter((id) => !preferred.includes(id));
  return [...preferred, ...rest].map((id) => ADAPTERS[id]);
}

export function gatewayStatus(): { order: ProviderId[]; providers: ProviderStatus[]; live: boolean; healthyCount: number; note: string } {
  const order = routingOrder();
  const providers = order.map((a) => ({
    id: a.id,
    configured: a.configured(),
    model: a.model(),
    // Surfaced so a health page can show "configured but currently demoted"
    // rather than a flat green tick beside a provider that is timing out.
    cooling: providerCooling(a.id),
  }));
  const configured = providers.filter((p) => p.configured);
  const healthy = configured.filter((p) => !p.cooling);
  const missing = providers.filter((p) => !p.configured).map((p) => p.id);
  return {
    order: order.map((a) => a.id),
    providers,
    live: configured.length > 0,
    healthyCount: healthy.length,
    note: configured.length === 0
      ? "No AI provider is configured — every AI surface runs in demo mode."
      : configured.length === 1
        ? `Only ${configured[0].id} is configured. There is no fallback: if it is slow or down, every AI surface fails.${missing.length ? ` Add ${missing.join(" or ")} to get one.` : ""}`
        : `${configured.length} providers configured${healthy.length < configured.length ? `, ${configured.length - healthy.length} currently demoted after a failure` : ""}.${missing.length ? ` Not configured: ${missing.join(", ")}.` : ""}`,
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

export async function gatewayComplete(reqIn: GatewayRequest): Promise<GatewayResponse> {
  // Language: one central injection point — if a non-English target language is
  // set, instruct the model to answer entirely in it. Every engine that routes
  // through the gateway inherits this automatically.
  const lang = (reqIn.lang || "").trim();
  const req: GatewayRequest = lang && !/^(en|english)/i.test(lang)
    ? { ...reqIn, system: `${reqIn.system}\n\nIMPORTANT: Write your entire response in ${lang}. Use natural, native ${lang} — not a literal translation. Keep proper nouns, product names and URLs as-is.` }
    : reqIn;

  const all = routingOrder();
  const candidates = preferHealthy(all.filter((a) => a.configured()));
  // Providers that were never eligible. Naming them is the difference between
  // "All AI providers failed: anthropic…; openai…" — which invites the fair
  // question "and what about Gemini?" — and an error that already answers it.
  const unconfigured = all.filter((a) => !a.configured()).map((a) => a.id);
  if (candidates.length === 0) throw new GatewayUnconfiguredError();

  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const attempts: { provider: ProviderId; error: string }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const adapter = candidates[i];
    const providersLeft = candidates.length - i;
    const remaining = deadline - Date.now();

    // Out of budget — stop rather than starting a call that cannot finish.
    if (remaining <= MIN_PROVIDER_MS) {
      attempts.push({ provider: adapter.id, error: "skipped — overall gateway deadline reached" });
      break;
    }

    // Each provider gets a FAIR SLICE, not the whole budget.
    //
    // Handing the first provider the entire deadline is why a slow Anthropic
    // produced "anthropic (timed out after 24s); openai (skipped — overall
    // gateway deadline reached)": the first adapter timed out, retried, and
    // spent all 50 seconds, so the fallback that exists precisely for this case
    // never got to run and the customer saw a total failure. Reserving time for
    // the providers behind it means a fallback always gets a real attempt.
    // The last remaining provider gets whatever is left, so nothing is wasted.
    const slice = providersLeft > 1
      ? Math.max(MIN_PROVIDER_MS, Math.floor(remaining / providersLeft))
      : remaining;
    const providerDeadline = Math.min(deadline, Date.now() + slice);

    const started = Date.now();
    try {
      const text = await adapter.complete(req, providerDeadline);
      coolingUntil.delete(adapter.id);   // it works again — restore it at once
      return {
        text,
        provider: adapter.id,
        model: adapter.model(),
        latencyMs: Date.now() - started,
        attempts,
      };
    } catch (err) {
      // Demote it so the NEXT request does not spend its slice here first.
      markProviderCooling(adapter.id);
      attempts.push({
        provider: adapter.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // The message matters: a customer seeing "nothing happened" cannot act, but
  // "every provider timed out" tells them and us exactly what went wrong.
  const tried = attempts.map((a) => `${a.provider} (${a.error})`).join("; ");
  const notConfigured = unconfigured.length
    ? ` Not configured, so never tried: ${unconfigured.join(", ")} — adding ${unconfigured.length === 1 ? "that key" : "one of those keys"} gives the gateway another provider to fall over to.`
    : " Every configured provider was tried.";
  throw new Error(`All AI providers failed: ${tried}.${notConfigured}`);
}

// Shared HTTP layer: retries 429/5xx and network errors with exponential
// backoff, honouring Retry-After when present. Non-retryable statuses throw
// immediately with the provider's error body for diagnosis.
async function fetchWithRetry(url: string, init: RequestInit, deadline = Date.now() + OVERALL_TIMEOUT_MS): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES_PER_PROVIDER; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    // Never wait longer than the overall budget allows, even on the first try.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(PER_REQUEST_TIMEOUT_MS, remaining));
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      const body = await res.text().catch(() => "");
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        const retryAfter = Number(res.headers.get("retry-after"));
        const wanted = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        const delay = Math.min(wanted, MAX_BACKOFF_MS, Math.max(0, deadline - Date.now()));
        // No budget left to wait AND retry — give up now so the next provider
        // still has time. Sleeping through the remaining budget helps nobody.
        if (delay <= 0 || deadline - Date.now() <= delay + 1000) break;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.message.startsWith("HTTP ")) throw err;
      // An abort is a timeout, and saying so is the difference between a
      // diagnosable incident and a mystery.
      lastError = err instanceof Error && err.name === "AbortError"
        ? new Error(`timed out after ${Math.round(Math.min(PER_REQUEST_TIMEOUT_MS, remaining) / 1000)}s`)
        : err;
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS, Math.max(0, deadline - Date.now()));
      if (delay <= 0 || deadline - Date.now() <= delay + 1000) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("provider unreachable");
}