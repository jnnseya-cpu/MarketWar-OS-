// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Site crawler — a REAL, measured website audit. Fetches the page (server-side)
// and inspects the actual HTML for SEO/technical/social/mobile/content signals,
// plus robots.txt and sitemap.xml. Every finding is measured from the live page,
// not modelled. This is what turns Website Intel from a deterministic estimate
// into a genuine audit. No third-party service, no key.
//
// TWO THINGS IT REFUSES TO CONFUSE (see render-gap.ts): a page whose content is
// rendered by JavaScript is not a page with no content, and a bot-protection
// challenge is not a page at all. Auditing either as if it were the customer's
// HTML produces a confident, entirely fictional report.

import { detectRenderGap, classifyBlock, type RenderGap, type BlockVerdict } from "@/backend/render-gap";
import { blockedUrlReason, blockedAddressReason, MAX_REDIRECTS } from "@/shared/net-guard";

export type Severity = "pass" | "warn" | "fail";
export type Finding = {
  area: "SEO" | "Technical" | "Mobile" | "Social" | "Content" | "Structured data";
  label: string;
  severity: Severity;
  detail: string;
  weight: number;
  /**
   * False when we could not read this from the response — a JavaScript-rendered
   * page, not a page that failed the check. Unmeasured checks are left out of
   * the score entirely rather than counted as passes or failures.
   */
  measured?: boolean;
  /**
   * False when this check does not apply to THIS KIND of business.
   *
   * Distinct from `measured` on purpose: "we could not read it" and "it is not
   * a question about you" have different explanations and neither may be
   * reported as the other. Inapplicable checks are excluded from the score
   * exactly like unmeasured ones — never counted as a pass, which would be a
   * point awarded for nothing, and never as a failure.
   */
  applicable?: boolean;
  /** Why it does not apply. Present only when `applicable` is false. */
  notApplicable?: string;
};
export type CrawlReport = {
  ok: boolean;
  url: string;
  finalUrl?: string;
  httpStatus?: number;
  https: boolean;
  loadMs?: number;
  htmlBytes?: number;
  score: number;                 // 0-100, from measured checks
  grade: "A" | "B" | "C" | "D" | "F";
  /**
   * The same score cut by area — SEO, Content, Technical, Mobile, Social,
   * Structured data. Computed by the SAME rule as `score`, on a filtered set of
   * the same findings, so the two can never disagree.
   *
   * `score` and `grade` are NULL for an area where nothing could be measured.
   * Zero would read as "you failed every check in this area" when the truth is
   * "we could not read any of them", and those want opposite actions.
   */
  areaScores?: {
    area: Finding["area"];
    score: number | null;
    grade: CrawlReport["grade"] | null;
    measured: number;
    checks: number;
    failures: number;
    warnings: number;
    /** This area's share of the whole score, so one bad area is not read as one sixth. */
    weightShare: number;
    coveragePct: number;
    worst: string;
    note: string;
  }[];
  title?: string;
  metaDescription?: string;
  h1Count?: number;
  wordCount?: number;
  imagesTotal?: number;
  imagesNoAlt?: number;
  internalLinks?: number;
  externalLinks?: number;
  robotsTxt?: boolean;
  sitemapXml?: boolean;
  structuredDataTypes?: string[];
  findings: Finding[];
  /** What the HTML could and could not tell us. Present on every successful crawl. */
  renderGap?: RenderGap;
  /** Set when the response was a block or an error page rather than the site. */
  block?: BlockVerdict;
  /** Share of the audit's weight that was actually readable. 100 on a normal page. */
  coveragePct?: number;
  /** The checks we could not read, by label. */
  unreadable?: string[];
  /** Empty when coverage is complete; otherwise says what the score does and does not mean. */
  scoreNote?: string;
  /**
   * EVERY PAGE THIS REPORT IS BASED ON.
   *
   * A report that says "your website" after reading one page is making a claim
   * it cannot support, and the first time it is wrong the reader stops
   * believing the rest. This is what the audit actually read, so anyone can
   * check it against their own site.
   */
  pagesRead?: string[];
  /** Contact-ish pages that were linked but could not be read. Named, not hidden. */
  pagesTried?: string[];
  error?: string;
};

function normaliseUrl(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withScheme); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

/**
 * Does this hostname resolve somewhere we are allowed to fetch?
 *
 * The name check alone is not enough: `evil.example.com` is a perfectly ordinary
 * hostname whose A record is 169.254.169.254. So the name is resolved and every
 * address it returns is judged, and the fetch is only made if all of them pass.
 */
/**
 * Loopback is reachable ONLY under the test runner, where the suite serves a
 * real page on 127.0.0.1. Link-local — the cloud metadata address — is never
 * reachable, in any environment, including this one.
 */
