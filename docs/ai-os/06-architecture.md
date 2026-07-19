# 06 — Production-Grade System Architecture

Target platform: Google Cloud (continuity with the current Firebase estate),
provider-agnostic at the boundaries. Every pattern below is in production at the
named reference companies; no speculative infrastructure.

---

## 1. High-level architecture

```
                        ┌──────────────  Edge (Cloudflare)  ──────────────┐
                        │  WAF · DDoS · bot mgmt · CDN · R2 assets        │
                        └───────────────────────┬─────────────────────────┘
                                                │
        ┌───────────────────────────  API Gateway  ───────────────────────────┐
        │   authn (JWT) · rate limits · quotas · API keys · request signing   │
        └────┬───────────────┬────────────────┬──────────────────┬────────────┘
             │               │                │                  │
   ┌─────────▼─────┐ ┌───────▼───────┐ ┌──────▼────────┐ ┌───────▼────────┐
   │  Web app      │ │ Core services │ │ Agent runtime │ │ BitriPay       │
   │  Next.js SSR  │ │ (stateless)   │ │ (workers)     │ │ gateway svcs   │
   └─────────┬─────┘ └───────┬───────┘ └──────┬────────┘ └───────┬────────┘
             │               │                │                  │
        ┌────▼───────────────▼────────────────▼──────────────────▼────┐
        │                    EVENT BUS (Pub/Sub)                      │
        │  domain events · agent decisions · webhooks · audit feed    │
        └────┬───────────────┬────────────────┬──────────────────┬────┘
             │               │                │                  │
   ┌─────────▼─────┐ ┌───────▼───────┐ ┌──────▼────────┐ ┌───────▼────────┐
   │ OLTP store    │ │ Vector store  │ │ Warehouse     │ │ Ledger DB      │
   │ Firestore →   │ │ Pinecone →    │ │ BigQuery      │ │ (Postgres,     │
   │ Postgres(P2)  │ │ pgvector(P2)  │ │               │ │  append-only)  │
   └───────────────┘ └───────────────┘ └───────────────┘ └────────────────┘
```

**Phasing note:** Phase 0/1 keeps the current estate (Firebase Auth, Firestore,
Pinecone, Next.js on Cloud Run). Phase 2 introduces PostgreSQL (Cloud SQL/AlloyDB)
with row-level security for relational/financial workloads and pgvector for tenant
memory — Firestore remains for real-time UX surfaces (threads, feeds).

### 1.1 Seven-tier decomposition (adopted from v3.0 spec §5.1)

The same system viewed as seven independently deployable, horizontally
scalable tiers that communicate **exclusively through event contracts** —
zero tight coupling between layers:

| Tier | Layer | Primary technology | Responsibility |
|---|---|---|---|
| T1 | Presentation | Next.js 14+ App Router, Tailwind, Framer Motion | All user-facing interfaces — web, mobile/PWA, admin, partner portals |
| T2 | API Gateway | Firebase Functions + Cloud Endpoints + rate limiter | Routing, authn, rate limiting, API versioning |
| T3 | Orchestration | MOA service, Pub/Sub, Cloud Tasks | Agent coordination, task delegation, event routing, workflow state |
| T4 | Intelligence | LLM Gateway router, vector store, embedding pipeline | AI reasoning, vector memory, knowledge graph, context assembly |
| T5 | Data | Firestore, BigQuery, Redis, Cloud Storage | Persistence, analytics warehouse, cache, assets |
| T6 | Integration | Meta/Google Ads APIs, Twilio, SendGrid, Stripe | All third-party integrations — ads, messaging, payments |
| T7 | Intelligence Fabric | Vertex AI, Prophet, TensorFlow, fine-tuned models | ML forecasting, churn prediction, ROAS modelling, RL training |

T4's LLM Gateway router is shipped (`src/backend/gateway.ts`); T1 is the
shipped app; the CIE (§5.1 below) spans T3+T4+T7.

## 2. Frontend architecture

- Next.js App Router (shipped), server components for data surfaces, client
  components only for interactivity (charts, runners — already the pattern in
  `src/components/`).
- Command-centre chassis as a composable layout: briefing strip, metrics bar,
  priority panel, agent feed, Ask-the-OS — one implementation, role-themed.
