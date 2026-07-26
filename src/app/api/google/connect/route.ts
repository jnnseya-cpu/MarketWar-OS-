import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/guard";
import { hasOAuthClient, googleConsentUrl, signState } from "@/backend/google-auth";

// Starts the in-app Google connect flow (no OAuth Playground). Admin-only. Returns
// the Google consent URL (Search Console + Business Profile scopes, offline access)
// that the callback exchanges for a refresh token minted by OUR client — so it can
// never mismatch. The redirect URI must be registered on the OAuth client.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  // When Admin auth is enforced, require an executive (platform owner). In demo
  // (no Admin configured) the flow is inert anyway (no client keys).
  if (auth.ok && auth.enforced && auth.role !== "executive") {
    return NextResponse.json({ error: "Connecting the platform Google account is limited to administrators." }, { status: 403 });
  }
  if (!hasOAuthClient()) {
    return NextResponse.json({ error: "Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET in Vercel first, then Connect Google." }, { status: 400 });
  }
  const redirectUri = `${req.nextUrl.origin}/api/google/callback`;
  return NextResponse.json({ url: googleConsentUrl(redirectUri, signState()), redirectUri });
}
