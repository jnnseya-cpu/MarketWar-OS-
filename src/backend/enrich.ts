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
  /**
   * WHERE this row stopped. Without it, "1 email out of 2,100" is unactionable:
   * it could be an exhausted search quota, companies with no website, websites
   * with no published address, or an over-strict ownership rule — four totally
   * different fixes that look identical in a bare count.
   */
  stage?: "found" | "search_unavailable" | "no_own_site" | "site_no_email" | "email_rejected";
  /** Set when the search provider refused (quota/key), as opposed to no key at all. */
  providerError?: string;
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

// Local parts that are a template rather than a person. "john.doe@" is what a
// directory site puts in its own example markup — it is nobody's inbox.
const PLACEHOLDER_LOCALS = [
  "john.doe", "johndoe", "jane.doe", "janedoe", "first.last", "firstname", "lastname",
  "yourname", "youremail", "your.email", "name.surname", "someone", "user", "username",
  "email", "test", "demo", "placeholder",
];

// Free/consumer mail providers. A trade business genuinely using one of these is
// normal — but the address only counts when we have INDEPENDENTLY confirmed the
// site belongs to that company, because a directory page shows other people's
// gmail addresses too.
const PERSONAL_PROVIDERS = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com",
  "live.co.uk", "live.com", "yahoo.com", "yahoo.co.uk", "aol.com", "icloud.com",
  "btinternet.com", "virginmedia.com", "sky.com", "talktalk.net", "me.com", "msn.com",
  "protonmail.com", "proton.me", "mail.com", "ymail.com", "blueyonder.co.uk",
];

// Words that appear in half of all UK trade company names and therefore prove
// nothing about whether a domain belongs to a particular firm.
const NAME_STOPWORDS = new Set([
  "ltd", "limited", "llp", "plc", "cic", "co", "company", "group", "holdings",
  "the", "and", "of", "for", "uk", "gb", "england", "london", "manchester", "birmingham",
  "services", "service", "solutions", "solution", "contractors", "contracting",
  "international", "national", "nationwide", "trading", "enterprise", "enterprises",
]);

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
  if (PLACEHOLDER_LOCALS.includes(l.split("@")[0])) return true;
  return false;
}

export function isPersonalProvider(email: string): boolean {
  const d = (email.split("@")[1] || "").toLowerCase();
  return PERSONAL_PROVIDERS.includes(d);
}

// ---------------------------------------------------------------------------
// Domain ownership — the check that decides whether an email is this company's.
//
// A blocklist of directory sites can never win: there are thousands of them, and
// a new one appears every week. Blocklisting is why one batch attached
// support@rooplex.co.uk to four unrelated builders and john.doe@vat-search.co.uk
// to three more — Google's top hit for a small firm is usually a company-data
// site, that site was not on the list, so it was accepted as "their own website"
// and its own support inbox was scraped off it.
//
// So the test is POSITIVE instead: the domain must plausibly belong to the
// company whose name we searched. AFR STUDIO LIMITED → afrstudioltd.com passes.
// BUILD WITH US GROUP LTD → rooplex.co.uk does not. This is cheap, needs no
// list maintenance, and fails closed — a firm we cannot confirm is reported as
// "no email found", which is the honest answer.
// ---------------------------------------------------------------------------

