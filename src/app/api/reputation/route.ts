import { NextRequest, NextResponse } from "next/server";
import {
  computeTrust, analyseSentiment, draftResponse, fakeReviewRisk, reviewToAssets, competitorTrust, sampleReviews,
  type Review,
} from "@/backend/reputation";

// Trust, Reviews & Reputation Engine API (Trustpilot/Yelp-inspired).
// POST { action: "trust"|"sentiment"|"fakecheck", business, reviews? }
// POST { action: "respond", business, review }
// POST { action: "assets", business, review }
// POST { action: "compare", business, reviews?, competitors[] }
// GET → engine doctrine

function parseReviews(body: Record<string, unknown>): Review[] {
  return Array.isArray(body.reviews) ? (body.reviews as Review[]) : [];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "trust";
  const business = typeof body.business === "string" ? body.business : "Brixton Grill House";
  const reviews = parseReviews(body);

  if (action === "trust") return NextResponse.json(computeTrust(business, reviews));
  if (action === "sentiment") return NextResponse.json(analyseSentiment(business, reviews));
  if (action === "fakecheck") return NextResponse.json(fakeReviewRisk(reviews.length ? reviews : sampleReviews(business)));
  if (action === "respond") {
    const review = (body.review as Review) || sampleReviews(business).find((r) => r.rating <= 2)!;
    return NextResponse.json(draftResponse(review, business, typeof body.tone === "string" ? body.tone : undefined));
  }
  if (action === "assets") {
    const review = (body.review as Review) || sampleReviews(business).find((r) => r.rating >= 5)!;
    return NextResponse.json(reviewToAssets(review, business));
  }
  if (action === "compare") {
    const mine = computeTrust(business, reviews);
    const competitors = Array.isArray(body.competitors) ? (body.competitors as { name: string; rating: number; reviews: number }[]) : [];
    return NextResponse.json(competitorTrust(mine, competitors));
  }
  return NextResponse.json({ error: "Unknown action — use trust, sentiment, fakecheck, respond, assets or compare" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Trust, Reviews & Reputation Engine (Trustpilot/Yelp-inspired)",
    doctrine: "Reviews are EARNED, never fabricated. The engine drafts responses + marketing assets from REAL reviews, flags manipulation, ties trust to AI-search visibility, and never invents a rating.",
    actions: ["trust", "sentiment", "respond", "assets", "fakecheck", "compare"],
  });
}
