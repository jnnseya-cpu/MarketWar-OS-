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
import { scheduleCapForDay, warmupCap, type WarmupSignals } from "@/shared/warmup-ramp";

type WarmupDoc = { brandId: string; firstSendDate?: string; counts: Record<string, number> };

const mem = new Map<string, WarmupDoc>();

/**
 * The published ramp, by warm-up day.
 *
 * STILL A CEILING, NO LONGER THE WHOLE ANSWER. On its own this authorised 50,000
 * messages on day 40 from a brand that had sent fifty, because the only input is
 * the calendar. `getWarmup` now takes the lower of this and what the brand's own
 * delivery record has earned — see `shared/warmup-ramp.ts` for why.
 *
 * Kept exported and unchanged in behaviour: it is the published schedule, and
 * callers that want to show "the ramp for day N" are asking a real question.
 */
export const dailyCapForDay = scheduleCapForDay;

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

export type WarmupStatus = {
  day: number;
  /** What may actually be sent today — the lower of the two ceilings. */
  dailyCap: number;
  sentToday: number;
  remaining: number;
  /** The published ramp for this day, so "why is it not 50,000?" has an answer. */
  scheduleCap: number;
  /** What this brand's own delivery record has earned. */
  earnedCap: number;
  /** Which ceiling is binding, and what the ramp is doing. */
  governedBy: "schedule" | "reputation";
  verdict: "grow" | "hold" | "rollback" | "stop";
  /** One sentence for the sender, in terms of what to do about it. */
  reason: string;
  bounceRatePct: number | null;
  complaintRatePct: number | null;
};

/**
 * The best single day of ACCEPTED sends before today.
 *
 * Today is excluded deliberately. A ceiling derived from today's own running
 * total would rise as the day's sending progressed — send to the cap, the cap
 * doubles, send again — which is not a ceiling at all.
 */
function bestPreviousDay(counts: Record<string, number>, today: string): number {
  let best = 0;
  for (const [day, n] of Object.entries(counts || {})) {
    if (day >= today) continue;
    if (typeof n === "number" && n > best) best = n;
  }
  return best;
}

/**
 * Today's warm-up posture for a brand. `today` is a YYYY-MM-DD date string.
 *
 * `signals` may be supplied by a caller that has already loaded the delivery
 * ledger (the stats route has), so the same events are not read twice. Left out,
 * they are read here — a governor that silently skips its own inputs when they
 * are inconvenient is the defect it exists to fix.
 */
export async function getWarmup(
  brandId: string,
  today: string,
  signals?: Pick<WarmupSignals, "sent" | "bounce" | "complaint">,
): Promise<WarmupStatus> {
  const doc = await read(brandId);
  const day = dayNumber(doc.firstSendDate, today);
  const counts = doc.counts || {};

  let outcomes = signals;
  if (!outcomes) {
    try {
      const { eventStats } = await import("@/backend/email-events");
      const s = await eventStats(brandId);
      outcomes = { sent: s.sent, bounce: s.bounce, complaint: s.complaint };
    } catch {
      // The ledger is unreadable. That is NOT a reason to fall back to the
      // calendar ceiling — an unknown reputation is exactly the case the
      // doubling rule is conservative about. Zero outcomes with a real best day
      // still holds the cap to twice what has actually been sent.
      outcomes = { sent: 0, bounce: 0, complaint: 0 };
    }
  }

  const governed = warmupCap({
    day,
    signals: { bestDay: bestPreviousDay(counts, today), ...outcomes },
  });
  const sentToday = counts[today] ?? 0;
  return {
    day,
    dailyCap: governed.cap,
    sentToday,
    remaining: Math.max(0, governed.cap - sentToday),
    scheduleCap: governed.scheduleCap,
    earnedCap: governed.earned,
    governedBy: governed.governedBy,
    verdict: governed.verdict,
    reason: governed.reason,
    bounceRatePct: governed.bounceRatePct,
    complaintRatePct: governed.complaintRatePct,
  };
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
