// SEO auto-deploy — the shape of a fix, shared by the engine and the panel.
//
// These live in shared/ rather than in the backend module because the approval
// screen is the whole point of the feature: a person has to be able to see and
// judge every value before it is written onto a live page. The screen is a
// client component, so it cannot import the backend — and a second, drifting
// copy of the type in the UI is exactly how an unapproved fix eventually ships.
// One definition, both layers.

export type SeoFixKind = "title" | "description" | "canonical" | "og" | "schema" | "alt" | "robots";

export type SeoFix = {
  id: string;
  kind: SeoFixKind;
  /** Which pages. "*" = every page; otherwise an exact path or a "/blog/*" prefix. */
  path: string;
  /** The value to apply. JSON-LD for `schema`; plain text otherwise. */
  value: string;
  /** Replace a value that already exists, rather than only filling a gap. */
  replace: boolean;
  /** Nothing is applied until a person says so. */
  approved: boolean;
  /** Where the fix came from, so it can be traced back to the finding. */
  source: string;
  createdAt: string;
};

export type SeoDeployConfig = {
  brandId: string;
  /** Hostnames the snippet is allowed to run on. Empty = it runs nowhere. */
  allowedHosts: string[];
  enabled: boolean;
  fixes: SeoFix[];
  updatedAt: string;
};

/** A gap the OS refuses to fill on its own, and the reason — shown, never swallowed. */
export type UnfillableGap = { label: string; reason: string };

/**
 * What each kind expects, in the customer's words.
 *
 * The hint is not decoration: `og` and `alt` take a two-part value separated by
 * a pipe, and someone typing a bare sentence into either would produce a fix
 * that silently does nothing on their live site.
 */
export const SEO_FIX_KINDS: { kind: SeoFixKind; label: string; hint: string }[] = [
  { kind: "title", label: "Page title", hint: "The words shown as the headline in search results. Around 60 characters before Google truncates it." },
  { kind: "description", label: "Meta description", hint: "The grey summary under the title in search results. Around 155 characters." },
  { kind: "canonical", label: "Canonical URL", hint: "The one true address for this page, when the same content is reachable at several URLs. A full https:// URL." },
  { kind: "og", label: "Open Graph tag", hint: "Link previews on social and chat. Two parts: og:title | Your headline here" },
  { kind: "schema", label: "Structured data", hint: "A JSON-LD object — the JSON itself, with no <script> wrapper. The snippet adds the tag." },
  { kind: "alt", label: "Image alt text", hint: "Two parts: a CSS selector, then the description. img.hero | Our workshop in Manchester" },
  { kind: "robots", label: "Robots directive", hint: "Instructions for crawlers, e.g. index,follow or noindex. Only set this if you are certain." },
];

export const SEO_FIX_KIND_VALUES: SeoFixKind[] = SEO_FIX_KINDS.map((k) => k.kind);
