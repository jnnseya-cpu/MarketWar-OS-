// Active-brand model (client-safe, pure data).
//
// One company runs multiple brands (owner ruling: one account, one bill, many
// brands — docs/ai-os/02 §U1a). A Brand carries the fields every engine/agent
// needs, so selecting a brand re-skins the whole OS: each module form and each
// AI call is filled from the ACTIVE brand. No third-party key is involved —
// differentiation comes from the brand's own inputs + AI + persistence.

export type Brand = {
  id: string;
  name: string;        // the business name (maps to the "business" field)
  industry: string;
  product: string;     // what they sell
  audience: string;    // who they want
  location: string;
  offer: string;       // current promotion/offer
  website: string;
  goal: string;        // current objective
  color: string;       // avatar accent (from the validated palette)
  // Brand identity — captured at onboarding / brand edit, hosted on Firebase
  // Storage, and reused across every creative so "use my logo / my brand
  // colours / my product photo" are real, not placeholders.
  logoUrl?: string;          // hosted logo (public URL)
  brandColours?: string[];   // brand colour palette (hex), user-set or logo-extracted
  productImageUrl?: string;  // a hosted product/hero photo to build creatives on
  bvi?: number;        // Business Vitality Index (display only)
  acuBurnMonth?: number;
};

// The form field keys owned by a brand — used to blank demo defaults on a clean
// slate (no brand added yet) so a real company never sees sample data.
export const BRAND_FIELD_KEYS = new Set(["business", "product", "audience", "location", "offer", "industry", "goal", "website"]);

// Field-key → value map spread into module forms + agent calls. Keys match the
// common AgentRunner field keys used across the dashboard, so one mapping feeds
// every page. Empty values are omitted so a form's own default can stand.
export function brandDefaults(brand: Brand | null | undefined): Record<string, string> {
  if (!brand) return {};
  const out: Record<string, string> = {
    business: brand.name,
    product: brand.product,
    audience: brand.audience,
    location: brand.location,
    offer: brand.offer,
    industry: brand.industry,
    goal: brand.goal,
    website: brand.website,
  };
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

// Palette accents for brand avatars (from src/shared/palette.ts SERIES).
const BRAND_COLORS = ["#3987e5", "#199e70", "#c98500", "#9085e9", "#e66767", "#d55181", "#d95926"];

export function newBrand(input: Partial<Brand> & { name: string }): Brand {
  // Deterministic id + colour from the name (no Date.now/Math.random — keeps
  // demo + tests stable; collisions resolved by the store on add).
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "brand";
  let hash = 0;
  for (let i = 0; i < input.name.length; i++) hash = (hash * 31 + input.name.charCodeAt(i)) >>> 0;
  return {
    id: slug,
    name: input.name,
    industry: input.industry ?? "",
    product: input.product ?? "",
    audience: input.audience ?? "",
    location: input.location ?? "",
    offer: input.offer ?? "",
    website: input.website ?? "",
    goal: input.goal ?? "",
    color: input.color ?? BRAND_COLORS[hash % BRAND_COLORS.length],
    bvi: input.bvi,
    acuBurnMonth: input.acuBurnMonth,
  };
}

// Clean slate: NO seeded demo brands. A real company starts empty and adds its
// own brands (via the switcher's "Add a brand" or onboarding), so no sample data
// ("Brixton Grill House" etc.) ever appears in a real workspace. Sample brands
// used for internal demos live in src/shared/demo.ts, not here.
export const SEED_BRANDS: Brand[] = [];
