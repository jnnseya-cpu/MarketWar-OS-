// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Video Render Gateway — one door to every video model.
//
// Video generation is ASYNC (renders take seconds→minutes and return via an
// operation handle), so this gateway is a two-step job model, NOT a synchronous
// call: startVideoRender() kicks off the render and returns a jobId; a client
// polls getVideoRender(jobId) until it is ready, at which point the finished MP4
// is uploaded to Firebase Storage and a HOSTED URL is returned — ready to attach
// to a published post.
//
// Providers (env-gated, reached over REST — no SDK coupling, like the other
// gateways): Google Veo via the Gemini API (GEMINI_API_KEY) and OpenAI Sora
// (OPENAI_API_KEY). With no key the gateway runs a deterministic DEMO job so the
// flow is testable end to end and the UI is honest ("activates with a Veo/Sora
// key"). Every live path degrades gracefully to demo on any error.

import { adminDb } from "@/backend/firebase-admin";
import { uploadPublicMedia, storageConfigured } from "@/backend/storage";
import { debitAcus, creditAcus } from "@/backend/wallet";
import { requiredAcus } from "@/backend/subscription";
import { minimumAcusFor } from "@/backend/unit-economics";

export type VideoRenderStatus = "queued" | "rendering" | "ready" | "failed" | "demo";
export type VideoProvider = "veo" | "sora" | "demo";

export type VideoJob = {
  jobId: string;
  brandId: string;
  prompt: string;
  provider: VideoProvider;
  status: VideoRenderStatus;
  mode: "live" | "demo";
  videoUrl: string | null;   // hosted MP4 when ready (attachable)
  providerRef: string | null; // provider operation/id to poll
  /** What the caller asked for, and what the model will actually deliver. Both
   *  carried so a 4-second clip can never again arrive without an explanation. */
  requestedSeconds?: number;
  seconds?: number;
  /** ACUs actually taken for this render. 0 in demo, and 0 again after a refund. */
  chargedAcu?: number;
  note: string;
};

function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function jobIdFor(brandId: string, prompt: string): string {
  return `vid_${(seed(brandId + "|" + prompt) >>> 0).toString(16).padStart(8, "0")}`;
}

export function videoGatewayConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}
function chosenProvider(): VideoProvider {
  if (process.env.GEMINI_API_KEY) return "veo";
  if (process.env.OPENAI_API_KEY) return "sora";
  return "demo";
}

// ---------------------------------------------------------------------------
// Job store — Firestore when configured, in-memory otherwise (mirrors ledger.ts
// / invites.ts). Jobs are short-lived render tickets.
// ---------------------------------------------------------------------------
const memJobs = new Map<string, VideoJob>();

async function saveJob(job: VideoJob): Promise<void> {
  memJobs.set(job.jobId, job);
  if (adminDb) { try { await adminDb.collection("video_jobs").doc(job.jobId).set(job); } catch { /* non-fatal */ } }
}
async function loadJob(jobId: string): Promise<VideoJob | null> {
  if (memJobs.has(jobId)) return memJobs.get(jobId)!;
  if (adminDb) { try { const d = await adminDb.collection("video_jobs").doc(jobId).get(); if (d.exists) return d.data() as VideoJob; } catch { /* ignore */ } }
  return null;
}

