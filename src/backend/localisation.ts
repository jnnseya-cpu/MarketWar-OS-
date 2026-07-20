// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Global Localisation Engine (VisualStrike F1 §11) — TRANSCREATION, not
// translation. We adapt idioms, humour, cultural references, currency, legal
// and religious sensitivities per market, then emit a media plan (voiceover /
// subtitles / lip-sync) for the localised creative.
//
// Deterministic + demo-safe like the rest of the backend (src/backend/geo.ts):
// no Date, no Math.random, fixed FX rate table. Any derived value uses the
// seeded FNV-1a hash below so the same input always produces the same output.
//
// Honesty rule (house doctrine): outputs labelled as ESTIMATES / recommended
// adaptations — we never fabricate metrics or claim guaranteed lift, and we
// flag religion/legal-sensitive markets for human review before send.

// ---------------------------------------------------------------------------
// Seeded pseudo-random (FNV-1a) — deterministic, never Math.random / Date.
// ---------------------------------------------------------------------------
const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

// ---------------------------------------------------------------------------
// The 17 localisation axes (VisualStrike F1 §11) — transcreation surface.
// ---------------------------------------------------------------------------
export const LOCALISATION_AXES = [
  "country",
  "city",
  "language",
  "dialect",
  "accent",
  "currency",
  "cultural_references",
  "buying_behaviour",
  "weather",
  "season",
  "religion_sensitivity",
  "legal_restrictions",
  "platform_usage",
  "local_holidays",
  "local_humour",
  "local_influencers",
  "purchasing_power",
] as const;

export type LocalisationAxis = (typeof LOCALISATION_AXES)[number];

// ---------------------------------------------------------------------------
// Market profiles (static, curated). purchasingPowerIndex is an ESTIMATE 0-100.
// ---------------------------------------------------------------------------
export type CurrencyInfo = { code: string; symbol: string };

export type MarketProfile = {
  country: string;
  language: string;
  currency: CurrencyInfo;
  purchasingPowerIndex: number; // 0-100 ESTIMATE
  platforms: string[];
  legalFlags: string[];
  religionSensitive: boolean;
};

export const MARKETS: Record<string, MarketProfile> = {
  GB: {
    country: "United Kingdom",
    language: "English (British)",
    currency: { code: "GBP", symbol: "£" },
    purchasingPowerIndex: 82,
    platforms: ["Instagram", "TikTok", "Facebook", "YouTube"],
    legalFlags: ["ASA advertising standards", "UK GDPR consent required"],
    religionSensitive: false,
  },
  US: {
    country: "United States",
    language: "English (American)",
    currency: { code: "USD", symbol: "$" },
    purchasingPowerIndex: 88,
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook"],
    legalFlags: ["FTC endorsement disclosure", "CAN-SPAM for email"],
    religionSensitive: false,
  },
  FR: {
    country: "France",
    language: "French",
    currency: { code: "EUR", symbol: "€" },
    purchasingPowerIndex: 74,
    platforms: ["Instagram", "TikTok", "Facebook", "YouTube"],
    legalFlags: ["Loi Toubon (French-language ad rule)", "EU GDPR consent required"],
    religionSensitive: false,
  },
  NG: {
    country: "Nigeria",
    language: "English (Nigerian)",
    currency: { code: "NGN", symbol: "₦" },
    purchasingPowerIndex: 34,
    platforms: ["WhatsApp", "Instagram", "Facebook", "TikTok"],
    legalFlags: ["ARCON ad approval", "NDPR data consent"],
    religionSensitive: true,
  },
  CD: {
    country: "DR Congo",
    language: "French",
    currency: { code: "CDF", symbol: "FC" },
    purchasingPowerIndex: 21,
    platforms: ["WhatsApp", "Facebook", "TikTok"],
    legalFlags: ["Local advertising authority review", "Data consent recommended"],
    religionSensitive: true,
  },
  AE: {
    country: "United Arab Emirates",
    language: "Arabic",
    currency: { code: "AED", symbol: "د.إ" },
    purchasingPowerIndex: 79,
    platforms: ["Instagram", "TikTok", "Snapchat", "YouTube"],
    legalFlags: ["NMC media content approval", "Modesty & religious content rules"],
    religionSensitive: true,
  },
};

// ---------------------------------------------------------------------------
// Fixed FX rate table — units of local currency per 1 GBP. NO live FX, no Date.
// ---------------------------------------------------------------------------
export const FX_PER_GBP: Record<string, number> = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1980,
  CDF: 3550,
  AED: 4.66,
};

// ---------------------------------------------------------------------------
// localiseCampaign — transcreate a campaign for one target market.
// ---------------------------------------------------------------------------
export type LocaliseInput = {
  headline: string;
  body: string;
  priceGbp?: number;
  target: { country: string; language?: string; city?: string };
};

export type MediaPlan = { voiceover: string; subtitles: string; lipSync: string };

export type LocalisationResult = {
  target: { country: string; countryCode: string; language: string; city?: string };
  transcreationNotes: string[];
  currencyDisplay: string;
  culturalAdaptations: string[];
  legalFlags: string[];
  recommendedPlatforms: string[];
  mediaPlan: MediaPlan;
  disclaimer: string;
};

