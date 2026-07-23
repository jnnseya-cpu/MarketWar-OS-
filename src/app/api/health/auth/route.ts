import { NextResponse } from "next/server";

// Auth self-diagnostic — turns "auth/internal-error" into a definitive reason.
//
// It (1) reports which NEXT_PUBLIC_FIREBASE_* vars are present in the DEPLOYED
// build (booleans only — never the values), and (2) calls Google's Identity
// Toolkit REST endpoint server-side with the web API key and reports the exact
// error Google returns. This pinpoints the three usual culprits when the
// providers are already enabled: an invalid/blocked API key, the Identity
// Toolkit API being disabled, or the sign-in provider not being enabled.
//
// SAFE: read-only probe (accounts:createAuthUri looks up sign-in methods for an
// email — it creates nothing, charges nothing). The API key is a PUBLIC web key
// (NEXT_PUBLIC_*), and this route never returns the key itself.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hintFor(message: string, status: string): string {
  const m = `${message} ${status}`.toUpperCase();
  if (m.includes("REFERER") || m.includes("REFERRER") || m.includes("BLOCKED"))
    return "The web API key is HTTP-referrer restricted. In Google Cloud → Credentials → your Browser key, add your live domain(s) to the allowlist (or set Application restrictions to None while testing). NB: if your domain IS already allowlisted, the browser will still work even though this server probe is blocked.";
  if (m.includes("API_KEY_INVALID") || m.includes("API KEY NOT VALID") || m.includes("INVALID_API_KEY"))
    return "The API key is wrong or doesn't belong to this project. Copy it fresh from Firebase → Project settings → Your apps → Web app → apiKey and reset NEXT_PUBLIC_FIREBASE_API_KEY in Vercel, then redeploy.";
  if (m.includes("SERVICE_DISABLED") || m.includes("HAS NOT BEEN USED") || m.includes("PERMISSION_DENIED") || m.includes("IDENTITY TOOLKIT"))
    return "The Identity Toolkit API is disabled for this project. Enable it: Google Cloud → APIs & Services → Enabled APIs → + Enable → 'Identity Toolkit API'. (After enabling, wait 1–2 minutes.)";
  if (m.includes("CONFIGURATION_NOT_FOUND"))
    return "Firebase Authentication isn't initialised for this project yet, or the API key points at the wrong project. Open Authentication once in the Firebase console to initialise it, and confirm the projectId matches.";
  if (m.includes("OPERATION_NOT_ALLOWED"))
    return "The sign-in provider isn't enabled. Firebase → Authentication → Sign-in method → enable Email/Password (and Google).";
  if (m.includes("API_KEY_HTTP_REFERRER_BLOCKED"))
    return "Referrer restriction on the key. Allowlist your domain in Google Cloud → Credentials.";
  return "Unrecognised — read the raw message above; it is Google's verbatim reason.";
}

export async function GET() {
  const present = {
    NEXT_PUBLIC_FIREBASE_API_KEY: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: Boolean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    NEXT_PUBLIC_FIREBASE_APP_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };

  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
  const continueUri = process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://marketwaros.com";

  let probe: Record<string, unknown> = { ran: false, note: "No NEXT_PUBLIC_FIREBASE_API_KEY in this build — auth runs in demo mode." };
  if (key) {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "diagnostic-probe@marketwaros.com", continueUri }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
      if (res.ok) {
        probe = { ran: true, ok: true, httpStatus: res.status, verdict: "PASS — Identity Toolkit reachable, API key valid, provider responds. If the browser still fails, the cause is browser-only: an HTTP-referrer restriction that excludes your live domain, or App Check enforcement." };
      } else {
        const message = json.error?.message || `HTTP ${res.status}`;
        const gStatus = json.error?.status || "";
        probe = { ran: true, ok: false, httpStatus: res.status, googleReason: message, googleStatus: gStatus, fix: hintFor(message, gStatus) };
      }
    } catch (e) {
      probe = { ran: true, ok: false, error: (e as Error).message, fix: "Server couldn't reach Google's auth endpoint — a network/egress issue on the host, not your Firebase config." };
    }
  }

  const missing = Object.entries(present).filter(([, v]) => !v).map(([k]) => k);

  return NextResponse.json({
    service: "MarketWar OS — auth diagnostic",
    envPresent: present,
    envMissing: missing.length ? missing : undefined,
    identityToolkitProbe: probe,
    howToRead: "envPresent must all be true. identityToolkitProbe.ok=true means the server-side check passed. If ok=false, read 'googleReason' (Google's verbatim error) and 'fix'. If ok=true but the browser still errors, it's a referrer restriction excluding your domain or App Check enforcement (browser-only).",
  });
}
