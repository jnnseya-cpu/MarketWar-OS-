import { NextRequest, NextResponse } from "next/server";
import { startVideoRender, getVideoRender, videoGatewayStatus } from "@/backend/video-gateway";
import { rateLimit, clientKey } from "@/backend/guard";

// Video Render Gateway API (async — start then poll).
//   GET  → status (configured provider, async note)
//   POST { action: "start", brandId, prompt }  → { jobId, status, ... }
//   POST { action: "status", jobId }           → current job (hosted MP4 when ready)
// Rate-limited (rendering can spend); demo-safe with no key.
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(videoGatewayStatus());
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "video-render"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "start") {
      const brandId = typeof body.brandId === "string" ? body.brandId : "";
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      if (!brandId.trim()) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
      if (!prompt.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
      return NextResponse.json(await startVideoRender({ brandId, prompt }));
    }
    if (action === "status") {
      const jobId = typeof body.jobId === "string" ? body.jobId : "";
      if (!jobId.trim()) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
      const job = await getVideoRender(jobId);
      if ("error" in job) return NextResponse.json(job, { status: 404 });
      return NextResponse.json(job);
    }
    return NextResponse.json({ error: "Unknown action — use start or status" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Video render gateway error" }, { status: 502 });
  }
}
