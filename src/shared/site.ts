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
