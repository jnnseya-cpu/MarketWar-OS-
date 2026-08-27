// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHERE MARKET-EXIT RECORDS LIVE.
//
// The rules — what counts as evidence, what may be published, which pipeline
// moves are legal — are pure and live in `shared/market-exit.ts`. This file is
// storage and nothing else, deliberately: a store that decides what a legal
// state change is becomes a second rulebook, and the two disagree the first time
// one of them is edited. Same split as the opportunity board.
//
// TWO THINGS IT DOES HOLD, because they are storage concerns rather than rules:
//
//   • THE DISPUTE. §8 requires that a business can challenge a classification
//     and that the challenge stops publication while it stands. A dispute is a
//     stored fact, and `assessClosure` reads it as an input — so the refusal is
//     still the shared rulebook's, and this only remembers that somebody asked.
//   • THE AUDIT TRAIL. Every state change on a record that names a third-party
//     business is written to the audit log. This is the one engine where "who
//     decided this business was closed, on what evidence, and when" has to be
//     answerable months later to somebody's solicitor.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { record as auditRecord } from "@/backend/audit-log";
import {
  assessClosure, advance,
  EXIT_STAGES, EXIT_TERMINAL,
  type ClosureAssessment, type ClosureSignal, type ExitState,
} from "@/shared/market-exit";

const COLLECTION = "market_exit_records";
const useDb = () => adminConfigured && Boolean(adminDb);

export type Dispute = {
  raisedBy: string;
  reason: string;
  at: string;
  resolvedAt?: string;
  resolution?: "upheld" | "rejected";
  resolutionNote?: string;
};

export type ExitRecord = {
  brandId: string;
  businessId: string;
  businessName: string;
  signals: ClosureSignal[];
  state: ExitState;
  /** The state to return to when a dispute is rejected. */
  stateBeforeDispute?: ExitState;
  dispute?: Dispute;
  createdAt: string;
  updatedAt: string;
  history: { from: ExitState | null; to: ExitState; at: string; by: string; note?: string }[];
};

const mem = new Map<string, ExitRecord[]>();
const docId = (brandId: string, businessId: string) => `${brandId}__${businessId}`;

/**
 * Read a stored document into an ExitRecord, or refuse it.
 *
 * A cast would be the programmer promising the compiler something nobody
 * verified — and this collection holds the evidence behind a claim that a named
 * business has shut. A document with a missing `state` or a `signals` that is
 * not an array would sail through a cast and then decide, silently, that a
 * trading business is closed. Anything that does not check out is dropped
 * rather than repaired: a half-read closure record is not a closure record.
 */
export function recordFromStored(data: unknown): ExitRecord | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<ExitRecord>;
  if (typeof d.brandId !== "string" || !d.brandId) return null;
  if (typeof d.businessId !== "string" || !d.businessId) return null;
  if (typeof d.state !== "string" || !STATE_SET.has(d.state)) return null;
  if (!Array.isArray(d.signals)) return null;
  return {
    ...d,
    brandId: d.brandId,
    businessId: d.businessId,
    businessName: typeof d.businessName === "string" ? d.businessName : d.businessId,
    state: d.state,
    signals: d.signals.filter((s): s is ClosureSignal =>
      Boolean(s) && typeof s === "object" && typeof (s as ClosureSignal).source === "string"),
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
    history: Array.isArray(d.history) ? d.history : [],
  };
}

const STATE_SET = new Set<string>([...EXIT_STAGES, ...EXIT_TERMINAL]);

export async function listRecords(brandId: string): Promise<ExitRecord[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).get();
    const byId = new Map<string, ExitRecord>();
    for (const r of local) byId.set(r.businessId, r);
    snap.forEach((d) => { const r = recordFromStored(d.data()); if (r) byId.set(r.businessId, r); });
    return [...byId.values()];
  } catch {
    return [...local];
  }
}

export async function getRecord(brandId: string, businessId: string): Promise<ExitRecord | null> {
  return (await listRecords(brandId)).find((r) => r.businessId === businessId) ?? null;
}

async function persist(record: ExitRecord): Promise<void> {
  const local = mem.get(record.brandId) || [];
  mem.set(record.brandId, [...local.filter((r) => r.businessId !== record.businessId), record]);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(docId(record.brandId, record.businessId)).set(record); }
    catch { /* memory holds it */ }
  }
}

/**
 * Record signals about a business and return the resulting assessment.
 *
 * Signals ACCUMULATE — a closure case is built over days from different sources,
 * and throwing away last week's registry filing because this week's crawl only
 * found the website would make the two-source rule impossible to satisfy. A
 * signal already held (same source, same type, same observation date) is not
 * duplicated, so a re-crawl cannot inflate a case by repeating itself.
 */
export async function observe(input: {
  brandId: string;
  businessId: string;
  businessName: string;
  signals: ClosureSignal[];
  at: string;
  by?: string;
}): Promise<{ record: ExitRecord; assessment: ClosureAssessment }> {
  const existing = await getRecord(input.brandId, input.businessId);
  const key = (s: ClosureSignal) => `${s.source}|${s.signalType}|${s.observedAt}`;
  const seen = new Set((existing?.signals ?? []).map(key));
  const added = input.signals.filter((s) => !seen.has(key(s)));

  const record: ExitRecord = existing
    ? { ...existing, signals: [...existing.signals, ...added], updatedAt: input.at }
    : {
        brandId: input.brandId, businessId: input.businessId, businessName: input.businessName,
        signals: [...input.signals], state: "detected",
        createdAt: input.at, updatedAt: input.at,
        history: [{ from: null, to: "detected", at: input.at, by: input.by || "system" }],
      };

  await persist(record);

  const assessment = assessClosure({
    businessId: record.businessId,
    signals: record.signals,
    assessedAt: input.at,
    disputeOpen: isDisputeOpen(record),
  });

  return { record, assessment };
}

