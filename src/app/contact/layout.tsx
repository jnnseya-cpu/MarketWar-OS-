import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, and Next forbids exporting metadata from
// one — so the title and description live in the route layout instead. They
// were simply absent before: this page inherited the site-wide default, so a
// search result for it said nothing about what is on it.
export const metadata: Metadata = {
  title: "Contact MarketWar OS",
  description: "Questions about the platform, pricing, partnerships or your account. We answer from a real inbox.",
  alternates: { canonical: "/contact" },
  openGraph: { title: "Contact MarketWar OS", description: "Questions about the platform, pricing, partnerships or your account. We answer from a real inbox.", type: "website" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
