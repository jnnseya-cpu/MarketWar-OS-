// Verify that the generated .docx actually CONTAINS the document.
//
// LibreOffice cannot open any .docx in the build container, so the usual
// render-and-look check is unavailable here. This is the substitute and it is
// not decorative: it reads word/document.xml back out of the archive and
// asserts that every heading, paragraph, bullet, table cell and quoted line in
// scripts/gtm-content.mjs is present in it — which is the failure mode that
// actually matters (a renderer silently dropping a block type), not the one a
// screenshot would catch.
//
//   npm run gtm:verify

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC } from "./gtm-content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const docx = join(here, "..", "docs", "GO-TO-MARKET-MarketWar-OS.docx");
const html = join(here, "..", "docs", "GO-TO-MARKET-MarketWar-OS.html");

// Read document.xml out of the archive and reduce it to visible text.
const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
const docxText = xml
  .replace(/<w:p[ >]/g, "\n<w:p ")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/[ \t]+/g, " ");

const htmlText = readFileSync(html, "utf8")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ");

const flat = (s) => s.replace(/\s+/g, " ").trim();

const strings = [];
const push = (where, s) => { const t = flat(String(s)); if (t) strings.push({ where, t }); };

DOC.sections.forEach((s) => {
  push("heading", s.h);
  s.blocks.forEach((b) => {
    if (b.h2) push("h2", b.h2);
    if (b.p) push("p", b.p);
    if (b.callout) push("callout", b.callout);
    if (b.quote) { b.quote.split("\n").forEach((l) => push("quote", l)); push("attrib", b.attrib); }
    if (b.bullets) b.bullets.forEach((t) => push("bullet", t));
    if (b.numbered) b.numbered.forEach((t) => push("numbered", t));
    if (b.table) {
      b.table.head.forEach((t) => push("th", t));
      b.table.rows.forEach((r) => r.forEach((t) => push("td", t)));
      if (b.table.widths.reduce((a, c) => a + c, 0) !== 100) {
        throw new Error(`verify-gtm-doc: table widths do not total 100 — ${b.table.head.join(" | ")}`);
      }
      b.table.rows.forEach((r) => {
        if (r.length !== b.table.head.length) {
          throw new Error(`verify-gtm-doc: row of ${r.length} against ${b.table.head.length} columns — ${b.table.head.join(" | ")}`);
        }
      });
    }
  });
});

// The price table is the one part of the document that can be wrong while every
// other check passes: gtm-facts.mjs feeds both the document and this file's
// expectations, so a fault in the parser is invisible to the comparison above.
// So subscription.ts is read again here, independently, and the printed prices
// are checked against it.
const subscription = readFileSync(join(here, "..", "src", "backend", "subscription.ts"), "utf8");
const priceFaults = [];
const planRows = [...subscription.matchAll(/name:\s*"([A-Z][a-z]+)",\s*monthlyGbp:\s*([0-9.]+)/g)];
if (planRows.length < 5) throw new Error(`verify-gtm-doc: parsed only ${planRows.length} plans from subscription.ts — fix the check, do not weaken it`);
for (const [, name, monthlyGbp] of planRows) {
  const printed = `${name} ${Number(monthlyGbp) === 0 ? "£0" : `£${Number(monthlyGbp).toLocaleString("en-GB")}`}`;
  if (!flat(docxText).includes(printed)) priceFaults.push(`${printed} — not printed in the docx price table`);
  if (!htmlText.includes(printed)) priceFaults.push(`${printed} — not printed in the html/pdf price table`);
}

const missing = { docx: [], html: [] };
for (const { where, t } of strings) {
  if (!flat(docxText).includes(t)) missing.docx.push(`${where}: ${t.slice(0, 70)}`);
  if (!htmlText.includes(t)) missing.html.push(`${where}: ${t.slice(0, 70)}`);
}

// The bullet character must never be literal text — docx numbering draws it.
const literalBullets = (flat(docxText).match(/•/g) || []).length;

let failed = false;
const report = (label, list) => {
  if (list.length) {
    failed = true;
    console.error(`\n${list.length} content item(s) missing from the ${label}:`);
    list.slice(0, 20).forEach((l) => console.error(`  - ${l}`));
    if (list.length > 20) console.error(`  … and ${list.length - 20} more`);
  } else {
    console.log(`${label}: all ${strings.length} content items present`);
  }
};
report("docx", missing.docx);
report("html/pdf", missing.html);

if (priceFaults.length) {
  failed = true;
  console.error(`\nThe price table has drifted from src/backend/subscription.ts:`);
  priceFaults.forEach((f) => console.error(`  - ${f}`));
} else {
  console.log(`prices: all ${planRows.length} plans match subscription.ts`);
}

if (literalBullets) { failed = true; console.error(`\n${literalBullets} literal • characters in the docx text — bullets must come from numbering`); }
else console.log("docx: no literal bullet characters");

if (failed) process.exit(1);
console.log(`\n${DOC.sections.length} sections verified.`);
