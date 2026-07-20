// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// YouTube SEO Intelligence engine (YepAPI §11) — keyword/topic research,
// viral-title pattern analysis, comment pain-point mining + sentiment,
// short-form script generation, and thumbnail strategy.
//
// PURE, DETERMINISTIC, DEMO-SAFE. Every volume/competition/opportunity/score
// number is derived by seeding an FNV-1a hash off the input string — there is
// NO YouTube Data API call in demo mode, and NO Date/Math.random anywhere.
// Because these numbers are synthesised, they are ESTIMATES ONLY: we never
// claim real YouTube view counts, subscriber figures or ranking data, and
// every payload carries an explicit disclaimer. Sentiment and pain-point
// clusters are lexical heuristics over the supplied text, not audience data.

// ---------------------------------------------------------------------------
// Deterministic seed (FNV-1a; owner-mandated verbatim helper)
// ---------------------------------------------------------------------------

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

// Map a hash into an inclusive [0, 100] band, stably per input string.
const pct = (s: string): number => seed(s) % 101;

const ESTIMATE_DISCLAIMER =
  "Estimate only — deterministic heuristic model, not live YouTube Data API results. Search-volume/competition/opportunity/score are relative proxies (0–100), never real view, subscriber or ranking counts. Validate against a live source before spending budget.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TopicIdea = {
  topic: string;
  /** Relative demand proxy 0–100 (NOT an absolute search count). */
  searchVolumeProxy: number;
  /** Ranking/competition proxy 0–100 (higher = more crowded). */
  competition: number;
  /** Blended opportunity 0–100 (high demand, low competition = high score). */
  opportunity: number;
};

export type KeywordResearch = {
  seed: string;
  ideas: TopicIdea[];
  disclaimer: string;
};

export type TitleAnalysis = {
  title: string;
  /** Viral patterns detected in the title. */
  patterns: string[];
  /** Blended click-through-potential proxy 0–100 (ESTIMATE). */
  score: number;
};

export type PainPoint = {
  theme: string;
  count: number;
  examples: string[];
};

export type Sentiment = {
  positive: number;
  negative: number;
  neutral: number;
};

export type CommentMining = {
  painPoints: PainPoint[];
  sentiment: Sentiment;
  disclaimer: string;
};

export type ShortsScript = {
  topic: string;
  hook: string;
  retentionBeats: string[];
  cta: string;
  disclaimer: string;
};

export type ThumbnailStrategy = {
  topic: string;
  recommendations: string[];
  disclaimer: string;
};

// ---------------------------------------------------------------------------
// Keyword / topic research
// ---------------------------------------------------------------------------

const TOPIC_TEMPLATES: string[] = [
  "how to {s} for beginners",
  "{s} explained in 10 minutes",
  "{s} mistakes you must avoid",
  "5 {s} tips that actually work",
  "the truth about {s}",
  "{s} tutorial (step by step)",
  "why your {s} isn't working",
  "{s} in 2026 — what changed",
];

function makeTopic(topic: string): TopicIdea {
  const searchVolumeProxy = pct(topic + "|vol");
  const competition = pct(topic + "|comp");
  // Opportunity rewards demand and penalises competition; clamped to 0–100.
  const opportunity = Math.max(
    0,
    Math.min(100, Math.round(searchVolumeProxy * 0.6 + (100 - competition) * 0.4))
  );
  return { topic, searchVolumeProxy, competition, opportunity };
}

export function keywordResearch(seedTerm: string): KeywordResearch {
  const base = seedTerm.trim().toLowerCase() || "small business marketing";
  const ideas = TOPIC_TEMPLATES.map((t) => makeTopic(t.replace("{s}", base)));
  // Highest-opportunity ideas first (stable, deterministic tie-break by topic).
  ideas.sort((a, b) => b.opportunity - a.opportunity || (a.topic < b.topic ? -1 : 1));
  return { seed: base, ideas, disclaimer: ESTIMATE_DISCLAIMER };
}

// ---------------------------------------------------------------------------
// Viral title pattern analysis
// ---------------------------------------------------------------------------

const CURIOSITY_WORDS: string[] = [
  "secret",
  "truth",
  "nobody",
  "never",
  "why",
  "shocking",
  "surprising",
  "hidden",
  "mistake",
  "before",
  "stop",
  "avoid",
  "revealed",
];

const LISTICLE_RE = /\b(\d+)\s+(ways|tips|things|reasons|steps|hacks|secrets|mistakes|ideas|tools)\b/i;

