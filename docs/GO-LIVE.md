# MarketWar OS — Go-Live Checklist & Test Plan

Owner: Justin · Domain: **marketwaros.com** · Support: **info@marketwaros.com**
Companion runbook: `docs/DEPLOYMENT.md` (step-by-step deploy) · Architecture:
`docs/PRODUCTION-ARCHITECTURE.md`.

This is the single "are we ready to test / are we ready to ship" document.
Work top to bottom. Everything already runs in **zero-config demo mode**; the
list below is what turns each subsystem from demo → live. Nothing here deletes
or downgrades any existing capability — going live only supplies real
credentials to code that is already shipped and tested.

---

## 0. Status at a glance

| Subsystem | Ships in demo | Goes live when… | Owner action |
|---|---|---|---|
| Frontend (landing, onboarding, 15+ dashboard modules) | ✅ works now | Deployed to Vercel/App Hosting | Deploy |
| AI agents + gateway (19 agents, 39 engines) | ✅ deterministic | `ANTHROPIC_API_KEY` (+ failovers) set | Env |
| ACU economics / billing pages | ✅ live math | Stripe keys + webhook secret | Env + Stripe |
| Auth (signup, login, verify, reset) | ✅ demo bypass | Firebase web key set | Env |
| Persistence (Firestore/Storage) | ✅ no-persist | Firebase Admin key set | Env |
| Email (transactional + lifecycle) | ✅ simulated | **SMTP creds set** | Env + DNS |
| Payments webhook | ✅ signature demo | `STRIPE_WEBHOOK_SECRET` set | Stripe |
| PWA (installable, offline-tolerant) | ✅ works now | Served over HTTPS | Deploy |
| Account deletion (GDPR erasure) | ✅ demo notice | Firebase Auth live | Env |

---

## 1. Pre-flight — the verification gate (run before every deploy)

From the repo root:

```bash
npm ci
npm run typecheck      # TypeScript strict — zero errors
npm run check:layers   # backend/shared/frontend separation intact
npm run build          # production build succeeds
npm run start &        # boot the built server on :3000
npm run smoke          # every page, agent + API surface (exits non-zero on any fail)
```

**Gate:** all four green. `npm run smoke` must report `0` failures. This is the
same gate used on every engine commit — do not deploy on a red gate.

---

## 2. Domain, edge & hosting

- [ ] **Hostinger** — `marketwaros.com` DNS delegated to the chosen edge/host.
- [ ] **Cloudflare** (edge) — proxied, SSL "Full (strict)", HSTS on, `www` → apex redirect.
- [ ] **Vercel** *or* **Firebase App Hosting** (frontend):
  - Root directory **must be `/`** (the Next.js app is at the repo root, *not*
    `app/web`). This is the fix for the earlier "No buildable app found rooted
    at `/workspace/app/web`" deploy error — see `apphosting.yaml` + `docs/DEPLOYMENT.md`.
  - Build command `npm run build`, output the default `.next`.
- [ ] Custom domain attached, TLS certificate issued, `https://marketwaros.com` resolves.
- [ ] Security headers present in prod (`smoke` checks HSTS / X-Content-Type-Options / X-Frame-Options).

---

## 3. Environment variables (production)

Copy `.env.example` → configure in the host's env panel. Secrets are set in the
console **only** — never committed. Public `NEXT_PUBLIC_*` identifiers are safe.

**AI Gateway** (agents go live; without keys they stay deterministic-demo):
- [ ] `ANTHROPIC_API_KEY` (primary) · `OPENAI_API_KEY` · `GEMINI_API_KEY` (failovers)
- [ ] `AI_GATEWAY_ORDER` (default `anthropic,openai,gemini`)

**Firebase** (public identifiers already in `.env.example`):
- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY` (public web key — set, not committed)
- [ ] `FIREBASE_PRIVATE_KEY` (service-account secret — literal `\n` newlines)

**Stripe**:
- [ ] `STRIPE_SECRET_KEY` · `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` · `STRIPE_WEBHOOK_SECRET`

**Email / SMTP** (the go-live email path — see §6):
- [ ] `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_SECURE` · `EMAIL_FROM`

**App**:
- [ ] `NEXT_PUBLIC_APP_URL=https://marketwaros.com` · `NEXT_PUBLIC_PRODUCTION_URL=https://marketwaros.com`

> Provider cost is never exposed to any client surface. The margin floor
> (≥100% markup) and target (300% markup = 75% gross margin) are enforced in
> `src/backend/acu.ts` — do not override in env.

---

## 4. Firebase (Auth, Firestore, Storage, Rules)

