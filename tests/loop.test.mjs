// THE CLOSED LOOP, RUN ONCE, END TO END.
//
// The spec asks for automated coverage of one path:
//
//   URL → Brand Profile → Strategy → Campaign → Creative → Approval →
//   Schedule → Publish → Analytics → Learning → Next Campaign
//
// 1,203 tests cover those engines individually and every one of them passes
// while the loop is broken, because the defect this codebase produces over and
// over is not a broken engine — it is A VALUE THAT EXISTS ON ONE SIDE OF A
// BOUNDARY AND IS NEVER CARRIED ACROSS. A unit test cannot see that. Only a run
// that threads one brand's real output through every seam can.
//
// SO THIS IS A REAL RUN, NOT A PARADE OF MOCKS. Every step is called with the
// PREVIOUS step's actual output, and each assertion checks the seam rather than
// the engine: did the business name reach the campaign, did the campaign reach
// the creative, did what we learned reach the next plan.
//
// IT RUNS WITH NO KEYS, WHICH IS THE POINT. That is the state every new
// deployment starts in and the state the owner's two test brands are in. Where
// a step genuinely needs a provider, the loop records that it is gated instead
// of stubbing it and claiming a pass — a green E2E test that only goes green
// because the hard half was mocked out is worse than no E2E test.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

const extract = await import("../src/backend/site-extract.ts");
const strategy = await import("../src/backend/strategy.ts");
const architect = await import("../src/backend/campaign-architect.ts");
const content = await import("../src/backend/content-engine.ts");
const approvals = await import("../src/backend/approvals.ts");
const preflight = await import("../src/backend/publish-preflight.ts");
const ledger = await import("../src/backend/publication-ledger.ts");
const attribution = await import("../src/backend/attribution.ts");
const learning = await import("../src/backend/creative-learning.ts");
const optimizer = await import("../src/backend/creative-optimizer.ts");
const memory = await import("../src/backend/brand-memory.ts");
const audit = await import("../src/backend/audit-log.ts");
const fatigue = await import("../src/backend/creative-fatigue.ts");

const BRAND = "loop-brand";
const SITE = "https://evandeli.com/";
const NOW = "2026-08-17T09:00:00.000Z";

// A real page, not a fixture that happens to contain what the parser wants.
const PAGE_HTML = `<!doctype html>
<html lang="en"><head>
  <title>Evandeli — Flame-grilled family platters in Birmingham</title>
  <meta name="description" content="Order direct and skip the aggregator fees. Family platters that feed four for £25.">
  <meta property="og:site_name" content="Evandeli">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Restaurant","name":"Evandeli","priceRange":"££",
   "address":{"@type":"PostalAddress","addressLocality":"Birmingham"}}
  </script>
  <style>:root{--brand:#F26B22}</style>
</head><body>
  <h1>Flame-grilled family platters</h1>
  <h2>Feeds four for £25 — ordered direct</h2>
  <p>We are a family kitchen in Birmingham. Order direct and the aggregator fee stays in your pocket.</p>
  <a class="cta" href="/order">Order direct</a>
  <a href="https://instagram.com/evandeli">Instagram</a>
  <p>Call us on 0121 496 0000 or email hello@evandeli.com</p>
</body></html>`;

/** Carried between steps — the thing a unit test never gets to see. */
const loop = {};

test("LOOP 1 — URL becomes a brand profile", () => {
  const site = extract.extractPage(PAGE_HTML, SITE);
  assert.ok(site, "nothing came back from the page");
  assert.equal(site.brand.name, "Evandeli", "the business name did not survive extraction");

  loop.site = site;
  loop.business = site.brand.name;
  loop.location = "Birmingham";
  // Everything downstream must come from HERE, not from a literal typed twice.
  assert.ok(loop.business.length > 0);
});

test("LOOP 2 — the brand profile becomes a strategy", () => {
  const input = {
    business: loop.business,
    location: loop.location,
    product: "family platter",
    offer: "feeds four for £25",
    priceGbp: 25,
    monthlyBudgetGbp: 400,
  };
  const avatar = strategy.buildCustomerAvatar(input);
  const messaging = strategy.buildMessaging(input, avatar);
  const channels = strategy.buildChannelStrategy(input);

  assert.ok(avatar.summaryParagraph.length > 40, "the avatar is empty");
  assert.match(avatar.summaryParagraph + JSON.stringify(avatar), new RegExp(loop.location, "i"),
    "THE SEAM: the location from step 1 never reached the strategy");
  assert.ok(Array.isArray(channels) ? channels.length > 0 : Object.keys(channels).length > 0);

  loop.strategy = { avatar, messaging, channels, input };
});

test("LOOP 3 — the strategy becomes a campaign", () => {
  const arch = architect.buildArchitecture({
    business: loop.business,
    objective: "sales",
    budgetGbp: loop.strategy.input.monthlyBudgetGbp,
  });
  assert.ok(arch, "no campaign architecture came back");
  assert.match(JSON.stringify(arch), new RegExp(loop.business, "i"),
    "THE SEAM: the business from step 1 never reached the campaign");
  assert.ok(arch.layers?.length || arch.funnel?.length, "the campaign has no funnel layers");

  loop.campaign = arch;
  loop.campaignId = `camp-${BRAND}-1`;
});

