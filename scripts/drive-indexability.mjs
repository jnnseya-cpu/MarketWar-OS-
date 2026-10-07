// npm run drive:index
//
// WHY SEARCH CONSOLE SAID "BLOCKED BY ROBOTS.TXT" — DRIVEN AGAINST A REAL BUILD.
//
// Search Console reported: *"some pages on your site are not being indexed due
// to the following new reason: Blocked by robots.txt"* — and named no URLs,
// because the Coverage report has never been exposed through any API. So the
// only way to see the list was for a person to open the console and read it.
// This looks instead.
//
// WHAT IS REAL IN HERE. A production `next build` served by `next start`, the
// robots.txt that build actually publishes, the sitemap it actually serves, the
// real `<a href>` elements on the real rendered pages, and the RFC 9309 parser
// the crawler already uses. Nothing about our own site is read from source.
//
// WHAT IT CANNOT TELL YOU. What Google has already done. For that there is
// `inspectUrls` in `backend/search-console.ts`, which asks Google per URL and
// needs a credential this container does not have. This needs none, which is why
// it can run on every deploy.

import fs from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);
const PORT = Number(process.env.DRIVE_PORT || 3123);
const ORIGIN = `http://127.0.0.1:${PORT}`;

// ---------------------------------------------------------------------------
// A real production server. `next start` refuses without a build, which is the
// right failure: an audit of a dev server measures a different robots.txt and a
// different set of rendered links.
// ---------------------------------------------------------------------------
if (!fs.existsSync(R(".next/BUILD_ID"))) {
  say("No production build found. Run `npm run build` first — a dev server renders different pages.");
  process.exit(1);
}

