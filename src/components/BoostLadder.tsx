"use client";

// §50's surface — WHICH POST GETS MONEY, AND WHY NOT THE OTHERS.
//
// The engine returns a ranked list of decisions. The screen's whole job is to
// make three things impossible to misread, because each of them has cost real
// businesses real money:
//
//   • A REFUSAL IS NOT A FAILURE, and the two must not look alike. "Live for 3
//     hours" and "below your median" are both non-promotions and they mean
//     opposite things — one says wait, the other says not this post. They get
//     different words and different colours.
//   • THE APPROVED AMOUNT IS THE ONE TO READ. When a ceiling trims £150 to £40,
//     showing £150 anywhere prominent is showing money that cannot be spent. The
//     proposal is struck through beside it, never instead of it.
//   • A BLOCKER IS NAMED, NOT IMPLIED. "Nothing goes ahead" with no reason sends
//     somebody to look for a fault that is a setting.
//
// Nothing here spends. The button asks the engine what it would do; the approval
// queue and the emergency stop's spend lane still stand between that and a pound.

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp, Ban, Clock, PoundSterling, Info } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { RUNG_MEANING, type Rung } from "@/shared/boost-ladder";

type Plan = {
  postId: string;
  rung: Rung;
  baseline: { engagementRate: number | null; posts: number; usable: boolean; why: string };
  organic: { proven: boolean; status: "proven" | "not_yet" | "below_median"; reason: string; evidence: { impressions: number; hoursLive: number; multipleOfMedian: number | null } };
  step: { from: Rung; to: Rung; action: "hold" | "start_test" | "scale" | "retire" | "cap"; proposedGbp: number; reason: string; blockers: string[] };
  approvedGbp: number;
  trimmed: boolean;
  blockers: string[];
  maxCpaGbp?: number;
  summary: string;
};

type Post = { id: string; impressions: number; engagements: number; clicks?: number; publishedAtISO: string };

const ACTION_STYLE: Record<Plan["step"]["action"], { label: string; ring: string; text: string; Icon: typeof TrendingUp }> = {
  scale: { label: "Scale it", ring: "border-emerald-500/30 bg-emerald-500/[0.06]", text: "text-emerald-300", Icon: TrendingUp },
  start_test: { label: "Start a paid test", ring: "border-sky-500/30 bg-sky-500/[0.06]", text: "text-sky-300", Icon: PoundSterling },
  retire: { label: "Retire it", ring: "border-rose-500/30 bg-rose-500/[0.06]", text: "text-rose-300", Icon: Ban },
  cap: { label: "At the ceiling", ring: "border-amber-500/30 bg-amber-500/[0.06]", text: "text-amber-300", Icon: Info },
  hold: { label: "No money yet", ring: "border-ink-800 bg-ink-950/40", text: "text-slate-400", Icon: Clock },
};

const money = (n: number) => `£${n.toFixed(2)}`;

export default function BoostLadder({ posts, history }: { posts?: Post[]; history?: Post[] }) {
  const { activeBrand } = useActiveBrand();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Distinguishes "we have not asked" from "we asked and there is nothing".
  const [asked, setAsked] = useState(false);

  const load = useCallback(async () => {
    if (!activeBrand || !posts?.length) return;
    setLoading(true); setError(null);
    try {
      const res = await authedFetch("/api/boost-ladder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan-all", brandId: activeBrand.id,
          posts: posts.map((p) => ({ post: p })),
          history: history ?? posts,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "That did not go through.");
      setPlans(Array.isArray(d.plans) ? d.plans : []);
      setAsked(true);
    } catch (e) {
      // "Could not ask" is not "no posts qualify". Conflating them is the defect
      // that made three other panels blame the owner for a failed request.
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [activeBrand, posts, history]);

  useEffect(() => { void load(); }, [load]);

  if (!activeBrand) return null;

  const baseline = plans?.[0]?.baseline;

  return (
    <div className="card mb-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">Paid boost ladder</h2>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Organic earns the money before the money is spent. Every post is compared to <strong className="text-slate-300">your own median</strong>, never an industry average, and nothing here spends — it decides.
      </p>

      {baseline && (
        <p className="mb-3 rounded-lg border border-ink-800 bg-ink-950/40 p-2.5 text-xs text-slate-400">
          {baseline.usable && baseline.engagementRate !== null
            ? <>Your median engagement is <strong className="text-slate-200">{(baseline.engagementRate * 100).toFixed(2)}%</strong> across {baseline.posts} posts. A paid test needs 1.5× that.</>
            : baseline.why}
        </p>
      )}

      {error && <p className="mb-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>}

      {/* NO DATA IS NOT AN EMPTY LIST, and saying "no posts qualify" when nothing
          has ever been measured would be a verdict on content this has not seen.
          Organic figures come from the channel connector's insights; with none
          connected there is nothing to judge, and the honest thing is to name
          that rather than show a confident empty state. */}
      {!loading && !error && !posts?.length && (
        <p className="rounded-lg border border-ink-800 bg-ink-950/40 p-3 text-sm text-slate-400">
          No organic figures yet. This ladder reads impressions and engagements from your connected channel — connect one under <strong className="text-slate-300">Connections</strong>, publish, and give a post a day before it can be judged. Nothing is ranked on figures that were not measured.
        </p>
      )}

      {!loading && !error && asked && posts?.length ? plans?.length === 0 && (
        <p className="py-4 text-sm text-slate-500">Nothing to decide on these posts yet.</p>
      ) : null}

      {!loading && plans && plans.length > 0 && (
        <ul className="space-y-2.5">
          {plans.map((p) => {
            const s = ACTION_STYLE[p.step.action];
            return (
              <li key={p.postId} className={`rounded-lg border p-3 ${s.ring}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <s.Icon className={`h-4 w-4 shrink-0 ${s.text}`} />
                  <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${s.text}`}>{s.label}</span>
                  <span className="truncate text-sm text-slate-300">{p.postId}</span>

                  {p.approvedGbp > 0 && (
                    <span className="ml-auto flex items-baseline gap-1.5 tabular-nums">
                      {/* The trimmed proposal is shown BESIDE the approved figure,
                          never instead of it — the approved one is the money. */}
                      {p.trimmed && <s className="text-xs text-slate-600">{money(p.step.proposedGbp)}</s>}
                      <strong className="text-sm text-white">{money(p.approvedGbp)}</strong>
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-sm text-slate-300">{p.step.reason}</p>

                {p.blockers.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {p.blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300">
                        <Ban className="mt-0.5 h-3 w-3 shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-1.5 text-[11px] text-slate-500">
                  {RUNG_MEANING[p.step.to]}
                  {p.organic.evidence.multipleOfMedian !== null && <> · {p.organic.evidence.multipleOfMedian}× your median over {p.organic.evidence.impressions.toLocaleString()} impressions</>}
                  {p.maxCpaGbp !== undefined && <> · this offer affords {money(p.maxCpaGbp)} per customer</>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
