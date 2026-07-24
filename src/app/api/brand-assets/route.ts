import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { resolveBrandAccess } from "@/backend/brand-access";
import { uploadPublicMedia, storageConfigured } from "@/backend/storage";
import { rateLimit, clientKey } from "@/backend/guard";

// Brand Asset upload — hosts a brand's OWN logo / product photo / media to
// Firebase Storage and returns a public URL the OS reuses across creatives.
// The brand's owner only (demo passes through). The client persists the returned
// URL onto the brand (logoUrl / productImageUrl / brandColours) via the brand
// context, so the asset exists "from the start" and every creative can use it.
//
// POST { brandId, assetType, dataUrl, fileName? } → { url } | { error }
//   dataUrl: a data: URI (base64) produced by the browser FileReader.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per asset upload
// SVG excluded on purpose: raw SVG can carry <script>, and it's hosted publicly
// verbatim — a stored-XSS vector. Raster + video only.
const ALLOWED = /^(image\/(png|jpe?g|webp|gif)|video\/(mp4|webm|quicktime))$/i;
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp",
  "image/svg+xml": "svg", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

// Parse a `data:<mime>;base64,<payload>` URI → { mime, buffer }.
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!m) return null;
  try {
    return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "brand-assets"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const assetType = typeof body.assetType === "string" ? body.assetType.trim() : "asset";
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  // Only the brand's owner may upload its assets (demo passes through).
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return NextResponse.json({ error: "Send the file as a base64 data: URL" }, { status: 400 });
  if (!ALLOWED.test(parsed.mime)) return NextResponse.json({ error: `Unsupported file type (${parsed.mime}). Use PNG/JPG/WEBP/SVG/GIF or MP4/WEBM.` }, { status: 415 });
  if (parsed.buffer.length > MAX_BYTES) return NextResponse.json({ error: "File too large — max 8 MB per asset." }, { status: 413 });

  const isImage = parsed.mime.startsWith("image/") && parsed.mime !== "image/svg+xml" && parsed.mime !== "image/gif";
  const ext = EXT[parsed.mime] || "bin";

  // The asset is returned INLINE (a compact resized data URL) so it ALWAYS
  // renders — thumbnails, and compositing into creatives — with zero dependency
  // on external hosting being publicly reachable. We ALSO best-effort host the
  // original (for social publishing, which needs a real URL); if hosting works
  // we return that too, but viewing never depends on it.
  let inlineUrl = dataUrl;
  if (isImage) {
    try {
      const maxDim = assetType === "logo" ? 640 : 1280;
      const png = await sharp(parsed.buffer).resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      inlineUrl = `data:image/webp;base64,${png.toString("base64")}`;
    } catch { /* keep the original data URL if resize fails */ }
  }

  let hostedUrl: string | null = null;
  if (storageConfigured()) {
    hostedUrl = await uploadPublicMedia(parsed.buffer, {
      contentType: parsed.mime, ext,
      keyPrefix: `brand-assets/${brandId}/${assetType}`,
      nameSeed: `${brandId}:${assetType}:${fileName}:${parsed.buffer.length}`,
    });
  }

  // `url` (what the client stores + renders) is the inline data URL — guaranteed
  // to display. `hostedUrl` is the postable URL for publishing when available.
  return NextResponse.json({ url: inlineUrl, hostedUrl, assetType, mime: parsed.mime, bytes: parsed.buffer.length });
}
