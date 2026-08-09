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
// Persistence: Firestore (results/{brandHash_id}) when the Admin SDK is configured;
// otherwise an in-memory store so the test works with zero config. In-memory is
// per-process (resets on restart, per-instance) — fine for a single-instance
// test; Firestore is the durable production path. Idempotent by event id, so a
// redelivered Stripe webhook never double-counts.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { type RevenueEvent, type ResultsSummary, summarize } from "@/shared/results";

const mem = new Map<string, RevenueEvent[]>(); // brandId -> events (newest first)

/**
 * The document key, and why it carries the brand.
 *
 * This used to be the bare event id, and that was a cross-tenant hole in the
 * PRODUCTION path only. `/api/results` accepts a caller-supplied `id` — it has
 * to, so a redelivered Stripe webhook does not double-count — and it proves the
 * caller owns the brand in the body. It never proved they owned the id. So a
 * caller who owned brand A could post brand B's event id and `set(..., {merge:
 * false})` would overwrite B's record with A's brandId, at which point B's
 * revenue vanished from `listEvents` entirely. `deleteEvent` was worse: it
 * ignored brandId altogether and deleted whatever document carried that id.
 *
 * Nothing caught it because the in-memory store is keyed by brand and was
 * always safe — the test store and the production store had different security
 * properties, which is the deeper defect. Scoping the key makes the two agree
 * and makes the whole class impossible rather than merely checked: brand A
 * cannot address brand B's document, so there is no ownership test to forget.
 */
export function resultDocKey(brandId: string, id: string): string {
  // The brand is HASHED rather than concatenated, because a separator that can
  // appear inside either part is not a separator: `("b", "1__2")` and
  // `("b__1", "2")` both flatten to `b__1__2`. Sanitising for Firestore's key
  // rules makes it worse — "a/b" and "a_b" become the same string. A fixed-width
  // digest of the brand has neither problem, so two brands cannot produce the
  // same document key however their ids are spelled.
  const brand = createHash("sha256").update(brandId).digest("hex").slice(0, 24);
  return `${brand}_${id.replace(/[/\s]/g, "_")}`.slice(0, 400);
}

export async function recordEvent(e: RevenueEvent): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection("results").doc(resultDocKey(e.brandId, e.id)).set(e, { merge: false });
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
    await adminDb.collection("results").doc(resultDocKey(brandId, id)).delete();
    // Records written before the key carried the brand are still keyed by the
    // bare id. They are deletable — refusing would strand them — but only after
    // the record itself confirms whose they are. Deleting revenue is not
    // recoverable, so this reads before it removes.
    try {
      const legacy = adminDb.collection("results").doc(id);
      const snap = await legacy.get();
      if (snap.exists && (snap.data() as RevenueEvent | undefined)?.brandId === brandId) await legacy.delete();
    } catch { /* the scoped delete above already ran */ }
    return;
  }
  mem.set(brandId, (mem.get(brandId) ?? []).filter((e) => e.id !== id));
}

export async function brandSummary(brandId: string): Promise<ResultsSummary> {
  return summarize(await listEvents(brandId));
}
