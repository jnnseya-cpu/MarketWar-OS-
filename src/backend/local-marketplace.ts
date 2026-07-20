// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Local Marketplace Engine — the Yelp-class discovery + quote + book
// layer (spec: "Local Discovery, Reviews, Booking & Lead Generation Engine").
//
// Three owned capabilities, none of which rent a third-party platform:
//   1. Local Business Discovery — rank providers by category/location/trust.
//   2. Request-a-Quote Marketplace — a customer posts a job; the engine matches
//      and ranks the best providers with a transparent match score + "why now".
//   3. Booking & Appointment Engine — availability slots, deposits, no-show
//      protection, reminder schedule, reschedule/cancel rules.
//
// Doctrine ties: honesty (match scores are labelled estimates, never fabricated
// demand), independence (this is owned lead-gen infrastructure, not a Yelp
// wrapper), consent (booking reminders respect the frequency architecture).
// Pure + deterministic (no wall-clock, no randomness) so it runs in demo mode
// and unit-checks; live provider data refines it post-launch.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const round2 = (n: number) => Math.round(n * 100) / 100;
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

export type Provider = {
  id: string;
  name: string;
  category: string;      // "Restaurant", "Plumber", "Hair Salon"…
  city: string;
  postcode: string;      // e.g. "SW9"
  rating: number;        // 0–5
  reviews: number;
  priceTier: 1 | 2 | 3 | 4; // £ … ££££
  responseMins: number;  // median first-response time
  verified: boolean;     // licence/identity verified
  booking: boolean;      // accepts online bookings
  quotes: boolean;       // accepts quote requests
  services: string[];
};

// ---------------------------------------------------------------------------
// 1. Local Business Discovery
// ---------------------------------------------------------------------------
export type DiscoveryFilters = {
  category?: string;
  city?: string;
  postcodePrefix?: string; // radius proxy: shared postcode district
  minRating?: number;
  minReviews?: number;
  maxPriceTier?: 1 | 2 | 3 | 4;
  bookableOnly?: boolean;
  verifiedOnly?: boolean;
};

export type DiscoveryHit = Provider & { discoveryScore: number; badges: string[] };

export function discoverLocal(providers: Provider[], filters: DiscoveryFilters = {}): DiscoveryHit[] {
  const eq = (a?: string, b?: string) => !a || (b ?? "").toLowerCase() === a.toLowerCase();
  return providers
    .filter((p) =>
      eq(filters.category, p.category) &&
      eq(filters.city, p.city) &&
      (!filters.postcodePrefix || p.postcode.toLowerCase().startsWith(filters.postcodePrefix.toLowerCase())) &&
      p.rating >= (filters.minRating ?? 0) &&
      p.reviews >= (filters.minReviews ?? 0) &&
      p.priceTier <= (filters.maxPriceTier ?? 4) &&
      (!filters.bookableOnly || p.booking) &&
      (!filters.verifiedOnly || p.verified))
    .map((p) => {
      // Trust (rating × review-depth) dominates; fast response, verification and
      // online booking add convenience signal. Deterministic, no invented demand.
      const trust = p.rating / 5 * 60;
      const depth = Math.min(20, Math.log10(p.reviews + 1) * 12);
      const speed = Math.max(0, 12 - p.responseMins / 20);
      const conv = (p.verified ? 5 : 0) + (p.booking ? 3 : 0);
      const badges: string[] = [];
      if (p.verified) badges.push("Verified");
      if (p.responseMins <= 30) badges.push("Fast responder");
      if (p.rating >= 4.6 && p.reviews >= 50) badges.push("Highly rated");
      if (p.booking) badges.push("Instant booking");
      return { ...p, discoveryScore: clamp(trust + depth + speed + conv), badges };
    })
    .sort((a, b) => b.discoveryScore - a.discoveryScore);
}

