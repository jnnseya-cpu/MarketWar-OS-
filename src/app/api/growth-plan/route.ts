import { NextRequest, NextResponse } from "next/server";
import { generateGrowthPlan, type GrowthPlanInput } from "@/backend/growth-plan";
import { rateLimit, clientKey } from "@/backend/guard";
import { gatewayLangFrom } from "@/backend/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { business, industry?, location?, product?, audience?, offer?, price?,
//        pain?, goalGbp?, auditSummary? } → a concrete 30-day growth plan.
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "growth-plan"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const business = s("business");
  if (!business) return NextResponse.json({ error: "business is required" }, { status: 400 });

  const input: GrowthPlanInput = {
    business,
    industry: s("industry"), location: s("location"), product: s("product"),
    audience: s("audience"), offer: s("offer"), price: s("price"), pain: s("pain"),
    goalGbp: typeof body.goalGbp === "number" ? body.goalGbp : undefined,
    auditSummary: s("auditSummary"),
    lang: gatewayLangFrom(req),
  };

  try {
    return NextResponse.json(await generateGrowthPlan(input));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Plan error" }, { status: 502 });
  }
}
