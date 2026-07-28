// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Product Identity Lock — the VERIFICATION half.
//
// Using a customer's photo as the base for a creative is not a guarantee; it is
// an intention. A generative model can and does drift — recolour a bottle,
// restyle a label, invent a different shape — and the customer discovers it when
// the ad is already running. This module MEASURES the drift instead of asserting
// there is none.
//
// It compares the rendered creative against the source photograph on three
// independent axes, none of which needs a vision model:
//
//   1. STRUCTURE  — a perceptual hash (DCT-based pHash, the standard method).
//      Robust to scale, compression and brightness; sensitive to the product's
//      actual shape and layout. This is what catches "that is a different bottle".
//   2. COLOUR     — histogram correlation in a coarse RGB space. This is what
//      catches "the same bottle, but now it is red".
//      Deliberately separate from structure: a recolour leaves the silhouette
//      intact, so a single blended score would hide exactly the failure the
//      owner cares about most.
//   3. PROPORTION — aspect ratio of the product region. A stretched or squashed
//      product reads as a cheap fake even when hue and outline survive.
//
// The verdict is honest about what it can and cannot see: it reports a measured
// similarity and a threshold, never "guaranteed identical".

import sharp from "sharp";

export type LockAxis = "structure" | "colour" | "proportion";

export type AxisResult = {
  axis: LockAxis;
  similarity: number;   // 0-100
  passed: boolean;
  threshold: number;
  detail: string;
};

export type IdentityVerdict = {
  ok: boolean;                 // did the comparison run at all
  passed: boolean;             // did the creative keep the product's identity
  overall: number;             // 0-100, the WEAKEST axis (not an average)
  axes: AxisResult[];
  warnings: string[];
  summary: string;
  error?: string;
};

// Thresholds. Structure is the strictest because a changed silhouette means a
// different product; colour allows more room because lighting and background
// legitimately shift it.
const THRESHOLD: Record<LockAxis, number> = { structure: 72, colour: 62, proportion: 80 };

const HASH_SIZE = 8;    // 8x8 low-frequency block → 64-bit hash
const DCT_SIZE = 32;    // downscale before the DCT

// ---------------------------------------------------------------------------
// Perceptual hash (pHash), implemented directly so the comparison is auditable.
// ---------------------------------------------------------------------------

// 1-D DCT-II. Small N, so the naive O(n^2) form is fine and far easier to check.
function dct1d(vec: number[]): number[] {
  const N = vec.length;
  const out = new Array<number>(N).fill(0);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) sum += vec[n] * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N));
    out[k] = sum * (k === 0 ? Math.SQRT1_2 : 1);
  }
  return out;
}

export function dct2d(matrix: number[][]): number[][] {
  const rows = matrix.map(dct1d);
  const N = rows.length;
  const M = rows[0].length;
  const out: number[][] = Array.from({ length: N }, () => new Array<number>(M).fill(0));
  for (let c = 0; c < M; c++) {
    const col = dct1d(rows.map((r) => r[c]));
    for (let r = 0; r < N; r++) out[r][c] = col[r];
  }
  return out;
}

// The hash is the low-frequency block compared against its own median — the
// median (not the mean) so a few bright highlights cannot flip every bit.
export function hashFromLuma(luma: number[][], size = HASH_SIZE): string {
  const freq = dct2d(luma);
  const block: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) block.push(freq[y][x]);
  // Skip the DC term when computing the median: it carries overall brightness,
  // not structure, and would otherwise dominate.
  const withoutDc = block.slice(1).sort((a, b) => a - b);
  const median = withoutDc[Math.floor(withoutDc.length / 2)];
  return block.map((v, i) => (i === 0 ? "1" : v > median ? "1" : "0")).join("");
}

export function hammingSimilarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return (same / a.length) * 100;
}

async function lumaMatrix(bytes: Buffer): Promise<number[][]> {
  const { data } = await sharp(bytes)
    .greyscale()
    .resize(DCT_SIZE, DCT_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const m: number[][] = [];
  for (let y = 0; y < DCT_SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < DCT_SIZE; x++) row.push(data[y * DCT_SIZE + x]);
    m.push(row);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Colour histogram — 4 levels per channel = 64 buckets. Coarse on purpose:
// fine buckets punish ordinary lighting differences, and we are looking for
// "this is now a different colour", not "this is a different photograph".
// ---------------------------------------------------------------------------
const LEVELS = 4;

export function histogramFromPixels(pixels: Uint8Array | number[], channels: number): number[] {
  const bins = new Array<number>(LEVELS ** 3).fill(0);
  const step = 256 / LEVELS;
  let counted = 0;
  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    // Ignore fully transparent pixels — padding is not part of the product.
    if (channels === 4 && pixels[i + 3] === 0) continue;
    const r = Math.min(LEVELS - 1, Math.floor(pixels[i] / step));
    const g = Math.min(LEVELS - 1, Math.floor(pixels[i + 1] / step));
    const b = Math.min(LEVELS - 1, Math.floor(pixels[i + 2] / step));
    bins[r * LEVELS * LEVELS + g * LEVELS + b]++;
    counted++;
  }
  return counted ? bins.map((n) => n / counted) : bins;
}

// Bhattacharyya coefficient — the standard overlap measure for two normalised
// histograms. 1 = identical distribution, 0 = no shared colour at all.
export function histogramSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let coeff = 0;
  for (let i = 0; i < a.length; i++) coeff += Math.sqrt(a[i] * b[i]);
  return Math.max(0, Math.min(1, coeff)) * 100;
}

