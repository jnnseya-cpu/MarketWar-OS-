import { NextRequest, NextResponse } from "next/server";
import { query, trail, stats, AUDIT_DOCTRINE } from "@/backend/audit-log";
import { buildFeed, FEED_DOCTRINE } from "@/shared/activity-feed";
import { resolveBrandAccess } from "@/backend/brand-access";
import { requireAuth } from "@/backend/guard";

// THE AUDIT TRAIL.
//
// GET ?brandId=            → what happened, newest first (the forensic entries)
// GET ?brandId=&resource=&resourceId=  → one thing's whole history, oldest first
// GET ?brandId=&view=feed  → the SAME entries as readable activity (§70)
//
// The feed is a view here rather than its own endpoint, because it is the same
// data with the same brand scoping and the same auth. A second route would be a
// second place for that scoping to be got wrong.
//
// READ ONLY, and that is the design rather than an omission. There is no POST
// here: entries are written by the modules that make the changes, at the moment
// they make them, because an audit entry a caller can author separately is an
// audit entry a caller can author falsely.
//
// Brand scoping is enforced the same way as everywhere else — a brand's trail is
// its own. Platform-level entries (an emergency stop covering everything) carry
// no brandId and are returned only to a caller who asked for no brand, which
// keeps one tenant from reading another's activity through an unscoped query.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const brandId = (url.searchParams.get("brandId") || "").trim();
  const resource = (url.searchParams.get("resource") || "").trim();
  const resourceId = (url.searchParams.get("resourceId") || "").trim();
  const action = (url.searchParams.get("action") || "").trim();
  const limit = Number(url.searchParams.get("limit") || 100);

  if (!brandId) {
    return NextResponse.json({ error: "brandId required — a trail is always somebody's." }, { status: 400 });
  }
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (resource && resourceId) {
    return NextResponse.json({
      entries: trail(resource, resourceId).filter((e) => e.brandId === brandId),
      order: "oldest first — how it got to where it is",
      doctrine: AUDIT_DOCTRINE,
    });
  }

  const entries = query({ brandId, action: action || undefined, resource: resource || undefined, limit });

  if (url.searchParams.get("view") === "feed") {
    return NextResponse.json({
      ...buildFeed(entries),
      doctrine: FEED_DOCTRINE,
    });
  }

  return NextResponse.json({
    entries,
    stats: stats(),
    order: "newest first",
    doctrine: AUDIT_DOCTRINE,
  });
}