const guardOpts = () => ({ allowLoopback: process.env.NODE_ENV === "test" });

async function resolvesPublicly(hostname: string): Promise<string | null> {
  try {
    const dns = await import("node:dns/promises");
    const addrs = await dns.lookup(hostname, { all: true });
    if (!addrs.length) return "That website's address could not be looked up.";
    for (const a of addrs) {
      const bad = blockedAddressReason(a.address, guardOpts());
      if (bad) return bad;
    }
    return null;
  } catch {
    return "That website's address could not be looked up.";
  }
}

/**
 * Fetch a page the PUBLIC asked us to fetch.
 *
 * Redirects are followed by hand rather than by `redirect: "follow"`, because
 * following automatically re-introduces exactly what the checks above prevent: a
 * public URL that answers 302 to http://169.254.169.254/ is fetched by the
 * runtime with no further questions asked. Every hop is checked as if it were
 * the address originally typed in.
 */
async function fetchPage(url: string, timeoutMs = 12_000): Promise<{ status: number; finalUrl: string; html: string; ms: number; headers: Headers | null } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (blockedUrlReason(current, guardOpts())) return null;
      if (await resolvesPublicly(new URL(current).hostname)) return null;

      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketWarBot/1.0; +https://marketwaros.com)", Accept: "text/html,application/xhtml+xml" },
      });

      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (location) {
        // Resolved against the current URL so a relative Location still works.
        current = new URL(location, current).toString();
        continue;
      }

      // READ UP TO THE CAP, NOT THE WHOLE BODY AND THEN THE CAP.
      //
      // This was `(await res.arrayBuffer()).slice(0, 1_500_000)`, which reads
      // the ENTIRE response into memory and only then throws away the excess.
      // The cap looked like a limit and was a formatting step. A site serving a
      // 500MB page, a stream that never ends, or a decompression bomb exhausts
      // the function's memory before the slice is reached — and this is a
      // PUBLIC endpoint that fetches a URL of the caller's choosing, so it is
      // both a crash and something anybody can point at us on purpose.
      //
      // Now the body is consumed in chunks and abandoned at the limit. What
      // gets audited is unchanged (the first 1.5MB of HTML is far more than any
      // real page's head and body need), and the failure mode is a truncated
      // read rather than a dead process.
      const html = await readCapped(res, MAX_HTML_BYTES);
      // Headers come back too: a 403 from Cloudflare and a 403 from an origin are
      // different problems with different fixes, and only the headers say which.
      return { status: res.status, finalUrl: current, html, ms: Date.now() - start, headers: res.headers };
    }
    return null; // too many hops
  } catch { return null; } finally { clearTimeout(t); }
}

/** The most HTML we will hold for one page. Far beyond any real page's needs. */
const MAX_HTML_BYTES = 1_500_000;

/**
 * Consume a response body up to `limit` bytes and stop.
 *
 * Exported so this can be tested directly. It cannot be reached through
 * `crawlSite` from a test environment: the net guard refuses a hostname that
 * does not resolve publicly, which is correct and which means the reader is
 * never entered. A first version of this test asserted on bytes served through
 * `crawlSite` and passed while reading ZERO — a check that succeeded for a
 * reason unrelated to what it tested.
 *
 * Falls back to `arrayBuffer()` only when the body is not a readable stream —
 * some runtimes and some mocked responses are not — and in that case the same
 * cap is applied after the fact, which is the old behaviour and the best
 * available for a body that cannot be streamed.
 */
export async function readCapped(res: Response, limit: number): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const body = res.body;
  if (!body || typeof body.getReader !== "function") {
    const buf = await res.arrayBuffer();
    return decoder.decode(buf.slice(0, limit));
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const room = limit - total;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        total = limit;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Stop the transfer rather than letting it run on in the background after
    // we already have everything we are going to use.
    try { await reader.cancel(); } catch { /* the stream was already finished */ }
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { joined.set(c, at); at += c.byteLength; }
  return decoder.decode(joined);
}

async function exists(url: string, timeoutMs = 7_000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, method: "GET", headers: { "User-Agent": "MarketWarBot/1.0" } });
    return res.ok;
  } catch { return false; } finally { clearTimeout(t); }
}

/**
 * THE PAGES A VISITOR WOULD ACTUALLY TRY, not just the one they landed on.
 *
 * THE FAULT THIS FIXES, reported from a live audit of a real site. The report
 * said "No phone number found on the page" and "There is no obvious way to get
 * in touch from this page — no phone link, no email, no form. Every visitor who
 * wanted to hire you had to go looking, and looking is where they stop."
 *
 * The site has a /contact page, linked from its own navigation. Both statements
 * were true OF THE HOMEPAGE and false about the business, and the second one
 * accused the owner of losing customers over a problem they had already solved.
 * A report that does that is worse than no report: the owner knows it is wrong,
 * and every correct finding beside it stops counting too.
 *
 * "Can I contact this business" is a question about the SITE. So the crawl
 * follows the links a person would follow — the ones whose href or link text
 * says contact, enquiries, quote, book, about — and answers from everything it
 * read. Capped at two extra pages, same origin only, and each one goes through
 * the same guard as the first: a public audit that follows links is a public
 * audit that can be pointed at somebody's internal network.
 */