- Realtime: Firestore listeners (threads, feeds) → server-sent events at P2.
- Design system: tokens in `tailwind.config.ts`; chart kit `src/components/charts.tsx`
  with validated categorical palette (`src/shared/palette.ts`); dark-first.
- Mobile: responsive PWA first; native wrapper (Capacitor) at P2 for push.

**Design-system tokens (recorded from v3.0 spec §8.2 — see conflict note):**
Typography: Inter 700/32 (H1), 600/24 (H2), 600/18 (card), 400/14 (body),
400/12 (caption), 700/40–60 (metric display), 400-italic/14 (AI briefing),
JetBrains Mono 400/13 (code). Colours: `--color-brand-dark #1A1A2E` ·
`--color-brand-mid #16213E` · `--color-accent #E94560` · `--color-gold
#F5A623` · `--color-surface #F4F6F9` · `--color-success #27AE60` ·
`--color-warning #F39C12` · `--color-danger #E74C3C` · text `#1A1A2E` /
`#6B7280`.
**Conflict + resolution (owner-approved look governs):** the shipped design
system — emerald-on-ink dark theme, Space Grotesk display + Inter body, the
CVD-validated chart palette (`src/shared/palette.ts`) — was reviewed and
approved by the owner via the screenshot gallery and remains the primary
brand. The §8.2 tokens are preserved as the **specified alternate theme**
(a light-surface variant candidate for the admin/partner portals or a future
theme switcher). Semantic parallels already exist: metric-display scale,
success/warning/danger triad, AI-narrative styling. Owner may re-decide at
any time; logged in the coverage-matrix gaps register.
PWA fully functional from day one · **React Native shell** wrapping key PWA
views for app-store distribution (supersedes the earlier Capacitor
placeholder — RN is the specified wrapper) · push via FCM with **critical
alerts bypassing email** · offline-capable dashboard locally caching the
**BVI score and daily briefing** · **biometric authentication (Face ID /
fingerprint) required for L3 approval confirmations** — a binding security
control on the autonomy gate flow (doc 02 §2, doc 08 §B.1 step-up auth).

**Frontend stack contract (adopted from v3.0 spec §5.2.1)** — status per item:
RSC for performance-critical pages (Command Centre, War Room) ✅ shipped ·
TypeScript strict mode ✅ shipped · Tailwind + design-token system ✅ shipped
(Shadcn adoption optional at P1) · Framer Motion micro-interactions 📘 P1
(CSS keyframes shipped) · Zustand for real-time command-centre state 📘 P1 ·
TanStack Query with optimistic updates + SWR 📘 P1 · charts: shipped
dependency-free SVG kit covers the Recharts scope; D3 reserved for custom
funnel maps/heatmaps at P2 · Firebase Auth with email/Google/Apple SSO +
custom-claims RBAC — scaffolded (`src/frontend/firebase-client.ts`), screens P1 ·
PWA offline dashboards via service workers 📘 P2 (mobile-first markets).

### 2.2 Portal architecture (adopted from v3.0 spec §5.2.3)

Five portals on a subdomain scheme (each a Cloudflare-proxied CNAME to the
same Vercel project at go-live; route separation via Next.js middleware):

| Portal | URL | Primary users | Key capabilities | Status |
|---|---|---|---|---|
| Main Application | `app.marketwaros.com` | Owners, marketing managers, sales teams | Full Command Centre, War Room, Customer Vault, all agents | ✅ shipped as `/dashboard` |
| Agency Portal | `agency.marketwaros.com` | Agency super admins, team leads | Multi-client management, white-label reporting, team permissions, client billing | 📘 M-16 / doc 02 §U4 |
| Admin Console | `admin.marketwaros.com` | Platform super admins | Platform health, user/ACU management, system health, compliance | 📘 M-30 Admin Super Control Centre |
| Partner Portal | `partner.marketwaros.com` | Affiliates, resellers, API partners | Commission tracking, API credentials, referral analytics, co-marketing tools | 📘 M-18 / doc 02 §U6 |
| Developer Portal | `dev.marketwaros.com` | API developers, enterprise integrators | API docs, sandbox, webhook config, SDK downloads | 📘 M-26 / doc 02 §U8 |

## 3. Backend & service decomposition

Stateless services on Cloud Run, one deployable per bounded context:

