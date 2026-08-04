// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The Gen-Z Growth Layer — six hubs over the OS that already exists.
//
// The spec's own insight is that attracting Gen Z "is not about changing the
// product — it's about changing how they discover, create, collaborate, buy and
// earn". This module takes that literally. It changes nothing underneath: it is
// a second way IN to surfaces that already ship, organised by what somebody is
// trying to do rather than by which engine does it.
//
// Sixty routes in five groups called Command / Acquisition / Conversion /
// Intelligence / Account is an operator's map. Create / Grow / Earn / Play /
// Connect / Build is a user's map, and the same sixty routes hang off it.
//
// TWO RULES THIS FILE KEEPS.
//
//  1. Every `href` below is a route that EXISTS. A hub that links to a page
//     nobody built is worse than no hub, so a test walks `src/app` and fails if
//     any entry here has no page.tsx behind it. The map cannot rot quietly.
//
//  2. `notYet` is published, not hidden. Each hub states which parts of the
//     Gen-Z spec it does NOT yet have, because a hub that lists five things and
//     silently omits the eight it lacks reads as complete when it is not.

export type HubId = "create" | "grow" | "earn" | "play" | "connect" | "build";

export type HubEntry = {
  href: string;
  label: string;
  does: string;      // what a user gets, in their words rather than the module's
  isNew?: boolean;   // shipped as part of this layer
};

export type Hub = {
  id: HubId;
  label: string;
  promise: string;
  entries: HubEntry[];
  notYet: string[];
};