/** The parts of a company name that actually identify it. */
export function companyTokens(company: string): string[] {
  const raw = (company || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const distinctive = raw.filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
  // A name made entirely of stopwords ("THE UK GROUP LTD") still has to be
  // matchable on something, so fall back to every word.
  return distinctive.length ? distinctive : raw.filter((t) => t.length >= 2);
}

/**
 * The company name with everything but letters and digits removed, and the legal
 * suffix dropped: "K&D FIX LTD" → "kdfix".
 *
 * Small firms very often register a long formal name and buy a short domain made
 * of its initials — NWDP SERVICES LTD → nwdp.co.uk, K&D FIX LTD → kdfix.co.uk.
 * Word-by-word matching cannot see those (the only word long enough to count is
 * "fix"), so checking the squashed name as a prefix is what keeps real firms
 * from being thrown away by the ownership gate.
 */
export function compactName(company: string): string {
  return (company || "")
    .toLowerCase()
    .replace(/\b(limited|ltd|plc|llp|cic|co|company)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

/** The registrable label of a host — "adlmechanicalservices" from adlmechanicalservices.co.uk. */
export function domainLabel(host: string): string {
  const h = (host || "").replace(/^www\./, "").toLowerCase();
  const parts = h.split(".").filter(Boolean);
  if (!parts.length) return "";
  // Strip the public suffix: .co.uk / .org.uk / .com etc.
  const drop = parts.length >= 3 && ["co", "org", "ltd", "plc", "me", "net", "gov", "ac"].includes(parts[parts.length - 2]) ? 2 : 1;
  return parts.slice(0, Math.max(1, parts.length - drop)).join("").replace(/[^a-z0-9]/g, "");
}

/**
 * Does `host` plausibly belong to `company`?
 *
 * Requires real overlap, not a coincidental three-letter word: the matched
 * tokens together must be at least 5 characters, or the domain must be the
 * company's initials.
 */
export function domainMatchesCompany(company: string, host: string): boolean {
  const label = domainLabel(host);
  if (!label) return false;
  const tokens = companyTokens(company);
  if (!tokens.length) return false;

  // Squashed-name match, which catches the abbreviations word matching misses:
  // NWDP SERVICES LTD → nwdp.co.uk, SANTA DAMPPROOFING… → santadamp.co.uk.
  // Four characters minimum, so a two-letter label cannot match everything.
  const compact = compactName(company);
  if (label.length >= 4 && compact.length >= 4) {
    if (compact.startsWith(label) || label.startsWith(compact)) return true;
  }

  const matched = tokens.filter((t) => label.includes(t));
  // Two distinctive words in common is ownership. One is only enough when it is
  // long AND dominates the domain — otherwise "TRADE" in "tradeservicesuk" would
  // hand one lead-gen directory to every trade company on the list.
  if (matched.length >= 2) return true;
  if (matched.length === 1) {
    const t = matched[0];
    if (t.length >= 6 && t.length / label.length >= 0.5) return true;
  }

  // Acronym firms: "N D Z ELECTRICAL" → ndzelectrical, or plain "ndz".
  const initials = companyTokens(company).map((t) => t[0]).join("");
  const allInitials = (company || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).map((t) => t[0]).join("");
  if (initials.length >= 3 && (label === initials || label.startsWith(initials))) return true;
  if (allInitials.length >= 3 && (label === allInitials || label.startsWith(allInitials))) return true;

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

// Pick the best email from raw page text.
//
// `siteHost` has ALREADY been confirmed to belong to this company by the caller.
// Even so, a company's own page carries other people's addresses — the web
// designer's, a supplier's, an embedded widget's. Only two kinds are accepted:
//
//   • an inbox on the company's own domain, and
//   • a consumer-provider inbox (gmail, btinternet…) published on that page,
//     which is how a large share of small trade firms actually take enquiries.
//
// A third-party COMPANY address is refused. That single rule is what stops
// support@rooplex.co.uk being sold to a builder as their own contact: the old
// code fell through to "any role inbox, else the first address on the page",
// which on a directory listing is always the directory's own inbox.
function bestEmail(text: string, siteHost: string): { email: string; confidence: "high" | "medium" | "low" } | null {
  const found = new Set<string>();
  // mailto: links first (most reliable), then bare addresses.
  for (const m of text.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  const cands = [...found].filter((e) => !looksJunkEmail(e) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!cands.length) return null;
  const domainBase = siteHost.split(".").slice(-2).join(".");
  const sameDomain = (e: string) => Boolean(e.split("@")[1]?.endsWith(domainBase));
  const isRole = (e: string) => ROLE_PREFIXES.includes(e.split("@")[0]);

  // High: role inbox on the company's own domain. Medium: any same-domain inbox.
  const roleSame = cands.find((e) => sameDomain(e) && isRole(e));
  if (roleSame) return { email: roleSame, confidence: "high" };
  const anySame = cands.find(sameDomain);
  if (anySame) return { email: anySame, confidence: "medium" };

  // Low: a consumer inbox on the confirmed page. Prefer a role-style one.
  const personal = cands.filter(isPersonalProvider);
  const rolePersonal = personal.find(isRole);
  if (rolePersonal) return { email: rolePersonal, confidence: "low" };
  if (personal.length === 1) return { email: personal[0], confidence: "low" };
  // Several unrelated consumer addresses on one page is a listing, not a
  // contact page — picking one at random is how the wrong person gets emailed.
  return null;
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

// Find the firm's OWN website via live Google.
//
// The old version took the first result that was not on the blocklist. For a
// small limited company the first result is almost never their own site — it is
// a company-data page, a lead-gen directory, or a planning-notice aggregator.
// Now every result is scanned and only a domain that plausibly belongs to the
// company is accepted; if none does, we say so rather than handing back a
// stranger's website to be scraped.
async function findWebsite(input: EnrichInput): Promise<{ website: string | null; mode: "live" | "demo"; rejected: number; providerError?: string }> {
  if (input.website && /^https?:\/\//i.test(input.website) && !isAggregator(input.website)) {
    return { website: input.website, mode: "live", rejected: 0 };
  }
  // Companies-House names are formal and punctuated ("M.C.B. AND SON LTD").
  // Forcing them into an exact-phrase query returns almost nothing, because the
  // firm's own site writes the name the way people say it. So search the plain
  // trading name with the legal suffix stripped.
  const trading = (input.company || "").replace(/\b(LIMITED|LTD|PLC|LLP|CIC)\b\.?/gi, " ").replace(/\s{2,}/g, " ").trim();
  const q = [trading, input.town, input.trade].filter(Boolean).join(" ");
  const res = await webSearch({ query: q, type: "search", gl: "uk" });
  if (res.mode === "demo") return { website: null, mode: "demo", rejected: 0, providerError: res.providerError?.reason };

  let rejected = 0;
  for (const r of res.results) {
    if (!r.link || isAggregator(r.link)) continue;
    const host = hostOf(r.link);
    if (!host) continue;
    if (!domainMatchesCompany(input.company, host)) { rejected++; continue; }
    try { return { website: new URL(r.link).origin, mode: "live", rejected }; } catch { /* keep looking */ }
  }
  return { website: null, mode: "live", rejected };
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
    // Apollo matches by name and can land on a different company with a similar
    // one. The same ownership rule applies to a licensed provider as to the
    // scraper: the address must sit on this company's domain, or on a consumer
    // provider, before it is attached to their row.
    const emailHost = (email || "").split("@")[1] || "";
    const apolloOwned = Boolean(email) && (isPersonalProvider(email as string) || (domain ? emailHost.endsWith(domain.replace(/^www\./, "")) : domainMatchesCompany(input.company, emailHost)));
    if (apolloEmailUsable(email, status) && apolloOwned) {
      return { company: input.company, website, email: (email as string).toLowerCase(), emailConfidence: status === "verified" ? "verified" : "high", phone, contactName: name, contactTitle: (person.title as string) || null, source: "apollo", mode: "live", note: `Apollo: ${name || "contact"}${person.title ? ` (${person.title})` : ""} — ${status === "verified" ? "verified" : "found"} email.` };
    }
    if (apolloEmailUsable(email, status) && !apolloOwned) {
      return { company: input.company, website, email: null, emailConfidence: "none", phone, contactName: name, source: "apollo", mode: "live", note: `Apollo returned an address at ${emailHost}, which does not belong to ${input.company} — dropped rather than emailing the wrong business.` };
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
  const { website, mode, rejected, providerError } = await findWebsite(input);
  if (mode === "demo") {
    return {
      ...base, mode: "demo", stage: "search_unavailable", providerError,
      // A key that is set but out of credit is NOT a missing key, and saying so
      // sends the owner looking for environment variables that never moved.
      note: providerError || "Enrichment needs live Google data — set SERPER_API_KEY. No email invented.",
    };
  }
  if (!website) {
    return {
      ...base,
      stage: "no_own_site",
      note: rejected
        ? `No website of their own. ${rejected} result${rejected === 1 ? " was" : "s were"} directory or third-party pages about this company — scraping those would have attached someone else's inbox to this row.`
        : "No independent website found for this company (only directory listings). Can't extract an email without inventing one.",
    };
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
    return { ...base, website, phone, source: phone ? "site" : "none", stage: "site_no_email",
      note: phone ? `Found the site (${host}) and a phone, but no email published — call, or use the site contact form.` : `Found the site (${host}) but no public email/phone — use the site's contact form.` };
  }
  return {
    company: input.company, website, email: picked.email, emailConfidence: picked.confidence, phone,
    source: "site", mode: "live", stage: "found",
    note: `Real email read from ${host}${picked.confidence === "high" ? " (company-domain inbox)" : picked.confidence === "medium" ? " (company domain)" : " (published on the site)"}.`,
  };
}
function rank(c: "high" | "medium" | "low"): number { return c === "high" ? 3 : c === "medium" ? 2 : 1; }

/**
 * Last line of defence: one address must not belong to several companies.
 *
 * If support@somewhere.co.uk comes back for four different builders, it is a
 * directory's own inbox no matter how it got through — no two independent firms
 * share a contact address. Rather than pick a winner, it is dropped from ALL of
 * them, because there is no way to know which row (if any) it was ever right
 * for, and emailing three strangers is worse than emailing nobody.
 *
 * `alreadyUsed` carries addresses the vault has already attached to some OTHER
 * company, so contamination is caught across separate runs too — the shape of
 * the bug that put one inbox on four rows over several batches.
 */
export function dropSharedEmails(
  results: EnrichResult[],
  alreadyUsed: Map<string, string> = new Map(),
): { results: EnrichResult[]; dropped: number } {
  const seen = new Map<string, Set<string>>();
  for (const r of results) {
    if (!r?.email) continue;
    const key = r.email.toLowerCase();
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(r.company.trim().toLowerCase());
  }

  let dropped = 0;
  const cleaned = results.map((r) => {
    if (!r?.email) return r;
    const key = r.email.toLowerCase();
    const here = seen.get(key)!;
    const owner = alreadyUsed.get(key);
    const clashesInBatch = here.size > 1;
    const clashesWithVault = Boolean(owner && owner.trim().toLowerCase() !== r.company.trim().toLowerCase());
    if (!clashesInBatch && !clashesWithVault) return r;
    dropped++;
    const others = clashesInBatch ? here.size : 2;
    return {
      ...r,
      email: null,
      emailConfidence: "none" as const,
      note: `Dropped ${r.email}: the same address came back for ${others} different companies, so it belongs to a directory rather than to ${r.company}. Nothing is attached to a business it is not.`,
    };
  });
  return { results: cleaned, dropped };
}

/**
 * Audit emails ALREADY in the vault against the ownership rule.
 *
 * Fixing the discovery path stops new contamination but does nothing about rows
 * written before it — a list can already be carrying one directory inbox on
 * several businesses, and sending to it is worse than having no address at all:
 * it puts the same stranger on three campaigns and marks them as spam.
 *
 * Purely local (no network, no cost). Only removes an address it can positively
 * show does not belong: an address shared by different companies, or one on a
 * domain that is neither the company's nor a consumer provider.
 */
export type EmailAudit = { id: string; company: string; email: string; reason: string };

export function auditStoredEmails(
  rows: { id: string; company?: string; name?: string; email?: string; website?: string }[],
): { bad: EmailAudit[]; checked: number } {
  const byEmail = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, new Set());
    byEmail.get(key)!.add((r.company || r.name || "").trim().toLowerCase());
  }

  const bad: EmailAudit[] = [];
  let checked = 0;
  for (const r of rows) {
    const email = (r.email || "").toLowerCase();
    if (!email) continue;
    checked++;
    const company = (r.company || r.name || "").trim();
    if (!company) continue;

    const shared = byEmail.get(email)!.size;
    if (shared > 1) {
      bad.push({ id: r.id, company, email, reason: `Attached to ${shared} different companies — it is a directory inbox, not theirs.` });
      continue;
    }
    if (looksJunkEmail(email)) {
      bad.push({ id: r.id, company, email, reason: "A placeholder address from a template, not a real inbox." });
      continue;
    }
    // A consumer address cannot be checked by domain and is left alone: plenty
    // of trades genuinely use gmail, and removing those would destroy real leads.
    if (isPersonalProvider(email)) continue;

    const host = email.split("@")[1] || "";
    const siteHost = r.website ? hostOf(r.website) : "";
    if (domainMatchesCompany(company, host)) continue;
    if (siteHost && host.endsWith(siteHost.split(".").slice(-2).join(".")) && domainMatchesCompany(company, siteHost)) continue;
    bad.push({ id: r.id, company, email, reason: `${host} does not belong to ${company} — it came off a page about them, not from them.` });
  }
  return { bad, checked };
}

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
