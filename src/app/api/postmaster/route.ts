import { NextRequest, NextResponse } from "next/server";
import { requireAuthEnforced, rateLimit, clientKey } from "@/backend/guard";
import { hasScope } from "@/shared/roles";

// WHAT GMAIL THINKS OF THE SENDING DOMAIN.
//
// GET → the reading, or the one reason there is not one.
//
// Read-only and it spends nothing, but it reports the reputation of the SHARED
// sending domain — every brand's mail rides on it — so it is a platform-admin
// surface rather than a per-brand one. There is nothing here a single customer
// could act on that the placement probe does not already tell them.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthEnforced(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.enforced && (!auth.role || !hasScope(auth.role, "platform_admin"))) {
    return NextResponse.json({ error: "Postmaster reports the shared sending domain's reputation — a platform-admin view." }, { status: 403 });
  }
  const rl = rateLimit(clientKey(req, "postmaster"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const { readPostmaster, postmasterStatus } = await import("@/backend/postmaster");
  const days = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("days")) || 30));
  const reading = await readPostmaster(days);

  if (!reading.ok) {
    return NextResponse.json({
      service: "Google Postmaster Tools — the sending domain's reputation at Gmail",
      ...postmasterStatus(),
      ok: false,
      reason: reading.reason,
      fix: reading.fix,
      // SAID EVERY TIME, because the absence of this report is the normal state
      // for a domain that has not sent volume, and somebody reading it needs to
      // know the other half already works.
      meanwhile: "Inbox placement is measurable at ANY volume with the seed probe — /api/placement. "
        + "Postmaster only starts answering once real volume goes out.",
    }, { status: 200 });
  }

  return NextResponse.json({
    service: "Google Postmaster Tools — the sending domain's reputation at Gmail",
    ok: true,
    ...reading.verdict,
    doctrine: "An empty answer from Google is reported as an absence, never as zero complaints and a low reputation. "
      + "Postmaster reports nothing below a few hundred authenticated messages a day.",
  });
}
