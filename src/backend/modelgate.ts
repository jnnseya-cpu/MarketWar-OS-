// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar ModelGate™ — the provider-neutral AI Gateway brain.
//
// One internal contract for every AI action regardless of provider (OpenAI /
// Anthropic / Google / future image/video/voice/customer-owned). The actual
// provider calls + demo fallback live in gateway.ts; ModelGate is the
// deterministic decision + governance layer the architecture spec requires:
//   • Model Registry     — central, versioned, priced (no provider names in app code).
//   • Request classifier  — task → capabilities + sensitivity (standard/confidential/restricted).
//   • Routing engine      — the weighted routing score + 5 routing modes.
//   • Fallback + circuit breaker — closed/open/half-open per provider.
//   • ACU reservation     — reserve → execute → reconcile; provider failure = no charge.
//   • Compare mode        — multi-provider; customer pays every call + the evaluator.
//
// Doctrine (non-negotiable): no provider key in the frontend; every request gets
// an id + idempotency key; ACUs reserved before execution and reconciled after;
// append-only ledger; one normalised schema; provider prices configurable
// without a code deploy; MarketWar can disable any provider instantly.
//
// Pure + deterministic so it runs in demo mode and unit-checks. Provider cost is
// used internally only — never returned to the customer surface.

import { STANDARD_MARKUP, MARKUP_FLOOR, ACU_PER_GBP } from "@/backend/subscription";

export type ProviderId = "openai" | "anthropic" | "google";
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const round2 = (n: number) => Math.round(n * 100) / 100;
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

// ---------------------------------------------------------------------------
// Model Registry — central, versioned, priced. App code never hardcodes model
// names; it routes by capability + tag. Prices are data (changeable without a
// code deploy). Pricing is per MILLION tokens in GBP.
// ---------------------------------------------------------------------------
export type ModelCapabilities = { text: boolean; vision: boolean; tools: boolean; structuredOutput: boolean; streaming: boolean; longContext: boolean };
export type ProviderModelRecord = {
  id: string; provider: ProviderId; providerModelId: string; displayName: string;
  status: "active" | "preview" | "deprecated" | "disabled" | "retired";
  capabilities: ModelCapabilities;
  routingTags: string[];
  qualityScore: number;    // 0–100 (approved benchmark)
  inputPerMTokGbp: number; outputPerMTokGbp: number;
  typicalLatencyMs: number;
  minimumMarkupMultiplier: number;
  enabledPlans: string[];  // plan ids that may use it ("*" = all)
  customerSelectable: boolean;
};

export const MODEL_REGISTRY: ProviderModelRecord[] = [
  { id: "oai-flagship", provider: "openai", providerModelId: "gpt-5.5", displayName: "OpenAI Flagship", status: "active", capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: true }, routingTags: ["quality", "vision", "tools"], qualityScore: 92, inputPerMTokGbp: 2.0, outputPerMTokGbp: 8.0, typicalLatencyMs: 4200, minimumMarkupMultiplier: 4, enabledPlans: ["*"], customerSelectable: true },
  { id: "oai-mini", provider: "openai", providerModelId: "gpt-5.5-mini", displayName: "OpenAI Mini", status: "active", capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: false }, routingTags: ["cheap", "fast", "structured"], qualityScore: 78, inputPerMTokGbp: 0.12, outputPerMTokGbp: 0.48, typicalLatencyMs: 1200, minimumMarkupMultiplier: 4, enabledPlans: ["*"], customerSelectable: true },
  { id: "ant-flagship", provider: "anthropic", providerModelId: "claude-opus", displayName: "Claude Opus", status: "active", capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: true }, routingTags: ["quality", "long-context", "tools"], qualityScore: 94, inputPerMTokGbp: 2.4, outputPerMTokGbp: 12.0, typicalLatencyMs: 5200, minimumMarkupMultiplier: 4, enabledPlans: ["*"], customerSelectable: true },
  { id: "ant-fast", provider: "anthropic", providerModelId: "claude-haiku", displayName: "Claude Haiku", status: "active", capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: false }, routingTags: ["cheap", "fast"], qualityScore: 80, inputPerMTokGbp: 0.2, outputPerMTokGbp: 1.0, typicalLatencyMs: 1400, minimumMarkupMultiplier: 4, enabledPlans: ["*"], customerSelectable: true },
  { id: "ggl-pro", provider: "google", providerModelId: "gemini-pro", displayName: "Gemini Pro", status: "active", capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: true }, routingTags: ["quality", "multimodal", "long-context"], qualityScore: 90, inputPerMTokGbp: 1.0, outputPerMTokGbp: 4.0, typicalLatencyMs: 3800, minimumMarkupMultiplier: 4, enabledPlans: ["*"], customerSelectable: true },
  { id: "ggl-flash", provider: "google", providerModelId: "gemini-flash", displayName: "Gemini Flash", status: "active", capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: false }, routingTags: ["cheap", "fast", "multimodal"], qualityScore: 76, inputPerMTokGbp: 0.08, outputPerMTokGbp: 0.32, typicalLatencyMs: 900, minimumMarkupMultiplier: 4, enabledPlans: ["*"], customerSelectable: true },
];

