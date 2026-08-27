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

  { id: "profit-guard-economics", name: "ProfitGuard AI — unit economics", category: "Economics & Governance", blurb: "The financial governor above every SHARE2EARN campaign. Revenue → costs → protected margin → growth pool, with the Safe Reward Ceiling, the Commission Waterfall, a kill switch on CPA/ROAS/refunds/fraud, and a refusal to call attributed revenue \"incremental\" without a holdout.", actions: ["economics", "waterfall", "health", "classify"], dashboard: "/dashboard/partner-network" },
  { id: "payout-approvals", name: "Payout Approvals", category: "Economics & Governance", blurb: "The brand's side: what it owes each creator, and the only two things it may do about it — dispute a specific earning with a reason from a fixed list, or release one early. A settled, undisputed commission cannot be withheld, and the refusal is a code path that says why.", actions: ["liability", "queue", "dispute", "release-early"], dashboard: "/dashboard/partner-network" },
  { id: "payout-identity", name: "Payout Identity & Reporting", category: "Economics & Governance", blurb: "The identity a platform must hold before it pays anyone for services — collected once, encrypted per account, and reported annually under the OECD/DAC7 rules with the creator receiving a copy. A hard gate: no verified identity, no payout, and only 'verified' passes so an unknown state fails closed.", actions: ["identity", "verify-identity", "screen-identity", "tax-report"], dashboard: "/dashboard/partner-network" },
  { id: "payout-execute", name: "Payout Execution", category: "Economics & Governance", blurb: "Sending the money: Stripe, PayPal, Wise and BitriPay mobile money behind one door. Claimed before the provider is called so a retry can never pay twice, released on failure so no balance is locked, and never reported as sent without a provider reference.", actions: ["withdraw", "payout-history"], dashboard: "/dashboard/partner-network" },
  { id: "payout-fees", name: "Creator Payouts", category: "Economics & Governance", blurb: "Withdraw anywhere — bank, card, PayPal, Wise, or M-Pesa/Orange/Airtel/Africell mobile money. Nothing is withheld because a creator is not an employee; the rail's processing fee is passed through at cost with a 3% admin fee on top of it, itemised before you confirm, and a withdrawal whose fees would take a quarter of the money is refused.", actions: ["withdraw-quote", "tax"], dashboard: "/dashboard/partner-network" },
  { id: "share2earn", name: "SHARE2EARN", category: "Acquisition & Campaigns", blurb: "Anyone can earn from their own audience — no follower gate. Pays only for what the platform counts itself (clicks, leads, signups, sales, posts that stay up), every bounty funded before the mission publishes, and a Creator Score that measures results rather than reach.", actions: ["mission", "quote", "outlook", "squad", "trust", "score"], dashboard: "/dashboard/partner-network" },

  // ── Reputation & Local ────────────────────────────────────────────────────
  { id: "review-requests", name: "Review Requests", category: "Local & Marketplace", blurb: "Ask real customers for real reviews across nine platforms — eligibility from your own vault, correct review links, paced sending, and no review gating.", actions: ["plan", "draft", "send", "record"], dashboard: "/dashboard/reputation" },
  { id: "local-outreach", name: "Flyers & Local Groups", category: "Local & Marketplace", blurb: "Print-ready flyers specified in millimetres with bleed and a scannable QR, plus community-group posts with each group's real rules beside them.", actions: ["flyer", "group-post", "followers"], dashboard: "/dashboard/local" },
  { id: "acquisition", name: "Acquisition Run", category: "Acquisition & Campaigns", blurb: "How many people were actually asked: named prospects, the message each was sent, what came back, and one counted sentence saying where the process is stuck.", actions: ["prospect", "attempt", "stage"], dashboard: "/dashboard/acquisition" },
  { id: "sentinel", name: "Sentinel Anti-Intrusion", category: "Economics & Governance", blurb: "The human gate over every route, the instruction firewall that keeps third-party text from becoming an instruction, and counted detections with the evidence attached — no threat score.", actions: ["scan", "report", "brief"], dashboard: "/dashboard/sentinel" },
  { id: "contact-hunter", name: "Contact Hunter", category: "Acquisition & Campaigns", blurb: "Public B2B contact discovery that says how it knows. An inferred address is never shown as a confirmed one and cannot be activated until something verifies it; a valid phone format is never called verification; conflicting employment evidence goes to a person rather than being averaged; objections are hashed, platform-wide and permanent; and no score clears a legal block.", actions: ["pattern", "candidate", "employment", "phone", "verify-email", "compliance", "score", "gate", "evidence-check", "objection", "suppressed", "policy", "set-policy", "outcome", "sources"], dashboard: "/dashboard/contact-hunter" },
  { id: "contact-finder", name: "Contact Finder", category: "Acquisition & Campaigns", blurb: "Upload a list, get it filled in. Detects what each row is, maps somebody else's column headings in six languages, refuses to choose between two people with the same name, never overwrites a column the user supplied, and charges for what completed rather than what was attempted — a resumed job never charges twice.", actions: ["detect", "map", "inspect", "dedupe", "resolve", "merge", "estimate", "workbook", "job", "charge", "state", "progress"], dashboard: "/dashboard/contact-hunter" },
  { id: "market-exit", name: "Market Exit Capture", category: "Market Intelligence", blurb: "When a business closes, the demand it served does not. Verified exits become expiring opportunities for active businesses — but only on an official record or two genuinely independent sources, never a member of the public, and displaced demand is counted or it is null.", actions: ["observe", "assess", "opportunity", "match", "campaign", "allocate", "screen", "advance", "dispute", "resolve", "records"], dashboard: "/dashboard/market-exit" },
];

export const ENGINE_CATEGORIES: EngineCategory[] = [
  "Economics & Governance",
  "Acquisition & Campaigns",
  "Market Intelligence",
  "Local & Marketplace",
  "Engagement & Retention",
  "Content & Reporting",
  "Video Intelligence",
  // "Autonomy & Orchestration" was declared as a category, three engines were
  // filed under it, and it was missing from this list — so `enginesByCategory`
  // silently dropped Agent Chains, Brand Memory and Growth Hubs from the command
  // index. Shipped engines with no way to find them. Same defect as every other
  // one in this repository: a value defined on one side of a boundary and never
  // carried across.
  "Autonomy & Orchestration",
];

export function enginesByCategory(): Record<EngineCategory, EngineEntry[]> {
  const out = {} as Record<EngineCategory, EngineEntry[]>;
  for (const c of ENGINE_CATEGORIES) out[c] = ENGINE_REGISTRY.filter((e) => e.category === c);
  return out;
}
