import { NextRequest, NextResponse } from "next/server";
import { verifyState, brandFromState, exchangeGoogleCode } from "@/backend/google-auth";
import { setStoredGoogleRefreshToken, setBrandGoogleRefreshToken } from "@/backend/google-oauth-store";

// Google OAuth callback for the in-app connect flow. Google redirects here with
// ?code&state; we verify the HMAC-signed state (only URLs the app generated are
// accepted), exchange the code for a refresh token minted by OUR client, store it
// server-side, and bounce back to Go-Live. The token never reaches the browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(origin: string, params: Record<string, string>): NextResponse {
  return NextResponse.redirect(`${origin}/dashboard/go-live?${new URLSearchParams(params)}`);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const url = req.nextUrl;
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return back(origin, { google: "error", reason: err.slice(0, 160) });

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !verifyState(state)) return back(origin, { google: "error", reason: "Invalid or expired connect request — click Connect Google again." });

  const redirectUri = `${origin}/api/google/callback`;
  const r = await exchangeGoogleCode(code, redirectUri);
  if (!r.ok || !r.refreshToken) return back(origin, { google: "error", reason: (r.error || "Token exchange failed").slice(0, 160) });

  // Where the token belongs. A consent started from a brand stores against THAT
  // brand — its YouTube captions are read with its own authorisation, and the
  // platform's connection is never used on a customer's behalf. A consent with
  // no brand is the platform's own (Search Console, Business Profile).
  const brandId = brandFromState(state);
  if (brandId) {
    await setBrandGoogleRefreshToken(brandId, r.refreshToken);
    return back(origin, { google: "connected", brand: brandId });
  }
  await setStoredGoogleRefreshToken(r.refreshToken);
  return back(origin, { google: "connected" });
}
