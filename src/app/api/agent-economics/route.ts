import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { requireAuth } from "@/backend/guard";
import { readSpend } from "@/backend/agent-spend";
import { listEvents } from "@/backend/ledger";
import { agentEconomics, AGENT_ECONOMICS_DOCTRINE, MIN_RUNS_TO_JUDGE, PENCE_PER_ACU } from "@/shared/agent-economics";

// §100 — per-agent cost and impact.
//
// GET  → the doctrine and the thresholds.
// POST { brandId?, sinceISO? } → the report for the CALLER'S OWN wallet.
//
// THE WALLET IS THE CALLER'S, ALWAYS, AND NEVER COMES FROM THE BODY. Spend rows
// are keyed by wallet id, and a wallet id here is a user id — so accepting one
// from the request would hand any signed-in customer a complete breakdown of
// another customer's AI spending. The only wallet this endpoint will read is
// `auth.uid`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "agent-economics"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* an empty body is the whole-history report */ }

  const walletId = auth.uid || "";
  if (!walletId) {
    // Demo mode: no accounts, so there is no wallet and nothing has been
    // metered. Reported as such rather than as an empty report, which would
    // read as "your agents cost nothing".
    return NextResponse.json({
      ...agentEconomics({ spend: [] }),
      headline: "No accounts are enforced on this deployment, so nothing is metered and there is no spend to report.",
    });
  }

  const spend = await readSpend(walletId).catch(() => []);

  // Revenue is optional and brand-scoped. Without a brand there is no revenue to
  // join against, and every line correctly reports `cost_only` rather than zero.
  const brandId = typeof b.brandId === "string" ? b.brandId.trim() : "";
  const revenue = brandId
    ? (await listEvents(brandId).catch(() => [])).map((e) => ({ source: e.source, amountGbp: e.amountGbp, at: e.at }))
    : [];

  const sinceISO = typeof b.sinceISO === "string" && Number.isFinite(Date.parse(b.sinceISO)) ? b.sinceISO : undefined;
  return NextResponse.json(agentEconomics({ spend, revenue, sinceISO }));
}

export async function GET() {
  return NextResponse.json({
    engine: "§100 Per-agent cost and impact",
    doctrine: AGENT_ECONOMICS_DOCTRINE,
    minRunsToJudge: MIN_RUNS_TO_JUDGE,
    pencePerAcu: PENCE_PER_ACU,
    verdicts: ["earning", "losing", "cost_only", "not_enough_runs"],
  });
}
