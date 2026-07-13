# 10 — AI Viral Product Engine & AI Website Marketing Intelligence Engine

Adopted 2026-07-13 from the owner extraction
(`docs/reference/viral-product-and-website-engines-extraction.md`, verbatim
record). Two independent agents that share one thesis: **transform, don't
analyse** — a product image or a website URL becomes a complete,
multi-channel, publish-ready campaign in minutes.

Both are orchestrators as much as generators: they chain the existing corps
(Ad Creative, Content Factory, Video Commander, Landing Page, Offer Builder,
Competitor Spy, Retargeting) behind one input and one click — which is why
they ship fast and meter cheaply (template + cached reuse everywhere).

---

## Part A — M-32 AI Viral Product Engine (Agent 21, shipped)

**Input:** 1–100 product images — product photos, lifestyle shots, packaging,
logos, screenshots, Amazon/Etsy/Shopify/marketplace listings.

### A.1 Vision analysis contract (binding output set)

The engine identifies all of: product type · brand · colours · materials ·
style · audience · estimated price positioning · competitors · product
benefits · emotional triggers · luxury-vs-budget positioning · product
weaknesses · viral opportunities · seasonal opportunities · gift potential ·
target countries · market trends · pain points solved — plus three scores:
**Visual Quality Score, Conversion Score, Trust Score** (0–100 each).

### A.2 One-click creates (seven studios)

| Studio | Produces | Backing corps |
|---|---|---|
| Viral Social Posts | Platform-optimised content for Facebook, Instagram, TikTok, X, LinkedIn, Pinterest, Threads, Snapchat, Reddit — captions, hooks, CTAs, hashtags, emojis, platform formatting | Content Factory |
| AI Ad Creator | Image, carousel, story, Reels, Shorts, display, Google, YouTube, LinkedIn, TikTok ads | Ad Creative |
| AI Video Creator | Product, UGC-style, testimonial, explainer, cinematic, luxury-commercial, Amazon, TikTok/Reels/Shorts videos — vertical + landscape | Video War Room (doc 09) |
| AI Copy Studio | Product descriptions, Amazon listings, Shopify copy, SEO copy, landing pages, blog posts, email/SMS/WhatsApp campaigns, push notifications, press releases, influencer briefs | Content Factory + Landing Page |
| AI Image Studio | Lifestyle images, studio renders, seasonal/holiday creatives, luxury mockups, before/after, bundles, banners, infographics, transparent cut-outs, AI backgrounds, billboard mockups | Ad Creative (image models) |
| AI Sales Booster | Upsell/cross-sell offers, bundles, scarcity/countdown/flash campaigns, loyalty, referral, influencer, giveaway campaigns | Offer Builder + Monetisation |
| AI Market Intelligence | Competitor positioning, pricing recommendations, viral trend predictions, target audiences, platform picks, best posting times, suggested budget, **predicted ROAS, conversion probability, purchase-intent score** | Competitor Spy + Revenue Intelligence |

**One-click publish:** direct to connected channels (Meta/Google/TikTok
connectors, doc 05) or export; every asset passes the pre-publish Compliance
gate and carries the AI-content watermark (doc 08 §B.4a).

### A.3 Architecture

- **Vision pass:** gateway multimodal call (image → structured analysis JSON);
  batches of up to 100 images fan out via Cloud Tasks; per-image results merge
  into one product dossier in the vault.
- **Generation passes:** each studio is a prompt-template family over the
  dossier — cached and template-reused aggressively (ACU recycling, §A.2a of
  doc 08): the dossier is computed once, the seven studios draw from it.
- **Storage:** dossiers → `opportunity_briefs`-style collection
  (`product_dossiers`); assets → Cloud Storage with the generated-asset
  registry entry.
- **Margin:** vision pass is the only frontier-cost step; studios run on
  cheap-model routing + templates — the engine is a showcase of
  price-≥-2×-cost with headline-low ACU pricing.

---

## Part B — M-33 AI Website Marketing Intelligence Engine (Agent 22, shipped)

**Input:** any URL — business website, product/landing page,
Shopify/WooCommerce store, Amazon listing, Etsy shop, company/SaaS/restaurant
website, portfolio, booking site.

