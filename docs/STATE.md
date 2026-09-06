# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never appended to.**
Read this one first. Companions are listed in `CLAUDE.md`. Updated: 2026-09-03.

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com). Next.js,
TypeScript strict, three layers enforced by `scripts/check-layers.mjs`. 237
backend modules, 178 API routes, 68 dashboard pages, **1,753 tests** including one
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

- **The free website audit** (`/audit`) — a real crawl, **30 checks** (DERIVED from `AUDIT_COPY`,
  never typed), the three WORST free, the lead recorded as an inbound prospect. No account, no card;
  six adverts promise that and `npm run ads:verify` fails if it stops being true. Every failing
  finding carries what it costs and the fix. Refuses private and link-local destinations.
  **Confirmed live 09-03** — construxvg.com, 3 pages, 83→92/100. **§AI search (09-03):** "AI crawler
  access" — robots.txt PARSED (not pattern-matched) for the ten crawlers feeding assistants, plus
  text-in-HTML and structured data. Free; it never claims anybody IS cited — that costs AI calls.
- **The client approval portal** — a signed, expiring link a client opens with no account.
- **The command bar**, the **ad canvas**, **pricing and margin arithmetic**, the **paid-media guardrails**, the **payout engine**, the **emergency stop** — every refusal computed, never guessed. **The publication ledger**: a lost publish response is uncertain, so the next attempt asks the channel rather than posting twice. Plus **eight pre-publish checks**, **channel health**, **versions and restore**, **creative fatigue**, **the audit log**, **teams**, **Sentinel**, **13 articles**.
- **Contact Hunter + Contact Finder** — find a business contact, or fill in a list. On `lead-harvest`'s 12 checks and UK/EU/US lawful basis. **Confirmed / inferred / provider never convert.**
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`) — a brief that will come back wrong is REFUSED before a penny moves; shape is a PARAMETER, and nothing sent one, so every portrait came back wide.
- **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — a render died on `429 insufficient_quota` and we said "confirm your model access"; the account was empty. Credit is read before rate limit (both 429, opposite remedies). An unrecognised refusal keeps the provider's words and offers NO remedy. Hunter's refusals follow the same rule: an empty balance, a rate limit and a bad key give three different sentences, and none of them marks an address invalid.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** — one rule, `wallet.meteringExempt`, asked by `meterAction` AND by the `spendAcus` the video queue, gateway and SEO autopilot use. A refund returns what was TAKEN, so an exempt render cannot mint ACUs.
- **§50 the paid-boost ladder** (`shared/boost-ladder.ts`) — which post earns a budget, against the brand's own median; refuses to promote without conversion tracking; never spends. **Market Exit Capture** — a closed firm's demand sent to one that trades, published only on a register entry or two failing sources.
- **The provider waterfall** — one name and company through every supplier in COST order inside
  14s. Free first; **only calls that ran AND returned are charged**. Three scores, never one.
  **Hunter is the first PAID adapter (09-03)** — email finder plus a real mailbox verifier, `order: 2`
  so a credit is spent only on what the free sources missed, `costAcu` derived from `USD_TO_GBP ×
  ACU_PER_GBP` and charged at 2×. Every address is `provenance: "provider"` even when Hunter cites a
  source — `confirmed` means WE read the page. **Its mapping is REASONED, not observed** (no network
  to api.hunter.io here), so **`/api/health/enrichment?probe=1`** (admin/cron — spends ~$0.11) or
  `node --import tsx scripts/check-hunter.mjs` proves it live. Both run the SAME module,
  `backend/hunter-probe.ts`; the route's free half is anonymous and answers "did the build get it?".

**EVERY PUBLIC CLAIM IS BOUND TO THE CODE OR TESTED AGAINST IT** (08-26). Landing stats, plan prices/ACUs, 39 agent cards, answer pages — twelve tests. **What broke was always what somebody TYPED.**

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

**0. CLOSED AND CONFIRMED — `require(esm)`, the pair that took production down TWICE
(08-29 and 09-03).** `firebase-admin` → `jwks-rsa` (CommonJS) → `jose@6` (pure ESM); `require()` of
an ESM package works only on Node ≥ 22.12, so it ran on a 22.22 laptop and died at MODULE LOAD on
the host, answering Next's HTML page from every route that imported it. Only `/api/health/live`
survived, because it loads its modules inside a catch. **The 08-29 fix was `engines: 22.x` and the
host did not honour it** — a pin somebody else has to agree to is not a fix — and the test written
that day asserted jose IS ESM-only, so it stayed green through the whole second outage and would
only have gone red on the repair. **Fix: `overrides.jose: ^5`**, which ships CommonJS, so the host's
choice stops mattering; proved by driving `retrieveSigningKeys` on a real RSA JWK and verifying a
real signature, because jwks-rsa does `catch { continue }` and a broken jose returns NO KEYS
silently. `/api/health/live` reports `runtime.node` and `canRequireEsm` — in neither outage could
anyone see which Node was running. `/diagnose` reads 200/200 with the expected refusals green.

**1a. THE PLATFORM SUPPRESSED 354 GOOD ADDRESSES BECAUSE ITS OWN PASSWORD WAS WRONG
(2026-09-06).** The campaign route suppressed any failure containing a 5xx, and the server was
refusing our login with `535`. 104 prospects on one brand and 250 on another became permanent
"hard bounces"; one vault went 104 sendable → 0, and the fabricated 18.77% bounce rate then had
the deliverability agent advising a list-cleaning purchase. `isRecipientRejection` stops it.
**`/api/email/suppression-repair` undoes it**, on evidence rather than a guess: a bounce requires
a delivery, so a bounce recorded on a day when ZERO messages were accepted cannot be about the
recipient. Days with even one real delivery are left untouched, restoration re-proves every
address rather than trusting the request, and the bounce EVENTS are kept — only the suppression
is lifted. Admin-gated, audited, no bulk undo.

**1b. ENGAGEMENT RATES WERE FABRICATED, AND AN AGENT ACTED ON THEM (2026-09-06).** 270% opens,
200% clicks. Opens were deduplicated per person and SENDS WERE NOT, and the in-memory ledger
evicts oldest-first — a send is recorded before the open it causes, so the cap ate the
denominator. `emailContext` then multiplied an already-percentage by 100 again. Rates are now
computed per unique recipient and **withheld entirely when openers exceed senders**, with the
reason stated; the agent is told the measurement is absent and instructed not to infer from it.

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
4. **`SERPER_API_KEY`** gates live company discovery; the current value is rejected 401/403. **Video** needs credit at a provider, not a model change — OpenAI's account is empty; add credit or render on Veo.

**No feature section of the growth spec is MISSING as of 2026-08-30.** §50, §77 and §100 were
the last three; §80 (an agent message bus) is recorded as considered and rejected. What remains
is partial rows, each naming the one absent part. See `GROWTH-ENGINE-COVERAGE.md`.

**Surfaces built:** §50, §70, §77, §92, §95, §97, §98, §100, §102, §103. **Not built:** §80 agent message bus (considered, rejected), §14 calendars, §21 carousels.

**Security debt.** 6 moderate advisories, NO high — all the uuid → firebase-admin chain; npm's "fix" is a four-major downgrade. `overrides` also force Next's nested postcss and sharp up, and pin `jose` (§5.0).

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.**
TWENTY-EIGHT. Newest (09-06): the batch send path set every result field EXCEPT `failure`, so 250
failures reached the campaign screen as `unknown` — "the send did not complete" — while the
classification sat two lines above in the attempt ledger. Before it, in order: the SMTP probe knew
which verb the host refused and the whole probe was gated, so the reason was reachable only by
signing in on a platform where signing in was broken; a route's engine was imported STATICALLY, so
its load failure happened outside every catch and `/api/capabilities` knew why it could not start
while the browser got an HTML page (`loadModule` now); the response headers named the machine that
answered and nothing carried it to the reader, so three redeploys went into fixing the app when the
evidence sat on the response (`shared/response-origin.ts`, `/diagnose`); the codebase read 133
environment variables and the diagnostic knew 35; the render sent no aspect ratio, so every portrait
came back landscape. Worst: a message whose login, envelope sender and From were three mailboxes,
**all three invented** — `appuser@` was recorded as "the mailbox that actually exists" and never
existed. The rest: `REQUIREMENTS-COVERAGE.md`.

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM — and if none exists, BUILD IT BEFORE THE THIRD GUESS.** The HTML fault took three wrong theories and three redeploys before `/diagnose` existed. **And a diagnostic only its author can read is not a diagnostic**: the SMTP stage, the server's refusal line and the enrichment probe were each gated behind a sign-in that was itself broken.

**A second class, about tests rather than code: a check that passes — or FAILS — for a reason
unrelated to what it tests.** TWENTY-THREE, and four of the newest were found by MUTATION AFTER the
suite was green. Newest (09-06): a pre-ticked consent box passed an assertion that only looked for
`useState(false)` — which matched every other flag in the file. Before it: a leak check flagged
`str(f.email) ? "an address" : "null"`, a ternary that never emits the address, so a pattern that
flags safe code teaches people to ignore it; a "the human note carries the reason" assertion matched
anywhere in the file, and a sibling field carried the same words, so deleting the reason from the
sentence left it green; five guards on the suppression rule could each be deleted with the suite
green, because every case was caught by an earlier branch. And the worst kind: a test written on
08-29 asserted that `jose` IS ESM-only — recording the hazard as a fact of life, green through the
whole second outage, and it could only ever have failed on the repair. **A test that passes while
production is down, and would fail on the fix, is worse than no test.** The CI secret scan is the
oldest: `sk-[…]{20,}` matched the slug `ask-customers-for-reviews-properly`, red for twelve runs and
never once on a credential.

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