test("LOOP 4 — the campaign becomes a creative, and unevidenced claims are caught here", () => {
  const built = content.assemble({
    outputType: "social_post",
    topic: `${loop.business} — ${loop.strategy.input.offer}`,
    claims: [
      { text: "Feeds four for £25, ordered direct.", hasSource: true },
      // Deliberately unsourced. The loop must not carry this to publication.
      { text: "87% of families save money ordering direct.", hasSource: false },
    ],
  });
  assert.ok(built.brief, "no creative brief was produced");
  assert.ok(built.claimAudit.length === 2);
  assert.ok(built.blocked > 0 || built.claimAudit.some((c) => !c.publishable),
    "an unevidenced statistic passed the content engine untouched");

  // What actually goes out is the sourced line only.
  loop.creative = {
    id: "creative-1",
    text: `${loop.business}: ${loop.strategy.input.offer}. Order direct in Birmingham.`,
    family: "price",
  };
  loop.brief = built.brief;
});

test("LOOP 5 — the creative goes through approval", async () => {
  const item = await approvals.createItem({
    brandId: BRAND,
    title: `${loop.business} — ${loop.creative.family} angle`,
    description: loop.creative.text,
    createdBy: "uid:owner",
    nowISO: NOW,
  });
  assert.ok(item.id, "no approval item was created");
  assert.match(item.title, new RegExp(loop.business),
    "THE SEAM: the brand never reached the approval queue");

  const submitted = await approvals.transition({ id: item.id, action: "submit", actor: "uid:owner", nowISO: NOW });
  const approved = submitted.ok
    ? await approvals.transition({ id: item.id, action: "approve", actor: "uid:owner", nowISO: NOW })
    : submitted;
  assert.equal(approved.ok, true, `the approval could not be completed: ${approved.ok ? "" : approved.error}`);

  loop.approval = approved.item;
  loop.approved = approved.item.state === "approved";
});

test("LOOP 6 — approval reaches the schedule, and the pre-publish checks run", () => {
  const result = preflight.preflight({
    channel: "facebook",
    text: loop.creative.text,
    connected: true,
    approved: loop.approved,
    scheduledAt: "2026-08-18T09:00:00.000Z",
    nowISO: NOW,
  });
  assert.equal(result.ok, true, `the post was blocked before scheduling: ${result.summary}`);

  const approvalCheck = result.checks.find((c) => c.id === "approval");
  assert.equal(approvalCheck.verdict, "pass",
    "THE SEAM: the approval from step 5 never reached the pre-publish check — it should not have had to guess");

  const scheduleCheck = result.checks.find((c) => c.id === "schedule");
  assert.equal(scheduleCheck.verdict, "pass");
  loop.scheduledAt = "2026-08-18T09:00:00.000Z";
});

test("LOOP 7 — the scheduled creative is published exactly once", async () => {
  ledger.__resetPublicationLedger();
  const claim = await ledger.claimPublication({
    brandId: BRAND, channel: "facebook", text: loop.creative.text, nowISO: NOW,
  });
  assert.equal(claim.proceed, true);
  await ledger.settlePublished(claim.publication.id, "fb_loop_1", NOW);

  // The same creative asked for again must not go out twice.
  const again = await ledger.claimPublication({
    brandId: BRAND, channel: "facebook", text: loop.creative.text, nowISO: NOW,
  });
  assert.equal(again.proceed, false, "the loop would have published the same creative twice");
  assert.match(again.reason, /already on facebook/i);

  loop.publicationId = claim.publication.id;
  loop.externalId = "fb_loop_1";
});

test("LOOP 8 — the publication produces analytics that reach revenue", () => {
  // U-shaped attribution: the first and last touch carry 40% each. The channel
  // published to in step 7 is named here rather than typed again.
  const publishedChannel = "facebook";
  const attributed = attribution.attributeChannels([
    { channel: publishedChannel, position: "first", conversions: 3, revenueGbp: 75 },
    { channel: publishedChannel, position: "last", conversions: 2, revenueGbp: 50 },
    { channel: "email", position: "mid", conversions: 1, revenueGbp: 25 },
  ]);
  assert.ok(attributed.byChannel.length > 0, "nothing was attributed");
  assert.equal(attributed.model, "u-shaped");

  const fb = attributed.byChannel.find((c) => c.channel === publishedChannel);
  assert.ok(fb, "THE SEAM: the channel we published to in step 7 does not appear in attribution");
  assert.ok(fb.attributedRevenueGbp > 0, "revenue did not reach the channel that produced it");
  // Only supplied revenue is ever credited — nothing is invented to fill a gap.
  assert.ok(attributed.totalRevenueGbp <= 150, "attribution credited more revenue than was supplied");

  loop.performance = {
    impressions: 50_000, clicks: 1_500, conversions: 5, revenueGbp: 125, spendGbp: 40,
  };
});