### B.1 Deep-crawl extraction contract (binding output set)

Products · services · pricing · images · videos · brand identity · fonts ·
colours · logos · audience · CTAs · trust signals · customer reviews · FAQs ·
SEO metadata · content hierarchy · navigation · offers · blog content ·
contact information · social links.

### B.2 Website Health Audit

Evaluates SEO, speed, UX, accessibility, mobile responsiveness, conversion
optimisation, technical issues, brand consistency, security, performance →
one **AI Marketing Health Score** with prioritised recommendations. (Composes
with the shipped Failure Audit: the health audit is site-mechanics; the
failure audit is money-mechanics — the report links both.)

### B.3 Generation suites (six)

| Suite | Produces |
|---|---|
| AI Campaign Factory | Social calendars, 30-day content plans, 90-day growth strategies, seasonal campaigns, product launches, promotional calendars, email/SMS/WhatsApp/push sequences, lead-nurturing funnels |
| AI Creative Generator | On-brand social graphics, video ads, display banners, blog graphics, infographics, product mockups, hero/website banners, story templates, presentation decks |
| AI Funnel Builder | Landing pages, lead magnets, sales/webinar/appointment/course/e-commerce funnels, abandoned-cart flows, checkout optimisation, upsell journeys |
| AI Competitor Intelligence | Benchmark vs competitors on products, pricing, SEO, content, keywords, advertising, social presence, messaging, positioning, sentiment → market gaps + differentiation plays |
| AI Growth Opportunities | New products/services, subscription/membership models, bundles, geographic expansion, partnerships, affiliate/influencer/marketplace opportunities — each with **revenue impact, implementation effort, expected ROI** |
| AI Brand Consistency Engine | Every generated asset matches the site's logo, brand colours, typography, tone of voice, messaging, visual style, brand guidelines — enforced at generation time (same mechanism as Brand Guard, doc 02 §U5) |

**One-click marketing launch:** from a single image or URL → social, video,
paid creatives, email/SMS/WhatsApp, blog/SEO content, landing/product pages,
press releases, influencer outreach kits, sales presentations, printable
materials — generated and optionally published.

### B.4 Architecture

- **Crawler:** Cloud Run job (respects robots.txt, rate-limited, SSRF
  egress-allowlist per doc 08 §B.2); renders JS sites headless; extraction
  pass → structured **site dossier** (brand tokens, catalogue, trust
  signals) stored in the vault; screenshots → Cloud Storage.
- **Health audit:** deterministic checks (speed/mobile/security headers/SEO
  tags) + model-scored UX/conversion/brand-consistency passes → weighted
  Health Score, same scoring pattern as the shipped audit engine.
- **Brand consistency:** dossier brand tokens (colours, fonts, voice) are
  injected into every downstream generation prompt and validated
  post-generation — off-brand assets regenerate before the user sees them.
- **Suites** draw from the dossier with template reuse, same margin profile
  as Part A.

---

## Part C — Shared platform contract

- **Agents 21 & 22** join the roster (21-value `agentType` enum in
  `agent_tasks` grows to 23); both log full reasoning traces, ACU cost,
  provider cost and margin % per task like every agent.
- **ACU metering (illustrative, floor-compliant):** vision dossier ~8 ACUs
  per image batch · site dossier + health audit ~25 ACUs · each studio/suite
  run ~4–12 ACUs (mostly cheap-path). Bundle: "Image → full campaign" and
  "URL → full campaign" one-click packs priced as premium actions in the
  300–500% band.
- **Autonomy:** generation is L1 (reversible); **publishing** follows the
  standard gates — L2 with caps, L3 TOTP-gated, consent-checked sends only.
- **Status:** conversational cores of both agents are ✅ shipped
  (`src/lib/ai/agents.ts`) with dashboard modules
  (`/dashboard/product-engine`, `/dashboard/website-intel`); vision upload
  pipeline, crawler service and channel publishing land with the connector
  phase (P1) — 📘 tracked in the coverage matrix.

---

# v2 UPGRADE — MarketWar VisualStrike AI™ & SiteRaid AI™ (adopted 2026-07-13)

