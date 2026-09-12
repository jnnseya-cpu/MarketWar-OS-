# MarketWar OS — current state

**This file describes where things stand right now. It is REPLACED, never appended to.**
Read this one first. Companions are listed in `CLAUDE.md`. Updated: 2026-09-12.

## 1. What this is

An AI marketing operating system for small businesses. Every engine behind one subscription, priced
in credits, deployed at marketwaros.com. Live-tested on **AxionOS** (evandeli.com, UK trades),
**VeryX** (veryxjnn.com) and **KODA** (kodajnn.com, mobile-money verification, DRC). Next.js,
TypeScript strict, three layers enforced by `scripts/check-layers.mjs`. 250 backend modules, 186 API
routes, 69 dashboard pages, **1,858 tests**.

**IT RUNS ON VERCEL** — `vercel.json` holds the ten crons, DNS is Vercel's, and
`PRODUCTION-ARCHITECTURE.md` adopts Hostinger → Cloudflare → Vercel → Firebase. `apphosting.yaml`
describes a Firebase App Hosting deployment that is NOT the live one; that duplication became a
defect (§5.5).

**`overrides.jose` IS LOAD-BEARING** — without it a CommonJS dependency require()s an ESM package and every route importing firebase-admin dies at module load. Read §5.0 before touching it or `engines`. **Both branches are IDENTICAL, on Next 15 / React 19** (landed 08-28) — mirror file-by-file, never by merge.

## 2. The one number that matters

**Customers acquired: 0. Messages sent to prospects: 1.**

**THE SEND WORKS AS OF 2026-09-08 — "1 sent · 0 failed", after five weeks.** The cause was
`SMTP_HOST` naming a server that does not hold the mailbox (§5.1). That number moves off 1 when
delivery is confirmed and the first real campaign runs; `/dashboard/acquisition` holds the count.

`GO-TO-MARKET-MarketWar-OS.docx`, `FACEBOOK-LAUNCH-CAMPAIGN.docx` and `brand/email-signature.html` are the sales surface; both documents parse their prices out of `src/`. **`docs/MarketWar-OS-Customer-Deck.pdf` (§133, rewritten §134) is the customer-facing deck** — twelve 16:9 slides, every figure derived, every slide rendered and looked at, and `npm run deck:doc` FAILS the build on a testimonial, a customer count, a guarantee, an invented legal entity or a reference to "our customers". It is written in second person around scenes the reader recognises, and it leads with the objection ("you have never heard of us") answered by the free audit. The older `.pptx` was never opened in a renderer here and is superseded by it.

## 3. What works with NO keys at all — no provider, no card, no configuration

- **The free website audit** (`/audit`) — a real crawl, **31 checks as of today** (always DERIVED from
  `AUDIT_COPY`; this line said 30 while the code said 31, which is the defect in miniature), the three WORST free, each finding carrying its cost and fix, the lead recorded as an inbound
  prospect. No account, no card; `npm run ads:verify` fails if six adverts stop being true. **Confirmed
  live 09-03** — construxvg.com, 83→92/100. Every article clears **≥90 or is held as a draft**, by that
  same crawler against the real page, re-swept daily (§119).
- **The client approval portal** — a signed, expiring link a client opens with no account. **The go/no-go answer itself** (`/api/health/live` → `launch`): consequences, never variables.
- **The command bar**, **ad canvas**, **pricing and margin arithmetic**, **paid-media guardrails**, **payout engine**, **emergency stop** — every refusal computed, never guessed. **The publication ledger**: a lost publish response is uncertain, so the next attempt asks the channel rather than posting twice. Plus eight pre-publish checks, channel health, versions and restore, creative fatigue, the audit log, teams, Sentinel, 13 articles.
- **Named groups in the customer vault (§110)** — a deliberate label (segments stay COMPUTED), a
  contact in several, **"not in any group" selectable**, empty means everyone, and the button's number
  is the SENDABLE count. **The preview computes the SAME audience (§116)** — it did not.
