# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never appended to.**
Read this one first. Companions are listed in `CLAUDE.md`. Updated: 2026-08-30.

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com). Next.js,
TypeScript strict, three layers enforced by `scripts/check-layers.mjs`. 237
backend modules, 178 API routes, 68 dashboard pages, **1,675 tests** including one
end-to-end run of the growth loop.

**THE RUNTIME IS PINNED TO NODE 22** (`package.json` → `engines`, 2026-08-29). This is
not hygiene; read §5.0 before changing it.

**Both branches are now IDENTICAL, on Next 15 / React 19** (landed 2026-08-28). Mirror
file-by-file, never by merge, verified on main's own `npm ci`.

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the count
and states the cause from the counts alone; with nothing sent, the diagnosis is not
the product or the price. **See §5.1: mail still sends nothing — the sending path is
throwing, and the next deploy will name what.**

`GO-TO-MARKET-MarketWar-OS.docx` is the plan — locked launch city, five segments,
the price table, 30/60/90 with failable exit criteria. `FACEBOOK-LAUNCH-CAMPAIGN.docx`
is the paste-ready first campaign (§5.4). Both parse their prices out of `src/`.

## 3. What works with NO keys at all — no provider, no card, no configuration

- **The free website audit** (`/audit`) — a real crawl, **29 checks**, the three WORST
  free, the lead recorded as an inbound prospect. No account, no card; six adverts promise
  that and `npm run ads:verify` fails if it stops being true. Every failing finding carries
  what it costs and the fix (`shared/audit-copy.ts`), and **the page SHOWS the catalogue**,
  each check opening to what it costs. It refuses private and link-local destinations on
  every hop — it would otherwise have read the cloud metadata service.
- **The client approval portal** — a signed, expiring link an outside client opens with no account; **the screen recorder puts the presenter IN the file.**
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, all **pricing and margin arithmetic**, the **paid-media guardrails**, the **payout engine** and the **emergency stop** — every refusal computed, never guessed. **The publication ledger**: a lost publish response is uncertain, so the next attempt asks the channel, never posts twice.
- **Eight pre-publish checks**, **channel health**, **versions and restore**, **creative fatigue**, **the audit log**, **teams**, **Sentinel**, **13 articles**.
- **Contact Hunter + Contact Finder** (2026-08-27) — find a business contact, or upload
  a list and have it filled in. On `lead-harvest`'s 12 checks and UK/EU/US lawful basis,
  CALLED not copied. **Confirmed / inferred / provider never convert**, and objections
  are permanent.
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`, 2026-08-28) — a brief that
  will come back wrong is REFUSED before a penny moves: words in the frame, more actions
  than the length holds (4s = one), nothing to render. Shape and exclusions are now
  PARAMETERS — nothing sent an aspect ratio, so every portrait placement came back
  landscape. `GEMINI_VIDEO_MODEL` is the quality dial; the fallback never raises cost.
- **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — a
  render died on OpenAI's `429 insufficient_quota` and we answered "confirm your model
  access". The account was empty. One reader classifies every refusal and gives the ONE
  fix; an unrecognised one keeps the provider's words and offers NO remedy, because
  inventing one IS the defect. Credit is read before rate limit (both 429, opposite
  remedies). A provider-level refusal fails over; a REFUSED PROMPT stops it.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** (2026-08-28) — one rule,
  `wallet.meteringExempt`, asked by `meterAction` AND by the `spendAcus` the video
  queue, gateway and SEO autopilot use. An executive with a zero balance runs every AI
  surface; a refund returns what was TAKEN, so an exempt render cannot mint ACUs. No
  caller (cron) is not an exemption — it charges.
- **The provider waterfall** ("Find one person", 2026-08-27) — one name and company
  through every supplier in COST order inside 14s. Free sources first; stops at identity
  90 / employment 85 / email 85; **only calls that ran AND returned are charged**. Three
  scores, never one. **A Companies House officer is not a buyer.**
- **Market Exit Capture** (2026-08-27) — a closed firm's demand sent to one that trades.
  Wrong at a NAMED third party's expense, so built from refusals: publishing needs an
  official register entry or two independently-failing sources, **never the public**.

**EVERY PUBLIC CLAIM IS BOUND TO THE CODE OR TESTED AGAINST IT** (2026-08-26). Landing
stats, plan prices/ACUs, 39 agent cards, answer pages — twelve tests. **What broke was
always what somebody TYPED**, worst a 4.0x ROAS rule where the guardrail says 3.

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment; trust it over this table.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` set 2026-08-26 (confirm on `/api/health/live`). **THE ACU WALLET IS THE GATE, NOT `AI_MONTHLY_CEILING_USD`** — every AI route requires auth AND `meterAction`, a 0-ACU account gets 402 before the gateway is reached, and the only unmetered path (the daily blog cron) needs BOTH `BLOG_DAILY_ENABLED=1` and `CRON_SECRET`, neither set. |
| Scheduled work | `CRON_SECRET` · Newsletter: `NEWSLETTER_SECRET` |
| **Sending email** | the sending pool with verified DNS, or `RESEND_API_KEY` / `SENDGRID_API_KEY`. **Until one is set every send is REFUSED and reported as not sent** — it used to return success for mail delivered to nobody. |
| Client approval links | `PORTAL_LINK_SECRET` (16+ chars), falling back to `HUMAN_CHECK_SECRET` — which IS set, so links work today. A dedicated secret is hygiene, not a blocker. With NEITHER, issuing is refused rather than minting a link that verifies on one server and fails on every other. |
| Stripe, Firebase Admin | Both configured and verified live. `FIELD_ENCRYPTION_MASTER_KEY` set 2026-08-26, which unblocks PII writes that were being refused in silence — nothing predates it, because those writes never landed. |