function detectPatterns(title: string): string[] {
  const t = title.toLowerCase();
  const patterns: string[] = [];
  if (/\d/.test(title)) patterns.push("has-number");
  if (/[\[\](){}]/.test(title)) patterns.push("has-brackets");
  if (CURIOSITY_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(t))) {
    patterns.push("curiosity");
  }
  if (/\bhow to\b/i.test(t)) patterns.push("how-to");
  if (LISTICLE_RE.test(title)) patterns.push("listicle");
  return patterns;
}

export function analyseTitles(titles: string[]): TitleAnalysis[] {
  const results: TitleAnalysis[] = titles
    .filter((t): t is string => typeof t === "string" && t.trim() !== "")
    .map((raw) => {
      const title = raw.trim();
      const patterns = detectPatterns(title);
      // Each detected viral pattern adds weight; blend with a deterministic
      // baseline so titles without patterns still score consistently. ESTIMATE.
      const baseline = pct(title + "|ctr") * 0.4;
      const patternWeight = Math.min(60, patterns.length * 15);
      const score = Math.max(0, Math.min(100, Math.round(baseline + patternWeight)));
      return { title, patterns, score };
    });
  // Best (highest-scoring) titles first; deterministic tie-break by title.
  results.sort((a, b) => b.score - a.score || (a.title < b.title ? -1 : 1));
  return results;
}

// ---------------------------------------------------------------------------
// Comment mining — pain-points + naive sentiment
// ---------------------------------------------------------------------------

type PainTheme = { theme: string; markers: string[] };

const PAIN_THEMES: PainTheme[] = [
  { theme: "confusing / too complex", markers: ["confus", "complicat", "lost", "hard to follow", "overwhelm", "don't understand", "dont understand"] },
  { theme: "too slow / too long", markers: ["too long", "boring", "slow", "get to the point", "drag"] },
  { theme: "price / too expensive", markers: ["expensive", "price", "cost", "afford", "cheaper", "money"] },
  { theme: "not working / broken", markers: ["doesn't work", "doesnt work", "not working", "broke", "error", "failed", "bug"] },
  { theme: "missing detail / wants more", markers: ["more detail", "wish you", "should have", "didn't explain", "didnt explain", "what about", "how do i"] },
  { theme: "outdated", markers: ["outdated", "old", "no longer", "2020", "2021", "doesn't apply", "changed"] },
];

const POSITIVE_MARKERS: string[] = [
  "love",
  "great",
  "amazing",
  "thank",
  "helpful",
  "awesome",
  "best",
  "excellent",
  "perfect",
  "clear",
  "nice",
  "good",
];

const NEGATIVE_MARKERS: string[] = [
  "hate",
  "bad",
  "terrible",
  "awful",
  "worst",
  "confus",
  "waste",
  "boring",
  "useless",
  "wrong",
  "disappoint",
  "annoying",
];

export function mineComments(comments: string[]): CommentMining {
  const clean = comments.filter(
    (c): c is string => typeof c === "string" && c.trim() !== ""
  );

  const painPoints: PainPoint[] = PAIN_THEMES.map((theme) => {
    const examples: string[] = [];
    let count = 0;
    for (const c of clean) {
      const lc = c.toLowerCase();
      if (theme.markers.some((m) => lc.includes(m))) {
        count += 1;
        if (examples.length < 3) examples.push(c.trim());
      }
    }
    return { theme: theme.theme, count, examples };
  })
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || (a.theme < b.theme ? -1 : 1));

  let positive = 0;
  let negative = 0;
  let neutral = 0;
  for (const c of clean) {
    const lc = c.toLowerCase();
    const pos = POSITIVE_MARKERS.some((m) => lc.includes(m));
    const neg = NEGATIVE_MARKERS.some((m) => lc.includes(m));
    if (pos && !neg) positive += 1;
    else if (neg && !pos) negative += 1;
    else neutral += 1;
  }

  return {
    painPoints,
    sentiment: { positive, negative, neutral },
    disclaimer:
      "Estimate only — pain-point clusters and sentiment are lexical heuristics over the supplied comment text, not audience-research data. No comments, authors or metrics are fabricated; empty input yields empty results.",
  };
}

// ---------------------------------------------------------------------------
// Short-form (Shorts / Reels / TikTok) script
// ---------------------------------------------------------------------------

