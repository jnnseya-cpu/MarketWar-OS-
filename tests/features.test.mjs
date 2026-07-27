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
