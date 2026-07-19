// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Strike phase engine (docs/ai-os/13 Part 2, dossier F2 Phase 1) —
// MW-04 GEO Recon + MW-02 LLM Citation Radar + MW-09 Magnet Foundry.
//
// Deterministic like the Failure Audit engine (src/backend/audit.ts): given
// the signals a tenant provides (or demo defaults), it computes a stable GEO
// Readiness Score and a Citation Share-of-Voice profile — no external calls in
// demo mode. Live citation firing (prompt batteries at ChatGPT/Claude/Gemini/
// Perplexity) routes through the AI Gateway when provider keys are present;
// the honest `mode` flag says which path ran.
//
// Honesty rule (dossier §10 causal-measurement safeguard): we never claim all
// AI-referral growth is ours — scores are readiness/visibility measurements,
// not attribution.

// ---------------------------------------------------------------------------
// MW-04/MW-09 · GEO Readiness Audit ("Does ChatGPT recommend your business?")
// ---------------------------------------------------------------------------

export type GeoSignals = {
  llmsTxt?: boolean; // llms.txt present
  jsonLd?: boolean; // JSON-LD structured data
  faqSchema?: boolean; // FAQ schema
  botAllow?: boolean; // GPTBot/ClaudeBot/PerplexityBot allowed in robots.txt
  questionHeadings?: boolean; // question-based H2/H3s
  freshness?: boolean; // visible last-updated dates
  hreflang?: boolean; // hreflang for multi-locale (FR/EN/Lingala)
  authorship?: boolean; // named expert authorship (E-E-A-T)
};

type GeoCategory = { name: string; score: number; weight: number; note: string };
type GeoFix = { severity: "critical" | "high" | "medium"; title: string; fix: string; autoFix: boolean };

export type GeoAudit = {
  overall: number; // 0–100 GEO Readiness Score
  tier: "invisible" | "emerging" | "competitive" | "cited";
  verdict: string;
  categories: GeoCategory[];
  fixes: GeoFix[];
};

// Weighted GEO categories (sum of weights = 100).
export function geoAudit(input: { business?: string; website?: string; signals?: GeoSignals }): GeoAudit {
  // Demo defaults: a typical un-optimised SMB site — most AI-visibility levers off.
  const s: Required<GeoSignals> = {
    llmsTxt: false, jsonLd: true, faqSchema: false, botAllow: true,
    questionHeadings: false, freshness: true, hreflang: false, authorship: false,
    ...(input.signals ?? {}),
  };
  const cats: GeoCategory[] = [
    { name: "Machine-readable structure (JSON-LD)", weight: 18, score: s.jsonLd ? 88 : 30, note: s.jsonLd ? "Organisation/Product schema detected" : "No JSON-LD — LLMs can't parse your entities" },
    { name: "AI crawler access (llms.txt + bot directives)", weight: 18, score: (s.llmsTxt ? 60 : 0) + (s.botAllow ? 40 : 0), note: s.llmsTxt ? "llms.txt present" : "No llms.txt — you're not declaring content to AI crawlers" },
    { name: "Answerability (FAQ + question headings)", weight: 16, score: (s.faqSchema ? 50 : 0) + (s.questionHeadings ? 50 : 20), note: s.faqSchema ? "FAQ schema present" : "No FAQ schema — you won't be quoted in answers" },
    { name: "Authority signals (named authorship, E-E-A-T)", weight: 14, score: s.authorship ? 82 : 34, note: s.authorship ? "Expert authorship present" : "No named author — weak trust signal for AI ranking" },
    { name: "Freshness (last-updated dates)", weight: 12, score: s.freshness ? 80 : 40, note: s.freshness ? "Dated content" : "No visible dates — AI prefers fresh sources" },
    { name: "Multi-locale reach (hreflang)", weight: 12, score: s.hreflang ? 85 : 45, note: s.hreflang ? "hreflang configured" : "No hreflang — FR/EN/Lingala audiences underserved" },
    { name: "Entity clarity", weight: 10, score: s.jsonLd && s.authorship ? 78 : 48, note: "How unambiguously AI can identify who you are" },
  ];
  const overall = Math.round(cats.reduce((a, c) => a + c.score * c.weight, 0) / 100);
  const tier: GeoAudit["tier"] = overall >= 80 ? "cited" : overall >= 60 ? "competitive" : overall >= 40 ? "emerging" : "invisible";
  const verdict =
    tier === "invisible" ? "AI assistants can barely see you — ChatGPT is unlikely to recommend your business today."
    : tier === "emerging" ? "You're partially visible to AI, but competitors with cleaner signals will be cited first."
    : tier === "competitive" ? "You're a candidate for AI citations — close the gaps below to win the recommendation."
    : "Strong AI-readiness — you're built to be cited. Keep freshness and authority high.";

  // Fixes, worst-scoring first, with auto-fix eligibility (Magnet Foundry patches).
  const fixCandidates: GeoFix[] = [
    !s.llmsTxt ? { severity: "critical", title: "Add llms.txt", fix: "Generate an llms.txt declaring your key pages to AI crawlers.", autoFix: true } : null,
    !s.faqSchema ? { severity: "high", title: "Add FAQ schema", fix: "Wrap common questions in FAQPage JSON-LD so LLMs can quote you.", autoFix: true } : null,
    !s.questionHeadings ? { severity: "high", title: "Question-based headings", fix: "Rewrite H2/H3s as the questions customers ask AI.", autoFix: false } : null,
    !s.authorship ? { severity: "medium", title: "Add named authorship", fix: "Attribute content to a named expert with a bio (E-E-A-T).", autoFix: false } : null,
    !s.hreflang ? { severity: "medium", title: "Configure hreflang", fix: "Declare FR/EN (and Lingala/Swahili) variants for multi-locale reach.", autoFix: true } : null,
    !s.jsonLd ? { severity: "critical", title: "Add JSON-LD", fix: "Add Organisation + Product structured data.", autoFix: true } : null,
  ].filter(Boolean) as GeoFix[];
  const order = { critical: 0, high: 1, medium: 2 };
  const fixes = fixCandidates.sort((a, b) => order[a.severity] - order[b.severity]);

  return { overall, tier, verdict, categories: cats, fixes };
}

