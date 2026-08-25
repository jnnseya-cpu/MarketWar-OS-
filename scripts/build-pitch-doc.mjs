// Build the five pitch creatives bundle as .docx, .pdf and .html.
//
//   npm run pitch:doc
//
// Content is scripts/pitch-content.mjs; rendering is scripts/doc-render.mjs,
// shared with the go-to-market document so the two cannot drift apart in
// appearance. Prices, tool counts and the free-audit gate come from
// scripts/ads-facts.mjs, which reads them out of src/ and throws rather than
// letting an advert quote a number the website does not charge.

import { Packer } from "docx";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC } from "./pitch-content.mjs";
import { buildDocx, buildHtml, renderPdf } from "./doc-render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "docs");
const BASE = "PITCH-CREATIVES";

const generatedOn = new Date().toISOString().slice(0, 10);

mkdirSync(OUT_DIR, { recursive: true });

const htmlPath = join(OUT_DIR, `${BASE}.html`);
writeFileSync(htmlPath, buildHtml(DOC, generatedOn), "utf8");

const docxPath = join(OUT_DIR, `${BASE}.docx`);
writeFileSync(docxPath, await Packer.toBuffer(buildDocx(DOC, generatedOn)));

const pdfPath = join(OUT_DIR, `${BASE}.pdf`);
renderPdf(htmlPath, pdfPath);

console.log(`docx  ${docxPath}`);
console.log(`pdf   ${pdfPath}`);
console.log(`html  ${htmlPath}`);
console.log(`${DOC.sections.length} sections`);
