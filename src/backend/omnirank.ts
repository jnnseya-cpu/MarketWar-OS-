// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// OMNIRANK DOMINION STACK (Engineering Spec ES-05) — command layer.
// Source: docs/reference/omnirank-dominion-stack-ES-05.md.
//
// Extends the Search Dominance Engine with the EXECUTION + DEFENCE layer: the
// MW-14→MW-22 module registry, the 22-agent APEX SWARM (MW-A24→MW-A45), the
// Sentinel compliance hard-gate, the ACU action economy, the Opportunity Score
// and the Dominion Score. Where a module already exists as a live OS engine, it
// links there; the rest are honest "connect a source" / blueprint.
//
// WHITE-HAT ONLY (Rank Defense Doctrine + owner honesty law): no guaranteed
// rankings; Sentinel HARD-BLOCKS paid links/PBNs/cloaking/doorways/undisclosed AI
// mass-publishing/review-manipulation/astroturf. Every score is a transparent,
// labelled heuristic — never a promise.

export const DOMINION_DOCTRINE =
  "Manufacture the conditions under which a ranking is inevitable, then defend it. Own the full answer surface — organic position, SERP feature, AI citation, social result, knowledge panel — simultaneously. White-hat only.";

// §12 — Strategic honesty (sell it without a lie in it).
export const OMNIRANK_HONESTY = {
  guaranteed: "The fastest, most complete, most defensible execution of every LEGITIMATE ranking and citation lever, running continuously, at a speed no human agency matches. Most competitors execute ~5% of this playbook, quarterly, by hand.",
  notGuaranteed: "Literal #1 on every query on every engine forever. Engines are adversarial and ranking is relative — any vendor promising permanent #1 is lying or about to get the client penalised.",
  realClaim: "The only system that closes the loop — listening → intelligence → AI-answer capture → authority acquisition → defence — autonomously, in one graph.",
  differentiator: "Win the winnable, defend the won, and detect the loss before the client does.",
};

export type ModuleStatus = "live" | "foundation" | "connect" | "blueprint";
export type OmnirankModule = { id: string; name: string; tagline: string; capabilities: string[]; status: ModuleStatus; route?: string };

export const OMNIRANK_MODULES: OmnirankModule[] = [
  { id: "MW-14", name: "OMNIRANK Core", tagline: "Entity & index substrate — the nervous system", capabilities: ["Crawl mesh (robots-respecting, JS-rendered)", "Neo4j entity graph + sameAs", "Index ledger (Google/Bing/Yandex/Naver + AI-crawler logs)", "Rank matrix (kw × device × locale × feature)", "Share-of-Answer per AI engine"], status: "connect", route: "/dashboard/organic-dominance" },
  { id: "MW-15", name: "Authority Warfare", tagline: "Link inevitability — five white-hat rails", capabilities: ["Reclamation (unlinked mentions, broken inbound)", "Displacement (competitor backlink winnability)", "Asset Forge (data studies, tools, indices)", "Digital PR (8-min journalist response)", "Ecosystem (partners/associations/citations)", "Toxic-link firewall + disavow"], status: "connect" },
  { id: "MW-16", name: "Answer Capture (GEO/AEO)", tagline: "Own the AI layer", capabilities: ["Prompt-universe mapping (5k–50k)", "Citation-gap ledger", "Chunk-level extractability", "Fact anchoring", "Consensus seeding", "llms.txt + full schema"], status: "foundation", route: "/dashboard/search-dominance" },
  { id: "MW-17", name: "Content Velocity Forge", tagline: "Topical authority at industrial velocity", capabilities: ["Cluster architecture + gap scoring", "Brief → draft → human gate → publish", "Decay radar", "Cannibalisation resolver", "E-E-A-T quality gate (no unreviewed publish)"], status: "live", route: "/dashboard/content" },
  { id: "MW-18", name: "Technical Supremacy", tagline: "Eligibility, defended", capabilities: ["CWV audit + code-level diffs (INP/LCP/CLS)", "Crawl-budget + log analysis + orphan detection", "Full schema graph", "hreflang / international", "CI/CD regression guard"], status: "connect", route: "/dashboard/website-intel" },
  { id: "MW-19", name: "Social Signal Amplification", tagline: "Search includes social; social includes search", capabilities: ["Platform-native search (TikTok/YT/IG/LinkedIn/Pinterest/Reddit/X)", "Atomiser (1 pillar → 14 derivatives)", "Community authority (disclosure-enforced, no astroturf)", "Creator layer via the monetisation programme"], status: "live", route: "/dashboard/amplify" },
  { id: "MW-20", name: "SERP Feature Sniper", tagline: "Take the pixels, not just the position", capabilities: ["Featured snippet · PAA · AI Overview citation", "Image/Video pack · Local pack · Knowledge panel", "Sitelinks · Review stars · FAQ · Top Stories · Shopping", "Eligibility → prescription → deploy → verify → hold"], status: "connect" },
  { id: "MW-21", name: "Competitor Displacement", tagline: "Strike the moment they slip", capabilities: ["Continuous top-10 teardown", "Keyword theft engine (ROI-sequenced)", "Weakness radar (decay/expiry/broken/CWV)", "Counter-move simulator"], status: "live", route: "/dashboard/competitors" },
  { id: "MW-22", name: "Rank Defence / Algorithm Shield", tagline: "Winning is easier than holding", capabilities: ["Algorithm volatility monitoring", "Penalty early-warning + spam self-audit", "Negative-SEO defence", "★ Sentinel compliance hard-gate"], status: "foundation", route: "/dashboard/reputation" },
];

