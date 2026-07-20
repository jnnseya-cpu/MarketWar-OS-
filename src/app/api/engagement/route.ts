import { NextRequest, NextResponse } from "next/server";
import {
  aiSegment,
  campaignAnalytics,
  suggestReply,
  eligibleToSend,
  demoEngagement,
  demoContacts,
  LIFECYCLE_AUTOMATIONS,
  TRANSACTIONAL_TYPES,
  type Contact,
  type CampaignInput,
} from "@/backend/engagement";

// Customer Engagement Engine API (Brevo-class CRM + CDP + lifecycle).
// POST { action, ... }:
//   "segment"      { contacts? } → AI smart segments
//   "analytics"    { campaign? } → 14-metric campaign analytics
//   "suggest-reply"{ message }   → AI reply draft + intent (never auto-sent)
//   "eligible"     { contact }   → consent + frequency-cap gate
//   "automations"                → lifecycle automations + transactional types
// GET → doctrine + automations + transactional types + demoEngagement().

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  switch (action) {
    case "segment": {
      const contacts = Array.isArray(body.contacts)
        ? (body.contacts as Contact[])
        : demoContacts();
      return NextResponse.json({ segments: aiSegment(contacts), total: contacts.length });
    }

    case "analytics": {
      const campaign = body.campaign ? (body.campaign as CampaignInput) : undefined;
      return NextResponse.json({ metrics: campaignAnalytics(campaign) });
    }

    case "suggest-reply": {
      if (typeof body.message !== "string" || body.message.trim() === "") {
        return NextResponse.json({ error: "Missing 'message' (thread text) for suggest-reply" }, { status: 400 });
      }
      return NextResponse.json(suggestReply(body.message));
    }

    case "eligible": {
      if (!body.contact || typeof body.contact !== "object") {
        return NextResponse.json({ error: "Missing 'contact' for eligible" }, { status: 400 });
      }
      return NextResponse.json(eligibleToSend(body.contact as Contact));
    }

    case "automations": {
      return NextResponse.json({ automations: LIFECYCLE_AUTOMATIONS, transactionalTypes: TRANSACTIONAL_TYPES });
    }

    default:
      return NextResponse.json(
        { error: "Unknown or missing 'action'. Use: segment, analytics, suggest-reply, eligible, automations." },
        { status: 400 },
      );
  }
}

export async function GET() {
  return NextResponse.json({
    engine: "Customer Engagement Engine (Brevo-class CRM + CDP + lifecycle automation)",
    doctrine:
      "Predictions are labelled estimates, never presented as guaranteed results. Marketing sends require opted-in consent and are capped at 5 touches per rolling 7 days. AI replies are drafts — reviewed and edited by a human, never auto-sent. No fabricated metrics or testimonials.",
    lifecycleAutomations: LIFECYCLE_AUTOMATIONS,
    transactionalTypes: TRANSACTIONAL_TYPES,
    demo: demoEngagement(),
  });
}