| Service | Owns | Notes |
|---|---|---|
| `svc-identity` | Users, roles, sessions, MFA | Wraps Firebase Auth; issues platform JWT with tenant+role claims |
| `svc-tenant` | Businesses, plans, twin metadata | |
| `svc-vault` | Contacts, segments, scoring jobs | Import pipeline workers |
| `svc-campaign` | Campaigns, experiments, verdicts | Kill/scale execution via connector adapters |
| `svc-conversation` | WhatsApp/SMS/email threads | BSP webhooks in; sends out |
| `svc-content` | Assets, calendars, pages | Page publisher |
| `svc-agent-runtime` | Agent execution, routing, gating | See §5 |
| `svc-billing` | Plans, ACU metering, invoices | |
| `svc-bitripay-*` | payments, merchants, settlement, disputes | Isolated project + VPC; PCI scope boundary |
| `svc-notify` | All outbound notifications | Channel preferences, quiet hours |
| `svc-audit` | Append-only audit ingestion + search | Write path is event-bus only |

Rules: services communicate via events (async) or gateway-routed APIs (sync);
no shared databases across contexts; BitriPay services live in a separate GCP
project with restricted peering (PCI + blast-radius isolation — the Stripe
"money services are their own island" pattern).

### 3.1 Microservice runtime & scaling contract (adopted from v3.0 spec §5.3)

The spec's ten-service decomposition with **binding runtime and scaling
parameters**. Reconciliation with the table above: same bounded contexts —
the spec pins event-driven services to Firebase Functions (2nd gen) per the
adopted production architecture (§7 Cloud Functions / §8 Cloud Run for heavy
jobs); the Cloud Run rows above remain the home for long-running/heavy work.

| Service | Technology | Responsibility | Scaling (binding) |
|---|---|---|---|
| Auth Service | Firebase Auth + custom claims | Authn, sessions, RBAC token issuance | Firebase-managed horizontal |
| MOA Service | **Functions 2nd gen, 8 GB, 540 s timeout** | Orchestration, BVI calc, PIQ management | Up to **1,000 concurrent instances** |
| Campaign Service | Functions + Cloud Tasks | Campaign CRUD, metric ingestion, autonomy execution | Task-queued burst operations |
| AI Gateway Service | Functions + custom router *(shipped router: `src/backend/gateway.ts`)* | LLM provider routing, cost arbitration, fallback | Stateless — **10,000+ concurrent AI requests** |
| Vector Memory Service | Functions + vector store | Embeddings, semantic search, memory R/W | Index replication, horizontal |
| Notification Service | Functions + FCM + Twilio | Push, email, SMS, WhatsApp delivery | Queue-based with retry logic |
| Analytics Pipeline | Cloud Dataflow + BigQuery | Event ingestion, aggregation, warehouse loading | Apache Beam autoscaling |
| Billing Service | Functions + Stripe SDK | Subscriptions, ACU ledger, invoicing | Stripe-managed + **webhook reconciliation** |
| Integration Broker | Functions + Cloud Tasks | All third-party API calls (Meta, Google, Twilio…) | **Per-platform rate limiting + exponential-backoff queues** |
| ML Inference Service | Vertex AI endpoints + Functions | Real-time churn/ROAS/LTV predictions | Vertex autoscaling with **min-instance warm pools** |

### 3.2 GCP service configuration (adopted from v3.0 spec §13.1 — binding)

Fully managed-services-first, no self-managed infrastructure in MVP:

| GCP service | Purpose | Configuration (binding) |
|---|---|---|
| Firebase Functions (2nd gen) | All serverless backend + agent execution | Node.js 20 · 2–8 GB memory · 540 s timeout for agent tasks · **min-instances: 5 for hot paths** |
| Firestore | Primary operational DB | **Multi-region `eur3`** (UK/EU compliance) · auto-backup every 24 h · PITR 7 days |
| Cloud Pub/Sub | Async event bus | **Dead-letter topics per event type** · 7-day retention · exactly-once delivery on critical topics |
| Cloud Tasks | Delayed/scheduled queue | Per-queue rate limits · exponential backoff · max retry 5 · dead-letter Pub/Sub topic |
| Cloud Scheduler | Cron — daily briefings, **hourly BVI refresh**, nightly ML inference | 1-min granularity · timezone-aware · Cloud Tasks integration |
| Vertex AI | ML training + inference (churn, ROAS, LTV) | Custom endpoints autoscaling **min-1/max-20** · Gemini integration |
| BigQuery | Analytics warehouse | Partitioned by date · **clustered by businessId** · daily Firestore exports |
| Cloud Memorystore (Redis) | Cache — BVI scores, PIQ rankings, rate limits, sessions | **6 GB standard tier at MVP** (Redis 7.0, private VPC, no public IP) — grows toward the §6.0 64 GB pool at scale phase |
| Cloud Storage | Generated images, exports, brand assets | Multi-regional UK/EU · lifecycle: **hot→nearline at 90 d, archive at 365 d** |
| Cloud CDN + Cloud Armor | Delivery + DDoS | Edge caching static assets · OWASP WAF rules · geo-blocking sanctioned countries |

