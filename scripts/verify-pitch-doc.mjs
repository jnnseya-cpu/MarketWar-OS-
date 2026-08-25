// Verify the pitch-creatives bundle contains the five creatives, and that every
// number printed on them is still true of the platform.
//
//   npm run pitch:verify
//
// Same two jobs as the ads verifier, and the second is again the one that
// matters:
//
//   1. Every heading, paragraph, table cell and COPY BLOCK survived the render.
//      A copy block the renderer dropped is an advert the owner cannot paste,
//      and LibreOffice cannot open a .docx in this container, so reading the
//      text back out of the archive is the substitute for looking at it. That is
//      not hypothetical: the go-to-market renderer once destructured `text` from
//      a block whose field is `copy` and printed "undefined" 31 times.
//
//   2. The claims are re-checked against src/ INDEPENDENTLY of ads-facts.mjs.
//      That file feeds the document, so a fault in its parser would be invisible
//      to any comparison that also used it. The agent count, the render prices,
//      the commission rate and the no-follower-gate promise are all read again
//      here, by different expressions, and compared with what was printed.
//
// The hygiene section is the reason this file exists at all. The creative that
// prompted the bundle carried "Leads collected +10.1k" — a fabricated result for
// a product with no customers. Under CPR 2008 a falsely claimed endorsement is a
// listed banned practice. This build fails rather than produce one.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC } from "./pitch-content.mjs";
import { collectStrings, docxText, htmlText, flat } from "./doc-render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = (...p) => join(here, "..", ...p);
const BASE = "PITCH-CREATIVES";

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

const copyBlocks = DOC.sections.flatMap((s) => s.blocks.filter((b) => b.copy));
if (copyBlocks.length < 10) fail(`\nOnly ${copyBlocks.length} copy blocks — this bundle is meant to be paste-driven`);
else console.log(`copy blocks: ${copyBlocks.length} present and matched`);

// Five creatives, each with the four slots an image needs to be built from.
for (const slot of ["Metric chip", "Headline", "Subline", "Call to action"]) {
  const n = (docx.match(new RegExp(slot, "g")) || []).length;
  if (n < 5) fail(`\nOnly ${n} "${slot}" rows — there must be one per creative, and there are five creatives`);
}
const briefs = (docx.match(/Generator prompt:/g) || []).length;
if (briefs < 5) fail(`\nOnly ${briefs} generator prompts — each creative needs one so an image can be made without asking a question`);
else console.log(`creatives: five slot tables and ${briefs} image briefs`);

// ---------------------------------------------------------------- 2. claims

// The agent count, counted a DIFFERENT way from ads-facts.mjs: `id:` fields
// inside the AGENTS record rather than its quoted keys.
const agentsSrc = readFileSync(root("src", "shared", "agents.ts"), "utf8");
const agentIds = new Set((agentsSrc.match(/^\s{4}id:\s*"([a-z0-9-]+)"/gm) || []).map((m) => m.split('"')[1]));
if (agentIds.size < 20) fail(`\nCounted only ${agentIds.size} agent ids — the parser and the source disagree`);
else if (!docx.includes(`${agentIds.size} agents`)) {
  fail(`\nThe bundle should say "${agentIds.size} agents" — agents.ts defines ${agentIds.size}. An earlier draft said 19 from memory.`);
} else console.log(`agents: ${agentIds.size}, as printed`);

// The render prices. Imported from the real function, because recomputing them
// from the per-second cost gave 192 ACUs where the platform charges 281 — the
// storage floor is part of the price and the recomputation did not know it.
const { videoRenderAcus, DEFAULT_RENDER_SECONDS } = await import("../src/backend/video-gateway.ts");
for (const s of [8, DEFAULT_RENDER_SECONDS]) {
  const printed = `£${(videoRenderAcus(s) / 100).toFixed(2)}`;
  if (!docx.includes(printed)) fail(`\nThe bundle does not print the real ${s}-second render price (${printed})`);
}
console.log(`video: ${8}s and ${DEFAULT_RENDER_SECONDS}s prices match videoRenderAcus`);

// The commission rate and the withdrawal floor, read again from source.
const creator = readFileSync(root("src", "shared", "creator-program.ts"), "utf8");
const cap = Number((creator.match(/SHARE2EARN_RATE_CAP\s*=\s*([0-9.]+)/) || [])[1]);
const minWd = Number((creator.match(/MIN_WITHDRAWAL_GBP\s*=\s*([0-9]+)/) || [])[1]);
if (!Number.isFinite(cap) || !docx.includes(`${cap * 100}%`)) fail(`\nThe bundle must print the real SHARE2EARN rate (${cap * 100}%)`);
if (!Number.isFinite(minWd) || !docx.includes(`£${minWd}`)) fail(`\nThe bundle must print the real withdrawal minimum (£${minWd})`);
console.log(`creator programme: ${cap * 100}% and a £${minWd} withdrawal minimum, both as printed`);

// Creative 4 says "no follower count" and "payable from the first sale". This
// is what makes that true; it fails the day the gate comes back.
const programmeFor = creator.slice(creator.indexOf("export function programmeFor"));
if (!/return "main";/.test(programmeFor.slice(0, 400))) {
  fail("\nprogrammeFor no longer returns \"main\" unconditionally — creative 4 promises cash with no follower gate");
} else console.log("creator programme: no follower gate on cash, as the creative says");

// The free audit, promised by creative 1.
const auditRoute = readFileSync(root("src", "app", "api", "audit", "route.ts"), "utf8");
const findings = Number((auditRoute.match(/const FREE_FINDINGS\s*=\s*([0-9]+)/) || [])[1]);
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
if (!Number.isFinite(findings)) fail("\nCould not read FREE_FINDINGS — creative 1 promises a number of free findings");
else if (!docx.toLowerCase().includes(`${words[findings]} findings`)) fail(`\nCreative 1 should say "${words[findings]} findings"`);
else console.log(`free audit: ${findings} findings, as promised`);
if (/requireUser|requireAuth|getSession/.test(auditRoute)) fail("\nThe audit route looks authenticated — creative 1 promises no account is needed");
if (!/crawlSite/.test(auditRoute)) fail("\n/api/audit no longer calls crawlSite — creative 1 promises a real crawl");

// ---------------------------------------------------------------- 3. hygiene

// NO INVENTED CUSTOMER, RESULT OR TESTIMONIAL. There are none.
//
// The founder quote is not a customer testimonial and is deliberately allowed:
// it is the owner describing his own business, which is checkable.
const forbidden = [
  /trusted by [0-9]/i, /[0-9,]+\+? (?:happy )?customers/i, /join [0-9,]+/i,
  /increase your [a-z ]+ by [0-9]/i, /guaranteed results/i, /[0-9]+% more (?:leads|sales|revenue)/i,
  /leads collected \+?[0-9]/i, /\+[0-9.]+k (?:leads|sales|users|customers)/i,
  /[0-9,]+ businesses (?:use|trust|switched)/i,
];
const claimHits = forbidden.filter((re) => re.test(docx));
if (claimHits.length) fail(`\nThe bundle makes ${claimHits.length} claim(s) of a result or customer base that does not exist: ${claimHits.map(String).join(", ")}`);
else console.log("claims: no results, customer counts or invented testimonials");

const literalBullets = (docx.match(/•/g) || []).length;
if (literalBullets) fail(`\n${literalBullets} literal • characters in the docx — bullets must come from numbering`);
else console.log("docx: no literal bullet characters");

if (failed) process.exit(1);
console.log(`\n${DOC.sections.length} sections verified.`);
