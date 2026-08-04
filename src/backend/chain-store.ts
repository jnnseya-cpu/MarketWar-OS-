// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Chains a customer wrote, and when they should run.
//
// Four built-in chains are four opinions about what matters. A brand that sells
// wedding cakes and a brand that sells scaffolding do not want the same five
// agents in the same order, so this lets them compose their own — and lets them
// say "run it every Monday" without anybody pressing a button.
//
// THE TWO THINGS AUTHORING MUST NOT LET SOMEBODY DO.
//
// 1. Mark an acting step as a draft. The effect of a step is decided by
//    `effectFor()` on the server from the agent, and a chain may only ESCALATE
//    it. If the customer chose the effect, the approval boundary would be a
//    checkbox on the thing it protects.
//
// 2. Write a chain that costs more than it is worth. A 40-step chain scheduled
//    hourly is 4,800 ACUs a day. Length and cadence are bounded here, and the
//    daily ceiling in agent-budget.ts is the backstop underneath.
//
// Schedules are deliberately coarse — daily at the earliest. An hourly chain
// re-reads a market that has not moved and bills for the privilege; the cadence
// floor is a product decision, not a technical one, and it is stated rather
// than tuned in private.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { AGENTS } from "@/shared/agents";
import { CHAINS, chain as builtInChain, effectFor, type Chain, type ChainStep, type StepEffect } from "@/backend/orchestrator";

export const MAX_STEPS = 12;
export const MIN_CADENCE_DAYS = 1;
export const MAX_CADENCE_DAYS = 90;
const LLM_STEP_ACU = 5;

const CHAIN_COLL = "brand_chains";
const SCHED_COLL = "brand_chain_schedules";
const chainMem = new Map<string, Chain[]>();          // brandId → custom chains
const schedMem = new Map<string, ChainSchedule[]>();  // brandId → schedules
const useDb = () => Boolean(adminConfigured && adminDb);
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------
export type DraftStep = { agentId: string; purpose?: string; effect?: StepEffect };
export type DraftChain = { id?: string; label: string; goal: string; steps: DraftStep[] };

export type CompileResult =
  | { ok: true; chain: Chain; notes: string[] }
  | { ok: false; errors: string[] };

