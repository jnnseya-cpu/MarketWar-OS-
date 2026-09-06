import type { MetadataRoute } from "next";
import { listPosts } from "@/backend/blog-store";
import { SEO_ARTICLES } from "@/shared/seo-articles";
import { FEATURE_PAGES } from "@/shared/feature-pages";
import { siteOrigin } from "@/shared/site";

// We sell SEO and shipped no sitemap.
//
// SiteRaid scores a customer's site on having one, the crawler checks for it,
// and AI Visibility tells them AI assistants read raw HTML — while
// marketwaros.com published neither a sitemap nor robots.txt nor llms.txt. The
// product's own advice, unapplied to the product's own site.
//
// Blog posts are included because they are the pages that most need finding;
// a static list would silently stop covering them the day autopilot publishes.
export const revalidate = 3600;

const SITE = siteOrigin();

const STATIC: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/audit", priority: 0.95, changeFrequency: "monthly" },
  { path: "/features", priority: 0.9, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.9, changeFrequency: "monthly" },
  { path: "/choose-plan", priority: 0.9, changeFrequency: "weekly" },
  { path: "/industries", priority: 0.8, changeFrequency: "monthly" },
  { path: "/growth", priority: 0.7, changeFrequency: "monthly" },
  { path: "/share2earn", priority: 0.8, changeFrequency: "monthly" },
  { path: "/developers", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.8, changeFrequency: "daily" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  // `/get-started` was missing, and it is the page that turns interest into an
  // account: its own metadata, the marketing shell, the four steps and the
  // pricing entry. Every other conversion page is listed; this one was simply
  // never added, so search engines were not offered the last step of the
  // funnel.
  { path: "/get-started", priority: 0.9, changeFrequency: "monthly" },
  { path: "/status", priority: 0.3, changeFrequency: "daily" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/policies", priority: 0.3, changeFrequency: "yearly" },
];

// `/partner` IS DELIBERATELY NOT LISTED, and it used to be.
//
// It is not a marketing page. Its own header says the access code a creator was
// given when they applied "is the only credential — no platform login", so it is
// a signed-in tool wearing a public URL, it is `"use client"`, and NOTHING in
// the app links to it. Our own audit scores it 70/100 — the worst public page we
// have — failing "Rendered by JavaScript", "Single H1", "Image alt text" and
// "Content depth" for the obvious reason that a crawler sees 914 words of shell
// where the landing page has 13,489.
//
// Offering that to Google as marketing content spends crawl budget on an empty
// dashboard and puts a thin page in the index under our name. The public pitch
// for creators is `/share2earn`, which IS listed and is written for readers.
// Removing this does not hide the tool — anyone with a code still opens it — it
// stops us advertising it as something to read.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  // Every answer page, derived from the list rather than typed — a static copy
  // would stop covering them the day one is added.
  const features: MetadataRoute.Sitemap = FEATURE_PAGES.map((f) => ({
    url: `${SITE}/features/${f.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));
  const pages: MetadataRoute.Sitemap = STATIC.map((p) => ({
    url: `${SITE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // Never let a blog-store failure take the whole sitemap down: a sitemap
  // missing its posts is a bad day, a 500 on /sitemap.xml is an invisible site.
  try {
    // BOUNDED. `listPosts` reaches Firestore, and a sitemap that waits on a
    // slow database is a sitemap a crawler gives up on — Search Console reports
    // that as "Couldn't fetch" with no further detail, which is indistinguishable
    // from the route being broken.
    //
    // The static pages are already assembled above, so a timeout costs the blog
    // posts and nothing else. Failing to list posts must never cost the whole
    // file. (Directive rule 21: external services need timeouts.)
    const posts = await Promise.race([
      listPosts(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("blog-store timed out")), 5_000)),
    ]);
    // The evergreen cluster is what the site is meant to rank for, and its
    // pillar is the page the spokes exist to concentrate authority on — so they
    // do not sit at the same priority as an ordinary post.
    const pillar = new Set(SEO_ARTICLES.filter((a) => a.pillar).map((a) => a.slug));
    const spoke = new Set(SEO_ARTICLES.filter((a) => !a.pillar).map((a) => a.slug));
    for (const p of posts) {
      pages.push({
        url: `${SITE}/blog/${p.slug}`,
        lastModified: p.createdAt ? new Date(p.createdAt) : now,
        changeFrequency: pillar.has(p.slug) || spoke.has(p.slug) ? "monthly" : "monthly",
        priority: pillar.has(p.slug) ? 0.9 : spoke.has(p.slug) ? 0.75 : 0.6,
      });
    }
  } catch { /* static pages still ship */ }

  return [...pages, ...features];
}
