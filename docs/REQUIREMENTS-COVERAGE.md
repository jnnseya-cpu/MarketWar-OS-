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
| **ModelGate™ Multi-Provider AI Gateway architecture (§1–36)** — one internal provider-neutral contract; model registry; request classification (standard/confidential/restricted); weighted routing engine (quality .30/capability .25/availability .15/latency .10/cost .10/historical .10) + 5 modes; fallback chain + circuit breaker; ACU reserve→execute→reconcile (provider failure = no charge); compare mode; 20 non-negotiable rules; Hostinger→Vercel→Firebase→ModelGate production flow | Streamed spec 2026-07-20 | ✅ core / 📘 infra | **`src/backend/modelgate.ts` + `/api/modelgate`** (classify/route/reserve/reconcile/compare/circuit) — deterministic registry + classifier + routing score + circuit breaker + reservation lifecycle + compare pricing, provider identity/cost never exposed; smoke-verified. Actual provider execution + demo fallback = `src/backend/gateway.ts`; Firebase queues/workers/ledger persistence + Vercel BFF + Secret Manager = 📘/📦 infra (`docs/PRODUCTION-ARCHITECTURE.md`) |
| ModelGate: **Firebase project wired** (MarketWar `studio-1718252475-c6017`) — web SDK config (env), Admin SDK (`firebase-adminsdk-fbsvc@…`), Firestore + Storage security rules blocking client writes to financial collections (§22, rule #17) | Streamed spec 2026-07-20 | ✅ | `.env.example` (public identifiers wired; API key + private key kept out of git per credential policy); `src/frontend/firebase-client.ts` + `src/backend/firebase-admin.ts` (env-gated, demo-safe); `firestore.rules` now denies client writes to acuWallets/acuTransactions/subscriptions/providerModels/marginRecords/audit… |
| ModelGate: **Stripe webhook** (main domain `marketwaros.com`) — subscription/invoice events → append-only ACU allocation (20% of plan price), idempotent by event id, HMAC-SHA256 signature verification (no SDK), grace/downgrade handling | Streamed spec 2026-07-20 | ✅ | `src/backend/stripe-billing.ts` + `/api/webhooks/stripe` (endpoint `https://marketwaros.com/api/webhooks/stripe`) — signature verified with Node crypto, demo-safe without a secret; smoke-verified; live Firestore ledger write 📦 |
| **Admin Billing controls** — admin can change a user's plan (proration + downgrade protection), create time-limited offers + discount codes (discount-authority governance; never on ACU top-ups), and waive payment up to 3 months per rolling 12-month window | Owner directive 2026-07-20 | ✅ | `src/backend/admin-billing.ts` + `/api/admin-billing` (change-plan/offer/discount-code/apply-code/validate-discount/waive) — role-capped discounts, ISO-window waiver math (3-in-12 cap), downgrade preserves data; smoke-verified |
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

## 19. Go-live readiness — PWA, account deletion, SMTP, launch runbook (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **User can delete their account** (GDPR right to erasure) — type-DELETE confirm, deletes Firebase Auth user, `requires-recent-login` re-auth flow, demo-mode notice | Owner directive 2026-07-20 | ✅ | `src/components/DeleteAccount.tsx` in `/dashboard/settings` Danger zone |
| **PWA fits any screen** — installable manifest, maskable icon, network-first service worker (never caches /api/auth/webhooks), `viewport-fit=cover` safe areas | Owner directive 2026-07-20 | ✅ | `public/manifest.webmanifest`, `public/icon*.svg`, `public/sw.js`, `src/components/PWARegister.tsx`, `src/app/layout.tsx` |
| **Email SMTP path in place** — SMTP-first provider pool (Node tls/net, zero-dependency; implicit-TLS 465 + STARTTLS 587 + AUTH LOGIN), then Resend/SendGrid HTTP, then demo; hygiene pipeline unchanged | Owner directive 2026-07-20 ("just need the email smtp to be in place") | ✅ | `src/backend/email.ts` (`sendViaSmtp`, `smtpConfigured`, `emailProvider`); `.env.example` SMTP_* block |
| **Go-live checklist + requirements + test plan** so testing can start | Owner directive 2026-07-20 | ✅ | `docs/GO-LIVE.md` (11 sections: verification gate → domain → env → Firebase → Stripe → SMTP → PWA → lifecycle → prod smoke → rollback → sign-off) |
| Deploy-ready across frontend + backend + shared (App Hosting root `/`) | Owner directive 2026-07-20 | ✅ code ready; ⏳ owner console rollout | `apphosting.yaml`, `docs/DEPLOYMENT.md`, `docs/GO-LIVE.md` §2 |

## 20. Production-readiness & real testing (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Colorful + premium landing page** (approved preview) restored on the live site — the "cinematic emerald-only" refinement had flattened it | Owner directive 2026-07-20 ("the colorful and premium changed last night, not what I see on live") | ✅ | `src/app/globals.css` rainbow accent ramp (--c1..8), multi-hue body glow, rainbow `.text-gradient` headline + `.accent-*`; verified by screenshot |
| **Make Anything builds inline** (not just routes) | Owner directive 2026-07-20 ("these to work") | ✅ | `/dashboard/create` → `/api/agents/{routed}`; live with keys |
| **Whole platform flips demo→live with one key** (every agent + generative engine already routes through the gateway) | Owner directive 2026-07-20 ("live keys available, need real testing") | ✅ wired; ⏳ owner sets key | `src/backend/gateway.ts`; `apphosting.yaml` AI keys; `docs/REAL-TESTING.md` |
| **User accounts — admin + every role** | Owner directive 2026-07-20 ("create all different user accounts included with admin") | ✅ | `src/shared/roles.ts` (7 roles + scopes), `scripts/seed-accounts.mjs`, `npm run seed:accounts` |
| **Go-live checklist + real-testing guide** | Owner directive 2026-07-20 ("I need a go live checklist") | ✅ | `docs/GO-LIVE.md` (11-section) + `docs/REAL-TESTING.md` (the demo→live switch, wired-surface map, live walkthrough) |
| Every interactive surface executes against a real API (Make Anything, Strategy Chain, Warfare, Audit, Briefing, Offer Builder, VisualStrike, One-Click Builder, 19 agents, 39 engines) | Owner directive 2026-07-20 (repeated "fully functioning") | ✅ verified | `npm run smoke` 304/0; surface→endpoint map in `docs/REAL-TESTING.md` §3 |

## 21. Active-brand context + switcher (multi-brand, 2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **One company, multiple brands** — switching brand re-skins the whole OS per brand, no third-party key needed | Owner directive 2026-07-20 ("build the active-brand context and switcher") | ✅ | `src/shared/brand.ts` (Brand model + `brandDefaults` + seeds), `src/frontend/brand-context.tsx` (persisted provider), `src/components/BrandSwitcher.tsx` (switch + add brand) |
| Every module form + agent call fills from the ACTIVE brand | same | ✅ | `AgentRunner` auto-fills known brand fields; custom forms (strategy, warfare) + Make Anything build payload seed from active brand — verified by screenshot (Brixton → Nseya re-skins the whole page) |
| Persists across refresh with zero config; Firestore-ready | same | ✅ | localStorage store keyed `mw.brands.v1` / `mw.activeBrand.v1`; same shape syncs to Firestore when wired |

## 22. Money loop #1 — per-brand attributed revenue (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Revenue attributed to MarketWar, per brand** — real ledger, no fabricated figures | Owner directive 2026-07-20 ("build the money loop… each brand shows its own real (or honestly-empty) attributed revenue") | ✅ | `src/shared/results.ts` (ledger + `summarize`), `src/frontend/results-context.tsx` (per-brand persisted store), `/dashboard/revenue` rewritten |
| Honest empty state — no sample money for a real company | same | ✅ | Empty banner + £0/— until real events; verified: empty on new brand → £240 after logging one order |
| Owned capture (manual "Log a result") so it's real day one, no third party | same | ✅ | "Log a result" form (lead/order/sale + source + amount) attributes to the campaign; Stripe payment attribution is the next step |
| Scoped to the active brand | same | ✅ | ledger filtered by `activeBrand.id`; each brand has its own money view |

## 23. Money loop #2–4 — Stripe attribution, owned capture, no fake money (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Stripe payment attribution** — real payments count automatically | Owner directive 2026-07-20 | ✅ | `brandRevenueFromEvent` (stripe-billing) → `/api/webhooks/stripe` records attributed revenue when a checkout carries `metadata.marketwar_brand_id` (+ `marketwar_source`); idempotent by event id (redelivery never double-counts) |
| **Owned lead-capture endpoint** — form conversions POST straight into the ledger | Owner directive 2026-07-20 | ✅ | `POST /api/results` (rate-limited); owned landing-page forms post `{brandId,type,source,amountGbp}` — no manual entry |
| **Server-backed ledger** shared by manual + capture + Stripe | same | ✅ | `src/backend/ledger.ts` (Firestore when configured, in-memory otherwise); `results-context` now fetches/writes via `/api/results` |
| **No fake money anywhere** — Command Center + Daily Briefing show the real ledger | Owner directive 2026-07-20 | ✅ | `/dashboard` (Command Center) + `/dashboard/briefing` upgraded to per-brand real figures with honest empty states — demo money removed |
| Verified by the gate | same | ✅ | smoke +2 = **306/0**: owned £45 + Stripe £120 = £165, idempotent (2 orders), un-tagged payment → no attribution |

## 24. Money loop — Firestore persistence + self-attributing checkout links (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Firestore persistence path** confirmed/hardened | Owner directive 2026-07-20 | ✅ code + rules | `firestore.rules` adds `results` (server-only, Admin SDK); `/api/results` GET returns 503 (not false £0) on store failure; ledger reads/writes via `adminDb` when configured, in-memory otherwise |
| **Self-attributing checkout links** — payments attribute without hand-set metadata | Owner directive 2026-07-20 | ✅ | `src/backend/checkout.ts` `createCheckoutLink` (Stripe Checkout Session pre-stamped with `metadata.marketwar_brand_id`+`marketwar_source`, dependency-free REST, demo-safe) → `/api/checkout`; Revenue page "Create a paid checkout link" card |
| End-to-end: link → pay → auto-attributed | same | ✅ mechanism | link metadata matches the webhook attributor (`brandRevenueFromEvent`); demo link + live link both carry the exact attributing metadata |
| Verified | same | ✅ | smoke **308/0** (+ checkout link metadata + zero-amount 400); live curl: demo link carries brand+source metadata |

## 25. Revenue Autopilot — find customers while you sleep (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Agents find customers unattended** ("user sleeps while MarketWar finds customers to spend real money") | Owner objective 2026-07-20 | ✅ | `src/backend/autopilot.ts` `runAutopilotCycle` — scans acquisition moves, decides act-vs-queue; `/api/autopilot`; `/dashboard/autopilot` |
| **Governed by the autonomy dial (L0–L4)** — high-risk categories never auto-publish | Owner directive (autonomy) | ✅ | reuses `autonomyGate`; children/health/regulated capped to L1 — verified (kids-toy brand → 0 auto-executed) |
| **Runs while you sleep** — nightly schedule | Owner objective 2026-07-20 | ✅ | stateless per-brand cycle; `docs/AUTOPILOT.md` (Firebase Scheduled Function / Vercel Cron / plain cron) |
| **Never fabricates money** — real revenue only via the money loop | Platform honesty rule | ✅ | projection labelled "estimate — not booked"; digest points to Revenue for actuals |
| Verified | same | ✅ | smoke **311/0** (+ page, L3 auto-execute, children→L1 cap); screenshot of a live cycle |

## 26. Nightly Autopilot digest email (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **"Here's what I did overnight and what needs approval" email each morning** | Owner directive 2026-07-20 | ✅ | `autopilotDigestEmail` (combined across brands) + `/api/autopilot/nightly` sends via the SMTP email engine; verified render + demo send |
| Combined across all the account's brands | same | ✅ | one digest lists every brand's auto-executed vs queued moves + projected pipeline |
| Honest — projection labelled, child-safety visible | platform rule | ✅ | footer disclaimer; high-risk brands show all moves as "approve" (e.g. kids-toy brand L1-capped) |
| Scheduled nightly | same | ✅ | `docs/AUTOPILOT.md` cron → `POST /api/autopilot/nightly { brands, to }`; "Email me a test digest" button on the Autopilot page |
| Verified | same | ✅ | smoke 313/0 (+ digest for 2 brands, recipient-required 400); email rendered to image |

## 27. Landing: real 8-tier pricing + colourful dashboard showcase (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Pricing reflects the real model** (was showing 3 old tiers → looked like "only 2 kinds") | Owner directive 2026-07-20 | ✅ | `src/app/page.tsx` PLANS → the real 8 tiers (Free→Global) + "platform access + AI consumption are separate" (ACU) note; 4-col responsive grid |
| **Many colourful dashboards, visuals & graphs on the landing** ("people like visuals") | Owner directive 2026-07-20 | ✅ | `src/components/LandingVisuals.tsx` — colourful KPI strip + product-"screen" gallery: revenue/spend area chart, orders-by-channel donut, campaign-verdict badges, ROAS bars, conversion funnel, Autopilot digest, demand sparkline (real chart kit + palette) |
| Verified | same | ✅ | typecheck + check:layers + build + smoke; screenshots of the visual + pricing sections |

## 28. Finalized commercial model — verbatim source + verification (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Separate platform access (subscription) from AI consumption (ACUs)** | Owner spec 2026-07-20 (full) | ✅ | `src/backend/subscription.ts` (platform + 20% ACU allocation) + `src/backend/acu.ts` (metered AI); landing pricing note |
| **Terminology: £4/£1 = 300% markup = 75% gross margin; margin ≤ 100%; target 100–400% markup, min 300%** | Owner correction (authoritative) | ✅ verified | `acu.ts` `marginPct`=markup, `grossMarginPct`=margin — quote proves £1→£4/400 ACUs/300%/75%, cost hidden |
| **8-tier model with exact ACU economics** (monthly ACUs, annual 30% off on amount paid, monthly release, default + flexible top-ups, expiry/rollover, wallets, add-ons, premium modules) | Owner spec §1–13 | ✅ verified | `subscription.ts` — computed table matches spec exactly (380/980/2,980/7,980/19,980/49,980/149,980; release 266/686/2,086/5,586/13,986/34,986/104,986; top-ups £3.80…£1,499.80) |
| **Verbatim source captured (immutable record)** | repo law | ✅ | `docs/reference/commercial-model-subscription-acu.md` (§1–13 + partial §14; §14+ pending owner supply) |
| §14+ "Customer Value by Segment" and beyond | Owner spec (truncated) | ⏳ awaiting full paste | pending |

## 29. Commercial model §14–22 — complete source + enterprise fees/protection (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Full model §14–22** captured verbatim (immutable) | Owner spec 2026-07-20 (remainder) | ✅ | `docs/reference/commercial-model-subscription-acu.md` now complete §1–22 |
| §15 Upgrade triggers (top-ups >50%/3mo, seat/brand/social/storage/campaign limits + what the recommendation shows) | §15 | ✅ | `subscription.ts` `upgradeRecommendation` |
| §16 Downgrade protection (assets kept, excess read-only, top-up ACUs valid…) | §16 | ✅ | `admin-billing.ts` `changeUserPlan` (downgrade effects) |
| §17 ProfitGuard (Net AI Contribution; green≥75/amber65–75/red<65/blocked) | §17 | ✅ | `subscription.ts` `netContribution`+`marginBand`; `acu.ts` |
| §18 Discount governance (authority ≤5/10/20/exec/30; exclusions; never below 4×) | §18 | ✅ | `admin-billing.ts` `DISCOUNT_AUTHORITY`; `subscription.ts` `DISCOUNT_EXCLUSIONS` |
| §19 **Enterprise commercial fees** (onboarding/integration/migration/training/support) | §19 | ✅ new | `subscription.ts` `ENTERPRISE_FEES` → `/api/subscription` |
| §20 Commercial protection + provider-cost-adjustment clause | §20 | ✅ new | `subscription.ts` `COMMERCIAL_PROTECTION` (17), `PROVIDER_COST_ADJUSTMENT_CLAUSE` |
| §21 Customer-facing pricing message | §21 | ✅ new | `subscription.ts` `PRICING_MESSAGE` |
| §22 Recommended 8-tier decision | §22 | ✅ | `subscription.ts` PLANS (verified exact) |

## 30. §21 headline on landing + in-app ACU top-up purchase (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **§21 pricing headline on the landing** | Owner directive 2026-07-20 | ✅ | `src/app/page.tsx` pricing → "One Marketing OS. Every Brand. Every Campaign. One Predictable Bill." |
| **In-app ACU top-up purchase** — customer can actually buy top-ups | Owner directive 2026-07-20 | ✅ | `createTopupCheckout` (checkout.ts) → `/api/billing/topup`; billing page top-up tiles are buy buttons (live → Stripe redirect; demo → link) |
| **Top-up payment credits ACUs** — idempotent, no discount | §8/§17 | ✅ | webhook `handleStripeEvent` top-up branch (metadata.marketwar_topup → allocate_acus, ledger `acu_topup`, idempotent by event id) |
| Verified | same | ✅ | smoke 315/0 (+ £25→2,500 ACUs link, webhook credits 2,500 idempotent); screenshot of the billing top-up flow |

## 31. Sign-up / login panel always visible (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Sign-up/login panel visible in the live (demo) OS** | Owner directive 2026-07-20 ("can't see the sign-up or login panel") | ✅ | `AuthForm` now always renders the real form; demo mode shows a note + submit continues into the demo (was: form hidden, replaced by an "accounts disabled" message) |
| Header exposes both | same | ✅ | landing header: Log in → /login, Get started → /signup (was Enter→/dashboard) |
| Goes fully live with Firebase | — | ✅ | with `NEXT_PUBLIC_FIREBASE_*` set, the same form does real email/password + Google auth + verification/reset |
| Verified | same | ✅ | /login + /signup return 200; screenshot of the sign-up form in demo mode; smoke 315/0 |

## 32. Post-signup plan selection (monthly/annual 30% toggle) (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **After sign-up, choose a subscription** | Owner directive 2026-07-20 | ✅ | `/choose-plan` page; `AuthForm` sign-up (email + Google, demo + live) redirects there (login → /dashboard) |
| **Monthly ↔ annual toggle, annual = 30% off** | §7 | ✅ | toggle switches all 8 cards to annual (effective /mo + £/yr + saving); ACUs shown as monthly-released for annual |
| **Free activates immediately; paid → checkout** | §5/§8 | ✅ | `/api/billing/subscribe` → Free no-checkout; paid → `createSubscriptionCheckout` (Stripe subscription, monthly/annual price, metadata.planId; demo-safe) |
| Verified | same | ✅ | smoke 318/0 (page + subscribe free + Growth annual £411.60 = 30% off); screenshot of the annual toggle across all 8 tiers |

## 33. Close "enter without signing up" loopholes (2026-07-20)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **No entering the OS without sign-up** | Owner directive 2026-07-20 ("too much loopholes… enter without signing up") | ✅ | `RequireAuth` guard on the dashboard layout — signed-out visitors redirect to /login when Firebase Auth is configured (production); keyless demo stays open (zero-config rule) |
| **Public "enter/start" CTAs go through sign-up** | same | ✅ | landing hero + final CTA "Get started free" → /signup; how-it-works "Start Phase 1 now" → /signup; pricing cards Free/Starter/Growth/Scale/Business → /signup |
| Zero-config demo preserved (owner testing) | repo law | ✅ | guard enforces only when the Firebase web key is set; keyless env = open |
| Verified | same | ✅ | typecheck + build + smoke 318/0; /dashboard 200 in demo; guard redirects to /login when Firebase configured |

## 34. Admin access — invite a multi-brand company to test (2026-07-21)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Admin can invite a (multi-brand) company to test** | Owner directive 2026-07-21 ("create the admin access, so I can invite a multiple brands company to test") | ✅ | `/dashboard/admin` → "Invite a company to test" (`AdminInvites`): set company, plan, brand allotment, note → shareable `/signup?invite=<token>` link with copy + revoke |
| **Invite engine** — create/list/get/accept/revoke | same | ✅ | `src/backend/invites.ts` (Firestore `invites/{token}` when configured, in-memory otherwise; token = 24-char id) |
| **Admin API is scoped** | repo security law | ✅ | `/api/admin/invites` GET/POST/DELETE behind `requireAuth({ scope: "tenant_manage" })` (enforced when Firebase Admin set; open in zero-config demo) |
| **Public invite validation + accept** | same | ✅ | `/api/invites/[token]` GET (public, returns non-sensitive `publicInvite`) + POST accept (rate-limited); no secrets leaked to the sign-up page |
| **Invited sign-up shows who invited them + accepts on completion** | same | ✅ | `AuthForm` reads `?invite=<token>`, shows the banner (company · plan · brands), prefills company name, calls accept on every sign-up success path (demo + live, email + Google) |
| Verified | same | ✅ | typecheck + check:layers + build + smoke 320/0 (+ invite create→validate→accept, missing-company 400); live curl create→validate→accept; screenshots admin-invites + invite-signup |

## 35. VisualStrike honesty pass — real 130+ Hook Lab + Live/P1 labels (2026-07-21)

| Requirement | Source | Status | Where |
|---|---|---|---|
| **Hook Laboratory™ card must be literally true (130+ scored hooks)** | Owner directive 2026-07-21 (overclaim = reputation damage) | ✅ | `hookLab()` in `src/backend/visualstrike.ts` now generates **130 hooks across 13 families × 10 variants** (`HOOK_FAMILIES`), each scored + deception-checked; returns `count`/`families`/`byFamily`. Was 10. |
| **No feature may misrepresent itself as live to a tester** | same | ✅ | `/dashboard/product-engine` badges every capability **Live now** vs **Coming at P1** (StatusChip) + an honesty legend; upload zone, studios, campaign modes and guarantees all labelled truthfully |
| Deception guard unchanged + widened | F1 §10 | ✅ | `blockClickbait` markers extended; every one of the 130 hooks passes through it |
| Verified | same | ✅ | typecheck + check:layers + build (121 pages) + smoke 320/0 (hook test strengthened: asserts count>=130 and families===13); live curl 130/13 confirmed |

## 36. Test-ready hardening — every module wired to a real engine (2026-07-21)

Owner directive: "I WANT EVERYTHING TO BE LIVE — NO PARTIAL AND NO STATIC." Every
dashboard module now calls a real backend engine and renders computed output;
no static demo arrays, no hardcoded fake numbers, no placeholder cards presented
as working. Clean-slate brands show honest empty-states; render/publish features
are honestly badged Live-now vs Coming-at-P1.

| Module | Was | Now | Engine |
|---|---|---|---|
| Customer Vault | STATIC (demoCustomers) | ✅ LIVE | `segments.ts` `scoredCustomerList` via `/api/segments` action=customers |
| Lead Recovery | STATIC (recoverable=1240) | ✅ LIVE | new `recovery.ts` via `/api/recovery` (reuses segment scoring) |
| WhatsApp Center | STATIC (demo arrays) | ✅ LIVE | new `whatsapp.ts` via `/api/whatsapp` (funnel + template pipeline) |
| Campaign War Room | STATIC (demoCampaigns) | ✅ LIVE | new `warroom.ts` via `/api/warroom` (real ledger revenue when brandId) |
| Competitor Spy | PARTIAL (demoCompetitors) | ✅ LIVE | existing `competitor-warroom.ts` via `/api/competitor-warroom` (+threatLevel) |
| Local Domination | PARTIAL (fake stats) | ✅ LIVE | new `local.ts` via `/api/local` (map-pack + prioritized actions) |
| Email Center | PARTIAL (fake 99.4% etc) | ✅ LIVE | new `email-metrics.ts` via `/api/email-metrics` (labelled estimates) |
| Budget Protection | PARTIAL (fake £130) | ✅ LIVE | new `budget.ts` via `/api/budget` (Stop/Fix/Scale board) |
| Command Center root | STATIC-ish | ✅ LIVE | new `command-summary.ts` via `/api/command-summary` (briefs the real ledger; robust to partial bodies) |
| Admin Centre | PARTIAL (hardcoded economics) | ✅ LIVE | existing `admin-economics.ts` via `/api/admin-economics` |
| Settings & Security | PARTIAL (unpersisted dial) | ✅ LIVE | new `settings-store.ts` via `/api/settings` (Firestore/in-memory) |
| SiteRaid AI | PARTIAL (static suites) | ✅ LIVE + honest P1 badges | existing `siteraid.ts` via `/api/siteraid` |
| Video War Room | PARTIAL (12 fake studio cards) | ✅ LIVE + honest P1 badges | existing `video-intelligence.ts` via `/api/video-intelligence` |
| Integration Hub | PARTIAL (green when unconfigured) | ✅ honest per-provider state | existing `/api/integrations` (surfaces adminConfigured) |

All engines are deterministic (FNV-1a seed, no wall-clock/randomness), layer-guarded,
and demo-safe (render with zero keys). Additive-only: `src/shared/demo.ts` and all
existing exports untouched — pages simply stopped importing demo arrays.

Verified: typecheck + check:layers + build (clean, SWC cache cleared) + smoke **329/0**
(+9 new module-engine assertions, incl. a command-summary malformed-body regression test).

## 37. How-it-works truth pass — 3 claims made literally true + connector-honest verbs (2026-07-21)

A code-level audit of the 7-phase "How it works" page found the intelligence real
but 3 specific claims overclaiming and several execution verbs implying autonomy
that is connector-gated. Fixed:

| Phase | Was | Now |
|---|---|---|
| **1 Brain Sync** ("…margins…") | onboarding never asked cost/margin | ✅ added "Rough margin or unit cost" question to onboarding intake |
| **6 Budget Protection** ("weekly money-saved receipt") | no such code | ✅ `budget.ts` computes `weeklyReceipt` (protected/reroute/paused + headline); rendered on /dashboard/budget |
| **7 Recovery** ("forecasts next month's money") | LLM narrative / hardcoded £1,500/2,400/3,100 | ✅ new deterministic `forecast.ts` + `/api/forecast` (base/push/stretch from the real ledger: run-rate + open-lead upside); rendered on /dashboard/revenue |

Connector-honest wording (true today as plans, auto once connected): Phase 4 "deploys"
→ "designs… then launches once your ad accounts connect"; Phase 5 "send offers / book
orders / sequences fire" → "built to… live capture/sending switch on when you connect
WhatsApp/email"; Phase 6 "paused automatically" → "flagged to pause — auto-pause once
your ad accounts connect"; Phase 3 dropped unmodelled "guarantees"/"before it ships".
Phases 2 (audit) and 3 (offer margin-safety) were already fully true.

All deterministic (no wall-clock/randomness), layer-guarded, demo-safe, additive-only.
Verified: typecheck + check:layers + clean build + smoke **333/0** (+4: forecast
monotonic+deterministic, forecast empty-state, forecast malformed-body hardened, weekly receipt).

## 38. Zernio publish connector — platform-managed, white-label (2026-07-21)

Owner directive: platform-level social publishing, users billed through their plan.
Adopted Zernio (white-label — preserves the "not a wrapper" doctrine) over Ayrshare.

| Requirement | Status | Where |
|---|---|---|
| **One platform key fans out to 15 channels** | ✅ | `zernio.ts` (Bearer `ZERNIO_API_KEY`, base `https://zernio.com/api`); `ZERNIO_PLATFORMS` (IG/TikTok/FB/YouTube/LinkedIn/X/Pinterest/Reddit/Bluesky/Telegram/GBP/Snapchat/Discord/WhatsApp/Threads) |
| **White-label, no per-platform app review** | ✅ | brand connects own socials via minted `POST /v1/profiles` → `/v1/platform-invites/{token}/connect` link; Zernio hosts the OAuth |
| **One-click connect + publish UI** | ✅ | `/dashboard/publish` Publish Center (connect link + compose/schedule/cross-post) + sidebar entry |
| **Compliance gate + AI-content watermark before ship** | ✅ | `complianceGate()` (prohibited-claim block) + AI watermark appended in `publishPost()` |
| **Platform-managed + ACU-seat billing at protected margin** | ✅ | `integrations.ts` `zernio_publish` (provisioning `platform`, billing `acu_metered`) + `seatQuote()` (plan seats + overflow via `quoteAcu`, margin ≥2×/4×, provider cost never exposed) |
| **Autonomy preserved (pooled + manual fallback)** | ✅ | `PROVIDER_POOLS.publishing` + manualFallback (download creative + copy caption + post manually) |
| **Live REST wired, demo-safe** | ✅ | `POST /v1/posts` live when key set; deterministic demo (published/watermarked) + graceful degrade on any live error; `/api/zernio` GET status + POST connect/publish/profiles/quote |
| **Deployed app picks up the key** | ✅ | `apphosting.yaml` → `ZERNIO_API_KEY` (secret `zernio-api-key`) |
| Verified | ✅ | typecheck + check:layers + clean build + smoke **339/0** (+6: status/connect/publish/compliance-block/seat-billing/hub-listing) |

## 39. Generated content → one-click publish (2026-07-21)

| Requirement | Status | Where |
|---|---|---|
| **VisualStrike + Content Factory publish generated content** | ✅ | both pages now render `GenerateAndPublish` (AgentRunner + `PublishToChannels`) — the copy the agent just produced seeds the publish caption |
| **Publish routes through the Zernio gateway** | ✅ | `PublishToChannels` POSTs `/api/zernio` action=publish (compliance gate + AI watermark), demo-safe / live with key |
| **Reusable, non-breaking** | ✅ | `AgentRunner` gained an optional `onResult` callback (existing callers unaffected); `PublishToChannels` + `GenerateAndPublish` are additive components; links to the full Publish Center to connect socials |
| Verified | ✅ | typecheck + check:layers + clean build + smoke 339/0; /dashboard/product-engine, /content, /publish all 200 |

## 40. One-click publish on every content generator (2026-07-21)

| Surface | Publish action | Where |
|---|---|---|
| **Campaign Builder** (Ad creative tab) | ✅ | `GenerateAndPublish` (ad-creative agent → publish) |
| **Offer Builder** (Offer tab) | ✅ | `GenerateAndPublish` (offer-builder agent → publish) |
| **Brand Studio** (creative direction) | ✅ | `GenerateAndPublish` (brand-visual-creation agent → publish; images stay preview until hosted-URL posting) |
| **VisualStrike Hook Lab** | ✅ | new `VisualStrikeHooks` — generates the 130-hook library (/api/visualstrike), pick a hook → `PublishToChannels` |

All route through the Zernio gateway (`/api/zernio`, compliance gate + AI watermark),
reuse the shared `PublishToChannels`/`GenerateAndPublish` components, additive-only.
Verified: typecheck + check:layers + clean build + smoke 339/0; campaigns/offers/studio/product-engine all 200.

## 41. Attach generated creative (image/video) to posts (2026-07-21)

| Requirement | Status | Where |
|---|---|---|
| **Posts carry media, not just caption** | ✅ | `PublishToChannels` accepts `defaultMediaUrls`, previews thumbnails, passes `mediaUrls` to `/api/zernio` |
| **Only hosted media posts; demo/preview dropped honestly** | ✅ | `zernio.ts` `postableMedia()` keeps http(s) only; result carries `mediaCount` + `droppedMedia`; UI badges demo creatives "preview — won't attach until live rendering returns a hosted URL" |
| **Brand Studio attaches a chosen creative** | ✅ | `/dashboard/studio` — click a variant to select, publish panel attaches its `imageUrl` + headline/offer/CTA caption |
| **VisualStrike renders flow into media** | ✅ (wiring ready) | same `mediaUrls` path — VisualStrike image/video renders attach the moment live rendering returns hosted URLs (image render is P1) |
| Verified | ✅ | typecheck + check:layers + clean build + smoke **341/0** (+2: hosted image attaches, demo data: URI dropped) |

## 42. Live image rendering → hosted, attachable creatives (2026-07-21)

| Requirement | Status | Where |
|---|---|---|
| **Brand Studio creatives render to a hosted URL (attachable), not just a preview** | ✅ | `image-gateway.ts` rasterizes the brand-safe creative to PNG via `sharp` and uploads via `storage.ts` → `https://storage.googleapis.com/...` |
| **Live photoreal via one provider** | ✅ | OpenAI `gpt-image-1` generates a text/logo-free scene (`openaiBackground`), then exact copy/logo composited on top (brand-safety preserved — model never spells text) |
| **Firebase Storage upload** | ✅ | `adminStorage` added to `firebase-admin.ts`; `uploadPublicMedia()` (public PNG, deterministic name) in new `storage.ts`; `FIREBASE_STORAGE_BUCKET` wired in `apphosting.yaml` |
| **Demo-safe + honest fallback** | ✅ | no Storage/OpenAI → inline SVG preview with note "attaches once Storage/live rendering configured"; never falsely claims hosted |
| **Node runtime** | ✅ | `/api/image` pinned `runtime = "nodejs"` (sharp + firebase-admin) |
| Verified | ✅ | typecheck + check:layers + clean build (sharp 0.35.3) + smoke **342/0**; sharp SVG→PNG rasterize verified locally (valid PNG) |

Activation: set Firebase Admin secrets (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) for hosted upload, and OPENAI_API_KEY for the photoreal background. Without them the OS runs on honest inline previews.

## 43. Video render pipeline (Veo/Sora) → attach to posts (2026-07-21)

| Requirement | Status | Where |
|---|---|---|
| **Async video render pipeline (start → poll)** | ✅ | `video-gateway.ts` — `startVideoRender` returns a jobId; `getVideoRender` polls the provider op; job store Firestore (`video_jobs`) or in-memory |
| **Veo + Sora adapters** | ✅ | Veo via Gemini API (`predictLongRunning` + poll), Sora via OpenAI (`/v1/videos` + poll), env-gated, defensive/graceful |
| **Finished MP4 → hosted URL** | ✅ | on completion, `uploadPublicMedia()` uploads the MP4 to Firebase Storage → hosted URL |
| **Attach rendered video to a post** | ✅ | `VideoRenderAndPublish` component on VisualStrike: render → poll → `<video>` preview → `PublishToChannels` with the hosted MP4 |
| **Demo-safe + honest** | ✅ | no Veo/Sora key → honest demo job ("activates with a Veo/Sora key"), never a fabricated video URL; `/api/video-render` GET status + POST start/status |
| Verified | ✅ | typecheck + check:layers + clean build + smoke **346/0** (+4: gateway status, start no-fake-URL, status poll, brandId 400) |

Activation: GEMINI_API_KEY (Veo) or OPENAI_API_KEY (Sora) for rendering + Firebase Storage for hosting the MP4.

## 44. Live-readiness verification (close the "first live run" caveat) (2026-07-21)

| Requirement | Status | Where |
|---|---|---|
| **Safe pre-flight: which live capabilities are wired vs demo** | ✅ | `GET /api/health/live` — 10-capability matrix (AI, Firebase Admin, Storage, hosted images, photoreal, video render, hosted video, Zernio, SMTP, Stripe), each with exactly what to set; no provider calls, no spend |
| **One-command live smoke for the deployed app** | ✅ | `scripts/smoke-live.mjs` (`npm run smoke:live -- <url>`): prints the matrix; `--exercise` runs the real image-generate / video-start / Zernio-connect paths (no social publishing), asserting a capability reported "ready" actually works |
| Verified | ✅ | typecheck + check:layers + clean build + smoke **347/0**; live-smoke pre-flight verified against the demo server (0/10, honest activation hints) |

Usage after setting production secrets: `npm run smoke:live -- https://marketwaros.com` (pre-flight), then `--exercise` once to watch the first live run.

## 45. First Customer guided sprint — zero → first paying customer, no ads (2026-07-21)

| Requirement | Status | Where |
|---|---|---|
| **One-screen wizard: offer → leads → outreach → payment link** | ✅ | `/dashboard/first-customer` runs real agents in sequence + mints a checkout link |
| Step 1 Offer | ✅ | `offer-builder` agent (margin-safe offer) |
| Step 2 Leads | ✅ | `lead-hunter` agent (who to reach + where, no ads) |
| Step 3 Outreach | ✅ | `outreach-commander` agent (WhatsApp/email messages built around the offer) |
| Step 4 Payment link | ✅ | `/api/checkout` self-attributing Stripe link |
| **No ad-platform dependency** | ✅ | owned channels only; send manually from own WhatsApp/email, or organic via Publish Center; "first-customer kit" + send CTAs |
| Prominent entry | ✅ | Sidebar "First Customer" (Banknote) under Command Center |
| Verified | ✅ | typecheck + check:layers + clean build + live sequence (offer/leads/outreach all return output, checkout link minted); page 200 |

## 46. Strict live-only + Command Center "First Customer" CTA (2026-07-21)

| Requirement | Status | Where |
|---|---|---|
| **Never serve deterministic demo AI output to real users** | ✅ | `provider.ts` `runAgent`: with `REQUIRE_LIVE` set, an unconfigured gateway throws an honest "Live AI is activating" error instead of `demoOutput` — no canned fallback ever reaches a user |
| Enabled in production | ✅ | `apphosting.yaml` `REQUIRE_LIVE=1` (keys are set, so agents run live; guard is the safety net) |
| Local/dev/tests stay demo-safe | ✅ | `REQUIRE_LIVE` unset → deterministic demo fallback preserved (smoke 347/0) |
| **"Land your first customer" CTA on Command Center home** | ✅ | prominent gradient hero card at top of `/dashboard` → `/dashboard/first-customer` (first thing after sign-in) |
| Verified | ✅ | typecheck + layers + build; REQUIRE_LIVE=1 → agent 502 honest error (no demo); dashboard root 200; smoke 347/0 |

## 47. The Money-Making Operating System doctrine (2026-07-23)

Source: `docs/reference/money-making-os-doctrine.md` (verbatim, immutable). This
is the owner's commercial constitution — every clause mapped to shipped code,
blueprint or backlog. Nothing dropped.

| Doctrine element | Status | Where / gap |
|---|---|---|
| Core objective — every action ties to revenue/customers/margin/retention/advantage | ✅ | Enforced across Command Center, engines, agents; codified here as the priority test |
| Rule 1 Revenue before activity | ✅ | Command Center leads with attributed revenue/orders/leads, not post/impression counts |
| Rule 2 Every action has a commercial objective | ✅ 📘 | Campaign/offer builders capture objective+offer+target; a hard "no unmeasured launch" gate across ALL asset creation is 📘 backlog |
| Rule 3 See value quickly (day-one) | ✅ | `/dashboard/first-customer` sprint + empty-state Next-Best-Action → Commercial Growth Scan |
| **Rule 4 Next best money-making action** | ✅ | **`nextBestAction` in `command-summary.ts` → hero card on `/dashboard`** — top-ranked move computed from the real ledger |
| Rule 5 Learn what produces money | ✅ 📘 | Per-source attribution + rankings live; a persistent cross-session learning model is 📘 |
| Rule 6 Stay for results, not lock-in | ✅ | Per-brand export/download everywhere; honest attribution; no cancellation traps |
| Rule 7 Protect profit | ✅ 📘 | Budget Protection + owner pricing floor (≥2× cost) live; full margin-guard across every recommendation is 📘 |
| §3 Revenue operating loop | ✅ 📘 | Each stage exists as a module; a single always-on orchestrated loop is 📘 |
| §4 Day-one Commercial Growth Scan (ingest→leakage→ranking→first campaign→value) | ✅ 📘 | First-customer sprint + website-intel cover ingest+first campaign; a unified 5-step scan report is 📘 |
| §5 Money Map (new/existing/recovered/new-creation) | ✅ 📘 | Revenue Recovery + revenue ledger cover parts; a single live Money Map view is 📦 backlog |
| §6 Revenue Command Centre (primary metrics + commercial alerts) | ✅ | Command Center metrics + computed opportunities/risks; alerts computed from ledger |
| §7 Opportunity Engine + Opportunity Score formula | ✅ 📘 | Opportunities computed + ranked; the exact multiplicative Opportunity Score is 📘 (to formalise as the ranking function) |
| §8 Competitor War Room + weakness + response | ✅ | `competitor-warroom` engine + `/dashboard/competitors` |
| §9 Offer Intelligence (builder + evaluation) | ✅ | `offer-builder` agent + Offer Forge |
| §10 Customer Intake (capture + qualify + action) | ✅ | Landing capture → results ledger; lead scoring in segments |
| §11 Sales Conversion (tools + deal rescue) | ✅ 📘 | Outreach/proposal/follow-up agents live; a unified deal-rescue detector is 📘 |
| §12 Revenue Recovery | ✅ | Lead Recovery engine + `/dashboard` recovery surfaces |
| §13 Customer Value Expansion (upsell/cross-sell/CLV) | ✅ 📘 | AOV-lift opportunity + segments live; dedicated upsell/cross-sell engines 📘 |
| §14 Retention & Anti-Churn | 📘 | Churn-signal engine specified, not yet a dedicated module |
| §15 Referral & Advocacy | ✅ 📘 | Creator/partner programme live; customer-referral automation 📘 |
| §16 Content-to-Revenue (every asset has objective+CTA+attribution) | ✅ 📘 | Content agents + attribution live; enforced per-asset commercial metadata 📘 |
| §17 Campaign Profitability (live profit model + scale/pause/stop) | ✅ 📘 | Budget Protection + campaign board; the full per-campaign profit equation is 📘 |
| §18 50-agent AI Revenue Workforce | ✅ 📘 | 19+ agents shipped and mapped to these roles; the full 50-role roster with shared memory/KPIs is 📘 (additive expansion) |
| Verified | ✅ | typecheck + check:layers + build; Next-Best-Action renders from the live ledger; doctrine preserved verbatim |

## 48. Money-Making Doctrine Part 2 — agents 51–68, Growth Brain, Money Score (2026-07-23)

Source: `docs/reference/money-making-os-doctrine.md` §18(cont.)–§23 (verbatim).

| Doctrine element | Status | Where / gap |
|---|---|---|
| Agents 51–53 (Review Growth, Support Intelligence, Customer Journey) | 📘 | Specified; reputation + WhatsApp/email surfaces cover parts; dedicated agents backlog |
| Agents 54–61 (Profit Protection, Marketing Cost, AI Cost Governance, Attribution, Fraud Prevention, Compliance, Brand Safety, Rights) | ✅ 📘 | Attribution (results ledger) + Fraud (creator fraudScore) + AI-cost floor (ACU/pricing) + honesty/compliance gates live; standalone Profit/Marketing-Cost/Brand-Safety/Rights agents 📘 |
| Agents 62–68 (Experimentation, Forecast, Budget Allocation, Next Best Action, Executive Briefing, Commercial Risk, Growth Memory) | ✅ 📘 | **Next Best Action** ✅ (command-summary) + **Executive Briefing** ✅ + **Commercial Risk** ✅ (briefing risks); Experimentation/Forecast/Budget-Allocation/Growth-Memory 📘 |
| §19 Shared Growth Brain (one brain → agent teams → actions → approval/automation → measure → learn) | 📘 | Coordination model specified; agents currently invoked per-surface — unifying orchestrator is 📘 |
| §19 No isolated-metric optimisation (content≠views-over-conversion, paid≠leads-over-margin, etc.) | ✅ 📘 | Command Center already ranks by revenue not vanity; a hard cross-agent guardrail is 📘 |
| §20 Dependency through value (daily/weekly/monthly proof) | ✅ 📘 | Daily briefing + command briefing live; scheduled weekly/monthly proof digests 📘 |
| §21 Value-to-Spend Expansion Engine (justified upgrades w/ cost+value+return+period+confidence) | 📘 | ACU/plan model live; the justified-upgrade recommender is 📘 |
| **§22 MarketWar Money Score (0–100)** | ✅ | **`moneyScore()` in command-summary.ts → card on `/dashboard`** — measured components scored from the real ledger; unmeasured shown as "connect a source" (never guessed); top weakness surfaced |
| §23 Success KPIs (user + platform) | 📘 | Time-to-first-X + per-user revenue metrics specified; a KPI instrumentation dashboard is 📘 |
| Verified | ✅ | typecheck + check:layers + build; Money Score renders from live ledger; doctrine Part 2 preserved verbatim |

## 49. Non-Negotiable Product Rules + Final Positioning (doctrine §24–25, 2026-07-23)

Source: `docs/reference/money-making-os-doctrine.md` §24–25 (verbatim). §24 is
tracked here as an **enforcement register** — each rule mapped to where it is
upheld, so any gap is visible rather than assumed.

| Non-negotiable rule (§24) | Status | Enforced where / gap |
|---|---|---|
| No vanity dashboard without actions | ✅ | Command Center leads with Next-Best-Action + ranked opportunities/risks/next-actions; every metric card links to an action surface |
| No content without a commercial purpose | ✅ 📘 | Content agents carry offer/CTA/funnel intent; a hard per-asset "objective required" gate is 📘 |
| No campaign without attribution | ✅ | Results ledger attributes every capture/order to its source; `/r/CODE` + checkout links self-attribute |
| No recommendation without expected value | ✅ | Briefing items carry a computed metric/expected value; Money Score weaknesses carry the lever |
| No automation without control | ✅ 📘 | Approvals workflow gates publish; autonomy dial caps high-risk agent actions; a global automation kill-switch is 📘 |
| No growth at the expense of profit | ✅ 📘 | Budget Protection + owner pricing floor (≥2× cost); a cross-recommendation margin guard is 📘 (Profit Protection agent) |
| No false performance claims | ✅ | Landing reframed to engineering targets + "Illustrative" scenarios; status page no invented uptime |
| No fabricated customers or testimonials | ✅ | Fake logo strip → real stack; testimonials labelled Illustrative; no invented reviews |
| No dark patterns | ✅ | Per-brand export/download everywhere; no cancellation friction; honest empty states |
| No unapproved competitive misconduct | ✅ | Competitor War Room is legal/ethical intel only (public signals) |
| No hidden AI cost | ✅ 📘 | ACU model + owner pricing law transparent; a per-action cost meter in-UI is 📘 (AI Cost Governance agent) |
| No feature that creates complexity without commercial value | ✅ | The doctrine's priority test is the standing filter; every shipped surface ties to revenue |
| §25 Final positioning (master/punchy/aggressive/competitive/promise) | ✅ | Landing hero aligned: "More customers. More revenue. Less waste." + the user-promise subhead |
| Verified | ✅ | typecheck + check:layers + build; landing hero updated; doctrine §24–25 preserved verbatim |

## 50. Prime Objective — Money Machine Doctrine v1.0 (2026-07-23)

Source: `docs/reference/prime-objective-money-machine-directive.md` (verbatim,
immutable). Master Product Directive; the canonical Prime Objective.

**Conflict/upgrade note (Additive-Only Law).** This directive names a **26-agent
army** (WARLORD, LEDGER, PROFILER, SPYGLASS … QUARTERMASTER). The earlier
`money-making-os-doctrine.md` lists a **68-agent** taxonomy. Resolution — keep
both: the 26-agent army is the **canonical revenue roster** to build/brand
against; the 68-agent list is the **superset taxonomy** those 26 draw from (e.g.
LEDGER≡Attribution, SPYGLASS≡Competitor Monitoring+Weakness, NECROMANCER≡
Reactivation, PRICELORD≡Pricing Optimisation). No agent dropped.

| Directive element | Status | Where / gap |
|---|---|---|
| §1 Prime Objective (every surface ties to money) | ✅ | Standing priority filter; Command Center + Money Ledger lead on money |
| Law 1 Day-1 Money | ✅ 📘 | First-customer sprint + Next-Best-Action fire day-one; a single automated Day-1 "First Blood" sequence is 📘 |
| **Law 2 Attribution (live Money Ledger + ROI)** | ✅ | **`/dashboard/money-ledger`** — real attributed revenue ÷ user's MarketWar cost = ROI multiple, receipts, per-source rollup, north-star row |
| Law 3 Full-funnel ownership | ✅ 📘 | Capture→convert surfaces live; a lead-never-dies pursuit-until-disqualified state machine is 📘 |
| Law 4 Compounding | 📘 | Growth Memory / per-brand learning model specified, not yet persistent |
| Law 5 Niche Domination | ✅ 📘 | Competitor War Room + Local Dominance live; auto strike-package drafting is 📘 |
| Law 6 Speed-of-Money prioritisation | ✅ 📘 | Next-Best-Action ranks by impact; an explicit speed-to-revenue queue (reactivate→upsell→recover→acquire) is 📘 |
| Law 7 Expansion | 📘 | PATHFINDER monthly expansion proposals specified |
| §3 Five-stage loop (HUNT/CAPTURE/CLOSE/MULTIPLY/FORTIFY) | ✅ 📘 | Each stage exists as modules; one always-on orchestrated loop is 📘 |
| §4 Dependency curve (Day1→Day90) | ✅ 📘 | Day-1 + Money Ledger proof live; scheduled War Reports (week/month) 📘 |
| §5 Competition-Kill (War Room dossiers + strike packages) | ✅ 📘 | `competitor-warroom` dossiers live; auto strike-package generator 📘 |
| §6 26-agent army | ✅ 📘 | 19+ agents shipped map to the roster (WARLORD≈command-summary, LEDGER≈Money Ledger, SPYGLASS≈competitor-warroom, BEACON≈local, RESCUER≈lead-recovery, WORDSMITH≈offer/copy, PRICELORD≈offer-forge economics); full 26 w/ LangGraph orchestration + self-throttling is 📘 |
| §7 Monetisation (BitriPay + ACU 3× + tiers) | ✅ 📘 | ACU model + BitriPay rail live; the "your last 5,000 ACUs generated £Y — reload?" ROI-framed upgrade screen is 📘 |
| §8 North-star metrics | ✅ | Money Ledger shows Attributed Revenue, ROI Multiple, New Customers, Revenue/Customer; Territory Share marked "connect competitor tracking" |
| §9 Roadmap / §10 one-sentence doctrine | 📘 | Recorded as the guiding build order |
| Verified | ✅ | typecheck + check:layers + build; Money Ledger renders real revenue + ROI; directive preserved verbatim |

## §51 — Dynamic Search Dominance Engine (owner spec; merged onto the OS)

Source (verbatim, immutable): `docs/reference/dynamic-search-dominance-engine.md`.
Merged with — not replacing — the existing Organic Dominance OS
(`src/backend/organic-dominance.ts`, `/dashboard/organic-dominance`). Both kept.

| Requirement | Coverage | Notes |
|---|---|---|
| Honesty rule: NO guaranteed rankings | ✅ | `HONEST_PROMISE` + on-page honesty banner; codebase swept — zero guaranteed-ranking claims. Promise = continuous optimisation, maximum ELIGIBLE visibility, measurable organic revenue. |
| Positioning (§2) | ✅ | Surfaced on `/dashboard/search-dominance`. |
| Dynamic SEO Commander — 5 operating modes (§3) | ✅ 📘 | Modes defined + shown (Observe/Recommend/Assisted/Autonomous/Emergency); actual autonomous website mutation is 📘 (needs CMS/Search Console write integration + approvals — routed through existing Approvals engine). |
| Operating loop (§4) | ✅ | 13-stage loop rendered as the permanent operation. |
| Day-one Search Revenue Audit (§5) | ✅ 📘 | Crawl→audit→universe→scored opportunities already runs in Organic Dominance OS onboarding (AI-assisted, honest scaffold w/o key); cross-linked. Live GSC/Analytics/Merchant ingestion is 📘 "connect a source". |
| Opportunity Score (§6) | ✅ | `opportunityScore()` — transparent bounded 0–100 heuristic (positives ÷ difficulty) + confidence by data completeness; live tool on the page. |
| Search intent intelligence (§7) | ✅ | `classifyIntent()` — intent + funnel + commercial signals; live tool on the page. |
| Keyword/topic/prompt universe + clustering (§8) | ✅ 📘 | Universe generated in Organic onboarding; live volumes 📘 (Search Console). |
| Competitor Search War Room (§9) | ✅ 📘 | Wired to the live competitor engine; AI-citation/backlink monitoring 📘 "connect a source". |
| Technical SEO engineer (§10) / Sitemap+IndexNow (§11) / Structured data (§12) / On-page agent (§13) / Content superiority (§14) / Content-to-revenue (§15) / Internal authority (§16) / Ethical backlinks (§17) | 📘 | Blueprint — require site write-access + external data; safeguards captured (no fake reviews/ratings/prices; robots vs noindex; sitemaps/IndexNow are signals not guarantees). To be implemented behind the Approvals + honest-source gates. |
| AI Search & Recommendation + Readiness score (§18) | ✅ 📘 | `aiReadinessScore()` (transparent components, weakest-3 surfaced); live AI-answer monitoring 📘 "connect a source"; distinguishes mentioned vs cited vs recommended vs represented vs revenue. |
| Brand entity/knowledge engine (§19) | 📘 | Consistent brand-truth layer (source truncated mid-§19; append when supplied). |
| Verified | ✅ | typecheck + check:layers + build (143 pages); intent + score tools compute live. |

Conflict resolution (Additive-Only Law): the spec's Opportunity Score formula
supersedes the earlier §13 organic formula as an upgrade; the organic module's
formula is retained in place and the new transparent bounded score is the one
surfaced on the Search Dominance page. No capability removed.

### §51 addendum — Search Dominance modules §19–§23 (spec continuation)

Verbatim source updated (`docs/reference/dynamic-search-dominance-engine.md`) with
full §19 + §20–§23. Surfaced via `ENGINE_MODULES` on `/dashboard/search-dominance`,
each mapped to a live OS engine or an honest status:

| Module | Coverage | Maps to |
|---|---|---|
| §19 Brand Entity & Knowledge | ✅ foundation / 📦 connect | Brand identity lives in Brand Studio (`/dashboard/studio`); cross-profile consistency monitoring needs authorised sources (directories/knowledge panels/press) — honest "connect a source", never fabricated. Entity record fields + consistency sources defined (`ENTITY_RECORD_FIELDS`, `CONSISTENCY_SOURCES`). |
| §20 Local Search Domination | ✅ live | `/dashboard/local` (Local Domination engine). |
| §21 Ecommerce Search Growth | 📦 connect | Needs store/merchant-feed connection to tie feeds→views→cart→checkout→revenue/margin. |
| §22 Image & Visual Search | ✅ live | `/dashboard/product-engine` (VisualStrike image gen); alt-text/Lens/image-sitemap SEO wiring 📘. Safeguard: never misleading imagery; exact product/logo. |
| §23 Video & YouTube Search | ✅ live | `/dashboard/video` (Video War Room); title/chapters/captions/schema/thumbnail/CTA SEO functions 📘. |
| §10–§18 (technical/schema/internal/backlinks/AI) | 📘/📦 | Defined as modules with honest status; implemented behind Approvals + honest-source gates. |

### §51 addendum 2 — Search Dominance §24–§25

Verbatim source updated with §24 Social Search + §25 Reputation Defence.

| Module | Coverage | Maps to / honesty |
|---|---|---|
| §24 Social Search Dominance | 📦 connect | Per-platform in-feed discovery (TikTok/IG/YT/LinkedIn/Reddit). Activates when social accounts connect. Reddit rule captured: help genuinely, DISCLOSE material relationships, no spam, follow community rules. Landing: `/dashboard/amplify`. |
| §25 Search Reputation Defence | ✅ live / 📦 connect | `/dashboard/reputation` (Reputation Shield). Deep monitoring (reviews/press/impersonation/counterfeit) needs sources. Hard safeguard carried: NEVER create fake positive reviews or suppress legitimate criticism through manipulation. |

### §51 addendum 3 — Search Dominance §26–§31

Verbatim source updated with §26–§31.

| Item | Coverage | Maps to / notes |
|---|---|---|
| §26 Search Conversion Optimisation | ✅ foundation | `/dashboard/landing-builder` (Conversion Architect); per-page CTR→revenue tracking fills from GSC/analytics (connect). |
| §27 Search Revenue Attribution | 📦 connect | Query→…→LTV chain; revenue-by-dimension needs GSC + revenue data. Landing: `/dashboard/roi`. |
| §28 Rank-Loss Response | 📦 connect | Incident process defined; needs GSC monitoring to detect declines. |
| §29 Continuous Content Refresh | ✅ foundation | `/dashboard/content` (Content Factory); freshness triggers + actions defined. |
| §30 Search Experimentation | 📘 blueprint | Controlled A/B on titles/CTAs/structure w/ version history + rollback; behind Change Control. |
| §31 Search-Dominance AI Workforce (53 agents) | ✅ | Full roster defined (`SEARCH_WORKFORCE`, 9 divisions) and surfaced on `/dashboard/search-dominance`. Each agent maps to an engine module/capability; orchestration under operating modes + Approvals is the running layer (📘 for autonomous execution). |

### §51 addendum 4 — Search Dominance §32–§42 (spec COMPLETE, §1–§42)

Full verbatim source captured. Governance, data model, guardrails, phases, MVP and positioning folded in.

| Item | Coverage | Notes |
|---|---|---|
| §32 Agent Decision Hierarchy | ✅ | Commander→teams→prioritised actions→approval/automation→measurement; "no vanity metric over revenue/trust/safety" enforced by guardrails. |
| §33 Permissions & Safety | ✅ | `RISK_TIERS` (low/medium/high) surfaced; binds to the Approvals engine. |
| §34 Command Centre | ✅ 📦 | `EXECUTIVE_METRICS` listed + daily-priority concept; live figures fill from GSC/analytics (connect). |
| §35 Search Dominance Score (0–100) | ✅ | `dominanceScore()` — 14 transparent components, weakest-5 → recommended action; live tool. Cost/revenue estimates attach only with a connected source. |
| §36 Required Integrations | 📦 | Registry captured (GSC/GA/Bing/IndexNow/GBP/Merchant/YouTube; CMS platforms; MW infra). Each is a "connect a source". |
| §37 Developer Architecture | 📘 | Service topology recorded (crawler→ingestion→knowledge graph→Commander→agents→approval→CMS gateway→attribution). |
| §38 Core Data Model | ✅ | `SearchOpportunity` type shipped (intents + full lifecycle statuses). |
| §39 Non-Negotiable Rules | ✅ | `GUARDRAILS` (15) surfaced verbatim; align with the platform honesty doctrine (no guaranteed rankings / fake links / fake reviews / cloaking / unpermitted changes / visibility≠revenue). |
| §40 Activation Phases | ✅ | `ACTIVATION_PHASES` (P1–P5) surfaced as the rollout roadmap. |
| §41 MVP Acceptance Criteria | ✅ 📦 | `MVP_CRITERIA` (17) surfaced as definition-of-done; each item is a build gated on the relevant integration. |
| §42 Final Positioning | ✅ | `FINAL_POSITIONING` (master/punchy/competitor/AI/standard) surfaced. Module is the OS's permanent organic customer-acquisition division. |

Spec §1–§42 fully imported (`docs/reference/dynamic-search-dominance-engine.md`),
mapped to code/live/connect/blueprint, honesty enforced throughout, build green.

## §52 — OMNIRANK Dominion Stack (ES-05) — merged as the execution + defence layer

Source (verbatim, immutable): `docs/reference/omnirank-dominion-stack-ES-05.md`.
Extends the Search Dominance Engine (§51). White-hat only; honesty §12 aligns
with the platform doctrine. Surfaced at `/dashboard/omnirank`.

| Item | Coverage | Notes |
|---|---|---|
| §0/§12 Doctrine + Strategic Honesty | ✅ | Both "guarantees" and "nothing can guarantee #1" surfaced side-by-side; zero false ranking promises. |
| Deep crawl extracts (SiteRaid, 21 fields) | ✅ | **No connector — the label was stale.** `src/backend/deep-crawl.ts` reads several pages of the real site (sitemap first, then the site's own navigation), obeying robots.txt and its Crawl-delay via `src/backend/robots.ts` (RFC 9309: one matching group, longest-match precedence, tie to Allow, empty Disallow = permission). `src/backend/site-extract.ts` pulls products, services, pricing, images, videos, logos, colours, fonts, CTAs, trust signals, reviews, FAQs, SEO metadata, content hierarchy, navigation, offers, blog links, contact and social links out of the HTML + one stylesheet. **Audience is refused**, with the reason shown: it is not in the markup and an inference listed as an extract is a fabrication. A price declared in a schema.org Offer is kept apart from one merely seen in prose. Bounded by a page cap and a wall-clock budget; a partial answer says it is partial. |
| Trend Hijack with Brand Relevance™ — continuous monitoring | ✅ | **No trends connector needed.** `src/backend/trend-watch.ts` + `/api/trends/scheduled` (weekly cron, secret-gated, budget-bounded). News comes from the existing search layer; the 8-factor gate's RISK side is unchanged and still final. Its FIT side was `seed(trend + business + factor)` — a checksum of the customer's own name — so relevance is now MEASURED as overlap with the brand's own vocabulary read off their site, the matched words are shown as the reason, and a brand with no crawl gets `null` rather than a number. Only signals NEW since the previous run are reported. Costs no ACUs. |
| MW-14 OMNIRANK Core | 📦 connect | Crawl mesh/entity graph/rank matrix/share-of-answer need crawl+rank+AI-citation sources. Link: organic-dominance. |
| MW-15 Authority Warfare | 📦 connect | Five white-hat rails + toxic-link firewall; needs backlink/mention data. |
| MW-16 Answer Capture (GEO/AEO) | ✅ foundation / 📦 | Ties to Search Dominance AI-readiness; live prompt monitoring = connect. |
| MW-17 Content Velocity Forge | ✅ live | `/dashboard/content` + blog; human-gate publish. |
| MW-18 Technical Supremacy | ✅ partial / 📦 connect | `/dashboard/website-intel` (SiteRaid) crawls and measures the real page. **Auto-deploy now APPLIES the fix rather than describing it**: `src/backend/seo-deploy.ts` + `/api/seo/deploy` + `/api/seo/snippet/[brand].js`, with the approval screen (`src/components/SeoDeployPanel.tsx`) mounted on SiteRaid AI and SEO Autopilot. `draftFixesFromCrawl()` joins the measured gap to a value generated from the brand's own record (`seo-artifacts.ts`), and refuses to invent one where the record is empty; alt text is never guessed. Every fix is off until a person approves it, fills a gap rather than overwriting, and runs only on hosts the brand authorised. **Honest limit:** client-side injection is seen by Google on a later pass and NOT by social unfurlers, non-rendering crawlers or the AI assistants the visibility module measures — stated on the panel and inside the served snippet. Server-side templating, CWV and log-file analysis still need site access. |
| MW-19 Social Signal Amplification | ✅ live | `/dashboard/amplify` + creator programme. |
| MW-20 SERP Feature Sniper | 📦 connect | Needs SERP-feature data. |
| MW-21 Competitor Displacement | ✅ live | `/dashboard/competitors`. |
| MW-22 Rank Defence / Sentinel | ✅ foundation | Sentinel hard-block classes surfaced + enforced by doctrine/Approvals; algorithm/negative-SEO monitoring = connect. Link: reputation. |
| §3 APEX Swarm (22 agents A24–A45) | ✅ | Full roster surfaced with module + function; Sentinel flagged. Autonomous execution = 📘 behind Approvals + Sentinel. |
| §5 Opportunity Score / §9 Dominion Score | ✅ | `omnirankOpportunity()` (bounded Volume×Intent×Feature×Winnability÷Effort) + `dominionScore()` (5-vital composite) — live tool. |
| §7 ACU economy + tiers | ✅ | Action→ACU table + SCOUT/RAIDER/WARLORD/DOMINION surfaced. |
| §10 rollout / §11 success criteria | ✅ | 90-day phases + honest 90-day targets surfaced. |
| §6/§8 architecture + API surface | 📘 | NestJS/Kafka/Neo4j/ClickHouse topology recorded as blueprint (portfolio stack); MarketWar surface is the honest command layer. |

### §Gaps — pricing-law conflict (Additive-Only resolution)
ES-05 §7 states a **66% gross-margin** target. The MarketWar **OWNER PRICING LAW**
(CLAUDE.md) requires **margin never below 100%** (price ≥ 2× provider cost). Both
kept per Additive-Only Law; **resolution: the ≥100% floor governs** — ACU→£ prices
are set so every action clears the 2× floor, overriding the 66% figure. The ACU
*consumption* table (action→ACU) is unchanged.

---

## §53 — Public-launch hardening (2026-08-02)

Ordered by the owner ahead of going fully public: a deep pass over code,
features, functions and the **full real-payment cycle**, with every blocker
fixed rather than documented. Everything below is a defect that was live in the
shipped platform, not a new feature request.

### Money path — end to end

| Requirement | Status | Evidence |
|---|---|---|
| A customer's sale settles to the CUSTOMER, never to MarketWar | ✅ | `createCheckoutLink` minted on the platform's own `STRIPE_SECRET_KEY`, so a £199 sale through the Revenue page or the First Customer Sprint landed in MarketWar's balance with no payout path back and a receipt naming the wrong company. `sellerRoute()` (`src/backend/checkout.ts`) now decides: a seller's connected account (`acct_…`) is sent as the `Stripe-Account` header so the money is theirs from the first second; with a TEST platform key it still mints, because no real money can be misrouted and the attribution loop must stay provable; with a LIVE key and no connected account it **refuses** and names the two ways to actually get paid. Both minting surfaces ask for the account, so the refusal never dead-ends the flow. |
| A payment that does not name its plan allocates nothing | ✅ | `planFromEvent` returned `"growth"` for any missing or unrecognised `metadata.planId` — so any `checkout.session.completed` reaching the endpoint bought a month of Growth ACUs, and a Starter subscriber whose invoice metadata was dropped was topped up at the Growth rate for the life of the subscription. Now returns `null`, and `handleStripeEvent` reports `ignored` with the reason. Renewals additionally read `subscription_details.metadata`, which is where every month after the first actually carries the plan. |
| The wallet a payment credits is chosen by the session | ✅ | `/api/billing/topup` passed `body.orgId` to the checkout, so the client chose whose wallet the webhook would credit. Now `auth.uid`. |
| A route that debits ACUs outlives the work it charged for | ✅ | `/api/geo`, `/api/landing`, `/api/prospecting`, `/api/visualstrike` debited and then ran on Vercel's ~10s default — a debit with nothing delivered and no code alive to refund it. All four sized to their work, and a standing test fails any future route that meters without declaring `maxDuration`. |
| Webhook signature, replay window, idempotency | ✅ (unchanged, re-verified) | Production fails closed without `STRIPE_WEBHOOK_SECRET`; timestamp tolerance enforced with the caller's clock; `processed_events` written in the same transaction as the credit. |

### Access, abuse and the platform's own exposure

| Requirement | Status | Evidence |
|---|---|---|
| The admin allowlist requires a **verified** address | ✅ | `PLATFORM_ADMIN_EMAILS` promoted any matching address to `executive`. Firebase mints a valid token for an email/password account created with an address the registrant has never opened, so an allowlisted address not yet claimed by its owner handed executive — every org's admin surface, plus `isStaff()` skipping metering, so unlimited spend on the owner's provider keys — to whoever registered it first. `decoded.email_verified` is now part of the check. |
| The rate limiter is not what a flood consumes | ✅ | One bucket per IP, never evicted, so a caller rotating addresses grew the map for the life of the instance. Expired buckets are swept once the map passes 10,000. |
| A launch pre-flight that reports consequences, not variables | ✅ **new** | `src/backend/launch-check.ts` + `/api/health/live` + the Go-Live page. Every dangerous state here is a *combination* whose halves each look fine: a live Stripe key with no webhook secret charges the card and credits nothing; Firebase Admin with no encryption key refuses every PII write in total silence (the callers are fire-and-forget). Blockers name what a real person suffers; warnings name what the owner should know. Reads booleans only — never a value — and makes no network calls. |

### Law and the public site

| Requirement | Status | Evidence |
|---|---|---|
| Consent before analytics (PECR reg. 6) | ✅ | Google Tag Manager loaded from the root layout for every visitor on every route, from first render. `src/components/CookieConsent.tsx` gates it: the container loads only on an explicit grant, Consent Mode v2 starts denied, refusing is one click in a button styled identically to Accept, silence resolves to denied, and an unreadable `localStorage` resolves to "not asked" rather than to a grant. `/privacy` §10 describes the mechanism that exists and links to a control that reopens it. |
| Consumer 14-day cancellation right | ✅ | New Terms §4 states the right under the Consumer Contracts Regulations 2013, and states its real limits plainly rather than burying them: supply beginning inside the window means a proportionate deduction, and ACUs already spent are genuine provider cost and are not refundable. Unused balance and unused period are refunded to the original method within 14 days. Businesses keep the cancel-any-time term. |
| Trader identity published | ⚠️ owner action | `NEXT_PUBLIC_LEGAL_ENTITY_NAME` + `…_REGISTERED_ADDRESS` are unset, so Terms §13 renders "not yet published here" — honest, but not compliance for a UK site selling to the public. The launch pre-flight raises this as a **blocker** on a production deployment. Only the owner has these details. |

### §Gaps — Terms refund conflict (Additive-Only resolution)

Terms §3 stated **"Top-ups are non-refundable once partially used."** The new §4
refunds the unused balance **pro rata**. Two clauses of the same contract
disagreeing is worse than either alone, so §3 now defers to §4 and the stronger
consumer term governs. The previous position is recorded here rather than
deleted. No other billing term changed: allowance rate, annual discount and the
consumption-rate adjustment clause are untouched.

### §53b — SiteRaid: the audit measured nothing, then measured a refusal

| Requirement | Status | Evidence |
|---|---|---|
| The Instant Marketing Audit measures the site, not the business name | ✅ | Every one of the 36 sub-scores was `sscore(business + area + name)` — an FNV hash of the customer's own company name turned into a 45–90 number, feeding the six area scores, the overall, and the sentence naming their weakest area. Type a different name and the diagnosis changed; change the site and it did not move. Each dimension now either reads something the crawl found (CTAs counted, FAQs counted, title present, schema types seen, load time recorded) and shows that count as its `basis`, or returns `score: null` with what it would need. 24 of 36 are measurable from a crawl; the 12 that are not — visual quality, differentiation, mobile experience, abandonment risk, posting consistency, upsells — say so. Area scores average only the measured dimensions and report `measured/total`. |
| The Competitive Attack Map ranks by evidence, not by a checksum | ✅ | `opportunity` was `sscore(business + gap, 30, 95)`, deciding which of sixteen moves to do FIRST. Six gaps are visible in a crawl and are now scored from the measured absence (0 trust signals = an open trust gap), each carrying the count. The other ten need competitor data, review corpora or ad history that no crawl of one site can supply: they keep the play and lose the number. |
| `seed`/`sscore` deleted, not left in the file | ✅ | No callers remain. A convincing-looking score generator sitting unused is an invitation for the next person in a hurry; a test now fails if either reappears in SiteRaid. |
| **A site that refuses the crawl is not scored as a bad site** | ✅ | Found on the first live run of the measured audit, against **evandeli.com** — one of the two brands this platform is being tested with. The host answered **403**; the audit scored it anyway: **16/100, "urgent" in all six areas**, "0 words on the entry page", "title tag missing", "0 product(s) named", "no way to make contact published". Every sentence false, and shaped exactly like a measurement. `crawler.ts` had already classified the refusal correctly and the audit was not asking. A blocked fetch, a failed fetch or a JavaScript shell now scores nothing content-derived, and the headline says we could not read the site plus how to let us in (allowlist `MarketWarBot/1.0`) — never a number. The Attack Map takes the same gate, so an empty extraction from a 403 cannot rank every gap wide open. |
| A readable page is still scored | ✅ | The gate is conditional, not a blanket refusal — mutation-verified in both directions. |

**Container limitation, stated rather than hidden:** outbound HTTP from this
build environment is proxied and returns 403 for arbitrary hosts, so the
positive live-crawl path could not be exercised here. It is covered by unit
tests against a readable `CrawlReport`, and the blocked path was verified end
to end against the running production build.

### §53c — The rest of the hash-as-score sweep

SiteRaid was not the only place an FNV hash was dressed as a measurement. A
sweep of every module using the seeded helper found seven more that assign it to
something named like a score, a confidence or a percentage. Ranked by what a
customer would actually DO on the strength of the number:

| Module | What was fabricated | Status |
|---|---|---|
| `lead-harvest.ts` — mail server + catch-all | `mx = domainOk && (s % 100) > 8` and `catchAll = … > 82`, where `s = seed(email)`. **A hash decided whether a real domain had a mail server**, so roughly one address in twelve was hard-failed to `reject` for no reason and the rest were passed on the same non-evidence — and two addresses at the SAME domain could disagree. That verdict is read before emailing a stranger, and it guards the owner's own sending reputation. | ✅ fixed — MX needs DNS and catch-all needs an SMTP probe, so both are now injectable (`mxByDomain` / `catchAllByDomain`) and report **not run** when nothing looked them up. Only a *measured* absence adds risk or rejects. `safe` is refused while any deliverability check has not run — "risky, because nothing confirmed it", not because anything failed. |
| `lead-harvest.ts` — contact confidence | `clamp(60 + seed(email) % 35)` — a 60–95 figure from the letters of an address, which reads as "probably fine" for every address ever harvested. | ✅ fixed — `null` unless a caller that actually ran the verification engine supplies one. |
| `seo.ts` / `youtube.ts` | Volume, difficulty, competition, domain authority, referring domains, toxic links — all hashed. A disclaimer existed and called them "relative proxies (0–100)", which implies the ORDER means something. It does not: the term shown as easiest may be the hardest. | ✅ fixed wording — now "PLACEHOLDER NUMBERS, NOT ESTIMATES … their ORDER carries no information … do not choose keywords, judge a domain or spend budget on them." The surfaces are unchanged and still complete; they no longer describe themselves as approximations of anything. |
| `campaign-architect.ts` — trend fit | `fit = 40 + seed(trend + business + factor) % 55`. | ⚠️ **superseded, not yet removed** — `trend-watch.ts` already replaced this with measured vocabulary overlap and is what the scheduled monitoring uses. The older gate is still reachable through `/api/campaign-architect`. Its RISK side is real and must be kept. |
| `reporting.ts` | `score = clamp(40 + seed(business + ":" + id) % 60)`. | ⚠️ open |
| `buyer-psychology.ts`, `video-intelligence.ts` | `hits * 22 + (seed % 8)` and `hits * 10 + (seed % 5)` — the score is dominated by real keyword hits; the hash contributes ≤7 points of tie-breaking jitter. | ℹ️ low — not a fabrication, but pointless noise that makes the number look more precise than the rule behind it. |

The three remaining rows are recorded rather than rushed: each needs either a
data source or a rewrite of the surface, and shipping a half-measured score is
how the first one got written.

---

## §54 — Clip Finder: the OpusClip step the platform did not have (2026-08-02)

Owner: *"we failed to have options of OpusClip: #1 AI video clipping and editing tool"*.

**What was actually missing.** `video-intelligence.ts` calls itself "the
clip-intelligence brain (OpusClip class)", and it does rank moments, score them
across eight commercial dimensions, and build reframe and caption specs. But
`rankMoments()` takes `Moment[]` — start times, end times and transcript text
that somebody else has to have produced. Grep the repo: the only callers pass
straight through from the request body. So the Clip Intelligence Lab was a
scoring form. A customer had to watch their own two-hour recording, write down
the timestamps of the good bits and type them in — which is the job they came
here to have done. Every other piece was already real: Whisper transcription
with timestamps, an FFmpeg job queue with a `clips` recipe that cuts to 9:16,
ACU charging with refund on failure. Only the brain in the middle was absent.

| Requirement | Status | Evidence |
|---|---|---|
| A long video in, scored clips out | ✅ **new** | `src/backend/clip-finder.ts` + `/api/video/clips` + `src/components/ClipFinder.tsx` on `/dashboard/video`. Transcribe → rebuild sentences → sweep boundary-anchored windows → score → dedupe → per-clip `.srt`. Measured at **185ms for a two-hour transcript** (1,200 segments), well inside the route's 120s. |
| A clip never starts mid-word | ✅ | Whisper segments are 5–15s fragments that break wherever the model felt like breaking; cutting on one starts the clip halfway through a word, which is the clearest tell of automated clipping. `sentencesFrom()` rebuilds sentences first (including several inside one segment, with the internal boundary interpolated by character share), and every candidate begins and ends on a sentence boundary. |
| A clip makes sense on its own | ✅ | "So then he told me the same thing" is a fine sentence and a terrible opening line: "he" and "the same thing" are in the ninety minutes the viewer did not watch. Opening lines are checked for conjunction openers and bare pronouns, and it costs 45 points each. |
| Every score is counted, and shows its count | ✅ | Seven signals per clip — Hook, Stands alone, Payoff, Pace, Length, Buying signal, Ask — each with the count it came from ("2 curiosity phrases, 1 direct address", "53 words in 40s — 1.3 words/second"). The headline is their flat average, so anyone can reproduce it. A weighted blend nobody can redo is how a score stops being checkable. |
| Usable with no render worker | ✅ | Each clip returns exact in/out timestamps, its quotable text, and its own `.srt` **rebased to start at zero and clipped to the clip's own bounds** — a subtitle file whose first cue is at 42:17 is useless against a forty-second clip. YouTube, LinkedIn, Meta and TikTok all accept an uploaded `.srt`. With `render:true` and a worker configured it also queues the 9:16 cuts on the existing queue; without one it says so instead of queueing a job that can only fail. |
| No transcript → no clips | ✅ | Says so, and says nothing here guesses where the good bits are. A source shorter than the length band returns nothing rather than something. |
| Money order matches the captions route | ✅ | Every check that can fail runs before the wallet; a provider failure after the charge refunds it; `maxDuration = 120` so the function cannot be killed mid-flight holding a debit. A caller who already has a transcript passes `segments` and is not charged twice for the same audio. |

### The hashes this removed

| Was | Now |
|---|---|
| `scoreClip` defaulted `hookStrength`/`emotionalIntensity`/`buyerIntent`/`reputationRisk` to `50 + seed(clipId + salt) % 30`, so a clip with no measured signals still produced **eight confident commercial scores from the characters of its own identifier** — rename the clip and its business case changed. `retention` additionally carried `+ s("ret") * 0.3`, a hash term inside an arithmetic expression. | A dimension is scored only when every input it depends on was measured; the rest return `null` and the note says which and why. The Clip Finder supplies **hook strength** (counted off the opening line) and **buyer intent** (counted commercial vocabulary). Emotional intensity and reputation risk stay unmeasured on purpose: a transcript records that someone said "worth every penny", not how they said it or whether the claim holds up. |
| `rankMoments` started at `40 + seed(m.id + t) % 15` — up to fifteen points of rank from a hash of the id, enough to reorder two moments whose real signals were level. | Flat base. Every point of separation is a signal one of them actually has. |
| `detectGenre` broke ties with `seed(text + g) % 5`, so **renaming a file changed what the platform thought the video was**. | Ties break by declaration order — stable and explainable. |
| The seeded FNV helper itself. | Deleted from the module. A test fails if `seed`/`Math.imul` reappear in either `video-intelligence.ts` or `clip-finder.ts`. |

**Still connector-gated, and labelled as such:** auto-reframe that *tracks* the
active speaker (the recipe centre-crops to 9:16 today), B-roll insertion, and
burned-in animated captions all need the FFmpeg worker. The queue, recipes and
pricing for those already exist; what this adds is the decision of *what to
cut*, which nothing in the platform could make before.

### §54b — Cutting a clip needs no supplier

Owner: *"these are new vendors — FFMPEG_CLOUD_API_KEY or VIDEO_WORKER_SECRET."*

**Two corrections were owed.** Those two were listed together as though they
were the same kind of dependency, and they are not:

- `FFMPEG_CLOUD_API_KEY` **is** a third party — `api.ffmpeg-micro.com`. A new
  supplier, a new contract, a new bill.
- `VIDEO_WORKER_SECRET` **is not a vendor at all.** It is a shared secret
  between the app and `worker/`, a container in this repo, deployable to Cloud
  Run on the Google Cloud account the adopted stack already runs on. Calling it
  a vendor was wrong.

**And neither is needed to cut a clip.** `VideoEditor.tsx` has cut segments
in-browser for a while — `captureStream()` on a `<video>` into a
`MediaRecorder`, nothing uploaded. What was missing was the two things that
make the output a *short* rather than a trimmed landscape file.

| Requirement | Status | Evidence |
|---|---|---|
| Cut a clip to 9:16 with captions burned in, with no supplier | ✅ **new** | `src/frontend/clip-render.ts` draws each frame to a 1080×1920 canvas — cropped to 9:16, caption drawn from the clip's own cues — and records the canvas plus the element's audio. Wired into the Clip Finder: pick the source file, cut, download. |
| Nothing is uploaded | ✅ | The source is a locally-picked `File`. Deliberate: drawing a cross-origin video onto a canvas taints it and the recording fails. It also sidesteps the 25MB transcription cap — only the *audio* ever had to be small, while the cutting runs against the full-quality original. A test asserts the module imports nothing from `@/backend` and never calls `fetch`. |
| Correct geometry, not black bars | ✅ | A source wider than 9:16 gives a full-height column that slides horizontally; a source *taller* than 9:16 (phone footage) is cropped top-and-bottom instead, because cropping it sideways would pillarbox it. Focus is clamped so no value — including `NaN` — can push the crop off the frame. |
| Captions that stay readable and do not bury the video | ✅ | Two lines maximum, held off the bottom fifth where every platform puts its own UI, stroked behind the fill so white text survives white footage. |
| Whatever container the browser records | ✅ | Safari records MP4, Chrome and Firefox record WebM. Insisting on one produces an empty file on the other. |
| The reframe is honest about being manual | ✅ | A slider the person moves, labelled *"You place this, we do not guess it."* Following a speaker needs per-frame face detection; a guess that crops someone out of their own video is worse than a centre crop that never pretended to be clever. |
| Cost | ✅ | Zero, to both sides. No upload, no queue, no per-minute render bill, and the file never leaves the machine it was already on. Under the pricing law that is a nominal-charge action, not a metered one — we do not pass on a cost we do not bear. |
| Honest limit, stated on screen | ✅ | `MediaRecorder` records a playing element, so a 40-second clip takes about 40 seconds. Said up front rather than discovered. Desktop Chrome/Edge/Firefox; where the API is missing, the panel says so and the timecodes plus `.srt` still work in any editor. |

**What the render worker is still for**, now stated that way everywhere
(`/api/health/live`, the Render Farm panel, the clips route): unattended
batches, and the heavier jobs the browser genuinely cannot do — background
removal, upscaling, B-roll compositing. It is optional, and the self-hosted
route involves no new supplier.

### §54c — The hosted renderer is live, and it was charging for jobs it cannot run

Owner: *"FFMPEG_CLOUD_API_KEY is already there in vercel."*

That turns the server-side render queue from an optional extra into a code path
customers reach tomorrow — and it had never been exercised in that exact
configuration. Tracing it found a live money defect.

**The two executors are not interchangeable.** The hosted API takes a flat list
of FFmpeg options and cannot run `filter_complex`, so anything compositing a
second source over the frame — `brand` (a logo) and `broll` (picture-in-picture)
— only ever runs on the self-hosted worker. `hostedApiUnsupportedReason()`
already knew this. `enqueueVideoJob` did not ask it.

With the hosted key set and no worker, which is precisely how this platform is
deployed:

1. `buildRecipe` succeeded — the recipe is valid FFmpeg.
2. **The wallet was debited** (18 ACUs for `brand`, 30 for `broll`).
3. The hosted-submit block was *skipped*, because the kind is unsupported — so
   the refund branch inside it never ran either.
4. The job was written as `status: "queued"`, `provider: "worker"` — onto a
   queue with no worker reading it.

The customer paid for a render that could never start, and nothing errored: the
job simply sat at "queued" forever. Reproduced against the real module before
the fix — *"balance after: 582 (charged 18 ACUs)"*.

| Requirement | Status | Evidence |
|---|---|---|
| A render nothing can perform is refused before the wallet is touched | ✅ | New `canRenderKind(kind)` answers "can we render **this**", which is a different question from `renderingAvailable()`'s "can we render at all". Called before `debitAcus`, and a test asserts that ordering — a check placed after the debit would be a refund, not a refusal, and refunds only work when the code issuing them runs. |
| The five kinds the hosted API *can* do still work | ✅ | trim, clips, captions_burn, bg_remove, upscale all run on `cloud`; mutation-verified that the guard does not switch them off. |
| A self-hosted worker still runs everything | ✅ | Including the two composites. |
| Nothing configured → no charge, and the browser is offered instead | ✅ | "…does not need one — the Clip Finder does that in your browser." |
| The margin law holds on a now-live provider cost | ✅ | All seven kinds charge exactly 4× the hosted per-minute cost; asserted in a test, since this is real money on a live path rather than a hypothetical. |
| Health reports the deployment's real state | ✅ | With the hosted key present it names what runs and what does not, rather than repeating advice the owner has already acted on: *"Logo overlay and B-roll do NOT … refused before anything is charged."* |

**Note on the existing worker-queue tests.** Six of them started failing when
the guard landed, because they enqueue in an environment with no renderer — they
were leaning on the absence of the check. They exercise the *worker* path
(claiming, a worker dying mid-render, the refund after three failures), so they
now declare `VIDEO_WORKER_SECRET`, which is what they always implicitly assumed.

### §54d — Nothing is gated any more: logo and B-roll moved to the browser

Owner: *"complete"* — close the last open decision rather than leave it as one.

The decision on the table was whether to deploy `worker/` to Cloud Run so that
logo overlay (`brand`) and picture-in-picture B-roll (`broll`) would work. Those
were the only two render kinds the hosted FFmpeg API cannot do, because both
need `filter_complex`.

The better answer was not to deploy anything. Compositing a second source over
a frame is what a canvas does for a living, and the canvas was already in place
drawing the 9:16 crop and the burned captions.

| Requirement | Status | Evidence |
|---|---|---|
| A logo composited over the clip, with no worker | ✅ **new** | `overlayRect()` + the draw loop in `clip-render.ts`. **14% of frame width, inset 30px from the bottom-right** — the exact numbers from the worker's own recipe (`[1]scale=iw*0.14:-1[wm];[0][wm]overlay=W-w-30:H-h-30`), so a clip cut in the browser and one cut on the worker look the same. Height follows the logo's own aspect ratio, so a tall logo is not squashed into a wide box. |
| Picture-in-picture B-roll, with no worker | ✅ **new** | **35% of frame width, inset 40px from the top-right, visible from the clip's start until `untilSec` (default 8)** — again lifted from the recipe. Silent, matching the recipe's `-c:a copy`: the speaker keeps talking underneath. |
| Draw order | ✅ | B-roll first, logo last. A watermark a picture-in-picture can cover is not a watermark. |
| Degenerate assets cannot break a frame | ✅ | A broken image or a video whose metadata never arrived has no usable dimensions; `overlayRect` returns a zero rect rather than dividing by zero and drawing NaN geometry. An oversized `widthPct` is clamped inside the frame. |
| No leaked object URLs | ✅ | The overlays add two more blob URLs per render; all three are revoked in `cleanup()`. A leaked one pins the whole file in memory for the life of the tab, and someone cutting ten clips would pin ten videos. |
| Reachable | ✅ | Optional logo and B-roll pickers on the Clip Finder, with the placement stated ("the same placement the server-side render uses") so nobody has to wonder whether the two paths agree. |
| Reporting matches reality | ✅ | The health capability is now *"Clip cutting to 9:16 — captions burned in, logo, B-roll … needs no key at all"*. The refusal from `canRenderKind` no longer sends anyone to deploy a container: *"The capability itself is not missing… the Clip Finder does logo overlays and picture-in-picture B-roll in your browser, at the same size and position this render would have used."* |

**What a render worker is now for, and only for:** unattended batches, and
**background removal and upscaling** — the two jobs a browser genuinely cannot
do. Nothing in the clip pipeline is gated behind it, and no capability is
missing from this deployment.

---

## §55 — Target market: countries and cities, across the modules (2026-08-02)

Owner: *"in all our modules and customer acquisition, user should be able to
target countries or city — e.g. one user SEO has more impressions in Pakistan
while the market is mainly the UK."*

**What was there.** `Brand.location: string` — one line of free text, used as a
hint in prompts. Nothing in the platform could answer *"is this from somewhere I
sell to"*, so nothing did. Impressions climb, most of them from a country the
customer does not sell to, and the dashboard reports the rise as a win. That is
not a reporting nicety: it is a metric moving opposite to reality, and a
customer who trusts it keeps making the content that produced it.

Run through the real module on the owner's example — **11,000 impressions
becomes 1,490.**

| Requirement | Status | Evidence |
|---|---|---|
| A market is structured data, not a text hint | ✅ **new** | `src/shared/market.ts`: `TargetMarket = { countries: {code, tier}[], cities: [] }` with tiers `primary` / `secondary`; everything else is outside. On `Brand.targetMarket`, optional so every existing brand keeps working. |
| Countries resolve however a source spells them | ✅ | Search Console returns lower-case **alpha-3** (`gbr`, `pak`); ad platforms return alpha-2; humans type "UK", "Britain", "England", "America". All resolve to one code. A mismatch here would tell a UK business that none of its traffic is from the UK. An unrecognised value returns `""` — a wrong code silently moves traffic across the market line and changes a number the customer acts on. |
| The headline is the in-market number | ✅ | `marketFit()` splits any measure — impressions, clicks, sessions, leads — into primary / secondary / outside / **unknown**. Unknown is its own bucket: folding it into "outside" overstates the problem, folding it into "in market" hides it. |
| Out-of-market traffic is separated, not dismissed | ✅ | *"not necessarily worthless — a country that keeps appearing may be a market worth entering — but they must never be added to a number you use to judge whether the work is paying off."* The largest out-of-market sources are listed, so an expansion signal is visible rather than buried. |
| No alarm where there is no problem | ✅ | 5% leakage reads as a normal split; the "not 11,000" framing only fires past 30% outside. |
| **No country ranking is built in** | ✅ | Which countries matter is a fact about a particular business; a shipped ranking would be an opinion applied to every customer who never asked for it. Tiers are set by the customer. Presets ("UK & Ireland", "UK first, English-speaking second", "Gulf") are conveniences with plain names, all editable. A test fails if a built-in ranking ever appears. |
| Cities, for a business smaller than a country | ✅ | A restaurant does not sell to "the UK". `geoQualifier()` prefers cities: `"plumber in Croydon"` returns something useful, `"plumber in the United Kingdom"` does not. |
| Wired across the modules | ✅ | `src/backend/brand-market.ts` resolves it once and every module reads the same answer: **SEO / Search Console** (country split fetched alongside whatever dimension was asked for, so the split is never something you have to think to look for), **prospecting**, **local + opportunity + keyword search**, **AI Visibility** (assistants asked about the market the customer actually competes in). An explicit value always wins — typing "Manchester" into a box means Manchester. |
| No hardcoded country fallback | ✅ | Prospecting fell back to a literal `"United Kingdom"` for every customer on earth. It resolves the brand's market now, and returns empty rather than guessing — a search that returns the wrong country is worse than one that asks where to look. |
| Reachable | ✅ | `MarketPicker` in the brand editor (presets, per-country tier, city list), and the split rendered **above** the totals on the SEO panel — putting it underneath would let someone read the misleading headline and stop. |

### Still to extend

The market is defined, stored and read by the five surfaces above. The modules
that do not yet consult it — ads targeting, email sending windows, the trend
watch's region, content localisation — take the same `TargetMarket` and are a
mechanical follow-on rather than a design question.

### §55b — The other four modules, on the same market

Owner: *"do — ads targeting, email sending windows, the trend watch's region,
content localisation."*

Called a mechanical follow-on. Three of the four were; the fourth was hiding
another hash.

| Requirement | Status | Evidence |
|---|---|---|
| **Email sending windows** | ✅ | `bestSendTime` was `hours[seed(sent + ":" + delivered) % hours.length]` — the recommended hour to email a list, drawn from a checksum of that list's own delivery counts, and a customer schedules a campaign on it. The honest answer needs no model: a UK list is emailed at nine in the morning **in London**, and what that is in UTC depends on the date. `sendWindows()` reads the offset out of `Intl` at the actual date, so **09:00 London is 09:00 UTC in January and 08:00 UTC in July** — a lookup table would have sent the summer campaign an hour early for six months and nobody would have connected the two. A market spanning countries gets one window each (`United Kingdom 08:00 UTC | Australia 23:00 UTC`) rather than an average that suits neither; a country spanning zones says so. With no market set it returns nothing and says why, instead of producing an hour that reads like advice. |
| **Ad targeting** | ✅ | `adTargeting()` on the batch plan — the block to paste into Meta or Google Ads: countries with their tiers, cities, locales, currencies. The exclusion side is stated as firmly as the inclusion side, because *"an open campaign buys the cheapest impressions available, which is not the same as the most valuable"* — the same mechanism that filled the organic numbers with out-of-market traffic, doing it with money. Flags a multi-locale market (separate ad sets, or one carries copy written for somewhere else) and a multi-currency one (a single hardcoded price will be wrong for someone). |
| **Trend watch region** | ✅ | The region is appended to the news query rather than filtering results afterwards — a search that never returns the wrong region beats one that discards it after paying for it. A local business searches its city, not its country. With no market it searches globally and says so: *"a story trending somewhere this business does not sell counts the same as one at home."* |
| **Content localisation** | ✅ | `localisationTargets()` derives locale, currency and spelling from the market instead of the customer restating on every run something the platform already knows — which could also disagree, localising for markets the business does not sell in while the ones it does go unadapted. It flags the **spelling split**, the cheapest mistake here and the easiest to miss: *"'optimise' in front of a US reader reads as a typo exactly as 'optimize' does to a British one — write the main market's spelling and adapt, rather than splitting the difference into something that looks wrong everywhere."* |

All four read the brand's stored market through the same resolver; explicit
values still win, and nothing is guessed where the market is unset.

---

## §56 — Email preview: see it before two thousand people do (2026-08-02)

Owner: *"email centre to have preview before sending, regardless of if it's
written, AI generated or saved template."*

**What was there.** The template editor rendered the template's own HTML —
which is not what arrives. The send path merges each contact's fields, injects
a tracking pixel, rewrites every link through the click redirector and appends
an unsubscribe block. A campaign that looked right in the editor could still go
out with a raw `{{ salesRep }}` in the greeting. The Email Centre itself — the
place campaigns are actually sent from — had no preview at all.

| Requirement | Status | Evidence |
|---|---|---|
| One preview, all three sources | ✅ **new** | Typed by hand, generated by the writer, or a saved template — all three reach `POST /api/email {action:"preview"}` as subject + html, so none can drift from the others. `src/components/EmailPreview.tsx` is the single panel, mounted on the Email Centre and the template editor. |
| It runs the **send path**, not a second renderer | ✅ | Same `mergeTemplate`, same `injectTracking`, same order, same per-brand tracking host. Tests assert the pixel, the wrapped links and the unsubscribe line are all present in the previewed HTML, and that the raw link does **not** survive un-wrapped. A preview that can differ from the delivered mail is worthless exactly when it matters. |
| It previews a **real recipient**, incomplete ones first | ✅ | A specimen "John Smith" has every field filled in, which is the one case that never goes wrong. Samples are sorted so the contact with no name leads. Addresses are masked — a preview is not a reason to print a contact list. |
| Eligibility matches the send exactly | ✅ | Same consent and status-filter rules, so the recipient count is the number that will actually receive it. |
| Blockers hold the campaign send | ✅ | Unknown merge tag, a brace pair surviving the merge, empty subject, a subject that renders empty for a real contact, a dead `href="#"`, an empty list. The Send-to-vault button is disabled while any is present; **the test send stays available**, because that is how you check a fix. |
| Warnings inform without blocking | ✅ | Subject over 60 characters, ALL CAPS, multiple exclamation marks, `http://` links, images with no alt, nothing to click, repeated personalisation. |
| **It found a live defect on its first run** | ✅ fixed | `shared/merge-tokens` defines a default fallback for every token that can plausibly be missing — but those are applied by `fixTokens()`, which rewrites template text. **The send path calls `mergeTemplate` directly and never sees them.** So a hand-typed `{{ firstName }}` merges to nothing and *"Hi ,"* goes out. The preview now counts it across the whole eligible list and names the one-keystroke fix: *"{{ firstName }} has no fallback and 1 contact(s) on this list have no value for it — they receive the sentence with a gap in it. Write {{ firstName \| there }}."* |
| The inbox line, not just the body | ✅ | Subject plus the grey preheader beside it — the whole of what most people read before deciding. `htmlToText` strips `display:none` blocks and the tracking pixel so a hidden preheader hack cannot become the first line a recipient sees. |
| Desktop / phone / plain-text views | ✅ | Rendered in a `sandbox=""` iframe: the message is the customer's own HTML and it is shown rather than described, but it cannot run anything against the dashboard around it. |

### §57 — The mobile menu was clipped to the height of its own header

Owner: *"the menu is not visible and accessible in the pwa"* (screenshot: the
drawer open as a strip under the status bar, no nav items, the page behind
undimmed).

**Not a PWA bug — every phone.** `MobileNav` renders inside the dashboard's
mobile header, and that header carries `backdrop-blur-xl`. An element with a
`backdrop-filter` becomes the **containing block for its `position: fixed`
descendants**, so the drawer's `fixed inset-0` resolved against the header's own
box rather than the viewport. Measured in a real mobile Chromium at 412×915:

| | drawer panel |
|---|---|
| before | **288 × 60** — clipped to the header's height |
| after | **288 × 915** — full viewport, all 58 nav links reachable |

| Requirement | Status | Evidence |
|---|---|---|
| The drawer escapes any ancestor that traps it | ✅ | `createPortal` to `document.body`. Pinning the header instead would fix today and break again the first time anyone adds a `transform`, `filter` or `will-change` above it. Portalled only after mount, since `document` does not exist during the server render. |
| It clears the phone's own chrome | ✅ | `pt-[var(--safe-top)]` so the first group is not under the status bar, and `pb-[calc(1rem+var(--safe-bottom))]` so the last item is not under the gesture bar — in the installed app both are real. |
| It can be closed without touching it | ✅ | Escape, plus `aria-modal` and an `aria-label`. A full-screen drawer with no keyboard exit is a trap. |
| The class of bug, not the instance | ✅ | A test enumerates every component mounted inside the blurred header and fails any that renders `fixed inset-0` without a portal. |
| Verified, not reasoned | ✅ | Driven in headless Chromium at phone size: the fix measured at full height, and the bug **reproduced at 60px** by reverting the portal — so the cause is confirmed rather than assumed. |

### §58 — The three sender fields, filled in (2026-08-03)

Owner: *"the from name section, From address section and reply to inbox to be
pre-filled"* (screenshot: three empty boxes with placeholders).

The platform knew all three. The brand's name was on the screen, the signed-in
account's address signed the request, and any authenticated domain was already
in Sending Domains. `src/shared/email-identity.ts` supplies the defaults and
`applyDefaults()` fills **only empty fields**, so a value the customer typed is
never overwritten by a brand switch.

| Requirement | Status | Evidence |
|---|---|---|
| From name and Reply-to prefilled | ✅ | Brand name, and the signed-in account address — the one inbox a person is known to read. |
| From address prefilled **only from a verified domain** | ✅ | Prefilling `hello@theirdomain.com` because it looks right produces mail that spam-folders, and the field *looks* correct so nobody investigates. With nothing verified the field stays empty and `fromNote` says why, naming the platform address the send falls back to. |
| A hand-typed address gets the same check | ✅ | `fromAddressWarning()` runs against the same verified list, so an address typed by hand cannot skip the check the prefilled one never needed. |

## §59 — "Improve the open and click rates" (2026-08-03)

Owner sent one screenshot of the Email Centre tiles: **2,129 sent · OPEN RATE
5.9% (125 opened) · CLICK RATE 4.3% (92 clicked)** — both painted green.

**Two defects in one picture.**

*The tiles were lying about the result.* `tone="good"` was hardcoded on both, so
5.9% rendered in the same green a 40% open rate would. A platform that tells a
customer a poor result is a good one is worse than a platform with no tiles.

*And the diagnosis was computed and thrown away.* `/api/email-events` already
returned `engagement`, `providers`, `reputation` and a `note` — including the
verdict that 92 clicks from 125 openers is **74% of openers clicking**, where
real people run 10–15%, which is what corporate link-scanning looks like. The
client's `stats` type listed ten fields and none of them were those. Every one
of those objects was discarded before it reached the screen.

*The open number was also mis-measured.* An open is recorded by a 1×1 image.
Anyone who **clicked** necessarily opened — a link cannot be pressed inside an
unopened message — but a clicker whose client blocked images never appeared in
the open count at all. The most engaged readers on the list were invisible.

**New: `src/backend/email-improve.ts`** (ledger in, ranked findings out) and
`src/components/EmailImprove.tsx` (the panel). Wired through the existing
`/api/email-events` route; nothing was removed.

| Requirement | Status | Evidence |
|---|---|---|
| The open figure is a **floor**, not a measurement | ✅ **new** | `reach()` returns `knownOpeners` = pixel openers ∪ clickers, and the field is called `openFloorPct` so it cannot be read as a measurement. Verified end-to-end through the real `/api/track/open` and `/api/track/click` handlers: a run with 40 pixel opens and 15 image-blocked clickers reads **13.3% pixel-only, 18.3% as a floor**. |
| The tile grades instead of flattering | ✅ | `openGrade` / `clickGrade` → `GRADE_TONE`. Below `MIN_VOLUME_TO_JUDGE` (200) a rate grades `unknown` and renders **white, not green** — an unjudged number is not a good one. |
| A number the report calls unreliable is never graded good | ✅ | When click-to-open is outside what people produce, `clickGrade` is forced to `unknown`. A tile cannot say "good" three inches above the paragraph saying "treat this as an upper bound". Mutation-tested. |
| The grading lines are **ours**, and said to be | ✅ | 20% / 2.5% are declared operating lines, not an industry standard — since Apple Mail Privacy Protection began fetching pixels on readers' behalf, published open-rate benchmarks measure that relay as much as they measure people. Google and Yahoo's complaint/bounce limits remain quoted as theirs in `deliverability.ts`. |
| Findings are **counted**, in the customer's own numbers | ✅ | Unauthenticated sending domain (blocking); click-to-open outside human range; a receiving provider filtering you; contacts that have never engaged; openers who do not click; unsubscribe rate; reputation halt. Each carries the arithmetic that produced it. |
| Contacts that never engage, with the counterfactual shown | ✅ | `deadWeight()` — addresses sent to 3+ times that have never opened or clicked, the share of total sends they consume, and what the floor would read without them, described as *"the same arithmetic, not a forecast"*. It is the only lever that moves both rates **and** the sending reputation together. |
| No campaign is called a winner on noise | ✅ | `separated()` is a two-proportion z-test at the conventional 1.96. "Your best subject line" is the easiest place in an email product to publish a coincidence as a finding: 12% against 8% on sixty recipients each is nothing, and a customer who rewrites their copy around it has been misled by their own tool. |
| **No predicted lift, no hashed score** | ✅ | A test greps the module for `+N%`, "uplift", "expected lift" and for any `seed(` call. Every figure a customer reads came from their own ledger. |
| Machine hits excluded from the floor too | ✅ | The same `meta.machine` flag the bot filter writes; scanners are kept in the ledger as evidence of delivery and excluded from every rate. Verified against the real tracking handlers: 25 Proofpoint fetches flagged, 25 excluded. |
| Mutation-verified | ✅ | Eight mutations — pixel-only opens, forcing click trust, grading small samples, counting engaged contacts as dead weight, dropping the significance gate, counting scanners as readers, dropping the report from the API response, and re-hardcoding the green tile — each caught by a test. |

## §60 — Public pages: what the site claims vs what ships (2026-08-03)

Owner: *"see if public pages and information required update on any news"* — the
last public-site audit was §f069fa5, and ten feature commits landed after it.

**Three numbers for one thing, on one page.** The landing page headed its agent
grid *"A 26-agent revenue army"* while the grid immediately below it mapped over
`AGENT_LIST` and rendered **39 cards** — a visitor could count them. The 26
belongs to a different list: `ARMY`, the Command Centre's front-line roster. And
the pricing table on the same page said *"Full 19-agent AI workforce"*, a third
number matching neither.

| Requirement | Status | Evidence |
|---|---|---|
| A count on the marketing site comes from the list it describes | ✅ **fixed** | The heading is `{AGENT_LIST.length}`, the same list the grid maps over. The Command Centre's numbers are attributed to the Command Centre: `{ARMY.length}` front-line units in `{DIVISIONS.length - 1}` divisions under one commander. Verified against the running build: heading **39**, cards rendered **39**, plan feature **39**, Command Centre line **26 units / 6 divisions**. |
| The engine count is the registry's own length | ✅ **fixed** | The status page said *"37 engines"* and the developers page's **meta description** — the text a search result shows — said *"37 deterministic AI engines"*, against a registry of 38. Both derive from `ENGINE_REGISTRY.length` now; served pages confirm **38**. |
| Hardcoding is treated as the defect, not the wrong digit | ✅ | A test scans the public pages for any `N agents` / `N engines` literal and fails on it. A corrected constant drifts again the next time an agent is added. |

**Email open and click tracking was not disclosed.** The platform injects a
per-recipient 1×1 image, rewrites every link through a redirector, and stores the
requesting user agent so scanners can be told from people. None of that appeared
in the privacy notice's "Data we collect".

| Requirement | Status | Evidence |
|---|---|---|
| The tracking is described in plain terms | ✅ **new** | Privacy §2 lists email delivery events, then explains the pixel, the link redirector and why the user agent is kept. |
| Controllership is stated | ✅ | Where a customer mails their own contacts they are the controller for that tracking and must disclose it in their own notice; MarketWar is the processor. The same mechanism on our own marketing mail is named separately. |
| The opt-out is named where the tracking is | ✅ | One-click unsubscribe, and the suppression ledger that is never re-sent to. |

**The site did not mention capabilities that shipped.** Nothing on any public
page referred to the Clip Lab, target-market targeting, or the email preview and
honest engagement reporting.

| Addition | Where | What it says — and it is all checkable |
|---|---|---|
| Clip Lab | Landing deep-dive + the AI Marketing Engine pillar | Long video in, vertical clips out: seven counted signals per clip, exact in/out points, an `.srt` rebased to zero, 9:16 with captions burned in, logo and B-roll — **rendered in the browser**, so nothing is uploaded to a render service and there is no render bill. The example panel is labelled as an example. |
| Target market | How it works, phases 1 and 4 | The countries and cities you actually sell to, and the fact that ad targeting, localisation and trend watching all read the same market. |
| Email preview + honest rates | How it works, phase 5 | Previewed through the real send path; sending windows per market; and the open rate shown **as a floor**, with the platform naming what holds it down rather than colouring it green. |

## §61 — The blog had no links in it, and could not have had (2026-08-03)

Owner: *"blogs have no hyperlinks, backlinks and only 3 created so far"*, then
*"with the SEO ai agent blogs have many dynamic hyperlinks and backlinks to best
any SEO and have SEO autopilot"*.

**Three separate causes, all true at once.**

*Nothing could have linked.* `AgentMarkdown`'s inline renderer understood exactly
one construct — `**bold**`. A `[text](url)` reached the page as the literal
characters, brackets and all. No article could have shown a hyperlink however it
was written, and this affected every agent output in the dashboard as well.

*Nothing was asked to link.* The generator's brief never mentioned links, so
every post was a dead end: nothing to the product pages, nothing to the other
posts, nothing out.

*And a model asked for links invents them.* `/pricing` is a page this site does
not have. Asking politely is not a control.

| Requirement | Status | Evidence |
|---|---|---|
| The renderer can draw a link | ✅ **fixed** | `Inline` splits Markdown links out before bold, so bold still works inside link text. Verified by rendering the real component: `<a href="/how-it-works">`, external links carrying `target="_blank" rel="noopener noreferrer"`, and no raw brackets left in the HTML. One level of balanced parentheses is allowed in a URL, so `https://example.com/a(1)` survives intact. |
| Only schemes that cannot execute become links | ✅ | `src/shared/safe-link.ts` — a whitelist of relative paths, http(s) and mailto. It is in `shared` and tested directly because a security decision that cannot be tested is one nobody checks: this renderer displays model output on a public page, and `javascript:` is a URL a model can be talked into producing. `//evil.test` is refused too — a protocol-relative jump wearing a relative link's clothes. |
| The writer is given destinations rather than asked to think of them | ✅ **new** | `linkMenu()` — the real public routes plus the real published posts. A test walks `src/app` and fails if any menu route has no page file. |
| An invented link never ships | ✅ | `enforceLinks()` runs after generation whatever the model did: anything off the menu is **unlinked with the sentence kept**, and the removal is reported by URL and reason. On both paths out of the generator, live and demo. |
| An outbound citation is checked before it is published | ✅ | `verifyExternal()` — HEAD then GET, and a URL that does not answer is unlinked. A citation nobody can load is worse than no citation. |
| Every article links out of itself, including the ones already written | ✅ **new** | `relatedPosts()` on the article page — word overlap on title, excerpt and category, with the shared words shown. Below two shared words the posts are unrelated and the block does not render, because a "related" list padded with filler teaches readers to skip it. |
| An article is citable | ✅ **new** | `BlogPosting` JSON-LD (headline, author, dates, `mainEntityOfPage`), a canonical URL — without which every tracking parameter on a shared link looks like a separate page competing with the article — plus the author and date on the page itself. |
| Only three posts existed because writing one meant typing one | ✅ **fixed** | The studio takes one topic per line and the route generates the run, rebuilding the link menu between articles so post two can link to post one. It stops on the clock with time left to save, and names the topics it did not reach instead of dying holding them. A topic that fails does not lose the articles already written. |
| The studio says when a post links nowhere | ✅ **new** | `linkAudit()` per post — `none` / `thin` / `ok`, with any broken internal link named. Three articles linked nowhere and nothing in the product would have told anybody. |

### §61b — The customer's SEO blog links to the CUSTOMER's pages

SEO Autopilot already existed and already charged correctly (debit before
generation, refund on failure). What it did not do was give the writer anywhere
to link. And the platform menu would have been the wrong fix: a customer's
article linking to marketwaros.com is our marketing on their page.

| Requirement | Status | Evidence |
|---|---|---|
| The menu is the brand's own site | ✅ **new** | `brandLinkMenu()` — their sitemap first (the site telling us which pages it considers important), then their own navigation, via the existing `discoverUrls`. Their money pages become link destinations; another brand's posts never do. |
| Their absolute URLs survive enforcement | ✅ | A customer's blog is hosted here and their shop is not, so their pages arrive as absolute URLs. Anything **on the menu** is known-good in either form — it came from their sitemap. |
| A crawl failure costs links, never a paid-for post | ✅ | The menu lookup is `.catch(() => [])`; the article is still written, still charged once, still refunded if generation itself fails. |
| Backlinks are reachable from the product | ✅ **fixed** | The Link Opportunity Engine has existed since the SEO work landed and **nothing in the product ever called it**. The SEO Autopilot page now does: real pages from live search — sites already naming the brand without a link, lists that exist to include businesses like theirs, publications already covering the category — each with the evidence snippet and the pitch. The doctrine travels with the results: links are **earned, never placed**, because buying, exchanging or injecting them breaches Google's link spam policy and the penalty lands on the customer's domain. |
| Mutation-verified | ✅ | Nine mutations — shipping invented internal links, shipping unverified external ones, padding the related list, allowing a protocol-relative jump, allowing any scheme, bypassing the whitelist in the renderer, skipping the policy on the live path, skipping it on the demo path, and dropping the brand menu — each caught by a test. |

### §61c — The same linking, for every user (2026-08-03)

Owner: *"all users and paid customers using this platform where appropriate to
benefit from features or functions or functionalities."*

**Two engines had an API and no way in.** The Link Opportunity Engine and the
Programmatic SEO Builder were both fully built, both reachable only by someone
writing a POST by hand. A capability a customer cannot find is not a capability.

**And the builder emitted orphans.** It produced hundreds of page specs — unique
title, meta, slug and JSON-LD on each — that pointed at nothing. Three hundred
pages nobody links to are three hundred pages nobody reaches.

| Requirement | Status | Evidence |
|---|---|---|
| A generated page set is a network, not a pile | ✅ **new** | `interlink()` joins the batch on the axis values the customer supplied: same service across places, same place across services, same left-hand side across comparisons. 12 pages from 3 services × 4 towns carry **60 internal links**. |
| No link in the mesh can break | ✅ | Every target is a slug generated in the same batch — there is no model inventing a URL and no network call needed to check. Asserted page by page. |
| A page nothing points at is named | ✅ | `orphans` in the result and on screen: one service in one town produces one page, zero links, and the note says which page is stranded and how to join it up. |
| The mesh is deterministic | ✅ | Sorted by slug, so regenerating does not silently reshuffle a page's own navigation. Mutation-tested against an ordering change. |
| Both engines are reachable in the product | ✅ **fixed** | The SEO Autopilot page now carries the **service × place builder** (services and places, one per line — the OS invents neither) and **Backlinks worth earning**, each with the evidence and the pitch. |
| The builder is signed in and rate limited | ✅ **fixed** | `POST /api/programmatic-seo` had neither. GET stays open — it is the doctrine and a fixed demo with no input. |
| Nothing is gated to a plan | ✅ | Reach does not depend on tier: the ACU allowance already meters what an action costs, and a plan gate on top would charge twice for one decision. A test fails any of these three routes that starts gating by plan, and asserts SEO Autopilot is in the navigation for everyone. |

## §62 — AI Growth Engine: ten tools, one section (2026-08-03)

Owner listed ten built-in reach tools to be *"fully active and fully working"*
in their own section and dashboard.

**Eight already shipped** as full command surfaces. This page does **not**
reimplement them — a second, thinner Landing Page Architect would be worse than
the one that exists. It names each, says in one line what it does and what it
needs from the customer, and takes them into the real thing. A test asserts all
ten titles are present and that every linked destination is a page that exists.

**Two did not exist at all** — and they are the two that get faked hardest
everywhere else.

| Tool | Where it lives | Note |
|---|---|---|
| AI social media post generator | Content Factory | existing |
| AI travel advert creator | Campaign Builder | **travel added as an industry profile** — a vertical, not a separate product, so its vocabulary, channels and buyer roles apply across the whole platform rather than inside one button |
| AI email campaign generator | Email Centre | existing |
| AI landing page builder | Landing Builder | existing |
| **AI hashtag generator** | on the page | **new** — `src/backend/hashtags.ts` |
| AI video script generator | Video War Room | existing |
| AI performance recommendations | ROI Engine | existing |
| AI audience optimisation | Segments | existing |
| AI campaign analytics | War Room | existing |
| **AI best posting time recommendations** | on the page | **new** — `src/backend/posting-time.ts` |

### Hashtags

| Requirement | Status | Evidence |
|---|---|---|
| No invented volume, reach or difficulty | ✅ | Every hashtag tool on the market prints "2.4M posts · reach 180K" beside a tag. Nobody selling one can measure either figure for the account using it. A test fails any field named volume/reach/difficulty/competition and any `1.2M`-shaped figure in the module. |
| Every tag is traceable | ✅ | Each carries `because` — *"'boiler' is used 4 times in the post"*, *"somewhere you actually sell"*. Sources: the post's own repeated phrases and frequent words, the brand, their campaign tag, the industry profile, and the places they sell in. |
| Different per platform | ✅ | Threads applies exactly **1**; X gets **2** because every tag spends characters from a hard limit; LinkedIn **3**; Instagram **5** of a documented 30. What a platform documents is called a limit; what people have found works is called a convention. |
| Engagement bait removed and explained | ✅ | `#follow4follow`, `#fyp`, `#viral` and the rest buy engagement from people who will never buy anything, and tell the platform's own spam classifier the account is gaming reach. |
| A short list is a mix | ✅ | Taking the first N in build order filled an Instagram set with five caption words and never reached the town — which for a local trade is the tag that brings a customer rather than an audience. The cut interleaves subject → place → campaign/brand → back to the post. |

### Best posting time

| Requirement | Status | Evidence |
|---|---|---|
| Three tiers, and it always says which | ✅ | **measured** from the brand's own delivery ledger; **market-hours** arithmetic on the countries they sell to, labelled as a starting point rather than a finding; **unknown**, which says so and says what to set. An invented "Tuesday 10am" is worse than an empty panel because the customer acts on it and never learns it was decoration. |
| Clicks decide, opens are context | ✅ | Apple Mail Privacy Protection fetches the open pixel near delivery, so open timestamps describe **our sending schedule** rather than their habits. Once there are 40 clicks, clicks rank the hours outright: reproduced with 45 clicks at 19:00 against 200 opens at 09:00 — the clicked hour wins, as it must. A weighted blend had the relay-fetched hour winning, which was the exact error the weighting was meant to prevent. |
| DST-correct local hours | ✅ | `offsetMinutesAt` per event: the same 18:00 UTC click lands at 19:00 in July and 18:00 in January. A fixed offset is an hour wrong for half the year. |
| An empty hour is never recommended | ✅ | Asking for three windows when one hour holds the activity returns one. |
| Machine hits excluded | ✅ | A scanner is not an audience — the same `meta.machine` flag used everywhere else. |
| Nothing is charged | ✅ | Neither tool calls a provider — tags come from the customer's own words, times from their own ledger — so neither invents a fee to look valuable. A test fails the route if `meterAction` or `debitAcus` appears. |
| Signed in, rate limited, ownership-checked | ✅ | `requireAuth` + `rateLimit`, and `resolveBrandAccess` on the ledger because it is the customer's own data. |
| Mutation-verified | ✅ | Six mutations — one list for every platform, keeping engagement bait, letting opens outrank clicks, recommending empty hours, inventing a time with no market set, and counting scanners as audience — each caught. |

## §63 — No free AI action, regardless (2026-08-03)

Owner: *"every AI action are metered and gated by available ACUs, no free AI
action regardless."*

**This overrules a decision I had made one commit earlier.** The AI Growth
Engine's two new tools charged nothing, on the reasoning that neither calls a
provider so neither should invent a fee — and I had written a test asserting
metering must *not* appear. The owner's rule is narrower than that reasoning and
it wins. Both are now metered at the nominal `report` rate (the rate for work on
data the customer already owns), so the rule holds without overcharging for it,
and the test now asserts the opposite of what it used to.

**Reading 147 routes for this is hopeless**, because the provider call is usually
three or four modules below the handler. `tests/helpers/spend-graph.mjs` builds
the call graph from each route's HTTP verbs and answers it mechanically.

The first version followed imports by *module* and produced nonsense —
`/api/gateway` imports `gatewayStatus` from the file that also exports
`gatewayComplete`, and was reported as a spender though it only reads
configuration. The second brace-matched function bodies and reported that
nothing in the codebase called anything, because `export async function f(input:
{ … })` opens its first brace inside the **parameter type**. It is now
symbol-level and slices definitions, which over-approximates in the safe
direction: it flags a route that might spend rather than missing one that does.

**What it found: 23 routes can reach a paid provider, and 8 of them charged
nothing.**

| Route | Was | Now |
|---|---|---|
| `/api/image` | signed in, **not metered** — the most expensive action on the platform (an image is 10 ACUs) was free | metered **per variant**, before the provider is called, and **refunded** if generation throws |
| `/api/contacts` (enrich) | ownership-checked, not metered — an empty wallet still bought up to 120 paid searches | metered **per row**, `batch.length` rather than the cap, so eleven rows cost eleven |
| `/api/organic-dominance` | signed in, not metered | metered — signing in was never the point on its own: an authenticated customer with an empty wallet still spent our money |
| `/api/creator-recruitment` | signed in, not metered | metered, and given a `maxDuration` |
| `/api/creator-engine` (verify_followers) | admin-gated, not metered | metered per profile, and given a `maxDuration` |
| `/api/trends/scheduled` | **its own comment claimed it spent nothing** while calling a paid search API three times per brand, every week, for every scheduled brand | debited per brand **before** the crawl and the searches; a brand that cannot cover it is **skipped with the reason** and the sweep carries on |
| `/api/blog` | platform_admin, not metered | metered — a no-op for staff, whom `meterAction` exempts, so the owner is never blocked from publishing; the rule still holds uniformly |
| `/api/growth-engine` | deliberately unmetered | metered at the nominal rate |

| Requirement | Status | Evidence |
|---|---|---|
| Charged before the work, never after | ✅ | Asserted on the image route (`meterAction` before `generateImage`) and the cron (`debitAcus` before `deepCrawl`). Charged-and-nothing-delivered is the one outcome that must not survive. |
| A refusal can be acted on | ✅ | 402 with the price *and* the balance — "needs 40 ACUs, balance is 12" — carried through to the JSON on every route touched. "Out of ACUs" with no numbers is a dead end. |
| Metering routes survive long enough to deliver | ✅ | The existing standing test caught two of the newly-metered routes immediately: they now debit and had no `maxDuration`, so the ~10s platform default would charge and then kill them. Both fixed. |
| A typo is not charged for | ✅ | An unknown action is rejected before the meter runs. |
| The rule holds for new routes | ✅ **new** | A standing test fails any route that can reach a provider without a wallet gate. |
| The exemption list is tiny and written out | ✅ | One entry: `/api/blog/daily`, the scheduler publishing MarketWar's own marketing blog with no customer in the request — the platform spending its own money, which the platform-wide AI ceiling already governs. The test asserts the list stays at most two, that each entry is still a real route, and that each carries a real reason rather than a label. |
| The check cannot go quietly blind | ✅ | It asserts it still finds known spenders and known meters, and that it still does **not** flag the config-only gateway route. Mutation-verified: blinding the spend list fails. |

### §61d — A label in brackets with no url behind it (2026-08-04)

Owner, reading a live customer article published by AxionOS: *"where are all the
hyperlinks, and all what was set and it looks unfinished"*.

The article contained **nine bracketed labels and no links at all** — `[Trades]`,
`[Legal]`, `[How it works]`, `[Leads]`, `[Trades · builder]`, `[Legal · terms]`,
`[Legal · escrow]`, `[Register]`, `[Contact]` — with the brackets visible to
every reader, including in both closing calls to action.

**This is a defect in §61's own fix.** The generator hands the model its menu
written as `- [Label](/path) — what it is`, and the model answered with the
**labels**, dropping the parentheses. Every check built in §61 looked for
`[text](url)`, so a bare `[text]` was invisible to all of them: not a link to
validate, not a link to strip, just words that happened to have brackets round
them. It passed enforcement, passed the audit, and reached the reader.

| Requirement | Status | Evidence |
|---|---|---|
| A bare label is seen at all | ✅ **fixed** | `bareLabels()` finds `[text]` not followed by `(`; images and reference definitions are left alone. Reproduced against the owner's article: **9 bare labels, 0 links** by the old finder. |
| It becomes the link the writer meant | ✅ **new** | `resolveBareLinks()` matches the label against the menu — by label and by path, both normalised — so `[Trades · builder]` resolves to the brand's own `/trades/builder`. All nine of the owner's resolved. |
| A label naming nothing loses its brackets | ✅ | The words stay and the sentence still reads: *"Ask about our [Warranty Cover] before booking"* → *"Ask about our Warranty Cover before booking."* No bracket reaches a reader either way, and the report says which happened. |
| The brief says it plainly | ✅ | *"Write the WHOLE link every time: [anchor text](/the-path). A label in square brackets on its own, like [Pricing], is NOT a link."* Backed by the resolver, which runs first whatever the model does. |
| The audit stops passing these articles | ✅ | `linkAudit().bare` lists them and the note leads with them: *"…the article reads like an unfinished draft."* |
| Articles already published can be repaired | ✅ **new** | `POST /api/blog {action:"repair-links"}` — **dry by default**, `apply:true` to write. A brand's post is repaired against the **brand's** menu (via `getBrandById` → its sitemap), a platform post against ours. Fixing the generator does nothing for what is already live, and asking a customer to regenerate an article they have edited is asking them to pay for our defect twice. |

**A second bug found on the way.** `linkAudit` split internal from external on
`url.startsWith("/")`. A customer's blog is hosted here and their shop is not, so
their own links arrive absolute — and every one of them was counted as outbound.
An article linking nine times to the customer's own service pages was reported as
**"This article links nowhere."** The menu is the site, so the menu now decides:
their own pages count as internal in both `linkAudit` and `enforceLinks`. An
older test asserted the broken behaviour and was corrected rather than the code.

Also: the article footer read **"1 views"**.

Mutation-verified — bare labels never resolving, unmatched brackets shipping
anyway, own pages counted as outbound again, and the policy skipping the
resolver, each caught. That last one needed the test rewritten: the first version
compared `indexOf` positions, and `indexOf` returns `-1` when the call is deleted,
so removing the resolver outright made the assertion **pass**.

## §64 — Replies never came back (2026-08-04)

Owner: *"all emails sent from the email center never been replied to the inbox
or even automatic replies from those emails sent never get to user inbox"*.

**The receiving half was fully built and completely unreachable.**
`/api/inbound/email` resolves a brand, stores the message, and the dashboard
Inbox renders it. What was missing was the one thing that makes any of it
reachable: **nothing in DNS ever said where to deliver a reply.** Every record
the platform asks a customer to publish — DKIM, SPF, DMARC, the bounce CNAME,
the tracking CNAME — exists to prove we may **send** as that domain. Not one of
them tells a mail server where to deliver anything addressed **to** it. A
recipient hit Reply, addressed it to `hello@theircompany.com`, and their mail
server looked up an MX that either did not exist or belonged to somebody else.

Worse, the send path defaulted `Reply-To` to the From address — so the default
configuration pointed every reply at exactly the address with nowhere to land.

**The fix that is not allowed.** "Point your MX at us" is the obvious answer and
the most dangerous sentence an email platform can say: a working business domain
almost always has MX records already, and repointing them does not add replies to
this platform, it **deletes the company's email**. Nothing here asks for the root
domain's MX, and a test fails any record that does.

| Requirement | Status | Evidence |
|---|---|---|
| Replies work with **no DNS from the customer** | ✅ **new** | Every brand has a signed address on the platform's own reply host (`r.<brand>.<tag>@reply.…`). It is now the `Reply-To` default. Driven through the real intake handler: a human reply lands in the brand's Inbox. |
| The address cannot be guessed | ✅ | Six HMAC characters. Without them anyone who knows a brand exists could post replies into its inbox; a wrong tag routes nowhere. |
| Their own domain is optional, and safe | ✅ **new** | One MX on `reply.<domain>` — a name that does not exist until they create it, so publishing it cannot change where any existing mail goes. Optional; without it replies still arrive at the platform address. SPF stays on the root, where it belongs and displaces nothing. |
| The customer is told where a reply will go, **before** sending | ✅ **new** | `replyVerdict()` does a real MX lookup. Verified live: `gmail.com` → reachable, a non-existent domain → *"nothing anywhere accepts mail addressed to it… you will never see the reply."* Shown under the Reply-to field. |
| An out-of-office reaches the Inbox | ✅ **fixed** | `classifyInbound` replaces a boolean with three outcomes. An auto-reply is stored **flagged**, so the customer sees it and it is not mistaken for a real reply. |
| An out-of-office never suppresses anybody | ✅ **fixed** | It used to be classed as a bounce, and the route then scraped the first address out of the body — so *"contact colleague@company.com while I am away"* could permanently suppress a live colleague who never bounced anything. Reproduced end to end; that address is now untouched. |
| A bounce says whose it was and which address died | ✅ **new** | Per-message VERP envelope sender. The failed address is matched against the addresses the brand **actually sent to**, so the answer is one of our own records rather than a guess about prose another mail server wrote. The body scrape survives only as the fallback. |

**Two bugs found by running it rather than reading it.**

*Real bounces stopped being processed.* Resolving the brand before classifying
looked tidier and dropped every delivery failure: a DSN is addressed to the
Return-Path mailbox, which is neither a brand reply address nor a brand's sending
domain, so it fell out as "no brand owns this" before the bounce branch was
reached. Classification now comes first.

*The envelope sender did not survive being lower-cased.* The first VERP version
base64url-encoded the recipient into the local part. Addresses are lower-cased
all along the path — by our own intake before anything else looks at them — and
lower-casing base64 destroys it, so every bounce silently failed to parse. It
carries a lower-case keyed digest now, which nothing can damage and which keeps
the local part inside the 64-octet limit for any length of address.

Mutation-verified: the reply falling back to the From address, an out-of-office
classed as a bounce again, the reply address accepting an unsigned tag, and the
MX being asked for on the root — each caught.

## §65 — The error boundary reported the error to nobody (2026-08-04)

Owner, from the live site: *"Something broke — the OS caught it. The error is
contained to this view; your data and campaigns are untouched. Try again."*

**That screen was the whole story, and that is the defect.** The boundary caught
the crash, showed a calm sentence, and dropped the error on the floor — no log,
no endpoint, not even the message on screen. The customer had a button and no way
to say what happened; nobody who could fix it ever learned what threw. A boundary
that swallows the error is a nicer white screen, not a fix.

It could not be reproduced from the report, and it could not be reproduced from
the code either: every dashboard surface was driven in a real browser and none of
them crashed. **Which is exactly the situation the reporting exists for.**

| Requirement | Status | Evidence |
|---|---|---|
| The screen says what threw | ✅ **fixed** | The message and the route, in monospace. *"it broke"* is not something anybody can act on; *"Cannot read properties of undefined (reading 'sent')"* usually names the thing. |
| The customer can say more than "it broke" | ✅ **new** | A **Copy details** button and a quotable reference. |
| The crash is reported | ✅ **new** | `POST /api/client-error` with message, route, digest and stack. Reporting can never throw inside the boundary — that turns a broken view into a broken tab. |
| One bug is one row | ✅ | Grouped by message + route with a count and last-seen, so a component crashing four hundred times is one row rather than four hundred. No user id, no page contents, nothing from the customer's data: fixing a crash needs what threw and where. |
| Signed-out visitors can report | ✅ | A crash on the sign-up page is the one most worth hearing about, and that visitor has no session. Rate-limited so it cannot flood the log. Reading the log is `platform_admin`. |
| Proven, not assumed | ✅ | A deliberately crashing page was built, driven in a real browser, and removed. The boundary showed *"Cannot read properties of undefined (reading 'sent')"*, *"on /crash-probe"*, and *"Quote a4421db7a4"*; the POST carried the full stack; the admin GET returned the row with `count`. |

**And the likely cause, hardened.** The crash class that produces this boundary is
an array arriving `undefined` from an API and being mapped over. The three
surfaces added most recently all did exactly that with no guard —
`EmailImprove`'s findings/providers/campaigns, the Growth Engine's hashtag sets
and posting windows, and the blog studio's link audits. All now normalise what
they were handed. A panel that renders nothing beats a panel that renders; a view
that white-screens is worse than both.

Also corrected: the Reply-to help still read *"Leave blank to receive replies at
the From address above"* — precisely the default that §64 removed for losing
every reply.

Mutation-verified. One mutation escaped first: the boundary's test grepped for
the reporting call, and a grep passes just as happily when the call is
short-circuited behind a falsy guard. It now pins the call to the start of the
effect body, and a second test drives the real route handler, because source can
lie about whether a line is reached.

---

## §66 — Reviews, followers, flyers and local groups (2026-08-04)

The owner offered to supply four things for every user on the platform and every
social platform: **Facebook positive reviews with time difference**, **local page
followers with English names**, **business flyers**, and **local group posting** —
on the reasoning that more reviews, likes and followers put a page at the top of
searches and bring more clients.

**Two of the four are built. Two are not, and will not be.**

### What is not built, and why the reason is commercial rather than squeamish

| | |
|---|---|
| **It is illegal where our customers trade** | UK **DMCC Act 2024** makes commissioning, submitting or hosting fake reviews a banned practice, CMA-enforceable to **10% of global turnover**. The US **FTC rule on fake reviews and testimonials** (16 CFR Part 465) does the same with civil penalties per violation. The liability lands on the **trader whose page carries them**. |
| **The penalty lands on the customer's page, not ours** | Meta, Google and Trustpilot all class purchased reviews and purchased followers as inauthentic behaviour. The outcomes are review-stripping, a **public "suspected fake activity" notice** on a Trustpilot profile, and Business Profile suspension. A suspended profile ranks nowhere — the opposite of what was being bought. |
| **It does not survive our own detector** | `fakeReviewRisk()` in `src/backend/reputation.ts` already flags near-duplicate text, unverified authors and incentivised language. A supplied batch staggered over time is exactly that shape, so the platform we sell would mark the customer's own reviews as manipulated. |
| **Bought followers make reach worse** | Every feed ranks by engagement **rate**. Adding accounts that never engage divides the same engagement across a bigger denominator, so the page is shown to **fewer** real people afterwards than before. This is arithmetic, not policy. |

That doctrine was already in the repo — `reputation.ts` has said *"reviews are
EARNED, never fabricated"* since it was written. §66 is the first time the
platform offers the **legitimate mechanism** the doctrine implied.

### What is built

| Requirement | Status | Evidence |
|---|---|---|
| Ask real customers, on every platform that permits it | ✅ **new** | `src/backend/review-requests.ts` — `REVIEW_PLATFORMS` covers Google Business Profile, Facebook Recommendations, Trustpilot, Tripadvisor, Yelp, Amazon, G2, Capterra, Checkatrade, each with its **own published asking policy**: encouraged / allowed-with-rules / restricted / prohibited. |
| **Yelp is refused, not silently included** | ✅ | Yelp's *Don't Ask for Reviews* policy prohibits soliciting at all, and its filter suppresses reviews it believes were solicited — so an ask can *remove* reviews you already had. `reviewLink("yelp", …)` returns an error and `planCampaign` refuses. Amazon is `restricted` — their own Request a Review button only. |
| Review links are built or validated, never invented | ✅ | Google from a Place ID, Trustpilot from the domain, Facebook from the Page name; everything else is pasted and host-checked on a dot boundary (`nottrustpilot.com` fails, `uk.trustpilot.com` passes) through `safeHref`. A guessed URL that 404s costs a review. |
| **No review gating** — enforced, not stated | ✅ | Screening for happy customers first is itself banned under the DMCC Act and the FTC rule. `RequestCandidate` carries what somebody bought and when and has **nowhere to put an opinion**; `gatingCheck()` rejects `minRating`, `happyOnly`, `sentimentAbove`, `excludeUnhappy` and 13 more at the route door **before metering**. Tested: two identical customers, one flagged delighted and one furious, come out identically. |
| Nobody is asked who did not buy | ✅ | `eligibleForRequest()` excludes zero-order contacts — *"a review from a non-customer is a fake review"* — plus too-soon, too-stale, no-channel, already-asked-inside-cool-off, and withdrawn consent, each with the reason named. |
| The burst is paced | ✅ | 50 reviews onto a profile that has had 9 in two years is the exact signal the filters exist to catch. `pacingPlan()` scales the daily rate to the profile that already exists, floor 3 / ceiling 50 — and says out loud that **no platform publishes a safe rate**, so the pace is a *convention*, not a measurement. |
| The message asks for the truth | ✅ | `incentiveRisk()` flags both incentives (banned everywhere, and by both statutes) and positive-steering (*"5 stars"*). Our own draft passes our own check — asserted in test. The Facebook draft says *recommendation*, because Facebook removed star ratings in 2018 and asking for stars there asks for something that no longer exists. |
| SMS is costed | ✅ | `smsSegments()` implements GSM-03.38 vs UCS-2: one emoji drops a segment from 160 characters to 70 and triples the per-recipient bill. |
| **Business flyers** | ✅ **new** | `src/backend/local-outreach.ts` — specified in **millimetres**, the unit a printer works in. A6/DL/A5/A4/A3 at 300 DPI with 3mm bleed **added to** the artboard and a 5mm safe box; the existing 1080×1350 social sizes are 130 DPI at A5 and come back fuzzy. Copy budgets derived from the readable width, QR floor of 20mm with the reason, and a proof-copy checklist. |
| **Local group posting** | ✅ **new** | `draftGroupPost()` for Facebook groups, Nextdoor, WhatsApp communities, local subreddits, physical noticeboards and local forums — each with the rules those groups actually enforce, an honest cadence, and advert-language detection (*"limited time"*, *"best in town"*) flagged rather than silently rewritten. |
| Nothing claims to post on your behalf | ✅ | Meta's Groups API only permits posting into a group that **installed the app**; Nextdoor has no third-party neighbourhood posting API; every group's rules require a member to post. Tools that claim otherwise drive an unofficial session and get the account restricted. Stated on the panel, not buried. |
| Followers, answered honestly | ✅ | `FOLLOWER_DOCTRINE` + `followerPlays()` — the QR on the flyer and receipt, the review requests already due, answering questions in groups without selling, posting the business rather than the catalogue, and asking at the counter. **No projected follower counts**: a forecast for a business we have not measured is the same defect as a bought follower — a number that was invented. |
| Metered like everything else | ✅ | `/api/review-requests` and `/api/local-outreach` both charge `report` (§63: no free AI action regardless). Gating is rejected **before** the charge, so a refused request costs nobody an ACU. |
| Wired to screens | ✅ | `ReviewRequests` on `/dashboard/reputation`, `LocalOutreach` on `/dashboard/local`. Both list the platform's own rules beside the draft, and the review panel shows the excluded list with the reason each person was not asked. |

Tests **885 → 902**, all passing; typecheck, layer check and build green.

**Gap recorded.** The engine plans and drafts the requests; it does not yet
*send* them — sending goes through the Email Centre / WhatsApp by hand for now,
and the "already asked" record is passed in rather than stored. A `review_asks`
ledger and one-click send are the next increment.

---

## §67 — The Gen-Z Growth Layer and the GZ-OS agent network (2026-08-04)

Two owner specs on the same day: **25 Gen-Z features in six hubs** (Create, Grow,
Earn, Play, Connect, Build) and a **20-agent always-on network** sharing one
memory, plus four "world-first" layers. Full blueprint and the per-item mapping:
`docs/ai-os/14-genz-growth-layer.md`.

**The premise is right and the build follows it literally.** "Attracting Gen Z is
not about changing the product — it's about changing how they discover, create,
collaborate, buy and earn." MarketWar has ~60 surfaces and 39 agents; sorted as
Command/Acquisition/Conversion/Intelligence/Account they are an operator's map,
and sorted as Create/Grow/Earn/Play/Connect/Build they are a user's map. Same
engines, second front door.

| Requirement | Status | Evidence |
|---|---|---|
| Six hubs over the OS that already ships | ✅ **new** | `src/backend/genz-hubs.ts` + `/api/genz` + `/dashboard/hubs` + sidebar entry. Nothing underneath changed. |
| Every hub tile goes somewhere real | ✅ | A test walks `src/app` and fails if any `href` in the map has no `page.tsx`. A hub linking to a page nobody built is worse than no hub. |
| Each hub publishes what it lacks | ✅ | Every hub carries a `notYet` list, asserted non-empty by test. A hub showing five things and silently omitting eight reads as complete when it is not. |
| Daily Challenges | ✅ **new** | `src/backend/missions.ts` — five tracks (marketing, sales, video, networking, brand), rotating by day index so everyone on a date gets the same set. Rotation, not a hash-score. |
| Progress is verified, never self-declared | ✅ | Challenges complete from **recorded deeds** — Work Library items, finished video jobs, ledger sales, Vault contacts. A scoreboard nobody verifies measures nothing. |
| Unobservable challenges are removed, not shown at zero | ✅ | Prospect outreach and review-request sending have no per-event record yet, so challenges on them are filtered out and the board names them. A challenge nobody can clear teaches people the whole board is decorative. |
| XP, levels, streaks, badges | ✅ | Published curve (×1.4 per level), DST-correct day keys via `Intl` — a fixed offset is wrong twice a year — and a streak that survives an empty *today*, because a run that dies at breakfast teaches people to stop trying. |
| Money Missions | ✅ **new** | Five missions over real windows (£100/7d, 5 sales/14d, £1,000/30d, 50 contacts, 100 prospects), measured from the ledger. A `lead` event carries £0 and does not count as a sale. |
| **"Completing challenges earns ACUs" vs the pricing law** | ✅ **conflict resolved** | An ACU is provider spend, and free ACUs collide with both the owner's 100% margin floor and §63. Resolved by funding rather than printing: `rewardCeilingAcus()` returns the largest giveaway that keeps the floor, from realised revenue and measured provider cost — `G ≤ S·(R − C(1+f)) / (C(1+f))`. Below the floor the ceiling is **zero** and missions pay XP, badges and streaks, which cost nothing. Mystery boxes and spin-to-win stay unbuilt for the same reason: a random draw cannot be funded from margin that has not been made. |
| The whole spec mapped, honestly | ✅ | All 25 features and all 20 agents mapped in doc 14 to `✅ shipped` / `🟡 engine exists, front door does not` / `📘 blueprint` / `📦 blocked, blocker named`. |

### §Gaps — conflicts recorded rather than silently resolved

1. **Prediction scores vs the hash-score ban.** The specs ask for predicted
   engagement, watch-time and retention prediction, scroll-stop probability,
   compatibility percentages, estimated sponsorship ROI and a
   "parallel-universe" simulator naming the best price and launch date before
   any spend. None of those is measurable for an account we have no data from,
   and this register has removed the same defect repeatedly (§54, the clip
   finder). **Recommended resolution — adopted in doc 14 §1.1:** score against
   the customer's OWN measured history, or ship a labelled rubric ("does the
   hook name someone in the first three words"), never a percentage produced
   from nothing. The Creator Coach, Viral Lab and Parallel-Universe Testing are
   all buildable as rubrics and replays; as oracles they would make every honest
   number on the platform suspect.
2. **Trend Hunter across TikTok / Snapchat / Discord / Twitch.** None offers a
   usable public trend API; scraping breaches their terms and the enforcement
   lands on the customer's connected accounts. **Recommended resolution:** build
   the connector where an API exists and state plainly which platforms are not
   covered, rather than inventing a trend score for them.
3. **Autonomy that commits the user.** "AI negotiates rates", auto-replying DMs
   with pricing and availability, and automated community moderation each create
   an obligation or a decision with a person on the other end. **Recommended
   resolution:** draft and queue; the human accepts. The existing `approvals`
   engine is the gate and the orchestrator must not bypass it.
4. **Health and finance in the AI Life OS.** Regulated advice in the UK. Out of
   scope until there is a licensed partner; business, career and education are
   in.
5. **An always-on agent network is a standing provider bill.** "Continuously
   observes, learns, predicts, creates" is an unbounded invoice unless each run
   is metered (§63) and capped per brand per day. Recorded as a build
   precondition, not an afterthought.
6. **The shared memory is the real proposal.** `strategy-run.ts` already chains
   seven agents by passing outputs forward, but the context dies with the run.
   The next increment is a durable per-brand fact store with **provenance** —
   `{ fact, value, source, confidence, observedAt }` — and one hard rule: a fact
   derived from a model is never promoted to "measured". Without that, one
   agent's guess becomes the next agent's premise, and a chain of ten agents
   produces a confident plan built on nothing.

Tests **902 → 915**, all passing; typecheck, layer check and build green; seven
mutations applied to the new engines and every one caught.

### §67b — The shared memory, built (2026-08-04)

Doc 14 §3.1 named the shared memory as the one genuinely new architectural idea
in the agent-network spec. It is now built rather than blueprinted.

| Requirement | Status | Evidence |
|---|---|---|
| Agents share context instead of starting from nothing | ✅ **new** | `src/backend/brand-memory.ts` + `/api/brand-memory`, wired into the agent runner: a run that supplies `brandId` receives its slice of the memory as `input.brandMemory`, and `provider.ts` builds the prompt from every input key, so it reaches the model. |
| **A model's guess can never be read as a measurement** | ✅ | `source: "measured"` is reserved to a whitelist of modules that actually count something (`contacts`, `ledger`, `email-events`, `posting-time`, `reputation`, `search-console`…). An agent naming itself as the source is refused with the reason. Without this, agent one guesses the audience is 18–24, agent three prices against it, and by agent ten the guess is the premise of a budget — the hash-score defect laundered through enough hops that its origin is invisible. |
| A caller cannot choose its own standing | ✅ | `/api/brand-memory` never reads `source` or `sourceRef` from the body. Client writes are `customer` — their belief, recorded as their belief. Measured facts come only from `action: "sync"`, which runs the measuring modules server-side and passes their own module names as provenance. Tested behaviourally: a POST claiming `source: "measured", sourceRef: "ledger"` is stored as `customer`. |
| A measurement that is not one is not recorded | ✅ | `sync` writes `posting.best-windows` **only** when `bestPostingTimes` reports `basis: "measured"`. Its market-hours fallback is a starting point, not a finding, and storing it as measured would be exactly the laundering this module exists to stop. |
| Nothing is overwritten | ✅ | A new value **supersedes** by explicit link — not by timestamp ordering, because facts arrive out of order — and the prior is kept. `history(key)` answers "why does the plan think that?". The additive-only law applies to memory too. |
| Old facts age instead of vanishing | ✅ | Per-namespace staleness (reach 30d, revenue 30d, offer 90d, audience 180d, brand 365d). A stale fact is labelled `STALE` in the preamble, never dropped. |
| The context bill does not grow with tenure | ✅ | `contextFor()` hands an agent only the namespaces it declared an interest in. A prompt that grows every month means the same action costs more every month, with the oldest facts crowding out the newest. |
| The model is told what it is reading | ✅ | The preamble labels each item `MEASURED by <module>` / `stated by the customer` / `inferred by <agent>`, and instructs: treat measured as fact, customer-stated as belief, inferred as another model's guess — *and never present one as a measurement*. |
| Disagreement is surfaced | ✅ | `conflicts()` returns any key where a model asserts something different from the measurement. The measurement wins on standing, but a model believing otherwise is itself information. |

Tests **915 → 923**; typecheck, layer check and build green. Five mutations
applied — whitelist removed, supersede link dropped, staleness disabled, the
slice widened to everything, and the route trusting the caller's claimed source
— and all five caught.

**Still ahead on the agent network** (unchanged from doc 14 §3.1): the chain
generalised beyond `strategy-run`'s seven agents, the approval boundary wired
into the orchestrator so nothing spends or publishes unattended, and the per-brand
daily cost cap without which "continuously observes, learns, predicts" is an
unbounded invoice.

### §67c — The orchestrator: chains, the approval boundary, the daily ceiling (2026-08-04)

The three items doc 14 §3.1 left open, built.

| Requirement | Status | Evidence |
|---|---|---|
| The chain generalised beyond `strategy-run`'s seven | ✅ **new** | `src/backend/orchestrator.ts` — a chain is **data**, the runner is one function, and any of the 39 agents can appear in one. Four shipped chains: *Trend to offer*, *Where the money is*, *Wake the quiet list*, *Reputation round*. `strategy-run.ts` is untouched and still runs its seven. |
| Each step gets the memory and what came before | ✅ | Every step is handed the §67b memory slice **for its own agent** — not the whole store, or a ten-step chain hands every agent everything and the prompt grows with tenure — plus the earlier steps' outputs. Asserted step by step: step one has memory and no "earlier steps"; the last has all three predecessors. |
| **Nothing spends, sends or publishes unattended** | ✅ | Every step declares its `effect`. Only `draft` steps execute; `spend` / `send` / `publish` become approval items through the existing `approvals` state machine and the chain moves on. Enforced **in the runner**, not by the chain author remembering — the execute path is unreachable for a non-draft step. Tested: the reactivation chain's send step is queued, never run, and costs 0 because nothing happened. |
| A full ceiling cannot turn "needs your approval" into "skipped" | ✅ | Queuing happens **before** the cost check, since queuing costs nothing. Otherwise an exhausted budget would silently drop the step that most needed a human. |
| **Per-brand daily cost cap** | ✅ **new** | `src/backend/agent-budget.ts` — 250 ACUs (£2.50) of unattended spend per brand per UTC day, `AGENT_DAILY_CAP_ACU` to override. Reserved **before** the work, so a failing loop cannot run forever on the grounds that failure is free. |
| The cap governs the machine, not the customer | ✅ | It applies only to `unattended: true` runs — the scheduler, not a person pressing a button. Someone who asked for forty agents has paid for forty agents and must not be refused a limit they never set; their spend is governed by the wallet and §63 metering as before. Stated on the screen, not buried. |
| Skipped steps are reported, never dropped | ✅ | A chain that quietly ran six of ten steps is a chain that lies about its output. Each skipped step returns its reason and the remaining ceiling. |
| A failed step still costs what it spent | ✅ | The provider was called; the money is gone whether or not the answer arrived. Pretending otherwise makes a retry loop free. |
| A chain cannot name an agent that does not exist | ✅ | `validateChain` runs before the first step, because a bad agent id otherwise fails halfway — after the ACUs for the earlier steps are gone. Every shipped chain is asserted valid. |
| **A chain does not write facts** | ✅ | The runner deliberately does not parse prose into memory. An extractor turns "the audience is probably students" into `audience.segment = students` with the hedge stripped, and two agents later that is indistinguishable from a measurement. The only thing recorded is that the chain ran, as `source: "agent"`. |
| Wired to a screen | ✅ | `/dashboard/chains` — each step shows what it would DO before you run it, and the run shows drafted / waiting-for-you / skipped separately. Listed in the sidebar and in the Grow hub. |

Tests **923 → 930**; typecheck, layer check and build green. Six mutations —
approval gate removed, cap result ignored, failed step billed nothing, prior
outputs not passed, reserve never refusing, unknown-agent check removed — all
six caught.

**Still ahead on the network:** the scheduler that calls the orchestrator
unattended (the cap and the approval boundary are the preconditions, and both
now exist), and per-brand chain authoring so a customer can compose their own.

### §67d — The scheduler and customer-authored chains (2026-08-04)

The last two items on the agent network. Both had the same precondition — a cap
and an approval boundary — and both are now built on top of them.

| Requirement | Status | Evidence |
|---|---|---|
| Chains run without anybody pressing a button | ✅ **new** | `/api/orchestrator/scheduled` + a `vercel.json` cron at 04:00 daily. Per-brand, per-chain schedules in `src/backend/chain-store.ts` — daily, weekly or monthly. |
| **Both paths run through one executor** | ✅ | `src/backend/chain-exec.ts`. If each route built its own dependencies the unattended path would drift — a missing approval queue there, an unmetered step here, and nobody watching that path to notice. Asserted by test: neither route constructs `queueApproval` itself. |
| Nothing is sent or published overnight | ✅ | The scheduled path inherits the §67c boundary unchanged: acting steps become approval items waiting in the morning. The approval body says so explicitly — *"It ran on a schedule overnight — nothing was sent or published while you were away."* |
| **Somebody is billed for unattended work** | ✅ | Nobody is signed in at 3am, so `brandOwnerId()` resolves the brand's owner and every step is metered against their wallet. An unattended run that charged nobody would be free AI — the §63 hole nobody would ever see. |
| Unattended spend consumes the ceiling; attended spend does not | ✅ | One boolean through `executeChain`. A customer who asked for the run is spending their own ACUs and must not be refused by a limit meant for the machine. |
| One run per cadence, even after a crash | ✅ | The schedule is marked **before** the run, asserted by source order. Marking after would retry a half-failing chain on every tick for ever — the schedule is a cadence, not a queue. |
| A new schedule is due immediately | ✅ | Somebody who just switched one on expects something to happen, not to wait a week to find out whether it works. |
| Overflow is deferred, never dropped | ✅ | Ten brands a tick; the rest are returned as `deferred`. A scheduler that silently skips half its work looks identical to one that had nothing to do. |
| The cron endpoint is not open | ✅ | `CRON_SECRET` header or a signed-in operator. There is no third way in: a route that runs agents on demand and charges somebody else's wallet is not one to leave open. |
| Customers compose their own chains | ✅ **new** | `compileChain` / `saveChain` — pick agents in order, up to 12 steps, stored per brand and listed beside the built-ins. `/dashboard/chains` has the composer and the schedule control. |
| **A customer cannot mark an acting step as a draft** | ✅ | The effect of a step comes from `effectFor(agentId, declared)` on the server. A chain may **escalate** a step to need approval; it can never de-escalate one. If the effect were taken from the chain definition, the approval boundary would be a checkbox on the thing it protects. Tested: a chain declaring `outreach-commander` as `draft` comes back as `send`, with a note saying why. |
| A custom chain cannot shadow a built-in | ✅ | The runner resolves built-ins first, so a colliding id would never run. `compileChain` renames it and says so. |
| Authoring is bounded | ✅ | 12 steps max (beyond that later agents read more context than they can use, and every step is billed) and cadence clamped to 1–90 days. An hourly chain re-reads a market that has not moved and bills for the privilege — that floor is a product decision, stated rather than tuned in private. |
| Errors arrive all at once | ✅ | `compileChain` returns every problem together. Fixing one error at a time is a form of punishment. |

Tests **930 → 939**; typecheck, layer check and build green. Six mutations —
declared effect winning over the table, authoring trusting the declared effect,
a new schedule never being due, disabled schedules running anyway, a custom
chain shadowing a built-in, and unbounded cadence — all six caught.

**The agent network as specified is now structurally complete**: 39 agents, a
shared memory with provenance, chains any of them can appear in, an approval
boundary the chain author cannot lower, a per-brand daily ceiling, and a
scheduler that respects all of it. What remains is content rather than
architecture — the individual agents named in doc 14 §3 that have no engine yet
(Community Manager, Learning Companion, Collaboration Engine), each blocked on
the connector or the policy question recorded there.

### §67e — The schedulers were not actually reachable, and one was reachable by anyone (2026-08-04)

Prompted by the owner confirming `CRON_SECRET` was already set. That is exactly
the fact worth checking against, and checking found two defects — one in the
scheduler shipped an hour earlier, one much older.

| Finding | Severity | Resolution |
|---|---|---|
| **`/api/trends/scheduled` was open to the internet** | 🔴 spend | The guard read *"if it is NOT marked `?cron=1` and has no secret, refuse"* — and `vercel.json` calls that path **with** `?cron=1`, so the marker alone satisfied it. Anyone who read the public cron config could fire a deep crawl plus three paid news searches for every enabled brand, as often as they liked, on the platform's bill. **A query parameter is not a credential.** The secret is now the gate; `?cron=1` is a label. |
| **The new orchestrator cron would never have fired** | 🟠 broken | It checked only `x-cron-secret`. Vercel sends `Authorization: Bearer $CRON_SECRET`. The job was armed and would have 401'd on every firing — silently, since a failing cron is invisible until somebody asks why nothing ran. |
| `/api/blog/daily`, `/api/seo-autopilot`, `/api/ai-visibility/scheduled` accepted a `user-agent` containing `vercel-cron` | 🟠 spend | A header anyone can set, on three routes that write a post on the strongest model, run SEO generation for every due brand, and run a visibility sweep for every due brand. Removed. |
| `/api/blog/daily` POST claimed in a comment to accept Vercel's bearer | 🟡 stale | The comment said it; the code read only `x-cron-secret`. Now true. |

**One function, five routes.** `cronAuthorised(req)` in `src/backend/guard.ts`
accepts `Authorization: Bearer $CRON_SECRET` (what Vercel sends) or
`x-cron-secret` (any other scheduler), and **nothing else**. It **fails closed**
when `CRON_SECRET` is unset: a scheduled route with no secret configured is not
"open to the scheduler", it is open.

Two existing tests had to be corrected rather than the code loosened — one
asserted that `?cron=1` was recognised as the credential, which was the hole
written down as a requirement.

Tests **939 → 942**; typecheck, layer check and build green. Four mutations —
failing open with no secret, rejecting the bearer, going back to trusting the
user-agent, and restoring the query-string bypass — all four caught.

**Separate finding, reported not fixed.** `vercel.json` points a cron at
`/api/autopilot/nightly`, but that route's GET returns documentation only — the
digest lives on POST and needs `brands[]` and a recipient in the body. That cron
has therefore never done anything. Fixing it means deciding where the brand list
and the recipient address come from on an unattended run, which is the owner's
call rather than a bug fix.

### §67f — Wiring the loose ends (2026-08-04)

Three things had been shipped with a gap recorded next to them. All three are
closed.

**1. The nightly digest cron had never done anything.** `vercel.json` pointed a
schedule at `/api/autopilot/nightly`, whose GET returned documentation; the
digest lived on POST and needed a brand list and a recipient in the body, which
a cron does not have.

The missing piece was never code — it was the answer to *who do we send it to?*,
and both obvious answers are wrong. Everyone with an account is a daily email
nobody asked for, sent from the domain every customer's deliverability depends
on. Whatever address is in the request is a relay that repeats itself for ever.

| Requirement | Status | Evidence |
|---|---|---|
| The cron does real work | ✅ | GET iterates enabled subscriptions, reads each owner's brands from the store, sends one digest each. |
| Nobody is mailed who did not ask | ✅ | `digest-subscriptions.ts` — per-owner, opt-in, default off, with a toggle on `/dashboard/autopilot`. |
| Nobody can subscribe somebody else | ✅ | The address is the signed-in account's own (`auth.email`), never the request body. In demo, where there are no accounts, the typed address is all there is. |
| A double-firing cron does not send twice | ✅ | 20-hour floor, and `markSent` runs **before** the send: a duplicate email is a complaint against the shared sending domain, and worse than a missed one. |
| Overflow is reported | ✅ | 25 accounts a tick, the rest returned as due-but-not-processed. |

**2. Review requests are sent, and the cool-off is real.** §66 shipped the
planner and recorded that it did not send. The worse half of that gap was that
`askedDaysAgo` came from the **request body** — so a caller who omitted it got a
clean slate and there was, in practice, no cool-off at all. A limit checked
against data the caller supplies is not a limit.

| Requirement | Status | Evidence |
|---|---|---|
| An ask ledger exists | ✅ | `review-asks.ts` — one row per person asked, per platform, per channel, including asks the customer sent by hand. |
| The cool-off reads the ledger | ✅ | The route no longer accepts `askedDaysAgo` at all. Asking the same person for a Google review and a Trustpilot review in one week is still asking them twice — the most recent ask decides, whatever order the rows arrive in. |
| Sending is wired | ✅ | `action: "send"` mails **today's paced batch only** (or the pacing plan is decorative), metered `email_send` per recipient before the send, and records an ask only for the messages that actually went out. |
| A refused campaign cannot be sent | ✅ | `sendable` is a gate, not a warning to click through — a platform that forbids asking, a message that steers or incentivises, or nobody eligible all stop it. |
| Other channels are honest | ✅ | SMS and WhatsApp have no sender wired: the route returns the draft and the recipients, and `action: "record"` logs them once the customer has sent them. |

**3. All nine deed kinds are observable.** The Play board filtered two of five
daily tracks off the screen because nothing recorded prospect outreach or review
requests. Both now have a ledger: a review-request deed is one entry in the ask
ledger, an outreach deed is one message that actually reached one person. The
filtering machinery stays for the next kind that stops being observable.

**Recorded, not hidden.** §7.1 of `docs/COMPETITIVE-POSITION.md` said
`email_send` is priced and charged nowhere. That is no longer literally true —
the review-request path charges it. The section is updated rather than deleted,
and the finding stands: every other send path is still free, and two paths
priced differently for the same physical act is the worst of the three options.
The test now asserts exactly that, so the day it becomes untrue the analysis
fails the build.

Tests **942 → 949**; typecheck, layer check and build green. Six mutations —
the newest ask no longer winning, an always-due digest, any string accepted as
an address, unsubscribe ignored, and two on the ledger ordering — all caught.

### §67g — The public site catches up with what shipped (2026-08-04)

Six sessions of engines had gone in without the outside of the building
changing. The gap that mattered was not marketing: the platform now runs agents
while nobody is watching and spends a customer's ACUs doing it, and **none of
the public pages said so**. Somebody deciding whether to sign up could not find
out what runs unattended, what it will never do, or what it can cost.

| Surface | Change | Why |
|---|---|---|
| `/terms` §8 (new) | **Automation, schedules and unattended work** — nothing is sent, published or spent unattended; automated work is metered and additionally capped per brand per day, reserved before each step; every schedule is off by default and can be switched off. | This is a promise about the customer's money and their customers' inboxes. It belongs somewhere binding, not only in marketing copy. Sections 8–14 renumbered to 9–15; a test now asserts the numbering stays sequential. |
| `/policies` | Two cards: **Automation & Human Approval**, **Reviews & Social Proof**. | The trust centre listed ten policies and neither of the two things a buyer now asks about. |
| `/` landing FAQs | Three new: *"Will it email my customers or post publicly without me?"*, *"How much can it spend while I am not watching?"*, *"Can you get me more reviews and followers?"* | These are the questions the product's own capabilities now provoke. The third answers the owner's own question in public, including the part that is refused and why. |
| `/` landing pillars | Acquisition gains review requests and print-ready flyers; Business Automation gains chains, schedules and the approval boundary. | Two shipped capability families appeared nowhere on the public site. |
| `/how-it-works` | Phase 7 gains the review-request flow and local outreach; **Phase 8 — Working while you are not** added. | The seven-phase story ended before the most significant new capability began. |
| `/developers` + `ENGINE_REGISTRY` | Five engines registered: Agent Chains, Brand Memory, Growth Hubs & Missions, Review Requests, Flyers & Local Groups. New category *Autonomy & Orchestration*. **38 → 43.** | The developers page prints the registry count, so an unregistered engine understates the platform in public. `docs/COMPETITIVE-POSITION.md` carries the same figure and is asserted against the registry. |

Every claim added is one the code enforces: the approval boundary is in the
runner, the ceiling is reserved before the work, the no-gating rule is a type
with no field to filter on, and the review links are built or host-validated
rather than guessed. The public-copy test was extended to assert each of them,
so the day a claim stops being true the build fails rather than the page lying.

Tests **949**, all passing; typecheck, layer check and build green.

---

## §68 — The crawl died in the browser (2026-08-04)

The owner pasted a live SiteRaid run for VeryX and asked what any of it is worth
if their own test brands get no customers. The screen answered for itself.

**On one page, in this order:** a live crawl scoring **A 90/100** with real
findings; a deep crawl reading **8 pages and extracting 530 things** — the
tagline, seven calls to action, six prices, four trust signals; and then, four
hundred pixels below, the Instant Marketing Audit reporting **0 of 36 checks
measured**, thirty-six lines of *"nothing has been crawled yet"*, an attack map
ranking nothing, and a strategy agent opening with *"I have zero verified facts
about what VeryX actually sells"*.

**Every one of those statements was true of the request that produced it.**
`src/app/dashboard/website-intel/page.tsx:241` called `{ action: "audit", site }`
with no evidence, so `instantAudit` correctly refused to score. The crawl was in
React state and nothing carried it across. The engine could always do this; the
caller never asked it to.

That is the difference between a platform that reads your site and a platform
that shows you it read your site — and it is why a customer sees literature
instead of momentum.

| Requirement | Status | Evidence |
|---|---|---|
| The crawl is kept | ✅ **new** | `src/backend/site-facts.ts` — stored per brand the moment a deep crawl runs, ownership-checked through `resolveBrandAccess`. |
| The audit uses it without re-crawling | ✅ | `"no URL"` no longer means `"no evidence"`. Re-fetching a site to learn what we already know would cost the customer time and money for nothing. |
| **Measured, on the same inputs** | ✅ **verified live** | Against a real 6-page crawl through the real engine: **0/36 → 25/36 measured, overall 59/100**, six sections with real verdicts (conversion 78 strong, social 35 urgent). Attack map: **6 of 16 ranked**, each with the count behind it — *"1 trust signal on the site"*, *"0 bundle offers across 0 products"*. |
| The score never implies a fresh look | ✅ | `provenance()` — *"Measured from the crawl of veryxjnn.com today — 8 pages read, a sample of the site rather than all of it."* Facts age and say so at 14 days. |
| A blocked fetch cannot erase a good crawl | ✅ | A 403 or a timeout is a fact about the request, not about the site. `saveSiteFacts` refuses to store a crawl that read nothing. |
| The agents stop asking what the site already says | ✅ | Nine facts per crawl into Brand Memory as `measured` by `deep-crawl` (now on the whitelist): tagline, products, CTAs, trust signals, prices, FAQs, contact. The strategy agent's *"zero verified facts"* opener is answered by the crawl the customer already paid for. |
| Declared prices and text prices stay apart | ✅ | A price in structured data is the business's own and quotable; a number in body text may be a phone number, a year or a rival's price. Merging them is how a competitor's price becomes yours. |
| Inference is not laundered into measurement | ✅ | Audience, vertical and value proposition are **not** written to memory by the crawler. They are judgements, and the modules that make them label them as judgements. |
| A store that cannot persist says so | ✅ | Without Firebase Admin the store is one instance's memory — on serverless the next request may not see it, and the audit would silently fall back to *"not measured"*. The response now names that instead of recreating the defect. |

Tests **949 → 955**; typecheck, layer check and build green. Four mutations —
a blocked crawl overwriting a good one, declared prices dropped, the audit
ignoring the stored crawl again, the tagline not remembered — all four caught.

**Still open, and named rather than buried.** Campaign Warfare has the same
shape of defect: it asks six questions and reads none of the stored facts, so a
brand with a 530-fact crawl still gets *"Vertical: generic"*, *"Audience is
broad"*, hashtags split out of the product name (`#workcentric #common
#environment`), and the price `149` scored as if it were an offer. The fix is
the same one applied here — read the facts the platform already holds — and it
is the next increment.

---

## §69 — The stopping rule, and three fixes under it (2026-08-04)

**Rule adopted by the owner: no new features until the Money Ledger has one real
entry.** It was tested immediately — the first thing written after agreeing it
was a new diagnostic engine, `money-path.ts`, which was deleted unshipped. The
rule holds or it is decoration.

Everything below is a fix to something that already exists.

### The walk

The money path was walked end to end against the real routes for a construction
brand, rather than reported on.

| Step | Result |
|---|---|
| 1 · List | ✅ 2 prospects imported, segmented (`High-intent`, `Hot lead`), consent tracked at 100%. |
| 2 · Offer | ✅ `offer-forge` returned a core offer at £149 on a **73.2% margin** plus entry/bundle/urgency variants, each margin-checked. Contract is `{action, input:{product, priceGbp, costGbp}}` — a flat body is rejected. |
| 3 · Sending domain | ✅ DKIM keypair minted, selector `mwos`, records returned to publish, status `pending` until DNS resolves. |
| 4 · Send | ⚠️ Blocked in this sandbox only. The preview correctly reads the Vault (`listContacts`) and eligibility is `email && consent !== false`; the imported contacts satisfy both. It reported nobody because **without Firebase Admin the Vault does not survive between requests**. Not a code defect — and not verifiable outside production. |
| 5 · Reply path | ✅ Reply address minted (`r.<brand>.<tag>@reply.marketwaros.com`), `intoInbox: true`, and the note explains what a blank Reply-to now does. |
| 6 · Payment | ✅ Demo link minted with the attribution metadata, and the response states exactly what `STRIPE_SECRET_KEY` changes and how the webhook records revenue. |
| 7 · Record | Untested — nothing to record without step 6 live. |

**Conclusion.** No structural break was found in the code. The path cannot be
proven from a sandbox with no persistence, no SMTP, no Stripe and no search key;
the only place it can be proven is production, with real data.

### The three fixes

| Defect | Root cause | Fix |
|---|---|---|
| **Video renders come back at 4 seconds** | There was no duration in the code **at all**. `startVideoRender` took `{ brandId, prompt }`; Veo was called with `{ instances: [{ prompt }] }` and Sora with `{ model, prompt }`. Neither was told a length, so both returned their own default. | Duration threaded from the screen to both providers — Veo `parameters.durationSeconds`, Sora `seconds`. Clamped to what each model actually does (**Veo caps a single call at 8s; Sora takes 4, 8 or 12 and nothing between**), snapped DOWN for Sora because a longer clip than asked for is a bigger bill nobody approved. When the ask cannot be met the job says so and names stitching as the way to go longer. A 400 on the parameter retries **without** it rather than losing the render. |
| **"ElevenLabs rejected the API key"** | The mapping was right that it was a 401 — but it answered every 401 with "check your key" and **threw away the reason ElevenLabs had just given**. Three of the four common causes are not a bad key. | `invalid_api_key` → replace it. `missing_permissions` → the key is valid, its scopes are wrong, *replacing it will not help*. `detected_unusual_activity` → the **free tier refusing traffic from a cloud IP**; the key is fine and only a paid plan clears it. `quota_exceeded` → the allowance is spent. An unrecognised reason passes ElevenLabs' own words through instead of substituting a guess. |
| **A new engine, one message after agreeing not to** | — | `money-path.ts` deleted before commit. |

Tests **955 → 959**; typecheck, layer check and build green.

**The pattern in all three, and in §68.** None was a missing capability. Each was
a value that existed on one side of a boundary and was never carried across, or
a diagnosis that named the wrong cause. That is what "full of features and no
customers" is made of.

---

## §70 — YouTube links, lawfully (2026-08-04)

The same paste dead-ended on three screens — Render Farm, Caption Engine, Clip
Finder — because all three share one classifier and it refused YouTube links.

**The refusal was right, and stays right for one of the three.** YouTube permits
downloading only through a download link YouTube itself displays, and the only
one of those is Studio's, for a video on your own channel. Shipping an extractor
would hand the customer a terms breach against the channel they are trying to
grow, on top of being unreliable — third-party extractors break constantly.

**But two of the three never needed the video.** The Caption Engine produces an
`.srt`, which *is* a transcript with timestamps. The Clip Finder transcribes
speech, rebuilds sentences and scores the words. Both need the WORDS — and
YouTube hands those over through its own API for a channel you own.

| Requirement | Status | Evidence |
|---|---|---|
| Read a video's words without downloading it | ✅ **new** | `src/backend/youtube-captions.ts` — `captions.list` → `captions.download?tfmt=srt` under the owner's OAuth. Nothing is downloaded. |
| It is better, not merely permitted | ✅ | YouTube captioned the **master**; transcription reads a re-encode. No 25MB ceiling, no upload, returns immediately, and **costs no ACUs** — the Caption Engine returns before the meter is reached, asserted by test on source order. |
| A human track beats speech recognition | ✅ | The clip finder scores actual words, so an ASR mishearing is a mis-scored clip. `pickTrack` ranks human tracks above ASR, then the asked-for language. Draft tracks are not tracks. |
| Auto-captions are used but labelled | ✅ | When only ASR exists it is used and the note says so — *"Auto-captions mishear names and jargon — check any clip before publishing."* |
| **"Not your video" is never reported as "no captions"** | ✅ | 403 → *"this video is not on the connected channel"*. Telling a customer to add subtitles to a video that is not theirs sends them to fix the wrong thing. |
| The parser cannot silently mis-time a clip | ✅ | Written in-repo rather than pulled in, because a loose parser fails silently — a mis-parsed timestamp produces a clip starting in the wrong place and nothing downstream can tell. Hours and minutes both count; zero-length and empty cues are dropped; YouTube's inline karaoke tags are stripped before the scorer sees them. |
| The scope's real cost is written down | ✅ | `youtube.force-ssl` added to `OAUTH_SCOPES`, with a comment recording that Google classifies it as **sensitive**: production apps need OAuth verification, and until it is granted the flow works for accounts added as **test users** on the Cloud project while everyone else sees the unverified-app warning. Owner's decision: build now, verify in parallel. |
| Render Farm is unchanged | ✅ | Rendering needs pixels and there is no lawful route to them. It points at the exact Studio page (§69). |

Tests **960 → 965**; typecheck, layer check and build green. Four mutations —
ASR ranked equal to a human track, empty cues kept, inline tags reaching the
scorer, draft tracks treated as usable — all four caught.

**Owner action, once ready to open it up:** start Google's OAuth verification for
`youtube.force-ssl`. Until then, add the accounts that own the test channels as
test users on the Cloud project and the flow works for them today.

### §70b — Whose Google account is it? (2026-08-04)

The owner asked one question about §70 — *"is the Google setting for each user or
the platform?"* — and it found a cross-tenant defect in code shipped an hour
earlier.

**There was exactly one Google refresh token for the whole platform**
(`platform_config/google_oauth`). For what it was built for that is correct:
Search Console and Business Profile read MarketWar's own properties, so one
account is the right number. Wiring YouTube captions to it was wrong twice over:

- every customer pasting their own video would get **403 → "not on the connected
  channel"** — an error about somebody else's account, sending them to fix
  something that was never broken;
- and if the platform's own Google account owned a channel, **any customer could
  read its captions** by pasting its links.

| Requirement | Status | Evidence |
|---|---|---|
| A brand's Google connection is its own | ✅ **fixed** | `brand_google_oauth/{brandId}` alongside the untouched platform doc. `getBrandGoogleRefreshToken` / `setBrandGoogleRefreshToken` / `brandGoogleConnected`. |
| **Captions never fall back to the platform account** | ✅ | `getGoogleAccessToken(scope, { brandId, requireBrand: true })`. The refusal happens **before a credential is chosen** — asserted by source order, because a test in an unconfigured environment returns null down every path and would otherwise pass for the wrong reason. |
| One brand cannot be handed another's token from cache | ✅ | The token cache was keyed by scope alone; it is now `scope::brandId`. |
| The brand travels **inside** the signed state | ✅ | It decides which account the resulting token is stored against, so as a plain query parameter anyone could redirect a consent into another brand's connection. Tampering invalidates the state rather than changing the brand. |
| A customer can connect their own channel | ✅ | The connect route was executive-only, which would have made per-brand connection impossible. Now: **with** a brand → `resolveBrandAccess`; **without** one → still executive, because that is the platform's own account. |
| Ownership is proved before a brand's token is used | ✅ | Both consumer routes call `resolveBrandAccess` before `captionsFor(videoId, brandId, …)`. |

Tests **965 → 969**; typecheck, layer check and build green. Four mutations —
falling back to the platform token, sharing the cache across brands, dropping
the brand from the signed state, captions using the platform account again — all
four caught. The first escaped once and the test was strengthened rather than
the finding dropped.

**Corrected instruction to the owner.** §70 said "re-connect Google once". That
is right for the platform connection (Search Console / Business Profile, which
now also carries the YouTube scope), and **each brand connects its own Google
account separately** for captions — `POST /api/google/connect?brandId=…`. The
Cloud project, the OAuth client and the verification are the platform's, one
set, shared. The *authorisations* are per brand.

### §70c — The button that made it reachable (2026-08-04)

Google Cloud project, OAuth client, consent screen and **verification** are all
done on the owner's side, so the platform prerequisites are complete. One gap
remained between "built" and "usable": **no customer could switch it on.**

The only Google connect button on the platform lives on `/dashboard/go-live`,
which is admin-only and connects the **platform's** account. The per-brand route
accepted `?brandId=` and nothing called it that way. A capability nobody can
switch on is a capability nobody has.

| Requirement | Status | Evidence |
|---|---|---|
| A customer can connect their brand's channel | ✅ **new** | `ConnectYouTube` on `/dashboard/video`, above the Caption Engine and Clip Finder — placed where the need arises, asserted by source order. |
| The screen knows whether it is connected | ✅ | `GET /api/google/connect?brandId=` returns `connected` + `clientReady`, ownership-checked. Both GET and POST check, or one brand could read whether another has connected. |
| The exchange is stated before the button | ✅ | Asking for a Google account is asking for trust. Read: caption tracks of your own videos. **Never** the video file — YouTube does not permit it and nothing here downloads one. **Never** posting, editing or deleting. **Yours alone** — the platform's connection is never used on your behalf. |

Tests **969 → 970**; typecheck, layer check and build green.

**The whole flow now, end to end:** brand owner presses Connect → consent carries
the brand inside the signed state → the callback stores the refresh token
against that brand → pasting a YouTube link into the Caption Engine or Clip
Finder reads that brand's own caption track, charges nothing, and downloads
nothing.

---

## §71 — Adsumo, mapped from what is publicly indexed (2026-08-04)

Owner asked for a deep dive on `adsumo.ai` to extract modules for the OS.

**The page could not be read.** `adsumo.ai` and `www.adsumo.ai` are blocked by
this session's network egress — `CONNECT tunnel failed, response 403` at host
level, so no path resolves. What follows is assembled from **search-engine
snippets of their own pages**, not from the pages themselves, and is marked
provisional for that reason. Building a module list from snippets and calling it
an extraction would be the invented-precision this register exists to catch.

### Their module set, as indexed

| Module | MarketWar today | Verdict |
|---|---|---|
| **URL → image ads** | `deep-crawl` reads the site (8 pages / 530 facts on a real run) and, since §68, **stores it**; `site-extract` returns logos, colours, fonts, CTAs and prices | ✅ have |
| **AI image ads, on brand** | `image-gateway` composites the customer's **real** logo and photos — a model is never asked to redraw a logo or spell copy | ✅ have, and stricter |
| **Dozens of variants to test** | `batch-ads` — 6 angles × 4 formats × 3 treatments from one photo | ✅ have |
| **Ad sizes** | 8 social formats + 5 print (A6–A3, 300 DPI with bleed) | ✅ have |
| **Multi-platform copy** | `warfare` — 12 platform payloads from one campaign | ✅ have |
| **AI video ads** | `video-gateway` (Veo / Sora), duration now honoured (§69) | ✅ partial |
| **UGC / podcast / street-interview styles** | — | 📦 gap |
| **50+ avatars + voiceover / lipsync** | `voice` (ElevenLabs) exists; no avatar library, no lipsync | 📦 gap |
| **Ad library — browse winning ads, recreate them** | nothing matches `winning ads` / `swipe file` in the repo | 📦 gap, **with a constraint** |
| **Localisation** | 53 market locales (timezone, currency, spelling); copy localisation goes through the gateway's `lang`, which is not a fixed list | ✅ have, differently |
| **Team collaboration** | `approvals` — state machine, immutable history | ✅ have |
| **Canvas editor for a generated ad** | browser clip editor exists; no static-ad canvas | 📦 gap |

### Three things to check against the real page before any of it is built

1. **Their own language count disagrees with itself** across indexed pages — one
   says 29, another 100+. A number that changes between a vendor's own pages is
   a number to verify, not to copy into a comparison.
2. **"Trained on millions of ads to understand what converts"** is an
   unverifiable performance claim. If MarketWar ever echoed a claim of that
   shape it would be blocked by its own `claim-guard`, so it is recorded here as
   *their* marketing rather than a capability to match.
3. **"Find winning ads and recreate them for your brand"** is the one module
   with a legal edge. Recreating a competitor's advertisement raises copyright
   in the creative and passing-off in the trade dress, and the liability lands
   on the customer who publishes it. If it is built, it must be an *analysis*
   surface — what structure, hook and offer shape are working in a category —
   never a reproduction tool. Same doctrine as `link-opportunities` ("EARN
   links, never place them") and `reputation` ("reviews are EARNED").

### Correction to an earlier statement

I told the owner MarketWar has "13 languages". That was wrong — the 13 is the
**currency/market** table in `localisation.ts`. The real figures are **53 market
locales** in `shared/market.ts`, with copy language passed to the gateway rather
than drawn from a fixed list.

**Not built.** The stopping rule stands: no new features until the Money Ledger
has one real entry. This section records the requirement set so it is not lost;
the four gaps above are candidates for after that, in the owner's priority order.

---

## §72 — The four Adsumo gaps, built (2026-08-09)

**Owner instruction: "add all of them and improve to make them powerful."** That
overrides the stopping rule recorded in §69, and is recorded here as an explicit
owner decision rather than a drift. All four gaps listed in §71 are now shipped.

Each one takes the half of the competitor's pitch that is a real product and
refuses the half that is a lawsuit or a fabricated number. The refusals are code
paths, not paragraphs in the terms.

### 1. Ad formats — `src/backend/ad-styles.ts`, `/api/ad-styles`, `AdFormats.tsx`

Twelve filmable formats: `ugc-testimonial`, `street-interview`, `podcast-clip`,
`founder-direct`, `problem-solution`, `before-after`, `unboxing`, `demo-hands`,
`day-in-the-life`, `myth-bust`, `green-screen-react`, `listicle-fast`. Each
carries a timed shot list, the camera and lighting it needs, its hook shape, its
audio posture, an ideal length, what it needs on the day, and **how it fails**.

`briefFor()` builds the gateway prompt and a verification checklist. Where the
brand has a stored crawl (§68) the brief is written against what the site
actually says — an invented fact in a shot list becomes an invented claim on
camera.

**What it deliberately does not do:** rank formats. The competitor screen puts a
predicted score beside each one; that number is generated, not measured. A test
asserts no style object carries a virality/CTR/win-rate field.

### 2. The ad canvas — `src/backend/ad-canvas.ts` + `-store.ts`, `/api/ad-canvas`, `AdCanvas.tsx`

**The gap this closes is the expensive one.** Every image path in the platform
ended with a flat picture. One typo and the only remedy was another generation,
another ACU, and a composition that was not quite the one you liked.

An ad here is a **document**: background, scrim, headline, subhead, offer, CTA
and logo as separate layers. Editing a headline edits a string — no provider is
called, no ACU is spent, and the artwork underneath cannot change. The route is
the only feature route in the platform that deliberately never touches the
wallet, and a test asserts it never gains a `meterAction` call.

Coordinates are **relative with anchors**, which is what makes resizing real:
`refit()` re-lays-out for the new placement's safe area rather than cropping. A
layer keeps its *gap from the safe edge it was anchored to*, not its raw
fraction — a story reserves its bottom 20% and a reel its bottom 35%, so `y=0.9`
is comfortably above the reply bar in one and underneath the CTA in the other.

Nine placements carry the platforms' own published safe insets (Meta Stories
14/20, Meta Reels 14/35, TikTok ~130px top / ~480px bottom / ~140px right, and
so on), in one table so they can be corrected when the apps redesign.

**The checks are measurements:**

- **Contrast is the WCAG ratio, computed.** Not an impression.
- **A scrim over an unknown photograph gives a FLOOR, not a shrug.** The photo
  is bounded by black and white, so compositing the scrim over both brackets
  every possible outcome and the worse of the two is a guarantee that holds
  whatever the picture turns out to be. "We cannot know" becomes "it is at least
  this good" — the difference between a warning you ignore and a number you use.
- **Text width is the one estimate**, says so everywhere it appears, and is
  deliberately pessimistic so it warns early.
- Claims on the artwork go through the same `claim-guard` as the copy. An
  unprovable claim is not less unprovable for being set in a nice typeface.

**Three defects the checks caught in the builder's own defaults**, all fixed:

1. Amber offer text over a 62% scrim fell to **1.64:1** on a light photograph.
   The builder now uses the accent only where it survives its own floor, and
   puts it on the CTA plate — where the colour underneath is certain — otherwise.
2. The scrim was a stored height, correct for exactly one frame. Refit to a reel
   lifted the copy 250px and it floated off the panel onto the bare photo. The
   scrim is now **derived** from the text it exists to sit behind.
3. On a 3:1 email banner, four layers that each fit their own width added up to a
   block taller than a 400px frame — its top was **outside the artwork**, where
   nothing can cover it. `compressStack()` now shrinks type and gaps together
   until the stack sits inside the safe band, stopping at the readable floor and
   reporting what still does not fit.

### 3. Presenter video — `likeness-consent.ts`, `avatar-gateway.ts`, `/api/avatars`, `PresenterVideo.tsx`

`rights-guard.ts` already asked the right questions — `face_consent`,
`voice_consent`, `model_release` — but checked them against an object handed to
it by the caller. Nothing stored a consent, so nothing could prove one, and
voice cloning stayed switched off with a note saying "gated on a consent record
we do not yet capture". **That record now exists.**

A consent is four things and all four are required: **who** (named, with the
evidence), **what** (face or voice, never inferred from one to the other),
**where and how long** (territories, platforms, an expiry — consent without a
scope is a signature on a blank page), and **revocable** (immediate, and the
withdrawal is kept, so a person who changes their mind never has to argue about
whether they did). A refusal names *which part* failed — "no consent" would send
them to collect one they already have.

The gateway (HeyGen / D-ID / Synthesia behind one door) refuses in a deliberate
order: **category first** — medical, financial, political, news-style — because
that one costs the customer their ad account rather than an ACU; **consent
second**; the **wallet last**. `gateAvatar()` is split out from `renderAvatar()`
precisely so a route can charge in the middle: charging before the gates debits
a refusal, and charging after the provider has started makes the platform pay
for a render the customer could not afford. A provider failure **refunds itself**
— "contact support" is not a refund policy. With no provider configured the
answer is a real shot brief, never a fake video.

### 4. Ad intelligence — `src/backend/ad-intel.ts`, `/api/ad-intel`, `AdIntel.tsx`

Fourteen patterns counted over the ads the customer collected, every figure with
its denominator. Above `MIN_ADS_TO_JUDGE = 8` it names the category's **norms**
(what most of them do, matchable without copying anybody) and its **open ground**
(what almost none of them do). Below it, the counts are shown and the conclusions
are not — a percentage over four ads is noise wearing a decimal point.
`WHERE_TO_LOOK` names the four public ad libraries and notes that Meta's API is
largely limited to political and social-issue ads, so commercial collection is
manual.

**Recreation is refused, as a function.** `recreationRefused()` is a code path a
future caller has to go through, and the route serves it *before* it parses the
ads — so there is no fall-through into an analysis that returns enough to rebuild
the ad anyway. An advertisement is a copyright work, its distinctive look can be
protected trade dress, and the liability for publishing a copy lands on the
customer rather than on the tool. Same doctrine as fake reviews and bought
followers.

**Nothing is called a winner.** An ad running for a long time is evidence of a
budget, not of a result; only the advertiser knows what it returned.

### Verification

Tests **970 → 993**, all passing. Typecheck, layer check and build green. Nine
mutation checks run and every one caught: scrim floor taking the best case
instead of the worst; the stack never compressed into the frame; refit leaving
`y` alone (a crop wearing a different name); SVG escaping removed; a face consent
silently covering the voice; consents leaking across brands; the
restricted-category gate never firing; the wallet charged before the refusals;
and two ads being enough to declare a category norm.

### Conflicts recorded rather than resolved silently

- **§69's stopping rule** ("no new features until the Money Ledger has one real
  entry") is suspended by the owner's instruction above. It is not deleted — if
  the owner reinstates it, it applies from that point.
- **§71 recorded the Adsumo map as provisional** because the domain was
  egress-blocked. It still is. These four modules were built against the feature
  *set* recorded there, and any correction to that map should be folded in as an
  upgrade rather than a rewrite.

---

## §73 — The Money Ledger path, and what it cost to look at it (2026-08-09)

The owner asked for the Money Ledger to have one real entry. **It does not, and
this section says so rather than manufacturing one.** Asked directly, the owner
confirmed there is no real sale yet. A fabricated figure would destroy the only
number the §69 stopping rule was ever about, so the ledger stays empty and
honest and the rule's condition remains **unmet**.

What the request was actually worth was walking the path. Two defects were in it.

### 1. One brand could overwrite or delete another brand's revenue — in production only

`/api/results` accepts a caller-supplied event `id`. It has to: a redelivered
Stripe webhook must not double-count. It proves the caller owns the `brandId` in
the body. **It never proved they owned the id.**

In `ledger.ts` the Firestore document was keyed by the bare event id:

- `recordEvent` did `results/{id}.set(event, { merge: false })`. A caller who
  owned brand A could post brand B's event id, and B's record would be
  overwritten with brandId A — at which point B's revenue vanished from
  `listEvents`, which queries `where brandId ==`.
- `deleteEvent` was worse: it **ignored `brandId` entirely** and deleted whatever
  document carried that id.

**Nothing caught it because the in-memory store was already keyed by brand and
was always safe.** The test store and the production store had different security
properties — that is the deeper defect, and it is the same shape as every other
one this project has found: a value that exists on one side of a boundary and is
never carried across.

Fixed by scoping the document key, so the class is impossible rather than
checked — brand A cannot address brand B's document, so there is no ownership
test to forget. The brand is **hashed** rather than concatenated: the first
attempt used `${brandId}__${id}`, and the test immediately caught that
`("b", "1__2")` and `("b__1", "2")` both flatten to `b__1__2`. Sanitising for
Firestore's key rules makes it worse still — `a/b` and `a_b` become the same
string. A fixed-width digest of the brand has neither problem.

Records written under the old key still **list** correctly (the query is by
`brandId`, not by key), and `deleteEvent` falls back to the legacy key after
reading the record to confirm whose it is. Deleting revenue is not recoverable,
so that path reads before it removes.

### 2. The page that asked for the entry had no way to take one

The Money Ledger said *"the moment a lead converts or you log a sale, this line
becomes your receipt"* — and offered no way to log a sale. The form lived on
`/dashboard/revenue`, and you had to know that. A capability nobody can reach is
a capability nobody has, which is exactly the YouTube-connect defect from §70.

A **Log a sale** panel now sits on the Money Ledger itself, writing through
`logEvent` — the same single path the owned form captures and the Stripe webhook
use, so there is still exactly one place revenue enters the ledger. It takes the
date the sale happened rather than stamping today, because the revenue series
would otherwise put an old sale on the wrong day.

### 3. Presenter video was mispriced against the wrong provider

`/api/avatars` metered `video`, which is costed against a **£0.10** generated
clip. A synthetic-presenter minute costs several times that, so the owner's
100%-margin floor would have been breached silently — the worst way to breach
one.

`avatar` is now its own cost line at **£0.45 per minute** (an estimate from the
providers' published rates, deliberately on the high side: under-costing breaches
the floor, over-costing only leaves money on the table — correct it against the
first real invoice and every downstream price re-derives). Charged **per minute**,
as `dub` already is, because every avatar provider bills by duration and a flat
per-render charge would overcharge a fifteen-second clip and lose money on a
two-minute one.

Owner's decision, asked and answered: **keep the standard 4× markup — 180 ACUs
(£1.80) per minute.** The alternative offered was the true net floor of 132 ACUs
(£1.32), which is exactly 100% net profit after infra, Stripe and overhead. Note
that the 2× *headline* markup would have been 90 ACUs — **below** the net floor,
so it would have breached the law despite looking compliant. `priced()` taking
the max of the two is what prevents that.

The quoted price now appears before the click (`acuPerMinute` on the GET), and
the minutes quoted in the panel use the same 150-words-per-minute rule the server
bills at, so the number shown and the number charged come from one place.

### 4. Public pages

- **Landing**: the creative block now states that a generated ad stays editable
  and that every placement is a fresh layout rather than a crop; the revenue
  block states that the Money Ledger only ever shows revenue you recorded
  against cost you entered.
- **How it works**: a new phase covers the editable canvas, the twelve filmable
  formats and the synthetic presenter's refusals. The page claimed *"Seven
  phases"* over an array of **eight** — already drifted before this change — and
  now renders `PHASES.length`, so it cannot drift again.
- **Terms §8 (new)** — *Synthetic faces and voices, and other people's
  advertising*: likeness consent recorded before use, face and voice as separate
  permissions, immediate withdrawal, stock performers under the provider's
  licence, the restricted categories, the synthetic-media disclosure duty, and
  the refusal to reproduce another advertiser's creative or to label any ad a
  winner. Sections 8–15 renumbered to 9–16.
- **Policies**: two new index entries pointing at it.
- **Plan value**: "minutes of presenter video" now appears in what each tier
  buys — 5 minutes on Growth. Modest, and honest.

### Verification

Tests **993 → 996**. Typecheck, layer check and build green. Two mutation checks
run and both caught: reverting the ledger document key to the bare event id
fails the cross-tenant test, and pricing an avatar minute as a generated clip
fails the margin-floor test — which asserts the arithmetic rather than the
number, so it survives a provider price change.

Two of this project's own tests failed on the first run and both were the tests,
not the code. One pinned the autonomy promise to *"Phase 8"* and broke when a
phase was inserted above it; it now asserts the title and additionally that the
count is rendered from `PHASES.length`. The other pinned the avatar refund to
`ACTION_COST_ACU.video`; it now asserts per-minute `avatar` billing and that
`video` is never used for a presenter render.

### Still open

**The Money Ledger has zero entries.** The path into it is now correct and
reachable, and the §69 stopping rule's condition is not met.

---

## §74 — The commission ladder, and SHARE2EARN™ (2026-08-09)

**Owner ruling:** an influencer with 10,000+ followers earns **1%**, one with
5,000–9,999 earns **0.75%**, and SHARE2EARN is capped at **0.40%** and *must
never pay more than the influencer programme*.

Asked to decide two open points, the owner expressed no preference, so they were
ruled and are recorded here as the assistant's calls, reversible in one line
each:

1. **The platform's 0.25% is constant across every band.** The promoted brand
   therefore pays 1.25% at the 10k band, 1% at the 5k band and 0.65% on
   SHARE2EARN. This preserves platform revenue and is the smallest change to a
   model that already worked.
2. **SHARE2EARN is the answer for under-5,000 followers.** It has no gate at all,
   which is exactly the product's own promise. The ACU-per-referral programme is
   *kept* alongside it — nothing was removed.

### The invariant is enforced by derivation, not by discipline

"Must never pay more" is a rule, and a rule maintained by remembering to check it
is a rule that will be broken. So `SHARE2EARN_RATE` is the **minimum** of its own
cap and every influencer band:

```ts
export const SHARE2EARN_RATE = Math.min(SHARE2EARN_RATE_CAP, INFLUENCER_RATE_5K, INFLUENCER_RATE_10K);
```

Cut an influencer band below 0.40% and SHARE2EARN follows it down automatically
rather than overtaking it. There is no second number to remember to update. A
mutation that hardcodes the rate to its cap while dropping an influencer band
below it fails the test.

### The rate had already drifted into eleven places

`0.75%` was typed into the growth page, the apply form, the influencers page, the
partner-network page, the recruitment outreach copy and two API responses — six
surfaces plus the constant itself. **A rate that lives in eleven places is a rate
that will be wrong in ten of them**, and it was already the case that the
constant and the prose could disagree without anything noticing. Every one of
them now renders from `COMMISSION_BANDS` via `ratePct()`, and a test asserts no
commission rate appears as literal text in any of those files.

### SHARE2EARN™ — what was built

`src/backend/share2earn.ts`, `/api/share2earn`, `Share2Earn.tsx`, mounted on
`/dashboard/partner-network` directly beneath the ladder that bounds it.

This is the first module in the platform that is **a payout system pointed at the
public**. Every other module can be wrong and cost an ACU; this one can be wrong
and cost real money to people who will organise, screenshot and share exactly how
they gamed it. Three rules follow, and they are why it is built the way it is
rather than the way the mockup looks:

**1. We only pay for what we count ourselves.** Of the seven earning actions in
the specification, six are payable today — clicks on our own tracked link, leads,
signups and sales in the brand's own results ledger, a post that still resolves
48 hours later, and a funded mission bounty. **"Qualified engagement" is not.** We
cannot see views on an account we are not connected to, a screenshot is not a
measurement, and paying per view is how every share-to-earn scheme in history got
farmed to death within a month. It is marked `payableNow: false` with the reason
attached, a mission that tries to reward it is **refused at creation**, and it
unlocks when the creator connects the account. Every payable action carries a
daily unit cap.

**2. A bounty that is not funded is not offered.** "Top 10 creators → £100 pool"
is a debt the moment it is displayed. `worstCasePence()` computes what the
mission owes if every expected creator hits every target, and a mission whose
budget is below that **does not publish** — it returns the two numbers and says
so. Creators will have done the work by the time the money runs out, and "the
pool was decorative" is the one thing this system cannot survive.

**3. Every number shown to a creator is counted or labelled.** The mockup's
"Match avec ton audience : 94%" and "Potentiel estimé : £18–£42" are both
fabrications for somebody with no history. `earningOutlook()` returns the
mission's **real maximum** always — that is a fact — and an estimate *only* once
the creator has finished three missions, computed from their own clicks and
conversions with the arithmetic shown. Below that it says plainly that it will
not guess.

**Creator Score™** delivers the actual differentiator. Followers are not an input
— there is nowhere to pass them. It counts conversion rate (450 of 1000),
missions finished (250), content kept up (200) and volume (100). An 800-follower
creator converting at 12% scores **945**; an 80,000-follower creator converting at
0.2% scores **329**. Below 25 counted actions it returns `null` and says a score
would be measuring luck.

**Creator Trust AI™** is a list of things that happened, not a score: self-purchase
(blocks), click duplication above 70% (blocks), shared device (human review —
households and campuses are real), deleted content, an account under three days
old, and an implausible conversion rate. Each signal states what it means, so a
stopped payout can be argued with as a fact.

**The wallet** moves money through `tracked → verified → approved → paid`, with a
**14-day hold** before an approved earning is withdrawable. Paying at "tracked" is
how these systems get drained. **Squad totals** are the sum of what members
actually earned — joining a squad creates no money, and a squad bonus is a funded
mission reward like any other.

### Built from the specification, and what was not

Built: the earning engine and its seven actions, missions with all ten kinds and
funded bounties, the wallet and its states, Creator Score, Trust AI, squads, and
the mission builder with a cost quote before publishing.

**Not built, deliberately:** the AI Creator Copilot's content generation and
"Make it mine" (the existing `content-engine`, `copywriter` and `ad-styles`
already generate this — wiring them to a mission is a connection, not a new
engine); Opportunity Radar's matching (buildable, but its headline number is a
match percentage, and it must be computed from real conversion history rather
than shipped as a hash); the Brand War Room's ROAS panel (the numbers exist in
`roi-engine` and the results ledger — needs assembling, not inventing); Creator
Career; and withdrawals, which need a payout rail (BitriPay / Stripe Connect),
KYC and a tax position before a single pound leaves the platform. The last one is
the real gate on going live and it is not a code problem.

