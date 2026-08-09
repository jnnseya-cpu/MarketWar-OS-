// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The ad canvas — a generated ad you can still change.
//
// THE GAP THIS CLOSES. Every image path in this platform ends the same way: the
// gateway returns a picture, and the picture is flat. One typo in the headline,
// one price that moved, one logo that landed in the wrong corner, and the only
// remedy is to generate it again — a new provider call, a new ACU, a new
// composition that is not quite the one you liked. That is the single most
// expensive thing about generated advertising and it has nothing to do with the
// model.
//
// SO AN AD HERE IS A DOCUMENT, NOT A PICTURE. Background, product shot, colour
// bands, headline, offer, CTA and logo are separate LAYERS. Editing a headline
// edits a string. It costs nothing, calls nobody, and cannot change the picture
// underneath it.
//
// COORDINATES ARE RELATIVE, WHICH IS WHY RESIZING IS REAL. Every layer is placed
// in fractions of the frame with an anchor, so a 1:1 feed ad becomes a 9:16
// story by RE-LAYING-OUT — text reflows, the safe area is respected, the logo
// stays in its corner. It is not a centre crop with the headline sliced off,
// which is what "auto-resize" usually means.
//
// AND THE CHECKS ARE MEASUREMENTS. Contrast is the WCAG ratio, computed. Safe
// areas are the platforms' own published numbers. Text length is counted. The
// one estimate in here — how wide a line of text will be — says it is an
// estimate everywhere it appears, and is deliberately pessimistic so it warns
// early rather than reassuring wrongly.

import { claimReport, type ClaimFinding } from "@/backend/claim-guard";

// ---------------------------------------------------------------------------
// Placements
//
// Sizes are the platforms' current spec. Safe insets are the fractions of the
// frame their own UI covers — the caption, the profile row, the action rail —
// taken from each platform's published creative guidance. They move when the
// apps redesign, which is why they are one table and not scattered through the
// renderer.
// ---------------------------------------------------------------------------
export type PlacementId =
  | "feed-square" | "feed-portrait" | "story" | "reel" | "tiktok"
  | "shorts" | "landscape" | "pin" | "email-banner";

export type Placement = {
  id: PlacementId;
  label: string;
  width: number;
  height: number;
  ratio: string;
  usedFor: string;
  /** Fractions of the frame covered by the app's own chrome. */
  safe: { top: number; bottom: number; left: number; right: number };
  safeNote: string;
};

export const PLACEMENTS: Placement[] = [
  {
    id: "feed-square", label: "Feed square", width: 1080, height: 1080, ratio: "1:1",
    usedFor: "Facebook and Instagram feed, LinkedIn, X",
    safe: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    safeNote: "No app chrome sits on a feed image. The 5% is a margin so nothing looks bolted to the edge.",
  },
  {
    id: "feed-portrait", label: "Feed portrait", width: 1080, height: 1350, ratio: "4:5",
    usedFor: "Instagram and Facebook feed — the tallest a feed post is allowed to be",
    safe: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    safeNote: "Takes more vertical space in the feed than a square for the same scroll. No chrome overlap.",
  },
  {
    id: "story", label: "Story", width: 1080, height: 1920, ratio: "9:16",
    usedFor: "Instagram and Facebook Stories",
    safe: { top: 0.14, bottom: 0.2, left: 0.06, right: 0.06 },
    safeNote: "Meta's guidance: the top 14% carries the profile row and the bottom 20% the reply bar. Anything you put there is under a button.",
  },
  {
    id: "reel", label: "Reel", width: 1080, height: 1920, ratio: "9:16",
    usedFor: "Instagram and Facebook Reels",
    safe: { top: 0.14, bottom: 0.35, left: 0.06, right: 0.14 },
    safeNote: "Reels reserve far more of the bottom than Stories — Meta's guidance is 35% — because the caption, audio row and CTA all stack there. The right edge carries the action rail.",
  },
  {
    id: "tiktok", label: "TikTok", width: 1080, height: 1920, ratio: "9:16",
    usedFor: "TikTok in-feed",
    safe: { top: 0.07, bottom: 0.25, left: 0.04, right: 0.13 },
    safeNote: "TikTok's own creative guidance: roughly 130px of 1920 at the top, 480px at the bottom for the caption block, and 140px of 1080 on the right for the icon rail.",
  },
  {
    id: "shorts", label: "YouTube Shorts", width: 1080, height: 1920, ratio: "9:16",
    usedFor: "YouTube Shorts",
    safe: { top: 0.06, bottom: 0.24, left: 0.05, right: 0.12 },
    safeNote: "The title, channel row and subscribe button occupy the bottom quarter; the like/comment rail runs up the right.",
  },
  {
    id: "landscape", label: "Landscape", width: 1200, height: 628, ratio: "1.91:1",
    usedFor: "Link previews, LinkedIn, display, Google Ads image extensions",
    safe: { top: 0.06, bottom: 0.06, left: 0.05, right: 0.05 },
    safeNote: "Often shown as a thumbnail a fifth of this size. If the headline is unreadable at 240px wide it is unreadable where it runs.",
  },
  {
    id: "pin", label: "Pinterest", width: 1000, height: 1500, ratio: "2:3",
    usedFor: "Pinterest standard pin",
    safe: { top: 0.05, bottom: 0.08, left: 0.05, right: 0.05 },
    safeNote: "The bottom carries the saved-by row in some views.",
  },
  {
    id: "email-banner", label: "Email banner", width: 1200, height: 400, ratio: "3:1",
    usedFor: "The hero image in a campaign email",
    safe: { top: 0.06, bottom: 0.06, left: 0.04, right: 0.04 },
    safeNote: "Half of email opens block images by default, so this banner must never carry the only copy of the offer.",
  },
];

export const placement = (id: PlacementId): Placement =>
  PLACEMENTS.find((p) => p.id === id) || PLACEMENTS[0];

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------
export type Anchor =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type LayerRole =
  | "background" | "product" | "band" | "headline" | "subhead"
  | "offer" | "cta" | "logo" | "legal" | "free";

