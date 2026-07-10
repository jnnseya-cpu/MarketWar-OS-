# 03 — The Complete AI Agent Ecosystem

The agent mesh is the operating core of the AI-OS. This document specifies the
architecture principles, the Master Orchestrator, and every agent category with
purpose, inputs, outputs, permissions, triggers, workflows, escalation rules,
APIs used and business value.

---

## 1. Agent architecture principles

1. **One agent, one accountability.** Each agent owns a measurable outcome metric.
   Agents that cannot be graded do not ship.
2. **Contract-first.** Every agent exposes a typed contract:
   `input schema → output schema` (JSON Schema, validated at the boundary — the
   pattern already implemented in `src/app/api/agents/[agentId]/route.ts`).
3. **Shared memory, scoped access.** Agents read the tenant's **digital twin**
   (Business Brain) through a memory API with field-level ACLs — never raw DB access.
4. **Autonomy levels per capability** (L0 recommend → L3 autonomous), set by the
   tenant's autonomy dial and clamped by platform policy. Spend-affecting actions
   always carry a hard cap independent of level.
5. **Every action is an event.** Agent decisions are emitted to the event bus with
   full context (inputs hash, model+version, prompt version, output, confidence),
   making the mesh replayable and auditable.
6. **Outcome grading closes the loop.** Realised results (orders, revenue,
   refunds, complaints) are joined back to the originating decision to grade it;
   grades feed nightly policy updates (see `06-architecture.md` §Learning Loop).
7. **Model routing by task class.** Classification/extraction → SLM tier;
   generation → mid tier; strategy/diagnosis → frontier tier. The router is
   provider-agnostic (Anthropic primary, per `src/lib/ai/provider.ts` pattern, with
   retry/backoff and demo fallback).

### Standard agent record (applies to every agent below)

```
agent_id · name · category · outcome_metric · autonomy_ceiling
inputs (schema) · outputs (schema) · tools/APIs · triggers
escalation_rules · policy_constraints · prompt_version · model_tier
```

---

## 2. Master Orchestrator Agent (MOA)

- **Purpose:** the kernel scheduler of the mesh. Decomposes goals into agent tasks,
  sequences/parallelises them, arbitrates conflicts (e.g. Budget Protection says
  STOP while Campaign Commander says SCALE — MOA applies policy: protection wins,
  dispute logged), and enforces autonomy ceilings.
- **Inputs:** tenant goals, agent proposals, policy set, budget state, event stream.
- **Outputs:** task graph, execution orders, escalation tickets, daily briefing feed.
- **Triggers:** cron (daily planning), event (new lead, verdict due, threshold
  breach), user command (Ask-the-OS).
- **Escalation:** any action exceeding autonomy/spend policy → human gate with
  expiry (unactioned gates auto-expire to the safe default: do nothing / pause).
- **Business value:** converts 20 specialists into one coherent workforce; the
  ServiceNow orchestration pattern applied to growth operations.

### 2.1 MOA enhanced specification (adopted from v3.0 spec §3.2)

The MOA operates as a fully autonomous **Chief of Operations AI** — one brain
managing platform health, agent performance, user priorities and revenue
optimisation across every account simultaneously. Core capabilities:

- **Business Vitality Index (BVI)** — real-time composite score (0–100) per
  business, recalculated **every 15 minutes** across the 12 dimensions below
- **Priority Intelligence Queue (PIQ)** — the ranked action list behind every
  command centre's priority panel, ordered by revenue impact × urgency ×
  confidence, updated in real time
- **Inter-agent conflict resolution** — competing recommendations resolved by
  the weighted framework **revenue impact × time-sensitivity × confidence**
  (subordinate to the standing policy rule that Budget Protection wins spend
  disputes, §2)
- **Cross-account pattern recognition** — anonymised cross-business trends
  feed platform-wide priors (the doc-06 learning loop)
- **Autonomous threshold management** — autonomy-level thresholds adjust
  dynamically with business performance trajectory (never above the tenant's
  dial or platform policy caps)
- **Natural-language reasoning API** — Ask-the-OS: plain-English queries,
  structured evidence-backed strategic answers
