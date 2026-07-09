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

| # | Theme | Rows | ✅ | 📘 | 📦 |
|---|---|---|---|---|---|
| 1 | Core AI agents | 96 | 13 | 24 | 59 |
| 2 | Platform modules | 74 | 15 | 31 | 28 |
| 3 | Dashboards & account system | 42 | 16 | 12 | 14 |
| 4 | Master Platform AI OS Prompt rules | 22 | 3 | 5 | 14 |
| 5 | Autonomous Campaign Engine | 30 | 4 | 6 | 20 |
| 6 | DemandOS / organic acquisition engines | 26 | 2 | 5 | 19 |
| 7 | Customer Resurrection Engine | 15 | 2 | 3 | 10 |
| 8 | Landing-page subsystem | 24 | 2 | 3 | 19 |
| 9 | Competitor-inspired feature packs | 36 | 1 | 3 | 32 |
| 10 | Independence / external-API architecture | 20 | 2 | 6 | 12 |
| 11 | Pricing & ACU economics | 24 | 1 | 9 | 14 |
| 12 | Data model | 12 | 2 | 3 | 7 |
| 13 | Zero Generic Info Protocol & behaviour mandates | 12 | 4 | 2 | 6 |
| 14 | Document 2 — AI-OS Transformation Spec v3.0 | 18 | 1 | 15 | 2 |

Counts are indicative (some rows carry a dual status such as "✅ partial / 📦 full spec"); the row itself is authoritative.

---

## 1. Core AI agents

### 1.1 The original 10 product agents (Document 1, Part 01, L21–41)

All ten exist as working agents with anti-generic prompts in `src/lib/ai/agents.ts`, callable via
`POST /api/agents/[agentId]` (`src/app/api/agents/[agentId]/route.ts`), with runs persisted through `src/lib/db.ts`.

