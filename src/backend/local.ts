// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Local Domination Engine (Local Growth pack §Own-your-postcode).
//
// Given a business + location, computes local-presence intelligence: a map-pack
// rank estimate, Google Business Profile completeness signals, review
// velocity/rating trend, local-SEO citation gaps, and a prioritized local
// action list. Deterministic (every figure seeded off business+location) so it
// works in demo mode with zero configuration; live feeds (GBP API, map-scrape,
// citation crawl) plug in at go-live without changing consumers.
//
// Doctrine: honesty. Every rank/score/count here is a directional ESTIMATE,
// clearly badged, never a measured fact. We never present unlabelled absolutes
// as real telemetry — live data replaces these estimates when connected.

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};
// Stable 0-100 estimate for a named signal on a named place.
const signal = (place: string, key: string): number => clamp((seed(`${place}::${key}`) % 61) + 20);
// Fixed relative month labels — deterministic, no wall-clock so demo + tests stay stable.
const MONTH_LABELS = ["-5mo", "-4mo", "-3mo", "-2mo", "-1mo", "This mo"] as const;

// ---------------------------------------------------------------------------
// Google Business Profile completeness signals
// ---------------------------------------------------------------------------
export type ProfileStatus = "present" | "weak" | "missing";
export type ProfileSignal = { label: string; status: ProfileStatus; impact: number };

const GBP_SIGNALS: { label: string; impact: number }[] = [
  { label: "Primary category & attributes", impact: 18 },
  { label: "Business description (keyword-rich)", impact: 10 },
  { label: "Photos (10+ recent)", impact: 14 },
  { label: "Products / services listed", impact: 12 },
  { label: "Opening hours + holiday hours", impact: 8 },
  { label: "Q&A seeded & answered", impact: 7 },
  { label: "Booking / order action link", impact: 11 },
  { label: "Weekly Google Posts", impact: 9 },
  { label: "Messaging enabled", impact: 6 },
  { label: "Service areas defined", impact: 8 },
];

// ---------------------------------------------------------------------------
// Local citation directories
// ---------------------------------------------------------------------------
export type CitationStatus = "listed" | "inconsistent" | "missing";
export type Citation = { directory: string; status: CitationStatus; authority: number };

const CITATION_DIRECTORIES: { directory: string; authority: number }[] = [
  { directory: "Google Business Profile", authority: 100 },
  { directory: "Apple Business Connect", authority: 88 },
  { directory: "Bing Places", authority: 80 },
  { directory: "Facebook Page", authority: 78 },
  { directory: "TripAdvisor", authority: 70 },
  { directory: "Yelp", authority: 68 },
  { directory: "Yell / Yellow Pages", authority: 60 },
  { directory: "Foursquare", authority: 55 },
  { directory: "Trustpilot", authority: 64 },
];

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------
export type LocalAction = {
  priority: number; // 0-100
  title: string;
  detail: string;
  category: "map-pack" | "profile" | "reviews" | "citations";
  impact: "high" | "medium" | "low";
};

export type LocalReport = {
  business: string;
  location: string;
  mapPackRank: number; // estimated position in the local 3-pack ranking
  mapPackTarget: number;
  visibilityScore: number; // 0-100 composite local-presence estimate
  profile: { completeness: number; signals: ProfileSignal[] };
  reviews: {
    rating: number; // /5
    totalReviews: number;
    velocityPerMonth: number;
    leaderVelocityPerMonth: number;
    ratingTrend: number[]; // 6-pt series (×10, e.g. 44 = 4.4)
    reviewTrend: number[]; // cumulative reviews, 6-pt series
  };
  citations: Citation[];
  monthlyViews: { labels: string[]; mapViews: number[]; searchViews: number[] };
  actions: LocalAction[];
  estimate: true;
  note: string;
};

