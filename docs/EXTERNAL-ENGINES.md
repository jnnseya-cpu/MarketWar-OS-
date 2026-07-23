# MarketWar OS — External Engines & Keys Needed

The single source of truth for every external service the platform can use, what
each one **unlocks**, whether it's **required** for launch, and the **env var**
that turns it on. The platform is designed to run in **zero-config demo mode**
with none of these; each key flips a capability from "computed/demo/coming-soon"
to **live** without any code change.

Legend — **Required** (needed for a real launch), **Recommended** (strongly
advised), **Optional** (unlocks a specific capability), **Turns Live** (which
"coming soon"/gated feature becomes real).

---

## 1. Core platform (Required)

| Engine | Env var(s) | Unlocks | Notes |
|---|---|---|---|
| Firebase Admin (Auth + Firestore) | `FIREBASE_SERVICE_ACCOUNT` **or** `FIREBASE_PROJECT_ID`+`FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY` | Real accounts, auth, ownership enforcement, **all persistence** (vault, programmes, ledger, landing pages) | Without it the app runs demo-only and nothing persists across serverless requests. **Required.** |
| Firebase Storage | `FIREBASE_STORAGE_BUCKET` (or `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`) | Hosted media for **social publishing** (images/video must be at a real URL to post) | Viewing no longer needs it (images render inline); publishing does. **Recommended.** |
| Firebase Web config (client) | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Client SDK (login UI) | Public by design. |
| App URLs | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PRODUCTION_URL` | Correct absolute links (referral `/r/CODE`, emails) | Recommended. |
| Field encryption | `FIELD_ENCRYPTION_MASTER_KEY` | Encryption of sensitive stored fields | Recommended for production. |
| Platform admin allowlist | `PLATFORM_ADMIN_EMAILS`, `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS` | Who sees Admin Centre + can run admin/payout actions | Set to your ops emails. **Required** to have any admin. |

## 2. AI text gateway (Required — at least one)

| Engine | Env var(s) | Unlocks |
|---|---|---|
| Anthropic Claude | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Every AI agent, copy, strategy, recruitment advisor, briefs, organic workup |
| OpenAI (text) | `OPENAI_API_KEY`, `OPENAI_MODEL` | Same (fallback/alternate) |
| Google Gemini (text) | `GEMINI_API_KEY`, `GEMINI_MODEL` | Same (fallback/alternate) |
| Gateway routing | `AI_GATEWAY_ORDER` | Provider preference/failover order |

With none set, agents return honest deterministic scaffolds. **At least one is required** for real AI output.

## 3. AI image & video (Optional — Turns Live)

| Engine | Env var(s) | Turns Live |
|---|---|---|
| OpenAI Image | `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` | **AI Image Studio / Brand Studio** photoreal backgrounds (composited under exact-text/logo) |
| OpenAI Video | `OPENAI_API_KEY`, `OPENAI_VIDEO_MODEL` | **AI Video Creator** (Sora-class render) |
| Gemini Video | `GEMINI_API_KEY`, `GEMINI_VIDEO_MODEL` | **AI Video Creator** (Veo-class render) |
| **Audio model** (not yet integrated) | _needs a new connector_ | **Audio Studio, Translation & Dubbing (voice), Avatar voice** — TTS/voice-clone |
| **Avatar model** (not yet integrated) | _needs a new connector_ | **AI Avatar Studio** talking-head render |

## 4. Communications (Recommended — Turns Live)

| Engine | Env var(s) | Turns Live |
|---|---|---|
| Email — SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` | **Email Command Center** real sending |
| Email — Resend | `RESEND_API_KEY` | Email pool member |
| Email — SendGrid | `SENDGRID_API_KEY` | Email pool member (failover) |
| WhatsApp | `WHATSAPP_TOKEN` | **WhatsApp Sales Center** live funnel + sending |
| Social publishing | `ZERNIO_API_KEY` (+ a **Zernio account with a payment method** for >2 accounts) | **One-Click Publish** to 15 channels. NB: the "connect links failed / free tier reached" message is a **Zernio account/billing** step, not a code issue. |

