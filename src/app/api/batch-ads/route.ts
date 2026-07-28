import { NextRequest, NextResponse } from "next/server";
import { planBatch, renderBatch, AD_FORMATS, AD_ANGLES, type BatchRequest } from "@/backend/batch-ads";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, ACTION_COST_ACU, creditAcus } from "@/backend/wallet";

// Batch static ads — one product photo into a full set of on-brand variants.
//
//   POST { action:"plan",   brandId, ... } → the batch shape + exact cost, free
//   POST { action:"render", brandId, ... } → generate it
//
// PLAN is deliberately free and separate. Generating twenty images is the most
// expensive single thing a customer can do here, so they see the grid and the
// price before a penny moves, not after.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// A batch is capped. Beyond this the wait is longer than anyone will sit
// through, and the marginal ad stops being worth its ACUs.
const MAX_VARIANTS = 24;

function briefFrom(body: Record<string, unknown>): BatchRequest {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);
  const arr = <T,>(k: string): T[] | undefined =>
    Array.isArray(body[k]) ? (body[k] as T[]) : undefined;
  return {
    business: s("business") || "",
    product: s("product") || "",
    productImageUrl: s("productImageUrl"),
    offer: s("offer"),
    pain: s("pain"),
    proofQuote: s("proofQuote"),
    deadline: s("deadline"),
    brandColours: arr<string>("brandColours"),
    angles: arr("angles"),
    formats: arr("formats"),
    treatments: arr("treatments"),
    quality: (s("quality") as BatchRequest["quality"]) || "standard",
  };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "batch-ads"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const brief = briefFrom(body);
  if (!brief.business || !brief.product) {
    return NextResponse.json({ error: "Tell us the business and what it sells — a batch built on neither is a batch of generic pictures." }, { status: 400 });
  }

  const plan = planBatch(brief);
  if (!plan.count) {
    return NextResponse.json({
      error: "Nothing to build. Every angle needs material we do not have — add an offer, the customer's problem, or a real customer quote.",
      skipped: plan.skipped,
    }, { status: 400 });
  }

  const costAcu = plan.count * ACTION_COST_ACU.image;

  if ((typeof body.action === "string" ? body.action : "plan") === "plan") {
    return NextResponse.json({
      ...plan,
      costAcu,
      costGbp: Number((costAcu / 100).toFixed(2)),
      formats: AD_FORMATS,
      angles: Object.entries(AD_ANGLES).map(([id, a]) => ({ id, label: a.label, brief: a.brief })),
      note: `${plan.count} ads across ${new Set(plan.variants.map((v) => v.angle)).size} angles and ${new Set(plan.variants.map((v) => v.format)).size} formats. Nothing is spent until you render.`,
    });
  }

  if (plan.count > MAX_VARIANTS) {
    return NextResponse.json({ error: `That plan is ${plan.count} ads — the limit is ${MAX_VARIANTS} per batch. Narrow the angles or formats.` }, { status: 400 });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const meter = await meterAction(auth, "image", plan.count);
  if (!meter.allowed) return NextResponse.json({ error: meter.error, costAcu }, { status: meter.status });

  const result = await renderBatch(brief, plan);

  // Refund what did not render. A customer pays for ads, not for attempts.
  const unrendered = result.variants.filter((v) => v.status === "render_failed").length;
  let refunded = 0;
  if (unrendered > 0 && meter.metered && auth.uid) {
    refunded = unrendered * ACTION_COST_ACU.image;
    await creditAcus(auth.uid, refunded).catch(() => { refunded = 0; });
  }

  return NextResponse.json({
    ...result,
    skipped: plan.skipped,
    chargedAcu: (meter.charged ?? 0) - refunded,
    refundedAcu: refunded,
    balanceAcu: meter.balanceAcu,
  });
}

export async function GET() {
  return NextResponse.json({
    engine: "Batch static ads",
    formats: AD_FORMATS,
    angles: Object.entries(AD_ANGLES).map(([id, a]) => ({ id, label: a.label, brief: a.brief })),
    maxVariants: MAX_VARIANTS,
    pricePerAdAcu: ACTION_COST_ACU.image,
    doctrine:
      "A batch varies the ARGUMENT, not just the crop — the offer, the problem, the proof, the comparison — because that is the axis that changes performance. Angles whose material is missing are dropped rather than invented: no proof ad without a real quote, no countdown without a real deadline. Every variant is checked against the customer's own product photo, which is what makes a batch safe to post without opening each one.",
  });
}
