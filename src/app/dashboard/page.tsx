import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, Crosshair, MessageCircle, Zap } from "lucide-react";
import { PageHeader, Pill, StatCard, VerdictBadge } from "@/components/ui";
import { demoActions, demoBusiness, demoCampaigns, demoConversations, demoMetrics } from "@/lib/data/demo";

export default function CommandCenterPage() {
  const m = demoMetrics;
  const active = demoCampaigns.filter((c) => c.status === "active");
  const hotThreads = demoConversations.filter((c) => c.unread > 0);

  return (
    <div>
      <PageHeader
        kicker="Executive Command Center"
        title={demoBusiness.name}
        subtitle={`${demoBusiness.industry} · ${demoBusiness.location} · Goal: ${demoBusiness.goal}`}
        actions={
          <Link href="/dashboard/briefing" className="btn-primary">
            <Zap className="h-4 w-4" /> Today&apos;s briefing
          </Link>
        }
      />

      {/* Live metrics bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Spend (month)" value={`£${m.spendMonth}`} sub={`£${m.spendToday} today`} />
        <StatCard label="Leads (month)" value={`${m.leadsMonth}`} sub={`${m.leadsToday} today`} tone="good" />
        <StatCard label="Cost / lead" value={`£${m.costPerLead}`} tone="good" />
        <StatCard label="Cost / order" value={`£${m.costPerOrder}`} sub="vs £9.50 AOV" tone="good" />
        <StatCard label="Revenue (month)" value={`£${m.revenueMonth}`} sub={`ROAS ${m.roas}x`} tone="good" />
        <StatCard label="Recoverable" value={`£${m.recoverableRevenue}`} sub="sleeping in your vault" tone="warn" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Priority panel */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-bold text-white">AI Priority Panel</h2>
            <Pill tone="info">ranked by £ impact</Pill>
          </div>
          <div className="space-y-3">
            {demoActions.map((a) => (
              <Link
                key={a.id}
                href={a.href}
                className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 p-4 transition hover:border-emerald-500/50"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    a.priority === "critical"
                      ? "bg-rose-500/15 text-rose-400"
                      : a.priority === "high"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-sky-500/15 text-sky-400"
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{a.action}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{a.reason}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-400">{a.impact}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
              </Link>
            ))}
          </div>
        </div>

        {/* Command feed */}
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-bold text-white">Live campaigns</h2>
              <Link href="/dashboard/war-room" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                War room <ArrowRight className="inline h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2.5">
              {active.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.channel} · £{c.spend} → {c.leads} leads
                    </p>
                  </div>
                  <VerdictBadge verdict={c.verdict} />
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-bold text-white">Needs a reply</h2>
              <Link href="/dashboard/whatsapp" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                WhatsApp <ArrowRight className="inline h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2.5">
              {hotThreads.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg bg-ink-850 px-3 py-2.5">
                  <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-200">{t.customer}</p>
                    <p className="truncate text-xs text-slate-500">{t.lastMessage}</p>
                  </div>
                  <span className="rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-ink-950">{t.unread}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">Intelligence snapshot</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">Best hook</dt>
                <dd className="text-emerald-300">&ldquo;{m.bestHook}&rdquo;</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">Worst ad (killed)</dt>
                <dd className="text-rose-300">&ldquo;{m.worstAd}&rdquo;</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">Best audience</dt>
                <dd className="text-slate-300">{m.bestAudience}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="mt-8 card flex flex-wrap items-center justify-between gap-4 border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-3">
          <Crosshair className="h-5 w-5 text-emerald-400" />
          <p className="text-sm text-slate-300">
            New here? Run the <span className="font-semibold text-white">Marketing Failure Audit</span> to find out
            why past spend produced nothing.
          </p>
        </div>
        <Link href="/dashboard/audit" className="btn-primary">
          Run the audit
        </Link>
      </div>
    </div>
  );
}
