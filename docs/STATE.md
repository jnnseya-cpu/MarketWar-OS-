# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never
appended to.** If you read one document about this platform, read this one.

Companions: `GROWTH-ENGINE-COVERAGE.md` answers "has the 113-section PRD been
built?"; `REQUIREMENTS-COVERAGE.md` is the history. Updated: 2026-08-27.

---

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com).

Next.js, TypeScript strict, three layers enforced by `scripts/check-layers.mjs`.
235 backend modules, 178 API routes, 68 dashboard pages, **1,603 tests**
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

`GO-TO-MARKET-MarketWar-OS.docx` is the plan — locked launch city, five segments,
the price table, 30/60/90 with failable exit criteria. `FACEBOOK-LAUNCH-CAMPAIGN.docx`
is the paste-ready first campaign (§5.4). Every doc build parses its prices and the
**12 tools a buyer otherwise pays for separately** out of `src/`, so none can print
a stale number.

---

## 3. What works with NO keys at all — no provider, no card, no configuration

- **The free website audit** (`/audit`) — a real crawl, **29 checks**, the three
  WORST free, the lead recorded as an inbound prospect. No account, no card; six
  adverts promise that and `npm run ads:verify` fails if it stops being true.
  Every failing finding carries what it costs, the fix, and what MarketWar does
  about it (`shared/audit-copy.ts`); a test fails that copy on a percentage, a
  currency amount or "average". **The page SHOWS the catalogue** — all 29 named
  from that file, each opening to what it costs, plus FAQPage markup. It emails
  what it asked for an address to send, and refuses private and link-local
  destinations on every hop (`shared/net-guard.ts`) — it would otherwise have
  read the cloud metadata service.
- **The client approval portal** (`/portal/[token]`) — a signed, expiring link an
  outside client opens with no account.
- **The screen recorder puts the presenter IN the file** — composited onto a
  canvas that *is* the recording, audio mixed to one track.
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, all **pricing and margin
  arithmetic**, the **paid-media guardrails**, the **payout engine** (nine rails,
  quoted before money moves) and the **emergency stop** (five lanes; transactional
  mail has none) — every refusal computed, never guessed.
- **The publication ledger** — a publish whose response is lost is uncertain, so the
  next attempt asks the channel rather than posting twice.
- **Eight pre-publish checks**, **channel health**, **versions and restore**,
  **creative fatigue**, **the audit log**, **the generation cache**, **teams**
  (ten roles), **Sentinel**, **13 articles, 14 answer pages**.
- **Contact Hunter + Contact Finder** (`/dashboard/contact-hunter`, 2026-08-27) —
  find a business contact, or upload a list and have it filled in. Built on
  `lead-harvest`'s 12 checks and UK/EU/US lawful basis, CALLED not copied — a test
  fails if either grows its own. New is the honesty: **confirmed / inferred /
  provider never convert**, and an inferred address cannot be activated however
  well it scores; a pattern needs three known addresses; conflicting job titles
  block rather than average; a well-formed phone is never "verified"; objections
  are hashed, platform-wide, permanent; **it refuses to choose between two people
  with the same name**; the user's columns come back untouched; a resumed job
  never charges twice. Thirteen mutations caught.
- **Market Exit Capture** (`/dashboard/market-exit`, 2026-08-27) — a closed firm's
  demand sent to one that trades. The only engine wrong at a NAMED third party's
  expense, so it is built from refusals: publishing needs an official register
  entry or two independently-failing sources and **the public is never one of the
  two**; ten readings of one Google record count once; a contradiction or open
  dispute stops everything; demand is counted or **null saying what to supply**;
  `lead_captured → lead_distributed` is illegal so consent cannot be skipped;
  their customer list is refused **by field name at the door**. Eight mutations of
  those guards were each caught by a test.

