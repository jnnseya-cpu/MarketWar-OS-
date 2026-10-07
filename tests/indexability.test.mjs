import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

// WHY GOOGLE IS OR IS NOT INDEXING A PAGE, ASSERTED RATHER THAN DISCOVERED.
//
// Search Console reported "Excluded by 'noindex' tag" as a NEW reason. It was
// correct and it was intentional — four pages carry `robots: { index: false }`
// on purpose. But the reason it is worth a test is the shape of the mistake
// waiting on either side of it:
//
//   • A marketing page acquiring `index: false` by accident. Silent, total, and
//     discovered weeks later through a traffic graph. `/` or `/audit` going
//     noindex would take the whole funnel off Google with nothing in the build
//     to notice.
//
//   • "Fixing" this notice by adding the pages to robots.txt — which is the
//     obvious move and is WRONG. Google has to CRAWL a page to see its noindex.
//     Disallow it and the crawler never reads the tag, so the URL can stay in
//     the index with no content under it ("Indexed, though blocked by
//     robots.txt") — the opposite of what was wanted, and harder to undo.
//
//   • A noindexed URL listed in the sitemap: telling Google to go and fetch
//     something you have told it not to index. That contradiction is the most
//     common cause of this exact report.
//
// All three are checkable from the source, so none of them needs to be found in
// Search Console six weeks later.

const APP = "src/app";

/** Every route whose page or layout declares `index: false`. */
function noindexRoutes() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/^(page|layout)\.tsx$/.test(name)) continue;
      const src = readFileSync(p, "utf8");
      // Strip comments: this file and the pages themselves discuss `index: false`
      // in prose, and a test that fails on its own commentary is a defect this
      // repository has shipped eight times.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // `NOINDEX_METADATA` IS THE SAME DECLARATION BY ANOTHER NAME. §161 moved
      // the literal into `shared/robots-policy.ts` so the policy, the published
      // robots.txt and the audit cannot disagree — and a detector that only
      // matched the inline form would silently stop seeing every page that uses
      // it, which is precisely the blind spot this scan exists to close.
      if (/robots:\s*\{[^}]*index:\s*false/.test(code) || /robots:\s*NOINDEX_METADATA/.test(code)) {
        found.push(p.slice(APP.length).replace(/\/(page|layout)\.tsx$/, "") || "/");
      }
    }
  };
  walk(APP);
  return found.sort();
}

/**
 * The complete list, with the reason each one is not for searchers.
 *
 * A NEW ENTRY HERE IS A DELIBERATE ACT. That is the point: adding `index: false`
 * to a page fails this test until somebody writes down why, which is exactly the
 * moment to notice it was added to a page that sells.
 */
const INTENTIONALLY_NOINDEX = {
  "/unsubscribe": "Acts on a token in the URL the moment it loads. A confirmation page has no value to a searcher and every value to a crawler looking for links to fetch.",
  "/verify-human": "A challenge page. Indexing it puts a dead end in the results where a landing page should be.",
  "/diagnose": "An operator tool that reports this deployment's own configuration.",
  "/portal/[token]": "A signed, expiring client link. Indexing it would publish one customer's approval view.",
  // ADDED BY §161, and each one REPLACED a robots.txt Disallow rather than
  // joining it. Search Console reported "Blocked by robots.txt" because the
  // marketing header and six landing pages link to the first two — so Google was
  // invited to a page the site then refused to serve. A disallow does not mean
  // "keep this out of the index"; it means "do not fetch this", which is why
  // this file's second test exists.
  "/login": "An authentication form, linked from the public header on every page. Nothing to rank, and it must be crawlable for this noindex to be read at all.",
  "/signup": "The same, and the most-linked page on the site after the home page — seven links from six landing pages.",
  "/onboarding": "A signed-in wizard reached after sign-up. The noindex is on its layout because the page is `use client` and a client component cannot export metadata.",
  "/dashboard": "The signed-in command centre, linked from /choose-plan as the demo. `Disallow: /dashboard/` matches sub-paths ONLY, so the index page was crawlable and indexable for as long as that rule has existed — this is what keeps it out.",
};

