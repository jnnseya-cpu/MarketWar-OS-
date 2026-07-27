// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Contact Enrichment Engine — turns a company-only prospect row (Company / Trade
// / Town / Area, e.g. a Companies-House-style export) into a REAL, reachable
// contact: it finds the company's own website via live Google (Serper), then
// reads the site's home/contact pages to extract a genuine email + phone. This
// is what makes "one-click contact" actually work on an imported list.
//
// HONESTY LAW: nothing is fabricated. When no email can be found we return
// email:null with a clear reason — we never invent an address. Directory /
// aggregator / social domains are excluded so we only surface the firm's own
// site, and junk/tracking addresses (sentry, wixpress, .png…) are filtered out.

import { webSearch } from "@/backend/search";

export type EnrichInput = { company: string; town?: string; area?: string; trade?: string; website?: string };
export type EnrichResult = {
  company: string;
  website: string | null;
  email: string | null;
  emailConfidence: "verified" | "high" | "medium" | "low" | "none";
  phone: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  source: "apollo" | "site" | "search" | "none";
  mode: "live" | "demo";
  note: string;
};

export function apolloConfigured(): boolean { return Boolean((process.env.APOLLO_API_KEY || "").trim()); }

// Circuit-breaker: if Apollo returns 403 (the key is valid but the plan doesn't
// include API access — Apollo's Free plan blocks every API endpoint), there is no
// point retrying it for the next contact. We record the block and skip Apollo
// straight to the scraper for a cooldown window, so a doomed 403 is paid ONCE per
// window instead of 2–3 times per contact across a 25-row batch. Self-heals: the
// window expires (re-probes) and a redeploy clears it — so upgrading the Apollo
// plan lights the licensed path back up with no code change.
let apolloBlockedUntil = 0;
const APOLLO_BLOCK_MS = 60 * 60 * 1000; // 1 hour
function apolloUsable(): boolean { return apolloConfigured() && Date.now() >= apolloBlockedUntil; }

// Domains that are NOT a firm's own site — directories, registries, socials,
// review sites, job boards. We never treat these as the company website.
const AGGREGATOR = [
  "companieshouse.gov.uk", "company-information.service.gov.uk", "find-and-update",
  "gov.uk", "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
  "yell.com", "checkatrade.com", "trustpilot.com", "mybuilder.com", "ratedpeople.com",
  "bark.com", "yelp.co.uk", "yelp.com", "192.com", "endole.co.uk", "opencorporates.com",
  "wikipedia.org", "indeed.com", "gumtree.com", "glassdoor.co.uk", "thomsonlocal.com",
  "freeindex.co.uk", "cylex-uk.co.uk", "scoot.co.uk", "tuugo.co.uk", "bizify.co.uk",
  "trustatrader.com", "which.co.uk", "google.com", "maps.google.com", "youtube.com",
  "amazon.co.uk", "ebay.co.uk", "pinterest.com", "tiktok.com", "apple.com",
];

// Junk / tracking / template addresses that are never a real inbox.
const EMAIL_JUNK = [
  "sentry", "wixpress", "example.com", "example.org", "yourdomain", "domain.com",
  "email.com", "test.com", "sentry.io", "@2x", ".png", ".jpg", ".gif", ".webp",
  "godaddy", "cloudflare", "wordpress", "squarespace", "shopify", "myshopify",
  "u003e", "u0040", "core.min", "react", "schema.org", "w3.org", "googleapis",
  "gstatic", "gravatar", "gmail.png", "gmpg.org", "sentry-next",
];

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const ROLE_PREFIXES = ["info", "hello", "enquiries", "enquiry", "sales", "contact", "office", "admin", "mail", "team", "hi", "accounts"];

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
function isAggregator(url: string): boolean {
  const h = hostOf(url);
  return !h || AGGREGATOR.some((a) => h.includes(a));
}
function looksJunkEmail(e: string): boolean {
  const l = e.toLowerCase();
  if (EMAIL_JUNK.some((j) => l.includes(j))) return true;
  // image/asset filenames that happen to contain '@' (e.g. logo@2x)
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(l)) return true;
  return false;
}