// Resolve a caller-supplied country (code or name) to a market profile.
function resolveMarket(country: string): { code: string; profile: MarketProfile } {
  const key = country.trim().toUpperCase();
  if (MARKETS[key]) return { code: key, profile: MARKETS[key] };
  const byName = Object.entries(MARKETS).find(
    ([, p]) => p.country.toUpperCase() === country.trim().toUpperCase()
  );
  if (byName) return { code: byName[0], profile: byName[1] };
  // Unknown market: neutral English fallback, flagged for human review.
  return {
    code: key || "XX",
    profile: {
      country: country.trim() || "Unknown",
      language: "English",
      currency: { code: "GBP", symbol: "£" },
      purchasingPowerIndex: 50,
      platforms: ["Instagram", "Facebook", "YouTube"],
      legalFlags: ["Market not in curated table — human legal review required"],
      religionSensitive: false,
    },
  };
}

// Round a converted price to a locally sensible precision (ESTIMATE display).
function formatPrice(symbol: string, code: string, amount: number): string {
  const rounded = amount >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  const withThousands = rounded.toLocaleString("en-GB");
  return `${symbol}${withThousands} ${code}`.trim();
}

export function localiseCampaign(input: LocaliseInput): LocalisationResult {
  const { code, profile } = resolveMarket(input.target.country);
  const language = input.target.language?.trim() || profile.language;
  const city = input.target.city?.trim();

  // Deterministic "creative variance" pick so notes differ per campaign
  // without ever being random. Purely cosmetic ordering of guidance.
  const variance = seed(`${input.headline}|${input.body}|${code}`);

  // --- Transcreation notes (adapt, do NOT literally translate) --------------
  const transcreationNotes: string[] = [
    `Transcreate the headline "${input.headline}" into ${language} — rebuild the hook around a local idiom, do not translate word-for-word.`,
    `Rewrite the body for ${profile.country} rhythm and register (${language}); preserve the promise, swap the metaphors for locally familiar ones.`,
    profile.religionSensitive
      ? `Religion-sensitive market: review humour and imagery for faith/modesty norms before adapting local humour.`
      : `Layer in local humour that lands in ${profile.country} — reference everyday local moments, not source-market in-jokes.`,
    `Cultural references: replace any source-market shorthand with ${profile.country} equivalents so it reads native, not imported.`,
  ];
  if (city) {
    transcreationNotes.push(
      `City targeting (${city}): add one hyper-local cue (neighbourhood, weather, local landmark) so ${city} viewers feel seen.`
    );
  }

  // --- Cultural adaptations (buying behaviour, platform, purchasing power) ---
  const ppi = profile.purchasingPowerIndex;
  const culturalAdaptations: string[] = [
    ppi < 45
      ? `Purchasing power ESTIMATE ${ppi}/100 — lead with value, instalments or entry-tier pricing; avoid luxury framing.`
      : `Purchasing power ESTIMATE ${ppi}/100 — premium framing is viable; emphasise quality and outcome.`,
    profile.platforms.includes("WhatsApp")
      ? `Buying behaviour: conversational commerce dominates — design a WhatsApp-first path to purchase.`
      : `Buying behaviour: feed-and-discovery dominates — design a scroll-stopping first 2 seconds.`,
    `Season & weather: schedule and dress the creative for ${profile.country}'s current-season context, not the source market's.`,
    (variance & 1) === 0
      ? `Local influencers: pair the launch with a mid-tier ${profile.country} creator for native credibility (ESTIMATE lift, verify).`
      : `Local holidays: align the flight with the nearest ${profile.country} holiday moment for relevance (verify calendar).`,
  ];

  // --- Currency display via FIXED rate table --------------------------------
  const rate = FX_PER_GBP[profile.currency.code] ?? 1;
  const currencyDisplay =
    typeof input.priceGbp === "number"
      ? formatPrice(profile.currency.symbol, profile.currency.code, input.priceGbp * rate)
      : `${profile.currency.symbol}— ${profile.currency.code} (no price supplied)`;

  // --- Media plan (voiceover / subtitles / lip-sync) ------------------------
  const mediaPlan: MediaPlan = {
    voiceover: `Cast a native ${language} voice with a ${profile.country} accent; direct for local cadence, not a translated read.`,
    subtitles: `Burn ${language} subtitles sized for mobile; keep on-screen text idiomatic (transcreated), matching the voiceover.`,
    lipSync: `Re-time lip-sync to the ${language} track; if AI dubbing is used, label the asset as AI-dubbed for transparency.`,
  };

  return {
    target: { country: profile.country, countryCode: code, language, city },
    transcreationNotes,
    currencyDisplay,
    culturalAdaptations,
    legalFlags: profile.legalFlags,
    recommendedPlatforms: profile.platforms,
    mediaPlan,
    disclaimer:
      "ESTIMATES only: adaptations and purchasing-power indices are recommendations, not guarantees. " +
      (profile.religionSensitive
        ? "Religion/legal-sensitive market — human review of faith, modesty and legal flags is required before publishing. "
        : "") +
      "Verify local holidays, legal flags and influencer claims before send. Marketing sends require consent and a frequency cap of max 5 touches per 7 days.",
  };
}

// ---------------------------------------------------------------------------
// Demo (zero-config) — localise a demo campaign for one non-English market.
// ---------------------------------------------------------------------------
export function demoLocalisation(): LocalisationResult {
  return localiseCampaign({
    headline: "Grow your business without breaking the bank",
    body: "Our all-in-one platform helps you win more customers, faster — no tech team needed.",
    priceGbp: 49,
    target: { country: "FR", city: "Lyon" },
  });
}
