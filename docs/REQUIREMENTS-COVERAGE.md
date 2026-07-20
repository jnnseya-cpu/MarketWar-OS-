# MarketWar OS — Requirements Coverage Matrix

**Purpose.** This is the master traceability register for the MarketWar OS repository. Every named agent,
module, engine, dashboard, score, pricing tier and data-model element found in the uploaded master notes
document (Document 1, preserved verbatim in `docs/reference/source-notes/`, parts 01–15) and in the
AI-OS Transformation Specification v3.0 (Document 2, `docs/reference/ai-os-specification-v3-imported.md`)
is mapped to its current status in this repository. Nothing has been dropped: if a requirement is not
implemented or specified, it is preserved verbatim and tracked here as backlog.

**Status legend**

| Status | Meaning |
|---|---|
| ✅ IMPLEMENTED | Working code exists in this repo (`src/`), runnable today |
| 📘 SPECIFIED | Covered by the engineering blueprint (`docs/ai-os/01–08`, `docs/PRODUCTION-ARCHITECTURE.md`, `docs/DEPLOYMENT.md`) — buildable spec, no code yet |
| 📦 PRESERVED | Captured verbatim in `docs/reference/source-notes/` (backlog — not yet specified in the blueprint nor coded) |

**Sources & provenance**

- Verbatim source: `docs/reference/source-notes/` — 15 part files covering Document 1 lines 1–20537 (line refs below are Document 1 line numbers; each part's line range is listed in `source-notes/README.md`).
- Line-by-line inventories: `docs/reference/extraction-inventories/inventory-1.md` … `inventory-9.md`.
- Document 2 verbatim import: `docs/reference/ai-os-specification-v3-imported.md` (17 sections).
- Blueprint: `docs/ai-os/01-executive-vision-and-market.md` … `08-monetisation-security-roadmap.md`.

**Summary counts (rows per theme)**

| # | Theme | Rows | ✅ (incl. partial) | 📘 | 📦 |
|---|---|---|---|---|---|
| 1 | Core AI agents | 91 | 35 | 9 | 47 |
| 2 | Platform modules | 47 | 23 | 13 | 11 |
| 3 | Dashboards & account system | 35 | 25 | 6 | 4 |
| 4 | Master Platform AI OS Prompt rules | 21 | 7 | 7 | 7 |
| 5 | Autonomous Campaign Engine | 30 | 13 | 7 | 10 |
| 6 | DemandOS / organic acquisition engines | 25 | 5 | 9 | 11 |
| 7 | Customer Resurrection Engine | 15 | 1 | 2 | 12 |
| 8 | Landing-page subsystem | 24 | 9 | 1 | 14 |
| 9 | Competitor-inspired feature packs | 24 | 12 | 0 | 12 |
| 10 | Independence / external-API architecture | 21 | 4 | 6 | 11 |
| 11 | Pricing & ACU economics | 26 | 8 | 12 | 6 |
| 12 | Data model | 12 | 1 | 2 | 9 |
| 13 | Zero Generic Info Protocol & behaviour mandates | 12 | 8 | 0 | 4 |
| 14 | Document 2 — AI-OS Transformation Spec v3.0 | 18 | 0 | 18 | 0 |
| — | **Total requirement rows** | **401** | **122** | **96** | **183** |

Plus §15 Gaps & conflicts register (15 entries) and §16 Security note (8 redacted credential lines).
A row counted under ✅ may be "✅ partial" — working code covers the core of the requirement while the full
spec depth remains backlog; each row's own status cell is authoritative. Many 📦 rows enumerate multiple
named items (e.g. a 10-agent pack per row), so the underlying requirement count is far higher than 401.

---

## 1. Core AI agents

### 1.1 The original 10 product agents (Document 1, Part 01, L21–41)

All ten exist as working agents with anti-generic prompts in `src/shared/agents.ts`, callable via
`POST /api/agents/[agentId]` (`src/app/api/agents/[agentId]/route.ts`), with runs persisted through `src/backend/db.ts`.

| Requirement | Source | Status | Where |
|---|---|---|---|
| Business Diagnosis Agent (audits product, pricing, audience, landing page, offer, past ads, funnel) | Part 01 L23; inv-1 | ✅ | `src/shared/agents.ts` (`business-diagnosis`) + deterministic scoring in `src/backend/audit.ts` |
| Customer Pain Agent (pain points, objections, buying triggers, emotional hooks) | Part 01 L25; inv-1 | ✅ | `src/shared/agents.ts` (`customer-pain`) |
| Offer Builder Agent (discount, bundle, guarantee, urgency, referral, trial, lead magnet) | Part 01 L27; inv-1 | ✅ | `src/shared/agents.ts` (`offer-builder`) |
| Ad Creative Agent (FB/IG/TikTok/Google/LinkedIn copy, hooks, scripts, image prompts) | Part 01 L29; inv-1 | ✅ | `src/shared/agents.ts` (`ad-creative`) |
| Campaign Commander Agent (test campaigns, small budgets, clear objectives) | Part 01 L31; inv-1 | ✅ | `src/shared/agents.ts` (`campaign-commander`) |
| Budget Protection Agent (pause zero-lead campaigns, recommend changes) | Part 01 L33; inv-1 | ✅ | `src/shared/agents.ts` (`budget-protection`) + `src/app/dashboard/budget/` |
| Lead Capture Agent (landing pages, WhatsApp flows, forms, follow-up, retargeting) | Part 01 L35; inv-1 | ✅ | `src/shared/agents.ts` (`lead-capture`) |
| Competitor Spy Agent (competitors, offers, ads, pricing, positioning) | Part 01 L37; inv-1 | ✅ | `src/shared/agents.ts` (`competitor-spy`) + `src/app/dashboard/competitors/` |
| Local Growth Agent (hyper-local campaigns for local verticals) | Part 01 L39; inv-1 | ✅ | `src/shared/agents.ts` (`local-growth`) + `src/app/dashboard/local/` |
| Revenue Intelligence Agent (what produced leads, bookings, sales, calls, messages) | Part 01 L41; inv-1 | ✅ | `src/shared/agents.ts` (`revenue-intelligence`) + `src/app/dashboard/revenue/` |
| Content Factory agent (30-day calendars, scripts, posts — agentised from Module: Content Factory) | Part 01 L182–205; inv-1 | ✅ | `src/shared/agents.ts` (`content-factory`) + `src/app/dashboard/content/` |
| AI Growth Strategist™ ("live CMO", daily briefings, top-3 actions/risks/opportunities) | Part 05 L2759–2789; Part 13 L14084–14098; inv-3, inv-8 | ✅ | `src/shared/agents.ts` (`growth-strategist`) + `src/app/dashboard/briefing/` |

### 1.2 The Master Platform AI OS Prompt's 10 core agents (Part 03, L704–740)

Platform-generic agent corps from the master OS prompt. Conceptually superseded by the blueprint's
agent ecosystem (`docs/ai-os/03-agent-ecosystem.md` — Master Orchestrator, executive agents, engineering/QA,
cybersecurity corps, compliance agents), which covers the same responsibilities at production grade.

| Requirement | Source | Status | Where |
|---|---|---|---|
| Strategy Agent (objective, direction, best route, leverage) | Part 03 L712–713; inv-1 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (executive/strategy agents) |
| Workflow Agent (stages, bottlenecks, next actions, automation) | Part 03 L715–716; inv-1 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (self-managing platform layer) |
| Data Intelligence Agent (patterns, missing info, summaries, insights) | Part 03 L718–719; inv-1 | 📘 | `docs/ai-os/03-agent-ecosystem.md`; `docs/ai-os/06-architecture.md` (data intelligence) |
| Prediction Agent (forecasts, risks, delays, cost impact, failure points) | Part 03 L721–722; inv-1 | 📘 | `docs/ai-os/03-agent-ecosystem.md`; doc2 §10.2 predictive models |
| Document Agent (create/edit/review/summarise/compare docs, version control) | Part 03 L724–725; inv-1 | 📦 | `source-notes/03-master-platform-ai-os-prompt.md` |
| Communication Agent (emails, messages, notices, reports, proposals) | Part 03 L727–728; inv-1 | 📦 | `source-notes/03-master-platform-ai-os-prompt.md` |
| Compliance Agent (rules, obligations, approvals, deadlines, policies) | Part 03 L730–731; inv-1 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (compliance agents) |
| Commercial Agent (cost, revenue, pricing, ROI, margins, value leakage) | Part 03 L733–734; inv-1 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (revenue agents); `docs/ai-os/08` |
| Automation Agent (repeated actions → automated workflows, triggers) | Part 03 L736–737; inv-1 | 📘 | `docs/ai-os/03-agent-ecosystem.md`; doc2 §11 automation framework |
| Personalisation Agent (adapts UX to role, behaviour, goals, history) | Part 03 L739–740; inv-1 | 📦 | `source-notes/03-master-platform-ai-os-prompt.md` |

### 1.3 The numbered agent system 4.1–4.14 and 5–12 (Parts 11 & 14)

The transcript/Version-B numbered system. 4.1–4.5 and 5–11 correspond to implemented agents above;
the landing-page sub-agents 4.6–4.14 and Agent 12 are backlog.

| Requirement | Source | Status | Where |
|---|---|---|---|
| 4.1 Business Diagnosis Agent (13 inputs, 8 scores, "Why You Are Not Getting Customers" report) | Part 11 L6496–6515; Part 14 L14558–14594; inv-6, inv-8 | ✅ | `src/shared/agents.ts` (`business-diagnosis`) + `src/backend/audit.ts` — **9-score deterministic engine** (conversionRisk, offerWeakness, audienceMismatch, landingPage, trust, adCreative, followUpReadiness, revenueLeakage, campaignReadiness), meeting/exceeding the 8-score spec |
| 4.2 Customer Pain Agent (trigger map, objection map, persuasion angle, CTA/LP/WhatsApp direction) | Part 11 L6518–6539; Part 14 L14596–14616 | ✅ | `src/shared/agents.ts` (`customer-pain`) |
| 4.3 Offer Builder Agent (14 offer types, 7 offer scores) | Part 11 L6542–6562; Part 14 L14618–14643 | ✅ partial | `src/shared/agents.ts` (`offer-builder`) + `src/app/dashboard/offers/`; full 14-type/7-score matrix 📦 |
| 4.4 Campaign Commander Agent (11 outputs, 11 campaign modes) | Part 11 L6565–6587; Part 14 L14645–14671 | ✅ partial | `src/shared/agents.ts` (`campaign-commander`) + `src/app/dashboard/campaigns/` |
| 4.5 Ad Creative Agent (13 asset types, AIDA/PAS) | Part 11 L6590–6610; Part 14 L14673–14689 | ✅ | `src/shared/agents.ts` (`ad-creative`) |
| 4.6 AI Landing Page Creation Agent (core-agent mandate, 18 responsibilities) | Part 11 L6613–6678; Part 14 L14691–14717 | ✅ | `src/backend/landing.ts` (`generateLandingPage`) + `/api/landing` + `/dashboard/landing-builder` (Conversion Architect) + `landing-page-architect` agent (Agent 36); selects type → structure → copy → CTA → form → tracking → A/B → scores → fixes |
| 4.7 Landing Page Structure Generator (Hero/Problem/Offer/Benefits/Proof/Process/FAQ/Urgency/Form/CTA) | Part 11 L6906–7023; Part 14 L14809–14922 | ✅ | `buildSections()` in `src/backend/landing.ts` (all sections + booking/order/app-specific blocks) |
| 4.8 Landing Page AI Scoring (8 scores incl. Friction, Lead Quality) | Part 11 L7027–7049; Part 14 L14924–14941 | ✅ | `scoreLanding()` — all 8 (conversion/clarity/trust/urgency/mobile/emotional/friction/lead-quality); smoke-verified |
| 4.9 Landing Page Optimisation Rules (12 fix rules, projected score lift) | Part 11 L7053–7072; Part 14 L14943–14956 | ✅ | `optimisationRecommendations()` in `src/backend/landing.ts` (score-driven fix rules) |
| 4.10 Landing Page A/B Testing (variants A–D, 10 tracked metrics) | Part 11 L7076–7095; Part 14 L14958–14978 | ✅ partial | `abVariants()` (A offer / B pain / C trust / D urgency + hypothesis) in `src/backend/landing.ts`; live metric tracking 📦 |
| 4.11 Landing Page Publishing System (slugs, subdomains, QR, pixels, UTM, `marketwar.co/b/{business}/{slug}`) | Part 11 L7099–7121; Part 14 L14980–14995 | ✅ partial | slug + `publishUrl` (`marketwar.co/b/{business}/{slug}`) + UTM/pixel config in `src/backend/landing.ts`; hosted renderer + QR + custom domain 📦 |
| 4.12 Landing Page Database Collections (12 collections) | Part 11 L7125–7144; Part 14 L14997–15009 | 📦 | `source-notes/11`, `source-notes/14`; relational analogue 📘 in `docs/ai-os/07-database-and-api.md` |
| 4.13 LandingPage TypeScript schema (pageType enum, formConfig, tracking, scores, metrics) | Part 11 L7148–7181; Part 14 L15011–15096 | ✅ | `GeneratedLandingPage` in `src/backend/landing.ts` implements the schema (10-type pageType enum, formConfig+submitAction, whatsappConfig, tracking, 8 scores) |
| 4.14 Landing Page Agent Prompt (verbatim system prompt, JSON output) | Part 11 L7184–7249; Part 14 L15098–15149 | ✅ | `landing-page-architect` agent system prompt in `src/shared/agents.ts` (structured JSON output mandate) |
| Agent 5 Lead Capture Agent (8 capture types, 7 lead scores) | Part 11 L7253–7273; Part 14 L15151–15170 | ✅ partial | `src/shared/agents.ts` (`lead-capture`); 7-dimension lead-score model 📦 |
| Agent 6 WhatsApp Sales Agent (9 conversational capabilities) | Part 11 L7277–7295; Part 14 L15172–15184 | ✅ partial | `src/app/dashboard/whatsapp/` UI + `lead-capture` agent; dedicated conversational agent 📦 |
| Agent 7 Budget Protection Agent (8 intervention rules; STOP/FIX/SCALE/RECOVER/WATCH/TEST; 25% no-lead auto-STOP) | Part 11 L7299–7318; Part 14 L15186–15205 | ✅ partial | `src/shared/agents.ts` (`budget-protection`); automated 25% stop-loss trigger 📦 |
| Agent 8 Customer Resurrection Agent (7 input sources, 5 outputs, priority recovery list) | Part 11 L7322–7340; Part 14 L15207–15223 | ✅ partial | `src/app/dashboard/recovery/` (lead recovery UI); full resurrection agent — see §7 |
| Agent 9 Local Growth Agent (8 generated asset types) | Part 11 L7344–7363; Part 14 L15225–15236 | ✅ | `src/shared/agents.ts` (`local-growth`) |
| Agent 10 Competitor Spy Agent (9 tracked signals, counter-tactics) | Part 11 L7367–7388; Part 14 L15238–15250 | ✅ | `src/shared/agents.ts` (`competitor-spy`) |
| Agent 11 Revenue Intelligence Agent (10 metrics, unit-economics grid, SCALE/FIX/STOP/RECOVER verdicts) | Part 11 L7392–7412; Part 14 L15252–15265 | ✅ | `src/shared/agents.ts` (`revenue-intelligence`) |
| Agent 12 Local Threat Discovery Agent (constant competitor scanning, 5 threat signals, "Ghost Competitors") | Part 12 L7416–7437; inv-6 | 📦 | `source-notes/12-build-transcript.md`; partial overlap with `competitor-spy` ✅ |

### 1.4 The 22-agent list — consolidated spec Version A (Part 13, L14189–14212)

| Requirement | Source | Status | Where |
|---|---|---|---|
| BusinessDiagnosisAgent | Part 13 L14189–14212; inv-8 | ✅ | `src/shared/agents.ts` (`business-diagnosis`) |
| CustomerPainAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`customer-pain`) |
| OfferBuilderAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`offer-builder`) |
| CampaignCommanderAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`campaign-commander`) |
| VisualCreativeAgent (dedicated visual/image generation agent) | Part 13 L14189–14212 | 📦 | `source-notes/13-consolidated-spec-version-a.md`; creative direction partially in `ad-creative` ✅ |
| CopywritingAgent (dedicated; AIDA/PAS/FOMO/scarcity/authority/social proof/curiosity/local identity/emotional/loss-aversion models) | Part 13 L14189–14212, L13782–13807 | ✅ | copy generation in `src/backend/warfare.ts` (AIDA/PAS/hooks/CTA) + `ad-creative` + `content-factory`; surfaced by the `campaign-warfare-strategist` agent |
| HashtagAgent (hashtag generation + 6-factor scoring) | Part 13 L14189–14212, L13809–13827 | ✅ | scored, classed hashtag generation in `src/backend/warfare.ts` (`buildHashtags`); also emitted by `content-factory` |
| LandingPageAgent | Part 13 L14189–14212 | 📦 | see §8 landing-page subsystem |
| WhatsAppSalesAgent | Part 13 L14189–14212 | ✅ partial | `src/app/dashboard/whatsapp/` |
| SMSFollowUpAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; follow-up module 📘 in `docs/ai-os/04-platform-modules.md` |
| EmailFollowUpAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; 📘 `docs/ai-os/04` |
| RetargetingAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; 📘 `docs/ai-os/04` (retargeting module) |
| BudgetProtectionAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`budget-protection`) |
| CustomerResurrectionAgent | Part 13 L14189–14212 | 📦 | see §7 |
| CompetitorSpyAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`competitor-spy`) |
| ReviewMiningAgent (pain points, language, competitor failures from reviews) | Part 13 L14189–14212, L14045–14062 | 📦 | `source-notes/13`; `source-notes/04` L1430–1444 |
| LocalGrowthAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`local-growth`) |
| ReferralGrowthAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; referral engine 📘 in `docs/ai-os/04` |
| MarketplaceDemandRouterAgent | Part 13 L14189–14212, L14000–14025 | 📦 | `source-notes/13`; marketplace 📘 in `docs/ai-os/01` (phase-3 vision) |
| RevenueIntelligenceAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`revenue-intelligence`) |
| GrowthStrategistAgent | Part 13 L14189–14212 | ✅ | `src/shared/agents.ts` (`growth-strategist`) |
| ComplianceSafetyAgent | Part 13 L14189–14212 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (compliance agents); `docs/ai-os/08` (zero-trust) |

### 1.5 The 7 Core Marketing Strategy Agents (Part 15, L15520–16293)

Complete developer spec: each agent has inputs, outputs, scores, a Firestore collection, a TypeScript schema
and a verbatim system prompt, chained via an 8-step workflow with `/ai-agents/*` routes and ACU prices
(Avatar 30 / Message Weapon 35 / Channel Commander 35 / Content Plan 80 / Funnel 70 / Ads Risk 60 / Battle Plan 50; bundle 350 ACUs, £5 pack).

| Requirement | Source | Status | Where |
|---|---|---|---|
| Agent 1 — AI Customer Avatar Agent (10 outputs, 7 scores, `customer_avatars`) | Part 15 L15525–15606; inv-9 | 📦 | `source-notes/15-marketing-strategy-agents-and-tail.md`; overlaps `customer-pain` ✅ |
| Agent 2 — AI Message Weapon Agent (UVP, 3 slogans, objection responses, 6 scores, `messaging_strategies`) | Part 15 L15607–15715 | 📦 | `source-notes/15` |
| Agent 3 — AI Channel Commander Agent (top-3 channels of 18, owned-first prioritisation, `channel_strategies`) | Part 15 L15716–15806 | 📦 | `source-notes/15` |
| Agent 4 — AI 90-Day Content War Plan Agent (9 pillars, 8 journey stages, 1→7 repurposing, `content_plans`) | Part 15 L15807–15900 | 📦 | `source-notes/15`; 30-day calendar ✅ partial via `content-factory` |
| Agent 5 — AI Funnel Architect Agent (10 funnel stages, mandatory Landing Page Agent trigger, `funnels`) | Part 15 L15901–15993 | 📦 | `source-notes/15` |
| Agent 6 — AI Paid Ads Risk-Control Agent (readiness gate, "Do not spend yet", stop-loss rules, `paid_ad_strategies`) | Part 15 L15994–16090 | 📦 | `source-notes/15`; readiness-gate philosophy ✅ partial in audit verdicts |
| Agent 7 — AI Marketing Battle Plan Agent (one-page plan, 30-day weekly actions, `marketing_battle_plans`) | Part 15 L16091–16167 | 📦 | `source-notes/15` |
| 8-step agent workflow chain + `/ai-agents/*` navigation + dashboard cards (Revenue Impact Score) + `AiAgentSession` schema + ACU prices | Part 15 L16169–16293 | 📦 | `source-notes/15` |

### 1.6 Competitor-pack premium agents (~95 named agents, Parts 12 & 15)

Full agent lists preserved verbatim; none are coded. Grouped per pack — every name enumerated.

| Requirement | Source | Status | Where |
|---|---|---|---|
| Serper pack (10): WarRoom Intelligence Dashboard, Opportunity Radar, Competitor SpyGlass, Lead Hunter AI, SEO Dominator, Trend Miner, Product WarLab, Reputation Shield, AI Research Desk, Campaign Builder AI | Part 12 L8799–8817; Part 15 L19351–19361 | 📦 | `source-notes/12`, `source-notes/15` |
| Apollo pack (10): LeadWar Room, ICP Architect, Decision-Maker Hunter, Intent Radar, Enrichment Engine, Outreach Commander, DealScore AI, CRM Battleboard, Reply Intelligence, Revenue Automation Agent | Part 12 L9075–9084; Part 15 L19575–19585 | 📦 | `source-notes/12`, `source-notes/15` |
| YepAPI pack (10): SEO Doctor AI, Keyword Hunter AI, SERP Watcher AI, Backlink Builder AI, Competitor Assassin AI, Content Commander AI, GEO Visibility AI, Local Dominator AI, YouTube Growth AI, Report Builder AI | Part 12 L9294–9303; Part 15 L19755–19765 | 📦 | `source-notes/12`, `source-notes/15` |
| Brevo engagement pack (10): Campaign Commander AI, Deliverability Guardian AI, Audience Builder AI, Copy Optimiser AI, Send-Time AI, Reputation Shield AI, Lifecycle Automation AI, Revenue Recovery AI, Compliance AI, CRM Growth AI | Part 12 L9478–9487; Part 15 L19922–19932 | 📦 | `source-notes/12`, `source-notes/15` |
| Brevo incorporation pack (17): AI Email Revenue Agent, AI SMS Conversion Agent, AI WhatsApp Sales Agent, AI Push Notification Agent, AI Live Chat Agent, AI Conversion Chatbot Agent, AI Unified Inbox Assistant, AI CRM Sales Assistant, AI Booking Assistant, AI Call Summary Agent, AI Loyalty Growth Agent, AI Customer Data Analyst, AI Auto-Segmentation Agent, AI Product Recommendation Agent, AI Transactional Message Agent, AI Ecommerce Recovery Agent, AI Omnichannel Campaign Agent | Part 12 L12302–12319; Part 15 L17469–17485 | 📦 | `source-notes/12`, `source-notes/15`; connector strategy 📘 `docs/ai-os/05-bitripay-and-connectors.md` |
| Contact Extractor / Lead Harvest pack (10): Company Finder AI, Email Extractor AI, Contact Verifier AI, Compliance Guardian AI, Lead Scoring AI, Outreach Writer AI, Deliverability Guardian AI, Campaign Launcher AI, Reply Classifier AI, CRM Sync AI | Part 12 L9675–9684; Part 15 L20078–20088 | 📦 | `source-notes/12`, `source-notes/15` |
| Trustpilot pack (9): Review Collector AI, TrustScore AI, Reputation Guardian AI, Response Writer AI, Fake Review Shield AI, Social Proof AI, CX Insight AI, AI Visibility Optimiser, Competitor Trust Spy | Part 12 L9876–9884; Part 15 L20248–20257 | 📦 | `source-notes/12`, `source-notes/15` |
| Yelp pack (10): Local Finder AI, Quote Match AI, Reputation Guardian AI, Profile Optimiser AI, Local Ads AI, Booking Agent AI, Review Insight AI, Local SEO AI, Lead Response AI, Trust Verification AI | Part 12 L10087–10096; Part 15 L20426–20436 | 📦 | `source-notes/12`, `source-notes/15` |
| Yell pack (10): Business Finder AI, Contact Extractor AI, Outreach Launcher AI, Local SEO AI, Review Guardian AI, Quote Match AI, Lead Scoring AI, Deliverability Guardian AI, Marketing Audit AI, CRM Pipeline AI | Part 12 L10228; Part 15 L20533–20534 | 📦 | `source-notes/12`, `source-notes/15` |
| TrustSeller AI creator-commerce agents (9): Creator Discovery, Fraud & Risk, Audience Match, Offer Engineering, Content Brief, Content Approval, Tracking, Payment, Performance Optimisation | Part 12 L10857–10949; inv-7 | 📦 | `source-notes/12-build-transcript.md` |
| MarketWar Contact Agent required agents (12): Company Resolver, Public Source Search, Website Extraction, Email Pattern, Phone & WhatsApp, Contact Verification, Compliance, Opportunity Scoring, Message Personalisation, Outreach Execution, Reply & Booking, Revenue Attribution | Part 12 L11603–11627 | 📦 | `source-notes/12-build-transcript.md` |
| Guaranteed-Growth architecture agents (9): Growth Diagnostic, Offer Engineering, Channel Intelligence, Creator Commerce, Local Growth, AI Content Factory, AI Sales Pipeline, Reputation & Trust, Revenue Attribution | Part 12 L11153–11450 | 📦 | `source-notes/12-build-transcript.md` |
| Zeely-gap vertical agents (10): Restaurant Growth, Real Estate, Construction Leads, Beauty Salon, Church/Event Promotion, School Recruitment, Travel Package, E-commerce Product, Local Services, Political/Governance Campaign | Part 12 L10414–10426 | 📦 | `source-notes/12-build-transcript.md` |
| Enterprise-expansion agents (8): AI voice calling, automated sales closers, AI appointment setters, conversational WhatsApp agents, AI negotiation flows, AI upsell, AI customer support, AI retention | Part 04 L1968–1986; inv-2 | 📦 | `source-notes/04-customer-acquisition-os-pivot.md` |
| Brevo pass-1 AI capability agents (12): AI Campaign Copy, AI Auto-Segmentation, AI Send-Time Optimisation, AI Product Recommendation, AI Sales Assistant, AI Contact Enrichment, AI Deal Creation, AI Sales Email, AI Data Analyst, AI Conversation Summary, AI Suggested Reply, AI Support Tone | Part 15 L16785–16799 | 📦 | `source-notes/15` |
| Early prototype flows: Extreme Targeting Engine, Distribution Strategist, Resurrection Intelligence Flow, Campaign Warfare Agent, Viral Loop Agent, AI Brand Visual Creation Agent | Part 02 L616–617; Part 04 L2015; Part 08 L4764; Part 11 L5969, L6060–6179 | 📦 | `source-notes/02/04/08/11` (built in the discarded Firebase Studio prototype, not in this repo) |
| Blueprint agent corps: Master Orchestrator Agent, growth corps, executive agents, engineering/QA agents, cybersecurity corps, revenue/customer/compliance agents, self-managing platform layer | doc2 §3–4; inv refs throughout | 📘 | `docs/ai-os/03-agent-ecosystem.md` |

