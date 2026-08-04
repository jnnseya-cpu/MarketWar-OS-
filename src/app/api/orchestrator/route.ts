import { NextRequest, NextResponse } from "next/server";
import { CHAINS, plannedCostAcu, validateChain, effectFor, ORCHESTRATOR_DOCTRINE } from "@/backend/orchestrator";
import { executeChain } from "@/backend/chain-exec";
import {
  chainsFor, resolveChain, saveChain, deleteChain, listSchedules, setSchedule, isDue,
  MAX_STEPS, MIN_CADENCE_DAYS, MAX_CADENCE_DAYS, type DraftChain,
} from "@/backend/chain-store";
import { headroom, dailyCapAcu } from "@/backend/agent-budget";
import { AGENTS } from "@/shared/agents";
import { gatewayLangFrom } from "@/backend/gateway";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// The orchestrator — run a chain, or compose and schedule your own.
//
// GET  ?brandId=          → chains (built-in + this brand's), agents to build
//                           with, today's ceiling, and the schedules
// POST { action: "run",      chainId, brandId, input? }
// POST { action: "save",     brandId, chain: { label, goal, steps[] } }
// POST { action: "delete",   brandId, chainId }
// POST { action: "schedule", brandId, chainId, enabled, cadenceDays }
//
// Everything that runs a chain goes through `executeChain`, shared with the
// scheduler, so the attended and unattended paths cannot drift apart.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "orchestrator"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const action = str("action") || "run";
  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const nowISO = new Date().toISOString();

  if (action === "save") {
    const draft = (body.chain && typeof body.chain === "object" ? body.chain : {}) as DraftChain;
    const res = await saveChain(brandId, draft);
    if (!res.ok) return NextResponse.json({ errors: res.errors }, { status: 400 });
    return NextResponse.json({ chain: res.chain, notes: res.notes, plannedCostAcu: plannedCostAcu(res.chain) });
  }

  if (action === "delete") {
    const removed = await deleteChain(brandId, str("chainId"));
    if (!removed) return NextResponse.json({ error: "No chain of yours with that id — built-in chains cannot be deleted." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "schedule") {
    const chainId = str("chainId");
    const c = await resolveChain(brandId, chainId);
    if (!c) return NextResponse.json({ error: `Unknown chain "${chainId}"` }, { status: 400 });
    const schedule = await setSchedule({
      brandId, chainId,
      enabled: body.enabled === true,
      cadenceDays: typeof body.cadenceDays === "number" ? body.cadenceDays : 7,
      nowISO,
    });
    return NextResponse.json({
      schedule,
      due: isDue(schedule, nowISO),
      note: `Scheduled runs are capped at ${dailyCapAcu()} ACUs a day across everything this brand runs unattended, and nothing they produce is sent or published without you.`,
    });
  }

  if (action !== "run") return NextResponse.json({ error: "Unknown action — use run, save, delete or schedule" }, { status: 400 });

  const chainId = str("chainId");
  const c = await resolveChain(brandId, chainId);
  if (!c) return NextResponse.json({ error: `Unknown chain "${chainId}"`, chains: CHAINS.map((x) => x.id) }, { status: 400 });
  const valid = validateChain(c);
  if (!valid.ok) return NextResponse.json({ error: valid.errors.join("; ") }, { status: 400 });

  const context: Record<string, string> = {};
  if (body.input && typeof body.input === "object") {
    for (const [k, v] of Object.entries(body.input as Record<string, unknown>)) context[k] = String(v ?? "");
  }

  const result = await executeChain({
    brandId, chain: c, nowISO, unattended: false, auth,
    lang: gatewayLangFrom(req), context,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.run);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const brandId = new URL(req.url).searchParams.get("brandId") || "";

  const view = (list: typeof CHAINS, custom: Set<string>) => list.map((c) => ({
    id: c.id, label: c.label, goal: c.goal,
    custom: custom.has(c.id),
    steps: c.steps.map((s) => ({ ...s, effect: effectFor(s.agentId, s.effect) })),
    runnableSteps: c.steps.filter((s) => effectFor(s.agentId, s.effect) === "draft").length,
    approvalSteps: c.steps.filter((s) => effectFor(s.agentId, s.effect) !== "draft").length,
    plannedCostAcu: plannedCostAcu(c),
  }));

  const authoring = {
    maxSteps: MAX_STEPS,
    minCadenceDays: MIN_CADENCE_DAYS,
    maxCadenceDays: MAX_CADENCE_DAYS,
    note: "What a step DOES is decided by the agent, not by the chain. You can ask for approval on something that would otherwise run — you cannot mark an acting step as a draft.",
    agents: Object.values(AGENTS).map((a) => ({ id: a.id, name: a.name, role: a.role, effect: effectFor(a.id) })),
  };

  if (!brandId) {
    return NextResponse.json({
      doctrine: ORCHESTRATOR_DOCTRINE, dailyCapAcu: dailyCapAcu(),
      chains: view(CHAINS, new Set()), authoring,
    });
  }
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const all = await chainsFor(brandId);
  const custom = new Set(all.slice(CHAINS.length).map((c) => c.id));
  const nowISO = new Date().toISOString();
  const schedules = await listSchedules(brandId);

  return NextResponse.json({
    doctrine: ORCHESTRATOR_DOCTRINE,
    chains: view(all, custom),
    authoring,
    schedules: schedules.map((s) => ({ ...s, due: isDue(s, nowISO) })),
    budget: await headroom(brandId, nowISO),
    budgetNote: "This ceiling limits what the orchestrator spends on its own initiative. Anything you run yourself is governed by your ACU balance, not by this.",
  });
}