type Base = {
  id: string;
  role: LayerRole;
  /** Fractions of the frame: 0 = left/top edge, 1 = right/bottom edge. */
  x: number;
  y: number;
  /** Fraction of the frame width the layer may occupy. */
  w: number;
  anchor: Anchor;
  hidden?: boolean;
  /** Layers the customer has hand-placed are not moved by refit. */
  pinned?: boolean;
};

export type TextLayer = Base & {
  kind: "text";
  text: string;
  /** Font size as a fraction of frame HEIGHT, so it scales with the frame. */
  sizeEm: number;
  colour: string;
  weight: 400 | 500 | 600 | 700 | 800 | 900;
  align: "left" | "center" | "right";
  lineHeight: number;
  uppercase?: boolean;
  /** A solid plate behind the text — the cheapest fix for a contrast failure. */
  plate?: { colour: string; padEm: number; radiusEm: number };
};

export type ImageLayer = Base & {
  kind: "image";
  href: string;
  /** Fraction of the frame height. Omitted on a background, which fills. */
  h?: number;
  fit: "cover" | "contain";
  opacity?: number;
};

export type ShapeLayer = Base & {
  kind: "shape";
  h: number;
  colour: string;
  opacity?: number;
  radiusEm?: number;
};

export type Layer = TextLayer | ImageLayer | ShapeLayer;

export type AdDoc = {
  id: string;
  brandId: string;
  placementId: PlacementId;
  /** Painted behind everything, so a contain-fit product never shows white. */
  background: string;
  layers: Layer[];
  /** Where the artwork came from — never guessed. */
  origin: { kind: "generated" | "uploaded" | "blank"; provider?: string; prompt?: string };
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Colour — real arithmetic, because contrast is the one thing in a static ad
// that is objectively right or wrong.
// ---------------------------------------------------------------------------
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio, 1–21. Exact, not an impression. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Black or white, whichever is legible on this colour. Deterministic. */
export function readableOn(bg: string): "#ffffff" | "#000000" {
  return contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg) ? "#ffffff" : "#000000";
}

// ---------------------------------------------------------------------------
// Text measurement
//
// AN ESTIMATE, AND LABELLED AS ONE EVERYWHERE IT SURFACES. Only the renderer
// knows the real advance widths, and the renderer is the customer's browser.
// What this does is give a pessimistic width so wrapping and the overflow
// warning fire EARLY. A warning that arrives too late is worse than none.
// ---------------------------------------------------------------------------
const NARROW = new Set("iljtfr!.,;:'|()[]I ".split(""));
const WIDE = new Set("mwMW@%".split(""));

/** Width of one line, in em, for a humanist sans at the given weight. Estimate. */
export function estimateWidthEm(s: string, weight = 700): number {
  let w = 0;
  for (const ch of s) {
    if (ch === " ") w += 0.27;
    else if (NARROW.has(ch)) w += 0.3;
    else if (WIDE.has(ch)) w += 0.88;
    else if (ch >= "A" && ch <= "Z") w += 0.68;
    else if (ch >= "0" && ch <= "9") w += 0.56;
    else w += 0.54;
  }
  // Heavier weights are wider; and 4% of headroom so the estimate errs toward
  // "this will not fit" rather than toward a headline running off the frame.
  return w * (1 + (weight - 400) * 0.00035) * 1.04;
}

export type WrapResult = { lines: string[]; widestEm: number; overflowed: boolean };

/** Greedy wrap to a width in em. A single word longer than the line is kept whole and reported. */
export function wrapText(text: string, maxEm: number, weight = 700): WrapResult {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  let overflowed = false;
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (estimateWidthEm(next, weight) <= maxEm || !cur) {
      if (!cur && estimateWidthEm(word, weight) > maxEm) overflowed = true;
      cur = next;
    } else {
      lines.push(cur);
      cur = word;
      if (estimateWidthEm(word, weight) > maxEm) overflowed = true;
    }
  }
  if (cur) lines.push(cur);
  const widestEm = lines.reduce((m, l) => Math.max(m, estimateWidthEm(l, weight)), 0);
  return { lines: lines.length ? lines : [""], widestEm, overflowed };
}

/**
 * Shrink a text layer until its estimated block fits the box. Returns the size
 * actually used — never below `minEm`, because text nobody can read is not a
 * fix, and if it will not fit at the floor the caller is told.
 */
export function autoFit(layer: TextLayer, frame: Placement, maxLines = 4, minEm = 0.02): { sizeEm: number; lines: string[]; fits: boolean } {
  const boxPx = layer.w * frame.width;
  let size = layer.sizeEm;
  for (let i = 0; i < 40; i++) {
    const px = size * frame.height;
    const { lines } = wrapText(display(layer), boxPx / px, layer.weight);
    if (lines.length <= maxLines) return { sizeEm: size, lines, fits: true };
    if (size <= minEm) {
      return { sizeEm: minEm, lines: wrapText(display(layer), boxPx / (minEm * frame.height), layer.weight).lines, fits: false };
    }
    size = Math.max(minEm, size * 0.94);
  }
  const px = minEm * frame.height;
  return { sizeEm: minEm, lines: wrapText(display(layer), boxPx / px, layer.weight).lines, fits: false };
}

const display = (l: TextLayer) => (l.uppercase ? (l.text || "").toUpperCase() : l.text || "");

// ---------------------------------------------------------------------------
// Rendering
//
// SVG, server-side, deterministic — the same document renders the same string
// every time, which is what makes it testable. Every value the customer typed
// is escaped, and every href is scheme-checked: this string is handed to a
// browser, so an unescaped quote is not a formatting bug, it is an injection.
// ---------------------------------------------------------------------------
const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** https and data:image only. A javascript: or blob: href has no business in an exported ad. */
export function safeHref(href: string): string | null {
  const h = (href || "").trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(h)) return h;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(h)) return h;
  return null;
}

function anchorXY(l: Base, frame: Placement, blockW: number, blockH: number): { x: number; y: number } {
  const px = l.x * frame.width, py = l.y * frame.height;
  const [v, h] = l.anchor.split("-");
  const x = h === "center" ? px - blockW / 2 : h === "right" ? px - blockW : px;
  const y = v === "center" ? py - blockH / 2 : v === "bottom" ? py - blockH : py;
  return { x, y };
}

