// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHICH OF OUR OWN PAGES GOOGLE IS BEING TOLD TWO DIFFERENT THINGS ABOUT.
//
// WHY THIS EXISTS. Search Console emailed: *"Blocked by robots.txt … if this
// reason is not intentional, we recommend that you fix it."* It does not say
// WHICH pages, and the Coverage report it refers to has never been exposed
// through any API — so the only way to see the list is for a person to open the
// console and read it. That is precisely the shape of answer this platform is
// not allowed to give: when the answer is "go and look", the defect is that
// nothing is looking.
//
// So this looks. It reads the robots.txt we actually publish, walks the pages we
// actually offer, and finds every URL the site asks Google to crawl and then
// refuses to serve it — which is the condition that generates that email.
//
// IT IS THE CONTRADICTION THAT MATTERS, NOT THE BLOCK. A disallowed path nothing
// links to is free: Google cannot discover it, so it costs no crawl budget and
// produces no report. The same block becomes a permanent error the moment an
// indexable page links to it. Measured on our own site before this was written:
// `/signup` was linked seven times from six landing pages and `/login` from the
// header on every page, and both were `Disallow`ed.
//
// THREE MORE CONTRADICTIONS IT CHECKS, because each one is a way of telling
// Google two things at once:
//
//   • A PATH THAT IS BOTH BLOCKED AND NOINDEX. The `noindex` can never be read,
//     because reading it needs the fetch the block just refused. The page then
//     sits in the worst state available — eligible to appear as a bare URL with
//     no title, under our own brand name.
//   • A PATH WE DECLARED NOINDEX THAT DOES NOT CARRY ONE. A policy nothing
//     enforces; the page is heading for the index.
//   • A SITEMAP ENTRY ROBOTS BLOCKS, or one carrying a `noindex`. A sitemap is a
//     submission: this is the site nominating a page for indexing in one file
//     and refusing it in another.
//
// WHAT IT DOES NOT DO: claim to know Google's own verdict. For that there is
// `urlInspection` in `backend/search-console.ts`, which asks Google directly —
// when a credential exists. This module needs none, which is the point: it works
// on any deployment, including a customer's.

import { parseRobots, robotsAllows, type RobotsFile } from "@/backend/robots";
import { ROBOTS_DISALLOW, NOINDEX_PATHS } from "@/shared/robots-policy";

/** Googlebot, because the question is what GOOGLE may fetch — not what we may. */
export const GOOGLEBOT = "Googlebot";

export type IndexabilityFault =
  /** Blocked by robots.txt, and an indexable page links to it. The reported one. */
  | "blocked_but_linked"
  /** Blocked AND carrying a noindex, so the noindex is unreadable. */
  | "blocked_noindex"
  /** Declared noindex in policy, but the page does not say so. */
  | "noindex_missing"
  /** In our sitemap and blocked by our robots.txt. */
  | "sitemap_blocked"
  /** In our sitemap and carrying a noindex. */
  | "sitemap_noindex";

export type IndexabilityFinding = {
  fault: IndexabilityFault;
  url: string;
  path: string;
  /** The robots rule that matched, or "" when robots is not the cause. */
  rule: string;
  /** The indexable page that links here, for `blocked_but_linked`. */
  linkedFrom?: string;
  /** How many indexable pages link here. One link is a tidy-up; six is a funnel. */
  links?: number;
  /**
   * TRUE when every link to it carries `rel="nofollow"`. Google documents
   * nofollow as a HINT since 2019, so this lowers the odds and does not settle
   * it — reported as its own state rather than counted as fixed.
   */
  allNofollowed?: boolean;
  /** What to do, naming the mechanism rather than the symptom. */
  remedy: string;
};

export type IndexabilityReport = {
  origin: string;
  /** False when /robots.txt did not answer. Everything is then permitted. */
  robotsPresent: boolean;
  /** Pages actually fetched and read. */
  pagesRead: number;
  /** Internal URLs discovered across those pages. */
  urlsSeen: number;
  findings: IndexabilityFinding[];
  /** Findings that will produce a Search Console report. */
  reportable: number;
  /** True when the cap or the deadline stopped the walk early. */
  partial: boolean;
  /**
   * The origin the sitemap's own URLs are on, when it is NOT the one audited.
   *
   * Expected and harmless when auditing a local or preview build — the sitemap
   * is generated from the canonical origin. Worth reading twice when the audited
   * origin IS the canonical one, because then the sitemap is nominating pages on
   * a host this is not.
   */
  sitemapHost?: string;
  /** TRUE when no usable sitemap was found and the home page's links were used. */
  seededFromHome: boolean;
  note: string;
};

