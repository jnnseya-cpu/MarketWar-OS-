"use client";

// Business Vitality Index panel — the MOA's composite health score (0–100),
// recalculated every 15 minutes across 12 weighted dimensions
// (spec: docs/ai-os/03-agent-ecosystem.md §2.1). Gauge + sparkline + tap-to-
// expand dimension breakdown, per the Command Centre panel architecture
// (docs/ai-os/02 §2.0). Demo Intelligence data until Firestore listeners land.

import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { SERIES } from "@/shared/palette";

type DimensionStatus = "healthy" | "watch" | "alert";

type Dimension = {
  name: string;
  weight: number; // % of composite
  score: number; // 0–100
  measured: string;
  status: DimensionStatus;
};

// Weights are binding (doc 03 §2.1); demo scores tell the Brixton Grill House story.
const DIMENSIONS: Dimension[] = [
  { name: "Campaign ROAS health", weight: 15, score: 88, measured: "4.5× vs 2.0× industry benchmark", status: "healthy" },
  { name: "Revenue trend", weight: 15, score: 84, measured: "7-day revenue at 118% of prior week", status: "healthy" },
  { name: "Lead flow velocity", weight: 12, score: 79, measured: "14 leads/day vs 11 rolling average", status: "healthy" },
  { name: "Customer acquisition cost", weight: 12, score: 82, measured: "CAC £7.38 — 21% of LTV", status: "healthy" },
  { name: "Customer retention rate", weight: 10, score: 61, measured: "28% 30-day repeat-purchase rate", status: "watch" },
  { name: "Audience health", weight: 8, score: 72, measured: "Ad frequency 2.7 — saturation 41%", status: "healthy" },
  { name: "Dormant revenue risk", weight: 8, score: 44, measured: "38% of database inactive > 90 days", status: "watch" },
  { name: "Creative fatigue score", weight: 7, score: 58, measured: "Best hook CTR down 22% from peak", status: "watch" },
  { name: "Competitor threat level", weight: 5, score: 51, measured: "Flame Republic spend up 24% in 7 days", status: "watch" },
  { name: "Budget efficiency", weight: 4, score: 90, measured: "Pacing on plan, projected ROAS above floor", status: "healthy" },
  { name: "Opportunity capture rate", weight: 2, score: 67, measured: "2 of 3 high-score opportunities actioned < 48 h", status: "watch" },
  { name: "Platform engagement", weight: 2, score: 95, measured: "6 active days/week", status: "healthy" },
];

const BVI_HISTORY = [58, 60, 63, 62, 66, 69, 68, 71, 73, 72, 75, 76];

const STATUS_STYLES: Record<DimensionStatus, { dot: string; bar: string }> = {
  healthy: { dot: "bg-emerald-400", bar: SERIES[1] },
  watch: { dot: "bg-amber-400", bar: SERIES[4] },
  alert: { dot: "bg-rose-400", bar: SERIES[3] },
};

function compositeScore(): number {
  const total = DIMENSIONS.reduce((sum, d) => sum + d.score * d.weight, 0);
  return Math.round(total / 100);
}

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

export default function BviCard() {
  const [open, setOpen] = useState(false);
  const bvi = compositeScore();
  const trend: "rising" | "stable" | "declining" | "critical" = "rising";

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display font-bold text-white">Business Vitality Index</h2>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
          <TrendingUp className="h-3.5 w-3.5" /> {trend}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        MOA composite across 12 weighted dimensions · recalculated every 15 minutes
      </p>

      <div className="flex justify-center">
        <Gauge value={bvi} />
      </div>
      <div className="mt-3 overflow-hidden">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">12-week trajectory</p>
        <Sparkline data={BVI_HISTORY} color={SERIES[1]} width={210} height={44} />
        <p className="mt-2 text-xs text-slate-400">
          +18 points since onboarding — dormant-revenue risk is the biggest drag left.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-700/60 py-2 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/40 hover:text-white"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide dimension breakdown" : "Show 12-dimension breakdown"}
      </button>

      {open && (
        <div className="mt-4 space-y-2.5">
          {DIMENSIONS.map((d) => {
            const s = STATUS_STYLES[d.status];
            return (
              <div key={d.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {d.name}
                    <span className="text-[10px] text-slate-600">{d.weight}%</span>
                  </span>
                  <span className="text-xs font-bold text-white">{d.score}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700/60">
                  <div className="h-full rounded-full" style={{ width: `${d.score}%`, backgroundColor: s.bar }} />
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{d.measured}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
