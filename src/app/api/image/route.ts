import { NextRequest, NextResponse } from "next/server";
import { generateImage, imageProviderStatus, extractBrandTheme, estimateImageCost } from "@/backend/image-gateway";
import { DEFAULT_CREATIVE_OPTIONS, IMAGE_PROVIDERS, type CreativeOptions, type ImageGenerationRequest, type ImageQuality } from "@/shared/creative";

// AI Visual Creation Engine API (multi-provider image gateway).
// POST { action: "generate", ... } → N brand-safe creative variants
// POST { action: "estimate", ... } → cost/ACU estimate before generation
// POST { action: "theme", business?, detectedColours? } → 6-colour brand theme
// GET → provider hierarchy + status (which providers are live vs demo)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const action = typeof body.action === "string" ? body.action : "generate";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

  if (action === "theme") {
    return NextResponse.json(extractBrandTheme({
      business: str("business"),
      detectedColours: Array.isArray(body.detectedColours) ? body.detectedColours.map(String) : undefined,
    }));
  }

  const options: CreativeOptions = { ...DEFAULT_CREATIVE_OPTIONS, ...(typeof body.options === "object" && body.options ? (body.options as Partial<CreativeOptions>) : {}) };
  const quality = (["draft", "standard", "premium", "edit", "bulk"].includes(String(body.quality)) ? body.quality : "standard") as ImageQuality;
  const genReq: ImageGenerationRequest = {
    business: str("business"),
    prompt: str("prompt") || "Brand-consistent advertising creative",
    headline: str("headline"),
    offerText: str("offerText"),
    cta: str("cta"),
    options,
    quality,
    variants: typeof body.variants === "number" ? body.variants : 3,
    locale: str("locale"),
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
