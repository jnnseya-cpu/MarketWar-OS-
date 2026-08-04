// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The chain runner — the agent network, generalised.
//
// `strategy-run.ts` already chains seven strategy agents by passing prior
// outputs forward. That works, and it is hard-wired: seven agents, one order,
// one purpose. The GZ-OS spec's worked example (Trend Hunter → Audience
// Psychologist → Storytelling → Viral Lab → Creator Coach → Growth Hacker →
// Commerce → Community → Income Optimiser → Future Predictor → Digital Twin) is
// the same shape over different agents, so this generalises it: a chain is
// DATA, the runner is one function, and any of the corps can appear in one.
//
// THREE RULES, AND THEY ARE THE WHOLE POINT.
//
// 1. NOTHING SPENDS, SENDS OR PUBLISHES UNATTENDED.
//    Every step declares what running it DOES. Only `draft` steps — the ones
//    that produce words for a human to read — execute inside a chain. A step
//    that would spend money, contact a person or put something live is turned
//    into an approval item and the chain moves on. This is enforced by the
//    runner, not by the chain author remembering: `runChain` never calls the
//    execute path for a non-draft step, whatever the chain says.
//
// 2. THE UNATTENDED SPEND IS CAPPED PER BRAND PER DAY.
//    Reserved before the work (`agent-budget.ts`), so a failing loop cannot run
//    for ever on the grounds that failure is free. Steps that do not fit report
//    that they were skipped and why, rather than silently disappearing — a chain
//    that quietly ran six of its ten steps is a chain that lies about its output.
//
// 3. WHAT A CHAIN LEARNS IS LABELLED AS A MODEL'S OPINION.
//    The runner deliberately does NOT parse an agent's prose into facts. An
//    extractor would turn "the audience is probably students" into
//    `audience.segment = students` with the "probably" stripped, and that fact
//    would then be indistinguishable from a measurement two agents later. The
//    only thing a completed chain records in Brand Memory is that it ran, as
//    `source: "agent"`. Facts are written deliberately or not at all.

import { AGENTS } from "@/shared/agents";

// What running a step actually does to the world.
export type StepEffect =
  | "draft"     // produces words. Safe to run unattended.
  | "spend"     // costs the customer money outside our metering (ads, promotions)
  | "send"      // contacts a real person (email, SMS, WhatsApp, DM)
  | "publish";  // puts something in public (a page, a post, a listing)

export const AUTONOMOUS_EFFECT: StepEffect = "draft";

// WHAT AN AGENT'S STEP REPRESENTS — owned by the server, not by whoever wrote
// the chain.
//
// Today every agent only produces text, so nothing in this table changes what
// physically happens on a run. It matters for the chain AFTER this one: when the
// acting steps are wired to real executors, a customer-authored chain must not
// already have them marked `draft`. If the effect were taken from the chain
// definition, the approval boundary would be a field the person being protected
// gets to set — which is not a boundary.
//
// A chain MAY escalate a step (ask for approval on something the table calls a
// draft). It may never de-escalate. You can always ask for more oversight.
const AGENT_EFFECT: Record<string, StepEffect> = {
  "campaign-commander": "publish",   // its directive is to put campaigns live
  "outreach-commander": "send",      // its directive is to contact people
};

const RANK: Record<StepEffect, number> = { draft: 0, publish: 1, send: 2, spend: 3 };

export function effectFor(agentId: string, declared?: StepEffect): StepEffect {
  const table = AGENT_EFFECT[agentId] || "draft";
  const want = declared || "draft";
  return RANK[want] > RANK[table] ? want : table;
}

export type ChainStep = {
  id: string;
  agentId: string;
  effect: StepEffect;
  purpose: string;
  // Cost of one run, in ACUs. An agent run is `llm`-priced; a step that is
  // queued rather than run costs nothing, because nothing happened.
  costAcu: number;
};

export type Chain = {
  id: string;
  label: string;
  goal: string;
  steps: ChainStep[];
};

const LLM_STEP_ACU = 5;   // matches ACTION_COST_ACU.llm

