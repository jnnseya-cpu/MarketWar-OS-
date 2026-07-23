# MarketWar OS — Launch Blockers & External Needs (complete list)

**Purpose:** one exhaustive, honest checklist of (A) **every blocker** standing
between the current build and a full GO, and (B) **every external service/key**
the platform can use — what it unlocks, whether it's required, and how to switch
it on. Nothing here is "already done" unless the **Status** says so.

Companion docs: `docs/PRODUCTION-AUDIT.md` (the audit + verdict, §18 is the
latest), `docs/EXTERNAL-ENGINES.md` (engine catalogue), `docs/DEPLOYMENT.md`
(deploy runbook), `docs/GO-LIVE.md` (go-live checklist).

**Self-check while live:** hit **`GET /api/health/live`** on the deployed app —
it's a safe, no-spend probe that reports every capability as `ready: true|false`
and names the exact env var to set. Use it to verify each item below.

Legend — Severity: **P0** = hard blocker (must close before that launch stage) ·
**P1** = strongly required · **P2** = required before scaling. Owner: who acts
(most are **infra/console toggles**, not code).

---

## PART A — ALL BLOCKERS

### A1. Blockers for **invitation-only limited beta** (CONDITIONAL GO stage)

These are the four operational toggles named in the verdict. **All are infra/
console actions — the code is already in place and waits on the key/setting.**

| # | Blocker | Severity | Owner | Why it blocks | Exact action to close | How to verify |
|---|---------|----------|-------|---------------|----------------------|---------------|
| **B-1** | **Error monitoring / alerting / tracing not wired** | P0 | SRE | Production failures (payment, AI, auth) can happen **silently** — no way to detect an incident. Gate 8 (Observability) FAILs. | Add Sentry (or equivalent): create project, set the DSN in Vercel env, wrap the app; add uptime + AI-cost anomaly alerts. In-app audit log (`src/backend/audit.ts`) exists but must ship to a monitored sink. | Trigger a test error → it appears in the monitor + fires an alert. |
| **B-2** | **Firestore backups not enabled + never test-restored** | P0 | DBRE | No proven recovery path; RTO/RPO unknown; data loss would be unrecoverable. Gate 4 (Data integrity) NOT PROVEN. | In Firebase/GCP console enable scheduled Firestore backups (or PITR); then **actually restore** into a scratch project and confirm the data. Document RTO/RPO. | A restore drill completes and the restored data matches. |
| **B-3** | **`STRIPE_WEBHOOK_SECRET` not set in production** | P0 | Owner/Eng | Without it the Stripe webhook runs in **demo mode and does NOT verify signatures** — a forged webhook could credit accounts. (`src/backend/stripe-billing.ts:41` returns `demo: true` when unset.) | Stripe dashboard → Developers → Webhooks → add endpoint `https://marketwaros.com/api/webhooks/stripe` → copy signing secret → set `STRIPE_WEBHOOK_SECRET` in Vercel. | Send a Stripe test event → webhook verifies (not `demo:true`) and is idempotent by event id. |
| **B-4** | **Auth guard not verified against a live Firebase project** | P1 | Eng | Auth is demo-safe (open when Firebase Admin is unconfigured, `src/backend/guard.ts:68`). It must be proven to actually enforce 401/403 once Firebase is live, or admin/money routes could stay open. | Configure `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`; set `PLATFORM_ADMIN_EMAILS`; seed a non-admin account (`npm run seed:accounts`); confirm admin/money routes return 401/403 without a valid admin token and 200 with one. | Live 401/403 on `/api/admin-*` and creator-engine money actions without proper auth. |

> **When B-1…B-4 are closed and retested, the invite-only beta is a GO.**

### A2. Blockers before **real partner money moves** (creator/affiliate payouts)

The commission engine computes, caps, and approves payouts correctly, but **no
money can actually be sent until a payout rail is live**. Until then the engine
truthfully reports "computed/approved, no money moved."

| # | Blocker | Severity | Owner | Why it blocks | Exact action to close |
|---|---------|----------|-------|---------------|----------------------|
| **B-5** | **No payout rail key set** | P0 (for payouts) | Owner | `payoutRailFor()` (`src/backend/creator-engine.ts:320`) reports `live:false` with no key → `requestPayout` records nothing paid. | Set **`STRIPE_SECRET_KEY`** (rest-of-world payouts) and/or **`BITRIPAY_API_KEY`** (Africa: M-Pesa/Orange/Airtel/Africell). |
| **B-6** | **`CREATOR_LEDGER_SECRET` not set** | P1 | Eng | Your billing system can't post verified conversions server-to-server; conversions would depend on an admin login. | Generate a long random secret; set `CREATOR_LEDGER_SECRET` in Vercel; have billing POST conversions to `/api/creator-engine` with header `x-ledger-secret`. |
| **B-7** | **Live conversion→cap→payout reconciliation never run** | P1 | Finance/Eng | Ledger idempotency + £20k-per-customer cap are code-proven only; not exercised on live rails. | With B-5/B-6 on, run one real end-to-end: record a conversion → confirm split (0.75% creator / 0.25% platform) → hit the £20k cap boundary → request payout → reconcile the money actually sent against the ledger. |

