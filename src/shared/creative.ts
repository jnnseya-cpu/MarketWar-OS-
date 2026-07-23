// AI Visual Creation Engine — shared domain types (spec STEP 5 + Brand Asset
// Library + Logo-Aware Image Creation). Pure data/types: no Node or browser
// APIs, importable by both the backend image gateway and the studio UI.

// --------------------------------------------------------------- Brand assets
// The Brand Asset Library stores everything a business uploads once and reuses
// across every campaign — the raw material for brand-consistent creative.
export type AssetType =
  | "logo" | "product_image" | "service_image" | "team_image" | "customer_image"
  | "venue_image" | "before_after_image" | "testimonial_video" | "promo_video"
  | "event_video" | "existing_ad" | "background_image" | "brand_pattern";

export type BrandAsset = {
  id: string;
  businessId: string;
  uploadedBy: string;
  assetType: AssetType;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  // AI colour extraction (populated on upload) — drives brand-colour theming.
  aiDetectedColours?: string[];
  dominantColour?: string;
  secondaryColour?: string;
  accentColour?: string;
  aiDescription?: string;
  // Consent/usage-rights gate — customer/team/testimonial media cannot be used
  // in paid distribution until this is true (mirrors the video-compliance rule).
  usageRightsConfirmed: boolean;
  createdAt: string; // ISO
};

// --------------------------------------------------------------- Generation
export type ImageQuality = "draft" | "standard" | "premium" | "edit" | "bulk";
export type PlatformFormat =
  | "facebook" | "instagram" | "tiktok" | "linkedin" | "whatsapp" | "story" | "reel" | "banner";
export type LogoPosition =
  | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "centre" | "watermark";
export type ImageCapability =
  | "text_rendering" | "logo_preservation" | "reference_images" | "editing" | "high_resolution" | "bulk";

// The user-facing creative options (spec "Required User Options").
export type CreativeOptions = {
  useLogo: boolean;
  logoPosition: LogoPosition;
  useBrandColours: boolean;
  useProductPhoto: boolean;
  useUploadedBase: boolean;
  generateNewBackground: boolean;
  addCtaButton: boolean;
  addOfferText: boolean;
  platformFormat: PlatformFormat;
};

export const DEFAULT_CREATIVE_OPTIONS: CreativeOptions = {
  useLogo: true,
  logoPosition: "top-left",
  useBrandColours: true,
  useProductPhoto: false,
  useUploadedBase: false,
  generateNewBackground: true,
  addCtaButton: true,
  addOfferText: true,
  platformFormat: "instagram",
};

// Native pixel dimensions per platform format.
export const FORMAT_DIMENSIONS: Record<PlatformFormat, { w: number; h: number; label: string }> = {
  facebook: { w: 1200, h: 1200, label: "Facebook 1:1" },
  instagram: { w: 1080, h: 1350, label: "Instagram 4:5" },
  tiktok: { w: 1080, h: 1920, label: "TikTok 9:16" },
  linkedin: { w: 1200, h: 1200, label: "LinkedIn 1:1" },
  whatsapp: { w: 1080, h: 1080, label: "WhatsApp 1:1" },
  story: { w: 1080, h: 1920, label: "Story 9:16" },
  reel: { w: 1080, h: 1920, label: "Reel 9:16" },
  banner: { w: 1500, h: 500, label: "Banner 3:1" },
};

// --------------------------------------------------------------- Providers
// Provider-neutral catalog. The router picks between these; the gateway owns
// the actual API calls so feature code never talks to a vendor directly.
export type ImageProviderId =
  | "gemini-nano-banana-2-lite" | "gemini-nano-banana-2" | "gemini-nano-banana-pro"
  | "gpt-image-2" | "flux-klein" | "flux-pro" | "flux-max" | "demo";

export type ImageProviderMeta = {
  id: ImageProviderId;
  label: string;
  model: string; // the API model id
  vendor: "google" | "openai" | "bfl" | "internal";
  tier: "draft" | "standard" | "premium" | "edit" | "bulk";
  // Indicative provider output cost (USD) per image by quality — used for the
  // ACU estimate. Sources: OpenAI GPT Image 2 pricing is published; the others
  // are indicative and configurable via env overrides at go-live.
  costUsd: { draft: number; standard: number; premium: number };
  capabilities: ImageCapability[];
  envKey: string; // env var that activates the live provider
  openWeight?: boolean; // FLUX open-weight → future self-hosting route
};

