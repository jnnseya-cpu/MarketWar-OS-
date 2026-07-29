// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Where the models got their answer from.
//
// The plan's top action says: "search the exact question yourself, open the top
// results, and get onto them." That is homework. This does it — searches each
// question the brand was absent from, fetches the pages that rank, and reports
// which of them actually list the rivals the assistants named.
//
// The premise, stated plainly so it can be argued with: an assistant answering
// "who are the best X in the UK" is not evaluating vendors. It is reproducing
// what the widely-read pages on that subject say. Those pages are findable —
// they are the ones that rank for the same question. A page that ranks AND
// names three of the four companies the assistants named is, on the balance of
// evidence, part of where the answer came from.
//
// WHAT THIS DOES NOT CLAIM. It cannot prove a model read a particular page; no
// vendor can, and one that says otherwise is guessing. So the wording is
// "carries the same names", never "the model used this". The corroboration is
// counted and shown, and a page that names nobody is reported as weak evidence
// rather than quietly dropped.

import { webSearch, type SearchResult } from "@/backend/search";
import { canonicalCompetitor, brandAliases } from "@/backend/ai-visibility";

const UA = "Mozilla/5.0 (compatible; MarketWarBot/1.0; +https://marketwaros.com)";

export type SourcePageKind =
  | "review-platform" | "directory" | "roundup" | "comparison"
  | "forum" | "vendor-site" | "unknown";

export type SourcePage = {
  url: string;
  domain: string;
  title: string;
  kind: SourcePageKind;
  /** Rivals from the run that this page names, checked in the fetched text. */
  namesRivals: string[];
  /** Is the customer already on it? */
  namesYou: boolean;
  /** Was the page actually fetched, or is this the search snippet only? */
  fetched: boolean;
  /** Which of the customer's questions surfaced it. */
  forQuestion: string;
  /** 0–100, from corroboration and page kind. Never a "score" we invent meaning for. */
  strength: number;
  /** What to actually do about this page. */
  route: string;
};

export type SourcesReport = {
  brand: string;
  pages: SourcePage[];
  /** Domains that recur across questions — the ones worth the effort. */
  priorityDomains: { domain: string; pages: number; rivalsNamed: number; youNamed: boolean }[];
  searched: number;
  fetched: number;
  live: boolean;
  note: string;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary matched, like every other name check here. Substrings invent citations. */
function mentions(text: string, name: string): boolean {
  const n = (name || "").trim();
  if (n.length < 3) return false;
  return new RegExp(`(?<!\\w)${escapeRe(n)}(?!\\w)`, "i").test(text);
}

export function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

// Kinds are judged from the URL and title. A guess, and labelled as one in the
// route text rather than presented as a classification we verified.
const REVIEW_DOMAINS = /(^|\.)(g2|capterra|trustpilot|trustradius|softwareadvice|getapp|sourceforge|checkatrade|trustatrader|yell|clutch|glassdoor)\./i;
const FORUM_DOMAINS = /(^|\.)(reddit|quora|stackexchange|stackoverflow|news\.ycombinator)\./i;

export function classifyPage(url: string, title: string, brandDomain: string): SourcePageKind {
  const d = domainOf(url);
  if (!d) return "unknown";
  if (brandDomain && (d === brandDomain || d.endsWith(`.${brandDomain}`))) return "vendor-site";
  if (REVIEW_DOMAINS.test(d)) return "review-platform";
  if (FORUM_DOMAINS.test(d)) return "forum";
  const t = `${title} ${url}`.toLowerCase();
  if (/\b(vs|versus|compare|comparison|alternative)/.test(t)) return "comparison";
  if (/\b(best|top\s*\d|leading|\d+\s+best)/.test(t)) return "roundup";
  if (/\b(directory|listings?|find-a|suppliers?|providers?)\b/.test(t)) return "directory";
  return "unknown";
}

/**
 * What to do about this page.
 *
 * Different kinds take completely different work, and telling someone to
 * "get listed" on a Reddit thread or on a rival's own website is useless
 * advice that costs them an afternoon.
 */
export function routeFor(kind: SourcePageKind, domain: string, namesYou: boolean): string {
  if (namesYou) return "You are already named here. Check the entry is current and says what you would want a model to repeat about you.";
  switch (kind) {
    case "review-platform":
      return `Claim or create your ${domain} profile, then ask real customers for reviews. These pages are quoted heavily and a profile is usually free.`;
    case "directory":
      return `Submit a listing to ${domain}. Directory submissions are the cheapest entry on this list — usually a form, sometimes a fee.`;
    case "roundup":
      return `Pitch the author of this round-up. Send what makes you different in two sentences plus the evidence, and offer a demo. Round-ups get updated far more often than people expect.`;
    case "comparison":
      return `A comparison page you are missing from. Ask to be added, or publish your own honest comparison covering the same companies — pages that compare are the ones models quote.`;
    case "forum":
      return `A community thread. Do not astroturf it: an obvious plant does more damage than absence. Answer the actual question as yourself, disclosing who you are.`;
    case "vendor-site":
      return "A competitor's own site. Nothing to do here — recorded so the list is complete.";
    default:
      return `Open this page and judge it yourself: if it lists companies like yours, find the contact or submission route on it.`;
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
    clearTimeout(t);
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 500_000);
    // Strip tags so a name inside a script or a stylesheet is not counted.
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  } catch { return ""; }
}

