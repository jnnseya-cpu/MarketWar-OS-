import { NextRequest, NextResponse } from "next/server";
import { runAutopilotCycle, type BrandLite } from "@/backend/autopilot";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import { vaultCountsFor } from "@/backend/contacts";

// Revenue Autopilot — runs one acquisition cycle for a brand while the operator
// is away. POST the brand + desired autonomy + budget; a scheduler (nightly cron)
// calls this per brand so it runs unattended. Governed by the autonomy dial;
// never fabricates revenue.
//
// POST { brand: {id,name,industry,product,audience,location,offer,goal},
//        requestedLevel?, budgetGbp?, nowISO? }  → AutopilotRun
// GET  → doctrine + how to schedule it.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "autopilot"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const b = (body.brand ?? {}) as Record<string, unknown>;
  const brand: BrandLite = {
    id: typeof b.id === "string" && b.id.trim() ? b.id.trim() : "",
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim() : "",
    industry: typeof b.industry === "string" ? b.industry : undefined,
    product: typeof b.product === "string" ? b.product : undefined,
    audience: typeof b.audience === "string" ? b.audience : undefined,
    location: typeof b.location === "string" ? b.location : undefined,
    offer: typeof b.offer === "string" ? b.offer : undefined,
    goal: typeof b.goal === "string" ? b.goal : undefined,
  };
  if (!brand.id || !brand.name) return NextResponse.json({ error: "brand.id and brand.name are required" }, { status: 400 });

  // Only the brand's owner can run its autopilot / read its vault (demo passes through).
  const access = await resolveBrandAccess(req, brand.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Real counts from this brand's Customer Vault — makes reactivate/prospect real.
  const vault = await vaultCountsFor(brand.id);

  // Deterministic: the caller supplies the timestamp (engines never call Date).
  const nowISO = typeof body.nowISO === "string" && body.nowISO ? body.nowISO : new Date().toISOString();
  const run = runAutopilotCycle({
    brand,
    requestedLevel: typeof body.requestedLevel === "number" ? body.requestedLevel : Number(body.requestedLevel) || 3,
    budgetGbp: typeof body.budgetGbp === "number" ? body.budgetGbp : Number(body.budgetGbp) || 0,
    nowISO,
    vault,
  });
  return NextResponse.json(run);
}

export async function GET() {
  return NextResponse.json({
    engine: "Revenue Autopilot — find customers while you sleep",
    doctrine: "Runs one acquisition cycle per brand: scans the highest-£ acquisition moves and, governed by the autonomy dial (L0–L4; children/health/regulated capped to approval), auto-executes owned/low-risk moves or queues the rest. Never fabricates revenue — real money enters only via the money loop.",
    scheduling: "Point a scheduler at POST /api/autopilot for each active brand (nightly). Firebase: a Scheduled Cloud Function; Vercel: a Cron Job; or any cron hitting the endpoint. Pass the brand profile + requestedLevel + budgetGbp.",
  });
}
