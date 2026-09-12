// THE CUSTOMER DECK — EVERY NUMBER READ OUT OF `src/`, NOT TYPED HERE.
//
// WHY IT IS BUILT RATHER THAN WRITTEN. A deck is the one document that outlives
// the conversation: it gets forwarded, quoted back, and held up six months later
// when a price has moved. Every figure below comes from `ads-facts.mjs`, which
// parses the real plan table, the real agent registry and the real audit route,
// and THROWS if the shape changes. A price nobody can quote wrongly is worth
// more than a prettier slide.
//
// WHAT IS DELIBERATELY ABSENT, AND WILL STAY ABSENT:
//
//   • Customer names, logos, testimonials, case studies. This platform has no
//     customers yet. Inventing social proof is the one lie a deck can tell that
//     a buyer will definitely discover, and it is the lie that ends the deal.
//   • "Trusted by", "used by N businesses", growth percentages, ROI multiples.
//     None of it is measured, so none of it is claimed.
//   • A legal entity name or address. They are not published on the site yet, and
//     a deck is not the place to invent them.
//
// WHAT IS CLAIMED INSTEAD is what the code does, which is checkable by anybody
// who opens the free audit before they speak to a salesperson — and that is the
// strongest thing an unknown company can offer.

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
    title: "Marketing that refuses to waste your money",
    lede: `Start with a free ${CHECKS}-point audit of your own website. No account. No card. ` +
      `Then ${AGENT_COUNT} AI agents build the offer, run the campaigns and stop the spend that is not working.`,
    foot: "A deck you can check before you believe it — every number here is on the website.",
  },

  {
    kind: "statement",
    eyebrow: "The problem",
    title: "Most marketing tools tell you what happened. None of them refuse.",
    body: [
      "A dashboard shows you that £400 went out and two enquiries came back. It shows you that again next month.",
      "Nothing in it ever declines to run an advert that cannot be measured, stops a campaign that is losing, or tells you an address it found belongs to somebody else.",
      "That is the gap this was built in. Not more reporting — refusal.",
    ],
  },

  {
    kind: "steps",
    eyebrow: "Start here, free",
    title: `A real crawl of your real website, ${CHECKS} checks`,
    steps: [
      { n: "1", h: "Put your address in", p: "No account, no card, no call. The crawler fetches your actual pages, exactly as a search engine would." },
      { n: "2", h: `See your ${FREE_FINDINGS_WORD} worst problems`, p: "Free, in full, with what each one costs you and how to fix it. Not a score with a sales call attached." },
      { n: "3", h: "Decide afterwards", p: "If the audit is wrong, you have lost nothing and you will know not to trust the rest. That is the point of leading with it." },
    ],
    foot: `${BRAND.auditUrl}`,
  },

  {
    kind: "grid",
    eyebrow: "What it actually does",
    title: `${AGENT_COUNT} agents, ${TOOL_TOTAL} tools, ${TOOL_KEYLESS} of them working before you connect anything`,
    cards: [
      { h: "Find the customers", p: "Import a list of business names and it finds their websites, their published addresses and their phone numbers. It never invents one." },
      { h: "Write what you send", p: "Offers, emails, adverts and landing pages, in your brand's voice and your customer's language — not a template with your name dropped in." },
      { h: "Run the campaigns", p: "Briefs, creative, publication and follow-up across email, social and paid, from one place with one bill." },
      { h: "Watch the money", p: "Cost per lead and per order against your own numbers, not an industry average. Every refusal is calculated, never guessed." },
    ],
  },

  {
    kind: "sizes",
    eyebrow: "Whatever size you are",
    title: "The same engine. Three different jobs.",
    columns: [
      {
        h: "On your own",
        sub: "A trade, a shop, a single practice",
        p: "You have no marketing hours and no agency. It does the writing, the sending and the chasing, and it tells you which of your own customers are about to leave.",
        proof: `Starts at ${FREE.monthly} — the audit, the offer builder and the vault need no card at all.`,
      },
      {
        h: "Growing",
        sub: "A team, a few thousand customers",
        p: "You have campaigns running and no idea which are paying. It scores every one against your own median, kills the losers and reroutes the budget to what is working.",
        proof: `${GROWTH.name} is ${GROWTH.monthly} a month for ${GROWTH.brands} brands and ${GROWTH.users} people.`,
      },
      {
        h: "Several brands",
        sub: "A group, a franchise, an agency",
        p: "Each brand keeps its own voice, its own sending domain and its own audience. One account, one bill, and no brand's list ever touches another's.",
        proof: "Brands are separated in the database itself, not by a filter in the interface.",
      },
    ],
  },

  {
    kind: "list",
    eyebrow: "The part nobody else sells",
    title: "It says no, and it says why",
    items: [
      { h: "It will not spend where it cannot measure", p: "A paid boost is refused outright when conversion tracking is not connected. Spending blind is not a service." },
      { h: "It will not send you somebody else's address", p: "Every email it finds is checked against the business it belongs to. A directory inbox is thrown away rather than added to your list." },
      { h: "It will not post twice", p: "When a publish response is lost, the next attempt asks the channel what happened instead of guessing and posting again." },
      { h: "It will not invent anything", p: "No fabricated contacts, no made-up statistics, no filler where a real answer should be. When it cannot find something it tells you that it could not." },
      { h: "It stops when you say stop", p: "One control halts every campaign, every scheduled send and every pound of spend, immediately." },
    ],
  },

  {
    kind: "pricing",
    eyebrow: "Pricing",
    title: "Three plans. No setup fee, no contract, no sales call.",
    plans: [
      { name: FREE.name, price: FREE.monthly, per: "for ever", brands: FREE.brands, users: FREE.users, acus: FREE.monthlyAcus,
        line: "The audit, the customer vault and the offer builder. Enough to judge it." },
      { name: STARTER.name, price: STARTER.monthly, per: "a month", brands: STARTER.brands, users: STARTER.users, acus: STARTER.monthlyAcus,
        line: `Or ${STARTER.annual}. Everything above plus live campaigns and AI work.` },
      { name: GROWTH.name, price: GROWTH.monthly, per: "a month", brands: GROWTH.brands, users: GROWTH.users, acus: GROWTH.monthlyAcus,
        line: `Or ${GROWTH.annual}. For several brands and a team around them.`, featured: true },
    ],
    foot: `AI work is charged in credits so you pay for what you use, not a seat you do not fill. ` +
      `A ${VIDEO_DEFAULT_PRICE.seconds}-second video is about £${VIDEO_DEFAULT_PRICE.gbp}; the shortest is £${VIDEO_CHEAPEST.gbp}. ` +
      `Unused work costs nothing.`,
  },

  {
    kind: "list",
    eyebrow: "What stays yours",
    title: "Your customers, your data, your exit",
    items: [
      { h: "Your list is yours", p: "Export every contact, every campaign and every result at any time, in a file you can open. No permission needed and no fee." },
      { h: "Consent travels with the contact", p: "Who agreed, when, and how, recorded against each person. Unsubscribes are honoured across every brand in the account at once." },
      { h: "Your data is separated at the database", p: "Not hidden by the interface. Another account cannot read yours even if the screen is wrong." },
      { h: "Sensitive fields are encrypted before they are stored", p: "Contact details are written encrypted, not merely protected by a login." },
    ],
  },

  {
    kind: "statement",
    eyebrow: "Referrals",
    title: "If you send somebody, you get paid for it",
    body: [
      `Share a link. When somebody you introduced spends, you earn ${SHARE2EARN_PCT} of it, for as long as they stay.`,
      `Withdraw from £${MIN_WITHDRAWAL_GBP}. No follower count, no application, no tier to reach first.`,
    ],
  },

  {
    kind: "close",
    eyebrow: "Start",
    title: "Audit your website before you talk to anybody",
    body: [
      `${BRAND.auditUrl} — ${CHECKS} checks against your real pages, your ${FREE_FINDINGS_WORD} worst problems in full, free.`,
      "If it finds nothing useful, you have lost four minutes and learned something about us.",
    ],
    foot: BRAND.site,
  },
];
