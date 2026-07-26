import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { completeMetaOAuth } from "@/backend/meta-publish";

// OAuth callback for "Connect with Facebook". Facebook redirects here with
// ?code&state; we exchange the code for the brand's Page + IG tokens, store them,
// then bounce back to the Publish Center. Ownership of the brand in `state` is
// enforced (the user's session cookie rides the redirect).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(origin: string, params: Record<string, string>): NextResponse {
  const qs = new URLSearchParams(params).toString();
  return NextResponse.redirect(`${origin}/dashboard/publish?${qs}`);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const url = req.nextUrl;
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return back(origin, { meta: "error", reason: err.slice(0, 160) });

  const code = url.searchParams.get("code") || "";
  const stateRaw = url.searchParams.get("state") || "";
  if (!code || !stateRaw) return back(origin, { meta: "error", reason: "Missing code/state from Facebook." });

  let brandId = "";
  try { brandId = (JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as { brandId?: string }).brandId || ""; } catch { /* bad state */ }
  if (!brandId) return back(origin, { meta: "error", reason: "Invalid state." });

  // Enforce that the signed-in user actually owns this brand before storing tokens.
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return back(origin, { meta: "error", reason: "You don't have access to this brand." });

  const redirectUri = `${origin}/api/meta/callback`;
  const r = await completeMetaOAuth(brandId, code, redirectUri);
  if (!r.ok) return back(origin, { meta: "error", reason: (r.error || "Connect failed").slice(0, 160) });
  return back(origin, { meta: "connected", page: r.connection?.pageName || "" });
}
