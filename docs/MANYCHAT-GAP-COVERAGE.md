# ManyChat gap spec → what MarketWar already has

Read this before building anything from that specification.

The spec lists nine P0 systems. **Roughly half of them already have working
foundations in `src/`** — some of them better than the spec assumes, because the
statistics and the refusals are real. Building them again is the single rule this
repository has broken most often, and it is what this file exists to prevent.

Verdicts: ✅ built · 🟡 partial (named, with what is missing) · ❌ absent
· ⛔ **blocked on a platform approval, not on code**

---

## The finding that matters more than the code

**Most of the P0 social work is gated by Meta and TikTok, not by engineering.**

| Capability | What it actually requires | Realistic lead time |
|---|---|---|
| Instagram comment → DM, DM keyword, story reply, live comment | A Meta app with `instagram_manage_messages`, **Business Verification**, **App Review**, and for automation at scale a Tech Provider arrangement | Weeks to months; **can be refused** |
| WhatsApp inbound/keyword/CTWA | A WhatsApp Business Account, Business Verification, a registered number, **pre-approved message templates** | Weeks |
| TikTok DM triggers | Messaging is **not generally available** through TikTok's public API | Indefinite — cannot be committed to |
| Meta Conversions API | An access token; no review needed | Days |

Writing the trigger engine before the app is approved produces code that cannot
be tested against anything real. **Start the Meta app review and business
verification now, in parallel** — it is the long pole, and nothing in section 3
of the spec can be finished without it.

---

## Section-by-section

### 2A. Visual conversation flow builder — 🟡 partial

The **execution engine exists**; the canvas does not.

- `backend/journey-compiler.ts` — turns text into ordered steps with
  `{atHours, channel, text}`, states its own `assumptions`, and lists `unparsed`
  lines rather than guessing.
- `backend/chain-exec.ts`, `backend/chain-store.ts`, `backend/orchestrator.ts` —
  runs multi-step agent chains on a schedule, `/dashboard/chains` is the surface.
- `shared/campaign-plan.ts` (§102) — one sentence in, a plan out.

**Missing:** the drag-and-drop node canvas, and these node types: Condition,
Split/A-B, Webhook, Assign Human, Start Sub-Flow. Chains are deliberately
sequential (`STATE.md` §5 records §80 as a considered decision, not an oversight)
— branching is the real change here, not the visuals.

### 3. Social engagement → sales triggers — 🟡 partial (ingestion built, delivery gated)

**Corrected framing:** App Review gates serving *other people's* accounts. In
Development Mode you receive real webhooks and send real DMs on accounts you own
— and AxionOS and VeryX are owned. So this was built and tested rather than
waited on, and a working integration is what makes the review go well.

- `app/api/webhooks/meta/route.ts` — the subscription handshake and the signed
  event endpoint. **HMAC-SHA256 over the raw body, constant-time**, and it
  REFUSES when no secret is set: this URL is public, and an unverified webhook
  that acts on its payload lets a stranger drive a customer's Instagram account.
- `backend/meta-webhook.ts` — flattens Meta's three-deep, per-product payload
  into one event shape. Malformed input drops one event rather than throwing,
  because a throw here makes Meta retry the whole batch forever.
- `shared/social-triggers.ts` — the rule model and matching, pure and fully
  tested without Meta. Guards the three expensive mistakes: replying to the
  account's own activity, DMing the same person repeatedly (one interested human
  is one lead, not four), and substring matching ("priceless" is not a price
  enquiry).
- `backend/meta-publish.ts` (386) — Meta OAuth and outbound publishing, already
  live and sharing the same `FB_APP_SECRET`.

**Still missing:** the connection store lookup (receiving account → brand), so
the route normalises and counts events without acting on them; DM delivery;
a surface to write rules on; and WhatsApp/TikTok entirely.

**Still gated:** `instagram_manage_messages` for customer accounts, a WABA for
WhatsApp. `backend/whatsapp.ts` remains an overview surface that makes no Graph
API call.

### 4. AI sales agent — 🟡 partial

The knowledge it needs largely exists; the **turn-taking conversation does not**.

- 19 agents in `shared/agents.ts`, brand memory, site facts, offers, voice.
- `backend/intent-router.ts` — `detectIntent`.
- `shared/comment-intelligence.ts` (§41) — classifies public comments and
  **refuses to draft a sales reply to a complaint**, which the spec does not
  mention and which matters more than it sounds.

**Missing:** multi-turn state, objection handling, escalation to a human,
"AI Decide → Act → Measure".

### 5. Universal prospect graph — 🟡 partial, and closer than the spec assumes

- `backend/acquisition.ts` (346) — `addProspect`, `recordAttempt`, `setStage`,
  `funnelFrom`, `diagnose`. Source, campaign and stage already recorded.
- `backend/contacts.ts` (216) — the consent-aware vault.
- `backend/prospecting.ts` (233) — `buildICP`, `searchProspects`, `scoreDeal`.

**Missing:** social handles as identity, and **cross-channel identity
resolution** (merging one person seen on two channels). That merge is the whole
difficulty; the rest of the field list is largely present.

### 6. Lead scoring + routing — 🟡 partial

