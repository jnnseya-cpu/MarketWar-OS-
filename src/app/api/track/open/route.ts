import { NextRequest, NextResponse } from "next/server";
import { verifyToken, recordEvent } from "@/backend/email-events";
import { classifyAgent } from "@/backend/email-bot-filter";

// Open tracking — returns a 1x1 transparent GIF and records an OPEN event for the
// signed recipient. Forged tokens are ignored (still return the pixel so the mail
// renders). No auth: this is called by the recipient's email client.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") || "";
  const claim = verifyToken(t);
  if (claim) {
    try {
      // Flagged, not dropped. A scanner fetch is real evidence the message was
      // delivered and inspected; it is simply not a person, so it must not be
      // counted as one. Keeping the row means the decision stays reviewable.
      const verdict = classifyAgent(req.headers.get("user-agent"), req.headers, { method: req.method });
      await recordEvent({ brandId: claim.brandId, email: claim.email, type: "open", at: new Date().toISOString(), campaign: claim.campaign || undefined, meta: { machine: String(verdict.machine), agentReason: verdict.reason } });
    } catch { /* never fail the pixel on a store hiccup */ }
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
}