// THE PORT MUST BE FREE, AND THIS IS NOT A COURTESY CHECK.
//
// A leftover server from an earlier run answers on the same port, so `next
// start` fails quietly and the audit runs against THE OLD BUILD. It happened:
// two fixed pages were reported as still broken for a full cycle, and the code
// was correct the whole time. An audit pointed at the wrong server is worse than
// no audit, because it is believed.
try {
  const probe = await fetch(`${ORIGIN}/robots.txt`);
  if (probe) {
    say(`Something is already serving ${ORIGIN} (HTTP ${probe.status}). Stop it first — \`fuser -k ${PORT}/tcp\` — or this would audit THAT build, not this one.`);
    process.exit(1);
  }
} catch { /* nothing listening, which is what we need */ }

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: root, env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d.toString(); });
server.stderr.on("data", (d) => { serverLog += d.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${ORIGIN}/robots.txt`);
    if (res.ok) { up = true; break; }
  } catch { /* still booting */ }
  await sleep(500);
}
if (!up) {
  say(`The server did not come up on ${PORT}.\n${serverLog.slice(-800)}`);
  server.kill("SIGKILL");
  process.exit(1);
}
say(`\nProduction server on ${ORIGIN}\n`);

const indexability = await import(R("src/backend/indexability.ts"));
const policy = await import(R("src/shared/robots-policy.ts"));
const robotsMod = await import(R("src/backend/robots.ts"));

try {
  // -------------------------------------------------------------------------
  say("1. THE ROBOTS.TXT THIS BUILD ACTUALLY PUBLISHES");
  // -------------------------------------------------------------------------
  const robotsText = await (await fetch(`${ORIGIN}/robots.txt`)).text();
  say(robotsText.split("\n").map((l) => `     ${l}`).join("\n"));
  const parsed = robotsMod.parseRobots(robotsText);
  check("robots.txt is served and parses", parsed.present === true && parsed.groups.length > 0);

  // THE THREE PATHS THAT CAUSED THE REPORT. They were Disallow'ed while the
  // marketing header linked to two of them from every page.
  for (const p of ["/login", "/signup", "/onboarding"]) {
    const d = robotsMod.robotsAllows(parsed, p, indexability.GOOGLEBOT);
    check(`${p} is now CRAWLABLE`, d.allowed === true, d.rule ? `matched "${d.rule}"` : "no rule matches it");
  }
  // And the ones that stay blocked, because nothing public links to them.
  for (const p of ["/dashboard/settings", "/api/email", "/r/ABC123"]) {
    const d = robotsMod.robotsAllows(parsed, p, indexability.GOOGLEBOT);
    check(`${p} is still blocked`, d.allowed === false, `by "${d.rule}"`);
  }
  check("the published file carries exactly the policy's rules",
    policy.ROBOTS_DISALLOW.every((r) => robotsText.includes(`Disallow: ${r.path}`))
    && (robotsText.match(/^Disallow:/gm) || []).length === policy.ROBOTS_DISALLOW.length,
    `${(robotsText.match(/^Disallow:/gm) || []).length} rules published, ${policy.ROBOTS_DISALLOW.length} in the policy`);

  // -------------------------------------------------------------------------
  say("\n2. THE NOINDEX THAT REPLACED THE BLOCK — on the rendered page, not in source");
  // -------------------------------------------------------------------------
  for (const entry of policy.NOINDEX_PATHS) {
    const html = await (await fetch(`${ORIGIN}${entry.path}`)).text();
    const tag = (html.match(/<meta name="robots"[^>]*>/i) || [""])[0];
    check(`${entry.path} serves a noindex`, indexability.hasNoindex(html) === true, tag || "(no robots meta)");
    check(`${entry.path} keeps follow, so the link equity passes through`,
      /follow/i.test(tag) && !/nofollow/i.test(tag), tag);
  }

  // -------------------------------------------------------------------------
  say("\n3. THE FULL AUDIT AGAINST THE RUNNING BUILD");
  // -------------------------------------------------------------------------
  const report = await indexability.auditIndexability({ origin: ORIGIN, maxPages: 60, budgetMs: 180_000 });
  say(`     ${report.pagesRead} pages read · ${report.urlsSeen} internal link targets · ${report.findings.length} finding(s)`);
  for (const f of report.findings) say(`     ${f.fault.toUpperCase()}  ${f.path}  ${f.remedy.slice(0, 130)}`);
  check("pages were actually read, so this is a measurement", report.pagesRead >= 10, `${report.pagesRead} pages`);
  check("links were actually found on them", report.urlsSeen >= 15, `${report.urlsSeen} targets`);
  // A TRUNCATED WALK MUST SAY SO. Capping the sitemap silently made "the whole
  // site is clean" unfalsifiable for every page past the cap.
  check("and the whole sitemap was covered, or it says it was not",
    report.partial === false || /NOT THE WHOLE SITE/.test(report.note),
    report.partial ? report.note.slice(-90) : "complete");
  check("NOTHING is offered to Google and then refused", report.findings.length === 0,
    report.findings.length ? report.findings.map((f) => `${f.fault}:${f.path}`).join(", ") : report.note.slice(0, 110));
  check("no sitemap entry is blocked by our own robots.txt",
    report.findings.filter((f) => f.fault === "sitemap_blocked").length === 0);
  check("no sitemap entry carries a noindex",
    report.findings.filter((f) => f.fault === "sitemap_noindex").length === 0);
  check("every declared-noindex path is crawlable AND carries the header",
    report.findings.filter((f) => f.fault === "blocked_noindex" || f.fault === "noindex_missing").length === 0);

  // -------------------------------------------------------------------------
  say("\n4. THE AUDIT CATCHES THE DEFECT IT WAS WRITTEN FOR");
  // -------------------------------------------------------------------------
  // A check that has never failed is not evidence. This replays the state the
  // site was actually in — /signup blocked while six landing pages link to it —
  // against the same function, over a stub, and demands the finding.
  {
    const blockedRobots = "User-agent: *\nAllow: /\nDisallow: /dashboard/\nDisallow: /api/\nDisallow: /onboarding\nDisallow: /login\nDisallow: /signup\nDisallow: /r/\n";
    const fakeFetch = async (url) => {
      if (url.endsWith("/robots.txt")) return { ok: true, status: 200, text: blockedRobots };
      if (url.endsWith("/sitemap.xml")) return { ok: true, status: 200, text: `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/audit</loc></url></urlset>` };
      if (url === `${ORIGIN}/` || url === `${ORIGIN}/audit`) {
        return { ok: true, status: 200, text: `<html><body><a href="/signup">Get started</a><a href="/login">Log in</a></body></html>` };
      }
      return { ok: true, status: 200, text: "<html><head><meta name=\"robots\" content=\"noindex, follow\"></head><body></body></html>" };
    };
    const was = await indexability.auditIndexability({ origin: ORIGIN, fetchImpl: fakeFetch, maxPages: 5 });
    const linked = was.findings.filter((f) => f.fault === "blocked_but_linked");
    check("the old state is reported as blocked-but-linked", linked.length === 2,
      linked.map((f) => `${f.path}(${f.links} links)`).join(", "));
    check("and it counts the links rather than noting one",
      linked.every((f) => f.links === 2), linked.map((f) => f.links).join("/"));
    check("the remedy names the rule that caused it",
      linked.every((f) => f.rule && f.remedy.includes(f.rule)), linked[0]?.remedy.slice(0, 90));
    check("the unreadable-noindex contradiction is reported too",
      was.findings.some((f) => f.fault === "blocked_noindex"),
      was.findings.filter((f) => f.fault === "blocked_noindex").map((f) => f.path).join(", "));
    check("and it says out loud that this is what Search Console reports",
      /Blocked by robots\.txt/.test(was.note), was.note.slice(0, 120));
  }

  // -------------------------------------------------------------------------
  say("\n5. THE OTHER CONTRADICTIONS, each driven once");
  // -------------------------------------------------------------------------
  {
    // A sitemap entry our own robots.txt refuses — the strongest form, because
    // the sitemap is a submission.
    const f1 = await indexability.auditIndexability({
      origin: ORIGIN, maxPages: 3,
      fetchImpl: async (url) => {
        if (url.endsWith("/robots.txt")) return { ok: true, status: 200, text: "User-agent: *\nDisallow: /audit\n" };
        if (url.endsWith("/sitemap.xml")) return { ok: true, status: 200, text: `<urlset><url><loc>${ORIGIN}/audit</loc></url></urlset>` };
        return { ok: true, status: 200, text: "<html></html>" };
      },
    });
    check("a sitemap entry we block ourselves is reported",
      f1.findings.some((f) => f.fault === "sitemap_blocked"), f1.findings[0]?.remedy.slice(0, 100));

    // A sitemap entry that tells Google not to index it.
    const f2 = await indexability.auditIndexability({
      origin: ORIGIN, maxPages: 3,
      fetchImpl: async (url) => {
        if (url.endsWith("/robots.txt")) return { ok: true, status: 200, text: "User-agent: *\nAllow: /\n" };
        if (url.endsWith("/sitemap.xml")) return { ok: true, status: 200, text: `<urlset><url><loc>${ORIGIN}/audit</loc></url></urlset>` };
        return { ok: true, status: 200, text: '<html><head><meta name="robots" content="noindex"></head></html>' };
      },
    });
    check("a sitemap entry carrying a noindex is reported",
      f2.findings.some((f) => f.fault === "sitemap_noindex"));

    // A declared-noindex path that does not carry one.
    const f3 = await indexability.auditIndexability({
      origin: ORIGIN, maxPages: 3,
      fetchImpl: async (url) => {
        if (url.endsWith("/robots.txt")) return { ok: true, status: 200, text: "User-agent: *\nAllow: /\n" };
        if (url.endsWith("/sitemap.xml")) return { ok: true, status: 200, text: "<urlset></urlset>" };
        return { ok: true, status: 200, text: "<html><head><title>x</title></head></html>" };
      },
    });
    check("a policy path with no noindex on the page is reported",
      f3.findings.filter((f) => f.fault === "noindex_missing").length === policy.NOINDEX_PATHS.length,
      `${f3.findings.filter((f) => f.fault === "noindex_missing").length} of ${policy.NOINDEX_PATHS.length}`);

    // A nofollowed link is reported DIFFERENTLY, because nofollow is a hint.
    const f4 = await indexability.auditIndexability({
      origin: ORIGIN, maxPages: 3,
      fetchImpl: async (url) => {
        if (url.endsWith("/robots.txt")) return { ok: true, status: 200, text: "User-agent: *\nDisallow: /dashboard/\n" };
        if (url.endsWith("/sitemap.xml")) return { ok: true, status: 200, text: `<urlset><url><loc>${ORIGIN}/choose-plan</loc></url></urlset>` };
        if (url === `${ORIGIN}/choose-plan`) return { ok: true, status: 200, text: '<html><body><a href="/dashboard/x" rel="nofollow">demo</a></body></html>' };
        return { ok: true, status: 200, text: "<html></html>" };
      },
    });
    const nf = f4.findings.find((f) => f.fault === "blocked_but_linked");
    check("a nofollowed link to a blocked path is reported as a HINT, not a fix",
      nf?.allNofollowed === true && /hint rather than an instruction/.test(nf.remedy),
      nf?.remedy.slice(0, 110));

    // NO ROBOTS.TXT AT ALL must not read as "nothing is blocked, all good".
    const f5 = await indexability.auditIndexability({
      origin: ORIGIN, maxPages: 2,
      fetchImpl: async () => ({ ok: false, status: 404, text: "" }),
    });
    check("a missing robots.txt is named as its own problem, not an all-clear",
      f5.robotsPresent === false && /did not answer/.test(f5.note), f5.note.slice(0, 100));
  }

  // -------------------------------------------------------------------------
  say("\n6. WHAT GOOGLE ITSELF SAYS — the honest unavailable case");
  // -------------------------------------------------------------------------
  {
    const sc = await import(R("src/backend/search-console.ts"));
    const r = await sc.inspectUrls("sc-domain:marketwaros.com", [`${ORIGIN}/signup`]);
    check("with no Google credential it reports not_connected and never a verdict",
      r.mode === "not_connected" && r.results.length === 0 && r.blocked === 0, r.note.slice(0, 120));
    check("and it points at the check that needs no credential",
      /auditIndexability/.test(r.note));
  }
} finally {
  server.kill("SIGKILL");
}

say(`\n${proven} proven / ${broken} broken`);
process.exit(broken ? 1 : 0);
