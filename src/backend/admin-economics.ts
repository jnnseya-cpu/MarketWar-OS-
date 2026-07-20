// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Platform-Owner Economics Engine — the utility-company back office.
//
// Doctrine (spec §16 Platform Profit Protection + "Administrative Controls"):
// MarketWar OS monetises USAGE, not access. Every AI action logs its true
// provider cost, and the platform owner — and ONLY the owner — sees gross
// margin. Users never see provider cost anywhere (that safeguard lives in
// acu.ts / the /api/acu surface); this module is the owner-side mirror that
// turns a cost ledger into the Owner Dashboard:
//
//   Total Revenue · Total Provider Cost · Gross Margin % · Revenue by
//   Provider / User / Feature · Most Expensive Users · Most Profitable Users ·
//   Cost-Leakage Alerts · Provider-Cost Trends · Forecast Profitability
//
// Plus the two structural margin amplifiers the spec calls out — ACU Recycling
// (generate once, sell many) and premium Export Charges — and the multi-layer
// revenue model. Pure and deterministic so it runs in demo mode and unit-checks.

import { ACU_PER_GBP, MARGIN_FLOOR, STRATEGIC_TARGET_MARGIN, quoteAcu, type ActionClass } from "@/backend/acu";

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const gbpFromAcus = (acus: number) => acus / ACU_PER_GBP;

// ---------------------------------------------------------------------------
// The cost ledger — one row per executed AI action. providerCostGbp is the
// TRUE cost and is owner-only; it never leaves this back-office surface.
// ---------------------------------------------------------------------------
export type LedgerEntry = {
  taskId: string;
  userId: string;
  feature: string;         // "Ad Creative", "Competitor Spy", "Video Commander"…
  provider: string;        // "claude", "gemini_flash", "groq", "cached"…
  period: string;          // sortable bucket for trends, e.g. "2026-W25"
  acusCharged: number;     // what the user paid, in ACUs (revenue)
  providerCostGbp: number; // TRUE provider cost — OWNER ONLY
  cached?: boolean;        // served from cache/recycled output (near-zero cost)
};

// Internal Cost Controls (spec §16) — the levers that lower the cost base so
// margin wins on efficiency, never by breaching the floor.
export const COST_CONTROLS = [
  "prompt caching", "output reuse", "template reuse", "small-model routing",
  "batch generation", "media compression", "generation queues",
  "provider fallback routing", "ACU wallet limits", "plan-based feature caps",
  "admin margin dashboard",
] as const;

// ACU Rules (spec §16) — enforced across the platform; listed here so the
// owner surface and the register share one source of truth.
export const ACU_RULES = [
  "Never run an expensive AI task without an ACU check.",
  "Never generate images without charging ACUs.",
  "Never run competitor scans without charging ACUs.",
  "Never run large database analysis without charging ACUs.",
  "Always cache reusable outputs.",
  "Always reuse previous business intelligence.",
  "Always prefer cheaper AI models first.",
  "Only use expensive models for premium tasks.",
  "Always log provider cost.",
  "Always show admin gross margin.",
] as const;

// Multi-layer revenue model (spec "Strategic Rule") — never one flat fee.
export const REVENUE_LAYERS = [
  "Subscription", "ACU Consumption", "Marketplace", "Transaction",
  "Advertising", "API", "Premium Agent",
] as const;

// ---------------------------------------------------------------------------
// Owner Dashboard — the whole back office in one call.
// ---------------------------------------------------------------------------
export type Breakdown = { key: string; revenueGbp: number; costGbp: number; grossMarginPct: number; share: number };
export type UserRoll = { userId: string; revenueGbp: number; costGbp: number; grossProfitGbp: number; grossMarginPct: number };
export type LeakAlert = { severity: "critical" | "warning"; scope: string; detail: string; marginPct: number };
export type TrendPoint = { period: string; revenueGbp: number; costGbp: number; grossMarginPct: number };

export type OwnerDashboard = {
  totalRevenueGbp: number;
  totalProviderCostGbp: number;
  grossProfitGbp: number;
  grossMarginPct: number;
  targetMarginPct: number; // strategic target as a %, for the gauge
  floorMarginPct: number;
  revenueByProvider: Breakdown[];
  revenueByFeature: Breakdown[];
  revenueByUser: Breakdown[];
  mostExpensiveUsers: UserRoll[];  // ranked by provider cost (watch-list)
  mostProfitableUsers: UserRoll[]; // ranked by gross profit
  costLeakageAlerts: LeakAlert[];
  providerCostTrend: TrendPoint[];
  forecastNextPeriod: TrendPoint;  // deterministic projection
  cacheHitRate: number;            // share of actions served from cache/recycle
  taskCount: number;
};

const marginPct = (rev: number, cost: number) => (cost > 0 ? round((rev - cost) / cost * 100, 0) : rev > 0 ? 100 : 0);