The brand names in the specification's mockups (NIKE) are illustrations only — the
UI renders the customer's own brands, because putting a real company's name on a
mission card the platform generated would be impersonation.

### Verification

Tests **996 → 1007**. Typecheck, layer check and build green. Six mutation checks
run and all six caught: share2earn hardcoded to its cap while an influencer band
drops below it; the mission funding check removed; pay-per-view switched on; the
score computed over any volume; one finished mission treated as a history; and
the payout hold removed. Engine registry 47 → 48, with `COMPETITIVE-POSITION.md`
recounted.

---

## §75 — ProfitGuard AI™: creators earn from value created (2026-08-09)

**Owner ruling:** SHARE2EARN must be self-funding and margin-protected by design.
A company must never pay creators more than the verified economic value they
generate, and no campaign may be pushed into negative margin to create
engagement. *Creators earn from the value they create — never from the survival
margin of the business.*

`src/backend/profit-guard-economics.ts`, wired into `createMission`, exposed via
`/api/share2earn` (`economics`, `waterfall`, `health`, `classify`) and rendered
in the mission builder.

### A file was overwritten and restored

`profit-guard.ts` already existed — ProfitGuard's nine pre-scale checks for video
clips (in stock, offer valid, price correct, margin clears the floor, delivery
capacity, page and checkout working, CAC viable, AI cost controlled). It was
**overwritten** by the new economics engine, which is a breach of the
Additive-Only Law. It was restored from git and the new work now lives in
`profit-guard-economics.ts`. Both keep the ProfitGuard name and neither is lost:
one answers *"is it safe to scale this clip?"*, the other *"what can this offer
afford to pay a creator?"* — a checklist and a waterfall are different shapes.

