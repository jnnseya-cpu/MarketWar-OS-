// Structured data for our own site.
//
// The product generates Organization, WebSite and Product JSON-LD for every
// customer, scores their site on having it, and drafts fixes when it is missing.
// marketwaros.com published none. An SEO product with no structured data of its
// own is the clearest possible signal that its advice is not taken seriously —
// and, more practically, it is invisible to the AI answer engines the AI
// Visibility module is entirely about.
//
// EVERY FIELD IS SOMETHING WE CAN STAND BEHIND. No aggregateRating, no
// reviewCount, no founding date, no employee count, no award — the exact fields
// seo-artifacts.ts refuses to invent for customers. A schema block is read by
// machines that cannot tell an aspiration from a fact.

import { legalEntityConfigured } from "@/components/LegalEntity";

const SITE = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://www.marketwaros.com").replace(/\/$/, "");
const ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME || "";

const DESCRIPTION =
  "An AI customer-acquisition platform: audits a website, builds and runs campaigns, publishes content, and measures whether AI assistants recommend the business.";

export default function SiteJsonLd() {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "MarketWar OS",
      url: SITE,
      description: DESCRIPTION,
      logo: `${SITE}/brand/icon-512.png`,
      // Only when the operating entity is actually configured — a legalName we
      // invented would be a fabrication in machine-readable form.
      ...(legalEntityConfigured && ENTITY ? { legalName: ENTITY } : {}),
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: `${SITE}/contact`,
        availableLanguage: ["en"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "MarketWar OS",
      description: DESCRIPTION,
      publisher: { "@id": `${SITE}/#organization` },
      inLanguage: "en-GB",
    },
    {
      "@type": "SoftwareApplication",
      name: "MarketWar OS",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE,
      description: DESCRIPTION,
      publisher: { "@id": `${SITE}/#organization` },
      // Pricing is stated as a RANGE with a free tier, which is true and
      // checkable on /choose-plan. No "offers" with an invented price.
      offers: {
        "@type": "Offer",
        category: "subscription",
        priceCurrency: "GBP",
        url: `${SITE}/choose-plan`,
      },
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Escaped so a future field containing "</script>" cannot close the tag
      // early — the same rule the auto-deploy snippet follows.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph })
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e"),
      }}
    />
  );
}
