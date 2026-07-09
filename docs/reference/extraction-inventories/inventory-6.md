# Inventory 6 — doc1.txt lines 5873–7477

Source: /tmp/claude-0/-home-user-MarketWar-OS-/7d1b9ecc-f3d0-5d24-b0bb-494bab17ac45/scratchpad/deep/doc1.txt
Format: Justin (user) / Gemini (assistant) chat log — product build transcript for MarketWar OS (formerly DemandOS).

SECURITY NOTE: [SECRET at line 6792] — a Google Maps API key is pasted verbatim in the source document. Not copied here. It should be revoked/rotated and never committed.

---

## 1. Content Map (line ranges → topic)

- 5873–5875 — Final positioning statement for "DemandOS" (AI-powered autonomous marketing OS)
- 5877–5899 — Pivot to Agentic Campaign Generation-as-a-Service; AI Campaign Packs™ (Starter/Growth/Domination); Campaign Confidence Score™
- 5902–5911 — Bugfix: build error (malformed Tabs_Trigger JSX tag)
- 5913–5935 — Bugfix: GenkitError 503; tactical retry logic (3 retries → 5 attempts, exponential backoff + jitter, toast notifications)
- 5937–5952 — "Senior engineer persona" directive; Executive Command Center (War Room); AI Growth Strategist™ Daily Briefing; Infrastructure Independence & AI Revenue Recovery Score™; institutional moat tracking; glassmorphism/scanline polish
- 5954–5973 — Viral Velocity X10 mandate; Viral Loop Engine; K-Factor loops; referral mechanics; War Room viral metrics
- 5976–5999 — MarketWar OS Master Product Definition (target users, mission bullets, ACU concept); Master Platform Prompt sync; ACU Balance header node
- 6003–6194 — User Media + Brand-Consistent Creative Engine spec: user uploads, Brand Asset Library (brand_assets collection + BrandAsset schema), Logo-Aware Image Creation Agent (AI Brand Visual Creation Agent), user options, image creation rules, brand colour extraction, creative upload workflow, agent prompt, campaign-pack additions, dual creative modes; implementation (Brand Asset Vault™, aiBrandVisualCreation Genkit flow)
- 6198–6208 — Bugfix: missing useMemoFirebase hook
- 6211–6226 — Landing-page "How it Works": Warfare Protocol 6-step section + expanded tactical footer (ACU Logic, Level 3 Infrastructure, Logo DNA Extraction)
- 6229–6249 — "Money-making machine" mandate: Revenue & ROI Command (CAC vs LTV), Trapped Revenue™ recovery, Autonomous Budget Shield, ACU utility ROI, viral multiplier logic
- 6252–6267 — Architecture separation: frontend/backend/shared; constants.ts, types.ts, useIntelligenceService, useAssetService, Firestore permission-error pattern, MASTER_PLATFORM_PROMPT centralization
- 6271–6294 — "Activate everything" audit: OS Memory (Firestore intelligence collection) sync for all agents; Global Intelligence Scan; Optimize Unit Economics action; Market Density Scan; WhatsApp AI Suggest; ACU/Operational Score standardization
- 6297–6316 — Strategic Positioning spec: do-not-position-as list, position as AI Customer Acquisition Infrastructure, core & stronger commercial messages; Stop/Fix/Scale philosophy encoded in copy and briefings
- 6319–6341 — Core Business Logic spec: cheap for users, high user ROI, 5x gross margin via ACU billing, prompt compression, caching, template reuse, low-cost model routing, output reuse, batch generation, pre-generation scoring, plan-gated heavy features, extra charge for high-cost automation; implementation (ACU_COSTS, gemini-2.5-flash routing, pre-flight Confidence Score)
- 6344–6366 — 7-layer architecture: Layer 1 Business Brain spec + implementation (BusinessProfile entity, useBusinessService, brain dashboard)
- 6369–6391 — Layer 2 Customer Brain spec + implementation (CustomerProfile entity, useCustomerService, segments, intent scoring)
- 6394–6415 — Spreadsheet/CSV contact ingestion + direct communication (papaparse, bulkAddCustomers, SYNC EXTERNAL DATABASE, one-click WhatsApp/Email outreach, Trapped Revenue flagging)
- 6418–6437 — Layer 4 Campaign Brain spec (10 components) + implementation
- 6440–6454 — Layer 5 Landing Page Brain spec (8 conversion outcomes) + implementation
- 6457–6469 — Layer 6 Distribution Brain spec (10 channels, paid ads last) + implementation
- 6472–6492 — Layer 7 Revenue Brain spec (9 tracked metrics) + implementation (revenueIntelligenceAgent, Generate Revenue Audit)
- 6496–6515 — Agent 4.1 Business Diagnosis Agent spec (inputs, 8 scores, "Why You Are Not Getting Customers" report) + implementation
- 6518–6539 — Agent 4.2 Customer Pain Agent spec (analyses, outputs: trigger map, objection map, persuasion angle, CTA/LP/WhatsApp directions) + implementation (psychology dashboard)
- 6542–6562 — Agent 4.3 Offer Builder Agent spec (14 offer types, 7 offer scores) + implementation
- 6565–6587 — Agent 4.4 Campaign Commander Agent spec (11 outputs, 11 campaign modes) + implementation
- 6590–6610 — Agent 4.5 Ad Creative Agent spec (13 asset types) + implementation (Creative Lab, AIDA/PAS, AI image prompts)
- 6613–6678 — Agent 4.6 AI Landing Page Creation Agent: core-agent mandate + 18 responsibilities; implementation (strategic blueprint, Conversion Integrity Score, A/B roadmap, tracking protocol, CTA hierarchy)
- 6682–6705 — Landing page type 1: Lead Capture Page (fields, use cases) + implementation
- 6708–6729 — Landing page type 2: WhatsApp Conversion Page + implementation (pre-filled intent messages, urgency hooks)
- 6732–6750 — Landing page type 3: Booking Page + implementation (slot scarcity, preparation instructions)
- 6754–6764 — Bugfix: "form is not defined" on Owned Distribution page
- 6767–6788 — Landing page type 4: Order Page + implementation (checkout trust, urgency)
- 6791–6811 — Google Maps integration ([SECRET at line 6792]); @react-google-maps/api; google-map-node component; Geographic Intelligence card in Business Brain; dark themed map styles
- 6814–6835 — Landing page type 5: App Download Page + implementation (store CTAs, install incentives)
- 6838–6859 — Landing page type 6: Partner Sign-Up Page (B2B) + implementation
- 6862–6881 — Landing page type 7: Local SEO Landing Page + implementation (keywords, LocalBusiness schema, target grid field)
- 6884–6903 — Landing page type 8: Offer Claim Page + implementation (FOMO, countdown/limited slots, claim protocol)
- 6906–6932 — Agent 4.7 Landing Page Structure Generator — Hero Section spec (with Congolese food delivery example) + implementation (trustBadge, urgencyMessage, heroImagePrompt)
- 6936–6979 — 4.7 continued: Problem/Offer/Benefits/Proof/Process/FAQ/Urgency/Lead-Form/CTA sections spec + implementation (discriminated-union schema, dynamic form fields)
- 6983–7023 — 4.7 spec repeated verbatim; final implementation (full 10-section arc, section visual styles, Space Grotesk font, colour palette)
- 7027–7049 — Agent 4.8 Landing Page AI Scoring spec (8 scores) + implementation (Intelligence Matrix)
- 7053–7072 — Agent 4.9 Landing Page Optimisation Rules spec (12 rules) + implementation (Fix Protocol, projected score lift)
- 7076–7095 — Agent 4.10 Landing Page A/B Testing spec (4 variants, 10 tracked metrics) + implementation (A/B Testing Lab, Analytics Hub, winning hypothesis)
- 7099–7121 — Agent 4.11 Landing Page Publishing System spec (hosting, slugs, subdomains, QR, pixels, UTM; example URL) + implementation (Publishing Hub)
- 7125–7144 — Agent 4.12 Landing Page Database Collections (12 collections) + implementation (useLandingPageService deep-save)
- 7148–7181 — Agent 4.13 LandingPage TypeScript schema (full type) + implementation
- 7184–7249 — Agent 4.14 Landing Page Agent Prompt (full verbatim prompt) + implementation
- 7253–7273 — Agent 5 Lead Capture Agent spec (8 capture types, 7 lead scores) + implementation (leads collection, Lead Intelligence dashboard)
- 7277–7295 — Agent 6 WhatsApp Sales Agent spec (9 capabilities) + implementation (Tactical Quick Actions)
- 7299–7318 — Agent 7 Budget Protection Agent spec (8 rules, 6-word dashboard language) + implementation (Shield Verdict, 25% no-lead STOP trigger)
- 7322–7340 — Agent 8 Customer Resurrection Agent spec (7 input sources, 5 outputs) + implementation
- 7344–7363 — Agent 9 Local Growth Agent spec (8 generated asset types) + implementation
- 7367–7388 — Agent 10 Competitor Spy Agent spec (9 tracked signals) + implementation (Market Gap Verdict, Node Watchlist, Counter-Tactics Engine)
- 7392–7412 — Agent 11 Revenue Intelligence Agent spec (10 tracked metrics) + implementation (Unit Economics Grid, Leak Detection Hub, Economic Verdict)
- 7416–7437 — Agent 12 Local Threat Discovery Agent (user request: constant local competitor scanning) + implementation (Live Threat Grid, 5 threat signals, escalation protocols)
- 7441–7452 — Bugfix: JSX unescaped `>` character
- 7456–7472 — Bugfix: "Maximum update depth exceeded" (useCallback/useMemo hook stabilization)
- 7476–7477 — Mandate: no generic information — real data only, tied to user request (message start; continues past range)