// Turn what a customer typed into a chain the runner will accept — or refuse it
// with every reason at once, because fixing one error at a time is a form of
// punishment.
export function compileChain(brandId: string, draft: DraftChain): CompileResult {
  const errors: string[] = [];
  const notes: string[] = [];

  const label = (draft.label || "").trim().slice(0, 80);
  const goal = (draft.goal || "").trim().slice(0, 400);
  if (!label) errors.push("Give the chain a name.");
  if (!goal) errors.push("Say what the chain is for — the agents are told the goal, and a chain with no stated purpose produces five unrelated answers.");

  const rawSteps = Array.isArray(draft.steps) ? draft.steps : [];
  if (!rawSteps.length) errors.push("A chain needs at least one step.");
  if (rawSteps.length > MAX_STEPS) errors.push(`A chain can have at most ${MAX_STEPS} steps — beyond that the later agents are reading more context than they can use, and every step is billed.`);

  const steps: ChainStep[] = [];
  const seen = new Set<string>();
  rawSteps.slice(0, MAX_STEPS).forEach((s, i) => {
    const agentId = (s?.agentId || "").trim();
    const agent = AGENTS[agentId];
    if (!agent) { errors.push(`Step ${i + 1}: "${agentId}" is not an agent on this platform.`); return; }
    // Step ids are positional and generated. A customer-supplied id could
    // collide and silently overwrite an earlier step's result.
    let id = `s${i + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    // THE EFFECT IS RESOLVED, NEVER ACCEPTED. Escalation only.
    const effect = effectFor(agentId, s?.effect);
    if (s?.effect && s.effect !== effect) {
      notes.push(`Step ${i + 1} (${agent.name}) runs as "${effect}" rather than "${s.effect}" — what a step does is decided by the agent, not by the chain.`);
    }
    steps.push({ id, agentId, effect, purpose: (s?.purpose || agent.role || agent.name).trim().slice(0, 160), costAcu: LLM_STEP_ACU });
  });

  if (errors.length) return { ok: false, errors };

  const slug = (draft.id || label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "chain";
  // A custom chain may not take a built-in's name — the runner resolves
  // built-ins first, so it would be shadowed and never run.
  const id = builtInChain(slug) ? `${slug}-${hid(brandId + label)}` : slug;
  if (builtInChain(slug)) notes.push(`"${slug}" is a built-in chain, so this one is stored as "${id}".`);

  return { ok: true, chain: { id, label, goal, steps }, notes };
}

export async function saveChain(brandId: string, draft: DraftChain): Promise<CompileResult> {
  const compiled = compileChain(brandId, draft);
  if (!compiled.ok) return compiled;
  const list = (await listCustomChains(brandId)).filter((c) => c.id !== compiled.chain.id);
  list.push(compiled.chain);
  chainMem.set(brandId, list);
  if (useDb()) {
    try {
      await adminDb!.collection(CHAIN_COLL).doc(`${brandId}::${compiled.chain.id}`.replace(/\//g, "_"))
        .set({ brandId, ...compiled.chain, updatedAt: new Date().toISOString() });
    } catch { /* the in-memory copy still serves this instance */ }
  }
  return compiled;
}

export async function listCustomChains(brandId: string): Promise<Chain[]> {
  const local = chainMem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(CHAIN_COLL).where("brandId", "==", brandId).limit(100).get();
    const rows = snap.docs.map((d) => d.data() as Chain & { brandId: string });
    const byId = new Map<string, Chain>();
    for (const c of [...rows, ...local]) byId.set(c.id, { id: c.id, label: c.label, goal: c.goal, steps: c.steps });
    return Array.from(byId.values());
  } catch {
    return [...local];
  }
}

export async function deleteChain(brandId: string, chainId: string): Promise<boolean> {
  const list = await listCustomChains(brandId);
  const next = list.filter((c) => c.id !== chainId);
  chainMem.set(brandId, next);
  if (useDb()) {
    try { await adminDb!.collection(CHAIN_COLL).doc(`${brandId}::${chainId}`.replace(/\//g, "_")).delete(); } catch { /* memory copy already updated */ }
  }
  return next.length !== list.length;
}

// Built-ins plus this brand's own. Built-ins win on id collision, which is why
// `compileChain` refuses to mint one.
export async function chainsFor(brandId: string): Promise<Chain[]> {
  return [...CHAINS, ...(await listCustomChains(brandId))];
}

export async function resolveChain(brandId: string, chainId: string): Promise<Chain | null> {
  return builtInChain(chainId) || (await listCustomChains(brandId)).find((c) => c.id === chainId) || null;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
export type ChainSchedule = {
  brandId: string;
  chainId: string;
  enabled: boolean;
  cadenceDays: number;
  lastRunAt?: string;
  updatedAt: string;
};

export function clampCadence(days: number): number {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n)) return 7;
  return Math.max(MIN_CADENCE_DAYS, Math.min(MAX_CADENCE_DAYS, n));
}

export async function listSchedules(brandId: string): Promise<ChainSchedule[]> {
  const local = schedMem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(SCHED_COLL).where("brandId", "==", brandId).limit(100).get();
    const rows = snap.docs.map((d) => d.data() as ChainSchedule);
    const byId = new Map<string, ChainSchedule>();
    for (const s of [...rows, ...local]) byId.set(s.chainId, s);
    return Array.from(byId.values());
  } catch {
    return [...local];
  }
}

export async function setSchedule(input: { brandId: string; chainId: string; enabled: boolean; cadenceDays: number; nowISO: string }): Promise<ChainSchedule> {
  const list = await listSchedules(input.brandId);
  const prior = list.find((s) => s.chainId === input.chainId);
  const next: ChainSchedule = {
    brandId: input.brandId,
    chainId: input.chainId,
    enabled: Boolean(input.enabled),
    cadenceDays: clampCadence(input.cadenceDays),
    lastRunAt: prior?.lastRunAt,
    updatedAt: input.nowISO,
  };
  schedMem.set(input.brandId, [...list.filter((s) => s.chainId !== input.chainId), next]);
  if (useDb()) {
    try { await adminDb!.collection(SCHED_COLL).doc(`${input.brandId}::${input.chainId}`.replace(/\//g, "_")).set(next); } catch { /* memory copy holds */ }
  }
  return next;
}

// Due means: enabled, and either never run or last run at least a full cadence
// ago. Never-run schedules are due immediately — a customer who switched one on
// expects something to happen, not to wait a week to find out whether it works.
export function isDue(s: ChainSchedule, nowISO: string): boolean {
  if (!s.enabled) return false;
  if (!s.lastRunAt) return true;
  const last = new Date(s.lastRunAt).getTime();
  const now = new Date(nowISO).getTime();
  if (Number.isNaN(last) || Number.isNaN(now)) return true;
  return now - last >= s.cadenceDays * 86_400_000;
}

// Marked BEFORE the run, not after. A chain that crashes halfway must not be
// retried on the next tick for ever — the schedule is a cadence, not a queue.
export async function markRun(brandId: string, chainId: string, nowISO: string): Promise<void> {
  const list = await listSchedules(brandId);
  const s = list.find((x) => x.chainId === chainId);
  if (!s) return;
  const next = { ...s, lastRunAt: nowISO, updatedAt: nowISO };
  schedMem.set(brandId, [...list.filter((x) => x.chainId !== chainId), next]);
  if (useDb()) {
    try { await adminDb!.collection(SCHED_COLL).doc(`${brandId}::${chainId}`.replace(/\//g, "_")).set(next); } catch { /* memory copy holds */ }
  }
}

// Everything due across every brand — what the scheduler iterates.
export async function allDue(nowISO: string): Promise<ChainSchedule[]> {
  if (!useDb()) {
    return Array.from(schedMem.values()).flat().filter((s) => isDue(s, nowISO));
  }
  try {
    const snap = await adminDb!.collection(SCHED_COLL).where("enabled", "==", true).limit(500).get();
    const rows = snap.docs.map((d) => d.data() as ChainSchedule);
    const local = Array.from(schedMem.values()).flat();
    const byKey = new Map<string, ChainSchedule>();
    for (const s of [...rows, ...local]) byKey.set(`${s.brandId}::${s.chainId}`, s);
    return Array.from(byKey.values()).filter((s) => isDue(s, nowISO));
  } catch {
    return Array.from(schedMem.values()).flat().filter((s) => isDue(s, nowISO));
  }
}

export function __resetChainStore(): void { chainMem.clear(); schedMem.clear(); }
