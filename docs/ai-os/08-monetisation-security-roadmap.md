# 08 — Monetisation Model · Security & Compliance · Build Roadmap

---

## Part A — Monetisation model (seven streams + engines)

### A.1 Revenue streams

| # | Stream | Mechanics | Margin profile |
|---|---|---|---|
| R1 | Subscriptions | Recon (free wedge) → Commander £49/mo → War Council £199/mo → Enterprise (custom, SSO/SLA) | ~90% |
| R2 | AI usage (ACU) | AI Compute Units metered per agent run by model tier; monthly allowance per plan + top-up packs | 60–80% (router-managed) |
| R3 | BitriPay transaction take | % + fixed per transaction; volume tiers; FX spread on multi-currency | 40–60% net of scheme costs |
| R4 | Marketplace commission | % of fulfilled routed demand (M-17) | ~85% |
| R5 | API & licensing | Developer plans, white-label licences, per-seat embeds | ~90% |
| R6 | Affiliate/partner network | Take on commission flows (M-18) | ~85% |
| R7 | Data intelligence | Anonymised industry benchmark reports; premium demand-detection feeds. **Aggregate only, k-anonymity ≥ 50 tenants per cell, never per-tenant data** | ~95% |

### A.1b Seven-stream pricing & revenue targets (adopted from v3.0 spec §12.1)

Pricing points and Year-1/Year-3 targets per stream. These compose with the A.1
stream mechanics (the v3 stream set refines R1–R7 — Campaign Packs and the
Premium Agent Marketplace are the productised faces of ACU recycling; all
prices remain subject to the A.1a 100% margin floor):

| Stream | Model | Pricing | AI optimisation | Year 1 | Year 3 |
|---|---|---|---|---|---|
| Subscription | Monthly/annual SaaS | **£9–£99/mo (Free → Enterprise)** | Churn-prediction retention triggers; upgrade recommendation engine | **£800K ARR** | **£22M ARR** |
| ACU consumption | Pay-as-you-go above allowance | **£1 = 100 ACUs; top-ups from £5** | Usage forecasting per user; proactive top-up nudges before depletion | £200K | £12M |
| Campaign packs | One-off bundles | £5–£49/pack (e.g. "Restaurant Launch Pack") | AI creates once, sells infinite times; seasonal targeting | £80K | £2.5M |
| Marketplace transactions | Commission on bookings/orders | 8–15% per transaction (Phase 3) | AI demand routing maximises match quality | £0 (P3) | £6M |
| Performance-based | Pay-per-lead/booking | £2–£50 per qualified lead by industry | Lead-quality scoring maintains advertiser ROI | £50K | £3M |
| API & white-label | Monthly licensing | £199–£999/mo reseller; £0.001–£0.05/call | Usage-based scaling, enterprise volume discounts | £100K | £3M |
| Premium agent marketplace | One-off + subscription templates | £9–£199/agent pack; £19/mo premium library | AI-curated top performers; per-business-type recommendations | £50K | £2.5M |

**Total targets: Year 1 ≈ £1.28M · Year 3 ≈ £51M.** Note: the £9–£99
subscription band is the v3 tier ladder (Free → Enterprise); the earlier
Commander £49 / War Council £199 naming maps into it as mid/upper tiers —
both recorded, owner pricing doctrine governs final price cards.

### A.2a ACU recycling — asset economics (adopted from v3.0 spec §12.2)

ACU recycling is the **highest-margin revenue opportunity**: assets created
once sell repeatedly at near-zero marginal cost. Target gross margin on
recycled assets: **10×–50×** (900–1,900% — far above the 100% floor).

| Asset type | Creation cost | Sale price | Margin | Volume potential |
|---|---|---|---|---|
| Industry campaign playbook (e.g. "Salon Growth Playbook") | 200 ACUs (£2) | £19.99/sale | 900%+ | 1,000+ sales per popular vertical |
| Proven ad framework pack | 50 ACUs (£0.50) | £9.99/pack | 1,900%+ | Unlimited resales |
| Pre-built funnel template (per industry) | 300 ACUs (£3) | £29.99 | 900%+ | Every new business needs one |
| AI agent pack (e.g. "Restaurant Growth Agent") | 500 ACUs (£5) to configure | **£49.99/mo subscription** | Recurring 900%+ | Standalone vertical product |
| Prompt library (premium collections) | 100 ACUs (£1) | £19.99 one-time | 1,900%+ | Developer & power-user segment |

