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
