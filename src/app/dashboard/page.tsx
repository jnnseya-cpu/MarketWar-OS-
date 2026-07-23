"use client";

// Executive Command Center — per-brand, money-honest. All figures come from the
// real results ledger (src/frontend/results-context): attributed revenue, orders
// and leads for the ACTIVE brand. NO fabricated money — empty until the brand
// has real activity. Switch brand in the sidebar to see that brand's numbers.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AreaChart, DonutChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { AlertTriangle, ArrowRight, Banknote, Building2, Crosshair, Hammer, Lightbulb, ListChecks, Target, Wallet, Zap } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { useResults } from "@/frontend/results-context";
import { authedFetch } from "@/frontend/api-client";

// Local mirror of the backend CommandBriefing shape (the engine is server-only,
// layer-guarded) — the page consumes it via /api/command-summary.
type BriefItem = { title: string; detail: string; priority: number; metric?: string; href?: string; cta?: string };
type CommandBriefing = {
  business: string;
  isEmpty: boolean;
  headline: string;
  nextBestAction: BriefItem | null;
  opportunities: BriefItem[];
  risks: BriefItem[];
  nextActions: BriefItem[];
  note: string;
};

export default function CommandCenterPage() {
  const { activeBrand } = useActiveBrand();
  const { events, summary } = useResults();
  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

  // Generative briefing — computed by the command-summary engine from THIS
  // brand's real ledger summary. Re-derives whenever the money moves.
  const [briefing, setBriefing] = useState<CommandBriefing | null>(null);
  const summaryKey = `${summary.events}|${summary.revenueGbp}|${summary.orders}|${summary.leads}`;
  useEffect(() => {
    if (!activeBrand) { setBriefing(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/command-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ business: activeBrand.name, summary }),
        });
        const data = (await res.json()) as CommandBriefing;
        if (!cancelled) setBriefing(data);
      } catch {
        if (!cancelled) setBriefing(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id, activeBrand?.name, summaryKey]);

  if (!activeBrand) {
    return (
      <div>
        <PageHeader kicker="Executive Command Center" title="Add your first brand" subtitle="One account, one bill, many brands. Add a brand in the sidebar to see its real numbers here." />
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Building2 className="h-8 w-8 text-emerald-500/60" />
          <p className="max-w-sm text-sm text-slate-400">Use the brand switcher at the top of the sidebar to add your first real brand — then every module works for that brand.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Executive Command Center"
        title={activeBrand.name}
        subtitle={[activeBrand.industry, activeBrand.location, activeBrand.goal && `Goal: ${activeBrand.goal}`].filter(Boolean).join(" · ") || "Your brand command center"}
        actions={<Link href="/dashboard/briefing" className="btn-primary"><Zap className="h-4 w-4" /> Today&apos;s briefing</Link>}
      />

      {/* RULE 4 — "Your next best money-making action". Dynamic: the top-ranked
          move computed from THIS brand's real ledger. Falls back to the
          first-customer sprint until the engine has a sharper call. */}
      {(() => {
        const nba = briefing?.nextBestAction;
        const href = nba?.href || "/dashboard/first-customer";
        const title = nba?.title || (summary.isEmpty ? "Land your first customer" : "Land another customer");
        const detail = nba?.detail || "One screen, no ads: engineer the offer, find who to reach, write the outreach, and mint a payment link. Owned channels only — zero to a real paying customer in a single sitting.";
        const cta = nba?.cta || "Start the sprint";
        return (
          <Link
            href={href}
            className="mb-6 block card border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.14] to-emerald-500/[0.02] p-5 transition hover:border-emerald-500/70"
          >
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400"><Zap className="h-3.5 w-3.5" /> Your next best money-making action</p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-ink-950">
                  <Banknote className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold text-white">{title}</h2>
                  <p className="mt-0.5 max-w-2xl text-sm text-slate-300">{detail}</p>
                  {nba?.metric && <p className="mt-1 text-xs font-semibold text-emerald-300">{nba.metric}</p>}
                </div>
              </div>
              <span className="btn-primary shrink-0">{cta} <ArrowRight className="h-4 w-4" /></span>
            </div>
          </Link>
        );
      })()}

      {/* Real per-brand money — zeros, never fake figures, when empty */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Attributed revenue" value={money(summary.revenueGbp)} tone={summary.revenueGbp > 0 ? "good" : "neutral"} sub="through MarketWar" />
        <StatCard label="Orders" value={`${summary.orders}`} />
        <StatCard label="Leads" value={`${summary.leads}`} tone={summary.leads > 0 ? "good" : "neutral"} />
        <StatCard label="Avg order value" value={summary.orders > 0 ? money(summary.avgOrderGbp) : "—"} />
      </div>

      {/* Generative command briefing — computed from the real ledger, not fabricated */}
      {briefing && (
        <div className="mt-8 card border-emerald-500/25 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display font-bold text-white">What to do next</h2>
            </div>
            <Pill tone="info">computed from your ledger</Pill>
          </div>
          <p className="mb-4 text-sm text-slate-300">{briefing.headline}</p>

          {briefing.isEmpty ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {briefing.nextActions.map((a) => (
                <Link key={a.title} href={a.href ?? "/dashboard"} className="rounded-lg border border-ink-700 bg-ink-850 p-3.5 transition hover:border-emerald-500/50">
                  <p className="text-sm font-semibold text-white">{a.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{a.detail}</p>
                  {a.cta && <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-400">{a.cta} <ArrowRight className="h-3 w-3" /></span>}
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400"><Lightbulb className="h-3.5 w-3.5" /> Opportunities</div>
                <div className="space-y-2">
                  {briefing.opportunities.length === 0 && <p className="text-xs text-slate-500">No standout opportunities yet — keep logging results.</p>}
                  {briefing.opportunities.map((o) => (
                    <div key={o.title} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{o.title}</p>
                        <Pill tone="good">P{o.priority}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{o.detail}</p>
                      {o.metric && <p className="mt-1 text-[11px] font-semibold text-emerald-300">{o.metric}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> At risk</div>
                <div className="space-y-2">
                  {briefing.risks.length === 0 && <p className="text-xs text-slate-500">No structural risks flagged in the ledger.</p>}
                  {briefing.risks.map((r) => (
                    <div key={r.title} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{r.title}</p>
                        <Pill tone="warn">P{r.priority}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{r.detail}</p>
                      {r.metric && <p className="mt-1 text-[11px] font-semibold text-amber-300">{r.metric}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-400"><ListChecks className="h-3.5 w-3.5" /> Next actions</div>
                <div className="space-y-2">
                  {briefing.nextActions.map((a, i) => (
                    <Link key={a.title} href={a.href ?? "/dashboard"} className="flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-850 p-3 transition hover:border-emerald-500/50">
                      <span className="mt-0.5 font-display text-sm font-bold text-emerald-400">{i + 1}.</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{a.cta ?? a.title}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{a.title}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">{briefing.note}</p>
        </div>
      )}

      {summary.isEmpty ? (
        <div className="mt-8 card border-emerald-500/25 bg-emerald-500/[0.04] p-6">
          <div className="mb-2 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">No activity yet for {activeBrand.name}</h2></div>
          <p className="mb-4 max-w-2xl text-sm text-slate-400">This dashboard shows real money as it comes in — nothing is fabricated. Build a campaign, then log or capture the orders it produces and they appear here, attributed to their source.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/create" className="btn-primary"><Hammer className="h-4 w-4" /> Make anything</Link>
            <Link href="/dashboard/warfare" className="btn-ghost"><Target className="h-4 w-4" /> Design a campaign</Link>
            <Link href="/dashboard/revenue" className="btn-ghost"><Wallet className="h-4 w-4" /> Log a result</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-6 lg:grid-cols-5">
            <div className="card p-5 lg:col-span-3">
              <h2 className="mb-3 font-display font-bold text-white">Attributed revenue by day</h2>
              <AreaChart labels={summary.byDay.map((d) => d.day.slice(5))} series={[{ name: "Revenue", data: summary.byDay.map((d) => d.revenueGbp) }]} valuePrefix="£" height={230} />
            </div>
            <div className="card p-5 lg:col-span-2">
              <h2 className="mb-3 font-display font-bold text-white">Revenue by source</h2>
              {summary.bySource.some((s) => s.revenueGbp > 0) ? (
                <DonutChart size={190} centerValue={money(summary.revenueGbp)} centerLabel="attributed" data={summary.bySource.filter((s) => s.revenueGbp > 0).map((s) => ({ label: s.source, value: s.revenueGbp }))} />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">Leads only so far — log an order to see revenue by source.</p>
              )}
            </div>
          </div>

          <div className="mt-8 card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-bold text-white">Recent results</h2>
              <Link href="/dashboard/revenue" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Revenue <ArrowRight className="inline h-3 w-3" /></Link>
            </div>
            <div className="space-y-2">
              {events.slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">{e.source}</p>
                    <p className="text-xs text-slate-500">{e.at.slice(0, 10)} · {e.type}{e.note ? ` · ${e.note}` : ""}</p>
                  </div>
                  <span className="shrink-0 font-display font-bold text-white">{e.type === "lead" ? "lead" : money(e.amountGbp)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-8 card flex flex-wrap items-center justify-between gap-4 border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-3">
          <Crosshair className="h-5 w-5 text-emerald-400" />
          <p className="text-sm text-slate-300">Run the <span className="font-semibold text-white">Marketing Failure Audit</span> for {activeBrand.name} to find where spend leaks before you scale.</p>
        </div>
        <Link href="/dashboard/audit" className="btn-primary">Run the audit</Link>
      </div>
    </div>
  );
}
