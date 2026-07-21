"use client";

// Campaign War Room — the live campaign board.
// Every campaign carries a verdict: losers die in 48 hours, winners get scale
// orders. Wired to /api/warroom: active campaigns each with channel, status,
// spend, results, ROAS and a Stop/Fix/Scale verdict, plus roll-up metrics,
// computed from the ACTIVE brand. Real attributed revenue is pulled from the
// results ledger (by brandId) and folded onto matching campaigns (Live);
// otherwise it is deterministic demo intelligence, badged. No fabricated stats.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Play, Loader2, Building2, Swords } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { SERIES } from "@/shared/palette";
import { PageHeader, Pill, StatCard, VerdictBadge } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import type { CampaignVerdict } from "@/shared/types";

const SPARK_COLOR: Record<CampaignVerdict, string> = {
  SCALE: SERIES[1],
  FIX: SERIES[2],
  STOP: SERIES[5],
  TESTING: SERIES[0],
};

type CampaignCard = {
  id: string; name: string; channel: string; goal: string; hook: string;
  status: "active" | "paused" | "testing";
  spend: number; leads: number; messages: number; orders: number; revenue: number;
  roas: number | null; costPerLead: number; costPerOrder: number;
  verdict: CampaignVerdict; verdictReason: string; spark: number[]; startedDaysAgo: number;
  dataMode: "demo" | "live";
};
type Metrics = { spend: number; leads: number; orders: number; revenue: number; roas: number; costPerLead: number; costPerOrder: number; activeCount: number };
type Board = {
  business: string; mode: "demo-intelligence" | "live"; badge: string;
  campaigns: CampaignCard[]; metrics: Metrics; realRevenueGbp: number; realOrders: number; note: string;
};

// JSON serialises Infinity → null; render an ∞ ROAS for zero-cost organic wins.
const roasLabel = (roas: number | null) => (roas === null ? "∞" : `${roas}×`);

export default function WarRoomPage() {
  const { activeBrand } = useActiveBrand();
  const [business, setBusiness] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusiness(activeBrand?.name ?? "");
    setBoard(null);
  }, [activeBrand?.id, activeBrand?.name]);

  async function run() {
    if (!business.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/warroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, brandId: activeBrand?.id }),
      });
      setBoard(await res.json());
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Campaign War Room"
        title="Live campaign grid"
        subtitle="Every campaign carries a verdict. Losers die in 48 hours; winners get scale orders. Real attributed revenue folds in from the results ledger; the rest is demo intelligence until your ad accounts connect."
        actions={
          <Link href="/dashboard/campaigns" className="btn-primary">
            <Plus className="h-4 w-4" /> New campaign
          </Link>
        }
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <label className="label">Business</label>
        <input className="input" value={business} placeholder="Add a brand in the sidebar, or type a business name" onChange={(e) => setBusiness(e.target.value)} />
        <button className="btn-primary mt-4" onClick={run} disabled={busy || !business.trim()}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading the grid…</> : <><Play className="h-4 w-4" /> Load campaign grid</>}
        </button>
      </div>

      {!board && (
        <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Swords className="h-8 w-8 text-emerald-500/60" />
          <p className="max-w-md text-sm text-slate-400">
            No campaigns running yet — {business.trim() ? "load the grid above, or " : "add a brand in the sidebar, then "}launch one from{" "}
            <Link href="/dashboard/campaigns" className="text-emerald-400 hover:underline">Campaign Builder</Link> /{" "}
            <Link href="/dashboard/warfare" className="text-emerald-400 hover:underline">Warfare</Link>.
          </p>
        </div>
      )}

      {board && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Pill tone={board.mode === "live" ? "good" : "warn"}>{board.badge}</Pill>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300">
              <Building2 className="h-3.5 w-3.5 text-emerald-400" /> {board.business}
            </span>
            {board.realRevenueGbp > 0 && (
              <span className="text-xs text-emerald-300">£{board.realRevenueGbp.toLocaleString()} real revenue attributed · {board.realOrders} orders</span>
            )}
          </div>

          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Money spent" value={`£${board.metrics.spend.toLocaleString()}`} sub={`${board.metrics.activeCount} active`} />
            <StatCard label="Leads generated" value={`${board.metrics.leads}`} tone="good" />
            <StatCard label="Cost per lead" value={board.metrics.costPerLead > 0 ? `£${board.metrics.costPerLead}` : "—"} tone="good" />
            <StatCard label="Blended ROAS" value={board.metrics.roas > 0 ? `${board.metrics.roas}×` : "—"} sub={`£${board.metrics.revenue.toLocaleString()} revenue`} tone={board.metrics.roas >= 2 ? "good" : "neutral"} />
          </div>

          <div className="space-y-4">
            {board.campaigns.map((c) => (
              <div key={c.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display font-bold text-white">{c.name}</h2>
                      <VerdictBadge verdict={c.verdict} />
                      <Pill>{c.channel}</Pill>
                      <Pill tone="info">{c.goal}</Pill>
                      {c.dataMode === "live" && <Pill tone="good">Live</Pill>}
                      {c.status === "paused" && <Pill tone="bad">paused</Pill>}
                    </div>
                    <p className="mt-1.5 text-sm italic text-slate-400">&ldquo;{c.hook}&rdquo;</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">7-day leads</p>
                      <Sparkline data={c.spark.length ? c.spark : [1, 1, 1, 1, 1, 1, 1]} color={SPARK_COLOR[c.verdict]} width={110} height={32} />
                    </div>
                    <p className="text-xs text-slate-500">day {c.startedDaysAgo}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  <Metric label="Spend" value={`£${c.spend.toLocaleString()}`} />
                  <Metric label="Leads" value={`${c.leads}`} />
                  <Metric label="Orders" value={`${c.orders}`} />
                  <Metric label="Revenue" value={`£${c.revenue.toLocaleString()}`} good={c.revenue > c.spend * 2} />
                  <Metric label="ROAS" value={roasLabel(c.roas)} good={c.roas === null || c.roas >= 3} />
                  <Metric label="Cost/order" value={c.orders > 0 ? `£${c.costPerOrder}` : "—"} good={c.orders > 0 && c.costPerOrder < 6} />
                </div>

                <div
                  className={`mt-4 rounded-lg border p-3.5 text-sm ${
                    c.verdict === "SCALE"
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                      : c.verdict === "STOP"
                        ? "border-rose-500/30 bg-rose-500/5 text-rose-200"
                        : c.verdict === "FIX"
                          ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
                          : "border-sky-500/30 bg-sky-500/5 text-sky-200"
                  }`}
                >
                  <span className="font-bold">Commander&apos;s order:</span> {c.verdictReason}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-slate-500">{board.note}</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg bg-ink-850 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`font-display text-lg font-bold ${good ? "text-emerald-400" : "text-white"}`}>{value}</p>
    </div>
  );
}
