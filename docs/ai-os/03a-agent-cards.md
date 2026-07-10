# 03a — Agent Cards (adopted from v3.0 spec §4.2)

Operational cards for each specialist agent: mission, binding triggers,
escalation rules, KPIs and learning mechanisms. Adopted additively on top of
the roster in `03-agent-ecosystem.md` — where a card enriches a shipped
agent, both compose; nothing is downgraded. Model/API calls route via the AI
Gateway per the production architecture; source-named providers are preserved
in `../reference/ai-os-specification-v3-imported.md`.

Card conventions: **Triggers** and **Escalation** are binding; **KPIs** are
the grading contract; **Learning** feeds the doc-06 learning loop.

---

## MOA — Master Orchestrator Agent

Adopted in full in `03-agent-ecosystem.md` §2.1 (BVI, PIQ, conflict
resolution, escalation rules, KPIs, learning).

---

## Agent 1 — Business Diagnosis Agent

**Mission:** root-cause analysis of every business's customer-acquisition
failure points *before* any campaign is created — a clinically accurate
marketing health report that grounds all subsequent agent actions.

**Responsibilities**
- Full "Why You Are Not Getting Customers" report with structured root-cause analysis *(shipped: audit engine + report UI)*
- Funnel Leak Map — exact conversion drop-off points *(shipped)*
- 5-dimension risk scoring: Conversion Risk, Trust Deficiency, Offer Weakness, Audience Mismatch, Channel Misalignment *(shipped engine scores a 9-dimension superset — composes)*
- Competitor gap analysis vs top 3 identified competitors
- Prioritised Remediation Plan ranked by expected revenue impact with ROI estimates
- Partial re-diagnosis whenever **BVI drops > 15 points in 7 days**

**Inputs → Outputs:** business profile (name, URL, industry, location,
pricing), social links, past ad-spend data, competitor URLs, GA4/pixel data,
customer reviews → diagnostic report (JSON + human-readable), funnel-leak map
coordinates, risk scores, competitor gap table, remediation plan with ROI.

**Triggers (binding):** new-business onboarding (mandatory) · BVI −15 in 7
days · user-initiated re-audit · monthly scheduled refresh.

**Services:** reasoning via AI Gateway; connectors: Google Trends,
SimilarWeb, review scraping, GA4, Meta Pixel (connector registry, doc 05).

**KPIs:** remediation-plan acceptance **> 70%** · plan action-completion
rate · post-remediation revenue lift vs baseline · ACU cost per diagnosis
**< 50 ACUs**.

**Escalation:** website returns error codes or social links inaccessible →
human-assisted manual profile completion.

**Learning:** trains on remediation outcomes (which fixes produced the
highest revenue lift); prioritisation weights refined **quarterly**.

---

## Agent 2 — Opportunity Discovery Agent

**Mission:** continuously scan the market landscape to surface profitable
opportunities — trending niches, demand spikes, competitor weaknesses,
seasonal windows, emerging customer pain points — before they are widely
exploited. *(New agent: powers the "Opportunity Discovery" pillar; extends
the AI Demand Detection engine from the source master notes.)*

**Responsibilities**
- Scan Google Trends + keyword-volume feeds **every 24 hours** per business category
- Monitor Meta Ad Library + Google Ads Transparency Centre for emerging creative patterns
- Analyse review-sentiment clusters to detect unmet pain points in underserved categories
- Detect seasonal demand curves and event windows on a **12-week forward horizon**
- Score each opportunity on 5 dimensions: Addressable Demand, Competition Intensity, Conversion Likelihood, Margin Potential, Time Sensitivity
- Deliver a ranked **Opportunity Brief** — top 5 opportunities, each with a one-click campaign-launch payload (hands off to Campaign Commander / M-06 packs)

**Inputs → Outputs:** business profile, industry category, target geography,
past brief history, competitor URLs → ranked opportunity brief (JSON),
opportunity scores, recommended campaign hooks, one-click launch payloads.

**Triggers (binding):** daily **03:00 scheduled run** per active business ·
user request · **competitor spend surge** flagged by the Competitor
Intelligence Agent (cross-agent trigger).

**Services:** via AI Gateway + connectors: Google Trends, Google Ads
transparency, Meta Ad Library, Ahrefs/SEMrush, sentiment model (doc 05
registry).

**KPIs:** opportunity→campaign conversion **> 40%** · revenue from
opportunity-triggered vs non-triggered campaigns · score accuracy vs actual
campaign ROAS · unique opportunities surfaced per 30 days.

