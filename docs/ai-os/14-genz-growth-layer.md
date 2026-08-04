# 14 — Gen-Z Growth Layer & the GZ-OS Agent Network

*Owner specs, 2026-08-04. Two messages: the 25-feature **Gen-Z Growth Layer**
organised into six hubs, and the **GZ-OS AI Agent Network** — 20 always-on
agents sharing one memory, plus four "world-first" layers on top.*

This document is the blueprint. What is already shipped, what shipped **because
of** these specs, and what is honestly still ahead — with the constraints that
decide how each piece can be built at all.

---

## 0. The premise, taken literally

> "Attracting Gen Z is not about changing the product — it's about changing how
> they discover, create, collaborate, buy and earn."

That sentence is the strongest thing in either spec, and it is the one the
build follows. MarketWar OS has ~60 dashboard surfaces and 39 agents. Sorted
into **Command / Acquisition / Conversion / Intelligence / Account** they are an
operator's map. Sorted into **Create / Grow / Earn / Play / Connect / Build**
they are a user's map. The same engines hang off both.

**Shipped:** `src/backend/genz-hubs.ts`, `/api/genz`, `/dashboard/hubs`.
Every tile links to a page that exists — a test walks `src/app` and fails the
build if any hub entry has no `page.tsx` behind it. Every hub publishes its own
`notYet` list, because a hub that shows five things and silently omits the eight
it lacks reads as complete when it is not.

---

## 1. The four constraints that decide everything below

Both specs are full of scores, predictions and rewards. Three of them collide
with rules this platform already enforces, and one collides with the law. They
are not obstacles to route around — they are the difference between a product
and a demo.

### 1.1 A prediction about an account we cannot measure is a hash-score

The specs ask for **predicted engagement**, **watch-time prediction**,
**retention prediction**, **scroll-stop probability**, **compatibility scores**,
**estimated ROI on a sponsorship**, **predicted campaign success**, and a
**parallel-universe simulator** that names the best message, audience, price,
launch date, creative and channel mix *before any money is spent*.

Nobody can measure most of those for an account they have no data from. This
repo has a name for the defect: **hash-as-score** — an FNV-1a seed dressed as a
measurement, removed on sight (see §54 in the coverage register, and the clip
finder rebuild).

The rule for every scoring agent in this document:

| Allowed | Not allowed |
|---|---|
| Scoring against the **customer's own** measured history (their past posts, their own click ledger, their own conversion data) | Scoring a video for an account with no history and calling it a watch-time prediction |
| A **checklist** score — "does the hook name a specific person in the first 3 words, is there a face in frame 1, is the CTA a verb" — labelled as a rubric | The same checklist output relabelled "87% scroll-stop probability" |
| A range with the sample size shown, and "not enough data to judge" below it | A single confident percentage produced from nothing |

The Creator Coach, Viral Lab and Parallel-Universe Testing are all buildable —
as **rubrics and as replays of the customer's own results**. They are not
buildable as oracles, and shipping them as oracles would make every other honest
number on the platform suspect.

### 1.2 A free ACU costs real money

The spec rewards challenges and missions with ACUs. An ACU is provider spend.
Two standing rules collide with handing them out: the owner's pricing law
(margin never below 100%) and §63 (*no free AI action regardless*).

**Resolved and shipped** in `src/backend/missions.ts`. Rewards are *funded*, not
printed. For a customer with realised revenue `R`, provider cost `C` and `S`
spent ACUs, the largest giveaway `G` that keeps the floor `f` is:

```
(R − C − G·c) / (C + G·c) ≥ f        where c = C / S
⇒  G ≤ S · (R − C(1+f)) / (C(1+f))
```

Below the floor the ceiling is zero and missions pay **XP, badges and streaks**,
which cost nothing and are the parts people actually chase. The board says which
state it is in and why. Mystery boxes and spin-to-win stay unbuilt for the same
reason: a random draw cannot be funded from a margin that has not been made.

### 1.3 Progress must be verified, or the scoreboard measures nothing

