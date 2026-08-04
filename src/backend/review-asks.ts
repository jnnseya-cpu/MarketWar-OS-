// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The record of who has been asked for a review, and when.
//
// §66 shipped the engine that decides who to ask and writes the message, and
// recorded the gap honestly: it did not SEND, and "already asked" was passed in
// by the caller. Both halves of that were a problem.
//
// The sending half is obvious. The other half is worse: the cool-off — the rule
// that stops the same customer being asked every fortnight until they block the
// address — was enforced against a number supplied by whoever called the API. A
// caller who omitted it got a clean slate every time, so in practice there was
// no cool-off at all. A limit checked against data the caller provides is not a
// limit.
//
// So the ledger lives here, it is the only source the eligibility check reads,
// and an ask is recorded for every message that actually goes out — including
// the ones a customer sends by hand over WhatsApp, because a text they sent on
// Tuesday still means the person was asked on Tuesday.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type ReviewAsk = {
  id: string;
  brandId: string;
  contactId: string;
  platformId: string;
  channel: "email" | "sms" | "whatsapp";
  at: string;            // ISO
  sentBy: "platform" | "by-hand";
};

const COLLECTION = "review_asks";
const mem = new Map<string, ReviewAsk[]>();   // brandId → asks
const useDb = () => Boolean(adminConfigured && adminDb);
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export async function recordAsks(input: {
  brandId: string;
  contactIds: string[];
  platformId: string;
  channel: ReviewAsk["channel"];
  nowISO: string;
  sentBy?: ReviewAsk["sentBy"];
}): Promise<ReviewAsk[]> {
  const rows: ReviewAsk[] = [];
  for (const contactId of input.contactIds) {
    if (!contactId) continue;
    rows.push({
      id: `${input.brandId}::${hid(contactId + "|" + input.platformId + "|" + input.nowISO)}`,
      brandId: input.brandId,
      contactId,
      platformId: input.platformId,
      channel: input.channel,
      at: input.nowISO,
      sentBy: input.sentBy || "platform",
    });
  }
  if (!rows.length) return [];
  mem.set(input.brandId, [...(mem.get(input.brandId) || []), ...rows]);
  if (useDb()) {
    try {
      const batch = adminDb!.batch();
      for (const r of rows) batch.set(adminDb!.collection(COLLECTION).doc(r.id.replace(/\//g, "_")), r);
      await batch.commit();
    } catch { /* the in-memory copy still serves this instance */ }
  }
  return rows;
}

export async function listAsks(brandId: string, limit = 5000): Promise<ReviewAsk[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(limit).get();
    const rows = snap.docs.map((d) => d.data() as ReviewAsk);
    const byId = new Map<string, ReviewAsk>();
    for (const r of [...rows, ...local]) byId.set(r.id, r);
    return Array.from(byId.values());
  } catch {
    return [...local];
  }
}

// What the eligibility check reads: for each contact, how many days since they
// were LAST asked — on any platform, through any channel. Asking the same
// person for a Google review and a Trustpilot review in the same week is still
// asking them twice.
export async function askedDaysAgo(brandId: string, nowISO: string): Promise<Record<string, number>> {
  const asks = await listAsks(brandId);
  const now = new Date(nowISO).getTime();
  const out: Record<string, number> = {};
  for (const a of asks) {
    const t = new Date(a.at).getTime();
    if (Number.isNaN(t) || Number.isNaN(now)) continue;
    const days = Math.max(0, Math.floor((now - t) / 86_400_000));
    if (!(a.contactId in out) || days < out[a.contactId]) out[a.contactId] = days;
  }
  return out;
}

export function __resetReviewAsks(): void { mem.clear(); }