type Fetched = { status: number; text: string; ok: boolean };
export type FetchLike = (url: string) => Promise<Fetched>;

const UA = "Mozilla/5.0 (compatible; MarketWarBot/1.0; +https://marketwaros.com)";

async function httpGet(url: string, timeoutMs: number): Promise<Fetched> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA } });
    const text = (await res.text()).slice(0, 1_500_000);
    return { status: res.status, text, ok: res.ok };
  } catch {
    return { status: 0, text: "", ok: false };
  } finally { clearTimeout(t); }
}

/** `<meta name="robots" content="… noindex …">`, however it is spaced or cased. */
export function hasNoindex(html: string): boolean {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/name\s*=\s*["']?robots["']?/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    if (/\bnone\b|\bnoindex\b/i.test(content)) return true;
  }
  // An X-Robots-Tag header can also carry it, but a header is not in the body;
  // callers that have the response headers pass `noindex` in themselves.
  return false;
}

/** Internal links on a page, with whether each carried `rel="nofollow"`. */
export function linksOn(html: string, base: string, origin: string): { url: string; nofollow: boolean }[] {
  const out: { url: string; nofollow: boolean }[] = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let abs = "";
    try { abs = new URL(href, base).toString().split("#")[0]; } catch { continue; }
    if (!abs.startsWith(origin)) continue;
    // Assets are not pages; a blocked stylesheet is a different conversation.
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|css|js|ico|woff2?)(\?|$)/i.test(abs)) continue;
    const rel = tag.match(/rel\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    out.push({ url: abs, nofollow: /\bnofollow\b/i.test(rel) });
  }
  return out;
}

const pathOf = (url: string): string => {
  try { const u = new URL(url); return u.pathname + (u.search || ""); } catch { return url; }
};

/**
 * Audit one origin's own indexability.
 *
 * `fetchImpl` is injectable so this can be driven against a real running build
 * without a network, and so the tests are not a measurement of the internet.
 */
