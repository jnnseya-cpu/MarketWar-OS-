// THE CUSTOMER DECK — EVERY NUMBER READ OUT OF `src/`, NOT TYPED HERE.
//
// WHY IT IS BUILT RATHER THAN WRITTEN. A deck outlives the conversation: it gets
// forwarded, quoted back, and held up six months later when a price has moved.
// Every figure below comes from `ads-facts.mjs`, which parses the real plan
// table, the real agent registry and the real audit route, and THROWS if a shape
// changes. A price nobody can quote wrongly is worth more than a prettier slide.
//
// HOW IT IS PUNCHY WITHOUT LYING, because the first draft was neither.
//
// The first version read like an engineering document: accurate, calm, and it
// sold nothing. The temptation at that point is to reach for the things that
// make a deck feel persuasive — a testimonial, a customer count, "4x ROI". This
// company has no customers, so every one of those would be a lie a serious buyer
// discovers in one search, and the verifier fails the build on all of them.
//
// So the punch comes from craft instead:
//
//   • SECOND PERSON, PRESENT TENSE. "You boosted a post" beats "businesses often
//     boost posts".
//   • SCENES, NOT ADJECTIVES. A reader recognises a Tuesday they have had. They
//     do not recognise "powerful growth platform".
//   • ARITHMETIC THE READER SUPPLIES. We never claim a result. We ask a question
//     whose answer is their own number, and their own number is more persuasive
//     than any figure we could invent.
//   • THE WEAKNESS, SAID FIRST. "You have never heard of us" is the objection in
//     every reader's head by slide three. Saying it out loud, and answering it
//     with a free check they can run before they speak to anybody, converts the
//     one thing we cannot fix into the reason to start.
//
// WHAT IS DELIBERATELY ABSENT AND WILL STAY ABSENT: customer names, logos,
// testimonials, case studies, "trusted by", growth percentages, ROI multiples,
// guarantees, awards — and any legal entity name or address, which are not
// published on the site yet.
//
// AND THE GUARD IS BLUNT ON PURPOSE. This slide originally said "a testimonial
// we wrote ourselves" — rejecting one, not making one — and the verifier failed
// the build on the word. The tempting fix is to make the check cleverer. The
// right fix is to move the copy: a word-match guarding a claim that could cost a
// customer their trust should stay stupid and loud, because the day somebody
// teaches it to understand context is the day it starts letting things through.

import {
  FREE, STARTER, GROWTH,
  TOOL_TOTAL, TOOL_KEYLESS,
  FREE_FINDINGS_WORD,
  AGENT_COUNT,
  VIDEO_CHEAPEST, VIDEO_DEFAULT_PRICE,
  SHARE2EARN_PCT, MIN_WITHDRAWAL_GBP,
} from "./ads-facts.mjs";
import { auditCheckCount } from "../src/shared/audit-copy.ts";

const CHECKS = auditCheckCount();

export const BRAND = {
  name: "MarketWar OS",
  site: "marketwaros.com",
  auditUrl: "marketwaros.com/audit",
};

/** Facts a verifier re-derives and looks for in the rendered PDF. */
export const CLAIMS = {
  checks: CHECKS,
  freeFindings: FREE_FINDINGS_WORD,
  agents: AGENT_COUNT,
  tools: TOOL_TOTAL,
  keyless: TOOL_KEYLESS,
  free: FREE, starter: STARTER, growth: GROWTH,
  videoFrom: VIDEO_CHEAPEST.gbp,
  videoDefault: VIDEO_DEFAULT_PRICE,
  share2earnPct: SHARE2EARN_PCT,
  minWithdrawal: MIN_WITHDRAWAL_GBP,
};

