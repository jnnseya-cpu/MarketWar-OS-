// The MarketWar OS agent corps. Each agent is a specialised intelligence
// node with a strict, anti-generic operating directive.

export const MASTER_DIRECTIVE = `You are an intelligence node inside MarketWar OS,
an AI-powered customer acquisition operating system for small businesses that
cannot afford to waste money on ads.

Operating rules:
1. ZERO GENERIC INFO. Never output "marketing best practices" or motivational
   filler. Every line must be tactical, specific to the business, its industry,
   its location and its numbers.
2. MONEY FIRST. Tie every recommendation to leads, orders, bookings, messages
   or revenue — never vanity metrics.
3. BLUNT VERDICTS. Classify everything as SCALE, FIX or STOP with a one-line
   reason and the exact next action.
4. LOCAL FIDELITY. Use the business's real location: postcodes, landmarks,
   local behaviour and, where natural, regional phrasing.
5. STRUCTURE. Respond in short markdown sections with headers, so output can
   be rendered directly in the dashboard. No preamble, no sign-off.`;

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  demoOutput: (input: Record<string, string>) => string;
}

const biz = (i: Record<string, string>) => i.business || "your business";
const loc = (i: Record<string, string>) => i.location || "your area";

export const AGENTS: Record<string, AgentDef> = {
  "business-diagnosis": {
    id: "business-diagnosis",
    name: "Business Diagnosis Agent",
    role: "Audits the whole conversion system",
    description:
      "Audits product, pricing, audience, landing page, offer, past ads and funnel — and tells you exactly why marketing failed.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the BUSINESS DIAGNOSIS AGENT. Audit the business across: offer
strength, pricing clarity, trust signals, audience match, landing/ordering
experience, follow-up system and past ad performance. Output sections:
## Diagnosis Verdict (one blunt paragraph)
## Top 5 Failure Reasons (ranked, each with evidence)
## Fastest Fix (one action, doable today)
## What NOT To Spend On Yet`,
    demoOutput: (i) => `## Diagnosis Verdict
${biz(i)} is not failing because of ad spend — it is failing because money was pointed at an unqualified objective. Boosted posts bought attention with no capture mechanism, no offer deadline and no follow-up channel. The engine leaks before it converts.

## Top 5 Failure Reasons
1. **No capture channel** — traffic landed on a feed post, not a WhatsApp thread or order page. Attention evaporated.
2. **Offer without urgency** — "${i.offer || "the current offer"}" gives no reason to act today.
3. **Audience mismatch** — spend went broad; buyers for ${i.product || "this product"} are within a tight radius of ${loc(i)}.
4. **Zero follow-up** — every non-buyer was lost permanently. No retargeting list, no message sequence.
5. **Vanity objective** — campaigns optimised for engagement, not cost-per-order.

## Fastest Fix
Route every ad click to WhatsApp with a pre-filled message and a 48-hour offer. This alone typically cuts cost-per-lead 40–60% for local businesses.

## What NOT To Spend On Yet
- Brand awareness campaigns
- Follower-growth objectives
- Any ad without a tracked destination`,
  },

  "customer-pain": {
    id: "customer-pain",
    name: "Customer Pain Agent",
    role: "Finds real pains, objections and triggers",
    description:
      "Extracts the pains, objections, buying triggers and emotional hooks that actually make your customers act.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the CUSTOMER PAIN AGENT. Derive the target customer's real pain
points, objections, buying triggers and emotional hooks for this specific
business and location. Output sections:
## Primary Pains (ranked)
## Objections Blocking Purchase (each with a one-line neutraliser)
## Buying Triggers
## 5 Emotional Hooks (ready to use in ads)`,
    demoOutput: (i) => `## Primary Pains
1. Decision fatigue at dinner time — "what are we eating tonight" hits at 5–7pm.
2. Distrust of delivery times after being burned by slow local competitors.
3. Feeding a family out costs £40+; guilt about spend vs convenience.

## Objections Blocking Purchase
- "Delivery will be cold/late" → show live prep-to-door time on every ad.
- "Too expensive for a weekday" → anchor the family bundle against cooking cost + time.
- "Never heard of them" → lead with review count and local landmark proximity in ${loc(i)}.

## Buying Triggers
- Payday weekends, match days, rainy evenings, school holidays.
- Seeing food content between 5pm and 8pm within 2 miles.

## 5 Emotional Hooks
1. "Dinner solved in one tap — hot in 20 minutes."
2. "Feed the whole family for less than one takeaway pizza each."
3. "The grill your neighbours in ${loc(i)} won't shut up about."
4. "No cooking. No dishes. No arguments."
5. "Order by 6, eating by 6:25."`,
  },

  "offer-builder": {
    id: "offer-builder",
    name: "Offer Builder Agent",
    role: "Engineers irresistible offers",
    description:
      "Builds offers that force action: bundles, guarantees, urgency, referral rewards, trials and lead magnets — scored for margin safety.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the OFFER BUILDER AGENT. Engineer 3 concrete offers for this
business: one volume offer, one margin offer, one recovery offer. For each
output: the offer line as the customer sees it, the psychological mechanism,
margin-safety note, and the exact CTA. End with:
## Winner (which to launch first and why)`,
    demoOutput: (i) => `## Offer 1 — Volume: "Feed 4 for £25, Fridays only"
- **Mechanism:** price anchor + scarcity window. Friday is a natural decision point.
- **Margin safety:** bundle uses highest-margin items; ~58% gross margin holds.
- **CTA:** "Order on WhatsApp before 7pm — kitchen caps at 40 platters."

## Offer 2 — Margin: "Office Grill Box trial @ £99 (feeds 12)"
- **Mechanism:** low-risk B2B entry that converts to a recurring £190 weekly order.
- **Margin safety:** trial breaks even; lifetime value is the target.
- **CTA:** "Book your team's Friday trial — reply LUNCH."

## Offer 3 — Recovery: "We miss you — 20% off this weekend only"
- **Mechanism:** loss-framed reactivation with a hard deadline, sent to inactive customers only.
- **Margin safety:** 20% off beats a £0 customer; cap at one redemption.
- **CTA:** "Reply YES and your table/order is locked in."

## Winner
Launch Offer 1 first: it feeds the WhatsApp list that Offers 2 and 3 monetise. ${biz(i)} needs list volume before margin plays.`,
  },

  "ad-creative": {
    id: "ad-creative",
    name: "Ad Creative Agent",
    role: "Generates channel-native ad creative",
    description:
      "Generates Facebook, Instagram, TikTok, Google and LinkedIn copy, hooks, scripts and image/video prompts — built to convert, not to look nice.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AD CREATIVE AGENT. Produce channel-native creative for the
requested campaign. Output sections:
## Meta/Instagram (primary text, headline, 3 hook variants)
## TikTok (15s script with shot list)
## Google (3 headlines, 2 descriptions)
## Image Prompt (for the visual engine)
Every asset must contain the offer and a WhatsApp CTA.`,
    demoOutput: (i) => `## Meta/Instagram
**Primary text:** It's Friday. The grill is on. Feed 4 for £25 — hot at your door in ${loc(i)} within 30 minutes. Tap to order on WhatsApp before the kitchen caps out.
**Headline:** Feed 4 for £25 — Fridays Only
**Hooks:**
1. "POV: dinner for the whole family costs less than your lunch meal deal."
2. "40 platters. Every Friday. Gone by 7pm."
3. "Your neighbours already ordered. 👀"

## TikTok (15s)
1. (0–2s) Flames hit the grill, text: "Friday in ${loc(i)}..."
2. (2–6s) Speed-run of platter being packed, price sticker slams on: £25.
3. (6–11s) Door handoff, family reaction shot.
4. (11–15s) "Feed 4 for £25 — WhatsApp us before 7pm. Link in bio."

## Google
**Headlines:** Family Platter £25 | Hot in 20 Mins | ${biz(i)}
**Descriptions:** Flame-grilled family platter, delivered hot in ${loc(i)}. / Order on WhatsApp in one tap. Friday kitchen caps at 40.

## Image Prompt
Overhead shot of a steaming flame-grilled platter on a wooden table, hands reaching in, warm evening light, bold "£25 FEEDS 4" badge top-right, WhatsApp button bottom-centre.`,
  },

  "campaign-commander": {
    id: "campaign-commander",
    name: "Campaign Commander Agent",
    role: "Builds and sequences test campaigns",
    description:
      "Builds small-budget test campaigns with clear objectives, kill criteria and a scale plan — the general of the war room.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the CAMPAIGN COMMANDER AGENT. Design a complete test campaign for the
stated goal and budget. Output sections:
## Campaign Order (objective, channel, audience, budget split, duration)
## Kill Criteria (exact numbers that trigger STOP)
## Scale Criteria (exact numbers that trigger SCALE)
## 7-Day Battle Plan (day-by-day)`,
    demoOutput: (i) => `## Campaign Order
- **Objective:** WhatsApp orders (not clicks, not reach)
- **Channel:** Meta advantage+ suppressed — manual placement, Facebook + IG feed/reels
- **Audience:** 2-mile radius of ${loc(i)}, 25–54, interest stack: takeaway, family meals
- **Budget split:** £15/day → 70% winning hook, 30% challenger
- **Duration:** 7-day test, verdict locked at £100 spend

## Kill Criteria
- Cost per WhatsApp message > £4 after £40 spend → STOP ad set
- CTR < 1% after 2,000 impressions → STOP creative
- Zero orders by day 4 → STOP campaign, escalate to Diagnosis Agent

## Scale Criteria
- Cost per order < 60% of average order value → +40% budget every 48h
- Message-to-order rate > 45% → clone audience to lookalike 1%

## 7-Day Battle Plan
Day 1–2: launch 3 hooks, equal split. Day 3: kill worst hook. Day 4: shift 70% to leader. Day 5: launch retargeting on engagers. Day 6–7: lock verdict, prep scale order.`,
  },

  "budget-protection": {
    id: "budget-protection",
    name: "Budget Protection Agent",
    role: "Stops waste automatically",
    description:
      "Watches every pound. Pauses campaigns that spend without producing leads and reroutes budget to what is working.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the BUDGET PROTECTION AGENT. Review the campaign figures provided and
issue protection orders. Output sections:
## Protection Orders (per campaign: SCALE / FIX / STOP + exact budget change)
## Money Saved This Week
## Reallocation Plan`,
    demoOutput: () => `## Protection Orders
- **Family Platter Friday — SCALE.** £3.82 cost per order vs £9.50 AOV. Raise £15→£21/day.
- **Office Lunch Catering — FIX.** Spend held at £8/day until the pricing-stall fix ships. Do not scale a leaking funnel.
- **Generic Brand Awareness — STOP (executed).** £48/lead, zero orders. £96 rerouted.
- **Student Night 2-for-1 — HOLD.** Verdict locks at £60 spend. No changes until then.

## Money Saved This Week
£96 recovered from the killed awareness campaign + £34 prevented overspend on stalled catering = **£130 protected**.

## Reallocation Plan
£130 → Family Platter Friday scale order. Projected return at current cost-per-order: **+£320 revenue**.`,
  },

  "lead-capture": {
    id: "lead-capture",
    name: "Lead Capture Agent",
    role: "Builds pages, flows and follow-up",
    description:
      "Creates landing pages, WhatsApp flows, forms and email/SMS follow-up sequences so no click is ever wasted.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the LEAD CAPTURE AGENT. Design the capture system for the stated
campaign. Output sections:
## Landing Page Blueprint (headline, offer block, proof, CTA, form fields)
## WhatsApp Flow (message-by-message, with qualification logic)
## Follow-Up Sequence (48h, message timing + copy)`,
    demoOutput: (i) => `## Landing Page Blueprint
- **Headline:** "Feed 4 for £25 — Hot in ${loc(i)} in 20 Minutes"
- **Offer block:** platter photo, £25 badge, "Fridays only — kitchen caps at 40"
- **Proof:** live order counter + 3 named local reviews
- **CTA:** single WhatsApp button, pre-filled: "FRIDAY PLATTER please 🔥"
- **Form fields:** none. WhatsApp IS the form. Every field you remove adds conversions.

## WhatsApp Flow
1. Auto-reply <10s: "You're in. 1 platter feeds 4 — £25. Delivery or collection?"
2. If delivery → "Postcode?" → confirm slot → payment link.
3. If silent 15 min → "Kitchen's filling up — shall I hold your platter? Reply YES."
4. Order confirmed → tag customer, add to Friday broadcast list.

## Follow-Up Sequence
- +1h (no order): "Last platters going — want me to hold one?"
- +24h: send next-week early-access: "Skip the cap — pre-order now."
- +48h (still no order): move to nurture list; stop selling, send the menu once.`,
  },

  "competitor-spy": {
    id: "competitor-spy",
    name: "Competitor Spy Agent",
    role: "Monitors rivals and finds gaps",
    description:
      "Tracks competitor offers, ads, pricing and positioning — and turns their weaknesses into your campaigns.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the COMPETITOR SPY AGENT. Analyse the competitive field provided.
Output sections:
## Threat Board (per competitor: threat level, current move, weakness)
## Exploitable Gaps (ranked)
## Counter-Campaign (one ready-to-launch response)`,
    demoOutput: (i) => `## Threat Board
- **Flame Republic — HIGH (78/100).** Running £15 meal-deal ads into your postcode. Weakness: 2.9★ delivery reviews, consistent "arrived cold" complaints.
- **Peri Palace — MEDIUM (54/100).** Cheaper, student-focused. Weakness: no WhatsApp ordering; checkout friction.
- **The Grill Room — LOW (22/100).** Premium dine-in, no delivery. Not competing for your orders.

## Exploitable Gaps
1. **Speed + heat guarantee** — nobody in ${loc(i)} promises delivery temperature or time.
2. **One-tap WhatsApp ordering** — both rivals force app/website checkout.
3. **Family positioning** — competitors chase students and couples; families are unowned.

## Counter-Campaign
"**Hot in 20 minutes or it's free.**" Target Flame Republic's engaged audience with the guarantee they can't match. Their review history does the selling for you.`,
  },

  "local-growth": {
    id: "local-growth",
    name: "Local Growth Agent",
    role: "Hyper-local domination",
    description:
      "Builds hyper-local campaigns: Google Business optimisation, local SEO, community channels and geo-targeted offers.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the LOCAL GROWTH AGENT. Build the local domination plan. Output:
## Local Visibility Audit
## Google Business Attack Plan
## Community Distribution (specific local groups/channels)
## Geo-Offer Grid (offer per micro-area)`,
    demoOutput: (i) => `## Local Visibility Audit
${biz(i)} ranks outside the top 3 map pack for "grill near me" in ${loc(i)} — the query with the highest order intent. Review velocity (2/month) is below the 9/month of the pack leader.

## Google Business Attack Plan
1. Post the Friday platter offer as a GBP update every Thursday 4pm.
2. Trigger a review ask in WhatsApp 45 min after every delivery ("One tap helps a local business 🙏").
3. Add "family platter", "office catering" as GBP services with prices.
4. Upload 3 real photos/week — plates, grill, handoff. No stock images.

## Community Distribution
- Local residents' Facebook groups: value-first posts (behind-the-grill content), offer only in comments.
- School/PTA newsletters: family platter sponsorship.
- Local gym + barbershop partnership: cross-promo cards at till.

## Geo-Offer Grid
- **SW9 core (walkable):** collection deal — skip delivery fee.
- **SW2/SW4 (delivery belt):** free delivery over £20, lead with speed.
- **SE24 edge:** first-order £5 off to buy the habit.`,
  },

  "revenue-intelligence": {
    id: "revenue-intelligence",
    name: "Revenue Intelligence Agent",
    role: "Attributes every pound",
    description:
      "Shows what actually produced leads, bookings, orders and revenue — and predicts where next month's money comes from.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the REVENUE INTELLIGENCE AGENT. Analyse the revenue data provided.
Output sections:
## Where The Money Actually Came From (attribution table in markdown)
## Leaks (where revenue is escaping, with £ estimates)
## 30-Day Forecast (base / push / stretch scenarios)`,
    demoOutput: () => `## Where The Money Actually Came From
| Source | Spend | Revenue | ROAS |
|---|---|---|---|
| Family Platter Friday (Meta) | £84 | £610 | 7.3x |
| Sunday Roast Reactivation (WhatsApp) | £0 | £371 | ∞ |
| Office Lunch Catering (LinkedIn) | £112 | £380 | 3.4x |
| Student Night (TikTok) | £40 | £133 | 3.3x |
| Brand Awareness (killed) | £96 | £0 | 0x |

## Leaks
- **Ghosted WhatsApp threads:** 9 open conversations worth ~£240 have had no follow-up in 24h+.
- **Inactive customer vault:** £1,240 recoverable revenue untouched (118 contacts).
- **Catering pricing stall:** ~£380/mo lost to leads that never see the menu.

## 30-Day Forecast
- **Base (do nothing new):** £1,500
- **Push (execute today's action list):** £2,400
- **Stretch (scale order + full reactivation):** £3,100`,
  },

  "content-factory": {
    id: "content-factory",
    name: "Content Factory Agent",
    role: "Manufactures conversion content",
    description:
      "Produces 30-day calendars, reels scripts, posts and captions — every piece engineered to route attention into owned channels.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the CONTENT FACTORY AGENT. Produce a 7-day content strike plan.
For each day: platform, format, hook, one-line brief, CTA into an owned
channel (WhatsApp/list). End with:
## Rules Of Engagement (what this business must never post)`,
    demoOutput: (i) => `## 7-Day Content Strike Plan
- **Mon — IG Reel:** "How 40 platters get built in 90 minutes" speed-run. CTA: "Friday list opens Wed — WhatsApp us."
- **Tue — FB post:** Name a local landmark: "3 minutes from ${loc(i)} station and hotter than the platform in July." CTA: menu in comments.
- **Wed — IG Story poll:** "Wings or ribs on Friday's platter?" → DM voters the pre-order link.
- **Thu — TikTok:** POV dinner-decision argument, resolved by the £25 platter. CTA in caption.
- **Fri — All channels:** live counter "Platter 27/40 just left the kitchen." Scarcity is the content.
- **Sat — FB/IG:** customer photo repost + review screenshot. CTA: "Book Sunday roast."
- **Sun — WhatsApp broadcast:** next week's early access to the list only.

## Rules Of Engagement
- Never post without a CTA into WhatsApp or the list.
- Never post stock photography — phones sell food better than agencies here.
- Never chase trends that don't end in an order.`,
  },

  "growth-strategist": {
    id: "growth-strategist",
    name: "AI Growth Strategist",
    role: "Daily strategic command",
    description:
      "Your daily briefing officer: reads every module, ranks what matters and issues today's orders.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI GROWTH STRATEGIST — the senior officer above all other agents.
Given the full business state, issue the daily briefing. Output sections:
## Situation Report (3 lines max)
## Today's Orders (ranked, max 5, each with expected £ impact)
## Do Not Do Today (traps to avoid)
## One Metric That Matters Today`,
    demoOutput: (i) => `## Situation Report
${biz(i)} has a proven winner (7.3x ROAS), £1,240 of dormant revenue in the vault, and a rival pushing into the postcode. The constraint is execution speed, not budget.

## Today's Orders
1. Confirm the £190 catering booking in WhatsApp — 2 minutes, highest £/minute action available.
2. Scale Family Platter Friday +40% — projected +£320/wk.
3. Fire reactivation wave 2 at 118 inactive contacts — projected +£670 this month.
4. Ship the "Hot in 20 minutes or it's free" counter-campaign vs Flame Republic.
5. Add the tiered menu PDF to the catering auto-reply.

## Do Not Do Today
- Do not start new creative tests while a scale order is pending.
- Do not discount the Friday platter — it converts at full price.

## One Metric That Matters Today
**WhatsApp response time.** Every thread answered inside 10 minutes converts at ~3x the rate of hour-old replies.`,
  },
};

export const AGENT_LIST = Object.values(AGENTS);
