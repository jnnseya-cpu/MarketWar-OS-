// DRIVES THE TREND INTELLIGENCE SURFACE THE WAY A CUSTOMER REACHES IT —
// over HTTP, against a real server, through the real routes, and then in a real
// browser on the real screen.
//
// WHY THIS EXISTS AS WELL AS THE UNIT TESTS. `tests/trend-intelligence.test.mjs`
// imports the modules directly, which proves the rules and proves nothing about
// whether anything on this platform consults them. Every defect this embedding
// turned up was at a join: a refusal that was never read, a provider field
// dropped at a mapper, a CSP that stopped the screen hydrating at all. None of
// those are visible from inside a module.
//
// WHY IT BOOTS `next dev` AND NOT `next start`. Brand isolation deliberately
// FAILS CLOSED in production without Firebase Admin — `resolveBrandAccess`
// returns 503 rather than serve one tenant's data without verified identities.
// That is correct and must not be weakened to make a driver pass. There are no
// Admin credentials here, so the brand-scoped half of this surface can only be
// exercised on the demo path, which is `NODE_ENV=development`. The driver says
// so rather than quietly testing something else.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { stopServer } = await import("./driver-preflight.mjs");
const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.DRIVE_PORT || 3123);
const ORIGIN = `http://127.0.0.1:${PORT}`;

let proven = 0, broken = 0;
const say = (s) => process.stdout.write(`${s}\n`);
const ok = (name, cond, extra = "") => {
  if (cond) { proven++; say(`  ok     ${name}`); }
  else { broken++; say(`  BROKEN ${name}${extra ? ` — ${String(extra).slice(0, 300)}` : ""}`); }
};

try {
  const probe = await fetch(`${ORIGIN}/api/capabilities`);
  if (probe) {
    say(`Something is already serving ${ORIGIN} (HTTP ${probe.status}). Stop it first — \`fuser -k ${PORT}/tcp\` — or this would drive THAT process, not this code.`);
    process.exit(1);
  }
} catch { /* nothing listening, which is what we need */ }

const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  detached: true,
  cwd: root, env: { ...process.env, NODE_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d.toString(); });
server.stderr.on("data", (d) => { serverLog += d.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`${ORIGIN}/api/capabilities`); if (r.ok) { up = true; break; } }
  catch { /* still booting */ }
  await sleep(500);
}
if (!up) {
  say(`The server did not come up on ${PORT}.\n${serverLog.slice(-800)}`);
  stopServer(server, "SIGKILL");
  process.exit(1);
}
say(`\nDemo-mode server on ${ORIGIN} (brand isolation passes through, as it does for any keyless deployment)\n`);

