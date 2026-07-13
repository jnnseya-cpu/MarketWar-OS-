# 04 — Full Platform Module Specification

Module-by-module product spec. Modules M-01 → M-15 exist in the shipped Phase-0
platform (`src/app/dashboard/*`) and are upgraded here; M-16 → M-30 are the AI-OS
build-out. Every module lists: purpose, primary users, key screens, data
read/write, agents involved, and acceptance criteria. Nothing from the source
concept documents is removed.

Legend: 🟢 shipped (Phase 0) · 🟡 upgrade of shipped module · 🔵 new build

---

## A. Acquisition & intelligence modules

### M-01 🟡 Business Onboarding Intelligence
- **Purpose:** capture the Business Brain (digital twin seed) in ≤10 questions.
- **Users:** U1, U4 (on behalf of clients).
- **Screens:** 4-step intake (shipped `src/app/onboarding`), + NEW: connector quick-links
  (GBP, Meta, Shopify, CSV import) and consent capture.
- **Writes:** `businesses`, `business_brain`, `consents`.
- **Agents:** Business Diagnosis (auto-fires on completion).
- **Accept:** intake ≤3 min median; audit generated <30 s; twin fields ≥80% populated after connectors.

### M-02 🟡 Marketing Failure Audit
Shipped scoring engine (`src/backend/audit.ts`) upgraded with model-assisted evidence
extraction (website/GBP/ad-library fetch via connectors). Output contract unchanged:
9 scores, top-5 reasons, funnel-leak map, marching orders. **Accept:** deterministic
fallback always available; scores reproducible from stored inputs.

### M-03 🟡 Business Brain (digital twin)
Central memory: identity, offers, margins, seasonal patterns, objection bank,
winning hooks, competitor list, revenue patterns. Exposed to agents via memory API
with field ACLs. **New:** embedding index per tenant (vector store) for
Ask-the-OS RAG. **Accept:** every agent call carries twin version hash (replayability).

### M-04 🟡 Customer Intelligence Vault
Shipped table + segments + charts, upgraded with: import pipeline (CSV/Excel/
Shopify/Stripe/HubSpot/Mailchimp/WhatsApp export/Google Sheets/POS), dedupe +
validation jobs, full scoring fields (engagement, intent, churn, LTV, referral,
recovery), 11 AI segments, consent status per channel. **Accept:** 50k-contact
import <5 min; scoring nightly; consent enforced at send time.

### M-05 🟡 AI Customer Resurrection Engine
Recovery probability scoring → AI Revenue Recovery Score™ → wave campaigns
(comeback, abandoned quote, missed booking, repeat, VIP, referral, seasonal) →
response tracking → pipeline re-entry. **Accept:** recovery £ attributed to wave id;
one-redemption caps enforced.

### M-06 🟡 One-Click Campaign Builder + Campaign Packs
Goal → objective, audience, copy, creative direction, CTA, landing page, follow-ups,
retargeting, budget split. **New:** pack library (industry × goal templates with
learned priors), autonomy-levelled launch (L0 draft → L2 launch ≤ cap).

### M-07 🟡 Content Factory
30-day calendars, reels/TikTok scripts, posts, hashtags, local community posts —
every asset carries an owned-channel CTA and a tracking tag. **New:** brand-guard
rules engine (U5), asset performance feedback into hook bank.

### M-08 🟡 WhatsApp + SMS Conversion Engine (Sales Center)
Thread pipeline with stages, intent scores, funnel chart (shipped). **New:** live
WhatsApp Business Platform connector, AI qualification flows, SLA timers,
ghost-recovery automation, template management + approval sync. **Accept:**
P95 first-response (AI) <10 s; every thread attributed to campaign.

### M-09 🟡 Landing Page Generator
Blueprint agent (shipped) → **New:** actual page publishing on tenant subdomains
(`{slug}.pages.marketwar.os`), block-based renderer, A/B variants, pixel + webhook
capture, WhatsApp deep-link buttons. **Accept:** page live <60 s from approval.

### M-10 🟡 Retargeting Engine
Audience sync (clicked-no-buy, messaged-ghosted, viewed, form-started, video-watched,
app-no-order) to Meta/Google/TikTok custom audiences; sequenced follow-up copy.

