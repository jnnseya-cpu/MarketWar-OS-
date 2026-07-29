import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, creditAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { listRuns } from "@/backend/ai-visibility";
import { geoReadiness } from "@/backend/geo-readiness";
import { buildPlaybook } from "@/backend/ai-citation";

// The "how do I actually get cited" half of AI Visibility.
//
// POST { brandId, domain?, category?, runId? }
//   → reads the most recent recorded run, measures the site, and returns a
//     ranked plan where every action cites the fact it came from.
//
// It deliberately works from a RECORDED run rather than asking the assistants
// again: the measurement has already been paid for, and re-asking would produce
// slightly different answers, so the advice would not match the score the
// customer is looking at.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Under the ceiling, so the response is written here rather than the function
// being killed with the browser still waiting. Same lesson as the monitor's 504.
const BUDGET_MS = Number(process.env.AI_CITATION_BUDGET_MS || 45_000);
const MAX_BRIEFS = 3;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const rl = rateLimit(clientKey(req, "ai-citation"), 10, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const runs = await listRuns(brandId, 50);
  const runId = s(body.runId);
  const run = runId ? runs.find((r) => r.id === runId) : runs[0];
  if (!run) {
    return NextResponse.json({
      error: "There is no recorded visibility run for this brand yet. Run the check first — the plan is built from what the assistants actually said, so there is nothing to build from until they have been asked.",
    }, { status: 409 });
  }

  // Charged for the content briefs only. The ranked actions come from a run
  // that was already paid for and from fetching the customer's own site, and
  // charging twice for one measurement would breach the pricing law.
  const units = MAX_BRIEFS;
  const meter = await meterAction(auth, "llm", units);
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  // The site fetch must not be able to eat the whole budget on a slow host.
  const domain = s(body.domain) || run.domain || "";
  const geo = domain
    ? await Promise.race([
        geoReadiness(domain).catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
      ])
    : null;

  const playbook = await buildPlaybook(
    { run, geo, category: s(body.category), runsRecorded: runs.length },
    {},
    { deadline: startedAt + BUDGET_MS, maxBriefs: MAX_BRIEFS },
  );

  // Refund the briefs that were not written — whether the clock ran out or a
  // model returned something unparseable. The customer pays for briefs.
  const unwritten = Math.max(0, units - playbook.briefs.length);
  let refunded = 0;
  if (unwritten > 0 && meter.metered && auth.uid) {
    refunded = unwritten * ACTION_COST_ACU.llm;
    await creditAcus(auth.uid, refunded).catch(() => { refunded = 0; });
  }

  return NextResponse.json({
    playbook,
    basedOnRun: { id: run.id, ranAt: run.ranAt, askedCount: run.askedCount },
    siteChecked: Boolean(geo?.reachable),
    charged: units * ACTION_COST_ACU.llm,
    refunded,
    balanceAcu: meter.balanceAcu === undefined ? undefined : meter.balanceAcu + refunded,
    note: [
      playbook.note,
      domain && !geo
        ? "Your website could not be read in time, so the technical checks are missing from this plan — the actions that come from the AI answers are unaffected."
        : "",
      refunded ? `${refunded} ACUs refunded for ${unwritten} brief(s) that were not produced.` : "",
    ].filter(Boolean).join(" "),
  });
}
