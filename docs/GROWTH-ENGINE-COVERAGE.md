# Autonomous Growth & Creative Intelligence Engine — coverage map

The owner's PRD runs to 92 numbered sections. This maps every one of them to
what is actually in `src/`, so the next session extends the gap instead of
rebuilding the 80% that already exists.

**This file answers one question: has it been built?** It is REPLACED as
sections are delivered, never appended to. `docs/STATE.md` remains the single
description of where the platform stands overall.

Verified mechanically on 2026-08-17 by reading module exports and searching for
each concept, not by recollection. 204 backend modules, 1,133 tests.

---

## The headline

**Roughly three quarters of the PRD is already built and wired.** The central
idea the owner identified — *"the orchestration layer that makes multiple
specialist agents behave like one autonomous growth department"* — exists:
`orchestrator.ts` runs chains, `brand-memory.ts` is the shared per-brand
Growth Intelligence Memory, and `chain-exec.ts` carries memory into every step
and writes back afterwards. It was not missing.

What is genuinely absent clusters in four places: **safety controls around
publishing**, **agency/multi-tenant structure**, **the audit and versioning
trail**, and **paid-media guardrails**. Those are the build list.

---

## §1–45 — the growth engine

| § | Requirement | Where it lives | State |
|---|---|---|---|
| 1–2 | Growth Brain, persistent per-company intelligence | `brand-memory.ts` (`remember`/`recall`/`contextFor`, provenance rule, staleness, supersession) | ✅ |
| 3 | Growth Commander / orchestration | `orchestrator.ts` (`CHAINS`, `runChain`, `effectFor`), `warlord.ts`, `growth-plan.ts` | ✅ |
| 4 | Brand intelligence from a URL | `deep-crawl.ts`, `site-extract.ts`, `site-facts.ts`, `siteraid.ts`, `business-profile.ts` | ✅ |
| 5 | Brand Voice DNA | `brand-identity.ts`, `agent-style.ts` | ✅ |
| 6 | Visual Brand DNA + brand-lock | `brand-kit.ts`, `logo-palette.ts`, `identity-lock.ts` | ✅ |
| 7–8 | Competitor intelligence & content watch | `competitor-warroom.ts`, `ad-intel.ts`, `warroom.ts` | ✅ |
| 9 | Market gap detector, opportunity score | `opportunity-radar.ts` (`scoreOpportunity` with declared weights) | ✅ |
| 10 | Research intelligence engine | `market-research.ts`, `market-listening.ts`, `trend-watch.ts` | ✅ |
| 11–12 | Campaign strategy + angles with hypotheses | `campaign-architect.ts`, `strategy.ts` | ✅ |
| 13 | Weekly autonomous growth plan | `growth-plan.ts` | ✅ |
| 14 | Content calendar states & views | `strategy.ts`, `visibility-schedule.ts` | 🟡 states exist; the day/week/month/channel view set does not |
| 15–16 | Creative producer + creative brief | `content-engine.ts` (`buildBrief`), `visualstrike.ts`, `batch-ads.ts` | ✅ |
| 17–18 | Video pipeline + per-scene editing | `video-intelligence.ts`, `video-jobs.ts`, `ffmpeg-recipes.ts`, `clip-finder.ts` | 🟡 pipeline yes; per-scene regenerate-one-not-all is not built |
| 19 | Multi-aspect-ratio adaptation | `ad-canvas.ts`, `ffmpeg-recipes.ts` | ✅ |
| 20 | Image generation + variations | `image-gateway.ts`, `ad-styles.ts` | ✅ |
| 21 | Carousel builder | `visualstrike.ts`, `brand-kit.ts` | 🟡 generation yes; card-level add/reorder/regenerate controls no |
| 22 | Hook engine | `warroom.ts`, `video-intelligence.ts`, `landing.ts` | 🟡 hooks are produced throughout; there is no dedicated hook-variation engine |
| 23 | Virality / creative potential score | `visualstrike.ts`, `amplify.ts`, `video-intelligence.ts` (`scoreClip`) | ✅ |
| 24 | Variant factory without cost explosion | `creative-optimizer.ts` (`buildTestMatrix`, capped at 12) | ✅ |
| 25 | Test → learn → win | `experiments.ts` (Wilson intervals, two-proportion tests, required sample size), `creative-optimizer.ts` (`classifyPerformance`) | ✅ |
| 26 | Creative winner memory | `creative-learning.ts` (`learnFromExperiments`, `applyLearning`) | ✅ |
| 27 | **Creative fatigue detector** | nothing. Named in the settings page as "Swap fatigued creatives at midnight UTC" with no engine, and in an unmounted card as a fabricated score | ❌ |
| 28 | Auto-scheduling, best-time | `posting-time.ts` (`bestPostingTimes`, refuses to judge below 40 clicks / 300 opens), `visibility-schedule.ts` | ✅ |
| 29 | Approval modes | `approvals.ts`, `orchestrator.ts` (`effectFor` — anything that is not a draft is queued), `campaign-architect.ts` (`autonomyGate`) | ✅ |
| 30 | **Emergency stop** | `emergency-stop.ts` — **delivered this session** | ✅ |
| 31 | Multi-channel publishing | `meta-publish.ts` (native FB/IG), `zernio.ts` (long tail), `youtube.ts`, `whatsapp.ts` | ✅ |
| 32 | **Platform adaptation engine** | nothing. No module turns one master asset into native per-channel versions | ❌ |
| 33 | Performance analytics | `page-analytics.ts`, `email-metrics.ts`, `roi-engine.ts`, `reporting.ts` | ✅ |
| 34 | Cross-channel attribution | `attribution.ts` (`attributeChannels`, `viralToRevenue`) | ✅ |
| 35 | Revenue-first optimisation | `roi-engine.ts`, `profit-guard.ts`, `unit-economics.ts` | ✅ |
| 36 | AI performance analyst ("why did sales fall?") | `acquisition.ts` (`diagnose` — six branches, first is `nobody_asked`), `render-gap.ts` | ✅ |
| 37 | Growth memory classes | `brand-memory.ts` (dotted namespaces + `AGENT_INTERESTS`) | ✅ |
| 38 | **`checkHistoricalExperiments()`** | nothing. `experiments.ts` has the statistics; nothing asks "have we tried this and did it fail?" | ❌ |
| 39 | Persona engine | `segments.ts`, `buyer-psychology.ts` | ✅ |
| 40 | Audience intelligence | `segments.ts`, `posting-time.ts`, `engagement.ts` | ✅ |
| 41 | **Comment intelligence** | nothing. `engagement.ts` has `suggestReply` for email threads; no comment classification into buying intent | ❌ |
| 42 | Review intelligence → campaigns | `review-requests.ts`, `reputation.ts`, `customer-voice.ts` | ✅ |
| 43 | Content → lead loop | `landing.ts`, `funnel-checkout.ts`, `inbound.ts` | 🟡 destinations exist; content with no objective is not flagged |
| 44 | Lead magnet generator | `offer-forge.ts` | ✅ |
| 45 | Prospecting loop | `prospecting.ts` (ICP → discovery → score → sequence) | ✅ |