/**
 * Strength of the evidence that this page is part of what the models answer from.
 *
 * Corroboration is the whole signal: a page naming three of the four companies
 * the assistants named is a much better candidate than one naming a single
 * common brand. Page kind adjusts it, because a rival's own website ranking for
 * the question tells the customer nothing they can act on.
 */
export function strengthOf(kind: SourcePageKind, rivalsNamed: number, totalRivals: number, fetched: boolean): number {
  if (kind === "vendor-site") return 5;
  const corroboration = totalRivals ? Math.min(1, rivalsNamed / Math.min(3, totalRivals)) : 0;
  const base = Math.round(corroboration * 70);
  const kindBonus = kind === "review-platform" || kind === "directory" ? 20
    : kind === "roundup" || kind === "comparison" ? 15
    : kind === "forum" ? 5 : 0;
  // An unfetched page was judged on its search snippet alone. It must not rank
  // alongside one whose text we actually read.
  return Math.max(1, Math.min(100, base + kindBonus - (fetched ? 0 : 25)));
}

export type FindSourcesInput = {
  brand: string;
  brandDomain?: string;
  /** Questions the brand was absent from — the ones worth finding sources for. */
  questions: string[];
  /** Rivals the assistants named, used as the corroboration signal. */
  rivals: string[];
  location?: string;
};

