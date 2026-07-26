import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import {
  metaStatus, metaConnectionPublic, metaAuthUrl, metaOAuthConfigured,
  connectMetaPageToken, disconnectMeta,
} from "@/backend/meta-publish";

// Native Meta connector API — Facebook Pages + Instagram Business.
//   GET  → platform config (OAuth available? graph version)
//   POST { action:"status", brandId }        → this brand's connected Page/IG
//   POST { action:"oauth-url", brandId }      → "Connect with Facebook" URL
//   POST { action:"connect-token", brandId, pageId, pageAccessToken }
//   POST { action:"disconnect", brandId }
// Ownership enforced on every brand-scoped action. Tokens never leave the server.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(metaStatus());
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "meta"), 40, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (action === "status") {
    return NextResponse.json({ ...(await metaConnectionPublic(brandId)), oauthConfigured: metaOAuthConfigured() });
  }

  if (action === "oauth-url") {
    if (!metaOAuthConfigured()) {
      return NextResponse.json({ error: "Connect with Facebook isn't enabled on this deployment yet (the Meta app keys aren't set). Use the Page-token connect below — it works today.", oauthConfigured: false }, { status: 400 });
    }
    const redirectUri = `${req.nextUrl.origin}/api/meta/callback`;
    // State carries the brand so the callback attaches the connection correctly.
    const state = Buffer.from(JSON.stringify({ brandId })).toString("base64url");
    return NextResponse.json({ url: metaAuthUrl(brandId, redirectUri, state), oauthConfigured: true });
  }

  if (action === "connect-token") {
    const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
    const pageAccessToken = typeof body.pageAccessToken === "string" ? body.pageAccessToken.trim() : "";
    if (!pageId || !pageAccessToken) return NextResponse.json({ error: "Both a Page ID and a Page access token are required." }, { status: 400 });
    const r = await connectMetaPageToken(brandId, pageId, pageAccessToken);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, connection: r.connection });
  }

  if (action === "disconnect") {
    await disconnectMeta(brandId);
    return NextResponse.json({ ok: true, connection: { connected: false, igConnected: false } });
  }

  return NextResponse.json({ error: "Unknown action — use status, oauth-url, connect-token or disconnect" }, { status: 400 });
}
