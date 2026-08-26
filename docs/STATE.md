# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

Companions: `GROWTH-ENGINE-COVERAGE.md` answers "has the 113-section PRD been
built?"; `REQUIREMENTS-COVERAGE.md` is the history. Updated: 2026-08-26.

---

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com).

Next.js, TypeScript strict, three layers enforced by `scripts/check-layers.mjs`.
220 backend modules, 170 API routes, 67 dashboard pages, **1,547 tests**
including one end-to-end run of the growth loop.

**Two branches, differing by ONE thing.** `main` is production on **Next 14**;
dev is identical but for the **Next 15 / React 19** upgrade — a diff returns only
the package files, `next.config.mjs` and the files that await `params` (§5.2).

---

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the count
and states the cause from the counts alone; with nothing sent, the diagnosis is
not the product, the price, the site or the copy, because none has been in front
of a buyer. **See §5.1: the reason no mail ever arrived is found and fixed.**

`GO-TO-MARKET-MarketWar-OS.docx` is the plan for changing it — locked launch
city, five segments, the real price table, 30/60/90 with failable exit criteria.
`FACEBOOK-LAUNCH-CAMPAIGN.docx` is the paste-ready first campaign (§5.4). Every
doc build parses its prices and the **12 tools a buyer otherwise pays for
separately** out of `src/`, so none can print a stale number.

---

## 3. What works with NO keys at all

No provider, no card, no configuration:

- **The free website audit** (`/audit`) — a real crawl, **29 checks**, the three
  WORST free, the lead recorded as an inbound prospect. No account, no card; six
  adverts promise that and `npm run ads:verify` fails if it stops being true.
  Every failing finding carries what it costs, the fix, and what MarketWar does
  about it (`shared/audit-copy.ts`); a test walks that copy and fails on a
  percentage, a currency amount or the word "average". **The page now SHOWS the
  catalogue** — all 29 named, generated from that same file, each opening to what
  it costs, plus FAQPage markup — because a business with no customers to quote
  wins on specificity or not at all. It emails what it asks for an address to
  send, and refuses private and link-local destinations on every redirect hop
  (`shared/net-guard.ts`) — it would otherwise have read the cloud metadata
  service.
- **The client approval portal** (`/portal/[token]`) — a signed, single-item,
  expiring link an outside client opens with no account.
- **The screen recorder puts the presenter IN the file** — composited onto a
  canvas that *is* the recording, audio mixed to one track.
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, all **pricing and margin
  arithmetic**, the **paid-media guardrails**, the **payout engine** (nine rails,
  quoted before money moves) and the **emergency stop** (five lanes; transactional
  mail has none) — every refusal computed, never guessed.
- **The publication ledger** — a publish whose response is lost is uncertain, and
  the next attempt asks the channel rather than posting twice.
- **The eight pre-publish checks**, **channel health**, **versions and restore**,
  **creative fatigue**, **the audit log**, **the generation cache**, **teams**
  (ten roles), **Sentinel**, **13 blog articles, 14 answer pages**.

**Built in the 2026-08-21/22 audit** — eleven PRD sections; behaviour in
`GROWTH-ENGINE-COVERAGE.md`. **Each refuses a number it cannot stand behind.**

---

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment. Do not trust this
table over it.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` set 2026-08-26 (owner-reported; confirm on `/api/health/live`). **THE ACU WALLET IS THE GATE, NOT `AI_MONTHLY_CEILING_USD`** — every AI route requires auth AND `meterAction`, a 0-ACU account gets 402 before the gateway is reached, and the only unmetered path (the daily blog cron) needs BOTH `BLOG_DAILY_ENABLED=1` and `CRON_SECRET`, neither set. The dollar ceiling is a second belt over fastened braces. |
| Scheduled work | `CRON_SECRET` · Newsletter: `NEWSLETTER_SECRET` |
| **Sending email** | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY`. **Until one is set every send is REFUSED and reported as not sent** — it used to return success for mail delivered to nobody. |
| Client approval links | `PORTAL_LINK_SECRET` (16+ chars), falling back to `HUMAN_CHECK_SECRET` — which IS set, so links work today. A dedicated secret is hygiene, not a blocker. With NEITHER, issuing is refused rather than minting a link that verifies on one server and fails on every other. |
| Stripe, Firebase Admin | Both configured and verified live. `FIELD_ENCRYPTION_MASTER_KEY` set 2026-08-26, which unblocks PII writes that were being refused in silence — nothing predates it, because those writes never landed. |

---

## 5. Outstanding — the whole list, deduplicated

**1. MAIL: CAUSE FOUND AND FIXED IN CODE; AWAITING A DEPLOY.** The owner named
their own setup — `appuser@` is the account the host creates, `info@` is the
address the business uses — and that was the answer. One message carried THREE
mailboxes: AUTH `appuser@`, MAIL FROM `bounce@` (a default invented in our code
and never created anywhere), From `info@`. The relay queued it (`B92FD8E3CF`) and
delivered nothing, and the bounce went to a mailbox that does not exist, so the
failure destroyed its own evidence. `shared/sender-identity.ts` now holds one
rule: an envelope sender must be a mailbox that exists — the authenticated
account unless `MW_BOUNCE_ADDRESS` states otherwise — the From is never rewritten,
and a From that is not the account is declared with RFC 5322 `Sender:`.
**To close:** set `SMTP_USER=info@marketwaros.com` AND `SMTP_PASS` to that
mailbox's own password (they are per mailbox), redeploy, then `?send=self`.

