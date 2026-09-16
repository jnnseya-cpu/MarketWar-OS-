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
      if (/robots:\s*\{[^}]*index:\s*false/.test(code)) {
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
  const robots = readFileSync("src/app/robots.ts", "utf8");
  const disallow = [...(robots.match(/disallow:\s*\[([^\]]*)\]/s)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(disallow.length, "robots.txt must still disallow the private surfaces");

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
