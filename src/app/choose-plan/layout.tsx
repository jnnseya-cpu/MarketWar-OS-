import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, and Next forbids exporting metadata from
// one — so the title and description live in the route layout instead. They
// were simply absent before: this page inherited the site-wide default, so a
// search result for it said nothing about what is on it.
export const metadata: Metadata = {
  title: "Pricing & plans · MarketWar OS",
  description: "Eight plans from free to global. Platform access plus a monthly ACU allowance for AI work — GBP 1 = 100 ACUs, and you top up only what you use.",
  alternates: { canonical: "/choose-plan" },
  openGraph: { title: "Pricing & plans · MarketWar OS", description: "Eight plans from free to global. Platform access plus a monthly ACU allowance for AI work — GBP 1 = 100 ACUs, and you top up only what you use.", type: "website" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
