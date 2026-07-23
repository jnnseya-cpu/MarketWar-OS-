// Creator / influencer recruitment strategy — client-safe pure data.
//
// The owner's 2026 creator-led growth doctrine (JNN Groupe portfolio): do NOT
// chase general lifestyle influencers or vanity followers. Target trusted niche
// educators, operators, reviewers and problem-solvers, on performance-based,
// long-term, authority-driven partnerships. This module encodes that strategy so
// the Growth & Influencers surface renders it — and the application form routes
// creators to the product + tier they fit.

export type CreatorTier = {
  key: "micro" | "authority" | "local_viral";
  label: string;
  audience: string;
  bestFor: string;
};

// The three-tier programme structure.
export const CREATOR_TIERS: CreatorTier[] = [
  { key: "micro", label: "Micro creators", audience: "5k–50k subscribers", bestFor: "Trust and low cost — recruit many, let performance decide (best for consumer products)." },
  { key: "authority", label: "Authority creators", audience: "Smaller but serious, professional audiences", bestFor: "B2B, legal, health, fintech and government products — fewer creators, higher-quality partnerships." },
  { key: "local_viral", label: "Local viral creators", audience: "Food, sports, lifestyle and event creators", bestFor: "Instant local demand — best for food delivery, ticketing and travel." },
];

// ---------------------------------------------------------------------------
// Commission model (owner ruling) — precise, implemented in code below.
// ---------------------------------------------------------------------------
// • A creator can subscribe to between 1 and 100 programmes (one per product/
//   brand campaign they want to promote), and gets a unique code/link PER
//   subscribed programme.
// • Payout gate: a creator is only PAID once they have at least 10,000 followers
//   totalled across all their social platforms + YouTube. Below that they can
//   still promote and accrue, but nothing is paid out.
// • Per referred user: the creator earns 0.75% of that user's verified revenue
//   and the platform takes 0.25% (1% total) — UNTIL the creator has earned
//   £20,000 from that user. After that the split flips: the platform takes the
//   full 1% for the next £20,000, then commission on that user stops.
export const MIN_PAYOUT_FOLLOWERS = 10_000;
export const MIN_PROGRAMMES = 1;
export const MAX_PROGRAMMES = 100;
// Sub-10K referral programme: partners below the gate earn ACUs per referral
// (usable to create a brand + advertise), and AUTO-SWITCH to the main cash
// programme once they reach 10K verified followers.
export const SUB10K_ACU_PER_REFERRAL = 250;

export type ProgrammeAssignment = "main" | "acu_referral";
// Which programme a partner belongs to right now. Main (cash 0.75%) when the
// 10K gate is met, an admin admitted them, or they've proven 5+ conversions;
// otherwise the ACU referral programme.
export function programmeFor(input: { followers: number; verified: boolean; adminOverride?: boolean; provenConversions?: boolean }): ProgrammeAssignment {
  const gate = input.followers >= MIN_PAYOUT_FOLLOWERS && input.verified;
  return gate || input.adminOverride || input.provenConversions ? "main" : "acu_referral";
}
export const RATE_TOTAL = 0.01;        // 1% total
export const RATE_CREATOR = 0.0075;    // 0.75% to the creator
export const RATE_PLATFORM = 0.0025;   // 0.25% to the platform
export const EARNINGS_CAP_GBP = 20_000; // the £20k cycle threshold

export const COMMISSION_MODEL: string[] = [
  "Subscribe to as many programmes as you can — from 1 up to 100 — and get a unique tracked link + coupon code for each one.",
  `You're paid only once you have at least ${MIN_PAYOUT_FOLLOWERS.toLocaleString()} followers totalled across all your social platforms and YouTube. Below that you can still promote and accrue — payout unlocks when you cross the threshold.`,
  "Per referred user you earn 0.75% of their eligible net revenue; the platform takes 0.25% (1% total). The 1% is charged to the promoted brand as their acquisition cost — never to you or the customer. Attribution is transparent — you see exactly which code/link drove which conversion.",
  `Once a single referred user has earned you £${EARNINGS_CAP_GBP.toLocaleString()}, the split flips: the platform takes the full 1% for the next £${EARNINGS_CAP_GBP.toLocaleString()}, then commission on that user stops.`,
  "Paid on VERIFIED revenue only — no payment for empty reach. Every payout is fraud-scored, every endorsement carries AI-content disclosure, and we never clone a creator without consent.",
  "Payouts settle via BitriPay mobile money in Africa (M-Pesa / Orange / Airtel / Africell) and via Stripe everywhere else. Follower counts are verified by an AI agent reading your public profile, or by a human reviewer.",
];

