import { NextRequest, NextResponse } from "next/server";
import { routeInbound } from "@/backend/inbound-routing";

// Inbound mail intake — a mail node POSTs each received message here.
// Secret-gated (EMAIL_WEBHOOK_SECRET) since it writes to a brand's inbox.
// Body: { to, from, fromName?, subject?, text?, html?, receivedAt?, headers? }
//
// THE ROUTING ITSELF LIVES IN `backend/inbound-routing.ts`, not here. There are
// now two front doors — this webhook and the mailbox collector that reads the
// bounce mailbox on a schedule — and a bounce must mean the same thing through
// both. One implementation, two callers.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = () => process.env.EMAIL_WEBHOOK_SECRET || process.env.CRON_SECRET || "";

function authorized(req: NextRequest): boolean {
  const secret = SECRET();
  if (!secret) return false; // fail closed
  const provided = req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret") || "";
  return provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const to = String(body.to ?? "");
  const from = String(body.from ?? "");
  if (!to.trim() || !from.trim()) return NextResponse.json({ error: "to and from required" }, { status: 400 });

  const outcome = await routeInbound({
    to,
    from,
    subject: typeof body.subject === "string" ? body.subject : "",
    text: typeof body.text === "string" ? body.text : undefined,
    html: typeof body.html === "string" ? body.html : undefined,
    fromName: typeof body.fromName === "string" ? body.fromName : undefined,
    receivedAt: typeof body.receivedAt === "string" ? body.receivedAt : undefined,
    headers: (body.headers && typeof body.headers === "object" ? body.headers : {}) as Record<string, string>,
  });

  return NextResponse.json({ ok: true, ...outcome });
}

export async function GET() {
  return NextResponse.json({
    webhook: "MarketWar OS inbound mail",
    accepts: "POST { to, from, subject?, text?, html? } from the sending node. Requires EMAIL_WEBHOOK_SECRET (x-webhook-secret header or ?secret=).",
    routing: "human replies → the owning brand's inbox; bounces/auto-replies → suppression ledger.",
    alsoCollected: "The same routing runs against the bounce mailbox on a schedule — see /api/cron/collect-bounces. A deployment with no mail node still learns why a message failed.",
  });
}
