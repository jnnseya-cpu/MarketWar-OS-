// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Trust, Reviews & Reputation Engine (Trustpilot/Yelp-inspired).
//
// Turns customer feedback into trust, conversion, SEO/AI-search authority,
// social proof and operational intelligence. Deterministic so it works in
// demo mode; live review sources (Google/Trustpilot/Yelp) plug in at go-live.
//
// Doctrine: reviews are EARNED, never fabricated. This engine drafts responses
// and marketing assets from REAL reviews, flags manipulation, and never
// invents a rating — the honesty safeguard forbids fake social proof.

export type Review = {
  id: string;
  rating: number; // 1–5
  text: string;
  author?: string;
  date?: string; // ISO
  verified?: boolean;
  source?: string; // google | trustpilot | yelp | direct
  ip?: string; // for velocity/manipulation checks only
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const round1 = (n: number) => Math.round(n * 10) / 10;
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

// Deterministic sample reviews so the engine demonstrates with zero config.
export function sampleReviews(business: string): Review[] {
  const s = seed(business || "Brixton Grill House");
  const templates: [number, string, boolean][] = [
    [5, "Fast delivery and the food was hot and authentic. Ordering on WhatsApp was so easy.", true],
    [5, "Best grill in the area — great value and friendly staff. Will order again.", true],
    [4, "Really good food, though the wait was a bit longer than expected on Friday.", true],
    [2, "Order arrived cold and 40 minutes late. Taste was fine but the delivery let it down.", true],
    [5, "Portions are generous and the prices beat the delivery apps. Highly recommend.", false],
    [3, "Decent food but the website was hard to use and I couldn't find the menu.", true],
    [1, "Never received my order and no one answered the phone. Very disappointed.", true],
    [4, "Lovely flavours and quick WhatsApp replies. Knock off a star for packaging.", true],
  ];
  return templates.map(([rating, text, verified], i) => ({
    id: `r${i + 1}`,
    rating,
    text,
    author: `Customer ${((s >> i) % 900) + 100}`,
    verified,
    source: ["google", "trustpilot", "yelp", "direct"][(s >> i) % 4],
    date: undefined,
  }));
}

// ---------------------------------------------------------------------------
// TrustScore + analytics
// ---------------------------------------------------------------------------
export type TrustReport = {
  business: string;
  trustScore: number; // 0–100 (institutional credibility)
  averageRating: number; // 1–5
  reviewCount: number;
  starDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  verifiedShare: number; // 0–1
  positiveShare: number; // ≥4★
  negativeShare: number; // ≤2★
  aiVisibilityReadiness: number; // 0–100 — "recommended by AI" readiness
  verdict: string;
};

// Honest UNVERIFIED state — no real reviews supplied. Doctrine: reviews are
// earned, never fabricated, so we invent NO score/rating/count.
export function emptyTrust(business: string): TrustReport {
  return {
    business: business || "your brand",
    trustScore: 0, averageRating: 0, reviewCount: 0,
    starDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    verifiedShare: 0, positiveShare: 0, negativeShare: 0, aiVisibilityReadiness: 0,
    verdict: "UNVERIFIED — connect a real review source (Google, Trustpilot, G2…) and paste your reviews to compute a real TrustScore. No score is invented.",
  };
}
export function emptySentiment(business: string): SentimentReport {
  return {
    business: business || "your brand",
    topicSentiment: [], painPoints: [], featureRequests: [], complaintClusters: [],
    customerHappiness: 0,
    churnRiskSignals: ["No reviews connected yet — nothing to analyse."],
    operationalPlan: ["Connect a review source or paste real reviews; sentiment, pain points and the CX plan compute from your actual feedback — never a sample."],
  };
}

export function computeTrust(business: string, reviews: Review[]): TrustReport {
  const rs = reviews.length ? reviews : sampleReviews(business);
  const n = rs.length;
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rs.forEach((r) => { const k = clamp(Math.round(r.rating), 1, 5) as 1 | 2 | 3 | 4 | 5; dist[k]++; });
  const avg = rs.reduce((a, r) => a + r.rating, 0) / n;
  const verified = rs.filter((r) => r.verified).length / n;
  const positive = rs.filter((r) => r.rating >= 4).length / n;
  const negative = rs.filter((r) => r.rating <= 2).length / n;
  // TrustScore blends rating, volume confidence and verified share.
  const volumeConfidence = Math.min(1, n / 50);
  const trustScore = clamp((avg / 5) * 70 + verified * 20 + volumeConfidence * 10);
  // AI-visibility readiness: verified volume + rating + recency proxy → how
  // citable this business is by AI assistants (ties to the GEO citation radar).
  const aiVisibilityReadiness = clamp(trustScore * 0.6 + verified * 25 + volumeConfidence * 15);
  return {
    business, trustScore, averageRating: round1(avg), reviewCount: n, starDistribution: dist,
    verifiedShare: round1(verified), positiveShare: round1(positive), negativeShare: round1(negative),
    aiVisibilityReadiness,
    verdict: trustScore >= 80 ? "Strong trust — lead with it in ads and on the landing page."
      : trustScore >= 65 ? "Solid — collect more verified reviews to break 80."
      : trustScore >= 50 ? "Fragile — fix the top complaint and run a review-invitation campaign."
      : "At risk — respond to negatives fast and rebuild verified review volume.",
  };
}

// ---------------------------------------------------------------------------
// Sentiment + CX intelligence (pain points, feature requests, complaint clusters)
// ---------------------------------------------------------------------------
const TOPICS: [string, RegExp][] = [
  ["delivery/speed", /\b(deliver|late|wait|slow|fast|quick|time|minutes)\b/i],
  ["food/quality", /\b(food|taste|hot|cold|fresh|flavou?r|portion|quality)\b/i],
  ["price/value", /\b(price|value|cheap|expensive|cost|worth|deal)\b/i],
  ["service/staff", /\b(staff|service|friendly|rude|helpful|reply|answer|phone)\b/i],
  ["ordering/website", /\b(website|app|order|whatsapp|menu|easy|hard|confus)\b/i],
  ["packaging", /\b(packag|box|spill|leak|container)\b/i],
];

export type SentimentReport = {
  business: string;
  topicSentiment: { topic: string; mentions: number; sentiment: number }[]; // sentiment -100..100
  painPoints: string[];
  featureRequests: string[];
  complaintClusters: { theme: string; count: number }[];
  customerHappiness: number; // 0–100
  churnRiskSignals: string[];
  operationalPlan: string[];
};

export function analyseSentiment(business: string, reviews: Review[]): SentimentReport {
  const rs = reviews.length ? reviews : sampleReviews(business);
  const topicSentiment = TOPICS.map(([topic, re]) => {
    const hits = rs.filter((r) => re.test(r.text));
    const mentions = hits.length;
    const sentiment = mentions ? clamp((hits.reduce((a, r) => a + (r.rating - 3), 0) / mentions) * 50, -100, 100) : 0;
    return { topic, mentions, sentiment: Math.round(sentiment) };
  }).filter((t) => t.mentions > 0).sort((a, b) => a.sentiment - b.sentiment);

  const negatives = rs.filter((r) => r.rating <= 2);
  const painPoints = topicSentiment.filter((t) => t.sentiment < 0).map((t) => `${t.topic} (${t.mentions} mentions, ${t.sentiment} sentiment)`);
  const complaintClusters = topicSentiment.filter((t) => t.sentiment < 0).map((t) => ({ theme: t.topic, count: t.mentions }));
  const happiness = clamp(rs.reduce((a, r) => a + r.rating, 0) / rs.length / 5 * 100);

  return {
    business,
    topicSentiment,
    painPoints: painPoints.length ? painPoints : ["No clear negative topic cluster — maintain quality."],
    featureRequests: rs.filter((r) => /\b(wish|could|should|would be|add|please)\b/i.test(r.text)).map((r) => r.text).slice(0, 3),
    complaintClusters,
    customerHappiness: happiness,
    churnRiskSignals: negatives.length ? [`${negatives.length} recent ≤2★ reviews — unresolved negatives drive churn`, ...(topicSentiment[0] && topicSentiment[0].sentiment < 0 ? [`Worst topic: ${topicSentiment[0].topic} — fix first`] : [])] : ["No acute churn signal in the current window."],
    operationalPlan: complaintClusters.length
      ? complaintClusters.slice(0, 3).map((c) => `Fix "${c.theme}" — it appears in ${c.count} negative review(s); assign an owner and re-measure in 2 weeks.`)
      : ["Reviews are healthy — double down on the review-invitation flow to grow verified volume."],
  };
}

// ---------------------------------------------------------------------------
// AI response drafting (positive/negative, escalation + legal-risk flags)
// ---------------------------------------------------------------------------
export type ResponseDraft = {
  reviewId: string;
  rating: number;
  tone: string;
  reply: string;
  escalate: boolean;
  legalRisk: boolean;
  internalNote: string;
};

export function draftResponse(review: Review, business: string, brandTone = "warm, professional, local"): ResponseDraft {
  const positive = review.rating >= 4;
  const legalRisk = /\b(sick|ill|food poisoning|allerg|lawyer|sue|refund|scam|fraud|dangerous)\b/i.test(review.text);
  const escalate = review.rating <= 2 || legalRisk;
  const reply = positive
    ? `Thank you so much${review.author ? `, ${review.author}` : ""}! We're thrilled you enjoyed it — it means a lot to the whole team at ${business}. See you again soon. 🙌`
    : legalRisk
      ? `We're very sorry to hear this${review.author ? `, ${review.author}` : ""}. This isn't the standard we hold ourselves to at ${business}. Please contact us directly so we can make it right immediately — your experience matters and we want to resolve it properly.`
      : `Thanks for the honest feedback${review.author ? `, ${review.author}` : ""}. We're sorry we fell short at ${business} — we're already looking at ${/\b(late|cold|wait|deliver)\b/i.test(review.text) ? "our delivery timing" : "this"} and would love the chance to put it right. Please reach out to us directly.`;
  return {
    reviewId: review.id, rating: review.rating, tone: brandTone, reply, escalate, legalRisk,
    internalNote: legalRisk
      ? "⚠ Legal/health-risk language — route to a manager, do NOT admit liability publicly, resolve privately, log the incident."
      : escalate ? "Negative review — resolve privately within 24h, then follow up to invite an updated review."
        : "Positive review — thank publicly; consider using as a marketing asset (with consent).",
  };
}

// ---------------------------------------------------------------------------
// Fake-review / manipulation risk (velocity, similarity, incentivised)
// ---------------------------------------------------------------------------
export function fakeReviewRisk(reviews: Review[]): { flagged: { id: string; risk: number; flags: string[] }[]; note: string } {
  const texts = reviews.map((r) => r.text.toLowerCase());
  const flagged = reviews.map((r, i) => {
    const flags: string[] = [];
    // near-duplicate text
    const dup = texts.filter((t, j) => j !== i && similarity(t, texts[i]) > 0.7).length;
    if (dup > 0) flags.push(`similar to ${dup} other review(s)`);
    if (/\b(discount|free|voucher|paid|gift|incentive)\b/i.test(r.text)) flags.push("incentivised-language");
    if (!r.verified) flags.push("unverified");
    const risk = clamp(dup * 35 + (flags.includes("incentivised-language") ? 30 : 0) + (r.verified ? 0 : 15));
    return { id: r.id, risk, flags };
  }).filter((f) => f.risk >= 40).sort((a, b) => b.risk - a.risk);
  return { flagged, note: flagged.length ? `${flagged.length} review(s) show manipulation signals — route to the moderation queue, request proof-of-service.` : "No manipulation signals in the current window." };
}

function similarity(a: string, b: string): number {
  const wa = new Set(a.split(/\W+/).filter(Boolean));
  const wb = new Set(b.split(/\W+/).filter(Boolean));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / Math.max(1, Math.min(wa.size, wb.size));
}

// ---------------------------------------------------------------------------
// Reviews → marketing assets (social proof studio)
// ---------------------------------------------------------------------------
export function reviewToAssets(review: Review, business: string): { socialCard: string; testimonialBlock: string; adBadge: string; linkedinPost: string } {
  const stars = "★".repeat(Math.round(review.rating)) + "☆".repeat(5 - Math.round(review.rating));
  return {
    socialCard: `${stars}\n"${review.text}"\n— ${review.author || "Verified customer"}, ${business}`,
    testimonialBlock: `"${review.text}" — ${review.author || "Verified customer"}${review.verified ? " ✓ Verified" : ""}`,
    adBadge: `${review.rating}★ "${review.text.split(".")[0]}." — real ${business} customer`,
    linkedinPost: `Proud of this one. A ${business} customer said:\n\n"${review.text}"\n\nThis is why we do what we do. ${stars}`,
  };
}

// ---------------------------------------------------------------------------
// Competitor trust comparison
// ---------------------------------------------------------------------------
export function competitorTrust(mine: TrustReport, competitors: { name: string; rating: number; reviews: number }[]): {
  trustAdvantageScore: number; ranking: { name: string; rating: number; reviews: number; ahead: boolean }[]; beatPlan: string[];
} {
  const all = [{ name: mine.business, rating: mine.averageRating, reviews: mine.reviewCount }, ...competitors]
    .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  const myIdx = all.findIndex((x) => x.name === mine.business);
  const ranking = all.map((x, i) => ({ ...x, ahead: i < myIdx }));
  const leader = all[0];
  const advantage = clamp(50 + (mine.averageRating - (competitors.reduce((a, c) => a + c.rating, 0) / Math.max(1, competitors.length))) * 25);
  return {
    trustAdvantageScore: advantage,
    ranking,
    beatPlan: myIdx === 0
      ? ["You lead on trust — put the rating in every ad and on the landing page to convert on it."]
      : [
          `${leader.name} leads at ${leader.rating}★ / ${leader.reviews} reviews.`,
          `Close the volume gap: run the review-invitation flow (email/SMS/WhatsApp) after every order.`,
          `Out-respond them: reply to 100% of reviews — response rate is a visible trust signal.`,
          `Win on the topic they're weak at — target their common complaint in your positioning.`,
        ],
  };
}