/**
 * IS THIS A LOCAL BUSINESS, OR SOFTWARE?
 *
 * THE FAULT THIS FIXES, reported by the owner about a real audit. An API
 * company — SMS verification for mobile money — was told:
 *
 *   Phone number: "For a local business the phone number is the conversion.
 *   If it is not a number a phone can dial, somebody standing in the rain has
 *   to copy it by hand."
 *
 *   Local address: "customers need to see it before they trust a trade they
 *   have never used."
 *
 * Nobody stands in the rain to buy an API, and it has no trade to distrust.
 * The measurements were true — there is no tel: link and no postcode — and the
 * FINDINGS were nonsense, because an API company deliberately has neither.
 * Marking that a failure costs the reader nothing except their belief in the
 * other twenty-six checks, which is the whole asset.
 *
 * The test is POSITIVE EVIDENCE OF THE OTHER KIND, never the absence of local
 * evidence — "no postcode, therefore not local, therefore no postcode needed"
 * is circular and would silence the check for every plumber who needs it. A
 * site is treated as software only when it says so: software schema, or the
 * vocabulary a developer product cannot avoid using about itself.
 *
 * Local schema or a postal address always wins. A business that publishes an
 * address is telling us where it is, and that is not a claim we overrule.
 */
const DEV_TERMS = /\b(api|sdk|endpoint|webhook|api key|developer portal|documentation|docs|integration guide|sandbox|rest api|graphql|client librar)/gi;
const SOFTWARE_SCHEMA = /SoftwareApplication|WebApplication|SoftwareSourceCode|APIReference/i;

export function siteIsSoftware(html: string, sdTypes: string[], hasLocalEvidence: boolean): boolean {
  // A published address or local markup settles it: this is a place.
  if (hasLocalEvidence) return false;
  if (sdTypes.some((t) => SOFTWARE_SCHEMA.test(t))) return true;
  // Distinct terms, not repetitions — one page saying "API" forty times is one
  // signal, and a marketing site for a plumber can say "integration" once.
  const body = stripTags(html.replace(/<head[\s\S]*?<\/head>/i, "")).toLowerCase();
  const hits = new Set((body.match(DEV_TERMS) || []).map((m) => m.toLowerCase()));
  return hits.size >= 3;
}

const CONTACT_HINT = /(contact|get-?in-?touch|enquir|inquir|reach-?us|quote|book|hire|about)/i;
const EXTRA_PAGES = 2;

