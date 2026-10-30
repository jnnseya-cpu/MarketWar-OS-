# Every key this platform reads, and the order to add them in

**129 environment variables.** 95 of them can be typed into the Admin Control
Centre (`/dashboard/admin` → API keys); **34 cannot** and must go in Vercel →
Settings → Environment Variables, for reasons given below.

Nothing here is a guess. Every name, every "what it unlocks" and every "where to
get it" is read from `src/shared/env-catalogue.ts`, which a test binds to the
actual environment reads in the source — a variable added tomorrow is in that
catalogue tomorrow or CI fails. The GO/NO-GO verdict is computed by
`src/backend/launch-check.ts`, the same function `/api/health/live` runs.

> **ONE THING THIS DOCUMENT CANNOT TELL YOU: what is already set on
> marketwaros.com.** This container has no DNS, so the live deployment cannot be
> read from here. **Open `https://marketwaros.com/api/health/live` and read
> `envPresent` / `envMissing`** — that is the only authoritative answer, and it
> also returns the `launch` verdict in the same response. The tiers below say
> what each key does; that URL says which you still need.
>
> From `docs/STATE.md`, these were confirmed working earlier and are assumed
> set: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_CLIENT_EMAIL`,
> `FIREBASE_PRIVATE_KEY`, and the `SMTP_*` trio. Confirm on that URL rather than
> trusting this paragraph.

---

## TIER 0 — the three things that block a public launch

Run with an empty environment on a production deployment, the launch gate
returns **3 blockers**. A blocker means a real person gets hurt: money taken
with nothing delivered, personal data refused in silence, or a legal obligation
unmet. These are not preferences.

| # | Key | Where | Why it blocks |
|---|---|---|---|
| 1 | **`ANTHROPIC_API_KEY`** | Admin screen | *No AI provider — the agents cannot run.* Without any AI key the whole platform runs in deterministic demo mode, which is most of what a customer is paying for. `OPENAI_API_KEY` or `GEMINI_API_KEY` also satisfies it. **console.anthropic.com → API keys** |
| 2 | **`FIELD_ENCRYPTION_MASTER_KEY`** | **Vercel only** | *Personal data cannot be stored, and nothing says so.* PII writes are refused in silence. It cannot live in the admin screen because it is the key that decrypts that store. `openssl rand -hex 32`. **Choose it once — rotating it makes existing encrypted fields unreadable.** |
| 3 | **`NEXT_PUBLIC_LEGAL_ENTITY_NAME`** + **`NEXT_PUBLIC_REGISTERED_ADDRESS`** | **Vercel only** | *The trader behind the site is not named.* A UK site selling to the public must do this. Add **`NEXT_PUBLIC_COMPANY_NUMBER`** and **`NEXT_PUBLIC_VAT_NUMBER`** if they apply. These are the exact names `components/LegalEntity.tsx` reads — **any other spelling satisfies nothing**, which is a mistake the gate itself used to make. |

With those added (and Stripe + Firebase already live), the gate returns
**0 blockers, GO**. I verified that by driving `launchReport` with exactly that
set.

---

## TIER 1 — the five warnings worth clearing the same afternoon

None of these harms a customer on its own. All five are free, and four are a
random string you invent.

| Key | Where | What is wrong until you set it |
|---|---|---|
| **`CRON_SECRET`** | Admin screen | **Every scheduled path is dark** — nightly autopilot, the daily blog, weekly trends, AI-visibility sweeps, and bounce collection. Generate a random string and set the same value on the scheduler. |
| **`HUMAN_CHECK_SECRET`** | Admin screen | The human gate **observes but blocks nothing**, and signup challenges break across instances because each one signs differently. |
| **`PLATFORM_ADMIN_EMAILS`** | Admin screen | **Nobody can reach the admin surfaces**, so the `/api/health/*` reports are unreadable — which is how a diagnostic becomes useless. Set it once; it only takes effect on an address Firebase has verified. |
| **`AI_MONTHLY_CEILING_USD`** | Admin screen | No ceiling on the platform's **own** AI spend — crons, demos, your testing. It only ever stops *unpaid* work; a paying customer's run is exempt. Set it to e.g. `50`. |
| **`EMAIL_TRACKING_SECRET`** | Admin screen | Open and click tracking links are sealed with a **fallback** secret. Set it *before* a large send: rotating it later invalidates links already delivered. |

Also worth one minute: a **second AI provider**. One provider is a warning in
its own right — no failover when that provider is slow or down.

---

## TIER 2 — the twelve secrets you generate yourself (free, five minutes)

`openssl rand -hex 32` for each. No vendor, no account, no cost. Every one of
them turns a security surface from *observing* to *enforcing*.

| Key | Unlocks |
|---|---|
| `CRON_SECRET` | all scheduled work (also Tier 1) |
| `HUMAN_CHECK_SECRET` | the human gate (also Tier 1) |
| `FIELD_ENCRYPTION_MASTER_KEY` | PII at rest (also Tier 0 — **Vercel only**) |
| `EMAIL_TRACKING_SECRET` | signed open/click links that cannot be forged |
| `NEWSLETTER_SECRET` | authorises the weekly newsletter cron |
| `AUDIT_QUOTA_SALT` | salts the hash of a visitor's IP in the free-audit quota |
| `PORTAL_LINK_SECRET` | signs client approval portal links (falls back to `HUMAN_CHECK_SECRET`) |
| `CONNECTIONS_SECRET` | encrypts third-party connector credentials |
| `CREATOR_LEDGER_SECRET` | authorises creator-ledger operations |
| `POSTBACK_ROOT_SECRET` | signs conversion postbacks so they cannot be forged |
| `VIDEO_WORKER_SECRET` | the self-hosted render worker — set the **same** value on the worker |
| `META_VERIFY_TOKEN` | the token Meta echoes back when verifying your webhook — enter the same value in Meta |

`SEED_PASSWORD` is the thirteenth and is **for local development only. Never set
it in production.**

---

## TIER 3 — one key per capability, each one a module that is currently dark

Everything here is optional in the sense that the platform runs without it, and
the surface that depends on it **says so before the work rather than after**.
Add them in the order your customers will notice.

### Sending and deliverability

**MarketWar OS is the email service provider.** There is no third-party sender
to fall back to; mail leaves on our own authenticated pool.

| Key | What is dark without it |
|---|---|
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | sending at all — audit reports, campaigns, receipts. *Reported working since 09-08.* |
| `EMAIL_FROM` | the visible From address; must be one the relay may send as |
| `MW_SENDING_POOL` | a JSON array of sending nodes, for rotating across several; overrides the single-host variables |
| `MW_BOUNCE_ADDRESS` | the envelope return path — **must be a mailbox that exists** or failure notices vanish |
| `MW_BOUNCE_IMAP_HOST` | **collecting delivery failures automatically.** Without it nothing reads the bounces, so a dead address is retried for ever. Needs `CRON_SECRET` too |
| `MW_SEED_MAILBOXES` | **measuring where our mail actually lands.** Create one free mailbox per receiver and generate an app password for each |
| `MW_REPLY_HOST` | **until this is set no reply address is issued** and campaigns reply to the wrong place. Publish the MX first |
| `MW_SENDING_HOST` / `MW_SENDING_IP` / `MW_SPF_INCLUDE` / `MW_MX_HOST` / `MW_BOUNCE_HOST` / `MW_DMARC_RUA` / `MW_NODE_DAILY_CAP` | the DNS records Sending Domains tells a customer to publish, and the per-node reputation cap |
| `EMAIL_WEBHOOK_SECRET` | verifying inbound delivery webhooks |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_CONCURRENCY` | defaults to 587, implicit TLS off, and your mail host's connection limit |

### Finding and enriching prospects — in cost order

The enrichment chain runs **cheapest first**, so each key you add lowers the
cost of the one above it.

| Key | What it buys | Note |
|---|---|---|
| `COMPANIES_HOUSE_API_KEY` | UK company registry | **free** |
| `SERPER_API_KEY` | turns a business name into a website for almost nothing — the **cheap half of email finding**. Without it every row buys its domain from Apollo at 4 ACUs | *Previously rejected 401/403 — re-check the key* |
| `LEADMAGIC_API_KEY` | the cheapest email lookup **and the only source of a mobile number**, which is the only route to WhatsApp | confirm the per-credit price before relying on the margin arithmetic |
| `HUNTER_API_KEY` | the email finder **and a real mailbox verifier** | free tier to test, then bulk credits with no subscription |
| `APOLLO_API_KEY` | verified business emails, last in the waterfall | dearest |
| `SCRAPER_API_URL` | raises the hit rate of the free source | |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Search Console data for the SEO engines | |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` | reads Search Console **and** Business Profile as you, which a service account cannot | all three or none |

### Media — images, video, voice, presenters

| Key | What is dark without it |
|---|---|
| `OPENAI_API_KEY` | photoreal image backgrounds (gpt-image-1), Sora video, Whisper transcription. **Needs credit on the account, not just a key** |
| `GEMINI_API_KEY` | Veo video rendering |
| `ELEVENLABS_API_KEY` | voiceovers, voice cloning, dubbing — **and the cloned voice on a presenter video.** Check the key's **scopes**, not just its value |
| `HEYGEN_API_KEY` | presenter video, the avatar/voice roster, lip-synced translation, **and the continuous 60-second commercial**. The API is on the paid tiers |
| `DID_API_KEY` | presenter video through D-ID — **cheaper**, but no roster, no translation, and **it cannot render a continuous commercial** (one scene per request) |
| `SYNTHESIA_API_KEY` | presenter video through Synthesia; **can** render a commercial. Enterprise plans only |
| `FIREBASE_STORAGE_BUCKET` | **Vercel only.** Media hosting. Without it every render hands over the provider's own expiring link instead of a file we keep |
| `VIDEO_WORKER_SECRET` | trim, clips, burned captions, upscale, on your own worker |
| `FFMPEG_CLOUD_API_KEY` / `FFMPEG_CLOUD_URL` | a hosted renderer instead — a new supplier and a new bill |
| `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL` | the default voice and model when the customer has not chosen |

### Publishing and commerce

| Key | What is dark without it |
|---|---|
| `ZERNIO_API_KEY` + `ZERNIO_WEBHOOK_SECRET` | social publishing to 15 channels, and verifying its callbacks |
| `FB_APP_ID` + `FB_APP_SECRET` | all Meta publishing authorisation — Instagram and Facebook both run on it |
| `WHATSAPP_TOKEN` | WhatsApp messages from the automation and inbox surfaces |
| `META_GRAPH_VERSION` | pins the Graph API version instead of following the default |
| `SHOPIFY_WEBHOOK_SECRET` / `WOO_WEBHOOK_SECRET` | verifying order webhooks for commission |
| `BITRIPAY_API_KEY` | payouts to creators in the Creator Engine |
| `ONFIDO_API_TOKEN` or `PERSONA_API_KEY` | identity verification **before a payout** |
| `SANCTIONS_API_KEY` | sanctions screening before a payout |

### Measurement

| Key | What is dark without it |
|---|---|
| `META_CAPI_ACCESS_TOKEN` | server-side conversion reporting, so a payment **still counts when an ad blocker eats the pixel**. Set `META_CAPI_TEST_CODE` first, watch the events land in Test Events, then remove it — while it is set, nothing counts as a real conversion |
| `NEXT_PUBLIC_META_PIXEL_ID` | **Vercel only.** The browser-side pixel |
| `NEXT_PUBLIC_GTM_ID` | **Vercel only.** Google Tag Manager |
| `INDEXNOW_KEY` | announces new and changed pages to Bing, Yandex, Seznam and Naver immediately. **Invent one**: any 8–128 letters, digits or hyphens; it only has to stay the same |

---

## TIER 4 — facts about the company and the domain (no vendor, no cost)

| Key | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` · `NEXT_PUBLIC_PRODUCTION_URL` · `APP_URL` · `MW_SITE_HOST` | your own domain. The first two are **Vercel only** |
| `NEXT_PUBLIC_VAT_NUMBER` | from the HMRC registration certificate |
| `NEXT_PUBLIC_COMPANIES_HOUSE_URL` | the full URL of your register entry — **the strongest entity signal** available |
| `NEXT_PUBLIC_SOCIAL_LINKEDIN` · `_X` · `_FACEBOOK` · `_INSTAGRAM` · `_YOUTUBE` | the full profile URLs, bound into the structured data as `sameAs`. **Leave one unset rather than guessing** — a `sameAs` pointing somewhere you do not control is worse than none |
| `MW_TRACK_HOST` / `MW_TRACK_URL` | the subdomain tracking links point at |
| `REQUIRE_LIVE` | **set it to `1` on any deployment serving real customers.** It refuses to serve deterministic demo AI output to a paying person |

---

## TIER 5 — tuning defaults that are safe to ignore

`AI_GATEWAY_ORDER`, `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`,
`OPENAI_IMAGE_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_VIDEO_MODEL`,
`GEMINI_VIDEO_MODEL`, `HUMAN_CHECK_BITS`, `BLOG_DAILY_ENABLED`,
`META_GRAPH_VERSION`, `MW_BOUNCE_IMAP_PORT`, `MW_BOUNCE_IMAP_USER`,
`MW_BOUNCE_IMAP_PASS`, `MW_BOUNCE_IMAP_MAILBOX`.

Plus the four cost dials — `RENDER_COST_PER_MIN_GBP`,
`VIDEO_COST_PER_SECOND_GBP`, `VIDEO_COST_PER_SECOND_GBP_VEO`,
`VIDEO_COST_PER_SECOND_GBP_SORA`. **Do not set these from a guess.** They are
the same kind of number the reconciliation panel now corrects properly: open
*Admin → What we pay → Reconcile a line against a real invoice* and let the
price re-derive from a real bill.

---

## The 34 that cannot live in the admin screen, and why

A screen that accepts a key it cannot use is worse than one that refuses it, so
each of these is refused there with its reason.

**The Firebase bootstrap (16).** The key store *is* Firestore, so Firebase Admin
must already be connected before anything in that store can be read. Reading a
key out of Firestore to connect to Firestore is a paradox:
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PROJECT_ID`,
`FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_STORAGE_BUCKET`,
`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`,
`GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, and the seven
`NEXT_PUBLIC_FIREBASE_*` values.

**The master key (1).** `FIELD_ENCRYPTION_MASTER_KEY` decrypts that store.
Keeping it inside what it decrypts cannot work, and storing it unencrypted would
expose every other key there.

**Everything `NEXT_PUBLIC_*` (17 more).** Next.js **inlines** these into the
browser bundle when the site is *built*, so a value saved now cannot change a
string compiled last week. Accepting one would be a reported success that never
happened.

---

## How to check your work

1. **`https://marketwaros.com/api/health/live`** — `envPresent`, `envMissing`,
   the `launch` verdict, and `build.commit` / `buildBuiltAt`, which are the only
   proof the running build actually received what you set.
2. **`/api/capabilities`** — the seven capabilities, live or dark, each with the
   single action that fixes it. Trust it over any document, including this one.
3. **Admin → API keys** — every settable name, whether a value is loaded, which
   source it came from (admin store or hosting environment), and a **fingerprint**
   so you can tell whether the loaded key is the one you think it is. It never
   returns a value, not even the last four characters.

A key saved in the admin screen reaches a **warm** instance within a minute. One
set in Vercel needs a redeploy.
