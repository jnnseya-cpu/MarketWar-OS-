# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never appended to.**
Read this one first. Companions are listed in `CLAUDE.md`. Updated: 2026-09-03.

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com). Next.js,
TypeScript strict, three layers enforced by `scripts/check-layers.mjs`. 237
backend modules, 178 API routes, 68 dashboard pages, **1,750 tests** including one
end-to-end run of the growth loop.

**`overrides.jose` IS LOAD-BEARING** — without it a CommonJS dependency require()s an ESM
package and every route importing firebase-admin dies at module load. Read §5.0 before touching
it or `engines`. The Node 22 pin remains, but is no longer the only defence.

**Both branches are now IDENTICAL, on Next 15 / React 19** (landed 2026-08-28). Mirror
file-by-file, never by merge, verified on main's own `npm ci`.

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the count and states the
cause from the counts alone; with nothing sent, the diagnosis is not the product or the price.
**See §5.1: the send now RUNS and the mail host refuses it — `/api/health/email` names the stage.**

`GO-TO-MARKET-MarketWar-OS.docx` is the plan; `FACEBOOK-LAUNCH-CAMPAIGN.docx` is the
paste-ready first campaign. Both parse their prices out of `src/`.

## 3. What works with NO keys at all — no provider, no card, no configuration

- **The free website audit** (`/audit`) — a real crawl, **29 checks**, the three WORST free, the
  lead recorded as an inbound prospect. No account, no card; six adverts promise that and
  `npm run ads:verify` fails if it stops being true. Every failing finding carries what it costs
  and the fix (`shared/audit-copy.ts`). Refuses private and link-local destinations on every hop.
  **Confirmed working on the live deployment 2026-09-03** — construxvg.com, 3 pages, 83/100.
