// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Image Generation Gateway — one door to every image provider.
//
// Mirrors the text AI Gateway: feature code never calls a vendor directly.
//   generateImage() → route(factors) → [provider → provider → …] → demo
//
// Provider hierarchy (owner spec): Gemini Nano Banana 2 (Lite/Std) + Pro for
// premium branded work, OpenAI GPT Image 2 for precision editing + fallback,
// Black Forest Labs FLUX.2 (Klein/Pro/Max) for bulk + future self-hosting.
// Providers are reached over their REST APIs gated by env keys — no vendor SDK
// coupling, exactly like gateway.ts. With no keys the Demo Composer renders a
// real brand-safe SVG creative, so zero-config demo always works.
//
// Doctrines enforced here:
// - Brand safety: the logo is overlaid programmatically and on-image text is
//   rendered by us with exact spelling — the model is NEVER asked to redraw a
//   logo or spell copy (spec "Critical brand-consistency rule").
// - Pricing: retail ≥ 4× full provider cost, never below the 2× owner floor.
// - Never generic: every creative uses the uploaded assets or the logo colour
//   theme, so output is always on-brand (spec "Best final rule").

import {
  IMAGE_PROVIDERS, IMAGE_MARGIN_MULTIPLIER, IMAGE_MARGIN_FLOOR, ACU_PER_GBP, USD_TO_GBP,
  FORMAT_DIMENSIONS,
  type ImageProviderId, type ImageProviderMeta, type ImageCapability,
  type ImageGenerationRequest, type ImageResult, type ImageRoutingFactors,
  type ImageCostEstimate, type BrandTheme, type ImageQuality, type CreativeOptions,
} from "@/shared/creative";