**2. RE-LAND NEXT 15. The one with a clock on it.** 21 advisories apply to
14.2.35 — App Router XSS, RSC cache poisoning, SSRF in rewrites, middleware
bypass — fixed only in 15.5.x+. Built and green on dev; rolled off 2026-08-21
during a live `/verify-human` failure as a precaution, NOT because it was proved
to be the cause. **To close:** deploy dev to a Vercel preview, open
`/api/auth/human` and `/verify-human`; if both answer, merge.

**FIREBASE ADMIN IS LIVE** (`/api/health/auth`, 2026-08-25). Sessions carried
"Admin is not initialising" for weeks and hung diagnoses off it — check the
endpoint, never inherit the belief.

**3. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid and
`STRIPE_WEBHOOK_SECRET` set, so the easy causes are out. Left: (a) the wrong
`whsec_` — that account has SEVEN endpoints, each with its own; (b) the URL —
`MAIN_DOMAIN` is the APEX while the app serves `www.` and Stripe does not follow
redirects. **To close:** `/api/health/stripe` → `webhookDiagnostic.endpointUrl`,
then read a failed event's response body in Stripe.

**4. A REFERRED MARKETWAR ACCOUNT IS TRACKED BUT NOT PAID FOR.** §101 links a
creator's click to the account that signs up (last touch, 90 days). Nothing posts
a commission when that account PAYS US — and it must not be faked with a
zero-value ledger event, which bypasses the 10k gate.

**Owner actions (nothing in code can substitute):**
1. **`PLATFORM_ADMIN_EMAILS`** — without it nobody can reach
   `/api/admin/grant-acus`, so no wallet can be credited by hand and the owner's
   own balance stays 0. In production a wallet OPENS at 0; the 100-ACU signup
   allowance is claimed once via `/verify-human` after email verification.
2. Open `/api/health/live` after every change — `envPresent` is the only thing
   that proves the running build received it. Submit the sitemap.
3. **Send the first ten messages.** `/dashboard/acquisition` has the text per
   brand, with only the blanks a sender knows.
4. **Run the first Facebook campaign.** `FACEBOOK-LAUNCH-CAMPAIGN.docx`
   (`npm run ads:doc`): Traffic, not Awareness, and §0 argues it. Build the five
   custom audiences FIRST — they cannot be backfilled. `PITCH-CREATIVES.docx`
   is the five feature creatives with briefs; both verifiers fail on a stale
   price or an invented customer.

**Surfaces: six of seven** — §70, §92, §95, §98, §102, §103. **Not built:**
- §97's priority queue (five inputs need a basis nothing produces); §50 paid
  boost; §77 knowledge graph (facts are key/value); §80 agent message bus
  (chains are sequential by construction); §14 calendars, §21 carousels, §100
  per-agent cost/impact.
- No bulk catalogue import, and no PUBLIC page listing what brands have opened —
  a promoter must sign up before seeing anything to promote (Task 13).

**Security debt, with the reasoning:**
- 6 moderate npm advisories, one chain (uuid → … → firebase-admin), left
  deliberately: npm's "fix" is a four-major downgrade of firebase-admin, and it
  covers uuid v3/v5/v6 with a buffer neither consumer passes.
- The rate limiter is per-instance BY DESIGN and `guard.ts` says why. Money is
  protected by what counts pounds: the ACU wallet and `ai-spend.ts`'s now-SHARED
  monthly ceiling.

---

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
SIXTEEN instances, and the newest is the worst: a message whose login, envelope
sender and From header were three different mailboxes — none carried to the
others, one invented in source and never created anywhere. Before it, on the same
acquisition page, the crawler emitted `pass`/`warn`/`fail` while the audit's
colour function matched `critical`/`high`/`medium`, so a broken site looked
exactly like a healthy one; middleware refused every money route with a
machine-readable remedy nothing read; `/r/{CODE}` appended a referral code no
surface of ours read; `sendEmail` returned success in demo mode for mail
delivered to nobody; and the free audit asked for an address "to send you this
report" and never called the email module. The rest are in
`REQUIREMENTS-COVERAGE.md`.

**When something looks broken, check the boundary before the logic — and when a
success is reported, check that something actually happened.**

**And a second class, about tests rather than code: a check that passes — or
FAILS — for a reason unrelated to what it tests.** TEN now: greps proved the
recorder's parts existed, not that they were wired, then the same mistake proved
the audit "sends" mail; a prefix check cannot catch a mid-word cut, because a
mid-word cut IS a prefix; a one-item column is sorted by every comparator; an
overlap floor was never exercised; a refusal fixture was shorter than the limit
it exceeded; the ads verifier counted a TYPE as a thirteenth tool. Two were
caught by a test written before its code was believed: a £0 signup referral
would have bypassed the 10k payout gate.

**A test that passes is not evidence until something has broken it**; drive the
real handler and assert on a value only the real path can produce. Its sharpest
form is a DIAGNOSTIC that exercises a different path from the real one — three
rounds of SMTP probes each reimplemented a piece of SMTP, so `?send=` calls
`sendEmail` itself and the health check resolves the envelope with the sender's
own function. Four tests have failed on their own comments: strip comments before
scanning source, forbid the THING not the word.

---

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`; `CLAUDE.md` carries the
compressed version that loads every session. Beyond it:

- **Additive only.** Nothing delivered is deleted or downgraded.
- **Never present a number as a measurement unless something counted it**, nor
  report an action as done unless something did it.
- **Never take somebody's effort for an outcome you cannot deliver.**
- **Profit margin on AI actions is never below 100%** (price ≥ 2× provider cost).
- **Verify before shipping:** typecheck, build, layer check, tests. Mutate the
  new tests to prove they are not decorative.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` — except
  while §5.2 is open, where the branches deliberately differ on the Next version
  and its async-`params` migration. Mirror file-by-file, never by merge, and
  verify on main against its own `npm ci`.
