# Trend Intelligence AI v2.3 — mapped onto what MarketWar OS already has

**Read this before building anything from that spec.** It is a 530-line
specification for a 6–8 week, two-engineer product, and a large majority of its
machinery already exists in `src/` under different names. The precedent is
`GROWTH-ENGINE-COVERAGE.md`, written for the same reason: *"Read it before
building anything from that spec; three quarters of it already exists."*

**The first thing to be clear about.** The spec's reference stack is Python,
FastAPI, PostgreSQL, Alembic, pgvector, Helm. This platform is Next.js,
TypeScript-strict, Firestore, Vercel. The spec settles that itself, twice:

> §12: *"The platform integration is an HTTPS adapter, regardless of whether the
> host uses Node, Python, PHP or another stack."*
>
> §198: *"Map this contract to the actual identity provider and tenant
> boundaries, event taxonomy, current agents, deployment stack, CMS revision
> semantics, existing AI gateway capabilities... **Keep the brief and action
> contracts stable.**"*

So **the contracts are the deliverable and the stack is not.** MarketWar OS is
the host. Rebuilding it in FastAPI would be the single most expensive way to
read this document.

Legend: ✅ exists and is live · 🔶 partial, named gap · 📦 genuinely absent

---

## The short answer

| | |
| --- | --- |
| **Already built** | tenant isolation, approvals with an immutable state machine, asset versions and restore, an at-least-once publication ledger with receipt reconciliation, emergency freeze, append-only audit, A/B statistics that refuse to lie, experiment history, a native owned surface serving real pages at `/b/{brandId}/{slug}`, first-party page measurement, a multi-provider AI gateway with a deterministic fallback, plans, quotas and per-action metering, the **Growth Brief** contract + run-time resolution (`shared/growth-brief.ts`), the **opportunity + independent confidence** scoring (`shared/trend-score.ts`), and the **brief coordinator** that turns a scored decision into a validated brief (`shared/growth-brief-build.ts`) |
| **Genuinely absent** | the **observation + evidence** model with provenance · a **keyless** signal source · the live **wiring** of the brief pipeline into `trend-watch`/`opportunity-radar` and the agents |
| **The one hard miss** | §2 is a release gate: the core workflow must run *"without asking the user or developer to obtain or enter a new third-party API key."* Today the trend engine's only live signal source is `search.ts`, which needs `SERPER_API_KEY` — a key that is currently **rejected 401/403** (see `STATE.md`). Everything else in the gate is already keyless |

---

## §1–2 · What it does, and the keyless requirement

| Requirement | State | Where |
| --- | --- | --- |
| A control layer that changes existing agents' priorities at run time | 📦 | nothing resolves a brief at run time; agents carry their own instructions |
| Host AI path — reuse the platform's configured AI service, host keeps the credentials | ✅ | `backend/gateway.ts` is exactly this: one door, provider credentials server-side, never in feature code |
| Deployment AI path | 🔶 | the gateway routes Anthropic/OpenAI/Gemini; **no bundled local inference**, so a disconnected install has no model |
| Deterministic path — detection, scoring, templates and export with no model at all | ✅ | zero-config demo mode is a platform-wide law, not a fallback bolted on |
| **Report the degraded or template mode in outputs** | ✅ | `shared/provider-failure.ts` reads a provider's refusal rather than guessing; capability reporting is `/api/capabilities` |
| **No new third-party key for the core workflow** | 🔶 | true for generation, publishing, measurement and approval. **False for signal reading** — see the hard miss above |

**Core acceptance matrix (§2), row by row**

| Step | State | What covers it |
| --- | --- | --- |
| Read signals automatically | 🔶 | `trend-watch.ts` schedules and scores relevance, but its source needs a key. First-party stores that need none already exist: `page_stats`, `results`, `inbound_messages`, `contacts`, `email_events`, `conversion_orders` |
| Detect, rank and retarget | 🔶 | `opportunity-radar.ts` ranks on a transparent, re-weightable score. **No brief is produced** |
| Generate actions | ✅ | 39 agents and 58 engines produce SEO and marketing output through one gateway, with templates when no provider answers |
| Apply approved changes | ✅ | `approvals.ts` → `asset-versions.ts` → `publication-ledger.ts`, with receipts and restore |
| Measure and adapt | ✅ | `page-analytics.ts` measures real first-party page outcomes (*"measured, not predicted"* — its own header), `experiments.ts` decides whether the result is real |

---

## §3 · Source registry and what each signal can prove