export function isDisputeOpen(record: ExitRecord): boolean {
  return Boolean(record.dispute && !record.dispute.resolvedAt);
}

/** Re-assess what is already stored, without adding anything. */
export async function assess(brandId: string, businessId: string, at: string): Promise<ClosureAssessment | null> {
  const record = await getRecord(brandId, businessId);
  if (!record) return null;
  return assessClosure({ businessId, signals: record.signals, assessedAt: at, disputeOpen: isDisputeOpen(record) });
}

export async function moveState(input: {
  brandId: string; businessId: string; to: ExitState; by: string; note?: string; at: string;
}): Promise<{ ok: false; error: string } | { ok: true; record: ExitRecord }> {
  const record = await getRecord(input.brandId, input.businessId);
  if (!record) return { ok: false, error: "No market-exit record for that business." };

  // THE SHARED RULES DECIDE. Nothing about legality is re-implemented here.
  const legal = advance(record.state, input.to);
  if (!legal.ok) return legal;

  // A record cannot progress while a dispute stands. Withdrawing is the one
  // move that stays open, because the answer to "we are still trading" must
  // always be available immediately and without argument.
  if (isDisputeOpen(record) && input.to !== "withdrawn") {
    return { ok: false, error: "A dispute is open on this business. Resolve it before this record moves anywhere but withdrawn." };
  }

  const next: ExitRecord = {
    ...record, state: input.to, updatedAt: input.at,
    history: [...record.history, { from: record.state, to: input.to, at: input.at, by: input.by, note: input.note }],
  };
  await persist(next);
  auditRecord({
    actorType: "user", actor: input.by, action: `market_exit.${input.to}`,
    resource: "market_exit", resourceId: record.businessId, brandId: input.brandId,
    before: { state: record.state }, after: { state: input.to },
    reason: input.note, nowISO: input.at,
  });
  return { ok: true, record: next };
}

/**
 * §8 — a business disputes its classification.
 *
 * Deliberately requires no proof to OPEN. The burden here runs the other way
 * round: we published something about somebody, so their saying "this is wrong"
 * is enough to stop us while a person looks. Requiring evidence to pause a
 * damaging claim would make the correction path decorative.
 */
export async function raiseDispute(input: {
  brandId: string; businessId: string; raisedBy: string; reason: string; at: string;
}): Promise<{ ok: false; error: string } | { ok: true; record: ExitRecord }> {
  const record = await getRecord(input.brandId, input.businessId);
  if (!record) return { ok: false, error: "No market-exit record for that business." };
  if (!input.reason.trim()) return { ok: false, error: "A dispute needs a reason — it is what the review reads." };
  if (isDisputeOpen(record)) return { ok: false, error: "A dispute is already open on this record." };

  const next: ExitRecord = {
    ...record,
    dispute: { raisedBy: input.raisedBy, reason: input.reason.trim(), at: input.at },
    stateBeforeDispute: record.state,
    state: "disputed",
    updatedAt: input.at,
    history: [...record.history, { from: record.state, to: "disputed", at: input.at, by: input.raisedBy, note: input.reason.trim() }],
  };
  await persist(next);
  auditRecord({
    actorType: "user", actor: input.raisedBy, action: "market_exit.disputed",
    resource: "market_exit", resourceId: record.businessId, brandId: input.brandId,
    before: { state: record.state }, after: { state: "disputed" },
    reason: input.reason.trim(), nowISO: input.at,
  });
  return { ok: true, record: next };
}

/**
 * Resolve a dispute.
 *
 * UPHELD means the business was right and the record is withdrawn — not
 * "corrected and carried on". A classification that was wrong once does not get
 * to keep the evidence that produced it and try again from where it left off;
 * the signals stay for the audit trail, and a fresh case has to be made.
 */
export async function resolveDispute(input: {
  brandId: string; businessId: string; resolution: "upheld" | "rejected"; note: string; by: string; at: string;
}): Promise<{ ok: false; error: string } | { ok: true; record: ExitRecord }> {
  const record = await getRecord(input.brandId, input.businessId);
  if (!record) return { ok: false, error: "No market-exit record for that business." };
  if (!isDisputeOpen(record)) return { ok: false, error: "There is no open dispute on this record." };
  if (!input.note.trim()) return { ok: false, error: "Say what the review found. An unexplained resolution teaches nothing and the same dispute comes back." };

  // REJECTED restores the state the record was in when the dispute arrived. That
  // is a restore rather than a transition, so it does not go through `advance` —
  // the state being returned to was already legal when it was left.
  const to: ExitState = input.resolution === "upheld" ? "withdrawn" : (record.stateBeforeDispute ?? "detected");
  const next: ExitRecord = {
    ...record,
    dispute: { ...record.dispute!, resolvedAt: input.at, resolution: input.resolution, resolutionNote: input.note.trim() },
    state: to,
    stateBeforeDispute: undefined,
    updatedAt: input.at,
    history: [...record.history, { from: "disputed", to, at: input.at, by: input.by, note: input.note.trim() }],
  };
  await persist(next);
  auditRecord({
    actorType: "user", actor: input.by, action: `market_exit.dispute_${input.resolution}`,
    resource: "market_exit", resourceId: record.businessId, brandId: input.brandId,
    before: { state: "disputed" }, after: { state: to },
    reason: input.note.trim(), nowISO: input.at,
  });
  return { ok: true, record: next };
}

/** Test seam. Never called by product code. */
export function __resetMarketExit(): void { mem.clear(); }
