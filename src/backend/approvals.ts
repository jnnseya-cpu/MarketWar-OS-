// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Collaboration & Approvals engine — the real workflow store behind the studio's
// "Collaboration & Approvals" (no external key). Items move through the shared
// state machine (src/shared/approvals.ts); every transition is validated and
// appended to an immutable history. Persisted to Firestore with an in-memory
// fallback for zero-config demo (mirrors the creator-engine pattern).

import { createHash } from "crypto";
import { record as auditRecord } from "@/backend/audit-log";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { TRANSITIONS, canApply, APPROVAL_STATES, type ApprovalItem, type ApprovalAction, type ApprovalEvent, type ApprovalState } from "@/shared/approvals";

const mem = new Map<string, ApprovalItem>();
const useDb = () => Boolean(adminConfigured && adminDb);
const COLL = "approval_items";
function hid(s: string): string { return createHash("sha256").update(s).digest("hex").slice(0, 24); }

async function save(item: ApprovalItem): Promise<void> {
  if (useDb()) await adminDb!.collection(COLL).doc(item.id).set(item, { merge: true });
  else mem.set(item.id, item);
}

export async function createItem(input: { brandId: string; title: string; description?: string; assetUrl?: string; createdBy: string; nowISO: string }): Promise<ApprovalItem> {
  const title = (input.title || "").trim().slice(0, 200) || "Untitled";
  const id = `ap_${hid(input.brandId + "::" + title + "::" + input.nowISO)}`;
  const item: ApprovalItem = {
    id,
    brandId: input.brandId,
    title,
    description: (input.description || "").slice(0, 2000),
    state: "draft",
    createdBy: input.createdBy || "unknown",
    history: [],
    createdAt: input.nowISO,
    updatedAt: input.nowISO,
  };
  const asset = (input.assetUrl || "").trim();
  if (/^(https?:\/\/|data:)/i.test(asset)) item.assetUrl = asset.slice(0, 200000);
  await save(item);
  return item;
}

/**
 * A stored document is not an ApprovalItem until something has checked it.
 *
 * `s.data() as ApprovalItem` is a CAST — it tells TypeScript the shape is
 * guaranteed while guaranteeing nothing. `decide()` then does
 * `[...item.history, event]`, which throws "not iterable" on a document written
 * before `history` existed, and the client portal does `data.history.map(...)`,
 * which throws in front of the agency's own customer. The identical cast on the
 * render queue already took /dashboard/video down in production.
 *
 * Only genuinely empty values are filled in: an absent history means "nothing
 * recorded", which is what [] says. A document with no id or no brand cannot be
 * shown to anybody safely, so it is left out rather than repaired into
 * something that looks real.
 */
export function approvalFromStored(data: unknown): ApprovalItem | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<ApprovalItem>;
  if (typeof d.id !== "string" || !d.id) return null;
  if (typeof d.brandId !== "string" || !d.brandId) return null;
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  return {
    ...d,
    id: d.id,
    brandId: d.brandId,
    title: str(d.title, "Untitled"),
    description: str(d.description, ""),
    state: (APPROVAL_STATES as readonly string[]).includes(d.state as string) ? (d.state as ApprovalState) : "draft",
    createdBy: str(d.createdBy, "unknown"),
    history: Array.isArray(d.history) ? d.history : [],
    createdAt: str(d.createdAt, ""),
    updatedAt: str(d.updatedAt, ""),
  } as ApprovalItem;
}

export async function listItems(brandId?: string): Promise<ApprovalItem[]> {
  let items: ApprovalItem[];
  if (useDb()) {
    const q = brandId ? adminDb!.collection(COLL).where("brandId", "==", brandId) : adminDb!.collection(COLL);
    items = (await q.limit(500).get()).docs.map((d) => approvalFromStored(d.data())).filter((i): i is ApprovalItem => i !== null);
  } else {
    items = [...mem.values()].filter((i) => (brandId ? i.brandId === brandId : true));
  }
  return items.sort((a, b) => ((a.updatedAt || "") < (b.updatedAt || "") ? 1 : -1));
}

export async function getItem(id: string): Promise<ApprovalItem | null> {
  if (useDb()) { const s = await adminDb!.collection(COLL).doc(id).get(); return s.exists ? approvalFromStored(s.data()) : null; }
  return mem.get(id) ?? null;
}

// Apply a workflow action. Rejects an illegal transition (wrong state) rather
// than silently moving the item — the state machine is the source of truth.
export async function transition(input: { id: string; action: ApprovalAction; actor: string; role?: string; note?: string; nowISO: string }): Promise<{ ok: true; item: ApprovalItem } | { ok: false; error: string }> {
  const item = await getItem(input.id);
  if (!item) return { ok: false, error: "Item not found." };
  const t = TRANSITIONS[input.action];
  if (!t) return { ok: false, error: "Unknown action." };
  if (!canApply(input.action, item.state)) return { ok: false, error: `Can't ${input.action.replace(/_/g, " ")} an item that is "${item.state.replace(/_/g, " ")}".` };
  // request_changes / reject should carry a reason.
  if ((input.action === "request_changes" || input.action === "reject") && !(input.note || "").trim()) {
    return { ok: false, error: "Add a note explaining what needs to change." };
  }
  const from: ApprovalState = item.state;
  const to = t.to;
  const event: ApprovalEvent = { action: input.action, actor: input.actor || "unknown", at: input.nowISO, from, to };
  if (input.role) event.role = input.role;
  if ((input.note || "").trim()) event.note = input.note!.trim().slice(0, 2000);
  item.state = to;
  item.history = [...item.history, event];
  item.updatedAt = input.nowISO;
  await save(item);
  // The audit trail records the CHANGE, not just that something happened. The
  // item's own history is for the person working on it; this is for the
  // question asked six months later about who approved what.
  auditRecord({
    actorType: "user", actor: input.actor || "unknown",
    action: `approval.${input.action}`,
    resource: "approval", resourceId: item.id, brandId: item.brandId,
    before: { state: from }, after: { state: to },
    reason: input.note, approvalId: item.id,
    meta: input.role ? { role: input.role, title: item.title } : { title: item.title },
    nowISO: input.nowISO,
  });
  return { ok: true, item };
}

// A plain comment (no state change) appended to history for collaboration.
export async function addComment(input: { id: string; actor: string; role?: string; note: string; nowISO: string }): Promise<{ ok: true; item: ApprovalItem } | { ok: false; error: string }> {
  const item = await getItem(input.id);
  if (!item) return { ok: false, error: "Item not found." };
  if (!(input.note || "").trim()) return { ok: false, error: "Empty comment." };
  const event: ApprovalEvent = { action: "submit", actor: input.actor || "unknown", at: input.nowISO, from: item.state, to: item.state, note: input.note.trim().slice(0, 2000) };
  // Mark it as a comment, not a transition, by keeping from===to; the UI renders
  // same-state events as comments.
  if (input.role) event.role = input.role;
  item.history = [...item.history, event];
  item.updatedAt = input.nowISO;
  await save(item);
  return { ok: true, item };
}