| Requirement | Source | Status | Where |
|---|---|---|---|
| Business Diagnosis Agent (audits product, pricing, audience, landing page, offer, past ads, funnel) | Part 01 L23; inv-1 | ✅ | `src/lib/ai/agents.ts` (`business-diagnosis`) + deterministic scoring in `src/lib/ai/audit.ts` |
| Customer Pain Agent (pain points, objections, buying triggers, emotional hooks) | Part 01 L25; inv-1 | ✅ | `src/lib/ai/agents.ts` (`customer-pain`) |
| Offer Builder Agent (discount, bundle, guarantee, urgency, referral, trial, lead magnet) | Part 01 L27; inv-1 | ✅ | `src/lib/ai/agents.ts` (`offer-builder`) |
| Ad Creative Agent (FB/IG/TikTok/Google/LinkedIn copy, hooks, scripts, image prompts) | Part 01 L29; inv-1 | ✅ | `src/lib/ai/agents.ts` (`ad-creative`) |
| Campaign Commander Agent (test campaigns, small budgets, clear objectives) | Part 01 L31; inv-1 | ✅ | `src/lib/ai/agents.ts` (`campaign-commander`) |
| Budget Protection Agent (pause zero-lead campaigns, recommend changes) | Part 01 L33; inv-1 | ✅ | `src/lib/ai/agents.ts` (`budget-protection`) + `src/app/dashboard/budget/` |
| Lead Capture Agent (landing pages, WhatsApp flows, forms, follow-up, retargeting) | Part 01 L35; inv-1 | ✅ | `src/lib/ai/agents.ts` (`lead-capture`) |
| Competitor Spy Agent (competitors, offers, ads, pricing, positioning) | Part 01 L37; inv-1 | ✅ | `src/lib/ai/agents.ts` (`competitor-spy`) + `src/app/dashboard/competitors/` |
| Local Growth Agent (hyper-local campaigns for local verticals) | Part 01 L39; inv-1 | ✅ | `src/lib/ai/agents.ts` (`local-growth`) + `src/app/dashboard/local/` |
| Revenue Intelligence Agent (what produced leads, bookings, sales, calls, messages) | Part 01 L41; inv-1 | ✅ | `src/lib/ai/agents.ts` (`revenue-intelligence`) + `src/app/dashboard/revenue/` |
| Content Factory agent (30-day calendars, scripts, posts — agentised from Module: Content Factory) | Part 01 L182–205; inv-1 | ✅ | `src/lib/ai/agents.ts` (`content-factory`) + `src/app/dashboard/content/` |
| AI Growth Strategist™ ("live CMO", daily briefings, top-3 actions/risks/opportunities) | Part 05 L2759–2789; Part 13 L14084–14098; inv-3, inv-8 | ✅ | `src/lib/ai/agents.ts` (`growth-strategist`) + `src/app/dashboard/briefing/` |

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
| 4.1 Business Diagnosis Agent (13 inputs, 8 scores, "Why You Are Not Getting Customers" report) | Part 11 L6496–6515; Part 14 L14558–14594; inv-6, inv-8 | ✅ partial | `src/lib/ai/agents.ts` (`business-diagnosis`) + `src/lib/ai/audit.ts` (6-score deterministic engine; 8-score set 📦) |
| 4.2 Customer Pain Agent (trigger map, objection map, persuasion angle, CTA/LP/WhatsApp direction) | Part 11 L6518–6539; Part 14 L14596–14616 | ✅ | `src/lib/ai/agents.ts` (`customer-pain`) |
| 4.3 Offer Builder Agent (14 offer types, 7 offer scores) | Part 11 L6542–6562; Part 14 L14618–14643 | ✅ partial | `src/lib/ai/agents.ts` (`offer-builder`) + `src/app/dashboard/offers/`; full 14-type/7-score matrix 📦 |
| 4.4 Campaign Commander Agent (11 outputs, 11 campaign modes) | Part 11 L6565–6587; Part 14 L14645–14671 | ✅ partial | `src/lib/ai/agents.ts` (`campaign-commander`) + `src/app/dashboard/campaigns/` |
| 4.5 Ad Creative Agent (13 asset types, AIDA/PAS) | Part 11 L6590–6610; Part 14 L14673–14689 | ✅ | `src/lib/ai/agents.ts` (`ad-creative`) |
| 4.6 AI Landing Page Creation Agent (core-agent mandate, 18 responsibilities) | Part 11 L6613–6678; Part 14 L14691–14717 | 📦 | `source-notes/11` / `source-notes/14`; basic page ✅ at `src/app/dashboard/landing-pages/` |
| 4.7 Landing Page Structure Generator (Hero/Problem/Offer/Benefits/Proof/Process/FAQ/Urgency/Form/CTA) | Part 11 L6906–7023; Part 14 L14809–14922 | 📦 | `source-notes/11-acquisition-infrastructure-agents.md`, `source-notes/14-consolidated-spec-version-b.md` |
| 4.8 Landing Page AI Scoring (8 scores incl. Friction, Lead Quality) | Part 11 L7027–7049; Part 14 L14924–14941 | 📦 | `source-notes/11`, `source-notes/14` |
| 4.9 Landing Page Optimisation Rules (12 fix rules, projected score lift) | Part 11 L7053–7072; Part 14 L14943–14956 | 📦 | `source-notes/11`, `source-notes/14` |
| 4.10 Landing Page A/B Testing (variants A–D, 10 tracked metrics) | Part 11 L7076–7095; Part 14 L14958–14978 | 📦 | `source-notes/11`, `source-notes/14` |
| 4.11 Landing Page Publishing System (slugs, subdomains, QR, pixels, UTM, `marketwar.co/b/{business}/{slug}`) | Part 11 L7099–7121; Part 14 L14980–14995 | 📦 | `source-notes/11`, `source-notes/14` |
| 4.12 Landing Page Database Collections (12 collections) | Part 11 L7125–7144; Part 14 L14997–15009 | 📦 | `source-notes/11`, `source-notes/14`; relational analogue 📘 in `docs/ai-os/07-database-and-api.md` |
| 4.13 LandingPage TypeScript schema (pageType enum, formConfig, tracking, scores, metrics) | Part 11 L7148–7181; Part 14 L15011–15096 | 📦 | `source-notes/11`, `source-notes/14` |
| 4.14 Landing Page Agent Prompt (verbatim system prompt, JSON output) | Part 11 L7184–7249; Part 14 L15098–15149 | 📦 | `source-notes/11`, `source-notes/14` |
| Agent 5 Lead Capture Agent (8 capture types, 7 lead scores) | Part 11 L7253–7273; Part 14 L15151–15170 | ✅ partial | `src/lib/ai/agents.ts` (`lead-capture`); 7-dimension lead-score model 📦 |
| Agent 6 WhatsApp Sales Agent (9 conversational capabilities) | Part 11 L7277–7295; Part 14 L15172–15184 | ✅ partial | `src/app/dashboard/whatsapp/` UI + `lead-capture` agent; dedicated conversational agent 📦 |
| Agent 7 Budget Protection Agent (8 intervention rules; STOP/FIX/SCALE/RECOVER/WATCH/TEST; 25% no-lead auto-STOP) | Part 11 L7299–7318; Part 14 L15186–15205 | ✅ partial | `src/lib/ai/agents.ts` (`budget-protection`); automated 25% stop-loss trigger 📦 |
| Agent 8 Customer Resurrection Agent (7 input sources, 5 outputs, priority recovery list) | Part 11 L7322–7340; Part 14 L15207–15223 | ✅ partial | `src/app/dashboard/recovery/` (lead recovery UI); full resurrection agent — see §7 |
| Agent 9 Local Growth Agent (8 generated asset types) | Part 11 L7344–7363; Part 14 L15225–15236 | ✅ | `src/lib/ai/agents.ts` (`local-growth`) |
| Agent 10 Competitor Spy Agent (9 tracked signals, counter-tactics) | Part 11 L7367–7388; Part 14 L15238–15250 | ✅ | `src/lib/ai/agents.ts` (`competitor-spy`) |
| Agent 11 Revenue Intelligence Agent (10 metrics, unit-economics grid, SCALE/FIX/STOP/RECOVER verdicts) | Part 11 L7392–7412; Part 14 L15252–15265 | ✅ | `src/lib/ai/agents.ts` (`revenue-intelligence`) |
| Agent 12 Local Threat Discovery Agent (constant competitor scanning, 5 threat signals, "Ghost Competitors") | Part 12 L7416–7437; inv-6 | 📦 | `source-notes/12-build-transcript.md`; partial overlap with `competitor-spy` ✅ |

