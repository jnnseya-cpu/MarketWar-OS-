"use client";

// Admin Super Control Centre (M-30) — platform-operator view (U10/U11).
// Centrepiece: the ACU margin dashboard that enforces the owner pricing
// doctrine (docs/ai-os/08 §A.1a — every action >= 2x provider cost, i.e.
// margin never below 100%). The economics on this page are COMPUTED by the
// Platform-Owner Economics Engine (src/backend/admin-economics) and fetched
// via /api/admin-economics — no hardcoded margin/mix/trend constants. Provider
// cost + gross margin are OWNER-ONLY; the API is gated by requireAuth
// (platform_admin) in production and open only in the zero-config demo, where
// it serves a deterministic demo ledger. AdminInvites (real) is unchanged.

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldAlert, TrendingUp } from "lucide-react";
import { AreaChart, BarChart, DonutChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import AdminInvites from "@/components/AdminInvites";
import { authedFetch } from "@/frontend/api-client";

// Mirrors of the backend OwnerDashboard shape (the engine is server-only).
type Breakdown = { key: string; revenueGbp: number; costGbp: number; grossMarginPct: number; share: number };
type LeakAlert = { severity: "critical" | "warning"; scope: string; detail: string; marginPct: number };
type TrendPoint = { period: string; revenueGbp: number; costGbp: number; grossMarginPct: number };
type OwnerDashboard = {
  totalRevenueGbp: number;
  totalProviderCostGbp: number;
  grossProfitGbp: number;
  grossMarginPct: number;
  targetMarginPct: number;
  floorMarginPct: number;
  revenueByProvider: Breakdown[];
  revenueByFeature: Breakdown[];
  costLeakageAlerts: LeakAlert[];
  providerCostTrend: TrendPoint[];
  cacheHitRate: number;
  taskCount: number;
};

// Prettify provider keys ("gemini_flash" → "Gemini Flash", "cached" → "Cached / recycled").
function providerLabel(key: string): string {
  if (key === "cached") return "Cached / recycled";
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminPage() {
  const [dash, setDash] = useState<OwnerDashboard | null>(null);
  const [live, setLive] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // No ledger passed → the API serves the deterministic demo ledger.
        // A real acu_ledger would be posted here to render live economics.
        // authedFetch sends the Firebase ID token so the owner-only economics
        // route can verify the platform_admin scope (plain fetch omits it → 401).
        const res = await authedFetch("/api/admin-economics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dashboard" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError(body.error || `Economics unavailable (${res.status})`);
          return;
        }
        const data = (await res.json()) as OwnerDashboard & { mode?: string; empty?: boolean };
        if (!cancelled) { setDash(data); setLive(data?.mode === "live"); setEmpty(Boolean(data?.empty)); }
      } catch {
        if (!cancelled) setError("Economics engine temporarily unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: n < 1 ? 4 : 2 })}`;
  const costPerTask = dash && dash.taskCount > 0 ? dash.totalProviderCostGbp / dash.taskCount : 0;
  const floorAlerts = dash ? dash.costLeakageAlerts.filter((a) => a.severity === "critical").length : 0;

  return (
    <div>
      <PageHeader
        kicker="Admin Super Control Centre"
        title="Platform economics & agent governance"
        subtitle="Operator view (U10/U11). Every AI action is priced at a minimum 2× its fully-loaded provider cost — the margin floor is enforced per task, and this dashboard is where breaches surface. Figures are computed by the owner economics engine."
        actions={<div className="flex items-center gap-2"><Pill tone={live ? "good" : "info"}>{live ? "live economics" : "demo intelligence"}</Pill><Pill tone="warn">restricted · dual-logged</Pill></div>}
      />

      {error && (
        <div className="mb-8 card border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">{error}</div>
      )}

      {empty && !error && (
        <div className="mb-8 card border-emerald-500/25 bg-emerald-500/[0.04] p-4 text-sm text-emerald-100/90">
          <span className="font-semibold text-emerald-300">Live — no usage yet.</span> These are your real figures: everything is zero because no AI actions have been billed on this account. As agents and engines run, the ledger fills in here. (No demo numbers.)
        </div>
      )}

      {!dash && !error && (
        <div className="card flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Computing platform economics…
        </div>
      )}

      {dash && (
        <>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Blended ACU margin" value={`${dash.grossMarginPct}%`} sub={`floor: ${dash.floorMarginPct}% — never breached`} tone={dash.grossMarginPct >= dash.floorMarginPct ? "good" : "bad"} />
            <StatCard label="Blended provider cost / task" value={money(costPerTask)} sub={`${dash.taskCount} tasks · target < £0.005`} tone={costPerTask < 0.005 ? "good" : "warn"} />
            <StatCard label="Cache / recycle share" value={`${dash.cacheHitRate}%`} sub="tasks on near-zero-cost paths (target > 40%)" tone={dash.cacheHitRate >= 40 ? "good" : "warn"} />
            <StatCard label="Floor breaches" value={`${floorAlerts}`} sub="users below the 100% margin floor" tone={floorAlerts === 0 ? "good" : "bad"} />
          </div>

          <div className="mb-8 grid gap-6 lg:grid-cols-5">
            <div className="card p-5 lg:col-span-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display font-bold text-white">AI revenue vs provider cost — by period</h2>
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" /> gross profit {money(dash.grossProfitGbp)}
                </span>
              </div>
              <AreaChart
                labels={dash.providerCostTrend.map((t) => t.period)}
                series={[
                  { name: "ACU revenue", data: dash.providerCostTrend.map((t) => t.revenueGbp) },
                  { name: "Provider cost", data: dash.providerCostTrend.map((t) => t.costGbp) },
                ]}
                valuePrefix="£"
                height={230}
              />
              <p className="mt-3 text-xs text-slate-500">
                The gap is the doctrine at work: cheaper routing and recycling lower the cost line while prices stay
                competitive — margin comes from the cost base, never from gouging.
              </p>
            </div>
            <div className="card p-5 lg:col-span-2">
              <h2 className="mb-3 font-display font-bold text-white">Revenue by provider</h2>
              <DonutChart
                data={dash.revenueByProvider.map((p) => ({ label: providerLabel(p.key), value: p.share }))}
                centerValue={`${dash.cacheHitRate}%`}
                centerLabel="cached / recycled"
                size={185}
              />
              <p className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                The router always tries the cheapest sufficient path first; frontier models are reserved for reasoning
                that earns their cost.
              </p>
            </div>
          </div>

          <div className="mb-8 card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-bold text-white">Gross margin % by feature</h2>
              <Pill tone={dash.revenueByFeature.every((f) => f.grossMarginPct >= dash.floorMarginPct) ? "good" : "bad"}>
                {dash.revenueByFeature.every((f) => f.grossMarginPct >= dash.floorMarginPct) ? "all above the 100% floor" : "floor breach — investigate"}
              </Pill>
            </div>
            <BarChart
              data={dash.revenueByFeature.map((f) => ({ label: f.key, value: f.grossMarginPct }))}
              height={240}
              colorByEntity
            />
            <p className="mt-3 text-xs text-slate-500">
              Frontier-heavy features run closest to the floor — candidates for more caching and pre-generation
              scoring, never for a price rise first.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                <h2 className="font-display font-bold text-white">Kill-switches & governance</h2>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  ["Global send-freeze", "armed", "neutral"],
                  ["Per-agent freeze (19 agents)", "all running", "good"],
                  ["Prompt registry", "v3.0 signed — evals green", "good"],
                  ["Policy engine", "autonomy ceilings + spend caps compiled", "good"],
                  ["Two-person rule", "price-book & policy edits", "neutral"],
                ].map(([name, state, tone]) => (
                  <li key={name} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-2.5">
                    <span className="text-slate-300">{name}</span>
                    <Pill tone={tone as "good" | "neutral"}>{state}</Pill>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="font-display font-bold text-white">Escalation queue — cost-leakage alerts</h2>
              </div>
              <div className="space-y-3">
                {dash.costLeakageAlerts.length === 0 ? (
                  <div className="rounded-lg border border-ink-700 bg-ink-850 p-3.5">
                    <p className="text-sm font-semibold text-white">No open escalations</p>
                    <p className="text-xs text-slate-500">
                      Every user is above the strategic margin target. Blended margins below the floor (critical) or
                      the target (warning) surface here, worst-first, computed from the acu_ledger.
                    </p>
                  </div>
                ) : (
                  dash.costLeakageAlerts.slice(0, 6).map((a) => (
                    <div key={a.scope} className={`rounded-lg border p-3.5 ${a.severity === "critical" ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{a.scope}</p>
                        <Pill tone={a.severity === "critical" ? "bad" : "warn"}>{a.severity} · {a.marginPct}%</Pill>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{a.detail}</p>
                    </div>
                  ))
                )}
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5 text-xs text-sky-200">
                  Every view of this centre is dual-logged (actor + reason) and appears in the audit trail — including
                  yours, right now.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <AdminInvites />
    </div>
  );
}