**EVERY PUBLIC CLAIM IS BOUND TO THE CODE OR TESTED AGAINST IT** (2026-08-26).
Landing stats, plan prices/limits/ACUs, 39 agent cards, feature sections, 14
answer pages, 13 articles — claim by claim, held by twelve tests. **What broke was
always what somebody TYPED; everything derived was already right.** Worst three: a
4.0x ROAS rule where the guardrail says 3, a 48h kill-window existing nowhere, and
WhatsApp automation with no send path while that route's own comment said so.

---

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment; do not trust this table over it.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` set 2026-08-26 (owner-reported; confirm on `/api/health/live`). **THE ACU WALLET IS THE GATE, NOT `AI_MONTHLY_CEILING_USD`** — every AI route requires auth AND `meterAction`, a 0-ACU account gets 402 before the gateway is reached, and the only unmetered path (the daily blog cron) needs BOTH `BLOG_DAILY_ENABLED=1` and `CRON_SECRET`, neither set. The dollar ceiling is a second belt over fastened braces. |
| Scheduled work | `CRON_SECRET` · Newsletter: `NEWSLETTER_SECRET` |
| **Sending email** | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY`. **Until one is set every send is REFUSED and reported as not sent** — it used to return success for mail delivered to nobody. |
| Client approval links | `PORTAL_LINK_SECRET` (16+ chars), falling back to `HUMAN_CHECK_SECRET` — which IS set, so links work today. A dedicated secret is hygiene, not a blocker. With NEITHER, issuing is refused rather than minting a link that verifies on one server and fails on every other. |
| Stripe, Firebase Admin | Both configured and verified live. `FIELD_ENCRYPTION_MASTER_KEY` set 2026-08-26, which unblocks PII writes that were being refused in silence — nothing predates it, because those writes never landed. |

---

## 5. Outstanding — the whole list, deduplicated

**1. MAIL: CAUSE FOUND AND FIXED IN CODE; AWAITING A DEPLOY.** `appuser@` is the
account the host creates, `info@` the address the business uses — so one message
carried THREE mailboxes: AUTH `appuser@`, MAIL FROM `bounce@` (invented in our
code, never created), From `info@`. The relay queued it (`B92FD8E3CF`) and
delivered nothing; the bounce went nowhere, so the failure destroyed its own
evidence. `shared/sender-identity.ts` holds one rule: an envelope sender must be
a mailbox that exists. The From is never rewritten, and a From that is not the
account is declared with RFC 5322 `Sender:`. **To close:** set `EMAIL_FROM` to
`MarketWar OS <info@marketwaros.com>`, redeploy, `?send=self`. **Do NOT ask for
`SMTP_USER` to change** — verified 2026-08-27: `appuser@` logs in, `info@` is the
visible From, envelope + `Sender:` are `appuser@`, same domain so SPF/DMARC align.

**2. RE-LAND NEXT 15. The one with a clock on it.** 21 advisories apply to 14.2.35
— App Router XSS, RSC cache poisoning, SSRF in rewrites, middleware bypass — fixed
only in 15.5.x+. Green on dev; rolled off 2026-08-21 during a live `/verify-human`
failure as a precaution, NOT because it was proved to be the cause. **To close:**
preview dev, open `/api/auth/human` and `/verify-human`; if both answer, merge.

**FIREBASE ADMIN IS LIVE** (`/api/health/auth`, 2026-08-25) — check the endpoint.

**3. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid, `whsec_` set.
Left: (a) the wrong `whsec_` of that account's SEVEN endpoints; (b) the URL —
`MAIN_DOMAIN` is the APEX, the app serves `www.`, Stripe does not follow
redirects. **To close:** `/api/health/stripe` → `webhookDiagnostic.endpointUrl`.

**4. A REFERRED MARKETWAR ACCOUNT IS TRACKED BUT NOT PAID FOR.** §101 links a
creator's click to the account that signs up (last touch, 90 days). Nothing posts
a commission when that account PAYS US — and it must not be faked with a
zero-value ledger event, which bypasses the 10k gate.

