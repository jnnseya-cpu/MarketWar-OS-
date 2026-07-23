"use client";

// WARLORD — Revenue Command (Money Machine Doctrine §6). The War Report: the
// Speed-of-Money strike queue computed from the brand's REAL ledger, plus the
// live 26-agent army roster with honest per-agent status (live / activate with a
// key / roadmap). Nothing fabricated; nothing labelled "coming soon".

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, Pill } from "@/components/ui";
import { Crown, Zap, ArrowRight, Radar, Swords, Target, Coins, ShieldCheck, Rocket } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { useResults } from "@/frontend/results-context";
import { authedFetch } from "@/frontend/api-client";
import { ARMY, DIVISIONS, armyStats, type ArmyAgent, type Division } from "@/shared/warlord-roster";

type BriefItem = { title: string; detail: string; priority: number; metric?: string; href?: string; cta?: string };
type Strike = BriefItem & { speed: string; speedRank: number };
type MoneyScore = { score: number | null; measured: number; total: number };
type WarReport = {
  business: string;
  topStrike: BriefItem | null;
  speedQueue: Strike[];
  briefing: { headline: string; moneyScore: MoneyScore; momentum: { revenueGbp: number; orders: number; leads: number } };
  note: string;
};

const DIVISION_ICON: Record<Division, typeof Crown> = {
  "Supreme Command": Crown, "Intelligence & Targeting": Radar, "Acquisition Strike Force": Target,
  "Conversion Kill Team": Swords, "Revenue Multiplication": Coins, "Fortress & Reputation": ShieldCheck, "Expansion Command": Rocket,
};
const speedTone: Record<string, string> = {
  reactivate: "bg-emerald-500/15 text-emerald-300", recover: "bg-sky-500/15 text-sky-300",
  multiply: "bg-violet-500/15 text-violet-300", convert: "bg-amber-500/15 text-amber-300", acquire: "bg-slate-500/15 text-slate-300",
};

function StatusChip({ a }: { a: ArmyAgent }) {
  if (a.status === "live") return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">Live</span>;
  if (a.status === "activate") return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Activate</span>;
  return <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Roadmap</span>;
}

export default function RevenueCommandPage() {
  const { activeBrand } = useActiveBrand();
  const { summary } = useResults();
  const [report, setReport] = useState<WarReport | null>(null);
  const stats = armyStats();

  const summaryKey = `${summary.events}|${summary.revenueGbp}|${summary.orders}|${summary.leads}`;
  useEffect(() => {
    if (!activeBrand) { setReport(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/warlord", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business: activeBrand.name, summary }) });
        const data = (await res.json()) as WarReport;
        if (!cancelled) setReport(data);
      } catch { if (!cancelled) setReport(null); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand, summaryKey]);

  return (
    <div>
      <PageHeader
        kicker="WARLORD · Revenue Command"
        title="War Report"
        subtitle="Your 26-agent revenue army and today's Speed-of-Money strike queue — computed from your real ledger."
        actions={<Pill tone="good">{stats.live} live · {stats.activate} activate</Pill>}
      />

      {!activeBrand ? (
        <div className="card border-emerald-500/20 p-10 text-center"><Crown className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" /><h2 className="font-display text-lg font-bold text-white">Add a brand to deploy the army</h2></div>
      ) : (
        <>
          {/* Top strike */}
          {report?.topStrike && (
            <Link href={report.topStrike.href || "/dashboard"} className="mb-6 block card border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.14] to-emerald-500/[0.02] p-5 transition hover:border-emerald-500/70">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400"><Zap className="h-3.5 w-3.5" /> WARLORD's top strike</p>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">{report.topStrike.title}</h2>
                  <p className="mt-0.5 max-w-2xl text-sm text-slate-300">{report.topStrike.detail}</p>
                  {report.topStrike.metric && <p className="mt-1 text-xs font-semibold text-emerald-300">{report.topStrike.metric}</p>}
                </div>
                <span className="btn-primary shrink-0">{report.topStrike.cta || "Execute"} <ArrowRight className="h-4 w-4" /></span>
              </div>
            </Link>
          )}

          {/* Speed-of-Money strike queue */}
          <div className="mb-6 card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-bold text-white"><Swords className="h-4 w-4 text-emerald-400" /> Speed-of-Money strike queue</h2>
            <p className="mb-3 text-xs text-slate-500">{report?.note || "Fastest cash first — reactivate, recover, multiply, convert, acquire."}</p>
            {report && report.speedQueue.length > 0 ? (
              <div className="space-y-2">
                {report.speedQueue.map((s, i) => (
                  <Link key={i} href={s.href || "/dashboard"} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-900/50 p-3 transition hover:border-emerald-500/30">
                    <div className="flex items-start gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${speedTone[s.speed] || speedTone.acquire}`}>{s.speed}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{s.title}</p>
                        <p className="text-xs text-slate-400">{s.detail}</p>
                        {s.metric && <p className="mt-0.5 text-[11px] font-semibold text-emerald-300">{s.metric}</p>}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No strikes queued yet — as your ledger fills (a lead, a sale, a recovery), WARLORD ranks the fastest money and lists it here.</p>
            )}
          </div>

          {/* Money momentum */}
          {report && (
            <div className="mb-6 grid gap-3 sm:grid-cols-4">
              <div className="card p-4"><p className="text-xs text-slate-400">Attributed revenue</p><p className="mt-1 font-display text-2xl font-bold text-emerald-300">£{(report.briefing.momentum.revenueGbp || 0).toLocaleString("en-GB")}</p></div>
              <div className="card p-4"><p className="text-xs text-slate-400">Orders</p><p className="mt-1 font-display text-2xl font-bold text-white">{report.briefing.momentum.orders}</p></div>
              <div className="card p-4"><p className="text-xs text-slate-400">Open leads</p><p className="mt-1 font-display text-2xl font-bold text-white">{report.briefing.momentum.leads}</p></div>
              <div className="card p-4"><p className="text-xs text-slate-400">Money Score</p><p className="mt-1 font-display text-2xl font-bold text-white">{report.briefing.moneyScore.score ?? "—"}</p></div>
            </div>
          )}
        </>
      )}

      {/* The 26-agent army */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Crown className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">The 26-agent revenue army</h2>
          <Pill tone="good">{stats.live} live</Pill>
          <Pill tone="warn">{stats.activate} activate with a key</Pill>
        </div>
        <div className="space-y-5">
          {DIVISIONS.map((div) => {
            const Icon = DIVISION_ICON[div];
            const agents = ARMY.filter((a) => a.division === div);
            return (
              <div key={div}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Icon className="h-3.5 w-3.5 text-emerald-400" /> {div}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {agents.map((a) => (
                    <Link key={a.n} href={a.href || "/dashboard"} className="card p-4 transition hover:border-emerald-500/40">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-display text-sm font-bold text-white">{a.codename}</span>
                        <StatusChip a={a} />
                      </div>
                      <p className="text-[11px] font-semibold text-emerald-300/80">{a.role}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{a.mission}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-600">KPI · {a.kpi}</p>
                      {a.status === "activate" && a.activates && <p className="mt-1 text-[11px] text-amber-300/80">{a.activates}</p>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