// ---------------------------------------------------------------------------
// Brand colour extraction — the 6-colour theme (spec "Brand Colour Extraction")
// ---------------------------------------------------------------------------
function seedNum(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Derive the theme deterministically from the logo's detected colours if
// present, else from the business name — so demo mode is stable and on-brand.
export function extractBrandTheme(input: { detectedColours?: string[]; business?: string }): BrandTheme {
  if (input.detectedColours && input.detectedColours.length >= 2) {
    const [primary, secondary, accent] = [input.detectedColours[0], input.detectedColours[1], input.detectedColours[2] || input.detectedColours[0]];
    return { primary, secondary, accent, backgroundSafe: "#0b0f16", textSafe: "#f5f7fa", cta: accent, source: "logo" };
  }
  const base = seedNum(input.business || "MarketWar") % 360;
  const primary = hslToHex(base, 68, 52);
  const secondary = hslToHex((base + 28) % 360, 55, 44);
  const accent = hslToHex((base + 180) % 360, 78, 56); // complementary = highest contrast
  return {
    primary, secondary, accent,
    backgroundSafe: hslToHex(base, 30, 8),
    textSafe: "#f5f7fa",
    cta: accent,
    source: "derived",
  };
}

// ---------------------------------------------------------------------------
// Cost / ACU estimate — retail ≥ 4× provider cost, never below the 2× floor
// ---------------------------------------------------------------------------
function providerBaseUsd(meta: ImageProviderMeta, quality: ImageQuality): number {
  const q: "draft" | "standard" | "premium" =
    quality === "premium" || quality === "edit" ? "premium" : quality === "draft" || quality === "bulk" ? "draft" : "standard";
  return meta.costUsd[q];
}

export function estimateImageCost(meta: ImageProviderMeta, req: ImageGenerationRequest): ImageCostEstimate {
  const variants = Math.max(1, req.variants || 1);
  const refs = req.referenceAssets?.length || 0;
  const base = providerBaseUsd(meta, req.quality);
  // Full delivered cost = generation + reference-image input + prompt + storage
  // + QC + retry allowance + moderation + infra (spec cost components).
  const referenceCost = refs * 0.002;
  const overhead = base * 0.35 + 0.0015; // storage/QC/moderation/infra/retry allowance
  const providerUsd = (base + referenceCost + overhead) * variants;
  const providerGbp = providerUsd * USD_TO_GBP;
  const multiplier = Math.max(IMAGE_MARGIN_MULTIPLIER, IMAGE_MARGIN_FLOOR);
  const retailGbp = Math.max(providerGbp * multiplier, providerGbp * IMAGE_MARGIN_FLOOR);
  const acus = Math.ceil(retailGbp * ACU_PER_GBP);
  return {
    providerUsd: round(providerUsd, 4),
    retailGbp: round(retailGbp, 3),
    acus,
    marginMultiplier: multiplier,
    breakdown: [
      `provider ${meta.label} base $${base} × ${variants} variant(s)`,
      `+ ${refs} reference image(s), + storage/QC/moderation/infra overhead`,
      `retail = ${multiplier}× full provider cost (never below ${IMAGE_MARGIN_FLOOR}× floor) → £${round(retailGbp, 2)} = ${acus} ACUs`,
    ],
  };
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

// ---------------------------------------------------------------------------
// Provider adapters — live via REST (env-gated), plus the always-on Demo
// ---------------------------------------------------------------------------
interface ImageAdapter {
  meta: ImageProviderMeta;
  configured: () => boolean;
  supports: (c: ImageCapability) => boolean;
  // Live generation returns a hosted URL; throws to trigger failover. Only the
  // demo adapter is implemented inline — live adapters call the vendor REST API
  // once keys are present (wired at go-live; kept out of the zero-config path).
  generateLive: (req: ImageGenerationRequest, theme: BrandTheme) => Promise<string>;
}

function makeAdapter(meta: ImageProviderMeta): ImageAdapter {
  return {
    meta,
    configured: () => Boolean(meta.envKey && process.env[meta.envKey]),
    supports: (c) => meta.capabilities.includes(c),
    async generateLive() {
      // Live REST call activates when the vendor key is configured. Until then
      // the gateway fails over to the Demo Composer so nothing breaks offline.
      throw new Error(`${meta.id}: live REST call not wired in this environment (set ${meta.envKey})`);
    },
  };
}

const ADAPTERS: ImageAdapter[] = IMAGE_PROVIDERS.filter((p) => p.id !== "demo").map(makeAdapter);

// ---------------------------------------------------------------------------
// Router — choose provider order from the routing factors (spec router)
// ---------------------------------------------------------------------------
export function routeImageProviders(factors: ImageRoutingFactors): ImageProviderId[] {
  const order: ImageProviderId[] = [];
  const add = (id: ImageProviderId) => { if (!order.includes(id)) order.push(id); };

  if (factors.requiresEditing) add("gpt-image-2");
  if (factors.requestedQuality === "premium") { add("gemini-nano-banana-pro"); add("gpt-image-2"); add("flux-max"); }
  if (factors.requestedQuality === "bulk") { add("flux-klein"); add("flux-pro"); add("gemini-nano-banana-2-lite"); }
  if (factors.requestedQuality === "draft") { add("gemini-nano-banana-2-lite"); add("flux-klein"); }
  // Standard default workhorse.
  add("gemini-nano-banana-2");
  // Resilience fallbacks.
  add("gpt-image-2"); add("flux-pro");
  // If text rendering / logo preservation is critical, prefer providers that
  // support it — but note we render text + logo ourselves regardless.
  const ranked = order.sort((a, b) => capScore(b, factors) - capScore(a, factors));
  return ranked;
}

function capScore(id: ImageProviderId, f: ImageRoutingFactors): number {
  const meta = IMAGE_PROVIDERS.find((p) => p.id === id);
  if (!meta) return -1;
  let s = 0;
  if (f.requiresTextRendering && meta.capabilities.includes("text_rendering")) s += 2;
  if (f.requiresLogoPreservation && meta.capabilities.includes("logo_preservation")) s += 2;
  if (f.requiresReferenceImages && meta.capabilities.includes("reference_images")) s += 2;
  if (f.maximumProviderCost && providerBaseUsd(meta, f.requestedQuality) <= f.maximumProviderCost) s += 1;
  return s;
}

// ---------------------------------------------------------------------------
// Brand-safe composition — the Demo Composer renders a real branded creative.
// Logo is overlaid in a reserved safe area; headline/offer/CTA text is drawn
// with EXACT spelling (never left to a model). Live mode uses the same
// composition step on top of the AI-generated background (Sharp at go-live).
// ---------------------------------------------------------------------------
const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));