### A3. Blockers for **unrestricted full public launch** (beyond A1/A2)

These need **live infrastructure this environment cannot provide** and are
honestly still **NOT TESTED / open** — do not treat as done until run on live
infra. They gate *scale/open-public*, not the invite-only beta.

| # | Blocker | Severity | Owner | Why it blocks | Action to close |
|---|---------|----------|-------|---------------|-----------------|
| **B-8** | **No load / stress / soak test** | P2 | Perf | Behaviour + latency SLOs under real traffic unknown. Gate 6 (Performance) FAILs. | Run k6/Artillery against staging to defined SLOs. |
| **B-9** | **Rate-limit store is in-memory (per-instance)** | P2 | Eng | On multi-instance hosting the cap is per-instance, weakening denial-of-wallet protection. (`src/backend/guard.ts` uses a `Map`.) | Back the limiter with Firestore/Redis counters. |
| **B-10** | **No live penetration test** of the deployed environment | P2 | Security | Live-env attack surface unproven. | Commission a pen-test on staging/prod; triage findings. |
| **B-11** | **No automated test suite** beyond smoke (no unit/integration/e2e) | P2 | Eng | Business-logic regressions (financial/auth) can ship undetected. | Add unit tests for financial + auth logic (Vitest/Jest) + a Playwright e2e for the critical journeys. |
| **B-12** | **`npm audit`: dependency vulnerabilities** (1 high + moderate at last audit) | P2 | Eng | Known-CVE exposure. | `npm audit fix`; re-scan to zero high. |
| **B-13** | **No AI eval-set metrics** (hallucination / tool-accuracy / unsafe-action) | P2 | AI | Critical-AI quality unmeasured before wide public use. | Build an eval set; measure + gate on thresholds. |
| **B-14** | **Email inbox-placement (SPF/DKIM/DMARC) not proven** | P2 | Owner | Transactional mail may land in spam. | Authenticate the sending subdomain; send seed-list deliverability test. |
| **B-15** | **Cross-browser + accessibility matrix not run** | P3 | QA | Keyboard/screen-reader + non-Chromium behaviour unverified. | Run the browser/device + a11y matrix. |

---

## PART B — ALL EXTERNAL NEEDS (every service/key, documented)

Everything runs in **zero-config demo mode** with none of these. Each key flips
a capability from demo → live **with no code change**. Full catalogue with notes:
`docs/EXTERNAL-ENGINES.md`.

### B.1 — REQUIRED for a real invitation-only launch

