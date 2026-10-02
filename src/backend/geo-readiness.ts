// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// GEO / AI-answer readiness — MEASURED, never guessed.
//
// The LLM agent version of this invented everything: it assumed what the business
// sold ("Assumed: VeryX = UK DTC e-commerce store" in one run, "vape/e-liquid
// brand" in the next) and printed invented scores ("18/100", "18% citation share
// vs 41%") as if they were measurements. That breaks the platform's honesty rule
// and is indefensible in front of a customer.
//
// Every signal here is fetched from the live site and checked in code:
//   • JSON-LD schema (Organization / Product / FAQ) — parsed from the HTML
//   • llms.txt — does it exist?
//   • robots.txt — are GPTBot / ClaudeBot / PerplexityBot allowed or blocked?
//   • FAQ content, hreflang, freshness (sitemap lastmod / dated content)
// The score is computed from those facts. What can't be measured is reported as
// "unknown", never filled in with a number.

import { detectRenderGap } from "@/backend/render-gap";
import { AI_CRAWLERS, blockedAiCrawlers } from "@/shared/ai-readability";

const UA = "Mozilla/5.0 (compatible; MarketWarBot/1.0; +https://marketwaros.com)";

async function get(url: string, timeoutMs = 10_000): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,text/plain,*/*" } });
    clearTimeout(t);
    const text = res.ok ? (await res.text()).slice(0, 400_000) : "";
    return { ok: res.ok, status: res.status, text };
  } catch { return { ok: false, status: 0, text: "" }; }
}

export type GeoCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "unknown";
  score: number;        // 0–100 for this check
  weight: number;       // contribution to the overall score
  evidence: string;     // WHAT WAS OBSERVED — quotable, not invented
  fix?: string;
  autoFixable?: boolean;
};

export type GeoReport = {
  url: string;
  reachable: boolean;
  measuredAt: string;
  score: number;              // weighted 0–100, computed from the checks below
  grade: "A" | "B" | "C" | "D" | "F";
  checks: GeoCheck[];
  detectedBusiness: string | null;  // what the SITE says it is — null if unknown
  // Folded in from the standalone checkers so ONE run answers all of them.
  serpPreview?: { title: string; description: string; displayUrl: string };
  sitemap?: { found: boolean; urlCount: number };
  note: string;
};

// THE CRAWLER LIST AND THE ROBOTS PARSER BOTH COME FROM `shared/ai-readability`.
//
// THIS FILE USED TO CARRY ITS OWN OF EACH, and the two disagreed in the worst
// possible direction. The free audit's list names ten crawlers; the one here
// named six, and the four it was missing included **OAI-SearchBot — the crawler
// that builds ChatGPT's search index** — plus ChatGPT-User, Bingbot (Copilot)
// and Applebot-Extended.
//
// Demonstrated against real robots.txt bodies before it was changed: a site
// whose robots.txt says `User-agent: OAI-SearchBot / Disallow: /` was told by
// THIS report, the paid one, that "No AI crawler is blocked" — while the free
// audit on the same bytes said "BLOCKED OAI-SearchBot". A customer paying for a
// GEO report was being cleared on the single question that decides whether they
// can appear in ChatGPT, and `ai-citation.ts` builds its action playbook from
// this report, so the fix was never recommended either.
//
// The parser here was also the weaker of the two: it did not strip `#` comments
// and did not apply the last-group-wins rule, so a file that blocks everything
// and then re-allows one crawler was read wrongly. `blockedAiCrawlers` handles
// both and has the tests.
//
// Rule 6 of the engineering directive: one source of truth per concept.

// Collect JSON-LD @type values actually present in the HTML.
function schemaTypes(html: string): string[] {
  const types = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          const t = o["@type"];
          if (typeof t === "string") types.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
          Object.values(o).forEach(walk);
        }
      };
      walk(JSON.parse(m[1].trim()));
    } catch { /* malformed block — ignore, it also wouldn't parse for a crawler */ }
  }
  // Microdata fallback
  for (const m of html.matchAll(/itemtype=["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)) types.add(m[1]);
  return [...types];
}

// What does the SITE say it does? Read it — never assume.
function detectBusiness(html: string): string | null {
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,300})["']/i.exec(html)?.[1]
    || /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,300})["']/i.exec(html)?.[1];
  if (meta) return meta.trim();
  const title = /<title[^>]*>([^<]{5,140})<\/title>/i.exec(html)?.[1];
  return title ? title.trim() : null;
}