- **The client approval portal** — a signed, expiring link a client opens with no account.
- **The command bar** (Cmd/Ctrl-K), the **ad canvas**, all **pricing and margin arithmetic**, the **paid-media guardrails**, the **payout engine**, the **emergency stop** — every refusal computed, never guessed. **The publication ledger**: a lost publish response is uncertain, so the next attempt asks the channel, never posts twice. Plus **eight pre-publish checks**, **channel health**, **versions and restore**, **creative fatigue**, **the audit log**, **teams**, **Sentinel**, **13 articles**.
- **Contact Hunter + Contact Finder** — find a business contact, or upload a list and have it filled in. On `lead-harvest`'s 12 checks and UK/EU/US lawful basis, CALLED not copied. **Confirmed / inferred / provider never convert**, and objections are permanent.
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`) — a brief that will come back wrong is REFUSED before a penny moves. Shape is a PARAMETER; nothing sent one, so every portrait placement came back wide.
- **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — a render died on `429 insufficient_quota` and we said "confirm your model access"; the account was empty. Credit is read before rate limit (both 429, opposite remedies). An unrecognised refusal keeps the provider's words and offers NO remedy. Hunter's refusals follow the same rule: an empty balance, a rate limit and a bad key give three different sentences, and none of them marks an address invalid.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** — one rule, `wallet.meteringExempt`, asked by `meterAction` AND by the `spendAcus` the video queue, gateway and SEO autopilot use. A refund returns what was TAKEN, so an exempt render cannot mint ACUs.
- **The provider waterfall** — one name and company through every supplier in COST order inside
  14s. Free first; **only calls that ran AND returned are charged**. Three scores, never one.
  **Hunter is the first PAID adapter (09-03)** — email finder plus a real mailbox verifier, `order: 2`
  so a credit is spent only on what the free sources missed, `costAcu` derived from `USD_TO_GBP ×
  ACU_PER_GBP` and charged at 2×. Every address is `provenance: "provider"` even when Hunter cites a
  source — `confirmed` means WE read the page. **Its mapping is REASONED, not observed** (no network
  to api.hunter.io here), so **`/api/health/enrichment?probe=1`** (admin/cron — spends ~$0.11) or
  `node --import tsx scripts/check-hunter.mjs` proves it live. Both run the SAME module,
  `backend/hunter-probe.ts`; the route's free half is anonymous and answers "did the build get it?".
- **Market Exit Capture** — a closed firm's demand sent to one that trades. Wrong at a NAMED third party's expense, so publishing needs a register entry or two failing sources.
- **§50 the paid-boost ladder** (`shared/boost-ladder.ts`) — which post earns a budget, and how much next. Against the brand's own median, never a constant; refuses to promote without conversion tracking; never spends.

**EVERY PUBLIC CLAIM IS BOUND TO THE CODE OR TESTED AGAINST IT** (2026-08-26). Landing stats, plan prices/ACUs, 39 agent cards, answer pages — twelve tests. **What broke was always what somebody TYPED**, worst a 4.0x ROAS rule where the guardrail says 3.

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

**STILL OPEN — three things. Item 0 is CLOSED and CONFIRMED on the deployment; it is kept here
because it already recurred once and the pin that "fixed" it the first time did not hold.**

**0. FOUND AND FIXED — `require(esm)`, THE SAME PAIR THAT TOOK PRODUCTION DOWN ON 08-29
(2026-09-03).** `/diagnose` printed it from the owner's browser: *"@/backend/capabilities failed to
load: require() of ES Module .../jose/dist/webapi/index.js from .../jwks-rsa/src/utils.js not
supported."* `firebase-admin` → `jwks-rsa` (CommonJS) → `jose@6` (pure ESM); `require()` of an ESM
package works only on Node ≥ 22.12, so it ran on a 22.22 laptop and died at MODULE LOAD on the
host. Every route importing it answered Next's HTML page; only `/api/health/live` survived, because
it loads its modules inside a catch.
**The 08-29 "fix" was `engines: 22.x`, and the host did not honour it** — a pin somebody else has to agree to is not a fix. Worse, the test written that day asserted that jose IS ESM-only, so it stayed green all through this outage and would only have gone red on the repair.
**The fix:** `overrides.jose: ^5`, which ships CommonJS, so `require()` works on every Node. jwks-rsa
uses only `importJWK` and `exportSPKI`, both present in 5.x. Proved by driving `retrieveSigningKeys`
on a real RSA JWK and verifying a real signature with the PEM it returns — necessary because
jwks-rsa does `catch { continue }`, so a broken jose returns NO KEYS silently and every sign-in
fails "kid not found". The regression test was proved by reinstalling jose 6 and watching it go red.
`/api/health/live` now reports `runtime.node` and `canRequireEsm`, because at no point in either
outage could anyone see which Node was running without opening the host's dashboard.
**Confirmed fixed on the deployment**: `/diagnose` reads 200 / 200, with the two 403s (no session) and the 400 (no address) the probes are SUPPOSED to get. Those three now show green with their reason — the page had announced them as findings on a healthy platform, and a diagnostic that cries wolf gets ignored, which is worse than none.

**1. MAIL: THE SEND NOW RUNS AND THE SERVER REFUSES IT (2026-09-03).** The free audit completed
end to end on a real site (construxvg.com, 3 pages, 29 checks, 83/100) and closed with *"the mail
server refused the message"* — the `provider` category. That is PROGRESS: the path used to THROW
and classify nothing, so a classified refusal means the sending code runs and the mail host said
no. **The stage was the answer and it sat behind a sign-in that was itself broken**, so
`/api/health/email` now reports `probeReachedStage` and a name-free verdict to a SIGNED-OUT caller
(`auth-pass` = wrong password, `rcpt-to` = relay restricted, `connect` = wrong port). The server's
own line, the mail host, the account and the recipients stay gated — proved by brace-matched
containment and two leak mutations. **To close:** read `probeReachedStage`. Still owed:
`EMAIL_FROM` = `MarketWar OS <info@marketwaros.com>`.
**CORRECTED 09-03 — THIS REVERSES THE 08-27 INSTRUCTION THAT STOOD HERE.** It read "do NOT change
`SMTP_USER`", on a note claiming `appuser@marketwaros.com` had been verified to log in. The owner
confirms **that inbox was never created**; the domain has one mailbox, `info@`. The live probe
agrees — stage `auth-pass`, a relay refusing a login for a mailbox that does not exist. A note
saying a mailbox was verified is not a mailbox; only the relay's answer is evidence. **Set
`SMTP_USER` = `info@marketwaros.com`, `SMTP_PASS` = that mailbox's own password.** Login, envelope
and From are then all `info@` — the strongest arrangement `sender-identity.ts` supports: `aligned`
true, no `Sender:` header (no arrangement to declare), bounces to the one inbox that exists.

**2. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid, `whsec_` set. Left: (a) the wrong `whsec_` of that account's SEVEN endpoints; (b) the URL — `MAIN_DOMAIN` is the APEX, the app serves `www.`. **To close:** `/api/health/stripe`.

**3. NEXT 15 IS LANDED — confirm it in production.** `npm audit` went 11 advisories / 5 high → 6 moderate / 0 high. **To close:** one real signup, which was impossible until today.

**CLOSED THIS WEEK — one line each; detail is in `REQUIREMENTS-COVERAGE.md`.**

- **Production ran Node 20** (08-29) — the first half of §5.0; the pin alone did not hold.
- **A production 500 was the middleware** (08-28) — no error handling before every route, so any throw in the gate was site-wide. Fails OPEN now; `hmacKey` had memoised a REJECTED promise.
- **A rate limit I added darkened the War Room** (08-28) — the floor applies only to UNATTRIBUTABLE requests, ceiling 600.
- **91 of 133 env variables were invisible** (08-29) — `shared/env-catalogue.ts` is the one registry (110 entries); `/api/health/live` reports all. **14 still missing.**
- **The free audit is limited to personal use** (08-29) — 10 per site, 3 sites, 15 per 90 days,
  unlimited when paid; keyed on the registrable domain, IP never stored. It also scores SEO across
  six areas separately, where nothing measurable is `null` rather than 0.
- **§50 autonomous paid boost** (08-30) — the ladder, above.
- **§100 per-agent cost and impact** (08-30) — one row per charge; `debitAcus` took a wallet id and an amount, so one total was all that survived nineteen agents. Unattributed revenue is `null`, never zero.
- **§77 knowledge graph** (08-30) — typed entities over measured posts; never claims causation.
- **Bulk catalogue import** — an amount 100× ambiguous ("1,299") is REFUSED, not guessed.

**Owner actions (nothing in code can substitute):**
1. **`PLATFORM_ADMIN_EMAILS`** — set ONCE; check `/api/health/live` → `envPresent` before asking.
   Makes the owner `executive`, never metered. Or `node scripts/grant-admin.mjs you@… executive`.
2. Open `/api/health/live` after every change — `envPresent`/`envMissing` is the only proof
   the running build received it, and `build.commit` the only proof of WHICH code is
   serving. All 110 variables, what each unlocks and where to get it:
   `shared/env-catalogue.ts`. Submit the sitemap.
3. **Send the first ten messages.** `/dashboard/acquisition` has the text per brand. Then **run the first Facebook campaign** (`npm run ads:doc`): Traffic, not Awareness, and build the five custom audiences FIRST — they cannot be backfilled.
4. **`COMPANIES_HOUSE_API_KEY`** — free, the second free source in the contact waterfall. `SERPER_API_KEY` gates live company discovery; the current value is rejected 401/403.
5. **Video needs credit at a provider**, not a model change — OpenAI's account is empty. Add credit, or render on Veo. Pin the tier with `GEMINI_VIDEO_MODEL` and set `VIDEO_COST_PER_SECOND_GBP_VEO` from the invoice.

**No feature section of the growth spec is MISSING as of 2026-08-30.** §50, §77 and §100 were
the last three; §80 (an agent message bus) is recorded as considered and rejected. What remains
is partial rows, each naming the one absent part. See `GROWTH-ENGINE-COVERAGE.md`.

**Surfaces built:** §50, §70, §77, §92, §95, §97, §98, §100, §102, §103. **Not built:** §80
agent message bus (considered, rejected), §14 calendars, §21 carousels. (This line previously
listed §50/§77/§100 as missing while the closed list four lines above said they had landed.)

**Security debt.** 6 moderate advisories, NO high — all the uuid → firebase-admin chain, left
deliberately: npm's "fix" is a four-major downgrade. Two `overrides` force Next's nested postcss
and sharp up to the versions used everywhere else.

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
TWENTY-SEVEN. Newest (2026-09-03): the SMTP probe knew which verb the mail host refused and the
whole probe was gated, so the audit could only say "the mail server refused the message" and the
reason was reachable solely by signing in — on a platform where signing in was broken. Before it: a
route's engine was imported STATICALLY, so its load failure happened outside every catch and
`/api/capabilities` knew why it could not start while the browser got an HTML page; loads now go
through `loadModule`. Before that: the headers of every failed call named the machine that answered
— `cf-ray`, `x-vercel-id`, `x-vercel-error` — and nothing carried it to the person reading the
screen, so three redeploys went into fixing the app when the evidence of whether it was even
reached sat on the response. `shared/response-origin.ts` reads it; `/diagnose` prints it. Before it: the codebase read
133 environment variables and the diagnostic knew 35; `sendEmail` knew why a send failed and the
caller reported `unknown`; the render sent a prompt and a duration and NO aspect ratio, so every
portrait placement came back landscape; `meterAction` exempted staff while the video queue took a
wallet id, not a caller. Worst — and it got worse on 09-03: a message whose login, envelope sender
and From were three
mailboxes, ALL THREE of which turned out to be invented — the login `appuser@` was recorded as
"the mailbox that actually exists" and never existed either. The rest: `REQUIREMENTS-COVERAGE.md`.

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM — and if none exists, BUILD IT
BEFORE THE THIRD GUESS.** Node 20 was diagnosed in one line of `moduleErrors` after a day inferring
from a screenshot. The HTML fault took three wrong theories and three redeploys before `/diagnose`
existed; writing it first would have cost one of them.

**A second class, about tests rather than code: a check that passes — or FAILS — for a reason
unrelated to what it tests.** TWENTY. Newest (2026-09-03): a test written on 08-29 asserted that
`jose` IS ESM-only — recording the hazard as a fact of life and leaving the entire defence to a
Node pin the host had to honour. It was green through the whole second outage, because it was
pinned to the broken arrangement and could only have failed on the repair. **A test that passes
while production is down, and would fail on the fix, is worse than no test.** Before it: `/diagnose` asked one question of
every response — did it parse as JSON? — and `/api/capabilities` answered HTTP 500 with a
perfectly good JSON body naming the module that failed to load. The row read "DATA", printed
none of it, and the diagnosis was thrown away by the page built to obtain it: "the transport
worked" and "the request worked" are different questions. Three outcomes now, and the error body
is always shown. Before it: the test guarding the
"Unexpected token '<'" message asserted the literal phrase *"not something you typed"*. That
is wording, not behaviour — it would have passed a message that blamed the wrong machine, and
it FAILED the moment the message started naming the right one. It now asserts that the
machine is named and that the status survives. The CI secret scan is the worst: `sk-[…]{20,}`
matched the slug `ask-customers-for-reviews-properly`, red for twelve runs, never once on a
credential — a gate added to stop work being called done without proof, then called done
without one run being read. Patterns now match keys as providers issue them, proved BOTH
ways, because a pattern catching nothing passes a false-positive test perfectly. Caught by
mutation, never by reading: a key-import test whose patch never ran because an earlier test warmed
the memoised key; a containment check accepting an ungated field because an earlier one was gated;
an "exempt spend left the ledger alone" assertion reading `=== 0` when adding zero leaves zero; a
department table with STEMS inside `\b(...)\b`, so Chief Financial Officer matched nothing.

**A DIAGNOSTIC IS AN ENDPOINT TOO.** `/api/health/email` authorised `?send=` but left the REPORT open — twenty recipient addresses beside the SMTP host and username. Gated. `/diagnose` is public by the same test: it only reports which machine answered its own requests.

**AND A PANEL MUST NOT BLAME THE OWNER FOR ITS OWN FAILED REQUEST.** Three answered a refused fetch by asserting a key was missing.

**A test that passes is not evidence until something has broken it.** Drive the real handler and assert on a value only the real path can produce. SEVEN tests have failed on their own comments, and one on a STRING LITERAL — the prose "the mail host is withheld" read as the field leaking. Strip comments AND literals before scanning.

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session and carries
the additive-only law, the margin floor and the no-fabrication rule. Only here:

- **Verify before shipping:** typecheck, build, layers, lint, tests — then MUTATE the new
  tests, AND READ THE CI RUN. A test that has never failed is not evidence.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` file-by-file, never
  by merge, verified on main against its own `npm ci`. The branches no longer differ on
  anything — a diff between them is now a mistake, not a plan.