- `backend/intent-radar.ts` — `scoreIntent`, `radar`.
- `backend/prospecting.ts` — `scoreDeal`.
- `shared/action-priority.ts` (§97) — ranks actions and **requires a stated
  basis for every factor**, refusing to rank what it cannot evidence.

**Missing:** scores updated per interaction, and hot/warm/cold routing. Note the
existing §97 design deliberately refuses to invent a factor — a lead score that
guesses would contradict the platform's own rule, so this must be fed by real
interaction data, which needs section 3 first.

### 7. Omnichannel inbox — 🟡 shell over demo data

- `backend/inbox.ts` (294) — `unifiedInbox`, `pipeline`. **Its only data source
  is `demoThreads()`.** No real ingestion.
- `/api/inbound` — a **real inbound email path** that replies, DKIM-signed and
  marked transactional.
- `backend/reply-routing.ts` (233) — per-brand, per-recipient reply addresses and
  bounce attribution. Genuinely strong and already live.

**Missing:** every non-email channel, assignment, SLA timers, internal notes.

### 8. Broadcast + sequence engine — 🟡 partial (email only)

- Email broadcast is **fully real**: `sendEmailBatch`, warm-up caps, suppression,
  per-recipient results, deadline handling (`backend/email.ts`, 1000+ lines).
- `journey-compiler.ts` supplies day-offset sequencing.

**Missing:** behavioural branching, stop-on-conversion, frequency caps, and
channel fallback (DM → WhatsApp → email → SMS). Fallback needs section 3.

### 9. AI flow generator — 🟡 partial

`compileJourney` already turns prose into a runnable sequence and **says what it
assumed**. `shared/campaign-plan.ts` does the same for campaigns. What is missing
is generating *branching* flows and the preview/test/publish loop.

### 10. Conversational data capture — ❌ absent

Nothing captures structured fields inside a conversation. Needs section 3.

### 11. Conversion + revenue attribution — 🟡 partial, and strong

- `backend/attribution.ts` — `viralToRevenue`, `attributeChannels`, `contentRoi`.
- `backend/ledger.ts`, `publication-ledger.ts`, ACU wallet, Stripe webhook.
- **Revenue is shown against costs actually entered** — never projected.

**Missing:** the conversation link in the chain (there are no conversations yet),
and cost-per-lead by ad.

### 12. A/B and autonomous optimisation — 🟡 partial, and better than specified

- `backend/experiments.ts` (300) — **real statistics**: `twoProportionTest`,
  `wilsonInterval`, `requiredSampleSize`, `evaluateExperiment`.
- `backend/experiment-history.ts` (§38) — refuses to re-propose an idea that
  already lost, and distinguishes *abandoned* from *failed*.

**Missing:** automatic traffic reallocation. Deliberate: the platform does not
act on a result it has not powered, which is the correct behaviour and should not
be "fixed" without thought.

### 13. Ad → conversation → sale — 🟡 partial

- Meta Pixel + Google Tag now fire real conversion events with an `eventID`
  emitted **specifically so server-side CAPI can deduplicate later**
  (`frontend/analytics.ts`, `shared/analytics-events.ts`).
- `backend/paid-guardrails.ts` — stop-loss, scaling rules, computed ceilings.

**Missing:** Meta Conversions API server-side, and click-to-DM/CTWA ingestion.
**CAPI is the cheapest high-value item in the entire spec** — days, no approval.

### 14. Developer / integration layer — 🟡 partial

- `backend/integrations.ts` (335) — connector status, provisioning, autonomy.
- 170 API routes; Stripe, email and zernio webhooks; Google OAuth store.

**Missing:** a public REST API with keys, outbound webhooks for customers, an
HTTP-request node, and third-party connectors (Zapier, HubSpot, Shopify…).

---

## What is genuinely absent, in one list

1. Inbound social webhooks — ✅ Instagram/Messenger built; WhatsApp and TikTok absent
2. Comment/DM/story trigger engine — ✅ matching built; **delivery and a rule surface still missing**
3. Multi-turn AI conversation with escalation
4. Cross-channel identity resolution
5. Conversational data capture
6. A branching visual flow canvas
7. Meta Conversions API server-side ← *the one with no approval blocker*
8. Public API, customer-facing webhooks, third-party connectors

## Recommended order, and why

**Before any of it:** `/dashboard/acquisition` still reads **0 customers, 0
messages sent**. An omnichannel inbox with no conversations is nine surfaces of
refusals. The directive's own priority is stability → correctness → security →
UX → performance → new features, and "never add features on unstable
foundations".

1. **Start Meta app review + business verification today.** Not code. It gates
   items 1 and 2 and takes the longest.
2. **Meta Conversions API** (§13). Days, no approval, and it makes the ad spend
   measurable — which is what turns £1 of spend into a decision instead of a guess.
3. **Real inbox ingestion for the channel that already works: email.**
   `/api/inbound` and `reply-routing.ts` are live; wiring them into `inbox.ts` in
   place of `demoThreads()` turns a demo shell into a working product for one
   channel, and proves the thread/assignment model before four more arrive.
4. **Instagram comment → DM**, the moment approval lands.
5. Everything else, ranked by what the first ten customers actually ask for.

Steps 2 and 3 are buildable now, need no permission from anybody, and each is a
finished vertical rather than a half-built layer.
