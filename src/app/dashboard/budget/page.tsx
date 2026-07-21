"use client";

// Budget Protection Engine — The Financial Shield.
// The protection board is COMPUTED per brand by the Budget Protection Engine
// (/api/budget): per-campaign Stop/Fix/Scale verdicts, waste protected, projected
// saving, reroute return and standing-order rules. No hardcoded absolutes and no
// demo arrays — every figure is a clearly-labelled ESTIMATE / demo intelligence
// until live ad-account spend replaces the modelled campaigns in place. Honest
// empty-state on a clean slate (no brand yet).

import { useEffect, useState } from "react";
import { Building2, Loader2, ShieldCheck } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { BarChart } from "@/components/charts";
import { PageHeader, Pill, StatCard, VerdictBadge } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type ProtectedCampaign = {
  name: string;
  spendGbp: number;
  revenueGbp: number;
  roas: number;
  verdict: "SCALE" | "FIX" | "STOP";
  reason: string;
  protectedGbp: number;
};
type StandingOrder = { rule: string; detail: string };
type WeeklyReceipt = { weekProtectedGbp: number; weekRerouteReturnGbp: number; campaignsPaused: number; headline: string; cadence: "weekly" };
type BudgetReport = {
  business: string;
  monthlyBudgetGbp: number;
  totalSpendGbp: number;
  campaigns: ProtectedCampaign[];
  killedCount: number;
  protectedGbp: number;
  rerouteReturnGbp: number;
  projectedRoas: number;
  standingOrders: StandingOrder[];
  weeklyReceipt: WeeklyReceipt;
  note: string;
  isEstimate: true;
};

export default function BudgetProtectionPage() {
  const { activeBrand } = useActiveBrand();
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeBrand) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: activeBrand.name, monthlyBudget: 600 }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setReport(d as BudgetReport);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrand]);

  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <PageHeader
        kicker="Budget Protection Engine"
        title="The Financial Shield"
        subtitle="Campaigns that spend without producing revenue are flagged to pause — and auto-pause the moment your ad accounts connect. Budget flows to proven winners, with a weekly money-saved receipt. Figures below are modelled estimates per brand until live ad spend connects."
        actions={
          activeBrand ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300">
              <Building2 className="h-3.5 w-3.5" style={{ color: activeBrand.color }} /> {activeBrand.name}
            </span>
          ) : undefined
        }
      />

      {!activeBrand ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-emerald-500/60" />
          <h3 className="font-display font-bold text-white">Add a brand to arm the shield</h3>
          <p className="max-w-sm text-sm text-slate-400">
            The protection board is computed per brand — never a fake number. Add a brand in the sidebar and the engine
            models its spend allocation, waste and reroute so you can see the shield in action, then connect live ad
            accounts to protect real spend.
          </p>
        </div>
      ) : !report ? (
        <div className="card flex items-center justify-center gap-3 p-10 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Modelling the protection board for {activeBrand.name}…
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-slate-300">
              Modelled against a {money(report.monthlyBudgetGbp)}/mo budget
            </h2>
            <Pill tone="warn">estimate — modelled, not booked spend</Pill>
          </div>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Protected this cycle" value={money(report.protectedGbp)} sub="waste stopped + rerouted (est.)" tone="good" />
            <StatCard label="Campaigns flagged" value={`${report.killedCount}`} sub="zero-capture spend, flagged to pause" tone={report.killedCount > 0 ? "bad" : "neutral"} />
            <StatCard label="Reroute return" value={`+${money(report.rerouteReturnGbp)}`} sub="projected from scale winner (est.)" tone="good" />
            <StatCard label="Blended ROAS" value={`${report.projectedRoas}×`} sub={`£${report.totalSpendGbp.toLocaleString()} modelled spend`} tone={report.projectedRoas >= 2 ? "good" : "warn"} />
          </div>

          {/* Weekly money-saved receipt — the artifact the shield emails each week. */}
          <div className="mb-8 card border-emerald-500/25 bg-emerald-500/[0.04] p-5">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">This week&apos;s money-saved receipt</h2></div>
              <Pill tone="warn">weekly · estimate</Pill>
            </div>
            <p className="text-sm text-slate-300">{report.weeklyReceipt.headline}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div><p className="font-display text-2xl font-bold text-emerald-300">{money(report.weeklyReceipt.weekProtectedGbp)}</p><p className="text-[11px] text-slate-500">protected this week</p></div>
              <div><p className="font-display text-2xl font-bold text-white">+{money(report.weeklyReceipt.weekRerouteReturnGbp)}</p><p className="text-[11px] text-slate-500">projected reroute return</p></div>
              <div><p className="font-display text-2xl font-bold text-white">{report.weeklyReceipt.campaignsPaused}</p><p className="text-[11px] text-slate-500">campaign{report.weeklyReceipt.campaignsPaused === 1 ? "" : "s"} flagged to pause</p></div>
            </div>
          </div>

          <div className="mb-8 card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-bold text-white">Spend by campaign — modelled</h2>
              <Pill tone="warn">estimate</Pill>
            </div>
            <BarChart
              colorByEntity
              valuePrefix="£"
              height={210}
              data={report.campaigns.filter((c) => c.spendGbp > 0).map((c) => ({ label: c.name, value: c.spendGbp }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              The shield caps FIX campaigns and reroutes STOP budgets into the leading SCALE campaign.
            </p>
          </div>

          <div className="mb-8 card p-5">
            <h2 className="mb-4 font-display font-bold text-white">Standing protection orders</h2>
            <div className="space-y-3">
              {report.campaigns.map((c) => (
                <div key={c.name} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-850 p-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-white">
                      {c.name}
                      <span className="text-xs font-normal text-slate-500">
                        {money(c.spendGbp)} → {money(c.revenueGbp)} · ROAS {c.roas}×
                        {c.protectedGbp > 0 && <span className="text-emerald-300"> · protects {money(c.protectedGbp)}</span>}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-400">{c.reason}</p>
                  </div>
                  <VerdictBadge verdict={c.verdict} />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {report.standingOrders.map((o) => (
                <div key={o.rule} className="rounded-lg border border-ink-600 p-3.5 text-sm text-slate-400">
                  <span className="font-bold text-slate-200">{o.rule}:</span> {o.detail}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-ink-600 p-3.5 text-sm text-slate-400">
              <span className="font-bold text-slate-200">Autonomy level:</span> Guarded — the shield pauses waste
              automatically but asks before scaling. Levels: Manual → Guarded → Autonomous.
            </div>
            <p className="mt-3 text-xs text-slate-500">{report.note}</p>
          </div>
        </>
      )}

      <h2 className="mb-4 font-display text-lg font-bold text-white">Run the Budget Protection Agent</h2>
      <AgentRunner
        agentId="budget-protection"
        buttonLabel="Issue protection orders"
        fields={[
          { key: "business", label: "Business", defaultValue: activeBrand?.name ?? "" },
          { key: "weeklyBudget", label: "Weekly budget (£)", defaultValue: "150" },
          { key: "campaigns", label: "Campaign figures", defaultValue: "Family Platter: £84 → £610 rev · Catering: £112 → £380 · Awareness: £96 → £0 · Student Night: £40 → £133", textarea: true },
        ]}
      />
    </div>
  );
}
