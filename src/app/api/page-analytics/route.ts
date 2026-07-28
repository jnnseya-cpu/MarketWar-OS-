import { NextRequest, NextResponse } from "next/server";
import { recordPageEvent, getPageStats, listPageStats, reportFor, MIN_VIEWS, type PageEvent } from "@/backend/page-analytics";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

// Landing-page analytics.
//
// GET  /api/page-analytics?brandId=..&slug=..&event=view   → 1x1 pixel, counts a view
// POST { brandId, slug, event }                            → count a click or lead
// POST { brandId, slug, action:"stats" }                   → the owner's numbers
//
// The GET pixel is deliberately unauthenticated — it is fired by a public
// landing page a stranger is looking at. It only ever INCREMENTS a counter for a
// (brand, slug) pair, so the worst a bad actor achieves is inflating a number in
// the owner's own dashboard. Reading the stats back is owner-only.
//
// No cookies, no visitor identifiers, no cross-site anything: a view is a
// counter and a date. That keeps this outside consent-banner territory rather
// than quietly making the customer a data controller.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS: PageEvent[] = ["view", "cta_click", "lead"];

// A 1x1 transparent GIF — the smallest thing that works with no JavaScript.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const brandId = (q.get("brandId") || "").trim();
  const slug = (q.get("slug") || "").trim();
  const event = (q.get("event") || "view").trim() as PageEvent;
  if (brandId && slug && EVENTS.includes(event)) {
    const rl = rateLimit(clientKey(req, `pv:${brandId}:${slug}`), 120, 60_000, Date.now());
    if (rl.ok) await recordPageEvent(brandId, slug, event);
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      // Never cache, or a view is counted once and then never again.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Length": String(PIXEL.length),
    },
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "page-analytics"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const brandId = s("brandId");
  const slug = s("slug");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  // Reading the numbers is the owner's business; recording an event is the
  // public page's.
  if (s("action") === "stats") {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (slug) return NextResponse.json({ report: reportFor(await getPageStats(brandId, slug)), minViews: MIN_VIEWS });
    const all = await listPageStats(brandId);
    return NextResponse.json({ reports: all.map(reportFor), minViews: MIN_VIEWS });
  }

  const event = s("event") as PageEvent;
  if (!slug || !EVENTS.includes(event)) {
    return NextResponse.json({ error: `event must be one of: ${EVENTS.join(", ")}` }, { status: 400 });
  }
  await recordPageEvent(brandId, slug, event);
  return NextResponse.json({ ok: true });
}