export const HUBS: Hub[] = [
  {
    id: "create",
    label: "Create",
    promise: "Make the thing — video, posts, images, copy, a whole brand look — without opening another app.",
    entries: [
      { href: "/dashboard/create", label: "Make Anything", does: "One box: describe it, get it. Posts, ads, emails, scripts, pages." },
      { href: "/dashboard/video", label: "Video War Room", does: "Short-form video: script, voice, render, and the clip finder that pulls the moments worth cutting." },
      { href: "/dashboard/product-engine", label: "VisualStrike", does: "Product and brand imagery — your logo and photos composited in, never redrawn by a model." },
      { href: "/dashboard/content", label: "Content Factory", does: "A week of content in one run, per platform." },
      { href: "/dashboard/growth-engine", label: "Hashtags & posting times", does: "Tags pulled from your own post, and the hours measured from your own results." },
      { href: "/dashboard/studio", label: "Brand Studio", does: "Voice, tone and the look everything else inherits." },
      { href: "/dashboard/brand-kit", label: "Brand Launch Kit", does: "Colours, logo treatment and the assets a new brand needs on day one." },
      { href: "/dashboard/library", label: "Work Library", does: "Everything you have made, kept — so nothing you paid for disappears when you navigate away." },
    ],
    notYet: [
      "Meme generator and thumbnail creator as their own tools (the image gateway can render both; neither has a front door yet).",
      "Voice cloning — gated on a consent record we do not yet capture, and it will not ship before that record does.",
      "Emoji optimiser, music and sound-trend recommendations — these need per-platform audio-trend data nobody currently sells us honestly.",
    ],
  },
  {
    id: "grow",
    label: "Grow",
    promise: "Get found and get followed — search, AI answers, social reach and your own postcode.",
    entries: [
      { href: "/dashboard/seo-autopilot", label: "SEO Autopilot", does: "Finds the pages holding you back and fixes them on a schedule." },
      { href: "/dashboard/organic-dominance", label: "Organic Dominance", does: "The whole organic loop: listen, decide, create, publish, measure." },
      { href: "/dashboard/search-dominance", label: "Search Dominance", does: "The keywords you can actually win, and what to write for them." },
      { href: "/dashboard/ai-visibility", label: "AI Visibility", does: "Whether ChatGPT, Gemini and Perplexity mention you when somebody asks." },
      { href: "/dashboard/omnirank", label: "OMNIRANK", does: "One rank across search, AI answers, social and maps." },
      { href: "/dashboard/discover", label: "Market Intel", does: "What is moving in your market this week, from real sources." },
      { href: "/dashboard/amplify", label: "Reach Amplifier", does: "Earned virality and consent-based retargeting, capped and opt-out-able." },
      { href: "/dashboard/local", label: "Local Domination", does: "Your postcode: profile gaps, citations, flyers and local group posts." },
      { href: "/dashboard/briefing", label: "Daily Briefing", does: "What changed since yesterday, and the one thing to do about it." },
      { href: "/dashboard/chains", label: "Agent Chains", does: "Several agents on one job, in order, sharing what they know — and stopping at anything that would spend, send or publish.", isNew: true },
    ],
    notYet: [
      "Trend prediction across TikTok, Snapchat, Discord and Twitch. Trend monitoring today reads news and search — the short-form platforms need connectors we do not have, and a 'trend score' invented without them would be a number nobody measured.",
    ],
  },
  {
    id: "earn",
    label: "Earn",
    promise: "Turn the audience into money — sales, commission, referrals and what each of them actually cost.",
    entries: [
      { href: "/dashboard/money-ledger", label: "Money Ledger", does: "Real revenue events, entered or synced — the only numbers the OS will call revenue." },
      { href: "/dashboard/first-customer", label: "First Customer", does: "The shortest path from nothing to one paying customer." },
      { href: "/dashboard/revenue", label: "Revenue Intel", does: "Where the money came from and what it is likely to do next." },
      { href: "/dashboard/roi", label: "ROI Engine", does: "Spend against return, per channel, with the assumptions shown." },
      { href: "/dashboard/partner-network", label: "Partner Network", does: "Programmes, tracked links and the commission ledger behind them." },
      { href: "/dashboard/influencers", label: "Creator Recruitment", does: "Who to recruit for your niche, and what to pay them." },
      { href: "/dashboard/billing", label: "Wallet & ACUs", does: "Balance, top-ups and exactly what each action cost." },
    ],
    notYet: [
      "Community marketplace — selling your own templates, funnels and prompts to other users. Needs a seller payout path (Stripe Connect), a rights check on what is being sold, and a refund policy before a single listing goes live.",
      "Marketplace missions — a business posting 'I need 20 TikToks' and creators applying. The matching logic is buildable now; the escrow is not.",
      "Withdrawals and tax reports in the creator wallet.",
    ],
  },
  {
    id: "play",
    label: "Play",
    promise: "Daily challenges, XP, streaks and money missions — progress you can see, verified from what you actually did.",
    entries: [
      { href: "/dashboard/hubs", label: "Today's challenges", does: "Five challenges a day across marketing, sales, video, networking and brand. Completion is read from real work, never self-declared.", isNew: true },
    ],
    notYet: [
      "Leaderboards, creator seasons and limited events — these need a cross-account ranking surface, and a leaderboard is only honest once the underlying counts are audited.",
      "Mystery boxes, spin-to-win and scratch cards. A reward that costs us provider spend cannot be handed out on a random draw without breaching the pricing floor; see the funded-reward rule in missions.ts for what CAN be given away and why.",
    ],
  },
  {
    id: "connect",
    label: "Connect",
    promise: "The people — customers, replies, partners and the team you build things with.",
    entries: [
      { href: "/dashboard/inbox", label: "Inbox", does: "Every reply, in one place, with the bounces and auto-replies separated out." },
      { href: "/dashboard/whatsapp", label: "WhatsApp Centre", does: "Conversations where your customers already are." },
      { href: "/dashboard/customers", label: "Customer Vault", does: "Who they are, what they bought, and when they last heard from you." },
      { href: "/dashboard/segments", label: "Audience Segments", does: "Groups worth treating differently, scored from real behaviour." },
      { href: "/dashboard/approvals", label: "Collaboration & Approvals", does: "Share work, collect sign-off, keep a record of who approved what." },
      { href: "/dashboard/reputation", label: "Reputation & reviews", does: "Your trust score, and the engine that asks real customers for real reviews." },
    ],
    notYet: [
      "Live co-creation rooms — several people editing the same asset at once. This is a real-time infrastructure build (presence, conflict resolution, cursors), not a screen.",
      "Collaboration matching ('you and Sarah should work together') and AI networking. Both need audience data from accounts we are not connected to; without it the match would be a guess wearing a percentage.",
    ],
  },
  {
    id: "build",
    label: "Build",
    promise: "The things that outlast a post — a site, a funnel, a store, a brand, a career.",
    entries: [
      { href: "/dashboard/landing-builder", label: "Conversion Architect", does: "A page built around one conversion, not a template with your logo on it." },
      { href: "/dashboard/landing-pages", label: "Landing Pages", does: "Everything you have published, and how each one is performing." },
      { href: "/dashboard/publish", label: "Publish Centre", does: "Push it live — page, post or campaign — from one place." },
      { href: "/dashboard/website-intel", label: "SiteRaid", does: "What is broken or slow on your site, ranked by what it costs you." },
      { href: "/dashboard/integrations", label: "Integrations", does: "Connect the accounts the OS reads from and writes to." },
      { href: "/dashboard/go-live", label: "Go-Live Readiness", does: "What still has to be true before you take real money." },
    ],
    notYet: [
      "One-click store: store, checkout, coupons, upsells and affiliate links in a single action. The pieces exist separately (checkout, offers, partner links) — the single action does not.",
      "Career mode — portfolio, CV, LinkedIn optimiser, interview coach, gig finder. Genuinely new surface, and the one part of the Gen-Z spec with no existing engine behind it at all.",
      "Side-hustle generator. Buildable, but it must not print an 'expected earnings' figure for a business that does not exist yet — that is a forecast presented as a fact.",
    ],
  },
];

export const hub = (id: string): Hub | null => HUBS.find((h) => h.id === id) || null;

// Which hub a route belongs to. A route can legitimately sit in more than one
// hub (the Reputation surface is both Connect and Grow); this returns the first,
// which is the one the navigation highlights.
export function hubFor(href: string): HubId | null {
  for (const h of HUBS) if (h.entries.some((e) => e.href === href)) return h.id;
  return null;
}

// Every route referenced above, deduplicated — what the anti-rot test walks.
export function hubRoutes(): string[] {
  return Array.from(new Set(HUBS.flatMap((h) => h.entries.map((e) => e.href))));
}

// How much of the Gen-Z spec each hub actually covers, counted rather than
// claimed: shipped entries against shipped + declared gaps.
export function hubCoverage(): { id: HubId; label: string; shipped: number; gaps: number; pct: number }[] {
  return HUBS.map((h) => {
    const shipped = h.entries.length;
    const gaps = h.notYet.length;
    return { id: h.id, label: h.label, shipped, gaps, pct: Math.round((shipped / (shipped + gaps)) * 100) };
  });
}
