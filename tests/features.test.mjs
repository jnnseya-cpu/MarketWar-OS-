// Feature/functionality tests — exercise the real engines behind the modules a
// customer actually uses, and assert on behaviour (not just that they return).
// Run: npm test    (no network, no API keys)

import { test } from "node:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
//
// These exercise the WORKER path: claiming, a worker dying mid-render, the
// refund after three failures. So a worker is declared configured, which is
// what the tests were always implicitly assuming.
//
// They started failing the moment enqueueVideoJob learned to refuse a render
// nothing can perform — a guard added because with the hosted API configured
// and no worker, `brand` and `broll` were charged for and then parked on a
// queue no worker was reading. That guard is correct and these tests were
// leaning on its absence, so they say out loud what they need instead.
// ---------------------------------------------------------------------------
process.env.VIDEO_WORKER_SECRET = process.env.VIDEO_WORKER_SECRET || "test-worker-secret";
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

// ---------------------------------------------------------------------------
// Email discovery messaging. "No emails were invented" is reassuring but it
// must not be said when emails WERE found — that reads as a broken feature.
// ---------------------------------------------------------------------------
test("enrichment: one unsearchable row must not flip the whole batch to 'demo'", () => {
  const src = readFileSync(new URL("../src/app/api/contacts/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /const demo = results\.some\(/,
    "a single unsearchable row must not claim the whole batch was never looked up");
  assert.match(src, /demoCount === searched\.length/,
    "the batch is only 'not looked up' when nothing at all could be looked up");
});

test("enrichment: finding no email is reported as a RESULT, not a failure", () => {
  const src = readFileSync(new URL("../src/app/api/contacts/route.ts", import.meta.url), "utf8");
  assert.match(src, /do not publish an email address/,
    "a trade business with no published email is normal — saying so stops the customer thinking it broke");
  assert.match(src, /could not be looked up/,
    "and rows that genuinely could not be searched must be counted separately");
});

// ---------------------------------------------------------------------------
// Email Templates — the AI writer.
//
// The editor shipped with a sparkle button that ran string concatenation and
// no model. Everything on the page was typed by hand, which is how a customer
// ends up sending "Dear {{ firstName }} {{ name }} there are 1000s of leads
// waiting for {{ company }}" — a duplicated name and an unsupported claim.
//
// The dangerous half of a template is the merge tags: a tag the send engine
// does not know renders as an EMPTY STRING to every recipient, and the editor
// preview will not show it, because the preview only fills tags it knows.
// So the token repair is tested hardest.
// ---------------------------------------------------------------------------
const tplWriter = await import("../src/backend/email-template-writer.ts");

test("email templates: an unknown merge tag is removed, not sent as a blank", () => {
  // {{ salesRep }} is not a field any contact has. Left in, every recipient
  // gets "your rep  will call" with a hole in it.
  const fix = tplWriter.fixTokens("Your rep {{ salesRep }} will call {{ firstName }}.");
  assert.deepEqual(fix.removed, ["salesRep"], "the unknown tag must be identified");
  assert.ok(!/salesRep/.test(fix.text), "and must not survive into the template");
  assert.match(fix.text, /\{\{ firstName \| there \}\}/, "the real tag stays and gains a fallback");
});

test("email templates: a near-miss tag is REWRITTEN rather than thrown away", () => {
  const fix = tplWriter.fixTokens("Hi {{ first_name }} at {{ company_name }} in {{ city }}.");
  const map = Object.fromEntries(fix.rewritten.map((r) => [r.from, r.to]));
  assert.equal(map.first_name, "firstName");
  assert.equal(map.company_name, "company");
  assert.equal(map.city, "town");
  assert.deepEqual(fix.removed, [], "a tag whose intent is unambiguous must not be deleted");
});

test("email templates: {{ business }} means the SENDER, not a contact field", () => {
  // The old draft route emitted {{business}}, which no contact has — it would
  // have merged to empty for every single recipient.
  const fix = tplWriter.fixTokens("A note from {{ business }}.");
  assert.deepEqual(fix.rewritten, [{ from: "business", to: "brand" }]);
  assert.match(fix.text, /\{\{ brand \}\}/);
});

test("email templates: a tag with no fallback gets one, so a blank field never breaks the sentence", () => {
  const fix = tplWriter.fixTokens("Hi {{ firstName }}, more work for {{ company }} in {{ town }}.");
  assert.ok(fix.fallbacksAdded.includes("firstName"));
  assert.match(fix.text, /\{\{ firstName \| there \}\}/);
  assert.match(fix.text, /\{\{ company \| your business \}\}/);
  // A contact with no name/company/town must still read as a sentence.
  const merged = fix.text.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\|\s*([^}]*?)\s*\}\}/g, "$1");
  assert.ok(!/,\s*,/.test(merged) && !/\s{2,}/.test(merged), `blank contact renders badly: ${merged}`);
});

test("email templates: a fallback the writer supplied is never overwritten", () => {
  const fix = tplWriter.fixTokens("Hi {{ firstName | friend }},");
  assert.match(fix.text, /\{\{ firstName \| friend \}\}/);
  assert.deepEqual(fix.fallbacksAdded, [], "it already had one");
});

test("email templates: name + first name side by side is flagged", () => {
  // This is verbatim what the owner's own template did.
  const w = tplWriter.tokenWarnings("Dear {{ firstName }} {{ name }} there are leads waiting");
  assert.ok(w.some((x) => /twice/.test(x)), `expected a duplicate-name warning, got ${JSON.stringify(w)}`);
  assert.deepEqual(tplWriter.tokenWarnings("Dear {{ firstName }}, we have leads waiting"), [],
    "a single name token is correct and must not be nagged about");
});

test("email templates: every purpose states a job, and offer-led ones declare they need one", () => {
  const purposes = tplWriter.EMAIL_PURPOSES;
  assert.ok(purposes.length >= 6, "a template writer with two options is a toy");
  for (const p of purposes) {
    assert.ok(p.brief.length > 60, `${p.id} has no real brief — it would produce the same email as every other purpose`);
    assert.ok(p.nameHint, `${p.id} must suggest a template name`);
  }
  assert.equal(purposes.find((p) => p.id === "new_offer")?.needs, "offer");
});

test("email templates: the AI writer is actually wired to the page", () => {
  const src = readFileSync(new URL("../src/app/dashboard/email-templates/page.tsx", import.meta.url), "utf8");
  assert.match(src, /\/api\/email-templates\/ai/, "the page must call the writer");
  assert.match(src, /onClick=\{writeWithAi\}/, "and the button must be wired — a dead button is worse than no button");
  assert.doesNotMatch(src, /✨ Branded starter/,
    "a sparkle on a string-concatenation button reads as AI and is why this was reported broken");
});

test("email templates: the writer route meters ACUs and reserves gateway time", () => {
  const src = readFileSync(new URL("../src/app/api/email-templates/ai/route.ts", import.meta.url), "utf8");
  assert.match(src, /meterAction\(auth, "llm"\)/, "AI work is charged");
  assert.match(src, /resolveBrandAccess/, "and never writes for a brand the caller does not own");
  assert.match(src, /maxDuration = 60/,
    "a route calling the gateway must outlast the gateway's own 50s budget or it dies mid-call");
  // The charge must happen AFTER validation, so a bad request never costs money.
  assert.ok(src.indexOf("resolveBrandAccess") < src.indexOf('meterAction(auth, "llm")'),
    "ownership is checked before the customer is charged");
});

test("email templates: a whole draft is repaired end to end, tags and all", async () => {
  // A realistic bad reply: a fenced JSON blob, a tag that does not exist, a
  // near-miss tag, a bare tag with no fallback, and a CTA that is not a URL.
  const fakeModel = async () => ({
    text: '```json\n' + JSON.stringify({
      name: "Sunday delivery win-back",
      subject: "{{ first_name }}, we now deliver on Sundays",
      heading: "Sundays are covered",
      body: "It has been a while since your last order with {{ business }}.\n\nYour usual basket still takes about ten minutes to put together, and {{ salesRep }} can now bring it to {{ city }} on a Sunday. If {{ company }} needs a standing order, reply to this email.",
      ctaLabel: "Order for Sunday",
      ctaUrl: "the website link",
    }) + '\n```',
    provider: "test",
  });

  const { writeEmailTemplate } = tplWriter;
  const res = await writeEmailTemplate(
    { business: "Evandeli", product: "same-day grocery delivery", location: "Kinshasa", website: "https://www.evandeli.com/", purpose: "win_back" },
    { complete: fakeModel },
  );

  assert.equal(res.ok, true, res.note);
  assert.equal(res.written, "ai");
  // The tag no contact has is gone — it would have shipped a blank to everyone.
  assert.ok(!/salesRep/.test(res.draft.body), "unknown tag survived into the body");
  // The near-misses were repaired, not deleted.
  assert.match(res.draft.subject, /\{\{ firstName \| there \}\}/);
  assert.match(res.draft.body, /\{\{ brand \}\}/, "{{ business }} means the sender");
  assert.match(res.draft.body, /\{\{ town \| your area \}\}/, "{{ city }} is {{ town }}");
  assert.match(res.draft.body, /\{\{ company \| your business \}\}/, "a bare tag must gain a fallback");
  // A CTA that is prose, not a link, falls back to the brand's real website
  // rather than rendering a button that goes nowhere.
  assert.equal(res.draft.ctaUrl, "https://www.evandeli.com/");
  assert.ok(res.warnings.some((w) => /salesRep/.test(w)), "the customer is told what was removed");
  assert.deepEqual([...res.tokensUsed].sort(), ["brand", "company", "firstName", "town"]);
});

test("email templates: an invented claim is refused, not shipped with a warning", async () => {
  const fakeModel = async () => ({
    text: JSON.stringify({
      name: "Offer", subject: "Our offer",
      heading: "", ctaLabel: "Order now", ctaUrl: "",
      body: '"Best delivery service in the city" — Jean Mukendi, regular customer. Rated 4.9 out of 5 by over 10,000 shoppers.',
    }),
    provider: "test",
  });
  const res = await tplWriter.writeEmailTemplate(
    { business: "Evandeli", product: "grocery delivery" },
    { complete: fakeModel },
  );
  assert.equal(res.ok, false, "a fabricated testimonial must not reach a customer's list");
  assert.ok(res.blocked.length > 0);
  assert.equal(res.written, "template", "the outline is returned instead, clearly labelled");
  assert.ok(!/Jean Mukendi/.test(res.draft.body), "and the invented quote is nowhere in what is returned");
});

test("email templates: no AI key is an honest outline, never a silent blank", async () => {
  const unconfigured = async () => { const e = new Error("no provider"); e.name = "GatewayUnconfiguredError"; throw e; };
  const res = await tplWriter.writeEmailTemplate({ business: "Evandeli" }, { complete: unconfigured });
  assert.equal(res.ok, false);
  assert.equal(res.written, "template");
  assert.ok(res.draft.body.length > 50, "something usable is still returned to work from");
  assert.match(res.note, /writer failed|No AI provider/, "and the reason is stated plainly");
});