- **Contact Hunter + Contact Finder** — on `lead-harvest`'s 12 checks and UK/EU/US lawful basis. **Confirmed / inferred / provider never convert.** **The Stripe webhook** refuses forgery, replay, stale timestamps and a tampered body; five CONCURRENT deliveries of one event credit exactly once.
- **ONE ENRICHMENT CHAIN (§§128–129)** — the vault and Contact Hunter share it. Free crawl → Companies House → Hunter → Apollo, in COST order, and a row carrying only a NAME has its domain resolved by the chain itself. The paid pass is charged separately (`enrich_paid`, derived from the dearest supplier) and budgeted at half of it, so the margin floor is code. It was two chains: the vault ran Apollo-first and could not reach Hunter at all.
- **CORRECT ON THE FIRST RENDER** (`shared/render-brief.ts`) — a brief that will come back wrong is REFUSED before a penny moves. **A PROVIDER'S REFUSAL IS READ, NOT GUESSED AT** (`shared/provider-failure.ts`) — credit before rate limit (both 429, opposite remedies); an unrecognised refusal keeps the provider's words and offers NO remedy.
- **STAFF ARE NOT BILLED FOR THEIR OWN PLATFORM** — `wallet.meteringExempt`, asked by `meterAction` AND `spendAcus`; a refund returns what was TAKEN, so an exempt render cannot mint ACUs. **§50 the paid-boost ladder** — which post earns a budget, against the brand's own median; refuses to promote without conversion tracking; never spends.
- **The provider waterfall** — one name and company through every supplier in COST order inside 14s. Free first; **only calls that ran AND returned are charged**; every bought address is `provenance: "provider"`, because `confirmed` means WE read the page.

**EVERY PUBLIC CLAIM IS BOUND TO THE CODE OR TESTED AGAINST IT** (08-26). Landing stats, plan prices/ACUs, agent cards, answer pages — twelve tests. **What broke was always what somebody TYPED.**

## 4. What is dark without keys, and the one action for each

`/api/capabilities` is the live answer for any deployment; trust it over this table. **"It found nothing"
has seven identical-looking causes, so the RUN names its own (§§131–132) on the vault screen: a key that
is SET and refused never reads as missing, and a SUPPLIER that refused never reads as one with no data.**

| Capability | One action |
|---|---|
| AI, images, video | `ANTHROPIC_API_KEY` set. **THE ACU WALLET IS THE GATE, NOT `AI_MONTHLY_CEILING_USD`** — every AI route requires auth AND `meterAction`; the only unmetered path (the daily blog cron) needs BOTH `BLOG_DAILY_ENABLED=1` and `CRON_SECRET`, neither set. |
| Scheduled work | **`CRON_SECRET` (unset — every scheduled path is dark, including bounce collection)** · Newsletter: `NEWSLETTER_SECRET` |
| Sending email | **WORKING** as of 09-08. See §5.1 for what is left: delivery confirmation and per-domain alignment. |
| **Collecting bounces** | **`MW_BOUNCE_IMAP_HOST`** — user and password default to `SMTP_USER`/`SMTP_PASS`, the mailbox failures already arrive at. Without it nothing reads them and a human has to open a mailbox, which is not a platform (§118). |
| Replies into the Inbox | `MW_REPLY_HOST` — a subdomain whose MX points at an inbound intake. Until then no reply address is issued and Reply-To falls back to the customer's own From (§114). |
| Client approval links | `PORTAL_LINK_SECRET`, falling back to `HUMAN_CHECK_SECRET`, which IS set. With NEITHER, issuing is refused rather than minting a link that verifies on one server and fails on every other. |
| Stripe, Firebase Admin | Both configured and verified live. `FIELD_ENCRYPTION_MASTER_KEY` set, unblocking PII writes that were being refused in silence. |
| **Trading identity** | **`NEXT_PUBLIC_LEGAL_ENTITY_NAME` + `NEXT_PUBLIC_REGISTERED_ADDRESS` are a LAUNCH BLOCKER** for a UK site selling to the public. |

## 5. Outstanding — the whole list, deduplicated

**STILL OPEN: 1, 2, 3, 4, 5.** **0 is CLOSED — `require(esm)`, which took production down TWICE**;
kept because the first fix did not hold. `firebase-admin` → `jwks-rsa` (CJS) → `jose@6` (pure ESM) dies
at MODULE LOAD below Node 22.12. **`engines: 22.x` did not fix it — a pin somebody else must agree to
is not a fix**; `overrides.jose: ^5` did.