Every daily challenge is completed by **work the platform recorded** — a page
published, an email sent, a video rendered, a sale in the ledger. Nothing is
completed by a user saying they did it.

The corollary is published too: deed kinds the platform cannot yet observe
(prospect outreach, review requests) have their challenges **filtered out**
rather than displayed permanently at zero, and the board names them. A challenge
that cannot be cleared teaches people the whole thing is decorative.

### 1.4 Autonomy has a legal edge, and it is closer than it looks

Several agents act *on behalf of* the user. Where that crosses into commitment
or regulated advice, the approval gate is not optional:

- **"AI negotiates rates"** (Creator Marketplace Agent) — an agent agreeing a
  fee creates an expectation a human has to honour. Draft and recommend; the
  human accepts.
- **"AI replies to DMs / qualifies / negotiates"** (Personal Assistant Avatar) —
  fine for FAQs, not for pricing, availability promises or contract terms.
- **Health and Finance** in the Life OS — regulated advice in the UK. Out of
  scope until there is a licensed partner, and saying so is cheaper than an FCA
  problem.
- **Community moderation and "conflict resolution"** — an agent removing a
  member's post is a decision with a person on the other end. Recommend and
  queue; an admin presses the button.
- **Trend Hunter across TikTok / Snapchat / Discord / Twitch** — none of these
  offer a public trend API on terms we can use. Scraping them breaches their
  terms and puts the customer's connected accounts at risk. The honest position
  is: build the connector where an API exists, and **say the platform is not
  covered** where it does not, rather than inventing a trend score.

---

## 2. The 25-feature Growth Layer, mapped

`✅ shipped` · `🟡 partial — engine exists, Gen-Z front door does not` ·
`📘 blueprint` · `📦 backlog with a named blocker`

