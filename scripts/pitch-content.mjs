// THE FIVE PITCH CREATIVES — content only.
//
// Rendered to .docx/.pdf/.html by scripts/build-pitch-doc.mjs, through the same
// renderer as the Facebook campaign bundle so the two cannot drift in
// appearance.
//
// THE TWO RULES THIS FILE IS BOUND BY, and they are not negotiable because a
// creative is the one artefact a regulator reads:
//
//   1. NO NUMBER IS TYPED. Prices, the agent count, the render cost and the
//      commission rate come from scripts/ads-facts.mjs, which reads them out of
//      src/ and throws rather than let a creative quote something the platform
//      does not charge. Two numbers were wrong when this bundle was first
//      drafted from memory — "19 agents" (it is 39) and "15 seconds for £2.81"
//      (that is the EIGHT-second price) — and the parser is what caught them.
//
//   2. NO CUSTOMER IS INVENTED. MarketWar OS has no customers yet, so there is
//      no testimonial, no "trusted by", no "+10.1k leads collected" chip. The
//      reference creative that prompted this bundle had exactly that number on
//      it, and it is the one thing that cannot be walked back: under CPR 2008 a
//      fabricated endorsement is a banned practice, and the ASA acts on
//      invented results.
//
//      What replaces it is stronger, because it is TRUE: the founder built this
//      for his own trades business before selling it to anybody. That is a
//      testimonial. It just happens to be one that survives being checked.
//
// Every creative below therefore carries a METRIC CHIP holding a real, provable
// number — a price, a count, a refusal — in the same visual slot a fabricated
// result would have occupied.

import {
  FREE_FINDINGS_WORD, AGENT_COUNT, VIDEO_CHEAPEST, VIDEO_DEFAULT_PRICE,
  SHARE2EARN_PCT, MIN_WITHDRAWAL_GBP, TOOL_TOTAL, TOOL_KEYLESS, ROUTES,
} from "./ads-facts.mjs";

const SITE = "www.marketwaros.com";
const copy = (label, text, mono = false) => ({ copy: text, label, mono });

const FOUNDER_QUOTE =
  "I didn't build this for you. I built it for my own trades business, because I was paying an agency £600 a month to send me a PDF. It has been running my marketing ever since. Now you can have it.";

