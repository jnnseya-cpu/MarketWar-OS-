import { NextRequest, NextResponse } from "next/server";
import {
  verifyClaim,
  reviewCampaign,
  provenanceMetadata,
  demoCompliance,
  REGULATED_CATEGORIES,
  type ClaimInput,
  type CampaignReviewInput,
  type ProvenanceInput,
} from "@/backend/compliance";

// Claims & Compliance Engine API — Shared Intelligence layer.
// POST { action: "verify", input: ClaimInput }
// POST { action: "review", input: CampaignReviewInput }
// POST { action: "provenance", input: ProvenanceInput }
// GET → doctrine + regulated categories + demo campaign review.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "verify") {
    const input = body.input as ClaimInput | undefined;
    if (!input || typeof input.text !== "string" || input.text.trim().length === 0) {
      return NextResponse.json({ error: "verify requires input.text (non-empty string)" }, { status: 400 });
    }
    return NextResponse.json(verifyClaim(input));
  }

  if (action === "review") {
    const input = body.input as CampaignReviewInput | undefined;
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "review requires an input object" }, { status: 400 });
    }
    return NextResponse.json(reviewCampaign(input));
  }

  if (action === "provenance") {
    const input = body.input as ProvenanceInput | undefined;
    if (!input || typeof input.assetId !== "string" || typeof input.aiGenerated !== "boolean") {
      return NextResponse.json(
        { error: "provenance requires input.assetId (string) and input.aiGenerated (boolean)" },
        { status: 400 },
      );
    }
    return NextResponse.json(provenanceMetadata(input));
  }

  return NextResponse.json(
    { error: "Unknown action — use verify, review or provenance" },
    { status: 400 },
  );
}

export async function GET() {
  return NextResponse.json({
    engine: "Claims & Compliance Engine (Claim Verification + Compliance + provenance)",
    doctrine:
      "HONESTY: claims are ESTIMATES until substantiated. An unsubstantiated superlative/absolute claim is NEVER publishable, and AI-generated assets ALWAYS carry a synthetic-media disclosure with recorded creator consent.",
    actions: ["verify", "review", "provenance"],
    regulatedCategories: REGULATED_CATEGORIES,
    demo: demoCompliance(),
  });
}