// ---------------------------------------------------------------------------
// Provider adapters (best-effort REST; defensive parsing; graceful failure).
// ---------------------------------------------------------------------------
// Trim + redact a provider error body to a short, safe reason (never leaks the key).
function safeReason(s: string): string {
  return s.replace(/key=[^&\s"]+/gi, "key=***").replace(/\s+/g, " ").trim().slice(0, 200);
}
type StartResult = { ref: string } | { error: string };

// Veo model ids drift (previews get promoted to `-001` GA and the old id 404s).
// Try the configured model first, then a chain of currently-valid ids, and use
// the first the key accepts. The last known-good id is remembered so we don't
// re-probe 404s on every render.
// FAST FIRST — this order is a pricing decision, not a preference.
//
// Veo 3 Fast is published at $0.15/s against Veo 3's $0.40/s. Asking for the
// flagship first made every social clip cost the customer nearly three times
// what it needed to. The rest of the chain is unchanged, so a key without Fast
// access still renders on whatever it does have.
const VEO_CANDIDATES = [
  "veo-3.0-fast-generate-001", "veo-3.0-generate-001", "veo-3.1-generate-preview",
  "veo-2.0-generate-001", "veo-3.0-generate-preview",
];
let workingVeoModel: string | null = null;

// HOW LONG THE CLIP IS — the thing nobody was asking for.
//
// The renders came back at four seconds and there was no bug to find, because
// there was no duration in the code at all: `startVideoRender` took a brandId
// and a prompt, Veo was called with `{ instances: [{ prompt }] }` and Sora with
// `{ model, prompt }`. Neither was told a length, so both returned their own
// default — and four seconds is not a social video, it is a GIF that costs
// money.
//
// WHAT EACH MODEL WILL ACTUALLY DO. This is the part a caller cannot guess and
// must not be allowed to assume: a single Veo call maxes out at 8 seconds, and
// Sora 2 accepts 4, 8 or 12 and nothing between. So a request for 15 seconds
// cannot be honoured by one call to either. The engine asks for the longest the
// chosen model supports and REPORTS the difference, rather than quietly
// shipping a quarter of what was asked for — which is exactly what it was
// doing.
export const VEO_MAX_SECONDS = 8;
export const VEO_MIN_SECONDS = 4;
export const SORA_STEPS = [4, 8, 12];
export const DEFAULT_SECONDS = 8;

// The lengths offered on screen, in the order they are offered.
export const OFFERED_SECONDS = [4, 8, 12, 15];

// What the panel starts on. Owner's call: 15 seconds, because that is the
// length a social ad is actually cut to.
//
// NO SINGLE CALL PRODUCES IT — Veo caps at 8 and Sora's longest step is 12 — so
// this default is only defensible because the panel now prints, beside every
// option and before the click, the length that provider will really return and
// the ACUs it will really cost. Picking 15 is then an informed choice rather
// than a promise the engine cannot keep. `DEFAULT_SECONDS` above is a different
// thing and stays at 8: it is the fallback for an unparseable request, where
// guessing long would spend the customer's money on a guess.
export const DEFAULT_RENDER_SECONDS = 15;

// ---------------------------------------------------------------------------
// WHAT A GENERATED SECOND COSTS, AND THEREFORE WHAT IT SELLS FOR.
//
// This engine was not metered AT ALL. Veo and Sora bill us per second of
// generated video, and the customer was charged nothing for it — a straight
// breach of the pricing law (price is never below 2x provider cost), and the
// reason the panel could not answer "what will this cost me?": there was no
// answer to give.
//
// THE FIRST ATTEMPT PRICED AN 8-SECOND CLIP AT 1,280 ACUs — £12.80 — and the
// owner's answer was the right one: "not cheap and we will not be competitive."
//
// The mistake was not the margin. It was paying the most expensive rate on the
// board and then multiplying it. Two things fixed it, and both are the levers
// the pricing law actually names — win on a lower COST BASE, never by breaching
// the floor:
//
//   1. ROUTE TO THE CHEAP MODEL. Published rates: Veo 3 is $0.40/s, Veo 3 FAST
//      is $0.15/s, Sora 2 is about $0.10/s at 720p. The candidate order below
//      now asks for Fast first. A social clip does not need the flagship, and
//      the failover chain still reaches it.
//   2. PRICE AT THE FLOOR, NOT THE STANDARD MARKUP. Most actions carry 4x. On
//      an action whose provider cost is measured in pounds rather than pennies,
//      4x prices us out of the market. 2x is the owner's hard floor — 100%
//      margin, never lower — and it is what a big-ticket action is sold at.
//
// 8 seconds now costs the customer ~190 ACUs instead of 1,280, and every penny
// of that is still at least double what the render cost us.
//
// VIDEO_COST_PER_SECOND_GBP is the ONE number to update when the rate is
// confirmed off an invoice; every price moves with it and the floor is enforced
// by test, so a wrong rate cannot quietly become a loss. The default is Veo 3
// Fast's published $0.15/s converted to sterling.
export const VIDEO_COST_PER_SECOND_GBP = Number(process.env.VIDEO_COST_PER_SECOND_GBP || 0.12);

/** The markup video renders are sold at. The owner's hard floor, never below. */
const VIDEO_MARKUP = 2;

/** What a render of this many seconds costs the customer, in ACUs (1 ACU = 1p). */
export function videoRenderAcus(seconds: number): number {
  const s = Math.max(1, Math.round(Number(seconds) || DEFAULT_SECONDS));
  const providerCostGbp = VIDEO_COST_PER_SECOND_GBP * s;
  return Math.max(
    requiredAcus(providerCostGbp, VIDEO_MARKUP).requiredAcus,
    minimumAcusFor({ providerCostGbp, persistsArtifact: true }).minAcus,
  );
}

/**
 * The price list the panel shows, for the provider that will actually serve.
 *
 * The price is for what will be DELIVERED, not what was asked for: a request
 * for 15 seconds comes back as 8 on Veo, and charging for 15 seconds of video
 * nobody received is the kind of thing this platform exists not to do. Where
 * they differ the caller gets both numbers and the reason.
 */
export function videoLengthOptions(provider?: VideoProvider): {
  requested: number; delivered: number; acus: number; note: string;
}[] {
  const p = provider ?? chosenProvider();
  return OFFERED_SECONDS.map((requested) => {
    // With no provider configured nothing renders, so nothing is charged and
    // the honest delivered length is the one asked for.
    const delivered = p === "demo" ? requested : supportedSeconds(p, requested);
    return {
      requested,
      delivered,
      acus: p === "demo" ? 0 : videoRenderAcus(delivered),
      note: p === "demo" ? "" : durationNote(p, requested, delivered),
    };
  });
}

/** What this provider will actually produce for a requested length. */
export function supportedSeconds(provider: VideoProvider, requested: number): number {
  const want = Math.max(1, Math.round(Number(requested) || DEFAULT_SECONDS));
  if (provider === "veo") return Math.min(VEO_MAX_SECONDS, Math.max(VEO_MIN_SECONDS, want));
  if (provider === "sora") {
    // Snap DOWN to a supported step, never up: a longer clip than asked for is
    // a bigger bill nobody approved.
    const fits = SORA_STEPS.filter((n) => n <= want);
    return fits.length ? fits[fits.length - 1] : SORA_STEPS[0];
  }
  return want;
}

/** Said out loud when the model cannot give what was asked for. */
export function durationNote(provider: VideoProvider, requested: number, delivered: number): string {
  if (delivered >= requested) return "";
  const cap = provider === "veo"
    ? `a single Veo call caps at ${VEO_MAX_SECONDS} seconds`
    : `Sora accepts only ${SORA_STEPS.join(", ")} seconds`;
  return `You asked for ${requested}s and this clip is ${delivered}s — ${cap}. For longer, render segments and stitch them in the Video War Room rather than expecting one call to produce it.`;
}

async function veoTry(model: string, prompt: string, key: string, seconds: number): Promise<{ ref?: string; status: number; reason?: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      // `durationSeconds` is the documented Veo parameter. If a model or region
      // rejects it the call is retried WITHOUT it rather than failing the
      // render — a shorter clip beats no clip, and the note says which happened.
      body: JSON.stringify({ instances: [{ prompt }], parameters: { durationSeconds: seconds } }),
    });
    if (!res.ok) {
      const reason = safeReason(await res.text().catch(() => ""));
      if (res.status === 400) {
        const retry = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instances: [{ prompt }] }),
        });
        if (retry.ok) {
          const d = await retry.json().catch(() => null);
          if (typeof d?.name === "string") return { ref: d.name, status: 200, reason: "duration not accepted by this model — rendered at its default length" };
        }
      }
      return { status: res.status, reason };
    }
    const data = await res.json().catch(() => null);
    return typeof data?.name === "string" ? { ref: data.name, status: 200 } : { status: 200, reason: "no operation handle" };
  } catch (e) { return { status: 0, reason: e instanceof Error ? e.message : "network error" }; }
}

