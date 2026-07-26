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
