// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE KEYLESS SIGNAL SOURCE (Trend Intelligence §2's release gate, §3 row 1,
// §5 and §15's observation model).
//
// WHY THIS IS THE ONE THAT MATTERED. Until now the platform had exactly one
// live signal source: `search.ts`, which needs `SERPER_API_KEY` and is one
// source family (news). One family caps confidence at 69, and the brief band
// needs 75 — so NOTHING COULD EVER CLEAR THE BAND, no matter how strong a
// signal looked. The machinery was complete and could not, in principle,
// produce anything. A second INDEPENDENT family is what makes it live, and the
// spec is explicit that the first one should need no key.
//
// WHERE THE DATA COMES FROM, and why it is honest to call it a signal: the
// brand's own `page_stats`. Every owned page this platform publishes
// (`/b/{brandId}/{slug}`) already records views, CTA clicks and leads, bucketed
// BY DAY, with no third party involved and no per-visitor record kept. That is
// a real count feed about real demand on surfaces the customer owns, and it is
// already there — nothing here collects anything new.
//
// WHAT IT WILL NOT DO:
//
//   • It will not report a component it did not measure. Every field is
//     `number | null`, and null means "not measured", which is a different
//     statement from zero. Scoring a missing measurement as 0 is how a brand
//     with no data acquires a bad score instead of no score.
//   • It will not emit demand that has not cleared §5.3's gates. A rise on a
//     handful of events is noise, and the gates run BEFORE the mapping so a
//     number that has not earned its place never reaches a screen.
//   • It will not pretend to be two families. Every observation here is
//     `first_party`, however many pages it read — our own records of our own
//     visitors share every bias our traffic has, and three of them agreeing is
//     one view held three times. That is the whole reason the family map
//     groups them.

import { createHash } from "crypto";
import { listPageStats, type PageStats } from "@/backend/page-analytics";
import {
  demandFromCountFeed, familiesOf, MIN_COMPARABLE_PERIODS,
  type SourceFamily,
} from "@/shared/trend-score";

/** The radar's own vocabulary. Not a new name for an existing thing. */
export const FIRST_PARTY_SOURCE = "website_analytics" as const;

/** Days per comparable period. A week, because weekday traffic is not weekend traffic. */
export const PERIOD_DAYS = 7;

/**
 * How a measured CTA click-rate becomes a 0–100 commercial-intent score.
 *
 * A CONFIGURED JUDGEMENT, declared once with its reasoning rather than inlined
 * where nobody would find it — the same treatment as `FAMILY_QUALITY`. A 20%
 * click-through from page to call-to-action is an exceptional result on an
 * owned page, so that is the point the scale reaches 100. It is not derived
 * from this platform's own outcomes, because there are not yet enough of them
 * to derive anything from, and nothing here claims otherwise.
 */
export const INTENT_AT_FULL_SCALE_PCT = 20;

/**
 * Below this many views in the window, a rate is not a measurement.
 *
 * Deliberately the same floor `page-analytics.ts` already applies to its own
 * reports (`MIN_VIEWS`): 3 views and 1 click is not "33%". Two modules
 * disagreeing about when a rate becomes real is how one screen calls something
 * significant while another calls it noise.
 */
export const MIN_VIEWS_FOR_RATE = 100;

export type PageSignal = {
  /** Stable across runs, so a brief can cite the same evidence twice. */
  evidenceId: string;
  topicId: string;
  source: typeof FIRST_PARTY_SOURCE;
  family: SourceFamily;
  observedAt: string;
  window: { from: string; to: string };

  /** The raw count feed behind everything below. */
  count: number;
  comparablePeriods: number;
  z: number;
  lift: number;
  passesGate: boolean;

  /** 0–100 where measured, null where not. Never 0 standing in for unknown. */
  demand: number | null;
  intent: number | null;
  readiness: number | null;

  why: string;
};

const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => iso(ms).slice(0, 10);
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

/**
 * Sum one field across a span of days, from the daily buckets.
 *
 * A missing day contributes zero, which is the same arithmetic as skipping it —
 * the `?? 0` is for readability, not for correctness, and a mutation sweep
 * correctly showed the two forms are indistinguishable. What matters is that
 * the window is a FIXED NUMBER OF DAYS counted forward from `fromMs`, not a
 * walk over whichever days happen to have buckets: iterating the stored keys
 * instead would make a quiet week shorter than a busy one, and every rate
 * computed against it wrong in the flattering direction.
 */
