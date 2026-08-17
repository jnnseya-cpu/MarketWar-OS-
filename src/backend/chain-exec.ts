// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// One place where a chain is actually wired to the world.
//
// Two routes run chains — the one a person clicks and the one the scheduler
// calls at 3am — and if each built its own dependencies, the unattended path
// would eventually drift: a missing approval queue here, an unmetered step
// there, and nobody would notice because nobody is watching that path. So both
// call this, and the differences between attended and unattended are two
// booleans rather than two implementations.
//
// What differs, and only this:
//   • Unattended runs consume the per-brand daily ceiling. Attended ones do not
//     — a customer who asked for the run is spending their own ACUs and must not
//     be refused by a limit meant for the machine.
//   • Unattended runs are metered against the BRAND OWNER's wallet, because
//     nobody is signed in at 3am and charging nobody would make it free AI.

import { runChain, type Chain, type ChainStep, type ChainRun } from "@/backend/orchestrator";
import { headroom, reserve } from "@/backend/agent-budget";
import { contextFor, remember } from "@/backend/brand-memory";
import { createItem } from "@/backend/approvals";
import { runAgent } from "@/backend/provider";
import { meterAction } from "@/backend/wallet";
import { haltFor } from "@/backend/emergency-stop";
import type { AuthResult } from "@/backend/guard";

const STEP_BUDGET_MS = 60_000;
const STEP_PER_CALL_MS = 40_000;

export async function executeChain(input: {
  brandId: string;
  chain: Chain;
  nowISO: string;
  unattended: boolean;
  auth: AuthResult;
  lang?: string;
  context?: Record<string, string>;
  createdBy?: string;
}): Promise<{ ok: false; error: string } | { ok: true; run: ChainRun }> {
  const { brandId, chain: c, nowISO, unattended, auth } = input;

  // The emergency stop, on the unattended path only. A halt means "stop doing
  // things on your own", not "stop working" — a customer sitting in front of the
  // screen who presses run is not automation, and locking them out of their own
  // tools during an incident helps nobody. The steps that would send, publish or
  // spend are checked again at their own boundaries regardless.
  if (unattended) {
    const halt = await haltFor("autonomous", brandId);
    if (halt.halted) return { ok: false, error: halt.message };
  }

  const agentInput: Record<string, string> = { ...(input.context || {}), brandId };

  const result = await runChain({
    chainId: c.id, brandId, nowISO, chain: c,
    deps: {
      memoryFor: async (step: ChainStep) => (await contextFor(brandId, step.agentId, nowISO)).preamble,

      reserve: async (acus: number) => {
        if (!unattended) {
          const h = await headroom(brandId, nowISO);
          return { ok: true, remainingAcu: h.remainingAcu, capAcu: h.capAcu };
        }
        const r = await reserve(brandId, nowISO, acus);
        return { ok: r.ok, remainingAcu: r.headroom.remainingAcu, capAcu: r.headroom.capAcu, error: r.error };
      },

      runStep: async (step: ChainStep, ctx: string) => {
        // Charged before the work, on both paths. An unattended step that runs
        // for free is the §63 hole nobody would ever see.
        const meter = await meterAction(auth, "llm");
        if (!meter.allowed) throw new Error(meter.error || "Out of ACUs");
        const res = await runAgent(step.agentId, { ...agentInput, brandMemory: ctx }, input.lang, {
          budgetMs: STEP_BUDGET_MS, perCallMs: STEP_PER_CALL_MS, paid: (meter.charged ?? 0) > 0,
        });
        return res.output;
      },

      queueApproval: async (step: ChainStep, ctx: string) => {
        const item = await createItem({
          brandId,
          title: `${c.label}: ${step.purpose}`,
          description: [
            `This step would ${step.effect === "spend" ? "spend money" : step.effect === "send" ? "contact real people" : "publish something in public"}, so the chain stopped here and left it for you.`,
            unattended ? "It ran on a schedule overnight — nothing was sent or published while you were away." : "",
            "",
            `Chain: ${c.label} — ${c.goal}`,
            `Step: ${step.id} (${step.agentId})`,
            "",
            ctx.slice(0, 6000),
          ].filter(Boolean).join("\n"),
          createdBy: input.createdBy || (unattended ? "scheduler" : auth.ok ? auth.uid || "operator" : "operator"),
          nowISO,
        });
        return item.id;
      },
    },
  });

  // What a chain records in memory is that it RAN — never what it concluded.
  // Parsing prose into facts strips the hedges, and "probably students" becomes
  // a premise two agents later.
  if (result.ok && result.run.ran > 0) {
    await remember({
      brandId, key: `goal.chain-${c.id}`,
      value: `last run ${nowISO}${unattended ? " (scheduled)" : ""} — ${result.run.ran} step(s) drafted, ${result.run.queued} awaiting approval`,
      source: "agent", sourceRef: "orchestrator", confidence: 1,
    }).catch(() => {});
  }

  return result;
}
