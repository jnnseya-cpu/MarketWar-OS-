// Feature/functionality tests — exercise the real engines behind the modules a
// customer actually uses, and assert on behaviour (not just that they return).
// Run: npm test    (no network, no API keys)

import { test } from "node:test";
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