- **Anomaly detection broadcasting** — any metric deviating **> 2σ** from
  expected triggers an emergency broadcast to all relevant agents

#### Business Vitality Index — 12 dimensions (weights + binding alert thresholds)

| Dimension | Weight | Measured as | Alert threshold |
|---|---|---|---|
| Campaign ROAS health | 15% | Weighted avg ROAS vs industry benchmark | < 1.5× target ROAS |
| Revenue trend | 15% | 7-day revenue vs prior 7 days | < 80% of prior period |
| Lead flow velocity | 12% | Leads/day vs 30-day rolling average | < 60% of rolling average |
| Customer acquisition cost | 12% | CAC : LTV ratio | CAC > 50% of LTV |
| Customer retention rate | 10% | 30-day repeat-purchase rate | < 25% (product businesses) |
| Audience health | 8% | Ad frequency + saturation signals | Frequency > 4.0 or saturation > 70% |
| Dormant revenue risk | 8% | % of database inactive > 90 days | > 40% inactive |
| Creative fatigue score | 7% | CTR degradation per creative | CTR down > 35% from peak |
| Competitor threat level | 5% | Competitor spend increase + creative velocity | Spend up > 30% in 7 days |
| Budget efficiency | 4% | Spend pacing vs projected return | Projected ROAS below floor |
| Opportunity capture rate | 2% | High-score opportunities acted on within 48 h | < 50% acted on |
| Platform engagement | 2% | Daily active usage vs account tier | < 3 active days/week |

---

## 3. Growth agent corps (shipped in Phase 0 — `src/lib/ai/agents.ts`)

These twelve are live today and remain the revenue-facing core. Contracts unchanged;
this table adds the AI-OS operational fields.

| Agent | Outcome metric | Autonomy ceiling | Key triggers | Escalates when |
|---|---|---|---|---|
| Business Diagnosis | Audit → activation rate | L0 | Onboarding, quarterly re-audit | Never (advisory) |
| Customer Pain | Hook CTR uplift | L0 | New campaign, new segment | — |
| Offer Builder | Offer conversion rate | L0→L1 | Audit complete, margin change | Margin-negative offer proposed |
| Ad Creative | CTR / cost-per-message | L1 | Campaign build, creative fatigue detected | Brand-rule conflict |
| Campaign Commander | Cost per order vs target | L2 | Goal selected, test complete | Kill/scale beyond cap |
| Budget Protection | £ waste prevented | **L3** | Hourly spend scan | Cumulative reroute > daily cap |
| Lead Capture | Capture rate per click | L2 | Campaign launch | Consent gaps detected |
| Competitor Spy | Threat-response lead time | L0 | Weekly scan, ad-library delta | — |
| Local Growth | Map-pack rank, review velocity | L1 | Monthly plan, review events | — |
| Revenue Intelligence | Attribution coverage % | L0 | Nightly close | Data-quality below threshold |
| Content Factory | Owned-channel CTR | L1 | Weekly plan | — |
| Growth Strategist | Briefing action completion rate | L0 | Daily 06:00 tenant-local | — |

## 4. Command-centre personal agents

Chief of Staff, Analyst, Research, Automation, Growth, Security, Knowledge — one
set per user, thin personas over the platform corps (mapping table in
`02-users-and-command-centres.md` §2.1). They hold *user* context (preferences,
schedule, communication style); platform agents hold *business* context. This
split keeps personal data out of shared business memory.

## 5. Executive agents (tenant-level C-suite simulation)

| Agent | Purpose | Inputs | Outputs | Value |
|---|---|---|---|---|
| CEO Agent | Weekly strategic review; goal coherence | All module KPIs, market intel | Strategy memo, goal adjustments (L0) | Keeps tenant goals honest |
| CFO Agent | Cash, margin, runway watch | Revenue, spend, settlement data | Cash alerts, margin-safe budget envelopes | Prevents growth-at-all-costs failure |
| COO Agent | Operational bottleneck detection | SLA timers, fulfilment, thread response times | Process fixes, staffing signals | Converts ops friction into tasks |
| CMO Agent | Channel-mix strategy | Attribution, competitor field | Quarterly mix targets | Stops channel monoculture |
| CTO Agent | Stack & integration health (tenant) | Connector status, webhook failures | Fix orders to Automation agent | Keeps integrations alive |
| CRO Agent | Pricing/monetisation experiments | Offer results, LTV curves | Price test proposals (L0, human-gated) | Margin expansion |