### The owner's arithmetic, encoded as tests

Both worked examples are asserted verbatim, because a financial governor that
disagrees with the arithmetic it was specified from is worse than none.

| | Example 1 | Example 2 (Commission Waterfall) |
|---|---|---|
| Price | £100 | £120 |
| Variable costs | £55 | £75 (COGS 50, delivery 10, payment 4, tax 6, returns 5) |
| Contribution | £45 | £45 |
| Protected margin | £20 | £25 |
| **Growth pool** | **£25** | **£20** |
| Allocation | creator £15, MarketWar £5, reserve £2 | creator £12, platform £4, squad £1, reserve £3 |
| Merchant keeps | **£23** | **£25** |

A £35 creator reward out of the £25 pool is **refused**, naming the £10 it would
take out of the protected margin — exactly as specified.

Break-even ROAS 2.22× and minimum permitted ROAS 4.00× fall out of the same
numbers rather than being entered separately.

### The floor has no override, and that is a property rather than a promise

A floor with an escape hatch is not a floor, and the hurry is exactly when it
would be used. The first version of this test grepped the source for
"override" — and failed, because the module's *own prose* says it has none. It
was replaced with a **property test over 100 combinations** of price, cost and
protection level asserting that the pool always equals contribution minus
protection, that the protection is never quietly reduced, and that one penny past
the pool is always refused. That is a stronger claim than any text search.