**Cost optimisation strategy (§13.3, binding targets):** min-instance 3+ on
critical agent paths (cold-start) · **Profit Protection Agent routes > 40% of
tasks to Groq/open-source — blended LLM cost < £0.005/task** · Redis caching
cuts Firestore reads ~70% · BigQuery scheduled queries + materialised views
only (no on-demand for high-volume analytics) · storage auto-archive at 90 d
(−60% storage cost) · Vertex batch prediction for non-real-time ML (−80% on
non-latency-sensitive predictions).

*Reconciliation note (additive):* §6.0's 64 GB Redis pool is the scale-phase
target; §13.1's 6 GB standard tier is the MVP/growth sizing. Both stand — the
cache tier grows along the §10 scaling-milestone ladder.

## 4. Event-driven architecture

- Bus: Pub/Sub with schema-registry-validated JSON events
  (`event_id, occurred_at, tenant_id, actor{type,id}, type, version, payload, trace_id`).
- Core event families: `lead.*`, `thread.*`, `campaign.*`, `verdict.*`,
  `payment.*`, `wallet.*`, `agent.decision.*`, `gate.*`, `consent.*`, `audit.*`.
- Outbox pattern on every service (no dual-write loss); consumers idempotent by
  `event_id`; DLQs with replay tooling in Admin M-30.
- The Workflow Studio (M-23) and webhook engine are both consumers of this bus —
  external webhooks are just an egress adapter with HMAC signing.

### 4.1 Core event-topic catalogue (adopted from v3.0 spec §5.4)

Guaranteed delivery, complete decoupling, and **event replay** for debugging,
auditing and ML retraining. Retention periods are binding:

| Topic | Producer | Consumers | Retention |
|---|---|---|---|
| `campaign.metric.updated` | Meta/Google integration broker | Budget Protection, Revenue Intelligence, MOA | 7 d |
| `agent.task.completed` | All specialist agents | MOA, analytics pipeline, memory service, Learning Engine | 30 d |
| `business.vitality.changed` | MOA service | Command Centre feed, Growth Strategist, notifications | 7 d |
| `lead.captured` | Landing-page service, WhatsApp broker | Lead Qualification, CRM service, notifications | 90 d |
| `customer.resurrected` | Resurrection Engine | Revenue Intelligence, Customer Vault, analytics | 90 d |
| `acu.consumed` | AI Gateway service | Billing, Profit Protection Agent, ACU ledger | **365 d** |
| `competitor.event.detected` | Competitor Intelligence | Growth Strategist, MOA, Opportunity Discovery | 30 d |
| `user.action.taken` | Frontend (all portals) | Digital-twin service, analytics, Learning Engine | 180 d |

These topics compose with the event families above (`lead.*`, `campaign.*`,
`agent.decision.*`, …) — the catalogue names the concrete Pub/Sub topics and
their retention floors; financial events (`acu.consumed`) retain longest to
back ledger reconciliation and margin audits.

## 5. AI orchestration layer (agent runtime)

```
request/trigger → MOA planner → task graph
   → per-task: policy check → autonomy clamp → memory fetch (twin, ACL'd)
   → model router (task class → tier → provider) → tool calls (typed)
   → output schema validation → action adapter (or gate) → decision event
```

- **Model router:** task-class table maps to tiers (SLM/mid/frontier), provider
  order, max tokens, cost budget; per-tenant ACU budget enforced pre-call;
  circuit breakers per provider; retry/backoff (shipped pattern in
  `src/backend/provider.ts`) with cross-provider failover.
- **Memory layer:** twin document (versioned) + vector index per tenant +
  conversation summaries. Access via memory API with field ACLs; every read
  recorded in the decision context (replayability).
