// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// YepAPI-class classic-SEO intelligence engine (keyword research, SERP tracking,
// backlink profiling, on-page audit).
//
// PURE, DETERMINISTIC, DEMO-SAFE. Every volume/difficulty/authority number is
// derived by seeding an FNV-1a hash off the keyword/domain string — there is NO
// external SEO API call in demo mode, and NO Date/Math.random anywhere. Because
// these numbers are synthesised, they are ESTIMATES ONLY: we never claim exact
// Google search volumes, and every payload carries an explicit disclaimer.
//
// Scope note: GEO / AI-visibility (does ChatGPT recommend you?) lives in
// src/backend/geo.ts. This engine is deliberately the *classic* SEO surface —
// organic keywords, blue-link SERPs, backlinks, and technical on-page hygiene —
// and does not duplicate the GEO readiness/citation logic.

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
// Map a hash into an arbitrary [min, max] inclusive band.
const band = (s: string, min: number, max: number): number => min + (seed(s) % (max - min + 1));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeoIntent = "informational" | "commercial" | "transactional" | "navigational";

export type KeywordEstimate = {
  term: string;
  /** Relative demand proxy 0–100 (NOT an absolute monthly search count). */
  volumeProxy: number;
  /** Ranking difficulty proxy 0–100 (higher = harder). */
  difficulty: number;
  /** Blended opportunity 0–100 (high demand, low difficulty = high score). */
  opportunityScore: number;
  intent: SeoIntent;
};

export type KeywordResearch = {
  seedKeyword: string;
  ideas: KeywordEstimate[];
  related: KeywordEstimate[];
  longTail: KeywordEstimate[];
  questions: KeywordEstimate[]; // People-Also-Ask style
  buyerIntent: KeywordEstimate[];
  disclaimer: string;
};

export type SerpFeature =
  | "featured_snippet"
  | "local_pack"
  | "paa"
  | "shopping"
  | "video"
  | "image_pack"
  | "sitelinks"
  | "knowledge_panel";

export type SerpResult = {
  keyword: string;
  domain: string;
  position: number; // 1–100 estimated organic rank
  features: SerpFeature[];
  competitorsAbove: { domain: string; position: number }[];
  trend: "up" | "down" | "flat";
  disclaimer: string;
};

export type BacklinkProfile = {
  domain: string;
  referringDomains: number;
  domainAuthorityProxy: number; // 0–100
  newLinks: number;
  lostLinks: number;
  toxicLinks: number;
  anchorTextTop: { anchor: string; share: number }[]; // share = % of total anchors
  gapVsCompetitor: string[];
  disclaimer: string;
};

export type AuditSeverity = "low" | "medium" | "high";

export type AuditIssue = { check: string; severity: AuditSeverity; detail: string };

export type OnPageAudit = {
  url: string;
  score: number; // 0–100
  issues: AuditIssue[];
  disclaimer: string;
};

export type KeywordResearchOpts = {
  /** Bias the estimates toward a market/locale label (folded into the seed). */
  market?: string;
  /** Cap per-bucket keyword count (default 6, clamped 1–12). */
  limit?: number;
};

const ESTIMATE_DISCLAIMER =
  "Estimate only — deterministic model, not live Google data. Volume/difficulty/authority are relative proxies (0–100), never exact search counts. Validate against a live data source before spending budget.";

// ---------------------------------------------------------------------------
// Keyword research
// ---------------------------------------------------------------------------

const INTENTS: SeoIntent[] = ["informational", "commercial", "transactional", "navigational"];

function makeKeyword(term: string, forcedIntent?: SeoIntent): KeywordEstimate {
  const volumeProxy = pct(term + "|vol");
  const difficulty = pct(term + "|diff");
  // Opportunity rewards demand and penalises difficulty; clamped to 0–100.
  const opportunityScore = Math.max(0, Math.min(100, Math.round(volumeProxy * 0.6 + (100 - difficulty) * 0.4)));
  const intent = forcedIntent ?? INTENTS[seed(term + "|intent") % INTENTS.length];
  return { term, volumeProxy, difficulty, opportunityScore, intent };
}

