// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Stores the platform Google OAuth refresh token captured by the in-app
// "Connect Google" flow. Because the SAME client (GOOGLE_OAUTH_CLIENT_ID/SECRET)
// mints AND uses this token, it can never suffer the client-mismatch failures of
// a hand-pasted Playground token. Firestore (platform_config/google_oauth) with
// an in-memory fallback. The token is server-side only, never returned.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

let mem: string | null = null;

export async function getStoredGoogleRefreshToken(): Promise<string | null> {
  if (adminConfigured && adminDb) {
    try {
      const s = await adminDb.collection("platform_config").doc("google_oauth").get();
      return s.exists ? ((s.data() as { refreshToken?: string }).refreshToken || null) : null;
    } catch { return null; }
  }
  return mem;
}

export async function setStoredGoogleRefreshToken(token: string): Promise<void> {
  const t = (token || "").trim();
  if (!t) return;
  if (adminConfigured && adminDb) {
    try { await adminDb.collection("platform_config").doc("google_oauth").set({ refreshToken: t, updatedAt: new Date().toISOString() }, { merge: true }); } catch { /* best-effort */ }
  } else {
    mem = t;
  }
}

// ---------------------------------------------------------------------------
// PER-BRAND connections — and why the platform token is not one.
//
// Everything above is a SINGLE credential for the whole platform, and for what
// it was built for that is correct: Search Console and Business Profile read
// MarketWar's own properties, so one account is the right number.
//
// It is emphatically wrong for YouTube captions. A customer pasting a link to
// their own video needs THEIR channel's authorisation, not ours. Reusing the
// platform token there does two bad things at once: every customer is told
// "this video is not on the connected channel" — an error about the wrong
// account — and, if the platform's own Google account owns a channel, any
// customer could read that channel's captions by pasting its links.
//
// So brand connections live separately, keyed by brand, and the caller decides
// which it needs. The YouTube path requires a brand token and must NEVER fall
// back to the platform's: falling back is exactly the cross-tenant leak.

const brandMem = new Map<string, string>();
const BRAND_COLLECTION = "brand_google_oauth";

export async function getBrandGoogleRefreshToken(brandId: string): Promise<string | null> {
  const id = (brandId || "").trim();
  if (!id) return null;
  if (adminConfigured && adminDb) {
    try {
      const s = await adminDb.collection(BRAND_COLLECTION).doc(id.replace(/\//g, "_")).get();
      return s.exists ? ((s.data() as { refreshToken?: string }).refreshToken || null) : null;
    } catch { return null; }
  }
  return brandMem.get(id) || null;
}

export async function setBrandGoogleRefreshToken(brandId: string, token: string): Promise<void> {
  const id = (brandId || "").trim();
  const t = (token || "").trim();
  if (!id || !t) return;
  if (adminConfigured && adminDb) {
    try {
      await adminDb.collection(BRAND_COLLECTION).doc(id.replace(/\//g, "_"))
        .set({ brandId: id, refreshToken: t, updatedAt: new Date().toISOString() }, { merge: true });
    } catch { /* best-effort */ }
  } else {
    brandMem.set(id, t);
  }
}

export async function brandGoogleConnected(brandId: string): Promise<boolean> {
  return Boolean(await getBrandGoogleRefreshToken(brandId));
}

export function __resetBrandGoogleTokens(): void { brandMem.clear(); }
