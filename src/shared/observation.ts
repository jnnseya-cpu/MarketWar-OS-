// THE OBSERVATION AND EVIDENCE MODEL — Trend Intelligence AI v2.3 §5 (schema),
// §15 (keying and provenance), and the ingestion rules of §3.
//
// THE DENOMINATOR OF EVERYTHING DOWNSTREAM. A score, a brief and an action all
// answer "compared to what?" with an observation, and an observation is only
// trustworthy if its provenance is recorded SEPARATELY from its value. §5 is
// insistent on this: *"Track raw event time, observation window, ingestion
// time, coverage, normalization and provenance separately."* So this record
// keeps `observed_at` (when it happened), `window_start`/`window_end` (the span
// it summarises), `ingested_at` (when we learned it), `coverage` (how much of
// the expected window we actually saw) and the evidence hash — none of them
// collapsed into a single "value".
//
// THREE RULES THAT LIVE HERE BECAUSE THEY ARE PURE AND DANGEROUS TO GET WRONG:
//
//   • THE UNIQUE SOURCE-VERSION KEY (§15). `(tenant_scope, source_id,
//     source_record_id, revision)`. §5: "Unique source version key prevents
//     replays from inflating counts." `classifyIngest` is the whole of TI-01:
//     an exact replay is a DUPLICATE, the same key with a different evidence
//     hash is a CONFLICT (the spec's 409), never a silent overwrite.
//
//   • SYNDICATION COLLAPSE (§3). "Syndicated stories, mirrors and amendments
//     can contribute one corroborating source family at most." `independentFamilies`
//     collapses everything sharing an `origin_id` to a single family, which is
//     what makes TI-04 — three syndications of one story — fail to corroborate.
//
//   • CANONICALISATION THAT KEEPS THE ORIGINAL (§5.1). "Canonicalise accents,
//     spelling, aliases, dates and geography while retaining the original text."
//     `canonicalize` folds case and accents for matching; the caller keeps the
//     raw text. Merging two geographies because an embedding is similar is
//     forbidden (§17) — that is a clustering decision, not done here.
//
// Pure: no store, no model, no clock it is not handed. Persistence (the
// Firestore collections, the composite keys, the tenant row-rules) is the next
// step and a separate file.

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** The §5 observation schema. `tenant_scope` is the installation, or "public" for shared read-only rows. */
export type Observation = {
  tenant_scope: string;
  source_id: string;
  source_family: string;
  source_record_id: string;
  /** Raw event time. */
  observed_at: string;
  /** Inclusive window start. */
  window_start: string;
  /** Exclusive window end. */
  window_end: string;
  /** When this was ingested. */
  ingested_at: string;
  /** DATA, not a built-in taxonomy (portability). */
  geography: string;
  locale: string;
  segment: string;
  metric: string;
  value: number;
  unit: string;
  /** For indexed feeds: the consistent scaling scope values must share to be comparable. */
  scaling_scope: string;
  /** 0–1: observed/expected window ratio. */
  coverage: number;
  evidence_uri: string;
  evidence_hash: string;
  terms_version: string;
  /** §15 key component. Defaults to 1 when a source has no explicit revision. */
  revision?: number;
  /** Provenance group for syndication/mirror/amendment collapse (§3). */
  origin_id?: string;
};

export type ObservationResult =
  | { ok: true; observation: Observation }
  | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

const isUtc = (v: unknown): v is string =>
  typeof v === "string" && UTC.test(v) && Number.isFinite(Date.parse(v));

function reqStr(v: unknown, field: string, errors: string[], pattern?: RegExp): string | null {
  if (typeof v !== "string" || v.length < 1) { errors.push(`${field}: non-empty string`); return null; }
  if (pattern && !pattern.test(v)) { errors.push(`${field}: invalid format`); return null; }
  return v;
}

