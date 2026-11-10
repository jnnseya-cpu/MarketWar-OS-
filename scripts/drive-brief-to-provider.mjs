// DOES THE APPROVED BRIEF ACTUALLY REACH THE PROVIDER?
//
// THE CLAIM THIS CLOSES. Everything up to now proved the brief is SELECTED
// correctly and RENDERED correctly, and that `promptFromInput` carries every
// key it is given. None of that is evidence that a prompt leaves this building
// with the brief inside it — the provider URL was hard-coded, so no test could
// stand between the platform and the network. "The brief is gathered" and "the
// provider receives the brief" were two claims with a string literal between
// them, which is exactly the shape of gap this repo keeps falling into.
//
// SO THIS STANDS UP A REAL HTTP SERVER that speaks the Anthropic Messages wire
// format, points the gateway at it with ANTHROPIC_BASE_URL (loopback http,
// which is the only case the gateway accepts without https), runs a REAL agent
// call through the REAL route, and reads the request body it actually received.
//
// IT IS NOT A MOCK OF OUR OWN CODE. Nothing here is stubbed, patched or
// injected: the route, the pre-flight, the brand-access gate, the brief store,
// the approvals workflow, the gateway, its retry and its timeout all run. The
// only thing replaced is the far side of the socket, which is the one part that
// cannot run here.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const { stopServer } = await import("./driver-preflight.mjs");
const root = fileURLToPath(new URL("..", import.meta.url));
const APP_PORT = Number(process.env.DRIVE_PORT || 3124);
const PROVIDER_PORT = Number(process.env.DRIVE_PROVIDER_PORT || 3125);
const ORIGIN = `http://127.0.0.1:${APP_PORT}`;

let proven = 0, broken = 0;
const say = (s) => process.stdout.write(`${s}\n`);
const ok = (n, c, x = "") => {
  if (c) { proven++; say(`  ok     ${n}`); }
  else { broken++; say(`  BROKEN ${n}${x ? ` — ${String(x).slice(0, 400)}` : ""}`); }
};

// ---------------------------------------------------------------- the stand-in
/** Every request body the gateway sent us, in order. */
const received = [];
const provider = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    received.push({ url: req.url, headers: req.headers, body });
    // The shape the Anthropic adapter parses. Anything else and the gateway
    // would report a provider error rather than an answer, which would make
    // this driver pass or fail for the wrong reason.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "msg_stand_in", type: "message", role: "assistant",
      content: [{ type: "text", text: "Stand-in provider answer." }],
      model: "stand-in", stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
  });
});
await new Promise((r) => provider.listen(PROVIDER_PORT, "127.0.0.1", r));
say(`\nStand-in provider on http://127.0.0.1:${PROVIDER_PORT} (speaks the Messages wire format)`);

try {
  const probe = await fetch(`${ORIGIN}/api/capabilities`).catch(() => null);
  if (probe) {
    say(`Something is already serving ${ORIGIN}. Stop it first — \`fuser -k ${APP_PORT}/tcp\`.`);
    process.exit(1);
  }
} catch { /* nothing listening, which is what we need */ }

// A DUMMY KEY, DELIBERATELY. The gateway will not call a provider it has no key
// for, and a real key must never leave this machine — the stand-in records
// whatever it is sent, which is the whole point.
const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
  detached: true, cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "development",
    ANTHROPIC_API_KEY: "sk-ant-stand-in-not-a-real-key",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${PROVIDER_PORT}`,
    AI_GATEWAY_ORDER: "anthropic",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let appLog = "";
app.stdout.on("data", (d) => { appLog += d.toString(); });
app.stderr.on("data", (d) => { appLog += d.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`${ORIGIN}/api/capabilities`); if (r.ok) { up = true; break; } }
  catch { /* booting */ }
  await sleep(500);
}
if (!up) {
  say(`The app did not come up on ${APP_PORT}.\n${appLog.slice(-800)}`);
  stopServer(app, "SIGKILL"); provider.close();
  process.exit(1);
}
say(`App on ${ORIGIN}, gateway pointed at the stand-in\n`);

const BRAND = "drive_provider_brand";
const post = async (path, body) => {
  const r = await fetch(`${ORIGIN}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