export function keywordResearch(seedKeyword: string, opts: KeywordResearchOpts = {}): KeywordResearch {
  const base = seedKeyword.trim().toLowerCase() || "small business marketing";
  const market = opts.market ? ` ${opts.market.trim().toLowerCase()}` : "";
  const limit = Math.max(1, Math.min(12, opts.limit ?? 6));
  const tag = (label: string) => base + market + "|" + label;

  const ideaMods = ["best", "top", "affordable", "professional", "local", "trusted", "24/7", "premium"];
  const relatedMods = ["services", "company", "agency", "near me", "reviews", "pricing", "cost", "packages"];
  const longTailMods = [
    "how much does it cost",
    "for small business owners",
    "with same-day availability",
    "that accept mobile money",
    "open on weekends",
    "no contract required",
    "step by step guide",
    "compared to alternatives",
  ];
  const questionStems = [
    `how do i choose the best ${base}`,
    `what is the average price of ${base}`,
    `is ${base} worth it`,
    `how long does ${base} take`,
    `who offers ${base} near me`,
    `what should i ask before hiring ${base}`,
    `can i get ${base} on a small budget`,
    `how do i compare ${base} providers`,
  ];
  const buyerMods = ["buy", "hire", "book", "order", "get a quote for", "sign up for", "price of", "deals on"];

  const ideas = ideaMods.slice(0, limit).map((m) => makeKeyword(`${m} ${base}${market}`.trim()));
  const related = relatedMods.slice(0, limit).map((m) => makeKeyword(`${base} ${m}${market}`.trim()));
  const longTail = longTailMods.slice(0, limit).map((m) => makeKeyword(`${base} ${m}${market}`.trim(), "informational"));
  const questions = questionStems.slice(0, limit).map((q) => makeKeyword(q.trim(), "informational"));
  // Buyer-intent bucket is forced transactional/commercial by the modifier.
  const buyerIntent = buyerMods.slice(0, limit).map((m) => {
    const t = `${m} ${base}${market}`.trim();
    const isTransactional = seed(tag(t)) % 2 === 0;
    return makeKeyword(t, isTransactional ? "transactional" : "commercial");
  });

  return {
    seedKeyword: base,
    ideas,
    related,
    longTail,
    questions,
    buyerIntent,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// SERP tracker
// ---------------------------------------------------------------------------

const ALL_FEATURES: SerpFeature[] = [
  "featured_snippet",
  "local_pack",
  "paa",
  "shopping",
  "video",
  "image_pack",
  "sitelinks",
  "knowledge_panel",
];

export function serpTracker(keyword: string, domain: string): SerpResult {
  const kw = keyword.trim().toLowerCase() || "small business marketing";
  const dom = domain.trim().toLowerCase() || "example.com";
  const key = kw + "@" + dom;

  const position = band(key + "|pos", 1, 100);

  // Deterministically light up a subset of SERP features.
  const features = ALL_FEATURES.filter((f) => seed(kw + "|feat|" + f) % 3 === 0);

  // Competitors ranking above us: fill positions 1..position-1, capped at 5.
  const above = Math.min(5, position - 1);
  const competitorsAbove = Array.from({ length: above }, (_, i) => {
    const p = i + 1;
    const cdom = `competitor${band(key + "|c" + p, 1, 40)}.com`;
    return { domain: cdom, position: p };
  });

  const trendPick = seed(key + "|trend") % 3;
  const trend: SerpResult["trend"] = trendPick === 0 ? "up" : trendPick === 1 ? "down" : "flat";

  return {
    keyword: kw,
    domain: dom,
    position,
    features,
    competitorsAbove,
    trend,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Backlink profile
// ---------------------------------------------------------------------------

export function backlinkProfile(domain: string): BacklinkProfile {
  const dom = domain.trim().toLowerCase() || "example.com";

  const referringDomains = band(dom + "|ref", 12, 4200);
  const domainAuthorityProxy = pct(dom + "|da");
  const newLinks = band(dom + "|new", 0, 120);
  const lostLinks = band(dom + "|lost", 0, 80);
  const toxicLinks = band(dom + "|tox", 0, 45);

  // Anchor-text distribution that sums to <=100; remainder is "other".
  const rawAnchors = [
    { anchor: dom, w: band(dom + "|a1", 20, 45) }, // branded
    { anchor: "click here", w: band(dom + "|a2", 5, 20) },
    { anchor: "official site", w: band(dom + "|a3", 4, 15) },
    { anchor: "read more", w: band(dom + "|a4", 3, 12) },
    { anchor: "learn more", w: band(dom + "|a5", 2, 10) },
  ];
  let running = 0;
  const anchorTextTop = rawAnchors.map((a) => {
    const share = Math.min(a.w, 100 - running);
    running += share;
    return { anchor: a.anchor, share };
  });

  const gapVsCompetitor = [
    "Competitor has editorial links from local news outlets you lack — pitch a data story.",
    "Missing niche directory citations (industry associations, chamber of commerce).",
    "No guest posts on complementary-service blogs; competitor has several.",
    "Competitor earns links from supplier/partner pages — request reciprocal listings.",
  ].slice(0, 3 + (seed(dom + "|gapn") % 2));

  return {
    domain: dom,
    referringDomains,
    domainAuthorityProxy,
    newLinks,
    lostLinks,
    toxicLinks,
    anchorTextTop,
    gapVsCompetitor,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// On-page technical audit
// ---------------------------------------------------------------------------

type AuditCheck = { check: string; deduct: number; severity: AuditSeverity; okDetail: string; badDetail: string };

const AUDIT_CHECKS: AuditCheck[] = [
  { check: "title", deduct: 12, severity: "high", okDetail: "Title tag present and within 50–60 chars.", badDetail: "Title tag missing, duplicated, or over 60 chars — rewrite for the primary keyword." },
  { check: "meta-description", deduct: 8, severity: "medium", okDetail: "Meta description present and compelling.", badDetail: "Meta description missing or truncated — add an answerable 150–160 char summary." },
  { check: "headings", deduct: 8, severity: "medium", okDetail: "Single H1 with logical H2/H3 outline.", badDetail: "Multiple or missing H1 / broken heading hierarchy — enforce one H1 per page." },
  { check: "broken-links", deduct: 12, severity: "high", okDetail: "No broken internal or outbound links detected.", badDetail: "Broken links found (4xx/5xx) — fix or redirect to preserve crawl equity." },
  { check: "canonical", deduct: 8, severity: "medium", okDetail: "Canonical tag present and self-referencing.", badDetail: "Missing or conflicting canonical — duplicate-content risk; add a self-canonical." },
  { check: "sitemap", deduct: 6, severity: "low", okDetail: "XML sitemap present and referenced in robots.txt.", badDetail: "No XML sitemap referenced — generate one and declare it in robots.txt." },
  { check: "speed", deduct: 14, severity: "high", okDetail: "Core Web Vitals in the passing band (estimate).", badDetail: "Slow LCP/CLS (estimate) — compress images, defer scripts, cache assets." },
  { check: "mobile", deduct: 10, severity: "high", okDetail: "Responsive, mobile-friendly viewport.", badDetail: "Mobile usability issues (estimate) — fix viewport, tap targets, and overflow." },
  { check: "structured-data", deduct: 8, severity: "medium", okDetail: "Valid JSON-LD structured data present.", badDetail: "No structured data — add Organisation/LocalBusiness/Product JSON-LD." },
  { check: "ai-readability", deduct: 6, severity: "low", okDetail: "Clear, quotable, well-chunked copy (AI-friendly).", badDetail: "Dense copy without question headings — restructure for AI/SERP answer extraction." },
];

export function onPageAudit(url: string): OnPageAudit {
  const u = url.trim().toLowerCase() || "https://example.com";
  let score = 100;
  const issues: AuditIssue[] = [];
  for (const c of AUDIT_CHECKS) {
    // Deterministically pass/fail each check off the url + check name.
    const passes = seed(u + "|check|" + c.check) % 3 !== 0; // ~1/3 fail
    if (!passes) {
      score -= c.deduct;
      issues.push({ check: c.check, severity: c.severity, detail: c.badDetail });
    }
  }
  score = Math.max(0, Math.min(100, score));
  const order: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { url: u, score, issues, disclaimer: ESTIMATE_DISCLAIMER };
}

// ---------------------------------------------------------------------------
// Demo (zero-config) — a fictional restaurant site
// ---------------------------------------------------------------------------

export type SeoDemo = {
  keywords: KeywordResearch;
  serp: SerpResult;
  backlinks: BacklinkProfile;
  audit: OnPageAudit;
  doctrine: string;
};

export function demoSeo(): SeoDemo {
  const domain = "mamaskitchen.example";
  return {
    keywords: keywordResearch("restaurant kinshasa", { market: "kinshasa", limit: 6 }),
    serp: serpTracker("best restaurant kinshasa", domain),
    backlinks: backlinkProfile(domain),
    audit: onPageAudit("https://mamaskitchen.example/menu"),
    doctrine:
      "Classic-SEO intelligence: every number here is a deterministic ESTIMATE, never a live Google metric. We label all projections as estimates, fabricate no rankings or testimonials, and defer AI-visibility to the GEO engine.",
  };
}