// The £20K cap rule (spec §14), computed PER REFERRED CUSTOMER on Eligible Net
// Revenue, as a 3-state machine that COMPLETES permanently:
//   • State 1 PARTNER_EARNING: partner 0.75%, platform 0.25% — until the partner
//     has earned £20,000 from THIS customer.
//   • State 2 MARKETWAR_EARNING: partner 0%, platform full 1% — until the
//     platform has collected an additional £20,000 from this customer.
//   • State 3 COMPLETED: referral obligation for this customer ends permanently.
export const MARKETWAR_POST_CAP_GBP = 20_000;
export type ReferralState = "PARTNER_EARNING" | "MARKETWAR_EARNING" | "COMPLETED";
export type CustomerSplit = {
  creatorGbp: number; platformGbp: number; state: ReferralState;
  cap: number; creatorProgressPct: number; note: string;
};

// Per-customer split given that customer's cumulative Eligible Net Revenue.
export function computeCreatorSplit(customerNetRevenueGbp: number): CustomerSplit {
  const rev = Math.max(0, customerNetRevenueGbp || 0);
  const r1 = EARNINGS_CAP_GBP / RATE_CREATOR;          // net revenue for partner to earn £20k @0.75%
  const r2 = MARKETWAR_POST_CAP_GBP / RATE_TOTAL;      // net revenue for platform to collect £20k @1.0%
  const p1 = Math.min(rev, r1);
  let creator = p1 * RATE_CREATOR;
  let platform = p1 * RATE_PLATFORM;
  let state: ReferralState = "PARTNER_EARNING";
  let creatorEarned = creator;
  if (rev > r1) {
    state = "MARKETWAR_EARNING";
    creatorEarned = EARNINGS_CAP_GBP;
    const p2 = Math.min(rev - r1, r2);
    platform += p2 * RATE_TOTAL;                       // partner earns nothing in state 2
    if (rev - r1 >= r2) state = "COMPLETED";
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    creatorGbp: round(creator), platformGbp: round(platform), state, cap: EARNINGS_CAP_GBP,
    creatorProgressPct: Math.round((Math.min(creatorEarned, EARNINGS_CAP_GBP) / EARNINGS_CAP_GBP) * 100),
    note: state === "PARTNER_EARNING"
      ? `Partner earning — 0.75% to you, 0.25% to the platform. £${round(creatorEarned).toLocaleString()} of £${EARNINGS_CAP_GBP.toLocaleString()} from this customer.`
      : state === "MARKETWAR_EARNING"
        ? `Cap reached — the platform collects the full 1% until it matches £${MARKETWAR_POST_CAP_GBP.toLocaleString()} from this customer.`
        : "Completed — the referral obligation for this customer has ended.",
  };
}

// The four earning tiers (2) — with unlock conditions. Everyone starts a
// Promoter; performance in one tier is the passport to the next.
export type EarningTier = { key: "promoter" | "creator" | "affiliate" | "agency"; label: string; model: string; forWhom: string; unlock: string };
export const EARNING_TIERS: EarningTier[] = [
  { key: "promoter", label: "Promoter", model: "Referral commission", forWhom: "Anyone with an audience — share your link, earn on referrals that convert.", unlock: "Open at launch" },
  { key: "creator", label: "Creator", model: "Per-campaign + performance", forWhom: "Content makers briefed, approved and paid on milestones.", unlock: "Application + Scout scoring" },
  { key: "affiliate", label: "Affiliate Partner", model: "Recurring revenue share", forWhom: "Volume drivers with tracked links, coupon codes and a dashboard.", unlock: "Proven Promoter performance" },
  { key: "agency", label: "Agency Partner", model: "Margin by client", forWhom: "Agencies onboarding clients under a white-label workspace.", unlock: "Vetted commercial agreement" },
];

// How the creator programme works, end to end.
export const PROGRAMME_STEPS: string[] = [
  "Apply and get scored — audience fit, engagement quality and brand safety (micro & local creators welcome).",
  "Get matched to a product and receive a clear brief: talking points, prohibited claims, mandatory disclosure.",
  "Create — with mandatory AI-content disclosure and rights records kept on file.",
  "Track performance with your unique link + coupon code; get paid on verified milestones.",
  "Reuse the winning content (with rights) across the product's campaigns.",
];

export type PortfolioProduct = {
  key: string;
  name: string;
  category: string;          // short bucket for grouping
  targetProfiles: string[];  // the creator profiles that fit
  why: string;               // why they fit
  suggestedTier: CreatorTier["key"];
  priority?: number;         // 1 = recruit first (owner's ranking); undefined = standard
};