export function analyzeLocalPresence(input: { business: string; location: string }): LocalReport {
  const business = (input.business || "").trim() || "Brixton Grill House";
  const location = (input.location || "").trim() || "Brixton, London";
  const place = `${business}|${location}`;
  const s = seed(place);

  // Map-pack rank estimate (1 = top of the local 3-pack; target the top 3).
  const mapPackRank = 1 + (s % 12);
  const mapPackTarget = 3;

  // GBP completeness — each signal present/weak/missing by a stable threshold.
  const signals: ProfileSignal[] = GBP_SIGNALS.map((g) => {
    const v = seed(`${place}::gbp::${g.label}`) % 100;
    const status: ProfileStatus = v >= 60 ? "present" : v >= 30 ? "weak" : "missing";
    return { label: g.label, status, impact: g.impact };
  });
  const totalImpact = GBP_SIGNALS.reduce((a, g) => a + g.impact, 0);
  const earned = signals.reduce((a, g) => a + g.impact * (g.status === "present" ? 1 : g.status === "weak" ? 0.5 : 0), 0);
  const completeness = clamp((earned / totalImpact) * 100);

  // Reviews — rating, count, velocity vs the pack leader, and 6-pt trends.
  const rating = Math.round((32 + (signal(place, "rating") % 18)) / 10 * 10) / 10; // 3.2–5.0
  const velocityPerMonth = 1 + (s >> 4) % 8; // 1–8 new reviews/mo
  const leaderVelocityPerMonth = velocityPerMonth + 2 + ((s >> 7) % 7); // leader always ahead
  const totalReviews = 30 + (s % 220);
  const ratingTrend = MONTH_LABELS.map((_, i) => {
    // Gentle drift toward the current rating.
    const drift = ((seed(`${place}::rt::${i}`) % 7) - 3) / 10;
    return Math.round(clamp((rating + drift) * 10, 10, 50));
  });
  const reviewTrend = MONTH_LABELS.map((_, i) => Math.max(0, totalReviews - velocityPerMonth * (MONTH_LABELS.length - 1 - i)));

  // Monthly local views — deterministic upward-ish series (estimate).
  const baseMap = 120 + (s % 340);
  const baseSearch = baseMap * 3 + (s % 500);
  const mapViews = MONTH_LABELS.map((_, i) => Math.round(baseMap * (0.8 + i * 0.06) + (seed(`${place}::mv::${i}`) % 90)));
  const searchViews = MONTH_LABELS.map((_, i) => Math.round(baseSearch * (0.82 + i * 0.055) + (seed(`${place}::sv::${i}`) % 260)));

  // Citation gaps — listed / inconsistent / missing per directory.
  const citations: Citation[] = CITATION_DIRECTORIES.map((c) => {
    const v = seed(`${place}::cite::${c.directory}`) % 100;
    const status: CitationStatus = v >= 58 ? "listed" : v >= 30 ? "inconsistent" : "missing";
    return { directory: c.directory, status, authority: c.authority };
  });

  // Composite visibility score — rank (closer to #1 is better) + profile + reviews.
  const rankScore = clamp(100 - (mapPackRank - 1) * 8);
  const reviewScore = clamp((rating / 5) * 60 + Math.min(40, velocityPerMonth * 6));
  const visibilityScore = clamp(rankScore * 0.4 + completeness * 0.35 + reviewScore * 0.25);

  // ------------------------------------------------------------------- Actions
  // Built from the ACTUAL computed gaps above, then ranked by priority.
  const actions: LocalAction[] = [];

  if (mapPackRank > mapPackTarget) {
    actions.push({
      priority: clamp(70 + (mapPackRank - mapPackTarget) * 4),
      title: `Break into the top ${mapPackTarget} of the map pack`,
      detail: `Estimated at #${mapPackRank} for core "near me" queries — close the gap with proximity-relevant categories, geo-tagged photos and review velocity.`,
      category: "map-pack",
      impact: "high",
    });
  }

  const missingSignals = signals.filter((g) => g.status !== "present").sort((a, b) => b.impact - a.impact);
  for (const g of missingSignals.slice(0, 3)) {
    actions.push({
      priority: clamp(40 + g.impact * 2 + (g.status === "missing" ? 12 : 0)),
      title: g.status === "missing" ? `Add: ${g.label}` : `Strengthen: ${g.label}`,
      detail: `Google Business Profile signal is ${g.status} — completing it lifts local ranking weight (impact est. ${g.impact}).`,
      category: "profile",
      impact: g.impact >= 12 ? "high" : g.impact >= 8 ? "medium" : "low",
    });
  }

  if (velocityPerMonth < leaderVelocityPerMonth) {
    actions.push({
      priority: clamp(55 + (leaderVelocityPerMonth - velocityPerMonth) * 4),
      title: "Close the review-velocity gap",
      detail: `~${velocityPerMonth} new reviews/mo vs the pack leader's ~${leaderVelocityPerMonth}. Automate a post-purchase review ask (consent-based) to catch up.`,
      category: "reviews",
      impact: leaderVelocityPerMonth - velocityPerMonth >= 4 ? "high" : "medium",
    });
  }

  const brokenCitations = citations.filter((c) => c.status !== "listed").sort((a, b) => b.authority - a.authority);
  for (const c of brokenCitations.slice(0, 2)) {
    actions.push({
      priority: clamp(35 + c.authority * 0.3 + (c.status === "missing" ? 10 : 0)),
      title: c.status === "missing" ? `Claim listing: ${c.directory}` : `Fix NAP mismatch: ${c.directory}`,
      detail: `${c.status === "missing" ? "No verified listing" : "Name/address/phone is inconsistent"} on a high-authority directory (authority ${c.authority}). Consistent citations reinforce local trust.`,
      category: "citations",
      impact: c.authority >= 75 ? "high" : "medium",
    });
  }

  actions.sort((a, b) => b.priority - a.priority);

  return {
    business,
    location,
    mapPackRank,
    mapPackTarget,
    visibilityScore,
    profile: { completeness, signals },
    reviews: { rating, totalReviews, velocityPerMonth, leaderVelocityPerMonth, ratingTrend, reviewTrend },
    citations,
    monthlyViews: { labels: [...MONTH_LABELS], mapViews, searchViews },
    actions,
    estimate: true,
    note: "All ranks, scores, counts and trends are DETERMINISTIC ESTIMATES for demo — clearly badged, never measured telemetry. Live Google Business Profile, map-pack and citation data replace these when connected.",
  };
}

// Zero-config demo.
export function demoLocalReport(): LocalReport {
  return analyzeLocalPresence({ business: "Brixton Grill House", location: "Brixton, London (SW9)" });
}
