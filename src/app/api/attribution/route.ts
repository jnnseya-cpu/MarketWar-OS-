import { NextRequest, NextResponse } from "next/server";
import {
  FUNNEL_STAGES,
  attributeChannels,
  contentRoi,
  demoAttribution,
  viralToRevenue,
  type ContentRoiInput,
  type Touchpoint,
  type ViralFunnelInput,
} from "@/backend/attribution";
import { rateLimit, clientKey } from "@/backend/guard";

// Revenue Attribution + Viral-to-Revenue API.
// POST { action: "funnel",   input: ViralFunnelInput }  → 8-stage funnel + biggest leak + revenue estimate
// POST { action: "channels", touchpoints: Touchpoint[] } → U-shaped channel attribution
// POST { action: "roi",      input: ContentRoiInput }   → content ROI verdict
// GET                                                   → doctrine + FUNNEL_STAGES + demo

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "attribution"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;

  if (action === "funnel") {
    const input = body.input as ViralFunnelInput | undefined;
    if (!input || typeof input.impressions !== "number") {
      return NextResponse.json({ error: "input.impressions (number) is required" }, { status: 400 });
    }
    return NextResponse.json(viralToRevenue(input));
  }

  if (action === "channels") {
    if (!Array.isArray(body.touchpoints)) {
      return NextResponse.json({ error: "touchpoints (array) is required" }, { status: 400 });
    }
    const touchpoints = body.touchpoints as Touchpoint[];
    return NextResponse.json(attributeChannels(touchpoints.slice(0, 10000)));
  }

  if (action === "roi") {
    const input = body.input as ContentRoiInput | undefined;
    if (!input || typeof input.contentCostGbp !== "number" || typeof input.attributedRevenueGbp !== "number") {
      return NextResponse.json(
        { error: "input.contentCostGbp and input.attributedRevenueGbp (numbers) are required" },
        { status: 400 },
      );
    }
    return NextResponse.json(contentRoi(input));
  }

  return NextResponse.json({ error: "Unknown action — use funnel, channels or roi" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Revenue Attribution + Viral-to-Revenue Engine",
    doctrine:
      "Attribute earned revenue backwards across the funnel and across channels, honestly. Every figure is an ESTIMATE derived only from supplied counts — conversions, metrics and testimonials are never fabricated. Where attribution informs outbound follow-up, contact stays consented and capped at max 5 touches per 7 days.",
    model: "u-shaped (40% first / 20% mid / 40% last)",
    funnelStages: FUNNEL_STAGES,
    demo: demoAttribution(),
  });
}
