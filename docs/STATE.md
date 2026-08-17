# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

`REQUIREMENTS-COVERAGE.md` is the history — 4,800 lines of what changed and why,
across 40 numbered sections. It is useful for archaeology and useless for
knowing where you are, which is why this file exists. Do not add another
numbered section in place of updating this one.

Last updated: 2026-08-17.

---

## 1. What this is

An AI marketing operating system for small businesses. 55 engines behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on two
brands: **AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com,
enterprise programme intelligence).

Next.js 14 App Router, TypeScript strict, three layers (`backend` / `frontend` /
`shared`) enforced by `scripts/check-layers.mjs`. 205 backend modules, 129 API
routes, 66 dashboard pages, 1,133 tests.

---

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the
count and states the cause from the counts alone; with nothing sent, the
diagnosis is not the product, the price, the site or the copy, because none of
them has been in front of a buyer.

---

## 3. What works with NO keys at all

This is the honest list, and it is not short. These need no provider, no card
and no configuration:

- **The free website audit** (`/audit`) — a real crawl of a real page, score,
  findings, and an emailed lead recorded as an inbound prospect. Public, no
  account. This is the front door of the whole acquisition machine.
- **The ad canvas** — take your own photo in, get a PNG out at the real
  placement size, contrast-checked, laid out for five placements.
- **All pricing and margin arithmetic** — ProfitGuard, GrowthGuard, the
  commission ladder, product eligibility. Every refusal is computed.
- **The payout engine** — fee quotes across nine rails, identity gating, tax
  position. Money moves only with provider keys; everything up to it is real.
- **The acquisition run** — named prospects, what was sent, what came back.
- **Sentinel** — the human gate, the instruction firewall, counted detections.
- **The public content** — 13 blog articles in two clusters, 14 answer pages.
- **The emergency stop** — one switch that halts marketing sends, publishing,
  unattended runs, spend and payouts, scoped to a brand or the whole platform.
  Transactional mail has no lane and cannot be stopped by it.
- **The generation cache** — a double click is one generation, not two charges;
  an identical request inside the window reuses the answer instead of paying
  for it again.
- **Versions and restore** — nothing the customer paid for is overwritten; a
  restore adds a version rather than rewriting the chain, and a deleted item can
  be brought back from its own history.
- **Paid-media guardrails** — stop-loss, the +20% scale step and computed budget
  ceilings, all of which refuse to judge thin evidence rather than guessing.
- **The audit log** — the value before and the value after, with credentials
  redacted by value shape as well as by field name.
- **Channel health and the pre-publish check** — the eight checks run before
  anything is enqueued, and a check that cannot run never reports as passed.
- **The command bar** — one box on every dashboard screen (Cmd/Ctrl-K): say
  what you want and it names the engine that does it, what it will ask, and the
  cost in ACUs before anything runs.
- **The publication ledger** — a publish whose response is lost is recorded as
  uncertain, and the next attempt asks the channel whether the post went up
  rather than posting it a second time under the brand's name.

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any given deployment. Do not trust
this table over that endpoint — the endpoint asks each module's own check.

