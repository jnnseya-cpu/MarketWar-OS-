// FAQPage MARKUP FROM THE ARRAY THE PAGE RENDERS.
//
// A component rather than an inline block, so the page cannot emit markup from
// one list while rendering another: it takes the items it is given, and the
// caller gives it exactly what it maps over. Markup describing questions a page
// does not show is a Google policy violation, and the same value derived twice
// on either side of a boundary is this codebase's oldest defect class.
//
// Server-rendered on purpose. Most assistant crawlers do not run scripts, so
// anything injected on the client is invisible to the engines this exists for.

import type { SiteFaqItem } from "@/shared/site-faq";

export default function FaqJsonLd({ items }: { items: readonly SiteFaqItem[] }) {
  // Schema.org requires an acceptedAnswer. A question with no answer is a prompt
  // with nothing behind it, so it is left out of the markup rather than claimed.
  const answered = items.filter((f) => f.q.trim() && f.a.trim());
  if (!answered.length) return null;

  const graph = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: answered.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Escaped so an answer containing "</script>" cannot close the tag early —
      // the same rule SiteJsonLd and the hosted pages follow.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c").replace(/>/g, "\\u003e"),
      }}
    />
  );
}