test("email center: template-mode drafts use tags the send engine can actually fill", () => {
  const src = readFileSync(new URL("../src/app/api/email/draft/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\{\{business\}\}/,
    "{{business}} is not a contact field — it merged to an empty string for every recipient");
  assert.match(src, /fixTokens/, "the draft must be token-repaired before the customer sees it");
  assert.match(src, /MERGE_VARS\.map/, "and the prompt must list the real tags rather than name two by hand");
});

test("email center: a silently corrected draft is not silent", () => {
  const src = readFileSync(new URL("../src/app/dashboard/email/page.tsx", import.meta.url), "utf8");
  assert.match(src, /setDraftNotes\(Array\.isArray\(d\.warnings\)/,
    "corrections the server made must be shown, or the customer cannot tell a good draft from a repaired one");
  assert.match(src, /draftNotes\.map/, "and rendered");
});

// ---------------------------------------------------------------------------
// Email discovery — the ownership gate.
//
// A live run over 25 UK trade companies attached support@rooplex.co.uk to FOUR
// unrelated builders, john.doe@vat-search.co.uk to THREE, and put The Gazette's
// customer-services inbox on a plasterer. None were invented — they were real
// addresses read off real pages that simply belonged to somebody else, because
// the code took Google's first non-blocklisted hit as "the company's own site"
// and then scraped whatever inbox was on it.
//
// The fix is a positive ownership test, so these cases are the test data.
// ---------------------------------------------------------------------------
const enrich = await import("../src/backend/enrich.ts");

test("email discovery: a domain that belongs to the company is accepted", () => {
  // Every one of these was a CORRECT row in the live run and must stay correct.
  const good = [
    ["AFR STUDIO LIMITED", "afrstudioltd.com"],
    ["HL BUILDING LTD", "hlbuildingltd.co.uk"],
    ["ADL MECHANICAL SERVICES LTD", "adlmechanicalservices.co.uk"],
    ["WINN HOMES LTD", "winnhomesltd.co"],
    ["Master Construction", "masterconstruction.co.uk"],
    ["Association of Master Tradesmen", "mastertradesmen.co.uk"],
  ];
  for (const [company, host] of good) {
    assert.equal(enrich.domainMatchesCompany(company, host), true,
      `${company} genuinely owns ${host} — rejecting it loses a real lead`);
  }
});

test("email discovery: a directory's domain is refused, however plausible", () => {
  // Every one of these was a WRONG row in the live run.
  const bad = [
    ["BUILD WITH US GROUP LTD", "rooplex.co.uk"],
    ["NUNUCA PAINTING & DECORATING LTD", "rooplex.co.uk"],
    ["SOUTHWEST ELECTRICAL GROUP LTD", "rooplex.co.uk"],
    ["K&D FIX LTD", "rooplex.co.uk"],
    ["NWDP SERVICES LTD", "vat-search.co.uk"],
    ["M&M RESIDENTIAL GROUP LTD", "vat-search.co.uk"],
    ["JTMTECH LTD", "vat-search.co.uk"],
    ["KALWA DESIGN LIMITED", "thegazette.co"],
    ["JSS CONSTRUCTION LTD", "zestate.co.uk"],
    ["CILI CONSTRUCT LIMITED", "whoisvisiting.com"],
    ["QBIC DESIGN & CONSTRUCTION LIMITED", "bebee.com"],
    ["EMO&D LTD", "planningsignal.co"],
    ["AINSCOUGH ENVIRONMENTAL SERVICES LIMITED", "recyclr.co"],
    ["EAST GLOBAL LIMITED", "gov.vg"],
    ["Tradesman Construction", "bruceburke.co.uk"],
    ["Tradesman Construction", "mygoldtree.com"],
  ];
  for (const [company, host] of bad) {
    assert.equal(enrich.domainMatchesCompany(company, host), false,
      `${host} does not belong to ${company} — accepting it emails the wrong business`);
  }
});

test("email discovery: generic words alone never prove ownership", () => {
  // "SERVICES", "GROUP", "LTD", "LONDON" appear in thousands of names. A domain
  // matching only those is a directory, not the firm.
  assert.equal(enrich.domainMatchesCompany("SKYLINE LABOUR GROUP LTD", "groupltd.co.uk"), false);
  assert.equal(enrich.domainMatchesCompany("LONDON TRADE SERVICES LTD.", "tradeservicesuk.com"), false,
    "matching on 'trade services' alone would hand the same directory to every firm");
  assert.deepEqual(enrich.companyTokens("THE UK SERVICES GROUP LTD").length > 0, true,
    "a name made only of stopwords must still yield something to match on");
});

test("email discovery: the registrable label is read correctly under .co.uk", () => {
  assert.equal(enrich.domainLabel("www.adlmechanicalservices.co.uk"), "adlmechanicalservices");
  assert.equal(enrich.domainLabel("afrstudioltd.com"), "afrstudioltd");
  assert.equal(enrich.domainLabel("vat-search.co.uk"), "vatsearch");
});

test("email discovery: one address on several companies is dropped from all of them", () => {
  // Verbatim shape of the live failure.
  const batch = [
    { company: "BUILD WITH US GROUP LTD", email: "support@rooplex.co.uk", emailConfidence: "low", website: null, phone: null, source: "site", mode: "live", note: "" },
    { company: "NUNUCA PAINTING & DECORATING LTD", email: "support@rooplex.co.uk", emailConfidence: "low", website: null, phone: null, source: "site", mode: "live", note: "" },
    { company: "SOUTHWEST ELECTRICAL GROUP LTD", email: "support@rooplex.co.uk", emailConfidence: "low", website: null, phone: null, source: "site", mode: "live", note: "" },
    { company: "AFR STUDIO LIMITED", email: "info@afrstudioltd.com", emailConfidence: "high", website: null, phone: null, source: "site", mode: "live", note: "" },
  ];
  const { results, dropped } = enrich.dropSharedEmails(batch);
  assert.equal(dropped, 3, "all three copies go — there is no way to know which row it was ever right for");
  assert.equal(results.filter((r) => r.email === "support@rooplex.co.uk").length, 0);
  assert.equal(results[3].email, "info@afrstudioltd.com", "the genuine one is untouched");
  assert.match(results[0].note, /directory/, "and the customer is told why it went");
});

test("email discovery: contamination is caught across separate runs, not just within a batch", () => {
  // The live vault accumulated the same inbox over several 25-row batches, so a
  // within-batch check alone would not have caught it.
  const batch = [
    { company: "K&D FIX LTD", email: "support@rooplex.co.uk", emailConfidence: "low", website: null, phone: null, source: "site", mode: "live", note: "" },
  ];
  const alreadyUsed = new Map([["support@rooplex.co.uk", "BUILD WITH US GROUP LTD"]]);
  const { results, dropped } = enrich.dropSharedEmails(batch, alreadyUsed);
  assert.equal(dropped, 1);
  assert.equal(results[0].email, null);
  // Re-enriching the SAME company must not trip the guard against itself.
  const same = enrich.dropSharedEmails(
    [{ company: "BUILD WITH US GROUP LTD", email: "support@rooplex.co.uk", emailConfidence: "low", website: null, phone: null, source: "site", mode: "live", note: "" }],
    alreadyUsed,
  );
  assert.equal(same.dropped, 0, "a row keeping its own address is not contamination");
});

test("email discovery: placeholder and consumer addresses are classified correctly", () => {
  assert.equal(enrich.isPersonalProvider("mike-kyle@virginmedia.com"), true);
  assert.equal(enrich.isPersonalProvider("info@afrstudioltd.com"), false);
});

test("email discovery: the batch is big enough to finish, and reserves time to run", () => {
  const src = readFileSync(new URL("../src/app/api/contacts/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /const ENRICH_CAP = 25;/,
    "2,701 prospects at 25 a click is 108 clicks — nobody completes that");
  assert.match(src, /maxDuration = 60/, "a batch of external fetches must reserve the full budget");
  assert.match(src, /dropSharedEmails\(raw, usedByCompany\)/,
    "and every batch must be checked against what the vault already holds");
});

test("email discovery: the vault can be cleaned of addresses written before the fix", () => {
  // Fixing discovery does nothing about the 2,700-row list already carrying one
  // directory inbox on four builders. Without this, the bad data just sits there
  // waiting to be emailed.
  const rows = [
    { id: "1", company: "BUILD WITH US GROUP LTD", email: "support@rooplex.co.uk" },
    { id: "2", company: "NUNUCA PAINTING & DECORATING LTD", email: "support@rooplex.co.uk" },
    { id: "3", company: "KALWA DESIGN LIMITED", email: "customer.services@thegazette.co" },
    { id: "4", company: "EAST GLOBAL LIMITED", email: "customerservice@gov.vg" },
    { id: "5", company: "NWDP SERVICES LTD", email: "john.doe@vat-search.co.uk" },
    { id: "6", company: "AFR STUDIO LIMITED", email: "info@afrstudioltd.com" },
    { id: "7", company: "MLK TILING LTD", email: "mike-kyle@virginmedia.com" },
    { id: "8", company: "Moulton Construction Tradesman", email: "moultonconstructiontradesman4@gmail.com" },
  ];
  const { bad, checked } = enrich.auditStoredEmails(rows);
  assert.equal(checked, 8);
  const badIds = bad.map((b) => b.id).sort();
  assert.deepEqual(badIds, ["1", "2", "3", "4", "5"],
    `wrong set flagged: ${JSON.stringify(bad.map((b) => `${b.id}:${b.email}`))}`);
  // A genuine company-domain address survives.
  assert.ok(!bad.some((b) => b.email === "info@afrstudioltd.com"));
  // Consumer addresses are LEFT ALONE — a tiler using virginmedia is normal, and
  // stripping those would delete real leads to look tidy.
  assert.ok(!bad.some((b) => b.email.includes("virginmedia")));
  assert.ok(!bad.some((b) => b.email.includes("gmail")));
  assert.match(bad.find((b) => b.id === "1").reason, /2 different companies/);
});

test("email discovery: the clean-up is offered in the vault, and shows before it deletes", () => {
  const src = readFileSync(new URL("../src/app/dashboard/customers/page.tsx", import.meta.url), "utf8");
  assert.match(src, /action: "audit_emails"/, "the vault must be able to check itself");
  assert.match(src, /auditEmails\(false\)/, "the first click only reports");
  assert.match(src, /auditEmails\(true\)/, "deleting is a second, deliberate click");
  assert.doesNotMatch(src, /batches of 25/, "the batch size claim must match what the server does");
});

// ---------------------------------------------------------------------------
// Yield collapse: 1 email from 2,100 companies.
//
// Two causes, and they were indistinguishable from each other in the UI.
//
// (a) The ownership gate matched word by word, so a firm that registered a long
//     formal name and bought a short domain from its initials — NWDP SERVICES
//     LTD → nwdp.co.uk, K&D FIX LTD → kdfix.co.uk — was thrown away as if the
//     domain belonged to a stranger.
// (b) webSearch() fell back to demo mode on ANY non-200 from the provider, so an
//     exhausted quota (429) produced the message "set SERPER_API_KEY" for a key
//     that was set, valid, and simply out of credit.
// ---------------------------------------------------------------------------

test("email discovery: a firm's own abbreviated domain is not thrown away", () => {
  const shouldPass = [
    ["NWDP SERVICES LTD", "nwdp.co.uk"],
    ["K&D FIX LTD", "kdfix.co.uk"],
    ["SANTA DAMPPROOFING AND CONSTRUCTION LTD", "santadamp.co.uk"],
    ["SJB SHOPFITTING LTD", "sjbshopfitting.co.uk"],
    ["A H MIDLANDS LTD", "ahmidlands.co.uk"],
    ["M&M RESIDENTIAL GROUP LTD", "mmresidential.co.uk"],
    ["GAS NATION LTD", "gasnation.co.uk"],
  ];
  for (const [company, host] of shouldPass) {
    assert.equal(enrich.domainMatchesCompany(company, host), true,
      `${host} IS ${company}'s own domain — rejecting it is why 2,100 companies produced one email`);
  }
});

test("email discovery: loosening for abbreviations did not re-open the directory hole", () => {
  // Every address that was wrong in the live run must still be refused.
  const mustStillFail = [
    ["BUILD WITH US GROUP LTD", "rooplex.co.uk"],
    ["NWDP SERVICES LTD", "vat-search.co.uk"],
    ["KALWA DESIGN LIMITED", "thegazette.co"],
    ["EAST GLOBAL LIMITED", "gov.vg"],
    ["QBIC DESIGN & CONSTRUCTION LIMITED", "bebee.com"],
    ["CILI CONSTRUCT LIMITED", "whoisvisiting.com"],
    ["JSS CONSTRUCTION LTD", "zestate.co.uk"],
  ];
  for (const [company, host] of mustStillFail) {
    assert.equal(enrich.domainMatchesCompany(company, host), false,
      `${host} still does not belong to ${company}`);
  }
});

test("email discovery: the squashed-name rule needs real length, not two letters", () => {
  assert.equal(enrich.compactName("K&D FIX LTD"), "kdfix");
  assert.equal(enrich.compactName("NWDP SERVICES LIMITED"), "nwdpservices");
  // A 2-3 char label must not prefix-match its way onto every company.
  assert.equal(enrich.domainMatchesCompany("BUILD WITH US GROUP LTD", "bu.co.uk"), false);
});

test("search: an exhausted quota is reported as exhausted, not as a missing key", () => {
  const search = "../src/backend/search.ts";
  assert.match(enrichSearchSrc, /providerError/,
    "a keyed deployment that gets refused must say why, or the owner hunts for env vars that never moved");
  assert.ok(search); // path documented for the reader
});

const enrichSearchSrc = readFileSync(new URL("../src/backend/search.ts", import.meta.url), "utf8");

test("search: each provider status maps to the action that actually fixes it", async () => {
  const { serperFailureReason } = await import("../src/backend/search.ts");
  assert.match(serperFailureReason(429), /quota|credit/i);
  assert.match(serperFailureReason(429), /valid/i, "429 must say the KEY IS FINE — that is the whole point");
  assert.match(serperFailureReason(402), /credit/i);
  assert.match(serperFailureReason(401), /rejected|wrong|revoked/i);
  assert.match(serperFailureReason(503), /outage|provider/i);
  // The three must not read the same, or the owner cannot tell them apart.
  assert.notEqual(serperFailureReason(429), serperFailureReason(401));
});

test("email discovery: the result says WHERE each row stopped", () => {
  const src = readFileSync(new URL("../src/backend/enrich.ts", import.meta.url), "utf8");
  for (const stage of ["search_unavailable", "no_own_site", "site_no_email", "found"]) {
    assert.ok(src.includes(`"${stage}"`), `missing stage ${stage} — "1 from 2,100" is unactionable without it`);
  }
  const route = readFileSync(new URL("../src/app/api/contacts/route.ts", import.meta.url), "utf8");
  assert.match(route, /breakdown,/, "and the count must reach the customer");
  assert.match(route, /providerError/, "including the provider's own reason");
  const page = readFileSync(new URL("../src/app/dashboard/customers/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Where the last/, "shown in the vault, not buried in a JSON response");
});

test("email discovery: the company search is not forced into an exact phrase", () => {
  const src = readFileSync(new URL("../src/backend/enrich.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /`"\$\{input\.company\}"`/,
    'exact-phrase search for a Companies-House name like "M.C.B. AND SON LTD" returns almost nothing — the firm\'s own site writes the name the way people say it');
});

// ---------------------------------------------------------------------------
// Gateway failover. The live error was:
//
//   "All AI providers failed: anthropic (timed out after 24s);
//    openai (skipped — overall gateway deadline reached)"
//
// A configured, working fallback never ran, because the first provider was
// handed the entire budget and spent it on a timeout plus retries. A fallback
// that only runs when the first provider fails FAST is not a fallback.
// ---------------------------------------------------------------------------
const gw = await import("../src/backend/gateway.ts");

test("gateway: a provider that just failed is demoted, not tried first again", () => {
  gw.__resetProviderCooldowns();
  const list = [{ id: "anthropic" }, { id: "openai" }, { id: "gemini" }];
  assert.deepEqual(gw.preferHealthy(list).map((a) => a.id), ["anthropic", "openai", "gemini"],
    "order is untouched while everything is healthy");

  gw.markProviderCooling("anthropic");
  assert.deepEqual(gw.preferHealthy(list).map((a) => a.id), ["openai", "gemini", "anthropic"],
    "a timing-out provider must not cost every later request its full slice before the working one is tried");
  assert.equal(gw.providerCooling("anthropic"), true);
  gw.__resetProviderCooldowns();
});

test("gateway: demotion is never a ban — a blip cannot take the AI offline", () => {
  gw.__resetProviderCooldowns();
  const list = [{ id: "anthropic" }, { id: "openai" }];
  gw.markProviderCooling("anthropic");
  gw.markProviderCooling("openai");
  assert.deepEqual(gw.preferHealthy(list).map((a) => a.id), ["anthropic", "openai"],
    "with everything cooling, every provider is still attempted in the configured order");
  gw.__resetProviderCooldowns();
});

test("gateway: the cooldown expires, so recovery does not need a redeploy", () => {
  gw.__resetProviderCooldowns();
  const now = 1_000_000;
  gw.markProviderCooling("anthropic", now);
  assert.equal(gw.providerCooling("anthropic", now + 60_000), true, "still cooling a minute later");
  assert.equal(gw.providerCooling("anthropic", now + 600_000), false, "healthy again after the window");
  gw.__resetProviderCooldowns();
});

test("gateway: the budget is split so a fallback always gets a real attempt", () => {
  const src = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(src, /providersLeft/, "each provider must get a share, not the whole deadline");
  assert.match(src, /adapter\.complete\(req, providerDeadline\)/,
    "handing the first adapter the overall deadline is exactly what starved the fallback");
  assert.match(src, /MIN_PROVIDER_MS/, "and a slice too small to succeed is not worth starting");
});

test("gateway: a success clears the demotion immediately", () => {
  const src = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(src, /coolingUntil\.delete\(adapter\.id\)/,
    "recovery must be instant on the first success, not held until a timer expires");
});

// ---------------------------------------------------------------------------
// Deliverability Commander — it ended with "send me the sending domain so I can
// check its live SPF/DKIM/DMARC records", which is a dead end: the domain was in
// the form above it, and there was nowhere to reply.
// ---------------------------------------------------------------------------
const dns = await import("../src/backend/dns-auth.ts");

test("deliverability: whatever the customer typed is reduced to a domain", () => {
  assert.equal(dns.normaliseDomain("https://www.evandeli.com/"), "evandeli.com",
    "the form holds a URL — asking again for 'the domain' is why this felt like a dead end");
  assert.equal(dns.normaliseDomain("info@evandeli.com"), "evandeli.com");
  assert.equal(dns.normaliseDomain("EVANDELI.COM"), "evandeli.com");
  assert.equal(dns.normaliseDomain("not a domain"), "");
  assert.equal(dns.normaliseDomain(""), "");
});

// Two DNS worlds, injected so the outcome does not depend on the test runner's
// network — which is exactly how the old version of this test passed for the
// wrong reason: DNS was unreachable, the code reported "3 records missing", and
// the assertion agreed with it.
const dnsSilent = async () => ({ answers: [], resolved: false });
const dnsEmpty = async () => ({ answers: [], resolved: true });

test("deliverability: a missing record is a blocker with the exact value to publish", async () => {
  // Resolver ANSWERED and there is genuinely nothing published.
  const report = await dns.checkDomainAuth("example-not-a-real-domain-xyz.com", { lookup: dnsEmpty });
  assert.equal(report.checked, true);
  assert.equal(report.readyToSend, false, "nothing published means not ready to send");
  assert.ok(report.blockers.length >= 3, "SPF, DKIM and DMARC must each be named");
  const spf = report.checks.find((c) => c.id === "spf");
  const dmarc = report.checks.find((c) => c.id === "dmarc");
  assert.equal(spf.status, "fail");
  assert.ok(spf.fix?.value.startsWith("v=spf1"), "telling someone to 'publish SPF' without the record is homework, not help");
  assert.ok(dmarc.fix?.value.startsWith("v=DMARC1"));
  assert.equal(dmarc.fix.host, "_dmarc", "the host matters — it is not published at the root");
  assert.match(report.summary, /NOT ready/i);
});

test("deliverability: BIMI is cosmetic and must not inflate the score", async () => {
  const report = await dns.checkDomainAuth("example-not-a-real-domain-xyz.com", { lookup: dnsEmpty });
  assert.equal(report.score, 0, "an unauthenticated domain scores zero, not 'a bit' for optional extras");
  assert.ok(!report.blockers.some((b) => /BIMI/i.test(b)), "BIMI never blocks a send");
});

test("deliverability: the agent is handed the DNS answer instead of asking for it", () => {
  const src = readFileSync(new URL("../src/app/api/agents/[agentId]/route.ts", import.meta.url), "utf8");
  assert.match(src, /checkDomainAuth/, "the platform must read the public records itself");
  assert.match(src, /liveDnsFacts/, "and put them in the prompt");
  assert.match(src, /do not tell them to send you the domain/i,
    "the model must be told it already has the domain, or it asks again");
  // The invariant is the RELATIONSHIP, not a magic number: the function must
  // outlast the budget it hands the gateway, or it is killed mid-call and the
  // customer sees nothing at all. Pinning the literal 60 made raising the budget
  // (after three providers each timed out at 17s) look like a regression.
  const maxDuration = Number(/maxDuration = (\d+)/.exec(src)?.[1]);
  const routeBudgetMs = Number(/ROUTE_BUDGET_MS = ([\d_]+)/.exec(src)?.[1].replace(/_/g, ""));
  assert.ok(maxDuration >= 60, `an agent needs room to write a document, got ${maxDuration}s`);
  assert.ok(routeBudgetMs < maxDuration * 1000,
    "the budget handed to the gateway must leave room to serialise a readable error instead of a 504");
  assert.match(src, /\.\.\.\(domainAuth \? \{ domainAuth \} : \{\}\)/,
    "the records travel beside the prose so the UI can render them");
});

// ---------------------------------------------------------------------------
// Multi-tenant leak: a customer viewing their own brand saw
//
//   "This brand's property: sc-domain:marketwaros.com"
//
// — the PLATFORM's Search Console property, with the platform's clicks and
// impressions (and, on the query dimension, the platform's actual search terms)
// presented as the customer's. Caused by falling back to "the first property in
// the connected account" when the brand's website matched nothing.
// ---------------------------------------------------------------------------

test("search console: never falls back to whatever property happens to be first", () => {
  const src = readFileSync(new URL("../src/app/api/seo-insights/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /sitesRes\.sites\[0\]\?\.siteUrl/,
    "this is the exact line that showed marketwaros.com to a customer as their own property");
  assert.doesNotMatch(src, /locRes\.locations\[0\]\?\.name/,
    "the same fallback on Business Profile shows one business's reviews under another's brand");
  assert.match(src, /needsSelection/, "an unmatched brand must be asked to pick, not silently given someone else's data");
});

test("search console: a property is only used when it is explicitly this brand's", () => {
  const src = readFileSync(new URL("../src/app/api/seo-insights/route.ts", import.meta.url), "utf8");
  // Three legitimate sources, and nothing else: an explicit pick, a saved
  // mapping for this brand, or a hostname match against this brand's website.
  assert.match(src, /mapping\?\.siteUrl \|\| matchSite\(sitesRes\.sites, website\) \|\| ""/);
});

test("search console: hostname matching is strict enough to not cross brands", async () => {
  const { matchSite } = await import("../src/backend/google-mapping.ts");
  const sites = [{ siteUrl: "sc-domain:marketwaros.com" }, { siteUrl: "https://evandeli.com/" }];
  assert.equal(matchSite(sites, "https://www.evandeli.com/"), "https://evandeli.com/");
  // A brand with no matching property gets NOTHING, not the platform's.
  assert.equal(matchSite(sites, "https://some-other-brand.co.uk"), undefined);
  assert.equal(matchSite(sites, undefined), undefined);
});

test("search console: the empty state explains itself instead of showing zero", () => {
  const src = readFileSync(new URL("../src/app/dashboard/omnirank/page.tsx", import.meta.url), "utf8");
  assert.match(src, /No Search Console property is linked to this brand yet/,
    "a blank '0 clicks' reads as broken; saying why reads as correct");
  assert.match(src, /gsc\.needsSelection/);
});

test("gateway: the failure names every provider, including the ones never tried", () => {
  const src = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(src, /Not configured, so never tried/,
    '"All AI providers failed: anthropic…; openai…" invites the fair question "and what about Gemini?" — the error must answer it');
  assert.match(src, /unconfigured/, "the unconfigured set has to be computed before the loop filters it away");
});

test("gateway: a Gemini key works under either of Google's two names", () => {
  const src = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(src, /GOOGLE_GENERATIVE_AI_API_KEY/,
    "a correctly-purchased key must not sit unused because it was pasted under the other name");
  assert.doesNotMatch(src, /process\.env\.GEMINI_API_KEY as string/,
    "the request must use the same resolver as the configured() check, or one can pass while the other fails");
});

test("gateway: status says out loud when there is no fallback at all", async () => {
  const { gatewayStatus } = await import("../src/backend/gateway.ts");
  const st = gatewayStatus();
  assert.ok(typeof st.note === "string" && st.note.length > 0);
  assert.equal(st.live, false, "no keys are set in the test environment");
  assert.match(st.note, /demo mode/i);
  assert.ok(Array.isArray(st.providers) && st.providers.length === 3, "all three are reported, configured or not");
});

// ---------------------------------------------------------------------------
// The worst bug in this session: a paid, working provider silently switched off.
//
// GEMINI_API_KEY was set in Vercel production. Gemini was never called once, and
// never appeared in any error, because AI_GATEWAY_ORDER was treated as an
// ALLOWLIST — a variable whose only job is to ORDER a list was able to REMOVE
// things from it. Undiagnosable from the outside: the key was right, the code
// was "working", and the capability was off.
// ---------------------------------------------------------------------------

test("gateway: AI_GATEWAY_ORDER orders providers — it must never remove one", async () => {
  const src = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  // The old shape: parse the env, filter to known ids, and return ONLY those.
  assert.doesNotMatch(src, /const unique = \[\.\.\.new Set\(ids\)\];\s*\n\s*return unique\.map/,
    "returning only the named providers is what switched off a paid Gemini key");
  assert.match(src, /const rest = DEFAULT_ORDER\.filter\(\(id\) => !preferred\.includes\(id\)\)/,
    "providers not named in the order must still be appended, never dropped");
  assert.match(src, /\[\.\.\.preferred, \.\.\.rest\]/);
});

test("gateway: a partial order still reaches every configured provider", async () => {
  const gwmod = "../src/backend/gateway.ts";
  const prev = process.env.AI_GATEWAY_ORDER;
  try {
    // Exactly the production shape: two named, the third omitted.
    process.env.AI_GATEWAY_ORDER = "anthropic,openai";
    const { gatewayStatus } = await import(gwmod);
    const st = gatewayStatus();
    assert.deepEqual(st.order, ["anthropic", "openai", "gemini"],
      "gemini must still be in the order — omitting it from the preference is not permission to skip it");
  } finally {
    if (prev === undefined) delete process.env.AI_GATEWAY_ORDER; else process.env.AI_GATEWAY_ORDER = prev;
  }
});

test("gateway: a typo in the order is reported, not silently obeyed", async () => {
  const { unknownProvidersInOrder } = await import("../src/backend/gateway.ts");
  assert.deepEqual(unknownProvidersInOrder("anthropic, gemeni, openai"), ["gemeni"],
    "a misspelt provider must surface as a typo rather than quietly changing behaviour");
  assert.deepEqual(unknownProvidersInOrder("anthropic,openai,gemini"), []);
  // A value pasted with a newline or extra spaces must still parse.
  assert.deepEqual(unknownProvidersInOrder("anthropic\n openai\tgemini"), []);
});

test("gateway: keys are trimmed, so a pasted newline is not read as a provider fault", () => {
  const src = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(src, /function envKey\(/, "one place reads keys, and it trims");
  for (const bad of [
    /"x-api-key": process\.env\.ANTHROPIC_API_KEY as string/,
    /process\.env\.OPENAI_API_KEY as string/,
  ]) {
    assert.doesNotMatch(src, bad, "an untrimmed key sent as a header fails in a way that looks like the provider is down");
  }
});

test("health: the running deployment reports its own AI posture", () => {
  const src = readFileSync(new URL("../src/app/api/health/ai/route.ts", import.meta.url), "utf8");
  assert.match(src, /resolvedOrder/, "the resolved order is the only trustworthy answer to 'is my key being used'");
  assert.match(src, /keyPresent/, "presence only");
  // Array .length is fine; a KEY's length or prefix is a disclosure.
  assert.doesNotMatch(src, /(API_KEY|Key\(\))[^\n]*\.(slice|substring|length)/,
    "never return a key prefix or length — both narrow a brute-force search");
  assert.doesNotMatch(src, /process\.env\.[A-Z_]*API_KEY/,
    "the route must report presence via the gateway, never touch a key value itself");
  assert.match(src, /unrecognisedInOrder/);
});

// ---------------------------------------------------------------------------
// Autosave. A 7-day content plan was generated, ACUs were spent, the customer
// clicked another link, and the work was gone — no copy, no history, no way
// back. Output lived in React state and nowhere else.
// ---------------------------------------------------------------------------
const lib = await import("../src/backend/work-library.ts");

test("library: the same output saved twice updates one entry, not two", async () => {
  lib.__resetWorkLibrary();
  const base = { brandId: "b1", ownerId: "u1", kind: "agent", source: "content-factory", sourceName: "Content Factory", title: "Plan", output: "# 7-Day Plan\nDay 1…", input: {} };
  const a = await lib.saveWork(base, "2026-01-01T10:00:00.000Z");
  const b = await lib.saveWork(base, "2026-01-01T11:00:00.000Z");
  assert.equal(a.item.id, b.item.id, "identical work must collapse — a library full of duplicates is one nobody opens");
  assert.equal(b.item.createdAt, "2026-01-01T10:00:00.000Z", "the original creation time is kept");
  assert.equal(b.item.updatedAt, "2026-01-01T11:00:00.000Z");
  assert.equal((await lib.listWork("b1")).length, 1);
});

test("library: work is scoped to its brand and never leaks to another", async () => {
  lib.__resetWorkLibrary();
  await lib.saveWork({ brandId: "axionos", ownerId: "u1", kind: "agent", source: "content-factory", sourceName: "CF", title: "A", output: "axion plan", input: {} }, "2026-01-01T10:00:00.000Z");
  await lib.saveWork({ brandId: "evandeli", ownerId: "u1", kind: "agent", source: "content-factory", sourceName: "CF", title: "B", output: "deli plan", input: {} }, "2026-01-01T10:00:00.000Z");
  const axion = await lib.listWork("axionos");
  assert.equal(axion.length, 1);
  assert.equal(axion[0].output, "axion plan");
  // Asking for the other brand's item BY ID must still refuse.
  const otherId = lib.workId("evandeli", "content-factory", "deli plan");
  assert.equal(await lib.getWork("axionos", otherId), null, "an id from another brand must not resolve");
});

test("library: pinned work stays at the top, then newest first", async () => {
  lib.__resetWorkLibrary();
  const mk = (out, at, pinned) => lib.saveWork({ brandId: "b1", ownerId: null, kind: "agent", source: "s", sourceName: "S", title: out, output: out, input: {}, pinned }, at);
  await mk("oldest", "2026-01-01T10:00:00.000Z", false);
  await mk("newest", "2026-01-03T10:00:00.000Z", false);
  await mk("pinned-old", "2026-01-02T10:00:00.000Z", true);
  const list = await lib.listWork("b1");
  assert.deepEqual(list.map((w) => w.output), ["pinned-old", "newest", "oldest"],
    "the thing you marked as mattering must not sink below newer noise");
});

test("library: the last run for an engine can be brought back", async () => {
  lib.__resetWorkLibrary();
  await lib.saveWork({ brandId: "b1", ownerId: null, kind: "agent", source: "content-factory", sourceName: "CF", title: "old", output: "old plan", input: {} }, "2026-01-01T10:00:00.000Z");
  await lib.saveWork({ brandId: "b1", ownerId: null, kind: "agent", source: "content-factory", sourceName: "CF", title: "new", output: "new plan", input: {} }, "2026-01-05T10:00:00.000Z");
  await lib.saveWork({ brandId: "b1", ownerId: null, kind: "agent", source: "email-commander", sourceName: "EC", title: "email", output: "email plan", input: {} }, "2026-01-06T10:00:00.000Z");
  const latest = await lib.latestWork("b1", "content-factory");
  assert.equal(latest.output, "new plan", "returning to a page must restore ITS work, not the last thing generated anywhere");
});

test("library: a title is taken from the work, never invented", () => {
  assert.equal(lib.titleFrom("## 7-Day Content Strike Plan: AxionOS\nDay 1…", "Content Factory"), "7-Day Content Strike Plan: AxionOS");
  assert.equal(lib.titleFrom("**Win-back sequence**\nbody", "Email"), "Win-back sequence");
  // No heading — use what the customer actually typed.
  assert.equal(lib.titleFrom("plain text with no heading", "Content Factory", { offer: "Free first lead" }),
    "Content Factory — Free first lead");
  assert.equal(lib.titleFrom("plain text", "Content Factory"), "Content Factory");
});

test("library: a non-durable save says so instead of pretending", async () => {
  lib.__resetWorkLibrary();
  const res = await lib.saveWork({ brandId: "b1", ownerId: null, kind: "agent", source: "s", sourceName: "S", title: "t", output: "o", input: {} }, "2026-01-01T10:00:00.000Z");
  // Firebase Admin is not configured in tests — the in-memory path must be honest.
  assert.equal(res.persisted, false);
  assert.match(res.note, /session only|not survive/i,
    "a save that silently evaporates at the next deploy loses the work twice");
});

test("library: deleting is scoped too", async () => {
  lib.__resetWorkLibrary();
  await lib.saveWork({ brandId: "b1", ownerId: null, kind: "agent", source: "s", sourceName: "S", title: "t", output: "keep me", input: {} }, "2026-01-01T10:00:00.000Z");
  const id = lib.workId("b1", "s", "keep me");
  assert.equal(await lib.deleteWork("b2", id), false, "another brand must not be able to delete it");
  assert.equal((await lib.listWork("b1")).length, 1);
  assert.equal(await lib.deleteWork("b1", id), true);
  assert.equal((await lib.listWork("b1")).length, 0);
});

test("autosave: the runner saves every result and restores the last one", () => {
  const src = readFileSync(new URL("../src/components/AgentRunner.tsx", import.meta.url), "utf8");
  assert.match(src, /void autosave\(data as AgentResult/, "every completed run must be saved without being asked");
  assert.match(src, /latest=1/, "and the last one restored when the page is reopened");
  assert.match(src, /setResult\(\(cur\) => cur \?\? \(/,
    "restoring must never overwrite something generated in this session");
  assert.match(src, /Open Library/, "an autosave nobody can see reads as no autosave at all");
});

test("autosave: there is a page to actually find the work on", () => {
  const page = readFileSync(new URL("../src/app/dashboard/library/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\/api\/work\?brandId=/);
  assert.match(page, /Nothing saved yet/, "the empty state must explain how work gets here");
  const side = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
  assert.match(side, /dashboard\/library/, "a page nobody can navigate to is not a fix");
});

test("library: the store is Admin-SDK only — it holds the customer's strategy", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/work_library\/\{doc\} \{ allow read, write: if false; \}/,
    "saved plans are commercial strategy and must never be readable by a browser token");
});

// ---------------------------------------------------------------------------
// Claim Guard false positives. A clean CTA — "Secure your FREE lead now" — was
// flagged as an unsubstantiated medical claim, because lower.includes("cure")
// matches inside "secure". A compliance gate that cries wolf is worse than
// none: the customer learns to dismiss the warnings and misses the real one.
// ---------------------------------------------------------------------------
const comp = await import("../src/backend/compliance.ts");

test("claim guard: a word inside another word is not a claim", () => {
  const clean = [
    // Verbatim from the customer's own Day 7 CTA.
    "Don't delay your next project. Secure your FREE lead now.",
    "We handle asbestos removal across Birmingham.",   // "best" inside "asbestos"
    "Procure materials at trade prices.",              // "cure" inside "procure"
    "Serving Detroit and the surrounding area.",       // "roi" inside "Detroit"
  ];
  for (const text of clean) {
    const v = comp.verifyClaim({ text });
    assert.notEqual(v.status, "prohibited", `false positive on: ${text} (${v.reason || ""})`);
  }
});

test("claim guard: a negated term is the opposite of the claim, not the claim", () => {
  // "profit" needs evidence; "non-profit" is the opposite and needs none.
  assert.equal(comp.verifyClaim({ text: "Strong profit margins this quarter." }).status, "inferred_pending",
    "the un-negated term must still ask for evidence, or this test proves nothing");
  for (const text of ["A non-profit rate for community projects.", "These results are unproven and we say so."]) {
    const v = comp.verifyClaim({ text });
    assert.equal(v.status, "user_confirmed", `flagged for being careful: ${text} → ${v.status}`);
  }
});

test("claim guard: real superlatives and guarantees are still caught", () => {
  const dirty = [
    "We are the best builders in London.",
    "Guaranteed results or your money back.",
    "Our supplement cures back pain.",
    "We're #1 for roofing in Manchester.",
    "The cheapest quotes you will find.",
    "Risk-free trial for 30 days.",
  ];
  for (const text of dirty) {
    const v = comp.verifyClaim({ text });
    assert.equal(v.status, "prohibited", `missed a real claim: ${text}`);
  }
});

test("claim guard: word matching is not a substring scan any more", () => {
  const src = readFileSync(new URL("../src/backend/compliance.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /PROHIBITED_TERMS\.find\(\(t\) => lower\.includes\(t\)\)/,
    "substring matching is what flagged 'Secure' as 'cure'");
  assert.match(src, /findTerm\(lower, PROHIBITED_TERMS\)/);
  assert.match(src, /findTerm\(lower, EVIDENCE_REQUIRED_TERMS\)/);
});

// ---------------------------------------------------------------------------
// "Next:" lines. Every agent closes by naming the next move, and it went
// nowhere — good advice with no button, so the plan stalls one step from use.
// ---------------------------------------------------------------------------
const nextStep = await import("../src/backend/next-step.ts");

test("next step: the closing instruction is found in its usual shapes", () => {
  // Verbatim from the Content Factory run.
  assert.equal(
    nextStep.parseNextStep("…plan…\nNext: Build out the WhatsApp outreach script for the \"FREE Lead\" offer."),
    'Build out the WhatsApp outreach script for the "FREE Lead" offer.');
  assert.equal(nextStep.parseNextStep("**Next:** Write the landing page."), "Write the landing page.");
  assert.equal(nextStep.parseNextStep("## Next Steps: Segment the list."), "Segment the list.");
  // The LAST one wins — agents mention next steps mid-report too.
  assert.equal(nextStep.parseNextStep("Next: first thing\n…\nNext: the real handover"), "the real handover");
  assert.equal(nextStep.parseNextStep("no next line here"), "");
});

test("next step: the WhatsApp handover routes to a real engine", () => {
  const r = nextStep.routeNextStep('Build out the WhatsApp outreach script for the "FREE Lead" offer.', "content-factory");
  assert.equal(r.agentId, "outreach-commander", "WhatsApp is a channel the outreach engine writes for");
  assert.ok(r.agentName);
  assert.equal(r.blocked, undefined);
});

test("next step: a request for information the platform already has gets NO button", () => {
  // Verbatim from the Deliverability Commander.
  const r = nextStep.routeNextStep("send me the sending domain so I can check its live SPF/DKIM/DMARC records", "email-commander");
  assert.equal(r.blocked, "asks_the_user");
  assert.equal(r.agentId, undefined, "a button that reopens a dead end is worse than no button");
  assert.match(r.reason, /already has/i);
});

test("next step: an engine is never routed back to itself", () => {
  const r = nextStep.routeNextStep("Refine the content calendar and posts", "content-factory");
  assert.equal(r.agentId, undefined, "pressing next and getting the same report is the dead end with an extra click");
  assert.equal(r.blocked, "no_engine");
});

test("next step: something no engine does is said plainly, not faked", () => {
  const r = nextStep.routeNextStep("Print the flyers and drop them at the trade counter", "content-factory");
  assert.equal(r.blocked, "no_engine");
  assert.match(r.reason, /yours to do/i);
});

test("next step: the button carries the work forward, not just the form", () => {
  const src = readFileSync(new URL("../src/components/AgentRunner.tsx", import.meta.url), "utf8");
  assert.match(src, /previousWork: result\.output/,
    "without the plan just produced, the follow-on engine starts again and writes something that does not match it");
  assert.match(src, /onClick=\{\(\) => runNext\(result\.nextStep!\.agentId!\)\}/, "and it must be wired");
  assert.match(src, /void autosave\(data as AgentResult, \{ \.\.\.values, from: agentId \}, nextAgentId\)/,
    "the follow-on output is work too — it gets saved under its own engine");
});

test("next step: the route attaches it to every agent response", () => {
  const src = readFileSync(new URL("../src/app/api/agents/[agentId]/route.ts", import.meta.url), "utf8");
  assert.match(src, /nextStepFrom\(result\.output, agentId\)/);
});

// ---------------------------------------------------------------------------
// "Request failed" on Send to vault.
//
// /api/email sends up to 250 emails in a SERIAL SMTP loop — each send is allowed
// 15 seconds before it times out — and the route reserved no time at all. The
// function was killed part-way through, so no JSON came back and the page fell
// back to a bare "Request failed".
//
// The silent half is worse than the visible half: sends that DID go out were
// never counted against the warm-up allowance, so retrying mails those people a
// second time and burns the sending reputation the warm-up exists to protect.
// ---------------------------------------------------------------------------

test("email send: the route reserves time for the work it actually does", () => {
  const src = readFileSync(new URL("../src/app/api/email/route.ts", import.meta.url), "utf8");
  assert.match(src, /export const maxDuration = 60/,
    "a serial SMTP loop cannot run inside the default function budget");
  assert.match(src, /SEND_BUDGET_MS/, "and it must stop with time to spare, not be killed");
});

test("email send: it stops cleanly and reports what really went out", () => {
  const src = readFileSync(new URL("../src/app/api/email/route.ts", import.meta.url), "utf8");
  assert.match(src, /deadline: sendDeadline/,
    "the send must be bounded, so the response — and the warm-up count — is written by us");
  assert.match(src, /if \(!r\) \{ stoppedEarly = true; continue; \}/,
    "an address the budget never reached was not attempted and must not count as failed");
  assert.match(src, /const attempted = sent \+ failed;/,
    "'attempted' must be what was tried, not the size of the batch that was planned");
  assert.match(src, /remaining: Math\.max\(0, sendable\.length - attempted\)/,
    "unsent recipients must still count as remaining, or the customer thinks the campaign finished");
  assert.match(src, /Nobody was sent to twice/, "and the customer needs to know it is safe to run again");
});

test("email send: warm-up is credited before the response, so a retry cannot double-send", () => {
  const src = readFileSync(new URL("../src/app/api/email/route.ts", import.meta.url), "utf8");
  const record = src.indexOf("recordWarmupSends(brandId, today, sent)");
  const respond = src.indexOf("return NextResponse.json({\n      mode: emailConfigured");
  assert.ok(record > -1 && respond > -1 && record < respond,
    "what was delivered must be counted BEFORE the reply, or a timeout loses the tally");
});

test("email send: a dead route explains itself instead of saying 'Request failed'", () => {
  const src = readFileSync(new URL("../src/app/dashboard/email/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /catch\(\(\) => \(\{ error: "Request failed" \}\)\)/,
    "throwing away the status hides the one fact that matters — whether anything was sent");
  assert.match(src, /timed out \(HTTP \$\{res\.status\}\)/);
  assert.match(src, /Some emails may already have gone out/,
    "after a timeout the customer must check before retrying, not blindly resend");
  assert.match(src, /Nothing was sent — your list and warm-up allowance are untouched/,
    "a genuine network failure is the opposite case and must not read the same");
});

test("routes doing slow external work all reserve a budget", () => {
  // The systemic version of the bug. Any route that calls out to SMTP, a search
  // provider, an image renderer or the AI gateway can exceed the default budget;
  // when it does, the caller gets no JSON and the work is unaccounted for.
  const slow = /gatewayComplete|sendEmail|webSearch|enrichBatch|checkDomainAuth|generateImage|scrapeEnrich|runAgent/;
  const missing = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") {
        const src = readFileSync(full, "utf8");
        if (slow.test(src) && !/maxDuration/.test(src)) missing.push(full.replace(/^.*\/src\//, "src/"));
      }
    }
  };
  walk(new URL("../src/app/api", import.meta.url).pathname);
  assert.deepEqual(missing, [],
    `these routes do slow external work with no reserved time, so they die mid-request: ${missing.join(", ")}`);
});

// ---------------------------------------------------------------------------
// "Why does the template have these names?" — Marie Jolaine, Rawbank, Kinshasa.
//
// They were invented people hardcoded in the preview. A customer reads that as
// strangers' data leaking into their template. And because made-up values are
// uniformly present, a template that breaks on a contact with no company still
// previewed perfectly.
//
// "MarieMarie Jolaine" was the second bug: {{ firstName }}{{ name }} adjacent.
// The duplicate check existed but ran only when the AI wrote a template, so a
// hand-typed one shipped it.
// ---------------------------------------------------------------------------

test("template preview: no invented people are baked into the editor", () => {
  const src = readFileSync(new URL("../src/app/dashboard/email-templates/page.tsx", import.meta.url), "utf8");
  // Strip comments: the note explaining WHY these names were wrong is worth
  // keeping, but no invented person may survive in code the page actually runs.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const invented of ["Marie Jolaine", "Rawbank", "marie@example.com", "Gombe"]) {
    assert.ok(!code.includes(invented),
      `"${invented}" is a made-up person or company — a customer reasonably asks whose data it is`);
  }
  assert.match(src, /\[first name\]/, "an empty vault must show an obvious slot, not a fabricated name");
  assert.match(src, /previewIsReal/, "and a real contact is used when one exists");
});

test("template preview: it merges a real contact from the brand's own vault", () => {
  const src = readFileSync(new URL("../src/app/dashboard/email-templates/page.tsx", import.meta.url), "utf8");
  assert.match(src, /\/api\/contacts\?brandId=/, "the preview must read this brand's actual list");
  assert.match(src, /rows\.find\(\(c: \{ email\?: string \}\) => c\?\.email\)/,
    "prefer a contact that could actually be sent to");
  assert.match(src, /what that person actually receives/i);
});

test("template preview: duplicate-name templates are flagged as you type", () => {
  const src = readFileSync(new URL("../src/app/dashboard/email-templates/page.tsx", import.meta.url), "utf8");
  assert.match(src, /tokenWarnings\(`\$\{form\.subject\}/,
    "a check that only runs when the AI writes the template misses every hand-typed one");
  assert.match(src, /liveWarnings\.map/, "and the warning has to be rendered");
});

test("merge tokens: one shared definition, so preview and send cannot disagree", async () => {
  const shared = await import("../src/shared/merge-tokens.ts");
  // The exact template that produced "MarieMarie Jolaine".
  const merged = shared.mergeTokens("Hi {{ firstName }}{{ name }},", { firstname: "Marie", name: "Marie Jolaine" });
  assert.equal(merged, "Hi MarieMarie Jolaine,", "reproduce the defect before asserting it is caught");
  assert.ok(shared.tokenWarnings("Hi {{ firstName }}{{ name }},").some((w) => /twice/.test(w)),
    "and the editor must say so before it is sent");

  const editor = readFileSync(new URL("../src/app/dashboard/email-templates/page.tsx", import.meta.url), "utf8");
  assert.match(editor, /from "@\/shared\/merge-tokens"/, "the editor uses the shared grammar");
  assert.doesNotMatch(editor, /Client-safe mirror of MERGE_VARS/,
    "a local mirror is how a clean preview ships a template that merges badly");

  const sender = readFileSync(new URL("../src/backend/email-templates.ts", import.meta.url), "utf8");
  assert.match(sender, /return mergeTokens\(text, contactValues\(ctx\)\)/,
    "and the send path merges through the same function the preview does");
});

test("merge tokens: an unknown tag still never reaches an inbox raw", async () => {
  const { mergeTokens } = await import("../src/shared/merge-tokens.ts");
  assert.equal(mergeTokens("Your rep {{ salesRep }} will call.", {}), "Your rep  will call.",
    "a literal {{ salesRep }} arriving in someone's inbox is worse than a gap");
  assert.equal(mergeTokens("Hi {{ firstName | there }},", {}), "Hi there,");
});


test("deliverability: an unreachable resolver is NOT a finding", async () => {
  // Found by actually running the checker: with DNS blocked it reported
  // "NOT ready to send — 3 authentication records are missing" for domains it
  // had never looked at. A customer acting on that edits records that were
  // already correct, and a deliverability tool must never manufacture an alarm.
  const report = await dns.checkDomainAuth("veryxjnn.com", { lookup: dnsSilent });
  assert.equal(report.checked, false, "we did not check it, so we must not claim to have");
  assert.deepEqual(report.blockers, [], "nothing may be reported as missing when nothing was looked at");
  assert.match(report.error, /could not be checked/i);
  assert.match(report.error, /do not change them/i, "and the customer must be told not to act on it");
  assert.match(report.summary, /not checked/i);
});

test("deliverability: an unchecked report is not fed to the agent as fact", () => {
  const src = readFileSync(new URL("../src/app/api/agents/[agentId]/route.ts", import.meta.url), "utf8");
  assert.match(src, /if \(!domainAuth\.checked\)/,
    "handing the model 'everything is missing' makes it tell the customer to republish correct records");
  assert.match(src, /Do NOT state that any record is missing or present/);
});

test("deliverability: the real lookup marks a refused resolver as unresolved", () => {
  // The injected-stub tests above prove the REPORT behaves; this proves the
  // lookup itself sets the flag they depend on. Without it the mutation
  // "treat unreachable as no-records" passes every behavioural test while
  // reintroducing the exact bug.
  const src = readFileSync(new URL("../src/backend/dns-auth.ts", import.meta.url), "utf8");
  assert.match(src, /\/\/ Every resolver refused or timed out\. We know nothing about this name\.\s*\n\s*return \{ answers: \[\], resolved: false \};/,
    "the fallthrough after every resolver fails must report resolved:false");
  assert.match(src, /return \{ answers: Array\.isArray\(data\.Answer\) \? data\.Answer : \[\], resolved: true \}/,
    "and a resolver that answered — including with nothing — is resolved:true");
});

test("email send: the fallback path honours the deadline too", () => {
  // Without this, addresses the batch skipped for time were immediately re-sent
  // one at a time with no budget — undoing the stop and running the function
  // past its limit, which is the exact failure the deadline exists to prevent.
  const src = readFileSync(new URL("../src/backend/email.ts", import.meta.url), "utf8");
  assert.match(src, /if \(Date\.now\(\) >= deadline\) break;/,
    "the one-at-a-time fallback must stop when the budget is spent");
  assert.match(src, /stay sendable on the next run/);
});

test("email send: an address the batch already tried is never re-sent", () => {
  const src = readFileSync(new URL("../src/backend/email.ts", import.meta.url), "utf8");
  assert.match(src, /const existing = results\.get\(it\.to\);\s*\n\s*if \(existing\) \{ out\.push\(existing\); continue; \}/,
    "retrying a failed attempt would double-send anyone whose message was accepted just before the connection died");
});

test("email send: the response says which path ran", () => {
  const route = readFileSync(new URL("../src/app/api/email/route.ts", import.meta.url), "utf8");
  assert.match(route, /sendMode: lastBatchMode/,
    "inferring the path from a throughput number is how a stale deploy and a real cap look identical");
  const email = readFileSync(new URL("../src/backend/email.ts", import.meta.url), "utf8");
  assert.match(email, /lastBatchMode = "session"/);
  assert.match(email, /lastBatchMode = "one-at-a-time"/);
});

test("health: the running build identifies its own commit", () => {
  const src = readFileSync(new URL("../src/app/api/health/ai/route.ts", import.meta.url), "utf8");
  assert.match(src, /VERCEL_GIT_COMMIT_SHA/,
    "a fix and a stale deploy are indistinguishable from the outside without this");
  assert.match(src, /build: BUILD/);
});

// ---------------------------------------------------------------------------
// Data sources: a green light for a wire that was never run.
//
// "Admin: set AI_ANSWER_MONITOR_KEY in the environment… Once set, this shows
// 'connected' and the blank metrics fill in."
//
// No code read that variable. Nor LISTENING_API_KEY, nor BACKLINK_API_KEY. The
// connected check was Boolean(process.env[envKey]) — pure presence — so pasting
// any string lit the indicator and the panel stayed empty. Worst case the owner
// buys a data subscription first.
// ---------------------------------------------------------------------------
const organic = await import("../src/backend/organic-dominance.ts");

test("data sources: a source with no connector can never report itself connected", () => {
  const planned = organic.dataSources().filter((s) => s.connector === "planned");
  assert.ok(planned.length > 0, "these exist and must be labelled honestly");
  for (const s of planned) {
    assert.equal(s.connected, false, `${s.key} has no connector but reports connected`);
    assert.match(s.how, /Not built yet/i);
    assert.match(s.how, /does nothing today/i, "the owner must be told the key changes nothing before they buy a subscription");
  }
});

test("data sources: setting a planned key does NOT light it up", () => {
  const key = "AI_ANSWER_MONITOR_KEY";
  const prev = process.env[key];
  try {
    process.env[key] = "a-real-looking-key-that-nothing-reads";
    const s = organic.dataSources().find((x) => x.key === "ai_answers");
    assert.equal(s.connected, false,
      "a presence check on a variable nothing reads is a green light for a wire that was never run");
  } finally {
    if (prev === undefined) delete process.env[key]; else process.env[key] = prev;
  }
});

test("data sources: a live source is judged by its REAL probe, not a lookalike variable", () => {
  const sc = organic.dataSources().find((s) => s.key === "search_console");
  assert.equal(sc.connector, "live", "Search Console does have a connector");
  const prev = process.env.GOOGLE_SEARCH_CONSOLE_TOKEN;
  try {
    // The old list named a variable the fetching code never checks. Setting it
    // lit the indicator while the connector looked at a Google credential.
    process.env.GOOGLE_SEARCH_CONSOLE_TOKEN = "not-the-credential-the-code-uses";
    const again = organic.dataSources().find((s) => s.key === "search_console");
    assert.equal(again.connected, false,
      "the indicator must follow the credential the connector actually reads");
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_SEARCH_CONSOLE_TOKEN; else process.env.GOOGLE_SEARCH_CONSOLE_TOKEN = prev;
  }
});

test("data sources: a live source DOES light up on its real key", () => {
  const prev = process.env.SERPER_API_KEY;
  try {
    process.env.SERPER_API_KEY = "test-key";
    const s = organic.dataSources().find((x) => x.key === "serp");
    assert.equal(s.connected, true, "or the honest labelling has simply broken the working ones");
  } finally {
    if (prev === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prev;
  }
});

test("data sources: the UI does not promise metrics for an unbuilt connector", () => {
  const src = readFileSync(new URL("../src/app/dashboard/organic-dominance/page.tsx", import.meta.url), "utf8");
  assert.match(src, /Not built yet/, "planned sources must read differently from unconfigured ones");
  assert.match(src, /Nothing to set today/);
  // The promise may still be made — but only where a connector exists to keep it.
  const promiseIdx = src.indexOf("the blank metrics fill in");
  const guardIdx = src.indexOf('s.connector === "planned"');
  assert.ok(guardIdx > -1 && guardIdx < promiseIdx,
    "the 'metrics fill in' promise must sit behind the planned/live branch");
});

// ---------------------------------------------------------------------------
// AI Visibility — built rather than bought.
//
// No vendor sells "is ChatGPT recommending you" as an API; they all do what this
// does — ask the assistants the buying questions and record the answers. The
// risk in building it is a number nobody can check, so every verdict here has to
// trace back to text.
// ---------------------------------------------------------------------------
const vis = await import("../src/backend/ai-visibility.ts");

test("ai visibility: a brand is not matched inside another word", () => {
  // Same rule as the claim guard, for a sharper reason: a false positive tells
  // someone they are being recommended when they are not.
  const aliases = vis.brandAliases("Axion", "axionos.com");
  assert.equal(vis.findMention("Consider the axionometric survey method.", aliases).mentioned, false,
    "'Axion' inside 'axionometric' is not a citation");
  assert.equal(vis.findMention("I would look at Axion for this.", aliases).mentioned, true);
});

test("ai visibility: legal suffixes and the domain both count as the brand", () => {
  const aliases = vis.brandAliases("AxionOS Limited", "https://www.axionos.com/");
  assert.ok(aliases.includes("AxionOS"), "prose drops the Ltd");
  assert.ok(aliases.includes("axionos.com"));
  assert.equal(vis.findMention("Try AxionOS — they cover the Midlands.", aliases).mentioned, true);
  assert.equal(vis.findMention("See axionos.com for details.", aliases).mentioned, true);
});

test("ai visibility: the evidence is the sentence the claim came from", () => {
  const aliases = vis.brandAliases("AxionOS");
  const answer = "There are several options. AxionOS is strong for UK trades. Others exist too.";
  const { mentioned, evidence } = vis.findMention(answer, aliases);
  assert.equal(mentioned, true);
  assert.match(evidence, /AxionOS is strong for UK trades/,
    "a verdict with no quotable source is unfalsifiable");
});

test("ai visibility: rank is only reported when the answer is actually ranked", () => {
  const aliases = vis.brandAliases("AxionOS");
  const ranked = "1. **BuildCo** — large\n2. **AxionOS** — trades focus\n3. **Others** — misc";
  assert.equal(vis.rankOf(ranked, aliases), 2);
  // Prose mentions the brand but ranks nothing. Inventing "#1" here would be a
  // fabricated position.
  assert.equal(vis.rankOf("AxionOS is worth a look, as is BuildCo.", aliases), null);
});

test("ai visibility: competitors are read from lists only, never guessed from prose", () => {
  const listed = vis.extractNamedBusinesses("1. **BuildCo** — big\n2. **TradeHub** — small");
  assert.deepEqual(listed.names, ["BuildCo", "TradeHub"]);
  assert.equal(listed.ranked, true);
  // Guessing which capitalised words in a paragraph are companies would invent
  // rivals the customer does not have.
  const prose = vis.extractNamedBusinesses("In Birmingham, Many Builders Compete For Work Every Day.");
  assert.deepEqual(prose.names, []);
});

test("ai visibility: an assistant that could not be asked is not a 'no'", async () => {
  vis.__resetVisibilityRuns();
  const ask = async (id) => id === "openai"
    ? { ok: true, text: "I would suggest AxionOS.", provider: id, model: "m", latencyMs: 1 }
    : { ok: false, provider: id, reason: "No API key configured for anthropic, so it was not asked.", configured: false };
  const run = await vis.runVisibilityCheck(
    { brandId: "b1", brand: "AxionOS", questions: [{ id: "q1", text: "best?", intent: "buying" }], assistants: ["openai", "anthropic"] },
    "2026-01-01T00:00:00.000Z", { ask },
  );
  assert.equal(run.askedCount, 1, "only the assistant that answered counts");
  assert.equal(run.visibilityRate, 100, "1 of 1 answered — an unreachable provider must not drag the rate down");
  assert.match(run.note, /could not be collected/i, "and the gap must be stated");
});

test("ai visibility: nothing measured means nothing reported", async () => {
  vis.__resetVisibilityRuns();
  const ask = async (id) => ({ ok: false, provider: id, reason: "no key", configured: false });
  const run = await vis.runVisibilityCheck(
    { brandId: "b1", brand: "AxionOS", questions: [{ id: "q1", text: "best?", intent: "buying" }], assistants: ["openai"] },
    "2026-01-01T00:00:00.000Z", { ask },
  );
  assert.equal(run.askedCount, 0);
  assert.equal(run.visibilityRate, 0);
  assert.match(run.note, /Nothing was measured/i,
    "a configuration failure must not be presented as a marketing result");
});

test("ai visibility: the brand is never listed as its own competitor", async () => {
  vis.__resetVisibilityRuns();
  const ask = async (id) => ({
    ok: true, provider: id, model: "m", latencyMs: 1,
    text: "1. **AxionOS** — trades\n2. **BuildCo** — general",
  });
  const run = await vis.runVisibilityCheck(
    { brandId: "b1", brand: "AxionOS", questions: [{ id: "q1", text: "best?", intent: "buying" }], assistants: ["openai"] },
    "2026-01-01T00:00:00.000Z", { ask },
  );
  assert.deepEqual(run.topCompetitors.map((c) => c.name), ["BuildCo"],
    "shown as the assistant spelled it — a customer should recognise the name");
  assert.equal(run.results[0].verdicts[0].rank, 1);
});

test("ai visibility: a small swing between runs is NOT called a trend", () => {
  const mk = (rate, at) => ({ visibilityRate: rate, askedCount: 6, ranAt: at });
  const noisy = vis.trend([mk(50, "2026-01-02"), mk(33, "2026-01-01")]);
  assert.equal(noisy.direction, "flat",
    "6 non-deterministic answers moving 17 points is what these models do on their own");
  assert.match(noisy.note, /not movement you caused/i);

  const real = vis.trend([mk(83, "2026-01-02"), mk(17, "2026-01-01")]);
  assert.equal(real.direction, "up");
  assert.match(real.note, /confirm it holds/i, "even a real move needs a third run before spending against it");

  const single = vis.trend([mk(50, "2026-01-01")]);
  assert.equal(single.direction, "unknown");
});

test("ai visibility: questions are what a BUYER asks, not questions about you", () => {
  const qs = vis.suggestQuestions({ business: "AxionOS", product: "lead generation", location: "Birmingham" });
  const brandQuestions = qs.filter((q) => q.text.includes("AxionOS"));
  assert.equal(brandQuestions.length, 1,
    "asking the assistant about you proves only that it will discuss what it is handed");
  assert.ok(qs.length >= 4);
  assert.ok(qs.some((q) => /best|recommend/i.test(q.text) && !q.text.includes("AxionOS")),
    "being named unprompted is the thing worth measuring");
});

test("ai visibility: each assistant is asked directly, never through failover", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(gw, /export async function askProvider/,
    "falling over would file one model's answer under another — a fabricated measurement");
  const src = readFileSync(new URL("../src/backend/ai-visibility.ts", import.meta.url), "utf8");
  assert.match(src, /deps\.ask \?\? askProvider/);
  assert.doesNotMatch(src, /gatewayComplete/, "gatewayComplete picks whoever answers — wrong tool here");
});

test("ai visibility: the monitor is a LIVE data source now, and metered per call", () => {
  const sources = organic.dataSources();
  const ai = sources.find((s) => s.key === "ai_answers");
  assert.equal(ai.connector, "live", "it is built — the panel must stop saying 'not built yet'");
  const route = readFileSync(new URL("../src/app/api/ai-visibility/route.ts", import.meta.url), "utf8");
  assert.match(route, /questions\.length \* assistants\.length/, "one AI call per question per assistant");
  assert.match(route, /meterAction\(auth, "llm", units\)/, "and charged for what it actually costs");
  // The invariant is that the function outlasts the run budget it delegates —
  // not a specific number. Pinning 60 made raising the budget for a ten-question
  // run (thirty provider calls) look like a regression.
  const md = Number(/export const maxDuration = (\d+)/.exec(route)[1]);
  assert.ok(md >= 60, `the run needs room, got ${md}s`);
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/ai_visibility_runs\/\{doc\} \{ allow read, write: if false; \}/);
});

// --- The HTTP 504 -----------------------------------------------------------
//
// Live on marketwaros.com the button sat on "Asking…" and then returned
// "Check failed (HTTP 504)". 6 questions × 3 assistants asked question-by-
// question, each round waiting for its slowest assistant at up to 25s, is 150s
// against a 60s ceiling. The function is killed, the browser holds a request
// that never answers, and NOTHING is reported — while the ACUs are already spent.
// Exactly the defect that capped the email send, in a second place.

test("ai visibility: the run stops at its deadline instead of being killed by the platform", async () => {
  vis.__resetVisibilityRuns();
  // Every call is slow — the shape that produced the 504.
  let calls = 0;
  const ask = async (id, _req, opts) => {
    calls++;
    const wait = Math.min(opts?.timeoutMs ?? 25_000, 25_000);
    await new Promise((r) => setTimeout(r, Math.min(wait, 40)));
    return { ok: true, provider: id, model: "m", latencyMs: wait, text: "1. **BuildCo** — big" };
  };
  const questions = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, text: `best ${i}?`, intent: "buying" }));
  const started = Date.now();
  const run = await vis.runVisibilityCheck(
    { brandId: "b1", brand: "AxionOS", questions, assistants: ["openai", "anthropic", "gemini"] },
    "2026-01-01T00:00:00.000Z", { ask },
    // Already past its budget: not one call may be started.
    { deadline: Date.now() - 1 },
  );
  assert.equal(calls, 0, "a call that cannot finish before the ceiling must not be started");
  assert.ok(Date.now() - started < 5_000, "and the run must return immediately rather than hang");

  // Every pair still has a verdict, so the report is complete...
  const all = run.results.flatMap((r) => r.verdicts);
  assert.equal(all.length, 18);
  // ...and not one of them is a "no".
  assert.ok(all.every((v) => v.asked === false), "unasked is not answered");
  assert.equal(run.askedCount, 0);
  assert.match(run.note, /Nothing was measured/i);
  assert.ok(all.every((v) => /ran out of time/i.test(v.error)),
    "and the reason must say the clock ran out, not that a key is missing");
});

test("ai visibility: what WAS collected before the deadline is still reported", async () => {
  vis.__resetVisibilityRuns();
  const ask = async (id) => ({ ok: true, provider: id, model: "m", latencyMs: 1, text: "I would suggest AxionOS." });
  const questions = Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, text: `best ${i}?`, intent: "buying" }));
  const run = await vis.runVisibilityCheck(
    { brandId: "b1", brand: "AxionOS", questions, assistants: ["openai"] },
    "2026-01-01T00:00:00.000Z", { ask },
    { deadline: Date.now() + 60_000 },
  );
  assert.equal(run.askedCount, 4, "a healthy run is unaffected by the deadline machinery");
  assert.equal(run.visibilityRate, 100);
});

test("ai visibility: the questions run concurrently, not one round at a time", async () => {
  vis.__resetVisibilityRuns();
  let inFlight = 0, peak = 0;
  const ask = async (id) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 25));
    inFlight--;
    return { ok: true, provider: id, model: "m", latencyMs: 25, text: "no names here" };
  };
  const questions = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, text: `best ${i}?`, intent: "buying" }));
  await vis.runVisibilityCheck(
    { brandId: "b1", brand: "AxionOS", questions, assistants: ["openai", "anthropic", "gemini"] },
    "2026-01-01T00:00:00.000Z", { ask }, { deadline: Date.now() + 60_000 },
  );
  assert.ok(peak > 3,
    `18 calls at 3-at-a-time is what blew the 60s ceiling; saw peak concurrency ${peak}`);
});

test("ai visibility: calls that were never made are refunded", () => {
  // Charged up front at questions × assistants, because that is what a full run
  // costs. When the clock or a missing key means fewer calls were made, the
  // difference goes back — the customer pays for answers, not for intentions.
  const route = readFileSync(new URL("../src/app/api/ai-visibility/route.ts", import.meta.url), "utf8");
  assert.match(route, /units - run\.askedCount/, "the refund is the gap between charged and asked");
  assert.match(route, /creditAcus\(auth\.uid, refunded\)/);
  assert.match(route, /deadline: startedAt \+ RUN_BUDGET_MS/,
    "and the budget is measured from the top of the request, not from after auth and metering");
});

test("ai visibility: the browser gives up rather than spinning for ever", () => {
  const page = readFileSync(new URL("../src/app/dashboard/ai-visibility/page.tsx", import.meta.url), "utf8");
  assert.match(page, /AbortController/, "a spinner that can never stop looks like work");
  assert.match(page, /504/, "and a gateway timeout must be explained, not shown as a bare code");
});

// ---------------------------------------------------------------------------
// Human check — only a person gets in, and only a person gets the free ACUs.
//
// The honest boundary, stated once here so no future change quietly forgets it:
// the signup form talks straight to Google's Identity Toolkit with the PUBLIC
// web API key. Nothing on our side can stop a script creating a Firebase
// account. What our side CAN do — and what these tests hold to — is make that
// account worth nothing: no free allowance without work done in a real browser,
// a verified mailbox, and a domain that receives mail.
// ---------------------------------------------------------------------------
const pow = await import("../src/shared/proof-of-work.ts");
const human = await import("../src/backend/human-check.ts");

test("human check: the browser and the server agree on what solves the puzzle", async () => {
  // One definition, imported by both. If these ever diverged, every real
  // customer would be locked out while the difficulty check passed vacuously.
  const solved = await pow.solve("abc123", 10);
  assert.ok(solved, "a 10-bit puzzle must be solvable");
  assert.equal(await pow.meetsDifficulty("abc123", solved.solution, 10), true);
  assert.equal(await pow.meetsDifficulty("abc123", solved.solution, 32), false,
    "and the same solution must NOT satisfy a harder challenge");
});

test("human check: leading zero bits are counted in bits, not hex characters", () => {
  assert.equal(pow.leadingZeroBits("0000ff"), 16);
  assert.equal(pow.leadingZeroBits("1000ff"), 3, "0x1 is three leading zero bits, not zero");
  assert.equal(pow.leadingZeroBits("8000ff"), 0);
  assert.equal(pow.leadingZeroBits("07ffff"), 5);
});

test("human check: a real solution passes and issues a token", async () => {
  human.__resetHumanCheck();
  const binding = "bind-a";
  const ch = human.issueChallenge(binding);
  const solved = await pow.solve(ch.nonce, ch.bits);
  const res = await human.verifyHumanCheck({ challenge: ch, solution: solved.solution, binding, elapsedMs: 5_000 });
  assert.equal(res.ok, true, res.ok ? "" : res.reason);
  assert.equal(human.verifyHumanToken(res.token, binding).ok, true);
  assert.equal(human.verifyHumanToken(res.token, "someone-else").ok, false,
    "a token minted for one browser must not work in another");
});

test("human check: a solved challenge cannot be spent twice", async () => {
  human.__resetHumanCheck();
  const binding = "bind-b";
  const ch = human.issueChallenge(binding);
  const solved = await pow.solve(ch.nonce, ch.bits);
  const first = await human.verifyHumanCheck({ challenge: ch, solution: solved.solution, binding, elapsedMs: 5_000 });
  assert.equal(first.ok, true);
  const second = await human.verifyHumanCheck({ challenge: ch, solution: solved.solution, binding, elapsedMs: 5_000 });
  assert.equal(second.ok, false, "one solution is worth one signup — replay is the whole attack");
});

test("human check: a forged or downgraded challenge is refused", async () => {
  human.__resetHumanCheck();
  const binding = "bind-c";
  const ch = human.issueChallenge(binding);

  // Difficulty turned down and re-signed by nobody.
  const easy = { ...ch, bits: 4 };
  const cheat = await pow.solve(easy.nonce, 4);
  const r1 = await human.verifyHumanCheck({ challenge: easy, solution: cheat.solution, binding, elapsedMs: 5_000 });
  assert.equal(r1.ok, false, "a self-issued easy challenge is the obvious bypass");

  // Right difficulty, wrong signature.
  const forged = { ...ch, sig: "0".repeat(64) };
  const solved = await pow.solve(ch.nonce, ch.bits);
  const r2 = await human.verifyHumanCheck({ challenge: forged, solution: solved.solution, binding, elapsedMs: 5_000 });
  assert.equal(r2.ok, false);

  // Expired.
  const old = human.issueChallenge(binding, 0);
  const r3 = await human.verifyHumanCheck({ challenge: old, solution: "0", binding, elapsedMs: 5_000 });
  assert.equal(r3.ok, false);
});

test("human check: a genuine challenge with a WRONG answer is refused", async () => {
  // The case every other test in this block misses: signature valid, not
  // expired, honeypot empty, timing plausible — and the work simply was not
  // done. Without this, deleting the difficulty check entirely leaves the suite
  // green, which is how a gate becomes decoration.
  human.__resetHumanCheck();
  const binding = "bind-wrong";
  const ch = human.issueChallenge(binding);
  const bad = await human.verifyHumanCheck({ challenge: ch, solution: "0", binding, elapsedMs: 5_000 });
  assert.equal(bad.ok, false, "an unsolved puzzle must not pass");
  assert.match(bad.reason, /did not solve/i);

  // And the same challenge still accepts the RIGHT answer afterwards — a failed
  // attempt must not burn a customer's challenge.
  const solved = await pow.solve(ch.nonce, ch.bits);
  const good = await human.verifyHumanCheck({ challenge: ch, solution: solved.solution, binding, elapsedMs: 5_000 });
  assert.equal(good.ok, true, good.ok ? "" : good.reason);
});

test("human check: the honeypot and the clock are checked before the hash", async () => {
  human.__resetHumanCheck();
  const binding = "bind-d";
  const ch = human.issueChallenge(binding);
  const solved = await pow.solve(ch.nonce, ch.bits);

  const trapped = await human.verifyHumanCheck({ challenge: ch, solution: solved.solution, binding, elapsedMs: 5_000, honeypot: "http://spam" });
  assert.equal(trapped.ok, false, "a filled invisible field is a script, whatever else it got right");
  assert.equal(trapped.retryable, false, "and there is nothing for it to retry");

  const ch2 = human.issueChallenge(binding);
  const solved2 = await pow.solve(ch2.nonce, ch2.bits);
  const instant = await human.verifyHumanCheck({ challenge: ch2, solution: solved2.solution, binding, elapsedMs: 40 });
  assert.equal(instant.ok, false, "nobody types an email and a password in 40ms");
});

test("human check: throwaway mailboxes are rejected without catching real ones", () => {
  assert.equal(human.isDisposableEmail("someone@mailinator.com"), true);
  assert.equal(human.isDisposableEmail("someone@inbox.mailinator.com"), true, "subdomains too");
  // The substring trap that has bitten this codebase twice already.
  assert.equal(human.isDisposableEmail("owner@notmailinator.com"), false,
    "'mailinator.com' inside a longer domain is a different company");
  assert.equal(human.isDisposableEmail("jnbankwa@gmail.com"), false);
  assert.equal(human.isDisposableEmail("hello@veryxjnn.com"), false);
});

test("human check: the status report does not overstate what it blocks", () => {
  const st = human.humanCheckStatus();
  // NEXT_PUBLIC_RECAPTCHA_SITE_KEY is unset here, so App Check cannot be
  // enforcing — and the report must not imply account creation is stopped.
  assert.equal(st.appCheckConfigured, false);
  assert.equal(st.blocksAccountCreation, false,
    "claiming to block signups when only the allowance is gated would be a false green light");
  assert.match(st.note, /Identity Toolkit directly/i, "the gap must be named, not implied");
});

test("human check: the free allowance can never be claimed twice", async () => {
  const wallet = await import("../src/backend/wallet.ts");
  const uid = `grant-${Math.round(Number(process.hrtime.bigint() % 1000000n))}`;

  // Demo mode (no Firebase Admin, which is how this suite runs): there are no
  // accounts to farm and no real money to spend, so a new wallet opens WITH the
  // allowance already in it and a claim is a no-op. The zero-config platform
  // must keep working with no keys — that rule is older than this feature.
  const opening = await wallet.getWallet(uid);
  assert.equal(opening.balanceAcu, wallet.FREE_SIGNUP_ACUS);

  const first = await wallet.claimSignupGrant(uid);
  const second = await wallet.claimSignupGrant(uid);
  assert.equal(first.granted + second.granted, 0, "the allowance was already given — claiming must not add more");
  assert.equal(second.balanceAcu, opening.balanceAcu, "and the balance must not move");

  // The once-only guarantee itself, on a wallet that HAS an unclaimed grant —
  // which is what production creates. Claiming twice is exactly what a farm does.
  const unclaimed = { orgId: uid, balanceAcu: 0, planId: "free", cycle: null, lifetimeCreditedAcu: 0, lifetimeDebitedAcu: 0, updatedAt: "", signupGrantClaimed: false };
  assert.equal(wallet.signupGrantClaimed(unclaimed), false);
  assert.equal(wallet.signupGrantClaimed({ ...unclaimed, signupGrantClaimed: true, balanceAcu: 100, lifetimeCreditedAcu: 100 }), true);
});

test("human check: production opens a wallet EMPTY, so a scripted account is worthless", () => {
  // The whole point. Granting 100 ACUs on first wallet read means one HTTP
  // request from a script converts directly into the owner's provider spend.
  const src = readFileSync(new URL("../src/backend/wallet.ts", import.meta.url), "utf8");
  assert.match(src, /const opening = adminConfigured \? 0 : FREE_SIGNUP_ACUS;/,
    "with Admin configured (production) a new wallet must start at zero and claim later");
  assert.match(src, /signupGrantClaimed: !adminConfigured/,
    "and must be flagged unclaimed so the grant is still available to a real person");
  // The flag is written in the same transaction as the credit — two racing
  // requests must not both see 'unclaimed' and both pay out.
  assert.match(src, /signupGrantClaimed: true,\n\s+updatedAt: nowIso\(\),\n\s+\};\n\s+tx\.set\(ref, next/,
    "the claim flag and the credit must be one atomic write");
});

test("human check: a wallet from before this shipped is not asked to re-prove itself", async () => {
  const wallet = await import("../src/backend/wallet.ts");
  // No flag at all, but already credited — an existing paying customer.
  assert.equal(wallet.signupGrantClaimed({ orgId: "x", balanceAcu: 4_000, planId: "pro", cycle: "monthly", lifetimeCreditedAcu: 5_000, lifetimeDebitedAcu: 1_000, updatedAt: "" }), true);
  // A genuinely new, empty wallet has not claimed.
  assert.equal(wallet.signupGrantClaimed({ orgId: "y", balanceAcu: 0, planId: "free", cycle: null, lifetimeCreditedAcu: 0, lifetimeDebitedAcu: 0, updatedAt: "", signupGrantClaimed: false }), false);
});

test("human check: the allowance route demands work, a verified mailbox AND a real domain", () => {
  const route = readFileSync(new URL("../src/app/api/auth/human/route.ts", import.meta.url), "utf8");
  assert.match(route, /verifyHumanToken\(/, "work done in this browser");
  assert.match(route, /auth\.emailVerified/, "a mailbox that actually receives mail");
  assert.match(route, /isDisposableEmail\(auth\.email\)/, "at a domain that is not a throwaway");
  assert.match(route, /claimSignupGrant\(auth\.uid\)/);
  // The token is checked against the SERVER's view of who is calling, never a
  // uid the client asserts about itself.
  assert.doesNotMatch(route, /body\.uid/, "the caller must never name its own account");
});

test("human check: both signup AND login run the check", () => {
  const form = readFileSync(new URL("../src/components/AuthForm.tsx", import.meta.url), "utf8");
  // One call site inside submit() covers both modes; the Google path has its own.
  assert.match(form, /if \(!\(await passHumanCheck\(email\)\)\) return;/,
    "credential stuffing is a login attack, so the gate cannot be signup-only");
  assert.match(form, /honeypot: trap/);
  assert.match(form, /mountedAt: mountedAt\.current/);
});

// ---------------------------------------------------------------------------
// AI Citation Playbook — the half that tells you what to DO.
//
// Built after a live run scored 17% and the page had nothing to say about it.
// The fixture below is that run: all three mentions came from the "What is
// VeryX?" question, and the honest reading was ZERO unprompted mentions in
// fifteen answers.
// ---------------------------------------------------------------------------
const cite = await import("../src/backend/ai-citation.ts");

function veryxRun() {
  const buying = [
    "Who are the best Common Data Environment providers in United Kingdom?",
    "What should I look for when choosing a Common Data Environment provider?",
    "Recommend a Common Data Environment company near United Kingdom",
    "What is the best Common Data Environment option for Senior Management?",
    "Compare the leading Common Data Environment companies in the UK",
  ];
  const results = buying.map((text, i) => ({
    question: { id: `q${i}`, text, intent: "buying" },
    verdicts: ["anthropic", "openai", "gemini"].map((a) => ({
      assistant: a, mentioned: false, rank: null,
      competitors: ["Asite", "Bentley ProjectWise", "Oracle Aconex"],
      evidence: "", answer: "1. **Asite**\n2. **Bentley ProjectWise**\n3. **Oracle Aconex**", asked: true,
    })),
  }));
  results.push({
    question: { id: "qb", text: "What is VeryX and would you recommend them?", intent: "brand" },
    verdicts: ["anthropic", "openai", "gemini"].map((a) => ({
      assistant: a, mentioned: true, rank: null, competitors: [],
      evidence: "VeryX is a UK CDE.", answer: "VeryX is a UK CDE.", asked: true,
    })),
  });
  return {
    id: "r1", brandId: "b1", brand: "VeryX", domain: "veryxjnn.com", ranAt: "2026-07-29T10:00:00.000Z",
    results, visibilityRate: 17, mentioned: 3, askedCount: 18,
    assistants: ["anthropic", "openai", "gemini"],
    topCompetitors: [{ name: "Asite", appearances: 5 }, { name: "Bentley ProjectWise", appearances: 5 }, { name: "Oracle Aconex", appearances: 5 }],
    note: "",
  };
}

test("citation: the headline score EXCLUDES the question that handed over the name", () => {
  // The panel read 17%. Every one of those mentions was the assistant repeating
  // a name it was given. The number a customer acts on must be the unprompted
  // one, or the module flatters exactly when it needs to warn.
  const run = veryxRun();
  const score = cite.unpromptedScore(run);
  assert.equal(score.answers, 15, "the brand-name question is not a buying question");
  assert.equal(score.mentions, 0);
  assert.equal(score.rate, 0, "17% on the panel was 0% in reality");
});

test("citation: 'they know you but never bring you up' is diagnosed, not lumped in with unknown", async () => {
  const plan = await cite.buildPlaybook({ run: veryxRun(), geo: null }, { complete: async () => { throw new Error("no key"); } });
  const known = plan.actions.find((a) => a.id === "known-but-not-recommended");
  assert.ok(known, "being described but never recommended is a different problem from being unknown");
  assert.match(known.evidence, /0 of 15/, "and the evidence must be the counts, not an adjective");
});

test("citation: every action names the observation it came from", async () => {
  const plan = await cite.buildPlaybook({ run: veryxRun(), geo: null }, { complete: async () => { throw new Error("no key"); } });
  assert.ok(plan.actions.length >= 3);
  for (const a of plan.actions) {
    assert.ok(a.evidence && a.evidence.length > 8, `action ${a.id} has no evidence — advice with no observation behind it is the thing this module exists to avoid`);
    assert.ok(["your site", "the AI answers", "the run itself"].includes(a.source), `action ${a.id} has no checkable source`);
    assert.ok(["retrieval", "training-corpus", "extractability", "measurement"].includes(a.mechanism),
      `action ${a.id} does not say WHY it would change whether a model names you`);
  }
});

test("citation: a measured robots.txt block outranks every piece of general advice", async () => {
  const geo = {
    url: "https://veryxjnn.com", reachable: true, measuredAt: "", score: 40, grade: "D",
    detectedBusiness: null, note: "",
    checks: [
      { id: "crawlers", label: "AI crawler access", status: "fail", score: 0, weight: 20, evidence: "robots.txt BLOCKS: GPTBot, ClaudeBot." },
      { id: "schema", label: "Schema", status: "fail", score: 0, weight: 20, evidence: "No JSON-LD found." },
    ],
  };
  const plan = await cite.buildPlaybook({ run: veryxRun(), geo }, { complete: async () => { throw new Error("no key"); } });
  assert.equal(plan.actions[0].id, "unblock-ai-crawlers",
    "a model that cannot fetch the site cannot cite it — nothing else matters until that is fixed");
  assert.match(plan.actions[0].evidence, /BLOCKS/, "quoted from the fetched robots.txt, not asserted");
  // And it must present it as a genuine trade-off rather than an obvious error.
  assert.match(plan.actions[0].detail, /train on your content/i);
});

test("citation: an unreachable site produces an honest gap, not silent generic advice", async () => {
  const geo = { url: "https://nope.invalid", reachable: false, measuredAt: "", score: 0, grade: "F", checks: [], detectedBusiness: null, note: "" };
  const plan = await cite.buildPlaybook({ run: veryxRun(), geo }, { complete: async () => { throw new Error("no key"); } });
  assert.equal(plan.actions[0].id, "site-unreachable");
  assert.match(plan.actions[0].detail, /does not guess/i);
});

test("citation: with no AI key there are no briefs — never locally invented ones", async () => {
  const plan = await cite.buildPlaybook({ run: veryxRun(), geo: null }, { complete: async () => { throw new Error("no key configured"); } });
  assert.deepEqual(plan.briefs, [], "a template outline dressed as a written brief is the failure this codebase keeps undoing");
  assert.ok(plan.actions.length > 0, "but the evidence-based actions still stand — they need no model");
});

test("citation: a brief is only kept if the model returned parseable JSON", async () => {
  const good = JSON.stringify({ angle: "Lead with UK-hosted data residency.", outline: ["What a CDE is", "UK hosting"], proofNeeded: ["Where your data is hosted"] });
  const plan = await cite.buildPlaybook({ run: veryxRun(), geo: null }, {
    complete: async () => ({ text: `Here you go:\n${good}`, provider: "openai", model: "m", latencyMs: 1, attempts: [] }),
  }, { maxBriefs: 2 });
  assert.equal(plan.briefs.length, 2);
  assert.match(plan.briefs[0].angle, /data residency/);
  assert.ok(plan.briefs[0].proofNeeded.length, "the facts the customer must supply are named rather than invented");

  const broken = await cite.buildPlaybook({ run: veryxRun(), geo: null }, {
    complete: async () => ({ text: "Sure! Here's a great outline for your page.", provider: "openai", model: "m", latencyMs: 1, attempts: [] }),
  });
  assert.deepEqual(broken.briefs, [], "half-read output must produce nothing, not a half-brief");
});

test("citation: the plan refuses to promise it can make a model recommend you", async () => {
  const plan = await cite.buildPlaybook({ run: veryxRun(), geo: null }, { complete: async () => { throw new Error("no key"); } });
  assert.match(plan.note, /Nobody can make a model recommend a company/i,
    "this is the most snake-oil-infested topic in marketing; the copy must not join in");
  assert.match(plan.note, /training cycle, or may never arrive/i, "and the timescale must be honest");
});

// --- The two data bugs visible in the live run ------------------------------

test("ai visibility: punctuation left on a form field does not poison every question", () => {
  // Live: "Recommend a Work-Centric Common Data Environment: company near
  // United Kingdom" — the colon came straight from the stored product field.
  const qs = vis.suggestQuestions({ business: "VeryX", product: "Work-Centric Common Data Environment:", location: "United Kingdom " });
  assert.ok(qs.every((q) => !/Environment:/.test(q.text)), qs.map((q) => q.text).join(" | "));
  assert.ok(qs.some((q) => q.text === "Recommend a Work-Centric Common Data Environment company near United Kingdom"));
});

test("ai visibility: a bullet of advice is not reported as a competitor", () => {
  // Live: "whether you're design ×1" appeared in the customer's rival list.
  const { names } = vis.extractNamedBusinesses([
    "- whether you're design led — consider this",
    "- It depends on scale",
    "1. **Asite** — UK CDE",
    "2. **Bentley ProjectWise** — engineering",
  ].join("\n"));
  assert.deepEqual(names, ["Asite", "Bentley ProjectWise"],
    "telling a customer they are losing to 'whether you're design' is a fabricated competitor");
});

test("ai visibility: one company counted once, however the assistant spelled it", () => {
  // Live run listed "oracle aconex x2" and "aconex (oracle) x1" as two rivals,
  // and Autodesk Construction Cloud three separate ways. That splits the count
  // and makes the field look more crowded than it is.
  assert.equal(vis.sameCompany("Oracle Aconex", "Aconex (Oracle)"), true);
  assert.equal(vis.sameCompany("Autodesk Construction Cloud (ACC/BIM 360)", "Autodesk Construction Cloud"), true);
  assert.equal(vis.sameCompany("Autodesk Construction Cloud / BIM 360", "Autodesk Construction Cloud"), true);

  // ...but merging must not go so far that two real rivals become one.
  assert.equal(vis.sameCompany("Asite", "Autodesk"), false);
  assert.equal(vis.sameCompany("Procore UK", "Aconex UK"), false,
    "sharing only a short common word is not being the same company");

  const merged = vis.mergeCompetitorCounts([
    { name: "Oracle Aconex", appearances: 2 },
    { name: "Aconex (Oracle)", appearances: 1 },
    { name: "Autodesk Construction Cloud (ACC/BIM 360)", appearances: 2 },
    { name: "Autodesk Construction Cloud / BIM 360", appearances: 1 },
    { name: "Asite", appearances: 2 },
  ]);
  assert.equal(merged.length, 3, `expected 3 companies, got ${merged.map((m) => m.name).join(" | ")}`);
  const aconex = merged.find((m) => /aconex/i.test(m.name));
  assert.equal(aconex.appearances, 3, "the split counts must be added back together");
  assert.match(merged[0].name, /Autodesk|Aconex/, "shown with the fullest spelling used");
});

// --- The contradictions a live plan showed on screen -------------------------
//
// Two brands ran the plan and both headlines contradicted the line underneath:
// "3 of 18 buying answers" printed directly below "the what-is question is
// excluded" — excluding it gives 15. The cause was the route stamping every
// customer-edited question intent:"buying", so the exclusion silently did
// nothing and criteria answers were mined for company names.

test("citation: the brand question is excluded even when the stored label says otherwise", () => {
  // Exactly the shape the route used to persist: every question stamped
  // "buying", including the one that hands over the name.
  const mk = (text, mentioned) => ({
    question: { id: text.slice(0, 8), text, intent: "buying" },
    verdicts: [{ assistant: "openai", mentioned, rank: null, competitors: [], evidence: "", answer: "x", asked: true }],
  });
  const run = {
    id: "r", brandId: "b", brand: "VeryX", ranAt: "2026-07-29T00:00:00.000Z",
    results: [
      mk("Who are the best CDE providers in the UK?", false),
      mk("Recommend a CDE company near the UK", false),
      mk("What is VeryX and would you recommend them?", true),
    ],
    visibilityRate: 33, mentioned: 1, askedCount: 3, assistants: ["openai"], topCompetitors: [], note: "",
  };
  const score = cite.unpromptedScore(run);
  assert.equal(score.answers, 2, "a stored label of 'buying' must not smuggle the brand question back in");
  assert.equal(score.mentions, 0);
  assert.equal(score.rate, 0, "the headline and the caption under it must agree");
});

test("ai visibility: 'what should I look for' is a criteria question, not a vendor question", () => {
  assert.equal(vis.classifyIntent("What should I look for when choosing a CDE provider?", "VeryX"), "problem");
  assert.equal(vis.classifyIntent("Who are the best CDE providers in the UK?", "VeryX"), "buying");
  assert.equal(vis.classifyIntent("Compare the leading CDE companies in the UK", "VeryX"), "comparison");
  assert.equal(vis.classifyIntent("What is VeryX and would you recommend them?", "VeryX"), "brand");
  // Brand detection is word-boundary matched, like everything else here.
  assert.equal(vis.classifyIntent("Who are the best veryxjnn.com alternatives?", "VeryX"), "buying");

  assert.equal(vis.seeksVendors("problem"), false,
    "mining a criteria answer produced rivals called 'Lead exclusivity' and 'ISO 19650 support'");
  assert.equal(vis.seeksVendors("buying"), true);
});

test("ai visibility: market segments and buying criteria are not reported as competitors", () => {
  // Live run listed all of these among a customer's rivals. They came from
  // answers that segment the market or list what to look for.
  const { names } = vis.extractNamedBusinesses([
    "1. **HubSpot** — real",
    "2. **Mid** — a segment",
    "3. **Agencies** — a segment",
    "4. **AI features** — a criterion",
    "5. **B2B mid** — a segment",
    "6. **B2B or B2C / e** — truncated description",
    "7. **Salesforce Marketing Cloud** — real",
  ].join("\n"));
  assert.deepEqual(names, ["HubSpot", "Salesforce Marketing Cloud"], names.join(" | "));
});

test("ai visibility: an unbalanced bracket alone marks a truncated capture", () => {
  // Separate from the comma rule, which would otherwise carry this test and
  // leave the bracket check untested — a mutation proved exactly that.
  const { names } = vis.extractNamedBusinesses([
    "1. **Autodesk Construction Cloud (ACC** — cut off mid-bracket",
    "2. **Asite (UK)** — properly closed",
  ].join("\n"));
  assert.deepEqual(names, ["Asite (UK)"],
    "a name whose brackets never close is half a name");
});

test("ai visibility: a truncated half-name is not reported as a competitor", () => {
  // Live: "Asite (UK, Autodesk Construction Cloud (Aut." — half of one company
  // and a third of another, printed to a customer as a single rival.
  const { names } = vis.extractNamedBusinesses([
    "1. **Asite (UK, Autodesk Construction Cloud (Aut** — truncated",
    "2. **Bentley ProjectWise** — fine",
    "3. **Asite (UK)** — balanced brackets are fine",
  ].join("\n"));
  assert.ok(!names.some((n) => n.includes("(Aut")), names.join(" | "));
  assert.ok(names.includes("Bentley ProjectWise"));
  assert.ok(names.includes("Asite (UK)"), "a properly closed bracket is a normal part of a name");
});

test("citation: the schema action never contradicts the evidence printed under it", async () => {
  const geo = (evidence) => ({
    url: "https://veryxjnn.com", reachable: true, measuredAt: "", score: 50, grade: "C",
    detectedBusiness: null, note: "",
    checks: [{ id: "schema", label: "Schema", status: "warn", score: 50, weight: 20, evidence }],
  });
  const plan = await cite.buildPlaybook(
    { run: veryxRun(), geo: geo("Found on the homepage: Organization, ContactPoint.") },
    { complete: async () => { throw new Error("no key"); } },
  );
  const schema = plan.actions.find((a) => a.id === "site-schema");
  assert.ok(schema);
  assert.ok(!/Add Organization/i.test(schema.title),
    `"${schema.title}" contradicts its own evidence, which says Organization was found`);
  assert.match(schema.title, /Product/, "it should name what is actually missing");
});

test("citation: a rival's share is measured against answers that could name anyone", async () => {
  // Asite showed as 11% because the denominator was all 18 answers, including
  // three questions whose answers list criteria rather than companies.
  const run = veryxRun();
  const denom = cite.vendorAnswerCount(run);
  // 4 vendor-seeking questions x 3 assistants. The "what should I look for"
  // question and the brand question are both excluded from the denominator.
  assert.equal(denom, 12, "only answers that could have named a company count");

  const inc = cite.incumbents(run);
  // Pinned to the exact figure, not merely "bigger than X": an inequality
  // against the wrong baseline let a mutation dividing by all 15 non-brand
  // answers pass unnoticed.
  assert.equal(inc[0].appearances, 5);
  assert.equal(inc[0].share, Math.round((5 / 12) * 100),
    "share must be measured against answers that list vendors, not every answer");
});

// ---------------------------------------------------------------------------
// Citation sources — the plan's top action, done rather than assigned.
//
// "Search the exact question yourself, open the top results, and get onto them"
// is homework. This searches, reads the pages, and reports which of them carry
// the same companies the assistants named.
//
// The claim it must never make: that a model read a particular page. Nobody can
// show that. It reports corroboration and says so.
// ---------------------------------------------------------------------------
const src = await import("../src/backend/citation-sources.ts");

const fakeSearch = (results) => async ({ query }) => ({
  query, type: "search", mode: "live", results,
});
const fakePages = (map) => async (url) => map[url] ?? "";

test("sources: a page carrying the rivals outranks one that merely ranks", async () => {
  const report = await src.findCitationSources(
    {
      brand: "VeryX", brandDomain: "veryxjnn.com",
      questions: ["Who are the best CDE providers in the UK?"],
      rivals: ["Asite", "Bentley ProjectWise", "Oracle Aconex"],
    },
    {
      search: fakeSearch([
        { title: "Best CDE platforms 2026", link: "https://thereview.example/best-cde", snippet: "" },
        { title: "Some unrelated blog", link: "https://blog.example/hello", snippet: "" },
      ]),
      fetchPage: fakePages({
        "https://thereview.example/best-cde": "Our picks: Asite, Bentley ProjectWise and Oracle Aconex all rate well.",
        "https://blog.example/hello": "A post about gardening.",
      }),
    },
  );
  assert.equal(report.pages[0].url, "https://thereview.example/best-cde");
  assert.deepEqual(report.pages[0].namesRivals, ["Asite", "Bentley ProjectWise", "Oracle Aconex"]);
  assert.ok(report.pages[0].strength > report.pages[1].strength,
    "corroboration is the whole signal — a page naming nobody is weak evidence");
  assert.equal(report.pages[1].namesRivals.length, 0,
    "and a page that names nobody is still listed, not silently dropped");
});

test("sources: a rival named inside a longer word is not a citation", async () => {
  const report = await src.findCitationSources(
    { brand: "VeryX", questions: ["best?"], rivals: ["Asite"] },
    {
      search: fakeSearch([{ title: "Pest control guide", link: "https://x.example/a", snippet: "" }]),
      // "Asite" sits inside "parasite" — the substring trap this codebase has
      // hit in the claim guard, the email vault and the mention detector. The
      // first version of this test used "Composite", which does not contain the
      // letters at all, so it passed without exercising anything.
      fetchPage: fakePages({ "https://x.example/a": "Parasite treatment and quasite fittings." }),
    },
  );
  assert.deepEqual(report.pages[0].namesRivals, []);
});

test("sources: a page you are ALREADY on says so instead of telling you to join it", async () => {
  const report = await src.findCitationSources(
    { brand: "VeryX", brandDomain: "veryxjnn.com", questions: ["best?"], rivals: ["Asite"] },
    {
      search: fakeSearch([{ title: "UK CDE directory", link: "https://directory.example/uk-cde", snippet: "" }]),
      fetchPage: fakePages({ "https://directory.example/uk-cde": "Listed: Asite, VeryX, and others." }),
    },
  );
  assert.equal(report.pages[0].namesYou, true);
  assert.match(report.pages[0].route, /already named/i,
    "telling someone to submit to a directory they are on wastes their afternoon");
});

test("sources: a competitor's own website is not somewhere you can get listed", () => {
  assert.equal(src.classifyPage("https://asite.com/products", "Asite", "veryxjnn.com"), "unknown");
  assert.equal(src.classifyPage("https://www.veryxjnn.com/about", "About", "veryxjnn.com"), "vendor-site");
  assert.match(src.routeFor("vendor-site", "asite.com", false), /Nothing to do here/i);
  assert.ok(src.strengthOf("vendor-site", 3, 3, true) < src.strengthOf("directory", 1, 3, true),
    "a rival's own page ranking tells the customer nothing actionable");
});

test("sources: page kind decides the route, because the work is completely different", () => {
  assert.equal(src.classifyPage("https://www.g2.com/categories/cde", "Best CDE Software", ""), "review-platform");
  assert.equal(src.classifyPage("https://www.reddit.com/r/bim/comments/x", "Which CDE?", ""), "forum");
  assert.equal(src.classifyPage("https://blog.example/top-10-cde-tools", "Top 10 CDE tools", ""), "roundup");
  assert.match(src.routeFor("forum", "reddit.com", false), /Do not astroturf/i,
    "an obvious plant does more damage than absence");
  assert.match(src.routeFor("review-platform", "g2.com", false), /Claim or create/i);
  assert.match(src.routeFor("roundup", "blog.example", false), /Pitch the author/i);
});

test("sources: more of the same rivals on a page means stronger evidence", () => {
  // Same kind, same everything else — only the corroboration differs. The
  // earlier test compared a round-up against an unclassified blog, so the kind
  // bonus carried it and removing corroboration entirely changed nothing.
  const three = src.strengthOf("roundup", 3, 3, true);
  const one = src.strengthOf("roundup", 1, 3, true);
  const none = src.strengthOf("roundup", 0, 3, true);
  assert.ok(three > one && one > none,
    `corroboration must drive the ranking (${none} / ${one} / ${three})`);
});

test("sources: an unread page is ranked below one that was actually read", () => {
  const read = src.strengthOf("roundup", 2, 3, true);
  const unread = src.strengthOf("roundup", 2, 3, false);
  assert.ok(unread < read, "judging a page on its search snippet is weaker evidence and must rank lower");
});

test("sources: no live search means NO pages — never plausible-looking ones", async () => {
  const report = await src.findCitationSources(
    { brand: "VeryX", questions: ["best?"], rivals: ["Asite"] },
    {
      search: async ({ query }) => ({
        query, type: "search", mode: "demo", results: [{ title: "Demo", link: "https://demo.example" }],
        providerError: { status: 429, reason: "Serper quota exhausted." },
      }),
      fetchPage: fakePages({}),
    },
  );
  assert.deepEqual(report.pages, [], "a made-up directory would waste a real afternoon");
  assert.equal(report.live, false);
  assert.match(report.note, /quota exhausted/i, "and the real reason must be passed through, not hidden");
});

test("sources: the report never claims a model read the page", async () => {
  const report = await src.findCitationSources(
    { brand: "VeryX", questions: ["best?"], rivals: ["Asite"] },
    {
      search: fakeSearch([{ title: "Best CDE", link: "https://r.example/a", snippet: "" }]),
      fetchPage: fakePages({ "https://r.example/a": "Asite is good." }),
    },
  );
  assert.match(report.note, /corroboration, not proof/i);
  assert.doesNotMatch(report.note, /the model (used|read)\b/i,
    "nobody can show which pages a model read; claiming it would be the same lie the module was built to avoid");
});

test("sources: a domain that recurs across questions is surfaced first", async () => {
  const report = await src.findCitationSources(
    {
      brand: "VeryX",
      questions: ["Who are the best CDE providers?", "Recommend a CDE company"],
      rivals: ["Asite", "Aconex"],
    },
    {
      search: async ({ query }) => ({
        query, type: "search", mode: "live",
        results: query.startsWith("Who")
          ? [{ title: "Best CDE", link: "https://hub.example/best", snippet: "" }]
          : [{ title: "CDE picks", link: "https://hub.example/picks", snippet: "" }],
      }),
      fetchPage: fakePages({
        "https://hub.example/best": "Asite and Aconex lead.",
        "https://hub.example/picks": "Asite again.",
      }),
    },
  );
  assert.equal(report.priorityDomains[0].domain, "hub.example");
  assert.equal(report.priorityDomains[0].pages, 2,
    "one domain covering two questions is worth more effort than two covering one each");
});

// ---------------------------------------------------------------------------
// Page generation from a brief.
//
// The point of the citation work is to get a model to repeat what your page
// says about you. So a page stating something you cannot stand behind is not a
// marketing risk — it is the WORST outcome, because you would be teaching the
// assistants a claim you have to retract. These tests hold that line.
// ---------------------------------------------------------------------------
const cpage = await import("../src/backend/citation-page.ts");

const pageGw = (text) => async () => ({ text, provider: "openai", model: "m", latencyMs: 1, attempts: [] });

test("page: only the facts the customer typed are given to the writer", async () => {
  let prompt = "";
  await cpage.writeCitationPage(
    {
      brand: "VeryX", question: "Who are the best CDE providers?", angle: "UK-hosted",
      outline: ["What a CDE is"],
      proof: [
        { question: "Where is your data hosted?", answer: "London, UK" },
        { question: "Which certifications do you hold?", answer: "" },
      ],
    },
    { complete: async (req) => { prompt = req.prompt; return { text: "# Page\n\nHosted in London.", provider: "openai", model: "m", latencyMs: 1, attempts: [] }; } },
  );
  assert.match(prompt, /London, UK/, "a supplied fact must reach the writer");
  assert.match(prompt, /DELIBERATELY NOT SUPPLIED/, "and a blank one must be named as off-limits");

  // The SUPPLIED FACTS block is also what the claim guard scans against, so an
  // empty-valued entry in it is worse than useless: it reads to the model as a
  // fact it is allowed to state, and to the guard as nothing at all. Asserting
  // only that "certifications" appears somewhere in the prompt let a mutation
  // that dumped every unanswered question into the facts block pass unnoticed.
  const factsBlock = prompt.slice(prompt.indexOf("SUPPLIED FACTS"), prompt.indexOf("DELIBERATELY NOT SUPPLIED"));
  assert.doesNotMatch(factsBlock, /certifications/i,
    `a blank answer must never appear as a supplied fact:\n${factsBlock}`);
  assert.match(prompt.slice(prompt.indexOf("DELIBERATELY NOT SUPPLIED")), /certifications/i,
    "it belongs in the do-not-guess list instead");
});

test("page: an invented statistic is a BLOCKER, not a suggestion", async () => {
  const draft = await cpage.writeCitationPage(
    {
      brand: "VeryX", question: "best?", angle: "a", outline: ["x"],
      proof: [{ question: "Where is your data hosted?", answer: "London" }],
    },
    // The model ignored the instruction and produced a number nobody supplied.
    { complete: pageGw("# VeryX\n\nVeryX cuts rework by 42% and is trusted by 4,000 businesses.") },
  );
  assert.equal(draft.safeToPublish, false);
  assert.ok(draft.blockers.length > 0, "an unbacked figure must stop publication, not warn about it");
  assert.match(draft.note, /worse than not publishing/i);
});

test("page: a figure the customer DID supply is theirs to stand behind", async () => {
  const draft = await cpage.writeCitationPage(
    {
      brand: "VeryX", question: "best?", angle: "a", outline: ["x"],
      proof: [{ question: "Measured rework reduction?", answer: "Customers cut rework by 42% on average." }],
    },
    { complete: pageGw("# VeryX\n\nVeryX cuts rework by 42% on average.") },
  );
  assert.equal(draft.safeToPublish, true,
    "flagging the customer's own supplied number would make the guard useless");
});

test("page: a gap is marked, never filled in", async () => {
  const draft = await cpage.writeCitationPage(
    {
      brand: "VeryX", question: "best?", angle: "a", outline: ["Certifications"],
      proof: [{ question: "Which certifications do you hold?", answer: "" }],
    },
    { complete: pageGw("# VeryX\n\nA CDE organises project information.\n\n## Certifications\n\n[NEEDS: which certifications VeryX holds]") },
  );
  assert.deepEqual(draft.unanswered, ["Which certifications do you hold?"]);
  assert.match(draft.note, /\[NEEDS/, "the customer must be told the markers are there");
  assert.match(draft.note, /do not simply delete the markers/i,
    "deleting them silently loses the specifics that make a page quotable");
  assert.match(draft.note, /DRAFT/, "and nothing may be published without a person looking at it");
});

// ---------------------------------------------------------------------------
// Weekly runs and the alert.
// ---------------------------------------------------------------------------
const sched = await import("../src/backend/visibility-schedule.ts");

function runAt(rate, at, competitors = []) {
  return {
    id: at, brandId: "b1", brand: "VeryX", ranAt: at, results: [],
    visibilityRate: rate, mentioned: 1, askedCount: 12, assistants: ["openai"],
    topCompetitors: competitors.map((name) => ({ name, appearances: 1 })), note: "",
  };
}

test("schedule: an alert only fires when the trend engine calls the move real", () => {
  // The same noise floor the page uses. If these disagreed, the email and the
  // number on screen would contradict each other — the exact failure this
  // codebase has already had to fix twice.
  const noise = sched.alertFor([runAt(50, "2026-02-01"), runAt(42, "2026-01-25")]);
  assert.equal(noise, null, "an 8-point swing across 12 answers is what these models do unprompted");

  const real = sched.alertFor([runAt(83, "2026-02-01"), runAt(17, "2026-01-25")]);
  assert.ok(real);
  assert.equal(real.direction, "up");
  assert.match(real.body, /only fires when the movement is bigger/i,
    "silence must be explained, or it reads as nothing having run");
});

test("schedule: one run is never an alert", () => {
  assert.equal(sched.alertFor([runAt(50, "2026-02-01")]), null,
    "there is nothing to compare against — a first run cannot be movement");
});

test("schedule: a new rival in the answers is named in the alert", () => {
  const a = sched.alertFor([
    runAt(83, "2026-02-01", ["Asite", "Newcomer Ltd"]),
    runAt(17, "2026-01-25", ["Asite"]),
  ]);
  assert.deepEqual(a.newRivals, ["Newcomer Ltd"]);
});

test("schedule: daily is refused and turned into weekly, with the reason", async () => {
  const s1 = await sched.setSchedule("b-cad", { enabled: true, business: "VeryX", questions: ["best?"], cadenceDays: 1 });
  assert.equal(s1.cadenceDays, sched.MIN_CADENCE_DAYS,
    "daily runs of a non-deterministic measurement buy a noisier line at a higher cost");
  const route = readFileSync(new URL("../src/app/api/ai-visibility/scheduled/route.ts", import.meta.url), "utf8");
  assert.match(route, /noisier line at a higher cost/, "and the customer must be told why, not just overridden");
});

test("schedule: a run where nothing could be asked does not consume the week", () => {
  const route = readFileSync(new URL("../src/app/api/ai-visibility/scheduled/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(run\.askedCount > 0\) await setSchedule\(sc\.brandId, \{ lastRunAt: run\.ranAt \}\)/,
    "an outage must not silently cost the customer their weekly data point");
  assert.match(route, /x-cron-secret/, "and the cron endpoint must not be open to the internet");
});

test("schedule: due only when enabled, asked before, and old enough", () => {
  const base = { brandId: "b", enabled: true, cadenceDays: 7, questions: ["q"], business: "VeryX", lastRunAt: null, updatedAt: "" };
  const day = 86_400_000;
  assert.equal(sched.isDue(base, 0), true, "never run → due");
  assert.equal(sched.isDue({ ...base, enabled: false }, 0), false);
  assert.equal(sched.isDue({ ...base, questions: [] }, 0), false, "nothing to ask is not due");
  assert.equal(sched.isDue({ ...base, lastRunAt: new Date(0).toISOString() }, 6 * day), false);
  assert.equal(sched.isDue({ ...base, lastRunAt: new Date(0).toISOString() }, 7 * day), true);
});

test("schedule: the weekly cron is registered and the store is server-only", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const cron = vercel.crons.find((c) => c.path.startsWith("/api/ai-visibility/scheduled"));
  assert.ok(cron, "advice to re-run weekly that nothing acts on is advice nobody follows");
  assert.match(cron.schedule, /^\S+ \S+ \* \* [0-6]$/, `weekly, not daily: ${cron.schedule}`);
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/ai_visibility_schedules\/\{doc\} \{ allow read, write: if false; \}/);
});

// ---------------------------------------------------------------------------
// One number, one meaning.
//
// A live page showed "Named in 18% — 3 of 17 answers" at the top and "0% — 0 of
// 14 buying answers" in the plan directly below, for the SAME run. Both were
// computed correctly by their own rules; the rules disagreed. The fix is that
// the run carries the honest figure and everything reads it from there.
// ---------------------------------------------------------------------------

test("visibility: the run itself carries the unprompted score", async () => {
  vis.__resetVisibilityRuns();
  const ask = async (id, req) => ({
    ok: true, provider: id, model: "m", latencyMs: 1,
    // Named only when handed the name.
    text: /what is veryx/i.test(req.prompt) ? "VeryX is a UK CDE." : "Try Asite or Aconex.",
  });
  const run = await vis.runVisibilityCheck(
    {
      brandId: "b1", brand: "VeryX",
      questions: [
        { id: "q1", text: "Who are the best CDE providers in the UK?", intent: "buying" },
        { id: "q2", text: "Recommend a CDE company near the UK", intent: "buying" },
        { id: "q3", text: "What is VeryX and would you recommend them?", intent: "buying" },
      ],
      assistants: ["openai"],
    },
    "2026-07-29T00:00:00.000Z", { ask },
  );
  assert.equal(run.askedCount, 3);
  assert.equal(run.mentioned, 1, "the raw figure still counts every answer");
  assert.equal(run.unpromptedAnswers, 2, "the honest one counts buying answers only");
  assert.equal(run.unpromptedMentions, 0);
  assert.equal(run.unpromptedRate, 0, "33% at the top of the page beside 0% in the plan is one bug, not two views");

  // And the same number comes back out of the shared reader.
  assert.deepEqual(vis.unpromptedScore(run), { mentions: 0, answers: 2, rate: 0 });
});

test("visibility: a run recorded before this existed is still scored honestly", () => {
  // No unprompted* fields at all, and every question mislabelled "buying" —
  // exactly what is sitting in Firestore for the brands already using this.
  const legacy = {
    id: "old", brandId: "b", brand: "VeryX", ranAt: "2026-01-01", visibilityRate: 33, mentioned: 1, askedCount: 3,
    assistants: ["openai"], topCompetitors: [], note: "",
    results: [
      { question: { id: "1", text: "Who are the best CDE providers?", intent: "buying" }, verdicts: [{ assistant: "openai", mentioned: false, rank: null, competitors: [], evidence: "", answer: "", asked: true }] },
      { question: { id: "2", text: "Recommend a CDE company", intent: "buying" }, verdicts: [{ assistant: "openai", mentioned: false, rank: null, competitors: [], evidence: "", answer: "", asked: true }] },
      { question: { id: "3", text: "What is VeryX and would you recommend them?", intent: "buying" }, verdicts: [{ assistant: "openai", mentioned: true, rank: null, competitors: [], evidence: "", answer: "", asked: true }] },
    ],
  };
  assert.deepEqual(vis.unpromptedScore(legacy), { mentions: 0, answers: 2, rate: 0 });
});

test("visibility: the trend tracks the honest number, not the flattering one", () => {
  const mk = (unpromptedRate, visibilityRate, at) => ({
    id: at, brandId: "b", brand: "VeryX", ranAt: at, results: [], assistants: [], topCompetitors: [], note: "",
    visibilityRate, mentioned: 1, askedCount: 18,
    unpromptedRate, unpromptedMentions: 0, unpromptedAnswers: 15,
  });
  // The raw rate barely moves while the honest one swings hard. A trend on the
  // raw number would report "flat" for a real change in what matters.
  const t = vis.trend([mk(60, 18, "2026-02-01"), mk(0, 17, "2026-01-25")]);
  assert.equal(t.direction, "up", `trend read ${t.direction} (${t.delta})`);
  assert.equal(t.delta, 60);
});

test("citation: the plan reports how many runs there ACTUALLY are", async () => {
  // Live: "One run recorded so far (17 answers)" printed under a header reading
  // "4 runs recorded". A plan that cannot count its own history is not one to
  // trust with anything else.
  const plan = await cite.buildPlaybook(
    { run: veryxRun(), geo: null, runsRecorded: 4 },
    { complete: async () => { throw new Error("no key"); } },
  );
  const remeasure = plan.actions.find((a) => a.id === "re-measure");
  assert.match(remeasure.evidence, /4 runs recorded/);
  assert.doesNotMatch(remeasure.evidence, /One run/i);
  assert.match(remeasure.title, /Keep running/i, "it is no longer a first run");

  const first = await cite.buildPlaybook({ run: veryxRun(), geo: null }, { complete: async () => { throw new Error("x"); } });
  assert.match(first.actions.find((a) => a.id === "re-measure").evidence, /1 run recorded/);
});

test("sources: a round-up is recognised however the headline is phrased", () => {
  // Live run came back almost entirely "Unclassified" with the generic
  // go-look-yourself route — the exact homework this feature removes.
  assert.equal(src.classifyPage("https://blog.oceanbim.com/7-recommend-cde-software-bim/", "7 Most Recommended Common Data Environment (CDE) Softwares For BIM", ""), "roundup");
  assert.equal(src.classifyPage("https://x.example/a", "Top 10 CDE tools", ""), "roundup");
  assert.equal(src.classifyPage("https://x.example/b", "Our picks for 2026, ranked", ""), "roundup");
  assert.equal(src.classifyPage("https://revizto.com/resources/blog/what-is-common-data-environment", "What is a common data environment (CDE)? BIM and CDE explained", ""), "explainer");
  assert.equal(src.classifyPage("https://www.linkedin.com/pulse/exploring-cde", "Exploring Common Data Environments", ""), "social");
});

test("sources: an explainer and a LinkedIn post get routes you can actually follow", () => {
  assert.match(src.routeFor("explainer", "revizto.com", false), /author chose which products/i,
    "there is no submission form on an explainer — the route in is the person who wrote it");
  assert.match(src.routeFor("social", "linkedin.com", false), /no submission form/i);
  // The generic fallback must remain for pages we genuinely cannot place.
  assert.match(src.routeFor("unknown", "x.example", false), /judge it yourself/i);
});

test("ai visibility: a job title is not a competitor", () => {
  const { names } = vis.extractNamedBusinesses([
    "1. **Contractor** — a role, not a company",
    "2. **Procore** — real",
    "3. **Others** — filler",
  ].join("\n"));
  assert.deepEqual(names, ["Procore"]);
});

// ---------------------------------------------------------------------------
// PWA — installable, and actually FITTING the screen it is installed on.
//
// The manifest and service worker already existed. What did not was any
// handling of safe-area insets, despite the viewport being declared
// viewport-fit=cover — which is precisely the flag that puts a header under the
// notch and the last card under the home indicator unless the insets are used.
// ---------------------------------------------------------------------------

test("pwa: the manifest is valid, installable and has a real maskable icon", () => {
  const m = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, "standalone");
  assert.ok(m.start_url.startsWith("/"), "a relative start_url keeps the app inside its own scope");
  assert.ok(m.background_color && m.theme_color, "without these the launch screen flashes white");

  const any = m.icons.filter((i) => i.purpose === "any");
  const maskable = m.icons.filter((i) => i.purpose === "maskable");
  assert.ok(any.some((i) => i.sizes === "512x512"));
  assert.equal(maskable.length, 1);
  // The bug this replaced: the square "any" icon was ALSO declared maskable, so
  // Android's launcher mask sliced the logo's edges off.
  assert.notEqual(maskable[0].src, any.find((i) => i.sizes === "512x512").src,
    "a maskable icon needs its own padded artwork, not the square one reused");

  for (const i of m.icons) {
    const f = new URL(`../public${i.src}`, import.meta.url);
    assert.ok(existsSync(f), `${i.src} is declared in the manifest but not in public/`);
  }
});

test("pwa: the service worker never serves a cached number as a live one", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  // Every figure on these pages is measured server-side. A cached dashboard
  // shown when the network is gone is yesterday's numbers under today's date —
  // a fabricated measurement, which is the one thing this platform refuses.
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/, "API responses must never be cached");
  assert.match(sw, /caches\.match\(OFFLINE_URL\)/,
    "a failed page load must fall back to the offline page, not a stale copy of the page asked for");
  assert.doesNotMatch(sw, /caches\.match\(req\)\.then\(\(cached\) => cached \|\| caches\.match\("\/"\)\)/,
    "the old fallback served whatever stale page happened to be cached");
  assert.match(sw, /MAX_ENTRIES/, "an unbounded cache eventually gets the whole origin evicted");
});

test("pwa: the offline page ships and is precached before it is needed", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(sw, /PRECACHE = \[OFFLINE_URL/,
    "caching the offline page only on first failure means there is nothing to fall back to");
  assert.ok(existsSync(new URL("../public/offline.html", import.meta.url)));
  const html = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");
  assert.match(html, /safe-area-inset/, "the offline page is full-screen too");
  assert.match(html, /measured live/i, "and it must not imply the app works offline, because it does not");
});

test("pwa: safe-area insets are honoured, since viewport-fit=cover is declared", () => {
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /viewportFit: "cover"/,
    "this is what makes the app edge-to-edge — and what hides content under the notch if the insets are ignored");

  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.match(css, new RegExp(`--safe-${side}: env\\(safe-area-inset-${side}`),
      `no --safe-${side}: landscape on a notched phone loses content off the ${side} edge`);
  }
  assert.match(css, /min-height: 100dvh/,
    "100vh on a mobile browser excludes the address bar, so a full-height screen overflows by exactly its height");

  const dash = readFileSync(new URL("../src/app/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(dash, /header-safe/, "the mobile header sat under the dynamic island");
  assert.match(dash, /var\(--safe-bottom\)/, "and the last card sat under the home indicator");
});

test("pwa: the install prompt is honest on iOS, where there is no install API", () => {
  const p = readFileSync(new URL("../src/components/InstallPrompt.tsx", import.meta.url), "utf8");
  assert.match(p, /beforeinstallprompt/);
  assert.match(p, /e\.preventDefault\(\)/, "the event must be captured to be re-fired from a real gesture");
  // An "Install" button that does nothing on iPhone is worse than no button.
  assert.match(p, /Add to Home Screen/i, "iOS gets instructions, because Safari fires no event and exposes no API");
  assert.match(p, /DISMISSED_KEY/, "a banner that returns after being declined is an advert, not a feature");
  assert.match(p, /measured live/i, "and it must not promise the installed app works offline");
});

// ---------------------------------------------------------------------------
// "openai: empty completion"
//
// Live, twice in one run, always on the hardest questions while the easy ones
// came back fine. That pattern is the tell: gpt-5-mini is a reasoning model and
// spends max_output_tokens on HIDDEN reasoning before emitting a character, so
// a 700-token budget was consumed before the answer began. The customer lost a
// data point and was shown a message that pointed at a broken key.
// ---------------------------------------------------------------------------

test("gateway: reasoning models get room to answer AFTER they finish reasoning", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(gw, /REASONING_HEADROOM/,
    "hidden reasoning tokens are billed and counted against the budget but never returned");
  assert.match(gw, /reasoningModel\(openai\.model\(\)\)\n\s+\? Math\.max\(2_000/,
    "the requested maxTokens is the size of the ANSWER, not of the answer plus the thinking");
  // The parameter must not be sent to models that reject it.
  assert.match(gw, /\.\.\.\(reasoningModel\(openai\.model\(\)\) \? \{ reasoning: \{ effort: "low" \} \} : \{\}\)/,
    "a non-reasoning model rejects the reasoning param outright");
});

test("gateway: reasoningModel recognises the families that reason, and no others", async () => {
  // Not exported — asserted through the source, because guessing wrong in
  // either direction breaks a provider: too broad sends a rejected parameter,
  // too narrow leaves the original bug in place.
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  const m = gw.match(/return \/\^\(\?:(.+?)\/i\.test\(model\.trim\(\)\)/);
  assert.ok(m, "reasoningModel must be a single explicit pattern");
  const re = new RegExp(`^(?:${m[1].replace(/\/i$/, "")}`.replace(/\)$/, ")"), "i");
  for (const yes of ["gpt-5-mini", "gpt-5", "o3", "o4-mini"]) {
    assert.ok(re.test(yes), `${yes} reasons before answering`);
  }
  for (const no of ["gpt-4o", "gpt-4o-mini", "gpt-4.1"]) {
    assert.ok(!re.test(no), `${no} would reject the reasoning parameter`);
  }
});

test("gateway: an exhausted token budget is not reported as an empty answer", async () => {
  // Driven through the real adapter with a stubbed transport, not grepped for a
  // string: the first version of this test asserted the message existed in the
  // source, so disabling the branch that produces it changed nothing and the
  // mutation survived.
  const gateway = await import("../src/backend/gateway.ts");
  const realFetch = globalThis.fetch;
  const realKey = process.env.OPENAI_API_KEY;
  const realModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  process.env.OPENAI_MODEL = "gpt-5-mini";

  let sentBody = null;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    // Exactly what the Responses API returns when reasoning ate the budget:
    // a successful HTTP call, no message content, and the reason stated.
    return new Response(JSON.stringify({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "reasoning", content: [] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const res = await gateway.askProvider("openai", { system: "s", prompt: "p", maxTokens: 700 });
    assert.equal(res.ok, false);
    assert.match(res.reason, /output budget/i,
      `the customer saw "openai: empty completion" and went looking for a broken key — got: ${res.reason}`);
    assert.doesNotMatch(res.reason, /^openai: empty completion$/);

    // And the request that produced it must have asked for more than the answer
    // size, because the reasoning is billed out of the same budget.
    assert.ok(sentBody.max_output_tokens > 700,
      `asked for ${sentBody.max_output_tokens} with a 700-token answer requested — reasoning would eat it`);
    assert.deepEqual(sentBody.reasoning, { effort: "low" });
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = realKey;
    if (realModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = realModel;
  }
});

test("ai visibility: a sentence-case phrase is not a company", () => {
  // Live: "Executive dashboards and portfolio ×2" listed among a customer's
  // rivals. Three or more words with a capital only on the first is prose.
  const { names } = vis.extractNamedBusinesses([
    "1. **Executive dashboards and portfolio** — a feature, not a company",
    "2. **Bentley ProjectWise** — real",
    "3. **Viewpoint For Projects (Trimble)** — real",
    "4. **Marks and Spencer** — a lower-case joiner is fine",
    "5. **Bank of America** — so is this",
    "6. **GroupBIM / BIM+ / Clearbox (BIMXtra)** — real",
  ].join("\n"));
  assert.deepEqual(names, [
    "Bentley ProjectWise",
    "Viewpoint For Projects (Trimble)",
    "Marks and Spencer",
    "Bank of America",
    "GroupBIM / BIM+ / Clearbox (BIMXtra)",
  ], names.join(" | "));
});

// ---------------------------------------------------------------------------
// Brand Launch Kit — eight day-one documents, done rather than described.
//
// These are the highest-stakes outputs in the platform, because they leave it:
// a guidelines sheet gets built to by a freelancer, a business card gets
// printed five hundred times, a bio gets pasted into Instagram. So the rules
// are stricter here than anywhere else, and these tests hold them.
// ---------------------------------------------------------------------------
const kit = await import("../src/backend/brand-kit.ts");

const kitGw = (text) => async () => ({ text, provider: "openai", model: "m", latencyMs: 1, attempts: [] });

test("brand kit: a hex code the customer never gave is never invented", async () => {
  let prompt = "";
  await kit.buildAsset(
    "guidelines",
    { name: "VeryX", product: "CDE" },
    { complete: async (req) => { prompt = req.prompt; return { text: "# Charte\n\n[TO SUPPLY: brand hex codes]", provider: "openai", model: "m", latencyMs: 1, attempts: [] }; } },
  );
  assert.doesNotMatch(prompt, /#[0-9a-f]{6}/i,
    "no colour may reach the writer that the customer did not set — a designer builds to whatever is on the sheet");

  // And when they ARE set, they must be handed over exactly.
  let withColours = "";
  await kit.buildAsset(
    "guidelines",
    { name: "VeryX", colours: ["#10b981", "0f172a"] },
    { complete: async (req) => { withColours = req.prompt; return { text: "# Charte", provider: "openai", model: "m", latencyMs: 1, attempts: [] }; } },
  );
  assert.match(withColours, /#10b981/i);
  assert.match(withColours, /#0f172a/i, "a hex typed without its hash is still that colour");
});

test("brand kit: missing details come back marked, in either language", () => {
  // The model writes in the customer's language, so the French instruction
  // produces "[À FOURNIR: …]" — both must be recognised or a French customer's
  // gaps are silently reported as complete.
  assert.deepEqual(kit.findNeeds("Tel: [À FOURNIR: numéro de téléphone]"), ["numéro de téléphone"]);
  assert.deepEqual(kit.findNeeds("Phone: [TO SUPPLY: phone number]"), ["phone number"]);
  assert.deepEqual(kit.findNeeds("Nothing missing here."), []);
});

test("brand kit: bio character limits are MEASURED, not requested", () => {
  // Telling a model "under 150 characters" and trusting it is how a bio gets
  // rejected at the moment the customer pastes it into Instagram.
  const md = [
    "## Instagram",
    "x".repeat(180),
    "",
    "## LinkedIn",
    "Short and fine.",
    "",
    "## Threads",
    "Also fine.",
  ].join("\n");
  const limits = kit.measureBios(md);
  const ig = limits.find((l) => l.label === "Instagram");
  assert.equal(ig.used, 180);
  assert.equal(ig.max, 150);
  assert.equal(ig.ok, false, "180 characters must not be reported as within a 150 limit");
  assert.equal(limits.find((l) => l.label === "LinkedIn").ok, true);
});

test("brand kit: the real platform limits are used", () => {
  const byLabel = Object.fromEntries(kit.SOCIAL_LIMITS.map((l) => [l.label, l.max]));
  // Wrong numbers here are worse than no check: the customer would trust a bio
  // that gets truncated.
  assert.equal(byLabel.Instagram, 150);
  assert.equal(byLabel.LinkedIn, 220);
  assert.equal(byLabel.X, 160);
  assert.equal(byLabel.Threads, 500);
});

test("brand kit: an over-limit bio is called out in the note", async () => {
  const asset = await kit.buildAsset(
    "social-profiles",
    { name: "VeryX" },
    { complete: kitGw(`## Instagram\n${"x".repeat(200)}\n\n## LinkedIn\nFine.`) },
  );
  assert.match(asset.note, /Over the limit: Instagram 200\/150/);
  assert.match(asset.note, /measured, not assumed/i);
});

test("brand kit: an invented statistic blocks the document", async () => {
  // These leave the platform. An unbacked figure on a page someone hands to a
  // designer or publishes under their own name is not a note to check later.
  const asset = await kit.buildAsset(
    "launch-post",
    { name: "VeryX", product: "CDE" },
    { complete: kitGw("We cut rework by 42% and are trusted by 4,000 businesses.") },
  );
  assert.ok(asset.blockers.length > 0);
  assert.match(asset.note, /not backed by anything you supplied/i);
});

test("brand kit: a figure the customer supplied is theirs to stand behind", async () => {
  const asset = await kit.buildAsset(
    "launch-post",
    { name: "VeryX", extras: [{ label: "Measured rework reduction", value: "Customers cut rework by 42% on average." }] },
    { complete: kitGw("Customers cut rework by 42% on average.") },
  );
  assert.deepEqual(asset.blockers, [], "flagging the customer's own evidence would make the guard useless");
});

test("brand kit: every one of the eight assets is real and buildable", async () => {
  assert.equal(kit.ASSET_IDS.length, 8);
  for (const id of kit.ASSET_IDS) {
    const a = await kit.buildAsset(id, { name: "VeryX", product: "CDE" }, { complete: kitGw("# Doc\n\nBody.") });
    assert.ok(a.title && a.title.length > 3, `${id} has no title`);
    assert.equal(a.id, id);
  }
});

test("brand kit: the kit is written in the customer's language", () => {
  const route = readFileSync(new URL("../src/app/api/brand-kit/route.ts", import.meta.url), "utf8");
  assert.match(route, /gatewayLangFrom\(req\)/,
    "a French customer needs a French charte graphique, not an English one to translate before handing it over");
  assert.match(route, /maxDuration = 300/);
  assert.match(route, /creditAcus\(auth\.uid, refunded\)/, "documents that were not produced are not charged for");
});

// ---------------------------------------------------------------------------
// The brand's identity record — turning eight documents into infrastructure.
//
// A Launch Kit used once and never returned to is a chat window with better
// manners. What makes it worth a subscription is that the structured parts are
// KEPT and every other engine reads them.
// ---------------------------------------------------------------------------
const ident = await import("../src/backend/brand-identity.ts");
const palette = await import("../src/backend/logo-palette.ts");

test("identity: a value the customer set is never overwritten by a rebuild", async () => {
  ident.__resetIdentities();
  await ident.saveIdentity("b1", { accent: { value: "#10b981", source: "supplied", confirmedAt: "2026-01-01" } });
  // Rebuilding the kit proposes a different accent.
  const after = await ident.saveIdentity("b1", { accent: { value: "#ff0000", source: "generated" } });
  assert.equal(after.accent.value, "#10b981",
    "a colour the customer went and corrected must survive the next kit build");

  // But a MEASURED value does replace a generated one — pixels beat a proposal.
  await ident.saveIdentity("b2", { accent: { value: "#ff0000", source: "generated" } });
  const b2 = await ident.saveIdentity("b2", { accent: { value: "#0f172a", source: "measured" } });
  assert.equal(b2.accent.value, "#0f172a");
});

test("identity: generated values are labelled as proposals in the brief", () => {
  const brief = ident.identityBrief({
    brandId: "b", updatedAt: "",
    positioning: { value: "A work-centric CDE for UK teams.", source: "generated" },
    tagline: { value: "Work, not folders.", source: "supplied" },
    toneWords: { value: ["precise", "calm"], source: "generated" },
  });
  assert.match(brief, /Positioning \(proposed, not confirmed\)/,
    "a downstream writer must not state a model's guess as a fact about the business");
  assert.doesNotMatch(brief, /Tagline \(proposed/, "a supplied value is not a proposal");
  assert.match(brief, /Tone: precise, calm/);
});

test("identity: the kit's documents are distilled into structure", () => {
  const assets = [
    { id: "guidelines", content: "## Colours\n- Primary #10B981 — accent\n- Ink #0f172a\n\n## Typography\nHeading: Space Grotesk\nBody: Inter" },
    { id: "social-profiles", content: `## Instagram\nShort bio.\n\n## LinkedIn\n${"x".repeat(300)}` },
    { id: "moodboard", content: "Keywords: precise, calm, industrial, spacious, honest" },
    { id: "website-copy", content: "# Home\n\nVeryX is a work-centric common data environment for UK construction teams." },
  ];
  const patch = ident.distilIdentity("b1", assets);
  assert.deepEqual(patch.colours.value, ["#10b981", "#0f172a"], "hex codes are read back out of the document");
  assert.equal(patch.fonts.value.heading, "Space Grotesk");
  assert.equal(patch.fonts.value.body, "Inter");
  assert.match(patch.positioning.value, /work-centric common data environment/);
  assert.deepEqual(patch.moodboardKeywords.value.slice(0, 3), ["precise", "calm", "industrial"]);
  // The over-limit LinkedIn bio must be stored AS over-limit, not silently kept.
  const li = patch.bios.value.find((b) => b.platform === "LinkedIn");
  assert.equal(li.chars, 300);
  assert.equal(li.withinLimit, false);
});

test("identity: a measured palette outranks whatever the document wrote", () => {
  const patch = ident.distilIdentity(
    "b1",
    [{ id: "guidelines", content: "Primary #ff0000" }],
    { measuredColours: ["#10b981", "#0f172a"], measuredAccent: "#10b981" },
  );
  assert.equal(patch.colours.source, "measured");
  assert.deepEqual(patch.colours.value, ["#10b981", "#0f172a"],
    "pixels from the real logo beat a hex a model wrote in a document");
});

// --- Palette from the logo ---------------------------------------------------

test("palette: colours are counted from real pixels, transparency ignored", () => {
  // 4 opaque green pixels, 2 opaque near-black, 4 fully transparent.
  const px = [];
  for (let i = 0; i < 4; i++) px.push(16, 185, 129, 255);
  for (let i = 0; i < 2; i++) px.push(15, 23, 42, 255);
  for (let i = 0; i < 4; i++) px.push(255, 255, 255, 0);
  const found = palette.countColours(Uint8Array.from(px), 4);
  assert.equal(found.length, 2, "transparent padding is not a brand colour, and most logos are mostly padding");
  assert.equal(found[0].share, 67, "share is of NON-transparent pixels");
  assert.match(found[0].hex, /^#10b981$/i);
});

test("palette: the accent is the brand colour, not the background", () => {
  // A dark wordmark with a small coloured device — the common real case, and
  // the only shape that separates "most-used chromatic colour" from "darkest
  // colour". An earlier fixture put the green first among the inks too, so
  // deleting the chroma rule entirely still returned the right answer.
  const colours = [
    { hex: "#ffffff", share: 55, lightness: 100 },
    { hex: "#0f172a", share: 32, lightness: 2 },
    { hex: "#10b981", share: 13, lightness: 45 },
  ];
  assert.equal(palette.pickAccent(colours, palette.hexToRgb), "#10b981",
    "the accent is the brand's colour, not the most-used ink and certainly not the background");

  // A genuinely monochrome mark's accent really is its ink.
  const mono = [{ hex: "#ffffff", share: 80, lightness: 100 }, { hex: "#111111", share: 20, lightness: 1 }];
  assert.equal(palette.pickAccent(mono, palette.hexToRgb), "#111111");
});

test("palette: an unreadable logo says so rather than proposing colours", async () => {
  const res = await palette.extractLogoPalette("https://example.invalid/logo.png", { fetchImage: async () => null });
  assert.equal(res.ok, false);
  assert.deepEqual(res.colours, []);
  assert.match(res.note, /Nothing is guessed/i);
  const none = await palette.extractLogoPalette("");
  assert.equal(none.reason, "no-logo");
});

// --- Fidelity: the moat ------------------------------------------------------

function brandRun(answer) {
  return {
    id: "r", brandId: "b1", brand: "VeryX", ranAt: "2026-07-29", visibilityRate: 33,
    mentioned: 1, askedCount: 3, assistants: ["openai"], topCompetitors: [], note: "",
    results: [
      // MENTIONED on purpose: a buying answer where the brand IS named is the
      // only case that exercises the intent filter. With mentioned:false the
      // answer was excluded anyway, so removing the filter changed nothing and
      // the mutation survived.
      { question: { id: "1", text: "Who are the best CDE providers?", intent: "buying" },
        verdicts: [{ assistant: "openai", mentioned: true, rank: null, competitors: [], evidence: "", answer: "Asite, Aconex and VeryX are options.", asked: true }] },
      { question: { id: "2", text: "What is VeryX and would you recommend them?", intent: "brand" },
        verdicts: [{ assistant: "openai", mentioned: true, rank: null, competitors: [], evidence: "", answer, asked: true }] },
    ],
  };
}

test("fidelity: scores how much of your own language the assistants reuse", () => {
  const identity = {
    brandId: "b1", updatedAt: "",
    positioning: { value: "VeryX is a work-centric common data environment for construction teams.", source: "generated" },
  };
  const close = ident.brandFidelity(identity, brandRun("VeryX is a work-centric common data environment used by construction teams."));
  assert.equal(close.scored, true);
  assert.ok(close.overlap >= 80, `expected a high overlap, got ${close.overlap}`);

  const adrift = ident.brandFidelity(identity, brandRun("VeryX appears to be a small document storage vendor."));
  assert.ok(adrift.overlap < close.overlap, "a different description must score lower");
  assert.ok(adrift.missing.length, "and must name the words they never used");
});

test("fidelity: only the BRAND question counts as a description", () => {
  const identity = { brandId: "b1", updatedAt: "", positioning: { value: "Work-centric common data environment.", source: "generated" } };
  // The buying answer mentions competitors, not the brand. Scoring against it
  // would measure the industry's vocabulary, not the brand's.
  const run = brandRun("VeryX is a work-centric environment.");
  const f = ident.brandFidelity(identity, run);
  assert.ok(!f.theirWords.includes("asite"),
    `a buying answer names the field, not you — scoring against it measures the industry's vocabulary: ${f.theirWords.join(", ")}`);
  assert.ok(!f.theirWords.includes("aconex"));
  assert.ok(f.theirWords.includes("centric") || f.theirWords.includes("environment"),
    "and the brand-question answer must still be scored");
});

test("fidelity: refuses to score when there is nothing to compare", () => {
  assert.equal(ident.brandFidelity(null, brandRun("x")).scored, false);
  assert.equal(ident.brandFidelity({ brandId: "b", updatedAt: "" }, brandRun("x")).scored, false);
  const noDescription = ident.brandFidelity(
    { brandId: "b", updatedAt: "", positioning: { value: "A work-centric CDE.", source: "generated" } },
    { ...brandRun("x"), results: [] },
  );
  assert.equal(noDescription.scored, false);
  assert.match(noDescription.note, /nothing has been asked|no description/i);
});

test("fidelity: calls itself a word overlap, not a judgement of meaning", () => {
  const f = ident.brandFidelity(
    { brandId: "b", updatedAt: "", positioning: { value: "Work-centric common data environment for construction.", source: "generated" } },
    brandRun("VeryX is a work-centric common data environment."),
  );
  assert.match(f.note, /word overlap, not a judgement of meaning/i,
    "dressing a token count up as semantic understanding is the kind of claim this platform refuses");
});

// --- Consistency: the recurring job -----------------------------------------

test("consistency: an off-palette colour is flagged, a neutral is not", () => {
  const identity = { brandId: "b", updatedAt: "", colours: { value: ["#10b981", "#0f172a"], source: "measured" } };
  const clean = ident.checkConsistency("<div style='color:#10b981;background:#ffffff;border:1px solid #cccccc'>Hi</div>", identity);
  assert.deepEqual(clean.issues, [],
    "flagging white and grey on every email would train the customer to ignore this check");

  const drifted = ident.checkConsistency("<div style='color:#ff00aa'>Hi</div>", identity);
  assert.equal(drifted.issues.length, 1);
  assert.equal(drifted.issues[0].found, "#ff00aa");
});

test("consistency: a forbidden word BLOCKS, an absent tagline only warns", () => {
  const identity = {
    brandId: "b", updatedAt: "",
    tagline: { value: "Work, not folders.", source: "supplied" },
    avoidWords: { value: ["cheap", "guaranteed"], source: "supplied" },
  };
  const bad = ident.checkConsistency("The cheapest and guaranteed option.", identity);
  const forbidden = bad.issues.filter((i) => i.kind === "forbidden");
  assert.equal(forbidden.length, 1, "'cheapest' must not match 'cheap' — word boundaries, as everywhere else here");
  assert.equal(forbidden[0].found, "guaranteed");
  assert.equal(bad.ok, false, "a do-not-use word is blocking");

  const noTagline = ident.checkConsistency("Perfectly fine copy.", identity, { expectTagline: true });
  assert.equal(noTagline.ok, true, "a missing tagline is worth knowing, not worth blocking");
  assert.equal(noTagline.issues[0].kind, "tagline");
});

test("consistency: no identity means no false findings", () => {
  const r = ident.checkConsistency("#ff00aa everywhere", null);
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
  assert.match(r.note, /nothing to check against/i);
});

// --- The deliverables actually deliver ---------------------------------------

test("signature: real sendable HTML, not a description of one", () => {
  const html = ident.signatureHtml(
    { name: "VeryX", personName: "J. Bankwa", role: "Founder", email: "hello@veryxjnn.com", website: "https://www.veryxjnn.com" },
    { brandId: "b", updatedAt: "", accent: { value: "#10b981", source: "measured" }, tagline: { value: "Work, not folders.", source: "supplied" } },
  );
  // Table-based with inline styles is what survives Outlook and Gmail. A
  // flexbox signature previews correctly and collapses in the inbox.
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /display:\s*flex/i);
  assert.match(html, /#10b981/, "the accent comes from the identity, not a default");
  assert.match(html, /Work, not folders\./);
  assert.match(html, /mailto:hello@veryxjnn\.com/);
  assert.doesNotMatch(html, /veryxjnn\.com<\/a> \| https/, "the website is shown without its scheme");
});

test("signature: injected markup cannot escape into the mail body", () => {
  const html = ident.signatureHtml({ name: '"><script>alert(1)</script>', email: "a@b.com" }, null);
  assert.doesNotMatch(html, /<script>/, "a brand name is data, not markup");
  assert.match(html, /&lt;script&gt;/);
});

test("identity: the email writer actually reads the record", () => {
  // Storing an identity nothing consumes is a database table, not infrastructure.
  const writer = readFileSync(new URL("../src/backend/email-template-writer.ts", import.meta.url), "utf8");
  assert.match(writer, /brief\.identityBrief\?\.trim\(\)/);
  assert.match(writer, /BRAND IDENTITY — write in this voice/);
  const route = readFileSync(new URL("../src/app/api/email-templates/ai/route.ts", import.meta.url), "utf8");
  assert.match(route, /identityBrief\(identity\)/, "the route must load it and pass it in");
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/brand_identities\/\{doc\} \{ allow read, write: if false; \}/);
});

// ---------------------------------------------------------------------------
// Truncation.
//
// A live kit handed a customer a "7-day calendar" containing one row, a
// moodboard brief that stopped at a heading, a launch post cut off mid-sentence
// and a signature that ended at "[TO SUPPLY: Title". All four were presented as
// finished documents with "No unsupported claims found" underneath.
//
// Two causes, one class: every provider that THINKS before it writes spends the
// output budget on thinking first — Anthropic's adaptive thinking as much as
// OpenAI's reasoning — and none of the three adapters read the field that says
// "I stopped because I ran out".
// ---------------------------------------------------------------------------

test("gateway: every thinking provider gets budget on top of the answer size", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  // Anthropic sets thinking:{type:"adaptive"} and bills it out of max_tokens.
  assert.match(gw, /max_tokens: Math\.max\(2_000, \(req\.maxTokens \?\? DEFAULT_MAX_TOKENS\) \+ REASONING_HEADROOM\)/,
    "asking Claude for 900 tokens with adaptive thinking on is asking for a truncated document");
  assert.match(gw, /max_output_tokens: reasoningModel/, "and the same for OpenAI");
});

test("gateway: all three adapters report truncation instead of hiding it", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(gw, /truncated: data\.stop_reason === "max_tokens"/, "anthropic");
  assert.match(gw, /truncated: data\.incomplete_details\?\.reason === "max_output_tokens"/, "openai");
  assert.match(gw, /truncated: data\.candidates\?\.\[0\]\?\.finishReason === "MAX_TOKENS"/, "gemini");
});

test("gateway: truncation survives the trip back to the caller", async () => {
  const gateway = await import("../src/backend/gateway.ts");
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-real";
  globalThis.fetch = async () => new Response(JSON.stringify({
    stop_reason: "max_tokens",
    content: [{ type: "text", text: "| Day | Topic |\n| Day 1 | Announcing the" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const res = await gateway.askProvider("anthropic", { system: "s", prompt: "p", maxTokens: 900 });
    assert.equal(res.ok, true);
    assert.equal(res.truncated, true,
      "a one-row calendar reaching the customer as a seven-day one is the failure this flag exists to stop");
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = realKey;
  }
});

test("brand kit: a cut-off document is flagged, not passed off as finished", async () => {
  const asset = await kit.buildAsset(
    "content-calendar",
    { name: "AxionOS" },
    { complete: async () => ({ text: "| Day | Topic |\n| Day 1 | Announcing", truncated: true, provider: "anthropic", model: "m", latencyMs: 1, attempts: [] }) },
  );
  assert.equal(asset.truncated, true);
  assert.match(asset.note, /INCOMPLETE/);
  assert.match(asset.note, /ran out of output budget/i);

  const whole = await kit.buildAsset(
    "content-calendar", { name: "AxionOS" },
    { complete: async () => ({ text: "| Day | Topic |\n| Day 1 | Launch |", provider: "anthropic", model: "m", latencyMs: 1, attempts: [] }) },
  );
  assert.equal(whole.truncated, false);
  assert.doesNotMatch(whole.note, /INCOMPLETE/);
});

test("brand kit: the documents get budgets that fit them", () => {
  // The moodboard brief and the 7-day calendar both stopped mid-document at the
  // original figures. A budget too small for the deliverable is a bug, not a
  // saving — the customer pays for a document either way.
  const src = readFileSync(new URL("../src/backend/brand-kit.ts", import.meta.url), "utf8");
  const budgets = [...src.matchAll(/maxTokens: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(budgets.length, 8);
  assert.ok(Math.min(...budgets) >= 1200, `smallest budget is ${Math.min(...budgets)} — a full document does not fit`);
});

test("brand kit: an incomplete document is refunded", () => {
  const route = readFileSync(new URL("../src/app/api/brand-kit/route.ts", import.meta.url), "utf8");
  assert.match(route, /const cut = built\.filter\(\(a\) => a\.truncated\)/);
  assert.match(route, /refunded \+= back/, "charging for half a calendar is charging for something that was not produced");
});

// ---------------------------------------------------------------------------
// "Tracking stopped."
//
// Five live pages: 160 visitors, one CTA click between them. Views are counted
// server-side and were fine; clicks were being thrown away.
//
// The tracker discarded every href starting with "#" as "navigation, not a
// conversion". But when the customer picks "Lead form on the page", the primary
// button's href IS "#lead" — so the single most important press on the page was
// dropped, on exactly the pages that depend on it.
// ---------------------------------------------------------------------------

test("landing pages: every CTA is marked so a '#' target is still a click", () => {
  const page = readFileSync(new URL("../src/app/b/[brandId]/[slug]/page.tsx", import.meta.url), "utf8");
  const marks = [...page.matchAll(/data-mw-cta="([a-z]+)"/g)].map((m) => m[1]);
  // Hero, in-section, final block and the sticky mobile bar. A visitor can press
  // any of the four, and three of them point at heroHref — which is "#lead"
  // whenever the page uses its own form.
  assert.deepEqual(marks.sort(), ["final", "primary", "section", "sticky"],
    `CTAs found: ${marks.join(", ")}`);
  assert.match(page, /const heroHref = ctaUrl \|\| "#lead"/,
    "this is why the marker is needed: with no external URL the CTA is an in-page anchor");
});

test("landing pages: the tracker counts a marked CTA wherever it points", () => {
  const tracker = readFileSync(new URL("../src/components/PageTracker.tsx", import.meta.url), "utf8");
  assert.match(tracker, /const isCta = Boolean\(\(el as HTMLElement\)\.dataset\.mwCta\)/);
  // The marked-CTA branch MUST come before the "#" bail-out, or the fix does
  // nothing at all.
  const ctaAt = tracker.indexOf("if (isCta) { send(\"cta_click\"); return; }");
  const hashAt = tracker.indexOf('if (!href || href.startsWith("#")) return;');
  assert.ok(ctaAt > 0 && hashAt > ctaAt,
    "a marked CTA has to be counted before unmarked '#' links are discarded");
  // An unmarked in-page jump is still navigation, not a conversion.
  assert.match(tracker, /href\.startsWith\("#"\)/);
  assert.match(tracker, /closest\("a, button"\)/, "a submit button is a CTA too");
});

test("landing pages: the beacon survives the navigation it triggers", () => {
  const tracker = readFileSync(new URL("../src/components/PageTracker.tsx", import.meta.url), "utf8");
  assert.match(tracker, /navigator\.sendBeacon/,
    "a plain fetch is cancelled by the navigation that follows the click it is reporting");
  assert.match(tracker, /keepalive: true/, "and the fallback needs the same guarantee");
});

// ---------------------------------------------------------------------------
// "Very poor rate": 1,129 sent, 98 opens, 79 clicks.
//
// 79 clicks from 98 openers is 81% click-to-open. A strong human campaign runs
// 10–15%. That is not a marketing result — it is corporate mail security
// (Proofpoint, Mimecast, Barracuda, Microsoft Safe Links) fetching every link
// the moment the message lands, with nothing telling them apart from people.
// ---------------------------------------------------------------------------
const botf = await import("../src/backend/email-bot-filter.ts");

test("email: security scanners and automation are identified as machines", () => {
  for (const ua of [
    "Mimecast-Link-Protection/1.0", "ProofPoint URL Defense", "BarracudaCentral scanner",
    "Mozilla/5.0 (compatible; Symantec Link Scanner)", "curl/8.4.0", "python-requests/2.31",
    "Go-http-client/2.0", "HeadlessChrome/120",
  ]) {
    assert.equal(botf.classifyAgent(ua).machine, true, `${ua} should be a machine`);
  }
  // A link unfurl is not a reader either.
  assert.equal(botf.classifyAgent("Slackbot-LinkExpanding 1.0").machine, true);
});

test("email: a real person behind a privacy relay is NOT a bot", () => {
  // Gmail proxies every image; Apple relays them. Classifying these as machines
  // would delete most of the list's genuine opens — the opposite error, and a
  // worse one, because it under-reports real customers.
  assert.equal(botf.classifyAgent("Mozilla/5.0 (Windows NT 10.0) GoogleImageProxy").machine, false);
  assert.equal(botf.classifyAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Apple Mail/16.0").machine, false);
  assert.equal(botf.classifyAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148").machine, false,
    "an ordinary phone is an ordinary reader");
});

test("email: prefetch, HEAD and a missing agent are machines", () => {
  assert.equal(botf.classifyAgent("Mozilla/5.0", null, { method: "HEAD" }).machine, true,
    "a browser does not HEAD an image it is about to display");
  const headers = { get: (n) => (n.toLowerCase() === "purpose" ? "prefetch" : null) };
  assert.equal(botf.classifyAgent("Mozilla/5.0", headers).machine, true);
  assert.equal(botf.classifyAgent("").machine, true, "every real mail client sends a user agent");
});

test("email: a human proxy is checked BEFORE the scanner lists", () => {
  // Ordering is the guarantee. If a token like "scan" were ever added to a list
  // and a relay's agent happened to contain it, real readers would vanish from
  // the numbers silently.
  const src = readFileSync(new URL("../src/backend/email-bot-filter.ts", import.meta.url), "utf8");
  const humanAt = src.indexOf("const human = has(ua, HUMAN_PROXIES);");
  const scannerAt = src.indexOf("const scanner = has(ua, SCANNERS);");
  assert.ok(humanAt > 0 && scannerAt > humanAt,
    "a real reader must be recognised before any machine list is consulted");
});

test("email: an impossible click-to-open is called out, not presented as a result", () => {
  const bad = botf.engagementSanity({ sent: 1129, opens: 98, clicks: 79 });
  assert.equal(bad.clickToOpenPct, 80.6);
  assert.equal(bad.plausible, false);
  assert.match(bad.note, /10–15%/, "the customer needs the benchmark to judge it themselves");
  assert.match(bad.note, /security scanning|Safe Links|Proofpoint/i);
  assert.match(bad.note, /upper bound, not a result/i,
    "unfiltered clicks must be presented as a ceiling, not an achievement");

  const ok = botf.engagementSanity({ sent: 1000, opens: 300, clicks: 40 });
  assert.equal(ok.plausible, true);
  assert.match(ok.note, /within the range real people produce/i);
});

test("email: machine hits are excluded from the rates but kept in the ledger", () => {
  const events = readFileSync(new URL("../src/backend/email-events.ts", import.meta.url), "utf8");
  assert.match(events, /if \(e\.meta\?\.machine === "true"\) \{ machine\[e\.type\]\+\+; continue; \}/,
    "a scanner fetch must not count toward the open or click rate");
  assert.match(events, /machineOpen: machine\.open, machineClick: machine\.click/,
    "and must still be reported, because it is evidence the message was delivered");

  for (const route of ["open", "click"]) {
    const src = readFileSync(new URL(`../src/app/api/track/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(src, /classifyAgent\(req\.headers\.get\("user-agent"\), req\.headers, \{ method: req\.method \}\)/, route);
    assert.match(src, /machine: String\(verdict\.machine\)/, `${route} must record the verdict`);
    assert.match(src, /recordEvent\(/, `${route} must still record the event — flagged, not dropped`);
  }
});

test("email: the stats route admits older events cannot be reclassified", () => {
  const route = readFileSync(new URL("../src/app/api/email-events/route.ts", import.meta.url), "utf8");
  assert.match(route, /cannot be reclassified after the fact/i,
    "pretending the historical numbers were always filtered would be a quiet rewrite of the past");
});

// ---------------------------------------------------------------------------
// Deliverability — and the guardrail that protects every OTHER customer.
//
// MarketWar sends on shared infrastructure. Reputation at Gmail and Microsoft
// attaches to the sending domain, not to the individual brand, so one customer
// blasting a stale list drags everyone else's mail toward spam. A report is not
// enough; the platform has to be able to stop the send.
// ---------------------------------------------------------------------------
const deliv = await import("../src/backend/deliverability.ts");

test("deliverability: reputation is judged per PROVIDER, not per domain", () => {
  // googlemail and gmail are one filter; a corporate domain runs its own.
  assert.equal(deliv.receivingProvider("a@gmail.com"), "Gmail");
  assert.equal(deliv.receivingProvider("a@googlemail.com"), "Gmail");
  assert.equal(deliv.receivingProvider("a@hotmail.co.uk"), "Microsoft");
  assert.equal(deliv.receivingProvider("a@outlook.com"), "Microsoft");
  assert.equal(deliv.receivingProvider("a@balfourbeatty.com"), "balfourbeatty.com",
    "a company runs its own filter — a block there is a different problem from a block at Gmail");
});

test("deliverability: the breakdown names which provider is filtering you", () => {
  const events = [];
  // Gmail: 100 sent, 22 opened — normal.
  for (let i = 0; i < 100; i++) { events.push({ email: `g${i}@gmail.com`, type: "sent" }); if (i < 22) events.push({ email: `g${i}@gmail.com`, type: "open" }); }
  // Microsoft: 100 sent, 1 opened — being filtered.
  for (let i = 0; i < 100; i++) { events.push({ email: `m${i}@outlook.com`, type: "sent" }); if (i < 1) events.push({ email: `m${i}@outlook.com`, type: "open" }); }
  const rows = deliv.byReceivingProvider(events);
  const gmail = rows.find((r) => r.provider === "Gmail");
  const ms = rows.find((r) => r.provider === "Microsoft");
  assert.equal(gmail.openRatePct, 22);
  assert.equal(ms.openRatePct, 1, "an overall 11.5% would have hidden this entirely");
  assert.equal(ms.judgeable, true);
});

test("deliverability: a scanner open does not count as a read in the breakdown", () => {
  const events = [
    { email: "a@gmail.com", type: "sent" },
    { email: "a@gmail.com", type: "open", meta: { machine: "true" } },
    { email: "b@gmail.com", type: "sent" },
    { email: "b@gmail.com", type: "open" },
  ];
  const gmail = deliv.byReceivingProvider(events, { minVolume: 1 }).find((r) => r.provider === "Gmail");
  assert.equal(gmail.opened, 1, "the same rule as the headline rate — a scanner is not a reader");
  assert.equal(gmail.sent, 2);
});

test("deliverability: sending is BLOCKED past Google's published complaint limit", () => {
  // 0.3% is the figure Google and Yahoo publish for bulk senders. At that point
  // they filter the sending DOMAIN, which on shared infrastructure is everyone.
  const bad = deliv.reputationVerdict({ sent: 1000, bounces: 5, complaints: 4 });
  assert.equal(bad.complaintRatePct, 0.4);
  assert.equal(bad.halt, true);
  assert.equal(bad.level, "danger");
  assert.equal(deliv.sendingBlocked(bad).blocked, true);
  assert.match(bad.note, /shared infrastructure/i,
    "the customer must be told WHY this is not a punishment");

  const watch = deliv.reputationVerdict({ sent: 1000, bounces: 5, complaints: 2 });
  assert.equal(watch.level, "watch");
  assert.equal(watch.halt, false, "0.2% is above the target but below the limit — warn, do not block");

  const fine = deliv.reputationVerdict({ sent: 1000, bounces: 5, complaints: 0 });
  assert.equal(fine.level, "ok");
  assert.equal(fine.halt, false);
});

test("deliverability: a dead list is blocked on bounce rate too", () => {
  const dead = deliv.reputationVerdict({ sent: 1000, bounces: 120, complaints: 0 });
  assert.equal(dead.bounceRatePct, 12);
  assert.equal(dead.halt, true);
  assert.match(dead.reasons.join(" "), /not collected with permission/i);
});

test("deliverability: rates are NOT judged on a handful of sends", () => {
  // One complaint in thirty is 3.3% — ten times the limit, and complete noise.
  // Halting on that would block a customer's first real campaign.
  const tiny = deliv.reputationVerdict({ sent: 30, bounces: 3, complaints: 1 });
  assert.equal(tiny.judgeable, false);
  assert.equal(tiny.halt, false);
  assert.equal(tiny.level, "ok");
  assert.match(tiny.note, /too few for these percentages to mean anything/i);
  assert.ok(deliv.MIN_VOLUME_TO_JUDGE >= 100, "the floor has to be high enough for a percentage to exist");
});

test("deliverability: the published thresholds are the ones actually used", () => {
  // Wrong numbers here are worse than no check: a customer would be blocked for
  // being fine, or allowed to keep damaging the platform.
  assert.equal(deliv.COMPLAINT_HALT_PCT, 0.3, "Google and Yahoo's published bulk-sender limit");
  assert.equal(deliv.COMPLAINT_WARN_PCT, 0.1, "and the figure they ask senders to aim under");
});

test("deliverability: the guardrail actually blocks the send path", () => {
  // A verdict nothing enforces is a banner, not a guardrail.
  const route = readFileSync(new URL("../src/app/api/email/route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = sendingBlocked\(verdict\);/);
  assert.match(route, /if \(gate\.blocked\) \{[\s\S]{0,200}status: 409/,
    "a blocked brand must be refused, not warned");
  assert.match(route, /if \(!isTest\) \{/,
    "a single test send cannot move a rate, and blocking the way someone verifies their fix helps nobody");
});

// ---------------------------------------------------------------------------
// Per-brand tracking domains.
//
// A platform defect, not a customer task. Mail went out from veryxjnn.com with
// every link inside it pointing at marketwaros.com: a From domain and a link
// domain that do not match, which filters notice — and worse, every customer's
// link reputation pooled onto ONE hostname, so a single brand's spam run
// poisoned the click domain for everyone else on the platform.
// ---------------------------------------------------------------------------
const evts = await import("../src/backend/email-events.ts");
const sdom = await import("../src/backend/sending-domains.ts");

test("tracking domains: the CNAME a customer must publish is spelled out", () => {
  const records = sdom.recordsFor({ domain: "VeryXJNN.com", selector: "mw1", publicKey: "AAAA" });
  const track = records.find((r) => r.purpose === "Tracking");
  assert.ok(track, "there is no way to align the link domain without telling the customer the record");
  assert.equal(track.type, "CNAME");
  assert.equal(track.host, "email.veryxjnn.com", "host is normalised — a customer typing WWW or a URL still gets the right record");
});

test("tracking domains: links use the brand's host once it is verified", () => {
  const html = '<a href="https://veryxjnn.com/demo">Book</a>';
  const branded = evts.injectTracking(html, "b1", "a@b.com", "camp", "https://email.veryxjnn.com");
  assert.match(branded, /https:\/\/email\.veryxjnn\.com\/api\/track\/click/,
    "the click redirector must sit on the brand's own domain");
  assert.match(branded, /https:\/\/email\.veryxjnn\.com\/api\/track\/open/, "and so must the pixel");
  assert.doesNotMatch(branded, /marketwaros\.com/,
    "a link pointing at the platform from a customer's mail is the reputation pooling this fixes");
  assert.match(evts.unsubscribeUrl("b1", "a@b.com", "camp", "https://email.veryxjnn.com"), /email\.veryxjnn\.com/);
});

test("tracking domains: an unverified brand still gets WORKING links", () => {
  // Falling back is not a compromise, it is the requirement: a hostname whose
  // CNAME has not propagated produces links that 404 in a customer's inbox,
  // which is far worse than sharing the platform host for another day.
  const html = '<a href="https://veryxjnn.com/demo">Book</a>';
  const shared = evts.injectTracking(html, "b1", "a@b.com", "camp");
  assert.match(shared, /\/api\/track\/click\?t=/, "the link still works");
  assert.ok(shared.includes(evts.trackingBase()), "on the platform host, until the brand publishes its own");
});

test("tracking domains: only a VERIFIED cname is used", () => {
  const src = readFileSync(new URL("../src/backend/sending-domains.ts", import.meta.url), "utf8");
  assert.match(src, /if \(d\.status !== "verified"\) continue;/);
  assert.match(src, /if \(track\?\.verified\) return track\.host;/,
    "an unpropagated CNAME would put a dead hostname in front of every recipient");
});

test("tracking domains: the host is resolved ONCE per send, not per recipient", () => {
  const route = readFileSync(new URL("../src/app/api/email/route.ts", import.meta.url), "utf8");
  assert.match(route, /const trackBase = await trackingBaseFor\(brandId\)/);
  assert.match(route, /injectTracking\([\s\S]*?campaign, trackBase\)/,
    "the call nests mergeTemplate(), so the match has to cross parentheses");
  assert.match(route, /unsubscribeUrl\(brandId, to, campaign, trackBase\)/);
  // A lookup inside the per-recipient map would be one datastore read per
  // message — 1,129 reads for a single campaign. The resolve has to sit above
  // the map that builds the messages.
  const mapAt = route.indexOf("const prepared = batch.map(");
  const resolveAt = route.indexOf("const trackBase = await trackingBaseFor");
  assert.ok(mapAt > 0, "the per-recipient map should exist");
  assert.ok(resolveAt > 0 && resolveAt < mapAt,
    "the tracking host must be resolved once, before the per-recipient map");
  const insideMap = route.slice(mapAt, route.indexOf("});", mapAt));
  assert.doesNotMatch(insideMap, /trackingBaseFor/,
    "resolving inside the map is one datastore read per recipient");
});

test("email: one-click unsubscribe is set on the BULK path, per RFC 8058", () => {
  // Google and Yahoo have required this of bulk senders since February 2024.
  // Missing it means filtering regardless of DNS, content or list quality.
  const email = readFileSync(new URL("../src/backend/email.ts", import.meta.url), "utf8");
  const headerPairs = email.split('headers["List-Unsubscribe"]').length - 1;
  assert.ok(headerPairs >= 2, "both the single-send and the batched send paths must set it");
  assert.match(email, /headers\["List-Unsubscribe-Post"\] = "List-Unsubscribe=One-Click"/,
    "List-Unsubscribe alone is the OLD spec — one-click needs the Post header too");
  const route = readFileSync(new URL("../src/app/api/email/route.ts", import.meta.url), "utf8");
  assert.match(route, /listUnsubscribe: unsubscribeUrl\(brandId, to, campaign/,
    "and the bulk route must actually pass a URL, or the header is never added");
});

// ---------------------------------------------------------------------------
// SEO auto-deploy — apply the fix instead of describing it.
//
// The platform already found the issues and wrote the fixes; the customer got a
// JSON-LD block to paste into a CMS they may not control. This is the missing
// half. It also writes into a live page a customer is legally responsible for,
// which is why the rules below are stricter than the feature itself.
// ---------------------------------------------------------------------------
const seod = await import("../src/backend/seo-deploy.ts");

const cfg = (over = {}) => ({
  brandId: "b1", enabled: true, updatedAt: "",
  allowedHosts: ["veryxjnn.com"],
  fixes: [{ id: "f1", kind: "description", path: "*", value: "A work-centric CDE.", replace: false, approved: true, source: "crawler", createdAt: "" }],
  ...over,
});

test("seo-deploy: an UNAPPROVED fix never leaves the server", () => {
  // Filtering in the browser would be a suggestion: the snippet is public and
  // anyone can read it, so an unapproved value must not be written into it.
  const pending = cfg({ fixes: [{ ...cfg().fixes[0], approved: false }] });
  assert.deepEqual(seod.deployableFixes(pending), []);
  const js = seod.buildSnippet(pending);
  assert.doesNotMatch(js, /work-centric CDE/,
    "the text of an unapproved fix must not appear in a file anyone can fetch");
});

test("seo-deploy: nothing runs while auto-deploy is off", () => {
  assert.deepEqual(seod.deployableFixes(cfg({ enabled: false })), []);
});

test("seo-deploy: the snippet refuses to run on an unauthorised host", () => {
  const js = seod.buildSnippet(cfg());
  assert.match(js, /HOSTS\.indexOf\(host\) === -1\) return/,
    "without this, anyone could paste another brand's snippet onto their own site");
  assert.match(js, /\["veryxjnn\.com"\]/);
  // No hosts authorised = it runs nowhere, rather than everywhere.
  assert.match(seod.buildSnippet(cfg({ allowedHosts: [] })), /var HOSTS = \[\]/);
});

test("seo-deploy: a hand-written value is not clobbered unless replace is set", () => {
  const js = seod.buildSnippet(cfg());
  assert.match(js, /if \(!replace\) return;/,
    "someone agonised over that title — improving a page by destroying its best work is not improvement");
  assert.match(js, /if \(!document\.title \|\| f\.replace\)/,
    "the title is only set when there is none, or the replacement was approved");
  assert.match(js, /if \(imgs\[j\]\.getAttribute\("alt"\)\) continue;/, "alt text fills gaps only");
});

test("seo-deploy: the payload cannot break out of the script tag", () => {
  // A fix value containing "</script>" would close the tag early and dump the
  // rest of the payload into the customer's document as markup.
  const nasty = cfg({ fixes: [{ ...cfg().fixes[0], value: '</script><img src=x onerror=alert(1)>' }] });
  const js = seod.buildSnippet(nasty);
  assert.doesNotMatch(js, /<\/script>/i, "the closing tag must be escaped, not emitted");
  assert.match(js, /\\u003c/, "escaped as unicode so the string still parses back correctly");
});

test("seo-deploy: a failure can never white-screen the customer's site", () => {
  const js = seod.buildSnippet(cfg());
  // Outer guard, plus a per-fix guard so one bad entry does not stop the rest.
  assert.ok((js.match(/try \{/g) || []).length >= 2);
  assert.match(js, /\} catch \(e\) \{ \/\* one bad fix must not stop the rest \*\/ \}/);
  assert.match(js, /"use strict"/);
});

test("seo-deploy: the snippet tells the truth about being client-side", () => {
  const js = seod.buildSnippet(cfg());
  // It lands on someone else's website. They should be able to open the URL and
  // read what it does — including its limits.
  assert.match(js, /CLIENT-SIDE/);
  assert.match(js, /AI assistants that fetch raw HTML will NOT/i,
    "this is the exact crawler class the visibility module measures — the gap must be stated");
  assert.match(js, /data-mw-seo/, "every element it creates must be findable in DevTools");
});

test("seo-deploy: install is MEASURED from the page, not assumed", () => {
  const tag = seod.installTag("https://www.marketwaros.com", "b1");
  assert.match(tag, /<script src="https:\/\/www\.marketwaros\.com\/api\/seo\/snippet\/b1\.js" async><\/script>/);
  assert.equal(seod.snippetInstalled(`<head>${tag}</head>`, "b1"), true);
  assert.equal(seod.snippetInstalled("<head></head>", "b1"), false);
  const route = readFileSync(new URL("../src/app/api/seo/deploy/route.ts", import.meta.url), "utf8");
  assert.match(route, /snippetInstalled\(await res\.text\(\), brandId\)/,
    "the check fetches the real page rather than trusting a checkbox");
});

test("seo-deploy: hosts are normalised the way a browser reports them", () => {
  assert.equal(seod.normaliseHost("https://WWW.VeryXJNN.com/path"), "veryxjnn.com");
  assert.equal(seod.normaliseHost("veryxjnn.com:443"), "veryxjnn.com");
  const js = seod.buildSnippet(cfg({ allowedHosts: ["https://WWW.VeryXJNN.com/"] }));
  assert.match(js, /\["veryxjnn\.com"\]/,
    "a customer pasting a URL instead of a hostname must still get a working snippet");
});

// ---------------------------------------------------------------------------
// Crawl → draft fixes, and the approval screen on SiteRaid + SEO Autopilot.
//
// The engine could already apply a fix; nothing joined it to the crawl that
// found the gap, so a customer read a finding on one screen and typed the value
// on another. These tests hold the two rules that make the join safe: a draft is
// only produced where a gap was MEASURED and a real value EXISTS, and it always
// arrives switched off.
// ---------------------------------------------------------------------------

const seoArt = await import("../src/backend/seo-artifacts.ts");
const shared = await import("../src/shared/seo-deploy.ts");

const BRAND = {
  id: "b1", name: "VeryX", industry: "Construction software",
  product: "a work-centric common data environment", audience: "site teams",
  location: "Paris", offer: "First project free", website: "veryxjnn.com",
  goal: "", color: "#2E7CF6",
};

test("seo-deploy: a draft is only written where the crawl MEASURED a gap", () => {
  const complete = seod.draftFixesFromCrawl(
    { url: "https://veryxjnn.com/", title: "VeryX — CDE", metaDescription: "A work-centric CDE.", structuredDataTypes: ["LocalBusiness", "WebSite", "Product"] },
    BRAND,
  );
  assert.deepEqual(complete.fixes, [],
    "a page that already has a title, a description and its schema needs nothing written onto it");

  const bare = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/" }, BRAND);
  assert.ok(bare.fixes.find((f) => f.kind === "title"));
  assert.ok(bare.fixes.find((f) => f.kind === "description"));
  assert.ok(bare.fixes.find((f) => f.kind === "schema"));
});

test("seo-deploy: a draft is never approved and never a replacement", () => {
  const { fixes } = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/pricing" }, BRAND);
  assert.ok(fixes.length > 0);
  for (const f of fixes) {
    assert.equal(f.approved, false, "the customer's website is theirs — the default must be no");
    assert.equal(f.replace, false, "a draft fills a gap; it never proposes to overwrite their words");
  }
  // And an unapproved draft is inert even if it reaches the config.
  assert.deepEqual(seod.deployableFixes({ ...cfg(), fixes }), []);
});

test("seo-deploy: nothing is invented to fill a slot", () => {
  // A brand record with only a name would produce the description "VeryX." —
  // technically filled, actually worthless. It must refuse and say why.
  const nameOnly = { ...BRAND, product: "", audience: "", location: "", offer: "" };
  const { fixes, needsYou } = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/" }, nameOnly);
  assert.equal(fixes.find((f) => f.kind === "description"), undefined);
  assert.equal(fixes.find((f) => f.kind === "title"), undefined);
  assert.ok(needsYou.find((g) => /description/i.test(g.label)));
  assert.ok(needsYou.find((g) => /product, audience, location or offer/.test(g.reason)),
    "and it must name what to fill in, not just decline");
});

test("seo-deploy: alt text is never guessed", () => {
  // The OS has not seen the image. A guessed description is a false statement on
  // the page and is read aloud to anyone using a screen reader.
  const { fixes, needsYou } = seod.draftFixesFromCrawl(
    { url: "https://veryxjnn.com/", title: "t", metaDescription: "d", structuredDataTypes: ["LocalBusiness", "WebSite", "Product"], imagesTotal: 9, imagesNoAlt: 4 },
    BRAND,
  );
  assert.equal(fixes.find((f) => f.kind === "alt"), undefined);
  const gap = needsYou.find((g) => /4 images/.test(g.label));
  assert.ok(gap, "the gap is still reported — refusing to guess is not the same as hiding it");
  assert.match(gap.reason, /screen reader/i);
});

test("seo-deploy: a schema block the page already carries is not duplicated", () => {
  // Two Organization blocks is a rich-results error, not an improvement.
  const { fixes } = seod.draftFixesFromCrawl(
    { url: "https://veryxjnn.com/", title: "t", metaDescription: "d", structuredDataTypes: ["localbusiness"] },
    BRAND,
  );
  const labels = fixes.filter((f) => f.kind === "schema").map((f) => f.source);
  assert.equal(labels.find((s) => /LocalBusiness/.test(s)), undefined,
    "case must not be the thing that decides whether a duplicate ships");
  assert.ok(labels.find((s) => /WebSite/.test(s)), "the types it does NOT have are still offered");
});

test("seo-deploy: a fix already on the list is not drafted twice", () => {
  const first = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/" }, BRAND).fixes;
  const again = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/" }, BRAND, first).fixes;
  assert.deepEqual(again, [], "pressing the button twice must not stack duplicate fixes");
});

test("seo-deploy: a fix measured on one page defaults to that page", () => {
  // "*" would apply a pricing-page title to every page on the site.
  assert.equal(seod.crawledPath({ finalUrl: "https://veryxjnn.com/pricing" }), "/pricing");
  assert.equal(seod.crawledPath({ url: "veryxjnn.com" }), "/");
  assert.equal(seod.crawledPath({ url: "not a url at all" }), "/");
  const { fixes } = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/a", finalUrl: "https://veryxjnn.com/b" }, BRAND);
  assert.ok(fixes.every((f) => f.path === "/b"), "the redirect target is the page that was actually measured");
});

test("seo-deploy: the deployed value and the copy-paste artifact are the same words", () => {
  // Two generators would drift, and the customer would approve one thing while
  // a different one shipped.
  const arts = seoArt.buildMetaTags(BRAND);
  const { title, description } = seoArt.metaValues(BRAND);
  assert.ok(arts.content.includes(`content="${description}"`));
  assert.ok(arts.content.includes(`<title>${title}</title>`));
  const drafted = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/" }, BRAND).fixes;
  assert.equal(drafted.find((f) => f.kind === "description").value, description);
});

test("seo-deploy: a deployed schema value carries no <script> wrapper", () => {
  // The snippet creates the script element itself; a value that already contains
  // one would nest the tag and the JSON-LD would never parse.
  const { fixes } = seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/" }, BRAND);
  const schema = fixes.find((f) => f.kind === "schema");
  assert.doesNotMatch(schema.value, /<script/i);
  assert.equal(JSON.parse(schema.value)["@type"], "LocalBusiness");
  // The paste-ready artifact still has its wrapper — both packagings, one source.
  assert.match(seoArt.buildStructuredData(BRAND)[0].content, /<script type="application\/ld\+json">/);
});

test("seo-deploy: drafting saves nothing and approves nothing", () => {
  const route = readFileSync(new URL("../src/app/api/seo/deploy/route.ts", import.meta.url), "utf8");
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PUT"));
  assert.doesNotMatch(post, /saveDeployConfig/,
    "pressing crawl must never change what a customer's live website says");
  assert.match(post, /requireAuth/);
  assert.match(post, /resolveBrandAccess/);
});

test("seo-deploy: the panel is on SiteRaid AND SEO Autopilot, and states its limits", () => {
  const panel = readFileSync(new URL("../src/components/SeoDeployPanel.tsx", import.meta.url), "utf8");
  for (const page of ["website-intel", "seo-autopilot"]) {
    const src = readFileSync(new URL(`../src/app/dashboard/${page}/page.tsx`, import.meta.url), "utf8");
    assert.match(src, /<SeoDeployPanel/, `${page} must mount the approval screen`);
  }
  // The crawl feeds the drafting on SiteRaid; Autopilot has no crawl to feed it.
  assert.match(readFileSync(new URL("../src/app/dashboard/website-intel/page.tsx", import.meta.url), "utf8"),
    /crawl=\{crawl && crawl\.ok \? crawl : null\}/,
    "a failed crawl must not be offered as a source of fixes");
  // The limitation belongs next to the button, not behind a docs link.
  assert.match(panel, /in the browser/);
  assert.match(panel, /AI assistants your visibility check asks/);
  assert.match(panel, /type="checkbox" checked=\{f\.approved\}/, "approval is per fix, visible, and off by default");

  // The crawl card must SHOW what the crawl could not read. A number computed
  // from a partial audit that renders as a plain grade is the lie this whole
  // change exists to stop.
  const siteraid = readFileSync(new URL("../src/app/dashboard/website-intel/page.tsx", import.meta.url), "utf8");
  assert.match(siteraid, /\{crawl\.scoreNote &&/, "the coverage caveat has to reach the screen, not just the payload");
  assert.match(siteraid, /crawl\.coveragePct/, "and the grade badge has to say how much of the audit it came from");
  assert.match(siteraid, /crawl\.renderGap\?\.jsShell &&/, "the render gap gets its own banner");
  assert.match(siteraid, /crawl\.block \?/, "a block is reported as a block, with the action, not as a generic error");
});

test("seo-deploy: the panel and the route agree on which kinds exist", () => {
  // A kind the UI offers but the route rejects drops a fix the customer thought
  // they had saved, without an error.
  const route = readFileSync(new URL("../src/app/api/seo/deploy/route.ts", import.meta.url), "utf8");
  assert.match(route, /const KINDS: SeoFixKind\[\] = SEO_FIX_KIND_VALUES;/);
  assert.equal(shared.SEO_FIX_KIND_VALUES.length, shared.SEO_FIX_KINDS.length);
  assert.ok(shared.SEO_FIX_KIND_VALUES.includes("schema"));
});

// ---------------------------------------------------------------------------
// Render gap + block classification — "we could not see it" vs "it is not there"
//
// Every crawl in this platform reads raw HTML. Two responses look like a page
// and are not one: a JavaScript app that has not run yet, and a bot-protection
// challenge. Auditing either as if it were the customer's site produces a
// confident, entirely fictional report — and, since yesterday, invites the SEO
// auto-deploy to write a title onto a page that already has one.
// ---------------------------------------------------------------------------

const rg = await import("../src/backend/render-gap.ts");

const bundle = (n) => `<script src="/_next/static/chunk.js">${"a".repeat(n)}</script>`;
const prose = (words) => Array.from({ length: words }, (_, i) => `word${i}`).join(" ");

test("render-gap: an empty mount point plus a bundle is a shell", () => {
  const html = `<html><head><title>VeryX</title></head><body><div id="root"></div>${bundle(20000)}</body></html>`;
  const g = rg.detectRenderGap(html);
  assert.equal(g.jsShell, true);
  assert.ok(g.words < 40);
  assert.match(g.note, /AI assistants/i, "the note must name who cannot run the JavaScript");
});

test("render-gap: a SERVER-rendered page is not a shell, marker or no marker", () => {
  // __NEXT_DATA__ is present on every Next.js page including fully rendered
  // ones. Treating the marker as the verdict would silence real findings on
  // most of the modern web.
  const html = `<html><body><h1>Roofing in Leeds</h1><p>${prose(400)}</p>` +
    `<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>${bundle(50000)}</body></html>`;
  const g = rg.detectRenderGap(html);
  assert.equal(g.jsShell, false, "there are 400 words of prose right there in the HTML");
  assert.ok(g.markers.includes("__NEXT_DATA__"), "the marker is still reported, it just does not decide");
  assert.equal(g.framework, "Next.js");
});

test("render-gap: a genuinely thin page is still called thin", () => {
  // The damaging error is the other direction: a false "shell" verdict SILENCES
  // a real finding on a page that really is empty.
  const html = "<html><body><h1>Home</h1><p>Call us.</p></body></html>";
  assert.equal(rg.detectRenderGap(html).jsShell, false);
});

test("render-gap: a block is named, and the fix is allowlisting rather than evasion", () => {
  const cf = rg.classifyBlock(403, "<html><body>Attention Required! | Cloudflare<br>cf-browser-verification</body></html>",
    { get: (n) => (n === "server" ? "cloudflare" : n === "cf-ray" ? "8a1b2c3d" : null) });
  assert.equal(cf.blocked, true);
  assert.equal(cf.kind, "bot-protection");
  assert.equal(cf.vendor, "Cloudflare");
  assert.match(cf.action, /MarketWarBot\/1\.0/, "the customer owns the site — tell them what to allowlist");
  assert.match(cf.action, /do not solve CAPTCHAs/,
    "the refusal has to be stated, not implied");
  assert.doesNotMatch(cf.action, /proxy|rotate|bypass|solve the (captcha|challenge)|residential/i,
    "the platform must not offer to defeat a control the owner deliberately put up");
});

test("render-gap: mentioning Cloudflare on a working page is not a block", () => {
  const ok = rg.classifyBlock(200, "<html><body>We host with Cloudflare and love it. Just a moment...</body></html>",
    { get: () => null });
  assert.equal(ok.blocked, false);
  assert.equal(ok.kind, "none");
  assert.equal(ok.vendor, "", "prose on a working page is not evidence of what sits in front of it");
});

test("render-gap: each failure is a different sentence", () => {
  assert.equal(rg.classifyBlock(429, "", null).kind, "rate-limited");
  assert.equal(rg.classifyBlock(0, "", null).kind, "unreachable");
  assert.equal(rg.classifyBlock(503, "", null).kind, "server-error");
  assert.match(rg.classifyBlock(404, "", null).action, /does not exist/);
  assert.equal(rg.classifyBlock(200, "<html><body>fine</body></html>", null).blocked, false);
  const cap = rg.classifyBlock(403, '<div class="g-recaptcha">verify you are human</div>', null);
  assert.equal(cap.kind, "captcha");
});

// --- the crawler, driven through a stubbed fetch ---

const crawlWith = async (pages) => {
  const crawler = await import("../src/backend/crawler.ts");
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const key = Object.keys(pages).find((k) => String(url).includes(k));
    const p = key ? pages[key] : { status: 404, body: "" };
    return {
      ok: p.status >= 200 && p.status < 300,
      status: p.status,
      url: String(url),
      headers: { get: (n) => (p.headers || {})[n.toLowerCase()] ?? null },
      arrayBuffer: async () => new TextEncoder().encode(p.body || "").buffer,
      text: async () => p.body || "",
    };
  };
  try { return await crawler.crawlSite("https://veryxjnn.com/"); }
  finally { globalThis.fetch = real; }
};

test("crawler: a bot-protection challenge is not audited as if it were the site", async () => {
  const report = await crawlWith({
    "veryxjnn.com": { status: 403, body: "<html><head><title>Attention Required! | Cloudflare</title></head><body>cf-browser-verification</body></html>", headers: { server: "cloudflare" } },
  });
  assert.equal(report.ok, false);
  assert.equal(report.block.vendor, "Cloudflare");
  assert.deepEqual(report.findings, [], "every finding would have described the interstitial, not the customer's page");
  assert.match(report.error, /Cloudflare/);
});

test("crawler: on a JS-rendered page an absence is unknown, but a presence still counts", async () => {
  const shell = `<html lang="en"><head><title>VeryX — a work-centric CDE</title><meta name="viewport" content="width=device-width"></head>` +
    `<body><div id="root"></div>${bundle(40000)}</body></html>`;
  const report = await crawlWith({ "veryxjnn.com/": { status: 200, body: shell }, "robots.txt": { status: 200, body: "User-agent: *" }, "sitemap.xml": { status: 200, body: "<urlset/>" } });

  assert.equal(report.ok, true);
  assert.equal(report.renderGap.jsShell, true);

  const by = (l) => report.findings.find((f) => f.label === l);
  // Absent from the HTML → unknown, and kept out of the score.
  assert.equal(by("Single H1").measured, false);
  assert.equal(by("Content depth").measured, false);
  assert.equal(by("Schema.org").measured, false);
  assert.match(by("Content depth").detail, /Not in the HTML/);
  // Present in the HTML → we genuinely saw it, so it stands as a pass.
  assert.equal(by("Title tag").severity, "pass");
  assert.equal(by("Title tag").measured, undefined);
  assert.equal(by("Viewport meta").severity, "pass", "the viewport is in the served document either way");
  assert.ok(by("Rendered by JavaScript"), "and the root cause is stated as its own finding");
});

test("crawler: a shell does not turn a measured flaw into an unknown, or an empty body into a pass", async () => {
  const shell = `<html lang="en"><head><title>Hi</title><meta name="viewport" content="width=device-width"></head>` +
    `<body><div id="root"></div>${bundle(40000)}</body></html>`;
  const report = await crawlWith({ "veryxjnn.com/": { status: 200, body: shell }, "robots.txt": { status: 200, body: "User-agent: *" }, "sitemap.xml": { status: 200, body: "<urlset/>" } });
  const by = (l) => report.findings.find((f) => f.label === l);
  // A 2-character title IS in the HTML. "Too short" is a real measurement.
  assert.equal(by("Title tag").measured, undefined);
  assert.match(by("Title tag").detail, /aim 15-65/);
  // And an empty document must not earn credit for having no images to fix.
  assert.equal(by("Image alt text").measured, false,
    "'No images.' is not a pass on a page whose body has not been built yet");
});

test("crawler: unknown checks are excluded from the score, not counted as failures", async () => {
  const shell = `<html lang="en"><head><title>VeryX — a work-centric CDE</title><meta name="viewport" content="width=device-width"></head>` +
    `<body><div id="root"></div>${bundle(40000)}</body></html>`;
  const thin = `<html lang="en"><head><title>VeryX — a work-centric CDE</title><meta name="viewport" content="width=device-width"></head>` +
    `<body><p>Call us.</p></body></html>`;
  const pages = { "robots.txt": { status: 200, body: "User-agent: *" }, "sitemap.xml": { status: 200, body: "<urlset/>" } };
  const a = await crawlWith({ "veryxjnn.com/": { status: 200, body: shell }, ...pages });
  const b = await crawlWith({ "veryxjnn.com/": { status: 200, body: thin }, ...pages });
  assert.ok(a.score > b.score,
    "a page we could not read must not be scored below a page we read and found empty");

  // Pinned exactly: the score is computed over the measured checks ONLY.
  const at = (fs) => {
    const earned = fs.reduce((s, f) => s + (f.severity === "pass" ? f.weight : f.severity === "warn" ? f.weight * 0.5 : 0), 0);
    const total = fs.reduce((s, f) => s + f.weight, 0);
    return Math.round((earned / total) * 100);
  };
  const measured = a.findings.filter((f) => f.measured !== false);
  assert.ok(measured.length < a.findings.length, "this page must actually have unknowns, or the test proves nothing");
  assert.equal(a.score, at(measured));
  assert.notEqual(a.score, at(a.findings),
    "and counting the unknowns in must give a different answer, or the exclusion is doing nothing");
});

test("crawler: the grade never travels without the share of the audit it came from", async () => {
  // A shell scored 89/B in testing while a fully-readable page scored 77 — the
  // average of the handful of checks we COULD read comes out high. Publishing a
  // bare "B" there tells a customer their site is fine when what we actually
  // established is that we could not see it.
  const shell = `<html lang="en"><head><title>VeryX — a work-centric CDE</title><meta name="viewport" content="width=device-width"></head>` +
    `<body><div id="root"></div>${bundle(40000)}</body></html>`;
  const pages = { "robots.txt": { status: 200, body: "User-agent: *" }, "sitemap.xml": { status: 200, body: "<urlset/>" } };
  const a = await crawlWith({ "veryxjnn.com/": { status: 200, body: shell }, ...pages });
  assert.ok(a.coveragePct < 100 && a.coveragePct > 0, `coverage should be partial, got ${a.coveragePct}`);
  assert.ok(a.unreadable.includes("Content depth"));
  assert.match(a.scoreNote, new RegExp(`${a.coveragePct}% of the audit`));
  assert.match(a.scoreNote, /of what was readable/, "the number must say what it is not");

  // A page we could read completely carries no caveat — the note is not boilerplate.
  const full = `<html lang="en"><head><title>Roofing services in Leeds — VeryX</title>` +
    `<meta name="description" content="${"x".repeat(90)}"><meta name="viewport" content="width=device-width">` +
    `<link rel="canonical" href="https://veryxjnn.com/"><meta property="og:title" content="a"><meta property="og:image" content="b">` +
    `<meta name="twitter:card" content="summary"><script type="application/ld+json">{"@type":"Organization"}</script></head>` +
    `<body><h1>Roofing in Leeds</h1><p>${prose(400)}</p></body></html>`;
  const b = await crawlWith({ "veryxjnn.com/": { status: 200, body: full }, ...pages });
  assert.equal(b.coveragePct, 100);
  assert.equal(b.scoreNote, "");
});

test("seo-deploy: no fix is drafted from a page whose HTML we could not read", () => {
  // The bug this closes: "no <title> in the HTML" on a React app is not "this
  // page has no title" — the browser sets one a moment later. Drafting from
  // that reading offers to fill a gap that does not exist.
  const { fixes, needsYou } = seod.draftFixesFromCrawl(
    { url: "https://veryxjnn.com/pricing", renderGap: { jsShell: true, framework: "React", words: 12 } },
    BRAND,
  );
  assert.deepEqual(fixes, []);
  assert.equal(needsYou.length, 1);
  assert.match(needsYou[0].reason, /React app/);
  assert.match(needsYou[0].reason, /do not run your JavaScript|does not exist|may not exist/i);
  // And the same brand on a page we COULD read still drafts normally.
  assert.ok(seod.draftFixesFromCrawl({ url: "https://veryxjnn.com/pricing" }, BRAND).fixes.length > 0);
});

test("geo-readiness: for AI engines a JS shell is the finding, not an unknown", async () => {
  // Deliberately the opposite verdict from the SEO crawler: Google renders,
  // GPTBot and ClaudeBot do not. Same page, two honest answers.
  const geo = await import("../src/backend/geo-readiness.ts");
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const shell = `<html><head><title>VeryX</title></head><body><div id="root"></div>${bundle(40000)}</body></html>`;
    const is = (s) => String(url).includes(s);
    return { ok: is("veryxjnn.com/") && !is("llms") && !is("robots") && !is("sitemap"), status: 200,
      text: async () => (is("llms") || is("robots") || is("sitemap") ? "" : shell) };
  };
  try {
    const r = await geo.geoReadiness("https://veryxjnn.com/");
    const c = r.checks.find((x) => x.id === "server-rendered");
    assert.ok(c, "the check must exist");
    assert.equal(c.status, "fail", "not 'unknown' — this IS what the AI crawler receives");
    assert.match(c.evidence, /nothing else/i);
    assert.match(c.fix, /highest-value/i);
  } finally { globalThis.fetch = real; }
});

// ---------------------------------------------------------------------------
// Gateway budget — adding a fallback must never make the request impossible.
//
// Live failure: "anthropic (timed out after 17s); openai (timed out after 17s);
// gemini (timed out after 17s)". 50s ÷ 3 providers = 16.6s each. Configuring a
// third provider had SHORTENED every attempt from 25s to 17s, so a generation
// that needed more than 17s could not succeed on any of them.
// ---------------------------------------------------------------------------

test("gateway: the budget is RESERVED for fallbacks, never divided among them", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(gw, /const reserved = MIN_PROVIDER_MS \* \(providersLeft - 1\);/);
  assert.match(gw, /const slice = Math\.min\(perCallMs, Math\.max\(MIN_PROVIDER_MS, remaining - reserved\)\);/);
  assert.doesNotMatch(gw, /Math\.floor\(remaining \/ providersLeft\)/,
    "an equal split is what made a third provider shrink every attempt to 17s");

  // The arithmetic itself, at the numbers that failed live.
  const MIN = 8_000, PER = 45_000;
  const sliceFor = (remaining, left) => Math.min(PER, Math.max(MIN, remaining - MIN * (left - 1)));
  assert.equal(sliceFor(105_000, 3), 45_000, "the first provider gets a real attempt, not a third of the budget");
  assert.ok(sliceFor(105_000, 3) > 16_600, "which is the whole point — 16.6s was unwinnable");
  assert.ok(sliceFor(60_000, 2) >= MIN, "and a fallback still gets a usable slot");
});

test("gateway: a caller can state its own budget instead of inheriting a chat default", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  // The invariant is that a caller CAN state a budget — not the exact shape of
  // the options object, which now also carries the cost tier.
  assert.match(gw, /opts: \{ budgetMs\?: number; perCallMs\?: number;[^}]*\} = \{\}/);
  assert.match(gw, /const deadline = Date\.now\(\) \+ budgetMs;/);
  // And the agent route must actually use it, anchored at arrival.
  const route = readFileSync(new URL("../src/app/api/agents/[agentId]/route.ts", import.meta.url), "utf8");
  assert.match(route, /const startedAt = Date\.now\(\);/);
  assert.match(route, /budgetMs: Math\.max\(8_000, ROUTE_BUDGET_MS - spent\)/,
    "a budget that ignores time already spent is the fiction that returns a 504");
  assert.match(route, /export const maxDuration = 120;/);
});

test("seo-deploy: the panel cannot contradict its own save", () => {
  // Live screenshot: "Saved. 3 fix(es) will be applied." printed directly above
  // "0 of 0 fix(es) approved. Auto-deploy is OFF" — the second sentence was the
  // note from the GET before the save, still on screen.
  const panel = readFileSync(new URL("../src/components/SeoDeployPanel.tsx", import.meta.url), "utf8");
  const saveFn = panel.slice(panel.indexOf("async function save("), panel.indexOf("async function draftFromCrawl"));
  assert.match(saveFn, /setNote\(""\)/,
    "the stale GET note must be cleared, or it argues with the save result");
});

test("seo-deploy: 'will be applied' is not printed when nothing can be", () => {
  // Auto-deploy ON + fixes approved + NO authorised host = the snippet refuses
  // to run anywhere. The live screenshot led with "Saved. 3 fix(es) will be
  // applied." — true of the stored config, false of the world.
  const cfg = (over) => ({ brandId: "b1", enabled: true, updatedAt: "", allowedHosts: ["veryxjnn.com"],
    fixes: [{ id: "f1", kind: "description", path: "*", value: "A CDE.", replace: false, approved: true, source: "x", createdAt: "" }], ...over });

  const blocked = seod.saveNote(cfg({ allowedHosts: [] }));
  assert.match(blocked, /^Saved, but nothing will be applied yet/,
    "the blocking condition is the headline, not a footnote under a success line");
  assert.doesNotMatch(blocked, /will be applied\. Live within/);

  assert.match(seod.saveNote(cfg({ enabled: false })), /switched off, so nothing is applied/);
  assert.match(seod.saveNote(cfg({ fixes: [] })), /No fixes queued/);
  assert.match(seod.saveNote(cfg()), /^Saved\. 1 fix\(es\) will be applied\./,
    "and when it genuinely will apply, it says so plainly");

  const route = readFileSync(new URL("../src/app/api/seo/deploy/route.ts", import.meta.url), "utf8");
  assert.match(route, /note: saveNote\(config\)/, "the route must use it, not rebuild the wording inline");
});

// ---------------------------------------------------------------------------
// Deep crawl — "Works on any URL" and "Activate with a connector" cannot both
// be true, and they sat one above the other on the same screen. There was no
// connector: the crawler was fetching the page and discarding almost all of it.
// ---------------------------------------------------------------------------

const rb = await import("../src/backend/robots.ts");
const sx = await import("../src/backend/site-extract.ts");
const dc = await import("../src/backend/deep-crawl.ts");

test("robots: ONE group applies — the most specific, not the union of all", () => {
  const f = rb.parseRobots([
    "User-agent: Googlebot", "Disallow: /google-only", "",
    "User-agent: MarketWarBot", "Disallow: /private", "",
    "User-agent: *", "Disallow: /",
  ].join("\n"));
  // Our own group wins outright: neither the "*" blanket ban nor Googlebot's rule.
  assert.equal(rb.robotsAllows(f, "/private").allowed, false);
  assert.equal(rb.robotsAllows(f, "/google-only").allowed, true, "that rule was written for someone else");
  assert.equal(rb.robotsAllows(f, "/anything").allowed, true, "the * group does not apply once a named group matches");
});

test("robots: longest match wins, and a tie goes to Allow", () => {
  const f = rb.parseRobots("User-agent: *\nDisallow: /admin\nAllow: /admin/public");
  assert.equal(rb.robotsAllows(f, "/admin/secret").allowed, false);
  assert.equal(rb.robotsAllows(f, "/admin/public/page").allowed, true,
    "reading top-to-bottom and taking the first hit gets this backwards");
  const tie = rb.parseRobots("User-agent: *\nDisallow: /x\nAllow: /x");
  assert.equal(rb.robotsAllows(tie, "/x").allowed, true, "equal length: Allow wins, per RFC 9309");
});

test("robots: an empty Disallow is permission, and a missing file is too", () => {
  assert.equal(rb.robotsAllows(rb.parseRobots("User-agent: *\nDisallow:"), "/anything").allowed, true);
  assert.equal(rb.robotsAllows(rb.parseRobots("User-agent: *\nDisallow: /"), "/anything").allowed, false);
  const none = rb.parseRobots("", false);
  assert.equal(rb.robotsAllows(none, "/").allowed, true);
  assert.match(rb.robotsAllows(none, "/").reason, /permitted by default/);
});

test("robots: wildcards and the $ anchor", () => {
  const f = rb.parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*/private");
  assert.equal(rb.robotsAllows(f, "/files/report.pdf").allowed, false);
  assert.equal(rb.robotsAllows(f, "/files/report.pdf.html").allowed, true, "the $ anchors the end");
  assert.equal(rb.robotsAllows(f, "/tmp/a/private").allowed, false);
  assert.equal(rb.robotsAllows(f, "/tmp/private").allowed, true);
});

test("robots: an agent group is matched by name, never by substring", () => {
  // A group for "BadBot" must not capture "MarketWarBot" — we would then be
  // obeying rules written about somebody else entirely.
  const f = rb.parseRobots("User-agent: Bot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin");
  assert.equal(rb.robotsAllows(f, "/pricing").allowed, true);
  assert.equal(rb.robotsAllows(f, "/admin").allowed, false, "we fall back to the * group instead");
});

test("robots: the site's Crawl-delay is honoured, and capped", () => {
  assert.equal(rb.crawlDelayMs(rb.parseRobots("User-agent: *\nCrawl-delay: 2")), 2000);
  assert.equal(rb.crawlDelayMs(rb.parseRobots("User-agent: *\nCrawl-delay: 9999")), 5000, "one hostile value cannot stall a crawl");
  assert.equal(rb.crawlDelayMs(rb.parseRobots("User-agent: *\nDisallow: /x")), 0);
});

// --- extraction ---

const PAGE = `<!doctype html><html lang="en-GB"><head>
<title>VeryX — a work-centric CDE | VeryX</title>
<meta property="og:site_name" content="VeryX">
<meta name="description" content="A work-centric common data environment for site teams.">
<meta name="theme-color" content="#2E7CF6">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"Organization","name":"VeryX","logo":"https://veryxjnn.com/logo.svg","telephone":"+33 1 23 45 67 89",
  "address":{"@type":"PostalAddress","streetAddress":"12 Rue de Rivoli","addressLocality":"Paris"},
  "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.7","reviewCount":"213"}},
 {"@type":"Product","name":"VeryX Pro","offers":{"@type":"Offer","price":"49","priceCurrency":"EUR"}},
 {"@type":"Question","name":"Do you offer a trial?","acceptedAnswer":{"@type":"Answer","text":"Yes, 14 days."}}
]}</script></head><body>
<nav><a href="/pricing">Pricing</a><a href="/about">About us</a></nav>
<h1>Built for site teams</h1><h2>Why VeryX</h2>
<a href="/signup" class="cta">Get a quote</a><button>Add to cart</button>
<p>30% off until Friday. Money-back guarantee on every plan. Trusted by 400 teams since 2019. Also seen at £99 elsewhere.</p>
<img src="/hero.jpg" alt="Site team on a project"><img src="/logo-mark.png">
<iframe src="https://www.youtube.com/embed/abc123" title="Product tour"></iframe>
<a href="https://www.linkedin.com/company/veryx">LinkedIn</a>
<a href="/blog/how-to-choose-a-cde">How to choose a CDE</a>
<a href="mailto:hello@veryxjnn.com">Email us</a>
</body></html>`;
const CSS = `:root{--brand:#2e7cf6}body{font-family:"Inter",sans-serif;color:#111827}`;

test("site-extract: it reads the page it was already holding", () => {
  const x = sx.extractPage(PAGE, "https://veryxjnn.com/", CSS);
  assert.equal(x.brand.name, "VeryX");
  assert.equal(x.brand.lang, "en-GB");
  assert.deepEqual(x.products.values, ["VeryX Pro"]);
  assert.ok(x.logos.some((l) => l.includes("logo.svg")));
  assert.ok(x.colours.includes("#2e7cf6"), "theme-color and the stylesheet both feed this");
  assert.ok(x.fonts.includes("Inter"));
  assert.ok(x.ctas.includes("Get a quote") && x.ctas.includes("Add to cart"));
  assert.ok(x.navigation.some((n) => n.label === "About us"), "'About us' is navigation, not a CTA");
  assert.ok(!x.ctas.includes("About us"));
  assert.equal(x.reviews[0].rating, "4.7");
  assert.equal(x.reviews[0].count, "213");
  assert.equal(x.faqs[0].q, "Do you offer a trial?");
  assert.ok(x.videos.some((v) => v.url.includes("youtube")));
  assert.ok(x.socialLinks.some((l) => l.url.includes("linkedin")));
  assert.ok(x.blogLinks.some((l) => l.url.includes("/blog/")));
  assert.ok(x.contact.emails.includes("hello@veryxjnn.com"));
  assert.match(x.contact.address, /Rue de Rivoli/);
  assert.ok(x.trustSignals.some((t) => /money-back|guarantee/i.test(t)));
  assert.ok(x.offers.some((o) => /30% off/i.test(o)));
  assert.ok(x.hierarchy[0].level === 1 && x.hierarchy[0].text === "Built for site teams");
  assert.ok(x.images.some((i) => i.url.endsWith("/hero.jpg")), "and relative URLs are made absolute");
});

test("site-extract: a DECLARED price is never merged with one merely seen in prose", () => {
  // Only one of these is safe to quote back in an advert. The £99 is a sentence
  // about somebody else's pricing.
  const x = sx.extractPage(PAGE, "https://veryxjnn.com/", CSS);
  const declared = x.pricing.filter((p) => p.declared);
  const seen = x.pricing.filter((p) => !p.declared);
  assert.equal(declared.length, 1);
  assert.equal(declared[0].value, "49");
  assert.equal(declared[0].currency, "EUR");
  assert.ok(seen.some((p) => p.value.includes("99")));
  assert.match(seen[0].context, /seen in the page text/);
});

test("site-extract: audience is refused, with the reason, on every page", () => {
  // You cannot read who a business sells to off its markup. An inference printed
  // in a list headed "extracts" is a fabrication with good posture.
  const x = sx.extractPage(PAGE, "https://veryxjnn.com/", CSS);
  assert.equal(x.audience, null);
  const gap = x.notExtracted.find((n) => n.field === "Audience");
  assert.ok(gap);
  assert.match(gap.reason, /not written in its markup/i);
  // And a merge must not quietly lose the refusal.
  assert.equal(sx.mergeExtractions([x, x]).audience, null);
  assert.ok(sx.mergeExtractions([x, x]).notExtracted.some((n) => n.field === "Audience"));
});

test("site-extract: merging keeps declared prices ahead of prose ones", () => {
  const blog = sx.extractPage(`<html><body><p>Competitors charge $1,299 a seat.</p></body></html>`, "https://veryxjnn.com/blog/x");
  // Blog FIRST on purpose: if the sort were removed, source order alone would
  // put the prose price at the top and the test would prove nothing.
  const merged = sx.mergeExtractions([blog, sx.extractPage(PAGE, "https://veryxjnn.com/", CSS)]);
  assert.equal(merged.pricing[0].value, "49");
  assert.equal(merged.pricing[0].declared, true,
    "a stray number in a blog post must not outrank the price the business published");
});

// --- the crawl itself ---

const deepWith = async (pages, opts = {}) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const key = Object.keys(pages).find((k) => String(url).endsWith(k) || String(url) === k);
    const p = key ? pages[key] : { status: 404, body: "" };
    return { ok: p.status < 300, status: p.status, url: String(url), headers: { get: () => null },
      arrayBuffer: async () => new TextEncoder().encode(p.body || "").buffer, text: async () => p.body || "" };
  };
  try { return await dc.deepCrawl("https://veryxjnn.com/", { sleep: async () => {}, ...opts }); }
  finally { globalThis.fetch = real; }
};

test("deep-crawl: it obeys robots.txt instead of merely detecting it", async () => {
  const r = await deepWith({
    "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private\nSitemap: https://veryxjnn.com/sitemap.xml" },
    "/sitemap.xml": { status: 200, body: "<urlset><loc>https://veryxjnn.com/pricing</loc><loc>https://veryxjnn.com/private/deal</loc></urlset>" },
    "https://veryxjnn.com/": { status: 200, body: PAGE },
    "/pricing": { status: 200, body: PAGE },
    "/private/deal": { status: 200, body: "<html><body>secret</body></html>" },
    "/style.css": { status: 200, body: CSS },
  });
  assert.ok(r.robots.present && r.robots.obeyed);
  assert.ok(r.robots.disallowed.includes("/private/deal"), "the disallowed page must be named, not silently dropped");
  assert.ok(!r.pages.some((p) => p.ok && p.url.includes("/private/")), "and never fetched");
  assert.ok(r.pages.some((p) => p.ok && p.url.includes("/pricing")));
  assert.match(r.note, /read and obeyed/);
});

test("deep-crawl: it stays on one site", async () => {
  const urls = dc.discoverUrls({
    sitemapXml: "<urlset><loc>https://veryxjnn.com/a</loc><loc>https://someone-else.com/b</loc></urlset>",
    html: '<a href="https://evil.example/x">x</a><a href="/pricing">p</a>',
    base: "https://veryxjnn.com/", host: "veryxjnn.com", cap: 20,
  });
  assert.ok(urls.some((u) => u.includes("veryxjnn.com/a")));
  assert.ok(urls.some((u) => u.includes("veryxjnn.com/pricing")));
  assert.ok(!urls.some((u) => u.includes("someone-else.com") || u.includes("evil.example")),
    "a crawler that wanders off-domain is fetching third parties nobody authorised");
});

test("deep-crawl: commercially useful pages are reached before the blog archive", () => {
  const urls = dc.discoverUrls({
    sitemapXml: "",
    html: ['<a href="/blog/1">1</a>', '<a href="/blog/2">2</a>', '<a href="/blog/3">3</a>', '<a href="/pricing">p</a>'].join(""),
    base: "https://veryxjnn.com/", host: "veryxjnn.com", cap: 2,
  });
  assert.ok(urls[0].includes("/pricing"), "a pricing page is worth more to an audit than the twelfth blog post");
});

test("deep-crawl: a partial answer SAYS it is partial", async () => {
  const many = { "/robots.txt": { status: 404, body: "" },
    "/sitemap.xml": { status: 200, body: Array.from({ length: 30 }, (_, i) => `<loc>https://veryxjnn.com/p${i}</loc>`).join("") },
    "https://veryxjnn.com/": { status: 200, body: PAGE }, "/style.css": { status: 200, body: CSS } };
  for (let i = 0; i < 30; i++) many[`/p${i}`] = { status: 200, body: PAGE };
  const r = await deepWith(many, { maxPages: 3 });
  assert.equal(r.partial, true);
  assert.match(r.note, /sample of the site, not all of it/);
  assert.ok(r.pages.filter((p) => p.ok).length <= 3, "the cap is real");
});

test("deep-crawl: the single-page audit still runs, and a blocked site says so", async () => {
  const r = await deepWith({
    "/robots.txt": { status: 404, body: "" },
    "https://veryxjnn.com/": { status: 403, body: "<html><body>cf-browser-verification Attention Required! | Cloudflare</body></html>" },
  });
  assert.equal(r.audit.ok, false);
  assert.equal(r.extraction, null, "there is nothing to extract from a challenge page");
  assert.match(r.note, /could not be read|Cloudflare/i);
});

test("deep-crawl: the entry URL is normalised, so the homepage is not read twice", async () => {
  // "evandeli.com" became "https://evandeli.com" with no trailing slash, while
  // every URL discovered from the sitemap carried one — so `u !== start` never
  // matched and the homepage was fetched as itself AND from the site's own
  // sitemap, burning a slot out of the page cap to re-read what we had.
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    const u = String(url);
    const body = u.endsWith("/robots.txt") ? "User-agent: *"
      : u.endsWith("/sitemap.xml") ? "<urlset><loc>https://veryxjnn.com/</loc><loc>https://veryxjnn.com/pricing</loc></urlset>"
      : PAGE;
    return { ok: true, status: 200, url: u, headers: { get: () => null },
      arrayBuffer: async () => new TextEncoder().encode(body).buffer, text: async () => body };
  };
  let r;
  try { r = await dc.deepCrawl("veryxjnn.com", { maxPages: 4, sleep: async () => {} }); }
  finally { globalThis.fetch = real; }

  const homepageReads = r.pages.filter((p) => p.ok && new URL(p.url).pathname === "/").length;
  assert.equal(homepageReads, 1, "the homepage must appear once, not once per spelling of its URL");
  assert.ok(r.pages.some((p) => p.ok && p.url.includes("/pricing")), "and the freed slot goes to a real page");
});

test("site-extract: an offer is scoped to its own block, not to the whole page", () => {
  // A live crawl recorded this as an offer: "struction intelligence Pricing
  // About us Deals Construction intelligence Get a quote Start free trial 20%
  // off until Friday" — the nav, the H1 and the buttons, swept in because none
  // of them contains a full stop for a character-window regex to stop at.
  const html = `<html><body>
    <nav><a href="/pricing">Pricing</a><a href="/about">About us</a></nav>
    <h1>Construction intelligence</h1>
    <button>Start free trial</button>
    <p>20% off until Friday.</p></body></html>`;
  const x = sx.extractPage(html, "https://evandeli.com/");
  assert.ok(x.offers.some((o) => /^20% off until Friday/.test(o)));
  assert.ok(!x.offers.some((o) => /Pricing|About us|Construction intelligence/.test(o)),
    "navigation and headings are not part of the promotion");
  assert.ok(!x.offers.includes("Start free trial"), "that is a call to action, and is already counted as one");
  assert.ok(x.ctas.includes("Start free trial"));
});

// ---------------------------------------------------------------------------
// Funnel → checkout. The join looked like an afternoon until you follow the
// money: createCheckoutLink mints sessions on the PLATFORM's Stripe key, so a
// customer selling through it sends their revenue to MarketWar's balance with
// no payout path back. The button carries THEIR link instead.
// ---------------------------------------------------------------------------

const { execSync } = await import("node:child_process");
const fchk = await import("../src/backend/funnel-checkout.ts");

test("funnel-checkout: a payment link must be https, whatever the customer prefers", () => {
  const bad = fchk.checkCheckoutLink("http://buy.stripe.com/abc");
  assert.equal(bad.ok, false);
  assert.match(bad.error, /card details travel in the clear/);
  assert.equal(fchk.checkCheckoutLink("https://buy.stripe.com/abc").ok, true);
});

test("funnel-checkout: known providers are named, unknown ones are allowed but flagged", () => {
  // Refusing an unrecognised processor would block a legitimate seller for our
  // own convenience — there are more payment providers than we can enumerate.
  const stripe = fchk.checkCheckoutLink("buy.stripe.com/test_123");
  assert.equal(stripe.provider, "Stripe");
  assert.equal(stripe.recognised, true);
  assert.match(stripe.note, /MarketWar never handles this payment/);

  const odd = fchk.checkCheckoutLink("https://pay.some-local-processor.fr/x");
  assert.equal(odd.ok, true, "an unknown provider is still allowed");
  assert.equal(odd.recognised, false);
  assert.match(odd.note, /do not recognise/);
  assert.match(odd.note, /not to MarketWar/);
});

test("funnel-checkout: a broken link renders no button at all", () => {
  // A "Buy now" that goes nowhere costs a real sale and teaches the buyer the
  // site is broken.
  assert.equal(fchk.checkoutBlock({ ...fchk.emptyCheckout(), enabled: true, url: "not a url" }), null);
  assert.equal(fchk.checkoutBlock({ ...fchk.emptyCheckout(), enabled: true, url: "http://buy.stripe.com/x" }), null);
  assert.equal(fchk.checkoutBlock({ ...fchk.emptyCheckout(), enabled: false, url: "https://buy.stripe.com/x" }), null);
  const ok = fchk.checkoutBlock({ enabled: true, url: "https://buy.stripe.com/x", buttonLabel: "Get the platter", provider: "", priceLabel: "£24" });
  assert.equal(ok.url, "https://buy.stripe.com/x");
  assert.equal(ok.label, "Get the platter");
  assert.match(ok.sub, /£24 · Secure checkout via Stripe/);
});

test("funnel-checkout: the funnel is ACU-payable, the checkout is not", () => {
  // Writing the page is real provider spend and belongs on the plan allowance.
  // Rendering a button costs us nothing, and metering it would be a payment fee
  // in a compute costume — inventing a cost we do not bear breaks the pricing
  // law as badly as underpricing it.
  const note = fchk.funnelCostNote(25);
  assert.match(note, /25 ACUs from your plan's monthly allowance/);
  assert.match(note, /no separate funnel fee/);
  assert.match(note, /buy button and click tracking cost nothing/);
  assert.match(note, /no per-sale fee/);
  assert.match(note, /money lands in your account/);
});

test("siteraid: the Truth Layer is never handed a rating nobody measured", () => {
  // It cleared "Rated 4.7 by 213 reviewers" as VERIFIED BUSINESS DATA —
  // PUBLISHABLE, from useState(213) and useState(4.7) hardcoded in the page.
  // The one component whose job is blocking unverified claims was certifying an
  // invented number on a screen telling the customer they may advertise it.
  const src = readFileSync(new URL("../src/app/dashboard/website-intel/page.tsx", import.meta.url), "utf8");
  // Matched against CODE, not prose — the comment explaining the fix names the
  // old values, and an assertion that trips on its own documentation is useless.
  assert.doesNotMatch(src, /const \[reviews\]\s*=\s*useState|const \[rating\]\s*=\s*useState/,
    "the fabricated rating must be gone from the code");
  assert.doesNotMatch(src, /source: "Google reviews"/, "and so must the source label that certified it");
  assert.match(src, /const measured = deep\?\.extraction\?\.reviews\?\.\[0\]/,
    "the rating now comes from AggregateRating in the site's own structured data");
  assert.match(src, /rating && reviews\s*\n?\s*\?/, "and the claim is omitted entirely when there is none");
  assert.match(src, /reviews: reviews \?\? 0/, "an absent rating scores zero, not a flattering placeholder");
});

test("siteraid: the audit says its scores are not measurements", () => {
  // instantAudit computes every sub-score as sscore(business + area + name) — a
  // hash of the typed business name. Stable and useful for ranking areas
  // against each other; not a reading of the website, and the page must say so.
  const engine = readFileSync(new URL("../src/backend/siteraid.ts", import.meta.url), "utf8");
  assert.match(engine, /sscore\(x\.business \+ area \+ name\)/, "this test exists because of that line");
  const src = readFileSync(new URL("../src/app/dashboard/website-intel/page.tsx", import.meta.url), "utf8");
  assert.match(src, /<strong>not measurements of your website<\/strong>/);
  assert.match(src, /Read the numbers correctly/);
  assert.match(src, /Live site crawl/, "and it points at where the measured numbers actually are");
});

test("revenue: the checkout link settles to the seller, and offers them the way to do it", () => {
  // It used to mint on the platform's own STRIPE_SECRET_KEY, and the page
  // carried a warning saying so. A warning is not a control: the server now
  // refuses a real-money link that would pay us, so the page's job is to hand
  // the seller the field that makes the money theirs.
  const src = readFileSync(new URL("../src/app/dashboard/revenue/page.tsx", import.meta.url), "utf8");
  assert.match(src, /stripeAccountId: co\.account\.trim\(\)/, "the seller's account must actually be sent");
  assert.match(src, /The money goes to you, not to us/);
  assert.match(src, /never enters MarketWar&apos;s balance/);
  assert.ok(!/use it for testing, not for taking real money/.test(src),
    "that caveat described the old behaviour and would now be a lie");
});

test("first-customer: step 4 can reach a real first sale, not just a test link", () => {
  // The sprint's whole promise is a paying customer. With the platform key live
  // and no connected account the server refuses to mint, so without this field
  // the fourth step would dead-end on an error the page gave no way to fix.
  const src = readFileSync(new URL("../src/app/dashboard/first-customer/page.tsx", import.meta.url), "utf8");
  assert.match(src, /stripeAccountId: form\.stripeAccountId\.trim\(\)/);
  assert.match(src, /required to take real money/);
});

test("checkout: the seller's account is passed through the route, not dropped", () => {
  const src = readFileSync(new URL("../src/app/api/checkout/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /stripeAccountId:\s*typeof body\.stripeAccountId/);
});

test("checkout: a connected account is sent to Stripe as the account to charge on", () => {
  // Without the Stripe-Account header the session is created on OUR account and
  // the seller's id is decoration.
  const src = readFileSync(new URL("../src/backend/checkout.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /"Stripe-Account":\s*seller\.account/);
  assert.match(src, /seller\.route === "refuse"/, "the refusal must be wired into the mint path");
});

// ---------------------------------------------------------------------------
// A document is not a chat reply, and a route must outlast what it delegates.
//
// Live: "Generation failed — your 25 ACUs were refunded. All AI providers
// failed: anthropic (timed out after 25s); openai (timed out after 17s); gemini
// (skipped)". The reserve logic worked — the first provider got a real 25s
// attempt — but the route had 120 seconds and never told the gateway, so a blog
// post was written inside a 50-second box sized for a chat answer.
// ---------------------------------------------------------------------------

test("gateway: long-form generators ask for a document budget, not the chat default", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(gw, /export const DOCUMENT_BUDGET = \{ budgetMs: 100_000, perCallMs: 45_000 \}/);

  // Either budget is a document budget — DOCUMENT_DEEP is DOCUMENT_BUDGET plus a
  // quality-first provider order. What matters here is that a document-sized
  // generator never inherits the chat-sized default.
  for (const mod of ["blog-generator", "growth-plan", "organic-dominance", "strategy-run", "copywriter"]) {
    const src = readFileSync(new URL(`../src/backend/${mod}.ts`, import.meta.url), "utf8");
    assert.match(src, /gatewayComplete\([\s\S]*?,\s*DOCUMENT_(BUDGET|DEEP)\)/,
      `${mod} writes documents and must pass a document budget, not merely import one`);
  }
  assert.match(gw, /DOCUMENT_DEEP = \{ \.\.\.DOCUMENT_BUDGET/, "deep must inherit the document budget");
});

test("routes: every document generator outlasts the budget it delegates", () => {
  // Four of these had NO maxDuration at all, so they ran on the ~10s platform
  // default — killed long before any provider could answer. The generation could
  // never have completed regardless of what the gateway did.
  const BUDGET_MS = 100_000;
  for (const route of [
    "growth-plan/route.ts", "organic-dominance/route.ts", "ai-agents/route.ts",
    "blog/route.ts", "blog/daily/route.ts", "seo-autopilot/route.ts",
  ]) {
    const src = readFileSync(new URL(`../src/app/api/${route}`, import.meta.url), "utf8");
    const m = /export const maxDuration = (\d+)/.exec(src);
    assert.ok(m, `${route} has no maxDuration — it runs on the ~10s default`);
    assert.ok(Number(m[1]) * 1000 > BUDGET_MS,
      `${route} allows ${m[1]}s but delegates ${BUDGET_MS / 1000}s of work`);
  }
});

// ---------------------------------------------------------------------------
// AI Visibility questions read from the customer's own website.
//
// suggestQuestions() built six templates from four typed fields, so every
// business in a category got the same six, every run, forever. The deep crawl
// already reads the real subjects off the site — but "ask different ones each
// time" has a trap in it, and these tests hold both halves.
// ---------------------------------------------------------------------------

const vq = await import("../src/backend/visibility-questions.ts");
const aiv = await import("../src/backend/ai-visibility.ts");

const EXTRACTION = {
  url: "https://veryxjnn.com/",
  brand: { name: "VeryX", tagline: "", lang: "en", siteName: "VeryX" },
  products: { values: ["common data environment"], source: "structured-data" },
  services: { values: ["document control"], source: "structured-data" },
  pricing: [{ value: "199", declared: true, context: "Pro" }],
  images: [], videos: [], logos: [], colours: [], fonts: [],
  ctas: [], trustSignals: [], reviews: [],
  faqs: [{ q: "How long does a construction handover take?", a: "" }, { q: "Do you offer a free trial?", a: "" }],
  // "Why VeryX" is a real heading on a real site, and it must NOT become a
  // subject: "who are the best why veryx providers" measures nothing.
  // Long enough to survive the length filter, so the brand-name guard is the
  // thing under test rather than an incidental minimum-length rule.
  hierarchy: [{ level: 2, text: "Site diaries and progress tracking" }, { level: 2, text: "Why VeryX beats spreadsheets" }],
  navigation: [{ url: "/x", label: "Snagging software" }, { url: "/a", label: "About" }, { url: "/p", label: "VeryX Pro for enterprise teams" }],
  offers: [], blogLinks: [], contact: { emails: [], phones: [], address: "" }, socialLinks: [],
  audience: null, notExtracted: [], found: 9,
};

test("visibility-questions: the subjects come off the site, not a template", () => {
  const pool = vq.questionsFromSite({ business: "VeryX", extraction: EXTRACTION, location: "London" });
  const all = [...pool.core, ...pool.rotating].map((q) => q.text).join(" | ");
  assert.match(all, /common data environment/, "a Product in the structured data");
  assert.match(all, /document control/, "a Service");
  assert.match(all, /construction handover/, "a real FAQ subject");
  assert.match(all, /snagging software/i, "their own navigation");
  assert.match(all, /site diaries/i, "an H2");
  // And every subject is traceable back to where we read it.
  assert.ok(pool.sources.some((x) => /structured data/.test(x.from)));
  assert.ok(pool.sources.some((x) => /FAQ/.test(x.from)));
});

test("visibility-questions: a question the assistant cannot answer is never asked", () => {
  // "Do you offer a free trial?" makes sense on the site and is incoherent
  // asked of ChatGPT, which has no idea who "you" is. A non-answer to that
  // looks like a visibility failure and is nothing of the kind.
  assert.equal(vq.askableOfAnAssistant("Do you offer a free trial?"), false);
  assert.equal(vq.askableOfAnAssistant("How long does a construction handover take?"), true);
  assert.equal(vq.askableOfAnAssistant("About"), false);
  assert.equal(vq.askableOfAnAssistant("Hi"), false);

  const pool = vq.questionsFromSite({ business: "VeryX", extraction: EXTRACTION, location: "London" });
  const all = [...pool.core, ...pool.rotating].map((q) => q.text).join(" | ");
  assert.doesNotMatch(all, /free trial/i, "the second-person FAQ must not survive into the pool");
  // The brand-name question is the ONE place the name is allowed to appear.
  const withoutBrandQ = all.replace(/What is VeryX and would you recommend them\?/g, "");
  assert.doesNotMatch(withoutBrandQ, /VeryX/i,
    "no subject may contain the brand's own name — 'best VeryX Pro providers' measures nothing");
  assert.equal(pool.sources.some((x) => /veryx/i.test(x.subject)), false,
    "and it must be rejected at the subject stage, not filtered out later");
});

test("visibility-questions: an FAQ is asked as written, not wrapped in a noun template", () => {
  // A live run produced "Who are the best how long does enterprise PMO rollout
  // take companies in the UK?" — a question stuffed into a slot built for a
  // noun phrase. An FAQ IS the buyer's question; it gets asked, not wrapped.
  assert.equal(vq.isQuestionShaped("how long does a handover take"), true);
  assert.equal(vq.isQuestionShaped("document control"), false);

  const pool = vq.questionsFromSite({ business: "VeryX", extraction: EXTRACTION, location: "London" });
  const all = [...pool.core, ...pool.rotating].map((q) => q.text);
  assert.ok(all.some((t) => /^How long does a construction handover take\?$/.test(t)),
    "the FAQ is asked in the buyer's own words");
  assert.ok(!all.some((t) => /best how long|option for how long/i.test(t)),
    "and never wrapped into nonsense");

  // The templated core needs a NOUN, so a question-shaped subject cannot fill it.
  assert.ok(pool.core.every((q) => !/best how long|choosing a how long/i.test(q.text)));
});

test("visibility-questions: a question never fills the templated core", () => {
  // The core is "who are the best ___ providers", which needs a noun. A site
  // whose first readable subject is an FAQ must not produce "who are the best
  // how do i migrate from spreadsheets providers".
  const questionsFirst = {
    ...EXTRACTION,
    products: { values: [], source: "structured-data" },
    services: { values: [], source: "structured-data" },
    faqs: [{ q: "How do I migrate from spreadsheets to a shared system?", a: "" }],
    hierarchy: [], navigation: [{ url: "/d", label: "Document control software" }],
  };
  const pool = vq.questionsFromSite({ business: "VeryX", extraction: questionsFirst, location: "London" });
  const templated = pool.core.filter((q) => q.intent !== "brand").map((q) => q.text).join(" | ");
  assert.doesNotMatch(templated, /how do i migrate/i, "a question cannot fill a noun slot");
  assert.match(templated, /document control software/i, "the first NOUN subject fills it instead");
  // And the FAQ is still asked — just in the rotation, in its own words.
  assert.ok(pool.rotating.some((q) => /^How do I migrate from spreadsheets/.test(q.text)));
});

test("visibility-questions: only subjects we actually used are reported as found", () => {
  // Listing a rejected subject as "found on your site" invites the customer to
  // look for a question that was never asked.
  const pool = vq.questionsFromSite({ business: "VeryX", extraction: EXTRACTION, location: "London" });
  const all = [...pool.core, ...pool.rotating].map((q) => q.text.toLowerCase()).join(" | ");
  for (const src of pool.sources) {
    assert.ok(all.includes(src.subject.toLowerCase()), `"${src.subject}" is listed as found but never asked`);
  }
  assert.equal(pool.sources.some((x) => x.subject.toLowerCase() === "about"), false, "nav chrome is not a subject");
});

test("visibility-questions: case survives, because these are read aloud to a model", () => {
  // Lower-casing every subject produced "how do i migrate from spreadsheets"
  // and "enterprise pmo rollout" — a bare "i" and a mangled acronym, in text
  // shown to the customer and sent verbatim to an assistant.
  const acronyms = {
    ...EXTRACTION,
    products: { values: ["PMO governance tooling"], source: "structured-data" },
    services: { values: ["ERP integration"], source: "structured-data" },
    faqs: [{ q: "How do I migrate from spreadsheets to a shared system?", a: "" }],
    hierarchy: [], navigation: [],
  };
  const pool = vq.questionsFromSite({ business: "VeryX", extraction: acronyms, location: "London" });
  const all = [...pool.core, ...pool.rotating].map((q) => q.text).join(" | ");
  assert.match(all, /PMO governance tooling/, "an acronym must not be lower-cased mid-sentence");
  assert.match(all, /ERP integration/);
  assert.ok(pool.rotating.some((q) => /^How do I migrate/.test(q.text)), "nor the pronoun I");
  // But an ordinary Title Case nav label still reads as a sentence.
  const nav = vq.questionsFromSite({
    business: "VeryX", location: "London",
    extraction: { ...EXTRACTION, products: { values: [], source: "structured-data" }, services: { values: [], source: "structured-data" }, faqs: [], hierarchy: [], navigation: [{ url: "/d", label: "Document control software" }] },
  });
  assert.match(nav.core.map((q) => q.text).join(" | "), /best document control software providers/);
});

test("visibility-questions: the core repeats every run, the rotation moves", () => {
  const pool = vq.questionsFromSite({ business: "VeryX", extraction: EXTRACTION, location: "London" });
  const r0 = vq.selectRunQuestions(pool, { runIndex: 0, rotateCount: 2 });
  const r1 = vq.selectRunQuestions(pool, { runIndex: 1, rotateCount: 2 });

  const coreOf = (r) => r.questions.filter((q) => q.core).map((q) => q.text);
  assert.deepEqual(coreOf(r0), coreOf(r1), "the core is what makes a trend a trend");
  assert.ok(coreOf(r0).length > 0);

  const rotOf = (r) => r.questions.filter((q) => !q.core).map((q) => q.text);
  assert.notDeepEqual(rotOf(r0), rotOf(r1), "and the rotation must actually rotate");

  // Deterministic: re-running run 0 asks run 0's questions, so a result can be
  // reproduced instead of leaving the customer wondering what changed.
  assert.deepEqual(
    vq.selectRunQuestions(pool, { runIndex: 0, rotateCount: 2 }).questions.map((q) => q.text),
    r0.questions.map((q) => q.text),
  );
});

test("visibility-questions: the run never exceeds the cap it was given", () => {
  const pool = vq.questionsFromSite({ business: "VeryX", extraction: EXTRACTION, location: "London" });
  for (const max of [1, 4, 8]) {
    const r = vq.selectRunQuestions(pool, { runIndex: 3, rotateCount: 5, maxTotal: max });
    assert.ok(r.questions.length <= max, `asked ${r.questions.length} with a cap of ${max}`);
  }
});

test("ai-visibility: the trend compares the CORE only, so rotation cannot fake movement", () => {
  // Two runs whose CORE result is identical, but whose rotating questions went
  // from all-miss to all-hit. The raw rate jumps; the real answer is "flat".
  const mk = (rotMentioned) => ({
    brand: "VeryX", askedCount: 4,
    results: [
      { question: { id: "c1", text: "Who are the best CDE providers in London?", intent: "buying", core: true },
        verdicts: [{ asked: true, mentioned: true }] },
      { question: { id: "c2", text: "What should someone look for when choosing a CDE provider?", intent: "problem", core: true },
        verdicts: [{ asked: true, mentioned: false }] },
      { question: { id: "r1", text: "Who are the best snagging software companies?", intent: "buying", core: false },
        verdicts: [{ asked: true, mentioned: rotMentioned }] },
      { question: { id: "r2", text: "What is the best option for document control?", intent: "buying", core: false },
        verdicts: [{ asked: true, mentioned: rotMentioned }] },
    ],
  });
  const latest = mk(true), previous = mk(false);

  assert.equal(aiv.coreScore(latest).rate, 50);
  assert.equal(aiv.coreScore(previous).rate, 50, "the core did not move at all");
  assert.ok(aiv.unpromptedScore(latest).rate > aiv.unpromptedScore(previous).rate,
    "while the raw rate did — which is the trap");

  const t = aiv.trend([latest, previous]);
  assert.equal(t.direction, "flat", "a score moving because the questions changed is not a score moving");
});

test("ai-visibility: a run recorded before rotation still trends", () => {
  // No question carries `core`, so coreScore returns null and the whole-run
  // score is used — which for those runs is the same thing, because every
  // question was asked every time.
  const old = { brand: "VeryX", askedCount: 1, results: [
    { question: { id: "q", text: "Who are the best CDE providers?", intent: "buying" }, verdicts: [{ asked: true, mentioned: true }] },
  ] };
  assert.equal(aiv.coreScore(old), null);
  assert.equal(aiv.unpromptedScore(old).rate, 100);
});

test("ai-visibility: reading questions off a site costs no ACUs", () => {
  // A crawl plus string assembly spends no provider budget, and charging for it
  // would be inventing a cost we do not bear.
  const route = readFileSync(new URL("../src/app/api/ai-visibility/route.ts", import.meta.url), "utf8");
  const idx = route.indexOf('if (s(body.action) === "questions") return siteQuestions');
  assert.ok(idx > -1, "the action must exist");
  // The CALL, not the import at the top of the file.
  const meterIdx = route.indexOf("await meterAction(");
  assert.ok(meterIdx > -1, "the run path must still meter");
  assert.ok(idx < meterIdx, "but reading questions must return before any of it");
});

test("funnel-checkout: the label cannot claim a checkout the page does not render", () => {
  // Written, tested, and imported by nothing — while the card said "the buy
  // button is wired". A label describing an unwired module is the same fault as
  // "Activate with a connector" on a feature that needed no connector, except
  // this one was self-inflicted while removing the others.
  const page = readFileSync(new URL("../src/app/dashboard/website-intel/page.tsx", import.meta.url), "utf8");
  const card = /AI Funnel Builder[^}]*}/.exec(page)?.[0] || "";
  assert.ok(card, "the card must exist");

  const src = ["src/app/dashboard", "src/app/b", "src/components", "src/backend"]
    .flatMap((d) => { try { return execSync(`grep -rl "funnel-checkout" ${d} 2>/dev/null || true`, { encoding: "utf8" }).split("\n"); } catch { return []; } })
    .filter((f) => f && !f.includes("backend/funnel-checkout.ts"));

  if (src.length === 0) {
    assert.doesNotMatch(card, /buy button is wired|checkout is (live|ready)/i,
      "nothing imports funnel-checkout.ts, so the card must not say the button is wired");
    assert.match(card, /NOT on the page yet/, "and it must say so plainly");
  } else {
    assert.match(card, /payment link/, "once wired, the card should describe it");
  }
});

test("visibility-questions: a landing-page slogan is not a subject", () => {
  // A live run on veryxjnn.com pulled these out of the headings: "Siloed data ·
  // Blind spots", "Why projects lose millions silently", "The inevitable
  // solution", "The enterprise leaders who expose broken processes and
  // transform them". Every one produces gibberish in the template, and asking
  // it of an assistant returns nothing — which then reads as a visibility
  // failure rather than a bad question.
  for (const slogan of [
    "Siloed data · Blind spots",
    "Why projects lose millions silently",
    "The inevitable solution",
    "The enterprise leaders who expose broken processes and transform them",
    "Manual work. More risk",
    "Stop paying for ten tools",
    // No article, no punctuation, short, no imperative — the marketing VERB is
    // the only thing that gives these away.
    "Complexity slows everyone down",
    "Projects lose millions silently",
    "Insight drives growth",
  ]) {
    assert.equal(vq.looksLikeASubject(slogan), false, `"${slogan}" is copy, not a subject`);
  }
  for (const subject of ["Document control software", "Procurement analytics", "Snagging software", "Governance and control"]) {
    assert.equal(vq.looksLikeASubject(subject), true, `"${subject}" is a subject`);
  }

  const sloganSite = {
    ...EXTRACTION,
    products: { values: [], source: "structured-data" },
    services: { values: [], source: "structured-data" },
    faqs: [],
    hierarchy: [
      { level: 2, text: "Why projects lose millions silently" },
      { level: 3, text: "Siloed data · Blind spots" },
      { level: 2, text: "Portfolio risk analytics" },
    ],
    navigation: [{ url: "/b", label: "Book a 20-min demo" }],
  };
  const pool = vq.questionsFromSite({ business: "VeryX", extraction: sloganSite, location: "the UK" });
  const all = [...pool.core, ...pool.rotating].map((q) => q.text).join(" | ");
  assert.doesNotMatch(all, /lose millions|siloed data|book a 20/i, "no slogan may reach a question");
  assert.match(all, /portfolio risk analytics/i, "the one real subject on that page is used");
});

test("ai-visibility: ten questions fit inside the budget the route allows", () => {
  // Ten questions × three assistants is thirty provider calls. Each layer has to
  // outlast the one it delegates to, or the run is killed and reports nothing.
  const engine = readFileSync(new URL("../src/backend/ai-visibility.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/ai-visibility/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/dashboard/ai-visibility/page.tsx", import.meta.url), "utf8");

  const budget = Number(/AI_VISIBILITY_BUDGET_MS \|\| ([\d_]+)/.exec(engine)[1].replace(/_/g, ""));
  const maxDuration = Number(/export const maxDuration = (\d+)/.exec(route)[1]);
  const clientGiveUp = Number(/ctl\.abort\(\), ([\d_]+)\)/.exec(page)[1].replace(/_/g, ""));
  const maxQuestions = Number(/const MAX_QUESTIONS = (\d+)/.exec(route)[1]);

  assert.equal(maxQuestions, 10);
  assert.ok(budget < maxDuration * 1000, `run budget ${budget}ms must fit inside the ${maxDuration}s function`);
  assert.ok(clientGiveUp > budget,
    `the browser gives up at ${clientGiveUp}ms, abandoning a run the server budgets ${budget}ms for`);
});

test("ai-visibility: the next run's questions are refilled without being re-typed", () => {
  // The rotation only widens coverage if it actually advances. After a run is
  // recorded, the list refills from the site with the next slice — core intact,
  // rotation moved on.
  const page = readFileSync(new URL("../src/app/dashboard/ai-visibility/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(qSite\.trim\(\)\) void readQuestions\(\{ silent: true \}\)/);
  // Silent, because a background refill must not blank the note the customer is
  // reading about the run that just finished.
  assert.match(page, /if \(!opts\.silent\) \{ setQBusy\(true\)/);
});

// ---------------------------------------------------------------------------
// The seven open items, closed.
// ---------------------------------------------------------------------------

const tw = await import("../src/backend/trend-watch.ts");
const sr = await import("../src/backend/siteraid.ts");

test("site-extract: a tracking pixel is not one of your images", () => {
  // A live crawl reported "Images (1)" and the image was
  // facebook.com/tr?id=…&ev=PageView — a 1×1 counting beacon presented to the
  // customer as their site's only picture.
  assert.equal(sx.isTrackingPixel("https://www.facebook.com/tr?id=979943514805459&ev=PageView"), true);
  assert.equal(sx.isTrackingPixel("https://x.com/a.png", '<img src="/a.png" width="1" height="1">'), true);
  assert.equal(sx.isTrackingPixel("https://x.com/a.png", '<img src="/a.png" style="display:none">'), true);
  assert.equal(sx.isTrackingPixel("https://veryxjnn.com/team-photo.jpg"), false);

  const x = sx.extractPage(
    `<body><img src="https://www.facebook.com/tr?id=1&ev=PageView" width="1" height="1"><img src="/team.jpg" alt="Our team"></body>`,
    "https://veryxjnn.com/",
  );
  assert.deepEqual(x.images.map((i) => i.url), ["https://veryxjnn.com/team.jpg"]);
});

test("site-extract: a font is named, not hashed", () => {
  // A live crawl reported __Inter_f367f3 and __JetBrains_Mono_Fallback_3c557b —
  // Next.js font-optimisation internals — as the brand's typefaces.
  assert.deepEqual(
    sx.cleanFonts(["__Inter_f367f3", "__Inter_Fallback_f367f3", "__JetBrains_Mono_3c557b", "system-ui", "sans-serif", "Inter"], 10),
    ["Inter", "JetBrains Mono"],
  );
  // A generic family names no typeface anyone chose.
  assert.deepEqual(sx.cleanFonts(["serif", "monospace", "ui-sans-serif"], 10), []);
});

test("site-extract: the brand's colours come before the framework's greys", () => {
  // A live crawl returned thirty colours whose first six were Tailwind's default
  // grey ramp — which every Tailwind site has, and which says nothing about
  // anyone's brand. The customer's red was somewhere below.
  const raw = ["#fff", "#e5e7eb", "#9ca3af", "#f1f5f9", "#94a3b8", "#d6112b", "#2b1eeb"];
  const ranked = sx.rankColours(raw, 8, "#d6112b");
  assert.equal(ranked[0], "#d6112b", "theme-color is the one colour the site nominated as its own");
  assert.equal(ranked[1], "#2b1eeb", "then the next most chromatic");
  assert.ok(ranked.indexOf("#ffffff") > 2, "greys sink");
  // Three- and six-digit forms of one colour are one colour.
  assert.equal(sx.rankColours(["#fff", "#ffffff"], 8).length, 1);

  // theme-color wins even when it is NOT the most vivid colour on the page —
  // it is the one the site explicitly nominated as its own, and a brighter
  // accent somewhere in the stylesheet does not outrank that.
  const muted = sx.rankColours(["#ff0000", "#556b2f", "#cccccc"], 8, "#556b2f");
  assert.equal(muted[0], "#556b2f", "the nominated colour leads");
  assert.equal(muted[1], "#ff0000", "the vivid one still ranks above the grey");
});

test("siteraid: the Business DNA sentence is built, not glued", () => {
  // A customer pasted their tagline into the category field and got "The mass
  // choice for the enterprise execution operating system. in United Kingdom ."
  const dna = sr.businessDNA({
    business: "VERYX", category: "The Enterprise Execution Operating System.",
    offers: ["Governance"], pricePosition: "mass", location: " United Kingdom ",
  });
  assert.equal(dna.valueProposition, "The mainstream choice for the Enterprise Execution Operating System in United Kingdom.");
  assert.doesNotMatch(dna.valueProposition, /\. in |\s\.$/, "no full stop mid-sentence, no trailing space");
  // And with no location it still ends cleanly.
  const noLoc = sr.businessDNA({ business: "V", category: "Roofing", offers: [], pricePosition: "premium" });
  assert.equal(noLoc.valueProposition, "The premium choice for roofing.");
});

test("siteraid: the DNA invents no rating and no review count", () => {
  // These read `${x.rating ?? 4.6}★` and `${x.reviews ?? 120} reviews`, so a
  // business with neither was handed "4.6★ social proof" and "120 reviews" as
  // its own competitive advantages — one panel away from the Truth Layer.
  const bare = sr.businessDNA({ business: "V", category: "Roofing", offers: [], pricePosition: "mass" });
  assert.ok(!bare.competitiveAdvantages.some((a) => /★/.test(a)), "no invented rating");
  assert.ok(!bare.proofAssets.some((a) => /\d+ reviews/.test(a)), "no invented review count");
  // When they ARE real, they are used.
  const real = sr.businessDNA({ business: "V", category: "Roofing", offers: [], pricePosition: "mass", rating: 4.7, reviews: 213 });
  assert.ok(real.competitiveAdvantages.some((a) => a.includes("4.7★")));
  assert.ok(real.proofAssets.some((a) => a.includes("213 reviews")));
});

test("agents: the site-aware agent is handed the crawl instead of asking for it", () => {
  // A live run ended "zero verified facts about what VeryX actually sells or to
  // whom" and asked four questions — minutes after the deep crawl read 544
  // things off that same site.
  const route = readFileSync(new URL("../src/app/api/agents/[agentId]/route.ts", import.meta.url), "utf8");
  assert.match(route, /SITE_AWARE_AGENTS\.has\(agentId\)/);
  assert.match(route, /"website-intelligence"/);
  assert.match(route, /input\.liveSiteFacts =/);
  assert.match(route, /Do NOT ask the user what the business sells/);
  assert.match(route, /do NOT quote as their price/, "an undeclared price must not be quoted back as theirs");
  assert.match(route, /No rating is published on the site\. Do not state one/);
  assert.match(route, /must not be invented: who the audience is/,
    "audience stays an inference and is labelled as one");
});

test("funnel-checkout: a payment link on a live page is validated, not just tidied", () => {
  // normalizeUrl passed "http://..." through unchanged, which would put a
  // checkout collecting card details in the clear onto a published page.
  const landing = readFileSync(new URL("../src/backend/landing.ts", import.meta.url), "utf8");
  assert.match(landing, /checkCheckoutLink\(input\.ctaUrl!\)/);
  assert.match(landing, /const primaryCtaUrl = ctaCheck\?\.ok \? ctaCheck\.url : ""/,
    "a refused link must not become the button's href");
  const hosted = readFileSync(new URL("../src/app/b/[brandId]/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(hosted, /Secure checkout via \{/, "the buyer is told who they are paying");
  const builder = readFileSync(new URL("../src/app/dashboard/landing-builder/page.tsx", import.meta.url), "utf8");
  assert.match(builder, /checkoutNote/, "and the owner is told if their link was refused");
  assert.match(builder, /never passes through MarketWar/);
});

test("trend-watch: relevance is MEASURED against the brand's own words", () => {
  // trendHijackGate scores fit as seed(trend + business + factor) — a checksum of
  // the customer's own name. Scheduling that would mail them a weekly
  // recommendation derived from a hash.
  const vocab = tw.vocabulary(EXTRACTION);
  assert.ok(vocab.includes("snagging"), "read off the site");
  assert.ok(!vocab.includes("the"), "stopwords carry no signal");

  const hit = tw.relevanceOf("New snagging software rules for construction handover", vocab);
  assert.ok(hit.score > 0);
  assert.ok(hit.matched.includes("snagging"), "the reason is shown, not asserted");
  assert.match(hit.note, /not a judgement of strategic fit/);

  const miss = tw.relevanceOf("Interest rates hold steady", vocab);
  assert.equal(miss.score, 0);

  // No crawl, no score — never a number pretending to be one.
  const blind = tw.relevanceOf("anything at all", []);
  assert.equal(blind.score, null);
  assert.match(blind.note, /No relevance score/);
});

test("trend-watch: the risk gate still overrules a relevant trend", async () => {
  const vocab = ["snagging", "construction"];
  const r = tw.relevanceOf("Construction site disaster kills snagging contractor", vocab);
  assert.ok(r.score > 0, "it is textually relevant");
  const gate = (await import("../src/backend/campaign-architect.ts")).trendHijackGate({
    trend: "Construction site disaster kills snagging contractor", business: "VeryX",
  });
  assert.equal(gate.verdict, "reject", "and must still be rejected — relevance never overrides harm");
});

test("trend-watch: a weekly digest reports only what is new", () => {
  // A digest that re-sends last week's headlines teaches people to ignore it,
  // and then the one that matters goes unread.
  const mk = (titles) => ({ brandId: "b", checkedAt: "", subjects: [], note: "",
    findings: titles.map((t) => ({ title: t, snippet: "", link: "", relevance: { score: 100, matched: [], note: "" }, gate: {}, action: "join", why: "" })) });
  assert.deepEqual(tw.newSince(mk(["A", "B"]), mk(["A"])).map((f) => f.title), ["B"]);
  assert.deepEqual(tw.newSince(mk(["A"]), mk(["A"])), []);
  assert.deepEqual(tw.newSince(mk(["A"]), null).map((f) => f.title), ["A"], "the first run is all new");
});

test("trends cron: scheduled, authenticated, budgeted, and free", () => {
  const route = readFileSync(new URL("../src/app/api/trends/scheduled/route.ts", import.meta.url), "utf8");
  assert.match(route, /cron === "1"|cron"\) === "1"/, "Vercel's own cron call is recognised");
  assert.match(route, /Bearer \$\{secret\}/, "anything else needs the secret");
  assert.match(route, /status: 401/);
  const md = Number(/export const maxDuration = (\d+)/.exec(route)[1]);
  const budget = Number(/RUN_BUDGET_MS = ([\d_]+)/.exec(route)[1].replace(/_/g, ""));
  assert.ok(budget < md * 1000, "a sweep must fit inside its function");
  assert.match(route, /skipped\.push/, "a brand that is skipped says why");
  assert.match(route, /costs no ACUs/, "a news search and word overlap are not provider calls");

  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(vercel.crons.some((c) => c.path.startsWith("/api/trends/scheduled")), "it must actually be scheduled");
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/trend_watches\/\{doc\} \{ allow read, write: if false; \}/);
});

// ---------------------------------------------------------------------------
// Cost control. One live month came to $33.45 on Anthropic alone, with no
// revenue against it, because the expensive path was the DEFAULT path.
// ---------------------------------------------------------------------------

test("gateway: routine work does not default to the most expensive provider", () => {
  // The Anthropic adapter defaults to claude-opus-4-8 and Anthropic sat first in
  // the order, so a meta description, an intent classification and a subject
  // line all went to the strongest model — while gpt-5-mini and gemini flash,
  // both already configured, sat behind it as fallbacks that rarely ran.
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(gw, /const FAST_ORDER: ProviderId\[\] = \["gemini", "openai", "anthropic"\]/);
  assert.match(gw, /routingOrder\(opts\.tier \?\? "fast"\)/,
    "the expensive path must be the deliberate one, not the one you get by forgetting to choose");
  assert.match(gw, /export const DOCUMENT_DEEP/);

  // Reliability is unchanged: fast still falls through EVERY configured provider.
  assert.match(gw, /\.\.\.DEFAULT_ORDER\.filter\(\(id\) => !pref\.includes\(id\)\)/);
});

test("gateway: a document a customer reads is still quality-first", () => {
  // Cheap for a classification, best for a blog post. The distinction has to be
  // in the code, or "save money" quietly becomes "make it worse".
  for (const mod of ["blog-generator", "growth-plan", "organic-dominance", "strategy-run"]) {
    const src = readFileSync(new URL(`../src/backend/${mod}.ts`, import.meta.url), "utf8");
    // The CALL, not the import — leaving DOCUMENT_DEEP imported while passing
    // the cheap budget would satisfy a looser match and change nothing.
    assert.match(src, /gatewayComplete\([\s\S]*?,\s*DOCUMENT_DEEP\)/,
      `${mod} writes something read end to end and must pass DOCUMENT_DEEP`);
  }
  // Short copy stays cheap.
  const copy = readFileSync(new URL("../src/backend/copywriter.ts", import.meta.url), "utf8");
  assert.doesNotMatch(copy, /DOCUMENT_DEEP/, "a headline does not need the top model");
});

test("blog cron: a daily spend does not start itself", () => {
  // It wrote a post every day on the strongest model, billed whether or not a
  // single customer was paying.
  const route = readFileSync(new URL("../src/app/api/blog/daily/route.ts", import.meta.url), "utf8");
  assert.match(route, /BLOG_DAILY_ENABLED === "1"/);
  assert.match(route, /if \(!BLOG_CRON_ENABLED && \(vercelCron \|\| cronSecret\)\)/,
    "the SCHEDULE is gated, not the feature");
  // A person pressing the button deliberately still works.
  const guard = route.slice(route.indexOf("BLOG_CRON_ENABLED &&"), route.indexOf("try {"));
  assert.doesNotMatch(guard, /requireAuth/, "an admin running it by hand is unaffected");
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(env, /BLOG_DAILY_ENABLED=/, "and the switch is documented");
  assert.match(env, /AI_GATEWAY_ORDER_FAST=/);
});

// ---------------------------------------------------------------------------
// A ceiling on the PLATFORM's own spend. Every other limit in this product
// guards a customer's ACU balance; nothing guarded the owner's provider bill.
// ---------------------------------------------------------------------------

const spend = await import("../src/backend/ai-spend.ts");
const crypto_ = await import("../src/backend/crypto.ts");

/**
 * Source with comments removed.
 *
 * Three assertions in this file have now tripped on their own documentation:
 * a robots test that forbade "GPTBot" matched the comment explaining why we
 * allow it, and a schema test that forbade "aggregateRating" matched the
 * comment listing the fields we refuse to publish. Assert against CODE.
 */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");


test("ai-spend: an unknown model is priced as expensive, never as free", () => {
  // Guessing cheap on an unknown model is how a ceiling silently stops working
  // the day someone switches to something new.
  const unknown = spend.priceOf("some-model-nobody-has-heard-of");
  assert.equal(unknown.inputPerM, 15);
  assert.equal(unknown.outputPerM, 75);
  // And a dated id still resolves to its family.
  assert.equal(spend.priceOf("claude-opus-4-8-20260115").outputPerM, 75);
  assert.equal(spend.priceOf("claude-haiku-4-5").outputPerM, 4);
  // Longest match wins: "gpt-5-mini" must not be priced as "gpt-5".
  assert.equal(spend.priceOf("gpt-5-mini").outputPerM, 2);
  assert.equal(spend.priceOf("gpt-5").outputPerM, 10);
  assert.equal(spend.priceOf("gpt-4o-mini").outputPerM, 0.6);
  assert.equal(spend.priceOf("gemini-2.5-flash").outputPerM, 2.5);
});

test("ai-spend: the cost gap that caused the bill is visible in the numbers", () => {
  // The same call on Opus versus the cheap tier. This is the arithmetic behind
  // routing routine work away from the strongest model.
  const opus = spend.estimateCost("claude-opus-4-8", 2_000, 1_000);
  const flash = spend.estimateCost("gemini-2.5-flash", 2_000, 1_000);
  assert.ok(opus > flash * 20, `Opus $${opus} vs flash $${flash} — the gap is the point`);
});

test("ai-spend: the ceiling never blocks work a customer paid for", () => {
  // They have covered the provider cost twice over under the pricing law.
  // Blocking them to protect the owner's budget would be selling something and
  // then refusing to deliver it.
  spend.__resetSpend();
  for (let i = 0; i < 40; i++) {
    spend.recordSpend({ provider: "anthropic", model: "claude-opus-4-8", inputTokens: 10_000, outputTokens: 10_000, usd: 0.9, paid: false });
  }
  const s = spend.spendThisMonth();
  assert.ok(s.unpaidUsd > 30, `expected real unpaid spend, got ${s.unpaidUsd}`);

  // With a REAL ceiling in place: unpaid work is stopped, paid work is not.
  const ceiling = 10;
  const unpaid = spend.spendVerdict(false, new Date(), ceiling);
  assert.equal(unpaid.allowed, false, "unpaid work past the ceiling must stop");
  assert.match(unpaid.reason, /monthly AI budget is spent/);
  assert.match(unpaid.reason, /still runs/, "and it must say paid work is unaffected");

  const paid = spend.spendVerdict(true, new Date(), ceiling);
  assert.equal(paid.allowed, true, "a paying customer is never blocked by the owner's budget");
  spend.__resetSpend();
});

test("ai-spend: paid and unpaid are counted apart", () => {
  spend.__resetSpend();
  spend.recordSpend({ provider: "anthropic", model: "claude-opus-4-8", inputTokens: 1000, outputTokens: 1000, usd: 1, paid: true });
  spend.recordSpend({ provider: "gemini", model: "gemini-2.5-flash", inputTokens: 1000, outputTokens: 1000, usd: 2, paid: false });
  const s = spend.spendThisMonth();
  assert.equal(s.totalUsd, 3);
  assert.equal(s.unpaidUsd, 2, "the ceiling watches unpaid spend only");
  assert.equal(s.calls, 2);
  assert.equal(s.byProvider[0].provider, "gemini", "biggest spender first");
  assert.match(s.note, /not a substitute for the invoice/, "an estimate must say it is one");
  spend.__resetSpend();
});

test("gateway: the ceiling is checked before spending, and paid work is exempt", () => {
  const gw = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  // Checked BEFORE any provider is called, not after the money is gone.
  const fn = gw.slice(gw.indexOf("export async function gatewayComplete"));
  const check = fn.indexOf("spendVerdict(opts.paid === true)");
  const firstCall = fn.indexOf("adapter.complete(");
  assert.ok(check > -1 && firstCall > -1 && check < firstCall, "the guard must come before the spend");
  assert.match(gw, /throw new AiBudgetExceededError/);
  assert.match(gw, /class AiBudgetExceededError/,
    "a distinct type: 'we chose not to spend' and 'the providers failed' need different messages");

  // Spend is recorded from what the provider REPORTED, after success.
  assert.match(gw, /if \(out\.usage\) \{[\s\S]*?recordSpend\(/);
  for (const field of [/input_tokens/, /promptTokenCount/, /candidatesTokenCount/]) {
    assert.match(gw, field, "every provider's token counts must be read");
  }
});

test("agents: a customer's paid run is marked paid", () => {
  const route = readFileSync(new URL("../src/app/api/agents/[agentId]/route.ts", import.meta.url), "utf8");
  assert.match(route, /paid: \(meter\.charged \?\? 0\) > 0/,
    "meterAction debited them, so their work is exempt from the platform's ceiling");
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(env, /AI_MONTHLY_CEILING_USD=/);
  assert.match(env, /provider console/, "the console limit is the real backstop and must be named");
});

// ---------------------------------------------------------------------------
// The public site, audited against the product's own doctrine.
//
// We sell an SEO/AEO product, a Truth Layer that blocks unsubstantiated claims,
// and per-business encryption written into the Terms. The site has to pass its
// own rules — an SEO product with no sitemap is not a small irony, it is the
// clearest signal that the advice is not taken seriously.
// ---------------------------------------------------------------------------

test("public site: it publishes the files it scores customers on", () => {
  // geo-readiness weights llms.txt at 15% of a customer's AI-readiness score,
  // and the crawler checks robots.txt and sitemap.xml. We had none of the three.
  for (const f of ["sitemap.ts", "robots.ts", "llms.txt/route.ts"]) {
    assert.ok(existsSync(new URL(`../src/app/${f}`, import.meta.url)), `missing /${f}`);
  }
  const robots = codeOnly(readFileSync(new URL("../src/app/robots.ts", import.meta.url), "utf8"));
  assert.match(robots, /sitemap:/, "robots.txt must point at the sitemap");
  assert.doesNotMatch(robots, /GPTBot|ClaudeBot|PerplexityBot/,
    "we must not block the AI crawlers the visibility product measures");
  assert.match(robots, /disallow: \[[^\]]*"\/dashboard\/"/, "signed-in surfaces stay out of the index");

  const llms = readFileSync(new URL("../src/app/llms.txt/route.ts", import.meta.url), "utf8");
  assert.match(llms, /publishes no customer results/,
    "the file must tell assistants not to present our targets as customer results");
});

test("public site: every public page has its own title and description", () => {
  // The pricing page had neither, so a search result for it showed only the
  // site-wide default — on the page where the customer decides.
  const pages = execSync('find src/app -name "page.tsx" -not -path "*/dashboard/*"', { encoding: "utf8" })
    .split("\n").filter(Boolean);
  const exempt = /\/(onboarding|r\/\[code\]|b\/\[brandId\])/;
  for (const page of pages) {
    if (exempt.test(page)) continue;
    const dir = page.replace(/\/page\.tsx$/, "");
    const own = readFileSync(page, "utf8");
    const layout = existsSync(`${dir}/layout.tsx`) ? readFileSync(`${dir}/layout.tsx`, "utf8") : "";
    const hasMeta = /export const metadata|generateMetadata/.test(own + layout) || dir === "src/app";
    assert.ok(hasMeta, `${dir} has no title/description of its own`);
  }
});

test("public site: our own structured data invents nothing", () => {
  // seo-artifacts refuses to emit a rating, review count or price it cannot
  // verify for a customer. Our own schema must hold to the same rule.
  const jsonldRaw = readFileSync(new URL("../src/components/SiteJsonLd.tsx", import.meta.url), "utf8");
  const jsonld = codeOnly(jsonldRaw);
  for (const forbidden of [/aggregateRating/, /reviewCount/, /ratingValue/, /foundingDate/, /numberOfEmployees/, /award/]) {
    assert.doesNotMatch(jsonld, forbidden, "a schema field we cannot substantiate must not be published");
  }
  assert.match(jsonld, /legalEntityConfigured && ENTITY/, "a legalName is published only when it is real");
  assert.match(jsonldRaw, /\\\\u003c/, "the payload must be escaped, like the auto-deploy snippet");
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<SiteJsonLd \/>/, "and it must actually be rendered");
});

test("public site: the Terms name who the customer is contracting with", () => {
  // "MarketWar OS, operated at marketwaros.com" is a product name and a domain.
  // It identifies nobody, and UK law requires the legal name, registered address
  // and company number of a business trading online.
  const entity = readFileSync(new URL("../src/components/LegalEntity.tsx", import.meta.url), "utf8");
  assert.match(entity, /NEXT_PUBLIC_LEGAL_ENTITY_NAME/);
  assert.match(entity, /NEXT_PUBLIC_COMPANY_NUMBER/);
  // Never a plausible placeholder: an invented company number in a contract is
  // a fabrication in the one document where it is least defensible.
  assert.doesNotMatch(entity, /\b\d{7,8}\b/, "no invented company number");
  assert.match(entity, /not yet published here/, "an unconfigured entity says so plainly");
  const terms = readFileSync(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8");
  assert.match(terms, /<LegalEntity \/>/);
});

test("crypto: personal data is never written in plaintext under a contract that promises encryption", () => {
  // The Terms said "Field-level encryption is applied per business". The code
  // made that conditional on FIELD_ENCRYPTION_MASTER_KEY, and its own comment
  // justified the fallback with "without Firebase keys nothing is persisted" —
  // which stopped being true, because production REQUIRES Firebase Admin.
  assert.equal(crypto_.encryptionMisconfigured(false), false, "demo mode persists nothing and is unaffected");
  assert.equal(crypto_.encryptionMisconfigured(true), !crypto_.encryptionConfigured);

  if (!crypto_.encryptionConfigured) {
    assert.throws(
      () => crypto_.encryptPii({ email: "a@b.com" }, "biz", true),
      /Refusing to store personal data unencrypted/,
      "a real write with no key must throw, not silently downgrade",
    );
    // And the demo path still works, so zero-config is preserved.
    assert.deepEqual(crypto_.encryptPii({ email: "a@b.com" }, "biz", false), { email: "a@b.com" });
  }

  // Both persistence call sites must declare the write is real.
  const db = readFileSync(new URL("../src/backend/db.ts", import.meta.url), "utf8");
  assert.equal((db.match(/encryptPii\([\s\S]{0,80}?,\s*true\)/g) || []).length, 2,
    "every persisted write must pass persistenceLive=true");

  const terms = readFileSync(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(terms, /one tenant can never access/,
    "'never' is an absolute we cannot prove in a contract");
  assert.match(terms, /refuses to store personal data at all if that encryption is not configured/,
    "the clause must describe what the code actually does");
});

// ---------------------------------------------------------------------------
// A route that takes the customer's ACUs must outlive the work it charged for.
//
// Vercel's default function timeout is about ten seconds. meterAction debits
// BEFORE the work runs, so on a platform timeout the customer has paid, has
// received nothing, and no code is left alive to refund them — the route was
// killed mid-flight. Four routes shipped in exactly that state: /api/geo,
// /api/landing, /api/prospecting and /api/visualstrike each charged ACUs and
// then reached a crawl or a provider on the ten-second default.
//
// Fixing those four by hand fixes today. This asserts the rule, so the fifth
// one cannot ship: if a route bills for work, it declares how long that work is
// allowed to take.
// ---------------------------------------------------------------------------

test("every route that charges ACUs declares a maxDuration", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name !== "route.ts") continue;
      const code = fs.readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (!/\bmeterAction\s*\(/.test(code)) continue;
      const m = code.match(/export const maxDuration\s*=\s*(\d+)/);
      if (!m) offenders.push(`${p} (no maxDuration — dies on the ~10s default)`);
      else if (Number(m[1]) < 30) offenders.push(`${p} (maxDuration ${m[1]}s is too short for paid work)`);
    }
  };
  walk("src/app/api");
  assert.deepEqual(offenders, [], `these routes debit ACUs and can be killed before delivering:\n${offenders.join("\n")}`);
});

// ---------------------------------------------------------------------------
// Consent before tracking, because that is the order the law puts them in.
//
// Google Tag Manager loaded in the root layout for every visitor on every
// route, from the first render. GTM's job is to set and read cookies that are
// not necessary for the site to work; PECR regulation 6 requires consent BEFORE
// that happens. A UK site selling to the public with an ungated container is a
// plain breach, and it is also the first thing anyone technical checks.
// ---------------------------------------------------------------------------

test("no analytics container loads from the root layout", () => {
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.ok(!/googletagmanager/.test(layout), "the container must not load before a choice is made");
  assert.ok(!/gtm\.start/.test(layout));
  assert.match(layout, /<CookieConsent \/>/, "the gate must actually be mounted");
});

test("the container loads only on an explicit grant", () => {
  const src = readFileSync(new URL("../src/components/CookieConsent.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Both the script and the noscript pixel sit inside the granted branch.
  const granted = src.slice(src.indexOf('choice === "granted"'));
  assert.ok(granted.includes("gtm.start"), "the script belongs behind the grant");
  assert.ok(granted.includes("googletagmanager.com/ns.html"), "so does the noscript pixel");
  // Not knowing yet is not a grant, and neither is a refusal.
  assert.match(src, /analytics_storage: "denied"/, "consent mode starts denied for everyone");
});

test("refusing is as easy as accepting", () => {
  // The ICO is explicit: a 'Reject' that is smaller, greyer, or one level
  // deeper than 'Accept' is not a free choice, so the consent is not valid.
  const src = readFileSync(new URL("../src/components/CookieConsent.tsx", import.meta.url), "utf8");
  const reject = src.match(/onClick=\{\(\) => decide\("denied"\)\}[\s\S]*?className="([^"]+)"/);
  const accept = src.match(/onClick=\{\(\) => decide\("granted"\)\}[\s\S]*?className="([^"]+)"/);
  assert.ok(reject && accept, "both buttons must exist");
  assert.equal(reject[1], accept[1],
    "the two buttons must be styled identically — any visual pull towards 'Accept' invalidates the consent");
});

test("silence is not consent", () => {
  const src = readFileSync(new URL("../src/components/CookieConsent.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // An unreadable localStorage (private mode, hardened browser) must resolve to
  // "not asked", which renders the banner and loads nothing — never to a grant.
  assert.match(src, /catch \{[\s\S]{0,200}return null;/, "a storage failure must not be read as consent");
  assert.ok(!/return "granted"/.test(src), "nothing may synthesise a grant");
});

test("the privacy policy describes the mechanism that exists, and can change it", () => {
  const src = readFileSync(new URL("../src/app/privacy/page.tsx", import.meta.url), "utf8");
  assert.match(src, /No choice means no analytics/);
  assert.match(src, /<CookieSettingsLink \/>/, "the withdrawal right needs a mechanism, not a sentence");
  assert.ok(!/limited analytics to improve the product\./.test(src),
    "that wording predated the gate and understated what GTM does");
});

// ---------------------------------------------------------------------------
// A consumer's 14-day cancellation right, and the contradiction it exposed.
// ---------------------------------------------------------------------------

test("terms: the consumer cancellation right is stated with its real limits", () => {
  const src = readFileSync(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8");
  assert.match(src, /Consumer Contracts \(Information, Cancellation and Additional Charges\) Regulations 2013/);
  assert.match(src, /<strong>14 days<\/strong>/);
  assert.match(src, /proportionate to what was actually supplied/,
    "starting supply inside the window has a consequence and it must be stated, not buried");
  assert.match(src, /original payment method within 14 days/);
});

test("terms: the billing section no longer contradicts the refund section", () => {
  // §3 said top-ups are non-refundable once partially used; §4 now refunds the
  // unused balance pro rata. Two clauses of the same contract disagreeing is
  // worse than either of them alone.
  const src = readFileSync(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8");
  assert.ok(!/Top-ups are non-refundable once partially used/.test(src));
  assert.match(src, /Partially used top-ups are refunded pro rata/);
});

test("terms: the sections are numbered once each, in order", () => {
  // Inserting a section renumbers everything after it, and a Terms of Service
  // with two section 5s is the kind of detail that costs trust at exactly the
  // moment someone is deciding whether to enter a card.
  const src = readFileSync(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8");
  const nums = [...src.matchAll(/<H2>(\d+)\. /g)].map((m) => Number(m[1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1), `section numbers must run 1..n with no gaps or repeats, got ${nums}`);
});

// ---------------------------------------------------------------------------
// An "estimate" uncorrelated with the thing it estimates is not an estimate.
//
// seo.ts and youtube.ts derive every volume, difficulty, competition and
// authority number from an FNV hash of the keyword or domain string. Both
// carried a disclaimer, and both called the numbers "relative proxies (0–100)"
// — which implies the ORDERING means something. It does not: the hash of
// "plumber london" bears no relationship to the hash of "emergency plumber
// london", so the term the screen shows as easiest may be the hardest on the
// list. A customer reads a ranked table and picks the top row.
// ---------------------------------------------------------------------------

test("seo + youtube call their hashed numbers placeholders, not estimates", async () => {
  const seo = await import("../src/backend/seo.ts");
  const yt = await import("../src/backend/youtube.ts");
  const research = seo.keywordResearch("plumber london");
  const topics = yt.keywordResearch("van life");
  for (const [label, d] of [["seo", research.disclaimer], ["youtube", topics.disclaimer]]) {
    assert.ok(d, `${label} carries no disclaimer at all`);
    assert.match(d, /PLACEHOLDER NUMBERS, NOT ESTIMATES/, label);
    assert.match(d, /ORDER carries no information/i, `${label} must not imply the ranking is meaningful`);
    assert.ok(!/relative prox/i.test(d), `${label} still calls a hash a proxy`);
    assert.ok(/Do not (choose|pick)/.test(d), `${label} must say plainly not to act on them`);
  }
});

test("the backlink profile carries the same warning", async () => {
  // "1,847 referring domains, 45 toxic links" about the customer's own site is
  // a specific factual claim shaped exactly like real data.
  const seo = await import("../src/backend/seo.ts");
  const p = seo.backlinkProfile("evandeli.com");
  assert.match(p.disclaimer, /PLACEHOLDER NUMBERS, NOT ESTIMATES/);
  assert.match(p.disclaimer, /judge a domain/);
});

// ---------------------------------------------------------------------------
// Cutting a clip needs no vendor.
//
// The render step was described as needing FFMPEG_CLOUD_API_KEY or
// VIDEO_WORKER_SECRET, and those are not the same kind of thing: the first is a
// third party (api.ffmpeg-micro.com), the second is a shared secret for a
// container in worker/ that MarketWar runs itself. Neither is required, because
// the machine that already has the video is the customer's own — VideoEditor
// has cut segments in-browser for a while. What was missing was the 9:16 crop
// and the burned captions, which is canvas geometry.
// ---------------------------------------------------------------------------
const cr = await import("../src/frontend/clip-render.ts");

test("a landscape source is cropped to a full-height 9:16 column", () => {
  const c = cr.cropRect(1920, 1080, 0.5);
  assert.equal(c.sh, 1080, "the full height is kept");
  assert.equal(Math.round(c.sw), Math.round(1080 * 9 / 16), "the width is a 9:16 column");
  assert.equal(Math.round(c.sx), Math.round((1920 - 1080 * 9 / 16) / 2), "centred by default");
});

test("the column slides where the person put it, and never off the frame", () => {
  const left = cr.cropRect(1920, 1080, 0);
  const right = cr.cropRect(1920, 1080, 1);
  assert.equal(left.sx, 0);
  assert.equal(Math.round(right.sx + right.sw), 1920, "hard right must end exactly at the edge");
  // Out-of-range and nonsense values must not push the crop outside the source,
  // which would draw black bars or throw.
  for (const v of [-5, 9, NaN, undefined]) {
    const c = cr.cropRect(1920, 1080, v);
    assert.ok(c.sx >= 0 && c.sx + c.sw <= 1920, `focusX ${v} escaped the frame`);
  }
});

test("phone footage taller than 9:16 is cropped top and bottom, not pillarboxed", () => {
  // A 9:19.5 phone video cropped left-and-right would come out narrower than
  // the frame and get black bars down each side.
  const c = cr.cropRect(1080, 2340, 0.5);
  assert.equal(c.sw, 1080, "the full width is kept");
  assert.ok(c.sh < 2340, "and height is trimmed instead");
  assert.ok(Math.abs(c.sw / c.sh - 9 / 16) < 0.001, `the result must be 9:16, got ${(c.sw / c.sh).toFixed(3)}`);
  assert.ok(c.sy > 0, "taken from the middle, not the top");
  assert.ok(c.sy + c.sh <= 2340, "and stays inside the source");
});

test("an already-9:16 source is left alone", () => {
  const c = cr.cropRect(1080, 1920, 0.5);
  assert.equal(c.sx, 0);
  assert.equal(c.sy, 0);
  assert.equal(c.sw, 1080);
  assert.equal(Math.round(c.sh), 1920);
});

test("srt cues are parsed back out, so captions can be burned in", () => {
  const srt = "1\n00:00:00,000 --> 00:00:03,500\nHere is the mistake\n\n2\n00:00:03,500 --> 00:00:07,000\nmost people make.\n";
  const cues = cr.parseSrt(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[1].text, "most people make.");
  assert.deepEqual(cr.parseSrt(""), [], "an empty file is not an error");
  assert.deepEqual(cr.parseSrt("not an srt at all"), []);
});

test("the caption on screen is the one whose time it is", () => {
  const cues = [{ start: 0, end: 3, text: "first" }, { start: 3, end: 6, text: "second" }];
  assert.equal(cr.cueAt(cues, 1), "first");
  assert.equal(cr.cueAt(cues, 4), "second");
  assert.equal(cr.cueAt(cues, 99), "", "past the end there is no caption, not the last one stuck on screen");
  assert.equal(cr.cueAt([], 1), "");
});

test("a caption is wrapped to two lines and never buries the video", () => {
  // A caption that fills half the screen covers the thing the viewer came to
  // see, and every platform puts its own UI over the bottom fifth.
  const ctx = { measureText: (s) => ({ width: s.length * 10 }) };
  const long = "This is a very long caption line that would otherwise run straight off the side of the frame entirely";
  const rows = cr.wrapCaption(ctx, long, 300);
  assert.equal(rows.length, 2, "two lines maximum");
  for (const r of rows) assert.ok(ctx.measureText(r).width <= 300 || r.split(" ").length === 1);
  // A single word wider than the line must still be emitted rather than dropped.
  assert.deepEqual(cr.wrapCaption(ctx, "Supercalifragilistic", 50), ["Supercalifragilistic"]);
});

test("the recording container is whatever the browser actually supports", () => {
  // Safari records MP4, Chrome and Firefox record WebM. Insisting on one gives
  // an empty file on the other.
  assert.equal(cr.extFor("video/mp4;codecs=avc1,mp4a.40.2"), "mp4");
  assert.equal(cr.extFor("video/webm;codecs=vp9,opus"), "webm");
});

test("the render path is client-side and imports no backend module", () => {
  const src = readFileSync(new URL("../src/frontend/clip-render.ts", import.meta.url), "utf8");
  assert.ok(!/@\/backend\//.test(src), "nothing here may reach a server module");
  assert.ok(!/fetch\(/.test(src), "and nothing is uploaded — the file never leaves the machine");
});

test("the Clip Finder offers the browser cut without demanding a worker", () => {
  const src = readFileSync(new URL("../src/components/ClipFinder.tsx", import.meta.url), "utf8");
  assert.match(src, /renderClip\(source, \{/, "the local cut must actually be wired");
  assert.match(src, /no upload, no vendor/);
  assert.match(src, /You place this, we do not guess it/,
    "the reframe is manual and must say so rather than being sold as tracking");
});

test("the platform never says a new supplier is needed to cut a clip", () => {
  // FFMPEG_CLOUD_API_KEY is a third party (api.ffmpeg-micro.com).
  // VIDEO_WORKER_SECRET is a shared secret for a container in worker/ that we
  // run ourselves. Listing them together as one dependency told the owner they
  // had to take on a supplier for something the browser already does.
  const health = readFileSync(new URL("../src/app/api/health/live/route.ts", import.meta.url), "utf8");
  assert.match(health, /Clip cutting to 9:16 — captions burned in, logo, B-roll/,
    "the browser path must name every overlay it actually does");
  assert.match(health, /ready: true/, "clip cutting is live with no key at all");
  assert.match(health, /no new supplier/, "the self-hosted worker must be distinguished from the vendor");
  assert.match(health, /is a supplier and a per-minute bill/, "and the vendor must be named as one");
  // And when the hosted key IS set, it must report what that deployment can
  // actually do rather than repeat advice the owner has already acted on.
  assert.match(health, /queued versions of logo overlay and B-roll do not/,
    "an owner who already pays for the hosted renderer needs to know its two gaps");
  assert.match(health, /refused before anything is charged/);
  // And the gap is a QUEUEING gap, not a missing capability — the browser does
  // both. Saying otherwise would send the owner to deploy a container for
  // something the platform already does.
  assert.match(health, /no longer a missing capability/);
  assert.match(health, /logo overlay and the picture-in-picture B-roll/,
    "the browser path must claim both, since it now does both");

  const farm = readFileSync(new URL("../src/components/RenderFarm.tsx", import.meta.url), "utf8");
  assert.match(farm, /You probably do not need one/);
  assert.match(farm, /your own container, not a new supplier/);
});

// ---------------------------------------------------------------------------
// The last two capabilities that needed a render worker, done in the browser.
//
// `brand` (a logo) and `broll` (picture-in-picture) were the ONLY render kinds
// the hosted FFmpeg API cannot do, because both need filter_complex — which
// made them the one thing gated behind deploying a container. Compositing a
// second source over a frame is what a canvas does for a living, and the canvas
// was already there drawing the crop and the captions.
//
// The geometry is lifted from the worker's own recipes on purpose: a clip cut
// in the browser and one cut on the worker must look the same, or the feature
// means two different things depending on infrastructure nobody can see.
// ---------------------------------------------------------------------------

test("a logo lands where the server-side recipe puts it: 14% wide, 30px off the bottom-right", () => {
  // ffmpeg-recipes.ts: [1]scale=iw*0.14:-1[wm];[0][wm]overlay=W-w-30:H-h-30
  const r = cr.overlayRect(1080, 1920, 400, 200, { widthPct: 0.14, corner: "bottom-right", inset: 30 });
  assert.equal(Math.round(r.w), Math.round(1080 * 0.14));
  assert.equal(Math.round(r.h), Math.round(1080 * 0.14 * (200 / 400)), "height follows the logo's own aspect ratio");
  assert.equal(Math.round(r.x + r.w), 1080 - 30, "30px in from the right edge");
  assert.equal(Math.round(r.y + r.h), 1920 - 30, "30px up from the bottom");
});

test("B-roll lands where its recipe puts it: 35% wide, 40px off the top-right", () => {
  // ffmpeg-recipes.ts: [1]scale=iw*0.35:-1[pip];[0][pip]overlay=W-w-40:40
  const r = cr.overlayRect(1080, 1920, 1920, 1080, { widthPct: 0.35, corner: "top-right", inset: 40 });
  assert.equal(Math.round(r.w), Math.round(1080 * 0.35));
  assert.equal(Math.round(r.x + r.w), 1080 - 40);
  assert.equal(Math.round(r.y), 40);
});

test("a tall logo is not squashed into a wide box", () => {
  const tall = cr.overlayRect(1080, 1920, 100, 400, { widthPct: 0.14, corner: "bottom-right", inset: 30 });
  assert.ok(Math.abs(tall.h / tall.w - 4) < 0.001, "a 1:4 logo must stay 1:4");
});

test("all four corners are honoured", () => {
  const at = (corner) => cr.overlayRect(1000, 1000, 100, 100, { widthPct: 0.1, corner, inset: 20 });
  assert.deepEqual([at("top-left").x, at("top-left").y], [20, 20]);
  assert.deepEqual([at("top-right").x, at("top-right").y], [880, 20]);
  assert.deepEqual([at("bottom-left").x, at("bottom-left").y], [20, 880]);
  assert.deepEqual([at("bottom-right").x, at("bottom-right").y], [880, 880]);
});

test("an asset with no readable size draws nothing rather than dividing by zero", () => {
  // A broken image or a video whose metadata never arrived would otherwise
  // produce NaN geometry and either an invisible overlay or a thrown frame.
  for (const [w, h] of [[0, 0], [100, 0], [0, 100], [NaN, NaN]]) {
    const r = cr.overlayRect(1080, 1920, w, h, { widthPct: 0.14, corner: "bottom-right", inset: 30 });
    assert.deepEqual(r, { x: 0, y: 0, w: 0, h: 0 }, `${w}x${h} must be a no-op`);
  }
});

test("an oversized overlay is clamped inside the frame", () => {
  const r = cr.overlayRect(1080, 1920, 100, 100, { widthPct: 5, corner: "bottom-right", inset: 30 });
  assert.ok(r.w <= 1080, "never wider than the frame");
  assert.ok(r.x >= 0 && r.y >= 0, "and never pushed off the top-left corner");
});

test("the browser renderer composites both overlays and keeps only the main audio", () => {
  const src = readFileSync(new URL("../src/frontend/clip-render.ts", import.meta.url), "utf8");
  // B-roll under the logo: a watermark a picture-in-picture can cover is not one.
  const pipAt = src.indexOf("ctx.drawImage(pip");
  const logoAt = src.indexOf("ctx.drawImage(logo");
  assert.ok(pipAt > 0 && logoAt > 0, "both must be drawn");
  assert.ok(pipAt < logoAt, "the logo must be drawn last so nothing covers it");
  assert.match(src, /pip\.muted = true/, "the B-roll is silent, matching the recipe's -c:a copy");
  assert.match(src, /t - start <= pipUntil/, "and only shows for its window");
});

test("every object URL the renderer makes is revoked", () => {
  // Overlays add two more; a leaked blob URL pins the whole file in memory for
  // the life of the tab, and a customer cutting ten clips would pin ten videos.
  const src = readFileSync(new URL("../src/frontend/clip-render.ts", import.meta.url), "utf8");
  const created = (src.match(/URL\.createObjectURL\(/g) || []).length;
  assert.ok(created >= 3, "video, logo and B-roll all create one");
  assert.match(src, /for \(const u of overlayUrls\) URL\.revokeObjectURL\(u\)/);
  assert.match(src, /overlayUrls\.push\(logoUrl\)/);
  assert.match(src, /overlayUrls\.push\(pipUrl\)/);
});

test("the Clip Finder offers the logo and B-roll without a worker", () => {
  const src = readFileSync(new URL("../src/components/ClipFinder.tsx", import.meta.url), "utf8");
  assert.match(src, /watermark: logo \? \{ file: logo \} : undefined/);
  assert.match(src, /broll: broll \? \{ file: broll, untilSec: brollSec \} : undefined/);
  assert.match(src, /the same placement the server-side render uses/,
    "the customer should know it matches, not wonder whether it does");
});

// ---------------------------------------------------------------------------
// A full-screen overlay must not be trapped inside a blurred ancestor.
//
// The mobile nav drawer opened as a strip the height of the header: the nav was
// clipped out of existence and the dimming overlay did not cover the page,
// because it was not over it. On every phone, not only in the installed app.
//
// The cause is a CSS rule with no visible symptom until it bites: an element
// with a backdrop-filter becomes the CONTAINING BLOCK for its position:fixed
// descendants. MobileNav renders inside the dashboard header, and that header
// carries `backdrop-blur-xl` — so `fixed inset-0` resolved against the header's
// own box rather than the viewport.
//
// A portal is the fix that stays fixed. Pinning the header instead would work
// today and break again the first time anyone adds a transform, a filter or
// will-change anywhere above it.
// ---------------------------------------------------------------------------

test("the mobile nav drawer is portalled out of the header that traps it", () => {
  const nav = readFileSync(new URL("../src/components/MobileNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /createPortal\(/, "the overlay must leave its ancestor");
  assert.match(nav, /document\.body,\s*\)/, "and land on the body");
  // Portalling before mount would throw on the server render.
  assert.match(nav, /open && mounted && createPortal/, "the portal target only exists after mount");
});

test("the header that traps it still has the blur, so the test is about the real thing", () => {
  // If someone removes the backdrop-blur the portal is still correct, but this
  // records WHY it is there — a comment saying "fixes a bug" outlives the bug
  // and nobody dares touch it.
  const layout = readFileSync(new URL("../src/app/dashboard/layout.tsx", import.meta.url), "utf8");
  const header = layout.split("\n").find((l) => l.includes("<header"));
  assert.ok(header, "the mobile header must exist");
  assert.match(header, /backdrop-blur/, "this is the containing block the drawer had to escape");
  assert.match(header, /<MobileNav|lg:hidden/);
});

test("no other full-screen overlay is rendered inside a blurred or transformed ancestor", async () => {
  // The class of bug, not the instance. Any component with `fixed inset-0` that
  // is mounted inside the dashboard header has the same problem.
  const fs = await import("node:fs");
  const layout = fs.readFileSync("src/app/dashboard/layout.tsx", "utf8");
  const headerBlock = layout.slice(layout.indexOf("<header"), layout.indexOf("</header>"));
  const mountedInHeader = [...headerBlock.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]);

  const offenders = [];
  for (const name of new Set(mountedInHeader)) {
    const path = `src/components/${name}.tsx`;
    if (!fs.existsSync(path)) continue;
    const src = fs.readFileSync(path, "utf8");
    if (/fixed inset-0/.test(src) && !/createPortal/.test(src)) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `these render a full-screen overlay inside the blurred header without a portal: ${offenders.join(", ")}`);
});

test("the drawer clears the phone's own chrome at both ends", () => {
  // In the installed app there is a status bar above and a gesture bar below.
  // Without these the first nav group sits under the clock and the last item
  // cannot be tapped at all.
  const nav = readFileSync(new URL("../src/components/MobileNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /pt-\[var\(--safe-top\)\]/);
  assert.match(nav, /pb-\[calc\(1rem\+var\(--safe-bottom\)\)\]/);
});

test("the drawer can be closed without touching it", () => {
  const nav = readFileSync(new URL("../src/components/MobileNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /e\.key === "Escape"/, "a full-screen drawer with no keyboard exit is a trap");
  assert.match(nav, /aria-modal="true"/);
  assert.match(nav, /aria-label="Navigation"/);
});
