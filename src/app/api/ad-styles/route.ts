import { NextRequest, NextResponse } from "next/server";
import { AD_STYLES, adStyle, briefFor, stylesForPlatform } from "@/backend/ad-styles";
import { latestSiteFacts, memoryFactsFrom } from "@/backend/site-facts";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// Ad formats — UGC, street interview, podcast clip, founder-to-camera and the
// rest of the shapes short-form advertising actually comes in.
//
// GET  ?platform=tiktok  → the styles, filtered to where they run
// POST { styleId, product, … } → the shot-by-shot brief and the video prompt
//
// WHAT THIS DOES NOT DO IS PREDICT PERFORMANCE. The competitor version of this
// screen puts a number beside each format — "UGC testimonial: 8.7 virality" —
// and that number is generated, not measured. Nobody outside the advertiser
// knows what a format returned, and a score with no denominator is the exact
// thing this platform refuses to ship. What comes back instead is a shot list
// you can film and a checklist of what makes the format work, which is the part
// that transfers.
//
// NOT METERED: the brief is deterministic local text. The ACU is spent later, if
// and when the customer sends it to the video gateway.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") || "";
  const styles = platform ? stylesForPlatform(platform) : AD_STYLES;
  return NextResponse.json({
    styles,
    of: AD_STYLES.length,
    note: "No format is ranked, because nobody outside the advertiser knows what an ad returned. Pick by what you can actually film: a street interview needs a street and consent, a podcast clip needs two chairs and a microphone.",
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "ad-styles"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const brandId = str("brandId");

  // Brand-scoped when a brand is named, because the stored crawl is that
  // brand's data. Without one it is a plain authenticated call.
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  } else {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const styleId = str("styleId");
  if (!styleId) return NextResponse.json({ error: "styleId required", styles: AD_STYLES.map((s) => s.id) }, { status: 400 });
  if (!adStyle(styleId)) return NextResponse.json({ error: `Unknown style "${styleId}"`, styles: AD_STYLES.map((s) => s.id) }, { status: 400 });

  // The facts come from the stored crawl when there is one. A brief written
  // against what the site actually says beats a brief written against a guess,
  // and an invented fact in a shot list becomes an invented claim on camera.
  let facts: string[] = [];
  let factsAgeDays: number | null = null;
  if (brandId) {
    const stored = await latestSiteFacts(brandId);
    if (stored) {
      factsAgeDays = stored.ageDays;
      facts = memoryFactsFrom(stored).map((f) => `${f.key}: ${f.value}`).slice(0, 12);
    }
  }
  const supplied = Array.isArray(body.facts) ? (body.facts as unknown[]).filter((f): f is string => typeof f === "string") : [];

  const res = briefFor({
    styleId,
    product: str("product"),
    audience: str("audience") || undefined,
    problem: str("problem") || undefined,
    outcome: str("outcome") || undefined,
    brandColours: Array.isArray(body.brandColours) ? (body.brandColours as unknown[]).filter((c): c is string => typeof c === "string") : undefined,
    seconds: typeof body.seconds === "number" ? body.seconds : undefined,
    facts: [...supplied, ...facts],
  });

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({
    ...res.brief,
    factsUsed: facts.length + supplied.length,
    factsNote: facts.length
      ? `${facts.length} fact(s) came from your stored site crawl${factsAgeDays != null ? `, ${factsAgeDays} day(s) old` : ""}, so the brief describes what your site actually says rather than what a model assumed.`
      : "No stored site facts for this brand, so the brief stays generic where a fact would have been. Run a crawl and this gets specific.",
    charged: false,
  });
}
