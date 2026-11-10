import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

// TREND INTELLIGENCE AI v2.3 — THE CONTRACT AND THE TWO SCORES.
//
// WHAT THIS COVERS AND WHAT IT DOES NOT. The attached specification describes a
// 6–8 week product; `docs/TREND-INTELLIGENCE-COVERAGE.md` maps all 22 sections
// against what this platform already has, and most of the machinery exists
// under other names. These tests cover the two pieces that were genuinely
// absent and that everything else in the spec references:
//
//   • §6 and Appendix A — the Growth Brief contract, and the runtime rules the
//     spec is careful to separate from the schema: *"A schema-valid object can
//     still fail these checks."*
//   • §5.4, §5.5 and §17 — the opportunity score and the independent
//     confidence, with the reproducibility rules that make the numbers the
//     same on two machines.
//
// The spec supplies its own expected outputs, which is rare and worth using:
// conformance scenario TI-03 says the component inputs in §5 must produce
// 86.25 and 83.5, and TI-05 says an expired cached brief must fall back while a
// queued action is denied. Those are the tests below, by name.

const gb = await import("../src/shared/growth-brief.ts");
const ts = await import("../src/shared/trend-score.ts");

/** §6's canonical positive fixture, verbatim. The spec names it as such. */
const FIXTURE = {
  schema_version: 1,
  brief_id: "gb_104",
  brief_version: 3,
  tenant_id: "tenant_demo",
  platform_id: "fixture_platform_a",
  market: "CA",
  locale: "en-CA",
  topic_id: "simpler-team-onboarding",
  opportunity_score: 86.25,
  confidence: 83.5,
  valid_from: "2026-11-10T10:00:00Z",
  expires_at: "2026-11-17T10:00:00Z",
  evidence_ids: ["ev_341", "ev_342"],
  audience: "Small teams comparing onboarding options",
  intent: "evaluate how to onboard a small team",
  approved_claim_ids: ["claim_onboarding_01"],
  cta_id: "cta_view_onboarding_guide",
  allowed_channels: ["seo", "organic_social"],
  prohibited_claims: ["guaranteed onboarding time", "unsupported third-party endorsements"],
  objective: "qualified trial starts per eligible session",
  experiment_id: "exp_91",
  policy_version: 5,
};

const INSIDE = "2026-11-12T10:00:00Z"; // between valid_from and expires_at

// ---------------------------------------------------------------------------
// Appendix A · the shape
// ---------------------------------------------------------------------------

test("§6's canonical fixture is accepted exactly as written", () => {
  const r = gb.validateShape(FIXTURE);
  assert.equal(r.ok, true, r.ok ? "" : r.errors.join("; "));
  // Every one of the 22 required fields survives, unchanged.
  for (const key of gb.BRIEF_REQUIRED) {
    assert.deepEqual(r.brief[key], FIXTURE[key], `${key} was altered on the way through`);
  }
});

test("THE OBJECT IS CLOSED, and that is the security property rather than pedantry", () => {
  // TI-06: "Model input contains instructions to bypass approvals or change
  // spend" → "Output cannot produce a privileged action." A brief is partly
  // generated and travels through a model. Ignoring an unknown field is how an
  // injected instruction becomes a field somebody later reads.
  for (const injected of [
    { allow_publish: true },
    { spend_cap: 999999 },
    { approver_requirements: [] },
    { allowed_channels_extra: ["paid"] },
    // A computed key, NOT the `{ __proto__: … }` literal. The literal sets the
    // prototype and leaves no own enumerable key, so a test written that way
    // asserts nothing — it was written that way here first, and passed for the
    // wrong reason. The computed form is also the real one: `JSON.parse` of a
    // request body with `"__proto__"` produces exactly this own key.
    { ["__proto__"]: "x" },
  ]) {
    const keys = Object.keys(injected);
    assert.equal(keys.length, 1, "the injected object must carry one own enumerable key");
    const r = gb.validateShape({ ...FIXTURE, ...injected });
    assert.equal(r.ok, false, `${keys[0]} was accepted into the brief`);
    assert.ok(r.errors.some((e) => e.includes("closed")), r.errors.join("; "));
  }

  // And over the wire, which is how it actually arrives.
  const wire = JSON.parse(`{"__proto__":{"allow_publish":true},"brief_id":"br_x"}`);
  assert.ok(Object.keys(wire).includes("__proto__"), "JSON.parse must give an own __proto__ key");
  const viaWire = gb.validateShape({ ...FIXTURE, ...wire });
  assert.equal(viaWire.ok, false);
  assert.ok(viaWire.errors.some((e) => e.includes("closed")), viaWire.errors.join("; "));
  assert.equal(({}).allow_publish, undefined, "Object.prototype must not have been polluted");
});

test("a brief with no evidence is an opinion, and is refused", () => {
  assert.equal(gb.validateShape({ ...FIXTURE, evidence_ids: [] }).ok, false);
  assert.equal(gb.validateShape({ ...FIXTURE, evidence_ids: ["ev_1", "ev_1"] }).ok, false, "duplicate evidence must not pad the list");
});

test("every field's constraint is enforced, not just its presence", () => {
  const bad = [
    ["schema_version", 2], ["schema_version", "1"],
    ["brief_version", 0], ["brief_version", 1.5], ["policy_version", 0],
    ["brief_id", ""], ["brief_id", "has space"], ["brief_id", "-starts-with-dash"],
    ["market", "ca"], ["market", "CAN"], ["market", ""],
    ["locale", "e"], ["locale", "x".repeat(36)],
    ["opportunity_score", -1], ["opportunity_score", 101], ["confidence", Number.NaN],
    ["valid_from", "2026-11-10T10:00:00+00:00"], // must end in Z
    ["valid_from", "not a date"], ["expires_at", "2026-13-40T10:00:00Z"],
    ["audience", ""], ["audience", "x".repeat(501)],
    ["allowed_channels", []], ["allowed_channels", ["seo", "seo"]],
    ["allowed_channels", ["email"]], ["allowed_channels", "seo"],
    ["prohibited_claims", Array.from({ length: 33 }, (_, i) => `c${i}`)],
    ["evidence_ids", Array.from({ length: 65 }, (_, i) => `ev_${i}`)],
    ["cta_id", 42], ["experiment_id", null],
  ];
  for (const [field, value] of bad) {
    const r = gb.validateShape({ ...FIXTURE, [field]: value });
    assert.equal(r.ok, false, `${field} = ${JSON.stringify(value)} was accepted`);
    assert.ok(r.errors.some((e) => e.startsWith(field)) || r.errors.some((e) => e.includes(field)),
      `the error does not name ${field}: ${r.errors.join("; ")}`);
  }
});

