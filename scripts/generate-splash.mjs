#!/usr/bin/env node
// Generate the iOS/iPadOS launch images.
//
// Run: npm run splash
//
// Reads the device list from src/shared/pwa-splash.ts — the same list the head
// tags read — so a file and its link can never disagree. Adding a device there
// and re-running is the whole workflow.
//
// The images are deliberately plain: the brand mark, centred, on the same
// background colour the manifest already declares. A launch screen is not a
// place for a message. It exists to make the app appear to open instantly, and
// anything a person could want to read is gone before they finish reading it.
//
// Flat background plus one small mark compresses to a few kilobytes each even
// at 2732px, which is why 32 files is a sane thing to commit.

import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Read the device list out of the TypeScript source without a build step: the
// file is pure data, so the declarations can be evaluated directly.
const specSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(join(ROOT, "src/shared/pwa-splash.ts"), "utf8"));

const devices = [...specSrc.matchAll(
  /\{\s*id:\s*"([^"]+)",\s*label:\s*"((?:[^"\\]|\\.)*)",\s*width:\s*(\d+),\s*height:\s*(\d+),\s*ratio:\s*(\d+)\s*\}/g,
)].map((m) => ({ id: m[1], label: m[2], width: Number(m[3]), height: Number(m[4]), ratio: Number(m[5]) }));

if (devices.length === 0) {
  console.error("No devices parsed from src/shared/pwa-splash.ts — refusing to write an empty set.");
  process.exit(1);
}

const BACKGROUND = "#070a11";
// THE TRANSPARENT MARK, NOT THE APP ICON.
//
// The first version composited `icon-512.png` and it looked wrong on a device
// in a way it never does in a file listing: that icon is OPAQUE — it carries
// its own slightly lighter navy tile — so it landed on the splash as a visible
// rectangle floating in the middle of the screen. `marketwar-os-mark.png` is
// the same mark with a real alpha channel, so it sits ON the background instead
// of on a patch of its own.
const MARK = join(ROOT, "public/brand/marketwar-os-mark.png");
const OUT_DIR = join(ROOT, "public/brand/splash");

if (!existsSync(MARK)) {
  console.error(`Brand mark not found at ${MARK}.`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const bg = { r: 0x07, g: 0x0a, b: 0x11, alpha: 1 };
let written = 0;
let bytes = 0;

for (const device of devices) {
  for (const orientation of ["portrait", "landscape"]) {
    const w = device.width * device.ratio;
    const h = device.height * device.ratio;
    const width = orientation === "portrait" ? w : h;
    const height = orientation === "portrait" ? h : w;

    // A quarter of the SHORT edge, capped. Sized off the short edge so a
    // landscape iPad does not get a mark that fills the screen.
    const mark = Math.round(Math.min(Math.min(width, height) * 0.32, 520));
    // `trim` first: the source has transparent padding around the mark, and
    // without this the visible artwork ends up noticeably smaller than asked
    // for on every device.
    const logo = await sharp(MARK)
      .trim()
      .resize(mark, mark, { fit: "inside", background: { ...bg, alpha: 0 } })
      .png()
      .toBuffer();

    const out = await sharp({ create: { width, height, channels: 4, background: bg } })
      .composite([{ input: logo, gravity: "centre" }])
      // A flat background with one mark needs no true colour; the palette keeps
      // a 2732px file in the low tens of kilobytes.
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

    const file = join(OUT_DIR, `${device.id}-${orientation}.png`);
    writeFileSync(file, out);
    written += 1;
    bytes += statSync(file).size;
  }
}

console.log(`Wrote ${written} launch images to public/brand/splash (${(bytes / 1024).toFixed(0)} KB total).`);
console.log(`Devices covered: ${devices.length}. Every one has a portrait and a landscape file.`);