### The one word this module refuses to misuse

**"Incremental".** A sale attributed to a creator's link is not proof it would not
have happened anyway, and classifying a buyer as "new" does not establish
incrementality either. So with no holdout every figure says **ATTRIBUTED**, and
the dashboard's caveat says plainly that it is not a measure of incremental
profit. Configure a real holdout — 300 a side minimum, below which it says it is
measuring noise — and lift is computed properly, and only then does the word
appear. A CFO who catches the product calling attributed revenue "incremental"
once will never trust another number on the screen, and would be right not to.

The owner's dashboard line is delivered, with the honest label:
`£28,420 attributed revenue · £12,789 attributed gross profit · £2,880 spent ·
£9,909 contribution retained` and `Every £1 spent produced £3.44 of attributed
contribution`.

### The rest of the specification

- **Safe Reward Ceiling™** and **campaign limits** — max CPA, max CPL, max creator
  commission, max total spend, break-even and minimum ROAS. **A lead is only
  priced when a lead-to-sale rate has actually been measured**; without one
  `maxCplPence` is zero and says why, because pricing a lead against an assumed
  conversion rate is how acquisition budgets disappear.
- **IncrementalityGuard™** — new 100%, returning-after-a-gap 50%, already-active
  10%, organic 0%, self-referral 0%. Classification is knowable from the vault;
  incrementality is not, and the module keeps the two apart.