| # | Spec feature | State | Where it lives / what is missing |
|---|---|---|---|
| 1 | Creator Studio (video, reels, memes, trends, captions, hooks, hashtags, thumbnails, voice, subtitles, emoji, music) | 🟡 | `video-gateway`, `clip-finder`, `video-jobs`, `transcribe`, `image-gateway`, `hashtags`, `copywriter`, `content-engine`. Missing as their own tools: meme generator, thumbnail creator, emoji optimiser. **Voice cloning is gated on a consent record we do not capture yet and will not ship before it.** Music/sound-trend needs per-platform audio data nobody sells honestly. |
| 2 | Viral Trend Engine (9 platforms, predicts before peak) | 🟡 | `trend-watch` + `search` + `market-listening` read news and search. TikTok/Snapchat/Discord/Twitch have no usable API — see §1.4. A "competition is still low" claim needs a measured denominator. |
| 3 | Daily Challenges | ✅ **new** | `missions.ts` — five tracks, rotating, verified from recorded work. |
| 4 | Money Mission System | ✅ **new** | `MONEY_MISSIONS` + funded reward ceiling (§1.2). |
| 5 | AI Brand Coach | 🟡 | `brand-identity`, `brand-kit`, `logo-palette`, `agent-style`, `posting-time` (measured, not guessed). Missing: reading a user's connected Instagram/TikTok/LinkedIn profile — connector work. |
| 6 | Social CRM (top fans, buyers, silent followers) | 🟡 | `contacts`, `segments`, `engagement` do this for customers. Follower-level data requires platform connectors. |
| 7 | Gamification everywhere | 🟡 | XP, levels, streaks, badges ✅. Leaderboards, seasons, mystery boxes 📦 — see §1.2 and the audit requirement on cross-account ranking. |
| 8 | AI Co-Creation Rooms | 📦 | Real-time presence, conflict resolution and cursors. Infrastructure build, not a screen. `approvals` covers async collaboration today. |
| 9 | Community Marketplace | 📦 | Blocked on seller payouts (Stripe Connect), a rights check on what is sold, and a refund policy. `rights-guard` exists for the rights half. |
| 10 | AI Influencer Finder | ✅ | `creator-intel`, `creator-recruitment`, `/dashboard/influencers`. Fraud and audience-quality scoring must stay measured; "estimated ROI" needs the customer's own conversion history. |
| 11 | Live Shopping | 📦 | Streaming infrastructure + real-time commerce. Largest single build in the spec. |
| 12 | AI Collaboration Matching | 📦 | Needs audience data from accounts we are not connected to. Without it a match percentage is a guess wearing a number. |
| 13 | Instant Store Builder | 🟡 | `landing`, `funnel-checkout`, `offer-forge`, `checkout`, `creator-engine` (affiliate links) all exist separately. The single click does not. |
| 14 | AI Personal Assistant Avatar | 🟡 | `inbox`, `concierge`, `whatsapp` reply today. Auto-negotiation and availability promises need the gate in §1.4. |
| 15 | Reputation Score (trust/creator/brand/customer/response/reliability) | 🟡 | `reputation.ts` computes TrustScore from **real** reviews. The other five scores must each be defined from a measurable input before they exist, or they are five more hash-scores. |
| 16 | Local Discovery Engine | ✅ | `local`, `local-marketplace`, `concierge`, and §66's flyers + local group posts. |
| 17 | AR Marketing | 📦 | WebAR (model-viewer / 8th Wall class). Genuinely new; no existing engine. |
| 18 | AI Career Mode | 📦 | Portfolio, CV, LinkedIn optimiser, interview coach, gig finder. **The one part of the spec with no existing engine behind it at all.** |
| 19 | AI Side Hustle Generator | 📘 | Buildable now — but it must not print "expected earnings" for a business that does not exist. Ideas + a launch plan + the *questions* that decide viability. |
| 20 | Marketplace Missions | 📘 | Matching logic is buildable today; escrow is the blocker. |
| 21 | Creator Wallet | 🟡 | `wallet`, `ledger`, `creator-engine` commission, `stripe-billing`. Missing: withdrawals and tax reports. |
| 22 | AI Entertainment Layer | 📦 | See §1.2 — the reward economics decide what is possible, not the UI. |
| 23 | AI Networking | 📦 | Same blocker as #12. |
| 24 | Smart Notifications ("you could lose £350 if you don't reply") | 🟡 | `comms-events` has the catalogue and fan-out; `next-step` has the recommendation. The £ figure must come from a real pipeline value, never a dramatised one. |
| 25 | AI Growth Twin | 🟡 | `autopilot` is this loop today — scan, decide, act with approval. What is missing is *continuous* rather than on-demand, and the shared memory in §3. |

---

## 3. The GZ-OS Agent Network (message 2)

MarketWar already ships **39 agents** (`src/shared/agents.ts`). The spec's 20 are
not 20 new agents; they are largely a **re-naming and re-framing** of what runs
today, plus one genuinely new architectural idea.

| Spec agent | Nearest shipped engine |
|---|---|
| 1 Digital Twin (master brain) | `autopilot` + `strategy-run` + `command-summary` — the loop exists, the persistent per-user memory does not |
| 2 Trend Hunter | `trend-watch`, `search`, `market-listening` (news + search only — see §1.4) |
| 3 Audience Psychologist | `buyer-psychology`, `segments`, `customer-avatar` agent |
| 4 Viral Lab | `warfare`, `content-engine`, `batch-ads`, `experiments` |
| 5 Creator Coach | `creative-optimizer`, `creative-learning`, `video-intelligence` — **rubric, not oracle** (§1.1) |
| 6 Brand Builder | `brand-identity`, `brand-kit`, `logo-palette`, `agent-style` |
| 7 Growth Hacker | `experiments`, `creative-optimizer`, `page-analytics`, `landing` |
| 8 Community Manager | 📦 — closest is `inbox` + `comms-events`; moderation needs the gate in §1.4 |
| 9 Collaboration Engine | 📦 — blocked as #12 above |
| 10 Opportunity Radar | `opportunity-radar`, `intent-radar`, `lead-harvest` |
| 11 Income Optimiser | `roi-engine`, `unit-economics`, `profit-guard`, `plan-value` |
| 12 Commerce Agent | `offer-forge`, `funnel-checkout`, `checkout`, `loyalty` |
| 13 Storytelling Agent | `copywriter`, `content-engine`, `video-commander` agent |
| 14 Reputation Guardian | `reputation`, `crisis-command`, `market-listening`, `review-requests` |
| 15 Customer Success Agent | `engagement`, `recovery`, `customer-voice`, `next-step` |
| 16 Learning Companion | 📦 — new |
| 17 Mission Generator | ✅ **shipped** — `missions.ts` |
| 18 Future Predictor | `forecast` — must keep publishing its intervals and its inputs |
| 19 Creator Marketplace Agent | `creator-engine`, `creator-recruitment`, `partner-applications` — **negotiation stays human** (§1.4) |
| 20 Business Architect | `strategy`, `strategy-run`, `growth-plan`, `warlord` |