const HOOK_TEMPLATES: string[] = [
  "Stop scrolling — here's the {s} mistake costing you the most.",
  "Nobody tells you this about {s}, so I will.",
  "The fastest way to fix your {s} in under 30 seconds.",
  "If your {s} isn't working, it's probably this.",
  "3 seconds to change how you think about {s}.",
];

const CTA_TEMPLATES: string[] = [
  "Follow for the full {s} breakdown — no fluff.",
  "Comment 'MORE' and I'll drop the deep-dive on {s}.",
  "Save this so your next {s} attempt actually lands.",
  "Full {s} guide is pinned — go watch it next.",
];

export function shortsScript(topic: string): ShortsScript {
  const t = topic.trim() || "small business marketing";
  const hook = HOOK_TEMPLATES[seed(t + "|hook") % HOOK_TEMPLATES.length].replace("{s}", t);
  const cta = CTA_TEMPLATES[seed(t + "|cta") % CTA_TEMPLATES.length].replace("{s}", t);
  // A 15–30s beat sheet: fast, retention-optimised, one idea per beat.
  const retentionBeats: string[] = [
    `0–3s HOOK: open on the boldest ${t} claim, hard cut, on-screen text mirrors the spoken line.`,
    `3–8s STAKES: name the pain — what viewers lose by getting ${t} wrong.`,
    `8–15s PAYOFF: deliver the single most useful ${t} tip, one concrete example.`,
    `15–22s PROOF: show it working (screen, before/after, quick demo) to hold retention.`,
    `22–27s LOOP: tie the ending back to the hook so the video re-watches cleanly.`,
    `27–30s CTA: one clear ask, no more than one.`,
  ];
  return {
    topic: t,
    hook,
    retentionBeats,
    cta,
    disclaimer:
      "Estimate/heuristic script scaffold — timings and beats are guidance, not guaranteed performance. All projections are labelled estimates.",
  };
}

// ---------------------------------------------------------------------------
// Thumbnail strategy
// ---------------------------------------------------------------------------

export function thumbnailStrategy(topic: string): ThumbnailStrategy {
  const t = topic.trim() || "small business marketing";
  const recommendations: string[] = [
    `Use 3 words max of large, high-contrast text — never restate the full "${t}" title.`,
    "Show one clear focal subject (a face with an expressive emotion out-performs objects).",
    "Pick a colour that contrasts YouTube's white/dark UI so the frame pops in-feed.",
    "Add a single curiosity element (arrow, circle, before/after split) — not five.",
    "Keep readability at phone size: test the thumbnail scaled to ~120px wide.",
    "A/B two variants (different expression or text) and keep the higher-retention winner.",
    `Match the promise to the video — do NOT fabricate a result the ${t} content doesn't deliver (no clickbait that breaks trust).`,
  ];
  return {
    topic: t,
    recommendations,
    disclaimer:
      "Heuristic best-practice guidance, not a performance guarantee. Honesty rule: the thumbnail must reflect real content — never fabricate results or bait.",
  };
}

// ---------------------------------------------------------------------------
// Demo (zero-config)
// ---------------------------------------------------------------------------

export type YoutubeDemo = {
  keywords: KeywordResearch;
  titles: TitleAnalysis[];
  comments: CommentMining;
  script: ShortsScript;
  thumbnails: ThumbnailStrategy;
  doctrine: string;
};

export function demoYoutube(): YoutubeDemo {
  const topic = "youtube seo for small business";
  return {
    keywords: keywordResearch(topic),
    titles: analyseTitles([
      "How To Rank YouTube Videos in 2026 (Full Guide)",
      "5 Thumbnail Mistakes Killing Your Views",
      "The Secret Nobody Tells You About YouTube SEO",
      "My marketing channel setup",
    ]),
    comments: mineComments([
      "This was so helpful, thank you! Finally clear.",
      "Honestly too long and boring, get to the point.",
      "The tool doesn't work for me, I keep getting an error.",
      "Great video but I wish you explained the pricing more, it seems expensive.",
      "This is outdated, YouTube changed the algorithm since 2021.",
      "Love it, best explanation I've seen.",
    ]),
    script: shortsScript(topic),
    thumbnails: thumbnailStrategy(topic),
    doctrine:
      "YouTube SEO intelligence: every volume, competition, opportunity and title score is a deterministic ESTIMATE, never a live YouTube metric. We label all projections as estimates, fabricate no view counts, comments or testimonials, and keep thumbnails/titles honest to the underlying content.",
  };
}