**1. MAIL: SENDING IS FIXED; DELIVERY IS NOT CONFIRMED (§115, §118).** Five weeks of `535 5.7.8` and
three password resets were never the password: **a 535 at the auth stage says a server refused the
credential, not that it is wrong**, and `SMTP_HOST` named a machine that does not hold the mailbox.
Left: (a) **the message was not seen arriving** — set `MW_BOUNCE_IMAP_HOST` so the platform reads the
delivery notice itself instead of a human opening a mailbox; (b) **alignment** — the From was on one
domain while the login was on another, so SPF authenticates the wrong one. `pickNode` now prefers a
node ON the sending domain, so **`MW_SENDING_POOL` with one node per domain** closes it. Still owed:
`EMAIL_FROM`.

**2. STRIPE WEBHOOK — URGENT, STRIPE DISABLES IT ON 13 SEPTEMBER.** Stripe: 73 deliveries to
`https://www.marketwaros.com/api/webhooks/stripe` had **"other errors"** since 4 September, zero
successes. **That rules out the diagnosis this file carried.** A wrong signing secret is a 400 and our
own refusal to credit without a store is a 500; "other errors" is Stripe's category for an exchange
that produced NO HTTP STATUS AT ALL — DNS, TLS, or a refused connection — so it fails BEFORE our code
runs, and no check reasoning from inside the process can see it. No commit touched that path near the
4th. `/api/health/stripe` now DELIVERS TO OUR OWN ENDPOINTS the way Stripe does — signed, identifying
as Stripe, redirects UNFOLLOWED because Stripe does not follow them — and reports what Stripe would
have seen. The route also records a receipt the instant a signature VERIFIES, and a live key with no
receipt is a **blocker**. **To close:** open `/api/health/stripe`, read `selfDelivery`, point the
Stripe endpoint at whichever address answers 2xx, then send one test delivery.

**3. THE COMMERCIAL LOOP IS PROVEN IN PARTS, NEVER END TO END WITH A BUYER.** `npm run drive:loop`
walks it against a running production build and reports what it could NOT exercise rather than passing
it: 5 proven, 4 not exercisable here, 0 broken. **Not provable here:** a live checkout URL, a credit
landing in Firestore, the crawl. **To close WITHOUT a customer:** clear §5.2, then Send test webhook.

**4. THE TRADING IDENTITY IS NOT ON THE SITE.** Four `NEXT_PUBLIC_LEGAL_*` values, two a UK launch
blocker (§4), plus phone, postal address and social profiles. **I will not invent any of these** — a
fabricated company number on a page that sells is worse than a blank one.

**5. FIREBASE APP HOSTING vs VERCEL — AN OWNER DECISION, NOT A BUG.** A brief asked to stabilise the
platform on App Hosting; it already runs in production on Vercel. Migrating abandons a working
deployment AND the ten `vercel.json` crons, which App Hosting has no equivalent for. **I have not
migrated anything.** The duplication already cost five weeks: `apphosting.yaml` has held the correct
`SMTP_HOST` the whole time, in the config for the other platform, which nobody compared. A test now
asserts every variable either config declares is in `ENV_CATALOGUE`.

**CLOSED — names only. The detail is `REQUIREMENTS-COVERAGE.md`; that file is what archaeology is for.**
*09-11 (§§120–125):* a size cap on a READ rule denied every tenant its own files · two CRITICAL RCE
advisories under a green gate that had never run `npm audit` · eight fabricated fixtures nothing
imported · the Stripe diagnostic handing the account's other endpoints to strangers.
*09-08 (§§114–118):* the reply path pointed at hosts that cannot receive mail, and its own reachability
check exempted the one domain it should have tested · `MW_SENDING_POOL` silently overrode
`SMTP_USER`/`SMTP_PASS` while the diagnostic named the variable being edited · an OUTLINE previewed as
a finished email for 836 people, counting a different audience. *Earlier (§§103–113):* named vault
groups · campaign failover · per-brand DKIM selectors · an anonymous GET on
`/api/email/suppression-repair` · video failures charging without refunding · **we failed the checks we
sell** · Node 20 in production · 91 of 133 env variables invisible (119 catalogued now).

