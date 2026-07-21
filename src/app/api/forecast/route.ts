import { NextRequest, NextResponse } from "next/server";
import { forecastRevenue } from "@/backend/forecast";
import { summarize, type RevenueEvent } from "@/shared/results";
import { brandSummary } from "@/backend/ledger";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";

// Revenue Forecast API — next-30-day money computed from the REAL results ledger
// (run-rate + open-lead upside), never an LLM narrative or a fixed figure.
//   POST { brandId }            → loads the brand's ledger summary server-side
//   POST { summary }            → forecasts a summary the client already holds
//   POST { events[] }           → summarises then forecasts
// GET → doctrine. Rate-limited; hardened so a partial body never 500s.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "forecast"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    if (brandId) {
      const summary = await brandSummary(brandId);
      return NextResponse.json(forecastRevenue(summary));
    }
    if (body.summary && typeof body.summary === "object") {
      return NextResponse.json(forecastRevenue(body.summary as ReturnType<typeof summarize>));
    }
    const events = Array.isArray(body.events) ? (body.events as RevenueEvent[]) : [];
    return NextResponse.json(forecastRevenue(summarize(events)));
  } catch {
    // A malformed body must never 500 — the engine already normalises input;
    // this is the final guard so the forecast degrades to an honest empty state.
    return NextResponse.json(forecastRevenue(summarize([])));
  }
}

export async function GET() {
  return NextResponse.json({
    engine: "Revenue Forecast Engine — next-30-day money from the real results ledger",
    doctrine: "Deterministic projection from a brand's own attributed revenue (run-rate) plus open-lead upside. Three labelled scenarios (base/push/stretch), each with its basis. No LLM narrative, no fabricated figure; honest empty-state when the ledger is empty.",
    scenarios: ["base", "push", "stretch"],
  });
}