export function sumWindow(
  stats: Pick<PageStats, "daily">,
  field: "views" | "ctaClicks" | "leads",
  fromMs: number,
  days: number,
): number {
  let total = 0;
  for (let i = 0; i < days; i++) {
    const bucket = stats.daily?.[day(fromMs + i * 86_400_000)];
    total += bucket?.[field] ?? 0;
  }
  return total;
}

/**
 * One page's daily counts → the current period and its comparable history.
 *
 * History is returned OLDEST FIRST and excludes the current period, because
 * `movement()` compares the current count against the median of what came
 * before it — including the current period in its own baseline would damp
 * exactly the movement being measured.
 */
export function periodsFor(
  stats: Pick<PageStats, "daily">,
  nowMs: number,
  periods = MIN_COMPARABLE_PERIODS + 1,
): { current: number; history: number[]; from: string; to: string } {
  // THE WINDOW INCLUDES TODAY, and the first version of this did not.
  //
  // It started at `now - 7 days` and counted seven days forward, which lands on
  // yesterday — so every event recorded today was invisible to the signal that
  // exists to notice today's movement. Driving it against the real store caught
  // it: five views recorded seconds earlier produced no observation at all.
  const endOfCurrent = nowMs;
  const startOfCurrent = endOfCurrent - (PERIOD_DAYS - 1) * 86_400_000;
  const current = sumWindow(stats, "views", startOfCurrent, PERIOD_DAYS);
  const history: number[] = [];
  for (let p = periods; p >= 1; p--) {
    const start = startOfCurrent - p * PERIOD_DAYS * 86_400_000;
    history.push(sumWindow(stats, "views", start, PERIOD_DAYS));
  }
  return { current, history, from: iso(startOfCurrent), to: iso(endOfCurrent) };
}

/**
 * One page's stats → one signal, or null when there is nothing to observe.
 *
 * Pure, and exported, because every interesting input here — a page with four
 * days of history, a page with a thousand views and no clicks, a page that has
 * never been seen — arrives only through a store, and a boundary reachable only
 * through a database is a boundary nobody tests.
 */
export function pageSignalFrom(stats: PageStats, nowMs: number): PageSignal | null {
  const slug = (stats.slug || "").trim();
  if (!slug) return null;

  const { current, history, from, to } = periodsFor(stats, nowMs);
  // Nothing at all in the window and nothing before it is not an observation,
  // it is the absence of one. Emitting a row of zeroes would put a page nobody
  // has ever visited into the evidence for a brief.
  if (current === 0 && history.every((h) => h === 0)) return null;

  const feed = demandFromCountFeed(current, history);
  const views = current;
  const clicks = sumWindow(stats, "ctaClicks", Date.parse(from), PERIOD_DAYS);

  // INTENT IS NULL BELOW THE SAMPLE FLOOR, not zero. A page with nine views and
  // no clicks has not demonstrated low intent; it has demonstrated nothing.
  const intent = views >= MIN_VIEWS_FOR_RATE
    ? Math.min(100, (clicks / views) * 100 * (100 / INTENT_AT_FULL_SCALE_PCT))
    : null;

  // READINESS IS THE ONE THING FIRST-PARTY DATA ANSWERS OUTRIGHT. §5.4 treats
  // missing readiness as a veto on activation, and readiness means "can this
  // installation actually act on the topic". A live owned page that real people
  // are reaching is not a proxy for that — it IS that.
  const readiness = views > 0 ? 100 : null;

  return {
    evidenceId: `ev_fp_${hid(`${stats.brandId}:${slug}:${from}`)}`,
    topicId: slug,
    source: FIRST_PARTY_SOURCE,
    // DERIVED, never asserted. The family map is the single source of truth for
    // what corroborates what.
    family: familiesOf([FIRST_PARTY_SOURCE]).families[0],
    observedAt: iso(nowMs),
    window: { from, to },
    count: current,
    comparablePeriods: history.filter((h) => h > 0).length,
    z: feed.z,
    lift: feed.lift,
    passesGate: feed.passesGate,
    demand: feed.passesGate ? feed.demand : null,
    intent,
    readiness,
    why: [
      `${views} view(s) on /${slug} in the 7 days to ${to.slice(0, 10)}, against ${history.length} prior week(s)`
        // NAMING THE EMPTY ONES. "against 5 prior weeks" reads as five weeks
        // of comparable traffic; a page launched on Monday has five prior
        // weeks of nothing, which is a different and much weaker baseline.
        + `${history.filter((h) => h > 0).length === history.length ? "" : `, of which ${history.filter((h) => h > 0).length} had any traffic at all`}.`,
      feed.why,
      intent === null
        ? `Commercial intent not measured: under ${MIN_VIEWS_FOR_RATE} views in the window, a click-rate is a rounding artefact rather than a measurement.`
        : `${clicks} call-to-action click(s) — a ${((clicks / views) * 100).toFixed(1)}% click-rate, scored ${intent.toFixed(0)}/100 against a ${INTENT_AT_FULL_SCALE_PCT}% full-scale mark.`,
      readiness === null
        ? "Readiness not established: nobody has reached this page."
        : "Readiness is established: this topic already has a live owned page that real people reach.",
    ].join(" "),
  };
}

