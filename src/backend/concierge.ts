// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar AI Local Concierge — a natural-language front-end over the owned
// Local Marketplace engine. A customer types a request in plain English
// ("Find me a plumber in SW9 tomorrow under £150") and the concierge parses
// intent, runs discovery + quote matching, and — when the request implies a
// booking — surfaces a booking-ready call to action for the top provider.
//
// Doctrine ties: honesty (matches are labelled estimates; availability is a
// summary of the marketplace signal, never a fabricated "3 slots left"), and
// reuse (this rents nothing new — it is a thin, deterministic language layer
// over discoverLocal / requestQuote / bookingOffer). Pure, no wall-clock, no
// randomness, so it renders in demo mode with zero config.

import {
  discoverLocal,
  requestQuote,
  bookingOffer,
  demoProviders,
  type Provider,
  type QuoteRequest,
  type DiscoveryHit,
} from "@/backend/local-marketplace";

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

// ---------------------------------------------------------------------------
// Intent parsing — lightweight, rule-based, deterministic.
// ---------------------------------------------------------------------------
export type Urgency = "flexible" | "this_week" | "urgent";

export type ParsedIntent = {
  category: string;
  city: string;
  postcodePrefix?: string;
  budgetGbp?: number;
  urgency: Urgency;
  wantsBooking: boolean;
  partySize?: number;
  ambiguous: boolean;      // true when no known category could be resolved
  matchedWords: string[];  // transparency: which tokens drove the parse
};

// Known category words → canonical Provider.category. Order matters: longer /
// more specific phrases are tested first so "hair salon" wins over "hair".
const CATEGORY_WORDS: Array<{ words: string[]; category: string }> = [
  { words: ["hair salon", "hairdresser", "hair", "salon", "barber"], category: "Hair Salon" },
  { words: ["plumber", "plumbing", "boiler", "leak", "drain", "drains"], category: "Plumber" },
  { words: ["restaurant", "restaurants", "dinner", "table", "eat", "dining", "brunch", "lunch"], category: "Restaurant" },
];

// UK-ish postcode district: 1-2 letters then 1-2 digits (e.g. SW9, SE24, E1).
const POSTCODE_RE = /\b([a-z]{1,2}\d{1,2})\b/i;
// Budget: "£150", "under 150", "budget of 200".
const BUDGET_RE = /(?:£\s*|under\s+£?\s*|below\s+£?\s*|budget\s+of\s+£?\s*|max\s+£?\s*)(\d{2,6})/i;
const PARTY_RE = /\b(?:for|party of|table for)\s+(\d{1,2})\b/i;

const URGENT_WORDS = ["urgent", "asap", "emergency", "right now", "immediately", "now"];
const THIS_WEEK_WORDS = ["tonight", "tomorrow", "today", "this week", "this weekend", "tomorow"];
const BOOKING_WORDS = ["book", "booking", "reserve", "reservation", "appointment", "slot", "available", "availability"];

export function parseIntent(text: string): ParsedIntent {
  const t = text.toLowerCase();
  const matchedWords: string[] = [];

  // Category.
  let category = "";
  let ambiguous = true;
  outer: for (const entry of CATEGORY_WORDS) {
    for (const w of entry.words) {
      if (t.includes(w)) {
        category = entry.category;
        ambiguous = false;
        matchedWords.push(w);
        break outer;
      }
    }
  }
  // Sensible default when the request clearly wants a place to eat/party but no
  // exact word matched is not attempted here — an unresolved category stays
  // ambiguous so the concierge can ask a clarifying question.

  // Postcode district.
  let postcodePrefix: string | undefined;
  const pc = t.match(POSTCODE_RE);
  if (pc) {
    postcodePrefix = pc[1].toUpperCase();
    matchedWords.push(postcodePrefix);
  }

  // Budget.
  let budgetGbp: number | undefined;
  const b = t.match(BUDGET_RE);
  if (b) {
    const n = Number.parseInt(b[1], 10);
    if (Number.isFinite(n) && n > 0) {
      budgetGbp = n;
      matchedWords.push(`£${n}`);
    }
  }

  // Party size.
  let partySize: number | undefined;
  const ps = t.match(PARTY_RE);
  if (ps) {
    const n = Number.parseInt(ps[1], 10);
    if (Number.isFinite(n) && n > 0) {
      partySize = n;
      matchedWords.push(`party ${n}`);
    }
  }

  // Urgency.
  let urgency: Urgency = "flexible";
  if (URGENT_WORDS.some((w) => t.includes(w))) {
    urgency = "urgent";
    matchedWords.push("urgent");
  } else if (THIS_WEEK_WORDS.some((w) => t.includes(w))) {
    urgency = "this_week";
    matchedWords.push("soon");
  }

  // Booking intent.
  const wantsBooking = BOOKING_WORDS.some((w) => t.includes(w));
  if (wantsBooking) matchedWords.push("booking");

  return {
    // City is not reliably parseable from the demo directory (all "London"),
    // so default to London — the owned directory's city — deterministically.
    category: category || "",
    city: "London",
    postcodePrefix,
    budgetGbp,
    urgency,
    wantsBooking,
    partySize,
    ambiguous,
    matchedWords,
  };
}