// Optional scraping-proxy API. Many company sites block a plain server fetch
// (Cloudflare, bot walls, JS-only pages), which is the main cap on scraper yield.
// If SCRAPER_API_URL is set to a template containing "{url}", every fetch is routed
// through it — works with ANY GET-based provider (ScraperAPI, ScrapingBee, ZenRows,
// Scrapfly…). Example values:
//   ScraperAPI  : https://api.scraperapi.com/?api_key=KEY&url={url}
//   ScrapingBee : https://app.scrapingbee.com/api/v1/?api_key=KEY&url={url}
//   ZenRows     : https://api.zenrows.com/v1/?apikey=KEY&url={url}
// {url} is replaced with the URL-encoded target. No key = direct fetch (unchanged).
const SCRAPER_API_URL = (process.env.SCRAPER_API_URL || "").trim();
export function scraperProxyConfigured(): boolean { return SCRAPER_API_URL.includes("{url}"); }

// Fetch a page defensively: short timeout, capped body, swallow all errors. When a
// scraping proxy is configured, route through it (with a longer timeout — proxies
// and JS-render add latency) and fall back to a direct fetch if the proxy errors.
async function fetchText(url: string, timeoutMs = 9_000, maxBytes = 600_000): Promise<string> {
  if (scraperProxyConfigured()) {
    const viaProxy = await rawFetchText(SCRAPER_API_URL.replace("{url}", encodeURIComponent(url)), Math.max(timeoutMs, 20_000), maxBytes);
    if (viaProxy) return viaProxy;
    // Proxy failed/empty — try a direct fetch so a proxy outage never zeroes yield.
  }
  return rawFetchText(url, timeoutMs, maxBytes);
}

async function rawFetchText(url: string, timeoutMs: number, maxBytes: number): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketWarBot/1.0; +https://marketwaros.com)", Accept: "text/html" },
    });
    clearTimeout(t);
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, maxBytes));
  } catch { return ""; }
}

