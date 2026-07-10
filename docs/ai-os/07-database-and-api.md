# 07 — Database Schema & API Specification

Developer-ready. Phase 0/1 stores these entities in Firestore collections with the
same names; Phase 2 migrates the relational/financial set to PostgreSQL with
row-level security. DDL below is the P2 target and the contract of record.

---

## 1. Entity-relationship overview

```
tenants ─┬─< users >─── roles
         ├─< business_brain (1:1, versioned)
         ├─< contacts ─< contact_events
         │      └─< consents
         ├─< campaigns ─< experiments ─< verdicts
         │      └─< assets (creative, pages)
         ├─< threads ─< messages
         ├─< offers / products (catalog)
         ├─< agent_decisions ─< approval_gates
         ├─< wallets ─< ledger_postings >─ ledger_accounts
         ├─< subscriptions ─< invoices
         ├─< api_keys · webhooks ─< webhook_deliveries
         └─< audit_log (append-only)

merchants (BitriPay) ─< payments ─< refunds · disputes · splits
                     └─< settlements ─< settlement_lines
marketplace: listings ─< routed_leads ; affiliates ─< referrals ─< commissions
```

## 2. Core DDL (PostgreSQL 15, excerpt — canonical fields only)

```sql
-- Tenancy ---------------------------------------------------------------
CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          citext UNIQUE NOT NULL,
  plan          text NOT NULL DEFAULT 'recon',        -- recon|commander|war_council|enterprise
  status        text NOT NULL DEFAULT 'active',       -- active|suspended|closed
  region_cell   text NOT NULL DEFAULT 'eu-west-1',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  email         citext NOT NULL,
  role          text NOT NULL,                        -- owner|marketer|sales|agency|... (U1..U12)
  mfa_enrolled  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
-- RLS on every tenant-scoped table:
--   USING (tenant_id = current_setting('app.tenant_id')::uuid)

-- Business Brain (digital twin) -----------------------------------------
CREATE TABLE business_brain (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id),
  version       integer NOT NULL DEFAULT 1,
  profile       jsonb NOT NULL,       -- industry, location, offers, margins, goals…
  hooks_bank    jsonb NOT NULL DEFAULT '[]',
  objections    jsonb NOT NULL DEFAULT '[]',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Vault ------------------------------------------------------------------
CREATE TABLE contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  first_name        text, last_name text,
  email             citext, phone text, whatsapp_number text,
  location          text, postcode text, source text,
  first_seen_at     timestamptz, last_activity_at timestamptz, last_purchase_at timestamptz,
  total_spend       numeric(12,2) NOT NULL DEFAULT 0,
  average_order_value numeric(12,2), purchase_count integer NOT NULL DEFAULT 0,
  lead_status       text, customer_status text, preferred_channel text,
  engagement_score  smallint, purchase_intent_score smallint,
  churn_risk_score  smallint, lifetime_value_score smallint, referral_score smallint,
  recovery_value    numeric(12,2),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON contacts (tenant_id, customer_status);
CREATE INDEX ON contacts (tenant_id, churn_risk_score DESC);
CREATE INDEX ON contacts USING gin (to_tsvector('simple',
  coalesce(first_name,'')||' '||coalesce(last_name,'')||' '||coalesce(email,'')));

CREATE TABLE consents (              -- consent is per contact per channel per purpose
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL, contact_id uuid NOT NULL REFERENCES contacts(id),
  channel      text NOT NULL,        -- whatsapp|sms|email|phone
  purpose      text NOT NULL,        -- marketing|transactional
  status       text NOT NULL,        -- granted|withdrawn|unknown
  evidence     jsonb NOT NULL,       -- source, ip, ts, wording
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, channel, purpose)
);

-- Campaigns & experiments -------------------------------------------------
CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  name          text NOT NULL, goal text NOT NULL, channel text NOT NULL,
  hook          text, status text NOT NULL DEFAULT 'draft',   -- draft|active|paused|killed
  budget_daily  numeric(10,2), kill_criteria jsonb NOT NULL,
  scale_criteria jsonb NOT NULL,
  external_ref  jsonb,               -- platform campaign ids
  started_at    timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_metrics_daily (
  campaign_id  uuid NOT NULL REFERENCES campaigns(id),
  day          date NOT NULL,
  spend numeric(10,2), impressions bigint, clicks int,
  leads int, messages int, bookings int, orders int,
  revenue numeric(12,2),
  PRIMARY KEY (campaign_id, day)
);

CREATE TABLE verdicts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL, campaign_id uuid NOT NULL REFERENCES campaigns(id),
  verdict      text NOT NULL,        -- SCALE|FIX|STOP|TESTING
  reason       text NOT NULL, action jsonb NOT NULL,
  decided_by   text NOT NULL,        -- agent id or user id
  decision_id  uuid,                 -- FK agent_decisions
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Conversations -----------------------------------------------------------
CREATE TABLE threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL, contact_id uuid REFERENCES contacts(id),
  channel      text NOT NULL,        -- whatsapp|sms|email
  campaign_id  uuid REFERENCES campaigns(id),
  stage        text NOT NULL,        -- new|qualifying|offer_sent|booking|won|ghosted
  intent_score smallint, value numeric(10,2),
  last_message_at timestamptz, unread int NOT NULL DEFAULT 0
);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id),
  direction text NOT NULL,           -- in|out
  sender    text NOT NULL,           -- contact|agent|user
  body      text, template_ref text, sent_at timestamptz NOT NULL DEFAULT now()
);

-- Agent governance ---------------------------------------------------------
CREATE TABLE agent_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid, agent_id text NOT NULL,
  autonomy      text NOT NULL,       -- L0|L1|L2|L3
  inputs_hash   text NOT NULL, twin_version int,
  model         text NOT NULL, prompt_version text NOT NULL,
  output        jsonb NOT NULL, confidence numeric(4,3),
  action_taken  jsonb,               -- null if recommendation only
  outcome_grade numeric(4,3),        -- filled by nightly grading job
  trace_id      text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON agent_decisions (tenant_id, agent_id, created_at DESC);

CREATE TABLE approval_gates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id  uuid NOT NULL REFERENCES agent_decisions(id),
  tenant_id    uuid NOT NULL, required_role text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|expired
  expires_at   timestamptz NOT NULL, resolved_by uuid, resolved_at timestamptz
);

-- Money (double-entry) ------------------------------------------------------
CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL,          -- tenant|merchant|platform|affiliate
  owner_id uuid NOT NULL, currency char(3) NOT NULL,
  kind text NOT NULL,                -- wallet|settlement|fees|commission|acu
  UNIQUE (owner_type, owner_id, currency, kind)
);
CREATE TABLE ledger_postings (       -- append-only; no UPDATE/DELETE grants
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id uuid NOT NULL,          -- postings in a journal sum to zero
  account_id uuid NOT NULL REFERENCES ledger_accounts(id),
  amount_minor bigint NOT NULL,      -- signed, minor units
  currency char(3) NOT NULL,
  reason text NOT NULL, ref jsonb NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);

-- BitriPay -------------------------------------------------------------------
CREATE TABLE merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  legal_name text NOT NULL, kyc_status text NOT NULL DEFAULT 'pending',
  settlement_schedule text NOT NULL DEFAULT 't+3',
  fee_schedule jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  amount_minor bigint NOT NULL, currency char(3) NOT NULL,
  method text NOT NULL,              -- card|qr|link|wallet|bank|mobile_money
  status text NOT NULL,              -- requires_action|succeeded|failed|refunded|disputed
  campaign_id uuid, thread_id uuid,  -- attribution joins
  risk_score smallint, idempotency_key text UNIQUE,
  splits jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Platform ---------------------------------------------------------------
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, name text NOT NULL,
  prefix text NOT NULL, hash text NOT NULL,       -- store hash only
  scopes text[] NOT NULL, mode text NOT NULL,     -- live|test
  last_used_at timestamptz, revoked_at timestamptz
);
CREATE TABLE webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, url text NOT NULL,
  events text[] NOT NULL, secret_hash text NOT NULL, active boolean DEFAULT true
);
CREATE TABLE audit_log (             -- append-only, partitioned monthly
  id bigint GENERATED ALWAYS AS IDENTITY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid, actor jsonb NOT NULL, action text NOT NULL,
  target jsonb, context jsonb, trace_id text,
  PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);
```