- **Kill Switch** — CPA over ceiling and a collapse in conversion quality
  *throttle* (by enough to bring CPA back under the ceiling); ROAS under the
  minimum, a dead offer, an exhausted budget, refunds over 12% and fraud over 3%
  each *pause*. Every trip states what happened and what was done about it.
- **Dynamic commission** — a **controller, not an optimiser**. It compares actual
  CPA against the ceiling and moves toward the headroom that exists; it does not
  move at all below 20 conversions, because adjusting a price on four is reacting
  to noise. Nobody has measured a creator-supply response curve, so none is
  pretended.
- **Revenue-Locked Rewards™ / Business Survival Mode™** — a sale mission now
  defaults to `revenue_locked`: only the activity rewards need cash up front, and
  the commission is funded out of the transaction. Nothing accrues before the
  customer's money arrives, a refund or chargeback **voids** the commission, and
  split settlement releases half on payment and half after the cancellation
  window.
- **A sale reward now requires the offer's economics.** Without them nobody knows
  whether the commission fits inside the margin, and "we will work it out later"
  is how a campaign eats a business.

### Changed from the previous session

The specification revises the earlier proposal on views, and the module already
matched: `qualified_engagement` was never payable. Views now explicitly earn XP,
rank and access rather than cash — recorded here as the owner's ruling, with the
cash ladder (5 qualified clicks → £0.50, lead → £2, first purchase → £8, repeat
→ £2) as the shape the reward table should take once a brand's own economics set
the ceiling.

