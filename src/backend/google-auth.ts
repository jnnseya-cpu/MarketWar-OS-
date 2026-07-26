// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Google OAuth2 token provider — the single door for Google API access tokens
// (Search Console, Business Profile). Supports BOTH common credential forms so
// whatever you have works:
//   1) Service account — GOOGLE_SERVICE_ACCOUNT_JSON (inline JSON) or
//      GOOGLE_APPLICATION_CREDENTIALS (path to the key file). Signs an RS256 JWT
//      and exchanges it for an access token. Best for Search Console (grant the
//      service-account email access to the property).
//   2) OAuth user — GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET +
//      GOOGLE_OAUTH_REFRESH_TOKEN. Refreshes to an access token. Needed for
//      Business Profile (Google requires a user context there).
// Tokens are cached in-memory until shortly before expiry. Secrets never leave
// the server and are never returned.

import { createSign } from "crypto";
import { readFileSync } from "fs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccount = { client_email: string; private_key: string };
function serviceAccount(): ServiceAccount | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) { try { const j = JSON.parse(inline); if (j.client_email && j.private_key) return j; } catch { /* bad json */ } }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) { try { const j = JSON.parse(readFileSync(path, "utf8")); if (j.client_email && j.private_key) return j; } catch { /* unreadable */ } }
  return null;
}
export function hasOAuthUser(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
}

// Which credential form (if any) is available — surfaced by the health probes.
export function googleAuthMode(): "service_account" | "oauth_user" | "none" {
  if (serviceAccount()) return "service_account";
  if (hasOAuthUser()) return "oauth_user";
  return "none";
}
export function googleConfigured(): boolean { return googleAuthMode() !== "none"; }

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// scope key → { token, expiresAtMs }
const cache = new Map<string, { token: string; exp: number }>();

async function mintServiceAccountToken(sa: ServiceAccount, scope: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = `${header}.${claim}.${signature}`;
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const d = (await res.json().catch(() => ({}))) as { access_token?: string };
  return res.ok && d.access_token ? d.access_token : null;
}

const env = (k: string) => (process.env[k] || "").trim(); // trim: Vercel can add a trailing newline

async function mintOAuthUserToken(): Promise<string | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_OAUTH_REFRESH_TOKEN"),
    }),
  });
  const d = (await res.json().catch(() => ({}))) as { access_token?: string };
  return res.ok && d.access_token ? d.access_token : null;
}

// Diagnose the OAuth refresh-token exchange and return Google's ACTUAL error
// (never the token/secret) so a failed Business Profile connection is debuggable.
export async function diagnoseGoogleOAuth(): Promise<{ configured: boolean; ok: boolean; status?: number; error?: string; errorDescription?: string; fix?: string }> {
  if (!hasOAuthUser()) return { configured: false, ok: false, fix: "Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN." };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: env("GOOGLE_OAUTH_CLIENT_ID"), client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"), refresh_token: env("GOOGLE_OAUTH_REFRESH_TOKEN") }),
    });
    const d = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
    if (res.ok && d.access_token) return { configured: true, ok: true };
    const fix = d.error === "invalid_client"
      ? "Client ID or secret is wrong, or they belong to a DIFFERENT OAuth client than the refresh token. All three must be from the SAME client."
      : d.error === "invalid_grant"
        ? "Refresh token is invalid/expired/revoked, or was minted with a different client. Re-mint it in the OAuth Playground using THIS client's ID+secret (tick 'Use your own OAuth credentials')."
        : d.error === "unauthorized_client"
          ? "This OAuth client can't use refresh-token grants — create the client as 'Web application' or 'Desktop app'."
          : "Check the three GOOGLE_OAUTH_* values are from the same client and have no stray spaces/newlines.";
    return { configured: true, ok: false, status: res.status, error: d.error, errorDescription: d.error_description, fix };
  } catch (e) { return { configured: true, ok: false, error: (e as Error).message, fix: "Server couldn't reach Google's token endpoint." }; }
}

// Get an access token for a Google scope (space-joined if several). Returns null
// when no credential is configured or the exchange fails.
//
// Business Profile (business.manage) can ONLY be accessed by an OAuth USER token —
// service accounts are rejected — so that scope always uses the OAuth credential,
// even when a service account is also configured (which is the common setup:
// service account for Search Console + OAuth for Business Profile). Other scopes
// prefer the service account and fall back to OAuth.
export async function getGoogleAccessToken(scope: string): Promise<string | null> {
  const cached = cache.get(scope);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  try {
    const mustUseOAuth = /business\.manage/.test(scope);
    const sa = serviceAccount();
    let token: string | null = null;
    if (mustUseOAuth) {
      token = hasOAuthUser() ? await mintOAuthUserToken() : null;
    } else {
      token = sa ? await mintServiceAccountToken(sa, scope) : hasOAuthUser() ? await mintOAuthUserToken() : null;
    }
    if (token) { cache.set(scope, { token, exp: Date.now() + 3_500_000 }); return token; }
    return null;
  } catch { return null; }
}

export const GOOGLE_SCOPES = {
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  businessProfile: "https://www.googleapis.com/auth/business.manage",
};
