import { NextRequest, NextResponse } from "next/server";
import {
  ownerDashboard, demoOwnerDashboard, recyclingRoi, exportCharges,
  ACU_RULES, COST_CONTROLS, REVENUE_LAYERS, type LedgerEntry,
} from "@/backend/admin-economics";
import { requireAuth } from "@/backend/guard";

// Platform-Owner Economics API (spec §16 + "Administrative Controls").
// OWNER-ONLY surface — this is the single place provider cost and gross margin
// are ever computed for display; user-facing surfaces (/api/acu et al.) never
// expose provider cost. In production this route sits behind the platform-owner
// role gate (U10/U11) and reads the acu_ledger; in demo it uses a deterministic
// ledger so the Owner Dashboard renders with zero config.
//
// POST { action: "dashboard", ledger?: LedgerEntry[] }  → OwnerDashboard
// POST { action: "recycling", generationCostGbp, salePriceAcus, unitsSold }
// GET  → doctrine, ACU rules, cost controls, revenue layers, export charges, demo dashboard

export async function POST(req: NextRequest) {
  // Owner-only economics (provider cost + gross margin). Enforced in production;
  // open in zero-config demo. Requires the platform_admin scope when live.
  const auth = await requireAuth(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "dashboard";

  if (action === "dashboard") {
    const ledger = Array.isArray(body.ledger) ? (body.ledger as LedgerEntry[]) : null;
    return NextResponse.json(ledger && ledger.length ? ownerDashboard(ledger) : demoOwnerDashboard());
  }

  if (action === "recycling") {
    const num = (k: string, d = 0) => (typeof body[k] === "number" ? (body[k] as number) : d);
    return NextResponse.json(recyclingRoi({
      generationCostGbp: num("generationCostGbp", 1),
      salePriceAcus: num("salePriceAcus", 200),
      unitsSold: num("unitsSold", 1),
    }));
  }

  return NextResponse.json({ error: "Unknown action — use dashboard or recycling" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    engine: "Platform-Owner Economics Engine — the utility-company back office",
    doctrine: "Monetise usage, not access. Every AI action logs its true provider cost; the OWNER sees gross margin, the user never sees provider cost. Margin wins on a lower cost base (caching, reuse, small-model routing, ACU recycling), never by breaching the floor.",
    ownerOnly: true,
    acuRules: ACU_RULES,
    costControls: COST_CONTROLS,
    revenueLayers: REVENUE_LAYERS,
    exportCharges: exportCharges(),
    demoDashboard: demoOwnerDashboard(),
  });
}
