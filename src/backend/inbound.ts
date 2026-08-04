// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Inbound mail store — the receiving half of the ESP (read replies in-app).
//
// When a recipient REPLIES to a campaign, that mail arrives at the sending node
// (its MX). The node pushes each message to /api/inbound/email, which resolves
// the owning brand (by the recipient domain) and stores it here. The dashboard
// Inbox then shows every reply per brand — a unified inbox, like Brevo — without
// the user needing IMAP or a separate mail client. Bounces/auto-replies are
// filtered out upstream (they feed the suppression ledger instead).

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type InboundMessage = {
  id: string;
  brandId: string;
  from: string;        // sender email
  fromName?: string;
  to: string;          // the address it was sent to (a brand address)
  subject: string;
  snippet: string;     // short preview
  text?: string;
  html?: string;
  receivedAt: string;
  read: boolean;
  /** An out-of-office or auto-responder. Shown, flagged, and never suppressed. */
  auto?: boolean;
};

const mem = new Map<string, InboundMessage[]>(); // brandId → messages

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 20);
const docId = (id: string) => id.replace(/\//g, "_");

export async function saveInbound(m: Omit<InboundMessage, "id" | "read"> & { id?: string }): Promise<InboundMessage> {
  const id = m.id || `${m.brandId}::${hid(`${m.from}|${m.subject}|${m.receivedAt}`)}`;
  const msg: InboundMessage = {
    id, brandId: m.brandId, from: m.from.toLowerCase(), fromName: m.fromName, auto: m.auto,
    to: m.to.toLowerCase(), subject: m.subject || "(no subject)",
    snippet: (m.snippet || m.text || "").replace(/\s+/g, " ").trim().slice(0, 240),
    text: m.text ? m.text.slice(0, 100_000) : undefined,
    html: m.html ? m.html.slice(0, 300_000) : undefined,
    receivedAt: m.receivedAt, read: false,
  };
  if (adminConfigured && adminDb) {
    await adminDb.collection("inbound_messages").doc(docId(id)).set(msg, { merge: true });
  } else {
    const list = mem.get(m.brandId) ?? [];
    if (!list.find((x) => x.id === id)) list.unshift(msg);
    mem.set(m.brandId, list.slice(0, 2000));
  }
  return msg;
}

export async function listInbound(brandId: string, limit = 200): Promise<InboundMessage[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("inbound_messages").where("brandId", "==", brandId).limit(limit).get();
    return snap.docs.map((d) => d.data() as InboundMessage).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }
  return (mem.get(brandId) ?? []).slice(0, limit);
}

export async function getInbound(brandId: string, id: string): Promise<InboundMessage | null> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("inbound_messages").doc(docId(id)).get();
    const m = snap.exists ? (snap.data() as InboundMessage) : null;
    return m && m.brandId === brandId ? m : null;
  }
  return (mem.get(brandId) ?? []).find((x) => x.id === id) ?? null;
}

export async function markRead(brandId: string, id: string, read = true): Promise<void> {
  if (adminConfigured && adminDb) {
    const ref = adminDb.collection("inbound_messages").doc(docId(id));
    const snap = await ref.get();
    if (snap.exists && (snap.data() as InboundMessage).brandId === brandId) await ref.set({ read }, { merge: true });
  } else {
    const list = mem.get(brandId) ?? [];
    const m = list.find((x) => x.id === id);
    if (m) m.read = read;
  }
}

export async function unreadCount(brandId: string): Promise<number> {
  return (await listInbound(brandId)).filter((m) => !m.read).length;
}

/**
 * What kind of message is this?
 *
 * THREE THINGS, NOT TWO. This used to be a boolean — automated or not — and the
 * conflation caused real harm in both directions.
 *
 *   A BOUNCE says the address is dead. It belongs in the suppression ledger and
 *   nowhere else.
 *
 *   AN OUT-OF-OFFICE says the opposite: a real person received it and is on
 *   holiday. It was being treated as a bounce, and the route then scraped the
 *   first email address out of the body to suppress — so "please contact
 *   colleague@company.com while I am away" could permanently suppress a live
 *   colleague who had never bounced anything. It also meant the customer never
 *   saw the auto-reply at all, which is the complaint that started this.
 *
 *   A HUMAN REPLY goes to the Inbox.
 *
 * Only a real delivery-status notification may suppress an address.
 */
export type InboundKind = "bounce" | "auto-reply" | "human";

const DAEMON = /mailer-daemon|postmaster|daemon@/i;
const NOREPLY = /no-?reply|do-?not-?reply/i;
const DSN_SUBJECT = /delivery status notification|undeliverable|mail delivery (?:failed|subsystem)|returned mail|delivery has failed|failure notice|message not delivered/i;
const AUTO_SUBJECT = /auto(?:matic)?[- ]?reply|out of (?:the )?office|autoresponder|away from (?:my|the) (?:desk|office)|annual leave|on holiday|vacation reply|abwesenheit|réponse automatique/i;

export function classifyInbound(
  from: string,
  to: string,
  subject: string,
  headers: Record<string, string> = {},
): { kind: InboundKind; why: string } {
  const f = (from || "").toLowerCase();
  const t = (to || "").toLowerCase();
  const s = (subject || "").toLowerCase();
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v || "").toLowerCase()]));

  // RFC 3834 and the de-facto headers. An auto-responder that labels itself is
  // the easiest case and the most reliable.
  const autoSubmitted = h["auto-submitted"] || "";
  if (autoSubmitted && autoSubmitted !== "no") {
    return DSN_SUBJECT.test(s)
      ? { kind: "bounce", why: `Auto-Submitted: ${autoSubmitted} with a delivery-failure subject` }
      : { kind: "auto-reply", why: `the sender marked it Auto-Submitted: ${autoSubmitted}` };
  }
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-response-suppress"]) {
    return { kind: "auto-reply", why: "the sender's own auto-responder headers" };
  }

  // A real delivery-status notification: from the mail system, about a failure.
  if (DAEMON.test(f) || /^bounce@|^bounce\+|@bounces?\./.test(t)) {
    return { kind: "bounce", why: "it came from the mail system, not from a person" };
  }
  if (DSN_SUBJECT.test(s)) return { kind: "bounce", why: "the subject is a delivery-failure notice" };

  if (AUTO_SUBJECT.test(s)) return { kind: "auto-reply", why: "the subject is an out-of-office or auto-reply" };
  // A no-reply sender is a machine, but it is not a failure — showing it is
  // right, suppressing the address it mentions is not.
  if (NOREPLY.test(f)) return { kind: "auto-reply", why: "the sender is a no-reply mailbox" };

  return { kind: "human", why: "no automated signature" };
}

/**
 * Kept because it shipped and callers may hold it.
 *
 * It answers the OLD question — "is this anything other than a human reply" —
 * and must never again be used to decide whether to suppress an address. Use
 * `classifyInbound` for that.
 */
export function looksAutomated(from: string, to: string, subject: string): boolean {
  return classifyInbound(from, to, subject).kind !== "human";
}
