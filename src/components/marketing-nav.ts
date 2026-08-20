// The public site's navigation, as data.
//
// Extracted from marketing.tsx so the mobile drawer — a client component — can
// read it without pulling the whole marketing shell into the browser bundle.
// marketing.tsx re-exports it, so every existing `import { FOOTER_NAV } from
// "@/components/marketing"` keeps working: this is an addition, not a move.
//
// One list, three surfaces: the footer, the mobile drawer, and anything added
// later. A second copy is how a phone menu ends up missing the page somebody
// added last week.

export const FOOTER_NAV: { title: string; links: [string, string][] }[] = [
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Industries", "/industries"],
      ["Blog", "/blog"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Product",
    links: [
      ["Free website audit", "/audit"],
      ["Answers", "/features"],
      ["How it works", "/how-it-works"],
      ["Developers", "/developers"],
      ["Get started", "/get-started"],
      ["Growth & Influencers", "/growth"],
      ["Join SHARE2EARN", "/share2earn"],
    ],
  },
  {
    title: "Legal & status",
    links: [
      ["Terms of Service", "/terms"],
      ["Privacy Policy", "/privacy"],
      ["All policies", "/policies"],
      ["Platform status", "/status"],
    ],
  },
];

/** The links the header shows on a wide screen. The drawer covers them too. */
export const HEADER_NAV: [string, string][] = [
  ["How it works", "/how-it-works"],
  ["Industries", "/industries"],
  ["Developers", "/developers"],
  ["Growth", "/growth"],
];
