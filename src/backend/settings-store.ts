// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Settings store — persists tenant preferences that were previously local-only
// UI state. Today it holds the per-capability autonomy dial (L0–L4) from the
// Settings & Security Center so a chosen autonomy level survives refresh and is
// enforced server-side later.
//
// Persistence mirrors the results ledger / invites store: Firestore
// (settings/{key}) when the Admin SDK is configured, otherwise an in-memory
// store so the zero-config demo works with no keys. Keyed per scope (a brand id,
// falling back to "default") so each brand carries its own posture.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

// capability name → chosen autonomy level. Levels are validated/clamped against
// the policy ceiling on the client and again wherever they are enforced.
export type AutonomyPrefs = Record<string, number>;

export type SettingsDoc = {
  key: string;
  autonomy: AutonomyPrefs;
  updatedAt: string;
};

const mem = new Map<string, SettingsDoc>();

const COLLECTION = "settings";

// Keep only finite, non-negative integer levels — never trust the wire blindly.
export function sanitizeAutonomy(input: unknown): AutonomyPrefs {
  const out: AutonomyPrefs = {};
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
    }
  }
  return out;
}

export async function getSettings(key: string): Promise<SettingsDoc | null> {
  const id = (key || "").trim() || "default";
  if (adminConfigured && adminDb) {
    const doc = await adminDb.collection(COLLECTION).doc(id).get();
    return doc.exists ? (doc.data() as SettingsDoc) : null;
  }
  return mem.get(id) ?? null;
}

export async function saveSettings(key: string, autonomy: AutonomyPrefs, nowISO?: string): Promise<SettingsDoc> {
  const id = (key || "").trim() || "default";
  const existing = (adminConfigured && adminDb) ? null : mem.get(id);
  const doc: SettingsDoc = {
    key: id,
    // Merge onto any existing prefs so a partial save never wipes other keys.
    autonomy: { ...(existing?.autonomy ?? {}), ...sanitizeAutonomy(autonomy) },
    updatedAt: nowISO || new Date().toISOString(),
  };
  if (adminConfigured && adminDb) {
    await adminDb.collection(COLLECTION).doc(id).set(doc, { merge: true });
  } else {
    mem.set(id, doc);
  }
  return doc;
}
