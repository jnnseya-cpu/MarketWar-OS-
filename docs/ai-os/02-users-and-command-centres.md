# 02 — User Ecosystem & AI Command Centres

Every user type receives a dedicated **AI Command Centre**: a personalised,
predictive surface where agents brief, recommend and (within policy) act. This
document defines each user type, what their command centre sees, what it can do,
and which decisions it may execute autonomously versus recommend.

---

## 1. Complete User Ecosystem

| # | User type | Description | Primary jobs-to-be-done |
|---|---|---|---|
| U1 | Business Owner | Owner-operator of a single SMB | "What's working, what's wasting money, what do I do today?" |
| U2 | Marketing Manager | Runs campaigns inside a business | Campaign control, calendar, attribution, A/B verdicts |
| U3 | Sales / Front-of-house | Works leads and conversations | Hot leads, WhatsApp threads, follow-ups, bookings |
| U4 | Agency Operator | Manages many client businesses | Multi-client dashboard, white-label reports, ACU pooling, billing |
| U5 | Enterprise / Franchise | Multi-location brand | Territory comparison, central brand control, regional demand maps |
| U6 | Affiliate / Promoter | Distributes offers for commission | Links, assets, commission tracking |
| U7 | Merchant (BitriPay) | Accepts payments through the gateway | Onboarding, keys, settlement, disputes |
| U8 | Developer / API partner | Builds on the OS APIs | Keys, sandbox, webhooks, docs, usage |
| U9 | Service Provider / Marketplace vendor | Sells services through the demand router | Listings, lead routing, fulfilment |
| U10 | Platform Operator (internal) | Runs the OS itself | Health, revenue, fraud, agent governance |
| U11 | Super Admin | Highest internal authority | Everything U10 plus policy, kill-switches, financial controls |
| U12 | Regulator / Auditor (read-only) | Compliance access | Audit trails, consent ledgers, decision logs |

Role-based access control matrix in `07-database-and-api.md` §RBAC. Every user type
maps to exactly one `role` claim plus tenant scoping; U12 is time-boxed, read-only,
fully logged.

---

## 2. The AI Command Centre — common chassis

All command centres share one chassis (built once, themed per role):

1. **Briefing strip** — the daily situation report from the role's chief agent,
   max five orders, ranked by £ impact (already shipped as Daily Briefing, M-15).
2. **Live metrics bar** — role-scoped KPIs streamed from the analytics engine.
3. **Priority panel** — actions ranked by expected value; each carries
   *why*, *impact estimate*, and a one-tap execute or approve.
4. **Agent feed** — chronological log of what agents did/blocked/escalated;
   every entry links to its audit record.
5. **Ask-the-OS** — natural-language command line over the tenant's own data
   (RAG over vault + campaigns + finances; never cross-tenant).
6. **Autonomy dial** — L0 (recommend only) → L1 (execute reversible actions)
   → L2 (execute with spend cap) → L3 (fully autonomous inside policy).
   The dial is per-capability, not global — e.g. L2 for budget shifts, L0 for pricing.

### 2.0 Command Centre panel architecture (adopted from v3.0 spec §8.1)

The Command Centre replaces the static dashboard paradigm with a **living,
AI-driven mission control** adapting to each user's context, role, business
state and priorities in real time. Eight panels with binding update
frequencies; status marks map to the shipped app:

