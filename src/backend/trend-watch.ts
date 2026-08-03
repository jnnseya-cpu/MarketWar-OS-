// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Trend monitoring — real signals, measured relevance.
//
// "Continuous trend monitoring activates once a trends data feed is connected"
// was only half true. The feed exists: search.ts already fetches news. What was
// missing was a schedule, somewhere to keep the results, and — the part that
// mattered — a relevance score worth scheduling.
//
// THE GATE'S RISK SIDE IS REAL AND IS KEPT. trendHijackGate hard-rejects
// anything touching tragedy, harm or legal exposure from the words in it, and
// that judgement is unchanged and still final here.
//
// ITS FIT SIDE WAS A HASH. `seed(trend + business + factor) % 55` produces a
// stable number that has never looked at the brand. Running that on a cron would
// have mailed customers a weekly recommendation derived from a checksum of their
// own name. So fit is MEASURED here instead: how much of the brand's actual
// vocabulary — the products, services and headings the deep crawl read off the
// site — appears in the trend. That is explainable, checkable, and can be shown
// to the customer as the reason.
//
// WHAT IT WILL NOT DO: score relevance when it has no vocabulary to score
// against. A brand with no crawl gets "unknown", not a number.

import { webSearch } from "@/backend/search";
import { trendHijackGate, type TrendVerdict } from "@/backend/campaign-architect";
import type { SiteExtraction } from "@/backend/site-extract";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { trendRegion, type TargetMarket } from "@/shared/market";

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are", "was", "were",
  "has", "have", "had", "will", "can", "all", "new", "how", "why", "what", "who", "its", "his", "her",
  "they", "them", "their", "but", "not", "out", "one", "two", "get", "more", "than", "into", "over",
  "after", "before", "about", "says", "said", "best", "top",
]);

/** Words worth matching on: no stopwords, nothing under four letters. */
export function vocabulary(x: SiteExtraction | null): string[] {
  if (!x) return [];
  const raw = [
    ...x.products.values,
    ...x.services.values,
    ...x.hierarchy.filter((h) => h.level <= 3).map((h) => h.text),
    ...x.navigation.map((n) => n.label),
    ...x.faqs.map((f) => f.q),
    x.brand.tagline,
  ].join(" ");
  const words = raw.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
  return [...new Set(words.filter((w) => !STOP.has(w)))];
}

export type Relevance = {
  /** 0–100, or null when there is no vocabulary to measure against. */
  score: number | null;
  /** The words that actually matched — the reason, shown rather than asserted. */
  matched: string[];
  note: string;
};

/**
 * How much of this brand's own language is in the trend?
 *
 * Deliberately crude and deliberately transparent. It is a word-overlap count,
 * not a judgement of strategic fit, and the note says so — a customer can look
 * at `matched` and decide whether we found something real or three coincidences.
 * A number they can check beats a better number they cannot.
 */
export function relevanceOf(trendText: string, vocab: string[]): Relevance {
  if (!vocab.length) {
    return {
      score: null, matched: [],
      note: "No relevance score: we have not read this brand's site, so there is no vocabulary to compare against. Crawl the site and this becomes measurable.",
    };
  }
  const words = new Set((trendText || "").toLowerCase().match(/[a-z][a-z-]{3,}/g) || []);
  const matched = vocab.filter((v) => words.has(v));
  // Three matched terms is a strong signal for a headline of ~12 words; the
  // curve flattens after that rather than rewarding keyword soup.
  const score = Math.min(100, Math.round((matched.length / 3) * 100));
  return {
    score, matched: matched.slice(0, 12),
    note: matched.length
      ? `${matched.length} of this brand's own terms appear in the trend: ${matched.slice(0, 6).join(", ")}. This is word overlap with your site, not a judgement of strategic fit — read the headline and decide.`
      : "None of this brand's own terms appear in the trend. It may still be relevant, but nothing measurable connects it to what your site says you do.",
  };
}

export type TrendFinding = {
  title: string;
  snippet: string;
  link: string;
  relevance: Relevance;
  gate: TrendVerdict;
  /** join / watch / reject, after BOTH the measured relevance and the risk gate. */
  action: "join" | "watch" | "reject";
  why: string;
};

export type TrendWatchResult = {
  brandId: string;
  checkedAt: string;
  subjects: string[];
  findings: TrendFinding[];
  note: string;
};

/**
 * One monitoring pass.
 *
 * Searches news for the brand's OWN subjects rather than a generic industry
 * term, because "construction news" returns the industry and "common data
 * environment" returns the market this business is actually in.
 */
