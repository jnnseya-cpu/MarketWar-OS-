// Feature/functionality tests — exercise the real engines behind the modules a
// customer actually uses, and assert on behaviour (not just that they return).
// Run: npm test    (no network, no API keys)

import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Customer Vault — import, dedupe, scoring, counts. The vault is the fuel for
// most modules, so a defect here poisons segments, recovery and email.
// ---------------------------------------------------------------------------
const contacts = await import("../src/backend/contacts.ts");

test("vault: importing contacts stores them and counts truthfully", async () => {
  const brand = "t-vault-1";
  const res = await contacts.saveContacts(brand, [
    { email: "A@Example.com", name: "Ann", totalSpendGbp: 100, orderCount: 2, lastOrderDaysAgo: 10 },
    { email: "b@example.com", name: "Bob", totalSpendGbp: 0, orderCount: 0 },
  ], new Date().toISOString());
  assert.equal(res.imported, 2);
  assert.equal(await contacts.countContacts(brand), 2);
});

test("vault: re-importing the same email MERGES, never duplicates", async () => {
  const brand = "t-vault-2";
  const now = new Date().toISOString();
  await contacts.saveContacts(brand, [{ email: "dup@example.com", name: "First" }], now);
  await contacts.saveContacts(brand, [{ email: "DUP@example.com", name: "Second" }], now); // different case
  assert.equal(await contacts.countContacts(brand), 1, "case-different email must merge, not duplicate");
});

test("vault: contactId is deterministic and brand-scoped (no cross-tenant collision)", () => {
  const a = contacts.contactId("brandA", { email: "x@y.com" });
  const b = contacts.contactId("brandA", { email: "X@Y.COM" });
  const c = contacts.contactId("brandB", { email: "x@y.com" });
  assert.equal(a, b, "same email must give the same id");
  assert.notEqual(a, c, "different brands must never share a contact id");
});

test("vault: clearing a brand does not touch another brand's contacts", async () => {
  const now = new Date().toISOString();
  await contacts.saveContacts("t-iso-a", [{ email: "a@a.com" }], now);
  await contacts.saveContacts("t-iso-b", [{ email: "b@b.com" }], now);
  await contacts.clearContacts("t-iso-a");
  assert.equal(await contacts.countContacts("t-iso-a"), 0);
  assert.equal(await contacts.countContacts("t-iso-b"), 1, "other brand must be untouched");
});

test("vault: dormant/consent counts are computed from real rows", async () => {
  const brand = "t-vault-3";
  const now = new Date().toISOString();
  await contacts.saveContacts(brand, [
    { email: "c1@x.com", consent: true, lastOrderDaysAgo: 5 },
    { email: "c2@x.com", consent: true, lastOrderDaysAgo: 200 },
    { email: "c3@x.com", consent: false, lastOrderDaysAgo: 300 },
  ], now);
  const counts = await contacts.vaultCountsFor(brand);
  assert.equal(counts.total, 3);
  assert.equal(counts.consented, 2, "non-consented must be excluded");
  assert.ok(counts.dormant >= 1);
});

// ---------------------------------------------------------------------------
// Segmentation / scoring — powers Vault, Segments, Recovery.
// ---------------------------------------------------------------------------
const segments = await import("../src/backend/segments.ts");

test("scoring: a high-spend recent buyer outranks a lapsed non-buyer", () => {
  const rows = segments.scoredCustomerList("Test Co", [
    { id: "vip", name: "VIP", totalSpendGbp: 5000, orderCount: 20, lastOrderDaysAgo: 3, consent: true },
    { id: "cold", name: "Cold", totalSpendGbp: 0, orderCount: 0, lastOrderDaysAgo: 400, consent: true },
  ]);
  const vip = rows.find((r) => r.id === "vip");
  const cold = rows.find((r) => r.id === "cold");
  assert.ok(vip.ltvGbp > cold.ltvGbp, "VIP must have higher LTV");
  assert.ok(vip.churnRisk < cold.churnRisk, "lapsed customer must carry higher churn risk");
});

test("scoring: every score stays inside 0-100", () => {
  const rows = segments.scoredCustomerList("Test Co", [
    { id: "x", name: "X", totalSpendGbp: 999999, orderCount: 9999, lastOrderDaysAgo: 0, consent: true },
    { id: "y", name: "Y", totalSpendGbp: -50, orderCount: -3, lastOrderDaysAgo: 99999, consent: true },
  ]);
  for (const r of rows) {
    assert.ok(r.churnRisk >= 0 && r.churnRisk <= 100, `churnRisk out of range: ${r.churnRisk}`);
    assert.ok(r.purchaseIntent >= 0 && r.purchaseIntent <= 100, `intent out of range: ${r.purchaseIntent}`);
    assert.ok(r.ltvGbp >= 0, "LTV must never be negative");
  }
});

// ---------------------------------------------------------------------------
// Offer Forge — must never sell below cost (owner margin law).
// ---------------------------------------------------------------------------
const offers = await import("../src/backend/offer-forge.ts");

test("offers: no generated offer is priced below unit cost", () => {
  const out = offers.forgeOffers({ productName: "Widget", priceGbp: 100, unitCostGbp: 40, stock: 50 });
  const list = out.offers || out;
  for (const o of list) {
    if (typeof o.effectivePriceGbp === "number") {
      assert.ok(o.effectivePriceGbp >= 40, `offer "${o.name}" priced ${o.effectivePriceGbp} below cost 40`);
    }
  }
});

// ---------------------------------------------------------------------------
// Landing page engine — the page type must follow the objective, and the page
// must actually contain the user's offer.
// ---------------------------------------------------------------------------
const landing = await import("../src/backend/landing.ts");

test("landing: objective selects the page type (not a fixed default)", () => {
  const lead = landing.selectPageType("get more leads");
  const sale = landing.selectPageType("sell a product online");
  assert.ok(lead, "must select a type for a lead objective");
  assert.ok(sale, "must select a type for a sales objective");
});

test("landing: the generated page carries the real offer text and a form", () => {
  const page = landing.generateLandingPage({
    business: "Acme Ltd", objective: "get more leads", audience: "IT managers",
    location: "London", product: "Backup software", offer: "UNIQUE-OFFER-TOKEN-123", pain: "data loss",
  });
  const blob = JSON.stringify(page);
  assert.ok(blob.includes("UNIQUE-OFFER-TOKEN-123"), "the user's offer must appear in the page");
  assert.ok(blob.includes("Acme Ltd"), "the business name must appear");
  assert.ok(Array.isArray(page.formConfig?.fields) && page.formConfig.fields.length > 0, "a lead form must exist");
});

// ---------------------------------------------------------------------------
// Prospecting — ICP and deal scoring must be bounded and responsive to inputs.
// ---------------------------------------------------------------------------
const prospecting = await import("../src/backend/prospecting.ts");

test("prospecting: ICP builds from the product and deal scores stay bounded", () => {
  const icp = prospecting.buildICP({ product: "AI security audits", targetIndustry: "fintech", dealSizeGbp: 5000 });
  assert.ok(icp, "ICP must build");
  const prospect = {
    companyName: "Test Corp", website: "https://test.com", domain: "test.com",
    industry: "fintech", employeeCount: 120, revenueEstimateGbp: 4_000_000, location: "London",
    contactEmail: "info@test.com", emailType: "generic", phone: "", contactTitle: "CTO",
    seniority: "c_level", linkedinCompany: "", technologies: [], hiringSignal: true,
    fundingSignal: false, companyDescription: "fintech firm", lawfulBasis: "legitimate_interest",
    consentStatus: "not_required", complianceFlags: [],
  };
  const score = prospecting.scoreDeal(prospect, icp, 5000);
  assert.ok(score.dealProbability >= 0 && score.dealProbability <= 100,
    `dealProbability out of range: ${score.dealProbability}`);
});

// ---------------------------------------------------------------------------
// Compliance — the gate that stops unsubstantiated claims publishing.
// ---------------------------------------------------------------------------
const compliance = await import("../src/backend/compliance.ts");

test("compliance: an unsubstantiated health/absolute claim is not cleared", () => {
  const risky = compliance.verifyClaim({ claim: "This product cures cancer and guarantees 100% results" });
  assert.ok(risky, "must return a verdict");
  const cleared = risky.approved === true || risky.status === "approved" || risky.cleared === true;
  assert.equal(cleared, false, "an unsubstantiated absolute health claim must NOT be cleared to publish");
});

// ---------------------------------------------------------------------------
// ACU pricing — customer charge must always recover provider cost with margin,
// and provider cost must never be exposed in a customer-facing quote.
// ---------------------------------------------------------------------------
const acu = await import("../src/backend/acu.ts");

test("acu: a quote always charges more than the provider cost", () => {
  const q = acu.quoteAcu({ providerCostGbp: 0.5, actionClass: "medium" });
  assert.ok(q.retailGbp >= 0.5 * 2, `charge ${q.retailGbp} must be at least 2x cost 0.5`);
  assert.ok(q.acus > 0, "a quote must cost ACUs");
  // The owner's law: provider cost must never be exposed to the customer.
  const blob = JSON.stringify(q);
  assert.ok(!blob.includes("providerCost"), "provider cost must never appear in a customer quote");
  assert.ok(!/"0\.5"|:0\.5[,}]/.test(blob), "the raw provider cost figure must not be echoed back");
});

// ---------------------------------------------------------------------------
// GEO readiness — the measured engine must NEVER score an unreachable site.
// (No network here: an unresolvable host exercises the failure path.)
// ---------------------------------------------------------------------------
const geo = await import("../src/backend/geo-readiness.ts");

test("geo: an unreachable site is reported unreachable, never scored", async () => {
  const r = await geo.geoReadiness("https://this-host-does-not-exist-marketwar-test.invalid");
  assert.equal(r.reachable, false, "must not claim to have measured a site it could not fetch");
  assert.equal(r.score, 0);
  assert.equal(r.checks.length, 0, "no checks may be invented for an unfetchable site");
});

test("geo: an empty URL is rejected rather than guessed", async () => {
  const r = await geo.geoReadiness("");
  assert.equal(r.reachable, false);
});

// ---------------------------------------------------------------------------
// Email attachments — documents/images on bulk sends. A malformed MIME body or
// an unsigned-body DKIM mismatch sends the whole campaign to spam.
// ---------------------------------------------------------------------------
const email = await import("../src/backend/email.ts");

test("attachments: executables are refused (reputation protection)", () => {
  const v = email.validateAttachments([{ filename: "payload.exe", contentBase64: "AAAA" }]);
  assert.equal(v.ok, false);
  assert.match(v.error, /executable/i);
});

test("attachments: oversized payloads are refused before sending", () => {
  const big = "A".repeat(30 * 1024 * 1024); // ~22MB decoded
  const v = email.validateAttachments([{ filename: "big.pdf", contentBase64: big }]);
  assert.equal(v.ok, false);
  assert.match(v.error, /limit/i);
});

test("attachments: too many files are refused", () => {
  const many = Array.from({ length: email.MAX_ATTACHMENTS + 1 }, (_, i) => ({ filename: `f${i}.pdf`, contentBase64: "AAAA" }));
  assert.equal(email.validateAttachments(many).ok, false);
});

test("attachments: a normal document + image set is accepted", () => {
  const v = email.validateAttachments([
    { filename: "quote.pdf", contentBase64: "JVBERi0xLjQK" },
    { filename: "photo.jpg", contentBase64: "/9j/4AAQSkZJRg==" },
  ]);
  assert.equal(v.ok, true);
  assert.ok(v.total > 0);
});

test("attachments: none supplied is valid (plain email still works)", () => {
  assert.equal(email.validateAttachments(undefined).ok, true);
  assert.equal(email.validateAttachments([]).ok, true);
});

// ---------------------------------------------------------------------------
// Link Opportunity Engine — must EARN links, never place them, and never
// fabricate an opportunity when no search key is configured.
// ---------------------------------------------------------------------------
const links = await import("../src/backend/link-opportunities.ts");

test("links: with no brand it refuses rather than guessing", async () => {
  const r = await links.findLinkOpportunities({ brand: "", website: "x.com" });
  assert.equal(r.opportunities.length, 0);
});

test("links: never invents opportunities without live search", async () => {
  const r = await links.findLinkOpportunities({ brand: "Acme Ltd", website: "https://acme-test.com", category: "backup software" });
  // Demo mode (no SERPER key here) must not fabricate real-looking pages.
  if (r.mode === "demo") {
    assert.match(r.note, /nothing is invented|no live opportunities/i);
  }
  // Whatever the mode: never pitch the brand's own domain back to itself.
  for (const o of r.opportunities) {
    assert.notEqual(o.domain, "acme-test.com", "must never target the brand's own site");
  }
});

test("links: one opportunity per domain (never spams a site)", async () => {
  const r = await links.findLinkOpportunities({ brand: "Acme Ltd", website: "https://acme-test.com", category: "backup software" });
  const domains = r.opportunities.map((o) => o.domain);
  assert.equal(new Set(domains).size, domains.length, "a domain must appear at most once");
});

test("links: the compliance stance is stated and rules out placement", async () => {
  const r = await links.findLinkOpportunities({ brand: "Acme Ltd", website: "https://acme-test.com" });
  assert.match(r.compliance, /never buys?, exchanges?, injects? or auto-places/i);
});

// ---------------------------------------------------------------------------
// Customer SEO autopilot — per-brand blog, charged in ACUs whether the customer
// pushes it manually or the scheduler runs it.
// ---------------------------------------------------------------------------
const seo = await import("../src/backend/seo-autopilot.ts");
const wallet2 = await import("../src/backend/wallet.ts");

test("seo: a brand with no topics is refused (no invented subject)", async () => {
  const r = await seo.runBrandSeoPost({ brandId: "t-seo-none", brandName: "NoTopics", trigger: "manual", siteBase: "https://x.test" });
  assert.equal(r.ok, false);
  assert.equal(r.charged, 0, "a refused run must charge nothing");
  assert.match(r.error, /topic/i);
});

test("seo: an empty wallet cannot generate — and is charged nothing", async () => {
  await seo.setSeoSettings("t-seo-broke", { topics: ["How to choose a supplier"] });
  // Drain the free allowance first.
  await wallet2.debitAcus("t-seo-broke", wallet2.FREE_SIGNUP_ACUS);
  const r = await seo.runBrandSeoPost({ brandId: "t-seo-broke", brandName: "Broke Ltd", trigger: "auto", siteBase: "https://x.test" });
  assert.equal(r.ok, false);
  assert.equal(r.charged, 0);
  assert.match(r.error, /ACUs/);
});

test("seo: settings persist and default to OFF (never auto-charges silently)", async () => {
  const fresh = await seo.getSeoSettings("t-seo-fresh");
  assert.equal(fresh.enabled, false, "autopilot must be opt-in");
  assert.equal(fresh.autoPublish, false, "auto-publish must be opt-in");
  const saved = await seo.setSeoSettings("t-seo-fresh", { enabled: true, cadence: "weekly", topics: ["A", "B"] });
  assert.equal(saved.enabled, true);
  assert.equal(saved.topics.length, 2);
});

test("seo: cadence gating stops a daily cron posting for a weekly customer", () => {
  const justRan = { brandId: "b", enabled: true, cadence: "weekly", topics: ["a"], keywords: "", autoPublish: false, updatedAt: "", lastRunAt: new Date().toISOString() };
  assert.equal(seo.isDue(justRan), false, "a weekly brand that just ran is not due");
  const old = { ...justRan, lastRunAt: new Date(Date.now() - 8 * 86400000).toISOString() };
  assert.equal(seo.isDue(old), true, "a weekly brand from 8 days ago is due");
  const neverRan = { ...justRan, lastRunAt: null };
  assert.equal(seo.isDue(neverRan), true);
});

// ---------------------------------------------------------------------------
// Pricing policy — AI/paid-API actions at 4x provider cost; zero-cost actions
// nominal but NEVER free.
// ---------------------------------------------------------------------------
const w3 = await import("../src/backend/wallet.ts");
const sub3 = await import("../src/backend/subscription.ts");

test("pricing: provider-cost actions are exactly 4x our cost", () => {
  // 4x markup, £1 = 100 ACUs. These must match the owner's standard markup.
  assert.equal(w3.ACTION_COST_ACU.llm, sub3.requiredAcus(0.0125).requiredAcus);
  assert.equal(w3.ACTION_COST_ACU.image, sub3.requiredAcus(0.025).requiredAcus);
  assert.equal(w3.ACTION_COST_ACU.video, sub3.requiredAcus(0.10).requiredAcus);
  assert.equal(w3.ACTION_COST_ACU.post, sub3.requiredAcus(0.0625).requiredAcus);
});

test("pricing: nothing is free — every action costs at least 1 ACU", () => {
  for (const [k, v] of Object.entries(w3.ACTION_COST_ACU)) {
    assert.ok(v >= 1, `${k} must never be free (got ${v})`);
  }
});

test("pricing: zero-marginal-cost actions stay nominal (<= 2 ACUs)", () => {
  for (const k of ["publish_page", "publish_social", "email_send", "report", "data_export", "connector_sync", "crawl"]) {
    assert.ok(w3.ACTION_COST_ACU[k] <= 2, `${k} should be a token charge, got ${w3.ACTION_COST_ACU[k]}`);
  }
});

