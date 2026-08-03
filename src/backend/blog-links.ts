// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Links in and out of the blog — the part that was missing entirely.
//
// THREE FACTS, ALL TRUE AT ONCE, ALL FIXED HERE OR NEXT DOOR.
//
//   The articles contained no links. The generator's brief never asked for any,
//   so every post was a dead end: nothing pointing at the product pages, nothing
//   pointing at the other posts, nothing pointing out at a source. For a company
//   that sells an SEO engine that is not a small omission.
//
//   Nothing could have linked anyway. The Markdown renderer understood exactly
//   one inline construct — **bold**. A `[text](url)` reached the page as the
//   literal characters, brackets and all. That is fixed in the renderer; this
//   file is what makes sure the links it is now able to draw actually go
//   somewhere.
//
//   And a language model asked for links will invent them. That is the whole
//   difficulty. A model writing about pricing will happily link `/pricing`, a
//   page this site does not have, and the article ships a 404 to every reader
//   and every crawler. So the generator is not asked to think of URLs: it is
//   given a MENU of destinations that exist — the real public routes and the
//   real published posts — and told to use only those. Anything it links that
//   is not on the menu is UNLINKED after the fact, keeping the sentence and
//   losing the false promise. That check is not advice to the model; it runs
//   whatever the model does.
//
// Outbound links to other people's sites are treated the same way but cannot be
// checked against a menu, so they are verified over the network before the post
// is saved and dropped if they do not answer. A citation to a page that is not
// there is worse than no citation.

import type { BlogPost } from "@/shared/blog";

/**
 * The public routes an article may link to.
 *
 * Every entry is a real page. A test walks `src/app` and fails if any path here
 * has no page file, because the entire point of the menu is that a link taken
 * from it cannot 404.
 */
export const PUBLIC_ROUTES: { path: string; label: string; use: string }[] = [
  { path: "/", label: "MarketWar OS", use: "the platform itself" },
  { path: "/how-it-works", label: "How it works", use: "the seven phases, from URL to running campaigns" },
  { path: "/industries", label: "Industries", use: "how the plays differ by trade" },
  { path: "/developers", label: "Developers", use: "the engine catalogue and the gateway contract" },
  { path: "/about", label: "About", use: "what the platform is for and what it refuses to do" },
  { path: "/growth", label: "Growth & influencers", use: "the creator and partner programme" },
  { path: "/choose-plan", label: "Pricing", use: "the plans and the ACU allowance" },
  { path: "/blog", label: "Blog", use: "the other playbooks" },
  { path: "/status", label: "Platform status", use: "component status and uptime policy" },
  { path: "/privacy", label: "Privacy", use: "what data is collected and why" },
  { path: "/terms", label: "Terms", use: "the contract" },
  { path: "/contact", label: "Contact", use: "talking to a person" },
];

export type LinkTarget = { url: string; label: string; use: string; kind: "page" | "post" };

/**
 * Everywhere an article is allowed to point.
 *
 * @param posts   Published posts, so articles can link to each other. Drafts are
 *                excluded by the caller — linking to an unpublished slug is a
 *                404 with extra steps.
 * @param exclude A slug to leave out, so a post is never offered itself.
 */
export function linkMenu(posts: BlogPost[] = [], exclude = ""): LinkTarget[] {
  const pages: LinkTarget[] = PUBLIC_ROUTES.map((r) => ({ url: r.path, label: r.label, use: r.use, kind: "page" }));
  const articles: LinkTarget[] = posts
    .filter((p) => p.status === "published" && p.slug && p.slug !== exclude)
    .map((p) => ({ url: `/blog/${p.slug}`, label: p.title, use: p.excerpt || p.category, kind: "post" as const }));
  return [...pages, ...articles];
}

/** The menu, written for a model to read. Nothing else is offered to it. */
export function menuForPrompt(menu: LinkTarget[]): string {
  return menu.map((m) => `- [${m.label}](${m.url}) — ${m.use}`).join("\n");
}