- [ ] Project **studio-1718252475-c6017** — Auth enabled (Email/Password).
- [ ] Authorised domains include `marketwaros.com`.
- [ ] **Email templates** branded (verify-email + password-reset) — `docs/DEPLOYMENT.md` §1a.
- [ ] Security rules deployed: `firebase deploy --only firestore:rules,storage,database`
  - `firestore.rules` blocks client writes to financial collections
    (acuWallets, acuTransactions, subscriptions, providerModels, marginRecords, auditLogs).
  - `database.rules.json` is deny-all (RTDB intentionally unused).
- [ ] App Check registered (reCAPTCHA/Play Integrity) if enforcing.

---

## 5. Stripe (subscriptions + ACU top-ups)

- [ ] 8 plans (Free → Global) created; price IDs mapped.
- [ ] **Webhook endpoint:** `https://marketwaros.com/api/webhooks/stripe`
  - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`.
  - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`. Signature is HMAC-SHA256
    verified in `src/backend/stripe-billing.ts` (runtime `nodejs`).
- [ ] Test-mode end-to-end: checkout → webhook 200 → ACU wallet credited (idempotent by event id).

---

## 6. Email / SMTP (transactional + lifecycle)

The engine (`src/backend/email.ts`) tries **SMTP first**, then the Resend and
SendGrid HTTP APIs, then demo. SMTP is spoken with Node's own `tls`/`net` — no
third-party dependency — supporting implicit TLS (465) and STARTTLS (587).

- [ ] Point `SMTP_*` at your relay (Brevo / Postmark / SES / Mailgun).
- [ ] **Authenticate the sending domain** — SPF + DKIM + DMARC on the subdomain
      used in `EMAIL_FROM`. Inbox placement is earned; the hygiene pipeline
      already blocks disposable/role/suppressed addresses before any send.
- [ ] Warm the sending reputation before high volume.
- [ ] Live test: `POST /api/email {action:"send",...}` returns `mode:"live"`,
      `provider:"smtp"` and a queue id; a real inbox receives it.
- [ ] Confirm a hard bounce lands on the suppression ledger (never re-sent).

---

## 7. PWA & responsiveness

- [ ] `manifest.webmanifest`, `icon.svg`, maskable icon, `sw.js` served over HTTPS.
- [ ] Installable (Chrome "Install app" / iOS "Add to Home Screen") — standalone launch.
- [ ] Service worker is network-first and **never caches** `/api`, auth or webhooks.
- [ ] `viewport-fit=cover` — layout respects notches/safe areas on mobile.
- [ ] Manual pass at 320px, 375px, 768px, 1024px, 1440px — no horizontal scroll, no clipped controls.

---

## 8. Account lifecycle & data rights (GDPR)

- [ ] Signup → email verification sent; unverified state handled.
- [ ] "Forgot password?" → reset email delivered.
- [ ] **Account deletion** — Dashboard → Settings → Danger zone → type `DELETE`:
      deletes the Firebase Auth user; `requires-recent-login` re-auths via `/login`
      then retries. (Server-side purge of Firestore/Storage runs via the
      `account.deletion` handler.)
- [ ] "Export my data" / "Request erasure" reachable from Settings.

---

## 9. Smoke-test the live site (post-deploy)

Run the suite against production, then a manual money-path walk:

```bash
SMOKE_BASE_URL=https://marketwaros.com npm run smoke
```

- [ ] `smoke` green against prod (pages 200, security headers, all agents + APIs).
- [ ] Landing → onboarding → dashboard renders with live theme.
- [ ] One agent returns live (non-demo) output with a key configured.
- [ ] Billing page loads 8 plans; monthly/annual toggle + ACU wallet correct.
- [ ] Stripe test checkout credits ACUs via the webhook.
- [ ] One real email delivered to an external inbox.
- [ ] PWA install works from the live URL.

---

## 10. Rollback

- Frontend: redeploy the previous build from the host's deploy history.
- Rules: `firebase deploy` the prior `*.rules` from git history.
- Env: revert changed vars; demo mode is always a safe fallback (no key = no live call).
- Code: `git revert` the offending commit on `claude/marketwar-os-platform-xrgg5r`, re-run the §1 gate, redeploy.

---

## 11. Sign-off

| Gate | Owner | Done |
|---|---|---|
| §1 verification gate green | | ☐ |
| §2 domain + TLS live | | ☐ |
| §3 all prod env vars set | | ☐ |
| §4 Firebase rules deployed | | ☐ |
| §5 Stripe webhook verified | | ☐ |
| §6 SMTP live + domain authenticated | | ☐ |
| §7 PWA installable + responsive | | ☐ |
| §8 account lifecycle verified | | ☐ |
| §9 prod smoke green + money-path walked | | ☐ |

When every box is ticked, MarketWar OS is live. 🚀
