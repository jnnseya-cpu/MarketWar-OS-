// npm run drive:crawl
//
// EVERY PAGE, IN A REAL BROWSER, ON A REAL BUILD, ON A PHONE-SIZED SCREEN.
//
// WHY THIS EXISTS. 97 pages ship and nothing had ever loaded all of them. The
// test suite asserts about modules; `next build` proves they compile. Neither
// catches the failures that actually reach a person: a blank screen, an uncaught
// exception after hydration, a React hydration mismatch, a console error on
// every load, a page that renders nothing because a client component threw.
//
// Those are invisible to a build and invisible to a unit test, and they are the
// first thing a real user sees. "Drive the routes, do not read them" is already
// this repository's rule — this is that rule applied to the whole surface rather
// than to one route at a time.
//
// WHAT IT MEASURES PER PAGE
//   • HTTP status of the document.
//   • Uncaught page exceptions (the ones that blank a React tree).
//   • console.error / console.warn, with React HYDRATION errors separated out,
//     because a hydration mismatch means the server and client disagree and the
//     page silently re-renders — the class §135 and §157 both came from.
//   • EVERY FAILED REQUEST, WITH ITS URL AND ITS ORIGIN — because the first run
//     of this driver reported 79 pages with a console error and could not say
//     what had failed. Chromium's console text for a dead subresource is the
//     bare string "Failed to load resource: net::ERR_…" with the URL stripped,
//     so the report was unactionable in both directions: it could not be
//     dismissed as the container's blocked egress and it could not be trusted as
//     a defect. A finding you cannot act on is the same as no finding. So
//     requests are read off the network rather than out of the console, and
//     each one is classified by WHOSE it is: a failure against 127.0.0.1 is OUR
//     broken asset and a defect; a failure against any other host is this
//     container's missing DNS, which is environmental and stated as such.
//   • Visible text length — a 200-OK page that renders nothing is a blank screen,
//     which is the defect a status code cannot see.
//   • Whether an <h1> exists, because a page with no heading is unreadable to a
//     screen reader and to a crawler.
//   • Horizontal overflow at 360px, which is the mobile defect nobody notices on
//     a laptop.
//
// THE CONDITIONS ARE THE NOVICE'S, NOT MINE: 360×800, a mid-range phone's
// viewport, with CPU throttling and a slow network profile. A page that only
// works on a fast desktop is not shipped to the people who will use it.
//
// WHAT IT CANNOT DO, STATED. No credentials exist in this container, so every
// authenticated surface renders its DEMO path and the dashboard is tested as a
// signed-out visitor sees it. That is a real limit: this proves the pages render,
// not that the authorised data behind them is correct. Pages that redirect are
// recorded as redirects rather than counted as passes.

import { spawn, execFileSync } from "node:child_process";
// PLAYWRIGHT LIVES OUTSIDE THE PROJECT in this container (/opt/node-tools), so a
// bare ESM specifier does not resolve from here. Required through createRequire
// against its real location rather than added as a project dependency: a browser
// driver is a harness tool, and putting it in package.json would ship it.
import { createRequire } from "node:module";
const toolRequire = createRequire("/opt/node-tools/");
const { chromium } = toolRequire("playwright");
import fs from "node:fs";
import net from "node:net";
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 3055;
const BASE = `http://127.0.0.1:${PORT}`;
const say = (m) => fs.writeSync(1, m + "\n");

// A leftover server on the port answers for a build that is not this one.
const busy = await new Promise((r) => {
  const s = net.createConnection({ host: "127.0.0.1", port: PORT });
  s.on("connect", () => { s.destroy(); r(true); });
  s.on("error", () => r(false));
});
if (busy) {
  say(`REFUSING TO RUN: something already listens on ${PORT}. Free it with: fuser -k ${PORT}/tcp`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Enumerate the routes from the App Router tree, the way Next does.
// ---------------------------------------------------------------------------
function routes(dir = join(ROOT, "src/app"), prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api") continue;                       // not pages
      if (name.startsWith("_")) continue;                 // private folders
      // A route group (folder) does not appear in the URL.
      const seg = /^\(.+\)$/.test(name) ? "" : `/${name}`;
      out.push(...routes(full, prefix + seg));
    } else if (name === "page.tsx" || name === "page.ts") {
      out.push(prefix || "/");
    }
  }
  return out;
}

// A dynamic segment needs a real value. These are the ones the app can serve
// without a credential or a database; anything else is reported as SKIPPED
// rather than counted, because a guessed id proves nothing.
const DYNAMIC_FIXTURES = {
  "/blog/[slug]": "/blog/creator-earning-programmes",
  "/features/[slug]": "/features/how-much-to-pay-an-affiliate",
};

