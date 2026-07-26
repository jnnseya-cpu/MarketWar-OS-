// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Site crawler — a REAL, measured website audit. Fetches the page (server-side)
// and inspects the actual HTML for SEO/technical/social/mobile/content signals,
// plus robots.txt and sitemap.xml. Every finding is measured from the live page,
// not modelled. This is what turns Website Intel from a deterministic estimate
// into a genuine audit. No third-party service, no key.

export type Severity = "pass" | "warn" | "fail";
export type Finding = { area: "SEO" | "Technical" | "Mobile" | "Social" | "Content" | "Structured data"; label: string; severity: Severity; detail: string; weight: number };
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
  error?: string;
};

function normaliseUrl(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withScheme); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

async function fetchPage(url: string, timeoutMs = 12_000): Promise<{ status: number; finalUrl: string; html: string; ms: number } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketWarBot/1.0; +https://marketwaros.com)", Accept: "text/html,application/xhtml+xml" } });
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 1_500_000));
    return { status: res.status, finalUrl: res.url || url, html, ms: Date.now() - start };
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

  const page = await fetchPage(url);
  if (!page) return { ok: false, url, https: url.startsWith("https:"), score: 0, grade: "F", findings: [], error: "Couldn't reach the site (timeout, blocked, or offline). Some hosts block automated requests." };

  const { html, status, finalUrl, ms } = page;
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

  const [robotsTxt, sitemapXml] = await Promise.all([exists(`${origin}/robots.txt`), exists(`${origin}/sitemap.xml`)]);

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

  const earned = findings.reduce((s, f) => s + (f.severity === "pass" ? f.weight : f.severity === "warn" ? f.weight * 0.5 : 0), 0);
  const total = findings.reduce((s, f) => s + f.weight, 0);
  const score = Math.round((earned / total) * 100);

  return {
    ok: true, url, finalUrl, httpStatus: status, https, loadMs: ms, htmlBytes: html.length,
    score, grade: grade(score),
    title, metaDescription, h1Count: h1s.length, wordCount,
    imagesTotal: imgs.length, imagesNoAlt: imgsNoAlt, internalLinks: internal, externalLinks: external,
    robotsTxt, sitemapXml, structuredDataTypes: [...new Set(sdTypes)].slice(0, 8),
    findings: findings.sort((a, b) => (a.severity === b.severity ? b.weight - a.weight : a.severity === "fail" ? -1 : b.severity === "fail" ? 1 : a.severity === "warn" ? -1 : 1)),
  };
}
