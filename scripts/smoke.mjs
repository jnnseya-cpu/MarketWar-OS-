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
  "/dashboard/engines",
  "/dashboard/create",
  "/dashboard/strategy",
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
  "/dashboard/prospecting",
  "/dashboard/organic",
  "/dashboard/content",
  "/dashboard/video",
  "/dashboard/landing-pages",
  "/dashboard/landing-builder",
  "/dashboard/whatsapp",
  "/dashboard/email",
  "/dashboard/customers",
  "/dashboard/segments",
  "/dashboard/recovery",
  "/dashboard/automation",
  "/dashboard/amplify",
  "/dashboard/roi",
  "/dashboard/revenue",
  "/dashboard/budget",
  "/dashboard/competitors",
  "/dashboard/reputation",
  "/dashboard/local",
  "/dashboard/billing",
  "/dashboard/integrations",
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
if (agentIds.length >= 39) ok(`agent registry lists ${agentIds.length} agents`);
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

console.log("\nIntegration Adapter Layer (independence):");
try {
  const res = await fetch(BASE + "/api/integrations");
  const body = await res.json();
  // Independence: works with 0 connected; every connector has a manual fallback.
  const allHaveFallback = body.integrations?.every((i) => Array.isArray(i.manualFallback) && i.manualFallback.length > 0);
  if (res.status === 200 && body.integrations.length >= 20 && allHaveFallback && body.dependencyClassification?.mustOwnInternally?.length > 0) {
    ok(`GET /api/integrations (${body.integrations.length} connectors, ${body.connectedCount} connected, all have manual fallback)`);
  } else bad("GET /api/integrations", `HTTP ${res.status}, fallbacks ${allHaveFallback}`);
} catch (e) { bad("GET /api/integrations", e.message); }
try {
  const res = await fetch(BASE + "/api/integrations", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "manual", provider: "whatsapp_cloud" }),
  });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.steps) && body.steps.some((s) => /wa\.me/i.test(s))) ok("POST /api/integrations manual (WhatsApp → wa.me fallback)");
  else bad("POST /api/integrations manual", `steps ${body.steps?.length}`);
} catch (e) { bad("POST /api/integrations manual", e.message); }

console.log("\n7-Agent Marketing Strategy Chain:");
try {
  const res = await fetch(BASE + "/api/strategy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "full", business: "Brixton Grill House", product: "takeaway", audience: "hungry locals within 3 miles", location: "Brixton", offer: "20% off first WhatsApp order", monthlyBudgetGbp: 600 }),
  });
  const body = await res.json();
  const chained = body.avatar?.scores && body.messaging?.mainBrandMessage && body.channels?.recommendedChannels?.length === 3 && body.funnel?.landingPageRequired === true && body.battlePlan?.thirtyDayActionPlan?.length === 4;
  if (res.status === 200 && chained) ok(`POST /api/strategy full (avatar→…→battle plan; ${body.channels.recommendedChannels.length} channels, landing required)`);
  else bad("POST /api/strategy full", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/strategy full", e.message); }
try {
  // Paid ads must be risk-gated: no tracking → not ready.
  const res = await fetch(BASE + "/api/strategy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "paidads", business: "Brixton Grill House" }),
  });
  const body = await res.json();
  if (res.status === 200 && body.ready === false && Array.isArray(body.fixFirst)) ok(`POST /api/strategy paidads (risk-gated → fix ${body.fixFirst.length} first)`);
  else bad("POST /api/strategy paidads", `ready ${body.ready}`);
} catch (e) { bad("POST /api/strategy paidads", e.message); }

console.log("\nAI Landing Page Creation Engine:");
try {
  const res = await fetch(BASE + "/api/landing", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business: "Brixton Grill House", objective: "get whatsapp orders", offer: "20% off first order, ends tonight", audience: "hungry locals within 3 miles", location: "Brixton", product: "takeaway", painPoint: "cold late delivery" }),
  });
  const body = await res.json();
  const scoreKeys = body.scores ? Object.keys(body.scores).length : 0;
  if (res.status === 200 && body.pageType === "whatsapp_conversion" && body.sections.length >= 7 && scoreKeys === 8 && body.abVariants.length === 4) {
    ok(`POST /api/landing (type ${body.pageType}, ${body.sections.length} sections, 8 scores, 4 A/B variants, conv ${body.scores.conversionScore})`);
  } else bad("POST /api/landing", `HTTP ${res.status}, type ${body.pageType}, scores ${scoreKeys}`);
} catch (e) { bad("POST /api/landing", e.message); }
try {
  const res = await fetch(BASE + "/api/landing", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business: "Ace Tutors", objective: "book appointments", product: "GCSE tuition" }),
  });
  const body = await res.json();
  // Booking objective → booking page + booking-specific form fields.
  if (res.status === 200 && body.pageType === "booking" && body.formConfig.fields.some((f) => f.key === "preferred_date")) ok(`POST /api/landing (booking → ${body.formConfig.submitAction} form)`);
  else bad("POST /api/landing booking", `type ${body.pageType}`);
} catch (e) { bad("POST /api/landing booking", e.message); }

console.log("\nNo-Code Revenue Automation Builder:");
try {
  // Load a template + validate: it must respect the frequency cap.
  const res = await fetch(BASE + "/api/automation", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "template", id: "abandoned_cart" }),
  });
  const body = await res.json();
  if (res.status === 200 && body.workflow?.steps?.length > 0 && body.validation?.valid === true && body.validation.touchesIn7d <= 5) {
    ok(`POST /api/automation template (${body.workflow.name}, ${body.validation.touchesIn7d} touches/7d, within cap)`);
  } else bad("POST /api/automation template", `HTTP ${res.status}, valid ${body.validation?.valid}`);
} catch (e) { bad("POST /api/automation template", e.message); }
try {
  // Non-consented contact → marketing steps must be skipped.
  const tpl = await (await fetch(BASE + "/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "template", id: "welcome" }) })).json();
  const res = await fetch(BASE + "/api/automation", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "simulate", workflow: tpl.workflow, consented: false }),
  });
  const body = await res.json();
  const anyBlocked = body.timeline?.some((e) => e.sent === false);
  if (res.status === 200 && anyBlocked) ok("POST /api/automation simulate (non-consented → marketing steps skipped)");
  else bad("POST /api/automation simulate", `no steps blocked for non-consented contact`);
} catch (e) { bad("POST /api/automation simulate", e.message); }

console.log("\nB2B Prospecting Engine (LeadWar Room):");
try {
  const res = await fetch(BASE + "/api/prospecting", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "search", product: "AI customer-acquisition OS", industry: "marketing services", dealSizeGbp: 8000 }),
  });
  const body = await res.json();
  const p = body.prospects?.[0];
  // Deal Probability present; personal emails flagged; prospects ranked.
  const flagged = body.prospects?.every((x) => x.emailType === "generic" || x.complianceFlags.includes("personal-email"));
  if (res.status === 200 && p?.dealScore?.dealProbability >= 0 && p.dealScore.expectedDealValueGbp >= 0 && flagged) {
    ok(`POST /api/prospecting search (top deal ${p.dealScore.dealProbability} ${p.dealScore.band}, ${body.prospects.length} prospects, compliance-flagged)`);
  } else bad("POST /api/prospecting search", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/prospecting search", e.message); }
try {
  const res = await fetch(BASE + "/api/prospecting", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "icp", product: "AI customer-acquisition OS", targetIndustry: "hospitality", dealSizeGbp: 20000 }),
  });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.bestJobTitles) && body.scoringFormula && body.exclusionRules.length > 0) ok(`POST /api/prospecting icp (${body.bestJobTitles.length} titles, ${body.exclusionRules.length} exclusions)`);
  else bad("POST /api/prospecting icp", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/prospecting icp", e.message); }

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
    body: JSON.stringify({ action: "quote", providerCostGbp: 1, actionClass: "low" }),
  });
  const body = await res.json();
  // Owner rule: £1 provider → £4 user (default 4× markup). Simplest class,
  // no complexity/demand → retail must be exactly £4, 400 ACUs, cost hidden.
  if (res.status === 200 && body.marginMultiplier === 4 && body.retailGbp === 4 && body.acus === 400 && body.providerCostGbp === undefined) {
    ok(`POST /api/acu quote (£1 provider → £${body.retailGbp} user = ${body.marginMultiplier}× = ${body.acus} ACUs, cost hidden)`);
  } else bad("POST /api/acu quote", `HTTP ${res.status}, retail £${body.retailGbp}, ${body.marginMultiplier}×, cost exposed: ${body.providerCostGbp !== undefined}`);
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

console.log("\nPlatform-Owner Economics Engine:");
try {
  const res = await fetch(BASE + "/api/admin-economics", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "dashboard" }),
  });
  const body = await res.json();
  // Owner dashboard must compute a positive margin and surface the watch-lists.
  if (res.status === 200 && body.totalRevenueGbp > 0 && body.totalProviderCostGbp > 0 && body.grossMarginPct > 0
      && Array.isArray(body.revenueByProvider) && Array.isArray(body.mostProfitableUsers) && Array.isArray(body.costLeakageAlerts)
      && body.forecastNextPeriod && typeof body.forecastNextPeriod.revenueGbp === "number") {
    ok(`POST /api/admin-economics dashboard (£${body.totalRevenueGbp} rev, ${body.grossMarginPct}% margin, ${body.taskCount} tasks, ${body.cacheHitRate}% cache)`);
  } else bad("POST /api/admin-economics dashboard", `HTTP ${res.status}, margin ${body.grossMarginPct}%`);
} catch (e) { bad("POST /api/admin-economics dashboard", e.message); }
try {
  const res = await fetch(BASE + "/api/admin-economics", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "recycling", generationCostGbp: 1, salePriceAcus: 200, unitsSold: 50 }),
  });
  const body = await res.json();
  // Generate once for £1, sell 50× at £2 each → £100 revenue, margin far beyond 400%.
  if (res.status === 200 && body.revenueGbp === 100 && body.effectiveMarginPct === 9900 && body.unitsSold === 50) {
    ok(`POST /api/admin-economics recycling (£1 → £${body.revenueGbp} over ${body.unitsSold} sales = ${body.effectiveMarginPct}% margin)`);
  } else bad("POST /api/admin-economics recycling", `rev £${body.revenueGbp}, margin ${body.effectiveMarginPct}%`);
} catch (e) { bad("POST /api/admin-economics recycling", e.message); }
try {
  const res = await fetch(BASE + "/api/admin-economics");
  const body = await res.json();
  // GET must expose owner doctrine + export charges, but never a raw provider cost field.
  if (res.status === 200 && body.ownerOnly === true && Array.isArray(body.exportCharges) && body.exportCharges.every((x) => x.acus > 0 && x.providerCostGbp === undefined) && Array.isArray(body.revenueLayers)) {
    ok(`GET /api/admin-economics (${body.revenueLayers.length} revenue layers, ${body.exportCharges.length} export charges, cost hidden)`);
  } else bad("GET /api/admin-economics", `HTTP ${res.status}`);
} catch (e) { bad("GET /api/admin-economics", e.message); }

