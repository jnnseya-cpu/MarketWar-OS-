# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never appended to.**
Read this one first. Companions are listed in `CLAUDE.md`. Updated: 2026-09-08.

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one subscription, priced
in credits, deployed at marketwaros.com. Live-tested on **AxionOS** (evandeli.com, UK trades),
**VeryX** (veryxjnn.com) and **KODA** (kodajnn.com, mobile-money verification, DRC). Next.js,
TypeScript strict, three layers enforced by `scripts/check-layers.mjs`. 250 backend modules, 184 API
routes, 69 dashboard pages, **1,836 tests**.

**`overrides.jose` IS LOAD-BEARING** — without it a CommonJS dependency require()s an ESM package and every route importing firebase-admin dies at module load. Read §5.0 before touching it or `engines`.

**Both branches are IDENTICAL, on Next 15 / React 19** (landed 08-28). Mirror file-by-file, never by merge, verified on main's own `npm ci`.

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 1.**

**THE SEND WORKS AS OF 2026-09-08 — "1 sent · 0 failed", after five weeks.** The cause was
`SMTP_HOST` naming a server that does not hold the mailbox (§5.1). That number moves off 1 when
delivery is confirmed and the first real campaign runs; `/dashboard/acquisition` holds the count.

`GO-TO-MARKET-MarketWar-OS.docx` is the plan, `FACEBOOK-LAUNCH-CAMPAIGN.docx` the paste-ready first
campaign; both parse their prices out of `src/`. `MarketWar-OS-Sales-Deck.pptx` and
`brand/email-signature.html` are the sales surface — **the deck was never opened in a renderer here**
(LibreOffice cannot load a file in this container), so its layout is unverified by me.

## 3. What works with NO keys at all — no provider, no card, no configuration

- **The free website audit** (`/audit`) — a real crawl, **30 checks** (DERIVED from `AUDIT_COPY`, never
  typed), the three WORST free, each failing finding carrying what it costs and the fix, the lead
  recorded as an inbound prospect. No account, no card; six adverts promise that and `npm run
  ads:verify` fails if it stops being true. **Confirmed live 09-03** — construxvg.com, 83→92/100.
- **The client approval portal** — a signed, expiring link a client opens with no account.
- **The command bar**, **ad canvas**, **pricing and margin arithmetic**, **paid-media guardrails**, **payout engine**, **emergency stop** — every refusal computed, never guessed. **The publication ledger**: a lost publish response is uncertain, so the next attempt asks the channel rather than posting twice. Plus eight pre-publish checks, channel health, versions and restore, creative fatigue, the audit log, teams, Sentinel, 13 articles.
- **Named groups in the customer vault (§110)** — a group is a label a person applies on purpose
  (segments stay COMPUTED and untouched), a contact can be in several, **"not in any group" is itself
  selectable**, an empty selection is everyone, and the button's number is the SENDABLE count the send
  will attempt. **The preview computes the SAME audience (§116)** — it did not, and the two screens
  disagreed on screen.
