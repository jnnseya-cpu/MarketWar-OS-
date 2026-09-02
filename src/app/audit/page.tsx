import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import FreeAudit from "@/components/FreeAudit";
import { checksByArea, auditCheckCount, conditionalChecks } from "@/shared/audit-copy";
import { siteUrl } from "@/shared/site";

const CHECKS = auditCheckCount();

export const metadata: Metadata = {
  title: `Free website audit — ${CHECKS} checks on your actual page · MarketWar OS`,
  description: `Put your website in and get a real, measured audit in about fifteen seconds: ${CHECKS} checks on the page itself, what each one is costing you in enquiries, and what to change. No account, no card, nothing to install.`,
  alternates: { canonical: "/audit" },
  openGraph: {
    title: `Free website audit — ${CHECKS} checks, no account`,
    description: "We read your actual page and tell you what is quietly losing you enquiries — with what each fault costs you and how to fix it.",
    type: "website",
  },
};

// THE FRONT DOOR.
//
// Every tool in this category that grew organically did it the same way: put the
// valuable thing on the OUTSIDE of the login and let it be found. Ours has been
// on the inside since SiteRaid shipped, which is why it has never won anybody.
//
// This page gives a true, specific answer about somebody's own business before
// asking for anything, because that is the only thing that earns an email from a
// stranger who has never heard of us.
//
// HOW IT SELLS, given there is not one customer to quote yet. Not with claims —
// every competitor makes the same ones — but with SPECIFICITY, which is the only
// persuasion available to a business nobody has heard of:
//
//   • the CATALOGUE is on the page. Twenty-nine named checks, each with the
//     sentence saying what it costs. Anybody can write "we check your SEO";
//     printing the list is only possible when the list is real, and it is
//     generated from the same file the report itself reads.
//   • the OBJECTIONS are answered before they are raised — what the email is
//     for, what we do with it, what we will try to sell.
//   • the ALTERNATIVE is named. A page that pretends there is no other way to
//     fix these things is a page nobody believes.
//
// The counts come from `auditCheckCount()`. Nothing here is a number somebody
// typed, so a check added to the crawler tomorrow appears here the same day and
// this page can never over-promise.

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is the audit really free, with no account?",
    a: `Yes. You type an address, we fetch that page and run ${CHECKS} checks on what comes back. There is no account, no card and nothing to install, and the score plus the three most expensive findings appear straight away.`,
  },
  {
    q: "Why do you ask for an email address to see the rest?",
    a: "Because the full report is the thing worth having and we would like to be able to send it to you. It is one address, used to send you that report; the remaining findings appear on the page immediately whether the email arrives or not.",
  },
  {
    q: "Are the numbers in the report estimates?",
    a: "No. Everything reported was measured on your page in the last few seconds. There are no industry averages and no percentages anywhere in it, because a statistic nobody counted is the reason people distrust these reports. Checks that could not be read from the response are listed separately rather than counted against you.",
  },
  {
    q: "What if I just want to fix the problems myself?",
    a: "Then do. The report names the fix for every finding, specifically enough to hand to whoever built the site. It is yours to keep and we have lost nothing but a fetch.",
  },
  {
    q: "Does the audit change anything on my website?",
    a: "No. It requests your page the way a search engine would and reads what comes back. Nothing is written, nothing is submitted, and no account of yours is touched.",
  },
  {
    q: "What does MarketWar OS actually do after the audit?",
    a: "It fixes what the audit found and keeps it fixed: the pages, the structured data, the publishing, and a re-crawl that tells you the day something breaks. The plans are on the pricing page and the free tier needs no card.",
  },
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The address the hero handed over. Checked, never trusted: it is a query
  // string, so it is whatever anybody put in a link. Only the shape of a host
  // survives — anything else arrives as an empty field, which is exactly what
  // this page did before.
  const sp = await searchParams;
  const raw = typeof sp.url === "string" ? sp.url.trim().slice(0, 300) : "";
  const startUrl = /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw.replace(/^https?:\/\//i, "")) ? raw : "";
  const groups = checksByArea();
  const conditional = conditionalChecks();

  // FAQPage describes what is genuinely on this page — the same six questions,
  // with the same answers, rendered below. Structured data that promises
  // something the page does not contain is a manual action waiting to happen.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question", name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "MarketWar OS", item: siteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Free website audit", item: siteUrl("/audit") },
        ],
      },
    ],
  };

  return (
    <MarketingShell
      kicker={`Free · no account · ${CHECKS} checks`}
      title="What is your website quietly costing you?"
      subtitle={`Put your address in below. We read the actual page and run ${CHECKS} checks on it — then tell you, for every one that fails, what it is costing you in enquiries and exactly what to change. About fifteen seconds, no account, no card.`}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Prose>
        {/* A real anchor, because the closing button below points at it. A
            href to an id nothing carries scrolls nowhere and reads as broken. */}
        <div id="run-the-audit" className="scroll-mt-24">
          {/* The address typed in the hero arrives here already filled in, so the
              journey is one field rather than two. Server-rendered from the
              query string; `searchParams` is a promise in Next 15. */}
          <FreeAudit initialUrl={startUrl} />
        </div>

        {/* THE CATALOGUE. The strongest thing this page can do is stop making
            claims and show the list. */}
        <H2>The {CHECKS} checks, by name</H2>
        <p>
          Not &ldquo;we check your SEO&rdquo;. This is the list, generated from the same file the
          report itself reads, so it cannot drift from what actually runs. Every one is measured on
          your own page rather than looked up in a database of averages. Tap any check below to open
          it and read what it costs you; in your own report, every check that fails also carries the
          fix and what MarketWar does about it.
        </p>
        <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.area} className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">{g.area}</span>
                <span className="text-[11px] font-semibold text-slate-500">{g.checks.filter((c) => !conditional.includes(c.label)).length}</span>
              </p>
              {/* Each check opens to the sentence saying what it costs. Native
                  <details>, so it needs no JavaScript and every one of them is
                  in the HTML a search engine reads — which is the other half of
                  why this page exists. */}
              <ul className="mt-2 space-y-0.5">
                {g.checks.map((c) => (
                  <li key={c.label}>
                    <details className="group">
                      {/* THE AFFORDANCE HAS TO BE VISIBLE, or the sentence above
                          this grid is a lie. It read "Open any of them to see
                          why it costs you money" while the only clickable
                          indication was a `›` in slate-600 on a near-black
                          panel, which did not move when the item opened. The
                          owner's report was one word: "where????????".
                          Native marker off, our own chevron on: readable at
                          rest, emerald and rotated when open, so the row states
                          both that it opens and whether it is open. */}
                      <summary className="flex cursor-pointer list-none items-baseline gap-1.5 rounded text-[13px] leading-relaxed text-slate-300 marker:content-none hover:text-white">
                        <span
                          aria-hidden="true"
                          className="inline-block shrink-0 text-slate-400 transition-transform duration-150 group-open:rotate-90 group-open:text-emerald-400"
                        >
                          ›
                        </span>
                        <span className="underline decoration-slate-700 decoration-dotted underline-offset-4 group-hover:decoration-slate-400 group-open:decoration-emerald-500/50">
                          {c.label}
                        </span>
                        {conditional.includes(c.label) && <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-500">when it applies</span>}
                      </summary>
                      <p className="mb-2 ml-4 mt-1 text-xs leading-relaxed text-slate-400">{c.costs}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">
          {conditional.length > 0 && (
            <>
              {conditional.length === 1 ? "One further check" : `${conditional.length} further checks`} only
              {conditional.length === 1 ? " appears" : " appear"} when the page turns out to warrant
              {conditional.length === 1 ? " it" : " them"}, so {CHECKS} is the number that is true of every site
              rather than the largest number we could print.{" "}
            </>
          )}
          Checks that could not be read from the response — a page that renders entirely in JavaScript,
          for instance — are listed separately rather than counted against you. Scoring something we could
          not see is how these tools end up telling people to fix problems they do not have.
        </p>

        <H2>Why a linter&rsquo;s output is useless, and this is not</H2>
        <p>
          Most free checkers hand you a colour-coded list of technical strings.{" "}
          <em>Meta description missing.</em> <em>H1 count: 3.</em> If you are a plumber, a
          physiotherapist or a florist, that is a list of things you cannot act on written in a
          language you did not agree to learn — so it gets closed, and nothing changes.
        </p>
        <p>
          Every finding here answers the only three questions that matter. <strong>What this costs
          you</strong>, in one sentence about your enquiries rather than your markup.{" "}
          <strong>The fix</strong>, specific enough to forward to whoever built the site.{" "}
          <strong>With MarketWar</strong>, what the platform does about it if you would rather not
          do it yourself. That third line is the only sales pitch on the report, and it appears
          under the problem it actually solves.
        </p>
        <p>
          There are no percentages and no currency amounts anywhere in it. Not one. A test refuses
          to let the build finish if a single line of that copy contains either, because a
          fabricated statistic is checked against nothing — and the moment a reader catches one,
          every true thing beside it stops counting too.
        </p>

        <H2>What happens after the report</H2>
        <p>
          You have a list. Three things can happen to it, and we would rather say all three than
          pretend there is only one.
        </p>
        <ul>
          <li>
            <strong>Fix it yourself.</strong> The report names the change for every finding. Take it
            to your web person, or do it over a weekend. Nothing here is locked and nothing expires.
          </li>
          <li>
            <strong>Fix it and watch it stay fixed.</strong> Most of these faults come back — a
            certificate lapses, a footer year goes stale, a redirect gets dropped in a redesign, and
            nobody finds out until a customer mentions it. Re-running the audit on a schedule is the
            cheap half of the problem.
          </li>
          <li>
            <strong>Fix the reason there was a list.</strong> The findings are symptoms of not having
            anyone whose job is the marketing. That is what the platform is for: the pages, the
            structured data, the publishing, the campaigns and the scorekeeping, in one place, with
            every action priced before it runs.
          </li>
        </ul>

        <H2>Why it is free</H2>
        <p>
          Because it is the honest version of an advert. Rather than telling you we could improve
          your marketing, we would rather show you {CHECKS} measured things about it and let you
          decide whether the software that found them is worth paying for. If the answer is no, you
          keep the audit and we have lost nothing but a fetch.
        </p>
        <p>
          It costs us almost nothing to run — one request to your page, no AI, no third party — which
          is why it can stay free rather than becoming a trial that has to be cancelled.
        </p>

        <H2>Common questions</H2>
        <div className="not-prose mb-8 space-y-3">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-4">
              <p className="text-sm font-semibold text-white">{f.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>

        {/* The close. It repeats the one instruction the page exists for,
            because somebody who has read this far scrolled past the form. */}
        <div className="not-prose my-8 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
          <p className="text-sm font-semibold text-white">Run it on your own site.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-emerald-100/90">
            It takes about fifteen seconds, needs no account, and you will know {CHECKS} true things
            about your website that nobody has told you before. Scroll back up, or start free — the
            free tier needs no card either.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="#run-the-audit" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/10">
              Audit my site
            </Link>
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400">
              Start free — no card
            </Link>
          </div>
        </div>

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
