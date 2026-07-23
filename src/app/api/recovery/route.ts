import { NextRequest, NextResponse } from "next/server";
import { recoverRevenue, emptyRecovery, RECOVERY_DOCTRINE } from "@/backend/recovery";
import { resolveBrandAccess } from "@/backend/brand-access";
import { listContacts, toCustomerRecords } from "@/backend/contacts";
import { rateLimit, clientKey } from "@/backend/guard";
import { type CustomerRecord } from "@/backend/segments";

// AI Customer Resurrection / Lead Recovery Engine API.
// POST { brand: { id, name } } → recovers ONLY from that brand's real Customer
//   Vault (imported contacts). Empty vault → honest empty report, never a sample.
//   Legacy { business?, customers? } (no brand id) still works for zero-config /
//   direct API use and the public demo.
// GET → engine doctrine.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "recovery"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brand = (body.brand ?? {}) as Record<string, unknown>;
  const brandId = typeof brand.id === "string" ? brand.id.trim()
    : typeof body.brandId === "string" ? (body.brandId as string).trim() : "";
  const business = typeof brand.name === "string" && brand.name.trim() ? brand.name.trim()
    : typeof body.business === "string" && body.business.trim() ? body.business : "your business";

  // Real-vault mode: a logged-in brand recovers ONLY from its own imported
  // contacts. No contacts → honest empty report (no fabricated sample base).
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const customers = toCustomerRecords(await listContacts(brandId));
    if (customers.length === 0) return NextResponse.json(emptyRecovery(business));
    return NextResponse.json(recoverRevenue(business, customers));
  }

  // No brand id — zero-config / direct API / public demo path.
  const customers = Array.isArray(body.customers) ? (body.customers as CustomerRecord[]) : [];
  return NextResponse.json(recoverRevenue(business, customers));
}

export async function GET() {
  return NextResponse.json(RECOVERY_DOCTRINE);
}