- **Contact Hunter + Contact Finder** — on `lead-harvest`'s 12 checks and UK/EU/US lawful basis. **Confirmed / inferred / provider never convert.**
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`) — a brief that will come back wrong is REFUSED before a penny moves.
- **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — credit is read before rate limit (both 429, opposite remedies); an unrecognised refusal keeps the provider's words and offers NO remedy.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** — `wallet.meteringExempt`, asked by `meterAction` AND by `spendAcus`. A refund returns what was TAKEN, so an exempt render cannot mint ACUs.
- **§50 the paid-boost ladder** — which post earns a budget, against the brand's own median; refuses to promote without conversion tracking; never spends. **Market Exit Capture** — published only on a register entry or two failing sources.
- **The provider waterfall** — one name and company through every supplier in COST order inside 14s.
  Free first; **only calls that ran AND returned are charged**. **Hunter is the first PAID adapter**,
  `order: 2` so a credit is spent only on what the free sources missed, charged at 2×; every address is
  `provenance: "provider"` even when Hunter cites a source, because `confirmed` means WE read the page.

**EVERY PUBLIC CLAIM IS BOUND TO THE CODE OR TESTED AGAINST IT** (08-26). Landing stats, plan prices/ACUs, agent cards, answer pages — twelve tests. **What broke was always what somebody TYPED.**

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment; trust it over this table.

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` set. **THE ACU WALLET IS THE GATE, NOT `AI_MONTHLY_CEILING_USD`** — every AI route requires auth AND `meterAction`, and the only unmetered path (the daily blog cron) needs BOTH `BLOG_DAILY_ENABLED=1` and `CRON_SECRET`, neither set. |
| Scheduled work | **`CRON_SECRET` (unset — every scheduled path is dark, including bounce collection)** · Newsletter: `NEWSLETTER_SECRET` |
| Sending email | **WORKING** as of 09-08. See §5.1 for what is left: delivery confirmation and per-domain alignment. |
| **Collecting bounces** | **`MW_BOUNCE_IMAP_HOST`** — user and password default to `SMTP_USER`/`SMTP_PASS`, the mailbox failures already arrive at. Without it nothing reads them and a human has to open a mailbox, which is not a platform (§118). |
| Replies into the Inbox | `MW_REPLY_HOST` — a subdomain whose MX points at an inbound intake. Until then no reply address is issued and Reply-To falls back to the customer's own From (§114). |
| Client approval links | `PORTAL_LINK_SECRET`, falling back to `HUMAN_CHECK_SECRET`, which IS set. With NEITHER, issuing is refused rather than minting a link that verifies on one server and fails on every other. |
| Stripe, Firebase Admin | Both configured and verified live. `FIELD_ENCRYPTION_MASTER_KEY` set, unblocking PII writes that were being refused in silence. |
| **Trading identity** | **`NEXT_PUBLIC_LEGAL_ENTITY_NAME` + `NEXT_PUBLIC_REGISTERED_ADDRESS` are a LAUNCH BLOCKER** for a UK site selling to the public. |

## 5. Outstanding — the whole list, deduplicated

**STILL OPEN: 1, 2, 3, 4.** Item 0 is CLOSED, kept only because it recurred once and the pin that
"fixed" it the first time did not hold.

**0. CLOSED AND CONFIRMED — `require(esm)`, which took production down TWICE.** `firebase-admin` →
`jwks-rsa` (CommonJS) → `jose@6` (pure ESM); `require()` of ESM works only on Node ≥ 22.12, so it ran
on a laptop and died at MODULE LOAD on the host. **The 08-29 fix was `engines: 22.x` and the host did
not honour it** — a pin somebody else must agree to is not a fix. **Fix: `overrides.jose: ^5`**,
proved by driving `retrieveSigningKeys`: jwks-rsa does `catch { continue }`, so a broken jose returns
NO KEYS silently.

**1. MAIL: SENDING IS FIXED; DELIVERY IS NOT CONFIRMED (§115, §118).** Five weeks of `535 5.7.8` and
three password resets were never the password: **a 535 at the auth stage says a server refused the
credential, not that the credential is wrong**, and `SMTP_HOST` named a machine that does not hold the
mailbox. `loginMailboxProviderMatches` reads it from the MX of the login address's own domain; it read
`false`, `SMTP_HOST` was corrected, and the first message sent. **What is left:**
(a) **the message was not seen arriving** — set `MW_BOUNCE_IMAP_HOST` so the platform reads the
delivery notice itself instead of a human opening a mailbox;
(b) **alignment** — the From was `koda@kodajnn.com` while the login was a marketwaros.com mailbox, so
SPF authenticates the wrong domain and under `aspf=s` cannot align. `pickNode` now prefers a node whose
account is ON the sending domain, so **`MW_SENDING_POOL` with one node per domain** closes it with no
code change. Still owed: `EMAIL_FROM` = `MarketWar OS <info@marketwaros.com>`.

**2. STRIPE WEBHOOK: 246 EVENTS, NOTHING LANDING.** Live key valid, `whsec_` set. Left: the wrong
`whsec_` of that account's SEVEN endpoints. (`MAIN_DOMAIN` now defaults to `www`, so the host half is
closed.) **To close:** `/api/health/stripe`.

**3. NEXT 15 IS LANDED — confirm it in production. To close:** one real signup.

