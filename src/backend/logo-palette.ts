// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Read a brand's real colours out of the logo it already uploaded.
//
// The guidelines sheet used to ask for hex codes and mark them [TO SUPPLY]
// whenever nobody had typed them — which is most of the time. But the colours
// were already sitting in the file: the customer uploaded their logo at
// onboarding and nothing ever read a pixel of it.
//
// MEASURED, NOT GUESSED — the same rule as everywhere else. These are the
// colours actually present in the image, counted. If the logo cannot be read,
// the answer is "we could not read it", never a plausible palette. A guessed
// hex code becomes the brand the moment a designer builds to it.

import sharp from "sharp";

export type ExtractedColour = {
  hex: string;
  /** Share of the image's non-transparent pixels, 0–100. */
  share: number;
  /** Perceived lightness 0–100, so a caller can tell ink from paper. */
  lightness: number;
};

export type PaletteResult = {
  ok: boolean;
  colours: ExtractedColour[];
  /** The one to use as the accent: the most-used colour that is neither near-white nor near-black. */
  accent?: string;
  reason?: string;
  note: string;
};

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** WCAG relative luminance, scaled to 0–100. Used to separate ink from paper, not to score contrast. */
export function lightnessOf(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return Math.round((0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)) * 100);
}

/** How colourful, 0–255. Near-zero is a grey, and a grey is not a brand accent. */
export function chromaOf(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/**
 * Pick the accent.
 *
 * Not simply "the most common colour" — that is almost always the background,
 * and a guidelines sheet whose accent is #ffffff is useless. The accent is the
 * most-used colour that carries actual chroma; if the logo is genuinely
 * monochrome, the darkest substantial colour is returned instead, because a
 * black wordmark's accent really is black.
 */
export function pickAccent(colours: ExtractedColour[], rgbOf: (hex: string) => [number, number, number]): string | undefined {
  const chromatic = colours.filter((c) => chromaOf(...rgbOf(c.hex)) >= 28 && c.lightness > 4 && c.lightness < 92);
  if (chromatic.length) return chromatic[0].hex;
  const inks = colours.filter((c) => c.lightness < 55);
  return (inks[0] || colours[0])?.hex;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Count the colours in an image buffer.
 *
 * Quantised to a coarse grid before counting: an anti-aliased logo contains
 * thousands of near-identical shades, and counting them raw returns a hundred
 * variants of the same green rather than the green.
 */
export function countColours(pixels: Uint8Array | Buffer, channels: number, opts: { step?: number } = {}): ExtractedColour[] {
  const step = opts.step ?? 24;
  const bucket = new Map<string, { r: number; g: number; b: number; n: number }>();
  let counted = 0;
  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    const a = channels === 4 ? pixels[i + 3] : 255;
    // Transparent padding is not a brand colour. Most logos are mostly padding.
    if (a < 128) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = `${Math.round(r / step)}|${Math.round(g / step)}|${Math.round(b / step)}`;
    const cur = bucket.get(key);
    if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.n++; }
    else bucket.set(key, { r, g, b, n: 1 });
    counted++;
  }
  if (!counted) return [];
  return [...bucket.values()]
    .sort((x, y) => y.n - x.n)
    .slice(0, 8)
    .map((c) => {
      const r = c.r / c.n, g = c.g / c.n, b = c.b / c.n;
      return {
        hex: toHex(r, g, b),
        share: Math.round((c.n / counted) * 100),
        lightness: lightnessOf(r, g, b),
      };
    })
    // A colour occupying under 2% of the mark is a shadow or an artefact.
    .filter((c) => c.share >= 2);
}

export async function extractLogoPalette(
  logoUrl: string,
  deps: { fetchImage?: (url: string) => Promise<Buffer | null> } = {},
): Promise<PaletteResult> {
  const url = (logoUrl || "").trim();
  if (!url) {
    return { ok: false, colours: [], reason: "no-logo", note: "No logo is uploaded, so there are no colours to read from one." };
  }

  const get = deps.fetchImage ?? (async (u: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(u, { signal: ctrl.signal, redirect: "follow" });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch { return null; } finally { clearTimeout(t); }
  });

  const buf = await get(url);
  if (!buf || !buf.length) {
    return {
      ok: false, colours: [], reason: "unreadable",
      note: "Your logo could not be downloaded, so its colours could not be read. Nothing is guessed — a made-up hex code becomes your brand the moment a designer builds to it.",
    };
  }

  try {
    // Downscaled first: a 4000px logo is millions of pixels to answer a question
    // that 128px answers identically, and the whole point is to be cheap enough
    // to run on every kit build.
    const { data, info } = await sharp(buf)
      .resize(128, 128, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colours = countColours(data, info.channels);
    if (!colours.length) {
      return { ok: false, colours: [], reason: "empty", note: "The logo has no readable non-transparent pixels." };
    }
    return {
      ok: true,
      colours,
      accent: pickAccent(colours, hexToRgb),
      note: `Read from your logo: ${colours.length} colour(s), counted from the actual pixels rather than guessed. Check them before handing them to a designer — an anti-aliased edge can shift a shade slightly.`,
    };
  } catch (e) {
    return {
      ok: false, colours: [], reason: "decode-failed",
      note: `Your logo could not be decoded (${(e as Error).message}). Upload a PNG, JPG or WebP and try again.`,
    };
  }
}
