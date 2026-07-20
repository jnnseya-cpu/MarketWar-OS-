// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Creative Optimizer — VisualStrike's Autonomous Testing & Optimisation
// engine (spec F1 §12). Given a set of creative variables it builds a controlled
// test matrix, and given real variant performance it runs the optimisation loop:
// promote winners, kill waste, recombine winning elements, transfer learning,
// and remember rejected elements so they are never regenerated.
//
// Crucially it distinguishes SIX ways a variant can look good but be bad
// (high views / low intent, etc.) so the platform never mistakes attention for
// profit. Pure + deterministic (seeded) so it runs in demo mode and unit-checks.
// It optimises on REAL supplied metrics — it never fabricates performance data.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const round2 = (n: number) => Math.round(n * 100) / 100;
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

// The 19 variables a creative can be tested on (spec §12).
export const TEST_VARIABLES = [
  "hook", "thumbnail", "first_frame", "presenter", "product_scene", "video_length",
  "caption", "headline", "cta", "offer", "price_display", "testimonial", "music",
  "voice", "language", "emotional_angle", "landing_page", "audience", "posting_time",
] as const;
export type TestVariable = typeof TEST_VARIABLES[number];

// ---------------------------------------------------------------------------
// Test matrix — a controlled, bounded set of variant combinations.
// ---------------------------------------------------------------------------
export type VariableSpec = { name: string; options: string[] };
export type Variant = { id: string; values: Record<string, string> };

// Deterministic bounded matrix: rather than a full cartesian explosion, vary one
// axis at a time from a seeded baseline (a clean, analysable "one-factor" design)
// plus a few seeded blends, capped by `cap`.
export function buildTestMatrix(variables: VariableSpec[], cap = 12): { variants: Variant[]; baseline: Variant; note: string } {
  const clean = variables.filter((v) => v.options.length > 0);
  const baseValues: Record<string, string> = {};
  for (const v of clean) baseValues[v.name] = v.options[0];
  const baseline: Variant = { id: "v0", values: { ...baseValues } };
  const variants: Variant[] = [baseline];
  let n = 1;
  // One-factor-at-a-time variants.
  for (const v of clean) {
    for (let i = 1; i < v.options.length && variants.length < cap; i++) {
      variants.push({ id: `v${n++}`, values: { ...baseValues, [v.name]: v.options[i] } });
    }
    if (variants.length >= cap) break;
  }
  // A few seeded blends to catch interactions.
  while (variants.length < cap && clean.length > 1) {
    const s = seed("blend" + variants.length);
    const values: Record<string, string> = {};
    for (const v of clean) values[v.name] = v.options[(s + v.name.length) % v.options.length];
    variants.push({ id: `v${n++}`, values });
  }
  return { variants, baseline, note: `Controlled matrix of ${variants.length} variants (one-factor-at-a-time from a fixed baseline + seeded blends) — isolates each variable's effect.` };
}

// ---------------------------------------------------------------------------
// The 6 performance distinctions (spec §12) — attention is not profit.
// ---------------------------------------------------------------------------
export type VariantResult = {
  id: string;
  views: number; clicks: number; conversions: number;
  spendGbp: number; revenueGbp: number; marginPct: number;
  brandRisk: number; // 0–100
};

export type PerformanceClass =
  | "high_views_low_intent" | "high_engagement_low_conversion" | "strong_clicks_weak_landing"
  | "strong_sales_poor_margin" | "good_short_term_high_brand_risk" | "healthy";

export type PerformanceVerdict = {
  id: string; classification: PerformanceClass; source: "organic" | "paid";
  ctr: number; clickToConv: number; roas: number; recommendation: string;
};

export function classifyPerformance(r: VariantResult): PerformanceVerdict {
  const ctr = r.views > 0 ? round2(r.clicks / r.views) : 0;
  const clickToConv = r.clicks > 0 ? round2(r.conversions / r.clicks) : 0;
  const convRate = r.views > 0 ? r.conversions / r.views : 0;
  const roas = r.spendGbp > 0 ? round2(r.revenueGbp / r.spendGbp) : Infinity;
  const source: "organic" | "paid" = r.spendGbp > 0 ? "paid" : "organic";

  let classification: PerformanceClass = "healthy";
  let recommendation = "Healthy across the funnel — scale it and spin variants off its winning elements.";
  if (r.brandRisk >= 70 && convRate > 0) {
    classification = "good_short_term_high_brand_risk";
    recommendation = "Performing now but brand-risky — cap spend and soften before scaling.";
  } else if (r.revenueGbp > 0 && r.marginPct < 50) {
    classification = "strong_sales_poor_margin";
    recommendation = "Sales without margin — fix offer/price or route to a cheaper creative pipeline before scaling.";
  } else if (r.views > 0 && ctr >= 0.04 && clickToConv < 0.05) {
    classification = "strong_clicks_weak_landing";
    recommendation = "Clicks don't convert — the landing page is the bottleneck, not the creative.";
  } else if (r.views > 0 && ctr >= 0.05 && convRate < 0.01) {
    classification = "high_engagement_low_conversion";
    recommendation = "Engaging but not selling — tighten the offer and CTA, keep the hook.";
  } else if (r.views >= 1000 && convRate < 0.003) {
    classification = "high_views_low_intent";
    recommendation = "Big reach, weak intent — the audience or angle is wrong for buyers.";
  }
  return { id: r.id, classification, source, ctr, clickToConv, roas: roas === Infinity ? 999 : roas, recommendation };
}

