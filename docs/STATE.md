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

`GO-TO-MARKET-MarketWar-OS.docx` is the plan; `FACEBOOK-LAUNCH-CAMPAIGN.docx` is the
paste-ready first campaign. Both parse their prices out of `src/`.

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
- **Contact Hunter + Contact Finder** — find a business contact, or upload a list and have it
  filled in. On `lead-harvest`'s 12 checks and UK/EU/US lawful basis, CALLED not copied.
  **Confirmed / inferred / provider never convert**, and objections are permanent.
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`) — a brief that will come back
  wrong is REFUSED before a penny moves: words in the frame, more actions than the length
  holds (4s = one), nothing to render. Shape and exclusions are PARAMETERS — nothing sent an
  aspect ratio, so every portrait placement came back landscape.
- **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — a render
  died on OpenAI's `429 insufficient_quota` and we answered "confirm your model access"; the
  account was empty. Credit is read before rate limit (both 429, opposite remedies). An
  unrecognised refusal keeps the provider's words and offers NO remedy, because inventing one
  IS the defect.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** — one rule, `wallet.meteringExempt`, asked
  by `meterAction` AND by the `spendAcus` the video queue, gateway and SEO autopilot use. A
  refund returns what was TAKEN, so an exempt render cannot mint ACUs. No caller (cron) is
  not an exemption — it charges.
- **The provider waterfall** — one name and company through every supplier in COST order
  inside 14s. Free sources first; **only calls that ran AND returned are charged**. Three
  scores, never one. **A Companies House officer is not a buyer.**
- **Market Exit Capture** — a closed firm's demand sent to one that trades. Wrong at a NAMED
  third party's expense, so publishing needs an official register entry or two
  independently-failing sources, **never the public**.
- **§50 the paid-boost ladder** (`shared/boost-ladder.ts`) — which post earns a budget, and
  how much next. Compared to the brand's own median, never a constant; refuses to promote at
  all without conversion tracking; never spends.

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

**STILL OPEN — three things, and only these.**

**1. MAIL SENDS NOTHING; THE SENDING PATH IS *THROWING* (2026-08-28).** Every `ok:false`
path in `sendEmail` carries a category, so the audit route reaching its `catch` means the
send THREW and classified nothing — reported as `unknown`, which names no problem and
implies the mail settings are the cause. They are not. A `crashed` category now says so,
and `/api/health/email` loads the sending modules dynamically so a LOAD failure is the
verdict rather than a second 500. Ruled out with evidence: the email renderer, `getPool()`'s
JSON parse, `resolveSender`. **To close:** redeploy, run one audit with an address — the page
names the category and `/api/health/email` returns `why`. Still owed: `EMAIL_FROM` =
`MarketWar OS <info@marketwaros.com>`. **Do NOT change `SMTP_USER`** — verified 2026-08-27:
`appuser@` logs in, `info@` is the From, envelope + `Sender:` are `appuser@`, SPF/DMARC align.

**2. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid, `whsec_` set. Left:
(a) the wrong `whsec_` of that account's SEVEN endpoints; (b) the URL — `MAIN_DOMAIN` is the
APEX, the app serves `www.`. **To close:** `/api/health/stripe`.

**3. NEXT 15 IS LANDED — confirm it in production.** `npm audit` went from 11 advisories /
5 high to 6 moderate / 0 high. `/verify-human` re-tested end to end on main's own build.
**To close:** complete one real signup.

**CLOSED THIS WEEK — one line each; detail is in `REQUIREMENTS-COVERAGE.md`.**

- **Production ran Node 20** (08-29). `jwks-rsa` does `require('jose')`, `jose@6` is ESM, and
  `require(esm)` landed in **22.12** — four modules died AT IMPORT, an uncatchable 500. That,
  not any missing key, is why every studio read "Activate with a key" and every render length
  collapsed to 8 seconds. No `engines` was declared, so the host chose. `"node": "22.x"`.
- **The production 500 was the middleware** (08-28) — no error handling before every route,
  so any throw in the human gate was site-wide. Fails OPEN now. Cause: `hmacKey` memoised a
  REJECTED promise, poisoning that instance for its life.
- **A rate limit I added darkened the War Room** (08-28) — the API floor now applies only to
  UNATTRIBUTABLE requests, ceiling 600. Three panels also asserted "no key" from a failed
  request and now separate "could not ask" from "no key".
- **91 of 133 environment variables were invisible** (08-29) — `shared/env-catalogue.ts` is
  the one registry (110 entries), and a test fails in BOTH directions. `/api/health/live`
  reports all 110 plus `envMissing`, `envSummary` and `build`. **14 confirmed missing.**
- **The audit scores SEO separately** (08-29) — six areas; nothing measurable scores `null`,
  never zero.
- **The free audit is limited to personal use** (08-29) — 10 per site, 3 sites, 15 total per
  90 days, unlimited when paid. Site key is the registrable domain. The IP is never stored.
- **§50 autonomous paid boost** (08-30) — the ladder, above.
- **Bulk catalogue import** — an amount 100× ambiguous ("1,299") is REFUSED, not guessed.

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
diagnostic that answers "what does this deployment hold?" knew 35, so a missing key was
indistinguishable from one nobody had ever asked about. Before it: `sendEmail` knew exactly
why a send failed and the caller reported `unknown`, so days went into mail settings that
were never the cause; the render sent a prompt and a duration and NO aspect ratio, so every
portrait placement came back landscape; `meterAction` exempted staff while the video queue
took a wallet id, not a caller. Worst: a message whose login, envelope sender and From were
three mailboxes, one invented in source and never created. The rest: `REQUIREMENTS-COVERAGE.md`.

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM.** The Node 20 failure
was diagnosed in one line of `moduleErrors` after a day spent inferring from a screenshot of
dark panels. The endpoint that named it existed on the first hour. Reading it would have
cost one message.

**A second class, about tests rather than code: a check that passes — or FAILS — for a reason
unrelated to what it tests.** SEVENTEEN. The CI secret scan is the worst: `sk-[…]{20,}`
matched the slug `ask-customers-for-reviews-properly`, red for twelve runs, never once on a
credential — a gate added to stop work being called done without proof, then called done
without one run being read. Patterns now match keys as providers issue them, proved BOTH
ways, because a pattern catching nothing passes a false-positive test perfectly. Also caught
by mutation, never by reading: a test that one failed key import does not poison the gate
patched `importKey` to throw, but an earlier test had warmed the memoised key so the patch
never ran; a health-report containment check accepted an ungated field because some earlier
field was gated; a policy-refusal test used a length where the second engine was skipped on
price anyway; an "exempt spend left the ledger alone" assertion read `=== 0`, and adding zero
leaves it at zero; a department table wrote STEMS inside `\b(...)\b`, so Chief Financial
Officer matched nothing.

**A DIAGNOSTIC IS AN ENDPOINT TOO.** `/api/health/email` authorised `?send=` and left the
REPORT open on an always_open path — `recentSends` is the last twenty recipient addresses,
beside the SMTP host and username. Gated; the load verdict stays public, naming nobody.

**AND A PANEL MUST NOT BLAME THE OWNER FOR ITS OWN FAILED REQUEST.** Three answered a
refused fetch by asserting a key was missing. "Could not ask" and "no key" need different
actions and had identical words.

**A test that passes is not evidence until something has broken it.** Drive the real handler
and assert on a value only the real path can produce. Its sharpest form is a DIAGNOSTIC on a
different path from the real one. SEVEN tests have failed on their own comments: strip
comments before scanning. A counter a no-op leaves unchanged proves nothing.

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session and carries
the additive-only law, the margin floor and the no-fabrication rule. Only here:

- **Verify before shipping:** typecheck, build, layers, lint, tests — then MUTATE the new
  tests, AND READ THE CI RUN. A test that has never failed is not evidence.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` file-by-file, never
  by merge, verified on main against its own `npm ci`. The branches no longer differ on
  anything — a diff between them is now a mistake, not a plan.
