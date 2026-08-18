# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

Two companions, and neither replaces this file:
`docs/GROWTH-ENGINE-COVERAGE.md` answers "has the 113-section PRD been built?"
section by section. `docs/REQUIREMENTS-COVERAGE.md` is the 4,800-line history,
useful for archaeology and useless for knowing where you are.

Last updated: 2026-08-17.

---

## 1. What this is

An AI marketing operating system for small businesses. 55 engines behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on two
brands: **AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com,
enterprise programme intelligence).

Next.js 14 App Router, TypeScript strict, three layers (`backend` / `frontend` /
`shared`) enforced by `scripts/check-layers.mjs`. 215 backend modules, 133 API
routes, 66 dashboard pages, 1,269 tests including one end-to-end run of the
whole growth loop.

---

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the
count and states the cause from the counts alone; with nothing sent, the
diagnosis is not the product, the price, the site or the copy, because none of
them has been in front of a buyer.

---

## 3. What works with NO keys at all

The honest list, and it is not short. No provider, no card, no configuration:

- **The free website audit** (`/audit`) — a real crawl of a real page, findings,
  and an emailed lead recorded as an inbound prospect. Public, no account. The
  front door of the whole acquisition machine.
- **The command bar** — one box on every dashboard screen (Cmd/Ctrl-K): say what
  you want, and it names the engine that does it, what it will ask, and the cost
  in ACUs before anything runs.
- **The ad canvas** — your own photo in, a postable PNG out at real placement
  size, contrast-checked.
- **All pricing and margin arithmetic** — ProfitGuard, the commission ladder,
  product eligibility. Every refusal is computed.
- **The paid-media guardrails** — stop-loss, the +20% scale step, computed budget
  ceilings. All refuse to judge thin evidence rather than guessing.
- **The payout engine** — fee quotes across nine rails, identity gating, tax
  position. Money moves only with provider keys; everything up to it is real.
- **The emergency stop** — one switch halting sends, publishing, unattended runs,
  spend and payouts. Transactional mail has no lane and cannot be stopped by it.
- **The publication ledger** — a publish whose response is lost is recorded as
  uncertain, and the next attempt asks the channel whether the post went up
  rather than posting a second time under the brand's name.
- **The pre-publish checks** — all eight, and a check that cannot run never
  reports as passed.
- **Channel health** — read from recorded publish attempts, not from whether a
  connection row exists.
- **Versions and restore** — nothing paid for is overwritten; restoring adds a
  version rather than rewriting the chain; a deleted item comes back from its own
  history.
- **Creative fatigue** — a worn-out creative detected against its own peak,
  significance-tested so a wobble is never mistaken for decline. No score.
- **The audit log** — the value before and the value after, credentials redacted
  by value shape as well as by field name.
- **The generation cache** — a double click is one generation, not two charges.
- **Teams and agencies** — a brand can now have members besides its owner, with
  ten roles and ten permissions. Nobody can grant more than they hold.
- **The installed app opens branded on every platform** — Chrome builds its
  splash from the manifest, iOS gets 32 `apple-touch-startup-image` files across
  16 device geometries in both orientations, and the in-app launch screen covers
  the gap between the OS splash and the session resolving. Regenerate with
  `npm run splash`.
- **Sentinel** — the human gate, the instruction firewall, counted detections.
- **The public content** — 13 blog articles in two clusters, 14 answer pages.
- **The go-to-market plan** — 30/60/90 with exit criteria that can be failed,
  five supplier routes with real minimums and lead times, four buyer segments
  with their objections, and the first-hundred arithmetic. It forecasts nothing:
  where a number cannot be known it says so and gives the method for finding it.
  Locks one launch city and divides a real budget across the 90 days — the
  column adds to exactly what was supplied, a fifth is never allocated, and
  nothing is invented when no budget was given. Rendered on
  `/dashboard/discover` and downloadable as `GO-TO-MARKET-<business>.md`,
  generated server-side so the document and the screen cannot drift apart.