---

## 2. Exhaustive Requirement Inventory

### Positioning, product identity, messaging
- DemandOS final positioning: pay-per-campaign autonomous marketing OS generating strategy, visuals, copy, emojis, hashtags, CTA, landing pages, follow-ups, conversion automation (5873–5875)
- Pivot: Agentic Campaign Generation-as-a-Service (5878)
- AI Campaign Packs™ product concept — complete ready-to-launch acquisition operations (5878, 5891)
- Campaign Pack tiers: Starter, Growth, Domination (3 ads → full multi-platform domination) (5880, 5896, 5986, 6339)
- "Buying an acquisition operation, not a tool" operational UX (5887)
- MarketWar OS Master Product Definition — full mission statement (5977)
- Target user segments: small businesses, local businesses, agencies, service providers, creators, restaurants, tutors, trades, delivery platforms, event organisers, recruitment platforms, online sellers (5977)
- Mission bullets: diagnose marketing failure; rebuild weak offers; generate complete campaign systems; create high-converting landing pages; generate visuals/copy/hashtags/CTAs/follow-ups; capture leads via WhatsApp/SMS/email/landing pages; recover lost customers from databases; build owned traffic assets; reduce dependency on Meta/Google/TikTok/agencies; spend less with higher ROI; platform profitability via ACU controls/automation/usage margins (5977)
- Strategic positioning DO-NOT list: not an AI post generator, not a social scheduler, not a Meta ads tool, not a Google ads tool, not a basic CRM, not a content calendar app, not a Canva alternative, not agency-replacement-only (6298)
- Position as: AI Customer Acquisition Infrastructure (6298)
- Core message: "Stop wasting money on ads. Build a customer acquisition machine." (6298)
- Stronger commercial message: diagnoses failure, creates campaign, builds landing page, captures lead, follows up, recovers lost customers, says what to stop/fix/scale (6298)
- Landing page hero: "Stop Renting Your Customers" (6303)
- Stop / Fix / Scale operational philosophy across dashboard & briefings (6304, 6312, 6314)
- Infrastructure SEO metadata using "AI Customer Acquisition Infrastructure" title (6305, 6313)
- Master Platform Prompt (MASTER_PLATFORM_PROMPT) as single source of truth for all agents (5984, 6262, 6302)
- "Escape Ad Dependency" mission focus in master prompt (5984)
- Forbid AI from positioning itself as post generator / ads tool (6302)
- Viral X10 capability as primary strategic moat in landing/dashboard copy (5971)
- "No generic information — real data and related information based on user request" system-wide mandate (7477)

