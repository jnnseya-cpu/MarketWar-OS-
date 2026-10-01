// Verify the ads bundle actually CONTAINS the campaign, and that every claim in
// it is still true of the platform.
//
//   npm run ads:verify
//
// Two jobs, and the second is the one that matters:
//
//   1. Every heading, paragraph, bullet, table cell and — above all — every
//      COPY BLOCK is present in the rendered .docx and .html. A copy block that
//      the renderer silently dropped is an advert the owner cannot paste, and
//      LibreOffice cannot open a .docx in this container, so reading the text
//      back out of the archive is the substitute for looking at it.
//
//   2. The claims are re-checked against src/ INDEPENDENTLY of ads-facts.mjs.
//      That file feeds the document, so a fault in its parser would be invisible
//      to any comparison that also used it. Prices, the tool counts, the free
//      finding count and the public audit are all read again here, by different
//      expressions, and compared against what the document actually printed.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC } from "./ads-content.mjs";
import { collectStrings, docxText, htmlText, flat } from "./doc-render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = (...p) => join(here, "..", ...p);
const BASE = "FACEBOOK-LAUNCH-CAMPAIGN";

const docx = flat(docxText(root("docs", `${BASE}.docx`)));
const html = htmlText(readFileSync(root("docs", `${BASE}.html`), "utf8"));

let failed = false;
const fail = (msg) => { failed = true; console.error(msg); };

// ---------------------------------------------------------------- 1. content

const strings = collectStrings(DOC);
const missing = { docx: [], html: [] };
for (const { where, t } of strings) {
  if (!docx.includes(t)) missing.docx.push(`${where}: ${t.slice(0, 70)}`);
  if (!html.includes(t)) missing.html.push(`${where}: ${t.slice(0, 70)}`);
}

const report = (label, list) => {
  if (list.length) {
    fail(`\n${list.length} content item(s) missing from the ${label}:`);
    list.slice(0, 20).forEach((l) => console.error(`  - ${l}`));
    if (list.length > 20) console.error(`  … and ${list.length - 20} more`);
  } else {
    console.log(`${label}: all ${strings.length} content items present`);
  }
};
report("docx", missing.docx);
report("html/pdf", missing.html);

// Every advert must be pasteable, so the copy blocks are counted as well as
// matched — a renderer that dropped the block type entirely would still pass a
// substring check if the same words happened to appear in the prose around it.
const copyBlocks = DOC.sections.flatMap((s) => s.blocks.filter((b) => b.copy));
if (copyBlocks.length < 20) fail(`\nOnly ${copyBlocks.length} copy blocks — the bundle is meant to be paste-driven, so this is almost certainly a content mistake`);
else console.log(`copy blocks: ${copyBlocks.length} present and matched`);

// ---------------------------------------------------------------- 2. claims

const subscription = readFileSync(root("src", "backend", "subscription.ts"), "utf8");
const priceOf = (name) => {
  const m = subscription.match(new RegExp(`name:\\s*"${name}",\\s*monthlyGbp:\\s*([0-9.]+)`));
  if (!m) throw new Error(`verify-ads-doc: no ${name} plan in subscription.ts — the adverts name it`);
  return Number(m[1]);
};

// The adverts print these three prices. Read them again, independently.
for (const name of ["Free", "Starter", "Growth"]) {
  const n = priceOf(name);
  const printed = n === 0 ? "£0" : `£${n.toLocaleString("en-GB")}`;
  if (!docx.includes(printed)) fail(`\nAdvert 4 does not print ${name}'s real price (${printed}) — the docx and subscription.ts disagree`);
}
console.log("prices: Free, Starter and Growth all match subscription.ts");