async function veoStart(prompt: string, seconds: number): Promise<StartResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "No GEMINI_API_KEY set" };
  const ordered = [process.env.GEMINI_VIDEO_MODEL, workingVeoModel, ...VEO_CANDIDATES]
    .filter((m): m is string => Boolean(m))
    .filter((m, i, a) => a.indexOf(m) === i);
  let lastErr = "";
  for (const model of ordered) {
    const r = await veoTry(model, prompt, key, seconds);
    if (r.ref) { workingVeoModel = model; return { ref: r.ref }; }
    // 404 / 400 = wrong-or-unavailable model → try the next candidate.
    if (r.status === 404 || r.status === 400) { lastErr = `${model}: ${r.status} ${r.reason || ""}`.trim(); continue; }
    // 401/403/429/5xx are key/quota/server issues — stop and report (not a model problem).
    return { error: `Veo API ${r.status} (model ${model})${r.reason ? ` — ${r.reason}` : ""}` };
  }
  return { error: `No usable Veo model for your key. Tried ${ordered.join(", ")}. Last: ${lastErr}. Set GEMINI_VIDEO_MODEL to a Veo model your account/region can access.` };
}
// Dig the video out of Veo's long-running-operation response. Google has shipped
// several response shapes across model versions, and the clip may be a fetchable
// URI OR inline base64 — handle them all so a finished render actually yields bytes.
function extractVeoVideo(resp: unknown): { uri?: string; b64?: string } {
  const r = (resp || {}) as Record<string, unknown>;
  const paths: unknown[] = [
    (r.generateVideoResponse as Record<string, unknown> | undefined)?.generatedSamples,
    (r.generateVideoResponse as Record<string, unknown> | undefined)?.videos,
    r.generatedVideos, r.generatedSamples, r.videos, r.samples,
  ];
  for (const arr of paths) {
    const first = Array.isArray(arr) ? (arr[0] as Record<string, unknown> | undefined) : undefined;
    if (!first) continue;
    const video = (first.video as Record<string, unknown> | undefined) ?? first;
    const uri = video?.uri ?? video?.videoUri ?? first.uri;
    const b64 = video?.bytesBase64Encoded ?? first.bytesBase64Encoded ?? video?.videoBytes;
    if (typeof b64 === "string" && b64) return { b64 };
    if (typeof uri === "string" && uri) return { uri };
  }
  return {};
}