// ---------------------------------------------------------------------------
// Concierge — parse → discover + quote → (optional) booking CTA.
// ---------------------------------------------------------------------------
export type ConciergeMatch = {
  providerId: string;
  name: string;
  why: string[];              // transparent reasons (from discovery + quote)
  priceExpectation: string;   // derived from priceTier — an estimate, not a price
  availabilitySummary: string;
  rating: number;
  reviews: number;
  cta: "book" | "quote";
  bookingHint?: { nextSlotLabel: string; depositGbp: number };
};

export type ConciergeResult = {
  understood: ParsedIntent;
  bestMatches: ConciergeMatch[];
  note: string;
};

// A caller can receive either a full result or a clarifying question.
export type ConciergeResponse = ConciergeResult | { clarify: string };

const PRICE_EXPECTATION: Record<number, string> = {
  1: "£ — budget-friendly (estimate)",
  2: "££ — mid-range (estimate)",
  3: "£££ — premium (estimate)",
  4: "££££ — high-end (estimate)",
};

function availabilityFor(hit: DiscoveryHit, urgency: Urgency): string {
  // A qualitative summary of the marketplace signal — never a fabricated count
  // of remaining slots. Booking-enabled + fast responders read as "sooner".
  if (!hit.booking && !hit.quotes) return "Contact provider to check availability (estimate).";
  if (hit.booking && hit.responseMins <= 30) {
    return urgency === "urgent"
      ? "Instant booking; typically responds within 30 min — good for urgent (estimate)."
      : "Instant online booking; typically responds within 30 min (estimate).";
  }
  if (hit.booking) return "Accepts online bookings; response time varies (estimate).";
  return "Quote-only; provider replies with availability (estimate).";
}

export function concierge(text: string, providers: Provider[] = demoProviders()): ConciergeResponse {
  const understood = parseIntent(text);

  if (understood.ambiguous || !understood.category) {
    return {
      clarify:
        "I couldn't tell what kind of local business you need. Which category are you after — for example a plumber, a restaurant, or a hair salon?",
    };
  }

  // Discovery pass (ranked, filtered by the parsed constraints).
  const hits = discoverLocal(providers, {
    category: understood.category,
    city: understood.city,
    postcodePrefix: understood.postcodePrefix,
  });

  if (hits.length === 0) {
    return {
      understood,
      bestMatches: [],
      note: `No ${understood.category.toLowerCase()} providers found${understood.postcodePrefix ? ` near ${understood.postcodePrefix}` : ""}. Try widening the area or dropping filters. (Estimate — based on the owned local directory.)`,
    };
  }

  // Quote pass to borrow the transparent "why" reasons for the same providers.
  const quoteReq: QuoteRequest = {
    category: understood.category,
    city: understood.city,
    postcodePrefix: understood.postcodePrefix,
    budgetGbp: understood.budgetGbp,
    urgency: understood.urgency,
    details: text,
  };
  const quote = requestQuote(quoteReq, providers);
  const reasonsById = new Map(quote.matches.map((m) => [m.providerId, m.reasons] as const));

  // Top few matches, deterministically ordered by discovery score.
  const top = hits.slice(0, 3);

  const bestMatches: ConciergeMatch[] = top.map((hit, idx) => {
    const why = [...(reasonsById.get(hit.id) ?? []), ...hit.badges].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    );
    // CTA: prefer booking when the customer asked to book AND the provider
    // supports it; otherwise fall back to a quote request when quotes are open.
    const canBook = hit.booking;
    const cta: "book" | "quote" =
      understood.wantsBooking && canBook ? "book" : hit.quotes ? "quote" : canBook ? "book" : "quote";

    const match: ConciergeMatch = {
      providerId: hit.id,
      name: hit.name,
      why: why.length ? why : ["Ranked by rating, review depth and responsiveness (estimate)"],
      priceExpectation: PRICE_EXPECTATION[hit.priceTier] ?? "estimate",
      availabilitySummary: availabilityFor(hit, understood.urgency),
      rating: hit.rating,
      reviews: hit.reviews,
      cta,
    };

    // For the single top match, when a booking is wanted and possible, attach a
    // concrete (deterministic) booking hint from the booking engine.
    if (idx === 0 && cta === "book" && understood.wantsBooking) {
      const service = hit.services[seed(hit.id + understood.category) % Math.max(1, hit.services.length)];
      const offer = bookingOffer({ providerId: hit.id, service, partySize: understood.partySize }, hit);
      if (offer.slots.length) {
        match.bookingHint = {
          nextSlotLabel: offer.slots[0].label,
          depositGbp: offer.depositGbp,
        };
      }
    }
    return match;
  });

  const note =
    `Understood "${understood.category}"${understood.postcodePrefix ? ` near ${understood.postcodePrefix}` : ""}` +
    `${understood.budgetGbp != null ? ` under £${understood.budgetGbp}` : ""}` +
    `${understood.urgency !== "flexible" ? ` (${understood.urgency.replace("_", " ")})` : ""}. ` +
    `${quote.note} Availability shown is a summary of marketplace signal, not a live slot count.`;

  return { understood, bestMatches, note };
}

// ---------------------------------------------------------------------------
// Zero-config demo.
// ---------------------------------------------------------------------------
export function demoConcierge(): ConciergeResponse {
  return concierge("Find me a plumber in SW9 tomorrow under £150", demoProviders());
}
