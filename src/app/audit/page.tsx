import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import FreeAudit from "@/components/FreeAudit";

export const metadata: Metadata = {
  title: "Free website audit — see what's costing you enquiries · MarketWar OS",
  description: "Put your website in and get a real, measured audit in about fifteen seconds: what search engines see, what is slowing you down, and what is quietly costing you enquiries. No account, no card, nothing to install.",
  alternates: { canonical: "/audit" },
};

// THE FRONT DOOR.
//
// Every tool in this category that grew organically did it the same way: put the
// valuable thing on the OUTSIDE of the login and let it be found. Ours has been
// on the inside since SiteRaid shipped, which is why it has never won anybody.
//
// This page is deliberately not a pitch. It gives a true, specific answer about
// somebody's own business before asking for anything, because that is the only
// thing that earns an email from a stranger who has never heard of us.

export default function AuditPage() {
  return (
    <MarketingShell
      kicker="Free · no account"
      title="What is your website costing you?"
      subtitle="Put your address in below. We read the actual page and tell you what search engines see, what is slowing it down, and what is quietly losing you enquiries — in about fifteen seconds, with no account and no card."
    >
      <Prose>
        <FreeAudit />

        <H2>What this actually checks</H2>
        <p>
          It fetches your page the way a search engine would and measures what came back: whether
          the title and description are there and usable, how fast the server answered, whether the
          page works on a phone, whether images can be read by anything that is not a pair of eyes,
          whether you have a robots file and a sitemap, and whether your business is described in
          structured data — the part that decides whether an AI assistant can quote you at all.
        </p>
        <p>
          Everything it reports was measured on your page in the last few seconds. Nothing is an
          industry average and nothing is a guess. Where a check could not be read from the response
          — a page that renders entirely in JavaScript, for instance — it is listed separately rather
          than counted against you, because scoring something we could not see is how these tools
          end up telling people to fix problems they do not have.
        </p>

        <H2>Why it is free</H2>
        <p>
          Because it is the honest version of an advert. Rather than telling you we could improve
          your marketing, we would rather show you three true things about it and let you decide
          whether the software that found them is worth paying for. If the answer is no, you keep
          the audit and we have lost nothing but a fetch.
        </p>
        <p className="text-sm text-slate-400">
          When you want the engines that produced this — the ones that fix what it found, write the
          pages, run the campaigns and keep score — the plans are on{" "}
          <Link href="/choose-plan">the pricing page</Link>, and{" "}
          <Link href="/how-it-works">how it works</Link> explains the whole loop. If you would
          rather earn from it than buy it, <Link href="/share2earn">SHARE2EARN</Link> pays on
          verified sales with no application.
        </p>
      </Prose>
    </MarketingShell>
  );
}