// ---------------------------------------------------------------------------
// Request classification — task → required capabilities + sensitivity.
// ---------------------------------------------------------------------------
export type TaskType = "text_generation" | "structured_output" | "analysis" | "research" | "classification" | "summarisation" | "translation" | "image_analysis" | "document_analysis" | "tool_execution" | "agent_workflow";
export type Sensitivity = "standard" | "confidential" | "restricted";

const RESTRICTED_MARKERS = ["health", "medical", "financial", "government", "legal case", "children", "identity document", "passport"];

export function classifyRequest(input: { taskType: TaskType; purpose?: string; sensitivity?: Sensitivity }): { requiredCapabilities: (keyof ModelCapabilities)[]; sensitivity: Sensitivity; regulated: boolean; note: string } {
  const caps: (keyof ModelCapabilities)[] = ["text"];
  if (input.taskType === "structured_output" || input.taskType === "classification") caps.push("structuredOutput");
  if (input.taskType === "image_analysis") caps.push("vision");
  if (input.taskType === "tool_execution" || input.taskType === "agent_workflow") caps.push("tools");
  if (input.taskType === "research" || input.taskType === "document_analysis") caps.push("longContext");
  const purpose = (input.purpose ?? "").toLowerCase();
  const regulated = RESTRICTED_MARKERS.some((m) => purpose.includes(m));
  const sensitivity: Sensitivity = input.sensitivity ?? (regulated ? "restricted" : "standard");
  return {
    requiredCapabilities: [...new Set(caps)],
    sensitivity, regulated,
    note: sensitivity === "restricted"
      ? "Restricted workload — provider allowlist, reduced logging, and explicit approval may apply before routing."
      : "Classified for routing; instructions and retrieved content are kept separate (prompt-injection defence).",
  };
}

// ---------------------------------------------------------------------------
// Routing engine — the weighted score + 5 modes.
// ---------------------------------------------------------------------------
export type RoutingMode = "automatic" | "lowest_cost" | "fastest" | "highest_quality" | "fixed_provider";
export type ProviderSignal = { provider: ProviderId; healthy?: boolean; availability?: number; failureRate?: number };

const WEIGHTS = { quality: 0.30, capability: 0.25, availability: 0.15, latency: 0.10, cost: 0.10, historical: 0.10 };

// Cheapest models get the highest cost-efficiency score; fastest get the highest
// latency score. Deterministic, from registry data + optional live signals.
export function routingScore(m: ProviderModelRecord, required: (keyof ModelCapabilities)[], signals: ProviderSignal[] = []): number {
  const sig = signals.find((s) => s.provider === m.provider);
  const capabilityMatch = required.every((c) => m.capabilities[c]) ? 100 : 40;
  const availability = sig?.healthy === false ? 0 : clamp(sig?.availability ?? 96);
  const latency = clamp(100 - m.typicalLatencyMs / 60);          // faster → higher
  const blended = m.inputPerMTokGbp * 0.25 + m.outputPerMTokGbp * 0.75;
  const cost = clamp(100 - blended * 7);                          // cheaper → higher
  const historical = clamp(100 - (sig?.failureRate ?? 2) * 10);
  return clamp(
    m.qualityScore * WEIGHTS.quality + capabilityMatch * WEIGHTS.capability +
    availability * WEIGHTS.availability + latency * WEIGHTS.latency +
    cost * WEIGHTS.cost + historical * WEIGHTS.historical,
  );
}