console.log("\nLocal Marketplace Engine:");
try {
  const res = await fetch(BASE + "/api/local-marketplace", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "discover", filters: { category: "Plumber", city: "London", verifiedOnly: true } }),
  });
  const body = await res.json();
  // Ranked, verified-only, highest discoveryScore first, with badges.
  if (res.status === 200 && Array.isArray(body.hits) && body.hits.length >= 2
      && body.hits.every((h) => h.verified === true && typeof h.discoveryScore === "number")
      && body.hits[0].discoveryScore >= body.hits[1].discoveryScore && Array.isArray(body.hits[0].badges)) {
    ok(`POST /api/local-marketplace discover (${body.hits.length} verified plumbers, top ${body.hits[0].name} @ ${body.hits[0].discoveryScore})`);
  } else bad("POST /api/local-marketplace discover", `HTTP ${res.status}, hits ${body.hits?.length}`);
} catch (e) { bad("POST /api/local-marketplace discover", e.message); }
try {
  const res = await fetch(BASE + "/api/local-marketplace", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "quote", request: { category: "Plumber", city: "London", postcodePrefix: "SW9", budgetGbp: 150, urgency: "urgent" } }),
  });
  const body = await res.json();
  // Only quote-accepting providers, ranked by matchScore, with reasons + expiry.
  if (res.status === 200 && Array.isArray(body.matches) && body.matches.length >= 1
      && body.matches[0].matchScore >= (body.matches[1]?.matchScore ?? 0)
      && Array.isArray(body.matches[0].reasons) && body.matches[0].quoteExpiryHours === 12) {
    ok(`POST /api/local-marketplace quote (top match ${body.matches[0].name} @ ${body.matches[0].matchScore}, ${body.matches[0].quoteExpiryHours}h expiry)`);
  } else bad("POST /api/local-marketplace quote", `HTTP ${res.status}, matches ${body.matches?.length}`);
} catch (e) { bad("POST /api/local-marketplace quote", e.message); }
try {
  const res = await fetch(BASE + "/api/local-marketplace", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "book", request: { providerId: "p3", service: "Boiler service", partySize: 1 } }),
  });
  const body = await res.json();
  // Slots offered + deposit + no-show protection + reminder schedule.
  if (res.status === 200 && Array.isArray(body.slots) && body.slots.length >= 2 && body.slots[0].label
      && typeof body.depositGbp === "number" && body.depositGbp > 0 && Array.isArray(body.reminders) && body.reminders.length === 3) {
    ok(`POST /api/local-marketplace book (${body.slots.length} slots, £${body.depositGbp} deposit, no-show protected)`);
  } else bad("POST /api/local-marketplace book", `HTTP ${res.status}, slots ${body.slots?.length}`);
} catch (e) { bad("POST /api/local-marketplace book", e.message); }
try {
  const res = await fetch(BASE + "/api/local-marketplace", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "quote", request: { city: "London" } }),
  });
  if (res.status === 400) ok("POST /api/local-marketplace quote rejects missing category");
  else bad("POST /api/local-marketplace quote validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/local-marketplace quote validation", e.message); }

console.log("\nVisualStrike AI engine:");
try {
  const res = await fetch(BASE + "/api/visualstrike", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "lock", regulated: true, requestedMode: "lifestyle_placement" }),
  });
  const body = await res.json();
  // Regulated product → exact preservation forced, all 12 traits locked.
  if (res.status === 200 && body.mode === "exact" && body.enforcedExact === true && Array.isArray(body.lockedTraits) && body.lockedTraits.length === 12) {
    ok(`POST /api/visualstrike lock (regulated → exact preservation forced, ${body.lockedTraits.length} traits locked)`);
  } else bad("POST /api/visualstrike lock", `HTTP ${res.status}, mode ${body.mode}, enforced ${body.enforcedExact}`);
} catch (e) { bad("POST /api/visualstrike lock", e.message); }
try {
  const res = await fetch(BASE + "/api/visualstrike", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "score", concept: { product: "AuraGlow Serum", angle: "before_after", hasProof: true, trendAligned: true, clearProduct: true } }),
  });
  const body = await res.json();
  // 15 dimensions, separate viral vs commercial scores, improvements list.
  if (res.status === 200 && Array.isArray(body.dimensions) && body.dimensions.length === 15
      && typeof body.viralPotential === "number" && typeof body.commercialPotential === "number"
      && Array.isArray(body.improvements) && Array.isArray(body.topDrivers)) {
    ok(`POST /api/visualstrike score (viral ${body.viralPotential}, commercial ${body.commercialPotential}, 15 dims)`);
  } else bad("POST /api/visualstrike score", `HTTP ${res.status}, dims ${body.dimensions?.length}`);
} catch (e) { bad("POST /api/visualstrike score", e.message); }
try {
  const res = await fetch(BASE + "/api/visualstrike", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pack", concept: { product: "AuraGlow Serum", angle: "before_after" } }),
  });
  const body = await res.json();
  // One concept → 32 natively-adapted formats.
  if (res.status === 200 && body.count === 32 && Array.isArray(body.formats) && body.formats[0].note) {
    ok(`POST /api/visualstrike pack (1 concept → ${body.count} native formats)`);
  } else bad("POST /api/visualstrike pack", `HTTP ${res.status}, count ${body.count}`);
} catch (e) { bad("POST /api/visualstrike pack", e.message); }
try {
  const res = await fetch(BASE + "/api/visualstrike", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "hooks", product: { name: "you won't believe miracle cream" }, fulfilled: false }),
  });
  const body = await res.json();
  // Deceptive clickbait must be detected and blocked.
  if (res.status === 200 && Array.isArray(body.hooks) && body.blocked >= 1 && body.hooks.some((h) => h.deceptive === true)) {
    ok(`POST /api/visualstrike hooks (Hook Lab; ${body.blocked} deceptive clickbait blocked)`);
  } else bad("POST /api/visualstrike hooks", `HTTP ${res.status}, blocked ${body.blocked}`);
} catch (e) { bad("POST /api/visualstrike hooks", e.message); }
try {
  const res = await fetch(BASE + "/api/visualstrike", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "guard", fields: [
      { key: "cures acne", value: "cures acne in 3 days", confidence: 0.3, needsConfirmation: false, locked: false },
      { key: "colour", value: "amber glass bottle", confidence: 0.95, needsConfirmation: false, locked: true },
    ] }),
  });
  const body = await res.json();
  // Low-confidence claim flagged for confirmation, never asserted.
  if (res.status === 200 && Array.isArray(body.flagged) && body.flagged.length === 1 && body.flagged[0].needsConfirmation === true) {
    ok(`POST /api/visualstrike guard (honesty guard flagged ${body.flagged.length} unverifiable claim)`);
  } else bad("POST /api/visualstrike guard", `HTTP ${res.status}, flagged ${body.flagged?.length}`);
} catch (e) { bad("POST /api/visualstrike guard", e.message); }

console.log("\nSiteRaid AI engine:");
const DEMO_SITE = { business: "Brixton Grill House", category: "Restaurant", offers: ["Dine-in", "Table booking"], pricePosition: "mass", location: "Brixton, London", reviews: 213, rating: 4.7 };
try {
  const res = await fetch(BASE + "/api/siteraid", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "authorise", authorisation: "competitor_public" }),
  });
  const body = await res.json();
  // Competitor URL → allowed but public-analysis only (no republish).
  if (res.status === 200 && body.allowed === true && body.mode === "public_analysis_only") {
    ok("POST /api/siteraid authorise (competitor → public-analysis only)");
  } else bad("POST /api/siteraid authorise", `HTTP ${res.status}, mode ${body.mode}`);
} catch (e) { bad("POST /api/siteraid authorise", e.message); }
try {
  const res = await fetch(BASE + "/api/siteraid", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "authorise" }),
  });
  const body = await res.json();
  if (res.status === 200 && body.allowed === false && body.mode === "blocked") ok("POST /api/siteraid authorise blocks no-basis ingestion");
  else bad("POST /api/siteraid authorise no-basis", `allowed ${body.allowed}`);
} catch (e) { bad("POST /api/siteraid authorise no-basis", e.message); }
try {
  const res = await fetch(BASE + "/api/siteraid", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "truth", claims: [
      { text: "Rated 4.7 by 213 diners", source: "Google reviews" },
      { text: "The best grill in London", substantiated: false },
    ] }),
  });
  const body = await res.json();
  // Verified claim publishable; unsubstantiated superlative blocked as prohibited.
  const superlative = body.verdicts?.find((v) => v.text.includes("best grill"));
  if (res.status === 200 && body.publishable?.length === 1 && superlative?.classification === "prohibited" && superlative?.publishable === false) {
    ok(`POST /api/siteraid truth (verified published, superlative blocked as ${superlative.classification})`);
  } else bad("POST /api/siteraid truth", `HTTP ${res.status}, publishable ${body.publishable?.length}`);
} catch (e) { bad("POST /api/siteraid truth", e.message); }
try {
  const res = await fetch(BASE + "/api/siteraid", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "audit", site: DEMO_SITE }),
  });
  const body = await res.json();
  // 6 audit sections, each with 6 dimensions + a verdict + overall headline.
  if (res.status === 200 && Array.isArray(body.sections) && body.sections.length === 6
      && body.sections.every((s) => s.dimensions.length === 6 && ["strong","improve","urgent"].includes(s.verdict))
      && typeof body.overall === "number" && body.headline) {
    ok(`POST /api/siteraid audit (6 audits, overall ${body.overall}/100)`);
  } else bad("POST /api/siteraid audit", `HTTP ${res.status}, sections ${body.sections?.length}`);
} catch (e) { bad("POST /api/siteraid audit", e.message); }
try {
  const res = await fetch(BASE + "/api/siteraid", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "attack", site: DEMO_SITE }),
  });
  const body = await res.json();
  // 16 gap classes → 6 priority buckets, ranked by opportunity.
  if (res.status === 200 && Array.isArray(body.moves) && body.moves.length === 16
      && body.moves[0].opportunity >= body.moves[1].opportunity && body.byPriority
      && Object.keys(body.byPriority).length === 6) {
    ok(`POST /api/siteraid attack (16 gaps → 6 priorities, top ${body.moves[0].gap} @ ${body.moves[0].opportunity})`);
  } else bad("POST /api/siteraid attack", `HTTP ${res.status}, moves ${body.moves?.length}`);
} catch (e) { bad("POST /api/siteraid attack", e.message); }
try {
  const res = await fetch(BASE + "/api/siteraid", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "dna" }),
  });
  if (res.status === 400) ok("POST /api/siteraid dna rejects missing site");
  else bad("POST /api/siteraid dna validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/siteraid dna validation", e.message); }

