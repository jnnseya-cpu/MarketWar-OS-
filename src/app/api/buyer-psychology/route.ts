import { NextRequest, NextResponse } from "next/server";
import {
  detectDrivers, briefForObjective, demoBuyerMind, DRIVERS, type Driver,
} from "@/backend/buyer-psychology";

// BuyerMind AI™ API — customer-psychology engine (VideoDominance Gap 4 / the
// Buyer Psychology Agent). Detects the 15 purchase drivers in supplied text and
// builds a clip brief for a chosen psychological objective. Deterministic;
// reads only supplied text; scores are labelled ESTIMATES.
// POST { action: "detect", text }                     → ranked drivers + dominant
// POST { action: "brief", product, driver }           → clip brief for a driver
// GET  → doctrine, the 15 drivers, demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "detect";

  if (action === "detect") {
    if (typeof body.text !== "string" || body.text.trim() === "") return NextResponse.json({ error: "detect requires text" }, { status: 400 });
    return NextResponse.json(detectDrivers(body.text));
  }

  if (action === "brief") {
    const product = typeof body.product === "string" ? body.product : "";
    const driver = body.driver as Driver;
    if (!product) return NextResponse.json({ error: "brief requires product" }, { status: 400 });
    if (!DRIVERS.includes(driver)) return NextResponse.json({ error: `brief requires a valid driver (${DRIVERS.join(", ")})` }, { status: 400 });
    return NextResponse.json(briefForObjective({ product, driver }));
  }

  return NextResponse.json({ error: "Unknown action — use detect or brief" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "BuyerMind AI™ — customer-psychology engine (the Buyer Psychology Agent)",
    doctrine: "Finds the moment most likely to influence a SPECIFIC buyer motivation, not a generic 'interesting' clip. Detects the 15 purchase drivers in supplied text (lexicon-based estimate, never fabricated) and engineers a clip brief per driver. Honesty guard: urgency/social-proof/revenue proof must be real and evidenced.",
    drivers: DRIVERS,
    demo: demoBuyerMind(),
  });
}
