import { NextRequest, NextResponse } from "next/server";
import { recoverRevenue, RECOVERY_DOCTRINE } from "@/backend/recovery";
import { type CustomerRecord } from "@/backend/segments";

// AI Customer Resurrection / Lead Recovery Engine API.
// POST { business?, customers? } → recoverable cohorts (abandoned-checkout,
//   churn-risk, inactive-60d+, price-sensitive) each with recoverable £, a
//   multi-wave touch plan and top contacts.
// GET → engine doctrine.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const business = typeof body.business === "string" ? body.business : "Brixton Grill House";
  const customers = Array.isArray(body.customers) ? (body.customers as CustomerRecord[]) : [];
  return NextResponse.json(recoverRevenue(business, customers));
}

export async function GET() {
  return NextResponse.json(RECOVERY_DOCTRINE);
}
