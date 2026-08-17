import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page itself is a client component — it acts on a token in the URL the
// moment it loads — so its metadata lives here.
//
// `noindex` is the point of this file as much as the title is: an unsubscribe
// confirmation carries no value to a searcher and every value to a crawler
// looking for pages to fetch. A crawler following an unsubscribe link out of a
// leaked email is exactly how somebody gets removed from a list they wanted.
export const metadata: Metadata = {
  title: "Unsubscribe · MarketWar OS",
  description: "Leave the MarketWar OS weekly email. One click, immediate, and no account needed — your account and anything you asked us to send are untouched.",
  robots: { index: false, follow: false },
};

export default function UnsubscribeLayout({ children }: { children: ReactNode }) {
  return children;
}
