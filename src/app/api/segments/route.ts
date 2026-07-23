import { NextRequest, NextResponse } from "next/server";
import { segmentAudience, scoredCustomerList, segmentLabel, type CustomerRecord } from "@/backend/segments";
import { resolveBrandAccess } from "@/backend/brand-access";
import { listContacts, toCustomerRecords } from "@/backend/contacts";

// AI Audience Segmentation Engine API (Brevo pack Module 19).
// POST { brand?:{id,name}, business?, customers?, action? } →
//   When brand.id is supplied, segments are built from that brand's REAL Customer
//   Vault (imported contacts); an empty vault returns an honest empty report —
//   never a synthetic sample base.
//   default / action:"segments" → ranked profitable segments with recommended
//     offer / channel / follow-up + campaign priority (consent-gated).
//   action:"customers" → individual scored contact rows for the Customer Vault.
// GET → engine doctrine.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brand = (body.brand ?? {}) as Record<string, unknown>;
  const brandId = typeof brand.id === "string" ? brand.id.trim()
    : typeof body.brandId === "string" ? (body.brandId as string).trim() : "";
  const business = typeof brand.name === "string" && brand.name.trim() ? brand.name.trim()
    : typeof body.business === "string" && body.business.trim() ? body.business : "your business";

  // Real-vault mode: build segments ONLY from the brand's own imported contacts.
  let customers = Array.isArray(body.customers) ? (body.customers as CustomerRecord[]) : [];
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    customers = toCustomerRecords(await listContacts(brandId));
    if (customers.length === 0) {
      // Honest empty report — no fabricated sample base.
      if (body.action === "customers") {
        return NextResponse.json({
          business, live: true, totalContacts: 0, totalLtvGbp: 0, hot: 0, atRisk: 0,
          consentedShare: 0, statusCounts: {}, customers: [],
          note: "No contacts in this brand's Customer Vault yet. Import CSV / CRM / Stripe / WhatsApp to score your real contacts.",
        });
      }
      return NextResponse.json({
        business, totalCustomers: 0, consentedShare: 0, segments: [],
        note: "No contacts in this brand's Customer Vault yet. Import your contacts and segments build automatically — from your real database, never a sample.",
      });
    }
  }

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