export async function findCitationSources(
  input: FindSourcesInput,
  deps: { search?: typeof webSearch; fetchPage?: typeof fetchText } = {},
  opts: { deadline?: number; perQuestion?: number; concurrency?: number } = {},
): Promise<SourcesReport> {
  const search = deps.search ?? webSearch;
  const getPage = deps.fetchPage ?? fetchText;
  const deadline = opts.deadline ?? Date.now() + 40_000;
  const perQuestion = Math.max(1, Math.min(10, opts.perQuestion ?? 5));
  const concurrency = Math.max(1, opts.concurrency ?? 6);

  const aliases = brandAliases(input.brand, input.brandDomain);
  const rivals = [...new Map(input.rivals.map((r) => [canonicalCompetitor(r), r])).values()];
  const brandDomain = input.brandDomain ? domainOf(input.brandDomain.startsWith("http") ? input.brandDomain : `https://${input.brandDomain}`) : "";

  // 1) Search each question. Live search is the only part that needs a key, and
  //    a failure here is reported rather than filled in with plausible domains.
  let live = true;
  let providerNote = "";
  const found: { q: string; r: SearchResult }[] = [];
  for (const q of input.questions) {
    if (Date.now() > deadline - 8_000) break;
    const res = await search({ query: q, gl: input.location ? "uk" : undefined });
    if (res.mode !== "live") {
      live = false;
      providerNote = res.providerError?.reason || "Web search is not configured, so no real pages could be looked up.";
      break;
    }
    for (const r of res.results.slice(0, perQuestion)) if (r.link) found.push({ q, r });
  }

  if (!live) {
    return {
      brand: input.brand, pages: [], priorityDomains: [], searched: 0, fetched: 0, live: false,
      note: `${providerNote} Nothing is listed rather than a plausible-looking set of pages: a made-up directory would waste a real afternoon.`,
    };
  }

  // 2) Fetch each unique page and look for the names. Bounded and deadlined,
  //    for the same reason every other fan-out here is.
  const unique = [...new Map(found.map((f) => [f.r.link!, f])).values()];
  const pages: SourcePage[] = [];
  let next = 0, fetched = 0;
  const worker = async () => {
    while (next < unique.length) {
      const item = unique[next++];
      const url = item.r.link!;
      const remaining = deadline - Date.now();
      const text = remaining > 6_000 ? await getPage(url, Math.min(8_000, remaining - 2_000)) : "";
      if (text) fetched++;
      // Fall back to the search snippet so a page that would not load is still
      // reported, flagged as unfetched, rather than silently vanishing.
      const haystack = text || `${item.r.title} ${item.r.snippet || ""}`;
      const kind = classifyPage(url, item.r.title || "", brandDomain);
      const namesRivals = rivals.filter((r) => mentions(haystack, r));
      const namesYou = aliases.some((a) => mentions(haystack, a));
      pages.push({
        url, domain: domainOf(url), title: (item.r.title || url).slice(0, 160), kind,
        namesRivals, namesYou, fetched: Boolean(text), forQuestion: item.q,
        strength: strengthOf(kind, namesRivals.length, rivals.length, Boolean(text)),
        route: routeFor(kind, domainOf(url), namesYou),
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));

  pages.sort((a, b) => b.strength - a.strength || b.namesRivals.length - a.namesRivals.length);

  // 3) Domains that recur are worth more than a single strong page: appearing on
  //    one is likely to affect several of the questions at once.
  const byDomain = new Map<string, { domain: string; pages: number; rivalsNamed: number; youNamed: boolean }>();
  for (const p of pages) {
    if (!p.domain || p.kind === "vendor-site") continue;
    const cur = byDomain.get(p.domain) || { domain: p.domain, pages: 0, rivalsNamed: 0, youNamed: false };
    cur.pages++;
    cur.rivalsNamed = Math.max(cur.rivalsNamed, p.namesRivals.length);
    cur.youNamed = cur.youNamed || p.namesYou;
    byDomain.set(p.domain, cur);
  }
  const priorityDomains = [...byDomain.values()]
    .filter((d) => d.rivalsNamed > 0)
    .sort((a, b) => b.pages - a.pages || b.rivalsNamed - a.rivalsNamed)
    .slice(0, 10);

  const alreadyOn = pages.filter((p) => p.namesYou).length;
  return {
    brand: input.brand,
    pages: pages.slice(0, 30),
    priorityDomains,
    searched: input.questions.length,
    fetched,
    live: true,
    note: [
      `${unique.length} page(s) that rank for your questions, ${fetched} of them read in full.`,
      pages.length
        ? "Ranked by how many of the same companies the assistants named also appear on the page. That is corroboration, not proof — nobody can show which pages a model actually read, and anyone claiming to is guessing."
        : "None of the searches returned a usable page.",
      alreadyOn ? `You are already named on ${alreadyOn} of them — check those entries say what you would want repeated about you.` : "",
      pages.some((p) => !p.fetched)
        ? "Pages marked unread could not be loaded, so they were judged on their search snippet alone and ranked lower for it."
        : "",
    ].filter(Boolean).join(" "),
  };
}
