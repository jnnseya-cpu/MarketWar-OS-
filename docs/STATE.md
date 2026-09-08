# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never appended to.**
Read this one first. Companions are listed in `CLAUDE.md`. Updated: 2026-09-08.

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one subscription, priced
in credits, deployed at marketwaros.com. Live-tested on **AxionOS** (evandeli.com, UK trades) and
**VeryX** (veryxjnn.com). Next.js, TypeScript strict, three layers enforced by
`scripts/check-layers.mjs`. 247 backend modules, 183 API routes, 69 dashboard pages, **1,817 tests**,
including one end-to-end run of the growth loop and one real SMTP conversation driven end to end.

**`overrides.jose` IS LOAD-BEARING** — without it a CommonJS dependency require()s an ESM package and every route importing firebase-admin dies at module load. Read §5.0 before touching it or `engines`; the Node 22 pin remains but is no longer the only defence.

**Both branches are IDENTICAL, on Next 15 / React 19** (landed 08-28). Mirror file-by-file, never by merge, verified on main's own `npm ci`.

**LIVE AND CONFIRMED BY THE OWNER ON 2026-09-06: `build.commit` = `94e4749`, `/diagnose` all green.**
Everything shipped 09-06 → 09-08 is pushed and NOT yet confirmed serving. **`/api/health/email` now
reports `buildBuiltAt`** — read it first, because Vercel applies an env change only to deployments
created AFTER it, so an older build never received the value you set.

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 0.**

Everything below is subordinate to that. `/dashboard/acquisition` holds the count and states the
cause from the counts alone; with nothing sent, the diagnosis is not the product or the price.
**See §5.1: the send RUNS, reaches the password stage, and the mail host refuses the login.**

`GO-TO-MARKET-MarketWar-OS.docx` is the plan, `FACEBOOK-LAUNCH-CAMPAIGN.docx` the paste-ready first
campaign; both parse their prices out of `src/`. `MarketWar-OS-Sales-Deck.pptx` and
`brand/email-signature.html` are the sales surface (09-07) — **the deck was never opened in a renderer
here** (LibreOffice cannot load a file in this container), so its layout is unverified by me.

## 3. What works with NO keys at all — no provider, no card, no configuration

- **The free website audit** (`/audit`) — a real crawl, **30 checks** (DERIVED from `AUDIT_COPY`, never
  typed), the three WORST free, every failing finding carrying what it costs and the fix, the lead
  recorded as an inbound prospect. No account, no card; six adverts promise that and `npm run
  ads:verify` fails if it stops being true. Refuses private and link-local destinations. **Confirmed
  live 09-03** — construxvg.com, 3 pages, 83→92/100. **AI search** PARSES robots.txt (never
  pattern-matches) for the ten crawlers feeding assistants, and never claims anybody IS cited. **The
  full report downloads (09-06)**, so an address is never asked for on the strength of a send we
  cannot make.
- **The client approval portal** — a signed, expiring link a client opens with no account.
- **The command bar**, **ad canvas**, **pricing and margin arithmetic**, **paid-media guardrails**, **payout engine**, **emergency stop** — every refusal computed, never guessed. **The publication ledger**: a lost publish response is uncertain, so the next attempt asks the channel rather than posting twice. Plus eight pre-publish checks, channel health, versions and restore, creative fatigue, the audit log, teams, Sentinel, 13 articles.
- **Named groups in the customer vault (09-07, §110)** — `shared/contact-groups.ts`. A campaign went to
  the whole vault or to nothing. A group is a label a person applies on purpose (segments stay COMPUTED
  and untouched), a contact can be in several, **"not in any group" is itself selectable** because that
  is where every newsletter signup and audit lead lands, an empty selection is still everyone, and the
  button's number is the SENDABLE count the send path will attempt.