function rollup(entries: LedgerEntry[], keyOf: (e: LedgerEntry) => string, totalRev: number): Breakdown[] {
  const m = new Map<string, { rev: number; cost: number }>();
  for (const e of entries) {
    const k = keyOf(e);
    const cur = m.get(k) ?? { rev: 0, cost: 0 };
    cur.rev += gbpFromAcus(e.acusCharged);
    cur.cost += e.providerCostGbp;
    m.set(k, cur);
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, revenueGbp: round(v.rev), costGbp: round(v.cost), grossMarginPct: marginPct(v.rev, v.cost), share: totalRev > 0 ? round(v.rev / totalRev * 100, 1) : 0 }))
    .sort((a, b) => b.revenueGbp - a.revenueGbp);
}

export function ownerDashboard(entries: LedgerEntry[]): OwnerDashboard {
  const totalRevenueGbp = round(entries.reduce((s, e) => s + gbpFromAcus(e.acusCharged), 0));
  const totalProviderCostGbp = round(entries.reduce((s, e) => s + e.providerCostGbp, 0));
  const grossProfitGbp = round(totalRevenueGbp - totalProviderCostGbp);

  // Per-user roll-up for the two owner watch-lists.
  const userMap = new Map<string, { rev: number; cost: number }>();
  for (const e of entries) {
    const cur = userMap.get(e.userId) ?? { rev: 0, cost: 0 };
    cur.rev += gbpFromAcus(e.acusCharged);
    cur.cost += e.providerCostGbp;
    userMap.set(e.userId, cur);
  }
  const userRolls: UserRoll[] = [...userMap.entries()].map(([userId, v]) => ({
    userId, revenueGbp: round(v.rev), costGbp: round(v.cost),
    grossProfitGbp: round(v.rev - v.cost), grossMarginPct: marginPct(v.rev, v.cost),
  }));

  // Cost-leakage: any user whose blended margin sits below the floor is a real
  // leak; below the strategic target is a warning. Ranked worst-first.
  const costLeakageAlerts: LeakAlert[] = userRolls
    .filter((u) => u.grossMarginPct < (STRATEGIC_TARGET_MARGIN - 1) * 100)
    .map((u) => ({
      severity: (u.grossMarginPct < (MARGIN_FLOOR - 1) * 100 ? "critical" : "warning") as "critical" | "warning",
      scope: `user:${u.userId}`,
      detail: u.grossMarginPct < (MARGIN_FLOOR - 1) * 100
        ? `Blended margin ${u.grossMarginPct}% is below the ${(MARGIN_FLOOR - 1) * 100}% floor — arbitrate to cheaper models or cap this wallet.`
        : `Blended margin ${u.grossMarginPct}% is under the ${(STRATEGIC_TARGET_MARGIN - 1) * 100}% strategic target — route more traffic to cache/small models.`,
      marginPct: u.grossMarginPct,
    }))
    .sort((a, b) => a.marginPct - b.marginPct);

  // Provider-cost trend by period (chronological) + a deterministic forecast.
  const periods = [...new Set(entries.map((e) => e.period))].sort();
  const providerCostTrend: TrendPoint[] = periods.map((p) => {
    const rows = entries.filter((e) => e.period === p);
    const rev = rows.reduce((s, e) => s + gbpFromAcus(e.acusCharged), 0);
    const cost = rows.reduce((s, e) => s + e.providerCostGbp, 0);
    return { period: p, revenueGbp: round(rev), costGbp: round(cost), grossMarginPct: marginPct(rev, cost) };
  });
  const forecastNextPeriod = forecast(providerCostTrend);

  const cacheHits = entries.filter((e) => e.cached).length;

  return {
    totalRevenueGbp, totalProviderCostGbp, grossProfitGbp,
    grossMarginPct: marginPct(totalRevenueGbp, totalProviderCostGbp),
    targetMarginPct: (STRATEGIC_TARGET_MARGIN - 1) * 100,
    floorMarginPct: (MARGIN_FLOOR - 1) * 100,
    revenueByProvider: rollup(entries, (e) => e.provider, totalRevenueGbp),
    revenueByFeature: rollup(entries, (e) => e.feature, totalRevenueGbp),
    revenueByUser: rollup(entries, (e) => e.userId, totalRevenueGbp),
    mostExpensiveUsers: [...userRolls].sort((a, b) => b.costGbp - a.costGbp).slice(0, 5),
    mostProfitableUsers: [...userRolls].sort((a, b) => b.grossProfitGbp - a.grossProfitGbp).slice(0, 5),
    costLeakageAlerts,
    providerCostTrend,
    forecastNextPeriod,
    cacheHitRate: entries.length ? round(cacheHits / entries.length * 100, 0) : 0,
    taskCount: entries.length,
  };
}

