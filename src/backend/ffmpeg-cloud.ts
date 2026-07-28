// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Hosted FFmpeg (ffmpeg-micro) — a render executor that needs no container.
//
// The self-hosted worker (worker/) and this module do the SAME work. The
// difference is only where the CPU lives: a container we deploy and pay for
// around the clock, or an HTTP API billed per processing minute. Whichever is
// configured, the customer sees one Render Farm.
//
// The lifecycle, as documented:
//   1. POST /v1/upload/presigned-url  { filename, contentType, fileSize }
//                                   → { success, result: { uploadUrl, filename } }
//   2. PUT  <uploadUrl>               binary, Content-Type must match, 10-min TTL
//   3. POST /v1/upload/confirm        { filename, fileSize }
//                                   → { success, result: { fileUrl, downloadUrl } }
//   4. POST /v1/transcodes            { inputs: [{url}], outputFormat, preset }
//                                   → { id, status, ... }
//   5. GET  /v1/transcodes/{id}     → { success, jobId, status, outputUrl?, completedAt? }
//   6. GET  /v1/transcodes/{id}/download → { url }   (signed, 10-min TTL)
//
// Two shapes to be careful with, both of which cost an afternoon if missed:
// the upload endpoints wrap their payload in `result` while the transcode
// create endpoint does NOT, and every byte count must be a JSON number — a
// quoted string is a 400.

import {
  passSupportedOnHostedApi, toOptionPairs, outputFormatFor,
  type RenderPass, type OptionPair,
} from "@/backend/ffmpeg-recipes";

const BASE = (process.env.FFMPEG_CLOUD_URL || "https://api.ffmpeg-micro.com").replace(/\/$/, "");

// Their signed URLs — both upload and download — last 10 minutes.
export const SIGNED_URL_TTL_SEC = 600;
// Guard rail: a render source larger than this is a mistake, not a marketing
// video, and would burn ACUs on a transfer that times out.
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export type CloudJobStatus = "pending" | "processing" | "completed" | "failed";
export type PresignedUpload = { uploadUrl: string; filename: string };
export type ConfirmedUpload = { fileUrl: string; downloadUrl?: string };
export type CloudJob = { id: string; status: CloudJobStatus; outputUrl?: string; completedAt?: string; error?: string };

function key(): string { return (process.env.FFMPEG_CLOUD_API_KEY || "").trim(); }
export function ffmpegCloudConfigured(): boolean { return Boolean(key()); }

// Content types their pipeline can decode. Anything else is rejected here so
// the customer is told before a job is queued and charged.
const ACCEPTED = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
  "audio/mpeg", "audio/mp4", "audio/wav",
]);

export function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  };
  return map[ext] || "application/octet-stream";
}

export function validateSource(filename: string, fileSize: number): { ok: boolean; contentType?: string; error?: string } {
  const name = (filename || "").trim();
  if (!name) return { ok: false, error: "The file needs a name." };
  // Their API rejects a byte count sent as a string, and a fractional size is a
  // caller bug — catch both here rather than as an opaque 400.
  if (!Number.isInteger(fileSize) || fileSize <= 0) return { ok: false, error: "That file appears to be empty." };
  if (fileSize > MAX_SOURCE_BYTES) {
    return { ok: false, error: `That file is ${(fileSize / 1073741824).toFixed(1)}GB — the limit is 2GB. Export a smaller version or trim it first.` };
  }
  const contentType = contentTypeFor(name);
  if (!ACCEPTED.has(contentType)) {
    return { ok: false, error: `${name.split(".").pop()?.toUpperCase() || "That"} files are not supported — use MP4, MOV, WebM or MKV.` };
  }
  return { ok: true, contentType };
}

// The upload endpoints nest their payload under `result`; the transcode create
// endpoint returns its fields at the top level. One helper, so a future endpoint
// that changes its mind does not silently return undefined.
export function unwrap<T>(body: unknown): T | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.success === false) return null;
  if (b.result && typeof b.result === "object") return b.result as T;
  return b as T;
}

export function explainError(status: number, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message : typeof b.error === "string" ? b.error : "";
  if (status === 401) return "The hosted FFmpeg service rejected the API key. Check FFMPEG_CLOUD_API_KEY.";
  if (status === 429) return "The hosted FFmpeg service is rate limiting, or your processing-minute allowance is spent.";
  if (status === 422) return message || "The render request was malformed and the service refused it.";
  return message || `Hosted FFmpeg returned HTTP ${status}`;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!ffmpegCloudConfigured()) return { ok: false, error: "Hosted rendering needs FFMPEG_CLOUD_API_KEY." };
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: explainError(res.status, body) };
    const data = unwrap<T>(body);
    if (!data) return { ok: false, error: explainError(res.status, body) || "The service returned an empty result." };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach the hosted FFmpeg service." };
  }
}

// --- 1. ask for a signed URL to put a file into their input bucket ----------
export async function presignUpload(input: { filename: string; fileSize: number }): Promise<
  { ok: true; upload: PresignedUpload; contentType: string } | { ok: false; error: string }
> {
  const valid = validateSource(input.filename, input.fileSize);
  if (!valid.ok) return { ok: false, error: valid.error! };

  const r = await api<PresignedUpload>("/v1/upload/presigned-url", {
    method: "POST",
    // fileSize MUST be a number — a quoted string is a documented 400.
    body: JSON.stringify({ filename: input.filename, contentType: valid.contentType, fileSize: input.fileSize }),
  });
  if (!r.ok) return r;
  if (!r.data.uploadUrl || !r.data.filename) return { ok: false, error: "The service accepted the request but returned no upload URL." };
  return { ok: true, upload: r.data, contentType: valid.contentType! };
}

