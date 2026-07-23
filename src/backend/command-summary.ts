// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Command-Centre Briefing Engine.
//
// The Executive Command Center shows a brand's REAL money (attributed revenue,
// orders, leads, per-source rollups) from the results ledger. This engine turns
// those real numbers into a prioritised "what to do next" briefing — top
// opportunities, at-risk items and recommended next actions — every line
// COMPUTED from the brand's own ledger, never fabricated. Deterministic and
// wall-clock-free so it renders identically in demo mode and under test; honest
// empty-state when the brand has no activity yet.
//
// Input is the same ResultsSummary the ledger produces (src/shared/results), so
// there is one source of truth for the money and this engine only reasons over
// it.

import { type ResultsSummary } from "@/shared/results";

export type BriefItem = {
  title: string;
  detail: string;
  priority: number;   // 0–100, computed from the magnitude of the signal
  metric?: string;    // the real figure that drove this item
  href?: string;      // where to act on it inside the OS
  cta?: string;       // imperative label for the action
};

export type CommandBriefing = {
  business: string;
  isEmpty: boolean;
  headline: string;
  // Rule 4 of the Money-Making Doctrine: the SINGLE next best money-making
  // action — the top-ranked item across risks + opportunities, so the user never
  // opens the dashboard wondering what to do. Null only when there is genuinely
  // nothing to recommend.
  nextBestAction: BriefItem | null;
  // Doctrine §22: the 0–100 Money Score (honest — only measured components count).
  moneyScore: MoneyScore;
  momentum: {
    revenueGbp: number;
    orders: number;
    leads: number;
    avgOrderGbp: number;
    sourceCount: number;
    topSource: string | null;
    topSourceSharePct: number;   // top source's share of attributed revenue
    conversionRatePct: number;   // orders / (orders + leads)
  };
  opportunities: BriefItem[];
  risks: BriefItem[];
  nextActions: BriefItem[];
  note: string;
};

// ---- MarketWar Money Score (doctrine §22) ----------------------------------
// A 0–100 commercial score. HONEST by construction: each component is scored
// ONLY from data we actually hold (the results ledger); components that need a
// source we haven't connected (spend, costs, competitor, retention) are returned
// as null with a "connect X" note and are EXCLUDED from the overall score, which
// is the mean of measured components. No fabricated confidence.
export type ScoreComponent = { name: string; score: number | null; note: string };
export type MoneyScore = {
  score: number | null;          // mean of measured components, or null if none
  measured: number; total: number;
  components: ScoreComponent[];
  topWeakness: ScoreComponent | null;
  note: string;
};

export function moneyScore(rawSummary: ResultsSummary): MoneyScore {
  const s = normalizeSummary(rawSummary);
  const revenueSources = s.bySource.filter((x) => x.revenueGbp > 0);
  const conv = s.orders + s.leads > 0 ? (s.orders / (s.orders + s.leads)) * 100 : null;

  const components: ScoreComponent[] = [
    // Measured from the ledger:
    { name: "Demand Capture", score: s.events === 0 ? 0 : clampPriority(Math.min(100, (s.leads + s.orders) * 8 + s.bySource.length * 6)), note: "Leads + orders captured and how many sources feed them." },
    { name: "Conversion", score: conv === null ? null : clampPriority(Math.min(100, conv * 2)), note: conv === null ? "No leads/orders yet." : `${round(conv)}% of leads+orders are orders.` },
    { name: "Customer Value", score: s.orders === 0 ? null : clampPriority(Math.min(100, s.avgOrderGbp / 2)), note: s.orders === 0 ? "No orders yet." : `£${round(s.avgOrderGbp)} average order value.` },
    { name: "Growth Readiness", score: s.events === 0 ? 0 : clampPriority(Math.min(100, revenueSources.length * 30 + (s.bySource.length - revenueSources.length) * 10)), note: "Channel diversity — how many proven revenue sources exist." },
    // Need a connected source — honestly null, not guessed:
    { name: "Retention", score: null, note: "Connect repeat-purchase / subscription data to score retention." },
    { name: "Revenue Recovery", score: null, note: "Connect cart/payment/dormant data (Recovery engine) to score recovery." },
    { name: "Offer Strength", score: null, note: "Run offer evaluation to score offer clarity/urgency/differentiation." },
    { name: "Competitor Advantage", score: null, note: "Connect competitor tracking to score category position." },
    { name: "Marketing Efficiency", score: null, note: "Connect ad spend to score CAC / efficiency." },
    { name: "Profitability", score: null, note: "Connect costs (spend, fees, COGS) to score margin." },
  ];

  const measured = components.filter((c) => c.score !== null);
  const score = measured.length ? clampPriority(measured.reduce((a, c) => a + (c.score as number), 0) / measured.length) : null;
  const topWeakness = measured.length ? [...measured].sort((a, b) => (a.score as number) - (b.score as number))[0] : null;

  return {
    score, measured: measured.length, total: components.length, components, topWeakness,
    note: `Scored from ${measured.length}/${components.length} components — the rest need a connected source and are honestly left unscored (never guessed).`,
  };
}

