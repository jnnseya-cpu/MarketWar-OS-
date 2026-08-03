// Where a business actually sells — and what that makes of its numbers.
//
// A brand carried one field for this: `location: string`, free text, used as a
// hint in prompts. Nothing in the platform could answer "is this traffic from
// somewhere I sell to", so nothing did.
//
// THE PROBLEM THAT MAKES THIS WORTH BUILDING. A customer's Search Console shows
// impressions climbing. Most of them are from Pakistan. They sell in the UK.
// The headline number went up, the business did not, and the platform reported
// the rise as a win — because impressions are impressions and nobody asked
// where they came from. That is not a small reporting nicety: it is a metric
// that moves in the opposite direction to reality, and a customer who trusts it
// will keep making the content that produced it.
//
// So a market is a first-class thing here, with tiers:
//
//   primary   — where the money is. The number that matters is this one.
//   secondary — worth having, worth reporting separately, not the headline.
//   (absent)  — everywhere else. Not "bad traffic"; just not the market, and
//               never counted in a figure the customer will act on.
//
// TIERS ARE THE CUSTOMER'S TO SET, NOT OURS. There is no built-in list of
// "important" countries and there is not going to be one — which countries
// matter is a fact about a particular business, and any ranking we shipped
// would be an opinion applied to every customer who never asked for it. The
// presets below are conveniences with plain names, and every one of them is
// editable.

export type CountryCode = string; // ISO 3166-1 alpha-2, upper case

export type MarketTier = "primary" | "secondary";

export type TargetCountry = { code: CountryCode; tier: MarketTier };

export type TargetMarket = {
  countries: TargetCountry[];
  /**
   * Cities or regions, free text, for a business whose market is smaller than a
   * country — a restaurant does not sell to "the UK", it sells to Croydon.
   * Matched case-insensitively against whatever a data source calls a place,
   * because no two sources name cities the same way.
   */
  cities: string[];
};

export const EMPTY_MARKET: TargetMarket = { countries: [], cities: [] };

// ---------------------------------------------------------------------------
// Country resolution.
//
// The single most important function here, because every data source spells
// countries differently and a mismatch silently reads as "out of market":
//   • Search Console returns lower-case ISO alpha-3 — "gbr", "pak", "usa".
//   • Ad platforms return alpha-2 — "GB", "PK".
//   • Humans type "UK", "England", "Britain", "United States", "America".
// Getting any of those wrong would tell a UK business that none of its traffic
// is from its own country.
// ---------------------------------------------------------------------------

type Entry = { code: CountryCode; a3: string; name: string; aliases?: string[] };

