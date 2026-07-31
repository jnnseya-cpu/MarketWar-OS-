// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Deep crawl — several pages of a site, read and merged.
//
// "Deep crawl extracts" was labelled "Activate with a connector". There is no
// connector: the pieces were already here and unjoined. This is the join.
//
// FOUR RULES, in the order they matter:
//
//   IT OBEYS robots.txt. Following links is choosing what to fetch, and that
//   file exists to answer exactly that. Until now the crawler checked robots.txt
//   EXISTED and scored the site on it without reading a word — fine for one page
//   someone pastes about their own site, indefensible the moment we walk links.
//
//   IT STAYS ON ONE SITE. Same registrable host only. A crawler that wanders
//   off-domain is fetching third parties nobody authorised us to touch.
//
//   IT IS BOUNDED IN BOTH DIRECTIONS. A page cap and a wall-clock deadline, so a
//   large site returns a partial answer that SAYS it is partial rather than
//   running the serverless function into a 504 and returning nothing.
//
//   IT IS POLITE. Requests are serialised with the site's own Crawl-delay
//   honoured. Fetching a customer's site faster than their server likes is a
//   way to make their monitoring page us at 3am.

import { crawlSite, type CrawlReport } from "@/backend/crawler";
import { parseRobots, robotsAllows, crawlDelayMs, OUR_AGENT, type RobotsFile } from "@/backend/robots";
import { extractPage, mergeExtractions, type SiteExtraction } from "@/backend/site-extract";
import { detectRenderGap } from "@/backend/render-gap";

const UA = `Mozilla/5.0 (compatible; ${OUR_AGENT}/1.0; +https://marketwaros.com)`;

export type CrawledPage = {
  url: string;
  status: number;
  ok: boolean;
  /** Why a page was not read — robots, an error, or the budget running out. */
  skipped?: string;
};

export type DeepCrawlResult = {
  startUrl: string;
  host: string;
  /** The single-page audit of the entry page, unchanged. */
  audit: CrawlReport;
  extraction: SiteExtraction | null;
  pages: CrawledPage[];
  robots: { present: boolean; obeyed: boolean; disallowed: string[]; crawlDelayMs: number; sitemaps: number };
  /** True when the cap or the deadline stopped us before the site ran out. */
  partial: boolean;
  note: string;
};

async function get(url: string, timeoutMs: number): Promise<{ status: number; text: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,text/plain,text/css,*/*" } });
    const text = await res.text();
    return { status: res.status, text: text.slice(0, 1_500_000), finalUrl: res.url || url };
  } catch { return null; } finally { clearTimeout(t); }
}

const sameHost = (a: string, b: string) => {
  try { return new URL(a).hostname.replace(/^www\./, "") === b; } catch { return false; }
};

/** Candidate pages, best first: the sitemap the site publishes, then its own navigation. */
export function discoverUrls(opts: { sitemapXml: string; html: string; base: string; host: string; cap: number }): string[] {
  const out: string[] = [];
  const push = (u: string) => {
    let abs = "";
    try { abs = new URL(u, opts.base).toString().split("#")[0]; } catch { return; }
    if (!sameHost(abs, opts.host)) return;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|css|js|xml|ico|woff2?)(\?|$)/i.test(abs)) return;
    if (!out.includes(abs)) out.push(abs);
  };

  // The sitemap is the site telling us which pages it considers important —
  // strictly better than guessing from whichever links happen to be in the nav.
  for (const m of opts.sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) push(m[1]);

  // Then the page's own links, which is how a small site without a sitemap is
  // still crawlable. Commercially important paths first — a pricing page is
  // worth more to an audit than the twelfth blog post.
  const links: string[] = [];
  for (const tag of opts.html.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi) || []) {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (href) links.push(href);
  }
  const priority = /\/(pricing|price|plans|products?|services?|shop|store|about|contact|faq|reviews?|testimonials?|case-stud|book|quote)/i;
  for (const l of links.filter((l) => priority.test(l))) push(l);
  for (const l of links) push(l);

  return out.slice(0, opts.cap);
}