/**
 * A CUSTOMER's menu — their pages, not ours.
 *
 * The platform menu above would have a customer's blog linking to
 * marketwaros.com, which is our marketing on their article and no use to them
 * at all. What earns a customer rankings is their own blog pointing at their own
 * money pages: the service page, the pricing page, the booking form.
 *
 * Those pages are taken from the site ITSELF — its sitemap first, because that
 * is the site telling us which pages it considers important, then its own
 * navigation. Nothing is guessed, so nothing links to a page that is not there.
 * A brand with no reachable website still gets a menu of its own published
 * posts, which is better than a dead end.
 *
 * @param label A readable name for each destination, derived from the path.
 */
export async function brandLinkMenu(input: {
  posts?: BlogPost[];
  brandId: string;
  website?: string;
  exclude?: string;
  cap?: number;
  /** Injected in tests; the real one goes over the network. */
  fetchPages?: (website: string, cap: number) => Promise<string[]>;
}): Promise<LinkTarget[]> {
  const own: LinkTarget[] = (input.posts ?? [])
    .filter((p) => p.status === "published" && (p.brandId || "") === input.brandId && p.slug !== input.exclude)
    .map((p) => ({ url: `/blog/${p.slug}`, label: p.title, use: p.excerpt || p.category, kind: "post" as const }));

  const site = String(input.website ?? "").trim();
  if (!site) return own;

  const cap = input.cap ?? 40;
  let pages: string[] = [];
  try {
    pages = await (input.fetchPages ?? sitePages)(site, cap);
  } catch { /* their blog posts still link to each other */ }

  const fromSite: LinkTarget[] = pages.map((url) => ({
    url,
    label: pathLabel(url),
    use: "a page on your own site",
    kind: "page" as const,
  }));
  return [...fromSite, ...own];
}

/** "https://x.com/services/boiler-repair" → "Services · boiler repair". */
export function pathLabel(url: string): string {
  let path = "";
  try { path = new URL(url).pathname; } catch { return url; }
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return "Home page";
  return parts
    .map((p) => p.replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim())
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" · ");
}

/** The brand's real pages: sitemap first, then the homepage's own navigation. */
async function sitePages(website: string, cap: number): Promise<string[]> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  const host = new URL(base).hostname.replace(/^www\./, "");
  const get = async (u: string): Promise<string> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(u, { redirect: "follow", signal: ctl.signal });
      return res.ok ? (await res.text()).slice(0, 1_000_000) : "";
    } catch { return ""; } finally { clearTimeout(timer); }
  };
  const [sitemapXml, html] = await Promise.all([get(new URL("/sitemap.xml", base).toString()), get(base)]);
  const { discoverUrls } = await import("@/backend/deep-crawl");
  return discoverUrls({ sitemapXml, html, base, host, cap });
}

// ---------------------------------------------------------------------------
// Reading the links back out
// ---------------------------------------------------------------------------

export type FoundLink = { text: string; url: string; index: number; length: number };

// The url part allows ONE level of balanced parentheses. Without it
// `(javascript:alert(1))` matches up to the first bracket, the check still
// refuses the link but a stray `)` is left sitting in the sentence — and a
// perfectly ordinary Wikipedia url with brackets in it breaks the same way.
const URL_PART = "[^()\\s]+(?:\\([^()]*\\)[^()\\s]*)*";
const LINK_RE = new RegExp(`\\[([^\\]\\n]*)\\]\\(\\s*(${URL_PART})(?:\\s+"[^"]*")?\\s*\\)`, "g");

/** Every Markdown link in the text, in order, with where it sits. */
export function extractLinks(markdown: string): FoundLink[] {
  const out: FoundLink[] = [];
  for (const m of String(markdown ?? "").matchAll(LINK_RE)) {
    // An image is `![alt](src)` — the same shape with a bang in front, and not
    // a link. Skipped rather than rewritten.
    if (m.index !== undefined && m.index > 0 && markdown[m.index - 1] === "!") continue;
    out.push({ text: m[1], url: m[2], index: m.index ?? 0, length: m[0].length });
  }
  return out;
}

