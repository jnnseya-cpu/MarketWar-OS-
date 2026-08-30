import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import {
  allFindings, buildGraph, whatWorks, DIMENSIONS, EDGE_KINDS, ENTITY_TYPES,
  GRAPH_DOCTRINE, MATERIAL_LIFT_PCT, MIN_IMPRESSIONS, MIN_SAMPLES,
  type ContentRecord, type Dimension,
} from "@/shared/knowledge-graph";

// §77 — content performance knowledge graph. Brand-scoped.
//
// POST { action: "graph",  brandId, records }             → entities and edges
// POST { action: "findings", brandId, records, dimension? } → what ran above your
//   own median, per dimension. Omit `dimension` for all of them.
// GET → the doctrine, the dimensions and the thresholds.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECORDS = 2000;

/**
 * One record, CHECKED rather than asserted.
 *
 * Counts arriving as strings would divide into a NaN engagement rate and then a
 * median computed from NaN, which produces a finding nobody can trace back to a
 * cause. Attributes are trimmed strings or absent — never coerced, because
 * `String(undefined)` is the literal "undefined" and would become an entity.
 */
function recordFrom(raw: unknown): ContentRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  const publishedAtISO = typeof r.publishedAtISO === "string" ? r.publishedAtISO.trim() : "";
  if (!id || !publishedAtISO || !Number.isFinite(Date.parse(publishedAtISO))) return null;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const out: ContentRecord = {
    id, publishedAtISO,
    impressions: num(r.impressions),
    engagements: num(r.engagements),
  };
  if (r.clicks !== undefined) out.clicks = num(r.clicks);
  if (r.conversions !== undefined) out.conversions = num(r.conversions);
  for (const dim of DIMENSIONS) {
    const v = r[dim];
    if (typeof v === "string" && v.trim()) out[dim] = v.trim();
  }
  return out;
}

const dimensionFrom = (v: unknown): Dimension | undefined =>
  typeof v === "string" && (DIMENSIONS as readonly string[]).includes(v) ? (v as Dimension) : undefined;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "knowledge-graph"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof b.brandId === "string" ? b.brandId : "";
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const records = (Array.isArray(b.records) ? b.records : [])
    .slice(0, MAX_RECORDS).map(recordFrom).filter((r): r is ContentRecord => r !== null);

  if (b.action === "graph") {
    return NextResponse.json(buildGraph(records));
  }

  if (b.action === "findings") {
    const dimension = dimensionFrom(b.dimension);
    const graph = buildGraph(records);
    return NextResponse.json({
      measuredPosts: graph.measuredPosts,
      medianEngagementRate: graph.medianEngagementRate,
      ...(dimension
        ? { dimension, findings: whatWorks(records, dimension) }
        : { byDimension: allFindings(records) }),
    });
  }

  return NextResponse.json({ error: "Unknown action — use graph or findings" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "§77 Content performance knowledge graph",
    doctrine: GRAPH_DOCTRINE,
    entityTypes: ENTITY_TYPES,
    edgeKinds: EDGE_KINDS,
    dimensions: DIMENSIONS,
    thresholds: { minImpressions: MIN_IMPRESSIONS, minSamples: MIN_SAMPLES, materialLiftPct: MATERIAL_LIFT_PCT },
    claimsCausation: false,
  });
}