### A.1a Owner pricing doctrine (binding — supersedes conflicting margin rules)

1. **Hard floor: profit margin never below 100%** — every billable AI action
   is priced at **≥ 2× its fully-loaded provider cost**. No exceptions, no
   promotional breaches of the floor. (Matches the source ACU Economics
   Framework minimum; supersedes the transcript-era 66% guardrail.)
2. **Competitiveness mandate: pricing must remain extremely competitive and
   attractive.** The lever is the **cost base, not the margin**: prompt
   compression, caching, template/output reuse, lowest-cost-capable model
   routing (AI Gateway), batch generation, pre-generation scoring, ACU
   recycling. Every cost saved is passed into lower headline prices at the
   same or better margin.
3. **Above the floor, price to win:** the 300–500% recommended band and the
   per-tier 3×–8× targets apply where value supports them (premium actions);
   between floor and target, competitive positioning decides.
4. Budget Protection's ACU-margin monitor enforces the floor per task and
   alerts the Admin margin dashboard on any action trending below 2×.

### A.1c Multi-brand, one account, one bill (owner ruling 2026-07-11 — binding)

One user account runs any number of brands/activities simultaneously under a
**single subscription and a single invoice**. Design goals, in the owner's
order: financially attractive first, with **100% margin protection built in
by construction**.

| Plan | Included brand slots | Extra brand slot | ACU allowance |
|---|---|---|---|
| Free Recon | 1 | — (upgrade) | 50/mo |
| Starter £9/mo | 1 | +£5/mo each (max 3) | 500/mo **pooled** |
| Growth £29/mo | 3 | +£5/mo each | 2,000/mo **pooled** |
| Pro £59/mo | 5 | +£4/mo each | 5,000/mo **pooled** |
| Agency £99/mo | 15 client workspaces | +£3/mo each | 12,000/mo **pooled** |

Why this is both attractive and floor-safe:

1. **The ACU pool is the cost governor.** All AI cost is metered per task at
   ≥ 2× provider cost (§A.1a) from one account-wide pool — adding brands
   never adds unmetered AI cost, it only spreads the same pooled allowance
   across more surfaces. The floor cannot be breached by brand count.
2. **Brand slots are near-pure margin.** An extra slot costs the platform
   ~storage only; at £3–£5/mo the margin is far above 100% while undercutting
   every competitor that forces one-subscription-per-brand (the standard
   agency-tool tax).
3. **One bill = retention lever.** Consolidated invoicing raises switching
   cost and NRR; the upsell path (more brands → more ACU top-ups → Agency)
   is the A.3 Monetisation Agent's primary play.
4. **Per-brand isolation is preserved** (doc 02 §U1a): pooled billing never
   pools data — brands stay fully separated tenants under one envelope.

### A.2 ACU system (the AI economy)

- 1 ACU = normalised unit of model cost (router maintains tier→ACU table).
- Plans include allowances (Commander 1,000/mo; War Council 6,000 pooled).
- **ACU recycling (highest-margin loop):** cached/deterministic paths (demo
  engine, template reuse, SLM classification) cost the platform ~0 but deliver
  billable value — router always attempts the cheapest sufficient path first.
- Hard per-tenant budgets prevent bill shock; `insufficient_acu` (402) with
  one-tap top-up; burn visible in every command centre.

### A.3 Growth engines

- **Dynamic pricing engine:** Pricing Agent proposes plan/ACU price tests (L0,
  Super-Admin gated, 2-person rule).
- **CLV engine:** LTV model per tenant feeds acquisition-spend ceilings for the
  platform's own funnel (dogfooding M-13 on ourselves).
- **Churn prevention:** Retention Agent triggers save-plays on health-score decay;
  the "money saved receipt" email is the primary artefact.
- **Upsell/cross-sell:** Monetisation Agent fires contextual offers (e.g. tenant
  hits WhatsApp thread cap → War Council trial) into priority panels — never email
  spam.
