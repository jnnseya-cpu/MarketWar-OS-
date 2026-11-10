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
import {
  familiesOf, sourceQualityOf, confidenceScore, decide, ageHoursFrom, freshnessFrom,
  SINGLE_FAMILY_CAP, type Band, type SourceFamily, type Veto,
} from "@/shared/trend-score";

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

/**
 * HOW FAR THIS EVIDENCE COULD EVER CARRY A SIGNAL (Trend Intelligence §5.5).
 *
 * The weekly sweep is ONE source family — a news search — and the whole point
 * of the single-family cap is that one family can never authorise action. That
 * was already true of this sweep and nothing said so: a finding with 67% word
 * overlap said "join", in the same words it would use if six independent
 * families agreed.
 *
 * So the recommendation is untouched — `action` still means exactly what it has
 * always meant, a suggestion to a person — and this says, separately and in the
 * spec's own units, how much the evidence is worth. Every number in it is
 * measured: the publisher and the age come from the provider (they used to be
 * dropped at the search boundary), the quality is the configured score of the
 * families actually present, and coverage is the share of the brand's own
 * subjects that returned anything at all.
 *
 * `ceiling` is the best band this evidence could support IF the opportunity
 * score were a perfect 100. It is therefore a statement about the evidence
 * alone, which is the honest thing to put beside a word-overlap number.
 */
export type FindingEvidence = {
  families: SourceFamily[];
  /** §5.5, from measured inputs only. Capped at 69 while there is one family. */
  confidence: number;
  /** Real conditions on this finding, in the spec's named vocabulary. */
  vetoes: Veto[];
  /** The most this evidence could ever support, even at a perfect opportunity score. */
  ceiling: Band;
  why: string;
};

export type TrendFinding = {
  title: string;
  snippet: string;
  link: string;
  relevance: Relevance;
  gate: TrendVerdict;
  /** join / watch / reject, after BOTH the measured relevance and the risk gate. */
  action: "join" | "watch" | "reject";
  why: string;
  /** Who published it, when the provider said so. */
  publisher?: string;
  /** Hours since publication, or null when the provider's date was unreadable. */
  ageHours: number | null;
  evidence: FindingEvidence;
};

/** The sweep's one family. Named rather than inlined, because it is the reason for the ceiling. */
const SWEEP_SOURCES = ["news"] as const;

/**
 * The spec's confidence and vetoes for one finding, from measured inputs.
 *
 * Pure, and exported, because every dangerous input here — an unreadable date,
 * a brand with no crawl, a rejected trend — is one that only ever arrives
 * through a paid search call, and a boundary reachable only through a provider
 * is a boundary nobody tests.
 */
