import { NextRequest, NextResponse } from "next/server";
import { analyseAds, recreationRefused, PATTERNS, WHERE_TO_LOOK, MIN_ADS_TO_JUDGE, AD_INTEL_DOCTRINE, type ObservedAd, type AdSource } from "@/backend/ad-intel";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// Ad intelligence — what shape the ads in your category take.
//
// GET                        → the patterns counted, and where to collect ads lawfully
// POST { ads: [...] }        → the counts, the norms, the open ground
// POST { action: "recreate" } → refused, with the reason and the alternative
//
// TWO THINGS THIS DELIBERATELY WILL NOT DO.
//
// It will not RECREATE a competitor's ad. That is the headline feature of the
// products this closes the gap against, and it is the half that is a lawsuit:
// an advertisement is a copyright work, its distinctive look can be protected
// trade dress, and the liability for publishing a copy lands on the customer
// rather than on the tool. The refusal is a code path, not a paragraph in the
// terms, so a future caller has to go through it.
//
// It will not call anything a WINNER. An ad running for a long time is evidence
// of a budget, not of a result — only the advertiser knows what it returned. So
// what comes back is counts with denominators over the ads you supplied, and
// below MIN_ADS_TO_JUDGE it declines to call anything a pattern at all.
//
// NOT METERED: this counts strings the customer pasted. No provider is called.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SOURCES: AdSource[] = ["meta-ad-library", "observed", "own", "supplied"];

export async function GET() {
  return NextResponse.json({
    patterns: PATTERNS.map(({ id, label, soWhat }) => ({ id, label, soWhat })),
    whereToLook: WHERE_TO_LOOK,
    minAdsToJudge: MIN_ADS_TO_JUDGE,
    doctrine: AD_INTEL_DOCTRINE,
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "ad-intel"), 40, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const action = typeof body.action === "string" ? body.action.trim() : "analyse";

  // The refusal is served BEFORE anything is parsed, so there is no path where
  // a recreate request accidentally falls through into an analysis that
  // returns enough to reconstruct the ad anyway.
  if (action === "recreate" || action === "remix" || action === "clone") {
    const advertiser = typeof body.advertiser === "string" ? body.advertiser.trim() : "";
    return NextResponse.json(recreationRefused(advertiser || undefined), { status: 400 });
  }

  if (action !== "analyse") return NextResponse.json({ error: "Unknown action — use analyse." }, { status: 400 });

  const raw = Array.isArray(body.ads) ? body.ads : [];
  if (raw.length > 500) return NextResponse.json({ error: "That is more than 500 ads. Trim it — the counts stop changing long before this." }, { status: 400 });

  const ads: ObservedAd[] = raw
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .map((a, i) => ({
      id: typeof a.id === "string" ? a.id : `ad-${i + 1}`,
      advertiser: typeof a.advertiser === "string" ? a.advertiser.slice(0, 120) : "unknown",
      source: SOURCES.includes(a.source as AdSource) ? (a.source as AdSource) : "observed",
      headline: typeof a.headline === "string" ? a.headline.slice(0, 400) : undefined,
      body: typeof a.body === "string" ? a.body.slice(0, 4000) : undefined,
      cta: typeof a.cta === "string" ? a.cta.slice(0, 120) : undefined,
      format: a.format === "image" || a.format === "video" || a.format === "carousel" ? a.format : undefined,
      firstSeen: typeof a.firstSeen === "string" ? a.firstSeen : undefined,
      lastSeen: typeof a.lastSeen === "string" ? a.lastSeen : undefined,
      platforms: Array.isArray(a.platforms) ? (a.platforms as unknown[]).filter((p): p is string => typeof p === "string") : undefined,
    }));

  return NextResponse.json({ ...analyseAds(ads), whereToLook: WHERE_TO_LOOK, charged: false });
}