## 5. Outstanding — the whole list, deduplicated

**0. THE WHOLE WAR ROOM WAS DARK BECAUSE PRODUCTION RAN NODE 20 — CLOSED (2026-08-29).**
Every studio read "Activate with a key" and every render length collapsed to 8 seconds
with all four AI keys correctly set. `/api/health/live` → `moduleErrors` named it in one
line: `jwks-rsa@4.1.0` does `require('jose')`, `jose@6` is `"type":"module"`, and
`require(esm)` landed in **Node 22.12**. On Node 20 four modules died AT IMPORT, which is
an uncatchable 500 no handler sees, so every capability probe failed and every panel
reported the only thing it could distinguish — no key. The repo declared no `engines`, so
the host picked its own default. `"engines": { "node": "22.x" }` is now the fix, and it is
the single most load-bearing line in `package.json`. **A day was lost reasoning from the
symptom; the answer was one field in a diagnostic that already existed.**

**1. MAIL STILL SENDS NOTHING, AND THE SENDING PATH IS *THROWING* (2026-08-28).**
Reported with every setting in place. Every `ok:false` path in `sendEmail` carries a
category, so the audit route reaching its `catch` means the send THREW and classified
nothing — reported as `unknown`, "the send did not complete", which names no problem and
implies the mail settings are the cause. They are not. A `crashed` category now says so,
and `/api/health/email` loads the sending modules dynamically, so a LOAD failure is the
verdict rather than a second 500 — the diagnostic used to die of what it diagnosed.
Ruled out with evidence: the email renderer, `getPool()`'s JSON parse, `resolveSender`.
**To close:** redeploy, run one audit with an address — the page names the category and
`/api/health/email` returns `why`. Still owed: `EMAIL_FROM` =
`MarketWar OS <info@marketwaros.com>`. **Do NOT change `SMTP_USER`** — verified
2026-08-27: `appuser@` logs in, `info@` is the From, envelope + `Sender:` are
`appuser@`, same domain so SPF/DMARC align.

**2. NEXT 15 IS LANDED (2026-08-28) — confirm it in production.** `npm audit` on main went
from **11 advisories, 5 high** to **6 moderate, 0 high**. `/verify-human` was re-tested end
to end on main's own build — challenge, proof of work solved, session issued, replay
refused — plus every async-`params` route. **To close:** complete one real signup.

**3. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid, `whsec_` set. Left:
(a) the wrong `whsec_` of that account's SEVEN endpoints; (b) the URL — `MAIN_DOMAIN` is
the APEX, the app serves `www.`. **To close:** `/api/health/stripe`.

**4. THE PRODUCTION 500 WAS THE MIDDLEWARE — CLOSED (2026-08-28).** The free audit
answered `500: Internal Server Error` with Next's error page, four times. Four rounds of
hardening went into `/api/audit`, which could not have produced it: no handler here
answers HTML. Confirmed by experiment — a bare `throw` at the top of `middleware()`,
built and served, returns exactly that body on `/api/audit` and `/` alike. It ran before
every route on a near-sitewide matcher with NO error handling, so any throw in the human
gate was a site-wide 500 no route could catch. It now fails OPEN, lane `unavailable`,
path logged (an outage beats an unjudged request; `requireAuth` is untouched). Trigger
fixed at source: `hmacKey` memoised a REJECTED promise, so one transient Web Crypto
failure poisoned every request on that instance for its life. Referral commission
(§101 → payment) shipped as D-12 and is no longer outstanding.