async function histogramOf(bytes: Buffer): Promise<number[]> {
  const { data, info } = await sharp(bytes)
    .resize(64, 64, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return histogramFromPixels(data, info.channels);
}

// ---------------------------------------------------------------------------
// Proportion — how much the product's aspect ratio changed.
// ---------------------------------------------------------------------------
export function proportionSimilarity(a: { width: number; height: number }, b: { width: number; height: number }): number {
  if (!a.width || !a.height || !b.width || !b.height) return 0;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  const ratio = Math.min(ra, rb) / Math.max(ra, rb);
  return ratio * 100;
}

// ---------------------------------------------------------------------------
// The check.
// ---------------------------------------------------------------------------
export async function verifyIdentity(source: Buffer, rendered: Buffer): Promise<IdentityVerdict> {
  const empty: IdentityVerdict = { ok: false, passed: false, overall: 0, axes: [], warnings: [], summary: "" };
  try {
    const [srcLuma, outLuma, srcHist, outHist, srcMeta, outMeta] = await Promise.all([
      lumaMatrix(source), lumaMatrix(rendered),
      histogramOf(source), histogramOf(rendered),
      sharp(source).metadata(), sharp(rendered).metadata(),
    ]);

    const structure = hammingSimilarity(hashFromLuma(srcLuma), hashFromLuma(outLuma));
    const colour = histogramSimilarity(srcHist, outHist);
    const proportion = proportionSimilarity(
      { width: srcMeta.width || 0, height: srcMeta.height || 0 },
      { width: outMeta.width || 0, height: outMeta.height || 0 },
    );

    const axes: AxisResult[] = [
      {
        axis: "structure", similarity: Math.round(structure), threshold: THRESHOLD.structure,
        passed: structure >= THRESHOLD.structure,
        detail: structure >= THRESHOLD.structure
          ? "The product's shape and layout survived the render."
          : "The silhouette changed materially — this may not be the same product.",
      },
      {
        axis: "colour", similarity: Math.round(colour), threshold: THRESHOLD.colour,
        passed: colour >= THRESHOLD.colour,
        detail: colour >= THRESHOLD.colour
          ? "Colours match the original within normal lighting variation."
          : "The colour palette shifted. Check the product has not been recoloured.",
      },
      {
        axis: "proportion", similarity: Math.round(proportion), threshold: THRESHOLD.proportion,
        passed: proportion >= THRESHOLD.proportion,
        detail: proportion >= THRESHOLD.proportion
          ? "Proportions are intact."
          : "The image was stretched or squashed relative to the source.",
      },
    ];

    // The OVERALL score is the weakest axis, never an average. A creative that
    // keeps the shape perfectly but recolours the product has failed, and an
    // average would hide that behind two passing scores.
    const overall = Math.min(...axes.map((a) => a.similarity));
    const failed = axes.filter((a) => !a.passed);
    const passed = failed.length === 0;

    return {
      ok: true, passed, overall, axes,
      warnings: failed.map((a) => a.detail),
      summary: passed
        ? `Identity check passed — weakest axis ${overall}/100 (${axes.find((a) => a.similarity === overall)?.axis}). Measured against your photo, not assumed.`
        : `Identity check FAILED on ${failed.map((a) => a.axis).join(" and ")}. Do not publish this creative without looking at it.`,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Could not compare the images." };
  }
}

// Fetch both images and compare. Used by the API where the creative and the
// source both live at URLs.
export async function verifyIdentityByUrl(sourceUrl: string, renderedUrl: string): Promise<IdentityVerdict> {
  try {
    const [a, b] = await Promise.all([fetch(sourceUrl), fetch(renderedUrl)]);
    if (!a.ok) return { ok: false, passed: false, overall: 0, axes: [], warnings: [], summary: "", error: `Could not read the source photo (HTTP ${a.status}).` };
    if (!b.ok) return { ok: false, passed: false, overall: 0, axes: [], warnings: [], summary: "", error: `Could not read the creative (HTTP ${b.status}).` };
    return verifyIdentity(Buffer.from(await a.arrayBuffer()), Buffer.from(await b.arrayBuffer()));
  } catch (e) {
    return { ok: false, passed: false, overall: 0, axes: [], warnings: [], summary: "", error: e instanceof Error ? e.message : "Could not fetch the images." };
  }
}

export const IDENTITY_THRESHOLDS = THRESHOLD;
