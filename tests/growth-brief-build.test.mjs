import test from "node:test";
import assert from "node:assert/strict";
import { assess, decide } from "../src/shared/trend-score.ts";
import { buildGrowthBrief, BRIEF_TTL_MS } from "../src/shared/growth-brief-build.ts";
import { validateShape, resolveEffective } from "../src/shared/growth-brief.ts";

// THE STEP THIS FILE GUARDS: a scored Decision becoming a contract-valid brief.
// trend-intelligence.test.mjs already proves the two keystones in isolation;
// this proves the coordinator that joins them — §4, §5 and §17's windows.

const VALID_FROM = "2026-11-10T10:00:00Z";

// Everything the coordinator needs that is not in the Decision (the §6 fixture's
// own identifiers, so the built brief is directly comparable to it).
const COORDS = {
  brief_id: "gb_build_01",
  brief_version: 1,
  tenant_id: "tenant_demo",
  platform_id: "fixture_platform_a",
  topic_id: "simpler-team-onboarding",
  market: "CA",
  locale: "en-CA",
  audience: "Small teams comparing onboarding options",
  intent: "evaluate how to onboard a small team",
  objective: "qualified trial starts per eligible session",
  cta_id: "cta_view_onboarding_guide",
  experiment_id: "exp_91",
  evidence_ids: ["ev_341", "ev_342"],
  approved_claim_ids: ["claim_onboarding_01"],
  allowed_channels: ["seo", "organic_social"],
  prohibited_claims: ["guaranteed onboarding time"],
  policy_version: 5,
  valid_from: VALID_FROM,
};

// The spec's own TI-03 inputs → opportunity 86.25, confidence 83.5 → band "brief".
const BRIEF_DECISION = assess({
  opportunity: { demand: 80, fit: 95, intent: 85, timing: 90, readiness: 80 },
  confidence: { sourceQuality: 90, independentFamilies: 2, coverage: 70, freshness: 90 },
});

test("a brief-band decision becomes a contract-valid brief", () => {
  assert.equal(BRIEF_DECISION.band, "brief");
  const r = buildGrowthBrief(BRIEF_DECISION, COORDS);
  assert.equal(r.ok, true);
  // The output is accepted by the very validator the builder ran internally.
  assert.equal(validateShape(r.brief).ok, true);
});

test("the scores come from the decision, not a re-passed copy", () => {
  const r = buildGrowthBrief(BRIEF_DECISION, COORDS);
  assert.equal(r.ok, true);
  assert.equal(r.brief.opportunity_score, BRIEF_DECISION.opportunity); // 86.25, unrounded
  assert.equal(r.brief.confidence, BRIEF_DECISION.confidence); // 83.5, unrounded
});

test("only a decision that authorises a brief produces one (watch/archive refused)", () => {
  const watch = decide({ opportunity: 70, confidence: 70 });
  const archive = decide({ opportunity: 50, confidence: 90 });
  assert.equal(watch.band, "watch");
  assert.equal(archive.band, "archive");
  const w = buildGrowthBrief(watch, COORDS);
  const a = buildGrowthBrief(archive, COORDS);
  assert.equal(w.ok, false);
  assert.equal(a.ok, false);
  assert.match(w.errors[0], /does not authorise a brief/);
});

test("a veto is refused by the coordinator too (readiness 0 → held)", () => {
  // Missing readiness blocks activation; trend-score lands it in 'watch'.
  const vetoed = assess({
    opportunity: { demand: 95, fit: 95, intent: 95, timing: 95, readiness: 0 },
    confidence: { sourceQuality: 95, independentFamilies: 3, coverage: 95, freshness: 95 },
  });
  assert.equal(vetoed.band, "watch");
  const r = buildGrowthBrief(vetoed, COORDS);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /held: readiness_missing/);
});

test("an auto_eligible decision also produces a brief", () => {
  const auto = decide({ opportunity: 90, confidence: 90, autoActionOptIn: true });
  assert.equal(auto.band, "auto_eligible");
  assert.equal(buildGrowthBrief(auto, COORDS).ok, true);
});

test("§17 windows: persistent is 7 days, breaking is 24 hours, from valid_from", () => {
  const persistent = buildGrowthBrief(BRIEF_DECISION, { ...COORDS, topicClass: "persistent" });
  const breaking = buildGrowthBrief(BRIEF_DECISION, { ...COORDS, topicClass: "breaking" });
  assert.equal(persistent.ok, true);
  assert.equal(breaking.ok, true);
  const span = (b) => Date.parse(b.brief.expires_at) - Date.parse(b.brief.valid_from);
  assert.equal(span(persistent), BRIEF_TTL_MS.persistent);
  assert.equal(span(breaking), BRIEF_TTL_MS.breaking);
  // Default (no topicClass) is persistent.
  assert.equal(span(buildGrowthBrief(BRIEF_DECISION, COORDS)), BRIEF_TTL_MS.persistent);
});

test("the built brief resolves effective inside its window and expires after it (TI-05)", () => {
  const built = buildGrowthBrief(BRIEF_DECISION, { ...COORDS, topicClass: "breaking" });
  assert.equal(built.ok, true);
  const inside = "2026-11-10T20:00:00Z"; // within the 24h window
  const after = "2026-11-12T10:00:00Z"; // past expiry
  assert.equal(resolveEffective(built.brief, { channel: "seo", nowISO: inside }).ok, true);
  const late = resolveEffective(built.brief, { channel: "seo", nowISO: after });
  assert.equal(late.ok, false);
  assert.equal(late.code, "expired");
});

test("a brief with no evidence is refused (the validator still runs)", () => {
  const r = buildGrowthBrief(BRIEF_DECISION, { ...COORDS, evidence_ids: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("evidence_ids")));
});

test("an unreadable valid_from is refused without throwing", () => {
  const r = buildGrowthBrief(BRIEF_DECISION, { ...COORDS, valid_from: "not-a-time" });
  assert.equal(r.ok, false);
});
