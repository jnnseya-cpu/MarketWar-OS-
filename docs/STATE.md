# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

Two companions, neither a replacement: `docs/GROWTH-ENGINE-COVERAGE.md` answers
"has the 113-section PRD been built?" section by section, and
`docs/REQUIREMENTS-COVERAGE.md` is the 4,800-line history, for archaeology only.

Last updated: 2026-08-22.

---

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com, enterprise
programme intelligence).

Next.js, TypeScript strict, three layers (`backend` / `frontend` / `shared`)
enforced by `scripts/check-layers.mjs`. 220 backend modules, 47 shared, 170 API
routes, 67 dashboard pages, **1,397 tests** including one end-to-end run of the
whole growth loop.

**Two branches, differing by ONE thing.** `main` is production on **Next 14**;
the dev branch is identical except for the **Next 15 / React 19** upgrade —
diffing them returns only the package files, `next.config.mjs` and the eight
files that await `params`. See §5 item 1.

---

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the count
and states the cause from the counts alone; with nothing sent, the diagnosis is
not the product, the price, the site or the copy, because none has been in front
of a buyer. **And see §5 item 1: mail could not have arrived even if sent.**

`docs/GO-TO-MARKET-MarketWar-OS.pdf` (and `.docx`) is the 34-page plan for
changing that number — locked launch city, five buyer segments, the real price
table, supplier sourcing, 30/60/90 with failable exit criteria, three budget
levels. Rebuild with `npm run gtm:doc`. The landing page names the **12 tools a
buyer otherwise pays for separately** (`shared/included-tools.ts`) — each with
its honest limit beside it, no competitor named, no competitor's price invented.

---

## 3. What works with NO keys at all

No provider, no card, no configuration:

- **The free website audit** (`/audit`) — a real crawl, findings, the lead
  recorded as an inbound prospect. Public, no account, no card. It now also
  EMAILS the report it asks for an address to send (it never did), and it
  refuses private and link-local destinations: it is unauthenticated, it fetches
  whatever it is handed, and it hands the response back, so it would have read
  the cloud metadata service for anyone who asked. Every redirect hop is
  re-checked; `shared/net-guard.ts` holds the rules.
- **The public site has a menu on a phone** (the nav was `hidden … md:flex`).
- **The client approval portal** (`/portal/[token]`) — a signed, single-item,
  expiring link an outside client opens with no account.
- **The screen recorder puts the presenter IN the file** — screen and camera
  composited onto a canvas that *is* the recording, draggable mid-take, mic and
  system audio mixed to one track.
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, and all **pricing and
  margin arithmetic** — every refusal computed, never guessed.
- **The paid-media guardrails**, the **payout engine** (nine rails, quoted before
  money moves), and the **emergency stop** — five lanes; transactional mail has no
  lane and cannot be stopped by it.
- **The publication ledger** — a publish whose response is lost is uncertain, and
  the next attempt asks the channel rather than posting twice.
- **The eight pre-publish checks** (one that cannot run never passes), **channel
  health**, **versions and restore**, **creative fatigue**, **the audit log**,
  **the generation cache**, **teams** (ten roles), **Sentinel**, **splash screens**
  (`npm run splash`), **13 blog articles and 14 answer pages**. The **weekly
  newsletter** needs `NEWSLETTER_SECRET` before it sends anything.

**Built in the 2026-08-21/22 audit** — eleven PRD sections (§32, §38, §41, §70,
§89, §92, §95, §97, §98, §102, §103) plus `shared/vitality.ts` and
`shared/recorder-layout.ts`. Behaviour: `GROWTH-ENGINE-COVERAGE.md`. They share
one property — **each refuses to produce a number or an action it cannot stand
behind**: a stopped test is not a failure, a caption cut never drops the call to
action, a public complaint never gets a sales draft, a median from one account is
withheld. Six of the seven have surfaces; §5 has the one that does not, and why.

