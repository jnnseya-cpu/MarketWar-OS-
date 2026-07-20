import { NextRequest, NextResponse } from "next/server";
import {
  unifiedInbox,
  pipeline,
  demoThreads,
  demoDeals,
  demoInbox,
  CHANNELS,
  PIPELINE_STAGES,
  type Thread,
  type Deal,
} from "@/backend/inbox";

// Unified Inbox + CRM Pipeline Engine API (Brevo/Yelp-class).
// POST { action: "inbox", threads?, slaMinutes? } — omit threads to use demo threads.
// POST { action: "pipeline", deals? } — omit deals to use demo deals.
// GET → engine doctrine + CHANNELS + PIPELINE_STAGES + demoInbox().
//
// AI replies are DRAFTS and are never auto-sent; summaries/forecasts are
// labelled ESTIMATES. No provider cost or secret is ever exposed.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "inbox") {
    const threads: Thread[] = Array.isArray(body.threads) ? (body.threads as Thread[]) : demoThreads();
    let slaMinutes = 60;
    if (body.slaMinutes !== undefined) {
      if (typeof body.slaMinutes !== "number" || !Number.isFinite(body.slaMinutes) || body.slaMinutes <= 0) {
        return NextResponse.json({ error: "slaMinutes must be a positive number" }, { status: 400 });
      }
      slaMinutes = body.slaMinutes;
    }
    return NextResponse.json(unifiedInbox(threads, slaMinutes));
  }

  if (action === "pipeline") {
    const deals: Deal[] = Array.isArray(body.deals) ? (body.deals as Deal[]) : demoDeals();
    return NextResponse.json(pipeline(deals));
  }

  return NextResponse.json({ error: "Unknown action — use inbox or pipeline" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Unified Inbox + CRM Pipeline Engine (Brevo/Yelp-class)",
    doctrine:
      "One prioritised inbox across every channel. AI replies are DRAFTS and are NEVER auto-sent — a human reviews and sends. Summaries, priorities and the weighted forecast are ESTIMATES; the engine never fabricates a message, contact or metric. Outbound marketing touches require consent + max 5 touches per 7 days.",
    actions: ["inbox", "pipeline"],
    channels: CHANNELS,
    pipelineStages: PIPELINE_STAGES,
    demo: demoInbox(),
  });
}
