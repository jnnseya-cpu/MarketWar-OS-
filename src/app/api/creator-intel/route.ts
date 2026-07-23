import { NextRequest, NextResponse } from "next/server";
import {
  scoreCreator,
  shortlist,
  campaignBrief,
  demoCreatorIntel,
  DISCOVERY_SIGNALS,
  CONSENT_DOCTRINE,
  type CreatorInput,
  type CampaignBriefInput,
} from "@/backend/creator-intel";
import { rateLimit, clientKey } from "@/backend/guard";

// Influencer & Creator Intelligence API (Organic Dominance §22).
// POST { action: "score",     input: { handle, followers, engagementRate?, topic?, geography?, brandSafe? } }
// POST { action: "shortlist", creators: CreatorInput[] }
// POST { action: "brief",     input: { handle, product, budgetGbp? } }
// GET  → doctrine + discovery signals + demo creator intelligence.

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "creator-intel"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const input = (body.input ?? {}) as Record<string, unknown>;

  if (action === "score") {
    if (typeof input.handle !== "string" || !input.handle.trim()) {
      return NextResponse.json({ error: "input.handle is required" }, { status: 400 });
    }
    if (typeof input.followers !== "number" || !Number.isFinite(input.followers)) {
      return NextResponse.json({ error: "input.followers (number) is required" }, { status: 400 });
    }
    return NextResponse.json(scoreCreator(body.input as CreatorInput));
  }

  if (action === "shortlist") {
    if (!Array.isArray(body.creators) || body.creators.length === 0) {
      return NextResponse.json({ error: "creators (non-empty array) is required" }, { status: 400 });
    }
    return NextResponse.json({ shortlist: shortlist(body.creators as CreatorInput[]) });
  }

  if (action === "brief") {
    if (typeof input.handle !== "string" || !input.handle.trim()) {
      return NextResponse.json({ error: "input.handle is required" }, { status: 400 });
    }
    if (typeof input.product !== "string" || !input.product.trim()) {
      return NextResponse.json({ error: "input.product is required" }, { status: 400 });
    }
    return NextResponse.json(campaignBrief(body.input as CampaignBriefInput));
  }

  return NextResponse.json(
    { error: "Unknown action — use score, shortlist or brief" },
    { status: 400 },
  );
}

export async function GET() {
  return NextResponse.json({
    engine: "Influencer & Creator Intelligence (Organic Dominance §22)",
    doctrine:
      "Discover, score and brief creators MICRO-FIRST — a commercially effective, brand-safe local micro-influencer beats raw follower count. All signal scores, fit scores and priorities are ESTIMATES, never measured facts. We NEVER fabricate audience, engagement or conversion data — only supplied inputs are scored. Every brief carries a mandatory paid-partnership disclosure. Any outreach requires consent and is capped at 5 touches per 7 days.",
    actions: ["score", "shortlist", "brief"],
    discoverySignals: DISCOVERY_SIGNALS,
    consentDoctrine: CONSENT_DOCTRINE,
    demo: demoCreatorIntel(),
  });
}