export async function geoReadiness(rawUrl: string): Promise<GeoReport> {
  const measuredAt = new Date().toISOString();
  let url = (rawUrl || "").trim();
  if (!url) return { url: "", reachable: false, measuredAt, score: 0, grade: "F", checks: [], detectedBusiness: null, note: "No URL supplied." };
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let origin: string;
  try { origin = new URL(url).origin; } catch { return { url, reachable: false, measuredAt, score: 0, grade: "F", checks: [], detectedBusiness: null, note: "That URL isn't valid." }; }

  const [home, llms, robots, sitemap] = await Promise.all([
    get(url), get(`${origin}/llms.txt`), get(`${origin}/robots.txt`), get(`${origin}/sitemap.xml`),
  ]);

  if (!home.ok) {
    return { url, reachable: false, measuredAt, score: 0, grade: "F", checks: [], detectedBusiness: null,
      note: `Couldn't fetch ${url} (HTTP ${home.status || "no response"}). Nothing is scored — no measurement, no guess.` };
  }

  const html = home.text;
  const types = schemaTypes(html);
  const checks: GeoCheck[] = [];

  // 1) Structured data
  const hasOrg = types.some((t) => /^(Organization|LocalBusiness|Corporation|Store)$/i.test(t));
  const hasProduct = types.some((t) => /^(Product|Offer|Service)$/i.test(t));
  const hasFaqSchema = types.some((t) => /^FAQPage$/i.test(t));
  checks.push({
    id: "schema", label: "Structured data (schema.org)", weight: 25,
    status: hasOrg && hasProduct ? "pass" : hasOrg || hasProduct ? "warn" : "fail",
    score: (hasOrg ? 50 : 0) + (hasProduct ? 35 : 0) + (hasFaqSchema ? 15 : 0),
    evidence: types.length ? `Found on the homepage: ${types.join(", ")}.` : "No JSON-LD or microdata found on the homepage.",
    fix: hasOrg && hasProduct ? undefined : "Publish Organization + Product/Service JSON-LD so AI can read your name, price and offer.",
    autoFixable: true,
  });

  // 2) llms.txt
  checks.push({
    id: "llms", label: "llms.txt (AI crawler guidance)", weight: 15,
    status: llms.ok ? "pass" : "fail", score: llms.ok ? 100 : 0,
    evidence: llms.ok ? `Present at ${origin}/llms.txt (${llms.text.length} bytes).` : `Not found at ${origin}/llms.txt (HTTP ${llms.status || "no response"}).`,
    fix: llms.ok ? undefined : "Publish llms.txt describing your brand, products and key pages for AI answer engines.",
    autoFixable: true,
  });

  // 3) AI crawler access (robots.txt) — measured, not assumed, and measured
  //    against the SAME ten crawlers the free audit checks.
  const blockedBots = robots.ok ? blockedAiCrawlers(robots.text) : [];
  checks.push({
    id: "crawlers", label: "AI crawler access (robots.txt)", weight: 20,
    status: !robots.ok ? "unknown" : blockedBots.length ? "fail" : "pass",
    score: !robots.ok ? 50 : blockedBots.length ? 0 : 100,
    evidence: !robots.ok
      ? `No robots.txt at ${origin}/robots.txt (HTTP ${robots.status || "no response"}) — crawlers are allowed by default.`
      // NAME WHAT WAS BLOCKED AND WHAT IT FEEDS. "GPTBot is blocked" means
      // nothing to somebody who does not know GPTBot from Googlebot; "GPTBot,
      // which feeds ChatGPT" is the same fact and a decision they can make.
      : blockedBots.length
      ? `robots.txt BLOCKS ${blockedBots.length} of ${AI_CRAWLERS.length} AI crawlers: ${blockedBots.map((b) => `${b.name} (${b.feeds})`).join(", ")}.`
      // AND NAME THE COUNT THAT WAS CHECKED. The old line said "No AI crawler is
      // blocked" without saying how many it looked at, which is how six could
      // masquerade as all of them.
      : `None of the ${AI_CRAWLERS.length} AI crawlers is blocked — checked by name: ${AI_CRAWLERS.map((c) => c.name).join(", ")}.`,
    fix: blockedBots.length
      ? `Unblock ${blockedBots.map((b) => b.name).join(", ")} in robots.txt — while blocked you cannot appear in ${blockedBots.map((b) => b.feeds).join(", ")}.`
      : undefined,
  });

  // 4) Answerable content (FAQ / Q&A in plain text)
  const qCount = (html.match(/<h[2-4][^>]*>[^<]{8,120}\?\s*<\/h[2-4]>/gi) || []).length;
  const hasFaqWord = /\bfaq|frequently asked\b/i.test(html);
  checks.push({
    id: "answers", label: "Answerable content (FAQ / Q&A)", weight: 20,
    status: qCount >= 4 || hasFaqSchema ? "pass" : qCount > 0 || hasFaqWord ? "warn" : "fail",
    score: hasFaqSchema ? 100 : Math.min(100, qCount * 20) + (hasFaqWord ? 10 : 0),
    evidence: `${qCount} question-style heading${qCount === 1 ? "" : "s"} found${hasFaqSchema ? ", plus FAQPage schema" : ""}${hasFaqWord && !qCount ? '; the word "FAQ" appears but no question headings' : ""}.`,
    fix: qCount >= 4 ? undefined : "Add a plain-text FAQ answering real buyer questions — this is the format answer engines quote.",
    autoFixable: true,
  });

  // 5) Freshness — from sitemap lastmod / dated content
  const lastmods = [...sitemap.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)].map((m) => Date.parse(m[1])).filter((n) => !Number.isNaN(n));
  const newest = lastmods.length ? Math.max(...lastmods) : null;
  const days = newest ? Math.floor((Date.now() - newest) / 86_400_000) : null;
  checks.push({
    id: "freshness", label: "Freshness signal", weight: 10,
    status: days == null ? "unknown" : days <= 90 ? "pass" : days <= 365 ? "warn" : "fail",
    score: days == null ? 50 : days <= 90 ? 100 : days <= 365 ? 55 : 20,
    evidence: days == null ? `No sitemap lastmod dates found at ${origin}/sitemap.xml — freshness unknown, not scored as a failure.` : `Most recent sitemap lastmod is ${days} day${days === 1 ? "" : "s"} old.`,
    fix: days != null && days > 90 ? "Publish or refresh dated content — answer engines prefer recently updated sources." : undefined,
  });

  // 6) Locale clarity
  const hreflangs = [...html.matchAll(/hreflang=["']([^"']+)["']/gi)].map((m) => m[1]);
  const htmlLang = /<html[^>]+lang=["']([^"']+)["']/i.exec(html)?.[1] || null;
  checks.push({
    id: "locale", label: "Locale clarity (lang / hreflang)", weight: 10,
    status: hreflangs.length || htmlLang ? "pass" : "warn",
    score: hreflangs.length ? 100 : htmlLang ? 75 : 40,
    evidence: hreflangs.length ? `hreflang present: ${[...new Set(hreflangs)].slice(0, 6).join(", ")}.` : htmlLang ? `No hreflang, but <html lang="${htmlLang}"> is set.` : "No lang attribute and no hreflang found.",
    fix: hreflangs.length || htmlLang ? undefined : "Set <html lang> (and hreflang if you serve more than one region).",
  });

  // 7) On-page basics — folds the standalone H1 / Meta-description / SERP-preview
  // tools into this ONE run, so the user never has to walk nine separate checkers.
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  checks.push({
    id: "h1", label: "H1 heading", weight: 5,
    status: h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn",
    score: h1s.length === 1 ? 100 : h1s.length === 0 ? 0 : 60,
    evidence: h1s.length ? `${h1s.length} H1 found: "${h1s[0].slice(0, 80)}"${h1s.length > 1 ? " (multiple H1s dilute the topic)" : ""}.` : "No H1 on the homepage.",
    fix: h1s.length === 1 ? undefined : h1s.length === 0 ? "Add a single H1 stating what you sell and to whom." : "Keep exactly one H1 per page.",
  });

  const metaDesc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() || "";
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || "";
  checks.push({
    id: "meta", label: "Title + meta description", weight: 5,
    status: metaDesc.length >= 70 && metaDesc.length <= 165 && title.length >= 15 ? "pass" : metaDesc || title ? "warn" : "fail",
    score: (title.length >= 15 && title.length <= 65 ? 50 : title ? 30 : 0) + (metaDesc.length >= 70 && metaDesc.length <= 165 ? 50 : metaDesc ? 25 : 0),
    evidence: `Title ${title ? `${title.length} chars: "${title.slice(0, 70)}"` : "MISSING"}; meta description ${metaDesc ? `${metaDesc.length} chars` : "MISSING"}.`,
    fix: metaDesc.length >= 70 && metaDesc.length <= 165 && title.length >= 15 ? undefined : "Write a 50–60 char title and a 120–155 char meta description naming the product, audience and offer.",
    autoFixable: true,
  });

  // Server-rendered content.
  //
  // NOTE THE DIFFERENT VERDICT FROM THE SEO CRAWLER. There, a JavaScript-
  // rendered page means "we cannot tell", because Google runs the script and
  // will see the finished page. Here it is not an unknown at all — it is THE
  // finding. AI answer engines fetch raw HTML and do not execute JavaScript, so
  // whatever is missing from this response is missing from what they know about
  // this business. Every check above is measuring the same document they get.
  const render = detectRenderGap(html);
  checks.push({
    id: "server-rendered", label: "Content is in the HTML (not JS-rendered)", weight: 20,
    status: render.jsShell ? "fail" : "pass",
    score: render.jsShell ? 0 : 100,
    evidence: render.jsShell
      ? `The HTML carries ${render.words} word(s) and ${Math.round(render.scriptShare * 100)}% of it is script${render.framework ? ` (${render.framework})` : ""}. An AI assistant fetching this page reads that, and nothing else — your copy, headings and JSON-LD arrive only once a browser runs the bundle, which these crawlers do not do.`
      : `${render.words} word(s) of content are present in the HTML itself, so an assistant fetching this page can read it without running any JavaScript.`,
    fix: render.jsShell
      ? "Server-render (or statically pre-render) the title, the body copy and the JSON-LD. This is the single highest-value fix on this report: every other check above is scored against the same empty document the AI engines receive."
      : undefined,
  });

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(checks.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
  const grade: GeoReport["grade"] = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  return {
    url, reachable: true, measuredAt, score, grade, checks,
    detectedBusiness: detectBusiness(html),
    serpPreview: { title, description: metaDesc, displayUrl: origin.replace(/^https?:\/\//, "") },
    sitemap: { found: sitemap.ok, urlCount: (sitemap.text.match(/<loc>/gi) || []).length },
    note: "Every figure above was measured from your live site just now — schema parsed from the HTML, llms.txt and robots.txt fetched, freshness read from the sitemap. Nothing is estimated or assumed.",
  };
}