## §46–60 — orchestration, economics, providers

| § | Requirement | Where it lives | State |
|---|---|---|---|
| 46 | Campaign + prospecting in one strategy | `orchestrator.ts` `CHAINS` | ✅ |
| 47 | AI outreach agent, personalised | `prospecting.ts` (`buildSequence`), `local-outreach.ts`, `whatsapp.ts`, `copywriter.ts` | ✅ |
| 48 | Share2Earn escalation + spend caps | `share2earn.ts`, `creator-engine.ts`, `promotable.ts` (`marginAllows`) | ✅ |
| 49 | Share2Earn AI selection scoring | `promotable.ts`, `creator-intel.ts` | 🟡 eligibility and margin are computed; the five-factor score is not |
| 50 | **Autonomous paid boost (organic → small paid → scale)** | nothing. `amplify.ts` recommends amplification but not the staged-validation ladder | ❌ |
| 51 | Budget guardrails | `budget.ts` (`protectBudget`, SCALE/FIX/STOP), `agent-budget.ts` (daily ACU ceiling), `acu.ts` | 🟡 caps exist; `max_cpa` / `minimum_roas` / `max_test_spend` as named fields do not |
| 52 | **Scale winner engine (+20% step)** | nothing | ❌ |
| 53 | **Stop-loss engine** | `budget.ts` gets close with a STOP verdict; the threshold set (CPA, test cap, ROAS floor, compliance) is not there | ❌ |
| 54 | Campaign profitability (contribution after all costs) | `unit-economics.ts`, `roi-engine.ts`, `profit-guard-economics.ts` | 🟡 the arithmetic exists; Share2Earn rewards and AI generation cost are not both subtracted in one figure |
| 55 | AI cost governor | `acu.ts` (`quoteAcu`, `profitCheck`, `MARGIN_FLOOR = 2`), `agent-budget.ts`, `modelgate.ts` (`estimateAndReserve`, `reconcile`) | ✅ |
| 56 | Asset reuse engine | `work-library.ts` | 🟡 the library exists; nothing searches it before generating |
| 57 | **Generation cache** | `generation-cache.ts` — **delivered this session** | ✅ |
| 58 | Model router | `modelgate.ts` (`selectProvider`, `routingScore`, `circuitState`), `gateway.ts` | ✅ |
| 59 | Provider fallback | `gateway.ts` (three-provider failover with reserved budget), `modelgate.ts` (`fallbackChain`) | ✅ |
| 60 | Job queue with retries and back-off | `video-jobs.ts`, `gateway.ts` (`fetchWithRetry`, exponential back-off, Retry-After) | 🟡 no dead-letter queue |