- **Contact Hunter + Contact Finder** — find a business contact, or fill in a list, on `lead-harvest`'s 12 checks and UK/EU/US lawful basis. **Confirmed / inferred / provider never convert.**
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`) — a brief that will come back wrong is REFUSED before a penny moves; shape is a PARAMETER, and nothing sent one, so every portrait came back wide.
- **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — a render died on `429 insufficient_quota` and we said "confirm your model access"; the account was empty. Credit is read before rate limit (both 429, opposite remedies). An unrecognised refusal keeps the provider's words and offers NO remedy; none of them marks an address invalid.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** — `wallet.meteringExempt`, asked by `meterAction` AND by the `spendAcus` the video queue, gateway and SEO autopilot use. A refund returns what was TAKEN, so an exempt render cannot mint ACUs.
- **§50 the paid-boost ladder** — which post earns a budget, against the brand's own median; refuses to promote without conversion tracking; never spends. **Market Exit Capture** — a closed firm's demand sent to one that trades, published only on a register entry or two failing sources.
- **The provider waterfall** — one name and company through every supplier in COST order inside 14s.
  Free first; **only calls that ran AND returned are charged**. Three scores, never one. **Hunter is
  the first PAID adapter (09-03)**, `order: 2` so a credit is spent only on what the free sources
  missed, charged at 2×; every address is `provenance: "provider"` even when Hunter cites a source,
  because `confirmed` means WE read the page. **Its mapping is REASONED, not observed** (no network to
  api.hunter.io here), so `/api/health/enrichment?probe=1` (admin/cron, ~$0.11) proves it live.

**EVERY PUBLIC CLAIM IS BOUND TO THE CODE OR TESTED AGAINST IT** (08-26). Landing stats, plan prices/ACUs, 39 agent cards, answer pages — twelve tests. **What broke was always what somebody TYPED.**

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment; trust it over this table.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` set 2026-08-26. **THE ACU WALLET IS THE GATE, NOT `AI_MONTHLY_CEILING_USD`** — every AI route requires auth AND `meterAction`, a 0-ACU account gets 402 before the gateway is reached, and the only unmetered path (the daily blog cron) needs BOTH `BLOG_DAILY_ENABLED=1` and `CRON_SECRET`, neither set. |
| Scheduled work | `CRON_SECRET` (unset — every scheduled path is dark) · Newsletter: `NEWSLETTER_SECRET` |
| **Sending email** | **Our own sending pool with verified DNS** — the platform's own path, and the one being fixed in §5.1. **Until a working sender exists every send is REFUSED and reported as not sent** — it used to return success for mail delivered to nobody. |
| Client approval links | `PORTAL_LINK_SECRET` (16+ chars), falling back to `HUMAN_CHECK_SECRET` — which IS set, so links work today. With NEITHER, issuing is refused rather than minting a link that verifies on one server and fails on every other. |
| Stripe, Firebase Admin | Both configured and verified live. `FIELD_ENCRYPTION_MASTER_KEY` set 2026-08-26, unblocking PII writes that were being refused in silence — nothing predates it, because those writes never landed. |
| **Trading identity** | **`NEXT_PUBLIC_LEGAL_ENTITY_NAME` + `NEXT_PUBLIC_REGISTERED_ADDRESS` are a LAUNCH BLOCKER** for a UK site selling to the public; `NEXT_PUBLIC_COMPANY_NUMBER` and `NEXT_PUBLIC_VAT_NUMBER` follow. |

## 5. Outstanding — the whole list, deduplicated

**STILL OPEN: 1, 2, 3, 4.** Item 0 is CLOSED, kept only because it recurred once and the pin that
"fixed" it the first time did not hold. Everything else closed is one line below; the standing
instructions those left behind are in §7.

**0. CLOSED AND CONFIRMED — `require(esm)`, which took production down TWICE (08-29, 09-03).**
`firebase-admin` → `jwks-rsa` (CommonJS) → `jose@6` (pure ESM); `require()` of ESM works only on
Node ≥ 22.12, so it ran on a 22.22 laptop and died at MODULE LOAD on the host. **The 08-29 fix was
`engines: 22.x` and the host did not honour it** — a pin somebody else must agree to is not a fix.
**Fix: `overrides.jose: ^5`**, proved by driving `retrieveSigningKeys` on a real RSA JWK: jwks-rsa
does `catch { continue }`, so a broken jose returns NO KEYS silently.

**1. MAIL: THE LOGIN IS REFUSED AT `auth-pass` (open since 09-03, evidence current to 09-07).**
Everything either side of the credential is proven. The send path was driven end to end against a real
SMTP server in-container: **3/3 delivered, tracking injected, ledger written**, and group selection
attempts exactly the numbers it prints. Against the owner's host, `/api/health/email` reports
`probeReachedStage: "auth-pass"`, `probeSucceeded: false`, `535 5.7.8 authentication failed`,
`smtpUserIsTheFromAddress: true`, and **no surrounding whitespace on either value**. The stage is
where it STOPPED, so connect, EHLO and STARTTLS succeeded and the username was accepted as a form —
**the host rejected the password**, with login, envelope and From all one mailbox. **Candidates, in
the order to test them:** (a) **the running build predates the `SMTP_PASS` change** — read
`buildBuiltAt` against when it was set, and redeploy if earlier; (b) **the mailbox is locked** after
days of failed logins, where the fix is time plus a reset, not a new value; (c) **SMTP auth is
disabled for that mailbox, or an app-specific password is required** rather than the webmail one.
**The owner reports the same credentials working from their own client, which excludes none of the
three** — a client that logged in before a lockout keeps working, and app-password rules are commonly
applied to third-party hosts only. Still owed: `EMAIL_FROM` = `MarketWar OS <info@marketwaros.com>`.