**Escalation:** none automated — opportunities are recommendations; the user
approves launch unless **L3 autonomy** is active.

**Learning:** scoring model refined from which opportunity types convert;
A/B outcome data re-weights the five scoring dimensions.

---

## Agent 7 — Budget Protection Agent

**Mission:** eliminate wasted ad spend as a 24/7 autonomous financial
guardian — real-time monitoring of every active campaign, protective actions
the moment thresholds are breached. *(Enriches the shipped Budget Protection
agent — the Financial Shield, M-13 — with exact trigger mathematics.)*

**Responsibilities**
- ROAS floor per campaign — **user-configurable, default 1.5×**
- CPL anomaly detection with **statistical-significance gating** (prevents over-triggering on short-term fluctuations)
- Auto-pause within seconds of a **sustained breach > 15 minutes** at L3
- Instant budget reallocation to the highest-performing active campaigns
- Routes AI generation to the **lowest-cost capable model** to protect platform margins *(= the AI Gateway router's cost policy — composes)*
- **ACU cost preview before any task consuming > 100 ACUs**
- Periodic Budget Protection Report: every pause, reallocation and £ saved *(the shipped "money saved receipt", formalised)*

**Inputs → Outputs:** real-time campaign metrics (Meta/Google APIs), ROAS
thresholds, CPL benchmarks, budget allocations, ACU ledger → pause commands,
reallocation instructions, notifications, Budget Protection Reports, ACU cost
previews.

**Triggers (binding):** **5-minute** campaign-metric refresh · ROAS below
floor **> 15 min** · CPL **> 2× benchmark** · daily budget **80% consumed**
before the projected daily revenue target is reached.

**Services:** Meta Marketing API, Google Ads API, campaign-metrics store,
ACU ledger service, notification service (doc 05 registry).

**KPIs:** total wasted spend prevented per month · **false-positive pause
rate < 5%** · revenue recovered via timely reallocation · **ACU margin
protection > 35%** on all AI tasks *(joins the margin-rule reconciliation in
the coverage-matrix gaps register: 4×/5×/400%/66% floors — charge the max of
the applicable floors)*.

**Escalation:** budget **> £500/day with ambiguous ROAS**, or **all campaigns
simultaneously triggering pause logic** (systemic-anomaly guard) → human.

**Learning:** learns optimal pause timing per industry vertical; delay
thresholds adjusted from historical false-positive rates.

---

## Agent 9 — Customer Resurrection Engine Agent

**Mission:** recover dormant revenue from every inactive customer database —
the highest-ROI action available to any SMB — as a fully autonomous revenue
recovery system. *(Full operating contract for the shipped Lead Recovery /
Resurrection Engine, M-05, and its Revenue Recovery Score™.)*

**Responsibilities**
- Import from **10+ sources**: CSV, HubSpot, Shopify, Stripe, Mailchimp, Google Sheets, POS exports
- AI segmentation into **7 tiers**: hot buyers, inactive, repeat, abandoned leads, VIP, price-sensitive, likely-to-return
- **4 predictive scores per contact**: Churn, Reactivation, Upsell, Referral probability
- Personalised comeback sequences — message, channel, timing and offer AI-selected **per contact**
- Revenue-recovery projection **shown with ROI framing before execution**
- Multi-channel orchestration: Email, SMS, WhatsApp, retargeting ads, LinkedIn (B2B)
- Monitors resurrection performance; re-scores contacts on engagement signals

**Inputs → Outputs:** database import, business profile, purchase history,
engagement history, offer library → segmented lists, per-contact scores,
personalised sequences, recovery projections, multi-channel execution
payloads.

**Triggers (binding):** new database import · monthly resurrection cycle ·
**BVI dormant-revenue-risk score > 60** (cross-agent trigger from the MOA's
BVI dimension) · user-initiated.

**Services:** Mailchimp/Klaviyo, Twilio SMS/WhatsApp, Meta Custom Audiences,
Google Customer Match, Stripe (doc 05 registry). All sends pass the consent
ledger (doc 08 §B.3 — consent enforced in the send path).

**KPIs:** revenue recovered per campaign · reactivation rate **> 8% of the
dormant base** · unsubscribe/complaint rate **< 0.3%** · projection accuracy
**± 20%**.

**Escalation:** imports **> 10,000 contacts require explicit user approval**
before executing at scale.

**Learning:** reactivation-probability model refined per industry from
actual outcomes; **retrained monthly**.

---

## Agent 13 — AI Growth Strategist Agent

**Mission:** every user's live AI Chief Marketing Officer — daily strategic
briefings, proactive opportunity alerts, growth-experiment proposals, and
natural-language strategic guidance backed by real business data. *(Full
contract for the shipped Growth Strategist / Daily Briefing, M-15.)*

**Responsibilities**
- Personalised **Daily Growth Briefing at 06:00 local**: performance summary, opportunities, risks, recommended actions *(shipped)*
- Natural-language strategic reasoning — any question → structured, data-backed recommendation (the Ask-the-OS surface)
- Proactive opportunity alerts: competitor movements, demand spikes, seasonal windows, each with a recommended response campaign
- **Growth-experiment proposals** with hypothesis, predicted lift, required sample size and success metric
- **Monthly Business Growth Report**: narrative trend analysis + 90-day strategic roadmap
- Competitor response briefings auto-generated on significant competitor action

**Inputs → Outputs:** all agent outputs, BVI, campaign performance,
opportunity briefs, competitor intelligence, business profile, user goals →
Daily Growth Briefing (structured JSON + narrative), strategic
recommendations, experiment proposals, competitor response briefs, monthly
reports.

**Triggers (binding):** 06:00 local daily cron · **BVI change > 10 points in
24 h** · user natural-language query · competitor threat alert (cross-agent
trigger from Competitor Intelligence).

**Services:** frontier-tier reasoning via AI Gateway; vector store for full
context retrieval; all business data + competitor feeds.

**KPIs:** briefing open rate **> 70%** · recommended-action take-up
**> 50%** · strategy NPS **> 75** · revenue impact of acted-upon vs ignored
recommendations.

**Escalation:** none — **intelligence-only agent (L0)**: every
recommendation requires user or MOA approval before execution.

**Learning:** trains on which recommendations get acted on and which produce
positive outcomes; refines recommendation ranking and framing over time.

---

## Agent 20 — AI Profit Protection & Margin Intelligence Agent

**Mission:** protect platform profitability at every layer — real-time
provider cost comparison, ACU margin-floor enforcement, live gross-margin
monitoring, autonomous cost optimisation on every AI task. *(The enforcement
engine of the owner pricing doctrine, doc 08 §A.1a; extends the AI Gateway's
router with cost arbitration.)*

**Responsibilities**
- Real-time provider cost comparison — OpenAI vs Gemini vs Claude vs Vertex vs open-source via **Groq** — auto-selecting the lowest-cost provider for the required quality tier *(adds Groq/open-source to the gateway provider set — additive)*
- **ACU cost prediction before every task**; tasks **> 100 ACUs need explicit user approval** *(matches Agent 7's preview rule)*
- Margin-floor enforcement, escalating through: switch provider → reduce quality tier → queue off-peak → prompt top-up
- Admin profit dashboard: revenue, provider costs, gross margin %, revenue by provider/user/feature, cost-leakage alerts *(Admin Super Control Centre P&L panel, M-30)*
- **90-day margin forecast, updated weekly**
- Platform-wide **ACU ledger reconciliation with double-entry accuracy** *(the doc-07 ledger contract)*

**Inputs → Outputs:** ACU ledger, provider cost feeds, task cost
predictions, subscription revenue, operating costs → provider routing
decisions, ACU cost previews, margin alerts, profit dashboard data, cost
optimisation recommendations.

**Triggers (binding):** every agent task invocation (pre-execution cost
calc) · daily midnight margin reconciliation · margin below alert threshold ·
admin dashboard refresh.

**KPIs:** platform gross margin **> 40%** · provider-arbitration savings
**> 15% vs single-provider** · ACU forecast accuracy **± 10%** · margin-floor
breach detected in **< 60 seconds**.

**Escalation:** platform gross margin **< 25% → super-admin emergency
cost-reduction protocol**; alert threshold at 30%.

**Margin-basis reconciliation (owner doctrine governs):** this card's
40%/30%/25% figures are **platform-wide gross margin** (all revenue, all
costs). The owner's 100%-margin floor (doc 08 §A.1a) is **per-task**: every
AI action priced ≥ 2× provider cost (= 50% task-level gross margin). Both
apply — per-task floor first, platform thresholds as the aggregate guardrail.

**Learning:** identifies consistently mis-priced task types; ACU cost models
**recalibrated monthly**.
