import { NextRequest, NextResponse } from "next/server";
import { verifyToken, recordEvent } from "@/backend/email-events";

// One-click unsubscribe — records an UNSUBSCRIBE (which suppresses the address
// forever) and shows a plain confirmation. Supports GET (link click) and POST
// (RFC 8058 List-Unsubscribe-Post). No auth beyond the signed token, so a
// recipient can always opt out without logging in.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(t: string): Promise<boolean> {
  const claim = verifyToken(t);
  if (!claim) return false;
  try {
    await recordEvent({ brandId: claim.brandId, email: claim.email, type: "unsubscribe", at: new Date().toISOString(), campaign: claim.campaign || undefined });
    return true;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const ok = await handle(req.nextUrl.searchParams.get("t") || "");
  const body = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
  <body style="font-family:system-ui,Arial,sans-serif;background:#0b1020;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
  <div style="text-align:center;padding:24px;max-width:420px">
  <h1 style="font-size:20px;margin:0 0 8px">${ok ? "You're unsubscribed" : "Link expired"}</h1>
  <p style="color:#94a3b8;font-size:14px;margin:0">${ok ? "You won't receive further emails from this sender. You can close this page." : "This unsubscribe link is invalid or has expired."}</p>
  </div></body></html>`;
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  // RFC 8058: List-Unsubscribe-Post=One-Click posts here with the token in the query.
  const ok = await handle(req.nextUrl.searchParams.get("t") || "");
  return NextResponse.json({ ok });
}