### M-11 🟡 Competitor Intelligence Center
Threat board (shipped) + **New:** scheduled scrapes (ad libraries, GBP, pricing
pages, review feeds), delta alerts, counter-campaign generator hooked to M-06.

### M-12 🟡 Local Domination Engine
Visibility metrics + plan agent (shipped) + **New:** GBP API integration (posts,
services, photos, review replies), review-ask automation in WhatsApp flow,
geo-offer grid deployment.

### M-13 🟡 Budget Protection Engine (Financial Shield)
Hourly spend scan; kill criteria; reroute; "money saved" receipt (shipped UI).
**New:** live ad-platform connectors, L3 autonomy with hard daily reroute cap,
protection ledger. **Accept:** waste-stop latency <1 h from criteria breach.

### M-14 🟡 Revenue Intelligence Dashboard
Attribution table + charts (shipped). **New:** settlement-grade attribution via
BitriPay events, leak detection jobs, 30-day base/push/stretch forecast models.

### M-15 🟡 Daily Strategic Briefing / AI Growth Strategist
Shipped. **New:** per-role briefings (U2/U3/U4 variants), action completion loop
(unactioned orders resurface with decay).

## B. Commerce & ecosystem modules

### M-16 🔵 Agency Control Center
Client grid, ACU pooling, white-label reports, cross-client pack deployment,
client billing (BitriPay). Spec in `02-users-and-command-centres.md` §U4.

### M-17 🔵 Marketplace Demand Router
Buyer demand captured anywhere in the network routes to vendor tenants (U9) by
category/geo/rating/SLA; commission on fulfilment (stream R4). Screens: listing
manager, lead inbox, quote/schedule/invoice.

### M-18 🔵 Referral & Affiliate Engine
Tracked links, reward rules, commission ledger, payout via BitriPay; U6 command
centre. Fraud screening by the Fraud Agent (self-referral, click farms).

### M-19 🔵 Products & Offers Catalog
Structured catalog (products, services, bundles, price books, margins) feeding
Offer Builder, landing pages, marketplace and payments. Single source of price truth.

### M-20 🔵 Wallet & Ledger
Tenant wallet: ACU balance, BitriPay settlement balance, commission balances,
payouts. Double-entry ledger, immutable postings (see `07-database-and-api.md`).

### M-21 🔵 Billing & Subscription
Plans, seats, ACU packs, add-ons, dunning, VAT/tax via connector, invoices.
Self-serve upgrades driven by Monetisation Agent triggers.

## C. Platform & governance modules

### M-22 🔵 Notification System
In-app, push, email, SMS, WhatsApp — one notification service with per-user channel
preferences and quiet hours; all agent receipts flow through it.

### M-23 🔵 Automation / Workflow Studio
Visual trigger→condition→action builder over the event bus (the Zapier-killer for
in-OS flows). Agent actions available as steps; autonomy levels apply.

#### M-23a Critical automation specifications (adopted from v3.0 spec §11 — binding)

The automation framework is a production-grade event-driven orchestration layer
on Pub/Sub + Cloud Tasks. Every automation defines explicit trigger conditions,
action sequences, approval gates, fallback paths and outcome logging. Six
critical automations ship with the platform:

