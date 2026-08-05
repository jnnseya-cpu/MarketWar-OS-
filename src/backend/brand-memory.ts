// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Brand Memory — the shared context the agent network reads from.
//
// The GZ-OS spec's real proposal is one line: "each agent shares context through
// a central AI memory, creating one coordinated intelligence." That is correct,
// and it is the piece that does not exist. `strategy-run.ts` already chains
// seven agents by passing prior outputs forward, but the context dies with the
// run — nothing persists what an agent LEARNED about this brand, so the next
// agent starts from nothing and asks the customer the same questions again.
//
// THE RULE THAT MAKES A SHARED MEMORY SAFE RATHER THAN DANGEROUS.
//
// Every fact records WHERE IT CAME FROM, and a fact produced by a model is
// never promoted to "measured". Without that rule, a chain of ten agents
// produces a confident plan built on nothing: agent one guesses the audience is
// 18–24, agent two treats that as a fact, agent three prices against it, and by
// agent ten the guess has become the premise of a budget. This is the
// hash-as-score defect with extra steps — the number nobody measured, laundered
// through enough hops that its origin is invisible.
//
// So:
//   • `source: "measured"` is reserved for a whitelist of modules that actually
//     count something. An agent CANNOT write one, whatever it claims.
//   • `source: "customer"` is what the customer told us. Higher standing than a
//     model, lower than a measurement — people misremember their own numbers.
//   • `source: "agent"` is a model's inference. Usable, labelled, and never
//     silently upgraded.
//   • A new value never deletes the old one. It SUPERSEDES it and the prior is
//     kept, so "why does the plan think that?" is always answerable.
//
// Facts also go stale. A measured best-posting-hour from fourteen months ago is
// not wrong, it is old, and recall says so rather than dropping it — the
// additive-only law applies to memory too.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type FactSource = "measured" | "customer" | "agent";

export type Fact = {
  id: string;
  brandId: string;
  key: string;          // dotted namespace: "audience.age-band", "offer.winner"
  value: string;
  source: FactSource;
  sourceRef: string;    // the module that measured it, or the agent that said it
  confidence: number;   // 0–1, supplied by the writer — never invented here
  observedAt: string;   // ISO
  supersedesId?: string;
  note?: string;
};

// Modules permitted to write a MEASURED fact. This is a whitelist rather than a
// flag on the call, because the whole protection is that the writer cannot
// choose its own standing. Adding to this list is a deliberate act: it means
// that module genuinely counts something.
export const MEASURING_MODULES = [
  "deep-crawl",       // what is actually in the HTML of the customer's own site
  "posting-time",     // hours computed from the brand's own delivery ledger
  "email-events",     // opens, clicks, bounces actually recorded
  "email-improve",    // the reach report built from those events
  "contacts",         // vault counts
  "ledger",           // revenue events the customer logged or synced
  "reputation",       // trust computed from real reviews
  "page-analytics",   // real page traffic
  "search-console",   // Google's own numbers
  "roi-engine",       // spend against recorded return
  "video-jobs",       // renders that finished
  "review-requests",  // eligibility counted over the real vault
] as const;
export type MeasuringModule = (typeof MEASURING_MODULES)[number];

// How long before a fact of a given class should be read as historical rather
// than current. Nothing is deleted at the boundary — recall marks it.
export const STALE_AFTER_DAYS: Record<string, number> = {
  "audience": 180,
  "offer": 90,
  "posting": 90,
  "reach": 30,
  "revenue": 30,
  "reputation": 60,
  "brand": 365,
  "goal": 365,
};
const DEFAULT_STALE_DAYS = 120;

export function staleAfterDays(key: string): number {
  const ns = (key || "").split(".")[0];
  return STALE_AFTER_DAYS[ns] ?? DEFAULT_STALE_DAYS;
}

const COLLECTION = "brand_memory";
const mem = new Map<string, Fact[]>();   // brandId → facts, newest last
const useDb = () => adminConfigured && adminDb;
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export type RememberInput = {
  brandId: string;
  key: string;
  value: string;
  source: FactSource;
  sourceRef: string;
  confidence?: number;
  observedAt?: string;
  note?: string;
};