console.log("\nLead Harvest compliance engine:");
try {
  const res = await fetch(BASE + "/api/lead-harvest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "classify", email: "j.smith@acme-legal.co.uk" }),
  });
  const body = await res.json();
  // Named mailbox → personal data, higher risk.
  if (res.status === 200 && body.contactType === "personal" && body.personalData === true && body.riskCategory === "higher") {
    ok("POST /api/lead-harvest classify (named mailbox → personal data)");
  } else bad("POST /api/lead-harvest classify", `HTTP ${res.status}, type ${body.contactType}`);
} catch (e) { bad("POST /api/lead-harvest classify", e.message); }
try {
  const res = await fetch(BASE + "/api/lead-harvest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", email: "bob@mailinator.com" }),
  });
  const body = await res.json();
  // Disposable domain → 12 checks, reject verdict.
  if (res.status === 200 && Array.isArray(body.checks) && body.checks.length === 12 && body.verdict === "reject") {
    ok(`POST /api/lead-harvest verify (disposable → ${body.verdict}, ${body.passedCount}/12 passed)`);
  } else bad("POST /api/lead-harvest verify", `HTTP ${res.status}, verdict ${body.verdict}, checks ${body.checks?.length}`);
} catch (e) { bad("POST /api/lead-harvest verify", e.message); }
try {
  // UK personal data with NO consent and NO LIA → cannot contact.
  const res = await fetch(BASE + "/api/lead-harvest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "compliance", record: { email: "jane.doe@ukfirm.co.uk", sourceUrl: "ukfirm.co.uk/team", country: "GB" } }),
  });
  const body = await res.json();
  if (res.status === 200 && body.region === "UK_EU" && body.personalData === true && body.lawfulBasis === "none" && body.canContact === false && body.liaRequired === true) {
    ok("POST /api/lead-harvest compliance (UK personal, no basis → cannot contact, LIA required)");
  } else bad("POST /api/lead-harvest compliance", `basis ${body.lawfulBasis}, canContact ${body.canContact}`);
} catch (e) { bad("POST /api/lead-harvest compliance", e.message); }
try {
  // Generic UK corporate mailbox → legitimate interest, can contact.
  const res = await fetch(BASE + "/api/lead-harvest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "compliance", record: { email: "info@ukfirm.co.uk", sourceUrl: "ukfirm.co.uk/contact", country: "GB" } }),
  });
  const body = await res.json();
  if (res.status === 200 && body.lawfulBasis === "legitimate_interest" && body.canContact === true) {
    ok("POST /api/lead-harvest compliance (UK generic corporate → legitimate interest)");
  } else bad("POST /api/lead-harvest compliance generic", `basis ${body.lawfulBasis}`);
} catch (e) { bad("POST /api/lead-harvest compliance generic", e.message); }
try {
  // Full gate: missing DKIM/DMARC must block the send.
  const res = await fetch(BASE + "/api/lead-harvest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "gate", record: { email: "info@ukfirm.co.uk", sourceUrl: "ukfirm.co.uk/contact", country: "GB" },
      campaign: { domainAuthenticated: true, spf: true, dkim: false, dmarc: false, unsubscribeLink: true, physicalAddress: true, suppressionChecked: true, bounceProbability: 0.05, dailyLimitRespected: true, spamRiskScore: 20, channel: "email" } }),
  });
  const body = await res.json();
  if (res.status === 200 && body.gate.cleared === false && body.gate.checks.length === 12 && body.gate.blockers.includes("dkim") && body.gate.blockers.includes("dmarc")) {
    ok(`POST /api/lead-harvest gate (missing DKIM/DMARC blocks send, ${body.gate.blockers.length} blockers)`);
  } else bad("POST /api/lead-harvest gate", `cleared ${body.gate?.cleared}, blockers ${body.gate?.blockers}`);
} catch (e) { bad("POST /api/lead-harvest gate", e.message); }
try {
  // Fully compliant send → gate clears.
  const res = await fetch(BASE + "/api/lead-harvest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "gate", record: { email: "sales@peaktech.com", sourceUrl: "peaktech.com/about", country: "US" },
      campaign: { domainAuthenticated: true, spf: true, dkim: true, dmarc: true, unsubscribeLink: true, physicalAddress: true, suppressionChecked: true, bounceProbability: 0.03, dailyLimitRespected: true, spamRiskScore: 18, channel: "email" } }),
  });
  const body = await res.json();
  if (res.status === 200 && body.gate.cleared === true && body.gate.blockers.length === 0) {
    ok("POST /api/lead-harvest gate (fully compliant US B2B → cleared)");
  } else bad("POST /api/lead-harvest gate clear", `cleared ${body.gate?.cleared}`);
} catch (e) { bad("POST /api/lead-harvest gate clear", e.message); }

console.log("\nCreative Optimizer engine:");
try {
  const res = await fetch(BASE + "/api/creative-optimizer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "matrix", variables: [
      { name: "hook", options: ["problem-first", "before-after", "unexpected-use"] },
      { name: "cta", options: ["Shop now", "See how it works"] },
      { name: "offer", options: ["10% off", "free trial", "bundle"] },
    ], cap: 8 }),
  });
  const body = await res.json();
  // Controlled matrix with a fixed baseline, capped.
  if (res.status === 200 && Array.isArray(body.variants) && body.variants.length <= 8 && body.variants.length >= 3 && body.baseline?.id === "v0") {
    ok(`POST /api/creative-optimizer matrix (${body.variants.length} controlled variants from baseline)`);
  } else bad("POST /api/creative-optimizer matrix", `HTTP ${res.status}, variants ${body.variants?.length}`);
} catch (e) { bad("POST /api/creative-optimizer matrix", e.message); }
try {
  const res = await fetch(BASE + "/api/creative-optimizer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "classify", result: { id: "x", views: 20000, clicks: 60, conversions: 1, spendGbp: 50, revenueGbp: 40, marginPct: 60, brandRisk: 10 } }),
  });
  const body = await res.json();
  // Big reach, near-zero intent → high_views_low_intent.
  if (res.status === 200 && body.classification === "high_views_low_intent") {
    ok(`POST /api/creative-optimizer classify (attention≠profit → ${body.classification})`);
  } else bad("POST /api/creative-optimizer classify", `HTTP ${res.status}, class ${body.classification}`);
} catch (e) { bad("POST /api/creative-optimizer classify", e.message); }
try {
  const res = await fetch(BASE + "/api/creative-optimizer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "optimise",
      variants: [ { id: "v0", values: { hook: "problem-first", cta: "Shop now" } }, { id: "v1", values: { hook: "before-after", cta: "Shop now" } } ],
      results: [
        { id: "v0", views: 5000, clicks: 300, conversions: 40, spendGbp: 30, revenueGbp: 1600, marginPct: 70, brandRisk: 12 },
        { id: "v1", views: 5000, clicks: 60, conversions: 1, spendGbp: 80, revenueGbp: 35, marginPct: 55, brandRisk: 10 },
      ] }),
  });
  const body = await res.json();
  // v0 wins; v1 is wasteful paid → killed; learnings + next variants produced.
  if (res.status === 200 && body.winners?.includes("v0") && body.killed?.includes("v1") && Array.isArray(body.nextVariants) && body.nextVariants.length >= 1 && Array.isArray(body.learnings)) {
    ok(`POST /api/creative-optimizer optimise (winner v0, killed v1, ${body.nextVariants.length} next variants)`);
  } else bad("POST /api/creative-optimizer optimise", `winners ${body.winners}, killed ${body.killed}`);
} catch (e) { bad("POST /api/creative-optimizer optimise", e.message); }
try {
  const res = await fetch(BASE + "/api/creative-optimizer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "matrix", variables: [] }),
  });
  if (res.status === 400) ok("POST /api/creative-optimizer matrix rejects empty variables");
  else bad("POST /api/creative-optimizer matrix validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/creative-optimizer matrix validation", e.message); }

console.log("\nCustomer Engagement Engine (Brevo-class CDP):");
try {
  const res = await fetch(BASE + "/api/engagement", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "segment" }),
  });
  const body = await res.json();
  const shaped = Array.isArray(body.segments) && body.segments.every((s) => typeof s.size === "number" && Array.isArray(s.contactIds) && s.contactIds.length === s.size);
  if (res.status === 200 && body.segments.length >= 5 && shaped && body.total > 0) {
    ok(`POST /api/engagement segment (${body.segments.length} segments over ${body.total} contacts, top: ${body.segments[0].segment})`);
  } else bad("POST /api/engagement segment", `HTTP ${res.status}, segments ${body.segments?.length}`);
} catch (e) { bad("POST /api/engagement segment", e.message); }
try {
  const res = await fetch(BASE + "/api/engagement", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "analytics" }),
  });
  const body = await res.json();
  const m = body.metrics || {};
  if (res.status === 200 && typeof m.openRate === "number" && typeof m.clickToOpenRate === "number" && typeof m.roi === "string" && m.bestSubject && m.bestSendTime) {
    ok(`POST /api/engagement analytics (open ${m.openRate}%, CTOR ${m.clickToOpenRate}%, roi ${m.roi})`);
  } else bad("POST /api/engagement analytics", `HTTP ${res.status}, openRate ${m.openRate}`);
} catch (e) { bad("POST /api/engagement analytics", e.message); }
try {
  const res = await fetch(BASE + "/api/engagement", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "suggest-reply", message: "Please unsubscribe me, not interested." }),
  });
  const body = await res.json();
  if (res.status === 200 && body.intent === "unsubscribe" && body.isDraft === true && typeof body.draftReply === "string") {
    ok(`POST /api/engagement suggest-reply (intent ${body.intent}, draft-only)`);
  } else bad("POST /api/engagement suggest-reply", `HTTP ${res.status}, intent ${body.intent}`);
} catch (e) { bad("POST /api/engagement suggest-reply", e.message); }
try {
  const res = await fetch(BASE + "/api/engagement", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "eligible", contact: { consentStatus: "opted_out", touchesLast7Days: 0 } }),
  });
  const body = await res.json();
  if (res.status === 200 && body.canSend === false && /opted out/i.test(body.reason)) {
    ok(`POST /api/engagement eligible (opted_out blocked: ${body.reason})`);
  } else bad("POST /api/engagement eligible", `HTTP ${res.status}, canSend ${body.canSend}`);
} catch (e) { bad("POST /api/engagement eligible", e.message); }
try {
  const res = await fetch(BASE + "/api/engagement", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "suggest-reply" }),
  });
  if (res.status === 400) ok("POST /api/engagement suggest-reply (missing message → 400)");
  else bad("POST /api/engagement suggest-reply validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/engagement suggest-reply validation", e.message); }

