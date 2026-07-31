import type { MetadataRoute } from "next";

// robots.txt, which the product scores customers on having.
//
// Two deliberate choices:
//
//   AI CRAWLERS ARE ALLOWED. The AI Visibility module measures whether
//   assistants recommend a business, and geo-readiness fails a site that blocks
//   GPTBot or ClaudeBot. Blocking them on our own site while selling that
//   measurement would be indefensible — and would make marketwaros.com invisible
//   to the exact engines the product is about.
//
//   CUSTOMER-HOSTED PAGES ARE NOT LISTED HERE. /b/<brand>/<slug> belongs to the
//   customer; those pages are indexable, but they are not ours to put in our
//   sitemap.
const SITE = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://www.marketwaros.com").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private surfaces and anything that would waste crawl budget or leak a
        // signed-in view into the index.
        disallow: ["/dashboard/", "/api/", "/onboarding", "/login", "/signup", "/r/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
