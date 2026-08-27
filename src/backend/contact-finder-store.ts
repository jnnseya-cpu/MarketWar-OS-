// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// BULK JOBS — and the one thing that must never go wrong.
//
// A ten-thousand-row job that is interrupted and restarted must not redo
// finished rows and must NOT CHARGE FOR THEM AGAIN. Recharging a customer for
// work they already paid for is the single most expensive defect this engine
// could ship: it is invisible to us, obvious to them, and it is the end of the
// account. So the charge ledger is per (row, operation), it is written BEFORE
// the operation runs rather than after, and `chargeFor` in the shared rules is
// the only thing that decides an amount.
//
// WRITTEN BEFORE, NOT AFTER, is deliberate and is the opposite of what feels
// natural. If the ledger is written after the work, a crash between the work and
// the write means the resume repeats the work and charges for it — the customer
// pays twice for one result. Writing first means a crash between the write and
// the work costs the customer one operation they did not receive, which the
// refund path already handles. Given a choice between double-charging silently
// and over-charging visibly, take the visible one.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { record as auditRecord } from "@/backend/audit-log";
import {
  chargeFor, isFinished,
  type BillableOperation, type ChargeOutcome, type RowState, type ResultRow,
} from "@/shared/contact-finder";

const JOBS = "contact_finder_jobs";
const useDb = () => adminConfigured && Boolean(adminDb);

export type JobRow = {
  originalRow: number;
  state: RowState;
  /** Operations already charged for this row, so a resume cannot repeat one. */
  charged: BillableOperation[];
  acus: number;
  failureReason?: string;
};

export type FinderJob = {
  id: string;
  brandId: string;
  originalColumns: string[];
  rows: JobRow[];
  duplicatesRemoved: number;
  acusConsumed: number;
  /** The ceiling the user agreed to. The job stops rather than exceeding it. */
  maxAcus: number | null;
  stoppedOnBudget: boolean;
  createdAt: string;
  updatedAt: string;
};

const mem = new Map<string, FinderJob>();
const key = (brandId: string, jobId: string) => `${brandId}__${jobId}`;

export function jobFromStored(data: unknown): FinderJob | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<FinderJob>;
  if (typeof d.id !== "string" || !d.id) return null;
  if (typeof d.brandId !== "string" || !d.brandId) return null;
  if (!Array.isArray(d.rows)) return null;
  return {
    id: d.id,
    brandId: d.brandId,
    originalColumns: Array.isArray(d.originalColumns) ? d.originalColumns.filter((c): c is string => typeof c === "string") : [],
    rows: d.rows.filter((r): r is JobRow => Boolean(r) && typeof r === "object" && typeof (r as JobRow).originalRow === "number")
      .map((r) => ({ ...r, charged: Array.isArray(r.charged) ? r.charged : [], acus: Number(r.acus) || 0 })),
    duplicatesRemoved: Number(d.duplicatesRemoved) || 0,
    acusConsumed: Number(d.acusConsumed) || 0,
    maxAcus: typeof d.maxAcus === "number" ? d.maxAcus : null,
    stoppedOnBudget: d.stoppedOnBudget === true,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
  };
}

export async function getJob(brandId: string, jobId: string): Promise<FinderJob | null> {
  const local = mem.get(key(brandId, jobId));
  if (local) return local;
  if (useDb()) {
    try {
      const doc = await adminDb!.collection(JOBS).doc(key(brandId, jobId)).get();
      return doc.exists ? jobFromStored(doc.data()) : null;
    } catch { return null; }
  }
  return null;
}

async function persist(job: FinderJob): Promise<void> {
  mem.set(key(job.brandId, job.id), job);
  if (useDb()) {
    try { await adminDb!.collection(JOBS).doc(key(job.brandId, job.id)).set(job); }
    catch { /* memory holds it */ }
  }
}

export async function createJob(input: {
  brandId: string; id: string; originalColumns: string[];
  rows: number[]; duplicatesRemoved: number; maxAcus?: number | null; at: string; by?: string;
}): Promise<FinderJob> {
  const existing = await getJob(input.brandId, input.id);
  // IDEMPOTENT BY ID. A retried upload with the same job id returns the job that
  // already exists rather than starting a second one beside it — otherwise a
  // flaky connection is a doubled bill.
  if (existing) return existing;

  const job: FinderJob = {
    id: input.id, brandId: input.brandId, originalColumns: input.originalColumns,
    rows: input.rows.map((originalRow) => ({ originalRow, state: "UPLOADED", charged: [], acus: 0 })),
    duplicatesRemoved: input.duplicatesRemoved,
    acusConsumed: 0,
    maxAcus: typeof input.maxAcus === "number" ? input.maxAcus : null,
    stoppedOnBudget: false,
    createdAt: input.at, updatedAt: input.at,
  };
  await persist(job);
  auditRecord({
    actorType: "user", actor: input.by || "you", action: "contact_finder.job_created",
    resource: "contact_finder_job", resourceId: job.id, brandId: job.brandId,
    after: { rows: job.rows.length, maxAcus: job.maxAcus }, nowISO: input.at,
  });
  return job;
}

