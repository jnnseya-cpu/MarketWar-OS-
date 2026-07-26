// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Per-brand Google property mapping — which Search Console property and Business
// Profile location belong to each brand. This is what makes ONE platform Google
// credential multi-tenant: each brand reads its OWN data (customers grant the
// platform account access to their property; we remember which is whose).
// Firestore-backed with an in-memory fallback for zero-config.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type GoogleMapping = { brandId: string; siteUrl?: string; gbpLocation?: string; updatedAt: string };

const mem = new Map<string, GoogleMapping>();

export async function getGoogleMapping(brandId: string): Promise<GoogleMapping | null> {
  if (adminConfigured && adminDb) {
    try { const s = await adminDb.collection("google_mappings").doc(brandId).get(); return s.exists ? (s.data() as GoogleMapping) : null; } catch { return null; }
  }
  return mem.get(brandId) ?? null;
}

export async function setGoogleMapping(brandId: string, patch: Partial<GoogleMapping>): Promise<void> {
  const clean: Record<string, unknown> = { brandId, updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
  if (adminConfigured && adminDb) {
    try { await adminDb.collection("google_mappings").doc(brandId).set(clean, { merge: true }); } catch { /* best-effort */ }
  } else {
    mem.set(brandId, { ...(mem.get(brandId) ?? { brandId, updatedAt: "" }), ...(clean as GoogleMapping) });
  }
}

// Host of a Search Console property, for auto-matching to a brand's website.
// Handles both "https://example.com/" and "sc-domain:example.com".
export function siteHost(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return siteUrl.slice("sc-domain:".length).replace(/^www\./, "").toLowerCase();
  try { return new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

// Pick the property that best matches a brand website (exact host, else suffix).
export function matchSite(sites: { siteUrl: string }[], website?: string): string | undefined {
  if (!website) return undefined;
  let host = "";
  try { host = new URL(/^https?:\/\//.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { host = website.replace(/^www\./, "").toLowerCase(); }
  if (!host) return undefined;
  const exact = sites.find((s) => siteHost(s.siteUrl) === host);
  if (exact) return exact.siteUrl;
  const suffix = sites.find((s) => { const h = siteHost(s.siteUrl); return h && (host.endsWith(h) || h.endsWith(host)); });
  return suffix?.siteUrl;
}