### 1.4 The 22-agent list — consolidated spec Version A (Part 13, L14189–14212)

| Requirement | Source | Status | Where |
|---|---|---|---|
| BusinessDiagnosisAgent | Part 13 L14189–14212; inv-8 | ✅ | `src/lib/ai/agents.ts` (`business-diagnosis`) |
| CustomerPainAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`customer-pain`) |
| OfferBuilderAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`offer-builder`) |
| CampaignCommanderAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`campaign-commander`) |
| VisualCreativeAgent (dedicated visual/image generation agent) | Part 13 L14189–14212 | 📦 | `source-notes/13-consolidated-spec-version-a.md`; creative direction partially in `ad-creative` ✅ |
| CopywritingAgent (dedicated; AIDA/PAS/FOMO/scarcity/authority/social proof/curiosity/local identity/emotional/loss-aversion models) | Part 13 L14189–14212, L13782–13807 | ✅ partial | copy generation folded into `ad-creative` + `content-factory`; standalone agent 📦 |
| HashtagAgent (hashtag generation + 6-factor scoring) | Part 13 L14189–14212, L13809–13827 | 📦 | `source-notes/13`; hashtags emitted by `content-factory` ✅ partial |
| LandingPageAgent | Part 13 L14189–14212 | 📦 | see §8 landing-page subsystem |
| WhatsAppSalesAgent | Part 13 L14189–14212 | ✅ partial | `src/app/dashboard/whatsapp/` |
| SMSFollowUpAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; follow-up module 📘 in `docs/ai-os/04-platform-modules.md` |
| EmailFollowUpAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; 📘 `docs/ai-os/04` |
| RetargetingAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; 📘 `docs/ai-os/04` (retargeting module) |
| BudgetProtectionAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`budget-protection`) |
| CustomerResurrectionAgent | Part 13 L14189–14212 | 📦 | see §7 |
| CompetitorSpyAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`competitor-spy`) |
| ReviewMiningAgent (pain points, language, competitor failures from reviews) | Part 13 L14189–14212, L14045–14062 | 📦 | `source-notes/13`; `source-notes/04` L1430–1444 |
| LocalGrowthAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`local-growth`) |
| ReferralGrowthAgent | Part 13 L14189–14212 | 📦 | `source-notes/13`; referral engine 📘 in `docs/ai-os/04` |
| MarketplaceDemandRouterAgent | Part 13 L14189–14212, L14000–14025 | 📦 | `source-notes/13`; marketplace 📘 in `docs/ai-os/01` (phase-3 vision) |
| RevenueIntelligenceAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`revenue-intelligence`) |
| GrowthStrategistAgent | Part 13 L14189–14212 | ✅ | `src/lib/ai/agents.ts` (`growth-strategist`) |
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
| Marketing Failure Audit (10 inputs; 6 scores: conversion risk, offer weakness, audience mismatch, landing page, trust, ad creative; funnel leak map; "Why you got 0 customers" report) | Part 01 L43–84; inv-1 | ✅ | `src/lib/ai/audit.ts` (deterministic scoring engine) + `src/app/dashboard/audit/` + `POST /api/audit`; results persisted via `src/lib/db.ts` |
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
| MODULE 2 AI Marketing Failure Audit (13 audit areas, 8 scores, report) | Part 13 L13463–13498 | ✅ partial | `src/lib/ai/audit.ts` + `src/app/dashboard/audit/` (6 scores implemented; 8-score set 📦) |
| MODULE 3 Business Brain (18 stored attributes, 7 AI uses) | Part 13 L13500–13529 | 📘 | `docs/ai-os/04-platform-modules.md`; `docs/ai-os/06-architecture.md` (data intelligence) |
| MODULE 4 Customer Intelligence Vault (14 data sources, 28 customer fields, 11 AI segments) | Part 13 L13531–13589 | ✅ partial | `src/app/dashboard/customers/` (customer vault UI, demo data); import + field schema 📦 |
| MODULE 5 AI Customer Resurrection Engine (10-step process, Revenue Recovery Score™, 9 campaign types) | Part 13 L13591–13618 | 📦 | see §7; recovery UI ✅ partial `src/app/dashboard/recovery/` |
| MODULE 6 Offer Builder Engine (14 offer types, 7 scores, 5 recommendations) | Part 13 L13620–13653 | ✅ partial | `src/app/dashboard/offers/` + `offer-builder` agent |
| MODULE 7 AI Campaign Pack Generator (17 pack contents; Starter/Growth/Domination pack types) | Part 13 L13655–13712 | 📦 | `source-notes/13`; campaign generation ✅ partial via `campaign-commander` |
| MODULE 8 Autonomous Campaign Warfare Engine (autonomy L1–L3, 7 safety controls) | Part 13 L13714–13741 | 📘 | `docs/ai-os/02-users-and-command-centres.md` (autonomy dial L0–L3); execution engine 📦 |
| MODULE 9 AI Visual Creation Engine (12 visual types, 8 inputs, 11 visual-intelligence rules) | Part 13 L13743–13780 | 📦 | `source-notes/13`; also Part 08 L4398–4485 |
| MODULE 10 AI Copywriting Engine (13 copy types, 10 persuasion models) | Part 13 L13782–13807 | ✅ partial | `ad-creative` + `content-factory` agents |
| MODULE 11 Hashtag & Local Discovery Engine (8 hashtag types, 6-factor scoring) | Part 13 L13809–13827 | 📦 | `source-notes/13` |
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
| Marketing MOT (automated 10-point marketing audit, Yell-inspired, 30-day growth plan) | Part 12 L10214–10227 | 📦 | `source-notes/12`; audit engine ✅ partial `src/lib/ai/audit.ts` |
| How-It-Works page (detailed step-by-step process, linked in footer; 7-phase "Phased Warfare" timeline) | Part 12 L7574–7581 | ✅ | `src/app/how-it-works/page.tsx` |
| Worldwide localisation (auto-detect language + currency from device, hydration-safe) | Part 06 L2897–2905, Part 07 L4132–4148 | 📦 | `source-notes/06`, `source-notes/07` (prototype-only; not in this repo) |
| Premium cinematic landing page ("One Operating System. Every Growth Weapon.", 6 agent pillars, "From idea to income") | Part 12 L8421–8456; Part 15 L19161–19178 | ✅ | `src/app/page.tsx` (premium landing page) |

