import { NextRequest, NextResponse } from "next/server";
import { warReport } from "@/backend/warlord";
import { summarize, type RevenueEvent } from "@/shared/results";
import { brandSummary } from "@/backend/ledger";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";

// WARLORD API — the daily War Report + Speed-of-Money strike queue, computed
// from a brand's REAL results ledger. Same input modes + ownership check as the
// command-summary API. No provider cost.
//   POST { brandId }            → loads the brand's ledger server-side
//   POST { business?, summary } → reports on a client-held summary
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "warlord"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const business = typeof body.business === "string" ? body.business : "Your brand";
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    if (brandId) return NextResponse.json(warReport(business, await brandSummary(brandId)));
    if (body.summary && typeof body.summary === "object") return NextResponse.json(warReport(business, body.summary as ReturnType<typeof summarize>));
    const events = Array.isArray(body.events) ? (body.events as RevenueEvent[]) : [];
    return NextResponse.json(warReport(business, summarize(events)));
  } catch {
    return NextResponse.json(warReport(business, summarize([])));
  }
}
