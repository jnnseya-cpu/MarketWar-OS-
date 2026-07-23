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
