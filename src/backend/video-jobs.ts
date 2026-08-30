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
import { spendAcus, creditAcus, type Spender } from "@/backend/wallet";
import { walletIdForBrand } from "@/backend/brand-access";
import { buildRecipe, RecipeError, hostedApiUnsupportedReason } from "@/backend/ffmpeg-recipes";
import { ffmpegCloudConfigured, submitPass, getTranscode, getDownloadUrl, outputStillFetchable } from "@/backend/ffmpeg-cloud";
import { uploadPublicMedia } from "@/backend/storage";
import { requiredAcus } from "@/backend/subscription";
import { minimumAcusFor } from "@/backend/unit-economics";

export type VideoJobKind =
  | "trim"            // cut in/out points → one clip
  | "clips"           // cut many moments → N social clips
  | "captions_burn"   // burn an SRT into the frame
  | "brand"           // intro/outro/watermark
  | "broll"           // composite B-roll over the base
  | "bg_remove"       // background removal / green screen
  | "upscale";        // resolution upscale

export type VideoJobStatus = "queued" | "running" | "done" | "failed";

// ---------------------------------------------------------------------------
// Render pricing — DERIVED, like every other action, not hand-picked.
//
// Rendering is billed by the processing minute (the hosted API bills us that
// way; a self-hosted container costs us machine-time, which is the same thing).
// So the price of a job is: how many processing minutes it typically burns,
// costed at our per-minute rate, then run through the same floor as AI actions —
// 4x provider cost OR the minimum that still nets 100% on fully-loaded cost,
// whichever is higher.
//
// RENDER_COST_PER_MIN_GBP is the one number to update when the vendor's rate is
// confirmed; every price below moves with it and the margin floor is enforced by
// test, so a wrong rate cannot quietly become a loss.
const RENDER_COST_PER_MIN_GBP = Number(process.env.RENDER_COST_PER_MIN_GBP || 0.03);

// Typical processing minutes per job. Encoding is slower than the video is long
// for quality presets and faster for stream-copies, which is why an upscale
// costs several times a trim of the same clip.
const RENDER_MINUTES: Record<VideoJobKind, number> = {
  trim: 1,            // seek + re-encode a short section
  clips: 4,           // several cuts, each re-encoded and reframed
  captions_burn: 2,   // full re-encode with a subtitle filter
  brand: 1.5,         // full re-encode with an overlay
  broll: 2.5,         // two decoded sources composited
  bg_remove: 3,       // chroma-key + VP9, which is slow
  upscale: 5,         // slow preset, crf 18, larger frames — the heaviest
};

function priceRender(kind: VideoJobKind): number {
  const providerCostGbp = RENDER_COST_PER_MIN_GBP * RENDER_MINUTES[kind];
  return Math.max(
    requiredAcus(providerCostGbp).requiredAcus,
    minimumAcusFor({ providerCostGbp, persistsArtifact: true }).minAcus,
  );
}

// What each job costs the customer, in ACUs (1 ACU = 1p).
export const JOB_COST_ACU: Record<VideoJobKind, number> = {
  trim: priceRender("trim"),
  clips: priceRender("clips"),
  captions_burn: priceRender("captions_burn"),
  brand: priceRender("brand"),
  broll: priceRender("broll"),
  bg_remove: priceRender("bg_remove"),
  upscale: priceRender("upscale"),
};

