import { NextRequest, NextResponse } from "next/server";
import { integrationStatus, manualMode, connectorCharge, autonomyGuarantee, dependencyClassification, OWNED_CHANNELS, type IntegrationProvider } from "@/backend/integrations";

// Integration Adapter Layer API (independence keystone + platform-managed connectivity).
// GET → connector catalog + status + provisioning model + dependency classification + owned channels.
// POST { action: "manual", provider } → the manual-mode fallback steps.
// POST { action: "status" } → connection status + provisioning summary.
// POST { action: "charge", provider, providerCostGbp, units } → margin-protected
//   ACU cost of a platform-managed action (provider cost never returned).

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "status";
  if (action === "manual") {
    return NextResponse.json(manualMode(body.provider as IntegrationProvider));
  }
  if (action === "charge") {
    return NextResponse.json(connectorCharge({
      provider: body.provider as IntegrationProvider,
      providerCostGbp: typeof body.providerCostGbp === "number" ? body.providerCostGbp : 0,
      units: typeof body.units === "number" ? body.units : 1,
    }));
  }
  if (action === "status") return NextResponse.json(integrationStatus());
  return NextResponse.json({ error: "Unknown action — use status, manual or charge" }, { status: 400 });
}

export async function GET() {
  const status = integrationStatus();
  return NextResponse.json({
    layer: "Integration Adapter Layer — external APIs are optional connectors, never foundations",
    ...status,
    provisioningModel: {
      platform: "MarketWar owns the credential (admin-configured, server-side). The tenant does nothing — usage is billed through their plan / ACU wallet at the protected margin (≥2× floor, 4× target; provider cost never exposed).",
      user_connect: "The action runs on the tenant's OWN asset or money (ad spend, their payout Stripe, their store, their social Pages). One-click connect — never an API key to find — and the spend/data stays theirs.",
      manual_only: "No live provisioning; the manual-mode fallback is the path.",
      adminOnly: "Platform keys are admin-only: configured once in server env / Secret Manager, never surfaced to tenants.",
    },
    autonomyGuarantee: autonomyGuarantee(),
    dependencyClassification: dependencyClassification(),
    ownedChannels: OWNED_CHANNELS,
    doctrine: "MarketWar OS stays fully functional with every external API disconnected — every external action has a manual-mode fallback. Providers are isolated behind one adapter interface, so a pricing/policy/access change never breaks the OS. Where a connector runs on MarketWar's own infrastructure it is fully platform-managed so the tenant never touches a key; where it touches the tenant's own money or assets it is one-click connect.",
  });
}