- **The weekly newsletter** — every registered user, Tuesday 09:00 UTC, selling
  what their deployment can actually do, with the feature pages' own proof and
  limit and a great many links. One-click unsubscribe, no account, honoured
  instantly and platform-wide. Needs `NEWSLETTER_SECRET` before it sends
  anything.

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment. Do not trust this
table over that endpoint — the endpoint asks each module's own check.

| Capability | One action |
|---|---|
| AI writing and strategy | `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GEMINI_API_KEY`) |
| Taking money | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| Saving work between visits | `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` |
| Sending email | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY` |
| Generating images | `OPENAI_API_KEY` or `GEMINI_API_KEY` |
| Rendering video | `GEMINI_API_KEY` (Veo) or `OPENAI_API_KEY` (Sora) |
| Running work on a schedule | `CRON_SECRET` |
| Sending the weekly newsletter | `NEWSLETTER_SECRET` (16+ chars) — refuses to send without it, because an unsubscribe link that fails on another server produces spam complaints charged to every customer |

When a capability is dark the dashboard says so before the customer does the
work, names what still works, and never tells anybody to retry something that
cannot succeed.

---

## 5. Outstanding — the whole list, deduplicated

**Owner actions (nothing in code can substitute):**

1. Set `HUMAN_CHECK_SECRET` in production. Without it the human gate signs
   sessions with a per-process key and cannot enforce; it stays in observe mode
   deliberately rather than bouncing customers.
2. Open `/api/capabilities` on the live deployment. Nothing in this repository
   can see the production environment.
3. Submit the sitemap in Search Console after the next deploy.
4. Set `NEWSLETTER_SECRET` if the weekly newsletter should go out. It is
   scheduled for Tuesdays and will refuse to send until that exists.
5. **Send the first ten messages.** `/dashboard/acquisition` has the text written
   out per brand, with only the blanks a sender knows.

**Next in the product, in order:**

1. The client approval portal has an engine and NO surface — `/portal/[token]`
   and a share button are what make it usable. Until then it ships nothing.
2. §102/103 the one-click campaign and autonomous-mode buttons. Every engine and
   the Brand Brain context exist; the single button does not.
3. §32 platform adaptation (one master asset → native per-channel versions),
   §38 `checkHistoricalExperiments`, §41 comment intelligence, §70 the AI
   activity feed, §77 the knowledge graph, §80 the agent message bus,
   §89 the AI-training opt-out, §92 global search, §95–98.

**Known smaller gaps:**

- A brand's promotable catalogue has no bulk import.
- `matchProgrammes` exists in `creator-agents.ts` and is not wired to discovery.
- Six API routes still carry their own copy of the origin expression. They work,
  so they were left rather than migrated for tidiness.
- `src/components/BviCard.tsx` renders twelve fabricated numbers in a field named
  `measured`. **It is mounted nowhere** and must not be mounted as it stands.

---

## 6. The defect class that keeps recurring

Worth stating once, because it has now produced six separate bugs.

**A value that exists on one side of a boundary and is never carried across.**

- The wallet computed a commission without asking which band the person was on.
- The capability report guessed environment variables instead of asking the
  module that owns them.
- Seven surfaces rendered generated output with no way to take it away.
- The ad canvas supported photos and had no upload.
- The intent router had an API in front of it and no surface ever sent it a word.
- A cost-per-customer breach was computed and then silently dropped, because the
  branch that would have reported it was never reachable.

Every one was at the surface, not in an engine. The engines keep turning out to
be right. **When something looks broken, check the boundary before the logic** —
and `tests/loop.test.mjs` now runs one brand's real output through all ten steps
of the growth loop precisely because unit tests cannot see a seam.

---

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` carries the
compressed version that loads every session. Beyond it:

- **Additive only.** Nothing delivered is deleted or downgraded.
- **Never present a number as a measurement unless something counted it.** No
  risk scores, no invented benchmarks, no `NN% of businesses`.
- **Never take somebody's effort for an outcome you cannot deliver.**
- **Profit margin on AI actions is never below 100%** (price ≥ 2× provider cost),
  won on a lower cost base rather than by breaching the floor.
- **Verify before shipping:** `npm run typecheck`, `npm run build`, the layer
  check, the test suite. Mutate the new tests to prove they are not decorative.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main`.