### Campaign generation engine (Mission Control)
- Psychological hooks: PAS and AIDA-based copy with local slang and emojis (5882, 6528, 6596)
- Visual architecture concepts for Meta, TikTok, Instagram (5883)
- WhatsApp & follow-up nodes: qualification flows, SMS/email re-engagement sequences (5884)
- Retargeting logic: automated scripts + audience logic for abandoned-lead recovery (5885)
- Campaign Confidence Score™ — predictive success/conversion-probability matrix in output UI (5886, 6326, 6338)
- Landing page blueprints inside packs (5878)
- Stop/Fix/Scale directives in campaign UI (5887)
- Full-funnel payload per pack: ad copy, visual concepts, WhatsApp qualification sequences, retargeting logic (5891)

### Reliability / error handling
- Retry mechanism for transient 503 model errors — 3 retries, exponential backoff (5917, 5922)
- Enhanced retry protocol — up to 5 attempts, exponential backoff with randomized jitter (5930)
- Toast notification system for model spikes / tactical alerts (5917, 5922, 5930)
- Fix: malformed </Tabs_Trigger> JSX tag build error (5906)
- Fix: missing useMemoFirebase hook (Firestore query stabilization, prevents infinite re-renders) (6202, 6207)
- Fix: "form is not defined" — useForm hook init on Owned Distribution page (6758)
- Fix: unescaped `>` in JSX (Lead Intelligence dashboard) → &gt; (7445, 7450)
- Fix: "Maximum update depth exceeded" — useCallback on all service functions, useMemo on useUser hook (7460–7471)

### War Room / Executive Command Center
- Executive Command Center ("Situation Room" dashboard refactor) (5943, 5945)
- AI Growth Strategist™ Daily Strategic Briefing with autonomous directives (5943, 5946)
- Infrastructure Independence tracking (Owned Assets vs Ad Dependency) (5945, 5970)
- AI Revenue Recovery Score™ displayed prominently (5945, 6236)
- Institutional Moat Tracking: Owned Distribution Units — WhatsApp members, SEO rankings, customer database size (5947, 5998)
- Premium cinematic polish: glassmorphism + scanline effects (5948)
- War Room tracks Viral Velocity and Network Effect Growth metrics (5960, 5970)
- Global Intelligence Scan (system-wide sync + protocol execution from briefing) (6278, 6289)
- Briefings categorized as SCALE / FIX / STOP missions (6314)
- Growth Multiplier metric prioritized in War Room (6239)
- Trapped Revenue + Blended ROI telemetry in War Room (6247)

### Viral growth
- Viral Velocity X10 baked into core infrastructure ("everything goes viral X10") (5955, 5958)
- Viral Loop Engine — referral mechanics, community sharing hooks, organic K-factor multipliers in every payload (5960, 5965)
- Viral Loop Agent — calculates K-Factor Loop per mission, milestone rewards, sharing psychological hooks (5969)
- Viral X10 directive baked into every generated campaign's DNA (5997)
- Viral X10 Hook in every distribution plan (6468)
- Local referral "Viral X10" engine for tight-knit communities (7361)

### ACU economy / monetisation / business logic
- ACU (Autonomous Credit Units) usage-based operational/billing model (5982, 5985)
- ACU Balance node in dashboard global header ("Infrastructure Fuel") (5985, 5996, 6328, 6336)
- Cheap for users (affordable for small businesses) (6320)
- High ROI for users (6320)
- Platform profitability: minimum 5x gross margin (6320, 6325, 6336)
- Margin controls: ACU billing (6320)
- Margin controls: prompt compression (6320, 6327)
- Margin controls: caching (6320, 6327)
- Margin controls: template reuse (6320)
- Margin controls: low-cost AI model routing (6320) — implemented as standardizing on gemini-2.5-flash (6325, 6337)
- Margin controls: AI output reuse (6320)
- Margin controls: batch generation (6320)
- Margin controls: internal scoring before expensive generation — mission pre-flight Confidence Score (6320, 6326, 6338)
- Margin controls: limiting heavy features by plan (6320)
- Margin controls: charging extra for high-cost automation (6320)
- ACU_COSTS defined per tactical mission (audits, campaigns, resurrection, local, competitor) (6324, 7350, 7373)
- ACU cost displayed per pack tier at mission initialization (6339)
- Operational ROI tracking — mission success linked to ACU consumption (6238)
- ACU Balance + Operational Score standardized across platform (6282)

### Revenue & ROI infrastructure
- Revenue & ROI Command node — real-time CAC vs LTV tracking (6235)
- Trapped Revenue™ recovery concept + concrete figures (6236, 6243, 6389, 6412)
- Autonomous Budget Shield — auto-kill losing campaigns, reallocate ACUs to viral loops (6237)
- "Optimize Unit Economics" action — simulated real-time budget reallocation (6279, 6291)

