import { NextRequest, NextResponse } from "next/server";

// Same-origin download proxy — forces a real "Save file" for hosted media.
//
// A browser `fetch()` of a Firebase Storage URL is blocked by CORS unless the
// bucket is specially configured, so the client's blob-download silently fell
// back to opening the image in a tab. This route fetches the file SERVER-side
// (no CORS) and streams it back with Content-Disposition: attachment, so the
// browser downloads it — no bucket config required.
//
// SSRF-safe: only fetches from an allowlist of known media hosts (Firebase
// Storage + Google Cloud Storage), never an arbitrary URL.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOST_SUFFIXES = [
  "firebasestorage.googleapis.com",
  "firebasestorage.app",
  "storage.googleapis.com",
  "googleusercontent.com",
];

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`) || h.endsWith(s));
}

function safeName(name: string): string {
  const n = (name || "").replace(/[^\w.\-]+/g, "_").replace(/_{2,}/g, "_").slice(0, 120);
  return n || "download";
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") || "";
  const name = safeName(req.nextUrl.searchParams.get("name") || "");
  if (!raw) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let target: URL;
  try { target = new URL(raw); } catch { return NextResponse.json({ error: "Invalid url" }, { status: 400 }); }
  if (target.protocol !== "https:") return NextResponse.json({ error: "Only https URLs are allowed" }, { status: 400 });
  if (!hostAllowed(target.hostname)) return NextResponse.json({ error: "Host not allowed" }, { status: 403 });

  try {
    // Bypass every cache on the way to the origin — a re-rendered creative must
    // never come back as the previously cached copy.
    const upstream = await fetch(target.toString(), { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    // Give the file a sensible extension if the name lacks one.
    let filename = name;
    if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
      const ext = contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : contentType.includes("mp4") ? "mp4" : contentType.includes("pdf") ? "pdf" : "bin";
      filename = `${filename}.${ext}`;
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "download failed" }, { status: 502 });
  }
}
