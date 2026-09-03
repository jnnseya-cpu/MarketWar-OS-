export const maxDuration = 120;
import { NextResponse } from "next/server";
import { gatewayStatus } from "@/backend/gateway";

export const dynamic = "force-dynamic";

// Gateway health/config endpoint: which providers are configured, in what
// routing order, and whether the platform is running live or in demo mode.
// API keys themselves are never exposed.
async function GETImpl() {
  const status = gatewayStatus();
  return NextResponse.json({
    mode: status.live ? "live" : "demo",
    routingOrder: status.order,
    providers: status.providers,
  });
}


// EVERY ANSWER FROM THIS ROUTE IS JSON — see backend/route-guard.ts.
import { jsonRoute } from "@/backend/route-guard";
export const GET = jsonRoute(GETImpl as never, { maxSeconds: 120, label: "/api/gateway" });
