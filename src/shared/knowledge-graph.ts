// §77 — WHAT ACTUALLY WORKS, AS SOMETHING YOU CAN QUERY.
//
// `brand-memory.ts` keeps facts as key/value with provenance, which is right for
// what it is: "audience.age-band = 35-44, measured, confidence 0.8". What it
// cannot express is a RELATIONSHIP — that the posts using a question hook, aimed
// at that age band, on that channel, ran above this brand's normal. So the
// answer to "what works for us" lived in whoever last read the dashboard, and
// left with them.
//
// This is the graph over content performance. Entities and typed edges, built
// from posts that were actually measured, with one query on top: for any
// dimension — hook, format, channel, audience, topic, offer — how did the posts
// carrying each value do against this brand's own median?
//
// ---------------------------------------------------------------------------
// THREE REFUSALS, AND WHY EACH ONE IS THE DIFFERENCE BETWEEN THIS AND ASTROLOGY
// ---------------------------------------------------------------------------
//
// 1. IT NEVER CLAIMS CAUSATION. Every sentence this produces is of the form
//    "posts using X ran N% above your median", never "X drives engagement".
//    Three posts sharing a hook also share a week, a topic and an audience, and
//    a platform that says "use question hooks" on that basis is inventing a
//    mechanism it has not measured. The wording is the honesty.
//
// 2. IT REFUSES TO RANK ON THIN EVIDENCE. Below `MIN_SAMPLES` posts carrying a
//    value there is no verdict at all — not a low one. One post with a rocket
//    emoji that happened to land is not a finding about rocket emojis, and the
//    fastest way to make a tool useless is to have it confidently recommend
//    noise.
//
// 3. IT COMPARES TO THE BRAND'S OWN MEDIAN, using the SAME function §50 uses.
//    A second median written beside that one is how two halves of a platform
//    come to disagree about what a brand's normal is.

import { median } from "@/shared/boost-ladder";

