import { NextRequest, NextResponse } from "next/server";
import { jsonRoute, loadModule } from "@/backend/route-guard";
// TYPE-ONLY, SO NOTHING IS LOADED HERE. `import type` is erased at compile time
// and emits no require — the types stay, the runtime import does not.
import type { OnboardingInput, OppFactors } from "@/backend/organic-dominance";

// THIS ROUTE ANSWERED PRODUCTION WITH AN HTML PAGE, ON BOTH VERBS, AT 180ms.
//
// `jsonRoute` was already wrapping both handlers and it could not help, because
// the failure is not in a handler: the four modules above were STATIC imports,
// evaluated before either handler exists. Nothing in the process can be around
// that. `/diagnose` caught it — `server: vercel`, `x-vercel-id` present, no
// `cf-ray`, and Next's own `500: Internal Server Error` page as the body, which
// is the exact signature of a module-load failure (see backend/route-guard.ts).
//
// So every module this route needs is loaded INSIDE the guard. The cost is one
// dynamic import per request, already cached by the runtime after the first;
// the gain is that a load failure becomes JSON naming the module instead of a
// page that reads, on every screen, as the whole platform being down.
const engines = () => Promise.all([
  loadModule("@/backend/guard", () => import("@/backend/guard")),
  loadModule("@/backend/wallet", () => import("@/backend/wallet")),
  loadModule("@/backend/gateway", () => import("@/backend/gateway")),
  loadModule("@/backend/organic-dominance", () => import("@/backend/organic-dominance")),
]);

// A document generation runs behind this route, and DOCUMENT_BUDGET gives the
// gateway 100s. Without a maxDuration the function is killed at the platform
// default of ~10s — long before any provider could answer — so the generation
// could never have completed no matter what the gateway did.
export const maxDuration = 120;

// MarketWar Organic Dominance OS API (Phase 1 — Intelligence Foundation).
// GET  → navigation map, data-source status, command metrics, ACU quote, doctrine.
// POST { action: "onboard", business, website?, description?, competitors[], location?, country?, languages[] }
//        → the Website-to-Growth intelligence workup (keyword/prompt universe,
//          competitor gaps, scored opportunities, content pillars, 90-day plan).
// POST { action: "score", factors } → recompute the transparent §13 opportunity score.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function POSTImpl(req: NextRequest) {
  const [guard, wallet, gateway, engine] = await engines();
  const rl = guard.rateLimit(guard.clientKey(req, "organic-dominance"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "onboard";

  // The onboard workup calls the paid AI gateway — signed in, and CHARGED
  // BEFORE the provider is asked. Signing in was never the point on its own: an
  // authenticated customer with an empty wallet still spent our money.
  if (action === "onboard") {
    const auth = await guard.requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const meter = await wallet.meterAction(auth, "llm");
    if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });
  }

  if (action === "score") {
    const f = (body.factors || {}) as OppFactors;
    return NextResponse.json({ score: engine.opportunityScore(f) });
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
      lang: gateway.gatewayLangFrom(req),
    };
    const result = await engine.runOnboarding(input);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action — use onboard or score" }, { status: 400 });
}

async function GETImpl() {
  const [, , , engine] = await engines();
  return NextResponse.json({
    product: "MarketWar Organic Dominance OS — autonomous demand-intelligence + market-execution",
    doctrine: "Listen → Predict → Decide → Create → Publish → Engage → Capture → Convert → Attribute → Optimise. Every insight carries a recommended action and a one-click execution. Honesty law: metrics are computed from real signals or clearly labelled; capabilities needing licensed external data are marked 'connect a data source' — never fabricated mentions, citations or share-of-voice.",
    navigation: engine.NAV_SECTIONS,
    dataSources: engine.dataSources(),
    metrics: engine.commandMetrics({}).metrics,
    acuQuote: engine.onboardingAcuQuote(),
    opportunityFormula: "Score = Demand × Commercial Intent × Relevance × Timing × Authority × Conversion ÷ Competition (each factor 0–1, computed server-side, transparent + editable).",
  });
}


// EVERY ANSWER FROM THIS ROUTE IS JSON — see backend/route-guard.ts.
export const POST = jsonRoute(POSTImpl as never, { maxSeconds: 120, label: "/api/organic-dominance" });
export const GET = jsonRoute(GETImpl as never, { maxSeconds: 120, label: "/api/organic-dominance" });
