import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, creditAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { listRuns } from "@/backend/ai-visibility";
import { missingQuestions, incumbents } from "@/backend/ai-citation";
import { findCitationSources } from "@/backend/citation-sources";

// Where the models got their answer from.
//
// POST { brandId, domain?, location? }
//   → searches the questions the brand was absent from, reads the pages that
//     rank, and reports which of them name the same rivals the assistants did.
//
// Charged per search, because that is the metered provider call. Fetching the
// pages costs us bandwidth and nothing else, so it is not charged again.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = Number(process.env.AI_SOURCES_BUDGET_MS || 45_000);
const MAX_QUESTIONS = 4;
const PER_QUESTION = 5;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const rl = rateLimit(clientKey(req, "ai-sources"), 6, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const runs = await listRuns(brandId, 5);
  const run = runs[0];
  if (!run) {
    return NextResponse.json({
      error: "There is no recorded visibility run for this brand yet. Run the check first — the searches come from the questions you were absent from.",
    }, { status: 409 });
  }

  const questions = missingQuestions(run).map((m) => m.question).slice(0, MAX_QUESTIONS);
  if (!questions.length) {
    return NextResponse.json({
      report: null,
      note: "You were named in every question that asked for a vendor, so there is no absence to chase. Re-run the check in a week and watch whether it holds.",
    });
  }

  const rivals = incumbents(run).map((c) => c.name);

  const units = questions.length;
  const meter = await meterAction(auth, "search", units);
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  const report = await findCitationSources(
    { brand: run.brand, brandDomain: s(body.domain) || run.domain, questions, rivals, location: s(body.location) },
    {},
    { deadline: startedAt + BUDGET_MS, perQuestion: PER_QUESTION },
  );

  // No live search means no searches were billable. Give it all back.
  const unsearched = report.live ? Math.max(0, units - report.searched) : units;
  let refunded = 0;
  if (unsearched > 0 && meter.metered && auth.uid) {
    refunded = unsearched * ACTION_COST_ACU.search;
    await creditAcus(auth.uid, refunded).catch(() => { refunded = 0; });
  }

  return NextResponse.json({
    report,
    basedOnRun: { id: run.id, ranAt: run.ranAt },
    charged: units * ACTION_COST_ACU.search,
    refunded,
    balanceAcu: meter.balanceAcu === undefined ? undefined : meter.balanceAcu + refunded,
    note: [
      report.note,
      refunded ? `${refunded} ACUs refunded — ${unsearched} search(es) were not run.` : "",
    ].filter(Boolean).join(" "),
  });
}
