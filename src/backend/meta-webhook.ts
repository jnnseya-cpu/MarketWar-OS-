// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHERE INSTAGRAM AND MESSENGER EVENTS COME IN.
//
// Meta posts every comment, DM, story reply and mention to one URL. This
// verifies that the post really came from Meta, then flattens their payload —
// which nests three levels deep and differs per product — into the single
// `SocialEvent` shape the trigger engine understands.
//
// THE SIGNATURE IS NOT OPTIONAL AND IS NOT A FORMALITY. This endpoint must be
// public for Meta to reach it, which means it is public for everyone. Without
// HMAC verification anyone who learns the URL can post a fake comment and make
// the platform send a DM from the customer's own Instagram account — a stranger
// driving a brand's account, in their name. It is compared in constant time,
// because a byte-by-byte comparison leaks the correct prefix to anyone patient.
//
// Verification uses FB_APP_SECRET, the same secret the existing Meta OAuth in
// `meta-publish.ts` already uses. One app, one secret, no new configuration.

import { createHmac, timingSafeEqual } from "crypto";
import type { SocialEvent, TriggerEvent } from "@/shared/social-triggers";

export function metaWebhookConfigured(): boolean {
  return Boolean(process.env.FB_APP_SECRET);
}

/** The token Meta echoes back when the subscription is first set up. */
export function metaVerifyToken(): string {
  return (process.env.META_VERIFY_TOKEN || "").trim();
}

export type SigVerdict = { valid: boolean; reason?: string };

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // Different lengths cannot be compared in constant time, and are never equal.
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

/**
 * Is this really from Meta?
 *
 * Meta signs the RAW body with the app secret and sends it as
 * `X-Hub-Signature-256: sha256=<hex>`. The raw bytes matter: re-serialising the
 * parsed JSON changes key order and whitespace, and the signature then never
 * matches — which is the single most common way this integration is got wrong.
 *
 * With no secret configured this REFUSES rather than waving the request through.
 * An unverified webhook that acts on its payload is worse than one that is off,
 * and "it worked in development" is exactly how it reaches production open.
 */
export function verifyMetaSignature(rawBody: string, header: string | null | undefined): SigVerdict {
  const secret = (process.env.FB_APP_SECRET || "").trim();
  if (!secret) {
    return { valid: false, reason: "FB_APP_SECRET is not set, so this deployment cannot prove an event came from Meta." };
  }
  const sig = (header || "").trim();
  if (!sig) return { valid: false, reason: "No X-Hub-Signature-256 header." };
  if (!/^sha256=/i.test(sig)) return { valid: false, reason: "Signature header is not sha256." };
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqualHex(sig.replace(/^sha256=/i, "").toLowerCase(), expected)
    ? { valid: true }
    : { valid: false, reason: "Signature did not match the body." };
}

// ---------------------------------------------------------------------------
// Flattening Meta's payload.
// ---------------------------------------------------------------------------
//
// The shape is `{ object, entry: [ { id, time, changes?: [...], messaging?: [...] } ] }`.
// Comments arrive under `changes`, messages under `messaging`, and the two carry
// completely different field names for the same ideas. Everything below is
// defensive: a field Meta renames should drop ONE event, not throw inside a
// webhook handler and make Meta retry the whole batch forever.

type Unknown = Record<string, unknown>;
const obj = (v: unknown): Unknown => (v && typeof v === "object" ? (v as Unknown) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Turn one webhook body into zero or more normalised events.
 *
 * `brandId` is supplied by the caller, which resolves it from the receiving
 * account id — this function does no lookups and stays pure.
 */
export function normaliseMetaEvents(body: unknown, resolveBrandId: (recipientId: string) => string | null): SocialEvent[] {
  const out: SocialEvent[] = [];
  const root = obj(body);
  const objectType = str(root.object); // "instagram" | "page" | ...

  for (const rawEntry of arr(root.entry)) {
    const entry = obj(rawEntry);
    const recipientId = str(entry.id);
    const brandId = recipientId ? resolveBrandId(recipientId) : null;
    // An event for an account nobody here has connected is not an error — other
    // people's accounts can share an app. It is simply not ours.
    if (!brandId) continue;

    const entryTime = typeof entry.time === "number" ? new Date(entry.time * 1000).toISOString() : new Date().toISOString();

    // --- comments, mentions, live comments (the `changes` shape) -------------
    for (const rawChange of arr(entry.changes)) {
      const change = obj(rawChange);
      const field = str(change.field);
      const value = obj(change.value);

      let event: TriggerEvent | null = null;
      if (field === "comments" || field === "live_comments") event = field === "comments" ? "comment" : "live_comment";
      else if (field === "mentions") event = "mention";
      if (!event) continue;

      const from = obj(value.from);
      const fromUserId = str(from.id) || str(value.from_id);
      const media = obj(value.media);
      out.push({
        brandId,
        event,
        fromUserId,
        recipientId,
        text: str(value.text) || str(value.message) || undefined,
        mediaId: str(media.id) || str(value.media_id) || undefined,
        // Meta's own id for the comment. Used to reject redeliveries, so a
        // retried batch cannot DM somebody twice.
        eventId: str(value.id) || `${recipientId}:${field}:${entryTime}`,
        atISO: entryTime,
      });
    }

    // --- direct messages and story replies (the `messaging` shape) -----------
    for (const rawMsg of arr(entry.messaging)) {
      const m = obj(rawMsg);
      const sender = obj(m.sender);
      const recipient = obj(m.recipient);
      const message = obj(m.message);
      if (!Object.keys(message).length) continue; // delivery receipts, read receipts

      // A story reply carries a `reply_to.story`; without it, it is an ordinary DM.
      const replyTo = obj(message.reply_to);
      const isStoryReply = Boolean(Object.keys(obj(replyTo.story)).length);

      out.push({
        brandId,
        event: isStoryReply ? "story_reply" : "dm",
        fromUserId: str(sender.id),
        recipientId: str(recipient.id) || recipientId,
        text: str(message.text) || undefined,
        eventId: str(message.mid) || `${recipientId}:msg:${entryTime}`,
        atISO: typeof m.timestamp === "number" ? new Date(m.timestamp).toISOString() : entryTime,
      });
    }
  }

  // `object` is kept out of the event on purpose: the trigger rules care what
  // HAPPENED, not which Meta product delivered it, and Instagram and Messenger
  // send the same shapes under different object names.
  void objectType;
  return out;
}