console.log("\nClassic-SEO intelligence API:");
try {
  const res = await fetch(`${BASE}/api/seo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "keywords", seedKeyword: "coffee shop", opts: { market: "kinshasa", limit: 5 } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.ideas) && Array.isArray(body.buyerIntent) && typeof body.disclaimer === "string" && body.ideas.every((k) => typeof k.opportunityScore === "number")) ok(`POST /api/seo keywords (${body.ideas.length} ideas, ${body.buyerIntent.length} buyer-intent)`);
  else bad("POST /api/seo keywords", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/seo keywords", e.message); }
try {
  const res = await fetch(`${BASE}/api/seo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "serp", keyword: "best coffee shop", domain: "example.com" }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.position === "number" && Array.isArray(body.features) && Array.isArray(body.competitorsAbove) && ["up", "down", "flat"].includes(body.trend)) ok(`POST /api/seo serp (pos ${body.position}, trend ${body.trend})`);
  else bad("POST /api/seo serp", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/seo serp", e.message); }
try {
  const res = await fetch(`${BASE}/api/seo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "backlinks", domain: "example.com" }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.referringDomains === "number" && typeof body.domainAuthorityProxy === "number" && Array.isArray(body.anchorTextTop) && Array.isArray(body.gapVsCompetitor)) ok(`POST /api/seo backlinks (DA proxy ${body.domainAuthorityProxy}, ${body.referringDomains} ref domains)`);
  else bad("POST /api/seo backlinks", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/seo backlinks", e.message); }
try {
  const res = await fetch(`${BASE}/api/seo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "audit", url: "https://example.com/page" }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.score === "number" && Array.isArray(body.issues) && body.issues.every((i) => ["low", "medium", "high"].includes(i.severity))) ok(`POST /api/seo audit (score ${body.score}, ${body.issues.length} issues)`);
  else bad("POST /api/seo audit", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/seo audit", e.message); }
try {
  const res = await fetch(`${BASE}/api/seo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "keywords" }) });
  if (res.status === 400) ok("POST /api/seo rejects missing seedKeyword (400)");
  else bad("POST /api/seo missing seedKeyword", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/seo missing seedKeyword", e.message); }

console.log("\nAI Local Concierge:");
try {
  const res = await fetch(BASE + "/api/concierge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ask", text: "Find me a plumber in SW9 tomorrow under £150" }) });
  const j = await res.json();
  if (res.status === 200 && j.understood && j.understood.category === "Plumber" && Array.isArray(j.bestMatches) && j.bestMatches.length > 0) ok("concierge ask — plumber SW9 parsed + matched");
  else bad("concierge ask plumber", `HTTP ${res.status} ${JSON.stringify(j).slice(0, 160)}`);
} catch (e) { bad("concierge ask plumber", e.message); }
try {
  const res = await fetch(BASE + "/api/concierge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ask", text: "find me something nice around here" }) });
  const j = await res.json();
  if (res.status === 200 && typeof j.clarify === "string" && j.clarify.length > 0) ok("concierge ask — ambiguous query returns clarify question");
  else bad("concierge ask ambiguous", `HTTP ${res.status} ${JSON.stringify(j).slice(0, 160)}`);
} catch (e) { bad("concierge ask ambiguous", e.message); }
try {
  const res = await fetch(BASE + "/api/concierge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ask" }) });
  if (res.status === 400) ok("concierge ask — missing text rejected (400)");
  else bad("concierge ask validation", `expected 400, got HTTP ${res.status}`);
} catch (e) { bad("concierge ask validation", e.message); }

console.log("\nProgrammatic SEO Builder:");
try {
  const res = await fetch(BASE + "/api/programmatic-seo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "batch", brand: "Coldwater Plumbing", type: "best_x_in_y",
      services: ["emergency plumber", "boiler repair"], locations: ["Brixton", "Clapham", "Streatham"], cap: 20 }),
  });
  const body = await res.json();
  // service × location grid → unique pages, each with title/meta/slug/JSON-LD.
  const uniqueSlugs = Array.isArray(body.pages) && new Set(body.pages.map((p) => p.slug)).size === body.pages.length;
  if (res.status === 200 && body.generated === 6 && uniqueSlugs && body.pages.every((p) => p.title && p.metaDescription && p.structuredData)) {
    ok(`POST /api/programmatic-seo batch (${body.generated} unique pages, ${body.duplicatesAvoided} dupes avoided)`);
  } else bad("POST /api/programmatic-seo batch", `HTTP ${res.status}, generated ${body.generated}`);
} catch (e) { bad("POST /api/programmatic-seo batch", e.message); }
try {
  const res = await fetch(BASE + "/api/programmatic-seo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "page", type: "location", fields: { brand: "Halo Hair", service: "hair salon", location: "Brixton" } }),
  });
  const body = await res.json();
  if (res.status === 200 && body.slug === "hair-salon-in-brixton" && body.structuredData["@type"] === "LocalBusiness" && body.title.includes("Halo Hair")) {
    ok(`POST /api/programmatic-seo page (slug "${body.slug}", LocalBusiness schema)`);
  } else bad("POST /api/programmatic-seo page", `HTTP ${res.status}, slug ${body.slug}`);
} catch (e) { bad("POST /api/programmatic-seo page", e.message); }
try {
  const res = await fetch(BASE + "/api/programmatic-seo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "batch", brand: "X", type: "invalid_type" }),
  });
  if (res.status === 400) ok("POST /api/programmatic-seo rejects invalid page type");
  else bad("POST /api/programmatic-seo validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/programmatic-seo validation", e.message); }

console.log("\nBuying Intent Radar:");
try {
  const res = await fetch(BASE + "/api/intent-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", input: { company: "PeakTech", signals: ["Series B funding round closed", "hiring 12 engineers"], sector: "SaaS" } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.subScores) && body.subScores.length === 10 && typeof body.intentScore === "number" && ["cold", "warm", "hot"].includes(body.level) && typeof body.whyNow === "string" && body.recommendedOfferAngle) {
    ok(`POST /api/intent-radar score (${body.company} intent ${body.intentScore} → ${body.level})`);
  } else bad("POST /api/intent-radar score", `HTTP ${res.status}, subScores ${body.subScores?.length}`);
} catch (e) { bad("POST /api/intent-radar score", e.message); }
try {
  const res = await fetch(BASE + "/api/intent-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "radar", companies: [ { company: "HotCo", signals: ["funding round", "expansion into EU", "new CTO hire"] }, { company: "ColdCo" } ] }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.results) && body.results.length === 2 && body.results[0].intentScore >= body.results[1].intentScore) {
    ok(`POST /api/intent-radar radar (sorted, hottest ${body.results[0].company} @ ${body.results[0].intentScore})`);
  } else bad("POST /api/intent-radar radar", `HTTP ${res.status}, results ${body.results?.length}`);
} catch (e) { bad("POST /api/intent-radar radar", e.message); }
try {
  const res = await fetch(BASE + "/api/intent-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", input: { company: "" } }) });
  if (res.status === 400) ok("POST /api/intent-radar rejects empty company");
  else bad("POST /api/intent-radar validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/intent-radar validation", e.message); }

console.log("\nGlobal Localisation Engine:");
try {
  const res = await fetch(BASE + "/api/localisation");
  const j = await res.json();
  if (Array.isArray(j.axes) && j.axes.length === 17 && j.axes[0] === "country" && j.axes[16] === "purchasing_power") ok("GET /api/localisation returns the 17 axes");
  else bad("GET /api/localisation axes", `got ${Array.isArray(j.axes) ? j.axes.length : typeof j.axes}`);
} catch (e) { bad("GET /api/localisation axes", String(e)); }
try {
  const res = await fetch(BASE + "/api/localisation");
  const j = await res.json();
  if (j.demo && j.demo.target && j.demo.target.language === "French" && typeof j.demo.currencyDisplay === "string") ok("GET demo localises a non-English market");
  else bad("GET demo", `target=${j.demo && j.demo.target && j.demo.target.language}`);
} catch (e) { bad("GET demo", String(e)); }
try {
  const res = await fetch(BASE + "/api/localisation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "localise", input: { headline: "Win more customers", body: "All-in-one growth platform.", priceGbp: 100, target: { country: "AE" } } }) });
  const j = await res.json();
  if (Array.isArray(j.transcreationNotes) && j.transcreationNotes.length > 0 && j.currencyDisplay.indexOf("AED") !== -1 && Array.isArray(j.recommendedPlatforms)) ok("POST localise transcreates + converts currency for AE");
  else bad("POST localise AE", `currencyDisplay=${j.currencyDisplay}`);
} catch (e) { bad("POST localise AE", String(e)); }
try {
  const res = await fetch(BASE + "/api/localisation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "localise", input: { headline: "Hi", body: "There", target: { country: "NG" } } }) });
  const j = await res.json();
  if (typeof j.disclaimer === "string" && j.disclaimer.indexOf("ESTIMATE") !== -1 && Array.isArray(j.legalFlags) && j.legalFlags.length > 0) ok("POST localise flags legal + honesty disclaimer for NG");
  else bad("POST localise NG flags", `legalFlags=${JSON.stringify(j.legalFlags)}`);
} catch (e) { bad("POST localise NG flags", String(e)); }
try {
  const res = await fetch(BASE + "/api/localisation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "localise", input: { headline: "Missing country", body: "No target country here", target: {} } }) });
  if (res.status === 400) ok("POST localise rejects missing target.country with 400");
  else bad("POST localise validation", `HTTP ${res.status}`);
} catch (e) { bad("POST localise validation", String(e)); }

console.log("\nUnified Inbox + CRM Pipeline (/api/inbox):");
try {
  const res = await fetch(`${BASE}/api/inbox`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inbox" }) });
  const body = await res.json();
  if (res.status === 200 && body.threadCount === 7 && body.breachedCount === 2 && body.openCount === 6) ok(`POST /api/inbox inbox (${body.breachedCount} SLA-breached of ${body.threadCount})`);
  else bad("POST /api/inbox inbox", `HTTP ${res.status}, threads ${body.threadCount}/breached ${body.breachedCount}/open ${body.openCount}`);
} catch (e) { bad("POST /api/inbox inbox", e.message); }
try {
  const res = await fetch(`${BASE}/api/inbox`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inbox" }) });
  const body = await res.json();
  const top = Array.isArray(body.threads) ? body.threads[0] : {};
  if (res.status === 200 && top.priority === "high" && top.slaBreached === true && typeof top.suggestedReply === "string" && top.suggestedReply.startsWith("DRAFT")) ok("POST /api/inbox reply is a DRAFT, top thread prioritised");
  else bad("POST /api/inbox draft", `HTTP ${res.status}, priority ${top.priority}, reply ${String(top.suggestedReply).slice(0, 12)}`);
} catch (e) { bad("POST /api/inbox draft", e.message); }
try {
  const res = await fetch(`${BASE}/api/inbox`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pipeline" }) });
  const body = await res.json();
  if (res.status === 200 && body.totalValueGbp === 35500 && body.weightedForecastGbp === 19005 && body.wonValueGbp === 4700 && Array.isArray(body.byStage)) ok(`POST /api/inbox pipeline (forecast £${body.weightedForecastGbp} ESTIMATE)`);
  else bad("POST /api/inbox pipeline", `HTTP ${res.status}, total ${body.totalValueGbp}/forecast ${body.weightedForecastGbp}`);
} catch (e) { bad("POST /api/inbox pipeline", e.message); }
try {
  const res = await fetch(`${BASE}/api/inbox`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inbox", slaMinutes: -5 }) });
  if (res.status === 400) ok("POST /api/inbox rejects invalid slaMinutes (400)");
  else bad("POST /api/inbox validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/inbox validation", e.message); }

console.log("\nCampaign Architect + Trend Hijack + Autonomy:");
try {
  const res = await fetch(BASE + "/api/campaign-architect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "architecture", business: "Brixton Grill House", objective: "sales", budgetGbp: 2000 }) });
  const body = await res.json();
  const layers = body.layers || [];
  const conv = layers.find((l) => l.layer === "conversion");
  if (res.status === 200 && layers.length === 5 && conv && conv.budgetShare >= (layers.find((l) => l.layer === "advocacy")?.budgetShare ?? 0) && conv.kpi) {
    ok(`POST /api/campaign-architect architecture (5 layers, conversion ${conv.budgetShare}% of budget)`);
  } else bad("POST /api/campaign-architect architecture", `HTTP ${res.status}, layers ${layers.length}`);
} catch (e) { bad("POST /api/campaign-architect architecture", e.message); }
try {
  const res = await fetch(BASE + "/api/campaign-architect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trend", trend: "capitalising on a local disaster", category: "news_themes", business: "X" }) });
  const body = await res.json();
  if (res.status === 200 && body.verdict === "reject" && Array.isArray(body.risk)) {
    ok(`POST /api/campaign-architect trend (harmful trend → ${body.verdict})`);
  } else bad("POST /api/campaign-architect trend", `HTTP ${res.status}, verdict ${body.verdict}`);
} catch (e) { bad("POST /api/campaign-architect trend", e.message); }
try {
  const res = await fetch(BASE + "/api/campaign-architect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "autonomy", riskCategory: "health", requestedLevel: 4 }) });
  const body = await res.json();
  if (res.status === 200 && body.maxLevel === 1 && body.grantedLevel === 1 && body.capped === true) {
    ok(`POST /api/campaign-architect autonomy (high-risk capped at L${body.grantedLevel})`);
  } else bad("POST /api/campaign-architect autonomy", `HTTP ${res.status}, granted ${body.grantedLevel}`);
} catch (e) { bad("POST /api/campaign-architect autonomy", e.message); }
try {
  const res = await fetch(BASE + "/api/campaign-architect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "architecture" }) });
  if (res.status === 400) ok("POST /api/campaign-architect rejects missing business");
  else bad("POST /api/campaign-architect validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/campaign-architect validation", e.message); }

console.log("\nYouTube SEO Intelligence:");
try {
  const res = await fetch(BASE + "/api/youtube", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "keywords", seed: "email marketing" }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.ideas) && body.ideas.length > 0 && typeof body.ideas[0].searchVolumeProxy === "number" && typeof body.ideas[0].opportunity === "number" && typeof body.disclaimer === "string") ok("youtube keywords");
  else bad("youtube keywords", `HTTP ${res.status} / bad shape`);
} catch (e) { bad("youtube keywords", e.message); }
try {
  const res = await fetch(BASE + "/api/youtube", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "titles", titles: ["5 SEO Tips That Work (2026)", "my channel intro"] }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.titles) && body.titles.length === 2 && Array.isArray(body.titles[0].patterns) && typeof body.titles[0].score === "number" && body.titles[0].score >= body.titles[1].score) ok("youtube titles");
  else bad("youtube titles", `HTTP ${res.status} / bad shape`);
} catch (e) { bad("youtube titles", e.message); }
try {
  const res = await fetch(BASE + "/api/youtube", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "comments", comments: ["too long and boring", "love this, so helpful", "the tool doesn't work, error"] }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.painPoints) && body.sentiment && typeof body.sentiment.positive === "number" && typeof body.sentiment.negative === "number" && typeof body.sentiment.neutral === "number") ok("youtube comments");
  else bad("youtube comments", `HTTP ${res.status} / bad shape`);
} catch (e) { bad("youtube comments", e.message); }
try {
  const res = await fetch(BASE + "/api/youtube", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "script", topic: "youtube seo" }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.hook === "string" && body.hook.length > 0 && Array.isArray(body.retentionBeats) && body.retentionBeats.length > 0 && typeof body.cta === "string") ok("youtube script");
  else bad("youtube script", `HTTP ${res.status} / bad shape`);
} catch (e) { bad("youtube script", e.message); }
try {
  const res = await fetch(BASE + "/api/youtube", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "keywords" }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("youtube validation (400)");
  else bad("youtube validation (400)", `HTTP ${res.status}`);
} catch (e) { bad("youtube validation (400)", e.message); }

console.log("\nWhite-label Reporting Centre:");
try {
  const res = await fetch(BASE + "/api/reporting");
  const body = await res.json();
  if (Array.isArray(body.reportSections) && body.reportSections.length === 7 && body.demo && typeof body.demo.overallScore === "number") ok("reporting GET returns 7 sections + demo report");
  else bad("reporting GET", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("reporting GET", String(e)); }
try {
  const res = await fetch(BASE + "/api/reporting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build", input: { business: "Acme Cafe", branding: { agencyName: "Northwind" } } }) });
  const body = await res.json();
  if (body.business === "Acme Cafe" && body.whiteLabel.agencyName === "Northwind" && Array.isArray(body.sections) && body.sections.length === 7 && typeof body.overallScore === "number" && body.headline.includes("ESTIMATE")) ok("reporting build returns branded 7-section report");
  else bad("reporting build", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("reporting build", String(e)); }
try {
  const res = await fetch(BASE + "/api/reporting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build", input: { business: "Solo Shop", sections: ["seo_audit", "backlink"] } }) });
  const body = await res.json();
  if (body.sections.length === 2 && body.sections[0].id === "seo_audit" && typeof body.sections[0].score === "number" && body.sections[0].summary.includes("ESTIMATE")) ok("reporting build honours requested sections + labels ESTIMATE");
  else bad("reporting build sections", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("reporting build sections", String(e)); }
try {
  const built = await (await fetch(BASE + "/api/reporting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build", input: { business: "Acme Cafe" } }) })).json();
  const res = await fetch(BASE + "/api/reporting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "export", report: built, format: "pdf" }) });
  const body = await res.json();
  if (body.format === "pdf" && body.filename === "acme-cafe-pdf.pdf" && typeof body.sizeEstimateKb === "number" && body.acuNote === "Premium export consumes ACUs") ok("reporting export returns slugified filename + ACU note");
  else bad("reporting export", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("reporting export", String(e)); }
try {
  const res = await fetch(BASE + "/api/reporting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build", input: {} }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("reporting build rejects missing business (400)");
  else bad("reporting build validation", res.status + " " + JSON.stringify(body).slice(0, 200));
} catch (e) { bad("reporting build validation", String(e)); }

console.log("\nLoyalty & Referral Network:");
try {
  const r = await fetch(BASE + "/api/loyalty", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "tier", points: 2600 }) });
  const body = await r.json();
  if (body.tier === "gold" && body.nextTier === "platinum" && typeof body.pointsToNext === "number" && Array.isArray(body.perks)) ok("loyalty tier resolves gold with next platinum");
  else bad("loyalty tier", JSON.stringify(body));
} catch (e) { bad("loyalty tier", String(e)); }
try {
  const r = await fetch(BASE + "/api/loyalty", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "earn", earnAction: "purchase", amountGbp: 42 }) });
  const body = await r.json();
  if (body.action === "purchase" && body.points === 420 && typeof body.basis === "string") ok("loyalty earn awards 420 points for £42 purchase");
  else bad("loyalty earn", JSON.stringify(body));
} catch (e) { bad("loyalty earn", String(e)); }
try {
  const r = await fetch(BASE + "/api/loyalty", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "referral", customerId: "cust_9f3a" }) });
  const body = await r.json();
  if (typeof body.code === "string" && body.code.startsWith("MW-") && body.consentRequired === true && body.maxTouchesPer7Days === 5) ok("loyalty referral returns stable coded invite with consent cap");
  else bad("loyalty referral", JSON.stringify(body));
} catch (e) { bad("loyalty referral", String(e)); }
try {
  const r = await fetch(BASE + "/api/loyalty", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "kfactor", invitesSent: 8, inviteAcceptRate: 0.35, purchaseRate: 0.45 }) });
  const body = await r.json();
  if (typeof body.kFactor === "number" && Array.isArray(body.projectedCycles) && body.projectedCycles.length === 5 && (body.verdict === "viral" || body.verdict === "sub-viral")) ok("loyalty kfactor projects 5 cycles with verdict");
  else bad("loyalty kfactor", JSON.stringify(body));
} catch (e) { bad("loyalty kfactor", String(e)); }
try {
  const r = await fetch(BASE + "/api/loyalty", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "tier" }) });
  const body = await r.json();
  if (r.status === 400 && typeof body.error === "string") ok("loyalty tier rejects missing points with 400");
  else bad("loyalty tier validation", JSON.stringify(body));
} catch (e) { bad("loyalty tier validation", String(e)); }

console.log("\nMarket Listening (Brandwatch-class):");
const LISTEN_MENTIONS = [
  { id: "m1", text: "love this place, best steak in London", source: "twitter", author: "@a", authorReach: 40000, engagement: 300, brand: "MyBrand", period: "2026-W24" },
  { id: "m2", text: "service was slow and cold, disappointed", source: "review", author: "b", authorReach: 200, engagement: 5, brand: "MyBrand", period: "2026-W25" },
  { id: "m3", text: "can anyone recommend a good grill near Brixton? looking for a supplier", source: "reddit", author: "c", authorReach: 3000, engagement: 20, brand: "MyBrand", period: "2026-W25" },
  { id: "m4", text: "Rival Co has great burgers now", source: "tiktok", author: "@d", authorReach: 90000, engagement: 700, brand: "Rival Co", period: "2026-W25" },
];
try {
  const res = await fetch(BASE + "/api/market-listening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyse", brand: "MyBrand", mentions: LISTEN_MENTIONS }) });
  const body = await res.json();
  if (res.status === 200 && body.sentiment && typeof body.sentiment.net === "number" && Array.isArray(body.shareOfVoice) && body.shareOfVoice.length >= 2 && Array.isArray(body.recommendedActions) && body.recommendedActions.length > 0) {
    ok(`POST /api/market-listening analyse (net sentiment ${body.sentiment.net}, ${body.shareOfVoice.length} brands, risk ${body.reputationRisk})`);
  } else bad("POST /api/market-listening analyse", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/market-listening analyse", e.message); }
try {
  const res = await fetch(BASE + "/api/market-listening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leads", competitors: ["Rival Co"], mentions: LISTEN_MENTIONS }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.leads) && body.leads.length >= 1 && body.leads[0].need && body.leads[0].recommendedResponse && body.leads[0].complianceStatus === "review") {
    ok(`POST /api/market-listening leads (${body.leads.length} lead card(s), top need "${body.leads[0].need}")`);
  } else bad("POST /api/market-listening leads", `HTTP ${res.status}, leads ${body.leads?.length}`);
} catch (e) { bad("POST /api/market-listening leads", e.message); }
try {
  const res = await fetch(BASE + "/api/market-listening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyse", brand: "MyBrand", mentions: [] }) });
  if (res.status === 400) ok("POST /api/market-listening rejects empty mentions");
  else bad("POST /api/market-listening validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/market-listening validation", e.message); }

console.log("\nClaims & Compliance API:");
try {
  const res = await fetch(`${BASE}/api/compliance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", input: { text: "The #1 best grill, guaranteed cheapest" } }) });
  const body = await res.json();
  if (body.status === "prohibited" && body.publishable === false) ok("compliance verify blocks unsubstantiated superlatives");
  else bad("compliance verify", JSON.stringify(body));
} catch (e) { bad("compliance verify", String(e)); }
try {
  const res = await fetch(`${BASE}/api/compliance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", input: { text: "Delivered hot in 30 minutes", evidenceSource: "internal delivery logs" } }) });
  const body = await res.json();
  if (body.status === "verified" && body.publishable === true) ok("compliance verify accepts substantiated claim");
  else bad("compliance verify substantiated", JSON.stringify(body));
} catch (e) { bad("compliance verify substantiated", String(e)); }
try {
  const res = await fetch(`${BASE}/api/compliance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "review", input: { claims: ["The best grill guaranteed"], category: "health", aiGenerated: true, hasDisclosure: false } }) });
  const body = await res.json();
  if (body.verdict === "blocked" && Array.isArray(body.claimResults) && Array.isArray(body.requiredDisclosures) && body.requiredDisclosures.length > 0) ok("compliance review blocks + requires AI disclosure");
  else bad("compliance review", JSON.stringify(body));
} catch (e) { bad("compliance review", String(e)); }
try {
  const res = await fetch(`${BASE}/api/compliance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "provenance", input: { assetId: "asset-1", aiGenerated: true, creatorConsent: true } }) });
  const body = await res.json();
  if (body.aiDisclosure === true && body.c2paCompatible === true && body.consentRecorded === true && typeof body.label === "string") ok("compliance provenance labels AI asset");
  else bad("compliance provenance", JSON.stringify(body));
} catch (e) { bad("compliance provenance", String(e)); }
try {
  const res = await fetch(`${BASE}/api/compliance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", input: {} }) });
  if (res.status === 400) ok("compliance verify validates missing text (400)");
  else bad("compliance verify validation", `expected 400 got ${res.status}`);
} catch (e) { bad("compliance verify validation", String(e)); }

console.log("\nOnboarding engine (Autonomous Business & Market Onboarding):");
try {
  const res = await fetch(`${BASE}/api/onboarding`);
  const body = await res.json();
  if (body.engine && typeof body.engine === "string" && body.demo && typeof body.demo.businessProfile.business === "string" && Array.isArray(body.demo.audienceMap)) ok("GET returns doctrine + demo onboarding");
  else bad("onboarding GET", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("onboarding GET", e.message); }
try {
  const res = await fetch(`${BASE}/api/onboarding`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "onboard", input: { business: "Bright Dental Clinic", industry: "healthcare / wellness", countries: ["United Kingdom"] } }) });
  const body = await res.json();
  if (body.businessProfile.industry === "healthcare / wellness" && Array.isArray(body.brandVoiceProfile) && body.brandVoiceProfile.length > 0 && Array.isArray(body.keywordUniverse) && body.keywordUniverse.length > 0) ok("onboard action builds a market bundle");
  else bad("onboarding onboard", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("onboarding onboard", e.message); }
