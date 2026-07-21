// Production live-smoke — confirm the LIVE integrations on the DEPLOYED app the
// moment the secrets are in. Two modes:
//
//   node scripts/smoke-live.mjs https://marketwaros.com
//     → safe pre-flight only: prints the /api/health/live readiness matrix
//       (no provider calls, no spend).
//
//   node scripts/smoke-live.mjs https://marketwaros.com --exercise
//     → also EXERCISES the live paths that cost a little (image generate,
//       video-render start, a Zernio connect link). Does NOT publish to real
//       socials. Use once, right after setting keys, to watch the first live run.
//
// Base URL may also come from SMOKE_BASE. Exits non-zero if any checked live
// capability that is reported "ready" fails to actually work.

const BASE = (process.argv[2] || process.env.SMOKE_BASE || "http://localhost:3000").replace(/\/$/, "");
const EXERCISE = process.argv.includes("--exercise");

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
const bad = (m, d) => { fail++; console.log("  ✗ " + m + (d ? ` — ${d}` : "")); };
const jpost = async (p, b) => { const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

console.log(`\nMarketWar OS live-smoke → ${BASE}${EXERCISE ? "  (exercise: real calls, small spend)" : "  (pre-flight only)"}\n`);

// 1) Readiness matrix (safe).
let health;
try {
  const r = await fetch(BASE + "/api/health/live");
  health = await r.json();
  if (r.status !== 200 || !Array.isArray(health.capabilities)) { bad("GET /api/health/live", `HTTP ${r.status}`); }
  else {
    console.log(`Readiness: ${health.liveReady}/${health.total} live${health.allDemo ? " (all demo)" : ""}`);
    for (const c of health.capabilities) console.log(`  ${c.ready ? "✓ live " : "○ demo "} ${c.capability}${c.ready ? "" : `  — set: ${c.activates}`}`);
    ok("readiness matrix fetched");
  }
} catch (e) { bad("GET /api/health/live", e.message); }

const ready = (name) => (health?.capabilities || []).find((c) => c.capability.startsWith(name))?.ready;

if (EXERCISE && health) {
  console.log("\nExercising live paths:");

  // Image generate — if hosting is ready, the URL must be a hosted https PNG.
  try {
    const { status, body } = await jpost("/api/image", { action: "generate", business: "Live Smoke Co", headline: "Live check", variants: 1 });
    const url = body.variants?.[0]?.imageUrl || "";
    const hosted = /^https:\/\//.test(url);
    if (status !== 200) bad("image generate", `HTTP ${status}`);
    else if (ready("Media hosting") && !hosted) bad("image hosted URL", `hosting is live but URL is not hosted: ${url.slice(0, 40)}`);
    else ok(`image generate (${hosted ? "hosted PNG" : "inline preview"}, mode ${body.variants?.[0]?.mode})`);
  } catch (e) { bad("image generate", e.message); }

  // Video render start — if a video model is live, expect a rendering job.
  try {
    const { status, body } = await jpost("/api/video-render", { action: "start", brandId: "live-smoke", prompt: "6s vertical product clip, cinematic" });
    if (status !== 200) bad("video render start", `HTTP ${status}`);
    else if (ready("Video render (Veo/Sora)") && body.status !== "rendering") bad("video render live", `video model live but status is ${body.status}`);
    else ok(`video render start (status ${body.status}, provider ${body.provider})`);
  } catch (e) { bad("video render start", e.message); }

  // Zernio connect link — if publishing is live, expect a live connect link.
  try {
    const { status, body } = await jpost("/api/zernio", { action: "connect", brandId: "live-smoke", brandName: "Live Smoke Co" });
    if (status !== 200) bad("zernio connect", `HTTP ${status}`);
    else if (ready("Social publishing") && body.mode !== "live") bad("zernio connect live", `publishing live but connect mode is ${body.mode}`);
    else ok(`zernio connect (${body.mode} link)`);
  } catch (e) { bad("zernio connect", e.message); }

  console.log("\n(Note: real social publishing is intentionally NOT exercised — connect a brand's socials in the Publish Center and post one manually to confirm delivery.)");
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
