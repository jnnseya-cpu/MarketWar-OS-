"use client";

// ONE SENTENCE, ONE BUTTON (§102's surface).
//
// Every engine behind this existed and the customer still had to know which
// chain to run. Say what you want; this says which chain does it, what it costs
// against today's remaining cap, which steps will stop and wait for you, and
// what the platform does not yet know about your brand.
//
// IT PLANS AND THEN STOPS. The plan is the thing you approve, and running is a
// second, deliberate click. A button that planned and ran in one go would take
// away the only moment where the cost and the human steps are visible — which
// is the entire reason for the feature.
//
// A chain that will not fit in what is left today is refused BEFORE the first
// step, with the arithmetic. Five of six steps spends the credits, produces no
// campaign, and delivers the failure after the money.

import { useCallback, useState } from "react";
import { Loader2, Cpu, AlertTriangle, UserCheck, Play, Info } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Step = { id: string; agentId: string; effect: string; purpose: string; costAcu: number; needsHuman: boolean };
type Plan = {
  ok: boolean; chainId?: string; label?: string; chosenBecause?: string;
  steps: Step[]; costAcu: number; remainingAcu: number;
  humanSteps: string[]; missingFacts: string[]; headline: string; refusal?: string;
};

export default function OneClickCampaign() {
  const { activeBrand } = useActiveBrand();
  const [sentence, setSentence] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const makePlan = useCallback(async () => {
    if (!activeBrand || !sentence.trim()) return;
    setPlanning(true); setError(null); setRan(null); setPlan(null);
    try {
      const res = await authedFetch("/api/orchestrator", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", brandId: activeBrand.id, sentence }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not work out a plan.");
      setPlan(d.plan as Plan);
    } catch (e) { setError((e as Error).message); }
    finally { setPlanning(false); }
  }, [activeBrand, sentence]);

  const run = useCallback(async () => {
    if (!activeBrand || !plan?.ok || !plan.chainId) return;
    setRunning(true); setError(null);
    try {
      const res = await authedFetch("/api/orchestrator", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", brandId: activeBrand.id, chainId: plan.chainId, input: sentence }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The run did not start.");
      setRan(`Started "${plan.label}". Anything needing your approval is on the Approvals board.`);
    } catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  }, [activeBrand, plan, sentence]);

  if (!activeBrand) return null;

  return (
    <div className="card mb-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">Say what you want</h2>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        In your own words. You will see which engines run, what it costs and where it stops for you — before anything starts.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); void makePlan(); }} className="flex flex-wrap gap-2">
        <input
          className="input min-w-[240px] flex-1" value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="e.g. get me more weekend bookings"
          aria-label="What do you want to happen"
        />
        <button type="submit" className="btn-primary" disabled={planning || !sentence.trim()}>
          {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />} Plan it
        </button>
      </form>

      {error && <p className="mt-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {ran && <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{ran}</p>}

      {plan && (
        <div className="mt-4 rounded-lg border border-ink-700 bg-ink-900/50 p-4">
          <p className={`text-sm font-semibold ${plan.ok ? "text-slate-100" : "text-amber-200"}`}>{plan.headline}</p>
          {plan.chosenBecause && <p className="mt-0.5 text-[11px] text-slate-500">Chose &ldquo;{plan.label}&rdquo; because it {plan.chosenBecause}.</p>}

          {/* The refusal carries the arithmetic, because "it will not fit" is
              only actionable with the numbers in it. */}
          {plan.refusal && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {plan.refusal}
            </p>
          )}

          {plan.steps.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {plan.steps.map((s, i) => (
                <li key={s.id} className="flex items-baseline gap-2 text-sm text-slate-300">
                  <span className="text-[11px] tabular-nums text-slate-600">{i + 1}</span>
                  <span>{s.purpose}</span>
                  {s.needsHuman && (
                    <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                      <UserCheck className="h-3 w-3" /> stops for you
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-slate-600">{s.costAcu} ACU</span>
                </li>
              ))}
            </ol>
          )}

          {plan.missingFacts.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-200/80">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Not known about your brand yet: {plan.missingFacts.join(", ")}. It will still run — the output is just more generic without them.
            </p>
          )}

          {plan.ok && (
            <button onClick={run} disabled={running} className="btn-primary mt-4">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run it — {plan.costAcu} ACUs
            </button>
          )}
        </div>
      )}
    </div>
  );
}
