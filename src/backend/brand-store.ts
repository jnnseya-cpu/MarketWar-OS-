// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Durable per-account brand store — fixes the "brands wiped every session" bug.
//
// Brands used to live ONLY in the browser's localStorage, so anything that cleared
// it (new device, cleared browser, incognito, storage eviction) forced a full
// re-setup. Now the full brand record (name, product, logo, colours, everything)
// persists in Firestore under the owner's uid, keyed by brandId. The existing
// `brands` collection already held { brandId, ownerId } for access control; we
// extend the SAME doc with the brand fields, so ownership + data are one record.
// Claim-on-first-use is preserved (a brandId owned by another account is rejected).

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { Brand } from "@/shared/brand";

const COLLECTION = "brands";

type Verdict = { ok: true } | { ok: false; status: number; error: string };

export async function listBrandsForOwner(uid: string): Promise<Brand[]> {
  if (!adminConfigured || !adminDb) return [];
  const snap = await adminDb.collection(COLLECTION).where("ownerId", "==", uid).limit(500).get();
  return snap.docs
    .map((d) => stripMeta(d.data() as Record<string, unknown>))
    .filter((b): b is Brand => Boolean(b && b.id && b.name));
}

export async function saveBrandForOwner(uid: string, brand: Brand): Promise<Verdict> {
  if (!adminConfigured || !adminDb) return { ok: true }; // demo / no persistence — client keeps localStorage
  if (!brand?.id || !brand?.name) return { ok: false, status: 400, error: "brand id + name required" };
  const ref = adminDb.collection(COLLECTION).doc(brand.id);
  const verdict = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const owner = (snap.data() as { ownerId?: string }).ownerId;
      if (owner && owner !== uid) return "denied" as const;
    }
    tx.set(ref, { ...brand, brandId: brand.id, ownerId: uid, updatedAt: new Date().toISOString() }, { merge: true });
    return "ok" as const;
  });
  return verdict === "denied" ? { ok: false, status: 403, error: "This brand belongs to another account" } : { ok: true };
}

export async function deleteBrandForOwner(uid: string, brandId: string): Promise<Verdict> {
  if (!adminConfigured || !adminDb) return { ok: true };
  const ref = adminDb.collection(COLLECTION).doc(brandId);
  const snap = await ref.get();
  if (snap.exists && (snap.data() as { ownerId?: string }).ownerId !== uid) {
    return { ok: false, status: 403, error: "This brand belongs to another account" };
  }
  await ref.delete();
  return { ok: true };
}

function stripMeta(data: Record<string, unknown>): Brand | null {
  if (!data) return null;
  const rest = { ...data };
  delete rest.ownerId; delete rest.brandId; delete rest.createdAt; delete rest.updatedAt;
  return rest as unknown as Brand;
}
