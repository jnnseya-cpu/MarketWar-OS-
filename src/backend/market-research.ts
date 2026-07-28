// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The RESEARCH half of VisualStrike — real searches, real sources.
//
// "Researches" was the emptiest word on that page: the engine went straight from
// a product description to invented angles, which is how you end up with ads
// that assume a business you have never met. This module goes and looks first.
//
// What it does, and equally what it refuses to do:
//
//   • It runs REAL searches (competitors, complaints, comparisons, price talk)
//     and returns findings that each carry the source link they came from. A
//     finding with no source is not a finding.
//   • It never invents a competitor, a price or a customer complaint. When the
//     search provider is unavailable it says the research did not run, rather
//     than filling the gap with plausible fiction — the failure mode the owner
//     has repeatedly and rightly rejected.
//   • It separates OBSERVED (a phrase appeared in results we can link to) from
//     INFERRED (a pattern across several results). Inferences are labelled.
//
// The output is designed to be fed into angle generation, so the angles rest on
// something checkable instead of on a model's imagination.

import { webSearch, type SearchResult } from "@/backend/search";

export type Evidence = {
  claim: string;
  kind: "observed" | "inferred";
  sources: { title: string; link: string }[];
  confidence: "low" | "medium" | "high";
};

export type ResearchReport = {
  ok: boolean;
  mode: "live" | "unavailable";
  product: string;
  market: string;
  competitors: { name: string; link: string; snippet: string }[];
  painPoints: Evidence[];
  differentiators: Evidence[];
  priceSignals: Evidence[];
  languageUsed: string[];       // words real people use, harvested from results
  queriesRun: string[];
  angleSeeds: { family: string; premise: string; evidence: string }[];
  gaps: string[];               // what we could NOT establish — stated, not hidden
  note: string;
};

// The searches. Each one exists to answer a specific question an angle needs.
function queriesFor(product: string, market: string): { key: string; query: string }[] {
  const where = market ? ` ${market}` : "";
  return [
    { key: "competitors", query: `best ${product}${where}` },
    { key: "alternatives", query: `${product} alternatives comparison` },
    { key: "complaints", query: `${product} problems complaints reviews` },
    { key: "price", query: `${product} price how much cost${where}` },
    { key: "buying", query: `how to choose ${product} what to look for` },
  ];
}

// Phrases that signal a real customer frustration rather than marketing copy.
const PAIN_MARKERS = [
  "problem", "issue", "complaint", "difficult", "frustrating", "expensive",
  "slow", "confusing", "disappointed", "poor", "avoid", "waste", "struggle",
  "hate", "annoying", "unreliable", "broken",
];

const PRICE_RE = /(?:£|\$|€)\s?\d[\d,]*(?:\.\d{2})?|\b\d+\s?(?:per|a)\s?(?:month|year|user)\b/gi;

// Words worth reusing in copy: they are how the market actually talks. Stop
// words and the product's own name are stripped — echoing the product name back
// teaches nothing.
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "you", "your", "are", "was", "how",
  "what", "why", "who", "from", "have", "has", "our", "their", "its", "can", "will",
  "best", "top", "more", "most", "get", "out", "not", "but", "all", "any", "one",
  "new", "now", "about", "into", "over", "than", "then", "them", "they", "when",
  "which", "would", "could", "should", "here", "there", "been", "were", "also",
]);