const COUNTRIES: Entry[] = [
  { code: "GB", a3: "GBR", name: "United Kingdom", aliases: ["uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland"] },
  { code: "IE", a3: "IRL", name: "Ireland", aliases: ["eire", "republic of ireland"] },
  { code: "US", a3: "USA", name: "United States", aliases: ["usa", "u.s.", "u.s.a.", "america", "united states of america"] },
  { code: "CA", a3: "CAN", name: "Canada" },
  { code: "AU", a3: "AUS", name: "Australia" },
  { code: "NZ", a3: "NZL", name: "New Zealand" },
  { code: "DE", a3: "DEU", name: "Germany", aliases: ["deutschland"] },
  { code: "FR", a3: "FRA", name: "France" },
  { code: "ES", a3: "ESP", name: "Spain", aliases: ["españa"] },
  { code: "IT", a3: "ITA", name: "Italy", aliases: ["italia"] },
  { code: "NL", a3: "NLD", name: "Netherlands", aliases: ["holland", "the netherlands"] },
  { code: "BE", a3: "BEL", name: "Belgium" },
  { code: "PT", a3: "PRT", name: "Portugal" },
  { code: "SE", a3: "SWE", name: "Sweden" },
  { code: "NO", a3: "NOR", name: "Norway" },
  { code: "DK", a3: "DNK", name: "Denmark" },
  { code: "FI", a3: "FIN", name: "Finland" },
  { code: "PL", a3: "POL", name: "Poland" },
  { code: "CH", a3: "CHE", name: "Switzerland" },
  { code: "AT", a3: "AUT", name: "Austria" },
  { code: "AE", a3: "ARE", name: "United Arab Emirates", aliases: ["uae", "dubai"] },
  { code: "SA", a3: "SAU", name: "Saudi Arabia" },
  { code: "QA", a3: "QAT", name: "Qatar" },
  { code: "ZA", a3: "ZAF", name: "South Africa" },
  { code: "NG", a3: "NGA", name: "Nigeria" },
  { code: "KE", a3: "KEN", name: "Kenya" },
  { code: "GH", a3: "GHA", name: "Ghana" },
  { code: "EG", a3: "EGY", name: "Egypt" },
  { code: "IN", a3: "IND", name: "India" },
  { code: "PK", a3: "PAK", name: "Pakistan" },
  { code: "BD", a3: "BGD", name: "Bangladesh" },
  { code: "PH", a3: "PHL", name: "Philippines" },
  { code: "ID", a3: "IDN", name: "Indonesia" },
  { code: "MY", a3: "MYS", name: "Malaysia" },
  { code: "SG", a3: "SGP", name: "Singapore" },
  { code: "HK", a3: "HKG", name: "Hong Kong" },
  { code: "JP", a3: "JPN", name: "Japan" },
  { code: "KR", a3: "KOR", name: "South Korea", aliases: ["korea"] },
  { code: "CN", a3: "CHN", name: "China" },
  { code: "VN", a3: "VNM", name: "Vietnam" },
  { code: "TH", a3: "THA", name: "Thailand" },
  { code: "TR", a3: "TUR", name: "Turkey", aliases: ["türkiye", "turkiye"] },
  { code: "BR", a3: "BRA", name: "Brazil", aliases: ["brasil"] },
  { code: "MX", a3: "MEX", name: "Mexico" },
  { code: "AR", a3: "ARG", name: "Argentina" },
  { code: "CL", a3: "CHL", name: "Chile" },
  { code: "CO", a3: "COL", name: "Colombia" },
  { code: "RO", a3: "ROU", name: "Romania" },
  { code: "CZ", a3: "CZE", name: "Czechia", aliases: ["czech republic"] },
  { code: "GR", a3: "GRC", name: "Greece" },
  { code: "IL", a3: "ISR", name: "Israel" },
  { code: "UA", a3: "UKR", name: "Ukraine" },
  { code: "RU", a3: "RUS", name: "Russia" },
];

const BY_A2 = new Map(COUNTRIES.map((c) => [c.code, c]));
const BY_A3 = new Map(COUNTRIES.map((c) => [c.a3, c]));
const BY_TEXT = (() => {
  const m = new Map<string, Entry>();
  for (const c of COUNTRIES) {
    m.set(c.name.toLowerCase(), c);
    for (const a of c.aliases ?? []) m.set(a, c);
  }
  return m;
})();

