import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import { planBoost, planBoosts } from "@/backend/boost-ladder";
import type { OfferEconomics } from "@/backend/profit-guard-economics";
import type { Guardrails } from "@/backend/paid-guardrails";
import {
  LADDER_DOCTRINE, MIN_HOURS_LIVE, MIN_IMPRESSIONS_TO_JUDGE, MIN_POSTS_FOR_BASELINE,
  PROVEN_MULTIPLE, RUNGS, RUNG_MEANING, type OrganicPost, type Rung, type TestResult,
} from "@/shared/boost-ladder";

// §50 — Autonomous paid boost API. Brand-scoped, because the emergency stop is
// asked per brand and a caller must not be able to probe another tenant's halt
// state by naming its scope.
//
// POST { action: "plan",     brandId, post, history, ... }  → one post's next move
// POST { action: "plan-all", brandId, posts, history, ... } → every post, ordered
// GET                                                       → the rungs and the doctrine
//
// Nothing here spends. It returns a decision, an approved amount and the reason,
// and the spend lane of the emergency stop plus the approval queue still stand
// between that and a pound leaving.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read a post from the request, CHECKED rather than asserted.
 *
 * The cast guard is right to refuse `as OrganicPost` here: this is a request
 * body, so it is whatever the caller sent. A post whose impressions arrive as
 * the string "1200" would otherwise divide into a NaN engagement rate and
 * produce a confident verdict computed from nothing.
 */
function postFrom(raw: unknown): OrganicPost | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  const publishedAtISO = typeof r.publishedAtISO === "string" ? r.publishedAtISO.trim() : "";
  if (!id || !publishedAtISO || !Number.isFinite(Date.parse(publishedAtISO))) return null;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const post: OrganicPost = {
    id,
    impressions: num(r.impressions),
    engagements: num(r.engagements),
    publishedAtISO,
  };
  if (r.clicks !== undefined) post.clicks = num(r.clicks);
  if (r.conversions !== undefined) post.conversions = num(r.conversions);
  return post;
}

function testFrom(raw: unknown): TestResult | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const t: TestResult = {
    spendGbp: num(r.spendGbp),
    // Absent is FALSE, never true. A brand that did not say it has conversion
    // tracking does not have it as far as this ladder is concerned, and the
    // consequence of that default is a refusal to scale rather than a spend.
    conversionTracking: r.conversionTracking === true,
  };
  if (r.revenueGbp !== undefined) t.revenueGbp = num(r.revenueGbp);
  if (r.conversions !== undefined) t.conversions = num(r.conversions);
  return t;
}

function offerFrom(raw: unknown): OfferEconomics | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  if (!num(r.pricePence)) return undefined;
  const o: OfferEconomics = {
    pricePence: num(r.pricePence),
    cogsPence: num(r.cogsPence),
    fulfilmentPence: num(r.fulfilmentPence),
    paymentFeePence: num(r.paymentFeePence),
    taxPence: num(r.taxPence),
    returnsAllowancePct: num(r.returnsAllowancePct),
    otherVariablePence: num(r.otherVariablePence),
  };
  if (r.minProtectedMarginPence !== undefined) o.minProtectedMarginPence = num(r.minProtectedMarginPence);
  if (r.minProtectedMarginPct !== undefined) o.minProtectedMarginPct = num(r.minProtectedMarginPct);
  if (r.ltvMultiple !== undefined) o.ltvMultiple = num(r.ltvMultiple);
  return o;
}

function guardrailsFromBody(raw: unknown): Partial<Guardrails> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const g: Partial<Guardrails> = {};
  const keys = ["dailyBudgetGbp", "campaignBudgetGbp", "monthlyBudgetGbp", "maxCpaGbp", "minimumRoas", "maxTestSpendGbp", "maximumScalePct", "scaleRoas"] as const;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) g[k] = v;
  }
  return g;
}

const rungFrom = (v: unknown): Rung | undefined =>
  typeof v === "string" && (RUNGS as readonly string[]).includes(v) ? (v as Rung) : undefined;

const MAX_POSTS = 500;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "boost-ladder"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof b.brandId === "string" ? b.brandId : "";
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const history = (Array.isArray(b.history) ? b.history : []).slice(0, MAX_POSTS).map(postFrom).filter((p): p is OrganicPost => p !== null);
  const offer = offerFrom(b.offer);
  const guardrails = guardrailsFromBody(b.guardrails);
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const common = {
    history, offer, guardrails,
    testBudgetGbp: num(b.testBudgetGbp),
    spentTodayGbp: num(b.spentTodayGbp),
    spentThisMonthGbp: num(b.spentThisMonthGbp),
    // The emergency-stop scope is the brand the caller was just verified
    // against — never a scope taken from the body, which would let one tenant
    // read another's halt state through this endpoint.
    scope: brandId,
    nowISO: typeof b.nowISO === "string" ? b.nowISO : undefined,
  };

  if (b.action === "plan-all") {
    const rows = (Array.isArray(b.posts) ? b.posts : []).slice(0, MAX_POSTS);
    const posts: { post: OrganicPost; rung?: Rung; test?: TestResult; currentBudgetGbp?: number }[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const post = postFrom(r.post ?? r);
      if (!post) continue;
      posts.push({ post, rung: rungFrom(r.rung), test: testFrom(r.test), currentBudgetGbp: num(r.currentBudgetGbp) });
    }
    if (!posts.length) return NextResponse.json({ error: "No readable posts. Each needs an id, a publishedAtISO and numeric counts." }, { status: 400 });
    return NextResponse.json({ plans: await planBoosts({ ...common, posts }) });
  }

  if (b.action === "plan") {
    const post = postFrom(b.post);
    if (!post) return NextResponse.json({ error: "post needs an id, a publishedAtISO and numeric counts." }, { status: 400 });
    return NextResponse.json(await planBoost({
      ...common, post,
      rung: rungFrom(b.rung),
      test: testFrom(b.test),
      currentBudgetGbp: num(b.currentBudgetGbp),
    }));
  }

  return NextResponse.json({ error: "Unknown action — use plan or plan-all" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "§50 Autonomous Paid Boost — staged validation ladder",
    doctrine: LADDER_DOCTRINE,
    rungs: RUNGS.map((r) => ({ rung: r, meaning: RUNG_MEANING[r] })),
    thresholds: {
      minImpressionsToJudge: MIN_IMPRESSIONS_TO_JUDGE,
      minHoursLive: MIN_HOURS_LIVE,
      provenMultipleOfOwnMedian: PROVEN_MULTIPLE,
      minPostsForBaseline: MIN_POSTS_FOR_BASELINE,
    },
    spends: false,
  });
}
