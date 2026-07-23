// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MARKETWAR ORGANIC DOMINANCE OS — Intelligence Foundation (Phase 1 + §38 MVP).
//
// The autonomous demand-intelligence + market-execution engine. This module is
// the spine: Website-to-Growth onboarding (§5/§16) that turns a URL + business
// context into a REAL structured intelligence workup — keyword universe, prompt
// universe, competitor gaps, and scored opportunities using the TRANSPARENT §13
// formula — plus the command-centre metric contract, the 20-section navigation
// map, and the honest data-source registry.
//
// Honesty doctrine (owner law): every number is either computed from a real
// signal or clearly a labelled estimate. Capabilities that require licensed
// external data (Brandwatch-style live social listening; live ChatGPT/Perplexity/
// Gemini answer monitoring; backlink indexes) are marked "connect a data source"
// — never fabricated mentions, citations or share-of-voice. The live workup runs
// through the AI gateway; with no key it returns a deterministic STRUCTURAL
// scaffold derived from the user's own inputs (honestly badged), never invented
// market data.

import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";
import { quoteAcu } from "@/backend/acu";

// ---------------------------------------------------------------------------
// §3 — The 20-section navigation, each mapped to a real destination or an
// honest status. `live` = wired to a working engine; `connect` = needs a data
// source; `foundation` = delivered by this module now.
// ---------------------------------------------------------------------------
export type NavStatus = "foundation" | "live" | "connect";
export type NavSection = { n: number; key: string; label: string; status: NavStatus; route?: string; note: string };

export const NAV_SECTIONS: NavSection[] = [
  { n: 1, key: "command", label: "Command Centre", status: "foundation", route: "/dashboard/organic-dominance", note: "Live metrics + daily briefing + one-click actions (this surface)." },
  { n: 2, key: "listening", label: "Market Listening", status: "connect", note: "Live social/forum/news listening activates when a listening data source is connected — we never invent mentions." },
  { n: 3, key: "search", label: "Search Intelligence", status: "foundation", note: "Keyword + prompt universe generated in onboarding; live volumes fill from Search Console." },
  { n: 4, key: "ai_visibility", label: "AI Visibility", status: "connect", note: "Live ChatGPT/Perplexity/Gemini answer monitoring activates with an AI-answer data source." },
  { n: 5, key: "competitor", label: "Competitor War Room", status: "live", route: "/dashboard/competitors", note: "Wired to the live competitor engine." },
  { n: 6, key: "opportunity", label: "Opportunity Radar", status: "foundation", route: "/dashboard/organic-dominance", note: "Scored opportunities with the transparent §13 formula." },
  { n: 7, key: "content", label: "Content Command", status: "live", route: "/dashboard/content", note: "Wired to the Content Factory." },
  { n: 8, key: "authority", label: "Authority Engine", status: "connect", note: "Backlink/PR opportunities activate with a backlink data source; outreach drafting is live via agents." },
  { n: 9, key: "community", label: "Community Intelligence", status: "connect", note: "Reddit/forum participation activates with a community data source; governed, no mass posting." },
  { n: 10, key: "reputation", label: "Reputation & Crisis", status: "live", route: "/dashboard/reputation", note: "Wired to the Reputation Shield; live crisis velocity needs a listening source." },
  { n: 11, key: "lead_capture", label: "Lead Capture", status: "live", route: "/dashboard/customers", note: "Wired to the Customer Vault + landing lead capture." },
  { n: 12, key: "conversion", label: "Conversion Intelligence", status: "live", route: "/dashboard/landing-builder", note: "Wired to the Conversion Architect + landing pages." },
  { n: 13, key: "customer_voice", label: "Customer Voice", status: "live", route: "/dashboard/segments", note: "First-party voice from the vault; ticket/call ingestion connects as a data source." },
  { n: 14, key: "influencer", label: "Influencer Intelligence", status: "live", route: "/dashboard/influencers", note: "Per-brand AI recruitment advisor + commission model; live discovery needs a creator data source." },
  { n: 15, key: "local", label: "Local Market Intelligence", status: "live", route: "/dashboard/local", note: "Wired to Local Domination; live GBP data connects as a source." },
  { n: 16, key: "reports", label: "Reports & Attribution", status: "live", route: "/dashboard/revenue", note: "Wired to Revenue Intel; full attribution chain builds as sources connect." },
  { n: 17, key: "automations", label: "Automations", status: "live", route: "/dashboard/automation", note: "Wired to the Automation Lab." },
  { n: 18, key: "data_sources", label: "Data Sources", status: "foundation", route: "/dashboard/organic-dominance", note: "Connect listening, search and AI-answer sources (below)." },
  { n: 19, key: "governance", label: "Governance", status: "live", route: "/dashboard/settings", note: "Roles, approvals + audit in Settings & Security." },
  { n: 20, key: "acu", label: "Cost & ACU Control", status: "live", route: "/dashboard/billing", note: "Wired to the ACU governance + billing engine." },
];