- **Free-wedge economics:** Recon tier costs ≤ £0.15/audit (deterministic engine +
  one frontier call) against measured audit→paid conversion; wedge CAC target < £5.

---

## Part B — Security, compliance & risk

### B.1 Zero-trust model

- Identity: Firebase Auth → platform JWT (tenant, role, autonomy caps as claims);
  MFA default-on for owner/admin roles; WebAuthn/biometric step-up for money
  actions; device fingerprinting + risk-based auth (Identity Agent).
- Every hop authenticated: user↔gateway (JWT), service↔service (workload
  identity), agent↔tool (scoped short-lived tokens), integration↔OS (API keys,
  hashed at rest, prefix-searchable).
- Network: BitriPay island in separate project/VPC; deny-by-default egress;
  Cloudflare WAF + bot management + DDoS at edge.

### B.2 Anti-abuse coverage (explicit)

DDoS (edge) · SQLi (parameterised queries only, no dynamic SQL) · XSS (CSP,
React escaping, sanitised rich text) · CSRF (SameSite + token on state-changing
non-API forms) · session hijacking (short JWT TTL + refresh rotation + device
binding) · account takeover (risk-based auth, breach-password checks) ·
credential stuffing (rate limits + hCaptcha challenge) · API abuse (quotas,
anomaly detection) · bot attacks (edge bot score + honeypots) · webhook forgery
(HMAC + timestamp) · replay (idempotency keys) · SSRF from connectors
(egress allowlist per connector) · prompt injection (tool-scope least privilege,
untrusted-content quarantine: external text is data, never instructions —
enforced in the agent runtime).

### B.3 Data protection

- Encryption: TLS 1.2+ in transit; AES-256 at rest (KMS envelope); field-level
  encryption for PII columns; tokenisation of PANs (never stored — SAQ-A);
  confidential computing for BitriPay decisioning at P3.
- Data lifecycle: retention policies per class (messages 2y default, audit 7y,
  payments 7y statutory); DSAR export/delete automated by GDPR Agent; deletion
  propagates to warehouse/lake via tombstones.
- Consent: per-contact/channel/purpose ledger enforced **in the send path** —
  a send without `granted` consent is technically impossible, not just forbidden.

### B.4 Compliance map

| Regime | Scope | Mechanism |
|---|---|---|
| GDPR/UK-GDPR | All personal data | Consent ledger, DSAR automation, DPIA per module, EU/UK data residency cells |
| PECR | SMS/email/WhatsApp marketing | Consent classes, opt-out sync |
| PCI-DSS (SAQ-A) | Card data | Hosted fields, tokenisation, PSP delegation |
| AML/KYC | BitriPay merchants, payouts | Sumsub/ComplyAdvantage flows, AML Agent, SAR runbooks |
| SOC 2 Type II (P2 target) | Platform controls | Audit log, change mgmt, access reviews |
| AI governance | All agent actions | Decision log w/ model+prompt versions, eval gates, kill-switches, human escalation (aligned to EU AI Act transparency duties) |

### B.4a Adoptions from v3.0 spec §9 (binding)

**Five authentication layers (§9.1.1):** L1 Firebase Auth (email/Google/
Apple, JWT) · L2 **TOTP MFA required for all L3-autonomy configuration and
all agency-admin accounts** · L3 device trust — unrecognised devices need
email verification + TOTP regardless of MFA setting · L4 behavioural anomaly
(geography/time/pattern) → step-up auth · L5 **every agent invocation carries
a signed service-account token**; no agent can exceed its permission scope.

**RBAC matrix (§9.1.2)** — adopted verbatim, full 7-role × 10-permission table:

| Permission | Super Admin | Agency Admin | Biz Owner | Mktg Manager | Sales | Social | Affiliate |
|---|---|---|---|---|---|---|---|
| View all platform data | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage own business | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Configure Level 3 autonomy | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Create & launch campaigns | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| View campaign analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Access customer vault | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage ACU & billing | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| White-label configuration | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View commission dashboard | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| API key management | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

This matrix maps onto the 12-user-type ecosystem (doc 02): Super Admin = U11,
Agency Admin = U4, Biz Owner = U1, Mktg Manager = U2, Sales = U3, Social =
content-scoped U2/U3 variant, Affiliate = U6. The wider ecosystem roles (U5,
U7–U10, U12) keep their scoping from doc 02/07 — additive composition, no
role removed.