| Panel | Type | Update frequency (binding) | AI component | User interaction | Status |
|---|---|---|---|---|---|
| Business Vitality Index | Gauge + sparkline | Every 15 min (Firestore listener) | MOA + Revenue Intelligence | Tap for dimension breakdown | ✅ shipped (`src/components/BviCard.tsx` — gauge, sparkline, 12-dimension breakdown with binding weights; Firestore listener at P1) |
| AI Priority Queue | Action-card stack | Real-time (Pub/Sub push) | MOA + Decision Engine | One-click execute / dismiss / defer | ✅ shipped (priority panel; real-time push at P1) |
| Daily Growth Briefing | Narrative card, TL;DR + expand | 06:00 daily + on-demand | Growth Strategist | Expand / share / export | ✅ shipped (briefing page) |
| Live Performance Metrics | Real-time KPI tiles | Every 5 min (campaign API sync) | Revenue Intelligence | Drill down to campaign level | ✅ shipped (metrics bar + charts; live sync at P1) |
| Opportunity Radar | Ranked cards with scores | Daily refresh + real-time alerts | Opportunity Discovery Agent | One-click Launch Campaign | 📘 with Agent 2 |
| Campaign War Room Feed | Live campaign cards | Every 5 min | Campaign Commander | Scale / Pause / Retarget / Fix | ✅ shipped (war-room grid + feed card) |
| Customer Recovery Feed | Segment tiles with revenue projections | Daily refresh | Resurrection Engine | One-click launch resurrection | ✅ shipped (recovery module; feed tile at P1) |
| Agent Activity Feed | Timeline log of agent actions | Real-time | All agents (audit trail) | Tap to view **reasoning trace** | 📘 P1 — feeds from `agent_tasks.reasoningTrace` |

### 2.1 Standard command-centre agent staff (per master directive)

Each command centre is staffed by seven personal agents drawn from the roster in
`03-agent-ecosystem.md`, specialised to the role's scope:

| Personal agent | Function | Backing platform agent(s) |
|---|---|---|
| AI Chief of Staff | Planning, scheduling, prioritisation, decision support, risk alerts | Master Orchestrator + Growth Strategist |
| AI Analyst | Data analysis, reporting, forecasting, recommendations | Revenue Intelligence + Analytics engine |
| AI Research Agent | Market, competitor, industry, opportunity intelligence | Competitor Spy + Demand Detection |
| AI Automation Agent | Process automation, workflow execution, task delegation | Workflow engine + Lead Capture |
| AI Growth Agent | Acquisition, retention, profit optimisation | Campaign Commander + Offer Builder |
| AI Security Agent | Threat, access, fraud, anomaly monitoring (role-scoped) | Fraud/Threat agents (§03) |
| AI Knowledge Agent | Memory, learning, organisational intelligence | Business Brain / digital twin |

---

## 3. Command centres per user type

### U1 — Business Owner Command Centre  *(shipped as Executive Command Center, extended)*
- **Sees:** revenue vs spend, cost/order, recoverable revenue, live campaigns,
  threads needing replies, competitor moves, cash impact of today's orders.
- **Can execute (≤L2):** approve scale orders, fire recovery waves, reply-assist in
  WhatsApp, pause campaigns, accept offer recommendations.
- **Recommend-only (L0):** price changes, new market entry, credit decisions.
- **Data scope:** own tenant, all modules.

### U2 — Marketing Manager Command Centre
- **Sees:** experiment grid with verdict countdowns, creative performance by hook,
  audience overlap warnings, content calendar, channel mix.
- **Can execute:** launch pre-approved campaign packs, rotate creative, reallocate
  ≤20%/day of budget between ad sets (L2 cap), schedule content.
- **Escalates:** kill decisions above £X lifetime spend → owner approval.

### U3 — Sales Command Centre
- **Sees:** intent-ranked thread queue, lead scores, follow-up SLA timers,
  booking pipeline, revenue opportunity list.
- **Can execute:** AI-drafted replies (one-tap send), booking confirmations,
  follow-up sequence enrolment, lead status changes.
- **Never sees:** ad spend, margins, other tenants. Field-level RBAC.

### U4 — Agency Command Centre  *(M-16)*
- **Sees:** client health grid (traffic-light per client: ROAS, verdict mix, churn
  risk), ACU pool burn, white-label report queue, cross-client benchmarks
  (anonymised percentile bands, never raw competitor data).
- **Can execute:** deploy campaign packs across clients, generate branded reports,
  rebalance ACU allocations, onboard new client (triggers U1 provisioning).
- **Chief of Staff extra:** Monday portfolio briefing — which clients need saving,
  which are upsell-ready.

### U5 — Enterprise / Franchise Command Centre
- **Sees:** territory league tables, regional demand heat, local campaign compliance
  vs brand rules, per-location P&L attribution.