// ---------------------------------------------------------------------------
// MW-02 · LLM Citation Radar — Citation Share-of-Voice across AI engines
// ---------------------------------------------------------------------------

const AI_ENGINES = ["ChatGPT", "Claude", "Gemini", "Perplexity"] as const;

export type CitationRadar = {
  mode: "demo" | "live";
  shareOfVoice: number; // tenant's % of citations across the prompt battery
  engines: { engine: string; tenantCited: number; competitorCited: number; rate: number }[];
  topPrompts: { prompt: string; cited: boolean; position: number | null; competitor: string | null }[];
  note: string;
};

// Deterministic demo profile (stable per business name); live firing routes
// through the gateway when configured (surfaced by the caller).
function seed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function citationRadar(input: { business?: string; competitors?: string[]; prompts?: string[] }): CitationRadar {
  const biz = input.business || "your business";
  const comp = (input.competitors && input.competitors[0]) || "the market leader";
  const base = seed(biz) % 30; // 0–29 baseline citation rate
  const engines = AI_ENGINES.map((engine, i) => {
    const rate = Math.min(85, base + ((seed(biz + engine) % 25) + i * 4));
    return { engine, tenantCited: rate, competitorCited: Math.min(95, rate + 20 + (seed(comp + engine) % 15)), rate };
  });
  const shareOfVoice = Math.round(engines.reduce((a, e) => a + e.rate, 0) / engines.length);
  const promptSeeds = input.prompts?.length
    ? input.prompts
    : [
        `best ${biz.split(" ")[0].toLowerCase()} near me`,
        `who offers this in my area`,
        `${comp} vs alternatives`,
        `is ${biz} any good`,
        `cheapest option for this`,
      ];
  const topPrompts = promptSeeds.slice(0, 6).map((prompt, i) => {
    const cited = (seed(biz + prompt) % 100) < shareOfVoice;
    return {
      prompt,
      cited,
      position: cited ? ((seed(prompt) % 3) + 1) : null,
      competitor: cited ? null : comp,
    };
  });
  return {
    mode: "demo",
    shareOfVoice,
    engines,
    topPrompts,
    note: "Demo profile (deterministic). Live mode fires your prompt battery at the real AI engines via the gateway once provider keys are set — and reports readiness/visibility, never attribution (dossier §10 safeguard).",
  };
}

// ---------------------------------------------------------------------------
// MW-09 · Magnet Foundry — the free-tool cluster (acquisition front door)
// ---------------------------------------------------------------------------

export const MAGNET_TOOLS = [
  { slug: "geo-audit", name: "GEO Audit", tagline: "Does ChatGPT recommend your business?", flagship: true },
  { slug: "llms-txt", name: "llms.txt Generator", tagline: "Declare your content to AI crawlers", flagship: false },
  { slug: "missing-keywords", name: "Missing Keywords", tagline: "Gaps competitors rank for and you don't", flagship: false },
  { slug: "robots-check", name: "Robots.txt Checker", tagline: "Are AI bots allowed to read you?", flagship: false },
  { slug: "sitemap-check", name: "Sitemap Checker", tagline: "Is your sitemap AI-crawlable?", flagship: false },
  { slug: "h1-check", name: "H1 Checker", tagline: "One clear H1 per page", flagship: false },
  { slug: "meta-check", name: "Meta Description Checker", tagline: "Answerable, quotable meta", flagship: false },
  { slug: "serp-preview", name: "SERP Snippet Preview", tagline: "How you appear in results", flagship: false },
  { slug: "competitor-snapshot", name: "Competitor Snapshot", tagline: "Their AI-visibility vs yours", flagship: false },
] as const;
