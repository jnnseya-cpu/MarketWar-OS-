import { NextRequest, NextResponse } from "next/server";
import { verifyToken, recordEvent } from "@/backend/email-events";

// Click tracking — records a CLICK for the signed recipient, then 302-redirects
// to the original URL. Only http(s) targets are honoured (no open-redirect to
// javascript:/data: schemes). Forged tokens still redirect (so the link works)
// but record nothing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") || "";
  const u = req.nextUrl.searchParams.get("u") || "";

  let target: string | null = null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") target = parsed.toString();
  } catch { /* invalid URL */ }
  if (!target) return NextResponse.json({ error: "Invalid link" }, { status: 400 });

  const claim = verifyToken(t);
  if (claim) {
    try {
      await recordEvent({ brandId: claim.brandId, email: claim.email, type: "click", at: new Date().toISOString(), campaign: claim.campaign || undefined, url: target });
    } catch { /* never block the redirect */ }
  }
  return NextResponse.redirect(target, 302);
}