// Exposed so the margin floor can be verified against the real numbers rather
// than a comment claiming it holds.
export const RENDER_PROVIDER_COST_GBP: Record<VideoJobKind, number> = {
  trim: RENDER_COST_PER_MIN_GBP * RENDER_MINUTES.trim,
  clips: RENDER_COST_PER_MIN_GBP * RENDER_MINUTES.clips,
  captions_burn: RENDER_COST_PER_MIN_GBP * RENDER_MINUTES.captions_burn,
  brand: RENDER_COST_PER_MIN_GBP * RENDER_MINUTES.brand,
  broll: RENDER_COST_PER_MIN_GBP * RENDER_MINUTES.broll,
  bg_remove: RENDER_COST_PER_MIN_GBP * RENDER_MINUTES.bg_remove,
  upscale: RENDER_COST_PER_MIN_GBP * RENDER_MINUTES.upscale,
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
  // Which executor owns this job. "worker" waits for a container to claim it;
  // "cloud" was already submitted to the hosted API and is polled instead.
  provider?: "worker" | "cloud";
  cloudJobIds?: string[];         // one hosted job per render pass
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
  /** Who asked. Staff are not billed for their own platform; see spendAcus. */
  spender?: Spender | null;
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

  // AND CHECK THAT SOMETHING CAN ACTUALLY RUN THIS PARTICULAR KIND.
  //
  // renderingAvailable() answers "can we render at all", which is not the same
  // question. With the hosted API configured and no self-hosted worker — the
  // most likely production setup, and the one this platform is deployed in —
  // `brand` and `broll` need FFmpeg's filter_complex, which the hosted service
  // does not support. The old flow charged for them anyway: buildRecipe
  // succeeded (the recipe is valid FFmpeg), the wallet was debited, the
  // hosted-submit block was SKIPPED because the kind is unsupported, and the
  // job was written to the queue as `queued` on `provider: "worker"` — a queue
  // with no worker reading it. The customer paid 18 ACUs for a render that
  // could never start, and nothing ever errored: the job simply sat there.
  //
  // Same shape as every other money defect found this week — charged, nothing
  // delivered, no error on either side. Refuse before the debit instead.
  const runnable = canRenderKind(input.kind);
  if (!runnable.ok) return { ok: false, error: runnable.reason };

  // The owning ACCOUNT pays, not a purse named after the brand.
  const walletId = await walletIdForBrand(input.brandId);
  const debit = await spendAcus(input.spender ?? null, walletId, cost, { agent: "video-render", kind: "video" });
  if (!debit.ok) {
    return { ok: false, balanceAcu: debit.balanceAcu, error: `Not enough ACUs — this render costs ${cost} ACUs and your balance is ${debit.balanceAcu}. Top up on Billing.` };
  }

  const job: VideoJob = {
    id: newId(), brandId: input.brandId, kind: input.kind, status: "queued",
    sourceUrl: input.sourceUrl, params: input.params || {}, outputUrls: [],
    // WHAT WAS TAKEN, not the price list — a refund on failure reads this field,
    // and refunding a staff job's list price would mint ACUs.
    chargedAcu: debit.charged, attempts: 0, createdAt: nowIso(), claimedAt: null, finishedAt: null, progress: 0,
    provider: "worker",
  };

  // If the hosted renderer is configured AND can do this kind, submit it now:
  // there is no container to wait for, so the job starts immediately. Kinds it
  // cannot do (anything compositing a second source) stay on the worker queue.
  if (ffmpegCloudConfigured() && !hostedApiUnsupportedReason(input.kind)) {
    const submitted = await submitToCloud(job);
    if (submitted.ok) {
      job.provider = "cloud";
      job.cloudJobIds = submitted.cloudJobIds;
      job.status = "running";
      job.claimedAt = nowIso();
      job.attempts = 1;
    } else if (!workerConfigured()) {
      // Nothing else can run it — refund immediately rather than parking a paid
      // job in a queue no worker will ever read. Refund WHAT WAS TAKEN: an
      // exempt caller was charged nothing, and crediting the list price back
      // would hand them ACUs they never spent.
      if (debit.charged > 0) await creditAcus(walletId, debit.charged);
      return { ok: false, error: submitted.error, balanceAcu: (debit.balanceAcu ?? 0) + debit.charged };
    }
    // Otherwise fall through: the self-hosted worker will pick it up.
  }

  if (useDb()) await adminDb!.collection(COLLECTION).doc(job.id).set(job);
  else mem.set(job.id, job);
  return { ok: true, job, balanceAcu: debit.balanceAcu };
}

function workerConfigured(): boolean {
  return Boolean((process.env.VIDEO_WORKER_SECRET || "").trim());
}

// Is anything at all able to render? Used by the UI so the Render Farm never
// takes money for work no executor can perform.
export function renderingAvailable(): { ok: boolean; via: ("cloud" | "worker")[] } {
  const via: ("cloud" | "worker")[] = [];
  if (ffmpegCloudConfigured()) via.push("cloud");
  if (workerConfigured()) via.push("worker");
  return { ok: via.length > 0, via };
}

/**
 * Can THIS KIND actually be rendered on what is configured?
 *
 * The distinction matters because the two executors are not interchangeable.
 * The hosted API takes a flat list of FFmpeg options and cannot run
 * filter_complex, so anything compositing a second source over the frame —
 * `brand` (a logo) and `broll` (picture-in-picture) — only ever runs on the
 * self-hosted worker. "We can render" and "we can render this" are different
 * questions, and charging on the first one is how a customer pays for a job
 * that never starts.
 */
