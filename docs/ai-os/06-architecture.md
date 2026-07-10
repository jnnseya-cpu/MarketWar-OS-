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

T4's LLM Gateway router is shipped (`src/lib/ai/gateway.ts`); T1 is the
shipped app; the CIE (§5.1 below) spans T3+T4+T7.

## 2. Frontend architecture

- Next.js App Router (shipped), server components for data surfaces, client
  components only for interactivity (charts, runners — already the pattern in
  `src/components/`).
- Command-centre chassis as a composable layout: briefing strip, metrics bar,
  priority panel, agent feed, Ask-the-OS — one implementation, role-themed.
- Realtime: Firestore listeners (threads, feeds) → server-sent events at P2.
- Design system: tokens in `tailwind.config.ts`; chart kit `src/components/charts.tsx`
  with validated categorical palette (`src/lib/palette.ts`); dark-first.
- Mobile: responsive PWA first; native wrapper (Capacitor) at P2 for push.

**Mobile experience contract (adopted from v3.0 spec §5.2.2):**
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
custom-claims RBAC — scaffolded (`src/lib/firebase/client.ts`), screens P1 ·
PWA offline dashboards via service workers 📘 P2 (mobile-first markets).

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

## 4. Event-driven architecture

- Bus: Pub/Sub with schema-registry-validated JSON events
  (`event_id, occurred_at, tenant_id, actor{type,id}, type, version, payload, trace_id`).
- Core event families: `lead.*`, `thread.*`, `campaign.*`, `verdict.*`,
  `payment.*`, `wallet.*`, `agent.decision.*`, `gate.*`, `consent.*`, `audit.*`.
- Outbox pattern on every service (no dual-write loss); consumers idempotent by
  `event_id`; DLQs with replay tooling in Admin M-30.
- The Workflow Studio (M-23) and webhook engine are both consumers of this bus —
  external webhooks are just an egress adapter with HMAC signing.

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
  `src/lib/ai/provider.ts`) with cross-provider failover.
- **Memory layer:** twin document (versioned) + vector index per tenant +
  conversation summaries. Access via memory API with field ACLs; every read
  recorded in the decision context (replayability).
- **Prompt/policy registry:** prompts are versioned artefacts (already structured
  in `src/lib/ai/agents.ts`); deploys of prompts follow the same canary/rollback
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
(§6). The demo-intelligence fallback shipped in `src/lib/ai/provider.ts` is
the Phase-0 embodiment of the Reasoning Engine's simplification fallback.

## 6. Data intelligence layer

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