The owner's second extraction (`docs/reference/visualstrike-siteraid-extraction.md`,
verbatim) upgrades both engines from generators into **autonomous viral
campaign factories**: research → create → test → publish → learn → optimise,
continuously. Parts A–C above remain the v1 foundation; everything below is
additive and binding. Positioning: *«One picture or one website. MarketWar
builds, launches and continuously improves the complete campaign — from first
attention to final revenue.»*

## Part D — VisualStrike AI™ (upgrades M-32)

**Core promise:** upload one product picture → a complete, platform-ready
viral campaign — *without ever changing the product's identity, shape,
colour, packaging, logo or specifications*.

1. **Product Intelligence Extraction** — CV + OCR + multimodal reasoning →
   18-element extraction, each with **confidence score, source location on
   the image, editable confirmation, "do not change" lock, "needs user
   confirmation" warning**. The platform never invents a capability or
   health/financial/technical/performance claim.
2. **Product Identity Lock™** — protected identity model (12 locked
   characteristics: shape → core appearance) with six user-selectable
   transformation tiers from *exact preservation* to *controlled creative
   transformation*. **Exact preservation mandatory for regulated/high-value
   products.** Prevents the classic gen-AI failure of ads that misrepresent
   the real product.
3. **Autonomous Product Research Agent** — with user approval, builds a live
   product intelligence file (14 research outputs incl. saturated hooks and
   under-served segments). Never copies competitors — finds the less crowded
   angle.
4. **Viral Potential Score™ (0–100)** — 15 scoring dimensions
   (first-second stopping power → purchase-intent strength) with explained
   scores and improvement paths; a separate **Commercial Potential Score**
   stops the platform confusing empty views with profitable attention.
5. **Viral Angle Generator** — 27 required angle families
   (problem-vs-solution → premium cinematic storytelling); every angle
   carries 11 fields (audience, problem, trigger, hook, message, proof
   requirement, CTA, platform, duration, brand-risk level, commercial
   objective).
6. **Image Transformation Studio** — 17 commercial image types, 14 controls;
   multi-object ads use **separate product-pairing, layout and background
   stages** — never one uncontrolled generation call.
7. **Image-to-Video Factory** — 20 video types (6-second attention ads →
   marketplace videos), 16 controls, and the binding 7-step controlled
   pipeline: preserve product → hero image → motion around protected product
   → voice/music/captions → **product-consistency validation** → platform
   versions → compliance + quality checks.
8. **AI Creator & UGC Studio** — 12 virtual-presenter capabilities under 8
   hard safeguards: AI disclosure, no impersonation, no cloning without
   consent, **no fabricated testimonials, no fake endorsements**, no false
   use claims, no unauthorised likeness, full consent/rights records.
9. **Viral Content Pack Generator** — one approved concept → 32 native
   formats (TikTok video → press-release draft), **adapted natively, never
   merely resized**.
10. **Hook Laboratory™** — ≥130 scored hooks per product (20 visual, 20
    spoken, 20 text, 10 each: curiosity/pain/comparison/objection/urgency/
    community/conversion) with the hook→retention-bridge→CTA structure;
    **deceptive clickbait detected and blocked**.
11. **Global Localisation Engine** — 17 localisation axes; multilingual VO,
    subtitles, lip-sync and **transcreation, not direct translation**.
12. **Autonomous Testing & Optimisation** — 19-variable creative-testing
    matrix; 8-step loop (publish variants → collect → identify winners →
    stop waste → recombine winners → transfer learning cross-platform →
    attribute leads/sales → update **Creative Intelligence Memory**). Must
    distinguish views-vs-intent, engagement-vs-conversion, clicks-vs-LP
    performance, sales-vs-margin, short-term-vs-brand-risk, organic-vs-paid.
13. **One-click campaign modes (8):** Launch Blitz · Viral Sprint (7-day
    trend-led volume) · Sales Conversion · Product Education · Marketplace
    Domination (Amazon/Etsy/TikTok Shop/Shopify) · Local Business Push ·
    Seasonal Takeover · **Always-On Autopilot** (within approved budget +
    brand rules).
14. **14-step user workflow** (upload → confirm facts → lock identity →
    segments/goals → research → angles+scores → select or autonomous →
    packs → compliance approval → preview → publish/schedule → monitor →
    iterate).

