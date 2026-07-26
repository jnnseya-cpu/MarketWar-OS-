// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Zernio webhook engine — verifies inbound events from the publish aggregator and
// records real post/account outcomes so the OS reflects what actually happened
// (published / failed / scheduled; account connected / disconnected) instead of
// being fire-and-forget. Signature is verified with Node crypto (HMAC-SHA256 over
// the raw body, ZERNIO_WEBHOOK_SECRET) with a static-token fallback. Idempotent by
// event id. Firestore-backed with an in-memory fallback for zero-config.

import { createHmac, timingSafeEqual } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export function zernioWebhookConfigured(): boolean {
  return Boolean(process.env.ZERNIO_WEBHOOK_SECRET);
}

// ---- signature verification ----------------------------------------------
export type SigVerdict = { valid: boolean; reason?: string; method?: "hmac" | "token" | "demo" };

const strip = (s: string) => s.replace(/^sha256=/i, "").trim();
function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Verify the request. Prefers HMAC-SHA256 of the raw body (hex or base64) against
// the signature header; falls back to a static shared-secret token header. Returns
// demo-valid ONLY when no secret is configured (never in production — the route
// fails closed).
export function verifyZernioSignature(raw: string, headers: { signature?: string | null; token?: string | null }, secret?: string): SigVerdict {
  if (!secret) return { valid: true, method: "demo" };
  const sig = headers.signature ? strip(headers.signature) : "";
  if (sig) {
    const hex = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    const b64 = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
    if (safeEqualStr(sig, hex) || safeEqualStr(sig, b64)) return { valid: true, method: "hmac" };
    return { valid: false, reason: "Signature mismatch — HMAC of the body didn't match the header.", method: "hmac" };
  }
  // Static token fallback (some webhook configs send the secret verbatim).
  const tok = (headers.token || "").replace(/^Bearer\s+/i, "").trim();
  if (tok && safeEqualStr(tok, secret)) return { valid: true, method: "token" };
  return { valid: false, reason: "No valid signature or token header present." };
}

// ---- event normalisation --------------------------------------------------
export type ZernioEvent = { id?: string; type?: string; event?: string; data?: Record<string, unknown>; [k: string]: unknown };
export type NormalisedEvent = {
  eventId: string;
  kind: "published" | "failed" | "scheduled" | "account_connected" | "account_disconnected" | "unknown";
  postId?: string;
  profileId?: string;
  platform?: string;
  status: string;
  note: string;
};

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function normaliseEvent(evt: ZernioEvent): NormalisedEvent {
  const type = (s(evt.type) || s(evt.event) || "").toLowerCase();
  const d = (evt.data && typeof evt.data === "object" ? evt.data : evt) as Record<string, unknown>;
  const postId = s(d.postId) || s(d._id) || s(d.id);
  const profileId = s(d.profileId) || s(d.profile);
  const platform = s(d.platform) || (Array.isArray(d.platforms) ? (d.platforms as unknown[]).map(String).join(",") : undefined);
  const eventId = s(evt.id) || s((evt as Record<string, unknown>).eventId) || `${type}:${postId || profileId || ""}:${s(d.status) || ""}`;

  let kind: NormalisedEvent["kind"] = "unknown";
  if (/publish(ed)?|success|complete/.test(type)) kind = "published";
  else if (/fail|error|rejected/.test(type)) kind = "failed";
  else if (/schedul/.test(type)) kind = "scheduled";
  else if (/account.*(connect|link|add)|connect.*success/.test(type)) kind = "account_connected";
  else if (/account.*(disconnect|remove|revoke)|disconnect/.test(type)) kind = "account_disconnected";
  // Fall back to a status field if the type was generic (e.g. type "post.updated").
  const statusField = (s(d.status) || "").toLowerCase();
  if (kind === "unknown" && statusField) {
    if (/publish|success|sent/.test(statusField)) kind = "published";
    else if (/fail|error/.test(statusField)) kind = "failed";
    else if (/schedul/.test(statusField)) kind = "scheduled";
  }

  const note =
    kind === "published" ? `Post ${postId || ""} published${platform ? ` to ${platform}` : ""}.`
    : kind === "failed" ? `Post ${postId || ""} failed${platform ? ` on ${platform}` : ""}${s(d.error) ? ` — ${s(d.error)}` : ""}.`
    : kind === "scheduled" ? `Post ${postId || ""} scheduled.`
    : kind === "account_connected" ? `Account connected${platform ? ` (${platform})` : ""}.`
    : kind === "account_disconnected" ? `Account disconnected${platform ? ` (${platform})` : ""}.`
    : `Unhandled event "${type || "unknown"}".`;

  return { eventId, kind, postId, profileId, platform, status: statusField || kind, note };
}

// ---- idempotency + persistence -------------------------------------------
const seen = new Set<string>();                       // in-memory idempotency
const postStatus = new Map<string, Record<string, unknown>>(); // postId → status

// Returns true if this event id is NEW (first time seen) — so a redelivered event
// is processed at most once.
export async function claimEvent(eventId: string): Promise<boolean> {
  if (adminConfigured && adminDb) {
    const ref = adminDb.collection("zernio_events").doc(eventId.replace(/\//g, "_").slice(0, 200));
    try {
      const snap = await ref.get();
      if (snap.exists) return false;
      await ref.set({ eventId, at: new Date().toISOString() });
      return true;
    } catch { return true; } // best-effort: don't drop a real event on a store hiccup
  }
  if (seen.has(eventId)) return false;
  seen.add(eventId);
  return true;
}

export async function recordPostStatus(ev: NormalisedEvent): Promise<void> {
  if (!ev.postId) return;
  const rec = { postId: ev.postId, status: ev.status, kind: ev.kind, platform: ev.platform ?? null, profileId: ev.profileId ?? null, updatedAt: new Date().toISOString() };
  if (adminConfigured && adminDb) {
    try { await adminDb.collection("zernio_posts").doc(ev.postId.replace(/\//g, "_").slice(0, 200)).set(rec, { merge: true }); } catch { /* best-effort */ }
  } else {
    postStatus.set(ev.postId, rec);
  }
}

// Process a verified event: dedupe, then persist its outcome. Returns what happened.
export async function handleZernioEvent(evt: ZernioEvent): Promise<{ processed: boolean; duplicate?: boolean; event: NormalisedEvent }> {
  const event = normaliseEvent(evt);
  const fresh = await claimEvent(event.eventId);
  if (!fresh) return { processed: false, duplicate: true, event };
  if (event.kind === "published" || event.kind === "failed" || event.kind === "scheduled") {
    await recordPostStatus(event);
  }
  return { processed: true, event };
}