**Encryption upgrades (§9.2):** **TLS 1.3 mandatory — TLS 1.2 disabled on
all endpoints** (upgrades the earlier "TLS ≥1.2" baseline) · AES-256 at rest
+ **application-layer field encryption for contact phone/email with a
separate key per business** (inter-tenant isolation) · secrets only in
Secret Manager — never codebase, env files, or logs · AI training data
anonymised + pseudonymised before any pipeline.

**Compliance implementations (§9.3):** UK GDPR (consent platform, erasure
API, export API, agency DPA templates) · EU GDPR (EU data residency + SCCs
for US providers) · PECR (timestamped consent per contact, **pre-send
compliance check by the Compliance Agent**) · PCI DSS (Stripe holds all card
data) · SOC 2 Type II (**audit trail from day 1 via `agent_tasks`; audit prep
begins month 6**) · ICO registration + **72-hour breach-notification
protocol** in the incident playbook.

**AI governance additions (§9.4):** full model/prompt lineage in
`agent_tasks` · plain-English reasoning trace on every autonomous decision ·
**any L3 action reversible within 60 seconds via emergency override; all
actions reversible by design where technically possible** ·
AI-content watermarking + generated-asset registry · **quarterly bias audits**
across industry/demographic groups with statistical-disparity alerts ·
per-agent permission scopes enforced at service-account level.

### B.5 AI governance framework

Policy-as-code: autonomy ceilings, spend caps, forbidden actions (pricing,
legal claims, sending without consent) compiled into the runtime — not prose.
Prompt registry with signed versions; golden-set evals gate any prompt/model
change; drift monitors compare weekly output distributions; per-agent and global
kill-switches (M-30); post-incident policy patches follow the same PR review as code.

---

## Part C — Developer build roadmap

Phase 0 (shipped): Next.js platform — 15 modules, 12 agents, demo intelligence,
deterministic audit engine, chart system, premium landing page.

| Phase | Timeline | Modules & agents | Technical milestones | Commercial objective |
|---|---|---|---|---|
| **MVP (P1a)** wks 1–12 | Live AI (Anthropic router), M-01→M-15 upgrades: WhatsApp Cloud API, Meta/Google connectors (read+kill), page publishing, vault imports, consent ledger | Event bus, agent decision log, gates, ACU metering, audit trail, staging+canary | 100 design partners; audit→paid ≥8%; first £ MRR |
| **Beta (P1b)** wks 9–20 | M-16 Agency, M-21 billing (Stripe Billing interim), M-22 notifications, M-23 workflow studio v1, retargeting sync, Budget Protection L3 | SLO framework, DR T1, SOC2 groundwork, eval harness, nightly grading loop v1 | 500 tenants, 20 agencies; NRR >100% |
| **Commercial launch (P2a)** wks 21–40 | **BitriPay gateway v1** (links, QR, cards via PSP partner, settlement, merchant portal), M-17 marketplace v1, M-18 referrals, M-30 admin centre full | Postgres+RLS migration (financial core), ledger, pgvector, cell architecture design, SOC 2 Type I | 3k tenants; payments GMV live; 7-stream revenue active |
| **Enterprise (P2b)** wks 37–64 | U5 franchise centre, white-label, SSO (WorkOS), M-24 white-label reporting, regulator view U12 | 99.95% SLO, SOC 2 Type II, EU/UK residency cells, DR game-days | First 10 enterprise logos; £1M ARR run-rate |
| **Global scale (P3)** wks 60–96+ | Mobile money rails, multi-currency/FX, localisation (per imported spec §17), data-intelligence products (R7), knowledge graph strategist | Cell-based multi-region, 99.99%, confidential computing (payments), online policy canaries | Geographic expansion per market playbook; £50M ARR path (Yr 3 target per v3 spec) |

**Team shape (P1):** 2 full-stack, 1 AI/agents, 1 payments/backend, 1 design,
0.5 SRE, 0.5 compliance — the imported v3 spec's team structure applies from P2.

### C.1 Week-by-week delivery roadmap (adopted from v3.0 spec §14 — binding sequence)