// ---------------------------------------------------------------------------
// Optimisation loop (spec §12 — the 8-step loop + Creative Intelligence Memory).
// ---------------------------------------------------------------------------
export type OptimisationResult = {
  ranked: { id: string; commercialScore: number; verdict: PerformanceVerdict }[];
  winners: string[];
  killed: string[];
  nextVariants: Variant[];       // recombined from winning elements
  learnings: { variable: string; bestValue: string }[];
  rejectedMemory: string[];      // element signatures never to regenerate
  note: string;
};

// commercialScore rewards profitable conversion, penalises brand risk & poor margin.
function commercialScore(r: VariantResult): number {
  const convRate = r.views > 0 ? r.conversions / r.views : 0;
  const roas = r.spendGbp > 0 ? r.revenueGbp / r.spendGbp : r.revenueGbp > 0 ? 6 : 0;
  return clamp(convRate * 4000 * 0.4 + Math.min(6, roas) / 6 * 100 * 0.3 + r.marginPct * 0.2 - r.brandRisk * 0.1);
}

export function optimisationLoop(results: VariantResult[], variants: Variant[]): OptimisationResult {
  const byId = new Map(variants.map((v) => [v.id, v]));
  const ranked = results
    .map((r) => ({ id: r.id, commercialScore: commercialScore(r), verdict: classifyPerformance(r) }))
    .sort((a, b) => b.commercialScore - a.commercialScore);

  const winners = ranked.filter((x) => x.commercialScore >= 60).map((x) => x.id);
  const winnerIds = winners.length ? winners : ranked.slice(0, 1).map((x) => x.id);
  // Kill the clearly wasteful: low commercial score AND paid spend without return.
  const killed = ranked.filter((x) => {
    const r = results.find((y) => y.id === x.id)!;
    return x.commercialScore < 30 && (r.spendGbp > 0 && r.revenueGbp < r.spendGbp);
  }).map((x) => x.id);

  // Per-variable best value, learned from the winning variants.
  const winnerVariants = winnerIds.map((id) => byId.get(id)).filter(Boolean) as Variant[];
  const learnings: { variable: string; bestValue: string }[] = [];
  const bestValues: Record<string, string> = {};
  if (winnerVariants.length) {
    for (const key of Object.keys(winnerVariants[0].values)) {
      const counts = new Map<string, number>();
      for (const v of winnerVariants) counts.set(v.values[key], (counts.get(v.values[key]) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      bestValues[key] = best;
      learnings.push({ variable: key, bestValue: best });
    }
  }
  // Next variants recombine winning elements (seeded, deterministic).
  const nextVariants: Variant[] = [];
  for (let i = 0; i < Math.min(3, Math.max(1, winnerVariants.length)); i++) {
    const s = seed("next" + i);
    const values: Record<string, string> = { ...bestValues };
    const keys = Object.keys(values);
    if (keys.length) { const flip = keys[s % keys.length]; const src = winnerVariants[s % winnerVariants.length]; if (src) values[flip] = src.values[flip]; }
    nextVariants.push({ id: `n${i + 1}`, values });
  }
  // Rejected elements → memory (never regenerate). Signature = "var:value".
  const rejectedMemory: string[] = [];
  for (const id of killed) {
    const v = byId.get(id);
    if (v) for (const [k, val] of Object.entries(v.values)) if (bestValues[k] !== val) rejectedMemory.push(`${k}:${val}`);
  }

  return {
    ranked, winners: winnerIds, killed, nextVariants, learnings,
    rejectedMemory: [...new Set(rejectedMemory)],
    note: "Winners promoted, wasteful paid variants killed, next round recombined from winning elements; rejected elements are remembered so they are never regenerated. Operates on real supplied metrics only.",
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo so the whole engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoOptimizer() {
  const variables: VariableSpec[] = [
    { name: "hook", options: ["problem-first", "before-after", "unexpected-use"] },
    { name: "cta", options: ["Shop now", "See how it works"] },
    { name: "offer", options: ["10% off", "free trial", "bundle"] },
    { name: "audience", options: ["cold", "retargeting"] },
  ];
  const { variants, baseline } = buildTestMatrix(variables, 10);
  // Seeded synthetic performance (clearly labelled demo, not real telemetry).
  const results: VariantResult[] = variants.map((v) => {
    const s = seed(v.id + JSON.stringify(v.values));
    const views = 1200 + (s % 5000);
    const clicks = Math.round(views * (0.02 + (s % 40) / 1000));
    const conversions = Math.round(clicks * (0.03 + (s % 25) / 1000));
    const spendGbp = v.values.audience === "retargeting" ? 20 + (s % 30) : 40 + (s % 60);
    const revenueGbp = conversions * (35 + (s % 25));
    const marginPct = 40 + (s % 60);
    const brandRisk = v.values.hook === "unexpected-use" ? 55 + (s % 40) : 10 + (s % 40);
    return { id: v.id, views, clicks, conversions, spendGbp, revenueGbp, marginPct, brandRisk };
  });
  const optimisation = optimisationLoop(results, variants);
  return {
    variables, baseline, variants,
    results: results.map((r) => ({ ...r, source: "demo synthetic (labelled — not real telemetry)" })),
    distinctions: results.map(classifyPerformance),
    optimisation,
  };
}