try {
  const res = await fetch(`${BASE}/api/onboarding`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "onboard", input: { business: "Acme Roofing", competitors: ["Rival Roofers"] } }) });
  const body = await res.json();
  if (Array.isArray(body.ninetyDayPlan) && body.ninetyDayPlan.length === 3 && Array.isArray(body.personaHypotheses) && typeof body.competitorMap[0].name === "string" && body.competitorMap[0].name === "Rival Roofers") ok("onboard returns 90-day plan, personas + supplied competitors");
  else bad("onboarding plan", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("onboarding plan", e.message); }
try {
  const res = await fetch(`${BASE}/api/onboarding`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "onboard", input: {} }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("missing business rejected with 400");
  else bad("onboarding validation", `status ${res.status} ${JSON.stringify(body).slice(0, 150)}`);
} catch (e) { bad("onboarding validation", e.message); }

console.log("\nRevenue Attribution + Viral-to-Revenue:");
try {
  const res = await fetch(`${BASE}/api/attribution`);
  const body = await res.json();
  if (Array.isArray(body.funnelStages) && body.funnelStages.length === 8 && body.demo && typeof body.demo.funnel.revenueGbp === "number") ok("GET attribution returns doctrine + 8 funnel stages + demo");
  else bad("attribution GET", "missing funnelStages(8)/demo.funnel.revenueGbp");
} catch (e) { bad("attribution GET", String(e)); }
try {
  const res = await fetch(`${BASE}/api/attribution`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "funnel", input: { impressions: 100000, attention: 30000, clicks: 5000, leads: 1000, purchases: 300, avgOrderValueGbp: 50 } }) });
  const body = await res.json();
  if (Array.isArray(body.stages) && body.stages.length === 8 && body.revenueGbp === 15000 && typeof body.biggestDropOff === "string") ok("POST funnel builds 8-stage funnel + revenue estimate");
  else bad("attribution funnel", "expected 8 stages and revenueGbp 15000, got " + JSON.stringify(body.revenueGbp));
} catch (e) { bad("attribution funnel", String(e)); }
try {
  const res = await fetch(`${BASE}/api/attribution`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "channels", touchpoints: [{ channel: "tiktok", position: "first", conversions: 100, revenueGbp: 5000 }, { channel: "email", position: "last", conversions: 80, revenueGbp: 4000 }] }) });
  const body = await res.json();
  if (body.model === "u-shaped" && Array.isArray(body.byChannel) && body.byChannel.length === 2 && typeof body.totalRevenueGbp === "number") ok("POST channels applies u-shaped attribution");
  else bad("attribution channels", "expected u-shaped model + 2 channels");
} catch (e) { bad("attribution channels", String(e)); }
try {
  const res = await fetch(`${BASE}/api/attribution`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "roi", input: { contentCostGbp: 1000, attributedRevenueGbp: 3000 } }) });
  const body = await res.json();
  if (body.verdict === "scale" && body.roi === 2 && body.roiPct === 200) ok("POST roi returns verdict + roi multiple");
  else bad("attribution roi", "expected verdict scale, roi 2, got " + JSON.stringify(body.verdict) + "/" + JSON.stringify(body.roi));
} catch (e) { bad("attribution roi", String(e)); }
try {
  const res = await fetch(`${BASE}/api/attribution`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "funnel", input: {} }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("POST funnel without impressions returns 400");
  else bad("attribution validation", "expected 400, got " + res.status);
} catch (e) { bad("attribution validation", String(e)); }