**2. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid, `whsec_` set. Left: (a) the wrong `whsec_` of that account's SEVEN endpoints; (b) the URL — `MAIN_DOMAIN` is the APEX, the app serves `www.`. **To close:** `/api/health/stripe`.

**3. NEXT 15 IS LANDED — confirm it in production. To close:** one real signup.

**4. THE TRADING IDENTITY IS NOT ON THE SITE.** Four `NEXT_PUBLIC_LEGAL_*` values, two a UK launch
blocker (§4), plus the phone number, postal address and active social profiles for the public pages
and the email signature. **I will not invent any of these** — a fabricated company number on a page
that sells is worse than a blank one.

**CLOSED — the detail is `REQUIREMENTS-COVERAGE.md`, which is what that file is for; a closed item
is here only as a name, so it stops being rediscovered.** *09-07 → 09-08 (§§110–113):* named vault
groups · campaign failover, but only when nothing has left · one brand's domain no longer shows as
Authenticated on another brand's screen · per-brand DKIM selectors, so a shared domain can carry more
than one brand. *09-06 (§§106–109):* the CI secret scan silently skipped behind a red audit · an
anonymous GET on `/api/email/suppression-repair` · a button pointing at a `/pricing` that does not
exist · video failures charging without refunding · **we failed the checks we sell** (no Open Graph,
two canonical hosts, eight bad descriptions, landing 78 → 83). *09-06 (§§103–105):* 354 addresses
suppressed by OUR own refused password, given back on evidence · 270% open rates, now per unique
recipient · a brand switch leaving the previous brand's From · an audit asking for an address to email
a report it could not send · a warm-up cap that read a calendar and authorised 50,000/day on day 40
after fifty messages. *Earlier:* Node 20 in production · a 500 that was the middleware failing closed
· a rate limit darkening the War Room · 91 of 133 env variables invisible (`shared/env-catalogue.ts`
is the one registry, 111 entries, **14 still missing**) · §50, §77, §100.

**Owner actions (nothing in code can substitute):**
1. **`PLATFORM_ADMIN_EMAILS`** — set ONCE; check `/api/health/live` → `envPresent` first. Makes the
   owner `executive`, never metered. Or `node scripts/grant-admin.mjs you@… executive`.
2. Open `/api/health/live` after every change — `envPresent`/`envMissing` is the only proof the
   running build received it, `build.commit` the only proof of WHICH code is serving, and
   `buildBuiltAt` the only proof it was built AFTER an env change. All 111 variables and what each
   unlocks: `shared/env-catalogue.ts`. Submit the sitemap.
3. **Send the first ten messages** (`/dashboard/acquisition` has the text per brand), then the first
   Facebook campaign (`npm run ads:doc`): Traffic, not Awareness, five custom audiences built FIRST.
4. **`SERPER_API_KEY`** gates live company discovery; the current value is rejected 401/403. **Video**
   needs credit at a provider, not a model change.

**No feature section of the growth spec is MISSING as of 2026-08-30** — what remains is partial rows,
each naming the one absent part; see `GROWTH-ENGINE-COVERAGE.md`. **Built:** §50, §70, §77, §92, §95,
§97, §98, §100, §102, §103. **Not built:** §80 agent message bus (considered and rejected), §14
calendars, §21 carousels.

**Security debt.** 6 moderate, NO high — the uuid → firebase-admin chain; npm's "fix" is a four-major
downgrade. `overrides` force Next's nested postcss and sharp up, pin `jose` (§5.0) and, since 09-06,
`browserslist ^4.28.7` — two HIGH advisories against `<=4.28.6`, transitive via autoprefixer.

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.** TWENTY-NINE. Newest
(09-06): the active brand changed and the sender identity prefilled for the previous one did not,
because "empty" was the only test for "the customer chose this" — so a campaign could go to one
company's list wearing another company's name. Before it: the batch send set every result field EXCEPT
`failure`, so 250 failures reached the screen as "the send did not complete"; the SMTP probe knew which
verb the host refused and was gated behind a broken sign-in; a route's engine was imported STATICALLY,
so its load failure happened outside every catch; the headers named the machine that answered and
nothing carried it to the reader, so three redeploys went into fixing the app; the codebase read 133
env variables and the diagnostic knew 35; the render sent no aspect ratio. Worst: a message whose
login, envelope sender and From were three mailboxes, **all three invented**.

