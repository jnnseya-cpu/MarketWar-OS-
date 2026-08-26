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

      const buf = await res.arrayBuffer();
      const html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 1_500_000));
      // Headers come back too: a 403 from Cloudflare and a 403 from an origin are
      // different problems with different fixes, and only the headers say which.
      return { status: res.status, finalUrl: current, html, ms: Date.now() - start, headers: res.headers };
    }
    return null; // too many hops
  } catch { return null; } finally { clearTimeout(t); }
}

async function exists(url: string, timeoutMs = 7_000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, method: "GET", headers: { "User-Agent": "MarketWarBot/1.0" } });
    return res.ok;
  } catch { return false; } finally { clearTimeout(t); }
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

function grade(score: number): CrawlReport["grade"] {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
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
  const telLinks = (html.match(/href\s*=\s*["']tel:[^"']+["']/gi) || []).length;
  const mailtoLinks = (html.match(/href\s*=\s*["']mailto:[^"']+["']/gi) || []).length;
  const hasForm = /<form\b/i.test(html);
  // A phone number as plain text, in the shapes a UK business writes one.
  const phoneText = /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\d\b/.test(stripTags(bodyOnly));
  // A UK postcode is the cheapest reliable evidence of a real address on a page.
  const postcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i.test(stripTags(bodyOnly));
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

  const [robotsTxt, sitemapXml, altReachable] = await Promise.all([
    exists(`${origin}/robots.txt`),
    exists(`${origin}/sitemap.xml`),
    altHost ? exists(altHost) : Promise.resolve(true),
  ]);

  // ---- score from measured checks ----
  const findings: Finding[] = [];
  const add = (area: Finding["area"], label: string, ok: boolean, weight: number, passDetail: string, failDetail: string, warn = false) =>
    findings.push({ area, label, severity: ok ? "pass" : warn ? "warn" : "fail", detail: ok ? passDetail : failDetail, weight });

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
  add("Content", "Phone number", telLinks > 0, 9, `A tappable phone link is on the page.`, phoneText ? "A phone number appears as text but is not a tel: link, so it cannot be dialled with a tap." : "No phone number found on the page.", phoneText);
  add("Content", "Contact route", telLinks + mailtoLinks > 0 || hasForm, 9, "There is a way to make contact from this page.", "No phone link, email link or form on this page.");
  add("SEO", "Local address", postcode, 6, "A postal address is on the page.", "No address or postcode found — local search needs to see where you are.", true);
  add("Structured data", "Local business schema", localSchema, 6, "Local business markup present.", "No LocalBusiness or Organization markup — search engines have to guess your address, hours and phone.", true);
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

  const scored = findings.filter((f) => f.measured !== false);
  const earned = scored.reduce((s, f) => s + (f.severity === "pass" ? f.weight : f.severity === "warn" ? f.weight * 0.5 : 0), 0);
  const total = scored.reduce((s, f) => s + f.weight, 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;

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
    scoreNote: coveragePct >= 100
      ? ""
      : `This score is computed from the ${coveragePct}% of the audit we could actually read in the HTML. ${unreadable.length} check(s) — ${unreadable.join(", ")} — are unknown because this page renders in the browser, and they are counted neither for nor against you. Treat ${score}/100 as "of what was readable", not as a verdict on the page.`,
    title, metaDescription, h1Count: h1s.length, wordCount,
    imagesTotal: imgs.length, imagesNoAlt: imgsNoAlt, internalLinks: internal, externalLinks: external,
    robotsTxt, sitemapXml, structuredDataTypes: [...new Set(sdTypes)].slice(0, 8),
    findings: findings.sort((a, b) => (a.severity === b.severity ? b.weight - a.weight : a.severity === "fail" ? -1 : b.severity === "fail" ? 1 : a.severity === "warn" ? -1 : 1)),
  };
}
