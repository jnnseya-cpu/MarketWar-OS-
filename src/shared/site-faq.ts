// THE QUESTIONS A BUYER ASKS, AND WHY THEY ARE NOT JUST COPY.
//
// MOVED OUT OF `app/page.tsx` so the page and the FAQPage markup read the SAME
// array. These answers were already written, already honest and already better
// than a second set would be — the only thing wrong with them was that nothing
// machine-readable said they existed, and the questions were not headings.
//
// WHAT WAS ACTUALLY BROKEN. Our own paid GEO report scored marketwaros.com
// **80/100, grade B, and FAILED "Answerable content (FAQ / Q&A)" at weight 20 —
// zero question-style headings on the home page.** The check counts
// `<h2>`–`<h4>` headings that end in a question mark, and every question here sat
// inside a bare `<summary>`. So the content a model would quote was present and
// invisible: eight good answers that neither a crawler nor our own audit could
// find. That check exists in the product because a question-and-answer pair is
// the format an assistant lifts — asked "will it email my customers without me",
// a model can quote a sentence that answers it and cannot quote a feature grid.
//
// THE ONE NUMBER IN HERE IS DERIVED. "one weapon of twelve" was typed, and the
// twelve is `INCLUDED_TOOLS.length`. The last time a number was typed onto a
// public page it was wrong within a month (§151: "32 checks" where the code said
// 31), so it is read from the list and a test holds the two together.

import { INCLUDED_TOOLS } from "@/shared/included-tools";

export type SiteFaqItem = { q: string; a: string };

/** Small words for small numbers, so public copy reads as prose. */
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const spell = (n: number): string => WORDS[n] ?? String(n);

/** How many tools the platform replaces, as a word. Counted, never typed. */
const TOOL_COUNT = spell(INCLUDED_TOOLS.length);

export const SITE_FAQ: SiteFaqItem[] = [
  {
    q: "I'm not a marketer. Can I actually use this?",
    a: "That's the operating principle of the whole platform. You tell the OS what you sell, who you want and where you operate — it handles diagnosis, strategy, campaigns, copy, landing pages, follow-up and budget decisions, then tells you exactly what to do each day in plain language.",
  },
  {
    q: "How is this different from an AI content tool?",
    a: `Content tools create posts. MarketWar OS diagnoses the business, rebuilds the offer, launches tracked experiments, qualifies leads in WhatsApp, protects the budget and attributes every pound to revenue. Content is one weapon of ${TOOL_COUNT}, not the product.`,
  },
  {
    q: "What happens to campaigns that don't work?",
    a: "They die fast. Every campaign launches with kill criteria agreed in advance — exact cost-per-lead and CTR thresholds. The Budget Protection agent pauses waste automatically and reroutes the budget to proven winners, with a weekly 'money saved' receipt.",
  },
  {
    q: "Do I need a big ad budget?",
    a: "No. The OS starts with money you already own: your existing customer list. Import it and dormant customers — people who bought before and stopped — are surfaced and ranked, which is the cheapest sale any business can make. Local SEO and referral loops cost nothing but time. If you do run paid ads, tests start small and only scale on evidence you can see.",
  },
  {
    q: "Will it email my customers or post publicly without me?",
    a: "No, and that is enforced in the code rather than promised in the copy. Agents can run in chains, on a schedule, overnight — but every step declares what it does, and only the ones that DRAFT are allowed to run on their own. Anything that would send a message, publish a page or spend money becomes an item waiting for your approval, with the draft attached. That holds for scheduled runs too: you wake up to work you can read, not to messages you did not see go out.",
  },
  {
    q: "How much can it spend while I am not watching?",
    a: "A fixed ceiling per brand per day, reserved before each step rather than counted afterwards, so a job that gets stuck cannot run up a bill on the grounds that failing is free. When the ceiling is reached the remaining steps stop and say so rather than disappearing quietly. It only limits what the platform does on its own initiative — anything you run yourself is governed by your own ACU balance, which is shown next to every action before you click it.",
  },
  {
    q: "Can you get me more reviews and followers?",
    a: "More reviews, yes — from people you actually served. The platform reads your customer list, works out who is eligible (a real order, finished long enough ago to have an opinion, not asked recently, consent intact), builds the correct review link for the platform you choose, and paces the sending so a sudden burst does not trip the filters. Everyone eligible gets the same link, because screening for the happy ones first is illegal under the UK DMCC Act 2024 and the US FTC rule. Supplied reviews and bought followers are not available here at any price: the penalty for them lands on your page, not ours, and bought followers make your reach worse because every feed ranks by engagement rate.",
  },
  {
    q: "Which AI powers the agents, and do I need my own account?",
    a: "You need no AI account of your own. The intelligence is included in your plan and priced in ACUs — the unit shown next to every action before you click it — so there is nothing to sign up for, no separate bill and no keys to manage. The agents run on frontier models, and the platform routes across more than one provider, so a single provider having a bad day does not stop your work. If you would rather use your own provider account you can connect it on higher tiers, but nobody has to.",
  },
];