**A THIRD SHAPE OF IT, the one 09-07/09-08 kept producing: a value hard-coded as a module CONSTANT
where it should have come from the record** — the DKIM selector, the bounce host built from it, the
tracking base falling back to the apex while the app serves `www`. Each read correctly alone; each was
wrong the moment a second brand or host existed. **Anything that identifies WHOSE something is cannot
be a module-level constant.**

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM — and if none exists, BUILD IT BEFORE THE THIRD GUESS.** The HTML fault took three wrong theories and three redeploys before `/diagnose` existed. **A diagnostic only its author can read is not a diagnostic**: the SMTP stage, the refusal line and the enrichment probe were each gated behind a sign-in that was itself broken. **And 09-07 proved the other half: I reported `probeReachedStage` as `mail-from` from memory and the JSON said `auth-pass`** — one message from telling the owner their password was accepted when the host had just refused it. Read the output; do not recall it.

**A second class, about tests rather than code: a check that passes — or FAILS — for a reason
unrelated to what it tests.** TWENTY-SIX, seven found by MUTATION after the suite was green. The test
proving today's sending could not raise today's warm-up ceiling asserted it on DAY ONE, where the
schedule clamps the fault out of sight — it passed against broken code. A link scanner read
`href="/x"` but not `href={a || "/x"}`, and the dead link existed in both forms. A pre-ticked consent
box passed an assertion that only looked for `useState(false)`; five guards on the suppression rule
could each be deleted green. Worst: a test asserting `jose` IS ESM-only — the hazard recorded as a
fact of life, green through the whole second outage, able to fail only on the repair. **A test that
passes while production is down, and would fail on the fix, is worse than no test. AND A MUTATION THAT
CHANGES NOTHING PROVES NOTHING (09-07)** — one "survived" a group-selection test and nearly got it
recorded as weak; it was `some()` → `filter().length >= 1`, the same program. Check the mutant is a
different program before believing the survival.

**A DIAGNOSTIC IS AN ENDPOINT TOO.** `/api/health/email` authorised `?send=` but left the REPORT open — twenty recipient addresses beside the SMTP host and username. Gated. **AND A PANEL MUST NOT BLAME THE OWNER FOR ITS OWN FAILED REQUEST** — three answered a refused fetch by asserting a key was missing.

**A test that passes is not evidence until something has broken it.** Drive the real handler and assert on a value only the real path can produce. EIGHT tests have failed on their own comments, and one on a STRING LITERAL — the prose "the mail host is withheld" read as the field leaking. Strip comments AND literals before scanning (`codeOf()`).

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session and carries
the additive-only law, the margin floor and the no-fabrication rule. Only here:

- **Verify before shipping:** typecheck, build, layers, lint, tests — then MUTATE the new
  tests, AND READ THE CI RUN. A test that has never failed is not evidence.
- **`npm run verify` is NOT the CI gate** — it does not run `npm audit`, and an advisory published
  against a transitive dependency turns CI red on a commit that changed nothing. Read the run.
- **A security step must never sit behind a step that can fail on its own** — `if: always()`.
- **`requireAuth` returning `ok` does NOT mean the scope was checked.** With no Firebase Admin it
  returns `{ok:true, enforced:false}` before the scope check. Any surface touching real customer data
  must require `enforced` too, and refuse 503 rather than answer an unidentified request.
- **Drive the routes, do not read them.** A production build on `next start` found an open endpoint
  and a 404 on the paid-conversion path that no reading had; the send path, group selection and
  multi-brand signing were each proved against a real server.
- **Anything scoped to a tenant is scoped by the RECORD, never by a constant** (§6), and a scoping
  change is followed through every reader — the DKIM one would have dropped every bounce on a shared
  domain, two files away.
- **Point our own audit at our own pages** before claiming the marketing surface is fine. It found
  no Open Graph, two canonical hosts and eight broken descriptions in one pass.
- **The owner does not use, and will not be offered, a third-party ESP** — MarketWar's own sending
  pool is the product. And **never invent a company detail** (number, address, phone, handle, trading
  name): a blank is recoverable, a fabricated one on a page that sells is not.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` file-by-file, never
  by merge, verified on main against its own `npm ci`. The branches no longer differ on
  anything — a diff between them is now a mistake, not a plan.
