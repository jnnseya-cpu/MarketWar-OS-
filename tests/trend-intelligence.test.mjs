import test from "node:test";
import assert from "node:assert/strict";

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
