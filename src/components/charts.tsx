"use client";

import { useState, type ReactNode } from "react";

// MarketWar OS chart kit — plain SVG, no dependencies.
// Categorical slots are assigned in FIXED order (CVD-optimised ordering,
// validated against the card surface #101624). Identity is never carried by
// color alone: every multi-series chart renders a legend and marks carry
// hover tooltips; text stays in ink tokens, never series colors.

import { ORDINAL, SERIES } from "@/lib/palette";

const INK_MUTED = "#8b93a7";
const GRID = "rgba(148,163,184,0.12)";
const BASELINE = "rgba(148,163,184,0.28)";

interface Pt {
  x: number;
  y: number;
}

function scale(v: number, d0: number, d1: number, r0: number, r1: number) {
  return r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

function Tooltip({ tip }: { tip: { x: number; y: number; body: ReactNode } | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-ink-950/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      {tip.body}
    </div>
  );
}

export function Legend({ items, colors }: { items: string[]; colors?: readonly string[] }) {
  const c = colors ?? SERIES;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((label, i) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c[i % c.length] }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- AreaChart
export function AreaChart({
  labels,
  series,
  height = 220,
  valuePrefix = "",
  showLegend = true,
}: {
  labels: string[];
  series: { name: string; data: number[] }[];
  height?: number;
  valuePrefix?: string;
  showLegend?: boolean;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 42, r: 14, t: 14, b: 26 };
  const max = niceMax(Math.max(...series.flatMap((s) => s.data)));
  const px = (i: number) => scale(i, 0, labels.length - 1, pad.l, W - pad.r);
  const py = (v: number) => scale(v, 0, max, H - pad.b, pad.t);

  const linePath = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const areaPath = (data: number[]) =>
    `${linePath(data)} L${px(data.length - 1).toFixed(1)},${H - pad.b} L${px(0).toFixed(1)},${H - pad.b} Z`;

  const ticks = [0, max / 2, max];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={py(t)} y2={py(t)} stroke={t === 0 ? BASELINE : GRID} strokeWidth={1} />
            <text x={pad.l - 8} y={py(t) + 3.5} textAnchor="end" fontSize={10.5} fill={INK_MUTED}>
              {valuePrefix}
              {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}k` : t}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % Math.ceil(labels.length / 8) === 0 ? (
            <text key={i} x={px(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fill={INK_MUTED}>
              {l}
            </text>
          ) : null
        )}
        <defs>
          {series.map((_, si) => (
            <linearGradient key={si} id={`area-g-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[si]} stopOpacity={0.32} />
              <stop offset="100%" stopColor={SERIES[si]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {series.map((s, si) => (
          <path key={s.name} d={areaPath(s.data)} fill={`url(#area-g-${si})`} />
        ))}
        {series.map((s, si) => (
          <path key={s.name} d={linePath(s.data)} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* hover targets: one column per x — crosshair tooltip */}
        {labels.map((l, i) => (
          <rect
            key={i}
            x={i === 0 ? pad.l : (px(i - 1) + px(i)) / 2}
            width={i === 0 || i === labels.length - 1 ? (px(1) - px(0)) / 2 : px(1) - px(0)}
            y={pad.t}
            height={H - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={(e) => {
              const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setTip({
                x: (px(i) / W) * rect.width,
                y: (Math.min(...series.map((s) => py(s.data[i]))) / H) * rect.height,
                body: (
                  <div>
                    <p className="mb-1 font-semibold text-white">{l}</p>
                    {series.map((s, si) => (
                      <p key={s.name} className="flex items-center gap-1.5 text-slate-300">
                        <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[si] }} />
                        {s.name}: <span className="font-semibold text-white">{valuePrefix}{s.data[i].toLocaleString()}</span>
                      </p>
                    ))}
                  </div>
                ),
              });
            }}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </svg>
      {showLegend && series.length > 1 && (
        <div className="mt-2">
          <Legend items={series.map((s) => s.name)} />
        </div>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

// ----------------------------------------------------------------- BarChart
export function BarChart({
  data,
  height = 220,
  valuePrefix = "",
  colorByEntity = false,
  colors,
  showValues = true,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  valuePrefix?: string;
  // colorByEntity assigns fixed categorical slots per bar (identity encoding);
  // otherwise all bars share slot 1 (pure magnitude).
  colorByEntity?: boolean;
  colors?: readonly string[];
  showValues?: boolean;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 42, r: 14, t: 18, b: 40 };
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const innerW = W - pad.l - pad.r;
  const band = innerW / data.length;
  const barW = Math.min(46, band * 0.55);
  const py = (v: number) => scale(v, 0, max, H - pad.b, pad.t);
  const palette = colors ?? SERIES;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={py(t)} y2={py(t)} stroke={t === 0 ? BASELINE : GRID} strokeWidth={1} />
            <text x={pad.l - 8} y={py(t) + 3.5} textAnchor="end" fontSize={10.5} fill={INK_MUTED}>
              {valuePrefix}
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + (band - barW) / 2;
          const y = py(d.value);
          const h = Math.max(2, H - pad.b - y);
          const fill = d.color ?? (colorByEntity ? palette[i % palette.length] : palette[0]);
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.label}>
              {/* top-rounded bar anchored to baseline */}
              <path
                d={`M${x},${y + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} h${-barW} Z`}
                fill={fill}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({
                    x: ((x + barW / 2) / W) * rect.width,
                    y: (y / H) * rect.height,
                    body: (
                      <p className="text-slate-300">
                        {d.label}: <span className="font-semibold text-white">{valuePrefix}{d.value.toLocaleString()}</span>
                      </p>
                    ),
                  });
                }}
                onMouseLeave={() => setTip(null)}
              />
              {showValues && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#e2e8f0">
                  {valuePrefix}
                  {d.value.toLocaleString()}
                </text>
              )}
              <text x={x + barW / 2} y={H - pad.b + 16} textAnchor="middle" fontSize={10.5} fill={INK_MUTED}>
                {d.label.length > 11 ? d.label.slice(0, 10) + "…" : d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

// --------------------------------------------------------------- DonutChart
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  size = 200,
}: {
  data: { label: string; value: number }[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 84;
  const r = 56;
  const C = 100;
  let angle = -Math.PI / 2;

  const arcs = data.map((d, i) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
    return {
      d,
      i,
      path: `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`,
      mid: (a0 + a1) / 2,
      pct: Math.round((d.value / total) * 100),
    };
  });

  return (
    <div className="relative flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 200 200" style={{ width: size, height: size }} className="shrink-0" role="img">
        {arcs.map((a) => (
          <path
            key={a.d.label}
            d={a.path}
            fill={SERIES[a.i % SERIES.length]}
            stroke="#101624"
            strokeWidth={2}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setTip({
                x: ((C + (R - 14) * Math.cos(a.mid)) / 200) * rect.width,
                y: ((C + (R - 14) * Math.sin(a.mid)) / 200) * rect.height,
                body: (
                  <p className="text-slate-300">
                    {a.d.label}: <span className="font-semibold text-white">{a.d.value.toLocaleString()}</span> ({a.pct}%)
                  </p>
                ),
              });
            }}
            onMouseLeave={() => setTip(null)}
          />
        ))}
        {centerValue && (
          <text x={C} y={C - 2} textAnchor="middle" fontSize={22} fontWeight={700} fill="#ffffff">
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text x={C} y={C + 16} textAnchor="middle" fontSize={9.5} fill={INK_MUTED}>
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="min-w-[130px] space-y-1.5">
        {arcs.map((a) => (
          <p key={a.d.label} className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[a.i % SERIES.length] }} />
            <span className="flex-1">{a.d.label}</span>
            <span className="font-semibold text-slate-200">{a.pct}%</span>
          </p>
        ))}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- Sparkline
export function Sparkline({
  data,
  color = SERIES[0],
  width = 120,
  height = 36,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const px = (i: number) => scale(i, 0, data.length - 1, 2, width - 2);
  const py = (v: number) => scale(v, min, max || 1, height - 3, 3);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const gid = `spark-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }} role="img" aria-label="trend">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${px(data.length - 1)},${height - 1} L${px(0)},${height - 1} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={px(data.length - 1)} cy={py(data[data.length - 1])} r={2.6} fill={color} stroke="#101624" strokeWidth={1.5} />
    </svg>
  );
}

// ------------------------------------------------------------- FunnelChart
export function FunnelChart({
  stages,
  valuePrefix = "",
}: {
  stages: { label: string; value: number }[];
  valuePrefix?: string;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const max = stages[0]?.value || 1;
  return (
    <div className="relative space-y-2">
      {stages.map((s, i) => {
        const w = Math.max(12, (s.value / max) * 100);
        const conv = i === 0 ? null : Math.round((s.value / stages[i - 1].value) * 100);
        return (
          <div key={s.label} className="flex items-center gap-3">
            <p className="w-28 shrink-0 text-right text-xs text-slate-400">{s.label}</p>
            <div className="relative h-8 flex-1">
              <div
                className="flex h-8 items-center rounded-md px-2.5"
                style={{ width: `${w}%`, background: ORDINAL[Math.min(i, ORDINAL.length - 1)] }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const parent = e.currentTarget.closest(".relative.space-y-2") as HTMLElement;
                  const prect = parent.getBoundingClientRect();
                  setTip({
                    x: rect.left - prect.left + rect.width / 2,
                    y: rect.top - prect.top,
                    body: (
                      <p className="text-slate-300">
                        {s.label}: <span className="font-semibold text-white">{valuePrefix}{s.value.toLocaleString()}</span>
                        {conv !== null && <span className="text-slate-400"> · {conv}% from previous</span>}
                      </p>
                    ),
                  });
                }}
                onMouseLeave={() => setTip(null)}
              >
                <span className="text-xs font-bold text-white drop-shadow">{valuePrefix}{s.value.toLocaleString()}</span>
              </div>
              {conv !== null && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500">
                  {conv}% →
                </span>
              )}
            </div>
          </div>
        );
      })}
      <Tooltip tip={tip} />
    </div>
  );
}

// ------------------------------------------------------- HBarList (ranked)
export function HBarList({
  data,
  valuePrefix = "",
  colorByEntity = true,
}: {
  data: { label: string; value: number; note?: string }[];
  valuePrefix?: string;
  colorByEntity?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-slate-300">{d.label}</span>
            <span className="shrink-0 font-display font-bold text-white">
              {valuePrefix}
              {d.value.toLocaleString()}
              {d.note && <span className="ml-1.5 text-xs font-normal text-slate-500">{d.note}</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink-700/70">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(3, (d.value / max) * 100)}%`,
                background: colorByEntity ? SERIES[i % SERIES.length] : SERIES[0],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