console.log("\nContent Opportunity Radar:");
try {
  const res = await fetch(BASE + "/api/opportunity-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rank", inputs: [
    { topic: "A", factors: { demand: 0.9, commercialIntent: 0.9, relevance: 0.9, timing: 0.9, authorityProbability: 0.9, conversionProbability: 0.9, competition: 0.2 } },
    { topic: "B", factors: { demand: 0.2, commercialIntent: 0.2, relevance: 0.3, timing: 0.3, authorityProbability: 0.3, conversionProbability: 0.3, competition: 0.9 } },
  ] }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.opportunities) && body.opportunities.length === 2 && body.opportunities[0].topic === "A" && body.opportunities[0].opportunityScore >= body.opportunities[1].opportunityScore && typeof body.opportunities[0].breakdown === "string") {
    ok(`POST /api/opportunity-radar rank (top "A" @ ${body.opportunities[0].opportunityScore}, transparent breakdown)`);
  } else bad("POST /api/opportunity-radar rank", `HTTP ${res.status}, top ${body.opportunities?.[0]?.topic}`);
} catch (e) { bad("POST /api/opportunity-radar rank", e.message); }
try {
  const res = await fetch(BASE + "/api/opportunity-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", input: { topic: "best grill in Brixton", factors: { competition: 0.2 } } }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.opportunityScore === "number" && body.factors && typeof body.factors.competition === "number" && body.breakdown.includes("÷")) {
    ok(`POST /api/opportunity-radar score (${body.opportunityScore}/100 with shown factors)`);
  } else bad("POST /api/opportunity-radar score", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/opportunity-radar score", e.message); }
try {
  const res = await fetch(BASE + "/api/opportunity-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rank", inputs: [] }) });
  if (res.status === 400) ok("POST /api/opportunity-radar rejects empty inputs");
  else bad("POST /api/opportunity-radar validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/opportunity-radar validation", e.message); }

console.log("\nAI Answer Accuracy Monitor:");
try {
  const res = await fetch(BASE + "/api/ai-accuracy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", input: { brand: "Acme Grill", engine: "chatgpt", answerText: "Acme Grill is a plumber in Leeds, priced at £999.", facts: { locations: ["Brixton"], prices: ["£20"], products: ["steak"] } } }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.brandMentioned === "boolean" && Array.isArray(body.issues) && typeof body.accuracyScore === "number" && Array.isArray(body.recommendedFixes)) {
    ok(`POST /api/ai-accuracy check (accuracy ${body.accuracyScore}, ${body.issues.length} issue(s))`);
  } else bad("POST /api/ai-accuracy check", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/ai-accuracy check", e.message); }
try {
  const res = await fetch(BASE + "/api/ai-accuracy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "causal", input: { treatedTrafficBefore: 100, treatedTrafficAfter: 150, controlTrafficBefore: 100, controlTrafficAfter: 120 } }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.attributableLiftPct === "number" && body.attributableLiftPct <= body.treatedLiftPct && typeof body.verdict === "string") {
    ok(`POST /api/ai-accuracy causal (attributable ${body.attributableLiftPct}% → ${body.verdict})`);
  } else bad("POST /api/ai-accuracy causal", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/ai-accuracy causal", e.message); }
try {
  const res = await fetch(BASE + "/api/ai-accuracy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", input: { brand: "", engine: "chatgpt", answerText: "x" } }) });
  if (res.status === 400) ok("POST /api/ai-accuracy rejects missing brand");
  else bad("POST /api/ai-accuracy validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/ai-accuracy validation", e.message); }