test("exactly the pages meant to be hidden are hidden — and nothing else", () => {
  assert.deepEqual(noindexRoutes(), Object.keys(INTENTIONALLY_NOINDEX).sort(),
    "a page gained or lost `robots: { index: false }`. If that was deliberate, record the reason in "
    + "INTENTIONALLY_NOINDEX; if it was not, a page that should be selling is invisible to Google.");
});

test("no noindexed page is also blocked in robots.txt", () => {
  // THE TRAP. Blocking a page you want de-indexed stops the crawler reading the
  // very tag that de-indexes it, and Google can keep the bare URL in the index.
  // "Excluded by 'noindex' tag" is the HEALTHY end state for these four; a
  // Disallow would replace it with a worse one.
  // THE LIST MOVED in §161: `app/robots.ts` maps over `ROBOTS_DISALLOW` so the
  // audit and the published file read one source. Reading the old literal array
  // here would find nothing and this test would pass by examining an empty list
  // — the failure mode it is written to prevent, one level up.
  const policy = readFileSync("src/shared/robots-policy.ts", "utf8");
  const section = policy.slice(policy.indexOf("ROBOTS_DISALLOW"), policy.indexOf("NOINDEX_PATHS"));
  const disallow = [...section.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(disallow.length, "the policy must still disallow the private surfaces");
  assert.match(readFileSync("src/app/robots.ts", "utf8"), /ROBOTS_DISALLOW\.map/,
    "and the published file must be built from it, or this checks a list nothing serves");

  for (const route of Object.keys(INTENTIONALLY_NOINDEX)) {
    const path = route.replace(/\/\[.*$/, "/");
    const blocked = disallow.find((d) => path === d || path.startsWith(d));
    assert.equal(blocked, undefined,
      `${route} is noindexed AND disallowed by "${blocked}". Google cannot read a noindex on a page it is not `
      + "allowed to fetch, so the URL can stay indexed with no content under it. Keep the noindex, drop the Disallow.");
  }
});

test("nothing in the sitemap is noindexed", () => {
  // Telling Google to crawl a page you have told it not to index is a direct
  // contradiction, and it is the usual cause of this Search Console report.
  const sitemap = readFileSync("src/app/sitemap.ts", "utf8");
  const listed = [...sitemap.matchAll(/\{\s*path:\s*"([^"]*)"/g)].map((m) => m[1] || "/");
  assert.ok(listed.length > 10, "the sitemap's static list could not be read");

  const hidden = new Set(Object.keys(INTENTIONALLY_NOINDEX));
  for (const path of listed) {
    assert.ok(!hidden.has(path || "/"),
      `${path} is in the sitemap and carries noindex. Pick one: it is either worth finding or it is not.`);
  }
});

test("the pages that sell are in the sitemap and carry no noindex", () => {
  // The positive form. The tests above would still pass if the sitemap were
  // emptied, so this names the pages whose disappearance would actually cost
  // something and checks they are offered to Google.
  const sitemap = readFileSync("src/app/sitemap.ts", "utf8");
  const listed = new Set([...sitemap.matchAll(/\{\s*path:\s*"([^"]*)"/g)].map((m) => m[1] || "/"));
  const hidden = new Set(Object.keys(INTENTIONALLY_NOINDEX));
  // The homepage is `path: ""` in the sitemap and `/` everywhere else; both
  // sides are normalised to `/` so the check is about the page rather than
  // about which spelling happened to be read first.
  for (const raw of ["", "/audit", "/features", "/how-it-works", "/choose-plan", "/get-started", "/blog"]) {
    const page = raw || "/";
    assert.ok(listed.has(page), `${page} is missing from the sitemap`);
    assert.ok(!hidden.has(page), `${page} must never be noindexed`);
  }
});

test("no blanket noindex is applied by a header anywhere", () => {
  // A single `X-Robots-Tag: noindex` in middleware or next.config would take the
  // whole site out of the index while every page's own metadata still said
  // index — and the metadata is where anybody would look first.
  for (const f of ["next.config.mjs", "src/middleware.ts"]) {
    const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /X-Robots-Tag/i,
      `${f} sets X-Robots-Tag. A header overrides nothing visible in the page source and is the hardest kind of `
      + "de-indexing to find.");
  }
});

// ---------------------------------------------------------------------------
// §161 — "BLOCKED BY ROBOTS.TXT", and the audit that answers it without a console
//
// The five tests above came first (§160's noindex report) and they stay exactly
// as they were, with three updates where §161 legitimately moved the ground
// under them: the detector now also recognises `robots: NOINDEX_METADATA`, the
// disallow list is read from the policy rather than from a literal array that no
// longer exists, and the four paths §161 un-blocked are recorded as intentional
// with their reasons.
//
// What follows is the new half: the rule that a path an indexable page LINKS TO
// is crawlable with `noindex, follow` and never robots-blocked, and the audit
// (`backend/indexability.ts`) that proves both halves hold against the real
// published file and the real links on the real pages.
//
// NO NETWORK HERE EITHER. The audit takes an injected `fetchImpl`, so every case
// is a constructed site; the real running build is driven in `npm run drive:index`.
//
// MUTATION TESTED: 15 mutants, all killed. ONE SURVIVED FIRST and it is worth the
// line: the noindex check matched `NOINDEX_METADATA` anywhere in the file, which
// the IMPORT satisfies — so deleting the metadata and leaving the import behind
// left it green. It matches `robots: NOINDEX_METADATA` now. Second time this
// session a presence assertion has been satisfied by prose rather than code.
// ---------------------------------------------------------------------------

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const site = (pages) => async (url) => {
  const key = Object.keys(pages).find((k) => url === k || url.endsWith(k));
  return key ? { ok: true, status: 200, text: pages[key] } : { ok: false, status: 404, text: "" };
};

const ORIGIN = "https://example.test";
const sitemapOf = (...paths) =>
  `<urlset>${paths.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join("")}</urlset>`;

test("the policy and the published robots.txt cannot disagree", async () => {
  // ONE SOURCE OF TRUTH. Two copies of a disallow list is the defect this
  // codebase produces most often, and an audit reading a stale copy would
  // certify a file it had never seen.
  const robots = codeOf(readFileSync("src/app/robots.ts", "utf8"));
  assert.match(robots, /from "@\/shared\/robots-policy"/);
  assert.match(robots, /disallow: ROBOTS_DISALLOW\.map\(\(r\) => r\.path\)/);
  assert.doesNotMatch(robots, /disallow: \[/, "the list must not be written here as well");

  const { ROBOTS_DISALLOW, NOINDEX_PATHS } = await import("../src/shared/robots-policy.ts");
  // THE TWO SETS MUST NOT OVERLAP. A path that is both blocked and noindex is
  // the contradiction where the instruction can never be read.
  for (const n of NOINDEX_PATHS) {
    assert.ok(!ROBOTS_DISALLOW.some((r) => n.path === r.path || n.path.startsWith(r.path)),
      `${n.path} is declared noindex AND blocked — the noindex could never be read`);
  }
  // Every rule carries a reason, because the audit prints it.
  for (const r of ROBOTS_DISALLOW) assert.ok(r.reason.length > 40, `${r.path} needs a real reason`);
});

test("the three paths that caused the report are no longer blocked", async () => {
  const { ROBOTS_DISALLOW, NOINDEX_PATHS } = await import("../src/shared/robots-policy.ts");
  const paths = ROBOTS_DISALLOW.map((r) => r.path);
  for (const p of ["/login", "/signup", "/onboarding"]) {
    assert.ok(!paths.includes(p), `${p} must not be in the disallow list — it is linked from indexable pages`);
    assert.ok(NOINDEX_PATHS.some((n) => n.path === p), `${p} must be declared noindex instead`);
  }
  // And the ones that stay, because nothing public links to them.
  for (const p of ["/dashboard/", "/api/", "/r/"]) {
    assert.ok(paths.includes(p), `${p} must stay blocked`);
  }
});

test("each noindex page actually serves the header, with follow", async () => {
  // A POLICY NOTHING ENFORCES IS NOT A POLICY. `/login` and `/signup` had no
  // robots metadata at all — the only thing keeping them out of the index was
  // the robots block that Search Console was reporting.
  const { NOINDEX_PATHS } = await import("../src/shared/robots-policy.ts");
  const sources = {
    "/login": "src/app/login/page.tsx",
    "/signup": "src/app/signup/page.tsx",
    "/onboarding": "src/app/onboarding/layout.tsx",
    "/dashboard": "src/app/dashboard/layout.tsx",
  };
  for (const n of NOINDEX_PATHS) {
    const file = sources[n.path];
    assert.ok(file, `${n.path} is declared noindex but this test does not know where it is set`);
    const code = codeOf(readFileSync(file, "utf8"));
    // `robots:` IS PART OF THE PATTERN, and that is not pedantry. The first
    // version matched `NOINDEX_METADATA` anywhere in the file, which the IMPORT
    // LINE satisfies — so deleting the metadata and leaving the import behind
    // left this green. Mutation testing found it; the suite did not.
    assert.match(code, /robots: NOINDEX_METADATA/, `${file} must ASSIGN the shared noindex metadata, not merely import it`);
  }
  const { NOINDEX_METADATA } = await import("../src/shared/robots-policy.ts");
  assert.equal(NOINDEX_METADATA.index, false);
  assert.equal(NOINDEX_METADATA.follow, true,
    "follow keeps the link equity moving through to the pages that should rank");
});

test("`Disallow: /dashboard/` never covered `/dashboard` itself", async () => {
  // A ROBOTS PREFIX ENDING IN A SLASH MATCHES SUB-PATHS ONLY. The command
  // centre's index page was crawlable and indexable for as long as the rule has
  // existed, and /choose-plan links to it on purpose. Found by the audit, not by
  // reading the rule.
  const { parseRobots, robotsAllows } = await import("../src/backend/robots.ts");
  const file = parseRobots("User-agent: *\nAllow: /\nDisallow: /dashboard/\n");
  assert.equal(robotsAllows(file, "/dashboard/settings", "Googlebot").allowed, false);
  assert.equal(robotsAllows(file, "/dashboard", "Googlebot").allowed, true,
    "this is the gap — and it is why the layout carries a noindex");
  const layout = codeOf(readFileSync("src/app/dashboard/layout.tsx", "utf8"));
  assert.match(layout, /robots: NOINDEX_METADATA/);
});

test("the audit reports blocked-but-linked, which is what Google complains about", async () => {
  const { auditIndexability } = await import("../src/backend/indexability.ts");
  const report = await auditIndexability({
    origin: ORIGIN,
    maxPages: 5,
    fetchImpl: site({
      "/robots.txt": "User-agent: *\nAllow: /\nDisallow: /signup\nDisallow: /dashboard/\n",
      "/sitemap.xml": sitemapOf("/", "/audit"),
      [`${ORIGIN}/`]: `<html><body><a href="/signup">Start</a><a href="/features">Features</a></body></html>`,
      [`${ORIGIN}/audit`]: `<html><body><a href="/signup">Start</a></body></html>`,
    }),
  });
  const f = report.findings.find((x) => x.fault === "blocked_but_linked");
  assert.ok(f, report.note);
  assert.equal(f.path, "/signup");
  assert.equal(f.links, 2, "it counts the links — one is a tidy-up, six is a funnel");
  assert.equal(f.rule, "Disallow: /signup", "the rule that caused it travels with the finding");
  assert.match(f.remedy, /Disallow: \/signup/);
  assert.match(report.note, /Blocked by robots\.txt/, "it names the report it explains");
  // A link to an ALLOWED path is not a finding.
  assert.ok(!report.findings.some((x) => x.path === "/features"));
});

test("a nofollowed link is reported as a hint, never as a fix", async () => {
  // Google has documented nofollow as a HINT since 2019, so it lowers the odds
  // and does not settle it. Reporting it as fixed would be a claim we cannot make.
  const { auditIndexability } = await import("../src/backend/indexability.ts");
  const report = await auditIndexability({
    origin: ORIGIN, maxPages: 3,
    fetchImpl: site({
      "/robots.txt": "User-agent: *\nDisallow: /dashboard/\n",
      "/sitemap.xml": sitemapOf("/choose-plan"),
      [`${ORIGIN}/choose-plan`]: `<html><body><a href="/dashboard/x" rel="nofollow">demo</a></body></html>`,
    }),
  });
  const f = report.findings.find((x) => x.fault === "blocked_but_linked");
  assert.equal(f.allNofollowed, true);
  assert.match(f.remedy, /hint rather than an instruction/);
});

test("a link from a noindex page is NOT a coverage finding", async () => {
  // A page Google will not index cannot produce a coverage report about its
  // target. Counting those would fill the report with noise and bury the real one.
  const { auditIndexability } = await import("../src/backend/indexability.ts");
  const report = await auditIndexability({
    origin: ORIGIN, maxPages: 3,
    fetchImpl: site({
      "/robots.txt": "User-agent: *\nAllow: /\nDisallow: /api/\n",
      "/sitemap.xml": sitemapOf("/thanks"),
      [`${ORIGIN}/thanks`]: `<html><head><meta name="robots" content="noindex, follow"></head><body><a href="/api/x">x</a></body></html>`,
    }),
  });
  assert.equal(report.findings.filter((f) => f.fault === "blocked_but_linked").length, 0);
  // But the sitemap entry carrying a noindex IS a finding: a sitemap is a
  // submission, so the two statements contradict each other.
  assert.ok(report.findings.some((f) => f.fault === "sitemap_noindex"), report.note);
});

test("a sitemap entry our own robots.txt blocks is the strongest contradiction", async () => {
  const { auditIndexability } = await import("../src/backend/indexability.ts");
  const report = await auditIndexability({
    origin: ORIGIN, maxPages: 3,
    fetchImpl: site({
      "/robots.txt": "User-agent: *\nDisallow: /audit\n",
      "/sitemap.xml": sitemapOf("/audit"),
      [`${ORIGIN}/audit`]: "<html></html>",
    }),
  });
  const f = report.findings.find((x) => x.fault === "sitemap_blocked");
  assert.ok(f, report.note);
  assert.match(f.remedy, /a submission for indexing/);
});

test("nothing examined is never reported as nothing wrong", async () => {
  // THE DEFECT CLASS THIS CODEBASE KEEPS PRODUCING: a check that passes for a
  // reason unrelated to what it tests. The first version returned a clean note
  // when the sitemap's URLs were on another host, because every page had been
  // rejected and no page had been read.
  const { auditIndexability } = await import("../src/backend/indexability.ts");
  const nothing = await auditIndexability({
    origin: ORIGIN, maxPages: 3,
    fetchImpl: async (url) =>
      url.endsWith("/robots.txt") ? { ok: true, status: 200, text: "User-agent: *\nAllow: /\n" }
        : url.endsWith("/sitemap.xml") ? { ok: true, status: 200, text: sitemapOf("/a", "/b") }
          : { ok: false, status: 500, text: "" },
  });
  assert.equal(nothing.pagesRead, 0);
  assert.match(nothing.note, /not a clean result/);

  // And a sitemap on another host has its PATHS audited, with the mismatch said
  // out loud rather than silently dropping every page.
  const rehosted = await auditIndexability({
    origin: ORIGIN, maxPages: 3,
    fetchImpl: site({
      "/robots.txt": "User-agent: *\nAllow: /\n",
      "/sitemap.xml": "<urlset><url><loc>https://www.live.test/audit</loc></url></urlset>",
      [`${ORIGIN}/audit`]: "<html><body>ok</body></html>",
    }),
  });
  assert.equal(rehosted.pagesRead > 0, true, "the paths must still be audited");
  assert.equal(rehosted.sitemapHost, "https://www.live.test");
  assert.match(rehosted.note, /are on https:\/\/www\.live\.test/);
});

test("a truncated walk says so, and a missing robots.txt is its own problem", async () => {
  const { auditIndexability } = await import("../src/backend/indexability.ts");
  const many = sitemapOf(...Array.from({ length: 10 }, (_, i) => `/p${i}`));
  const capped = await auditIndexability({
    origin: ORIGIN, maxPages: 3,
    fetchImpl: site({
      "/robots.txt": "User-agent: *\nAllow: /\n",
      "/sitemap.xml": many,
      ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`${ORIGIN}/p${i}`, "<html>ok</html>"])),
    }),
  });
  assert.equal(capped.partial, true, "slicing the sitemap to the cap must not read as complete");
  assert.match(capped.note, /NOT THE WHOLE SITE/);

  const noRobots = await auditIndexability({
    origin: ORIGIN, maxPages: 2, fetchImpl: async () => ({ ok: false, status: 404, text: "" }),
  });
  assert.equal(noRobots.robotsPresent, false);
  assert.match(noRobots.note, /did not answer/);
  assert.match(noRobots.note, /its own problem/, "no robots.txt is not an all-clear");
});

test("noindex is read off the rendered meta tag, however it is written", async () => {
  const { hasNoindex } = await import("../src/backend/indexability.ts");
  assert.equal(hasNoindex('<meta name="robots" content="noindex, follow"/>'), true);
  assert.equal(hasNoindex("<META NAME=robots CONTENT='NOINDEX'>"), true);
  assert.equal(hasNoindex('<meta name="robots" content="none">'), true, "`none` implies noindex");
  assert.equal(hasNoindex('<meta name="robots" content="index, follow">'), false);
  // A different directive's meta must not be mistaken for it.
  assert.equal(hasNoindex('<meta name="googlebot-news" content="noindex">'), false);
  assert.equal(hasNoindex('<meta name="description" content="noindex is a word">'), false);
});

test("Google's own verdict is asked for, and never invented", async () => {
  // Search Console's Coverage report has no API, so the platform asks per URL
  // through the URL Inspection API. With no credential it must say so — a
  // fabricated verdict about indexing is worse than no verdict.
  const { inspectUrls } = await import("../src/backend/search-console.ts");
  const r = await inspectUrls("sc-domain:example.test", ["https://example.test/signup"]);
  assert.equal(r.mode, "not_connected");
  assert.equal(r.results.length, 0);
  assert.equal(r.blocked, 0);
  assert.match(r.note, /auditIndexability/, "and it points at the check that needs no credential");

  const code = codeOf(readFileSync("src/backend/search-console.ts", "utf8"));
  assert.match(code, /robotsTxtState === "DISALLOWED"/, "the answer to the email is this one field");
  // A QUOTA REFUSAL MUST NOT LOOK LIKE A PASS. 2,000 queries a day per property.
  assert.match(code, /failed\.push\(\{ url, reason: `HTTP \$\{res\.status\}/);
  assert.match(code, /failed: \{ url: string; reason: string \}\[\]/);
});

test("the audit is exposed on a route, and cannot be pointed at a stranger", async () => {
  const route = codeOf(readFileSync("src/app/api/seo-insights/route.ts", "utf8"));
  assert.match(route, /action === "indexability"/);
  assert.match(route, /action === "url-inspection"/);
  // An origin typed into the request body would make this an open crawler.
  assert.match(route, /stored\?\.website/);
  assert.doesNotMatch(route, /body\.origin/);
  assert.match(route, /platform_admin/, "our own site is the operator's scope, not any caller's");
});