**4. THE TRADING IDENTITY IS NOT ON THE SITE.** Four `NEXT_PUBLIC_LEGAL_*` values, two a UK launch
blocker (§4), plus the phone number, postal address and active social profiles. **I will not invent
any of these** — a fabricated company number on a page that sells is worse than a blank one.

**CLOSED — names only; the detail is `REQUIREMENTS-COVERAGE.md`, which is what that file is for.**
*09-08 (§§114–118):* the reply path pointed at hosts that cannot receive mail, and its own
reachability check exempted the one domain it should have tested · `MW_SENDING_POOL` silently
overrode `SMTP_USER`/`SMTP_PASS` while the diagnostic described the variable being edited · a 535
read as a wrong password when it was the wrong server · an OUTLINE was previewed as a finished email
for 836 people, and the preview counted a different audience from the send · the writer's language was
decided by the sender's browser, and a reply the provider said was CUT OFF was never retried · the
platform could not read its own bounces, and a textbook Postfix DSN was filed as an auto-reply.
*09-07 → 09-08 (§§110–113):* named vault groups · campaign failover, but only when nothing has left ·
one brand's domain no longer shows as Authenticated under another · per-brand DKIM selectors.
*09-06 (§§103–109):* the CI secret scan silently skipped behind a red audit · an anonymous GET on
`/api/email/suppression-repair` · a button pointing at a `/pricing` that does not exist · video
failures charging without refunding · **we failed the checks we sell** (no Open Graph, two canonical
hosts, landing 78 → 83) · 354 addresses suppressed by OUR own refused password · 270% open rates · a
warm-up cap that read a calendar. *Earlier:* Node 20 in production · a 500 that was the middleware
failing closed · 91 of 133 env variables invisible (`shared/env-catalogue.ts` is the one registry,
116 entries).

**Owner actions (nothing in code can substitute):**
1. **`CRON_SECRET`** — unset, so every scheduled path is dark INCLUDING bounce collection. Set it and
   `MW_BOUNCE_IMAP_HOST` together and the platform starts reading its own delivery failures.
2. **`PLATFORM_ADMIN_EMAILS`** — set ONCE; makes the owner `executive`, never metered. Without it the
   full `/api/health/*` reports are unreadable, which is how a diagnostic becomes useless.
3. Open `/api/health/live` after every change — `envPresent`/`envMissing` is the only proof the
   running build received it, `build.commit` the only proof of WHICH code is serving, and
   `buildBuiltAt` the only proof it was built AFTER an env change.
4. **Send the first ten messages** (`/dashboard/acquisition` has the text per brand), then the first
   Facebook campaign (`npm run ads:doc`): Traffic, not Awareness, five custom audiences built FIRST.
5. **`SERPER_API_KEY`** gates live company discovery; the current value is rejected 401/403.

**No feature section of the growth spec is MISSING** — what remains is partial rows, each naming the
one absent part; see `GROWTH-ENGINE-COVERAGE.md`. **Not built:** §80 agent message bus (considered and
rejected), §14 calendars, §21 carousels.

**Security debt.** 6 moderate, NO high — the uuid → firebase-admin chain; npm's "fix" is a four-major
downgrade. `overrides` force Next's nested postcss and sharp up, pin `jose` (§5.0) and
`browserslist ^4.28.7`.

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.** THIRTY-ONE. Newest
(09-08): the gateway has always returned `truncated` from the provider's own stop reason and the AI
writer never read it, so a cut-off reply became "the model did not return usable JSON" and the only
remedy offered was to press the button again — which reproduces it exactly. Before it: groups reached
the send path and not the preview, so the two screens computed different audiences; the server's
refusal line was read once to decide suppression and then dropped, so five weeks of "the mail server
refused the message" hid `535` vs `550 SMTP disabled` vs a lockout. Worst, historically: a message
whose login, envelope sender and From were three mailboxes, **all three invented**.

**A SECOND SHAPE, 09-08, THE MOST EXPENSIVE YET: A CHECK THAT EXEMPTS ITSELF.** `replyVerdict` answers
reachability by real DNS lookup "because everybody — us included — assumed a reply had somewhere to
land" — and returned `yes` for OUR host without looking, green while every reply bounced. Alongside
it, the credential fields read `process.env.SMTP_PASS` while `MW_SENDING_POOL` is what authenticates.
**A diagnostic must inspect the thing that RUNS, not the thing that looks like it.**

