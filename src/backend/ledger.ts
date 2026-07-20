// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Server-side results ledger — the one place attributed revenue is recorded, so
// three sources write to the SAME ledger the Revenue dashboard reads:
//   1. Manual "Log a result" (owned, dashboard)
//   2. Owned landing-page form captures (POST /api/results)
//   3. Stripe payment webhooks (automatic — attributed by metadata)
//
// Persistence: Firestore (results/{id}) when the Admin SDK is configured;
// otherwise an in-memory store so the test works with zero config. In-memory is
// per-process (resets on restart, per-instance) — fine for a single-instance
// test; Firestore is the durable production path. Idempotent by event id, so a
// redelivered Stripe webhook never double-counts.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { type RevenueEvent, type ResultsSummary, summarize } from "@/shared/results";

const mem = new Map<string, RevenueEvent[]>(); // brandId -> events (newest first)

export async function recordEvent(e: RevenueEvent): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection("results").doc(e.id).set(e, { merge: false });
    return;
  }
  const list = (mem.get(e.brandId) ?? []).filter((x) => x.id !== e.id); // idempotent by id
  mem.set(e.brandId, [e, ...list]);
}

export async function listEvents(brandId: string): Promise<RevenueEvent[]> {
  if (!brandId) return [];
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("results").where("brandId", "==", brandId).get();
    return snap.docs.map((d) => d.data() as RevenueEvent).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  }
  return mem.get(brandId) ?? [];
}

export async function deleteEvent(brandId: string, id: string): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection("results").doc(id).delete();
    return;
  }
  mem.set(brandId, (mem.get(brandId) ?? []).filter((e) => e.id !== id));
}

export async function brandSummary(brandId: string): Promise<ResultsSummary> {
  return summarize(await listEvents(brandId));
}