// ---------------------------------------------------------------------------
// 2. Request-a-Quote Marketplace
// ---------------------------------------------------------------------------
export type QuoteRequest = {
  category: string;
  city: string;
  postcodePrefix?: string;
  budgetGbp?: number;    // customer's indicative budget
  urgency?: "flexible" | "this_week" | "urgent";
  details?: string;
};

export type QuoteMatch = {
  providerId: string;
  name: string;
  matchScore: number;    // 0–100 — labelled estimate, never a guarantee
  rating: number;
  reviews: number;
  priceTier: number;
  responseMins: number;
  responseScore: number; // likelihood of a fast, useful reply
  reasons: string[];     // transparent "why this provider"
  quoteExpiryHours: number;
};

const PRICE_LABELS = ["£", "££", "£££", "££££"];
// Rough per-tier budget guidance so budget↔priceTier fit is explainable.
const TIER_MIN_GBP = [0, 40, 120, 300];

export function requestQuote(req: QuoteRequest, providers: Provider[]): { matches: QuoteMatch[]; note: string } {
  const inCategory = providers.filter(
    (p) => p.quotes && p.category.toLowerCase() === req.category.toLowerCase());
  const matches = inCategory
    .map((p) => {
      const reasons: string[] = [];
      let score = 40;
      // Proximity: same postcode district > same city > elsewhere.
      if (req.postcodePrefix && p.postcode.toLowerCase().startsWith(req.postcodePrefix.toLowerCase())) { score += 22; reasons.push(`In ${req.postcodePrefix} — local`); }
      else if (p.city.toLowerCase() === req.city.toLowerCase()) { score += 14; reasons.push(`In ${req.city}`); }
      // Trust.
      score += p.rating / 5 * 18;
      if (p.rating >= 4.6 && p.reviews >= 40) reasons.push(`${p.rating}★ over ${p.reviews} reviews`);
      // Budget fit vs price tier.
      if (req.budgetGbp != null) {
        const floor = TIER_MIN_GBP[p.priceTier - 1];
        if (req.budgetGbp >= floor) { score += 10; reasons.push(`Fits ${PRICE_LABELS[p.priceTier - 1]} budget`); }
        else { score -= 12; reasons.push(`Above your budget (${PRICE_LABELS[p.priceTier - 1]})`); }
      }
      // Responsiveness.
      const responseScore = clamp(100 - p.responseMins / 2 + (p.verified ? 8 : 0));
      if (p.responseMins <= 30) { score += 8; reasons.push("Usually replies within 30 min"); }
      if (p.verified) { score += 4; reasons.push("Verified"); }
      // Urgency raises the weight of fast responders.
      if (req.urgency === "urgent") score += (p.responseMins <= 30 ? 6 : -6);
      const quoteExpiryHours = req.urgency === "urgent" ? 12 : req.urgency === "this_week" ? 48 : 72;
      return {
        providerId: p.id, name: p.name, matchScore: clamp(score), rating: p.rating, reviews: p.reviews,
        priceTier: p.priceTier, responseMins: p.responseMins, responseScore, reasons, quoteExpiryHours,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
  return {
    matches,
    note: matches.length
      ? `Matched ${matches.length} provider(s) accepting quotes in ${req.category}. Scores are estimates from trust, proximity, budget-fit and responsiveness — not a guarantee of price or availability.`
      : `No quote-accepting providers found for ${req.category} in ${req.city}. Widen the area or category.`,
  };
}

// ---------------------------------------------------------------------------
// 3. Booking & Appointment Engine
// ---------------------------------------------------------------------------
export type BookingRequest = {
  providerId: string;
  service: string;
  partySize?: number;    // for reservations
  dayOffsets?: number[]; // which days to offer (0 = today); default next 3 days
};

export type Slot = { dayOffset: number; time: string; label: string };
export type BookingOffer = {
  providerId: string;
  service: string;
  slots: Slot[];
  depositGbp: number;
  depositReason: string;
  noShowProtection: string;
  reminders: string[];       // schedule offsets, consent-respecting
  reschedulePolicy: string;
  cancellationPolicy: string;
};

const DAY_NAMES = ["today", "tomorrow", "in 2 days", "in 3 days", "in 4 days", "in 5 days", "in 6 days"];

export function bookingOffer(req: BookingRequest, provider: Provider): BookingOffer {
  const days = req.dayOffsets && req.dayOffsets.length ? req.dayOffsets : [0, 1, 2];
  // Deterministic slot generation seeded by provider+service so demo is stable.
  const base = seed(provider.id + req.service);
  const times = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30"];
  const slots: Slot[] = [];
  for (const d of days) {
    const start = (base + d * 3) % times.length;
    // Two open slots per day, spaced, skipping "taken" ones deterministically.
    for (let k = 0; k < 2; k++) {
      const t = times[(start + k * 3) % times.length];
      slots.push({ dayOffset: d, time: t, label: `${DAY_NAMES[d] ?? `in ${d} days`} ${t}` });
    }
  }
  // Deposit protects the slot; scaled by price tier, waived for £ tier-1.
  const depositGbp = provider.priceTier <= 1 ? 0 : round2(provider.priceTier * 5 * (req.partySize && req.partySize > 2 ? 1.5 : 1));
  return {
    providerId: provider.id,
    service: req.service,
    slots,
    depositGbp,
    depositReason: depositGbp === 0 ? "No deposit for this provider." : `£${depositGbp} deposit holds your slot and is credited to the final bill.`,
    noShowProtection: depositGbp === 0
      ? "A no-show frees the slot immediately; repeated no-shows pause self-booking."
      : `A no-show or a cancellation inside 24 h forfeits the £${depositGbp} deposit.`,
    reminders: ["24 h before", "3 h before", "1 h before"], // respects the touch cap; transactional, not marketing
    reschedulePolicy: "Free reschedule up to 24 h before the slot.",
    cancellationPolicy: depositGbp === 0 ? "Cancel any time." : "Full refund if cancelled 24 h+ before; deposit forfeit inside 24 h.",
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo directory — a Brixton-area local marketplace so discovery
// / quotes / booking all render with zero config (Demo Intelligence).
// ---------------------------------------------------------------------------
export function demoProviders(): Provider[] {
  return [
    { id: "p1", name: "Brixton Grill House", category: "Restaurant", city: "London", postcode: "SW9", rating: 4.7, reviews: 213, priceTier: 2, responseMins: 18, verified: true, booking: true, quotes: false, services: ["Table for 2", "Table for 4", "Private hire"] },
    { id: "p2", name: "Village Thai Kitchen", category: "Restaurant", city: "London", postcode: "SW9", rating: 4.4, reviews: 88, priceTier: 2, responseMins: 40, verified: true, booking: true, quotes: false, services: ["Dinner reservation", "Set menu"] },
    { id: "p3", name: "Coldwater Plumbing", category: "Plumber", city: "London", postcode: "SW9", rating: 4.8, reviews: 156, priceTier: 3, responseMins: 22, verified: true, booking: true, quotes: true, services: ["Leak repair", "Boiler service", "Bathroom fit"] },
    { id: "p4", name: "QuickFix Drains", category: "Plumber", city: "London", postcode: "SE24", rating: 4.1, reviews: 47, priceTier: 2, responseMins: 15, verified: false, booking: false, quotes: true, services: ["Blocked drain", "Emergency call-out"] },
    { id: "p5", name: "Southside Boiler Co", category: "Plumber", city: "London", postcode: "SW2", rating: 4.6, reviews: 92, priceTier: 4, responseMins: 55, verified: true, booking: true, quotes: true, services: ["Boiler install", "Annual service"] },
    { id: "p6", name: "Halo Hair Studio", category: "Hair Salon", city: "London", postcode: "SW9", rating: 4.9, reviews: 301, priceTier: 3, responseMins: 12, verified: true, booking: true, quotes: false, services: ["Cut & blow-dry", "Colour", "Bridal"] },
  ];
}