## §61–84 — integrity, teams, command centre

| § | Requirement | Where it lives | State |
|---|---|---|---|
| 61 | Never duplicate jobs (idempotency key) | `payout-execute.ts` (claim before provider call), `generation-cache.ts` (in-flight coalescing), `modelgate.ts` | ✅ |
| 62 | **Asset version control** | nothing. `work-library.ts` patches and deletes in place — no `asset_versions`, no parent version | ❌ |
| 63 | **Undo / restore** | nothing | ❌ |
| 64 | Creative approval audit | `approvals.ts` (`transition` records actor, role, note) | 🟡 approver and time yes; version, channel and publication time no |
| 65 | **Agency / multi-brand hierarchy** | nothing. `brand-access.ts` scopes to a brand; Organisation → Workspace → Client does not exist | ❌ |
| 66 | **Client approval portal (secure link, no account)** | nothing | ❌ |
| 67–68 | Team roles and permissions | `guard.ts` (scopes), `brand-access.ts` | 🟡 authentication and brand scoping are enforced server-side; the ten-role matrix is not |
| 69 | Growth command centre | `src/app/dashboard/command`, `command-summary.ts`, `warlord.ts` | ✅ |
| 70 | **AI activity feed** | nothing | ❌ |
| 71 | Agent explainability ("why this") | `opportunity-radar.ts` (reasons), `acquisition.ts` (`diagnose`), `orchestrator.ts` (per-step reason) | 🟡 several engines explain themselves; there is no uniform "why" on every recommendation |
| 72 | Confidence score | `brand-memory.ts` (per-fact confidence), `market-research.ts`, `video-intelligence.ts` | 🟡 present where something measured it; not a uniform band on recommendations |
| 73 | Company-wide autonomy levels | settings page dial, `campaign-architect.ts` (`autonomyGate`), `orchestrator.ts` | ✅ |
| 74 | Morning briefing | `command-summary.ts` (`commandBriefing`), `src/app/dashboard/briefing` | ✅ |
| 75 | Weekly executive report | `reporting.ts` (`buildReport`, export specs) | ✅ |
| 76 | Learning loop on a cycle | `creative-learning.ts`, `autopilot.ts` | 🟡 the steps exist; they are not run as one scheduled loop that writes back to memory |
| 77 | **Content performance knowledge graph** | nothing. Facts are key/value in `brand-memory.ts`; there are no typed entities and relationships | ❌ |
| 78 | Core database entities | `brand-store.ts`, `contacts.ts`, `ledger.ts`, `work-library.ts`, `chain-store.ts`, `landing-store.ts`, `blog-store.ts`, `settings-store.ts`, `ad-canvas-store.ts` | 🟡 most named collections have a home; `organisations`, `workspaces`, `asset_versions`, `audit_logs` do not |
| 79 | Agent execution model (per-agent schema, budget, timeout) | `shared/agents.ts`, `orchestrator.ts` (`ChainStep` cost + effect), `agent-budget.ts` | 🟡 objective, tools, budget and timeout exist; `input_schema` / `output_schema` are not declared |
| 80 | **Agent message bus / event subscriptions** | nothing. Chains are sequential by construction, which is a deliberate simplification, not an event bus | ❌ |
| 81 | Recursion limits | bounded by construction — chain steps are a flat list, so depth is 1 — plus `agent-budget.ts` cost ceiling | ✅ (by construction) |
| 82 | Human-in-the-loop for sensitive operations | `orchestrator.ts` (`effectFor` — spend/send/publish always queue), `approvals.ts`, `payout-approvals.ts` | ✅ |
| 83 | Provider adapters | `gateway.ts`, `image-gateway.ts`, `video-gateway.ts`, `avatar-gateway.ts`, `integrations.ts` | ✅ |
| 84 | **Social connection health (expired token, permissions, rate limit)** | `connections.ts` reports connected/not connected only — no token expiry, permission or rate-limit state | ❌ |