### Verification

Tests **1007 → 1017**. Typecheck, layer check and build green. Eight mutation
checks run and all eight caught: the pool ignoring the protected margin; the
waterfall accepting any allocation; lift claimed with no holdout; the dashboard
always saying "incremental"; a lead priced against an assumed 20% conversion;
commission tuning on any volume; money accruing before the customer pays; and a
sale commission needing no economics. Engine registry 48 → 49.

### Still open

Withdrawals remain the gate: money can be earned, held, classified and settled —
it cannot leave. That needs a payout rail, KYC and a tax position, and it is not
a code problem.

---

## §76 — GrowthGuard™: the 5% law (2026-08-09)

**Owner ruling:** the total cost of SHARE2EARN must never exceed **5% of the
verified economic value it generates** — an absolute system ceiling, not
something a merchant can override. And the rate actually used is
`MIN(5%, merchant safe rate)`, so a thin-margin business runs at a fraction of
it automatically.

Added to `profit-guard-economics.ts`; exposed as `/api/share2earn` action
`capacity`.

### The owner's ladder, reproduced exactly

| Verified contribution generated | Maximum total spend | Merchant retains |
|---|---|---|
| £0 | £0 | £0 |
| £2,000 | £100 | £1,900 |
| £10,000 | £500 | £9,500 |
| £100,000 | £5,000 | £95,000 |

And the £500 splits to the owner's shares to the penny: creators £300,
MarketWar £75, referral and squad £50, refund and fraud reserve £50,
performance bonuses £25.

### The three locks

1. **Incrementality** — only value attributed to SHARE2EARN counts, and where a
   holdout exists only measured incremental value counts.
2. **GrowthGuard 5%** — the whole ecosystem, creator rewards and MarketWar's own
   fee included, cannot consume more than 5% of that value.
3. **Survival Floor** — the merchant names the share of contribution it must
   retain, and if even 5% would breach it the rate drops further. Verified: a
   98% floor pulls a 5%-capable offer down to 2%.

The ceiling is asserted **behaviourally over 100 combinations** of cost,
protection and survival floor — the rate is never above 5% for any of them.

### A grep was removed, again

