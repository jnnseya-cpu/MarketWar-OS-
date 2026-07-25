import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { buildAllArtifacts } from "@/backend/seo-artifacts";
import type { Brand } from "@/shared/brand";

// SEO Artifact Workbench — generates real JSON-LD / llms.txt / meta tags from the
// active brand. Ownership-enforced. Deterministic + honest (no invented ratings
// or prices). POST { brandId, brand, topic? }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const brand = (body.brand && typeof body.brand === "object" ? body.brand : {}) as Brand;
  const topic = typeof body.topic === "string" ? body.topic : undefined;
  if (!brand.name) return NextResponse.json({ error: "brand.name required" }, { status: 400 });
  return NextResponse.json({ artifacts: buildAllArtifacts(brand, topic) });
}