**Permissions:** app roles get table-level grants only through views/functions;
`ledger_postings` and `audit_log` have INSERT-only grants; RLS everywhere
tenant-scoped; U12 auditor role = SELECT on audit/consent views only.

---

## 3. REST API specification

Base: `https://api.marketwar.os/v1` · JSON · TLS ≥1.2
Auth: `Authorization: Bearer <jwt>` (users) or `X-API-Key` (integrations)
Conventions: cursor pagination (`?cursor=…&limit=…`), RFC-7807 errors,
`Idempotency-Key` on POSTs, rate-limit headers (`X-RateLimit-*`).

### 3.1 Rate limits (default tier)

| Scope | Limit |
|---|---|
| Authenticated user | 120 req/min |
| API key (Commander) | 300 req/min, 50k/day |
| API key (War Council/Enterprise) | 1,200 req/min, negotiated/day |
| Agent runs | 30 concurrent per tenant |
| Webhook egress | 10 rps per endpoint, backoff on 5xx |

### 3.2 Endpoint families (canonical set)

| Family | Endpoints | Notes |
|---|---|---|
| Identity | `POST /auth/token`, `GET /me`, `POST /me/mfa` | |
| Tenants | `GET/PATCH /tenant`, `GET /tenant/usage` | |
| Brain | `GET /brain`, `PATCH /brain`, `GET /brain/versions` | |
| Audit (module) | `POST /audits` → report; `GET /audits/{id}` | shipped shape = `AuditReport` |
| Agents | `GET /agents`, `POST /agents/{agentId}/run` | shipped; adds `autonomy`, `gate_id` in response |
| Gates | `GET /gates?status=pending`, `POST /gates/{id}/approve|reject` | |
| Contacts | CRUD `/contacts`, `POST /contacts/import`, `GET /segments` | import async job |
| Consents | `GET/PUT /contacts/{id}/consents` | |
| Campaigns | CRUD `/campaigns`, `POST /campaigns/{id}/launch|pause|kill`, `GET /campaigns/{id}/metrics` | |
| Threads | `GET /threads`, `POST /threads/{id}/messages`, `POST /threads/{id}/assign` | |
| Pages | `POST /pages`, `POST /pages/{id}/publish`, `GET /pages/{id}/stats` | |
| Recovery | `GET /recovery/score`, `POST /recovery/waves` | |
| Revenue | `GET /revenue/attribution`, `GET /revenue/forecast` | |
| Wallet | `GET /wallet`, `GET /wallet/postings`, `POST /wallet/topup` | |
| Billing | `GET /subscription`, `POST /subscription/change`, `GET /invoices` | |
| Keys | `POST /api_keys`, `DELETE /api_keys/{id}` | secret shown once |
| Webhooks | CRUD `/webhooks`, `POST /webhooks/{id}/test`, `GET /webhooks/{id}/deliveries` | |
| Admin | `/admin/*` mirror of M-30 panels | scope `admin:*`, U10/U11 only |

