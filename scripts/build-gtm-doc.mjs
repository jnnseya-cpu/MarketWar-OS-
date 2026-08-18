// Build MarketWar OS's own go-to-market document as .docx AND .pdf.
//
//   npm run gtm:doc
//
// Both files come from scripts/gtm-content.mjs, so the Word file and the PDF
// cannot say different things — the same reason the customer-facing plan
// renders its download server-side rather than assembling it in the browser.
// The PDF is produced by printing the HTML render with the Chromium already on
// the machine; no render service, no extra dependency.
//
// Prices in the document are parsed from src/backend/subscription.ts by
// scripts/gtm-facts.mjs, which throws rather than printing a remembered table.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, LevelFormat,
  convertInchesToTwip,
} from "docx";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC } from "./gtm-content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "docs");
const BASE = "GO-TO-MARKET-MarketWar-OS";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// A4 (this is a UK plan in pounds), 1in margins. Content width in DXA:
const PAGE = { width: 11906, height: 16838 };
const MARGIN = convertInchesToTwip(1);
const CONTENT_W = PAGE.width - MARGIN * 2; // 9026

const INK = "1A1D26";
const MUTED = "5A6072";
const ACCENT = "1F4FD8";
const RULE = "D8DCE6";
const CALLOUT_BG = "EEF2FE";
const HEAD_BG = "1A1D26";

const generatedOn = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- docx render

const bulletRef = "gtm-bullets";
const numberRef = "gtm-numbers";

const numbering = {
  config: [
    {
      reference: bulletRef,
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 420, hanging: 260 } } },
      }],
    },
    {
      reference: numberRef,
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 460, hanging: 300 } } },
      }],
    },
  ],
};

const body = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 160, line: 300 },
  children: [new TextRun({
    text, color: opts.color ?? INK, size: opts.size ?? 21,
    font: opts.mono ? "Consolas" : undefined, bold: opts.bold, italics: opts.italics,
  })],
  alignment: opts.align,
});

const cellPara = (text, opts = {}) => new Paragraph({
  spacing: { before: 40, after: 40, line: 280 },
  children: [new TextRun({ text, color: opts.color ?? INK, size: 19, bold: opts.bold })],
});

const renderTable = ({ head, rows, widths }) => {
  const cols = widths.map((w) => Math.round((w / 100) * CONTENT_W));
  // Rounding must not push the row past the table width, or Word reflows it.
  cols[cols.length - 1] += CONTENT_W - cols.reduce((a, b) => a + b, 0);

  const cell = (text, i, isHead) => new TableCell({
    width: { size: cols[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: isHead ? HEAD_BG : "FFFFFF", color: "auto" },
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children: [cellPara(text, { bold: isHead, color: isHead ? "FFFFFF" : INK })],
  });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: cols,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
    },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(String(t), i, false)) })),
    ],
  });
};

const renderCallout = (text) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [CONTENT_W],
  borders: {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  },
  rows: [new TableRow({
    children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: CALLOUT_BG, color: "auto" },
      margins: { top: 180, bottom: 180, left: 220, right: 220 },
      children: [new Paragraph({
        spacing: { line: 300 },
        children: [new TextRun({ text, color: INK, size: 21, bold: true })],
      })],
    })],
  })],
});

// A quoted message plus the note on why it works. Newlines are separate
// paragraphs — docx has no \n.
const renderQuote = (text, attrib) => {
  const lines = text.split("\n");
  const paras = lines.map((line) => new Paragraph({
    spacing: { after: line.trim() ? 100 : 60, line: 300 },
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 10, color: RULE, space: 12 } },
    children: [new TextRun({ text: line, color: INK, size: 21 })],
  }));
  if (attrib) {
    paras.push(new Paragraph({
      spacing: { before: 60, after: 200, line: 280 },
      indent: { left: 360 },
      children: [new TextRun({ text: attrib, color: MUTED, size: 19, italics: true })],
    }));
  }
  return paras;
};