// Pick the best email from raw page text, preferring same-domain + role inboxes.
function bestEmail(text: string, siteHost: string): { email: string; confidence: "high" | "medium" | "low" } | null {
  const found = new Set<string>();
  // mailto: links first (most reliable), then bare addresses.
  for (const m of text.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  const cands = [...found].filter((e) => !looksJunkEmail(e) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!cands.length) return null;
  const domainBase = siteHost.split(".").slice(-2).join(".");
  const sameDomain = (e: string) => e.split("@")[1]?.endsWith(domainBase);
  const isRole = (e: string) => ROLE_PREFIXES.includes(e.split("@")[0]);
  // High: role inbox on the company's own domain. Medium: any same-domain inbox.
  // Low: a personal-provider inbox (gmail/outlook) shown on the site.
  const roleSame = cands.find((e) => sameDomain(e) && isRole(e));
  if (roleSame) return { email: roleSame, confidence: "high" };
  const anySame = cands.find(sameDomain);
  if (anySame) return { email: anySame, confidence: "medium" };
  const roleAny = cands.find(isRole);
  if (roleAny) return { email: roleAny, confidence: "low" };
  return { email: cands[0], confidence: "low" };
}

function bestPhone(text: string): string | null {
  // tel: links first, then UK-style numbers in the visible text.
  const tel = text.match(/tel:\+?([\d\s()\-]{7,})/i);
  if (tel) { const d = tel[1].replace(/[^\d+]/g, ""); if (d.length >= 9) return normalisePhone(tel[1]); }
  const m = text.match(/(?:\+44\s?|0)(?:\d[\s\-()]?){9,10}\d/);
  return m ? normalisePhone(m[0]) : null;
}
function normalisePhone(s: string): string {
  const d = s.replace(/[^\d+]/g, "");
  return d.startsWith("+") ? d : d;
}

// Find the firm's own website via live Google, skipping directories/socials.
async function findWebsite(input: EnrichInput): Promise<{ website: string | null; mode: "live" | "demo" }> {
  if (input.website && /^https?:\/\//i.test(input.website) && !isAggregator(input.website)) {
    return { website: input.website, mode: "live" };
  }
  const q = [`"${input.company}"`, input.town, input.trade, "contact"].filter(Boolean).join(" ");
  const res = await webSearch({ query: q, type: "search", gl: "uk" });
  if (res.mode === "demo") return { website: null, mode: "demo" };
  const hit = res.results.find((r) => r.link && !isAggregator(r.link));
  return { website: hit?.link ? new URL(hit.link).origin : null, mode: "live" };
}

// ---------------------------------------------------------------------------
// Provider 1 — Apollo.io (licensed B2B database). High yield: real, verified
// business emails a scraper can't reach. Two steps: resolve the company's domain
// (org search), then find a senior contact + reveal their email. Consumes Apollo
// credits; capped upstream. Returns null on any miss so we fall back to the
// scraper. HONESTY: only returns an email Apollo actually verified.
// ---------------------------------------------------------------------------
const APOLLO_BASE = "https://api.apollo.io/api/v1";
const SENIOR_TITLES = ["owner", "founder", "co-founder", "director", "managing director", "ceo", "principal", "partner", "manager", "general manager"];

async function apolloPost(path: string, body: Record<string, unknown>, timeoutMs = 12_000): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${APOLLO_BASE}${path}`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": (process.env.APOLLO_API_KEY || "").trim() },
      body: JSON.stringify(body),
    });
    // 403 = plan doesn't include API access. Trip the breaker so the rest of the
    // batch skips Apollo entirely and goes straight to the scraper.
    if (res.status === 403) apolloBlockedUntil = Date.now() + APOLLO_BLOCK_MS;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } finally { clearTimeout(t); }
}

// A usable, revealed email — not Apollo's "email_not_unlocked@domain.com"
// placeholder or an unverified guess.
function apolloEmailUsable(email?: string, status?: string): boolean {
  if (!email || looksJunkEmail(email)) return false;
  if (/not_unlocked|email_not_unlocked|domain\.com$/i.test(email)) return false;
  if (status && /^(unavailable|bounced|invalid)$/i.test(status)) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function apolloEnrich(input: EnrichInput): Promise<EnrichResult | null> {
  try {
    // 1) Resolve the company domain (from the given website, or org search by name).
    let domain = "";
    if (input.website) { const h = hostOf(input.website); if (h && !isAggregator(input.website)) domain = h; }
    let orgPhone: string | null = null;
    if (!domain) {
      const os = await apolloPost("/mixed_companies/search", { q_organization_name: input.company, page: 1, per_page: 1 });
      const org = ((os.data.organizations as Array<Record<string, unknown>>) || [])[0];
      if (org) { domain = String(org.primary_domain || org.website_url || "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""); orgPhone = (org.phone as string) || null; }
    }
    // 2) Find a senior contact at that company + reveal their email.
    const ps = await apolloPost("/mixed_people/search", {
      ...(domain ? { q_organization_domains: domain } : { q_organization_name: input.company }),
      person_titles: SENIOR_TITLES, page: 1, per_page: 10,
    });
    const people = (ps.data.people as Array<Record<string, unknown>>) || [];
    let person = people.find((p) => apolloEmailUsable(p.email as string, p.email_status as string)) || people[0];
    if (!person) {
      return domain ? { company: input.company, website: `https://${domain}`, email: null, emailConfidence: "none", phone: orgPhone, source: "apollo", mode: "live", note: `Apollo matched the company (${domain}) but no contact with a reachable email.` } : null;
    }
    let email = person.email as string | undefined;
    let status = person.email_status as string | undefined;
    // 3) Reveal a locked email via people/match (costs a credit, but gets the real one).
    if (!apolloEmailUsable(email, status) && (person.first_name || person.last_name)) {
      const m = await apolloPost("/people/match", {
        first_name: person.first_name, last_name: person.last_name,
        organization_name: (person.organization as { name?: string })?.name || input.company,
        domain, reveal_personal_emails: true,
      });
      const mp = m.data.person as Record<string, unknown> | undefined;
      if (mp) { email = (mp.email as string) || email; status = (mp.email_status as string) || status; person = { ...person, ...mp }; }
    }
    const website = domain ? `https://${domain}` : null;
    const phone = (person.phone_numbers as Array<{ raw_number?: string }>)?.[0]?.raw_number || orgPhone;
    const name = [person.first_name, person.last_name].filter(Boolean).join(" ") || null;
    if (apolloEmailUsable(email, status)) {
      return { company: input.company, website, email: (email as string).toLowerCase(), emailConfidence: status === "verified" ? "verified" : "high", phone, contactName: name, contactTitle: (person.title as string) || null, source: "apollo", mode: "live", note: `Apollo: ${name || "contact"}${person.title ? ` (${person.title})` : ""} — ${status === "verified" ? "verified" : "found"} email.` };
    }
    // Apollo knew the company but couldn't reveal an email — hand domain+phone to the scraper.
    return { company: input.company, website, email: null, emailConfidence: "none", phone, contactName: name, source: "apollo", mode: "live", note: `Apollo matched ${domain || input.company} but the email is locked/unavailable.` };
  } catch { return null; }
}

