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
/**
 * THE ADDRESS A CUSTOMER WRITES TO, in one place.
 *
 * It was a `const` inside `/contact/page.tsx`, so every other page that wanted to
 * offer a way to get in touch either linked to that page or offered nothing. Our
 * own audit found the second case on `/choose-plan` — "No phone link, email link
 * or form on this page" — which is the page where money changes hands, and the
 * buyer with a question is exactly the buyer worth answering.
 */
export const SUPPORT_EMAIL = "info@marketwaros.com";

/**
 * Is this a profile URL we are willing to publish as "the same entity as us"?
 *
 * ONE IMPLEMENTATION, because a `sameAs` pointing at a profile that is not ours —
 * or at a half-typed value — is a machine-readable lie told to every search engine
 * and AI assistant at once. The first version of this lived inline in the schema
 * component with a copy of the rule in its test, so a mutation that published
 * anything non-empty survived: the test was only checking that the copy agreed
 * with itself.
 *
 * https only. A profile served over http is not one this site will vouch for.
 */
export const isPublicProfileUrl = (v: unknown): boolean =>
  /^https:\/\/[^\s]+\.[^\s]+$/.test(String(v ?? "").trim());

/**
 * Does this look like an ICO registration number at all?
 *
 * The current format is a letter prefix and seven digits — `C2089949`,
 * `Z1234567` — and older entries use `ZA` and six. The check is deliberately a
 * SHAPE check and nothing more: it cannot tell a real registration from a
 * well-formed invention, and pretending otherwise would be the more dangerous
 * claim. What it does stop is a half-typed or empty value being published on a
 * legal page as though it were a regulatory identifier.
 */
export const isIcoRegistrationFormat = (v: unknown): boolean =>
  /^(?:Z[A-Z]?\d{6,7}|[A-Z]\d{7})$/.test(String(v ?? "").trim().toUpperCase());

/**
 * THIS PLATFORM'S OWN ICO REGISTRATION, as the data controller.
 *
 * A committed constant for the same reason `SUPPORT_EMAIL` above is one: it is
 * this deployment's own public identity, not a per-tenant value, and it is
 * published on the ICO's own register rather than being a secret. The privacy
 * policy names us as controller in its first paragraph and said nothing about
 * where that controller is registered, which is the one fact a reader checking
 * up on us would actually want.
 *
 * A DIFFERENT OPERATOR MUST OVERRIDE IT. `NEXT_PUBLIC_ICO_REGISTRATION` wins
 * when set, and a malformed override publishes NOTHING rather than falling back
 * to ours — somebody setting that variable is plainly trying to state their own
 * registration, and quietly showing them ours would be exactly the
 * machine-readable lie `isPublicProfileUrl` above exists to prevent, told about
 * a regulator.
 *
 * NOT VERIFIED AGAINST THE REGISTER from this container: ico.org.uk is not
 * reachable here, so this is the number the operator supplied and a shape check,
 * which is all this file can honestly claim.
 */
const ICO_FALLBACK = "C2089949";

export function icoRegistration(): string {
  const raw = process.env.NEXT_PUBLIC_ICO_REGISTRATION;
  // UNSET AND EMPTY ARE DIFFERENT ANSWERS, and the distinction survives the
  // build because an unset NEXT_PUBLIC_* inlines as undefined while one set to
  // "" inlines as "". Unset means nobody has expressed a view, so this
  // deployment's own number applies. SET-BUT-EMPTY is somebody saying "I have
  // no registration to state here" — honouring that costs us nothing, since
  // our own deployment never sets the variable at all, and the alternative is
  // publishing our registration on their legal page.
  if (raw === undefined) return ICO_FALLBACK;
  const override = raw.trim().toUpperCase();
  return isIcoRegistrationFormat(override) ? override : "";
}

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