export type DeepCrawlOptions = {
  /** Pages to READ, including the entry page. */
  maxPages?: number;
  /** Wall clock for the whole crawl. A partial answer beats a 504. */
  budgetMs?: number;
  perRequestMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export async function deepCrawl(rawUrl: string, opts: DeepCrawlOptions = {}): Promise<DeepCrawlResult> {
  const maxPages = Math.max(1, Math.min(25, opts.maxPages ?? 8));
  const budgetMs = opts.budgetMs ?? 45_000;
  const perRequestMs = opts.perRequestMs ?? 10_000;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + budgetMs;

  const typed = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  let origin = "", host = "", start = typed;
  try {
    const u = new URL(typed);
    origin = u.origin; host = u.hostname.replace(/^www\./, "");
    // Normalised through URL so "evandeli.com" becomes "https://evandeli.com/".
    // Without this the entry URL has no trailing slash while every discovered
    // URL does, so `u !== start` fails to match and the customer's homepage is
    // fetched TWICE — once as itself and once from their own sitemap, burning a
    // page out of the cap to read something we already had.
    start = u.toString();
  }
  catch {
    const audit = await crawlSite(rawUrl);
    return { startUrl: rawUrl, host: "", audit, extraction: null, pages: [], robots: { present: false, obeyed: true, disallowed: [], crawlDelayMs: 0, sitemaps: 0 }, partial: false, note: "That doesn't look like a valid website address." };
  }

  // The single-page audit is unchanged and still the headline — extraction is
  // additive, not a replacement for the measurement people already trust.
  const audit = await crawlSite(start);

  const robotsRes = await get(`${origin}/robots.txt`, perRequestMs);
  const robots: RobotsFile = robotsRes && robotsRes.status < 400
    ? parseRobots(robotsRes.text, true)
    : parseRobots("", false);
  const delay = crawlDelayMs(robots);

  if (!audit.ok) {
    return {
      startUrl: start, host, audit, extraction: null, pages: [{ url: start, status: audit.httpStatus ?? 0, ok: false, skipped: audit.error }],
      robots: { present: robots.present, obeyed: true, disallowed: [], crawlDelayMs: delay, sitemaps: robots.sitemaps.length },
      partial: false,
      note: audit.error || "The entry page could not be read, so there was nothing to extract.",
    };
  }

  const sitemapRes = await get(`${origin}/sitemap.xml`, perRequestMs);
  const entryRes = await get(start, perRequestMs);
  const entryHtml = entryRes?.text || "";

  const candidates = discoverUrls({
    sitemapXml: sitemapRes && sitemapRes.status < 400 ? sitemapRes.text : "",
    html: entryHtml, base: start, host, cap: maxPages * 4,
  });

  const queue = [start, ...candidates.filter((u) => u !== start)];
  const pages: CrawledPage[] = [];
  const disallowed: string[] = [];
  const extractions: SiteExtraction[] = [];
  let readCount = 0;
  let stoppedEarly = false;

  // One page at a time, on purpose. Concurrency against someone else's server
  // is how a marketing tool ends up looking like a denial-of-service.
  for (const url of queue) {
    if (readCount >= maxPages) { stoppedEarly = queue.indexOf(url) < queue.length; break; }
    if (now() + perRequestMs > deadline) { stoppedEarly = true; break; }

    let path = "/";
    try { path = new URL(url).pathname || "/"; } catch { continue; }

    const decision = robotsAllows(robots, path);
    if (!decision.allowed) {
      disallowed.push(path);
      pages.push({ url, status: 0, ok: false, skipped: decision.reason });
      continue;
    }

    if (pages.length > 0 && delay > 0) await sleep(delay);

    const res = url === start && entryRes ? entryRes : await get(url, perRequestMs);
    if (!res || res.status >= 400) {
      pages.push({ url, status: res?.status ?? 0, ok: false, skipped: `HTTP ${res?.status ?? "no response"}` });
      continue;
    }

    // On the entry page only, fetch the first stylesheet: colours and fonts live
    // there, not in the markup. One extra request, not one per page.
    let css = "";
    if (url === start) {
      const href = res.text.match(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/i)?.[0]?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      if (href && now() + perRequestMs < deadline) {
        try {
          const cssUrl = new URL(href, url).toString();
          if (sameHost(cssUrl, host)) {
            const cssPath = new URL(cssUrl).pathname;
            if (robotsAllows(robots, cssPath).allowed) css = (await get(cssUrl, perRequestMs))?.text.slice(0, 300_000) || "";
          }
        } catch { /* a stylesheet we cannot reach is not a crawl failure */ }
      }
    }

    pages.push({ url, status: res.status, ok: true });
    extractions.push(extractPage(res.text, res.finalUrl || url, css));
    readCount++;
  }

  const extraction = extractions.length ? mergeExtractions(extractions) : null;
  const shell = detectRenderGap(entryHtml).jsShell;

  const noteParts = [
    `Read ${readCount} page(s) of ${host}${extraction ? `, ${extraction.found} things extracted` : ""}.`,
    robots.present
      ? `robots.txt was read and obeyed${disallowed.length ? ` — ${disallowed.length} page(s) skipped because it disallows them` : ""}.`
      : "No robots.txt, so crawlers are permitted by default.",
    delay ? `Honoured the site's Crawl-delay of ${delay}ms between requests.` : "",
    stoppedEarly ? `Stopped at the ${readCount >= maxPages ? `${maxPages}-page limit` : "time limit"} — this is a sample of the site, not all of it.` : "",
    shell ? "The entry page renders in the browser, so there was little in the HTML to extract. What is missing here is also missing from what AI assistants can read about this business." : "",
    extraction?.audience === null ? "Audience is not extracted: it is not written in the markup, and inferring it while calling it an extract would be a fabrication." : "",
  ].filter(Boolean);

  return {
    startUrl: start, host, audit, extraction, pages,
    robots: { present: robots.present, obeyed: true, disallowed, crawlDelayMs: delay, sitemaps: robots.sitemaps.length },
    partial: stoppedEarly,
    note: noteParts.join(" "),
  };
}
