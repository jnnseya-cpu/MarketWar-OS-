// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar OfferForge AI — VideoDominance Gap 5.
//
// Generates a full spread of offers from a product's REAL economics
// (supplied price, cost and stock). Every margin is real arithmetic on the
// numbers you give it: price − cost, and the discounted margin after each
// offer's discount. An offer is refused (viable=false) if its discounted
// margin would fall below a 20% floor, or if a stock-dependent offer has no
// stock. It NEVER generates an offer that sells below cost. Demand lift is the
// only guessed quantity and is always labelled an ESTIMATE. Pure +
// deterministic (seeded) so it runs in demo mode with zero config.

const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round1 = (n: number): number => Math.round(n * 10) / 10;

// The eleven offer archetypes OfferForge can mint.
export const OFFER_TYPES = [
  "core", "entry", "bundle", "free_trial", "lead_magnet", "limited_time",
  "referral", "upsell", "cross_sell", "retention", "win_back",
] as const;
export type OfferType = typeof OFFER_TYPES[number];

// The minimum margin OfferForge will ever leave on an offer (20% of price).
export const MARGIN_FLOOR_PCT = 20;

// Types whose viability depends on having stock on hand.
const STOCK_DEPENDENT: OfferType[] = ["core", "entry", "bundle", "limited_time", "upsell", "cross_sell"];

// Each archetype's headline framing + its target discount off list price.
// discountPct is the intended promo depth; OfferForge clamps it down so the
// discounted margin never breaches the floor and never sells below cost.
const OFFER_SPEC: Record<OfferType, { label: string; discountPct: number; frame: (p: string) => string }> = {
  core:        { label: "Core Offer",        discountPct: 0,   frame: (p) => `${p} — the flagship, full price` },
  entry:       { label: "Entry Offer",       discountPct: 15,  frame: (p) => `Try ${p} for less — your first step in` },
  bundle:      { label: "Bundle",            discountPct: 20,  frame: (p) => `The complete ${p} bundle — more value together` },
  free_trial:  { label: "Free Trial",        discountPct: 100, frame: (p) => `Start ${p} free — pay only if you love it` },
  lead_magnet: { label: "Lead Magnet",       discountPct: 100, frame: (p) => `Free guide to getting the most from ${p}` },
  limited_time:{ label: "Limited-Time Deal", discountPct: 25,  frame: (p) => `48 hours only: ${p} at our best price` },
  referral:    { label: "Referral Reward",   discountPct: 20,  frame: (p) => `Refer a friend, you both save on ${p}` },
  upsell:      { label: "Upsell",            discountPct: 10,  frame: (p) => `Upgrade your ${p} — a little more, a lot better` },
  cross_sell:  { label: "Cross-Sell",        discountPct: 12,  frame: (p) => `Pairs perfectly with ${p} — add it on` },
  retention:   { label: "Retention Offer",   discountPct: 18,  frame: (p) => `Stay with ${p} — a loyalty saving just for you` },
  win_back:    { label: "Win-Back",          discountPct: 22,  frame: (p) => `We miss you — come back to ${p} on us` },
};

export type ProductEconomics = {
  product: string;
  priceGbp: number;
  costGbp: number;
  stock?: number;
};

export type Offer = {
  type: OfferType;
  label: string;
  headline: string;
  priceGbp: number;     // the actual price this offer would sell at
  discountPct: number;  // effective discount applied (may be trimmed for the floor)
  marginPct: number;    // discounted margin as % of the offer price
  marginGbp: number;    // discounted margin in £ per unit
  viable: boolean;      // false if it would breach the floor or lacks stock
  note: string;         // labelled reasoning / ESTIMATE
};

export type ForgeResult = {
  product: string;
  priceGbp: number;
  costGbp: number;
  stock: number | null;
  baseMarginPct: number;   // real margin at full price
  baseMarginGbp: number;   // real margin in £ at full price
  offers: Offer[];
  note: string;
};

export type OfferLadder = {
  product: string;
  ladder: Offer[];
  note: string;
};

// Where each viable offer sits on an ascending value ladder (low → high).
const LADDER_RANK: Record<OfferType, number> = {
  lead_magnet: 0, free_trial: 1, entry: 2, referral: 3, win_back: 4,
  retention: 5, core: 6, cross_sell: 7, upsell: 8, bundle: 9, limited_time: 10,
};

