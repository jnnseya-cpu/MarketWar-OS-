# MarketWar OS — Go-Live Runbook

Step-by-step deployment for the adopted production architecture
([`PRODUCTION-ARCHITECTURE.md`](PRODUCTION-ARCHITECTURE.md)):
**Hostinger (domain) → Cloudflare (edge) → Vercel (frontend) → Firebase (backend)**.

Time to first production deploy: ~45 minutes. Do the steps in order.

---

## Step 1 — Firebase project (backend)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) →
   **Add project** → name it `marketwar-prod` (create `marketwar-staging` too;
   one project per environment). Enable Google Analytics when prompted.
2. **Upgrade to the Blaze plan** (pay-as-you-go; free tier still applies —
   you pay only past free quotas). Required for Cloud Functions/Run later.
3. **Authentication → Get started** → enable *Email/Password* and *Google*
   (add Microsoft/Apple/phone OTP when needed).
4. **Firestore Database → Create database** → production mode → region
   `eur3` (or nearest your users).
5. **Storage → Get started** → same region.
6. Deploy the security rules shipped in this repo:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add        # select marketwar-prod
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
7. **Project settings → General → Your apps → Web app** → register
   `MarketWar OS` → copy the config values (apiKey, authDomain, projectId,
   storageBucket, messagingSenderId, appId) — these become the
   `NEXT_PUBLIC_FIREBASE_*` env vars.
8. **Project settings → Service accounts → Generate new private key** —
   download the JSON. You need three values from it: `project_id`,
   `client_email`, `private_key`. **Never commit this file.**
9. Recommended: **App Check → Register** the web app with reCAPTCHA
   Enterprise once the domain is live (Step 4).

## Step 2 — Vercel project (frontend)

1. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository**
   → select `jnnseya-cpu/MarketWar-OS-` → branch `main` (or
   `claude/marketwar-os-platform-xrgg5r`). Framework auto-detects as Next.js —
   no build settings needed.
2. **Environment Variables** (Project → Settings → Environment Variables).
   Add for *Production* (repeat for *Preview* with staging values):

   | Variable | Value | Notes |
   |---|---|---|
   | `AI_GATEWAY_ORDER` | `anthropic,openai,gemini` | provider priority |
   | `ANTHROPIC_API_KEY` | your **new/rotated** key | primary AI provider |
   | `ANTHROPIC_MODEL` | `claude-opus-4-8` | optional override |
   | `OPENAI_API_KEY` | rotated key | optional failover |
   | `GEMINI_API_KEY` | rotated key | optional failover |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | from Step 1.7 | client SDK |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` | |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `marketwar-prod` | |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` | |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | from Step 1.7 | |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | from Step 1.7 | |
   | `FIREBASE_PROJECT_ID` | from service-account JSON | Admin SDK |
   | `FIREBASE_CLIENT_EMAIL` | from service-account JSON | Admin SDK |
   | `FIREBASE_PRIVATE_KEY` | from service-account JSON (paste with `\n`) | Admin SDK |
   | `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com` | |

3. **Deploy.** Verify the `*.vercel.app` URL: landing page renders, dashboard
   loads, `GET /api/gateway` returns `"mode": "live"` with your providers.
4. With the Firebase Admin vars present, audits and agent runs now persist to
   Firestore (`audits`, `agent_runs` collections) automatically.

## Step 3 — Cloudflare (edge layer)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a site** →
   enter your domain → Free plan is fine to start (Pro adds better WAF/image
   optimisation).
2. Cloudflare shows two **nameservers** (e.g. `ada.ns.cloudflare.com`).
   Keep this tab open for Step 4.
3. After DNS is delegated (Step 4), create the records:

   | Type | Name | Target | Proxy |
   |---|---|---|---|
   | CNAME | `@` (root) | `cname.vercel-dns.com` | ✅ Proxied |
   | CNAME | `www` | `cname.vercel-dns.com` | ✅ Proxied |

4. **SSL/TLS → Overview → Full (strict).** (Anything less breaks Vercel.)
5. Recommended hardening: **Security → WAF** managed rules ON; **Bots → Bot
   fight mode** ON; **Speed → Optimization** defaults; a rate-limiting rule
   on `/api/*` (e.g. 100 req/min per IP).

## Step 4 — Hostinger (domain)

1. Hostinger hPanel → **Domains → your domain → DNS / Nameservers** →
   **Change nameservers** → enter the two Cloudflare nameservers from Step 3.
2. That's everything Hostinger does from now on: registration + renewal.
   Do **not** use Hostinger hosting, email-DNS shortcuts, or site builder for
   this domain — DNS is managed in Cloudflare.
3. Propagation takes minutes to ~24 h. Verify with
   `dig NS yourdomain.com +short` → should show Cloudflare nameservers.

## Step 5 — Connect the domain in Vercel

1. Vercel → Project → **Settings → Domains** → add `yourdomain.com` and
   `www.yourdomain.com` (redirect www → apex or vice-versa, your choice).
2. Vercel validates via the Cloudflare CNAMEs from Step 3 and issues SSL.
3. Update `NEXT_PUBLIC_APP_URL` to the real domain and redeploy.

## Step 6 — Post-launch checklist

- [ ] `https://yourdomain.com` serves the landing page over HTTPS
- [ ] `GET /api/gateway` → `"mode": "live"`, expected provider order
- [ ] Run one Failure Audit end-to-end → document appears in Firestore
      `audits` collection
- [ ] Run one agent from a dashboard → `agent_runs` document appears
- [ ] Firebase console → Authentication providers enabled
- [ ] App Check registered for the production domain
- [ ] Cloudflare SSL mode = Full (strict); WAF on
- [ ] Vercel Preview env has **staging** Firebase project keys, never prod
- [ ] Budget alerts: GCP billing budget (e.g. £25/mo alert) + Vercel spend
      management + per-provider AI spend limits in each AI console
- [ ] All API keys in use are **rotated** ones — any key that ever appeared
      in a document or chat is revoked

## What comes next (per the architecture)

| Milestone | Where | Notes |
|---|---|---|
| Auth screens (sign-in/up, session) | Vercel frontend + Firebase Auth | client wiring ready in `src/frontend/firebase-client.ts` |
| Stripe billing + ACU wallet | Cloud Functions (webhooks) + Firestore | never on Vercel |
| WhatsApp/SMS/Email sending | Cloud Functions + provider APIs | consent-checked sends |
| Heavy AI jobs & bulk work | Cloud Run | same AI Gateway contract |
| Push notifications | FCM | |
| Multi-env CI/CD | GitHub Actions → Vercel + `firebase deploy` | dev/test/staging/prod projects |
