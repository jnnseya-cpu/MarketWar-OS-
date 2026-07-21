import { NextRequest, NextResponse } from "next/server";
import { commandBriefing } from "@/backend/command-summary";
import { summarize, type RevenueEvent } from "@/shared/results";
import { brandSummary } from "@/backend/ledger";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";

// Command-Centre Briefing API.
// Turns a brand's REAL results-ledger summary into a prioritised "what to do
// next" briefing (opportunities / risks / next actions). Two ways in, both
// computed from real data — never fabricated:
//   POST { brandId }               → loads the brand's ledger summary server-side
//   POST { business?, summary }    → briefs a summary the client already holds
//   POST { business?, events[] }   → briefs from raw events (summarised here)
// GET → engine doctrine.
//
// Rate-limited. No provider cost is involved.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "command-summary"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const business = typeof body.business === "string" ? body.business : "Your brand";
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  // The brandId branch reads a brand's real ledger — verify ownership first.
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    // 1) Load the brand's real ledger summary if a brandId is supplied.
    if (brandId) {
      const summary = await brandSummary(brandId);
      return NextResponse.json(commandBriefing(business, summary));
    }

    // 2) Client-supplied summary (already computed by the results context).
    if (body.summary && typeof body.summary === "object") {
      return NextResponse.json(commandBriefing(business, body.summary as ReturnType<typeof summarize>));
    }

    // 3) Raw events → summarise then brief.
    const events = Array.isArray(body.events) ? (body.events as RevenueEvent[]) : [];
    return NextResponse.json(commandBriefing(business, summarize(events)));
  } catch {
    // A malformed summary/body must never 500 — the engine already normalises
    // partial input; this is the final belt-and-braces guard so the command
    // centre degrades to an honest empty briefing instead of an error.
    return NextResponse.json(commandBriefing(business, summarize([])));
  }
}

export async function GET() {
  return NextResponse.json({
    engine: "Command-Centre Briefing Engine — prioritised next moves from the real results ledger",
    doctrine: "Reasons only over a brand's own attributed revenue, per-source rollups, leads and orders. Deterministic and wall-clock-free; honest empty-state when the ledger is empty. No fabricated figures.",
    outputs: ["headline", "momentum", "opportunities", "risks", "nextActions"],
  });
}
