// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Revenue Attribution + Viral-to-Revenue Engine — the Revenue
// Attribution Agent's deterministic core.
//
// Two jobs, one honest lens:
//  1. Viral-to-revenue funnel: take whatever counts a business actually has
//     (impressions → … → referrals) and show where the money leaks — the
//     biggest drop-off stage — plus estimated revenue from real purchases.
//  2. Channel attribution: given observed conversion touchpoints, split the
//     credit with a U-shaped (position-based) model so first-touch discovery
//     and last-touch closing each get their due, mid-touches assist.
//
// Distinct from roi-engine.ts: roi-engine allocates *budget* by predicted CAC;
// this engine attributes *earned revenue* backwards across stages and channels.
//
// Deterministic + demo-safe: no Date.now/new Date/Math.random. Every figure is
// derived only from supplied counts and is labelled an ESTIMATE — conversions
// are never fabricated. Seeded hash is available for any derived id/jitter but
// funnel/attribution maths are exact so results are reproducible.

const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const round2 = (n: number): number => Math.round(n * 100) / 100;
const nn = (v: number | undefined, fallback = 0): number => (typeof v === "number" && isFinite(v) && v >= 0 ? v : fallback);

// The full viral-to-revenue funnel, most-visible to most-valuable.
export const FUNNEL_STAGES = [
  "impression",
  "attention",
  "engagement",
  "click",
  "lead",
  "purchase",
  "repeat_purchase",
  "referral",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export type ViralFunnelInput = {
  impressions: number;
  attention?: number;
  engagement?: number;
  clicks?: number;
  leads?: number;
  purchases?: number;
  repeatPurchases?: number;
  referrals?: number;
  avgOrderValueGbp?: number;
};

export type FunnelStageResult = {
  stage: FunnelStage;
  count: number;
  rateFromPrev: number; // 0–1, share retained from the previous stage (ESTIMATE)
};

export type ViralFunnelResult = {
  stages: FunnelStageResult[];
  biggestDropOff: FunnelStage;
  revenueGbp: number;
  note: string;
};

// Build the 8-stage funnel from supplied counts only. Missing downstream counts
// default to 0 (we never invent conversions). rateFromPrev is retained share
// vs the immediately-previous stage; the largest drop is flagged.
export function viralToRevenue(input: ViralFunnelInput): ViralFunnelResult {
  const impressions = nn(input.impressions);
  const counts: Record<FunnelStage, number> = {
    impression: impressions,
    attention: nn(input.attention),
    engagement: nn(input.engagement),
    click: nn(input.clicks),
    lead: nn(input.leads),
    purchase: nn(input.purchases),
    repeat_purchase: nn(input.repeatPurchases),
    referral: nn(input.referrals),
  };

  const stages: FunnelStageResult[] = FUNNEL_STAGES.map((stage, i) => {
    const count = counts[stage];
    if (i === 0) return { stage, count, rateFromPrev: 1 };
    const prev = counts[FUNNEL_STAGES[i - 1]];
    const rateFromPrev = prev > 0 ? round2(count / prev) : 0;
    return { stage, count, rateFromPrev };
  });

  // Biggest drop-off = the transition (from stage i-1 → i) losing the most
  // absolute count, considering only stages where the previous had volume.
  let biggestDropOff: FunnelStage = FUNNEL_STAGES[1];
  let worstLoss = -1;
  for (let i = 1; i < FUNNEL_STAGES.length; i++) {
    const prev = counts[FUNNEL_STAGES[i - 1]];
    const cur = counts[FUNNEL_STAGES[i]];
    const loss = prev - cur;
    if (prev > 0 && loss > worstLoss) {
      worstLoss = loss;
      biggestDropOff = FUNNEL_STAGES[i];
    }
  }

  const aov = nn(input.avgOrderValueGbp);
  const revenueGbp = round2(counts.purchase * aov);

  return {
    stages,
    biggestDropOff,
    revenueGbp,
    note: `ESTIMATE from supplied counts only — revenue = purchases (${counts.purchase}) x AOV (£${aov}). Biggest leak: entering '${biggestDropOff}'. No conversions are fabricated.`,
  };
}

export type Touchpoint = {
  channel: string;
  position: "first" | "mid" | "last";
  conversions: number;
  revenueGbp: number;
};

export type ChannelAttribution = {
  channel: string;
  attributedRevenueGbp: number;
  attributedConversions: number;
};

export type ChannelAttributionResult = {
  byChannel: ChannelAttribution[];
  model: "u-shaped";
  totalRevenueGbp: number;
};

// U-shaped (position-based) attribution weights.
const U_SHAPED: Record<Touchpoint["position"], number> = { first: 0.4, mid: 0.2, last: 0.4 };

// Split each observed touchpoint's revenue/conversions by its position weight,
// then aggregate per channel. Credit is only ever assigned from supplied data.
export function attributeChannels(touchpoints: Touchpoint[]): ChannelAttributionResult {
  const acc = new Map<string, ChannelAttribution>();
  let totalRevenueGbp = 0;

  for (const tp of touchpoints) {
    const channel = typeof tp.channel === "string" && tp.channel.length > 0 ? tp.channel : "unattributed";
    const weight = U_SHAPED[tp.position] ?? 0.2;
    const conversions = nn(tp.conversions);
    const revenue = nn(tp.revenueGbp);
    const addRevenue = revenue * weight;
    const addConversions = conversions * weight;
    totalRevenueGbp += addRevenue;

    const existing = acc.get(channel);
    if (existing) {
      existing.attributedRevenueGbp = round2(existing.attributedRevenueGbp + addRevenue);
      existing.attributedConversions = round2(existing.attributedConversions + addConversions);
    } else {
      acc.set(channel, {
        channel,
        attributedRevenueGbp: round2(addRevenue),
        attributedConversions: round2(addConversions),
      });
    }
  }

  const byChannel = Array.from(acc.values()).sort((a, b) => b.attributedRevenueGbp - a.attributedRevenueGbp);
  return { byChannel, model: "u-shaped", totalRevenueGbp: round2(totalRevenueGbp) };
}

export type ContentRoiInput = { contentCostGbp: number; attributedRevenueGbp: number };

export type ContentRoiResult = {
  roi: number; // net-return multiple (ESTIMATE): (revenue - cost) / cost
  roiPct: number;
  verdict: "scale" | "keep" | "cut";
};

// Content ROI from attributed revenue vs its production/promotion cost.
export function contentRoi(input: ContentRoiInput): ContentRoiResult {
  const cost = nn(input.contentCostGbp);
  const revenue = nn(input.attributedRevenueGbp);
  const roi = cost > 0 ? round2((revenue - cost) / cost) : 0;
  const roiPct = Math.round(roi * 100);
  const verdict: ContentRoiResult["verdict"] = roi >= 1 ? "scale" : roi >= 0 ? "keep" : "cut";
  return { roi, roiPct, verdict };
}

export type DemoAttribution = {
  funnel: ViralFunnelResult;
  channels: ChannelAttributionResult;
  contentRoi: ContentRoiResult;
  demoSeed: number;
};

// Zero-config fully-populated example (all figures ESTIMATES from these inputs).
export function demoAttribution(): DemoAttribution {
  const funnel = viralToRevenue({
    impressions: 120000,
    attention: 42000,
    engagement: 18500,
    clicks: 9200,
    leads: 2100,
    purchases: 640,
    repeatPurchases: 190,
    referrals: 310,
    avgOrderValueGbp: 48,
  });

  const channels = attributeChannels([
    { channel: "tiktok", position: "first", conversions: 640, revenueGbp: 30720 },
    { channel: "email", position: "mid", conversions: 420, revenueGbp: 20160 },
    { channel: "whatsapp", position: "last", conversions: 380, revenueGbp: 18240 },
    { channel: "referral", position: "last", conversions: 310, revenueGbp: 14880 },
  ]);

  const roi = contentRoi({ contentCostGbp: 3500, attributedRevenueGbp: channels.totalRevenueGbp });

  return { funnel, channels, contentRoi: roi, demoSeed: seed("attribution-demo") };
}