// The portfolio → best-fit creator mapping (owner's targeting table).
export const PORTFOLIO: PortfolioProduct[] = [
  { key: "studyear", name: "StudYear", category: "Education", priority: 1, suggestedTier: "micro",
    targetProfiles: ["Parent education creators", "GCSE/A-Level revision channels", "Teacher YouTubers", "Study productivity creators", "SEN/learning-support creators"],
    why: "Parents trust educators; students trust revision creators. Best angle: “AI study support that starts free.”" },
  { key: "tunakula", name: "Tunakula CD", category: "Food delivery", priority: 2, suggestedTier: "local_viral",
    targetProfiles: ["Kinshasa food vloggers", "Restaurant reviewers", "Street-food creators", "Congolese lifestyle creators", "Student/campus creators"],
    why: "Food delivery grows through appetite, convenience and local trust." },
  { key: "axionos", name: "AxionOS / Tradesman OS", category: "Trades", priority: 3, suggestedTier: "micro",
    targetProfiles: ["UK tradesmen YouTubers", "Home-renovation channels", "Construction business coaches", "Property-maintenance creators", "Homeowner DIY channels"],
    why: "Tradesmen trust other tradesmen; homeowners trust renovation educators." },
  { key: "travel", name: "3JN Travel OS", category: "Travel", priority: 4, suggestedTier: "micro",
    targetProfiles: ["Travel vloggers", "Visa-advice channels", "Airport/flight-deal creators", "African diaspora travel creators", "Family-holiday creators"],
    why: "Travel buyers need trust, proof and step-by-step guidance." },
  { key: "veryx", name: "Veryx", category: "Enterprise B2B", priority: 5, suggestedTier: "authority",
    targetProfiles: ["Project management", "Construction management / PMO", "Engineering leadership", "Digital transformation", "Enterprise SaaS reviewers"],
    why: "Buyers are senior professionals — you need authority creators, not entertainers." },
  { key: "payments", name: "BitriPay / RakaPay / ParkSmart", category: "Fintech", suggestedTier: "authority",
    targetProfiles: ["Fintech creators", "Mobile-money explainers", "African tech channels", "Urban-mobility creators", "Taxi/moto business creators"],
    why: "Trust is critical — payments and collections need legitimacy." },
  { key: "ticketroyality", name: "TicketRoyality", category: "Events & ticketing", suggestedTier: "local_viral",
    targetProfiles: ["Football channels", "DRC sports commentators", "Event promoters", "Nightlife/event vloggers", "Music-culture creators"],
    why: "Ticketing needs hype + fraud-trust messaging; sports and events creators convert fast." },
  { key: "legai", name: "LegAI", category: "Legal", suggestedTier: "authority",
    targetProfiles: ["Legal-education creators", "Small-business advice channels", "Immigration/legal explainer channels", "Consumer-rights creators"],
    why: "Needs credibility and careful positioning: “support and document guidance, not solicitor replacement.”" },
  { key: "health360", name: "Health360 RDC", category: "Healthcare", suggestedTier: "authority",
    targetProfiles: ["Doctors on YouTube", "Public-health educators", "Hospital-admin / health-policy creators", "African health-tech creators"],
    why: "Healthcare requires trusted professionals and institutional credibility." },
  { key: "gov360", name: "GOV360 / CIVIX-INTEL", category: "Governance", suggestedTier: "authority",
    targetProfiles: ["Governance & civic-tech creators", "Anti-corruption channels", "Public-administration creators", "African policy & security analysts"],
    why: "Best for credibility with institutions, NGOs and government stakeholders." },
  { key: "energy", name: "C-RECYCLE / Waste-to-Energy / Solar-Hydro", category: "Sustainability", suggestedTier: "authority",
    targetProfiles: ["Sustainability creators", "Climate-tech channels", "African infrastructure creators", "Mining/energy analysts", "ESG creators"],
    why: "Investors and governments need evidence, impact and economic logic." },
  { key: "snellink", name: "SNEL LINK", category: "Utilities", suggestedTier: "micro",
    targetProfiles: ["Consumer-finance creators", "Utility-payment explainers", "DRC tech creators", "Electricity-access & household-savings creators"],
    why: "Message: easier payment, transparency, fewer queues, better customer control." },
  { key: "opennjob", name: "Openn Job Global", category: "Jobs & careers", suggestedTier: "micro",
    targetProfiles: ["Career coaches", "CV/interview YouTubers", "Graduate-job creators", "HR/recruitment creators", "Diaspora-employment creators"],
    why: "Jobseekers trust career creators; employers trust HR/business creators." },
  { key: "vibr", name: "VIBR", category: "AI & culture", suggestedTier: "micro",
    targetProfiles: ["AI-tools creators", "Social-media growth creators", "Digital-identity / privacy creators", "Gen-Z culture creators"],
    why: "Needs creator-led adoption and viral explanation." },
  { key: "buzzpro", name: "Buzz Pro", category: "SME marketing", suggestedTier: "micro",
    targetProfiles: ["Business-growth creators", "SME marketing creators", "Facebook-ads creators", "Content-creation creators", "Congolese entrepreneurship creators"],
    why: "These creators already speak to SMEs needing clients." },
];

// Owner's priority order — recruit these first.
export const PRIORITY_ORDER = PORTFOLIO
  .filter((p) => p.priority)
  .sort((a, b) => (a.priority! - b.priority!));

export const STRATEGY_NOTE =
  "Do not target general lifestyle influencers first. In 2026, creator-led growth works best through micro/niche creators, performance-based deals, long-term partnerships and authority-driven content — trusted niche educators, operators, reviewers and problem-solvers, not vanity followers.";