export type RouteRequest = {
  taskType: TaskType; purpose?: string; sensitivity?: Sensitivity;
  mode?: RoutingMode; preferredProvider?: ProviderId; planId?: string;
  signals?: ProviderSignal[];
};

export function selectProvider(req: RouteRequest): { chosen: { id: string; provider: ProviderId; displayName: string; score: number } | null; ranked: { id: string; provider: ProviderId; score: number }[]; mode: RoutingMode; classification: ReturnType<typeof classifyRequest>; reason: string } {
  const classification = classifyRequest(req);
  const mode = req.mode ?? "automatic";
  const plan = req.planId ?? "growth";
  // Eligible = active + capability match + plan-enabled.
  const eligible = MODEL_REGISTRY.filter((m) =>
    m.status === "active" &&
    classification.requiredCapabilities.every((c) => m.capabilities[c]) &&
    (m.enabledPlans.includes("*") || m.enabledPlans.includes(plan)) &&
    (mode !== "fixed_provider" || m.provider === req.preferredProvider),
  );
  if (!eligible.length) return { chosen: null, ranked: [], mode, classification, reason: "No eligible model for the required capabilities / plan / provider." };

  const scored = eligible.map((m) => ({ m, score: routingScore(m, classification.requiredCapabilities, req.signals) }));
  const sortBy = (fn: (x: { m: ProviderModelRecord; score: number }) => number) => [...scored].sort((a, b) => fn(b) - fn(a));
  let winner;
  if (mode === "lowest_cost") winner = sortBy((x) => -(x.m.inputPerMTokGbp * 0.25 + x.m.outputPerMTokGbp * 0.75))[0];
  else if (mode === "fastest") winner = sortBy((x) => -x.m.typicalLatencyMs)[0];
  else if (mode === "highest_quality") winner = sortBy((x) => x.m.qualityScore)[0];
  else winner = sortBy((x) => x.score)[0]; // automatic + fixed_provider (already filtered)

  const ranked = sortBy((x) => x.score).map((x) => ({ id: x.m.id, provider: x.m.provider, score: x.score }));
  return {
    chosen: { id: winner.m.id, provider: winner.m.provider, displayName: winner.m.displayName, score: winner.score },
    ranked, mode, classification,
    reason: `Mode "${mode}" over ${eligible.length} eligible model(s) → ${winner.m.displayName} (${winner.m.provider}). Provider identity is never revealed to the customer.`,
  };
}

// Fallback chain (spec §13): primary → same-provider alt → other providers → queue.
export function fallbackChain(primary: ProviderId): string[] {
  const order: ProviderId[] = [primary, ...(["openai", "anthropic", "google"] as ProviderId[]).filter((p) => p !== primary)];
  return [...order.map((p) => `${p}:primary-or-alt-model`), "queue-or-controlled-error"];
}

// ---------------------------------------------------------------------------
// Circuit breaker (spec §13) — per provider/model.
// ---------------------------------------------------------------------------
export type CircuitState = "closed" | "open" | "half_open";
export function circuitState(m: { failureRatePct?: number; latencyMs?: number; overloaded?: boolean; costAnomaly?: boolean; probing?: boolean }): { state: CircuitState; reason: string } {
  const trip = (m.failureRatePct ?? 0) >= 40 || (m.latencyMs ?? 0) >= 20000 || m.overloaded === true || m.costAnomaly === true;
  if (trip) return { state: "open", reason: "Failure rate / latency / overload / cost-anomaly threshold breached — provider temporarily blocked." };
  if (m.probing) return { state: "half_open", reason: "Limited test requests permitted to check recovery." };
  return { state: "closed", reason: "Operating normally." };
}

// ---------------------------------------------------------------------------
// ACU reservation lifecycle (spec §14–15). Reserve before execution, reconcile
// after. Provider failure → release all, charge nothing.
// ---------------------------------------------------------------------------
export function estimateAndReserve(input: { estProviderCostGbp: number; maxProviderCostGbp?: number; markup?: number }): { estimatedAcus: number; maxReservedAcus: number; markup: number } {
  const markup = Math.max(MARKUP_FLOOR, input.markup ?? STANDARD_MARKUP);
  const est = Math.max(0, input.estProviderCostGbp);
  const max = Math.max(est, input.maxProviderCostGbp ?? est * 1.5);
  return {
    estimatedAcus: Math.ceil(est * markup * ACU_PER_GBP),
    maxReservedAcus: Math.ceil(max * markup * ACU_PER_GBP),
    markup,
  };
}

