import { NextRequest, NextResponse } from "next/server";
import {
  catalogueStats, eventsByCategory, fanout, previewEmail, sendTest, demoComms,
  EVENTS, CHANNELS, type ChannelPrefs, type Brand,
} from "@/backend/comms-events";

// Communication Event Architecture API. One catalogue, many channels.
// POST { action: "fanout", eventId, prefs? }            → channels for a recipient (mandatory bypass)
// POST { action: "preview", eventId, brand{}, tokens? } → branded email preview
// POST { action: "test", eventId, prefs? }              → simulated test send (sandbox)
// GET  → full catalogue + stats + demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const prefs = (body.prefs as ChannelPrefs) ?? {};

  if (action === "fanout") {
    if (!eventId) return NextResponse.json({ error: "fanout requires eventId" }, { status: 400 });
    const r = fanout(eventId, prefs);
    return NextResponse.json(r, { status: "error" in r ? 404 : 200 });
  }
  if (action === "preview") {
    if (!eventId) return NextResponse.json({ error: "preview requires eventId" }, { status: 400 });
    const r = previewEmail(eventId, (body.brand as Brand) ?? { name: "Your brand" }, (body.tokens as Record<string, string>) ?? {});
    return NextResponse.json(r, { status: "error" in r ? 404 : 200 });
  }
  if (action === "test") {
    if (!eventId) return NextResponse.json({ error: "test requires eventId" }, { status: 400 });
    const r = sendTest(eventId, prefs);
    return NextResponse.json(r, { status: "error" in r ? 404 : 200 });
  }
  return NextResponse.json({ error: "Unknown action — use fanout, preview or test" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Communication Event Architecture — one event engine, many channels",
    doctrine: "Every product event is defined once and fans out across email · in-app · SMS · push · WhatsApp, honouring each recipient's opt-outs. Mandatory notices (security, billing-critical, compliance, outage) bypass opt-outs by necessity. Marketing consent + the 5-touch/7-day cap apply to journeys, never to these transactional notices.",
    channels: CHANNELS,
    stats: catalogueStats(),
    eventsByCategory: eventsByCategory(),
    totalEventsInCatalogue: EVENTS.length,
    demo: demoComms(),
  });
}
