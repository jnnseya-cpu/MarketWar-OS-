import { NextRequest, NextResponse } from "next/server";
import { hashtagsFor, hashtagsForAll, PLATFORM_RULES, type Platform } from "@/backend/hashtags";
import { bestPostingTimes, MIN_CLICKS_TO_JUDGE } from "@/backend/posting-time";
import { brandEvents } from "@/backend/email-events";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import type { TargetMarket } from "@/shared/market";

// AI Growth Engine — the two tools that had no engine behind them.
//
// POST { action: "hashtags", text, platform | platforms[], brandName?, industry?, places?, campaign? }
// POST { action: "posting-times", brandId, market?, timezone? }
// GET  → the doctrine, and the per-platform rules
//
// BOTH ARE METERED. Neither calls a provider — hashtags come out of the
// customer's own post, posting times out of their own delivery ledger — so an
// earlier version of this route charged nothing on the reasoning that a tool
// costing us no provider spend should not invent a fee. The owner's rule is
// narrower than that reasoning and it wins: every AI action is metered and
// gated by the ACU balance, with no exceptions, so the two tools on this page
// are metered like the rest. They are charged at the nominal `report` rate —
// the rate for work done on data the customer already owns — rather than at a
// provider-cost rate they do not incur, so the rule holds without overcharging
// for it.
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

  // Charged before the work, like everything else. An unknown action is
  // rejected first so a typo cannot cost anybody an ACU.
  if (action !== "hashtags" && action !== "posting-times") {
    return NextResponse.json({ error: "Unknown action — use hashtags or posting-times" }, { status: 400 });
  }
  const meter = await meterAction(auth, "report");
  if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });

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
