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
  "/dashboard/briefing",
  "/dashboard/audit",
  "/dashboard/war-room",
  "/dashboard/campaigns",
  "/dashboard/offers",
  "/dashboard/product-engine",
  "/dashboard/website-intel",
  "/dashboard/content",
  "/dashboard/video",
  "/dashboard/landing-pages",
  "/dashboard/whatsapp",
  "/dashboard/email",
  "/dashboard/customers",
  "/dashboard/recovery",
  "/dashboard/amplify",
  "/dashboard/revenue",
  "/dashboard/budget",
  "/dashboard/competitors",
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
if (agentIds.length >= 23) ok(`agent registry lists ${agentIds.length} agents`);
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
