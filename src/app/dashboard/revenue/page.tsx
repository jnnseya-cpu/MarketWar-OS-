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
import { Building2, PlusCircle, Trash2, Wallet, Link2, Copy, Check, Loader2 } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { useResults } from "@/frontend/results-context";
import type { ResultType } from "@/shared/results";

type CheckoutResult = { ok: boolean; mode: "live" | "demo"; url: string | null; metadata: { marketwar_brand_id: string; marketwar_source: string }; note: string; error?: string };

export default function RevenuePage() {
  const { activeBrand } = useActiveBrand();
  const { events, summary, logEvent, removeEvent } = useResults();
  const [form, setForm] = useState<{ type: ResultType; source: string; amount: string; note: string }>({ type: "order", source: "", amount: "", note: "" });
  // Tagged checkout link (payments self-attribute)
  const [co, setCo] = useState({ product: "", amount: "", source: "" });
  const [coResult, setCoResult] = useState<CheckoutResult | null>(null);
  const [coBusy, setCoBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function genLink() {
    if (!co.product.trim() || !(Number(co.amount) > 0)) return;
    setCoBusy(true); setCoResult(null); setCopied(false);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand!.id, source: co.source.trim() || "Checkout link", amountGbp: Number(co.amount), productName: co.product }),
      });
      setCoResult(await res.json());
    } catch { setCoResult({ ok: false, mode: "demo", url: null, metadata: { marketwar_brand_id: activeBrand!.id, marketwar_source: co.source }, note: "Network error", error: "network" }); }
    finally { setCoBusy(false); }
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

      {/* Tagged checkout link — payments self-attribute, no manual logging */}
      <div className="mb-8 card p-5">
        <div className="mb-1 flex items-center gap-2"><Link2 className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Create a paid checkout link</h2></div>
        <p className="mb-3 text-xs text-slate-400">Share this link with a customer. When they pay, the revenue attributes to {activeBrand.name} automatically — no manual logging.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1"><label className="label">Product</label><input className="input" placeholder="e.g. Family platter" value={co.product} onChange={(e) => setCo((c) => ({ ...c, product: e.target.value }))} /></div>
          <div><label className="label">Amount (£)</label><input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={co.amount} onChange={(e) => setCo((c) => ({ ...c, amount: e.target.value }))} /></div>
          <div><label className="label">Source / campaign</label><input className="input" placeholder="e.g. Friday Platter — Meta" value={co.source} onChange={(e) => setCo((c) => ({ ...c, source: e.target.value }))} /></div>
          <div className="flex items-end"><button className="btn-primary w-full" onClick={genLink} disabled={coBusy || !co.product.trim() || !(Number(co.amount) > 0)}>{coBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Generate link</button></div>
        </div>
        {coResult && (
          <div className="mt-3 rounded-lg border border-white/[0.07] bg-ink-900/60 p-3">
            {coResult.ok && coResult.url ? (
              <>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${coResult.mode === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{coResult.mode === "live" ? "Live Stripe link" : "Demo link"}</span>
                  <code className="min-w-0 flex-1 truncate text-xs text-sky-300">{coResult.url}</code>
                  <button onClick={() => { navigator.clipboard?.writeText(coResult.url!); setCopied(true); }} className="shrink-0 text-slate-400 hover:text-white" title="Copy">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Attributes to <span className="text-slate-300">{coResult.metadata.marketwar_brand_id}</span> · source <span className="text-slate-300">{coResult.metadata.marketwar_source}</span>. {coResult.note}</p>
              </>
            ) : (
              <p className="text-xs text-rose-300">{coResult.error || coResult.note}</p>
            )}
          </div>
        )}
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
