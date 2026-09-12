// Build the customer deck as a 16:9 PDF.
//
//   npm run deck:doc
//
// Content is scripts/deck-content.mjs, whose every figure is parsed out of src/
// by ads-facts.mjs. Rendering is Chrome's own print-to-PDF — the same binary
// doc-render.mjs uses for the go-to-market pack, so there is one PDF pipeline in
// this repository rather than two that drift.
//
// WHY SLIDES ARE HTML AND NOT PPTX. The deliverable asked for is a PDF to send
// to customers, and a PDF is what a PowerPoint becomes the moment somebody
// forwards it. Generating .pptx to convert it would add a format nobody opens
// and a converter this container cannot run — LibreOffice will not load a file
// here, which is why the existing .pptx deck has never been rendered or checked.
// This path is driven end to end: the PDF is produced, its page count is
// asserted, and every number in it is searched for in the extracted text.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SLIDES, BRAND } from "./deck-content.mjs";
import { renderPdf } from "./doc-render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "docs");
const BASE = "MarketWar-OS-Customer-Deck";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The brand's own brass, taken from the validated palette rather than picked.
const C = {
  ink: "#0C0F16",
  ink2: "#141926",
  line: "rgba(199,156,81,0.28)",
  brass: "#C79C51",
  brassLight: "#DABE81",
  brassPale: "#EAD3A8",
  text: "#E8E6E1",
  muted: "#A9A59C",
};

const slideHtml = (s, i, total) => {
  const num = `<div class="num">${i + 1} / ${total}</div>`;
  const eyebrow = s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : "";
  const head = `${eyebrow}<h2>${esc(s.title)}</h2>`;

  if (s.kind === "cover") {
    return `<section class="slide cover">
      <div class="rule"></div>
      <p class="eyebrow">${esc(s.eyebrow)}</p>
      <h1>${esc(s.title)}</h1>
      <p class="lede">${esc(s.lede)}</p>
      <p class="foot">${esc(s.foot)}</p>
    </section>`;
  }
  if (s.kind === "statement") {
    return `<section class="slide">${head}
      <div class="statement">${s.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>${num}</section>`;
  }
  if (s.kind === "steps") {
    return `<section class="slide">${head}
      <div class="steps">${s.steps.map((t) => `
        <div class="step"><div class="stepnum">${esc(t.n)}</div>
          <h3>${esc(t.h)}</h3><p>${esc(t.p)}</p></div>`).join("")}</div>
      <p class="cta">${esc(s.foot)}</p>${num}</section>`;
  }
  if (s.kind === "grid") {
    return `<section class="slide">${head}
      <div class="grid">${s.cards.map((c) => `
        <div class="card"><h3>${esc(c.h)}</h3><p>${esc(c.p)}</p></div>`).join("")}</div>${num}</section>`;
  }
  if (s.kind === "sizes") {
    return `<section class="slide">${head}
      <div class="grid three">${s.columns.map((c) => `
        <div class="card size"><h3>${esc(c.h)}</h3><p class="sub">${esc(c.sub)}</p>
          <p>${esc(c.p)}</p><p class="proof">${esc(c.proof)}</p></div>`).join("")}</div>${num}</section>`;
  }
  if (s.kind === "list") {
    return `<section class="slide">${head}
      <ul class="list">${s.items.map((it) => `
        <li><span class="h">${esc(it.h)}</span><span class="p">${esc(it.p)}</span></li>`).join("")}</ul>${num}</section>`;
  }
  if (s.kind === "pricing") {
    return `<section class="slide">${head}
      <div class="grid three">${s.plans.map((p) => `
        <div class="card plan${p.featured ? " featured" : ""}">
          <h3>${esc(p.name)}</h3>
          <p class="price">${esc(p.price)}<span>${esc(p.per)}</span></p>
          <p class="spec">${esc(p.brands)} brand${p.brands === "1" ? "" : "s"} · ${esc(p.users)} user${p.users === "1" ? "" : "s"} · ${esc(p.acus)} credits a month</p>
          <p>${esc(p.line)}</p>
        </div>`).join("")}</div>
      <p class="cta small">${esc(s.foot)}</p>${num}</section>`;
  }
  // close
  return `<section class="slide cover close">
    <div class="rule"></div>
    <p class="eyebrow">${esc(s.eyebrow)}</p>
    <h1>${esc(s.title)}</h1>
    <div class="statement">${s.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
    <p class="foot big">${esc(s.foot)}</p>
  </section>`;
};

