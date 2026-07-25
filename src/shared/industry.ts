// Industry adaptation layer (client-safe, pure data).
//
// The OS serves EVERY kind of business — not restaurants, plumbers or "Head of
// Marketing" B2B. This module maps a brand's own `industry` (and product) to a
// spanning set of archetypes, so every page can pull industry-appropriate
// examples, placeholders, prospect-finding methods and decision-maker titles
// from the ACTIVE brand instead of hardcoding one vertical.
//
// Honest by construction: these are neutral, editable defaults and illustrative
// methods — never fabricated named businesses, ratings or contacts.

import type { Brand } from "@/shared/brand";

export type IndustryProfile = {
  key: string;
  label: string;
  match: string[];              // lowercase keywords detected in industry/product
  sellsTo: "consumers" | "businesses" | "both";
  audience: string;             // typical customer, in plain words
  sampleProduct: string;        // placeholder for "what you sell"
  sampleOffer: string;          // placeholder for a current offer
  categories: string[];         // content / blog / site categories
  channels: string[];           // best acquisition channels for this industry
  findCustomers: string[];      // CONCRETE ways to find prospects (searches, directories, communities)
  buyerTitles: string[];        // decision-maker roles when selling INTO this industry
  commonGaps: string[];         // typical marketing gaps (audit flavour, not a verdict)
};

