import { NextRequest, NextResponse } from "next/server";
import {
  analyseVoice,
  backlogBridge,
  demoCustomerVoice,
  INPUT_TYPES,
  CONSENT_DOCTRINE,
  type VoiceInput,
  type BacklogInput,
} from "@/backend/customer-voice";

// Customer Voice Intelligence + Product Backlog Bridge API (Organic Dominance §21).
// POST { action: "analyse", input: { items: [...] } } → clustered voice analysis
// POST { action: "backlog", input: { theme, mentionVolume, segment?, revenueImpactGbp? } } → product requirement
// GET → doctrine + INPUT_TYPES + demoCustomerVoice()
// Doctrine: never fabricate feedback/testimonials; only cluster supplied items.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "analyse") {
    const input = body.input as VoiceInput | undefined;
    if (!input || !Array.isArray(input.items)) {
      return NextResponse.json({ error: "Missing input.items[] — supply an array of { text, type?, sentiment? } items" }, { status: 400 });
    }
    return NextResponse.json(analyseVoice(input));
  }

  if (action === "backlog") {
    const input = body.input as BacklogInput | undefined;
    if (!input || typeof input.theme !== "string" || input.theme.trim().length === 0) {
      return NextResponse.json({ error: "Missing input.theme — supply a validated insight theme" }, { status: 400 });
    }
    if (typeof input.mentionVolume !== "number" || !Number.isFinite(input.mentionVolume)) {
      return NextResponse.json({ error: "Missing input.mentionVolume — supply the numeric mention volume" }, { status: 400 });
    }
    return NextResponse.json(backlogBridge(input));
  }

  return NextResponse.json({ error: "Unknown action — use analyse or backlog" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Customer Voice Intelligence + Product Backlog Bridge (Organic Dominance §21)",
    doctrine:
      "Turns marketing/support/sales feedback into clustered voice-of-customer intelligence, then bridges validated insights into evidence-backed product requirements. NEVER fabricates feedback, testimonials or reviews — clusters SUPPLIED items only and labels every output an ESTIMATE.",
    consentDoctrine: CONSENT_DOCTRINE,
    inputTypes: INPUT_TYPES,
    actions: ["analyse", "backlog"],
    demo: demoCustomerVoice(),
  });
}
