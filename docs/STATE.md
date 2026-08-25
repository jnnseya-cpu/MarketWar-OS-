# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

Two companions, neither a replacement: `docs/GROWTH-ENGINE-COVERAGE.md` answers
"has the 113-section PRD been built?", and `docs/REQUIREMENTS-COVERAGE.md` is the
4,800-line history, for archaeology only. Last updated: 2026-08-23.

---

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com, enterprise
programme intelligence).

Next.js, TypeScript strict, three layers (`backend`/`frontend`/`shared`) enforced
by `scripts/check-layers.mjs`. 220 backend modules, 47 shared, 170 API routes, 67
dashboard pages, **1,457 tests** including one end-to-end run of the growth loop.

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

`docs/GO-TO-MARKET-MarketWar-OS.pdf` (`.docx`) is the plan for changing that
number — locked launch city, five segments, the real price table, 30/60/90 with
failable exit criteria. `docs/FACEBOOK-LAUNCH-CAMPAIGN.docx` is the paste-ready
first campaign (§5 item 6). `npm run gtm:doc` / `ads:doc` rebuild them; both
parse their prices and the **12 tools a buyer otherwise pays for separately**
(`shared/included-tools.ts`) out of `src/`, so neither can print a stale number.

---

## 3. What works with NO keys at all

No provider, no card, no configuration:

- **The free website audit** (`/audit`) — a real crawl, three findings free, the
  lead recorded as an inbound prospect. Public, no account, no card; six adverts
  promise exactly that and `npm run ads:verify` fails if it stops being true. It
  emails the report it asks for an address to send, and refuses private and
  link-local destinations on every redirect hop (`shared/net-guard.ts`) — it
  would otherwise have read the cloud metadata service for anyone who asked.
- **The client approval portal** (`/portal/[token]`) — a signed, single-item,
  expiring link an outside client opens with no account.
- **The screen recorder puts the presenter IN the file** — screen and camera
  composited onto a canvas that *is* the recording, audio mixed to one track.
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, all **pricing and margin
  arithmetic**, the **paid-media guardrails**, the **payout engine** (nine rails,
  quoted before money moves) and the **emergency stop** (five lanes;
  transactional mail has none) — every refusal computed, never guessed.
- **The publication ledger** — a publish whose response is lost is uncertain, and
  the next attempt asks the channel rather than posting twice.
- **The eight pre-publish checks** (one that cannot run never passes), **channel
  health**, **versions and restore**, **creative fatigue**, **the audit log**,
  **the generation cache**, **teams** (ten roles), **Sentinel**, **splash
  screens**, **13 blog articles and 14 answer pages**.

**Built in the 2026-08-21/22 audit** — eleven PRD sections (§32, §38, §41, §70,
§89, §92, §95, §97, §98, §102, §103); behaviour in `GROWTH-ENGINE-COVERAGE.md`.
**Each refuses to produce a number or an action it cannot stand behind.**

---

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment. Do not trust this
table over it.

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

**1. MAIL: CREDENTIALS SET, DELIVERY UNVERIFIED.** The owner reports
`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` in Production since 24 July — which is what
`smtpConfigured` needs, so the old "no sending server" diagnosis is superseded.
Whether the server ACCEPTS them is unchecked; this container cannot reach the
live site. **To close: open `GET /api/health/email`** — it runs a real SMTP
conversation and names the stage it failed at. If that passes and mail still
does not arrive, look upstream: routes fail closed while Firebase Admin is not
initialising, and a refused route never reaches a send.

**2. RE-LAND NEXT 15. The one with a clock on it.** Next 14 gets no security
patches: 21 advisories apply to 14.2.35 — App Router XSS, RSC cache poisoning,
SSRF in rewrites, middleware bypass — all fixed only in 15.5.x+. Built and green
on the dev branch (15.5.23, React 19.2.8); rolled off 2026-08-21 during a live
`/verify-human` failure as a precaution, NOT because it was proved to be the
cause. **To close:** deploy the dev branch to a Vercel preview, open
`/api/auth/human` and `/verify-human`, and if both answer, merge.

**3. A REFERRED MARKETWAR ACCOUNT IS TRACKED BUT NOT PAID FOR.** §101 links a
creator's click to the account that signs up (last touch, 90 days, consent
-tiered). Nothing posts a commission when that account PAYS US. Record, ledger
and payout rails all exist; the hook does not — and must not be faked with a
zero-value ledger event, which bypasses the 10k gate.

