import { NextResponse } from "next/server";
import { gatewayStatus, unknownProvidersInOrder } from "@/backend/gateway";

// AI gateway self-diagnostic.
//
// This exists because the platform and its owner spent a day disagreeing about
// whether a key was set. It was — in Vercel production, where neither a local
// shell nor a build log can see it. The only trustworthy answer comes from the
// running deployment, so it reports it: which providers the gateway resolved,
// which have a key, the order they will be tried in, and anything in
// AI_GATEWAY_ORDER it did not recognise.
//
// SAFE: never returns a key, a prefix, or a length — only whether one is present.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const st = gatewayStatus();
  const unknown = unknownProvidersInOrder();
  const configured = st.providers.filter((p) => p.configured);
  const missing = st.providers.filter((p) => !p.configured).map((p) => p.id);

  const verdict = configured.length === 0
    ? "RED — no AI provider key is readable by the running deployment. Every AI surface is in demo mode."
    : configured.length === 1
      ? `AMBER — only ${configured[0].id} is live. There is no fallback: when it is slow or down, every AI surface fails.`
      : `GREEN — ${configured.length} providers live, tried in order: ${st.providers.filter((p) => p.configured).map((p) => p.id).join(" → ")}.`;

  return NextResponse.json({
    service: "ai-gateway",
    verdict,
    // The order the gateway ACTUALLY resolved, after AI_GATEWAY_ORDER is applied.
    // AI_GATEWAY_ORDER is a preference, not an allowlist — a provider with a key
    // is always tried, whether or not it is named there.
    resolvedOrder: st.order,
    providers: st.providers.map((p) => ({
      id: p.id,
      keyPresent: p.configured,
      model: p.model,
      demotedAfterRecentFailure: Boolean(p.cooling),
    })),
    missingKeys: missing,
    aiGatewayOrderSet: Boolean((process.env.AI_GATEWAY_ORDER || "").trim()),
    unrecognisedInOrder: unknown,
    note: [
      st.note,
      unknown.length
        ? `AI_GATEWAY_ORDER contains ${unknown.map((u) => `"${u}"`).join(", ")}, which name no provider — check for a typo. They are ignored, and every provider with a key is still used.`
        : "",
      missing.length
        ? `No key readable for: ${missing.join(", ")}. If you believe a key IS set in the hosting dashboard, confirm it is enabled for the Production environment and that the deployment was rebuilt after it was added — environment variables are read at runtime by this route, so what you see here is what the live function sees.`
        : "",
    ].filter(Boolean).join(" "),
  });
}