// The named chains. Each is the spec's idea expressed in agents that exist —
// where the spec names an agent we do not have, the nearest shipped one stands
// in and the chain says so in its purpose line rather than pretending.
export const CHAINS: Chain[] = [
  {
    id: "viral-launch",
    label: "Trend to offer",
    goal: "Turn something moving in the market into a piece of content with an offer behind it, ready for a human to approve.",
    steps: [
      { id: "trend", agentId: "opportunity-scout", effect: "draft", purpose: "What is moving that this brand can credibly join", costAcu: LLM_STEP_ACU },
      { id: "audience", agentId: "customer-avatar", effect: "draft", purpose: "Who it lands with and why they would care", costAcu: LLM_STEP_ACU },
      { id: "story", agentId: "content-factory", effect: "draft", purpose: "The content itself", costAcu: LLM_STEP_ACU },
      { id: "hook", agentId: "viral-hook", effect: "draft", purpose: "The first three seconds, which decide the rest", costAcu: LLM_STEP_ACU },
      { id: "offer", agentId: "offer-builder", effect: "draft", purpose: "What they are actually being asked to buy", costAcu: LLM_STEP_ACU },
      { id: "publish", agentId: "campaign-commander", effect: "publish", purpose: "Put it live — needs a human, always", costAcu: LLM_STEP_ACU },
    ],
  },
  {
    id: "revenue-review",
    label: "Where the money is",
    goal: "Read what actually happened, find the largest unclaimed pound, and say what to do about it.",
    steps: [
      { id: "diagnose", agentId: "business-diagnosis", effect: "draft", purpose: "The honest state of the business", costAcu: LLM_STEP_ACU },
      { id: "roi", agentId: "growth-roi-strategist", effect: "draft", purpose: "What returned and what did not", costAcu: LLM_STEP_ACU },
      { id: "opportunity", agentId: "opportunity-scout", effect: "draft", purpose: "The biggest unclaimed opportunity", costAcu: LLM_STEP_ACU },
      { id: "plan", agentId: "marketing-battle-plan", effect: "draft", purpose: "One plan, ranked by pounds", costAcu: LLM_STEP_ACU },
    ],
  },
  {
    id: "reactivation",
    label: "Wake the quiet list",
    goal: "Find the customers who stopped buying and write the message that brings them back — then stop, because sending is a person's decision.",
    steps: [
      { id: "segment", agentId: "audience-segmentation", effect: "draft", purpose: "Who has gone quiet and what they used to buy", costAcu: LLM_STEP_ACU },
      { id: "pain", agentId: "customer-pain", effect: "draft", purpose: "Why they left, in their words rather than ours", costAcu: LLM_STEP_ACU },
      { id: "write", agentId: "email-commander", effect: "draft", purpose: "The message", costAcu: LLM_STEP_ACU },
      { id: "send", agentId: "outreach-commander", effect: "send", purpose: "Send it — queued for approval, never automatic", costAcu: LLM_STEP_ACU },
    ],
  },
  {
    id: "reputation-watch",
    label: "Reputation round",
    goal: "Read what people are saying, draft the replies, and surface anything that needs a human now.",
    steps: [
      { id: "listen", agentId: "reputation-guardian", effect: "draft", purpose: "What is being said and what it adds up to", costAcu: LLM_STEP_ACU },
      { id: "reply", agentId: "executive-email-writer", effect: "draft", purpose: "Drafted responses, for a person to send", costAcu: LLM_STEP_ACU },
    ],
  },
];

export const chain = (id: string): Chain | null => CHAINS.find((c) => c.id === id) || null;