export function renderSvg(doc: AdDoc): string {
  const frame = placement(doc.placementId);
  const parts: string[] = [];
  parts.push(`<rect width="${frame.width}" height="${frame.height}" fill="${esc(doc.background || "#0b0f1a")}"/>`);

  for (const l of doc.layers) {
    if (l.hidden) continue;
    if (l.kind === "image") parts.push(renderImage(l, frame));
    else if (l.kind === "shape") parts.push(renderShape(l, frame));
    else parts.push(renderText(l, frame));
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" font-family="Inter, Helvetica, Arial, sans-serif">`,
    ...parts,
    `</svg>`,
  ].join("");
}

function renderImage(l: ImageLayer, frame: Placement): string {
  const href = safeHref(l.href);
  if (!href) return `<!-- image layer ${esc(l.id)} skipped: unsupported href scheme -->`;
  const w = l.w * frame.width;
  const h = (l.h ?? 1) * frame.height;
  const { x, y } = anchorXY(l, frame, w, h);
  const preserve = l.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  const op = l.opacity != null ? ` opacity="${clamp01(l.opacity)}"` : "";
  return `<image href="${esc(href)}" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" preserveAspectRatio="${preserve}"${op}/>`;
}

function renderShape(l: ShapeLayer, frame: Placement): string {
  const w = l.w * frame.width, h = l.h * frame.height;
  const { x, y } = anchorXY(l, frame, w, h);
  const r = (l.radiusEm ?? 0) * frame.height;
  const op = l.opacity != null ? ` opacity="${clamp01(l.opacity)}"` : "";
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${round(r)}" fill="${esc(l.colour)}"${op}/>`;
}

function renderText(l: TextLayer, frame: Placement): string {
  const px = l.sizeEm * frame.height;
  const boxW = l.w * frame.width;
  const { lines } = wrapText(display(l), boxW / px, l.weight);
  const lh = px * (l.lineHeight || 1.15);
  const blockH = lh * lines.length;
  const { x, y } = anchorXY(l, frame, boxW, blockH);
  const anchorAttr = l.align === "center" ? "middle" : l.align === "right" ? "end" : "start";
  const tx = l.align === "center" ? x + boxW / 2 : l.align === "right" ? x + boxW : x;

  const out: string[] = [];
  if (l.plate) {
    const pad = (l.plate.padEm || 0.5) * px;
    const widest = lines.reduce((m, s) => Math.max(m, estimateWidthEm(s, l.weight)), 0) * px;
    const pw = Math.min(boxW + pad * 2, widest + pad * 2);
    const plateX = l.align === "center" ? x + boxW / 2 - pw / 2 : l.align === "right" ? x + boxW - pw : x;
    out.push(`<rect x="${round(plateX)}" y="${round(y - pad * 0.6)}" width="${round(pw)}" height="${round(blockH + pad * 1.2)}" rx="${round((l.plate.radiusEm || 0.1) * px)}" fill="${esc(l.plate.colour)}"/>`);
  }

  const tspans = lines
    .map((line, i) => `<tspan x="${round(tx)}" dy="${i === 0 ? round(px * 0.8) : round(lh)}">${esc(line)}</tspan>`)
    .join("");
  out.push(
    `<text x="${round(tx)}" y="${round(y)}" fill="${esc(l.colour)}" font-size="${round(px)}" font-weight="${l.weight}" text-anchor="${anchorAttr}" xml:space="preserve">${tspans}</text>`,
  );
  return out.join("");
}

const round = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ---------------------------------------------------------------------------
// The checks
//
// Each one is a measurement with the number shown. Nothing here is a score.
// ---------------------------------------------------------------------------
export type CanvasFinding = {
  severity: "blocking" | "warning" | "note";
  layerId?: string;
  title: string;
  detail: string;
  /** The one-click repair, when there is one. */
  fix?: { action: "auto-fit" | "add-plate" | "move-into-safe" | "flip-colour" | "edit-text"; label: string };
};

export type CanvasCheck = {
  findings: CanvasFinding[];
  publishable: boolean;
  measured: { label: string; value: string }[];
  claims: ClaimFinding[];
  doctrine: string;
};