export type RememberResult =
  | { ok: true; fact: Fact; superseded: Fact | null; persisted: boolean }
  | { ok: false; error: string };

// Writing a fact. The standing check happens here and nowhere else, so there is
// exactly one place to read to know whether it can be bypassed.
export async function remember(input: RememberInput): Promise<RememberResult> {
  const brandId = (input.brandId || "").trim();
  const key = (input.key || "").trim().toLowerCase();
  const value = (input.value || "").trim();
  const sourceRef = (input.sourceRef || "").trim();
  if (!brandId) return { ok: false, error: "brandId required" };
  if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(key)) return { ok: false, error: `key must be a dotted namespace like "audience.age-band" — got "${key}"` };
  if (!value) return { ok: false, error: "value required — an empty fact is not a fact" };
  if (!sourceRef) return { ok: false, error: "sourceRef required — a fact with no provenance is a rumour" };

  if (input.source === "measured" && !(MEASURING_MODULES as readonly string[]).includes(sourceRef)) {
    return {
      ok: false,
      error: `"${sourceRef}" is not a measuring module, so it cannot write a measured fact. An agent's inference is source "agent"; laundering it as a measurement is how a guess becomes the premise of a budget.`,
    };
  }

  const observedAt = input.observedAt || new Date().toISOString();
  const current = await currentFact(brandId, key);

  const fact: Fact = {
    id: `${brandId}::${hid(key + "|" + observedAt + "|" + value)}`,
    brandId, key, value,
    source: input.source,
    sourceRef,
    confidence: clamp01(input.confidence ?? (input.source === "measured" ? 1 : 0.5)),
    observedAt,
    supersedesId: current ? current.id : undefined,
    note: input.note,
  };

  const list = mem.get(brandId) || [];
  list.push(fact);
  mem.set(brandId, list);

  let persisted = false;
  if (useDb()) {
    try {
      await adminDb!.collection(COLLECTION).doc(fact.id.replace(/\//g, "_")).set(fact);
      persisted = true;
    } catch { persisted = false; }
  }
  return { ok: true, fact, superseded: current, persisted };
}

// Everything ever recorded for a brand, oldest first. Nothing is removed — the
// superseded values are the answer to "why did it think that?".
export async function recall(brandId: string): Promise<Fact[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).get();
    const rows = snap.docs.map((d) => d.data() as Fact);
    const byId = new Map<string, Fact>();
    for (const f of [...rows, ...local]) byId.set(f.id, f);
    return Array.from(byId.values()).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  } catch {
    return [...local];
  }
}

// The live value for a key — the newest fact that nothing has superseded.
export async function currentFact(brandId: string, key: string): Promise<Fact | null> {
  const all = await recall(brandId);
  const superseded = new Set(all.map((f) => f.supersedesId).filter(Boolean) as string[]);
  const live = all.filter((f) => f.key === key && !superseded.has(f.id));
  if (!live.length) return null;
  return live.sort((a, b) => a.observedAt.localeCompare(b.observedAt))[live.length - 1];
}

