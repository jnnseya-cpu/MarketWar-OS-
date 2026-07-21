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
async function veoStart(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_VIDEO_MODEL || "veo-3.0-generate-preview";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt }] }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return typeof data?.name === "string" ? data.name : null; // operations/....
  } catch { return null; }
}
async function veoPoll(op: string): Promise<{ done: boolean; url?: string; bytes?: Buffer }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { done: false };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op}?key=${key}`);
    if (!res.ok) return { done: false };
    const data = await res.json().catch(() => null);
    if (!data?.done) return { done: false };
    const uri = data?.response?.generatedVideos?.[0]?.video?.uri || data?.response?.videos?.[0]?.uri;
    if (typeof uri === "string") { const v = await fetch(uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}key=${key}`); return { done: true, bytes: Buffer.from(await v.arrayBuffer()) }; }
    return { done: true };
  } catch { return { done: false }; }
}
async function soraStart(prompt: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_VIDEO_MODEL || "sora-2";
  try {
    const res = await fetch("https://api.openai.com/v1/videos", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return typeof data?.id === "string" ? data.id : null;
  } catch { return null; }
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
export async function startVideoRender(input: { brandId: string; prompt: string }): Promise<VideoJob> {
  const brandId = input.brandId?.trim() || "brand";
  const prompt = input.prompt?.trim() || "Product highlight video";
  const jobId = jobIdFor(brandId, prompt);
  const provider = chosenProvider();

  if (provider === "demo") {
    const job: VideoJob = { jobId, brandId, prompt, provider: "demo", status: "demo", mode: "demo", videoUrl: null, providerRef: null,
      note: "Demo — video render activates with a Veo (GEMINI_API_KEY) or Sora (OPENAI_API_KEY) key. The pipeline, job model and post-attach are wired; only the render engine is gated." };
    await saveJob(job);
    return job;
  }

  const ref = provider === "veo" ? await veoStart(prompt) : await soraStart(prompt);
  if (!ref) {
    const job: VideoJob = { jobId, brandId, prompt, provider, status: "failed", mode: "live", videoUrl: null, providerRef: null,
      note: `Could not start the ${provider} render — try again shortly.` };
    await saveJob(job);
    return job;
  }
  const job: VideoJob = { jobId, brandId, prompt, provider, status: "rendering", mode: "live", videoUrl: null, providerRef: ref,
    note: `Rendering via ${provider} — poll for the hosted MP4 (renders take up to a few minutes).` };
  await saveJob(job);
  return job;
}

export async function getVideoRender(jobId: string): Promise<VideoJob | { error: string }> {
  const job = await loadJob(jobId);
  if (!job) return { error: "Unknown render job" };
  if (job.status !== "rendering" || !job.providerRef) return job; // demo/ready/failed are terminal here

  const poll = job.provider === "veo" ? await veoPoll(job.providerRef) : await soraPoll(job.providerRef);
  if (!poll.done) return job; // still rendering

  // Completed — upload the MP4 to Storage so it has a hosted, attachable URL.
  if (poll.bytes && storageConfigured()) {
    const url = await uploadPublicMedia(poll.bytes, { contentType: "video/mp4", ext: "mp4", keyPrefix: "videos", nameSeed: `${job.brandId}|${job.prompt}` });
    if (url) { job.status = "ready"; job.videoUrl = url; job.note = "Rendered — hosted MP4 ready to attach to a post."; await saveJob(job); return job; }
  }
  // Rendered but no Storage to host it (or no bytes) — honest terminal state.
  job.status = poll.bytes ? "failed" : "ready";
  job.note = poll.bytes
    ? "Rendered, but Firebase Storage is not configured to host the MP4 — set the Storage secrets to attach video to posts."
    : "Render finished. The provider returned no downloadable asset in this environment.";
  await saveJob(job);
  return job;
}

export function videoGatewayStatus() {
  return {
    configured: videoGatewayConfigured(),
    provider: chosenProvider(),
    async: true,
    note: videoGatewayConfigured()
      ? "Live — renders via Veo/Sora, uploads the MP4 to Storage, and returns a hosted URL to attach to posts."
      : "Demo — the render pipeline, async job model and post-attach are wired; the render engine activates with a Veo (GEMINI_API_KEY) or Sora (OPENAI_API_KEY) key.",
  };
}
