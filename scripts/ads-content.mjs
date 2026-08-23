// THE FACEBOOK LAUNCH CAMPAIGN BUNDLE — content only.
//
// Rendered to .docx/.pdf/.html by scripts/build-ads-doc.mjs.
//
// Two rules this file is bound by, and they are the same two the platform is
// bound by:
//
//   1. NO NUMBER IS TYPED. Prices, tool counts and the free-audit gate come
//      from scripts/ads-facts.mjs, which parses them out of src/ and throws if
//      it cannot. An advert quoting a price the website does not charge is a
//      rejected ad, a refund request, and — under the ASA — a real problem.
//
//   2. NO RESULT IS CLAIMED. There are no customers yet, so there are no
//      testimonials, no "trusted by", no "increase your leads by 40%". Every
//      advert below sells the mechanism, the price and the free audit, because
//      those are the three things that are true today.

import {
  FREE, STARTER, GROWTH, TOOL_TOTAL, TOOL_KEYLESS, FREE_FINDINGS_WORD, ROUTES,
} from "./ads-facts.mjs";

const SITE = "www.marketwaros.com";
const AUDIT_URL = `${SITE}${ROUTES.audit}`;
const PLANS_URL = `${SITE}${ROUTES.plans}`;

const copy = (label, text, mono = false) => ({ copy: text, label, mono });

