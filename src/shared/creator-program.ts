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

// The commission / partnership model.
export const COMMISSION_MODEL: string[] = [
  "Every creator gets a unique tracked link + coupon code — attribution is transparent, you see exactly which content drove which conversion.",
  "Pay on VERIFIED revenue only — milestones, not vibes; no payment for empty reach.",
  "Monthly leaderboards reward the top performers and keep the programme competitive.",
  "Consumer products: recruit many micro-creators and let performance decide. B2B products: fewer creators, higher-quality long-term partnerships.",
  "Built-in trust: every payout is fraud-scored, every endorsement carries AI-content disclosure, and we never fabricate testimonials or clone a creator without consent.",
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