// §2/§12 — Sentinel: the classes HARD-BLOCKED before execution (not warnings).
export const SENTINEL_BLOCKED = [
  "Paid link schemes", "Private blog networks (PBNs)", "Cloaking", "Doorway pages",
  "Undisclosed AI mass-publishing", "Review manipulation", "Astroturf / fake consensus",
];

// §3 — APEX SWARM (22 agents). Each maps to a module + core function.
export type ApexAgent = { id: string; name: string; module: string; fn: string; sentinel?: boolean };
export const APEX_SWARM: ApexAgent[] = [
  { id: "MW-A24", name: "Cartographer", module: "MW-14", fn: "Crawl orchestration, site-graph construction" },
  { id: "MW-A25", name: "Entity Weaver", module: "MW-14", fn: "Neo4j entity resolution, sameAs binding" },
  { id: "MW-A26", name: "Index Warden", module: "MW-14", fn: "Index-status tracking, AI-crawler log analysis" },
  { id: "MW-A27", name: "Rank Scribe", module: "MW-14", fn: "Position-matrix ingestion, anomaly flagging" },
  { id: "MW-A28", name: "Reclaimer", module: "MW-15", fn: "Unlinked mentions, broken-link recovery" },
  { id: "MW-A29", name: "Siegebreaker", module: "MW-15", fn: "Competitor backlink mapping + winnability" },
  { id: "MW-A30", name: "Forgemaster", module: "MW-15", fn: "Linkable-asset ideation + production briefs" },
  { id: "MW-A31", name: "Envoy", module: "MW-15", fn: "Outreach drafting, sequencing, reply classification" },
  { id: "MW-A32", name: "Newshound", module: "MW-15", fn: "Journalist-request capture, 8-min expert response" },
  { id: "MW-A33", name: "Oracle", module: "MW-16", fn: "Prompt-universe generation + multi-engine testing" },
  { id: "MW-A34", name: "Citation Hunter", module: "MW-16", fn: "Citation-gap ledger, source attribution tracing" },
  { id: "MW-A35", name: "Chunksmith", module: "MW-16", fn: "Passage-level extractability optimisation" },
  { id: "MW-A36", name: "Consensus", module: "MW-16", fn: "Cross-source claim consistency enforcement" },
  { id: "MW-A37", name: "Cartel", module: "MW-17", fn: "Topical cluster architecture + gap scoring" },
  { id: "MW-A38", name: "Quill", module: "MW-17", fn: "Brief → draft → review-gate pipeline" },
  { id: "MW-A39", name: "Necromancer", module: "MW-17", fn: "Decay detection, refresh queueing, cannibal resolution" },
  { id: "MW-A40", name: "Ironclad", module: "MW-18", fn: "CWV, crawl budget, schema, regression guard" },
  { id: "MW-A41", name: "Megaphone", module: "MW-19", fn: "Social atomisation, platform-native search" },
  { id: "MW-A42", name: "Sniper", module: "MW-20", fn: "SERP-feature eligibility + capture sequencing" },
  { id: "MW-A43", name: "Vulture", module: "MW-21", fn: "Competitor weakness radar, displacement sequencing" },
  { id: "MW-A44", name: "Bastion", module: "MW-22", fn: "Volatility monitoring, negative-SEO defence" },
  { id: "MW-A45", name: "Sentinel", module: "MW-22", fn: "Policy-compliance HARD-GATE on all outbound actions", sentinel: true },
];

// §7 — ACU action economy. Consumption units per action (what the tenant spends).
// Prices (ACU→£) honour the OWNER PRICING LAW: margin ≥ 100% (price ≥ 2× provider
// cost) — this overrides the spec's 66% figure (recorded in coverage §Gaps).
export const ACU_PRICING: { action: string; acu: number }[] = [
  { action: "URL crawl + parse", acu: 0.1 },
  { action: "Keyword rank check (1 kw × 1 engine × 1 locale)", acu: 0.2 },
  { action: "AI prompt test (1 prompt × 1 engine)", acu: 1.5 },
  { action: "Backlink profile refresh (per domain)", acu: 4.0 },
  { action: "Link opportunity scoring (per candidate)", acu: 0.5 },
  { action: "Outreach draft + send", acu: 2.0 },
  { action: "Content brief generation", acu: 8.0 },
  { action: "Full draft generation", acu: 25.0 },
  { action: "Technical site audit (full)", acu: 40.0 },
  { action: "Competitor full teardown", acu: 60.0 },
];

