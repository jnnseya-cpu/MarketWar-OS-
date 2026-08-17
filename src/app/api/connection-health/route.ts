import { NextRequest, NextResponse } from "next/server";
import { brandChannelHealth, CONNECTION_HEALTH_DOCTRINE } from "@/backend/connection-health";
import { preflight, CHECKS, PLATFORM_LIMITS, PREFLIGHT_DOCTRINE } from "@/backend/publish-preflight";
import { metaConnectionPublic } from "@/backend/meta-publish";
import { connectionStatus } from "@/backend/connections";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// CHANNEL HEALTH, AND THE PRE-PUBLISH CHECK.
//
// GET  ?brandId=            → every channel's real state, from recorded attempts
// POST { brandId, channel, text, mediaUrls?, mediaDimensions?, scheduledAt?, approved? }
//                           → the eight checks, before anything is enqueued
//
// Not metered. Nothing here calls a provider — it reads what already happened
// and applies arithmetic, the same reason /api/results and /api/roi are free.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Which channels this brand has actually connected. Meta is native; the rest come from the connection store. */
async function connectedChannels(brandId: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const meta = await metaConnectionPublic(brandId);
    if (meta.connected) out.push("facebook");
    if (meta.igConnected) out.push("instagram");
  } catch { /* an unreadable connection is reported as not connected, never as healthy */ }
  try {
    for (const c of await connectionStatus(brandId)) if (c.connected) out.push(c.provider);
  } catch { /* same */ }
  return Array.from(new Set(out));
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const brandId = (new URL(req.url).searchParams.get("brandId") || "").trim();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const connected = await connectedChannels(brandId);
  const channels = await brandChannelHealth(brandId, connected);

  return NextResponse.json({
    channels,
    needsAction: channels.filter((c) => c.state === "action_required" || c.state === "disconnected").map((c) => c.channel),
    doctrine: CONNECTION_HEALTH_DOCTRINE,
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "connection-health"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const brandId = str("brandId");
  const channel = str("channel");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  if (!channel) return NextResponse.json({ error: `channel required — one of ${Object.keys(PLATFORM_LIMITS).join(", ")}` }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const connected = await connectedChannels(brandId);
  const health = (await brandChannelHealth(brandId, connected)).find((c) => c.channel === channel);
  const dims = body.mediaDimensions as { width?: number; height?: number } | undefined;

  return NextResponse.json({
    result: preflight({
      channel,
      text: str("text"),
      mediaUrls: Array.isArray(body.mediaUrls) ? (body.mediaUrls as unknown[]).filter((u): u is string => typeof u === "string") : undefined,
      mediaDimensions: dims && Number(dims.width) > 0 && Number(dims.height) > 0
        ? { width: Number(dims.width), height: Number(dims.height) } : undefined,
      connected: connected.includes(channel),
      health,
      approved: typeof body.approved === "boolean" ? body.approved : undefined,
      approvalRequired: typeof body.approvalRequired === "boolean" ? body.approvalRequired : undefined,
      scheduledAt: str("scheduledAt") || undefined,
      suppliedFacts: str("suppliedFacts") || undefined,
    }),
    checks: CHECKS,
    doctrine: PREFLIGHT_DOCTRINE,
  });
}
