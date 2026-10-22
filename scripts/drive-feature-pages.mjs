// npm run drive:pages
//
// THE ANSWER PAGES, SERVED — not asserted about, served and read back.
//
// WHY A DRIVER AND NOT JUST THE TESTS. The contract tests in
// `tests/features.test.mjs` check the DATA: that every page is titled as a
// question, carries a proof and a limit, and declares links that resolve. All
// of that can be true of a page that 404s. Adding an entry to `FEATURE_PAGES`
// is supposed to ship a complete, indexable page — static params, metadata,
// FAQ schema, breadcrumb, canonical, the hub and the sitemap are all derived
// from that one array — and "supposed to" is the word this repository has been
// caught by before. So this starts a REAL production build and reads every
// page back over a socket.
//
// WHAT IT CHECKS, AND WHY EACH ONE EARNS ITS PLACE:
//
//   • 200 for every slug. A page in the array that is not routed is an entry
//     in a sitemap pointing at a 404, which is worse than no page at all.
//   • The hub links to every page. The hub is how a crawler reaches them; an
//     unlinked page is an orphan nobody finds and nobody reads.
//   • The sitemap contains every URL, and no URL the sitemap claims is dead.
//   • FAQPage JSON-LD on every page, carrying that page's OWN questions. A
//     schema block that is present but belongs to a different page is the
//     failure a source assertion cannot see.
//   • A canonical, and NOT noindex — §161 in this repository was precisely a
//     set of pages the site invited crawlers to and then refused.
//   • The meta description inside the 50–165 character band the platform's own
//     audit publishes. We score customers on this; failing it on our own
//     selling pages is the "we fail the checks we sell" defect.
//   • Every engine in the registry is accounted for by the coverage ledger.
//
// NO NETWORK BEYOND LOCALHOST. The build and the server are local, so this runs
// in a container with no DNS. What it cannot do is tell you whether the pages
// RANK — that is months of other people's behaviour, and no driver measures it.

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const PORT = 3041;
const BASE = `http://127.0.0.1:${PORT}`;

// A LEFTOVER SERVER ON THE SAME PORT IS A WRONG ANSWER, NOT A CONVENIENCE.
// §161's driver audited a stale build for a whole cycle and reported two
// already-fixed pages as broken. Refuse the port rather than trust it.
const portBusy = await new Promise((resolve) => {
  const s = net.createConnection({ host: "127.0.0.1", port: PORT });
  s.on("connect", () => { s.destroy(); resolve(true); });
  s.on("error", () => resolve(false));
});
if (portBusy) {
  say(`\nREFUSING TO RUN: something is already listening on ${PORT}.`);
  say(`Whatever answers there is not necessarily the build of this working tree,`);
  say(`and auditing a stale server is how a fixed page gets reported as broken.`);
  say(`Free it with:  fuser -k ${PORT}/tcp`);
  process.exit(2);
}

const { FEATURE_PAGES } = await import("../src/shared/feature-pages.ts");
const { featureCoverage } = await import("../src/shared/feature-coverage.ts");
// The bounds come from the module the CRAWLER reads, so this driver and the
// product it audits cannot disagree about what passing means.
const { titleOk, descriptionOk, descriptionThin, TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX, DESC_THIN } =
  await import("../src/shared/seo-limits.ts");