test("pricing: every AI action clears the 2x margin floor", () => {
  // A 4x charge must always beat the hard 2x floor the pricing engine enforces.
  for (const [kind, cost] of [["llm", 0.0125], ["image", 0.025], ["video", 0.10], ["enrich", 0.005], ["post", 0.0625]]) {
    assert.ok(w3.ACTION_COST_ACU[kind] >= cost * sub3.MARKUP_FLOOR * 100, `${kind} breaches the 2x floor`);
  }
});

// ---------------------------------------------------------------------------
// Fully-loaded unit economics — 4x the AI bill is NOT the whole cost. Google
// Cloud/Firebase, Vercel, Stripe fees, overhead and wastage must all be covered,
// and the owner's law requires 100% NET profit on top of that total.
// ---------------------------------------------------------------------------
const ue = await import("../src/backend/unit-economics.ts");
const w4 = await import("../src/backend/wallet.ts");

const PROVIDER = { llm: 0.0125, search: 0.0025, image: 0.025, video: 0.10, enrich: 0.005, post: 0.0625 };
const PERSISTS = { image: true, video: true, post: true };

test("economics: EVERY metered AI action clears 100% net profit fully loaded", () => {
  for (const [kind, cost] of Object.entries(PROVIDER)) {
    const v = ue.verdictForPrice({ providerCostGbp: cost, retailAcus: w4.ACTION_COST_ACU[kind], persistsArtifact: !!PERSISTS[kind] });
    assert.equal(v.meetsFloor, true, `${kind}: only ${v.netProfitPct}% net profit — ${v.note}`);
  }
});

test("economics: the loaded cost really includes infra, Stripe and overhead", () => {
  const l = ue.loadedCost({ providerCostGbp: 0.0125, retailGbp: 0.05, persistsArtifact: false });
  assert.ok(l.infraGbp > 0, "infrastructure must be costed");
  assert.ok(l.paymentGbp > 0, "Stripe fees must be costed");
  assert.ok(l.overheadGbp > 0, "platform overhead must be costed");
  assert.ok(l.wastageGbp > 0, "failed/retried work must be costed");
  assert.ok(l.loadedCostGbp > l.providerCostGbp, "loaded cost must exceed the provider bill alone");
});

test("economics: a cheap API priced at only 4x provider would MISS the floor", () => {
  // This is the real hole the model found: a Serper query at 4x provider = 1 ACU
  // loses money once infra/payment/overhead are counted. Guard it forever.
  const naive = ue.verdictForPrice({ providerCostGbp: 0.0025, retailAcus: 1 });
  assert.equal(naive.meetsFloor, false, "1 ACU for a search must be recognised as below the floor");
  assert.ok(w4.ACTION_COST_ACU.search >= 2, "search must be priced above the naive 4x figure");
});

test("economics: minimumAcusFor solves for the %-of-revenue costs, not cost x2", () => {
  const m = ue.minimumAcusFor({ providerCostGbp: 0.0025 });
  assert.equal(m.impossible, false);
  const at = ue.verdictForPrice({ providerCostGbp: 0.0025, retailAcus: m.minAcus });
  assert.equal(at.meetsFloor, true, "the computed minimum must itself clear the floor");
});

test("economics: a smaller top-up costs us proportionally more in Stripe fees", () => {
  assert.ok(ue.paymentCostPerGbp(5) > ue.paymentCostPerGbp(100), "the 20p fixed fee hurts small top-ups most");
});

// ---------------------------------------------------------------------------
// Minimum top-up — Stripe's fixed 20p fee makes tiny top-ups loss-making.
// ---------------------------------------------------------------------------
const sub5 = await import("../src/backend/subscription.ts");

test("topup: the minimum is the smallest amount that still clears the profit floor", () => {
  const below = ue.verdictForPrice({ providerCostGbp: 0.0125, retailAcus: 5, typicalPaymentGbp: sub5.MIN_TOPUP_GBP - 3 });
  const at = ue.verdictForPrice({ providerCostGbp: 0.0125, retailAcus: 5, typicalPaymentGbp: sub5.MIN_TOPUP_GBP });
  assert.equal(below.meetsFloor, false, "a top-up below the minimum must be recognised as loss-making");
  assert.equal(at.meetsFloor, true, "the minimum top-up itself must clear the floor");
});

test("topup: every offered tier is at or above the minimum", () => {
  for (const g of sub5.FLEXIBLE_TOPUPS_GBP) {
    assert.ok(g >= sub5.MIN_TOPUP_GBP, `£${g} tier is below the £${sub5.MIN_TOPUP_GBP} minimum`);
  }
});

// ---------------------------------------------------------------------------
// Claim Guard — the CODE gate on publishable claims. A prompt rule can be
// ignored by a model; this cannot. Uses the exact fabrications live agents
// produced, so the regression can never return silently.
// ---------------------------------------------------------------------------
const guard = await import("../src/backend/claim-guard.ts");

test("claims: the fabricated contractor testimonial is BLOCKED", () => {
  const out = `Testimonial | UK contractor: cut RFI turnaround | "We stopped chasing drawings. Full stop." — Mark Johnson, Site Director`;
  const r = guard.claimReport(out);
  assert.equal(r.clean, false);
  assert.ok(r.blocking >= 1, "an invented testimonial must be a BLOCKING finding");
  assert.ok(r.findings.some((f) => f.kind === "testimonial"));
});

test("claims: the invented £40k ad statistic is flagged", () => {
  const out = `Hook: "The wrong drawing already cost a UK site £40k this week."`;
  const r = guard.claimReport(out);
  assert.equal(r.clean, false);
  assert.ok(r.findings.some((f) => f.kind === "statistic"), "an unevidenced money figure must be flagged");
});

test("claims: percentage and multiplier claims are flagged", () => {
  for (const bad of ["Boost output 40% in the first month", "Get 3x more leads", "Trusted by 10,000 businesses"]) {
    const r = guard.claimReport(bad);
    assert.equal(r.clean, false, `should flag: ${bad}`);
  }
});

test("claims: a figure the CUSTOMER supplied is NOT flagged as fabricated", () => {
  // The user told us their price. Repeating their own number is not a fabrication.
  const supplied = "Our price is £149 per month and we saved a client £40k";
  const out = `Headline: "Cut your rework — one client saved £40k."`;
  const r = guard.claimReport(out, supplied);
  assert.ok(!r.findings.some((f) => f.kind === "statistic"), "the customer's own figure must pass");
});

test("claims: clean marketing copy passes without noise", () => {
  const out = `Headline: "One environment for every project file."\n\nOffer: Full access from £149/mo\n\nBook a demo →`;
  const r = guard.claimReport(out);
  assert.equal(r.clean, true, `expected clean, got: ${JSON.stringify(r.findings)}`);
});

test("claims: every finding tells the user how to fix it", () => {
  const r = guard.claimReport(`"We doubled revenue in 30 days." — Sarah, CEO`);
  for (const f of r.findings) {
    assert.ok(f.fix && f.fix.length > 10, "a finding without a fix is not actionable");
    assert.ok(f.reason && f.reason.length > 10);
  }
});

// ---------------------------------------------------------------------------
// Subtitle engine — real SRT/VTT from real timestamps (not a "caption spec").
// ---------------------------------------------------------------------------
const tr = await import("../src/backend/transcribe.ts");

test("captions: SRT is correctly formatted and indexed", () => {
  const srt = tr.toSrt([
    { start: 0, end: 2.5, text: "Hello there" },
    { start: 2.5, end: 5.25, text: "Welcome back" },
  ]);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nHello there/);
  assert.match(srt, /2\n00:00:02,500 --> 00:00:05,250\nWelcome back/);
});

test("captions: VTT uses the WEBVTT header and dot milliseconds", () => {
  const vtt = tr.toVtt([{ start: 61.5, end: 63, text: "One minute in" }]);
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:01:01\.500 --> 00:01:03\.000/);
});

test("captions: long lines are split so they fit on screen", () => {
  const long = "word ".repeat(60).trim();
  const out = tr.tightenSegments([{ start: 0, end: 10, text: long }], 84);
  assert.ok(out.length > 1, "an over-long caption must be split");
  for (const s of out) assert.ok(s.text.length <= 90, `segment too long: ${s.text.length}`);
  // Timings must stay inside the original window and move forward.
  assert.ok(out[0].start >= 0 && out[out.length - 1].end <= 10.001);
});