📦 **The registry itself.** Nothing records `access_path`, source family, terms,
permitted uses, cadence, ingestion lag, quota, retention or failure status per
source. The closest existing thing is `contact_source_policy` /
`contact_source_stats`, which does this for *enrichment* suppliers — the shape
to copy rather than invent.

| Feed | Keyless here? | Note |
| --- | --- | --- |
| First-party search, product events, conversions | ✅ **yes** | six stores already carry it; no key, no connector |
| CRM / sales / support topics | ✅ yes | `inbound_messages` and the vault |
| Google Search Console | 🔶 | needs `GOOGLE_OAUTH_*` or a CSV import; CSV path not built |
| Google Trends RSS | 📦 | **no RSS reader exists anywhere in the repo** |
| Wikimedia pageviews, curated RSS | 📦 | same gap |
| Keyword Planner / YouTube / social | 🔶 | catalogued, key-gated |

**The spec's own escape hatch is the answer here:** *"First-party events alone
can support a deployment when enough independent evidence is available."* That
path is buildable today with zero keys.

---

## §4 · Agent responsibilities

| Worker | State | Where |
| --- | --- | --- |
| Source collector | 🔶 | per-source collectors exist; no normalised observation output |
| Trend reader | 🔶 | `trend-watch.ts` clusters and scores relevance; no trend class, expiry or missing-data report |
| Opportunity strategist | 🔶 | `opportunity-radar.ts` ranks and explains; no veto model, no readiness input |
| Brief coordinator | ✅ | `shared/growth-brief-build.ts` turns a scored `Decision` into a contract-valid `GrowthBrief` (§4); only a `brief`/`auto_eligible` band produces one, and the output is re-validated. Live wiring into the pipeline is the remaining step |
| SEO and marketing agents | ✅ | they exist and are scoped; they consume no brief |
| Review and execution service | ✅ | `approvals.ts`, `guard.ts` rate limits, `publish-preflight.ts` (eight pre-publish checks) |
| Measurement worker | ✅ | `page-analytics.ts` + `experiments.ts` + `emergency-stop.ts` can pause |

---

## §5 · Detection and scoring — and the conflict to resolve

📦 **The observation schema.** No `observed_at` / `window_start` / `coverage` /
`evidence_hash` / `scaling_scope` anywhere. This is the denominator of
everything downstream and the right second slice.

📦 **The opportunity score as specified** — 25% demand, 25% platform fit, 20%
commercial intent, 15% timing, 15% readiness, with hard vetoes.

📦 **Confidence, computed independently** — 35% source quality, 25%
corroboration, 20% coverage, 20% freshness, **capped at 69 for a single source
family.** Nothing in the repo separates "how good is this opportunity" from "how
much do we trust the evidence", which is the distinction that stops a single
syndicated story becoming an action.

> ### CONFLICT: two opportunity scores
>
> `opportunity-radar.ts` already publishes an Opportunity Score and the landing
> pages describe it:
>
> `Demand × Commercial Intent × Relevance × Timing × Authority × Conversion ÷ Competition`
>
> The spec's is a **weighted sum of five different factors on a 0–100 scale**,
> with vetoes and a separate confidence. They are not the same function and they
> answer different questions — the radar ranks *content* opportunities for a
> brand; the spec's ranks *demand* opportunities for an installation and gates
> activation.
>
> **Recommended resolution, per the additive-only law: keep both.** Implement
> the spec's as its own named module for the spec's own purpose, leave the
> radar's published formula alone, and never let one silently become the other.
> Recorded in `REQUIREMENTS-COVERAGE.md` §Gaps.

---

## §6 · The contract connecting all agents — **the keystone**

✅ **Built.** The 22-field closed contract and its runtime resolution live in
`shared/growth-brief.ts` (`validateShape` + `resolveEffective`), the scoring in
`shared/trend-score.ts`, and the §4 coordinator that assembles a validated brief
from a scored decision in `shared/growth-brief-build.ts`. All three are pure and
covered by `tests/trend-intelligence.test.mjs` and `tests/growth-brief-build.test.mjs`
(TI-03, TI-05, the single-family cap, the decision table, the window rules).
What remains is wiring them into the live pipeline and persistence.
(`shared/render-brief.ts` is an unrelated *video render* brief.)

Everything else in the spec hangs off it: the agents resolve it (§4), the
actions reference its version (§6), approval binds to it (§18), the experiment
freezes against it (§10) and expiry is what makes a stale brief safe (TI-05).

**Core API (§6 / §16)** — the state machines already exist, the endpoints do not:

