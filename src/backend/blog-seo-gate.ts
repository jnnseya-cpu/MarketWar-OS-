// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// NOTHING PUBLISHES BELOW THE BAR, AND NOTHING STAYS PUBLISHED IF IT FALLS BELOW IT.
//
// WHY THIS EXISTS. Pointed at our own published articles, our own crawler scored
// them 80, 75 and 75 — titles and descriptions outside the very bounds this
// platform charges customers to fix, and no contact route on any of them. Those
// three faults are fixed, but nothing stopped them happening and nothing would
// stop the next one: an article went from a model to the public with no
// measurement anywhere in between.
//
// HOW IT MEASURES, AND WHY IT IS NOT A PREDICTION. The obvious design is to score
// the draft's markdown against a checklist. That builds a SECOND implementation
// of the thirty checks, and the second implementation is the one that drifts —
// it would happily pass an article the real crawler fails, which is worse than no
// gate because it produces a number people trust.
//
// So this gate crawls the REAL PAGE with the REAL CRAWLER, the same one a customer
// pays to run on their own site. A draft is not routable (the page calls
// `notFound()` on anything unpublished), so the post is published, measured, and
// REVERTED TO DRAFT within the same request if it does not clear the bar. The
// exposure is one crawl long and it is the only way to score the thing that
// actually ships — the rendered head, the JSON-LD, the links as drawn.
//
// AND IT RUNS AGAIN ON A SCHEDULE, because "cannot regress" is a claim about
// tomorrow, not about publication day. A change to the layout, the footer or the
// metadata helper can drop every article at once; the sweep catches that and says
// which posts fell and why.

import { crawlSite } from "@/backend/crawler";
import { getPost, savePost, listPosts } from "@/backend/blog-store";
import { siteOrigin } from "@/shared/site";
import type { BlogPost } from "@/shared/blog";

/**
 * The bar. An article at 89 is not published.
 *
 * Not a magic number: it is the owner's stated standard, and it sits above the
 * 85 our own articles reach once their own faults are fixed — so clearing it
 * requires the site-level checks (a contact route, a canonical, structured data)
 * to be right as well, which is the point.
 */
export const MIN_SCORE = 90;

export type GateVerdict = {
  ok: boolean;
  score: number;
  grade: string;
  /** Everything that did not pass, worst weight first — the work list. */
  failing: { label: string; area: string; weight: number; severity: string; detail: string }[];
  /** What the caller should do, in words, when it did not pass. */
  note: string;
  /** True when the post was reverted to draft by this gate. */
  reverted?: boolean;
};

/** Where this deployment serves its own pages. Overridable so a test can point at itself. */
const postUrl = (slug: string, origin?: string): string =>
  `${(origin || siteOrigin()).replace(/\/$/, "")}/blog/${slug}`;

/**
 * Score a published post with the real crawler.
 *
 * A crawl that fails outright — the page unreachable, a challenge interstitial —
 * is NOT scored as zero and waved through as "well, it failed". It returns
 * `ok: false` with the crawler's own reason, because "we could not measure it" and
 * "we measured it and it is bad" call for different actions and only one of them
 * is the article's fault.
 */
export async function scorePost(slug: string, origin?: string): Promise<GateVerdict> {
  const report = await crawlSite(postUrl(slug, origin));
  if (!report.ok) {
    return {
      ok: false, score: 0, grade: "F", failing: [],
      note: `The article could not be measured: ${report.error || "the page did not answer."} That is a deployment problem rather than a writing one — the gate refuses rather than guessing.`,
    };
  }
  const failing = (report.findings || [])
    .filter((f) => f.severity !== "pass")
    .map((f) => ({ label: f.label, area: f.area, weight: f.weight, severity: f.severity, detail: f.detail }))
    .sort((a, b) => b.weight - a.weight);

  const ok = report.score >= MIN_SCORE;
  return {
    ok, score: report.score, grade: report.grade, failing,
    note: ok
      ? `Scored ${report.score}/100 by the same audit this platform sells. Published.`
      : `Scored ${report.score}/100 against a bar of ${MIN_SCORE}. ${failing.length} check(s) did not pass; the heaviest are ${failing.slice(0, 3).map((f) => f.label).join(", ") || "none"}.`,
  };
}

/**
 * Publish an article ONLY if it clears the bar, reverting it if it does not.
 *
 * The revert is the whole mechanism. Saving as draft and "scoring later" is how
 * an unmeasured article reaches the public and stays there — the state the blog
 * was in when three of its posts sat at 75.
 */