### Architecture & platform engineering
- Separation of frontend / backend / shared layers (6253, 6256)
- src/lib/constants.ts + src/lib/types.ts shared logic layer (6258)
- Genkit flows consolidated as server-only backend (6259)
- Client-side service layer hooks: useIntelligenceService, useAssetService (6260)
- Firestore Permission Error architecture (Pattern 1) enforcement on mutations; contextual developer-overlay errors (6260, 6261, 6267)
- OS Memory: every agent output saved to Firestore `intelligence` collection (6275, 6277, 6292)
- All commands/buttons/functionalities activated after deep-dive review (6272, 6275)
- WhatsApp AI Suggested Responses ("AI Suggest" button; qualify leads, handle objections) (6281, 6290)
- Market Density Scan in Competitor Intelligence Centre; counter-campaign initialization from gaps (6280)

### Brand-Consistent Creative Engine (user media)
- User uploads for ads: product photos, business photos, team photos, customer photos, venue/shop photos, food photos, service photos, before/after photos, promo videos, testimonial videos, event clips, existing posters, brand logo (6008–6035)
- Brand Asset Library — Firestore collection `brand_assets` (6037–6042)
- Asset types enum: logo, product_image, service_image, team_image, customer_image, venue_image, before_after_image, testimonial_video, promo_video, event_video, existing_ad, background_image, brand_pattern (6044–6046)
- BrandAsset schema (id, businessId, uploadedBy, assetType, fileUrl, fileName, mimeType, fileSize, aiDetectedColours, dominantColour, secondaryColour, accentColour, aiDescription, usageRightsConfirmed, createdAt) (6048–6058)
- AI Brand Visual Creation Agent (logo-aware image creation) (6060–6063)
- Agent capabilities: place logo in generated image; extract logo colour theme; apply brand colours; match typography style; match visual tone; cross-campaign consistency; platform-specific versions (6069–6083)
- User options: use my logo Y/N; logo position (top-left/top-right/bottom-left/bottom-right/centre/watermark); use brand colours Y/N; use uploaded product photo Y/N; use uploaded video/photo as base creative Y/N; generate new AI background Y/N; add CTA button Y/N; add offer text Y/N; platform format (Facebook/Instagram/TikTok/LinkedIn/WhatsApp/Story/Reel/Banner) (6085–6088)
- Image creation rules: never ignore selected logo; never distort logo; preserve proportions; keep logo readable; no text over logo; use logo-extracted colours; contrast for readability; adapt layout to platform size; generate multiple variants; brand consistency across all ads (6090–6111)
- Brand colour extraction: primary, secondary, accent, background-safe, text-safe, CTA colours (6113–6116)
- Extracted colours become default brand theme for: ad images, landing pages, CTA buttons, social posts, banners, email headers, WhatsApp promo graphics (6118–6132)
- Creative upload workflow (12-step: create campaign → upload → AI analyses → extract colours → recommend assets → select → create variants → logo placement → apply colours → preview → edit/approve → save to campaign) (6134–6135)
- AI Brand Visual Creation Agent prompt (verbatim) (6137–6153)
- Campaign pack additions: uploaded images/videos, uploaded logo, colour extraction, logo-aware generation, brand-consistent variants, platform formats, CTA overlay, offer overlay, video thumbnail generation, creative preview, creative approval (6155–6158)
- Dual creative modes: User-Owned Creative and AI-Generated Creative (6160–6169)
- Final rule: every ad must use user assets or follow logo colour theme — never generic/off-brand (6171–6173)
- Implementation: BrandAsset entity in backend.json (6178); aiBrandVisualCreation Genkit flow (6179); colour detection in upload workflow (6180); asset uploads in Mission Control (6181); Brand Assets dashboard module / Brand Asset Vault™ (6182, 6190)

### Landing page marketing site
- Warfare Protocol section — 6-step "How it Works" mechanical flow (Intelligence Scan → Viral X10 Feedback / Autonomous Mastery) (6215, 6222)
- Expanded tactical footer with "Mechanics" column: ACU Logic, Level 3 Infrastructure, Logo DNA Extraction; categorized command-node links (6223)
- Footer decorative grid, system status indicators, institutional branding (6224)

### 7-Layer intelligence architecture
- Layer 1 — Business Brain: business type, product/service, pricing, margins, locations, audience, competitors, previous failures, trust signals, customer objections, local market position (6345–6346)
  - BusinessProfile entity in backend.json (6350); useBusinessService hook (6351); Brain Command Center dashboard src/app/dashboard/brain/page.tsx (6352); master-prompt priority on Business Brain data (6353)
- Layer 2 — Customer Brain: leads, buyers, abandoned users, inactive customers, WhatsApp conversations, email behaviour, SMS behaviour, buying probability, churn risk, lifetime value, referral probability (6370)
  - CustomerProfile entity (6374); useCustomerService (6375); Customer Brain console with Intelligence Segments, Intent Scoring, Behavioural Insights (6376); segments: Hot Leads, Abandoned Checkouts, Inactive Nodes (6387); sidebar rename Customer Vault → Customer Brain (6378)
- CSV/spreadsheet contact import: papaparse dependency (6400); bulkAddCustomers method (6401); "SYNC EXTERNAL DATABASE" UI with CSV column mapping (6402); one-click WhatsApp & Email direct-contact buttons per customer (6403, 6411); imported contacts auto-flagged for Resurrection Engine / Trapped Revenue calc (6404, 6412); initial Buying Probability score per imported contact (6413)
- Layer 3 — (Business Diagnosis / Targeting, per 6492 & 6508; detailed as agent 4.1 below)
- Layer 4 — Campaign Brain builds: objective, audience, hook, message, creative direction, landing page, CTA, follow-up, retargeting, tracking (10 components) (6419, 6423)
  - Audience segmentation mapping pain points to psychological triggers (6433); tracking node defines conversion events + optimization triggers (6434); tabbed campaign payload UI (6435)
