// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Auto-deploy — apply the SEO fixes instead of describing them.
//
// The platform already finds the issues (crawler.ts) and writes the fixes
// (seo-artifacts.ts). What it did not do was PUT THEM ON THE PAGE: the customer
// got a JSON-LD block to paste into a CMS they may not control. This closes
// that, the same way the citation module stopped handing out homework.
//
// One script tag, served per brand, applies that brand's APPROVED fixes.
//
// WHAT THIS IS HONEST ABOUT, because the category is not:
//
//   CLIENT-SIDE IS SECOND BEST. Google renders JavaScript, so an injected
//   title or schema is seen — on a second pass, later than server-rendered
//   markup. And it is invisible to social unfurlers, to non-rendering crawlers,
//   and to the AI assistants the visibility module measures, which fetch raw
//   HTML. The snippet says so; server-side is always the better answer where
//   the customer can reach the template.
//
//   NOTHING SHIPS UNAPPROVED. A fix is applied only after a person approves it.
//   The platform is writing into a live page a customer is legally responsible
//   for — silently pushing generated text onto it would be indefensible.
//
//   IT FILLS GAPS, IT DOES NOT CLOBBER. A hand-written title that someone
//   agonised over is not overwritten unless that fix is explicitly marked as a
//   replacement. Improving a page by destroying its best work is not improvement.
//
//   IT CANNOT BREAK THE PAGE. Everything runs in a try/catch; any failure and
//   the snippet does nothing at all. A marketing tool that white-screens a
//   customer's site has done more damage than every missing meta tag combined.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

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

const COLLECTION = "seo_deployments";
const mem = new Map<string, SeoDeployConfig>();
const nowIso = () => new Date().toISOString();

export function emptyConfig(brandId: string): SeoDeployConfig {
  return { brandId, allowedHosts: [], enabled: false, fixes: [], updatedAt: nowIso() };
}

export async function getDeployConfig(brandId: string): Promise<SeoDeployConfig> {
  const id = (brandId || "").trim();
  if (!id) return emptyConfig("");
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as SeoDeployConfig) : emptyConfig(id);
  }
  return mem.get(id) ?? emptyConfig(id);
}

export async function saveDeployConfig(brandId: string, patch: Partial<SeoDeployConfig>): Promise<SeoDeployConfig> {
  const cur = await getDeployConfig(brandId);
  const next: SeoDeployConfig = { ...cur, ...patch, brandId, updatedAt: nowIso() };
  if (adminConfigured && adminDb) await adminDb.collection(COLLECTION).doc(brandId).set(next, { merge: false });
  else mem.set(brandId, next);
  return next;
}

/** Normalise a host the way a browser reports it. */
export function normaliseHost(raw: string): string {
  return (raw || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[:/].*$/, "");
}

/**
 * Only the fixes that may actually run.
 *
 * Approval is checked HERE rather than in the browser: a client-side filter is
 * a suggestion, and the snippet is public — anyone can read it. An unapproved
 * fix must never leave the server.
 */
export function deployableFixes(cfg: SeoDeployConfig): SeoFix[] {
  if (!cfg.enabled) return [];
  return cfg.fixes.filter((f) => f.approved && f.value.trim());
}

const jsonInline = (v: unknown) =>
  JSON.stringify(v)
    // A page can contain "</script>" inside a string; unescaped it would close
    // the tag early and dump the rest of the payload into the document.
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/**
 * The JavaScript the customer's page will run.
 *
 * Written out longhand rather than bundled: this lands on someone else's
 * website, and they should be able to open the URL and read exactly what it
 * does to their page.
 */