const renderBlock = (b) => {
  if (b.h2) return [new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 140 },
    children: [new TextRun({ text: b.h2, color: INK, size: 25, bold: true })],
  })];
  if (b.p) return [body(b.p, { mono: b.mono })];
  if (b.callout) return [renderCallout(b.callout), body("", { after: 60 })];
  if (b.quote) return renderQuote(b.quote, b.attrib);
  if (b.bullets) return b.bullets.map((t) => new Paragraph({
    numbering: { reference: bulletRef, level: 0 },
    spacing: { after: 110, line: 300 },
    children: [new TextRun({ text: t, color: INK, size: 21 })],
  }));
  if (b.numbered) return b.numbered.map((t) => new Paragraph({
    numbering: { reference: numberRef, level: 0 },
    spacing: { after: 110, line: 300 },
    children: [new TextRun({ text: t, color: INK, size: 21 })],
  }));
  if (b.table) return [renderTable(b.table), body("", { after: 100 })];
  throw new Error(`build-gtm-doc: unknown block ${JSON.stringify(Object.keys(b))}`);
};

const buildDocx = () => {
  const children = [];

  // Cover.
  children.push(
    new Paragraph({ spacing: { before: 1800, after: 0 }, children: [new TextRun({ text: DOC.strapline.toUpperCase(), color: ACCENT, size: 22, bold: true, characterSpacing: 60 })] }),
    new Paragraph({ spacing: { before: 240, after: 0 }, children: [new TextRun({ text: DOC.title, color: INK, size: 56, bold: true })] }),
    new Paragraph({ spacing: { before: 160, after: 0 }, children: [new TextRun({ text: DOC.subtitle, color: MUTED, size: 28 })] }),
    new Paragraph({
      spacing: { before: 420, after: 420 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 6 } },
      children: [new TextRun({ text: "" })],
    }),
    body(`Prepared ${generatedOn}. Prices and guardrail figures are read from the platform's own source at build time.`, { color: MUTED, size: 20 }),
    body("Every rate that could not be measured is marked ASSUMED and names the evidence that replaces it.", { color: MUTED, size: 20 }),
  );

  // Contents.
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 220 },
    children: [new TextRun({ text: "Contents", color: INK, size: 32, bold: true })],
  }));
  DOC.sections.forEach((s) => children.push(new Paragraph({
    spacing: { after: 90, line: 280 },
    children: [new TextRun({ text: s.h, color: INK, size: 21 })],
  })));

  // Sections.
  DOC.sections.forEach((s) => {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 220 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: ACCENT, space: 8 } },
      children: [new TextRun({ text: s.h, color: INK, size: 32, bold: true })],
    }));
    s.blocks.forEach((b) => children.push(...renderBlock(b)));
  });

  return new Document({
    creator: "MarketWar OS",
    title: DOC.title,
    description: DOC.subtitle,
    numbering,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21, color: INK } } },
      // An explicit Normal. Word supplies a built-in one when it is missing, but
      // other readers resolve a paragraph's style by id and get nothing, which
      // is the same boundary defect this codebase keeps producing: a value that
      // exists on one side and is never carried across.
      paragraphStyles: [{
        id: "Normal", name: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 21, color: INK },
        paragraph: { spacing: { line: 300 } },
      }],
    },
    sections: [{
      properties: { page: { size: PAGE, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      children,
    }],
  });
};

