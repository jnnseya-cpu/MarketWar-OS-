import { NextRequest, NextResponse } from "next/server";
import {
  enqueueVideoJob, getVideoJob, listVideoJobs, claimNextJob, completeVideoJob,
  failVideoJob, reportProgress, JOB_COST_ACU, type VideoJobKind,
} from "@/backend/video-jobs";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

// Video render queue — the customer-facing half.
//
// CUSTOMER (brand-ownership checked):
//   POST { action:"enqueue", brandId, kind, sourceUrl, params } → charge + queue
//   POST { action:"status",  brandId, jobId }                   → one job
//   POST { action:"list",    brandId }                          → their jobs
//
// WORKER (x-worker-secret = VIDEO_WORKER_SECRET, never a user):
//   POST { action:"claim",    workerId }             → next job, atomically
//   POST { action:"progress", jobId, progress }
//   POST { action:"complete", jobId, outputUrls[] }
//   POST { action:"fail",     jobId, error }         → retry, or refund
//
// The split matters: the app never touches FFmpeg (Vercel can't), and the worker
// never touches a user session. The queue is the only contract between them.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: VideoJobKind[] = ["trim", "clips", "captions_burn", "brand", "broll", "bg_remove", "upscale"];

function workerAuthorised(req: NextRequest): boolean {
  const secret = (process.env.VIDEO_WORKER_SECRET || "").trim();
  return Boolean(secret) && (req.headers.get("x-worker-secret") || "") === secret;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "video-jobs"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const action = s("action");

  // ---------------- worker actions ----------------
  if (["claim", "progress", "complete", "fail"].includes(action)) {
    if (!workerAuthorised(req)) {
      return NextResponse.json({ error: "Worker only — set x-worker-secret." }, { status: 401 });
    }
    if (action === "claim") {
      const job = await claimNextJob(s("workerId") || "worker");
      return NextResponse.json({ job });
    }
    const jobId = s("jobId");
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
    if (action === "progress") {
      await reportProgress(jobId, Number(body.progress) || 0);
      return NextResponse.json({ ok: true });
    }
    if (action === "complete") {
      const urls = Array.isArray(body.outputUrls) ? body.outputUrls.map(String).filter(Boolean) : [];
      if (!urls.length) return NextResponse.json({ error: "complete needs at least one outputUrl" }, { status: 400 });
      await completeVideoJob(jobId, urls);
      return NextResponse.json({ ok: true });
    }
    const res = await failVideoJob(jobId, s("error") || "render failed");
    return NextResponse.json({ ok: true, ...res });
  }

  // ---------------- customer actions ----------------
  const brandId = s("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (action === "list") {
    return NextResponse.json({ jobs: await listVideoJobs(brandId), costs: JOB_COST_ACU });
  }

  if (action === "status") {
    const job = await getVideoJob(s("jobId"));
    if (!job || job.brandId !== brandId) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ job });
  }

  if (action === "enqueue") {
    const kind = s("kind") as VideoJobKind;
    if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of: ${KINDS.join(", ")}` }, { status: 400 });
    const sourceUrl = s("sourceUrl");
    if (!/^https:\/\//i.test(sourceUrl)) return NextResponse.json({ error: "sourceUrl must be a hosted https URL. Upload the video first." }, { status: 400 });
    const result = await enqueueVideoJob({
      brandId, kind, sourceUrl,
      params: (body.params && typeof body.params === "object" ? body.params : {}) as Record<string, unknown>,
    });
    if (!result.ok) return NextResponse.json({ error: result.error, balanceAcu: result.balanceAcu }, { status: 402 });
    return NextResponse.json({
      ok: true, job: result.job, chargedAcu: JOB_COST_ACU[kind], balanceAcu: result.balanceAcu,
      note: "Queued. Rendering happens on the video worker — poll status, or come back to your job list. If it fails your ACUs are refunded.",
    });
  }

  return NextResponse.json({ error: "Unknown action — use enqueue, status or list" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Video render queue",
    kinds: KINDS,
    costs: JOB_COST_ACU,
    workerConfigured: Boolean((process.env.VIDEO_WORKER_SECRET || "").trim()),
    doctrine:
      "Vercel functions cannot run FFmpeg (60s ceiling, read-only disk, small bodies), so the app enqueues render work and a separate FFmpeg worker claims it, renders, uploads to Storage and reports back. Claiming is transactional so two workers never take one job; a job whose worker dies is re-claimed after 20 minutes; three failed attempts refunds the customer in full.",
    deploy: "See worker/README.md — deploy the container to Cloud Run, Fly.io or Railway and set VIDEO_WORKER_SECRET on both sides.",
  });
}
