// THE THREE BUSINESSES THIS OS IS SUPPOSED TO BE SELLING.
//
// MarketWar OS itself, and the two brands it is being live-tested on. Written
// down as data because "not a single customer acquired" is a statement about
// three specific businesses with three specific buyers, and answering it
// requires naming them rather than talking about a platform in the abstract.
//
// EVERY FIELD HERE IS A PLAN, NOT A RESULT. Nothing in this file claims a sale,
// a lead or a conversation. The counts live in the acquisition run, where they
// are recorded one attempt at a time by whoever made the attempt.
//
// The `whyNotSellingYet` line on each is a HYPOTHESIS to be tested by the run,
// not a diagnosis. The run's own arithmetic replaces it the moment there is
// enough evidence to say something better.

export type GtmTarget = {
  id: string;
  name: string;
  site: string;
  /** What is actually being sold, in the words a buyer would use. */
  sells: string;
  /** Who signs. Not a demographic — a person with a budget and a problem. */
  buyer: string;
  /** The problem that makes them look for this in the first place. */
  trigger: string;
  /**
   * The cheapest channel that needs NO provider key and no ad budget.
   *
   * This is the whole point of the field. Every channel that needs credentials
   * is a channel that is not running today; a business with zero customers
   * needs the one it can use this afternoon.
   */
  channelToday: string;
  /** The first offer — small enough to say yes to without a procurement process. */
  firstOffer: string;
  /** What a first sale would have to look like to count as proof. */
  proofOfLife: string;
  whyNotSellingYet: string;
  /**
   * The message. Written out, not a template with slots.
   *
   * The diagnosis says "send ten messages" and the honest objection to that is
   * "send what?". A plan that ends one step before the thing a person has to
   * actually do is a plan that does not get done, so the text lives here, at
   * the point of use, short enough to send from a phone.
   *
   * Square brackets are the only blanks, and each is something only the sender
   * knows. Everything else is finished.
   */
  firstMessage: { channel: string; subject?: string; text: string; why: string };
};

