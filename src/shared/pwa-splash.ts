// MarketWar OS — PWA launch screens (client-safe, pure data).
//
// WHAT ACTUALLY HAPPENS WHEN SOMEBODY OPENS THE INSTALLED APP, PER PLATFORM.
//
// ANDROID / CHROME already works and needs nothing here. Chrome builds a splash
// from the manifest: `name`, `background_color` and the 512px icon. All three
// have been in `public/manifest.webmanifest` since it was written, so the app
// already opens on a dark branded screen there. Adding anything for Android
// would be work that changes nothing, which is worse than no work.
//
// iOS AND iPadOS IGNORE THE MANIFEST FOR THIS ENTIRELY. Safari uses
// `apple-touch-startup-image`, one link per device geometry, matched by a media
// query that must state device-width, device-height, pixel ratio AND
// orientation. If nothing matches, there is no splash: the app opens on a white
// rectangle and then the page appears. That white flash is the whole defect, and
// it is worst on exactly the device where the app looks most like a native one.
//
// AND THERE IS A THIRD GAP NOBODY COUNTS. The OS splash disappears the moment
// the document loads, which is BEFORE the app knows who you are. On this
// platform that lands on a bare spinner on an unstyled background while Firebase
// resolves the session. So the launch is: dark splash → flash → lone spinner →
// dashboard. `AppSplash` closes that last one, and it is the only part of this
// that Android users also see.
//
// WHY THE LIST LIVES HERE. The generator that writes the PNGs and the head tags
// that reference them must agree exactly — a link whose file does not exist is
// a white flash with extra steps, and a file nothing references is dead weight
// in the bundle. One list, both consumers, and a test that walks it.

export type SplashDevice = {
  /** What it is, for the filename and for a person reading the head tags. */
  id: string;
  label: string;
  /** CSS pixels — what the media query matches on. */
  width: number;
  height: number;
  /** Device pixel ratio. Width × ratio is the real PNG size. */
  ratio: number;
};

/**
 * The device geometries iOS actually reports.
 *
 * Grouped by geometry rather than by model, because several models share one:
 * every phone at 393×852@3 gets the same file, and listing them separately
 * would be twelve identical images.
 *
 * A geometry missing from this list gets no splash on that device — iOS does
 * not fall back to a smaller one. That is why the list is long and why the test
 * checks each entry has a real file rather than trusting it.
 */
export const SPLASH_DEVICES: SplashDevice[] = [
  { id: "430x932x3", label: "iPhone 17 Pro Max, 16 Pro Max, 15 Pro Max, 14 Pro Max", width: 430, height: 932, ratio: 3 },
  { id: "402x874x3", label: "iPhone 16 Pro", width: 402, height: 874, ratio: 3 },
  { id: "393x852x3", label: "iPhone 16, 15 Pro, 15, 14 Pro", width: 393, height: 852, ratio: 3 },
  { id: "428x926x3", label: "iPhone 14 Plus, 13 Pro Max, 12 Pro Max", width: 428, height: 926, ratio: 3 },
  { id: "390x844x3", label: "iPhone 14, 13, 13 Pro, 12, 12 Pro", width: 390, height: 844, ratio: 3 },
  { id: "375x812x3", label: "iPhone 13 mini, 12 mini, 11 Pro, XS, X", width: 375, height: 812, ratio: 3 },
  { id: "414x896x3", label: "iPhone 11 Pro Max, XS Max", width: 414, height: 896, ratio: 3 },
  { id: "414x896x2", label: "iPhone 11, XR", width: 414, height: 896, ratio: 2 },
  { id: "414x736x3", label: "iPhone 8 Plus, 7 Plus, 6s Plus", width: 414, height: 736, ratio: 3 },
  { id: "375x667x2", label: "iPhone SE (2nd/3rd gen), 8, 7, 6s", width: 375, height: 667, ratio: 2 },
  { id: "1024x1366x2", label: "iPad Pro 12.9\"", width: 1024, height: 1366, ratio: 2 },
  { id: "834x1210x2", label: "iPad Pro 11\" (M4)", width: 834, height: 1210, ratio: 2 },
  { id: "834x1194x2", label: "iPad Pro 11\", iPad Air 10.9\"", width: 834, height: 1194, ratio: 2 },
  { id: "820x1180x2", label: "iPad Air 10.9\" (4th/5th gen)", width: 820, height: 1180, ratio: 2 },
  { id: "810x1080x2", label: "iPad 10.2\"", width: 810, height: 1080, ratio: 2 },
  { id: "768x1024x2", label: "iPad mini, iPad 9.7\"", width: 768, height: 1024, ratio: 2 },
];

export type Orientation = "portrait" | "landscape";
export const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

/** Where the file lives. Same expression in the generator and in the head tag. */
export function splashFile(device: SplashDevice, orientation: Orientation): string {
  return `/brand/splash/${device.id}-${orientation}.png`;
}

/** The real pixel size of that file. Landscape is the portrait geometry turned over. */
export function splashPixels(device: SplashDevice, orientation: Orientation): { width: number; height: number } {
  const w = device.width * device.ratio;
  const h = device.height * device.ratio;
  return orientation === "portrait" ? { width: w, height: h } : { width: h, height: w };
}

/**
 * The media query Safari matches against.
 *
 * All four clauses are required. Dropping the pixel ratio makes an iPhone 11
 * and an iPhone 11 Pro Max — same CSS size, different ratio — collide, and one
 * of them gets a blurred image or none at all.
 */
export function splashMedia(device: SplashDevice, orientation: Orientation): string {
  return [
    `(device-width: ${device.width}px)`,
    `(device-height: ${device.height}px)`,
    `(-webkit-device-pixel-ratio: ${device.ratio})`,
    `(orientation: ${orientation})`,
  ].join(" and ");
}

export type SplashLink = { rel: "apple-touch-startup-image"; media: string; href: string; label: string };

/** Every link tag, in one call, so the head cannot drift from the files. */
export function splashLinks(): SplashLink[] {
  const out: SplashLink[] = [];
  for (const device of SPLASH_DEVICES) {
    for (const orientation of ORIENTATIONS) {
      out.push({
        rel: "apple-touch-startup-image",
        media: splashMedia(device, orientation),
        href: splashFile(device, orientation),
        label: `${device.label} (${orientation})`,
      });
    }
  }
  return out;
}

/** The brand's launch colours. The same values the manifest already declares. */
export const SPLASH_BACKGROUND = "#070a11";
export const SPLASH_ACCENT = "#34d399";

export const SPLASH_DOCTRINE = [
  "Android needed nothing — Chrome already builds a splash from the manifest's name, background colour and 512px icon, all of which were already there. Work that changes nothing is worse than no work.",
  "iOS ignores the manifest for this. Without a matching apple-touch-startup-image the app opens on a white rectangle, on exactly the device where it looks most like a native app.",
  "A geometry missing from the list gets no splash at all — iOS does not fall back to a smaller image, so the list is long on purpose and a test walks every entry.",
  "The generator and the head tags read one list. A link whose file does not exist is a white flash with extra steps; a file nothing references is dead weight.",
  "The OS splash vanishes before the app knows who you are. The in-app launch screen covers that gap, and it is the only part of this Android users also see.",
];