export function harvestLanguage(results: SearchResult[], exclude: string, limit = 12): string[] {
  const excluded = new Set(exclude.toLowerCase().split(/\s+/).filter(Boolean));
  const counts = new Map<string, number>();
  for (const r of results) {
    const text = `${r.title || ""} ${r.snippet || ""}`.toLowerCase();
    for (const raw of text.split(/[^a-z']+/)) {
      const w = raw.trim();
      if (w.length < 4 || STOP.has(w) || excluded.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)   // said once is noise; twice is a pattern
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export function extractPricePoints(results: SearchResult[]): { value: string; source: SearchResult }[] {
  const out: { value: string; source: SearchResult }[] = [];
  for (const r of results) {
    const matches = `${r.title || ""} ${r.snippet || ""}`.match(PRICE_RE);
    if (matches) for (const m of matches.slice(0, 2)) out.push({ value: m.trim(), source: r });
  }
  return out;
}

export function findPainSignals(results: SearchResult[]): { marker: string; source: SearchResult; excerpt: string }[] {
  const out: { marker: string; source: SearchResult; excerpt: string }[] = [];
  for (const r of results) {
    const text = `${r.title || ""} ${r.snippet || ""}`;
    const lower = text.toLowerCase();
    for (const marker of PAIN_MARKERS) {
      const at = lower.indexOf(marker);
      if (at === -1) continue;
      out.push({ marker, source: r, excerpt: text.slice(Math.max(0, at - 60), at + 90).trim() });
      break; // one signal per result — otherwise a single rant dominates
    }
  }
  return out;
}

const src = (r: SearchResult) => ({ title: r.title || "untitled", link: r.link || "" });

export async function researchProduct(input: {
  product: string;
  market?: string;
  brandDomain?: string;   // excluded from competitors — you are not your own rival
}): Promise<ResearchReport> {
  const product = (input.product || "").trim();
  const market = (input.market || "").trim();
  const base: ResearchReport = {
    ok: false, mode: "unavailable", product, market,
    competitors: [], painPoints: [], differentiators: [], priceSignals: [],
    languageUsed: [], queriesRun: [], angleSeeds: [], gaps: [], note: "",
  };
  if (!product) return { ...base, note: "Describe the product before researching it." };

  const queries = queriesFor(product, market);
  const responses = await Promise.all(
    queries.map((q) => webSearch({ query: q.query }).catch(() => null)),
  );

  const live = responses.some((r) => r?.mode === "live");
  if (!live) {
    return {
      ...base,
      queriesRun: queries.map((q) => q.query),
      gaps: ["Every finding below would have been invented, so none is shown."],
      note:
        "Research did NOT run — no live search provider is connected (SERPER_API_KEY). " +
        "Nothing here is guessed: connect a search key and this returns real competitors, real complaints and real price points, each with the link it came from.",
    };
  }

  const byKey = new Map<string, SearchResult[]>();
  queries.forEach((q, i) => byKey.set(q.key, responses[i]?.results ?? []));
  const all = [...byKey.values()].flat();
  const ownDomain = (input.brandDomain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();

  // --- competitors -------------------------------------------------------
  const seen = new Set<string>();
  const competitors: ResearchReport["competitors"] = [];
  for (const r of [...(byKey.get("competitors") ?? []), ...(byKey.get("alternatives") ?? [])]) {
    if (!r.link) continue;
    let host = "";
    try { host = new URL(r.link).hostname.replace(/^www\./, "").toLowerCase(); } catch { continue; }
    if (!host || seen.has(host)) continue;
    if (ownDomain && host.includes(ownDomain)) continue;   // not a competitor
    seen.add(host);
    competitors.push({ name: r.title || host, link: r.link, snippet: r.snippet || "" });
    if (competitors.length >= 8) break;
  }

  // --- pain points -------------------------------------------------------
  const painSignals = findPainSignals([...(byKey.get("complaints") ?? []), ...(byKey.get("buying") ?? [])]);
  const painByMarker = new Map<string, typeof painSignals>();
  for (const p of painSignals) {
    painByMarker.set(p.marker, [...(painByMarker.get(p.marker) ?? []), p]);
  }
  const painPoints: Evidence[] = [...painByMarker.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([marker, hits]) => ({
      claim: `Buyers raise "${marker}" when discussing ${product}: “${hits[0].excerpt}”`,
      kind: "observed" as const,
      sources: hits.slice(0, 3).map((h) => src(h.source)),
      confidence: hits.length >= 3 ? "high" : hits.length === 2 ? "medium" : "low",
    }));

  // --- price -------------------------------------------------------------
  const prices = extractPricePoints(byKey.get("price") ?? []);
  const priceSignals: Evidence[] = prices.slice(0, 5).map((p) => ({
    claim: `Price seen in market results: ${p.value}`,
    kind: "observed",
    sources: [src(p.source)],
    confidence: "medium",
  }));

  // --- differentiators ---------------------------------------------------
  // What competitors emphasise is what a challenger must either match or
  // deliberately contradict. Inferred, and labelled as such.
  const language = harvestLanguage(all, product);
  const differentiators: Evidence[] = language.slice(0, 5).map((word) => ({
    claim: `The market repeatedly uses "${word}" — either own this ground or take the opposite position deliberately.`,
    kind: "inferred",
    sources: all.filter((r) => `${r.title} ${r.snippet}`.toLowerCase().includes(word)).slice(0, 2).map(src),
    confidence: "medium",
  }));

  // --- angle seeds, each tied to something we actually found -------------
  const angleSeeds: ResearchReport["angleSeeds"] = [];
  if (painPoints.length) {
    angleSeeds.push({
      family: "problem_agitate",
      premise: `Lead with the frustration buyers actually voice, not one we assumed.`,
      evidence: painPoints[0].claim,
    });
  }
  if (competitors.length >= 2) {
    angleSeeds.push({
      family: "comparison",
      premise: `Buyers are comparing against ${competitors.slice(0, 3).map((c) => c.name.split(/[|\-–]/)[0].trim()).join(", ")}. Address that comparison directly instead of pretending it is not happening.`,
      evidence: `${competitors.length} distinct competitors found in search results.`,
    });
  }
  if (priceSignals.length) {
    angleSeeds.push({
      family: "value_framing",
      premise: `Market prices are visible in search results — frame value against what buyers already expect to pay.`,
      evidence: priceSignals.map((p) => p.claim.replace("Price seen in market results: ", "")).join(", "),
    });
  }
  if (language.length) {
    angleSeeds.push({
      family: "voice_of_customer",
      premise: `Write in the market's own words: ${language.slice(0, 6).join(", ")}.`,
      evidence: `Harvested from ${all.length} live search results.`,
    });
  }

  // --- what we could NOT establish ---------------------------------------
  const gaps: string[] = [];
  if (!competitors.length) gaps.push("No competitors identified from search — the term may be too broad or too new.");
  if (!painPoints.length) gaps.push("No complaint language surfaced. That is not evidence of no complaints; it means public results did not show any.");
  if (!priceSignals.length) gaps.push("No public price points found. Pricing may be quote-only in this market.");

  return {
    ok: true,
    mode: "live",
    product, market,
    competitors, painPoints, differentiators, priceSignals,
    languageUsed: language,
    queriesRun: queries.map((q) => q.query),
    angleSeeds,
    gaps,
    note:
      `Researched with ${queries.length} live searches across ${all.length} results. Every finding carries the link it came from — click through before you build a campaign on it. ` +
      `Items marked "inferred" are patterns across results, not statements anyone made.`,
  };
}
