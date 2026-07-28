// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Video job queue — the missing half of the Video War Room.
//
// Everything that manipulates pixels (trim, burn captions, intro/outro, clip
// cutting, B-roll, background removal, upscale) needs FFmpeg with CPU time and
// disk. Vercel functions cannot do it: ~60s ceiling, read-only filesystem, small
// request bodies, no persistent process. So the app does NOT process video — it
// ENQUEUES the work here, and a separate FFmpeg worker (worker/, deployable to
// Cloud Run / Fly.io / Railway) claims jobs, renders, uploads to Storage and
// writes the result back.
//
// The queue is the contract between the two. It is deliberately simple and
// crash-safe: a claimed job that is never completed becomes stale and is
// re-claimable, so a worker dying mid-render never loses the job. Claiming is
// done in a Firestore transaction so two workers can never take the same job.
//
// ACUs are charged when the job is ENQUEUED and refunded if it fails, matching
// how the SEO post engine handles money.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { debitAcus, creditAcus } from "@/backend/wallet";
import { buildRecipe, RecipeError } from "@/backend/ffmpeg-recipes";

export type VideoJobKind =
  | "trim"            // cut in/out points → one clip
  | "clips"           // cut many moments → N social clips
  | "captions_burn"   // burn an SRT into the frame
  | "brand"           // intro/outro/watermark
  | "broll"           // composite B-roll over the base
  | "bg_remove"       // background removal / green screen
  | "upscale";        // resolution upscale

export type VideoJobStatus = "queued" | "running" | "done" | "failed";

// What each job costs the customer. Rendering is CPU-heavy and the worker is a
// real machine we pay for, so these are priced like AI actions, not nominal.
export const JOB_COST_ACU: Record<VideoJobKind, number> = {
  trim: 10, clips: 40, captions_burn: 15, brand: 10, broll: 25, bg_remove: 30, upscale: 35,
};

export type VideoJob = {
  id: string;
  brandId: string;
  kind: VideoJobKind;
  status: VideoJobStatus;
  sourceUrl: string;              // hosted input (Firebase Storage or https)
  params: Record<string, unknown>; // kind-specific: {startSec,endSec} | {moments:[]} | {srt} …
  outputUrls: string[];           // hosted results, filled by the worker
  chargedAcu: number;
  attempts: number;
  error?: string;
  createdAt: string;
  claimedAt?: string | null;
  finishedAt?: string | null;
  progress?: number;              // 0-100, worker-reported
};

const COLLECTION = "video_jobs";
// A job claimed but not finished within this window is presumed dead and becomes
// re-claimable. Long enough for a big render, short enough to self-heal.
const STALE_MS = 20 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const mem = new Map<string, VideoJob>();
const nowIso = () => new Date().toISOString();
const useDb = () => adminConfigured && adminDb;

