import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { eventStats, suppressedEmails } from "@/backend/email-events";
import { getWarmup } from "@/backend/email-warmup";

// Engagement stats for a brand's Email Center — opens/clicks/bounces/complaints
// aggregated from the real delivery-event ledger, the suppression count, and
// today's warm-up allowance. Ownership-enforced; read-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const today = new Date().toISOString().slice(0, 10);
  const [stats, suppressed, warmup] = await Promise.all([eventStats(brandId), suppressedEmails(brandId), getWarmup(brandId, today)]);
  return NextResponse.json({ ...stats, suppressed: suppressed.size, warmup });
}
