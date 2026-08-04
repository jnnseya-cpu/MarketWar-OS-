import { NextRequest, NextResponse } from "next/server";
import { CHAINS, chain, runChain, plannedCostAcu, validateChain, ORCHESTRATOR_DOCTRINE, type ChainStep } from "@/backend/orchestrator";
import { headroom, reserve, dailyCapAcu } from "@/backend/agent-budget";
import { contextFor, remember } from "@/backend/brand-memory";
import { createItem } from "@/backend/approvals";
import { runAgent } from "@/backend/provider";
import { gatewayLangFrom } from "@/backend/gateway";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// The orchestrator — runs a chain of agents over one brand.
//
// GET  ?brandId=       → the chains, their costs, and today's remaining ceiling
// POST { action: "run", chainId, brandId, unattended?, input? }
//
// Three things happen here that do not happen in a single agent run:
//
//  1. Each step is handed the brand's memory slice for ITS agent plus what the
//     earlier steps produced, so ten agents produce one connected answer rather
//     than ten unrelated ones.
//  2. A step that would spend, send or publish is turned into an approval item.
//     The runner enforces that; this route only supplies the queueing.
//  3. Unattended runs — the scheduler, not a person pressing a button — are
//     capped per brand per day. An attended run does not touch that ceiling,
//     because a customer who asked for forty agents has paid for forty agents
//     and must not be refused a limit they never set.
//
// Metered per step (§63) at the `llm` rate, charged before the step runs, so a
// step skipped by the ceiling is never billed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "orchestrator"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  if (str("action") !== "run") return NextResponse.json({ error: "Unknown action — use run" }, { status: 400 });

  const chainId = str("chainId");
  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const c = chain(chainId);
  if (!c) return NextResponse.json({ error: `Unknown chain "${chainId}"`, chains: CHAINS.map((x) => x.id) }, { status: 400 });
  const valid = validateChain(c);
  if (!valid.ok) return NextResponse.json({ error: valid.errors.join("; ") }, { status: 500 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const unattended = body.unattended === true;
  const nowISO = new Date().toISOString();
  const lang = gatewayLangFrom(req);

  // The business context the customer supplied, passed to every step.
  const input: Record<string, string> = {};
  if (body.input && typeof body.input === "object") {
    for (const [k, v] of Object.entries(body.input as Record<string, unknown>)) input[k] = String(v ?? "");
  }
  input.brandId = brandId;

  const result = await runChain({
    chainId, brandId, nowISO,
    deps: {
      // Each agent gets the slice of memory it declared an interest in.
      memoryFor: async (step: ChainStep) => (await contextFor(brandId, step.agentId, nowISO)).preamble,

      reserve: async (acus: number) => {
        // Attended runs do not consume the unattended ceiling. The ceiling
        // exists for the part nobody is watching.
        if (!unattended) {
          const h = await headroom(brandId, nowISO);
          return { ok: true, remainingAcu: h.remainingAcu, capAcu: h.capAcu };
        }
        const r = await reserve(brandId, nowISO, acus);
        return { ok: r.ok, remainingAcu: r.headroom.remainingAcu, capAcu: r.headroom.capAcu, error: r.error };
      },

      runStep: async (step: ChainStep, context: string) => {
        // Charged before the work, like everything else.
        const meter = await meterAction(auth, "llm");
        if (!meter.allowed) throw new Error(meter.error || "Out of ACUs");
        const res = await runAgent(step.agentId, { ...input, brandMemory: context }, lang, {
          budgetMs: 60_000, perCallMs: 40_000, paid: (meter.charged ?? 0) > 0,
        });
        return res.output;
      },

      queueApproval: async (step: ChainStep, context: string) => {
        const item = await createItem({
          brandId,
          title: `${c.label}: ${step.purpose}`,
          description: [
            `This step would ${step.effect === "spend" ? "spend money" : step.effect === "send" ? "contact real people" : "publish something in public"}, so the chain stopped here and left it for you.`,
            "",
            `Chain: ${c.label} — ${c.goal}`,
            `Step: ${step.id} (${step.agentId})`,
            "",
            context.slice(0, 6000),
          ].join("\n"),
          createdBy: auth.uid || "orchestrator",
          nowISO,
        });
        return item.id;
      },
    },
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // What the chain records in memory is that it RAN — nothing about what it
  // concluded. Parsing prose into facts would strip the hedges and turn "the
  // audience is probably students" into a premise two agents later.
  if (result.run.ran > 0) {
    await remember({
      brandId, key: `goal.chain-${c.id}`,
      value: `last run ${nowISO} — ${result.run.ran} step(s) drafted, ${result.run.queued} awaiting approval`,
      source: "agent", sourceRef: "orchestrator", confidence: 1,
    }).catch(() => {});
  }

  return NextResponse.json(result.run);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const brandId = new URL(req.url).searchParams.get("brandId") || "";

  const chains = CHAINS.map((c) => ({
    id: c.id, label: c.label, goal: c.goal,
    steps: c.steps.map((s) => ({ ...s, agentExists: true })),
    runnableSteps: c.steps.filter((s) => s.effect === "draft").length,
    approvalSteps: c.steps.filter((s) => s.effect !== "draft").length,
    plannedCostAcu: plannedCostAcu(c),
  }));

  if (!brandId) return NextResponse.json({ doctrine: ORCHESTRATOR_DOCTRINE, dailyCapAcu: dailyCapAcu(), chains });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({
    doctrine: ORCHESTRATOR_DOCTRINE,
    chains,
    budget: await headroom(brandId, new Date().toISOString()),
    budgetNote: "This ceiling limits what the orchestrator spends on its own initiative. Anything you run yourself is governed by your ACU balance, not by this.",
  });
}