/**
 * Every first-party observation for a brand — no key, no third party.
 *
 * Never throws: this runs inside a scheduled sweep that must be able to report
 * on the brands it could read rather than failing all of them for one.
 */
export async function firstPartySignals(brandId: string, nowMs = Date.now()): Promise<PageSignal[]> {
  try {
    const id = (brandId || "").trim();
    if (!id) return [];
    const pages = await listPageStats(id);
    return pages
      .map((p) => pageSignalFrom(p, nowMs))
      .filter((o): o is PageSignal => o !== null)
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// §5/§15 · Combining observations from different families into one candidate
// ---------------------------------------------------------------------------

export type Candidate = {
  topicId: string;
  families: SourceFamily[];
  independentFamilies: number;
  evidenceIds: string[];
  /** 0–100 each. A component nothing measured stays null and is NAMED below. */
  demand: number | null;
  fit: number | null;
  intent: number | null;
  timing: number | null;
  readiness: number | null;
  /** Components no source measured, by name — so a low score is explainable. */
  unmeasured: string[];
  why: string;
};

export type ComponentInput = {
  /**
   * THE SIGNAL SOURCE, in the radar's vocabulary — NOT the family.
   *
   * This field took a `SourceFamily` for exactly one driving run, and it was
   * wrong in the way that matters: `familiesOf` maps SOURCE names to families,
   * so handing it `"first_party"` found no mapping and dropped it, while
   * `"news"` resolved only because that one string happens to be both a source
   * and a family. A candidate backed by news AND the brand's own analytics
   * therefore reported ONE independent family — the exact answer that makes
   * the single-family cap refuse everything, forever, for a reason no screen
   * would ever have explained.
   *
   * A value read as the wrong KIND on the far side of a boundary, which is
   * this repository's oldest and most expensive defect. The family is derived
   * here and never supplied.
   */
  source: string;
  evidenceId: string;
  demand?: number | null;
  fit?: number | null;
  intent?: number | null;
  timing?: number | null;
  readiness?: number | null;
};

const COMPONENTS = ["demand", "fit", "intent", "timing", "readiness"] as const;

/**
 * Merge what several families measured about one topic.
 *
 * THE RULE THAT MATTERS: a component is the mean of the values that were
 * actually measured, and stays NULL when nothing measured it. It is the
 * caller's job to decide what an unmeasured component is worth — and the
 * honest answer for a score that gates live action is zero, which is why
 * `unmeasured` names every one of them rather than letting a low total look
 * like a weak opportunity instead of a thin evidence base.
 */
export function combine(topicId: string, inputs: readonly ComponentInput[]): Candidate {
  const fam = familiesOf(inputs.map((i) => i.source));
  const out: Record<string, number | null> = {};
  const unmeasured: string[] = [];

  for (const key of COMPONENTS) {
    const values = inputs
      .map((i) => i[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length) out[key] = values.reduce((t, v) => t + v, 0) / values.length;
    else { out[key] = null; unmeasured.push(key); }
  }

  const evidenceIds = [...new Set(inputs.map((i) => i.evidenceId).filter(Boolean))].sort();

  return {
    topicId,
    families: fam.families,
    independentFamilies: fam.independentFamilies,
    evidenceIds,
    demand: out.demand, fit: out.fit, intent: out.intent,
    timing: out.timing, readiness: out.readiness,
    unmeasured,
    why: [
      fam.why,
      unmeasured.length
        ? `Nothing measured ${unmeasured.join(", ")}. Treated as zero by any score that gates live action, because an unmeasured component is not a reassuring one — but the gap is named here so a low score reads as thin evidence rather than a weak opportunity.`
        : "Every component was measured by at least one family.",
    ].join(" "),
  };
}

// ---------------------------------------------------------------------------
// §3 + §5 · WHERE THIS SOURCE MEETS THE OBSERVATION MODEL
// ---------------------------------------------------------------------------
//
// `shared/observation.ts` and `shared/source-registry.ts` define the schema,
// the §15 source-version key and the §3 registry. This module is the first
// real PRODUCER for them, and the join matters more than either half: a
// registry nothing registers in, and a schema nothing emits, are both just
// type definitions.

/**
 * This source, as the §3 registry describes it.
 *
 * `access_path: "public_keyless"` IS §2's release gate, stated in the model's
 * own vocabulary rather than asserted in prose — and a test runs it through
 * `validateSource` and `isKeyless`, so the claim that this needs no key is
 * checkable instead of a sentence somebody wrote once.
 */
export const FIRST_PARTY_REGISTRY = {
  source_id: "mw_owned_pages",
  source_family: "first_party",
  access_path: "public_keyless" as const,
  access_mode: "poll",
  owner: "the brand itself",
  terms_version: "mw-owned-pages-v1",
  permitted_uses: ["demand_estimation", "activation_gating", "evidence"],
  // DATA, not a taxonomy: an owned page serves whoever reaches it, and the
  // platform does not infer a territory from traffic it did not geolocate.
  territories: [],
  languages: [],
  cadence: "daily",
  // The counter writes on the request, so there is no ingestion lag at all.
  ingestion_lag_minutes: 0,
  quota: 0,
  retention_days: 0,
  status: "ok" as const,
};

/**
 * A page signal, as a §5 observation.
 *
 * COVERAGE IS 1 AND THAT IS A MEASUREMENT, not a convenience. Coverage is the
 * observed/expected window ratio, and this counter runs on every request for
 * the whole window — a day with no bucket had no visitors, which is an
 * observed zero rather than a missing day. A sampled or polled source could
 * not say this, which is exactly why the field exists.
 */
export function toObservation(signal: PageSignal, input: {
  tenantScope: string;
  nowISO?: string;
}): Record<string, unknown> {
  const windowStart = signal.window.from;
  return {
    tenant_scope: input.tenantScope,
    source_id: FIRST_PARTY_REGISTRY.source_id,
    source_family: FIRST_PARTY_REGISTRY.source_family,
    // §15's key is (tenant, source, record, revision). The record is this page
    // in this window: the same week re-read is the SAME observation, so a
    // re-run is a duplicate rather than a second piece of evidence.
    source_record_id: `${signal.topicId}@${windowStart}`,
    observed_at: signal.observedAt,
    window_start: windowStart,
    window_end: signal.window.to,
    ingested_at: input.nowISO || signal.observedAt,
    // EXPLICIT UNKNOWNS, NOT GUESSES — and the schema is right to refuse an
    // empty string here, because blank reads as "not applicable" when the
    // truth is "we did not measure it".
    //
    //   ZZ  — the user-assigned code this codebase already uses for
    //         global/unknown territory. This platform does not geolocate page
    //         traffic, so claiming a country would be inventing one, and a
    //         brief resolved for a country off an observation that never knew
    //         one is the exact mistake §16's market rule exists to stop.
    //   und — BCP-47 for "undetermined". The page has a language; this counter
    //         does not read it.
    //   all — accurate rather than unknown: the count covers every visitor,
    //         because nothing here segments them.
    geography: "ZZ",
    locale: "und",
    segment: "all",
    metric: "page_views",
    value: signal.count,
    unit: "views",
    scaling_scope: `owned_page:${signal.topicId}`,
    coverage: 1,
    evidence_uri: `/b/${input.tenantScope}/${signal.topicId}`,
    // The counts ARE the evidence, so the hash is over them: a window re-read
    // with the same totals is a replay; one whose totals changed under the same
    // key is a conflict, which is TI-01 and is the registry's job to refuse.
    evidence_hash: createHash("sha256")
      .update(`${signal.topicId}|${windowStart}|${signal.count}|${signal.intent ?? "null"}`)
      .digest("hex"),
    terms_version: FIRST_PARTY_REGISTRY.terms_version,
    revision: 1,
  };
}