export function canRenderKind(kind: VideoJobKind): { ok: boolean; via: "cloud" | "worker" | null; reason: string } {
  const hosted = ffmpegCloudConfigured();
  const worker = workerConfigured();
  const hostedCannot = hostedApiUnsupportedReason(kind);

  if (worker) return { ok: true, via: "worker", reason: "" };
  if (hosted && !hostedCannot) return { ok: true, via: "cloud", reason: "" };
  if (hosted && hostedCannot) {
    return {
      ok: false, via: null,
      reason: `${hostedCannot} This deployment has the hosted renderer but no self-hosted worker, so this QUEUED job cannot run and you have not been charged for it. The capability itself is not missing: the Clip Finder does logo overlays and picture-in-picture B-roll in your browser, at the same size and position this render would have used, with no upload and no render bill. The worker is only worth deploying if you want these queued in unattended batches.`,
    };
  }
  return {
    ok: false, via: null,
    reason: "No renderer is configured on this deployment, so nothing was charged. Cutting clips to 9:16 with captions burned in does not need one — the Clip Finder does that in your browser.",
  };
}

// Submit every pass of a job to the hosted API. One hosted job per pass, which
// is why cutting 10 clips creates 10 hosted jobs — they run concurrently there.
async function submitToCloud(job: VideoJob): Promise<{ ok: true; cloudJobIds: string[] } | { ok: false; error: string }> {
  let passes: ReturnType<typeof buildRecipe>;
  try { passes = buildRecipe(job.kind, job.params); }
  catch (e) { return { ok: false, error: e instanceof RecipeError ? e.message : "Those render settings are not usable." }; }

  // A pass needing a file (the SRT) must have it hosted first — the API reads it
  // from a URL, not from our disk.
  let assetUrl: string | undefined;
  const inlineAsset = passes.find((p) => p.asset?.inlineText)?.asset;
  if (inlineAsset?.inlineText) {
    const hosted = await uploadPublicMedia(Buffer.from(inlineAsset.inlineText, "utf8"), {
      contentType: "text/plain", ext: "srt", keyPrefix: `renders/${job.brandId}`,
      nameSeed: `${job.id}·${inlineAsset.filename}`,
    });
    if (!hosted) return { ok: false, error: "Could not host the subtitle file for the renderer." };
    assetUrl = hosted;
  }

  const ids: string[] = [];
  for (const pass of passes) {
    const r = await submitPass({ pass, sourceUrl: job.sourceUrl, assetUrl: assetUrl || pass.asset?.url });
    if (!r.ok) return { ok: false, error: r.error };
    ids.push(r.job.id);
  }
  return { ok: true, cloudJobIds: ids };
}

// Advance a hosted job: poll every pass, and once they are all finished COPY the
// outputs into our own storage. The vendor's URLs expire within minutes, so
// linking to them directly would give the customer a job list full of dead
// links by tomorrow.
export async function advanceCloudJob(job: VideoJob): Promise<VideoJob> {
  if (job.provider !== "cloud" || !job.cloudJobIds?.length) return job;
  if (job.status === "done" || job.status === "failed") return job;

  const results = await Promise.all(job.cloudJobIds.map((id) => getTranscode(id)));
  const states = results.map((r) => (r.ok ? r.job : null));
  if (states.some((s) => !s)) return job; // a transient read failure — try again next poll

  const done = states.filter((s) => s!.status === "completed");
  const failed = states.find((s) => s!.status === "failed");

  if (failed) {
    await failVideoJob(job.id, failed.error || "The hosted renderer could not process this video.");
    return (await getVideoJob(job.id)) || job;
  }

  const progress = Math.round((done.length / states.length) * 100);
  if (done.length < states.length) {
    await reportProgress(job.id, progress);
    return { ...job, progress };
  }

  // All finished — copy each output into our storage while its link is alive.
  const urls: string[] = [];
  for (let i = 0; i < states.length; i++) {
    const src = states[i]!.outputUrl;
    if (!src || !outputStillFetchable(src)) {
      // The link died before we fetched it. Ask for a fresh one rather than
      // failing a render that actually succeeded.
      const fresh = await getDownloadUrl(job.cloudJobIds[i]);
      if (!fresh.ok) { await failVideoJob(job.id, "The render finished but its download link expired before it could be saved."); return (await getVideoJob(job.id)) || job; }
      const saved = await persistOutput(job, fresh.url, i);
      if (saved) urls.push(saved);
      continue;
    }
    const saved = await persistOutput(job, src, i);
    if (saved) urls.push(saved);
  }

  if (!urls.length) {
    await failVideoJob(job.id, "The render finished but the file could not be saved.");
    return (await getVideoJob(job.id)) || job;
  }
  await completeVideoJob(job.id, urls);
  return (await getVideoJob(job.id)) || job;
}