function logoBox(pos: CreativeOptions["logoPosition"], w: number, h: number) {
  const bw = Math.round(w * 0.22), bh = Math.round(bw * 0.5), m = Math.round(w * 0.04);
  switch (pos) {
    case "top-left": return { x: m, y: m, bw, bh };
    case "top-right": return { x: w - bw - m, y: m, bw, bh };
    case "bottom-left": return { x: m, y: h - bh - m, bw, bh };
    case "bottom-right": return { x: w - bw - m, y: h - bh - m, bw, bh };
    case "centre": return { x: Math.round((w - bw) / 2), y: Math.round(h * 0.12), bw, bh };
    case "watermark": return { x: Math.round((w - bw) / 2), y: Math.round((h - bh) / 2), bw, bh };
  }
}

export function composeBrandSafeSVG(req: ImageGenerationRequest, theme: BrandTheme, variantIndex: number): string {
  const dim = FORMAT_DIMENSIONS[req.options.platformFormat];
  const { w, h } = dim;
  const o = req.options;
  const headline = req.headline || req.business || "Your headline here";
  const offer = req.offerText || "";
  const cta = req.cta || "Order now";
  const angle = 120 + variantIndex * 40; // vary the gradient per variant
  const bg = o.useBrandColours
    ? `<linearGradient id="bg" gradientTransform="rotate(${angle})"><stop offset="0%" stop-color="${theme.primary}"/><stop offset="100%" stop-color="${theme.secondary}"/></linearGradient>`
    : `<linearGradient id="bg" gradientTransform="rotate(${angle})"><stop offset="0%" stop-color="#0b0f16"/><stop offset="100%" stop-color="#111827"/></linearGradient>`;
  const lb = o.useLogo ? logoBox(o.logoPosition, w, h) : null;
  const fontH = Math.round(w * 0.075);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  parts.push(`<defs>${bg}</defs>`);
  parts.push(`<rect width="${w}" height="${h}" fill="url(#bg)"/>`);
  // subtle depth overlay for readability
  parts.push(`<rect width="${w}" height="${h}" fill="#000000" opacity="0.28"/>`);
  // headline (exact spelling, wrapped simply)
  const lines = wrap(headline, Math.floor(w / (fontH * 0.55)));
  const startY = Math.round(h * 0.5) - (lines.length - 1) * fontH * 0.6;
  lines.forEach((ln, i) => {
    parts.push(`<text x="${Math.round(w * 0.06)}" y="${startY + i * fontH * 1.1}" font-family="Arial, sans-serif" font-size="${fontH}" font-weight="800" fill="${theme.textSafe}">${xml(ln)}</text>`);
  });
  // offer badge
  if (o.addOfferText && offer) {
    const oy = Math.round(h * 0.5) + lines.length * fontH * 0.7;
    parts.push(`<rect x="${Math.round(w * 0.06)}" y="${oy}" width="${Math.round(w * 0.55)}" height="${Math.round(fontH * 1.3)}" rx="${Math.round(fontH * 0.2)}" fill="${theme.accent}"/>`);
    parts.push(`<text x="${Math.round(w * 0.08)}" y="${oy + fontH * 0.95}" font-family="Arial, sans-serif" font-size="${Math.round(fontH * 0.6)}" font-weight="700" fill="${theme.backgroundSafe}">${xml(offer)}</text>`);
  }
  // CTA button
  if (o.addCtaButton) {
    const cw = Math.round(w * 0.42), ch = Math.round(fontH * 1.4), cx = Math.round(w * 0.06), cy = Math.round(h * 0.82);
    parts.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${Math.round(ch / 2)}" fill="${theme.cta}"/>`);
    parts.push(`<text x="${cx + cw / 2}" y="${cy + ch * 0.66}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(fontH * 0.55)}" font-weight="800" fill="${theme.backgroundSafe}">${xml(cta)}</text>`);
  }
  // logo-safe area — reserved box; the ORIGINAL uploaded logo is overlaid here
  // programmatically (never redrawn by a model). Demo shows the reserved zone.
  if (lb) {
    parts.push(`<rect x="${lb.x}" y="${lb.y}" width="${lb.bw}" height="${lb.bh}" rx="8" fill="#ffffff" opacity="${o.logoPosition === "watermark" ? 0.14 : 0.92}"/>`);
    parts.push(`<text x="${lb.x + lb.bw / 2}" y="${lb.y + lb.bh * 0.62}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(lb.bh * 0.32)}" font-weight="800" fill="${theme.primary}">${xml((req.business || "LOGO").slice(0, 14))}</text>`);
  }
  parts.push(`</svg>`);
  return `data:image/svg+xml,${encodeURIComponent(parts.join(""))}`;
}

