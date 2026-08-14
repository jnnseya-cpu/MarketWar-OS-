// Getting a photo IN, and a postable file OUT.
//
// THE TWO BREAKS THIS FIXES, both found by walking the journey a customer would
// have to complete to say "I uploaded my photos and it made me ads":
//
//   1. There was no way to put a picture in. The engine has supported a
//      full-bleed image layer with an automatic scrim since it shipped, and no
//      surface in the product ever offered an upload. Every ad the platform
//      could make was text on a flat colour, which for a travel business or a
//      restaurant is not an ad at all.
//
//   2. There was no way to get anything out. "Export" produced more SVG in the
//      browser. You cannot upload an SVG to Instagram, Facebook or WhatsApp —
//      they take PNG and JPEG. So a person could do all the work and end with a
//      file they could not post anywhere. An ad you cannot save is not an ad.
//
// Both halves run entirely in the browser: no upload endpoint, no storage
// bucket, no provider key, no cost. The picture never leaves the customer's
// machine except as part of their own ad document.

/** The longest edge we keep. Beyond this is detail no feed will ever show. */
const MAX_EDGE = 1_600;

/**
 * A data URI has to travel inside the ad document, which is stored and sent as
 * JSON. A 6MB phone photo becomes an 8MB base64 string and breaks everything
 * downstream quietly — so the picture is resized and re-encoded before it is
 * ever embedded, and the result is measured rather than hoped for.
 */
const MAX_BYTES = 900_000;

export type PreparedImage = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  /** What was done to it, in the words a person would use. */
  note: string;
};

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
    throw new Error("That file is not a photo. JPEG, PNG or WebP — the kind of thing your phone takes.");
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser will not let us process the picture.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Step the quality down until it fits. Stated as a loop rather than a single
  // guess because a guess is wrong for exactly the photos people actually have.
  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (byteLength(dataUrl) > MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  const bytes = byteLength(dataUrl);
  return {
    dataUrl, width, height, bytes,
    note: scale < 1
      ? `Resized from ${bitmap.width}×${bitmap.height} to ${width}×${height} and saved at ${Math.round(quality * 100)}% quality — ${Math.round(bytes / 1024)}KB. Feeds never show more than this, and the original is untouched on your device.`
      : `${width}×${height}, ${Math.round(bytes / 1024)}KB. Kept at full size.`,
  };
}

function byteLength(dataUrl: string): number {
  const b64 = dataUrl.split(",")[1] || "";
  return Math.floor((b64.length * 3) / 4);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* fall through to the img path */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture could not be read.")); };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Out — a real file
// ---------------------------------------------------------------------------

/**
 * Render an SVG string to PNG at the placement's real pixel size and save it.
 *
 * Drawn at the exact dimensions the placement declares rather than at whatever
 * the screen happens to be, because an ad exported at CSS size arrives on
 * Instagram soft and nobody can tell you why.
 */
export async function downloadPng(svg: string, width: number, height: number, filename: string): Promise<void> {
  const png = await svgToPngBlob(svg, width, height);
  saveBlob(png, filename.endsWith(".png") ? filename : `${filename}.png`);
}

/** The SVG itself, for anyone who wants the vector — a print shop, a designer. */
export function downloadSvg(svg: string, filename: string): void {
  saveBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename.endsWith(".svg") ? filename : `${filename}.svg`);
}

export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    // The usual cause is an external font or image reference inside the SVG.
    // Ours are inlined precisely so this cannot happen, and if it ever does the
    // person is told what went wrong rather than handed a blank square.
    i.onerror = () => reject(new Error("The ad could not be turned into an image. This usually means something in it points at a file that is not embedded."));
    i.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser will not let us render the image.");
  // A transparent PNG posted to a feed turns black on some apps and white on
  // others. The ad has its own background; this guarantees one exists.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be encoded."))), "image/png");
  });
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick — revoking immediately cancels the download in
  // some browsers, which looks exactly like the button not working.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A filename a person can find again: brand, placement, and what it says. */
export function adFilename(brand: string, placement: string, headline: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return [slug(brand) || "ad", slug(placement), slug(headline)].filter(Boolean).join("-") || "marketwar-ad";
}