// ---------------------------------------------------------------------------
// §6/§10/§34 — Data-source registry. Honest connection status (env-gated). A
// source that is not connected NEVER produces numbers — the surface says so.
// ---------------------------------------------------------------------------
// connectType — WHO connects it and HOW:
//   "admin" = a platform-wide licensed data feed; the owner sets one env key and
//             it is connected for everyone (no per-user action).
//   "oauth" = a per-brand account each user authorises for their own brand.
export type DataSource = {
  key: string; label: string; category: "search" | "listening" | "ai_answers" | "analytics" | "cms" | "authority";
  envKey: string; connected: boolean; unlocks: string;
  connectType: "admin" | "oauth"; how: string;
};

function connected(envKey: string): boolean { return Boolean(envKey && process.env[envKey]); }

export function dataSources(): DataSource[] {
  const S = (key: string, label: string, category: DataSource["category"], envKey: string, unlocks: string, connectType: "admin" | "oauth", how: string): DataSource =>
    ({ key, label, category, envKey, connected: connected(envKey), unlocks, connectType, how });
  return [
    S("search_console", "Google Search Console", "search", "GOOGLE_SEARCH_CONSOLE_TOKEN", "Real search volumes, rankings, impressions + click data", "oauth", "Per-brand: connect this brand's Search Console property (owner registers the Google OAuth app, then each user authorises their own site)."),
    S("analytics", "Google Analytics", "analytics", "GOOGLE_ANALYTICS_TOKEN", "Traffic, conversions + organic-influenced revenue", "oauth", "Per-brand: connect this brand's GA4 property via Google OAuth."),
    S("serp", "SERP data provider", "search", "SERPER_API_KEY", "Live SERP features, People-Also-Ask + competitor rankings", "admin", "Admin: set SERPER_API_KEY in the environment — connects live SERP data for every brand."),
    S("listening", "Social listening provider", "listening", "LISTENING_API_KEY", "Live mentions across social, forums, news + reviews", "admin", "Admin: set LISTENING_API_KEY in the environment."),
    S("ai_answers", "AI-answer monitor", "ai_answers", "AI_ANSWER_MONITOR_KEY", "Brand visibility + citations in ChatGPT / Perplexity / Gemini", "admin", "Admin: set AI_ANSWER_MONITOR_KEY in the environment."),
    S("backlinks", "Backlink index", "authority", "BACKLINK_API_KEY", "Backlink gaps, unlinked mentions + toxic-link detection", "admin", "Admin: set BACKLINK_API_KEY in the environment."),
    S("cms", "CMS (WordPress / Webflow / Shopify)", "cms", "CMS_PUBLISH_TOKEN", "One-click publishing of approved content", "oauth", "Per-brand: connect this brand's CMS account (WordPress/Webflow/Shopify) to publish approved content."),
  ];
}

// ---------------------------------------------------------------------------
// §13 — Transparent, recomputable Opportunity Score. Every factor is 0–1; the
// score is computed HERE (not asserted by the model), so it is editable and
// auditable. Score = Demand × Intent × Relevance × Timing × Authority × Conv ÷ Competition.
// ---------------------------------------------------------------------------
export type OppFactors = { demand: number; commercialIntent: number; relevance: number; timing: number; authorityProbability: number; conversionProbability: number; competition: number };

