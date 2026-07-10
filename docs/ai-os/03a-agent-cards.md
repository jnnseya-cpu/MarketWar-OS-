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
