#!/usr/bin/env node
// Social profile assets — the Facebook cover, the square profile mark, and the
// Open Graph card.
//
// Run: npm run social
//
// A SCRIPT RATHER THAN THREE FILES DROPPED IN A FOLDER. The cover has to be
// rebuilt every time the positioning line changes, and a PNG somebody exported
// once from a design tool is a dead end: nobody remembers the safe margins, the
// next version drifts, and the text ends up under the profile photo. This
// encodes the geometry, so regenerating is one command and the constraints
// cannot be forgotten.
//
// THE TWO CONSTRAINTS THAT ACTUALLY BREAK FACEBOOK COVERS:
//
//   1. MOBILE CROPS THE SIDES. The cover renders 820×312 on desktop and about
//      640×360 on a phone — a NARROWER, TALLER window onto the same image. Every
//      pixel outside the central ~78% of the width is cut on mobile, which is
//      where most people will see it. Nothing that matters may sit there.
//   2. THE PROFILE PHOTO SITS ON THE BOTTOM-LEFT on desktop. Text placed there
//      is covered by it. That corner is left deliberately empty.
//
// Built at 2× (1640×624) because Facebook re-compresses whatever it is given and
// a 1× upload arrives visibly soft.
//
// The wordmark is NOT re-typeset here. The real lockup already exists as art
// with its own letter-spacing and gold gradient; redrawing it in Liberation Sans
// would produce a near-miss of the brand, which is worse than not trying. The
// PNG is composited, and only supporting text is set in a system font.
//
// It is also why the cover is LIGHT. "MARKET" in the wordmark is deep navy on
// transparency — on a navy field it disappears. The asset was drawn for a light
// background, so it gets one.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = join(ROOT, "public", "brand");
const OUT = join(BRAND, "social");
mkdirSync(OUT, { recursive: true });

// Brand colours, read off the real logo art rather than guessed.
const NAVY = "#101f38";
const NAVY_DEEP = "#0a1526";
const GOLD = "#c9992e";
const GOLD_LIGHT = "#e5c264";
const INK = "#1b2b45";

// --- Facebook cover ---------------------------------------------------------
const W = 1640, H = 624;
// Mobile keeps roughly the central 78% of the width. Anything outside is gone.
const SAFE_X = Math.round(W * 0.11);          // 180
const SAFE_W = W - SAFE_X * 2;                // 1280
// The profile photo covers about this much of the bottom-left on desktop.
const AVATAR_W = 430, AVATAR_H = 150;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Where the decorative wedge begins, at the top edge and at the bottom edge.
// Deliberately hard against the right: the first render put the headline
// straight through it, because the wedge was wide and the line was long.
const WEDGE_TOP_X = W - 168;
const WEDGE_BOTTOM_X = W - 74;

// Liberation Sans Bold averages a shade over half its point size per character.
// Approximate, and that is fine — it is used to REFUSE a line that is clearly
// too long, not to typeset one. Text overflow on a cover is invisible until
// somebody sees it on the page, which is exactly the wrong time.
const widthOf = (text, size, bold) => text.length * size * (bold ? 0.56 : 0.5);

function coverSvg({ lines, sub, textX, headSize, subSize }) {
  const head = lines
    .map((t, i) => `<text x="${textX}" y="${262 + i * 58}" font-family="Liberation Sans, DejaVu Sans, sans-serif"
        font-size="${headSize}" font-weight="bold" fill="${INK}" letter-spacing="-0.5">${esc(t)}</text>`)
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f4f6f9"/>
      <stop offset="1" stop-color="#e9edf3"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_LIGHT}"/>
    </linearGradient>
    <linearGradient id="navyEdge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- A navy wedge hard against the right edge. It sits OUTSIDE the mobile safe
       area on purpose: it enriches the desktop crop, and losing it on a phone
       costs nothing because no words live in it. -->
  <path d="M ${WEDGE_TOP_X} 0 L ${W} 0 L ${W} ${H} L ${WEDGE_BOTTOM_X} ${H} Z" fill="url(#navyEdge)" opacity="0.97"/>
  <path d="M ${WEDGE_TOP_X - 20} 0 L ${WEDGE_TOP_X} 0 L ${WEDGE_BOTTOM_X} ${H} L ${WEDGE_BOTTOM_X - 20} ${H} Z" fill="url(#gold)" opacity="0.92"/>

  <!-- A hairline of gold along the top: survives every crop, costs nothing. -->
  <rect x="0" y="0" width="${W}" height="6" fill="url(#gold)"/>

  <!-- Supporting copy only — the wordmark itself is composited art. -->
  ${head}
  <text x="${textX}" y="${262 + lines.length * 58 + 14}" font-family="Liberation Sans, DejaVu Sans, sans-serif"
        font-size="${subSize}" fill="#54657f">${esc(sub)}</text>
  <rect x="${textX}" y="${262 + lines.length * 58 + 46}" width="132" height="5" rx="2.5" fill="url(#gold)"/>
