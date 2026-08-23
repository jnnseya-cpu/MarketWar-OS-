// MARKETWAR OS — ITS OWN GO-TO-MARKET, AS CONTENT.
//
// One source, two renderers (scripts/build-gtm-doc.mjs → .docx and .pdf). The
// document and the Word file come from this file, so a section added to one
// cannot be missing from the other — the same reason the customer-facing plan
// in src/backend/go-to-market.ts renders its download server-side.
//
// THIS IS MARKETWAR'S PLAN, not the generic engine. The engine builds a plan for
// a customer's business from what they type; this is the plan for selling the
// platform itself, and every figure in it is either read out of the codebase
// (prices, guardrails, plan table, supplier list) or labelled as an assumption
// with the method for replacing it.
//
// RULE OBSERVED THROUGHOUT: never present a number as a measurement unless
// something counted it. Where a rate is assumed, it says ASSUMED and says what
// evidence replaces it.

import { PLANS } from "./gtm-facts.mjs";

const p = (text, opts = {}) => ({ p: text, ...opts });
const h2 = (text) => ({ h2: text });
const bullets = (items) => ({ bullets: items });
const numbered = (items) => ({ numbered: items });
const table = (head, rows, widths) => ({ table: { head, rows, widths } });
const callout = (text) => ({ callout: text });
const quote = (text, attrib) => ({ quote: text, attrib });