export function reconcile(input: { reservedAcus: number; actualProviderCostGbp: number; success: boolean; markup?: number }): { chargedAcus: number; releasedAcus: number; charged: boolean; providerFailureCostGbp: number; note: string } {
  const markup = Math.max(MARKUP_FLOOR, input.markup ?? STANDARD_MARKUP);
  if (!input.success) {
    return { chargedAcus: 0, releasedAcus: input.reservedAcus, charged: false, providerFailureCostGbp: round2(Math.max(0, input.actualProviderCostGbp)), note: "Provider produced no usable output — reservation released, customer NOT charged; MarketWar absorbs the failed-provider cost and logs it against provider quality." };
  }
  const chargedAcus = Math.min(input.reservedAcus, Math.ceil(Math.max(0, input.actualProviderCostGbp) * markup * ACU_PER_GBP));
  return { chargedAcus, releasedAcus: Math.max(0, input.reservedAcus - chargedAcus), charged: true, providerFailureCostGbp: 0, note: `Charged ${chargedAcus} ACUs (actual cost × ${markup}); released ${Math.max(0, input.reservedAcus - chargedAcus)} unused reserved ACUs.` };
}

// ---------------------------------------------------------------------------
// Compare mode (spec §30) — customer pays every provider call + the evaluator.
// ---------------------------------------------------------------------------
export function compareModePricing(input: { providerCostsGbp: number[]; evaluatorCostGbp: number; markup?: number }): { totalProviderCostGbp: number; customerChargeGbp: number; acuCharge: number } {
  const markup = Math.max(MARKUP_FLOOR, input.markup ?? STANDARD_MARKUP);
  const total = round2((input.providerCostsGbp.reduce((s, c) => s + Math.max(0, c), 0)) + Math.max(0, input.evaluatorCostGbp));
  const charge = round2(total * markup);
  return { totalProviderCostGbp: total, customerChargeGbp: charge, acuCharge: Math.ceil(charge * ACU_PER_GBP) };
}

// The 20 non-negotiable architectural rules (spec §35) — single source of truth.
export const NON_NEGOTIABLE_RULES = [
  "No AI provider key in the frontend.",
  "No direct browser-to-provider request.",
  "Every AI request receives a request ID.",
  "Every billable operation receives an idempotency key.",
  "ACUs are reserved before provider execution.",
  "ACUs are reconciled after provider execution.",
  "Financial records use an append-only ledger.",
  "Provider responses use one MarketWar schema.",
  "Models are controlled through a central registry.",
  "Provider prices are configurable without a code deployment.",
  "Provider failure cannot create duplicate customer charges.",
  "Retry count must be capped.",
  "Every provider attempt must be auditable.",
  "Sensitive data must be classified before routing.",
  "Destructive AI tools require explicit approval.",
  "Long-running jobs must use asynchronous processing.",
  "Firestore client rules must block direct balance manipulation.",
  "All production secrets must remain in managed secret storage.",
  "Provider deprecations must generate administrator alerts.",
  "MarketWar must be able to disable any provider instantly.",
] as const;

export function demoModelGate() {
  const route = selectProvider({ taskType: "structured_output", purpose: "marketing copy", mode: "automatic", planId: "growth" });
  const reserve = estimateAndReserve({ estProviderCostGbp: 0.037, maxProviderCostGbp: 0.06 });
  return {
    registry: MODEL_REGISTRY.map((m) => ({ id: m.id, provider: m.provider, displayName: m.displayName, status: m.status, qualityScore: m.qualityScore, routingTags: m.routingTags })), // pricing kept internal
    exampleRoute: route,
    restrictedRoute: selectProvider({ taskType: "analysis", purpose: "health records analysis", mode: "automatic" }),
    reservation: reserve,
    reconcileSuccess: reconcile({ reservedAcus: reserve.maxReservedAcus, actualProviderCostGbp: 0.043, success: true }),
    reconcileFailure: reconcile({ reservedAcus: reserve.maxReservedAcus, actualProviderCostGbp: 0.02, success: false }),
    compareMode: compareModePricing({ providerCostsGbp: [0.4, 0.5, 0.2], evaluatorCostGbp: 0.15 }),
    circuitExample: circuitState({ failureRatePct: 55 }),
    fallback: fallbackChain("openai"),
  };
}