**Owner actions (nothing in code can substitute):**
1. **`CRON_SECRET`** — unset, so every scheduled path is dark INCLUDING bounce collection. Set it with `MW_BOUNCE_IMAP_HOST` and the platform starts reading its own delivery failures.
2. **`PLATFORM_ADMIN_EMAILS`** — set ONCE; makes the owner `executive`, never metered. Without it the `/api/health/*` reports are unreadable, which is how a diagnostic becomes useless.
3. Open `/api/health/live` after every change — `envPresent`/`envMissing`, `build.commit` and `buildBuiltAt` are the only proof the running build received it and was built AFTER the change.
4. **Send the first ten messages** (`/dashboard/acquisition` has the text per brand), then the first Facebook campaign (`npm run ads:doc`): Traffic, not Awareness, five custom audiences built FIRST.
5. **`SERPER_API_KEY` — REJECTED 401/403, and it is the CHEAP half of email finding (§129).** It turns a
   business name into a website for nothing. Without it every row buys its domain from Apollo at 4 ACUs
   first, which works and costs four times more than it needs to.

**No feature section of the growth spec is MISSING** — what remains is partial rows; see
`GROWTH-ENGINE-COVERAGE.md`. **Not built:** §80 agent message bus (rejected), §14 calendars, §21 carousels.

**Security debt — REVISED; the old line here said "6 moderate, NO high" and was wrong.** `npm audit
--omit=dev` found **two CRITICAL** advisories in Next 15.5.23 — unauthenticated RCE in the AVIF image
optimiser (GHSA-2xp9-vwfh-vxw4) and on Windows hosts — plus a HIGH in sharp. Patched inside the same
minor lines (15.5.25 / 0.35.4 / firebase-admin 14.3); a test holds the floors. **`npm run verify` now
runs `check:advisories`** — it never did, which is how "verify passes" meant nothing about what ships.
Two moderates remain inside `@google-cloud/storage`, which pins `gaxios ^6` where no patch exists; the
advisory needs a `buf` argument gaxios never passes. In `KNOWN_UNFIXABLE`, not silenced.

**Rules files.** All three deny by default, no blanket allow. **`storage.rules` carried a real
defect**: a size cap on a combined read/write rule, and `request.resource` is null on a READ, so every
client read of a tenant's own files was denied. Split in two. **NOT EMULATOR-VERIFIED** (no firebase
CLI here) — guarded statically, four mutations killed.

**Invented data.** `demo.ts` said "Every dashboard renders from this", false for a long time. EIGHT of
thirteen exports were imported by nothing — fabricated customers with names, phones and emails,
invented messages, named competitors, a brand roster. Removed: unreachable code is no capability. The
five that remain feed the landing page's charts only. **A test holds that boundary** — no dashboard or
API route may import it, no person-shaped record may return, no dead fixture may accumulate.

## 6. The defect class that keeps recurring

**A value that exists on one side of a boundary and is never carried across.** THIRTY-ONE. Newest
(09-11): the webhook receipt proving the money path works had to be handed to the launch report, and
mutating that one line away was the mutation that survived longest. Before: the gateway returned
`truncated` and the AI writer never read it; groups reached the send path and not the preview, so two
screens computed different audiences; the server's refusal line was read once and dropped, so five
weeks of "the mail server refused the message" hid `535` vs `550`. Worst historically: a message whose
login, envelope sender and From were three mailboxes, **all three invented**.

**A SECOND SHAPE: A CHECK THAT EXEMPTS ITSELF — or can only see from inside.** `replyVerdict` returned
`yes` for OUR host without looking; the go-live report called the money path fine because the secret
was PRESENT; every webhook check reasoned from inside the process, the one place that cannot see an
endpoint Stripe never reaches. **Inspect the thing that RUNS, from where it is called.**

**A THIRD: a value hard-coded where it should be DERIVED** — the DKIM selector, `MAIN_DOMAIN`
defaulting to a host nobody confirmed serves, and a vault row priced at 2 ACUs while one Hunter search
costs 4. **A floor nobody can compute is a floor nobody holds.**

**A FOURTH, 09-11: A CLAIM THAT STOPPED BEING TRUE AND WAS READ AS IF IT WERE.** `demo.ts` said every
dashboard rendered from it long after they stopped; this file blamed the webhook on a wrong secret, and
Stripe says those deliveries produced no HTTP status at all. **Re-read the evidence when it arrives.**