**A THIRD: a value hard-coded as a module CONSTANT where it should have come from the record** — the
DKIM selector, the bounce host built from it, the tracking base falling back to the apex. Each read
correctly alone; each was wrong the moment a second brand or host existed. **Anything that identifies
WHOSE something is cannot be a module-level constant.**

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM — and if none exists, BUILD IT BEFORE THE THIRD GUESS.** **A diagnostic only its author can read is not a diagnostic**: the SMTP stage, the refusal line and the enrichment probe were each gated behind a sign-in that was itself broken, and on 09-08 a verdict told a signed-out reader to compare an admin-only field. **A VERDICT MUST NOT OPEN WITH A CAUSE ITS OWN NEXT SENTENCE DISPROVES** — the refused-login report led with "THE SERVER REFUSED THE PASSWORD… do not match" and closed with "the server is not the one that holds this mailbox", and the opening line is the one a reader acts on. **And read the output, never recall it.**

**A second class, about tests rather than code: a check that passes — or FAILS — for a reason
unrelated to what it tests.** TWENTY-SIX, and 09-08 added four more, every one of them mine: each
subject in a DSN list matched a second pattern, so deleting the Postfix wording stayed green; a
try/catch was unreachable until the router became injectable, and an untested catch is a comment; the
two signals in the outline check each covered for the other; and **three separate assertions matched
the WRONG OCCURRENCE of a string that appears twice in a file.** Worst historically: a test asserting
`jose` IS ESM-only — the hazard recorded as a fact of life, green through the whole second outage,
able to fail only on the repair. **A test that passes while production is down, and would fail on the
fix, is worse than no test. A MUTATION THAT CHANGES NOTHING PROVES NOTHING** — one "survived" as
`some()` → `filter().length >= 1`, the same program.

**A DIAGNOSTIC IS AN ENDPOINT TOO** — `/api/health/email` authorised `?send=` but left the REPORT open, twenty recipient addresses beside the SMTP host and username. **AND A PANEL MUST NOT BLAME THE OWNER FOR ITS OWN FAILED REQUEST.**

**A test that passes is not evidence until something has broken it.** Drive the real handler and assert on a value only the real path can produce. EIGHT tests have failed on their own comments, and one on a STRING LITERAL. Strip comments AND literals before scanning (`codeOf()`).

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session and carries
the additive-only law, the margin floor and the no-fabrication rule. Only here:

- **Verify before shipping:** typecheck, build, layers, lint, tests — then MUTATE the new
  tests, AND READ THE CI RUN. A test that has never failed is not evidence.
- **`npm run verify` is NOT the CI gate** — it does not run `npm audit`, so an advisory can turn CI red
  on a commit that changed nothing. Read the run. **And a security step must never sit behind a step
  that can fail on its own** — `if: always()`.
- **`requireAuth` returning `ok` does NOT mean the scope was checked** — with no Firebase Admin it
  returns `{ok:true, enforced:false}` first. Any surface touching real customer data needs `enforced`.
- **Drive the routes, do not read them** — a production build on `next start` found an open endpoint
  and a 404 on the paid-conversion path that no reading had; the bounce collector was proved against a
  real IMAP server and a real Postfix notice, which is what found two defects in the classifier.
- **Anything scoped to a tenant is scoped by the RECORD, never by a constant** (§6), and a scoping
  change is followed through every reader.
- **Point our own audit at our own pages** before claiming the marketing surface is fine.
- **The owner does not use, and will not be offered, a third-party ESP** — MarketWar's own sending
  pool is the product. And **never invent a company detail** (number, address, phone, handle, trading
  name): a blank is recoverable, a fabricated one on a page that sells is not.
- **Never tell the owner to do by hand what the platform should do for them.** Asking somebody to open
  a mailbox to read a bounce is a debugging step, not an answer; at a thousand customers it is absurd.
  When the answer is "go and look", the defect is that nothing is looking.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` file-by-file, never
  by merge. The branches no longer differ on anything — a diff between them is a mistake, not a plan.
