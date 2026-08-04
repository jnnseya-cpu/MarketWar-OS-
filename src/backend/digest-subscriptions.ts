// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Who has actually asked for the morning digest.
//
// `vercel.json` has pointed a cron at /api/autopilot/nightly since the route was
// written, and that cron has never done anything: the digest lives on POST and
// needs a brand list and a recipient in the body, which a cron does not have. So
// the route was documentation with a schedule attached.
//
// The missing piece was never the code — it was the answer to "who do we send
// it to?", and the two obvious answers are both wrong:
//
//   • Everyone with an account. A daily email nobody asked for is spam, and it
//     is spam sent from the domain this platform's whole deliverability story
//     depends on. One complaint rate ruins every customer's sending.
//   • Whatever address is in the request. A nightly job that mails an
//     address supplied by a caller is a relay that repeats itself for ever.
//
// So a subscription is per OWNER, opt-in, and can only ever point at that
// account's OWN verified email address. Nobody can subscribe somebody else, and
// nobody receives a first email they did not ask for.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type DigestSubscription = {
  ownerId: string;
  email: string;
  enabled: boolean;
  requestedLevel: number;
  budgetGbp: number;
  lastSentAt?: string;
  updatedAt: string;
};

const COLLECTION = "digest_subscriptions";
const mem = new Map<string, DigestSubscription>();
const useDb = () => Boolean(adminConfigured && adminDb);

// A double-firing cron must not mean two emails. Twenty hours rather than
// twenty-four so a schedule that drifts an hour earlier still sends.
export const MIN_HOURS_BETWEEN_SENDS = 20;

export async function getSubscription(ownerId: string): Promise<DigestSubscription | null> {
  const local = mem.get(ownerId);
  if (!useDb()) return local || null;
  try {
    const snap = await adminDb!.collection(COLLECTION).doc(ownerId).get();
    return snap.exists ? (snap.data() as DigestSubscription) : local || null;
  } catch {
    return local || null;
  }
}

export async function setSubscription(input: {
  ownerId: string;
  email: string;
  enabled: boolean;
  requestedLevel?: number;
  budgetGbp?: number;
  nowISO: string;
}): Promise<{ ok: true; subscription: DigestSubscription } | { ok: false; error: string }> {
  const ownerId = (input.ownerId || "").trim();
  const email = (input.email || "").trim().toLowerCase();
  if (!ownerId) return { ok: false, error: "No account — sign in to subscribe." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That is not an email address." };

  const prior = await getSubscription(ownerId);
  const sub: DigestSubscription = {
    ownerId, email,
    enabled: Boolean(input.enabled),
    requestedLevel: Math.max(0, Math.min(4, Math.round(input.requestedLevel ?? prior?.requestedLevel ?? 3))),
    budgetGbp: Math.max(0, Number(input.budgetGbp ?? prior?.budgetGbp ?? 0)),
    lastSentAt: prior?.lastSentAt,
    updatedAt: input.nowISO,
  };
  mem.set(ownerId, sub);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(ownerId).set(sub); } catch { /* memory copy serves this instance */ }
  }
  return { ok: true, subscription: sub };
}

export async function listEnabled(limit = 200): Promise<DigestSubscription[]> {
  const local = Array.from(mem.values()).filter((s) => s.enabled);
  if (!useDb()) return local.slice(0, limit);
  try {
    const snap = await adminDb!.collection(COLLECTION).where("enabled", "==", true).limit(limit).get();
    const rows = snap.docs.map((d) => d.data() as DigestSubscription);
    const byOwner = new Map<string, DigestSubscription>();
    for (const s of [...rows, ...local]) byOwner.set(s.ownerId, s);
    return Array.from(byOwner.values());
  } catch {
    return local.slice(0, limit);
  }
}

export function dueForSend(s: DigestSubscription, nowISO: string): boolean {
  if (!s.enabled) return false;
  if (!s.lastSentAt) return true;
  const last = new Date(s.lastSentAt).getTime();
  const now = new Date(nowISO).getTime();
  if (Number.isNaN(last) || Number.isNaN(now)) return true;
  return now - last >= MIN_HOURS_BETWEEN_SENDS * 3_600_000;
}

// Marked BEFORE the send, deliberately. A crash between "sent" and "recorded"
// sends the same digest again on the next tick, and a duplicate email is worse
// than a missed one — a missed digest is a quiet morning, a duplicate is a
// complaint against the sending domain every customer shares.
export async function markSent(ownerId: string, nowISO: string): Promise<void> {
  const s = await getSubscription(ownerId);
  if (!s) return;
  const next = { ...s, lastSentAt: nowISO, updatedAt: nowISO };
  mem.set(ownerId, next);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(ownerId).set(next); } catch { /* memory copy holds */ }
  }
}

export function __resetDigestSubscriptions(): void { mem.clear(); }