export const SLIDES = [
  {
    kind: "cover",
    eyebrow: BRAND.site,
    title: "Your marketing spends. It never stops.",
    lede: `${AGENT_COUNT} AI agents that write the offer, run the campaigns, and kill the ones losing your money. ` +
      `Start by auditing your own website free — ${CHECKS} checks, no account, no card.`,
    foot: "Every number in this deck is on the website. Check it before you believe it.",
  },

  {
    kind: "hero",
    eyebrow: "Start here",
    big: "Name the advert",
    title: "that brought you your last customer.",
    body: "Most owners cannot. Not because they are careless — because nothing they pay for was ever built to tell them.",
  },

  {
    kind: "statement",
    eyebrow: "The Tuesday you have had",
    title: "You know this week",
    body: [
      "You boosted a post. It got four thousand views and no phone calls. You do not know which four thousand.",
      "An agency sends a report on the 5th. It is beautiful. Nothing in it says stop.",
      "A customer who bought from you twice last year has not been back since March. Nobody noticed.",
      "None of that is a marketing problem. It is a nobody-is-watching problem.",
    ],
  },

  {
    kind: "hero",
    eyebrow: "The difference",
    big: "It says no.",
    title: "Every other tool only says what happened.",
    body: "A dashboard shows you £400 went out and two enquiries came back. It shows you that again next month. Ours refuses to run the advert that cannot be measured, and stops the one that is losing.",
  },

  {
    kind: "list",
    eyebrow: "What it refuses",
    title: "Five things it will not do, whatever you tell it",
    items: [
      { h: "Spend where it cannot measure", p: "No conversion tracking, no paid boost. Spending blind is not a service you should be sold." },
      { h: "Hand you somebody else's email", p: "Every address is checked against the business it belongs to. Directory inboxes are binned, not added to your list." },
      { h: "Post the same thing twice", p: "When a publish response is lost, it asks the channel what happened instead of guessing and posting again." },
      { h: "Invent anything", p: "No made-up contacts. No filler statistics. When it cannot find something, it tells you it could not." },
      { h: "Keep going when you say stop", p: "One control halts every campaign, every scheduled send and every pound, instantly." },
    ],
  },

  {
    kind: "steps",
    eyebrow: "No sales call. No card.",
    title: `Audit your own website in four minutes`,
    steps: [
      { n: "1", h: "Type your address", p: `It crawls your real pages and runs ${CHECKS} checks, exactly as a search engine would.` },
      { n: "2", h: `Read your ${FREE_FINDINGS_WORD} worst problems`, p: "In full. Free. With what each one is costing you and how to fix it. Not a score with a salesperson attached." },
      { n: "3", h: "Judge us on it", p: "If it is wrong, you have lost four minutes and learned not to trust the rest. That is exactly why we lead with it." },
    ],
    foot: BRAND.auditUrl,
  },

  {
    kind: "grid",
    eyebrow: "Then it goes to work",
    title: `${AGENT_COUNT} agents. ${TOOL_TOTAL} tools. ${TOOL_KEYLESS} of them running before you connect a thing.`,
    cards: [
      { h: "Finds the customers", p: "Give it a list of business names. It finds their websites, their published addresses and their numbers — and never invents one." },
      { h: "Writes what you send", p: "Offers, emails, adverts, landing pages. In your voice and your customer's language, not a template with your name dropped in." },
      { h: "Runs the campaigns", p: "Email, social and paid, briefed, made, published and followed up from one place, on one bill." },
      { h: "Guards the money", p: "Cost per lead and per order against your own numbers. Every refusal is calculated, never guessed." },
    ],
  },

  {
    kind: "sizes",
    eyebrow: "Whatever size you are",
    title: "One engine. Three very different jobs.",
    columns: [
      {
        h: "On your own",
        sub: "A trade, a shop, one practice",
        p: "No marketing hours, no agency. It writes, sends and chases — and tells you which of your own customers are about to leave while there is still time.",
        proof: `Starts at ${FREE.monthly}. The audit, the vault and the offer builder need no card at all.`,
      },
      {
        h: "Growing",
        sub: "A team, a few thousand customers",
        p: "Campaigns running, no idea which pay. It scores every one against your own median, kills the losers and moves the budget to what works.",
        proof: `${GROWTH.name}: ${GROWTH.monthly} a month, ${GROWTH.brands} brands, ${GROWTH.users} people.`,
      },
      {
        h: "Several brands",
        sub: "A group, a franchise, an agency",
        p: "Each brand keeps its own voice, its own sending domain, its own audience. One account, one bill, and no brand's list ever touches another's.",
        proof: "Separated in the database, not by a filter on a screen.",
      },
    ],
  },

  {
    kind: "objection",
    eyebrow: "The obvious question",
    title: "You have never heard of us",
    body: [
      "That is true, and we are not going to paper over it with a wall of logos or a five-star quote we wrote ourselves.",
      "So here is the deal instead. Run the free audit on your own website before you speak to anybody here. It costs nothing, needs no account, and it runs the same checks the paid product runs.",
      "If it finds something you did not know, that is your answer. If it does not, you have lost four minutes and you owe us nothing.",
    ],
    foot: "We would rather be checked than believed.",
  },

  {
    kind: "pricing",
    eyebrow: "Pricing",
    title: "No setup fee. No contract. No sales call.",
    plans: [
      { name: FREE.name, price: FREE.monthly, per: "for ever", brands: FREE.brands, users: FREE.users, acus: FREE.monthlyAcus,
        line: "The audit, the customer vault and the offer builder. Enough to judge us on." },
      { name: STARTER.name, price: STARTER.monthly, per: "a month", brands: STARTER.brands, users: STARTER.users, acus: STARTER.monthlyAcus,
        line: `Or ${STARTER.annual}. Everything above, plus live campaigns and AI work.` },
      { name: GROWTH.name, price: GROWTH.monthly, per: "a month", brands: GROWTH.brands, users: GROWTH.users, acus: GROWTH.monthlyAcus,
        line: `Or ${GROWTH.annual}. Several brands and the team around them.`, featured: true },
    ],
    foot: `AI work is charged in credits, so you pay for what you use instead of a seat you do not fill. ` +
      `A ${VIDEO_DEFAULT_PRICE.seconds}-second video is about £${VIDEO_DEFAULT_PRICE.gbp}; the shortest is £${VIDEO_CHEAPEST.gbp}. ` +
      `Work you do not run costs nothing. Cancel whenever you like and take your list with you.`,
  },

  {
    kind: "statement",
    eyebrow: "And if you send somebody",
    title: "You get paid for the introduction",
    body: [
      `Share your link. When somebody you introduced spends, you earn ${SHARE2EARN_PCT} of it — for as long as they stay.`,
      `Withdraw from £${MIN_WITHDRAWAL_GBP}. No follower count. No application. No tier to climb first.`,
    ],
  },

  {
    kind: "close",
    eyebrow: "Do this next",
    title: "Audit your website before you talk to us",
    body: [
      `Go to ${BRAND.auditUrl}. Type your address. ${CHECKS} checks against your real pages, your ${FREE_FINDINGS_WORD} worst problems in full, free.`,
      "Then decide whether the rest of this deck was worth reading.",
    ],
    foot: BRAND.site,
  },
];