async function persistOutput(job: VideoJob, url: string, index: number): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = /\.webm(\?|$)/i.test(url) ? "webm" : "mp4";
    return await uploadPublicMedia(buf, {
      contentType: ext === "webm" ? "video/webm" : "video/mp4",
      ext, keyPrefix: `renders/${job.brandId}`,
      nameSeed: `${job.id}·${index}`,
    });
  } catch {
    return null;
  }
}

// Advance every in-flight hosted job for a brand. Called when the customer polls
// their job list — serverless has no background loop, so the poll IS the tick.
export async function advanceBrandCloudJobs(brandId: string): Promise<void> {
  const jobs = await listVideoJobs(brandId);
  const live = jobs.filter((j) => j.provider === "cloud" && (j.status === "queued" || j.status === "running"));
  await Promise.all(live.map((j) => advanceCloudJob(j).catch(() => j)));
}

/**
 * A stored document is not a VideoJob until something has checked it.
 *
 * `d.data() as VideoJob` was a CAST, not a check: it told TypeScript the shape
 * was guaranteed while guaranteeing nothing. A job written by an earlier version
 * of this file has no `outputUrls`, and the render farm maps that array for
 * every row it draws — so one old document took `/dashboard/video` down on load
 * with "Cannot read properties of undefined (reading 'map')". The same cast made
 * the sort below a second crash waiting behind the first, since a missing
 * `createdAt` has no `.localeCompare`.
 *
 * Only genuinely empty values are filled in. An absent `outputUrls` means "no
 * files recorded", which is what `[]` says — nothing is invented. A document
 * missing its identity or its state is NOT quietly given one: there is no
 * truthful way to draw a job whose kind and status are unknown, so it is left
 * out rather than displayed as a guess.
 */
export function jobFromStored(data: unknown): VideoJob | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<VideoJob>;
  if (typeof d.id !== "string" || !d.id) return null;
  if (typeof d.brandId !== "string" || !d.brandId) return null;
  if (typeof d.kind !== "string" || !KIND_SET.has(d.kind)) return null;
  if (typeof d.status !== "string" || !STATUS_SET.has(d.status)) return null;

  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  return {
    ...d,
    id: d.id,
    brandId: d.brandId,
    kind: d.kind,
    status: d.status,
    sourceUrl: typeof d.sourceUrl === "string" ? d.sourceUrl : "",
    params: d.params && typeof d.params === "object" ? d.params : {},
    outputUrls: Array.isArray(d.outputUrls) ? d.outputUrls.filter((u): u is string => typeof u === "string") : [],
    chargedAcu: num(d.chargedAcu, 0),
    attempts: num(d.attempts, 0),
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
  };
}

const KIND_SET = new Set<string>(["trim", "clips", "captions_burn", "brand", "broll", "bg_remove", "upscale"]);
const STATUS_SET = new Set<string>(["queued", "running", "done", "failed"]);

/** Newest first, and it cannot throw on a document with no timestamp. */
const byNewest = (a: VideoJob, b: VideoJob) => (b.createdAt || "").localeCompare(a.createdAt || "");

export async function getVideoJob(id: string): Promise<VideoJob | null> {
  if (useDb()) {
    const s = await adminDb!.collection(COLLECTION).doc(id).get();
    return s.exists ? jobFromStored(s.data()) : null;
  }
  return mem.get(id) ?? null;
}

export async function listVideoJobs(brandId: string, limit = 50): Promise<VideoJob[]> {
  if (useDb()) {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(limit).get();
    return snap.docs
      .map((d) => jobFromStored(d.data()))
      .filter((j): j is VideoJob => j !== null)
      .sort(byNewest);
  }
  return [...mem.values()].filter((j) => j.brandId === brandId).sort(byNewest).slice(0, limit);
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
      if (outcome?.retire && outcome.retire.chargedAcu > 0) await creditAcus(await walletIdForBrand(outcome.retire.brandId), outcome.retire.chargedAcu);
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
  if (job.chargedAcu > 0) await creditAcus(await walletIdForBrand(job.brandId), job.chargedAcu);
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
    await creditAcus(await walletIdForBrand(job.brandId), job.chargedAcu);
    return { refunded: job.chargedAcu };
  }
  return { refunded: 0 };
}