say("");
say(`Building for real (next build), then serving on ${PORT}. This is slow on purpose:`);
say("a dev server would not prove the pages are statically generated.");

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { out += d; });
  p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}\n${out.slice(-2000)}`))));
});

await run("npm", ["run", "build"]);
say("  build ok");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"],
});
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("the server never reported ready")), 90_000);
  const look = (d) => { if (/Ready in|started server/i.test(String(d))) { clearTimeout(timer); resolve(); } };
  server.stdout.on("data", look);
  server.stderr.on("data", look);
});
await ready;
say(`  serving on ${BASE}`);

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { status: res.status, body: await res.text() };
};

try {
  // ───────────────────────────────────────────────────────────────────────────
  say("");
  say(`1. EVERY PAGE IS SERVED. ${FEATURE_PAGES.length} entries in the array.`);
  const failed = [];
  const bodies = new Map();
  for (const p of FEATURE_PAGES) {
    const r = await get(`/features/${p.slug}`);
    bodies.set(p.slug, r.body);
    if (r.status !== 200) failed.push(`${p.slug} → ${r.status}`);
  }
  check(`all ${FEATURE_PAGES.length} answer pages return 200`, failed.length === 0, failed.join(", ") || "none dead");

  // ───────────────────────────────────────────────────────────────────────────
  say("");
  say("2. THE HUB REACHES THEM. An unlinked page is an orphan.");
  const hub = await get("/features");
  check("the hub is served", hub.status === 200, `HTTP ${hub.status}`);
  const unlinked = FEATURE_PAGES.filter((p) => !hub.body.includes(`/features/${p.slug}`));
  check("the hub links to every page", unlinked.length === 0, unlinked.map((p) => p.slug).join(", ") || "none orphaned");
  // The new pages introduced new categories; the hub groups by category, so a
  // page in a category the hub does not render would vanish silently.
  const cats = [...new Set(FEATURE_PAGES.map((p) => p.category))];
  const missingCats = cats.filter((c) => !hub.body.includes(c));
  check(`all ${cats.length} categories appear on the hub`, missingCats.length === 0, missingCats.join(", ") || "all rendered");

  // ───────────────────────────────────────────────────────────────────────────
  say("");
  say("3. THE SITEMAP AGREES WITH WHAT IS SERVED, IN BOTH DIRECTIONS.");
  const sm = await get("/sitemap.xml");
  check("the sitemap is served", sm.status === 200, `HTTP ${sm.status}`);
  const absent = FEATURE_PAGES.filter((p) => !sm.body.includes(`/features/${p.slug}`));
  check("every answer page is in the sitemap", absent.length === 0, absent.map((p) => p.slug).join(", ") || "all present");
  const claimed = [...sm.body.matchAll(/<loc>[^<]*\/features\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  const slugs = new Set(FEATURE_PAGES.map((p) => p.slug));
  const ghosts = claimed.filter((s) => !slugs.has(s));
  check("the sitemap claims no page that does not exist", ghosts.length === 0, ghosts.join(", ") || "no ghosts");

  // ───────────────────────────────────────────────────────────────────────────
  say("");
  say("4. THE SCHEMA ON EACH PAGE IS THAT PAGE'S OWN.");
  const noFaq = [], wrongFaq = [], noCanon = [], noindexed = [];
  for (const p of FEATURE_PAGES) {
    const html = bodies.get(p.slug) || "";
    if (!/"@type"\s*:\s*"FAQPage"/.test(html)) { noFaq.push(p.slug); continue; }
    // ITS OWN QUESTIONS, not merely a FAQPage block. A correct-looking block
    // carrying another page's questions is exactly the class of defect that a
    // "does it contain FAQPage" assertion cannot see.
    const first = p.faq[0].q.replace(/[.?]$/, "").slice(0, 40);
    if (!html.includes(first.replace(/&/g, "&amp;"))) wrongFaq.push(p.slug);
    if (!/rel="canonical"/.test(html)) noCanon.push(p.slug);
    if (/name="robots"[^>]*noindex/i.test(html)) noindexed.push(p.slug);
  }
  check("every page carries FAQPage JSON-LD", noFaq.length === 0, noFaq.join(", ") || "all present");
  check("…carrying that page's own first question", wrongFaq.length === 0, wrongFaq.join(", ") || "all match");
  check("every page declares a canonical", noCanon.length === 0, noCanon.join(", ") || "all declared");
  check("no page invites a crawler and then refuses it (noindex)", noindexed.length === 0, noindexed.join(", ") || "none noindexed");

  // ───────────────────────────────────────────────────────────────────────────
  say("");
  say("5. WE PASS THE CHECK WE SELL — against the audit's OWN numbers.");
  say("   My first version of this section TYPED the band as 50–165 and the");
  say("   title bound as 70. Both were wrong in the direction that matters:");
  say("   `shared/seo-limits.ts` says TITLE_MAX is 65, and typing a threshold");
  say("   into a check is how a guard keeps passing after the rule moves.");
  const bad = FEATURE_PAGES.filter((p) => !descriptionOk(p.description)).map((p) => `${p.slug} (${p.description.length})`);
  check(`every description is inside ${DESC_MIN}-${DESC_MAX}, the band the audit scores`, bad.length === 0, bad.join(", ") || `all inside ${DESC_MIN}–${DESC_MAX}`);
  const thin = FEATURE_PAGES.filter((p) => descriptionThin(p.description)).map((p) => `${p.slug} (${p.description.length})`);
  check(`none is legal but thin (under ${DESC_THIN})`, thin.length === 0, thin.join(", ") || "all earning the snippet");
  const titleLong = FEATURE_PAGES.filter((p) => !titleOk(p.title)).map((p) => `${p.slug} (${p.title.length})`);
  check(`no title is outside ${TITLE_MIN}-${TITLE_MAX}`, titleLong.length === 0, titleLong.join(", ") || `all inside ${TITLE_MIN}–${TITLE_MAX}`);

  // AND WHAT IS SERVED IS CLAMPED, which is a different claim from the data
  // being short: a future page whose author did not count must still not serve
  // a truncated snippet. Read off the HTML rather than the array.
  const overLong = [];
  for (const p of FEATURE_PAGES) {
    const html = bodies.get(p.slug) || "";
    const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || "";
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || "";
    if (desc.length > DESC_MAX || title.length > TITLE_MAX) overLong.push(`${p.slug} (t${title.length}/d${desc.length})`);
  }
  check("the SERVED title and description are inside the bounds too", overLong.length === 0, overLong.join(", ") || "every page as served");

  // ───────────────────────────────────────────────────────────────────────────
  say("");
  say("6. EVERY FEATURE IS ACCOUNTED FOR — sold, or recorded as not sold.");
  const cov = featureCoverage();
  check("no engine is unaccounted for", cov.unaccounted.length === 0, cov.unaccounted.join(", ") || "none");
  check("no page claims an engine that does not exist", cov.orphanPages.length === 0, cov.orphanPages.join(", ") || "none");
  say(`  ${cov.line}`);

  say("");
  say(`RESULT: ${proven} proven, ${broken} broken.`);
  say("");
  say("NOT PROVEN HERE, and nobody should read it as proven: whether any of these");
  say("pages RANK, or get cited by an assistant. That is months of other people's");
  say("behaviour and no driver measures it. What is proven is that each page is");
  say("served, reachable, in the sitemap, carrying its own schema, and passing the");
  say("same description check this platform charges customers to run on their site.");
} finally {
  server.kill("SIGTERM");
}
process.exit(broken ? 1 : 0);
