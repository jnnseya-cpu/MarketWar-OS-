import { NextRequest, NextResponse } from "next/server";
import { MAX_TOUCHES_PER_7D, planRetargeting, projectVirality, type RetargetSubject } from "@/backend/amplify";

// M-35 amplification API.
// POST { action: "virality", ...ViralInputs }        → honest K + reach projection
// POST { action: "retarget", subjects: [...] }       → compliant send plan
// GET                                                → engine doctrine + limits

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "virality") {
    const n = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
    const proj = projectVirality({
      seedAudience: Math.max(0, n(body.seedAudience, 1000)),
      shareRate: Math.min(1, Math.max(0, n(body.shareRate, 0.15))),
      invitesPerSharer: Math.max(0, n(body.invitesPerSharer, 3)),
      inviteConversion: Math.min(1, Math.max(0, n(body.inviteConversion, 0.25))),
      cycles: Math.max(1, n(body.cycles, 6)),
    });
    return NextResponse.json(proj);
  }

  if (body.action === "retarget") {
    const subjects = Array.isArray(body.subjects) ? (body.subjects as RetargetSubject[]) : [];
    return NextResponse.json({ maxTouchesPer7d: MAX_TOUCHES_PER_7D, ...planRetargeting(subjects.slice(0, 5000)) });
  }

  return NextResponse.json({ error: "Unknown action — use virality or retarget" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "M-35 Viral Amplification & Retargeting Engine",
    doctrine:
      "Reach is earned (viral loops through people who choose to share); follow-up is consented and frequency-capped. No cross-web surveillance, no uncapped frequency.",
    maxTouchesPer7d: MAX_TOUCHES_PER_7D,
    lawfulBasis: ["referral/UGC opt-in sharing", "first-party funnel interaction", "granted channel consent", "hard opt-out ends contact"],
  });
}
