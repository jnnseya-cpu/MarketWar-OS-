# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never appended to.**
Read this one first. Companions are listed in `CLAUDE.md`. Updated: 2026-09-06.

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one
subscription, priced in credits, deployed at marketwaros.com. Live-tested on
**AxionOS** (evandeli.com, UK trades) and **VeryX** (veryxjnn.com). Next.js,
TypeScript strict, three layers enforced by `scripts/check-layers.mjs`. 237
backend modules, 178 API routes, 68 dashboard pages, **1,793 tests** including one
end-to-end run of the growth loop.

**`overrides.jose` IS LOAD-BEARING** — without it a CommonJS dependency require()s an ESM package and every route importing firebase-admin dies at module load. Read §5.0 before touching it or `engines`; the Node 22 pin remains but is no longer the only defence.

**Both branches are IDENTICAL, on Next 15 / React 19** (landed 08-28). Mirror file-by-file, never by merge, verified on main's own `npm ci`.

**LIVE AND CONFIRMED BY THE OWNER ON 2026-09-06: `build.commit` = `94e4749`, `/diagnose` all green.**
That is the whole sending-path repair — brand identity, the downloadable audit report, the reputation
governor — plus the CI gate fix, actually serving. CI is green on both branches for the first time
since the browserslist advisory. Owner testing the sending path 09-07.

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the count and states the
cause from the counts alone; with nothing sent, the diagnosis is not the product or the price.
**See §5.1: the send now RUNS and the mail host refuses it — `/api/health/email` names the stage.**

`GO-TO-MARKET-MarketWar-OS.docx` is the plan; `FACEBOOK-LAUNCH-CAMPAIGN.docx` is the paste-ready first campaign. Both parse their prices out of `src/`.

## 3. What works with NO keys at all — no provider, no card, no configuration

- **The free website audit** (`/audit`) — a real crawl, **30 checks** (DERIVED from `AUDIT_COPY`,
  never typed), the three WORST free, every failing finding carrying what it costs and the fix, the
  lead recorded as an inbound prospect. No account, no card; six adverts promise that and
  `npm run ads:verify` fails if it stops being true. Refuses private and link-local destinations.
  **Confirmed live 09-03** — construxvg.com, 3 pages, 83→92/100. **AI search:** "AI crawler access"
  PARSES robots.txt (never pattern-matches) for the ten crawlers feeding assistants, plus
  text-in-HTML and structured data — it never claims anybody IS cited, which costs AI calls.
  **The full report downloads from the page (09-06)**, so an address is never asked for on the
  strength of a send this platform cannot guarantee.