// The chain behind a key, newest first: what it says now and what it said before.
export async function history(brandId: string, key: string): Promise<Fact[]> {
  const all = await recall(brandId);
  return all.filter((f) => f.key === key).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

export type RecalledFact = Fact & { ageDays: number; stale: boolean };

function age(f: Fact, nowISO: string): RecalledFact {
  const t = new Date(f.observedAt).getTime();
  const now = new Date(nowISO).getTime();
  const ageDays = Number.isNaN(t) || Number.isNaN(now) ? 0 : Math.max(0, Math.floor((now - t) / 86_400_000));
  return { ...f, ageDays, stale: ageDays > staleAfterDays(f.key) };
}

// The live picture: one fact per key, aged and flagged. This is what an agent
// is handed — not the archive.
export async function currentMemory(brandId: string, nowISO = new Date().toISOString()): Promise<RecalledFact[]> {
  const all = await recall(brandId);
  const superseded = new Set(all.map((f) => f.supersedesId).filter(Boolean) as string[]);
  const live = all.filter((f) => !superseded.has(f.id));
  const byKey = new Map<string, Fact>();
  for (const f of live.sort((a, b) => a.observedAt.localeCompare(b.observedAt))) byKey.set(f.key, f);
  return Array.from(byKey.values()).map((f) => age(f, nowISO)).sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Context assembly
//
// An agent is given the SLICE it needs, not the whole store. Two reasons, and
// the second is the one that bites: a prompt that grows with tenure means the
// customer's bill grows every month for the same action, and the oldest,
// least relevant facts are the ones crowding out the newest.
// ---------------------------------------------------------------------------
export const AGENT_INTERESTS: Record<string, string[]> = {
  "customer-avatar": ["audience", "goal", "brand"],
  "audience-segmentation": ["audience", "revenue", "reach"],
  "offer-builder": ["offer", "audience", "revenue"],
  "campaign-commander": ["offer", "audience", "posting", "reach"],
  "email-commander": ["reach", "audience", "posting"],
  "content-factory": ["brand", "audience", "posting"],
  "video-commander": ["brand", "audience", "posting"],
  "reputation-guardian": ["reputation", "audience"],
  "growth-roi-strategist": ["revenue", "offer", "reach"],
  "growth-strategist": ["goal", "revenue", "audience", "offer"],
  "marketing-battle-plan": ["goal", "audience", "offer", "revenue", "reputation"],
};

export type AgentContext = {
  agentId: string;
  namespaces: string[];
  facts: RecalledFact[];
  measuredCount: number;
  agentCount: number;
  staleCount: number;
  preamble: string;
};

// The preamble is written to be read by a model, and it is deliberately blunt
// about standing. An agent told "this was measured" and "this was another
// agent's guess" behaves differently from one handed a flat list of assertions.
export function contextPreamble(facts: RecalledFact[]): string {
  if (!facts.length) return "No stored facts about this brand yet. Do not invent any; ask for what you need.";
  const line = (f: RecalledFact) =>
    `- ${f.key}: ${f.value} [${f.source === "measured" ? `MEASURED by ${f.sourceRef}` : f.source === "customer" ? "stated by the customer" : `inferred by ${f.sourceRef}`}, confidence ${f.confidence}, ${f.ageDays}d old${f.stale ? ", STALE" : ""}]`;
  return [
    "What is known about this brand, with where each item came from:",
    ...facts.map(line),
    "",
    "Treat MEASURED items as fact. Treat customer-stated items as their belief. Treat inferred items as another model's guess — you may disagree with them, and you must not present one as a measurement. Anything marked STALE may have changed; say so rather than relying on it.",
  ].join("\n");
}

export async function contextFor(brandId: string, agentId: string, nowISO = new Date().toISOString()): Promise<AgentContext> {
  const namespaces = AGENT_INTERESTS[agentId] || [];
  const all = await currentMemory(brandId, nowISO);
  const facts = namespaces.length ? all.filter((f) => namespaces.includes(f.key.split(".")[0])) : all;
  return {
    agentId,
    namespaces,
    facts,
    measuredCount: facts.filter((f) => f.source === "measured").length,
    agentCount: facts.filter((f) => f.source === "agent").length,
    staleCount: facts.filter((f) => f.stale).length,
    preamble: contextPreamble(facts),
  };
}

// Conflicts worth a human's attention: the same key asserted differently by a
// measurement and by an agent. The measurement wins on standing, but the fact
// that a model believes something else is itself information.
export type MemoryConflict = { key: string; measured: Fact; claimed: Fact };

export async function conflicts(brandId: string): Promise<MemoryConflict[]> {
  const all = await recall(brandId);
  const out: MemoryConflict[] = [];
  const byKey = new Map<string, Fact[]>();
  for (const f of all) { const l = byKey.get(f.key); if (l) l.push(f); else byKey.set(f.key, [f]); }
  for (const [key, list] of byKey) {
    const measured = [...list].filter((f) => f.source === "measured").sort((a, b) => a.observedAt.localeCompare(b.observedAt)).pop();
    if (!measured) continue;
    const claimed = [...list]
      .filter((f) => f.source !== "measured" && f.value.trim().toLowerCase() !== measured.value.trim().toLowerCase() && f.observedAt >= measured.observedAt)
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt)).pop();
    if (claimed) out.push({ key, measured, claimed });
  }
  return out;
}

export function __resetBrandMemory(): void { mem.clear(); }
