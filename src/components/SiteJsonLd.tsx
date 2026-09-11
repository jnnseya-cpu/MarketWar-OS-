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
import { siteOrigin, isPublicProfileUrl } from "@/shared/site";

const SITE = siteOrigin();
const ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME || "";

/**
 * Profiles that are verifiably the same organisation.
 *
 * Read from the environment rather than typed, because these are facts about the
 * business that only the owner holds — and an entry here that points somewhere
 * wrong tells every AI assistant and search engine that a stranger's profile is
 * this company.
 */
const SAME_AS: string[] = [
  process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN,
  process.env.NEXT_PUBLIC_SOCIAL_X,
  process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
  process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
  process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
  process.env.NEXT_PUBLIC_COMPANIES_HOUSE_URL,
]
  .map((v) => (v || "").trim())
  // An https URL or nothing — see `isPublicProfileUrl`. One implementation, in
  // shared/, because a copy of this rule beside a copy in its test proves only
  // that the two copies agree.
  .filter(isPublicProfileUrl);

const DESCRIPTION =
  "An AI customer-acquisition platform: audits a website, builds and runs campaigns, publishes content, and measures whether AI assistants recommend the business.";

export default function SiteJsonLd() {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "MarketWar OS",
      // WHAT PEOPLE ACTUALLY TYPE. Search Console shows the brand queries
      // reaching this site are "marketwar" and "marketwor", not "MarketWar OS" —
      // so the shorter form is a genuine alternate name of this organisation and
      // declaring it helps an engine bind those queries to one entity instead of
      // guessing. Factual, not aspirational: nobody is claiming a trading name
      // here, only that the company is also called MarketWar.
      alternateName: ["MarketWar"],
      url: SITE,
      description: DESCRIPTION,
      logo: `${SITE}/brand/icon-512.png`,
      // WHO WE ARE THE SAME ENTITY AS — the field this platform's own AI-citation
      // module tells customers they must have: "sameAs → your Companies House
      // record, LinkedIn, Crunchbase, review profiles. Without it a model has to
      // infer all of that from prose, and it will usually decline to." We
      // published none of it, which is the fourth time this site has failed a
      // check it sells.
      //
      // IT CANNOT BE INVENTED. A sameAs pointing at a profile that is not ours,
      // or does not exist, is a machine-readable lie and worse than the silence.
      // So the WIRING ships and the values stay the owner's: set the social
      // profile variables and the field appears on the next deploy with no code
      // change. Until then it is absent, which is the honest state.
      ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
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