export const GTM_TARGETS: GtmTarget[] = [
  {
    id: "marketwar",
    name: "MarketWar OS",
    site: "marketwaros.com",
    sells: "An AI marketing operating system for small businesses that cannot afford an agency — every engine behind one subscription, priced in credits with the cost of every action shown before it runs. (The engine count is never typed into prose here; it lives in ENGINE_REGISTRY and would be wrong within a week.)",
    buyer: "The owner of a 1–20 person business who is currently doing their own marketing badly, at night, and knows it.",
    trigger: "They have just lost a month to a quiet pipeline, or an agency quoted them £2,000 a month for what they suspect is a template.",
    channelToday: "Direct outreach by the owner, one message at a time, to businesses they can name — plus the site's own pages ranking for what those owners search. No ad account, no sending domain, no API key needed to send fifty messages from a personal inbox.",
    firstOffer: "A free Business DNA + marketing audit of their actual site, delivered as a document with their own numbers in it, and a paid plan only if they want the engines that produced it.",
    proofOfLife: "One business owner who has never met the founder pays for a month and uses it in week two.",
    whyNotSellingYet: "Nobody has been asked to buy it. The product has been built, the site is live, and the number of businesses contacted is the number this OS should be counting and has not been.",
    firstMessage: {
      channel: "Email or LinkedIn, from your own account",
      subject: "your [town] website — three things",
      text: [
        "Hi [name] — I build marketing software, and I've been testing it by running real audits on local business sites. I ran yours this morning.",
        "",
        "Three things on it are quietly costing you enquiries. Two are ten-minute fixes; the third is why you are not showing up when people search for what you do.",
        "",
        "I've written it up properly. It's yours free, no pitch attached — want me to send it over?",
      ].join("\n"),
      why: "It leads with something true about THEIR business, which is the only opening a stranger reads to the end. The ask is to receive a document, not to buy anything or take a meeting — the smallest yes there is. Run the audit before you send it; a message that promises three findings and has none is worse than no message.",
    },
  },
  {
    id: "axionos",
    name: "AxionOS",
    site: "evandeli.com",
    sells: "An operating system for tradesmen — quoting, scheduling, invoicing and the marketing that keeps the diary full.",
    buyer: "A UK tradesman running a van and one or two others, who quotes from his phone in the evening and loses jobs to whoever replied first.",
    trigger: "A quiet fortnight, or losing a £4,000 job because the quote took three days to write.",
    channelToday: "Trade Facebook groups, the local-business groups the OS already generates posts for, and direct messages to tradesmen whose Google listing shows no recent reviews. All free, all reachable from a phone.",
    firstOffer: "Quote in five minutes instead of an evening — set up on their first real job, free, and they pay from the second month if the diary is fuller.",
    proofOfLife: "One tradesman sends a quote from it to a real customer and wins the job.",
    whyNotSellingYet: "It is being tested rather than sold. A test with no one on the other end of it produces a working product and no evidence that anybody wants it.",
    firstMessage: {
      channel: "WhatsApp or a Facebook trade group",
      text: [
        "Are you still writing quotes at nine at night?",
        "",
        "I've built something that gets a proper quote out in about five minutes from your phone — priced, branded, sent before you've finished the tea.",
        "",
        "I'm setting it up free on the next few jobs for people around [area], because I want to see it used on real work rather than in a demo. No catch and nothing to cancel.",
        "",
        "Want me to set it up on your next one?",
      ].join("\n"),
      why: "One question a tradesman answers in his own head before he finishes reading it, then an offer that costs him nothing and takes no time. No features, no price, no link — a link in a first message to a tradesman reads as an advert and does not get opened.",
    },
  },
  {
    id: "veryx",
    name: "VeryX",
    site: "veryxjnn.com",
    sells: "Enterprise project and programme intelligence — the view of delivery that a PMO is currently assembling by hand every Friday.",
    buyer: "A programme director or PMO lead inside an organisation big enough to have a portfolio and a reporting problem.",
    trigger: "A board asking why a programme slipped, and nobody able to answer it with anything except a spreadsheet built the night before.",
    channelToday: "One named person at a time, from the founder's own LinkedIn account and inbox — no ad budget, no sending domain, no integration. Programme directors who can actually be reached, offered a reading of one real programme. Enterprise does not buy from a funnel; it buys from a conversation.",
    firstOffer: "Take one live programme, produce the Friday view for it once, free. If the board meeting goes better, there is something to talk about.",
    proofOfLife: "One PMO lead forwards the output to their own leadership without editing it.",
    whyNotSellingYet: "The buyer is reachable only by name, and no names have been worked. A B2B enterprise product with no named pipeline has not been sold to, it has been built.",
    firstMessage: {
      channel: "LinkedIn, to one named programme director at a time",
      text: [
        "[name] — you'll have a board pack going out on Friday that somebody rebuilt by hand this week from four different sources.",
        "",
        "I've built something that produces that view from the data you already hold, and I'm looking for one live programme to run it against properly.",
        "",
        "You keep the output whether or not it goes anywhere, and I'd want nothing in writing to do it.",
        "",
        "Worth twenty minutes?",
      ].join("\n"),
      why: "It names the Friday scramble, which every PMO lead recognises and nobody advertises. The ask is twenty minutes, the risk to them is nothing, and there is no procurement in it — enterprise says no to a purchase and yes to a look.",
    },
  },
];

export const targetById = (id: string): GtmTarget | null => GTM_TARGETS.find((t) => t.id === id) || null;

export const GTM_DOCTRINE = [
  "Three businesses, three different buyers, three different first moves. Treating them as one 'go to market' is how all three get a generic plan that nobody executes.",
  "Every channel listed here works today with no provider key, no ad budget and no integration. A channel that needs credentials is a channel that is not running, and a business with no customers needs the one it can use this afternoon.",
  "The first offer is small enough to accept without a procurement process, because the first sale is not for the money. It is the evidence that somebody who is not a friend will say yes.",
  "Nothing here is a result. The counts live in the acquisition run, recorded one attempt at a time — and if that run is empty, the honest conclusion is not that the product failed.",
];
