import type { MetadataRoute } from "next";
import { siteOrigin } from "@/shared/site";

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
//
//   THE DISALLOW LIST IS NOT WRITTEN HERE ANY MORE. It lives in
//   `shared/robots-policy.ts` with a reason beside every line, because the audit
//   that checks our own indexability has to read the same rules this file
//   publishes — and because three of the lines that used to be here were a
//   reported defect: `/login`, `/signup` and `/onboarding` are linked from the
//   marketing header and six landing pages, so blocking them told Google to
//   crawl a page the same site then refused to serve. They carry `noindex,
//   follow` now, which is the state that actually means "do not index this".
import { ROBOTS_DISALLOW } from "@/shared/robots-policy";

const SITE = siteOrigin();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ROBOTS_DISALLOW.map((r) => r.path),
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
