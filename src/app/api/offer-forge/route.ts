import { NextRequest, NextResponse } from "next/server";
import {
  forgeOffers, offerLadder, demoOfferForge, OFFER_TYPES, MARGIN_FLOOR_PCT,
  type ProductEconomics,
} from "@/backend/offer-forge";

// OfferForge AI API — VideoDominance Gap 5. Generates offers from REAL product
// economics; margins are real math and never breach the platform margin floor.
// POST { action: "forge",  input: { product, priceGbp, costGbp, stock? } }
// POST { action: "ladder", input: { product, priceGbp, costGbp, stock? } }
// GET  → doctrine, offer types, demo

function parseEconomics(raw: unknown): { input?: ProductEconomics; error?: string } {
  if (typeof raw !== "object" || raw === null) return { error: "input is required" };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.product !== "string" || obj.product.trim() === "") return { error: "input.product is required" };
  if (typeof obj.priceGbp !== "number" || !Number.isFinite(obj.priceGbp) || obj.priceGbp <= 0) return { error: "input.priceGbp must be a positive number" };
  if (typeof obj.costGbp !== "number" || !Number.isFinite(obj.costGbp) || obj.costGbp < 0) return { error: "input.costGbp must be a non-negative number" };
  if (obj.costGbp > obj.priceGbp) return { error: "input.costGbp must not exceed input.priceGbp — an offer must never sell below cost" };
  const stock = typeof obj.stock === "number" && Number.isFinite(obj.stock) ? Math.max(0, Math.floor(obj.stock)) : undefined;
  return { input: { product: obj.product, priceGbp: obj.priceGbp, costGbp: obj.costGbp, stock } };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "forge";

  if (action === "forge" || action === "ladder") {
    const { input, error } = parseEconomics(body.input);
    if (error || !input) return NextResponse.json({ error: error ?? "input is required" }, { status: 400 });
    return NextResponse.json(action === "forge" ? forgeOffers(input) : offerLadder(input));
  }

  return NextResponse.json({ error: "Unknown action — use forge or ladder" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "OfferForge AI — generate offers from real product economics (VideoDominance Gap 5)",
    doctrine: `Forges one offer per archetype from the ACTUAL supplied price, cost and stock. Every margin is real arithmetic; no offer ever sells below cost and none breaches the ${MARGIN_FLOOR_PCT}% margin floor. Stock-dependent offers are non-viable at 0 stock. Demand lift is the only guessed quantity and is always labelled an ESTIMATE — never fabricated.`,
    marginFloorPct: MARGIN_FLOOR_PCT,
    offerTypes: OFFER_TYPES,
    demo: demoOfferForge(),
  });
}