try {
  // Warm every route first: compiling one in dev reloads the module graph and
  // resets module-level state, which looks exactly like a store that forgot.
  for (const p of ["opportunity-radar", "approvals"]) {
    await post(`/api/${p}`, { action: "warm" }).catch(() => {});
  }
  await fetch(`${ORIGIN}/api/agents/content-factory`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }).catch(() => {});

  say("The gateway honours the override, and refuses a dangerous one");
  {
    const before = received.length;
    await fetch(`${ORIGIN}/api/agents/content-factory`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: "Baseline Co" }),
    });
    ok("a real agent call reaches the stand-in", received.length > before, `${received.length} request(s) received`);
    const last = received[received.length - 1];
    ok("on the Messages path", last?.url === "/v1/messages", last?.url);
    ok("carrying the key as a header, not in the URL", Boolean(last?.headers["x-api-key"]) && !String(last?.url).includes("sk-ant"), last?.url);
  }

  say("\nA baseline run carries NO brief — the absence is the control");
  {
    const last = received[received.length - 1];
    ok("no brief in a run with none in force", !/APPROVED GROWTH BRIEF IS IN FORCE/.test(last?.body || ""), (last?.body || "").slice(0, 200));
  }

  say("\nNow issue and approve a brief, and send the same agent again");
  const now = Date.now();
  const BRIEF = {
    schema_version: 1, brief_id: `br_prov_${now.toString(36)}`, brief_version: 1,
    tenant_id: "t_prov", platform_id: "mw_os", market: "GB", locale: "en-GB",
    topic_id: "tp_cde_handover", opportunity_score: 86.25, confidence: 83.5,
    valid_from: new Date(now - 3600_000).toISOString(),
    expires_at: new Date(now + 7 * 86400_000).toISOString(),
    evidence_ids: ["ev_1", "ev_2"],
    audience: "UK main contractors adopting a common data environment",
    intent: "commercial",
    approved_claim_ids: ["cl_iso19650_aligned"],
    cta_id: "cta_book_demo",
    allowed_channels: ["seo", "organic_social"],
    prohibited_claims: ["guaranteed ISO compliance"],
    objective: "Capture rising demand for CDE handover packs",
    experiment_id: "ex_cde_1", policy_version: 3,
  };
  {
    const issued = await post("/api/opportunity-radar", {
      action: "issue-brief", brandId: BRAND, brief: BRIEF, gate: { opportunity: 86.25, confidence: 83.5 },
    });
    ok("the brief is issued", issued.status === 200, `${issued.status} ${JSON.stringify(issued.body).slice(0, 200)}`);
    for (const act of ["submit", "approve"]) {
      await post("/api/approvals", { action: "transition", brandId: BRAND, id: issued.body.approvalId, act, actor: "driver" });
    }

    const before = received.length;
    await fetch(`${ORIGIN}/api/agents/content-factory`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: BRAND, business: "Drive Co", market: "GB", locale: "en-GB" }),
    });
    ok("the agent call reached the provider", received.length > before);

    // THE ASSERTION THIS WHOLE DRIVER EXISTS FOR.
    const sent = received[received.length - 1]?.body || "";
    ok("THE PROVIDER RECEIVED THE BRIEF", /APPROVED GROWTH BRIEF IS IN FORCE/.test(sent), sent.slice(0, 300));
    ok("with the topic it is about", sent.includes(BRIEF.topic_id));
    ok("with the audience it is for", sent.includes("UK main contractors"));
    ok("with the approved claim id", sent.includes("cl_iso19650_aligned"));
    ok("with the prohibited claim stated as absolute", sent.includes("guaranteed ISO compliance") && /MUST NOT SAY/.test(sent));
    ok("with the call to action", sent.includes("cta_book_demo"));
    ok("and the brief's own identity for the audit trail", sent.includes(BRIEF.brief_id));

    // And the other pre-flights still travel, so this did not displace them.
    ok("the business context still travels alongside it", sent.includes("Drive Co"));
  }

  say("\nAn agent the brief does not cover gets nothing — silently");
  {
    const before = received.length;
    await fetch(`${ORIGIN}/api/agents/business-diagnosis`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: BRAND, business: "Drive Co" }),
    });
    ok("that call reached the provider too", received.length > before);
    const sent = received[received.length - 1]?.body || "";
    ok("and carried NO brief, because that agent maps to no live channel", !/APPROVED GROWTH BRIEF IS IN FORCE/.test(sent), sent.slice(0, 200));
  }

  say("\nA dangerous override is refused rather than honoured");
  {
    // Checked in-process rather than by restarting the app: the rule is a pure
    // function of the environment, and restarting dev servers to test a string
    // comparison would be slower and prove no more.
    const { anthropicBase, ANTHROPIC_DEFAULT_BASE } = await import("../src/backend/gateway.ts");
    const cases = [
      ["http://evil.example.com", "plain http off loopback"],
      ["ftp://127.0.0.1:3125", "a protocol that is not http(s)"],
      ["not a url at all", "an unparseable value"],
      ["", "an empty value"],
    ];
    for (const [value, why] of cases) {
      process.env.ANTHROPIC_BASE_URL = value;
      ok(`refused: ${why}`, anthropicBase() === ANTHROPIC_DEFAULT_BASE, `${value} → ${anthropicBase()}`);
    }
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example.com/anthropic/";
    ok("an https gateway is honoured, with the trailing slash trimmed",
      anthropicBase() === "https://gateway.example.com/anthropic", anthropicBase());
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${PROVIDER_PORT}`;
    ok("loopback http is honoured, which is what a local stand-in needs",
      anthropicBase() === `http://127.0.0.1:${PROVIDER_PORT}`, anthropicBase());
  }
} finally {
  stopServer(app, "SIGKILL");
  provider.close();
}

say(`\ndrive:brief-provider — ${proven} proven, ${broken} broken.`);
process.exit(broken ? 1 : 0);