// Deterministic next-period forecast: extend revenue & cost by the average
// period-over-period growth of the trend (no randomness, no wall-clock).
function forecast(trend: TrendPoint[]): TrendPoint {
  if (trend.length === 0) return { period: "next", revenueGbp: 0, costGbp: 0, grossMarginPct: 0 };
  if (trend.length === 1) {
    const t = trend[0];
    return { period: "next", revenueGbp: t.revenueGbp, costGbp: t.costGbp, grossMarginPct: t.grossMarginPct };
  }
  const growth = (pick: (p: TrendPoint) => number) => {
    let g = 0, n = 0;
    for (let i = 1; i < trend.length; i++) {
      const prev = pick(trend[i - 1]);
      if (prev > 0) { g += pick(trend[i]) / prev; n++; }
    }
    return n ? g / n : 1;
  };
  const last = trend[trend.length - 1];
  const rev = round(last.revenueGbp * growth((p) => p.revenueGbp));
  const cost = round(last.costGbp * growth((p) => p.costGbp));
  return { period: "next", revenueGbp: rev, costGbp: cost, grossMarginPct: marginPct(rev, cost) };
}

// ---------------------------------------------------------------------------
// ACU Recycling (spec §16) — generate once, sell many. Margins "far beyond
// 400%" because the generation cost is amortised across every resale.
// ---------------------------------------------------------------------------
export type RecyclingResult = {
  unitsSold: number;
  revenueGbp: number;
  amortisedCostPerUnitGbp: number;
  effectiveMarginPct: number;
  note: string;
};

export function recyclingRoi(input: { generationCostGbp: number; salePriceAcus: number; unitsSold: number }): RecyclingResult {
  const units = Math.max(1, Math.floor(input.unitsSold));
  const gen = Math.max(0, input.generationCostGbp);
  const revenueGbp = round(gbpFromAcus(input.salePriceAcus) * units);
  const perUnit = round(gen / units, 4);
  const marginPctVal = gen > 0 ? round((revenueGbp - gen) / gen * 100, 0) : 100;
  return {
    unitsSold: units,
    revenueGbp,
    amortisedCostPerUnitGbp: perUnit,
    effectiveMarginPct: marginPctVal,
    note: `Generated once for £${round(gen, 2)}; sold ${units}× → the generation cost is paid back ${gen > 0 ? round(revenueGbp / gen, 1) : "∞"}× over.`,
  };
}

// ---------------------------------------------------------------------------
// Premium Export Charges (spec §16) — exports consume ACUs. Priced through the
// same margin machinery (quoteAcu) so the floor and markup always hold.
// ---------------------------------------------------------------------------
export const EXPORT_KINDS: Record<string, { label: string; actionClass: ActionClass; providerCostGbp: number; complexity: number }> = {
  pdf: { label: "PDF export", actionClass: "low", providerCostGbp: 0.02, complexity: 1 },
  pptx: { label: "PowerPoint export", actionClass: "medium", providerCostGbp: 0.05, complexity: 1.4 },
  video: { label: "Video export", actionClass: "very_high", providerCostGbp: 0.6, complexity: 1.5 },
  api: { label: "API package export", actionClass: "medium", providerCostGbp: 0.08, complexity: 1.2 },
};

export function exportCharges() {
  return Object.entries(EXPORT_KINDS).map(([id, k]) => {
    const q = quoteAcu({ providerCostGbp: k.providerCostGbp, actionClass: k.actionClass, complexity: k.complexity });
    return { id, label: k.label, acus: q.acus, marginPct: q.marginPct }; // provider cost NOT surfaced
  });
}

// ---------------------------------------------------------------------------
// Deterministic demo ledger — a plausible week of platform activity so the
// owner dashboard renders fully with zero config (Demo Intelligence).
// ---------------------------------------------------------------------------
export function demoLedger(): LedgerEntry[] {
  const features = [
    { feature: "Ad Creative", provider: "gemini_flash", acus: 480, cost: 0.9 },
    { feature: "Content Factory", provider: "groq", acus: 360, cost: 0.7 },
    { feature: "Resurrection Engine", provider: "cached", acus: 300, cost: 0.05, cached: true },
    { feature: "Campaign Commander", provider: "claude", acus: 520, cost: 1.6 },
    { feature: "Video Commander", provider: "vertex_video", acus: 940, cost: 3.4 },
    { feature: "Competitor Spy", provider: "serper", acus: 210, cost: 0.55 },
    { feature: "Failure Audit", provider: "claude", acus: 260, cost: 1.7 }, // frontier — thinnest margin
    { feature: "Template Resale", provider: "cached", acus: 180, cost: 0.02, cached: true },
  ];
  const users = ["biz_101", "biz_204", "biz_305", "biz_419", "biz_528"];
  const periods = ["2026-W22", "2026-W23", "2026-W24", "2026-W25"];
  const out: LedgerEntry[] = [];
  let n = 0;
  for (let p = 0; p < periods.length; p++) {
    const growth = 1 + p * 0.18; // deterministic week-over-week growth
    for (let f = 0; f < features.length; f++) {
      const fe = features[f];
      const user = users[(p + f) % users.length];
      out.push({
        taskId: `t${++n}`,
        userId: user,
        feature: fe.feature,
        provider: fe.provider,
        period: periods[p],
        acusCharged: Math.round(fe.acus * growth),
        providerCostGbp: round(fe.cost * growth, 4),
        cached: fe.cached,
      });
    }
  }
  return out;
}

export function demoOwnerDashboard(): OwnerDashboard {
  return ownerDashboard(demoLedger());
}
