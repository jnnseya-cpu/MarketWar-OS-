import type { Metadata } from "next";
import { NOINDEX_METADATA } from "@/shared/robots-policy";

// A LAYOUT EXISTS HERE FOR ONE REASON: `page.tsx` is `"use client"`, and a
// client component cannot export `metadata`. So the only place to say "do not
// index this" is a server layout wrapping it.
//
// WHY IT HAS TO BE SAID AT ALL. `/onboarding` was `Disallow`ed in robots.txt,
// which Search Console reports as an error whenever anything links to the path —
// and a disallow is the wrong instruction regardless: it refuses the fetch
// rather than refusing the index, so Google can still list the bare URL and can
// never read a `noindex` on the page. See `shared/robots-policy.ts`.
export const metadata: Metadata = {
  title: "Set up your brand — MarketWar OS",
  description: "Tell MarketWar OS about your business once, and every engine, agent and campaign is configured from it.",
  robots: NOINDEX_METADATA,
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
