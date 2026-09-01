#!/usr/bin/env node
// THE CHART PALETTE, CHECKED RATHER THAN CLAIMED.
//
// `src/shared/palette.ts` carried the comment "CVD-optimised fixed order,
// validated against the card surface #101624". Two problems with that. It was a
// SENTENCE — nothing re-ran when somebody changed a hex — and the surface it
// names is no longer the surface: the panel is #121213 now, so the contrast half
// of that claim expired the moment the identity changed.
//
// A comment that says a thing was validated, on a file nothing validates, is the
// same defect class as a test that has never failed. So this computes it.
//
// SIX CHECKS, and the ones that matter most are the last three:
//
//   1. LIGHTNESS BAND — every series sits in a usable range against the surface.
//      A colour too dark disappears into the panel; too light and it glares.
//   2. CHROMA FLOOR — a series colour must actually be a colour. Below the floor
//      it reads as grey and stops being an identity.
//   3. CVD SEPARATION, ADJACENT PAIRS — simulated deuteranopia, protanopia and
//      tritanopia. Series 1 and 2 sit next to each other in every legend, so
//      those are the pairs that have to survive; ΔE ≥ 8 in OKLab×100.
//   4. NORMAL-VISION SEPARATION — a hard floor of 15. If full-colour readers
//      cannot tell two adjacent series apart, no amount of CVD safety helps, and
//      this is the check that catches a palette tuned so hard for CVD that it
//      collapsed for everyone else.
//   5. CONTRAST vs the surface — 3:1, the non-text minimum, because a 2px line
//      IS the information.
//   6. THE ORDINAL RAMP is monotonic in lightness. A sequential ramp that goes
//      light-dark-light encodes magnitude as nonsense.
//
// Run: node scripts/check-palette.mjs

import { readFileSync } from "node:fs";

const SURFACE = "#121213";  // .card background in globals.css
const GROUND = "#0A0A0B";   // --mw-bg

// ---------------------------------------------------------------------------
// Colour maths. sRGB → linear → OKLab, and the standard CVD simulation
// matrices (Viénot, Brettel & Mollon) applied in linear light.
// ---------------------------------------------------------------------------

const hexToRgb = (hex) => {
  const h = hex.replace("#", "").trim();
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearOf = (hex) => hexToRgb(hex).map(toLinear);

function oklab([lr, lg, lb]) {
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab ΔE ×100 — the scale the thresholds above are quoted in. */
const deltaE = (a, b) => {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
};

const CVD = {
  deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
};
const simulate = (lin, m) => m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);

const relLuminance = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
const contrast = (a, b) => {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lightness = (lin) => oklab(lin)[0];
const chroma = (lin) => { const [, a, b] = oklab(lin); return Math.hypot(a, b); };

// ---------------------------------------------------------------------------

function readPalette() {
  const src = readFileSync(new URL("../src/shared/palette.ts", import.meta.url), "utf8");
  const grab = (name) => {
    const m = src.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
    if (!m) throw new Error(`${name} not found in palette.ts`);
    return [...m[1].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((x) => x[1]);
  };
  return { SERIES: grab("SERIES"), ORDINAL: grab("ORDINAL") };
}

const { SERIES, ORDINAL } = readPalette();
const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);

// 1 + 2 + 5 — per colour, against the real surface.
for (const [i, hex] of SERIES.entries()) {
  const lin = linearOf(hex);
  const L = lightness(lin);
  const C = chroma(lin);
  const ratio = contrast(lin, linearOf(SURFACE));

  if (L < 0.45 || L > 0.85) fail(`series ${i + 1} ${hex}: lightness ${L.toFixed(3)} outside 0.45–0.85 — it either sinks into the panel or glares off it`);
  if (C < 0.06) fail(`series ${i + 1} ${hex}: chroma ${C.toFixed(3)} below 0.06 — it reads as grey, so it is not an identity`);
  if (ratio < 3) fail(`series ${i + 1} ${hex}: ${ratio.toFixed(2)}:1 against the panel ${SURFACE} — below the 3:1 a 2px line needs to be seen`);
  const onGround = contrast(lin, linearOf(GROUND));
  if (onGround < 3) warnings.push(`series ${i + 1} ${hex}: ${onGround.toFixed(2)}:1 against the page ground — fine inside a card, thin on the bare page`);
}

// 3 + 4 — adjacent pairs, which are the pairs a legend puts side by side.
for (let i = 0; i < SERIES.length - 1; i++) {
  const a = linearOf(SERIES[i]);
  const b = linearOf(SERIES[i + 1]);

  const normal = deltaE(a, b);
  if (normal < 15) fail(`series ${i + 1} and ${i + 2} (${SERIES[i]}, ${SERIES[i + 1]}): ΔE ${normal.toFixed(1)} for normal vision — below the hard floor of 15, so full-colour readers cannot tell them apart either`);

  for (const [name, m] of Object.entries(CVD)) {
    const d = deltaE(simulate(a, m), simulate(b, m));
    if (d < 8) fail(`series ${i + 1} and ${i + 2} (${SERIES[i]}, ${SERIES[i + 1]}): ΔE ${d.toFixed(1)} under ${name} — below 8, they merge`);
    else if (d < 10) warnings.push(`series ${i + 1} and ${i + 2}: ΔE ${d.toFixed(1)} under ${name} — passes, but only with a legend or direct labels`);
  }
}

// 6 — the sequential ramp must actually be sequential.
const ordL = ORDINAL.map((h) => lightness(linearOf(h)));
for (let i = 0; i < ordL.length - 1; i++) {
  if (ordL[i] <= ordL[i + 1]) fail(`ordinal ramp step ${i + 1}→${i + 2} does not get darker (${ordL[i].toFixed(3)} → ${ordL[i + 1].toFixed(3)}) — a sequential ramp that reverses encodes magnitude as nonsense`);
}

if (failures.length) {
  console.error("Palette check FAILED:\n" + failures.map((f) => `  ✗ ${f}`).join("\n"));
  if (warnings.length) console.error("\nWarnings:\n" + warnings.map((w) => `  · ${w}`).join("\n"));
  process.exit(1);
}
console.log(`Palette check passed — ${SERIES.length} series and a ${ORDINAL.length}-step ramp, on the real panel ${SURFACE}.`);
if (warnings.length) console.log("Warnings:\n" + warnings.map((w) => `  · ${w}`).join("\n"));
