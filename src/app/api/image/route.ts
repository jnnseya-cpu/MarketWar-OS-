import { NextRequest, NextResponse } from "next/server";
import { generateImage, imageProviderStatus, extractBrandTheme, estimateImageCost } from "@/backend/image-gateway";
import { DEFAULT_CREATIVE_OPTIONS, IMAGE_PROVIDERS, type CreativeOptions, type ImageGenerationRequest, type ImageQuality } from "@/shared/creative";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";

// AI Visual Creation Engine API (multi-provider image gateway).
// POST { action: "generate", ... } → N brand-safe creative variants
// POST { action: "estimate", ... } → cost/ACU estimate before generation
// POST { action: "theme", business?, detectedColours? } → 6-colour brand theme
// GET → provider hierarchy + status (which providers are live vs demo)
//
// Node runtime: live rendering uses sharp (raster composite) + firebase-admin
// (Storage upload), both of which require Node — not the edge runtime.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const action = typeof body.action === "string" ? body.action : "generate";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

  // Generation hits paid providers → must be authenticated + throttled + bounded,
  // or it is an anonymous denial-of-wallet. (theme/estimate are free + local.)
  if (action === "generate") {
    const rl = rateLimit(clientKey(req, "image-generate"), 20, 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (action === "theme") {
    return NextResponse.json(extractBrandTheme({
      business: str("business"),
      detectedColours: Array.isArray(body.detectedColours) ? body.detectedColours.map(String) : undefined,
    }));
  }

  const options: CreativeOptions = { ...DEFAULT_CREATIVE_OPTIONS, ...(typeof body.options === "object" && body.options ? (body.options as Partial<CreativeOptions>) : {}) };
  const quality = (["draft", "standard", "premium", "edit", "bulk"].includes(String(body.quality)) ? body.quality : "standard") as ImageQuality;

  // The brand's REAL identity (captured at onboarding / Brand Studio): a hosted
  // logo, a hosted product photo and the brand's colour palette. These make
  // "use my logo / my brand colours / my product photo" real, not placeholders.
  const logoUrl = str("logoUrl");
  const productImageUrl = str("productImageUrl");
  const brandColours = Array.isArray(body.brandColours) ? body.brandColours.map(String).filter(Boolean) : [];
  const nowISO = str("nowISO") || "1970-01-01T00:00:00.000Z";
  const referenceAssets: ImageGenerationRequest["referenceAssets"] = [];
  if (logoUrl) referenceAssets.push({ id: "logo", businessId: str("business") || "", uploadedBy: "", assetType: "logo", fileUrl: logoUrl, fileName: "logo", mimeType: "image/*", fileSize: 0, aiDetectedColours: brandColours.length ? brandColours : undefined, usageRightsConfirmed: true, createdAt: nowISO });
  if (productImageUrl) referenceAssets.push({ id: "product", businessId: str("business") || "", uploadedBy: "", assetType: "product_image", fileUrl: productImageUrl, fileName: "product", mimeType: "image/*", fileSize: 0, usageRightsConfirmed: true, createdAt: nowISO });

  const brandTheme = brandColours.length
    ? extractBrandTheme({ business: str("business"), detectedColours: brandColours })
    : undefined;

  const genReq: ImageGenerationRequest = {
    business: str("business"),
    prompt: str("prompt") || "Brand-consistent advertising creative",
    headline: str("headline"),
    offerText: str("offerText"),
    cta: str("cta"),
    options,
    quality,
    variants: Math.max(1, Math.min(8, typeof body.variants === "number" ? body.variants : 3)),
    locale: str("locale"),
    referenceAssets: referenceAssets.length ? referenceAssets : undefined,
    brandTheme,
  };

  if (action === "estimate") {
    const provider = IMAGE_PROVIDERS.find((p) => p.id === body.providerId) ?? IMAGE_PROVIDERS.find((p) => p.id === "gemini-nano-banana-2")!;
    return NextResponse.json(estimateImageCost(provider, genReq));
  }

  if (action === "generate") {
    const results = await generateImage(genReq);
    return NextResponse.json({ variants: results, mode: results[0]?.mode ?? "demo" });
  }

  return NextResponse.json({ error: "Unknown action — use generate, estimate or theme" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Visual Creation Engine — multi-provider image gateway",
    providers: imageProviderStatus(),
    doctrine: "Logo overlaid programmatically (never redrawn); on-image text rendered exactly; retail ≥ 4× provider cost (never below the 2× floor); every creative uses uploaded assets or the logo colour theme — never generic.",
  });
}