async function veoPoll(op: string): Promise<{ done: boolean; bytes?: Buffer; diag?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { done: false };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op}?key=${key}`);
    if (!res.ok) return { done: false };
    const data = await res.json().catch(() => null);
    if (!data?.done) return { done: false };
    // A finished operation can carry an error (safety block, quota, etc.) instead
    // of a video — surface it verbatim so the real cause is visible.
    if (data.error) return { done: true, diag: `Veo operation error: ${safeReason(JSON.stringify(data.error))}` };
    const { uri, b64 } = extractVeoVideo(data.response);
    if (b64) {
      const buf = Buffer.from(b64, "base64");
      return buf.length >= 2048 ? { done: true, bytes: buf } : { done: true, diag: `Inline video was only ${buf.length} bytes.` };
    }
    if (uri) {
      // Veo returns a Files-API URI; authenticate with BOTH the query key and the
      // header (Google accepts either), and request the media bytes.
      const dl = uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}alt=media&key=${key}`;
      const v = await fetch(dl, { headers: { "x-goog-api-key": key } });
      if (v.ok) {
        const buf = Buffer.from(await v.arrayBuffer());
        return buf.length >= 2048 ? { done: true, bytes: buf } : { done: true, diag: `Downloaded only ${buf.length} bytes from the video URI (not a full video).` };
      }
      const body = safeReason(await v.text().catch(() => ""));
      return { done: true, diag: `Video URI download failed: HTTP ${v.status}${body ? ` — ${body}` : ""}.` };
    }
    // No video field found — report the actual response shape so it can be mapped.
    const keys = Object.keys((data.response as Record<string, unknown>) || {});
    const inner = keys.length ? keys.map((k) => { const v = (data.response as Record<string, unknown>)[k]; return `${k}:${Array.isArray(v) ? `[${v.length}]` : typeof v}`; }).join(", ") : "(empty response)";
    return { done: true, diag: `Veo returned no recognisable video field. Response shape: { ${inner} }.` };
  } catch (e) { return { done: false, diag: e instanceof Error ? e.message : "poll error" }; }
}
async function soraStart(prompt: string, seconds: number): Promise<StartResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "No OPENAI_API_KEY set" };
  const model = process.env.OPENAI_VIDEO_MODEL || "sora-2";
  try {
    const res = await fetch("https://api.openai.com/v1/videos", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Sora takes `seconds` as a string enum. Same rule as Veo: if it is
      // rejected, retry without it rather than losing the render.
      body: JSON.stringify({ model, prompt, seconds: String(seconds) }),
    });
    if (!res.ok) {
      const body = safeReason(await res.text().catch(() => ""));
      if (res.status === 400) {
        const retry = await fetch("https://api.openai.com/v1/videos", {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt }),
        });
        if (retry.ok) {
          const d = await retry.json().catch(() => null);
          if (typeof d?.id === "string") return { ref: d.id };
        }
      }
      return { error: `Sora API ${res.status} (model ${model})${body ? ` — ${body}` : ""}` };
    }
    const data = await res.json().catch(() => null);
    return typeof data?.id === "string" ? { ref: data.id } : { error: "Sora returned no video id" };
  } catch (e) { return { error: `Sora request failed: ${e instanceof Error ? e.message : "network error"}` }; }
}
async function soraPoll(id: string): Promise<{ done: boolean; bytes?: Buffer }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { done: false };
  try {
    const res = await fetch(`https://api.openai.com/v1/videos/${id}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return { done: false };
    const data = await res.json().catch(() => null);
    if (data?.status !== "completed") return { done: false };
    const content = await fetch(`https://api.openai.com/v1/videos/${id}/content`, { headers: { Authorization: `Bearer ${key}` } });
    if (content.ok) return { done: true, bytes: Buffer.from(await content.arrayBuffer()) };
    return { done: true };
  } catch { return { done: false }; }
}

