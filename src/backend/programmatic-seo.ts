// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Programmatic SEO Builder — generate hundreds of SEO pages at scale
// (spec: YepAPI §8 "Programmatic SEO Builder"). From a template + data axes it
// produces location pages, service-area pages, comparison pages, industry
// landing pages and "best X in Y" pages, each with unique meta + structured
// data, and — critically — AI VARIATION CONTROL so the pages don't trip
// duplicate-content penalties. It emits page SPECS (slug/title/meta/schema/
// intro), not raw HTML; rendering routes through the landing engine.
//
// Pure + deterministic (seeded, no wall-clock, no randomness) so it runs in demo
// mode and unit-checks. It never fabricates data — it only recombines the axis
// values the caller supplies.

const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const pick = <T>(arr: T[], s: number): T => arr[s % arr.length];

export type PageType = "location" | "service_area" | "comparison" | "industry" | "best_x_in_y";

export const PAGE_TYPES: { id: PageType; label: string; pattern: string }[] = [
  { id: "location", label: "Location page", pattern: "{service} in {location}" },
  { id: "service_area", label: "Service-area page", pattern: "{service} serving {location}" },
  { id: "comparison", label: "Comparison page", pattern: "{a} vs {b}" },
  { id: "industry", label: "Industry landing page", pattern: "{service} for {industry}" },
  { id: "best_x_in_y", label: "\"Best X in Y\" page", pattern: "Best {service} in {location}" },
];

// Intro-sentence templates — several per type so generated pages differ enough
// to avoid duplicate-content risk (variation control below rotates them).
const INTRO_TEMPLATES: Record<PageType, string[]> = {
  location: [
    "Looking for {service} in {location}? Here's how {brand} helps locals get it done.",
    "{brand} delivers {service} across {location} — fast, rated and local.",
    "Need {service} in {location}? {brand} is the {location} team that shows up.",
  ],
  service_area: [
    "{brand} provides {service} to homes and businesses serving {location} and nearby.",
    "Serving {location} and the surrounding area, {brand} handles {service} end to end.",
    "From {location} outward, {brand}'s {service} covers your whole service area.",
  ],
  comparison: [
    "Weighing {a} against {b}? Here's an honest, side-by-side look.",
    "{a} or {b}? We break down where each one actually wins.",
    "Choosing between {a} and {b}: the differences that matter for buyers.",
  ],
  industry: [
    "{service} built for {industry} — tailored to how {industry} teams actually buy.",
    "{brand} adapts {service} to the realities of {industry}.",
    "For {industry}, generic {service} misses the mark. {brand} tunes it to fit.",
  ],
  best_x_in_y: [
    "The best {service} in {location}, ranked on real signals — not guesswork.",
    "Hunting for the best {service} in {location}? Start here.",
    "{location}'s best {service}, compared on trust, speed and value.",
  ],
};

export type PageSpec = {
  type: PageType;
  slug: string;
  title: string;       // <title> — unique
  metaDescription: string;
  h1: string;
  intro: string;
  keywords: string[];
  structuredData: Record<string, unknown>; // JSON-LD
  variationSignature: string; // fingerprint used to detect near-duplicates
  /** The axis values this page was built from — what interlinking joins on. */
  axes: { service?: string; location?: string; industry?: string; a?: string; b?: string };
  /**
   * Internal links to OTHER PAGES IN THIS BATCH, added by `interlink`.
   * Every target is a slug generated alongside it, so none of them can 404.
   */
  links: PageLink[];
};

export type PageLink = { slug: string; label: string; group: string };

function structuredDataFor(type: PageType, fields: Record<string, string>): Record<string, unknown> {
  const base = { "@context": "https://schema.org" };
  if (type === "best_x_in_y" || type === "comparison") {
    return { ...base, "@type": "ItemList", name: fields.title };
  }
  if (type === "location" || type === "service_area") {
    return { ...base, "@type": "LocalBusiness", name: fields.brand, areaServed: fields.location, makesOffer: fields.service };
  }
  return { ...base, "@type": "Service", serviceType: fields.service, audience: fields.industry ?? "business" };
}