- Layer 5 — Landing Page Brain converts visitors into: leads, WhatsApp messages, bookings, orders, calls, app downloads, partner sign-ups, event ticket buyers (8 goals) (6441, 6445, 6447)
- Layer 6 — Distribution Brain channels: WhatsApp, SMS, email, local SEO, Google Business posts, referral links, QR campaigns, affiliate promoters, marketplace listings, paid ads only when ready (6458, 6462)
  - "Owned Distribution Nodes" / infrastructure-moat prioritization over rented platforms (6460, 6463)
- Layer 7 — Revenue Brain tracks: spend, leads, cost per lead, cost per booking, cost per customer, revenue generated, revenue recovered, wasted spend, campaign profitability (6473)
  - revenueIntelligenceAgent Genkit flow (CPL, CPB, wasted spend) (6477); Finance dashboard → Revenue Brain console with Generated vs Recovered revenue (6478); Viral ROI + Trapped Revenue in Revenue Brain (6479); "Generate Revenue Audit" action (6480); Scale/Fix/Stop verdicts on profitability (6489)

### Full AI Agent System (numbered agents)
- Agent 4.1 Business Diagnosis Agent ("Marketing Doctor") (6497)
  - Inputs: website, social links, business description, services/products, pricing, current offer, target audience, previous ad spend, results achieved, location, competitors, landing page URL, customer database upload (6497)
  - 8 output scores: Conversion Risk, Offer Weakness, Trust, Landing Page, Audience Match, Follow-Up, Revenue Leakage, Campaign Readiness (6497, 6501)
  - "Why You Are Not Getting Customers" report: main failure points, fix-first priorities, what not to spend on yet, best first offer, best first campaign, best first landing page type, fastest recovery opportunity (6497, 6502)
  - marketingFailureAudit flow upgrade; expanded Failure Audit UI; Strategic Verdict "don't spend yet" node (6501–6504); fastest-recovery flagging e.g. Database Resurrection vs New Acquisition (6513)
- Agent 4.2 Customer Pain Agent (6519)
  - Analyses: pain points, objections, frustrations, urgent needs, fears, desires, cultural triggers, local language, buying motivations, social proof expectations (6519)
  - Outputs: emotional trigger map, objection map, persuasion angle, CTA direction, landing page messaging direction, WhatsApp script direction (6519, 6525)
  - customerPainAgent flow (6524); Psychology Command Node src/app/dashboard/psychology/page.tsx (6526); "Psychology Scan" sidebar entry (6527); AIDA/PAS emphasis in master prompt (6528); regional nuance/slang adaptation (6537)
- Agent 4.3 Offer Builder Agent (6543)
  - 14 offer types: first-time buyer discount, bundle, urgency, referral reward, loyalty reward, comeback, abandoned lead offer, free trial, free consultation, free quote, limited-time, VIP, seasonal, location-based (6543)
  - 7 offer scores: Clarity, Urgency, Margin, Trust, Conversion, Risk, Competitor Strength (6543, 6548)
  - ai-offer-builder-flow.ts (6548); Offers dashboard with tactical goals (e.g. "Reactivate Dead Leads", "Increase Order Value") (6549); visual scorecard with progress bars (6550); offers saved to OS Memory, deployable to Layer 5 / WhatsApp flows (6560)
- Agent 4.4 Campaign Commander Agent (6566)
  - Creates: campaign objective, audience, budget split, platform recommendations, creative direction, copy angle, landing page type, lead capture route, follow-up sequence, retargeting plan, success metrics (6566)
  - 11 campaign modes: lead generation, WhatsApp messages, bookings, app downloads, event ticket sales, restaurant orders, delivery driver sign-ups, partner sign-ups, investor leads, customer reactivation, referral growth (6566, 6572)
  - campaignCommanderAgent flow with budget splits, platform recs, capture routes (6571); KPIs + optimization triggers monitored by Budget Shield (6573); Acquisition Packs UI with strategic roadmap (6574)
- Agent 4.5 Ad Creative Agent (6591)
  - Creates: headlines, hooks, short copy, long copy, captions, TikTok scripts, Reels scripts, carousel ideas, image prompts, video scripts, CTA variations, emojis, hashtags (6591)
  - ad-creative-agent.ts flow with AIDA/PAS (6596); Creative Lab dashboard src/app/dashboard/creatives/page.tsx for Facebook/Instagram/TikTok/LinkedIn/Google (7 platforms) (6597, 6609); AI image prompts for Midjourney/Imagen (6602); ACU cost for creative generation (6604); AI Campaign Score™ factoring (6609)
- Agent 4.6 AI Landing Page Creation Agent — core agent (6614)
  - Designs strategy, layout, copy, structure, CTA flow, tracking, testing logic, trust system, conversion pathway — not just text (6614)
  - 18 responsibilities: analyse business; analyse campaign objective; analyse customer pain; analyse offer; select page type; create structure; generate copy; generate CTA hierarchy; trust sections; urgency sections; lead capture form; WhatsApp CTA; booking/order/app-download logic; tracking pixels; A/B variants; score page; recommend fixes; publish or prepare for approval (6637–6656)
  - strategicBlueprint output (trust systems, conversion pathways, tracking/testing protocols) (6619); layout logic selection (VSL vs Quiz vs Direct Response) (6620); Conversion Integrity Score (6662); A/B Test Roadmap (6663); Tracking Protocol events (Lead Intent, WhatsApp Trigger, Scroll Depth, Click-to-Call, Form Intent) (6630, 6664); Recommended Fix Protocol (6665); primary/secondary/tertiary CTA hierarchy (6666); dual-view preview + Full Copy Payload for dev handoff (6631)