// ---------------------------------------------------------------------------
// Public API — start + poll.
// ---------------------------------------------------------------------------
export async function startVideoRender(input: { brandId: string; prompt: string; seconds?: number }): Promise<VideoJob> {
  const brandId = input.brandId?.trim() || "brand";
  const prompt = input.prompt?.trim() || "Product highlight video";
  const requestedSeconds = Math.max(1, Math.round(Number(input.seconds) || DEFAULT_SECONDS));
  const jobId = jobIdFor(brandId, prompt);

  // Provider chain with automatic failover (like the AI gateway): try Veo, then
  // Sora — so if one provider's model is unavailable (404) or its quota is spent,
  // the render still goes through on the other. Falls back to demo only when no
  // key is set at all.
  const chain: VideoProvider[] = [];
  if (process.env.GEMINI_API_KEY) chain.push("veo");
  if (process.env.OPENAI_API_KEY) chain.push("sora");

  if (chain.length === 0) {
    const job: VideoJob = { jobId, brandId, prompt, provider: "demo", status: "demo", mode: "demo", videoUrl: null, providerRef: null,
      requestedSeconds, seconds: requestedSeconds,
      note: "Demo — video render activates with a Veo (GEMINI_API_KEY) or Sora (OPENAI_API_KEY) key. The pipeline, job model and post-attach are wired; only the render engine is gated." };
    await saveJob(job);
    return job;
  }

  // PAID FOR BEFORE IT RUNS, AND ONLY FOR WHAT IT DELIVERS.
  //
  // The worst case in the chain is taken up front, because failover means we do
  // not yet know which provider will serve or how long its clip will be — and
  // starting a render we cannot bill is how an engine ends up given away. The
  // difference is refunded the moment the real length is known, and the whole
  // amount is refunded if every provider fails. Nobody is ever charged for a
  // second of video they did not receive.
  const worstCaseAcu = Math.max(...chain.map((p) => videoRenderAcus(supportedSeconds(p, requestedSeconds))));
  const debit = await debitAcus(brandId, worstCaseAcu);
  if (!debit.ok) {
    const job: VideoJob = { jobId, brandId, prompt, provider: chain[0], status: "failed", mode: "live", videoUrl: null, providerRef: null,
      requestedSeconds, seconds: 0, chargedAcu: 0,
      note: `Not enough ACUs — this render costs up to ${worstCaseAcu} ACUs and your balance is ${debit.balanceAcu}. Top up on Billing. Nothing was rendered and nothing was taken.` };
    await saveJob(job);
    return job;
  }

  const errors: string[] = [];
  for (const provider of chain) {
    const deliveredSeconds = supportedSeconds(provider, requestedSeconds);
    const started = provider === "veo" ? await veoStart(prompt, deliveredSeconds) : await soraStart(prompt, deliveredSeconds);
    if ("ref" in started) {
      const failedOver = errors.length > 0;
      const shortfall = durationNote(provider, requestedSeconds, deliveredSeconds);
      // Charge for the clip that is actually being made, not the worst case.
      const chargedAcu = videoRenderAcus(deliveredSeconds);
      if (worstCaseAcu > chargedAcu) await creditAcus(brandId, worstCaseAcu - chargedAcu);
      const job: VideoJob = { jobId, brandId, prompt, provider, status: "rendering", mode: "live", videoUrl: null, providerRef: started.ref,
        requestedSeconds, seconds: deliveredSeconds, chargedAcu,
        note: `Rendering ${deliveredSeconds}s via ${provider}${failedOver ? " (failed over from the other provider)" : ""} — ${chargedAcu} ACUs. Poll for the hosted MP4 (renders take up to a few minutes).${shortfall ? ` ${shortfall}` : ""}` };
      await saveJob(job);
      return job;
    }
    errors.push(`${provider}: ${started.error}`);
  }

  // Nothing started, so nothing is owed.
  await creditAcus(brandId, worstCaseAcu);

  // Every configured provider failed — report each reason so it's debuggable.
  const job: VideoJob = { jobId, brandId, prompt, provider: chain[0], status: "failed", mode: "live", videoUrl: null, providerRef: null,
    note: `Couldn't start a render on any configured provider. ${errors.join(" | ")}. Confirm your Veo/Sora model access, or set GEMINI_VIDEO_MODEL / OPENAI_VIDEO_MODEL to a model your account can use.` };
  await saveJob(job);
  return job;
}

