import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { claimVerdict, applySlice, progressLine, STALE_MS } from "../src/shared/ai-job.ts";

// CROSS-INVOCATION CONTINUATION.
//
// `AiWorkIncompleteError` used to be the end of the road: the platform said
// honestly that a run had not finished and nothing picked it up. These cover the
// thing that picks it up, and the property that matters most is the one
// `video-jobs` deliberately does NOT have — no attempt ceiling, because under
// the effort law a run continued thirty times is a long piece of work, not a
// broken one.

const job = (over = {}) => ({
  id: "aj_1", brandId: "b1", kind: "document", status: "queued",
  attempts: 0, createdAt: "2026-09-18T00:00:00.000Z", claimedAt: null,
  finishedAt: null, chargedAcu: 0, ...over,
});

test("NO number of attempts ever stops a job being picked up again", () => {
  // The single most important assertion here. `video-jobs` retires at 3
  // attempts; copying that would have re-imposed the limit the effort law
  // exists to remove, on the one path built to honour it.
  for (const attempts of [0, 1, 3, 4, 50, 5000]) {
    const v = claimVerdict(job({ attempts }));
    assert.equal(v.act, "claim", `attempt ${attempts} must still be claimable`);
  }
});

test("a finished job is never picked up again", () => {
  assert.equal(claimVerdict(job({ status: "done" })).act, "skip");
  assert.equal(claimVerdict(job({ status: "failed" })).act, "skip");
});

test("a job inside its lease is left alone; a stranded one is reclaimed", () => {
  const now = Date.parse("2026-09-18T01:00:00.000Z");
  const fresh = job({ status: "running", claimedAt: new Date(now - 30_000).toISOString() });
  assert.equal(claimVerdict(fresh, now).act, "skip", "two workers must not run one job at once");

  const stranded = job({ status: "running", claimedAt: new Date(now - STALE_MS - 1000).toISOString() });
  const v = claimVerdict(stranded, now);
  assert.equal(v.act, "claim", "an invocation that was killed must not strand the work forever");
  assert.match(v.why, /never finished|abandoned/);
});

test("a running job with no claim time is treated as abandoned, not stranded", () => {
  // The safe direction: the alternative is work that can never be picked up
  // again, which is the one outcome this whole vertical exists to prevent.
  assert.equal(claimVerdict(job({ status: "running", claimedAt: null })).act, "claim");
});

test("an unfinished slice returns the job to the QUEUE, not to failure", () => {
  // THE JOB MUST START WITH A REAL CLAIM. The first version of this test used
  // the default `claimedAt: null`, so "the lease is released" passed whether the
  // code released it or not — and a mutation removing the release survived. A
  // job handed on with its lease still held is invisible to every other
  // invocation until the lease expires, which is the one failure this vertical
  // exists to prevent.
  const running = job({ status: "running", attempts: 4, claimedAt: "2026-09-18T01:59:00.000Z" });
  const out = applySlice(running, { kind: "incomplete", note: "Pass 4 handed on." }, "2026-09-18T02:00:00.000Z");
  assert.equal(out.status, "queued", "this is the ordinary case and must never read as an error");
  assert.equal(out.claimedAt, null, "the lease must be released or nothing can pick it up");
  // And proved by the thing that actually decides: it must be claimable NOW,
  // not in ten minutes when the lease would have expired anyway.
  assert.equal(claimVerdict(out, Date.parse("2026-09-18T02:00:01.000Z")).act, "claim");
  assert.equal(out.finishedAt, null);
  assert.equal(out.error, undefined);
});

test("only a hopeless request can make a job FAIL", () => {
  const failed = applySlice(job({ status: "running", claimedAt: "2026-09-18T01:59:00.000Z" }), { kind: "hopeless", error: "refused by safety classifiers" }, "2026-09-18T02:00:00.000Z");
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /refused/);

  const done = applySlice(job({ status: "running", claimedAt: "2026-09-18T01:59:00.000Z" }), { kind: "finished", text: "the document" }, "2026-09-18T02:00:00.000Z");
  assert.equal(done.status, "done");
  assert.equal(done.result, "the document");
  assert.equal(done.claimedAt, null);
});