/** Alpha-composite `fg` over `bg`. Exact sRGB blend, so a scrim can be reasoned about. */
export function composite(fg: string, bg: string, alpha: number): string {
  const f = parseHex(fg), b = parseHex(bg);
  if (!f || !b) return bg;
  const a = clamp01(alpha);
  const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a));
  return `#${[mix(f.r, b.r), mix(f.g, b.g), mix(f.b, b.b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * What is underneath a layer.
 *
 * Three answers, and the middle one is the interesting one. A SOLID background
 * gives an exact contrast ratio. A PHOTOGRAPH gives none — it is different
 * colours in different places and the one under this line is not knowable from
 * the document. But a SCRIM over a photograph is neither: the photo can be any
 * colour, so the composite is bounded by the scrim over black and the scrim
 * over white, and the WORSE of those two is a floor that holds whatever the
 * picture turns out to be. "We cannot know" becomes "it is at least this good",
 * which is the difference between a warning you ignore and a number you use.
 */
type Underneath =
  | { kind: "solid"; colour: string }
  | { kind: "scrim"; colour: string; alpha: number }
  | { kind: "photo" };

function overlaps(doc: AdDoc, a: Layer, box: { x: number; y: number; w: number; h: number }): boolean {
  const frame = placement(doc.placementId);
  const w = a.w * frame.width;
  const h = a.kind === "text" ? 0 : (a.kind === "shape" ? a.h : (a.h ?? 1)) * frame.height;
  const b = anchorXY(a, frame, w, h);
  return box.x < b.x + w && box.x + box.w > b.x && box.y < b.y + h && box.y + box.h > b.y;
}

function resolveUnder(doc: AdDoc, stack: Layer[], box: { x: number; y: number; w: number; h: number }): Underneath {
  for (let i = 0; i < stack.length; i++) {
    const s = stack[i];
    if (s.hidden || s.kind === "text") continue;
    if (!overlaps(doc, s, box)) continue;
    if (s.kind === "image") return (s.opacity ?? 1) >= 0.99 ? { kind: "photo" } : { kind: "photo" };
    const a = s.opacity ?? 1;
    if (a >= 0.99) return { kind: "solid", colour: s.colour };
    const under = resolveUnder(doc, stack.slice(i + 1), box);
    if (under.kind === "solid") return { kind: "solid", colour: composite(s.colour, under.colour, a) };
    return { kind: "scrim", colour: s.colour, alpha: under.kind === "scrim" ? Math.min(1, a + under.alpha * (1 - a)) : a };
  }
  return { kind: "solid", colour: doc.background };
}

function behind(doc: AdDoc, l: TextLayer): Underneath {
  if (l.plate) return { kind: "solid", colour: l.plate.colour };
  const frame = placement(doc.placementId);
  const px = l.sizeEm * frame.height;
  const boxW = l.w * frame.width;
  const { lines } = wrapText(display(l), boxW / px, l.weight);
  const blockH = px * (l.lineHeight || 1.15) * lines.length;
  const b = anchorXY(l, frame, boxW, blockH);
  const box = { x: b.x, y: b.y, w: boxW, h: blockH };

  // Top of the stack downward — the first thing that actually sits under THIS
  // block. A logo in the opposite corner is not underneath anything.
  const i = doc.layers.findIndex((x) => x.id === l.id);
  const below = doc.layers.slice(0, i < 0 ? doc.layers.length : i).reverse();
  return resolveUnder(doc, below, box);
}

/**
 * The contrast a text layer is guaranteed, and how sure we are of it.
 * `floor` is the worst case; on a solid background the worst case is the case.
 */
export function contrastFor(doc: AdDoc, l: TextLayer): { floor: number | null; against: string; certain: boolean } {
  const u = behind(doc, l);
  if (u.kind === "solid") return { floor: contrastRatio(l.colour, u.colour), against: u.colour, certain: true };
  if (u.kind === "photo") return { floor: null, against: "a photograph", certain: false };
  const { floor, worst } = scrimFloor(l.colour, u.colour, u.alpha);
  return {
    floor,
    against: `a ${Math.round(u.alpha * 100)}% ${u.colour} scrim over an unknown photograph (worst case ${worst})`,
    certain: false,
  };
}

/**
 * The lowest contrast a scrim can give, whatever the photograph turns out to be.
 * The photo is bounded by black and white, so compositing the scrim over both
 * brackets every possible outcome and the worse of the two is a guarantee.
 */
export function scrimFloor(textColour: string, scrimColour: string, alpha: number): { floor: number; worst: string } {
  const onBlack = composite(scrimColour, "#000000", alpha);
  const onWhite = composite(scrimColour, "#ffffff", alpha);
  const b = contrastRatio(textColour, onBlack), w = contrastRatio(textColour, onWhite);
  return { floor: Math.round(Math.min(b, w) * 100) / 100, worst: b < w ? onBlack : onWhite };
}

export function checkDoc(doc: AdDoc, suppliedFacts = ""): CanvasCheck {
  const frame = placement(doc.placementId);
  const findings: CanvasFinding[] = [];
  const measured: { label: string; value: string }[] = [];

  const texts = doc.layers.filter((l): l is TextLayer => l.kind === "text" && !l.hidden);

  for (const l of texts) {
    // 1. Does it fit? Estimated, and said so.
    const px = l.sizeEm * frame.height;
    const { lines, overflowed } = wrapText(display(l), (l.w * frame.width) / px, l.weight);
    if (overflowed) {
      findings.push({
        severity: "warning", layerId: l.id, title: `"${short(l.text)}" has a word wider than its box`,
        detail: `At ${Math.round(px)}px in a box ${Math.round(l.w * frame.width)}px wide, one word does not fit on a line. This is an estimate — only the browser measures the real font — but it errs toward warning early. Shorten the word, widen the box, or auto-fit.`,
        fix: { action: "auto-fit", label: "Shrink until it fits" },
      });
    }
    if (lines.length > 5) {
      findings.push({
        severity: "warning", layerId: l.id, title: `"${short(l.text)}" runs to ${lines.length} lines`,
        detail: "Nobody reads five lines of overlaid text on a scroll. Cut it to the one thing this ad is for, and put the rest in the caption where it is free and searchable.",
        fix: { action: "edit-text", label: "Cut the copy" },
      });
    }

    // 2. Is it inside the safe area? The platform's own numbers, so this is a fact.
    const lh = px * (l.lineHeight || 1.15);
    const blockH = lh * lines.length;
    const box = anchorXY(l, frame, l.w * frame.width, blockH);
    const out: string[] = [];
    if (box.y < frame.safe.top * frame.height) out.push("the top");
    if (box.y + blockH > (1 - frame.safe.bottom) * frame.height) out.push("the bottom");
    if (box.x < frame.safe.left * frame.width) out.push("the left");
    if (box.x + l.w * frame.width > (1 - frame.safe.right) * frame.width) out.push("the right");
    if (out.length && l.role !== "background") {
      findings.push({
        severity: l.role === "legal" ? "warning" : "blocking",
        layerId: l.id,
        title: `"${short(l.text)}" is under ${frame.label} chrome`,
        detail: `It crosses ${out.join(" and ")} of the safe area. ${frame.safeNote}`,
        fix: { action: "move-into-safe", label: "Move it inside the safe area" },
      });
    }

    // 3. Contrast. WCAG, computed — the one number in an ad that is not a matter
    //    of taste. 4.5 is the AA threshold for body text; large text passes at 3.
    const c = contrastFor(doc, l);
    const large = px >= 0.024 * frame.height;
    const threshold = large ? 3 : 4.5;
    if (c.floor == null) {
      findings.push({
        severity: "warning", layerId: l.id,
        title: `"${short(l.text)}" sits directly on a photograph`,
        detail: "Contrast against a bare photograph cannot be computed from the document — the picture is different colours in different places, and the one under this line may not be the one you noticed in the preview. A plate or a scrim behind the text turns this into a number.",
        fix: { action: "add-plate", label: "Put a plate behind it" },
      });
    } else {
      measured.push({
        label: `Contrast — ${short(l.text, 24)}`,
        value: `${c.certain ? "" : "at worst "}${c.floor}:1 against ${c.against} (needs ${threshold}:1)`,
      });
      if (c.floor < threshold) {
        const solid = c.certain ? c.against : null;
        findings.push({
          severity: c.certain ? "blocking" : "warning",
          layerId: l.id,
          title: `"${short(l.text)}" is ${c.certain ? "" : "as low as "}${c.floor}:1 against its background`,
          detail: `WCAG asks for ${threshold}:1 at this size. Below that the text is not merely ugly — a share of your audience cannot read it at all, and on a phone in daylight that share is most of them.${solid ? ` ${readableOn(solid) === "#ffffff" ? "White" : "Black"} would pass here at ${contrastRatio(readableOn(solid), solid)}:1.` : " Over a photograph the only way to make it certain is a plate behind the text."}`,
          fix: solid ? { action: "flip-colour", label: `Use ${readableOn(solid)}` } : { action: "add-plate", label: "Put a plate behind it" },
        });
      }
    }
  }

  // 4. The copy itself goes through the same claim guard as everything else. An
  //    unprovable claim is not less illegal for being set in a nice typeface.
  const copy = texts.map((l) => l.text).join("\n");
  const claims = claimReport(copy, suppliedFacts);
  for (const f of claims.findings) {
    findings.push({
      severity: f.severity === "block" ? "blocking" : "warning",
      title: `Claim on the artwork: "${short(f.excerpt, 40)}"`,
      detail: `${f.reason} ${f.fix}`,
      fix: { action: "edit-text", label: "Rewrite the claim" },
    });
  }

  // 5. Things that are simply absent.
  if (!texts.some((l) => l.role === "cta")) {
    findings.push({ severity: "note", title: "No call to action on the artwork", detail: "The button under the ad is the platform's, not yours, and on some placements there is not one. A three-word CTA on the image itself is the cheapest thing in advertising." });
  }
  if (!doc.layers.some((l) => l.role === "logo" && !l.hidden)) {
    findings.push({ severity: "note", title: "No logo", detail: "An ad nobody can attribute buys attention for the category rather than for you." });
  }

  measured.push({ label: "Frame", value: `${frame.width}×${frame.height} (${frame.ratio}) — ${frame.label}` });
  measured.push({ label: "Layers", value: `${doc.layers.filter((l) => !l.hidden).length} visible of ${doc.layers.length}` });
  measured.push({ label: "Words on the artwork", value: String(copy.split(/\s+/).filter(Boolean).length) });

  return {
    findings: findings.sort((a, b) => rank(a.severity) - rank(b.severity)),
    publishable: !findings.some((f) => f.severity === "blocking"),
    measured,
    claims: claims.findings,
    doctrine:
      "Contrast is the WCAG ratio and the safe areas are the platforms' published numbers, so both are facts rather than opinions. The text width is an estimate — only your browser measures the real font — and it is deliberately pessimistic so it warns early. Editing any of this costs nothing: the picture underneath is untouched, so no provider is called and no ACU is spent.",
  };
}

const rank = (s: CanvasFinding["severity"]) => (s === "blocking" ? 0 : s === "warning" ? 1 : 2);
const short = (s: string, n = 30) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t || "(empty)"; };

// ---------------------------------------------------------------------------
// Building a document from what the generators already produce
// ---------------------------------------------------------------------------
export type FromAdInput = {
  brandId: string;
  placementId: PlacementId;
  imageUrl?: string;
  headline: string;
  subhead?: string;
  offer?: string;
  cta?: string;
  logoUrl?: string;
  /** Brand colours the customer actually set. Empty means we do not know them. */
  colours?: string[];
  origin?: AdDoc["origin"];
  docId: string;
};

export function docFromAd(input: FromAdInput): AdDoc {
  const frame = placement(input.placementId);
  const brand = (input.colours || []).map((c) => c.trim()).filter((c) => parseHex(c));
  const accent = brand[0] || "#3987e5";
  const ink = readableOn(accent);
  const background = brand[1] && contrastRatio(brand[1], accent) > 1.5 ? brand[1] : "#0b0f1a";
  const onBg = readableOn(background);
  const tall = frame.height / frame.width > 1.2;

  const layers: Layer[] = [];

  // THE BRAND COLOUR ONLY GETS USED WHERE IT SURVIVES. An accent that reads
  // beautifully on the mockup can vanish on a bright photograph — amber through
  // a thin scrim can drop under 2:1 — and the builder is the right place to
  // catch that, because a default that fails its own check is a defect shipped
  // to every customer who never opens the panel. Where the accent does not hold
  // its floor it goes on the CTA plate, where the colour underneath is certain.
  const SCRIM_ALPHA = 0.62;
  const accentHoldsOverPhoto =
    !input.imageUrl || scrimFloor(accent, background, SCRIM_ALPHA).floor >= 3;

  if (input.imageUrl && safeHref(input.imageUrl)) {
    layers.push({
      kind: "image", id: "bg", role: "background", href: input.imageUrl,
      x: 0, y: 0, w: 1, h: 1, anchor: "top-left", fit: "cover",
    });
    // A scrim, so the headline is legible over a picture whose colours we do not
    // know. It is a real shape rather than a hope.
    layers.push({
      kind: "shape", id: "scrim", role: "band", colour: background, opacity: SCRIM_ALPHA,
      x: 0, y: 1, w: 1, h: tall ? 0.34 : 0.4, anchor: "bottom-left",
    });
  }

  const inner = 1 - frame.safe.left - frame.safe.right;
  const bottomSafe = 1 - frame.safe.bottom;

  // Stacked from the bottom of the safe area upward, so nothing lands under the
  // app's own buttons on any placement.
  let cursor = bottomSafe - 0.015;

  if (input.cta) {
    // The button is a PLATE on the text rather than a separate shape underneath
    // it. Two layers that must stay aligned are two layers that will eventually
    // come apart — on a resize, on a drag, on an edit. One layer cannot.
    layers.push({
      kind: "text", id: "cta", role: "cta", text: input.cta, x: frame.safe.left, y: cursor,
      w: Math.min(inner, 0.55), anchor: "bottom-left", sizeEm: tall ? 0.026 : 0.038,
      colour: ink, weight: 700, align: "left", lineHeight: 1.1, uppercase: true,
      plate: { colour: accent, padEm: 0.5, radiusEm: 0.4 },
    });
    cursor -= (tall ? 0.055 : 0.085) + 0.025;
  }

  if (input.offer) {
    layers.push({
      kind: "text", id: "offer", role: "offer", text: input.offer, x: frame.safe.left, y: cursor,
      w: inner, anchor: "bottom-left", sizeEm: tall ? 0.03 : 0.042, colour: accentHoldsOverPhoto ? accent : onBg, weight: 800, align: "left", lineHeight: 1.15,
    });
    cursor -= 0.045;
  }

  if (input.subhead) {
    layers.push({
      kind: "text", id: "subhead", role: "subhead", text: input.subhead, x: frame.safe.left, y: cursor,
      w: inner, anchor: "bottom-left", sizeEm: tall ? 0.024 : 0.032, colour: onBg, weight: 500, align: "left", lineHeight: 1.3,
    });
    cursor -= 0.06;
  }

  layers.push({
    kind: "text", id: "headline", role: "headline", text: input.headline, x: frame.safe.left, y: cursor,
    w: inner, anchor: "bottom-left", sizeEm: tall ? 0.048 : 0.07, colour: onBg, weight: 900, align: "left", lineHeight: 1.08,
  });

  if (input.logoUrl && safeHref(input.logoUrl)) {
    layers.push({
      kind: "image", id: "logo", role: "logo", href: input.logoUrl,
      x: frame.safe.left, y: frame.safe.top + 0.01, w: 0.22, h: 0.07, anchor: "top-left", fit: "contain",
    });
  }

  const doc: AdDoc = {
    id: input.docId,
    brandId: input.brandId,
    placementId: input.placementId,
    background,
    layers,
    origin: input.origin || { kind: input.imageUrl ? "generated" : "blank" },
  };

  // Anything that does not fit is shrunk here rather than shipped broken.
  return fitAll(doc);
}

/** Auto-fit every text layer, compress the stack into the frame, re-derive the scrim. */
export function fitAll(doc: AdDoc): AdDoc {
  const frame = placement(doc.placementId);
  const layers = doc.layers.map((l) => {
    if (l.kind !== "text" || l.hidden) return l;
    const maxLines = l.role === "headline" ? 3 : l.role === "cta" ? 1 : 4;
    const fit = autoFit(l, frame, maxLines);
    return fit.sizeEm === l.sizeEm ? l : { ...l, sizeEm: fit.sizeEm };
  });
  return reflowScrim(compressStack({ ...doc, layers }));
}

/**
 * Make the whole stack fit the frame, not just each line fit its own box.
 *
 * Fitting layers one at a time is not enough, and a 3:1 email banner is where
 * that shows: four layers that each fit their own width can still add up to a
 * block taller than a 400px frame, and the top of it ends up OUTSIDE the
 * artwork. Nothing can be done about that after the fact — a scrim cannot cover
 * copy that is off the canvas — so the stack is compressed here, shrinking the
 * type and closing the gaps together, until it sits inside the safe band.
 *
 * It stops at the readable floor rather than compressing for ever. Text nobody
 * can read is not a fix, and `checkDoc` reports what still does not fit.
 */
export function compressStack(doc: AdDoc): AdDoc {
  const frame = placement(doc.placementId);
  const MIN_EM = 0.012;
  let current = doc;

  for (let i = 0; i < 40; i++) {
    if (textBlockTop(current) >= frame.safe.top) return current;
    const texts = current.layers.filter((l): l is TextLayer => l.kind === "text" && !l.hidden && !l.pinned);
    if (!texts.length || texts.every((l) => l.sizeEm <= MIN_EM)) return current;

    const bottomEdge = 1 - frame.safe.bottom;
    current = {
      ...current,
      layers: current.layers.map((l) => {
        if (l.kind !== "text" || l.hidden || l.pinned) return l;
        const [v] = l.anchor.split("-");
        // Close the gap to the anchoring edge by the same factor as the type, so
        // the composition keeps its proportions instead of collapsing into a
        // block of text with the old spacing around it.
        const y = v === "bottom" ? bottomEdge - (bottomEdge - l.y) * 0.94
          : v === "top" ? frame.safe.top + (l.y - frame.safe.top) * 0.94
          : l.y;
        return { ...l, sizeEm: Math.max(MIN_EM, l.sizeEm * 0.94), y };
      }),
    };
  }
  return current;
}

/** The top edge of the highest visible text block, as a fraction of the frame. */
export function textBlockTop(doc: AdDoc): number {
  const frame = placement(doc.placementId);
  let top = 1;
  for (const l of doc.layers) {
    if (l.kind !== "text" || l.hidden || l.role === "logo") continue;
    const px = l.sizeEm * frame.height;
    const { lines } = wrapText(display(l), (l.w * frame.width) / px, l.weight);
    const blockH = px * (l.lineHeight || 1.15) * lines.length;
    const box = anchorXY(l, frame, l.w * frame.width, blockH);
    top = Math.min(top, box.y / frame.height);
  }
  return top;
}

/**
 * The scrim is DERIVED, never stored as a fixed height.
 *
 * A dark panel behind the copy is what makes white text legible over a
 * photograph nobody has colour-picked. Store its height and it is correct for
 * exactly one frame: refit to a reel, where the safe area lifts the whole stack
 * by 250px, and the copy floats off the top of the panel onto the picture. So
 * it is recomputed from the text it exists to sit behind, every time anything
 * moves. A layer that has no independent reason to be any particular size
 * should not have one.
 */
export function reflowScrim(doc: AdDoc): AdDoc {
  const i = doc.layers.findIndex((l) => l.kind === "shape" && l.role === "band" && l.id === "scrim");
  if (i < 0) return doc;
  const top = textBlockTop(doc);
  if (top >= 1) return doc;
  const layers = [...doc.layers];
  // A little above the copy so the gradient of the eye, not the edge of a box,
  // is what the reader notices.
  const h = Math.min(1, 1 - top + 0.04);
  layers[i] = { ...(layers[i] as ShapeLayer), x: 0, y: 1, w: 1, h, anchor: "bottom-left" };
  return { ...doc, layers };
}

// ---------------------------------------------------------------------------
// Refit — the reason the coordinates are relative
//
// This is a RE-LAYOUT, not a crop. Every layer keeps its role and its anchor;
// what changes is the safe area it must live inside and the size text needs to
// be to fit a different width. A layer the customer has moved by hand is
// PINNED and left alone — being overruled by the software is how people stop
// trusting it.
// ---------------------------------------------------------------------------
export function refit(doc: AdDoc, to: PlacementId): AdDoc {
  const from = placement(doc.placementId);
  const target = placement(to);
  if (from.id === target.id) return doc;

  // ONE RULE FOR SIZE, and it is worth stating plainly. Sizes are stored as
  // fractions of HEIGHT, but what governs whether a headline reads is its size
  // against the WIDTH — that is what decides how many characters fit on a line.
  // So the physical pixel size is preserved relative to width, and the stored
  // fraction is recomputed from it:
  //
  //   px  = sizeEm × from.height          (what it was)
  //   px' = px × (target.width/from.width) (same size relative to the frame's width)
  //   sizeEm' = px' / target.height
  //
  // A 0.07 headline on a 1080×1080 square is 76px. On a 1080×1920 story the
  // width has not changed, so it stays 76px — which is 0.039 of the new height.
  // Keeping 0.07 would have made it 134px and turned a headline into a wall.
  const scale = (from.height * target.width) / (from.width * target.height);

  const layers = doc.layers.map((l): Layer => {
    if (l.pinned) return l;

    // Background fills whatever it is given.
    if (l.role === "background") return { ...l, x: 0, y: 0, w: 1, ...(l.kind === "image" ? { h: 1 } : {}) } as Layer;

    // POSITION IS KEPT AS A GAP FROM THE SAFE EDGE IT WAS ANCHORED TO, not as a
    // raw fraction. That is the whole point of the exercise: a story reserves
    // its bottom 20% and a reel its bottom 35%, so y = 0.9 is comfortably above
    // the reply bar in one and underneath the CTA in the other. Carrying the gap
    // across instead of the coordinate is what makes this a re-layout.
    // A band is decoration BEHIND the content — a scrim, a colour block. It is
    // meant to bleed to the edge, so it keeps its raw position and is not pulled
    // inside the safe area. Only things a viewer has to read are re-seated.
    const decorative = l.role === "band";

    const [v, h] = l.anchor.split("-");
    let x = l.x;
    let y = l.y;

    if (!decorative) {
      if (h === "left") x = target.safe.left + Math.max(0, l.x - from.safe.left);
      else if (h === "right") x = 1 - target.safe.right - Math.max(0, 1 - from.safe.right - l.x);

      if (v === "top") y = target.safe.top + Math.max(0, l.y - from.safe.top) * scale;
      else if (v === "bottom") y = 1 - target.safe.bottom - Math.max(0, 1 - from.safe.bottom - l.y) * scale;

      y = Math.min(Math.max(y, target.safe.top), 1 - target.safe.bottom);
    }
    x = Math.min(Math.max(x, 0), 1);

    const innerFrom = 1 - from.safe.left - from.safe.right;
    const innerTo = 1 - target.safe.left - target.safe.right;
    // Decoration keeps its bleed; content is re-fitted to the new inner width.
    const w = decorative ? l.w : Math.min(l.w * (innerTo / innerFrom), innerTo);

    if (l.kind === "text") {
      return { ...l, x, y, w, sizeEm: Math.max(0.012, Math.min(l.sizeEm * scale, 0.14)) };
    }
    if (l.kind === "shape") return { ...l, x, y, w, h: Math.min(l.h * scale, 0.6) };
    // An image keeps its physical size: width is already in width-fractions, so
    // only the height fraction is restated against the new frame.
    return { ...l, x, y, w, ...(l.h != null ? { h: Math.min(l.h * scale, 1) } : {}) };
  });

  return fitAll({ ...doc, placementId: to, layers });
}

/** One document, every placement it will actually run in. */
export function refitAll(doc: AdDoc, ids: PlacementId[]): { placement: Placement; doc: AdDoc; check: CanvasCheck }[] {
  return ids.map((id) => {
    const d = refit(doc, id);
    return { placement: placement(id), doc: d, check: checkDoc(d) };
  });
}

// ---------------------------------------------------------------------------
// Edits
//
// Every change goes through here so the document cannot be put into a state the
// renderer will not survive — an unparseable colour, a negative size, an href
// with a scheme we do not allow.
// ---------------------------------------------------------------------------
export type Edit =
  | { op: "set-text"; layerId: string; text: string }
  | { op: "set-colour"; layerId: string; colour: string }
  | { op: "move"; layerId: string; x: number; y: number }
  | { op: "resize"; layerId: string; w: number }
  | { op: "set-size"; layerId: string; sizeEm: number }
  | { op: "toggle"; layerId: string; hidden: boolean }
  | { op: "add-plate"; layerId: string; colour?: string }
  | { op: "flip-colour"; layerId: string }
  | { op: "auto-fit"; layerId: string }
  | { op: "move-into-safe"; layerId: string }
  | { op: "reorder"; layerId: string; toIndex: number }
  | { op: "set-background"; colour: string };

export type EditResult = { ok: true; doc: AdDoc; note: string } | { ok: false; error: string };

export function applyEdit(doc: AdDoc, edit: Edit): EditResult {
  const frame = placement(doc.placementId);

  if (edit.op === "set-background") {
    if (!parseHex(edit.colour)) return { ok: false, error: `"${edit.colour}" is not a hex colour.` };
    return { ok: true, doc: { ...doc, background: edit.colour }, note: "Background changed. Contrast has been re-measured against it." };
  }

  const idx = doc.layers.findIndex((l) => l.id === edit.layerId);
  if (idx < 0) return { ok: false, error: `No layer "${edit.layerId}".` };
  const layer = doc.layers[idx];
  const put = (l: Layer, note: string, pin = true): EditResult => {
    const layers = [...doc.layers];
    layers[idx] = pin ? ({ ...l, pinned: true } as Layer) : l;
    return { ok: true, doc: { ...doc, layers }, note };
  };

  switch (edit.op) {
    case "set-text": {
      if (layer.kind !== "text") return { ok: false, error: "That layer has no text." };
      const text = (edit.text || "").slice(0, 600);
      // Not pinned: retyping a headline is not hand-placing it.
      return put({ ...layer, text }, "Text changed. Nothing was regenerated, so nothing was charged.", false);
    }
    case "set-colour": {
      if (!parseHex(edit.colour)) return { ok: false, error: `"${edit.colour}" is not a hex colour.` };
      if (layer.kind === "text") return put({ ...layer, colour: edit.colour }, "Colour changed.", false);
      if (layer.kind === "shape") return put({ ...layer, colour: edit.colour }, "Colour changed.", false);
      return { ok: false, error: "An image layer has no colour to set." };
    }
    case "move": {
      if (!finite(edit.x) || !finite(edit.y)) return { ok: false, error: "Position must be a number between 0 and 1." };
      return put({ ...layer, x: clamp01(edit.x), y: clamp01(edit.y) }, "Moved. This layer is now pinned, so resizing to another placement will leave it where you put it.");
    }
    case "resize": {
      if (!finite(edit.w) || edit.w <= 0) return { ok: false, error: "Width must be greater than zero." };
      return put({ ...layer, w: Math.min(1, edit.w) }, "Resized.");
    }
    case "set-size": {
      if (layer.kind !== "text") return { ok: false, error: "Only text has a font size." };
      if (!finite(edit.sizeEm) || edit.sizeEm <= 0) return { ok: false, error: "Font size must be greater than zero." };
      const s = Math.max(0.008, Math.min(0.2, edit.sizeEm));
      return put({ ...layer, sizeEm: s }, `Set to ${Math.round(s * frame.height)}px on this frame.`);
    }
    case "toggle":
      return put({ ...layer, hidden: edit.hidden }, edit.hidden ? "Hidden. It is still in the document." : "Shown again.", false);
    case "add-plate": {
      if (layer.kind !== "text") return { ok: false, error: "Only text takes a plate." };
      const colour = edit.colour && parseHex(edit.colour) ? edit.colour : (readableOn(layer.colour) === "#ffffff" ? "#000000" : "#ffffff");
      return put({ ...layer, plate: { colour, padEm: 0.45, radiusEm: 0.12 } }, `Plate added in ${colour}. Contrast is now ${contrastRatio(layer.colour, colour)}:1 and no longer depends on what is in the photograph.`, false);
    }
    case "flip-colour": {
      if (layer.kind !== "text") return { ok: false, error: "Only text has a text colour." };
      const u = behind(doc, layer);
      if (u.kind === "photo") return { ok: false, error: "The background here is a bare photograph, so there is no single colour to flip against. Add a plate instead." };
      // Over a scrim the honest target is the scrim composited over its own
      // worst case, not the scrim colour — that is the one that has to pass.
      const against = u.kind === "solid" ? u.colour : composite(u.colour, luminance(layer.colour) > 0.5 ? "#ffffff" : "#000000", u.alpha);
      const c = readableOn(against);
      return put({ ...layer, colour: c }, `Set to ${c} — ${contrastRatio(c, against)}:1 against ${against}${u.kind === "scrim" ? " in the worst case the photograph can produce" : ""}.`, false);
    }
    case "auto-fit": {
      if (layer.kind !== "text") return { ok: false, error: "Only text is fitted." };
      const maxLines = layer.role === "headline" ? 3 : layer.role === "cta" ? 1 : 4;
      const fit = autoFit(layer, frame, maxLines);
      return put(
        { ...layer, sizeEm: fit.sizeEm },
        fit.fits
          ? `Fitted at ${Math.round(fit.sizeEm * frame.height)}px on ${fit.lines.length} line(s).`
          : `Even at the readable floor this needs ${fit.lines.length} lines. The copy is too long for the box — shorten it rather than shrink it further.`,
        false,
      );
    }
    case "move-into-safe": {
      const [v, h] = layer.anchor.split("-");
      const x = h === "right" ? Math.min(layer.x, 1 - frame.safe.right) : h === "left" ? Math.max(layer.x, frame.safe.left) : clamp01(layer.x);
      const y = v === "bottom" ? Math.min(layer.y, 1 - frame.safe.bottom) : v === "top" ? Math.max(layer.y, frame.safe.top) : clamp01(layer.y);
      return put({ ...layer, x, y }, `Moved inside the ${frame.label} safe area. ${frame.safeNote}`, false);
    }
    case "reorder": {
      const layers = doc.layers.filter((l) => l.id !== edit.layerId);
      const to = Math.max(0, Math.min(layers.length, Math.round(edit.toIndex)));
      layers.splice(to, 0, layer);
      return { ok: true, doc: { ...doc, layers }, note: "Stacking order changed." };
    }
    default:
      return { ok: false, error: "Unknown edit." };
  }
}

const finite = (n: number) => typeof n === "number" && Number.isFinite(n);

/** Apply the fix a finding offered, without the caller having to translate it. */
export function applyFix(doc: AdDoc, finding: CanvasFinding): EditResult {
  if (!finding.fix || !finding.layerId) return { ok: false, error: "That finding has no automatic fix — it needs a decision, not a button." };
  const a = finding.fix.action;
  if (a === "edit-text") return { ok: false, error: "Rewriting the copy is yours to do. The engine will not put words in your ad that you did not choose." };
  return applyEdit(doc, { op: a, layerId: finding.layerId } as Edit);
}

export const AD_CANVAS_DOCTRINE =
  "A generated ad here is a document, not a picture. The headline is a string you can retype, the logo is a layer you can move, and every placement is a re-layout rather than a crop — which is why a story does not arrive with its offer under the reply bar. Editing costs nothing: no provider is called and no ACU is spent, because the artwork underneath never changes. What the engine will not do is tell you an ad is good. It measures the things that are measurable — contrast to WCAG, the platforms' own safe areas, how many words are on the artwork — and leaves the judgement where it belongs.";