**5. A RATE LIMIT I ADDED DARKENED THE WHOLE WAR ROOM — FIXED (2026-08-28).** D-13's API
floor counted EVERY /api request against one per-address bucket at 120/min; the War Room
fires four probes on load, so ordinary use burned it. Every probe then swallowed the 429
and fell back to the state an UNCONFIGURED deployment shows — working keys read "Activate
with a key", lengths collapsed to 8 seconds, nothing named a rate limit. The floor now
applies only to UNATTRIBUTABLE requests (a session or bearer is governed by requireAuth,
per-route limits and the wallet); ceiling 600. Verified: 400 signed-in, zero throttled;
700 anonymous cut at 600. AudioStudio and RenderFarm also ASSERTED a missing key on a
failed request — all three panels now separate "could not ask" from "no key".

**6. BULK CATALOGUE IMPORT SHIPPED (Task 13).** `shared/catalogue-import.ts` +
`import-catalogue` on `/api/share2earn`. Dry run by default, parsed server-side, and an
amount 100× ambiguous between conventions ("1,299") is REFUSED with the reason — it
imports once the file says which convention it uses. Imported products are NOT promotable
until the brand says so.

**7. THE AUDIT NOW SCORES SEO SEPARATELY (2026-08-29).** `scoreByArea` in
`backend/crawler.ts` splits the 29 checks into SEO, Content, Technical, Mobile, Social and
Structured data, exported and PURE so every branch is drivable without a crawl. An area
with nothing measurable scores **`null`, never zero** — a site with no social tags has an
unknown social score, and printing 0/100 is a fabricated number the owner would have to
defend. Both response shapes carry `areaScores`.

**8. THE FREE AUDIT IS RATE-LIMITED TO PERSONAL USE (2026-08-29).** Rules in
`shared/audit-quota.ts` (pure), storage and identity in `backend/audit-quota.ts`. Three
independent caps in a 90-day window: **10 per site, 3 sites, 15 total**; an active paid
subscription is unlimited and consults no history. **The site key is the registrable
domain** — `www.`, path, query and port all reduce to one host, or the three-site cap is
bypassed with a question mark. A refused crawl does not spend an allowance. Keyed on the
ACCOUNT when signed in and only on the address otherwise, so an office behind one IP is
not locked out. The address is never stored: `sha256(salt + ip)`, salted from
`AUDIT_QUOTA_SALT` falling back to `FIELD_ENCRYPTION_MASTER_KEY`. Fails OPEN on a storage
error — a closed front door costs more than a few free crawls.

**9. 91 OF 133 ENVIRONMENT VARIABLES WERE INVISIBLE — CLOSED (2026-08-29).**
`/api/health/live` reported `envPresent` from a hand-typed list of 35 names while the
codebase read 133, so `RESEND_API_KEY`, `APOLLO_API_KEY`, `COMPANIES_HOUSE_API_KEY`,
`ONFIDO_API_TOKEN`, `WHATSAPP_TOKEN`, `FB_APP_SECRET`, the Google OAuth trio and every
webhook secret could not be seen to be missing. `shared/env-catalogue.ts` is now the one
registry — 110 documented entries with what each unlocks and where to obtain it, plus two
explicit exclusion lists (tuning, host-set). A test walks `src`, `scripts` and `worker` and
fails in BOTH directions: a variable read but not catalogued, or catalogued but never read.
`/api/health/live` reports all 110 plus `envMissing` and `envSummary`, and a `build` block
naming the commit and which host stamped it. **14 are confirmed missing** — the four
`NEXT_PUBLIC_LEGAL_*` are a launch blocker, `CRON_SECRET` kills every scheduled run.

**Owner actions (nothing in code can substitute):**
1. **`PLATFORM_ADMIN_EMAILS`** — set ONCE, then never again; check `/api/health/live`
   → `envPresent` before asking. It makes the owner `executive`, never metered.
   No-redeploy alternative: `node scripts/grant-admin.mjs you@… executive`.
2. Open `/api/health/live` after every change — `envPresent`/`envMissing` is the only proof
   the running build received it, and `build.commit` the only proof of WHICH code is
   serving. All 110 variables, what each unlocks and where to get it:
   `shared/env-catalogue.ts`. Submit the sitemap.
3. **Send the first ten messages.** `/dashboard/acquisition` has the text per brand.
4. **Run the first Facebook campaign** (`npm run ads:doc`): Traffic, not Awareness. Build the five custom audiences FIRST — they cannot be backfilled.
5. **`COMPANIES_HOUSE_API_KEY`** — free, the second free source in the contact waterfall. `SERPER_API_KEY` gates live company discovery; the current value is rejected 401/403.
6. **Video needs credit at a provider**, not a model change — OpenAI's account is empty. Add credit, or render on Veo. Pin the tier with `GEMINI_VIDEO_MODEL` and set `VIDEO_COST_PER_SECOND_GBP_VEO` from the invoice.

