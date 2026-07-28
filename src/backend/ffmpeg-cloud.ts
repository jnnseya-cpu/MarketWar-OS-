// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Hosted FFmpeg (ffmpeg-micro) — a render executor that needs no container.
//
// The self-hosted worker (worker/) and this module do the SAME work from the
// SAME recipes (src/backend/ffmpeg-recipes.ts). The difference is only where the
// CPU lives: a container we deploy, or an HTTP API we call. Whichever is
// configured, the customer sees one Render Farm.
//
// This half — getting a local file into their storage — is implemented against
// the documented contract:
//   POST /v1/upload/presigned-url  { filename, contentType, fileSize }
//     → { uploadUrl, filename, fileSize }
//   PUT  <uploadUrl>  (Content-Type must match, URL expires in 15 minutes)

const BASE = (process.env.FFMPEG_CLOUD_URL || "https://api.ffmpeg-micro.com").replace(/\/$/, "");

// Their presigned URLs are signed for 15 minutes; upload well inside that.
export const PRESIGN_TTL_SEC = 900;
// Guard rail: a render source larger than this is a mistake, not a marketing
// video, and would burn the customer's ACUs on a transfer that times out.
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export type PresignedUpload = { uploadUrl: string; filename: string; fileSize: number };

function key(): string { return (process.env.FFMPEG_CLOUD_API_KEY || "").trim(); }
export function ffmpegCloudConfigured(): boolean { return Boolean(key()); }

// Content types their pipeline can actually decode. Anything else is rejected
// here so the customer is told before a job is queued and charged.
const ACCEPTED = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm",
]);

export function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    mkv: "video/x-matroska", avi: "video/x-msvideo",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  };
  return map[ext] || "application/octet-stream";
}

export function validateSource(filename: string, fileSize: number): { ok: boolean; contentType?: string; error?: string } {
  const name = (filename || "").trim();
  if (!name) return { ok: false, error: "The file needs a name." };
  if (!Number.isFinite(fileSize) || fileSize <= 0) return { ok: false, error: "That file appears to be empty." };
  if (fileSize > MAX_SOURCE_BYTES) {
    return { ok: false, error: `That file is ${(fileSize / 1073741824).toFixed(1)}GB — the limit is 2GB. Export a smaller version or trim it first.` };
  }
  const contentType = contentTypeFor(name);
  if (!ACCEPTED.has(contentType)) {
    return { ok: false, error: `${name.split(".").pop()?.toUpperCase() || "That"} files are not supported — use MP4, MOV, WebM, MKV or AVI.` };
  }
  return { ok: true, contentType };
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function errorFrom(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (res.status === 401 || res.status === 403) return "The hosted FFmpeg service rejected the API key. Check FFMPEG_CLOUD_API_KEY.";
  if (res.status === 429) return "The hosted FFmpeg service is rate limiting or your plan's quota is spent.";
  return body.message || body.error || `Hosted FFmpeg returned HTTP ${res.status}`;
}

// Ask for a signed URL to put a file into their input bucket.
export async function presignUpload(input: { filename: string; fileSize: number }): Promise<
  { ok: true; upload: PresignedUpload } | { ok: false; error: string }
> {
  if (!ffmpegCloudConfigured()) return { ok: false, error: "Hosted rendering needs FFMPEG_CLOUD_API_KEY." };
  const valid = validateSource(input.filename, input.fileSize);
  if (!valid.ok) return { ok: false, error: valid.error! };

  try {
    const res = await api("/v1/upload/presigned-url", {
      method: "POST",
      body: JSON.stringify({ filename: input.filename, contentType: valid.contentType, fileSize: input.fileSize }),
    });
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    const data = (await res.json()) as Partial<PresignedUpload>;
    if (!data.uploadUrl || !data.filename) {
      return { ok: false, error: "The service accepted the request but returned no upload URL." };
    }
    return { ok: true, upload: { uploadUrl: data.uploadUrl, filename: data.filename, fileSize: data.fileSize ?? input.fileSize } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach the hosted FFmpeg service." };
  }
}

// Push bytes to the signed URL. The Content-Type MUST match the one the URL was
// signed with — Google Cloud Storage rejects the PUT otherwise, and the error it
// returns is opaque, so we set it from the same function that signed it.
export async function uploadToPresigned(uploadUrl: string, bytes: ArrayBuffer, contentType: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 403
          ? "The upload link expired before the file finished (they last 15 minutes). Try again."
          : `Upload failed (HTTP ${res.status}).`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
