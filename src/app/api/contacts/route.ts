import { NextRequest, NextResponse } from "next/server";
import { saveContacts, listContacts, clearContacts, toCustomerRecords, type Contact } from "@/backend/contacts";
import { scoredCustomerList, segmentLabel } from "@/backend/segments";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer Vault contact store — real CSV/CRM import behind the vault.
// POST { brandId, business, contacts:[...] }  → import + return scored vault
// GET  ?brandId=…&business=…                  → scored vault from stored contacts
// DELETE ?brandId=…                           → clear the brand's contacts
//
// Ownership is enforced: a caller can only touch a brand they own (demo passes
// through). Consent is preserved; the segmentation engine gates marketing.

function nowISO(req: NextRequest): string {
  // Client supplies the timestamp (no Date.now in some sandboxes); fall back safe.
  const h = req.headers.get("x-now");
  return h && /^\d{4}-\d{2}-\d{2}T/.test(h) ? h : "1970-01-01T00:00:00.000Z";
}

type ScoredRow = {
  id: string; name: string; segment: string; segmentLabel: string;
  spendGbp: number; orders: number; ltvGbp: number; churnRisk: number;
  purchaseIntent: number; lastOrderDaysAgo: number | null; consent: boolean;
};

// Build the SAME VaultReport shape the Customer Vault page renders (mirrors
// /api/segments action:"customers"), but from the brand's REAL stored contacts.
async function scoredVault(brandId: string, business: string) {
  const biz = business || "your brand";
  const contacts = await listContacts(brandId);
  const records = toCustomerRecords(contacts);
  // Empty vault → honest empty report. Never call the scorer with [] (its sample
  // fallback would fabricate 40 "Customer NNN" rows for a brand with no data).
  if (records.length === 0) {
    return {
      business: biz, live: false, contactCount: 0, totalContacts: 0, totalLtvGbp: 0,
      hot: 0, atRisk: 0, consentedShare: 0, statusCounts: {} as Record<string, number>,
      customers: [] as ScoredRow[],
      note: "No contacts yet. Import a CSV to populate and score your real vault.",
    };
  }
  const rows = scoredCustomerList(biz, records).map((c) => ({
    id: c.id, name: c.name ?? c.id, segment: c.segment, segmentLabel: segmentLabel(c.segment),
    spendGbp: Math.round(c.totalSpendGbp ?? 0), orders: c.orderCount ?? 0, ltvGbp: c.ltvGbp,
    churnRisk: c.churnRisk, purchaseIntent: c.purchaseIntent,
    lastOrderDaysAgo: c.lastOrderDaysAgo ?? null, consent: c.consent !== false,
  }));
  const statusCounts: Record<string, number> = {};
  for (const r of rows) statusCounts[r.segmentLabel] = (statusCounts[r.segmentLabel] ?? 0) + 1;
  return {
    business: biz,
    live: rows.length > 0,
    contactCount: contacts.length,
    totalContacts: rows.length,
    totalLtvGbp: rows.reduce((s, r) => s + r.ltvGbp, 0),
    hot: rows.filter((r) => r.segment === "hot_leads" || r.purchaseIntent >= 75).length,
    atRisk: rows.filter((r) => r.churnRisk >= 60).length,
    consentedShare: rows.length ? Math.round(rows.filter((r) => r.consent).length / rows.length * 100) / 100 : 0,
    statusCounts,
    customers: rows,
    note: rows.length
      ? "Scored from YOUR imported contacts — RFM/LTV/churn/intent, live."
      : "No contacts yet. Import a CSV to populate and score your real vault.",
  };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "contacts"), 20, 60_000, 0);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  const business = typeof body.business === "string" ? body.business : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const contacts = Array.isArray(body.contacts) ? (body.contacts as Partial<Contact>[]) : [];
  if (!contacts.length) return NextResponse.json({ error: "No contacts to import" }, { status: 400 });
  if (contacts.length > 20000) return NextResponse.json({ error: "Import capped at 20,000 rows per upload" }, { status: 400 });

  const { imported, total } = await saveContacts(brandId, contacts, nowISO(req));
  const vault = await scoredVault(brandId, business);
  return NextResponse.json({ imported, total, ...vault });
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const business = req.nextUrl.searchParams.get("business") || "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json(await scoredVault(brandId, business));
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  await clearContacts(brandId);
  return NextResponse.json({ ok: true, contactCount: 0 });
}