---

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment. Do not trust this
table over that endpoint — the endpoint asks each module's own check.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` |
| Taking money | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| Persistence | `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` |
| **Sending email** | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY`. **Until one is set, every send is REFUSED and reported as not sent** — it used to return success for mail delivered to nobody. `GET /api/email` says whether anything will arrive. |
| Scheduled work | `CRON_SECRET` · Newsletter: `NEWSLETTER_SECRET` |
| **Client approval links** | **`PORTAL_LINK_SECRET`** (16+ chars). Refuses to ISSUE without it — a link that verifies on one server and fails on every other makes the agency look broken to their own customer. |

---

## 5. Outstanding — the whole list, deduplicated

**1. NO SENDING SERVER IS SET, SO NO MAIL LEAVES PRODUCTION.** The reported
symptom — nothing arrives, nobody hears back — and it is configuration, not code.
Set `MW_SENDING_POOL` (or `SMTP_HOST`+`SMTP_USER`+`SMTP_PASS`), or
`RESEND_API_KEY`, or `SENDGRID_API_KEY`; then open `GET /api/email`, which now
answers whether anything will arrive. Until then every send is refused and
reported as refused — it used to report success.

**2. RE-LAND NEXT 15. The one with a clock on it.** Next 14 gets no security
patches: 21 advisories apply to 14.2.35 — App Router XSS, RSC cache poisoning,
SSRF in rewrites, middleware bypass — all fixed only in 15.5.x+. The upgrade is
built and green on the dev branch (15.5.23, React 19.2.8). It was rolled off on
2026-08-21 during a live `/verify-human` failure as a precaution, NOT because it
was proved to be the cause; production cannot be reached from this container.
**To close:** deploy the dev branch to a Vercel preview, open `/api/auth/human`
and `/verify-human`, and if both answer, merge.

**Owner actions (nothing in code can substitute):**

3. `HUMAN_CHECK_SECRET`, or the human gate signs with a per-process key and stays
   in observe mode. `PORTAL_LINK_SECRET` for approval links, `NEWSLETTER_SECRET`
   for the weekly send.
4. Open `/api/capabilities` on the live deployment; submit the sitemap.
5. **Send the first ten messages.** `/dashboard/acquisition` has the text per
   brand, with only the blanks a sender knows.

**Surfaces: six of seven built.** `/dashboard/activity` (§70 — it also gave the
audit log its first screen; `/dashboard/audit` is the WEBSITE audit),
`/dashboard/find` (§92), the board on `/dashboard/discover` (§95), the KPI panel
on `/dashboard/admin` (§98), the planner on `/dashboard/chains` (§102), the
limits on `/dashboard/autopilot` (§103).

**§97's queue is deliberately NOT built.** It ranks actions on impact, urgency,
confidence, effort and cost, each needing a stated basis, and nothing produces
those — every action would come back unranked, so the screen would be a second
panel of refusals beside `command-summary`'s working "next best action".

**Genuinely not built:**

- §50 autonomous paid boost — the staged organic → small paid → scale ladder.
- §77 content knowledge graph — facts are key/value, no typed entities or edges.
- §80 agent message bus — chains are sequential by construction, a deliberate
  simplification rather than an oversight.
- §14 content calendar views, §21 carousel card controls, §100 per-agent task,
  discoveries, cost and impact.
- No bulk import for a brand's catalogue; `matchProgrammes` has an API route and
  no discovery surface. (Task 13.)

**Security debt, with the reasoning:**

- 6 moderate npm advisories, one chain (uuid → gaxios → @google-cloud/storage →
  firebase-admin), left deliberately: npm's own "fix" is a four-major downgrade
  of firebase-admin, and the advisory covers uuid v3/v5/v6 with a buffer while
  both consumers call only `v4()` without one. Unreachable path.
- The rate limiter is per-instance BY DESIGN and `guard.ts` says why. Money is
  protected by what counts pounds: the durable ACU wallet and `ai-spend.ts`'s
  now-SHARED monthly ceiling.

---

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
ELEVEN instances now. The two newest are the worst, because they were live and
silent: `sendEmail` returned success in demo mode for mail delivered to nobody,
so every counter, metric and screen downstream agreed that campaigns had been
sent — and the free audit asked for an address with the words "used to send you
this report" and never called the email module at all. Earlier: the client portal
with no route; the recorder that acquired the camera and never put the track in
the file; a nav that existed only above a breakpoint; a cost-per-customer breach
computed and dropped; the wallet's commission band; the capability report's
guessed env vars; seven surfaces with no way to take work away; the ad canvas
with no upload; the intent router nothing called.

**When something looks broken, check the boundary before the logic — and when a
success is reported, check that something actually happened.**

**And a second class, about tests rather than code: a test that passes for a
reason unrelated to what it tests.** Seven mutations have survived, each because
the assertion was true by accident: greps proved the recorder's parts existed and
not that they were wired — then the SAME mistake proved the audit "sends" mail,
since a grep for the call passes on a file that contains it and never runs it; a
prefix check cannot catch a mid-word cut, because a mid-word cut IS a prefix; a
one-item column is sorted by every comparator; a fold's reason sat on the oldest
entry and folds read the newest; an overlap floor was never exercised; a refusal
fixture was shorter than the limit it had to exceed.

**A test that passes is not evidence until something has broken it**, and the
cure for the wiring case is to drive the real handler and assert on a value only
the real path can produce. Mutations run in a worktree sharing `node_modules`.

Four tests have also failed on their own comments, and one forbade the word
`onerror=` when correctly escaped output contains it. Strip comments before
scanning source; forbid the THING, not the word.

---

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`; `CLAUDE.md` carries the
compressed version that loads every session. Beyond it:

- **Additive only.** Nothing delivered is deleted or downgraded.
- **Never present a number as a measurement unless something counted it** — and
  never report an action as done unless something did it.
- **Never take somebody's effort for an outcome you cannot deliver.**
- **Profit margin on AI actions is never below 100%** (price ≥ 2× provider cost).
- **Verify before shipping:** `npm run typecheck`, `npm run build`, the layer
  check, the test suite. Mutate the new tests to prove they are not decorative.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` — except
  while §5 item 1 is open, where the branches deliberately differ.