- Agent 4.7 Landing Page Structure Generator (6907)
  - Hero section: emotional headline, subheadline, primary CTA, secondary CTA, hero image/generated visual, trust badge, urgency message (6907) — Congolese food Birmingham example (6907–6913)
  - Problem section (customer pain) (6937, 6984)
  - Offer section: offer name, discount, deadline, eligibility, CTA (6939, 6986)
  - Benefits section: 3–6 benefits (6941, 6988)
  - Proof section: reviews, testimonials, star rating, customer photos, case studies, order numbers, partner logos, before/after proof (6943, 6990)
  - Process section: simple numbered steps (6945–6950, 6992–6997)
  - FAQ section answering objections (cost, delivery speed, area, WhatsApp ordering, discount, booking, payment) (6951, 6998)
  - Urgency section: limited slots, ends tonight, only 10 spaces, booking closes soon, first 50 users (6953, 7000)
  - Lead capture form fields by objective — Basic: name, phone, email, postcode, interest; Booking: preferred date, preferred time, service needed; Quote: project type, budget, location, urgency; App: phone number, app platform, referral code (6955, 7002)
  - CTA section examples: Order Now, Claim Offer, Book Your Slot, Get Free Quote, Join Today, Download App, Message Us On WhatsApp, Reserve Ticket (6957, 7004)
  - Implementation: schema fields trustBadge/urgencyMessage/heroImagePrompt (6918); discriminated-union section schema (6962); dynamic form fields per objective (6963, 7010–7013); section-specific UI styles (agitation nodes, voucher-style offer, proof grids, scarcity banners) (7014–7018); Space Grotesk font + MarketWar palette (primary blue, accent cyan, emerald) (7019)
- Agent 4.8 Landing Page AI Scoring — 8 scores: Conversion, Clarity, Trust, Urgency, Mobile, Emotional, Friction, Lead Quality (7028)
  - Intelligence Matrix UI grid with progress bars (7034, 7045); friction = ease-of-action (100 = zero friction) (7036); emotional score vs Layer 3 pain points (7037); lead quality = form-field qualification effectiveness (7038); verdict references scores (7039); overall score as Mission Probability (7046)
- Agent 4.9 Landing Page Optimisation Rules — 12 recommendations: shorter headline, stronger CTA, better offer, more trust proof, fewer form fields, stronger WhatsApp button, faster loading layout, better mobile spacing, clearer pricing, stronger urgency, more local language, better emotional hook (7054)
  - 12-point Optimisation Protocol in recommendedFixes (7059); score-to-fix linkage (7060, 7069); Fix Protocol tab with numbered Tactical Adjustments + Autonomous Optimization projected score lift (7061, 7070)
- Agent 4.10 Landing Page A/B Testing — variants: A direct offer-focused, B pain/problem-focused, C trust/proof-focused, D urgency-focused (7077)
  - 10 tracked metrics: visits, CTA clicks, form submits, WhatsApp clicks, bookings, orders, cost per lead, conversion rate, bounce rate, scroll depth (7077, 7084)
  - A/B Testing Lab UI (7083); Performance Analytics Hub (simulated data) (7084); per-variant Winning Hypothesis (7085); Winning Variant identification (7094)
- Agent 4.11 Landing Page Publishing System — instant hosted pages, custom slug, business subdomain, custom domain later, QR code generation, share link, Meta pixel, Google tag, TikTok pixel, LinkedIn insight tag, server-side event tracking, UTM builder (7100)
  - Example URL pattern marketwar.co/b/{business}/{slug} (7100, 7107, 7120); SEO slug + UTM campaign-name generation (7105); Publishing Hub UI with live URL preview, QR generator/download, pixel config fields, UTM builder (7106–7110); server-side event tracking status markers (7111)
- Agent 4.12 Landing Page Database Collections (12): landing_pages, landing_page_versions, landing_page_sections, landing_page_ctas, landing_page_forms, landing_page_ab_tests, landing_page_events, landing_page_scores, landing_page_assets, landing_page_pixels, landing_page_submissions, landing_page_recommendations (7126)
  - backend.json schemas for all 12 (7131); types.ts interfaces (7132); use-landing-page-service.ts multi-collection deep-save (7133); "SYNC TO OS MEMORY" command (7142)
- Agent 4.13 LandingPage TypeScript schema — full type: pageType enum (lead_capture, whatsapp_conversion, booking, order, app_download, partner_signup, event_ticket, reactivation, local_seo, offer_claim); status enum (draft/published/paused/archived); formConfig with submitAction enum (save_lead, send_whatsapp, book_appointment, download_app, redirect); whatsappConfig (phoneNumber, prefilledMessage); tracking (UTM + metaPixelId/googleTagId/tiktokPixelId); 8 scores; metrics (visits, uniqueVisitors, ctaClicks, formSubmissions, whatsappClicks, bookings, orders, conversionRate, bounceRate) (7149–7169)
- Agent 4.14 Landing Page Agent Prompt — verbatim system prompt: never generic; analyse 13 factors; create 17 outputs; optimise for mobile-first conversion, clarity, speed, trust, urgency, emotional relevance, low friction, revenue outcome; output structured JSON for frontend rendering (7185–7235)
- Agent 5 Lead Capture Agent (7254)
  - Captures: form submissions, WhatsApp clicks, call clicks, booking requests, quote requests, app download clicks, partner sign-ups, referral leads (7254)
  - 7 lead scores: urgency, fit, budget, location, engagement, intent, conversion probability (7254, 7258)
  - lead-capture-agent.ts flow (7258); Lead entity + /leads collection (7259); use-lead-service.ts (7260); Lead Command Centre src/app/dashboard/leads/page.tsx (7261); "Lead Intelligence" sidebar node (7262); Prioritization Verdict (human intervention vs automated nurture) (7272)
