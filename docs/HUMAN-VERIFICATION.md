# Human verification — keeping scripts out of signup, login and the AI budget

## The thing to understand first

The signup form talks **straight to Google's Identity Toolkit** using the public
web API key (`NEXT_PUBLIC_FIREBASE_API_KEY`), which is visible in the page
source. A bot does not have to load the MarketWar signup page at all — it can
POST to Google directly.

So nothing in our React form, and nothing in `src/backend/human-check.ts`, can
by itself stop a script creating a Firebase account. Any vendor or article that
tells you a front-end captcha "stops bot signups" on a Firebase-client app is
wrong about this specific architecture.

There are two separate jobs, and they need two different controls:

| Job | What does it | Status |
|---|---|---|
| Stop the **account** being created | Firebase **App Check** (reCAPTCHA), enforced by Google at the endpoint the bot is calling | **Needs a site key + console enforcement — see below** |
| Make an account **worth nothing** until a human is behind it | MarketWar's own human check, gating the free ACU allowance | **Live, no keys required** |

The second one is what protects the money, and it works today. The first one is
what stops the noise in your user list, and it needs ten minutes of console work.

---

## What is live now (no keys, working already)

`src/backend/human-check.ts` + `src/shared/proof-of-work.ts` + `/api/auth/human`.

Runs on **both signup and login** — login too, because credential stuffing is a
volume attack and the same control blunts it.

1. **Proof of work.** The server issues an HMAC-signed challenge; the browser
   must find a hash with 18 leading zero bits. Under a second on a phone.
   Be precise about what this buys: it does **not** identify a human, it
   **prices volume**. One signup is free; a hundred thousand is CPU-hours. It
   will not stop one determined person signing up once, and is not meant to.
2. **Honeypot.** An off-screen field with no tab stop. Anything in it is a
   script. (Off-screen rather than `display:none` — some bots skip hidden
   fields but fill everything else.)
3. **Form timing.** A submit under 1.2 s did not come from a hand.
4. **Throwaway-domain rejection.** A short, specific list. Deliberately not a
   long one: blocking a legitimate provider costs a paying customer.
5. **Replay protection.** A solved challenge is spent once, bound to the
   requesting browser (IP + user agent).

### What it gates

A new wallet in production opens at **0 ACUs**, flagged unclaimed. The free
100-ACU allowance is handed over by `PUT /api/auth/human`, which requires **all
three** of:

- a valid human-check token (work done in this browser),
- `email_verified` on the Firebase ID token (a mailbox that receives mail),
- a non-disposable domain.

So a script that creates ten thousand accounts gets ten thousand **empty** ones
and spends none of the AI budget. That is the actual exposure closed:
100 ACUs = £1 of real provider spend, per account, previously granted
automatically on first read.

Existing customers are untouched. A wallet with no flag that has ever been
credited counts as already claimed — nobody is asked to re-prove themselves to
keep ACUs they already have. In zero-config demo mode (no Firebase Admin) the
allowance is granted immediately as before, because there are no accounts to
farm and no real money to spend.

### Two environment variables

```
HUMAN_CHECK_SECRET=<32+ random bytes>     # REQUIRED in production
HUMAN_CHECK_BITS=18                        # optional, 8–24, default 18
```

**Set `HUMAN_CHECK_SECRET`.** Without it, challenges are signed with a
per-process key. On a second instance, or after a restart, a real customer
solves a challenge and is told it did not match. Generate one with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Raise `HUMAN_CHECK_BITS` only under active abuse — each +1 doubles the work for
your customers as well as the attacker. 20 is a firm ceiling for a phone.

---

## Switching on the part that blocks account creation

This is the half that needs Google, because Google owns the endpoint.

1. **Create a reCAPTCHA v3 site key** — Google Cloud Console → Security →
   reCAPTCHA Enterprise (or the classic reCAPTCHA admin console) → register a
   **v3** key for your domains: `marketwaros.com`, `www.marketwaros.com`, and
   any customer domains that serve the signup page.
2. **Set it in Vercel** (Production **and** Preview):
   ```
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<your v3 site key>
   ```
   Redeploy. The app now sends App Check tokens — `src/frontend/firebase-client.ts`
   initialises it automatically when the key is present.
3. **Register the app in Firebase** — Firebase console → App Check → your web
   app → register with reCAPTCHA v3, paste the **secret** key there (the secret
   goes to Google, never into this repo).
4. **Watch the metrics for a few days.** App Check → Metrics shows verified vs
   unverified requests. Do **not** skip this: enforcing before your real traffic
   shows as verified locks out your own customers.
5. **Then enforce** — App Check → APIs → **Authentication** → Enforce.

Only after step 5 is account creation actually blocked. Steps 1–4 change
nothing about who can sign up; the key alone enforces nothing.

### Optional, stronger

Firebase **Identity Platform** offers reCAPTCHA Enterprise bot protection
specifically for password sign-in (Authentication → Settings → Bot protection).
It is a paid upgrade and it protects the password endpoints directly. Worth it
if you see credential stuffing after App Check is on.

---

## Checking it from the outside

`GET /api/health/auth` returns a `humanCheck` block from the **running
deployment**:

```json
"humanCheck": {
  "bits": 18,
  "secretConfigured": true,
  "appCheckConfigured": false,
  "blocksAccountCreation": false,
  "note": "…"
}
```

`blocksAccountCreation: false` is the honest reading of "the allowance is gated
but accounts can still be created by a script". It only flips true when a
reCAPTCHA site key is present — and even then the note reminds you to confirm
enforcement is on, because the key alone does not enforce anything.

---

## Known limits, stated rather than buried

- **The spent-challenge set and the rate limiter are per-instance.** Across
  several serverless instances a solved challenge could be replayed once per
  instance. Fixing that properly needs a shared store (Redis/Firestore) and is
  tracked with the same limitation on `rateLimit` in `src/backend/guard.ts`.
- **Proof of work is a volume price, not an identity check.** See above.
- **The disposable-domain list is a speed bump.** There are thousands of these
  domains and new ones daily. The real barrier is requiring a verified mailbox,
  which a farm needs one of per account whether or not we recognise the domain.
- **Google sign-in** already proves a person is present; the check still runs on
  that path because it also mints the token the allowance is claimed with.