---

## 2. Platform modules

### 2.1 The 7 original modules (Part 01, L43–222)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Marketing Failure Audit (10 inputs; 6 scores: conversion risk, offer weakness, audience mismatch, landing page, trust, ad creative; funnel leak map; "Why you got 0 customers" report) | Part 01 L43–84; inv-1 | ✅ | `src/backend/audit.ts` (deterministic scoring engine) + `src/app/dashboard/audit/` + `POST /api/audit`; results persisted via `src/backend/db.ts` |
| AI Campaign War Room dashboard (spend, leads, CPL, cost/message, cost/booking, best hook, worst ad, best audience, stop-today / test-tomorrow directives) | Part 01 L86–107 | ✅ | `src/app/dashboard/war-room/` + `src/app/dashboard/page.tsx` (command center) with `src/components/charts.tsx` |
| One-Click Campaign Builder (9 selectable goals; 9 AI outputs incl. audience, copy, landing page, budget split) | Part 01 L109–148 | ✅ | `src/app/dashboard/campaigns/` + `campaign-commander` agent |
| AI Landing Page Generator (headline, offer, problem, benefits, proof, FAQ, CTA, WhatsApp button, lead form, pixels, A/B) | Part 01 L150–173 | ✅ partial | `src/app/dashboard/landing-pages/` (generation UI); full subsystem — see §8 |
| WhatsApp + SMS Conversion Engine (ad → WhatsApp → AI qualification → offer → booking → follow-up → retargeting) | Part 01 L175–180 | ✅ partial | `src/app/dashboard/whatsapp/` (WhatsApp center UI, demo conversations); live WhatsApp Business API sending 📦 |
| Content Factory (30-day calendar, Reels/TikTok scripts, FB/LinkedIn posts, IG captions, hashtags, community/promo/before-after/testimonial posts) | Part 01 L182–205 | ✅ | `src/app/dashboard/content/` + `content-factory` agent |
| AI Retargeting Engine (tracks clicked-no-buy, ghosted messages, page views, form starts, video watches, app installs; sends targeted follow-up) | Part 01 L207–222 | 📘 | `docs/ai-os/04-platform-modules.md` (retargeting module); recovery UI ✅ partial at `src/app/dashboard/recovery/` |

### 2.2 The 25-module consolidated spec, Version A (Part 13, L13432–14131)

