// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The per-brand daily cap on UNATTENDED agent spend.
//
// "Continuously observes, learns, predicts, creates" is a lovely sentence and an
// unbounded invoice. An always-on network that runs a ten-agent chain every hour
// costs 1,200 ACUs a day per brand before anybody has asked it for anything, and
// the first time anyone notices is the bill.
//
// THE DISTINCTION THAT MATTERS. This caps what the orchestrator spends ON ITS
// OWN INITIATIVE. It does not cap what a customer deliberately does: somebody
// who wants to run forty agents this afternoon has paid for forty agents and
// must not be told they have reached a limit they never set. Metering (§63) and
// the wallet already govern that. This governs the part nobody is watching.
//
// The day is UTC and fixed. A per-brand timezone would be friendlier, but a cap
// that resets at a moving boundary is a cap that can be walked around by moving,
// and the operational cost of "which day is it for this brand" is not worth it
// for a spend ceiling.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

// 1 ACU = 1p, so the default ceiling is £2.50 of unattended spend per brand per
// day — roughly fifty agent runs. High enough that a real chain never hits it,
// low enough that a runaway loop costs the price of a coffee before it stops.
export const DEFAULT_DAILY_CAP_ACU = 250;

export function dailyCapAcu(): number {
  const raw = Number(process.env.AGENT_DAILY_CAP_ACU);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_DAILY_CAP_ACU;
  return Math.floor(raw);
}

export const utcDay = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const COLLECTION = "agent_budget";
const mem = new Map<string, number>();   // `${brandId}::${day}` → ACUs spent
const useDb = () => Boolean(adminConfigured && adminDb);
const cell = (brandId: string, day: string) => `${brandId}::${day}`;

export async function spentToday(brandId: string, nowISO: string): Promise<number> {
  const key = cell(brandId, utcDay(nowISO));
  const local = mem.get(key) || 0;
  if (!useDb()) return local;
  try {
    const snap = await adminDb!.collection(COLLECTION).doc(key.replace(/\//g, "_")).get();
    const stored = snap.exists ? Number((snap.data() as { acu?: number }).acu || 0) : 0;
    // The local counter is a same-instance mirror, not a second budget: take
    // whichever is higher so a Firestore write that has not landed yet cannot
    // let a second call spend the same headroom twice.
    return Math.max(stored, local);
  } catch {
    return local;
  }
}

export type Headroom = { capAcu: number; spentAcu: number; remainingAcu: number; day: string; exhausted: boolean };

export async function headroom(brandId: string, nowISO: string): Promise<Headroom> {
  const capAcu = dailyCapAcu();
  const spentAcu = await spentToday(brandId, nowISO);
  const remainingAcu = Math.max(0, capAcu - spentAcu);
  return { capAcu, spentAcu, remainingAcu, day: utcDay(nowISO), exhausted: remainingAcu <= 0 };
}

// Charged BEFORE the work, like every other spend on this platform. A step that
// records its cost only on success lets a failing loop run for ever, because
// failure is free and the counter never moves.
export async function reserve(brandId: string, nowISO: string, acus: number): Promise<{ ok: boolean; headroom: Headroom; error?: string }> {
  const before = await headroom(brandId, nowISO);
  const want = Math.max(0, Math.floor(acus));
  if (want > before.remainingAcu) {
    return {
      ok: false,
      headroom: before,
      error: `Unattended agent spend for this brand has reached its daily ceiling (${before.spentAcu}/${before.capAcu} ACUs today). This limits what the orchestrator does on its own — anything you run yourself is unaffected.`,
    };
  }
  const key = cell(brandId, utcDay(nowISO));
  mem.set(key, (mem.get(key) || 0) + want);
  if (useDb()) {
    try {
      const doc = adminDb!.collection(COLLECTION).doc(key.replace(/\//g, "_"));
      const snap = await doc.get();
      const stored = snap.exists ? Number((snap.data() as { acu?: number }).acu || 0) : 0;
      await doc.set({ brandId, day: utcDay(nowISO), acu: Math.max(stored, mem.get(key) || 0), updatedAt: nowISO });
    } catch { /* the in-memory counter still holds for this instance */ }
  }
  return { ok: true, headroom: await headroom(brandId, nowISO) };
}

export function __resetAgentBudget(): void { mem.clear(); }
