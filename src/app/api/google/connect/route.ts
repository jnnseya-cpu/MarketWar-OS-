import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/guard";
import { hasOAuthClient, googleConsentUrl, signState, type GoogleConnectPurpose } from "@/backend/google-auth";

// Starts the in-app Google connect flow (no OAuth Playground). Admin-only. Returns
// the Google consent URL (Search Console + Business Profile scopes, offline access)
// that the callback exchanges for a refresh token minted by OUR client — so it can
// never mismatch. The redirect URI must be registered on the OAuth client.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // TWO DIFFERENT CONNECTIONS, TWO DIFFERENT GATES.
  //
  // Without a brand this is the PLATFORM's own Google account — Search Console
  // and Business Profile for marketwaros.com — so it stays limited to an
  // executive. With a brand it is that CUSTOMER's account, used to read their
  // own YouTube captions, and the right check is that the brand is theirs.
  // Leaving the executive gate across both would have meant no customer could
  // ever connect their own channel, which is the entire point of doing this per
  // brand.
  const brandId = (req.nextUrl.searchParams.get("brandId") || "").trim();
  if (brandId) {
    const { resolveBrandAccess } = await import("@/backend/brand-access");
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  } else if (auth.enforced && auth.role !== "executive") {
    return NextResponse.json({ error: "Connecting the platform Google account is limited to administrators. To connect your own channel, connect it against your brand instead." }, { status: 403 });
  }

  if (!hasOAuthClient()) {
    return NextResponse.json({ error: "Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET in Vercel first, then Connect Google." }, { status: 400 });
  }
  const redirectUri = `${req.nextUrl.origin}/api/google/callback`;
  // Only the scopes this connection needs. A YouTube connect asks for YouTube,
  // not for management of the customer's Google Business Profile as well.
  const raw = req.nextUrl.searchParams.get("purpose") || "";
  const purpose: GoogleConnectPurpose = raw === "youtube" || raw === "search" || raw === "business" ? raw : "all";
  return NextResponse.json({ url: googleConsentUrl(redirectUri, signState(brandId), purpose), redirectUri, brandId: brandId || undefined, purpose });
}

// Is this brand connected? The screens need to know before they offer a button,
// and a customer must never be told to connect something they already have.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const brandId = (req.nextUrl.searchParams.get("brandId") || "").trim();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const { resolveBrandAccess } = await import("@/backend/brand-access");
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { brandGoogleConnected } = await import("@/backend/google-oauth-store");
  return NextResponse.json({
    brandId,
    connected: await brandGoogleConnected(brandId),
    clientReady: hasOAuthClient(),
    what: "Connecting lets this brand's own YouTube captions be read for the Caption Engine and Clip Finder. Nothing is downloaded, nothing is posted, and the platform's own Google connection is never used on your behalf.",
  });
}
