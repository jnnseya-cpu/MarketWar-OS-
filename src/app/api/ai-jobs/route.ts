import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { enqueueAiJob, getAiJob, listAiJobs, advanceAiJob } from "@/backend/ai-jobs";
import { progressLine } from "@/shared/ai-job";
import { EFFORT_LAW } from "@/shared/ai-effort";
import { canAffordAction } from "@/backend/wallet";

// AI WORK THAT OUTLIVES THE REQUEST THAT STARTED IT.
//
// POST { action: "start",  brandId, kind, system, prompt } → a job id
// POST { action: "status", brandId, jobId }                → the job, ADVANCED
// POST { action: "list",   brandId }                       → this brand's jobs
//
// `status` DOES WORK, and that is the design rather than a shortcut. The drain
// cron needs CRON_SECRET, which is unset on this deployment, so a cron-only
// continuation would have shipped as something that has never run. The person
// waiting for their document is already polling; letting that poll carry the
// work forward means continuation needs no scheduler, no secret and no
// configuration to work today. The cron then exists for jobs nobody is watching.
//
// A read that writes is worth being explicit about: it is idempotent in the way
// that matters (a claim two callers race for is won by one, and the loser is
// told the job is running), it cannot double-charge (only the winner runs a
// slice), and it cannot run a finished job.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The whole point is to use an invocation fully. This is the ceiling Vercel
// allows on this plan; the slice asks the gateway for what is left of it.
export const maxDuration = 300;

const SLICE_HEADROOM_MS = 20_000;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required." }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "start") {
    const system = typeof body.system === "string" ? body.system : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return NextResponse.json({ error: "prompt is required." }, { status: 400 });
    const kind = typeof body.kind === "string" ? body.kind : "document";
    if (!["document", "campaign", "analysis", "rewrite"].includes(kind)) {
      return NextResponse.json({ error: `Unknown kind "${kind}".` }, { status: 400 });
    }
    // NO ACUs, NO AI. Owner directive, and it is the one limit the effort law
    // keeps: "no time and ACUs limit" means SUFFICIENT ACUs MUST BE AVAILABLE.
    //
    // CHECKED HERE, CHARGED AT THE PROVIDER CALL. An earlier version metered
    // here as well, which billed a job twice for its first pass: once at the
    // door and once when `advanceAiJob` actually called a provider. The charge
    // belongs where it has always belonged — once per call that really happens,
    // at the rate that was always in ACTION_COST_ACU — so this only refuses.
    const afford = await canAffordAction(access, "llm", 1);
    if (!afford.ok) return NextResponse.json({ error: afford.error }, { status: 402 });

    const job = await enqueueAiJob({ brandId, kind: kind as "document", system, prompt });
    return NextResponse.json({ job, progress: progressLine(job), law: EFFORT_LAW });
  }

  if (action === "status") {
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

    const existing = await getAiJob(jobId);
    if (!existing) return NextResponse.json({ error: "No such job." }, { status: 404 });
    // TENANT ISOLATION ON THE RECORD, not on the argument. Reading the brand off
    // the request and trusting it would let anybody who knows a job id advance
    // and read somebody else's work.
    if (existing.brandId !== brandId) return NextResponse.json({ error: "No such job." }, { status: 404 });

    const budgetMs = Math.max(15_000, (maxDuration * 1000) - (Date.now() - startedAt) - SLICE_HEADROOM_MS);
    const job = await advanceAiJob(jobId, { budgetMs, trigger: "user" });
    if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });
    return NextResponse.json({
      job,
      progress: progressLine(job),
      // A QUEUED JOB IS NOT A STALLED ONE, and a surface that shows "queued"
      // with no further word invites somebody to start again and pay twice.
      keepPolling: job.status === "queued" || job.status === "running",
      law: EFFORT_LAW,
    });
  }

  if (action === "list") {
    return NextResponse.json({ jobs: await listAiJobs(brandId) });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}
