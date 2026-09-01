#!/usr/bin/env node
// BOTH THEMES MUST BE READABLE, AND THAT IS ARITHMETIC.
//
// The first light build shipped `text-amber-200` — a pale tint drawn for a black
// background — onto a pale amber warning card. Contrast 1.6:1. The warning was
// invisible, which is the worst possible thing for a warning to be, and it
// looked fine in every place I happened to screenshot.
//
// A theme is a hundred and fifty numbers. Eyeballing three screenshots proves
// nothing about the other ninety-seven combinations, and "I looked at it" is the
// same standard the chart palette was held to for months while three of its
// colours were invisible to colour-blind readers.
//
// So the pairs that actually occur in this codebase are checked, in BOTH themes,
// against WCAG 2.1 contrast. The pairs are not invented: each one is a
// class combination the app really uses, named in the comment beside it.
//
// Run: node scripts/check-contrast.mjs

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/** Pull one theme's `--c-*` triples out of the stylesheet. */
function tokens(themeSelector) {
  const start = css.indexOf(themeSelector);
  if (start < 0) throw new Error(`${themeSelector} not found in globals.css`);
  // Read to the end of that rule block.
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const out = {};
  for (const m of block.matchAll(/--c-([a-z]+(?:-\d+)?): (\d+) (\d+) (\d+);/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  // The panel/page surfaces are plain hex, not triples.
  for (const m of block.matchAll(/--mw-(bg|panel): (#[0-9a-fA-F]{6});/g)) {
    const h = m[2].slice(1);
    out[`mw-${m[1]}`] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  return out;
}

const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// Every pair here is a real combination in the app. `min` is 4.5 for body text,
// 3.0 for large/display text and for non-text marks that carry meaning.
const PAIRS = [
  // Body and secondary text on the page and on a panel.
  ["slate-200", "mw-bg", 4.5, "body text on the page (body { @apply text-slate-200 })"],
  ["slate-200", "mw-panel", 4.5, "body text inside a .card"],
  ["slate-300", "mw-panel", 4.5, "the commonest secondary text in panels"],
  ["slate-400", "mw-panel", 4.5, "muted copy under headings — used 2,168 times"],
  ["slate-400", "mw-bg", 4.5, "muted copy directly on the page"],
  ["white", "mw-bg", 4.5, "headings (text-white), used 873 times"],
  ["white", "mw-panel", 4.5, "headings inside a panel"],

  // The accent as text. Brass is the whole identity; unreadable brass is worse
  // than no brass.
  ["emerald-300", "mw-panel", 4.5, "accent text — 372 uses"],
  ["emerald-400", "mw-panel", 4.5, "accent text and icons — the primary accent"],
  ["emerald-400", "mw-bg", 4.5, "accent text on the page"],
  ["emerald-200", "mw-panel", 4.5, "accent text inside tinted callouts — 61 uses"],

  // Status text. THE ONE THAT BROKE: amber-200 on a light card.
  ["amber-200", "mw-panel", 4.5, "caution text inside a warning card — 77 uses"],
  ["amber-300", "mw-panel", 4.5, "caution text — 122 uses"],
  ["amber-400", "mw-panel", 4.5, "caution icons and labels"],
  ["rose-200", "mw-panel", 4.5, "error text inside an error card — 47 uses"],
  ["rose-300", "mw-panel", 4.5, "error text — 105 uses"],
  ["rose-400", "mw-panel", 4.5, "error icons and labels"],
  ["sky-300", "mw-panel", 4.5, "informational text"],

  // Non-text marks that carry meaning: 3:1 is the floor.
  ["ink-700", "mw-panel", 1.08, "panel hairline — must be visible but must not read as a rule"],
  ["emerald-500", "mw-panel", 3.0, "the accent as a fill/mark"],
];

let failures = [];
for (const [theme, selector] of [["dark", ":root {"], ["light", ':root[data-theme="light"] {']]) {
  const t = tokens(selector);
  for (const [fg, bg, min, why] of PAIRS) {
    const a = t[fg], b = t[bg];
    if (!a) { failures.push(`${theme}: --c-${fg} is not defined`); continue; }
    if (!b) { failures.push(`${theme}: --${bg} is not defined`); continue; }
    const ratio = contrast(a, b);
    if (ratio < min) {
      failures.push(`${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1 — ${why}`);
    }
  }
}

if (failures.length) {
  console.error("Contrast check FAILED:\n" + failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log(`Contrast check passed — ${PAIRS.length} real class pairs, in both themes.`);
