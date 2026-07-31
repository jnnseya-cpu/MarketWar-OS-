// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Deep extraction — reading the page we were already holding.
//
// SiteRaid listed 21 things it could pull from a URL under the heading
// "Activate with a connector", directly beneath the words "Works on any URL".
// Both could not be true. The crawler had been fetching the real page and
// throwing almost all of it away: it counted images and discarded their sources,
// found JSON-LD and kept only the @type names.
//
// There is no connector. Nineteen of those twenty-one are in the HTML.
//
// THE LINE THIS FILE WILL NOT CROSS: extraction is reading, not guessing.
// "Audience" was on that list and is not extractable — you cannot read who a
// business sells to off its markup, you can only infer it from the copy, and an
// inference printed in a list headed "extracts" is a fabrication with good
// posture. It is returned as an explicit null with the reason, and the audit
// says so rather than quietly filling it from the meta description.
//
// The same rule sorts the rest. A price inside a schema.org Offer is DECLARED by
// the business; a "£49" found in prose is merely SEEN on the page, and the two
// are kept apart because only one of them is safe to quote back in an advert.

export type Extracted<T> = {
  values: T[];
  /** Where each value came from, so a customer can check it rather than trust it. */
  source: "structured-data" | "markup" | "stylesheet" | "text";
};

export type PriceFinding = { value: string; currency?: string; declared: boolean; context: string };
export type LinkFinding = { url: string; label: string };

export type SiteExtraction = {
  url: string;
  /** Business name, tagline and language as the page states them. */
  brand: { name: string; tagline: string; lang: string; siteName: string };
  products: Extracted<string>;
  services: Extracted<string>;
  pricing: PriceFinding[];
  images: LinkFinding[];
  videos: LinkFinding[];
  logos: string[];
  colours: string[];
  fonts: string[];
  ctas: string[];
  trustSignals: string[];
  reviews: { rating?: string; count?: string; source: string }[];
  faqs: { q: string; a: string }[];
  hierarchy: { level: number; text: string }[];
  navigation: LinkFinding[];
  offers: string[];
  blogLinks: LinkFinding[];
  contact: { emails: string[]; phones: string[]; address: string };
  socialLinks: LinkFinding[];
  /** Always null. Kept in the shape so nobody "fixes" it by inventing one. */
  audience: null;
  /** What we deliberately did not attempt, and why. Shown, never hidden. */
  notExtracted: { field: string; reason: string }[];
  /** Total distinct things found — the honest headline for the panel. */
  found: number;
};

const SOCIAL_HOSTS = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "youtube.com",
  "tiktok.com", "pinterest.com", "threads.net", "threads.com", "snapchat.com", "reddit.com",
  "whatsapp.com", "wa.me", "t.me", "telegram.me", "vimeo.com", "github.com", "medium.com",
];

// Analytics beacons served as <img>. A live crawl of a real site reported
// "Images (1)" and the one image was facebook.com/tr?id=…&ev=PageView — a 1×1
// counting pixel presented to the customer as their site's only picture, while
// the actual photography was lazy-loaded and invisible to us.
const PIXEL_HOSTS = /(facebook\.com\/tr|google-analytics\.com|googletagmanager\.com|doubleclick\.net|\/pixel|analytics|\.gif\?|linkedin\.com\/px|bat\.bing\.com|hotjar|segment\.io|matomo|plausible|clarity\.ms)/i;

export function isTrackingPixel(url: string, tag = ""): boolean {
  if (PIXEL_HOSTS.test(url)) return true;
  // Declared 1×1, or hidden — either way it is a beacon, not a picture.
  const w = Number(attrOf(tag, "width")), h = Number(attrOf(tag, "height"));
  if (w && h && w <= 2 && h <= 2) return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(tag)) return true;
  return false;
}

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com", "wistia", "loom.com", "dailymotion.com"];

