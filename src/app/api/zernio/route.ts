import { NextRequest, NextResponse } from "next/server";
import { createConnectLink, listProfiles, publishPost, seatQuote, zernioStatus } from "@/backend/zernio";
import { rateLimit, clientKey } from "@/backend/guard";

// Publish Gateway API (Zernio, platform-managed).
//   GET  → status (platforms, configured, billing model)
//   POST { action: "connect", brandId, brandName? }   → mint a connect link
//   POST { action: "profiles" }                        → list connected profiles
//   POST { action: "publish", brandId, text, platforms[], mediaUrls?, scheduleAt? }
//   POST { action: "quote", connectedAccounts, includedSeats } → seat ACU quote
// Rate-limited (publishing can spend); demo-safe with no key.
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(zernioStatus());
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "zernio"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "connect") {
      const brandId = typeof body.brandId === "string" ? body.brandId : "";
      if (!brandId.trim()) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
      return NextResponse.json(await createConnectLink({ brandId, brandName: typeof body.brandName === "string" ? body.brandName : undefined }));
    }
    if (action === "profiles") {
      return NextResponse.json(await listProfiles());
    }
    if (action === "publish") {
      const brandId = typeof body.brandId === "string" ? body.brandId : "";
      const text = typeof body.text === "string" ? body.text : "";
      const platforms = Array.isArray(body.platforms) ? (body.platforms as unknown[]).filter((p): p is string => typeof p === "string") : [];
      if (!brandId.trim()) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
      return NextResponse.json(await publishPost({
        brandId, text, platforms,
        profileId: typeof body.profileId === "string" ? body.profileId : undefined,
        mediaUrls: Array.isArray(body.mediaUrls) ? (body.mediaUrls as unknown[]).filter((m): m is string => typeof m === "string") : undefined,
        scheduleAt: typeof body.scheduleAt === "string" ? body.scheduleAt : undefined,
        watermark: body.watermark !== false,
      }));
    }
    if (action === "quote") {
      return NextResponse.json(seatQuote({
        connectedAccounts: Number(body.connectedAccounts) || 0,
        includedSeats: Number(body.includedSeats) || 0,
      }));
    }
    return NextResponse.json({ error: "Unknown action — use connect, profiles, publish or quote" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Publish gateway error" }, { status: 502 });
  }
}