### 3.2a API design principles & core endpoints (adopted from v3.0 spec §7.1–7.2)

Additional binding conventions on top of §3 above:

- REST + JSON everywhere; **GraphQL available for complex retrieval** on the
  partner and developer portals
- `/v1/` versioning; breaking changes always increment the major version
- Auth: Firebase JWT (internal) · **API key + HMAC signature** (external/partner)
- Rate limiting: **Redis-backed sliding window** — per user, per plan, per endpoint
- **Response envelope on every response:**
  `{ data, meta: { requestId, timestamp, version }, error: { code, message, trace } }`
- **All agent APIs are async** — return a `taskId` immediately; completion via
  webhook or SSE. *(Upgrade path for the shipped synchronous
  `/api/agents/[agentId]`: it becomes the submit half of
  `POST /v1/agents/orchestrate`, with results landing in `agent_tasks`.)*

Core internal endpoints (per-endpoint rate limits binding):

| Endpoint | Method | Purpose | Auth | Rate limit |
|---|---|---|---|---|
| `/v1/agents/orchestrate` | POST | Submit task to MOA — returns `taskId` | JWT | 60/min |
| `/v1/agents/tasks/{taskId}` | GET | Poll agent task status + output | JWT | 120/min |
| `/v1/business/{businessId}/vitality` | GET | Current BVI with dimension breakdown | JWT | 60/min |
| `/v1/business/{businessId}/piq` | GET | Priority Intelligence Queue — top 5 actions | JWT | 60/min |
| `/v1/campaigns` | POST | Create campaign (triggers Campaign Commander) | JWT | 30/min |
| `/v1/campaigns/{id}/autonomy` | PATCH | Update campaign autonomy level | JWT | 30/min |
| `/v1/campaigns/{id}/metrics` | GET | Real-time campaign metrics | JWT | 120/min |
| `/v1/customers/import` | POST | Import customer DB (triggers Resurrection Engine) | JWT | **5/min** |
| `/v1/customers/{id}/scores` | GET | Full AI predictive scores per customer | JWT | 120/min |
| `/v1/opportunities` | GET | Current opportunity brief | JWT | 60/min |
| `/v1/acu/topup` | POST | ACU top-up via Stripe | JWT | 10/min |
| `/v1/acu/ledger` | GET | ACU transaction history | JWT | 60/min |
| `/v1/intelligence/briefing` | GET | Today's AI Growth Briefing | JWT | 60/min |
| `/v1/intelligence/query` | POST | Natural-language strategic query to MOA | JWT | **20/min** |