// The final provider hierarchy from the owner's spec.
export const IMAGE_PROVIDERS: ImageProviderMeta[] = [
  {
    id: "gemini-nano-banana-2-lite", label: "Gemini Nano Banana 2 Lite", model: "gemini-3.1-flash-image-lite",
    vendor: "google", tier: "draft", costUsd: { draft: 0.002, standard: 0.004, premium: 0.008 },
    capabilities: ["text_rendering", "reference_images"], envKey: "GEMINI_API_KEY",
  },
  {
    id: "gemini-nano-banana-2", label: "Gemini Nano Banana 2", model: "gemini-3.1-flash-image",
    vendor: "google", tier: "standard", costUsd: { draft: 0.01, standard: 0.03, premium: 0.06 },
    capabilities: ["text_rendering", "logo_preservation", "reference_images", "editing", "high_resolution"], envKey: "GEMINI_API_KEY",
  },
  {
    id: "gemini-nano-banana-pro", label: "Gemini Nano Banana Pro", model: "gemini-3-pro-image",
    vendor: "google", tier: "premium", costUsd: { draft: 0.04, standard: 0.08, premium: 0.12 },
    capabilities: ["text_rendering", "logo_preservation", "reference_images", "editing", "high_resolution"], envKey: "GEMINI_API_KEY",
  },
  {
    id: "gpt-image-2", label: "OpenAI GPT Image 2", model: "gpt-image-2",
    vendor: "openai", tier: "edit", costUsd: { draft: 0.006, standard: 0.047, premium: 0.188 },
    capabilities: ["editing", "reference_images", "text_rendering", "high_resolution"], envKey: "OPENAI_API_KEY",
  },
  {
    id: "flux-klein", label: "FLUX.2 Klein", model: "flux-2-klein",
    vendor: "bfl", tier: "bulk", costUsd: { draft: 0.003, standard: 0.006, premium: 0.012 },
    capabilities: ["reference_images", "bulk"], envKey: "BFL_API_KEY", openWeight: true,
  },
  {
    id: "flux-pro", label: "FLUX.2 Pro", model: "flux-2-pro",
    vendor: "bfl", tier: "standard", costUsd: { draft: 0.02, standard: 0.04, premium: 0.06 },
    capabilities: ["reference_images", "high_resolution", "bulk"], envKey: "BFL_API_KEY",
  },
  {
    id: "flux-max", label: "FLUX.2 Max", model: "flux-2-max",
    vendor: "bfl", tier: "premium", costUsd: { draft: 0.04, standard: 0.08, premium: 0.11 },
    capabilities: ["reference_images", "high_resolution"], envKey: "BFL_API_KEY",
  },
  {
    id: "demo", label: "Demo Composer (zero-config)", model: "svg-brand-composer",
    vendor: "internal", tier: "draft", costUsd: { draft: 0, standard: 0, premium: 0 },
    capabilities: ["text_rendering", "logo_preservation"], envKey: "",
  },
];

// --------------------------------------------------------------- Pricing
// Owner pricing law: margin never below 100% (retail ≥ 2× provider cost). The
// image engine applies a 4× multiplier because the delivered cost includes
// generation + reference input + prompt + storage + QC + retries + moderation
// + infra (spec) — still enforced never below the 2× floor.
export const IMAGE_MARGIN_MULTIPLIER = 4;
export const IMAGE_MARGIN_FLOOR = 2;
export const ACU_PER_GBP = 100; // £1 = 100 ACUs
export const USD_TO_GBP = 0.79;

// --------------------------------------------------------------- Brand theme
// The 6-colour theme extracted from the logo (spec "Brand Colour Extraction").
// Becomes the default theme for ad images, landing pages, CTA buttons, social
// posts, banners, email headers and WhatsApp promo graphics.
export type BrandTheme = {
  primary: string;
  secondary: string;
  accent: string;
  backgroundSafe: string; // readable behind body copy
  textSafe: string; // legible on the background
  cta: string; // highest-contrast action colour
  source: "logo" | "derived"; // logo = extracted from upload; derived = deterministic default
};

// --------------------------------------------------------------- Requests
export type ImageGenerationRequest = {
  business?: string;
  prompt: string; // the creative brief / scene
  headline?: string; // exact on-image headline (rendered by us, not the model)
  offerText?: string; // exact offer text
  cta?: string; // exact CTA label
  options: CreativeOptions;
  quality: ImageQuality;
  variants?: number; // how many variants to produce
  referenceAssets?: BrandAsset[]; // uploaded product/logo/base assets
  brandTheme?: BrandTheme; // pre-extracted, or the gateway derives one
  locale?: string; // for localised on-image language
};

export type ImageEditRequest = {
  baseImageUrl: string;
  instruction: string;
  options: CreativeOptions;
  brandTheme?: BrandTheme;
};

export type ImageRoutingFactors = {
  requestedQuality: ImageQuality;
  requiresTextRendering: boolean;
  requiresLogoPreservation: boolean;
  requiresReferenceImages: boolean;
  requiresEditing: boolean;
  requestedResolution: string;
  latencyTargetMs?: number;
  maximumProviderCost?: number;
  customerPlan: string;
  providerAvailability: Record<string, boolean>;
};

export type ImageCostEstimate = {
  providerUsd: number;
  retailGbp: number;
  acus: number;
  marginMultiplier: number;
  breakdown: string[];
};

export type ImageResult = {
  imageUrl: string; // ALWAYS an inline data URI — guaranteed to render in the browser
  hostedUrl?: string; // a postable hosted URL when Storage is configured (for publishing)
  provider: ImageProviderId;
  model: string;
  mode: "live" | "demo";
  width: number;
  height: number;
  format: PlatformFormat;
  brandTheme: BrandTheme;
  brandSafe: boolean; // logo overlaid programmatically + text rendered exactly
  variantIndex: number;
  cost: ImageCostEstimate;
  notes: string[];
  attempts?: { provider: ImageProviderId; error: string }[];
};
