// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Per-brand integration connections — the multi-tenant "Connect your accounts"
// store. Each user connects THEIR OWN external accounts (WhatsApp number, ad
// platform, social channels) per brand, so agents like FIRSTRESPONDER and SNIPER
// activate per-user instead of through one shared platform key.
//
// SECURITY: secrets are encrypted at rest (AES-256-GCM, key from CONNECTIONS_
// SECRET), stored in a deny-all Firestore collection reachable only via the
// Admin SDK, and NEVER returned to the client — the status API exposes booleans +
// non-secret metadata (e.g. the connected phone number) only.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type Provider = "whatsapp" | "meta_ads" | "google_ads" | "zernio";

export const PROVIDERS: { id: Provider; label: string; side: "user" | "admin"; fields: { key: string; label: string; secret: boolean }[]; note: string }[] = [
  { id: "whatsapp", label: "WhatsApp Business (Cloud API)", side: "user", fields: [{ key: "phoneNumberId", label: "Phone number ID", secret: false }, { key: "token", label: "Permanent access token", secret: true }], note: "Replies + broadcasts send from YOUR WhatsApp number. From Meta → WhatsApp → API Setup." },
  { id: "meta_ads", label: "Meta Ads (Facebook/Instagram)", side: "user", fields: [{ key: "adAccountId", label: "Ad account ID (act_…)", secret: false }, { key: "token", label: "Access token", secret: true }], note: "SNIPER launches ads on YOUR ad account and spends YOUR budget." },
  { id: "google_ads", label: "Google Ads", side: "user", fields: [{ key: "customerId", label: "Customer ID", secret: false }, { key: "token", label: "OAuth refresh token", secret: true }], note: "SNIPER launches ads on YOUR Google Ads account." },
  { id: "zernio", label: "Social channels (Zernio)", side: "admin", fields: [{ key: "channels", label: "Connected channel handles (comma-separated)", secret: false }], note: "Publishing runs on the platform's Zernio service (billed via ACUs); connect your channel handles here." },
];

type ConnectionDoc = {
  brandId: string; provider: Provider;
  enc: Record<string, string>;   // encrypted secret fields (iv:tag:cipher)
  meta: Record<string, string>;  // non-secret fields (safe to surface)
  connectedAt: string;
};

const mem = new Map<string, ConnectionDoc>();
const keyOf = (brandId: string, p: Provider) => `${brandId}::${p}`;
const docId = (k: string) => k.replace(/[/.]/g, "_");

// ---- encryption ----
function encKey(): Buffer {
  const secret = process.env.CONNECTIONS_SECRET || process.env.EMAIL_TRACKING_SECRET || "mw-dev-connections-secret";
  return createHash("sha256").update(secret).digest(); // 32 bytes
}
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}
function decrypt(blob: string): string {
  const [ivB, tagB, dataB] = blob.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

// Save a connection. `fields` splits into encrypted secrets + plain meta by the
// provider's field spec. Missing secret fields keep the previous value (so a user
// can update the phone number without re-pasting the token).
export async function saveConnection(brandId: string, provider: Provider, fields: Record<string, string>, nowISO: string): Promise<void> {
  const spec = PROVIDERS.find((p) => p.id === provider);
  if (!spec) throw new Error("Unknown provider");
  const existing = await readDoc(brandId, provider);
  const enc: Record<string, string> = { ...(existing?.enc ?? {}) };
  const meta: Record<string, string> = { ...(existing?.meta ?? {}) };
  for (const f of spec.fields) {
    const v = (fields[f.key] ?? "").trim();
    if (f.secret) { if (v) enc[f.key] = encrypt(v); }
    else meta[f.key] = v;
  }
  const doc: ConnectionDoc = { brandId, provider, enc, meta, connectedAt: existing?.connectedAt || nowISO };
  if (adminConfigured && adminDb) await adminDb.collection("brand_connections").doc(docId(keyOf(brandId, provider))).set(doc, { merge: true });
  else mem.set(keyOf(brandId, provider), doc);
}

async function readDoc(brandId: string, provider: Provider): Promise<ConnectionDoc | null> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("brand_connections").doc(docId(keyOf(brandId, provider))).get();
    return snap.exists ? (snap.data() as ConnectionDoc) : null;
  }
  return mem.get(keyOf(brandId, provider)) ?? null;
}

// SERVER-ONLY: decrypted credentials for actually calling the provider. Never
// expose the result to the client.
export async function getCredentials(brandId: string, provider: Provider): Promise<Record<string, string> | null> {
  const doc = await readDoc(brandId, provider);
  if (!doc) return null;
  const out: Record<string, string> = { ...doc.meta };
  for (const [k, v] of Object.entries(doc.enc)) { try { out[k] = decrypt(v); } catch { /* skip corrupt */ } }
  return out;
}

export async function isConnected(brandId: string, provider: Provider): Promise<boolean> {
  const doc = await readDoc(brandId, provider);
  if (!doc) return false;
  const spec = PROVIDERS.find((p) => p.id === provider);
  const needSecret = spec?.fields.some((f) => f.secret);
  return needSecret ? Object.keys(doc.enc).length > 0 : Object.values(doc.meta).some(Boolean);
}

// Client-safe status: connected booleans + NON-secret metadata only.
export async function connectionStatus(brandId: string): Promise<{ provider: Provider; connected: boolean; meta: Record<string, string> }[]> {
  return Promise.all(PROVIDERS.map(async (p) => {
    const doc = await readDoc(brandId, p.id);
    return { provider: p.id, connected: await isConnected(brandId, p.id), meta: doc?.meta ?? {} };
  }));
}

export async function deleteConnection(brandId: string, provider: Provider): Promise<void> {
  if (adminConfigured && adminDb) await adminDb.collection("brand_connections").doc(docId(keyOf(brandId, provider))).delete();
  else mem.delete(keyOf(brandId, provider));
}