## §85–92 — publishing safety, rights, audit

| § | Requirement | Where it lives | State |
|---|---|---|---|
| 85 | **Pre-publish validation chain** | nothing as a chain. The pieces exist scattered (`claim-guard.ts`, `compliance.ts`, `approvals.ts`, `meta-publish.ts`) | ❌ |
| 86 | Retry without duplicate posting (`external_publication_id`) | `publication-ledger.ts` — **delivered this session**, wired into `meta-publish.ts` | ✅ |
| 87 | Creative compliance checker | `claim-guard.ts` (`claimReport` — runs on every agent output before the customer sees it), `compliance.ts` (regulated categories), `rights-guard.ts` | ✅ |
| 88 | User content rights & ownership metadata | `rights-guard.ts`, `likeness-consent.ts` | 🟡 rights checks yes; per-asset ownership metadata and source tracking no |
| 89 | **AI training / data privacy control (workspace ON/OFF)** | nothing | ❌ |
| 90 | Data deletion | `DeleteAccount` component, `work-library.ts` (`deleteWork`), `connections.ts` (`deleteConnection`) | 🟡 account and item deletion yes; brand/workspace deletion, queues and retention policy no |
| 91 | **Auditability (previous_value / new_value / reason)** | `sentinel.ts` records security events only | ❌ |
| 92 | **Global search across entities** | `search.ts` is web search, not a search of the customer's own campaigns, creatives and results | ❌ |

---

## Delivered this session

- **§30 Emergency stop** — `emergency-stop.ts`. One switch, five lanes, scoped to
  a brand or the platform. Wired at the four boundaries that can actually act:
  `sendEmail`, `sendEmailBatch`, `publishNativeMeta`, `executePayout`, and
  `executeChain` on the unattended path. Transactional mail has no lane and
  cannot be stopped by it.
- **§57 Generation cache** (with §61 and §55's "never regenerate unnecessarily")
  — `generation-cache.ts`, wired into `gatewayComplete` after the firewall. A
  double click is one generation; the key is content and scope, never the clock.
- **§86 Retry without duplicate posting** — `publication-ledger.ts`, wired into
  `meta-publish.ts`. The claim is written before the Graph call; a timeout is
  recorded as UNCERTAIN rather than failed, so the next attempt asks Meta whether
  the post exists instead of creating a second one. A channel with no way to
  verify gets no retry at all — the attempt is surfaced for a person to check.

## The build order for what is left

Ranked by the standing hierarchy — stability, then correctness, then security,
then UX, then features — not by PRD number.

1. **§84 connection health** and **§85 the pre-publish validation chain.** Both
   are the same failure: publishing attempts something that could have been known
   to be impossible beforehand.
2. **§62/63 asset versions and restore.** `work-library.ts` patches and deletes
   in place, which is the additive-only law not being honoured in the one place a
   customer's own work lives.
3. **§53/51/52 the paid-media guardrails.** Stop-loss, the named budget fields
   and the staged scale step. `budget.ts` already produces the verdict; these are
   thresholds and a ladder on top of it, not a new engine.
4. **§27 creative fatigue.** Currently advertised in settings with nothing behind
   it, which is worse than absent.
5. **§91 the audit trail**, then **§65/66 agency mode**, then §32, §38, §41,
   §70, §77, §80, §89, §92.

## Two things found while mapping this

- `src/components/BviCard.tsx` renders twelve fabricated numbers in a field
  literally named `measured` ("CAC £7.38 — 21% of LTV", "7-day revenue at 118% of
  prior week") plus a fabricated twelve-week history and the claim "recalculated
  every 15 minutes". **It is not mounted anywhere**, so nothing ships it today —
  which is the only reason it is recorded here rather than fixed. It must not be
  mounted as it stands.
- The settings page advertises "Creative rotation — swap fatigued creatives at
  midnight UTC" as an autonomy capability. No engine detects fatigue (§27). The
  dial moves and nothing happens.
