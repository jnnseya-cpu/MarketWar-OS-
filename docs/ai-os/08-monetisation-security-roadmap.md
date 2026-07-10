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

**RBAC matrix (§9.1.2)** — 7 roles × 10 permissions adopted verbatim; the
consequential rows: L3-autonomy configuration = super-admin/agency-admin/
owner only · ACU & billing = admin/agency/owner · white-label + API keys =
admin/agency only · affiliates see only the commission dashboard.

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
**any L3 action reversible within 60 seconds via emergency override** ·
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

**Definition of done, every phase:** typecheck/tests/evals green · SLOs met for
30 days · security review · rollback rehearsed · docs updated (these files are
the contract of record).
