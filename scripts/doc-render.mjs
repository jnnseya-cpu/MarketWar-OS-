// THE DOCUMENT RENDERER, shared by every .docx/.pdf this repo produces.
//
// It was inside build-gtm-doc.mjs and had one caller. The ads bundle is the
// second, and a second renderer would be a second source of truth about what a
// MarketWar document looks like — the two would drift on the first change to
// either. So it moved out here whole; the go-to-market builder's output is
// unchanged, byte for byte, which is the only acceptable result of extracting
// working code.
//
// A document is DATA:
//
//   { title, subtitle, strapline, notes: [...], sections: [{ h, blocks: [...] }] }
//
// Block types: h2 · p (+mono) · callout · quote (+attrib) · bullets · numbered
//              · table {head, rows, widths} · copy {label, text, mono}
//
// `copy` is the one added for the ads bundle: a bordered box holding text that
// exists to be selected and pasted somewhere else. It is a block type rather
// than bold-prose-in-a-paragraph because the reader has to be able to see, at a
// glance and without reading, exactly where the pasteable text starts and stops.

import {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, LevelFormat,
  convertInchesToTwip,
} from "docx";
import { execFileSync } from "node:child_process";

// A4 (these are UK documents in pounds), 1in margins. Content width in DXA:
export const PAGE = { width: 11906, height: 16838 };
export const MARGIN = convertInchesToTwip(1);
export const CONTENT_W = PAGE.width - MARGIN * 2; // 9026

export const INK = "1A1D26";
export const MUTED = "5A6072";
export const ACCENT = "1F4FD8";
export const RULE = "D8DCE6";
export const CALLOUT_BG = "EEF2FE";
export const HEAD_BG = "1A1D26";
export const COPY_BG = "F6F7FA";
export const COPY_EDGE = "C3CAD8";

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

// A box of text that exists to be selected and pasted into Ads Manager. Every
// line is its own paragraph: docx has no \n, and a blank line inside ad copy is
// a real blank line in the ad, not spacing.
// The block's field is `copy`, not `text`. Naming it `text` here is what made
// every box in the first build render the literal word "undefined" in the .docx
// while the .html was perfect — the value existed on one side of the boundary
// and was never carried across. It is destructured by its real name for that
// reason, and the throw below means a future rename fails the build instead of
// shipping thirty-one empty boxes.
const renderCopy = ({ label, copy, mono }) => {
  if (typeof copy !== "string") throw new Error(`doc-render: copy block has no text (label: ${label ?? "none"})`);
  const lines = copy.split("\n");
  const children = [];
  if (label) {
    children.push(new Paragraph({
      spacing: { after: 90, line: 260 },
      // allCaps, not toUpperCase() — Word draws it in capitals while the
      // underlying string stays exactly what the content file wrote, so a
      // verifier looking for "Primary text" finds it. The HTML render does the
      // same thing with text-transform for the same reason.
      children: [new TextRun({ text: label, color: MUTED, size: 16, bold: true, allCaps: true, characterSpacing: 40 })],
    }));
  }
  lines.forEach((line, i) => children.push(new Paragraph({
    spacing: { after: i === lines.length - 1 ? 0 : (line.trim() ? 80 : 40), line: 290 },
    children: [new TextRun({
      text: line, color: INK, size: mono ? 18 : 20,
      font: mono ? "Consolas" : undefined,
    })],
  })));

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COPY_EDGE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COPY_EDGE },
      left: { style: BorderStyle.SINGLE, size: 4, color: COPY_EDGE },
      right: { style: BorderStyle.SINGLE, size: 4, color: COPY_EDGE },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: COPY_BG, color: "auto" },
        margins: { top: 170, bottom: 170, left: 200, right: 200 },
        children,
      })],
    })],
  });
};

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
  if (b.copy) return [renderCopy(b), body("", { after: 80 })];
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
  throw new Error(`doc-render: unknown block ${JSON.stringify(Object.keys(b))}`);
};