// A spanning archetype set. Order matters only for the first-match tie-break;
// GENERIC is the honest fallback so an unknown industry still gets neutral,
// non-misleading defaults instead of someone else's vertical.
export const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    key: "hospitality", label: "Hospitality & food",
    match: ["restaurant", "cafe", "café", "coffee", "food", "catering", "bar", "pub", "hotel", "takeaway", "grill", "bakery", "kitchen", "diner", "bistro"],
    sellsTo: "consumers", audience: "local diners and event/catering bookers nearby",
    sampleProduct: "your signature dishes / catering", sampleOffer: "first-order or midweek deal",
    categories: ["Menu & dishes", "Local guides", "Events & catering", "Behind the kitchen"],
    channels: ["Google Business Profile", "Instagram / TikTok", "WhatsApp orders", "local listings"],
    findCustomers: ["Google Maps: nearby offices / venues that book catering", "local Facebook & community groups", "event & wedding directories in your city", "\"[your city] catering\" and \"private hire\" searches"],
    buyerTitles: ["Owner", "General Manager", "Events Manager", "Office Manager (catering)"],
    commonGaps: ["no online ordering link", "menu not indexed", "few recent reviews", "no catering landing page"],
  },
  {
    key: "trades", label: "Trades & home services",
    match: ["plumb", "electric", "builder", "construction", "roof", "hvac", "heating", "boiler", "carpenter", "landscap", "cleaning", "handyman", "painter", "decorator", "locksmith", "gas", "renovation"],
    sellsTo: "both", audience: "local homeowners and property managers needing the job done",
    sampleProduct: "your callout / installation service", sampleOffer: "free quote or fixed-price callout",
    categories: ["Service pages", "How-to & maintenance", "Local area pages", "Before / after jobs"],
    channels: ["Google Business Profile", "Checkatrade / trade directories", "WhatsApp quotes", "local search"],
    findCustomers: ["Google Maps: letting agents & property managers in your area", "local homeowner Facebook groups", "trade directories (Checkatrade, MyBuilder, Rated People)", "\"[trade] near me\" gaps where competitors have no site"],
    buyerTitles: ["Homeowner", "Property Manager", "Letting Agent", "Facilities Manager"],
    commonGaps: ["no website or one-page only", "no reviews / rating", "no quote form", "not on Google Maps"],
  },
  {
    key: "ecommerce", label: "Retail & e-commerce",
    match: ["ecommerce", "e-commerce", "shop", "store", "retail", "boutique", "shopify", "woocommerce", "amazon", "etsy", "merch", "clothing", "fashion", "apparel", "product brand", "dtc", "d2c"],
    sellsTo: "consumers", audience: "online shoppers searching for your product category",
    sampleProduct: "your bestselling product / range", sampleOffer: "bundle or first-order discount",
    categories: ["Product guides", "Comparisons", "Gift & seasonal", "Care & how-to"],
    channels: ["SEO / product listings", "Instagram / TikTok / Pinterest", "email & SMS", "paid social (owned budget)"],
    findCustomers: ["marketplaces (Amazon, Etsy) category & keyword gaps", "Pinterest & TikTok trend searches for your category", "niche communities (Reddit, Facebook groups)", "influencer/creator lists in your niche"],
    buyerTitles: ["Founder", "Head of Marketing", "Head of Growth", "E-commerce Director"],
    commonGaps: ["thin product descriptions", "no schema/rich results", "no email capture", "no abandoned-cart flow"],
  },
  {
    key: "professional", label: "Professional services",
    match: ["consult", "agency", "marketing", "legal", "law", "solicitor", "account", "bookkeep", "finance", "advisory", "recruit", "insurance", "architect", "surveyor", "hr ", "pr ", "b2b services"],
    sellsTo: "businesses", audience: "business owners and managers who need your expertise",
    sampleProduct: "your core engagement / retainer", sampleOffer: "free audit or discovery call",
    categories: ["Insights & analysis", "Case studies", "Guides & frameworks", "Industry news"],
    channels: ["LinkedIn", "SEO / thought leadership", "referrals & partnerships", "email / cold outreach (compliant)"],
    findCustomers: ["LinkedIn Sales Navigator by title + industry", "Companies House / industry registers", "local business directories & chambers of commerce", "event & webinar attendee lists"],
    buyerTitles: ["Founder / Owner", "Managing Director", "Operations Manager", "Head of Marketing", "Finance Director"],
    commonGaps: ["no clear proof / case studies", "weak positioning", "no lead magnet", "slow follow-up"],
  },
  {
    key: "saas", label: "SaaS & technology",
    match: ["saas", "software", "app", "platform", "tech", "startup", "api", "cloud", "data", "ai ", "developer", "b2b software", "fintech", "martech"],
    sellsTo: "businesses", audience: "teams and buyers evaluating software like yours",
    sampleProduct: "your product / plan", sampleOffer: "free trial or demo",
    categories: ["Product & features", "Comparisons vs alternatives", "Playbooks & guides", "Integrations"],
    channels: ["SEO / comparison content", "LinkedIn", "product-led / free trial", "communities (Reddit, Slack)"],
    findCustomers: ["LinkedIn by role (VP/Director) + company size", "review sites (G2, Capterra) categories", "funding/hiring signals (they have budget)", "developer/industry communities & forums"],
    buyerTitles: ["VP Marketing", "VP Sales", "Director of Demand Gen", "CTO / Head of Engineering", "CMO"],
    commonGaps: ["no comparison pages", "no free entry point", "docs not indexed", "no case studies"],
  },
  {
    key: "health", label: "Health & wellness",
    match: ["clinic", "dental", "dentist", "medical", "physio", "therapy", "therapist", "chiro", "wellness", "health", "nutrition", "counsel", "gp ", "aesthetic", "optician", "pharmacy", "care home"],
    sellsTo: "consumers", audience: "local patients and clients seeking care or treatment",
    sampleProduct: "your treatment / consultation", sampleOffer: "new-patient consultation offer",
    categories: ["Treatments & conditions", "Patient FAQs", "Wellbeing guides", "Meet the team"],
    channels: ["Google Business Profile", "local SEO", "referrals", "reviews & reputation"],
    findCustomers: ["Google Maps: nearby areas you can serve", "local community & parent groups", "referral partners (GPs, gyms, employers)", "health directories in your region"],
    buyerTitles: ["Patient", "Practice Manager", "HR / Wellbeing Lead (corporate)", "Referral Partner"],
    commonGaps: ["no treatment pages", "no booking link", "few reviews", "no trust/credentials shown"],
  },
  {
    key: "beauty", label: "Beauty & personal care",
    match: ["salon", "spa", "barber", "beauty", "hair", "nail", "lash", "brow", "makeup", "aesthetics", "tattoo", "grooming", "cosmetic"],
    sellsTo: "consumers", audience: "local clients booking appointments",
    sampleProduct: "your signature service", sampleOffer: "new-client discount or package",
    categories: ["Services & pricing", "Looks & inspiration", "Aftercare", "Client transformations"],
    channels: ["Instagram / TikTok", "Google Business Profile", "booking apps", "referrals & loyalty"],
    findCustomers: ["Instagram & TikTok local hashtags", "Google Maps nearby neighbourhoods", "local Facebook & community groups", "booking-platform listings (Fresha, Treatwell)"],
    buyerTitles: ["Client", "Salon Owner", "Bridal / Events Organiser"],
    commonGaps: ["no online booking", "no price list", "inconsistent posting", "no before/after gallery"],
  },
  {
    key: "fitness", label: "Fitness & sport",
    match: ["gym", "fitness", "trainer", "personal train", "yoga", "pilates", "crossfit", "coach", "sport", "martial", "dance", "bootcamp", "studio fitness"],
    sellsTo: "consumers", audience: "local members and clients wanting results",
    sampleProduct: "your membership / programme", sampleOffer: "free class or trial week",
    categories: ["Programmes & classes", "Results & transformations", "Nutrition & tips", "Community"],
    channels: ["Instagram / TikTok", "Google Business Profile", "referrals & challenges", "email nurture"],
    findCustomers: ["local fitness & wellbeing Facebook groups", "Google Maps nearby residential areas", "corporate wellbeing contacts (local employers)", "event & parkrun communities"],
    buyerTitles: ["Member", "Gym Owner", "Corporate Wellbeing Lead"],
    commonGaps: ["no trial offer", "no class timetable online", "no results/social proof", "no lead capture"],
  },
  {
    key: "realestate", label: "Property & real estate",
    match: ["estate agent", "property", "letting", "realtor", "real estate", "mortgage", "conveyanc", "landlord", "developer property", "housing", "serviced accommodation"],
    sellsTo: "both", audience: "buyers, sellers, landlords and tenants in your area",
    sampleProduct: "your sales / lettings service", sampleOffer: "free valuation",
    categories: ["Area guides", "Buying & selling tips", "Market updates", "Landlord advice"],
    channels: ["portals (Rightmove/Zoopla)", "local SEO", "social proof / reviews", "email to registered buyers"],
    findCustomers: ["Google Maps: developers & landlords in your patch", "local investor & landlord groups", "\"[area] property\" search gaps", "referral partners (solicitors, mortgage brokers)"],
    buyerTitles: ["Homeowner", "Landlord", "Property Investor", "Developer"],
    commonGaps: ["no area/neighbourhood pages", "no valuation lead magnet", "slow enquiry response", "few reviews"],
  },
  {
    key: "education", label: "Education & training",
    match: ["tutor", "course", "coaching", "school", "training", "academy", "education", "e-learning", "learn", "teach", "workshop", "bootcamp course", "certification"],
    sellsTo: "both", audience: "learners (and parents / employers) seeking your programme",
    sampleProduct: "your course / programme", sampleOffer: "free lesson or intro workshop",
    categories: ["Course guides", "Study & how-to", "Success stories", "Careers & outcomes"],
    channels: ["SEO / how-to content", "YouTube / TikTok", "email nurture", "communities"],
    findCustomers: ["parent & learner communities and forums", "employer L&D / HR contacts (B2B training)", "\"how to [skill]\" search gaps", "partner schools / organisations"],
    buyerTitles: ["Learner / Parent", "L&D Manager", "HR Director", "Head Teacher"],
    commonGaps: ["no free entry point", "no outcomes/proof", "no email capture", "thin course pages"],
  },
  {
    key: "automotive", label: "Automotive",
    match: ["garage", "mechanic", "car ", "auto", "vehicle", "mot", "tyre", "dealership", "bodyshop", "valet", "motor", "ev charg"],
    sellsTo: "both", audience: "local drivers and fleet owners needing service",
    sampleProduct: "your service / repair", sampleOffer: "seasonal check or fixed-price service",
    categories: ["Services", "Maintenance guides", "Local pages", "Deals"],
    channels: ["Google Business Profile", "local SEO", "reviews", "WhatsApp bookings"],
    findCustomers: ["Google Maps: local fleets & delivery firms", "community & motoring groups", "\"[service] near me\" search gaps", "trade & fleet directories"],
    buyerTitles: ["Driver", "Fleet Manager", "Business Owner (vehicles)"],
    commonGaps: ["no booking link", "no service pages", "few reviews", "not on Maps"],
  },
  {
    key: "creative", label: "Creative & media",
    match: ["photograph", "video", "design", "artist", "studio", "media", "content creator", "film", "music", "creative", "brand studio", "illustrat", "animation"],
    sellsTo: "both", audience: "clients who need your creative work",
    sampleProduct: "your package / commission", sampleOffer: "portfolio call or mini-session",
    categories: ["Portfolio & work", "Process & tips", "Client stories", "Behind the scenes"],
    channels: ["Instagram / TikTok / YouTube", "portfolio SEO", "referrals", "marketplaces"],
    findCustomers: ["Instagram & Behance discovery in your niche", "local business & event directories", "referral partners (planners, agencies)", "creative marketplaces & briefs"],
    buyerTitles: ["Business Owner", "Marketing Manager", "Events Organiser", "Brand Manager"],
    commonGaps: ["no clear packages/pricing", "no enquiry form", "portfolio not indexed", "no testimonials"],
  },
  {
    key: "events", label: "Events & weddings",
    match: ["event", "wedding", "venue", "planner", "party", "conference", "exhibition", "hire", "entertainment", "dj ", "celebrant"],
    sellsTo: "both", audience: "couples, organisers and companies planning events",
    sampleProduct: "your package / venue hire", sampleOffer: "viewing or planning call",
    categories: ["Packages & pricing", "Real events", "Planning guides", "Supplier network"],
    channels: ["Instagram / Pinterest", "wedding & event directories", "referrals", "local SEO"],
    findCustomers: ["wedding & event directories (Hitched, Bridebook)", "corporate PA / office manager contacts", "venue & supplier partner networks", "\"[city] [event type]\" search gaps"],
    buyerTitles: ["Couple / Host", "Event Organiser", "PA / Office Manager", "Marketing Manager"],
    commonGaps: ["no pricing guide", "no enquiry form", "no real-event gallery", "slow response"],
  },
  {
    key: "nonprofit", label: "Nonprofit & community",
    match: ["charity", "nonprofit", "non-profit", "ngo", "community", "foundation", "social enterprise", "volunteer", "fundrais"],
    sellsTo: "both", audience: "supporters, donors and the people you serve",
    sampleProduct: "your programme / campaign", sampleOffer: "donation or sign-up appeal",
    categories: ["Impact & stories", "Get involved", "News", "Reports"],
    channels: ["email & newsletter", "social storytelling", "SEO", "partnerships & grants"],
    findCustomers: ["corporate CSR / partnership contacts", "grant & funder directories", "community & volunteer networks", "local press & event listings"],
    buyerTitles: ["Donor / Supporter", "CSR Manager", "Grant Officer", "Community Partner"],
    commonGaps: ["no clear donate/sign-up CTA", "no impact proof", "no email capture", "thin story content"],
  },
];

