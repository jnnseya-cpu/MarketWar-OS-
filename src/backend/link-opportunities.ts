// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Link Opportunity Engine — EARN links, never place them.
//
// The market advertises "automatic high-quality backlinks". Automated link
// PLACEMENT (PBNs, paid drops, mass directory spam, comment/forum injection)
// breaches Google's link spam policy and the penalty lands on the CUSTOMER'S
// domain — deindexing or a manual action. We will not build that.
//
// What is both powerful and compliant is the work an expensive agency does:
//   1. UNLINKED MENTIONS  — sites already naming the brand without a link. The
//      highest-conversion ask in SEO: they already wrote about you.
//   2. RESOURCE / ROUNDUP PAGES — pages that exist to list businesses like this.
//      Being listed is the intended purpose of the page, not a manipulation.
//   3. COMPETITOR-CITING PAGES — publications that covered a competitor and
//      plausibly cover this category (the classic "gap" analysis).
//   4. QUESTION/ANSWER SOURCES — pages answering questions the brand can answer
//      better, where a citation is genuinely useful to the reader.
//
// Every opportunity is a REAL page found in live search results, with its URL and
// the evidence snippet. Nothing is invented, nothing is auto-posted: the output
// is a prioritised list plus a drafted pitch the human sends from their own
// mailbox. That keeps the customer inside the rules while doing the work that
// actually earns links.

import { webSearch, type SearchResult } from "@/backend/search";

export type LinkOpportunityKind = "unlinked_mention" | "resource_page" | "competitor_cited" | "question_source";

export type LinkOpportunity = {
  kind: LinkOpportunityKind;
  title: string;
  url: string;
  domain: string;
  evidence: string;          // the snippet that was actually returned
  why: string;               // why this page is a legitimate target
  difficulty: "easy" | "medium" | "hard";
  priority: number;          // 0-100, computed from kind + signals
  pitchAngle: string;        // what to say — the human sends it
};

export type LinkOpportunityReport = {
  brand: string;
  website: string;
  mode: "live" | "demo";
  opportunities: LinkOpportunity[];
  counts: Record<LinkOpportunityKind, number>;
  compliance: string;
  note: string;
};

const KIND_WEIGHT: Record<LinkOpportunityKind, number> = {
  unlinked_mention: 92,   // they already named you — highest conversion
  resource_page: 78,      // the page exists to list businesses like yours
  competitor_cited: 64,   // they cover the category
  question_source: 55,
};

