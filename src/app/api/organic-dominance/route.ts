import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { gatewayLangFrom } from "@/backend/gateway";
import {
  runOnboarding, commandMetrics, dataSources, NAV_SECTIONS, opportunityScore, onboardingAcuQuote,
  type OnboardingInput, type OppFactors,
} from "@/backend/organic-dominance";

// MarketWar Organic Dominance OS API (Phase 1 — Intelligence Foundation).
// GET  → navigation map, data-source status, command metrics, ACU quote, doctrine.
// POST { action: "onboard", business, website?, description?, competitors[], location?, country?, languages[] }
//        → the Website-to-Growth intelligence workup (keyword/prompt universe,
//          competitor gaps, scored opportunities, content pillars, 90-day plan).
// POST { action: "score", factors } → recompute the transparent §13 opportunity score.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "organic-dominance"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "onboard";

  if (action === "score") {
    const f = (body.factors || {}) as OppFactors;
    return NextResponse.json({ score: opportunityScore(f) });
  }

  if (action === "onboard") {
    const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
    const arr = (k: string) => (Array.isArray(body[k]) ? (body[k] as unknown[]).map(String).filter(Boolean) : undefined);
    const business = s("business");
    if (!business) return NextResponse.json({ error: "business is required" }, { status: 400 });
    const input: OnboardingInput = {
      business,
      website: s("website"),
      description: s("description"),
      competitors: arr("competitors"),
      location: s("location"),
      country: s("country"),
      languages: arr("languages"),
      lang: gatewayLangFrom(req),
    };
    const result = await runOnboarding(input);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action — use onboard or score" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    product: "MarketWar Organic Dominance OS — autonomous demand-intelligence + market-execution",
    doctrine: "Listen → Predict → Decide → Create → Publish → Engage → Capture → Convert → Attribute → Optimise. Every insight carries a recommended action and a one-click execution. Honesty law: metrics are computed from real signals or clearly labelled; capabilities needing licensed external data are marked 'connect a data source' — never fabricated mentions, citations or share-of-voice.",
    navigation: NAV_SECTIONS,
    dataSources: dataSources(),
    metrics: commandMetrics({}).metrics,
    acuQuote: onboardingAcuQuote(),
    opportunityFormula: "Score = Demand × Commercial Intent × Relevance × Timing × Authority × Conversion ÷ Competition (each factor 0–1, computed server-side, transparent + editable).",
  });
}