**Owner actions (nothing in code can substitute):**
3. `HUMAN_CHECK_SECRET`, or the human gate signs with a per-process key and stays
   in observe mode. `PORTAL_LINK_SECRET` for approval links, `NEWSLETTER_SECRET`
   for the weekly send.
4. Open `/api/capabilities` on the live deployment; submit the sitemap.
5. **Send the first ten messages.** `/dashboard/acquisition` has the text per
   brand, with only the blanks a sender knows.
6. **Run the first Facebook campaign.** `docs/FACEBOOK-LAUNCH-CAMPAIGN.docx`
   (`npm run ads:doc`): Traffic objective — NOT Awareness, and §0 argues it —
   three ad sets, six adverts, creative briefs. Build the five custom audiences
   FIRST; they cannot be backfilled. `npm run ads:verify` fails if a price or the
   public audit changes, and then the adverts must come down.

**Surfaces: six of seven built** — `/dashboard/` activity (§70), find (§92),
discover (§95), admin KPIs (§98), chains (§102), autopilot (§103).

**Genuinely not built:**

- §97's priority queue, DELIBERATELY: it ranks on five inputs that need a stated
  basis nothing produces — it would be a panel of refusals beside the working
  "next best action".
- §50 autonomous paid boost — the staged organic → small paid → scale ladder.
- §77 content knowledge graph — facts are key/value, no typed entities or edges.
- §80 agent message bus — chains are sequential by construction, a deliberate
  simplification rather than an oversight.
- §14 calendar views, §21 carousel controls, §100 per-agent task/cost/impact.
- No bulk catalogue import; `matchProgrammes` has an API route and no discovery
  surface, and there is no public page listing what brands have opened, so a
  promoter must sign up before they can see anything to promote. (Task 13.)

**Security debt, with the reasoning:**

- 6 moderate npm advisories, one chain (uuid → … → firebase-admin), left
  deliberately: npm's "fix" is a four-major downgrade of firebase-admin, and the
  advisory covers uuid v3/v5/v6 with a buffer while both consumers call only
  `v4()` without one. Unreachable path.
- The rate limiter is per-instance BY DESIGN and `guard.ts` says why. Money is
  protected by what counts pounds: the ACU wallet and `ai-spend.ts`'s now-SHARED
  monthly ceiling.

---

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
FOURTEEN instances now. The two newest: middleware refused every money route
with a machine-readable remedy nothing had ever read, so the screen printed the
sentence and dead-ended over a filled-in form; and `/r/{CODE}` appended a
referral code that no surface on our own side read, so a referred visitor
reached signup with no trace of who sent them.
The two worst were live and silent: `sendEmail` returned success in demo mode
for mail delivered to nobody, and the free audit asked for an address "to send
you this report" and never called the email module. The rest: the docx renderer
destructuring `text` from a block whose field is `copy`; the portal with no
route; the recorder that acquired the camera and never put the track in the
file; a nav only above a breakpoint; a cost-per-customer breach computed and
dropped; the wallet's commission band; the capability report's guessed env vars;
seven surfaces with no way to take work away; the ad canvas with no upload; an
intent router nothing called.

**When something looks broken, check the boundary before the logic — and when a
success is reported, check that something actually happened.**
**And a second class, about tests rather than code: a check that passes — or
FAILS — for a reason unrelated to what it tests.** TEN now: greps proved the
recorder's parts existed, not that they were wired, then the same mistake proved
the audit "sends" mail; a prefix check cannot catch a mid-word cut, because a
mid-word cut IS a prefix; a one-item column is sorted by every comparator; a
fold's reason sat on the oldest entry and folds read the newest; an overlap floor
was never exercised; a refusal fixture was shorter than the limit it exceeded;
the ads verifier counted a TYPE as a thirteenth tool. The last two were caught by
a test written before its code was believed: a signup referral written as a £0
conversion would have bypassed the 10k payout gate, and a redirect whose comment
said it dropped unknown codes carried them on.

**A test that passes is not evidence until something has broken it**, and the
cure for the wiring case is to drive the real handler and assert on a value only
the real path can produce. Four tests have also failed on their own comments, and
one forbade the word `onerror=` when escaped output contains it: strip comments
before scanning source, forbid the THING not the word, match a declaration not a
prefix.

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
  while §5 item 2 is open, where the branches deliberately differ on the Next
  version and its async-`params` migration. Diff `package.json`,
  `next.config.mjs` and any `[param]` handler before every mirror.
