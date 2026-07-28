// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The Work Library — everything the OS produces for a brand, kept.
//
// Until now an agent's output lived in React state and nowhere else. A customer
// paid ACUs for a 7-day content plan, navigated to another page, and it was
// gone — no copy, no history, no way back to it. That is not a rough edge; it
// means the thing they bought was destroyed by clicking a link.
//
// So every run is saved the moment it completes, without being asked. Rules that
// make this safe rather than merely convenient:
//
//   PER BRAND, PER OWNER. Work is scoped and the API enforces ownership, so one
//   brand's plans can never surface under another's.
//   SAVED EVEN WHEN IT LOOKS BAD. A refused or flagged output is still saved.
//   Deciding on the customer's behalf that something was not worth keeping is how
//   work disappears.
//   NEVER SILENT. If persistence is not configured the caller is told, rather
//   than the save appearing to succeed and the work vanishing at the next
//   deploy — which is the exact failure this module exists to end.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type WorkKind = "agent" | "campaign" | "content" | "email" | "page" | "research" | "other";

export type WorkItem = {
  id: string;
  brandId: string;
  ownerId: string | null;
  kind: WorkKind;
  /** Which engine produced it — "content-factory", "email-commander"… */
  source: string;
  sourceName: string;
  title: string;
  /** The deliverable itself. */
  output: string;
  /** What was asked for, so a run can be understood or repeated later. */
  input: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  /** Free-text notes the customer adds. */
  note?: string;
};

export type SaveResult = { ok: boolean; item: WorkItem; persisted: boolean; note: string };

const COLLECTION = "work_library";
const mem = new Map<string, WorkItem>();
const MEM_CAP = 500;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * A stable id from brand + source + content.
 *
 * Re-running the same agent with the same inputs and getting the same answer
 * should UPDATE one entry, not add a fourth copy of it — a library that fills
 * with duplicates is one nobody opens.
 */
export function workId(brandId: string, source: string, output: string): string {
  return `${brandId}__${source}__${hash(output)}`;
}

/** A readable title, taken from the work itself rather than invented. */
export function titleFrom(output: string, sourceName: string, input: Record<string, string> = {}): string {
  const firstHeading = (output || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^#{1,3}\s+\S/.test(l) || /^\*\*[^*]{4,80}\*\*$/.test(l));
  if (firstHeading) {
    const clean = firstHeading.replace(/^#{1,3}\s+/, "").replace(/^\*\*|\*\*$/g, "").trim();
    if (clean.length >= 4) return clean.slice(0, 120);
  }
  // No heading — fall back to the brief, which is what the customer typed.
  const brief = (input.offer || input.topic || input.product || input.goal || input.business || "").trim();
  return brief ? `${sourceName} — ${brief.slice(0, 80)}` : sourceName;
}

const docId = (id: string) => id.replace(/\//g, "_");

export async function saveWork(
  item: Omit<WorkItem, "createdAt" | "updatedAt" | "pinned" | "id"> & { id?: string; pinned?: boolean },
  nowISO: string,
): Promise<SaveResult> {
  const id = item.id || workId(item.brandId, item.source, item.output);
  const existing = await getWork(item.brandId, id);
  const record: WorkItem = {
    ...item,
    id,
    pinned: item.pinned ?? existing?.pinned ?? false,
    createdAt: existing?.createdAt || nowISO,
    updatedAt: nowISO,
  };

  if (adminConfigured && adminDb) {
    await adminDb.collection(COLLECTION).doc(docId(id)).set(record, { merge: true });
    return { ok: true, item: record, persisted: true, note: existing ? "Updated in your Library." : "Saved to your Library." };
  }

  mem.set(id, record);
  // Bounded so a long demo session cannot grow without limit; oldest first.
  if (mem.size > MEM_CAP) {
    const oldest = [...mem.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
    if (oldest) mem.delete(oldest.id);
  }
  return {
    ok: true, item: record, persisted: false,
    // Said plainly: pretending this survived a restart is how work is lost twice.
    note: "Saved for this session only — durable storage is not configured on this deployment, so it will not survive a restart. Export anything you need to keep.",
  };
}

export async function getWork(brandId: string, id: string): Promise<WorkItem | null> {
  let item: WorkItem | null = null;
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).doc(docId(id)).get();
    item = snap.exists ? (snap.data() as WorkItem) : null;
  } else {
    item = mem.get(id) ?? null;
  }
  // Ownership guard: never return another brand's work.
  return item && item.brandId === brandId ? item : null;
}

export async function listWork(
  brandId: string,
  opts: { source?: string; kind?: WorkKind; limit?: number } = {},
): Promise<WorkItem[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
  let items: WorkItem[];
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).where("brandId", "==", brandId).limit(limit * 2).get();
    items = snap.docs.map((d) => d.data() as WorkItem);
  } else {
    items = [...mem.values()].filter((w) => w.brandId === brandId);
  }
  if (opts.source) items = items.filter((w) => w.source === opts.source);
  if (opts.kind) items = items.filter((w) => w.kind === opts.kind);
  // Pinned first, then newest — the thing you marked as mattering stays at the top.
  return items
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** The most recent output from one engine — used to restore a page you came back to. */
export async function latestWork(brandId: string, source: string): Promise<WorkItem | null> {
  const items = await listWork(brandId, { source, limit: 50 });
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export async function deleteWork(brandId: string, id: string): Promise<boolean> {
  const existing = await getWork(brandId, id);
  if (!existing) return false;          // not owned / not found → no-op
  if (adminConfigured && adminDb) await adminDb.collection(COLLECTION).doc(docId(id)).delete();
  else mem.delete(id);
  return true;
}

export async function patchWork(
  brandId: string, id: string, patch: { title?: string; pinned?: boolean; note?: string }, nowISO: string,
): Promise<WorkItem | null> {
  const existing = await getWork(brandId, id);
  if (!existing) return null;
  const next: WorkItem = {
    ...existing,
    title: patch.title?.trim() || existing.title,
    pinned: patch.pinned ?? existing.pinned,
    note: patch.note ?? existing.note,
    updatedAt: nowISO,
  };
  if (adminConfigured && adminDb) await adminDb.collection(COLLECTION).doc(docId(id)).set(next, { merge: true });
  else mem.set(id, next);
  return next;
}

/** Whether saved work survives a restart on this deployment. */
export function libraryDurable(): boolean {
  return Boolean(adminConfigured && adminDb);
}

/** Test seam — module-level memory would otherwise leak between cases. */
export function __resetWorkLibrary(): void { mem.clear(); }