- Agent 6 WhatsApp Sales Agent (7278)
  - 9 capabilities: welcome messages, lead qualification, price explanation, booking support, order collection, objection handling, payment reminder, follow-up, abandoned conversation recovery (7278)
  - whatsapp-sales-agent.ts flow with 9 conversational intents, PAS/AIDA (7282); Tactical Quick Actions in WhatsApp dashboard (7284, 7292); per-message Psychological Angle + Conversion Probability (7293); Business Brain context for margin-conscious replies (7285)
- Agent 7 Budget Protection Agent (7300)
  - Rules when spend produces no leads: pause, reduce budget, change creative, change audience, change offer, change landing page, activate recovery, notify user (8 actions) (7300)
  - Dashboard language: STOP, FIX, SCALE, RECOVER, WATCH, TEST (7300, 7305, 7317)
  - intelligent-budget-protection.ts flow (7304); Shield Verdict per campaign (7306); auto-STOP if >25% budget spent with zero leads (7315); Fix Protocols rendered in budget dashboard (7307); financial anomaly logging via useIntelligenceService (7308)
- Agent 8 Customer Resurrection Agent (7323)
  - Works with: uploaded emails, phone numbers, WhatsApp contacts, abandoned leads, inactive customers, old buyers, expired quotes (7323)
  - Outputs: customer segments, reactivation messages, comeback offers, estimated recoverable revenue, priority recovery list (7323, 7327)
  - database-resurrection.ts 5-point payload (7327); one-time-only comeback incentives (7328); Priority Recovery List UI with Trapped Revenue counter, CRITICAL→LOW priorities (7329, 7337); WhatsApp/SMS reactivation messages with regional intent triggers (7339); ingestion from uploaded spreadsheets or manual summaries (7330)
- Agent 9 Local Growth Agent (7345)
  - Generates: local SEO pages, area campaigns, Google Business posts, local WhatsApp promotions, local referral campaigns, neighbourhood landing pages, QR flyers, local community messages (7345)
  - local-growth-agent.ts (6 asset types implemented: SEO pages, GMB posts, WhatsApp promos, referral mechanics, community messages, QR flyer concepts) (7349); local_growth intelligence type + ACU costs (7350); Local Growth Command Centre src/app/dashboard/local/page.tsx (7351); sidebar node (7352); local landmarks/cultural nuance injection (7360); QR physical-to-digital bridging (7362)
- Agent 10 Competitor Spy Agent (7368)
  - Tracks: pricing, reviews, offers, complaints, ads, positioning, service gaps, slow delivery, bad customer sentiment (7368)
  - competitor-spy-agent.ts Deep Market Scan (7372); ACU cost for competitor missions (7373); Live Market Gap Verdict; Node Watchlist (price changes, ad activity); Counter-Tactics Engine (e.g. "Speed-First WhatsApp Funnel", Price-Attack Landing Pages) (7374–7377, 7386); Infiltration Intensity score per gap (7385); benchmarks persisted via useIntelligenceService (7378)
- Agent 11 Revenue Intelligence Agent (7393)
  - Tracks 10 metrics: revenue generated, revenue recovered, revenue lost, CAC, LTV, ROAS, CPL, cost per booking, campaign profit, customer recovery value (7393)
  - revenue-intelligence-agent.ts 10-point economic matrix (7397); Unit Economics Grid (10-card matrix) (7399); Economic Command Hub with "Capital Deployment Accuracy" (7400); Leak Detection Hub with Prevention Protocol (7401); Economic Verdict (SCALE/FIX/STOP/RECOVER) + one-click reallocation to organic nodes (7402); Reallocation Missions (7411)
- Agent 12 Local Threat Discovery Agent (7417, 7420)
  - Constant local scanning for new competitors/competition threats (7417)
  - local-threat-discovery.ts flow — escalation protocols + entrant signals in geographic grid (7422); Local Threat Monitor in competitors dashboard (7424); Live Threat Grid (rival penetration levels) (7425); auto-escalation Watch → Infiltration missions (7426); 5 threat signals incl. New Entrants, Sentiment Shifts, Pricing Aggression, Review Decay, SEO land-grabs/hiring spikes (7420, 7427, 7434); Counter-Measure + priority per threat (7435); unified Agent 10 + Agent 12 view (7436); "Ghost Competitors" detection (7433)

### Landing page type architectures (within 4.6)
- Lead Capture Page — collects name, phone, email, interest, location; for tutors, services, consultations, quotes, events, recruitment, investor leads (6685); leadCaptureSpecs blueprint, Data Use Logic / qualification strategy, simulated Capture Node preview (6689–6692)
- WhatsApp Conversion Page — push visitor into WhatsApp; for food delivery, restaurants, trades, salons, local services, urgent bookings (6709); frictionless transition, immediate-action psychology, branded click-to-chat buttons, "Chat Friction" objection engineering, intent-driven pre-filled messages, "Active Now / Response in 5 mins" urgency hooks (6713–6727)
- Booking Page — convert to appointment; for tutors, beauty salons, consultants, repair services, property viewings, recruitment interviews (6733); Calendar Trust + Slot Scarcity layout logic, bookingConversionLogic, "Secure Your Slot" CTAs, FAQ Mission Intelligence, preparation instructions (6737–6748)
- Order Page — convert to purchase/order; for food, e-commerce, delivery, local products (6768); Checkout Trust, orderConversionLogic (checkout urgency hooks, secure payment / delivery guarantee trust signals), PAS psychology, shopping-bag CTAs (6772–6786)
- App Download Page — drive installs; for delivery platforms, marketplaces, education apps, booking apps (6815); Device Trust, appDownloadLogic (store link strategies, install incentives e.g. 15% off first app order), App Store/Play Store styled CTAs, mobile feature-benefit mapping (6819–6833)
- Partner Sign-Up Page — B2B onboarding of restaurants, drivers, tutors, agencies, suppliers (6839); partnerOnboardingLogic (partnership ROI benefits, friction removal e.g. "Onboarded in 24 hours"), authority-led copy (6843–6846)
- Local SEO Landing Page — rank for "service + city", "near me", neighbourhood targeting (6863); Geographic Relevance + semantic keyword mapping, localSEOLogic (target keywords, location density strategies, LocalBusiness schema directives), "Target Grid (Location)" form field, map + neighbourhood badges in preview (6867–6879)
- Offer Claim Page — urgency around one offer; discounts, limited slots, seasonal promos, first-order deals (6885); Scarcity Visualization + Social Proof of Claim, offerClaimLogic (urgency type: countdown/limited slots; claim process instructions), FOMO + AIDA, unique discount codes (6889–6900)
- (Also in 4.13 pageType enum: event_ticket and reactivation page types) (7149)