// --- 2. push the bytes ------------------------------------------------------
// The Content-Type MUST match the one the URL was signed with — Cloud Storage
// rejects the PUT otherwise with an opaque error, so both come from one place.
export async function uploadToPresigned(uploadUrl: string, bytes: ArrayBuffer, contentType: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 403
          ? "The upload link expired before the file finished (they last 10 minutes). Try again."
          : `Upload failed (HTTP ${res.status}).`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}

// --- 3. confirm, and receive the gs:// URL the job will reference -----------
export async function confirmUpload(input: { filename: string; fileSize: number }): Promise<
  { ok: true; file: ConfirmedUpload } | { ok: false; error: string }
> {
  const r = await api<ConfirmedUpload>("/v1/upload/confirm", {
    method: "POST",
    body: JSON.stringify({ filename: input.filename, fileSize: input.fileSize }),
  });
  if (!r.ok) return r;
  if (!r.data.fileUrl) return { ok: false, error: "The upload was not confirmed — the service returned no file URL." };
  return { ok: true, file: r.data };
}

// The whole upload leg, for a file we hold in memory.
export async function uploadSource(filename: string, bytes: ArrayBuffer): Promise<
  { ok: true; fileUrl: string } | { ok: false; error: string }
> {
  const size = bytes.byteLength;
  const signed = await presignUpload({ filename, fileSize: size });
  if (!signed.ok) return signed;
  const put = await uploadToPresigned(signed.upload.uploadUrl, bytes, signed.contentType);
  if (!put.ok) return { ok: false, error: put.error! };
  // Confirm uses the SERVER's filename (timestamp-prefixed), not ours.
  const confirmed = await confirmUpload({ filename: signed.upload.filename, fileSize: size });
  if (!confirmed.ok) return confirmed;
  return { ok: true, fileUrl: confirmed.file.fileUrl };
}

// --- 4. create the job ------------------------------------------------------
export async function createTranscode(input: {
  inputUrls: string[];
  outputFormat: string;
  preset?: { quality?: string; resolution?: string };
}): Promise<{ ok: true; job: CloudJob } | { ok: false; error: string }> {
  if (!input.inputUrls.length) return { ok: false, error: "A render needs at least one input." };
  const r = await api<{ id?: string; status?: CloudJobStatus }>("/v1/transcodes", {
    method: "POST",
    body: JSON.stringify({
      inputs: input.inputUrls.map((url) => ({ url })),
      outputFormat: input.outputFormat,
      ...(input.preset ? { preset: input.preset } : {}),
    }),
  });
  if (!r.ok) return r;
  if (!r.data.id) return { ok: false, error: "The service accepted the job but returned no job id." };
  return { ok: true, job: { id: r.data.id, status: r.data.status || "pending" } };
}

// Submit ONE render pass from the shared recipes. This is the bridge between
// "what the job means" (ffmpeg-recipes.ts) and "how this vendor takes it".
//
// Two vendor facts shape it: the input arrives via `inputs` rather than -i, and
// filter_complex is unsupported — so a pass that composites a second source is
// refused here rather than submitted and billed to fail.
export async function submitPass(input: {
  pass: RenderPass;
  sourceUrl: string;       // gs:// or https URL already in their storage
  assetUrl?: string;       // the SRT / logo / B-roll URL, when the pass needs one
}): Promise<{ ok: true; job: CloudJob } | { ok: false; error: string }> {
  if (!passSupportedOnHostedApi(input.pass)) {
    return { ok: false, error: "Compositing a second video or image over the frame needs FFmpeg's filter_complex, which the hosted render service does not support. Run this one on the self-hosted render worker." };
  }
  let options: OptionPair[];
  try {
    options = toOptionPairs(input.pass, { asset: input.assetUrl });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Those render settings cannot be sent to the hosted service." };
  }

  const r = await api<{ id?: string; status?: CloudJobStatus }>("/v1/transcodes", {
    method: "POST",
    body: JSON.stringify({
      inputs: [{ url: input.sourceUrl }],
      outputFormat: outputFormatFor(input.pass),
      options,
    }),
  });
  if (!r.ok) return r;
  if (!r.data.id) return { ok: false, error: "The service accepted the job but returned no job id." };
  return { ok: true, job: { id: r.data.id, status: r.data.status || "pending" } };
}

// --- 5. poll ----------------------------------------------------------------
export async function getTranscode(jobId: string): Promise<{ ok: true; job: CloudJob } | { ok: false; error: string }> {
  const r = await api<{ jobId?: string; id?: string; status?: CloudJobStatus; outputUrl?: string; completedAt?: string; error?: string }>(
    `/v1/transcodes/${encodeURIComponent(jobId)}`,
  );
  if (!r.ok) return r;
  return {
    ok: true,
    job: {
      id: r.data.jobId || r.data.id || jobId,
      status: r.data.status || "pending",
      outputUrl: r.data.outputUrl,
      completedAt: r.data.completedAt,
      error: r.data.error,
    },
  };
}

// --- 6. a fresh signed download URL ----------------------------------------
// These expire in 10 minutes, so this is called at the moment the customer
// clicks download — never stored and handed out later.
export async function getDownloadUrl(jobId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await api<{ url?: string }>(`/v1/transcodes/${encodeURIComponent(jobId)}/download`);
  if (!r.ok) return r;
  if (!r.data.url) return { ok: false, error: "The render is not ready to download yet." };
  return { ok: true, url: r.data.url };
}

// Their status vocabulary → ours. Kept explicit so an unrecognised status is
// treated as still-running rather than silently reported as done.
export function toQueueStatus(s: CloudJobStatus | string): "queued" | "running" | "done" | "failed" {
  if (s === "completed") return "done";
  if (s === "failed") return "failed";
  if (s === "processing") return "running";
  return "queued";
}
