import { NextResponse } from "next/server";
import { gatewayStatus } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

// Gateway health/config endpoint: which providers are configured, in what
// routing order, and whether the platform is running live or in demo mode.
// API keys themselves are never exposed.
export async function GET() {
  const status = gatewayStatus();
  return NextResponse.json({
    mode: status.live ? "live" : "demo",
    routingOrder: status.order,
    providers: status.providers,
  });
}