### Integrations & dependencies
- Google Maps integration via @react-google-maps/api; [SECRET at line 6792] API key provided by user (6792, 6797)
- google-map-node.tsx reusable component with dark/cyberpunk custom JSON map styles (6798, 6800)
- Geographic Intelligence card in Business Brain (operational grid / market density visualization) (6799, 6806)
- papaparse for CSV ingestion (6400)
- Genkit AI flows throughout; gemini-2.5-flash model routing (6325)
- Firebase/Firestore persistence (backend.json blueprints, security rules, permission-error overlay) (6178, 6261, 6350)
- Tracking pixels: Meta pixel, Google tag, TikTok pixel, LinkedIn insight tag (7100, 7109, 7163)
- WhatsApp click-to-chat with prefilled messages (6725, 7161)
- Midjourney/Imagen-ready AI image prompts (6602)
- QR code generation/download for physical distribution (7100, 7108, 7345)
- UTM builder / attribution parameters (7100, 7110, 7163)

---

## 3. Verbatim-Import Candidates

Coherent standalone specification sections (user-authored spec text) worth preserving word-for-word:

- 5873–5875 — DemandOS final positioning statement
- 5977 — MarketWar OS Master Product Definition (audience + mission bullet list)
- 6004–6173 — User Media + Brand-Consistent Creative Engine full spec (upload list, brand_assets collection, BrandAsset TypeScript schema, agent definition, user options, image rules, colour extraction, workflow, verbatim agent prompt, campaign-pack additions, final developer instruction)
- 6298 — Strategic Positioning spec (do-not/do position lists, core + stronger commercial messages)
- 6320 — Core Business Logic spec (cheap/high-ROI/5x-margin control list)
- 6345–6346 — Layer 1 Business Brain definition
- 6370 — Layer 2 Customer Brain definition
- 6395 — Spreadsheet contact import requirement
- 6419 — Layer 4 Campaign Brain definition (10 components)
- 6441 — Layer 5 Landing Page Brain definition (8 outcomes)
- 6458 — Layer 6 Distribution Brain definition (10 channels)
- 6473 — Layer 7 Revenue Brain definition (9 metrics)
- 6497 — Agent 4.1 Business Diagnosis Agent full spec (inputs, 8 scores, report contents)
- 6519 — Agent 4.2 Customer Pain Agent spec
- 6543 — Agent 4.3 Offer Builder Agent spec (14 offer types, 7 scores)
- 6566 — Agent 4.4 Campaign Commander Agent spec (outputs, 11 modes)
- 6591 — Agent 4.5 Ad Creative Agent spec (13 asset types)
- 6614 — Agent 4.6 core-agent mandate
- 6637–6656 — Agent 4.6 responsibilities list (18 items)
- 6685 — Lead Capture Page spec
- 6709 — WhatsApp Conversion Page spec
- 6733 — Booking Page spec
- 6768 — Order Page spec
- 6815 — App Download Page spec
- 6839 — Partner Sign-Up Page spec
- 6863 — Local SEO Landing Page spec
- 6885 — Offer Claim Page spec
- 6907–6913 — 4.7 Hero Section spec + example copy
- 6936–6957 (duplicated 6984–7004) — 4.7 remaining sections spec (Problem/Offer/Benefits/Proof/Process/FAQ/Urgency/Form-fields/CTA)
- 7028 — 4.8 Landing Page AI Scoring (8 score definitions)
- 7054 — 4.9 Optimisation Rules (12 rules)
- 7077 — 4.10 A/B Testing spec (4 variants + 10 metrics)
- 7100 — 4.11 Publishing System spec (12 capabilities + example URL)
- 7126 — 4.12 Database Collections list (12 collections)
- 7149–7169 — 4.13 LandingPage TypeScript schema (complete type definition)
- 7185–7235 — 4.14 Landing Page Agent Prompt (complete verbatim system prompt)
- 7254 — Agent 5 Lead Capture Agent spec
- 7278 — Agent 6 WhatsApp Sales Agent spec
- 7300 — Agent 7 Budget Protection Agent spec (rules + dashboard vocabulary)
- 7323 — Agent 8 Customer Resurrection Agent spec
- 7345 — Agent 9 Local Growth Agent spec
- 7368 — Agent 10 Competitor Spy Agent spec
- 7393 — Agent 11 Revenue Intelligence Agent spec
- 7417 — Agent 12 request (constant local competitor threat scanning)
- 7477 — System-wide "no generic information" mandate (message continues beyond this range)

Note: lines 6936–6957 and 6983–7004 are near-identical duplicates of the same 4.7 section spec; import once.