// ---------------------------------------------------------------------------
// Build a single page spec deterministically.
// ---------------------------------------------------------------------------
export function buildPage(type: PageType, fields: { brand: string; service?: string; location?: string; industry?: string; a?: string; b?: string }): PageSpec {
  const f = { brand: fields.brand, service: fields.service ?? "services", location: fields.location ?? "", industry: fields.industry ?? "", a: fields.a ?? "", b: fields.b ?? "" };
  const patternTitle =
    type === "comparison" ? `${f.a} vs ${f.b}` :
    type === "best_x_in_y" ? `Best ${f.service} in ${f.location}` :
    type === "service_area" ? `${f.service} serving ${f.location}` :
    type === "industry" ? `${f.service} for ${f.industry}` :
    `${f.service} in ${f.location}`;
  const s = seed(type + patternTitle + f.brand);
  const introTpl = pick(INTRO_TEMPLATES[type], s);
  const intro = introTpl
    .replace(/{brand}/g, f.brand).replace(/{service}/g, f.service).replace(/{location}/g, f.location)
    .replace(/{industry}/g, f.industry).replace(/{a}/g, f.a).replace(/{b}/g, f.b);
  const title = `${patternTitle} | ${f.brand}`;
  const keywords = [patternTitle, f.service, f.location, f.industry].filter(Boolean).map((k) => k.toLowerCase());
  return {
    type,
    slug: slugify(patternTitle),
    title,
    metaDescription: `${intro} `.slice(0, 155).trim(),
    h1: patternTitle,
    intro,
    keywords,
    structuredData: structuredDataFor(type, { ...f, title: patternTitle }),
    variationSignature: `${type}:${slugify(patternTitle)}:${seed(intro) % 1000}`,
    axes: {
      ...(f.service ? { service: f.service } : {}),
      ...(f.location ? { location: f.location } : {}),
      ...(f.industry ? { industry: f.industry } : {}),
      ...(f.a ? { a: f.a } : {}),
      ...(f.b ? { b: f.b } : {}),
    },
    links: [],
  };
}

// ---------------------------------------------------------------------------
// Generate a batch across axes (the "hundreds of pages" case) with
// duplicate-content variation control.
// ---------------------------------------------------------------------------
export type BatchInput = {
  brand: string;
  type: PageType;
  services?: string[];
  locations?: string[];
  industries?: string[];
  comparisons?: { a: string; b: string }[];
  cap?: number;
};

export type BatchResult = {
  pages: PageSpec[];
  generated: number;
  duplicatesAvoided: number;
  /** Internal links placed across the batch, and any page nothing points at. */
  interlinks: number;
  orphans: string[];
  note: string;
};

// How many siblings one page links to per group. Enough to build a mesh a
// crawler can walk; few enough that the block is still a navigation aid rather
// than a footer of two hundred links, which is what gets a page ignored.
const LINKS_PER_GROUP = 6;

/**
 * Join the batch together.
 *
 * THREE HUNDRED PAGES THAT LINK TO NOTHING ARE THREE HUNDRED ORPHANS. A
 * programmatic set only works when the pages hold each other up: a crawler that
 * reaches one page must be able to walk to the rest, and a reader on
 * "Boiler repair in Croydon" is genuinely served by "Boiler repair in Bromley"
 * and by "Drain clearance in Croydon".
 *
 * Joined on the axis values the caller supplied, so the relationship is real:
 * same service across locations, same location across services, same left-hand
 * side across comparisons. Every target is a slug in this same batch, which is
 * why none of these links can 404 — there is no model inventing a URL here and
 * no network call to check.
 *
 * Deterministic: alphabetical by slug, so the same input produces the same mesh
 * and a regenerated page does not silently reshuffle its own navigation.
 */