export const buildDocx = (DOC, generatedOn) => {
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
    ...DOC.notes.map((n) => body(n.replace("{date}", generatedOn), { color: MUTED, size: 20 })),
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
  if (b.copy) return `<div class="copy${b.mono ? " mono" : ""}">` +
    (b.label ? `<div class="copylabel">${esc(b.label)}</div>` : "") +
    b.copy.split("\n").map((l) => `<p>${esc(l) || "&nbsp;"}</p>`).join("") + "</div>";
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
  throw new Error("doc-render: unknown block in html render");
};

export const buildHtml = (DOC, generatedOn) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
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
  .copy { background: #${COPY_BG}; border: 1px solid #${COPY_EDGE}; border-radius: 2mm; padding: 4mm 4.5mm; margin: 0 0 4.5mm; page-break-inside: avoid; }
  .copy p { margin: 0 0 1.8mm; }
  .copy p:last-child { margin-bottom: 0; }
  /* pre-wrap, because the settings blocks are aligned in columns with runs of
     spaces and HTML would otherwise collapse every run to one. Word keeps them
     (docx writes xml:space="preserve"), so without this the .docx and the .pdf
     would show the same block laid out two different ways. */
  .copy.mono p { font-family: Consolas, "SF Mono", monospace; font-size: 9.5pt; white-space: pre-wrap; }
  .copylabel { color: #${MUTED}; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 2.5mm; }
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
  ${DOC.notes.map((n) => `<p class="note">${esc(n.replace("{date}", generatedOn))}</p>`).join("\n  ")}
</div>
<section><h2>Contents</h2><ol class="toc">${DOC.sections.map((s) => `<li>${esc(s.h)}</li>`).join("")}</ol></section>
${DOC.sections.map((s) => `<section><h2>${esc(s.h)}</h2>${s.blocks.map(htmlBlock).join("\n")}</section>`).join("\n")}
</body></html>`;

// ---------------------------------------------------------------- pdf

export const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export const renderPdf = (htmlPath, pdfPath) => execFileSync(CHROME, [
  "--headless", "--disable-gpu", "--no-sandbox",
  "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
  `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
], { stdio: "pipe" });

// ---------------------------------------------------------------- verification

/**
 * Every string a document claims to contain, flattened, for a verifier to look
 * for in the rendered output. It lives here, beside the renderer, so that adding
 * a block type to one without teaching the other is a single-file mistake rather
 * than a silent hole in every verifier in the repo.
 */
export const collectStrings = (DOC) => {
  const strings = [];
  const push = (where, s) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); if (t) strings.push({ where, t }); };

  DOC.sections.forEach((s) => {
    push("heading", s.h);
    s.blocks.forEach((b) => {
      if (b.h2) push("h2", b.h2);
      if (b.p) push("p", b.p);
      if (b.callout) push("callout", b.callout);
      if (b.copy) { push("copy-label", b.label); b.copy.split("\n").forEach((l) => push("copy", l)); }
      if (b.quote) { b.quote.split("\n").forEach((l) => push("quote", l)); push("attrib", b.attrib); }
      if (b.bullets) b.bullets.forEach((t) => push("bullet", t));
      if (b.numbered) b.numbered.forEach((t) => push("numbered", t));
      if (b.table) {
        b.table.head.forEach((t) => push("th", t));
        b.table.rows.forEach((r) => r.forEach((t) => push("td", t)));
        if (b.table.widths.reduce((a, c) => a + c, 0) !== 100) {
          throw new Error(`doc-render: table widths do not total 100 — ${b.table.head.join(" | ")}`);
        }
        b.table.rows.forEach((r) => {
          if (r.length !== b.table.head.length) {
            throw new Error(`doc-render: row of ${r.length} against ${b.table.head.length} columns — ${b.table.head.join(" | ")}`);
          }
        });
      }
    });
  });
  return strings;
};

/** word/document.xml, reduced to the visible text. */
export const docxText = (docxPath) => execFileSync("unzip", ["-p", docxPath, "word/document.xml"], { maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8")
  .replace(/<w:p[ >]/g, "\n<w:p ")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/[ \t]+/g, " ");

/** The HTML render, reduced to the visible text. */
export const htmlText = (html) => html
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ");

export const flat = (s) => String(s).replace(/\s+/g, " ").trim();