---

## 3. Dashboards & account system

### 3.1 Dashboards specified in Document 1 (Part 05, L2258–2843; Part 13 routes L14377–14399)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Executive Command Center (main homepage; 11 live metric cards: revenue/leads/bookings/messages today, conversion rate, ad spend, cost per customer, returning customers, AI campaigns running, revenue recovered, estimated lost revenue) | Part 05 L2258–2291; inv-3 | ✅ | `src/app/dashboard/page.tsx` (command center) with `src/components/charts.tsx` + demo dataset `src/lib/data/` |
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
| 22-route dashboard navigation (/dashboard, /audit, /business-brain, /customer-vault, /campaign-war-room, /campaign-packs, /landing-pages, /whatsapp-center, /follow-up-center, /lead-recovery, /budget-guard, /local-domination, /competitor-intelligence, /review-mining, /referrals, /marketplace, /revenue-intelligence, /ai-growth-strategist, /acu-wallet, /billing, /settings, /admin) | Part 13 L14377–14399; inv-8 | ✅ partial | 15 of 22 concepts live under `src/app/dashboard/*` (see `src/components/Sidebar.tsx`); /business-brain, /follow-up-center, /review-mining, /referrals, /marketplace, /acu-wallet, /billing, /admin 📦/📘 |

### 3.2 User types & account system