export const isInternal = (url: string): boolean => url.startsWith("/") && !url.startsWith("//");
export const isExternal = (url: string): boolean => /^https?:\/\//i.test(url);

/** Strip the fragment and trailing slash so `/blog/x#intro` matches `/blog/x`. */
const canonicalPath = (url: string): string => {
  const base = url.split("#")[0].split("?")[0];
  return base.length > 1 && base.endsWith("/") ? base.slice(0, -1) : base;
};

export type EnforceResult = {
  markdown: string;
  /** Links that survived. */
  kept: FoundLink[];
  /** Links that were unlinked, and why — reported, never silently dropped. */
  removed: { url: string; text: string; reason: string }[];
  internalCount: number;
  externalCount: number;
};

/**
 * Unlink anything that does not go somewhere real.
 *
 * The sentence is always kept — only the link is removed — because the writing
 * around a bad link is usually fine and deleting it would damage the article to
 * punish the URL.
 *
 * @param allowedExternal URLs already checked over the network. Anything
 *                        external and absent from this set is unlinked; pass a
 *                        set containing every external URL to skip the check
 *                        (tests do this; the route does not).
 */
export function enforceLinks(
  markdown: string,
  menu: LinkTarget[],
  allowedExternal: Set<string> = new Set(),
): EnforceResult {
  const allowedInternal = new Set(menu.filter((m) => isInternal(m.url)).map((m) => canonicalPath(m.url)));
  // A customer's own pages arrive as absolute urls, because their blog is
  // hosted here and their shop is not. Anything ON THE MENU is known-good
  // whichever form it takes — the menu was built from their sitemap.
  const allowedFromMenu = new Set(menu.filter((m) => isExternal(m.url)).map((m) => m.url));
  const found = extractLinks(markdown);
  const kept: FoundLink[] = [];
  const removed: EnforceResult["removed"] = [];

  // Rebuilt back-to-front so earlier indices stay valid.
  let out = markdown;
  for (const link of [...found].reverse()) {
    const url = link.url.trim();
    let reason = "";

    if (isInternal(url)) {
      if (!allowedInternal.has(canonicalPath(url))) {
        reason = "that page does not exist on this site";
      }
    } else if (isExternal(url)) {
      if (!allowedFromMenu.has(url) && !allowedExternal.has(url)) {
        reason = "the page did not answer when we checked it";
      }
    } else if (/^mailto:/i.test(url)) {
      // A mail link cannot 404 and cannot execute anything.
    } else {
      reason = "not a link we can publish safely";
    }

    if (reason) {
      removed.push({ url, text: link.text, reason });
      out = out.slice(0, link.index) + link.text + out.slice(link.index + link.length);
    } else {
      kept.push(link);
    }
  }

  kept.reverse();
  removed.reverse();
  return {
    markdown: out,
    kept,
    removed,
    internalCount: kept.filter((l) => isInternal(l.url)).length,
    externalCount: kept.filter((l) => isExternal(l.url)).length,
  };
}

/**
 * Does this external URL actually answer?
 *
 * HEAD first because it is cheap; a GET follows because a fair number of sites
 * refuse HEAD with a 405 while serving the page perfectly well. Anything that
 * times out is treated as dead — a citation nobody can load is not a citation.
 */
export async function verifyExternal(urls: string[], timeoutMs = 4000): Promise<Set<string>> {
  const ok = new Set<string>();
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      for (const method of ["HEAD", "GET"] as const) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const res = await fetch(url, { method, redirect: "follow", signal: ctl.signal });
          if (res.ok) { ok.add(url); return; }
          if (res.status !== 405 && res.status !== 403) return;
        } catch {
          return;
        } finally {
          clearTimeout(timer);
        }
      }
    }),
  );
  return ok;
}

