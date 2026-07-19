import { NextRequest, NextResponse } from "next/server";
import { segmentAudience, type CustomerRecord } from "@/backend/segments";

// AI Audience Segmentation Engine API (Brevo pack Module 19).
// POST { business?, customers? } → ranked profitable segments with recommended
//   offer / channel / follow-up + campaign priority (consent-gated).
// GET → engine doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const business = typeof body.business === "string" ? body.business : "Brixton Grill House";
  const customers = Array.isArray(body.customers) ? (body.customers as CustomerRecord[]) : [];
  return NextResponse.json(segmentAudience(business, customers));
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Audience Segmentation Engine (RFM/LTV/churn/intent → profitable segments)",
    doctrine: "Segments are built from real records, ranked by campaign priority. Only consented contacts are marketing-eligible; the follow-up engine enforces frequency caps + opt-out. No fabricated customers.",
    segmentTypes: ["hot_leads", "vip_customers", "high_ltv_customers", "repeat_buyers", "high_intent_customers", "referral_ready_customers", "inactive_customers", "churn_risk_customers", "price_sensitive_customers"],
  });
}
