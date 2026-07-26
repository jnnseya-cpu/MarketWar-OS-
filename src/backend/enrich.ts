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
  emailConfidence: "high" | "medium" | "low" | "none";
  phone: string | null;
  source: "site" | "search" | "none";
  mode: "live" | "demo";
  note: string;
};

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

// Fetch a page defensively: short timeout, capped body, swallow all errors.
async function fetchText(url: string, timeoutMs = 9_000, maxBytes = 600_000): Promise<string> {
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

// Enrich ONE company. Live only (needs Serper); demo returns an honest note.
export async function enrichContact(input: EnrichInput): Promise<EnrichResult> {
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