</svg>`;
}

async function buildCover() {
  // Two lines, not one. The single-line version ran its last word through the
  // gold wedge — a long headline and a decorated right edge cannot both have
  // the width.
  const lines = ["Every engine your marketing", "needs. One subscription."];
  const sub = "No agency. No twelve separate tools.";
  const headSize = 44, subSize = 26;

  const lockupH = 286;
  const lockup = await sharp(join(BRAND, "marketwar-os-logo.png")).resize({ height: lockupH }).toBuffer();
  const lockupMeta = await sharp(lockup).metadata();

  const left = SAFE_X + 30;
  // Nudged up only slightly: the lockup's own tagline sits at its foot, so
  // centring the ART centres the composition.
  const top = Math.round((H - lockupH) / 2);
  const textX = left + lockupMeta.width + 78;

  // TWO CONSTRAINTS, CHECKED RATHER THAN EYEBALLED.
  //
  // 1. Nothing important may enter the corner the profile photo covers.
  const bottomOfLockup = top + lockupH;
  if (left < AVATAR_W && bottomOfLockup > H - AVATAR_H) {
    throw new Error(`The lockup runs into the profile-photo corner (x=${left}, bottom=${bottomOfLockup}).`);
  }
  // 2. No text may reach the wedge, and none may leave the mobile safe area.
  //    The narrowest point of the wedge is its top edge.
  const limit = Math.min(WEDGE_TOP_X - 24, SAFE_X + SAFE_W);
  for (const [t, size, bold] of [...lines.map((l) => [l, headSize, true]), [sub, subSize, false]]) {
    const end = textX + widthOf(t, size, bold);
    if (end > limit) {
      throw new Error(`"${t}" reaches x≈${Math.round(end)}, past the limit of ${limit}. Shorten it or drop the size.`);
    }
  }

  const out = join(OUT, "facebook-cover.png");
  await sharp(Buffer.from(coverSvg({ lines, sub, textX, headSize, subSize })))
    .composite([{ input: lockup, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  return { out, lockup: `${lockupMeta.width}x${lockupMeta.height}` };
}

// --- Square profile picture -------------------------------------------------
//
// The MARK, not the lockup. Facebook renders a page's profile picture as a
// circle at about 176px and far smaller in feed; a stacked wordmark plus a
// tagline is illegible at that size, so the monogram carries it alone.
async function buildProfile() {
  const S = 1080;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef1f6"/>
    </linearGradient></defs>
    <rect width="${S}" height="${S}" fill="url(#g)"/>
  </svg>`;
  // Generous padding: the circular crop eats the corners, and a mark that runs
  // to the edge comes back clipped.
  const mark = await sharp(join(BRAND, "marketwar-os-mark.png")).resize({ width: Math.round(S * 0.62) }).toBuffer();
  const m = await sharp(mark).metadata();
  const out = join(OUT, "facebook-profile.png");
  await sharp(Buffer.from(bg))
    .composite([{ input: mark, left: Math.round((S - m.width) / 2), top: Math.round((S - m.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  return out;
}

// --- Open Graph card --------------------------------------------------------
// 1200×630 — what a link to marketwaros.com looks like when it is shared.
async function buildOg() {
  const w = 1200, h = 630;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9edf3"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_LIGHT}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect x="0" y="0" width="${w}" height="8" fill="url(#gold)"/>
    <text x="${w / 2}" y="486" text-anchor="middle" font-family="Liberation Sans, DejaVu Sans, sans-serif"
          font-size="38" font-weight="bold" fill="${INK}">Every engine your marketing needs.</text>
    <text x="${w / 2}" y="534" text-anchor="middle" font-family="Liberation Sans, DejaVu Sans, sans-serif"
          font-size="25" fill="#54657f">One subscription. Run it yourself.</text>
  </svg>`;
  const lockup = await sharp(join(BRAND, "marketwar-os-logo.png")).resize({ height: 300 }).toBuffer();
  const m = await sharp(lockup).metadata();
  const out = join(OUT, "og-card.png");
  await sharp(Buffer.from(svg))
    .composite([{ input: lockup, left: Math.round((w - m.width) / 2), top: 96 }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  return out;
}

const cover = await buildCover();
const profile = await buildProfile();
const og = await buildOg();

writeFileSync(
  join(OUT, "README.md"),
  [
    "# Social assets — generated, do not hand-edit",
    "",
    "Rebuild with `npm run social`. Editing these PNGs by hand means the next",
    "run silently discards the change.",
    "",
    "| File | Size | Where it goes |",
    "|---|---|---|",
    "| `facebook-cover.png` | 1640×624 | Facebook Page cover (renders 820×312 desktop, ~640×360 mobile) |",
    "| `facebook-profile.png` | 1080×1080 | Facebook / LinkedIn / X profile picture |",
    "| `og-card.png` | 1200×630 | Open Graph card for shared links |",
    "",
    "The cover keeps everything that matters inside the central 78% of the width,",
    "because a phone crops the rest away, and leaves the bottom-left corner empty,",
    "because the profile photo sits on top of it.",
    "",
  ].join("\n"),
);

console.log(`cover    ${cover.out}  (lockup ${cover.lockup})`);
console.log(`profile  ${profile}`);
console.log(`og       ${og}`);
