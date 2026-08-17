# Autonomous Growth & Creative Intelligence Engine — coverage map

The owner's PRD runs to 113 numbered sections. This maps every one of them to
what is actually in `src/`, so the next session extends the gap instead of
rebuilding the 80% that already exists.

**This file answers one question: has it been built?** It is REPLACED as
sections are delivered, never appended to. `docs/STATE.md` remains the single
description of where the platform stands overall.

Verified mechanically on 2026-08-17 by reading module exports and searching for
each concept, not by recollection. 208 backend modules, 1,162 tests. §108's four classes are used throughout: EXISTS ✅ / PARTIAL 🟡 / MISSING ❌.

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
| 27 | Creative fatigue detector | `creative-fatigue.ts` — significance-tested against the creative's own peak, no score — **delivered this session** | ✅ |
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
| 51 | Budget guardrails | `paid-guardrails.ts` (`withinBudget`, every §51 field by name) + `budget.ts` + `agent-budget.ts` — **delivered this session** | ✅ |
| 52 | Scale winner engine (+20% step) | `paid-guardrails.ts` (`scaleStep`) — **delivered this session** | ✅ |
| 53 | Stop-loss engine | `paid-guardrails.ts` (`stopLoss`, all six triggers) — **delivered this session** | ✅ |
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
| 62 | Asset version control | `asset-versions.ts`, wired into `work-library.saveWork` — **delivered this session** | ✅ |
| 63 | Undo / restore | `asset-versions.restoreVersion` + `work-library.restoreDeleted` — **delivered this session** | ✅ |
| 64 | Creative approval audit | `approvals.ts` (`transition` records actor, role, note) | 🟡 approver and time yes; version, channel and publication time no |
| 65 | Agency / multi-brand hierarchy | `membership.ts` (workspaces group brands; grants inherited) + `brand-access.ts` now consults grants — **delivered this session** | 🟡 engine + isolation wired; no agency dashboard yet |
| 66 | Client approval portal (secure link, no account) | `client-portal.ts` — signed, single-item, expiring, revocable — **engine delivered this session; the route and page are not built** | 🟡 |
| 67–68 | Team roles and permissions | `shared/workspace.ts` (all ten roles, all ten permissions) + `membership.ts` enforcement — **delivered this session** | ✅ |
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
| 84 | Social connection health (expired token, permissions, rate limit) | `connection-health.ts` + `/api/connection-health` + `ChannelHealth.tsx` on the Integration Hub — **delivered this session** | ✅ |

## §85–92 — publishing safety, rights, audit

| § | Requirement | Where it lives | State |
|---|---|---|---|
| 85 | Pre-publish validation chain | `publish-preflight.ts` — all eight checks, run before the claim in `meta-publish.ts` — **delivered this session** | ✅ |
| 86 | Retry without duplicate posting (`external_publication_id`) | `publication-ledger.ts` — **delivered this session**, wired into `meta-publish.ts` | ✅ |
| 87 | Creative compliance checker (flag Needs Review, never silent) | `claim-guard.ts` (`claimReport` — runs on every agent output before the customer sees it), `compliance.ts` (regulated categories), `rights-guard.ts` | ✅ |
| 88 | User content rights & ownership metadata | `rights-guard.ts`, `likeness-consent.ts` | 🟡 rights checks yes; per-asset ownership metadata and source tracking no |
| 89 | **AI training / data privacy control (workspace ON/OFF)** | nothing | ❌ |
| 90 | Data deletion | `DeleteAccount` component, `work-library.ts` (`deleteWork`), `connections.ts` (`deleteConnection`) | 🟡 account and item deletion yes; brand/workspace deletion, queues and retention policy no |
| 91 | Auditability (previous_value / new_value / reason) | `audit-log.ts` + `/api/audit-log` — **delivered this session** | ✅ |
| 92 | **Global search across entities** | `search.ts` is web search, not a search of the customer's own campaigns, creatives and results | ❌ |

## §93–99 — the surface

