// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHERE THE BOARD LIVES (§95).
//
// The rules — which moves are legal, which endings need a reason, what counts as
// stalled — are pure and live in `shared/opportunity-board.ts`. This is only the
// storage, and it deliberately holds no rules of its own: a store that decides
// what a legal move is becomes a second rulebook, and the two disagree the first
// time one of them is edited.
//
// Every write goes through the shared `move()`, so a refusal here is the same
// refusal a surface would show before asking.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { createItem, move, type BoardItem, type Column } from "@/shared/opportunity-board";
import { record as auditRecord } from "@/backend/audit-log";

const COLLECTION = "opportunity_board";
const useDb = () => adminConfigured && Boolean(adminDb);
const mem = new Map<string, BoardItem[]>();

const key = (brandId: string) => brandId;

export async function listBoard(brandId: string): Promise<BoardItem[]> {
  const local = mem.get(key(brandId)) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).get();
    const byId = new Map<string, BoardItem>();
    for (const r of local) byId.set(r.id, r);
    snap.forEach((d) => { const r = d.data() as BoardItem & { brandId: string }; byId.set(r.id, r); });
    return [...byId.values()];
  } catch {
    return [...local];
  }
}

async function persist(brandId: string, item: BoardItem): Promise<void> {
  const local = mem.get(key(brandId)) || [];
  mem.set(key(brandId), [...local.filter((r) => r.id !== item.id), item]);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(`${brandId}__${item.id}`).set({ ...item, brandId }); }
    catch { /* memory holds it */ }
  }
}

export async function addToBoard(input: {
  brandId: string; id: string; topic: string; opportunityScore?: number; at: string; by?: string;
}): Promise<{ ok: false; error: string } | { ok: true; item: BoardItem }> {
  const existing = (await listBoard(input.brandId)).find((i) => i.id === input.id);
  if (existing) return { ok: false, error: `"${existing.topic}" is already on the board, in ${existing.column.replace(/_/g, " ")}.` };
  const item = createItem(input);
  await persist(input.brandId, item);
  return { ok: true, item };
}

export async function moveOnBoard(input: {
  brandId: string; id: string; to: Column; by: string; note?: string; at: string;
}): Promise<{ ok: false; error: string } | { ok: true; item: BoardItem }> {
  const item = (await listBoard(input.brandId)).find((i) => i.id === input.id);
  if (!item) return { ok: false, error: "That opportunity is not on this board." };

  // THE SHARED RULES DECIDE. Nothing about legality is re-implemented here.
  const result = move(item, input.to, { at: input.at, by: input.by, note: input.note });
  if (!result.ok) return result;

  await persist(input.brandId, result.item);
  auditRecord({
    actorType: "user", actor: input.by, action: `opportunity.${input.to}`,
    resource: "opportunity", resourceId: item.id, brandId: input.brandId,
    before: { column: item.column }, after: { column: result.item.column },
    reason: input.note, nowISO: input.at,
  });
  return result;
}

/** Test seam. Never called by product code. */
export function __resetBoard(): void { mem.clear(); }