console.log("\nCompetitor War Room:");
try {
  const res = await fetch(BASE + "/api/competitor-warroom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "monitor", input: { competitor: "Rival Smokehouse" } }) });
  const body = await res.json();
  if (res.status === 200 && body.competitor === "Rival Smokehouse" && ["gaining", "flat", "losing"].includes(body.momentum) && typeof body.shareOfVoice === "number") {
    ok(`POST /api/competitor-warroom monitor (momentum ${body.momentum}, SoV ${body.shareOfVoice})`);
  } else bad("POST /api/competitor-warroom monitor", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/competitor-warroom monitor", e.message); }
try {
  const res = await fetch(BASE + "/api/competitor-warroom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan", input: { competitor: "Rival Smokehouse", complaints: ["always late delivery", "rude staff"] } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.weaknesses) && body.weaknesses.length >= 1 && typeof body.weaknesses[0].exploitability === "number") {
    ok(`POST /api/competitor-warroom scan (${body.weaknesses.length} weaknesses, top exploitability ${body.weaknesses[0].exploitability})`);
  } else bad("POST /api/competitor-warroom scan", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/competitor-warroom scan", e.message); }
try {
  const res = await fetch(BASE + "/api/competitor-warroom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "battlecard", input: { competitor: "Rival Smokehouse" } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.theirWeaknesses) && Array.isArray(body.ourCounters)) ok("POST /api/competitor-warroom battlecard (weaknesses + counters)");
  else bad("POST /api/competitor-warroom battlecard", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/competitor-warroom battlecard", e.message); }
try {
  const res = await fetch(BASE + "/api/competitor-warroom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "monitor", input: {} }) });
  if (res.status === 400) ok("POST /api/competitor-warroom rejects missing competitor");
  else bad("POST /api/competitor-warroom validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/competitor-warroom validation", e.message); }

console.log("\nAutonomous Content Factory (content-engine):");
try {
  const res = await fetch(BASE + "/api/content-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "brief", input: { outputType: "seo_article", topic: "best grill in Brixton" } }) });
  const body = await res.json();
  if (res.status === 200 && body.outputType === "seo_article" && Array.isArray(body.outline) && body.outline.length > 0 && typeof body.requiresSourceValidation === "boolean") {
    ok(`POST /api/content-engine brief (${body.outline.length}-point outline)`);
  } else bad("POST /api/content-engine brief", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/content-engine brief", e.message); }
try {
  const res = await fetch(BASE + "/api/content-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assemble", input: { outputType: "seo_article", topic: "grill facts", highRisk: true, claims: [{ text: "we cure hunger instantly", hasSource: false }, { text: "rated 4.7", hasSource: true }] } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.claimAudit) && body.claimAudit.length === 2 && typeof body.blocked === "number" && typeof body.publishable === "boolean") {
    ok(`POST /api/content-engine assemble (${body.blocked} claim(s) blocked, publishable ${body.publishable})`);
  } else bad("POST /api/content-engine assemble", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/content-engine assemble", e.message); }
try {
  const res = await fetch(BASE + "/api/content-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "brief", input: { outputType: "not_a_type", topic: "x" } }) });
  if (res.status === 400) ok("POST /api/content-engine rejects unknown outputType");
  else bad("POST /api/content-engine validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/content-engine validation", e.message); }

console.log("\nVideoDominance AI (clip intelligence):");
const VID_MOMENTS = [
  { id: "c1", startSec: 12, endSec: 34, transcript: "the secret nobody tells you about grilling", hasFace: true, emotionIntensity: 70 },
  { id: "c2", startSec: 90, endSec: 108, transcript: "three reasons customers switch, price is £20", hasProduct: true, isNumberedPoint: true },
  { id: "c3", startSec: 200, endSec: 320, transcript: "long slow intro", hasFace: false },
];
try {
  const res = await fetch(BASE + "/api/video-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "genre", title: "Product demo: how our grill works", transcript: "let me demo the features and unbox it" }) });
  const body = await res.json();
  if (res.status === 200 && body.genre === "product_demo" && typeof body.confidence === "number") ok(`POST /api/video-intelligence genre (${body.genre} @ ${body.confidence})`);
  else bad("POST /api/video-intelligence genre", `HTTP ${res.status}, genre ${body.genre}`);
} catch (e) { bad("POST /api/video-intelligence genre", e.message); }
try {
  const res = await fetch(BASE + "/api/video-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rank", moments: VID_MOMENTS }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.moments) && body.moments.length === 3 && body.moments[0].momentScore >= body.moments[2].momentScore && Array.isArray(body.moments[0].reasons)) {
    ok(`POST /api/video-intelligence rank (top ${body.moments[0].id} @ ${body.moments[0].momentScore})`);
  } else bad("POST /api/video-intelligence rank", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/video-intelligence rank", e.message); }
try {
  const res = await fetch(BASE + "/api/video-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", input: { clipId: "c2", hookStrength: 78, productVisible: true, ctaPresent: true, buyerIntent: 72, reputationRisk: 8 } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.scores) && body.scores.length === 8 && body.scores.some((s) => s.dimension === "profitability") && typeof body.headline === "string") {
    ok(`POST /api/video-intelligence score (8 dims, headline ${body.headline})`);
  } else bad("POST /api/video-intelligence score", `HTTP ${res.status}, dims ${body.scores?.length}`);
} catch (e) { bad("POST /api/video-intelligence score", e.message); }
try {
  const res = await fetch(BASE + "/api/video-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "find", query: "find every time the price is mentioned", moments: VID_MOMENTS }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.results) && body.results.length >= 1 && body.results[0].matchReason && typeof body.results[0].startSec === "number") {
    ok(`POST /api/video-intelligence find (${body.results.length} moment(s), top reason "${body.results[0].matchReason}")`);
  } else bad("POST /api/video-intelligence find", `HTTP ${res.status}, results ${body.results?.length}`);
} catch (e) { bad("POST /api/video-intelligence find", e.message); }
try {
  const res = await fetch(BASE + "/api/video-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rank", moments: [] }) });
  if (res.status === 400) ok("POST /api/video-intelligence rejects empty moments");
  else bad("POST /api/video-intelligence validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/video-intelligence validation", e.message); }

console.log("\nCrisis Command API:");
try {
  const res = await fetch(BASE + "/api/crisis-command");
  const body = await res.json();
  if (Array.isArray(body.warningSignals) && body.warningSignals.length === 13 && Array.isArray(body.severityFactors) && body.severityFactors.length === 10) ok("crisis-command GET doctrine");
  else bad("crisis-command GET doctrine", `signals=${body.warningSignals && body.warningSignals.length} factors=${body.severityFactors && body.severityFactors.length}`);
} catch (e) { bad("crisis-command GET doctrine", e.message); }
try {
  const res = await fetch(BASE + "/api/crisis-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "severity", input: { factors: { mention_velocity: 90 }, signals: ["viral_complaints", "product_safety"] } }) });
  const body = await res.json();
  if (typeof body.crisisSeverityScore === "number" && Array.isArray(body.factorScores) && body.factorScores.length === 10 && typeof body.levelLabel === "string" && body.estimate === true) ok("crisis-command severity");
  else bad("crisis-command severity", `score=${body.crisisSeverityScore} factors=${body.factorScores && body.factorScores.length}`);
} catch (e) { bad("crisis-command severity", e.message); }
try {
  const res = await fetch(BASE + "/api/crisis-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "early-warning", mentions: [{ text: "This is going viral, product is unsafe", sentiment: "negative", authorReach: 100000 }, { text: "time to boycott", sentiment: "negative" }] }) });
  const body = await res.json();
  if (Array.isArray(body.alerts) && typeof body.recommendedLevel === "number" && typeof body.negativeEstimate === "number" && body.estimate === true) ok("crisis-command early-warning");
  else bad("crisis-command early-warning", `alerts=${body.alerts && body.alerts.length} level=${body.recommendedLevel}`);
} catch (e) { bad("crisis-command early-warning", e.message); }
try {
  const res = await fetch(BASE + "/api/crisis-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "early-warning", mentions: "nope" }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("crisis-command validation 400");
  else bad("crisis-command validation 400", `status=${res.status}`);
} catch (e) { bad("crisis-command validation 400", e.message); }

console.log("\nCustomer Voice Intelligence + Product Backlog Bridge:");
try {
  const res = await fetch(BASE + "/api/customer-voice", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "analyse", input: { items: [
      { text: "The app crashed twice and I lost my draft, really frustrating.", type: "support_tickets" },
      { text: "Too expensive, cancelling because I'm switching to a cheaper competitor.", type: "cancellation_reasons" },
      { text: "Please add dark mode, that feature is missing.", type: "product_feedback" },
    ] } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.topPains) && Array.isArray(body.featureRequests) && typeof body.revenueAtRiskGbp === "number" && body.itemsAnalysed === 3) {
    ok(`POST /api/customer-voice analyse (${body.topPains.length} pains, ${body.featureRequests.length} feature reqs, £${body.revenueAtRiskGbp} at risk ESTIMATE)`);
  } else bad("POST /api/customer-voice analyse", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/customer-voice analyse", e.message); }
try {
  const res = await fetch(BASE + "/api/customer-voice", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "backlog", input: { theme: "reliability/bugs", mentionVolume: 40, segment: "paying customers", revenueImpactGbp: 8000 } }) });
  const body = await res.json();
  if (res.status === 200 && typeof body.problemStatement === "string" && Array.isArray(body.acceptanceCriteria) && body.acceptanceCriteria.length >= 3 && ["P0","P1","P2","P3"].includes(body.priority) && body.mentionVolume === 40) {
    ok(`POST /api/customer-voice backlog (priority ${body.priority}, ${body.acceptanceCriteria.length} acceptance criteria)`);
  } else bad("POST /api/customer-voice backlog", `HTTP ${res.status} priority=${body.priority}`);
} catch (e) { bad("POST /api/customer-voice backlog", e.message); }
try {
  const res = await fetch(BASE + "/api/customer-voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backlog", input: { segment: "smb" } }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("POST /api/customer-voice backlog validation (400 on missing theme)");
  else bad("POST /api/customer-voice backlog validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/customer-voice backlog validation", e.message); }
try {
  const res = await fetch(BASE + "/api/customer-voice", { method: "GET" });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.inputTypes) && body.inputTypes.length === 12 && body.demo && Array.isArray(body.demo.analysis.topPains)) {
    ok(`GET /api/customer-voice doctrine (${body.inputTypes.length} input types, demo backlog ${body.demo.backlogItem.priority})`);
  } else bad("GET /api/customer-voice", `HTTP ${res.status}`);
} catch (e) { bad("GET /api/customer-voice", e.message); }

console.log("\nCreator Intelligence (§22):");
try {
  const res = await fetch(BASE + "/api/creator-intel");
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.discoverySignals) && body.discoverySignals.length === 11 && body.demo && Array.isArray(body.demo.shortlist)) {
    ok(`GET /api/creator-intel (${body.discoverySignals.length} signals, ${body.demo.shortlist.length} demo creators)`);
  } else bad("GET /api/creator-intel", `HTTP ${res.status}, signals ${body.discoverySignals?.length}`);
} catch (e) { bad("GET /api/creator-intel", e.message); }
try {
  const res = await fetch(BASE + "/api/creator-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", input: { handle: "@leeds_foodie", followers: 8200, engagementRate: 0.061, topic: "local food", geography: "Leeds, UK", brandSafe: true } }) });
  const body = await res.json();
  if (res.status === 200 && body.tier === "micro" && Array.isArray(body.signalScores) && body.signalScores.length === 11 && typeof body.fitScore === "number" && typeof body.priority === "number") {
    ok(`POST /api/creator-intel score (tier ${body.tier}, priority ${body.priority})`);
  } else bad("POST /api/creator-intel score", `HTTP ${res.status}, tier ${body.tier}, signals ${body.signalScores?.length}`);
} catch (e) { bad("POST /api/creator-intel score", e.message); }
try {
  const res = await fetch(BASE + "/api/creator-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "shortlist", creators: [{ handle: "@global.lifestyle", followers: 1400000, engagementRate: 0.008 }, { handle: "@budget_mum_uk", followers: 610, engagementRate: 0.092, geography: "Bristol, UK" }] }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.shortlist) && body.shortlist.length === 2 && typeof body.shortlist[0].rationale === "string" && body.shortlist[0].priority >= body.shortlist[1].priority) {
    ok(`POST /api/creator-intel shortlist (micro-first top ${body.shortlist[0].handle})`);
  } else bad("POST /api/creator-intel shortlist", `HTTP ${res.status}, len ${body.shortlist?.length}`);
} catch (e) { bad("POST /api/creator-intel shortlist", e.message); }
try {
  const res = await fetch(BASE + "/api/creator-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "brief", input: { handle: "@leeds_foodie", product: "MarketWar OS growth toolkit", budgetGbp: 400 } }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.deliverables) && typeof body.mandatoryDisclosure === "string" && typeof body.trackingLink === "string" && Array.isArray(body.milestonePayments) && Array.isArray(body.fraudChecks)) {
    ok(`POST /api/creator-intel brief (${body.deliverables.length} deliverables, code ${body.promoCode})`);
  } else bad("POST /api/creator-intel brief", `HTTP ${res.status}, deliverables ${body.deliverables?.length}`);
} catch (e) { bad("POST /api/creator-intel brief", e.message); }
try {
  const res = await fetch(BASE + "/api/creator-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", input: { handle: "@nofollowers" } }) });
  if (res.status === 400) ok("POST /api/creator-intel rejects missing followers");
  else bad("POST /api/creator-intel validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/creator-intel validation", e.message); }

console.log("\nBuyerMind (customer psychology):");
try {
  const res = await fetch(BASE + "/api/buyer-psychology", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "detect", text: "I'm so tired of expensive tools that don't work, I just want something simple and fast I can trust" }) });
  const body = await res.json();
  if (res.status === 200 && Array.isArray(body.drivers) && body.drivers.length === 15 && typeof body.dominant === "string" && body.drivers[0].score >= body.drivers[14].score) {
    ok(`POST /api/buyer-psychology detect (dominant "${body.dominant}")`);
  } else bad("POST /api/buyer-psychology detect", `HTTP ${res.status}, drivers ${body.drivers?.length}`);
} catch (e) { bad("POST /api/buyer-psychology detect", e.message); }
try {
  const res = await fetch(BASE + "/api/buyer-psychology", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "brief", product: "MarketWar OS", driver: "objection" }) });
  const body = await res.json();
  if (res.status === 200 && body.driver === "objection" && body.hook && body.proofRequirement.includes("evidence") && body.cta) {
    ok(`POST /api/buyer-psychology brief (objection → "${body.cta}")`);
  } else bad("POST /api/buyer-psychology brief", `HTTP ${res.status}`);
} catch (e) { bad("POST /api/buyer-psychology brief", e.message); }
try {
  const res = await fetch(BASE + "/api/buyer-psychology", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "brief", product: "X", driver: "not_a_driver" }) });
  if (res.status === 400) ok("POST /api/buyer-psychology rejects invalid driver");
  else bad("POST /api/buyer-psychology validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/buyer-psychology validation", e.message); }