### 3.1 The one genuinely new thing: the shared memory

> "Each agent shares context through a central AI memory, creating one
> coordinated intelligence."

This is the real proposal, and it is correct. Today `strategy-run.ts` chains
seven agents by passing prior outputs forward, and `journey-compiler.ts` turns a
written plan into a runnable one — but the context dies with the run. Nothing
persists what an agent *learned about this brand* so the next agent starts from
it.

**The build, in order:**

1. **Brand Memory** — a durable, per-brand store of facts with provenance:
   `{ fact, value, source: agentId | "measured" | "customer-supplied", confidence, observedAt }`.
   Two hard rules: a fact records **where it came from**, and a fact derived from
   a model is never promoted to "measured". Without provenance, one agent's
   guess becomes the next agent's premise — which is how a chain of ten agents
   produces a confident plan built on nothing.
2. **Context assembly** — each agent run receives the memory slice relevant to
   it, not the whole store, so the token bill does not grow with tenure.
3. **The chain** — the spec's own worked example (Trend Hunter → Audience
   Psychologist → Storytelling → Viral Lab → Creator Coach → Growth Hacker →
   Commerce → Community → Income Optimiser → Future Predictor → Digital Twin) is
   exactly what `strategy-run` already does for seven agents. It generalises.
4. **Approval boundary** — the chain proposes; anything that spends, sends,
   publishes or commits goes through `approvals`. This already exists and must
   not be bypassed by the orchestrator.
5. **Cost ceiling** — an always-on agent network is a standing provider bill. It
   is metered per run (§63) and capped per brand per day, or a "continuous"
   agent becomes an unbounded invoice.

### 3.2 The world-first layers

| Layer | Verdict |
|---|---|
| **AI Life OS** (business, career, education, health, finance, travel) | Business, career and education are in scope. **Health and finance are regulated advice in the UK** — out until there is a licensed partner. |
| **AI Dream Simulator** ("build a £1m clothing brand") | Buildable as a **structured plan with the assumptions exposed and adjustable** — market size from real sources, unit economics from the customer's own numbers. Not buildable as a financial projection with a confident revenue line; that is a forecast about a business that does not exist. |
| **AI Parallel Universe Testing** | Buildable as **replay against the customer's own history** ("this subject line beat that one on your list, with n=…"). Not buildable as a simulator that names the best price and launch date for a market it has never observed. |
| **AI Economic Brain** | Macro signals are genuinely available and citable (ONS, central-bank releases, published indices). It must **cite the release and its date**, and never convert a macro signal into a per-brand revenue delta without a measured link. |
| **AI Business Operating Brain** (the five questions) | The strongest idea in either spec, and the closest to shipping. `next-step`, `opportunity-radar`, `command-summary`, `forecast` and `profit-guard` already answer four of the five between them. What is missing is one surface that asks all five and ranks the answers by measured £ — not a new engine. |

---

## 4. What shipped with this document

- `src/backend/genz-hubs.ts` — six hubs over the existing OS, route-verified.
- `src/backend/missions.ts` — daily challenges, XP, levels, streaks, badges,
  money missions, and the funded-reward ceiling that keeps the pricing law.
- `/api/genz`, `/dashboard/hubs`, and the sidebar entry.
- The constraints in §1, which are the actual deliverable: they decide whether
  the remaining 40-odd items get built as products or as demos.