/** Validate one observation against the §5 schema and its ordering rules. */
export function validateObservation(input: unknown): ObservationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["not an object"] };

  reqStr(input.tenant_scope, "tenant_scope", errors);
  reqStr(input.source_id, "source_id", errors, ID);
  reqStr(input.source_family, "source_family", errors);
  reqStr(input.source_record_id, "source_record_id", errors);
  reqStr(input.geography, "geography", errors);
  reqStr(input.locale, "locale", errors);
  reqStr(input.segment, "segment", errors);
  reqStr(input.metric, "metric", errors);
  reqStr(input.unit, "unit", errors);
  reqStr(input.scaling_scope, "scaling_scope", errors);
  reqStr(input.evidence_uri, "evidence_uri", errors);
  reqStr(input.evidence_hash, "evidence_hash", errors);
  reqStr(input.terms_version, "terms_version", errors);

  for (const f of ["observed_at", "window_start", "window_end", "ingested_at"] as const) {
    if (!isUtc(input[f])) errors.push(`${f}: an RFC 3339 UTC timestamp ending in Z`);
  }
  // Window: inclusive start, exclusive end (§16) — so it must be a real span.
  if (isUtc(input.window_start) && isUtc(input.window_end) && !(Date.parse(input.window_start) < Date.parse(input.window_end))) {
    errors.push("window_start must be strictly before window_end");
  }

  if (typeof input.value !== "number" || !Number.isFinite(input.value)) errors.push("value: finite number");
  if (typeof input.coverage !== "number" || !Number.isFinite(input.coverage) || input.coverage < 0 || input.coverage > 1) {
    errors.push("coverage: a number in 0..1 (observed/expected window ratio)");
  }
  if (input.revision !== undefined && (!Number.isInteger(input.revision) || (input.revision as number) < 1)) {
    errors.push("revision: integer >= 1 when present");
  }
  if (input.origin_id !== undefined && (typeof input.origin_id !== "string" || input.origin_id.length < 1)) {
    errors.push("origin_id: non-empty string when present");
  }

  if (errors.length) return { ok: false, errors };
  const o = input as unknown as Observation;
  return {
    ok: true,
    observation: {
      ...o,
      source_family: o.source_family,
      revision: o.revision ?? 1,
    },
  };
}

/**
 * §15's unique key: `(tenant_scope, source_id, source_record_id, revision)`.
 * The pipe separators are safe because the id pattern forbids them.
 */
export function sourceVersionKey(o: Pick<Observation, "tenant_scope" | "source_id" | "source_record_id" | "revision">): string {
  return `${o.tenant_scope}|${o.source_id}|${o.source_record_id}|${o.revision ?? 1}`;
}

export type IngestClass = "new" | "duplicate" | "conflict";

/**
 * TI-01, in one function. Given the evidence hash already stored for this key
 * (or null if the key is unseen), decide what an incoming observation is:
 *
 *   • unseen key                      → "new"
 *   • same key, same evidence hash    → "duplicate" (exact replay; ignore)
 *   • same key, different hash        → "conflict" (the spec's 409; never
 *                                        overwrite — a changed value under the
 *                                        same version is a new version)
 */
export function classifyIngest(incoming: Pick<Observation, "evidence_hash">, storedHashForKey: string | null): IngestClass {
  if (storedHashForKey === null) return "new";
  return storedHashForKey === incoming.evidence_hash ? "duplicate" : "conflict";
}

/**
 * §5.1: fold case, accents and surrounding whitespace for matching, WITHOUT
 * claiming to have changed the meaning. The caller keeps the original text.
 * Does not merge geographies or spellings into aliases — that is a reviewer-
 * approved mapping, not an automatic transform.
 */
export function canonicalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * §3: how many INDEPENDENT source families corroborate, after collapsing
 * syndication. Everything sharing an `origin_id` counts once; everything else
 * counts by its `source_family`. The result feeds `trend-score`'s
 * `independentFamilies`, so TI-04's three syndications of one story resolve to
 * a single family and cannot corroborate themselves into a brief.
 */
export function independentFamilies(observations: readonly Pick<Observation, "source_family" | "origin_id">[]): number {
  const units = new Set<string>();
  for (const o of observations) {
    units.add(o.origin_id ? `origin:${o.origin_id}` : `family:${o.source_family}`);
  }
  return units.size;
}

/**
 * §17: freshness is 100 at window close, tapering linearly to 0 at the
 * configured stale-after limit. Measured from `window_end`, clamped to 0..100.
 */
export function freshnessScore(o: Pick<Observation, "window_end">, nowISO: string, staleAfterMs: number): number {
  const end = Date.parse(o.window_end);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(end) || !Number.isFinite(now) || staleAfterMs <= 0) return 0;
  const age = now - end;
  if (age <= 0) return 100;
  if (age >= staleAfterMs) return 0;
  return Math.max(0, Math.min(100, 100 * (1 - age / staleAfterMs)));
}

/** §3: past the stale-after limit a source is dated context, not fresh enough to act on. */
export function isStale(o: Pick<Observation, "window_end">, nowISO: string, staleAfterMs: number): boolean {
  return freshnessScore(o, nowISO, staleAfterMs) <= 0;
}