/** Every country this build can name, for a picker. Sorted by name. */
export function knownCountries(): { code: CountryCode; name: string }[] {
  return COUNTRIES.map((c) => ({ code: c.code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Anything that might be a country → an ISO alpha-2 code, or "".
 *
 * Returns "" rather than guessing. A wrong code is worse than none: it would
 * quietly move traffic into or out of the market and change a number the
 * customer acts on, with nothing on screen to suggest anything happened.
 */
export function normaliseCountry(input: string | null | undefined): CountryCode {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.length === 2 && BY_A2.has(upper)) return upper;
  if (upper.length === 3 && BY_A3.has(upper)) return BY_A3.get(upper)!.code;
  const hit = BY_TEXT.get(raw.toLowerCase().replace(/\s+/g, " "));
  return hit ? hit.code : "";
}

/** The display name for a code, or the code itself if we do not know it. */
export function countryName(code: CountryCode): string {
  return BY_A2.get(String(code).toUpperCase())?.name ?? String(code).toUpperCase();
}

// ---------------------------------------------------------------------------
// Presets — conveniences, never a judgement about which countries matter.
// ---------------------------------------------------------------------------

export type MarketPreset = { id: string; label: string; build: () => TargetMarket };

const mk = (primary: CountryCode[], secondary: CountryCode[] = []): TargetMarket => ({
  countries: [
    ...primary.map((code) => ({ code, tier: "primary" as MarketTier })),
    ...secondary.map((code) => ({ code, tier: "secondary" as MarketTier })),
  ],
  cities: [],
});

export const MARKET_PRESETS: MarketPreset[] = [
  { id: "uk", label: "United Kingdom only", build: () => mk(["GB"]) },
  { id: "uk-ie", label: "UK & Ireland", build: () => mk(["GB", "IE"]) },
  { id: "uk-then-english", label: "UK first, English-speaking second", build: () => mk(["GB"], ["IE", "US", "CA", "AU", "NZ"]) },
  { id: "us", label: "United States only", build: () => mk(["US"]) },
  { id: "us-ca", label: "US & Canada", build: () => mk(["US", "CA"]) },
  { id: "western-europe", label: "Western Europe", build: () => mk(["GB", "IE", "DE", "FR", "ES", "IT", "NL", "BE", "PT", "SE", "DK", "NO", "FI", "CH", "AT"]) },
  { id: "gcc", label: "Gulf (UAE, Saudi, Qatar)", build: () => mk(["AE", "SA", "QA"]) },
];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Which tier a country falls in, or null when it is outside the market. */
export function tierOf(country: string, market: TargetMarket | null | undefined): MarketTier | null {
  const code = normaliseCountry(country);
  if (!code || !market?.countries.length) return null;
  return market.countries.find((c) => c.code === code)?.tier ?? null;
}

/** Has this brand said where it sells? Everything downstream branches on this. */
export function marketDefined(market: TargetMarket | null | undefined): boolean {
  return Boolean(market && (market.countries.length > 0 || market.cities.length > 0));
}

/** A one-line description, for prompts and for screens. */
export function describeMarket(market: TargetMarket | null | undefined): string {
  if (!marketDefined(market)) return "";
  const primary = market!.countries.filter((c) => c.tier === "primary").map((c) => countryName(c.code));
  const secondary = market!.countries.filter((c) => c.tier === "secondary").map((c) => countryName(c.code));
  const parts: string[] = [];
  if (market!.cities.length) parts.push(market!.cities.join(", "));
  if (primary.length) parts.push(primary.join(", "));
  if (secondary.length) parts.push(`and secondarily ${secondary.join(", ")}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// The analysis this exists for.
// ---------------------------------------------------------------------------

export type GeoRow = {
  /** Whatever the source called the place — alpha-2, alpha-3 or a name. */
  country: string;
  /** The measure being split. Impressions, clicks, sessions, leads — any of them. */
  value: number;
  /** A second measure carried alongside, so clicks can ride with impressions. */
  secondary?: number;
};

export type MarketFit = {
  /** Total across every row, in and out. The number that used to be the headline. */
  total: number;
  /** In the primary tier. The number that should be the headline. */
  primary: number;
  secondary: number;
  /** Outside the market entirely. */
  outside: number;
  /** Rows whose country we could not resolve — counted separately, never as "outside". */
  unknown: number;
  /** 0–100. How much of the measure is in the market at all. */
  inMarketPct: number;
  /** Biggest out-of-market sources, largest first — the expansion-or-noise list. */
  topOutside: { code: CountryCode; name: string; value: number; pct: number }[];
  /** The sentence to put on screen instead of the raw total. */
  headline: string;
  note: string;
};

/**
 * Split a measure by whether it came from the market the business sells to.
 *
 * Unknown countries get their own bucket. Folding them into "outside" would
 * overstate the problem, and folding them into "in market" would hide it —
 * both are ways of being confidently wrong about a number the customer is
 * about to act on.
 */
export function marketFit(rows: GeoRow[], market: TargetMarket | null | undefined, label = "impressions"): MarketFit {
  const total = rows.reduce((n, r) => n + Math.max(0, r.value || 0), 0);
  const empty: MarketFit = {
    total, primary: 0, secondary: 0, outside: 0, unknown: 0, inMarketPct: 0, topOutside: [],
    headline: "", note: "",
  };

  if (!marketDefined(market)) {
    return {
      ...empty,
      headline: `${fmt(total)} ${label} — but no target market is set, so there is no way to say how much of it is worth having.`,
      note: "Set where this business actually sells and this number splits into the part that matters and the part that does not. Until then it is a total, not a result.",
    };
  }
  if (!rows.length) {
    return { ...empty, headline: `No ${label} to split by country yet.`, note: "Connect Search Console, or run a report with a country breakdown." };
  }

  let primary = 0, secondary = 0, outside = 0, unknown = 0;
  const outsideBy = new Map<CountryCode, number>();

  for (const r of rows) {
    const v = Math.max(0, r.value || 0);
    const code = normaliseCountry(r.country);
    if (!code) { unknown += v; continue; }
    const tier = tierOf(code, market);
    if (tier === "primary") primary += v;
    else if (tier === "secondary") secondary += v;
    else {
      outside += v;
      outsideBy.set(code, (outsideBy.get(code) ?? 0) + v);
    }
  }

  const inMarket = primary + secondary;
  const inMarketPct = total > 0 ? Math.round((inMarket / total) * 100) : 0;
  const topOutside = [...outsideBy.entries()]
    .map(([code, value]) => ({ code, name: countryName(code), value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const biggest = topOutside[0];
  const headline = outside > total * 0.3 && biggest
    // The case that started this: the total is up and the business is not.
    ? `${fmt(primary)} ${label} from your main market — not ${fmt(total)}. ${Math.round((outside / total) * 100)}% comes from outside where you sell, ${biggest.pct}% of it from ${biggest.name} alone.`
    : `${fmt(primary)} ${label} from your main market${secondary ? `, ${fmt(secondary)} from secondary markets` : ""} — ${inMarketPct}% of ${fmt(total)} total.`;

  return {
    total, primary, secondary, outside, unknown, inMarketPct, topOutside, headline,
    note: [
      outside > 0
        ? `Out-of-market ${label} are not counted in the headline. They are not necessarily worthless — a country that keeps appearing may be a market worth entering — but they must never be added to a number you use to judge whether the work is paying off.`
        : `Everything measured came from inside your market.`,
      unknown > 0 ? `${fmt(unknown)} ${label} came from a country we could not identify and are excluded from both sides rather than guessed into one.` : "",
    ].filter(Boolean).join(" "),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

/**
 * A geo qualifier to append to a search or a prompt.
 *
 * Cities first: "plumber in Croydon" returns a different and far more useful
 * set than "plumber in the United Kingdom". Empty when no market is set, so a
 * caller concatenating it never produces a dangling "in ".
 */
export function geoQualifier(market: TargetMarket | null | undefined): string {
  if (!marketDefined(market)) return "";
  if (market!.cities.length) return market!.cities.slice(0, 3).join(", ");
  const primary = market!.countries.filter((c) => c.tier === "primary").map((c) => countryName(c.code));
  return primary.slice(0, 3).join(", ");
}

// ---------------------------------------------------------------------------
// What a market implies: a clock, a currency, a spelling, an ad-targeting spec.
//
// These four are what the remaining modules were each solving badly on their
// own — or, in one case, with a hash. `bestSendTime` in engagement.ts was
// `hours[seed(sent + ":" + delivered) % hours.length]`: the recommended hour to
// email a list, picked from a checksum of that list's own delivery counts. A
// customer schedules a campaign on it.
//
// The honest version needs no model and no guess. A UK list should be emailed
// at nine in the morning IN LONDON, and what that is in UTC depends on the date
// because of daylight saving. Intl knows; we ask it.
// ---------------------------------------------------------------------------

type Locale = {
  /** IANA zone for the country's main commercial centre. */
  tz: string;
  /** True where the country spans several zones, so one clock is a simplification. */
  multiZone?: boolean;
  /** BCP-47, for content adaptation. */
  locale: string;
  currency: string;
  /** Which English a reader expects. Silent on countries that do not use it. */
  spelling?: "en-GB" | "en-US";
};

const LOCALES: Record<CountryCode, Locale> = {
  GB: { tz: "Europe/London", locale: "en-GB", currency: "GBP", spelling: "en-GB" },
  IE: { tz: "Europe/Dublin", locale: "en-IE", currency: "EUR", spelling: "en-GB" },
  US: { tz: "America/New_York", multiZone: true, locale: "en-US", currency: "USD", spelling: "en-US" },
  CA: { tz: "America/Toronto", multiZone: true, locale: "en-CA", currency: "CAD", spelling: "en-US" },
  AU: { tz: "Australia/Sydney", multiZone: true, locale: "en-AU", currency: "AUD", spelling: "en-GB" },
  NZ: { tz: "Pacific/Auckland", locale: "en-NZ", currency: "NZD", spelling: "en-GB" },
  DE: { tz: "Europe/Berlin", locale: "de-DE", currency: "EUR" },
  FR: { tz: "Europe/Paris", locale: "fr-FR", currency: "EUR" },
  ES: { tz: "Europe/Madrid", locale: "es-ES", currency: "EUR" },
  IT: { tz: "Europe/Rome", locale: "it-IT", currency: "EUR" },
  NL: { tz: "Europe/Amsterdam", locale: "nl-NL", currency: "EUR" },
  BE: { tz: "Europe/Brussels", locale: "nl-BE", currency: "EUR" },
  PT: { tz: "Europe/Lisbon", locale: "pt-PT", currency: "EUR" },
  SE: { tz: "Europe/Stockholm", locale: "sv-SE", currency: "SEK" },
  NO: { tz: "Europe/Oslo", locale: "nb-NO", currency: "NOK" },
  DK: { tz: "Europe/Copenhagen", locale: "da-DK", currency: "DKK" },
  FI: { tz: "Europe/Helsinki", locale: "fi-FI", currency: "EUR" },
  PL: { tz: "Europe/Warsaw", locale: "pl-PL", currency: "PLN" },
  CH: { tz: "Europe/Zurich", locale: "de-CH", currency: "CHF" },
  AT: { tz: "Europe/Vienna", locale: "de-AT", currency: "EUR" },
  AE: { tz: "Asia/Dubai", locale: "ar-AE", currency: "AED" },
  SA: { tz: "Asia/Riyadh", locale: "ar-SA", currency: "SAR" },
  QA: { tz: "Asia/Qatar", locale: "ar-QA", currency: "QAR" },
  ZA: { tz: "Africa/Johannesburg", locale: "en-ZA", currency: "ZAR", spelling: "en-GB" },
  NG: { tz: "Africa/Lagos", locale: "en-NG", currency: "NGN", spelling: "en-GB" },
  KE: { tz: "Africa/Nairobi", locale: "en-KE", currency: "KES", spelling: "en-GB" },
  GH: { tz: "Africa/Accra", locale: "en-GH", currency: "GHS", spelling: "en-GB" },
  EG: { tz: "Africa/Cairo", locale: "ar-EG", currency: "EGP" },
  IN: { tz: "Asia/Kolkata", locale: "en-IN", currency: "INR", spelling: "en-GB" },
  PK: { tz: "Asia/Karachi", locale: "en-PK", currency: "PKR", spelling: "en-GB" },
  BD: { tz: "Asia/Dhaka", locale: "bn-BD", currency: "BDT" },
  PH: { tz: "Asia/Manila", locale: "en-PH", currency: "PHP", spelling: "en-US" },
  ID: { tz: "Asia/Jakarta", multiZone: true, locale: "id-ID", currency: "IDR" },
  MY: { tz: "Asia/Kuala_Lumpur", locale: "ms-MY", currency: "MYR" },
  SG: { tz: "Asia/Singapore", locale: "en-SG", currency: "SGD", spelling: "en-GB" },
  HK: { tz: "Asia/Hong_Kong", locale: "zh-HK", currency: "HKD" },
  JP: { tz: "Asia/Tokyo", locale: "ja-JP", currency: "JPY" },
  KR: { tz: "Asia/Seoul", locale: "ko-KR", currency: "KRW" },
  CN: { tz: "Asia/Shanghai", locale: "zh-CN", currency: "CNY" },
  VN: { tz: "Asia/Ho_Chi_Minh", locale: "vi-VN", currency: "VND" },
  TH: { tz: "Asia/Bangkok", locale: "th-TH", currency: "THB" },
  TR: { tz: "Europe/Istanbul", locale: "tr-TR", currency: "TRY" },
  BR: { tz: "America/Sao_Paulo", multiZone: true, locale: "pt-BR", currency: "BRL" },
  MX: { tz: "America/Mexico_City", multiZone: true, locale: "es-MX", currency: "MXN" },
  AR: { tz: "America/Argentina/Buenos_Aires", locale: "es-AR", currency: "ARS" },
  CL: { tz: "America/Santiago", locale: "es-CL", currency: "CLP" },
  CO: { tz: "America/Bogota", locale: "es-CO", currency: "COP" },
  RO: { tz: "Europe/Bucharest", locale: "ro-RO", currency: "RON" },
  CZ: { tz: "Europe/Prague", locale: "cs-CZ", currency: "CZK" },
  GR: { tz: "Europe/Athens", locale: "el-GR", currency: "EUR" },
  IL: { tz: "Asia/Jerusalem", locale: "he-IL", currency: "ILS" },
  UA: { tz: "Europe/Kyiv", locale: "uk-UA", currency: "UAH" },
  RU: { tz: "Europe/Moscow", multiZone: true, locale: "ru-RU", currency: "RUB" },
};

export function localeFor(code: CountryCode): Locale | null {
  return LOCALES[String(code).toUpperCase()] ?? null;
}

/**
 * A zone's offset from UTC, in minutes, at a given instant.
 *
 * Read out of Intl rather than a table, because the answer changes twice a
 * year. London is UTC+0 in January and UTC+1 in July; a table would send the
 * summer campaign an hour early for six months and nobody would connect the
 * two.
 */
export function offsetMinutesAt(tz: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
    // What the wall clock in that zone reads, treated as if it were UTC. The
    // gap between that and the real instant IS the offset.
    const asUtc = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) === 24 ? 0 : Number(p.hour), Number(p.minute), Number(p.second),
    );
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0; // an unknown zone is UTC rather than an exception mid-campaign
  }
}

export type SendWindow = {
  code: CountryCode;
  country: string;
  tz: string;
  /** The local hour asked for, e.g. 9. */
  localHour: number;
  /** That hour expressed in UTC on the date given — what a scheduler needs. */
  utcHour: number;
  utcMinute: number;
  /** True where the country spans zones and one clock cannot serve all of it. */
  multiZone: boolean;
  note: string;
};

/**
 * When to send, per primary market, for a given local hour.
 *
 * A list in one country has one right answer and it is not a hash. A list
 * across several has several, which is why this returns one window per country
 * rather than a single time pretending to suit everyone.
 */
export function sendWindows(
  market: TargetMarket | null | undefined,
  localHour = 9,
  onDate: Date = new Date(),
): { windows: SendWindow[]; note: string } {
  if (!marketDefined(market)) {
    return {
      windows: [],
      note: "No send time can be recommended: nobody has said where this list is. Set a target market and the right local hour becomes arithmetic rather than a guess.",
    };
  }
  const hour = Math.max(0, Math.min(23, Math.round(localHour)));
  const primaries = market!.countries.filter((c) => c.tier === "primary");
  const use = primaries.length ? primaries : market!.countries;

  const windows = use.map(({ code }) => {
    const loc = localeFor(code);
    const tz = loc?.tz ?? "UTC";
    const offset = offsetMinutesAt(tz, onDate);
    const totalUtcMinutes = ((hour * 60 - offset) % 1440 + 1440) % 1440;
    return {
      code, country: countryName(code), tz, localHour: hour,
      utcHour: Math.floor(totalUtcMinutes / 60),
      utcMinute: totalUtcMinutes % 60,
      multiZone: Boolean(loc?.multiZone),
      note: loc?.multiZone
        ? `${countryName(code)} spans several time zones; this is ${tz}, so the rest of the country receives it earlier or later.`
        : `${String(hour).padStart(2, "0")}:00 in ${tz}.`,
    };
  });

  return {
    windows,
    note: windows.length > 1
      ? `${windows.length} send windows, one per main market — a single time cannot be ${String(hour).padStart(2, "0")}:00 in all of them. Schedule per country, or pick the market that matters most.`
      : windows[0]?.note ?? "",
  };
}

// ---------------------------------------------------------------------------
// Ad targeting — the block a customer pastes into Meta or Google Ads.
// ---------------------------------------------------------------------------

export type AdTargeting = {
  includeCountries: { code: CountryCode; name: string; tier: MarketTier }[];
  includeCities: string[];
  /** Locales worth running separate creative for. */
  locales: string[];
  currencies: string[];
  note: string;
};

/**
 * Where the money should be spent, and where it should not.
 *
 * The exclusion side matters as much as the inclusion side: an unrestricted
 * campaign is how a UK business ends up paying for impressions in the countries
 * that already dominate its organic numbers for the same reason — cheap
 * inventory, no intent.
 */
export function adTargeting(market: TargetMarket | null | undefined): AdTargeting {
  if (!marketDefined(market)) {
    return {
      includeCountries: [], includeCities: [], locales: [], currencies: [],
      note: "No targeting can be written: nobody has said where this business sells. An ad set with no geography spends wherever impressions are cheapest, which is rarely where the customers are.",
    };
  }
  const includeCountries = market!.countries.map((c) => ({ code: c.code, name: countryName(c.code), tier: c.tier }));
  const locales = [...new Set(includeCountries.map((c) => localeFor(c.code)?.locale).filter(Boolean) as string[])];
  const currencies = [...new Set(includeCountries.map((c) => localeFor(c.code)?.currency).filter(Boolean) as string[])];
  const cities = market!.cities;

  return {
    includeCountries, includeCities: cities, locales, currencies,
    note: [
      cities.length
        ? `Target ${cities.join(", ")} specifically — a city radius beats a whole country for a business that serves one.`
        : `Target ${includeCountries.filter((c) => c.tier === "primary").map((c) => c.name).join(", ") || "your main market"} and exclude everywhere else.`,
      locales.length > 1 ? `${locales.length} locales here (${locales.join(", ")}) — separate ad sets, or one of them carries copy written for somewhere else.` : "",
      currencies.length > 1 ? `Prices appear in ${currencies.join(", ")}; a single hardcoded currency will be wrong for someone.` : "",
      "Everywhere outside this list should be excluded rather than left unset: an open campaign buys the cheapest impressions available, which is not the same as the most valuable.",
    ].filter(Boolean).join(" "),
  };
}

// ---------------------------------------------------------------------------
// Content localisation
// ---------------------------------------------------------------------------

export type LocalisationTarget = {
  code: CountryCode;
  country: string;
  locale: string;
  currency: string;
  spelling: "en-GB" | "en-US" | null;
  tier: MarketTier;
};

/** Which locales content should actually be adapted for, from the market. */
export function localisationTargets(market: TargetMarket | null | undefined): {
  targets: LocalisationTarget[];
  /** True when the market mixes British and American spelling expectations. */
  spellingSplit: boolean;
  note: string;
} {
  if (!marketDefined(market)) {
    return { targets: [], spellingSplit: false, note: "No localisation targets: set the countries this business sells to and the locales, currencies and spelling follow from them." };
  }
  const targets = market!.countries.map((c) => {
    const loc = localeFor(c.code);
    return {
      code: c.code, country: countryName(c.code), tier: c.tier,
      locale: loc?.locale ?? "", currency: loc?.currency ?? "",
      spelling: loc?.spelling ?? null,
    };
  });
  const spellings = new Set(targets.map((t) => t.spelling).filter(Boolean));
  const spellingSplit = spellings.size > 1;
  return {
    targets, spellingSplit,
    note: spellingSplit
      // The cheapest localisation mistake to make and the easiest to avoid.
      ? "This market mixes British and American spelling. One article cannot be written in both, and 'optimise' in front of a US reader reads as a typo exactly as 'optimize' does to a British one — write the main market's spelling and adapt, rather than splitting the difference into something that looks wrong everywhere."
      : targets.length > 1
        ? `${targets.length} locales to adapt for: ${targets.map((t) => t.locale).filter(Boolean).join(", ")}.`
        : `One locale: ${targets[0]?.locale || targets[0]?.country}.`,
  };
}

/** A region hint for a news or trend search, from the market. */
export function trendRegion(market: TargetMarket | null | undefined): { query: string; locale: string; note: string } {
  if (!marketDefined(market)) {
    return { query: "", locale: "", note: "Trends are searched globally: no market is set, so a story trending somewhere this business does not sell counts the same as one at home." };
  }
  const primary = market!.countries.filter((c) => c.tier === "primary");
  const first = primary[0] ?? market!.countries[0];
  const where = market!.cities.length ? market!.cities[0] : countryName(first.code);
  return {
    query: where,
    locale: localeFor(first.code)?.locale ?? "",
    note: `Trends searched for ${where}. A story breaking somewhere this business does not sell is not an opportunity for it, however large it is elsewhere.`,
  };
}