| Requirement | Source | Status | Where |
|---|---|---|---|
| 10 platform user types: Business Owner, Marketing Manager, Sales Team, Social Media Manager, Local Business Owner, Agency, Enterprise Client, Affiliate/Promoter, Franchise/Multi-location, Admin/Super Admin — each with distinct dashboard intelligence | Part 05 L2081–2105; Part 12 L12849–12860; inv-3 | 📘 | `docs/ai-os/02-users-and-command-centres.md` (AI Command Centres for 12 user types, autonomy dial L0–L3) |
| 7 user types with per-type needs (Version A: Business Owner, Marketing Manager, Sales Team, Agency, Enterprise/Franchise, Affiliate/Promoter, Platform Admin) | Part 13 L13377–13431 | 📘 | `docs/ai-os/02-users-and-command-centres.md` |
| Master Account System — A. Identity Layer (15 fields: name, business name, industry, website, social links, locations, timezone, language, team members, roles & permissions, subscription plan, ACU balance, billing profile, Stripe wallet, tax/VAT) | Part 05 L2107–2142 | ✅ partial | `src/app/onboarding/` captures core identity; full layer 📘 `docs/ai-os/07-database-and-api.md` |
| B. Business Intelligence Layer (13 learned attributes powering all AI decisions) | Part 05 L2144–2174 | 📘 | `docs/ai-os/06-architecture.md` (learning loop); `docs/ai-os/07` schema |
| C. Customer Intelligence Layer (14 stored customer data types) | Part 05 L2176–2206 | ✅ partial | `src/app/dashboard/customers/` + `src/lib/db.ts`; full layer 📘 `docs/ai-os/07` |
| D. Marketing Intelligence Layer (campaigns, ads, creatives, hooks, landing pages, A/B tests; CTR/CPC/CPL/ROAS/conversion/lead-quality/channel/audience metrics) | Part 05 L2208–2238 | 📘 | `docs/ai-os/07-database-and-api.md` |
| E. AI Intelligence Layer (tracks AI-generated campaigns/offers/pages, recommendations, prediction history, experiment outcomes, performance learning) | Part 05 L2240–2256 | ✅ partial | agent runs + audits persisted to Firestore via `src/lib/db.ts`; full learning loop 📘 `docs/ai-os/06` |
| Dashboard must never feel passive — alive, intelligent, predictive, commercial, operational, urgent, strategic; "platform is actively helping me make money" | Part 06 L2845–2867; Part 13 L14401–14416 | ✅ | design language of all 15 dashboard pages + `src/app/page.tsx`; verbatim in `source-notes/06` |
| Anti-requirements: must NOT feel like a social scheduler / CRM / analytics tool / reporting system; must feel like an AI-Powered Customer Acquisition Command Centre / "AI growth war room" | Part 04 L2042–2079 | ✅ | overall dashboard design; `src/app/dashboard/layout.tsx` |
| "Stealth Premium" aesthetic (cinematic dark modes, glassmorphism, Space Grotesk headlines, bento-grid, monoline icons, framer-motion transitions) | Part 01 L441–453; Part 06 L3621–3635 | ✅ | `src/app/page.tsx`, `src/app/globals.css`, `src/components/HeroMockup.tsx`, `src/lib/palette.ts` |
| Key user journey (10 steps: sign up → business details → audit → fixes/lost revenue → objective → campaign pack → assets → launch/approval → AI monitors → stop/fix/scale directives) | Part 13 L14337–14375 | ✅ partial | `src/app/onboarding/` → `audit` → `campaigns` flow; autonomous monitoring 📘/📦 |
| AI-Agent dashboard cards (Agent Name, Purpose, Completion Status, Last Result, Revenue Impact Score, Next Recommended Action, Required Inputs, Connected Outputs) | Part 15 L16197–16212 | 📦 | `source-notes/15`; simpler agent runner ✅ `src/components/AgentRunner.tsx` |
| Onboarding core-principle intake (What do you sell? Who do you want? What result? Budget? Location? Promotion/offer?) | Part 08 L4234–4250 | ✅ | `src/app/onboarding/` (4-step onboarding) |

