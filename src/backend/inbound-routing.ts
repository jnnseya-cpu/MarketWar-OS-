// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHAT HAPPENS TO A MESSAGE THAT ARRIVES — one implementation, two front doors.
//
// THE GAP THIS CLOSES, AND IT WAS A PRODUCT GAP RATHER THAN A BUG. Every piece
// of receiving was built: classification (bounce / auto-reply / human), routing a
// failure back to the brand that sent it via the VERP envelope, the suppression
// ledger, the unified Inbox. All of it hung off ONE entry point,
// `/api/inbound/email`, which is an HTTP webhook that a mail node has to POST to
// — and no such node exists on this deployment.
//
// So nothing ever arrived, and the only way to learn why a message failed was to
// open the mailbox the envelope sender points at and read the delivery notice by
// hand. The owner's answer to that was the correct one: with a thousand customers
// sending from their own domains, nobody is opening a mailbox. A platform reads
// its own bounces.
//
// This file is the routing itself, lifted out of the route unchanged, so the
// webhook and the mailbox collector cannot drift into two different answers about
// what a bounce means. Behaviour is preserved exactly; only the seam is new.

import { saveInbound, classifyInbound } from "@/backend/inbound";
import { brandForDomain } from "@/backend/sending-domains";
import { brandFromReplyAddress, parseBounceAddress } from "@/backend/reply-routing";

export type InboundInput = {
  to: string;
  from: string;
  subject?: string;
  text?: string;
  html?: string;
  fromName?: string;
  receivedAt?: string;
  /** Raw headers when the source has them — RFC 3834 auto-submitted, and so on. */
  headers?: Record<string, string>;
};

export type InboundOutcome = {
  routed: "suppression" | "inbox" | "inbox (auto-reply)" | "ignored";
  why?: string;
  /** The address recorded as bounced, when one was identified. */
  suppressed?: string | null;
  /** The brand the message was attributed to, when one was found. */
  brandId?: string;
  note?: string;
  id?: string;
};

const emailOf = (s: string): string =>
  (s || "").match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase() || "";

/**
 * Route one received message.
 *
 * CLASSIFY FIRST, THEN FIND THE OWNER — the order matters and reversing it drops
 * every bounce. A delivery failure is addressed to the Return-Path mailbox, which
 * is not a brand reply address and not a brand's sending domain, so resolving the
 * brand first makes it fall out as "no brand owns this" before the bounce branch
 * is ever reached. Found by driving a real DSN through the handler.
 */
export async function routeInbound(input: InboundInput): Promise<InboundOutcome> {
  const to = emailOf(String(input.to ?? ""));
  const from = emailOf(String(input.from ?? ""));
  const subject = typeof input.subject === "string" ? input.subject : "";
  const text = typeof input.text === "string" ? input.text : undefined;
  const html = typeof input.html === "string" ? input.html : undefined;
  const fromName = typeof input.fromName === "string" ? input.fromName : undefined;
  const receivedAt =
    typeof input.receivedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(input.receivedAt)
      ? input.receivedAt
      : new Date().toISOString();
  const headers = (input.headers && typeof input.headers === "object" ? input.headers : {}) as Record<string, string>;

  if (!to || !from) return { routed: "ignored", note: "to and from are both required to route a message." };

  const { kind, why } = classifyInbound(from, to, subject, headers);

  // The reply address on our own reply host is tried FIRST, because it is the one
  // that works without the customer publishing any DNS at all. Then the recipient
  // domain, then the bounce subdomain, which carries the brand's domain inside it.
  const toDomain = to.split("@")[1] || "";
  const verp = parseBounceAddress(to);
  const brandId =
    verp?.brandId
    || brandFromReplyAddress(to)
    || (await brandForDomain(toDomain))
    // HYPHENS TOO. The bounce host is `<selector>bounce.<domain>` and the DKIM
    // selector is brand-scoped — `mwos-koda`, so `mwos-kodabounce.…` — which the
    // old `[a-z0-9]*` class could not match, dropping every bounce on a
    // multi-brand domain.
    || (await brandForDomain(toDomain.replace(/^[a-z0-9-]*bounce\./i, "")));

  if (kind === "bounce") {
    // ONLY A REAL DELIVERY FAILURE MAY SUPPRESS AN ADDRESS, and only the address
    // the envelope names. The VERP recipient is a fact about the message we sent;
    // the body scrape is a guess about prose another mail server wrote, and a
    // wrong guess suppresses a live customer for ever.
    let failed = "";
    if (verp && brandId) {
      const { brandEvents } = await import("@/backend/email-events");
      const { recipientFromKey } = await import("@/backend/reply-routing");
      const sentTo = (await brandEvents(brandId).catch(() => []))
        .filter((e) => e.type === "sent")
        .map((e) => e.email);
      failed = recipientFromKey(brandId, verp.key, sentTo);
    }
    if (!failed) failed = emailOf(text || html || "");
    if (!brandId) {
      return { routed: "ignored", why, note: "A delivery failure arrived for a recipient no brand owns." };
    }
    if (failed && failed !== from) {
      const { recordEvent } = await import("@/backend/email-events");
      try {
        await recordEvent({ brandId, email: failed, type: "bounce", at: receivedAt });
      } catch { /* best-effort */ }
    }
    return { routed: "suppression", why, suppressed: failed || null, brandId };
  }

  if (!brandId) return { routed: "ignored", why, note: "No brand owns this recipient address." };

  // An auto-reply is evidence a real person received it. It goes to the Inbox
  // flagged, so the customer sees it and it is not mistaken for a real reply.
  // KEEP THE MESSAGE-ID. It was already parsed out of the arriving headers and
  // then discarded, so every reply the platform sent started a NEW conversation
  // beside the one it was answering. Header names arrive in whatever case the
  // sending server used, so both spellings are looked for.
  const messageId = String(headers["Message-ID"] ?? headers["message-id"] ?? "").trim() || undefined;

  const msg = await saveInbound({
    brandId, from, fromName, to, subject, text, html, messageId,
    snippet: text || "", receivedAt, auto: kind === "auto-reply",
  });
  return { routed: kind === "auto-reply" ? "inbox (auto-reply)" : "inbox", why, brandId, id: msg.id };
}