## 5. Payments & payouts (Required for money features — Turns Live)

| Engine | Env var(s) | Turns Live |
|---|---|---|
| Stripe (billing + partner payouts, non-Africa) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Subscriptions/ACU top-ups **and** partner payout rail (rest of world) |
| BitriPay (partner payouts, Africa) | `BITRIPAY_API_KEY` | Partner payout rail — M-Pesa / Orange / Airtel / Africell mobile money |
| Creator ledger webhook secret | `CREATOR_LEDGER_SECRET` | Lets your billing system post verified conversions to the partner ledger server-to-server |

Until a rail key is set, payouts are **computed and approved** but the engine truthfully says no money moved.

## 6. Data providers (Optional — Turns Live)

| Engine | Env var(s) | Turns Live |
|---|---|---|
| SERP / search data | `SERPER_API_KEY` | **Search Intelligence** live volumes, SERP features, competitor rankings; unlocks real prospect discovery |
| B2B prospect data | `APOLLO_API_KEY` | **LeadWar Room** real, contactable prospects (else non-contactable samples) |
| Google Search Console | `GOOGLE_SEARCH_CONSOLE_TOKEN` _(planned connector)_ | Organic Dominance real search + click data |
| Google Analytics | `GOOGLE_ANALYTICS_TOKEN` _(planned connector)_ | Traffic + organic-influenced revenue attribution |
| **Social listening** | `LISTENING_API_KEY` _(planned connector)_ | **Market Listening**, share-of-voice, sentiment, purchase-intent, crisis velocity |
| **AI-answer monitor** | `AI_ANSWER_MONITOR_KEY` _(planned connector)_ | **AI Visibility** — brand mentions/citations in ChatGPT/Perplexity/Gemini |
| **Backlink index** | `BACKLINK_API_KEY` _(planned connector)_ | **Authority Engine** backlink gaps + toxic-link detection |
| Follower verification (social OAuth or licensed social-data) | _planned connector_ | Reliable partner follower counts (today: AI reads the public profile, or a human verifies) |

## 7. Analytics / ops (Optional)

| Engine | Env var(s) | Unlocks |
|---|---|---|
| Google Tag Manager | `NEXT_PUBLIC_GTM_ID` | Site analytics/tags |
| Live-mode enforcement | `REQUIRE_LIVE` | Forces engines to require a live provider (fails instead of demo) |

---

## What each "Coming soon" needs (quick map)

- **Video Editor timeline** → a browser/edit engine (build effort, no key) — *buildable in-house.*
- **Screen & Presentation Recorder** → browser `MediaRecorder` (no key) — *buildable in-house.*
- **Collaboration & Approvals** → a workflow state machine (no key) — *buildable in-house.*
- **Avatar Studio** → an avatar-render API key.
- **Audio Studio / Dubbing (voice)** → a TTS/voice-clone API key.
- **Market Listening / AI Visibility / Authority** → licensed data-provider keys (section 6).
- **Real partner payouts** → Stripe + BitriPay keys (section 5).

## Minimum set for a real invitation-only launch

1. Firebase Admin (Auth + Firestore) + Storage — *required.*
2. One AI text provider key — *required.*
3. `PLATFORM_ADMIN_EMAILS` — *required.*
4. Stripe (if billing/payouts are in scope) + `STRIPE_WEBHOOK_SECRET`.
5. An email provider (Resend/SendGrid/SMTP) for transactional mail.
6. Optional but high-value: `ZERNIO_API_KEY` (+ billing) for publishing; `OPENAI_IMAGE_MODEL`/video for creative render; `SERPER_API_KEY`/`APOLLO_API_KEY` for real market + prospect data.