**ASK FOR THE DIAGNOSTIC OUTPUT BEFORE REASONING FROM THE SYMPTOM — and if none exists, BUILD IT BEFORE THE THIRD GUESS.** **A diagnostic only its author can read is not a diagnostic**: the SMTP stage, the refusal line and the enrichment probe were each gated behind a sign-in that was itself broken. **A VERDICT MUST NOT OPEN WITH A CAUSE ITS OWN NEXT SENTENCE DISPROVES.** **And read the output, never recall it.**

**A second class, about tests rather than code: a check that passes — or FAILS — for a reason
unrelated to what it tests.** TWENTY-SIX, plus four on 09-08 and two on 09-11, every one of them mine.
Newest: the storage-rules check parsed line by line while the rule spans three, so the exact defect
sailed back in; its replacement then exempted the deny-all rule on the text "if false" when the
captured condition is the bare word `false`. Worst historically: a test asserting `jose` IS ESM-only,
green through the whole second outage, able to fail only on the repair. **A test that passes while
production is down, and would fail on the fix, is worse than no test. A MUTATION THAT CHANGES NOTHING
PROVES NOTHING.**

**A DIAGNOSTIC IS AN ENDPOINT TOO, AND FIXING ONE INSTANCE LEFT ITS TWIN** — `/api/health/email` authorised `?send=` but left the REPORT open; `/api/health/stripe` then answered anonymously with the account's webhook endpoints, naming the other services this business runs on, and its payment volume. Both redact for a signed-out caller now and keep the fixing part public. **A PANEL MUST NOT BLAME THE OWNER FOR ITS OWN FAILED REQUEST.** **And a test that passes is not evidence until something has broken it** — drive the real handler and assert on a value only the real path can produce. **A HARNESS MUST TELL "IT REFUSED ME, RIGHTLY" FROM "IT IS BROKEN"**: `drive:loop` first read three correct refusals as product faults. EIGHT tests have failed on their own comments and one on a STRING LITERAL; strip both (`codeOf()`).

## 7. Rules that outrank preference

Full standard: `docs/ENGINEERING-DIRECTIVE.md`. `CLAUDE.md` loads every session and carries
the additive-only law, the margin floor and the no-fabrication rule. Only here:

- **Verify before shipping:** typecheck, build, layers, lint, tests — then MUTATE the new
  tests, AND READ THE CI RUN. A test that has never failed is not evidence.
- **`npm run verify` now runs `check:advisories`** — high or critical in a SHIPPED dependency fails the
  gate. It did NOT before, which is how two criticals sat under a green gate. **An unreachable
  registry prints UNKNOWN and does not pass.** **A security step must never sit behind a step that can
  fail on its own** — `if: always()`.
- **"IMPENETRABLE" IS NOT A CLAIM ANYONE CAN MAKE, AND WILL NOT BE MADE HERE.** What is true is
  narrower and checkable: deny-by-default rules, server-side tenant scoping, field encryption at rest,
  no secret in repo/bundle/log/URL, a gate that fails on a shipped advisory. **End-to-end encryption
  does not apply where the server must read the data**; `FIELD_ENCRYPTION_MASTER_KEY` is the control.
- **`requireAuth` returning `ok` does NOT mean the scope was checked** — with no Firebase Admin it
  returns `{ok:true, enforced:false}` first. Any surface touching real customer data needs `enforced`.
- **Drive the routes, do not read them** — a production build on `next start` found an open endpoint
  and a 404 on the paid-conversion path that no reading had.
- **Anything scoped to a tenant is scoped by the RECORD, never by a constant** (§6), followed through
  every reader. **Point our own audit at our own pages** before claiming the marketing surface is fine.
- **The owner does not use, and will not be offered, a third-party ESP** — MarketWar's own sending
  pool is the product. And **never invent a company detail** (number, address, phone, handle, trading
  name): a blank is recoverable, a fabricated one on a page that sells is not.
- **Never tell the owner to do by hand what the platform should do for them.** When the answer is "go
  and look", the defect is that nothing is looking.
- Push to `claude/marketwar-os-platform-xrgg5r` and mirror to `main` file-by-file, never
  by merge. The branches no longer differ on anything — a diff between them is a mistake, not a plan.