## Part E — SiteRaid AI™ (upgrades M-33)

**Core promise:** paste any *authorised* URL → a complete, continuously
optimised marketing and sales operation.

1. **Authorised Website Ingestion** — 13 accepted input types; **mandatory
   authorisation step** (own / manage / permitted / public-competitor
   analysis without republishing protected assets); strict separation of
   competitive analysis vs approved reuse vs original generation vs
   restricted material.
2. **Full Website Understanding** — 34-element extraction with a **visual
   extraction screen** where the user approves/edits/locks/excludes every
   asset.
3. **Business DNA Builder™** — continuously updated 24-field profile
   (market category → referral opportunities).
4. **Website Truth Layer™** — every generated claim linked to source with
   5 classifications: *verified from website / verified from connected data /
   user-confirmed / inferred-awaiting-confirmation / prohibited*. "Best in
   the UK" blocked unless substantiated; performance claims verified before
   publication. **Kills hallucinated advertising.**
5. **Instant Marketing Audit** — six audits in one scan: brand (6 checks),
   conversion (8), content (8), search incl. **AI-search/GEO visibility**
   (8), social (7), commercial (9).
6. **Market Gap & Competitive Attack Map** — 16 gap classes → an Attack Map
   prioritised by quick revenue wins, viral opportunities, conversion
   improvements, differentiation, retention, defensibility. Win without
   copying.
7. **Autonomous Campaign Architect** — five-layer architecture: Awareness ·
   Consideration · Conversion · Retention · Advocacy (34 campaign types
   across layers).
8. **Website-to-Viral Asset Generation** — 30 asset classes from one site.
9. **Site-to-Story Engine™** — website facts → 10 story archetypes (founder
   journeys → social-impact stories); **every story traceable to verified
   business information**.
10. **Trend Hijack with Brand Relevance™** — 11 trend categories through an
    8-factor relevance gate (brand/audience relevance, commercial potential,
    speed, reputation risk, legal risk, sensitivity, saturation); rejects
    trends that damage brands, exploit tragedy or mislead.
11. **Website-to-Influencer Campaign** — 16-part campaign kit; with the
    creator marketplace: identify → invite → negotiate in approved ranges →
    brief → approve → track → milestone payments → rights-respecting reuse.
