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

import { createSign, createHmac, timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { getStoredGoogleRefreshToken } from "@/backend/google-oauth-store";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

type ServiceAccount = { client_email: string; private_key: string };
function serviceAccount(): ServiceAccount | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) { try { const j = JSON.parse(inline); if (j.client_email && j.private_key) return j; } catch { /* bad json */ } }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) { try { const j = JSON.parse(readFileSync(path, "utf8")); if (j.client_email && j.private_key) return j; } catch { /* unreadable */ } }
  return null;
}
// The OAuth CLIENT is configured (id + secret). A refresh token may then come
// from the in-app connect flow (stored) OR the env var.
export function hasOAuthClient(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}
// Kept for callers that mean "OAuth is usable": client + a refresh token in env.
// (A stored token also enables OAuth — resolved async at mint time.)
export function hasOAuthUser(): boolean {
  return hasOAuthClient() && Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
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

// The refresh token: prefer the one captured by the in-app connect flow (stored,
// guaranteed to match this client), else the env var.
async function resolveRefreshToken(): Promise<string> {
  const stored = await getStoredGoogleRefreshToken().catch(() => null);
  return (stored || env("GOOGLE_OAUTH_REFRESH_TOKEN")).trim();
}

async function mintOAuthUserToken(): Promise<string | null> {
  const refresh = await resolveRefreshToken();
  if (!hasOAuthClient() || !refresh) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refresh,
    }),
  });
  const d = (await res.json().catch(() => ({}))) as { access_token?: string };
  return res.ok && d.access_token ? d.access_token : null;
}

// ---- In-app connect flow (no OAuth Playground needed) --------------------
// One consent covers Search Console (rankings) + Business Profile (local).
// `youtube.force-ssl` is what `captions.list` + `captions.download` require, and
// it is the lawful way to read a customer's OWN video's words without touching
// the video. Google classifies it as SENSITIVE: a production app using it needs
// their OAuth verification, and until that is granted it works for accounts
// added as test users on the Cloud project while everyone else sees the
// unverified-app warning. That is a deployment fact, not a code one, and it is
// recorded here so nobody wonders later why consent looks different.
const OAUTH_SCOPES = "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/youtube.force-ssl";
function stateSecret(): string { return env("GOOGLE_OAUTH_CLIENT_SECRET") || "marketwar-google-state"; }
export function signState(): string {
  // Short-lived, HMAC-signed nonce so only URLs the app generated are accepted.
  const payload = Buffer.from(JSON.stringify({ t: Math.floor(Date.now() / 1000) })).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifyState(state: string, maxAgeSec = 900): boolean {
  const [payload, sig] = (state || "").split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try { const { t } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { t: number }; return Math.floor(Date.now() / 1000) - t <= maxAgeSec; } catch { return false; }
}
// Build the Google consent URL. offline + prompt=consent forces a refresh token.
export function googleConsentUrl(redirectUri: string, state: string): string {
  const qs = new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"), redirect_uri: redirectUri, response_type: "code",
    scope: OAUTH_SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${AUTH_URL}?${qs}`;
}
// Exchange the callback code for a refresh token (minted by THIS client).
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{ ok: boolean; refreshToken?: string; error?: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: env("GOOGLE_OAUTH_CLIENT_ID"), client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET") }),
    });
    const d = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string; error_description?: string };
    if (res.ok && d.refresh_token) return { ok: true, refreshToken: d.refresh_token };
    return { ok: false, error: d.error_description || d.error || `HTTP ${res.status}` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// Diagnose the OAuth refresh-token exchange and return Google's ACTUAL error
// (never the token/secret) so a failed Business Profile connection is debuggable.
export async function diagnoseGoogleOAuth(): Promise<{ configured: boolean; ok: boolean; status?: number; error?: string; errorDescription?: string; fix?: string }> {
  if (!hasOAuthClient()) return { configured: false, ok: false, fix: "Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET, then click Connect Google." };
  const refresh = await resolveRefreshToken();
  if (!refresh) return { configured: true, ok: false, error: "no_refresh_token", fix: "No refresh token yet — click Connect Google (or set GOOGLE_OAUTH_REFRESH_TOKEN)." };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: env("GOOGLE_OAUTH_CLIENT_ID"), client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"), refresh_token: refresh }),
    });
    const d = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
    if (res.ok && d.access_token) return { configured: true, ok: true };
    const fix = d.error === "invalid_client"
      ? "Client ID or secret is wrong, or they belong to a DIFFERENT OAuth client than the refresh token. All three must be from the SAME client."
      : d.error === "invalid_grant"
        ? "Refresh token is invalid/expired/revoked, or was minted with a different client. Click Connect Google to mint a correct one automatically (no Playground)."
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
      token = hasOAuthClient() ? await mintOAuthUserToken() : null;
    } else {
      token = sa ? await mintServiceAccountToken(sa, scope) : hasOAuthClient() ? await mintOAuthUserToken() : null;
    }
    if (token) { cache.set(scope, { token, exp: Date.now() + 3_500_000 }); return token; }
    return null;
  } catch { return null; }
}

export const GOOGLE_SCOPES = {
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  businessProfile: "https://www.googleapis.com/auth/business.manage",
};
