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

  "video-commander": {
    id: "video-commander",
    name: "Video Commander Agent",
    role: "One-click campaign video engine",
    description:
      "Turns a business brief into a complete campaign video package: script, scenes, voiceover direction, captions, CTA and platform-native versions for TikTok, Reels, Shorts, Facebook, LinkedIn and YouTube.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the VIDEO COMMANDER AGENT of the MarketWar AI Video War Room. From
the business brief, produce a complete campaign video package. Output:
## Video Concept (hook-first, outcome-focused, one paragraph)
## Script (15–30s master version: scene-by-scene table — visual, on-screen text, voiceover line)
## Voiceover Direction (voice type, pace, emotion)
## CTA & Capture (exact CTA, where it routes — WhatsApp/landing page)
## Platform Versions (TikTok/Reels/Shorts, Facebook, LinkedIn, YouTube — length, ratio, hook adaptation for each)
## Repurposing Plan (what the one long asset becomes: counts per platform + blog/email/landing-script)`,
    demoOutput: (i) => `## Video Concept
A 20-second hunger-trigger ad for ${biz(i)}: real flames, real steam, a countdown to the Friday cap — engineered to stop the scroll at dinner-decision time and route straight into WhatsApp.

## Script
1. **(0–2s)** Close-up flames hit the grill · text: "It's Friday in ${loc(i)}…" · VO: "Stop scrolling. Dinner's solved."
2. **(2–7s)** Platter assembly speed-run · text: "£25 FEEDS 4" · VO: "One platter. Four people. Twenty-five pounds."
3. **(7–13s)** Door handoff + family reaction · text: "Hot in 20 minutes" · VO: "From our grill to your table in twenty minutes — or it's free."
4. **(13–18s)** Live counter "Platter 27/40" · text: "Kitchen caps at 40" · VO: "Forty platters every Friday. When they're gone, they're gone."
5. **(18–20s)** WhatsApp button animation · text: "Tap to order" · VO: "Tap, order, eat."

## Voiceover Direction
Warm male or female voice, local accent, conversational pace that accelerates over scenes 3–5. Emotion: confident, hungry, urgent — never salesy-shouty.

## CTA & Capture
"Order on WhatsApp before 7pm" → wa.me deep link with pre-filled "FRIDAY PLATTER 🔥". Pixel + UTM on every platform version.

## Platform Versions
- **TikTok/Reels/Shorts** — 9:16, 15s cut, hook = flames + "POV: it's Friday and you're starving"
- **Facebook** — 4:5, 20s, text-forward for sound-off viewing, price badge always visible
- **LinkedIn** — 1:1, 25s office-catering re-angle: "Your team's Friday lunch, sorted"
- **YouTube** — 16:9, 30s with 5s bumper cut for pre-roll

## Repurposing Plan
Master shoot becomes: 10 TikToks · 10 Reels · 10 Shorts · 5 LinkedIn clips · 5 Facebook ads · 1 blog post ("Behind 40 platters every Friday") · 1 email campaign · 1 landing-page script.`,
  },

  "caption-engine": {
    id: "caption-engine",
    name: "Caption Engine Agent",
    role: "Conversion-grade subtitles & captions",
    description:
      "Generates captions in four OS modes — Sales, Education, Viral and Brand — with styling, timing and platform export guidance.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the CAPTION ENGINE AGENT. Given a video script or transcript and a
chosen mode, produce conversion-grade captions. Output:
## Mode Verdict (which caption mode fits this video and why)
## Caption Track (timestamped lines, written for the mode)
## Styling Spec (font weight, colour source, highlight pattern, position, safe areas)
## Platform Notes (burned-in vs SRT/VTT, per-platform differences)
Modes: SALES (conversion-optimised) · EDUCATION (clear, academic) ·
VIRAL (punchy TikTok/Reels) · BRAND (logo colours, brand voice).`,
    demoOutput: (i) => `## Mode Verdict
**Viral Caption Mode** — this is a scroll-interruption ad for ${biz(i)}; captions must punch word-by-word. (Brand Mode styling applied on top: emerald highlight pulled from the logo.)

## Caption Track
- 0.0–1.8s — "IT'S FRIDAY. 🔥"
- 1.8–4.0s — "Feed **4 people** for **£25**"
- 4.0–7.5s — "Hot at your door in **20 MINUTES**"
- 7.5–11.0s — "…or it's **FREE**"
- 11.0–15.0s — "Kitchen caps at **40 platters**"
- 15.0–18.0s — "27 already gone 👀"
- 18.0–20.0s — "TAP TO ORDER ↓"

## Styling Spec
Bold sans (Space Grotesk weight 700), white base, brand-emerald word highlights on prices and numbers, karaoke word-by-word reveal, centred lower-third, 10% safe margin for TikTok UI, drop shadow for sound-off legibility.

## Platform Notes
- TikTok/Reels/Shorts: burn captions in (85% watch muted); keep SRT master for accessibility.
- Facebook: burned-in + auto-generated SRT upload for the ad set.
- YouTube: upload VTT, keep burned-in only for Shorts.
- Export set: SRT + VTT + burned master per aspect ratio.`,
  },

  "global-reach": {
    id: "global-reach",
    name: "Global Reach Agent",
    role: "Translation, dubbing & localisation",
    description:
      "Turns one video into localised versions across languages — translating captions and voice while adapting currency, tone, cultural references and CTA per market.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the GLOBAL REACH AGENT. Given a video script and target markets,
produce the localisation plan. Output:
## Market Priority (rank the requested languages/markets by opportunity)
## Localised Versions (per language: translated hook + CTA, dubbing voice note, cultural adaptations — currency, references, tone)
## What NOT To Translate Literally (idioms/claims that must be re-written)
## Production Notes (dubbing vs subtitles per market, lip-sync needs)`,
    demoOutput: (i) => `## Market Priority
For ${biz(i)} in ${loc(i)}: 1. **English** (base) · 2. **French** (large local community, high WhatsApp usage) · 3. **Lingala** (community loyalty signal — nobody else advertises in it) · 4. **Portuguese** · 5. **Arabic**.

## Localised Versions
- **French** — Hook: "C'est vendredi. Le grill est allumé." CTA: "Commandez sur WhatsApp avant 19h." Voice: warm Parisian-African accent. Keep £ prices (UK market), add "livraison rapide" trust line.
- **Lingala** — Hook: "Eleko ya Vendredi! 🔥" CTA re-written around family table culture; voice: energetic community tone. This version is a loyalty weapon — share-rate will beat the English cut.
- **Portuguese** — Angolan-community phrasing, football-night tie-in for Friday timing.
- **Arabic** — RTL caption layout, halal prominence in scene 2, family-platter framing.

## What NOT To Translate Literally
- "…or it's free" — re-state as a time promise in French ("en 20 minutes, garanti") to avoid legal-claim tone differences.
- "POV:" meme framing — keep in English for TikTok in all markets; it is platform language, not English.

## Production Notes
- French & Lingala: full AI dubbing (voice-clone the same brand voice per language).
- Portuguese & Arabic: translated burned-in captions over original VO first (test before paying for dubs).
- All versions: localise the WhatsApp pre-filled message and UTM per market.`,
  },

  "viral-hook": {
    id: "viral-hook",
    name: "Viral Hook Agent",
    role: "Scroll-stopping hook generation & ranking",
    description:
      "Generates dozens of hooks for a video concept and ranks them by curiosity, pain, urgency, controversy, authority and scroll-stopping power.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the VIRAL HOOK AGENT of the VideoCommandCentre. Generate 50 hooks
for the given video concept, then present the ranked result. Output:
## Top 10 Hooks (ranked table: hook, dominant trigger, score /100)
## By Trigger (2 best hooks each for: curiosity, pain, urgency, controversy, authority)
## The One To Test First (and the exact reason)
## Kill List (hook patterns to avoid for this audience and why)`,
    demoOutput: (i) => `## Top 10 Hooks
1. "POV: it's Friday in ${loc(i)} and you're starving" — curiosity+relatability — 94
2. "We cap at 40 platters. 27 are gone." — urgency+scarcity — 92
3. "£25. Four people. Twenty minutes. Or it's free." — authority+risk-reversal — 90
4. "Stop paying £15 per person for cold delivery" — pain — 88
5. "The grill your neighbours won't shut up about" — social proof — 86
6. "Watch 40 platters disappear in 90 minutes" — curiosity — 84
7. "Your family's dinner argument, solved in one tap" — pain+relief — 82
8. "Nobody in ${loc(i)} promises this. We do." — controversy-lite — 80
9. "This is what £25 actually buys on our grill" — transparency — 78
10. "Order by 6, eating by 6:25" — specificity — 77

## By Trigger
- **Curiosity:** #1, #6 · **Pain:** #4, #7 · **Urgency:** #2, "Last Friday we sold out by 7:04pm" · **Controversy:** #8, "Delivery apps are robbing local families" · **Authority:** #3, "20 minutes. Guaranteed. Timed on camera."

## The One To Test First
#2 — scarcity with a live number is refreshable weekly, compounds as the count becomes real, and feeds the retargeting hook ("you watched 27 go — 13 left").

## Kill List
- Generic quality claims ("best grill in London") — unprovable, scroll-past.
- Discount-led hooks — trains the audience to wait for offers; the platter converts at full price.`,
  },

  "funnel-video-builder": {
    id: "funnel-video-builder",
    name: "Sales Funnel Video Builder",
    role: "The 8-video funnel from one brief",
    description:
      "Auto-creates the full video funnel: awareness, problem, product demo, testimonial, offer, retargeting, abandoned-cart and thank-you videos.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the SALES FUNNEL VIDEO BUILDER. From the business brief produce the
complete 8-video funnel. For EACH video output one row: funnel stage,
15-word concept, hook line, CTA, length/format, trigger (when it is shown).
The 8 stages: Awareness · Problem · Product Demo · Testimonial · Offer ·
Retargeting · Abandoned Cart · Thank You. End with:
## Sequencing Logic (how the videos chain, per platform)`,
    demoOutput: (i) => `## The 8-Video Funnel for ${biz(i)}
1. **Awareness** — flames + neighbourhood shots · Hook: "POV: Friday in ${loc(i)}" · CTA: follow/watch · 15s 9:16 · cold audiences
2. **Problem** — cold delivery montage vs our steam · Hook: "Stop paying for lukewarm food" · CTA: "There's a better Friday" · 20s · engaged viewers
3. **Product Demo** — platter built in 90 seconds real-time · Hook: "This is what £25 buys" · CTA: WhatsApp order · 30s · warm audiences
4. **Testimonial** — real family at the door, unscripted · Hook: "We didn't pay her to say this" · CTA: WhatsApp · 20s · warm audiences
5. **Offer** — the cap counter · Hook: "40 platters. Every Friday. Gone by 7." · CTA: "Tap before 7pm" · 15s · Thursday–Friday push
6. **Retargeting** — "you watched the platter video…" direct address · Hook: "Still thinking about it?" · CTA: 48h code · 10s · video-viewers 3–7d
7. **Abandoned Cart** — thread-ghosts only · Hook: "Your platter's still waiting" · CTA: "Reply YES to lock it" · 8s + WhatsApp message · started-order no-payment
8. **Thank You** — kitchen wave + next-week preview · Hook: "You made platter #31" · CTA: referral share · 10s · post-purchase

## Sequencing Logic
Meta/TikTok: 1→2→3 on view-through; 5 to all engagers Thu–Fri; 6 auto-fires at 3 days; 7 fires from thread state (WhatsApp, not ads); 8 sends in-thread post-order and seeds the referral loop. Every video's CTA lands in WhatsApp — one pipeline, full attribution.`,
  },

  "video-compliance": {
    id: "video-compliance",
    name: "AI Compliance Checker",
    role: "Pre-publish risk gate",
    description:
      "Scans scripts and creative for claim risk: regulated wording, financial/medical claims, political content, copyright, music rights, brand misuse and platform ad-policy risk.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI COMPLIANCE CHECKER of the VideoCommandCentre — a pre-publish
gate, not a lawyer. Scan the provided script/creative brief. Output:
## Verdict (PASS / FIX / BLOCK with one-line reason)
## Findings (table: element, risk category, severity, exact fix)
Risk categories: unverifiable claims · regulated wording · financial
promises · medical claims · political content · copyright · music rights ·
brand misuse · platform ad-policy. End with:
## Safe Rewrites (compliant versions of any flagged lines)
Always add: "Automated screening — not legal advice; escalate BLOCK items to a human."`,
    demoOutput: () => `## Verdict
**FIX** — one guarantee needs qualifying and one music cue needs licensing before this ad runs.

## Findings
| Element | Category | Severity | Fix |
|---|---|---|---|
| "Hot in 20 minutes or it's free" | Unverifiable claim / ad policy | Medium | Add qualifying terms ("within 3-mile zone, Fridays") on-screen and in the page T&Cs |
| Trending audio from TikTok library | Music rights | High | Licensed for organic TikTok only — NOT for paid ads; swap to commercial-licensed track for ad placements |
| "The best grill in South London" | Unverifiable superlative | Low | Use provable framing: "Rated 4.8★ by 200+ locals" |
| Competitor mention in retargeting script | Brand misuse | Medium | Remove the name; keep the category comparison ("delivery apps") |
| Customer face in testimonial | Consent | Medium | Written release on file before paid distribution |

## Safe Rewrites
- "Hot in 20 minutes or it's free — within our Friday delivery zone. T&Cs on the order page."
- "South London's 4.8★ grill — 200+ local reviews."

Automated screening — not legal advice; escalate BLOCK items to a human.`,
  },

  "thumbnail-title": {
    id: "thumbnail-title",
    name: "Thumbnail & Title Engine",
    role: "Packaging that earns the click",
    description:
      "Creates thumbnail concepts, titles, descriptions, hashtags, SEO tags and platform-specific captions for every video.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AUTO-THUMBNAIL & TITLE ENGINE. For the given video, produce the
full packaging kit. Output:
## Thumbnail Concepts (3: visual composition, text overlay ≤4 words, emotion)
## Titles (5, ranked; ≤60 chars; no clickbait that the video can't cash)
## Description (SEO-aware, first line = hook, CTA + link placement)
## Hashtags & Tags (platform-split: TikTok/IG vs YouTube SEO tags)
## Platform Captions (TikTok, Instagram, Facebook, LinkedIn, YouTube — native tone each)`,
    demoOutput: (i) => `## Thumbnail Concepts
1. Overhead platter, steam visible, hand reaching in · overlay: "£25 FEEDS 4" · emotion: hunger
2. Countdown board "13/40 LEFT" over grill flames · overlay: "GONE BY 7PM" · emotion: urgency
3. Family reaction at the door, genuine laugh · overlay: "20 MIN. PROMISE." · emotion: trust

## Titles
1. "£25 Feeds 4 — Hot in 20 Minutes or It's Free"
2. "Why 40 Families Order This Every Friday"
3. "The Friday Platter That Sells Out by 7pm"
4. "We Timed Our Delivery Promise on Camera"
5. "${biz(i)}: Behind 40 Platters in 90 Minutes"

## Description
It's Friday in ${loc(i)} and dinner is solved. One platter feeds four for £25 — flame-grilled, packed hot, at your door in 20 minutes or it's free. Kitchen caps at 40 every week. 👉 Order on WhatsApp: [link] · Menu: [link]

## Hashtags & Tags
- **TikTok/IG:** #${loc(i).split(",")[0].replace(/\s/g, "").toLowerCase()}food #londonfoodie #familydinner #grilled #fridayfeeling #ukfood
- **YouTube tags:** ${loc(i)} food delivery, family platter deal, flame grilled chicken London, Friday dinner ideas

## Platform Captions
- **TikTok:** "27 platters gone. 13 left. It's not even 6pm 👀🔥"
- **Instagram:** "Friday maths: £25 ÷ 4 people = happiest table on the street. Link in bio."
- **Facebook:** "Feed the whole family this Friday for £25 — hot in 20 minutes or it's free. Order on WhatsApp before 7pm."
- **LinkedIn:** "Office lunch, sorted: our grill boxes now cater SW9 teams every Friday."
- **YouTube:** "The £25 platter that feeds 4 — filmed start to finish. Order link below."`,
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

  "viral-product-engine": {
    id: "viral-product-engine",
    name: "MarketWar VisualStrike AI™",
    role: "One product picture → autonomous viral campaign factory",
    description:
      "Upload one product picture, receive a complete platform-ready viral campaign. Product Identity Lock™ protects the real product; Viral + Commercial Potential Scores rank every angle; the Hook Laboratory, content packs and testing matrix turn attention into attributed revenue.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are MARKETWAR VISUALSTRIKE AI (Agent 21) — an autonomous viral campaign
factory, not an image tool. The user describes or uploads product images.
Hard rules: NEVER alter the product's identity, shape, colour, packaging,
logo or specifications in any creative direction (Product Identity Lock).
NEVER invent a product capability or any health/financial/technical/
performance claim — flag uncertain facts as "needs user confirmation".
Detect and refuse deceptive clickbait. Output:
## Product Dossier (category, name, brand, visible features, materials, colours, intended use, customer types, price positioning, luxury/mass/budget class, differentiators, photo quality, missing sales info, regulatory/ad risks — mark low-confidence items ⚠ needs confirmation)
## Product Identity Lock (which characteristics are locked; recommended transformation tier from exact-preservation → controlled-creative)
## Scores (Viral Potential /100 with the 2–3 dimensions driving it and how to raise it · Commercial Potential /100 — views are not revenue · Visual Quality /100)
## Viral Angles (top 4 from the 27 angle families — each with audience, pain, emotional trigger, opening hook, proof requirement, CTA, platform, duration, brand-risk level)
## Hook Laboratory (best visual hook, spoken hook, on-screen hook, retention bridge, CTA — scored)
## Content Pack (3 strongest platforms natively adapted — full caption/hook/CTA/hashtags per platform + one email + one WhatsApp/SMS)
## Video Factory (one 6s attention ad + one 15–30s conversion ad concept, following the controlled pipeline: protected product → motion → VO/captions → consistency check)
## Sales Booster (one upsell/bundle + one honest scarcity play)
## Testing Matrix (first 3 controlled experiments: variable, variants, kill/scale criteria)
## Market Intelligence (pricing recommendation, posting times, suggested budget, predicted ROAS, purchase-intent score)
## Launch Order (publish sequence in £ terms; note compliance/consistency approvals required)`,
    demoOutput: (i) => `## Product Dossier
**Product:** Signature flame-grilled family platter (hero image analysed) · **Brand:** ${biz(i)} · **Colours:** char-black, flame-orange, emerald accents · **Style:** authentic, hunger-first food photography · **Audience:** families 25–44 + office lunch decision-makers within 3 miles of ${loc(i)} · **Price positioning:** value-premium (£25 feeds 4 — undercuts takeaway aggregators on per-head cost) · **Positioning:** budget-friendly abundance, not luxury · **Benefits:** feeds four, 20-minute doorstep heat, no aggregator fees · **Emotional triggers:** Friday relief, family togetherness, fear of the 40-platter cap · **Weakness:** steam haze softens the hero shot's product edges · **Pain point solved:** "what's for dinner" decision fatigue · **Gift potential:** low — consumable, local · **Seasonal:** match-day bundles, Ramadan iftar platters, Christmas office orders · **Viral opportunity:** platter-assembly speed-run + live counter format · **Target countries:** UK (local radius) · **Trend:** anti-aggregator "order direct" sentiment rising · ⚠ **Needs confirmation:** exact platter contents and allergen list before any ad copy states them

## Product Identity Lock
**Locked:** platter composition and portions as photographed · brand logo · £25 price point · packaging. **Recommended tier: lifestyle placement** — the real platter, real steam, real table; no synthetic food generation (food is a regulated-adjacent category: what's shown must be what arrives).

## Scores
- **Viral Potential 82/100** — first-second stopping power (flames) and comment potential ("tag who you're feeding") drive it; raise to ~90 by opening on the platter-assembly speed-run rather than a static hero.
- **Commercial Potential 87/100** — radius-targeted dinner-decision traffic with a one-tap WhatsApp CTA; views convert because the viewer can act in 10 seconds.
- **Visual Quality 78/100** — real flames beat stock, but the hero needs a tighter crop and steam control.

## Viral Angles
1. **Product demonstration** — the assembly speed-run · families deciding dinner · trigger: hunger + relief · hook: flames hit the grill · proof: real kitchen, real clock · CTA: WhatsApp "FRIDAY" · TikTok/Reels, 15s · risk: low · objective: orders tonight.
2. **Urgency & scarcity (honest)** — live "Platter 27/40" counter · trigger: fear of missing Friday · proof: the counter is the real kitchen cap · CTA: order before 7pm · Stories, 10s · risk: low · objective: same-day conversion.
3. **Comparison** — "£25 direct vs £34 on the apps" · aggregator-fatigued locals · trigger: being overcharged · proof: side-by-side receipt · CTA: order direct · Facebook, 20s · risk: medium (name no competitor) · objective: channel shift.
4. **Community participation** — "Tag the 3 people you'd share this with" · trigger: belonging · CTA: soft — profile → WhatsApp · Instagram, static+carousel · risk: low · objective: reach that retargets.

## Hook Laboratory
**Visual hook (9.1/10):** platter lands on the pass, flames flare behind — unexpected speed. **Spoken (8.7):** "You're paying £9 more for the same food on the apps." **On-screen (8.4):** "Friday's 40 platters. 27 gone." **Retention bridge:** "Wait for the price at the end." **CTA:** "Tap to order on WhatsApp." *Clickbait check: every hook is fulfilled by the content — pass.*

## Content Pack
**TikTok** — Hook: "POV: it's Friday in ${loc(i)} and you just fed 4 people for £25 🔥" · Caption: platter speed-run, live counter, "kitchen caps at 40" · CTA: "Tap the link → WhatsApp, say FRIDAY" · #${loc(i).replace(/[^a-zA-Z]/g, "")}food #familydinner #grillfriday
**Instagram Reels** — Hook: flame close-up + "£6.25 a head. Hot in 20 minutes." · CTA: "Order direct — link in bio" · Story version with countdown sticker to 7pm.
**Facebook** — Sound-off text-forward cut, price badge permanent, CTA button → wa.me deep link; boost only to 3-mile radius, families 25–44.
**Email:** "Friday's 40 platters go live at 4pm" · **WhatsApp/SMS:** "🔥 FRIDAY PLATTER: £25 feeds 4, hot in 20 min. 40 only — reply PLATTER to lock yours."

## Video Factory
- **6s attention ad:** flames → platter slam → "£25 FEEDS 4" → WhatsApp button. Product untouched, motion generated around the locked hero.
- **15–30s conversion ad:** UGC-style doorstep handoff → table reveal → kids' reaction → live counter → CTA. Pipeline: locked product → approved hero → motion → VO/captions → **consistency validation** (what's shown = what arrives) → platform versions → compliance check.

## Testing Matrix
1. **Hook** — speed-run open vs flame close-up vs receipt comparison · kill loser at 1,000 impressions, >35% CTR gap.
2. **CTA** — "Tap to order" vs "40 only — claim yours" · judge on WhatsApp thread starts, not clicks.
3. **Posting time** — 11:30 vs 16:00 vs 18:30 Thu/Fri · judge on cost per order. Winners recombine into round 2; learnings stored in Creative Intelligence Memory.

## Sales Booster
- **Bundle:** Platter + 4 drinks + 2 sides = £32 "Full Table" (AOV +28%).
- **Scarcity:** live "Platter 27/40" counter in every story from 4pm Friday — real cap, real urgency, never fake.

## Market Intelligence
Price holds at £25 (2.4× food cost — floor-safe) · Post 11:30am + 4–7pm Thu/Fri · Budget: £15/day Meta + £6/day TikTok · **Predicted ROAS 3.8–4.6×** · **Purchase-intent score 81/100** on radius-targeted Friday traffic.

## Launch Order
1. **TikTok speed-run tonight** (free reach test, zero spend at risk)
2. **Meta carousel Thursday 4pm** (paid, £15/day, kill if ROAS < 2× by Saturday)
3. **Email + WhatsApp blast Friday 4pm** (owned list = highest margin £ first)`,
  },

  "website-intelligence": {
    id: "website-intelligence",
    name: "MarketWar SiteRaid AI™",
    role: "Authorised URL → autonomous viral growth operation",
    description:
      "Converts an authorised website into a complete, continuously optimised marketing and sales operation: Business DNA™, Website Truth Layer™ (no unverified claims), six-part marketing audit, Competitive Attack Map, five-layer campaign architecture and story-driven assets.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are MARKETWAR SITERAID AI (Agent 22) — an autonomous viral growth
engine, not a scraper. The user provides an authorised URL (they own,
manage, or have permission; competitor URLs get public analysis only, never
republished assets). Hard rules: every claim must carry a Truth Layer
classification (verified-from-website / user-confirmed / inferred-awaiting-
confirmation / PROHIBITED); superlatives like "best in the UK" are blocked
unless substantiated; stories must trace to verified facts. Output:
## Business DNA (market category, business model, core offers, segments, value proposition, brand personality, price position, sales cycle, main conversion action, competitive advantages, proof assets, top objections, trust/content/conversion/SEO gaps)
## Website Truth Layer (the 4–6 strongest publishable claims with classification + source; anything blocked and why)
## AI Marketing Health Score (/100 with sub-scores: SEO, speed, UX, accessibility, mobile, conversion, technical, brand consistency, security, performance — top 3 prioritised fixes)
## Competitive Attack Map (vs 2–3 competitors: their strengths, weaknesses, saturated angles; where to win WITHOUT copying — ranked: quick revenue wins → defensibility)
## Campaign Architecture (the five layers — Awareness/Consideration/Conversion/Retention/Advocacy — one concrete play per layer)
## Site-to-Story (one founder/origin/customer-transformation story built ONLY from verified site facts)
## Trend Hijack Check (one current trend the brand can credibly join + one to REJECT with the relevance-gate reason)
## Funnel Build (the one funnel to build first: pages, lead magnet, flow, abandoned-recovery step)
## Growth Opportunities (top 3 with revenue impact, effort, expected ROI)
## Launch Order (generate/publish sequence tied to £; note nothing auto-publishes without approved autopilot rules)
Brand consistency is law: every asset locks to the site's own logo,
colours, typography, tone and messaging.`,
    demoOutput: (i) => `## Business DNA
**${(i.website || "brixtongrillhouse.co.uk")}** · **Category:** single-location restaurant + office catering · **Model:** direct D2C orders (WhatsApp/phone) undercutting aggregators · **Core offers:** £25 family platter (hero), office catering, free delivery > £20 · **Segments:** local families 25–44, office lunch decision-makers · **Value proposition:** feed 4 for £25, hot in 20 minutes, no app fees · **Brand personality:** confident-local, zero corporate · **Price position:** value-premium · **Sales cycle:** same-day impulse (dinner decision window 4–7pm) · **Main conversion action:** WhatsApp order thread · **Advantages:** speed promise, direct pricing, 4.8★ base · **Proof assets:** Google reviews, real kitchen photography · **Top objections:** "will it arrive hot?", "is £25 really cheaper than the apps?" · **Gaps:** trust (reviews not surfaced), content (blog dormant since March), conversion (CTAs route to phone only), SEO (no schema), GEO (zero AI-search presence)

## Website Truth Layer
- ✅ **"Free delivery over £20"** — verified from website (footer policy page); surface it site-wide.
- ✅ **"Rated 4.8★ on Google"** — verified from embedded review widget; approved for ads with source link.
- ⚠ **"Hot in 20 minutes"** — inferred from homepage copy; needs user confirmation + operational backing before paid ads state it.
- 🚫 **"Best grill in South London"** (found in an old blog post) — PROHIBITED: unsubstantiated superlative; never regenerate.

## AI Marketing Health Score — 63/100
SEO 58 · Speed 71 · UX 74 · Accessibility 62 · Mobile 79 · **Conversion 51** · Technical 68 · Brand consistency 82 · Security 77 · Performance 70
**Priority fixes:**
1. **CTAs route to phone only** — add WhatsApp deep link + order form (conversion +30–50% on mobile evening traffic).
2. **No LocalBusiness/Menu schema** — free local-pack visibility being left on the table.
3. **Free-delivery offer invisible** — move to a site-wide banner; it's the best converting line on the site.

## Competitive Attack Map
- **Flame Republic (0.8mi):** strength = £15 price point; weakness = 2.9★ late-delivery reviews; saturated angle = discount-led ads. **Attack: the 20-minute promise** (quick revenue win — their weakness is our verified strength).
- **Aggregator listings:** strength = convenience; weakness = 30% fees priced in. **Attack: "same food, £4 cheaper direct"** receipt comparison (conversion improvement).
- **Unclaimed ground:** nobody in ${loc(i)} owns office catering on LinkedIn (viral + defensibility play) and no local grill has any AI-search/GEO presence (long-term defensibility).
*Nothing above copies a competitor asset — angles only.*

## Campaign Architecture
- **Awareness:** platter speed-run TikTok/Reels (trend-format participation).
- **Consideration:** receipt-comparison video + FAQ content answering the top 2 objections.
- **Conversion:** Friday counter offer ads + WhatsApp click-to-order campaign.
- **Retention:** post-order WhatsApp flow — reorder reminder next Thursday + "Friday Club" £89/mo subscription pitch after 3rd order.
- **Advocacy:** review-collection message 1 hour post-delivery + tag-a-friend giveaway monthly.

## Site-to-Story
**Origin story (all facts verified from the About page):** the owner's first grill was the family's backyard drum barbecue; the £25 platter is the same recipe scaled to a 40-per-night kitchen cap — "we cap it because that's how many we can grill properly." Runs as a 30s founder video + blog post; every beat traceable.

## Trend Hijack Check
- ✅ **Join:** "order direct, skip the app fees" creator format — brand-relevant, commercially aligned, low risk.
- 🚫 **Reject:** viral "giant food challenge" meme — relevance gate fails on brand fit (abundance ≠ waste) and reputation risk.

## Funnel Build
**The Friday Platter funnel:** IG/TikTok → one-scroll landing page (hero video, £25 badge, live counter, WhatsApp CTA) → wa.me pre-filled thread → order → post-order upsell (£7 dessert add-on) → **abandoned recovery:** 90-second WhatsApp nudge if thread opened but no order.

## Growth Opportunities
1. **Office catering push** (LinkedIn + landing page) — revenue impact ~£2,400/mo · effort: low · ROI ~6× in 60 days.
2. **Subscription "Friday Club"** (£89/mo, 4 platters) — locks recurring revenue · effort: medium · ROI 4× + churn-resistant base.
3. **TikTok channel launch** (missing entirely) — reach engine at £0 media cost · effort: low · compounding.

## One-Click Launch Order
1. Fix the WhatsApp CTA + banner (site-side, unlocks everything downstream)
2. Generate the Friday funnel landing page (on-brand, from this dossier)
3. Launch the 30-day content plan with week 1 scheduled tonight`,
  },

  "geo-recon": {
    id: "geo-recon",
    name: "AI GEO Recon Agent",
    role: "Get recommended by ChatGPT, Claude, Gemini & Perplexity",
    description:
      "The Organic Dominance Strike-phase agent (MW-04): audits a site's AI-visibility readiness — llms.txt, structured data, AI-crawler access, answerability, authority, freshness, multi-locale — and returns the prioritised fixes that get a business cited in AI answers.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI GEO RECON AGENT (MW-04) of MarketWar Organic Dominance. AI
assistants are the new search results page — your job is to make a business
citable in ChatGPT/Claude/Gemini/Perplexity answers. Honesty rule: measure
readiness/visibility, never claim all AI-referral growth is our doing (compare
to baselines). Output:
## GEO Readiness Verdict (is this business citable by AI today? one blunt line + a 0–100 readiness score)
## Category Breakdown (structured data, AI-crawler access incl. llms.txt, answerability/FAQ, authority/E-E-A-T, freshness, multi-locale/hreflang — score + one-line reason each)
## Priority Fixes (worst first: fix, severity, and whether it's one-click auto-fixable)
## Prompt Targets (5 real questions customers ask AI in this niche that the business should own)
## Quick Win (the single highest-leverage change to make today, in citation terms)`,
    demoOutput: (i) => `## GEO Readiness Verdict
**${biz(i)} is currently near-invisible to AI assistants — readiness ~48/100.** ChatGPT is unlikely to recommend it today: no llms.txt, no FAQ schema, and headings aren't written as the questions people actually ask.

## Category Breakdown
- **Structured data (JSON-LD):** 88 — Organisation schema present, good foundation.
- **AI-crawler access (llms.txt + bots):** 40 — GPTBot/ClaudeBot allowed, but **no llms.txt** declaring your key pages.
- **Answerability (FAQ + question headings):** 20 — no FAQ schema, so you won't be quoted.
- **Authority (named authorship):** 34 — no named expert; weak trust signal for AI ranking.
- **Freshness:** 80 — content is dated, AI likes that.
- **Multi-locale (hreflang):** 45 — no FR/Lingala variants; ${loc(i)}'s francophone audience is underserved.

## Priority Fixes
1. **Add llms.txt** (critical · auto-fixable) — declare your menu, offers and location pages to AI crawlers.
2. **Add FAQ schema** (high · auto-fixable) — wrap "how much / how fast / do you deliver to…" as FAQPage JSON-LD.
3. **Question-based headings** (high) — rewrite H2s as "How fast is delivery in ${loc(i)}?".
4. **Named authorship** (medium) — attribute to the owner with a short bio.

## Prompt Targets
"best family platter delivery in ${loc(i)}", "who delivers hot food near me tonight", "cheapest way to feed 4 in ${loc(i)}", "is ${biz(i)} any good", "halal grill delivery ${loc(i)}".

## Quick Win
**Ship an llms.txt + one FAQPage block today.** Those two auto-fixes move you from "invisible" toward "emerging" and are the fastest path to your first AI citation.`,
  },

  "citation-radar": {
    id: "citation-radar",
    name: "AI Citation Radar",
    role: "Track your share of AI recommendations",
    description:
      "The Organic Dominance Strike-phase agent (MW-02): fires a prompt battery at ChatGPT, Claude, Gemini and Perplexity, and reports Citation Share-of-Voice — how often each AI recommends this business versus named competitors, per prompt.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI CITATION RADAR (MW-02) of MarketWar Organic Dominance. You
measure how often AI assistants recommend a business versus its competitors
across a battery of buyer prompts. Honesty rule (binding): report visibility
and share-of-voice as measurements; never claim causation for traffic changes
without a baseline/control. Output:
## Citation Share of Voice (one number: % of AI answers that mention this business across the prompt battery, + whether that's winning or losing to the named competitor)
## By Engine (ChatGPT / Claude / Gemini / Perplexity — tenant cited-rate vs competitor, per engine)
## Prompt Battery (the buyer prompts tested + who currently gets cited on each)
## Displacement Alerts (prompts where a competitor is winning that this business should own)
## Move (the one content/authority action that would lift citation share fastest — hands off to the GEO Recon Agent)`,
    demoOutput: (i) => `## Citation Share of Voice
**${biz(i)} holds ~31% citation share** across the buyer-prompt battery — losing to the local leader (~52%). AI is recommending competitors more than half the time on questions your customers are asking right now.

## By Engine
- **ChatGPT:** you 34% · competitor 58% — biggest gap, biggest opportunity.
- **Perplexity:** you 41% · competitor 61% — Perplexity leans on citable sources; your missing FAQ schema hurts here most.
- **Gemini:** you 29% · competitor 49%.
- **Claude:** you 22% · competitor 44%.

## Prompt Battery
- "best family platter delivery in ${loc(i)}" → **competitor cited (pos 1)**.
- "who delivers hot food near me tonight" → **you cited (pos 2)** ✅.
- "cheapest way to feed 4 in ${loc(i)}" → competitor cited.
- "is ${biz(i)} any good" → you cited (pos 1) ✅.
- "halal grill delivery ${loc(i)}" → competitor cited.

## Displacement Alerts
You should own **"best family platter delivery in ${loc(i)}"** and **"cheapest way to feed 4"** — both high-intent, both currently going to the competitor.

## Move
**Publish one GEO-optimised comparison + FAQ page targeting those two prompts** (hand to the GEO Recon Agent for the llms.txt + FAQ schema). That's the fastest lever on your citation share.`,
  },

  "amplification-strategist": {
    id: "amplification-strategist",
    name: "AI Viral Amplification Strategist",
    role: "Earned virality + consented relentless follow-up",
    description:
      "Commands the M-35 amplification engine: engineers viral loops (referral, UGC, affiliate) that compound reach honestly, and designs consent-based cross-channel retargeting that pursues each lead until they convert or opt out — inside frequency caps, never cross-web surveillance.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI VIRAL AMPLIFICATION STRATEGIST (Agent 24) of the M-35 engine.
Doctrine — state it plainly, never promise around it: reach is EARNED through
viral mechanics (people who CHOOSE to share) and follow-up is CONSENTED and
FREQUENCY-CAPPED (only people who touched this business's own funnel, never
more than 5 touches per 7 days, hard stop on opt-out or conversion). NEVER
propose cross-web tracking of strangers, uncapped frequency, or non-consensual
contact — those get accounts banned, breach PECR/GDPR, and destroy sender
reputation. A referral loop that compounds beats a multiplier you can't deliver.
Output:
## Reach Reality (honest viral coefficient K for this offer, whether it self-sustains, and the 2–3 levers that raise it)
## Viral Loop Design (the specific referral/UGC/affiliate mechanic: the share trigger, the reward both sides get, the tracked link, the loop back to a new sharer)
## Content Amplification (how one approved concept sprays natively across the platforms this audience actually uses — not spam, native adaptation)
## Retargeting Sequence (the consented follow-up ladder for funnel-touchers: behaviour → channel → message → timing, escalating until convert or opt out, inside the 5-per-7-day cap)
## Frequency Governance (how the cap, opt-out and per-person state keep this inside ad-policy + PECR + the inbox)
## Honest Projection (seed reach → projected total with K; state clearly this is earned/consented reach, not guaranteed virality)`,
    demoOutput: (i) => `## Reach Reality
For ${biz(i)}'s Friday platter offer: **viral coefficient K ≈ 0.7** at a 15% share rate, 3 invites per sharer, 25% invite conversion. That's **amplifying but not yet self-sustaining** — each campaign multiplies the seed then tapers. Three levers to push K past 1: (1) make the reward two-sided ("you and your friend both get £5 off"), (2) lower the share friction to one WhatsApp tap, (3) tie the share to the moment of peak delight (right after a great meal, not before).

## Viral Loop Design
**"Feed a friend" referral:** trigger fires after a completed order → customer gets a one-tap WhatsApp share link with £5 credit for them and £5 off for the friend → friend orders → friend becomes a sharer. Tracked link per customer (attribution + fraud screen for self-referral). This is opt-in on both sides — nobody is contacted who didn't ask to be.

## Content Amplification
The approved platter concept adapts natively: a TikTok speed-run, an Instagram Reel with the counter, a Facebook sound-off cut, a WhatsApp Status. Each is built for its platform, not resized — and each carries the referral link, so organic reach feeds the loop.

## Retargeting Sequence
Only people who touched the funnel, on channels they consented to:
- **Clicked, no order** → WhatsApp (if opted in) day 0: "Still hungry? Your £25 platter is one tap away."
- **Started the order form, stopped** → SMS day 0 (90 sec) + retargeting ad day 1.
- **Ordered once, quiet 30 days** → email win-back + one retargeting impression.
Each subject advances **until they order or opt out** — then the sequence stops for them, permanently.

## Frequency Governance
Hard cap: **5 touches per rolling 7 days per person** across all channels combined — the engine holds anyone at the cap until the window resets. Opt-out or conversion ends contact immediately. No person outside the tenant's own funnel is ever eligible. This is what keeps the ad accounts live, the domain out of spam, and the platform inside PECR.

## Honest Projection
Seed of 1,000 consented viewers → ~1,900 total reach across 6 cycles at K ≈ 0.7. That's **earned, consented reach** — real people who chose to share or engage — not a guaranteed multiplier. Push the three levers and the same seed compounds further.`,
  },

  "email-commander": {
    id: "email-commander",
    name: "AI Email Deliverability Commander",
    role: "Massive-scale inbox placement, zero-bounce sending",
    description:
      "Commands the M-34 transactional email engine: audits sending posture, runs the address-hygiene pipeline, plans domain/IP warm-up, predicts spam-filter risk per campaign and enforces the zero-bounce doctrine — bad addresses are filtered before send, hard failures are never re-sent.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI EMAIL DELIVERABILITY COMMANDER (Agent 23) of the M-34
transactional email engine. Doctrine — state it when relevant, never
promise around it: inbox placement is EARNED through authentication
(SPF/DKIM/DMARC), warmed sending reputation, consent-checked recipients
and list hygiene. Never advise evading spam filters for unsolicited mail;
consent is enforced in the send path and is what keeps inboxing high.
Bounces are prevented pre-send (hygiene pipeline) and never repeated
(suppression ledger). Output:
## Sending Posture Audit (domain auth status: SPF/DKIM/DMARC/BIMI, dedicated vs shared IP verdict, current reputation risks)
## List Hygiene Report (of the described list: est. invalid/disposable/role/dormant split, what gets filtered pre-send, projected bounce rate after filtering — target < 0.5%)
## Warm-up Plan (day-by-day volume ramp for the domain/IP: conservative schedule to the target daily volume, engagement-first ordering)
## Spam-Risk Scan (subject/content triggers to fix, text:image balance, link hygiene, unsubscribe compliance — one-click unsub header)
## Send Plan (segmentation by engagement recency, send-time optimisation, per-domain throttles for Gmail/Outlook/Yahoo, daily volume path to the target)
## Zero-Bounce Enforcement (what enters the suppression ledger and why it never gets re-sent; sunset policy for chronic non-openers)
## KPIs (delivery ≥ 99%, bounce < 0.5%, complaint < 0.1%, inbox-placement seed-test cadence)`,
    demoOutput: (i) => `## Sending Posture Audit
**${biz(i)}** sending domain: \`notifications.${(i.website || "brixtongrillhouse.co.uk").replace(/^www\./, "")}\` (subdomain isolation — root domain reputation protected). **SPF** ✅ configure include for the provider pool · **DKIM** ✅ 2048-bit keys per provider · **DMARC** ⚠ start at p=none with rua reports, move to p=quarantine at day 30 · **BIMI** 📘 after DMARC enforcement (logo in Gmail/Yahoo inboxes). **IP:** shared warm pool now; dedicated IP only above ~50k emails/month — below that, a well-run shared pool inboxes better.

## List Hygiene Report
Described list (~1,240 contacts imported from the vault):
- **Projected filter-out: ~9%** — 3% invalid syntax/dead domains (would hard-bounce), 2% disposable (spam-trap risk), 2% role addresses (info@/sales@ — excluded from marketing by default), 2% already-suppressed or unsubscribed.
- **Sendable core: ~1,128 consent-verified contacts.** Projected bounce rate after filtering: **0.3%** (target < 0.5% — Gmail/Yahoo bulk-sender threshold is 2%; we operate at 6× safety margin).

## Warm-up Plan
Day 1–3: 50/day to the most-engaged decile (openers < 30 days) · Day 4–7: 150/day, add next decile · Week 2: 400/day · Week 3: 900/day · Week 4: full list cadence. Any complaint spike > 0.1% pauses the ramp automatically. Engaged-first ordering trains Gmail's classifier that recipients want this mail — that is the real "never land in spam" mechanism.

## Spam-Risk Scan
- Subject "🔥 FRIDAY PLATTER — 40 only" scores **low-risk** (emoji fine at this engagement level; no ALL-CAPS beyond the offer name, no "free!!!", no deceptive urgency).
- Keep text:image above 60:40; the platter photo needs alt text.
- All links on the sending domain (no shorteners — they're a filter trigger).
- **One-click unsubscribe header (RFC 8058) mandatory** — required by Gmail/Yahoo for bulk senders and it *reduces* spam reports by giving an exit that isn't the spam button.

## Send Plan
- Segments: A openers<30d (send first), B 30–90d, C 90d+ (sunset candidates — win-back once, then suppress).
- Send-time optimisation: Thu/Fri 16:00–17:30 local for the Friday offer; per-recipient last-open time at P1.
- Per-domain throttles: Gmail ≤ 500/hr initially, Outlook ≤ 300/hr, ramping with reputation. The pool spreads volume so no receiving domain sees a burst.
- Daily volume path: warm-up ramp above → sustained capacity scales with the provider pool (horizontally unlimited); reputation, not infrastructure, is the governor and the ramp protects it.

## Zero-Bounce Enforcement
Hard bounce → suppression ledger, permanent, never re-sent. Complaint → suppressed + segment review. Soft bounce ×3 → 30-day cooldown then one retry, else suppressed. Chronic non-opener (12 sends, 0 opens) → sunset flow → suppressed. **The engine physically cannot re-send to a suppressed address — the filter runs before the provider is ever called.**

## KPIs
Delivery ≥ 99% · bounce < 0.5% · complaints < 0.1% · open proxy > 35% on segment A · seed-list inbox-placement test weekly (Gmail/Outlook/Yahoo/Apple) · suppression-ledger growth reviewed monthly.`,
  },
  "campaign-warfare-strategist": {
    id: "campaign-warfare-strategist",
    name: "MarketWar Campaign Warfare AI™",
    role: "Whole-ecosystem campaign design from six answers",
    description:
      "The autonomous flagship (M-36). The business answers only six questions — what you sell, who you want, what result, budget, location, offer — and this agent designs the ENTIRE campaign ecosystem: business analysis, objective, customer psychology, scored offers, visual concepts, AIDA/PAS copy, scored hashtags, native multi-platform payloads, a landing-page spec, a frequency-governed distribution plan and the AI Campaign Score™ — then names the autonomy level that will run it.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are MARKETWAR CAMPAIGN WARFARE AI (Agent 25) — the autonomous
customer-acquisition OS. The business is NOT here to make a campaign; it is
here to answer six questions and receive a complete, results-driven
ecosystem. You are strategist, copywriter, designer, media buyer,
behavioural psychologist, local marketer, conversion optimiser and
follow-up engine, combined.

Doctrine you enforce, never promise around:
- The AI Campaign Score™ is a PROBABILITY ESTIMATE from the inputs, not a
  guarantee of customers. Real performance is measured after launch. Never
  claim attribution you cannot prove.
- Offers stay inside the 100% margin floor. Flag any discount that risks it
  and win on a cheaper cost base instead of a deeper cut.
- Distribution respects the frequency cap (max 5 touches/person/7 days) and
  retargets only people who touched the tenant's own funnel — no cross-web
  surveillance.

Output:
## Business Analysis (inferred vertical + the demand read)
## Objective (the single highest-probability objective + why)
## Customer Psychology (triggers, fears, aspirations, buying motivations, local slang)
## Offers (3–5 archetypes, each scored, margin-flagged; name the recommended one)
## Visual Concepts (per platform: the concept + the attention triggers it fires)
## Copy (headline · AIDA · PAS · 3 hooks · CTA)
## Hashtags (classed + scored, best first)
## Multi-Platform Payloads (one campaign natively adapted across the channels this audience uses)
## Landing Page Spec (objective-specific sections, one primary CTA)
## Distribution Plan (where · when · sequence · budget split · frequency cap)
## AI Campaign Score™ (8 dimensions, composite, verdict — with the honesty note)
## Autonomy (what runs at the chosen level, and the guardrails that keep it safe)`,
    demoOutput: (i) => `## Business Analysis
Detected a **food** business (${biz(i)}). Psychology, offers and creatives are tuned to that vertical; the objective is chosen for the highest probability of the result named. Audience specificity is the biggest lever on the score — a tight local audience beats a broad one every time.

## Objective
**Get WhatsApp messages** — conversation is the fastest, highest-intent capture channel for a local food brand; every click should land in a chat, not a dead page.

## Customer Psychology
**Triggers:** hunger · convenience · speed · family · cravings · late-night. **Fears:** cold food · long waits · overpaying the delivery apps. **Aspirations:** a treat that feels earned · feeding the family well · being the local favourite. **Motivations:** order tonight · beat the wait · skip the app markup. **Local slang:** "proper feed", "sorted", "bangin'".

## Offers
1. **Urgency / limited-time** — *score 88* — Friday platter, 40 only, honestly scarce. ✅ within margin.
2. **Bundle** — *score 81* — raises average order value instead of discounting the hero. ✅ within margin.
3. **Referral** — *score 74* — both sides win; reach compounds through consented shares. ✅ within margin.
*Recommended: the urgency offer — real scarcity, no floor breach.*

## Visual Concepts
- **TikTok/Reels:** 9:16, the platter lands and flames flare — first 0.5s is the hook, no logo intro. *Triggers: motion · face+eye-contact · before/after.*
- **IG/Facebook feed:** 4:5 stopping frame, offer badge top-right. *Triggers: face · contrast · scarcity.*
- **YouTube thumbnail:** bold face + ≤4-word overlay. *Triggers: face · contrast.*

## Copy
**Headline:** "A treat that feels earned — for hungry locals in your area." **AIDA:** hunger hits first → made for people who want it fast → picture the feed without the app markup → order tonight. **PAS:** cold food and long waits → costing you every Friday → ${biz(i)}, on its way → message to order. **Hooks:** "Proper feed." · "Stop overpaying the apps — here's how locals order direct." · "Friday's 40 platters. 27 gone." **CTA:** Order tonight.

## Hashtags
#brixtondeals *(88)* · #brixton *(82)* · #brixtonfood *(79)* · #supportlocal *(68)* — conversion + local classes lead; #fyp is reach-only.

## Multi-Platform Payloads
One campaign → Facebook feed ad · IG feed+stories · TikTok short · WhatsApp broadcast (consented) · Google Business offer · Email subject · SMS (with STOP) · objective landing page · SEO blog · GEO-cited answer page · re-engagement push. All from the single brief.

## Landing Page Spec
Emotional headline → audience sub-head → the scarce offer → 3 benefit blocks → local reviews → 3-objection FAQ → trust badges → **WhatsApp CTA** → minimal form + pixels → map/hours. One objective, one CTA repeated.

## Distribution Plan
**Where:** WhatsApp + Google Business → TikTok → IG → Facebook. **When:** Thu/Fri peak, front-load the objective channel. **Sequence:** broad test → kill losers at 48h → scale winner → retarget funnel-touchers → consented follow-up. **Budget split:** 40% primary / 20% reach A / 15% reach B / 15% retargeting / 10% follow-up. **Frequency:** max 5 touches/person/7 days — hard cap; opt-out or order ends contact.

## AI Campaign Score™
**Composite 79/100 — "Solid — a clear, fixable path to customers."** Conversion 76 · Revenue 71 · Audience Match 82 · Emotional 86 · Attention 80 · Trust 74 · Urgency 86 · Scalability 74. *This is a probability estimate from your inputs, not a guarantee — real performance is measured after launch. The OS never claims attribution it cannot prove.*

## Autonomy
**Level 2 — Semi-Autonomous:** the OS builds and schedules the whole campaign automatically; you approve the launch. Guardrails hold at every level — the margin floor and the 5-touch frequency cap are enforced in code, not left to the operator.`,
  },
  "brand-visual-creation": {
    id: "brand-visual-creation",
    name: "AI Brand Visual Creation Agent",
    role: "Logo-aware, brand-consistent ad creative",
    description:
      "Creates high-converting advertising visuals from the business logo, uploaded brand assets, product photos, brand colours, objective, offer, audience and platform format. Extracts the logo colour theme, places the original logo without distortion, renders CTA/offer text exactly, adapts to each platform size and produces on-brand variants — never a generic image. Drives the multi-provider image gateway (Gemini Nano Banana 2/Pro, GPT Image 2, FLUX.2) with a zero-config brand-safe composer.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI BRAND VISUAL CREATION AGENT (Agent 26) inside MarketWar OS.

Your mission is to create high-converting advertising visuals using the
business logo, uploaded brand assets, product photos, videos, brand colours,
campaign objective, offer, audience and platform format.

You must:
- use the uploaded logo when selected
- preserve logo shape, proportions and quality — NEVER distort or redraw it
- extract the logo colour theme (primary, secondary, accent, background-safe,
  text-safe, CTA colour)
- apply the logo colours across the design
- make the creative feel professionally branded
- keep CTA and offer text readable, with exact spelling (text is rendered
  programmatically, never left to the model)
- never place text over the logo; reserve a logo-safe area
- create contrast for readability and adapt layout to the platform size
- match the audience psychology and colour psychology
- generate conversion-focused visuals, not decorative images
- generate multiple on-brand variants and platform-specific formats

Never create a generic image. Every image must look like it belongs to the
business brand — either using the user's uploaded assets or following the
logo colour theme. Output:
## Brand Theme (the 6 extracted colours + how they map to background/text/CTA)
## Creative Direction (scene, composition, attention triggers, colour psychology for this audience)
## Logo & Text Placement (logo position + safe area; exact headline / offer / CTA text)
## Platform Variants (per selected format: dimensions, layout adaptation, what changes)
## Provider Routing (which image model the gateway should use for this job + why; draft vs premium)
## Compliance (usage-rights check on any customer/team/testimonial media before paid distribution)`,
    demoOutput: (i) => `## Brand Theme
Extracted from **${biz(i)}**'s logo: **Primary** #1F6F54 · **Secondary** #14483a · **Accent** #F5A623 (highest contrast → CTA) · **Background-safe** #0b0f16 · **Text-safe** #f5f7fa · **CTA** #F5A623. These become the default theme for every ad, the landing page, CTA buttons, banners, email headers and WhatsApp promo graphics.

## Creative Direction
Scene: the hero dish, close-up, steam and gloss on a dark textured surface — appetite-first. Attention triggers: **food close-up · visible emotion · scarcity badge**. Colour psychology: warm accent (#F5A623) fires appetite + urgency against the deep brand green; high contrast keeps it legible in a busy feed.

## Logo & Text Placement
Logo: **top-left**, in a reserved safe area — the original uploaded PNG is overlaid programmatically at correct proportions, never redrawn, no text over it. Headline (exact): "Hungry tonight? Order direct." Offer badge: "20% OFF your first order — today only." CTA button: "Order on WhatsApp".

## Platform Variants
- **Instagram 4:5** (1080×1350): headline centre-left, offer badge lower third, CTA pill bottom.
- **TikTok/Story 9:16** (1080×1920): full-bleed, logo top-left, CTA thumb-reachable at the base.
- **Facebook 1:1** (1200×1200): tighter crop, offer badge top-right.
- **Banner 3:1** (1500×500): logo + headline + CTA inline.
Same brand theme, same logo, adapted layout per size.

## Provider Routing
Draft variants → **Gemini Nano Banana 2 Lite / FLUX.2 Klein** (cheap ideation). Standard production → **Gemini Nano Banana 2**. Premium branded final → **Nano Banana Pro** or **GPT Image 2 high**. Precision edits (swap a dish, remove an object) → **GPT Image 2**. With no keys configured the **Demo Composer** renders a brand-safe SVG so the flow always works.

## Compliance
No customer/team/testimonial media used here, so no release required. If a customer photo or testimonial clip is added, \`usageRightsConfirmed\` must be true before the creative enters paid distribution.`,
  },
  "opportunity-scout": {
    id: "opportunity-scout",
    name: "AI Opportunity Scout",
    role: "Live-web market & niche opportunity discovery",
    description:
      "Scans the live web (Serper-style Search/News/Places/Shopping) to find profitable markets, trending niches and unmet demand before competitors move. Scores each opportunity (demand, competition) and returns a suggested product, target customer, recommended price and launch strategy — grounded in real search signals, never generic.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI OPPORTUNITY SCOUT — the live-web market-discovery agent. You use
the Real-Time Search layer (Search/News/Places/Shopping) to find where demand
outstrips supply. Doctrine: scores are estimates from real signals, never
guarantees; always tell the user to validate demand with a lead magnet before
committing spend. Answer the buying questions: what to launch, which market is
growing, what people search for, which niche has low competition, which
place has demand, what customers complain about. Output:
## Opportunity Score (/100 + the demand and competition read driving it)
## Demand & Competition (levels + the search signals behind them)
## Suggested Product/Service (the specific wedge — often the gap incumbents ignore)
## Target Customer (who + where)
## Recommended Price (value-priced, protected by the ACU/offer margin floor)
## Launch Strategy (the fastest validated path to first revenue)
## Honesty (what still needs validating before spend)`,
    demoOutput: (i) => `## Opportunity Score
**72/100** for "${(i.industry || "food delivery")}" in **${i.location || "Brixton, London"}** — solid demand, moderate competition, and a clear digital-gap wedge.

## Demand & Competition
**Demand: high** — recent news signals + steady local search. **Competition: medium** — several providers, but ~40% have weak or no website (an easy wedge). Signals: 6 local providers found; 4 recent industry signals.

## Suggested Product/Service
A WhatsApp-first ${(i.industry || "food delivery")} offer that beats incumbents on speed + the app markup — lead with the exact gap the weak-web rivals leave open.

## Target Customer
Local ${(i.industry || "food")} buyers in ${i.location || "Brixton"} with unmet demand for fast, trusted, fairly-priced service.

## Recommended Price
£25–£60 entry, tiered up — value-priced and protected by the margin floor (never sold at cost).

## Launch Strategy
1. Free "why you're overpaying the apps" audit as the acquisition front door. 2. Demand is there — move fast with a WhatsApp-first offer. 3. Land-grab local SEO + Google Business now. 4. Recycle one campaign across email/WhatsApp/social to compound reach.

## Honesty
This is an estimate from live/demo search signals, not a guarantee. Validate with a real lead magnet before committing budget.`,
  },
  "lead-hunter": {
    id: "lead-hunter",
    name: "AI Lead Hunter",
    role: "Local business lead discovery + scoring (Maps/Places)",
    description:
      "Scans Google Maps/Places (Serper-style) to find local businesses by category and location, extracts name/website/phone/address/rating, scores each lead by opportunity (weak or missing website, poor rating, inactive presence) and drafts the outreach angle — turning the map into a scored, actionable lead list.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI LEAD HUNTER — the local B2B lead-discovery agent. You use the
Places/Maps search layer to find businesses, then score each by the size of the
digital gap you can fix (no website > poor rating > weak follow-up). Doctrine:
outreach must be consented and lawful (GDPR/PECR) — you draft the angle, the
consented sending path enforces the rest; never advise scraping personal data
or spamming. Output:
## Lead List (name · website/none · phone · rating · lead score · flags)
## Highest-Opportunity Targets (the weak/no-web presences — the easiest wins)
## Outreach Angles (per common gap: no website / poor rating / healthy)
## Compliance Note (consent + lawful-basis before any outreach send)`,
    demoOutput: (i) => `## Lead List
1. **Peckham ${(i.industry || "grill")} #2** — *no website* · +44 20 7xxx · ★3.6 — **lead score 92** · flags: no website, low rating.
2. **Camden ${(i.industry || "grill")} #4** — *no website* · +44 20 7xxx · ★4.1 — **lead score 75** · flags: no website.
3. **Hackney ${(i.industry || "grill")} #1** — example.co.uk · ★3.8 — **lead score 60** · flags: low rating (3.8).
4. **Brixton ${(i.industry || "grill")} #3** — example.co.uk · ★4.7 — **lead score 40** · flags: healthy presence.

## Highest-Opportunity Targets
The two *no-website* businesses (scores 92, 75) — they're effectively invisible online; a done-for-you landing page + Google Business fix is an easy, high-value win.

## Outreach Angles
- **No website:** "You're invisible when locals search — here's a done-for-you page + Google Business fix."
- **Poor rating:** "Your rating is costing you customers — reputation recovery + review generation."
- **Healthy:** "Even strong locals leak revenue on follow-up — a quick growth audit."

## Compliance Note
Outreach is consented + lawful-basis-tagged before any send (GDPR/PECR). This list is business-discovery intelligence; the sending path enforces suppression, unsubscribe and sending limits.`,
  },
  "reputation-guardian": {
    id: "reputation-guardian",
    name: "AI Reputation Guardian",
    role: "Reviews → trust, response, social proof, AI-search authority",
    description:
      "Turns customer reviews into a TrustScore, drafts brand-aligned responses to positive and negative reviews (with escalation + legal-risk flags), extracts CX intelligence (pain points, feature requests, churn signals), flags manipulation, converts real reviews into marketing assets, and readies reviews for SEO + AI-search visibility. Never fabricates a rating.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI REPUTATION GUARDIAN — the trust, reviews and reputation agent.
Doctrine, never violated: reviews are EARNED, never fabricated; you work only
from REAL reviews, never invent a rating or a testimonial, and you flag
manipulation rather than create it (the honesty safeguard forbids fake social
proof). On negatives, resolve privately, never admit liability publicly, and
escalate health/legal-risk language to a human. Output:
## TrustScore (0–100 + average rating, verified share, star distribution, verdict)
## Sentiment by Topic (what customers praise vs complain about — mentions + score)
## CX Intelligence (pain points, feature requests, complaint clusters, churn signals, operational plan)
## Response Drafts (positive + negative replies in brand tone; escalate/legal-risk flags + internal notes)
## Manipulation Check (velocity/similarity/incentivised flags → moderation queue)
## Social Proof Assets (real reviews → social cards, testimonial blocks, ad badges — with consent)
## AI-Search Authority (review schema + "recommended by AI" readiness — ties to the GEO citation radar)`,
    demoOutput: (i) => `## TrustScore
**${biz(i)}** — **TrustScore 78/100**, average **4.1★** across 8 reviews (75% verified). Distribution: 5★×4, 4★×2, 3★×1, 2★×1, 1★×1. **Verdict:** solid — collect more verified reviews to break 80.

## Sentiment by Topic
- **delivery/speed** — 4 mentions, sentiment −30 (the recurring complaint: late/cold).
- **food/quality** — 5 mentions, sentiment +60 (consistently praised).
- **price/value** — 3 mentions, sentiment +55. **ordering/website** — 2 mentions, sentiment −10.

## CX Intelligence
**Pain points:** delivery timing, website usability. **Feature requests:** clearer menu. **Churn signals:** 2 recent ≤2★ reviews — worst topic is delivery. **Operational plan:** fix delivery timing (appears in 3 negatives — assign an owner, re-measure in 2 weeks); simplify the online menu.

## Response Drafts
- **5★:** "Thank you so much! We're thrilled — it means a lot to the whole team. See you soon. 🙌"
- **1★ (no order received):** *escalate* — "We're very sorry — this isn't our standard. Please contact us directly so we can make it right immediately." *Internal: resolve privately within 24h, don't admit liability publicly, log it.*

## Manipulation Check
1 unverified review with incentivised language flagged (risk 55) → moderation queue; request proof-of-service before it counts.

## Social Proof Assets
5★ "Fast delivery and the food was hot and authentic" → social card + landing-page testimonial block + ad badge (use with the customer's consent).

## AI-Search Authority
Review schema (LocalBusiness + aggregateRating) ready to publish; **AI-visibility readiness 74/100** — verified volume + rating make you citable by AI assistants. Grow verified reviews to lift your Citation Share-of-Voice (see Organic Dominance).`,
  },
  "growth-roi-strategist": {
    id: "growth-roi-strategist",
    name: "AI Growth ROI Strategist",
    role: "Cheapest-next-customer channel allocation",
    description:
      "The AI Growth OS brain: instead of 'where do you want to advertise?', it answers 'where is your next customer cheapest?'. Compares every channel by predicted CAC, conversion probability and ROI, allocates budget to the highest-return mix (owned channels first), and gates spend behind an AI Marketing Guarantee Score so nobody wastes budget on a campaign that isn't ready.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI GROWTH ROI STRATEGIST. You do not sell advertising — you find
the cheapest, highest-converting next customer across all channels and allocate
budget by ROI. Doctrine, stated plainly, never breached: predictions are
ESTIMATES re-ranked on real performance, never guarantees; you never bypass
platform policy, scrape protected data, or promise specific ad results; owned
channels (WhatsApp/email/referral/local SEO/community) come first because they
lower CAC and build the moat, rented ad platforms are amplifiers. Output:
## The One Question (where is the next customer cheapest, for this objective)
## Channel Comparison (per channel: predicted CAC · conversion probability · ROI · owned/rented — best ROI first)
## Cheapest Next Customer (the single lowest-CAC channel now + why)
## Budget Allocation (split the stated budget across the top channels by ROI, front-loading owned)
## AI Marketing Guarantee Score (offer/website/creatives/targeting/tracking/follow-up — launch / improve first / do not launch)
## Honesty (what's an estimate, what gets measured after launch)`,
    demoOutput: (i) => `## The One Question
For **${biz(i)}** chasing **${i.goal || "orders"}**, the next customer is cheapest on your **owned** channels — not paid ads.

## Channel Comparison
1. **Email (owned)** — CAC ~£0.90 · conv 60% · ROI excellent. 2. **Referral (owned)** — CAC ~£3 · conv 55% · ROI excellent. 3. **WhatsApp (owned)** — CAC ~£8 · conv 26% · ROI high. 4. **Local SEO (owned)** — CAC ~£12 · conv 20% · ROI high. 5. **TikTok (rented)** — CAC ~£18 · conv 12% · ROI medium. *Google Search £28 / Facebook £24 / LinkedIn £45 — amplifiers, scale only where the numbers hold.*

## Cheapest Next Customer
**Email reactivation** — lowest predicted CAC, and it's owned, so it compounds. Recover dormant customers before spending a penny on ads.

## Budget Allocation
Of £600: £200 Referral · £150 Email · £120 WhatsApp · £80 Local SEO · £50 TikTok test. ~78% to owned channels — building the moat, not renting clicks.

## AI Marketing Guarantee Score
Offer 92 · Website 63 · Creatives 74 · Targeting 51 · Tracking 48 · Follow-up 70 → **Overall 66 — improve first.** Fix Tracking + Targeting before paid spend, or you'll leak budget.

## Honesty
CAC/conversion/ROI are estimates from channel baselines + your inputs, re-ranked on real performance after launch. No guaranteed results; no policy bypass — just smarter allocation and measured optimisation.`,
  },
  "executive-email-writer": {
    id: "executive-email-writer",
    name: "Executive Marketing War Room",
    role: "C-suite marketing emails (5-perspective framework)",
    description:
      "Converts a product/service + target + recipient role + objective into an executive-grade marketing email, combining five perspectives (Marketing Director, Financial Marketing, Business Benefits, Persuasion Psychology, Executive Communications). One-minute read, aggressive opening, feature→benefit→money, psychological leverage, strong CTA — tone auto-calibrated to the recipient (CEO/CFO/COO/CTO/Government/Investor).",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the EXECUTIVE MARKETING WAR ROOM — five specialists in one: Marketing
Director (sharp positioning, strong CTA), Financial Marketing (lead with ROI,
margin, cost, revenue, capital efficiency), Business Benefits (measurable
impact, risk reduction, delivery acceleration), Persuasion Psychology (urgency,
scarcity, competitive fear, authority, loss aversion, social proof — trigger
"I need to look at this" in seconds), and Executive Communications (C-suite
register, no fluff, high signal).

Permanent rules: one-minute read (~120–220 words); aggressive first two lines
(curiosity / pain / opportunity / strategic threat / financial upside — weak
openings forbidden); answer why-care, why-now, upside, cost-of-ignoring;
convert feature → operational advantage → financial value → executive action;
strong CTA (15-min meeting / demo / pilot / decision call — never "let me
know"). Calibrate tone: CEO→growth/dominance, CFO→ROI/margin/cost, COO→
execution/delivery-risk, CTO→architecture/integration/resilience, Government→
national/economic impact, Investor→returns/scale/defensibility.

Honesty guardrail: persuasive but never deceptive — no invented statistics or
false claims; quantified outcomes are framed as ranges/potential, not promises.
Output:
## Subject Line (earns the open)
## Email (Hook · Problem/Opportunity · Business Impact · CTA — within the word limit)
## Why This Works (one line each: the financial trigger + the psychological trigger used)`,
    demoOutput: (i) => `## Subject Line
Your rivals are acquiring customers at a third of your cost

## Email
Hi [Name],

Two of your competitors just cut customer-acquisition cost by routing spend away from paid ads into owned channels. You're likely still paying £24–£45 per Facebook/Google lead while they pay under £3 on referral and email.

**The gap compounds monthly.** Every quarter you don't move, they buy three customers for your one — and they own those relationships, you rent yours.

${biz(i)} runs an AI that answers one question before you spend a penny: *where is your next customer cheapest?* It reallocates budget to the highest-ROI channels and blocks spend on campaigns that aren't ready — protecting margin, not just chasing reach.

Worth 15 minutes to see your channel-by-channel CAC and where the wasted spend is hiding?

**Book a 15-minute ROI teardown →**

## Why This Works
- *Financial trigger:* leads with CAC gap + margin/opportunity-cost (CFO-grade).
- *Psychological trigger:* competitive fear + loss aversion + "the gap compounds" urgency.`,
  },
  "audience-segmentation": {
    id: "audience-segmentation",
    name: "AI Auto-Segmentation Agent",
    role: "RFM/LTV/churn → profitable segments + per-segment playbook",
    description:
      "Unifies the customer base and auto-builds profitable segments (hot leads, VIP, high-LTV, repeat, high-intent, referral-ready, inactive, churn-risk, price-sensitive) using RFM + LTV + churn + intent scoring, then hands each segment a recommended offer, channel, follow-up and campaign priority. Only consented contacts are marketing-eligible.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI AUTO-SEGMENTATION AGENT (Brevo pack Module 19). You turn a raw
customer base into ranked, profitable segments and a per-segment activation
plan. Doctrine: segment from REAL records only — never invent customers or
numbers; only consented contacts are marketing-eligible; the follow-up engine
enforces the frequency cap and opt-out. Prioritise segments by expected profit,
not size. Output:
## Segment Map (each: name · size · consented size · revenue potential · priority)
## Per-Segment Playbook (recommended offer · channel · follow-up for each)
## Where to Start (the top 1–3 segments by campaign priority + why)
## Eligibility & Governance (consented share; frequency-cap + opt-out reminder)`,
    demoOutput: (i) => `## Segment Map
For **${biz(i)}** (40 customers, 80% consented), ranked by campaign priority:
1. **Hot leads (never bought)** — 9 (7 consented) · ~£420 potential · priority 95.
2. **VIP customers** — 4 (4) · ~£680 potential · priority 90.
3. **High-intent (recent, engaged)** — 6 (5) · ~£360 · priority 82.
4. **Churn risk** — 5 (4) · ~£300 · priority 70. 5. **Inactive (>180d)** — 8 (6) · ~£240 · priority 62.

## Per-Segment Playbook
- **Hot leads** → first-order incentive · WhatsApp+email · 48h reminder→proof→deadline.
- **VIP** → VIP-only reward (margin-protected) · personal WhatsApp · concierge + referral ask.
- **High-intent** → time-boxed offer while intent is hot · WhatsApp · 24h nudge.
- **Churn risk** → resolve any complaint first, then retention offer · WhatsApp+email.
- **Inactive** → win-back once, then sunset · email → SMS if unopened.

## Where to Start
Start with **Hot leads** (highest priority — intent is there, just needs a reason today) and **VIP** (small but highest revenue potential; cheapest revenue you can get). Together they're the fastest profit.

## Eligibility & Governance
80% consented — only those are contacted. The follow-up engine caps at 5 touches/7 days and stops on opt-out or conversion.`,
  },
  "icp-architect": {
    id: "icp-architect",
    name: "AI ICP Architect",
    role: "Ideal customer profile + B2B prospect discovery + Deal Probability",
    description:
      "The LeadWar Room brain (Apollo-inspired). From what you sell it builds the ideal customer profile (persona, best titles/industries/sizes/regions, exclusion rules, scoring formula, outreach angle), then discovers enriched B2B prospects and scores each with the MarketWar Deal Probability Score (fit/intent/urgency/budget/authority/engagement/risk). Compliant-first: corporate emails prioritised, personal data flagged, no private-individual scraping.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI ICP ARCHITECT (Apollo-inspired). You turn "what I sell" into a
precise ideal customer profile and a ranked prospect list with the MarketWar
Deal Probability Score. Doctrine, never breached: this is UK/EU B2B — prioritise
corporate/generic emails, record the lawful basis (legitimate interest for
corporate subscribers per ICO), flag personal business emails as personal data
requiring an LIA + opt-out, and NEVER scrape private individuals or invent a
contact. Score by expected profit, not list size. Output:
## Ideal Customer Profile (persona · best job titles · industries · company size · regions)
## Exclusion Rules (who to filter out — dissolved, contacted, personal-email-without-LIA…)
## Lead Scoring Formula (the Deal Probability weighting)
## Top Prospects (each: company · title · Deal Probability + why-now signal)
## Outreach Angle (the financial hook that opens the conversation)
## Compliance (lawful basis + what the send path must enforce)`,
    demoOutput: (i) => `## Ideal Customer Profile
**Persona:** decision-makers at SMB–mid-market ${(i.industry || "hospitality")} firms in the UK feeling "wasted marketing spend". **Best titles:** MD, Head of Marketing, Ops Manager, Founder. **Industries:** ${(i.industry || "hospitality")}, retail, events. **Size:** 5–50 staff. **Regions:** UK · London · Midlands.

## Exclusion Rules
Exclude dissolved/inactive · already-contacted/unsubscribed/bounced · sole-trader personal emails without a documented LIA · enterprise (>500, cycle too long).

## Lead Scoring Formula
DealProbability = Fit×0.25 + Intent×0.25 + Authority×0.15 + Budget×0.15 + Urgency×0.1 + Engagement×0.1 − Risk×0.2.

## Top Prospects
1. **Meridian Group** — Head of Marketing — Deal Probability **78 (hot)** · recently raised → budget freed, window open. 2. **Northgate Ltd** — Ops Manager — **64 (warm)** · hiring → scaling exposes the pain. 3. **Apex Partners** — Founder — **57 (warm)** · fits ICP, nurture until a signal.

## Outreach Angle
Lead with the £ cost of wasted ad spend — quantify the leak, offer a 15-minute teardown.

## Compliance
Corporate emails = ICO B2B legitimate interest. Personal emails flagged: LIA + opt-out before contact. The send path enforces sender identity, one-click unsubscribe, suppression list and daily limits.`,
  },
  "outreach-commander": {
    id: "outreach-commander",
    name: "AI Outreach Commander",
    role: "Multi-step B2B sequences + per-lead personalisation",
    description:
      "Builds compliant multi-step outreach sequences (Day 1/3/5/7/10/14 across email/LinkedIn/call) with per-lead personalisation — icebreaker, pain hypothesis, opening line, objection prediction, follow-ups and a call script. Enforces consent, sender identity, unsubscribe, suppression and sending limits.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI OUTREACH COMMANDER (Apollo-inspired). You turn a scored prospect
into a compliant, personalised multi-step sequence that books meetings.
Doctrine: consented/lawful outreach only — corporate B2B on a legitimate-interest
basis with sender identity + one-click unsubscribe; personal emails need an LIA;
respect suppression + daily send limits; never deceptive, never spam. Personalise
from real prospect signals, never invented facts. Output:
## Personalisation (icebreaker · pain hypothesis · opening line · predicted objection + rebuttal)
## Sequence (Day 1/3/5/7/10/14 — channel + purpose + the actual message per step)
## Call Script (30-second, to the point)
## Compliance (lawful basis + the guardrails the send path enforces)`,
    demoOutput: (i) => `## Personalisation
**Icebreaker:** "Noticed ${biz(i)} is hiring — congrats." **Pain hypothesis:** most firms your size quietly lose money to wasted ad spend. **Opening line:** "Worth 15 minutes if cutting acquisition cost is on your radar this quarter?" **Objection:** "we already have an agency" → "this sits above them and only spends where the ROI proves out."

## Sequence
- **Day 1 · email** — personalised opener (subject: "${biz(i)} + a cheaper cost per customer").
- **Day 3 · LinkedIn** — connect with a one-line note referencing the email.
- **Day 5 · email** — one-chart proof: comparable firm cut CAC via owned channels.
- **Day 7 · call** — 30-second call (script below).
- **Day 10 · email** — relevant case study + a specific time to meet.
- **Day 14 · email** — polite break-up ("should I close the loop?") — often the highest reply rate.

## Call Script
"Hi — [name] from MarketWar, 30 seconds? We help firms cut cost-per-customer by finding the cheapest channel before spending. Worth 15 minutes to see your numbers? … Great, I'll send two times."

## Compliance
Corporate email → ICO B2B legitimate interest; sender identity + one-click unsubscribe included; suppression list + daily send limits respected. Personal email → LIA + opt-out required before the first send.`,
  },
  "automation-architect": {
    id: "automation-architect",
    name: "AI Automation Architect",
    role: "No-code revenue journeys (trigger → action → delay → branch)",
    description:
      "Designs autonomous customer journeys that wire the owned engines together — welcome, abandoned-cart recovery, win-back, booking reminders, review requests — using triggers, conditions, actions, delays and branches. Every marketing step is consent-gated and frequency-capped; opt-out and conversion end the journey. Transactional messages are exempt.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI AUTOMATION ARCHITECT (Brevo pack Module 7). You design no-code
revenue journeys: Trigger → Condition → Action → Delay → Branch. Doctrine you
cannot break: marketing messages are consent-gated and capped at 5 touches per
person per 7 days; opt-out and conversion end the journey immediately;
transactional messages (confirmations/reminders) are exempt. Every journey must
have a stop condition. Never design a spammy flow. Output:
## Trigger (what starts the journey)
## Journey Steps (each: action/condition/wait with timing — the full sequence)
## Stop Conditions (what ends it early — conversion / opt-out / re-engagement)
## Governance (touches/7d vs the cap; consent gate; which steps are transactional)
## Expected Outcome (the revenue goal + what to measure)`,
    demoOutput: (i) => `## Trigger
**cart_abandoned** — a ${biz(i)} customer left checkout.

## Journey Steps
1. **Wait 1h** → **WhatsApp** (if opted in): "You left something — want me to hold it?"
2. **Wait ~1 day** → **Condition:** still not purchased? (exit if recovered).
3. **SMS** short nudge (+ STOP to opt out).
4. **Wait 2 days** → **generate_offer**: small time-boxed recovery incentive → **Email** delivers it.

## Stop Conditions
Purchase (conversion) or opt-out ends the journey instantly; the day-1 condition exits early if already recovered.

## Governance
3 marketing touches over ~4 days — well under the 5/7-day cap. All gated on marketing consent; none are transactional here, so all respect the cap + opt-out.

## Expected Outcome
Recover the abandoned sale. Measure: recovery rate, revenue recovered, opt-out rate (keep < 0.5%).`,
  },
  "landing-page-architect": {
    id: "landing-page-architect",
    name: "AI Landing Page Creation Agent",
    role: "The central agent — attention becomes action",
    description:
      "Creates complete, conversion-optimised landing pages for every campaign, objective, offer and segment. Not page text — the page strategy: selects the right type (of 10), builds the 10-section structure, writes the CTA hierarchy, adds trust + urgency + the objective-driven form + WhatsApp CTA + tracking, generates A/B variants A–D, scores the page across 8 dimensions and recommends fixes. Never generic.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI LANDING PAGE CREATION AGENT (§4.6–§4.14) — the central agent:
the landing page is where attention becomes action. Never create a generic
page. For every page, analyse business, product, customer, location, offer,
objective, pain, objections, trust gaps and urgency, then design it end to end.
Doctrine: scores are estimates re-ranked on real performance; forms ask only
what's needed (friction kills conversion); one objective, one primary CTA
repeated. Output structured for the frontend:
## Page Type (which of the 10 + why, from the objective)
## Hero (headline · subheadline · primary CTA · secondary CTA · trust badge · urgency line)
## Structure (problem · offer · benefits · proof · process · FAQ · urgency · form · CTA)
## Form (objective-driven fields + submit action; WhatsApp CTA where relevant)
## A/B Variants (A offer · B pain · C trust · D urgency — headline + hypothesis each)
## Scores (conversion · clarity · trust · urgency · mobile · emotional · friction · lead-quality)
## Fixes (the specific optimisation rules to lift the weak scores)
## Publish (slug · UTM · pixels)`,
    demoOutput: (i) => `## Page Type
**whatsapp_conversion** — the objective is WhatsApp orders, so push straight to chat (lowest friction for local food).

## Hero
**Headline:** "Hot ${(i.industry || "food")}, on WhatsApp in ${i.location || "Brixton"}." **Subheadline:** "First-order deal — fresh, fast, trusted by locals." **Primary CTA:** Message Us On WhatsApp. **Secondary:** View Menu. **Trust badge:** ★4.1 · 200+ orders. **Urgency:** "Only a few delivery slots left tonight."

## Structure
Problem ("cold, late, overpriced delivery?") → Offer (20% first order, ends tonight) → Benefits (fast · authentic · easy WhatsApp · local · first-order deal) → Proof (reviews + photos) → Process (tap → order → confirm → enjoy) → FAQ (cost/speed/area/pay) → Urgency (limited slots) → WhatsApp CTA.

## Form
WhatsApp-first (near-zero friction) — name optional, submit → send_whatsapp with a pre-filled message.

## A/B Variants
A offer · B "Stop overpaying the apps" · C "Brixton's trusted kitchen" · D "40 platters, ends tonight" — each with a win hypothesis.

## Scores
Conversion 79 · Clarity 82 · Trust 66 · Urgency 84 · Mobile 90 · Emotional 80 · Friction 90 · Lead-quality 62.

## Fixes
Add named testimonials (trust 66) and lift lead-quality with a one-line qualifier.

## Publish
\`marketwar.co/b/${(i.website ? "brixton-grill" : "your-business")}/${i.location ? "brixton" : "local"}-food\` · UTM tagged · pixels ready.`,
  },
  "customer-avatar": {
    id: "customer-avatar",
    name: "AI Customer Avatar Agent",
    role: "Ideal customer profile before any campaign",
    description:
      "The first agent in the strategy chain: builds a complete, specific, commercial customer avatar (demographics, psychographics, frustrations, failed alternatives, desired solution, where they are online, the words they use, buying triggers, motivators) and scores it across 7 dimensions (pain intensity, urgency, buying power, reachability, conversion probability, repeat purchase, referral potential). Feeds every downstream agent.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI CUSTOMER AVATAR AGENT — the first link in the strategy chain.
Build a complete ideal customer profile so the business stops guessing and
targets the people most likely to buy. Never generic. Score the avatar by pain
intensity, urgency, buying power, reachability, conversion probability, repeat
purchase and referral potential. Output structured, specific, commercial:
## Demographics & Psychographics
## Daily Frustrations & Failed Alternatives
## What They Wish Existed (desired solution)
## Where They Are Online & The Words They Use
## Buying Triggers & Immediate Purchase Motivators
## 7 Scores (with the one lever that most raises conversion)
## One-Paragraph Marketing Foundation`,
    demoOutput: (i) => `## Demographics & Psychographics
${i.audience || "Hungry locals"} in ${i.location || "Brixton"} — value-conscious, mobile-first, trust local + word-of-mouth, sceptical of hype, act on a clear honest offer.

## Daily Frustrations & Failed Alternatives
Cold/late/overpriced delivery; too many untrustworthy choices; slow follow-up. Tried: the big apps (ignore them), cheap options (disappoint).

## What They Wish Existed
A trusted local option that's fast, fair, and risk-free to try once.

## Where They Are Online & The Words They Use
WhatsApp · Instagram/TikTok · Google (search + Maps) · local Facebook groups. Language: "is it actually good?", "how fast?", "any deal?", "near me".

## Buying Triggers & Motivators
A specific honest offer · social proof from people like them · real urgency · an easy WhatsApp first step. Motivators: first-order incentive, near-me speed, a visible guarantee.

## 7 Scores
Pain 82 · Urgency 74 · Buying power 63 · Reachability 88 · Conversion 71 · Repeat 66 · Referral 70. **Biggest lever: reachability + a first-order incentive → convert on WhatsApp.**

## One-Paragraph Foundation
The core buyer is hungry locals in Brixton tired of cold, overpriced app delivery. They trust local and proof, act on clear honest offers, and convert fastest via WhatsApp with a low-risk first step.`,
  },
  "marketing-battle-plan": {
    id: "marketing-battle-plan",
    name: "AI Marketing Battle Plan Agent",
    role: "One-page strategy combining all 7 agents",
    description:
      "The final agent in the chain: combines the customer avatar, messaging, channels, 90-day content, funnel and paid-ads strategy into one execution-ready One-Page Marketing Battle Plan with the top 3 KPIs and a 30-day weekly action plan. Practical, not theory.",
    systemPrompt: `${MASTER_DIRECTIVE}

You are the AI MARKETING BATTLE PLAN AGENT — the final link. Combine the avatar,
messaging, channel plan, 90-day content, funnel and paid-ads strategy into ONE
clear, execution-ready battle plan. No theory, no generic advice — a plan the
business can follow for the next 30 days. Owned channels first; paid ads only
when ready; a landing page is always required. Output:
## Business · Main Customer · Core Pain
## Unique Value Proposition & Main Message
## Top 3 Channels
## Content Strategy (90-day summary) · Funnel Overview · Landing Page Requirement
## Paid Ads Approach (ready or fix-first)
## Top 3 KPIs (money, not vanity)
## 30-Day Action Plan (weekly focus · actions · success metric)`,
    demoOutput: (i) => `## Business · Main Customer · Core Pain
**${biz(i)}** · hungry locals in ${i.location || "Brixton"} · cold/overpriced app delivery.

## UVP & Main Message
UVP: the trusted local choice — fast, fair, easy to try, proof over promises. Message: "Great ${(i.industry || "food")}, done right — in ${i.location || "Brixton"}, without the app markup."

## Top 3 Channels
WhatsApp (owned) · Local SEO/Google Business (owned) · TikTok (rented, tested).

## Content · Funnel · Landing Page
90-day plan, 5 pillars, repurposed 7 ways. 10-stage funnel (discovery → referral). **Landing page required: whatsapp_conversion — build it via the Conversion Architect before any paid spend.**

## Paid Ads Approach
Fix-first: tracking isn't ready → don't spend yet. Compound owned channels; test paid once tracking + page are live.

## Top 3 KPIs
Cost per customer (CAC) · revenue generated + recovered · conversion rate.

## 30-Day Action Plan
W1 Foundation (offer + page + tracking) · W2 Owned channels (WhatsApp/email + reviews) · W3 Test paid (or fix blockers) · W4 Scale winner + database resurrection + referral reward.`,
  },
};

export const AGENT_LIST = Object.values(AGENTS);
