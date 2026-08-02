import { NextRequest, NextResponse } from "next/server";
import { buildICP, searchProspects, scoreDeal, buildSequence, PIPELINE_STAGES, type ICP, type ICPInput, type Prospect } from "@/backend/prospecting";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// B2B Prospecting Engine API (Apollo-inspired LeadWar Room).
// POST { action: "icp", product, ... }            → ideal customer profile
// POST { action: "search", icp, industry?, ... }  → enriched prospects + deal scores
// POST { action: "sequence", prospect, icp }       → outreach sequence + call script
// GET → pipeline stages + compliance doctrine

export const runtime = "nodejs";
// The customer is charged for this route's work BEFORE the work runs, so a
// platform timeout is not a slow page — it is a debit with nothing delivered
// and no code left alive to refund it. Vercel's default is about ten seconds;
// a live crawl plus a provider round-trip does not fit in ten seconds, and this
// route reaches both. maxDuration is the only thing that keeps the function
// alive long enough for the paid-for work to finish or fail honestly.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Rate-limit always; require auth + meter the prospect SEARCH (it hits Serper).
  const rl = rateLimit(clientKey(req, "prospecting"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "icp";

  if (action === "search") {
    const meter = await meterAction(auth, "search");
    if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });
  }

  if (action === "icp") {
    const input = body as unknown as ICPInput;
    if (!input.product) return NextResponse.json({ error: "product is required" }, { status: 400 });
    return NextResponse.json(buildICP(input));
  }

  if (action === "search") {
    const icp = (body.icp as ICP) || buildICP({ product: typeof body.product === "string" ? body.product : "AI customer-acquisition OS" });
    const dealSize = typeof body.dealSizeGbp === "number" ? body.dealSizeGbp : 5000;
    const found = await searchProspects(icp, {
      count: typeof body.count === "number" ? body.count : 8,
      industry: typeof body.industry === "string" ? body.industry : undefined,
      location: typeof body.location === "string" ? body.location : undefined,
    });
    const prospects = found.prospects.map((p) => ({ ...p, dealScore: scoreDeal(p, icp, dealSize) }))
      .sort((a, b) => b.dealScore.dealProbability - a.dealScore.dealProbability);
    return NextResponse.json({ mode: found.mode, note: found.note, icp, prospects });
  }

  if (action === "sequence") {
    const icp = (body.icp as ICP) || buildICP({ product: "AI customer-acquisition OS" });
    const prospect = body.prospect as Prospect;
    if (!prospect) return NextResponse.json({ error: "prospect is required" }, { status: 400 });
    return NextResponse.json(buildSequence(prospect, icp));
  }

  return NextResponse.json({ error: "Unknown action — use icp, search or sequence" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "B2B Prospecting Engine (Apollo-inspired) — ICP → prospects → Deal Probability → sequence → pipeline",
    pipelineStages: PIPELINE_STAGES,
    doctrine: "Compliant-first UK/EU B2B: corporate/generic emails prioritised; personal business emails flagged as personal data (legitimate-interest + opt-out); no private individuals, no invented contacts; suppression + sending limits + one-click unsubscribe enforced on the send path.",
  });
}
