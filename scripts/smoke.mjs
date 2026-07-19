// MarketWar OS smoke suite — exercises every page route, every agent and
// every API surface against a running server (default http://localhost:3000).
// Usage: npm run smoke  (server must be up: npm run build && npm run start)
// Exits non-zero on any failure; this is the stabilisation gate alongside
// `npm run typecheck` and `npm run build`.

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const PAGES = [
  "/",
  "/how-it-works",
  "/onboarding",
  "/login",
  "/signup",
  "/dashboard",
  "/dashboard/create",
  "/dashboard/briefing",
  "/dashboard/audit",
  "/dashboard/warfare",
  "/dashboard/war-room",
  "/dashboard/campaigns",
  "/dashboard/offers",
  "/dashboard/product-engine",
  "/dashboard/studio",
  "/dashboard/website-intel",
  "/dashboard/discover",
  "/dashboard/organic",
  "/dashboard/content",
  "/dashboard/video",
  "/dashboard/landing-pages",
  "/dashboard/whatsapp",
  "/dashboard/email",
  "/dashboard/customers",
  "/dashboard/segments",
  "/dashboard/recovery",
  "/dashboard/amplify",
  "/dashboard/roi",
  "/dashboard/revenue",
  "/dashboard/budget",
  "/dashboard/competitors",
  "/dashboard/reputation",
  "/dashboard/local",
  "/dashboard/billing",
  "/dashboard/settings",
  "/dashboard/admin",
];

let pass = 0;
let fail = 0;
const failures = [];

function ok(name) {
  pass += 1;
  console.log(`  ✓ ${name}`);
}
function bad(name, detail) {
  fail += 1;
  failures.push(`${name} — ${detail}`);
  console.error(`  ✗ ${name} — ${detail}`);
}

console.log(`Smoke suite against ${BASE}\n`);

console.log("Pages:");
for (const path of PAGES) {
  try {
    const res = await fetch(BASE + path);
    if (res.status === 200) ok(path);
    else bad(path, `HTTP ${res.status}`);
  } catch (e) {
    bad(path, e.message);
  }
}

console.log("\nSecurity headers:");
{
  const res = await fetch(BASE + "/");
  for (const h of ["strict-transport-security", "x-content-type-options", "x-frame-options"]) {
    if (res.headers.get(h)) ok(`header ${h}`);
    else bad(`header ${h}`, "missing");
  }
}

console.log("\nAgent APIs:");
const agentsRes = await fetch(BASE + "/api/agents/growth-strategist");
const agentIds = (await agentsRes.json()).agents?.map((a) => a.id) ?? [];
if (agentIds.length >= 33) ok(`agent registry lists ${agentIds.length} agents`);
else bad("agent registry", `only ${agentIds.length} agents listed`);

