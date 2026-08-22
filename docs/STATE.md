# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

Two companions, and neither replaces this file:
`docs/GROWTH-ENGINE-COVERAGE.md` answers "has the 113-section PRD been built?"
section by section. `docs/REQUIREMENTS-COVERAGE.md` is the 4,800-line history,
useful for archaeology and useless for knowing where you are.

Last updated: 2026-08-22.

---

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on two
brands: **AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com,
enterprise programme intelligence).

Next.js, TypeScript strict, three layers (`backend` / `frontend` / `shared`)
enforced by `scripts/check-layers.mjs`. 219 backend modules, 45 shared modules,
170 API routes, 65 dashboard pages, **1,201 tests** including one end-to-end run
of the whole growth loop.

**Two branches, differing by ONE thing.** `main` is production on **Next 14**;
the dev branch is identical except for the **Next 15 / React 19** upgrade —
diffing them returns only `package.json`, `next.config.mjs` and the eight files
that await `params`. See §5 item 1.

---

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the
count and states the cause from the counts alone; with nothing sent, the
diagnosis is not the product, the price, the site or the copy, because none of
them has been in front of a buyer.

`docs/GO-TO-MARKET-MarketWar-OS.pdf` (and `.docx`) is the 34-page plan for
changing that number — locked launch city, five buyer segments, the real price
table, supplier sourcing, 30/60/90 with failable exit criteria, three budget
levels. Rebuild with `npm run gtm:doc`.

---

## 3. What works with NO keys at all

No provider, no card, no configuration:

- **The free website audit** (`/audit`) — a real crawl of a real page, findings,
  and an emailed lead recorded as an inbound prospect. Public, no account. The
  front door of the whole acquisition machine.
- **The public site has a menu on a phone** (it did not before 2026-08-21 — the
  nav was `hidden … md:flex` with nothing below it).
- **The client approval portal** (`/portal/[token]`) — a signed, single-item,
  expiring link an outside client opens with no account.
- **The screen recorder puts the presenter IN the file** — screen and camera
  composited onto a canvas that *is* the recording, draggable mid-take, with mic
  and system audio mixed to one track.
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, and all **pricing and
  margin arithmetic** — every refusal computed, never guessed.
- **The paid-media guardrails**, the **payout engine** (nine rails, quoted before
  money moves), and the **emergency stop** — five lanes; transactional mail has
  no lane and cannot be stopped by it.
- **The publication ledger** — a publish whose response is lost is uncertain, and
  the next attempt asks the channel rather than posting twice.
- **The eight pre-publish checks** (one that cannot run never passes), **channel
  health**, **versions and restore**, **creative fatigue**, **the audit log**,
  **the generation cache**, and **teams** (ten roles, nobody granting wider than
  they hold).
- **Splash screens on every platform** — `npm run splash`.
- **Sentinel** — human gate, instruction firewall, counted detections.
- **13 blog articles, 14 answer pages.** The **weekly newsletter** needs
  `NEWSLETTER_SECRET` before it sends anything.

**Built in the 2026-08-21/22 audit** — eleven PRD sections plus two rebuilds,
all pure, keyless and mutation-checked. Each is listed with its module in
`docs/GROWTH-ENGINE-COVERAGE.md`: §32 platform adaptation, §38 experiment
history, §41 comment intelligence, §70 activity feed, §89 training consent,
§92 entity search, §95 opportunity board, §97 action priority, §98 platform
KPIs, §102 campaign plan, §103 autonomy config, plus `shared/vitality.ts` and
`shared/recorder-layout.ts`.

They share one property worth stating: **each refuses to produce a number or an
action it cannot stand behind** — a stopped test is not a failure, a caption cut
never drops the call to action, a public complaint never gets a sales draft, a
median from one account is withheld, a chain that cannot finish never starts.

**None of them has a surface yet.** See §5.