- **Can execute:** push brand-approved campaign templates to locations, lock/unlock
  local autonomy levels, approve regional budgets.
- **Brand Guard:** central creative rules enforced at generation time — locations
  literally cannot generate off-brand assets.

### U6 — Affiliate Command Centre
- **Sees:** clicks, conversions, commission ledger, top-performing assets.
- **Can execute:** mint tracked links, pull approved creative, request payout
  (routes through BitriPay settlement, §05).

### U7 — Merchant Command Centre (BitriPay)
- **Sees:** volume, settlement schedule, dispute queue, decline analytics,
  fraud-screen outcomes.
- **Can execute:** refunds ≤ policy cap, respond to disputes, rotate keys, configure
  webhooks. Full spec in `05-bitripay-and-connectors.md`.

### U8 — Developer Command Centre
- **Sees:** API usage, error rates, latency, webhook delivery health, sandbox state,
  changelog.
- **Can execute:** create/rotate keys, replay webhooks, promote sandbox → live
  (gated by compliance status).

### U9 — Marketplace Vendor Command Centre
- **Sees:** routed demand (leads matched to their service), acceptance SLA, ratings,
  earnings.
- **Can execute:** accept/decline leads, quote, schedule, invoice via BitriPay.

### U10/U11 — Operator & Super Admin Command Centres
Specified fully in `04-platform-modules.md` §Admin Super Control Centre. Summary
scope: platform revenue, ACU economics, AI provider spend, fraud queues, agent
governance (prompt/policy versions, autonomy caps), system health, kill-switches.

### U12 — Regulator/Auditor View
Read-only command centre rendering: consent ledger, decision-log search, DSAR
(data subject access request) export tooling, retention-policy attestations.
Every session is itself audit-logged (who audited the auditors).

---

## 3a. User journey — new business owner, first 30 days (adopted from v3.0 spec §8.3.1)

| Day | Stage | AI-OS actions | User experience |
|---|---|---|---|
| 1 | Onboarding | Profile collection → Business Diagnosis full audit → Customer Pain Intelligence profiles target customer | **"Why You're Not Getting Customers" report within 10 minutes** of completing the profile *(binding SLA; shipped audit already returns in seconds)* |
| 1–2 | Strategy formation | Growth Strategist 30-day plan → Offer Builder creates 3 scored offers → Campaign Commander designs first campaign | AI growth plan with **one-click approval** for the first campaign |
| 3–7 | First campaign live | Ad Creative generates creatives → Landing Page Agent builds conversion page → live at **L2 (user approves launch)** | Live monitoring in the War Room — real-time metrics, AI confidence score visible |
| 7–14 | Optimisation | Budget Protection 24/7 → A/B results feed Campaign Commander → competitor scan runs | Daily briefing with a performance narrative — what's working, what's paused, why |
| 14–30 | Scale | MOA detects **ROAS > 2.5×** → recommends scaling → executes automatically at L3 → Resurrection Engine imports existing database | Dormant-revenue recovery alongside campaign scaling — **double revenue acceleration** |

The journey chains the shipped modules in exactly their build order
(onboarding → audit → offers → campaign builder → war room → briefing →
recovery); the 2.5× scale trigger joins the Budget Protection thresholds
(Agent 7) as a binding number.

## 4. Decision rights matrix (excerpt — full matrix in appendix table `decision_rights`)

| Decision | U1 | U2 | U3 | U4 | Agent max autonomy |
|---|---|---|---|---|---|
| Pause losing campaign | ✅ | ✅ | — | ✅ (client-scoped) | L3 (auto, with receipt) |
| Scale budget +40% | approve | propose | — | approve | L2 (≤ cap, else gate) |
| Send recovery wave | ✅ | ✅ | ✅ | ✅ | L2 (consent-checked) |
| Change prices | ✅ | — | — | propose | L0 (recommend only) |
| Refund payment | ✅ | — | — | — | L1 (≤ policy cap) |
| Rotate API keys | owner/dev | — | — | — | L0 |
| Kill-switch an agent | U10/U11 only | | | | n/a (human-only) |
