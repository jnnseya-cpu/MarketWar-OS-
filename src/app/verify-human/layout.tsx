import type { Metadata } from "next";

// The verification page carries its own metadata AND its own noindex.
//
// A security checkpoint is not a landing page: indexing it would put a
// "checking you're human" result in front of people searching for the product,
// and would advertise the door to anyone cataloguing ways in.
export const metadata: Metadata = {
  title: "Verify you're human · MarketWar OS",
  // Was 203, over the 165 our own audit publishes. The clause being cut off was
  // "nothing collected about you" — the reassurance the page exists to give.
  description: "A quick check that a person is at the keyboard: a small computation in your browser. No puzzles, no images to click, nothing collected about you.",
  robots: { index: false, follow: false },
};

export default function VerifyHumanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