The v3 spec's deliverable-level schedule slots inside the phase table above.
MVP thesis: the core intelligence loop **diagnose → strategise → create →
execute → protect**, charging subscription revenue and demonstrating ROI
within 30 days of a business joining.

**MVP (wks 1–12):** Firebase setup + ACU ledger + Pub/Sub (wk 1–2) → AI
Gateway Router (wk 2–3, *shipped: `src/backend/gateway.ts`*) → app shell +
design system + Auth (wk 2–4) → Diagnosis Agent 1 (wk 4–6) → Offer Builder 4
+ Pain Intelligence 3 (wk 5–7) → Ad Creative 5, Meta/Google/TikTok formats
(wk 6–8) → Landing Page Generator 16 (wk 7–9) → Command Centre shell with
BVI/PIQ/metrics panels (wk 8–10) → Stripe billing + ACU top-up + ledger UI
(wk 9–11) → Diagnosis report UI with funnel map (wk 10–12).

**V1 (wks 9–20):** Meta Marketing API (9–12) · Google Ads API incl.
Performance Max (10–14) · Campaign Commander 6 + War Room UI (11–14) ·
Budget Protection 7 real-time ROAS + auto-pause (13–15) · WhatsApp Engine 15
via Twilio (13–16) · Lead Capture 8 (14–16) · Customer Vault MVP (15–17) ·
Revenue Intelligence dashboard (16–18) · Competitor Intelligence 10 (17–19)
· ACU billing UI (18–20).

**V2 (wks 21–40):** Resurrection 9 (21–24, P0) · Retargeting 17 (22–26, P0)
· Local Domination 11 (24–28) · Opportunity Discovery 2 (25–28, P0) · Growth
Strategist 13 (26–30, P0) · Content Factory 14 (27–30) · **L2/L3 autonomy
engine — MOA priority queue + conflict resolution (29–34, P0)** · Workflow
Agent 18 visual builder (30–35) · Digital Twin system (32–36) · Agency
multi-client + white-label + team permissions (35–40, P0).

**V3 (wks 37–96):** TikTok + LinkedIn Ads APIs (37–42, → 5 autonomous paid
channels) · ML forecasting live (38–44) · Profit Protection 20 + margin
dashboard (40–46) · **ACU Recycling Marketplace (42–50 — the 10×–50× margin
stream, §A.2a)** · Developer API portal + SDK (44–52) · affiliate
infrastructure (46–52) · Marketplace & Demand Router 19 (months 13–18) ·
cross-business anonymised benchmarks (14–20) · DemandOS routing ecosystem
(19–24).

Per-deliverable **team owners and dependency chains** (e.g. Diagnosis Agent
depends on AI Gateway Router; Ad Creative depends on Offer Builder) are
recorded verbatim in the imported spec §14.1–14.4
(`docs/reference/ai-os-specification-v3-imported.md`); role responsibilities
map to §C.2 below.

### C.2 Engineering team structure (adopted from v3.0 spec §14.5 — 9 heads)

| Role | Count | Phase 1 | Phase 2+ |
|---|---|---|---|
| Lead full-stack engineer | 1 | Architecture, Firebase setup, AI Gateway design, code review | System design leadership, performance engineering, DevOps |
| Frontend engineers | 2 | Command Centre UI, War Room, design system | Agency portal, white-label, mobile PWA, component library |
| Backend / Firebase engineers | 2 | Cloud Functions, Firestore schema, Pub/Sub, agent-task infra | Microservices refactor, BigQuery pipeline, ML inference integration |
| AI / ML engineer | 1 | All 20 agents' logic, vector memory, LLM orchestration, routing | Model training, Vertex AI deployment, RL pipeline, forecasting |
| Integration engineer | 1 | Meta, Google Ads, WhatsApp Business, Stripe, Twilio | TikTok, LinkedIn, HubSpot, Shopify, webhook marketplace |
| QA engineer | 1 | Agent output validation, test automation, regression suites | Performance/load testing, AI output-quality benchmarking |
| Product designer | 1 | Command Centre UX, design system, Figma library | Agency portal, white-label theming, mobile experience |

### C.3 Global expansion strategy (adopted from v3.0 spec §17)

