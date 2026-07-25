import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/guard";
import { listBrandsForOwner, saveBrandForOwner, deleteBrandForOwner } from "@/backend/brand-store";
import type { Brand } from "@/shared/brand";

// Durable brand persistence per account.
// GET                 → the signed-in user's brands (from Firestore)
// POST { brand }      → upsert a brand (claim-on-first-use; owner-only)
// DELETE ?brandId=…   → remove a brand (owner-only)
// Demo / no-Admin: auth isn't enforced → returns empty / no-ops, and the client
// keeps its localStorage copy (zero-config unaffected).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.enforced || !auth.uid) return NextResponse.json({ brands: [], persisted: false });
  return NextResponse.json({ brands: await listBrandsForOwner(auth.uid), persisted: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const brand = (body.brand && typeof body.brand === "object" ? body.brand : null) as Brand | null;
  if (!brand || !brand.id || !brand.name) return NextResponse.json({ error: "brand.id and brand.name required" }, { status: 400 });
  if (!auth.enforced || !auth.uid) return NextResponse.json({ ok: true, persisted: false });
  const r = await saveBrandForOwner(auth.uid, brand);
  return r.ok ? NextResponse.json({ ok: true, persisted: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  if (!auth.enforced || !auth.uid) return NextResponse.json({ ok: true, persisted: false });
  const r = await deleteBrandForOwner(auth.uid, brandId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
