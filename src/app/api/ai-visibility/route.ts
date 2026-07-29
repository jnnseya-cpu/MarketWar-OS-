import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, creditAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { configuredProviders } from "@/backend/gateway";
import {
  runVisibilityCheck, suggestQuestions, saveRun, listRuns, trend, RUN_BUDGET_MS, classifyIntent,
  type VisibilityQuestion,
} from "@/backend/ai-visibility";

// AI Visibility monitor — are you named when a buyer asks an assistant?
//
// GET  ?brandId=…[&business=&product=&location=&audience=]
//        → suggested questions, run history, trend, which assistants can be asked
// POST { brandId, business, domain?, questions?: string[] }
//        → asks every configured assistant each question, records the run
//
// There is no third-party key behind this. It uses the AI providers already
// configured, so the measurement — and the history — belong to the platform.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Questions × assistants, each a real model call. Reserve the full budget.
export const maxDuration = 60;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nowISO = (req: NextRequest) => {
  const h = req.headers.get("x-now");
  return h && !Number.isNaN(Date.parse(h)) ? new Date(h).toISOString() : new Date().toISOString();
};

// A run costs one AI call per question per assistant. Capped so a mistyped
// question list cannot spend a month's allowance in one press.
const MAX_QUESTIONS = 8;

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const p = req.nextUrl.searchParams;
  const runs = await listRuns(brandId);
  const assistants = configuredProviders();
  return NextResponse.json({
    suggested: suggestQuestions({
      business: p.get("business") || "",
      product: p.get("product") || "",
      location: p.get("location") || "",
      audience: p.get("audience") || "",
    }),
    runs,
    latest: runs[0] ?? null,
    trend: trend(runs),
    assistants,
    maxQuestions: MAX_QUESTIONS,
    note: assistants.length
      ? `${assistants.length} assistant(s) can be asked: ${assistants.join(", ")}. Each is asked directly — never via a fallback, so an answer is always attributed to the model that actually gave it.`
      : "No AI provider is configured, so no assistant can be asked and nothing can be measured. Check /api/health/ai.",
  });
}

export async function POST(req: NextRequest) {
  // Anchored at the top of the request, not at the top of the run: auth, access
  // and metering all take time, and a budget measured from after them can still
  // push the function past maxDuration. Overrunning it returns HTTP 504 with no
  // body — the button spins for ever and nothing is reported. Better to answer
  // with what was collected and say what was not.
  const startedAt = Date.now();
  const rl = rateLimit(clientKey(req, "ai-visibility"), 10, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const brand = s(body.business);
  if (!brand) return NextResponse.json({ error: "Pick a brand first — there is nothing to look for without a name." }, { status: 400 });

  const assistants = configuredProviders();
  if (!assistants.length) {
    return NextResponse.json({
      error: "No AI provider is configured, so no assistant can be asked. This is a configuration problem, not a visibility result — check /api/health/ai.",
    }, { status: 503 });
  }

  const asked = Array.isArray(body.questions)
    ? (body.questions as unknown[]).map(s).filter(Boolean).slice(0, MAX_QUESTIONS)
    : [];
  const questions: VisibilityQuestion[] = asked.length
    // Classified from the words, not stamped "buying". Stamping meant the
    // "what is <brand>?" question counted as a buying question, so the plan
    // reported "3 of 18" under a line saying that question was excluded.
    ? asked.map((text) => ({ id: text.slice(0, 40), text, intent: classifyIntent(text, brand) }))
    : suggestQuestions({
        business: brand,
        product: s(body.product),
        location: s(body.location),
        audience: s(body.audience),
      }).slice(0, MAX_QUESTIONS);

  if (!questions.length) return NextResponse.json({ error: "No questions to ask." }, { status: 400 });

  // Charged per model call — questions × assistants — because that is what it
  // costs. Metered before the work, and only after the request is known valid.
  const units = questions.length * assistants.length;
  const meter = await meterAction(auth, "llm", units);
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  const run = await runVisibilityCheck(
    { brandId, brand, domain: s(body.domain) || undefined, questions, assistants },
    nowISO(req),
    {},
    { deadline: startedAt + RUN_BUDGET_MS },
  );
  // Refund every call that was never made. A run that ran out of time, or hit an
  // assistant with no key, made fewer calls than it was charged for — and the
  // customer pays for answers, not for the count we intended to ask.
  const unasked = Math.max(0, units - run.askedCount);
  let refunded = 0;
  if (unasked > 0 && meter.metered && auth.uid) {
    refunded = unasked * ACTION_COST_ACU.llm;
    await creditAcus(auth.uid, refunded).catch(() => { refunded = 0; });
  }

  const { persisted } = await saveRun(run);
  const runs = await listRuns(brandId);

  return NextResponse.json({
    run,
    trend: trend(runs),
    runs: runs.slice(0, 12),
    persisted,
    balanceAcu: meter.balanceAcu === undefined ? undefined : meter.balanceAcu + refunded,
    charged: units * ACTION_COST_ACU.llm,
    refunded,
    // What the UI needs to offer "run the rest" without recounting for itself.
    asked: run.askedCount,
    planned: units,
    note: [
      run.note,
      refunded ? `${refunded} ACUs refunded for the ${unasked} call(s) that were never made.` : "",
      persisted ? "" : "Saved for this session only — durable storage is not configured, so this run will not be there to compare against next time.",
    ].filter(Boolean).join(" "),
  });
}
