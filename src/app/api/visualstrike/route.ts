import { NextRequest, NextResponse } from "next/server";
import {
  productIdentityLock, generateAngles, scoreConcept, contentPack, hookLab,
  guardClaims, demoCampaign, ANGLE_FAMILIES, VIRAL_DIMENSIONS, CAMPAIGN_MODES,
  CONTENT_PACK_FORMATS, PIPELINE_STAGES, CREATOR_SAFEGUARDS,
  type PreservationMode, type ExtractedField,
} from "@/backend/visualstrike";
import { researchProduct } from "@/backend/market-research";
import { verifyIdentityByUrl, IDENTITY_THRESHOLDS } from "@/backend/identity-lock";
import { evaluateExperiment, requiredSampleSize, type Variant } from "@/backend/experiments";
import { learnFromExperiments, type ExperimentRecord } from "@/backend/creative-learning";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// VisualStrike AI™ API — Product Picture → Viral Campaign brain (deterministic).
// Heavy generation (vision extraction, image/video synthesis) routes through the
// gateway + image-gateway; this surface is the scoring/angle/identity-lock brain.
// POST { action: "lock", regulated?, highValue?, requestedMode? }
// POST { action: "angles", product{name,category,audience?,problem?}, limit? }
// POST { action: "score", concept{product,angle,hasProof?,trendAligned?,clearProduct?} }
// POST { action: "pack", concept{product,angle} }        → 32 native formats
// POST { action: "hooks", product{name}, fulfilled? }     → Hook Lab + clickbait block
// POST { action: "guard", fields[] }                      → honesty guard on claims
// POST { action: "research", product, market?, brandDomain? } → REAL searches, sourced
// POST { action: "verify", sourceUrl, renderedUrl }       → measured Identity Lock
// POST { action: "experiment", variants[], mdeAbsolute?, looksTaken? } → honest A/B
// POST { action: "sample", baselineRate, mdeAbsolute }    → sample size, before you start
// POST { action: "learn", brandId, experiments[] }        → what to generate more of
// GET  → doctrine, angle families, dimensions, modes, formats, pipeline, demo campaign

export const runtime = "nodejs";
// The customer is charged for this route's work BEFORE the work runs, so a
// platform timeout is not a slow page — it is a debit with nothing delivered
// and no code left alive to refund it. Vercel's default is about ten seconds;
// a live crawl plus a provider round-trip does not fit in ten seconds, and this
// route reaches both. maxDuration is the only thing that keeps the function
// alive long enough for the paid-for work to finish or fail honestly.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "visualstrike"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "angles";
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  // --- research: spends real search budget, so it is authenticated + metered --
  if (action === "research") {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const product = s("product");
    if (!product) return NextResponse.json({ error: "Describe the product to research." }, { status: 400 });
    // Five searches per report — charged as five, not one.
    const meter = await meterAction(auth, "search", 5);
    if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });
    const report = await researchProduct({ product, market: s("market"), brandDomain: s("brandDomain") });
    return NextResponse.json({ ...report, chargedAcu: meter.charged ?? 0, balanceAcu: meter.balanceAcu });
  }

  // --- verify: the Identity Lock guarantee, measured -------------------------
  if (action === "verify") {
    const sourceUrl = s("sourceUrl");
    const renderedUrl = s("renderedUrl");
    if (!sourceUrl || !renderedUrl) {
      return NextResponse.json({ error: "Give both the original product photo and the rendered creative." }, { status: 400 });
    }
    const verdict = await verifyIdentityByUrl(sourceUrl, renderedUrl);
    if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 });
    return NextResponse.json({ ...verdict, thresholds: IDENTITY_THRESHOLDS });
  }

  // --- experiment: honest A/B evaluation (pure maths, free) -----------------
  if (action === "experiment") {
    const variants = Array.isArray(body.variants) ? (body.variants as Variant[]) : [];
    if (variants.length < 2) return NextResponse.json({ error: "An A/B test needs at least two variants." }, { status: 400 });
    return NextResponse.json(evaluateExperiment({
      variants,
      mdeAbsolute: typeof body.mdeAbsolute === "number" ? body.mdeAbsolute : undefined,
      alpha: typeof body.alpha === "number" ? body.alpha : undefined,
      looksTaken: typeof body.looksTaken === "number" ? body.looksTaken : undefined,
    }));
  }

  if (action === "sample") {
    const baselineRate = Number(body.baselineRate);
    const mdeAbsolute = Number(body.mdeAbsolute);
    if (!Number.isFinite(baselineRate) || !Number.isFinite(mdeAbsolute)) {
      return NextResponse.json({ error: "Give the current conversion rate and the smallest change worth acting on, both as decimals (0.03 = 3%)." }, { status: 400 });
    }
    const perArm = requiredSampleSize({ baselineRate, mdeAbsolute });
    return NextResponse.json({
      perArm, total: perArm * 2,
      note: `Each variant needs about ${perArm.toLocaleString()} impressions to detect a ${(mdeAbsolute * 100).toFixed(1)}-point change with 95% confidence and 80% power. Below that, any "winner" is a coin toss.`,
    });
  }

  // --- learn: what performed, and what to generate more of ------------------
  if (action === "learn") {
    const brandId = s("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    const experiments = Array.isArray(body.experiments) ? (body.experiments as ExperimentRecord[]) : [];
    return NextResponse.json(learnFromExperiments(brandId, experiments));
  }

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