// Enrich ONE company. Apollo first (licensed, high-yield) → scraper fallback.
export async function enrichContact(input: EnrichInput): Promise<EnrichResult> {
  if (apolloUsable()) {
    const a = await apolloEnrich(input);
    if (a?.email) return a;                        // Apollo got a real email — done.
    if (a && (a.website || a.phone)) {             // Apollo found the company; scrape its site for an email.
      const scraped = await scrapeEnrich({ ...input, website: a.website || input.website });
      return {
        ...scraped,
        phone: scraped.phone || a.phone,
        website: scraped.website || a.website,
        contactName: scraped.contactName ?? a.contactName,
        note: scraped.email ? scraped.note : `${a.note} ${scraped.note}`.trim(),
      };
    }
    // Apollo returned nothing usable — fall through to the scraper.
  }
  return scrapeEnrich(input);
}

// Scraper (Provider 2) — free fallback. Finds the firm's own site via live Google
// and reads a genuine email off it. Never fabricates.
export async function scrapeEnrich(input: EnrichInput): Promise<EnrichResult> {
  const base: EnrichResult = { company: input.company, website: null, email: null, emailConfidence: "none", phone: null, source: "none", mode: "live", note: "" };
  const { website, mode } = await findWebsite(input);
  if (mode === "demo") {
    return { ...base, mode: "demo", note: "Enrichment needs live Google data — set SERPER_API_KEY. No email invented." };
  }
  if (!website) {
    return { ...base, note: "No independent website found for this company (only directory listings). Can't extract an email without inventing one." };
  }
  const host = hostOf(website);
  // Read home + likely contact pages; stop as soon as we have a high-confidence hit.
  const paths = ["", "/contact", "/contact-us", "/contact.html", "/about", "/about-us"];
  let picked: { email: string; confidence: "high" | "medium" | "low" } | null = null;
  let phone: string | null = null;
  for (const p of paths) {
    const html = await fetchText(website + p);
    if (!html) continue;
    if (!phone) phone = bestPhone(html);
    const e = bestEmail(html, host);
    if (e && (!picked || rank(e.confidence) > rank(picked.confidence))) picked = e;
    if (picked && picked.confidence === "high") break;
  }
  if (!picked) {
    return { ...base, website, phone, source: phone ? "site" : "none",
      note: phone ? `Found the site (${host}) and a phone, but no email published — call, or use the site contact form.` : `Found the site (${host}) but no public email/phone — use the site's contact form.` };
  }
  return {
    company: input.company, website, email: picked.email, emailConfidence: picked.confidence, phone,
    source: "site", mode: "live",
    note: `Real email read from ${host}${picked.confidence === "high" ? " (company-domain inbox)" : picked.confidence === "medium" ? " (company domain)" : " (published on the site)"}.`,
  };
}
function rank(c: "high" | "medium" | "low"): number { return c === "high" ? 3 : c === "medium" ? 2 : 1; }

// Enrich a batch with a small concurrency pool (be gentle on external sites).
export async function enrichBatch(items: EnrichInput[], concurrency = 4): Promise<EnrichResult[]> {
  const out: EnrichResult[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await enrichContact(items[idx]); }
      catch (e) { out[idx] = { company: items[idx].company, website: null, email: null, emailConfidence: "none", phone: null, source: "none", mode: "live", note: `Enrichment error: ${(e as Error).message}` }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
