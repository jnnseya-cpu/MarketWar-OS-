import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { getVideoRender } from "@/backend/video-gateway";

// DOWNLOAD THE FINISHED MP4 — AS A FILE, NOT AS A WEB PAGE.
//
// THE FAULT THIS FIXES. The panel had a "Download MP4" button, and it was an
// `<a href={videoUrl} download>` pointing straight at Firebase Storage. The
// `download` attribute is IGNORED ON A CROSS-ORIGIN LINK — every browser
// enforces this — so the click navigated to storage instead, the browser saw
// `Content-Type: video/mp4` and played it in a tab. The owner's report was
// exactly that: a video they had paid for, playing at a googleapis URL, with
// no way to get it onto their machine.
//
// The attribute cannot be made to work across origins, so the bytes come back
// through OUR origin instead. Same-origin plus `Content-Disposition:
// attachment` is what actually saves a file, and it lets the file arrive with
// a name a person can find again rather than `e0f55b83.mp4`.
//
// WHAT IT WILL NOT DO: fetch an arbitrary URL. It takes a jobId, checks the
// caller owns that brand, and downloads only the address the render itself
// recorded — on our own storage host. A route that streamed whatever URL it was
// handed would be an open proxy wearing an authentication check.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Only ever our own storage. The URL comes from our own job record, and this
 *  is the second lock: a corrupted or tampered record still cannot make this
 *  route fetch somebody else's server. */
const ALLOWED_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);

/** A filename a person can find again, from what was actually rendered. */
function fileNameFor(job: { prompt?: string; requestedSeconds?: number; seconds?: number; jobId?: string }): string {
  const words = String(job.prompt || "")
    .split("\n")[0]                       // the brand-expanded prompt is multi-line
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-").filter(Boolean).slice(0, 6).join("-");
  const secs = job.requestedSeconds ?? job.seconds;
  return `marketwar-${words || "video"}${secs ? `-${secs}s` : ""}.mp4`;
}

export async function GET(req: NextRequest) {
  const jobId = (req.nextUrl.searchParams.get("jobId") || "").trim();
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

  const job = await getVideoRender(jobId);
  if ("error" in job) return NextResponse.json(job, { status: 404 });

  // Same ownership rule as the status route: a guessable jobId must not hand
  // one tenant another tenant's video.
  const brandId = job.brandId || "";
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const url = job.videoUrl || "";
  if (!url) {
    return NextResponse.json({ error: "This render has no finished file yet." }, { status: 409 });
  }
  let host = "";
  try { host = new URL(url).hostname; } catch { host = ""; }
  if (!ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ error: "That render's file is not on this platform's storage, so it will not be proxied." }, { status: 400 });
  }

  const upstream = await fetch(url).catch(() => null);
  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: "The stored file could not be read just now. Try again in a moment." }, { status: 502 });
  }

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      // THE HEADER THAT ACTUALLY SAVES IT. Without this the browser plays the
      // video, which is what it was doing.
      "Content-Disposition": `attachment; filename="${fileNameFor(job)}"`,
      "Content-Length": String(bytes.byteLength),
      // The customer's own creative — never cached by a shared proxy.
      "Cache-Control": "private, no-store",
    },
  });
}
