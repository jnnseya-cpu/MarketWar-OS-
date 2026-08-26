import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { getWork } from "@/backend/work-library";

// DOWNLOAD A SAVED MEDIA ASSET OUT OF THE WORK LIBRARY — AS A FILE.
//
// THE FAULT THIS FIXES. The library's download button writes `item.output` to a
// Markdown file. For everything the library held until now that was right: the
// output IS the deliverable, a document. A video's output is a URL, so the
// button handed the owner a .md file containing one line of text — while the
// video itself sat one click away, playing in a browser tab because a
// cross-origin `download` attribute does nothing.
//
// "I need to download this as it is saved now" is the whole requirement. The
// bytes come back through our own origin with Content-Disposition: attachment,
// which is the only thing that makes a browser save rather than play.
//
// It is deliberately generic: any library item whose output is a media URL on
// our own storage downloads through here. Video is simply the first kind that
// needed it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Only ever our own storage — never a URL from anywhere else. */
const ALLOWED_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);

const TYPES: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  pdf: "application/pdf",
};

/**
 * The first storage URL in a saved output.
 *
 * A multi-clip render stores one URL per line, so `?n=` picks which. Anything
 * that is not a URL on our own storage is not returned at all — the host check
 * below is the lock, this is just the reader.
 */
function urlsIn(output: string): string[] {
  return String(output || "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => /^https?:\/\//i.test(t));
}

/** A filename a person can find again, from the item's own title. */
function fileNameFor(title: string, ext: string): string {
  const words = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-").filter(Boolean).slice(0, 8).join("-");
  return `${words || "marketwar-asset"}.${ext}`;
}

export async function GET(req: NextRequest) {
  const brandId = (req.nextUrl.searchParams.get("brandId") || "").trim();
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!brandId || !id) return NextResponse.json({ error: "brandId and id are required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const item = await getWork(brandId, id);
  if (!item) return NextResponse.json({ error: "That item is not in this brand's library." }, { status: 404 });

  const urls = urlsIn(item.output);
  const n = Math.max(0, Math.min(urls.length - 1, Number(req.nextUrl.searchParams.get("n") || 0) || 0));
  const url = urls[n];
  if (!url) {
    return NextResponse.json({ error: "This item is a document, not a file — use the Markdown download." }, { status: 409 });
  }

  let host = "";
  try { host = new URL(url).hostname; } catch { host = ""; }
  if (!ALLOWED_HOSTS.has(host)) {
    // A saved output could contain any link the engine wrote into it. Streaming
    // one would make this route fetch arbitrary servers on our behalf.
    return NextResponse.json({ error: "That file is not on this platform's storage, so it will not be proxied." }, { status: 400 });
  }

  const upstream = await fetch(url).catch(() => null);
  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: "The stored file could not be read just now. Try again in a moment." }, { status: 502 });
  }

  // The extension comes from the stored PATH, not from anything a caller sent.
  const ext = (decodeURIComponent(url).match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] || "mp4").toLowerCase();
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileNameFor(item.title, ext)}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