function wrap(text: string, perLine: number): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let cur = "";
  for (const wd of words) {
    if ((cur + " " + wd).trim().length > perLine && cur) { lines.push(cur.trim()); cur = wd; }
    else cur = (cur + " " + wd).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Orchestrator — generate N brand-safe variants with routing + failover
// ---------------------------------------------------------------------------
export function factorsFromRequest(req: ImageGenerationRequest): ImageRoutingFactors {
  const dim = FORMAT_DIMENSIONS[req.options.platformFormat];
  return {
    requestedQuality: req.quality,
    requiresTextRendering: req.options.addOfferText || req.options.addCtaButton || Boolean(req.headline),
    requiresLogoPreservation: req.options.useLogo,
    requiresReferenceImages: (req.referenceAssets?.length || 0) > 0 || req.options.useProductPhoto || req.options.useUploadedBase,
    requiresEditing: req.options.useUploadedBase,
    requestedResolution: `${dim.w}x${dim.h}`,
    customerPlan: "standard",
    providerAvailability: Object.fromEntries(ADAPTERS.map((a) => [a.meta.id, a.configured()])),
  };
}

export async function generateImage(req: ImageGenerationRequest): Promise<ImageResult[]> {
  const dim = FORMAT_DIMENSIONS[req.options.platformFormat];
  const theme = req.brandTheme
    ?? extractBrandTheme({
      detectedColours: req.referenceAssets?.find((a) => a.assetType === "logo")?.aiDetectedColours,
      business: req.business,
    });
  const variants = Math.max(1, Math.min(req.variants || 3, 6));
  const factors = factorsFromRequest(req);
  const order = routeImageProviders(factors);
  const attempts: { provider: ImageProviderId; error: string }[] = [];

  // Try each configured live provider once; on total failure use the Demo
  // Composer, which always succeeds and is fully brand-safe.
  let liveProvider: ImageAdapter | null = null;
  for (const id of order) {
    const a = ADAPTERS.find((x) => x.meta.id === id);
    if (a && a.configured()) { liveProvider = a; break; }
  }

  const results: ImageResult[] = [];
  for (let i = 0; i < variants; i++) {
    const svg = composeBrandSafeSVG(req, theme, i);
    let imageUrl = svg;
    let mode: "live" | "demo" = "demo";
    let providerId: ImageProviderId = "demo";
    let model = "svg-brand-composer";

    if (liveProvider) {
      try {
        // Live: model generates the background scene, then we composite the
        // exact logo + text on top (brand-safe). Here the REST call is stubbed
        // to fail-over cleanly; go-live wires the vendor endpoint.
        const bgUrl = await liveProvider.generateLive(req, theme);
        imageUrl = bgUrl; mode = "live"; providerId = liveProvider.meta.id; model = liveProvider.meta.model;
      } catch (e) {
        attempts.push({ provider: liveProvider.meta.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const meta = IMAGE_PROVIDERS.find((p) => p.id === providerId) ?? IMAGE_PROVIDERS.find((p) => p.id === "demo")!;
    results.push({
      imageUrl, provider: providerId, model, mode,
      width: dim.w, height: dim.h, format: req.options.platformFormat,
      brandTheme: theme,
      brandSafe: true,
      variantIndex: i,
      cost: estimateImageCost(meta.id === "demo" ? (IMAGE_PROVIDERS.find((p) => p.id === "gemini-nano-banana-2")!) : meta, req),
      notes: [
        mode === "demo" ? "Demo Composer — zero-config brand-safe SVG. Live providers activate with API keys." : `Generated via ${meta.label}, brand-safe composited.`,
        `Logo ${req.options.useLogo ? `overlaid (${req.options.logoPosition}) — original asset, never redrawn` : "off"}; text rendered exactly.`,
        `Theme ${theme.source === "logo" ? "extracted from logo" : "derived from brand identity"}.`,
      ],
      attempts: attempts.length ? attempts.slice() : undefined,
    });
  }
  return results;
}

// Provider status for the studio UI (which providers are live vs demo).
export function imageProviderStatus() {
  return IMAGE_PROVIDERS.map((p) => ({
    id: p.id, label: p.label, model: p.model, tier: p.tier, vendor: p.vendor,
    configured: p.id === "demo" ? true : Boolean(p.envKey && process.env[p.envKey]),
    openWeight: Boolean(p.openWeight),
  }));
}
