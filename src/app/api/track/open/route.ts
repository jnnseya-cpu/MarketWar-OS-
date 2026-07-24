import { NextRequest, NextResponse } from "next/server";
import { verifyToken, recordEvent } from "@/backend/email-events";

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
      await recordEvent({ brandId: claim.brandId, email: claim.email, type: "open", at: new Date().toISOString(), campaign: claim.campaign || undefined });
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
