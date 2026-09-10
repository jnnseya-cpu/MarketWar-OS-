// THE TITLE AND DESCRIPTION BOUNDS THIS PLATFORM SELLS — in one place, so we
// are measured by the same rule we charge people for.
//
// WHAT WENT WRONG, TWICE, AND THE SECOND TIME ON THE BLOG. These numbers lived
// as inline literals inside `crawler.ts`, which meant nothing else could read
// them. §109 found eight marketing pages outside the bounds our own audit scores
// customers on. The blog was never checked at all, and driving the crawler at
// our own published articles gives:
//
//   why-your-website-gets-no-enquiries   80/100   title 82 chars, description 247
//   free-website-audit-what-to-check     75/100   title 110 chars, description 184
//   marketing-with-no-budget             75/100   title 71 chars, description 195
//
// Title is weight 10 and description weight 8 — 18 of the 100 points, failed on
// every article, by the engine that tells customers to fix exactly this.
//
// A generator cannot honour a rule it cannot read. So the rule moves here, the
// crawler reads it, the page metadata reads it, and the writer is TOLD it and
// then CLAMPED to it — because a model asked for 65 characters will hand back 71.

/** Shortest title a search result renders usefully. */
export const TITLE_MIN = 15;
/** Past this Google truncates, and the last words are never read. */
export const TITLE_MAX = 65;
/** Below this a description is not worth having over none. */
export const DESC_MIN = 50;
/** Past this the tail is cut off in the result. */
export const DESC_MAX = 165;
/**
 * Below this a description is legal and still wasteful.
 *
 * WHY THERE ARE TWO FLOORS. `DESC_MIN` is the point below which a description is
 * not worth having; this is the point below which it is not EARNING what it
 * could. A search result gives roughly 160 characters of snippet, and a 53-
 * character description leaves two thirds of it to the engine to fill from the
 * page — which it does badly, with whatever text happens to be near the match.
 *
 * WE FOUND THIS BY BEING TOLD. Bing Webmaster Tools reported "meta descriptions
 * on many pages are too short" and our own audit had passed every one of them,
 * because our only floor was 50. Measured: twelve pages under 120 characters,
 * /terms at 53, /policies at 55, /privacy at 67, /contact at 97. A competitor's
 * tool caught something the audit this platform SELLS did not, which is a gap in
 * the product and not merely in our own pages.
 */
export const DESC_THIN = 120;

/** Legal, but leaving most of the snippet unwritten. */
export const descriptionThin = (d: string): boolean => {
  const n = String(d ?? "").trim().length;
  return n >= DESC_MIN && n < DESC_THIN;
};

/** Is this title inside the bounds the audit scores? */
export const titleOk = (t: string): boolean => t.trim().length >= TITLE_MIN && t.trim().length <= TITLE_MAX;
/** Is this description inside them? */
export const descriptionOk = (d: string): boolean => d.trim().length >= DESC_MIN && d.trim().length <= DESC_MAX;

/**
 * Cut at a WORD boundary, never mid-word, and never leave dangling punctuation.
 *
 * A hard slice produces "…the whole thi" in a search result, which reads as a
 * broken page rather than a truncated one. If a single word is longer than the
 * limit there is nothing to do but cut it, and that is the only case where this
 * splits one.
 */
function trimToWord(text: string, max: number): string {
  const s = text.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return body.replace(/[\s,;:–—-]+$/, "");
}

/**
 * A page title that fits, with the site suffix only when there is room for it.
 *
 * THE SUFFIX IS THE FIRST THING TO GO, and that is deliberate: " · MarketWar OS"
 * is sixteen characters of brand that every result on the page already shows in
 * the domain, while the last sixteen characters of the actual title are the ones
 * that say what the article is about. Losing the brand costs nothing; losing the
 * subject costs the click.
 */
export function fitTitle(title: string, suffix = ""): string {
  const base = String(title ?? "").trim();
  // NOT trimmed: the separator lives in the suffix (" · MarketWar OS"), and
  // trimming it produced "Short title· MarketWar OS". Only collapse runs of
  // whitespace, so a stray double space cannot reach a search result either.
  const suf = String(suffix ?? "").replace(/\s+/g, " ");
  if (!base) return base;
  if (suf && (base + suf).length <= TITLE_MAX) return base + suf;
  if (base.length <= TITLE_MAX) return base;
  return trimToWord(base, TITLE_MAX);
}

/**
 * A description that fits.
 *
 * Prefers to end on a sentence when one falls inside the limit — a description
 * cut mid-clause reads as a scrape, and a full sentence reads as a summary that
 * was written. Short descriptions are returned untouched: padding one to reach a
 * minimum would be inventing copy, which this platform does not do.
 */
export function fitDescription(text: string): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= DESC_MAX) return s;
  const cut = s.slice(0, DESC_MAX);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > DESC_MIN) return cut.slice(0, lastStop + 1).trim();
  return `${trimToWord(s, DESC_MAX - 1)}…`;
}
