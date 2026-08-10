// MarketWar OS — Unified Engine Registry (client-safe, pure data).
//
// The single source of truth that ties every backend intelligence engine into
// ONE navigable platform. Each entry maps a shipped engine to its live API so
// the whole OS is discoverable and demonstrable from one surface — the
// "AI Engines" command index. This file imports NOTHING from the backend layer
// (it is pure data) so it is safe in the client bundle.
//
// Every engine listed here is deterministic + demo-safe: its GET endpoint
// returns a doctrine + a fully-populated demo with zero config.

export type EngineCategory =
  | "Economics & Governance"
  | "Acquisition & Campaigns"
  | "Market Intelligence"
  | "Local & Marketplace"
  | "Engagement & Retention"
  | "Content & Reporting"
  | "Video Intelligence"
  | "Autonomy & Orchestration";

export type EngineEntry = {
  id: string;        // maps to /api/<id>
  name: string;
  category: EngineCategory;
  blurb: string;     // one-line value proposition
  actions: string[]; // POST actions the engine exposes
  dashboard?: string; // optional existing dashboard route
};

export const ENGINE_REGISTRY: EngineEntry[] = [
  // ── Economics & Governance ────────────────────────────────────────────────
  { id: "modelgate", name: "ModelGate™ AI Gateway", category: "Economics & Governance", blurb: "Provider-neutral routing: model registry, classify, routing score, circuit breaker, ACU reserve/reconcile.", actions: ["classify", "route", "reserve", "reconcile", "compare", "circuit"] },
  { id: "subscription", name: "Subscription & Commercial", category: "Economics & Governance", blurb: "8 plans, 20% ACU allocation, 4× markup = 75% gross margin, top-ups, upgrade triggers.", actions: ["quote-acus", "plan", "upgrade", "contribution"], dashboard: "/dashboard/billing" },
  { id: "admin-billing", name: "Admin Billing", category: "Economics & Governance", blurb: "Change a user's plan, time-limited offers, discount codes (governed), 3-in-12 payment waivers.", actions: ["change-plan", "offer", "discount-code", "apply-code", "waive"] },
  { id: "comms-events", name: "Communication Events", category: "Economics & Governance", blurb: "One event catalogue fans out across email/in-app/SMS/push/WhatsApp; mandatory notices bypass opt-outs.", actions: ["fanout", "preview", "test"], dashboard: "/dashboard/comms" },
  { id: "acu", name: "ACU Economics", category: "Economics & Governance", blurb: "Utility-company pricing — 4× markup (300%/75% margin), 2× floor, cost never exposed.", actions: ["quote", "preflight", "profit", "arbitrate"] },
  { id: "admin-economics", name: "Owner Economics", category: "Economics & Governance", blurb: "Gross-margin dashboard, cost-leakage alerts, ACU recycling, export charges.", actions: ["dashboard", "recycling"] },
  { id: "profit-guard", name: "ProfitGuard", category: "Economics & Governance", blurb: "9-check pre-scale gate — never scales a low-margin or out-of-stock product.", actions: ["check"] },
  { id: "compliance", name: "Claims & Compliance", category: "Economics & Governance", blurb: "Claim classification + C2PA provenance; unsubstantiated claims never publish.", actions: ["verify", "review", "provenance"] },
  { id: "rights-guard", name: "RightsGuard", category: "Economics & Governance", blurb: "Content rights & consent matrix — blocks publishing on any missing right.", actions: ["check"] },
  { id: "lead-harvest", name: "Lead Harvest", category: "Economics & Governance", blurb: "Compliant B2B contact intelligence — 12-check verify + GDPR/PECR/CAN-SPAM gate.", actions: ["classify", "verify", "compliance", "gate"] },

  // ── Acquisition & Campaigns ───────────────────────────────────────────────
  { id: "campaign-architect", name: "Campaign Architect", category: "Acquisition & Campaigns", blurb: "5-layer funnel + Trend Hijack gate + autonomy levels (high-risk capped).", actions: ["architecture", "trend", "autonomy"] },
  { id: "creative-optimizer", name: "Creative Optimizer", category: "Acquisition & Campaigns", blurb: "19-variable test matrix, 8-step loop, 6 performance distinctions.", actions: ["matrix", "classify", "optimise"] },
  { id: "buyer-psychology", name: "BuyerMind", category: "Acquisition & Campaigns", blurb: "15 purchase drivers → a clip brief for a specific psychological objective.", actions: ["detect", "brief"] },
  { id: "offer-forge", name: "OfferForge", category: "Acquisition & Campaigns", blurb: "11 offer archetypes from real price/cost/stock — never sells below cost.", actions: ["forge", "ladder"] },
  { id: "visualstrike", name: "VisualStrike AI", category: "Acquisition & Campaigns", blurb: "Product image → viral campaign: identity lock, 15-dim score, 27 angles.", actions: ["lock", "angles", "score", "pack", "hooks", "guard"], dashboard: "/dashboard/product-engine" },

  // ── Market Intelligence ───────────────────────────────────────────────────
  { id: "market-listening", name: "Market Listening", category: "Market Intelligence", blurb: "Sentiment, share-of-voice, topic velocity, influencers + lead cards.", actions: ["analyse", "leads"] },
  { id: "opportunity-radar", name: "Opportunity Radar", category: "Market Intelligence", blurb: "Transparent Demand×Intent×Relevance×Timing×Authority×Conversion ÷ Competition.", actions: ["score", "rank"] },
  { id: "intent-radar", name: "Buying Intent Radar", category: "Market Intelligence", blurb: "Score target-company buying intent across 10 signal types + why-now.", actions: ["score", "radar"] },
  { id: "competitor-warroom", name: "Competitor War Room", category: "Market Intelligence", blurb: "Signal board, weakness scanner, exploitation playbook, sales battlecard.", actions: ["monitor", "scan", "exploit", "battlecard"] },
  { id: "ai-accuracy", name: "AI Answer Accuracy", category: "Market Intelligence", blurb: "Audit AI answers vs ground truth + causal-safeguarded lift.", actions: ["check", "causal"] },
  { id: "seo", name: "Classic SEO", category: "Market Intelligence", blurb: "Keyword research, SERP tracking, backlink profile, on-page audit.", actions: ["keywords", "serp", "backlinks", "audit"] },
  { id: "programmatic-seo", name: "Programmatic SEO", category: "Market Intelligence", blurb: "Hundreds of unique page specs with duplicate-content variation control.", actions: ["page", "batch"] },
  { id: "siteraid", name: "SiteRaid AI", category: "Market Intelligence", blurb: "Website → Business DNA + Truth Layer + Instant Audit + Attack Map.", actions: ["authorise", "dna", "truth", "audit", "attack"], dashboard: "/dashboard/website-intel" },

  // ── Local & Marketplace ───────────────────────────────────────────────────
  { id: "local-marketplace", name: "Local Marketplace", category: "Local & Marketplace", blurb: "Discovery + Request-a-Quote matching + booking with no-show protection.", actions: ["discover", "quote", "book"] },
  { id: "concierge", name: "AI Local Concierge", category: "Local & Marketplace", blurb: "Natural-language → best local matches with price/availability + CTA.", actions: ["ask"] },
  { id: "localisation", name: "Global Localisation", category: "Local & Marketplace", blurb: "Transcreation across 17 axes, fixed-FX currency, religion/legal flags.", actions: ["localise"] },

  // ── Engagement & Retention ────────────────────────────────────────────────
  { id: "engagement", name: "Customer Engagement", category: "Engagement & Retention", blurb: "CDP, AI segmentation, 12 automations, 14-metric analytics, consent gate.", actions: ["segment", "analytics", "suggest-reply", "eligible", "automations"] },
  { id: "inbox", name: "Unified Inbox + CRM", category: "Engagement & Retention", blurb: "9-channel SLA-prioritised inbox + 10-stage pipeline with weighted forecast.", actions: ["inbox", "pipeline"] },
  { id: "loyalty", name: "Loyalty & Referral", category: "Engagement & Retention", blurb: "Tiered points, referral codes, k-factor projections, wallet passes.", actions: ["tier", "earn", "referral", "kfactor"] },
  { id: "creator-intel", name: "Creator Intelligence", category: "Engagement & Retention", blurb: "11 discovery signals, micro-first scoring/shortlist + campaign brief.", actions: ["score", "shortlist", "brief"] },
  { id: "crisis-command", name: "Crisis Command", category: "Engagement & Retention", blurb: "10-factor Crisis Severity Score + 4-level escalation ladder.", actions: ["severity", "early-warning"] },
  { id: "customer-voice", name: "Customer Voice", category: "Engagement & Retention", blurb: "Cluster 12 input types → pains + Product Backlog Bridge.", actions: ["analyse", "backlog"] },

  // ── Content & Reporting ───────────────────────────────────────────────────
  { id: "content-engine", name: "Content Factory", category: "Content & Reporting", blurb: "26+ output types, evidence-first claim classification blocks fabricated stats.", actions: ["brief", "classify", "assemble"] },
  { id: "onboarding", name: "Autonomous Onboarding", category: "Content & Reporting", blurb: "Business → brand voice, personas, keyword/prompt universes, 90-day plan.", actions: ["onboard"] },
  { id: "reporting", name: "White-label Reporting", category: "Content & Reporting", blurb: "7-section agency reports, white-label branding, ACU-costed exports.", actions: ["build", "export"] },
  { id: "attribution", name: "Revenue Attribution", category: "Content & Reporting", blurb: "Viral-to-revenue funnel + U-shaped channel attribution + content ROI.", actions: ["funnel", "channels", "roi"] },
  { id: "youtube", name: "YouTube Intelligence", category: "Content & Reporting", blurb: "Topic research, viral title analysis, comment pain-mining, shorts scripts.", actions: ["keywords", "titles", "comments", "script"] },

  // ── Video Intelligence ────────────────────────────────────────────────────
  { id: "video-intelligence", name: "VideoDominance AI", category: "Video Intelligence", blurb: "Genre detection, moment ranking, 8 separate clip scores, NL find-moments.", actions: ["genre", "rank", "score", "find"], dashboard: "/dashboard/video" },

  // ── Autonomy & Orchestration ──────────────────────────────────────────────
  { id: "orchestrator", name: "Agent Chains", category: "Autonomy & Orchestration", blurb: "Several agents on one job, in order, each handed what the earlier ones produced. Drafts run; anything that would spend, send or publish queues for approval. Unattended spend capped per brand per day.", actions: ["run", "save", "delete", "schedule"], dashboard: "/dashboard/chains" },
  { id: "brand-memory", name: "Brand Memory", category: "Autonomy & Orchestration", blurb: "The shared context agents read from. Every fact records where it came from, and a model's inference is never promoted to a measurement.", actions: ["remember", "sync"] },
  { id: "genz", name: "Growth Hubs & Missions", category: "Autonomy & Orchestration", blurb: "Create/Grow/Earn/Play/Connect/Build over the whole OS, plus daily challenges and money missions completed from work the platform recorded — never self-declared.", actions: ["play"], dashboard: "/dashboard/hubs" },

  // ── Creative production & ad intelligence ─────────────────────────────────
  { id: "ad-canvas", name: "Ad Canvas", category: "Content & Reporting", blurb: "A generated ad as a document rather than a picture — retype the headline, move the logo, re-lay-out for nine placements. Contrast is the WCAG ratio and the safe areas are the platforms' own. Editing calls no provider and costs nothing.", actions: ["build", "edit", "fix", "refit", "export"], dashboard: "/dashboard/studio" },
  { id: "ad-styles", name: "Ad Formats", category: "Video Intelligence", blurb: "Twelve filmable short-form formats — UGC, street interview, podcast clip, founder-to-camera — each with a timed shot list, what it needs on the day, and how it fails. No format is ranked, because nobody outside the advertiser knows what one returned.", actions: ["brief"], dashboard: "/dashboard/video" },
  { id: "avatar-gateway", name: "Presenter Video", category: "Video Intelligence", blurb: "A synthetic face and voice reading your script, behind one door. Restricted categories refused first, a scoped and revocable likeness consent required for anyone real, the wallet last — and a provider failure refunds itself.", actions: ["consent", "revoke", "check", "render"], dashboard: "/dashboard/video" },
  { id: "ad-intel", name: "Ad Intelligence", category: "Market Intelligence", blurb: "Counts what the ads in your category have in common, every figure with its denominator, and names the open ground. It will not recreate a competitor's ad and it never calls one a winner.", actions: ["analyse"], dashboard: "/dashboard/competitors" },

  { id: "share2earn", name: "SHARE2EARN", category: "Acquisition & Campaigns", blurb: "Anyone can earn from their own audience — no follower gate. Pays only for what the platform counts itself (clicks, leads, signups, sales, posts that stay up), every bounty funded before the mission publishes, and a Creator Score that measures results rather than reach.", actions: ["mission", "quote", "outlook", "squad", "trust", "score"], dashboard: "/dashboard/partner-network" },

  // ── Reputation & Local ────────────────────────────────────────────────────
  { id: "review-requests", name: "Review Requests", category: "Local & Marketplace", blurb: "Ask real customers for real reviews across nine platforms — eligibility from your own vault, correct review links, paced sending, and no review gating.", actions: ["plan", "draft", "send", "record"], dashboard: "/dashboard/reputation" },
  { id: "local-outreach", name: "Flyers & Local Groups", category: "Local & Marketplace", blurb: "Print-ready flyers specified in millimetres with bleed and a scannable QR, plus community-group posts with each group's real rules beside them.", actions: ["flyer", "group-post", "followers"], dashboard: "/dashboard/local" },
];

export const ENGINE_CATEGORIES: EngineCategory[] = [
  "Economics & Governance",
  "Acquisition & Campaigns",
  "Market Intelligence",
  "Local & Marketplace",
  "Engagement & Retention",
  "Content & Reporting",
  "Video Intelligence",

];

export function enginesByCategory(): Record<EngineCategory, EngineEntry[]> {
  const out = {} as Record<EngineCategory, EngineEntry[]>;
  for (const c of ENGINE_CATEGORIES) out[c] = ENGINE_REGISTRY.filter((e) => e.category === c);
  return out;
}