- **Prompt/policy registry:** prompts are versioned artefacts (already structured
  in `src/shared/agents.ts`); deploys of prompts follow the same canary/rollback
  discipline as code. AI Governance Agent owns drift evals.
- **Evaluation harness:** golden-set evals per agent (input fixtures → scored
  outputs) run on every prompt/model change; regression blocks rollout.

### 5.1 Central Intelligence Engine — nine cognitive subsystems (adopted from v3.0 spec §3.1)

The agent runtime decomposes into the CIE: a distributed intelligence fabric
of nine asynchronous subsystems coordinated through a shared context bus and
unified vector memory graph. Each subsystem's **failure-handling contract is
binding** — these are the resilience rules the implementation must meet:

| Subsystem | Purpose | Failure handling (binding) |
|---|---|---|
| Agent Orchestration Layer | Coordinates all specialist agents via the MOA priority queue | Dead-letter queue + human escalation after **3 consecutive agent failures** |
| Decision Engine | Multi-criteria scoring for all autonomous decisions | Conservative fallback — defer to human approval if **confidence < 70%** |
| Memory Engine | Persistent long-term + working memory per user and business | Memory-reconciliation job every **6 hours** to resolve conflicts |
| Context Engine | Assembles/injects relevant context into every agent prompt | Fall back to **last-known-good context** if retrieval fails |
| Knowledge Engine | Platform-wide market/industry/strategy intelligence | Stale data flagged — agents use **benchmark fallback** if a feed fails |
| Reasoning Engine | Chain-of-thought multi-step reasoning for complex decisions | Simplification fallback — reduce to **heuristic rule** if LLM unavailable |
| Prediction Engine | Time-series forecasting: revenue, churn, demand, ROAS | **Prophet fallback model** if the managed ML service is unavailable |
| Automation Engine | Executes all L3 autonomous actions + workflow triggers | Circuit breaker — **pause automation if error rate > 5% in 10 min** |
| Learning Engine | Reinforcement loop improving agents from outcomes | **Rollback to previous model/policy version if performance degrades > 10%** |

Mapping to this document: Orchestration = MOA (§5 runtime), Decision/Reasoning
= policy check + model router tiers, Memory/Context = the memory layer + twin,
Knowledge = the knowledge graph (§6), Prediction = prediction services (§6),
Automation = action adapters + gates, Learning = the nightly grading loop
(§6). The demo-intelligence fallback shipped in `src/backend/provider.ts` is
the Phase-0 embodiment of the Reasoning Engine's simplification fallback.

## 6. Data intelligence layer

### 6.0 Polyglot persistence strategy (adopted from v3.0 spec §6.1)

The right store per data type and access pattern — **scale targets binding**:

| Store | Technology | Data types | Access pattern | Scale target |
|---|---|---|---|---|
| Primary operational DB | Firestore | Users, businesses, campaigns, leads, tasks, ACU ledger | Real-time R/W, subscription listeners | **10M+ documents, 100K+ concurrent listeners** |
| Analytics warehouse | BigQuery | Campaign metrics, agent performance, revenue analytics, event logs | Batch analytics, ML training extraction | PB-scale |
| Vector memory | Pinecone (p1-x1) → pgvector P2 | Agent memory embeddings, business context vectors, knowledge-graph nodes | Top-K semantic search | **100M+ vectors, < 100 ms query P95** |
| Cache layer | Redis (Memorystore) | **BVI scores, PIQ rankings, sessions, rate-limit counters** | Sub-millisecond KV reads | 64 GB pool, LRU eviction |
| Asset storage | Cloud Storage + CDN | Generated images, brand assets, exports, audio/video | CDN GET; signed URLs for private files | PB, tiered hot/cold/archive |
| Search index *(new component)* | Algolia / Typesense | Business listings, customer profiles, content library | Full-text with typo tolerance | **50M+ records, < 50 ms** |

| Component | Technology | Role |
|---|---|---|
| Data lake | GCS (raw events, connector payloads) | Cheap immutable history |
| Warehouse | BigQuery | Analytics, attribution models, ML features |
| Streams | Pub/Sub → Dataflow | Real-time aggregates for metrics bars |
| Vector store | Pinecone → pgvector | Twin memory, RAG |
| Knowledge graph | Entity tables + edges in Postgres (P2) | business↔competitor↔channel↔offer relations for the strategist |
| Prediction services | Vertex AI (batch) | churn, LTV, recovery probability, demand detection |
| Recommendation engine | Feature-store-backed rankers | priority panel ordering, pack suggestions |
| Decision engine | Policy rules + learned priors | verdict thresholds per industry/geo |

