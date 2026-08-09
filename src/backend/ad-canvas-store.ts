// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Where ad documents live between sessions.
//
// The point of a layered ad is that you can come back to it. A canvas that only
// exists in a browser tab is a canvas you lose when the phone rings, and then
// the fix for a typo is another generation and another ACU — exactly the cost
// this was built to remove.
//
// Same shape as every other store here: Firestore when Admin is configured, an
// in-memory copy always. The memory copy is per-instance and says so rather
// than pretending to be durable.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { AdDoc } from "@/backend/ad-canvas";

const COLLECTION = "ad_docs";
const mem = new Map<string, AdDoc[]>();
const useDb = () => Boolean(adminConfigured && adminDb);

/** Documents per brand. A canvas is cheap; an unbounded collection is not. */
export const MAX_DOCS_PER_BRAND = 200;

export async function saveDoc(doc: AdDoc, nowISO: string): Promise<AdDoc> {
  const saved: AdDoc = { ...doc, updatedAt: nowISO };
  const list = (mem.get(doc.brandId) || []).filter((d) => d.id !== doc.id);
  list.unshift(saved);
  mem.set(doc.brandId, list.slice(0, MAX_DOCS_PER_BRAND));
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(docKey(doc.brandId, doc.id)).set(saved); } catch { /* the memory copy serves this instance */ }
  }
  return saved;
}

export async function loadDoc(brandId: string, id: string): Promise<AdDoc | null> {
  const local = (mem.get(brandId) || []).find((d) => d.id === id);
  if (local) return local;
  if (!useDb()) return null;
  try {
    const snap = await adminDb!.collection(COLLECTION).doc(docKey(brandId, id)).get();
    const d = snap.exists ? (snap.data() as AdDoc) : null;
    // Belt and braces: the key is brand-scoped, and the record is checked too.
    // One cross-tenant read is one too many.
    return d && d.brandId === brandId ? d : null;
  } catch {
    return null;
  }
}

export async function listDocs(brandId: string, limit = 50): Promise<AdDoc[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return local.slice(0, limit);
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(limit).get();
    const byId = new Map<string, AdDoc>();
    for (const d of [...snap.docs.map((x) => x.data() as AdDoc), ...local]) byId.set(d.id, d);
    return Array.from(byId.values())
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, limit);
  } catch {
    return local.slice(0, limit);
  }
}

export async function deleteDoc(brandId: string, id: string): Promise<boolean> {
  const list = mem.get(brandId) || [];
  const had = list.some((d) => d.id === id);
  mem.set(brandId, list.filter((d) => d.id !== id));
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(docKey(brandId, id)).delete(); return true; } catch { /* memory copy is authoritative here */ }
  }
  return had;
}

const docKey = (brandId: string, id: string) => `${brandId}__${id}`.replace(/[/\s]/g, "_").slice(0, 300);

export function __resetAdDocs(): void { mem.clear(); }