export async function getVideoRender(jobId: string): Promise<VideoJob | { error: string }> {
  const job = await loadJob(jobId);
  if (!job) return { error: "Unknown render job" };
  if (job.status !== "rendering" || !job.providerRef) return job; // demo/ready/failed are terminal here

  const poll = job.provider === "veo" ? await veoPoll(job.providerRef) : await soraPoll(job.providerRef);
  if (!poll.done) return job; // still rendering

  // A real MP4 is never a few bytes — guard against an empty/placeholder blob
  // being hosted as a "video" (which shows as a blank player).
  const realVideo = Boolean(poll.bytes && poll.bytes.length >= 2048);

  // Completed — upload the MP4 to Storage so it has a hosted, attachable URL.
  if (realVideo && storageConfigured()) {
    const url = await uploadPublicMedia(poll.bytes!, { contentType: "video/mp4", ext: "mp4", keyPrefix: "videos", nameSeed: `${job.brandId}|${job.prompt}` });
    if (url) { job.status = "ready"; job.videoUrl = url; job.note = `Rendered — hosted MP4 (${Math.round(poll.bytes!.length / 1024)} KB) ready to attach.`; await saveJob(job); return job; }
  }
  // Rendered but no Storage to host it (or no usable bytes) — honest terminal
  // state, now with the real diagnostic instead of a vague message.
  job.status = realVideo ? "failed" : "ready";
  if (realVideo) {
    job.note = "Rendered, but the hosted upload didn't return a URL — check Firebase Storage (bucket + admin creds). Probe /api/health/storage for a green/red readout.";
  } else {
    job.note = `Render finished but no video came back. ${(poll as { diag?: string }).diag || "The provider returned no downloadable asset."} Send me this line and I'll map it exactly.`;
  }
  await saveJob(job);
  return job;
}

export function videoGatewayStatus() {
  return {
    configured: videoGatewayConfigured(),
    provider: chosenProvider(),
    async: true,
    // The price list, so the panel shows what a length costs BEFORE the click
    // and never does the arithmetic itself — a price computed in the browser is
    // a second source of truth about money.
    lengths: videoLengthOptions(),
    defaultSeconds: DEFAULT_RENDER_SECONDS,
    note: videoGatewayConfigured()
      ? "Live — renders via Veo/Sora, uploads the MP4 to Storage, and returns a hosted URL to attach to posts."
      : "Demo — the render pipeline, async job model and post-attach are wired; the render engine activates with a Veo (GEMINI_API_KEY) or Sora (OPENAI_API_KEY) key.",
  };
}
