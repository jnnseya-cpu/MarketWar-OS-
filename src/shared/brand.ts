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
  bvi?: number;        // Business Vitality Index (display only)
  acuBurnMonth?: number;
};

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

// Seed brands so the dashboard has content with zero config. Preserves the
// existing demo identities (Brixton Grill House first) so nothing regresses.
export const SEED_BRANDS: Brand[] = [
  { id: "brixton-grill", name: "Brixton Grill House", industry: "Restaurant & Food Delivery", product: "Flame-grilled meals, family platters, office catering", audience: "Hungry locals within 3 miles + SW9 offices", location: "Brixton, London", offer: "Feed 4 for £25 — Fridays only", website: "brixtongrill.co.uk", goal: "40 new weekly orders + 15 office catering contracts", color: "#199e70", bvi: 74, acuBurnMonth: 512 },
  { id: "nseya-beauty", name: "Nseya Beauty Studio", industry: "Beauty & Personal Care", product: "Lash, brow and skin treatments + retail skincare", audience: "Women 22–45 within 5 miles who book online", location: "Croydon, London", offer: "First facial 30% off this month", website: "nseyabeauty.com", goal: "60 bookings/month + retail attach", color: "#d55181", bvi: 68, acuBurnMonth: 231 },
  { id: "carter-fitness", name: "Carter Fitness Coaching", industry: "Health & Fitness Services", product: "1:1 coaching, small-group PT, online programmes", audience: "Busy professionals 30–50 wanting to lose weight", location: "Manchester", offer: "6-week transformation trial £99", website: "carterfit.co.uk", goal: "20 new coaching clients this quarter", color: "#9085e9", bvi: 81, acuBurnMonth: 109 },
];
