// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Market Listening — the Brandwatch-class social/market intelligence
// core (Organic Dominance OS). Given a stream of public mentions it computes:
//   • Share-of-voice vs competitors
//   • Sentiment breakdown (positive/neutral/negative)
//   • Topic velocity + emerging-topic alerts
//   • Influencer identification (by reach × engagement)
//   • Competitor momentum benchmark
//
// The live ingestion (social/forums/reviews/news/Reddit/YouTube) is connector-
// gated; THIS module is the deterministic scoring brain that turns a mention
// list into intelligence + recommended actions. Pure + deterministic (seeded)
// so it runs in demo mode and unit-checks. It analyses only supplied mentions —
// it never fabricates mentions, reach or sentiment.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const round1 = (n: number) => Math.round(n * 10) / 10;
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

export const SOURCES = ["twitter", "instagram", "tiktok", "facebook", "reddit", "youtube", "forum", "blog", "review", "news"] as const;
export type Source = typeof SOURCES[number];

export type Mention = {
  id: string;
  text: string;
  source: Source | string;
  author?: string;
  authorReach?: number;      // follower/subscriber count if known
  brand?: string;            // which brand this mention is ABOUT (self or a competitor)
  engagement?: number;       // likes+comments+shares
  period?: string;           // sortable bucket, e.g. "2026-W25"
  sentiment?: "positive" | "neutral" | "negative"; // if pre-labelled; else inferred
};

// Lightweight lexicon so sentiment is deterministic without a model.
const POS = ["love", "great", "amazing", "best", "recommend", "excellent", "perfect", "happy", "fast", "helpful", "delicious"];
const NEG = ["hate", "terrible", "awful", "worst", "broken", "slow", "rude", "refund", "scam", "disappointed", "cold", "error", "avoid"];

function inferSentiment(text: string): "positive" | "neutral" | "negative" {
  const lc = text.toLowerCase();
  let s = 0;
  for (const w of POS) if (lc.includes(w)) s++;
  for (const w of NEG) if (lc.includes(w)) s--;
  return s > 0 ? "positive" : s < 0 ? "negative" : "neutral";
}

// ---------------------------------------------------------------------------
// Sentiment + share-of-voice + topics + influencers, in one analysis.
// ---------------------------------------------------------------------------
export type SentimentBreakdown = { positive: number; neutral: number; negative: number; net: number };
export type Influencer = { author: string; reach: number; mentions: number; engagement: number; sentiment: string };
export type TopicSignal = { topic: string; count: number; velocity: number; emerging: boolean };

export type ListeningReport = {
  totalMentions: number;
  brand: string;
  sentiment: SentimentBreakdown;
  shareOfVoice: { brand: string; mentions: number; sharePct: number }[];
  topics: TopicSignal[];
  emergingAlerts: string[];
  influencers: Influencer[];
  reputationRisk: number;   // 0–100
  recommendedActions: string[];
  note: string;
};

const STOP = new Set(["the", "a", "an", "and", "or", "but", "for", "to", "of", "in", "on", "is", "it", "this", "that", "with", "my", "i", "so", "was", "you", "they", "we", "at", "be", "have", "not", "are", "too"]);

