# Fixing sign-in / sign-up (`auth/internal-error` + Google button)

Two separate things cause "Google button doesn't work" and
`Error (auth/internal-error)` on **Create account**:

1. **Google button on mobile** — FIXED IN CODE. Mobile browsers block auth
   pop-ups; the form now uses Google's **redirect** flow on mobile (and falls
   back to redirect on desktop if the pop-up is blocked). No console change
   needed for this part — it ships with the next deploy.

2. **`auth/internal-error` on email sign-up** — this is a **Firebase Console /
   Vercel env** state, not a code bug. No code can create accounts until the
   items below are set. Do these once, in order.

---

## A. Firebase Console (project: `studio-1718252475-c6017`)

1. **Enable Email/Password.** Authentication → **Sign-in method** → **Email/
   Password** → Enable → Save. *(Disabled = the `internal-error` you're seeing.)*
2. **Enable Google.** Same screen → **Google** → Enable → pick a **support
   email** → Save.
3. **Authorise your domains.** Authentication → Settings → **Authorized
   domains** → Add: `marketwaros.com`, `www.marketwaros.com`, and your Vercel
   preview domain (`*.vercel.app` won't wildcard — add the exact deploy URL you
   test on, e.g. `marketwar-os.vercel.app`). *(Missing here = Google sign-in
   fails with `unauthorized-domain`.)*
4. **Check the Web API key isn't over-restricted.** Google Cloud Console →
   APIs & Services → **Credentials** → your Browser key → under **Application
   restrictions**, if "HTTP referrers" is set, it MUST include your domains
   (`https://marketwaros.com/*`, the Vercel URL). If in doubt for testing, set
   **None** temporarily. Also ensure **Identity Toolkit API** is *Enabled*
   (APIs & Services → Enabled APIs) — a disabled Identity Toolkit is a classic
   `auth/internal-error`.
5. **If App Check is enforced** (Authentication → Settings → App Check) and you
   haven't wired a provider, either register a reCAPTCHA provider or turn
   enforcement **off** for Auth while testing — enforced App Check with no token
   also surfaces as `internal-error`.

## B. Vercel environment variables

The web API key is intentionally **not** committed. Set these in Vercel →
Project → Settings → **Environment Variables** (Production + Preview), then
redeploy:

| Var | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | *(from Firebase console → Project settings → Your apps → Web app → apiKey)* |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `studio-1718252475-c6017.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `studio-1718252475-c6017` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `studio-1718252475-c6017.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `221113093533` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:221113093533:web:26a80dc041406d66dc3374` |

> **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is required for Google sign-in** — the
> redirect/pop-up is hosted on that domain. If it's missing, Google fails even
> after the console steps.

## C. Verify

1. Redeploy. Open `https://<your-domain>/api/health/live` → the
   "Firebase Admin…" line and app should report ready where expected.
2. Sign up with email/password → should create the account (no `internal-error`).
3. Tap **Continue with Google** on your phone → it now redirects to Google and
   back, then lands you in the app.

If email sign-up still errors after A+B, the message will now be plain-English
(e.g. "this sign-in method isn't switched on") — that points straight at the
Console step still outstanding.
