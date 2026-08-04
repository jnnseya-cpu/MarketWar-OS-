import { NextRequest, NextResponse } from "next/server";
import { generateImage, imageProviderStatus, extractBrandTheme, estimateImageCost } from "@/backend/image-gateway";
import { DEFAULT_CREATIVE_OPTIONS, IMAGE_PROVIDERS, type CreativeOptions, type ImageGenerationRequest, type ImageQuality } from "@/shared/creative";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import { meterAction, creditAcus, ACTION_COST_ACU } from "@/backend/wallet";

// AI Visual Creation Engine API (multi-provider image gateway).
// POST { action: "generate", ... } → N brand-safe creative variants
// POST { action: "estimate", ... } → cost/ACU estimate before generation
// POST { action: "theme", business?, detectedColours? } → 6-colour brand theme
// GET → provider hierarchy + status (which providers are live vs demo)
//
// Node runtime: live rendering uses sharp (raster composite) + firebase-admin
// (Storage upload), both of which require Node — not the edge runtime.
export const runtime = "nodejs";
// Reserves the platform maximum. This route does slow external work (renders images through a provider),
// and without a budget the function is killed part-way through: the caller
// gets no JSON at all — just "Request failed" — and any work already done
// goes unreported, which is how a send gets repeated.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const action = typeof body.action === "string" ? body.action : "generate";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

  // Generation hits paid providers → must be authenticated + throttled + bounded,
  // or it is an anonymous denial-of-wallet. (theme/estimate are free + local.)
  // Metered here rather than at the call site so the wallet is charged BEFORE
  // the provider is asked for anything: a customer must never end up with a
  // debit and no image, and must never end up with an image and no debit.
  // Charged per variant, because that is what the provider bills us for.
  let meterVariants = 1;
  if (action === "generate") {
    const rl = rateLimit(clientKey(req, "image-generate"), 20, 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    meterVariants = Math.max(1, Math.min(8, Number(body.variants) || 1));
    const meter = await meterAction(auth, "image", meterVariants);
    if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });
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

  // Build a MEANINGFUL scene brief. "Brand-consistent advertising creative" told
  // the image model nothing, so it fell back to generic stock product photography
  // (bottles/boxes) even for a B2B software brand. Describe what the business
  // actually sells and to whom, so the scene is relevant to THIS brand.
  const sceneFromContext = () => {
    const parts: string[] = [];
    const product = str("product"); const industry = str("industry"); const audience = str("audience");
    if (product) parts.push(`what they sell: ${product}`);
    if (industry) parts.push(`industry: ${industry}`);
    if (audience) parts.push(`audience: ${audience}`);
    if (!parts.length) return `An advertising scene that visually represents what ${str("business") || "this brand"} actually sells — infer it from the brand name and keep it abstract and premium rather than inventing an unrelated physical product.`;
    return `An advertising scene that visually represents this business — ${parts.join("; ")}. Depict the real context in which this is used, not an unrelated product still-life.`;
  };

  const genReq: ImageGenerationRequest = {
    business: str("business"),
    prompt: str("prompt") || sceneFromContext(),
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
    try {
      const results = await generateImage(genReq);
      return NextResponse.json({ variants: results, mode: results[0]?.mode ?? "demo" });
    } catch (e) {
      // Charged and nothing delivered is the one outcome that must not survive.
      const auth = await requireAuth(req);
      if (auth.ok) await creditAcus(auth.uid || "", ACTION_COST_ACU.image * meterVariants).catch(() => {});
      throw e;
    }
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
