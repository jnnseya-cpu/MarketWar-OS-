// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// IP/domain warm-up automation — the reputation governor.
//
// A brand-new sending IP has no reputation; sending too much too soon gets it
// throttled or blocked. This engine enforces a RAMPING DAILY CAP per brand: the
// first day allows a trickle, and the ceiling grows as the sender proves itself,
// so campaigns automatically stay inside safe limits without the owner tracking
// anything. Counts persist per calendar day (Firestore, in-memory fallback).
//
// The schedule mirrors docs' warmup-schedule.md and the Gmail/Yahoo bulk-sender
// guidance. Day 1 begins on the brand's FIRST real send.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

type WarmupDoc = { brandId: string; firstSendDate?: string; counts: Record<string, number> };

const mem = new Map<string, WarmupDoc>();

// Ramping ceiling by warm-up day (1-indexed). Beyond day 22 it's steady-state.
export function dailyCapForDay(day: number): number {
  if (day <= 1) return 50;
  if (day === 2) return 100;
  if (day === 3) return 250;
  if (day === 4) return 500;
  if (day === 5) return 1000;
  if (day <= 7) return 2500;
  if (day <= 10) return 5000;
  if (day <= 14) return 10000;
  if (day <= 21) return 25000;
  return 50000;
}

const dayNumber = (firstDate: string | undefined, today: string): number => {
  if (!firstDate) return 1;
  const a = Date.parse(firstDate + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
};

async function read(brandId: string): Promise<WarmupDoc> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("email_warmup").doc(brandId.replace(/\//g, "_")).get();
    return snap.exists ? (snap.data() as WarmupDoc) : { brandId, counts: {} };
  }
  return mem.get(brandId) ?? { brandId, counts: {} };
}

async function write(doc: WarmupDoc): Promise<void> {
  if (adminConfigured && adminDb) await adminDb.collection("email_warmup").doc(doc.brandId.replace(/\//g, "_")).set(doc, { merge: true });
  else mem.set(doc.brandId, doc);
}

export type WarmupStatus = { day: number; dailyCap: number; sentToday: number; remaining: number };

// Today's warm-up posture for a brand. `today` is a YYYY-MM-DD date string.
export async function getWarmup(brandId: string, today: string): Promise<WarmupStatus> {
  const doc = await read(brandId);
  const day = dayNumber(doc.firstSendDate, today);
  const dailyCap = dailyCapForDay(day);
  const sentToday = doc.counts[today] ?? 0;
  return { day, dailyCap, sentToday, remaining: Math.max(0, dailyCap - sentToday) };
}

// Record `n` sends for today, stamping the first-send date the very first time.
export async function recordWarmupSends(brandId: string, today: string, n: number): Promise<void> {
  if (n <= 0) return;
  const doc = await read(brandId);
  if (!doc.firstSendDate) doc.firstSendDate = today;
  doc.counts = doc.counts || {};
  doc.counts[today] = (doc.counts[today] ?? 0) + n;
  // Keep the map bounded — only the last ~60 days matter.
  const keys = Object.keys(doc.counts).sort();
  if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete doc.counts[k];
  await write(doc);
}
