"use client";

// Revenue attributed to MarketWar — the money proof, per brand.
// Real ledger (src/frontend/results-context): every lead/order/sale is logged
// and attributed to the campaign/source that produced it. NO fabricated figures
// — empty until the brand has real activity. Owned manual capture ("Log a
// result") gives real data day one; Stripe payment attribution lands next.

import { useState } from "react";
import { AreaChart, DonutChart } from "@/components/charts";
import { PageHeader, StatCard } from "@/components/ui";
import AgentRunner from "@/components/AgentRunner";
import { Building2, PlusCircle, Trash2, Wallet } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { useResults } from "@/frontend/results-context";
import type { ResultType } from "@/shared/results";

export default function RevenuePage() {
  const { activeBrand } = useActiveBrand();
  const { events, summary, logEvent, removeEvent } = useResults();
  const [form, setForm] = useState<{ type: ResultType; source: string; amount: string; note: string }>({ type: "order", source: "", amount: "", note: "" });

  if (!activeBrand) {
    return (
      <div>
        <PageHeader kicker="Revenue Intelligence" title="Revenue attributed to MarketWar" subtitle="Real orders and revenue, per brand — never vanity metrics." />
        <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Building2 className="h-8 w-8 text-emerald-500/60" />
          <p className="max-w-sm text-sm text-slate-400">Add a brand in the sidebar to start tracking the money it earns through MarketWar.</p>
        </div>
      </div>
    );
  }

  const isLead = form.type === "lead";
  function submit() {
    if (!form.source.trim()) return;
    logEvent({ type: form.type, source: form.source, amountGbp: isLead ? 0 : Number(form.amount) || 0, note: form.note });
    setForm((f) => ({ ...f, amount: "", note: "" }));
  }

  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

  return (
    <div>
      <PageHeader
        kicker="Revenue Intelligence"
        title="Revenue attributed to MarketWar"
        subtitle="Real orders and revenue this brand earned through MarketWar — attributed to the campaign that produced them. No fabricated figures: empty until you log or capture real activity."
        actions={<span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300"><Building2 className="h-3.5 w-3.5" style={{ color: activeBrand.color }} /> {activeBrand.name}</span>}
      />

      {/* Real per-brand stats — zeros, not fake numbers, when empty */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Attributed revenue" value={money(summary.revenueGbp)} tone={summary.revenueGbp > 0 ? "good" : "neutral"} />
        <StatCard label="Orders" value={`${summary.orders}`} />
        <StatCard label="Leads" value={`${summary.leads}`} />
        <StatCard label="Avg order value" value={summary.orders > 0 ? money(summary.avgOrderGbp) : "—"} />
      </div>

      {summary.isEmpty && (
        <div className="mb-8 card border-emerald-500/25 bg-emerald-500/[0.04] p-5">
          <div className="mb-1 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">No revenue captured yet for {activeBrand.name}</h3></div>
          <p className="text-sm text-slate-400">This is honest by design — you&apos;ll see real money here, not a sample. Log the first order below (or connect Stripe / an owned form) and it appears instantly, attributed to its campaign.</p>
        </div>
      )}

      {/* Log a result — owned capture, no third party */}
      <div className="mb-8 card p-5">
        <div className="mb-3 flex items-center gap-2"><PlusCircle className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Log a result</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ResultType }))}>
              <option value="order">Order</option>
              <option value="sale">Sale</option>
              <option value="lead">Lead (no value)</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="label">Source / campaign</label>
            <input className="input" list="mw-sources" placeholder="e.g. Friday Platter — Meta" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
            <datalist id="mw-sources">
              {[...new Set(summary.bySource.map((s) => s.source))].map((s) => <option key={s} value={s} />)}
              {["Meta Ads", "Google Ads", "TikTok", "WhatsApp", "Owned landing page", "Email", "Referral", "Local SEO"].map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Amount (£)</label>
            <input className="input" type="number" min="0" step="0.01" disabled={isLead} placeholder={isLead ? "—" : "0.00"} value={isLead ? "" : form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" onClick={submit} disabled={!form.source.trim()}>Log result</button>
          </div>
        </div>
        <input className="input mt-3" placeholder="Note (optional) — e.g. 14-person office catering order" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
      </div>

      {!summary.isEmpty && (
        <>
          <div className="mb-8 grid gap-6 lg:grid-cols-5">
            <div className="card p-5 lg:col-span-3">
              <h2 className="mb-3 font-display font-bold text-white">Attributed revenue by day</h2>
              <AreaChart
                labels={summary.byDay.map((d) => d.day.slice(5))}
                series={[{ name: "Revenue", data: summary.byDay.map((d) => d.revenueGbp) }]}
                valuePrefix="£"
                height={230}
              />
            </div>
            <div className="card p-5 lg:col-span-2">
              <h2 className="mb-3 font-display font-bold text-white">Revenue share by source</h2>
              {summary.bySource.some((s) => s.revenueGbp > 0) ? (
                <DonutChart
                  size={185}
                  centerValue={money(summary.revenueGbp)}
                  centerLabel="attributed"
                  data={summary.bySource.filter((s) => s.revenueGbp > 0).map((s) => ({ label: s.source, value: s.revenueGbp }))}
                />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">Leads only so far — log an order to see revenue share.</p>
              )}
            </div>
          </div>

          <div className="mb-8 card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Source / campaign</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Note</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-ink-800 last:border-0">
                    <td className="px-4 py-3 text-slate-400">{e.at.slice(0, 10)}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">{e.type}</td>
                    <td className="px-4 py-3 font-semibold text-white">{e.source}</td>
                    <td className="px-4 py-3 text-right font-display font-bold text-white">{e.type === "lead" ? "—" : money(e.amountGbp)}</td>
                    <td className="px-4 py-3 text-slate-500">{e.note ?? ""}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => removeEvent(e.id)} className="text-slate-600 hover:text-rose-400" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mb-4 font-display text-lg font-bold text-white">Run the Revenue Intelligence Agent</h2>
      <AgentRunner
        agentId="revenue-intelligence"
        buttonLabel="Analyse & forecast"
        fields={[
          { key: "business", label: "Business" },
          { key: "monthRevenue", label: "Revenue this month (£)", defaultValue: String(summary.revenueGbp) },
          { key: "monthSpend", label: "Ad spend this month (£)", defaultValue: "0" },
          { key: "notes", label: "Anything unusual?", placeholder: "e.g. rainy week, new competitor deal", textarea: true },
        ]}
      />
    </div>
  );
}