### 6.1a Predictive model registry (adopted from v3.0 spec §10.2 — accuracy targets binding)

| Model | Algorithm | Training data | Inference trigger | Output | Accuracy target |
|---|---|---|---|---|---|
| Churn prediction | XGBoost + feature engineering | 24-month login, campaign, spend, engagement history per user | Weekly batch + on-demand | 30-day churn probability per user | **> 78% AUC-ROC** |
| ROAS trajectory | Prophet + LSTM | Campaign metric time-series per platform and industry | Every 6 h per active campaign | 30/60/90-day ROAS forecast + CIs | **± 15% MAPE** |
| LTV prediction | Gradient boosting + cohorts | Purchase history, AOV, frequency, channel mix per customer | Profile update + weekly batch | 12-month LTV per segment | ± 20% |
| Reactivation probability | Logistic regression + embeddings | Historical reactivation outcomes, contact attributes, inactivity duration | DB import + daily | Per-contact score 0–1 | **> 72% AUC** |
| Demand forecasting | Prophet + external signals | Google Trends, keyword volume, review sentiment, seasonality | Daily batch | 90-day demand score per category × geo | ± 25% directional |
| CAC optimisation | **Multi-armed bandit** | Campaign performance by audience, creative, channel, time | Real-time, every campaign decision | Optimal budget allocation across channels | **≥ 20% CAC reduction vs baseline** |

Dashboard refresh contract (§10.1): Command Centre real-time (5-min metrics,
Pub/Sub alerts) · War Room 5-min · Sales Pipeline instant lead push ·
Agency executive hourly · Admin console real-time · Affiliate daily.

**Learning loop (the platform-wide reinforcement requirement):** nightly job joins
`agent.decision.*` events to realised outcomes (orders, revenue, refunds, churn),
grades decisions, updates per-industry priors (kill thresholds, budget curves,
hook banks), and publishes a new decision-policy version — which is itself
canaried (10% of tenants) before full rollout. Human review of policy diffs above
a materiality threshold. This is RL-as-batch-policy-improvement, the deployable
form of "self-improving" — no online weight updates in production.

## 7. Security architecture (summary — full detail in doc 08)

Zero-trust: every request authenticated (user JWT / service identity / API key),
authorised (RBAC + tenant row scoping), rate-limited, logged. Secrets in Secret
Manager; KMS envelope encryption; signed webhooks; per-agent least-privilege tool
scopes. Encryption in use for the BitriPay island (Confidential Computing at P3).

## 8. Observability & reliability

- **Golden signals** per service (latency, traffic, errors, saturation) → Cloud
  Monitoring; traces via OpenTelemetry; structured logs with `trace_id` + `tenant_id`.
- **SLOs:** API P95 <300 ms; agent response P95 <200 ms (cached/routed) /
  <8 s (frontier generation); uptime 99.9% (P1) → 99.99% (P3). Error budgets gate
  release velocity (SRE pattern).
- **Incident management:** System Health Agent detects → SOC/on-call page →
  Auto-Repair runbooks (pre-approved only) → post-mortem → policy patch.
- **Deploys:** trunk-based, CI (typecheck, tests, evals, security scan), canary
  10% → 50% → 100% with automated rollback on SLO burn (Release Mgmt Agent).

## 9. Disaster recovery & business continuity

| Tier | Data | RPO | RTO | Mechanism |
|---|---|---|---|---|
| T0 Ledger/payments | Ledger DB | 0 | 15 min | Synchronous multi-zone, PITR, cross-region replica |
| T1 OLTP | Firestore/Postgres | 5 min | 1 h | PITR + cross-region backups |
| T2 Warehouse/lake | BigQuery/GCS | 24 h | 12 h | Snapshot + re-ingest from lake |
| T3 Caches/queues | Redis/PubSub | n/a | rebuild | Recreate from source of truth |

Quarterly DR game-days; region evacuation runbook; connector outage playbooks
(degrade to demo-mode intelligence — the shipped deterministic fallback is the
business-continuity mechanism for AI-provider outages).

## 10. Environments & scalability logic

