import { NextRequest, NextResponse } from "next/server";
import { integrationStatus, manualMode, dependencyClassification, OWNED_CHANNELS, type IntegrationProvider } from "@/backend/integrations";

// Integration Adapter Layer API (independence keystone).
// GET → connector catalog + status + dependency classification + owned channels.
// POST { action: "manual", provider } → the manual-mode fallback steps.
// POST { action: "status" } → connection status.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "status";
  if (action === "manual") {
    return NextResponse.json(manualMode(body.provider as IntegrationProvider));
  }
  if (action === "status") return NextResponse.json(integrationStatus());
  return NextResponse.json({ error: "Unknown action — use status or manual" }, { status: 400 });
}

export async function GET() {
  const status = integrationStatus();
  return NextResponse.json({
    layer: "Integration Adapter Layer — external APIs are optional connectors, never foundations",
    ...status,
    dependencyClassification: dependencyClassification(),
    ownedChannels: OWNED_CHANNELS,
    doctrine: "MarketWar OS stays fully functional with every external API disconnected — every external action has a manual-mode fallback. Providers are isolated behind one adapter interface, so a pricing/policy/access change never breaks the OS.",
  });
}