test("a long-running job does not describe itself as stuck", () => {
  // "queued" on its own invites somebody to conclude nothing is happening and
  // start the work again — paying twice for one document.
  const line = progressLine(job({ status: "queued", attempts: 6, note: "Pass 6 handed on." }));
  assert.match(line, /Still working/);
  assert.match(line, /6 passes/);
  assert.doesNotMatch(line, /^Queued/);

  assert.match(progressLine(job({ status: "queued", attempts: 0 })), /first pass has not started/);
  assert.equal(progressLine(job({ status: "done" })), "Finished.");
});

// ---------------------------------------------------------------------------
// THE STORE, driven rather than read.
// ---------------------------------------------------------------------------

test("a job survives being handed from one invocation to the next", async () => {
  const jobs = await import("../src/backend/ai-jobs.ts");
  jobs.__resetAiJobs();

  const started = await jobs.enqueueAiJob({ brandId: "brand-x", kind: "document", system: "s", prompt: "write a long thing" });
  assert.equal(started.status, "queued");
  assert.equal(started.attempts, 0);

  // THE PROMPT IS NOT HANDED OUT. A surface shows a job; it has no business
  // receiving the system prompt back.
  assert.equal("prompt" in started, false);
  assert.equal("system" in started, false);

  // WITH NO PROVIDER CONFIGURED, NOTHING IS CHARGED AND NOTHING IS COUNTED.
  //
  // The job must still not be abandoned — the effort law — but a pass that
  // called nobody is not a pass: charging for it is the charged-and-served-
  // nothing defect, and counting it would show "47 passes so far" on a
  // deployment that has never reached a provider, which reads as progress.
  const after = await jobs.advanceAiJob(started.id, { budgetMs: 20_000, trigger: "user" });
  assert.ok(after);
  assert.notEqual(after.status, "done");
  assert.notEqual(after.status, "failed", "a missing key is not the request's fault");
  assert.equal(after.attempts, 0, "a pass that reached no provider is not a pass");
  assert.equal(after.chargedAcu, 0, "and it is never charged for");
  assert.match(after.note, /Waiting for an AI provider/);
  assert.match(after.note, /resumes by itself/);

  // And it is still findable and still takeable.
  const stored = await jobs.getAiJob(started.id);
  assert.ok(stored, "the job must persist across the call that ran it");
  assert.equal(claimVerdict(stored).act === "claim" || stored.status === "failed", true);
});

test("a job belongs to its brand, and the store keeps them apart", async () => {
  const jobs = await import("../src/backend/ai-jobs.ts");
  jobs.__resetAiJobs();
  await jobs.enqueueAiJob({ brandId: "brand-a", kind: "document", system: "", prompt: "a" });
  await jobs.enqueueAiJob({ brandId: "brand-b", kind: "document", system: "", prompt: "b" });

  const a = await jobs.listAiJobs("brand-a");
  assert.equal(a.length, 1);
  assert.equal(a[0].brandId, "brand-a");
});

test("a stored row with an unknown status is refused, not drawn as a guess", async () => {
  const jobs = await import("../src/backend/ai-jobs.ts");
  assert.equal(jobs.jobFromStored({ id: "x", brandId: "b", kind: "document", status: "halfway" }), null);
  assert.equal(jobs.jobFromStored({ id: "x", brandId: "b", kind: "telepathy", status: "queued" }), null);
  assert.equal(jobs.jobFromStored(null), null);
  assert.equal(jobs.jobFromStored("queued"), null);
  const ok = jobs.jobFromStored({ id: "x", brandId: "b", kind: "document", status: "queued", attempts: 2 });
  assert.equal(ok.attempts, 2);
});

test("the drain reports honestly when it has nothing to do", async () => {
  const jobs = await import("../src/backend/ai-jobs.ts");
  jobs.__resetAiJobs();
  const out = await jobs.drainAiJobs({ budgetMs: 60_000 });
  assert.equal(out.advanced, 0);
  assert.match(out.note, /Nothing is waiting/);
});