for (const id of agentIds) {
  try {
    const res = await fetch(`${BASE}/api/agents/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: "Brixton Grill House", location: "Brixton, London" }),
    });
    const body = await res.json();
    if (res.status === 200 && typeof body.output === "string" && body.output.length > 100) ok(`agent ${id}`);
    else bad(`agent ${id}`, `HTTP ${res.status}, output ${body.output?.length ?? 0} chars`);
  } catch (e) {
    bad(`agent ${id}`, e.message);
  }
}

console.log("\nEmail engine API:");
try {
  const res = await fetch(BASE + "/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "validate", emails: ["good@gmail.com", "bad@@x", "promo@mailinator.com", "info@corp.co.uk"] }),
  });
  const body = await res.json();
  if (res.status === 200 && body.sendableCount === 1 && body.filteredCount === 3) ok("POST /api/email validate (hygiene pipeline)");
  else bad("POST /api/email validate", `HTTP ${res.status}, sendable ${body.sendableCount}, filtered ${body.filteredCount}`);
} catch (e) {
  bad("POST /api/email validate", e.message);
}
try {
  const res = await fetch(BASE + "/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send", to: "smoke-test@gmail.com", subject: "Smoke", html: "<p>ok</p>" }),
  });
  const body = await res.json();
  if (res.status === 200 && body.ok) ok(`POST /api/email send (mode: ${body.mode})`);
  else bad("POST /api/email send", `HTTP ${res.status}`);
} catch (e) {
  bad("POST /api/email send", e.message);
}

console.log("\nAmplification engine API:");
try {
  const res = await fetch(BASE + "/api/amplify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "virality", seedAudience: 1000, shareRate: 0.2, invitesPerSharer: 4, inviteConversion: 0.3, cycles: 5 }),
  });
  const body = await res.json();
  if (res.status === 200 && typeof body.k === "number" && Array.isArray(body.perCycle)) ok(`POST /api/amplify virality (K=${body.k})`);
  else bad("POST /api/amplify virality", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/amplify virality", e.message); }
try {
  const res = await fetch(BASE + "/api/amplify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "retarget", subjects: [
      { id: "a", behaviour: "clicked_no_purchase", consentedChannels: ["whatsapp"], optedOut: false, touchesLast7d: 1, converted: false },
      { id: "b", behaviour: "abandoned_cart", consentedChannels: ["email"], optedOut: true, touchesLast7d: 0, converted: false },
      { id: "c", behaviour: "started_form", consentedChannels: ["sms"], optedOut: false, touchesLast7d: 5, converted: false },
    ] }),
  });
  const body = await res.json();
  if (res.status === 200 && body.willSend === 1 && body.stopped === 1 && body.held === 1) ok("POST /api/amplify retarget (consent + frequency governance)");
  else bad("POST /api/amplify retarget", `HTTP ${res.status}, send ${body.willSend}/stop ${body.stopped}/hold ${body.held}`);
} catch (e) { bad("POST /api/amplify retarget", e.message); }

console.log("\nStrike-phase GEO API:");
try {
  const res = await fetch(BASE + "/api/geo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "audit", business: "Brixton Grill House" }),
  });
  const body = await res.json();
  if (res.status === 200 && typeof body.overall === "number" && Array.isArray(body.fixes)) ok(`POST /api/geo audit (readiness ${body.overall}, tier ${body.tier})`);
  else bad("POST /api/geo audit", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/geo audit", e.message); }
try {
  const res = await fetch(BASE + "/api/geo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "citation", business: "Brixton Grill House", competitors: ["Flame Republic"] }),
  });
  const body = await res.json();
  if (res.status === 200 && typeof body.shareOfVoice === "number" && Array.isArray(body.engines)) ok(`POST /api/geo citation (SoV ${body.shareOfVoice}%)`);
  else bad("POST /api/geo citation", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/geo citation", e.message); }

console.log("\nCampaign Warfare engine API:");
try {
  const res = await fetch(BASE + "/api/warfare", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: "Restaurant takeaway & catering", audience: "Hungry locals within 3 miles", result: "Get WhatsApp orders", budget: 600, location: "Brixton, London", offer: "Friday platter — 40 only", autonomy: 2 }),
  });
  const body = await res.json();
  const s = body.campaignScore;
  if (res.status === 200 && s && typeof s.composite === "number" && s.dimensions?.length === 8 && body.payloads?.length === 12 && body.offers?.length >= 3) {
    ok(`POST /api/warfare designCampaign (score ${s.composite}, ${body.payloads.length} payloads, vertical ${body.vertical})`);
  } else bad("POST /api/warfare", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/warfare", e.message); }
try {
  const res = await fetch(BASE + "/api/warfare", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audience: "x" }),
  });
  if (res.status === 400) ok("POST /api/warfare rejects missing product");
  else bad("POST /api/warfare validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/warfare validation", e.message); }

console.log("\nAI Visual Creation Engine (image gateway):");
try {
  const res = await fetch(BASE + "/api/image", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "generate", business: "Brixton Grill House", headline: "Order direct", offerText: "20% off", cta: "Order now", quality: "standard", variants: 3, options: { useLogo: true, logoPosition: "top-left", useBrandColours: true, addCtaButton: true, addOfferText: true, platformFormat: "instagram" } }),
  });
  const body = await res.json();
  const v = body.variants?.[0];
  if (res.status === 200 && body.variants?.length === 3 && v?.imageUrl?.startsWith("data:image/svg+xml") && v?.brandSafe === true && v?.cost?.acus > 0) {
    ok(`POST /api/image generate (3 brand-safe variants, ${v.cost.acus} ACUs, ${v.cost.marginMultiplier}× margin)`);
  } else bad("POST /api/image generate", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/image generate", e.message); }
try {
  const res = await fetch(BASE + "/api/image", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "theme", business: "Brixton Grill House" }),
  });
  const body = await res.json();
  if (res.status === 200 && /^#/.test(body.primary) && /^#/.test(body.cta) && body.source) ok(`POST /api/image theme (6-colour brand theme, ${body.source})`);
  else bad("POST /api/image theme", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/image theme", e.message); }
try {
  const res = await fetch(BASE + "/api/image");
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.providers) && body.providers.length >= 8) ok(`GET /api/image (provider hierarchy: ${body.providers.length})`);
  else bad("GET /api/image", `HTTP ${res.status}`);
} catch (e) { bad("GET /api/image", e.message); }

console.log("\nAI Audience Segmentation Engine:");
try {
  const res = await fetch(BASE + "/api/segments", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business: "Brixton Grill House" }),
  });
  const body = await res.json();
  const hasPriority = Array.isArray(body.segments) && body.segments.every((s) => typeof s.campaignPriority === "number" && s.consentedSize <= s.size);
  if (res.status === 200 && body.segments.length >= 3 && hasPriority && body.consentedShare > 0) {
    ok(`POST /api/segments (${body.segments.length} segments, ${Math.round(body.consentedShare * 100)}% consented, top: ${body.segments[0].key})`);
  } else bad("POST /api/segments", `HTTP ${res.status}, segments ${body.segments?.length}`);
} catch (e) { bad("POST /api/segments", e.message); }

console.log("\nAI Marketing ROI Engine:");
try {
  const res = await fetch(BASE + "/api/roi", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "channels", business: "Brixton Grill House", objective: "get orders", budgetGbp: 600, avgOrderValueGbp: 40 }),
  });
  const body = await res.json();
  // Owned channels should be favoured; the cheapest customer + allocation present.
  if (res.status === 200 && Array.isArray(body.channels) && body.channels.length >= 10 && body.nextCheapestCustomer?.cacGbp > 0 && body.ownedShare >= 0.5) {
    ok(`POST /api/roi channels (cheapest ${body.nextCheapestCustomer.label} £${body.nextCheapestCustomer.cacGbp}, ${Math.round(body.ownedShare * 100)}% owned)`);
  } else bad("POST /api/roi channels", `HTTP ${res.status}, ownedShare ${body.ownedShare}`);
} catch (e) { bad("POST /api/roi channels", e.message); }
try {
  const res = await fetch(BASE + "/api/roi", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "readiness", hasOffer: true, offerStrength: 90, hasWebsite: true, hasCreatives: true, hasTargeting: false, hasTracking: false, hasFollowUp: true }),
  });
  const body = await res.json();
  // Missing tracking + targeting must block a clean launch.
  if (res.status === 200 && body.verdict !== "launch" && body.blockers.length > 0) ok(`POST /api/roi readiness (overall ${body.overall} → ${body.verdict}, ${body.blockers.length} blockers)`);
  else bad("POST /api/roi readiness", `verdict ${body.verdict}`);
} catch (e) { bad("POST /api/roi readiness", e.message); }

console.log("\nTrust, Reviews & Reputation Engine:");
try {
  const res = await fetch(BASE + "/api/reputation", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "trust", business: "Brixton Grill House" }),
  });
  const body = await res.json();
  if (res.status === 200 && typeof body.trustScore === "number" && body.averageRating > 0 && typeof body.aiVisibilityReadiness === "number") {
    ok(`POST /api/reputation trust (TrustScore ${body.trustScore}, ${body.averageRating}★, AI-vis ${body.aiVisibilityReadiness})`);
  } else bad("POST /api/reputation trust", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/reputation trust", e.message); }
try {
  const res = await fetch(BASE + "/api/reputation", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "respond", business: "Brixton Grill House", review: { id: "x", rating: 1, text: "I got food poisoning, this is dangerous", verified: true } }),
  });
  const body = await res.json();
  // Health/legal-risk language must escalate and flag legal risk.
  if (res.status === 200 && body.escalate === true && body.legalRisk === true) ok("POST /api/reputation respond (legal-risk escalated, no public liability)");
  else bad("POST /api/reputation respond", `escalate=${body.escalate} legalRisk=${body.legalRisk}`);
} catch (e) { bad("POST /api/reputation respond", e.message); }
try {
  const res = await fetch(BASE + "/api/reputation", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sentiment", business: "Brixton Grill House" }),
  });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.topicSentiment) && Array.isArray(body.operationalPlan)) ok(`POST /api/reputation sentiment (${body.topicSentiment.length} topics, happiness ${body.customerHappiness})`);
  else bad("POST /api/reputation sentiment", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/reputation sentiment", e.message); }

console.log("\nReal-Time Search & Opportunity Intelligence:");
try {
  const res = await fetch(BASE + "/api/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "opportunity", niche: "food delivery", location: "Brixton, London" }),
  });
  const body = await res.json();
  if (res.status === 200 && typeof body.opportunityScore === "number" && body.demandLevel && Array.isArray(body.launchStrategy)) {
    ok(`POST /api/search opportunity (score ${body.opportunityScore}, demand ${body.demandLevel})`);
  } else bad("POST /api/search opportunity", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/search opportunity", e.message); }
try {
  const res = await fetch(BASE + "/api/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "leads", category: "grill house", location: "Brixton, London" }),
  });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.leads) && body.leads.length > 0 && typeof body.leads[0].leadScore === "number") {
    ok(`POST /api/search leads (${body.leads.length} scored leads, mode ${body.mode})`);
  } else bad("POST /api/search leads", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/search leads", e.message); }
try {
  const res = await fetch(BASE + "/api/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "search", query: "food delivery brixton", type: "places" }),
  });
  const body = await res.json();
  if (res.status === 200 && body.type === "places" && Array.isArray(body.results)) ok(`POST /api/search (places, mode ${body.mode})`);
  else bad("POST /api/search", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/search", e.message); }

console.log("\nMake Anything intent router:");
try {
  const res = await fetch(BASE + "/api/intent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Make a TikTok video ad for my restaurant" }),
  });
  const body = await res.json();
  if (res.status === 200 && body.best?.id === "video" && body.best?.acuEstimate > 0 && Array.isArray(body.best?.essentialQuestions)) {
    ok(`POST /api/intent (routed to ${body.best.id}, ~${body.best.acuEstimate} ACUs)`);
  } else bad("POST /api/intent", `HTTP ${res.status}, routed ${body.best?.id}`);
} catch (e) { bad("POST /api/intent", e.message); }
try {
  const res = await fetch(BASE + "/api/intent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "design an instagram ad creative with my logo" }),
  });
  const body = await res.json();
  if (res.status === 200 && body.best?.id === "ad_creative") ok(`POST /api/intent (creative → ${body.best.route})`);
  else bad("POST /api/intent creative", `routed ${body.best?.id}`);
} catch (e) { bad("POST /api/intent creative", e.message); }

console.log("\nACU Economics Engine:");
try {
  const res = await fetch(BASE + "/api/acu", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "quote", providerCostGbp: 0.2, actionClass: "high", complexity: 1.5, marginMultiplier: 4 }),
  });
  const body = await res.json();
  // Margin must clear the 2x floor; provider cost must NOT be exposed.
  if (res.status === 200 && body.acus > 0 && body.marginMultiplier >= 2 && body.providerCostGbp === undefined) {
    ok(`POST /api/acu quote (${body.acus} ACUs, ${body.marginMultiplier}× margin, cost hidden)`);
  } else bad("POST /api/acu quote", `HTTP ${res.status}, exposed cost: ${body.providerCostGbp !== undefined}`);
} catch (e) { bad("POST /api/acu quote", e.message); }
try {
  const res = await fetch(BASE + "/api/acu", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "profit", expectedRevenueGbp: 0.1, expectedCostGbp: 0.2 }),
  });
  const body = await res.json();
  // Below-floor margin must NOT run.
  if (res.status === 200 && body.ok === false && body.action !== "run") ok(`POST /api/acu profit (loss blocked → ${body.action})`);
  else bad("POST /api/acu profit", `HTTP ${res.status}, ok=${body.ok}`);
} catch (e) { bad("POST /api/acu profit", e.message); }
try {
  const res = await fetch(BASE + "/api/acu", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "arbitrate", minQuality: 70, candidates: [{ id: "a", costGbp: 0.25, qualityScore: 80 }, { id: "b", costGbp: 0.12, qualityScore: 75 }, { id: "c", costGbp: 0.05, qualityScore: 60 }] }),
  });
  const body = await res.json();
  if (res.status === 200 && body.winner?.id === "b") ok("POST /api/acu arbitrate (cheapest capable = b)");
  else bad("POST /api/acu arbitrate", `winner ${body.winner?.id}`);
} catch (e) { bad("POST /api/acu arbitrate", e.message); }

console.log("\nAudit + gateway APIs:");
try {
  const res = await fetch(BASE + "/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business: "Brixton Grill House",
      industry: "Restaurant",
      location: "Brixton, London",
      monthlyBudget: "600",
      pastAdSpend: "2400",
      pastResult: "3 orders",
      goal: "40 weekly orders",
    }),
  });
  const body = await res.json();
  if (res.status === 200 && body.scores) ok("POST /api/audit");
  else bad("POST /api/audit", `HTTP ${res.status}`);
} catch (e) {
  bad("POST /api/audit", e.message);
}
try {
  const res = await fetch(BASE + "/api/gateway");
  const body = await res.json();
  if (res.status === 200 && body) ok(`GET /api/gateway (mode: ${body.mode ?? "demo"})`);
  else bad("GET /api/gateway", `HTTP ${res.status}`);
} catch (e) {
  bad("GET /api/gateway", e.message);
}

console.log(`\n${pass} passed, ${fail} failed${fail ? ":\n  " + failures.join("\n  ") : "."}`);
process.exit(fail ? 1 : 0);