export function buildSnippet(cfg: SeoDeployConfig): string {
  const fixes = deployableFixes(cfg);
  const hosts = (cfg.allowedHosts || []).map(normaliseHost).filter(Boolean);

  return `/* MarketWar OS — SEO auto-deploy for brand ${JSON.stringify(cfg.brandId)}
 *
 * Applies ${fixes.length} approved fix(es) to this page.
 *
 * This is CLIENT-SIDE. Google renders JavaScript so it will see these, on a
 * later pass than server-rendered markup. Social unfurlers, non-rendering
 * crawlers and AI assistants that fetch raw HTML will NOT. Where you can edit
 * the page template, do it there instead — this is the fallback, not the ideal.
 *
 * Every element it creates carries data-mw-seo so you can find them in DevTools.
 */
(function () {
  "use strict";
  try {
    var HOSTS = ${jsonInline(hosts)};
    var FIXES = ${jsonInline(fixes.map((f) => ({ kind: f.kind, path: f.path, value: f.value, replace: f.replace })))};

    // Refuse to run anywhere but the domains this brand authorised. Without
    // this, anyone could paste another brand's snippet onto their own site.
    var host = String(location.hostname || "").toLowerCase().replace(/^www\\./, "");
    if (HOSTS.indexOf(host) === -1) return;

    var path = location.pathname || "/";
    function matches(p) {
      if (!p || p === "*") return true;
      if (p.slice(-1) === "*") return path.indexOf(p.slice(0, -1)) === 0;
      return path === p || path === p + "/";
    }

    function meta(attr, name) {
      return document.head.querySelector("meta[" + attr + '="' + name + '"]');
    }
    function setMeta(attr, name, content, replace) {
      var el = meta(attr, name);
      if (el) {
        // Only overwrite when the fix was explicitly approved as a replacement.
        // Someone wrote that line on purpose.
        if (!replace) return;
        el.setAttribute("content", content);
        el.setAttribute("data-mw-seo", "replaced");
        return;
      }
      el = document.createElement("meta");
      el.setAttribute(attr, name);
      el.setAttribute("content", content);
      el.setAttribute("data-mw-seo", "added");
      document.head.appendChild(el);
    }

    for (var i = 0; i < FIXES.length; i++) {
      var f = FIXES[i];
      if (!matches(f.path)) continue;
      try {
        if (f.kind === "title") {
          if (!document.title || f.replace) {
            document.title = f.value;
            document.documentElement.setAttribute("data-mw-seo-title", "1");
          }
        } else if (f.kind === "description") {
          setMeta("name", "description", f.value, f.replace);
        } else if (f.kind === "robots") {
          setMeta("name", "robots", f.value, f.replace);
        } else if (f.kind === "og") {
          var parts = f.value.split("|");
          if (parts[0] && parts[1]) setMeta("property", parts[0].trim(), parts.slice(1).join("|").trim(), f.replace);
        } else if (f.kind === "canonical") {
          var link = document.head.querySelector('link[rel="canonical"]');
          if (link) { if (f.replace) { link.setAttribute("href", f.value); link.setAttribute("data-mw-seo", "replaced"); } }
          else {
            link = document.createElement("link");
            link.setAttribute("rel", "canonical");
            link.setAttribute("href", f.value);
            link.setAttribute("data-mw-seo", "added");
            document.head.appendChild(link);
          }
        } else if (f.kind === "schema") {
          // Never a second copy of the same block: a page reloaded through a
          // client-side router would otherwise accumulate them.
          if (document.head.querySelector('script[data-mw-seo-schema="' + i + '"]')) continue;
          var s = document.createElement("script");
          s.type = "application/ld+json";
          s.setAttribute("data-mw-seo-schema", String(i));
          s.textContent = f.value;
          document.head.appendChild(s);
        } else if (f.kind === "alt") {
          // "selector|alt text" — only fills images that have no alt at all.
          var bits = f.value.split("|");
          if (!bits[0] || !bits[1]) continue;
          var imgs = document.querySelectorAll(bits[0].trim());
          for (var j = 0; j < imgs.length; j++) {
            if (imgs[j].getAttribute("alt")) continue;
            imgs[j].setAttribute("alt", bits.slice(1).join("|").trim());
            imgs[j].setAttribute("data-mw-seo", "added");
          }
        }
      } catch (e) { /* one bad fix must not stop the rest */ }
    }
  } catch (e) {
    // Silence is deliberate. A marketing script that white-screens a customer's
    // website has done more damage than every missing meta tag combined.
  }
})();
`;
}

/** The tag the customer pastes, once, into their site's <head>. */
export function installTag(base: string, brandId: string): string {
  return `<script src="${base.replace(/\/$/, "")}/api/seo/snippet/${encodeURIComponent(brandId)}.js" async></script>`;
}

/** Is the snippet actually on the page? Read from fetched HTML, never assumed. */
export function snippetInstalled(html: string, brandId: string): boolean {
  const needle = `/api/seo/snippet/${brandId}`;
  return (html || "").includes(needle);
}