test("the drain refuses to start a slice it cannot finish", async () => {
  // Starting one with seconds left burns an attempt and a charge to produce
  // nothing, which is the opposite of what the effort law is for.
  const jobs = await import("../src/backend/ai-jobs.ts");
  jobs.__resetAiJobs();
  await jobs.enqueueAiJob({ brandId: "b", kind: "document", system: "", prompt: "p" });
  const out = await jobs.drainAiJobs({ budgetMs: 1_000 });
  assert.equal(out.advanced, 0);
  assert.match(out.note, /not enough of this invocation/);
});

// ---------------------------------------------------------------------------
// THE WIRING, which is what decides whether any of it runs on this deployment.
// ---------------------------------------------------------------------------

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("continuation does not depend on CRON_SECRET, which is unset here", () => {
  // A cron-only drain would have shipped as a feature that has never run. The
  // status poll advances the job, so the person waiting drives their own work.
  const code = codeOf(readFileSync("src/app/api/ai-jobs/route.ts", "utf8"));
  assert.match(code, /advanceAiJob\(jobId, \{ budgetMs, trigger: "user" \}\)/,
    "asking about a job must carry it forward");
  assert.match(code, /keepPolling/, "and the caller must be told to keep asking");

  // The cron exists too, for work nobody is watching, and a platform admin can
  // drain by hand on a deployment with no scheduler.
  const drain = codeOf(readFileSync("src/app/api/ai-jobs/drain/route.ts", "utf8"));
  assert.match(drain, /cronAuthorised/);
  assert.match(drain, /platform_admin/);

  const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons.map((c) => c.path);
  assert.ok(crons.some((p) => p.includes("/api/ai-jobs/drain")), "the drain must be scheduled");
});

test("one brand cannot advance or read another brand's job", () => {
  const code = codeOf(readFileSync("src/app/api/ai-jobs/route.ts", "utf8"));
  // Checked on the RECORD, not on the argument — trusting the brandId in the
  // body would let anybody holding a job id advance somebody else's work.
  assert.match(code, /existing\.brandId !== brandId/);
  assert.match(code, /resolveBrandAccess\(req, brandId\)/);
});

test("the job store has no attempt ceiling anywhere in it", () => {
  // The line that would quietly undo this whole vertical.
  for (const f of ["src/shared/ai-job.ts", "src/backend/ai-jobs.ts"]) {
    const code = codeOf(readFileSync(f, "utf8"));
    assert.doesNotMatch(code, /MAX_ATTEMPTS/, `${f} must not import or define an attempt ceiling`);
    assert.doesNotMatch(code, /attempts\s*>=?\s*\d/, `${f} must never branch on an attempt count`);
  }
});

test("every scheduled route is reachable BY the scheduler", async () => {
  // THE TRAP THIS CAME FROM, found by driving and not by reading.
  //
  // `/api/ai-jobs/drain` was written, the cron was added to vercel.json, the
  // route authorised the bearer correctly — and the human gate answered the
  // scheduler with "No human session on this request." The middleware runs
  // before the route, and a path with no machine lane has no way in. A cron
  // route that is not in MACHINE_LANES is a cron route that has never run, and
  // nothing anywhere would have said so: the schedule fires, the gate refuses,
  // and the work silently never happens.
  const { machineLaneFor } = await import("../src/backend/human-gate.ts");
  const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons;
  assert.ok(crons.length > 5, "the cron list could not be read");

  const unreachable = [];
  for (const c of crons) {
    const path = c.path.split("?")[0];
    if (!machineLaneFor(path)) unreachable.push(path);
  }
  assert.deepEqual(unreachable, [],
    "these paths are scheduled but the human gate has no lane for them, so the scheduler is refused before the "
    + "route runs and the work never happens: " + unreachable.join(", "));
});

test("the drain's lane demands the scheduler's credential", async () => {
  const { machineLaneFor } = await import("../src/backend/human-gate.ts");
  const lane = machineLaneFor("/api/ai-jobs/drain");
  assert.ok(lane, "the drain must have a lane at all");
  assert.equal(lane.credential, "cron_bearer",
    "a provider-signature lane would let anything with a webhook signature drain the queue");
  // And the lane must not accidentally open the whole job API: /api/ai-jobs
  // carries a customer's work and belongs behind the human gate.
  assert.equal(machineLaneFor("/api/ai-jobs"), null,
    "only the drain is a machine path — the job API itself is a customer surface");
});
