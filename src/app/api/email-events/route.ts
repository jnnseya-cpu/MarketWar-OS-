import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { eventStats, suppressedEmails } from "@/backend/email-events";

// Engagement stats for a brand's Email Center — opens/clicks/bounces/complaints
// aggregated from the real delivery-event ledger, plus the suppression count.
// Ownership-enforced; read-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const [stats, suppressed] = await Promise.all([eventStats(brandId), suppressedEmails(brandId)]);
  return NextResponse.json({ ...stats, suppressed: suppressed.size });
}
