import type { Metadata } from "next";

// The verification page carries its own metadata AND its own noindex.
//
// A security checkpoint is not a landing page: indexing it would put a
// "checking you're human" result in front of people searching for the product,
// and would advertise the door to anyone cataloguing ways in.
export const metadata: Metadata = {
  title: "Verify you're human · MarketWar OS",
  description: "A quick check that a person is at the keyboard. Every part of MarketWar OS requires one — it runs a small computation in your browser, with no puzzles, no images to click and nothing collected about you.",
  robots: { index: false, follow: false },
};

export default function VerifyHumanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