// ---------------------------------------------------------------- html render

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const htmlBlock = (b) => {
  if (b.h2) return `<h3>${esc(b.h2)}</h3>`;
  if (b.p) return `<p${b.mono ? ' class="mono"' : ""}>${esc(b.p)}</p>`;
  if (b.callout) return `<div class="callout">${esc(b.callout)}</div>`;
  if (b.quote) return `<blockquote>${b.quote.split("\n").map((l) => `<p>${esc(l) || "&nbsp;"}</p>`).join("")}` +
    (b.attrib ? `<p class="attrib">${esc(b.attrib)}</p>` : "") + "</blockquote>";
  if (b.bullets) return `<ul>${b.bullets.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  if (b.numbered) return `<ol>${b.numbered.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`;
  if (b.table) {
    const { head, rows, widths } = b.table;
    return `<table><colgroup>${widths.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>` +
      `<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  throw new Error("build-gtm-doc: unknown block in html render");
};

const buildHtml = () => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<title>${esc(DOC.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.55 "Calibri", "Segoe UI", system-ui, sans-serif; color: #${INK}; margin: 0; }
  .cover { min-height: 235mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .strap { color: #${ACCENT}; font-weight: 700; letter-spacing: .16em; font-size: 11pt; text-transform: uppercase; }
  .cover h1 { font-size: 34pt; line-height: 1.1; margin: 10mm 0 4mm; }
  .cover .sub { font-size: 15pt; color: #${MUTED}; margin: 0 0 8mm; }
  .cover hr { border: 0; border-top: 2px solid #${ACCENT}; margin: 0 0 6mm; }
  .cover p.note { color: #${MUTED}; font-size: 10pt; margin: 0 0 2mm; }
  section { page-break-before: always; }
  h2 { font-size: 17pt; margin: 0 0 4mm; padding-bottom: 2.5mm; border-bottom: 1.5px solid #${ACCENT}; }
  h3 { font-size: 12.5pt; margin: 7mm 0 2.5mm; }
  p { margin: 0 0 3mm; }
  p.mono { font-family: Consolas, "SF Mono", monospace; }
  ul, ol { margin: 0 0 4mm; padding-left: 6mm; }
  li { margin: 0 0 2mm; }
  .callout { background: #${CALLOUT_BG}; border-left: 4px solid #${ACCENT}; padding: 3.5mm 4.5mm; font-weight: 600; margin: 0 0 4mm; page-break-inside: avoid; }
  blockquote { margin: 0 0 4mm; padding-left: 5mm; border-left: 2px solid #${RULE}; page-break-inside: avoid; }
  blockquote p { margin: 0 0 2mm; }
  blockquote .attrib { color: #${MUTED}; font-style: italic; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 4.5mm; font-size: 9.5pt; table-layout: fixed; }
  th, td { border: 1px solid #${RULE}; padding: 2mm 2.5mm; text-align: left; vertical-align: top; word-wrap: break-word; }
  th { background: #${HEAD_BG}; color: #fff; }
  tr { page-break-inside: avoid; }
  .toc li { margin: 0 0 1.5mm; }
</style></head><body>
<div class="cover">
  <div class="strap">${esc(DOC.strapline)}</div>
  <h1>${esc(DOC.title)}</h1>
  <p class="sub">${esc(DOC.subtitle)}</p>
  <hr>
  <p class="note">Prepared ${generatedOn}. Prices and guardrail figures are read from the platform's own source at build time.</p>
  <p class="note">Every rate that could not be measured is marked ASSUMED and names the evidence that replaces it.</p>
</div>
<section><h2>Contents</h2><ol class="toc">${DOC.sections.map((s) => `<li>${esc(s.h)}</li>`).join("")}</ol></section>
${DOC.sections.map((s) => `<section><h2>${esc(s.h)}</h2>${s.blocks.map(htmlBlock).join("\n")}</section>`).join("\n")}
</body></html>`;

// ---------------------------------------------------------------- main

mkdirSync(OUT_DIR, { recursive: true });

const htmlPath = join(OUT_DIR, `${BASE}.html`);
writeFileSync(htmlPath, buildHtml(), "utf8");

const docxPath = join(OUT_DIR, `${BASE}.docx`);
const buffer = await Packer.toBuffer(buildDocx());
writeFileSync(docxPath, buffer);

const pdfPath = join(OUT_DIR, `${BASE}.pdf`);
execFileSync(CHROME, [
  "--headless", "--disable-gpu", "--no-sandbox",
  "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
  `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
], { stdio: "pipe" });

console.log(`docx  ${docxPath}`);
console.log(`pdf   ${pdfPath}`);
console.log(`html  ${htmlPath}`);
console.log(`${DOC.sections.length} sections`);
