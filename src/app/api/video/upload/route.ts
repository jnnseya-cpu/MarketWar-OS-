import { NextRequest, NextResponse } from "next/server";
import { presignUpload, confirmUpload, ffmpegCloudConfigured, validateSource } from "@/backend/ffmpeg-cloud";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

// Direct-to-storage video upload.
//
// Vercel functions cannot receive a video: the request body ceiling is a few
// megabytes and a marketing video is tens or hundreds. So the file never touches
// our server. The browser asks us for a signed URL, PUTs the bytes straight to
// Cloud Storage, then tells us it is done — and gets back the object reference a
// render job takes as its source.
//
//   POST { brandId, action:"sign",    filename, fileSize } → { uploadUrl, filename, contentType }
//   POST { brandId, action:"confirm", filename, fileSize } → { fileUrl, downloadUrl }
//
// `filename` on confirm is the one the SIGN step returned (it is prefixed), not
// the customer's original name.
//
// Uploading is free. It costs us storage the render vendor already provides, and
// charging someone to hand us their own file would be absurd — the render is
// what is metered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "video-upload"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const brandId = s("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!ffmpegCloudConfigured()) {
    return NextResponse.json({ error: "Video upload needs the hosted renderer configured (FFMPEG_CLOUD_API_KEY)." }, { status: 503 });
  }

  const filename = s("filename");
  // Byte counts must be JSON numbers — the vendor rejects a quoted size, and a
  // browser that sent one would otherwise get an opaque 400 from them.
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : Number.NaN;
  if (!filename) return NextResponse.json({ error: "filename is required" }, { status: 400 });
  if (!Number.isInteger(fileSize)) return NextResponse.json({ error: "fileSize must be a number of bytes" }, { status: 400 });

  const action = s("action") || "sign";

  if (action === "sign") {
    const valid = validateSource(filename, fileSize);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    const r = await presignUpload({ filename, fileSize });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({
      uploadUrl: r.upload.uploadUrl,
      // The STORAGE name, which confirm must be given back verbatim.
      filename: r.upload.filename,
      contentType: r.contentType,
      note: "PUT the file to uploadUrl with exactly this Content-Type, then call confirm with the filename returned here.",
    });
  }

  if (action === "confirm") {
    const r = await confirmUpload({ filename, fileSize });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({ fileUrl: r.file.fileUrl, downloadUrl: r.file.downloadUrl });
  }

  return NextResponse.json({ error: "Unknown action — use sign or confirm" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Direct-to-storage video upload",
    configured: ffmpegCloudConfigured(),
    flow: ["POST action:sign → uploadUrl", "PUT the file to uploadUrl", "POST action:confirm → fileUrl"],
    doctrine:
      "The file never passes through our servers — a Vercel function cannot receive a video. The browser uploads straight to Cloud Storage with a short-lived signed URL, so upload size is limited by the storage vendor rather than by us. Uploading is free; the render is what costs ACUs.",
  });
}
