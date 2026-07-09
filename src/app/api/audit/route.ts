import { NextRequest, NextResponse } from "next/server";
import { computeAudit, type AuditInput } from "@/lib/ai/audit";
import { saveAuditReport } from "@/lib/db";

export async function POST(req: NextRequest) {
  let body: Partial<AuditInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input: AuditInput = {
    business: String(body.business ?? ""),
    industry: String(body.industry ?? ""),
    location: String(body.location ?? ""),
    product: String(body.product ?? ""),
    price: String(body.price ?? ""),
    offer: String(body.offer ?? ""),
    targetCustomer: String(body.targetCustomer ?? ""),
    pastSpend: Number(body.pastSpend ?? 0) || 0,
    pastResult: String(body.pastResult ?? ""),
    hasWebsite: Boolean(body.hasWebsite),
    hasWhatsApp: Boolean(body.hasWhatsApp),
    hasFollowUp: Boolean(body.hasFollowUp),
    hasReviews: Boolean(body.hasReviews),
    hasTracking: Boolean(body.hasTracking),
  };

  const report = computeAudit(input);
  // Persist when Firebase is configured; never block or fail the response.
  saveAuditReport(input, report).catch(() => {});
  return NextResponse.json(report);
}
