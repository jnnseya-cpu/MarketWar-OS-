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