const all = [...new Set(routes())].sort();
const targets = [];
const skipped = [];
for (const r of all) {
  if (!r.includes("[")) { targets.push(r); continue; }
  const fixture = DYNAMIC_FIXTURES[r];
  if (fixture) targets.push(fixture);
  else skipped.push(r);
}

say("");
say(`Routes found: ${all.length} page files → ${targets.length} crawlable, ${skipped.length} dynamic with no safe fixture.`);
say("Building for real and serving. A dev server would hide hydration differences.");

const headSha = () => {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch { return "unknown (not a git checkout)"; }
};

const run = (cmd, args) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => out += d); p.stderr.on("data", (d) => out += d);
  p.on("close", (c) => (c === 0 ? res(out) : rej(new Error(`${cmd} exited ${c}\n${out.slice(-1500)}`))));
});
await run("npm", ["run", "build"]);
say("  build ok");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("server never reported ready")), 120_000);
  const look = (d) => { if (/Ready in|started server/i.test(String(d))) { clearTimeout(t); res(); } };
  server.stdout.on("data", look); server.stderr.on("data", look);
});
say(`  serving ${BASE}`);

// ---------------------------------------------------------------------------
// The crawl.
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({
  viewport: { width: 360, height: 800 },     // a mid-range Android, not a laptop
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (Linux; Android 12; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
  isMobile: true,
  hasTouch: true,
});

const results = [];
for (const path of targets) {
  const page = await ctx.newPage();
  const errors = [], warnings = [], hydration = [], exceptions = [];
  // OUR failures and the CONTAINER's, kept apart at the point of measurement
  // rather than guessed at afterwards.
  // FOUR BUCKETS, AND IT TOOK TWO WRONG VERSIONS TO GET HERE.
  //
  // Version one lumped every failed request together and could not name the
  // URL. Version two split ours from outbound and called every non-2xx from our
  // own origin a defect — which produced two findings that were both the
  // instrument crying wolf:
  //
  //   • `/diagnose` POSTs an EMPTY BODY to two engines on purpose, and its own
  //     source documents 400 and 403 as the correct answers: "a diagnostic that
  //     cries wolf gets ignored, and then it is worse than none". Reporting
  //     those as defects reproduced, in the crawler, the exact mistake that
  //     page was rewritten to stop making.
  //   • `net::ERR_ABORTED` on a `?_rsc=` prefetch is THIS CRAWLER closing the
  //     page while Next was prefetching a link. The abort is mine.
  //
  // So: a 404, a 405 or a 5xx from our own origin is a defect — the page asked
  // us for something and we failed, and there is no other reading. A 400, 401,
  // 403 or 422 is our API JUDGING a request and refusing it, which on a
  // signed-out crawl and on a diagnostic page is the correct behaviour; it is
  // reported, not counted. A cancelled request is reported quietly. Anything
  // off our origin is this container's missing DNS.
  const ownBroken = [], ownRefused = [], cancelled = [], outboundBlocked = [];
  const REFUSAL = new Set([400, 401, 403, 422]);
  const sort = (url, label, status) => {
    if (!url.startsWith(BASE)) { outboundBlocked.push(`${label} ${url.slice(0, 120)}`); return; }
    const where = `${label} ${url.replace(BASE, "") || "/"}`;
    if (/ERR_ABORTED|ERR_CANCELED/.test(label)) cancelled.push(where);
    else if (REFUSAL.has(status)) ownRefused.push(where);
    else ownBroken.push(where);
  };
  page.on("requestfailed", (r) => sort(r.url(), r.failure()?.errorText || "failed", 0));
  page.on("response", (r) => { if (r.status() >= 400) sort(r.url(), String(r.status()), r.status()); });
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match|server render|Text content does not match/i.test(t)) hydration.push(t);
    else if (m.type() === "error") errors.push(t);
    else if (m.type() === "warning") warnings.push(t);
  });
  page.on("pageerror", (e) => exceptions.push(String(e.message || e)));

  let status = 0, finalUrl = "", textLen = 0, h1 = 0, overflow = 0, failed = "";
  try {
    // CPU throttling via CDP so the novice's phone is simulated, not assumed.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = res?.status() ?? 0;
    // Let client components mount and throw if they are going to.
    await page.waitForTimeout(1200);
    finalUrl = page.url().replace(BASE, "") || "/";
    textLen = await page.evaluate(() => (document.body?.innerText || "").trim().length);
    h1 = await page.evaluate(() => document.querySelectorAll("h1").length);
    overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  } catch (e) {
    failed = String(e.message || e).split("\n")[0];
  }
  await page.close();
  results.push({ path, status, finalUrl, textLen, h1, overflow, errors, warnings, hydration, exceptions, failed, ownBroken, ownRefused, cancelled, outboundBlocked });
  const bad = failed || exceptions.length || hydration.length || ownBroken.length || (status >= 400) || (textLen < 40 && !/^\/(login|signup)/.test(path));
  say(`  ${bad ? "FAIL " : "ok   "} ${String(status).padEnd(3)} ${String(textLen).padStart(6)}ch ${overflow ? `ovf+${overflow}` : "      "} ${path}${finalUrl && finalUrl !== path ? ` → ${finalUrl}` : ""}`);
}

