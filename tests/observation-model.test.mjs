import test from "node:test";
import assert from "node:assert/strict";
import {
  validateObservation,
  sourceVersionKey,
  classifyIngest,
  canonicalize,
  independentFamilies,
  freshnessScore,
  isStale,
} from "../src/shared/observation.ts";
import { validateSource, isKeyless, canSupportFreshAction } from "../src/shared/source-registry.ts";
import { confidenceScore } from "../src/shared/trend-score.ts";

// The provenance layer: §5 schema, §15 keying (TI-01), §3 syndication (TI-04),
// §5.1 canonicalisation, §17 freshness, and the §3 source registry.

const OBS = {
  tenant_scope: "brand_demo",
  source_id: "first_party_search",
  source_family: "first_party",
  source_record_id: "rec_001",
  observed_at: "2026-11-10T09:30:00Z",
  window_start: "2026-11-10T09:00:00Z",
  window_end: "2026-11-10T10:00:00Z",
  ingested_at: "2026-11-10T10:05:00Z",
  geography: "CA",
  locale: "en-CA",
  segment: "all",
  metric: "searches",
  value: 42,
  unit: "count",
  scaling_scope: "none",
  coverage: 0.95,
  evidence_uri: "mw://evidence/rec_001",
  evidence_hash: "sha256:aaa",
  terms_version: "v1",
};

test("a well-formed observation validates and revision defaults to 1", () => {
  const r = validateObservation(OBS);
  assert.equal(r.ok, true);
  assert.equal(r.observation.revision, 1);
});

test("a window that does not advance is refused", () => {
  const r = validateObservation({ ...OBS, window_end: OBS.window_start });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("window_start must be strictly before window_end")));
});

test("coverage must be a ratio in 0..1, and a non-UTC time is refused", () => {
  assert.equal(validateObservation({ ...OBS, coverage: 1.4 }).ok, false);
  assert.equal(validateObservation({ ...OBS, observed_at: "2026-11-10 09:30" }).ok, false);
});

test("the source-version key is (tenant, source, record, revision)", () => {
  const k1 = sourceVersionKey(OBS);
  const k2 = sourceVersionKey({ ...OBS, revision: 2 });
  assert.equal(k1, "brand_demo|first_party_search|rec_001|1");
  assert.notEqual(k1, k2);
});

test("TI-01 · replay is a duplicate, a changed hash under the same key is a conflict", () => {
  assert.equal(classifyIngest(OBS, null), "new");
  assert.equal(classifyIngest(OBS, OBS.evidence_hash), "duplicate");
  assert.equal(classifyIngest({ ...OBS, evidence_hash: "sha256:bbb" }, OBS.evidence_hash), "conflict");
});

test("§5.1 · canonicalisation folds case and accents but the caller keeps the original", () => {
  const original = "  Café  OnBoarding ";
  assert.equal(canonicalize(original), "cafe onboarding");
  assert.equal(original, "  Café  OnBoarding "); // untouched
});

test("TI-04 · three syndications of one story are one family, not three", () => {
  const syndications = [
    { source_family: "news_a", origin_id: "story_42" },
    { source_family: "news_b", origin_id: "story_42" },
    { source_family: "news_c", origin_id: "story_42" },
  ];
  assert.equal(independentFamilies(syndications), 1);
  // Two genuinely independent families count as two.
  assert.equal(independentFamilies([{ source_family: "first_party" }, { source_family: "gsc" }]), 2);
});

test("TI-04 · the collapse caps confidence through the real scorer", () => {
  const families = independentFamilies([
    { source_family: "news_a", origin_id: "story_42" },
    { source_family: "news_b", origin_id: "story_42" },
    { source_family: "news_c", origin_id: "story_42" },
  ]);
  // One family => confidence can never exceed the single-family cap of 69.
  const conf = confidenceScore({ sourceQuality: 100, independentFamilies: families, coverage: 100, freshness: 100 });
  assert.equal(conf, 69);
});

test("§17 · freshness is 100 at window close, 50 at half the stale window, 0 past it", () => {
  const twoHours = 2 * 60 * 60 * 1000;
  assert.equal(freshnessScore(OBS, "2026-11-10T09:59:00Z", twoHours), 100); // before close
  assert.equal(freshnessScore(OBS, "2026-11-10T11:00:00Z", twoHours), 50); // +1h of 2h
  assert.equal(freshnessScore(OBS, "2026-11-10T12:00:00Z", twoHours), 0); // at the limit
  assert.equal(isStale(OBS, "2026-11-10T12:30:00Z", twoHours), true);
});

const SOURCE = {
  source_id: "find_a_tender",
  source_family: "procurement",
  access_path: "public_keyless",
  access_mode: "poll",
  owner: "UK Government",
  terms_version: "ogl-v3",
  permitted_uses: ["discovery", "corroboration"],
  territories: ["GB"],
  languages: ["en-GB"],
  cadence: "daily",
  ingestion_lag_minutes: 120,
  quota: 0,
  retention_days: 180,
  status: "ok",
};

test("§3 · a keyless source registers; one needing a new credential cannot", () => {
  const ok = validateSource(SOURCE);
  assert.equal(ok.ok, true);
  assert.equal(isKeyless(ok.entry), true);
  // access_path outside the three keyless/host/import values is refused (§2 gate).
  assert.equal(validateSource({ ...SOURCE, access_path: "new_oauth_connector" }).ok, false);
  // permitted_uses is mandatory.
  assert.equal(validateSource({ ...SOURCE, permitted_uses: [] }).ok, false);
});

test("§3 · only an 'ok' source may support a fresh action; stale is context only", () => {
  assert.equal(canSupportFreshAction(validateSource(SOURCE).entry), true);
  assert.equal(canSupportFreshAction(validateSource({ ...SOURCE, status: "stale" }).entry), false);
  assert.equal(canSupportFreshAction(validateSource({ ...SOURCE, status: "unavailable" }).entry), false);
});
