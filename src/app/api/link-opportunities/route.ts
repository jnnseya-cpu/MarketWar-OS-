import { NextRequest, NextResponse } from "next/server";
import { findLinkOpportunities } from "@/backend/link-opportunities";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// Link Opportunity Engine — POST { brand, website, competitors?, category?, market? }
//
// Returns REAL pages (found in live search) where a link can legitimately be
// EARNED, each with the evidence snippet and a pitch the human sends themselves.
// MarketWar never places, buys, exchanges or injects links — that breaches
// Google's link spam policy and the penalty lands on the customer's domain.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "link-opps"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Runs several live searches — meter it like any other external-data action.
  const meter = await meterAction(auth, "search", 3);
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const brand = s("brand") || s("business");
  if (!brand) return NextResponse.json({ error: "brand (or business) is required" }, { status: 400 });

  const report = await findLinkOpportunities({
    brand,
    website: s("website"),
    category: s("category") || s("industry"),
    market: s("market") || undefined,
    competitors: Array.isArray(body.competitors) ? body.competitors.map(String) : [],
    limit: typeof body.limit === "number" ? body.limit : 25,
  });
  return NextResponse.json(report);
}

export async function GET() {
  return NextResponse.json({
    engine: "Link Opportunity Engine — earn links, never place them",
    finds: [
      "unlinked_mention — pages already naming the brand with no link (highest conversion)",
      "resource_page — curated lists where inclusion is the page's purpose",
      "competitor_cited — publications already covering the category",
      "question_source — pages the brand can improve with first-hand evidence",
    ],
    doctrine:
      "Every opportunity is a real page returned by live search, with its URL and evidence snippet, listed for a human to pitch from their own mailbox. One opportunity per domain so no site is approached twice. Link sellers and spam directories are filtered out rather than pitched. MarketWar does not buy, exchange, inject or auto-place links, does not post to comments or forums, and does not use private blog networks — those breach Google's link spam policy and the penalty falls on the customer's domain.",
  });
}
