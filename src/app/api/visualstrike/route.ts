import { NextRequest, NextResponse } from "next/server";
import {
  productIdentityLock, generateAngles, scoreConcept, contentPack, hookLab,
  guardClaims, demoCampaign, ANGLE_FAMILIES, VIRAL_DIMENSIONS, CAMPAIGN_MODES,
  CONTENT_PACK_FORMATS, PIPELINE_STAGES, CREATOR_SAFEGUARDS,
  type PreservationMode, type ExtractedField,
} from "@/backend/visualstrike";

// VisualStrike AI™ API — Product Picture → Viral Campaign brain (deterministic).
// Heavy generation (vision extraction, image/video synthesis) routes through the
// gateway + image-gateway; this surface is the scoring/angle/identity-lock brain.
// POST { action: "lock", regulated?, highValue?, requestedMode? }
// POST { action: "angles", product{name,category,audience?,problem?}, limit? }
// POST { action: "score", concept{product,angle,hasProof?,trendAligned?,clearProduct?} }
// POST { action: "pack", concept{product,angle} }        → 32 native formats
// POST { action: "hooks", product{name}, fulfilled? }     → Hook Lab + clickbait block
// POST { action: "guard", fields[] }                      → honesty guard on claims
// GET  → doctrine, angle families, dimensions, modes, formats, pipeline, demo campaign

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "angles";

  if (action === "lock") {
    return NextResponse.json(productIdentityLock({
      regulated: Boolean(body.regulated), highValue: Boolean(body.highValue),
      requestedMode: body.requestedMode as PreservationMode | undefined,
    }));
  }

  if (action === "angles") {
    const p = (body.product as { name?: string; category?: string; audience?: string; problem?: string }) ?? {};
    if (!p.name || !p.category) return NextResponse.json({ error: "angles requires product.name and product.category" }, { status: 400 });
    const limit = typeof body.limit === "number" ? body.limit : 6;
    return NextResponse.json({ angles: generateAngles({ name: p.name, category: p.category, audience: p.audience, problem: p.problem }, limit) });
  }

  if (action === "score") {
    const c = (body.concept as { product?: string; angle?: string; hasProof?: boolean; trendAligned?: boolean; clearProduct?: boolean }) ?? {};
    if (!c.product || !c.angle) return NextResponse.json({ error: "score requires concept.product and concept.angle" }, { status: 400 });
    return NextResponse.json(scoreConcept({ product: c.product, angle: c.angle, hasProof: c.hasProof, trendAligned: c.trendAligned, clearProduct: c.clearProduct }));
  }

  if (action === "pack") {
    const c = (body.concept as { product?: string; angle?: string }) ?? {};
    if (!c.product || !c.angle) return NextResponse.json({ error: "pack requires concept.product and concept.angle" }, { status: 400 });
    return NextResponse.json(contentPack({ product: c.product, angle: c.angle }));
  }

  if (action === "hooks") {
    const p = (body.product as { name?: string }) ?? {};
    if (!p.name) return NextResponse.json({ error: "hooks requires product.name" }, { status: 400 });
    return NextResponse.json(hookLab({ name: p.name }, body.fulfilled !== false));
  }

  if (action === "guard") {
    const fields = Array.isArray(body.fields) ? (body.fields as ExtractedField[]) : [];
    return NextResponse.json(guardClaims(fields));
  }

  return NextResponse.json({ error: "Unknown action — use lock, angles, score, pack, hooks or guard" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "VisualStrike AI™ — Product Picture → Viral Campaign engine",
    doctrine: "Not an image-to-ad toy: research → score → angle → pipeline. Product Identity Lock™ keeps the real product intact (exact preservation forced for regulated/high-value); the honesty guard never invents a capability or a health/financial/technical/performance claim; clickbait the content can't fulfil is blocked.",
    angleFamilies: ANGLE_FAMILIES,
    viralDimensions: VIRAL_DIMENSIONS,
    campaignModes: CAMPAIGN_MODES,
    contentPackFormats: CONTENT_PACK_FORMATS,
    pipeline: PIPELINE_STAGES,
    creatorSafeguards: CREATOR_SAFEGUARDS,
    demoCampaign: demoCampaign(),
  });
}