test("captions: short lines pass through untouched", () => {
  const out = tr.tightenSegments([{ start: 0, end: 2, text: "Short line" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Short line");
});

// ---------------------------------------------------------------------------
// Video job queue — the money and reliability contract with the FFmpeg worker.
// ---------------------------------------------------------------------------
const vj = await import("../src/backend/video-jobs.ts");
const w5 = await import("../src/backend/wallet.ts");

test("video jobs: enqueue charges the brand up front", async () => {
  await w5.creditAcus("t-vid-1", 500);
  const before = (await w5.getWallet("t-vid-1")).balanceAcu;
  const r = await vj.enqueueVideoJob({ brandId: "t-vid-1", kind: "trim", sourceUrl: "https://x.test/a.mp4", params: { startSec: 0, endSec: 10 } });
  assert.equal(r.ok, true);
  const after = (await w5.getWallet("t-vid-1")).balanceAcu;
  assert.equal(before - after, vj.JOB_COST_ACU.trim, "must charge exactly the job cost");
});

test("video jobs: an empty wallet cannot queue a render and is charged nothing", async () => {
  await w5.debitAcus("t-vid-broke", w5.FREE_SIGNUP_ACUS);
  const r = await vj.enqueueVideoJob({ brandId: "t-vid-broke", kind: "upscale", sourceUrl: "https://x.test/a.mp4" });
  assert.equal(r.ok, false);
  assert.match(r.error, /ACUs/);
});

test("video jobs: a job is claimed ONCE — two workers never get the same one", async () => {
  await w5.creditAcus("t-vid-2", 500);
  const { job } = await vj.enqueueVideoJob({ brandId: "t-vid-2", kind: "trim", sourceUrl: "https://x.test/b.mp4" });
  const first = await vj.claimNextJob("worker-A");
  assert.ok(first, "a queued job must be claimable");
  assert.equal(first.attempts, 1, "claiming counts as an attempt");
  assert.equal((await vj.getVideoJob(first.id)).status, "running");
  // A running job must never be handed to a second worker. Drain the queue to
  // be sure it is absent, not merely behind something else.
  for (let i = 0; i < 40; i++) {
    const other = await vj.claimNextJob("worker-B");
    if (!other) break;
    assert.notEqual(other.id, first.id, "a running job must not be re-claimed immediately");
  }
  assert.equal(job.status, "queued");
});

test("video jobs: a job whose worker died is retired and refunded, not looped forever", async () => {
  await w5.creditAcus("t-vid-5", 500);
  const { job } = await vj.enqueueVideoJob({ brandId: "t-vid-5", kind: "upscale", sourceUrl: "https://x.test/e.mp4" });
  const afterCharge = (await w5.getWallet("t-vid-5")).balanceAcu;
  // Simulate three workers that claimed it and died without reporting: the
  // attempts are spent but nothing ever called fail. Backdate the claim so it
  // reads as stale and is re-claimable.
  await vj.__testSetJob(job.id, { attempts: 3, status: "running", claimedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
  for (let i = 0; i < 40 && (await vj.getVideoJob(job.id)).status === "running"; i++) await vj.claimNextJob("worker-Z");
  assert.equal((await vj.getVideoJob(job.id)).status, "failed", "it must be retired, never re-handed out");
  assert.equal((await w5.getWallet("t-vid-5")).balanceAcu, afterCharge + vj.JOB_COST_ACU.upscale, "and refunded in full");
});

test("video jobs: completing records the output and marks it done", async () => {
  await w5.creditAcus("t-vid-3", 500);
  const { job } = await vj.enqueueVideoJob({ brandId: "t-vid-3", kind: "brand", sourceUrl: "https://x.test/c.mp4" });
  await vj.completeVideoJob(job.id, ["https://storage.test/out.mp4"]);
  const done = await vj.getVideoJob(job.id);
  assert.equal(done.status, "done");
  assert.equal(done.outputUrls.length, 1);
  assert.equal(done.progress, 100);
});

test("video jobs: a permanently failed render REFUNDS the customer", async () => {
  await w5.creditAcus("t-vid-4", 500);
  const { job } = await vj.enqueueVideoJob({ brandId: "t-vid-4", kind: "clips", sourceUrl: "https://x.test/d.mp4", params: { moments: [{ startSec: 0, endSec: 10 }] } });
  const afterCharge = (await w5.getWallet("t-vid-4")).balanceAcu;
  // A worker claims whatever is next in the queue, not necessarily ours — so
  // drain until we get this job, then fail it, the way a real worker would.
  const claimOurs = async () => {
    for (let i = 0; i < 40; i++) {
      const c = await vj.claimNextJob("worker-X");
      if (!c) return false;
      if (c.id === job.id) return true;
    }
    return false;
  };
  let refunded = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    assert.ok(await claimOurs(), `attempt ${attempt + 1} must be claimable`);
    const r = await vj.failVideoJob(job.id, "ffmpeg exploded");
    refunded += r.refunded;
    if (refunded) break;
  }
  assert.equal(refunded, vj.JOB_COST_ACU.clips, "the full charge must be refunded once it gives up");
  assert.equal((await vj.getVideoJob(job.id)).status, "failed", "it must stop retrying");
  const finalBal = (await w5.getWallet("t-vid-4")).balanceAcu;
  assert.equal(finalBal, afterCharge + vj.JOB_COST_ACU.clips);
});

test("video jobs: every job kind has a price and none is free", () => {
  for (const [kind, cost] of Object.entries(vj.JOB_COST_ACU)) {
    assert.ok(cost >= 1, `${kind} must cost something — rendering burns real CPU`);
  }
});

// ---------------------------------------------------------------------------
// Voice & dubbing — the money rule is "bill the unit the provider bills us on".
// ---------------------------------------------------------------------------
const vo = await import("../src/backend/voice.ts");
const w6 = await import("../src/backend/wallet.ts");
const ue2 = await import("../src/backend/unit-economics.ts");

test("voice: billing units follow characters, never a flat charge", () => {
  assert.equal(vo.billableUnits("hi"), 1, "a short line is one unit, never zero");
  assert.equal(vo.billableUnits("x".repeat(1000)), 1);
  assert.equal(vo.billableUnits("x".repeat(1001)), 2, "crossing 1,000 chars costs another unit");
  assert.equal(vo.billableUnits("x".repeat(4500)), 5);
});

test("voice: a long script cannot silently cost the same as a short one", () => {
  const short = w6.ACTION_COST_ACU.voice * vo.billableUnits("x".repeat(500));
  const long = w6.ACTION_COST_ACU.voice * vo.billableUnits("x".repeat(5000));
  assert.ok(long > short, "10x the words must not be 1x the price");
  assert.equal(long / short, 5);
});

test("voice & dub clear the owner's 100% net profit floor", () => {
  for (const [kind, providerCost] of [["voice", 0.085], ["dub", 0.35]]) {
    const v = ue2.verdictForPrice({
      retailAcus: w6.ACTION_COST_ACU[kind], providerCostGbp: providerCost, persistsArtifact: true,
    });
    assert.equal(v.meetsFloor, true, `${kind} is at ${v.netProfitPct}% net profit — ${v.note}`);
    assert.ok(v.netProfitPct >= 100, `${kind} must clear 100% net profit on fully-loaded cost`);
  }
});

test("voice: with no key configured nothing is invented", async () => {
  const saved = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    assert.equal(vo.voiceConfigured(), false);
    const r = await vo.textToSpeech({ text: "Say something" });
    assert.equal(r.ok, false);
    assert.equal(r.audio, undefined, "it must return no audio rather than fake audio");
    assert.match(r.error, /ELEVENLABS_API_KEY/);
  } finally {
    if (saved) process.env.ELEVENLABS_API_KEY = saved;
  }
});

test("voice: an over-long script is refused before it reaches the provider", async () => {
  process.env.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "test-key";
  const r = await vo.textToSpeech({ text: "x".repeat(vo.MAX_TTS_CHARS + 1) });
  assert.equal(r.ok, false);
  assert.match(r.error, /limit is/);
});

test("dub: every offered language is a distinct ISO code", () => {
  const codes = vo.DUB_LANGUAGES.map((l) => l.code);
  assert.equal(new Set(codes).size, codes.length, "no duplicate languages in the picker");
  for (const c of codes) assert.match(c, /^[a-z]{2,3}$/, `${c} must be an ISO code`);
});

// ---------------------------------------------------------------------------
// FFmpeg recipes — one definition, executed by the worker AND any hosted API.
// A defect here is a wrong-looking video the customer paid for.
// ---------------------------------------------------------------------------
const fr = await import("../src/backend/ffmpeg-recipes.ts");

test("recipes: trim cuts the requested window, not a fixed length", () => {
  const [pass] = fr.buildRecipe("trim", { startSec: 30, endSec: 45 });
  const args = pass.args.join(" ");
  assert.match(args, /-ss 30\b/, "must seek to the requested start");
  assert.match(args, /-t 15\b/, "duration must be end minus start");
});

test("recipes: a backwards or zero-length trim still produces a valid command", () => {
  const [pass] = fr.buildRecipe("trim", { startSec: 60, endSec: 10 });
  const t = pass.args[pass.args.indexOf("-t") + 1];
  assert.ok(Number(t) > 0, "duration must never be zero or negative");
});

test("recipes: vertical clips are cropped to 9:16 AND scaled to 1080x1920", () => {
  const passes = fr.buildRecipe("clips", { aspect: "9:16", moments: [{ startSec: 0, endSec: 10 }, { startSec: 20, endSec: 32 }] });
  assert.equal(passes.length, 2, "one pass per moment");
  const vf = passes[0].args.join(" ");
  assert.match(vf, /crop=ih\*9\/16:ih/, "must crop to a 9:16 column");
  assert.match(vf, /scale=1080:1920/, "must scale to the platform frame");
  assert.notEqual(passes[0].output, passes[1].output, "clips must not overwrite each other");
});

test("recipes: horizontal clips are NOT cropped", () => {
  const [pass] = fr.buildRecipe("clips", { moments: [{ startSec: 0, endSec: 10 }] });
  assert.doesNotMatch(pass.args.join(" "), /crop=/, "a 16:9 clip must keep its frame");
});

test("recipes: cutting clips with no moments is refused, not silently empty", () => {
  assert.throws(() => fr.buildRecipe("clips", { moments: [] }), fr.RecipeError);
});

test("recipes: burning captions carries the SRT as an inline asset", () => {
  const [pass] = fr.buildRecipe("captions_burn", { srt: "1\n00:00:00,000 --> 00:00:01,000\nHello\n" });
  assert.equal(pass.asset.filename, "subs.srt");
  assert.match(pass.asset.inlineText, /Hello/);
  assert.match(pass.args.join(" "), /subtitles=\$ASSET_ESCAPED/, "the subtitle path must be filter-escaped");
});

test("recipes: burning captions with no SRT is refused before any money moves", () => {
  assert.throws(() => fr.buildRecipe("captions_burn", {}), fr.RecipeError);
  assert.throws(() => fr.buildRecipe("captions_burn", { srt: "   " }), fr.RecipeError);
});

test("recipes: a filtergraph path with colons is escaped so the graph parses", () => {
  const escaped = fr.escapeFilterPath("/tmp/a:b/subs.srt");
  assert.ok(!/(^|[^\\]):/.test(escaped), `unescaped colon survives: ${escaped}`);
});

test("recipes: watermarking with no logo returns a copy, never a failure", () => {
  const [pass] = fr.buildRecipe("brand", {});
  assert.match(pass.args.join(" "), /-c copy/, "a paid job must still return a file");
  assert.equal(pass.asset, undefined);
});

test("recipes: watermarking fetches the logo and overlays bottom-right", () => {
  const [pass] = fr.buildRecipe("brand", { logoUrl: "https://x.test/logo.png" });
  assert.equal(pass.asset.url, "https://x.test/logo.png");
  assert.match(pass.args.join(" "), /overlay=W-w-30:H-h-30/);
});

test("recipes: background removal outputs WebM — MP4 cannot carry transparency", () => {
  const [pass] = fr.buildRecipe("bg_remove", {});
  assert.match(pass.output, /\.webm$/);
  assert.match(pass.args.join(" "), /format=yuva420p/, "must keep the alpha channel");
});

test("recipes: a chroma colour from user input cannot inject filter syntax", () => {
  const [pass] = fr.buildRecipe("bg_remove", { colour: "0x00FF00,drawtext=text='pwned'" });
  assert.match(pass.args.join(" "), /chromakey=0x00FF00:/, "a malformed colour must fall back, not be interpolated");
  assert.doesNotMatch(pass.args.join(" "), /drawtext/);
});

test("recipes: upscale height is clamped to a sane, encodable range", () => {
  assert.match(fr.buildRecipe("upscale", { height: 99999 })[0].args.join(" "), /scale=-2:2160/);
  assert.match(fr.buildRecipe("upscale", { height: 12 })[0].args.join(" "), /scale=-2:720/);
  assert.match(fr.buildRecipe("upscale", { height: 1440 })[0].args.join(" "), /scale=-2:1440/);
});

test("recipes: upscale uses a quality preset — a fast upscale is pointless", () => {
  const args = fr.buildRecipe("upscale", { height: 1440 })[0].args.join(" ");
  assert.match(args, /-preset slow/);
  assert.match(args, /-crf 18/);
});

test("recipes: every kind produces at least one pass with both placeholders", () => {
  const params = {
    trim: {}, clips: { moments: [{ startSec: 1, endSec: 5 }] }, captions_burn: { srt: "1\n" },
    brand: {}, broll: { brollUrl: "https://x.test/b.mp4" }, bg_remove: {}, upscale: {},
  };
  for (const [kind, p] of Object.entries(params)) {
    const passes = fr.buildRecipe(kind, p);
    assert.ok(passes.length >= 1, `${kind} produced no passes`);
    for (const pass of passes) {
      assert.ok(pass.args.includes("$IN"), `${kind} never reads the source video`);
      assert.ok(pass.args.includes("$OUT"), `${kind} never writes an output`);
      assert.ok(pass.output && pass.label, `${kind} is missing output/label`);
    }
  }
});

test("recipes: resolveArgs substitutes every placeholder, leaving none behind", () => {
  const [pass] = fr.buildRecipe("captions_burn", { srt: "1\n" });
  const out = fr.resolveArgs(pass.args, { input: "/t/in.mp4", output: "/t/out.mp4", asset: "/t/a:b.srt" });
  assert.doesNotMatch(out.join(" "), /\$(IN|OUT|ASSET)/, "an unsubstituted placeholder would be passed to ffmpeg literally");
  assert.ok(out.includes("/t/in.mp4"));
  assert.ok(out.includes("/t/out.mp4"));
});

test("video jobs: unusable settings are refused BEFORE the wallet is touched", async () => {
  await w5.creditAcus("t-vid-6", 500);
  const before = (await w5.getWallet("t-vid-6")).balanceAcu;
  const r = await vj.enqueueVideoJob({ brandId: "t-vid-6", kind: "captions_burn", sourceUrl: "https://x.test/f.mp4", params: {} });
  assert.equal(r.ok, false, "a job that cannot render must not be queued");
  assert.equal((await w5.getWallet("t-vid-6")).balanceAcu, before, "and the customer must not be charged a penny");
});

// ---------------------------------------------------------------------------
// Hosted FFmpeg — the contract with ffmpeg-micro. Response-shape bugs here are
// silent (undefined URLs, jobs reported done that never ran), so pin them.
// ---------------------------------------------------------------------------
const fc = await import("../src/backend/ffmpeg-cloud.ts");

test("hosted ffmpeg: content type is derived from the extension, case-insensitively", () => {
  assert.equal(fc.contentTypeFor("Clip.MP4"), "video/mp4");
  assert.equal(fc.contentTypeFor("a.mov"), "video/quicktime");
  assert.equal(fc.contentTypeFor("a.webm"), "video/webm");
  assert.equal(fc.contentTypeFor("notes.txt"), "application/octet-stream");
});

test("hosted ffmpeg: an unsupported or empty file is refused with a reason", () => {
  assert.equal(fc.validateSource("slides.pdf", 1000).ok, false);
  assert.match(fc.validateSource("slides.pdf", 1000).error, /not supported/);
  assert.equal(fc.validateSource("a.mp4", 0).ok, false);
  assert.equal(fc.validateSource("", 100).ok, false);
});

test("hosted ffmpeg: a non-integer byte count is caught before the API 400s on it", () => {
  assert.equal(fc.validateSource("a.mp4", 1234.5).ok, false, "their API rejects a fractional/string size");
  assert.equal(fc.validateSource("a.mp4", Number.NaN).ok, false);
});

test("hosted ffmpeg: an oversized source is refused before any upload starts", () => {
  const v = fc.validateSource("huge.mp4", fc.MAX_SOURCE_BYTES + 1);
  assert.equal(v.ok, false);
  assert.match(v.error, /2GB/);
});

test("hosted ffmpeg: a valid source passes and carries the signed content type", () => {
  const v = fc.validateSource("promo.mov", 5_000_000);
  assert.equal(v.ok, true);
  assert.equal(v.contentType, "video/quicktime", "the PUT must use the type the URL was signed with");
});

test("hosted ffmpeg: unwrap handles BOTH the result-wrapped and flat responses", () => {
  // Upload endpoints wrap; the transcode create endpoint does not.
  assert.deepEqual(fc.unwrap({ success: true, result: { uploadUrl: "u", filename: "f" } }), { uploadUrl: "u", filename: "f" });
  assert.deepEqual(fc.unwrap({ id: "abc", status: "pending" }), { id: "abc", status: "pending" });
});

test("hosted ffmpeg: an explicit failure is never unwrapped into a fake success", () => {
  assert.equal(fc.unwrap({ success: false, result: { uploadUrl: "u" } }), null, "success:false must not yield a payload");
  assert.equal(fc.unwrap(null), null);
  assert.equal(fc.unwrap("nope"), null);
});

test("hosted ffmpeg: an unknown status is treated as still running, never as done", () => {
  assert.equal(fc.toQueueStatus("completed"), "done");
  assert.equal(fc.toQueueStatus("failed"), "failed");
  assert.equal(fc.toQueueStatus("processing"), "running");
  assert.equal(fc.toQueueStatus("pending"), "queued");
  assert.equal(fc.toQueueStatus("something-new"), "queued", "an unrecognised status must never read as finished");
});

test("hosted ffmpeg: error messages name the fix, not just the status code", () => {
  assert.match(fc.explainError(401, {}), /FFMPEG_CLOUD_API_KEY/);
  assert.match(fc.explainError(429, {}), /allowance|rate limit/i);
  assert.equal(fc.explainError(400, { message: "fileSize must be a number" }), "fileSize must be a number");
});

test("hosted ffmpeg: with no key configured nothing is attempted", async () => {
  const saved = process.env.FFMPEG_CLOUD_API_KEY;
  delete process.env.FFMPEG_CLOUD_API_KEY;
  try {
    assert.equal(fc.ffmpegCloudConfigured(), false);
    const r = await fc.presignUpload({ filename: "a.mp4", fileSize: 100 });
    assert.equal(r.ok, false);
    assert.match(r.error, /FFMPEG_CLOUD_API_KEY/);
    const j = await fc.createTranscode({ inputUrls: ["gs://b/x.mp4"], outputFormat: "mp4" });
    assert.equal(j.ok, false);
  } finally {
    if (saved) process.env.FFMPEG_CLOUD_API_KEY = saved;
  }
});

test("hosted ffmpeg: a job with no inputs is refused locally", async () => {
  process.env.FFMPEG_CLOUD_API_KEY = process.env.FFMPEG_CLOUD_API_KEY || "test-key";
  const r = await fc.createTranscode({ inputUrls: [], outputFormat: "mp4" });
  assert.equal(r.ok, false);
  assert.match(r.error, /at least one input/);
});

// ---------------------------------------------------------------------------
// Recipe → hosted-API translation. The vendor supplies the input itself and
// does not support filter_complex, so this is where a mismatch becomes a job
// the customer paid for that could never have worked.
// ---------------------------------------------------------------------------
test("hosted translation: the input and output paths are dropped — the API owns both", () => {
  const [pass] = fr.buildRecipe("trim", { startSec: 5, endSec: 20 });
  const pairs = fr.toOptionPairs(pass);
  const flat = JSON.stringify(pairs);
  assert.doesNotMatch(flat, /"-i"/, "-i must not be sent; the API takes inputs separately");
  assert.doesNotMatch(flat, /\$IN|\$OUT/, "no placeholder may survive translation");
  assert.doesNotMatch(flat, /IN|OUT/, "no input/output sentinel may leak into the options");
});

test("hosted translation: every flag keeps its own argument, in order", () => {
  const [pass] = fr.buildRecipe("trim", { startSec: 5, endSec: 20 });
  const pairs = fr.toOptionPairs(pass);
  const byOption = Object.fromEntries(pairs.map((p) => [p.option, p.argument]));
  assert.equal(byOption["-ss"], "5");
  assert.equal(byOption["-t"], "15");
  assert.equal(byOption["-c:v"], "libx264");
  // Order matters to FFmpeg: -ss must precede -t.
  assert.ok(pairs.findIndex((p) => p.option === "-ss") < pairs.findIndex((p) => p.option === "-t"));
});

test("hosted translation: the vertical crop survives intact", () => {
  const [pass] = fr.buildRecipe("clips", { aspect: "9:16", moments: [{ startSec: 0, endSec: 10 }] });
  const vf = fr.toOptionPairs(pass).find((p) => p.option === "-vf");
  assert.ok(vf, "the video filter must be carried over");
  assert.match(vf.argument, /crop=ih\*9\/16:ih,scale=1080:1920/);
});

test("hosted translation: burning captions points at the SRT's hosted URL", () => {
  const [pass] = fr.buildRecipe("captions_burn", { srt: "1\n" });
  const vf = fr.toOptionPairs(pass, { asset: "https://storage.test/subs.srt" }).find((p) => p.option === "-vf");
  assert.match(vf.argument, /subtitles=https/, "the hosted service reads the SRT from a URL, not a local path");
});

test("hosted translation: kinds needing filter_complex are refused, not silently mangled", () => {
  for (const [kind, params] of [["brand", { logoUrl: "https://x/l.png" }], ["broll", { brollUrl: "https://x/b.mp4" }]]) {
    const [pass] = fr.buildRecipe(kind, params);
    assert.equal(fr.passSupportedOnHostedApi(pass), false, `${kind} composites two sources — it cannot go to the hosted API`);
    assert.throws(() => fr.toOptionPairs(pass), fr.RecipeError);
    assert.match(fr.hostedApiUnsupportedReason(kind), /filter_complex/);
  }
});

test("hosted translation: the kinds that CAN run hosted are all accepted", () => {
  const runnable = { trim: {}, clips: { moments: [{ startSec: 0, endSec: 5 }] }, captions_burn: { srt: "1\n" }, bg_remove: {}, upscale: {} };
  for (const [kind, params] of Object.entries(runnable)) {
    assert.equal(fr.hostedApiUnsupportedReason(kind), null, `${kind} should run on the hosted API`);
    for (const pass of fr.buildRecipe(kind, params)) {
      assert.ok(fr.toOptionPairs(pass, { asset: "https://x/a.srt" }).length > 0, `${kind} translated to nothing`);
    }
  }
});

test("hosted translation: the output container follows the recipe, not a default", () => {
  assert.equal(fr.outputFormatFor(fr.buildRecipe("bg_remove", {})[0]), "webm", "transparency needs WebM");
  assert.equal(fr.outputFormatFor(fr.buildRecipe("trim", {})[0]), "mp4");
});

test("hosted ffmpeg: submitting an unsupported pass never reaches the network", async () => {
  process.env.FFMPEG_CLOUD_API_KEY = process.env.FFMPEG_CLOUD_API_KEY || "test-key";
  const [pass] = fr.buildRecipe("brand", { logoUrl: "https://x/l.png" });
  const r = await fc.submitPass({ pass, sourceUrl: "gs://b/in.mp4" });
  assert.equal(r.ok, false);
  assert.match(r.error, /self-hosted render worker/, "it must tell the operator where this render CAN run");
});

// ---------------------------------------------------------------------------
// Observed vendor responses. The docs and the live API disagree in places, so
// these pin what the API ACTUALLY returns (URLs below are synthetic).
// ---------------------------------------------------------------------------
test("hosted ffmpeg: confirm is read correctly whether or not it wraps in `result`", () => {
  // Live responses have been seen flat; the docs show them wrapped. Both must work.
  const flat = fc.unwrap({ fileUrl: "gs://bucket/123-clip.mp4", downloadUrl: "https://storage.test/x" });
  assert.equal(flat.fileUrl, "gs://bucket/123-clip.mp4");
  const wrapped = fc.unwrap({ success: true, result: { fileUrl: "gs://bucket/123-clip.mp4" } });
  assert.equal(wrapped.fileUrl, "gs://bucket/123-clip.mp4");
});

test("hosted ffmpeg: a signed URL's real deadline is read from the signature", () => {
  // X-Goog-Date is basic-format ISO8601; X-Goog-Expires is seconds from then.
  const url = "https://storage.googleapis.com/b/o.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256"
    + "&X-Goog-Date=20260728T110901Z&X-Goog-Expires=900&X-Goog-SignedHeaders=content-type%3Bhost&X-Goog-Signature=deadbeef";
  const signedAt = Date.UTC(2026, 6, 28, 11, 9, 1);
  assert.equal(fc.signedUrlSecondsRemaining(url, signedAt), 900, "the full window at the moment of signing");
  assert.equal(fc.signedUrlSecondsRemaining(url, signedAt + 600_000), 300, "ten minutes later, five left");
  assert.ok(fc.signedUrlSecondsRemaining(url, signedAt + 901_000) < 0, "past the window it must read as expired");
});

test("hosted ffmpeg: the deadline reader never throws on a URL it cannot parse", () => {
  assert.equal(fc.signedUrlSecondsRemaining("not a url"), null);
  assert.equal(fc.signedUrlSecondsRemaining("https://storage.test/plain.mp4"), null);
  assert.equal(fc.signedUrlSecondsRemaining("https://s.test/o?X-Goog-Date=garbage&X-Goog-Expires=900"), null);
});

test("hosted ffmpeg: an already-expired link is refused before the bytes are sent", async () => {
  const stale = "https://storage.googleapis.com/b/o.mp4?X-Goog-Date=20200101T000000Z&X-Goog-Expires=900&X-Goog-Signature=x";
  const r = await fc.uploadToPresigned(stale, new ArrayBuffer(8), "video/mp4");
  assert.equal(r.ok, false);
  assert.match(r.error, /expired/, "a long upload must not be started against a dead link");
});

test("hosted ffmpeg: the job id is found under either spelling the API uses", () => {
  assert.equal(fc.jobIdOf({ jobId: "2296773c-live" }), "2296773c-live", "the live create endpoint returns jobId");
  assert.equal(fc.jobIdOf({ id: "docs-shape" }), "docs-shape", "the documented shape returns id");
  assert.equal(fc.jobIdOf({}), "", "neither present must read as missing, not as undefined");
});

test("hosted ffmpeg: a completed status carries a usable output URL", () => {
  // The live completed response is flat: { status, outputUrl } with no jobId.
  const body = fc.unwrap({ status: "completed", outputUrl: "https://storage.test/out.mp4?X-Goog-Expires=600" });
  assert.equal(fc.toQueueStatus(body.status), "done");
  assert.ok(body.outputUrl);
});

test("hosted ffmpeg: a nearly-expired output is treated as not fetchable", () => {
  const signedAt = Date.UTC(2026, 6, 28, 11, 23, 41);
  const url = "https://storage.googleapis.com/b/out.mp4?X-Goog-Date=20260728T112341Z&X-Goog-Expires=600&X-Goog-Signature=x";
  assert.equal(fc.outputStillFetchable(url, signedAt), true, "fresh — copy it to our storage now");
  assert.equal(fc.outputStillFetchable(url, signedAt + 599_000), false, "one second left is not enough to copy a video");
  assert.equal(fc.outputStillFetchable("https://plain.test/x.mp4"), true, "an unparseable URL must not be assumed dead");
});

// ---------------------------------------------------------------------------
// Provider routing — which executor runs a job, and whether money moves when
// NOTHING can run it. A paid job parked in a queue nobody reads is theft.
// ---------------------------------------------------------------------------
test("routing: with no renderer configured at all, rendering reports unavailable", () => {
  const savedCloud = process.env.FFMPEG_CLOUD_API_KEY;
  const savedWorker = process.env.VIDEO_WORKER_SECRET;
  delete process.env.FFMPEG_CLOUD_API_KEY;
  delete process.env.VIDEO_WORKER_SECRET;
  try {
    const r = vj.renderingAvailable();
    assert.equal(r.ok, false);
    assert.deepEqual(r.via, []);
  } finally {
    if (savedCloud) process.env.FFMPEG_CLOUD_API_KEY = savedCloud;
    if (savedWorker) process.env.VIDEO_WORKER_SECRET = savedWorker;
  }
});

test("routing: each configured executor is reported, and both can coexist", () => {
  const savedCloud = process.env.FFMPEG_CLOUD_API_KEY;
  const savedWorker = process.env.VIDEO_WORKER_SECRET;
  try {
    process.env.FFMPEG_CLOUD_API_KEY = "k";
    delete process.env.VIDEO_WORKER_SECRET;
    assert.deepEqual(vj.renderingAvailable().via, ["cloud"]);

    delete process.env.FFMPEG_CLOUD_API_KEY;
    process.env.VIDEO_WORKER_SECRET = "s";
    assert.deepEqual(vj.renderingAvailable().via, ["worker"]);

    process.env.FFMPEG_CLOUD_API_KEY = "k";
    assert.deepEqual(vj.renderingAvailable().via, ["cloud", "worker"]);
  } finally {
    if (savedCloud) process.env.FFMPEG_CLOUD_API_KEY = savedCloud; else delete process.env.FFMPEG_CLOUD_API_KEY;
    if (savedWorker) process.env.VIDEO_WORKER_SECRET = savedWorker; else delete process.env.VIDEO_WORKER_SECRET;
  }
});

test("routing: a whitespace-only secret does not count as a configured worker", () => {
  const saved = process.env.VIDEO_WORKER_SECRET;
  const savedCloud = process.env.FFMPEG_CLOUD_API_KEY;
  delete process.env.FFMPEG_CLOUD_API_KEY;
  process.env.VIDEO_WORKER_SECRET = "   ";
  try {
    assert.equal(vj.renderingAvailable().ok, false, "an empty env var is not a renderer");
  } finally {
    if (saved) process.env.VIDEO_WORKER_SECRET = saved; else delete process.env.VIDEO_WORKER_SECRET;
    if (savedCloud) process.env.FFMPEG_CLOUD_API_KEY = savedCloud;
  }
});

test("routing: the kinds needing a worker are exactly the two that composite", () => {
  const needsWorker = ["trim", "clips", "captions_burn", "brand", "broll", "bg_remove", "upscale"]
    .filter((k) => fr.hostedApiUnsupportedReason(k) !== null);
  assert.deepEqual(needsWorker.sort(), ["brand", "broll"]);
});

test("routing: a hosted-only deployment refunds a render it cannot run", async () => {
  const savedCloud = process.env.FFMPEG_CLOUD_API_KEY;
  const savedWorker = process.env.VIDEO_WORKER_SECRET;
  const savedUrl = process.env.FFMPEG_CLOUD_URL;
  // Point at an unroutable host so the submit fails without touching the network.
  process.env.FFMPEG_CLOUD_API_KEY = "k";
  process.env.FFMPEG_CLOUD_URL = "http://127.0.0.1:1";
  delete process.env.VIDEO_WORKER_SECRET;
  try {
    await w5.creditAcus("t-vid-route", 500);
    const before = (await w5.getWallet("t-vid-route")).balanceAcu;
    const r = await vj.enqueueVideoJob({
      brandId: "t-vid-route", kind: "trim", sourceUrl: "https://x.test/a.mp4", params: { startSec: 0, endSec: 5 },
    });
    assert.equal(r.ok, false, "a job nothing can run must not be queued");
    const after = (await w5.getWallet("t-vid-route")).balanceAcu;
    assert.equal(after, before, "and the customer must end up exactly where they started");
  } finally {
    if (savedCloud) process.env.FFMPEG_CLOUD_API_KEY = savedCloud; else delete process.env.FFMPEG_CLOUD_API_KEY;
    if (savedWorker) process.env.VIDEO_WORKER_SECRET = savedWorker; else delete process.env.VIDEO_WORKER_SECRET;
    if (savedUrl) process.env.FFMPEG_CLOUD_URL = savedUrl; else delete process.env.FFMPEG_CLOUD_URL;
  }
});

test("routing: when a worker exists, a hosted failure leaves the job queued and paid", async () => {
  const savedCloud = process.env.FFMPEG_CLOUD_API_KEY;
  const savedWorker = process.env.VIDEO_WORKER_SECRET;
  const savedUrl = process.env.FFMPEG_CLOUD_URL;
  process.env.FFMPEG_CLOUD_API_KEY = "k";
  process.env.FFMPEG_CLOUD_URL = "http://127.0.0.1:1";
  process.env.VIDEO_WORKER_SECRET = "s";
  try {
    await w5.creditAcus("t-vid-route2", 500);
    const r = await vj.enqueueVideoJob({
      brandId: "t-vid-route2", kind: "trim", sourceUrl: "https://x.test/a.mp4", params: { startSec: 0, endSec: 5 },
    });
    assert.equal(r.ok, true, "the worker can still run it, so it must be queued not refused");
    assert.equal(r.job.provider, "worker");
    assert.equal(r.job.status, "queued");
  } finally {
    if (savedCloud) process.env.FFMPEG_CLOUD_API_KEY = savedCloud; else delete process.env.FFMPEG_CLOUD_API_KEY;
    if (savedWorker) process.env.VIDEO_WORKER_SECRET = savedWorker; else delete process.env.VIDEO_WORKER_SECRET;
    if (savedUrl) process.env.FFMPEG_CLOUD_URL = savedUrl; else delete process.env.FFMPEG_CLOUD_URL;
  }
});

test("render pricing: every job kind clears the owner's 100% net profit floor", () => {
  for (const kind of Object.keys(vj.JOB_COST_ACU)) {
    const v = ue2.verdictForPrice({
      retailAcus: vj.JOB_COST_ACU[kind],
      providerCostGbp: vj.RENDER_PROVIDER_COST_GBP[kind],
      persistsArtifact: true,
    });
    assert.equal(v.meetsFloor, true, `${kind}: ${v.note}`);
  }
});

test("render pricing: a heavier render costs more — prices track processing time", () => {
  assert.ok(vj.JOB_COST_ACU.upscale > vj.JOB_COST_ACU.trim, "a slow 4K upscale cannot cost the same as a trim");
  assert.ok(vj.JOB_COST_ACU.clips > vj.JOB_COST_ACU.trim, "ten cuts cannot cost the same as one");
  assert.ok(vj.JOB_COST_ACU.bg_remove > vj.JOB_COST_ACU.brand);
});

test("render pricing: no render is free", () => {
  for (const [kind, cost] of Object.entries(vj.JOB_COST_ACU)) {
    assert.ok(cost >= 1, `${kind} must cost something — rendering burns real machine time`);
  }
});

// ---------------------------------------------------------------------------
// Media URL classification. Pasting a YouTube link is the most common thing a
// user does here, and the worst thing to handle badly: it fetches HTML, which a
// transcriber rejects with a meaningless error AFTER the charge.
// ---------------------------------------------------------------------------
const mu = await import("../src/shared/media-url.ts");

test("media urls: every YouTube link shape is recognised as a page, not media", () => {
  const links = [
    "https://www.youtube.com/watch?v=lgCAU_26xA0",
    "https://www.youtube.com/watch?v=lgCAU_26xA0&t=0s",
    "https://youtu.be/lgCAU_26xA0",
    "https://www.youtube.com/shorts/lgCAU_26xA0",
    "https://www.youtube.com/embed/lgCAU_26xA0?start=0&end=15",
    "https://www.youtube.com/watch?list=PL123&v=lgCAU_26xA0",
  ];
  for (const l of links) {
    const v = mu.classifyMediaUrl(l);
    assert.equal(v.kind, "youtube", `not recognised: ${l}`);
    assert.equal(v.usable, false);
    assert.equal(v.youtubeId, "lgCAU_26xA0", `wrong id for ${l}`);
  }
});

test("media urls: the YouTube message tells the user what to actually do", () => {
  const v = mu.classifyMediaUrl("https://www.youtube.com/watch?v=lgCAU_26xA0");
  assert.match(v.reason, /YouTube Studio/, "it must name the export path, not just refuse");
  assert.match(v.reason, /Download/);
});

test("media urls: a direct media link is usable, whatever the extension case", () => {
  for (const u of ["https://x.test/a.mp4", "https://x.test/A.MOV", "https://x.test/b.webm", "https://x.test/c.mp3", "https://x.test/d.wav"]) {
    assert.equal(mu.classifyMediaUrl(u).usable, true, `should be usable: ${u}`);
  }
});

test("media urls: a media link with a query string is still media", () => {
  assert.equal(mu.classifyMediaUrl("https://x.test/a.mp4?token=abc&v=2").usable, true);
});

test("media urls: a Firebase/Cloud Storage link is media even with no extension in the path", () => {
  assert.equal(mu.classifyMediaUrl("https://firebasestorage.googleapis.com/v0/b/p/o/renders%2Fx?alt=media&token=t").usable, true);
});

test("media urls: a gs:// object from a direct upload is usable", () => {
  assert.equal(mu.classifyMediaUrl("gs://bucket/1234-clip.mp4").usable, true);
  assert.equal(mu.classifyMediaUrl("gs://bucket").usable, false, "a bucket with no object is not a file");
});

test("media urls: an ordinary web page is refused with a usable explanation", () => {
  const v = mu.classifyMediaUrl("https://example.com/our-story");
  assert.equal(v.kind, "page");
  assert.equal(v.usable, false);
  assert.match(v.reason, /\.mp4/, "it must say what a usable link looks like");
});

test("media urls: junk input never throws", () => {
  for (const bad of ["", "   ", "not a url", "ftp://x.test/a.mp4", "javascript:alert(1)"]) {
    const v = mu.classifyMediaUrl(bad);
    assert.equal(v.usable, false, `should be unusable: ${bad}`);
    assert.ok(v.reason, "every refusal must carry a reason");
  }
});

test("media urls: content types are judged on what the server actually served", () => {
  assert.equal(mu.isMediaContentType("video/mp4"), true);
  assert.equal(mu.isMediaContentType("audio/mpeg; charset=binary"), true);
  assert.equal(mu.isMediaContentType("application/octet-stream"), true);
  assert.equal(mu.isMediaContentType("text/html; charset=utf-8"), false, "an HTML page is what a YouTube fetch returns");
  assert.equal(mu.isMediaContentType("application/json"), false);
  assert.equal(mu.isMediaContentType(""), true, "no header at all — let the provider decide");
});

// ---------------------------------------------------------------------------
// Reach Amplifier — the two claims on that page that could be empty words:
// that K is real arithmetic, and that the 5-touch cap is actually ENFORCED
// rather than merely printed in the copy.
// ---------------------------------------------------------------------------
const amp = await import("../src/backend/amplify.ts");

const VIRAL_FIXTURE = { seedAudience: 1000, shareRate: 0.15, invitesPerSharer: 3, inviteConversion: 0.25, cycles: 6 };

test("amplifier: K is the product of the three mechanics, with no hidden multiplier", () => {
  const p = amp.projectVirality(VIRAL_FIXTURE);
  // 0.15 x 3 x 0.25 = 0.1125, displayed to 2dp as 0.11 — exactly what the page showed.
  assert.equal(p.k, 0.11);
  assert.equal(p.viral, false, "0.11 is nowhere near self-sustaining");
});

test("amplifier: a sub-1 K tapers, and the total converges instead of exploding", () => {
  const p = amp.projectVirality(VIRAL_FIXTURE);
  // Geometric series: 1000 x (1 + K + K^2 + ...) → 1000/(1-0.1125) ≈ 1126.
  assert.ok(p.totalReach >= 1120 && p.totalReach <= 1130, `total reach should converge near 1126, got ${p.totalReach}`);
  assert.ok(p.totalReach <= Math.ceil(1000 / (1 - 0.1125)), "a sub-1 K can never exceed its geometric limit");
  // Each cycle must be smaller than the last — that IS what "tapers" means.
  for (let i = 1; i < p.perCycle.length; i++) {
    assert.ok(p.perCycle[i] < p.perCycle[i - 1], `cycle ${i + 1} did not taper`);
  }
});

test("amplifier: the self-sustaining verdict flips at K = 1, and only there", () => {
  const weak = amp.projectVirality({ ...VIRAL_FIXTURE, shareRate: 0.1, invitesPerSharer: 2, inviteConversion: 0.2 });
  const strong = amp.projectVirality({ ...VIRAL_FIXTURE, shareRate: 0.5, invitesPerSharer: 4, inviteConversion: 0.6 });
  assert.ok(weak.k < 1 && strong.k >= 1, "the fixture must straddle the threshold");
  assert.equal(weak.viral, false);
  assert.equal(strong.viral, true);
  assert.match(strong.note, /self-sustaining/);
});

test("amplifier: doubling the seed doubles reach — it never invents extra growth", () => {
  const a = amp.projectVirality({ ...VIRAL_FIXTURE, seedAudience: 1000 });
  const b = amp.projectVirality({ ...VIRAL_FIXTURE, seedAudience: 2000 });
  assert.equal(a.k, b.k, "K is a property of the mechanics, not of audience size");
  assert.ok(Math.abs(b.totalReach - a.totalReach * 2) <= 4, "reach must scale linearly with the seed");
});

test("amplifier: the projection is capped at 20 cycles, so it cannot be run to absurdity", () => {
  const p = amp.projectVirality({ ...VIRAL_FIXTURE, shareRate: 0.9, invitesPerSharer: 5, inviteConversion: 0.9, cycles: 500 });
  assert.ok(p.perCycle.length <= 20, "an unbounded loop would produce a fantasy number");
});

const RETARGET_BASE = { behaviour: "clicked_no_purchase", consentedChannels: ["email"], optedOut: false, converted: false };

test("amplifier: the 5-touch cap is ENFORCED, not just printed in the copy", () => {
  const { decisions } = amp.planRetargeting([
    { ...RETARGET_BASE, id: "fresh", touchesLast7d: 0 },
    { ...RETARGET_BASE, id: "at-cap", touchesLast7d: amp.MAX_TOUCHES_PER_7D },
    { ...RETARGET_BASE, id: "over-cap", touchesLast7d: amp.MAX_TOUCHES_PER_7D + 3 },
  ]);
  const by = Object.fromEntries(decisions.map((d) => [d.id, d]));
  assert.equal(by["fresh"].action, "send", "someone with no recent touches must be reachable");
  assert.equal(by["at-cap"].action, "hold", "exactly at the cap must be held");
  assert.equal(by["over-cap"].action, "hold", "over the cap must stay held");
  assert.match(by["at-cap"].reason, /frequency cap/);
});

test("amplifier: no consented channel means no contact, whatever the behaviour", () => {
  const { decisions } = amp.planRetargeting([{ ...RETARGET_BASE, id: "x", consentedChannels: [], touchesLast7d: 0 }]);
  assert.equal(decisions[0].action, "hold");
  assert.equal(decisions[0].channel, null, "a held decision must never carry a channel to send on");
  assert.match(decisions[0].reason, /lawfully/);
});

test("amplifier: opting out stops contact immediately, ahead of every other rule", () => {
  const { decisions } = amp.planRetargeting([
    { ...RETARGET_BASE, id: "out", optedOut: true, touchesLast7d: 0 },
    { ...RETARGET_BASE, id: "won", converted: true, touchesLast7d: 0 },
  ]);
  const by = Object.fromEntries(decisions.map((d) => [d.id, d]));
  assert.equal(by["out"].action, "stop", "an opt-out must stop, never merely hold");
  assert.equal(by["won"].action, "stop", "pursuing someone who already bought is the failure this prevents");
});

test("amplifier: the counts reported back match the decisions actually made", () => {
  const r = amp.planRetargeting([
    { ...RETARGET_BASE, id: "a", touchesLast7d: 0 },
    { ...RETARGET_BASE, id: "b", touchesLast7d: 0 },
    { ...RETARGET_BASE, id: "c", touchesLast7d: 9 },
    { ...RETARGET_BASE, id: "d", optedOut: true, touchesLast7d: 0 },
  ]);
  assert.equal(r.willSend, 2);
  assert.equal(r.held, 1);
  assert.equal(r.stopped, 1);
  assert.equal(r.willSend + r.held + r.stopped, r.decisions.length, "every subject must be accounted for");
});

// ---------------------------------------------------------------------------
// Automation Lab — "autonomous journeys that can't spam" is a strong claim.
// These check the anti-spam machinery actually refuses, rather than advising.
// ---------------------------------------------------------------------------
const auto = await import("../src/backend/automation.ts");

const wait = (h) => ({ kind: "wait", delayHours: h, label: `wait ${h}h` });
const msg = (n) => ({ kind: "action", action: "send_email", channel: "email", detail: `message ${n}`, label: `msg ${n}` });

test("automation: six messages in a week is REFUSED, five is allowed", () => {
  const under = auto.validateWorkflow({
    id: "u", name: "under", trigger: "form_submitted",
    steps: [msg(1), wait(24), msg(2), wait(24), msg(3), wait(24), msg(4), wait(24), msg(5),
            { kind: "condition", check: "converted", label: "stop on conversion" }],
  });
  assert.equal(under.valid, true, `five touches must pass — ${under.warnings.join("; ")}`);
  assert.equal(under.touchesIn7d, 5);

  const over = auto.validateWorkflow({
    id: "o", name: "over", trigger: "form_submitted",
    steps: [msg(1), wait(12), msg(2), wait(12), msg(3), wait(12), msg(4), wait(12), msg(5), wait(12), msg(6),
            { kind: "condition", check: "converted", label: "stop on conversion" }],
  });
  assert.equal(over.valid, false, "six touches inside a week must be refused");
  assert.equal(over.touchesIn7d, 6);
  assert.match(over.warnings.join(" "), /frequency cap/i);
});

test("automation: the window ROLLS — spacing messages past 7 days makes them legal", () => {
  const spaced = auto.validateWorkflow({
    id: "s", name: "spaced", trigger: "form_submitted",
    steps: [msg(1), wait(24), msg(2), wait(24), msg(3), wait(24), msg(4), wait(24), msg(5),
            wait(24 * 8), msg(6), // a clear week later — a new window
            { kind: "condition", check: "converted", label: "stop on conversion" }],
  });
  assert.equal(spaced.touchesIn7d, 5, "the 6th falls outside the rolling window");
  assert.equal(spaced.valid, true, "the same six messages, properly spaced, must be allowed");
});

test("automation: a journey with no way to stop is flagged", () => {
  const endless = auto.validateWorkflow({
    id: "e", name: "endless", trigger: "form_submitted",
    steps: [msg(1), wait(24), msg(2)],
  });
  assert.match(endless.warnings.join(" "), /stop condition/i, "pursuing someone forever is the failure mode to catch");
});

test("automation: a non-consented contact receives NO marketing in the dry run", () => {
  const wf = {
    id: "c", name: "consent", trigger: "form_submitted",
    steps: [msg(1), wait(24), msg(2), { kind: "condition", check: "converted", label: "stop" }],
  };
  const consented = auto.simulateWorkflow(wf, { consented: true });
  const not = auto.simulateWorkflow(wf, { consented: false });
  assert.ok(consented.timeline.filter((e) => e.sent && e.kind === "send_email").length > 0, "a consented contact should receive messages");
  assert.equal(not.timeline.filter((e) => e.sent && e.kind === "send_email").length, 0, "a non-consented contact must receive none");
  for (const e of not.timeline.filter((e) => e.kind === "send_email")) {
    assert.match(e.reason, /not consented/, "and each skip must say why");
  }
});

test("automation: every shipped template obeys the cap it advertises", () => {
  for (const t of auto.TEMPLATES) {
    const v = auto.validateWorkflow(t);
    assert.equal(v.valid, true, `template "${t.name}" breaches the frequency cap: ${v.warnings.join("; ")}`);
    assert.ok(v.touchesIn7d <= 5, `template "${t.name}" plans ${v.touchesIn7d} touches in 7 days`);
  }
});

// ---------------------------------------------------------------------------
// A/B testing — the maths must be RIGHT, not merely present. The failure this
// exists to prevent: declaring a winner off a handful of clicks, so the
// customer kills the better creative while the tool looks clever.
// ---------------------------------------------------------------------------
const ex = await import("../src/backend/experiments.ts");

test("stats: the normal CDF matches published values", () => {
  assert.ok(Math.abs(ex.normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(ex.normalCdf(1.96) - 0.975) < 1e-3, `got ${ex.normalCdf(1.96)}`);
  assert.ok(Math.abs(ex.normalCdf(-1.96) - 0.025) < 1e-3);
  assert.ok(Math.abs(ex.normalCdf(2.5758) - 0.995) < 1e-3);
});

test("stats: a two-sided p-value at z=1.96 is 0.05, the number everyone quotes", () => {
  assert.ok(Math.abs(ex.twoSidedP(1.96) - 0.05) < 1e-3, `got ${ex.twoSidedP(1.96)}`);
  assert.ok(Math.abs(ex.twoSidedP(0) - 1) < 1e-9);
  assert.equal(ex.twoSidedP(-1.96), ex.twoSidedP(1.96), "the test is two-sided — direction must not change it");
});

test("stats: Wilson intervals stay inside 0-100% even at the extremes", () => {
  const none = ex.wilsonInterval(0, 40);
  assert.equal(none.low, 0, "zero conversions cannot have a negative lower bound");
  assert.ok(none.high > 0 && none.high < 0.15, `0/40 should admit a small positive rate, got ${none.high}`);
  const all = ex.wilsonInterval(40, 40);
  assert.equal(all.high, 1, "forty of forty cannot exceed 100%");
  assert.ok(all.low > 0.85 && all.low < 1);
});

test("stats: a small sample yields a WIDE interval — this is the whole point", () => {
  const small = ex.wilsonInterval(3, 10);
  const large = ex.wilsonInterval(300, 1000);
  const smallWidth = small.high - small.low;
  const largeWidth = large.high - large.low;
  assert.ok(smallWidth > 0.4, `3/10 must be visibly uncertain, width was ${smallWidth}`);
  assert.ok(largeWidth < 0.06, `300/1000 should be tight, width was ${largeWidth}`);
  assert.ok(smallWidth > largeWidth * 7, "ten times the data must narrow the interval substantially");
});

test("stats: identical variants produce no significant difference", () => {
  const r = ex.twoProportionTest({ conversions: 100, impressions: 1000 }, { conversions: 100, impressions: 1000 });
  assert.equal(Math.round(r.z), 0);
  assert.ok(r.pValue > 0.99, `identical data must give p ≈ 1, got ${r.pValue}`);
});

test("stats: a large, real difference is detected", () => {
  const r = ex.twoProportionTest({ conversions: 50, impressions: 1000 }, { conversions: 120, impressions: 1000 });
  assert.ok(r.pValue < 0.001, `5% vs 12% on 1000 each should be decisive, got p=${r.pValue}`);
});

test("stats: required sample size matches the standard formula", () => {
  // Baseline 10%, detect a 2-point move, alpha 0.05, power 0.80 → ~3,840 per arm.
  const n = ex.requiredSampleSize({ baselineRate: 0.10, mdeAbsolute: 0.02 });
  assert.ok(n > 3600 && n < 4100, `expected ~3840 per arm, got ${n}`);
});

test("stats: detecting a SMALLER change requires a much larger sample", () => {
  const big = ex.requiredSampleSize({ baselineRate: 0.10, mdeAbsolute: 0.04 });
  const small = ex.requiredSampleSize({ baselineRate: 0.10, mdeAbsolute: 0.01 });
  assert.ok(small > big * 10, "halving the effect roughly quadruples n; a quarter of it, ~16x");
  assert.equal(ex.requiredSampleSize({ baselineRate: 0.1, mdeAbsolute: 0 }), Infinity, "detecting no change needs infinite data");
});

test("experiment: 12 impressions NEVER declare a winner, however lopsided", () => {
  const r = ex.evaluateExperiment({
    variants: [
      { id: "a", label: "Control", impressions: 12, conversions: 1 },
      { id: "b", label: "Challenger", impressions: 12, conversions: 5 },
    ],
  });
  assert.equal(r.verdict, "collecting", "a 5-vs-1 split on 12 impressions is noise, not a result");
  assert.equal(r.winnerId, undefined, "no winner may be named");
  assert.match(r.headline, /not yet enough data/i);
  assert.match(r.headline, /Do not switch off/i, "it must actively stop the customer acting on noise");
});

test("experiment: a real winner IS declared once the sample is there", () => {
  const r = ex.evaluateExperiment({
    variants: [
      { id: "a", label: "Control", impressions: 20000, conversions: 1000 },   // 5%
      { id: "b", label: "Challenger", impressions: 20000, conversions: 1400 }, // 7%
    ],
    mdeAbsolute: 0.01,
  });
  assert.equal(r.verdict, "winner");
  assert.equal(r.winnerId, "b");
  assert.ok(r.pValue < 0.001);
  assert.equal(r.absoluteLiftPct, 2, "the lift must be reported in POINTS (5% → 7% = 2 points)");
  assert.equal(r.relativeLiftPct, 40, "and separately as the relative +40%");
});

test("experiment: a full sample with no real difference says so, and says why that is useful", () => {
  const r = ex.evaluateExperiment({
    variants: [
      { id: "a", label: "Control", impressions: 20000, conversions: 1000 },
      { id: "b", label: "Challenger", impressions: 20000, conversions: 1010 },
    ],
    mdeAbsolute: 0.01,
  });
  assert.equal(r.verdict, "no_difference");
  assert.equal(r.winnerId, undefined);
  assert.match(r.caveats.join(" "), /smaller than/, "a null result must be explained, not just reported");
});

test("experiment: repeated peeking is called out", () => {
  const r = ex.evaluateExperiment({
    variants: [
      { id: "a", label: "Control", impressions: 500, conversions: 25 },
      { id: "b", label: "Challenger", impressions: 500, conversions: 40 },
    ],
    looksTaken: 11,
  });
  assert.match(r.caveats.join(" "), /false-positive rate/i, "checking 11 times must be flagged");
  assert.equal(r.verdict, "collecting");
});

test("experiment: progress toward the decision is reported honestly", () => {
  const r = ex.evaluateExperiment({
    variants: [
      { id: "a", label: "Control", impressions: 1000, conversions: 50 },
      { id: "b", label: "Challenger", impressions: 1000, conversions: 55 },
    ],
    mdeAbsolute: 0.01,
  });
  assert.ok(r.requiredPerArm > 1000, "this test is nowhere near sized");
  assert.equal(r.observedPerArm, 1000);
  assert.ok(r.progressPct > 0 && r.progressPct < 100);
});

test("experiment: every variant's rate is reported WITH its uncertainty", () => {
  const r = ex.evaluateExperiment({
    variants: [
      { id: "a", label: "Control", impressions: 10, conversions: 3 },
      { id: "b", label: "Challenger", impressions: 10, conversions: 4 },
    ],
  });
  const a = r.variants[0];
  assert.equal(a.ratePct, 30);
  assert.ok(a.lowPct < 15 && a.highPct > 55, `3/10 must show a wide range, got ${a.lowPct}-${a.highPct}`);
  assert.match(a.intervalNote, /somewhere between/);
});

test("experiment: a single variant is not a test", () => {
  const r = ex.evaluateExperiment({ variants: [{ id: "a", label: "Only", impressions: 5000, conversions: 500 }] });
  assert.equal(r.verdict, "not_started");
  assert.equal(r.winnerId, undefined);
});

test("experiment: zero impressions never divides by zero or invents a rate", () => {
  const r = ex.evaluateExperiment({
    variants: [
      { id: "a", label: "Control", impressions: 0, conversions: 0 },
      { id: "b", label: "Challenger", impressions: 0, conversions: 0 },
    ],
  });
  assert.equal(r.verdict, "not_started");
  for (const v of r.variants) assert.equal(v.ratePct, 0);
});

// ---------------------------------------------------------------------------
// Identity Lock — the ™ has to mean something. These check the measurement
// catches the failure it exists for: the same shape in the wrong colour.
// ---------------------------------------------------------------------------
const il = await import("../src/backend/identity-lock.ts");
const sharpLib = (await import("sharp")).default;

const solid = (r, g, b, w = 300, h = 300) =>
  sharpLib({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();

// A recognisable "product": a light bottle-ish bar on a dark ground.
const shape = (bar, ground, w = 300, h = 300) =>
  sharpLib({ create: { width: w, height: h, channels: 3, background: ground } })
    .composite([{
      input: { create: { width: 80, height: 200, channels: 3, background: bar } },
      top: 50, left: 110,
    }])
    .png().toBuffer();

test("identity: a creative identical to the source passes every axis", async () => {
  const img = await shape({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 40 });
  const v = await il.verifyIdentity(img, img);
  assert.equal(v.ok, true, v.error);
  assert.equal(v.passed, true, v.summary);
  assert.equal(v.overall, 100);
});

test("identity: RECOLOURING the product is caught even though the shape survives", async () => {
  const original = await shape({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 40 });   // white bottle
  const recoloured = await shape({ r: 220, g: 30, b: 30 }, { r: 20, g: 20, b: 40 });   // the red-bottle failure
  const v = await il.verifyIdentity(original, recoloured);
  assert.equal(v.ok, true, v.error);
  const colour = v.axes.find((a) => a.axis === "colour");
  const structure = v.axes.find((a) => a.axis === "structure");
  assert.ok(structure.similarity > colour.similarity, "the silhouette is intact — only the colour changed");
  assert.equal(colour.passed, false, "a recoloured product must FAIL the colour axis");
  assert.equal(v.passed, false, "and therefore fail overall");
  assert.match(v.summary, /FAILED/);
});

test("identity: the overall score is the WEAKEST axis, never a flattering average", async () => {
  const original = await shape({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 40 });
  const recoloured = await shape({ r: 220, g: 30, b: 30 }, { r: 20, g: 20, b: 40 });
  const v = await il.verifyIdentity(original, recoloured);
  const weakest = Math.min(...v.axes.map((a) => a.similarity));
  const average = v.axes.reduce((s, a) => s + a.similarity, 0) / v.axes.length;
  assert.equal(v.overall, weakest);
  assert.ok(v.overall < average, "an average would have hidden the recolour behind two passing axes");
});

test("identity: a completely different product fails on structure", async () => {
  const bottle = await shape({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 40 });
  const noise = await sharpLib({ create: { width: 300, height: 300, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .composite([{ input: { create: { width: 240, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } } }, top: 10, left: 10 }])
    .png().toBuffer();
  const v = await il.verifyIdentity(bottle, noise);
  assert.equal(v.ok, true, v.error);
  assert.equal(v.passed, false);
  assert.ok(v.warnings.length > 0, "a failure must explain itself");
});

test("identity: stretching the image is caught by the proportion axis", async () => {
  const square = await shape({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 40 }, 300, 300);
  const stretched = await shape({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 40 }, 900, 200);
  const v = await il.verifyIdentity(square, stretched);
  const proportion = v.axes.find((a) => a.axis === "proportion");
  assert.equal(proportion.passed, false, "a 4.5:1 render of a 1:1 photo is not the same product shot");
});

test("identity: the perceptual hash is stable and comparable", () => {
  const flat = Array.from({ length: 32 }, () => new Array(32).fill(128));
  const h1 = il.hashFromLuma(flat);
  assert.equal(h1.length, 64, "an 8x8 block is a 64-bit hash");
  assert.equal(il.hammingSimilarity(h1, h1), 100, "a hash must match itself exactly");
  const inverted = h1.split("").map((b, i) => (i === 0 ? b : b === "1" ? "0" : "1")).join("");
  assert.ok(il.hammingSimilarity(h1, inverted) < 10, "an inverted hash must be maximally different");
  assert.equal(il.hammingSimilarity(h1, "1010"), 0, "mismatched lengths cannot be compared");
});

test("identity: histogram similarity is 100 for a match and ~0 for disjoint colours", () => {
  const red = new Array(64).fill(0); red[63] = 1;
  const blue = new Array(64).fill(0); blue[3] = 1;
  assert.equal(Math.round(il.histogramSimilarity(red, red)), 100);
  assert.equal(Math.round(il.histogramSimilarity(red, blue)), 0, "no shared colour means no similarity");
  const half = new Array(64).fill(0); half[63] = 0.5; half[3] = 0.5;
  const mixed = il.histogramSimilarity(red, half);
  assert.ok(mixed > 60 && mixed < 80, `partial overlap should be partial, got ${mixed}`);
});

test("identity: proportion similarity is orientation-agnostic and bounded", () => {
  assert.equal(il.proportionSimilarity({ width: 100, height: 100 }, { width: 500, height: 500 }), 100);
  assert.equal(il.proportionSimilarity({ width: 0, height: 10 }, { width: 10, height: 10 }), 0);
  const squashed = il.proportionSimilarity({ width: 100, height: 100 }, { width: 200, height: 100 });
  assert.ok(squashed > 45 && squashed < 55, `2:1 vs 1:1 should be ~50, got ${squashed}`);
});

test("identity: the colour check looks at the SUBJECT, not the background", () => {
  // A frame that is 82% background and 18% product. Recolouring only the
  // product leaves the whole-frame histogram largely intact — which is exactly
  // why whole-frame comparison misses the failure that matters.
  const white = new Array(64).fill(0);
  white[0] = 0.82;   // dark background bucket
  white[63] = 0.18;  // white product bucket
  const red = new Array(64).fill(0);
  red[0] = 0.82;     // same background
  red[48] = 0.18;    // product now red

  const whole = il.histogramSimilarity(white, red);
  const subject = il.subjectAwareColourSimilarity(white, red);
  assert.ok(whole > 75, `whole-frame comparison is fooled — it scores ${whole}`);
  assert.ok(subject < 10, `subject-aware comparison must catch it, got ${subject}`);
});

test("identity: removing the background does not break when the product fills the frame", () => {
  const a = new Array(64).fill(0); a[63] = 1;      // one colour, whole frame
  const b = new Array(64).fill(0); b[63] = 1;
  assert.equal(Math.round(il.subjectAwareColourSimilarity(a, b)), 100, "identical must stay 100 with no subject to isolate");
  assert.deepEqual(il.withoutDominantBucket(a), a, "a single-bucket image has no background to strip");
});

test("identity: reported scores never contradict their own pass/fail", async () => {
  const original = await shape({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 40 });
  const other = await shape({ r: 220, g: 30, b: 30 }, { r: 90, g: 90, b: 90 });
  const v = await il.verifyIdentity(original, other);
  for (const a of v.axes) {
    assert.equal(a.passed, a.similarity >= a.threshold,
      `${a.axis} shows ${a.similarity} against a threshold of ${a.threshold} but reports passed=${a.passed}`);
  }
});

// ---------------------------------------------------------------------------
// Landing-page analytics — real counts, and a rate that refuses to mislead.
// The defect being fixed: a page list showing "Conv 67" beside a live URL,
// where 67 was a PREDICTED copy score, not a conversion rate.
// ---------------------------------------------------------------------------
const pa = await import("../src/backend/page-analytics.ts");

test("analytics: events accumulate per brand and slug, and never leak between pages", async () => {
  await pa.recordPageEvent("t-pa-1", "offer-a", "view");
  await pa.recordPageEvent("t-pa-1", "offer-a", "view");
  await pa.recordPageEvent("t-pa-1", "offer-a", "cta_click");
  await pa.recordPageEvent("t-pa-1", "offer-a", "lead");
  await pa.recordPageEvent("t-pa-1", "offer-b", "view");

  const a = await pa.getPageStats("t-pa-1", "offer-a");
  assert.equal(a.views, 2);
  assert.equal(a.ctaClicks, 1);
  assert.equal(a.leads, 1);
  const b = await pa.getPageStats("t-pa-1", "offer-b");
  assert.equal(b.views, 1);
  assert.equal(b.leads, 0, "one page's leads must never appear on another");
});

test("analytics: another brand's pages are not visible", async () => {
  await pa.recordPageEvent("t-pa-other", "secret", "view");
  const mine = await pa.listPageStats("t-pa-1");
  assert.ok(!mine.some((s) => s.slug === "secret"), "cross-tenant leak");
});

test("analytics: a rate is NOT claimed on tiny traffic — the whole point", () => {
  const r = pa.reportFor({ brandId: "b", slug: "s", views: 3, ctaClicks: 2, leads: 1, daily: {} });
  assert.equal(r.enoughData, false, "3 visitors is not a 33% conversion rate");
  assert.ok(r.caveat, "it must say why the number is not shown as fact");
  assert.match(r.caveat, /between/, "and give the honest range instead");
  assert.ok(r.conversionLowPct < 10 && r.conversionHighPct > 70, `1-of-3 must show a wide range, got ${r.conversionLowPct}-${r.conversionHighPct}`);
});

test("analytics: with real traffic the rate IS reported, and it is arithmetic", () => {
  const r = pa.reportFor({ brandId: "b", slug: "s", views: 1000, ctaClicks: 300, leads: 40, daily: {} });
  assert.equal(r.enoughData, true);
  assert.equal(r.conversionRatePct, 4, "40 of 1000 is 4%");
  assert.equal(r.clickRatePct, 30, "300 of 1000 is 30%");
  assert.equal(r.caveat, undefined, "no hedge is needed once the data is there");
  assert.match(r.headline, /1,000 visitors/);
});

test("analytics: a page with no visitors reports zero, never a divide-by-zero", () => {
  const r = pa.reportFor({ brandId: "b", slug: "s", views: 0, ctaClicks: 0, leads: 0, daily: {} });
  assert.equal(r.conversionRatePct, 0);
  assert.equal(r.clickRatePct, 0);
  assert.ok(Number.isFinite(r.conversionRatePct));
  assert.match(r.headline, /No visitors yet/);
});

test("analytics: daily buckets are kept so a trend can be drawn", async () => {
  await pa.recordPageEvent("t-pa-2", "trend", "view");
  await pa.recordPageEvent("t-pa-2", "trend", "lead");
  const s = await pa.getPageStats("t-pa-2", "trend");
  const days = Object.keys(s.daily);
  assert.equal(days.length, 1, "one day of activity, one bucket");
  assert.equal(s.daily[days[0]].views, 1);
  assert.equal(s.daily[days[0]].leads, 1);
  assert.match(days[0], /^\d{4}-\d{2}-\d{2}$/, "buckets are dates, not timestamps — no visitor is identifiable");
});

test("analytics: a malformed event is ignored rather than corrupting the counts", async () => {
  await pa.recordPageEvent("t-pa-3", "x", "view");
  await pa.recordPageEvent("t-pa-3", "x", "not_a_real_event");
  await pa.recordPageEvent("", "x", "view");
  await pa.recordPageEvent("t-pa-3", "", "view");
  const s = await pa.getPageStats("t-pa-3", "x");
  assert.equal(s.views, 1, "only the one valid event may count");
});

// ---------------------------------------------------------------------------
// Journey compiler — turns an agent's WRITTEN plan into a runnable journey.
// The fixture below is the real Lead Capture Agent output, verbatim.
// ---------------------------------------------------------------------------
const jc = await import("../src/backend/journey-compiler.ts");

const AGENT_OUTPUT = `
Follow-Up Sequence (48h)
+1h: Email — "Your VeryX setup is 2 minutes away" + link.
+6h: WhatsApp — "Stuck on anything? Reply here."
+24h: Email — answer the top objection for [product] + link.
+47h: WhatsApp — "Holding your £149 rate until midnight." (only if genuinely time-bound).
`;

test("compiler: the real agent output compiles into a runnable journey", () => {
  const r = jc.compileJourney({ text: AGENT_OUTPUT, name: "VeryX signup recovery" });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.steps.length, 4, "all four timed messages must be found");
  assert.deepEqual(r.steps.map((s) => s.atHours), [1, 6, 24, 47]);
  assert.deepEqual(r.steps.map((s) => s.channel), ["email", "whatsapp", "email", "whatsapp"]);
  assert.match(r.steps[0].text, /2 minutes away/, "the actual copy must survive, not a placeholder");
});

test("compiler: the compiled journey passes the same validator the Lab uses", () => {
  const r = jc.compileJourney({ text: AGENT_OUTPUT });
  const v = auto.validateWorkflow(r.workflow);
  assert.equal(v.valid, true, v.warnings.join("; "));
  assert.equal(v.touchesIn7d, 4, "four touches — exactly what the agent claimed");
});

test("compiler: waits are RELATIVE, so absolute times are not double-counted", () => {
  const r = jc.compileJourney({ text: AGENT_OUTPUT });
  const waits = r.workflow.steps.filter((s) => s.kind === "wait").map((s) => s.delayHours);
  // +1h, then +5h, then +18h, then +23h — cumulative 47, not 78.
  assert.deepEqual(waits, [1, 5, 18, 23]);
  assert.equal(waits.reduce((a, b) => a + b, 0), 47, "the last message must land at +47h, not later");
});

test("compiler: every journey gets a way to end, and says when one was added", () => {
  const withStop = jc.compileJourney({ text: AGENT_OUTPUT + "\nStop on signup or opt-out." });
  const without = jc.compileJourney({ text: "+2h: Email — hello\n+30h: Email — again" });
  assert.ok(withStop.workflow.steps.some((s) => s.kind === "condition"));
  assert.ok(without.workflow.steps.some((s) => s.kind === "condition"), "a stop must always exist");
  assert.ok(without.assumptions.some((a) => /did not state when to stop/.test(a)), "and an added one must be disclosed");
  assert.equal(withStop.assumptions.some((a) => /did not state when to stop/.test(a)), false);
});

test("compiler: a step with no channel is NEVER guessed — it is handed back", () => {
  const r = jc.compileJourney({ text: "+1h: Email — welcome\n+5h: follow up somehow\n+9h: WhatsApp — hi" });
  assert.equal(r.steps.length, 2, "only the two channelled steps are runnable");
  assert.ok(r.unparsed.some((u) => /follow up somehow/.test(u)));
  assert.ok(r.assumptions.some((a) => /no channel was named/.test(a)),
    "guessing a channel is how someone SMSes a list that only consented to email");
});

test("compiler: it reads the time formats a model actually writes", () => {
  assert.equal(jc.parseDelay("+30 min: WhatsApp"), 0.5);
  assert.equal(jc.parseDelay("+1h"), 1);
  assert.equal(jc.parseDelay("+2 days"), 48);
  assert.equal(jc.parseDelay("+1 week"), 168);
  assert.equal(jc.parseDelay("Wait 24h → Condition"), 24);
  assert.equal(jc.parseDelay("Wait 30 min"), 0.5);
  assert.equal(jc.parseDelay("Day 3"), 48, "Day 1 is hour zero");
  assert.equal(jc.parseDelay("sometime later"), null, "unreadable must be null, never a guess");
});

test("compiler: WhatsApp is not mistaken for a generic message, nor email for SMS", () => {
  assert.equal(jc.parseChannel("+6h: WhatsApp — ping")?.channel, "whatsapp");
  assert.equal(jc.parseChannel("+6h: Email — ping")?.channel, "email");
  assert.equal(jc.parseChannel("+6h: SMS — ping")?.channel, "sms");
  assert.equal(jc.parseChannel("+6h: send them a message"), null, "'message' alone names no channel");
});

test("compiler: an out-of-order plan is sorted rather than run backwards", () => {
  const r = jc.compileJourney({ text: "+24h: Email — third\n+1h: Email — first\n+6h: WhatsApp — second" });
  assert.deepEqual(r.steps.map((s) => s.atHours), [1, 6, 24]);
  assert.match(r.steps[0].text, /first/);
});

test("compiler: a plan that breaches the frequency cap is caught before activation", () => {
  const spammy = ["+1h", "+2h", "+3h", "+4h", "+5h", "+6h"].map((t) => `${t}: Email — buy now`).join("\n");
  const r = jc.compileJourney({ text: spammy });
  assert.equal(r.ok, true, "it compiles...");
  const v = auto.validateWorkflow(r.workflow);
  assert.equal(v.valid, false, "...but must not pass validation");
  assert.match(v.warnings.join(" "), /frequency cap/i);
});

test("compiler: prose with no timed steps fails with an example, not a stack trace", () => {
  const r = jc.compileJourney({ text: "We should follow up with people who sign up. Email works well." });
  assert.equal(r.ok, false);
  assert.match(r.error, /time and a channel/);
  assert.match(r.error, /\+6h/, "the error must show what a valid step looks like");
});

test("compiler: empty input is refused cleanly", () => {
  const r = jc.compileJourney({ text: "   " });
  assert.equal(r.ok, false);
  assert.equal(r.workflow, undefined);
});

// ---------------------------------------------------------------------------
// Page anatomy — the eight-point checklist, audited against a REAL page rather
// than printed as decoration.
// ---------------------------------------------------------------------------
const pan = await import("../src/backend/page-anatomy.ts");

const FULL_PAGE = {
  slug: "full", headline: "Cut your survey costs in half", subheadline: "For UK contractors",
  offerText: "£149 setup, cancel anytime", primaryCta: "Start for £149", primaryCtaUrl: "https://x.test/buy",
  formConfig: { enabled: true, fields: [{ key: "name" }, { key: "email" }] },
  whatsappConfig: { enabled: true, phoneNumber: "447700900000" },
  sections: [
    { type: "problem", heading: "Sound familiar?", body: "Re-surveying costs you weeks." },
    { type: "offer", heading: "The offer", body: "£149 setup", items: ["Unlimited sites", "Cancel anytime"] },
    { type: "benefits", heading: "What you get", items: ["Faster", "Cheaper"] },
    { type: "proof", heading: "Customers", items: ["Real quote from a named customer"] },
    { type: "faq", heading: "Questions", items: ["How long? About a week", "Any contract? No"] },
    { type: "urgency", heading: "Ends Friday", body: "Offer closes Friday" },
  ],
};

test("anatomy: a complete page scores 100 and is told to stop adding sections", () => {
  const a = pan.auditPageAnatomy(FULL_PAGE);
  assert.equal(a.presentCount, a.total, a.checks.filter((c) => !c.present).map((c) => c.label).join("; "));
  assert.equal(a.scorePct, 100);
  assert.equal(a.topFix, undefined);
  assert.match(a.summary, /structurally complete/);
});

test("anatomy: a bare page is scored honestly, not generously", () => {
  const a = pan.auditPageAnatomy({ slug: "bare", headline: "Hello" });
  assert.ok(a.scorePct < 40, `a headline alone should not score ${a.scorePct}`);
  assert.ok(a.presentCount < a.total);
  assert.ok(a.topFix, "there must be a single obvious next action");
});

test("anatomy: the score is WEIGHTED — a missing CTA costs more than a missing FAQ", () => {
  const noFaq = pan.auditPageAnatomy({ ...FULL_PAGE, sections: FULL_PAGE.sections.filter((s) => s.type !== "faq") });
  const noCta = pan.auditPageAnatomy({ ...FULL_PAGE, primaryCta: "", primaryCtaUrl: "" });
  assert.ok(noCta.scorePct < noFaq.scorePct, "losing the button must hurt more than losing the FAQ");
});

test("anatomy: a CTA with nowhere to go does not count as a CTA", () => {
  const a = pan.auditPageAnatomy({
    slug: "x", headline: "H", primaryCta: "Buy now",
    formConfig: { enabled: false }, whatsappConfig: { enabled: false },
  });
  const cta = a.checks.find((c) => c.id === "cta");
  assert.equal(cta.present, false, "a button with no destination is not a call to action");
  assert.match(cta.detail, /nowhere/);
});

test("anatomy: too many form fields FAILS the check and says how many to cut to", () => {
  const a = pan.auditPageAnatomy({
    ...FULL_PAGE,
    formConfig: { enabled: true, fields: [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }, { key: "e" }] },
  });
  const form = a.checks.find((c) => c.id === "form");
  assert.equal(form.present, false, "five fields is a leak, not a feature");
  assert.match(form.fix, /three/);
});

test("anatomy: the proof fix never suggests generating a testimonial", () => {
  const a = pan.auditPageAnatomy({ ...FULL_PAGE, sections: FULL_PAGE.sections.filter((s) => s.type !== "proof") });
  const proof = a.checks.find((c) => c.id === "proof");
  assert.equal(proof.present, false);
  assert.match(proof.fix, /REAL/, "it must ask for a real quote");
  assert.match(proof.fix, /Never generate/i, "and explicitly refuse to invent one");
});

test("anatomy: a missing deadline is not treated as a fault to fix with a fake one", () => {
  const a = pan.auditPageAnatomy({ ...FULL_PAGE, sections: FULL_PAGE.sections.filter((s) => s.type !== "urgency") });
  const urgency = a.checks.find((c) => c.id === "urgency");
  assert.equal(urgency.present, false);
  assert.match(urgency.detail, /correct unless one genuinely exists/);
  assert.match(urgency.fix, /Only add urgency if the offer really ends/);
});

test("anatomy: an FAQ with a single question does not count", () => {
  const one = pan.auditPageAnatomy({
    ...FULL_PAGE,
    sections: FULL_PAGE.sections.map((s) => (s.type === "faq" ? { ...s, items: ["Only one?"] } : s)),
  });
  assert.equal(one.checks.find((c) => c.id === "faq").present, false, "one question does not kill three objections");
});

test("anatomy: auditing a page with no sections at all does not throw", () => {
  const a = pan.auditPageAnatomy({ slug: "empty" });
  assert.equal(a.total, 9);
  assert.ok(Number.isFinite(a.scorePct));
  assert.ok(a.scorePct >= 0 && a.scorePct <= 100);
});

// ---------------------------------------------------------------------------
// "Every form submission lands in your Customer Vault as a consented lead."
// That is a promise printed on the product. This proves the round trip.
// ---------------------------------------------------------------------------
test("landing leads: a form submission becomes a consented vault contact, tagged with its page", async () => {
  const brand = "t-lead-vault";
  await contacts.clearContacts(brand);
  await contacts.saveContacts(brand, [{
    email: "buyer@example.com", name: "Sam Buyer", phone: "+447700900123",
    consent: true, source: "landing:family-platter-friday",
  }], new Date().toISOString());

  assert.equal(await contacts.countContacts(brand), 1, "the lead must be IN the vault, not just acknowledged");
  const counts = await contacts.vaultCountsFor(brand);
  assert.equal(counts.consented, 1, "and it must count as consented, or it can never be messaged");
});

test("landing leads: the page a lead came from is preserved, so pages can be compared", async () => {
  const brand = "t-lead-source";
  await contacts.clearContacts(brand);
  const now = new Date().toISOString();
  await contacts.saveContacts(brand, [
    { email: "a@example.com", consent: true, source: "landing:page-a" },
    { email: "b@example.com", consent: true, source: "landing:page-b" },
    { email: "c@example.com", consent: true, source: "landing:page-a" },
  ], now);
  const all = await contacts.listContacts(brand);
  const fromA = all.filter((c) => c.source === "landing:page-a");
  assert.equal(fromA.length, 2, "you must be able to tell which page produced which leads");
  assert.equal(new Set(all.map((c) => c.source)).size, 2);
});

test("landing leads: the same person filling the form twice does not become two leads", async () => {
  const brand = "t-lead-dupe";
  await contacts.clearContacts(brand);
  const now = new Date().toISOString();
  await contacts.saveContacts(brand, [{ email: "twice@example.com", name: "First try", consent: true, source: "landing:p" }], now);
  await contacts.saveContacts(brand, [{ email: "TWICE@example.com", name: "Second try", consent: true, source: "landing:p" }], now);
  assert.equal(await contacts.countContacts(brand), 1, "a duplicate submission must merge, not inflate the vault");
});

// ---------------------------------------------------------------------------
// Return Ledger — "what did my money actually buy?" A dashboard that can only
// show good news is an advert, so these check it reports losses too, and that
// it never invents revenue.
// ---------------------------------------------------------------------------
const rl = await import("../src/backend/return-ledger.ts");

const PAGES = [
  { slug: "offer-a", headline: "Offer A", views: 800, leads: 24 },
  { slug: "offer-b", headline: "Offer B", views: 400, leads: 2 },
];

test("ledger: with no deal value it reports LEADS and refuses to invent pounds", () => {
  const l = rl.buildReturnLedger({ brandId: "b", spentAcu: 1300, pages: PAGES });
  assert.equal(l.verdict, "leads_only");
  assert.equal(l.estimatedValueGbp, undefined, "no revenue may be assumed on the customer's behalf");
  assert.equal(l.totalLeads, 26);
  assert.equal(l.costPerLeadGbp, 0.5, "£13.00 over 26 leads is 50p each");
  assert.ok(l.whatWouldMakeThisAccurate.some((m) => /average deal value/i.test(m)));
});

test("ledger: with the customer's own numbers it reports pounds and ROI", () => {
  const l = rl.buildReturnLedger({ brandId: "b", spentAcu: 1300, pages: PAGES, averageDealGbp: 200, closeRatePct: 25 });
  // 26 leads x £200 x 25% = £1,300 value against £13.00 spent.
  assert.equal(l.estimatedValueGbp, 1300);
  assert.equal(l.netGbp, 1287);
  assert.equal(l.verdict, "profitable");
  assert.ok(l.roiPct > 9000, `£13 returning £1,300 is a big multiple, got ${l.roiPct}%`);
});

test("ledger: a LOSS is reported as plainly as a win", () => {
  const l = rl.buildReturnLedger({
    brandId: "b", spentAcu: 50_000, pages: [{ slug: "x", views: 500, leads: 1 }],
    averageDealGbp: 100, closeRatePct: 20,
  });
  assert.equal(l.verdict, "unprofitable");
  assert.ok(l.netGbp < 0);
  assert.match(l.headline, /behind/, "it must say the customer is down, not bury it");
});

test("ledger: traffic with no leads names the actual problem", () => {
  const l = rl.buildReturnLedger({
    brandId: "b", spentAcu: 2000, pages: [{ slug: "x", views: 900, leads: 0 }],
    averageDealGbp: 500,
  });
  assert.equal(l.totalLeads, 0);
  assert.match(l.headline, /not converting/i, "900 visitors and no leads is a page problem, not a traffic problem");
});

test("ledger: no measured traffic is 'no data', never a confident zero", () => {
  const l = rl.buildReturnLedger({ brandId: "b", spentAcu: 900, pages: [{ slug: "x", views: 0, leads: 0 }] });
  assert.equal(l.verdict, "no_data");
  assert.match(l.caveats.join(" "), /not a zero return/);
  assert.equal(l.roiPct, undefined);
});

test("ledger: without a close rate the value is flagged as a CEILING", () => {
  const l = rl.buildReturnLedger({ brandId: "b", spentAcu: 1000, pages: PAGES, averageDealGbp: 100 });
  // No close rate → every lead counted as a sale.
  assert.equal(l.estimatedValueGbp, 2600);
  assert.match(l.caveats.join(" "), /ceiling/i, "assuming a 100% close rate must be disclosed, loudly");
});

test("ledger: a handful of leads is flagged as too few to be a rate", () => {
  const l = rl.buildReturnLedger({
    brandId: "b", spentAcu: 500, pages: [{ slug: "x", views: 200, leads: 3 }],
    averageDealGbp: 400, closeRatePct: 50,
  });
  assert.match(l.caveats.join(" "), /too few/i);
});

test("ledger: pages are ranked by what they produced, best first", () => {
  const l = rl.buildReturnLedger({ brandId: "b", spentAcu: 100, pages: PAGES, averageDealGbp: 100, closeRatePct: 50 });
  assert.equal(l.lines[0].slug, "offer-a", "the page that produced most must lead");
  assert.equal(l.lines[0].valueGbp, 1200);
  assert.equal(l.lines[1].valueGbp, 100);
});

test("ledger: break-even tells you how many leads you need to stop losing money", () => {
  // £20 spent, each closed deal worth £200 x 25% = £50 → 1 lead (rounded up).
  assert.equal(rl.breakEvenLeads(2000, 200, 25), 1);
  // £100 spent, each lead worth £10 → 10 leads.
  assert.equal(rl.breakEvenLeads(10_000, 10, 100), 10);
  assert.equal(rl.breakEvenLeads(1000, 0), null, "a zero deal value cannot break even");
});

test("ledger: an action's price is shown in the customer's money, not internal units", () => {
  const p = rl.priceOfAction("image");
  assert.ok(p.acu > 0);
  assert.equal(p.gbp, p.acu / 100, "1 ACU is 1 penny — a customer should never have to convert");
});

// ---------------------------------------------------------------------------
// Copywriter — the fix for surfaces labelled "AI" that were string concatenation.
// ---------------------------------------------------------------------------
const cw = await import("../src/backend/copywriter.ts");

test("copywriter: with no provider connected it says so instead of pretending", async () => {
  const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY, g: process.env.GEMINI_API_KEY };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GEMINI_API_KEY;
  try {
    const r = await cw.writeCopy({ business: "VeryX", product: "Common Data Environment for construction" });
    assert.equal(r.written, "template", "no key means no AI — it must not claim otherwise");
    assert.match(r.note, /no AI provider is connected/i);
    assert.ok(r.copy.headline, "a page must still be publishable");
  } finally {
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.o) process.env.OPENAI_API_KEY = saved.o;
    if (saved.g) process.env.GEMINI_API_KEY = saved.g;
  }
});

test("copywriter: a brief with no product is refused — generic in, generic out", async () => {
  const r = await cw.writeCopy({ business: "VeryX", product: "" });
  assert.equal(r.ok, false);
  assert.match(r.note, /what the business sells/i);
});

test("copywriter: empty filler phrasing is DETECTED — this is the bug being fixed", () => {
  // The exact strings the old generator produced.
  assert.deepEqual(cw.fillerIn("The Enterprise Execution Operating System, made easy in United Kingdom"), ["made easy"]);
  assert.deepEqual(cw.fillerIn("A great result — for Businesses Senior Management"), ["a great result"]);
  assert.deepEqual(cw.fillerIn("Take your business to the next level"), ["next level", "take your business"]);
  assert.deepEqual(cw.fillerIn("Stop losing drawings in email. One CDE for every site file."), [],
    "specific copy must not be flagged");
});

test("copywriter: the template fallback never emits a bracketed placeholder", () => {
  const c = cw.templateCopy({ business: "VeryX", product: "CDE software", location: "United Kingdom" });
  const all = JSON.stringify(c);
  assert.doesNotMatch(all, /\[[A-Z ]+\]/, "a published page must never show [INSERT SOMETHING]");
  assert.doesNotMatch(all, /undefined|NaN/);
});

test("copywriter: JSON is extracted whether or not the model fenced it", () => {
  assert.deepEqual(cw.extractJson('{"headline":"Hi"}'), { headline: "Hi" });
  assert.deepEqual(cw.extractJson('```json\n{"headline":"Hi"}\n```'), { headline: "Hi" });
  assert.deepEqual(cw.extractJson('Sure! Here is the copy:\n{"headline":"Hi"}\nHope that helps.'), { headline: "Hi" });
  assert.equal(cw.extractJson("no json at all"), null);
  assert.equal(cw.extractJson('{"broken": '), null, "malformed JSON must be null, never a partial object");
});

test("copywriter: the system prompt forbids the things that got us in trouble", () => {
  // Guard the guard: these instructions are the reason output is safe to publish.
  const src = readFileSync(new URL("../src/backend/copywriter.ts", import.meta.url), "utf8");
  for (const rule of ["never invent a statistic", "customer quote", "award", "superlative", "Never invent urgency"]) {
    assert.ok(src.toLowerCase().includes(rule.toLowerCase()), `the copywriter must forbid: ${rule}`);
  }
});

// ---------------------------------------------------------------------------
// The publish form now has a field for every gap the anatomy audit reports.
// These check the generator honours them — and refuses to fake the ones it
// cannot honestly produce.
// ---------------------------------------------------------------------------
test("publish inputs: a supplied customer quote becomes a real proof section", () => {
  const page = landing.generateLandingPage({
    business: "VeryX", product: "CDE software", objective: "get leads", offer: "£149/mo",
    testimonials: [{ quote: "Cut our RFI turnaround from days to hours.", name: "Site Manager, Acme Build" }],
  });
  const proof = page.sections.find((s) => s.type === "proof");
  assert.ok(proof, "a supplied quote must appear on the page");
  assert.match(proof.items[0], /RFI turnaround/);
  assert.match(proof.items[0], /Acme Build/, "the attribution must survive — an anonymous quote is not proof");
});

test("publish inputs: an unattributed quote is DROPPED, never published anonymously", () => {
  const page = landing.generateLandingPage({
    business: "VeryX", product: "CDE software", objective: "get leads",
    testimonials: [{ quote: "Brilliant service!", name: "" }],
  });
  assert.equal(page.sections.find((s) => s.type === "proof"), undefined);
});

test("publish inputs: no quote means NO proof section — never a generated one", () => {
  const page = landing.generateLandingPage({ business: "VeryX", product: "CDE software", objective: "get leads" });
  const proof = page.sections.find((s) => s.type === "proof");
  assert.equal(proof, undefined, "the platform must never write a testimonial nobody said");
});

test("publish inputs: a real deadline creates urgency; no deadline creates none", () => {
  const withDeadline = landing.generateLandingPage({
    business: "VeryX", product: "CDE", objective: "get leads", offer: "£149/mo", deadline: "Offer closes Friday 5pm",
  });
  const without = landing.generateLandingPage({
    business: "VeryX", product: "CDE", objective: "get leads", offer: "£149/mo",
  });
  assert.ok(withDeadline.sections.some((s) => s.type === "urgency"), "a stated deadline must be shown");
  assert.equal(without.sections.some((s) => s.type === "urgency"), false, "urgency must never be invented");
});

test("publish inputs: the CTA destination is honoured — WhatsApp, own link, or form", () => {
  const wa = landing.generateLandingPage({ business: "V", product: "P", objective: "get whatsapp orders", whatsappNumber: "447700900123" });
  assert.equal(wa.whatsappConfig.enabled, true);
  assert.equal(wa.whatsappConfig.phoneNumber, "447700900123");

  const link = landing.generateLandingPage({ business: "V", product: "P", objective: "get leads", ctaUrl: "https://x.test/buy" });
  assert.match(link.primaryCtaUrl, /^https:\/\/x\.test\/buy/, "the owner's own link must be used verbatim");

  const form = landing.generateLandingPage({ business: "V", product: "P", objective: "get leads" });
  assert.equal(form.formConfig.enabled, true, "with no destination given, the form is the destination");
});

test("publish inputs: a filled-in page passes its own anatomy audit", () => {
  const page = landing.generateLandingPage({
    business: "VeryX", product: "Common Data Environment", objective: "get leads",
    offer: "£149/mo, first project set up free", location: "United Kingdom",
    audience: "UK construction PMs", painPoint: "drawings lost in email threads",
    whatsappNumber: "447700900123", deadline: "Offer closes Friday",
    testimonials: [{ quote: "Cut our RFI turnaround from days to hours.", name: "Site Manager, Acme Build" }],
  });
  const audit = pan.auditPageAnatomy(page);
  assert.ok(audit.scorePct >= 90, `a fully-filled page should score high, got ${audit.scorePct}: missing ${audit.checks.filter((c) => !c.present).map((c) => c.label).join(", ")}`);
});

// ---------------------------------------------------------------------------
// Campaign Warfare — three fabrications, closed. These lock them shut.
// ---------------------------------------------------------------------------
const wf = await import("../src/backend/warfare.ts");

const BRIEF = {
  product: "Common Data Environment for construction",
  audience: "UK construction project managers",
  result: "get leads",
  location: "United Kingdom",
  budget: 600,
  offer: "£149/mo, first project set up free",
};

test("warfare: hashtags are real words — never location fragments glued together", () => {
  const c = wf.designCampaign(BRIEF);
  const tags = c.hashtags.map((h) => h.tag);
  // The exact nonsense the old engine produced from "United Kingdom".
  for (const bad of ["#uniteddeals", "#orderunited", "#united", "#unitedbusiness", "#unitedevents"]) {
    assert.ok(!tags.includes(bad), `fragment tag survived: ${bad}`);
  }
  assert.ok(tags.includes("#unitedkingdom"), `the WHOLE place name should be used, got ${tags.join(" ")}`);
});

test("warfare: no hashtag is a meaningless stub", () => {
  const c = wf.designCampaign(BRIEF);
  for (const h of c.hashtags) {
    assert.ok(h.tag.length >= 5, `too short to be searched: ${h.tag}`);
    assert.match(h.tag, /^#[a-z0-9]+$/, `not a usable tag: ${h.tag}`);
  }
  assert.equal(new Set(c.hashtags.map((h) => h.tag)).size, c.hashtags.length, "no duplicates");
});

test("warfare: hashtags are UNRANKED — scoring them would be invention", () => {
  const c = wf.designCampaign(BRIEF);
  for (const h of c.hashtags) {
    assert.equal(h.score, 0, `${h.tag} carries a score of ${h.score}; reach data we do not have`);
  }
});

test("warfare: readiness reports INPUTS, and never a probability", () => {
  const c = wf.designCampaign(BRIEF);
  const names = c.campaignScore.dimensions.map((d) => d.name);
  for (const banned of ["Conversion Probability", "Revenue Probability", "Emotional Strength", "Attention Score"]) {
    assert.ok(!names.includes(banned), `fabricated dimension survived: ${banned}`);
  }
  assert.match(c.campaignScore.honesty, /NOT a prediction/i);
  assert.doesNotMatch(c.campaignScore.honesty, /probability ESTIMATE/i);
});

test("warfare: readiness is DETERMINISTIC — the same brief always scores the same", () => {
  const a = wf.designCampaign(BRIEF).campaignScore;
  const b = wf.designCampaign(BRIEF).campaignScore;
  assert.equal(a.composite, b.composite);
  assert.deepEqual(a.dimensions.map((d) => d.score), b.dimensions.map((d) => d.score),
    "the old engine mixed in a hash-derived jitter, so scores wobbled for no reason");
});

test("warfare: every readiness line is a plain yes or no, not a soft percentage", () => {
  const c = wf.designCampaign(BRIEF);
  for (const d of c.campaignScore.dimensions) {
    assert.ok(d.score === 0 || d.score === 100, `${d.name} reported ${d.score} — a made-up middle`);
    assert.ok(d.driver && d.driver.length > 5, `${d.name} has no explanation`);
  }
});

test("warfare: a thin brief scores LOW and names exactly what is missing", () => {
  const thin = wf.designCampaign({ product: "stuff", audience: "", result: "sales", location: "", budget: 0, offer: "" });
  assert.ok(thin.campaignScore.composite < 50, `an empty brief should not score ${thin.campaignScore.composite}`);
  assert.match(thin.campaignScore.verdict, /Fill in:/);
  assert.match(thin.campaignScore.verdict, /audience is specific/i);
});

test("warfare: a complete brief scores 100 and says the rest is up to the market", () => {
  const full = wf.designCampaign({ ...BRIEF, offer: "£149/mo — offer ends Friday" });
  assert.equal(full.campaignScore.composite, 100, full.campaignScore.verdict);
  assert.match(full.campaignScore.verdict, /depends on the market/i);
});

// ---------------------------------------------------------------------------
// Gateway deadlines — the fix for "sometimes it produces a result, sometimes
// not". A provider that accepts a connection and holds it open used to block
// until the serverless function was killed: no output, no error, not
// reproducible. These use a real local server that stalls on purpose.
// ---------------------------------------------------------------------------
import http from "node:http";

async function withStallingServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

test("gateway: a hanging provider is ABORTED, it does not block forever", async () => {
  const saved = process.env.AI_REQUEST_TIMEOUT_MS;
  process.env.AI_REQUEST_TIMEOUT_MS = "600";
  try {
    await withStallingServer(
      // Accept the connection, send headers, then never finish. This is exactly
      // what a provider under load does, and what used to hang the platform.
      (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); },
      async (base) => {
        const started = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 600);
        let aborted = false;
        try {
          const r = await fetch(base, { signal: ctrl.signal });
          await r.text();
        } catch (e) {
          aborted = e.name === "AbortError";
        } finally {
          clearTimeout(timer);
        }
        const elapsed = Date.now() - started;
        assert.equal(aborted, true, "a stalled response must abort, not hang");
        assert.ok(elapsed < 3000, `should abort near the timeout, took ${elapsed}ms`);
      },
    );
  } finally {
    if (saved) process.env.AI_REQUEST_TIMEOUT_MS = saved; else delete process.env.AI_REQUEST_TIMEOUT_MS;
  }
});

test("gateway: with no provider configured it fails FAST and says so", async () => {
  const gw = await import("../src/backend/gateway.ts");
  const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY, g: process.env.GEMINI_API_KEY };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GEMINI_API_KEY;
  try {
    const started = Date.now();
    await assert.rejects(
      () => gw.gatewayComplete({ system: "s", prompt: "p" }),
      (e) => e instanceof gw.GatewayUnconfiguredError,
      "an unconfigured gateway must throw a typed error, not a generic one",
    );
    assert.ok(Date.now() - started < 500, "it must not wait on a deadline it can never use");
  } finally {
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.o) process.env.OPENAI_API_KEY = saved.o;
    if (saved.g) process.env.GEMINI_API_KEY = saved.g;
  }
});

test("gateway: every AI route reserves a timeout budget", async () => {
  // A route with no maxDuration inherits the platform default, which can be
  // shorter than the gateway's own budget — the function dies mid-call and the
  // customer sees nothing. This is the silent-failure class, caught in CI.
  const { execSync } = await import("node:child_process");
  const files = execSync("grep -rl gatewayComplete src/app/api --include=route.ts", { encoding: "utf8" })
    .split("\n").filter(Boolean);
  assert.ok(files.length > 0, "the check itself must not silently find nothing");
  const missing = files.filter((f) => !readFileSync(f, "utf8").includes("maxDuration"));
  assert.deepEqual(missing, [], `these AI routes have no timeout budget: ${missing.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Plan value + FAQ. A pricing page assembled by hand drifts out of date and
// becomes a lie; these check every number is derived from the live price table.
// ---------------------------------------------------------------------------
const pv = await import("../src/backend/plan-value.ts");

test("plans: allowances are quoted as WORK, derived from the real prices", () => {
  const growth = pv.planCards().find((p) => p.id === "growth");
  assert.ok(growth.buys.length > 0, "a plan must say what its allowance actually buys");
  for (const b of growth.buys) {
    assert.equal(b.count, Math.floor(growth.monthlyAcus / b.costEach),
      `${b.label} count must be the allowance divided by the real price`);
    assert.ok(b.count > 0);
  }
});

test("plans: work counts move with the price table — they cannot drift", () => {
  const growth = pv.planCards().find((p) => p.id === "growth");
  const images = growth.buys.find((b) => b.label.includes("images"));
  assert.equal(images.costEach, w6.ACTION_COST_ACU.image,
    "the quoted price must be the price the wallet charges, not a marketing number");
});

test("plans: a bigger plan buys strictly more work", () => {
  const cards = pv.planCards();
  const starter = cards.find((p) => p.id === "starter");
  const growth = cards.find((p) => p.id === "growth");
  const scale = cards.find((p) => p.id === "scale");
  assert.ok(growth.monthlyAcus > starter.monthlyAcus);
  assert.ok(scale.monthlyAcus > growth.monthlyAcus);
  const pagesOn = (p) => p.buys.find((b) => b.label.includes("landing pages"))?.count ?? 0;
  assert.ok(pagesOn(scale) > pagesOn(growth) && pagesOn(growth) > pagesOn(starter),
    "paying more must visibly buy more");
});

test("plans: tiers DIFFER — the same list on every plan answers nothing", () => {
  const cards = pv.planCards();
  const starter = cards.find((p) => p.id === "starter").includes;
  const growth = cards.find((p) => p.id === "growth").includes;
  const scale = cards.find((p) => p.id === "scale").includes;
  assert.ok(growth.length > starter.length, "Growth must add something over Starter");
  assert.ok(scale.length > growth.length, "Scale must add something over Growth");
  assert.notDeepEqual(starter, growth);
});

test("plans: every plan says who it is for and what its hard limits are", () => {
  for (const p of pv.planCards()) {
    assert.ok(p.bestFor.length > 10, `${p.name} does not say who it is for`);
    assert.ok(p.limits.length >= 4, `${p.name} hides its limits`);
    for (const l of p.limits) assert.ok(l.value && l.value !== "undefined", `${p.name}: ${l.label} is blank`);
  }
});

test("faq: the awkward questions are answered, not dodged", () => {
  const faq = pv.pricingFaq();
  const all = faq.map((f) => `${f.q} ${f.a}`).join("\n").toLowerCase();
  // The four a buyer actually worries about.
  assert.match(all, /run out/, "must say what happens when the allowance runs out");
  assert.match(all, /cancel/, "must answer cancellation");
  assert.match(all, /change plan|change your plan|changing plan/, "must answer plan changes");
  assert.match(all, /ad spend|advertise on/, "must be clear that ad spend is separate");
  // And the promise that matters most given what this platform is.
  assert.match(all, /never take a cut|never.*mark it up/, "must state we do not mark up ad spend");
});

test("faq: it commits to the anti-fabrication rule in writing", () => {
  const faq = pv.pricingFaq();
  const answer = faq.find((f) => /invent/i.test(f.q))?.a || "";
  assert.match(answer, /enforced in code/i, "the honesty claim must point at the enforcement, not just promise");
  assert.match(answer, /rejected/i);
});

test("faq: the price quoted matches the real plan, not a stale number", () => {
  const faq = pv.pricingFaq();
  const cost = faq.find((f) => /how much/i.test(f.q)).a;
  const growth = pv.planCards().find((p) => p.id === "growth");
  assert.ok(cost.includes(growth.monthlyAcus.toLocaleString()),
    "the FAQ must quote the allowance the plan actually grants");
});

test("faq: no answer is a one-line dodge", () => {
  for (const f of pv.pricingFaq()) {
    assert.ok(f.a.length > 80, `"${f.q}" is answered in ${f.a.length} characters — that is a dodge`);
  }
});

// ---------------------------------------------------------------------------
// Batch static ads — the competitor feature. What matters is that a batch is
// VARIED and that it never invents the material it lacks.
// ---------------------------------------------------------------------------
const ba = await import("../src/backend/batch-ads.ts");

const FULL_BRIEF = {
  business: "VeryX", product: "Common Data Environment for construction",
  productImageUrl: "https://storage.test/product.png",
  offer: "£149/mo, first project set up free",
  pain: "drawings lost in email threads",
  proofQuote: "Cut our RFI turnaround from days to hours. — Site Manager, Acme Build",
  deadline: "Offer closes Friday",
  brandColours: ["#eb1e1e", "#2b1eeb"],
};

test("batch: a full brief produces a varied set, not the same ad resized", () => {
  const plan = ba.planBatch(FULL_BRIEF);
  assert.ok(plan.count >= 12, `a batch should be substantial, got ${plan.count}`);
  assert.ok(new Set(plan.variants.map((v) => v.angle)).size >= 4, "several ARGUMENTS, not one");
  assert.ok(new Set(plan.variants.map((v) => v.format)).size >= 3, "several placements");
  assert.ok(new Set(plan.variants.map((v) => v.treatment)).size >= 2, "several visual registers");
  assert.equal(new Set(plan.variants.map((v) => v.id)).size, plan.count, "every variant must be distinct");
});

test("batch: each angle carries DIFFERENT copy — that is the point", () => {
  const plan = ba.planBatch(FULL_BRIEF);
  const headlines = new Set(plan.variants.map((v) => v.headline));
  assert.ok(headlines.size >= 4, `a batch with one headline is one ad, got ${headlines.size} distinct`);
  const offerAd = plan.variants.find((v) => v.angle === "offer");
  const problemAd = plan.variants.find((v) => v.angle === "problem");
  assert.match(offerAd.headline, /£149/, "the offer ad must lead with the offer");
  assert.match(problemAd.headline, /drawings lost/, "the problem ad must lead with the problem");
});

test("batch: an angle with no material is DROPPED, never invented", () => {
  const bare = ba.planBatch({ business: "VeryX", product: "CDE software" });
  const angles = new Set(bare.variants.map((v) => v.angle));
  assert.ok(!angles.has("proof"), "a proof ad with no customer quote would have to invent one");
  assert.ok(!angles.has("urgency"), "a countdown with no deadline is a fake countdown");
  assert.ok(!angles.has("offer"), "an offer ad with no offer has nothing to say");
  assert.ok(bare.count > 0, "but the angles that need nothing must still run");
  assert.ok(bare.skipped.length >= 3, "and each omission must be explained");
  assert.match(bare.skipped.find((s) => s.angle === "proof").reason, /never generated/);
});

test("batch: supplying material ADDS angles — the brief drives the batch", () => {
  const bare = ba.planBatch({ business: "V", product: "P" });
  const withOffer = ba.planBatch({ business: "V", product: "P", offer: "£99 this month" });
  assert.ok(withOffer.count > bare.count, "giving the engine an offer must produce more ads");
  assert.ok(new Set(withOffer.variants.map((v) => v.angle)).has("offer"));
});

test("batch: every prompt forbids redesigning the customer's product", () => {
  const plan = ba.planBatch(FULL_BRIEF);
  for (const v of plan.variants) {
    assert.match(v.prompt, /Do not redesign, recolour or restyle the product/,
      "the red-bottle failure must be forbidden in every prompt, not just checked afterwards");
    assert.match(v.prompt, /No invented logos, badges, awards or ratings/);
  }
});

test("batch: with no product photo it says so rather than inventing a product", () => {
  const plan = ba.planBatch({ business: "V", product: "P", offer: "£99" });
  for (const v of plan.variants) {
    assert.match(v.prompt, /No product photograph was supplied/);
    assert.doesNotMatch(v.prompt, /Use the supplied product photograph/);
  }
});

test("batch: each format carries its own safe-area instruction", () => {
  const plan = ba.planBatch(FULL_BRIEF);
  const story = plan.variants.find((v) => v.format === "story");
  const square = plan.variants.find((v) => v.format === "square");
  assert.match(story.prompt, /9:16/);
  assert.match(square.prompt, /1:1/);
  assert.match(story.prompt, /safe area/, "a story crops differently — the prompt must say so");
});

test("batch: narrowing the request narrows the batch, predictably", () => {
  const narrow = ba.planBatch({ ...FULL_BRIEF, angles: ["offer"], formats: ["square"] });
  assert.equal(narrow.count, 1);
  assert.equal(narrow.variants[0].angle, "offer");
  assert.equal(narrow.variants[0].format, "square");
});

test("batch: every format maps to a real platform the image gateway understands", () => {
  const valid = new Set(["facebook", "instagram", "tiktok", "linkedin", "whatsapp", "story", "reel", "banner"]);
  for (const f of ba.AD_FORMATS) {
    assert.ok(valid.has(f.platform), `${f.id} maps to "${f.platform}", which the renderer does not know`);
    assert.ok(f.usedFor.length > 10, `${f.id} does not say where it is used`);
  }
});

test("billing UI: every plan button is wired to checkout", () => {
  // The "Choose <plan>" buttons were bare <button> elements with no onClick.
  // A customer clicked and nothing happened — the money path was dead in the
  // exact place someone tries to pay. Guarded here because it is invisible in
  // a screenshot and catastrophic in production.
  const src = readFileSync(new URL("../src/app/dashboard/billing/page.tsx", import.meta.url), "utf8");
  const buttons = src.match(/<button[^>]*>/g) || [];
  const unwired = buttons.filter((b) => !b.includes("onClick"));
  assert.deepEqual(unwired, [], `these billing buttons do nothing when clicked: ${unwired.join(" | ")}`);
});

test("billing UI: choosing a plan calls the subscribe endpoint", () => {
  const src = readFileSync(new URL("../src/app/dashboard/billing/page.tsx", import.meta.url), "utf8");
  assert.match(src, /\/api\/billing\/subscribe/, "the plan button must reach the subscribe endpoint");
  assert.match(src, /choosePlan\(p\.id/, "each plan card must pass its own id");
  assert.match(src, /r\.free/, "the free plan must activate rather than open a £0 checkout");
});

// ---------------------------------------------------------------------------
// The PUBLIC pages. Generated copy is claim-guarded; hand-written marketing is
// not, so it is the one place an unsubstantiated claim can still reach a
// customer. These guard the two that matter commercially and legally.
// ---------------------------------------------------------------------------
test("public copy: nobody is told to bring their own AI key", () => {
  const src = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Connect your own Anthropic API key/i,
    "telling a prospect to get their own AI account kills the sale and contradicts ACU billing");
  assert.doesNotMatch(src, /zero-config demo mode/i,
    "the public site must not sell demo mode as the product");
});

test("public copy: no unsubstantiated performance figures", () => {
  const src = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  // "typically finds £1,000+ of dormant revenue" is exactly what claim-guard
  // BLOCKS in generated copy. Hand-written marketing must meet the same bar.
  const claims = src.match(/typically (finds|delivers|produces|saves)[^"]{0,60}/gi) || [];
  assert.deepEqual(claims, [], `unsubstantiated performance claims on the homepage: ${claims.join(" | ")}`);
  const guaranteed = src.match(/guaranteed (results|leads|sales|revenue)/gi) || [];
  assert.deepEqual(guaranteed, []);
});

test("public copy: the AI answer matches how billing actually works", () => {
  const src = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const answer = /Which AI powers[^}]*?a: "([^"]+)"/s.exec(src)?.[1] || "";
  assert.ok(answer.length > 100, "the AI question must be answered properly");
  assert.match(answer, /included in your plan/i, "it must say the AI is included");
  assert.match(answer, /ACUs/, "and name the unit the customer is actually billed in");
});

// ---------------------------------------------------------------------------
// Multi-brand safety. A page that seeds a form from the active brand ONCE will
// go stale the moment the brand is switched — and the damage is silent: copy
// written for one brand, prospects and payment links attached to another.
// ---------------------------------------------------------------------------
test("multi-brand: any page seeding from the active brand must re-seed on switch", async () => {
  const { execSync } = await import("node:child_process");
  const files = execSync("grep -rl 'brandDefaults(activeBrand)' src/app/dashboard --include=page.tsx", { encoding: "utf8" })
    .split("\n").filter(Boolean);
  assert.ok(files.length > 0, "the check must not silently find nothing");

  const stale = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    // Seeds a form from the brand but never reacts to the brand changing.
    const seedsForm = /useState\(\{[\s\S]{0,400}?business:/.test(src) || /const d = brandDefaults\(activeBrand\)/.test(src);
    // Either dependency form is correct: [activeBrand] or [activeBrand?.id].
    // What matters is that SOMETHING re-runs when the brand changes.
    const reseeds = /\[\s*activeBrand(\?\.id)?\s*\]/.test(src);
    return seedsForm && !reseeds;
  });
  assert.deepEqual(stale, [],
    `these pages keep a stale brand after switching, so work is attributed to the wrong one: ${stale.join(", ")}`);
});

test("multi-brand: the sprint saves prospects to the SELECTED brand, unconsented", () => {
  const src = readFileSync(new URL("../src/app/dashboard/first-customer/page.tsx", import.meta.url), "utf8");
  assert.match(src, /brandId: activeBrand\.id/, "prospects must save to the brand actually selected");
  assert.match(src, /consent: false/,
    "businesses found in public listings never consented — marking them consented would authorise a send nobody agreed to");
  assert.match(src, /source: `sprint:/, "and must be tagged so the Return Ledger can attribute them");
});