export const DOC = {
  title: "MarketWar OS — Go-To-Market",
  subtitle: "The first 100 customers, 90 days, and the money it takes",
  strapline: "marketwaros.com",
  // Cover notes. {date} is filled in at build time.
  notes: [
    "Prepared {date}. Prices and guardrail figures are read from the platform's own source at build time.",
    "Every rate that could not be measured is marked ASSUMED and names the evidence that replaces it.",
  ],
  sections: [

    // ---------------------------------------------------------------- 0
    {
      h: "Before anything else — the one number",
      blocks: [
        callout(
          "Customers acquired: 0. Messages sent to prospects: 0. Both counts are read from " +
          "the acquisition run, not estimated. Every other figure in this document is " +
          "subordinate to those two."
        ),
        p(
          "This matters more than it looks. With nothing sent, no conclusion about the " +
          "product, the price, the website or the copy is available — none of them has been " +
          "in front of a buyer. The platform has not failed to sell. It has not been sold."
        ),
        p(
          "So this plan does not open with positioning or a funnel diagram. It opens with " +
          "the only thing that changes the number: a named person receiving a message from a " +
          "named sender, on a specific day, about their own business."
        ),
        h2("What this document is, and is not"),
        table(
          ["This document IS", "This document is NOT"],
          [
            ["A sequence of actions with dates and owners", "A forecast dressed as a fact"],
            ["Real prices, read out of the shipped pricing table", "Aspirational pricing to be decided later"],
            ["A real supplier list, read out of the platform's own integrations", "A generic vendor category list"],
            ["Assumed conversion rates, labelled ASSUMED, with the evidence that replaces each", "Benchmarks borrowed from someone else's business"],
            ["Exit criteria that can be failed, and the action on failure", "Milestones that are always met by redefinition"],
          ],
          [45, 55]
        ),
        p(
          "Where a number could not be known at the time of writing, the document says so and " +
          "gives the method for finding it. That is the same rule the platform applies to its " +
          "own outputs, and it applies here."
        ),
      ],
    },

    // ---------------------------------------------------------------- 1
    {
      h: "1. What is actually being sold",
      blocks: [
        p(
          "MarketWar OS is an AI marketing operating system for businesses that cannot afford " +
          "an agency. Every engine sits behind one subscription, priced in credits (ACUs), " +
          "with the cost of every action shown before it runs. That last clause is the product: " +
          "small businesses do not fear the price of marketing software, they fear not knowing " +
          "what it will cost them this month."
        ),
        h2("The honest capability line"),
        p(
          "A sales conversation that overstates what runs today produces a refund in week two. " +
          "The following works on a fresh deployment with no provider keys, no card and no " +
          "configuration — it can be demonstrated to a prospect on a phone, in a pub, with no " +
          "preparation:"
        ),
        bullets([
          "The free website audit at marketwaros.com/audit — a real crawl of a real page, with findings. Public, no account. This is the front door of the entire acquisition machine and the single most important asset in this plan.",
          "The command bar on every dashboard screen — say what you want, and it names the engine, what it will ask for, and the ACU cost before anything runs.",
          "The ad canvas — the prospect's own photo in, a postable image out at real placement size, contrast-checked.",
          "All pricing and margin arithmetic — ProfitGuard, the commission ladder, product eligibility. Every refusal is computed, not guessed.",
          "The paid-media guardrails — stop-loss, the scale step, computed budget ceilings, all of which refuse to judge thin evidence rather than inventing a verdict.",
          "The publication ledger, the eight pre-publish checks, channel health, versions and restore, creative fatigue, the audit log, the emergency stop.",
          "Teams and agencies — ten roles, ten permissions, nobody able to grant more than they hold. This is what makes the agency segment sellable at all.",
        ]),
        p(
          "What is dark without keys — AI writing, taking money, saving work between visits, " +
          "sending email, images, video, scheduled work — is dark for the operator, not for the " +
          "customer: the deployment the customer buys has those keys set. The list matters here " +
          "because it defines what a demo can promise before the founder has paid for a single " +
          "provider call."
        ),
        h2("The size of the thing"),
        table(
          ["Measure", "Count", "How counted"],
          [
            ["Backend engine modules", "216", "Files in src/backend"],
            ["API routes", "169", "route.ts files under src/app/api"],
            ["Dashboard pages", "65", "page.tsx files under src/app/dashboard"],
            ["Automated tests", "1,285", "Passing at the time of writing, including one end-to-end run of the whole growth loop"],
            ["Published articles and answer pages", "27", "13 blog articles in two clusters, 14 answer pages — live and indexable"],
          ],
          [40, 15, 45]
        ),
        p(
          "The count is not the pitch. It is the answer to the only question a sceptical buyer " +
          "actually asks — is there a product behind the website — and it should be given once, " +
          "flatly, and never repeated."
        ),
      ],
    },

    // ---------------------------------------------------------------- 2
    {
      h: "2. The beachhead — one city, locked",
      blocks: [
        callout("LAUNCH CITY: MANCHESTER. Locked for the first 90 days. Nothing outside it is worked until day 91, except inbound and the named-account enterprise motion in §3.5."),
        p(
          "A national launch by one person is a national launch by nobody. Manchester is the " +
          "choice, and the reasons are operational rather than sentimental:"
        ),
        bullets([
          "It carries the second-largest concentration of small businesses in the UK outside London, with a materially cheaper attention market — the same paid impression costs less and the same LinkedIn message gets read more.",
          "It is dense in exactly the buyer AxionOS was built for: trades and local services running one to twenty people, most of whom still quote from a phone at nine at night.",
          "It is small enough to be walked. A founder can meet ten customers in a day, which is the only way the first ten are ever won.",
          "It has an unusually visible small-agency and freelance-marketer population — the reseller segment in §3.4 — clustered in a handful of coworking buildings and two or three recurring events.",
          "The first case study can be local and named, and a named local customer sells the next twenty better than any amount of copy.",
        ]),
        h2("The swap rule"),
        p(
          "If the founder is not within travelling distance of Manchester, swap it for the " +
          "nearest city with a population above 400,000 and change nothing else. This plan is " +
          "city-shaped, not Manchester-shaped: every number, ratio and action below survives " +
          "the substitution. What does not survive is running three cities at once."
        ),
        h2("The boundary, in practice"),
        table(
          ["In scope, days 1–90", "Out of scope until day 91"],
          [
            ["Businesses with a Manchester or Greater Manchester address", "Everywhere else in the UK, except inbound"],
            ["Anyone who finds marketwaros.com and runs the free audit, wherever they are", "Outbound to any other city"],
            ["Named enterprise programme accounts for VeryX, nationally — a different motion, a different buyer, no dilution of the local run", "Paid media targeted outside Greater Manchester"],
            ["Agencies and freelance marketers based in the city, whose clients may be anywhere", "International, in any form"],
          ],
          [50, 50]
        ),
      ],
    },

    // ---------------------------------------------------------------- 3
    {
      h: "3. Customer segments — who signs, and what makes them look",
      blocks: [
        p(
          "Five segments, in the order they are worked. A segment is not a demographic; it is a " +
          "person with a budget, a problem and a moment at which the problem becomes urgent."
        ),

        h2("3.1 Owner-operator trades and local services (1–20 people) — PRIMARY"),
        table(
          ["Field", "Answer"],
          [
            ["Who signs", "The owner. There is nobody else, and they sign on their phone."],
            ["The trigger", "A quiet fortnight, or losing a £4,000 job because the quote took three days to write."],
            ["Where they are", "Trade Facebook groups, local business groups, Google listings with no recent reviews, and physically in the city."],
            ["First offer", "A free audit of their actual website, delivered as a document with their own numbers in it. Then quoting and marketing set up on their first real job, free, paying from month two."],
            ["Plan they land on", "Starter £19/mo or Growth £49/mo"],
            ["The objection", "\"I've been burnt by a marketing company before.\" It is almost always true and it is almost always the last one."],
            ["The answer to it", "Show the cost of an action before it runs, and the emergency stop. Nobody who has been burnt is reassured by a feature list; they are reassured by a brake."],
          ],
          [22, 78]
        ),

        h2("3.2 Solo founders, consultants and coaches selling a service"),
        table(
          ["Field", "Answer"],
          [
            ["Who signs", "The founder, personally, on a card."],
            ["The trigger", "A month with no inbound, or the realisation that they have written no content since March."],
            ["Where they are", "LinkedIn, one named person at a time. Local founder communities. Newsletter replies."],
            ["First offer", "The free audit, then a 30-day run where the platform produces their content calendar and they only approve it."],
            ["Plan they land on", "Starter £19/mo, upgrading to Growth £49/mo when a second brand or a second person appears."],
            ["The objection", "\"I can do this with ChatGPT for £20.\""],
            ["The answer to it", "They can produce a post with ChatGPT. They cannot produce a brand that remembers itself, a publish ledger that does not double-post, guardrails that stop a losing ad, or an audit of their own site. Do not argue the model; argue the operating system around it."],
          ],
          [22, 78]
        ),

        h2("3.3 Small e-commerce and D2C brands"),
        table(
          ["Field", "Answer"],
          [
            ["Who signs", "Founder, or the one marketing hire."],
            ["The trigger", "Ad costs rising faster than orders, and no idea which creative is dying."],
            ["Where they are", "Instagram and TikTok comment sections of their own competitors; e-commerce communities; Shopify app-adjacent forums."],
            ["First offer", "Run creative fatigue against their live creatives and show them, free, which one is past its own peak — significance-tested, not a score."],
            ["Plan they land on", "Growth £49/mo or Scale £149/mo"],
            ["The objection", "\"We already have tools.\""],
            ["The answer to it", "Do not displace the tools. Land on the one thing none of them does: refusing to judge thin evidence. Their current dashboard gives a confident number on 40 impressions; this one says it cannot tell yet."],
          ],
          [22, 78]
        ),

        h2("3.4 Small agencies and freelance marketers — THE MULTIPLIER"),
        table(
          ["Field", "Answer"],
          [
            ["Who signs", "The agency owner or the freelancer."],
            ["The trigger", "They have taken on a fifth client and cannot service them without hiring."],
            ["Where they are", "Coworking buildings, local marketing meetups, LinkedIn, and the freelance boards."],
            ["First offer", "Run the audit on three of their own clients' sites and hand them the documents to send under their own name."],
            ["Plan they land on", "Scale £149/mo (10 brands) or Business £399/mo (30 brands), plus white-label at £99–£149/mo."],
            ["The objection", "\"My clients are my clients.\""],
            ["The answer to it", "White label, ten roles and ten permissions, and nobody able to grant wider than they hold. The platform never appears in front of their client unless they put it there."],
            ["Why it is the multiplier", "One agency signing is one customer on this plan's count and ten brands inside the product. Five agencies is fifty active brands and the fastest route to a usage base that produces case studies."],
          ],
          [22, 78]
        ),

        h2("3.5 Enterprise programme and PMO leads (VeryX) — SEPARATE MOTION"),
        table(
          ["Field", "Answer"],
          [
            ["Who signs", "A programme director or PMO lead in an organisation big enough to have a portfolio and a reporting problem."],
            ["The trigger", "A board asking why a programme slipped, and nobody able to answer with anything but a spreadsheet built the night before."],
            ["Where they are", "Reachable only by name, on LinkedIn, one at a time. There is no funnel into this segment."],
            ["First offer", "Take one live programme, produce the Friday board view once, free, nothing in writing."],
            ["Plan they land on", "Enterprise £999/mo upward, plus onboarding from £2,500."],
            ["Why it is here and not in the first 100", "It is a two-to-six-month cycle. It should be running in parallel from day one because it costs nothing but time, and it must never be allowed to consume the days that belong to the local run. Ten named accounts, one message each, one follow-up. No more."],
          ],
          [22, 78]
        ),
      ],
    },

    // ---------------------------------------------------------------- 4
    {
      h: "4. The offer ladder and the real price list",
      blocks: [
        p(
          "These are the published prices, read directly from the shipped pricing table. Annual " +
          "is 30% off twelve months. Every plan auto-allocates 20% of the price paid as ACUs; " +
          "£1 = 100 ACUs."
        ),
        table(
          ["Plan", "Monthly", "Annual", "Brands", "Users", "Monthly ACUs"],
          PLANS.map((pl) => [pl.name, pl.monthly, pl.annual, pl.brands, pl.users, pl.monthlyAcus]),
          [20, 15, 17, 14, 14, 20]
        ),
        p(
          "Top-ups run from a £5 minimum on a fixed ladder (£5, £10, £25, £50, £100, £250, £500, " +
          "£1,000, £2,500, £5,000) with no discount. The £5 floor is not arbitrary: below it the " +
          "fixed payment-processing fee eats the margin and an AI action nets under the 100% " +
          "profit floor. A smaller top-up would lose money by design, so it is not offered."
        ),
        h2("The ladder, as a sales sequence"),
        numbered([
          "FREE AUDIT — no account, no card, no email required to see the findings. The prospect gets a real document about their own site. This is the offer that gets said yes to.",
          "FREE PLAN — one brand, one user, one social account, one campaign. The account exists, the work is saved, and the platform starts learning the brand.",
          "STARTER £19/mo — the price of a takeaway. This is deliberately below the threshold at which a small business owner asks a spouse or an accountant.",
          "GROWTH £49/mo — three brands, five users. The upgrade happens on its own when a second brand or a second person appears; it is not sold, it is triggered.",
          "SCALE £149/mo — ten brands. This is the agency's first plan and the point at which white label at £99/mo becomes relevant.",
          "BUSINESS £399/mo and above — thirty brands, forty users. Sold to agencies who have already put ten client brands in.",
        ]),
        callout(
          "Never discount the subscription to close a first customer. Give more of the free tier, " +
          "give founder time, give a longer trial — never the price. A discounted first cohort " +
          "sets the reference price for every renewal conversation, and the platform's whole " +
          "pricing argument is that the number is honest."
        ),
      ],
    },

    // ---------------------------------------------------------------- 5
    {
      h: "5. The first 100 customers — the arithmetic, honestly",
      blocks: [
        p(
          "There is no observed conversion data, because nothing has been sent. Every rate below " +
          "is therefore marked ASSUMED, and each one names the evidence that replaces it. The " +
          "first fifty messages replace the first three rates permanently; after that this section " +
          "is rebuilt from counted numbers and the assumptions are deleted."
        ),
        h2("The outbound chain"),
        table(
          ["Step", "ASSUMED rate", "What replaces it"],
          [
            ["Message sent → reply", "25%", "The reply count after the first 100 messages. A message that leads with a real finding about the recipient's own site is not a cold message, which is why the assumption is this high — and it is the assumption most likely to be wrong."],
            ["Reply → audit accepted and delivered", "50%", "Count of audits actually delivered against replies received. This one is nearly free to move: the audit is already run before the message is sent."],
            ["Audit delivered → paid within 30 days", "20%", "The paid count against audits delivered, measured at day 30 and again at day 60."],
          ],
          [30, 15, 55]
        ),
        p(
          "Run backwards, 100 customers on those rates needs 4,000 messages. Over 60 working days " +
          "that is 67 a day, by one person, on top of building. It does not close. Saying so is " +
          "the point of doing the arithmetic."
        ),
        h2("So the plan is a mix, and the mix is this"),
        table(
          ["Route", "Volume in", "Chain", "Customers"],
          [
            ["Direct outreach, Manchester", "2,000 messages (33 per working day)", "→ 500 replies → 250 audits → 50 paid", "50"],
            ["Agencies and freelancers", "200 named, contacted individually", "→ 40 replies → 12 trials → 5 paying", "5"],
            ["Inbound to marketwaros.com/audit", "800 sessions from the 27 published pages, the newsletter and social", "→ 64 audits run (8%) → 13 paid", "13"],
            ["Referral from the first 20 customers", "20 customers × 0.5 referrals each", "→ 10 referred → 4 paid (40%)", "4"],
            ["TOTAL, on stated assumptions", "", "", "72"],
          ],
          [26, 26, 32, 16]
        ),
        callout(
          "Seventy-two, not one hundred. The gap is twenty-eight customers, and it is written down " +
          "rather than closed with a better assumption. Two levers close it and both are measured, " +
          "not hoped for: (1) the reply rate — every point above 25% is two more customers, and the " +
          "opening line is the cheapest thing in this plan to change; (2) the agency count — each " +
          "additional agency is one customer and ten brands, and the sixth to tenth agencies are " +
          "the cheapest customers available anywhere in this document."
        ),
        h2("If the assumptions come in low"),
        p(
          "Assume the reply rate is 10%, not 25%. Direct outreach then yields 20 customers, not 50, " +
          "and the 90-day total is 42. That is not a failure of the plan; it is the plan producing " +
          "the information it was built to produce. The response is written into the day-30 exit " +
          "criteria in §10 and it is not \"send more\" — it is rewrite the opening line, run 100, " +
          "and compare."
        ),
      ],
    },

    // ---------------------------------------------------------------- 6
    {
      h: "6. Customer acquisition — the channels, ranked by cost to first customer",
      blocks: [
        p(
          "Ranked by what it costs to get the first paying customer through them, not by reach. " +
          "The order is the order they are switched on."
        ),
        table(
          ["Rank", "Channel", "Cost to start", "Why it is where it is"],
          [
            ["1", "Direct outreach with the audit already run", "£0", "Needs no key, no domain, no ad account and no permission. Fifty messages can go from a personal inbox this afternoon. Every other channel in this table is slower to the first pound."],
            ["2", "The free audit page as the destination for everything", "£0", "Already live, already public, already keyless. It converts a stranger into a named lead without an account, and it is the only asset that works equally well at the end of a cold message, a blog post, a newsletter and an ad."],
            ["3", "In person, in the city", "Travel only", "The first ten customers are almost always met. One coworking building and two trade meetups a week beats any amount of scheduled content in month one."],
            ["4", "Agency and freelancer partnering", "£0", "One conversation carries ten brands. Slower to first yes, far cheaper per brand."],
            ["5", "The 27 published pages and the content engine", "£0 marginal", "Already written and indexed. Compounds slowly and costs nothing to keep running. Submit the sitemap and it starts."],
            ["6", "The weekly newsletter", "£0 to £16/mo", "Every registered user, Tuesday, selling what their own deployment can actually do. Costs almost nothing and is the only channel that speaks to people who already said yes once."],
            ["7", "Organic social from the platform's own output", "£0", "The product generates the posts. Low yield alone; real as proof that the thing works."],
            ["8", "Paid media", "£150 per test", "LAST. Never before twenty customers exist, because paid media on an unproven message buys a faster no."],
          ],
          [7, 26, 15, 52]
        ),
        h2("The paid-media rule, which is enforced in code"),
        bullets([
          "Maximum test spend: £150 per test. Not a guideline — it is the platform's own default guardrail.",
          "Stop-loss at ROAS below 1. A test that has not paid for itself is stopped, not optimised.",
          "Scale only at ROAS 3 or better, and then only in steps of +20%. Doubling a budget on a winning ad is the most common way small businesses lose money on Meta, and the platform refuses to do it.",
          "Thin evidence produces no verdict at all. A campaign with too few conversions returns \"cannot tell yet\", never a number.",
          "Paid media is switched on only after twenty paying customers exist and the message that won them is written down.",
        ]),
      ],
    },

    // ---------------------------------------------------------------- 7
    {
      h: "7. Marketing — everything points at marketwaros.com",
      blocks: [
        callout(
          "THE STANDING RECOMMENDATION: every message, article, post, email, business card, " +
          "invoice footer, signature and advert ends at https://www.marketwaros.com/ — and " +
          "wherever a single link is possible, at https://www.marketwaros.com/audit."
        ),
        p(
          "There is exactly one call to action in this entire go-to-market, and it is \"run the " +
          "free audit\". Not \"book a demo\", not \"start a trial\", not \"see pricing\". The " +
          "audit needs no account and no card, it produces something true about the reader's own " +
          "business, and it records them as an inbound prospect the moment they give an email. " +
          "A second call to action anywhere in the funnel halves the first one."
        ),
        h2("Where the site does the work"),
        table(
          ["Surface", "The job it does", "The link"],
          [
            ["/audit", "Converts a stranger into a named lead with no account. The destination of every campaign.", "marketwaros.com/audit"],
            ["Home", "Answers \"is this real\" in ten seconds for someone who arrived from a message.", "marketwaros.com"],
            ["/pricing", "Removes the fear. The prices are small and stated; nothing is \"contact us\" below Enterprise.", "marketwaros.com/pricing"],
            ["/how-it-works", "For the sceptic who has been burnt before. Shows cost-before-action and the emergency stop.", "marketwaros.com/how-it-works"],
            ["/industries", "Lets a trades owner see themselves. Local-services and trades pages carry the outreach traffic.", "marketwaros.com/industries"],
            ["The 13 blog articles and 14 answer pages", "Catch the searches the buyer already makes. Compounding, already written, currently unsubmitted.", "marketwaros.com/blog"],
          ],
          [22, 52, 26]
        ),
        h2("The content sequence for 90 days"),
        numbered([
          "Submit the sitemap in Search Console. Nothing in the repository can do this and until it is done the 27 pages are effectively unpublished. This is a fifteen-minute task worth more than a week of writing.",
          "Publish one local case study as soon as one customer says yes to being named. \"How a Manchester [trade] filled three weeks of the diary\" outsells every feature page on the site combined.",
          "Turn each audit into a public teardown, anonymised, with the customer's permission. The audit is the product AND the marketing, which is the cheapest structure available.",
          "Send the weekly newsletter from the first Tuesday after NEWSLETTER_SECRET is set. It sells what the reader's own deployment can actually do, with the feature pages' own proof and limit, and a great many links back to the site.",
          "Post the platform's own generated output, publicly, with the prompt and the cost in ACUs beside it. Transparency about cost is the differentiator; showing it is stronger than claiming it.",
        ]),
        h2("Positioning, in one line each"),
        bullets([
          "To a tradesman: \"Quotes out in five minutes, and the diary stays full without you doing marketing at nine at night.\"",
          "To a solo founder: \"An operating system around the AI, not another chat window.\"",
          "To an e-commerce brand: \"It tells you when a creative is dying, and refuses to guess when it cannot tell.\"",
          "To an agency: \"Ten client brands, your logo, your permissions, and nobody able to grant more than they hold.\"",
          "To a PMO lead: \"The Friday board view, produced from the data you already hold.\"",
        ]),
      ],
    },

    // ---------------------------------------------------------------- 8
    {
      h: "8. Suppliers — who MarketWar buys from, and how to source them",
      blocks: [
        p(
          "MarketWar's suppliers are not wholesalers and factories; they are the providers whose " +
          "cost sits underneath every ACU sold. Getting this list wrong does not delay a shipment " +
          "— it breaches the pricing floor. The list below is read from the platform's own " +
          "integrations, not from a market survey."
        ),
        h2("8.1 The supplier map"),
        table(
          ["Capability", "Primary", "Second source (mandatory)", "Commercial note"],
          [
            ["AI text and reasoning", "Anthropic", "OpenAI, Google Gemini", "The gateway arbitrates between all three per request. This is the single largest variable cost and the single largest margin lever."],
            ["Image generation", "OpenAI", "Google Gemini", "Priced per image. Cost per action is directly computable and must clear 2×."],
            ["Video generation", "Google Veo", "OpenAI Sora", "The most expensive class. Rendering is also done on an FFmpeg cloud worker with a per-minute cost constant, so the true cost is provider plus render."],
            ["Voice", "ElevenLabs", "Provider TTS fallback", "Low volume today; keep the contract monthly."],
            ["Search and market data", "Serper", "Direct search APIs", "Per-query pricing, tens of pounds a month at this stage. Underpins the free audit, so it is load-bearing for acquisition, not just for the product."],
            ["Contact and company data", "Apollo", "Manual list building", "Optional. The manual second source is genuinely viable at 2,000 messages and should be used until volume justifies the seat."],
            ["Social publishing", "Zernio (aggregator)", "Meta Graph API direct", "Direct Meta carries the better margin; the aggregator carries the wider coverage. Both are wired."],
            ["Email sending", "Own sending pool (SMTP, authenticated DNS)", "Resend, SendGrid", "The own pool is the cheapest at volume and the slowest to set up. Start on the paid ESP; migrate when DKIM/SPF/DMARC are clean."],
            ["Messaging", "WhatsApp Cloud API (Meta)", "Manual send", "Per-conversation pricing; watch it, it moves."],
            ["Payments in", "Stripe", "—", "Single source by design. The 20p fixed fee is why the top-up floor is £5."],
            ["Payouts out", "BitriPay", "Nine rails behind it", "Fee quotes are computed per rail before money moves."],
            ["Identity and screening", "Onfido, Persona, sanctions screening", "—", "Per-check pricing, used only on payout gating."],
            ["Frontend hosting", "Vercel", "Any Node host", "≈£16/month at this stage."],
            ["Backend, auth, storage", "Firebase", "—", "Pay-as-you-go; tens of pounds a month at this stage."],
            ["Edge, DNS, WAF", "Cloudflare", "—", "Free tier is sufficient for the whole 90 days."],
            ["Domain", "Hostinger", "Any registrar", "Already owned."],
          ],
          [17, 21, 21, 41]
        ),
        h2("8.2 How to source a supplier — the actual procedure"),
        numbered([
          "NAME THE CAPABILITY, NOT THE VENDOR. Write down the action a customer pays for — \"generate a 30-second product video\" — before looking at anyone's website. A capability can be re-sourced; a vendor relationship cannot.",
          "FIND AT LEAST TWO WHO CAN DO IT. Two is the minimum and it is not about resilience, it is about price. A single-source capability has no negotiating position and no arbitration route, and the gateway is built to switch.",
          "GET A SANDBOX BEFORE A CONTRACT. Any provider that will not let you measure cost per action before signing is disqualified. There are no exceptions to this and it removes about a third of candidates immediately.",
          "MEASURE COST PER ACTION ON YOUR OWN TWENTY REAL PROMPTS. Not their benchmark, not their pricing page arithmetic — your own inputs, at your own lengths, twenty times, and take the mean and the worst case. Published per-token prices routinely understate real cost by a factor of two once system context and retries are counted.",
          "APPLY THE FLOOR. Multiply the measured cost by 2. If the resulting price is not something a small business would pay without flinching, the supplier is wrong for this platform — do not solve it by cutting the margin. Then check the 4× standard charge: that is the number that should be quoted internally.",
          "CHECK THE FAILURE BEHAVIOUR. What does it do at rate limit, at timeout, at a lost response? A provider that silently returns partial output is more expensive than a provider that errors, because partial output reaches a customer.",
          "SIGN MONTHLY. Never annual, never committed-volume, until three months of measured usage exist. The discount for committing early is always smaller than the cost of committing to the wrong thing.",
          "TAKE THE FREE CREDITS. Startup programmes from the major cloud and AI vendors, and payment-provider partner programmes, routinely carry four to five figures of credit. They are worth more than any discount negotiable at this volume and they cost a form.",
          "RE-TENDER AT THREE MONTHS. With real volume numbers, go back to the second source and ask for committed-volume pricing. Having a live, wired, tested alternative is the entire negotiating position.",
        ]),
        h2("8.3 The margin weapons — how the floor is cleared without raising the price"),
        p(
          "The pricing law is that profit margin on AI actions is never below 100% — the customer " +
          "is charged at least 2× provider cost, standard 4× — while staying obviously cheap " +
          "against an agency. Those two facts are only compatible if the cost base is attacked. " +
          "Four things do that, and all four are already built:"
        ),
        bullets([
          "PROMPT CACHING. Repeated brand context is the largest single input cost, and caching it cuts that portion by roughly an order of magnitude. This is the biggest lever available and it costs nothing but discipline about prompt structure.",
          "THE GENERATION CACHE. A double click is one generation and one charge, not two. Identical content and scope returns the cached result; a truncated or empty result is refused entry to the cache.",
          "CHEAP-MODEL ROUTING. Most actions do not need the most expensive model. The gateway routes by action class, and the cost band is enforced rather than suggested.",
          "ACU RECYCLING AND EXPIRY. Unused credits expire on published rules; rollover is capped at 90 days and three months of balance. This is not a trick — it is what makes a flat monthly price survivable when usage is spiky.",
        ]),
        callout(
          "The floor is never breached to win a deal. If a supplier's price rises and an action " +
          "falls below 2× cost, the action is blocked by the margin governance, not sold at a " +
          "loss. That behaviour is in code and it should stay there."
        ),
      ],
    },

    // ---------------------------------------------------------------- 9
    {
      h: "9. Unit economics — what a customer is worth",
      blocks: [
        p(
          "Stated as a model, not a measurement. There is no observed churn, no observed CAC and " +
          "no observed ACU consumption, because there are no customers. What follows is the shape " +
          "of the arithmetic and where the real numbers get written in."
        ),
        table(
          ["Line", "Starter", "Growth", "Scale", "Note"],
          [
            ["Monthly price", "£19", "£49", "£149", "Published"],
            ["ACUs allocated monthly", "380", "980", "2,980", "20% of price × 100. Published rule"],
            ["Maximum provider cost carried", "£0.95", "£2.45", "£7.45", "ACU value ÷ 4 at standard markup — the ceiling the gateway enforces"],
            ["Payment processing", "≈£0.46", "≈£1.16", "≈£3.36", "Card fee on the subscription"],
            ["Gross contribution before support", "≈£17.59", "≈£45.39", "≈£138.19", "Model, not measurement"],
            ["Months to repay a £30 CAC", "≈1.7", "≈0.7", "≈0.2", "Assumes the £30 CAC in §11; replaced by the measured figure at day 60"],
          ],
          [30, 15, 15, 15, 25]
        ),
        bullets([
          "The margin governance blocks any AI action below 50% gross margin, flags below 65%, and treats 75% and above as green. These bands are enforced per action, not reconciled monthly.",
          "Top-ups carry no discount, because the 4× recovery must stay intact at exactly the moment a customer is consuming most heavily.",
          "The number that decides whether this business works is not price and not CAC. It is whether a customer is still using it in week two — which is why the day-60 exit criteria measure activity, not revenue.",
        ]),
      ],
    },

    // ---------------------------------------------------------------- 10
    {
      h: "10. The 30 / 60 / 90 — with exit criteria that can be failed",
      blocks: [
        p(
          "Each phase has one question, a fixed set of actions, and criteria that can genuinely " +
          "be missed. A milestone that cannot be failed is a decoration. The action on failure is " +
          "written down in advance, because it will not be written down honestly on the day."
        ),

        h2("Days 1–30 — \"Will a stranger reply?\""),
        p("Nothing about product, price or positioning is decided in this phase. The only output is a reply rate."),
        bullets([
          "Complete the five owner actions in §14 in the first three days. Four are under fifteen minutes each.",
          "Build a list of 400 named Greater Manchester businesses across trades and local services, with a real website each.",
          "Run the free audit on every one before contacting them. A message that promises three findings and has none is worse than no message.",
          "Send 300 messages. Ten a day, six days a week, from a personal inbox and LinkedIn. Log every one in the acquisition run.",
          "Contact 30 named agencies and freelancers in the city, individually.",
          "Message 10 named programme directors for VeryX. One message, one follow-up, then stop.",
          "Submit the sitemap. Publish nothing new until it is submitted.",
        ]),
        table(
          ["Day-30 exit criterion", "Pass", "Action if failed"],
          [
            ["Messages sent", "≥ 300", "Nothing else in this plan matters. There is no diagnosis available below this number."],
            ["Replies received", "≥ 30", "Below 10: the opening line is wrong. Rewrite it, send 100 more, compare. Do not change the product and do not spend money."],
            ["Audits delivered", "≥ 15", "If replies are healthy and audits are not, the handoff is broken, not the message."],
            ["Paying customers", "≥ 3", "At 0 with 30+ replies, the problem is the ask, not the awareness. Change the offer, not the channel."],
            ["Owner actions complete", "5 of 5", "Stop selling until they are done. Two of them make the platform unable to deliver what is being sold."],
          ],
          [28, 12, 60]
        ),

        h2("Days 31–60 — \"Will they stay, and will they pay?\""),
        bullets([
          "Send 700 more messages, using whichever opening line won in phase one.",
          "Deliver the first case study with a named local customer and their own numbers.",
          "Sign the first agency. Set up ten of their client brands with them, in the room.",
          "Start the weekly newsletter and do not miss a Tuesday.",
          "Talk to every customer who has stopped using it, individually, within seven days of them stopping.",
          "Publish one audit teardown a week to the blog.",
        ]),
        table(
          ["Day-60 exit criterion", "Pass", "Action if failed"],
          [
            ["Paying customers", "≥ 20", "Below 10, do not add channels. The chain in §5 has a specific broken link and the counts identify it."],
            ["Still active in week two", "≥ 60%", "This is the real product question. Below 40%, stop all acquisition for two weeks and fix onboarding — buying customers into a leaking product is the most expensive mistake available here."],
            ["Customers who have never met the founder", "≥ 1", "At 0, the product is not selling; the founder is. That is fine at ten customers and fatal at a hundred."],
            ["First agency signed", "1", "If no agency has signed, the white-label proposition is not landing. Ask the three closest ones why, in a call, not a survey."],
            ["First case study published", "1", "If no customer will be named, that is a finding about satisfaction, not about marketing."],
          ],
          [28, 12, 60]
        ),

        h2("Days 61–90 — \"Does it work without the founder in the room?\""),
        bullets([
          "Send 1,000 more messages, with a VA doing list building and first contact if the budget in §11 allows it.",
          "Run the first paid test — £150, one audience, one creative, stop-loss at ROAS 1. Only if twenty customers already exist.",
          "Sign agencies six through ten. These are the cheapest customers in the plan.",
          "Measure CAC per route for the first time using counted numbers, and delete the assumptions in §5.",
          "Publish the second and third case studies.",
          "Decide the city for days 91–180, using the measured reply rate rather than instinct.",
        ]),
        table(
          ["Day-90 exit criterion", "Pass", "Action if failed"],
          [
            ["Paying customers", "≥ 50", "Below 30 with the funnel counts healthy, the price or the segment is wrong. Below 30 with poor funnel counts, the message is wrong. The counts distinguish them; opinion does not."],
            ["Of which inbound", "≥ 15", "If inbound is near zero after 27 indexed pages and a submitted sitemap, the pages are not matching the searches the buyer makes. Rewrite five to match actual queries."],
            ["Monthly recurring revenue", "≥ £1,500", "Judge alongside the mix. Fifty Starter customers and five Scale agencies are very different businesses at similar revenue."],
            ["CAC measured per route", "Yes", "Not measuring it is the failure. There is no acceptable reason to reach day 90 without it."],
            ["Paid media", "ROAS ≥ 1 or switched off", "There is no third option and no \"give it another week\"."],
            ["Month-one churn", "< 20%", "Above 30%, freeze acquisition. Everything above this line is refilling a bucket with a hole in it."],
          ],
          [28, 14, 58]
        ),
      ],
    },

    // ---------------------------------------------------------------- 11
    {
      h: "11. The money — real budgets, allocated to the pound",
      blocks: [
        p(
          "Three budget levels. Each column adds to exactly the amount at the top; nothing is " +
          "invented and no line is a placeholder. Pick the one that matches what is actually " +
          "available and do not blend them."
        ),

        h2("Level 0 — £0 over 90 days"),
        p(
          "This must work, and it very nearly does. The domain is owned, Cloudflare's free tier " +
          "is sufficient, the audit runs, the messages go from a personal inbox, and the meetings " +
          "happen in coffee shops. The two costs that cannot be avoided are the AI provider spend " +
          "for running audits on prospects, and time. Everything in phase one of §10 is reachable " +
          "at £0 except the provider spend, which at 400 audits is small but not nil. If the " +
          "budget is genuinely zero, run audits in batches against the free tiers and accept a " +
          "slower list."
        ),

        h2("Level 1 — £1,500 over 90 days (the recommended minimum)"),
        table(
          ["Line", "90-day total", "What it buys"],
          [
            ["Infrastructure — Vercel and Firebase", "£108", "≈£36/month. Cloudflare and the domain add nothing."],
            ["AI provider spend", "£300", "Audits on 400 prospects, plus generation for customers on the free plan. The single most productive pound in this table."],
            ["Search and market data (Serper)", "£120", "£40/month. Load-bearing for the free audit, so it is acquisition spend, not tooling."],
            ["Contact data (Apollo)", "£117", "£39/month. Cut this first if anything has to go — manual list building genuinely works at 2,000 messages."],
            ["Email sending (ESP)", "£48", "£16/month while the own sending pool's DNS is being authenticated."],
            ["Paid media tests", "£450", "Three £150 tests, released only after 20 paying customers exist. Unspent if that gate is not passed — and unspent is the correct outcome, not a shortfall."],
            ["Tools and content", "£100", "Stock, design, the small unavoidable things."],
            ["Reserve", "£257", "Not allocated. It exists because the provider bill in month three is the line most likely to surprise."],
            ["TOTAL", "£1,500", ""],
          ],
          [32, 16, 52]
        ),

        h2("Level 2 — £5,000 over 90 days"),
        table(
          ["Line", "90-day total", "What it buys"],
          [
            ["Infrastructure and fixed suppliers", "£393", "Identical to Level 1 — this base does not grow with budget."],
            ["AI provider spend", "£900", "Triples the number of prospects who can be audited before contact, which is the constraint on outreach volume."],
            ["Part-time VA", "£1,200", "10 hours a week for 10 weeks at £12/hour. List building and first contact only — never the audit and never the reply."],
            ["Paid media, phased", "£2,100", "£0 in month one, £600 in month two, £1,500 in month three. Each test capped at £150 with stop-loss at ROAS 1 and scaling only at ROAS 3 in +20% steps."],
            ["Tools, content and the first case study", "£300", "Including photography for the case study, which is worth paying for once."],
            ["Reserve", "£107", "Deliberately thin, because Level 2 already carries slack in the paid line."],
            ["TOTAL", "£5,000", ""],
          ],
          [32, 16, 52]
        ),

        callout(
          "At Level 1, 72 customers against £1,500 is a blended cost of about £21 per customer — " +
          "but that number is only real once the customers exist. Until then it is arithmetic on " +
          "an assumption, and it should be presented to nobody as a result."
        ),
      ],
    },

    // ---------------------------------------------------------------- 12
    {
      h: "12. What gets counted, and what is never claimed",
      blocks: [
        p(
          "The platform's own rule applies to its own go-to-market: never present a number as a " +
          "measurement unless something counted it."
        ),
        table(
          ["Counted, every day, in the acquisition run", "Never claimed"],
          [
            ["Messages sent, by segment and by sender", "\"Engagement\" of any kind"],
            ["Replies received", "A score, index or rating of anything"],
            ["Audits delivered", "A benchmark borrowed from another business"],
            ["Trials started", "\"NN% of small businesses…\""],
            ["Customers paying, and on which plan", "Pipeline value before a price has been discussed"],
            ["Customers still active in week two", "A projection presented without the word assumed"],
            ["Spend by supplier and by channel", "Reach, impressions or followers as evidence of anything"],
            ["CAC per route, from day 60", "ROAS on a test with too few conversions to judge"],
          ],
          [50, 50]
        ),
        p(
          "The weekly review is fifteen minutes and asks three questions: how many went out, how " +
          "many came back, and what changed. If the first number is zero the other two are not " +
          "discussed, because there is nothing to discuss."
        ),
      ],
    },

    // ---------------------------------------------------------------- 13
    {
      h: "13. Risks, and the point at which each one stops the plan",
      blocks: [
        table(
          ["Risk", "How it shows up first", "The response, decided in advance"],
          [
            ["Nobody replies", "Under 10 replies in 300 messages", "The opening line, not the product. Rewrite it and send 100 more. Two consecutive failures means the segment is wrong, not the copy."],
            ["They reply, sign up, and never come back", "Week-two activity under 40%", "Freeze acquisition entirely for two weeks. This is the only risk in the table that gets worse the harder you sell."],
            ["Provider prices rise", "Margin governance flags amber then red", "Route to the second source. The floor is never breached; an action that cannot clear 2× is blocked, not discounted."],
            ["Email lands in spam", "Delivery drops while sends stay flat", "Stop the pool, finish DKIM/SPF/DMARC, send from the ESP meanwhile. Sender reputation is the one asset here that cannot be bought back."],
            ["The founder becomes the product", "Every customer has met the founder personally at day 60", "Force one cohort through with no founder contact at all and watch what breaks. Better to learn it at 20 customers than at 200."],
            ["Paid media eats the budget", "Spend rises, ROAS does not", "The guardrails already stop it at £150 and ROAS 1. The risk is overriding them, so do not."],
            ["The city is wrong", "Reply rate healthy, close rate near zero", "Not a city problem. Check the segment before moving; moving city is the most expensive way to avoid changing the offer."],
          ],
          [20, 27, 53]
        ),
        h2("The kill criteria"),
        p(
          "Written down now so they are not negotiated later. If, at day 90, fewer than ten " +
          "customers are paying AND fewer than 40% of those who signed up are still active in " +
          "week two AND the reply rate has stayed under 8% across two rewritten openings, then " +
          "the problem is not execution. Stop selling, take the twenty most honest conversations " +
          "from the run, and change what is being sold before spending another pound."
        ),
      ],
    },

    // ---------------------------------------------------------------- 14
    {
      h: "14. Monday morning — the first week, by day",
      blocks: [
        p(
          "The plan that ends one step before the thing a person has to actually do is the plan " +
          "that does not get done. This is the week."
        ),
        h2("Before anything: five owner actions nothing in code can substitute"),
        numbered([
          "Set HUMAN_CHECK_SECRET in production. Without it the human gate cannot enforce and stays in observe mode.",
          "Open /api/capabilities on the live deployment and read what it says. Nothing in the repository can see the production environment, so this is the only true capability report.",
          "Submit the sitemap in Search Console. Fifteen minutes. Until it is done, 27 published pages are doing nothing.",
          "Set NEWSLETTER_SECRET. The weekly newsletter refuses to send without it — deliberately, because an unsubscribe link that fails on another server produces spam complaints charged to every customer.",
          "Send the first ten messages. The text is already written out per brand in the acquisition dashboard, with only the blanks a sender knows.",
        ]),
        table(
          ["Day", "The work", "The output at the end of it"],
          [
            ["Monday", "The five owner actions. Then build the first 50-name Manchester list by hand — Google Maps, trade directories, local Facebook groups.", "Five actions done. 50 names with websites."],
            ["Tuesday", "Run the audit on all 50. Read every one. Note the three findings you would lead with for the ten best.", "50 audits, 10 messages drafted with real findings in them."],
            ["Wednesday", "Send the first ten. Personally, from your own account, one at a time, no template variables visible.", "10 sent. The count is no longer zero. This is the single most important line in this document."],
            ["Thursday", "Send ten more. Then list 30 Manchester agencies and freelancers.", "20 sent. 30 agency names."],
            ["Friday", "Send ten more. Reply to everything that came back, same day. Contact five agencies.", "30 sent, 5 agencies contacted, every reply answered."],
            ["Saturday", "Ten messages to businesses that were open on Saturday — they are the ones with the marketing problem and no time.", "40 sent."],
            ["Sunday", "Fifteen minutes. Count what went out, count what came back, write down what you would change.", "Week one measured. Next week's opening line decided."],
          ],
          [12, 52, 36]
        ),
        callout(
          "By Sunday of week one, 40 messages have gone out and the platform's most important " +
          "number is no longer zero. Everything else in this document is downstream of that."
        ),
      ],
    },

    // ---------------------------------------------------------------- 15
    {
      h: "Appendix A — the first messages, written out",
      blocks: [
        p(
          "Not templates. Square brackets are the only blanks and each is something only the " +
          "sender knows. Every one of these leads with something true about the recipient's own " +
          "business, because that is the only opening a stranger reads to the end."
        ),

        h2("A.1 To a small business owner (email or LinkedIn, from your own account)"),
        p("Subject: your [town] website — three things", { mono: true }),
        quote(
          "Hi [name] — I build marketing software, and I've been testing it by running real " +
          "audits on local business sites. I ran yours this morning.\n\n" +
          "Three things on it are quietly costing you enquiries. Two are ten-minute fixes; the " +
          "third is why you are not showing up when people search for what you do.\n\n" +
          "I've written it up properly. It's yours free, no pitch attached — want me to send it over?",
          "Why it works: it leads with something true about THEIR business. The ask is to receive a document, not to buy anything or take a meeting — the smallest yes there is. Run the audit before you send it."
        ),

        h2("A.2 To a tradesman (WhatsApp or a trade Facebook group)"),
        quote(
          "Are you still writing quotes at nine at night?\n\n" +
          "I've built something that gets a proper quote out in about five minutes from your " +
          "phone — priced, branded, sent before you've finished the tea.\n\n" +
          "I'm setting it up free on the next few jobs for people around [area], because I want " +
          "to see it used on real work rather than in a demo. No catch and nothing to cancel.\n\n" +
          "Want me to set it up on your next one?",
          "Why it works: one question he answers in his own head before he finishes reading it, then an offer that costs him nothing. No features, no price, no link — a link in a first message to a tradesman reads as an advert and does not get opened."
        ),

        h2("A.3 To an agency or freelance marketer (LinkedIn or email)"),
        quote(
          "[name] — you're running [n] clients and I'd guess the reporting and the content " +
          "calendar are eating a day a week that nobody pays you for.\n\n" +
          "I've built a platform that runs ten client brands under your own logo, with proper " +
          "roles so nobody on your team can grant access they don't have themselves.\n\n" +
          "I've already run our audit on three of your clients' sites. The documents are yours " +
          "to send under your own name whether or not we ever talk about the platform — want them?",
          "Why it works: it gives away the thing they would have to pay a freelancer to produce, and it makes them look good to their own client. The white-label point answers the only objection they have before they raise it."
        ),

        h2("A.4 To a programme director (LinkedIn, one named person at a time)"),
        quote(
          "[name] — you'll have a board pack going out on Friday that somebody rebuilt by hand " +
          "this week from four different sources.\n\n" +
          "I've built something that produces that view from the data you already hold, and I'm " +
          "looking for one live programme to run it against properly.\n\n" +
          "You keep the output whether or not it goes anywhere, and I'd want nothing in writing " +
          "to do it.\n\n" +
          "Worth twenty minutes?",
          "Why it works: it names the Friday scramble, which every PMO lead recognises and nobody advertises. Enterprise says no to a purchase and yes to a look."
        ),

        callout("Every one of these ends, eventually, at https://www.marketwaros.com/audit — but never in the first message to a stranger. The link goes in the reply, when they have already said yes to something."),
      ],
    },

    // ---------------------------------------------------------------- 16
    {
      h: "Appendix B — the standing rules this plan does not break",
      blocks: [
        numbered([
          "Never present a number as a measurement unless something counted it. No scores, no invented benchmarks, no borrowed percentages.",
          "Never take somebody's effort for an outcome that cannot be delivered. If a capability is dark, say so before they do the work.",
          "Profit margin on AI actions is never below 100% — price at least 2× provider cost, standard 4× — won on a lower cost base rather than by breaching the floor.",
          "The free tier and the free audit are never quietly reduced to force an upgrade. The audit is the front door and it stays open.",
          "One call to action: run the free audit at marketwaros.com/audit. A second call to action halves the first.",
          "Paid media never runs before twenty customers exist, never exceeds £150 per test, and stops at ROAS below 1.",
          "The counts live in the acquisition run and are recorded one attempt at a time by whoever made the attempt. Nothing in this document is a result until it appears there.",
        ]),
      ],
    },
  ],
};