| Requirement | Source | Status | Where |
|---|---|---|---|
| MODULE 1 Business Onboarding Intelligence (17 inputs → 7 AI outputs incl. campaign readiness score) | Part 13 L13433–13461; inv-8 | ✅ partial | `src/app/onboarding/` (4-step onboarding); full 17-field intake 📦 |
| MODULE 2 AI Marketing Failure Audit (13 audit areas, 8 scores, report) | Part 13 L13463–13498 | ✅ | `src/backend/audit.ts` + `src/app/dashboard/audit/` — **9 scores implemented** (meets/exceeds the 8-score spec; §15 #7 resolved) |
| MODULE 3 Business Brain (18 stored attributes, 7 AI uses) | Part 13 L13500–13529 | 📘 | `docs/ai-os/04-platform-modules.md`; `docs/ai-os/06-architecture.md` (data intelligence) |
| MODULE 4 Customer Intelligence Vault (14 data sources, 28 customer fields, 11 AI segments) | Part 13 L13531–13589 | ✅ partial | `src/app/dashboard/customers/` (customer vault UI, demo data); import + field schema 📦 |
| MODULE 5 AI Customer Resurrection Engine (10-step process, Revenue Recovery Score™, 9 campaign types) | Part 13 L13591–13618 | 📦 | see §7; recovery UI ✅ partial `src/app/dashboard/recovery/` |
| MODULE 6 Offer Builder Engine (14 offer types, 7 scores, 5 recommendations) | Part 13 L13620–13653 | ✅ partial | `src/app/dashboard/offers/` + `offer-builder` agent |
| MODULE 7 AI Campaign Pack Generator (17 pack contents; Starter/Growth/Domination pack types) | Part 13 L13655–13712 | 📦 | `source-notes/13`; campaign generation ✅ partial via `campaign-commander` |
| MODULE 8 Autonomous Campaign Warfare Engine (autonomy L1–L3, 7 safety controls) | Part 13 L13714–13741 | 📘 | `docs/ai-os/02-users-and-command-centres.md` (autonomy dial L0–L3); execution engine 📦 |
| MODULE 9 AI Visual Creation Engine (12 visual types, 8 inputs, 11 visual-intelligence rules) | Part 13 L13743–13780 | ✅ | visual concepts (`src/backend/warfare.ts`) + image rendering via the multi-provider image gateway (`src/backend/image-gateway.ts`, `/dashboard/studio`); `source-notes/13`; also Part 08 L4398–4485 |
| MODULE 10 AI Copywriting Engine (13 copy types, 10 persuasion models) | Part 13 L13782–13807 | ✅ | AIDA/PAS/hooks/CTA in `src/backend/warfare.ts` + `ad-creative` + `content-factory` agents |
| MODULE 11 Hashtag & Local Discovery Engine (8 hashtag types, 6-factor scoring) | Part 13 L13809–13827 | ✅ | classed + scored hashtags in `src/backend/warfare.ts` (`buildHashtags`); `source-notes/13` |
| MODULE 12 Landing Page Generator (15 sections, 7 scores) | Part 13 L13829–13855 | ✅ partial | `src/app/dashboard/landing-pages/`; see §8 |
| MODULE 13 WhatsApp Sales Center (11 features, 10 conversation statuses) | Part 13 L13857–13882 | ✅ partial | `src/app/dashboard/whatsapp/` |
| MODULE 14 SMS & Email Follow-Up Engine (7-step timing ladder instant→30-day, 8 message types) | Part 13 L13884–13903 | 📘 | `docs/ai-os/04-platform-modules.md` (follow-up module) |
| MODULE 15 Retargeting Engine (8 tracked behaviours, 7 actions) | Part 13 L13905–13922 | 📘 | `docs/ai-os/04-platform-modules.md` |
| MODULE 16 Budget Protection Engine (8 rules, 7 guard metrics, STOP/FIX/SCALE/WATCH/RECOVER/TEST) | Part 13 L13924–13952 | ✅ partial | `src/app/dashboard/budget/` + `budget-protection` agent; automated enforcement 📦 |
| MODULE 17 Local Domination Engine (11 features incl. postcode demand maps, QR flyers) | Part 13 L13954–13974 | ✅ partial | `src/app/dashboard/local/` + `local-growth` agent; SEO-page generation 📦 |
| MODULE 18 Community Distribution Engine (11 channels, 7 affiliate features) | Part 13 L13976–13998 | 📘 | `docs/ai-os/04-platform-modules.md` (distribution modules) |
| MODULE 19 Marketplace Demand Router (11 listing elements, demand-routed search) | Part 13 L14000–14025 | 📘 | `docs/ai-os/01-executive-vision-and-market.md` (phase-3 marketplace vision) |
| MODULE 20 Competitor Intelligence Center (9 tracked, 5 AI outputs) | Part 13 L14027–14043 | ✅ | `src/app/dashboard/competitors/` + `competitor-spy` agent |
| MODULE 21 Review Mining Engine (8 extracted signals, 5 uses) | Part 13 L14045–14062 | 📦 | `source-notes/13`; also Part 04 L1430–1444 |
| MODULE 22 Revenue Intelligence Dashboard (15 tracked metrics) | Part 13 L14064–14082 | ✅ | `src/app/dashboard/revenue/` + `revenue-intelligence` agent |
| MODULE 23 AI Growth Strategist (daily briefing: top-3 actions, risk, opportunity, stop/scale, recoveries) | Part 13 L14084–14098 | ✅ | `src/app/dashboard/briefing/` + `growth-strategist` agent |
| MODULE 24 Agency Control Center (10 multi-client features, white-label) | Part 13 L14100–14111 | 📘 | `docs/ai-os/02-users-and-command-centres.md` (agency command centre) |
| MODULE 25 Super Admin Dashboard (17 platform metrics) | Part 13 L14113–14131 | 📘 | `docs/ai-os/04-platform-modules.md` (Admin Super Control Centre) |

### 2.3 Other module systems

| Requirement | Source | Status | Where |
|---|---|---|---|
| Six Brains architecture: Business Brain, Customer Brain, Offer Brain, Distribution Brain, Execution Brain, Revenue Brain (full field/segment/channel/metric lists) | Part 04 L1146–1298; Part 12 L13261–13274; Part 15 L18412–18424; inv-2 | 📘 | `docs/ai-os/06-architecture.md` (data intelligence + orchestration layers); verbatim in `source-notes/04` |
| 7-layer intelligence architecture (Business / Customer / Offer / Campaign / Landing Page / Distribution / Revenue Brains) | Part 11 L6344–6492; Part 14 L14472–14555 | 📘 | `docs/ai-os/06-architecture.md`; verbatim `source-notes/11`, `source-notes/14` |
| Ten "Most Powerful Modules": AI Marketing Doctor, Customer Hunt Engine (12 demand sources), AI Offer Generator (6 scores), Lead Magnet Generator (8 magnet types), Local Domination Engine, Competitor Weakness Scanner (9 scans), Review Mining Agent, AI Sales Follow-Up Agent (7-step cadence), No-Waste Budget Guard (8 interventions), Performance-Based Marketplace | Part 04 L1300–1500; inv-2 | ✅/📦 mixed | Marketing Doctor ✅ (`audit`), Offer Generator ✅ (`offer-builder`), Local Domination ✅ partial, Budget Guard ✅ partial; Customer Hunt Engine, Lead Magnet Generator, Review Mining, Sales Follow-Up cadence, Performance Marketplace 📦 `source-notes/04` |
| Six market-gap features: AI Failure Diagnosis Engine, Revenue-First Content Engine (10-purpose taxonomy, 7 metadata fields), Full-Funnel Creative Agent (10 assets/campaign), Simple Attribution Engine (Stop/Fix/Scale language), Private Customer Intelligence Vault (13 data fields), WhatsApp Conversion Agent (9 verticals) | Part 04 L900–1145; inv-2 | ✅ partial | Failure Diagnosis ✅ (`audit.ts`), Vault ✅ partial (`customers/`), WhatsApp agent ✅ partial (`whatsapp/`), Stop/Fix/Scale ✅ (agent verdict language); Revenue-First Content taxonomy + attribution engine 📦 `source-notes/04` |
| SuperCool-inspired Creation Command Centre: "Make Anything" universal AI command box; Project Memory Workspaces (brand memory); AI Image & Graphic Studio; Advanced Video & Movie Maker (formats 9:16/16:9/1:1, AI spokesperson); Advertising Agent (14 sub-agents); Multi-Channel Marketing Engine; 19-module developer structure (/ai-command-centre … /ai-agent-marketplace) | Part 12 L8042–8347; inv-7 | 📦 | `source-notes/12-build-transcript.md` |
| Brand-Consistent Creative Engine: user media uploads (13 asset types), `brand_assets` collection + BrandAsset schema, logo-aware image creation, colour extraction (6 colour roles), 12-step creative workflow, dual creative modes | Part 11 L6003–6194; inv-6 | 📦 | `source-notes/11-acquisition-infrastructure-agents.md` |
| Customer Communication & Revenue Automation OS — 17 modules: Omnichannel Campaign Center, AI Email Revenue Engine, AI SMS Conversion Engine, WhatsApp Sales Command Center, Push Notification Engine, Mobile Wallet Loyalty Engine, Live Sales Chat Engine, AI Conversion Chatbot, Unified Customer Inbox, Revenue Pipeline CRM, AI Booking & Meeting Engine, Transactional Messaging System, Customer Data Platform, AI Audience Segmentation Engine, AI Loyalty & Repeat Revenue Engine, Ecommerce Revenue Recovery Engine, Integration Hub | Part 12 L11763–12448; Part 15 L16294–17614; inv-7, inv-9 | 📦 | `source-notes/12`, `source-notes/15`; connector strategy 📘 `docs/ai-os/05-bitripay-and-connectors.md` |
| No-Code Revenue Automation Builder (Trigger → Condition → Action → Delay → Branch → Outcome; 15 triggers, 12 actions) | Part 15 L17127–17156 | 📦 | `source-notes/15` (note source typo `trigger_retargerting` at L17153 — see §15) |
| 12 core modules of the developer-ready master spec (Failure Audit, War Room, Autonomous Campaign Engine, Landing Page Generator, WhatsApp Conversion, Content Factory, Retargeting, Resurrection Engine™, Competitor Intelligence, Local Domination, Demand Detection, Marketplace Infrastructure) | Part 12 L12649–12847; inv-7 | ✅ partial / 📘 | 9 of 12 have ✅ dashboard pages (see §3); Demand Detection + Marketplace 📘 `docs/ai-os/01`, Retargeting 📘 `docs/ai-os/04` |
| Blueprint module catalogue — 30 platform modules + Admin Super Control Centre | derived from all of the above | 📘 | `docs/ai-os/04-platform-modules.md` |
| BitriPay payment gateway + 30-category connector ecosystem (incl. Stripe, PayPal, Flutterwave, Paystack, M-Pesa, Orange Money, Airtel Money, Afrimoney, Meta/Google/TikTok Ads, WhatsApp Business, Brevo, Mailchimp, HubSpot, Google Workspace, Shopify, WooCommerce, WordPress, Firebase, Supabase, Vercel, GitHub, Figma, Notion, Airtable, Slack, n8n, Zapier, Make, Klaviyo) | Part 12 L8272–8333; Part 15 L16829–16850 | 📘 | `docs/ai-os/05-bitripay-and-connectors.md` |
| Marketing MOT (automated 10-point marketing audit, Yell-inspired, 30-day growth plan) | Part 12 L10214–10227 | 📦 | `source-notes/12`; audit engine ✅ partial `src/backend/audit.ts` |
| How-It-Works page (detailed step-by-step process, linked in footer; 7-phase "Phased Warfare" timeline) | Part 12 L7574–7581 | ✅ | `src/app/how-it-works/page.tsx` |
| Worldwide localisation (auto-detect language + currency from device, hydration-safe) | Part 06 L2897–2905, Part 07 L4132–4148 | 📦 | `source-notes/06`, `source-notes/07` (prototype-only; not in this repo) |
| Premium cinematic landing page ("One Operating System. Every Growth Weapon.", 6 agent pillars, "From idea to income") | Part 12 L8421–8456; Part 15 L19161–19178 | ✅ | `src/app/page.tsx` (premium landing page) |

---

## 3. Dashboards & account system

### 3.1 Dashboards specified in Document 1 (Part 05, L2258–2843; Part 13 routes L14377–14399)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Executive Command Center (main homepage; 11 live metric cards: revenue/leads/bookings/messages today, conversion rate, ad spend, cost per customer, returning customers, AI campaigns running, revenue recovered, estimated lost revenue) | Part 05 L2258–2291; inv-3 | ✅ | `src/app/dashboard/page.tsx` (command center) with `src/components/charts.tsx` + demo dataset `src/shared/demo.ts` |
| AI Command Feed (live AI intelligence feed — "the brain of the platform", example directives) | Part 05 L2293–2311 | ✅ partial | command center feed widgets; live event-driven feed 📘 `docs/ai-os/06-architecture.md` (events) |
| AI Priority Panel ("What Needs Attention Now" — 7 priority action types) | Part 05 L2313–2333 | ✅ partial | command center + `src/app/dashboard/briefing/` |
| Live Customer Map (customer locations, active leads, demand hotspots, conversion zones, abandoned leads, strongest markets) | Part 05 L2335–2351 | 📦 | `source-notes/05-account-system-and-dashboards.md` (Google Maps integration was prototype-only) |
| Customer Database Dashboard — AI Customer Vault™ (9 metrics, 10 dynamic segments, individual profile with 14 elements, 6 AI customer scores) | Part 05 L2353–2455 | ✅ partial | `src/app/dashboard/customers/` (customer vault); per-customer AI scores 📦 |
| Marketing War Room Dashboard (campaign cards: spend, revenue, leads, CPL, cost/customer, conversion, ROAS, AI confidence, audience quality, suggested actions; AI Campaign Commander recommendations) | Part 05 L2457–2505 | ✅ | `src/app/dashboard/war-room/` |
| Creative Performance Analysis (hooks, colours, images, emotions, wording, CTA placement, urgency, readability) | Part 05 L2507–2525 | 📦 | `source-notes/05` |
| Landing Page Intelligence (7 scores + exact AI fixes) | Part 05 L2527–2545 | 📦 | `source-notes/05`; see §8 |
| WhatsApp Sales Center (Live Conversation Center: messages, AI responses, qualification, sentiment, purchase probability, escalation; AI WhatsApp Agent 7 capabilities) | Part 05 L2547–2583 | ✅ partial | `src/app/dashboard/whatsapp/` |
| Lead Recovery Center (abandoned forms, missed bookings, unfinished checkouts, expired quotes, silent leads, inactive customers; recoverable-revenue estimate) | Part 05 L2585–2607 | ✅ | `src/app/dashboard/recovery/` (lead recovery) |
| Competitor Intelligence Center (8 monitored signals + Market Gap Detection, 6 gap types) | Part 05 L2609–2647 | ✅ | `src/app/dashboard/competitors/` |
| Local Domination Center (postcode demand, local search behaviour, conversion rates, hotspots, competition density, engagement trends) | Part 05 L2649–2667 | ✅ partial | `src/app/dashboard/local/` |
| AI Content Factory dashboard ("AI psychological influence engine", 10 content types, 5 predictive content scores) | Part 05 L2669–2713 | ✅ partial | `src/app/dashboard/content/`; predictive content scoring 📦 |
| Financial & Revenue Dashboard (10 money metrics + 6 AI revenue forecasts) | Part 05 L2715–2757 | ✅ partial | `src/app/dashboard/revenue/` (revenue intel); forecasting 📘 doc2 §10.2 |
| AI Growth Strategist™ daily briefing dashboard (Daily Strategic Briefings + Daily Actions: top 3 priorities, risks, opportunities, wasted spend, scaling opportunities) | Part 05 L2759–2789 | ✅ | `src/app/dashboard/briefing/` (daily briefing) |
| Multi-Business / Agency Dashboard (Agency Control Center: clients, performance, AI health scores, revenue, campaigns, alerts, billing, ACU usage) | Part 05 L2791–2813 | 📘 | `docs/ai-os/02-users-and-command-centres.md` (agency command centre) |
| Super Admin Dashboard (Platform Intelligence: revenue, ACU usage, provider AI cost, profitable/churn industries, trends, provider usage, infra health, fraud, spam) | Part 05 L2815–2843 | 📘 | `docs/ai-os/04-platform-modules.md` (Admin Super Control Centre) |
| Campaign builder dashboard | Part 01 L109–148; Part 13 route /campaign-packs | ✅ | `src/app/dashboard/campaigns/` |
| Failure audit dashboard | Part 13 route /audit | ✅ | `src/app/dashboard/audit/` |
| Offers dashboard | Part 13 (Offer Builder) | ✅ | `src/app/dashboard/offers/` |
| Budget protection dashboard | Part 13 route /budget-guard | ✅ | `src/app/dashboard/budget/` |
| 22-route dashboard navigation (/dashboard, /audit, /business-brain, /customer-vault, /campaign-war-room, /campaign-packs, /landing-pages, /whatsapp-center, /follow-up-center, /lead-recovery, /budget-guard, /local-domination, /competitor-intelligence, /review-mining, /referrals, /marketplace, /revenue-intelligence, /ai-growth-strategist, /acu-wallet, /billing, /settings, /admin) | Part 13 L14377–14399; inv-8 | ✅ partial | 17 of 22 concepts live under `src/app/dashboard/*` (see `src/components/Sidebar.tsx`) — **/billing + /acu-wallet shipped as `dashboard/billing`** (balance, burn charts, per-agent usage, plan ladder, top-up packs); **/settings shipped as `dashboard/settings`** (per-capability autonomy dial L0–L3 with policy ceilings, five-layer auth posture, GDPR export/erasure); **/admin shipped as `dashboard/admin`** (M-30 demo: ACU margin dashboard enforcing the 100% floor, routing mix, kill-switches, escalation queue); /business-brain, /follow-up-center, /review-mining, /referrals, /marketplace 📦/📘 |

### 3.2 User types & account system

| Requirement | Source | Status | Where |
|---|---|---|---|
| 10 platform user types: Business Owner, Marketing Manager, Sales Team, Social Media Manager, Local Business Owner, Agency, Enterprise Client, Affiliate/Promoter, Franchise/Multi-location, Admin/Super Admin — each with distinct dashboard intelligence | Part 05 L2081–2105; Part 12 L12849–12860; inv-3 | 📘 | `docs/ai-os/02-users-and-command-centres.md` (AI Command Centres for 12 user types, autonomy dial L0–L3) |
| 7 user types with per-type needs (Version A: Business Owner, Marketing Manager, Sales Team, Agency, Enterprise/Franchise, Affiliate/Promoter, Platform Admin) | Part 13 L13377–13431 | 📘 | `docs/ai-os/02-users-and-command-centres.md` |
| Master Account System — A. Identity Layer (15 fields: name, business name, industry, website, social links, locations, timezone, language, team members, roles & permissions, subscription plan, ACU balance, billing profile, Stripe wallet, tax/VAT) | Part 05 L2107–2142 | ✅ partial | `src/app/onboarding/` captures core identity; full layer 📘 `docs/ai-os/07-database-and-api.md` |
| B. Business Intelligence Layer (13 learned attributes powering all AI decisions) | Part 05 L2144–2174 | 📘 | `docs/ai-os/06-architecture.md` (learning loop); `docs/ai-os/07` schema |
| C. Customer Intelligence Layer (14 stored customer data types) | Part 05 L2176–2206 | ✅ partial | `src/app/dashboard/customers/` + `src/backend/db.ts`; full layer 📘 `docs/ai-os/07` |
| D. Marketing Intelligence Layer (campaigns, ads, creatives, hooks, landing pages, A/B tests; CTR/CPC/CPL/ROAS/conversion/lead-quality/channel/audience metrics) | Part 05 L2208–2238 | 📘 | `docs/ai-os/07-database-and-api.md` |
| E. AI Intelligence Layer (tracks AI-generated campaigns/offers/pages, recommendations, prediction history, experiment outcomes, performance learning) | Part 05 L2240–2256 | ✅ partial | agent runs + audits persisted to Firestore via `src/backend/db.ts`; full learning loop 📘 `docs/ai-os/06` |
| Dashboard must never feel passive — alive, intelligent, predictive, commercial, operational, urgent, strategic; "platform is actively helping me make money" | Part 06 L2845–2867; Part 13 L14401–14416 | ✅ | design language of all 15 dashboard pages + `src/app/page.tsx`; verbatim in `source-notes/06` |
| Anti-requirements: must NOT feel like a social scheduler / CRM / analytics tool / reporting system; must feel like an AI-Powered Customer Acquisition Command Centre / "AI growth war room" | Part 04 L2042–2079 | ✅ | overall dashboard design; `src/app/dashboard/layout.tsx` |
| "Stealth Premium" aesthetic (cinematic dark modes, glassmorphism, Space Grotesk headlines, bento-grid, monoline icons, framer-motion transitions) | Part 01 L441–453; Part 06 L3621–3635 | ✅ | `src/app/page.tsx`, `src/app/globals.css`, `src/components/HeroMockup.tsx`, `src/shared/palette.ts` |
| Key user journey (10 steps: sign up → business details → audit → fixes/lost revenue → objective → campaign pack → assets → launch/approval → AI monitors → stop/fix/scale directives) | Part 13 L14337–14375 | ✅ partial | `src/app/onboarding/` → `audit` → `campaigns` flow; autonomous monitoring 📘/📦 |
| AI-Agent dashboard cards (Agent Name, Purpose, Completion Status, Last Result, Revenue Impact Score, Next Recommended Action, Required Inputs, Connected Outputs) | Part 15 L16197–16212 | 📦 | `source-notes/15`; simpler agent runner ✅ `src/components/AgentRunner.tsx` |
| Onboarding core-principle intake (What do you sell? Who do you want? What result? Budget? Location? Promotion/offer?) | Part 08 L4234–4250 | ✅ | `src/app/onboarding/` (4-step onboarding) |

---

## 4. Master Platform AI OS Prompt rules (Part 03, L636–860)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Identity: "You are not a chatbot. You are the intelligence layer of this platform." — AI-powered OS, decision engine, workflow automation layer, predictive assistant, multi-agent execution platform, self-learning system | Part 03 L639–661; inv-1 | ✅ partial | anti-generic master directive embedded in every agent prompt in `src/shared/agents.ts`; full identity block 📦 `source-notes/03` |
| AI Behaviour Standard — 12 silent questions per user action (goal, data, missing, risk, automatable, predictable, improvable, next, notify, save, learn, recommend) | Part 03 L662–670 | 📦 | `source-notes/03-master-platform-ai-os-prompt.md` |
| Never behave generically; outputs specific, operational, structured, goal-connected | Part 03 L668–670 | ✅ | master directive in `src/shared/agents.ts` (see §13 Zero Generic Info Protocol) |
| Autosave Principle — mandatory platform-wide; 21-item autosave scope; every module supports autosave, version history, timestamps, attribution, change tracking, rollback, audit trail, AI change summary | Part 03 L672–686 | ✅ partial | audits + agent runs auto-persisted to Firestore (`src/backend/db.ts`); full autosave/versioning framework 📦 `source-notes/03` |
| AI Memory Structure — 4 levels: User Memory, Workspace Memory, Process Memory, Intelligence Memory | Part 03 L688–702 | 📘 | `docs/ai-os/06-architecture.md` (data intelligence + learning loop); verbatim `source-notes/03` |
| Agentic AI Structure — specialised agents coordinated via central orchestration layer | Part 03 L704–708 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (Master Orchestrator); runtime ✅ partial via `src/shared/agents.ts` registry + `/api/agents/[agentId]` |
| Platform-wide AI functions (21: AI search, summaries, recommendations, risk detection, next-step guidance, drafting, classification, tagging, scoring, forecasting, alerts, workflow automation, document understanding, data extraction, personalisation, comparison, explanation, decision support, performance tracking, anomaly detection, audit-trail generation) | Part 03 L742–746 | 📦 | `source-notes/03`; subset (scoring, recommendations, next actions) ✅ in agent outputs |
| Standard Output Format — Situation / Insight / Risk / Recommendation / Next Action / Owner / Deadline / Confidence Level | Part 03 L748–766 | ✅ partial | structured agent output format in `src/shared/agents.ts`; full 8-field standard 📦 |
| Decision Intelligence Rule (always provide best option, alternative, risk of doing nothing, commercial + operational impact, next step) | Part 03 L768–776 | 📦 | `source-notes/03` |
| Predictive Intelligence Rule (proactively detect 12 problem classes early) | Part 03 L778–786 | 📘 | doc2 §10.2 predictive models; `docs/ai-os/06` |
| Automation Rule (can this be automated / templated / event-triggered / auto-assigned / agent-monitored) | Part 03 L788–794 | 📘 | doc2 §11 automation framework |
| Data Rule (all data structured, tagged, searchable, connected, reusable; raw activity → intelligence) | Part 03 L796–804 | 📘 | `docs/ai-os/07-database-and-api.md` |
| Security & Control Rule (never expose providers, hidden logic, private keys; respect permissions, roles, boundaries, auditability) | Part 03 L806–816 | ✅ partial | provider abstraction in `src/backend/gateway.ts` + `firestore.rules`/`storage.rules`; full zero-trust 📘 `docs/ai-os/08` |
| User Experience Rule ("platform must feel alive"; every screen: AI Insight, Recommendation, Risk Alert, Next Action, Summary, Confidence Level, Autosave Status) | Part 03 L818–828 | ✅ partial | dashboard widgets; complete per-screen standard 📦 |
| Learning Rule (learn from corrections, decisions, outcomes, approvals/rejections, edit patterns) | Part 03 L830–838 | 📘 | `docs/ai-os/06-architecture.md` (learning loop) |
| Market Positioning Rule (infrastructure-grade AI OS replacing fragmented tools; value list of 11) | Part 03 L840–848 | 📘 | `docs/ai-os/01-executive-vision-and-market.md` |
| Final Operating Command — 8 closing principles ("Think like an AI operating system… save everything automatically… improve the platform with every interaction"); platform must be "impossible to operate without" | Part 03 L850–860; inv-2 | 📦 | `source-notes/03-master-platform-ai-os-prompt.md` |
| Master prompt applies at platform/system level, adapted per module into developer instructions | Part 03 L860 | ✅ partial | `MASTER_DIRECTIVE` pattern in `src/shared/agents.ts` prepended to all agents |
| Four-level memory + autosave implemented as Firestore workspace memory (prototype build note) | Part 03/04 L862–877 | 📦 | `source-notes/04` (prototype); this repo persists audits/agent runs only |
| Executive email doctrine (5-persona email framework: Marketing Director, Financial Marketing Specialist, Business Benefits Expert, Psychology/Persuasion Specialist, Executive Communications Specialist; 120–220 words, aggressive openings, Feature→Benefit→Money, role-calibrated tone incl. CEO/CFO/COO/CTO/Government/Investors) | Part 12 L10264–10352; inv-7 | 📦 | `source-notes/12-build-transcript.md` |
| Senior-engineer persona directive for build assistant | Part 11 L5937–5952 | 📦 | `source-notes/11` (process note, not product) |

---

## 5. Autonomous Campaign Engine (Parts 08–10; duplicate copy in Part 09)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Core principle — 6-question intake, then "the OS does EVERYTHING" | Part 08 L4234–4250; inv-5 | ✅ partial | `src/app/onboarding/` (intake); autonomous execution 📦 |
| Step 1 AI Business Analysis (14 analysis dimensions) | Part 08 L4254–4288 | ✅ partial | `business-diagnosis` agent + `src/backend/audit.ts` |
| Step 2 AI Campaign Objective Engine (11 auto-selected objectives) | Part 08 L4290–4318 | ✅ partial | `campaign-commander` agent (objective selection); auto-selection 📦 |
| Step 3 AI Customer Psychology Engine (10 trigger classes; food-delivery + education examples) | Part 08 L4320–4372 | ✅ | `customer-pain` agent + per-vertical psychology profiles (triggers/fears/aspirations/motivations/slang) in `src/backend/warfare.ts` (M-36) |
| Step 4 AI Offer Creation Engine (9 auto-created offer types, scored) | Part 08 L4374–4396 | ✅ | `offer-builder` agent + margin-guarded scored offer archetypes in `src/backend/warfare.ts` (M-36) |
| Step 5 AI Visual Creation Engine (11 visual types; attention triggers; localisation by country/ethnicity/culture/weather/language/trends) | Part 08 L4398–4485 | ✅ | full **12 attention triggers** + per-vertical emphasis + visual localisation in `src/backend/warfare.ts` (`buildVisuals`); actual image **rendering** now ships via the multi-provider image gateway `src/backend/image-gateway.ts` + `/api/image` + `/dashboard/studio` (Gemini Nano Banana 2/Pro, GPT Image 2, FLUX.2, zero-config Demo Composer); brand-safe logo overlay + exact text; smoke-verified |
| AI Visual Creation Engine — multi-provider image gateway (Gemini Nano Banana 2/Pro, GPT Image 2, FLUX.2; router by quality/text/logo/edit/cost; ≥4× margin ACU pricing; brand-safe composition) | Owner spec 2026-07-19 | ✅ | `src/backend/image-gateway.ts` (`generateImage`, `routeImageProviders`, `estimateImageCost`, `composeBrandSafeSVG`, `extractBrandTheme`), `src/shared/creative.ts`, `/api/image`, `/dashboard/studio`; REST-gated live providers + always-on Demo Composer |
| Brand Asset Library (`brand_assets`: 13 asset types, AI colour extraction, usage-rights gate) + Logo-Aware AI Brand Visual Creation Agent (place logo undistorted, extract 6-colour theme, brand-consistent variants, platform formats, never generic) | Owner spec 2026-07-19 | ✅ | `BrandAsset`/`CreativeOptions`/`BrandTheme` in `src/shared/creative.ts`; `brand-visual-creation` agent (Agent 26); 6-colour extraction + brand-safe SVG composition in `src/backend/image-gateway.ts`; live upload/Firebase storage 📦 at go-live |
| SuperCool extraction — "Make Anything" universal command box (detect goal → route to owned engine → ask only essentials → preview ACUs) + Creation Command Centre | Owner spec 2026-07-19 (SuperCool) | ✅ | `src/backend/intent-router.ts` (`detectIntent`, 17-intent catalogue over every owned engine) + `/api/intent` + `/dashboard/create`; ACU preview via `quoteAcu` (cost hidden); smoke-verified routing |
| SuperCool extraction — Creative Studio / Brand Memory / Ad Agent / ACU billing / Multi-channel (map to owned engines, "create+launch+test+sell+measure+optimise+monetise" > SuperCool's create-only) | Owner spec 2026-07-19 (SuperCool) | ✅ partial | Creative Studio = image gateway (`/dashboard/studio`); Brand Memory = Brand Asset Library; Ad Agent = Campaign Warfare (`/dashboard/warfare`); ACU billing = `src/backend/acu.ts`; Video Studio + Connectors Hub + team workspaces + template/agent marketplaces 📦 (backlog) |
| Step 6 AI Copywriting Engine (9 outputs; AIDA, PAS, emotional selling, scarcity, authority, urgency, social proof, curiosity, FOMO, local identity) | Part 08 L4487–4531 | ✅ | AIDA + PAS + hooks + CTA generated deterministically in `src/backend/warfare.ts` (`buildCopy`) + `ad-creative` agent |
| Step 7 AI Hashtag Engine (6 hashtag classes, scored) | Part 08 L4533–4549 | ✅ | classed + scored hashtags in `src/backend/warfare.ts` (`buildHashtags`) |
| Step 8 AI Multi-Platform Adaptation (12 target formats: FB, IG, TikTok, LinkedIn, WhatsApp, Google Business, Email, SMS, landing page, blog, SEO page, push) | Part 08 L4551–4579 | ✅ | one campaign → all 12 native payloads in `src/backend/warfare.ts` (`buildPayloads`); smoke-verified 12 formats |
| Step 9 AI Landing Page Generation (12 objective-specific elements) | Part 08 L4581–4609 | ✅ | objective-specific page spec in `src/backend/warfare.ts` (`buildLandingSpec`) + `src/app/dashboard/landing-pages/`; see §8 |
| Step 10 AI Distribution Engine (where/when/how often/audience/sequence/budget/channel priority) | Part 08 L4611–4629 | ✅ | frequency-governed distribution plan (where/when/sequence/budget-split, 5-touch cap) in `src/backend/warfare.ts` (`buildDistribution`) |
| Step 11 AI Performance Learning (learns visuals, colours, emojis, hashtags, hooks, CTA, audience; improves automatically) | Part 08 L4631–4649 | 📘 | `docs/ai-os/06-architecture.md` (learning loop) — measured post-launch from real data; never faked in the engine (honesty safeguard) |
| Autonomy Level 1 — Assisted (user approves everything) | Part 08 L4655–4657 | ✅ | `autonomyPlan` L1 in `src/backend/warfare.ts` + `docs/ai-os/02` autonomy dial |
| Autonomy Level 2 — Semi-Autonomous (AI creates, user approves launch) | Part 08 L4659–4663 | ✅ | `autonomyPlan` L2 in `src/backend/warfare.ts` + `/dashboard/warfare` selector |
| Autonomy Level 3 — Fully Autonomous (create/launch/pause, reallocate budget, change creatives, retarget, follow up, recover leads without intervention) + Fully Autonomous Campaign Mode toggle | Part 08 L4665–4687; Part 10 L5847–5871 | ✅ partial | `autonomyPlan` L3 (guardrail description: margin floor + frequency cap enforced) in `src/backend/warfare.ts`; live launch/pause execution against ad platforms 📦 |
| The Real Differentiator — results-driven campaign ecosystems (11 components), never "one ad" | Part 08 L4689–4729 | ✅ | `designCampaign()` in `src/backend/warfare.ts` (M-36) returns the whole ecosystem from six answers; `/api/warfare` + `/dashboard/warfare` |
| AI Campaign Score™ (8 dimensions: Conversion Probability, Revenue Probability, Audience Match, Emotional Strength, Attention, Trust, Urgency, Scalability) | Part 08 L4731–4755; inv-5 | ✅ | `scoreCampaign()` in `src/backend/warfare.ts` — all 8 dimensions + composite + honest "probability estimate" label; smoke-verified |
| AI Campaign Confidence Score™ (7 dimensions: click probability, conversion probability, emotional strength, urgency strength, local relevance, audience fit, trust — distinct from Campaign Score™) | Part 10 L5795–5819; inv-5 | 📦 | `source-notes/10-campaign-packs-and-revenue-models.md` (score-set conflict — see §15) |
| "AI Autonomous Campaign Warfare OS" identity — OS combines 10 roles (strategist, copywriter, designer, growth hacker, analyst, media buyer, behavioural psychologist, local marketer, conversion optimiser, follow-up engine) | Part 08 L4776–4811; Part 07 L4197–4234 | 📘 | `docs/ai-os/01-executive-vision-and-market.md`; verbatim `source-notes/08` |
| Agentic Campaign Generation-as-a-Service (users pay for strategy+offer+psychology+visuals+hooks+CTA+hashtags+landing page+audience+follow-up+retargeting+optimisation, automatically) | Part 10 L5362–5407 | 📘 | `docs/ai-os/08-monetisation-security-roadmap.md` (monetisation streams); verbatim `source-notes/10` |
| AI Campaign Packs™ (charge for complete acquisition campaigns, never posts/captions) — Starter/Growth/Domination pack contents | Part 10 L5409–5423; Part 13 L13655–13712; Part 14 L15267–15303 | 📘 | `docs/ai-os/08` (packaging); pack generator code 📦 |
| Example user flow — 11 business types × 10 objectives × detail inputs (+optional logo/creatives/database uploads) → 8 automatic analysis steps | Part 10 L5425–5523 | ✅ partial | `src/app/onboarding/` + `src/app/dashboard/campaigns/` (subset) |
| Deliverable A — AI Ad Copy (hooks, persuasive text, short-form, emotional/urgency wording, CTA, emojis, hashtags; Congolese food-delivery sample) | Part 10 L5527–5557 | ✅ partial | `ad-creative` agent |
| Deliverable B — AI Visual Generation (8 visual formats; psychology/demographics/colour/platform awareness) | Part 10 L5559–5589 | 📦 | `source-notes/10` |
| Deliverable C — AI CTA Generation (9 example CTAs) | Part 10 L5591–5611 | ✅ partial | agent outputs |
| Deliverable D — AI Hashtag Engine (5 classes, scored) | Part 10 L5613–5627 | 📦 | `source-notes/10` |
| Deliverable E — AI Landing Page (11 sections) | Part 10 L5629–5655 | ✅ partial | `src/app/dashboard/landing-pages/` |
| Deliverable F — AI WhatsApp Flow (welcome, qualification, automated replies, pricing flow, booking flow, follow-up) | Part 10 L5657–5671 | ✅ partial | `src/app/dashboard/whatsapp/` |
| Deliverable G — AI Follow-Up System (SMS/WhatsApp/email follow-up, abandoned-lead recovery, comeback offers) | Part 10 L5673–5685 | 📦 | `source-notes/10`; recovery UI ✅ partial |
| Deliverable H — AI Retargeting System (retargeting copy, audience logic, comeback + urgency campaigns) | Part 10 L5687–5697 | 📦 | `source-notes/10` |

---

## 6. DemandOS / organic acquisition engines & owned distribution

| Requirement | Source | Status | Where |
|---|---|---|---|
| DemandOS = Demand Capture + Distribution Infrastructure (discover/capture/redirect demand, activate communities, reactivate databases, private distribution networks, viral systems, local-intent dominance, relationship marketing, owned traffic assets) | Part 07 L3638–3717; inv-4 | 📘 | `docs/ai-os/01-executive-vision-and-market.md` (vision + market gaps) |
| 3-phase model: Phase 1 use ad platforms strategically → Phase 2 build owned distribution (14 owned assets) → Phase 3 DemandOS Network Effect (customer discovery ecosystem) | Part 07 L3719–3789; Part 12 L12501–12521 | 📘 | `docs/ai-os/01`; `docs/ai-os/08` (phased roadmap) |
| DemandOS combined identity: Search Engine, Marketplace, Referral Network, Local Discovery Engine, AI Growth System, Customer Database OS, Community Distribution Infrastructure | Part 07 L3791–3809 | 📘 | `docs/ai-os/01` |
| Engine 1 — AI Local SEO Domination (local/neighbourhood/city/service pages, AI local content, Google Business optimisation; "Best Congolese food delivery in Birmingham") | Part 07 L3813–3846 | 📦 | `source-notes/07-demandos-organic-engines.md`; `local-growth` agent ✅ partial |
| Engine 2 — AI Geo-Location Targeting (nearby demand detection → WhatsApp offers, push, local promos, SMS) | Part 07 L3848–3873 | 📦 | `source-notes/07` |
| Engine 3 — WhatsApp Distribution Networks (communities, VIP/loyalty/neighbourhood groups, customer clubs) | Part 07 L3875–3896 | 📦 | `source-notes/07` |
| Engine 4 — Referral Engine (auto referral codes, affiliate links, community promoters, ambassador rewards, viral discounts) | Part 07 L3898–3917 | 📘 | `docs/ai-os/04-platform-modules.md` (referral module); verbatim `source-notes/07` |
| Engine 5 — AI Marketplace Ecosystem (searchable businesses, demand routing by category: tutor, delivery, cleaner, builder, barber, accountant) | Part 07 L3919–3944 | 📘 | `docs/ai-os/01` (phase-3 marketplace) |
| Engine 6 — AI Customer Reactivation (revive old leads/customers/inactive users/abandoned enquiries — cheaper than ads) | Part 07 L3946–3959 | ✅ partial | `src/app/dashboard/recovery/`; full engine §7 |
| Engine 7 — AI Community Marketing (local groups, communities, trending conversations, events, diaspora/school/business groups) | Part 07 L3961–3977 | 📦 | `source-notes/07` |
| Engine 8 — AI Content Engine at Scale (mass TikTok clips, SEO pages, blogs, Google posts, social, review, location content) | Part 07 L3980–3997 | ✅ partial | `content-factory` agent (single-business scale); mass programmatic scale 📦 |
| Engine 9 — AI Micro-Influencer Network (local influencers, student ambassadors, promoters, niche creators; performance-based) | Part 07 L3999–4012 | 📦 | `source-notes/07`; superseded by TrustSeller AI spec (§9) |
| Engine 10 — AI Demand Detection ("the future moat": search trends, local conversations, buying intent, complaints, unmet demand, competitor weaknesses → "There is demand HERE right now") | Part 07 L4014–4033 | 📘 | `docs/ai-os/01` (market-gap thesis); verbatim `source-notes/07` |
| 13 owned distribution channels: WhatsApp campaigns, SMS, email, referral links, local SEO pages, Google Business posts, community groups, affiliate promoters, QR codes, partner landing pages, marketplace listings, automated outreach, retargeting databases | Part 02 L523–556; inv-1 | 📘 | `docs/ai-os/04-platform-modules.md` (distribution modules); verbatim `source-notes/02` |
| First-party customer intelligence (leads, WhatsApp chats, calls, bookings, purchases, abandoned forms, objections, repeat buyers, location demand, competitor gaps) | Part 02 L483–506 | ✅ partial | `src/app/dashboard/customers/` + demo intelligence dataset `src/shared/demo.ts`; full capture pipeline 📘 `docs/ai-os/06` |
| Extreme targeting engine — micro-audience intent capture (5 worked examples: Birmingham Congolese food tonight, Year-6 SATs parents, restaurants without delivery, landlords with vacant rooms, emergency-repair posters) | Part 02 L508–521 | 📦 | `source-notes/02-prototype-and-competitive-strategy.md` |
| Pay-for-result pricing (£5/month + £0.20–£1/verified lead + £2–£5/booked appointment + 3–10% commission) | Part 02 L558–577; Part 13 L14282–14289 | 📘 | `docs/ai-os/08-monetisation-security-roadmap.md` (performance stream) |
| Gatekeeper strategy — 9-step flow (audit → offer repair → landing page → WhatsApp flow → tracking → micro-campaign → follow-up → retargeting → scale winners) | Part 04 L1502–1534 | ✅ partial | onboarding→audit→campaign flow; full gating 📦 |
| Infrastructure Independence positioning ("escape dependency on expensive advertising"; owns local discovery, customer databases, referrals, WhatsApp commerce, loyalty, retention, community distribution, AI targeting, customer intelligence, marketplace demand routing) | Part 07 L4035–4117 | 📘 | `docs/ai-os/01`; see also §10 |
| Viral Velocity X10 mandate (Viral Loop Engine, K-Factor loops, referral mechanics in every payload, milestone rewards) | Part 11 L5954–5973, L6468, L7361 | 📦 | `source-notes/11-acquisition-infrastructure-agents.md` |
| AI Growth Engine philosophy ("Sell Guaranteed Business Growth"; ROI engine comparing 17+ channels; AI Budget Optimiser auto-shifting spend; AI Marketing Guarantee Score pre-spend gating; AI Revenue Dashboard) | Part 12 L10506–10715; inv-7 | 📦 | `source-notes/12-build-transcript.md` |
| Everyone-earns model / Growth Partners (businesses, creators, agencies, freelancers, salespeople; 10 platform revenue streams) | Part 12 L11153–11450 | 📦 | `source-notes/12-build-transcript.md` |
| Post-purpose taxonomy — every post classified by purpose (lead capture, trust, urgency, objection handling, retargeting, referral, booking, app download, WhatsApp message, sale) + 7 mandatory content metadata fields | Part 04 L961–1006 | 📦 | `source-notes/04` |
| Positioning taglines ("Stop paying for clicks. Start paying for customers." / "Stop renting audiences." / "Stop Renting Your Customers") | Part 02 L610; Part 04 L1113, L1536–1546; Part 11 L6303 | ✅ | `src/app/page.tsx` landing copy |
| Product naming history (MarketWar OS, AcquireX, LeadWar OS, CustomerForge AI, GrowthCommand, AdShield AI, DemandOS, LeadNation AI, TargetForge, ConversionOS — DemandOS recommended, MarketWar OS final) | Part 04 L1548–1580 | 📦 | `source-notes/04` (historical record; product name settled as MarketWar OS) |

---

## 7. Customer Resurrection Engine (Part 04, L1671–1926; Part 13 MODULE 5)

| Requirement | Source | Status | Where |
|---|---|---|---|
| AI Customer Resurrection Engine™ — turn dead contacts into active revenue; "revive and monetise existing databases FIRST" | Part 04 L1596–1677; inv-2 | 📘 | `docs/ai-os/04-platform-modules.md` (resurrection module); UI ✅ partial `src/app/dashboard/recovery/` |
| Sub-module 1 — AI Database Intelligence Layer (10 import sources: CSV, Excel, CRM, Shopify, Stripe, WhatsApp exports, Mailchimp, HubSpot, Google Sheets, POS; 10 AI analyses; 10 auto-classification segments) | Part 04 L1681–1746 | 📦 | `source-notes/04-customer-acquisition-os-pivot.md` |
| Sub-module 2 — AI Reactivation Campaigns (per-segment auto-generation; sample copy for inactive/abandoned/VIP/referral) | Part 04 L1748–1767 | 📦 | `source-notes/04` |
| Sub-module 3 — AI Behaviour Prediction Engine (likelihood to buy, purchase window, best time, preferred channel, churn risk, upsell, referral probability) | Part 04 L1769–1786 | 📘 | doc2 §10.2 predictive models; verbatim `source-notes/04` |
| Sub-module 4 — Smart Multi-Channel Re-Engagement (email, WhatsApp, SMS, push, retargeting ads, call reminders, local offers; escalation flow) | Part 04 L1788–1809 | 📦 | `source-notes/04` |
| Sub-module 5 — AI Customer Lifetime Value Engine (lifetime spend, retention, repeat orders, referral value, profitability, churn likelihood) | Part 04 L1811–1828 | 📦 | `source-notes/04` |
| Sub-module 6 — Hyper-Personalisation Engine (8 personalisation inputs; restaurant/tutor/construction examples) | Part 04 L1830–1861 | 📦 | `source-notes/04` |
| Sub-module 7 — AI Lead Recovery Engine (uncompleted forms, abandoned carts, unfinished applications, unanswered quotes, missed bookings, expired proposals) | Part 04 L1863–1878 | ✅ partial | `src/app/dashboard/recovery/` (lead recovery centre) |
| Sub-module 8 — Database Expansion Engine (referrals, lookalikes, community targeting, local SEO, QR, WhatsApp invites, ambassadors, affiliates, viral rewards) | Part 04 L1880–1903 | 📦 | `source-notes/04` |
| Sub-module 9 — AI Trust & Relationship Engine (birthdays, anniversaries, loyalty milestones, reorder windows, inactivity, sentiment, support history; human-feeling engagement) | Part 04 L1905–1926 | 📦 | `source-notes/04` |
| AI Revenue Recovery Score™ (trapped-revenue estimate, recoverable leads count, likely returners, leak map; "£27,400" / "£18,600" example hooks) | Part 04 L1948–1966; Part 13 L13606–13608 | 📦 | `source-notes/04`, `source-notes/13`; recovery estimates shown in `recovery/` UI with demo data ✅ partial |
| Trapped Revenue™ metric (platform-wide "trapped money" indicator) | Part 04 L2012–2024; Part 11 L6236, L6389 | 📦 | `source-notes/04`, `source-notes/11` |
| 10-step resurrection process (import → dedupe → validate → detect inactive → score recovery probability → estimate recoverable revenue → generate campaigns → send WhatsApp/SMS/email → track → move to active pipeline) | Part 13 L13595–13604 | 📦 | `source-notes/13` |
| 9 recovery campaign types (inactive comeback, abandoned quote, missed booking, repeat-buyer, VIP early access, referral reward, seasonal, limited-time discount, loyalty) | Part 13 L13610–13618 | 📦 | `source-notes/13` |
| CSV/spreadsheet contact ingestion with column mapping, bulk import, one-click WhatsApp/Email outreach, auto Trapped-Revenue flagging | Part 11 L6394–6415 | 📦 | `source-notes/11` (prototype used papaparse; not in this repo) |

---

## 8. Landing-page subsystem (Parts 11 & 14 — the deepest single spec in the source)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Landing pages dashboard (generate + manage pages per campaign) | Part 01 L150–173; Part 13 route /landing-pages | ✅ | `src/app/dashboard/landing-pages/` |
| AI Landing Page Creation Agent as core agent — designs strategy, layout, copy, structure, CTA flow, tracking, testing, trust system, conversion pathway; 18 responsibilities | Part 14 L14691–14717; Part 11 L6613–6678 | 📦 | `source-notes/14-consolidated-spec-version-b.md` |
| Page type 1 — Lead Capture Page (name/phone/email/interest/location; tutors, services, consultations, quotes, events, recruitment, investors) | Part 14 L14719–14807; Part 11 L6682–6705 | 📦 | `source-notes/14`, `source-notes/11` |
| Page type 2 — WhatsApp Conversion Page (pre-filled intent messages, urgency hooks; food delivery, restaurants, trades, salons) | Part 14 L14719–14807; Part 11 L6708–6729 | 📦 | `source-notes/14`, `source-notes/11` |
| Page type 3 — Booking Page (slot scarcity, calendar trust; tutors, salons, consultants, repairs, viewings, interviews) | Part 14 L14719–14807; Part 11 L6732–6750 | 📦 | `source-notes/14`, `source-notes/11` |
| Page type 4 — Order Page (checkout trust, urgency; food, e-commerce, delivery, local products) | Part 14 L14719–14807; Part 11 L6767–6788 | 📦 | `source-notes/14`, `source-notes/11` |
| Page type 5 — App Download Page (store CTAs, install incentives; delivery platforms, marketplaces, education, booking apps) | Part 14 L14719–14807; Part 11 L6814–6835 | 📦 | `source-notes/14`, `source-notes/11` |
| Page type 6 — Partner Sign-Up Page (B2B onboarding: restaurants, drivers, tutors, agencies, suppliers) | Part 14 L14719–14807; Part 11 L6838–6859 | 📦 | `source-notes/14`, `source-notes/11` |
| Page type 7 — Event Ticket Page (concerts, community events, conferences, workshops) | Part 14 L14719–14807 | 📦 | `source-notes/14` |
| Page type 8 — Customer Reactivation Page (comeback offers, loyalty campaigns, expired quotes, abandoned bookings) | Part 14 L14719–14807 | 📦 | `source-notes/14` |
| Page type 9 — Local SEO Landing Page ("service + city", "near me", LocalBusiness schema, target grid) | Part 14 L14719–14807; Part 11 L6862–6881 | 📦 | `source-notes/14`, `source-notes/11` |
| Page type 10 — Offer Claim Page (FOMO, countdown/limited slots, unique discount codes) | Part 14 L14719–14807; Part 11 L6884–6903 | 📦 | `source-notes/14`, `source-notes/11` |
| Structure generator — 10 mandatory sections: Hero (7 elements + Congolese-food worked example), Problem, Offer (5 fields), Benefits (3–6), Proof (8 proof types), Process (numbered steps), FAQ (7 objections), Urgency (5 patterns), Lead Form (fields by objective: basic/booking/quote/app), CTA (8 examples) | Part 14 L14809–14922; Part 11 L6906–7023 | 📦 | `source-notes/14`, `source-notes/11` |
| 8-score AI scoring model: Conversion, Clarity, Trust, Urgency, Mobile, Emotional, Friction, Lead Quality | Part 14 L14924–14941; Part 11 L7027–7049 | 📦 | `source-notes/14`; conflicting 7-score set (Speed + Conversion Probability) in Part 13 L13849–13855 — see §15 |
| 12 optimisation rules (shorter headline, stronger CTA, better offer, more trust proof, fewer form fields, stronger WhatsApp button, faster layout, mobile spacing, clearer pricing, stronger urgency, more local language, better emotional hook) + projected score lift | Part 14 L14943–14956; Part 11 L7053–7072 | 📦 | `source-notes/14`, `source-notes/11` |
| A/B testing framework — Variants A (offer-focused), B (pain-focused), C (trust-focused), D (urgency-focused); 10 tracked metrics (visits, CTA clicks, form submits, WhatsApp clicks, bookings, orders, CPL, conversion rate, bounce rate, scroll depth) | Part 14 L14958–14978; Part 11 L7076–7095 | 📦 | `source-notes/14`, `source-notes/11` |
| Publishing system — instant hosting, custom slug, business subdomain, custom domain later, QR generation, share link, Meta/Google/TikTok/LinkedIn pixels, server-side event tracking, UTM builder; URL pattern `marketwar.co/b/{business}/{slug}` (example `marketwar.co/b/tunakula/birmingham-congolese-food`) | Part 14 L14980–14995; Part 11 L7099–7121 | 📦 | `source-notes/14`, `source-notes/11` |
| 12 landing-page collections: landing_pages, landing_page_versions, landing_page_sections, landing_page_ctas, landing_page_forms, landing_page_ab_tests, landing_page_events, landing_page_scores, landing_page_assets, landing_page_pixels, landing_page_submissions, landing_page_recommendations | Part 14 L14997–15009; Part 11 L7125–7144 | 📦 | `source-notes/14`; relational analogue 📘 `docs/ai-os/07-database-and-api.md` |
| Full `LandingPage` TypeScript schema (pageType 10-value enum, status enum, formConfig + submitAction enum, whatsappConfig, tracking with 3 pixel IDs + UTM, 8 scores, 9 metrics) | Part 14 L15011–15096; Part 11 L7148–7181 | 📦 | `source-notes/14`, `source-notes/11` |
| Landing Page Agent system prompt (verbatim: never generic, 13 analysis factors, 17 outputs, mobile-first, structured JSON output) | Part 14 L15098–15149; Part 11 L7184–7249 | 📦 | `source-notes/14`, `source-notes/11` |
| Landing Page Brain — pages convert into 8 outcomes (leads, WhatsApp messages, bookings, orders, calls, app downloads, partner sign-ups, event tickets) | Part 11 L6440–6454; Part 14 L14523–14532 | 📘 | `docs/ai-os/06-architecture.md`; verbatim `source-notes/14` |
| Landing-page centrality doctrine ("the landing page is where attention becomes action"; without the agent MarketWar OS is another AI content tool) | Part 14 L15497–15517 | 📦 | `source-notes/14` |
| Conversion Integrity Score, A/B Test Roadmap, Tracking Protocol events (Lead Intent, WhatsApp Trigger, Scroll Depth, Click-to-Call, Form Intent), CTA hierarchy (primary/secondary/tertiary) | Part 11 L6619–6666 | 📦 | `source-notes/11` |
| Brevo-pass landing-page feature list (26 snake_case features incl. brand_colour_matching, logo_placement, form_friction_score, gdpr_consent_checkbox) | Part 15 L16456–16490, L17078–17121 | 📦 | `source-notes/15` |

---

## 9. Competitor-inspired feature packs (Parts 12 & 15)

Each pack is a full standalone extraction ("copy but make it stronger") preserved verbatim. Agent name lists are in §1.6.

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Serper.dev pack — Live Web/Market Intelligence**: real-time Google-data search (market demand, trending niches, competitor discovery, pain points, opportunities, industry news, brand visibility) by country/city/language/category/keyword | Part 12 L8609–8624; Part 15 L19179–19192 | ✅ | `src/backend/search.ts` (`webSearch`: Search/News/Places/Shopping/Images, env-gated Serper.dev + demo) + `/api/search` + `/dashboard/discover`; external search is an optional accelerator |
| Serper: Opportunity Discovery Agent (opportunity score, demand level, competition level, suggested product, target customer, recommended price, launch strategy) | Part 12 L8625–8643; Part 15 L19193–19209 | ✅ | `discoverOpportunity()` in `src/backend/search.ts` (all fields) + `opportunity-scout` agent (Agent 27); smoke-verified |
| Serper: competitor tracking, SEO engine (keywords, PAA, briefs, internal linking), internet monitoring command centre with daily intelligence briefing | Part 12 L8644–8683; Part 15 L19210–19246 | ✅ partial | `keywordResearch()` (keywords + PAA + related, proxy scores) in `src/backend/search.ts`; competitor tracking + daily briefing 📦 |
| Serper: Maps/Places lead machine (find businesses, extract details, score leads, detect no-website/poor-rating businesses, outreach emails, CRM push) | Part 12 L8684–8697; Part 15 L19247–19259 | ✅ | `findLocalLeads()` in `src/backend/search.ts` (extract + score + no-website/poor-rating flags + outreach angle) + `lead-hunter` agent (Agent 28); smoke-verified; CRM push 📦 |
| Serper: product research, campaign intelligence from SERPs, autocomplete trend miner, research/patents layer, brand reputation tracking, visual + video intelligence, internal /search /news /images /videos /places /maps /shopping /scholar /patents /autocomplete /scrape modules | Part 12 L8699–8797; Part 15 L19260–19350 | 📦 | `source-notes/12`, `source-notes/15` |
| **Apollo.io pack — B2B sales intelligence**: people/company search with seniority/title/industry/size/revenue/tech-stack filters; hiring/funding/growth/news/website-activity signals; saved searches; daily lead alerts; "UK Decision-Maker Hunter" template | Part 12 L8850–8877; Part 15 L19370–19391 | ✅ partial | `searchProspects()` in `src/backend/prospecting.ts` (title/industry/size/revenue/tech + hiring/funding signals) + `/dashboard/prospecting`; saved searches + daily alerts 📦 |
| Apollo: AI ICP Builder (persona, best titles/industries/sizes/regions, exclusion rules, scoring formula, outreach angle) | Part 12 L8878–8897; Part 15 L19392–19410 | ✅ | `buildICP()` in `src/backend/prospecting.ts` (all fields) + `icp-architect` agent (Agent 33) + `/api/prospecting` action `icp`; smoke-verified |
| Apollo: autonomous lead-list agent, 17-field enrichment layer, extended intent data (Intent Score 0–100 + "why now"), MarketWar Deal Probability Score (fit/intent/urgency/budget/authority/engagement/risk/close probability/deal value) | Part 12 L8898–8965; Part 15 L19411–19471 | ✅ | 17-field enrichment + `scoreDeal()` (fit/intent/urgency/budget/authority/engagement/risk → Deal Probability + expected deal value + why-now) in `src/backend/prospecting.ts`; smoke-verified |
| Apollo: multi-step sequences (email, LinkedIn task, call, WhatsApp/SMS where compliant, retargeting, CRM task; Day 1/3/5/7/10/14), per-lead AI personalisation, built-in 11-stage pipeline, meeting engine, 13-metric dashboard, 9 APIs, GDPR/UK-EU compliance layer, admin controls | Part 12 L8967–9074; Part 15 L19472–19574 | ✅ partial | `buildSequence()` (Day 1/3/5/7/10/14 + icebreaker/pain/objection/call-script) + `outreach-commander` agent (Agent 34) + 11-stage `PIPELINE_STAGES` + compliance layer (corporate-first, LIA/opt-out flags) in `src/backend/prospecting.ts`; live sending + meeting engine + metrics dashboard 📦 |
| **YepAPI pack — SEO + GEO intelligence**: SEO command centre (site audit, crawl health, Core Web Vitals, AI readability), keyword engine (difficulty, opportunity score, intent classification), rank tracking (SERP features, local pack, alerts) | Part 12 L9115–9163; Part 15 L19592–19635 | 📦 | `source-notes/12`, `source-notes/15` |
| YepAPI: **GEO — Generative Engine Optimisation** (brand visibility in ChatGPT/Gemini/Perplexity/Google AI Overviews/AI Mode/Claude-style assistants; AI answer share-of-voice, prompt-level ranking, citation tracking, brand authority score, missing-source detection, AI answer optimisation plan — "very important for 2026") | Part 12 L9164–9183; Part 15 L19636–19654 | ✅ partial | already shipped in the Strike phase: `src/backend/geo.ts` (`geoAudit`, `citationRadar` — AI answer share-of-voice across ChatGPT/Claude/Gemini/Perplexity) + `/api/geo` + `/dashboard/organic` + `geo-recon`/`citation-radar` agents; full rank-level prompt tracking 📦 |
| YouTube SEO Intelligence (YepAPI §11): topic/keyword research, viral title pattern analysis, comment pain-point mining + sentiment, shorts script, thumbnail strategy | Streamed spec 2026-07-20 | ✅ | `src/backend/youtube.ts` + `/api/youtube` — deterministic ESTIMATE-labelled YouTube SEO engine (keywordResearch, analyseTitles, mineComments, shortsScript, thumbnailStrategy) with keywords/titles/comments/script actions; smoke-verified |
| White-label Reporting Centre — agency-ready reports (SEO audit, competitor gap, keyword ranking, backlink, local SEO, AI visibility, monthly growth) + white-label branding + PDF/PPTX/CSV/link exports | Streamed spec 2026-07-20 | ✅ | `src/backend/reporting.ts` + `/api/reporting` — deterministic 7-section white-label report builder, ESTIMATE-labelled scores, ACU-costed export specs; smoke-verified |
| Loyalty & referral network: tiered points, referral codes, k-factor projections, wallet passes (Referral Engine + Brevo loyalty) | Streamed spec 2026-07-20 | ✅ | `src/backend/loyalty.ts` + `/api/loyalty` — tier lookup, points earning, consent-capped referral invites, k-factor viral ESTIMATES, wallet pass spec; smoke-verified |
| YepAPI: backlink intelligence, competitor teardown ("Beat this page" briefs), content automation, programmatic SEO builder (hundreds of location pages, auto-publish to CMS), local SEO suite, smart scraping, YouTube intelligence, white-label reporting | Part 12 L9186–9293; Part 15 L19655–19754 | ✅ partial | **Programmatic SEO Builder shipped**: `src/backend/programmatic-seo.ts` + `/api/programmatic-seo` — 5 page types (location/service-area/comparison/industry/"best X in Y"), `generateBatch()` recombines service×location×industry axes into hundreds of unique page specs (title/meta/slug/JSON-LD), with **duplicate-content variation control** (near-duplicate signatures skipped); emits specs for the landing engine to render; smoke-verified. Backlink intel = `src/backend/seo.ts`; auto-publish-to-CMS + smart scraping + YouTube intel + white-label reporting 📦 |
| **Brevo pack — Customer Engagement OS**: email builder (drag-and-drop, AI copywriter, spam-risk preview), bulk sending infra (1k→1M+, throttling, warm-up, suppression, dedicated IP), deliverability centre (SPF/DKIM/DMARC/BIMI, reputation, blacklist monitoring) | Part 12 L9328–9375; Part 15 L19770–19819 | ✅ partial | already shipped as M-34: `src/backend/email.ts` (4-stage hygiene pipeline, Resend→SendGrid pool, warm-up/throttle/suppression) + `/api/email` + `email-commander` agent (SPF/DKIM/DMARC/BIMI + reputation posture); drag-and-drop builder UI + dedicated-IP provisioning 📦 |
| Brevo: honesty constraint — never promise "100% inbox / 0 spam"; promise = "Maximum inbox placement through authentication, warm-up, list hygiene, compliance, reputation protection, smart throttling, and AI deliverability optimisation" | Part 12 L9330–9334; Part 15 L19771–19774 | ✅ | shipped verbatim in the `email-commander` agent doctrine ("inbox placement is EARNED… never promise around it") — the legally load-bearing wording is enforced in `src/shared/agents.ts` |
| Brevo: CRM/CDP, segmentation, 12 lifecycle automations, 10+ channels, transactional messaging (OTP, receipts, invoices), sales CRM, shared inbox with AI suggested replies, 14-metric analytics | Part 12 L9378–9475; Part 15 L19820–19920 | 📦 | `source-notes/12`, `source-notes/15` |
| Brevo Incorporation Pack (developer-ready): 17-module "Customer Communication & Revenue Automation OS", snake_case feature catalogues per module, 15-trigger/12-action automation vocabulary, ~30 API routes (POST /api/campaigns/omnichannel/create …), 39 collections, 3-phase build priority | Part 12 L11763–12448; Part 15 L16929–17614 | ✅ partial | **Segmentation** = `src/backend/segments.ts` + `/dashboard/segments`; **No-Code Automation Builder** = `src/backend/automation.ts` (15 triggers / 12 actions, trigger→condition→action→delay→branch, 5 journey templates, consent-gate + frequency-cap validation + dry-run) + `/api/automation` + `/dashboard/automation` + `automation-architect` agent (Agent 35); Email=M-34, retargeting=M-35. Unified inbox, CRM pipeline, booking, loyalty, wallet, chatbot 📦; `source-notes/12`, `source-notes/15` |
| **Contact Extractor / Lead Harvest AI**: compliant B2B contact intelligence — 23 lawful public sources; low-risk generic vs higher-risk personal email classification; crawler suite; per-email record (13 fields incl. lawful-basis status); 12-check verification; GDPR/LIA/PECR/CAN-SPAM compliance engine; 12-check outreach gate; warm-up/throttled sending | Part 12 L9518–9689; Part 15 L19937–20092 | ✅ partial | **Compliance engine shipped**: `src/backend/lead-harvest.ts` — `classifyEmail()` (generic corporate vs personal-data), `buildContactRecord()` (all 13 fields incl. lawful-basis status), `verifyEmail()` (12-check verification → risk + bounce probability + verdict), `assessCompliance()` (GDPR lawful basis / LIA / PECR / CAN-SPAM by region — UK/EU personal needs consent or passed LIA, US = CAN-SPAM opt-out, do-not-contact honoured), `outreachGate()` (12 pre-send checks; any failure blocks) + `/api/lead-harvest` (classify/verify/compliance/gate); smoke-verified. 23-source crawler suite + live MX/blacklist lookups + warm-up sending 📦 (crawling needs connectors); honesty doctrine "maximum inbox placement, never '0 spam'" enforced |
| **Trustpilot pack — Trust, Reviews & Reputation Engine**: review collection (email/SMS/WhatsApp/QR invitations), public trust page per business, TrustBox-style widgets (9 types), 13-metric analytics, AI review responses, fake-review/fraud detection (10 controls), review SEO + AI-visibility, reviews→marketing assets studio, reviews→business intelligence, competitor trust benchmark, Free/Starter/Growth/Premium/Enterprise plans | Part 12 L9716–9885; Part 15 L20093–20259 | ✅ partial | `src/backend/reputation.ts` (`computeTrust` TrustScore+analytics, `analyseSentiment` CX intel, `draftResponse` AI replies with escalation+legal-risk, `fakeReviewRisk` manipulation detection, `reviewToAssets` social-proof studio, `competitorTrust` benchmark, AI-visibility readiness) + `/api/reputation` + `/dashboard/reputation` + `reputation-guardian` agent (Agent 29); review-invitation sending + embeddable widgets + public trust page 📦 |
| **Yelp pack — Local Discovery, Reviews, Booking & Lead Gen**: consumer search filters, public business profiles, Request-a-Quote marketplace, booking engine (reservations, deposits, no-show protection), verified reviews with AI summaries, AI local concierge ("best restaurant near me for 6 tonight"), local ads (pay-per-click/lead/booking), page upgrades, unified local inbox, AI growth manager, consumer app layer, trust verification, AI video generation | Part 12 L9910–10097; Part 15 L20260–20438 | ✅ partial | **Discovery + Request-a-Quote + Booking shipped**: `src/backend/local-marketplace.ts` — `discoverLocal()` (category/location/rating/price/verified/bookable filters → transparent discoveryScore + badges), `requestQuote()` (job → ranked provider matches with matchScore + "why" reasons + budget-fit + responseScore + quote-expiry; honesty-labelled estimates), `bookingOffer()` (availability slots, tiered deposit, no-show protection, transactional reminders respecting the touch cap, reschedule/cancel policy) + `/api/local-marketplace` (discover/quote/book) + demo directory; smoke-verified. AI local concierge = NL front-end over these primitives 📦; public profiles + local ads + page upgrades + consumer app + verified-review summaries 📦 |
| **Yell pack — UK Local Directory + Lead Outreach**: UK business search (website/email/WhatsApp availability filters, lead score), public-data extractor with contact-permission status, one-click compliant contact (10 mandatory checks), profile builder, request-a-quote matching, Local SEO service module (vs Yell £300/£699 per month), reputation manager, 10-channel inbox, Yell-Ads-style advertising (lead guarantee model), Marketing MOT | Part 12 L10122–10230; Part 15 L20439–20537 | 📦 | `source-notes/12`, `source-notes/15` |
| Brevo-class customer engagement: CDP contacts, AI smart segmentation, 12 lifecycle automations, 10 transactional types, 14-metric campaign analytics, AI reply drafter, consent + frequency-cap send gate | Streamed spec 2026-07-20 | ✅ | `src/backend/engagement.ts` + `/api/engagement` — deterministic engagement engine with aiSegment/campaignAnalytics/suggestReply/eligibleToSend + demoEngagement; POST actions segment/analytics/suggest-reply/eligible/automations, GET doctrine; smoke-verified |
| YepAPI-class classic-SEO intelligence (keyword research, SERP tracking, backlink profiling, on-page technical audit) | Streamed spec 2026-07-20 | ✅ | `src/backend/seo.ts` + `/api/seo` — deterministic seeded estimates for keyword ideas/related/long-tail/PAA/buyer-intent, SERP position+features+competitors+trend, backlink profile with anchor mix + gaps, and a 10-check on-page audit; GET returns doctrine + demoSeo(); every number labelled an estimate; smoke-verified |
| AI Local Concierge — natural-language front-end over the local marketplace engine | Streamed spec 2026-07-20 | ✅ | `src/backend/concierge.ts` + `/api/concierge` — rule-based intent parsing (category/postcode/budget/urgency/booking) reusing discoverLocal + requestQuote + bookingOffer; ranked matches with transparent reasons, estimate-labelled price/availability, book/quote CTA, clarify fallback; smoke-verified |
| B2B Buying Intent Radar (Apollo-class) — score target-company buying intent across 10 signal types | Streamed spec 2026-07-20 | ✅ | `src/backend/intent-radar.ts` + `/api/intent-radar` — deterministic 10-type intent scoring (score/radar), composite + level + whyNow + offer angle, all labelled ESTIMATES; smoke-verified |
| Global Localisation Engine — transcreation (17 axes), fixed-FX currency, religion/legal flags, media plan | Streamed spec 2026-07-20 | ✅ | `src/backend/localisation.ts` + `/api/localisation` — transcreation (not translation) across 17 axes, curated market profiles, fixed-rate currency conversion, cultural/legal/religion flags, voiceover/subtitle/lip-sync media plan, ESTIMATE disclaimers + consent/frequency cap; smoke-verified |
| Unified inbox across 9 channels + CRM pipeline with weighted forecast (Brevo/Yelp-class) | Streamed spec 2026-07-20 | ✅ | `src/backend/inbox.ts` + `/api/inbox` — deterministic unified inbox (SLA priority sort, DRAFT AI replies never auto-sent, ESTIMATE summaries) and 10-stage pipeline with fixed win-probability weighted forecast; smoke-verified |
| **Organic Dominance OS (BabyLoveGrowth + Brandwatch fusion)** — operating loop Listen→Predict→Decide→Create→Publish→Engage→Capture→Convert→Attribute→Optimise; 20-section nav; command centre with 23 commercial metrics + "What changed?" daily briefing + one-click actions; autonomous onboarding (18 inputs → 17 outputs) | Streamed spec 2026-07-20 | ✅ partial | **Execution loop already spans shipped engines**: Search Intelligence = `src/backend/search.ts`; AI-visibility/GEO = `src/backend/geo.ts`; classic SEO = `src/backend/seo.ts`; demand/intent = `src/backend/intent-radar.ts`; reputation = `src/backend/reputation.ts`; content = `warfare.ts`/`content-factory`; distribution = `automation.ts`; capture/convert = `prospecting.ts`/`inbox.ts`; attribution/optimise = `roi-engine.ts`/`creative-optimizer.ts`/`admin-economics.ts`; daily briefing = `/dashboard/briefing`. Unified 23-metric command centre + `llms.txt`/AEO generator 📦 |
| Claims & Compliance verification (Claim Verification + Compliance agents + C2PA provenance) | Streamed spec 2026-07-20 | ✅ | `src/backend/compliance.ts` + `/api/compliance` — claim classification (verified/user_confirmed/inferred_pending/prohibited), campaign review with regulated-category flags + mandatory AI disclosure, C2PA-style provenance; smoke-verified |
| Autonomous Business & Market Onboarding (Organic Dominance §5) — business → brand voice, audience map, personas, problem map, competitor angles, keyword/question/AI-prompt universes, content pillars, conversion goals, 90-day plan | Streamed spec 2026-07-20 | ✅ | `src/backend/onboarding.ts` + `/api/onboarding` — deterministic hypothesis/ESTIMATE generator with consent + 5-touch/7-day cap doctrine, no fabricated testimonials/metrics; smoke-verified |
| Revenue Attribution + viral-to-revenue funnel, U-shaped channel attribution, content ROI (Revenue Attribution Agent) | Streamed spec 2026-07-20 | ✅ | `src/backend/attribution.ts` + `/api/attribution` — deterministic 8-stage viral-to-revenue funnel with biggest drop-off + revenue estimate, U-shaped (40/20/40) channel attribution, content ROI verdict; smoke-verified |
| Organic Dominance §10 **Generative Search Visibility Engine** (visibility across AI Overviews/ChatGPT/Perplexity/Copilot/Gemini/Claude; brand-mentioned/cited/recommended rates; AI Answer Accuracy Monitor; causal-measurement safeguard vs control groups) | Streamed spec 2026-07-20 | ✅ partial | AI answer share-of-voice already shipped in `src/backend/geo.ts` (`citationRadar`) + `/dashboard/organic`; AI Answer Accuracy Monitor + causal safeguard scoped as next-round `ai-accuracy` engine |
| Organic Dominance §11 **Technical SEO/GEO/AEO Auditor** (crawlability, page structure, performance/CWV, 15 structured-data types, AI-readiness incl. `llms.txt`; Fix mode w/ severity + auto-fix eligibility + rollback) | Streamed spec 2026-07-20 | ✅ partial | on-page audit shipped in `src/backend/seo.ts` (`onPageAudit`); full crawl + Fix-mode auto-fix + `llms.txt` generator 📦 |
| Organic Dominance §12 **Competitor War Room** (20 competitor signals) + Weakness Scanner (14 weakness types) + 10 one-click exploitation actions | Streamed spec 2026-07-20 | ✅ partial | competitor signals via `market-listening.ts` (SoV/sentiment/momentum) + `/dashboard/competitors`; dedicated Weakness Scanner + exploitation actions scoped as next-round `competitor-warroom` engine |
| AI Answer Accuracy Monitor — generative-search visibility audit (brand mention/citation, factual issue detection, causal-safeguarded lift) | Streamed spec 2026-07-20 | ✅ | `src/backend/ai-accuracy.ts` + `/api/ai-accuracy` — checkAnswer() audits AI answers vs ground-truth facts (price/location/product/brand-confusion/negative-framing), causalSafeguard() control-adjusts growth to avoid over-claiming; smoke-verified |
| Competitor War Room + Weakness Scanner (Organic Dominance §12) — monitor rivals across search/AI/social/sentiment, scan exploitable weaknesses, recommend ethical exploitation plays, sales battlecards | Streamed spec 2026-07-20 | ✅ | `src/backend/competitor-warroom.ts` + `/api/competitor-warroom` — seeded signal board, weakness scanner, exploitation playbook, battlecard; ESTIMATES only, no knocking-copy, consent/cap; smoke-verified |
| Autonomous Content Factory — evidence-first content engine (26+ output types, control surface, claim evidence classifier) | Streamed spec 2026-07-20 | ✅ | `src/backend/content-engine.ts` + `/api/content-engine` — deterministic briefs, claim evidence classification blocking fabricated stats/unverified claims in high-risk contexts; smoke-verified |
| Organic Dominance §13 **Content Opportunity Radar** (merge 12 signal sources → 14 opportunity categories; transparent Opportunity Score = Demand×Intent×Relevance×Timing×Authority×Conversion ÷ Competition) | Streamed spec 2026-07-20 | ✅ | `src/backend/opportunity-radar.ts` + `/api/opportunity-radar` — `scoreOpportunity()`/`rankOpportunities()` implement the transparent formula exactly (every factor shown in a human-readable breakdown), factors are caller-re-weightable (auditable, not a black box), 12 `SIGNAL_SOURCES` + 14 `OPPORTUNITY_CATEGORIES`; signals scored from supplied inputs, never fabricated; smoke-verified |
| Organic Dominance §14 **Autonomous Content Factory** (26 output types, 17 generation controls, evidence-first claim classification — never fabricate stats/citations; high-risk requires source validation) | Streamed spec 2026-07-20 | ✅ partial | `content-factory` agent + evidence-first ties to `compliance.ts` claim classification; dedicated `content-engine` (26 outputs + controls) scoped next-round |
| Organic Dominance §15 **Product-Image-to-Growth** (1 image → recognise → attributes → keywords/prompts → pages/social/video → local versions → publish → track) | Streamed spec 2026-07-20 | ✅ | already the VisualStrike→SiteRaid chain: `src/backend/visualstrike.ts` (product intelligence + identity lock + angles) → `programmatic-seo.ts` (pages) → `localisation.ts` (local versions) → `campaign-architect.ts` (campaign) |
| Organic Dominance §16 **Website-to-Growth one-click** ("Turn this website into a growth engine") | Streamed spec 2026-07-20 | ✅ partial | composite orchestration over shipped engines: `siteraid.ts` (audit/DNA/attack map) → `opportunity-radar.ts` → `campaign-architect.ts` → `programmatic-seo.ts` → `market-listening.ts` → `attribution.ts`; single one-click orchestrator surface 📦 |
| Organic Dominance §17 **Authority & Backlink Engine** (17 link-opportunity types; 8-factor quality/safety scoring; no low-quality reciprocal schemes) | Streamed spec 2026-07-20 | ✅ partial | backlink profiling shipped in `src/backend/seo.ts` (`backlinkProfile` + gap + toxic); digital-PR/outreach/journalist-request + 8-factor opportunity scoring 📦 (next-round `authority-engine`) |
| Organic Dominance §18 **Community & Reddit Intelligence** (governed participation: discover discussions, non-promotional drafts, disclosure-required detection, anti-spam limits, per-community reputation) | Streamed spec 2026-07-20 | 📦 | next-round `community-intel` engine (deterministic scoring core buildable; ingestion connector-gated) |
| Organic Dominance §19 **Reputation & Crisis Command** (13 early-warning signals; Crisis Severity Score from 10 factors; 4-level crisis workflows Monitor→Executive) | Streamed spec 2026-07-20 | ✅ | `src/backend/crisis-command.ts` + `/api/crisis-command` — deterministic 10-factor `crisisSeverity` + 4-level ladder + `earlyWarning` signal scan + `CRISIS_WORKFLOWS`, all ESTIMATE-labelled, no auto-publish, higher levels require human approval; smoke-verified |
| Organic Dominance §20 **Unified Social Inbox + Customer Memory** (8 channels; 14-field customer profile card; AI response assistant; per-channel/risk/role human-approval) | Streamed spec 2026-07-20 | ✅ partial | unified inbox + AI draft replies shipped in `src/backend/inbox.ts`; customer profile card + cross-channel memory 📦 |
| Organic Dominance §21 **Customer Voice Intelligence** (merge 12 proprietary+public inputs → 13 outputs; Product Backlog Bridge: insight → product requirement) | Streamed spec 2026-07-20 | ✅ | `src/backend/customer-voice.ts` + `/api/customer-voice` — deterministic voice clustering (pains/feature-requests/defection/price-objections/emotional-drivers/revenue-at-risk/retention) + `backlogBridge` (insight → evidence-backed product requirement with acceptance criteria + P0–P3); ESTIMATE-labelled, no fabricated feedback; smoke-verified |
| Organic Dominance §22 **Influencer & Creator Intelligence** (11 discovery signals; campaign management incl. fraud detection; micro-influencer/local-first priority) | Streamed spec 2026-07-20 | ✅ | `src/backend/creator-intel.ts` + `/api/creator-intel` — 11 discovery signals, `scoreCreator`/`shortlist` (micro-first priority) + `campaignBrief` (mandatory ad disclosure, milestone payments, fraud checks); ESTIMATE-labelled, consent-capped; smoke-verified |
| Organic Dominance §23 **Local & African Market Intelligence** (mixed-language/slang/code-switching/mobile-money terms; offline field-agent capture → transcribe/translate/classify; low-bandwidth mode: text-first, WhatsApp/email/PDF briefings) | Streamed spec 2026-07-20 | 📦 | major differentiator; deterministic normalisation + offline-submission classification core buildable; transcription/translation connector-gated; ties to `localisation.ts` (Africa markets already in its map) |
| Organic Dominance §24 **Viral Opportunity Engine** (10 acceleration signals → Viral Opportunity Card; safe/opportunistic/high-risk/prohibited classification) | Streamed spec 2026-07-20 | ✅ partial | relevance+risk gate already shipped in `campaign-architect.ts` (`trendHijackGate` — rejects tragedy/harm/misleading); dedicated Viral Opportunity Card (hook/script/visual/timing) 📦 |
| Organic Dominance §25 **Campaign Generator from Live Demand** (opportunity ≥ score → objective/audience/offer/landing/SEO/social/video/email/WhatsApp/retargeting/measurement/budget/approval) | Streamed spec 2026-07-20 | ✅ partial | composite over `opportunity-radar.ts` → `campaign-architect.ts` → `content-engine`/`warfare.ts` → `landing.ts` → `attribution.ts`; single trigger-orchestrator 📦 |
| Organic Dominance §26 **Organic-to-Paid Amplification** (10 decision factors → convert organic to ad, variants, retargeting, budget, test→scale→stop by economics) | Streamed spec 2026-07-20 | ✅ partial | virality + retargeting in `src/backend/amplify.ts`; dedicated amplify-decision engine (velocity/margin thresholds) 📦 |
| Organic Dominance §27 **Attribution & Commercial Measurement** (Mention→…→Margin chain; 9 attribution models; 15 commercial metrics incl. revenue by prompt/keyword/community/influencer, crisis-prevented revenue) | Streamed spec 2026-07-20 | ✅ partial | 8-stage funnel + U-shaped model + content ROI shipped in `src/backend/attribution.ts`; additional models (first/last/linear/time-decay/data-driven) + segment-level revenue 📦 |
| Organic Dominance §28 **20-agent architecture** (Business Discovery → Executive Briefing) | Streamed spec 2026-07-20 | ✅ partial | maps onto the shipped engines + `src/shared/agents.ts` roster (market-listening, search, geo, competitor, opportunity-radar, content, seo, compliance, attribution, admin-economics, briefing, …); explicit 20-agent registry mapping 📘 |
| Organic Dominance §29 **Automation Builder** (natural-language rules → trigger/condition/action/approval/owner/budget/ACU-limit/window/retry/audit/rollback) | Streamed spec 2026-07-20 | ✅ partial | no-code trigger→condition→action→delay→branch builder shipped in `src/backend/automation.ts` (15 triggers/12 actions, consent+cap validation, dry-run); NL-rule parsing + ACU-limit/rollback controls 📦 |
| Organic Dominance §30 **User Roles & Approvals** (15 roles; 7 approval levels autonomous→never-automate) | Streamed spec 2026-07-20 | ✅ partial | autonomy levels 0–4 + high-risk caps shipped in `campaign-architect.ts` (`autonomyGate`); 15-role RBAC matrix 📦 |
| Organic Dominance §31 **Agency & White-label Mode** (multi-client workspaces, per-client branding/ACU budgets/approval portals, reseller billing, white-label domains) | Streamed spec 2026-07-20 | ✅ partial | white-label reporting shipped in `src/backend/reporting.ts`; multi-tenant agency workspace + reseller billing 📦 |
| Organic Dominance §32 **ACU & AI Cost Governance** (task-level provider/model/tokens/cost/ACU/margin record; markup floor; daily/monthly/campaign/agent limits; auto-stop; intelligent model routing lightweight→premium) | Streamed spec 2026-07-20 | ✅ partial | markup floor + profit protection + arbitration shipped in `src/backend/acu.ts`; owner margin dashboard + cost-leakage + provider mix in `src/backend/admin-economics.ts`; per-task ledger + tiered model-routing policy + ACU wallet limits 📦 |
| Organic Dominance §33 **Data model** (43 principal entities + `MarketMention` interface) | Streamed spec 2026-07-20 | 📘 | extends the master data-model register (`docs/ai-os/07`); `market-listening.ts` Mention type already carries sentiment/intent/reach/period; full 43-entity schema documented for adoption |
| Organic Dominance §34 **Integration Architecture** (25 native connectors; `MarketWarConnector` abstraction; own orchestration/data-model/scoring, connectors are replaceable) | Streamed spec 2026-07-20 | ✅ partial | connector categories + independence doctrine in `src/backend/integrations.ts` + `docs/ai-os/05`; `MarketWarConnector` interface (authenticate/testConnection/pullData/pushContent/refreshToken/rateLimit/disconnect) 📘 |
| Organic Dominance §35 **Governance, Privacy & Compliance** (GDPR processing, minimisation, retention, deletion, consent, access logging, RBAC, encryption, regional storage; AI transparency record per action) | Streamed spec 2026-07-20 | ✅ partial | per-business AES-256-GCM E2EE in `src/backend/crypto.ts`→`db.ts`; claim/consent/provenance in `compliance.ts`; audit trail in `src/backend/audit.ts`; full deletion/retention/regional-storage workflows 📦 |
| Organic Dominance §36 **12 Key Gaps** (intelligence→execution, unified intelligence, revenue attribution, AI-search measurement, SME affordability, African coverage, anti-vanity, product-dev bridge, unified customer memory, safe automation, cost governance, decision queue) | Streamed spec 2026-07-20 | ✅ partial | the shipped engine suite directly answers most gaps (execution loop, `attribution.ts`, `ai-accuracy` causal safeguard, ACU affordability, `market-listening` anti-vanity/lead-cards, `admin-economics` task margin); decision-queue briefing + product-backlog bridge + African pack 📦 |
| Organic Dominance §37–40 **roadmap/packaging/positioning** (5 dev phases, 17-point MVP acceptance, 5 commercial packages Starter→Enterprise, "autonomous demand-intelligence & market-execution OS" thesis) | Streamed spec 2026-07-20 | 📘 | roadmap + packaging (owner finalises pricing); MVP acceptance maps onto shipped onboarding→listening→opportunity→content→attribution→admin-economics chain; `docs/ai-os/08` |
| VideoDominance §25 automation integrations (Zapier/Make/n8n/Pabbly/MCP/REST/GraphQL/Firebase/Pub-Sub/CRM/Shopify/Zoom/Riverside/livestream events) | Streamed spec 2026-07-20 | ✅ partial | connector strategy in `src/backend/integrations.ts` + `docs/ai-os/05`; event-trigger fan-out 📦 |
| VideoDominance §26 **LiveStrike AI™** (livestream monitoring, in-stream clipping/captions/thumbnails, sponsor/goal/applause/breaking detection, publish while live, end-of-stream highlights) | Streamed spec 2026-07-20 | 📦 | real-time understanding is model/connector-gated; the moment-detection scoring core reuses `video-intelligence.ts` |
| VideoDominance Part-4 gaps 1–14 (Predictive Creative Intelligence, TrendMatch, BuyerMind, OfferForge, Campaign War Room, cross-format repurposing, Creative Laboratory, Viral-to-Revenue, ProfitGuard, RightsGuard, ClaimTruth, Creative Genome) | Streamed spec 2026-07-20 | ✅ partial | already answered by shipped engines: outcomes/attribution=`attribution.ts`, per-clip 8-score=`video-intelligence.ts`, trend-match=`campaign-architect.ts`+`opportunity-radar.ts`, repurposing=`content-engine.ts`, experiments=`creative-optimizer.ts`, ProfitGuard=`admin-economics.ts`+`acu.ts` profitCheck, ClaimTruth=`compliance.ts`+`content-engine`, Creative-Genome memory=`creative-optimizer.ts` rejected-memory. **BuyerMind now shipped** (`buyer-psychology.ts`); OfferForge + RightsGuard + ProfitGuard in round 7; first-party Predictive Creative learning 📦 |
| VideoDominance §Gap 4 **BuyerMind AI™** — customer-psychology engine (15 purchase drivers; clip brief per psychological objective) | Streamed spec 2026-07-20 | ✅ | `src/backend/buyer-psychology.ts` + `/api/buyer-psychology` — `detectDrivers()` (15 drivers, lexicon-based ESTIMATE from supplied text) + `briefForObjective()` (angle/hook/proof/CTA per driver, honesty guard on urgency/social-proof/revenue); smoke-verified |
| VideoDominance §Gap 5 **OfferForge AI** — generate offers from real product economics | Streamed spec 2026-07-20 | ✅ | `src/backend/offer-forge.ts` + `/api/offer-forge` — forges 11 offer archetypes from actual price/cost/stock, real margins with a 20% floor, never sells below cost, viable value ladder; smoke-verified |
| VideoDominance §Gap 12 **RightsGuard** — content rights & consent matrix, block publishing when required rights incomplete | Streamed spec 2026-07-20 | ✅ | `src/backend/rights-guard.ts` + `/api/rights-guard` — deterministic rights/consent checker requiring only use-relevant fields, blocks on any missing right; smoke-verified |
| VideoDominance §Gap 11 **ProfitGuard AI** — pre-scale safety + profitability gate | Streamed spec 2026-07-20 | ✅ | `src/backend/profit-guard.ts` + `/api/profit-guard` — 9-check pre-scale gate (in_stock/offer_valid/price_correct/margin/delivery/landing/checkout/cac/ai-cost) → scale|hold verdict; blocks scaling low-margin/out-of-stock products; smoke-verified |
| VideoDominance §11–13 (provider abstraction interface, ACU 4× markup + charging events, 6 implementation phases, final "Video Marketing & Revenue OS" positioning) | Streamed spec 2026-07-20 | ✅ partial | 4× markup floor already enforced in `src/backend/acu.ts` (reconfirms owner rule); provider arbitration = `arbitrateProvider`; per-event ACU metering + provider adapter interface 📘/📦; roadmap `docs/ai-os/08` |
| **Platform consolidation — "one entity"**: unified engine registry + AI Engines command index surfacing every backend intelligence engine in the UI, live-demonstrable | Consolidation 2026-07-20 | ✅ | `src/shared/engine-registry.ts` (single source of truth, 34 engines × category/api/actions) + `/dashboard/engines` (grouped index, per-engine "Run demo" hits the live GET) + Sidebar nav entry; **all 34 registry engines verified live + demonstrable (34/34)**; typecheck + layers + build + smoke (262/0) green |
| VideoDominance Modules 1–13 + Part 6 (27-agent architecture) + Part 7/8 (18 frontend routes, 37 backend services) | Streamed spec 2026-07-20 | ✅ partial | Modules map to shipped engines (ingestion/rights/understanding/moment-search/viral-analyst/buyer-psych/story/clip/reframe/caption/compliance/localisation/campaign/experiment/attribution/optimisation/margin = `video-intelligence`+`rights-guard`+`buyer-psychology`+`campaign-architect`+`content-engine`+`compliance`+`localisation`+`creative-optimizer`+`attribution`+`admin-economics`); autonomy L0–5 extends `campaign-architect` `autonomyGate`; render/publishing/dubbing services are model/connector-gated 📦; `/video-dominance/*` UI 📦 |
| **VideoDominance AI™ (OpusClip / WayinVideo class)** — clip intelligence: genre detection, moment ranking, multi-dimensional clip scoring, NL find-moments, reframe/caption specs | Streamed spec 2026-07-20 | ✅ partial | **Clip-intelligence brain shipped**: `src/backend/video-intelligence.ts` + `/api/video-intelligence` — `detectGenre()` (18 genres), `rankMoments()` (moment-level scoring + reasons), `scoreClip()` (**8 separate commercial scores** — reach/ad/engagement/retention/lead/conversion/brand-safety/profitability, never one vanity number), `findMoments()` (NL moment search with timestamp+transcript evidence, §16), `reframeSpec()`/`captionSpec()` (§5/§6 recommendations); smoke-verified. Multimodal analysis/render + dubbing + social autopublish + video knowledge graph 📦 (model/connector-gated); Video War Room UI at `/dashboard/video` + `caption-engine`/`viral-hook` agents |
| Organic Dominance: **Market/Social Listening** (Brandwatch-class) — monitor brands/products/competitors/topics/hashtags across social/forums/blogs/reviews/news/Reddit/YouTube; sentiment, share-of-voice, topic velocity, emerging-mention alerts, image/logo recognition | Streamed spec 2026-07-20 | ✅ partial | **Scoring core shipped**: `src/backend/market-listening.ts` + `/api/market-listening` — `analyseMentions()` (sentiment breakdown, share-of-voice vs competitors, topic frequency + velocity + emerging alerts, influencer identification by reach×engagement, reputation risk + recommended actions) + `detectLeads()` (Organic Dominance §8 Purchase-Intent & Lead-Detection → Lead Opportunity Cards with need/readiness/urgency/competitor/recommended-response/confidence, every reply consent+compliance-gated); analyses only supplied mentions, never fabricates; smoke-verified. Live public-source ingestion + image/logo recognition 📦 (connector-gated) |
| **Zeely extraction**: URL-to-ad generator, AI video ads with avatars (~7–12 min), prompt-to-ad, mobile-first, credits + $29.95/$49.95/$79.95 tiers; 5 exploitable gaps (full command centre, 12+ channels, industry agents, diagnosis-before-ads, micro-business affordability: mobile money, WhatsApp-first onboarding, no-card trial, local languages English/French/Lingala/Swahili) | Part 12 L10353–10505 | 📦 | `source-notes/12-build-transcript.md` |
| **AI Marketing ROI Engine / AI Growth OS** ("buy the cheapest next customer, not the most reach"): compare every channel by predicted CAC × conversion × ROI, owned-channels-first budget allocation, AI Budget Optimiser, AI Marketing Guarantee Score (readiness-before-spend: offer/website/creatives/targeting/tracking/follow-up → launch/improve/do-not-launch) | Part 12 (ROI engine / Zeely gaps) | ✅ | `src/backend/roi-engine.ts` (`compareChannels`, `campaignReadiness`) + `/api/roi` + `/dashboard/roi` + `growth-roi-strategist` agent (Agent 30); estimates re-ranked on real performance, no guaranteed results / no policy bypass (honesty guardrail); URL-to-ad + AI video 📦 |
| **Executive Marketing War Room** standing email framework (5 perspectives: Marketing Director / Financial / Business Benefits / Persuasion Psychology / Executive Comms; one-minute read, feature→benefit→money, tone by CEO/CFO/COO/CTO/Government/Investor) | Owner directive 2026-07-19 | ✅ | `executive-email-writer` agent (Agent 31) in `src/shared/agents.ts` — produces C-suite marketing emails to the exact framework, with an honesty guardrail (no invented stats, outcomes framed as ranges) |
| **TrustSeller AI / AI Creator Commerce Engine**: performance-based creator commerce ("Pay creators for results"); AI-managed discovery, fraud scoring, contracts, briefs, approval, tracking links, commissions, payouts; pay models per sale/lead/signup/hybrid; "Trust Sellers" concept (students, parents, teachers, taxi drivers, church leaders, WhatsApp group admins); creator tiers 0–4; Creator Performance Score (7 dimensions); JNN Creator Growth Network across founder portfolio (Tunakula, 3JN Travel, TicketRoyality, BitriPay, MarketWar OS, Buzz Pro, AxionOS, Veryx, LegAI, Health360, RakaPay, ParkSmart, StudYear, Openn Job, VIBR); anti-fraud controls; revenue model (activation fees, 20% payout commission, success fees, credits, £19/£49/£149 subscriptions) | Part 12 L10716–11152; inv-7 | 📦 | `source-notes/12-build-transcript.md` |
| **MarketWar Contact Agent (ContactWar AI)**: paste 1 company or CSV up to 10,000; Companies House API first-line validation; Company Match Score 0–100 (bands 95–100 confirmed … <50 rejected); generic-email-first contact discovery; Contact Confidence Score; Buyer Intent & Fit Agent → Opportunity Score ("ranked commercial opportunities, not contacts"); one-click outreach with compliance filters; ~30-field business record schema; commercial power filters; pricing Free/£19/£79/£199/£499+/Enterprise + per-verified-contact + success fee per booked meeting; margin-protection tactics | Part 12 L11451–11762; inv-7 | 📦 | `source-notes/12-build-transcript.md` |
| Live Market Intelligence Hub, LeadWar Room/Prospecting, SEO Command Centre + GEO Lab, Engagement Hub, Deliverability Guardian, Contact Intelligence Hub, Reputation Shield, Local Grid Control (prototype builds of the packs above) | Part 12 L8830–10240 (Gemini build notes) | 📦 | `source-notes/12` (built only in the discarded Firebase Studio prototype; not in this repo) |

---

## 10. Independence / external-API architecture (Parts 12 & 15)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Full independence doctrine: MarketWar OS is independent customer acquisition infrastructure, NOT a layer on Meta/Google/TikTok/Brevo/Mailchimp/HubSpot; 21-item must-own list (customer DB, landing pages, forms, CRM, inbox, automation, segmentation, email/SMS campaigns, referral, loyalty, marketplace discovery, local SEO, AI campaign/landing-page/follow-up generation, revenue attribution, ACU billing, analytics, optimisation, Stop/Fix/Scale intelligence) | Part 12 L7597–7620; Part 15 L17615–17639, L18364–18386 | 📘 | `docs/PRODUCTION-ARCHITECTURE.md` (owned stack: Hostinger→Cloudflare→Vercel→Firebase, adopted); `docs/ai-os/06-architecture.md`; verbatim `source-notes/15` |
| External APIs only for the un-ownable: WhatsApp sending, ad placement, telecom SMS, payments, calendar sync, platform imports, social publishing, identity/login, email deliverability infra | Part 12 L7597; Part 15 L17640–17649 | 📘 | `docs/ai-os/05-bitripay-and-connectors.md` (connector categories) |
| Platform fully useful if every external API disconnects (18 core capabilities offline-listed); never build as Meta/Google/TikTok wrapper or Brevo/Mailchimp/HubSpot/Canva/Buffer/Hootsuite clone | Part 12 L7620; Part 15 L17656–17695, L18401–18410 | 📘 | `docs/ai-os/06-architecture.md`; ✅ partial — repo works standalone with demo dataset + AI gateway |
| Integration Adapter Layer — `IntegrationAdapter` interface (provider, connect, disconnect, refreshToken, testConnection, syncData, sendAction, fetchMetrics, handleWebhook) + 7 integration collections (integrations, integration_accounts, integration_tokens, integration_sync_jobs, integration_webhooks, integration_errors, integration_usage_logs) | Part 15 L17700–17725, L18428–18448 | 📦 | `source-notes/15-marketing-strategy-agents-and-tail.md`; 📘 partial in `docs/ai-os/05` |
| `IntegrationProvider` 24-provider enum: meta_ads, google_ads, tiktok_ads, linkedin_ads, whatsapp_cloud, twilio_sms, sendgrid_email, amazon_ses, mailgun_email, stripe, paypal, shopify, woocommerce, google_calendar, microsoft_calendar, google_business_profile, facebook_pages, instagram_business, linkedin_pages, zapier, make, brevo_import, mailchimp_import, hubspot_import | Part 15 L18451–18475 (24) / L18135–18155 (20-provider draft) | 📦 | `source-notes/15` |
| `IntegrationAccount` schema (encrypted tokens, scopes, costMode, dependencyLevel optional/recommended/required_for_feature) | Part 15 L18157–18172, L18477–18496 | 📦 | `source-notes/15` |
| External endpoint maps: Meta (8), Google Ads (8), TikTok (7), LinkedIn (6), WhatsApp Cloud (8), SMS (7), Email (7), Payments (8 + 3 manual fallbacks), Calendar (6), Ecommerce (7), Social publishing (5) | Part 15 L17729–17961, L18498–18596 | 📦 | `source-notes/15`; REST/webhook analogue 📘 `docs/ai-os/07-database-and-api.md` |
| Internal API entry-point map — AI Core (9: /api/ai/business-diagnosis … /stop-fix-scale), Campaigns (6), Landing Pages (5), Lead Capture (5), CRM (6), Messaging (5), Automation (4), Referrals (5), Marketplace (4) | Part 15 L18067–18131, L18629–18687 | 📘 partial | `docs/ai-os/07-database-and-api.md` (REST + webhook spec); ✅ partial: `/api/agents/[agentId]`, `/api/audit`, `/api/gateway` implemented |
| Manual Mode fallbacks per channel (paid ads: download creative + copy audience; WhatsApp: wa.me links + CSV export; SMS: CSV export; email: HTML download; social: manual publish) | Part 15 L18174–18200, L18598–18627 | 📦 | `source-notes/15` |
| Owned channels built first: Landing Page Network `marketwar.site/{business}/{campaign}`, Business Marketplace `/discover/{city}/{service}`, Referral Network `/r/{business}/{code}`, SEO pages `/local/{city}/{service}`, owned CRM, email list manager, automation builder, analytics | Part 15 L17963–18001, L18689–18717 | 📦 | `source-notes/15` |
| Dependency classification: Must Own Internally (18) / Optional External (11) / Never Fully Depend On (Meta, Google, TikTok, Brevo, Mailchimp, HubSpot, Canva, Buffer, Hootsuite, Klaviyo, Shopify — "bridges, not foundations") | Part 15 L18003–18047 | 📦 | `source-notes/15` |
| AI Gateway with multi-provider failover (route by task, track provider cost + tokens, convert to ACU, hide provider from user, expose cost to admin, retry, fallback, log runs, store prompts/outputs, safety filters, brand rules — 12 responsibilities) | Part 13 L14214–14232; Part 12 L13042–13072 | ✅ partial | `src/backend/gateway.ts` + `src/backend/provider.ts` (Claude/OpenAI/Gemini failover, `/api/gateway`); ACU conversion + admin cost views 📘 `docs/ai-os/08` |
| Provider Arbitration Engine (continuously pick cheapest capable model across OpenAI/Gemini/Claude/Vertex/open-source/self-hosted; user never told which model) | Part 12 L7805–7838; Part 15 L19048–19068 | ✅ | `arbitrateProvider()` in `src/backend/acu.ts` (cheapest candidate clearing the quality bar; smoke-verified) + `/api/acu` action `arbitrate`; text failover ✅ `src/backend/gateway.ts` |
| Infrastructure Independence Protocol UI: Independence Score, Moat Intelligence widget (owned vs rented traffic ratio), Infrastructure Gateway Hub, "Owned Distribution Moat" branding | Part 12 L7602–7628 | ✅ partial | **Integration Adapter Layer shipped**: `src/backend/integrations.ts` (24 connectors isolated behind one interface, dependency classification must-own/optional/never-depend, owned-channels-first, **manual-mode fallback for every external action**) + `/api/integrations` + `/dashboard/integrations` (Integration Hub); Independence Score widget 📦 |
| 4-phase independent build order: Phase 1 Independent Core (15 items) → Phase 2 Owned Acquisition Infrastructure (9) → Phase 3 Delivery API Connectors (10) → Phase 4 Network Effect (7: marketplace, promoter network, affiliates, public search, discovery, demand routing, performance lead marketplace) | Part 15 L18295–18339, L18817–18862 | 📘 | `docs/ai-os/08-monetisation-security-roadmap.md` (phased roadmap); verbatim `source-notes/15` |
| Global reach: public SEO routes (/business/{slug}, /discover/{city}/{service}, /local/{city}/{service}, /offers/…, /campaign/…, /referral/…), community promoter network collections (affiliate_promoters, promoter_links, commission_rules, lead_tracking, conversion_tracking, payouts, fraud_checks) | Part 15 L18202–18237, L18689–18717 | 📦 | `source-notes/15` |
| Email independence strategy: Phase 1 low-cost provider (SES/SendGrid/Mailgun/Postmark/Resend) → Phase 2 own sender-reputation infrastructure → Phase 3 dedicated sending domains per user | Part 15 L17859–17878 | 📦 | `source-notes/15` |
| SMS provider options (Twilio, Vonage, MessageBird, local telecom aggregators, direct telecom deals later) + bring-your-own-gateway | Part 15 L17839–17857 | 📦 | `source-notes/15` |
| Adopted production topology: Hostinger (domain/DNS) → Cloudflare (edge/security) → Vercel (Next.js hosting) → Firebase (auth/data/storage) | repo decision record | 📘 | `docs/PRODUCTION-ARCHITECTURE.md` (adopted), `docs/DEPLOYMENT.md` |
| Firebase scaffolding with Firestore persistence + security rules | Part 12 tech-stack decisions | ✅ | `src/frontend/firebase-client.ts`, `src/backend/firebase-admin.ts`, `src/backend/db.ts`, `firestore.rules`, `storage.rules` |
| Tech stack: Next.js, TypeScript, Tailwind, Shadcn-style UI, Framer-Motion-style animation, chart layer, Firebase Auth/Functions/Firestore/Storage, Stripe, Twilio, SendGrid, WhatsApp Business API, Meta/Google/TikTok/LinkedIn APIs; AI layer OpenAI + Gemini + Claude (+ Vertex) behind internal gateway | Part 01 L304–360; Part 14 L15364–15397; Part 12 L13042–13072 | ✅ partial | Next.js/TS/Tailwind ✅ (repo), custom UI kit ✅ `src/components/ui.tsx`, SVG chart kit ✅ `src/components/charts.tsx`, AI gateway ✅; **Firebase Auth screens ✅ (`src/app/login` + `src/app/signup` via `src/components/AuthForm.tsx` — email/password + Google SSO, env-guarded demo fallback)**; Functions/Stripe/Twilio/SendGrid/ads APIs 📘 `docs/ai-os/05`–`06` |

---

## 11. Pricing & ACU economics

| Requirement | Source | Status | Where |
|---|---|---|---|
| Subscription tiers v1 (Doc 1 original & Version A): Free (1 audit, 3 posts, 1 campaign preview) / Starter **£9**/mo / Growth **£19**/mo / Pro **£39**/mo / Agency-White-Label **£99**/mo with per-tier feature lists | Part 01 L224–280; Part 13 L14249–14280 | 📘 | `docs/ai-os/08-monetisation-security-roadmap.md`; verbatim `source-notes/01`, `source-notes/13` |
| Subscription tiers v2 (Version B "Cheapest In Market"): Free / Starter **£5**/mo / Growth **£15**/mo / Pro £39 / Agency £99 with quantified limits (1/10/50 landing pages etc.) | Part 14 L15305–15340 | 📦 | `source-notes/14` — conflicts with £9/£19 (see §15) |
| AI Campaign Packs™: Starter **£5** (3 ads, 1 landing page, hashtags, CTA, WhatsApp flow) / Growth **£15** (10 ads, AI visuals, follow-up flows, retargeting copy, competitor analysis) / Domination **£49** (multi-platform, AI strategy, retargeting, WhatsApp automation, local SEO, referral campaign, optimisation) | Part 10 L5709–5763; Part 12 L13003–13019 | 📘 | `docs/ai-os/08` (campaign-pack stream); verbatim `source-notes/10` |
| ACU exchange rate: **£1 = 100 ACUs** | Part 01 L288; Part 10 L5769; Part 13 L14234; Part 14 L15342 | 📘 | `docs/ai-os/08` (ACU system) |
| ACU usage costs v1 (Doc 1): audit 50, campaign plan 30, landing page 80, 10 posts 40, competitor scan 60, full funnel 150 | Part 01 L282–302 | 📘 | `docs/ai-os/08`; verbatim `source-notes/01` |
| ACU usage costs v2 (Version A, 10 items): + offer generation 20, visual generation 60, customer DB analysis 100, full campaign pack 150, autonomous campaign run 500 | Part 13 L14234–14247 | 📘 | `docs/ai-os/08`; verbatim `source-notes/13` |
| ACU usage costs v3 (Version B, 15 items): + landing-page A/B variants 40, optimisation report 25, WhatsApp flow 30, SMS sequence 25, email sequence 35; 5x rule "provider cost for 100 ACUs ≤ £0.20" | Part 14 L15342–15362 | 📘 | `docs/ai-os/08` (fullest ACU line-item list); verbatim `source-notes/14` |
| Strategy-agent ACU prices: Avatar 30 / Message Weapon 35 / Channel Commander 35 / Content War Plan 80 / Funnel Architect 70 / Paid Ads Risk 60 / Battle Plan 50 / Landing Page 80; Full Marketing Strategy Pack bundle 350 ACUs, sold at £5, platform cost ≤ £1 (5x) | Part 15 L16263–16279 | ✅ | **7-agent connected chain shipped**: `src/backend/strategy.ts` (`buildCustomerAvatar`→`buildMessaging`→`buildChannelStrategy`→`buildContentPlan`→`buildFunnel`→`buildPaidAdsStrategy`→`buildBattlePlan`, each reuses the prior output; funnel always requires a landing page; paid ads risk-gated) + `/api/strategy` + `/dashboard/strategy` + `customer-avatar` (Agent 37) + `marketing-battle-plan` (Agent 38) agents; ACU pricing values indicative per owner deferral |
| ACU campaign costs (Option 2, Part 10): basic campaign 50, advanced 200, full autonomous 500 | Part 10 L5765–5777 | 📦 | `source-notes/10` |
| ACU Economics Framework ("operate like a utility company"): never sell AI at cost; min 100% margin, recommended 300–500%, strategic target 400%+; cost→charge table; provider costs never exposed | Part 12 L7637–7666; Part 15 L18880–18902 | ✅ | `src/backend/acu.ts` — **owner-confirmed standard markup 4× (£1 provider cost → £4 user), 2× hard floor** (2026-07-19); complexity/resource/demand scale the provider cost, the 4× applies once on top so £1→£4 holds exactly (smoke-verified); **provider cost never returned to any client**; `/api/acu`; `docs/ai-os/08` |
| ACU pipeline: User Request → AI Gateway → Cost Engine → Margin Engine → ACU Calculator → Execution Engine | Part 12 L7671; Part 15 L18904–18917 | ✅ | `src/backend/acu.ts` (Cost/Margin/ACU/Profit/Arbitration engine) chained after `src/backend/gateway.ts`; `docs/ai-os/08` |
| Dynamic pricing formula: ACUs = Provider Cost × Complexity × Resource Weight × Margin Multiplier × Demand Multiplier | Part 12 L7679; Part 15 L18919–18938 | ✅ | `quoteAcu()` in `src/backend/acu.ts` implements the formula exactly; smoke-verified |
| 4 resource tiers with margin bands: Tier 1 Low (chat/email/social) 5–8x; Tier 2 Medium (research/copy/plans) 4–6x; Tier 3 High (image/brand/logo/mockups) 3–5x; Tier 4 Very High (video/movie/voice cloning) 4–8x | Part 12 L7705–7755; Part 15 L18942–19012 | ✅ | `ACTION_CLASSES` in `src/backend/acu.ts` (low/medium/high/very_high with margin bands + resource weights) |
| Pre-execution ACU approval preview ("This task will consume 54 ACUs… Generate?") — no surprise spending | Part 12 L7758–7770; Part 15 L19016–19031 | ✅ | `preflightQuote()` in `src/backend/acu.ts` + `/api/acu` action `preflight` |
| AI Profit Protection Engine ("No task runs at a loss": switch provider / cheaper model / reduce quality / request top-up / queue) | Part 12 L7775–7800; Part 15 L19032–19046 | ✅ | `profitCheck()` in `src/backend/acu.ts` (below-floor margin blocked → escalates; smoke-verified loss-block) |
| Subscription + ACU hybrid tiers: Starter 500 ACUs / Growth 5,000 / Business 25,000 / Enterprise negotiated; unused ACUs expire | Part 12 L7842–7894; Part 15 L19069–19093 | ✅ | **superseded by the owner's finalised commercial model (2026-07-20)** — see the Subscription & Commercial Profitability engine row below |
| **Subscription & Commercial Profitability model (owner-finalised 2026-07-20)** — 8 plans (Free→Global) with 20%-of-price ACU auto-allocation; 30% annual discount with ACUs released monthly; default + flexible top-ups (no discount); expiry/rollover rules; org hierarchy + 3 wallet models; add-ons; premium modules; upgrade triggers; margin bands. **Terminology correction:** 4× = **300% markup = 75% gross margin** (margin can never exceed 100%; target 100–400% markup, min 300%) | Owner directive 2026-07-20 | ✅ | `src/backend/subscription.ts` + `/api/subscription` (quote-acus/plan/upgrade/contribution) — all 8 plan economics COMPUTED from the rules and verified against the owner table (Growth £49 → 980 ACUs/mo, annual £411.60, 686/mo release; £0.75 → 300 ACUs); `requiredAcus = cost × 4 × 100`; `netContribution` + margin bands (green ≥75 / amber / red / blocked); `acu.ts` now returns **`grossMarginPct`** (75% for 4×) alongside markup; surfaced in the AI Engines index; smoke-verified |
| Revenue multipliers: priority/instant processing (20/50/100 ACUs), premium models (50 vs 120), per-collaborator ACUs, export charges (PDF/PowerPoint/Video/API) | Part 12 L7899–7943; Part 15 L19095–19115 | ✅ | speed (`SPEED_TIERS`) + premium-model (`MODEL_TIERS`) surcharges in `src/backend/acu.ts`; **export charges now shipped** — `exportCharges()` in `src/backend/admin-economics.ts` prices PDF/PowerPoint/Video/API through `quoteAcu` (floor + markup hold; provider cost hidden), smoke-verified; per-collaborator ACUs 📦 |
| ACU Recycling (generate once, sell many times: templates, ad frameworks, prompt libraries, playbooks, funnels, agents — margins beyond 400%) | Part 12 L7948–7973; Part 15 L19117–19129 | ✅ | `recyclingRoi()` in `src/backend/admin-economics.ts` — amortises one generation cost across N resales (e.g. £1 → £100 over 50 sales = 9,900% effective margin), `/api/admin-economics` action `recycling`; smoke-verified |
| 7 revenue layers: Subscription + ACU consumption + Marketplace + Transaction + Advertising + API + Premium Agents | Part 12 L8007–8017; Part 15 L19155–19160 | ✅ | `REVENUE_LAYERS` in `src/backend/admin-economics.ts` (all 7, single source of truth) surfaced on `GET /api/admin-economics`; smoke-verified; `docs/ai-os/08` |
| §16 ACU Rules (10: never run expensive task / images / competitor scans / large DB analysis without an ACU check; always cache reusable outputs; always reuse prior BI; always prefer cheaper models; only use expensive models for premium; always log provider cost; always show admin gross margin) | Part 16 (streamed 2026-07-20) | ✅ | `ACU_RULES` in `src/backend/admin-economics.ts` (all 10, single source of truth) + enforced by `quoteAcu`/`profitCheck` (ACU check + cost log) and `ownerDashboard` (admin gross margin); `GET /api/admin-economics` |
| §16 Internal Cost Controls (11: prompt caching, output reuse, template reuse, small-model routing, batch generation, media compression, generation queues, provider fallback routing, ACU wallet limits, plan-based feature caps, admin margin dashboard) | Part 16 (streamed 2026-07-20) | ✅ partial | `COST_CONTROLS` in `src/backend/admin-economics.ts` (all 11 listed); provider fallback routing = `arbitrateProvider`, admin margin dashboard = `ownerDashboard`, cache-hit tracked in the ledger; caching/queues infra 📦 |
| §17 Build Phases 1–4 (P1 Independent Core → P2 Owned Acquisition Infrastructure → P3 External Delivery Connectors → P4 Global Network Effect) | Part 17 (streamed 2026-07-20) | 📘 | roadmap; P1/P2 engines largely shipped across `src/backend/*`, P3 connectors optional (`src/backend/integrations.ts`), P4 marketplace 📦; `docs/ai-os/08` roadmap |
| §18 Final Developer Instruction — operate without external platforms first (diagnose→fix offer→campaign→landing→capture→follow-up→recover→referral→marketplace→local SEO, then connect Meta/Google/TikTok/WhatsApp/SMS/email only if ROI-positive); "external platforms are optional distribution pipes" | Part 18 (streamed 2026-07-20) | ✅ doctrine | Independence doctrine enforced — optional connectors + manual-mode fallbacks (`src/backend/integrations.ts`), owned-first budget allocation (`src/backend/roi-engine.ts`); preview doctrine card "You're never locked in" |
| Margin governance history: 400%+ target → user-ordered **66% Competitive Margin** ("reduce OS profit margin from 100% to 66% to be competitive"), then "66% minimum" guardrail hard-coded in prototype `calculateACUs` | Part 12 L8403–8415, L8586–8601 | 📦 | `source-notes/12` — conflicts with 5x/400% rules (see §15) |
| 5x gross-margin core business logic (10 cost controls: ACU billing, prompt compression, caching, template reuse, low-cost model routing, output reuse, batch generation, pre-generation scoring, plan-gating, automation surcharges) | Part 11 L6319–6341; Part 14 L14453–14470 | 📘 | `docs/ai-os/08`; verbatim `source-notes/14` |
| Performance-based model (Option 3): small setup fee + pay per lead / booking / order; £5/mo access + £0.20–£1/lead + £2–£5/appointment + 3–10% commission | Part 10 L5779–5793; Part 02 L558–577; Part 13 L14282–14289 | 📘 | `docs/ai-os/08` (performance stream) |
| Prototype billing-hub pricing passes: Starter £49 → **£25**/mo, Growth £99, Domination £499; 1 ACU ≈ £0.05; volume-discount bundles; monthly expiry | Part 12 L8572–8601 | 📦 | `source-notes/12` — unreconciled with all other tier sets (see §15) |
| Strategy-doc tier sets: £9/£29/£99/£299 (Growth-Partner model) and £19/£79/£199/£499+ (Contact Agent) and TrustSeller £9.99/£29.99/£99 activation + £19/£49/£149 subscriptions + 20% payout commission + 5% success fees | Part 12 L11417–11423, L11684–11722, L10820–10855 | 📦 | `source-notes/12` — per-product pricing, unreconciled |
| Platform Owner admin margin dashboard (total revenue, provider costs, gross margin %, revenue by provider/user/feature, most expensive/profitable users, cost leakage alerts, cost trends, forecast profitability) | Part 12 L7978–8002; Part 15 L19131–19153 | 📘 | `docs/ai-os/04` (Admin Super Control Centre) + `docs/ai-os/08` |
| Free-tier definition (1 business audit, 3 AI posts, 1 campaign plan, basic landing page preview) | Part 01 L228–236; Part 13 L14250–14254; Part 14 L15307–15312 | 📘 | `docs/ai-os/08` |

---

## 12. Data model (evolution: 15 → 53 → 55 → 71 collections)

| Requirement | Source | Status | Where |
|---|---|---|---|
| v1 — 15 Firestore core collections: users, businesses, marketing_audits, campaigns, ad_creatives, landing_pages, leads, lead_events, competitor_scans, ai_agents, ai_runs, acu_wallets, subscriptions, provider_costs, performance_reports | Part 01 L362–364; inv-1 | ✅ partial | audits + agent runs persisted via `src/backend/db.ts` + `src/shared/types.ts`; `firestore.rules` scaffolded; remaining collections 📘 |
| v2 — 53 collections (Version A; adds business_profiles, business_brains, customer_profiles/segments/imports, audit_scores, offers, offer_scores, campaign_packs/assets/experiments, visual_assets, copy_assets, hashtags, landing_page_events, lead_scores, whatsapp_conversations/messages, sms_messages, email_messages, followup_sequences, retargeting_flows, referral_programs, affiliate_promoters, marketplace_listings, competitor_profiles, review_mining_reports, local_market_data, seo_pages, google_business_posts, ai_predictions, ai_recommendations, growth_briefings, acu_transactions, stripe_customers, budget_guard_events, fraud_flags, audit_logs, notifications) | Part 13 L14133–14187; inv-8 | 📦 | `source-notes/13-consolidated-spec-version-a.md`; relational schema 📘 `docs/ai-os/07-database-and-api.md` |
| v3 — 55 collections (Version B; adds landing_page_versions/sections/forms/scores/ab_tests/recommendations; drops business_profiles, campaign_experiments, stripe_customers, google_business_posts) | Part 14 L15399–15455 | 📦 | `source-notes/14-consolidated-spec-version-b.md` |
| v4 — **71-collection master list (fullest single list)**: v3 + forms, form_submissions, contacts, contact_identities, contact_events, deals, deal_stages, email_campaigns, sms_campaigns, whatsapp_campaigns, message_templates, message_logs, automation_workflows, workflow_triggers, workflow_actions, referral_links, promoter_commissions, marketplace_categories, local_seo_pages, seo_keywords, + 7 integration_* collections | Part 15 L18719–18790; inv-9 | 📦 | `source-notes/15-marketing-strategy-agents-and-tail.md` — **canonical fullest list**; PostgreSQL analogue 📘 `docs/ai-os/07-database-and-api.md` |
| Brevo-pack 39 additional collections (contacts, contact_identities, contact_segments, contact_events, campaign_channels, email/sms/whatsapp/push/wallet_campaigns, forms, form_submissions, automation_workflows, workflow_triggers/actions, transactional_messages, message_templates/logs, unified_inbox_threads/messages, chat_widgets, chatbot_flows, sales_pipelines, deals, deal_stages, meetings, call_logs, loyalty_programs/points/rewards, wallet_passes, data_imports, identity_resolution_rules, data_cleaning_rules, customer_scores, integrations, webhooks) | Part 15 L16873–16912, L17488–17526 | 📦 | `source-notes/15` (overlaps v4; reconcile on adoption) |
| 12 landing-page collections | Part 14 L14997–15009; Part 11 L7125–7144 | 📦 | see §8 |
| 11 strategy-agent shared collections (ai_agent_sessions, ai_agent_outputs, customer_avatars, messaging_strategies, channel_strategies, content_plans, funnels, paid_ad_strategies, marketing_battle_plans, landing_pages, campaign_packs) + AiAgentSession schema | Part 15 L16226–16262 | 📦 | `source-notes/15` |
| ~37-collection developer-spec list (incl. acu_wallets, acu_transactions, provider_costs, fraud_detection) | Part 12 L13074–13111 | 📦 | `source-notes/12` (superseded by v4) |
| 28-field customer profile schema (customer_id … consent_status) + 11 AI segments | Part 13 L13550–13589 | 📦 | `source-notes/13`; customer vault UI ✅ partial with demo data |
| BrandAsset schema + `brand_assets` collection (13 asset types, AI-detected colours) | Part 11 L6037–6058 | 📦 | `source-notes/11` |
| Blueprint production data model — PostgreSQL schema + ERD + REST/webhook API spec | doc2 §6–7 | 📘 | `docs/ai-os/07-database-and-api.md` |
| Master Account System layers A–E as data model | Part 05 L2107–2256 | 📘 | `docs/ai-os/07`; see §3.2 |

---

## 13. Zero Generic Info Protocol & behaviour mandates (Part 12 transcript)

| Requirement | Source | Status | Where |
|---|---|---|---|
| "MAKE SURE THE WHOLE SYSTEM PROVIDES NO GENERIC INFORMATION BUT REAL DATA AND RELATED INFORMATION BASED ON THE USER REQUEST" — origin of the Zero Generic Info Protocol | Part 11 L7476–7477; Part 12 L7477; inv-7 | ✅ | anti-generic master directive prepended to every agent in `src/shared/agents.ts` |
| Anti-Generic Directive mechanics: forbid "marketing best practices" fluff; mandate blunt tactical output; "AI Baseline Assumptions" + "Risk of Inaction" when data sparse; "High-Fidelity Tactical Payload" | Part 12 L7480–7494 | ✅ partial | `src/shared/agents.ts` directive; assumption/risk fields 📦 |
| Blunt STOP / FIX / SCALE (plus RECOVER / WATCH / TEST) strategic verdict language across all agents and dashboards | Part 12 L7485; Part 13 L13946–13952; Part 12 L12435–12448 | ✅ | agent verdict conventions in `src/shared/agents.ts`; dashboard verdict chips |
| Regional slang, local landmarks and cultural nuance in generated copy (PAS/AIDA with local identity) | Part 12 L7483–7484; Part 08 L4340–4342 | ✅ partial | agent prompts request local specificity; systematic locale engine 📦 |
| Pre-spend gating: AI Marketing Guarantee Score / Growth Readiness Score — refuse to launch until offer/website/creatives/targeting/tracking pass ("Don't launch yet. Fix this first.") | Part 12 L10681–10691, L11172–11181; Part 15 L16015–16027 | 📦 | `source-notes/12`, `source-notes/15`; audit verdicts ✅ partial |
| Warfare branding system (War Room, numbered agents as weapons, Infiltration Points, Conquest Missions, Phased Warfare, Ghost Competitors, scanline aesthetic) | Part 12 (throughout); inv-7 §3 | ✅ partial | dashboard naming + design language; full taxonomy 📦 |
| Reliability mandates: retry with exponential backoff + jitter (up to 5 attempts) on provider 503s, toast alerts | Part 11 L5913–5935; Part 12 L7499–7507 | ✅ partial | failover + retry behaviour in `src/backend/gateway.ts` |
| Compliance-as-architecture: LIA workflows, lawful-basis fields, 12-check outreach gates, ICO/PECR/CAN-SPAM embedding, "maximum inbox placement" promise discipline | Part 12 L9518–9689, L11737–11752 | 📦 | `source-notes/12`; blueprint compliance 📘 `docs/ai-os/08` + doc2 §9.3 |
| Emerging-market/Africa-first mandates: mobile-money connectors (M-Pesa, Orange Money, Airtel Money, Afrimoney, Flutterwave, Paystack), WhatsApp-first onboarding, no-card trial, local languages (English, French, Lingala, Swahili) | Part 12 L8281–8291, L10441–10451, L10496 | 📦 | `source-notes/12`; connectors 📘 `docs/ai-os/05` |
| "Superior flow" doctrine: Diagnose → Position → Create → Launch → Capture → Follow Up → Convert → Measure → Improve | Part 12 L10504, L11153–11450 | ✅ partial | onboarding→audit→campaign→recovery flow across dashboard |
| Design mandate: dashboards issue commands, not analytics ("Stop this campaign", "Do not spend yet") | Part 12 L7485, L13250–13260 | ✅ | agent outputs + priority panels |
| Never imply bypassing platform policies, scraping protected data, or guaranteed ad results (compliance caution) | Part 12 L10712–10715 | 📦 | `source-notes/12` (must carry into any future marketing copy) |

---

## 14. Document 2 — AI-OS Transformation Specification v3.0 (17 sections)

Document 2 was imported verbatim to `docs/reference/ai-os-specification-v3-imported.md` and then decomposed
into the buildable blueprint `docs/ai-os/01–08`. Every section is therefore 📘 (specified) with the verbatim
import as its source of record, except where noted.

| Requirement | Source (doc2 section) | Status | Where |
|---|---|---|---|
| §1 Executive Summary (mission, transformation scope, strategic outcome, post-transformation KPI targets) | doc2 §1.1–1.4 | 📘 | `docs/ai-os/01-executive-vision-and-market.md` |
| §2 Deep Concept Analysis (core mission extraction, business value chain, user archetype analysis, process friction map) | doc2 §2.1–2.4 | 📘 | `docs/ai-os/01` + `docs/ai-os/02-users-and-command-centres.md` |
| §3 AI-Agent Operating System Architecture (Central Intelligence Engine; Master Orchestrator Agent enhanced spec) | doc2 §3.1–3.2 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (Master Orchestrator) + `docs/ai-os/06-architecture.md` (AI orchestration) |
| §4 Complete AI Agent Ecosystem (agent architecture principles; complete agent specifications — growth corps, executive, engineering/QA, cybersecurity corps, revenue/customer/compliance agents) | doc2 §4.1–4.2 | 📘 | `docs/ai-os/03-agent-ecosystem.md` |
| §5 Complete System Architecture (high-level overview, frontend, backend & microservices, event-driven architecture) | doc2 §5.1–5.4 | 📘 | `docs/ai-os/06-architecture.md` (events, orchestration, observability, DR) + `docs/PRODUCTION-ARCHITECTURE.md` |
| §6 Database Architecture (data strategy; core Firestore collections production schema) | doc2 §6.1–6.2 | 📘 | `docs/ai-os/07-database-and-api.md` (PostgreSQL schema + ERD; Firestore rules ✅ partial in repo) |
| §7 API Architecture (design principles, core internal endpoints, external partner & developer API, webhook events) | doc2 §7.1–7.4 | 📘 | `docs/ai-os/07-database-and-api.md` (REST/webhook spec); ✅ partial: 3 API routes live under `src/app/api/` |
| §8 UX/UI Architecture (AI Command Centre design spec, design system incl. colour tokens, user journey maps) | doc2 §8.1–8.3 | 📘 | `docs/ai-os/02-users-and-command-centres.md`; visual system ✅ partial in `src/app/globals.css` + `src/shared/palette.ts` |
| §9 Security & Compliance Architecture (zero-trust model — 5 auth layers + full RBAC matrix, data protection & encryption incl. TLS 1.3 + per-business field keys, compliance framework, AI governance incl. 60-s L3 override + quarterly bias audits) | doc2 §9.1–9.4 | 📘 | `docs/ai-os/08` §B.1–B.5 + **§B.4a (full §9 adoption, RBAC matrix verbatim)**; `firestore.rules`/`storage.rules` ✅ partial |
| §10 Analytics & Intelligence Architecture (6 dashboards w/ refresh contract; 6 predictive models w/ algorithms, training data, accuracy targets) | doc2 §10.1–10.2 | 📘 | `docs/ai-os/06` **§6.1a (predictive model registry + dashboard refresh contract)** + learning loop |
| §11 Automation Framework (Pub/Sub + Cloud Tasks orchestration; six critical automations w/ triggers, gates, binding success metrics) | doc2 §11.1–11.2 | 📘 | `docs/ai-os/04` **§M-23a (all six automations verbatim)**; workflow builder itself 📦 (see §2.3) |
| §12 Revenue Architecture (7 streams w/ pricing + Y1 £1.28M / Y3 £51M targets; ACU recycling 10×–50× asset economics) | doc2 §12.1–12.2 | 📘 | `docs/ai-os/08` **§A.1b + §A.2a**; owner 100% floor governs (§17 rulings) |
| §13 Infrastructure & Deployment Architecture (GCP service configs, 4-environment strategy w/ RTO<4h/RPO<1h, cost optimisation incl. <£0.005/task blended LLM) | doc2 §13.1–13.3 | 📘 | `docs/ai-os/06` **§3.2 (GCP config + cost strategy) + §10.1 (environments)**; topology decision remains `docs/PRODUCTION-ARCHITECTURE.md` (Hostinger→Cloudflare→Vercel→Firebase); Redis 6 GB (MVP) vs 64 GB (scale) reconciled additively in §3.2 |
| §14 Engineering Delivery Roadmap (week-by-week MVP/V1/V2/V3 deliverables to wk 96; 9-head team structure) | doc2 §14.1–14.5 | 📘 | `docs/ai-os/08` **§C.1 (week-by-week) + §C.2 (team table verbatim)** + phase table |
| §15 Risk Assessment (10-risk register w/ binding mitigations: 30-s gateway failover, 800-user break-even, 8-week Firebase exit) | doc2 §15.1 | 📘 | `docs/ai-os/01` **§3.6a (full register verbatim)** + `docs/ai-os/08` |
| §16 Scalability Strategy (5 principles; 5 scaling milestones £500→£80k+/mo) | doc2 §16.1–16.2 | 📘 | `docs/ai-os/06` **§10.2 (milestone ladder verbatim)** |
| §17 Global Expansion Strategy (5-phase geographic roadmap UK→global; localisation architecture incl. low-bandwidth mode + BitriPay DRC corridor) | doc2 §17.1–17.2 | 📘 | `docs/ai-os/08` **§C.3 (roadmap + localisation architecture verbatim)** + `docs/ai-os/01` |
| doc2 KPI targets & platform positioning statements ("3.0 — Production Grade") | doc2 header + §1.4 | 📘 | `docs/ai-os/01-executive-vision-and-market.md` |

---

## 15. Gaps & conflicts register

Conflicts found across the source documents, with a recommended resolution for each. None of these block
current code; all must be settled before the corresponding backlog items are promoted to 📘/✅.

| # | Conflict | Evidence | Recommended resolution |
|---|---|---|---|
| 1 | **Subscription pricing: Starter £9 / Growth £19 (v1, Version A) vs Starter £5 / Growth £15 (Version B)** | Part 01 L238/L250 & Part 13 L14255/L14261 vs Part 14 L15314/L15320 | Adopt Version B (£5/£15) as the launch price — it is the later "Cheapest In Market + 5x profit" model and is margin-checked; keep £9/£19 as a post-traction step-up path. Record the decision in `docs/ai-os/08`. |
| 2 | **Campaign-pack vs subscription confusion (£5/£15/£49 packs alongside £5/£15 subscriptions)** | Part 10 L5709–5763 vs Part 14 L15305–15340 | Keep both but name them distinctly: subscriptions are recurring platform access; Campaign Packs™ are one-off ACU-priced products. Never render both as "Starter/Growth" in the same UI without the pack/plan suffix. |
| 3 | **Margin rules: 5x gross margin (400%) vs "66% minimum" vs 100%-minimum/300–500%-recommended utility framework** | Part 11 L6320 & Part 14 L14453–14470 vs Part 12 L8403/L8586–8601 vs Part 12 L7649–7655/Part 15 L18884–18890 | Treat them as different quantities: the 66% figure was a *competitive repricing of multipliers* (gross margin ≈ 66% = ~3x markup), not a replacement of the utility framework. Adopt: floor 66% gross margin per task (hard guardrail), target 400%+ blended via ACU recycling. Document in `docs/ai-os/08`. |
| 4 | **Prototype billing tiers £25/£99/£499 and strategy-doc tiers £9/£29/£99/£299, £19/£79/£199/£499 never reconciled with the master £5–£99 ladder** | Part 12 L8572–8601, L11417–11423, L11684–11722 | Scope them: £19–£499 sets belong to *separate add-on products* (Contact Agent, Growth Partner). The core OS keeps the Free/£5/£15/£39/£99 ladder; add-on products price independently. Flag any UI copy citing £25/£49 Starter as stale. |
| 5 | **Landing-page score sets: A = Clarity/Trust/Urgency/Emotional/Mobile/Speed/Conversion-Probability (7) vs B = Conversion/Clarity/Trust/Urgency/Mobile/Emotional/Friction/Lead-Quality (8)** | Part 13 L13849–13855 vs Part 14 L14924–14941 | Adopt Version B's 8-score set (it is the deep landing-page spec and includes definitions); keep Speed as a sub-signal of Mobile/Friction rather than a headline score. |
| 6 | **Campaign scoring: AI Campaign Score™ (8 dims) vs AI Campaign Confidence Score™ (7 dims, different set)** | Part 08 L4731–4755 vs Part 10 L5795–5819 | Keep both as distinct products, per the source's own note: Campaign Score™ = pre-build quality matrix; Confidence Score™ = pre-launch outcome prediction. Do not merge dimension lists. |
| 7 | **Audit score naming: "Follow-Up Readiness Score" (A) vs "Follow-Up Score" (B); 6-score implemented set vs 8-score spec set** | Part 13 L13486 vs Part 14 L14581; `src/backend/audit.ts` | **RESOLVED (2026-07-19):** `src/backend/audit.ts` now returns **9 scores** including Follow-Up Readiness, Revenue Leakage and Campaign Readiness — meets/exceeds the 8-score spec. Standardised on "Follow-Up Readiness Score". |
| 8 | **MVP phasing: 6 phases (Version A, ends with Marketplace) vs 5 phases (Version B, marketplace folded into Phase 5) vs 4-phase independence build order vs doc2's week-based Phase 0–3 roadmap** | Part 13 L14291–14335 vs Part 14 L15457–15495 vs Part 15 L18295–18339 vs doc2 §14 | Use doc2/`docs/ai-os/08` week-based roadmap as the master plan; map Version A Phase 6 (Marketplace) to its final phase. Keep Version A's 6-phase list as the feature checklist, Version B's for landing-page-first ordering. |
| 9 | **Collection-list deltas: 15 vs 53 (A) vs 55 (B) vs ~37 (dev spec) vs 71 (independence architecture) + 39 Brevo collections; Version B internally inconsistent (4.12 lists 12 landing-page collections but its own §16 core list repeats only 6)** | Part 01 L364; Part 13 L14133–14187; Part 14 L15399–15455 vs L14997–15009; Part 12 L13074–13111; Part 15 L18719–18790, L16873–16912 | Canonicalise on the 71-collection master list (Part 15 L18719–18790), then merge the 4 A-only collections (business_profiles, campaign_experiments, stripe_customers, google_business_posts), the 4 missing landing-page collections from 4.12 (landing_page_ctas, _assets, _pixels, _submissions), the 11 strategy-agent collections, and the non-overlapping Brevo collections. Maintain the merged list in `docs/ai-os/07`. |
| 10 | **Duplicated sections in the source** — Autonomous Campaign Engine appears twice (Parts 08 & 09, verbatim); 4.7 landing-page section duplicated (L6936–6957 ≈ L6983–7004); Brevo extraction has two passes (L16294–16928 vs L16929–17614); independence architecture has two passes (L17615–18358 vs L18359–18879); 39-collection list and API route blocks each appear twice | inv-5 §duplicate analysis; inv-6 note; inv-9 §3 | Treat Part 08, the second 4.7 copy's implementation notes, Brevo pass 2, and independence pass 2 as canonical. Parts 09 and the first passes remain preserved for provenance only — never spec from them. |
| 11 | **Source typo `trigger_retargerting`** (automation action name) | Part 15 L17153; inv-9 | Implement as `trigger_retargeting`; keep the typo untouched in source-notes (verbatim record) and note the correction wherever the action catalogue is specified. |
| 12 | **Autonomy level numbering: source uses Levels 1–3; blueprint uses dial L0–L3** | Part 08 L4651–4687 vs `docs/ai-os/02` | Adopt blueprint L0–L3 (L0 = manual/off). Map source Level 1→L1, 2→L2, 3→L3. |
| 13 | **File-boundary artefacts**: doc1 ends at line 20537 (not 20538); "FINAL OPERATING COMMAND" body crosses the Part 03/04 boundary; Part 05→06 header "THE MOST IMPORTANT DESIGN PRINCIPLE" also crosses a boundary | inv-9 note; inv-1 L850–851; inv-3 L2845 | No action needed — the part files are contiguous; readers following inventory line refs across part boundaries should read the adjoining part. |
| 14 | **Prototype-only features risk being mistaken for repo features** (Google Maps node, locale engine, papaparse CSV import, Firebase Studio pages) | Parts 04–12 Gemini build notes | The Firebase Studio prototype was discarded; only artefacts listed as ✅ in this register exist in this repo. Any "implemented" claim in the transcript is 📦 unless it appears in `src/`. |
| 15 | **doc2 GCP-only infrastructure vs adopted Hostinger→Cloudflare→Vercel→Firebase topology** | doc2 §13 vs `docs/PRODUCTION-ARCHITECTURE.md` | Resolved: `docs/PRODUCTION-ARCHITECTURE.md` is the adopted decision; doc2 §13 retained as reference for a future GCP scale-out. |

---

## 16. Security note — credential redaction & mandatory key rotation

Eight credential lines were found in the original uploaded document and were **redacted at import**
(replaced with redaction markers in `docs/reference/source-notes/12-build-transcript.md` and noted in
`source-notes/README.md` and `extraction-inventories/inventory-6.md`/`inventory-7.md`). No credential
values appear anywhere in this repository, this register included.

Redacted items (by type and original doc1 location — values NOT reproduced):

| # | Original location | Credential type |
|---|---|---|
| 1 | doc1 L7512 | OpenAI API key |
| 2 | doc1 L7516 | Same OpenAI key repeated in a curl Authorization header |
| 3 | doc1 L7519 | Google Gemini API key |
| 4 | doc1 L7521 | Vertex AI API key/token |
| 5 | doc1 L7523 | Full GCP service-account JSON (project ID, private_key_id, complete RSA private key, client_email, client_id) |
| 6 | doc1 L7525 | Anthropic Claude API key |
| 7 | doc1 L7528 | Same Anthropic key repeated in a curl x-api-key header |
| 8 | doc1 L6792 | Google Maps API key |

**Action required:** every one of these keys was exposed in the original document (and, per doc1 L7537,
written into a prototype `.env`). All five distinct credentials — OpenAI, Gemini, Vertex/GCP service account,
Anthropic, Google Maps — **must be rotated/revoked immediately** and never committed. Current code reads
providers exclusively from environment variables (`src/backend/provider.ts`, `src/backend/firebase-admin.ts`);
see `docs/DEPLOYMENT.md` for environment configuration.

---

*Register generated 2026-07-09 from extraction inventories 1–9 against repo state. When a backlog (📦) item
is promoted, update its row and the summary counts, and record any conflict resolution from §15 in the
relevant `docs/ai-os/` chapter.*

---

## 16. MarketWar AI Video War Room (VEED extraction — added to the register)

Source: developer-ready VEED feature extraction supplied 2026-07-09 (chat), specified in full in `ai-os/09-video-war-room.md`.

| Requirement | Source | Status | Where |
|---|---|---|---|
| AI Video Generator — 10 input modes (prompt/script/demo/explainer/testimonial/ad/thought-leadership/avatar/image/PPT-PDF) | VEED extraction §1 | 📘 | `ai-os/09` §1.1 |
| One-Click Campaign Video (brief → script, scenes, VO, captions, CTA + TikTok/Reels/Shorts/FB/LinkedIn/YouTube versions) | VEED extraction §1 | ✅ | `video-commander` agent + `/dashboard/video` |
| Online Video Editor — 23 editing functions (cut→multi-format export) | VEED extraction §2 | 📘 | `ai-os/09` §1.2 |
| Subtitle & Caption Engine — 10 functions (auto-subs→timing editor, SRT/VTT, burned-in) | VEED extraction §3 | 📘 | `ai-os/09` §1.3 |
| OS caption modes: Sales / Education / Viral / Brand | VEED extraction §3 | ✅ | `caption-engine` agent + `/dashboard/video` |
| Translation & Dubbing — subtitle/voice translation, AI dubbing, voice cloning, 10–50 languages (target 125+) | VEED extraction §4 | 📘 | `ai-os/09` §1.4 |
| Global Reach Agent — auto-localised versions (EN/FR/Lingala/Swahili/PT/AR/ES…) incl. currency, tone, cultural references, CTA | VEED extraction §4 | ✅ | `global-reach` agent + `/dashboard/video` |
| AI Avatar Studio — 8 avatar video types + OS roster (business/teacher/professional/influencer/branded spokesperson, multi-language) | VEED extraction §5 | 📘 | `ai-os/09` §1.5 |
| Audio Studio — 11 functions + Perfect Voice / Ad Voice / Course Voice agents | VEED extraction §6 | 📘 | `ai-os/09` §1.6 |
| Screen/Webcam/Presentation Recorder — 9 functions + auto-conversion into demos/training/social/help/sales | VEED extraction §7 | 📘 | `ai-os/09` §1.7 |
| Repurposing Engine — 1 long video → 10 TikToks + 10 Reels + 10 Shorts + 5 LinkedIn + 5 FB ads + blog + email + landing script | VEED extraction §8 | 📘 (plan output ✅ in `video-commander`) | `ai-os/09` §1.8 |
| Brand Kit — logo/colours/fonts/templates/intro-outro/watermark; auto colour detection; AI rejects off-brand visuals; multi-brand | VEED extraction §9 | 📘 | `ai-os/09` §1.9 (Brand Guardian gate) |
| Collaboration — workspace/comments/versions/folders; client approval portal (Approve/Reject/Request Change); creator→editor→manager→client→publish; audit trail | VEED extraction §10 | 📘 | `ai-os/09` §1.10 + M-25 audit |
| Full Business Outcome Engine (video→captions→ads→audience→launch→leads→retarget→ROI) | VEED extraction gaps §1 | 📘 | `ai-os/09` §2.1 (wired to M-06/M-13/M-14) |
| Video agent corps — Script, Offer, Video Editor, Avatar, Voice, Subtitle, Translation, Brand Guardian, Compliance, Platform Export, Performance Optimisation | VEED extraction gaps §2 | 📘 (3 of 11 ✅) | `ai-os/09` §2.2; shipped: video-commander, caption-engine, global-reach |
| One-Click Commercial Campaign (6 inputs → 5 videos, 10 captions, 5 ad copies, landing page, email, WhatsApp, follow-ups, analytics) | VEED extraction gaps §3 | 📘 | `ai-os/09` §2.3 |
| 14 vertical video modes (restaurants→job recruitment) | VEED extraction gaps §4 | 📘 | `ai-os/09` §2.4 (M-06 pack library) |
| ACU-metered video actions (10 meters) at minimum 4× provider cost, transparent to users | VEED extraction gaps §5 | 📘 | `ai-os/09` §2.5 — note: adds a **4×** rule to the 5x/400%/66% margin-rule conflict in §15; recommended resolution unchanged (charge the max of the applicable floors) |
| Cloud Run render/dub/avatar farm behind a provider-adapter layer; 10 video_* Firestore collections; platform publishing connectors | VEED extraction (placement) | 📘 | `ai-os/09` §3 per PRODUCTION-ARCHITECTURE |

### 16b. VideoCommandCentre expansion (second VEED extraction, v2)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Prompt-to-Video additions: tutorials, educational, sales, recruitment, influencer-style UGC videos | VEED v2 §1 | 📘 | `ai-os/09` §4 |
| Editing timeline additions: progress bars, music; silence + filler-word removal as first-class actions | VEED v2 §2 | 📘 | `ai-os/09` §4 |
| Subtitle additions: subtitle animation, TXT export, closed captions, 100+/125+ languages | VEED v2 §3 | 📘 | `ai-os/09` §4 |
| Voice/dubbing additions: lip sync, audio-to-text, volume control | VEED v2 §4 | 📘 | `ai-os/09` §4 |
| Avatar & UGC Actor Studio: UGC testimonial actors, product explainer actors | VEED v2 §5 | 📘 | `ai-os/09` §4 |
| Brand Kit Control additions: CTA style, subtitle style, approved templates, locked brand rules, permissions/approvals | VEED v2 §6 | 📘 | `ai-os/09` §4 |
| Repurpose additions: website hero videos, email GIFs, ad variations | VEED v2 §7 | 📘 | `ai-os/09` §4 |
| Recorder additions: PPT-to-video, PDF-to-audio/video, training-video creator | VEED v2 §8 | 📘 | `ai-os/09` §4 |
| AI B-Roll & Visual Enhancer (10 functions: B-roll gen → background expansion) | VEED v2 §9 | 📘 | `ai-os/09` §4.9 |
| Publishing & Hosting (hosting, share/approval links, embed, scheduled publishing, campaign library) | VEED v2 §10 | 📘 | `ai-os/09` §4.10 |
| Campaign Intelligence Agent (9-question pre-creation brief → script/hook/CTA/format) | VEED v2 gap 1 | 📘 (generation half ✅ via video-commander) | `ai-os/09` §5 |
| Viral Hook Agent — 50 hooks ranked by 6 trigger dimensions | VEED v2 gap 2 | ✅ | `viral-hook` agent + `/dashboard/video` |
| Competitor Ad Spy Agent (video concepts from competitor gaps) | VEED v2 gap 3 | 📘 | `ai-os/09` §5 (composes with M-11) |
| UGC Batch Factory — 100 variations (10×5×5×4×5), ranked by predicted conversion | VEED v2 gap 4 | 📘 | `ai-os/09` §5 |
| Sales Funnel Video Builder — 8-stage funnel (awareness→thank-you) | VEED v2 gap 5 | ✅ | `funnel-video-builder` agent + `/dashboard/video` |
| AI Compliance Checker — 9 risk categories, PASS/FIX/BLOCK gate | VEED v2 gap 6 | ✅ | `video-compliance` agent + `/dashboard/video` |
| Performance Feedback Loop (Meta/TikTok/YouTube/Google/email learning) | VEED v2 gap 7 | 📘 | `ai-os/09` §5 → doc 06 learning loop |
| Auto-Thumbnail & Title Engine (thumbnails, titles, descriptions, hashtags, SEO tags, platform captions) | VEED v2 gap 8 | ✅ | `thumbnail-title` agent + `/dashboard/video` |
| ACU Profit Control — 9 metered video actions, min 4× provider cost, premium tiers | VEED v2 gap 9 | 📘 | `ai-os/09` §5 |
| Human + AI Marketplace (templates/voices/video packs/services, commission) | VEED v2 gap 10 | 📘 | `ai-os/09` §5 → M-17 / R4 |
| 14-route structure (/video/create → /video/marketplace) + 21 core actions (generateVideoFromPrompt → deductACUs) | VEED v2 dev structure | 📘 | `ai-os/09` §6 |
| Positioning: VEED + Canva + CapCut + HeyGen + strategist + campaign manager + compliance officer + sales engine | VEED v2 | 📘 | `ai-os/09` v2 header |

## 16c. AI Viral Product Engine & Website Intelligence Engine (owner extraction 2026-07-13)

Verbatim source: `docs/reference/viral-product-and-website-engines-extraction.md`.
Blueprint: `docs/ai-os/10-viral-product-and-website-engines.md`.

| Requirement | Source | Status | Where |
|---|---|---|---|
| **M-32 AI Viral Product Engine (Agent 21)** — image(s) → dossier → campaign | Extraction F1 | ✅ core / 📘 pipeline | `viral-product-engine` agent + `/dashboard/product-engine`; vision upload (1–100 images, Cloud Tasks fan-out) 📘 P1 |
| Vision analysis contract: 18 attributes + Visual Quality / Conversion / Trust scores | F1 analysis | ✅ (agent output contract) | agent systemPrompt + `ai-os/10` §A.1 |
| Seven studios: Viral Social Posts (9 platforms) · Ad Creator · Video Creator · Copy Studio · Image Studio · Sales Booster · Market Intelligence (incl. predicted ROAS, purchase-intent score) | F1 one-click creates | ✅ conversational / 📘 asset rendering | `/dashboard/product-engine` grid + agent; image/video rendering via M-31 pipeline (P1/P2) |
| One-click publish to connected channels or export | F1 publish | 📘 | connector phase (doc 05); compliance gate + watermark contract in `ai-os/10` §A.2 |
| **M-33 AI Website Marketing Intelligence Engine (Agent 22)** — URL → unified strategy | Extraction F2 | ✅ core / 📘 crawler | `website-intelligence` agent + `/dashboard/website-intel`; Cloud Run deep-crawl service 📘 P1 |
| Deep-crawl extraction contract (21 elements: products → social links) | F2 crawl | 📘 (contract adopted) | `ai-os/10` §B.1 |
| Website Health Audit — 10 dimensions → AI Marketing Health Score + prioritised fixes | F2 audit | ✅ (agent output contract) | agent systemPrompt + `ai-os/10` §B.2; composes with shipped Failure Audit |
| Six suites: Campaign Factory · Creative Generator · Funnel Builder · Competitor Intelligence · Growth Opportunities (revenue/effort/ROI) · Brand Consistency Engine | F2 suites | ✅ conversational / 📘 rendering | `/dashboard/website-intel` grid + agent |
| One-click marketing launch (14 output classes from image or URL) | F2 launch | 📘 | `ai-os/10` §B.3; publishing via connectors |
| Both engines as independent agents in the OS (developer architecture) | Dev architecture | ✅ | Agents 21 + 22 in `src/shared/agents.ts` (**27 runnable agents total** as of 2026-07-19 — see §17 numbering note); gateway-routed, demo fallback, ACU-metered per `ai-os/10` Part C |

## 16d. VisualStrike AI™ & SiteRaid AI™ v2 upgrade (owner extraction 2026-07-13, second)

Verbatim source: `docs/reference/visualstrike-siteraid-extraction.md` (1,591 lines).
Blueprint: `docs/ai-os/10-viral-product-and-website-engines.md` Parts D–H (additive on v1 Parts A–C).

| Requirement | Source | Status | Where |
|---|---|---|---|
| **VisualStrike AI™** — autonomous viral campaign factory (research → create → test → publish → learn → optimise) | F1 | ✅ **deterministic engine shipped** / 📘 pipelines | **`src/backend/visualstrike.ts` + `/api/visualstrike`** (lock/angles/score/pack/hooks/guard) + `viral-product-engine` agent v2 + `/dashboard/product-engine`; smoke-verified |
| Product Intelligence Extraction w/ confidence scores, source locations, locks, needs-confirmation warnings; never invent claims | F1 §1 | ✅ **honesty guard shipped** / 📘 vision UI | `guardClaims()` in `src/backend/visualstrike.ts` (low-confidence fields flagged, never asserted) + `/api/visualstrike` action `guard`; smoke-verified; doc 10 §D.1 |
| **Product Identity Lock™** (12 locked traits, 6 transformation tiers, exact-preservation mandatory for regulated) | F1 §2 | ✅ **engine** | `productIdentityLock()` in `src/backend/visualstrike.ts` — 12 `IDENTITY_TRAITS`, 6 `PRESERVATION_MODES`, regulated/high-value overridden to exact (smoke-verified); doc 10 §D.2 |
| Autonomous Product Research Agent (14 outputs, anti-copy doctrine) | F1 §3 | 📘 (live research needs connectors/web) | doc 10 §D.3 |
| **Viral Potential Score™** (15 dims, explained) + Commercial Potential Score | F1 §4 | ✅ **engine** | `scoreConcept()` in `src/backend/visualstrike.ts` — 15 `VIRAL_DIMENSIONS`, controversy penalised not rewarded, separate Commercial score, per-dim breakdown + improvements; smoke-verified |
| Viral Angle Generator — 27 angle families × 11 fields | F1 §5 | ✅ **engine (all 27)** | `generateAngles()` + `ANGLE_FAMILIES` (27) in `src/backend/visualstrike.ts`, each angle carries all 11 fields; `/api/visualstrike` action `angles`; smoke-verified |
| Image Transformation Studio (17 types, 14 controls, staged multi-object pipeline) | F1 §6 | 📘 image models P1 | doc 10 §D.6 |
| Image-to-Video Factory (20 types, 16 controls, 7-step controlled pipeline w/ consistency validation) | F1 §7 | ✅ concepts / 📘 rendering | doc 10 §D.7 + Video War Room |
| AI Creator & UGC Studio w/ 8 hard safeguards (no impersonation/cloning/fabricated testimonials) | F1 §8 | 📘 avatars P2; safeguards codified | doc 10 §D.8 |
| Viral Content Pack Generator (32 native formats) | F1 §9 | ✅ **engine** / 📘 rendering | `contentPack()` + `CONTENT_PACK_FORMATS` (32) in `src/backend/visualstrike.ts` (natively adapted, not resized); `/api/visualstrike` action `pack`; smoke-verified |
| **Hook Laboratory™** (130+ scored hooks, clickbait blocked) | F1 §10 | ✅ **engine (clickbait block)** | `hookLab()` + `blockClickbait()` in `src/backend/visualstrike.ts` — scores hooks by type, blocks deceptive clickbait the content can't fulfil; smoke-verified; doc 10 §D.10 |
| Global Localisation Engine (17 axes, transcreation, lip-sync) | F1 §11 | 📘 | doc 10 §D.11 + doc 08 §C.3 localisation |
| Autonomous Testing & Optimisation (19-variable matrix, 8-step loop, Creative Intelligence Memory, 6 distinctions) | F1 §12 | ✅ **deterministic engine** / 📘 live loop | `src/backend/creative-optimizer.ts` + `/api/creative-optimizer` — `TEST_VARIABLES` (19), `buildTestMatrix()` (controlled one-factor + blends), `classifyPerformance()` (all 6 distinctions incl. high-views/low-intent, strong-sales/poor-margin), `optimisationLoop()` (promote winners → kill waste → recombine winning elements → learnings → rejected-element memory); operates on real supplied metrics, never fabricates; smoke-verified; doc 10 §D.12 |
| 8 one-click campaign modes (Launch Blitz → Always-On Autopilot) | F1 §13 | ✅ **engine** / 📘 execution | `CAMPAIGN_MODES` (8) in `src/backend/visualstrike.ts` + `/api/visualstrike` GET; page surface; doc 10 §D.13 |
| AI Creator/UGC safeguards (8 hard rules) + controlled 7-stage generation pipeline (protect product first) | F1 §7–8 | ✅ **codified in engine** | `CREATOR_SAFEGUARDS` (8) + `PIPELINE_STAGES` (7) in `src/backend/visualstrike.ts`; doc 10 §D.7–8 |
| **SiteRaid AI™** — website → continuously optimised marketing & sales operation | F2 | ✅ **deterministic engine shipped** / 📘 crawler | **`src/backend/siteraid.ts` + `/api/siteraid`** (authorise/dna/truth/audit/attack) + `website-intelligence` agent v2 + `/dashboard/website-intel`; smoke-verified |
| Authorised ingestion (13 input types; ownership/permission confirmation; competitor = public analysis only) | F2 §1 | ✅ **engine gate** | `authoriseIngestion()` + `INPUT_TYPES` (13) in `src/backend/siteraid.ts` — owner/manager/permission → full reuse, competitor → public-analysis-only, no-basis → blocked (smoke-verified); doc 10 §E.1 |
| Full understanding (34 elements) + visual extraction screen w/ approve/edit/lock/exclude | F2 §2 | 📘 extraction UI P1 | doc 10 §E.2 |
| **Business DNA Builder™** (24 fields, continuously updated) | F2 §3 | ✅ **engine** | `businessDNA()` in `src/backend/siteraid.ts` (all 24 fields) + `/api/siteraid` action `dna` |
| **Website Truth Layer™** (5 claim classes; superlatives blocked; sources linked) | F2 §4 | ✅ **engine** | `truthLayer()` + `classifyClaim()` in `src/backend/siteraid.ts` — 5 `ClaimClass`, unsubstantiated superlatives → prohibited, publishable claims link a source (smoke-verified) |
| Instant Marketing Audit — 6 audits (brand/conversion/content/search+GEO/social/commercial) | F2 §5 | ✅ **engine (6 audits × 6 dims)** | `instantAudit()` in `src/backend/siteraid.ts` — 6 sections each with 6 sub-scores + verdict + overall headline; `/api/siteraid` action `audit`; smoke-verified |
| **Competitive Attack Map** (16 gap classes, 6 priorities, win-without-copying) | F2 §6 | ✅ **engine** | `attackMap()` + `GAP_CLASSES` (16) + `ATTACK_PRIORITIES` (6) in `src/backend/siteraid.ts` — gaps ranked by opportunity, bucketed by priority, win-without-copying plays; smoke-verified |
| Autonomous Campaign Architect (5 layers, 34 campaign types) | F2 §7 | ✅ **deterministic engine** | `src/backend/campaign-architect.ts` + `/api/campaign-architect` — `buildArchitecture()` lays out all 5 funnel layers (awareness→advocacy) with plays + channel + KPI + objective-weighted budget share (awareness never starved); smoke-verified; doc 10 §E.7 |
| Trend Hijack with Brand Relevance™ (relevance + risk gate; rejects tragedy-exploiting / brand-damaging trends) | F2 §10 | ✅ **engine** | `trendHijackGate()` in `src/backend/campaign-architect.ts` — 4 fit + 4 risk factors, hard-rejects unsafe trends (tragedy/harm/misleading), join/watch/reject verdict; smoke-verified |
| Autonomy & Approval Levels 0–4 (draft→revenue autopilot; high-risk categories capped at 0/1) | Shared / streamed 2026-07-20 | ✅ **engine** | `autonomyGate()` + `AUTONOMY_LEVELS` in `src/backend/campaign-architect.ts` — high-risk categories (regulated/health/financial/political/children/…) hard-capped at Level 1, autopilot never granted; smoke-verified |
| Website-to-viral assets (30 classes) · **Site-to-Story Engine™** (10 archetypes, fact-traceable) · **Trend Hijack™** (8-factor relevance gate) · influencer campaigns (16-part kit + marketplace flow) · competitor reverse-engineering (patterns only) · landing pages (14 types, 12 controls) · **GEO engine** (13 outputs) · continuous monitoring (15 change types, no auto-publish without rules) | F2 §8–15 | ✅ story/trend/launch in agent output; suites on page / 📘 services | doc 10 §E.8–15 |
| **Shared: 20-agent intelligence layer** (mapped onto platform roster, incl. Margin Protection + Learning) | Shared | 📘 mapping adopted | doc 10 §F |
| **Creative Knowledge Graph** (23 entities; rejected claim never regenerated) | Shared | 📘 extends knowledge_graph_nodes | doc 10 §F + doc 07a |
| **Autonomy L0–L4** (L4 Revenue Autopilot; high-risk locked L0/L1) | Shared | ✅ settings dial upgraded to L4 | doc 10 §F; `/dashboard/settings` |
| Performance dashboard — 23 commercial metrics + Viral-to-Revenue funnel (Impression → Referral) | Shared | 📘 (revenue module covers core; full contract at P1) | doc 10 §F |
| Safety/trust/rights — 18 mandatory controls incl. C2PA provenance, disclosure metadata by default | Shared | 📘 codified | doc 10 §F + doc 08 §B.4a |
| Developer architecture: 18 frontend modules (route mapping documented), 22 services, 24 API endpoints, 35 collections | Shared | 📘 | doc 10 §G |
| **ACU rule: charge ≥ provider cost × 4** + pre-generation estimate + 14 cost controls | Shared | 📘 binding (see §17 ruling) | doc 10 §H |

---

## 17. Owner rulings log

Live decisions by the owner that resolve register conflicts. These override
earlier conflicting rules; superseded rules remain preserved in the verbatim
sources per the Additive-Only Law.

| Date | Ruling | Resolves | Codified |
|---|---|---|---|
| 2026-07-09 | All exposed credentials cancelled/rotated | Security register (8 redacted keys) | `docs/reference/VERIFICATION.md` |
| 2026-07-09 | **Additive-Only Law**: everything added builds on top or upgrades; never delete, never downgrade | Governs all future content | `/CLAUDE.md`, docs/README.md |
| 2026-07-09 | **Pricing doctrine**: margin never below 100% (≥2× provider cost) AND pricing must stay extremely competitive/attractive — compete on cost base, not margin erosion. 300–500% band + tier targets apply above the floor | Margin-rule conflict (66% vs 4×/5×/400%/35% entries, §15) — 66% guardrail superseded | `docs/ai-os/08` §A.1a, `/CLAUDE.md` |
| 2026-07-11 | **Multi-brand single account**: one user account runs multiple brands/activities at the same time with one login and one bill, on subscription or other payment models/categories — financially attractive first, 100% margin protection built in | Extends U1 (was implicitly single-brand); distinct from Agency U4 | `docs/ai-os/02` §U1a, `docs/ai-os/08` §A.1c; shipped: brand switcher (`src/components/BrandSwitcher.tsx`) + billing "Brands on this account" |
| 2026-07-13 | **VisualStrike/SiteRaid 4× rule**: for the two engines' generation actions, Customer ACU Charge ≥ Actual Provider Cost × 4 (non-negotiable) | Sits above the global 100% (2×) floor — floor unchanged platform-wide; matches the video engines' 4× minimum | `docs/ai-os/10` §H |
| 2026-07-13 | **Autonomy L4 (Revenue Autopilot)** added above L3 for engine publishing/budget reallocation; high-risk categories locked to L0/L1; all L3 gates (TOTP, £500 escalation, 60-s reversal) apply unchanged at L4 | Extends the L0–L3 dial (doc 02 §2) — additive | `docs/ai-os/10` §F; `/dashboard/settings` dial |
| 2026-07-14 | **M-34 AI Transactional Email Engine** (owner: massive transactional provider, unlimited daily volume, never landing in spam, addresses filtered, no bounce-backs) — delivered as deliverability engineering: multi-provider pool (unlimited infra, AI-governed warm-up ramp), earned inbox placement (SPF/DKIM/DMARC/BIMI + consent + engagement warm-up + RFC 8058 — never filter-evasion), 4-stage live hygiene pipeline, zero-bounce doctrine (pre-send filter + permanent suppression ledger, target < 0.5%) | New module + Agent 23; composes with M-22 notifications + doc 08 consent architecture | `src/backend/email.ts`, `/api/email`, `/dashboard/email`, `email-commander` agent, `docs/ai-os/11-email-engine.md` |
| 2026-07-19 | **M-35 Viral Amplification & Retargeting Engine** — owner asked for "109× viral" + "show everyone leaving cookies the content 5×/day until they act", then confirmed "do the correct and legal way". Literal cross-web-surveillance + uncapped-frequency version DECLINED (breaches PECR/GDPR + platform consent architecture + ad-network policy + M-34 sender reputation). Delivered the outcome lawfully: earned virality (honest viral coefficient K) + consent-based, funnel-only retargeting capped at 5 touches/7 days/person, hard opt-out & conversion stops | Conflict with doc 08 §B.3 consent architecture — resolved by building the compliant mechanism, not the literal ask | `src/backend/amplify.ts`, `/api/amplify`, `/dashboard/amplify`, `amplification-strategist` agent, `docs/ai-os/12-amplification-engine.md` |
| 2026-07-19 | **Self-growth doctrine**: MarketWar OS supports its users AND supports itself to grow — it uses its own OS to acquire its own users and compound to market leadership; every product improvement is a growth improvement; self-growth stays inside the platform's own consent/frequency/margin/compliance laws | New binding principle; strengthens the existing dogfooding references (doc 03 §3, doc 08 §A.3) | `docs/ai-os/01` §1.6 |
| 2026-07-19 | **Worldwide localization**: MarketWar OS is a global platform — auto-detect the viewer's language from device settings and currency from device locale, no manual setting | Owner directive (Document 1 build transcript, restated) | Foundation shipped: `src/frontend/locale.ts` (Intl + navigator, region→currency map, `useLocale()`); money-surface rollout (26 £-sites) + language i18n = follow-through |
| 2026-07-13 | **Layered codebase + stabilisation + E2E encryption**: backend/frontend/shared physical separation with runtime layer guards; stabilisation gates (`npm run verify` + `npm run smoke` — 53 checks: 26 routes, security headers, all 21 agents, audit + gateway APIs; global error boundary + not-found); E2EE = TLS 1.3 + HSTS-preload headers in transit, AES-256-GCM per-business-key field encryption at rest wired into every persistence write (cross-tenant decrypt cryptographically blocked — verified), plaintext-at-model-boundary honestly documented | Behaviour-preserving refactor per Additive-Only Law; implements doc 08 §B.4a field-encryption rule in code | `src/backend/` + `src/shared/` + `src/frontend/` (layer READMEs), `src/backend/crypto.ts`, `next.config.mjs`, `scripts/smoke.mjs`; docs: `docs/ai-os/06` §11, `docs/ai-os/08` §B.3a |

**Gap/conflict addendum (§8.2 design system):** v3.0 spec tokens (navy #1A1A2E, accent #E94560, gold #F5A623, light surface #F4F6F9, Inter-only typography) vs the shipped owner-approved emerald-dark system (Space Grotesk + Inter, validated chart palette). Resolution: shipped system remains primary brand; spec tokens preserved in doc 06 as the specified alternate theme (candidate for admin/partner portals or theme switcher). Owner may re-decide.

**Agent-roster numbering note (2026-07-19 audit, updated for M-36 + Visual Engine):**
the shipped `AGENTS` map in `src/shared/agents.ts` holds **32 runnable agents**
(+ Agent 27 Opportunity Scout + Agent 28 Lead Hunter, the Serper live-web
intelligence agents; + Agent 29 Reputation Guardian, the Trustpilot-inspired
reviews/reputation agent; + Agent 30 Growth ROI Strategist + Agent 31 Executive
Marketing War Room, the AI Growth-OS ROI + executive-email agents).
Agent 32 is the AI Auto-Segmentation Agent (Brevo Module 19); Agents 33–34 are
the ICP Architect + Outreach Commander (Apollo-inspired LeadWar Room); Agent 35
is the AI Automation Architect (Brevo Module 7 no-code builder); Agent 36 is
the AI Landing Page Creation Agent (§4.6 — the central agent); Agents 37–38 are
the Customer Avatar + Marketing Battle Plan agents (the 7-agent strategy chain
bookends).
The numbered lineage in agent prompts runs 1–31 because **Agent 20 (Profit
Protection & Margin Intelligence)** is realised as the AI Gateway cost policy
+ the Admin margin dashboard (`/dashboard/admin`) rather than a standalone
conversational key (documented in `03a-agent-cards.md`). Breakdown:
19 original conversational agents (1–19) + Agent 21 VisualStrike + Agent 22
SiteRaid + Agent 23 Email Commander + Agent 24 Amplification Strategist +
Agent 25 Campaign Warfare (`campaign-warfare-strategist`, the M-36 flagship) +
Agent 26 Brand Visual Creation (`brand-visual-creation`, the AI Visual Creation
Engine) = 25 lineage-numbered keys, **plus 2 Strike-phase agents labelled by MW
code rather than the 1–26 lineage** (`geo-recon` = MW-04, `citation-radar` =
MW-02) = **27 runnable keys**. Smoke gate asserts ≥ 27 (`scripts/smoke.mjs`).

**Trademark-alias index (2026-07-19 audit — features already tracked, aliases added for name-search):**
- **Creative Payloads™** (`source-notes/11` L727) = the Ad Creative Agent's output — ✅ shipped as `ad-creative` (§1.1 / §1.3 Agent 4.5).
- **Brand Asset Vault™** (`source-notes/11` L323) = the Brand-Consistent Creative Engine + `brand_assets`/BrandAsset schema (§2.3 row above, 📦).
- **MarketWar Reputation Shield™** (`source-notes/12` L2417/L2428) = the Trustpilot Trust/Reviews/Reputation Engine pack + TrustScore™ (§9 row above, 📦).

## 18. Listening & AI-Visibility layer (competitive dossier, 2026-07-19)

Verbatim summary: `docs/reference/competitive-dossier-blg-brandwatch.md`.
Strategic adoption: `docs/ai-os/13-listening-and-ai-visibility.md`.

| Requirement | Source | Status | Where |
|---|---|---|---|
| Strategic thesis: plant flag at listen × execute × AI-visibility (BLG/Brandwatch convergence) | Dossier summary | 📘 adopted (direction) | `docs/ai-os/13` |
| Portfolio-blog cold-start moat | Dossier summary | 📘 recorded | `docs/ai-os/13` |
| Africa Theatre Pack (FR/Lingala/Swahili listening + DRC inventory + BitriPay attribution) | Dossier summary | 📘 recorded (ties to doc 08 §C.3 Phase-4 + doc 05 BitriPay) | `docs/ai-os/13` |
| MW-07 Query Compiler (NL → Boolean listening) | Dossier summary | 📘 characterised; ⏳ full spec pending | `docs/ai-os/13` |
| Organic Dominance OS — positioning, 10-step operating loop, 20-surface navigation (Section 1) | Dossier §1–3 | 📘 adopted | `docs/ai-os/13` |
| Command Centre (23 metrics, "What changed?" briefing, 14 one-click actions); onboarding (18 inputs→17 artefacts); Market Listening (31 sources w/ lawful-access safeguard, Simple/Expert query builder, smart expansion) | Dossier §4–6 | 📘 adopted | `docs/ai-os/13` |
| Conversation Intelligence (25 attrs/13 emotions/16 intents); Purchase-Intent & Lead Detection (Lead Opportunity Card, consent-safe execution); Search Intelligence + Prompt Universe; Generative Search Visibility (9 platforms, Accuracy Monitor, causal-measurement safeguard) | Dossier §7–10 | 📘 adopted | `docs/ai-os/13` |
| Technical SEO/GEO/AEO Auditor (Fix mode); Competitor War Room (extends Competitor Spy); Content Opportunity Radar (transparent score); Autonomous Content Factory (26 outputs) | Dossier §11–14 | 📘 adopted | `docs/ai-os/13` |
| Competitive teardowns: BLG (Parts A1–A4: 3-step loop, feature inventory, backlink moat, GTM machine, 6 exposed flanks) + Brandwatch (B1–B5: 1.4T-conversation data asset, Iris AI, 6 flanks) | Dossier Parts A–B | 📘 adopted (positioning intel) | `docs/ai-os/13`; `docs/reference/organic-dominance-dossier.md` |
| **MW-01…MW-13 module specs** (Content Artillery, LLM Citation Radar, Alliance Link Network/portfolio moat, GEO Recon, Community Infiltration, SIGINT Core, War Room Analyst/Query Compiler, Early Warning, Magnet Foundry, War College, Proof Ledger, Fusion Layer, Africa Theatre Pack) | Dossier Part D | 📘 adopted | `docs/ai-os/13` Part 2 |
| **23-agent LangGraph registry (A01–A23)** — event-sourced Kafka + CQRS PostgreSQL, per-run ACU metering, BitriPay top-ups | Dossier Part E | 📘 adopted (additive to the shipped roster) | `docs/ai-os/13` Part 2 |
| **ACU pricing (Recon→Skirmish→Battalion→Command)** — 3× generation / 1× monitoring, reconciled above the ≥2×/100% floor; BitriPay rail | Dossier Part F1 | 📘 adopted | `docs/ai-os/13` Part 2 + doc 08 §A.1a |
| **48-week / 5-phase roadmap** (Strike→Artillery→Network→Ears→Theatre Africa) | Dossier Part F2 | 📘 adopted | `docs/ai-os/13` Part 2 → doc 08 Part C |
| **Phase-1 Strike SHIPPED**: MW-04 GEO Recon + MW-02 Citation Radar + MW-09 Magnet Foundry (free GEO audit front door) | Dossier F2 Phase 1 | ✅ | `src/backend/geo.ts`, `/api/geo`, `/dashboard/organic`, agents `geo-recon` + `citation-radar`; smoke-covered |
| Remaining roadmap: Artillery (MW-01) → Network (MW-03) → Ears (MW-06/07/08) → Theatre Africa (MW-13/12) | Dossier F2 | 📘 next | `docs/ai-os/13` Part 2 |
| **23-agent LangGraph registry addition** | Dossier (not received) | ⏳ **awaiting full paste** | pending |
| **ACU-tiered pricing** (to reconcile under ≥2×/100% floor) | Dossier (not received) | ⏳ **awaiting full paste** | pending |
| **48-week roadmap** | Dossier (not received) | ⏳ **awaiting full paste** | pending |
