import { NextRequest, NextResponse } from "next/server";
import { recordEvent, type EmailEventType } from "@/backend/email-events";

// Delivery-event webhook — where BOUNCE and COMPLAINT (and unsubscribe) signals
// arrive and auto-populate the suppression ledger, so the platform never sends to
// a dead/hostile address again. Secret-gated: a forged POST could suppress a
// rival's whole list, so the caller MUST present EMAIL_WEBHOOK_SECRET.
//
// Accepts (a) the normalized MarketWar shape — the format the self-hosted sending
// node's bounce handler posts — as a single object or an array, and (b) a
// SendGrid event array (best-effort; brandId must ride in a custom arg).
//
// Normalized: { brandId, email, type:"bounce"|"complaint"|"unsubscribe", campaign? }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = () => process.env.EMAIL_WEBHOOK_SECRET || process.env.CRON_SECRET || "";

function authorized(req: NextRequest): boolean {
  const secret = SECRET();
  if (!secret) return false; // fail closed: no secret configured → reject
  const provided = req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret") || "";
  return provided === secret;
}

const NORMAL: Record<string, EmailEventType> = {
  bounce: "bounce", hard_bounce: "bounce", dropped: "bounce", blocked: "bounce",
  complaint: "complaint", spamreport: "complaint", spam: "complaint",
  unsubscribe: "unsubscribe", unsub: "unsubscribe", group_unsubscribe: "unsubscribe",
  open: "open", click: "click", delivered: "sent",
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const items: Record<string, unknown>[] = Array.isArray(body) ? (body as Record<string, unknown>[]) : [body as Record<string, unknown>];
  let accepted = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const it of items) {
    // Normalized shape first; fall back to SendGrid field names.
    const rawType = String(it.type ?? it.event ?? "").toLowerCase();
    const type = NORMAL[rawType];
    const email = String(it.email ?? "").toLowerCase().trim();
    // brandId must be explicit (normalized) or carried as a custom arg by the provider.
    const brandId = String(it.brandId ?? it.brand_id ?? (it.unique_args as Record<string, unknown> | undefined)?.brandId ?? "").trim();
    const campaign = it.campaign ? String(it.campaign) : undefined;

    if (!type || !email || !brandId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; continue; }
    try {
      await recordEvent({ brandId, email, type, at: now, campaign });
      accepted++;
    } catch { skipped++; }
  }

  return NextResponse.json({ ok: true, accepted, skipped });
}

export async function GET() {
  return NextResponse.json({
    webhook: "MarketWar OS email delivery events",
    accepts: "POST a normalized event {brandId,email,type} (or array), or a SendGrid event array. Requires EMAIL_WEBHOOK_SECRET via x-webhook-secret header or ?secret=.",
    types: ["bounce", "complaint", "unsubscribe", "open", "click", "delivered"],
    effect: "bounce/complaint/unsubscribe auto-suppress the address (never sent to again).",
  });
}