const clamp01 = (n: number) => Math.max(0.05, Math.min(1, Number.isFinite(n) ? n : 0.5));

export function opportunityScore(f: OppFactors): number {
  const demand = clamp01(f.demand), intent = clamp01(f.commercialIntent), rel = clamp01(f.relevance);
  const timing = clamp01(f.timing), auth = clamp01(f.authorityProbability), conv = clamp01(f.conversionProbability);
  const comp = clamp01(f.competition);
  // Normalise to 0–100. Numerator is a product of six 0–1 factors; divide by
  // competition; scale so a strong, low-competition opportunity approaches 100.
  const raw = (demand * intent * rel * timing * auth * conv) / comp;
  return Math.round(Math.min(100, raw * 100));
}

// ---------------------------------------------------------------------------
// §5/§16 — Website-to-Growth onboarding. Real structured AI workup, or an
// honest deterministic scaffold derived from the user's own inputs.
// ---------------------------------------------------------------------------
export type OnboardingInput = {
  business: string;
  website?: string;
  description?: string; // what they do / products / audience in the user's words
  competitors?: string[];
  location?: string;
  country?: string;
  languages?: string[];
  lang?: string; // output language
};

export type KeywordItem = { keyword: string; cluster: string; intent: "informational" | "commercial" | "transactional" | "local" | "navigational"; commercialScore: number };
export type PromptItem = { prompt: string; category: string; commercialScore: number };
export type CompetitorGap = { competitor: string; weakness: string; exploit: string };
export type Opportunity = { title: string; category: string; factors: OppFactors; score: number; recommendedAction: string; actionType: OneClickAction };
export type ContentPillar = { pillar: string; why: string };
export type PlanPhase = { phase: string; focus: string; actions: string[] };

export type OnboardingResult = {
  mode: "live" | "scaffold";
  business: string;
  businessProfile: { whatTheyDo: string; audience: string; valueProps: string[]; locations: string[] };
  keywordUniverse: KeywordItem[];
  promptUniverse: PromptItem[];
  competitorGaps: CompetitorGap[];
  opportunities: Opportunity[];
  contentPillars: ContentPillar[];
  ninetyDayPlan: PlanPhase[];
  note: string;
};

// §4 one-click actions — each routes to a real engine on the client.
export type OneClickAction =
  | "create_article" | "create_landing" | "create_comparison" | "create_offer"
  | "brief_sales" | "launch_campaign" | "add_to_pipeline" | "publish" | "monitor";

const SYSTEM = `You are the MarketWar Organic Dominance OS onboarding analyst. From a business's own inputs you produce a STRUCTURED intelligence workup for organic + AI-search demand capture. British English. Be concrete and commercial. NEVER fabricate statistics, search volumes, mention counts, citations or competitor data you cannot infer — you are structuring strategy from the given inputs, not reporting live market data. Where you estimate, keep it as a 0–1 factor.

Return STRICT JSON only (no markdown fence, no prose) matching:
{
  "businessProfile": { "whatTheyDo": string, "audience": string, "valueProps": string[], "locations": string[] },
  "keywordUniverse": [ { "keyword": string, "cluster": string, "intent": "informational"|"commercial"|"transactional"|"local"|"navigational", "commercialScore": number(0-1) } ],
  "promptUniverse": [ { "prompt": string, "category": string, "commercialScore": number(0-1) } ],
  "competitorGaps": [ { "competitor": string, "weakness": string, "exploit": string } ],
  "opportunities": [ { "title": string, "category": string, "recommendedAction": string, "actionType": "create_article"|"create_landing"|"create_comparison"|"create_offer"|"brief_sales"|"launch_campaign"|"add_to_pipeline"|"publish"|"monitor", "factors": { "demand": number(0-1), "commercialIntent": number(0-1), "relevance": number(0-1), "timing": number(0-1), "authorityProbability": number(0-1), "conversionProbability": number(0-1), "competition": number(0-1) } } ],
  "contentPillars": [ { "pillar": string, "why": string } ],
  "ninetyDayPlan": [ { "phase": string, "focus": string, "actions": string[] } ]
}
Provide 12-20 keywords, 10-16 prompts, 3-8 competitor gaps, 6-12 opportunities, 4-6 content pillars, 3 plan phases (Days 1-30, 31-60, 61-90). Keywords/prompts must reflect real buyer language for this business, including local + AI-assistant phrasing.`;

