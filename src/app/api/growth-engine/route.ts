import { NextRequest, NextResponse } from "next/server";
import { hashtagsFor, hashtagsForAll, PLATFORM_RULES, type Platform } from "@/backend/hashtags";
import { bestPostingTimes, MIN_CLICKS_TO_JUDGE } from "@/backend/posting-time";
import { brandEvents } from "@/backend/email-events";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import type { TargetMarket } from "@/shared/market";

// AI Growth Engine — the two tools that had no engine behind them.
//
// POST { action: "hashtags", text, platform | platforms[], brandName?, industry?, places?, campaign? }
// POST { action: "posting-times", brandId, market?, timezone? }
// GET  → the doctrine, and the per-platform rules
//
// Neither of these calls a provider: hashtags come out of the customer's own
// post and their own brand, and posting times come out of their own delivery
// ledger. Nothing to meter, so nothing is charged — a tool that costs us no
// provider spend should not invent a fee to look valuable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "growth-engine"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  if (action === "hashtags") {
    const text = str("text");
    const shared = {
      text,
      brandName: str("brandName") || undefined,
      industry: str("industry") || undefined,
      campaign: str("campaign") || undefined,
      places: Array.isArray(body.places) ? body.places.map(String).filter(Boolean) : [],
    };
    const valid = PLATFORM_RULES.map((r) => r.platform);
    const many = Array.isArray(body.platforms)
      ? (body.platforms.map(String).filter((p): p is Platform => valid.includes(p as Platform)))
      : [];
    if (many.length) return NextResponse.json({ sets: hashtagsForAll(shared, many) });
    const one = str("platform") as Platform;
    if (!valid.includes(one)) {
      return NextResponse.json({ error: `platform must be one of ${valid.join(", ")}` }, { status: 400 });
    }
    return NextResponse.json({ sets: [hashtagsFor({ ...shared, platform: one })] });
  }

  if (action === "posting-times") {
    const brandId = str("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
    // The ledger is the customer's own data, so the same ownership check that
    // guards the Email Centre guards it here.
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const events = await brandEvents(brandId).catch(() => []);
    const market = (body.market as TargetMarket | undefined) ?? null;
    return NextResponse.json(bestPostingTimes({ events, market, timezone: str("timezone") || undefined }));
  }

  return NextResponse.json({ error: "Unknown action — use hashtags or posting-times" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Growth Engine — hashtags and posting times, from your own data",
    doctrine:
      "No hashtag volume, reach or difficulty figures are shown, because nobody selling a hashtag tool can measure any of them for your account and a number that cannot be measured is a number that was invented. Tags are pulled from the post you wrote, your brand, your industry and the places you sell in, and each one says where it came from. Per-platform limits are applied: what a platform documents is called a limit, what people have found works is called a convention. " +
      `Posting times are measured from your own delivery ledger — clicks weighted over opens, because an open can be a privacy relay fetching an image near delivery. Below ${MIN_CLICKS_TO_JUDGE} clicks nothing is claimed: you get your market's waking hours, labelled as a starting point rather than a finding.`,
    platforms: PLATFORM_RULES,
  });
}