// Words that make a link a call to action rather than navigation. Deliberately
// commercial: "About us" is navigation, "Get a quote" is a CTA.
const CTA_WORDS = /\b(buy|shop|order|book|reserve|get (?:a )?(?:quote|started|demo)|start(?: free)?|free trial|sign ?up|subscribe|enquire|inquire|contact us|request|apply|download|add to (?:cart|basket)|checkout|call now|claim)\b/i;

const TRUST_WORDS = /\b(money[- ]back|guarantee|guaranteed|certified|accredited|insured|iso ?\d+|gdpr|ssl secure|secure checkout|free (?:returns|delivery|shipping)|no obligation|cancel any ?time|award[- ]winning|trusted by|as seen (?:in|on)|\d+\+? years|since (?:19|20)\d\d)\b/i;

const OFFER_WORDS = /(?:\d+%\s*off|save \d+|half price|bogof|buy one get|limited time|ends \w+day|discount|free (?:trial|month|delivery|shipping|returns))/i;

const CURRENCY = /(?:[£$€¥]|\b(?:GBP|USD|EUR|CAD|AUD)\b)\s?\d[\d,]*(?:\.\d{2})?/g;

/** #abc → #aabbcc, so three- and six-digit forms of one colour are one colour. */
function expandHex(hex: string): string {
  const h = hex.replace("#", "");
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

/** How far from grey, 0–1. A brand colour has chroma; a border does not. */
function chromaOf(hex: string): number {
  const h = expandHex(hex).slice(1);
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The brand's colours first, the framework's greys last.
 *
 * A live crawl returned thirty colours of which the first six were #fff,
 * #e5e7eb, #9ca3af, #f1f5f9, #94a3b8 — Tailwind's default grey ramp, which every
 * site using Tailwind has and which says nothing about anyone's brand. The
 * customer's actual red was in there somewhere below the fold of the list.
 *
 * theme-color is honoured first when present: it is the one colour the site
 * explicitly nominated as its own.
 */
export function rankColours(raw: string[], cap: number, themeColour = ""): string[] {
  const seen = new Set<string>();
  const items: { value: string; chroma: number }[] = [];
  for (const c of raw) {
    const v = (c || "").trim().toLowerCase();
    if (!v) continue;
    const key = v.startsWith("#") ? expandHex(v) : v;
    if (seen.has(key)) continue;
    seen.add(key);
    // Fully transparent is a layout trick, not a colour.
    if (/rgba\([^)]*,\s*0\s*\)/.test(v)) continue;
    items.push({ value: v.startsWith("#") ? key : v, chroma: v.startsWith("#") ? chromaOf(v) : 0.5 });
  }
  const theme = themeColour ? expandHex(themeColour) : "";
  return items
    .sort((a, b) => {
      if (theme) {
        if (a.value === theme) return -1;
        if (b.value === theme) return 1;
      }
      return b.chroma - a.chroma;
    })
    .map((x) => x.value)
    .slice(0, cap);
}

/**
 * Font names a human would recognise.
 *
 * Next.js font optimisation emits CSS variables like `__Inter_f367f3` and
 * `__Inter_Fallback_f367f3`, and a live crawl reported those verbatim as the
 * brand's typefaces. The build hash is noise; the family name is the answer.
 */
export function cleanFonts(raw: string[], cap: number): string[] {
  const out: string[] = [];
  for (const f of raw) {
    let name = (f || "").trim();
    if (!name) continue;
    // __Inter_f367f3 / __JetBrains_Mono_Fallback_3c557b → Inter / JetBrains Mono
    const gen = /^__(.+?)(?:_Fallback)?_[0-9a-f]{4,}$/i.exec(name);
    if (gen) name = gen[1].replace(/_/g, " ");
    if (/^(inherit|initial|unset|revert)$/i.test(name) || name.startsWith("var(")) continue;
    // A stack always ends in a generic; it names no typeface anyone chose.
    if (/^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-(sans-serif|serif|monospace|rounded))$/i.test(name)) continue;
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
    if (out.length >= cap) break;
  }
  return out;
}