export const ENTITY_TYPES = ["post", "hook", "format", "channel", "audience", "topic", "offer"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** The dimensions a post can be described by — everything except the post itself. */
export const DIMENSIONS = ENTITY_TYPES.filter((t) => t !== "post") as Exclude<EntityType, "post">[];
export type Dimension = (typeof DIMENSIONS)[number];

export const EDGE_KINDS = ["used", "published_on", "aimed_at", "about", "promotes"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Which edge connects a post to each kind of thing. One mapping, not a guess per call site. */
export const EDGE_FOR: Record<Dimension, EdgeKind> = {
  hook: "used",
  format: "used",
  channel: "published_on",
  audience: "aimed_at",
  topic: "about",
  offer: "promotes",
};

export type Entity = { id: string; type: EntityType; label: string };
export type Edge = { from: string; to: string; kind: EdgeKind };

/** One measured post and what it was made of. Attributes are optional — most posts know some. */
export type ContentRecord = {
  id: string;
  impressions: number;
  engagements: number;
  clicks?: number;
  conversions?: number;
  publishedAtISO: string;
  hook?: string;
  format?: string;
  channel?: string;
  audience?: string;
  topic?: string;
  offer?: string;
};

export type Graph = {
  entities: Entity[];
  edges: Edge[];
  /** The brand's own median engagement rate across everything measurable. Null when there is not enough. */
  medianEngagementRate: number | null;
  /** Posts with enough reach to be measured at all. */
  measuredPosts: number;
};

/** Below this reach a post's engagement rate is arithmetic without meaning — §50's floor, deliberately the same. */
export const MIN_IMPRESSIONS = 400;
/** Below this many posts carrying a value, there is no finding about that value. */
export const MIN_SAMPLES = 3;
/** How far from the median counts as a real difference rather than noise. */
export const MATERIAL_LIFT_PCT = 15;

const key = (type: EntityType, label: string) => `${type}:${label.trim().toLowerCase()}`;

/**
 * Build the graph from measured posts.
 *
 * Posts below the reach floor are excluded ENTIRELY — from the median and from
 * every dimension — rather than merely from the verdicts. A handful of
 * 30-impression posts with one like each would otherwise set the brand's normal
 * out of noise, and then every real post would look like an underperformer.
 */
export function buildGraph(records: ContentRecord[]): Graph {
  const measurable = records.filter((r) => (Number(r.impressions) || 0) >= MIN_IMPRESSIONS);
  const entities = new Map<string, Entity>();
  const edges: Edge[] = [];

  for (const r of measurable) {
    const postId = key("post", r.id);
    entities.set(postId, { id: postId, type: "post", label: r.id });
    for (const dim of DIMENSIONS) {
      const raw = r[dim];
      const label = typeof raw === "string" ? raw.trim() : "";
      if (!label) continue;
      const id = key(dim, label);
      entities.set(id, { id, type: dim, label });
      edges.push({ from: postId, to: id, kind: EDGE_FOR[dim] });
    }
  }

  const rates = measurable.map((r) => (Number(r.engagements) || 0) / (Number(r.impressions) || 1));
  return {
    entities: [...entities.values()],
    edges,
    medianEngagementRate: median(rates),
    measuredPosts: measurable.length,
  };
}

export type Finding = {
  dimension: Dimension;
  value: string;
  posts: number;
  engagementRate: number;
  /** Percentage difference from the brand's own median. Negative is below it. */
  liftPct: number | null;
  verdict: "above" | "below" | "level" | "not_enough_evidence";
  /** The sentence to show. Never claims causation. */
  reason: string;
};

/**
 * How did the posts carrying each value of one dimension actually do?
 *
 * Returns EVERY value, including the ones with too little evidence, because a
 * list that silently omits them reads as "we tried these six things" when
 * eleven were tried — and the missing five are exactly the ones somebody is
 * about to try again.
 */
export function whatWorks(records: ContentRecord[], dimension: Dimension): Finding[] {
  const graph = buildGraph(records);
  const measurable = records.filter((r) => (Number(r.impressions) || 0) >= MIN_IMPRESSIONS);
  const base = graph.medianEngagementRate;

  const groups = new Map<string, ContentRecord[]>();
  for (const r of measurable) {
    const raw = r[dimension];
    const label = typeof raw === "string" ? raw.trim() : "";
    if (!label) continue;
    const bag = groups.get(label) ?? [];
    bag.push(r);
    groups.set(label, bag);
  }

  const findings: Finding[] = [...groups.entries()].map(([value, rows]) => {
    const rate = median(rows.map((r) => (Number(r.engagements) || 0) / (Number(r.impressions) || 1))) ?? 0;
    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

    if (rows.length < MIN_SAMPLES) {
      return {
        dimension, value, posts: rows.length, engagementRate: rate, liftPct: null,
        verdict: "not_enough_evidence",
        reason: `${rows.length} post${rows.length === 1 ? "" : "s"}. Below ${MIN_SAMPLES} there is no finding here — one post that landed is not a fact about "${value}".`,
      };
    }
    // A median of zero has no ratio to be a multiple of, so no lift is claimed.
    if (base === null || base <= 0) {
      return {
        dimension, value, posts: rows.length, engagementRate: rate, liftPct: null,
        verdict: "not_enough_evidence",
        reason: `${rows.length} posts at ${pct(rate)}. There is no brand median to compare against yet, so nothing is called better or worse.`,
      };
    }

    const liftPct = Math.round(((rate - base) / base) * 1000) / 10;
    const verdict: Finding["verdict"] =
      liftPct >= MATERIAL_LIFT_PCT ? "above" : liftPct <= -MATERIAL_LIFT_PCT ? "below" : "level";

    // NEVER "X drives engagement". Three posts sharing a hook also share a week,
    // a topic and an audience; asserting a mechanism from that is the failure
    // this whole module is shaped to avoid.
    const reason =
      verdict === "above"
        ? `${rows.length} posts using "${value}" ran at ${pct(rate)} against your median of ${pct(base)} — ${liftPct}% above. That is an association in your own data, not a proven cause.`
        : verdict === "below"
          ? `${rows.length} posts using "${value}" ran at ${pct(rate)} against your median of ${pct(base)} — ${Math.abs(liftPct)}% below.`
          : `${rows.length} posts using "${value}" ran at ${pct(rate)}, within ${MATERIAL_LIFT_PCT}% of your median. No real difference either way.`;

    return { dimension, value, posts: rows.length, engagementRate: rate, liftPct, verdict, reason };
  });

  // Strongest first, with the un-judged at the end — they are information, not
  // recommendations, and mixing them into the ranking implies a rank they do
  // not have.
  const order = { above: 0, level: 1, below: 2, not_enough_evidence: 3 } as const;
  return findings.sort((a, b) =>
    order[a.verdict] - order[b.verdict] || (b.liftPct ?? -Infinity) - (a.liftPct ?? -Infinity));
}

/** Every dimension at once, skipping the ones this brand records nothing for. */
export function allFindings(records: ContentRecord[]): { dimension: Dimension; findings: Finding[] }[] {
  return DIMENSIONS
    .map((dimension) => ({ dimension, findings: whatWorks(records, dimension) }))
    .filter((d) => d.findings.length > 0);
}

export const GRAPH_DOCTRINE = [
  "It never claims causation. Every sentence is \"posts using X ran N% above your median\", never \"X drives engagement\" — three posts sharing a hook also share a week, a topic and an audience.",
  "Below three posts carrying a value there is no verdict at all, not a low one. One post with a rocket emoji that landed is not a finding about rocket emojis.",
  "Posts below the reach floor are excluded from the median as well as from the verdicts, or a handful of tiny posts would set the brand's normal out of noise and make every real post look like an underperformer.",
  "The median is the same function §50's paid ladder uses. Two medians written separately is how two halves of a platform come to disagree about a brand's normal.",
  "Values with too little evidence are still listed. Omitting them reads as \"we tried six things\" when eleven were tried, and the missing five are the ones somebody is about to try again.",
  "Within 15% of the median is called level, not a win. A ranked list where everything is a winner ranks nothing.",
];
