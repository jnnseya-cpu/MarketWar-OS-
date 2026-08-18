import { NextRequest, NextResponse } from "next/server";
import {
  buildGtmPlan, toMarkdown, documentFilename, parseBusinessModel, GTM_DOCTRINE,
} from "@/backend/go-to-market";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";

// THE GO-TO-MARKET DOCUMENT.
//
// POST { business, offer, model, launchCity, budgetGbp, priceGbp, unitCostGbp,
//        hoursPerWeek, observedCloseRate, format? }
//
//   format "json"     → the plan as data (default)
//   format "markdown" → the document, as a file the browser saves
//
// The download is served from the SERVER rather than assembled in the browser
// for one reason: the document and the on-screen plan then come from the same
// function, so a section added to one cannot be missing from the other. A
// client-side exporter is the version that silently drops the risks a month
// after somebody adds a section.
//
// Not metered — no provider is called. The plan is arithmetic and prose
// computed from what the caller supplied, and somebody deciding whether to
// start a business should not spend credits to read it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "go-to-market"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const business = str("business");
  if (!business) return NextResponse.json({ error: "business is required — a plan is always somebody's." }, { status: 400 });

  // A close rate is only accepted as a FRACTION and only when it is plausible.
  // Somebody typing "20" meaning 20% would otherwise produce a funnel claiming
  // five conversations for a hundred customers.
  const rawRate = num(body.observedCloseRate);
  const closeRate = rawRate !== undefined
    ? (rawRate > 1 && rawRate <= 100 ? rawRate / 100 : rawRate <= 1 ? rawRate : undefined)
    : undefined;

  const plan = buildGtmPlan({
    business,
    offer: str("offer") || business,
    model: parseBusinessModel(body.model) ?? "service",
    launchCity: str("launchCity") || undefined,
    location: str("location") || undefined,
    currency: str("currency") || undefined,
    priceGbp: num(body.priceGbp),
    unitCostGbp: num(body.unitCostGbp),
    hoursPerWeek: num(body.hoursPerWeek),
    budgetGbp: num(body.budgetGbp),
    observedCloseRate: closeRate,
  });

  if (str("format") === "markdown") {
    const markdown = toMarkdown(plan, { generatedOn: new Date().toISOString().slice(0, 10) });
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${documentFilename(plan)}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    plan,
    filename: documentFilename(plan),
    doctrine: GTM_DOCTRINE,
  });
}