`dev → preview (per-PR) → staging (synthetic tenants, nightly agent journeys) →
prod (canary + full)`. Scale-out levers in order: Cloud Run concurrency → queue
sharding by tenant hash → Firestore→Postgres partition migration → regional cells
(cell-based architecture at 100k+ tenants, Uber/Slack pattern: a tenant lives in
exactly one cell; global services are thin).

### 10.1 Environment strategy (adopted from v3.0 spec §13.2 — binding)

| Environment | Purpose | Infrastructure | Data strategy |
|---|---|---|---|
| **prod** | Live platform — all paying customers | Full redundancy, multi-region Firestore, Vertex AI production endpoints, Cloud Armor on | Real customer data — full encryption, GDPR-compliant, **7-year audit retention** |
| **staging** | Pre-production validation — exact replica of prod | Single-region; Firestore emulator for destructive tests; real third-party API credentials for integration testing | **Anonymised production snapshot — refreshed weekly** |
| **dev** | Individual developer environments + CI/CD | Firebase local emulator suite (Firestore, Auth, Functions, Pub/Sub all local) | Seed data only — **never production data** |
| **dr-prod** | Hot standby — **RTO < 4 h, RPO < 1 h** | Cloud Spanner cross-region backup, Cloud Storage replication to EU-WEST2, daily Firestore export | Automated daily export validation — **restoration tested monthly** |

(The dr-prod envelope composes with the per-tier DR table in §9 — T0/T1 carry
tighter RPO/RTO than the environment-level floor; both stand.)

### 10.2 Scaling milestones (adopted from v3.0 spec §16)

Scalability principles (§16.1, binding): stateless Functions (state in
Firestore/Redis only) · Pub/Sub-decoupled consumers scaling independently ·
each agent type as an independent function pool — **agents never block each
other** · Firestore auto-sharding + BigQuery petabyte autoscale · CDN-first
frontend — only authenticated API calls reach Functions.

| Milestone | Users | Architecture change | Est. monthly infra cost |
|---|---|---|---|
| MVP launch | 0–1,000 | Standard Firebase Functions, single-region Firestore, **free-tier Pinecone** | **£500–£1,500** |
| Growth phase 1 | 1,000–10,000 | Min-instances on hot paths, **Redis cache layer added**, Pinecone p1-x1 pod | £2,000–£6,000 |
| Scale phase | 10,000–100,000 | **Multi-region Firestore (eur3)**, BigQuery analytics pipeline, Vertex AI endpoints live | £8,000–£25,000 |
| Enterprise phase | 100,000–500,000 | Cloud Spanner for highest-consistency data, Dataflow streaming pipeline, **dedicated Pinecone clusters per region** | £30,000–£80,000 |
| Platform phase | 500,000+ | Full microservices migration, multi-cloud strategy, **edge intelligence at CDN layer** | £80,000+ |

## 11. Codebase layering (implemented 2026-07-13 — backend / frontend / shared)

The shipped Next.js codebase is physically separated into three layers with
runtime enforcement; behaviour and feature surface unchanged (Additive-Only):

| Layer | Path | Contents | Rules |
|---|---|---|---|
| **Backend** | `src/backend/` | AI Gateway + provider routing, deterministic audit engine, persistence facade, Firebase Admin, **E2E field-encryption layer** (`crypto.ts`) | Server-only — every module carries a runtime layer guard that throws if it reaches a browser bundle; imported only by `src/app/api/**` and server components; may import shared, never frontend |
| **Shared** | `src/shared/` | Domain types, validated palette, agent definitions, demo dataset | Pure data/types — no Node APIs, no browser APIs, no secrets; importable by both sides |
| **Frontend** | `src/frontend/` + `src/components/` | Env-guarded Firebase client SDK, UI component kit; pages in `src/app/**` compose them | Never imports backend — reaches it exclusively through `/api/*`; `NEXT_PUBLIC_*` config only |

Stabilisation gates: `npm run verify` (typecheck + build) and `npm run smoke`
(`scripts/smoke.mjs` — all 41 page routes, security headers, all 39 agents
end-to-end, audit + gateway + integrations/strategy/landing/automation/
prospecting/segments/roi/reputation/search/intent/warfare/image/acu/geo/email/
amplify APIs; 121 checks). Global error boundary + not-found surfaces ship in
`src/app/`.
