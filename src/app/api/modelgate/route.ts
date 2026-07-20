import { NextRequest, NextResponse } from "next/server";
import {
  classifyRequest, selectProvider, estimateAndReserve, reconcile, compareModePricing,
  circuitState, fallbackChain, demoModelGate,
  MODEL_REGISTRY, NON_NEGOTIABLE_RULES,
  type TaskType, type RoutingMode, type ProviderId, type Sensitivity,
} from "@/backend/modelgate";

// ModelGate™ API — the provider-neutral AI Gateway brain (deterministic).
// The actual provider execution + demo fallback lives in gateway.ts; this
// surface is the registry / classification / routing / reservation core.
// Provider cost is used internally only — never returned to a customer field.
// POST { action: "classify", taskType, purpose?, sensitivity? }
// POST { action: "route", taskType, mode?, preferredProvider?, planId?, signals? }
// POST { action: "reserve", estProviderCostGbp, maxProviderCostGbp? }
// POST { action: "reconcile", reservedAcus, actualProviderCostGbp, success }
// POST { action: "compare", providerCostsGbp[], evaluatorCostGbp }
// POST { action: "circuit", failureRatePct?, latencyMs?, overloaded?, probing? }
// GET  → registry (no pricing), non-negotiable rules, demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "route";
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : undefined);

  if (action === "classify") {
    if (typeof body.taskType !== "string") return NextResponse.json({ error: "classify requires taskType" }, { status: 400 });
    return NextResponse.json(classifyRequest({ taskType: body.taskType as TaskType, purpose: body.purpose as string | undefined, sensitivity: body.sensitivity as Sensitivity | undefined }));
  }

  if (action === "route") {
    if (typeof body.taskType !== "string") return NextResponse.json({ error: "route requires taskType" }, { status: 400 });
    return NextResponse.json(selectProvider({
      taskType: body.taskType as TaskType,
      purpose: body.purpose as string | undefined,
      sensitivity: body.sensitivity as Sensitivity | undefined,
      mode: body.mode as RoutingMode | undefined,
      preferredProvider: body.preferredProvider as ProviderId | undefined,
      planId: body.planId as string | undefined,
      signals: Array.isArray(body.signals) ? (body.signals as { provider: ProviderId; healthy?: boolean; availability?: number; failureRate?: number }[]) : undefined,
    }));
  }

  if (action === "reserve") {
    if (num("estProviderCostGbp") === undefined) return NextResponse.json({ error: "reserve requires estProviderCostGbp" }, { status: 400 });
    return NextResponse.json(estimateAndReserve({ estProviderCostGbp: num("estProviderCostGbp")!, maxProviderCostGbp: num("maxProviderCostGbp"), markup: num("markup") }));
  }

  if (action === "reconcile") {
    if (num("reservedAcus") === undefined || num("actualProviderCostGbp") === undefined || typeof body.success !== "boolean")
      return NextResponse.json({ error: "reconcile requires reservedAcus, actualProviderCostGbp and success" }, { status: 400 });
    return NextResponse.json(reconcile({ reservedAcus: num("reservedAcus")!, actualProviderCostGbp: num("actualProviderCostGbp")!, success: body.success as boolean, markup: num("markup") }));
  }

  if (action === "compare") {
    if (!Array.isArray(body.providerCostsGbp) || num("evaluatorCostGbp") === undefined)
      return NextResponse.json({ error: "compare requires providerCostsGbp[] and evaluatorCostGbp" }, { status: 400 });
    return NextResponse.json(compareModePricing({ providerCostsGbp: body.providerCostsGbp as number[], evaluatorCostGbp: num("evaluatorCostGbp")!, markup: num("markup") }));
  }

  if (action === "circuit") {
    return NextResponse.json(circuitState({ failureRatePct: num("failureRatePct"), latencyMs: num("latencyMs"), overloaded: Boolean(body.overloaded), costAnomaly: Boolean(body.costAnomaly), probing: Boolean(body.probing) }));
  }

  return NextResponse.json({ error: "Unknown action — use classify, route, reserve, reconcile, compare or circuit" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "ModelGate™ — provider-neutral AI Gateway brain",
    doctrine: "One internal contract for every AI action regardless of provider. No provider key in the frontend; no direct browser-to-provider request; ACUs reserved before execution and reconciled after; provider failure never charges the customer; models controlled via a central registry; provider prices configurable without a code deploy; any provider disablable instantly. Provider identity + cost are never exposed to the customer.",
    fallbackChainExample: fallbackChain("openai"),
    nonNegotiableRules: NON_NEGOTIABLE_RULES,
    registry: MODEL_REGISTRY.map((m) => ({ id: m.id, provider: m.provider, displayName: m.displayName, status: m.status, capabilities: m.capabilities, routingTags: m.routingTags, qualityScore: m.qualityScore })),
    demo: demoModelGate(),
  });
}