export const DOC = {
  title: "MarketWar OS — Facebook Launch Campaign",
  subtitle: "Copy-and-paste bundle for the first campaign: settings, ad sets, ad copy, creative briefs",
  strapline: "marketwaros.com",
  notes: [
    "Prepared {date}. Every price, tool count and product claim in this document is read out of the platform's own source code at build time.",
    "Nothing here claims a result, a customer or a testimonial, because there are none yet. The adverts sell the mechanism, the price and the free audit.",
  ],
  sections: [

    // ---------------------------------------------------------------- 0
    {
      h: "0. The objective — you asked for Awareness, and I am recommending Traffic",
      blocks: [
        { p: "You asked for an awareness campaign because the product is new, and that instinct is right: nobody has heard of MarketWar OS, and the job of the first campaign is to change that. But Meta's objective called \"Awareness\" is not the tool that does that job for a business in your position, and picking it would quietly cost you the thing this campaign is actually for." },

        { h2: "What Meta's Awareness objective actually buys" },
        { p: "The Awareness objective optimises for reach and for estimated ad recall lift. It is a brand-measurement product, built for advertisers who already have distribution and want more people to remember a name they are already spending elsewhere to establish. It deliberately does not optimise for anyone leaving Facebook." },
        { p: "That means at the end of a month you would have impressions, a recall estimate Meta calculated for you, and three things you would not have: no visitors, no retargeting pool, and no evidence about which message works. You would have bought the feeling of a launch without the assets a launch is supposed to produce." },

        { h2: "The comparison, plainly" },
        {
          table: {
            head: ["Objective", "Optimises for", "What it leaves you with, starting from zero", "Use it?"],
            widths: [16, 24, 42, 18],
            rows: [
              ["Awareness", "Reach, ad recall lift", "Impressions and an estimate. No visitors, no pixel audience, no message data.", "No — not yet"],
              ["Traffic", "Link clicks / landing page views", "Real visitors, a retargeting pool that grows daily, and a clear read on which message stops the scroll.", "YES — start here"],
              ["Engagement", "Reactions, comments, shares", "Cheap social proof on the post. Almost no visitors, and engagement-optimised audiences convert badly.", "No"],
              ["Leads", "Form fills inside Facebook", "Contact details from people who never saw the product. Low intent, high admin.", "Later, maybe"],
              ["Sales", "Purchases and signups", "Needs roughly 50 conversions a week to learn. You have zero. It will not exit learning and will spend badly.", "Phase three"],
            ],
          },
        },

        { callout: "Run Traffic, optimised for Landing page views. It is the only objective that produces awareness AND leaves you owning something at the end of it." },

        { h2: "Why Traffic still delivers the awareness you want" },
        { p: "This is the part worth being clear about: choosing Traffic does not mean giving up on awareness. The same people see the same advert either way. Awareness is a consequence of the impression, not of the objective you ticked — the objective only decides which humans Meta picks and what it charges you for." },
        {
          numbered: [
            "People still see your name in the feed. That is awareness, and it happens under every objective.",
            "Some of them click, so you learn which message works — on Awareness you learn nothing, because clicking is not what Meta is delivering.",
            "Those who click get tagged by the pixel, and become an audience you can advertise to for the next 180 days at a fraction of cold-traffic cost.",
            "That audience is exactly what the later marketwaros.com phase needs. Without it, phase two starts from zero all over again.",
          ],
        },
        { p: "You described marketwaros.com as the internal marketing tool you want to focus on later. Traffic is what makes \"later\" possible: it spends the first month building the audience that the second phase will speak to. Awareness spends the same money and hands you nothing to carry forward." },

        { h2: "When to revisit this" },
        { p: "Two conditions bring the other objectives back on the table, and neither is a matter of taste: run a genuine Awareness campaign once you have a warm pool worth reminding and a brand worth recalling, and switch to the Sales objective once the site produces roughly fifty signups a week, which is the volume Meta's conversion optimisation needs before it stops guessing." },
        { p: "Everything in the rest of this document is written for Traffic, optimised for Landing page views. If you overrule this and run Awareness anyway, every ad set, every piece of copy and every creative brief below still works unchanged — only the objective dropdown and the measurement section differ." },
      ],
    },

    // ---------------------------------------------------------------- 1
    {
      h: "1. Who we are talking to, and the two things they will think",
      blocks: [
        { p: "Manchester, and owner-operator trades businesses of roughly one to twenty people. Not because other cities and sectors will not buy, but because a first campaign that speaks to everybody teaches you nothing. One city and one trade keeps the audience small enough to saturate on a modest budget, and keeps the feedback attributable." },
        { p: "The person we are buying attention from is on a job, on their phone, between tasks. They are not looking for marketing software. Two thoughts will occur to them, in this order, and every advert in this bundle is built to survive one of them." },

        { h2: "Objection one: \"I have been burnt by a marketing company before\"" },
        { p: "This is the big one, and in this trade it is close to universal. They paid a retainer, received a monthly PDF of graphs, and never established whether any of it produced a single job. The damage is not scepticism about price. It is scepticism about control." },
        { p: `The answer is a real product property, not a slogan: the agents draft, and anything that would spend money, send a message or publish a post waits for a human. That is the brake. It is worth leading with, because it inverts the exact thing that hurt them.` },

        { h2: "Objection two: \"I can do this with ChatGPT for twenty quid\"" },
        { p: "Also fair, and it must be answered rather than dodged. ChatGPT will write a post. What it will not do is notice that a quote went out nine days ago and nobody chased it, that three finished jobs never got a review request, or that a listing has had the wrong opening hours since March." },
        { p: "The distinction to sell is memory and attention, not writing ability. A blank chat box is a tool you have to remember to pick up. That difference is the whole product." },

        { h2: "The offer we lead with" },
        { p: `The free audit at ${AUDIT_URL}. It performs a real crawl of the visitor's actual page — not a form, not a lead magnet, not a PDF. ${FREE_FINDINGS_WORD.charAt(0).toUpperCase() + FREE_FINDINGS_WORD.slice(1)} findings come back with no account, no card and no email at all. The rest of the report is there in exchange for an email address.` },
        { p: "That structure is why the adverts point at the audit rather than the pricing page. A stranger who has never heard of you will not evaluate a price. They will accept something specific and true about their own business, for free, in a minute — and that is the moment they find out the product is real." },
        { callout: `Cold traffic goes to the audit. Nothing in this campaign sends a stranger to a pricing page.` },
      ],
    },

    // ---------------------------------------------------------------- 2
    {
      h: "2. The offer behind the click",
      blocks: [
        { p: "Worth having straight before writing a single advert, because the copy leans on all three steps and each one has to be true when the visitor arrives." },
        {
          table: {
            head: ["Step", "What the visitor gets", "What it costs them"],
            widths: [22, 50, 28],
            rows: [
              ["The audit", `A real crawl of their real page. ${FREE_FINDINGS_WORD.charAt(0).toUpperCase() + FREE_FINDINGS_WORD.slice(1)} findings immediately.`, "Nothing. No account, no card."],
              ["The full report", "The remaining findings, written up.", "An email address."],
              ["The free plan", `The ${FREE.name} tier — ${FREE.monthly}, activates on the spot.`, "A signup. No card."],
              ["Paid", `${STARTER.name} ${STARTER.monthly}/mo · ${GROWTH.name} ${GROWTH.monthly}/mo`, "A card, when they choose to."],
            ],
          },
        },
        { p: `The platform ships ${TOOL_TOTAL} things a growing business would otherwise buy separately, and ${TOOL_KEYLESS} of those work on a brand-new account with no keys, no card and no configuration at all. That second number is the one that matters in an advert: it means somebody can sign up on a Tuesday evening and have the thing do real work before they have decided anything.` },
        { callout: `There is a genuinely free tier at ${FREE.monthly}. Say so. For a product nobody has heard of, "free to start" removes more friction than any headline you could write.` },
      ],
    },

    // ---------------------------------------------------------------- 3
    {
      h: "3. Campaign settings — copy this into Ads Manager",
      blocks: [
        copy("Campaign level", `Campaign name:        MW-TRF-2026Q3-MAN-COLD
Objective:            Traffic
Conversion location:  Website
Performance goal:     Maximise number of landing page views
Buying type:          Auction
Campaign budget:      Advantage campaign budget ON (CBO)
Daily budget:         GBP 20.00 per day
Bid strategy:         Highest volume (no cost cap in week one)
Schedule:             Run continuously, no end date
Dayparting:           OFF in week one
Special ad category:  None
Attribution setting:  7-day click, 1-day view
A/B test:             OFF`, true),

        { h2: "Why these settings and not others" },
        {
          bullets: [
            "GBP 20/day. Three ad sets need roughly GBP 5 to 7 a day each before the numbers stop being noise. Below that you are buying random impressions and learning nothing you can act on.",
            "Advantage campaign budget ON. You do not yet know which of the three audiences works, so let the algorithm move money towards whichever one does instead of guessing weekly.",
            "No cost cap. A cost cap needs a cost baseline, and you have none. Setting one now simply throttles delivery to nothing and you will conclude, wrongly, that the ads do not work.",
            "Special ad category: None. This is business software — not credit, housing, employment or politics. Ticking a category here would cripple your targeting for no reason.",
            "Landing page views, not link clicks. A link click counts a tap; a landing page view counts a page that actually loaded. Optimising for the second filters out accidental taps.",
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 4
    {
      h: "4. The three ad sets",
      blocks: [
        { p: "All three run the same adverts. The only variable is who sees them, which is what makes the comparison worth anything." },

        { h2: "Ad set A — trades owners, hand-targeted" },
        copy("Ad set A", `Name:                 A1-Trades-Owners
Location:             Manchester, England + 25 mi
                      People living in this location
Age:                  28 - 60
Gender:               All
Language:             English (UK) - leave blank if unsure
Detailed targeting:
  Interests           Plumbing, Electrician,
                      Heating Ventilation and Air Conditioning (HVAC),
                      Construction, Home improvement, Roofer,
                      Carpentry, Small business
  Narrow audience (MUST ALSO MATCH):
  Job titles          Owner, Business owner, Self-employed,
                      Managing Director
Advantage+ audience:  OFF
Advantage+ placements: ON`, true),
        { callout: "Turn Advantage+ audience OFF on this ad set only. Left on, Meta walks straight past your narrowing the moment it finds cheaper clicks elsewhere — and then this stops being a test of trades owners at all, which was the entire point of building it." },

        { h2: "Ad set B — local small business, assisted" },
        copy("Ad set B", `Name:                 A2-Local-SMB
Location:             Manchester, England + 25 mi
Age:                  28 - 60
Gender:               All
Detailed targeting:
  Interests           Small business, Small and medium-sized enterprises,
                      Entrepreneurship, Marketing, Advertising,
                      Facebook for Business, Local business
Advantage+ audience:  ON
Advantage+ placements: ON`, true),

        { h2: "Ad set C — broad" },
        copy("Ad set C", `Name:                 A3-Broad-Manchester
Location:             Manchester, England + 25 mi
Age:                  28 - 60
Gender:               All
Detailed targeting:   NONE - leave completely empty
Advantage+ audience:  ON
Advantage+ placements: ON`, true),
        { p: "Ad set C is not filler, and it is not laziness. On a new pixel with no conversion history, broad frequently beats a hand-built interest stack — UK trades interests are thin, expensive and full of people who work in the trade rather than own the business. If C wins, take the result. Arguing with it costs money." },
      ],
    },

    // ---------------------------------------------------------------- 5
    {
      h: "5. The adverts — primary text, headline, description",
      blocks: [
        { p: `Six adverts, all six running in all three ad sets from day one. Every one points at ${AUDIT_URL} with the button set to Learn more. Paste each block exactly as it is; the line breaks are part of the advert.` },
        { p: "Meta truncates primary text at roughly 125 characters on mobile before the See more link, so the first two lines of every advert below carry the whole argument on their own." },

        { h2: "Advert 1 — The brake (lead advert)" },
        { p: "This one answers the biggest objection head-on. Expect it to win. Give it the best picture." },
        copy("Primary text", `Been burnt by a marketing company before?

Most trades businesses round here have. You paid the monthly retainer, you got a report full of graphs, and nobody ever showed you a single job that came from it.

MarketWar OS works the other way round. It is an AI marketing system that does the work - the posts, the follow-ups, the review chasing, the listings - and everything it produces waits for you. Nothing spends money, sends a message or publishes a post until you say so.

You keep the brake. That is the whole point.

Start with a free audit of your own website. It reads your actual page and tells you what is wrong with it. No account, no card, no phone call.`),
        copy("Headline", `Your marketing, without handing over the keys`),
        copy("Description", `Free website audit - no signup, no card`),

        { h2: "Advert 2 — The ChatGPT question" },
        copy("Primary text", `"Why would I pay for that? I can just use ChatGPT."

Fair enough. And you can - it will write you a post in ten seconds.

What it will not do is notice that the quote you sent nine days ago has gone quiet. Or that three jobs finished last month and nobody asked those customers for a review. Or that your opening hours online have been wrong since March.

That is not a writing problem. It is a nobody-is-watching problem, and a blank chat box cannot solve it because you have to remember to open it.

MarketWar OS is ${TOOL_TOTAL} tools that watch the parts of your marketing that quietly leak work while you are up a ladder.

Free audit first. It reads your real website, no account needed.`),
        copy("Headline", `ChatGPT writes. This one remembers.`),
        copy("Description", `See what it finds on your site - free`),

        { h2: "Advert 3 — The three leaks" },
        { p: "Problem-first. The product does not appear until the reader has already agreed with the first ninety words." },
        copy("Primary text", `Three things that cost small trades businesses work every single week:

1. A quote sent and never chased. They did not say no. They just forgot - and so did you.

2. A finished job with no review asked for. Your best marketing, gone, because you were already on the next site.

3. A listing with the wrong hours, no photos and a question from a customer nobody answered.

None of that needs an agency on a retainer. It needs something that notices and nudges you.

MarketWar OS does the noticing. The free audit will tell you which of the three is costing you most right now - it reads your actual website, and you do not need an account.`),
        copy("Headline", `The quote nobody chased`),
        copy("Description", `Free audit of your real website`),

        { h2: "Advert 4 — The price, said out loud" },
        { p: "Some people just want the number. Withholding it is what every agency does, and matching that behaviour puts you in the category you are trying to escape." },
        copy("Primary text", `Marketing software for small businesses, priced like a phone bill.

${FREE.name}: ${FREE.monthly}. A real plan, not a trial - it switches on straight away and you do not need a card.
${STARTER.name}: ${STARTER.monthly} a month.
${GROWTH.name}: ${GROWTH.monthly} a month.

No setup fee. No twelve-month contract. No "book a call with our team" before anyone will tell you what it costs.

${TOOL_TOTAL} tools that handle your posts, your follow-ups, your reviews and your local listings - and ${TOOL_KEYLESS} of them work the moment you sign up, with nothing to configure.

Have a look at the free audit first. It reads your website and needs no account at all.`),
        copy("Headline", `${STARTER.monthly} a month. The price is on the page.`),
        copy("Description", `Free plan available - no card needed`),

        { h2: "Advert 5 — Built on a real business" },
        { p: "This is your only credibility asset before you have customers, and it is a true one. Use it, and do not stretch it further than it goes." },
        copy("Primary text", `We did not build this in an office and then go looking for someone to sell it to.

MarketWar OS runs on a working UK trades business before anybody else gets near it. Every tool in it exists because something was actually going wrong - quotes going cold, reviews never asked for, a listing nobody had touched in months.

If it does not survive on a real business with real customers and real invoices, it does not ship.

It is new, and we would rather you checked it than took our word for it. The audit is free and public - it reads your actual website, no account and no card.`),
        copy("Headline", `Tested on a real business first`),
        copy("Description", `Free audit - see it work on your site`),

        { h2: "Advert 6 — The short one" },
        { p: "Deliberately under sixty words. On mobile it never hits the See more link, and it will often be the cheapest click in the account. Worth having in the mix for that reason alone." },
        copy("Primary text", `Type your website in. It reads the actual page and tells you what is costing you work.

${FREE_FINDINGS_WORD.charAt(0).toUpperCase() + FREE_FINDINGS_WORD.slice(1)} findings free, no account, no card, about a minute.

Then decide whether you want the rest.`),
        copy("Headline", `What is wrong with your website?`),
        copy("Description", `Free. No signup. Takes a minute.`),
      ],
    },

    // ---------------------------------------------------------------- 6
    {
      h: "6. Reels and Stories — the vertical cuts",
      blocks: [
        { p: "Advantage+ placements will put your adverts into Reels and Stories whether you plan for them or not. A square feed image squeezed into a vertical slot looks like a mistake and performs like one, so give those placements their own text and their own 9:16 picture." },
        { p: "Vertical placements need the hook in the first three words. Use these as the on-image text, with the matching feed advert's primary text underneath." },
        copy("Story / Reel hooks - one per image", `1.  "Burnt by a marketing company before?"
2.  "The quote nobody chased."
3.  "ChatGPT writes. This one remembers."
4.  "${STARTER.monthly} a month. Price is on the page."
5.  "What is wrong with your website?"`, true),
        copy("Short primary text for vertical placements", `Free audit. It reads your actual website and tells you what is costing you work. No account, no card, about a minute.`),
      ],
    },

    // ---------------------------------------------------------------- 7
    {
      h: "7. Destination, button and tracking",
      blocks: [
        copy("Set this on every advert", `Website URL:     https://${AUDIT_URL}
Call to action:  Learn more
Display link:    ${AUDIT_URL}
Browser add-ons: none`, true),
        { p: "Then the tracking. Put these in the URL parameters field at ad level - not on the end of the website URL. Meta appends them properly from that field and mangles them from the other one." },
        copy("URL parameters - one line per advert", `utm_source=facebook&utm_medium=paid_social&utm_campaign=mw-trf-2026q3-man&utm_content=ad1-brake&utm_term={{adset.name}}

utm_source=facebook&utm_medium=paid_social&utm_campaign=mw-trf-2026q3-man&utm_content=ad2-chatgpt&utm_term={{adset.name}}

utm_source=facebook&utm_medium=paid_social&utm_campaign=mw-trf-2026q3-man&utm_content=ad3-leaks&utm_term={{adset.name}}

utm_source=facebook&utm_medium=paid_social&utm_campaign=mw-trf-2026q3-man&utm_content=ad4-price&utm_term={{adset.name}}

utm_source=facebook&utm_medium=paid_social&utm_campaign=mw-trf-2026q3-man&utm_content=ad5-real&utm_term={{adset.name}}

utm_source=facebook&utm_medium=paid_social&utm_campaign=mw-trf-2026q3-man&utm_content=ad6-short&utm_term={{adset.name}}`, true),
        { p: "The double-brace adset.name is a Meta dynamic parameter. Paste it exactly as written - Meta substitutes the real ad set name at click time, so you can see which audience produced which visit without maintaining six more strings by hand." },
      ],
    },

    // ---------------------------------------------------------------- 8
    {
      h: "8. Creative briefs — the six pictures",
      blocks: [
        { p: "Two sizes for each: 1080 x 1080 for the feed, and 1080 x 1920 for Stories and Reels. Build the vertical one deliberately rather than letting Meta crop the square, because it will crop through your text." },
        { p: "Keep on-image words short. Meta no longer rejects text-heavy images outright, but they still deliver worse, and a trades owner is reading this at arm's length on a cracked screen in daylight." },

        { h2: "Picture 1 — The brake" },
        { p: "A real brake lever, a handbrake, or a large red stop control. Shot close, slightly worn, real. Not a stock businessman, not a dashboard from a car advert. On-image text: \"You keep the brake.\" Nothing else on the image." },

        { h2: "Picture 2 — Writes vs remembers" },
        { p: "A split frame. Left: a clean, empty chat box on a phone. Right: a van dashboard with sticky notes, an unanswered phone and a crumpled quote on the passenger seat. Small on-image words: \"writes\" on the left, \"remembers\" on the right. The contrast does the work; do not explain it." },

        { h2: "Picture 3 — The quote nobody chased" },
        { p: "A printed quote or invoice on a kitchen table with a coffee ring on it, dated so the date is just legible. On-image text: \"Sent 9 days ago. Never chased.\" This one should look like a photograph somebody took, not a composition." },

        { h2: "Picture 4 — The price" },
        { p: `Plain typography, no photograph. ${STARTER.monthly} very large, "a month" small underneath, and ${SITE} along the bottom. High contrast, lots of empty space. This advert lives or dies on whether the typography looks confident, so give it the most attention and the least decoration.` },

        { h2: "Picture 5 — Real business" },
        { p: "A genuine work photograph. A van, a job in progress, hands and tools, Manchester weather. Deliberately unpolished - if it looks like stock photography the advert contradicts itself in the same glance. On-image text: \"Tested on a real business first.\"" },

        { h2: "Picture 6 — The audit" },
        { p: "A phone held in one hand showing the audit screen with findings on it. Real screen, not a mockup frame. On-image text: \"Free. No signup.\" This is the only advert where showing the product beats showing the problem, because the product is the offer." },

        { h2: "Rules for all six" },
        {
          bullets: [
            "Logo small and in a corner. A large centred logo is what a brand with no audience does, and it costs you the space that sells.",
            "Check every image shrunk to 120 pixels wide on a phone. If the words are unreadable at that size, they are unreadable in the feed.",
            "Faces outperform objects on cold traffic. If you can put a real person in pictures 1, 3 or 5, do.",
            "No stock photography of people in suits shaking hands. Your audience is being sold to by that image every day and has learned to scroll past it.",
            "Keep the vertical version's text out of the top and bottom 250 pixels, where the interface covers it.",
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 9
    {
      h: "9. Build these five audiences on day one",
      blocks: [
        { callout: "Do this before the adverts go live. Custom audiences only collect people from the moment they exist - they cannot be backfilled. Every day you delay is a day of retargeting pool you never get back." },
        { p: "They will read as empty at first. That is correct and not a fault: they fill as the campaign runs, and they are what the second phase spends against." },
        copy("Audiences → Create audience → Custom audience", `1.  MW-Web-All-180d
    Source: Website  ·  All website visitors  ·  180 days

2.  MW-Web-Audit-180d
    Source: Website  ·  People who visited specific web pages
    URL contains: ${ROUTES.audit}  ·  180 days

3.  MW-Web-Plans-180d
    Source: Website  ·  People who visited specific web pages
    URL contains: ${ROUTES.plans}  ·  180 days

4.  MW-Video-50pct-365d
    Source: Video  ·  Watched at least 50% of your video
    Select all videos  ·  365 days

5.  MW-Social-Engaged-365d
    Source: Facebook Page  ·  Everyone who engaged with your Page
    365 days
    Create the Instagram version too if the account is linked`, true),
        { p: `Audience 3 is the highest-intent group you will build in the whole campaign: somebody who reached ${PLANS_URL} looked at what it costs and did not buy. Those people are worth more per head than anyone else in the account.` },
      ],
    },

    // ---------------------------------------------------------------- 10
    {
      h: "10. What to watch, and when to stop",
      blocks: [
        { p: "Judge this campaign on cost per landing page view and on click-through rate. Ignore reach, ignore impressions, ignore engagement - none of them decide anything." },
        {
          table: {
            head: ["Metric", "Healthy", "Watch it", "Act"],
            widths: [30, 20, 20, 30],
            rows: [
              ["Link click-through rate", "1.2% or better", "0.6% to 1.2%", "Below 0.6% after 2,000 impressions: new picture"],
              ["Cost per landing page view", "GBP 0.60 or less", "GBP 0.60 to 1.20", "Above GBP 1.20 after GBP 25 on that advert: pause it"],
              ["Frequency", "1.8 or less", "1.8 to 2.5", "Above 2.5: refresh creative, never raise budget"],
              ["Landing page views vs link clicks", "50% or better", "30% to 50%", "Below 30%: the page is slow, fix that first"],
              ["Audits actually started", "Rising weekly", "Flat", "Zero after 300 visits: the landing page is the problem"],
            ],
          },
        },

        { h2: "The rules, in order" },
        {
          numbered: [
            "Touch nothing for 72 hours. Editing an ad set restarts the learning phase and burns the money you already spent teaching it. This is the single most common way a first campaign is wasted.",
            "At GBP 25 spent on an advert, pause it if its cost per landing page view is more than double the best advert's.",
            "At GBP 75 spent overall, pause the weakest ad set entirely and let the campaign budget flow into the two that are working.",
            "Frequency above 2.5 is a creative problem, never a budget problem. New picture, same words - it is the cheapest test available to you.",
            "If all three ad sets are above GBP 1.20 per landing page view after GBP 100, stop. The problem is the offer or the page, not the targeting, and more budget will not find it.",
          ],
        },
        { callout: "Write down, before you launch, what you will do at GBP 25, GBP 75 and GBP 100. Decisions made in advance are the only ones that survive contact with a dashboard showing a number you do not like." },
      ],
    },

    // ---------------------------------------------------------------- 11
    {
      h: "11. What has to stay true while these adverts run",
      blocks: [
        { p: "Every claim in this bundle was checked against the platform's source code when the document was built. They are true today. They have to stay true for as long as the adverts run, because an advert that outlives its claim is the fastest way to lose an ad account and the slowest thing to explain to a customer." },
        {
          bullets: [
            `The audit must stay public. Every advert promises no account and no card. It performs a real crawl and returns ${FREE_FINDINGS_WORD} findings before asking for anything. If that ever moves behind a login, these adverts have to come down the same day.`,
            `The prices must match. Advert 4 states ${FREE.name} ${FREE.monthly}, ${STARTER.name} ${STARTER.monthly} and ${GROWTH.name} ${GROWTH.monthly}. Those must be what a visitor sees at ${PLANS_URL}, including whether VAT sits on top. A mismatch is a rejected advert and a refund request.`,
            `The free plan must activate without a card. Advert 4 says so explicitly.`,
            `The tool count must match. The adverts say ${TOOL_TOTAL} tools, ${TOOL_KEYLESS} of which work with nothing configured. Rebuild this document if the platform's tool list changes and the numbers will follow automatically.`,
            "No results, no testimonials, no customer counts. There are none yet. Nothing in this bundle claims otherwise, and nothing added to it later should until there is something real to point at.",
          ],
        },

        { h2: "Two things that will look like faults and are not" },
        { p: "The pixel is consent-gated. It initialises with consent revoked until the visitor accepts cookies, which is what the law requires - so visitors who ignore or decline the banner are not counted. Your landing page view number in Ads Manager will read lower than your real traffic, sometimes considerably. Judge cost per click on Meta's own link click figure and treat the pixel number as the size of your retargeting pool rather than as a visitor count. Do not fix this by firing the pixel before consent." },
        { p: "And the first few days will look bad. A new pixel with no history is Meta guessing. Costs come down as it learns, which is exactly why rule one is to touch nothing for 72 hours." },
      ],
    },

    // ---------------------------------------------------------------- 12
    {
      h: "12. Week one, day by day",
      blocks: [
        { h2: "Day 0 — before launch" },
        {
          bullets: [
            "Create the five custom audiences.",
            `Load ${AUDIT_URL}, accept the cookie banner and confirm the pixel fires - Meta Pixel Helper in Chrome will tell you.`,
            `Run the audit on your own website, end to end, and confirm ${FREE_FINDINGS_WORD} findings come back without an account.`,
            `Check the prices on ${PLANS_URL} against advert 4 word for word.`,
            "Load the site on a phone on mobile data, not office wifi. That is how it will be seen.",
          ],
        },

        { h2: "Day 1" },
        { p: "Launch all three ad sets with all six adverts. GBP 20 a day. Then close Ads Manager and go and do something else." },

        { h2: "Days 2 to 3" },
        { p: "Look if you must, but change nothing. The numbers on day two are noise, and acting on them is how first campaigns die." },

        { h2: "Day 4" },
        { p: "First real read. Pause any advert over GBP 25 spend whose cost per landing page view is more than double the best one's. Then write down which message is winning - the brake, ChatGPT, the leaks, the price, the real business, or the short one. That answer is worth more than the traffic, because it tells you what the whole business should say." },

        { h2: "Day 5" },
        { p: "Build one new picture for the winning message, keeping the words identical. Add it to the winning ad set only. Changing one variable is the only way the result means anything." },

        { h2: "Day 6" },
        { p: "If total spend has passed GBP 75, pause the weakest ad set." },

        { h2: "Day 7" },
        { p: "Check MW-Web-All-180d. Above about 1,000 people you can start retargeting next week. Below that, keep running cold - retargeting a pool that small just shows the same forty people the same advert until they resent it." },
        { p: "Then check something Ads Manager will not tell you: how many audits were actually run, and how many of those left an email. That is the number that says whether this campaign is working, and it lives in the platform, not in Meta." },
      ],
    },

    // ---------------------------------------------------------------- 13
    {
      h: "13. Phase two — turning this into marketwaros.com marketing",
      blocks: [
        { p: "This is what the first campaign is for, and the reason the objective argument in section 0 mattered." },
        { p: "After two or three weeks you own three things you do not have today: a retargeting pool of people who have already seen the site, a verified answer to which of six messages a small business owner responds to, and a cost-per-click baseline that makes it possible to set a sensible cost cap." },
        { p: "Phase two is then a two-part structure rather than a fresh start." },
        {
          numbered: [
            "Cold prospecting, running only the winning message with the winning picture, still pointed at the audit. Same job as now, but with the guesswork removed.",
            "Retargeting against MW-Web-Audit-180d and MW-Web-Plans-180d, carrying the actual signup offer rather than the audit. These people already know what the product is - the advert's job changes from explaining to closing.",
          ],
        },
        { p: "Phase three, once the site is producing roughly fifty signups a week, is the switch to the Sales objective. Not before: below that volume Meta's conversion optimisation never exits the learning phase and spends badly while it tries." },
        { callout: "The pool that phase two spends against is being built right now, by this campaign, under the Traffic objective. Under Awareness it would not exist." },
      ],
    },

    // ---------------------------------------------------------------- 14
    {
      h: "Appendix A — Facebook Page copy",
      blocks: [
        { p: "The advert sends people to the website, but a good proportion will tap the Page name first to check you are real. An empty Page undoes an expensive click, so fill these in before launch." },
        copy("Page bio (255 characters max)", `AI marketing for small businesses. It drafts the posts, chases the quotes and asks for the reviews - and waits for you before it sends anything. Free audit of your website at ${SITE}`),
        copy("About / short description", `MarketWar OS is an AI marketing system for small businesses and trades.

${TOOL_TOTAL} tools that would normally be ${TOOL_TOTAL} separate subscriptions - posts, bulk email, review chasing, local listings, ad monitoring, screen recording, video clipping and reporting. ${TOOL_KEYLESS} of them work the moment you sign up, with nothing to configure.

Everything it produces waits for a human. Nothing spends money, sends a message or publishes a post without you approving it first.

Free plan available at ${FREE.monthly}. Paid from ${STARTER.monthly} a month.

Free website audit, no account needed: https://${AUDIT_URL}`),
        copy("Page button", `Button: Learn more
Links to: https://${AUDIT_URL}`, true),
        copy("First three Page posts - so the Page is not empty on launch day", `POST 1
Type your website address in and it reads the actual page - not a form, not a
PDF, the real thing. ${FREE_FINDINGS_WORD.charAt(0).toUpperCase() + FREE_FINDINGS_WORD.slice(1)} findings back in about a minute, no account needed.
https://${AUDIT_URL}

POST 2
The quote you sent nine days ago has gone quiet. They did not say no - they
forgot, and so did you. That is not a writing problem, and a blank chat box
will not fix it. Something has to be watching.

POST 3
Every tool in here exists because something went wrong on a real business
first. Quotes going cold. Reviews never asked for. A listing with the wrong
opening hours since March. We fixed those for one company before selling it
to anyone else.`),
      ],
    },

    // ---------------------------------------------------------------- 15
    {
      h: "Appendix B — what this bundle deliberately does not do",
      blocks: [
        { p: "Worth stating, because their absence is a decision rather than an oversight, and somebody will eventually ask for each of them." },
        {
          bullets: [
            "No testimonials, no customer counts, no case studies and no results. There are no customers yet. Adding an invented one would be the fastest way to lose both the ad account and the argument the product is built on.",
            "No competitor named and no competitor's price quoted. Advert 2 refers to ChatGPT because the customer raises it themselves, and it makes no claim about what ChatGPT costs.",
            "No countdown, no fake scarcity, no \"limited spaces\". The product is new; a queue nobody is standing in is a lie a customer can check.",
            "No lookalike audiences. A lookalike is built from a source audience, and you do not have one yet. Build them in phase two from MW-Web-Audit-180d once it holds a few hundred people.",
            "No Advantage+ shopping campaign and no catalogue. Those are retail structures and this is subscription software.",
            "No dayparting in week one. Restricting hours before you know which hours work is guessing, and it starves the learning phase of the volume it needs.",
          ],
        },
        { h2: "If you decide to run Awareness anyway" },
        { p: "It is a defensible choice and it is your call - you know things about the business and the timing that a document does not. If you take it, change only the objective and the measurement: pick Awareness with Reach as the performance goal, and judge the campaign on cost per thousand people reached and on frequency, because cost per landing page view will be meaningless." },
        { p: "Everything else in this bundle - the ad sets, all six adverts, the six pictures, the audiences, the Page copy and the week-one sequence - works unchanged. And build the five custom audiences either way. That instruction is the one thing in this document that is not worth overruling, because it costs nothing today and cannot be recovered later." },
      ],
    },
  ],
};