| § | Requirement | Where it lives | State |
|---|---|---|---|
| 93 | Global command bar | `intent-router.ts` + `/api/intent` + `CommandBar.tsx` — **the brain existed and nothing called it; the box was delivered this session** | ✅ |
| 94 | Natural-language workflows into a full plan | `intent-router.ts` routes to the owning engine; `orchestrator.ts` runs the multi-step chain; `campaign-architect.ts` builds the architecture | 🟡 one sentence routes to one engine; it does not yet decompose into the full ten-step ecosystem in a single command |
| 95 | **Opportunity board with columns** | `opportunity-radar.ts` scores and ranks; there is no board and no lifecycle states | ❌ |
| 96 | **Growth Score /100 with eight components** | `command-summary.ts` has `moneyScore` with a `measured` count and refuses to score what it cannot count. The eight-component Growth Score does not exist | ❌ |
| 97 | **Daily AI priority engine (impact/urgency/confidence/effort/cost)** | `command-summary.ts` `BriefItem` carries a priority; nothing computes it from those five factors | ❌ |
| 98 | **Platform KPIs (MarketWar's own)** | `admin-economics.ts` covers revenue, cost and margin; the product funnel metrics — time to first campaign, first lead, regeneration rate, publishing success — are not tracked | ❌ |
| 99 | One growth company, not fifty tools | the command bar is the answer to the navigation; `NAV` now carries 64 destinations with the duplicate removed | 🟡 the box is in; the fifteen-item navigation the section recommends is not |

## §100–113 — surface, sequencing, and the rules of engagement

| § | Requirement | Where it lives | State |
|---|---|---|---|
| 100 | AI Team screen with live agent state | `shared/warlord-roster.ts` (26 agents, division, mission, KPI, honest live/activate/roadmap status), `/dashboard/ai-agents`, `/dashboard/command` | 🟡 the roster and its status are real; per-agent *current task*, discoveries, cost and impact are not tracked |
| 101 | Campaign creation wizard | `/dashboard/campaigns`, `GuideWizard.tsx` | 🟡 a builder and a guide exist; not the nine-step wizard with an advanced bypass |
| 102 | **One-click campaign from Brand Brain context** | the context exists (`brand-memory.ts`) and the engines exist; the single button that runs the whole thing from one sentence does not | ❌ |
| 103 | **"Let MarketWar grow my business" autonomous mode** | `/dashboard/autopilot` runs cycles; the configuration block (budget, targets, allowed/forbidden channels, max CPA, approval threshold) is not one screen | 🟡 |
| 104 | P0 build list (20 items) | 18 of the 20 are ✅ above. The two that are not: content calendar views (§14) and carousel card controls (§21) | 🟡 |
| 105 | P1 build list (13 items) | 7 ✅ / 6 open — comment intelligence, creative fatigue, paid testing, scale engine, agency mode, deeper attribution | 🟡 |
| 106 | P2 build list | not started, and correctly so — it sits on top of P1 | ❌ |
| 107 | Non-functional: stability, idempotency, observability, performance, security, scalability | provider failover + `demoFallbackAllowed`; idempotency in `payout-execute.ts`, `publication-ledger.ts`, `generation-cache.ts`; `guard.ts` + `sentinel.ts` + `human-gate.ts` + `instruction-firewall.ts`; server-side keys only | 🟡 strong on stability, idempotency and security; **observability is the weak one** — there is no structured log of every AI execution and integration call (see §91) |
| 108 | `auditExistingFeature()` before building | **this document** | ✅ |
| 109 | Existing functionality stays operational; incremental introduction | every delivery this session extended an existing module or added a new one behind an opt-in; 1,162 tests green throughout | 🟡 no formal feature-flag system — additions are opt-in by signature instead |
| 110 | Definition of done (15 criteria) | followed per delivery — UI, API, persistence, errors, tests, build. **Not met platform-wide:** audit log (§91) and mobile verification are not part of any current gate | 🟡 |
| 111 | Required tests incl. the full E2E loop | 1,216 tests, mutation-checked, plus `tests/loop.test.mjs` — one brand's real output threaded through all ten steps — **delivered this session** | ✅ |
| 112–113 | Differentiator and target end-state | the acquisition half — prospecting, outreach, Share2Earn, attribution — is what the platform already has and Turbine does not | 🟡 direction, not a module |

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
- **§65/67/68 Workspaces, roles and membership** — `shared/workspace.ts` and
  `membership.ts`. This closed a gap that predates the PRD: `resolveBrandAccess`
  granted a brand to exactly one uid, so `team_member` — declared in
  `shared/roles.ts` since the beginning — could never be used. Access is now
  owner, or an explicit recorded grant, and nothing else.
- **§66 Client approval portal** — `client-portal.ts`. Signed, single-item,
  expiring, revocable; refuses to ISSUE without a durable secret. **The engine
  is done and the route and page are not built**, so it is not yet usable by a
  client.
- **§111 The ten-step E2E loop** — `tests/loop.test.mjs`. One brand's real
  output threaded from URL through strategy, campaign, creative, approval,
  schedule, publish, analytics and learning back into the next campaign. Every
  assertion checks the SEAM rather than the engine, because a unit test cannot
  see a value that fails to cross a boundary. It runs with no keys, and names
  the three steps it could not exercise instead of mocking them.
- **§27 Creative fatigue** — `creative-fatigue.ts`. Measured against the
  creative's own peak, every fall put through the two-proportion test
  `experiments.ts` already owns. No score. The settings page's "swap fatigued
  creatives at midnight UTC" — a job nothing performed — now says what the
  platform actually does.
- **§91 + §107 Audit log** — `audit-log.ts`. The value before and the value
  after, redacted by field name AND by value shape, append-only. AI executions
  and integration calls are recorded through it as metadata only.
- **§62/63 Asset versions and restore** — `asset-versions.ts`. Restoring is
  itself additive: putting version 1 back creates version 4 and leaves 2 and 3
  alone. Deleting a library item no longer destroys its history.
- **§51/52/53 Paid-media guardrails** — `paid-guardrails.ts`. Refuses to judge
  thin evidence, scales one +20% step at a time, and computes budget ceilings
  rather than promising them. `budget.ts`'s thresholds are now configurable with
  defaults that reproduce its behaviour exactly.
- **§84 Connection health** — `connection-health.ts`. Every state derived from
  recorded publish attempts rather than from whether a row exists. A success
  after a failure clears it; a rate limit is not a fault; an unclassifiable error
  is reported as "failing, and here is what it said" rather than given a
  confident wrong diagnosis.
- **§85 Pre-publish validation** — `publish-preflight.ts`, all eight checks, run
  before the publication is claimed. A check that CANNOT run never reports as a
  pass, and §87's "Needs Review" is a real verdict rather than a silent pass.
  The policy check calls the existing claim guard; nothing is duplicated.
- **§93 Command bar** — `CommandBar.tsx`, mounted on every dashboard screen and
  opened with Cmd/Ctrl-K. The routing brain (`intent-router.ts`, `/api/intent`)
  had existed the whole time with no surface calling it. Three intents added so
  the examples the box itself suggests actually route, and the confidence figure
  made honest — it read 100% whenever one keyword matched.
- **§86 Retry without duplicate posting** — `publication-ledger.ts`, wired into
  `meta-publish.ts`. The claim is written before the Graph call; a timeout is
  recorded as UNCERTAIN rather than failed, so the next attempt asks Meta whether
  the post exists instead of creating a second one. A channel with no way to
  verify gets no retry at all — the attempt is surfaced for a person to check.

## The build order for what is left

Ranked by the standing hierarchy — stability, then correctness, then security,
then UX, then features — not by PRD number.

1. **§66's route and page** — the portal engine has no surface, which is this
   codebase's own recurring defect. `/portal/[token]` plus a "share for approval"
   button is what makes it real.
2. **§65's agency dashboard** — all clients, spend, approvals in one view.
3. **§102/103 one-click campaign and autonomous mode** — the engines and the
   Brand Brain context both exist; what is missing is the single button.
4. Then §32, §38, §41, §70, §77, §80, §89, §92, §95, §96, §97, §98.

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