12. **Competitor Creative Reverse-Engineering** — extracts strategic
    patterns (12 classes), never protected content; user sees what/why/where
    weak/how we differentiate/**what must not be copied**.
13. **Autonomous Landing-Page Generator** — 14 page types, 12 controls
    (brand-matched, A/B, heatmaps, server-side conversion tracking, consent).
14. **Generative Search Visibility Engine (GEO)** — 13 output classes for AI
    answer-engine discovery (entity info, expert answers, citation-friendly
    summaries, topic clusters).
15. **Continuous Website Monitoring** — plan-based rescan; 15 change types
    detected → 7 update proposal classes; **nothing auto-publishes without
    approved autopilot rules**.
16. **16-step user workflow** (paste URL → authorisation → scan → extract →
    Truth Layer review → DNA → audits → Attack Map → objective/budget/
    countries/channels → architecture → assets → compliance review →
    approve or guarded autopilot → publish → track → iterate).

## Part F — Shared Intelligence Layer (binding for both engines)

**20 required agents:** Product Understanding · Website Intelligence ·
Market Research · Customer Psychology · Viral Strategy · Creative Director ·
Scriptwriting · Image Generation · Video Production · Brand Guardian ·
Product Fidelity · Claim Verification · Compliance · Localisation ·
Distribution · Experimentation · Performance · Revenue Attribution ·
**Margin Protection** · Learning. (Mapping: these specialise/extend the
platform roster — e.g. Margin Protection = Agent 20's engine-scoped duty,
Brand Guardian = doc 09 §1.9, Compliance = the pre-publish gate; the roster
composes, nothing is duplicated.)

**MarketWar Creative Knowledge Graph** — 23 core entities (User →
Compliance decision) stored as connected entities so the platform knows:
product→brand, claim→evidence, campaign→audiences, creative→approved
concept, conversion→campaign, winning hook→related product reuse, and **a
rejected claim is never regenerated**. (Extends `knowledge_graph_nodes`,
doc 07a.)

**Autonomy & approval levels (upgrade to the platform dial):**
L0 Draft Only · L1 User Approval per asset · L2 Campaign Approval (strategy
approved, AI publishes permitted variations) · L3 Guarded Autopilot (brand/
budget/channel/compliance limits) · **L4 Revenue Autopilot (budget
reallocation + new assets driven by profitability)**. High-risk categories
locked to L0/L1. *Reconciliation (additive): the platform-wide L0–L3 dial
(doc 02 §2) gains L4 as a publishing-and-budget tier for these engines;
all existing gates (TOTP for L3+, £500 escalation, 60-second reversal)
apply unchanged at L4.*

**Performance dashboard — commercial metrics contract (23):** hook rate ·
3-second retention · avg watch time · completion · save rate · share rate ·
comment quality · profile visits · CTR · LP conversion · lead quality ·
CPL · CPA · revenue · gross profit · ROAS · contribution margin · CAC ·
LTV · refund rate · repeat purchase · creative fatigue · brand-risk events.
**Viral-to-Revenue Funnel:** Impression → Attention → Engagement → Click →
Lead → Purchase → Repeat Purchase → Referral.

**Safety, trust & rights (mandatory 18 controls):** AI-content labelling,
ownership records, creator consent, model releases, copyright + trademark
checks, claim evidence, regulated-category / political / child-safety
restrictions, deepfake + impersonation + synthetic-testimonial prevention,
audit logs, version history, human approval records, provenance metadata,
**C2PA-compatible provenance where supported**. Disclosure metadata is
generated and preserved by default.

## Part G — Developer architecture (adopted verbatim contracts)

- **18 frontend modules** `/visual-strike` → `/billing-acu`. Route mapping
  to the shipped app: `/visual-strike` ↔ `/dashboard/product-engine`,
  `/site-raid` ↔ `/dashboard/website-intel`, `/billing-acu` ↔
  `/dashboard/billing`, `/brand-kit` ↔ doc 09 §1.9 module; remaining
  modules land as the engines' sub-surfaces at P1 (additive — existing
  routes are never renamed away).
- **22 backend services** (vision-analysis → margin-protection) — deployed
  per doc 06 §3.2 (Functions 2nd gen / Cloud Run for heavy generation).
- **24 API endpoints** — 8 VisualStrike, 9 SiteRaid, 7 shared — join the
  doc 07 REST contract under `/api/visual-strike/*`, `/api/site-raid/*`,
  `/api/{claims,compliance,experiments,publishing,autopilot,analytics}/*`.
- **35 core collections** (`organisations` → `marginRecords`) — additive
  onto doc 07a; `acuTransactions`/`providerCosts`/`marginRecords` compose
  with the existing `acu_ledger` + `agent_tasks` margin fields.

## Part H — ACU & profitability (binding commercial rule)

Every generation calculates **actual provider cost before execution**
(pre-generation ACU estimate shown to the user). 15 charge categories
(image analysis → performance optimisation).

**Non-negotiable rule for these engines: `Customer ACU Charge ≥ Actual
Provider Cost × 4`** — a minimum 4× markup before referral rewards, payment
fees, storage, support and overhead. *Reconciliation (additive): this sits
above the platform-wide 100% floor (≥2×, §A.1a of doc 08) — the floor is
unchanged globally; VisualStrike/SiteRaid generation actions carry the
stricter 4× rule, consistent with the video engines' 4× minimum (doc 09)
and the 300–500% recommended band.*

**14 cost controls:** pre-generation estimate · max campaign budget · max
daily ACU burn · low-balance warning · hard stop · cheaper-model fallback ·
draft-resolution preview · duplicate-generation detection · approved-asset
reuse · cached website intelligence · batch discount controls · margin
monitoring by organisation, by feature, by provider.

**Defensibility stack (12):** product/business understanding ·
product-fidelity protection · verified claims · live trend + competitor
intelligence · viral + commercial scoring · multi-platform generation ·
autonomous publishing · revenue attribution · creative experimentation ·
margin-controlled AI consumption · compliance + provenance · continuously
learning Business Creative Memory.