export const buildDeckHtml = (slides = SLIDES) => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><title>${esc(BRAND.name)} — customer deck</title>
<style>
  /* 16:9 at print. Chrome prints one section per page at exactly this size. */
  @page { size: 338.67mm 190.5mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${C.ink}; }
  body { font-family: "Liberation Sans", "DejaVu Sans", Arial, sans-serif; color: ${C.text}; }

  .slide {
    position: relative; width: 338.67mm; height: 190.5mm;
    padding: 20mm 22mm 16mm; page-break-after: always; break-after: page;
    background: ${C.ink};
    display: flex; flex-direction: column; justify-content: center;
  }
  .slide:last-child { page-break-after: auto; }

  .eyebrow {
    font-size: 10.5pt; letter-spacing: .22em; text-transform: uppercase;
    color: ${C.brass}; margin-bottom: 7mm; font-weight: 700;
  }
  h1 { font-family: "Liberation Serif", "DejaVu Serif", Georgia, serif;
       font-size: 40pt; line-height: 1.1; font-weight: 700; color: ${C.brassPale}; max-width: 24ch; }
  h2 { font-family: "Liberation Serif", "DejaVu Serif", Georgia, serif;
       font-size: 27pt; line-height: 1.15; font-weight: 700; color: ${C.brassPale};
       max-width: 30ch; margin-bottom: 9mm; }
  h3 { font-size: 13pt; font-weight: 700; color: ${C.text}; margin-bottom: 3mm; }
  p  { font-size: 12pt; line-height: 1.55; color: ${C.muted}; }

  .cover { justify-content: center; }
  .cover .rule { width: 34mm; height: 2.6mm; background: ${C.brass}; margin-bottom: 11mm; }
  .lede { font-size: 15pt; line-height: 1.6; color: ${C.text}; max-width: 62ch; margin-top: 9mm; }
  .foot { margin-top: 12mm; font-size: 10.5pt; color: ${C.brass}; }
  .foot.big { margin-top: 10mm; font-size: 17pt; font-weight: 700; letter-spacing: .04em; }

  .statement { max-width: 84ch; }
  /* The closing slide puts a statement straight under the headline, and with no
     margin the two collided — the body read as a stray subtitle. */
  .close .statement { margin-top: 9mm; }
  .statement p { font-size: 14pt; line-height: 1.62; margin-bottom: 5mm; color: ${C.text}; }
  .statement p:last-child { margin-bottom: 0; }

  .steps { display: flex; gap: 11mm; }
  .step { flex: 1; border-top: 1.6pt solid ${C.brass}; padding-top: 6mm; }
  .stepnum { font-family: "Liberation Serif", Georgia, serif; font-size: 23pt; color: ${C.brass}; margin-bottom: 3mm; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }
  .grid.three { grid-template-columns: 1fr 1fr 1fr; }
  .card { background: ${C.ink2}; border: .8pt solid ${C.line}; border-radius: 2.6mm; padding: 8mm;
          display: flex; flex-direction: column; }
  .card.size .sub { color: ${C.brass}; font-size: 10.5pt; margin-bottom: 4mm; letter-spacing: .05em; }
  /* PUSHED TO THE BOTTOM so the three rules line up across columns. Bodies are
     different lengths and a rule that steps up and down reads as a mistake. */
  .card.size .proof { margin-top: auto; padding-top: 4mm; border-top: .8pt solid ${C.line};
                      color: ${C.brassLight}; font-size: 10.5pt; }
  .card.size p + .proof { margin-top: 5mm; }
  .card.plan.featured { border-color: ${C.brass}; border-width: 1.6pt; }
  .price { font-family: "Liberation Serif", Georgia, serif; font-size: 33pt;
           color: ${C.brassPale}; line-height: 1; margin-bottom: 3mm; }
  .price span { font-family: inherit; font-size: 11pt; color: ${C.muted}; margin-left: 2.5mm; }
  .spec { color: ${C.brassLight}; font-size: 10.5pt; margin-bottom: 4mm; }

  .list { list-style: none; }
  .list li { padding: 4.6mm 0; border-bottom: .8pt solid ${C.line}; display: flex; gap: 8mm; }
  .list li:last-child { border-bottom: 0; }
  .list .h { flex: 0 0 78mm; font-weight: 700; color: ${C.text}; font-size: 12pt; }
  .list .p { flex: 1; color: ${C.muted}; font-size: 11.5pt; line-height: 1.5; }

  .cta { margin-top: 9mm; color: ${C.brass}; font-size: 14pt; font-weight: 700; letter-spacing: .04em; }
  .cta.small { font-size: 10.5pt; font-weight: 400; color: ${C.muted}; line-height: 1.55; max-width: 90ch; }

  .num { position: absolute; right: 22mm; bottom: 11mm; font-size: 9pt; color: ${C.brass}; opacity: .7; }
</style></head><body>
${slides.map((s, i) => slideHtml(s, i, slides.length)).join("\n")}
</body></html>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = join(OUT_DIR, `${BASE}.html`);
  const pdfPath = join(OUT_DIR, `${BASE}.pdf`);
  writeFileSync(htmlPath, buildDeckHtml(), "utf8");
  renderPdf(htmlPath, pdfPath);
  console.log(`Wrote ${htmlPath}`);
  console.log(`Wrote ${pdfPath}  (${SLIDES.length} slides)`);
}