---

## 4. Master Platform AI OS Prompt rules (Part 03, L636–860)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Identity: "You are not a chatbot. You are the intelligence layer of this platform." — AI-powered OS, decision engine, workflow automation layer, predictive assistant, multi-agent execution platform, self-learning system | Part 03 L639–661; inv-1 | ✅ partial | anti-generic master directive embedded in every agent prompt in `src/lib/ai/agents.ts`; full identity block 📦 `source-notes/03` |
| AI Behaviour Standard — 12 silent questions per user action (goal, data, missing, risk, automatable, predictable, improvable, next, notify, save, learn, recommend) | Part 03 L662–670 | 📦 | `source-notes/03-master-platform-ai-os-prompt.md` |
| Never behave generically; outputs specific, operational, structured, goal-connected | Part 03 L668–670 | ✅ | master directive in `src/lib/ai/agents.ts` (see §13 Zero Generic Info Protocol) |
| Autosave Principle — mandatory platform-wide; 21-item autosave scope; every module supports autosave, version history, timestamps, attribution, change tracking, rollback, audit trail, AI change summary | Part 03 L672–686 | ✅ partial | audits + agent runs auto-persisted to Firestore (`src/lib/db.ts`); full autosave/versioning framework 📦 `source-notes/03` |
| AI Memory Structure — 4 levels: User Memory, Workspace Memory, Process Memory, Intelligence Memory | Part 03 L688–702 | 📘 | `docs/ai-os/06-architecture.md` (data intelligence + learning loop); verbatim `source-notes/03` |
| Agentic AI Structure — specialised agents coordinated via central orchestration layer | Part 03 L704–708 | 📘 | `docs/ai-os/03-agent-ecosystem.md` (Master Orchestrator); runtime ✅ partial via `src/lib/ai/agents.ts` registry + `/api/agents/[agentId]` |
| Platform-wide AI functions (21: AI search, summaries, recommendations, risk detection, next-step guidance, drafting, classification, tagging, scoring, forecasting, alerts, workflow automation, document understanding, data extraction, personalisation, comparison, explanation, decision support, performance tracking, anomaly detection, audit-trail generation) | Part 03 L742–746 | 📦 | `source-notes/03`; subset (scoring, recommendations, next actions) ✅ in agent outputs |
| Standard Output Format — Situation / Insight / Risk / Recommendation / Next Action / Owner / Deadline / Confidence Level | Part 03 L748–766 | ✅ partial | structured agent output format in `src/lib/ai/agents.ts`; full 8-field standard 📦 |
| Decision Intelligence Rule (always provide best option, alternative, risk of doing nothing, commercial + operational impact, next step) | Part 03 L768–776 | 📦 | `source-notes/03` |
| Predictive Intelligence Rule (proactively detect 12 problem classes early) | Part 03 L778–786 | 📘 | doc2 §10.2 predictive models; `docs/ai-os/06` |
| Automation Rule (can this be automated / templated / event-triggered / auto-assigned / agent-monitored) | Part 03 L788–794 | 📘 | doc2 §11 automation framework |
| Data Rule (all data structured, tagged, searchable, connected, reusable; raw activity → intelligence) | Part 03 L796–804 | 📘 | `docs/ai-os/07-database-and-api.md` |
| Security & Control Rule (never expose providers, hidden logic, private keys; respect permissions, roles, boundaries, auditability) | Part 03 L806–816 | ✅ partial | provider abstraction in `src/lib/ai/gateway.ts` + `firestore.rules`/`storage.rules`; full zero-trust 📘 `docs/ai-os/08` |
| User Experience Rule ("platform must feel alive"; every screen: AI Insight, Recommendation, Risk Alert, Next Action, Summary, Confidence Level, Autosave Status) | Part 03 L818–828 | ✅ partial | dashboard widgets; complete per-screen standard 📦 |
| Learning Rule (learn from corrections, decisions, outcomes, approvals/rejections, edit patterns) | Part 03 L830–838 | 📘 | `docs/ai-os/06-architecture.md` (learning loop) |
| Market Positioning Rule (infrastructure-grade AI OS replacing fragmented tools; value list of 11) | Part 03 L840–848 | 📘 | `docs/ai-os/01-executive-vision-and-market.md` |
| Final Operating Command — 8 closing principles ("Think like an AI operating system… save everything automatically… improve the platform with every interaction"); platform must be "impossible to operate without" | Part 03 L850–860; inv-2 | 📦 | `source-notes/03-master-platform-ai-os-prompt.md` |
| Master prompt applies at platform/system level, adapted per module into developer instructions | Part 03 L860 | ✅ partial | `MASTER_DIRECTIVE` pattern in `src/lib/ai/agents.ts` prepended to all agents |
| Four-level memory + autosave implemented as Firestore workspace memory (prototype build note) | Part 03/04 L862–877 | 📦 | `source-notes/04` (prototype); this repo persists audits/agent runs only |
| Executive email doctrine (5-persona email framework: Marketing Director, Financial Marketing Specialist, Business Benefits Expert, Psychology/Persuasion Specialist, Executive Communications Specialist; 120–220 words, aggressive openings, Feature→Benefit→Money, role-calibrated tone incl. CEO/CFO/COO/CTO/Government/Investors) | Part 12 L10264–10352; inv-7 | 📦 | `source-notes/12-build-transcript.md` |
| Senior-engineer persona directive for build assistant | Part 11 L5937–5952 | 📦 | `source-notes/11` (process note, not product) |