The first version of that test also grepped the source for a scaled ceiling and
**failed on an unrelated local variable named `ceiling`** inside
`tuneCommission`. That is the second false positive from text-searching this
codebase for a property (the first was §75's "override" check finding the
module's own documentation). Both are now behavioural. Exercising the function
over its inputs proves the thing itself rather than a spelling of it, and this
is worth remembering the next time a source grep looks like a cheap assertion.

### A discrepancy in the specification, named rather than silently resolved

The instruction says the 5% is computed *"against verified incremental
contribution, not simply gross sales"* — and separately gives an example where a
£100 purchase yields £5 of allowance, which is **5% of revenue**. On any offer
without a 100% margin those are different numbers.

This implements the **principle (contribution)**, because it is the stricter of
the two and it is precisely what protects a thin-margin business: 5% of a
supermarket basket's revenue would be most of its profit, while 5% of its
contribution is pennies. The revenue-equivalent is reported alongside as
`equivalentPctOfRevenue` so the difference is visible rather than buried, and
`basis` switches it in one place if the owner prefers the looser reading.

### And one on "verified incremental"

Computing capacity strictly on *measured incremental* contribution would require
every merchant to run a holdout, which would leave most SMEs with zero capacity
and no way to start. So capacity is computed on **attributed** contribution by
default, labelled as such, with the caveat stating plainly that this is the more
generous reading and that configuring a holdout makes it stricter and truer. When
a holdout exists the figures switch to incremental automatically.

### Outcome-funded, not budget-funded

`capacityFromTransaction` adds capacity one settled transaction at a time — a
£93 contribution adds £4.65 and the other £88.35 stays with the merchant.
`canCommit` refuses new liability once the ceiling is reached and offers the
partial amount that remains rather than going silent. Generate nothing and the
performance-funded budget is nothing; there is no starting balance to burn
through.

This is why a creator is shown **"earn up to £X from verified results"** rather
than a guarantee: the reward exists only once the commercial result has funded
it.

### Verification

Tests **1017 → 1023**. Typecheck, layer check and build green. Five mutation
checks run and all five caught: the 5% ceiling dropped; the Survival Floor
ignored; committed spend not reducing remaining capacity; any commitment granted
regardless of capacity; and rounding over-allocating the split.

One test from §74 was corrected rather than the code: `an unfunded bounty never
publishes` was pinned to a sale-bearing mission, which §75 made refuse *earlier*
and for a stricter reason (a sale reward now needs the offer's economics). It now
tests the funding check on activity rewards, which is what it was always about.

---

## §77 — SHARE2EARN at 0.5%, on verified eligible sales (2026-08-09)

**Owner ruling:** a fixed **0.5% creator commission on verified product sales**,
with the 5% GrowthGuard ceiling retained as the business-protection layer. Two
different rules: 0.5% is what a creator earns, 5% is what the whole module may
ever cost.

### The rate, and the invariant surviving it

`SHARE2EARN_RATE_CAP` moves 0.40% → **0.50%**. The §74 rule — SHARE2EARN never
pays more than the influencer programme — **still holds at the new number**
rather than being weakened to accommodate it: 0.5% sits under the 0.75% band, and
the derivation `Math.min(cap, INFLUENCER_RATE_5K, INFLUENCER_RATE_10K)` is
unchanged. A mutation raising the rate to 0.8% fails four tests.

The owner's table reproduces to the penny — £100 → £0.50, £1,000 → £5,
£10,000 → £50, £100,000 → £500.

### Net Eligible Sale Value

The 0.5% is **not** taken off the checkout total, and the difference is not
pedantry: it is the difference between a commission the merchant can afford and
one that quietly pays creators out of VAT it is holding for HMRC.

The owner's example computes exactly: a £120 checkout of £100 product + £15 tax +
£5 delivery yields **£100 eligible → £0.50**. Tips and gift cards are excluded on
the same principle. A refund reduces the eligible value proportionally; a
cancellation voids it.

### An unsafe product is refused, never quietly re-rated

This is the owner's ruling and it is the right one. Where 0.5% would make a
transaction commercially unsafe, the product is marked **⛔ ineligible** rather
than the creator's rate being silently reduced. *"If you advertise 'Earn 0.5%',
creators should actually receive 0.5% on every product MarketWar marks eligible."*

`productEligible()` refuses for four distinct reasons, each named:

- no commissionable product value in the sale;
- the product contributes nothing after variable costs;
- 0.5% exceeds the **ProfitGuard acquisition pool** — the owner's 0.3%-margin
  case, where £0.50 of commission is asked from £0.30 of available margin;
- 0.5% exceeds the **GrowthGuard allowance** for that transaction — which binds
  independently, because 0.5% *of revenue* can exceed 5% *of contribution* on a
  thin-margin product even when the acquisition pool looks ample.

Where the commission consumes the entire GrowthGuard allowance the product stays
eligible but says so, since nothing is then left for the platform fee, reserve or
bonuses.

### XP, so gamification does not eat the margin

0.5% on a cheap product is small, and the temptation is to top it up with cash
for views and shares. That is the merchant's margin being spent on engagement
that produced no sale — and a channel that does that gets switched off, which
costs every creator on it.

So **only a verified sale earns cash.** Views (from a connected account only),
shares, qualified clicks, daily streaks and verified leads earn **XP**, and XP
buys rank and access: Rookie → Creator → Rising → Pro → Elite → Icon, each
unlocking higher-value campaigns. Progression the platform can give away for
nothing and a creator genuinely wants.

### Verification

Tests **1023 → 1027**. Typecheck, layer check and build green. Five mutation
checks run and all five caught: commission taken on the checkout total including
tax and delivery; an unaffordable product marked eligible; the GrowthGuard check
on eligibility dropped; views earning cash again; and the rate raised past the
influencer band.

### Not yet built from this ruling

- **Fixed 0.5% vs "up to 0.5%"** as a merchant setting. Only *fixed* is
  implemented, because the owner's own reasoning argues against the variable
  form — an advertised rate that silently becomes smaller is worse than an
  ineligible product. The switch is a one-line addition if wanted.
- **Creator Copilot's performance coaching** ("your 7–10 second videos convert
  2.4× better") — the numbers exist once a creator has history; the analysis is a
  connection to `creative-learning`, not a new engine. Its estimated-opportunity
  figure must go through `earningOutlook`, which already refuses to forecast
  without three finished missions.
- **Withdrawals** remain the gate. Money can now be earned, classified, held,
  capped and settled — it cannot leave. Payout rail, KYC and a tax position, and
  it is not a code problem.

---

## §78 — Withdrawals: not employees, paid gross, fees passed through (2026-08-09)

**Owner ruling:** creators are not employees. They can request payout wherever
they are. On top of the commission, the **processing fee of whichever withdrawal
platform they choose** is charged, and **3% of that charge** is applied as an
admin fee.

`src/backend/payout-fees.ts`, exposed as `/api/share2earn` actions
`withdraw-quote` and `tax`. It builds on `creator-engine.ts`, which already
routes Africa to BitriPay and everywhere else to Stripe and keeps the release
ledger idempotent — that path is untouched.

### The 3%: a reading chosen, and the other one named

*"the processing fee based on the withdraw platform they want and a 3% of that
charge as admin fees"* — "that charge" reads most directly as the **processing
fee**, and that is what is implemented. On a £2 PayPal fee the admin fee is
**6p**.

The other reading is 3% of the **withdrawal**: £3 on £100 — fifty times more, and
six times the 0.5% commission the creator earned to get there. Given how hard the
rest of this system works to protect the smaller participant, the smaller reading
is the one that fits. **It is one constant and one flag**: `ADMIN_FEE_BASIS`
switches it, and a mutation flipping it fails the test, so the choice is
deliberate rather than accidental either way.

### Tax: nothing withheld, but a real duty

Not employees means **no income tax, no National Insurance, no PAYE** — creators
are paid gross and declare their own earnings where they live.

That is **not** the same as the platform having no obligation, and this is the
part worth flagging because it is easy to miss. Since January 2024 the UK's
reporting rules for digital platforms (the OECD model rules; DAC7 in the EU)
require a platform paying sellers for services to **collect their identity
details and report annual earnings to the tax authority**. So the platform's duty
is to know who it paid and hand HMRC and the creator the same number — not to
deduct anything from it. `taxPosition()` states the platform's obligations, the
creator's own, and carries a plain "this is not tax advice" disclaimer.

### Withdraw wherever you are

Nine rails: Stripe bank and instant-to-card, PayPal, Wise, local bank, and
mobile money on **M-Pesa, Orange Money, Airtel Money and Africell** through
BitriPay. Mobile-money minimums are deliberately **£2** rather than the £5–£20 of
the bank rails, because small frequent withdrawals are the norm on those rails
and a high floor there would exclude exactly the people the module is for. A
rail that does not serve the creator's country is refused with the ones that do.

Fee figures are **estimates from published rates, deliberately on the high side**
— quoting a creator less than they are charged is the one error here that
produces an angry person with a screenshot. Correct against the first real
settlement report and every quote re-derives.

### Fees can never eat the withdrawal

Three guards, in order:

1. **Per-rail minimum** — below it the quote names the minimum and points at a
   rail with a lower floor.
2. **A warning above 10%** — it warns rather than blocks, because the choice
   stays the creator's.
3. **A hard refusal at 25%** — a withdrawal where fees take a quarter of the
   money is refused rather than offered.

The test asserts the property that actually matters: **at every rail's own
minimum the fee share is already below the refusal threshold**, so the minimums
are what does the work and the 25% rule is a backstop against a future pricing
change. A first attempt tested the refusal directly and failed — the minimum
guard fired first, with a more useful message. That is the design working.

Every quote is itemised before confirmation, saying **whose** each charge is —
the rail's or ours — because "fees" as a single number is how a pass-through gets
mistaken for a margin. And where another rail would leave the creator with more,
the quote says so unprompted.

### Verification

Tests **1027 → 1032**. Typecheck, layer check and build green. Five mutation
checks run and all five caught: the admin fee charged on the withdrawal instead
of the processing fee; 20% withheld from a non-employee; the per-rail minimum
removed; any rail offered in any country; and the cheaper alternative hidden.
Engine registry 49 → 50.

### Still open

The rails are **priced and quoted but not yet connected** — `railConfigured()`
reports which are live from their env keys, and none is set. Connecting them
needs the provider accounts, and the identity collection the reporting rules
require needs a KYC step before a first payout. That is the remaining gate, and
it is commercial and legal rather than a code problem.

---

## §79 — Payouts activated: the identity gate and the money leaving (2026-08-10)

**Owner instruction:** activate the rails and the KYC gate.

Two halves, and they are different in kind. The **code** is done — the identity
gate, the real provider adapters, execution with idempotency, and the annual
report. The **accounts and keys** are not something an assistant can create;
that part is listed at the end as the owner's step, and it is now the only one.

`src/backend/payout-identity.ts`, `src/backend/payout-execute.ts`, exposed as
`/api/share2earn` actions `identity`, `withdraw`, `payout-history`,
`verify-identity`, `screen-identity`, `tax-report`.

### The identity gate

Two separate reasons it is mandatory, kept apart because they fail differently:
the **reporting rules** (missing details are not a gap in a form, they are an
unfileable return) and **paying the wrong person** (a payout is irreversible on
most rails and instant on some, so an unverified account is one a phished
password can drain).

`submitIdentity` validates shape and refuses with the field named: a single-word
name, an under-18, an implausible or wrongly formatted date of birth, an alpha-3
country code, a missing address, and a tax reference that does not match the
country's format. Where there is genuinely no reference, a **stated reason** is
filed in its place — a return with a blank where an identifier should be comes
back.

It **does not pretend to verify**. Confirming a human matches a document is an
identity provider's job; with none configured the record stays unverified and an
administrator confirms it by hand, recorded against their name. Sanctions
screening is the same: named, required, and left as an explicit unmet dependency
rather than faked with a substring match.

The record is **encrypted at rest** per account using the platform's existing
AES-256-GCM helper, and the tax reference goes in without coming back out — the
route never echoes it to the browser.

### A mutation survived, and it found a real hole

The gate was an enumeration of states to reject: `not_started`, `rejected`,
`submitted`. A mutation deleting the `submitted` arm **still passed**, because
the sanctions check below happened to catch the same record.

Two guards masking each other is two guards you cannot reason about — and the
hole was real: **a record that WAS screened but NOT verified would have gone
straight through.** The gate is now a positive check (`state !== "verified"`
blocks), so a state nobody has thought of yet fails closed, and the test asserts
the screened-but-unverified case explicitly.

### Execution

The order is fixed and every step refuses rather than warns: **identity →
balance → fee quote → claim → send → settle or release.**

The **claim is written before the provider is called**. A double click, a retry,
or a timeout the client never saw finds the claim and returns the first result
instead of sending again; the idempotency key is derived from creator, rail,
amount and a caller-supplied `requestId`, and is passed to the providers'
own idempotency headers as well, so a retry is safe at both layers. A **failed
payout releases the balance immediately** — money locked behind a failure is a
support ticket and a lost user. Only `sent` attempts count as money out.

And the rule that matters most: **nothing is ever reported as sent without a
provider reference.** With no key configured it says so plainly and names the
missing variable. A network failure is reported as genuinely ambiguous rather
than guessed at, because the provider may or may not have received it.

Adapters written against the providers' real endpoints: Stripe Connect
transfers, PayPal Payouts, Wise transfers, and BitriPay for M-Pesa, Orange,
Airtel, Africell and local bank. Deliberately dumb — build the request, read the
reference, return a typed error. **No retry loops inside them**: a retry on a
payout endpoint is how somebody gets paid twice.

### A detail worth keeping

The first probe used `QQ123456C` as a National Insurance number and the
validator rejected it. That is HMRC's own **example** value, and it is
deliberately invalid — real NI numbers never begin with Q. Accepting it would
have filed a return with a placeholder in it. The rejection is now a test.

### Verification

Tests **1032 → 1040**. Typecheck, layer check and build green. Nine mutation
checks run: the identity gate skipped; the idempotency claim never read; the
balance check removed; a missing provider key no longer blocking; failed
attempts counted as paid; sanctions screening dropped; a submitted record
treated as verified; under-18s payable; and one that initially survived and led
to the fix above. Engine registry 50 → 52.

### What is left, and it is the owner's

**Everything below needs an account that only the owner can open.** The code is
inert without them and says so rather than failing oddly:

| Variable | For | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY` | Bank and instant-to-card payouts; also satisfies the identity-provider check via Stripe Identity | Stripe dashboard → Developers → API keys. Connect must be enabled for transfers. |
| `PAYPAL_CLIENT_ID` | PayPal payouts | PayPal Developer → app credentials. Payouts must be approved on the account. |
| `WISE_API_TOKEN` | Wise transfers | Wise Business → API tokens. |
| `BITRIPAY_API_KEY` | M-Pesa, Orange, Airtel, Africell, local bank | BitriPay account. |
| `SANCTIONS_API_KEY` | Screening before a first payout | Any screening provider; the gate blocks until it is set or an administrator records the screening by hand. |

Two things beyond the keys, both commercial rather than technical: **Stripe
Connect onboarding** for each creator (they need a connected account before a
transfer has a destination), and a decision on **who signs off a manual identity
verification** while no identity provider is connected — the code records the
administrator's id against the decision, so it needs to be a named person.

---

## §80 — The creator payout dashboard (2026-08-10)

`src/components/CreatorPayouts.tsx` on `/dashboard/earnings`, with a sidebar
entry. Deliberately **separate from `/dashboard/partner-network`**, which is the
brand's view — programmes, commission ledgers, who to recruit. This is the other
side of the same deal: what one person earned and how they get it out. Mixing
them on one screen makes both harder to read.

### The one thing here that is not cosmetic

**The `requestId`.** The server refuses a duplicate withdrawal by claiming an
idempotency key derived from (creator, rail, amount, requestId) *before* it calls
the provider. That protection is worth **nothing** if the browser mints a fresh
id on every click — two clicks would be two different withdrawals and the person
would be paid twice.

So the id is generated once per intended withdrawal and held in a `useRef`. A
retry after a failure or a timeout reuses it, which is what makes it a retry. It
is re-minted only when the withdrawal genuinely changes — a different rail,
amount or destination — or after one has succeeded. Two mutations confirm it: a
fresh id per click, and a signature that ignores the amount and destination.

### A defect caught while writing the page

The first version passed `creatorId={activeBrand?.id}`. **A creator is a person,
not a brand.** That would have filed one person's tax details against a company,
and in demo mode — where the server falls back to the supplied id because there
is no session — paid out against the wrong account entirely. It now uses
`useAuthUser()`, and a test asserts the earnings page contains no reference to
`activeBrand` at all.

### What the screen does

- **The money first**, because it is what they came for: available, pending, paid
  out, lifetime — each with a sentence explaining which is which, since "pending"
  meaning "yours but the refund window has not closed" is not obvious.
- **The gate as a blocker plus a fix**, never a bare refusal. "Payouts closed"
  with no next step is how a support queue gets built.
- **The identity form**, with the reason it is asked stated up front and
  "nothing is deducted from what you earn" said plainly. The field that failed
  server-side is outlined. The tax reference is cleared on save and never
  re-displayed.
- **The withdrawal**, with every fee itemised and labelled *theirs* or *ours* —
  "fees" as one number is how a pass-through gets mistaken for a margin. A rail
  that is not connected says so rather than failing oddly on click, and the
  cheaper alternative is offered as a **button** rather than a note.
- **History including failures.** A payout that vanished without a trace is what
  destroys trust fastest, so failed attempts stay visible with their error.

### No money arithmetic in the browser

A test asserts the component contains no fee calculation and none of the payout
constants. The server computes every figure; a second copy of a payout rule in
the browser is a second place for it to be wrong — in money, about somebody's
wages.

### Verification

Tests **1040 → 1043**. Typecheck, layer check and build green (`/dashboard/earnings`
5.39 kB). Two mutation checks run, both caught.

---

## §81 — The brand's side, one payout path, and countries with no tax reference (2026-08-10)

Three things: the brand-side view and approvals the owner asked for, and two
answers to the questions asked while it was being built.

### 1. Brand-side payouts and approvals

`src/backend/payout-approvals.ts`, `BrandPayouts.tsx` on
`/dashboard/partner-network`, above the engine that generates the bill.

**The line this draws is the whole design.** A commission is EARNED — a creator
posted, somebody bought, the sale settled. At that point it is not the brand's
money, so there is no approve button it waits behind. A brand can do exactly two
things:

- **Dispute** a specific earning, with a reason from a fixed list — refunded,
  charged back, fraudulent, self-referral, policy breach, duplicate, wrongly
  attributed. The serious three require an explanation, because they affect the
  creator's record and not just this payment. The creator is told which reason.
- **Release early**, paying before the hold expires. Always available, because it
  only ever moves money toward the creator.

`withhold()` is exported as a **function that refuses**, so a future caller
reaching for "just hold it" has to go through it and read why not: *an earned
commission a payer may keep at will is not a commission, it is a tip; creators
price that in within a week and the good ones leave.* The API exposes it as a
real endpoint returning 400.

The dispute window closes after the hold plus a fortnight. A brand that can
reopen a payment from a year ago has not got a review process, it has an option —
and a creator cannot plan around a balance that might be clawed back
indefinitely. Already-paid money cannot be disputed at all; that is a
conversation, not a state change.

The screen leads with **"What you owe your creators"** and the copy says plainly
that this is not the brand's money. The queue is framed as *a chance to catch a
refund before the money leaves*, not a gate.

### 2. "Is this every payout the OS makes?" — it was not, and that was a defect

**No.** The platform had grown **two payout paths**, and the weaker one paid
more:

| | Growth / influencer programme | SHARE2EARN |
|---|---|---|
| Rate | 1% and 0.75% | 0.5% |
| Identity gate | **none** | required |
| Fee quote | **none** | itemised |
| Destination | **none — it reported a release without knowing where the money went** | required |
| Idempotency | broken (below) | claimed before the send |

Its idempotency was not merely absent, it was **wrong in a way the comment
denied**. The release record's id was hashed over the timestamp, so two clicks a
second apart produced two different ids and two records — and because both calls
read the payable balance before either wrote, the race paid twice. The comment
above it said "a retry/double-click can never re-release the same funds".

`requestPayout` now delegates to `executePayout`. Same signature, same return
shape, and every rule that protects a SHARE2EARN withdrawal protects a growth
commission. Where no `requestId` is supplied the fallback is derived from
**creator and amount, never the clock**, so a double click on the same payable
balance is one withdrawal. A mutation reintroducing the clock fails the test.

### 3. Countries with no personal tax reference

The form asked everyone for a tax reference and, failing that, a free-text
reason. For somebody in Kinshasa that is **a question with no correct answer**:
the DRC does levy personal tax, but it is largely collected at source from formal
employment, and an individual outside that system has no number to give. Several
countries issue none at all.

The reporting standard already anticipates this, so the module now knows three
situations per jurisdiction:

- **Issues** (GB, IE, FR, DE, US, NG, KE, GH, ZA) — a reference is required and
  format-checked.
- **Rarely held** (CD, TZ, UG, ZM, SN, CI, CM, SL) — it asks, *explains why the
  answer is often none*, and accepts a code. The refusal says this is "a normal
  answer, not a problem".
- **Not issued** (AE, QA, BH, KW, BS, MC, VU) — **the question is not asked at
  all.** The jurisdiction fact is what gets reported.

In place of a number the return carries one of four filable codes rather than a
sentence somebody typed: *jurisdiction issues none, not required to hold, applied
for, unable to obtain.* A bare "n/a" is refused — a return needs something it can
file. The report row prints the code's label and the jurisdiction note, never a
raw slug.

**And nothing is withheld anywhere.** A creator in Kinshasa is paid gross exactly
as one in Leeds is; what they owe locally is between them and their own
authority. The tax statement now says the right thing for where the person
actually lives.

### Verification

Tests **1043 → 1052**. Typecheck, layer check and build green. Ten mutation
checks run across the three pieces, all caught — including the clock-dependent
idempotency key and a no-TIN country being asked for a reference anyway. Engine
registry 52 → 53.

One §79 assertion was updated rather than the code: the report row now reads
"NO TIN — <code label> (<jurisdiction note>)" instead of "NONE PROVIDED".

### §81 addendum — verified, and locked in

Asked to confirm that the growth programme and SHARE2EARN now share a payout, the
claim was checked rather than asserted. **Every call to a payout provider lives in
`payout-execute.ts`** — four `fetch`es, one file — and `executePayout` has exactly
two callers: `creator-engine.requestPayout` and the SHARE2EARN route.

**Same mechanism, different rates**, and both halves now have a test:

| Shared | Kept separate |
|---|---|
| Identity gate (verified + screened) | Rate: influencer 1% / 0.75%, SHARE2EARN 0.5% |
| Fee quote, rails, minimums, the 25% refusal | What triggers the earning |
| Idempotency claim before the provider call | Follower gate: 10,000 on the growth programme, none on SHARE2EARN |
| Release-on-failure and the attempt ledger | £20k cap-and-recycle vs GrowthGuard's 5% ceiling |
| Paid gross, no withholding, same reporting | Product eligibility (SHARE2EARN only) |

A structural guard now enforces the first column: a test walks `src/backend/` and
every API route and fails if any file other than `payout-execute.ts` calls a
payout endpoint. This defect class has already occurred once — the platform grew
a second path and the weaker one paid more — and a third would have been found
the same way, after it had paid somebody twice. A mutation adding a direct Stripe
call to `creator-engine.ts` fails the test.

Tests **1052 → 1054**.

---

## §82 — The creator-earning article cluster (2026-08-10)

**Owner instruction:** SEO blogs with heavy hyperlinks and backlinks, promoting
SHARE2EARN, the growth and influencer programmes, and the Gen-Z features.

`src/shared/seo-articles.ts` — seven articles merged into `blog-store`, so the
existing article route, the blog index, the related-post logic and the sitemap
all pick them up with no changes to any of them.

### Internal linking: built

One **pillar** — *Creator earning programmes* — and six **spokes**: SHARE2EARN,
the influencer bands, payout economics, getting paid with no tax reference,
ProfitGuard/GrowthGuard, and the Gen-Z layer.

**44 internal links, none dead.** Every spoke links up to the pillar and across
to its siblings; the pillar links down to all six. A test walks every `](/...)`
in every article and fails on a link whose page does not exist — a cluster whose
links 404 is worse than no cluster, because it wastes the crawl budget it was
built to concentrate. Three mutations confirm it: a dead link, a spoke that stops
linking to the pillar, and an outbound link traded into an article.

Relations in the cluster are **declared, not inferred**. The existing
`relatedPosts` scores keyword overlap, which would rebuild the hub-and-spoke into
a different and weaker graph by accident. The related block also stops claiming
word overlap when that is not the reason — it says "part of this guide".

Added to the article route: **FAQPage** and **BreadcrumbList** structured data
alongside the existing BlogPosting, plus keyword metadata. The FAQ entries are
real questions the articles answer, so this is the rich result the pages were
written for rather than markup bolted onto prose that never addresses them.

The sitemap weights them: **0.9 for the pillar, 0.75 for spokes**, against 0.6 for
an ordinary post.

They are **code rather than database rows** on purpose. A page that exists only
when Firestore is configured is a page missing from the sitemap on every
deployment that is not — and these are the pages the site is meant to rank for. A
stored post with the same slug still wins, so any of them can be superseded by an
edited version without a deploy.

### Backlinks: not built, and deliberately

**A backlink is a link from somebody else's site.** Buying, exchanging, planting
or generating them is a Google Search Essentials spam violation that demotes a
domain rather than lifting it — and it is the exact doctrine this platform
already sells in `link-opportunities.ts`: *EARN links, never place them.*
Manufacturing them here would have contradicted the product's own advice while
risking the domain it was meant to promote.

What was built instead is the half that is real. Two of the seven are shaped as
**linkable assets** because they answer questions with no good published answer:

- **Payout economics** — an itemised fee comparison across nine rails including
  African mobile money. Almost nobody publishes the mobile-money side.
- **Getting paid with no tax reference** — a plain-English answer to what DAC7
  and the OECD model rules require when a jurisdiction issues no individual TIN.
  There is very little good English-language writing on it.

`LINKABLE_ASSETS` names, for each, why it is citable and who would plausibly cite
it. That is an outreach list — telling people who write about the subject that
the page exists — not a link scheme. A test asserts no article contains an
outbound link at all, so nothing is being traded.

### Verification

Tests **1054 → 1061**. Typecheck, layer check and build green. Three mutation
checks run, all caught.

---

## §83 — Public pages caught up with the creator programme (2026-08-10)

Everything from §74–§82 was live in the product and largely absent from the
public site. The gap that mattered was not marketing.

### Terms §9 — the real gap

**The platform now pays real money to real people, takes a fee, holds balances
and can dispute an earning — and the terms said none of it.** That is not a
marketing omission, it is an unenforceable relationship: a creator had no written
statement of what they earn, when it becomes theirs, what a withdrawal costs, or
what happens to their tax.

New section 9, *Earning and being paid as a creator*, covering:

- **Not our employee, worker or agent** — stated first, because everything else
  follows from it.
- The rates, and that eligible value is the **product only** — tax, delivery,
  tips and gift cards excluded.
- **Earned, not granted**: a brand may dispute only on the recorded grounds and
  is named to the creator; it cannot withhold a settled, undisputed commission,
  and the dispute window closes after 28 days.
- **Ineligible products** rather than a quietly reduced rate.
- Identity before a first payout, and why — the reporting duty *and* protecting
  the balance from anyone who obtains a password. Payouts from 18; a balance
  below that is held and does not expire.
- The fee: the provider's processing cost plus **3% of that fee, not of the
  withdrawal**, itemised before confirmation, with the 25% refusal.
- **Paid gross.** Nothing withheld anywhere, annual reporting with a copy to the
  creator, and the no-tax-reference case handled explicitly.
- Fair use — self-referral, manufactured clicks, undisclosed promotion — and that
  the disclosure obligation sits with whoever publishes.
- What the brand pays, and that it is never charged to the creator or customer.

Sections 9–16 renumbered to 10–17. A test asserts the numbering stays contiguous,
because a renumber that skips or repeats one makes a term uncitable.

### Pricing

`/choose-plan` now states that **creator commission is a separate cost from the
subscription and ACUs** — charged as an acquisition cost on sales those creators
produced, never a retainer. The table renders from `COMMISSION_BANDS` rather than
being typed, and notes that the platform's 0.25% is flat across every band, so a
creator moving up a tier raises what they take home rather than what we take.

### Landing, how-it-works, growth, policies

- **Landing** gains a feature block: no follower requirement, 0.5%/0.75%/1%,
  capped at 5% of value generated, and rewards that breach a protected margin
  refused rather than warned about.
- **How it works** gains Phase 9, *Turn customers and creators into a
  distribution network* — the previous Phase 9 becomes 10, and the count still
  renders from `PHASES.length` as fixed in §73.
- **Growth** gains the four things a creator asks *before* applying rather than
  after: withdraw wherever you are, every fee before you confirm, nothing
  withheld for tax, and earned-not-granted. Plus why cash comes only from a sale.
- **Policies** gains two index entries pointing at the new terms section.

Every one of these links into the §82 article cluster rather than dead-ending, and
a test asserts it.

### Verification

Tests **1061 → 1062**. Typecheck, layer check and build green.

## §84 — Two doors, and what a brand lets people promote (2026-08-10)

The owner asked two questions: does SHARE2EARN sign people up the same way as
the growth and influencer programme, and does a brand choose what gets promoted
or can everything be promoted as creators want. Answering them honestly exposed
two real gaps, both now closed.

### Gap 1 — SHARE2EARN promised no application and the site only had one

`bandForFollowers` already put everyone unverified on the SHARE2EARN band, and
the band's own description said *"no follower count, no application, no audience
test"*. But **the only signup surface on the whole site was `PartnerApplyForm`
on `/growth`** — the creator *application*, which asks for channels, audience
size and a follower count. A promise made in a rate table and contradicted by
the only form on the site is a promise nobody can act on.

**`src/backend/share2earn-signup.ts`** is the second door, and the difference
between the doors is the whole point:

| | `/share2earn` | `/growth` |
|---|---|---|
| You give | Name and email | Channels and audience |
| Then | In immediately | Scored and verified |
| Pays | 0.5% | 1% / 0.75% |
| Reviewed | No | Yes — it pays more |

**The safety property: the instant door cannot mint an influencer band.**
`joinShare2Earn({ name, email, nowISO })` has no `followers` parameter — not
"ignores one if supplied", but no home for one — so there is no unverified
number anywhere in the fast path for a later change to start trusting. The test
throws `followers: 5_000_000, followersVerified: true, adminOverride: true` at
it and asserts the account still comes back at zero, unverified and ineligible.
A mutation that lets the claim through fails it.

One account either way: joining derives the same `creatorId(email)` the
application path does, so applying later **upgrades the account that already
exists** — verified at 5,000 moves it to 0.75%, at 10,000 to 1%, and nothing
earned is lost. That is asserted, because it is the promise the join page makes.

The public form holds the same rule the application does: **an existing
account's access token is never printed**. Typing somebody else's email into an
open join form returns "already registered" and nothing else, and cannot
overwrite their name.

### Gap 2 — promotion was brand-curated by mission only

`createMission` was the only way anything became promotable. There was no
product catalogue, and no way for a creator to browse a brand's range and pick
something. **`src/backend/promotable.ts`** adds the catalogue as **two
independent gates**, which is the honest form of "everything can be promoted":

1. **The brand's permission** — three modes. `mission_only` (today's behaviour,
   and still the **default**, so no existing brand is silently opted into owing
   commission on products nobody has looked at), `curated` (only what the brand
   switches on), `open_catalogue` (everything listed is promotable and the brand
   excludes individual items instead).
2. **The margin's permission** — the same `productEligible()` the sale path
   uses, computed from the product's own economics. **This is the gate a brand
   cannot open by choosing a mode.** A brand can open its entire range and still
   find an item ineligible; the item then pays **nothing rather than a quietly
   smaller percentage**, because a headline rate that shrinks on some products
   is a rate nobody can quote.

Both reasons are reported separately, because "the brand closed it" and "the
margin closed it" need different actions and only one of them has a lever on the
screen.

**One attribution path.** A claim mints its tracked code through the existing
`createProgramme` + `subscribe` machinery, so `/r/{CODE}` resolves it exactly
like every other referral. This codebase has already shipped one second path for
money (§81) and it was the weaker one; there is now exactly one place a referral
code is minted.

**The brand's costs never cross to a creator.** `publicView` is built by
listing the fields that go out rather than deleting the ones that must not, so a
field added to a product later is not published by accident. The test asserts
the exact key set and that three distinctive cost figures appear nowhere in the
creator-facing payload.

**A claim recomputes.** The decision is derived server-side from the product and
the brand's *current* policy — a browser holding a stale page cannot mint a code
against an answer that has since changed.

### Surfaces

- **`/share2earn`** — the public door: the two doors side by side, the join
  form, what is claimable right now (counted from `?discover=1`; it says
  plainly when nothing is, rather than inventing a shopfront), and what a brand
  can open.
- **`/growth`** — now points at the other door in a panel above the form.
- **`/partner`** — the token-gated creator dashboard gains *Claim something to
  promote*: brands with an open catalogue, one button, a tracked link on the
  spot. Authentication is the partner's own token; the earner is derived from
  the credential and never from the request body.
- **`/dashboard/partner-network`** — `PromotionCatalogue`: the mode selector,
  the product form (economics mandatory, same rule as a sale-paying mission),
  and per-product status showing *which* gate closed it.
- Sitemap and footer, so the new door is not an orphan page.

### Gaps this leaves

- A brand's catalogue has no bulk import — products are added one at a time.
  For a wide range that is the difference between opening a catalogue and
  intending to.
- Discovery is a flat list of everything claimable. No matching, no ranking, no
  per-creator fit — `matchProgrammes` exists in `creator-agents.ts` and is not
  wired to it yet.
- Discovery has no per-brand filter or search. At a few dozen products that is
  fine; at a few hundred it is not.

### The defect this work exposed, and fixed

Writing the gap list caught a real one. A claimed product's conversions post
through the existing referral ledger, and `computeCreatorSplit` **hardwired
`RATE_CREATOR` (0.75%)**. That was correct while every partner arrived through
the reviewed application — and wrong the moment a SHARE2EARN joiner could claim
a product and drive a sale down the same ledger: they would have accrued 0.75%
in `creatorWallet`, above the band SHARE2EARN is defined to sit beneath, in the
one place nobody would have looked. `share2earnNeverPaysMore()` would still have
returned true, because it checks the table and not this path.

Same defect class as §81 and §75: **a value that exists on one side of a
boundary and is never carried across.** The band existed; the wallet never asked
for it. `computeCreatorSplit(net, creatorRate = RATE_CREATOR)` now takes the
rate as an argument — the default preserves every existing caller exactly — and
`creatorWallet` derives the band from the account and passes it. The rate now
follows the person: the same unpaid earnings recompute at 1% when a follower
count is verified, because the ledger stores revenue rather than a frozen
commission. A mutation reverting the wallet to the assumed rate fails the test.

### Verification

Tests **919 → 922**, all passing. Three mutations run — the margin gate stopped
binding, and the join door started believing a claimed follower count, and the wallet
reverting to an assumed rate — all caught. Typecheck, layer check and build green. Exercised live against the dev
server: join, duplicate join, a join carrying a follower claim, mode change,
eligible and ineligible products, cross-brand discovery, claim, refusal of the
ineligible product, and `/r/{CODE}` redirecting to the brand's own page with the
ref attached.

## §85 — Only people get in, and text never becomes an instruction (2026-08-12)

Owner directive: *"Only humans can sign up and log in to every section and every
part of this OS, and block all non-human instructions and activate an
anti-hacking AI agent."*

That is three controls with three different jobs, and conflating them is how
this gets built badly.

### 1. The human gate — `src/backend/human-gate.ts` + `src/middleware.ts`

`human-check.ts` already proved a person was at the door; it protected the free
ACU allowance and nothing else. The gate makes the same passed check hold for
the whole visit, and applies it **in middleware** so coverage is a routing rule
rather than a habit each route has to keep. A route added tomorrow is covered
the day it is added.

Every request lands in exactly one lane:

| Lane | What it is |
|---|---|
| `always_open` | The check itself, health, login. Closing these closes the only door anyone can prove themselves through. |
| `public_page` | The marketing site. Not the OS. |
| `machine` | Webhooks and the scheduler — not people, and each must present the credential that makes it an **invited** machine. |
| `public_form` | Signup and lead capture, where demanding a session to obtain a session is circular. |
| `human` | Everything else: `/dashboard`, `/partner`, `/api`. |

**"Block all non-human instructions" is implemented as: every request must be
attributable either to a verified human session or to a machine we invited,
authenticated as that machine.** An unauthenticated script has no lane. A call
to `/api/webhooks/stripe` with no signature is refused; a scheduler path with no
`CRON_SECRET` set fails **closed**, because a route nobody can be recognised for
is not "open to the scheduler", it is open.

**Sensitive paths need a RECENT check**, not one from this morning: fifteen
minutes for anything touching money, identity, credentials or admin. A
twelve-hour session is a twelve-hour window for whoever picks the laptop up, and
that is the window a payout would leave through. The refusal is `reverify`, not
`verify` — telling a signed-in customer to "log in again" when they only needed
to re-tap is how a withdrawal gets abandoned.

**It fails to a challenge, never a lockout.** Pages redirect to `/verify-human`
carrying where they were going; APIs answer 403 with the action and the address.

**Caught live before it shipped:** the first matcher gated the marketing site
too. That is not a stricter reading of the directive, it is self-harm — Google
could not crawl the pages this platform sells SEO on. The fix was to state a
short list of what IS the OS rather than grow a list of exceptions to a gate
over everything, because a list of exceptions is one somebody forgets to extend
and the failure is silent. A test now pins nine public pages open.

**Honest limit, stated on the page itself:** this stops SCALE — scripts, farms,
credential stuffing, replayed sessions. It does not stop one determined person
driving a real browser. No web check does, and claiming otherwise would be the
dishonest part.

**Demo:** with neither `HUMAN_CHECK_SECRET` nor a Firebase project the gate
OBSERVES and says so. There are no accounts and no balances in the zero-config
demo; pretending to protect them would be theatre, and blocking would breach the
standing zero-config rule for no security benefit.

### 2. The instruction firewall — `src/backend/instruction-firewall.ts`

The half of "non-human instructions" that actually takes money out. Nineteen
agents read material other people wrote — scraped pages, CRM notes, inbound
email, pasted documents. If any of it reaches a model as instruction rather than
data, whoever wrote it is issuing commands to a system that can publish, spend an
AI budget and touch a payout queue, without ever logging in.

**The defence is structure, not detection.** Third-party text is wrapped in a
labelled envelope and every gateway call now carries a provenance rule stating,
before the model reads any of it, that everything inside is evidence and never
instruction. That holds for attacks nobody has thought of yet. The rule goes on
**every** call, not only the ones that declare untrusted input, because most
engines still concatenate third-party text into the prompt — a rule that only
covered the careful callers would leave the rest exactly as exposed.

**The pattern list is an alarm, not a wall**, and is described that way in the
module. Anyone who reads it can rephrase around it; its job is telling Sentinel
that somebody is trying. Nine patterns; the four with no innocent reading —
credential exfiltration, forged system turns, guard bypass, payout redirection —
refuse outright, the rest are processed and flagged, because a firewall that
blocks real work gets switched off.

**Nothing is silently sanitised.** Deleting the matched phrase would produce a
confident analysis of a document that no longer exists and would hide the
attempt. Content goes through whole and labelled, or it is refused and the
customer is shown what was in it. A test asserts the refusal path contains no
redaction, and that a payload cannot close the envelope early to put the rest of
itself outside.

### 3. Sentinel — `src/backend/sentinel.ts`, `/dashboard/sentinel`

The anti-intrusion agent, and it is worth being exact about what "AI agent"
means here.

**Detection is arithmetic.** Every finding is a COUNT of events that happened, in
a stated window, from one actor, with the events attached. No model decides
whether you are under attack — asked that question a model produces a confident
answer either way, and a security control that is confidently wrong at 3am is
worse than none, because you would act on it.

**There is no threat score anywhere in the module**, and a test asserts no field
matching `/score|risk|level/` exists. Such a number would be a hash of some
counts dressed as a measurement, which this codebase has a standing rule against.

**The AI writes the brief, not the verdict** — reading a confirmed incident and
saying what it means in the next hour is what a model is good at. It is metered
like any other AI action and runs on demand; an agent that called a provider on
every failed login would be a denial-of-wallet attack shipped as a feature. With
no detections it returns a sentence and calls nothing.

Eight rules with thresholds set where a normal person's worst day stays below
them: credential stuffing, tenant probing, injection campaigns, payout targeting,
gate evasion, machine-lane probing, sustained rate limiting, injection probing.
Where the honest answer is "we cannot tell an attack from a broken integration",
the response is `step_up` rather than `block` — locking out a customer to be safe
is still locking out a customer. Actors are hashed, never stored as addresses.

Wired at the choke points, so no route had to be edited: `rateLimit` reports
every limit it applies, `requireAuth` every invalid session, `brand-access` every
cross-tenant attempt, `payout-execute` every refused withdrawal, and the gateway
every firewall finding. **Stated rather than glossed:** the human gate runs on
the edge and cannot write into the Node process, so requests it blocks outright
appear in the deployment's request log rather than in these counts.

### Two dead links, found by the owner and then by a test

The owner opened `/dashboard/vault` and got a 404. The Customer Vault is at
`/dashboard/customers`; two pieces of guidance pointed at its label instead of
its path. A new test walks every `/dashboard/*` string in the source against the
routes that exist — it immediately found a second one, `/dashboard/offer-forge`,
which is `/dashboard/offers`. A dead link inside a paid product is worse than a
missing feature: the feature is there, and the customer has just been told it is
not.

### Verification

Tests **922 → 933**. Three mutations run — the session signature stopping being
checked, the firewall enveloping a critical finding instead of refusing it, and
Sentinel collapsing all actors into one bucket — all caught. Typecheck, layer
check and build green (middleware compiles at 27 kB).

Exercised live in both modes. In observe mode nothing is blocked and the status
says why. With the gate armed: `/dashboard` and `/dashboard/earnings` redirect to
`/verify-human` carrying their destination, `/api/*` answers 403 with the action,
the public site stays 200 throughout, `/api/share2earn/join` still works with no
session, an unsigned webhook is refused and a signed one passes to the route, and
a solved proof of work sets a 12-hour session that opens the dashboard and the
money API in the same request cycle.

### What is still the owner's step

`HUMAN_CHECK_SECRET` must be set in production — without it the gate signs with a
per-process key, so a second instance rejects the first one's sessions. The
status endpoint and the Sentinel page both report this rather than leaving it to
be discovered in the wild.

## §86 — The acquisition run: how many people were actually asked (2026-08-13)

Owner's report: *"neither the 2 testing brands nor MarketWar itself see any
improvement on what they are selling and not a single customer acquired."*

Before adding a fifty-fifth engine it was worth asking what this platform could
**say** about that. The answer was nothing, and that is the finding.

`prospecting.ts` builds an ICP, produces prospects and writes an outreach
sequence — and then stops. Nothing is stored, no attempt is recorded, no outcome
comes back. So the first question anybody would put to a business with no
customers — **how many people did you ask?** — had no answer anywhere in 54
engines. Without that number "no customers" has no cause, and the default
assumption becomes the product, which is the one thing that gets fixed by
building more of what already exists.

### `src/backend/acquisition.ts`

Named prospects, the message each was actually sent, what came back. Every stage
requires its evidence, and the refusals are the design:

- **A prospect is a name.** "Plumbers in Manchester" is refused, and so is a name
  with no provenance — a list without a source cannot be worked twice and under
  UK GDPR cannot lawfully be contacted at all.
- **`contacted` requires the message text.** A record that says a message went
  out, without the message, cannot later tell you whether the message was the
  problem — and it usually is.
- **`replied` requires their words**, and cannot be set for somebody who was
  never written to. That check is what keeps the reply *rate* meaningful.
- **`won` requires the amount that arrived.** There is no won-in-principle.
- **`lost` requires the reason.** Ten losses with reasons is a product roadmap;
  ten without is a bad week.

The funnel counts everyone who **reached** a stage, not who is sitting in it —
counting the current stage only would show one contact and one win from the same
four people and make every conversion rate meaningless.

### `diagnose()` — the sentence the platform owed the owner

Six branches, each from counts alone:

| Counts | Bottleneck |
|---|---|
| 0 sent | **nobody_asked** — it is not the product, the price, the site or the copy |
| < 20 sent | too early to conclude anything, including that it is failing |
| sent, no replies | the list or the first line |
| replies, no conversations | the offer is not worth an hour |
| conversations, no money | price, proof or the ask |
| money | stop redesigning, do more of exactly that |

The first branch is the one that matters and it is deliberately not softened:
*"N engines and 0 messages sent. There is no version of this where the product,
the price, the site or the copy is the reason — none of them has been in front
of a buyer. This is the only diagnosis on the list that cannot be fixed by
building."* The engine count is passed in from `ENGINE_REGISTRY.length` rather
than typed, so the sentence can never quote a stale number.

Rates below 20 contacts are shown with the explicit note that they are too few
to decide on. A percentage over four attempts is noise wearing a percentage sign.

### `src/shared/gtm-targets.ts` — the three businesses, named

MarketWar OS (marketwaros.com), AxionOS (evandeli.com) and VeryX
(veryxjnn.com), each with its buyer, its trigger, its first offer, what would
count as proof of life — and, the field that does the work, **the channel that
needs no provider key, no ad budget and no integration.** A channel that needs
credentials is a channel that is not running; a business with no customers needs
the one it can use this afternoon. For AxionOS that is trade groups and direct
messages from a phone; for VeryX it is the founder's own inbox and LinkedIn, one
named programme director at a time; for MarketWar it is fifty messages from a
personal inbox plus the site's own pages.

**Every field is a plan, never a result.** A test asserts each target has a named
buyer, a keyless channel and a definition of a first sale, and the engine count
is kept out of the prose because it would be wrong within a week.

### What this ran as, live

All three targets, against the real endpoint, right now:

> **Nothing has been sold because nothing has been offered to anybody.**
> 55 engines and 0 messages sent… Write down ten businesses you could name to a
> friend. Not a category — ten names.

Recording one real attempt for AxionOS moved it immediately to *"1 person
contacted. Too few to conclude anything, including that it is not working."*
That is the whole point: the number exists now, and it moves when somebody does
the work rather than when somebody ships a feature.

### Verification

Tests **933 → 939**. Two mutations run — the funnel counting only the current
stage, and a stage advancing with no attempt behind it — both caught. Typecheck,
layer check and build green. Exercised live end to end including both refusals.

### Not metered, ever

No provider is called anywhere in this module. Charging a customer to count
their own sales calls would be charging for arithmetic.

## §87 — The front door: putting the valuable thing outside the login (2026-08-13)

Owner: *"what can be done organically to see customer acquisition."*

The answer was not another engine. MarketWar's single best asset for winning a
small business owner is a real, measured audit of their **own** website — their
page, their numbers, their problems, in fifteen seconds. It has existed since
SiteRaid shipped and it has been **behind the signup** the whole time, which is
why it has never won anybody.

Every tool in this category that grows organically works the same way: the
valuable thing is on the OUTSIDE of the login, and it is what search traffic
lands on. Ours was on the inside, and the landing page's first ask of a total
stranger was "create an account".

### `/audit` and `/api/audit`

- **No account, no card, no AI key.** The crawl is a fetch and a parse, so it
  runs on the deployment exactly as it stands today. A test asserts the route
  contains no `requireAuth`, no `meterAction` and no gateway call — a free audit
  that debits a wallet is not free, and the visitor does not have one.
- **Value before the ask.** The score and the three worst findings come back
  with no email at all, and the number held back is stated — *"17 things were
  measured on this page. Three are above; the other 14 come with the written
  report."* Not "unlock your full report".
- **It promises only what it measured.** Checks that could not be read from the
  response are listed separately rather than counted against the visitor.
- The human gate is explicitly opened for it — closing the front door of the
  acquisition machine was one middleware rule away.

### The loop that was missing

Somebody typing their own website into a stranger's tool and then handing over
an address is the warmest inbound signal this business can get, and there was
nowhere for it to go. An audit completed with an email now creates a **real
named prospect** in the §86 acquisition run, recorded as `inbound` — not as
"contacted", because we have not said anything to them yet — with the lawful
basis written at the point of creation: *"Ran the free audit on {host} and asked
for the full report."* A failure to record can never cost the visitor their
report.

That is the first source of pipeline in this platform that does not require the
owner to send anything.

### Findable

Sitemap at priority 0.95 (above every page except the home page), site
navigation, and the landing page's primary button changed from *Get started
free* to **Audit my website free**. Signing up is still there as the secondary
action. A stranger will not create an account to find out whether you are any
good; they will type their website into a box to see what is wrong with it.

### Verified live

Run against a real page (the dev server's own landing page):

```
score 79 grade B | gated: true | held back: 14
 - FAIL  HTTPS         Not served over HTTPS — a ranking + trust negative.
 - PASS  Title tag     Title present (55 chars).
 - PASS  Viewport meta Mobile viewport set.
with an email → 17 findings, recorded: true
```

The refusal path is honest too: a host behind bot protection gets *"allowlist
the user agent MarketWarBot/1.0 in whatever sits in front of it"* rather than a
shrug.

**One limit, stated:** in dev the audit route and the acquisition route hold
separate in-memory stores, so the funnel read-back only reflects the new
prospect once Firestore is configured — the same durability condition as every
other store in the platform. The write itself is confirmed by `recorded: true`.

### Tests

**940 → 942.** Typecheck, layer check and build green.

### What this does not do

It does not send the report by email — that needs a sending domain. The full
report appears on the page immediately instead, so the visitor is never left
waiting for something that cannot arrive.

## §88 — The buyer-side cluster: pages that route into the audit (2026-08-13)

§87 built the front door. This is what points at it.

The site had twelve articles and every one of them was aimed at **creators** —
people who want to earn from an audience. There was nothing at all for the
person who actually pays: a small business owner whose marketing is not working
and who has not decided that software is the answer. The audit page existed with
nothing linking to it from outside.

### Six pages, one cluster

A pillar and five spokes, targeting what an SME owner actually types:

| Page | Query it answers |
|---|---|
| **Your website gets visitors and no enquiries** (pillar) | "website not getting enquiries", "website traffic no leads" |
| Free website audit: what to check yourself | "free website audit", "website audit checklist" |
| Why your business does not show up on Google | "business not showing up on google", "how to get found on google" |
| How AI assistants decide which business to name | "how to appear in ai search", "chatgpt recommend my business" |
| Marketing a business with no budget | "marketing with no budget", "free marketing small business" |
| What an agency charges £2,000 a month for | "marketing agency cost", "agency retainer worth it" |

**Every one ends at the [free audit](/audit)** — the thing that can prove the
product in fifteen seconds without an account. A cluster that ranks and then
asks a stranger to sign up converts a fraction of one that hands them an answer.

### Two clusters, kept apart

`SeoArticle` gains a `cluster` field and the hub-and-spoke test now runs
per-cluster. This matters more than it looks: a crawler reads a cluster as a
claim about one subject, so merging creator content and buyer content produces a
hub that is the authority on neither. A test asserts no spoke links across into
the other cluster's pillar, which is exactly how two clusters quietly become one
mush.

### What the tests hold

- Every buyer page routes to `/audit`.
- ≥4 target queries and ≥3 FAQ entries each (no FAQ block, no rich result).
- >3,000 characters of content — a thin page in 2026 does not rank and does not
  deserve to.
- **No hype vocabulary**, and **no invented industry statistics** — the pattern
  `NN% of businesses` fails the suite. These are read by people who have been
  sold to badly before, and the whole cluster's value is that it does not do
  that.

The content follows the platform's own honesty rules. The agency piece breaks
down a real £2,000 retainer line by line and says plainly which parts are
skilled work and which are software you could licence yourself — including that
the diagnosis half of technical SEO takes seconds and is free, from us among
others. The AI-visibility piece says outright that you cannot pay to be named
and that anyone selling guaranteed placement in AI answers is selling something
that does not exist.

### Verified live

All six render at 200, each links to `/audit`, all appear in the sitemap.

### Tests

**942 → 943.** Typecheck, layer check and build green.

### What still has to happen off this machine

Pages rank when they are indexed and linked to, which takes weeks and does not
happen because a file was committed. Submit the sitemap in Search Console after
deploying, and the cluster will do its work slowly, which is the only speed
organic search has ever had.

## §89 — A photo in, a postable file out (2026-08-13)

The owner put a competitor's ad next to this product — *"I uploaded vacation
photos to Zeely AI, it made travel ads for me and got 5 package inquiries"* —
and said, correctly, that MarketWar could never carry that testimonial because
its features do not produce a result anybody can see.

So I walked the journey a customer would have to complete to say that sentence,
with no keys, exactly as a new user gets it. Here is the ad the platform
produced:

```
<svg width="1080" height="1080">
  <rect fill="#0b0f1a"/>          ← a dark rectangle
  <text>ENQUIRE TODAY</text>
  <text>Package deals from £499</text>
  <text>Family holidays, sorted</text>
</svg>
```

**Two breaks, and neither was in an engine.**

### 1. There was no way to put a picture in

`docFromAd` has supported a full-bleed image layer — with an automatic scrim
behind the copy so the headline stays readable over an unknown photograph —
since the day it shipped. **No surface in the product ever offered an upload.**
Every ad this platform could make was text on a flat colour, which for a travel
business, a restaurant or a tradesman is not an ad at all.

### 2. There was no way to get anything out

"Export" produced more SVG in the browser. Instagram, Facebook and WhatsApp take
PNG and JPEG; none of them takes SVG. A person could do the entire job and end
holding a file they could not post anywhere. **An ad you cannot save is not an
ad**, and that single missing button is worth more than any engine added in the
last month.

### `src/frontend/ad-export.ts`

Both halves run entirely in the browser — no upload endpoint, no storage bucket,
no provider key, no cost, and the photograph never leaves the customer's device
except inside their own ad document.

- **In:** the file is decoded, resized to a 1,600px longest edge and re-encoded
  as JPEG, stepping the quality down **in a loop until it actually fits** under
  900KB — because the document travels as JSON and a 6MB phone photo becomes an
  8MB base64 string that breaks everything downstream silently. What was done to
  it is reported in the words a person would use.
- **Out:** PNG at the placement's real pixel dimensions, not at whatever size
  the screen happened to be — an ad exported at CSS size arrives on Instagram
  soft and nobody can tell you why. A white background is painted first, because
  a transparent PNG turns black in some apps and white in others. SVG is offered
  too, for a print shop.
- Download buttons on the working canvas **and on every placement in the export
  grid**, so a full set for five placements is five clicks.

### What was already right

The engine. A test now proves it, so nobody "improves" the part that was fine: a
photo becomes an image layer, a scrim is added **because** there is a photo and
is absent when there is not, and the rendered SVG contains the picture.

### Tests

**943 → 945.** Typecheck, layer check and build green.

### The honest position on the testimonial

This does not manufacture one. It removes the two reasons a customer could not
have produced one: they can now put their own photograph in and walk away with a
file they can post. Whether five enquiries follow is up to their photograph,
their offer and their audience — and if it happens, the acquisition run (§86) is
where it gets recorded, with the message that produced it attached.

## §91 — A page per capability, written the only way they rank (2026-08-13)

Brief: use the SEO engine to create heavily interlinked blogs selling every
feature, function and functionality, to bring customers organically in record
time.

Two things about that brief decide whether it produces traffic or a demoted
domain, and both are now enforced by tests rather than remembered.

### Nobody searches for a feature name

Nobody has ever typed "ad canvas" or "ProfitGuard". They type *"how much can I
afford to pay an affiliate"* and *"why does my ad look stretched in stories"*.
A page titled after our internal engine ranks for our internal engine, which
nobody is looking for.

**Every page here is titled after the buyer's question** and names the engine as
the thing that answers it. A test rejects any title that is not a question.

### Fifty-five thin pages is a penalty, not a strategy

Google's scaled-content-abuse policy is aimed precisely at *a page per feature,
produced at volume, adding nothing* — and it demotes the whole domain, not just
the thin pages. Publishing 55 restatements of common advice would have made
marketwaros.com harder to find, not easier.

So each page carries a **`proof`**: the actual arithmetic, the actual refusal,
the actual limit — something a competitor could not copy without building it.

- *£100 order, £38 variable cost, 20% protected margin → £42 acquisition pool,
  £3.10 of reward capacity.*
- *A £10 product with £9.80 of cost supports 1p; 0.5% of it is 5p, so it is
  refused rather than quietly re-rated.*
- *Checks that could not be read from the response are listed separately and
  never counted as failures.*

And a **`limit`** — what it does not do. A feature page with no caveat is an
advert, and readers who have been sold to badly can tell in one paragraph.

### 14 pages, not 55

The count is smaller than the feature list and honest rather than large and
harmful. A capability with nothing specific to say does not get a page until it
does. Four clusters: pricing and margin, creators and affiliates, ads and
creative, getting found, plus reputation and trust.

### What the tests refuse to ship

- A title that is not a question.
- A `proof` under 120 characters, or one containing no number and no refusal.
- A `limit` under 60 characters.
- A body under 2,200 characters — **this caught ten of my own pages** and they
  were rewritten rather than the bar lowered.
- Fewer than 3 FAQ entries or 4 target queries.
- Hype vocabulary, or an invented `NN% of businesses` statistic.
- An `engineId` that is not in `ENGINE_REGISTRY` — which caught a page claiming
  an engine that does not exist.
- Fewer than 2 outbound relations, any dead internal link, or fewer than 25
  internal links across the cluster.

### Live

All 14 render at 200, the hub renders from the list rather than a hardcoded
copy, FAQPage and BreadcrumbList JSON-LD emit, and all 14 appear in the sitemap
— derived from `FEATURE_PAGES` so a page added tomorrow is included tomorrow.

### Tests

**949 → 951.** Typecheck, layer check and build green.

### The honest part about "record time"

Organic search does not have a record time. These pages get indexed over weeks
and rank over months, and anyone quoting faster is describing paid traffic.
What has been removed is the reason they would never have ranked at all: there
was nothing on this site answering the questions its buyers actually ask.

## §92 — Work the customer cannot take away is work they cannot use (2026-08-13)

The ad canvas (§89) taught this expensively: the engine was fine, the surface
had no export, and a person could do the whole job and end holding a file no
feed accepts. So I swept the codebase for the same shape — anything rendering
generated output with no route off the screen — rather than waiting to find them
one at a time.

**Seven surfaces had it.**

| Surface | What was trapped |
|---|---|
| `EmailPreview` | The whole message. **The worst of them** — see below. |
| `email-templates` | The rendered HTML template. |
| `AdFormats` | The generation prompt, whose entire purpose is to be used elsewhere. |
| `PresenterVideo` | The script, which is read from a phone while filming. |
| `/dashboard/ai-agents` | Every agent result. |
| `/dashboard/create` | The output of the main build flow. |
| `/dashboard/warfare` | Two ad-copy frameworks written to be pasted into an ad platform. |

### Why the email one is the worst

When sending is not configured — the normal state until a domain is verified —
**copying the message out is the only way that engine produces anything at all.**
There was no copy button. A feature that cannot be used, looking exactly like a
feature that works.

### `CopyOut`

Deliberately tiny, and deliberately honest about failing. `navigator.clipboard`
needs a secure context and a user gesture and is blocked outright in some
embedded browsers. **A button that silently does nothing is worse than no
button**, because the person believes they have the text and pastes an empty
clipboard into an email to a customer. When the copy fails, the text is selected
and the person is told to press Ctrl/Cmd+C.

Where the artefact is long — an email, a script, a template — a file download is
offered beside the copy.

### The rule, not the fix

The test enumerates **every** component and dashboard page, matches anything
that renders generated output, and fails if it offers no way to take it away.
Seven exemptions, each with a written reason, and the test fails if the list
grows past ten — a growing list of reasons is how a rule stops being one.

It works: the general rule immediately caught two surfaces the targeted sweep
had missed (`email-templates` and `warfare`), which is exactly why it exists.

### Tests

**951 → 953.** Typecheck, layer check and build green.

## §93 — The capability report was lying about the deployment (2026-08-13)

Continuing the walk-it-yourself sweep, starting with video. It found a defect in
what I had shipped two commits earlier, which is the more useful outcome.

### Video was fine. My report was not.

`startVideoRender` with no provider key returns immediately with
`status: "demo"` and a note naming the key that would make it real. It does not
hang, and it does not queue a job that never finishes.

**My capability report said it did** — *"Video jobs are accepted and never
finish"*. A report inventing a fault is the same dishonesty as a report hiding
one, and it is worse than having no report, because it is believed.

### And it was checking variables nothing reads

The report guessed at two capabilities' environment variables. It looked for a
render key and a mail key that **appear nowhere in this codebase**, while:

- video actually runs on `GEMINI_API_KEY` (Veo) or `OPENAI_API_KEY` (Sora),
  decided by `videoGatewayConfigured()`;
- mail readiness is decided by `emailIsConfigured()`, which checks the sending
  pool or Resend/SendGrid.

So on a deployment where **video worked**, this report called it dark and told
the operator to set a variable no code path consults.

This is the codebase's recurring defect wearing another hat: a value that exists
on one side of a boundary and is never carried across. The fix is not a better
guess — it is to stop guessing and call the owning module's own check.

### The test, and the mutation that exposed it as decorative

Two assertions: the readiness must come from the module's function, and **every
setting this file names must appear elsewhere in `src`**.

The first version of that second check grepped all of `src` — **including
capabilities.ts itself** — so an invented name satisfied the check by appearing
in the very line under test. A mutation putting the guess back **survived**.

That is exactly what a mutation check is for. With the file excluded from its
own grep, the mutation now fails the suite and the assertion means something.

A second test walks the video path directly and asserts the demo job comes back
immediately, says `demo`, has no URL, names the key that would change it, and is
never left looking like it is rendering.

### Tests

**953 → 955.** Mutation confirmed both directions. Typecheck, layer check and
build green.

---

## §101 — The eight metres between the click and the account (2026-08-25)

Owner question, and it was the right one: *"when someone use a link from any of
the growth programme or share2earn, then click signup or login, the link code is
not longer visible and how the system will keep tracking and aware the person?"*

It did not. `/r/{CODE}` recorded the click and forwarded to the brand's own site
with `?ref=` attached — and that half worked, because the brand's own cookie is
the attribution there. Everything aimed at MarketWar itself dropped the code:

- `/signup` and `/login` read no referral parameter; nothing anywhere set a
  cookie. The only producer of `referredRef` in the whole codebase was a brand
  posting a sale back by hand, so the sub-10k **ACU referral programme (250 ACUs
  per referral) could not pay out from a link at all**.
- A programme with **no `destinationUrl`** redirected to `/` and discarded the
  code entirely. Real traffic, recorded click, attribution impossible.
- Unrecoverable after the fact: `recordClick` stores a salted visitor hash that
  rotates **per code per day**, deliberately, so no trail exists to reconstruct.

### What shipped
`shared/signup-attribution.ts` (the rule), `backend/signup-attribution.ts` (the
record), `frontend/referral.ts` + `components/ReferralCapture.tsx` (the browser
half), `/r/[code]` converted from a page to a **route handler**, `SiteAuthLinks`
carrying the code onto the signup link, `/api/referral/attribute`, and the
account taken from the **verified token, never the body**.

**Last touch wins, inside 90 days** — owner's decision, and the one a creator who
was not paid can have explained in a sentence.

### Consent — two tiers, because one would have been a lie
The persistent cookie is affiliate attribution. It is not authentication and not
analytics, and under PECR it is not "strictly necessary for a service the user
requested"; the ICO says so about affiliate tracking specifically. So:

- **Tier 1 — the visit.** The code rides in the URL through to signup. A query
  parameter is not storage on a device, so no consent question arises. Covers
  click → land → sign up, which is most referred signups.
- **Tier 2 — 90 days.** Only once the visitor has accepted cookies.

Stated to the creator on `/share2earn` and to the visitor in Privacy §10, rather
than averaged into one number neither could verify.

### §Gaps — two attribution windows, both kept (Additive-Only resolution)
`shared/referral-attribution.ts` already defined a **30-day last-click** window.
The new module defines **90 days**. Both stand, because they answer different
questions and were deliberately kept as separate modules rather than merged:

| Module | Question | Window |
|---|---|---|
| `referral-attribution.ts` | May a **sale on a brand's own site** claim a code? A sanity check on a postback we never observed. | 30 days |
| `signup-attribution.ts` | Did this person reach **our** signup on a link **we** observed? | 90 days |

**Resolution: both govern, in their own domain.** Neither was edited.

### The design that had to be thrown away, and why
The obvious implementation wrote the referral to the commission ledger as
`recordConversion(..., grossGbp: 0)`, so `creatorWallet` would count it with no
new code. A test written before the code was believed caught it: `fraudScore`
flags zero-revenue events on purpose, and says why — *"otherwise 5 fake £0
conversions would satisfy the proven-conversion exception and bypass the 10K
gate."* Five throwaway signups on your own link and the follower gate is gone.

So an attribution is a **link, not money**: it records which creator an account
belongs to. Payment still happens through the existing ledger, cap cycle and
payout rails when that account produces real revenue. A test now asserts the
ledger stays empty, so this cannot be re-opened by a later good idea.

### Still outstanding
Nothing yet posts a conversion when a **referred MarketWar account pays us**.
The link exists and the payout machinery exists; the hook between them does not.
Until it is built, a MarketWar self-referral is recorded and traceable but not
yet paid. Named here so it stops being rediscovered.

### Tests
`normaliseCode` rejects paths/scripts/short strings; last-touch beats stored,
re-click restarts the clock, 89 days survives and 91 does not, a future-dated
cookie reads as expired; cookie round-trip and corruption; the link is written
and readable from both ends **with the ledger untouched**; one account is
attributed once ever and a second creator's code cannot overwrite it;
self-referral and unknown codes store nothing; a stored record missing fields
reads as absent rather than as a wrong creator; and the redirect carries the code
home when no destination is set — while still dropping a code nobody minted,
which the comment had claimed and the code had not done.

---

## §102 — 246 Stripe events delivered to a host that redirects (2026-08-25)

Owner report: *"stripe webhook is not working"*, with the Stripe dashboard
showing the MarketWar endpoint **Active** and **246 events** delivered. Both
were true, which is why it survived so long.

### The cause, and it was in this repository
`src/backend/stripe-billing.ts` held `MAIN_DOMAIN = "marketwaros.com"` — the
APEX — while the deployment serves `www.marketwaros.com`. **Stripe does not
follow redirects.** Every delivery to the apex was recorded against an endpoint
that never reached the application.

That literal was then copied into five documents — DEPLOYMENT, GO-LIVE,
LAUNCH-BLOCKERS, LAUNCH-READINESS and the §603 row of this register — each
instructing the owner to configure precisely the host that could not work. **The
documentation was the defect.** A hard-coded guess about somebody else's DNS
produced it, and five restatements made it look verified.

Confirmed from the deployment by the diagnostic built for it:

```
"endpointUrl": { "inCode": "https://marketwaros.com/api/webhooks/stripe",
                 "servingThisRequest": "https://www.marketwaros.com/api/webhooks/stripe",
                 "matches": false }
```

### What was eliminated first, and how
`/api/health/stripe` reported the live key valid and `STRIPE_WEBHOOK_SECRET`
set; the new `webhookDiagnostic` block then reported the secret well formed
(`whsec_`, 38 chars) and a signature round trip passing through the same
verifier the webhook uses. Three of the four candidate causes were ruled out
before the fourth was named — and the diagnostic states plainly what it still
cannot see, namely whether the secret belongs to the endpoint Stripe posts to.

### The fix
`MAIN_DOMAIN` is `MW_SITE_HOST` first and defaults to the host that actually
serves, with the scheme and trailing slash stripped from any pasted value.
`webhookEndpointUrl()` takes the host, and every caller with a real request
passes the one that request arrived on — the only host known for certain to
serve this app. The four runbooks are corrected and DEPLOYMENT now says to READ
the address out of `/api/health/stripe` rather than copy a constant.

The §603 row above is left as written: this register is archaeology and is not
edited in place.

### And a second defect found while looking
`applyWebhookOutcome` fell through to an in-memory Map when Firebase Admin was
unavailable and returned `applied: true` with the words "Credited N ACUs"; the
route answered 200. A 200 is the instruction NOT to retry, so a payment that
persisted nowhere was acknowledged as delivered. In production that is now a
refusal and a 500, so Stripe redelivers for three days and the credit lands by
itself. Idempotency by event id makes the retry safe. Admin turned out to be
healthy on this deployment, so this was not the live cause — but it was a loaded
trap on the money path.

### The belief that had to be retracted
Several sessions carried "Firebase Admin is not initialising in production" as a
standing assumption and hung diagnoses off it. `/api/health/auth` returns
`configured: true`, `initError: null`, a valid PEM, matching client and admin
projects and a passing Identity Toolkit probe. It was **wrong**. STATE.md now
records the evidence and the instruction to check the endpoint rather than
inherit the belief.
