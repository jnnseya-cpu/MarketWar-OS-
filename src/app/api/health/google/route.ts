import { NextResponse } from "next/server";
import { googleAuthMode, hasOAuthClient, diagnoseGoogleOAuth } from "@/backend/google-auth";
import { listSites } from "@/backend/search-console";
import { listAccounts } from "@/backend/business-profile";

// Google data self-diagnostic — are Search Console (real rankings) and Business
// Profile (real local listings) connected? Reports the credential form and does
// one read-only call to each. SAFE: read-only; never returns credentials.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = googleAuthMode();
  if (mode === "none") {
    return NextResponse.json({
      service: "google", verdict: "AMBER — no Google credential; SEO/local modules show estimates.",
      authMode: "none",
      fix: "Set a service-account (GOOGLE_SERVICE_ACCOUNT_JSON) for Search Console, or an OAuth user (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) for Search Console + Business Profile.",
      searchConsole: { connected: false }, businessProfile: { connected: false },
    });
  }
  const [sc, gbp] = await Promise.all([listSites().catch(() => null), listAccounts().catch(() => null)]);
  const scOk = sc?.mode === "live";
  const gbpOk = gbp?.mode === "live";
  // When Business Profile isn't live but an OAuth credential is set, run the
  // token-exchange diagnostic so the exact Google error (invalid_grant /
  // invalid_client …) is visible — that's what pinpoints the fix.
  const oauthDiagnostic = !gbpOk && hasOAuthClient() ? await diagnoseGoogleOAuth().catch(() => undefined) : undefined;
  const verdict = scOk || gbpOk
    ? `GREEN — Google data live (${[scOk ? "Search Console" : "", gbpOk ? "Business Profile" : ""].filter(Boolean).join(" + ")}).`
    : "RED — Google credential present but no API responded (check property access / API allowlisting).";
  return NextResponse.json({
    service: "google", verdict, authMode: mode,
    searchConsole: { connected: scOk, sites: sc?.sites?.length ?? 0, note: sc?.note },
    businessProfile: { connected: gbpOk, accounts: gbp?.accounts?.length ?? 0, note: gbp?.note },
    ...(oauthDiagnostic ? { oauthDiagnostic } : {}),
  });
}