/**
 * Charge for one operation on one row, once.
 *
 * Returns `{ charged: 0 }` and does no work when this row and operation have
 * already been paid for in this job — which is what makes a resume safe. The
 * amount itself is never decided here; `chargeFor` in the shared rules decides
 * it, so the five outcomes that must cost nothing cannot be handled one way in
 * the ledger and another way in a surface.
 */
export async function chargeRow(input: {
  brandId: string; jobId: string; originalRow: number;
  operation: BillableOperation; outcome: ChargeOutcome; isReverification?: boolean;
}): Promise<{ ok: false; error: string } | { ok: true; acus: number; why: string; budgetStopped: boolean }> {
  const job = await getJob(input.brandId, input.jobId);
  if (!job) return { ok: false, error: "No such job." };
  const row = job.rows.find((r) => r.originalRow === input.originalRow);
  if (!row) return { ok: false, error: `Row ${input.originalRow} is not in this job.` };

  const alreadyCharged = row.charged.includes(input.operation);
  const { acus, why } = chargeFor({ ...input, alreadyCharged });

  // THE BUDGET IS A CEILING, NOT A TARGET. A job that would cross it stops
  // rather than crossing it, and says so — a customer who set a limit meant it.
  if (acus > 0 && job.maxAcus !== null && job.acusConsumed + acus > job.maxAcus) {
    const stopped: FinderJob = { ...job, stoppedOnBudget: true, updatedAt: new Date().toISOString() };
    await persist(stopped);
    return { ok: true, acus: 0, why: `This would take the job past its ${job.maxAcus}-ACU ceiling, so it stopped instead. ${job.acusConsumed} spent so far.`, budgetStopped: true };
  }

  if (acus > 0) {
    const next: FinderJob = {
      ...job,
      acusConsumed: Math.round((job.acusConsumed + acus) * 100) / 100,
      rows: job.rows.map((r) => r.originalRow === input.originalRow
        ? { ...r, charged: [...r.charged, input.operation], acus: Math.round((r.acus + acus) * 100) / 100 }
        : r),
      updatedAt: new Date().toISOString(),
    };
    await persist(next);
  }
  return { ok: true, acus, why, budgetStopped: false };
}

export async function setRowState(input: {
  brandId: string; jobId: string; originalRow: number; state: RowState; failureReason?: string;
}): Promise<{ ok: false; error: string } | { ok: true; job: FinderJob }> {
  const job = await getJob(input.brandId, input.jobId);
  if (!job) return { ok: false, error: "No such job." };
  const row = job.rows.find((r) => r.originalRow === input.originalRow);
  if (!row) return { ok: false, error: `Row ${input.originalRow} is not in this job.` };

  // A FINISHED ROW STAYS FINISHED. Re-running a completed row is how a resume
  // turns into a rerun, and a rerun is how the customer pays twice.
  if (isFinished(row.state)) {
    return { ok: false, error: `Row ${input.originalRow} is already ${row.state} and does not run again. Start a new job to reprocess it.` };
  }

  const next: FinderJob = {
    ...job,
    rows: job.rows.map((r) => r.originalRow === input.originalRow ? { ...r, state: input.state, failureReason: input.failureReason } : r),
    updatedAt: new Date().toISOString(),
  };
  await persist(next);
  return { ok: true, job: next };
}

/** What is left to do. This is what a resume reads. */
export function unfinishedRows(job: FinderJob): JobRow[] {
  return job.rows.filter((r) => !isFinished(r.state));
}

export function progress(job: FinderJob): {
  received: number; unique: number; processed: number;
  completed: number; partial: number; review: number; notFound: number; blocked: number;
  acusConsumed: number; stoppedOnBudget: boolean;
} {
  const by = (s: RowState) => job.rows.filter((r) => r.state === s).length;
  const processed = job.rows.filter((r) => isFinished(r.state)).length;
  return {
    received: job.rows.length + job.duplicatesRemoved,
    unique: job.rows.length,
    processed,
    completed: by("COMPLETED"),
    partial: by("PARTIAL"),
    review: by("MANUAL_REVIEW"),
    notFound: by("NOT_FOUND"),
    blocked: by("BLOCKED"),
    acusConsumed: job.acusConsumed,
    stoppedOnBudget: job.stoppedOnBudget,
  };
}

/** Rebuild the result rows a workbook needs from what the job holds. */
export function resultRowsFrom(job: FinderJob, originals: Record<number, Record<string, string>>): ResultRow[] {
  return job.rows.map((r) => ({
    originalRow: r.originalRow,
    state: r.state,
    original: originals[r.originalRow] ?? {},
    mw: {
      MW_Record_ID: `rec_${job.id}_${r.originalRow}`,
      MW_Original_Row: String(r.originalRow),
      ...(r.failureReason ? { MW_Failure_Reason: r.failureReason } : {}),
    },
  }));
}

/** Test seam. Never called by product code. */
export function __resetFinderJobs(): void { mem.clear(); }