export function analyseMentions(mentions: Mention[], brand: string): ListeningReport {
  const withSent = mentions.map((m) => ({ ...m, sentiment: m.sentiment ?? inferSentiment(m.text), brand: m.brand ?? brand }));

  // Sentiment.
  const pos = withSent.filter((m) => m.sentiment === "positive").length;
  const neg = withSent.filter((m) => m.sentiment === "negative").length;
  const neu = withSent.length - pos - neg;
  const total = withSent.length || 1;
  const sentiment: SentimentBreakdown = {
    positive: Math.round(pos / total * 100),
    neutral: Math.round(neu / total * 100),
    negative: Math.round(neg / total * 100),
    net: Math.round((pos - neg) / total * 100),
  };

  // Share of voice by brand.
  const brandCounts = new Map<string, number>();
  for (const m of withSent) brandCounts.set(m.brand!, (brandCounts.get(m.brand!) ?? 0) + 1);
  const shareOfVoice = [...brandCounts.entries()]
    .map(([b, c]) => ({ brand: b, mentions: c, sharePct: round1(c / withSent.length * 100) }))
    .sort((a, b) => b.mentions - a.mentions);

  // Topics (word frequency across mentions) + velocity across periods.
  const periods = [...new Set(withSent.map((m) => m.period).filter(Boolean))].sort() as string[];
  const wordCount = new Map<string, number>();
  const wordByLastPeriod = new Map<string, number>();
  const lastPeriod = periods[periods.length - 1];
  const prevPeriod = periods[periods.length - 2];
  const wordByPrevPeriod = new Map<string, number>();
  for (const m of withSent) {
    const words = m.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
    for (const w of new Set(words)) {
      wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
      if (m.period === lastPeriod) wordByLastPeriod.set(w, (wordByLastPeriod.get(w) ?? 0) + 1);
      if (m.period === prevPeriod) wordByPrevPeriod.set(w, (wordByPrevPeriod.get(w) ?? 0) + 1);
    }
  }
  const topics: TopicSignal[] = [...wordCount.entries()]
    .map(([topic, count]) => {
      const now = wordByLastPeriod.get(topic) ?? 0;
      const before = wordByPrevPeriod.get(topic) ?? 0;
      const velocity = before > 0 ? round1((now - before) / before * 100) : now > 0 ? 100 : 0;
      return { topic, count, velocity, emerging: velocity >= 50 && now >= 2 };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const emergingAlerts = topics.filter((t) => t.emerging).map((t) => `"${t.topic}" is accelerating (+${t.velocity}% vs last period) — get ahead of it.`);

  // Influencers: authors by reach × engagement.
  const byAuthor = new Map<string, { reach: number; mentions: number; engagement: number; pos: number; neg: number }>();
  for (const m of withSent) {
    if (!m.author) continue;
    const cur = byAuthor.get(m.author) ?? { reach: 0, mentions: 0, engagement: 0, pos: 0, neg: 0 };
    cur.reach = Math.max(cur.reach, m.authorReach ?? 0);
    cur.mentions++; cur.engagement += m.engagement ?? 0;
    if (m.sentiment === "positive") cur.pos++; if (m.sentiment === "negative") cur.neg++;
    byAuthor.set(m.author, cur);
  }
  const influencers: Influencer[] = [...byAuthor.entries()]
    .map(([author, v]) => ({ author, reach: v.reach, mentions: v.mentions, engagement: v.engagement, sentiment: v.pos > v.neg ? "positive" : v.neg > v.pos ? "negative" : "neutral" }))
    .sort((a, b) => (b.reach * (b.engagement + 1)) - (a.reach * (a.engagement + 1)))
    .slice(0, 5);

  // Reputation risk: negative share weighted by negative reach.
  const negReach = withSent.filter((m) => m.sentiment === "negative").reduce((s, m) => s + (m.authorReach ?? 0), 0);
  const totReach = withSent.reduce((s, m) => s + (m.authorReach ?? 0), 0) || 1;
  const reputationRisk = clamp(sentiment.negative * 0.6 + negReach / totReach * 100 * 0.4);

  const recommendedActions: string[] = [];
  if (reputationRisk >= 50) recommendedActions.push("Reputation risk elevated — respond to top negative mentions and open a crisis check.");
  if (emergingAlerts.length) recommendedActions.push("Create content on the emerging topic(s) before competitors do.");
  const topRival = shareOfVoice.find((s) => s.brand !== brand);
  if (topRival && topRival.mentions > (shareOfVoice.find((s) => s.brand === brand)?.mentions ?? 0)) recommendedActions.push(`${topRival.brand} is out-voicing you — launch a share-of-voice push.`);
  if (influencers.some((i) => i.sentiment === "positive")) recommendedActions.push("Engage your positive high-reach voices — invite them to the creator programme.");
  if (!recommendedActions.length) recommendedActions.push("Stable — keep monitoring; no urgent action.");

  return {
    totalMentions: withSent.length,
    brand,
    sentiment,
    shareOfVoice,
    topics,
    emergingAlerts,
    influencers,
    reputationRisk,
    recommendedActions,
    note: "Computed only from the supplied mentions — sentiment/reach/velocity are labelled estimates, never fabricated. Every insight carries a recommended action.",
  };
}

// ---------------------------------------------------------------------------
// Purchase-Intent & Lead-Detection (Organic Dominance §8) — turn mentions into
// Lead Opportunity Cards. Detects commercially valuable statements, not just
// counts. Only flags real supplied text — never invents an opportunity.
// ---------------------------------------------------------------------------
const INTENT_PHRASES: { pattern: RegExp; readiness: "high" | "medium" | "low"; need: string }[] = [
  { pattern: /\b(can anyone recommend|any recommendations|recommend a)\b/i, readiness: "medium", need: "recommendation" },
  { pattern: /\b(where can i (buy|get)|where to buy)\b/i, readiness: "high", need: "purchase" },
  { pattern: /\b(how much (does|is|for)|what('| i)?s the price|pricing)\b/i, readiness: "high", need: "pricing" },
  { pattern: /\b(looking for (a|an)|need (a|an) (supplier|company|provider)|we need a supplier)\b/i, readiness: "high", need: "supplier search" },
  { pattern: /\b(best alternative to|alternative to|switch from)\b/i, readiness: "high", need: "competitor switch" },
  { pattern: /\b(unhappy with|frustrated with|disappointed with)\b/i, readiness: "medium", need: "competitor dissatisfaction" },
  { pattern: /\b(does anyone provide|who provides|anyone offer)\b/i, readiness: "medium", need: "provider search" },
  { pattern: /\b(accepting proposals|request for proposal|rfp|quote for)\b/i, readiness: "high", need: "procurement" },
];

export type LeadCard = {
  mentionId: string;
  source: string;
  author: string;
  text: string;
  need: string;
  purchaseReadiness: "high" | "medium" | "low";
  urgency: "high" | "medium" | "low";
  competitorsMentioned: string[];
  recommendedResponse: string;
  confidence: number;
  estimatedValueGbp: number | null;
  complianceStatus: "review" | "clear";
};

export function detectLeads(mentions: Mention[], competitors: string[] = []): { leads: LeadCard[]; note: string } {
  const leads: LeadCard[] = [];
  for (const m of mentions) {
    const hit = INTENT_PHRASES.find((p) => p.pattern.test(m.text));
    if (!hit) continue;
    const lc = m.text.toLowerCase();
    const competitorsMentioned = competitors.filter((c) => lc.includes(c.toLowerCase()));
    const urgency: "high" | "medium" | "low" = /\b(urgent|asap|today|now|this week)\b/i.test(m.text) ? "high" : hit.readiness === "high" ? "medium" : "low";
    const confidence = clamp(50 + (hit.readiness === "high" ? 25 : hit.readiness === "medium" ? 10 : 0) + (competitorsMentioned.length ? 10 : 0) + (m.authorReach && m.authorReach > 10000 ? 5 : 0));
    leads.push({
      mentionId: m.id,
      source: String(m.source),
      author: m.author ?? "unknown",
      text: m.text,
      need: hit.need,
      purchaseReadiness: hit.readiness,
      urgency,
      competitorsMentioned,
      recommendedResponse: hit.need === "competitor switch" || competitorsMentioned.length
        ? "Reply with a genuine differentiator (no knocking-copy) + a direct-message offer; assign to sales."
        : hit.need === "pricing"
          ? "Answer the price question transparently in-thread, then offer a tailored quote via DM."
          : "Helpfully answer in-thread, then invite to DM/WhatsApp with a relevant offer.",
      confidence,
      estimatedValueGbp: hit.readiness === "high" ? 250 : hit.readiness === "medium" ? 120 : null,
      complianceStatus: "review", // every outbound reply passes the consent/compliance gate first
    });
  }
  return {
    leads: leads.sort((a, b) => b.confidence - a.confidence),
    note: `Detected ${leads.length} buying-intent opportunity card(s) from the supplied mentions. Readiness/value are estimates; every reply must pass the consent + compliance gate before sending.`,
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo so the engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoMarketListening(): ListeningReport {
  const mentions: Mention[] = [
    { id: "m1", text: "The grill at Brixton Grill House is amazing, best steak in London", source: "twitter", author: "@foodie_lon", authorReach: 42000, engagement: 320, brand: "Brixton Grill House", period: "2026-W24" },
    { id: "m2", text: "service was slow and my order was cold, disappointed", source: "review", author: "diner22", authorReach: 200, engagement: 12, brand: "Brixton Grill House", period: "2026-W24" },
    { id: "m3", text: "love the new vegan menu, so helpful staff", source: "instagram", author: "@veganeats", authorReach: 88000, engagement: 540, brand: "Brixton Grill House", period: "2026-W25" },
    { id: "m4", text: "Rival Smokehouse has the best burgers now, fast delivery", source: "tiktok", author: "@londonbites", authorReach: 120000, engagement: 900, brand: "Rival Smokehouse", period: "2026-W25" },
    { id: "m5", text: "vegan options everywhere this month, great trend", source: "reddit", author: "u/londonfood", authorReach: 5000, engagement: 60, brand: "Brixton Grill House", period: "2026-W25" },
    { id: "m6", text: "terrible wait times, avoid on weekends", source: "forum", author: "grumpy_eater", authorReach: 800, engagement: 30, brand: "Rival Smokehouse", period: "2026-W25" },
  ];
  return analyseMentions(mentions, "Brixton Grill House");
}