function contactCandidates(html: string, origin: string, currentUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([currentUrl.replace(/#.*$/, "")]);
  const anchors = html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]{0,120}?<\/a>/gi) || [];
  for (const a of anchors) {
    const href = attr(a, "href") || "";
    if (/^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    // The LINK TEXT counts as much as the path: plenty of sites route "Contact"
    // at /pages/17, and a visitor reads the word, not the URL.
    if (!CONTACT_HINT.test(href) && !CONTACT_HINT.test(stripTags(a))) continue;
    let abs = "";
    try { abs = new URL(href, currentUrl).toString().replace(/#.*$/, ""); } catch { continue; }
    // SAME ORIGIN ONLY. A "Contact" link to a third party is their page, not
    // this business's, and following it would make this endpoint a fetcher of
    // arbitrary URLs on somebody else's behalf.
    if (!abs.startsWith(origin)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
    if (out.length >= EXTRA_PAGES) break;
  }
  return out;
}

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : undefined;
};
const metaContent = (html: string, nameOrProp: string): string | undefined => {
  const re = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${nameOrProp}["'][^>]*>`, "i");
  const m = html.match(re);
  return m ? attr(m[0], "content") : undefined;
};
const stripTags = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Total weight of every finding, measured or not — the denominator for share. */
function allFindingWeight(list: Finding[]): number {
  return list.reduce((s, f) => s + f.weight, 0);
}

function grade(score: number): CrawlReport["grade"] {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
}

/**
 * THE SCORE, CUT BY AREA.
 *
 * "How is my SEO?" is the question people arrive with, and one number for the
 * whole site cannot answer it: a site can be 82 overall while its SEO is 55, and
 * the 82 is exactly what stops somebody acting on the 55.
 *
 * EXPORTED AND PURE so it can be driven directly. The `null` branch below cannot
 * be reached through `crawlSite` with any HTML — every area always has at least
 * one check readable from the markup — so a test that went through the crawler
 * asserted nothing about it and two mutations of that branch survived. A rule
 * this important has to be reachable by the test that guards it.
 *
 * ONE SCORING RULE: pass counts full weight, warn counts half, and a finding
 * that was not measured or does not apply is counted neither way. Identical to
 * the overall score, on a filtered set of the same findings, so the two can
 * never disagree.
 */
export function scoreByArea(findings: Finding[]): NonNullable<CrawlReport["areaScores"]> {
  const AREAS: Finding["area"][] = ["SEO", "Content", "Technical", "Mobile", "Social", "Structured data"];
  const allWeight = allFindingWeight(findings);

  return AREAS.map((area) => {
    const inArea = findings.filter((f) => f.area === area);
    const measurable = inArea.filter((f) => f.measured !== false && f.applicable !== false);
    const earned = measurable.reduce((s, f) => s + (f.severity === "pass" ? f.weight : f.severity === "warn" ? f.weight * 0.5 : 0), 0);
    const weight = measurable.reduce((s, f) => s + f.weight, 0);
    const score = weight > 0 ? Math.round((earned / weight) * 100) : 0;
    const areaAllWeight = inArea.reduce((s, f) => s + f.weight, 0);

    return {
      area,
      // NULL, NEVER ZERO, when nothing here could be measured. Zero reads as
      // "you failed every check in this area" when the truth is "we could not
      // read any of them", and those two want opposite actions. Same doctrine
      // the Clip Lab states outright: a dimension whose inputs nobody measured
      // stays blank rather than being filled in.
      score: measurable.length ? score : null,
      grade: measurable.length ? grade(score) : null,
      measured: measurable.length,
      checks: inArea.length,
      failures: measurable.filter((f) => f.severity === "fail").length,
      warnings: measurable.filter((f) => f.severity === "warn").length,
      // What this area is worth against the whole score, so one weak area of six
      // is not read as one sixth of the problem.
      weightShare: allWeight > 0 ? Math.round((areaAllWeight / allWeight) * 100) : 0,
      // Coverage is PER AREA: the overall caveat is not transferable, because a
      // page can be fully readable for Technical and unreadable for Content.
      coveragePct: areaAllWeight > 0 ? Math.round((weight / areaAllWeight) * 100) : 0,
      worst: measurable.filter((f) => f.severity !== "pass").sort((a, b) => b.weight - a.weight)[0]?.label || "",
      note: measurable.length
        ? ""
        : `Nothing in ${area} could be read on this page, so it has no score. That is not a zero — it is an unknown, and it usually means the page renders in the browser.`,
    };
  });
}

export async function crawlSite(rawUrl: string): Promise<CrawlReport> {
  const url = normaliseUrl(rawUrl);
  if (!url) return { ok: false, url: rawUrl, https: false, score: 0, grade: "F", findings: [], error: "That doesn't look like a valid website address." };

  // REFUSED BEFORE A SOCKET IS OPENED, and with the actual reason. This endpoint
  // is public and fetches whatever it is handed, so "the destination" is as much
  // an input to validate as the caller's rate. Saying why also matters: the
  // person on the other end has usually mistyped something, and a generic "could
  // not be read" makes the audit look broken rather than the address wrong.
  const blocked = blockedUrlReason(url, { allowLoopback: process.env.NODE_ENV === "test" });
  if (blocked) return { ok: false, url, https: url.startsWith("https:"), score: 0, grade: "F", findings: [], error: blocked };

  const page = await fetchPage(url);
  if (!page) {
    const block = classifyBlock(0, "", null);
    return { ok: false, url, https: url.startsWith("https:"), score: 0, grade: "F", findings: [], block, error: `${block.message} ${block.action}`.trim() };
  }

  const { html, status, finalUrl, ms } = page;

  // A challenge page answers with a full HTML document. Audit it and every
  // number below would describe the interstitial, not the customer's site — so
  // say what happened and who to ask, rather than inventing a report.
  const block = classifyBlock(status, html, page.headers);
  if (block.blocked) {
    return {
      ok: false, url, finalUrl, httpStatus: status, https: finalUrl.startsWith("https:"), loadMs: ms,
      score: 0, grade: "F", findings: [], block,
      error: `${block.message} ${block.action}`.trim(),
    };
  }
  const https = finalUrl.startsWith("https:");
  const origin = (() => { try { return new URL(finalUrl).origin; } catch { return url; } })();
  const host = (() => { try { return new URL(finalUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();

  // ---- measure ----
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim() || undefined;
  const metaDescription = metaContent(html, "description");
  const viewport = /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html);
  const canonical = /<link[^>]+rel\s*=\s*["']canonical["']/i.test(html);
  const robotsMeta = metaContent(html, "robots") || "";
  const noindex = /noindex/i.test(robotsMeta);
  const langMatch = html.match(/<html[^>]+lang\s*=\s*["']([^"']+)["']/i);
  const h1s = html.match(/<h1[\s>]/gi) || [];
  const ogTitle = metaContent(html, "og:title");
  const ogImage = metaContent(html, "og:image");
  const twitterCard = metaContent(html, "twitter:card");
  const ldJson = html.match(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const sdTypes: string[] = [];
  for (const block of ldJson) { const m = block.match(/"@type"\s*:\s*"([^"]+)"/g); if (m) for (const t of m) sdTypes.push(t.replace(/.*"@type"\s*:\s*"([^"]+)".*/, "$1")); }
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter((t) => !/\balt\s*=\s*["'][^"']*["']/i.test(t) || /\balt\s*=\s*["']["']/i.test(t)).length;
  const links = html.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi) || [];
  let internal = 0, external = 0;
  for (const l of links) {
    const href = attr(l, "href") || "";
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) { (href.includes(host) ? internal++ : external++); } else internal++;
  }
  const wordCount = stripTags(html).split(/\s+/).filter(Boolean).length;

  // ---- deeper measures, all from the HTML already fetched ----
  //
  // The audit reported seventeen things and three of them were shown for free —
  // which was not enough to be worth an email address, and none of it spoke to a
  // local business about enquiries. Everything below is read from the same
  // document, so the crawl costs exactly what it cost before.
  const bodyOnly = html.replace(/<head[\s\S]*?<\/head>/i, "");

  // THE CONTACT FAMILY, AS PREDICATES OVER ANY PAGE.
  //
  // Written once and applied to every page the crawl reads. They were inline
  // tests against the landing page's HTML, and answering the same question
  // about a second page meant writing the same regex again — two copies of
  // "what counts as a phone number" that could disagree, in the checks whose
  // wrongness is most expensive.
  const text = (h: string) => stripTags(h.replace(/<head[\s\S]*?<\/head>/i, ""));
  const hasPhoneLink = (h: string) => /href\s*=\s*["']tel:[^"']+["']/i.test(h);
  /** A phone number as plain text, in the shapes a UK business writes one. */
  const hasPhoneText = (h: string) => /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\d\b/.test(text(h));
  const hasContactRoute = (h: string) => /href\s*=\s*["'](?:tel|mailto):[^"']+["']/i.test(h) || /<form\b/i.test(h);
  /** A UK postcode is the cheapest reliable evidence of a real address. */
  const hasAddress = (h: string) => /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i.test(text(h));
  const localSchema = sdTypes.some((t) => /LocalBusiness|Organization|Store|ProfessionalService|HomeAndConstructionBusiness/i.test(t));
  // Insecure assets on a secure page: blocked or padlock-downgraded by browsers.
  const mixed = https ? (html.match(/(?:src|href)\s*=\s*["']http:\/\/[^"']+["']/gi) || []).length : 0;
  const bytes = Buffer.byteLength(html, "utf8");
  const headHtml = html.match(/<head[\s\S]*?<\/head>/i)?.[0] || "";
  const blockingScripts = (headHtml.match(/<script\b(?![^>]*\b(?:async|defer|type\s*=\s*["']application\/ld\+json["']))[^>]*\bsrc\s*=/gi) || []).length;
  const favicon = /<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(html);
  const h2s = (html.match(/<h2[\s>]/gi) || []).length;
  const socialLinks = (html.match(/href\s*=\s*["']https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin|x|twitter|youtube|tiktok)\.com\/[^"']+["']/gi) || []).length;
  // A stale footer year is what a careful customer reads as "closed down".
  const thisYear = new Date().getUTCFullYear();
  const years = (stripTags(bodyOnly).match(/(?:©|&copy;|copyright)\s*(\d{4})/gi) || []).map((m) => Number(m.replace(/\D/g, "")));
  const staleYear = years.length > 0 && Math.max(...years) < thisYear - 1;

  // Both spellings of the address must answer. This is the fault that also
  // silently breaks payment webhooks — a provider that does not follow redirects
  // posts to the half that does not answer and records a failure for ever.
  const altHost = (() => {
    try {
      const u = new URL(origin);
      u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
      return u.origin;
    } catch { return ""; }
  })();

  // The contact-ish pages are fetched IN PARALLEL with the two existence
  // probes, so answering "can a customer reach this business" costs the crawl
  // no extra wall-clock beyond the slowest single request.
  const candidates = contactCandidates(html, origin, finalUrl);
  const [robotsTxt, sitemapXml, altReachable, extraPages] = await Promise.all([
    exists(`${origin}/robots.txt`),
    exists(`${origin}/sitemap.xml`),
    altHost ? exists(altHost) : Promise.resolve(true),
    Promise.all(candidates.map((u) => fetchPage(u, 8_000).catch(() => null))),
  ]);

  // Every page actually read, the landing page first. The contact family is
  // answered from ALL of them; everything else stays a statement about the one
  // page, and says so.
  const readPages: { url: string; html: string }[] = [
    { url: finalUrl, html },
    ...extraPages.filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.status >= 200 && p!.status < 300)
      .map((p) => ({ url: p.finalUrl, html: p.html })),
  ];
  const otherPages = readPages.slice(1);
  /** A short name for a page, for a sentence a human reads. */
  const pageName = (u: string) => { try { return new URL(u).pathname.replace(/\/$/, "") || "/"; } catch { return u; } };

  // ---- score from measured checks ----
  const findings: Finding[] = [];
  const add = (area: Finding["area"], label: string, ok: boolean, weight: number, passDetail: string, failDetail: string, warn = false, notApplicable = "") =>
    findings.push({
      area, label, weight,
      // A check that does not apply is never dressed as a pass. A point awarded
      // for a question we did not ask is the same lie as a point deducted for
      // one they could not answer.
      severity: ok ? "pass" : warn ? "warn" : "fail",
      detail: ok ? passDetail : failDetail,
      ...(notApplicable ? { applicable: false, notApplicable } : {}),
    });

  add("Technical", "HTTPS", https, 10, "Served over HTTPS.", "Not served over HTTPS — a ranking + trust negative.");
  add("Technical", "Reachable (2xx)", status >= 200 && status < 400, 8, `Responded ${status}.`, `Returned HTTP ${status}.`);
  add("Technical", "Load time", ms < 2500, 6, `First byte in ${ms}ms.`, `Slow first response (${ms}ms) — trim page weight / server time.`, ms < 5000);
  add("SEO", "Title tag", Boolean(title && title.length >= 15 && title.length <= 65), 10, `Title present (${title?.length} chars).`, title ? `Title length ${title.length} — aim 15-65 chars.` : "No <title> tag.", Boolean(title));
  add("SEO", "Meta description", Boolean(metaDescription && metaDescription.length >= 50 && metaDescription.length <= 165), 8, `Description present (${metaDescription?.length} chars).`, metaDescription ? `Description length ${metaDescription.length} — aim 50-165.` : "No meta description.", Boolean(metaDescription));
  add("SEO", "Single H1", h1s.length === 1, 7, "Exactly one H1.", h1s.length === 0 ? "No H1 heading." : `${h1s.length} H1s — use one primary H1.`, h1s.length > 0);
  add("SEO", "Canonical tag", canonical, 4, "Canonical link present.", "No canonical tag — add one to avoid duplicate-content dilution.", true);
  add("SEO", "Indexable", !noindex, 8, "Page is indexable.", "Page is set to NOINDEX — search engines are told to skip it.");
  add("SEO", "robots.txt", robotsTxt, 3, "robots.txt present.", "No robots.txt found.", true);
  add("SEO", "sitemap.xml", sitemapXml, 4, "sitemap.xml present.", "No sitemap.xml found — add one to help crawling.", true);
  add("Mobile", "Viewport meta", viewport, 9, "Mobile viewport set.", "No viewport meta — the page won't scale on mobile.");
  add("Mobile", "Lang attribute", Boolean(langMatch), 3, `Language set (${langMatch?.[1]}).`, "No <html lang> — set it for accessibility/SEO.", true);
  add("Content", "Content depth", wordCount >= 250, 6, `${wordCount} words of content.`, `Only ${wordCount} words — thin content ranks poorly.`, wordCount >= 100);
  add("Content", "Image alt text", imgs.length === 0 || imgsNoAlt === 0, 5, imgs.length ? "All images have alt text." : "No images.", `${imgsNoAlt}/${imgs.length} images missing alt text.`, imgsNoAlt < imgs.length);
  add("Social", "Open Graph", Boolean(ogTitle && ogImage), 5, "Open Graph tags present (rich social previews).", "Missing Open Graph title/image — links share without a preview.", Boolean(ogTitle || ogImage));
  add("Social", "Twitter card", Boolean(twitterCard), 2, "Twitter card present.", "No Twitter card meta.", true);
  add("Structured data", "Schema.org", sdTypes.length > 0, 6, `Structured data present (${[...new Set(sdTypes)].slice(0, 5).join(", ")}).`, "No schema.org structured data — you miss rich results.", true);

  // ---- the deeper set: what a local business is actually judged on ----
  // ---- the three questions about the BUSINESS, answered from every page read
  //
  // These used to be answered from the landing page alone and worded as if they
  // described the site. On a site whose homepage links to /contact, that
  // produced "There is no obvious way to get in touch" beside a working contact
  // page — a false accusation, in the report the whole platform is sold on.
  const somewhere = (test: (h: string) => boolean) => readPages.find((p) => test(p.html));
  const wherePhoneLink = somewhere(hasPhoneLink);
  const wherePhoneText = somewhere(hasPhoneText);
  const whereContact = somewhere(hasContactRoute);
  const whereAddress = somewhere(hasAddress);
  /** "on this page" or "on /contact" — the report must say WHERE it looked. */
  const at = (p?: { url: string }) => (!p || p.url === finalUrl ? "on this page" : `on ${pageName(p.url)}`);
  const alsoRead = otherPages.length
    ? ` We also read ${otherPages.map((p) => pageName(p.url)).join(" and ")}.`
    : candidates.length
      ? ` We tried ${candidates.map(pageName).join(" and ")} and could not read ${candidates.length === 1 ? "it" : "them"}.`
      : "";

  // NOT EVERY BUSINESS IS A SHOP. Decided from positive evidence that this is
  // software — never from the absence of local evidence, which would silence
  // the check for exactly the local businesses it exists for.
  const softwareSite = siteIsSoftware(html, sdTypes, Boolean(whereAddress) || localSchema);
  const notLocal = softwareSite
    ? "This reads as a software or API business rather than a local one, so we are not counting a missing shopfront detail against you."
    : "";

  add("Content", "Phone number", Boolean(wherePhoneLink), 9,
    `A tappable phone link is ${at(wherePhoneLink)}.`,
    wherePhoneText
      ? `A phone number appears as text ${at(wherePhoneText)} but is not a tel: link, so it cannot be dialled with a tap.`
      : `No phone number on this page${otherPages.length ? ` or on ${otherPages.map((p) => pageName(p.url)).join(" or ")}` : ""}.${alsoRead && otherPages.length ? "" : alsoRead}`,
    Boolean(wherePhoneText), notLocal);
  add("Content", "Contact route", Boolean(whereContact), 9,
    `There is a way to make contact — a phone link, an email link or a form ${at(whereContact)}.`,
    `No phone link, email link or form on this page${otherPages.length ? `, or on ${otherPages.map((p) => pageName(p.url)).join(" or ")}` : ""}.${alsoRead && otherPages.length ? "" : alsoRead}`);
  add("SEO", "Local address", Boolean(whereAddress), 6,
    `A postal address is ${at(whereAddress)}.`,
    `No address or postcode found${otherPages.length ? ` on this page or on ${otherPages.map((p) => pageName(p.url)).join(" or ")}` : " on this page"} — local search needs to see where you are.`, true, notLocal);
  add("Structured data", "Local business schema", localSchema, 6, "Local business markup present.", "No LocalBusiness or Organization markup — search engines have to guess your address, hours and phone.", true, notLocal);
  add("Technical", "Mixed content", mixed === 0, 7, https ? "No insecure assets on a secure page." : "Not applicable — the page is not served over HTTPS.", `${mixed} asset${mixed === 1 ? "" : "s"} loaded over plain http on a secure page — browsers block or downgrade these.`);
  add("Technical", "Page weight", bytes < 500_000, 5, `Page HTML is ${Math.round(bytes / 1024)}KB.`, `Page HTML is ${Math.round(bytes / 1024)}KB — heavy for a phone on mobile data.`, bytes < 1_000_000);
  add("Technical", "Render-blocking scripts", blockingScripts === 0, 5, "No render-blocking scripts in the head.", `${blockingScripts} script${blockingScripts === 1 ? "" : "s"} in the head block the page from drawing.`, blockingScripts <= 2);
  add("Technical", "Favicon", favicon, 2, "Favicon set.", "No favicon — the browser tab and bookmarks show a blank icon.", true);
  add("Content", "Heading structure", h2s > 0, 4, `${h2s} subheading${h2s === 1 ? "" : "s"} break up the page.`, "No H2 subheadings — the page reads as one block and gets scanned past.", true);
  add("Social", "Social profiles", socialLinks > 0, 3, `${socialLinks} social profile link${socialLinks === 1 ? "" : "s"}.`, "No links to social profiles.", true);
  add("Content", "Copyright year", !staleYear, 3, "Footer year is current.", `The footer says ${years.length ? Math.max(...years) : "an old year"} — a careful customer reads that as closed down.`, true);
  add("Technical", "www and root both work", altReachable, 6, "Both the www and root addresses answer.", `${altHost || "The other spelling of your address"} does not answer — anyone who types it that way, or has it printed on a van, gets nothing.`, true);

  // ---- what the HTML could not tell us ----
  //
  // On a JavaScript-rendered page the content checks did not fail, they were
  // never readable. A PASS still stands — finding a title proves there is one —
  // but an absence proves nothing, so those are marked unmeasured and left out
  // of the score rather than counted against a page that may be perfectly good.
  const renderGap = detectRenderGap(html);
  if (renderGap.jsShell) {
    // The rule is about PRESENCE, not about the verdict. If the artefact is in
    // the HTML, whatever we measured about it is real — a title of 11 characters
    // is genuinely too short whether or not the rest of the page is rendered.
    // Only when we found nothing at all is the answer unknown, and that cuts
    // both ways: "No images." is not a pass on a document that has no body yet.
    const found = new Map<string, boolean>([
      ["Title tag", Boolean(title)],
      ["Meta description", Boolean(metaDescription)],
      ["Single H1", h1s.length > 0],
      ["Canonical tag", canonical],
      ["Content depth", false], // the quantity of prose is the very thing in doubt
      ["Image alt text", imgs.length > 0],
      ["Open Graph", Boolean(ogTitle || ogImage)],
      ["Twitter card", Boolean(twitterCard)],
      ["Schema.org", sdTypes.length > 0],
    ]);
    for (const f of findings) {
      if (found.get(f.label) !== false) continue;
      f.severity = "warn";
      f.measured = false;
      f.detail = `Not in the HTML — but this page renders in the browser, so we cannot tell whether it is on the finished page. Not counted for or against your score. ${f.detail}`;
    }
    findings.push({
      area: "Technical",
      label: "Rendered by JavaScript",
      severity: "warn",
      weight: 8,
      measured: true,
      detail: renderGap.note,
    });
  }

  // Excluded from the score for two different reasons, both honest: we could
  // not read it, or it is not a question about this business.
  const scored = findings.filter((f) => f.measured !== false && f.applicable !== false);

  // ONE SCORING RULE, APPLIED TO WHATEVER SET IT IS GIVEN.
  //
  // The overall score and the per-area scores must never be able to disagree, so
  // there is one function and the only difference is which findings go in. A
  // second copy computing "the SEO score" its own way is two numbers that drift
  // the first time either is edited — and both are printed on the same page.
  const tally = (list: Finding[]) => {
    const earned = list.reduce((s, f) => s + (f.severity === "pass" ? f.weight : f.severity === "warn" ? f.weight * 0.5 : 0), 0);
    const weight = list.reduce((s, f) => s + f.weight, 0);
    return { earned, weight, score: weight > 0 ? Math.round((earned / weight) * 100) : 0 };
  };

  const overall = tally(scored);
  const earned = overall.earned;
  const total = overall.weight;
  const score = overall.score;

  const areaScores = scoreByArea(findings);

  // The score has to carry its own coverage or it lies by omission.
  //
  // On a JavaScript-rendered page most checks are unknown, so the average of
  // the handful we COULD read comes out high — a shell scored 89/B in testing
  // while a real, fully-readable page scored 77. Publishing a bare "B" there
  // tells a customer their site is fine when what we actually established is
  // that we could not see it. The number stays honest; it just never travels
  // without the share of the audit it was computed from.
  const allWeight = findings.reduce((s, f) => s + f.weight, 0);
  const coveragePct = allWeight > 0 ? Math.round((total / allWeight) * 100) : 0;
  const unreadable = findings.filter((f) => f.measured === false).map((f) => f.label);

  return {
    ok: true, url, finalUrl, httpStatus: status, https, loadMs: ms, htmlBytes: html.length, renderGap,
    score, grade: grade(score), coveragePct, unreadable,
    // The same score, cut by area. "How is my SEO?" is the question people
    // arrive with; one number for the whole site cannot answer it.
    areaScores,
    scoreNote: coveragePct >= 100
      ? ""
      : `This score is computed from the ${coveragePct}% of the audit we could actually read in the HTML. ${unreadable.length} check(s) — ${unreadable.join(", ")} — are unknown because this page renders in the browser, and they are counted neither for nor against you. Treat ${score}/100 as "of what was readable", not as a verdict on the page.`,
    title, metaDescription, h1Count: h1s.length, wordCount,
    imagesTotal: imgs.length, imagesNoAlt: imgsNoAlt, internalLinks: internal, externalLinks: external,
    robotsTxt, sitemapXml, structuredDataTypes: [...new Set(sdTypes)].slice(0, 8),
    pagesRead: readPages.map((pg) => pg.url),
    pagesTried: candidates.filter((c) => !readPages.some((pg) => pg.url === c)),
    findings: findings.sort((a, b) => (a.severity === b.severity ? b.weight - a.weight : a.severity === "fail" ? -1 : b.severity === "fail" ? 1 : a.severity === "warn" ? -1 : 1)),
  };
}
