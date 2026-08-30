// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// ONE ROW PER CHARGE, CARRYING WHAT SPENT IT.
//
// `debitAcus` takes a wallet id and an amount. That is correct for what it is —
// the arithmetic — but it meant the only surviving record of a charge was a
// running total, so "which agent is costing me money?" had no answer anywhere in
// the platform. This is the record that answers it. `shared/agent-economics.ts`
// turns these rows into cost and impact; nothing here judges anything.
//
// ---------------------------------------------------------------------------
// RECORDING MUST NEVER BREAK A CHARGE, AND MUST NEVER FAKE ONE
// ---------------------------------------------------------------------------
//
// This is called immediately after a successful debit. If the write fails, the
// customer has already been charged and their work must proceed — so the failure
// is logged and swallowed. The cost of that is one missing row in a report; the
// cost of the alternative is a customer billed for an action that then threw.
//
// The reverse matters just as much: a row is written ONLY after a debit that
// actually happened. An exempt call writes nothing, because a row saying an
// agent spent zero is a claim that it ran and cost nothing, which is a different
// statement from "staff are not billed" and would drag every average down.

import { adminConfigured, adminDb } from "@/backend/firebase-admin";
import type { AgentSpendRow } from "@/shared/agent-economics";

const COLLECTION = "agent_spend";
const useDb = () => Boolean(adminConfigured && adminDb);

/** In-memory when there is no database — the zero-config demo must keep working. */
const mem = new Map<string, AgentSpendRow[]>();

/** Rows older than this are not kept: a cost report nobody reads is data held for no reason. */
const KEEP_DAYS = 180;
/** A ceiling per wallet, so one runaway loop cannot grow a document without limit. */
const MAX_ROWS = 5000;

/**
 * One stored row, CHECKED rather than asserted.
 *
 * A document written by an older build, a partial write, or anything hand-edited
 * arrives as whatever it is. A malformed row that survived into the rollup would
 * become a cost attributed to an agent named `undefined`.
 */
function rowFromStored(raw: unknown): AgentSpendRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const agent = typeof r.agent === "string" ? r.agent.trim() : "";
  const kind = typeof r.kind === "string" ? r.kind.trim() : "";
  const at = typeof r.at === "string" ? r.at.trim() : "";
  const brandId = typeof r.brandId === "string" ? r.brandId.trim() : "";
  const acus = typeof r.acus === "number" && Number.isFinite(r.acus) && r.acus >= 0 ? r.acus : null;
  if (!agent || !kind || !at || acus === null) return null;
  if (!Number.isFinite(Date.parse(at))) return null;
  return { agent, kind, acus, at, brandId };
}

export async function readSpend(walletId: string): Promise<AgentSpendRow[]> {
  const id = (walletId || "").trim();
  if (!id) return [];
  if (!useDb()) return mem.get(id) ?? [];
  const snap = await adminDb!.collection(COLLECTION).doc(id).get();
  const data: unknown = snap.exists ? snap.data() : null;
  const bag = data && typeof data === "object" ? (data as { rows?: unknown }).rows : null;
  if (!Array.isArray(bag)) return [];
  const out: AgentSpendRow[] = [];
  for (const raw of bag) {
    const row = rowFromStored(raw);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Record ONE charge that actually happened.
 *
 * Never throws. See the header: the customer has already been billed by the time
 * this runs, so a storage failure must cost a report row and never their work.
 */
export async function recordSpend(input: {
  walletId: string;
  agent: string;
  kind: string;
  acus: number;
  brandId?: string;
  nowISO?: string;
}): Promise<void> {
  const walletId = (input.walletId || "").trim();
  const acus = Math.max(0, Math.round(Number(input.acus) || 0));
  // A zero charge is not recorded. It would claim a run that cost nothing.
  if (!walletId || acus <= 0) return;

  const row: AgentSpendRow = {
    agent: (input.agent || "").trim() || (input.kind || "").trim() || "unknown",
    kind: (input.kind || "").trim() || "unknown",
    acus,
    at: input.nowISO || new Date().toISOString(),
    brandId: (input.brandId || "").trim(),
  };

  try {
    const existing = await readSpend(walletId);
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60_000;
    const rows = [...existing, row]
      .filter((r) => (Date.parse(r.at) || 0) >= cutoff)
      .slice(-MAX_ROWS);
    if (useDb()) await adminDb!.collection(COLLECTION).doc(walletId).set({ rows, updatedAt: row.at }, { merge: true });
    else mem.set(walletId, rows);
  } catch (e) {
    console.error(`[agent-spend] could not record ${acus} ACUs for ${row.agent}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Test seam — the in-memory store is process state and would leak between cases. */
export function __resetAgentSpend(): void { mem.clear(); }