test("EVERY error is reported, not just the first", () => {
  // A brief is reviewed by a person. "Three fields are wrong and here they are"
  // is one correction; "field 4 is wrong", four times over, is four rounds of
  // guessing.
  const r = gb.validateShape({ ...FIXTURE, market: "ca", locale: "e", audience: "" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3, `only ${r.errors.length} error(s): ${r.errors.join("; ")}`);
});

test("a non-object, a null and an array are all refused without throwing", () => {
  for (const bad of [null, undefined, 42, "a brief", [], [FIXTURE], true]) {
    const r = gb.validateShape(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} was accepted`);
    assert.ok(r.errors.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Appendix A · the runtime rules
// ---------------------------------------------------------------------------

test("TI-05 · AN EXPIRED BRIEF CAN NEVER AUTHORISE WORK", () => {
  // "Approved brief expires while cached and an action is already queued" →
  // "SDK falls back to baseline. Executor denies the queued action."
  const after = gb.resolveEffective(FIXTURE, { channel: "seo", nowISO: "2026-11-17T10:00:01Z" });
  assert.equal(after.ok, false);
  assert.equal(after.code, "expired");
  assert.equal(after.baseline, true, "the answer must be 'use the baseline', not an error");
  assert.match(after.reason, /expired/i);

  // AT THE INSTANT IT EXPIRES IT IS EXPIRED. `now < expires_at`, not `<=` — a
  // brief valid for one millisecond past its own expiry has a different expiry.
  const exactly = gb.resolveEffective(FIXTURE, { channel: "seo", nowISO: FIXTURE.expires_at });
  assert.equal(exactly.ok, false);
  assert.equal(exactly.code, "expired");

  // And one millisecond before, it still works.
  const justBefore = gb.resolveEffective(FIXTURE, { channel: "seo", nowISO: "2026-11-17T09:59:59Z" });
  assert.equal(justBefore.ok, true, justBefore.ok ? "" : justBefore.reason);
});

test("a brief that has not started yet is not usable either", () => {
  const early = gb.resolveEffective(FIXTURE, { channel: "seo", nowISO: "2026-11-09T10:00:00Z" });
  assert.equal(early.ok, false);
  assert.equal(early.code, "not_yet_valid");
  // The boundary itself: valid_from is inclusive.
  const atStart = gb.resolveEffective(FIXTURE, { channel: "seo", nowISO: FIXTURE.valid_from });
  assert.equal(atStart.ok, true, atStart.ok ? "" : atStart.reason);
});

test("EXPIRY IS CHECKED BEFORE THE CHANNEL, because the consequences differ", () => {
  // An expired brief is unusable for every channel. Reporting "that channel is
  // not allowed" about a brief that expired yesterday sends somebody to change
  // the wrong setting.
  const r = gb.resolveEffective(FIXTURE, { channel: "paid", nowISO: "2026-12-01T10:00:00Z" });
  assert.equal(r.code, "expired", `reported ${r.code} for a brief that is both expired and wrong-channel`);
});

test("a channel the brief does not allow is refused, and the reserved enum grants nothing", () => {
  const r = gb.resolveEffective(FIXTURE, { channel: "paid", nowISO: INSIDE });
  assert.equal(r.ok, false);
  assert.equal(r.code, "channel_not_allowed");
  assert.match(r.reason, /seo, organic_social/);

  // The wider enum "reserves stable routing values for future adapters and
  // makes no feature available on its own" — so `paid` being a legal VALUE and
  // `paid` being a runnable ROUTE are different answers, and collapsing them is
  // how a customer is told a feature is broken when it was never released.
  assert.equal(gb.channelIsLive("seo"), true);
  assert.equal(gb.channelIsLive("organic_social"), true);
  for (const reserved of ["paid", "lifecycle", "sales_enablement", "owned_placement"]) {
    assert.ok(gb.BRIEF_CHANNELS.includes(reserved), `${reserved} must stay a legal value`);
    assert.equal(gb.channelIsLive(reserved), false, `${reserved} must not read as released`);
  }
  // A brief MAY allow a reserved channel — that is legal and separate.
  const allowsPaid = gb.validateShape({ ...FIXTURE, allowed_channels: ["seo", "paid"] });
  assert.equal(allowsPaid.ok, true, allowsPaid.ok ? "" : allowsPaid.errors.join("; "));
});

test("A GLOBAL BRIEF NEVER SATISFIES A COUNTRY-TARGETED LOOKUP", () => {
  // §16: "Reserve ZZ for explicitly global, non-country-targeted briefs. ZZ
  // never matches a country-targeted lookup by default." The convenient reading
  // is the opposite, and it would put global copy on a Canadian page with
  // nothing saying so.
  const global = { ...FIXTURE, market: gb.GLOBAL_MARKET };
  const asked = gb.resolveEffective(global, { channel: "seo", market: "CA", nowISO: INSIDE });
  assert.equal(asked.ok, false);
  assert.equal(asked.code, "market_mismatch");
  assert.match(asked.reason, /global/i);

  // Asked for globally, it resolves.
  const globally = gb.resolveEffective(global, { channel: "seo", market: "ZZ", nowISO: INSIDE });
  assert.equal(globally.ok, true, globally.ok ? "" : globally.reason);

  // And a country brief does not answer another country.
  const wrong = gb.resolveEffective(FIXTURE, { channel: "seo", market: "GB", nowISO: INSIDE });
  assert.equal(wrong.code, "market_mismatch");
});

test("locale, topic and POLICY VERSION all have to match", () => {
  assert.equal(gb.resolveEffective(FIXTURE, { channel: "seo", locale: "fr-FR", nowISO: INSIDE }).code, "locale_mismatch");
  assert.equal(gb.resolveEffective(FIXTURE, { channel: "seo", topic_id: "something-else", nowISO: INSIDE }).code, "topic_mismatch");
  // §18: "Edits, expiry or relevant policy/profile changes invalidate
  // approval." A brief approved under policy 5 cannot direct work being done
  // under policy 6 — the thing that was approved is not the thing that would
  // happen.
  const stale = gb.resolveEffective(FIXTURE, { channel: "seo", policy_version: 6, nowISO: INSIDE });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "policy_mismatch");
  assert.match(stale.reason, /policy version 5/);
  // Matching policy resolves.
  assert.equal(gb.resolveEffective(FIXTURE, { channel: "seo", policy_version: 5, nowISO: INSIDE }).ok, true);
});

test("a window that ends before it begins is not a window", () => {
  const backwards = { ...FIXTURE, valid_from: "2026-11-17T10:00:00Z", expires_at: "2026-11-10T10:00:00Z" };
  const r = gb.resolveEffective(backwards, { channel: "seo", nowISO: "2026-11-12T10:00:00Z" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "unreadable_window");
  // Equal is also not a window.
  const zero = { ...FIXTURE, expires_at: FIXTURE.valid_from };
  assert.equal(gb.resolveEffective(zero, { channel: "seo", nowISO: FIXTURE.valid_from }).code, "unreadable_window");
});

test("an unreadable clock refuses rather than guessing a window", () => {
  const r = gb.resolveEffective(FIXTURE, { channel: "seo", nowISO: "whenever" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "unreadable_window");
});

test("a malformed brief falls back to baseline instead of throwing", () => {
  // The SDK sits in a host's agent. A throw there takes the host's own
  // behaviour down with it, which is a worse outcome than no brief.
  for (const bad of [null, {}, { ...FIXTURE, market: "nope" }, "a brief"]) {
    const r = gb.resolveEffective(bad, { channel: "seo", nowISO: INSIDE });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid");
    assert.equal(r.baseline, true);
  }
});

test("THE CACHE CEILING IS NEVER BEYOND EXPIRY, which is the half that gets forgotten", () => {
  // §14.5: "The SDK may cache within a 60-second ceiling and never beyond
  // expiry." A 60-second cache on a brief with 10 seconds left is 50 seconds of
  // an expired brief directing live work.
  assert.equal(gb.CACHE_CEILING_MS, 60_000);
  const plenty = gb.cacheableForMs(FIXTURE, INSIDE);
  assert.equal(plenty, 60_000, "with days left, the ceiling applies");

  const tenSecondsLeft = gb.cacheableForMs(FIXTURE, "2026-11-17T09:59:50Z");
  assert.equal(tenSecondsLeft, 10_000, "with ten seconds left, ten seconds is the most it may be held");

  assert.equal(gb.cacheableForMs(FIXTURE, FIXTURE.expires_at), 0);
  assert.equal(gb.cacheableForMs(FIXTURE, "2026-12-01T00:00:00Z"), 0, "an expired brief is never cacheable");
  assert.equal(gb.cacheableForMs(FIXTURE, "nonsense"), 0);
});

// ---------------------------------------------------------------------------
// §5.4, §5.5, §17 · the two scores
// ---------------------------------------------------------------------------

test("TI-03 · the spec's own example produces 86.25 and 83.5, unrounded", () => {
  // "The isolated scorer receives the component inputs in §5 and returns 86.25
  // opportunity and 83.5 confidence" → "Reviewable brief only. Neither score is
  // rounded before the decision."
  const opportunity = ts.opportunityScore({ demand: 80, fit: 95, intent: 85, timing: 90, readiness: 80 });
  assert.equal(opportunity, 86.25);

  // The four confidence INPUTS in §5 are 90, 80, 70 and 90 — and the second is
  // the corroboration VALUE, which §17's step function assigns for exactly TWO
  // independent families. Three families scores 100 and gives 88.5, which is
  // how this test first disagreed with the spec.
  const confidence = ts.confidenceScore({ sourceQuality: 90, independentFamilies: 2, coverage: 70, freshness: 90 });
  assert.equal(confidence, 83.5);

  const d = ts.decide({ opportunity, confidence });
  assert.equal(d.band, "brief", d.reason);
  assert.equal(d.mayActAutomatically, false, "a reviewable brief is not an automatic action");
  // Unrounded through the decision: 86.25 and 83.5, not 86 and 84.
  assert.equal(d.opportunity, 86.25);
  assert.equal(d.confidence, 83.5);
});

test("the weights are the spec's, and they sum to one", () => {
  const o = Object.values(ts.OPPORTUNITY_WEIGHTS).reduce((a, b) => a + b, 0);
  const c = Object.values(ts.CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(o - 1) < 1e-12, `opportunity weights sum to ${o}`);
  assert.ok(Math.abs(c - 1) < 1e-12, `confidence weights sum to ${c}`);
  assert.deepEqual(ts.OPPORTUNITY_WEIGHTS, { demand: 0.25, fit: 0.25, intent: 0.20, timing: 0.15, readiness: 0.15 });
  assert.deepEqual(ts.CONFIDENCE_WEIGHTS, { sourceQuality: 0.35, corroboration: 0.25, coverage: 0.20, freshness: 0.20 });
  // Derived rather than copied: the max possible score is 100 on both.
  assert.equal(ts.opportunityScore({ demand: 100, fit: 100, intent: 100, timing: 100, readiness: 100 }), 100);
  assert.equal(ts.confidenceScore({ sourceQuality: 100, independentFamilies: 3, coverage: 100, freshness: 100 }), 100);
});

test("ONE SOURCE FAMILY CAN NEVER AUTHORISE ANYTHING — the cap at 69", () => {
  // Without the cap, a single family with perfect quality, coverage and
  // freshness scores 75 on the weights alone — which clears the ≥75 brief
  // threshold on one feed. The cap is what makes "one source is never enough"
  // true rather than merely likely.
  const perfectSingle = ts.confidenceScore({ sourceQuality: 100, independentFamilies: 1, coverage: 100, freshness: 100 });
  assert.equal(perfectSingle, ts.SINGLE_FAMILY_CAP);
  assert.ok(perfectSingle < 75, "a single family must not be able to reach the brief threshold");
  assert.equal(ts.decide({ opportunity: 100, confidence: perfectSingle }).band, "watch");

  // Zero families is not one family.
  assert.ok(ts.confidenceScore({ sourceQuality: 100, independentFamilies: 0, coverage: 100, freshness: 100 }) <= ts.SINGLE_FAMILY_CAP);

  // §17's step function, exactly: "0 for one independent family, 80 for two and
  // 100 for three or more." One family corroborates nothing — that is what the
  // word means — so it is zero rather than something generous.
  assert.equal(ts.corroborationScore(0), 0);
  assert.equal(ts.corroborationScore(1), 0);
  assert.equal(ts.corroborationScore(2), 80);
  assert.equal(ts.corroborationScore(3), 100);
  assert.equal(ts.corroborationScore(9), 100);
});

test("§5's decision table, at every boundary", () => {
  const b = (opportunity, confidence, optIn) => ts.decide({ opportunity, confidence, autoActionOptIn: optIn }).band;
  // Archive cutoffs: below 60 score OR below 55 confidence.
  assert.equal(b(59.99, 90), "archive");
  assert.equal(b(90, 54.99), "archive");
  // Watch band.
  assert.equal(b(60, 55), "watch");
  assert.equal(b(74.99, 90), "watch");
  assert.equal(b(90, 74.99), "watch");
  // Brief needs BOTH at 75.
  assert.equal(b(75, 75), "brief");
  assert.equal(b(84.99, 99), "brief");
  // The top band needs both at 85 AND an explicit opt-in this installation
  // must have given. Without it, ≥85/≥85 is still only a reviewable brief.
  assert.equal(b(85, 85), "brief");
  assert.equal(b(85, 85, true), "auto_eligible");
  assert.equal(ts.decide({ opportunity: 99, confidence: 99 }).mayActAutomatically, false);
  assert.equal(ts.decide({ opportunity: 99, confidence: 99, autoActionOptIn: true }).mayActAutomatically, true);
});

test("A VETO IS NOT A LOW SCORE", () => {
  // An out-of-market topic scoring 95 is not "95 but risky" — it is refused,
  // and the reason is named so somebody can fix the cause rather than argue
  // with the number.
  const d = ts.decide({ opportunity: 99, confidence: 99, vetoes: ["out_of_market"], autoActionOptIn: true });
  assert.equal(d.band, "watch");
  assert.equal(d.mayActAutomatically, false);
  assert.deepEqual(d.vetoes, ["out_of_market"]);
  assert.match(d.reason, /not a low score/i);
  // The scores are still reported — a veto hides nothing.
  assert.equal(d.opportunity, 99);
});

test("MISSING READINESS BLOCKS ACTIVATION rather than lowering the score", () => {
  // §5.4 says so in those words. With no stock, no approved claim or no
  // available target, scoring it 0 and letting the weighted sum carry it would
  // make a perfect-on-paper opportunity actionable on nothing to sell.
  const d = ts.assess({
    opportunity: { demand: 100, fit: 100, intent: 100, timing: 100, readiness: 0 },
    confidence: { sourceQuality: 100, independentFamilies: 3, coverage: 100, freshness: 100 },
  });
  assert.ok(d.vetoes.includes("readiness_missing"), `vetoes were ${d.vetoes.join(", ")}`);
  assert.equal(d.band, "watch");
  assert.equal(d.mayActAutomatically, false);

  // With readiness, the same inputs are eligible.
  const ready = ts.assess({
    opportunity: { demand: 100, fit: 100, intent: 100, timing: 100, readiness: 100 },
    confidence: { sourceQuality: 100, independentFamilies: 3, coverage: 100, freshness: 100 },
    autoActionOptIn: true,
  });
  assert.equal(ready.band, "auto_eligible");
});

test("§5.3's gates: a rise on a handful of events is noise", () => {
  const history = [10, 12, 11, 13, 9, 12, 11, 10];
  // Over the volume gate and a real movement.
  const strong = ts.demandFromCountFeed(60, history);
  assert.equal(strong.passesGate, true, strong.why);
  assert.ok(strong.demand > 50 && strong.demand <= 100, `demand ${strong.demand}`);
  assert.ok(strong.z >= ts.COUNT_GATE.minZ);

  // Under the count gate: 100× movement on 5 events is still 5 events.
  const tiny = ts.demandFromCountFeed(5, [0, 0, 0, 0, 0, 0]);
  assert.equal(tiny.passesGate, false);
  assert.equal(tiny.demand, 0, "a gate that produces a demand score has not gated anything");
  assert.match(tiny.why, /under the gate of 20/);

  // Over the count gate but within normal variation.
  const flat = ts.demandFromCountFeed(21, [20, 22, 21, 19, 20, 21, 22, 20]);
  assert.equal(flat.passesGate, false);
  assert.match(flat.why, /normal variation/);

  // §5.3: "With fewer than four comparable periods, label insufficient history
  // and keep draft-only."
  const young = ts.demandFromCountFeed(100, [1, 2, 3]);
  assert.equal(young.passesGate, false);
  assert.match(young.why, /comparable period/);
  assert.equal(ts.MIN_COMPARABLE_PERIODS, 4);
});

test("the movement statistics are the spec's formulae, with its own floor", () => {
  // lift = ln((c+1)/(b+1)); z = (log1p(c) − median(log1p(x))) / max(1.4826×MAD, 0.2)
  const history = [10, 10, 10, 10, 10, 10];
  const m = ts.movement(20, history);
  assert.ok(Math.abs(m.lift - Math.log(21 / 11)) < 1e-9, `lift was ${m.lift}`);
  // A feed with NO historical variation has MAD 0, and the 0.2 floor is what
  // stops one quiet week producing an enormous z.
  const expectedZ = (Math.log1p(20) - Math.log1p(10)) / 0.2;
  assert.ok(Math.abs(m.z - expectedZ) < 1e-9, `z was ${m.z}, expected ${expectedZ}`);
  assert.ok(Number.isFinite(m.z), "the denominator floor must stop a division by zero");

  // No history at all is not an infinite rise.
  const none = ts.movement(50, []);
  assert.equal(none.z, 0);
  assert.equal(none.insufficientHistory, true);
  assert.ok(Number.isFinite(none.lift));
});

test("hostile and absent numbers never produce a score", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -50, "80", null, undefined]) {
    const o = ts.opportunityScore({ demand: bad, fit: bad, intent: bad, timing: bad, readiness: bad });
    assert.ok(Number.isFinite(o) && o >= 0 && o <= 100, `${String(bad)} produced ${o}`);
    const c = ts.confidenceScore({ sourceQuality: bad, independentFamilies: bad, coverage: bad, freshness: bad });
    assert.ok(Number.isFinite(c) && c >= 0 && c <= 100, `${String(bad)} produced ${c}`);
  }
  // And an out-of-range input is clamped rather than carried.
  assert.equal(ts.opportunityScore({ demand: 1000, fit: 0, intent: 0, timing: 0, readiness: 0 }), 25);
});

test("THIS IS NOT THE CONTENT OPPORTUNITY RADAR, and both still exist", async () => {
  // The additive-only law: when new content conflicts with old, keep both and
  // record the conflict. `opportunity-radar.ts` publishes a different,
  // multiplicative score for ranking CONTENT opportunities and the landing
  // pages describe it. This one is a weighted sum that gates activation.
  // Neither may quietly become the other.
  const radar = await import("../src/backend/opportunity-radar.ts");
  assert.equal(typeof radar.scoreOpportunity, "function", "the radar's own scorer must still be there");
  assert.equal(typeof ts.opportunityScore, "function");

  // They are genuinely different functions: the same notional inputs do not
  // produce the same number, which is why one cannot be deleted for the other.
  const weighted = ts.opportunityScore({ demand: 80, fit: 95, intent: 85, timing: 90, readiness: 80 });
  assert.equal(weighted, 86.25);
  assert.ok(Array.isArray(radar.SIGNAL_SOURCES) && radar.SIGNAL_SOURCES.length > 0);

  // And the conflict is written down where the next person will look.
  const { readFileSync } = await import("node:fs");
  const doc = readFileSync(new URL("../docs/TREND-INTELLIGENCE-COVERAGE.md", import.meta.url), "utf8");
  assert.match(doc, /CONFLICT: two opportunity scores/);
  assert.match(doc, /keep both/i);
});

// ===========================================================================
// EMBEDDED INTO THE PLATFORM, not parked beside it.
//
// The contracts above are worth nothing until something on this platform
// consults them. These cover the wiring: the twelve signal sources the radar
// has always published, the weekly trend sweep, the search boundary that was
// dropping the two fields freshness needs, the approvals workflow a brief is
// reviewed in, and the emergency stop that freezes it.
// ===========================================================================

const radar = await import("../src/backend/opportunity-radar.ts");
const watch = await import("../src/backend/trend-watch.ts");
const briefStore = await import("../src/backend/growth-brief-store.ts");
const approvals = await import("../src/backend/approvals.ts");
const sharedApprovals = await import("../src/shared/approvals.ts");
const board = await import("../src/shared/opportunity-board.ts");
const stop = await import("../src/backend/emergency-stop.ts");
const search = await import("../src/backend/search.ts");

test("EVERY signal source the radar publishes has a declared family", () => {
  // THE BINDING THAT STOPS THE TWO LISTS DRIFTING. An unmapped source would be
  // silently ignored by `familiesOf`, so a thirteenth source added to the radar
  // would quietly stop corroborating anything — or, on the generous reading
  // somebody would reach for to "fix" it, start counting as its own family and
  // inflate every confidence score on the platform.
  for (const s of radar.SIGNAL_SOURCES) {
    assert.ok(ts.SOURCE_FAMILY[s], `${s} is published by the radar and has no source family`);
  }
  // And the reverse: no family map entry that is not a real source.
  for (const k of Object.keys(ts.SOURCE_FAMILY)) {
    assert.ok((radar.SIGNAL_SOURCES).includes(k), `${k} has a family but is not a signal source`);
  }
  // Every family must have a configured quality, or `sourceQualityOf` silently
  // scores it zero and the cause is invisible.
  for (const fam of new Set(Object.values(ts.SOURCE_FAMILY))) {
    assert.equal(typeof ts.FAMILY_QUALITY[fam], "number", `${fam} has no configured quality`);
  }
});

test("corroboration counts FAMILIES, which is the whole point of the cap", () => {
  // Our own records of our own customers are one view held three times.
  const firstParty = ts.familiesOf(["support_issues", "sales_objections", "website_analytics"]);
  assert.deepEqual(firstParty.families, ["first_party"]);
  assert.equal(firstParty.independentFamilies, 1, "three first-party sources are not three families");

  // A date that was knowable a year ago is not two observations either.
  assert.equal(ts.familiesOf(["seasonal_events", "cultural_events"]).independentFamilies, 1);

  // But a search engine and an assistant are genuinely different populations.
  assert.equal(ts.familiesOf(["search_queries", "ai_prompts"]).independentFamilies, 2);

  // AN UNMAPPED SOURCE IS NOT A FAMILY — the generous reading is the dangerous
  // one, because anything able to name three strings would clear corroboration.
  const fake = ts.familiesOf(["made_up_a", "made_up_b", "made_up_c"]);
  assert.equal(fake.independentFamilies, 0);
  assert.deepEqual(fake.unmapped, ["made_up_a", "made_up_b", "made_up_c"]);
  assert.match(fake.why, /no family is declared/);

  // Sorted and de-duplicated, so the count is reproducible across machines
  // (§17's whole concern).
  assert.deepEqual(ts.familiesOf(["reviews", "news", "reviews"]).families, ["news", "review"]);
  assert.deepEqual(ts.familiesOf(null).families, []);
  assert.deepEqual(ts.familiesOf([" ", ""]).families, []);
});

test("a date the provider sent is read; one it did not is NOT guessed at", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(ts.ageHoursFrom("2 hours ago", now), 2);
  assert.equal(ts.ageHoursFrom("1 day ago", now), 24);
  assert.equal(ts.ageHoursFrom("3 weeks ago", now), 504);
  assert.equal(ts.ageHoursFrom("45 minutes ago", now), 0.75);
  assert.equal(ts.ageHoursFrom("yesterday", now), 24);
  assert.equal(ts.ageHoursFrom("just now", now), 0);
  assert.equal(ts.ageHoursFrom("2026-11-09T12:00:00Z", now), 24);

  // THE IMPORTANT ONE. A parser that answers "0 hours" for text it did not
  // understand reports every unreadable date as breaking news, which is the
  // most expensive possible way to be wrong about freshness.
  assert.equal(ts.ageHoursFrom("sometime last quarter", now), null);
  assert.equal(ts.ageHoursFrom("", now), null);
  assert.equal(ts.ageHoursFrom(undefined, now), null);
  assert.equal(ts.ageHoursFrom(null, now), null);

  // A publication date in the future is a bad record, not freshness.
  assert.equal(ts.ageHoursFrom("2027-01-01T00:00:00Z", now), 0);
});

test("freshness tapers, and an unknown age scores zero rather than full marks", () => {
  assert.equal(ts.freshnessFrom(0), 100);
  assert.equal(ts.freshnessFrom(ts.FULLY_FRESH_HOURS), 100);
  assert.equal(ts.freshnessFrom(ts.STALE_AFTER_HOURS), 0);
  assert.equal(ts.freshnessFrom(ts.STALE_AFTER_HOURS + 1000), 0);
  assert.equal(ts.freshnessFrom(null), 0, "an unreadable date must not score as fresh");
  const mid = ts.freshnessFrom((ts.FULLY_FRESH_HOURS + ts.STALE_AFTER_HOURS) / 2);
  assert.ok(mid > 49 && mid < 51, `midpoint should be ~50, got ${mid}`);
  // Monotonic: older is never fresher.
  for (let h = 0; h < ts.STALE_AFTER_HOURS; h += 37) {
    assert.ok(ts.freshnessFrom(h) >= ts.freshnessFrom(h + 37), `freshness rose between ${h}h and ${h + 37}h`);
  }
});

test("THE WEEKLY SWEEP IS ONE FAMILY, and now says so in the spec's units", () => {
  const e = watch.evidenceFor({ rejected: false, relevanceKnown: true, coverage: 100, ageHours: 1 });
  assert.deepEqual(e.families, ["news"]);
  assert.ok(e.confidence <= ts.SINGLE_FAMILY_CAP, `one family must cap at ${ts.SINGLE_FAMILY_CAP}, got ${e.confidence}`);
  // The ceiling is computed by asking the real decision table at a PERFECT
  // opportunity score — so it is a statement about the evidence alone.
  assert.equal(e.ceiling, "watch", "a single news family can never support a brief, however good the headline");
  assert.match(e.why, /one source family|One family alone/i);

  // The existing risk gate, named in the spec's vocabulary. Not re-judged.
  assert.deepEqual(watch.evidenceFor({ rejected: true, relevanceKnown: true, coverage: 100, ageHours: 1 }).vetoes, ["restricted_topic"]);
  // No crawl means no vocabulary, which IS the spec's readiness gap.
  assert.deepEqual(watch.evidenceFor({ rejected: false, relevanceKnown: false, coverage: 100, ageHours: 1 }).vetoes, ["readiness_missing"]);

  // ZERO FAMILIES IS NOT ONE FAMILY. The first version of this sentence told a
  // reassuring story ("a single source family is capped at 69") about a
  // candidate backed by nothing recognisable at all.
  const none = watch.evidenceFor({ sources: ["nonsense"], rejected: false, relevanceKnown: true, coverage: 100, ageHours: 1 });
  assert.equal(none.families.length, 0);
  assert.match(none.why, /nothing here is backed by a source family/);
  assert.doesNotMatch(none.why, /one source family is capped/);

  // Four real families CAN reach a brief — so the cap is a cap and not a floor
  // that nothing ever clears.
  const many = watch.evidenceFor({
    sources: ["news", "reviews", "search_queries", "support_issues"],
    rejected: false, relevanceKnown: true, coverage: 100, ageHours: 1,
  });
  assert.ok(many.confidence > ts.SINGLE_FAMILY_CAP);
  assert.equal(many.ceiling, "brief");
});

test("the search boundary carries the publisher and the date it used to drop", async () => {
  // Demo mode, which is the path with no key — and it must exercise the SAME
  // fields the live mapper carries, or the measured path is never driven here.
  const news = await search.webSearch({ query: "common data environment", type: "news" });
  assert.ok(news.results.length > 0);
  for (const r of news.results) {
    assert.equal(typeof r.extra?.source, "string", "a news result must carry its publisher");
    assert.equal(typeof r.extra?.date, "string", "a news result must carry its date");
    assert.notEqual(ts.ageHoursFrom(r.extra.date, Date.now()), null, `"${r.extra.date}" must be readable as an age`);
  }
  // Not every search type invents them.
  const web = await search.webSearch({ query: "anything", type: "search" });
  assert.equal(web.results[0]?.extra?.source, undefined, "a plain web result has no publisher to claim");
});

test("the sweep's existing recommendation is UNCHANGED — this is additive", async () => {
  const extraction = {
    brand: { name: "X", tagline: "common data environment for trades" },
    products: { values: ["common data environment"] },
    services: { values: ["document control"] },
    hierarchy: [{ level: 1, text: "common data environment" }],
    navigation: [{ label: "document control" }],
    faqs: [{ q: "what is a common data environment" }],
  };
  const r = await watch.watchTrends({
    brandId: "b_test", business: "Construction software", extraction,
    now: () => Date.parse("2026-11-10T12:00:00Z"),
  });
  assert.ok(r.findings.length > 0);
  for (const f of r.findings) {
    // The old surface, intact.
    assert.ok(["join", "watch", "reject"].includes(f.action));
    assert.ok(f.relevance && typeof f.why === "string");
    // The new surface, beside it.
    assert.ok(f.evidence, "every finding carries its evidence");
    assert.ok(f.evidence.confidence <= ts.SINGLE_FAMILY_CAP);
    assert.equal(typeof f.ageHours === "number" || f.ageHours === null, true);
  }
  // A "join" is still a recommendation, and the note refuses to let it read as
  // permission.
  assert.match(r.note, /recommendations for a person to weigh/);
  assert.match(r.note, new RegExp(String(ts.SINGLE_FAMILY_CAP)));
});

test("REOPEN IS NOW LEGAL FROM APPROVED, and every move that was legal still is", () => {
  const T = sharedApprovals.TRANSITIONS;
  // The addition.
  assert.ok(sharedApprovals.canApply("reopen", "approved"), "an approved item must be able to go back when its content changes");
  // Nothing removed, nothing re-pointed.
  assert.deepEqual(T.submit, { from: ["draft", "changes_requested"], to: "in_review" });
  assert.deepEqual(T.approve, { from: ["in_review"], to: "approved" });
  assert.deepEqual(T.request_changes, { from: ["in_review"], to: "changes_requested" });
  assert.deepEqual(T.reject, { from: ["in_review"], to: "rejected" });
  assert.deepEqual(T.publish, { from: ["approved"], to: "published" });
  assert.equal(T.reopen.to, "draft");
  for (const s of ["rejected", "published"]) {
    assert.ok(T.reopen.from.includes(s), `reopen must still be legal from ${s}`);
  }
  // Still illegal where it always was.
  assert.equal(sharedApprovals.canApply("reopen", "draft"), false);
  assert.equal(sharedApprovals.canApply("approve", "draft"), false);
});

test("a brief cannot be issued below the band, and the gate is asked not copied", async () => {
  briefStore.__resetBriefs();
  const now = "2026-11-10T12:00:00Z";
  const base = { ...FIXTURE, brief_id: "gb_issue_1", valid_from: "2026-11-10T10:00:00Z", expires_at: "2026-11-17T10:00:00Z" };

  const invalid = await briefStore.issueBrief({ brandId: "b1", brief: { ...base, injected: true }, gate: { opportunity: 99, confidence: 99 }, issuedBy: "t", nowISO: now });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid", "the CONTRACT is checked before the score — an object missing half its fields cannot be judged on its band");

  const low = await briefStore.issueBrief({ brandId: "b1", brief: base, gate: { opportunity: 90, confidence: 69 }, issuedBy: "t", nowISO: now });
  assert.equal(low.ok, false);
  assert.equal(low.code, "below_band");
  assert.match(low.error, /second independent family/, "the remedy must name the missing family, not a better headline");

  const veto = await briefStore.issueBrief({ brandId: "b1", brief: base, gate: { opportunity: 99, confidence: 99, vetoes: ["out_of_market"] }, issuedBy: "t", nowISO: now });
  assert.equal(veto.ok, false);
  assert.equal(veto.code, "vetoed");
  assert.match(veto.error, /not a low score/);

  // Exactly at the boundary, which is where a copied threshold drifts.
  const edge = await briefStore.issueBrief({ brandId: "b1", brief: base, gate: { opportunity: 75, confidence: 75 }, issuedBy: "t", nowISO: now });
  assert.equal(edge.ok, true, "75/75 is the brief band, inclusive");
  assert.ok(edge.stored.approvalId.startsWith("ap_"), "it must create an item in the platform's own approvals workflow");
});

test("§18: RE-ISSUING INVALIDATES THE APPROVAL, and the refusal is read", async () => {
  briefStore.__resetBriefs();
  const now = "2026-11-10T12:00:00Z";
  const base = { ...FIXTURE, brief_id: "gb_reissue", valid_from: "2026-11-10T10:00:00Z", expires_at: "2026-11-17T10:00:00Z" };
  const first = await briefStore.issueBrief({ brandId: "b2", brief: base, gate: { opportunity: 90, confidence: 90 }, issuedBy: "t", nowISO: now });
  assert.equal(first.ok, true);

  await approvals.transition({ id: first.stored.approvalId, action: "submit", actor: "t", nowISO: now });
  await approvals.transition({ id: first.stored.approvalId, action: "approve", actor: "t", nowISO: now });
  assert.equal((await approvals.getItem(first.stored.approvalId)).state, "approved");

  const live = await briefStore.effectiveBrief({ brandId: "b2", briefId: "gb_reissue", req: { channel: "seo", nowISO: "2026-11-11T10:00:00Z" } });
  assert.equal(live.ok, true, "an approved brief inside its window resolves");

  // The edit.
  const again = await briefStore.issueBrief({ brandId: "b2", brief: { ...base, objective: "A different objective" }, gate: { opportunity: 90, confidence: 90 }, issuedBy: "t", nowISO: "2026-11-10T13:00:00Z" });
  assert.equal(again.ok, true);
  assert.equal(again.stored.brief.brief_version, base.brief_version + 1, "an edit bumps the version");

  // THE DEFECT THIS TEST EXISTS FOR. The first implementation called
  // `transition` with an action that is illegal from `approved`, threw the
  // refusal away, and left a sign-off standing for content nobody approved —
  // this repo's oldest fault, a value that never crossed a boundary.
  assert.equal((await approvals.getItem(first.stored.approvalId)).state, "draft", "the sign-off must actually be withdrawn");
  const after = await briefStore.effectiveBrief({ brandId: "b2", briefId: "gb_reissue", req: { channel: "seo", nowISO: "2026-11-11T10:00:00Z" } });
  assert.equal(after.ok, false);
  assert.equal(after.code, "not_approved");
});

test("§14: a frozen publish lane refuses FIRST, and through the same shape", async () => {
  briefStore.__resetBriefs();
  stop.__resetEmergencyStop();
  const now = "2026-11-10T12:00:00Z";
  // Deliberately an EXPIRED brief, so the test proves the ORDER: a frozen lane
  // must be reported before the window, because telling somebody their brief
  // expired when their whole publish lane is stopped sends them to fix the
  // wrong thing.
  const expired = { ...FIXTURE, brief_id: "gb_frozen", valid_from: "2026-11-01T10:00:00Z", expires_at: "2026-11-02T10:00:00Z" };
  const issued = await briefStore.issueBrief({ brandId: "b3", brief: expired, gate: { opportunity: 90, confidence: 90 }, issuedBy: "t", nowISO: now });
  assert.equal(issued.ok, true);

  const before = await briefStore.effectiveBrief({ brandId: "b3", briefId: "gb_frozen", req: { channel: "seo", nowISO: now } });
  assert.notEqual(before.code, "channel_frozen", "nothing is frozen yet");

  await stop.engage({ scope: "b3", lanes: ["publish"], reason: "incident", engagedBy: "ops", nowISO: now });
  const frozen = await briefStore.effectiveBrief({ brandId: "b3", briefId: "gb_frozen", req: { channel: "seo", nowISO: now } });
  assert.equal(frozen.code, "channel_frozen");
  assert.equal(frozen.ok, false);
  assert.equal(frozen.baseline, true, "a freeze must arrive in the same shape every other refusal uses");

  // THE STOP REFUSES A THIN RELEASE NOTE, and this test originally passed one.
  // It then read the stop's correct refusal as a defect in the brief resolver.
  // Asserting it deliberately means the next person meets the rule rather than
  // the symptom.
  const thin = await stop.release({ scope: "b3", releasedBy: "ops", note: "over", nowISO: now });
  assert.equal(thin.ok, false, "a four-character note must not lift an incident halt");
  const stillFrozen = await briefStore.effectiveBrief({ brandId: "b3", briefId: "gb_frozen", req: { channel: "seo", nowISO: now } });
  assert.equal(stillFrozen.code, "channel_frozen", "a refused release leaves the freeze in place");

  const lifted = await stop.release({ scope: "b3", releasedBy: "ops", note: "incident closed, publishing resumed", nowISO: now });
  assert.equal(lifted.ok, true);
  const released = await briefStore.effectiveBrief({ brandId: "b3", briefId: "gb_frozen", req: { channel: "seo", nowISO: now } });
  assert.notEqual(released.code, "channel_frozen");
  // And NOW the next refusal in the order answers, proving the freeze really
  // was ahead of it rather than being the only thing wrong. The order is
  // frozen → unknown brief → unapproved → window, and this brief was never
  // approved, so `not_approved` is what surfaces — an unapproved brief is
  // unusable whatever its dates say, which is why it is checked before them.
  assert.equal(released.code, "not_approved");
});

test("a brief id that is not this brand's never says whether it exists", async () => {
  briefStore.__resetBriefs();
  const now = "2026-11-10T12:00:00Z";
  await briefStore.issueBrief({ brandId: "tenant_a", brief: { ...FIXTURE, brief_id: "gb_private" }, gate: { opportunity: 90, confidence: 90 }, issuedBy: "t", nowISO: now });
  const theirs = await briefStore.effectiveBrief({ brandId: "tenant_b", briefId: "gb_private", req: { channel: "seo", nowISO: now } });
  assert.equal(theirs.code, "no_such_brief");
  // The SAME answer for an id that was never issued at all — the two cases must
  // be indistinguishable or the refusal is an existence oracle.
  const nobody = await briefStore.effectiveBrief({ brandId: "tenant_b", briefId: "gb_never", req: { channel: "seo", nowISO: now } });
  assert.equal(nobody.code, "no_such_brief");
  assert.equal(theirs.reason, nobody.reason);
  // And tenant_a still has it.
  assert.equal((await briefStore.listBriefs("tenant_a")).length, 1);
  assert.equal((await briefStore.listBriefs("tenant_b")).length, 0);
});

test("a stored document is not a brief until something has checked it", () => {
  assert.equal(briefStore.briefFromStored(null), null);
  assert.equal(briefStore.briefFromStored({ brandId: "b", approvalId: "ap_1" }), null, "no brief at all");
  assert.equal(briefStore.briefFromStored({ brandId: "b", approvalId: "ap_1", brief: { ...FIXTURE, market: "nope" } }), null, "a document that no longer validates is dropped, never repaired into something that looks real");
  const good = briefStore.briefFromStored({ brandId: "b", approvalId: "ap_1", brief: FIXTURE, issuedAt: "x", issuedBy: "y", updatedAt: "z" });
  assert.ok(good);
  assert.equal(good.brief.brief_id, FIXTURE.brief_id);
});

test("the board carries the activation side and never invents it", () => {
  const plain = board.createItem({ id: "o1", topic: "t", at: "2026-11-10T00:00:00Z" });
  // ABSENT, not zero. A stored 0 for "nobody assessed it" reads on screen as
  // "assessed, and worthless" — a different and wrong claim.
  assert.equal("confidence" in plain, false);
  assert.equal("band" in plain, false);
  assert.equal("vetoes" in plain, false);

  const assessed = board.createItem({ id: "o2", topic: "t", at: "2026-11-10T00:00:00Z", confidence: 58.2, band: "watch", vetoes: ["restricted_topic"] });
  assert.equal(assessed.confidence, 58.2);
  assert.equal(assessed.band, "watch");
  assert.deepEqual(assessed.vetoes, ["restricted_topic"]);
  // Zero is a real assessment and must survive.
  assert.equal(board.createItem({ id: "o3", topic: "t", at: "2026-11-10T00:00:00Z", confidence: 0 }).confidence, 0);
  // An empty veto list is not a veto.
  assert.equal("vetoes" in board.createItem({ id: "o4", topic: "t", at: "2026-11-10T00:00:00Z", vetoes: [] }), false);
});

test("the PROVIDER mapper keeps the publisher and the date — driven with no key", () => {
  // THIS PATH HAS NEVER BEEN REACHABLE BY A TEST. It only runs with a live
  // SERPER_API_KEY, which CI does not have and this container does not have, so
  // the one function deciding which provider fields survive into the platform
  // was unexercised — and it had been dropping both of these the whole time.
  const payload = {
    news: [
      { title: "CDE adoption rises", link: "https://ex.com/a", snippet: "s", date: "2 hours ago", source: "Reuters" },
      { title: "Handover packs", link: "https://ex.com/b", snippet: "s2", date: "Mar 3, 2026", source: "FT" },
    ],
  };
  const out = search.normaliseSerper(payload, "news");
  assert.equal(out.length, 2);
  assert.equal(out[0].extra.source, "Reuters");
  assert.equal(out[0].extra.date, "2 hours ago");
  assert.equal(out[1].extra.source, "FT");
  assert.notEqual(ts.ageHoursFrom(out[0].extra.date, Date.now()), null);

  // A news item the provider sent WITHOUT them must not acquire them.
  const bare = search.normaliseSerper({ news: [{ title: "No date", link: "https://ex.com/c" }] }, "news");
  assert.equal(bare[0].extra.source, undefined);
  assert.equal(bare[0].extra.date, undefined);
  assert.equal(ts.freshnessFrom(ts.ageHoursFrom(bare[0].extra?.date, Date.now())), 0, "an absent date scores zero freshness, never full marks");

  // The other result types still map as they did — nothing was traded away.
  const places = search.normaliseSerper({ places: [{ title: "Shop", address: "1 High St", rating: 4.5, phoneNumber: "+44" }] }, "places");
  assert.equal(places[0].snippet, "1 High St");
  assert.equal(places[0].extra.rating, 4.5);
  assert.equal(places[0].extra.phone, "+44");
  assert.deepEqual(search.normaliseSerper({}, "news"), [], "a payload with nothing in it maps to nothing");
});

test("THE TENANT FILTER, applied where a test can actually reach it", () => {
  // The Firestore query narrows by brandId and no test here can run it — no
  // Admin credentials in CI or in this container. A mutation sweep proved that
  // deleting the `where` clause broke nothing, which on a tenant boundary is
  // the one place that is not acceptable. This is the same filter, pure.
  const rec = (brandId, id) => ({ brandId, brief: { ...FIXTURE, brief_id: id }, approvalId: "ap_x", issuedWith: { opportunity: 0, confidence: 0, vetoes: [], band: "brief" }, issuedAt: "a", issuedBy: "b", updatedAt: "c" });
  const all = [rec("tenant_a", "g1"), rec("tenant_b", "g2"), rec("tenant_a", "g3")];
  assert.deepEqual(briefStore.onlyThisBrand(all, "tenant_a").map((r) => r.brief.brief_id), ["g1", "g3"]);
  assert.deepEqual(briefStore.onlyThisBrand(all, "tenant_b").map((r) => r.brief.brief_id), ["g2"]);
  assert.deepEqual(briefStore.onlyThisBrand(all, "tenant_c"), []);
  // An empty or whitespace brand matches NOTHING. Falling back to "everything"
  // for a missing tenant is how a filter becomes a leak.
  assert.deepEqual(briefStore.onlyThisBrand(all, ""), []);
  assert.deepEqual(briefStore.onlyThisBrand(all, "   "), []);
  // No substring or prefix matching — the dangerous direction, since a filter
  // that matches prefixes hands "tenant_a" everything under "tenant_a_b".
  assert.deepEqual(briefStore.onlyThisBrand(all, "tenant"), []);
  assert.deepEqual(briefStore.onlyThisBrand(all, "tenant_a_extra"), []);
  assert.deepEqual(briefStore.onlyThisBrand(all, "TENANT_A"), [], "ids are case-sensitive, as the store writes them");
  // Surrounding whitespace is trimmed, deliberately and consistently with the
  // route, which trims `brandId` before the access check — so the id that was
  // authorised and the id that filters are the same string. Not trimming here
  // would authorise a caller for a tenant and then show them nothing.
  assert.deepEqual(briefStore.onlyThisBrand(all, " tenant_a ").map((r) => r.brief.brief_id), ["g1", "g3"]);
});

// ===========================================================================
// AND IT WORKS INVISIBLY.
//
// Owner directive: "nothing to be visible to users as it needs to work
// invisible." So there is no panel, no chips and no screen to operate — the
// brief is picked up on an agent run the way live DNS, brand memory and a site
// crawl already are, and a run without one is exactly the run the route always
// made (§14.5: no approved brief means host baseline behaviour).
// ===========================================================================

const preflight = await import("../src/backend/brief-preflight.ts");
const provider = await import("../src/backend/provider.ts");

test("EVERY GATHERED FACT REACHES THE MODEL — including the brief", () => {
  // THE SEAM THIS REPO KEEPS LOSING VALUES AT. "The brief is gathered" and
  // "the brief reaches the model" were two different claims with nothing
  // connecting them until this function was pulled out of the call site.
  const prompt = provider.promptFromInput({
    business: "Evan Deli",
    brandMemory: "what other agents learned",
    liveSiteFacts: "what the crawl read",
    liveDnsFacts: "what DNS said",
    growthBrief: "AN APPROVED GROWTH BRIEF IS IN FORCE",
  });
  for (const key of ["business", "brandMemory", "liveSiteFacts", "liveDnsFacts", "growthBrief"]) {
    assert.match(prompt, new RegExp(`- ${key}: `), `${key} was gathered and never reached the prompt`);
  }
  assert.match(prompt, /AN APPROVED GROWTH BRIEF IS IN FORCE/);

  // An empty value is dropped, not sent as a blank: "- website: " tells a model
  // there is a website whose address is nothing, which is worse than silence.
  const sparse = provider.promptFromInput({ business: "X", website: "", growthBrief: "   " });
  assert.match(sparse, /- business: X/);
  assert.doesNotMatch(sparse, /- website:/);
  assert.doesNotMatch(sparse, /- growthBrief:/);
});

test("the preamble states the brief as CONSTRAINTS, with prohibitions absolute", () => {
  const p = preflight.briefPreamble(FIXTURE, "seo");
  assert.match(p, /APPROVED GROWTH BRIEF IS IN FORCE/);
  assert.match(p, /constraint, not a suggestion/);
  assert.match(p, new RegExp(FIXTURE.topic_id));
  assert.match(p, new RegExp(FIXTURE.audience));
  assert.match(p, new RegExp(FIXTURE.cta_id));
  assert.match(p, new RegExp(FIXTURE.expires_at));
  // The load-bearing pair.
  assert.match(p, /Make no factual claim about the product beyond these/);
  assert.match(p, /MUST NOT SAY, under any phrasing or synonym/);
  assert.match(p, /This is absolute/);

  // A brief with NO approved claims is the stricter case, and must not read as
  // the permissive one. "No claims approved" means say nothing factual — the
  // opposite of "no restrictions listed".
  const noClaims = preflight.briefPreamble({ ...FIXTURE, approved_claim_ids: [] }, "seo");
  assert.match(noClaims, /No claims have been approved\. Make no factual claim about the product at all\./);

  // No prohibitions is genuinely no line, rather than an empty one that reads
  // as a list the model should try to fill in.
  const noProhibitions = preflight.briefPreamble({ ...FIXTURE, prohibited_claims: [] }, "seo");
  assert.doesNotMatch(noProhibitions, /MUST NOT SAY/);
});

test("an agent picks up the brief in force, or silently runs on baseline", async () => {
  briefStore.__resetBriefs();
  stop.__resetEmergencyStop();
  const now = "2026-11-10T12:00:00Z";
  const inWindow = "2026-11-11T10:00:00Z";
  const brief = { ...FIXTURE, brief_id: "gb_agent", market: "CA", locale: "en-CA", allowed_channels: ["seo"] };

  // BEFORE ANY BRIEF EXISTS: null, and nothing said about it.
  assert.equal(await preflight.briefFor({ agentId: "content-factory", brandId: "b_agent", nowISO: inWindow }), null);

  const issued = await briefStore.issueBrief({ brandId: "b_agent", brief, gate: { opportunity: 90, confidence: 90 }, issuedBy: "t", nowISO: now });
  assert.equal(issued.ok, true);

  // ISSUED BUT NOT APPROVED IS STILL BASELINE. Nothing unapproved may direct an
  // agent, and the agent is told nothing at all rather than told to wait.
  assert.equal(await preflight.briefFor({ agentId: "content-factory", brandId: "b_agent", nowISO: inWindow }), null);

  await approvals.transition({ id: issued.stored.approvalId, action: "submit", actor: "t", nowISO: now });
  await approvals.transition({ id: issued.stored.approvalId, action: "approve", actor: "t", nowISO: now });

  const got = await preflight.briefFor({ agentId: "content-factory", brandId: "b_agent", nowISO: inWindow });
  assert.ok(got, "an approved brief inside its window must be picked up");
  assert.equal(got.channel, "seo");
  assert.equal(got.brief.brief_id, "gb_agent");
  assert.match(got.preamble, /APPROVED GROWTH BRIEF IS IN FORCE/);

  // AN AGENT THIS BRIEF'S CHANNEL DOES NOT COVER gets nothing. `caption-engine`
  // is organic_social and the brief allows only seo.
  assert.equal(await preflight.briefFor({ agentId: "caption-engine", brandId: "b_agent", nowISO: inWindow }), null);

  // AN UNMAPPED AGENT RESOLVES NOTHING, deliberately: applying publication
  // constraints to an internal strategy document would have an agent refuse to
  // mention a product because a brief for a different surface said not to.
  assert.equal(await preflight.briefFor({ agentId: "business-diagnosis", brandId: "b_agent", nowISO: inWindow }), null);
  assert.equal(preflight.AGENT_CHANNEL["business-diagnosis"], undefined);

  // EXPIRED IS BASELINE.
  assert.equal(await preflight.briefFor({ agentId: "content-factory", brandId: "b_agent", nowISO: "2027-01-01T00:00:00Z" }), null);
  // ANOTHER TENANT'S BRIEF IS NOT THIS BRAND'S.
  assert.equal(await preflight.briefFor({ agentId: "content-factory", brandId: "someone_else", nowISO: inWindow }), null);
  // A MARKET MISMATCH IS BASELINE, not a brief applied to the wrong country.
  assert.equal(await preflight.briefFor({ agentId: "content-factory", brandId: "b_agent", nowISO: inWindow, market: "GB" }), null);
  // AND A FROZEN PUBLISH LANE SILENCES IT.
  await stop.engage({ scope: "b_agent", lanes: ["publish"], reason: "incident", engagedBy: "ops", nowISO: now });
  assert.equal(await preflight.briefFor({ agentId: "content-factory", brandId: "b_agent", nowISO: inWindow }), null);
  await stop.release({ scope: "b_agent", releasedBy: "ops", note: "incident closed, publishing resumed", nowISO: now });
  assert.ok(await preflight.briefFor({ agentId: "content-factory", brandId: "b_agent", nowISO: inWindow }));
});

test("the pre-flight NEVER throws — a missing brief is not a failed agent run", async () => {
  // The caller is a pre-flight step inside a run the customer has already been
  // charged for. An exception escaping here would turn "there is no brief
  // today" into a failed call, which is the opposite of §14.5.
  for (const bad of [
    { agentId: "content-factory", brandId: "", nowISO: "2026-11-11T10:00:00Z" },
    { agentId: "", brandId: "b", nowISO: "2026-11-11T10:00:00Z" },
    { agentId: "content-factory", brandId: "b", nowISO: "not a date" },
    { agentId: "content-factory", brandId: "   ", nowISO: "" },
  ]) {
    assert.equal(await preflight.briefFor(bad), null, `${JSON.stringify(bad)} must be silent, not fatal`);
  }
});

test("NOTHING OF THIS IS DRAWN ON A SCREEN (owner directive)", () => {
  // The machinery works invisibly. This is the guard that keeps it that way:
  // the board carries the activation fields as DATA and must not render them,
  // and no component may exist to display briefs.
  const boardSrc = readFileSync(new URL("../src/components/OpportunityBoard.tsx", import.meta.url), "utf8");
  // The type still declares them — carrying a value is not showing it.
  assert.match(boardSrc, /confidence\?: number; band\?: string/);
  // But nothing renders them. JSX interpolation of any of them is the thing
  // being forbidden, so that is what is searched for.
  for (const field of ["confidence", "band", "vetoes", "briefId"]) {
    assert.doesNotMatch(boardSrc, new RegExp(`\\{\\s*(Math\\.round\\()?i\\.${field}`), `the board renders i.${field} — this machinery is meant to be invisible`);
  }
  assert.equal(existsSync(new URL("../src/components/GrowthBriefs.tsx", import.meta.url)), false, "the brief panel was withdrawn on explicit owner instruction and must not come back without one");
  const discover = readFileSync(new URL("../src/app/dashboard/discover/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(discover, /GrowthBriefs/);
});

test("ONLY A RESOLUTION THAT AUTHORISES WORK IS PICKED UP", () => {
  // This check used to be inline, and a mutation sweep proved it was being
  // kept honest by an exception rather than by the code: replacing `ok` with
  // `true` built a preamble from an undefined brief, threw, and the catch
  // turned it back into the same null. Pure and driven, it is load-bearing.
  const A = { ...FIXTURE, brief_id: "gb_a" };
  const B = { ...FIXTURE, brief_id: "gb_b" };

  // A refusal is skipped even when it is first.
  assert.equal(firstOf([{ ok: false }, { ok: true, brief: B }]), B);
  // The FIRST authorising one wins, not the last.
  assert.equal(firstOf([{ ok: true, brief: A }, { ok: true, brief: B }]), A);
  // Nothing authorising, nothing returned.
  assert.equal(firstOf([{ ok: false }, { ok: false }]), null);
  assert.equal(firstOf([]), null);
  assert.equal(firstOf(null), null);

  // A RESULT CARRYING ONE WITHOUT THE OTHER IS NOT ACTED ON. `ok` with no
  // brief is the shape the mutant produced; a brief with ok:false is a refusal
  // that happens to have a payload. Neither authorises anything.
  assert.equal(firstOf([{ ok: true }]), null, "ok with no brief must not be picked up");
  assert.equal(firstOf([{ ok: false, brief: A }]), null, "a refused result must not be picked up for carrying a brief");
  // Truthiness is not the test: `ok` must be the boolean true.
  assert.equal(firstOf([{ ok: 1, brief: A }]), null);
  assert.equal(firstOf([{ ok: "yes", brief: A }]), null);
  // And a hole in the list is survived rather than thrown on.
  assert.equal(firstOf([null, undefined, { ok: true, brief: A }]), A);
});

function firstOf(xs) { return preflight.firstInForce(xs); }
