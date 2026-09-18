// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE THING THAT PICKS UP WORK THE GATEWAY COULD NOT FINISH.
//
// `gatewayComplete` throws `AiWorkIncompleteError` when a run cannot fit inside
// its invocation. That was honest and it was the end of the road: the customer
// was told the work was unfinished and nothing continued it. This is what
// continues it.
//
// THE SHAPE IS `backend/video-jobs.ts`, deliberately — that store already solved
// the claim, the lease and the oldest-first queue, and two stores that read
// alike are easier to keep correct than one clever one. The state machine is in
// `shared/ai-job.ts` so it can be tested without a datastore, and the ONE place
// this diverges from video-jobs (no attempt ceiling, because the effort law
// forbids one) is argued there rather than here.
//
// WHO ACTUALLY DRAINS IT, which is the question that decides whether any of this
// works on the live deployment:
//
//   1. WHOEVER IS WAITING. `/api/ai-jobs` advances the job it is asked about.
//      The person watching the spinner drives their own work forward, so
//      continuation needs no scheduler, no secret and no configuration. This is
//      the path that works today.
//   2. THE CRON, for jobs nobody is watching — an overnight campaign, a run
//      started and closed. `/api/ai-jobs/drain` with CRON_SECRET.
//
// Building only (2) would have been building something dark: `CRON_SECRET` is
// unset on this deployment, so a cron-only drain would have shipped as a feature
// that has never run.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { gatewayComplete, AiWorkIncompleteError, GatewayUnconfiguredError, DOCUMENT_DEEP } from "@/backend/gateway";
import { settleAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { haltFor } from "@/backend/emergency-stop";
import { timed } from "@/backend/store-health";
import { isHopeless } from "@/shared/ai-effort";
import { readProviderFailure } from "@/shared/provider-failure";
import {
  claimVerdict, applySlice, STALE_MS,
  type AiJobRecord, type AiJobKind, type AiJobStatus, type SliceOutcome,
} from "@/shared/ai-job";

const COLLECTION = "ai_jobs";
const useDb = () => adminConfigured && adminDb;
const nowIso = () => new Date().toISOString();
const mem = new Map<string, AiJobRecord & { system: string; prompt: string }>();

/** What the job needs in order to be run again by a process that never saw it. */
type StoredJob = AiJobRecord & { system: string; prompt: string };

const newId = () => `aj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const STATUSES: ReadonlySet<string> = new Set<AiJobStatus>(["queued", "running", "done", "failed"]);
const KINDS: ReadonlySet<string> = new Set<AiJobKind>(["document", "campaign", "analysis", "rewrite"]);

/**
 * A stored job, CHECKED rather than asserted — the `jobFromStored` pattern
 * `check-casts.mjs` points every new reader at. A row whose status or kind is
 * unrecognised is not drawn as a guess; it is refused, because a job is work
 * somebody is being charged for.
 */
export function jobFromStored(data: unknown): StoredJob | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  if (!str(d.id) || !str(d.brandId)) return null;
  if (!STATUSES.has(str(d.status)) || !KINDS.has(str(d.kind))) return null;
  return {
    id: str(d.id),
    brandId: str(d.brandId),
    kind: str(d.kind) as AiJobKind,
    status: str(d.status) as AiJobStatus,
    attempts: Math.max(0, Math.round(num(d.attempts))),
    createdAt: str(d.createdAt) || nowIso(),
    claimedAt: typeof d.claimedAt === "string" ? d.claimedAt : null,
    finishedAt: typeof d.finishedAt === "string" ? d.finishedAt : null,
    result: typeof d.result === "string" ? d.result : undefined,
    error: typeof d.error === "string" ? d.error : undefined,
    chargedAcu: Math.max(0, Math.round(num(d.chargedAcu))),
    note: typeof d.note === "string" ? d.note : undefined,
    system: str(d.system),
    prompt: str(d.prompt),
  };
}

/** Start a job. The work is recorded BEFORE anything is attempted, so nothing is lost. */
export async function enqueueAiJob(input: {
  brandId: string;
  kind: AiJobKind;
  system: string;
  prompt: string;
}): Promise<AiJobRecord> {
  const job: StoredJob = {
    id: newId(),
    brandId: input.brandId,
    kind: input.kind,
    status: "queued",
    attempts: 0,
    createdAt: nowIso(),
    claimedAt: null,
    finishedAt: null,
    chargedAcu: 0,
    note: "Queued.",
    system: input.system,
    prompt: input.prompt,
  };
  if (useDb()) await timed("aiJobs.create", () => adminDb!.collection(COLLECTION).doc(job.id).set(job));
  else mem.set(job.id, job);
  return strip(job);
}

/** The record without the prompt — what a surface may see. */
function strip(j: StoredJob): AiJobRecord {
  const { system: _s, prompt: _p, ...rest } = j;
  void _s; void _p;
  return rest;
}

export async function getAiJob(id: string): Promise<StoredJob | null> {
  if (!id) return null;
  if (useDb()) {
    const snap = await timed("aiJobs.get", () => adminDb!.collection(COLLECTION).doc(id).get());
    return snap.exists ? jobFromStored(snap.data()) : null;
  }
  return mem.get(id) ?? null;
}

export async function listAiJobs(brandId: string, limit = 50): Promise<AiJobRecord[]> {
  if (useDb()) {
    const snap = await timed("aiJobs.list", () =>
      adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(limit).get());
    return snap.docs.map((d) => jobFromStored(d.data())).filter((j): j is StoredJob => j !== null).map(strip);
  }
  return [...mem.values()].filter((j) => j.brandId === brandId).slice(0, limit).map(strip);
}

async function save(job: StoredJob): Promise<void> {
  if (useDb()) await timed("aiJobs.save", () => adminDb!.collection(COLLECTION).doc(job.id).set(job));
  else mem.set(job.id, job);
}

/**
 * Take a job, run ONE slice of it, and put it back.
 *
 * A SLICE IS NOT THE WORK. It is as much of the work as this invocation can
 * carry. Ending a slice without finishing is the ordinary case and returns the
 * job to `queued` for the next one — it is not an error and must never be
 * reported as one.
 *
 * Returns the job as it now stands, or null when it was not this caller's to take.
 */
export async function advanceAiJob(
  id: string,
  opts: { budgetMs: number; workerId?: string; trigger?: "user" | "scheduled" } = { budgetMs: 60_000 },
): Promise<AiJobRecord | null> {
  const job = await getAiJob(id);
  if (!job) return null;

  const verdict = claimVerdict(job, Date.now(), STALE_MS);
  if (verdict.act === "skip") return strip(job);

  // THE ONE LEVER A HUMAN HAS. The effort law removes every automatic stop, so
  // the emergency stop is what remains — and a job that ignored it would make
  // the platform's only brake useless on the one kind of work that can run away.
  //
  // THE `autonomous` LANE, NOT A NEW ONE. Its published meaning is already
  // exactly this: "Work the platform starts on its own: scheduled chains,
  // autopilot cycles, overnight jobs. Anything a person clicks in front of them
  // still runs." So the CRON drain is held by it and a customer sitting on the
  // page waiting for their document is not — which is what that sentence
  // promises, and inventing an "ai" lane would have quietly broken it.
  const halt = opts.trigger === "scheduled"
    ? await haltFor("autonomous", job.brandId).catch(() => ({ halted: false, message: "" }))
    : { halted: false as const, message: "" };
  if (halt.halted) {
    const stopped: StoredJob = {
      ...job, status: "queued", claimedAt: null,
      note: `Held by the emergency stop: ${halt.message || "AI work is paused."} It resumes when the stop is lifted — nothing is lost.`,
    };
    await save(stopped);
    return strip(stopped);
  }

  const claimed: StoredJob = { ...job, status: "running", claimedAt: nowIso(), attempts: job.attempts + 1 };
  await save(claimed);

  let outcome: SliceOutcome;
  // Did this pass actually reach a provider? A pass that did not must not be
  // charged for — "only calls that ran AND returned are charged" is already the
  // rule everywhere else in this platform, and charging for a pass that called
  // nobody is the charged-and-served-nothing defect on the one path designed to
  // run for a long time.
  let calledAProvider = true;
  try {
    const res = await gatewayComplete(
      { system: job.system, prompt: job.prompt },
      { ...DOCUMENT_DEEP, budgetMs: Math.max(10_000, opts.budgetMs), paid: true },
    );
    outcome = { kind: "finished", text: res.text };
  } catch (e) {
    if (e instanceof GatewayUnconfiguredError) {
      // NOT THE REQUEST'S FAULT, AND NOT SOMETHING RETRYING FIXES. No provider
      // is configured, so every pass would call nobody, produce nothing, and —
      // without this — bill for it. The job waits instead: the work is not
      // abandoned (the effort law), and nothing is charged for a pass that never
      // happened. Adding a key makes it continue on the very next poll.
      calledAProvider = false;
      outcome = {
        kind: "incomplete",
        note: "Waiting for an AI provider: this deployment has no provider key set, so no pass can run yet. "
          + "Nothing has been charged for the attempts. The job resumes by itself the moment a key is configured.",
      };
    } else if (e instanceof AiWorkIncompleteError) {
      // The ordinary case, and the reason this module exists.
      outcome = { kind: "incomplete", note: `Pass ${claimed.attempts} used its whole slice and handed on.` };
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      const status = Number(/HTTP (\d{3})/.exec(msg)?.[1] ?? 0);
      const kind = readProviderFailure({ provider: "gateway", status, body: msg }).kind;
      // A HOPELESS REQUEST IS THE ONLY THING THAT ENDS A JOB. Everything else —
      // a timeout, a rate limit, a provider outage — is a reason to go round
      // again, which is what returning it to `queued` does.
      outcome = isHopeless(kind) || /AI work stopped:/.test(msg)
        ? { kind: "hopeless", error: msg }
        : { kind: "incomplete", note: `Pass ${claimed.attempts} failed transiently (${kind}) and will be retried.` };
    }
  }

  // CHARGED PER PASS THAT ACTUALLY CALLED A PROVIDER, because each one is real
  // provider cost and the pricing law is 4× provider cost. `settleAcus` cannot
  // refuse, so a long job is never abandoned for balance — the shortfall becomes
  // owed and the next payment nets it off.
  const cost = ACTION_COST_ACU.llm;
  const settled = calledAProvider
    ? await settleAcus(job.brandId, cost).catch(() => ({ charged: 0, owed: 0, balanceAcu: 0 }))
    : { charged: 0, owed: 0, balanceAcu: 0 };

  // AND IT IS NOT A PASS EITHER. Counting attempts that called nobody would show
  // "47 passes so far" on a deployment that has never once reached a provider,
  // which reads as progress and is the opposite of it.
  const attempts = calledAProvider ? claimed.attempts : job.attempts;
  const next = applySlice({ ...claimed, attempts, chargedAcu: claimed.chargedAcu + settled.charged }, outcome, nowIso());
  const stored: StoredJob = { ...next, system: job.system, prompt: job.prompt };
  await save(stored);
  return strip(stored);
}

/**
 * Advance every job that is waiting, until this invocation runs out of room.
 *
 * Oldest first — a queue, not a stack, so one long job cannot starve the rest.
 */
export async function drainAiJobs(opts: { budgetMs: number; max?: number; trigger?: "user" | "scheduled" }): Promise<{ advanced: number; jobs: AiJobRecord[]; note: string }> {
  const deadline = Date.now() + opts.budgetMs;
  const max = Math.max(1, Math.min(25, opts.max ?? 10));
  const waiting = await queuedJobs(max);
  const out: AiJobRecord[] = [];

  for (const job of waiting) {
    const left = deadline - Date.now();
    // Below this there is no point starting: the slice would hand off before it
    // did anything, burning an attempt and a charge for nothing.
    if (left < 15_000) break;
    const done = await advanceAiJob(job.id, { budgetMs: left, trigger: opts.trigger ?? "scheduled" });
    if (done) out.push(done);
  }
  return {
    advanced: out.length,
    jobs: out,
    note: out.length
      ? `${out.length} job(s) moved on. Unfinished ones are queued again and continue on the next pass.`
      : waiting.length
        ? "Jobs are waiting but there was not enough of this invocation left to start one safely."
        : "Nothing is waiting.",
  };
}

async function queuedJobs(limit: number): Promise<StoredJob[]> {
  const takeable = (j: StoredJob) => claimVerdict(j, Date.now(), STALE_MS).act === "claim";
  if (useDb()) {
    const snap = await timed("aiJobs.queued", () =>
      adminDb!.collection(COLLECTION).where("status", "in", ["queued", "running"]).limit(limit * 3).get());
    return snap.docs
      .map((d) => jobFromStored(d.data()))
      .filter((j): j is StoredJob => j !== null && takeable(j))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }
  return [...mem.values()]
    .filter(takeable)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

/** Tests only. */
export function __resetAiJobs(): void { mem.clear(); }
