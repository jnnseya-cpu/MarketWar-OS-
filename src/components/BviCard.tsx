"use client";

// Business Vitality Index panel — the MOA's composite health across 12 weighted
// dimensions (docs/ai-os/03 §2.1), rendered in the Command Centre panel shape
// (docs/ai-os/02 §2.0).
//
// THIS PANEL USED TO INVENT ITS OWN NUMBERS. Twelve hardcoded dimension scores
// in a field named `measured`, and the values are worth naming so they are
// recognised if they ever come back: "4.5× vs 2.0× industry benchmark",
// "CAC £7.38 — 21% of LTV", "Flame Republic spend up 24% in 7 days", and a
// BVI_HISTORY of twelve weekly points for a business with no history. It was
// mounted nowhere, which is the only reason it never reached anybody.
//
// It now takes its components as a prop and computes nothing itself. Everything
// it shows either came from a counted source or is labelled as not measured
// with the thing to connect. When too little of the index is measured there is
// no composite at all — the gauge is replaced by the reason, because a weighted
// score over a sixth of its own weight is one number wearing the authority of
// twelve.
//
// The sparkline is gone from the defaults for the same reason: a trajectory is
// a series of past values, and inventing twelve of them is the same offence in
// a prettier shape. Pass `history` when a real one exists and it comes back.

import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, HelpCircle } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { SERIES } from "@/shared/palette";
import { computeVitality, MIN_COVERAGE_PCT, type VitalityInput, type DimensionStatus } from "@/shared/vitality";

const STATUS_STYLES: Record<DimensionStatus, { dot: string; bar: string }> = {
  healthy: { dot: "bg-emerald-400", bar: SERIES[1] },
  watch: { dot: "bg-amber-400", bar: SERIES[4] },
  alert: { dot: "bg-rose-400", bar: SERIES[3] },
  unmeasured: { dot: "bg-slate-600", bar: "#334155" },
};

function Gauge({ value }: { value: number }) {
  // 240° arc gauge, 0–100.
  const r = 54;
  const cx = 70;
  const cy = 70;
  const start = 150; // degrees
  const sweep = 240;
  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = toXY(from);
    const [x2, y2] = toXY(to);
    const large = to - from > 180 ? 1 : 0;
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  const end = start + (sweep * value) / 100;
  const tone = value >= 70 ? SERIES[1] : value >= 40 ? SERIES[4] : SERIES[3];
  return (
    <svg viewBox="0 0 140 118" className="h-[118px] w-[140px]" role="img" aria-label={`Business Vitality Index ${value} of 100`}>
      <path d={arc(start, start + sweep)} fill="none" stroke="#1d2739" strokeWidth={11} strokeLinecap="round" />
      <path d={arc(start, Math.max(end, start + 1))} fill="none" stroke={tone} strokeWidth={11} strokeLinecap="round" />
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-white font-display" fontSize={30} fontWeight={700}>
        {value}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#64748b" fontSize={9} letterSpacing={1.5}>
        BVI / 100
      </text>
    </svg>
  );
}

export default function BviCard({
  components = [],
  history,
}: {
  /** Scored components — the `components` array from the Money Score. */
  components?: VitalityInput[];
  /** Real past values. Omitted means no trajectory is shown, not a made-up one. */
  history?: number[];
}) {
  const [open, setOpen] = useState(false);
  const v = computeVitality(components);
  const measured = v.dimensions.filter((d) => d.score !== null);
  const trend = history && history.length >= 2
    ? history[history.length - 1] > history[0] ? "rising" : history[history.length - 1] < history[0] ? "declining" : "stable"
    : null;

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display font-bold text-white">Business Vitality Index</h2>
        {trend && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" /> {trend}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Weighted across 12 dimensions · {v.coveragePct}% of the weight is measured
      </p>

      {v.score !== null ? (
        <div className="flex justify-center">
          <Gauge value={v.score} />
        </div>
      ) : (
        // The refusal, in the place the number would have been.
        <div className="flex items-start gap-3 rounded-lg border border-ink-700/60 bg-ink-900/40 p-4">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-slate-200">No index yet</p>
            <p className="mt-1 text-xs text-slate-400">{v.note}</p>
            {v.missing.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Biggest gap: <span className="text-slate-300">{v.missing[0].name}</span> ({v.missing[0].weight}% of the index) — {v.missing[0].connect}
              </p>
            )}
          </div>
        </div>
      )}

      {history && history.length >= 2 && (
        <div className="mt-3 overflow-hidden">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Trajectory · {history.length} points</p>
          <Sparkline data={history} color={SERIES[1]} width={210} height={44} />
        </div>
      )}

      {v.score !== null && v.weakest && (
        <p className="mt-3 text-xs text-slate-400">
          Biggest drag: <span className="text-slate-200">{v.weakest.name}</span> at {v.weakest.score}/100.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-700/60 py-2 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/40 hover:text-white"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide dimension breakdown" : `Show all 12 dimensions (${measured.length} measured)`}
      </button>

      {open && (
        <div className="mt-4 space-y-2.5">
          {v.dimensions.map((d) => {
            const s = STATUS_STYLES[d.status];
            return (
              <div key={d.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {d.name}
                    <span className="text-[10px] text-slate-600">{d.weight}%</span>
                  </span>
                  <span className={`text-xs font-bold ${d.score === null ? "text-slate-600" : "text-white"}`}>
                    {d.score === null ? "not measured" : d.score}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700/60">
                  {d.score !== null && (
                    <div className="h-full rounded-full" style={{ width: `${d.score}%`, backgroundColor: s.bar }} />
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{d.evidence}</p>
              </div>
            );
          })}
          <p className="pt-1 text-[11px] text-slate-600">
            A composite needs at least {MIN_COVERAGE_PCT}% of the weight measured. Below that the dimensions are shown on their own rather than averaged into a number that would look more certain than it is.
          </p>
        </div>
      )}
    </div>
  );
}