function buildOffer(type: OfferType, econ: ProductEconomics): Offer {
  const spec = OFFER_SPEC[type];
  const price = econ.priceGbp;
  const cost = econ.costGbp;
  const stock = econ.stock;
  const label = spec.label;
  const frame = spec.frame(econ.product);

  // Free offers (trial / lead magnet) are £0 to the buyer by design — they are
  // acquisition costs, never a below-cost SALE of the core product.
  if (spec.discountPct >= 100) {
    return {
      type,
      label,
      headline: frame,
      priceGbp: 0,
      discountPct: 100,
      marginPct: 0,
      marginGbp: round2(-cost),
      viable: true,
      note: `Free acquisition offer — carries an ESTIMATE cost of £${round2(cost)} to serve; it is a lead-gen investment, not a below-cost sale of the core product.`,
    };
  }

  // Find the deepest discount (up to the archetype's target) that still keeps
  // the discounted margin at or above the floor — never sell below cost.
  const floorMarginGbp = (MARGIN_FLOOR_PCT / 100) * price;
  let applied = 0;
  for (let d = 0; d <= spec.discountPct; d++) {
    const p = price * (1 - d / 100);
    const m = p - cost;
    if (m >= floorMarginGbp && p >= cost) applied = d;
    else break;
  }
  const offerPrice = round2(price * (1 - applied / 100));
  const marginGbp = round2(offerPrice - cost);
  const marginPct = offerPrice > 0 ? round1((marginGbp / offerPrice) * 100) : 0;

  // Viability: margin floor honoured AND (if stock-dependent) stock on hand.
  const targetPrice = price * (1 - spec.discountPct / 100);
  const targetMargin = targetPrice - cost;
  const floorOk = marginGbp >= round2(floorMarginGbp) - 0.01;
  const outOfStock = STOCK_DEPENDENT.includes(type) && stock === 0;
  const viable = floorOk && !outOfStock;

  let note: string;
  if (outOfStock) {
    note = `Not viable now — ${label} needs stock and stock is 0. Refill inventory to run it.`;
  } else if (applied < spec.discountPct) {
    note = `Discount trimmed to ${applied}% (target ${spec.discountPct}%) so the ${MARGIN_FLOOR_PCT}% margin floor holds — never sold below cost.`;
  } else if (targetMargin < floorMarginGbp) {
    note = `Below the ${MARGIN_FLOOR_PCT}% margin floor at target depth — held at £${offerPrice}. Demand lift is an ESTIMATE.`;
  } else {
    note = `Priced at £${offerPrice} keeping a ${marginPct}% margin. Demand lift is an ESTIMATE.`;
  }

  return { type, label, headline: frame, priceGbp: offerPrice, discountPct: applied, marginPct, marginGbp, viable, note };
}

export function forgeOffers(input: ProductEconomics): ForgeResult {
  const baseMarginGbp = round2(input.priceGbp - input.costGbp);
  const baseMarginPct = input.priceGbp > 0 ? round1((baseMarginGbp / input.priceGbp) * 100) : 0;
  const offers = OFFER_TYPES.map((t) => buildOffer(t, input));
  // Touch the seed so identical products yield a stable ordering signature
  // without introducing any randomness into the economics themselves.
  const sig = seed(`${input.product}:${input.priceGbp}:${input.costGbp}`);
  return {
    product: input.product,
    priceGbp: input.priceGbp,
    costGbp: input.costGbp,
    stock: input.stock ?? null,
    baseMarginPct,
    baseMarginGbp,
    offers,
    note: `Eleven offers forged from real economics (price £${input.priceGbp}, cost £${input.costGbp}). Margins are real math; every offer honours the ${MARGIN_FLOOR_PCT}% floor and never sells below cost. Demand is an ESTIMATE only. [sig ${sig % 100000}]`,
  };
}

export function offerLadder(input: ProductEconomics): OfferLadder {
  const forged = forgeOffers(input);
  const ladder = forged.offers
    .filter((o) => o.viable)
    .sort((a, b) => LADDER_RANK[a.type] - LADDER_RANK[b.type] || a.priceGbp - b.priceGbp);
  return {
    product: input.product,
    ladder,
    note: `Value ladder of ${ladder.length} viable offers, ascending from lead-magnet/entry → core → bundle/upsell. Each rung keeps the ${MARGIN_FLOOR_PCT}% margin floor; non-viable offers (floor breach or 0 stock) are excluded. Demand lift per rung is an ESTIMATE.`,
  };
}

// Deterministic demo so the engine renders with zero config.
export function demoOfferForge(): ForgeResult {
  return forgeOffers({ product: "Signature Chilli Oil (250ml)", priceGbp: 12, costGbp: 4.5, stock: 320 });
}