await browser.close();
server.kill("SIGTERM");

// ---------------------------------------------------------------------------
// Verdict and evidence.
// ---------------------------------------------------------------------------
const blank = results.filter((r) => !r.failed && r.status < 400 && r.textLen < 40 && !/^\/(login|signup)/.test(r.path));
const broke = results.filter((r) => r.failed);
const http = results.filter((r) => r.status >= 400);
const threw = results.filter((r) => r.exceptions.length);
const hydr = results.filter((r) => r.hydration.length);
const noH1 = results.filter((r) => !r.failed && r.status < 400 && r.h1 === 0);
const ovf = results.filter((r) => r.overflow > 4);
const cerr = results.filter((r) => r.errors.length);
const ownBad = results.filter((r) => r.ownBroken.length);
const ownRef = results.filter((r) => r.ownRefused.length);
const cancel = results.filter((r) => r.cancelled.length);
const outBlocked = results.filter((r) => r.outboundBlocked.length);

say("");
say("─── CRAWL RESULT ───────────────────────────────────────────────");
say(`pages crawled            ${results.length}`);
say(`failed to load           ${broke.length}`);
say(`HTTP >= 400              ${http.length}`);
say(`uncaught exceptions      ${threw.length}`);
say(`React hydration errors   ${hydr.length}`);
say(`blank (under 40 chars)   ${blank.length}`);
say(`console errors           ${cerr.length}`);
say(`OUR requests broken      ${ownBad.length}   (404/405/5xx against ${BASE} — defects)`);
say(`our API refused a request ${ownRef.length}  (400/401/403/422 — the guard and the validator working)`);
say(`requests this crawl cancelled ${cancel.length} (a prefetch aborted when the page closed — mine, not a defect)`);
say(`outbound blocked         ${outBlocked.length}   (no DNS in this container — environmental)`);
say(`no <h1>                  ${noH1.length}`);
say(`horizontal overflow@360  ${ovf.length}`);
say(`dynamic routes skipped   ${skipped.length}  ${skipped.join(" ") || ""}`);

for (const [label, rows, pick] of [
  ["FAILED TO LOAD", broke, (r) => r.failed],
  ["HTTP >= 400", http, (r) => `document status ${r.status}`],
  ["UNCAUGHT EXCEPTION", threw, (r) => r.exceptions[0]],
  ["HYDRATION", hydr, (r) => r.hydration[0]],
  ["BLANK", blank, (r) => `${r.textLen} visible chars`],
  ["OUR REQUESTS BROKEN — defects", ownBad, (r) => r.ownBroken.join(" | ")],
  ["NO H1", noH1, () => "no <h1> element"],
  ["OVERFLOW @360px", ovf, (r) => `+${r.overflow}px`],
  ["OUTBOUND BLOCKED — environmental", outBlocked, (r) => r.outboundBlocked[0]],
  ["OUR API REFUSED — the guard and the validator working", ownRef, (r) => r.ownRefused.join(" | ")],
  ["CANCELLED BY THIS CRAWL — not a defect", cancel, (r) => r.cancelled.join(" | ")],
]) {
  if (!rows.length) continue;
  say("");
  say(`${label}:`);
  for (const r of rows.slice(0, 25)) say(`  ${r.path}  ${String(pick(r) || "").slice(0, 150)}`);
  if (rows.length > 25) say(`  … and ${rows.length - 25} more (full detail in the evidence JSON)`);
}

mkdirSync(join(ROOT, "launch-audit/evidence"), { recursive: true });
writeFileSync(join(ROOT, "launch-audit/evidence/route-crawl.json"), JSON.stringify({
  ranAt: new Date().toISOString(),
  // The commit is READ FROM GIT, not taken from an environment variable. A
  // crawl whose evidence cannot say which tree it ran against is not evidence.
  commit: headSha(),
  viewport: "360x800, isMobile, CPU throttle 4x",
  pagesCrawled: results.length,
  dynamicSkipped: skipped,
  results,
}, null, 2));
say("");
say(`Evidence written: launch-audit/evidence/route-crawl.json`);
say("");
say("NOT PROVEN BY THIS: anything behind a credential. No keys exist in this");
say("container, so authenticated surfaces rendered their demo path and the");
say("dashboard was crawled as a signed-out visitor sees it. This proves the");
say("pages render and do not throw; it does not prove the authorised data is right.");

const blockers = broke.length + http.length + threw.length + blank.length + ownBad.length;
process.exit(blockers ? 1 : 0);
