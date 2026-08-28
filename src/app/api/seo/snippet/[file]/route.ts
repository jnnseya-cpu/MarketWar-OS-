import { NextRequest, NextResponse } from "next/server";
import { getDeployConfig, buildSnippet } from "@/backend/seo-deploy";

// The snippet a customer's website loads.
//
// GET /api/seo/snippet/<brandId>.js
//
// PUBLIC and unauthenticated by necessity — it is fetched by an anonymous
// browser on someone else's domain. That is safe because it contains only what
// the customer approved for publication on their own public pages, and the
// script itself refuses to run on any host they have not authorised.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const brandId = (file || "").replace(/\.js$/i, "").trim();

  const js = brandId
    ? buildSnippet(await getDeployConfig(brandId).catch(() => null) ?? { brandId, allowedHosts: [], enabled: false, fixes: [], updatedAt: "" })
    : "/* MarketWar OS — no brand in this URL, nothing to apply. */\n";

  return new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Short: a customer who approves a fix should see it live within minutes,
      // not after a CDN TTL they cannot see or clear.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      "X-Content-Type-Options": "nosniff",
      // The script is meant to be embedded on the customer's own site.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
