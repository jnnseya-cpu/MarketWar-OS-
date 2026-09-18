import { NextRequest, NextResponse } from "next/server";
import { cronAuthorised, requireAuth } from "@/backend/guard";
import { drainAiJobs } from "@/backend/ai-jobs";
import { EFFORT_LAW } from "@/shared/ai-effort";

// CARRY ON THE WORK NOBODY IS WATCHING.
//
// The other half of continuation. `/api/ai-jobs` advances a job when somebody
// asks about it, which covers every run with a person waiting on it. This covers
// the rest: a campaign started last night, a run whose tab was closed, anything
// that would otherwise sit queued until someone happened to look.
//
// AUTHORISED TWO WAYS, and the second one is not a convenience. `cronAuthorised`
// needs CRON_SECRET, which is UNSET on this deployment — so a cron-only drain
// would be a feature that has never run. A platform admin can also call it, which
// means the queue can be drained today, by hand, on a deployment with no
// scheduler at all. It also means the route is testable against a real server.
//
// It is held by the `autonomous` emergency-stop lane, per job, inside
// `advanceAiJob` — that lane's published meaning is "work the platform starts on
// its own", which is exactly this, while a customer waiting on the page is not
// held by it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEADROOM_MS = 20_000;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const cron = cronAuthorised(req);
  if (!cron.ok) {
    const auth = await requireAuth(req, { scope: "platform_admin" });
    if (!auth.ok || !auth.enforced) {
      return NextResponse.json({
        error: "The drain runs for the scheduler or a platform admin.",
        // Naming BOTH reasons, because "unauthorised" on a deployment whose
        // CRON_SECRET is simply unset sends somebody looking for a permissions
        // bug that does not exist.
        why: cron.reason,
      }, { status: 403 });
    }
  }

  const budgetMs = Math.max(30_000, (maxDuration * 1000) - (Date.now() - startedAt) - HEADROOM_MS);
  const out = await drainAiJobs({ budgetMs, trigger: "scheduled" });
  return NextResponse.json({ ...out, via: cron.ok ? "scheduler" : "platform admin", law: EFFORT_LAW });
}

export async function GET(req: NextRequest) {
  // Vercel's scheduler issues a GET. Same work, same authorisation.
  return POST(req);
}