// Tool counts, counted a different way from ads-facts.mjs: rows, not keyless flags.
const tools = readFileSync(root("src", "shared", "included-tools.ts"), "utf8");
// `insteadOf: "` with the quote, so the IncludedTool type's own `insteadOf:
// string;` declaration is not counted as a thirteenth tool. The first run of
// this check reported 13 and was wrong — a check that fails for a reason
// unrelated to what it tests is the same defect as one that passes for one.
const rows = (tools.match(/insteadOf:\s*"/g) || []).length;
const keyless = (tools.match(/keyless:\s*true/g) || []).length;
if (!docx.includes(`${rows} tools`)) fail(`\nThe adverts should say "${rows} tools" — included-tools.ts has ${rows} rows`);
if (!docx.includes(`${keyless} of them work`)) fail(`\nThe adverts should say "${keyless} of them work" — ${keyless} tools are keyless`);
console.log(`tools: ${rows} tools, ${keyless} keyless, both as printed`);

// The free-audit promise. Every advert makes it, so it is checked hardest.
const auditRoute = readFileSync(root("src", "app", "api", "audit", "route.ts"), "utf8");
const findings = Number((auditRoute.match(/const FREE_FINDINGS\s*=\s*([0-9]+)/) || [])[1]);
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
if (!Number.isFinite(findings)) fail("\nCould not read FREE_FINDINGS from the audit route — the adverts promise a specific number of free findings");
else if (!docx.toLowerCase().includes(`${words[findings]} findings`)) {
  fail(`\nThe adverts promise free findings but do not say "${words[findings]} findings" — the audit returns ${findings}`);
} else console.log(`free audit: ${findings} findings, as promised in the copy`);

if (!/crawlSite/.test(auditRoute)) fail("\n/api/audit no longer calls crawlSite — the adverts promise a real crawl of a real page");
else console.log("free audit: still a real crawl (crawlSite)");

// The adverts send paid traffic to these. A 404 in an advert is money burnt.
for (const route of ["audit", "choose-plan"]) {
  try { readFileSync(root("src", "app", route, "page.tsx")); }
  catch { fail(`\nThe adverts link to /${route} but src/app/${route}/page.tsx does not exist`); }
}
console.log("destinations: /audit and /choose-plan both exist");

// THE AUDIT MUST NEED NO ACCOUNT, because six adverts say so in those words.
//
// THIS USED TO GREP FOR `requireUser|requireAuth|getSession` AND FAILED THE ADS
// BUILD WHILE EVERY ADVERT WAS TRUE. The route now READS auth when a bearer
// happens to be present — to attribute the run and to decide whether the caller
// is on a paid plan for quota — and carries on without one. Mentioning
// `requireAuth` and being gated behind it are different facts, and a grep cannot
// tell them apart: a check failing for a reason unrelated to what it tests,
// which is this repository's second catalogued defect class.
//
// So the check is now about the ANONYMOUS PATH, which is the thing the adverts
// actually promise: a caller with no bearer must be handed `accountId: null` and
// allowed to continue. The behaviour itself is driven in
// `tests/audit-open.test.mjs`, which POSTs to the real handler with no
// credential at all and asserts it is not refused for lack of one — because
// source can lie about whether a line is reached and a request cannot.
const anonymousAllowed =
  /startsWith\("Bearer "\)\) return \{ accountId: null, paid: false \}/.test(auditRoute);
if (!anonymousAllowed) {
  fail("\nThe audit route no longer has an explicit anonymous path — every advert in this bundle promises no account is needed. Check src/app/api/audit/route.ts and tests/audit-open.test.mjs.");
} else console.log("free audit: still public — a caller with no bearer is allowed through");

// ------------------------------------------- 2b. the picture prompts' facts
//
// `docs/FACEBOOK-AD-PROMPTS.md` carries the same claims into the five image
// prompts and the ad-copy prompt, so it is checked against src/ exactly as the
// .docx is. The number of checks is the one that drifted: the first draft said
// 32, counted off the `AUDIT_COPY` keys, while the platform's own
// `auditCheckCount()` says 31 — it excludes the single CONDITIONAL check,
// because a number printed in an advert has to be the number that is true of
// every visitor, which is the reason written above that function. A picture is
// harder to correct than a paragraph: once five images are generated with a
// wrong number burnt into the pixels, the number is in the ad account.
const { auditCheckCount, conditionalChecks } = await import("../src/shared/audit-copy.ts");
const prompts = readFileSync(root("docs", "FACEBOOK-AD-PROMPTS.md"), "utf8");
const trueCount = auditCheckCount();
const countsClaimed = [...new Set((prompts.match(/\b(\d{1,3}) checks\b/g) || []).map((m) => Number(m.match(/\d+/)[0])))];
const wrongCounts = countsClaimed.filter((n) => n !== trueCount);
if (!countsClaimed.length) {
  fail("\nFACEBOOK-AD-PROMPTS.md names no check count at all — the prompts are built on it, so a silent removal is a silent change of claim.");
} else if (wrongCounts.length) {
  fail(`\nFACEBOOK-AD-PROMPTS.md claims ${wrongCounts.join(" and ")} checks; auditCheckCount() is ${trueCount}`
    + ` (${conditionalChecks().length} conditional check(s) are excluded on purpose). These numbers end up inside generated images.`);
} else console.log(`image prompts: "${trueCount} checks" matches auditCheckCount() everywhere it appears`);

// ---------------------------------------------------------------- 3. hygiene

// No claim of a result, a customer or a testimonial. There are none.
const forbidden = [
  /trusted by [0-9]/i, /[0-9,]+\+? (?:happy )?customers/i, /join [0-9,]+/i,
  /increase your [a-z ]+ by [0-9]/i, /guaranteed results/i, /[0-9]+% more (?:leads|sales|revenue)/i,
];
const claimHits = forbidden.filter((re) => re.test(docx));
if (claimHits.length) fail(`\nThe bundle makes ${claimHits.length} claim(s) of a result or customer base that does not exist yet: ${claimHits.map(String).join(", ")}`);
else console.log("claims: no results, customer counts or testimonials asserted");

// THE SAME RULE OVER THE PICTURE PROMPTS, because an image asserts as loudly as
// a sentence and a generated one cannot be edited afterwards. The prompts file
// also DISCUSSES these patterns in order to forbid them, so only the prompt
// bodies are scanned — the blockquotes, which is what gets pasted into an image
// model — and not the prose explaining why they are banned. A check that fails
// on its own warning label is this repository's second defect class.
const promptBodies = prompts.split("\n").filter((l) => l.startsWith("> ")).join("\n");
const promptHits = forbidden.filter((re) => re.test(promptBodies));
if (promptHits.length) fail(`\nA picture or copy prompt asks for ${promptHits.length} claim(s) there is no basis for: ${promptHits.map(String).join(", ")}`);
else console.log(`image prompts: ${promptBodies.split("\n").length} prompt lines, no result or customer claim requested`);

// The bullet character must never be literal text — docx numbering draws it.
const literalBullets = (docx.match(/•/g) || []).length;
if (literalBullets) fail(`\n${literalBullets} literal • characters in the docx text — bullets must come from numbering`);
else console.log("docx: no literal bullet characters");

if (failed) process.exit(1);
console.log(`\n${DOC.sections.length} sections verified.`);