export async function auditIndexability(opts: {
  origin: string;
  fetchImpl?: FetchLike;
  /** Pages to READ. The sitemap decides which; this bounds the walk. */
  maxPages?: number;
  budgetMs?: number;
  perRequestMs?: number;
  now?: () => number;
}): Promise<IndexabilityReport> {
  const origin = opts.origin.replace(/\/+$/, "");
  const maxPages = Math.max(1, Math.min(60, opts.maxPages ?? 25));
  const budgetMs = opts.budgetMs ?? 45_000;
  const perRequestMs = opts.perRequestMs ?? 10_000;
  const now = opts.now ?? (() => Date.now());
  const get: FetchLike = opts.fetchImpl ?? ((u) => httpGet(u, perRequestMs));
  const deadline = now() + budgetMs;

  const robotsRes = await get(`${origin}/robots.txt`);
  const robots: RobotsFile = parseRobots(robotsRes.ok ? robotsRes.text : "", robotsRes.ok);

  // THE SITEMAP, AND THE TWO WAYS IT CAN FAIL TO BE USABLE — both of which
  // produced a silent pass before the driver caught them.
  //
  // ONE: ITS URLS ARE ON ANOTHER HOST. A sitemap is generated from the site's
  // canonical origin, so a build served anywhere else — a local production
  // server, a preview deployment, a staging host — publishes
  // `https://www.marketwaros.com/...` whatever address you fetch it from.
  // Rejecting those left NO pages to walk, and "nothing is both offered and
  // refused" then passed because nothing had been examined at all. The paths
  // are what matter, so they are rehosted onto the origin under audit and the
  // mismatch is reported rather than hidden.
  //
  // TWO: THERE IS NO SITEMAP. Most customer sites have none. The homepage's own
  // links are then the only map, which is how any crawler handles it.
  const sitemapRes = await get(`${origin}/sitemap.xml`);
  const sitemapText = sitemapRes.ok ? sitemapRes.text : "";
  const locs: string[] = [];
  for (const m of sitemapText.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) locs.push(m[1].trim());
  const sitemapUrls: string[] = [];
  let sitemapHost = "";
  for (const u of locs) {
    if (u.startsWith(origin)) { if (!sitemapUrls.includes(u)) sitemapUrls.push(u); }
  }
  if (sitemapUrls.length === 0 && locs.length > 0) {
    for (const u of locs) {
      try {
        const parsedLoc = new URL(u);
        if (!sitemapHost) sitemapHost = parsedLoc.origin;
        const rehosted = `${origin}${parsedLoc.pathname}${parsedLoc.search}`;
        if (!sitemapUrls.includes(rehosted)) sitemapUrls.push(rehosted);
      } catch { /* a malformed <loc> is not a page */ }
    }
  }
  // NO SITEMAP AT ALL: start from the home page and use its own navigation.
  const seededFromHome = sitemapUrls.length === 0;
  if (seededFromHome) sitemapUrls.push(`${origin}/`);

  const findings: IndexabilityFinding[] = [];
  const blockOf = (path: string) => robotsAllows(robots, path, GOOGLEBOT);

  // 1. OUR OWN SUBMISSION, CHECKED FIRST. A sitemap entry we block ourselves is
  //    the strongest form of the contradiction: we nominated the page.
  for (const url of sitemapUrls) {
    const d = blockOf(pathOf(url));
    if (!d.allowed) {
      findings.push({
        fault: "sitemap_blocked", url, path: pathOf(url), rule: d.rule,
        remedy: `This page is in our sitemap and blocked by "${d.rule}" in our robots.txt. A sitemap entry is a submission for indexing — remove the disallow, or remove the page from the sitemap.`,
      });
    }
  }

  // 2. WALK THE PAGES WE OFFER and read the links on them. Only an INDEXABLE
  //    page's links matter: a link from a page Google will not index cannot
  //    produce a coverage report about its target.
  const linkCount = new Map<string, { from: string; links: number; allNofollowed: boolean }>();
  let pagesRead = 0;
  let partial = false;
  // A QUEUE, NOT A FIXED LIST, so a site with no usable sitemap is still walked:
  // the home page's own links become the map, one level at a time, exactly as a
  // crawler would. With a sitemap the queue never grows — the sitemap IS the
  // site's own statement of which pages matter.
  // TRUNCATION IS REPORTED, NOT SWALLOWED. `slice` made `toRead.length` equal
  // to the cap, so the "did we see the whole site" comparison below could never
  // be true and a 44-page sitemap audited 30 pages while reporting complete.
  const truncated = sitemapUrls.length > maxPages;
  const queue = sitemapUrls.slice(0, maxPages);
  const seen = new Set(queue);
  const toRead = queue;
  for (let i = 0; i < queue.length && i < maxPages; i++) {
    const url = queue[i];
    if (now() > deadline) { partial = true; break; }
    const res = await get(url);
    if (!res.ok) continue;
    pagesRead++;
    const noindex = hasNoindex(res.text);
    // A sitemap entry that tells Google not to index it — the other half of the
    // submission contradiction, and visible only once the page is fetched.
    if (noindex) {
      findings.push({
        fault: "sitemap_noindex", url, path: pathOf(url), rule: "",
        remedy: `This page is in our sitemap and carries a noindex. One of the two is wrong: either it should rank, or it should not be submitted.`,
      });
      continue;   // its links cannot produce a coverage report
    }
    for (const link of linksOn(res.text, url, origin)) {
      const prev = linkCount.get(link.url);
      if (prev) {
        prev.links++;
        prev.allNofollowed = prev.allNofollowed && link.nofollow;
      } else {
        linkCount.set(link.url, { from: url, links: 1, allNofollowed: link.nofollow });
      }
      // Only when the sitemap gave us nothing — otherwise the sitemap decides.
      // A blocked target is never queued: fetching it would be the one thing
      // this module exists to object to anybody else doing.
      if (seededFromHome && !seen.has(link.url) && queue.length < maxPages
        && robotsAllows(robots, pathOf(link.url), GOOGLEBOT).allowed) {
        seen.add(link.url);
        queue.push(link.url);
      }
    }
  }
  if (truncated) partial = true;

  // 3. THE REPORTED FAULT: linked from an indexable page, and blocked.
  for (const [url, seen] of linkCount) {
    const path = pathOf(url);
    const d = blockOf(path);
    if (d.allowed) continue;
    findings.push({
      fault: "blocked_but_linked", url, path, rule: d.rule,
      linkedFrom: seen.from, links: seen.links, allNofollowed: seen.allNofollowed,
      remedy: seen.allNofollowed
        ? `Blocked by "${d.rule}" and linked ${seen.links} time(s), every link carrying rel="nofollow". Google treats nofollow as a hint rather than an instruction, so this can still be reported — the certain fix is to stop linking it from indexable pages, or to allow the fetch and serve a noindex.`
        : `Blocked by "${d.rule}" but linked from ${seen.links} indexable page(s), starting with ${seen.from}. Google is invited and then refused, which is exactly what "Blocked by robots.txt" reports. Allow the fetch and serve "noindex, follow" on the page, or stop linking to it.`,
    });
  }

  // 4. THE POLICY, CHECKED AGAINST ITSELF. A path we declared noindex must not
  //    also be blocked, and must actually carry the header.
  for (const entry of NOINDEX_PATHS) {
    const d = blockOf(entry.path);
    if (!d.allowed) {
      findings.push({
        fault: "blocked_noindex", url: `${origin}${entry.path}`, path: entry.path, rule: d.rule,
        remedy: `"${entry.path}" is declared noindex AND blocked by "${d.rule}". The noindex can never be read, because reading it needs the fetch the block refuses — so the page stays eligible to appear as a bare URL with no title. Remove the disallow.`,
      });
      continue;
    }
    if (now() > deadline) { partial = true; break; }
    const res = await get(`${origin}${entry.path}`);
    if (!res.ok) continue;
    pagesRead++;
    if (!hasNoindex(res.text)) {
      findings.push({
        fault: "noindex_missing", url: `${origin}${entry.path}`, path: entry.path, rule: "",
        remedy: `"${entry.path}" is crawlable and carries no noindex, so it is heading for the index. Add \`robots: NOINDEX_METADATA\` to its metadata — ${entry.reason}`,
      });
    }
  }

  const reportable = findings.filter((f) => f.fault !== "noindex_missing").length;
  const blockedLinked = findings.filter((f) => f.fault === "blocked_but_linked").length;

  return {
    origin, robotsPresent: robots.present, pagesRead, urlsSeen: linkCount.size,
    findings, reportable, partial, seededFromHome,
    ...(sitemapHost && sitemapHost !== origin ? { sitemapHost } : {}),
    note: !robots.present
      ? `${origin}/robots.txt did not answer, so nothing is blocked and nothing here can be reported as blocked. That is its own problem — a site with no robots.txt publishes no crawl rules at all.`
      : pagesRead === 0
        // NOT AN ALL-CLEAR. Nothing was examined, so nothing could be found, and
        // reporting that as "no contradictions" is the defect this module is
        // about: a check that passes for a reason unrelated to what it tests.
        ? `No page could be read at ${origin}, so nothing was checked. This is not a clean result — the sitemap returned ${locs.length} URL(s) and the walk read none of them.`
        : findings.length === 0
        ? `${pagesRead} page(s) read${seededFromHome ? " (no usable sitemap, so the home page's own links were followed)" : " from the sitemap"}, `
          + `${linkCount.size} internal link target(s) checked against ${ROBOTS_DISALLOW.length} disallow rule(s): nothing is both offered to Google and refused. `
          + `${NOINDEX_PATHS.length} declared-noindex path(s) are crawlable and carry the header.`
          + (sitemapHost && sitemapHost !== origin ? ` The sitemap's own URLs are on ${sitemapHost}; their paths were audited here.` : "")
          + (partial ? ` NOT THE WHOLE SITE: the sitemap lists ${sitemapUrls.length} page(s) and the cap read ${maxPages}.` : "")
        : `${findings.length} contradiction(s): ${blockedLinked} path(s) are linked from indexable pages and blocked by robots.txt — that is what Search Console reports as "Blocked by robots.txt". `
          + `Every finding names the rule that caused it.`
          + (partial ? " The walk was cut short by its budget, so this is not the whole site." : ""),
  };
}