| Phase | Markets | Timeline | Key adaptations | Revenue opportunity |
|---|---|---|---|---|
| 1 — Foundation | **United Kingdom** (primary) | Months 1–6 | UK GDPR, ICO registration, GBP pricing, UK English, UK ad-market knowledge | £0–£800K ARR |
| 2 — English-speaking | Ireland, Australia, Canada, USA, New Zealand | Months 7–18 | Local tax, USD/AUD/CAD tiers, local Twilio number pools, **US CCPA** | £800K–£5M ARR |
| 3 — European | France, Germany, Netherlands, Spain, Belgium | Months 13–24 | Full EU GDPR, multi-language LLM fine-tuning, local ad integrations, EUR pricing, local data residency | £5M–£15M ARR |
| 4 — African diaspora corridor | **DRC**, Nigeria, Kenya, South Africa, Ghana | Months 19–36 | French/Swahili models, **mobile-money rails (BitriPay)**, **low-bandwidth UI mode**, local compliance | £15M–£30M ARR |
| 5 — Global | LATAM, SEA, MENA | Months 30–48 | Regional LLM fine-tuning, regional ad platforms, multi-currency ACU billing, regional data centres | £30M–£50M+ ARR |

**Localisation architecture (§17.2):** language-specific prompt variants for
all 20 agents (launch: EN-GB, EN-US, FR, DE, ES) · cultural-calibration
datasets per market in Pain Intelligence · jurisdiction rule-sets in the
Compliance Agent — **new markets via configuration, not code** · regional
ad-platform knowledge in Campaign Commander (WeChat Ads, Snapchat-first
MENA) · multi-currency ACU via Stripe international + local methods (BitriPay
for DRC) · **low-bandwidth mode**: dynamic asset reduction, aggressive output
caching, offline-capable PWA.

**Strategic note (verbatim from spec):** the DRC / African-diaspora corridor
is a uniquely defensible expansion for Groupe Nseya Digital — existing
BitriPay payment infrastructure plus regional market intelligence, in a
market where no competitor has native AI marketing infrastructure.

**Definition of done, every phase:** typecheck/tests/evals green · SLOs met for
30 days · security review · rollback rehearsed · docs updated (these files are
the contract of record).

### B.3a End-to-end encryption posture (implemented 2026-07-13)

**In transit:** TLS 1.3 (§B.4a) with **HSTS preload enforced by the shipped
security headers** (`next.config.mjs`: Strict-Transport-Security 2 years +
includeSubDomains + preload, nosniff, DENY framing, strict referrer,
locked-down permissions policy) — browsers cannot downgrade.

**At rest:** `src/backend/crypto.ts` — **AES-256-GCM application-layer field
encryption with a separate 256-bit key derived per business**
(HKDF-SHA256 over `FIELD_ENCRYPTION_MASTER_KEY`). Every persistence write
passes through `encryptPii()` in `src/backend/db.ts`, so contact PII
(email/phone/WhatsApp/names) never reaches Firestore in plaintext — on top
of Firestore's native AES-256. Cross-tenant decryption is cryptographically
impossible (verified: GCM auth fails under any other tenant's key). Master
key lives in Secret Manager at go-live; rotation re-derives all tenant keys.

**Honest boundary (recorded, not hidden):** AI generation requires plaintext
at the model boundary — request payloads are decrypted in the backend layer
for the duration of the gateway call only, never logged, never persisted in
plaintext. True client-held-key E2EE (platform cannot read at all) is
scoped to the message vault at P2 where no server-side AI processing is
required; C2PA/provenance metadata per doc 10 §F applies to outputs.

**Conflict check (owner instruction 2026-07-13: implement only if no
conflict):** verified none — demo mode unaffected (53/53 smoke checks with
encryption active), AI processing untouched (encryption is at the
persistence boundary, not the request path), analytics/BVI unaffected
(only PII fields encrypt), multi-brand isolation strengthened (per-brand
keys). One forward design note, not a conflict: encrypted fields are not
directly searchable — when Customer Vault live search-by-email/phone lands
at P1, add **HMAC-based blind indexes** (deterministic keyed hash stored
alongside the ciphertext for exact-match lookup) — the standard pattern,
zero schema disruption.
