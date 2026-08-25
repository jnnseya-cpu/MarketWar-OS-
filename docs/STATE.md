# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

Companions: `GROWTH-ENGINE-COVERAGE.md` answers "has the 113-section PRD been
built?"; `REQUIREMENTS-COVERAGE.md` is the history, for archaeology only.
Last updated: 2026-08-25.

---

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com).

Next.js, TypeScript strict, three layers enforced by `scripts/check-layers.mjs`.
220 backend modules, 170 API routes, 67 dashboard pages, **1,521 tests**
including one end-to-end run of the growth loop.

**Two branches, differing by ONE thing.** `main` is production on **Next 14**;
dev is identical but for the **Next 15 / React 19** upgrade — a diff returns only
the package files, `next.config.mjs` and the files that await `params`. See §5
item 2.

---

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the count
and states the cause from the counts alone; with nothing sent, the diagnosis is
not the product, the price, the site or the copy, because none has been in front
of a buyer. **And see §5 item 1: mail could not have arrived even if sent.**

`GO-TO-MARKET-MarketWar-OS.docx` is the plan for changing it — locked launch
city, five segments, the real price table, 30/60/90 with failable exit criteria.
`FACEBOOK-LAUNCH-CAMPAIGN.docx` is the paste-ready first campaign (§5 item 6).
Every doc build parses its prices and the **12 tools a buyer otherwise pays for
separately** out of `src/`, so none can print a stale number.

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
- **The screen recorder puts the presenter IN the file** — composited onto a
  canvas that *is* the recording, audio mixed to one track.
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, all **pricing and margin
  arithmetic**, the **paid-media guardrails**, the **payout engine** (nine rails,
  quoted before money moves) and the **emergency stop** (five lanes;
  transactional mail has none) — every refusal computed, never guessed.
- **The publication ledger** — a publish whose response is lost is uncertain, and
  the next attempt asks the channel rather than posting twice.
- **The eight pre-publish checks**, **channel health**, **versions and restore**,
  **creative fatigue**, **the audit log**, **the generation cache**, **teams**
  (ten roles), **Sentinel**, **13 blog articles and 14 answer pages**.

**Built in the 2026-08-21/22 audit** — eleven PRD sections; behaviour in
`GROWTH-ENGINE-COVERAGE.md`. **Each refuses to produce a number it cannot stand
behind.**

---

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment. Do not trust this
table over it.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` |
| Scheduled work | `CRON_SECRET` · Newsletter: `NEWSLETTER_SECRET` |
| **Sending email** | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY`. **Until one is set every send is REFUSED and reported as not sent** — it used to return success for mail delivered to nobody. |
| **Client approval links** | **`PORTAL_LINK_SECRET`** (16+ chars). Refuses to ISSUE without it — a link that verifies on one server and fails on every other makes the agency look broken to their own customer. |
| Stripe, Firebase Admin | Both configured and verified live. |

---

## 5. Outstanding — the whole list, deduplicated

**1. MAIL: CREDENTIALS SET, DELIVERY UNVERIFIED.** The owner reports
`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` in Production since 24 July — which is what
`smtpConfigured` needs, so the old "no sending server" diagnosis is superseded.
Whether the server ACCEPTS them is unchecked; this container cannot reach the
live site. **To close: open `GET /api/health/email`** — it runs a real SMTP
conversation and names the stage it failed at. If that passes and mail still
does not arrive, read the response body of a failed send rather than assuming a
cause.

**2. RE-LAND NEXT 15. The one with a clock on it.** 21 advisories apply to
14.2.35 — App Router XSS, RSC cache poisoning, SSRF in rewrites, middleware
bypass — all fixed only in 15.5.x+. Built and green on the dev branch; rolled off
2026-08-21 during a live `/verify-human` failure as a precaution, NOT because it
was proved to be the cause. **To close:** deploy dev to a Vercel preview, open
`/api/auth/human` and `/verify-human`, and if both answer, merge.

**FIREBASE ADMIN IS LIVE.** Confirmed 2026-08-25: `/api/health/auth` returns
`configured: true`, `initError: null`, valid PEM, project match, Identity Toolkit
passing. Earlier sessions carried "Admin is not initialising" as a standing
assumption and hung several diagnoses off it. It was WRONG — check the endpoint,
never inherit the belief.

**3. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid and
`STRIPE_WEBHOOK_SECRET` set, so the easy causes are out. Left: (a) the wrong
`whsec_` — that account has SEVEN endpoints, each with its own; (b) the URL —
`MAIN_DOMAIN` is the APEX while the app serves `www.`, and Stripe does not follow
redirects. **To close: `/api/health/stripe` → `webhookDiagnostic.endpointUrl`,**
then read a failed event's response body in Stripe.

**4. A REFERRED MARKETWAR ACCOUNT IS TRACKED BUT NOT PAID FOR.** §101 links a
creator's click to the account that signs up (last touch, 90 days,
consent-tiered). Nothing posts a commission when that account PAYS US — and it
must not be faked with a zero-value ledger event, which bypasses the 10k gate.

**Owner actions (nothing in code can substitute):**
3. `PORTAL_LINK_SECRET`, `NEWSLETTER_SECRET`. (`HUMAN_CHECK_SECRET` is set.)
4. Open `/api/capabilities` on the live deployment; submit the sitemap.
5. **Send the first ten messages.** `/dashboard/acquisition` has the text per
   brand, with only the blanks a sender knows.
6. **Run the first Facebook campaign.** `FACEBOOK-LAUNCH-CAMPAIGN.docx`
   (`npm run ads:doc`): Traffic, not Awareness, and §0 argues it. Build the five
   custom audiences FIRST — they cannot be backfilled. `PITCH-CREATIVES.docx`
   (`npm run pitch:doc`) is the five feature creatives with image briefs; both
   verifiers fail the build on a stale price or an invented customer.

**Surfaces: six of seven built** — activity (§70), find (§92), discover (§95),
admin KPIs (§98), chains (§102), autopilot (§103).

**Genuinely not built:**

- §97's priority queue, DELIBERATELY: five inputs that need a stated basis
  nothing produces — a panel of refusals beside the working "next best action".
- §50 autonomous paid boost; §77 content knowledge graph (facts are key/value);
  §80 agent message bus (chains are sequential by construction, deliberately);
  §14 calendar views, §21 carousel controls, §100 per-agent cost/impact.
- No bulk catalogue import, and no PUBLIC page listing what brands have opened —
  a promoter must sign up before they can see anything to promote. (Programmes
  and products are now both discoverable once inside; Task 13.)

**Security debt, with the reasoning:**

- 6 moderate npm advisories, one chain (uuid → … → firebase-admin), left
  deliberately: npm's "fix" is a four-major downgrade of firebase-admin, and the
  advisory covers uuid v3/v5/v6 with a buffer that neither consumer passes.
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
success is reported, check that something actually happened.****And a second class, about tests rather than code: a check that passes — or
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
