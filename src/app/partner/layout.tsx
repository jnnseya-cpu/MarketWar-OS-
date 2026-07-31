import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, and Next forbids exporting metadata from
// one — so the title and description live in the route layout instead. They
// were simply absent before: this page inherited the site-wide default, so a
// search result for it said nothing about what is on it.
export const metadata: Metadata = {
  title: "Partner programme · MarketWar OS",
  description: "Refer businesses to MarketWar OS and earn recurring commission, with earnings and payouts visible in your own dashboard.",
  alternates: { canonical: "/partner" },
  openGraph: { title: "Partner programme · MarketWar OS", description: "Refer businesses to MarketWar OS and earn recurring commission, with earnings and payouts visible in your own dashboard.", type: "website" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