console.log("\nOfferForge AI:");
try {
  const r = await fetch(BASE + "/api/offer-forge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "forge", input: { product: "Chilli Oil", priceGbp: 12, costGbp: 4.5, stock: 100 } }) });
  const body = await r.json();
  if (Array.isArray(body.offers) && body.offers.length === 11 && typeof body.baseMarginPct === "number") ok("forge returns 11 offers with a real base margin");
  else bad("offer-forge forge", "expected 11 offers + numeric baseMarginPct, got " + JSON.stringify(body).slice(0, 120));
} catch (e) { bad("offer-forge forge", String(e)); }
try {
  const r = await fetch(BASE + "/api/offer-forge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "forge", input: { product: "Chilli Oil", priceGbp: 12, costGbp: 4.5, stock: 100 } }) });
  const body = await r.json();
  const allAtOrAboveCost = body.offers.every((o) => o.priceGbp === 0 || o.priceGbp >= 4.5);
  const floorHeld = body.offers.every((o) => o.priceGbp === 0 || o.marginPct >= 20 || o.viable === false);
  if (allAtOrAboveCost && floorHeld) ok("no offer sells below cost and the 20% margin floor holds");
  else bad("offer-forge floor", "an offer breached cost or the margin floor");
} catch (e) { bad("offer-forge floor", String(e)); }
try {
  const r = await fetch(BASE + "/api/offer-forge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ladder", input: { product: "Chilli Oil", priceGbp: 12, costGbp: 4.5, stock: 100 } }) });
  const body = await r.json();
  if (Array.isArray(body.ladder) && body.ladder.every((o) => o.viable === true)) ok("ladder returns only viable offers in ascending order");
  else bad("offer-forge ladder", "expected a viable-only ladder array, got " + JSON.stringify(body).slice(0, 120));
} catch (e) { bad("offer-forge ladder", String(e)); }
try {
  const r = await fetch(BASE + "/api/offer-forge", { method: "GET" });
  const body = await r.json();
  if (Array.isArray(body.offerTypes) && body.offerTypes.length === 11 && typeof body.demo === "object") ok("GET returns doctrine, 11 offer types and demo");
  else bad("offer-forge GET", "expected 11 offerTypes + demo, got " + JSON.stringify(body).slice(0, 120));
} catch (e) { bad("offer-forge GET", String(e)); }
try {
  const r = await fetch(BASE + "/api/offer-forge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "forge", input: { product: "X", priceGbp: 5, costGbp: 8 } }) });
  const body = await r.json();
  if (r.status === 400 && typeof body.error === "string") ok("forge rejects cost > price with 400");
  else bad("offer-forge validation", "expected 400 for cost>price, got status " + r.status);
} catch (e) { bad("offer-forge validation", String(e)); }

console.log("\nRightsGuard (rights & consent matrix):");
try {
  const res = await fetch(BASE + "/api/rights-guard");
  const body = await res.json();
  if (Array.isArray(body.rightsFields) && body.rightsFields.includes("music_licence") && body.demo && typeof body.demo.doctrine === "string") ok("GET returns doctrine + rightsFields + demo");
  else bad("rights-guard GET", "missing rightsFields/demo shape");
} catch (e) { bad("rights-guard GET", String(e)); }
try {
  const res = await fetch(BASE + "/api/rights-guard");
  const body = await res.json();
  const p = body.demo.partiallyCleared;
  if (p.cleared === false && Array.isArray(p.missing) && p.missing.length > 0 && Array.isArray(p.blockers) && p.blockers.length === p.missing.length) ok("demo partial asset is BLOCKED with blockers");
  else bad("rights-guard demo partial", "expected blocked asset with blockers");
} catch (e) { bad("rights-guard demo partial", String(e)); }
try {
  const res = await fetch(BASE + "/api/rights-guard");
  const body = await res.json();
  const f = body.demo.fullyCleared;
  if (f.cleared === true && f.missing.length === 0 && Array.isArray(f.satisfied) && f.satisfied.length === f.required.length) ok("demo cleared asset passes with no missing rights");
  else bad("rights-guard demo cleared", "expected fully cleared asset");
} catch (e) { bad("rights-guard demo cleared", String(e)); }
try {
  const res = await fetch(BASE + "/api/rights-guard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", input: { assetId: "smoke-1", usesMusic: true, paidAd: true, rights: { source_ownership: true } } }) });
  const body = await res.json();
  if (body.assetId === "smoke-1" && body.cleared === false && body.required.includes("music_licence") && body.required.includes("paid_ad_rights")) ok("POST check evaluates use-specific required rights");
  else bad("rights-guard POST check", "unexpected check result");
} catch (e) { bad("rights-guard POST check", String(e)); }
try {
  const res = await fetch(BASE + "/api/rights-guard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", input: {} }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("POST check missing assetId returns 400");
  else bad("rights-guard POST validation", "expected 400 for missing assetId");
} catch (e) { bad("rights-guard POST validation", String(e)); }

console.log("\nProfitGuard AI:");
try {
  const res = await fetch(`${BASE}/api/profit-guard`);
  const body = await res.json();
  if (Array.isArray(body.checks) && body.checks.length === 9 && typeof body.doctrine === "string" && body.demo && body.demo.blocked.verdict === "hold" && body.demo.cleared.verdict === "scale") ok("GET returns doctrine, 9 checks, blocked+cleared demo");
  else bad("profit-guard GET", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("profit-guard GET", String(e)); }
try {
  const res = await fetch(`${BASE}/api/profit-guard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", input: { productInStock: true, offerValid: true, priceCorrect: true, marginPct: 42, marginThresholdPct: 20, deliveryCapacity: true, landingPageOk: true, checkoutOk: true, cacGbp: 18, targetCacGbp: 25, aiCostControlled: true } }) });
  const body = await res.json();
  if (body.cleared === true && body.verdict === "scale" && Array.isArray(body.checks) && body.checks.length === 9 && Array.isArray(body.blockers) && body.blockers.length === 0) ok("check clears when all 9 pass");
  else bad("profit-guard check cleared", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("profit-guard check cleared", String(e)); }
try {
  const res = await fetch(`${BASE}/api/profit-guard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", input: { productInStock: false, offerValid: true, priceCorrect: true, marginPct: 11, marginThresholdPct: 20, deliveryCapacity: true, landingPageOk: true, checkoutOk: true, cacGbp: 34, targetCacGbp: 25, aiCostControlled: false } }) });
  const body = await res.json();
  if (body.cleared === false && body.verdict === "hold" && Array.isArray(body.blockers) && body.blockers.length > 0) ok("check holds out-of-stock low-margin product");
  else bad("profit-guard check hold", JSON.stringify(body).slice(0, 200));
} catch (e) { bad("profit-guard check hold", String(e)); }
try {
  const res = await fetch(`${BASE}/api/profit-guard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unknown" }) });
  const body = await res.json();
  if (res.status === 400 && typeof body.error === "string") ok("unknown action returns 400");
  else bad("profit-guard validation", `status ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
} catch (e) { bad("profit-guard validation", String(e)); }

console.log("\nSubscription & Commercial model:");
try {
  const res = await fetch(BASE + "/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "quote-acus", providerCostGbp: 0.75 }) });
  const body = await res.json();
  // £0.75 × 4 × 100 = 300 ACUs; 300% markup = 75% gross margin.
  if (res.status === 200 && body.requiredAcus === 300 && body.customerChargeGbp === 3 && body.markupPct === 300 && body.grossMarginPct === 75) {
    ok(`POST /api/subscription quote-acus (£0.75 → ${body.requiredAcus} ACUs, ${body.markupPct}% markup = ${body.grossMarginPct}% margin)`);
  } else bad("POST /api/subscription quote-acus", `HTTP ${res.status}, acus ${body.requiredAcus}, margin ${body.grossMarginPct}`);
} catch (e) { bad("POST /api/subscription quote-acus", e.message); }
try {
  const res = await fetch(BASE + "/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", planId: "growth" }) });
  const body = await res.json();
  // Growth £49: 980 monthly ACUs (49×20), annual £411.60, top-up £9.80=980.
  if (res.status === 200 && body.monthlyAcus === 980 && body.annualGbp === 411.6 && body.defaultTopUpAcus === 980 && body.annualMonthlyReleaseAcus === 686) {
    ok(`POST /api/subscription plan growth (${body.monthlyAcus} ACUs/mo, annual £${body.annualGbp}, release ${body.annualMonthlyReleaseAcus}/mo)`);
  } else bad("POST /api/subscription plan", `HTTP ${res.status}, monthly ${body.monthlyAcus}, annual ${body.annualGbp}`);
} catch (e) { bad("POST /api/subscription plan", e.message); }
try {
  const res = await fetch(BASE + "/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "contribution", acuRevenueGbp: 4, providerCostGbp: 1, processingCostGbp: 0.1, paymentCostGbp: 0.1 }) });
  const body = await res.json();
  // £4 rev - £1.20 cost = £2.80 net; margin 70% → amber band.
  if (res.status === 200 && body.netContributionGbp === 2.8 && body.grossMarginPct === 70 && body.band === "amber") {
    ok(`POST /api/subscription contribution (net £${body.netContributionGbp}, ${body.grossMarginPct}% → ${body.band})`);
  } else bad("POST /api/subscription contribution", `HTTP ${res.status}, net ${body.netContributionGbp}, band ${body.band}`);
} catch (e) { bad("POST /api/subscription contribution", e.message); }
try {
  const res = await fetch(BASE + "/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upgrade", usage: { planId: "growth", topUpSpendGbp: 30, monthsToppingUp: 3, usersUsed: 5 } }) });
  const body = await res.json();
  if (res.status === 200 && body.shouldUpgrade === true && body.proposedPlan === "Scale" && body.signals.length >= 1) {
    ok(`POST /api/subscription upgrade (Growth → ${body.proposedPlan}, ${body.signals.length} signals)`);
  } else bad("POST /api/subscription upgrade", `HTTP ${res.status}, proposed ${body.proposedPlan}`);
} catch (e) { bad("POST /api/subscription upgrade", e.message); }
try {
  const res = await fetch(BASE + "/api/subscription");
  const body = await res.json();
  // GET exposes 8 plans + the markup correction; provider cost never a plan field.
  if (res.status === 200 && Array.isArray(body.plans) && body.plans.length === 8 && body.markupCorrection.grossMarginPct === 75 && body.markupCorrection.markupPct === 300) {
    ok(`GET /api/subscription (${body.plans.length} plans, 4× = ${body.markupCorrection.markupPct}% markup / ${body.markupCorrection.grossMarginPct}% margin)`);
  } else bad("GET /api/subscription", `HTTP ${res.status}, plans ${body.plans?.length}`);
} catch (e) { bad("GET /api/subscription", e.message); }
try {
  const res = await fetch(BASE + "/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", planId: "nope" }) });
  if (res.status === 400) ok("POST /api/subscription rejects invalid planId");
  else bad("POST /api/subscription validation", `expected 400, got ${res.status}`);
} catch (e) { bad("POST /api/subscription validation", e.message); }

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
