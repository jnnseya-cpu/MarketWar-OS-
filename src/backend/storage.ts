// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Firebase Storage upload — turns a generated creative (PNG/MP4 bytes) into a
// PUBLIC hosted URL so it can be attached to a social post. Gated by Firebase
// Admin config; returns null when unconfigured so callers fall back to an inline
// data-URI preview (which is honest: a preview can't post to socials).

import { adminStorage } from "@/backend/firebase-admin";

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  "";

export function storageConfigured(): boolean {
  return Boolean(adminStorage && BUCKET);
}

// Live self-diagnostic: actually write a tiny object and read it back, surfacing
// Google's exact error if it fails (permissions, wrong bucket, uniform-access).
// This catches what storageConfigured() can't — creds present but upload denied.
export async function probeStorage(): Promise<{
  configured: boolean; bucket: string; ran: boolean; ok?: boolean; url?: string; readable?: boolean; error?: string; fix?: string;
}> {
  if (!adminStorage || !BUCKET) {
    return { configured: false, bucket: BUCKET || "(none)", ran: false,
      fix: !BUCKET ? "No storage bucket set — set FIREBASE_STORAGE_BUCKET (or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) in Vercel." : "Firebase Admin isn't initialised — set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY." };
  }
  try {
    const bucket = adminStorage.bucket(BUCKET);
    const path = "health/storage-probe.txt";
    const file = bucket.file(path);
    const token = "healthprobe";
    await file.save(Buffer.from(`ok ${new Date().toISOString()}`), {
      contentType: "text/plain", resumable: false,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    let readable = false;
    try { const r = await fetch(url); readable = r.ok; } catch { /* network */ }
    return { configured: true, bucket: BUCKET, ran: true, ok: true, url, readable };
  } catch (e) {
    const msg = (e as Error).message || "unknown error";
    const m = msg.toLowerCase();
    let fix = "Read the raw error above — it's Google's verbatim reason.";
    if (m.includes("does not exist") || m.includes("notfound") || m.includes("no such bucket")) fix = "The bucket name is wrong or the bucket doesn't exist. Confirm it in Firebase → Storage (usually <project>.appspot.com or <project>.firebasestorage.app) and set FIREBASE_STORAGE_BUCKET to match.";
    else if (m.includes("permission") || m.includes("forbidden") || m.includes("403") || m.includes("iam")) fix = "The service account lacks Storage permission. In Google Cloud → IAM, give the Firebase Admin service account the 'Storage Admin' (or Object Admin) role.";
    else if (m.includes("billing")) fix = "Storage needs billing enabled (Blaze plan) on the Firebase project.";
    return { configured: true, bucket: BUCKET, ran: true, ok: false, error: msg, fix };
  }
}

// Deterministic FNV-1a hash → stable object name for identical content (so the
// same creative re-uploads to the same path rather than piling up duplicates).
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function uploadPublicMedia(
  buffer: Buffer,
  opts: { contentType: string; ext: string; keyPrefix?: string; nameSeed: string },
): Promise<string | null> {
  if (!adminStorage || !BUCKET) return null;
  try {
    const bucket = adminStorage.bucket(BUCKET);
    const path = `${opts.keyPrefix || "creatives"}/${hash(opts.nameSeed)}.${opts.ext}`;
    const file = bucket.file(path);
    // A Firebase download token (deterministic → the same content re-uploads to
    // the same public URL, so links stay stable and dedupe). This is the ROBUST
    // way to get a permanent public URL: unlike ACL-based makePublic(), the
    // download-token URL works under UNIFORM bucket-level access — which is the
    // DEFAULT on modern Firebase buckets, and where makePublic() throws (its
    // error was previously swallowed, leaving a googleapis URL that 403s → the
    // creative rendered blank). The token URL needs no per-object ACL at all.
    const token = `${hash(opts.nameSeed)}${hash(opts.nameSeed + "·mw-token")}`;
    await file.save(buffer, {
      contentType: opts.contentType,
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=31536000",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    // Best-effort ACL public-read too (helps on legacy fine-grained buckets);
    // never depend on it — the token URL below is what we return.
    await file.makePublic().catch(() => {});
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch {
    return null; // never break generation on an upload failure — fall back to preview
  }
}