| Automation | Trigger | Conditions | AI action chain | Human gates | Success metric (binding) |
|---|---|---|---|---|---|
| **Campaign Auto-Launch (L3)** | Opportunity score > 75 + BVI > 60 + L3 active | Sufficient ACU balance · no active campaign in same category · budget available | Diagnosis pre-flight → Campaign Commander full campaign → Ad Creative assets → Landing Page build → live | Exception alert only — email + push with **60-second abort window** | **Live within 10 minutes** of trigger; ROAS > floor within 48 h |
| **Budget Protection Auto-Pause** | ROAS < floor for > 15 consecutive min | Not data lag (verified by 2+ data points) · campaign spend > £20 | Pause → calculate reallocation → reallocate to top performer | None at L3; email post-action | Zero further wasted spend; **reallocation completes < 60 seconds** |
| **Customer Resurrection Cycle** | Monthly schedule + dormant-revenue risk > 60 in BVI | Database imported · **> 100 dormant contacts** · user on **Growth plan+** | Segment → score each contact → personalised sequences → launch across configured channels | L1/L2: user approves launch; L3: executes with notification | **> 8% reactivation rate**; revenue recovery within 30 days |
| **Competitor Response Campaign** | Competitor spend +30% in 7 days (Competitor Intelligence Agent) | Same category & geography · campaign budget available | Growth Strategist response brief → Campaign Commander counter-campaign → Ad Creative response creatives | L1/L2: user approves; L3: executes with alert | **Counter-campaign live within 4 hours** of trigger |
| **Creative Fatigue Swap** | CTR degraded > 35% from peak, creative running > 7 days | Statistical significance confirmed (**> 1,000 impressions** at degraded rate) | Ad Creative generates 3 replacements → Campaign Commander schedules swap at next midnight UTC | L1: user approves swaps; L2/L3: auto-swap with notification | CTR recovery to ≥ 80% of peak within 7 days |
| **Lead Re-Engagement** | Form abandoned > 90 seconds without completion | Name or email captured · WhatsApp/email configured | Lead Capture Agent sends personalised recovery message **within 90 seconds** on configured channel | None — fully autonomous | **> 15% abandoned-lead recovery rate** |

### M-24 🔵 Reporting & Analytics Module
Scheduled/white-label PDF + live dashboards per role; warehouse-backed (see
`06-architecture.md` §Data). All charts follow the platform viz system (validated
palette, shipped in `src/components/charts.tsx`).

### M-25 🔵 Audit Trail Module
Every mutation, agent decision, gate, login, key use → append-only log with search;
regulator view (U12). Schema in 07.

### M-26 🔵 API & Developer Portal
Keys, scopes, usage, webhook config + replay, sandbox tenant, docs. Spec in 05/07.

### M-27 🔵 Security Center (tenant-facing)
Sessions, devices, MFA enrolment, key hygiene alerts, export of tenant audit log.

### M-28 🔵 BitriPay Merchant Portal
Full spec in `05-bitripay-and-connectors.md`.

### M-29 🔵 Knowledge & Learning Center
How-it-works (shipped page), playbooks, in-context coaching from the Knowledge Agent.

---

## D. Admin Super Control Centre (M-30 🔵) — §14 of the master directive

The internal U10/U11 surface. **Everything below is read-heavy, action-gated,
and every action is dual-logged (actor + reason).**

### D.1 Panels

| Panel | Contents | Actions (U11 unless noted) |
|---|---|---|
| Platform P&L | MRR/ARR by stream (7 streams), ACU economics (buy price vs sell price per model tier), gross margin, BitriPay take | Export; price-book changes via Pricing Agent proposals |
| Tenants | Search, health score, plan, usage, churn risk, LTV | Impersonate (consented, logged), suspend, credit ACU |
| Transactions | Payment volume, disputes, refunds, settlement queues | Force-settle hold, dispute escalate (U10 allowed) |
| AI Operations | Model spend by provider/tier/agent, latency P50/95/99, error rates, token budgets | Switch routing table, set tenant ACU caps |
| Agent Governance | Prompt versions, policy versions, autonomy distribution, eval scores, drift alerts | Freeze agent (kill-switch), rollback prompt, edit policy (2-person rule) |
| Fraud & Risk | Fraud queues (signup, payment, referral), risk scores, blocked entities | Approve/deny/holds |
| Compliance | DSAR queue, consent coverage, KYC/AML review queue, retention jobs | Approve KYC escalations |
| System Health | SLO dashboards, error budget burn, incident timeline, dependency status | Trigger runbooks (pre-approved set) |
| Access & Keys | Admin roster, role grants, API key inventory, secret rotation age | Grant/revoke (2-person rule for U11 grants) |
| Audit Search | Full-text over audit trail | Export with case id |

### D.2 Hard controls
- **Two-person rule:** U11 role grants, agent policy edits, price-book changes.
- **Kill-switches:** per-agent, per-connector, per-tenant sending, global send-freeze.
- **Break-glass:** time-boxed elevated access with mandatory incident id, auto-revoke.
- **No raw data export** of cross-tenant PII — aggregate/anonymised only.

### D.3 Acceptance
Admin actions P95 <2 s; every panel has an API twin (admin API, scope `admin:*`);
kill-switch propagation <10 s platform-wide.