// A chain is only valid if every agent in it exists. Checked here and asserted
// by test, because a chain naming a deleted agent fails halfway through — after
// it has already spent the ACUs for the steps before it.
export function validateChain(c: Chain): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!c.steps.length) errors.push(`chain "${c.id}" has no steps`);
  const seen = new Set<string>();
  for (const s of c.steps) {
    if (!AGENTS[s.agentId]) errors.push(`step "${s.id}" names unknown agent "${s.agentId}"`);
    if (seen.has(s.id)) errors.push(`duplicate step id "${s.id}"`);
    seen.add(s.id);
    if (s.costAcu < 0) errors.push(`step "${s.id}" has a negative cost`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

// What a chain will cost if every runnable step runs. Queued steps are free
// because they do not happen.
export function plannedCostAcu(c: Chain): number {
  return c.steps.filter((s) => effectFor(s.agentId, s.effect) === AUTONOMOUS_EFFECT).reduce((a, s) => a + s.costAcu, 0);
}

// ---------------------------------------------------------------------------
// Running one
// ---------------------------------------------------------------------------
export type StepStatus = "ran" | "queued_for_approval" | "skipped_daily_cap" | "failed";

export type StepResult = {
  stepId: string;
  agentId: string;
  agentName: string;
  effect: StepEffect;
  status: StepStatus;
  costAcu: number;          // what was actually spent on this step
  output?: string;
  approvalId?: string;
  reason?: string;
};

export type ChainRun = {
  chainId: string;
  brandId: string;
  at: string;
  steps: StepResult[];
  spentAcu: number;
  capAcu: number;
  remainingAcu: number;
  ran: number;
  queued: number;
  skipped: number;
  doctrine: string;
};

export const ORCHESTRATOR_DOCTRINE =
  "A chain drafts. It never spends, sends or publishes on its own — any step that would do one of those becomes an approval item for a person to decide, however confident the agents were. Unattended spend is capped per brand per day; steps that do not fit are reported as skipped rather than quietly dropped.";

// The runner takes its side effects as arguments. That is not ceremony: it means
// the rules above can be tested without a provider key, a Firestore, or a live
// approvals store — and a rule that can only be verified in production is a rule
// nobody verifies.
export type ChainDeps = {
  // Run one agent. Only ever called for a `draft` step.
  runStep: (step: ChainStep, context: string) => Promise<string>;
  // Turn a non-draft step into something a human decides on.
  queueApproval: (step: ChainStep, context: string) => Promise<string>;
  // Reserve the step's cost against the brand's daily unattended ceiling.
  reserve: (acus: number) => Promise<{ ok: boolean; remainingAcu: number; capAcu: number; error?: string }>;
  // What the brand's memory says for THIS step's agent — already sliced to the
  // namespaces that agent declared an interest in, and already labelled by
  // standing. Per step rather than per chain, so a ten-step chain does not hand
  // every agent everything.
  memoryFor?: (step: ChainStep) => Promise<string>;
};

export async function runChain(input: {
  chainId: string;
  brandId: string;
  nowISO: string;
  deps: ChainDeps;
  // A resolved chain — a customer's own, which the built-in table knows nothing
  // about. Still validated here, because a stored chain can name an agent that
  // has since been removed.
  chain?: Chain;
}): Promise<{ ok: false; error: string } | { ok: true; run: ChainRun }> {
  const c = input.chain || chain(input.chainId);
  if (!c) return { ok: false, error: `Unknown chain "${input.chainId}" — known: ${CHAINS.map((x) => x.id).join(", ")}` };
  const valid = validateChain(c);
  if (!valid.ok) return { ok: false, error: valid.errors.join("; ") };

  const steps: StepResult[] = [];
  const priorOutputs: string[] = [];
  let spentAcu = 0;
  let capAcu = 0;
  let remainingAcu = 0;

  for (const raw of c.steps) {
    const agent = AGENTS[raw.agentId];
    // The effect is RESOLVED, never taken as given: a chain may escalate a step
    // to need approval, never quietly mark an acting step as a draft.
    const step: ChainStep = { ...raw, effect: effectFor(raw.agentId, raw.effect) };
    const base: Omit<StepResult, "status" | "costAcu"> = {
      stepId: step.id, agentId: step.agentId, agentName: agent.name, effect: step.effect,
    };

    // The context handed to this step: what the brand's memory holds, plus what
    // the earlier steps produced. This is the "one coordinated intelligence"
    // part — and the memory preamble already labels which items are measured
    // and which are another model's guess.
    const memory = input.deps.memoryFor ? await input.deps.memoryFor(step).catch(() => "") : "";
    const context = [
      memory,
      priorOutputs.length ? `Earlier steps in this chain (build on these, stay consistent):\n${priorOutputs.join("\n\n")}` : "",
    ].filter(Boolean).join("\n\n");

    // RULE 1. Anything that is not a draft is queued — before any cost check,
    // because queuing costs nothing and a full ceiling must not silently turn a
    // "needs your approval" into a "skipped".
    if (step.effect !== AUTONOMOUS_EFFECT) {
      let approvalId = "";
      try { approvalId = await input.deps.queueApproval(step, context); } catch { /* recorded below */ }
      steps.push({
        ...base,
        status: "queued_for_approval",
        costAcu: 0,
        approvalId: approvalId || undefined,
        reason: `This step would ${step.effect === "spend" ? "spend money" : step.effect === "send" ? "contact real people" : "publish something in public"}. A chain does not do that on its own.`,
      });
      continue;
    }

    // RULE 2. Reserved before the work.
    const res = await input.deps.reserve(step.costAcu);
    capAcu = res.capAcu; remainingAcu = res.remainingAcu;
    if (!res.ok) {
      steps.push({ ...base, status: "skipped_daily_cap", costAcu: 0, reason: res.error || "daily ceiling reached" });
      continue;
    }

    try {
      const output = await input.deps.runStep(step, context);
      spentAcu += step.costAcu;
      steps.push({ ...base, status: "ran", costAcu: step.costAcu, output });
      priorOutputs.push(`### ${agent.name} — ${step.purpose}\n${output}`);
    } catch (err) {
      // The cost stays spent. The provider was called; the money is gone whether
      // or not the answer arrived, and pretending otherwise is how a retry loop
      // becomes free.
      spentAcu += step.costAcu;
      steps.push({ ...base, status: "failed", costAcu: step.costAcu, reason: err instanceof Error ? err.message : "step failed" });
    }
  }

  return {
    ok: true,
    run: {
      chainId: c.id,
      brandId: input.brandId,
      at: input.nowISO,
      steps,
      spentAcu,
      capAcu,
      remainingAcu,
      ran: steps.filter((s) => s.status === "ran").length,
      queued: steps.filter((s) => s.status === "queued_for_approval").length,
      skipped: steps.filter((s) => s.status === "skipped_daily_cap").length,
      doctrine: ORCHESTRATOR_DOCTRINE,
    },
  };
}
