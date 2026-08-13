import type { MetadataRoute } from "next";
import { listPosts } from "@/backend/blog-store";
import { SEO_ARTICLES } from "@/shared/seo-articles";

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

const SITE = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://www.marketwaros.com").replace(/\/$/, "");

const STATIC: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/audit", priority: 0.95, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.9, changeFrequency: "monthly" },
  { path: "/choose-plan", priority: 0.9, changeFrequency: "weekly" },
  { path: "/industries", priority: 0.8, changeFrequency: "monthly" },
  { path: "/growth", priority: 0.7, changeFrequency: "monthly" },
  { path: "/share2earn", priority: 0.8, changeFrequency: "monthly" },
  { path: "/developers", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.8, changeFrequency: "daily" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/partner", priority: 0.5, changeFrequency: "monthly" },
  { path: "/status", priority: 0.3, changeFrequency: "daily" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/policies", priority: 0.3, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = STATIC.map((p) => ({
    url: `${SITE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // Never let a blog-store failure take the whole sitemap down: a sitemap
  // missing its posts is a bad day, a 500 on /sitemap.xml is an invisible site.
  try {
    // Published only — a draft in the sitemap invites a crawler to a 404.
    const posts = await listPosts();
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

  return pages;
}