const dedupe = (xs: string[], cap: number) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, cap);
const decode = (s: string) =>
  (s || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ").trim();

const strip = (html: string) => decode(html.replace(/<[^>]+>/g, " "));

function absolute(href: string, base: string): string {
  const h = (href || "").trim();
  if (!h || /^(javascript:|#)/i.test(h)) return "";
  try { return new URL(h, base).toString(); } catch { return ""; }
}

const attrOf = (tag: string, name: string): string => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : "";
};

const metaOf = (html: string, key: string): string => {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, "i"));
  return m ? attrOf(m[0], "content") : "";
};

/** Every JSON-LD object on the page, flattened — @graph and arrays included. */
export function jsonLdObjects(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          if (o["@type"]) out.push(o);
          for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
        }
      };
      walk(JSON.parse(m[1].trim()));
    } catch { /* malformed — it would not parse for a search engine either */ }
  }
  return out;
}

const typeIs = (o: Record<string, unknown>, re: RegExp) => {
  const t = o["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === "string" && re.test(x));
};
const str = (v: unknown): string => (typeof v === "string" ? decode(v) : typeof v === "number" ? String(v) : "");

/**
 * Read one page.
 *
 * @param css Optional stylesheet text already fetched for this page. Colours and
 *            fonts mostly live there rather than in the HTML, and passing it in
 *            keeps this function pure — one thing that fetches, one that reads.
 */
export function extractPage(html: string, baseUrl: string, css = ""): SiteExtraction {
  const doc = html || "";
  const ld = jsonLdObjects(doc);

  // --- brand -------------------------------------------------------------
  const org = ld.find((o) => typeIs(o, /^(Organization|LocalBusiness|Corporation|Store|Restaurant|ProfessionalService)$/i));
  const siteName = metaOf(doc, "og:site_name");
  const title = decode(doc.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const brand = {
    name: str(org?.name) || siteName || title.split(/[|–—-]/)[0].trim(),
    tagline: metaOf(doc, "og:description") || metaOf(doc, "description"),
    lang: decode(doc.match(/<html[^>]+lang\s*=\s*["']([^"']+)["']/i)?.[1] || ""),
    siteName,
  };

  // --- products & services ----------------------------------------------
  const products = ld.filter((o) => typeIs(o, /^Product$/i)).map((o) => str(o.name)).filter(Boolean);
  const services = ld.filter((o) => typeIs(o, /^(Service|Offer)$/i)).map((o) => str(o.name) || str(o.description)).filter(Boolean);

  // --- pricing -----------------------------------------------------------
  //
  // A price the business DECLARED in structured data is quotable. A price merely
  // seen in prose might be a competitor's, a crossed-out "was" price, or part of
  // a sentence about someone else. Both are reported; they are never merged.
  const pricing: PriceFinding[] = [];
  // jsonLdObjects flattens @graph AND nested objects, so an Offer inside a
  // Product is yielded twice — once as the parent's `offers`, once on its own.
  // Keyed so the same price is not reported as two products.
  const declaredPrices = new Map<string, PriceFinding>();
  for (const o of ld) {
    const offer = typeIs(o, /^(Offer|AggregateOffer)$/i) ? o : (o.offers && typeof o.offers === "object" ? (o.offers as Record<string, unknown>) : null);
    if (!offer) continue;
    const price = str(offer.price) || str(offer.lowPrice);
    if (!price) continue;
    const currency = str(offer.priceCurrency) || undefined;
    const key = `${price}|${currency ?? ""}`;
    const named = str(o.name);
    const existing = declaredPrices.get(key);
    // Prefer the entry that knows WHAT is being priced.
    if (!existing || (named && existing.context === "structured data")) {
      declaredPrices.set(key, { value: price, currency, declared: true, context: named || "structured data" });
    }
  }
  pricing.push(...declaredPrices.values());
  const visible = doc.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ");
  const body = strip(visible);
  // One text run per block element. A phrase found here belongs to one piece of
  // the page rather than to whatever happened to sit within N characters of it.
  const blocks = visible
    .split(/<\/?(?:p|div|li|ul|ol|h[1-6]|section|article|header|footer|nav|aside|td|tr|table|form|button|a|span|br|figcaption|blockquote)\b[^>]*>/i)
    .map((b) => strip(b))
    .filter((b) => b.length > 2);
  for (const m of dedupe(body.match(CURRENCY) || [], 12)) {
    if (pricing.some((p) => p.value && m.includes(p.value))) continue;
    pricing.push({ value: m, declared: false, context: "seen in the page text" });
  }

  // --- media -------------------------------------------------------------
  const images: LinkFinding[] = [];
  for (const tag of doc.match(/<img\b[^>]*>/gi) || []) {
    const src = absolute(attrOf(tag, "src") || attrOf(tag, "data-src"), baseUrl);
    if (!src || isTrackingPixel(src, tag)) continue;
    images.push({ url: src, label: attrOf(tag, "alt") });
  }
  const videos: LinkFinding[] = [];
  for (const tag of doc.match(/<(?:iframe|video|source)\b[^>]*>/gi) || []) {
    const src = absolute(attrOf(tag, "src"), baseUrl);
    if (src && (VIDEO_HOSTS.some((h) => src.includes(h)) || /\.(mp4|webm|mov)(\?|$)/i.test(src))) {
      videos.push({ url: src, label: attrOf(tag, "title") });
    }
  }

  // --- logo --------------------------------------------------------------
  const logos = dedupe([
    str(org?.logo),
    typeof org?.logo === "object" && org.logo ? str((org.logo as Record<string, unknown>).url) : "",
    metaOf(doc, "og:image"),
    ...(doc.match(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/gi) || []).map((t) => attrOf(t, "href")),
    ...(doc.match(/<img\b[^>]*>/gi) || []).filter((t) => /logo/i.test(t)).map((t) => attrOf(t, "src")),
  ].map((u) => absolute(u, baseUrl)), 6);

  // --- colours & fonts (mostly in the stylesheet, not the markup) --------
  const styleText = `${css} ${(doc.match(/<style[\s\S]*?<\/style>/gi) || []).join(" ")} ${(doc.match(/style\s*=\s*"[^"]*"/gi) || []).join(" ")}`;
  const colours = rankColours(
    [
      metaOf(doc, "theme-color"),
      ...(styleText.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi) || []),
      ...(styleText.match(/rgba?\([^)]*\)/gi) || []),
    ].map((c) => c.toLowerCase()),
    16,
    metaOf(doc, "theme-color").toLowerCase(),
  );
  const fonts = cleanFonts([
    // The value nearly always starts with a quote — font-family:"Inter",sans-serif
    // — so a character class excluding quotes matched the empty string and found
    // no fonts on any site that quotes its font names, which is most of them.
    ...(styleText.match(/font-family\s*:\s*([^;}]+)/gi) || []).map((d) => d.replace(/font-family\s*:\s*/i, "")),
    ...(doc.match(/fonts\.googleapis\.com\/css2?\?[^"']+/gi) || []).map((u) => decodeURIComponent(u).replace(/.*family=/, "").split(/[&:]/)[0].replace(/\+/g, " ")),
  ].flatMap((f) => f.split(",")).map((f) => f.replace(/["']/g, "").trim()), 12);

  // --- links: CTAs, navigation, social, blog -----------------------------
  const ctas: string[] = [];
  const navigation: LinkFinding[] = [];
  const socialLinks: LinkFinding[] = [];
  const blogLinks: LinkFinding[] = [];
  let host = "";
  try { host = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch { /* keep empty */ }

  for (const tag of doc.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []) {
    const open = tag.match(/<a\b[^>]*>/i)?.[0] || "";
    const label = strip(tag.replace(/<a\b[^>]*>/i, "").replace(/<\/a>/i, "")) || attrOf(open, "aria-label");
    const url = absolute(attrOf(open, "href"), baseUrl);
    if (!url) continue;
    const social = SOCIAL_HOSTS.find((h) => url.includes(h));
    if (social && !url.includes(host)) { socialLinks.push({ url, label: label || social }); continue; }
    if (/\/(blog|news|articles?|insights|resources)(\/|$)/i.test(url) && url.includes(host)) blogLinks.push({ url, label });
    if (label && CTA_WORDS.test(label)) ctas.push(label);
    else if (label && url.includes(host)) navigation.push({ url, label });
  }
  for (const tag of doc.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || []) {
    const label = strip(tag.replace(/<button\b[^>]*>/i, "").replace(/<\/button>/i, ""));
    if (label && CTA_WORDS.test(label)) ctas.push(label);
  }

  // --- reviews, FAQs, trust ---------------------------------------------
  const reviews = ld
    .map((o) => (typeIs(o, /^AggregateRating$/i) ? o : (o.aggregateRating && typeof o.aggregateRating === "object" ? (o.aggregateRating as Record<string, unknown>) : null)))
    .filter((o): o is Record<string, unknown> => Boolean(o))
    .map((o) => ({ rating: str(o.ratingValue) || undefined, count: str(o.reviewCount) || str(o.ratingCount) || undefined, source: "structured data" }))
    .filter((r) => r.rating || r.count);

  const faqs: { q: string; a: string }[] = [];
  for (const o of ld.filter((x) => typeIs(x, /^Question$/i))) {
    const answer = o.acceptedAnswer && typeof o.acceptedAnswer === "object" ? str((o.acceptedAnswer as Record<string, unknown>).text) : "";
    const q = str(o.name);
    if (q) faqs.push({ q, a: answer });
  }
  for (const d of doc.match(/<details\b[\s\S]*?<\/details>/gi) || []) {
    const q = strip(d.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || "");
    if (q) faqs.push({ q, a: strip(d.replace(/<summary\b[\s\S]*?<\/summary>/i, "")).slice(0, 400) });
  }

  // Per BLOCK, not across the whole page.
  //
  // Matching "N characters either side" over one flattened string produced this
  // on a live site: an offer recorded as "struction intelligence Pricing About
  // us Deals Construction intelligence Get a quote Start free trial 20% off
  // until Friday" — the navigation, the H1 and the buttons swept in because
  // none of them contains a full stop to stop at. Block boundaries are the real
  // sentence boundaries in HTML.
  const trustSignals = dedupe(blocks.filter((b) => TRUST_WORDS.test(b)).map((b) => b.slice(0, 160)), 10);

  // --- structure ---------------------------------------------------------
  const hierarchy: { level: number; text: string }[] = [];
  for (const m of doc.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = strip(m[2]);
    if (text) hierarchy.push({ level: Number(m[1]), text: text.slice(0, 160) });
  }

  // A button reading "Start free trial" matches the offer vocabulary but is a
  // call to action, not a promotion. Counting it as both inflates the extract
  // count with the same string twice.
  const ctaSet = new Set(ctas.map((c) => c.toLowerCase()));
  const offers = dedupe(
    blocks.filter((b) => OFFER_WORDS.test(b) && !ctaSet.has(b.trim().toLowerCase())).map((b) => b.slice(0, 160)),
    8,
  );

  // --- contact -----------------------------------------------------------
  const address = org?.address && typeof org.address === "object"
    ? Object.entries(org.address as Record<string, unknown>)
        .filter(([k]) => !k.startsWith("@"))
        .map(([, v]) => str(v)).filter(Boolean).join(", ")
    : "";
  const contact = {
    emails: dedupe((doc.match(/mailto:([^"'?>\s]+)/gi) || []).map((m) => m.replace(/mailto:/i, "")), 6),
    phones: dedupe([...(doc.match(/tel:([^"'?>\s]+)/gi) || []).map((m) => m.replace(/tel:/i, "")), str(org?.telephone)], 6),
    address,
  };

  const notExtracted = [
    { field: "Audience", reason: "Who a business sells to is not written in its markup. It can only be inferred from the copy, and an inference listed as an extract is a fabrication with good posture. The Business DNA infers it separately and labels it as inferred." },
  ];
  if (!colours.length) notExtracted.push({ field: "Colours", reason: "No colours in the HTML or the stylesheet we read — they may be in an external CSS file we did not fetch, or set by JavaScript." });
  if (!logos.length) notExtracted.push({ field: "Logos", reason: "No og:image, icon link or image with 'logo' in its markup. Upload one in Brand Studio and every creative locks to it." });

  const found =
    products.length + services.length + pricing.length + images.length + videos.length + logos.length +
    colours.length + fonts.length + ctas.length + trustSignals.length + reviews.length + faqs.length +
    hierarchy.length + navigation.length + offers.length + blogLinks.length + socialLinks.length +
    contact.emails.length + contact.phones.length + (contact.address ? 1 : 0) + (brand.name ? 1 : 0);

  return {
    url: baseUrl,
    brand,
    products: { values: dedupe(products, 40), source: "structured-data" },
    services: { values: dedupe(services, 40), source: "structured-data" },
    pricing: pricing.slice(0, 20),
    images: images.slice(0, 60),
    videos: videos.slice(0, 20),
    logos,
    colours,
    fonts,
    ctas: dedupe(ctas, 20),
    trustSignals,
    reviews,
    faqs: faqs.slice(0, 25),
    hierarchy: hierarchy.slice(0, 60),
    navigation: navigation.slice(0, 40),
    offers,
    blogLinks: blogLinks.slice(0, 25),
    contact,
    socialLinks: socialLinks.slice(0, 15),
    audience: null,
    notExtracted,
    found,
  };
}

/** Merge extractions from several pages into one picture of the site. */
export function mergeExtractions(pages: SiteExtraction[]): SiteExtraction {
  const first = pages[0];
  if (!first) throw new Error("mergeExtractions needs at least one page");
  if (pages.length === 1) return first;

  const uniqBy = <T>(xs: T[], key: (x: T) => string, cap: number): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const x of xs) { const k = key(x); if (k && !seen.has(k)) { seen.add(k); out.push(x); } if (out.length >= cap) break; }
    return out;
  };
  const all = <T>(pick: (p: SiteExtraction) => T[]): T[] => pages.flatMap(pick);

  return {
    ...first,
    products: { values: dedupe(all((p) => p.products.values), 60), source: "structured-data" },
    services: { values: dedupe(all((p) => p.services.values), 60), source: "structured-data" },
    // Declared prices first: a merge must not let a stray number from a blog
    // post outrank the price the business actually published.
    pricing: uniqBy([...all((p) => p.pricing)].sort((a, b) => Number(b.declared) - Number(a.declared)), (x) => `${x.value}|${x.declared}`, 30),
    images: uniqBy(all((p) => p.images), (x) => x.url, 120),
    videos: uniqBy(all((p) => p.videos), (x) => x.url, 30),
    logos: dedupe(all((p) => p.logos), 8),
    colours: dedupe(all((p) => p.colours), 30),
    fonts: dedupe(all((p) => p.fonts), 15),
    ctas: dedupe(all((p) => p.ctas), 30),
    trustSignals: dedupe(all((p) => p.trustSignals), 15),
    reviews: uniqBy(all((p) => p.reviews), (x) => `${x.rating}|${x.count}`, 10),
    faqs: uniqBy(all((p) => p.faqs), (x) => x.q.toLowerCase(), 40),
    hierarchy: first.hierarchy,
    navigation: uniqBy(all((p) => p.navigation), (x) => x.url, 60),
    offers: dedupe(all((p) => p.offers), 12),
    blogLinks: uniqBy(all((p) => p.blogLinks), (x) => x.url, 40),
    contact: {
      emails: dedupe(all((p) => p.contact.emails), 8),
      phones: dedupe(all((p) => p.contact.phones), 8),
      address: pages.map((p) => p.contact.address).find(Boolean) || "",
    },
    socialLinks: uniqBy(all((p) => p.socialLinks), (x) => x.url, 20),
    audience: null,
    notExtracted: uniqBy(all((p) => p.notExtracted), (x) => x.field, 6),
    found: pages.reduce((n, p) => n + p.found, 0),
  };
}