## 6. Engineering & quality agents (platform-side)

| Agent | Purpose | Key mechanism |
|---|---|---|
| Frontend / Backend / API / Database / Infra Agents | Codegen + change proposals inside guarded repos | PR-only output; CI + human review; never direct deploy |
| QA Agent | Generates/maintains test suites from specs | Contract tests from agent schemas |
| Testing Agent | Synthetic user journeys | Playwright runs against staging nightly |
| Performance Agent | Perf budgets | Lighthouse/k6 gates in CI |

## 7. Cybersecurity agent corps (platform-side)

| Agent | Purpose | Triggers | Escalation |
|---|---|---|---|
| Threat Hunter | Hypothesis-driven hunting over telemetry | Continuous | SOC ticket + human on-call |
| SOC Agent | Alert triage, dedupe, enrich | SIEM events | P1 → page human < 5 min |
| Fraud Agent | Transaction & behaviour scoring | Every payment/signup/login | Score > threshold → hold + review |
| Vulnerability Agent | Dependency & config scanning | Daily + on deploy | Critical CVE → block deploy |
| Identity Agent | Session/anomaly analysis, risk-based auth step-up | Auth events | Impossible-travel → force MFA |

## 8. Revenue, customer & compliance agents (platform-side)

| Agent | Purpose | Notes |
|---|---|---|
| Sales Agent | Trial → paid conversion plays | Works the platform's own funnel with the same tools tenants get (dogfood) |
| Pricing Agent | Plan/ACU price optimisation | L0 — proposals to Super Admin only |
| Monetisation Agent | Upsell/cross-sell/expansion triggers | Fires offers into tenant command centres |
| Support Agent | Tier-1 resolution, doc-grounded | Escalates to human with full context bundle |
| Success/Retention Agent | Churn-risk scoring + save plays | "Money saved receipt" is its primary artefact |
| GDPR Agent | DSAR automation, consent enforcement | Blocks sends lacking consent — in the send path |
| AML/KYC Agent | BitriPay onboarding screening | Sumsub/ComplyAdvantage connectors; human review queue |
| Regulatory Agent | Rule-change monitoring per market | Feeds compliance backlog |

## 9. Self-managing platform layer

| Agent | Monitors / does | Hard limits |
|---|---|---|
| System Health Agent | Uptime, latency, error budgets (SLO burn) | Read-only + alert |
| Bug Detection Agent | Error clustering, regression detection from logs | Files issues; no code changes |
| Auto-Repair Agent | Known-failure runbooks: restart, cache flush, failover, rollback | Only pre-approved runbooks; every action reversible + logged |
| Infra Optimisation Agent | Compute/storage/egress spend | Proposes; applies only tagged non-prod |
| Release Management Agent | Progressive rollout, canary analysis, auto-rollback | Rollback autonomous; rollout gates human |
| AI Governance Agent | Prompt/policy versioning, permission drift, model behaviour evals | Can freeze any agent (kill-switch executor) |

**The Auto-Repair boundary (non-negotiable):** self-healing means *executing
pre-approved runbooks*, never improvising fixes in production. New runbooks enter
through engineering review. This is the pattern behind every credible
"self-healing" claim at scale (Google SRE, Netflix).

---

## 10. Escalation model (uniform)

```
L3 auto-action ─▶ receipt to command centre feed
L2 capped action ─▶ execute + notify; over-cap → gate
L1 reversible action ─▶ execute + undo window (default 1h)
L0 recommendation ─▶ priority panel card
Gate (human) ─▶ approve / reject / edit; auto-expire to safe default
Incident ─▶ AI Governance freeze → human on-call → post-mortem → policy patch
```

Every escalation is an event; unanswered gates never silently execute. The full
audit trail schema is in `07-database-and-api.md` (`agent_decisions`,
`approval_gates` tables).