function newId(): string {
  return `vj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Enqueue — charges first, so a queued job is always paid for.
// ---------------------------------------------------------------------------
export async function enqueueVideoJob(input: {
  brandId: string;
  kind: VideoJobKind;
  sourceUrl: string;
  params?: Record<string, unknown>;
}): Promise<{ ok: boolean; job?: VideoJob; error?: string; balanceAcu?: number }> {
  const cost = JOB_COST_ACU[input.kind];
  if (!input.sourceUrl) return { ok: false, error: "A source video is required." };

  // Build the recipe BEFORE taking any money. A job with missing or malformed
  // params can never render, so the customer is told now rather than charged,
  // queued, retried three times and refunded.
  try {
    buildRecipe(input.kind, input.params || {});
  } catch (e) {
    return { ok: false, error: e instanceof RecipeError ? e.message : "Those render settings are not usable." };
  }

  const debit = await debitAcus(input.brandId, cost);
  if (!debit.ok) {
    return { ok: false, balanceAcu: debit.balanceAcu, error: `Not enough ACUs — this render costs ${cost} ACUs and your balance is ${debit.balanceAcu}. Top up on Billing.` };
  }

  const job: VideoJob = {
    id: newId(), brandId: input.brandId, kind: input.kind, status: "queued",
    sourceUrl: input.sourceUrl, params: input.params || {}, outputUrls: [],
    chargedAcu: cost, attempts: 0, createdAt: nowIso(), claimedAt: null, finishedAt: null, progress: 0,
  };
  if (useDb()) await adminDb!.collection(COLLECTION).doc(job.id).set(job);
  else mem.set(job.id, job);
  return { ok: true, job, balanceAcu: debit.balanceAcu };
}

export async function getVideoJob(id: string): Promise<VideoJob | null> {
  if (useDb()) {
    const s = await adminDb!.collection(COLLECTION).doc(id).get();
    return s.exists ? (s.data() as VideoJob) : null;
  }
  return mem.get(id) ?? null;
}

export async function listVideoJobs(brandId: string, limit = 50): Promise<VideoJob[]> {
  if (useDb()) {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(limit).get();
    return snap.docs.map((d) => d.data() as VideoJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return [...mem.values()].filter((j) => j.brandId === brandId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Claim — atomic, so two workers can never take the same job. Also recovers
// jobs whose worker died (claimed long ago, never finished).
// ---------------------------------------------------------------------------
export async function claimNextJob(workerId: string): Promise<VideoJob | null> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const takeable = (j: VideoJob) =>
    j.status === "queued" || (j.status === "running" && (j.claimedAt || "") < cutoff);

  if (!useDb()) {
    // Oldest first — a queue, not a stack. Jobs that have burned their attempts
    // are retired (and refunded) rather than handed out forever.
    const ordered = [...mem.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const candidate of ordered) {
      if (!takeable(candidate)) continue;
      if (candidate.attempts >= MAX_ATTEMPTS) { await giveUp(candidate); continue; }
      const next = { ...candidate, status: "running" as const, claimedAt: nowIso(), attempts: candidate.attempts + 1 };
      mem.set(next.id, next);
      return next;
    }
    return null;
  }

  const col = adminDb!.collection(COLLECTION);
  // Queued first; then stale-running (a worker that died mid-render).
  for (const q of [
    col.where("status", "==", "queued").limit(5),
    col.where("status", "==", "running").where("claimedAt", "<", cutoff).limit(5),
  ]) {
    const snap = await q.get();
    for (const doc of snap.docs) {
      const outcome = await adminDb!.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) return null;
        const j = fresh.data() as VideoJob;
        if (!takeable(j)) return null;
        // Burned every attempt — retire it here so a dead worker's job can never
        // loop, and hand the refund back to the caller to settle outside the
        // transaction (a wallet write must not nest inside this one).
        if (j.attempts >= MAX_ATTEMPTS) {
          tx.update(doc.ref, { status: "failed", error: `Gave up after ${MAX_ATTEMPTS} attempts.`, finishedAt: nowIso() });
          return { retire: j };
        }
        const next: VideoJob = { ...j, status: "running", claimedAt: nowIso(), attempts: j.attempts + 1 };
        tx.set(doc.ref, { ...next, workerId }, { merge: true });
        return { claimed: next };
      });
      if (outcome?.retire && outcome.retire.chargedAcu > 0) await creditAcus(outcome.retire.brandId, outcome.retire.chargedAcu);
      if (outcome?.claimed) return outcome.claimed;
    }
  }
  return null;
}

// Test hook: force a job into a state that only the passage of time (or a dead
// worker) would otherwise produce, so the recovery path can be exercised without
// waiting 20 minutes. Not used by any route.
export async function __testSetJob(id: string, patch: Partial<VideoJob>): Promise<void> {
  if (useDb()) { await adminDb!.collection(COLLECTION).doc(id).set(patch, { merge: true }); return; }
  const j = mem.get(id); if (j) mem.set(id, { ...j, ...patch });
}

// Retire a job that has burned every attempt, refunding what it was charged.
// A customer never pays for a render that produced no file.
async function giveUp(job: VideoJob): Promise<void> {
  const patch = { status: "failed" as const, error: job.error || `Gave up after ${MAX_ATTEMPTS} attempts.`, finishedAt: nowIso() };
  if (useDb()) await adminDb!.collection(COLLECTION).doc(job.id).set(patch, { merge: true });
  else mem.set(job.id, { ...job, ...patch });
  if (job.chargedAcu > 0) await creditAcus(job.brandId, job.chargedAcu);
}

export async function reportProgress(id: string, progress: number): Promise<void> {
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  if (useDb()) { await adminDb!.collection(COLLECTION).doc(id).set({ progress: p }, { merge: true }); return; }
  const j = mem.get(id); if (j) mem.set(id, { ...j, progress: p });
}

export async function completeVideoJob(id: string, outputUrls: string[]): Promise<void> {
  const patch = { status: "done" as const, outputUrls, progress: 100, finishedAt: nowIso(), error: "" };
  if (useDb()) { await adminDb!.collection(COLLECTION).doc(id).set(patch, { merge: true }); return; }
  const j = mem.get(id); if (j) mem.set(id, { ...j, ...patch });
}

// Fail a job. When no retry remains the customer is REFUNDED — they must never
// pay for a render that did not produce a file.
export async function failVideoJob(id: string, error: string): Promise<{ refunded: number }> {
  const job = await getVideoJob(id);
  if (!job) return { refunded: 0 };
  const retriable = job.attempts < MAX_ATTEMPTS;
  const patch = retriable
    ? { status: "queued" as const, error, claimedAt: null }
    : { status: "failed" as const, error, finishedAt: nowIso() };
  if (useDb()) await adminDb!.collection(COLLECTION).doc(id).set(patch, { merge: true });
  else mem.set(id, { ...job, ...patch });

  if (!retriable && job.chargedAcu > 0) {
    await creditAcus(job.brandId, job.chargedAcu);
    return { refunded: job.chargedAcu };
  }
  return { refunded: 0 };
}