// WARM EVERY ROUTE BEFORE THE SCENARIO. In dev, compiling a route reloads the
// module graph and resets module-level state — which in a store with a memory
// fallback looks exactly like a brief that was saved and then vanished. It cost
// an hour to tell that apart from a real persistence defect, so the warm-up is
// here with its reason attached rather than as a mystery loop.
for (const p of ["opportunity-radar", "approvals", "emergency-stop"]) {
  await fetch(`${ORIGIN}/api/${p}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "warm" }),
  }).catch(() => {});
}
for (const p of ["/", "/dashboard/discover"]) await fetch(`${ORIGIN}${p}`).catch(() => {});

const BRAND = "drive_ti_brand";
const post = async (body) => {
  const r = await fetch(`${ORIGIN}/api/opportunity-radar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const now = Date.now();
const BRIEF_ID = `br_drive_${now.toString(36)}`;
const BRIEF = {
  schema_version: 1, brief_id: BRIEF_ID, brief_version: 1, tenant_id: "t_drive", platform_id: "mw_os",
  market: "GB", locale: "en-GB", topic_id: "tp_cde_adoption", opportunity_score: 86.25, confidence: 83.5,
  valid_from: new Date(now - 3600_000).toISOString(), expires_at: new Date(now + 7 * 86400_000).toISOString(),
  evidence_ids: ["ev_1", "ev_2", "ev_3"], audience: "UK main contractors", intent: "commercial",
  approved_claim_ids: ["cl_iso19650"], cta_id: "cta_book_demo",
  allowed_channels: ["seo", "organic_social"], prohibited_claims: ["guaranteed compliance"],
  objective: "Capture rising demand for CDE handover packs", experiment_id: "ex_cde_1", policy_version: 3,
};

try {
  say("§5 — the activation decision, and corroboration DERIVED rather than asserted");
  {
    const g = await fetch(`${ORIGIN}/api/opportunity-radar`).then((r) => r.json());
    ok("both scorers are published on one route, with the difference stated", Boolean(g.formula) && Boolean(g.activation?.difference), JSON.stringify(Object.keys(g)));
    ok("the radar's own formula is untouched", /Demand × Commercial Intent × Relevance/.test(g.formula || ""), g.formula);

    const oneFamily = await post({
      action: "assess",
      opportunity: { demand: 90, fit: 85, intent: 88, timing: 80, readiness: 85 },
      confidence: { sourceQuality: 90, coverage: 100, freshness: 100 },
      sources: ["news"],
    });
    ok("one source family caps confidence at 69", oneFamily.body.confidence <= 69, oneFamily.body.confidence);
    ok("so a single feed can never reach the brief band", oneFamily.body.band === "watch", oneFamily.body.band);

    const lie = await post({
      action: "assess",
      opportunity: { demand: 90, fit: 85, intent: 88, timing: 80, readiness: 85 },
      confidence: { sourceQuality: 90, coverage: 100, freshness: 100, independentFamilies: 9 },
      sources: ["news"],
    });
    ok("a CLAIMED family count cannot override the derived one", lie.body.confidence <= 69, lie.body.confidence);

    const three = await post({
      action: "assess",
      opportunity: { demand: 90, fit: 85, intent: 88, timing: 80, readiness: 85 },
      confidence: { sourceQuality: 90, coverage: 100, freshness: 100 },
      sources: ["news", "reviews", "search_queries"],
    });
    ok("three independent families clear the brief band", three.body.band === "brief", three.body.band);
    ok("but never act automatically without the opt-in", three.body.mayActAutomatically === false);

    const vetoed = await post({
      action: "assess",
      opportunity: { demand: 99, fit: 99, intent: 99, timing: 99, readiness: 99 },
      confidence: { sourceQuality: 99, coverage: 100, freshness: 100 },
      sources: ["news", "reviews", "search_queries"], autoActionOptIn: true, vetoes: ["out_of_market"],
    });
    ok("a veto beats a 99 on both scores", vetoed.body.band === "watch" && vetoed.body.mayActAutomatically === false, vetoed.body.band);

    const madeUp = await post({
      action: "assess",
      opportunity: { demand: 90, fit: 90, intent: 90, timing: 90, readiness: 90 },
      confidence: { sourceQuality: 100, coverage: 100, freshness: 100 },
      sources: ["fake_a", "fake_b", "fake_c"],
    });
    ok("invented source names count as no families at all", madeUp.body.families?.independentFamilies === 0, JSON.stringify(madeUp.body.families));
  }

  say("\n§6 — issuing: the contract first, then the band");
  let approvalId = "";
  {
    const injected = await post({ action: "issue-brief", brandId: BRAND, brief: { ...BRIEF, allow_publish: true }, gate: { opportunity: 90, confidence: 90 } });
    ok("an injected field is a rejection, not something ignored", injected.status === 400 && /closed/.test(JSON.stringify(injected.body)), `${injected.status} ${JSON.stringify(injected.body).slice(0, 160)}`);

    const low = await post({ action: "issue-brief", brandId: BRAND, brief: BRIEF, gate: { opportunity: 90, confidence: 69 } });
    ok("confidence 69 is refused, and the remedy names the missing family", low.status === 422 && /second independent family/.test(low.body.error || ""), `${low.status} ${low.body.error}`);

    const held = await post({ action: "issue-brief", brandId: BRAND, brief: BRIEF, gate: { opportunity: 99, confidence: 99, vetoes: ["restricted_topic"] } });
    ok("a veto refuses the issue whatever the scores", held.status === 422 && held.body.code === "vetoed", `${held.status} ${held.body.code}`);

    // §4's COORDINATOR, reached over HTTP: coordinates in, a contract-valid
    // brief out, with the SCORES TAKEN FROM THE DECISION rather than a second
    // copy of them. Without this path the coordinator has no importer at all,
    // and a caller must hand-assemble 22 fields including both scores — which
    // is exactly where a brief's numbers and its band drift apart.
    const fromCoords = await post({
      action: "issue-brief", brandId: BRAND,
      gate: { opportunity: 88.5, confidence: 86.2 },
      coordinates: {
        brief_id: `${BRIEF_ID}_coord`, brief_version: 1, tenant_id: "t_drive", platform_id: "mw_os",
        topic_id: "tp_from_coords", market: "GB", locale: "en-GB",
        audience: "UK main contractors", intent: "commercial",
        objective: "Built from a scored decision", cta_id: "cta_book_demo", experiment_id: "ex_2",
        evidence_ids: ["ev_1", "ev_2"], approved_claim_ids: ["cl_iso19650"],
        allowed_channels: ["seo"], prohibited_claims: ["guaranteed"], policy_version: 3,
        valid_from: new Date(now - 60_000).toISOString(),
      },
    });
    ok("a brief can be BUILT from a scored decision and issued in one call", fromCoords.status === 200, `${fromCoords.status} ${JSON.stringify(fromCoords.body).slice(0, 200)}`);
    ok("and its scores come from the decision, not a re-passed copy",
      fromCoords.body.brief?.opportunity_score === 88.5 && fromCoords.body.brief?.confidence === 86.2,
      `${fromCoords.body.brief?.opportunity_score} / ${fromCoords.body.brief?.confidence}`);

    const coordLow = await post({
      action: "issue-brief", brandId: BRAND,
      gate: { opportunity: 60, confidence: 60 },
      coordinates: {
        brief_id: `${BRIEF_ID}_low`, brief_version: 1, tenant_id: "t_drive", platform_id: "mw_os",
        topic_id: "tp_low", market: "GB", locale: "en-GB", audience: "a", intent: "i",
        objective: "o", cta_id: "c", experiment_id: "e", evidence_ids: ["ev_1"],
        approved_claim_ids: ["cl_1"], allowed_channels: ["seo"], prohibited_claims: [], policy_version: 3,
        valid_from: new Date(now).toISOString(),
      },
    });
    ok("a watch-band decision never becomes a brief, even by this route", coordLow.status === 400 && /does not authorise a brief/.test(JSON.stringify(coordLow.body)), `${coordLow.status} ${JSON.stringify(coordLow.body).slice(0, 180)}`);

    const good = await post({ action: "issue-brief", brandId: BRAND, brief: BRIEF, gate: { opportunity: 86.25, confidence: 83.5 } });
    ok("a candidate that clears the band is issued", good.status === 200 && good.body.brief?.brief_id === BRIEF_ID, `${good.status} ${JSON.stringify(good.body).slice(0, 160)}`);
    ok("into the platform's OWN approvals workflow", typeof good.body.approvalId === "string" && good.body.approvalId.startsWith("ap_"), good.body.approvalId);
    approvalId = good.body.approvalId;
  }

  say("\n§16 — resolving: unapproved, then approved, then every mismatch");
  {
    const pending = await post({ action: "effective", brandId: BRAND, briefId: BRIEF_ID, channel: "seo" });
    ok("no usable brief answers 200 — baseline is an answer, not a failure", pending.status === 200, pending.status);
    ok("an unapproved brief directs nothing, and names where to approve it", pending.body.code === "not_approved" && /Collaboration & Approvals/.test(pending.body.reason || ""), JSON.stringify(pending.body).slice(0, 200));

    for (const act of ["submit", "approve"]) {
      await fetch(`${ORIGIN}/api/approvals`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transition", brandId: BRAND, id: approvalId, act, actor: "driver" }),
      });
    }
    const live = await post({ action: "effective", brandId: BRAND, briefId: BRIEF_ID, channel: "seo", market: "GB", locale: "en-GB", topic_id: "tp_cde_adoption", policy_version: 3 });
    ok("once approved it resolves for an allowed channel", live.body.ok === true, JSON.stringify(live.body).slice(0, 220));
    ok("and may not be cached past its own expiry", typeof live.body.cacheForMs === "number" && live.body.cacheForMs <= 60_000, live.body.cacheForMs);

    const cases = [
      ["a channel the brief does not allow", { channel: "paid" }, "channel_not_allowed"],
      ["the wrong market", { channel: "seo", market: "CA" }, "market_mismatch"],
      ["the wrong locale", { channel: "seo", locale: "fr-FR" }, "locale_mismatch"],
      ["another policy version", { channel: "seo", policy_version: 4 }, "policy_mismatch"],
      ["an id that is not this brand's", { channel: "seo", briefId: "br_not_ours" }, "no_such_brief"],
    ];
    for (const [name, extra, code] of cases) {
      const r = await post({ action: "effective", brandId: BRAND, briefId: BRIEF_ID, ...extra });
      ok(`${name} is refused by name`, r.body.code === code, `${r.body.code}: ${String(r.body.reason).slice(0, 120)}`);
    }
  }

  say("\n§18 — an edit invalidates the approval (the refusal is READ)");
  {
    const re = await post({ action: "issue-brief", brandId: BRAND, brief: { ...BRIEF, objective: "An edited objective" }, gate: { opportunity: 86.25, confidence: 83.5 } });
    ok("re-issuing bumps the version", re.body.brief?.brief_version === 2, JSON.stringify(re.body.brief?.brief_version));
    const after = await post({ action: "effective", brandId: BRAND, briefId: BRIEF_ID, channel: "seo" });
    ok("and the edited brief stops resolving — the sign-off was withdrawn", after.body.code === "not_approved", JSON.stringify(after.body).slice(0, 200));
  }

  say("\n§14 — a frozen publish lane refuses through the same shape");
  {
    await fetch(`${ORIGIN}/api/emergency-stop`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "engage", scope: BRAND, lanes: ["publish"], reason: "driver test", engagedBy: "driver" }),
    });
    const frozen = await post({ action: "effective", brandId: BRAND, briefId: BRIEF_ID, channel: "seo" });
    ok("a halted publish lane refuses every brief", frozen.body.code === "channel_frozen", JSON.stringify(frozen.body).slice(0, 200));
    ok("in the same { ok:false, baseline:true, code } shape as every other refusal", frozen.body.ok === false && frozen.body.baseline === true);
    await fetch(`${ORIGIN}/api/emergency-stop`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", scope: BRAND, releasedBy: "driver", note: "driver test complete, publishing resumed" }),
    });
  }

  say("\nThe screen itself, in a real browser");
  {
    // Playwright lives outside this project's node_modules in this environment.
    let chromium = null;
    try { chromium = createRequire("/opt/node-tools/")("playwright").chromium; }
    catch { try { chromium = createRequire(import.meta.url)("playwright").chromium; } catch { /* none */ } }

    if (!chromium) {
      // LOUDER THAN A PASS. A skip that looks like a tick is how a gate becomes
      // decorative, which this repo has already paid for once.
      say("  SKIPPED — no Playwright in this environment, so the SCREEN was NOT exercised. The API above was.");
    } else {
      const browser = await chromium.launch({ args: ["--no-sandbox"] });
      const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
      // The container has no DNS and the dev runtime needs eval; neither is a
      // defect in this code, and each exclusion is matched specifically so
      // anything else still fails.
      const ENVIRONMENTAL = [/unsafe-eval/, /ERR_TUNNEL_CONNECTION_FAILED/, /googletagmanager|connect\.facebook\.net/];
      const errors = [];
      const note = (t) => { if (!ENVIRONMENTAL.some((r) => r.test(t))) errors.push(t); };
      page.on("pageerror", (e) => note(String(e)));
      page.on("console", (m) => { if (m.type() === "error") note(m.text()); });

      await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.evaluate((id) => {
        localStorage.setItem("mw.brands.v2", JSON.stringify([{
          id, name: "Drive Co", industry: "Construction software", product: "CDE",
          audience: "UK main contractors", location: "London", offer: "Free audit",
          website: "https://example.co.uk", goal: "Leads", color: "#10b981",
        }]));
        localStorage.setItem("mw.activeBrand.v2", id);
      }, BRAND);
      await page.goto(`${ORIGIN}/dashboard/discover`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(2500);

      // THE BRIEF IS ISSUED FROM INSIDE THE PAGE, after it has loaded.
      //
      // Not tidiness: in dev, compiling a route reloads the module graph, and
      // the browser navigating to `/` and the dashboard compiles several. A
      // brief issued before that navigation is genuinely gone by the time the
      // panel asks for it — which looks exactly like a store that does not
      // persist. Issuing here means nothing compiles in between, so what the
      // panel shows is what the server was just told.
      const uiBrief = { ...BRIEF, brief_id: `${BRIEF_ID}_ui` };
      const issued = await page.evaluate(async ([brandId, brief]) => {
        const r = await fetch("/api/opportunity-radar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "issue-brief", brandId, brief, gate: { opportunity: 86.25, confidence: 83.5 } }),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, [BRAND, uiBrief]);
      ok("a brief can be issued from the screen's own origin", issued.status === 200, `${issued.status} ${JSON.stringify(issued.body).slice(0, 160)}`);
      await page.reload({ waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(2000);

      // SCOPED TO THE PANEL. A whole-document regex for "Collaboration &
      // Approvals" passes on this page because that is a SIDEBAR NAV ITEM — an
      // assertion written that way was green while the panel said nothing.
      const panelText = () => page.evaluate(() => {
        const h = [...document.querySelectorAll("h2")].find((e) => /Growth briefs/.test(e.textContent || ""));
        return h ? (h.closest("div.card")?.innerText || "") : "";
      });
      const panel = await panelText();
      ok("the brief panel renders on the page the board is on", panel.length > 0, (await page.evaluate(() => document.body.innerText)).slice(0, 200));
      ok("the opportunity board still renders beside it", await page.evaluate(() => document.body.innerText.includes("Opportunity board")));
      ok("the issued brief is listed", /tp_cde_adoption/.test(panel), panel.slice(0, 200));

      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /in force/i.test(x.textContent || ""));
        if (!b) return false;
        b.click();
        return true;
      });
      ok("the 'Is it in force?' control exists and responds", clicked);
      await page.waitForTimeout(2500);
      const checked = await panelText();
      ok("it answers per channel", /seo:/.test(checked) && /organic_social:/.test(checked), checked.slice(0, 300));
      ok("in the SERVER's own words, not a paraphrase", /not approved/.test(checked) && /Collaboration & Approvals/.test(checked), checked.slice(0, 400));
      ok("and the screen raised no error of its own", errors.length === 0, errors.join(" | "));
      await browser.close();
    }
  }
} finally {
  // A process group, not the child: `npx next dev` is TWO processes and
  // signalling the child leaves the real server listening, which made three
  // other drivers single-use before anybody noticed.
  stopServer(server, "SIGKILL");
}

say(`\ndrive:brief — ${proven} proven, ${broken} broken.`);
process.exit(broken ? 1 : 0);