---

## 5. Autonomous Campaign Engine (Parts 08–10; duplicate copy in Part 09)

| Requirement | Source | Status | Where |
|---|---|---|---|
| Core principle — 6-question intake, then "the OS does EVERYTHING" | Part 08 L4234–4250; inv-5 | ✅ partial | `src/app/onboarding/` (intake); autonomous execution 📦 |
| Step 1 AI Business Analysis (14 analysis dimensions) | Part 08 L4254–4288 | ✅ partial | `business-diagnosis` agent + `src/lib/ai/audit.ts` |
| Step 2 AI Campaign Objective Engine (11 auto-selected objectives) | Part 08 L4290–4318 | ✅ partial | `campaign-commander` agent (objective selection); auto-selection 📦 |
| Step 3 AI Customer Psychology Engine (10 trigger classes; food-delivery + education examples) | Part 08 L4320–4372 | ✅ partial | `customer-pain` agent |
| Step 4 AI Offer Creation Engine (9 auto-created offer types, scored) | Part 08 L4374–4396 | ✅ partial | `offer-builder` agent |
| Step 5 AI Visual Creation Engine (11 visual types; attention triggers; localisation by country/ethnicity/culture/weather/language/trends) | Part 08 L4398–4485 | 📦 | `source-notes/08-autonomous-campaign-engine.md` |
| Step 6 AI Copywriting Engine (9 outputs; AIDA, PAS, emotional selling, scarcity, authority, urgency, social proof, curiosity, FOMO, local identity) | Part 08 L4487–4531 | ✅ partial | `ad-creative` agent |
| Step 7 AI Hashtag Engine (6 hashtag classes, scored) | Part 08 L4533–4549 | 📦 | `source-notes/08` |
| Step 8 AI Multi-Platform Adaptation (12 target formats: FB, IG, TikTok, LinkedIn, WhatsApp, Google Business, Email, SMS, landing page, blog, SEO page, push) | Part 08 L4551–4579 | 📦 | `source-notes/08` |
| Step 9 AI Landing Page Generation (12 objective-specific elements) | Part 08 L4581–4609 | ✅ partial | `src/app/dashboard/landing-pages/`; see §8 |
| Step 10 AI Distribution Engine (where/when/how often/audience/sequence/budget/channel priority) | Part 08 L4611–4629 | 📦 | `source-notes/08` |
| Step 11 AI Performance Learning (learns visuals, colours, emojis, hashtags, hooks, CTA, audience; improves automatically) | Part 08 L4631–4649 | 📘 | `docs/ai-os/06-architecture.md` (learning loop) |
| Autonomy Level 1 — Assisted (user approves everything) | Part 08 L4655–4657 | 📘 | `docs/ai-os/02-users-and-command-centres.md` (autonomy dial L0–L3) |
| Autonomy Level 2 — Semi-Autonomous (AI creates, user approves launch) | Part 08 L4659–4663 | 📘 | `docs/ai-os/02` |
| Autonomy Level 3 — Fully Autonomous (create/launch/pause, reallocate budget, change creatives, retarget, follow up, recover leads without intervention) + Fully Autonomous Campaign Mode toggle | Part 08 L4665–4687; Part 10 L5847–5871 | 📘 | `docs/ai-os/02` (L3) + safety controls 📦 Part 13 L13734–13741 |
| The Real Differentiator — results-driven campaign ecosystems (11 components), never "one ad" | Part 08 L4689–4729 | ✅ partial | campaign builder output structure; full ecosystem generation 📦 |
| AI Campaign Score™ (8 dimensions: Conversion Probability, Revenue Probability, Audience Match, Emotional Strength, Attention, Trust, Urgency, Scalability) | Part 08 L4731–4755; inv-5 | 📦 | `source-notes/08`; related audit scores ✅ `src/lib/ai/audit.ts` |
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
| First-party customer intelligence (leads, WhatsApp chats, calls, bookings, purchases, abandoned forms, objections, repeat buyers, location demand, competitor gaps) | Part 02 L483–506 | ✅ partial | `src/app/dashboard/customers/` + demo intelligence dataset `src/lib/data/`; full capture pipeline 📘 `docs/ai-os/06` |
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
