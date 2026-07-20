import { NextRequest, NextResponse } from "next/server";
import { onboard, demoOnboarding, type OnboardingInput } from "@/backend/onboarding";

// Autonomous Business & Market Onboarding Engine API (Organic Dominance §5).
// POST { action: "onboard", input: OnboardingInput } → full onboarding bundle
// GET → doctrine + a fully-populated demo onboarding (zero-config)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "onboard";

  if (action === "onboard") {
    const input = body.input as OnboardingInput | undefined;
    if (!input || typeof input.business !== "string" || input.business.trim().length === 0) {
      return NextResponse.json({ error: "input.business is required" }, { status: 400 });
    }
    return NextResponse.json(onboard(input));
  }

  return NextResponse.json({ error: "Unknown action — use onboard" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Autonomous Business & Market Onboarding (Organic Dominance §5) — business → brand voice, audience, personas, problem map, competitor angles, keyword/question/AI-prompt universes, pillars, conversion goals, 90-day plan",
    doctrine: "Every generated field is a LABELLED STARTING HYPOTHESIS / ESTIMATE, refined with real data. Never fabricate testimonials, reviews or metrics. Marketing sends require explicit consent and a frequency cap of max 5 touches per 7 days.",
    demo: demoOnboarding(),
  });
}