export const DOC = {
  title: "MarketWar OS — The Five Pitch Creatives",
  subtitle: "Copy-and-paste ad copy and image briefs for the five features that win a customer",
  strapline: "marketwaros.com",
  notes: [
    "Prepared {date}. Every price, count and product claim in this document is read out of the platform's own source code at build time, and the build fails rather than let a creative quote a number the product does not honour.",
    "No customer is quoted and no result is claimed, because there are none yet. The metric chip on each creative holds a real number — a price, a count, a refusal — in the slot a fabricated result would otherwise occupy.",
  ],
  sections: [

    // ---------------------------------------------------------------- 0
    {
      h: "0. How to use this, and the one thing not to do",
      blocks: [
        { p: "Each of the five sections below is one creative, ready to build. It carries a metric chip, a headline, a subline, a call to action, and an image brief written so a photographer or an image generator can work from it without asking you a question." },
        { p: "The layout is the one you already have in mind: a real person mid-reaction, a translucent chip floating over the lower left with a number in it, the headline set large across the middle in a heavy condensed face, and a pill-shaped call to action beneath. That layout works. What makes it work is that the eye lands on the chip first — which is exactly why what goes in the chip matters more than anything else on the image." },

        { h2: "The chip is the whole argument. Do not put a fake number in it." },
        { p: "The reference creative this bundle was drawn from had a leads-collected total, in the tens of thousands, sitting in that chip. It is the single most persuasive element on the image and it is also, for a product with no customers, a fabricated result. Under the Consumer Protection from Unfair Trading Regulations 2008 a falsely claimed endorsement is a banned practice — not a grey area, a listed one — and the ASA rules on invented performance figures regularly. A screenshot of that creative outlives the campaign." },
        { p: "There is also a commercial reason, and it is the better one. The people you are selling to have already been shown a hundred of those chips by people who had nothing behind them. The number that actually stops a sceptical tradesperson is a PRICE they can check in ten seconds, because it is the one thing a liar would not put on an image. Every chip below is such a number." },
        { p: "This is enforced rather than trusted: npm run pitch:verify fails the build on any testimonial, customer count or claimed result, in the same way the Facebook bundle is checked." },

        { h2: "The testimonial you can honestly run" },
        { p: "You do have one, and it is better than a stranger's quote because it answers the objection every buyer starts with — why should the person selling this know anything about my business?" },
        { quote: FOUNDER_QUOTE, attrib: "Justin, founder — MarketWar OS, built on a live trades business" },
        { p: "Run it over a photograph of you, in your own setting, not a stock office. Set it as its own creative and as the closing frame of any video cut from the five below." },
      ],
    },

    // ---------------------------------------------------------------- 1
    {
      h: "1. The free audit — your actual acquisition engine",
      blocks: [
        { p: `This is the creative to spend the most money behind. It is the only one that asks for nothing: no account, no card, no call. A stranger types their website in and gets ${FREE_FINDINGS_WORD} real problems found by a real crawl of their real page — which is the same conversation an agency charges several hundred pounds to have.` },
        {
          table: {
            head: ["Slot", "What goes in it"],
            widths: [22, 78],
            rows: [
              ["Metric chip", `${FREE_FINDINGS_WORD.charAt(0).toUpperCase() + FREE_FINDINGS_WORD.slice(1)} findings · £0 · no card`],
              ["Headline", "Find Out What It's Costing You"],
              ["Subline", "Type your website in. A real crawl, three real problems, in about a minute."],
              ["Call to action", "RUN MY FREE AUDIT"],
              ["Destination", `${SITE}${ROUTES.audit}`],
            ],
          },
        },
        copy("Primary text — long", `Your website is losing you work right now and you cannot see where.\n\nType the address in and MarketWar OS crawls the actual page — not a checklist, not a template — and shows you ${FREE_FINDINGS_WORD} things that are costing you enquiries.\n\nNo account. No card. No call booked. About a minute.\n\n${SITE}${ROUTES.audit}`),
        copy("Primary text — short", `${FREE_FINDINGS_WORD.charAt(0).toUpperCase() + FREE_FINDINGS_WORD.slice(1)} real problems with your website, found in about a minute. No account, no card. ${SITE}${ROUTES.audit}`),
        { h2: "Image brief" },
        { p: "A tradesperson in their thirties or forties, in a van or at a kitchen table at the end of the day, phone held up, caught in the half-second of recognition — eyebrows up, not laughing. Real work clothes, some dust. Natural window light, late afternoon, warm. Shot on a 35mm equivalent, shallow but not blurred to nothing. The chip sits lower-left over their forearm; the headline runs across the lower third. No stock-office glass, no headset, no laptop-on-a-beach." },
        { p: "Generator prompt: \"candid photo of a UK tradesperson sitting in a work van at dusk looking at their phone with a surprised expression, work clothes, natural warm light through the windscreen, 35mm, shallow depth of field, documentary style, no text\"." },
      ],
    },

    // ---------------------------------------------------------------- 2
    {
      h: "2. The Video War Room — the agency-price creative",
      blocks: [
        { p: `A branded video rendered while the customer watches, at £${VIDEO_CHEAPEST.gbp} for ${VIDEO_CHEAPEST.seconds} seconds and £${VIDEO_DEFAULT_PRICE.gbp} for ${VIDEO_DEFAULT_PRICE.seconds}. The comparison does the selling: the same job quoted by an agency is a four-figure number and a fortnight.` },
        { p: `Both prices are read out of the render pricing at build time. An earlier draft of this bundle quoted "15 seconds for £${VIDEO_CHEAPEST.gbp}" from memory — that is the ${VIDEO_CHEAPEST.seconds}-second price, and the mistake would have been printed on an advert.` },
        {
          table: {
            head: ["Slot", "What goes in it"],
            widths: [22, 78],
            rows: [
              ["Metric chip", `${VIDEO_CHEAPEST.seconds}-second video · £${VIDEO_CHEAPEST.gbp}`],
              ["Headline", "Ads Before The Coffee's Cold"],
              ["Subline", `A branded video, rendered while you watch. £${VIDEO_CHEAPEST.gbp}, not £400 and a fortnight.`],
              ["Call to action", "SEE IT RENDER"],
              ["Destination", `${SITE}${ROUTES.plans}`],
            ],
          },
        },
        copy("Primary text — long", `Getting one short video made used to mean a brief, a quote, a fortnight and a four-figure invoice.\n\nMarketWar OS renders it while you watch. ${VIDEO_CHEAPEST.seconds} seconds for £${VIDEO_CHEAPEST.gbp}. ${VIDEO_DEFAULT_PRICE.seconds} seconds for £${VIDEO_DEFAULT_PRICE.gbp}. You see the price before you spend it, every time.\n\nStart free and see what it makes for your business.\n\n${SITE}`),
        copy("Primary text — short", `A branded ${VIDEO_CHEAPEST.seconds}-second video for £${VIDEO_CHEAPEST.gbp}, rendered while you watch. The price is on screen before you spend it. ${SITE}`),
        { h2: "Image brief" },
        { p: "Split composition. Left: a phone held in one hand, screen filled by a bold branded video frame mid-play, the progress bar visibly moving. Right: a mug, a notebook, an ordinary morning kitchen. The person is only partly in shot — a hand and a shoulder — because the subject here is the screen, not a face. Cool morning light. The chip overlays the phone's lower edge with the price." },
        { p: "Generator prompt: \"close photo of a hand holding a smartphone in a bright kitchen at breakfast, the screen showing a colourful vertical video playing, steam from a mug in the background, soft morning light, shallow depth of field, no text\"." },
      ],
    },

    // ---------------------------------------------------------------- 3
    {
      h: "3. ProfitGuard — the creative nobody else can run",
      blocks: [
        { p: "Every marketing tool promises to help you spend. This is the only one that refuses. ProfitGuard checks every campaign and every creator reward against what the product actually contributes — price minus cost of goods, fulfilment, payment fees, tax and a returns allowance — and if a configuration would eat into the margin you protected, it does not warn you. It refuses to publish." },
        { p: "That is the pitch, and it is why this creative belongs in the set even though it is the least glamorous: it is the only claim in the bundle a competitor cannot copy by writing better copy." },
        {
          table: {
            head: ["Slot", "What goes in it"],
            widths: [22, 78],
            rows: [
              ["Metric chip", "Refuses below your margin floor"],
              ["Headline", "It Says No Before You Lose Money"],
              ["Subline", "Set the margin you will not go under. It will not let a campaign cross it — not a warning, a refusal."],
              ["Call to action", "SEE THE NUMBERS"],
              ["Destination", `${SITE}${ROUTES.plans}`],
            ],
          },
        },
        copy("Primary text — long", `Most marketing software is very good at helping you spend money.\n\nMarketWar OS is the only one that stops you. Tell it the margin you will not go under, and it checks every campaign and every commission against what your product actually contributes — after cost of goods, fulfilment, card fees, tax and returns.\n\nIf a plan would cross that line it refuses to publish it. Not a warning you can click past. A refusal.\n\n${SITE}`),
        copy("Primary text — short", `Tell it the margin you will not go under. It refuses to publish anything that crosses it — a refusal, not a warning. ${SITE}`),
        { h2: "Image brief" },
        { p: "A hand flat on a closed laptop lid, stopping it — or an open palm toward the camera, slightly out of focus, with the sharp plane on the phone showing the refusal. The emotional note is relief, not alarm. A small business owner in their own premises: a workshop bench, a salon counter, a café pass. Hard-edged directional light so the gesture reads as decisive. The chip carries the refusal in plain words rather than a figure." },
        { p: "Generator prompt: \"photo of a small business owner's open palm raised toward the camera in a workshop, phone in the other hand in sharp focus, decisive directional light, calm expression, documentary style, no text\"." },
      ],
    },

    // ---------------------------------------------------------------- 4
    {
      h: "4. SHARE2EARN — the customer's customers do the selling",
      blocks: [
        { p: `Anyone with a phone gets a tracked link and earns ${SHARE2EARN_PCT} of the eligible net value of every verified sale it produces. No application, no follower count, no audience test — and since the ruling of 25 August 2026 there is no follower gate on the cash either: it is payable from the first sale, with withdrawals starting at £${MIN_WITHDRAWAL_GBP}.` },
        { p: "For the business buying MarketWar OS, the pitch is that their own happiest customers become an acquisition channel that only costs them anything when it works." },
        {
          table: {
            head: ["Slot", "What goes in it"],
            widths: [22, 78],
            rows: [
              ["Metric chip", "0 followers needed"],
              ["Headline", "Your Customers Sell For You"],
              ["Subline", `Anyone with a phone gets a tracked link and earns ${SHARE2EARN_PCT} on every verified sale. You pay only when it works.`],
              ["Call to action", "OPEN MY PROGRAMME"],
              ["Destination", `${SITE}/share2earn`],
            ],
          },
        },
        copy("Primary text — long", `Your best customers already recommend you. They just get nothing for it, and you cannot see when it works.\n\nMarketWar OS gives every one of them a tracked link. When a sale comes through it, they earn ${SHARE2EARN_PCT} of what you actually keep — after tax, delivery and refunds, never out of money you never had.\n\nNo application. No follower count. Nobody is told they are too small. And you pay only on a sale that settled.\n\n${SITE}/share2earn`),
        copy("Primary text — short", `Give every customer a tracked link. They earn ${SHARE2EARN_PCT} on verified sales, you pay only when one happens. No follower count, no application. ${SITE}/share2earn`),
        { h2: "Image brief" },
        { p: "Two people, not one — that is the whole point of this creative. A customer showing their phone to a friend across a table, both looking at the same screen, mid-laugh. Ordinary setting: a pub table, a barber's chair, a doorstep. Warm and social, not corporate. Shoot slightly wide so both faces are readable at feed size. The chip sits between them." },
        { p: "Generator prompt: \"candid photo of two friends at a pub table looking together at one phone screen and laughing, warm evening light, natural social moment, 35mm documentary style, no text\"." },
      ],
    },

    // ---------------------------------------------------------------- 5
    {
      h: `5. ${AGENT_COUNT} agents behind one approval queue`,
      blocks: [
        { p: `${AGENT_COUNT} AI agents draft the work — the diagnosis, the offer, the copy, the schedule, the follow-up — and not one of them can publish anything. Every piece waits in an approval queue you clear from your phone.` },
        { p: `That second half is the creative. The market's objection to AI marketing is not that it cannot write; it is that it writes rubbish and sends it out in your name. This says plainly that it cannot. ${TOOL_KEYLESS} of the ${TOOL_TOTAL} included tools also work with no keys and no configuration at all, so the first session produces something on the first evening.` },
        {
          table: {
            head: ["Slot", "What goes in it"],
            widths: [22, 78],
            rows: [
              ["Metric chip", "Nothing publishes unapproved"],
              ["Headline", "A Marketing Team That Sleeps When You Do"],
              ["Subline", `${AGENT_COUNT} agents draft it overnight. You approve it over breakfast. Nothing goes out that you have not seen.`],
              ["Call to action", "SEE IT WORK"],
              ["Destination", `${SITE}${ROUTES.plans}`],
            ],
          },
        },
        copy("Primary text — long", `The reason you have not handed your marketing to AI is not that it cannot write. It is that you have seen what it writes, and it went out in somebody's name.\n\nMarketWar OS runs ${AGENT_COUNT} agents that draft everything — the diagnosis, the offer, the posts, the follow-ups — and none of them can publish. It all waits in one queue you clear from your phone in the morning.\n\nApprove, edit, or bin it. Nothing goes out that you have not seen.\n\n${SITE}`),
        copy("Primary text — short", `${AGENT_COUNT} agents draft your marketing overnight. None of them can publish. You approve it over breakfast. ${SITE}`),
        { h2: "Image brief" },
        { p: "Early morning, kitchen table, one hand on a phone showing a simple list with tick marks, a mug beside it. The person is relaxed and half-dressed for work — the note is calm control, not hustle. Soft blue-grey dawn light through the window, warm lamp behind. The chip overlays the list. Deliberately the quietest image in the set; it is selling the absence of a problem." },
        { p: "Generator prompt: \"photo of a person at a kitchen table early morning holding a phone showing a checklist, mug of tea beside it, soft dawn light through the window, calm relaxed mood, documentary style, no text\"." },
      ],
    },

    // ---------------------------------------------------------------- 6
    {
      h: "6. Running order, and what to do with the results",
      blocks: [
        { p: "Do not run all five at once. The audit creative is the one with a free, no-commitment offer behind it, so it will carry the lowest cost per click by some distance and it should be the one that funds the pool of people you can retarget with the other four." },
        {
          table: {
            head: ["Stage", "Creatives", "Why this order"],
            widths: [16, 34, 50],
            rows: [
              ["Week 1–2", "1 (audit) alone", "One variable. It tells you what a click from this audience actually costs before anything else is judged against it."],
              ["Week 3–4", "1 + 4 (SHARE2EARN)", "The second-strongest cold creative — it promises the viewer money rather than software."],
              ["Week 5+", "2, 3 and 5 to audit visitors only", "These answer objections. An objection creative shown to somebody who has never heard of you is answering a question they have not asked."],
              ["Always", "The founder quote", "Cheapest to produce and the only one that will still be true in a year. Run it as the closing frame everywhere."],
            ],
          },
        },
        { h2: "Replace the chips as soon as you have earned better ones" },
        { p: "Everything in this bundle is written for a business with no customers, which is the position today and should not be the position in three months. The moment a real customer will say a real sentence with their real name and town on it, that quote outperforms every creative here — including the founder one — because it will contain some small unflattering detail that no invented testimonial ever does." },
        { p: "Pick ten businesses you can actually reach, give them the platform free for sixty days on the single condition that they say something honest at the end, good or bad, and diarise the ask. Then rebuild these five with their words in the chip, and this bundle becomes the fallback rather than the campaign." },
      ],
    },
  ],
};
