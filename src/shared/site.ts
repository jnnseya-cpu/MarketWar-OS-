// THE CANONICAL ORIGIN — one definition, because ten was how this broke.
//
// Search Console reported "Invalid URL in field 'id' (in 'itemListElement.item')"
// on the breadcrumbs. The cause was a relative path — `item: "/features"` —
// where structured data requires an absolute URL: Google reads `item` as `@id`,
// and a path is not a URL.
//
// The deeper cause is that this expression was copy-pasted into ten files with
// no shared definition, so "what is our origin" had ten answers and no owner.
// A value with ten definitions is a value that is wrong in nine of them
// eventually — and it is the same expression the sitemap uses, so if the
// fallback is ever wrong it is wrong everywhere at once.
//
// Client-safe (`shared`), because the components emitting JSON-LD need it.

const FALLBACK = "https://www.marketwaros.com";

/**
 * The absolute origin this deployment publishes under, with no trailing slash.
 *
 * Read at call time rather than frozen at module load: a constant captured at
 * import cannot be re-read, which turns "the variable is set and the URLs are
 * still wrong" into an unanswerable question.
 */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_PRODUCTION_URL || FALLBACK).replace(/\/$/, "");
}

/**
 * An absolute URL for a path on this site.
 *
 * Every structured-data URL goes through here. Passing an already-absolute URL
 * returns it untouched, so this is safe to wrap around a value that might
 * already be one.
 */
export function siteUrl(path = "/"): string {
  const p = String(path || "/");
  if (/^https?:\/\//i.test(p)) return p;
  return `${siteOrigin()}${p.startsWith("/") ? p : `/${p}`}`.replace(/\/$/, "") || siteOrigin();
}

/** The shared 1200×630 social card. One file, so one page cannot drift from the rest. */
export const OG_IMAGE = "/brand/social/og-card.png";

/**
 * A COMPLETE Open Graph block for a page that wants its own title and text.
 *
 * WHY THIS EXISTS, AND IT IS A NEXT.JS TRAP RATHER THAN A TYPO. Metadata is
 * merged across segments field by field, but `openGraph` is REPLACED wholesale:
 * a page that sets `openGraph: { title, description }` does not inherit the
 * root layout's `images` — it silently loses them. There is no error and the
 * page looks correct in the source.
 *
 * Six pages did exactly that, so `/how-it-works`, `/audit`, `/choose-plan`,
 * `/contact`, every article and every answer page emitted an `og:title` with no
 * `og:image` and shared as a bare link — while the root layout, and only the
 * root layout, was complete. Our own audit reads it as a partial: "Missing Open
 * Graph title/image".
 *
 * So the image is not written per page any more. Give this a title and text and
 * it returns the whole block with the card attached; the only way to lose the
 * image now is to deliberately pass a different one.
 */
export function openGraphFor(input: {
  title: string;
  description: string;
  /** The page's own path, so og:url is the page rather than the home page. */
  path?: string;
  /** An article's own image, when it has one worth using instead of the card. */
  image?: string;
  type?: "website" | "article";
}): {
  title: string; description: string; url: string; siteName: string; locale: string;
  type: "website" | "article";
  images: { url: string; width: number; height: number; alt: string }[];
} {
  const image = input.image || OG_IMAGE;
  return {
    title: input.title,
    description: input.description,
    url: siteUrl(input.path || "/"),
    siteName: "MarketWar OS",
    locale: "en_GB",
    type: input.type || "website",
    // The dimensions are the card's real ones. A scraper that has to fetch the
    // file to lay it out often gives up and shows nothing.
    images: [{ url: image, width: 1200, height: 630, alt: input.title }],
  };
}
