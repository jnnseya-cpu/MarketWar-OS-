// WHAT GOOGLE MAY CRAWL ON OUR OWN SITE — the list, and the reason for each line.
//
// WHY THIS IS A MODULE AND NOT FIVE STRINGS IN `app/robots.ts`. The audit that
// checks our own indexability has to know the same rules the file publishes. Two
// copies of one list is the defect this codebase produces most often — and it
// would be especially useless here, because an audit reading a stale copy of the
// policy would certify a robots.txt it had never seen.
//
// THE REPORT THAT CAUSED THE REWRITE. Search Console: *"Blocked by robots.txt …
// if this reason is not intentional, we recommend that you fix it."* Measured
// before anything was changed:
//
//   href="/signup"  — 7 times, from the home page, /audit, /features,
//                     /how-it-works, /get-started and /developers
//   href="/login"   — from `SiteAuthLinks`, which the home page header renders
//
// Both were `Disallow`ed. So the home page invited Google to a page the same
// site then refused to serve it, on every crawl, forever.
//
// AND A DISALLOW IS THE WRONG TOOL FOR A PAGE YOU LINK TO. It does not say "keep
// this out of the index" — it says "do not fetch this". Google may still index
// the bare URL from the anchor text alone, with no title and no description,
// which is the "Indexed, though blocked by robots.txt" state and is worse than
// either alternative. Meanwhile the link equity pointing at it is dropped, and
// any `noindex` on the page can never be read, because reading it requires the
// fetch that was just refused.
//
// SO THE RULE THIS FILE ENCODES:
//
//   A PATH THAT AN INDEXABLE PAGE LINKS TO IS NOT ROBOTS-BLOCKED. It is crawled
//   and carries `noindex, follow`, so Google reads the instruction, drops the
//   page cleanly, and follows the links through it.
//
//   A PATH NOTHING PUBLIC LINKS TO IS ROBOTS-BLOCKED, because then the block is
//   free: it saves crawl budget and generates no report, since Google has no way
//   to discover it in the first place.
//
// `backend/indexability.ts` checks that both halves still hold, against the
// published file and the real links on the real pages.

export type RobotsRule = {
  /** The path prefix, exactly as it appears in robots.txt. */
  path: string;
  /** Why it is blocked. Printed by the audit, so it has to be a real reason. */
  reason: string;
  /**
   * TRUE when something an indexable page renders may link here, which makes a
   * disallow a reported error rather than a silent saving. Every entry here is
   * false by design — a true one is a defect the audit names.
   */
  linkedFromPublicPages: false;
};

/**
 * The disallow list, and nothing is on it that a public page links to.
 *
 * `/login`, `/signup` and `/onboarding` USED TO BE HERE. They are linked from
 * the marketing header and from six landing pages, so blocking them produced the
 * Search Console report and dropped the funnel's own link equity. They now carry
 * `noindex, follow` in their own metadata instead, which is what that state is
 * for.
 */
export const ROBOTS_DISALLOW: readonly RobotsRule[] = [
  {
    path: "/dashboard/",
    reason: "69 signed-in application pages. Crawling them spends budget on views that need an account, and a signed-in view in the index would leak one customer's screen to everybody.",
    linkedFromPublicPages: false,
  },
  {
    path: "/api/",
    reason: "Machine endpoints. Nothing under it is written for a reader, and one of them — the unsubscribe link — acts when it is fetched, so a crawler walking it would opt people out of their own lists.",
    linkedFromPublicPages: false,
  },
  {
    path: "/r/",
    reason: "A creator's tracked redirect. There is no page to index: it resolves a code, records the click and forwards to the destination, so a crawl produces a redirect and an attribution record nobody clicked.",
    linkedFromPublicPages: false,
  },
] as const;

/**
 * Paths that are CRAWLABLE and carry `noindex, follow` in their own metadata.
 *
 * Listed so the audit can prove the header is actually there. A page in this
 * list with no `noindex` is a page heading for the index; a page in this list
 * that is ALSO in `ROBOTS_DISALLOW` is the contradiction described above, where
 * the instruction can never be read.
 */
export const NOINDEX_PATHS: readonly { path: string; reason: string }[] = [
  { path: "/login", reason: "An authentication form. Nothing to rank, and it is linked from the public header, so it has to be crawlable for the noindex to be read." },
  { path: "/signup", reason: "The same, and it is the most-linked page on the site after the home page — seven links from six landing pages." },
  { path: "/onboarding", reason: "A signed-in wizard reached after sign-up. Linked from the flow rather than from a page, but it must never rank." },
  // `Disallow: /dashboard/` MATCHES SUB-PATHS ONLY — a prefix ending in a slash
  // never matched `/dashboard` itself, so the command centre's index page was
  // crawlable and indexable for as long as the rule has existed, and
  // `/choose-plan` links to it deliberately. The audit found it; reading the
  // rule did not. The layout's own metadata carries the noindex, which covers
  // every dashboard page whether or not the robots block is there.
  { path: "/dashboard", reason: "The signed-in command centre's index page, linked from /choose-plan as the demo. The inner pages are robots-blocked for crawl budget; the index is crawlable so this instruction can be read." },
] as const;

/** The Next.js `robots` metadata object for a page that must not be indexed. */
export const NOINDEX_METADATA = { index: false, follow: true } as const;
