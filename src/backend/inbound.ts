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
};

const mem = new Map<string, InboundMessage[]>(); // brandId → messages

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 20);
const docId = (id: string) => id.replace(/\//g, "_");

export async function saveInbound(m: Omit<InboundMessage, "id" | "read"> & { id?: string }): Promise<InboundMessage> {
  const id = m.id || `${m.brandId}::${hid(`${m.from}|${m.subject}|${m.receivedAt}`)}`;
  const msg: InboundMessage = {
    id, brandId: m.brandId, from: m.from.toLowerCase(), fromName: m.fromName,
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

// A message is a bounce / automated notice (not a human reply) — route to
// suppression, not the inbox. Detects mailer-daemon senders, our bounce
// Return-Path recipient, and auto-reply headers passed as flags.
export function looksAutomated(from: string, to: string, subject: string): boolean {
  const f = (from || "").toLowerCase();
  const t = (to || "").toLowerCase();
  const s = (subject || "").toLowerCase();
  return /mailer-daemon|postmaster|no-?reply|bounce|daemon@/.test(f)
    || /^bounce@|^bounce\+|@bounces?\./.test(t)
    || /delivery status notification|undeliverable|mail delivery failed|returned mail|auto(?:matic)?[- ]?reply|out of office/.test(s);
}