External partner & developer endpoints (adopted from v3.0 spec §7.3):

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v1/leads/ingest` | POST | Receive lead from external form, chatbot or CRM | API key + HMAC |
| `/api/v1/webhooks/campaign-event` | POST | Receive campaign event from Meta/Google/TikTok | Webhook signature |
| `/api/v1/reports/{businessId}` | GET | White-label performance report (agency) | API key + JWT claim |
| `/api/v1/white-label/client` | POST | Provision new client under agency white-label | Agency API key |
| `/api/v1/marketplace/listings` | GET | Browse marketplace listings (Phase 3) | Public, rate-limited |
| `/api/v1/marketplace/demand` | POST | Submit demand intent to the demand router (Phase 3, M-17) | API key |

### 3.3 BitriPay API (gateway door)

Base: `https://api.bitripay.com/v1` · keys `bp_live_…`/`bp_test_…`

```http
POST /v1/payments
Idempotency-Key: 9f2c7b1e-...
{
  "amount": 2500, "currency": "GBP", "method": "card",
  "customer": {"email": "amara@example.com"},
  "capture": true,
  "splits": [{"account": "acct_agency_123", "amount": 250}],
  "metadata": {"campaign_id": "cmp-001", "thread_id": "w-01"}
}
→ 201
{ "id": "pay_8Zk3...", "status": "succeeded", "fee": 61,
  "net": 2189, "risk_score": 7, "created_at": "2026-07-09T18:20:11Z" }
```

```http
POST /v1/payment_links   { "amount": 9900, "currency": "GBP", "reference": "Office trial box", "expires_in": 172800 }
POST /v1/qr              { "mode": "dynamic", "amount": 2500, "order_ref": "PLATTER-27" }
POST /v1/refunds         { "payment": "pay_8Zk3...", "amount": 2500, "reason": "requested_by_customer" }
GET  /v1/settlements?from=2026-07-01&to=2026-07-07
POST /v1/merchants       { "legal_name": "...", "country": "GB", ... } → kyc flow
```

Webhook signature verification (all OS + BitriPay webhooks):

```
signed_payload = timestamp + "." + raw_body
expected = HMAC_SHA256(webhook_secret, signed_payload)
reject if |now - timestamp| > 300s or !timing_safe_eq(expected, v1)
```

### 3.4 Error codes (stable)

`unauthorized` 401 · `forbidden` 403 · `not_found` 404 · `validation_failed` 422 ·
`idempotency_conflict` 409 · `rate_limited` 429 · `kyc_required` 403 ·
`consent_missing` 403 · `autonomy_gate_required` 202 (returns `gate_id`) ·
`provider_unavailable` 502 · `insufficient_acu` 402

### 3.5 Webhook events emitted (OS)

`audit.completed` · `verdict.issued` · `gate.opened|resolved` · `lead.created` ·
`thread.stage_changed` · `recovery.wave.completed` · `campaign.killed|scaled` ·
`invoice.paid|failed` · `acu.low_balance` · plus the BitriPay family (§A.4 in doc 05).

Payload contracts adopted from v3.0 spec §7.4 (all HMAC-signed per §3):

| Event | Trigger | Payload fields |
|---|---|---|
| `agent.task.completed` | Agent task finishes | taskId, agentType, businessId, status, outputSummary, acuCost, timestamp |
| `campaign.paused` | Budget Protection auto-pause | campaignId, reason, roas, threshold, **reallocationTarget**, timestamp |
| `lead.qualified` | Lead Qualification assigns score | leadId, score, tier, recommendedAction, channel, timestamp |
| `resurrection.launched` | Resurrection campaign starts | businessId, segmentSize, projectedRevenue, channels, timestamp |
| `bvi.alert` | **BVI < 40 or any dimension critical** | businessId, score, dimension, severity, recommendedAction, timestamp |
| `acu.low` | Balance below configured threshold | userId, balance, threshold, **estimatedRuntime**, timestamp |