// ---------------------------------------------------------------------------
// Which other posts does this one belong next to?
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "that", "this", "from", "have", "has", "are", "was", "were",
  "not", "but", "how", "why", "what", "when", "who", "will", "can", "get", "got", "its", "it's", "our",
  "out", "into", "about", "than", "then", "them", "they", "their", "there", "here", "more", "most", "less",
  "one", "two", "all", "any", "own", "new", "now", "own", "off", "per", "via", "use", "used", "using",
  "a", "an", "of", "to", "in", "is", "it", "on", "at", "by", "be", "or", "as", "do", "if", "so", "we",
]);

const tokens = (s: string): string[] =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

export type Related = { post: BlogPost; shared: string[]; score: number };

/**
 * The posts this one genuinely overlaps with.
 *
 * Word overlap on title, excerpt and category — counted, and shown. A related
 * list padded out with whatever was published most recently teaches a reader to
 * ignore the whole block, so a post with nothing in common with anything gets
 * an EMPTY list and the section does not render at all.
 *
 * @param minShared Below this many shared words the two are simply unrelated.
 */
export function relatedPosts(post: BlogPost, others: BlogPost[], limit = 3, minShared = 2): Related[] {
  const mine = new Set(tokens(`${post.title} ${post.excerpt} ${post.category}`));
  if (!mine.size) return [];
  return others
    .filter((p) => p.status === "published" && p.slug !== post.slug)
    .map((p) => {
      const theirs = new Set(tokens(`${p.title} ${p.excerpt} ${p.category}`));
      const shared = [...mine].filter((w) => theirs.has(w));
      // Category alone is a weak signal — two "Growth" posts about nothing
      // alike would otherwise always pair up.
      const score = shared.length + (p.category === post.category ? 0.5 : 0);
      return { post: p, shared, score };
    })
    .filter((r) => r.shared.length >= minShared)
    .sort((a, b) => b.score - a.score || a.post.slug.localeCompare(b.post.slug))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// The audit the studio shows
// ---------------------------------------------------------------------------

export type LinkAudit = {
  internal: number;
  external: number;
  toPosts: number;
  toPages: number;
  /** Internal links pointing at a page that does not exist. */
  broken: string[];
  level: "ok" | "thin" | "none";
  note: string;
};

/** What this post's linking actually looks like, for a post already written. */
export function linkAudit(markdown: string, menu: LinkTarget[]): LinkAudit {
  const allowed = new Set(menu.map((m) => canonicalPath(m.url)));
  const links = extractLinks(markdown);
  const internal = links.filter((l) => isInternal(l.url));
  const external = links.filter((l) => isExternal(l.url));
  const broken = internal.filter((l) => !allowed.has(canonicalPath(l.url))).map((l) => l.url);
  const toPosts = internal.filter((l) => l.url.startsWith("/blog/")).length;
  const toPages = internal.length - toPosts;

  const level: LinkAudit["level"] = internal.length === 0 ? "none" : internal.length < 3 ? "thin" : "ok";
  const note = broken.length
    ? `${broken.length} internal link(s) point at a page that does not exist: ${broken.join(", ")}. Every reader who clicks one gets a 404, and so does every crawler.`
    : level === "none"
      ? "This article links nowhere. Nothing carries a reader to the product, nothing passes authority to another post, and search engines have no route out of the page."
      : level === "thin"
        ? `${internal.length} internal link(s). Three or four placed where they are genuinely useful is the difference between a page that ranks alone and a set of pages that hold each other up.`
        : `${internal.length} internal links — ${toPosts} to other articles, ${toPages} to product pages${external.length ? `, plus ${external.length} outbound citation(s)` : ""}.`;

  return { internal: internal.length, external: external.length, toPosts, toPages, broken, level, note };
}