**Owner actions (nothing in code can substitute):**
1. **`PLATFORM_ADMIN_EMAILS`** — set ONCE, then never again; check it at
   `/api/health/live` → `envPresent` before asking. Without it nobody reaches
   `/api/admin/grant-acus` and the owner's balance stays 0 (a wallet OPENS at 0;
   the 100 ACUs are claimed via `/verify-human`). Alternative, no redeploy:
   `node scripts/grant-admin.mjs you@… executive` sets the same claim.
2. Open `/api/health/live` after every change — `envPresent` is the only proof the
   running build received it. Submit the sitemap.
3. **Send the first ten messages.** `/dashboard/acquisition` has the text per brand.
4. **Run the first Facebook campaign.** `FACEBOOK-LAUNCH-CAMPAIGN.docx`
   (`npm run ads:doc`): Traffic, not Awareness. Build the five custom audiences
   FIRST — they cannot be backfilled. Both verifiers fail on a stale price.

**Surfaces: six of seven** — §70, §92, §95, §98, §102, §103. **Not built:** §97's
priority queue (five inputs need a basis nothing produces); §50 paid boost; §77
knowledge graph (facts are key/value); §80 agent message bus (chains are
sequential); §14 calendars, §21 carousels, §100 per-agent cost/impact; no bulk
catalogue import, no PUBLIC page listing what brands have opened (Task 13).

**Security debt, with the reasoning.** 6 moderate npm advisories, one chain
(uuid → … → firebase-admin), left deliberately: npm's "fix" is a four-major
downgrade of firebase-admin, covering uuid v3/v5/v6 with a buffer neither consumer
passes. The rate limiter is per-instance BY DESIGN and `guard.ts` says why; money
is protected by what counts pounds — the ACU wallet and `ai-spend.ts`'s SHARED
monthly ceiling.

---

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
SEVENTEEN. Newest (2026-08-27): `ENGINE_CATEGORIES` omitted "Autonomy &
Orchestration", so `enginesByCategory()` silently dropped Agent Chains, Brand
Memory and Growth Hubs from the command index — shipped engines nothing listed.
Worst: a message whose login, envelope sender and From were three mailboxes, one
invented in source and never created. Before those — the crawler emitted
`pass`/`warn`/`fail` while the audit matched `critical`/`high`/`medium`, so a
broken site looked healthy; `/r/{CODE}` appended a referral code no surface read;
`sendEmail` returned success in demo for mail delivered to nobody. The other
twelve are in `REQUIREMENTS-COVERAGE.md`.

**Check the boundary before the logic; a reported success is not a happening.**

**And a second class, about tests rather than code: a check that passes — or
FAILS — for a reason unrelated to what it tests.** TWELVE. Newest: the market-exit
affiliation scanner refused every correctly labelled page, because the disclosure
it MANDATES contains "endorsed by" and "successor to" — a control failing on text
it required itself. Before it: greps proved the recorder's parts existed, not that
they were wired; a one-item column is sorted by every comparator; the ads verifier
counted a TYPE as a tool; a guard against orphan variables matched them inside its
own fix strings.

**A test that passes is not evidence until something has broken it**; drive the
real handler and assert on a value only the real path can produce. Its sharpest
form is a DIAGNOSTIC exercising a different path from the real one — three rounds
of SMTP probes each reimplemented SMTP. FIVE tests have failed on their own
comments: strip comments before scanning source. And an assertion can be too
NARROW — one looked for `<script>` and survived a mutation that stopped escaping
`<`, because `>` was still escaped so the exact string never appeared.

---

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session
and carries the additive-only law, the margin floor and the no-fabrication rule,
so they are not repeated here. What only lives here:

- **Verify before shipping:** typecheck, build, layer check, tests — then MUTATE
  the new tests. A test that has never failed is not evidence.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` — except
  while §5.2 is open, where the branches deliberately differ on the Next version
  and its async-`params` migration. Mirror file-by-file, never by merge, and
  verify on main against its own `npm ci`.