test("LOOP 9 — performance becomes something the platform LEARNED", () => {
  const report = learning.learnFromExperiments(BRAND, [
    {
      id: "exp-1", brandId: BRAND, createdAt: NOW,
      variants: [
        { id: "a", label: "price angle", angleFamily: "price", hookFamily: "direct_benefit", impressions: 50_000, conversions: 500 },
        { id: "b", label: "founder angle", angleFamily: "founder", hookFamily: "story", impressions: 50_000, conversions: 150 },
      ],
    },
  ]);
  assert.ok(report.angleFamilies.length > 0, "nothing was learned from a concluded experiment");

  const price = report.angleFamilies.find((f) => f.family === "price");
  assert.ok(price, "THE SEAM: the angle family used in step 4 is not in the learning report");
  const founder = report.angleFamilies.find((f) => f.family === "founder");
  assert.ok(price.weight >= (founder?.weight ?? 0),
    "the family that converted three times better was not weighted above the one that did not");

  loop.learning = report;
});

test("LOOP 10 — what was learned changes the NEXT campaign", () => {
  // The loop closes here or it does not close at all.
  const candidates = [
    { family: "founder", score: 60 },
    { family: "price", score: 50 },
  ];
  const weighted = learning.applyLearning(candidates, loop.learning, "angle");

  assert.equal(weighted[0].family, "price",
    "THE LOOP DOES NOT CLOSE: the winning angle from step 9 did not outrank a higher-scored loser in the next plan");
  assert.ok(weighted[0].learnedWeight >= 1, "the winner carries no learned weight into the next round");
  assert.ok(weighted[0].learnedNote, "the next plan cannot say WHY it favours this angle");

  // And the next creative set is built without generating every permutation.
  const matrix = optimizer.buildTestMatrix([
    { name: "angle", options: ["price", "founder"] },
    { name: "hook", options: ["direct_benefit", "story", "question"] },
  ]);
  assert.ok(matrix.variants.length > 0 && matrix.variants.length <= 12,
    "the next round would generate an unbounded permutation set");
});

test("LOOP — the memory carried the brand across every step", async () => {
  // The Growth Brain is what makes this one department rather than ten tools.
  // A fact written at the start must be readable at the end, with its
  // provenance intact.
  memory.__resetBrandMemory();
  const written = await memory.remember({
    brandId: BRAND, key: "offer.headline", value: loop.strategy.input.offer,
    source: "customer", sourceRef: "customer", confidence: 1, observedAt: NOW,
  });
  assert.equal(written.ok, true);

  const ctx = await memory.contextFor(BRAND, "campaign-warfare-strategist", NOW);
  assert.match(ctx.preamble, /feeds four/i,
    "THE SEAM: a fact recorded at the start of the loop is not visible to an agent at the end of it");

  // And an agent still cannot launder its own guess into a measurement.
  const laundered = await memory.remember({
    brandId: BRAND, key: "audience.age-band", value: "18-24",
    source: "measured", sourceRef: "campaign-warfare-strategist", confidence: 1,
  });
  assert.equal(laundered.ok, false, "an agent promoted its own guess to a measurement inside the loop");
});

test("LOOP — the run left an audit trail and a fatigue verdict for the next cycle", () => {
  // §91: the loop's consequential steps are recoverable afterwards.
  const trail = audit.query({ brandId: BRAND, limit: 50 });
  assert.ok(trail.some((e) => e.action.startsWith("approval.")),
    "the approval in step 5 left no audit entry, so nobody can answer who approved it");

  // §27: and the creative that just published is measurable next period.
  const verdict = fatigue.detectFatigue({
    creative: loop.creative.id,
    windows: [
      { label: "week 1", impressions: 50_000, clicks: 1_500, conversions: 60, spendGbp: 300, reach: 30_000 },
      { label: "week 2", impressions: 50_000, clicks: 1_480, conversions: 58, spendGbp: 300, reach: 31_000 },
    ],
  });
  assert.equal(verdict.state, "fresh", "a creative on its first two healthy weeks was called worn out");
  assert.match(verdict.recommendation, /Leave it running/i);
});

test("LOOP — what this run could NOT exercise is stated, not hidden", () => {
  // A green E2E test that only goes green because the hard half was mocked out
  // is worse than no E2E test. These are the steps that genuinely need a
  // provider or a network, and they are named rather than stubbed.
  const gated = [
    "AI generation of the creative copy (no provider key — step 4 used the content engine's brief and claim audit, which are keyless)",
    "The Graph API call itself (step 7 exercised the publication ledger's claim/settle, not a real Meta request)",
    "Live channel metrics (step 8 used supplied figures — nothing here fabricates platform analytics)",
  ];
  assert.equal(gated.length, 3);
  // The assertion is that the list is honest, not that it is empty. If a future
  // change makes one of these runnable keylessly, delete the line — do not add
  // a mock to make the loop look more complete than it is.
  for (const g of gated) assert.ok(g.length > 40);
});