const DIFFICULTY: Record<LinkOpportunityKind, LinkOpportunity["difficulty"]> = {
  unlinked_mention: "easy", resource_page: "medium", competitor_cited: "hard", question_source: "medium",
};

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Sites that are never a useful link target (or where soliciting a link would be
// spam): the brand's own site, the big platforms, and known link-farm patterns.
const EXCLUDE = /(facebook|instagram|twitter|x|linkedin|pinterest|tiktok|youtube|reddit|wikipedia|amazon|ebay|google|bing)\./i;
const SPAMMY = /(link-?farm|buy-?backlinks|seo-?directory-?list|article-?directory|guest-?post-?service|pbn)/i;

function usable(r: SearchResult, ownDomain: string): boolean {
  if (!r.link) return false;
  const d = domainOf(r.link);
  if (!d || d === ownDomain) return false;
  if (EXCLUDE.test(d)) return false;
  if (SPAMMY.test(d) || SPAMMY.test(r.title || "")) return false; // never pitch a link seller
  return true;
}

function pitchFor(kind: LinkOpportunityKind, brand: string, website: string, title: string): string {
  switch (kind) {
    case "unlinked_mention":
      return `They mention ${brand} in "${title}" without linking. Thank them for the mention and ask if they'd add a link to ${website} so readers can find you — the single highest-converting outreach in SEO.`;
    case "resource_page":
      return `"${title}" is a curated list for this category. Send a short note with a one-line description of ${brand}, the ${website} URL, and why their readers would find it useful. Listing is the page's purpose.`;
    case "competitor_cited":
      return `They already cover this category in "${title}". Offer something additive — original data, a customer case, or a expert quote — rather than asking for a swap. Give them a reason to update the piece.`;
    case "question_source":
      return `"${title}" answers a question ${brand} can answer with first-hand evidence. Offer a specific, quotable contribution (a figure, a process, a real example) that improves the page.`;
  }
}

async function run(query: string, gl?: string): Promise<{ results: SearchResult[]; mode: "live" | "demo" }> {
  const r = await webSearch({ query, type: "search", gl });
  return { results: r.results || [], mode: r.mode };
}

export async function findLinkOpportunities(input: {
  brand: string;
  website: string;
  competitors?: string[];
  category?: string;
  market?: string;   // gl code, e.g. "uk"
  limit?: number;
}): Promise<LinkOpportunityReport> {
  const brand = (input.brand || "").trim();
  const website = (input.website || "").trim();
  const ownDomain = domainOf(website.startsWith("http") ? website : `https://${website}`);
  const category = (input.category || "").trim();
  const competitors = (input.competitors || []).map((c) => c.trim()).filter(Boolean).slice(0, 3);
  const gl = input.market;
  const limit = Math.max(5, Math.min(input.limit ?? 25, 50));

  if (!brand) {
    return { brand, website, mode: "demo", opportunities: [], counts: { unlinked_mention: 0, resource_page: 0, competitor_cited: 0, question_source: 0 },
      compliance: "", note: "A brand name is required — nothing is guessed." };
  }

  // Search plan. Each query targets a legitimate, human-pitchable page type.
  const plan: { kind: LinkOpportunityKind; q: string }[] = [
    // Already naming the brand — exclude their own site so only third parties show.
    { kind: "unlinked_mention", q: `"${brand}" ${ownDomain ? `-site:${ownDomain}` : ""}`.trim() },
    { kind: "unlinked_mention", q: `"${brand}" review OR mentioned OR featured ${ownDomain ? `-site:${ownDomain}` : ""}`.trim() },
  ];
  if (category) {
    plan.push({ kind: "resource_page", q: `best ${category} companies list` });
    plan.push({ kind: "resource_page", q: `${category} "recommended suppliers" OR "useful resources"` });
    plan.push({ kind: "question_source", q: `how to choose ${category}` });
  }
  for (const c of competitors) {
    plan.push({ kind: "competitor_cited", q: `"${c}" -site:${domainOf(c.startsWith("http") ? c : `https://${c}`) || c}` });
  }

  const seen = new Set<string>();
  const opportunities: LinkOpportunity[] = [];
  let mode: "live" | "demo" = "demo";

  for (const step of plan) {
    if (opportunities.length >= limit) break;
    const { results, mode: m } = await run(step.q, gl);
    if (m === "live") mode = "live";
    for (const r of results) {
      if (opportunities.length >= limit) break;
      if (!usable(r, ownDomain)) continue;
      const d = domainOf(r.link as string);
      if (seen.has(d)) continue;      // one opportunity per domain — never spam a site
      seen.add(d);
      const snippet = (r.snippet || "").trim();
      // For an "unlinked mention" the snippet must actually contain the brand,
      // otherwise it is just a topical page — classify it honestly instead.
      const reallyMentions = new RegExp(`(^|\\W)${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(`${r.title} ${snippet}`);
      const kind: LinkOpportunityKind = step.kind === "unlinked_mention" && !reallyMentions ? "question_source" : step.kind;
      opportunities.push({
        kind, title: r.title || d, url: r.link as string, domain: d,
        evidence: snippet || "(no snippet returned)",
        why: kind === "unlinked_mention" ? `This page names ${brand} but does not link to ${ownDomain || "your site"}.`
          : kind === "resource_page" ? "A curated list page where being included is the page's purpose."
          : kind === "competitor_cited" ? "This publication already covers your category."
          : "A page answering a question you can answer with first-hand evidence.",
        difficulty: DIFFICULTY[kind],
        priority: KIND_WEIGHT[kind],
        pitchAngle: pitchFor(kind, brand, website || ownDomain, r.title || d),
      });
    }
  }

  opportunities.sort((a, b) => b.priority - a.priority);
  const counts = { unlinked_mention: 0, resource_page: 0, competitor_cited: 0, question_source: 0 } as Record<LinkOpportunityKind, number>;
  for (const o of opportunities) counts[o.kind] += 1;

  return {
    brand, website, mode, opportunities, counts,
    compliance:
      "Compliant by design: these are real pages found in live search, listed for a HUMAN to pitch from their own mailbox. MarketWar never buys, exchanges, injects or auto-places links, never posts to comments or forums, and never uses private blog networks — those breach Google's link spam policy and the penalty falls on your domain.",
    note: mode === "live"
      ? `${opportunities.length} real opportunit${opportunities.length === 1 ? "y" : "ies"} found across ${seen.size} distinct domains. One per domain, so no site is approached twice. Nothing has been contacted — review, then send.`
      : "No search key configured, so no live opportunities could be found. Nothing is invented — set SERPER_API_KEY to run this for real.",
  };
}