| Capability | One action |
|---|---|
| AI writing and strategy | `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GEMINI_API_KEY`) |
| Taking money | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| Saving work between visits | `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` |
| Sending email | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY` |
| Generating images | `OPENAI_API_KEY` or `GEMINI_API_KEY` |
| Rendering video | `GEMINI_API_KEY` (Veo) or `OPENAI_API_KEY` (Sora) |
| Running work on a schedule | `CRON_SECRET` |

When a capability is dark, the dashboard says so before the customer does the
work, names what still works, and never tells anybody to retry something that
cannot succeed.

---

## 5. Outstanding — the whole list, deduplicated

Everything genuinely open. If it is not here it is either done or it is not
happening.

**Owner actions (nothing in code can substitute):**

1. Set `HUMAN_CHECK_SECRET` in production. Without it the human gate signs
   sessions with a per-process key and cannot enforce; it stays in observe mode
   deliberately rather than bouncing customers between the dashboard and the
   check.
2. Open `/api/capabilities` on the live deployment and confirm what is actually
   lit. Nothing in this repository can see the production environment.
3. Submit the sitemap in Search Console after the next deploy. Pages do not rank
   because a file was committed.
4. Send the first ten messages. `/dashboard/acquisition` has the text written
   out per brand, with only the blanks a sender knows.

**The Growth Engine PRD (99 sections): `docs/GROWTH-ENGINE-COVERAGE.md`.**

Roughly three quarters of it was already built. The orchestration layer the
owner identified as the strongest idea — agents behaving as one growth
department — already exists (`orchestrator.ts` + `brand-memory.ts` +
`chain-exec.ts`). Read that file before building any of it; it is the map that
stops the same work being done twice. The build order it sets, highest first:

1. §27 creative fatigue — advertised in settings with no engine behind it — `work-library.ts` patches and deletes in
   place, which is the additive-only law unhonoured where a customer's own work
   lives.
2. §111 the ten-step E2E loop has no automated coverage.
3. §65/66 agency mode — currently advertised in settings with no engine.

**Known gaps in the product (real, not urgent):**

- A brand's promotable catalogue has no bulk import — products go in one at a
  time.
- Discovery of claimable products is a flat list; `matchProgrammes` exists in
  `creator-agents.ts` and is not wired to it.
- The landing-page builder and the onboarding flow have not been walked
  end-to-end for the export defect described in §6. They are the next two.
- The canonical origin is now defined once in `src/shared/site.ts`, and the SEO
  surface (sitemap, robots, blog and site JSON-LD, feature pages) uses it. Six
  API routes still carry their own copy of the same expression. They work, so
  they were left alone mid-fix rather than migrated for tidiness — recorded here
  so it is not rediscovered as new.
- `src/components/BviCard.tsx` renders twelve fabricated numbers in a field
  named `measured`. It is not mounted anywhere, so nothing ships it — recorded
  so that it is never mounted as it stands.

---

## 6. The defect class that keeps recurring

Worth stating once, because four separate bugs this month were the same shape.

**A value that exists on one side of a boundary and is never carried across.**

- The wallet computed a commission without asking which band the person was on.
- The capability report guessed environment variables instead of asking the
  module that owns them, and called a working feature dark.
- Seven surfaces rendered generated output with no way to take it away — the
  engine was correct, the last six inches were missing.
- The ad canvas supported photos and had no upload; exported SVG that no feed
  accepts.

Every one was at the surface, not in an engine. The engines keep turning out to
be right. When something looks broken, check the boundary before the logic.

---

## 7. Rules that outrank preference

The full engineering standard is `docs/ENGINEERING-DIRECTIVE.md` (owner
directive, permanent). `CLAUDE.md` carries the compressed version that loads
every session. Beyond it, specific to this platform:

- **Additive only.** Nothing delivered is deleted or downgraded. Conflicts are
  implemented as upgrades and recorded, never silently overwritten.
- **Never present a number as a measurement unless something counted it.** No
  risk scores, no invented benchmarks, no `NN% of businesses`.
- **Never take somebody's effort for an outcome you cannot deliver.** If a
  capability is dark, say so before the work.
- **Profit margin on AI actions is never below 100%** (price ≥ 2× provider
  cost), won on a lower cost base rather than by breaching the floor.
- **Verify before shipping:** `npm run typecheck`, `npm run build`, the layer
  check, and the test suite. Exercise changed routes against a running server.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main`.

---

## 8. This session, in one line each

Newest first. Full reasoning for any of these is in `REQUIREMENTS-COVERAGE.md`.

| Commit | What |
|---|---|
| `pending` | Paid-media guardrails — stop-loss, the scale step, computed ceilings |
| `da7791a` | Never overwrite somebody's work — asset versions and restore |
| `3d1394a` | Who changed this, from what, to what, and why — the audit log |
| `12e0f67` | Channel health and the eight pre-publish checks |
| `8c68772` | The command bar — the routing brain finally has a surface |
| `bad945a` | Never post the same thing twice — the publication ledger |
| `88f6280` | The 92-section Growth Engine PRD mapped to what is actually built |
| `f6ca62f` | Never pay twice for the same answer — the generation cache |
| `4f929f1` | One switch that stops the platform acting on the world |
| `9d…` | Breadcrumb URLs made absolute; one canonical origin for the SEO surface |
| `e73738a` | The sitemap's database call bounded so a slow store cannot hide the site |
| `b1c2c3d` | The engineering directive recorded where it loads every session |
| `fb4bfe1` | One current-state document, replaced rather than appended |
| `decc8db` | The capability report was guessing env vars and called working video dark |
| `a39e45d` | Seven surfaces rendered work the customer could not take away |
| `7bc36aa` | 14 answer pages, titled after buyer questions, each with a proof and a limit |
| `491723c` | Capability contract — never take work for an outcome that cannot be delivered |
| `dcd5066` | Ad canvas: a photo in, a postable PNG out |
| `5873710` | Buyer-side blog cluster routing into the audit |
| `6ba703c` | The free audit moved outside the login — the front door |
| `0d993fe` | The acquisition run: how many people were actually asked |
| `3db98d7` | The human gate enforces only when it can enforce correctly |
| `214ecc9` | Human gate, instruction firewall, Sentinel |
| `83349e2` | Two signup doors into one account; brand promotion modes |