| Endpoint | State |
| --- | --- |
| `POST /v1/observations:batch` | 📦 |
| `GET /v1/opportunities` | 🔶 `/api/opportunity-radar` ranks but exposes no coverage, vetoes or evidence |
| `GET /v1/briefs:effective` | 🔶 resolution logic built (`growth-brief.ts` `resolveEffective`, with the 60s cache ceiling); the HTTP endpoint is not |
| `POST /v1/actions` + `:approve` + `:execute` + `:rollback` | 🔶 the *semantics* are built (`approvals.ts`, `asset-versions.ts`, `publication-ledger.ts`); the typed action envelope is not |
| `GET /v1/experiments/{id}` | ✅ `experiments.ts` + `experiment-history.ts` |

**Idempotency and the outbox.** ✅ in substance. `publication-ledger.ts` exists
for precisely the spec's §6 ambiguous-completion case — *"a publish call reaches
Facebook, Facebook creates the post, and the HTTP response is lost on the way
back"* — and resolves it by asking the channel rather than retrying.
`processed_events` gives transactional dedupe. §178 added movement-scoped keys
where two events describe one movement. What is missing is one **outbox table**
rather than several per-path ledgers.

---

## §7 · What changes on each channel

| Channel | State |
| --- | --- |
| SEO — intent match, cannibalisation flag, editorial approval for new pages/canonical/schema | ✅ mostly; the SEO engines, `publish-preflight.ts` and approvals cover it |
| Content and organic social | ✅ draft + approval workflow, no auto-replies |
| Paid search and social | ✅ `boost-ladder.ts` refuses to promote without conversion tracking and never spends |
| Lifecycle and CRM | ✅ consent, suppression and eligibility are enforced at send time |
| Landing pages and owned placements | ✅ real pages, versions, restore |
| **Draft-only pilot default** | ✅ this is already the platform's posture |

---

## §8 · Architecture, operations, security

| Requirement | State |
| --- | --- |
| Tenant isolation enforced server-side, composite scoping, never select before resolving authority | ✅ `brand-access.ts`, and `check:exposure` is a gate |
| Treat feed, user and imported text as untrusted; model returns bounded JSON; executor runs only typed actions | 🔶 the gateway bounds output; **no typed-action executor exists yet** |
| Provider secrets stay in the host gateway, absent from workers and prompts | ✅ and `check:key-reads` is a gate |
| Evidence IDs carried to citations; every factual claim maps to an approved claim | 🔶 `citation-measure.ts` and the claim engines exist; no `approved_claim_ids` binding on an action |
| Audit: reviewer, decision, evidence hash, model and prompt version, policy, revision, receipt, rollback | 🔶 `audit-log.ts` is append-only and records actor/action/before/after; it does not carry evidence hashes or prompt revisions |
| Channel freeze / emergency freeze | ✅ `emergency-stop.ts` — *"one switch that stops the platform acting on the world"* |
| Retention and deletion across raw text, logs, embeddings, backups | ✅ §169's data register and erasure walk all 93 stores |

---

## §10 · Proving performance and learning

✅ **Largely built, and built sceptically.** `experiments.ts` exists to prevent
exactly the spec's §10.3 warning — *"Do not repeatedly peek and promote on
noise"* — and its own header names the failure: *"a tool shows 'Variant B is
winning +40%!' after 12 clicks."* `experiment-history.ts` answers §10.4 (*"have
we tried this before"*). 🔶 Missing: freezing the hypothesis **at brief
approval**, because there is no brief to freeze it against.

---

## §12–22 · Product, install, commercial

| Area | State |
| --- | --- |
| Plans, feature keys, server-side limits | ✅ `subscription.ts`, 8 plans, limits enforced server-side |
| Entitlement statuses (trial/active/grace/suspended/ended) | 🔶 `lapsedAt` / `graceUntil` exist; no five-state machine |
| Metering: one unit per unique logical work ID, reserve → settle → release | 🔶 ACU metering charges once per provider call that happens, with refunds; no pre-reservation |
| Quota → 429 with reset timestamp | ✅ `guard.ts` returns 429 + `Retry-After` |
| Native owned-surface adapter: real renderer, immutable revisions, CAS, receipts, rollback | ✅ `landing.ts` + `landing-store.ts` + `asset-versions.ts`; pages serve at `/b/{brandId}/{slug}` |
| Native measurement without an external analytics tag | ✅ `page-analytics.ts` |
| `get_asset` / `apply_patch` / `get_receipt` / `restore_patch` adapter interface | 🔶 every behaviour exists; the four-method interface does not |
| Row-level security, migration role ≠ runtime role | ➖ **not applicable** — Firestore rules, not Postgres RLS. The intent (deny by default, server-side authority) is met; `firestore.rules` denies by default |
| OpenAPI at `/openapi.json` | 📦 |
| SBOM, signed images, Helm, offline entitlement | 📦 and out of scope until there is a private deployment to sign |

