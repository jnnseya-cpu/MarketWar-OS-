import { NextRequest, NextResponse } from "next/server";
import {
  PRINT_SIZES, GROUP_KINDS, flyerPlan, draftGroupPost, followerPlays,
  printSpec, FOLLOWER_DOCTRINE, PRINT_DPI, BLEED_MM, SAFE_MARGIN_MM, QR_MIN_MM,
} from "@/backend/local-outreach";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// Local outreach — printed flyers and local-group posts.
//
// POST { action: "flyer", sizeId, headline, subhead?, offer?, cta?, qrTarget?, … }
// POST { action: "group-post", kindId, brandName, town?, what, offer?, link? }
// POST { action: "followers", hasFlyer?, hasReviews?, hasStaff? }
// GET  → print sizes, group types, and what is and is not automatable
//
// Metered at the `report` rate: the work is layout arithmetic and drafting on
// the customer's own words, with no provider call behind it — but every AI
// action is metered, so this one is too.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "local-outreach"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const action = str("action");
  if (action !== "flyer" && action !== "group-post" && action !== "followers") {
    return NextResponse.json({ error: "Unknown action — use flyer, group-post or followers" }, { status: 400 });
  }

  const meter = await meterAction(auth, "report");
  if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });

  if (action === "flyer") {
    const res = flyerPlan({
      sizeId: str("sizeId") || "a5",
      headline: str("headline"),
      subhead: str("subhead") || undefined,
      proof: str("proof") || undefined,
      offer: str("offer") || undefined,
      cta: str("cta") || undefined,
      contact: str("contact") || undefined,
      qrTarget: str("qrTarget") || undefined,
      qrSizeMm: typeof body.qrSizeMm === "number" ? body.qrSizeMm : undefined,
      dpi: typeof body.dpi === "number" ? body.dpi : undefined,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res.plan);
  }

  if (action === "group-post") {
    const res = draftGroupPost({
      kindId: str("kindId"),
      brandName: str("brandName") || "our business",
      town: str("town") || undefined,
      what: str("what"),
      offer: str("offer") || undefined,
      link: str("link") || undefined,
      personalNote: str("personalNote") || undefined,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res.post);
  }

  return NextResponse.json({
    doctrine: FOLLOWER_DOCTRINE,
    plays: followerPlays({
      hasFlyer: typeof body.hasFlyer === "boolean" ? body.hasFlyer : undefined,
      hasReviews: typeof body.hasReviews === "boolean" ? body.hasReviews : undefined,
      hasStaff: typeof body.hasStaff === "boolean" ? body.hasStaff : undefined,
    }),
  });
}

export async function GET() {
  return NextResponse.json({
    engine: "Local outreach — flyers that print properly and group posts that survive the admins",
    print: {
      dpi: PRINT_DPI, bleedMm: BLEED_MM, safeMarginMm: SAFE_MARGIN_MM, qrMinMm: QR_MIN_MM,
      sizes: PRINT_SIZES.map((s) => ({ ...s, spec: printSpec(s.id) })),
    },
    groups: GROUP_KINDS,
    followers: FOLLOWER_DOCTRINE,
    automation:
      "Nothing here posts on your behalf into somebody else's community. Meta's Groups API only permits posting into a group that installed the app, Nextdoor has no third-party posting API for neighbourhood posts, and every local group's rules require a member to post. Tools that claim otherwise drive an unofficial session and get the account restricted.",
  });
}