**Surfaces: six of seven** — §70, §92, §95, §98, §102, §103. **Not built:** §97's priority
queue; §50 paid boost; §77 knowledge graph; §80 agent message bus; §14 calendars, §21
carousels, §100 per-agent cost/impact.

**Security debt, with the reasoning.** 6 moderate advisories, NO high — all the uuid →
firebase-admin chain, left deliberately: npm's "fix" is a four-major downgrade of
firebase-admin. Two `overrides` force Next's nested postcss and sharp up to the versions
used everywhere else.

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
TWENTY-FOUR. Newest (2026-08-29): the codebase read 133 environment variables and the
diagnostic that answers "what does this deployment hold?" knew 35 of them — the other 91
existed on one side of that boundary and were never carried across, so a missing key was
indistinguishable from a key nobody had ever asked about. Before it (2026-08-28):
`sendEmail` knew exactly why a send failed and the
caller reported `unknown` — "the send did not complete" — so the owner spent days
checking mail settings that were never the cause. Before it: the render sent a prompt and
a duration and NO aspect ratio, so every portrait placement came back landscape; a
provider's start failure was formatted into a sentence with its status and body thrown
away; `meterAction` exempted staff while the video queue took a wallet id, not a caller.
Worst: a message whose login, envelope sender and From were three mailboxes, one invented
in source and never created. The rest: `REQUIREMENTS-COVERAGE.md`.

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM.** The Node 20 failure
(§5.0) was diagnosed in one line of `moduleErrors` after a day spent inferring from a
screenshot of dark panels. The endpoint that named it already existed on the first hour.
Reading it first would have cost one message.

**Check the boundary first; a reported success is not a happening. And a second class, about
tests rather than code: a check that passes — or FAILS — for a reason unrelated to what it
tests.** SEVENTEEN, and the CI secret scan below is the worst. Also caught before shipping:
a test that one failed key import does not poison the gate patched `crypto.subtle.importKey`
to throw, but an earlier test had warmed the memoised key so the patch was never called; and
the first health-report containment check accepted an ungated field because some earlier
field was gated. Both found by mutation, not by reading. Before: a policy-refusal test used
a length where the second engine was skipped on price anyway — it would have passed with the
rule deleted;
an assertion that an exempt spend left the ledger alone read `lifetimeDebitedAcu === 0`,
and adding zero leaves it at zero; a department table wrote STEMS inside `\b(...)\b`, so
a Chief Financial Officer matched nothing; and greps proved the recorder's parts existed,
not that they were wired.

**AND THE GATE ITSELF WAS RED FOR TWELVE RUNS, NEVER ONCE ON A CREDENTIAL** (2026-08-28).
The CI secret scan's `sk-[…]{20,}` matched the slug `ask-customers-for-reviews-properly` —
`sk-` sits inside "ask-". D-02 was added to stop work being called done without proof, then
called done without one run being read. A scanner red on every commit is worse than none.
Patterns now match keys as providers issue them, proved BOTH ways — a pattern catching
nothing passes a false-positive test perfectly.

**A DIAGNOSTIC IS AN ENDPOINT TOO.** `/api/health/email` authorised `?send=` and left the
REPORT open on an always_open path — `recentSends` is the last twenty recipient addresses,
beside the SMTP host and username. Gated; the load verdict stays public, naming nobody.

**AND A PANEL MUST NOT BLAME THE OWNER FOR ITS OWN FAILED REQUEST.** Three answered a
refused fetch by asserting a key was missing. "Could not ask" and "no key" need different
actions and had identical words.

**A test that passes is not evidence until something has broken it**; drive the real
handler and assert on a value only the real path can produce. Its sharpest form is a
DIAGNOSTIC on a different path from the real one — three rounds of SMTP probes each
reimplemented SMTP, and `/api/health/email` statically imported the module whose load
failure it was meant to report. SEVEN tests have failed on their own comments: strip
comments before scanning. A counter a no-op leaves unchanged proves nothing.

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session and carries
the additive-only law, the margin floor and the no-fabrication rule. Only here:

- **Verify before shipping:** typecheck, build, layers, lint, tests — then MUTATE the new
  tests, AND READ THE CI RUN. A test that has never failed is not evidence.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` file-by-file, never
  by merge, verified on main against its own `npm ci`. The branches no longer differ on
  anything — a diff between them is now a mistake, not a plan.