export const GENERIC_PROFILE: IndustryProfile = {
  key: "generic", label: "Your industry",
  match: [],
  sellsTo: "both", audience: "the customers your business serves",
  sampleProduct: "your main product or service", sampleOffer: "your current offer",
  categories: ["Guides & how-to", "Comparisons", "Local / audience pages", "News & updates"],
  channels: ["SEO / search", "social media", "email", "referrals"],
  findCustomers: ["Google Maps for local businesses in your target area", "LinkedIn by role + industry for B2B", "niche communities, groups and directories", "search gaps where competitors have a weak or no presence"],
  buyerTitles: ["Owner / Founder", "Managing Director", "Operations Manager", "Marketing Lead"],
  commonGaps: ["unclear offer", "no lead capture", "thin/uncrawlable content", "slow follow-up"],
};

const norm = (s?: string) => (s || "").toLowerCase();

// Resolve the best-fit profile from a brand (or a raw industry/product string).
// Matches on industry first, then product, then falls back to GENERIC.
export function resolveIndustry(input: Brand | string | null | undefined): IndustryProfile {
  const hay = typeof input === "string" ? norm(input) : `${norm(input?.industry)} ${norm(input?.product)} ${norm(input?.name)}`;
  if (!hay.trim()) return GENERIC_PROFILE;
  let best: IndustryProfile | null = null;
  let bestHits = 0;
  for (const p of INDUSTRY_PROFILES) {
    const hits = p.match.reduce((n, kw) => (hay.includes(kw) ? n + 1 : n), 0);
    if (hits > bestHits) { best = p; bestHits = hits; }
  }
  return best ?? GENERIC_PROFILE;
}

// Neutral, brand-derived placeholders for module forms. Prefers the brand's OWN
// values; falls back to the industry archetype; never to a foreign vertical.
export function industryPlaceholders(brand: Brand | null | undefined): {
  product: string; audience: string; offer: string; category: string; location: string; industry: string;
} {
  const p = resolveIndustry(brand);
  return {
    product: brand?.product || p.sampleProduct,
    audience: brand?.audience || p.audience,
    offer: brand?.offer || p.sampleOffer,
    category: brand?.industry || p.categories[0],
    location: brand?.location || "your area",
    industry: brand?.industry || p.label,
  };
}