| Service | Env var(s) | Unlocks | Verify (`/api/health/live`) |
|---------|-----------|---------|------------------------------|
| **Firebase Admin** (Auth + Firestore) | `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT`) | Real accounts, auth, ownership enforcement, **all persistence** (vault, programmes, ledger, landing pages). Without it nothing persists across serverless requests. | "Firebase Admin (persistence, storage, auth)" → ready |
| **AI text provider** (≥1) | `ANTHROPIC_API_KEY` (+`ANTHROPIC_MODEL`) — or `OPENAI_API_KEY` / `GEMINI_API_KEY` | Every AI agent, copy, strategy, recruitment advisor, briefs. Without any, agents return deterministic scaffolds. | "AI intelligence (agents + engines)" → ready |
| **Platform admin allowlist** | `PLATFORM_ADMIN_EMAILS` (+ `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS` for UI) | Who can see the Admin Centre + run admin/payout actions. **Required to have any admin at all.** | Auth 401/403 test (B-4) |
| **App URLs** | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PRODUCTION_URL` | Correct absolute links (referral `/r/CODE`, emails). | Links resolve to the prod domain |

### B.2 — REQUIRED for money features (billing + partner payouts)

| Service | Env var(s) | Unlocks | Blocker ref |
|---------|-----------|---------|-------------|
| **Stripe** (billing) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Subscriptions + ACU top-ups; **webhook signature verification** (else demo mode, unsafe). | B-3, B-5 |
| **Stripe** (payouts, rest of world) | `STRIPE_SECRET_KEY` | Partner payout rail outside Africa. | B-5 |
| **BitriPay** (payouts, Africa) | `BITRIPAY_API_KEY` | Partner payout rail — M-Pesa / Orange / Airtel / Africell mobile money. | B-5 |
| **Creator ledger webhook** | `CREATOR_LEDGER_SECRET` | Billing system posts verified conversions to the partner ledger server-to-server. | B-6 |

### B.3 — RECOMMENDED (transactional + media + publishing)

| Service | Env var(s) | Unlocks |
|---------|-----------|---------|
| **Firebase Storage** | `FIREBASE_STORAGE_BUCKET` / `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Hosted media for **social publishing** (images/video need a real URL to post). Viewing already works inline. |
| **Email — SMTP** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` | **Email Command Center** real sending. |
| **Email — HTTP fallback** | `RESEND_API_KEY`, `SENDGRID_API_KEY` | Failover email pool members. |
| **Field encryption** | `FIELD_ENCRYPTION_MASTER_KEY` | At-rest encryption of sensitive stored fields. |
| **Social publishing** | `ZERNIO_API_KEY` (+ a Zernio account **with a payment method** for >2 channels) | **One-Click Publish** to 15 channels. NB the "connect links failed / free tier reached" message is a **Zernio billing** step, not a code bug. |

### B.4 — OPTIONAL accelerators (each turns a specific capability live)

| Service | Env var(s) | Turns live |
|---------|-----------|-----------|
| OpenAI Image | `OPENAI_API_KEY` (+ `OPENAI_IMAGE_MODEL`) | Photoreal image backgrounds in **AI Image Studio / Brand Studio** |
| OpenAI / Gemini Video | `OPENAI_VIDEO_MODEL` / `GEMINI_VIDEO_MODEL` (+ the provider key) | **AI Video Creator** (Sora / Veo render) |
| Black Forest Labs FLUX | `BFL_API_KEY` | Alternate image render provider |
| Vertex AI | `GOOGLE_APPLICATION_CREDENTIALS` + `VERTEX_PROJECT_ID` | Google-hosted model access |
| WhatsApp | `WHATSAPP_TOKEN` | **WhatsApp Sales Center** live funnel + sending |
| SERP / search data | `SERPER_API_KEY` | **Search Intelligence** live volumes, SERP features, real prospect discovery |
| B2B prospect data | `APOLLO_API_KEY` | **LeadWar Room** real, contactable prospects |
| Site analytics | `NEXT_PUBLIC_GTM_ID` | Google Tag Manager tags |
| Live-mode enforcement | `REQUIRE_LIVE` | Forces engines to fail loudly instead of demo fallback |

### B.5 — NOT-YET-WIRED connectors (need a **build** + a key)

These unlock currently "coming soon" modules. The key alone is not enough — a
connector must be built first. Documented so the roadmap is explicit.

| Capability (module) | Env var (planned) | Needs |
|---------------------|-------------------|-------|
| Organic Dominance (real search + clicks) | `GOOGLE_SEARCH_CONSOLE_TOKEN` | connector + key |
| Revenue attribution (traffic) | `GOOGLE_ANALYTICS_TOKEN` | connector + key |
| Market Listening / share-of-voice / sentiment | `LISTENING_API_KEY` | connector + licensed data key |
| AI Visibility (mentions in ChatGPT/Perplexity/Gemini) | `AI_ANSWER_MONITOR_KEY` | connector + key |
| Authority Engine (backlink gaps / toxic links) | `BACKLINK_API_KEY` | connector + key |
| Reliable partner follower counts | social OAuth / licensed social-data | connector (today: AI reads public profile, or a human verifies) |
| Avatar Studio (talking-head render) | avatar-render API | new connector + key |
| Audio Studio / Dubbing (voice) | TTS / voice-clone API | new connector + key |

### B.6 — Buildable in-house (no external key needed)

- **Screen & Presentation Recorder** → browser `MediaRecorder`.
- **Video Editor timeline** → in-browser edit engine.
- **Collaboration & Approvals** → workflow state machine.

---

## Minimum switch-on set for the invite-only beta (fastest path to GO)

1. **Firebase Admin** secrets + `FIREBASE_STORAGE_BUCKET` — *required.*
2. **One AI text key** (`ANTHROPIC_API_KEY`) — *required.*
3. **`PLATFORM_ADMIN_EMAILS`** — *required*, then run the B-4 auth check.
4. **`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`** (B-3) — if billing is in scope.
5. **An email provider** (SMTP or Resend/SendGrid) for transactional mail.
6. **Error monitoring** (B-1) + **tested Firestore backups** (B-2) — the two operational gates.
7. For partner payouts: **`STRIPE_SECRET_KEY` / `BITRIPAY_API_KEY` + `CREATOR_LEDGER_SECRET`** (B-5/B-6), then the reconciliation run (B-7).

Close B-1…B-7 and the invite-only beta is a defensible GO. B-8…B-15 are the
remaining gates before **unrestricted public** launch.