- **The client approval portal** — a signed, expiring link a client opens with no account.
- **The command bar**, **ad canvas**, **pricing and margin arithmetic**, **paid-media guardrails**, **payout engine**, **emergency stop** — every refusal computed, never guessed. **The publication ledger**: a lost publish response is uncertain, so the next attempt asks the channel rather than posting twice. Plus eight pre-publish checks, channel health, versions and restore, creative fatigue, the audit log, teams, Sentinel, 13 articles.
- **Contact Hunter + Contact Finder** — find a business contact, or fill in a list, on `lead-harvest`'s 12 checks and UK/EU/US lawful basis. **Confirmed / inferred / provider never convert.**
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`) — a brief that will come back wrong is REFUSED before a penny moves; shape is a PARAMETER, and nothing sent one, so every portrait came back wide.
- **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — a render died on `429 insufficient_quota` and we said "confirm your model access"; the account was empty. Credit is read before rate limit (both 429, opposite remedies). An unrecognised refusal keeps the provider's words and offers NO remedy; Hunter's follow the same rule, and none of them marks an address invalid.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** — `wallet.meteringExempt`, asked by `meterAction` AND by the `spendAcus` the video queue, gateway and SEO autopilot use. A refund returns what was TAKEN, so an exempt render cannot mint ACUs.
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

**STILL OPEN — three things: 1, 2 and 3. Items 0, 4 and 5 are CLOSED and kept here because each
carries a standing instruction, not because the work is outstanding.**

**0. CLOSED AND CONFIRMED — `require(esm)`, which took production down TWICE (08-29, 09-03).**
`firebase-admin` → `jwks-rsa` (CommonJS) → `jose@6` (pure ESM); `require()` of an ESM package works
only on Node ≥ 22.12, so it ran on a 22.22 laptop and died at MODULE LOAD on the host, answering
Next's HTML page from every route importing it. Only `/api/health/live` survived, loading its modules
inside a catch. **The 08-29 fix was `engines: 22.x` and the host did not honour it** — a pin somebody
else has to agree to is not a fix — and that day's test asserted jose IS ESM-only, so it stayed green
through the whole second outage and could only have failed on the repair. **Fix: `overrides.jose:
^5`** (CommonJS), proved by driving `retrieveSigningKeys` on a real RSA JWK and verifying a real
signature — jwks-rsa does `catch { continue }`, so a broken jose returns NO KEYS silently.

**1. MAIL: THE SEND RUNS AND THE SERVER REFUSES IT (2026-09-03).** A real audit closed with *"the
mail server refused the message"* — the `provider` category, which is PROGRESS: the path used to
THROW and classify nothing, so a classified refusal means the sending code runs and the host said
no. **The stage was the answer and sat behind a sign-in that was itself broken**, so
`/api/health/email` reports `probeReachedStage` and a name-free verdict to a SIGNED-OUT caller
(`auth-pass` = wrong password, `rcpt-to` = relay restricted, `connect` = wrong port); the server's
line, host, account and recipients stay gated. **To close:** read `probeReachedStage`. Still owed:
`EMAIL_FROM` = `MarketWar OS <info@marketwaros.com>`.
**CORRECTED 09-03 — REVERSES THE 08-27 INSTRUCTION THAT STOOD HERE.** It read "do NOT change
`SMTP_USER`", on a note claiming `appuser@marketwaros.com` had been verified to log in. That inbox
was never created; the domain has one mailbox, `info@`, and the live probe agrees — stage
`auth-pass`, a relay refusing a login for a mailbox that does not exist. A note saying a mailbox was
verified is not a mailbox; only the relay's answer is evidence. **Set `SMTP_USER` =
`info@marketwaros.com`, `SMTP_PASS` = that mailbox's own password** — login, envelope and From are
then all `info@`, the strongest arrangement `sender-identity.ts` supports.

**4. CLOSED, AND THE INSTRUCTION IN IT IS PERMANENT — THE CI GATE HAD A HOLE THAT OPENED BY ITSELF (09-06).** Two HIGH advisories were published
against `browserslist` — transitive, via autoprefixer — so every run went red on the dependency
audit; and because steps stop at the first failure, the **secret scan and .env check were SKIPPED on
every push**, the two controls guarding the one mistake a revert cannot undo. `if: always()` on both,
override pinned, audit still a gate. **`npm run verify` does NOT run `npm audit` — a green local gate
is not a green CI. Read the run.**

**5. CLOSED — TWO DEFECTS FOUND BY DRIVING THE ROUTES, NOT READING THEM (09-06).**
`/api/email/suppression-repair` answered **200 to an anonymous GET**: `requireAuth` returns
`{ ok: true, enforced: false }` when Admin is unconfigured, and returns ABOVE the scope check, so
`platform_admin` was never applied — twenty-one call sites read `ok` alone. Bounded honestly: no Admin
also means no Firestore, so the ledger it would have served is empty and production was gated. It now
needs `ok && enforced` and refuses 503 otherwise, like `/api/email-events`; the hazard is documented
on `requireAuth`. And **the "you have used your free audits" button pointed at `/pricing`, which does
not exist** — the page is `/choose-plan` and every other link said so. A 404 at the moment somebody is
most likely to pay. A test now walks `src/app` for the routes Next actually serves and fails on any
hard-coded internal link that goes nowhere.

**2. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid, `whsec_` set. Left: (a) the wrong `whsec_` of that account's SEVEN endpoints; (b) the URL — `MAIN_DOMAIN` is the APEX, the app serves `www.`. **To close:** `/api/health/stripe`.

**3. NEXT 15 IS LANDED — confirm it in production.** **To close:** one real signup, which was impossible until today.

**CLOSED 09-06 — the sending path, one line each; the full account is `REQUIREMENTS-COVERAGE.md`
§§103–105.** 354 addresses suppressed because OUR password was refused with 535 — stopped, and
`/api/email/suppression-repair` gives them back on evidence (a bounce needs a delivery, so a bounce on
a day with ZERO accepted messages is not one). 270% open rates — sends counted per event, openers per
person; rates are now per unique recipient and WITHHELD when openers exceed senders. Switching brand
left the previous brand's From name and domain on the send screen — `applyDefaults` now knows its own
prefill from typed text, and every brand-scoped panel clears on the id. The audit asked for an address
to email a report it could not send — the full report downloads now. The warm-up cap read a calendar,
authorising 50,000/day on day 40 after fifty messages — it is now the lower of the schedule and twice
the best day actually sent, governed by bounces and complaints on Gmail's published lines.

**CLOSED EARLIER, one line each; the detail is in `REQUIREMENTS-COVERAGE.md` and belongs there.**
Production ran Node 20 (08-29). A production 500 was the middleware, failing closed (08-28). A rate
limit darkened the War Room (08-28). 91 of 133 env variables were invisible — `shared/env-catalogue.ts`
is the one registry, 110 entries, **14 still missing** (08-29). The free audit's personal-use limits
and its six separate area scores (08-29). §50 boost ladder, §77 knowledge graph, §100 per-agent cost
and impact (08-30). Bulk import refuses a 100×-ambiguous amount rather than guessing.

**Owner actions (nothing in code can substitute):**
1. **`PLATFORM_ADMIN_EMAILS`** — set ONCE; check `/api/health/live` → `envPresent` first. Makes the
   owner `executive`, never metered. Or `node scripts/grant-admin.mjs you@… executive`.
2. Open `/api/health/live` after every change — `envPresent`/`envMissing` is the only proof the
   running build received it, `build.commit` the only proof of WHICH code is serving. All 110
   variables and what each unlocks: `shared/env-catalogue.ts`. Submit the sitemap.
3. **Send the first ten messages** (`/dashboard/acquisition` has the text per brand), then the first
   Facebook campaign (`npm run ads:doc`): Traffic, not Awareness, five custom audiences built FIRST.
4. **`SERPER_API_KEY`** gates live company discovery; the current value is rejected 401/403. **Video**
   needs credit at a provider, not a model change — add credit or render on Veo.

**No feature section of the growth spec is MISSING as of 2026-08-30** — what remains is partial
rows, each naming the one absent part; see `GROWTH-ENGINE-COVERAGE.md`. **Surfaces built:** §50, §70,
§77, §92, §95, §97, §98, §100, §102, §103. **Not built:** §80 agent message bus (considered and
rejected), §14 calendars, §21 carousels.

**Security debt.** 6 moderate, NO high — the uuid → firebase-admin chain; npm's "fix" is a
four-major downgrade. `overrides` force Next's nested postcss and sharp up, pin `jose` (§5.0) and,
since 09-06, `browserslist ^4.28.7`: two HIGH advisories were published against `<=4.28.6`, which
arrives transitively through autoprefixer, so there was no direct dependency to bump.

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.** TWENTY-NINE. Newest
(09-06): the active brand changed and the sender identity prefilled for the previous one did not,
because "empty" was the only test for "the customer chose this" — so a campaign could go to one
company's list wearing another company's name. Before it, in order: the batch send set every result
field EXCEPT `failure`, so 250 failures reached the screen as "the send did not complete" while the
classification sat two lines above; the SMTP probe knew which verb the host refused and was gated
behind a sign-in that was itself broken; a route's engine was imported STATICALLY, so its load
failure happened outside every catch (`loadModule` now); the response headers named the machine that
answered and nothing carried it to the reader, so three redeploys went into fixing the app
(`shared/response-origin.ts`, `/diagnose`); the codebase read 133 env variables and the diagnostic
knew 35; the render sent no aspect ratio, so every portrait came back landscape. Worst: a message
whose login, envelope sender and From were three mailboxes, **all three invented**. The rest:
`REQUIREMENTS-COVERAGE.md`.

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM — and if none exists, BUILD IT BEFORE THE THIRD GUESS.** The HTML fault took three wrong theories and three redeploys before `/diagnose` existed. **And a diagnostic only its author can read is not a diagnostic**: the SMTP stage, the server's refusal line and the enrichment probe were each gated behind a sign-in that was itself broken.

**A second class, about tests rather than code: a check that passes — or FAILS — for a reason
unrelated to what it tests.** TWENTY-SIX, seven found by MUTATION after the suite was green. Newest
(09-06): the warm-up ramp read a cap off the calendar, passing on days elapsed, which is not what
builds a sending reputation; and the test written to prove today's own sending could not raise today's
ceiling asserted it on DAY ONE, where the schedule is the binding limit and clamps the fault out of
sight — it passed against the broken code. A link scanner written the same day read `href="/x"` but
not `href={a || "/x"}`, and the dead link existed in both forms. Before them: a pre-ticked consent box
passed an assertion that only looked for `useState(false)`; a leak check flagged a ternary that never
emits the address; a "the note carries the reason" assertion matched anywhere in the file; five
guards on the suppression rule could each be deleted green. And the worst kind: a test written on
08-29 asserted `jose` IS ESM-only — the hazard recorded as a fact of life, green through the whole
second outage, and it could only ever have failed on the repair. **A test that passes while
production is down, and would fail on the fix, is worse than no test.**

**A DIAGNOSTIC IS AN ENDPOINT TOO.** `/api/health/email` authorised `?send=` but left the REPORT open — twenty recipient addresses beside the SMTP host and username. Gated. `/diagnose` is public by the same test: it only reports which machine answered its own requests. **AND A PANEL MUST NOT BLAME THE OWNER FOR ITS OWN FAILED REQUEST** — three answered a refused fetch by asserting a key was missing, and a readiness check scored fields the form never showed.

**A test that passes is not evidence until something has broken it.** Drive the real handler and assert on a value only the real path can produce. SEVEN tests have failed on their own comments, and one on a STRING LITERAL — the prose "the mail host is withheld" read as the field leaking. Strip comments AND literals before scanning.

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session and carries
the additive-only law, the margin floor and the no-fabrication rule. Only here:

- **Verify before shipping:** typecheck, build, layers, lint, tests — then MUTATE the new
  tests, AND READ THE CI RUN. A test that has never failed is not evidence.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` file-by-file, never
  by merge, verified on main against its own `npm ci`. The branches no longer differ on
  anything — a diff between them is now a mistake, not a plan.
