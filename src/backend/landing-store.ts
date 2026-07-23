// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Landing-page store — persists a generated LandingPage per brand so it can be
// SERVED at a real public URL (/b/{brandId}/{slug}) and edited later. Firestore
// collection "landing_pages" (doc id `${brandId}::${slug}`) with an in-memory
// fallback for zero-config. This is what turns the generated structure into an
// actual, visitable page instead of a dead marketwar.co/... string.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { GeneratedLandingPage } from "@/backend/landing";

export type StoredLandingPage = GeneratedLandingPage & {
  brandId: string;
  brandName: string;
  logoUrl?: string;
  brandColours?: string[];
  whatsappNumber?: string;
  publishedAt: string;
  live: boolean;
};

const mem = new Map<string, StoredLandingPage>(); // `${brandId}::${slug}` → page
const key = (brandId: string, slug: string) => `${brandId}::${slug}`;
const docId = (brandId: string, slug: string) => key(brandId, slug).replace(/\//g, "_");

export async function savePage(page: StoredLandingPage): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection("landing_pages").doc(docId(page.brandId, page.slug)).set(page, { merge: true });
  } else {
    mem.set(key(page.brandId, page.slug), page);
  }
}

export async function getPage(brandId: string, slug: string): Promise<StoredLandingPage | null> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("landing_pages").doc(docId(brandId, slug)).get();
    return snap.exists ? (snap.data() as StoredLandingPage) : null;
  }
  return mem.get(key(brandId, slug)) ?? null;
}

export async function listPages(brandId: string): Promise<StoredLandingPage[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("landing_pages").where("brandId", "==", brandId).limit(200).get();
    return snap.docs.map((d) => d.data() as StoredLandingPage);
  }
  return [...mem.values()].filter((p) => p.brandId === brandId);
}

export async function deletePage(brandId: string, slug: string): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection("landing_pages").doc(docId(brandId, slug)).delete();
  } else {
    mem.delete(key(brandId, slug));
  }
}