export async function publishWithGate(
  post: BlogPost,
  origin?: string,
  // Same seam as the sweep, and for the same reason: the decision is what needs
  // asserting, and arranging a real page that scores exactly 89 is a test nobody
  // writes. Feature code always uses the defaults.
  deps: { save?: typeof savePost; score?: (slug: string, origin?: string) => Promise<GateVerdict> } = {},
): Promise<GateVerdict> {
  const write = deps.save ?? savePost;
  const measure = deps.score ?? scorePost;
  const now = new Date().toISOString();
  await write({ ...post, status: "published", publishedAt: post.publishedAt || now });

  const verdict = await measure(post.slug, origin);
  if (verdict.ok) return verdict;

  // BACK TO DRAFT, and `publishedAt` cleared with it — a post that never really
  // published must not carry a publication date, or the next sweep reads it as
  // an article that has been live for a week.
  await write({ ...post, status: "draft", publishedAt: null });
  return {
    ...verdict,
    reverted: true,
    note: `${verdict.note} Held as a draft rather than published — fix the checks above and publish again.`,
  };
}

export type SweepResult = {
  checked: number;
  held: string[];
  scores: { slug: string; score: number }[];
  note: string;
};

/**
 * Re-score every published article and hold anything that has fallen below.
 *
 * "Cannot regress" is a claim about tomorrow. A change to the layout, the shared
 * footer or the metadata helper drops every article at once and no publication
 * step would ever see it — which is exactly the shape of the defect that put the
 * blog at 75 in the first place, since the titles were fine when each article was
 * written and only became wrong when a suffix was appended to all of them.
 */
export async function sweepPublished(
  origin?: string,
  // INJECTABLE, so the DECISION can be tested with scores the test controls. The
  // wire is proved by driving the real crawler against a production build; what
  // needs asserting here is what the sweep DOES with a score, and a test that has
  // to arrange a real 89-scoring page to check the boundary is a test nobody
  // writes. Feature code always uses the defaults.
  deps: {
    store?: { listPosts: typeof listPosts; getPost: typeof getPost; savePost: typeof savePost };
    score?: (slug: string, origin?: string) => Promise<GateVerdict>;
  } = {},
): Promise<SweepResult> {
  const list = deps.store?.listPosts ?? listPosts;
  const read = deps.store?.getPost ?? getPost;
  const write = deps.store?.savePost ?? savePost;
  const measure = deps.score ?? scorePost;
  const posts = await list().catch(() => [] as BlogPost[]);
  const scores: { slug: string; score: number }[] = [];
  const candidates: BlogPost[] = [];

  // MEASURE EVERYTHING FIRST, HOLD NOTHING YET. Deciding post by post is what
  // makes a site-wide regression unpublish a site-wide blog.
  for (const p of posts) {
    const verdict = await measure(p.slug, origin);
    scores.push({ slug: p.slug, score: verdict.score });
    // Only a MEASURED failure counts. An unreachable page during a deploy must
    // never unpublish anything.
    if (verdict.score > 0 && !verdict.ok) candidates.push(p);
  }

  // WHEN EVERYTHING FAILS AT ONCE, NOTHING IS HELD — and this is the safeguard
  // that matters most, because it is the case that actually happens. The three
  // articles found at 75 all failed on the SAME faults: a suffix appended to
  // every title, one description rule, one missing contact route. A change to the
  // layout, the shared footer or the metadata helper moves every article
  // together, and the correct response to "the whole blog just dropped" is to
  // raise the alarm, not to delete the blog.
  //
  // Driven: against a loopback origin, where the HTTPS check cannot pass, this
  // sweep held 12 of 13 articles before the guard existed.
  const wholeSiteRegression = candidates.length > Math.max(1, Math.floor(posts.length / 2));
  if (wholeSiteRegression) {
    return {
      checked: posts.length, held: [], scores,
      note: `${candidates.length} of ${posts.length} article(s) are below ${MIN_SCORE} — that is a SITE-LEVEL regression, not ${candidates.length} bad articles, so nothing was unpublished. Check what every page shares: the layout, the shared footer, the metadata helper, or whether this deployment is reachable over HTTPS at the address being crawled.`,
    };
  }

  const held: string[] = [];
  for (const p of candidates) {
    const stored = await read(p.slug).catch(() => null);
    if (stored && stored.status === "published") {
      await write({ ...stored, status: "draft", publishedAt: null });
      held.push(p.slug);
    }
  }

  return {
    checked: posts.length,
    held, scores,
    note: held.length
      ? `${held.length} of ${posts.length} article(s) fell below ${MIN_SCORE} and were held as drafts: ${held.join(", ")}.`
      : `All ${posts.length} published article(s) are at or above ${MIN_SCORE}.`,
  };
}
