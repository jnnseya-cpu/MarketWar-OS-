import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import {
  DOMINION_DOCTRINE, OMNIRANK_HONESTY, OMNIRANK_MODULES, SENTINEL_BLOCKED, APEX_SWARM,
  ACU_PRICING, OMNIRANK_TIERS, DOMINION_VITALS, OMNIRANK_ROLLOUT, OMNIRANK_SUCCESS,
  omnirankOpportunity, dominionScore,
} from "@/backend/omnirank";

// OMNIRANK Dominion Stack (ES-05) — command + scoring API.
// GET → doctrine, honesty, modules, swarm, Sentinel gate, ACU economy, vitals,
//       rollout, success criteria.
// POST { action:"opportunity", inputs } → bounded Opportunity Score
// POST { action:"dominion", inputs }    → Dominion Score (5 vitals)
// White-hat only; transparent heuristics; no ranking promise.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    engine: "OMNIRANK Dominion Stack (ES-05)",
    doctrine: DOMINION_DOCTRINE,
    honesty: OMNIRANK_HONESTY,
    modules: OMNIRANK_MODULES,
    sentinelBlocked: SENTINEL_BLOCKED,
    swarm: APEX_SWARM,
    acuPricing: ACU_PRICING,
    tiers: OMNIRANK_TIERS,
    vitals: DOMINION_VITALS,
    rollout: OMNIRANK_ROLLOUT,
    success: OMNIRANK_SUCCESS,
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "omnirank"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";
  const inputs = (body.inputs && typeof body.inputs === "object" ? body.inputs : {}) as Record<string, number>;

  if (action === "opportunity") return NextResponse.json(omnirankOpportunity(inputs));
  if (action === "dominion") return NextResponse.json(dominionScore(inputs));
  return NextResponse.json({ error: "Unknown action — use opportunity or dominion" }, { status: 400 });
}