export function evidenceFor(input: {
  /** Signal sources behind the finding, in the radar's own vocabulary. */
  sources?: readonly string[];
  /** The risk gate said reject. */
  rejected: boolean;
  /** We have read this brand's site, so relevance is a number rather than "unknown". */
  relevanceKnown: boolean;
  /** 0–100: share of the brand's own subjects that returned anything this sweep. */
  coverage: number;
  ageHours: number | null;
}): FindingEvidence {
  const fam = familiesOf(input.sources ?? SWEEP_SOURCES);
  const vetoes: Veto[] = [];
  // THE EXISTING RISK GATE IS THE SPEC'S VETO. It is not re-judged here and its
  // verdict is still final — it is only being named in the spec's vocabulary so
  // a refusal reads the same way wherever it came from.
  if (input.rejected) vetoes.push("restricted_topic");
  // No crawl means no vocabulary, which is the spec's readiness gap exactly:
  // we cannot say this brand is ready to act on a topic we have never read
  // their site about.
  if (!input.relevanceKnown) vetoes.push("readiness_missing");

  const freshness = freshnessFrom(input.ageHours);
  const confidence = confidenceScore({
    sourceQuality: sourceQualityOf(fam.families),
    independentFamilies: fam.independentFamilies,
    coverage: input.coverage,
    freshness,
  });
  // The best band this evidence could reach if the opportunity score were
  // perfect. Asking the real decision table rather than reasoning about it,
  // because two copies of a threshold disagree the first time one is edited.
  const ceiling = decide({ opportunity: 100, confidence, vetoes }).band;

  return {
    families: fam.families, confidence, vetoes, ceiling,
    why: [
      fam.why,
      `Confidence ${confidence.toFixed(1)}/100 — quality ${sourceQualityOf(fam.families).toFixed(0)}, coverage ${Math.round(input.coverage)}, freshness ${freshness.toFixed(0)}${input.ageHours === null ? " (the provider gave no readable date, so freshness scores zero rather than guessing)" : ` (${Math.round(input.ageHours)}h old)`}.`,
      vetoes.length ? `Held: ${vetoes.join(", ")}.` : "",
      // ZERO FAMILIES IS NOT ONE FAMILY. The first draft of this sentence read
      // "a single source family is capped at 69" for a candidate backed by
      // nothing a family could be found for, which is a different and worse
      // situation described in reassuring words.
      fam.independentFamilies === 0
        ? `At best this evidence supports "${ceiling}", and that is generous: nothing here is backed by a source family we recognise, so there is no corroboration to weigh at all.`
        : fam.independentFamilies === 1
          ? `At best this evidence supports "${ceiling}": one source family is capped at ${SINGLE_FAMILY_CAP}, so a single feed can never authorise a live change on its own however strong it looks.`
          : `At best this evidence supports "${ceiling}".`,
    ].filter(Boolean).join(" "),
  };
}

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
  /**
   * THE BRAND'S OWN FIRST-PARTY SIGNALS, if the caller gathered them.
   *
   * This is §2's release gate in one argument. A news sweep is ONE source
   * family and one family is capped at 69, so on its own it can never clear
   * the brief band — not because the news is weak, but because a single family
   * is never enough evidence to authorise a live change. The brand's own page
   * analytics are an INDEPENDENT family that needs no key, so when they are
   * supplied the same signal can corroborate and the cap stops binding.
   *
   * Passed in rather than read here on purpose: `trend-watch` would otherwise
   * reach into a store, and a function that reads its own inputs cannot be
   * driven with the inputs that matter.
   */
  firstPartySources?: readonly string[];
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

  // §5.5 COVERAGE, measured rather than assumed: the share of this brand's own
  // subjects that returned anything at all. Two subjects out of three coming
  // back empty is a thin week, and the confidence of everything found in it
  // should say so.
  const answered = results.filter((r) => (r.results || []).length > 0).length;
  const coverage = subjects.length ? (answered / subjects.length) * 100 : 0;
  const nowMs = input.now?.() ?? Date.now();

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
      // The publisher and the date the provider sent. Both used to be discarded
      // at the search boundary, which is why freshness could not be measured.
      const publisher = typeof r.extra?.source === "string" ? r.extra.source.trim() : "";
      const ageHours = ageHoursFrom(r.extra?.date, nowMs);
      const finding: TrendFinding = {
        title, snippet: r.snippet || "", link: r.link || "", relevance, gate, action, why,
        ageHours,
        evidence: evidenceFor({
          // The news family, plus whatever independent families the caller
          // actually gathered for this brand. Names, not counts — the family
          // map derives the number, so nothing can claim corroboration it
          // does not have.
          sources: [...SWEEP_SOURCES, ...(input.firstPartySources ?? [])],
          rejected: gate.verdict === "reject",
          relevanceKnown: relevance.score !== null,
          coverage, ageHours,
        }),
      };
      if (publisher) finding.publisher = publisher;
      findings.push(finding);
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
      // Said once, here, so nobody reads "worth acting on" as "safe to act on
      // automatically". The sweep is one source family by construction.
      // SAID ONCE, AND ONLY WHEN TRUE. This line used to assert "one source
      // family" unconditionally; once a brand's own analytics corroborate a
      // signal that is simply false, and a caveat that is false is worse than
      // none because the next reader stops believing the true ones.
      (input.firstPartySources?.length ?? 0) > 0
        ? `Corroborated against this brand's own first-party signals as well as the news, so a finding here can carry more confidence than a news sweep alone ever could — the cap at ${SINGLE_FAMILY_CAP} binds a single family, and there is more than one.`
        : `Everything here comes from one source family (news), which caps confidence at ${SINGLE_FAMILY_CAP}: these are recommendations for a person to weigh, and no number in this sweep can authorise a live change on its own.`,
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
