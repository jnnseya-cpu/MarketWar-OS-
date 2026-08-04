import { NextRequest, NextResponse } from "next/server";
import { allDue, markRun, resolveChain, type ChainSchedule } from "@/backend/chain-store";
import { validateChain } from "@/backend/orchestrator";
import { executeChain } from "@/backend/chain-exec";
import { headroom } from "@/backend/agent-budget";
import { brandOwnerId } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth, cronAuthorised } from "@/backend/guard";
import type { AuthResult } from "@/backend/guard";

// The scheduler — chains that run without anybody pressing a button.
//
// GET  (cron)  → run every schedule that is due
// POST         → the same, for a signed-in operator testing it
//
// This is the point where the platform acts on its own, so the guards are the
// ones that were built first and are checked here again:
//
//  • NOTHING IS SENT OR PUBLISHED. `executeChain` is shared with the attended
//    route, so a scheduled run gets the same approval boundary: acting steps
//    become approval items, waiting for a person in the morning.
//  • THE SPEND IS CAPPED. Unattended runs consume the per-brand daily ceiling,
//    reserved before each step. A chain that hits it stops and says so.
//  • SOMEBODY IS BILLED. Nobody is signed in at 3am, so the owner of the brand
//    is looked up and metered. An unattended run that charged nobody would be
//    free AI — the hole §63 closed everywhere else.
//  • ONE RUN PER CADENCE. The schedule is marked BEFORE the run, so a chain
//    that fails halfway is not retried on every tick for ever.
//
// A cron caller must present the CRON_SECRET; a human must be signed in. There
// is no third way in, because a route that runs agents on demand and charges
// somebody else's wallet is not one to leave open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// How many brands one tick will process. The rest wait for the next tick and
// are reported as deferred rather than dropped: a scheduler that silently skips
// half its work looks identical to one that had nothing to do.
const MAX_PER_TICK = 10;

async function authorise(req: NextRequest): Promise<{ ok: true; who: string } | { ok: false; status: number; error: string }> {
  // Vercel sends `Authorization: Bearer $CRON_SECRET`, NOT a custom header. A
  // route that only checks `x-cron-secret` is armed and never fires.
  const cron = cronAuthorised(req);
  if (cron.ok) return { ok: true, who: "scheduler" };
  const auth = await requireAuth(req);
  if (!auth.ok) return { ok: false, status: auth.status, error: `Unauthorised — ${cron.reason}. Sign in, or call it as the scheduler.` };
  return { ok: true, who: auth.uid || "operator" };
}

async function tick(nowISO: string) {
  const due = await allDue(nowISO);
  const take = due.slice(0, MAX_PER_TICK);
  const deferred = due.slice(MAX_PER_TICK);
  const results: Record<string, unknown>[] = [];

  for (const s of take as ChainSchedule[]) {
    const before = await headroom(s.brandId, nowISO);
    if (before.exhausted) {
      results.push({ brandId: s.brandId, chainId: s.chainId, status: "skipped", why: `daily ceiling already used (${before.spentAcu}/${before.capAcu} ACUs)` });
      continue;
    }

    const c = await resolveChain(s.brandId, s.chainId);
    if (!c) {
      results.push({ brandId: s.brandId, chainId: s.chainId, status: "skipped", why: "the chain no longer exists" });
      continue;
    }
    const valid = validateChain(c);
    if (!valid.ok) {
      results.push({ brandId: s.brandId, chainId: s.chainId, status: "skipped", why: valid.errors.join("; ") });
      continue;
    }

    // Marked first. A crash halfway must not become an infinite retry.
    await markRun(s.brandId, s.chainId, nowISO);

    // Charged to the owner. With Admin unconfigured there is no owner and no
    // metering either, which is the same demo state as everywhere else.
    const uid = await brandOwnerId(s.brandId);
    const auth: AuthResult = uid
      ? { ok: true, enforced: true, uid, role: null }
      : { ok: true, enforced: false, uid: null, role: null };

    const run = await executeChain({
      brandId: s.brandId, chain: c, nowISO, unattended: true, auth, createdBy: "scheduler",
    });
    results.push(run.ok
      ? { brandId: s.brandId, chainId: s.chainId, status: "ran", ran: run.run.ran, queued: run.run.queued, skipped: run.run.skipped, spentAcu: run.run.spentAcu }
      : { brandId: s.brandId, chainId: s.chainId, status: "failed", why: run.error });
  }

  return {
    at: nowISO,
    due: due.length,
    processed: take.length,
    deferred: deferred.map((s) => ({ brandId: s.brandId, chainId: s.chainId })),
    results,
    doctrine: "Scheduled chains draft. Anything that would spend, send or publish became an approval item and is waiting for you — nothing left this platform overnight.",
  };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "orchestrator-cron"), 12, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const gate = await authorise(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  return NextResponse.json(await tick(new Date().toISOString()));
}

export async function POST(req: NextRequest) {
  return GET(req);
}
