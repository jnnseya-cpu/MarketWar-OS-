import { NextRequest, NextResponse } from "next/server";
import { segmentAudience, scoredCustomerList, segmentLabel, type CustomerRecord } from "@/backend/segments";

// AI Audience Segmentation Engine API (Brevo pack Module 19).
// POST { business?, customers?, action? } →
//   default / action:"segments" → ranked profitable segments with recommended
//     offer / channel / follow-up + campaign priority (consent-gated).
//   action:"customers" → individual scored contact rows for the Customer Vault
//     (name, ltv, churn, intent, segment, spend, orders) + vault roll-up stats.
// GET → engine doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const business = typeof body.business === "string" ? body.business : "Brixton Grill House";
  const customers = Array.isArray(body.customers) ? (body.customers as CustomerRecord[]) : [];

  if (body.action === "customers") {
    const live = customers.length > 0;
    const rows = scoredCustomerList(business, customers).map((c) => ({
      id: c.id,
      name: c.name ?? c.id,
      segment: c.segment,
      segmentLabel: segmentLabel(c.segment),
      spendGbp: Math.round(c.totalSpendGbp ?? 0),
      orders: c.orderCount ?? 0,
      ltvGbp: c.ltvGbp,
      churnRisk: c.churnRisk,
      purchaseIntent: c.purchaseIntent,
      lastOrderDaysAgo: c.lastOrderDaysAgo ?? null,
      consent: c.consent !== false,
    }));
    const totalLtv = rows.reduce((s, r) => s + r.ltvGbp, 0);
    const hot = rows.filter((r) => r.segment === "hot_leads" || r.purchaseIntent >= 75).length;
    const atRisk = rows.filter((r) => r.churnRisk >= 60).length;
    const statusCounts: Record<string, number> = {};
    for (const r of rows) statusCounts[r.segmentLabel] = (statusCounts[r.segmentLabel] ?? 0) + 1;
    return NextResponse.json({
      business,
      live,
      totalContacts: rows.length,
      totalLtvGbp: totalLtv,
      hot,
      atRisk,
      consentedShare: rows.length ? Math.round(rows.filter((r) => r.consent).length / rows.length * 100) / 100 : 0,
      statusCounts,
      customers: rows,
      note: live
        ? "Scored from your imported records. Every contact is RFM/LTV/churn/intent scored the moment data lands."
        : "Deterministic demo intelligence — a sample base scored by the live engine. Import CSV/CRM/Stripe/WhatsApp to score your real contacts.",
    });
  }

  return NextResponse.json(segmentAudience(business, customers));
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Audience Segmentation Engine (RFM/LTV/churn/intent → profitable segments)",
    doctrine: "Segments are built from real records, ranked by campaign priority. Only consented contacts are marketing-eligible; the follow-up engine enforces frequency caps + opt-out. No fabricated customers.",
    segmentTypes: ["hot_leads", "vip_customers", "high_ltv_customers", "repeat_buyers", "high_intent_customers", "referral_ready_customers", "inactive_customers", "churn_risk_customers", "price_sensitive_customers"],
  });
}