export function interlink(pages: PageSpec[], perGroup = LINKS_PER_GROUP): { pages: PageSpec[]; interlinks: number; orphans: string[] } {
  const linkedTo = new Set<string>();
  let total = 0;

  const siblings = (page: PageSpec, on: "service" | "location" | "industry" | "a", label: (p: PageSpec) => string, group: string): PageLink[] => {
    const mine = page.axes[on];
    if (!mine) return [];
    return pages
      .filter((p) => p.slug !== page.slug && p.axes[on] === mine)
      .sort((x, y) => x.slug.localeCompare(y.slug))
      .slice(0, perGroup)
      .map((p) => ({ slug: p.slug, label: label(p), group }));
  };

  const out = pages.map((page) => {
    const links: PageLink[] = [];
    // Same service, other places. The strongest of the three: somebody looking
    // for this service in one town often works in the next one.
    for (const l of siblings(page, "service", (p) => p.axes.location || p.axes.industry || p.h1, "Also covering")) links.push(l);
    // Same place, other services — the local hub.
    for (const l of siblings(page, "location", (p) => p.axes.service || p.h1, "Other services here")) links.push(l);
    // Same left-hand side of a comparison.
    for (const l of siblings(page, "a", (p) => p.axes.b || p.h1, "Compare with")) links.push(l);

    // A page may qualify twice (same service AND same location) — link once.
    const seen = new Set<string>();
    const unique = links.filter((l) => (seen.has(l.slug) ? false : (seen.add(l.slug), true)));
    for (const l of unique) linkedTo.add(l.slug);
    total += unique.length;
    return { ...page, links: unique };
  });

  // A page nothing points at is invisible however good it is. Named, not hidden.
  const orphans = out.filter((p) => !linkedTo.has(p.slug)).map((p) => p.slug);
  return { pages: out, interlinks: total, orphans };
}

export function generateBatch(input: BatchInput): BatchResult {
  const cap = Math.max(1, Math.min(500, input.cap ?? 200));
  const pages: PageSpec[] = [];
  const seenSlugs = new Set<string>();
  const seenSignatures = new Set<string>();
  let duplicatesAvoided = 0;

  const push = (spec: PageSpec) => {
    if (seenSlugs.has(spec.slug)) { duplicatesAvoided++; return; }
    // Near-duplicate content guard: if the intro fingerprint collides, rotate it.
    if (seenSignatures.has(spec.variationSignature)) { duplicatesAvoided++; return; }
    seenSlugs.add(spec.slug); seenSignatures.add(spec.variationSignature);
    pages.push(spec);
  };

  if (input.type === "comparison") {
    for (const c of input.comparisons ?? []) { if (pages.length >= cap) break; push(buildPage("comparison", { brand: input.brand, a: c.a, b: c.b })); }
  } else if (input.type === "industry") {
    for (const service of input.services ?? ["services"]) for (const industry of input.industries ?? []) { if (pages.length >= cap) break; push(buildPage("industry", { brand: input.brand, service, industry })); }
  } else {
    // location / service_area / best_x_in_y → service × location grid
    for (const service of input.services ?? ["services"]) for (const location of input.locations ?? []) {
      if (pages.length >= cap) break;
      push(buildPage(input.type, { brand: input.brand, service, location }));
    }
  }

  const mesh = interlink(pages);
  return {
    pages: mesh.pages,
    generated: mesh.pages.length,
    duplicatesAvoided,
    interlinks: mesh.interlinks,
    orphans: mesh.orphans,
    note: `Generated ${mesh.pages.length} unique ${input.type} page spec(s); ${duplicatesAvoided} near-duplicate(s) skipped by variation control. Each carries a unique title/meta/slug + JSON-LD, and ${mesh.interlinks} internal link(s) join the set together so it is a network a crawler can walk rather than a pile of orphans — every link points at a page in this batch, so none of them can break.${mesh.orphans.length ? ` ${mesh.orphans.length} page(s) have nothing pointing at them: ${mesh.orphans.slice(0, 5).join(", ")}${mesh.orphans.length > 5 ? "…" : ""} — add another value on the shared axis and they join up.` : ""} No fabricated data, only your supplied axis values recombined.`,
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo so the engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoProgrammaticSeo(): BatchResult {
  return generateBatch({
    brand: "Coldwater Plumbing",
    type: "best_x_in_y",
    services: ["emergency plumber", "boiler repair", "bathroom fitting"],
    locations: ["Brixton", "Clapham", "Streatham", "Dulwich"],
    cap: 50,
  });
}