export const OMNIRANK_TIERS = [
  { tier: "SCOUT", acu: "5k ACU/mo", note: "Entry reconnaissance." },
  { tier: "RAIDER", acu: "25k ACU/mo", note: "Active offence." },
  { tier: "WARLORD", acu: "100k ACU/mo", note: "Full swarm cadence." },
  { tier: "DOMINION", acu: "Unlimited", note: "Dedicated swarm instance + white-glove review desk." },
];

export const DOMINION_VITALS = [
  { key: "dominionScore", label: "Dominion Score", desc: "Composite of organic share, feature ownership, answer share, authority velocity, defence integrity (0–100)." },
  { key: "shareOfAnswer", label: "Share of Answer", desc: "% of category prompts citing the client, per AI engine, trended." },
  { key: "authorityVelocity", label: "Authority Velocity", desc: "Referring-domain growth vs competitor mean, indexed." },
  { key: "surfaceMap", label: "Surface Map", desc: "Keyword × SERP feature heatmap — owned / contested / lost." },
  { key: "threatBoard", label: "Threat Board", desc: "Volatility, decay, negative-SEO, competitor strikes." },
];

export const OMNIRANK_ROLLOUT = [
  { phase: "P1 · Substrate", days: "0–21", deliver: "MW-14, MW-18 · A24–A27, A40 — crawl mesh, entity graph, rank matrix, technical baseline." },
  { phase: "P2 · Answer Layer", days: "22–45", deliver: "MW-16, MW-20 · A33–A36, A42 — prompt universe live; first AI citations captured." },
  { phase: "P3 · Authority", days: "46–70", deliver: "MW-15, MW-17 · A28–A32, A37–A39 — reclamation + asset forge + outreach live." },
  { phase: "P4 · Offence & Shield", days: "71–90", deliver: "MW-19, MW-21, MW-22 · A41, A43–A45 — full swarm, Sentinel gate, defence board." },
];

export const OMNIRANK_SUCCESS = [
  { metric: "Non-brand organic sessions", target: "+180%" },
  { metric: "Top-3 keyword count", target: "+250%" },
  { metric: "SERP features owned", target: "≥ 40% of target set" },
  { metric: "Share of Answer (commercial)", target: "≥ 60%" },
  { metric: "Referring-domain velocity vs competitor mean", target: "3.0×" },
  { metric: "Core Web Vitals — URLs passing", target: "≥ 95%" },
  { metric: "Content decay caught pre-drop", target: "≥ 90%" },
  { metric: "Sentinel violations reaching execution", target: "0" },
];

const clamp = (n: unknown) => Math.max(0, Math.min(100, typeof n === "number" && Number.isFinite(n) ? n : 0));

// §5 — Opportunity Score = (Volume × Intent × Feature) × Winnability ÷ Effort.
// Bounded, transparent form: geometric mean of the value drivers, discounted by
// effort. A priority signal, never a ranking promise.
export function omnirankOpportunity(inp: { volume?: number; intent?: number; feature?: number; winnability?: number; effort?: number }): { score: number } {
  const v = clamp(inp.volume) / 100, i = clamp(inp.intent) / 100, f = clamp(inp.feature) / 100, w = clamp(inp.winnability) / 100;
  const effort = clamp(inp.effort) / 100;
  const valueGeo = Math.pow(Math.max(0.0001, v * i * f * w), 0.25); // 0–1
  const score = Math.round(100 * valueGeo * (1 - 0.5 * effort));
  return { score: Math.max(0, Math.min(100, score)) };
}

// §9 — Dominion Score: transparent mean of the five vitals (0–100 each; unmeasured
// → 0 so gaps are honest). Real figures fill when data sources connect.
export function dominionScore(inp: { organicShare?: number; featureOwnership?: number; answerShare?: number; authorityVelocity?: number; defenceIntegrity?: number }): { score: number; parts: { label: string; value: number }[] } {
  const parts = [
    { label: "Organic share", value: clamp(inp.organicShare) },
    { label: "Feature ownership", value: clamp(inp.featureOwnership) },
    { label: "Answer share", value: clamp(inp.answerShare) },
    { label: "Authority velocity", value: clamp(inp.authorityVelocity) },
    { label: "Defence integrity", value: clamp(inp.defenceIntegrity) },
  ];
  return { score: Math.round(parts.reduce((a, b) => a + b.value, 0) / parts.length), parts };
}