export async function watchTrends(input: {
  brandId: string;
  business: string;
  extraction: SiteExtraction | null;
  subjects?: string[];
  /** Where this business sells. A story breaking elsewhere is not its story. */
  market?: TargetMarket | null;
  now?: () => number;
}): Promise<TrendWatchResult> {
  const vocab = vocabulary(input.extraction);
  const x = input.extraction;
  const subjects = (input.subjects?.length
    ? input.subjects
    : [...(x?.products.values ?? []), ...(x?.services.values ?? [])]
  ).filter(Boolean).slice(0, 3);

  const checkedAt = new Date(input.now?.() ?? Date.now()).toISOString();
  if (!subjects.length) {
    return {
      brandId: input.brandId, checkedAt, subjects: [], findings: [],
      note: "Nothing to watch: no products or services were read from this brand's site, so there is no subject to search news for. Run a deep crawl first.",
    };
  }

  // WHERE the news is from. Searching "common data environment" globally
  // returns whatever is loudest anywhere; a business selling in one country
  // needs the stories its own customers are reading. The region is appended to
  // the query rather than filtering afterwards, because a search that never
  // returns the wrong region beats one that discards it after paying for it.
  const region = trendRegion(input.market ?? null);
  const results = await Promise.all(
    subjects.map((s) =>
      webSearch({ query: region.query ? `${s} ${region.query}` : s, type: "news" }).catch(() => ({ results: [] })),
    ),
  );
  const seen = new Set<string>();
  const findings: TrendFinding[] = [];

  for (const batch of results) {
    for (const r of batch.results || []) {
      const title = (r.title || "").trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());

      const text = `${title} ${r.snippet || ""}`;
      const relevance = relevanceOf(text, vocab);
      // The risk gate is unchanged and still final: a trend it rejects is
      // rejected however relevant the words are.
      const gate = trendHijackGate({ trend: title, business: input.business });

      let action: TrendFinding["action"] = "watch";
      let why = "";
      if (gate.verdict === "reject") {
        action = "reject";
        why = gate.reason;
      } else if (relevance.score === null) {
        action = "watch";
        why = relevance.note;
      } else if (relevance.score >= 67) {
        action = "join";
        why = `${relevance.note} Risk is inside the gate's limits (${gate.riskScore}/100).`;
      } else {
        action = "watch";
        why = relevance.score > 0
          ? `${relevance.note} Not enough overlap to act on by itself.`
          : relevance.note;
      }
      findings.push({ title, snippet: r.snippet || "", link: r.link || "", relevance, gate, action, why });
    }
  }

  findings.sort((a, b) => (b.relevance.score ?? -1) - (a.relevance.score ?? -1));
  const joinable = findings.filter((f) => f.action === "join").length;

  return {
    brandId: input.brandId, checkedAt, subjects, findings: findings.slice(0, 20),
    note: [
      `${findings.length} signal(s) for ${subjects.join(", ")}.`,
      joinable ? `${joinable} worth acting on.` : "None cleared the relevance bar this week — that is a normal result, not a failure.",
      "Relevance is measured as overlap with your site's own vocabulary and the matched words are shown, so you can check the reasoning rather than trust a score.",
    ].join(" "),
  };
}

// ---------------------------------------------------------------------------
// Storage + schedule
// ---------------------------------------------------------------------------

const COLLECTION = "trend_watches";
const mem = new Map<string, TrendWatchResult[]>();

export async function saveWatch(result: TrendWatchResult): Promise<{ persisted: boolean }> {
  if (adminConfigured && adminDb) {
    await adminDb.collection(COLLECTION).doc(`${result.brandId}_${result.checkedAt}`).set(result);
    return { persisted: true };
  }
  const list = mem.get(result.brandId) ?? [];
  mem.set(result.brandId, [result, ...list].slice(0, 30));
  return { persisted: false };
}

export async function listWatches(brandId: string, limit = 12): Promise<TrendWatchResult[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).where("brandId", "==", brandId).limit(limit).get();
    return snap.docs.map((d) => d.data() as TrendWatchResult).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
  }
  return (mem.get(brandId) ?? []).slice(0, limit);
}

/** Test seam — module memory would otherwise leak between cases. */
export function __resetTrendWatches(): void { mem.clear(); }

/**
 * What changed since last time, for the weekly digest.
 *
 * Only NEW signals are reported. A digest that re-sends last week's headlines
 * teaches the customer to ignore it, and then the one that mattered goes unread.
 */
export function newSince(latest: TrendWatchResult, previous: TrendWatchResult | null): TrendFinding[] {
  if (!previous) return latest.findings.filter((f) => f.action === "join");
  const before = new Set(previous.findings.map((f) => f.title.toLowerCase()));
  return latest.findings.filter((f) => f.action === "join" && !before.has(f.title.toLowerCase()));
}