---

## The build order for what is actually missing

1. ✅ **The Growth Brief contract** (§6 + Appendix A) — `src/shared/growth-brief.ts`.
   Schema plus the runtime rules the spec is careful to separate: *"A
   schema-valid object can still fail these checks."*
2. ✅ **Opportunity score + independent confidence** (§5.4–5.5, §17) —
   `src/shared/trend-score.ts`, reproducing the spec's own conformance numbers
   (86.25, 83.5, and 69 for a single family).
2b. ✅ **The §4 coordinator** — `src/shared/growth-brief-build.ts`. Turns a
   scored `Decision` into a contract-valid brief, or a named refusal: only a
   `brief`/`auto_eligible` band produces one, and the assembled object is
   re-validated through `validateShape`, so a caller never receives a brief
   that file would itself reject. It sits exactly between the two layers above
   and the store below — the step that *constructs* the object the store then
   issues, reviews and resolves.
3. 📦 **The observation and evidence model** (§5, §15). The denominator. Needs a
   source registry with `access_path` and a unique source-version key. **Partly
   closed:** corroboration now counts *families* rather than sources
   (`SOURCE_FAMILY` over the radar's own twelve `SIGNAL_SOURCES`), and freshness
   is measured from the publication date the provider sends. What is still
   missing is the stored observation with a source-version key.
4. 📦 **A keyless first-party source** (§2, §3 row 1). The release gate. Still
   open: the only live signal source is `search.ts`, which needs
   `SERPER_API_KEY`.
5. ✅ **Effective-brief resolution** (§16) — `src/backend/growth-brief-store.ts`,
   served over HTTP on `/api/opportunity-radar` (`effective`), consulting the
   platform's own approvals workflow and the emergency stop's publish lane.
   Run-time adoption is wired: thirteen agents whose output lands on a live
   channel resolve the brief in force before they run.
6. 📦 **The typed action envelope** over the approval, version and ledger
   machinery that is already there.

## Where it is embedded, and why there rather than beside

This is not a second product bolted on. Every piece of it landed on something
that already existed:

| The spec's piece | Where it lives on this platform |
| --- | --- |
| §3 source families | `SOURCE_FAMILY`, over the twelve `SIGNAL_SOURCES` the radar has published since §13. A test fails if a source is ever added without a family. |
| §5.5 confidence + vetoes | Computed for every finding of the existing **weekly trend sweep** (`trend-watch.ts`). Its join/watch/reject recommendation is untouched — the evidence score sits beside it. |
| §5.5 freshness | Measured from the publication date `search.ts` now carries. It was dropping the provider's `date` and `source` on every news result, so freshness was unmeasurable. |
| §5 activation decision | `assess` on the existing `/api/opportunity-radar`, beside the radar's own formula so the two are never confused. |
| §6 the brief | Issued only when §5's band clears; stored per brand; listed and resolved on the same route. |
| §9/§18 approval | The platform's **existing** Collaboration & Approvals workflow. Re-issuing withdraws the sign-off, because the thing approved is no longer the thing that would happen. |
| §14 channel freeze | The **existing** emergency stop's `publish` lane, refusing through the same `{ok:false, baseline:true, code}` shape as every other refusal. |
| §19 audit | The **existing** `audit-log.ts`. |
| §14.5/§16 run-time adoption | `brief-preflight.ts`, on the **existing agent route** — an agent silently picks up the brief in force for its channel, exactly as that route already picks up live DNS, brand memory and a site crawl. No approved brief means baseline behaviour, silently. |
| The surface | **None, by owner directive.** This machinery works invisibly: no panel, no chips, no screen to operate. A brief appears only as an item in the Collaboration & Approvals workflow that already existed. `tests/trend-intelligence.test.mjs` fails if any of it is drawn again. |

`npm run drive:brief` exercises all of it over HTTP and then in a real browser — including that the screen shows **none** of it.

## What this document is not

It is not permission to skip the spec's own caveat: *"No host repository,
credentials, traffic, actual model benchmark or production integration was
supplied for verification."* Nothing here is measured against a real host. The
coverage claims are read from `src/` and are checkable by name; the spec's
performance targets (§20) are not yet measured anywhere.
