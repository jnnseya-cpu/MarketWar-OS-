// The 26-agent revenue army (Money Machine Doctrine §6) — canonical roster.
// Pure data so both the API and the War Room UI render the same truth. Each
// agent maps to a REAL shipped surface where one exists. Status is honest:
//   "live"     — operational now, no external key (runs on your own data)
//   "activate" — production-ready; goes live the moment its provider key is set
//   "roadmap"  — specified in the doctrine, not yet a dedicated surface
// No agent is a wishlist entry: live/activate are real; roadmap is labelled.

export type AgentStatus = "live" | "activate" | "roadmap";
export type Division =
  | "Supreme Command" | "Intelligence & Targeting" | "Acquisition Strike Force"
  | "Conversion Kill Team" | "Revenue Multiplication" | "Fortress & Reputation" | "Expansion Command";

export type ArmyAgent = {
  n: number; codename: string; role: string; mission: string; kpi: string;
  division: Division; status: AgentStatus; href?: string; activates?: string;
};

export const ARMY: ArmyAgent[] = [
  // Supreme Command
  { n: 1, codename: "WARLORD", role: "Revenue Commander", mission: "Orchestrates every division; runs the Speed-of-Money queue; issues the daily War Report.", kpi: "Total attributed revenue · blended ROI", division: "Supreme Command", status: "live", href: "/dashboard/command" },
  { n: 2, codename: "LEDGER", role: "Money Attribution", mission: "Tracks every pound end-to-end; powers the live Money Ledger + ROI.", kpi: "Attribution coverage · ledger accuracy", division: "Supreme Command", status: "live", href: "/dashboard/money-ledger" },
  // Division I — Intelligence & Targeting
  { n: 3, codename: "PROFILER", role: "Ideal Customer Profile", mission: "Builds + refines the ICP from real purchase data.", kpi: "Lead-to-sale conversion lift", division: "Intelligence & Targeting", status: "live", href: "/dashboard/segments" },
  { n: 4, codename: "SPYGLASS", role: "Competitor Intel", mission: "24/7 competitor monitoring: prices, offers, ads, reviews, weaknesses.", kpi: "Moves detected → countered <24h", division: "Intelligence & Targeting", status: "live", href: "/dashboard/competitors" },
  { n: 5, codename: "CARTOGRAPHER", role: "Market Map", mission: "Maps demand by geography, segment and season; finds underserved pockets.", kpi: "New revenue pockets / month", division: "Intelligence & Targeting", status: "live", href: "/dashboard/local" },
  { n: 6, codename: "ORACLE", role: "Trend & Timing", mission: "Detects demand spikes, seasonal windows and viral moments early.", kpi: "Revenue from timed strikes", division: "Intelligence & Targeting", status: "live", href: "/dashboard/discover" },
  // Division II — Acquisition Strike Force
  { n: 7, codename: "MAGNET", role: "Content Engine", mission: "Generates niche-dominating content across channels in the brand voice.", kpi: "Inbound leads / week", division: "Acquisition Strike Force", status: "live", href: "/dashboard/content" },
  { n: 8, codename: "SNIPER", role: "Paid Ads", mission: "Builds, tests and optimises ad campaigns; kills losers, scales winners.", kpi: "CAC · ROAS", division: "Acquisition Strike Force", status: "activate", href: "/dashboard/campaigns", activates: "Connect an ad platform to auto-launch; strategy + creative build now" },
  { n: 9, codename: "CONQUEROR", role: "Conquest", mission: "Targets competitors' audiences + dissatisfied customers with switch offers.", kpi: "Customers taken from competitors", division: "Acquisition Strike Force", status: "live", href: "/dashboard/competitors" },
  { n: 10, codename: "BEACON", role: "Local Dominance", mission: "Local SEO, maps, directories — owns 'near me' demand.", kpi: "Local search share · calls", division: "Acquisition Strike Force", status: "live", href: "/dashboard/local" },
  { n: 11, codename: "ALLIANCE", role: "Partnerships", mission: "Prospects referral partners, cross-promotions and B2B channels.", kpi: "Partner-sourced revenue", division: "Acquisition Strike Force", status: "live", href: "/dashboard/prospecting" },
  { n: 12, codename: "AMPLIFIER", role: "Social Engine", mission: "Runs social as a lead machine, not a vanity feed.", kpi: "Social-attributed leads + sales", division: "Acquisition Strike Force", status: "activate", href: "/dashboard/publish", activates: "Set ZERNIO_API_KEY to publish to 15 channels; content builds now" },
  // Division III — Conversion Kill Team
  { n: 13, codename: "FIRSTRESPONDER", role: "Instant Responder", mission: "Answers every enquiry in seconds, 24/7, multilingual; books + qualifies.", kpi: "Speed-to-lead · show-up rate", division: "Conversion Kill Team", status: "activate", href: "/dashboard/whatsapp", activates: "Set WHATSAPP_TOKEN for live send; replies draft now" },
  { n: 14, codename: "CLOSER", role: "Deal Closer", mission: "Objection-handling, offer sequencing and urgency mechanics to payment.", kpi: "Conversation-to-sale rate", division: "Conversion Kill Team", status: "live", href: "/dashboard/first-customer" },
  { n: 15, codename: "BLOODHOUND", role: "Follow-Up", mission: "Relentless multi-touch follow-up on every unclosed lead.", kpi: "Revenue recovered from stalled leads", division: "Conversion Kill Team", status: "live", href: "/dashboard/email" },
  { n: 16, codename: "RESCUER", role: "Abandonment Recovery", mission: "Recovers abandoned carts, unfinished bookings and ghosted quotes.", kpi: "Recovery rate · recovered revenue", division: "Conversion Kill Team", status: "live", href: "/dashboard/recovery" },
  { n: 17, codename: "WORDSMITH", role: "Offer & Copy", mission: "Crafts + A/B tests offers, landing pages, scripts and hooks.", kpi: "Conversion lift / test cycle", division: "Conversion Kill Team", status: "live", href: "/dashboard/offers" },
  // Division IV — Revenue Multiplication
  { n: 18, codename: "STACKER", role: "Upsell / Cross-sell", mission: "Deploys the right add-on to the right customer at the right moment.", kpi: "Average order value lift", division: "Revenue Multiplication", status: "live", href: "/dashboard/offers" },
  { n: 19, codename: "PRICELORD", role: "Pricing Intelligence", mission: "Finds the revenue-maximising price from market + elasticity data.", kpi: "Margin + revenue / unit lift", division: "Revenue Multiplication", status: "live", href: "/dashboard/offers" },
  { n: 20, codename: "HEARTBEAT", role: "Repeat Revenue", mission: "Engineers repeat purchases, subscriptions and reorder cadences.", kpi: "Purchase frequency · recurring %", division: "Revenue Multiplication", status: "live", href: "/dashboard/customers" },
  { n: 21, codename: "NECROMANCER", role: "Win-Back", mission: "Resurrects lapsed + dormant customers with targeted reactivation.", kpi: "Reactivated revenue", division: "Revenue Multiplication", status: "live", href: "/dashboard/recovery" },
  // Division V — Fortress & Reputation
  { n: 22, codename: "CROWNGUARD", role: "Review Dominance", mission: "Generates, responds to and leverages reviews to own local rankings.", kpi: "Rating vs competitors · velocity", division: "Fortress & Reputation", status: "live", href: "/dashboard/reputation" },
  { n: 23, codename: "EVANGELIST", role: "Referral", mission: "Converts happy customers into an automated referral sales force.", kpi: "Referral-sourced revenue", division: "Fortress & Reputation", status: "live", href: "/dashboard/influencers" },
  { n: 24, codename: "SHIELD", role: "Retention & Churn", mission: "Detects at-risk customers and intervenes before revenue leaks.", kpi: "Churn rate · saved revenue", division: "Fortress & Reputation", status: "live", href: "/dashboard/customers" },
  // Division VI — Expansion Command
  { n: 25, codename: "PATHFINDER", role: "Growth Proposal", mission: "Monthly data-backed expansion proposals: new offers, segments, channels.", kpi: "Approved expansions → new streams", division: "Expansion Command", status: "live", href: "/dashboard/autopilot" },
  { n: 26, codename: "QUARTERMASTER", role: "ACU Efficiency", mission: "Ensures every ACU returns a multiple; reallocates budget to winners.", kpi: "Revenue per ACU · expansion uptake", division: "Expansion Command", status: "live", href: "/dashboard/billing" },
];

export const DIVISIONS: Division[] = [
  "Supreme Command", "Intelligence & Targeting", "Acquisition Strike Force",
  "Conversion Kill Team", "Revenue Multiplication", "Fortress & Reputation", "Expansion Command",
];

export function armyStats() {
  const live = ARMY.filter((a) => a.status === "live").length;
  const activate = ARMY.filter((a) => a.status === "activate").length;
  const roadmap = ARMY.filter((a) => a.status === "roadmap").length;
  return { total: ARMY.length, live, activate, roadmap };
}