---

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment. Do not trust this
table over that endpoint — the endpoint asks each module's own check.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` |
| Taking money | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| Persistence | `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` |
| Sending email | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY` |
| Scheduled work | `CRON_SECRET` · Newsletter: `NEWSLETTER_SECRET` |
| **Client approval links** | **`PORTAL_LINK_SECRET`** (16+ chars). Refuses to ISSUE without it — a link that verifies on one server and fails on every other makes the agency look broken to their own customer. |

---

## 5. Outstanding — the whole list, deduplicated

**1. RE-LAND NEXT 15 ON PRODUCTION. This is the one with a clock on it.**

Next 14 no longer receives security patches: 21 advisories apply to 14.2.35 —
App Router XSS, cache poisoning of RSC responses, SSRF in rewrites, middleware
bypass — and every one is fixed only in 15.5.x or later. The upgrade is built,
green and on the dev branch (Next 15.5.23, React 19.2.8, eight files awaiting
`params`, `serverExternalPackages` moved).

Rolled off production on 2026-08-21 as a precaution during a live
`/verify-human` failure, NOT because it was proved to be the cause: the Next 15
build serves that endpoint locally at 200 through the real middleware, and
production could not be reached from the build container to confirm anything.

**To close it:** deploy the dev branch to a Vercel preview, open
`/api/auth/human` and `/verify-human` there, and if both answer, merge.

**Owner actions (nothing in code can substitute):**

2. Set `HUMAN_CHECK_SECRET` in production. Without it the human gate signs
   sessions with a per-process key and stays in observe mode.
3. Set `PORTAL_LINK_SECRET` if client approval links should work.
4. Open `/api/capabilities` on the live deployment.
5. Submit the sitemap in Search Console.
6. Set `NEWSLETTER_SECRET` if the weekly newsletter should go out.
7. **Send the first ten messages.** `/dashboard/acquisition` has the text
   written out per brand, with only the blanks a sender knows.

**Engines built, surfaces not yet built.** Everything in §3's audit table is a
tested engine with no screen in front of it. That is the defect class this
repository produces most often (see §6), so it is written down rather than
assumed obvious: §70's feed, §92's search box, §95's board, §97's queue, §98's
admin panel, §102's button and §103's settings form all need a surface before a
customer sees any of them.

**Genuinely not built:**

- §50 autonomous paid boost — the staged organic → small paid → scale ladder.
- §77 content performance knowledge graph — facts are key/value; there are no
  typed entities and relationships.
- §80 agent message bus — chains are sequential by construction, which is a
  deliberate simplification rather than an oversight.
- §14 content calendar views, §21 carousel card controls.
- §100 per-agent current task, discoveries, cost and impact.
- A brand's promotable catalogue has no bulk import.
- `matchProgrammes` has an API route and no discovery surface.

**Security debt, with the reasoning:**

- 6 moderate npm advisories, one chain (uuid → gaxios → @google-cloud/storage →
  firebase-admin), left deliberately: npm's own "fix" is a four-major downgrade
  of firebase-admin, and the advisory covers uuid v3/v5/v6 with a buffer while
  both consumers call only `v4()` without one. Unreachable path.
- The rate limiter is per-instance BY DESIGN and `guard.ts` says why. Money is
  protected by the things that count pounds: the durable ACU wallet, and
  `ai-spend.ts`'s now-SHARED monthly ceiling.

---

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
Nine instances now, four of them from this audit alone: the client portal engine
shipped with no route or page; the screen recorder acquired the camera and never
put the track in the file; the public site's nav existed only above a
breakpoint; a cost-per-customer breach was computed and silently dropped.
Earlier ones: the wallet's commission band, the capability report's guessed env
vars, seven surfaces with no way to take work away, the ad canvas with no
upload, the intent router nothing ever called.

**When something looks broken, check the boundary before the logic.**

**And a second one, which is about tests rather than code.**

**A test that passes for a reason unrelated to what it tests.** Six mutations
survived this audit, every one because the assertion was true by accident: three
greps proved the recorder's parts existed and nothing proved they were wired
together; a prefix check cannot detect a mid-word cut, because a mid-word cut is
a prefix; a one-item column is sorted correctly by every comparator; a fold's
reason sat on the oldest entry and folds read the newest; an overlap floor was
never exercised because an earlier fix had reduced every case to zero; and a
refusal fixture was shorter than the limit it was meant to exceed.

**A test that passes is not evidence until something has broken it.** Mutations
run in a git worktree (`git worktree add /tmp/mutant`) sharing the repo's
`node_modules`, so the main tree stays clean while they run.

Four tests have also failed on their own explanatory comments. Strip comments
before scanning source, and forbid the THING rather than the word.

---

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` carries the
compressed version that loads every session. Beyond it:

- **Additive only.** Nothing delivered is deleted or downgraded.
- **Never present a number as a measurement unless something counted it.**
- **Never take somebody's effort for an outcome you cannot deliver.**
- **Profit margin on AI actions is never below 100%** (price ≥ 2× provider cost).
- **Verify before shipping:** `npm run typecheck`, `npm run build`, the layer
  check, the test suite. Mutate the new tests to prove they are not decorative.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` — except
  while §5 item 1 is open, where the branches deliberately differ.