function safeJson(text: string): Record<string, unknown> | null {
  let t = (text || "").trim();
  // Strip ```json … ``` fences the model sometimes adds.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* maybe truncated */ }
  // Recover a truncated object: walk back to the last balanced brace.
  const s = m[0];
  for (let end = s.length - 1; end > 100; end--) {
    if (s[end] !== "}") continue;
    try { return JSON.parse(s.slice(0, end + 1)) as Record<string, unknown>; } catch { /* keep walking */ }
  }
  return null;
}

export async function runOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const business = (input.business || "").trim() || "your business";
  const prompt = [
    `Business: ${business}`,
    input.website ? `Website: ${input.website}` : "",
    input.description ? `What they do / products / audience: ${input.description}` : "",
    input.location ? `Location: ${input.location}` : "",
    input.country ? `Country: ${input.country}` : "",
    input.competitors?.length ? `Competitors: ${input.competitors.join(", ")}` : "",
    input.languages?.length ? `Languages/markets (support code-switching + local slang): ${input.languages.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  let fallbackReason: string | null = null;
  try {
    const res = await gatewayComplete({ system: SYSTEM, prompt, maxTokens: 4096, lang: input.lang });
    const parsed = safeJson(res.text);
    if (parsed) return shapeResult(parsed, business, "live");
    // Key IS configured (the call returned) but the JSON didn't parse — do NOT
    // claim "no AI provider": say what actually happened.
    fallbackReason = "The AI responded but its answer couldn't be parsed as complete JSON (usually an over-long response). Showing the structural scaffold — press Run again to retry.";
    console.error("[organic-dominance] AI response not parseable JSON; head:", (res.text || "").slice(0, 160));
  } catch (e) {
    if (e instanceof GatewayUnconfiguredError) {
      fallbackReason = null; // genuinely no key set
    } else {
      fallbackReason = `AI provider error: ${(e as Error).message}. Showing the structural scaffold — this is a provider/config issue, not a missing key.`;
      console.error("[organic-dominance] gateway error:", e);
    }
  }
  return scaffold(input, business, fallbackReason);
}

// Coerce the model's JSON into typed, score-recomputed results.
function shapeResult(p: Record<string, unknown>, business: string, mode: "live" | "scaffold"): OnboardingResult {
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const bp = (p.businessProfile as Record<string, unknown>) || {};
  const opportunities: Opportunity[] = arr<Record<string, unknown>>(p.opportunities).map((o) => {
    const factors = normFactors((o.factors as Record<string, unknown>) || {});
    return {
      title: String(o.title || "Opportunity"),
      category: String(o.category || "content"),
      factors,
      score: opportunityScore(factors),
      recommendedAction: String(o.recommendedAction || ""),
      actionType: (VALID_ACTIONS.has(String(o.actionType)) ? String(o.actionType) : "create_article") as OneClickAction,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    mode, business,
    businessProfile: {
      whatTheyDo: String(bp.whatTheyDo || ""),
      audience: String(bp.audience || ""),
      valueProps: arr<string>(bp.valueProps).map(String),
      locations: arr<string>(bp.locations).map(String),
    },
    keywordUniverse: arr<Record<string, unknown>>(p.keywordUniverse).map((k) => ({
      keyword: String(k.keyword || ""), cluster: String(k.cluster || "general"),
      intent: (["informational", "commercial", "transactional", "local", "navigational"].includes(String(k.intent)) ? String(k.intent) : "commercial") as KeywordItem["intent"],
      commercialScore: clamp01(Number(k.commercialScore)),
    })).filter((k) => k.keyword),
    promptUniverse: arr<Record<string, unknown>>(p.promptUniverse).map((k) => ({
      prompt: String(k.prompt || ""), category: String(k.category || "informational"), commercialScore: clamp01(Number(k.commercialScore)),
    })).filter((k) => k.prompt),
    competitorGaps: arr<Record<string, unknown>>(p.competitorGaps).map((c) => ({
      competitor: String(c.competitor || ""), weakness: String(c.weakness || ""), exploit: String(c.exploit || ""),
    })).filter((c) => c.competitor),
    opportunities,
    contentPillars: arr<Record<string, unknown>>(p.contentPillars).map((c) => ({ pillar: String(c.pillar || ""), why: String(c.why || "") })).filter((c) => c.pillar),
    ninetyDayPlan: arr<Record<string, unknown>>(p.ninetyDayPlan).map((c) => ({ phase: String(c.phase || ""), focus: String(c.focus || ""), actions: arr<string>(c.actions).map(String) })).filter((c) => c.phase),
    note: mode === "live"
      ? "Structured from your inputs by the intelligence engine. Search volumes, live mentions and AI-answer citations fill in once you connect those data sources — nothing here is fabricated market data."
      : "Structural scaffold generated deterministically from your inputs (no AI provider connected). It gives you the universes + opportunity structure to act on now; connect an AI provider for the full analysis and data sources for live figures.",
  };
}

const VALID_ACTIONS = new Set<string>(["create_article", "create_landing", "create_comparison", "create_offer", "brief_sales", "launch_campaign", "add_to_pipeline", "publish", "monitor"]);

function normFactors(f: Record<string, unknown>): OppFactors {
  return {
    demand: clamp01(Number(f.demand)), commercialIntent: clamp01(Number(f.commercialIntent)),
    relevance: clamp01(Number(f.relevance)), timing: clamp01(Number(f.timing)),
    authorityProbability: clamp01(Number(f.authorityProbability)), conversionProbability: clamp01(Number(f.conversionProbability)),
    competition: clamp01(Number(f.competition)),
  };
}

// Deterministic scaffold from the user's own inputs — honest, no invented data.
// `noteOverride` carries the REAL reason when a key IS present but the AI call
// failed, so we never mislead the user with "no AI provider connected".
function scaffold(input: OnboardingInput, business: string, noteOverride?: string | null): OnboardingResult {
  const words = (input.description || business).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const uniq = Array.from(new Set(words)).slice(0, 8);
  const loc = input.location || input.country || "your area";
  const kw = (seed: string): KeywordItem[] => ([
    { keyword: `best ${seed} ${loc}`, cluster: seed, intent: "local", commercialScore: 0.8 },
    { keyword: `${seed} near me`, cluster: seed, intent: "local", commercialScore: 0.85 },
    { keyword: `${seed} price`, cluster: seed, intent: "transactional", commercialScore: 0.9 },
    { keyword: `how to choose ${seed}`, cluster: seed, intent: "informational", commercialScore: 0.5 },
  ]);
  const keywordUniverse = uniq.slice(0, 4).flatMap(kw).slice(0, 16);
  const promptUniverse: PromptItem[] = uniq.slice(0, 4).flatMap((s) => ([
    { prompt: `What is the best ${s} provider in ${loc}?`, category: "recommendation", commercialScore: 0.85 },
    { prompt: `How much does ${s} cost?`, category: "purchase", commercialScore: 0.8 },
    { prompt: `Is ${business} good for ${s}?`, category: "trust", commercialScore: 0.7 },
  ])).slice(0, 12);
  const opportunities: Opportunity[] = keywordUniverse.slice(0, 6).map((k) => {
    const factors: OppFactors = { demand: k.commercialScore, commercialIntent: k.intent === "transactional" ? 0.9 : 0.6, relevance: 0.8, timing: 0.6, authorityProbability: 0.5, conversionProbability: k.intent === "transactional" ? 0.6 : 0.4, competition: 0.6 };
    const actionType: OneClickAction = k.intent === "local" ? "create_landing" : "create_article";
    return { title: `Win "${k.keyword}"`, category: "content", factors, score: opportunityScore(factors), recommendedAction: `Create a page targeting "${k.keyword}".`, actionType };
  }).sort((a, b) => b.score - a.score);
  return {
    mode: "scaffold", business,
    businessProfile: { whatTheyDo: input.description || "", audience: "", valueProps: [], locations: [loc] },
    keywordUniverse, promptUniverse,
    competitorGaps: (input.competitors || []).map((c) => ({ competitor: c, weakness: "Run the live analysis to detect gaps", exploit: "Create an alternative-to / comparison page" })),
    opportunities,
    contentPillars: uniq.slice(0, 4).map((p) => ({ pillar: p, why: `Core theme in your inputs — build a content cluster around "${p}".` })),
    ninetyDayPlan: [
      { phase: "Days 1–30", focus: "Foundation + high-intent pages", actions: ["Publish the top transactional/local pages", "Fix technical + AI-readiness basics", "Connect Search Console"] },
      { phase: "Days 31–60", focus: "Authority + prompts", actions: ["Build content pillars", "Answer the top buyer prompts", "Start AI-visibility tracking"] },
      { phase: "Days 61–90", focus: "Convert + amplify", actions: ["Launch offers from top opportunities", "Capture + route leads", "Amplify winners"] },
    ],
    note: noteOverride || "Structural scaffold generated deterministically from your inputs (no AI provider connected). Connect an AI provider for full analysis and data sources for live figures. Nothing here is fabricated market data.",
  };
}

// ---------------------------------------------------------------------------
// §4 — Command-centre metrics contract. A metric is either { value } (real /
// computed) or { needsSource } (honest — requires a connected data source). We
// never emit a fabricated value for a metric that depends on licensed data.
// ---------------------------------------------------------------------------
export type Metric = { key: string; label: string; value: number | null; unit?: string; needsSource?: string; note?: string };

export function commandMetrics(signals: { contactCount?: number; competitorCount?: number }): { metrics: Metric[]; live: boolean } {
  const src = dataSources();
  const has = (k: string) => src.find((s) => s.key === k)?.connected ?? false;
  const searchLive = has("search_console") || has("serp");
  const listeningLive = has("listening");
  const aiLive = has("ai_answers");

  const m: Metric[] = [
    { key: "market_attention", label: "Market Attention Score", value: listeningLive ? null : null, needsSource: listeningLive ? undefined : "Social listening", note: "Live volume + reach across sources" },
    { key: "brand_demand", label: "Brand Demand Score", value: null, needsSource: searchLive ? undefined : "Search Console / SERP", note: "Branded + category search demand" },
    { key: "search_visibility", label: "Search Visibility Score", value: null, needsSource: searchLive ? undefined : "Search Console", note: "Coverage + ranking across your keyword universe" },
    { key: "ai_visibility", label: "AI Answer Visibility Score", value: null, needsSource: aiLive ? undefined : "AI-answer monitor", note: "Brand mention + citation rate in AI answers" },
    { key: "share_of_voice", label: "Social Share of Voice", value: null, needsSource: listeningLive ? undefined : "Social listening", note: "Your share vs competitors" },
    { key: "purchase_intent", label: "Purchase Intent Volume", value: null, needsSource: listeningLive ? undefined : "Social listening", note: "High-intent statements detected" },
    { key: "reputation_risk", label: "Reputation Risk", value: null, needsSource: listeningLive ? undefined : "Social listening", note: "Negative velocity + crisis signals" },
    { key: "vault_leads", label: "Captured Leads (vault)", value: signals.contactCount ?? 0, note: "Real — from your Customer Vault" },
    { key: "competitors_tracked", label: "Competitors Tracked", value: signals.competitorCount ?? 0, note: "Real — configured competitors" },
  ];
  return { metrics: m, live: searchLive || listeningLive || aiLive };
}

// §32 — ACU cost preview for a workup, margin-protected (provider cost hidden).
export function onboardingAcuQuote(providerCostGbp = 0.02) {
  const q = quoteAcu({ providerCostGbp, actionClass: "high", variants: 1 });
  return { acus: q.acus, marginMultiplier: q.marginMultiplier };
}