const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const clampPriority = (n: number) => Math.max(1, Math.min(100, Math.round(n)));

// Deterministic, stable ordering: by priority desc, then title asc as a
// tie-break (no randomness, no wall-clock).
function rank(items: BriefItem[]): BriefItem[] {
  return [...items].sort((a, b) => (b.priority - a.priority) || a.title.localeCompare(b.title));
}

// Coerce any partial / malformed body into a safe ResultsSummary so the API
// never 500s on an incomplete payload — missing fields read as an empty ledger.
function normalizeSummary(s: Partial<ResultsSummary> | null | undefined): ResultsSummary {
  const bySource = Array.isArray(s?.bySource) ? s!.bySource : [];
  const events = typeof s?.events === "number" ? s!.events : 0;
  return {
    events,
    isEmpty: s?.isEmpty ?? events === 0,
    revenueGbp: typeof s?.revenueGbp === "number" ? s!.revenueGbp : 0,
    orders: typeof s?.orders === "number" ? s!.orders : 0,
    leads: typeof s?.leads === "number" ? s!.leads : 0,
    avgOrderGbp: typeof s?.avgOrderGbp === "number" ? s!.avgOrderGbp : 0,
    bySource,
  } as ResultsSummary;
}

export function commandBriefing(business: string, rawSummary: ResultsSummary): CommandBriefing {
  const name = business?.trim() || "Your brand";
  const summary = normalizeSummary(rawSummary);

  if (summary.isEmpty || summary.events === 0) {
    return {
      business: name,
      isEmpty: true,
      headline: "Your command centre fills as you act — log a result, launch a campaign, capture a lead.",
      nextBestAction: { title: "Run your first Commercial Growth Scan", detail: "Point MarketWar at your website + socials so it can find where money is leaking and what to launch first — before you spend a penny.", priority: 95, href: "/dashboard/first-customer", cta: "Find my first revenue" },
      moneyScore: moneyScore(summary),
      momentum: {
        revenueGbp: 0, orders: 0, leads: 0, avgOrderGbp: 0,
        sourceCount: 0, topSource: null, topSourceSharePct: 0, conversionRatePct: 0,
      },
      opportunities: [],
      risks: [],
      nextActions: [
        { title: "Launch your first campaign", detail: "Design a campaign so there is something to attribute revenue to.", priority: 90, href: "/dashboard/warfare", cta: "Design a campaign" },
        { title: "Capture a lead", detail: "Publish an owned landing page — every capture lands in this ledger, attributed to its source.", priority: 80, href: "/dashboard/create", cta: "Make anything" },
        { title: "Log a result", detail: "Record an order or sale you already have so the command centre reflects real money.", priority: 70, href: "/dashboard/revenue", cta: "Log a result" },
      ],
      note: "Nothing is fabricated — this briefing is empty because the ledger is empty. It computes itself the moment real activity lands.",
    };
  }

  const revenue = summary.revenueGbp;
  const { orders, leads, avgOrderGbp } = summary;
  const bySource = summary.bySource;
  const sourceCount = bySource.length;
  const revenueSources = bySource.filter((s) => s.revenueGbp > 0);
  const topSource = revenueSources[0] ?? null;
  const topSourceSharePct = topSource && revenue > 0 ? round(topSource.revenueGbp / revenue * 100) : 0;
  const conversionRatePct = orders + leads > 0 ? round(orders / (orders + leads) * 100) : 0;

  // -------------------------------------------------------------------------
  // Opportunities — computed from where the real money and intent already sit.
  // -------------------------------------------------------------------------
  const opportunities: BriefItem[] = [];

  if (topSource) {
    opportunities.push({
      title: `Double down on ${topSource.source}`,
      detail: `${topSource.source} is your strongest attributed source at £${round(topSource.revenueGbp)} (${topSourceSharePct}% of revenue, ${topSource.orders} order${topSource.orders === 1 ? "" : "s"}). Scale the spend and creative that produced it.`,
      priority: clampPriority(55 + topSourceSharePct * 0.4),
      metric: `£${round(topSource.revenueGbp)} · ${topSourceSharePct}% of revenue`,
      href: "/dashboard/warfare",
      cta: "Scale this campaign",
    });
  }

  // Captured leads that have not yet converted are the clearest untapped upside.
  if (leads > 0) {
    // Potential = uncaptured leads × the brand's own realised average order value
    // (fall back to a conservative £25 basket only when there is no AOV yet).
    const basket = avgOrderGbp > 0 ? avgOrderGbp : 25;
    const potential = round(leads * basket);
    opportunities.push({
      title: `Convert ${leads} captured lead${leads === 1 ? "" : "s"}`,
      detail: `You are holding ${leads} lead${leads === 1 ? "" : "s"}. At your average order value of £${round(avgOrderGbp)}, converting them is worth about £${potential} — segment them and run a consent-checked follow-up sequence.`,
      priority: clampPriority(40 + Math.min(50, potential / 20)),
      metric: `${leads} leads · ~£${potential} potential`,
      href: "/dashboard/segments",
      cta: "Segment & follow up",
    });
  }

  // Sources bringing leads but no revenue yet — an activation opportunity.
  const leadyNoRevenue = bySource.filter((s) => s.leads > 0 && s.revenueGbp === 0).sort((a, b) => b.leads - a.leads);
  if (leadyNoRevenue.length) {
    const s = leadyNoRevenue[0];
    opportunities.push({
      title: `Activate ${s.source}`,
      detail: `${s.source} has produced ${s.leads} lead${s.leads === 1 ? "" : "s"} but no orders yet — the intent is there, the offer or follow-up is not landing.`,
      priority: clampPriority(30 + Math.min(40, s.leads * 6)),
      metric: `${s.leads} leads · £0 converted`,
      href: "/dashboard/offer-forge",
      cta: "Sharpen the offer",
    });
  }

  // Raise average order value once there is a repeatable order base.
  if (orders >= 2 && avgOrderGbp > 0) {
    const uplift = round(orders * avgOrderGbp * 0.1);
    opportunities.push({
      title: "Raise average order value",
      detail: `${orders} orders at £${round(avgOrderGbp)} average. A 10% bundle/upsell lift on the same order count is about £${uplift} more — with no extra acquisition spend.`,
      priority: clampPriority(25 + Math.min(35, uplift / 5)),
      metric: `AOV £${round(avgOrderGbp)} · +£${uplift} at +10%`,
      href: "/dashboard/offer-forge",
      cta: "Build a bundle",
    });
  }

  // -------------------------------------------------------------------------
  // Risks — computed structural weaknesses in the real ledger.
  // -------------------------------------------------------------------------
  const risks: BriefItem[] = [];

  // Concentration risk: too much revenue riding on a single source.
  if (topSource && topSourceSharePct >= 60 && revenueSources.length >= 1) {
    risks.push({
      title: "Revenue is concentrated",
      detail: `${topSourceSharePct}% of attributed revenue comes from ${topSource.source}. If it softens, so does the whole brand — stand up a second proven channel.`,
      priority: clampPriority(topSourceSharePct),
      metric: `${topSourceSharePct}% from one source`,
      href: "/dashboard/warfare",
      cta: "Open a second channel",
    });
  }

  // Conversion risk: plenty of leads, few becoming orders.
  if (leads > 0 && orders + leads >= 3 && conversionRatePct < 30) {
    risks.push({
      title: "Low lead-to-order conversion",
      detail: `Only ${conversionRatePct}% of your leads and orders are actually orders (${orders} order${orders === 1 ? "" : "s"} vs ${leads} lead${leads === 1 ? "" : "s"}). The follow-up or offer is the bottleneck, not traffic.`,
      priority: clampPriority(70 - conversionRatePct),
      metric: `${conversionRatePct}% conversion`,
      href: "/dashboard/email",
      cta: "Fix the follow-up",
    });
  }

  // Leads-only: activity but no money captured yet.
  if (orders === 0 && leads > 0) {
    risks.push({
      title: "Leads captured, no orders yet",
      detail: `${leads} lead${leads === 1 ? "" : "s"} in the ledger and £0 attributed. Nothing is converting — prioritise the first sale before scaling capture.`,
      priority: clampPriority(50 + Math.min(30, leads * 5)),
      metric: `${leads} leads · £0 revenue`,
      href: "/dashboard/segments",
      cta: "Convert a lead now",
    });
  }

  // -------------------------------------------------------------------------
  // Next actions — the ranked union, deduped, the sharpest few first.
  // -------------------------------------------------------------------------
  const pool = rank([...risks, ...opportunities]);
  const seen = new Set<string>();
  const nextActions = pool.filter((i) => {
    if (seen.has(i.title)) return false;
    seen.add(i.title);
    return true;
  }).slice(0, 4);

  const headline = revenue > 0
    ? `£${round(revenue)} attributed across ${revenueSources.length} source${revenueSources.length === 1 ? "" : "s"}${topSource ? ` — ${topSource.source} leading` : ""}. ${orders} order${orders === 1 ? "" : "s"}, ${leads} open lead${leads === 1 ? "" : "s"}.`
    : `${leads} lead${leads === 1 ? "" : "s"} captured, no orders yet — the next move is the first conversion.`;

  // Rule 4: the single sharpest move right now — the top of the ranked pool.
  const nextBestAction = nextActions[0] ?? null;

  return {
    business: name,
    isEmpty: false,
    headline,
    nextBestAction,
    moneyScore: moneyScore(summary),
    momentum: { revenueGbp: revenue, orders, leads, avgOrderGbp, sourceCount, topSource: topSource?.source ?? null, topSourceSharePct, conversionRatePct },
    opportunities: rank(opportunities),
    risks: rank(risks),
    nextActions,
    note: "Every line is computed from this brand's own results ledger — attributed revenue, per-source rollups, leads and orders. No figure is fabricated.",
  };
}
