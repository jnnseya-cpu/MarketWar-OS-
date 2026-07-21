"use client";

// Customer Intelligence Vault — LIVE surface.
// Reads the active brand, calls the AI Audience Segmentation engine
// (/api/segments · action:"customers") and renders REAL computed output:
// per-contact RFM/LTV/churn/intent scores, the status donut and top-LTV list.
// No static demo arrays. On a clean slate (no brand) it shows an honest
// empty-state; with a brand selected it scores the deterministic demo base
// ("Demo intelligence") until real records are imported ("Live").

import { useCallback, useEffect, useState } from "react";
import { Loader2, Users, Upload } from "lucide-react";
import { DonutChart, HBarList } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Row = {
  id: string;
  name: string;
  segment: string;
  segmentLabel: string;
  spendGbp: number;
  orders: number;
  ltvGbp: number;
  churnRisk: number;
  purchaseIntent: number;
  lastOrderDaysAgo: number | null;
  consent: boolean;
};

type VaultReport = {
  business: string;
  live: boolean;
  totalContacts: number;
  totalLtvGbp: number;
  hot: number;
  atRisk: number;
  consentedShare: number;
  statusCounts: Record<string, number>;
  customers: Row[];
  note: string;
};

export default function CustomerVaultPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [report, setReport] = useState<VaultReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (business: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "customers", business }),
      });
      setReport(await res.json());
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-score whenever the active brand changes; clear when none.
  useEffect(() => {
    if (!ready) return;
    if (activeBrand) run(activeBrand.name);
    else setReport(null);
  }, [ready, activeBrand, run]);

  const donutData = report
    ? Object.entries(report.statusCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
    : [];
  const topLtv = report ? report.customers.slice(0, 5) : [];

  return (
    <div>
      <PageHeader
        kicker="Customer Intelligence Vault"
        title="Your database is a marketing asset"
        subtitle="Every contact scored for engagement, intent, churn risk and lifetime value by the live segmentation engine. Import CSV, CRM, Shopify, Stripe or WhatsApp exports and scoring runs the moment data lands."
        actions={
          report ? (
            <Pill tone={report.live ? "good" : "info"}>{report.live ? "Live records" : "Demo intelligence"}</Pill>
          ) : (
            <Pill tone="neutral">No workspace</Pill>
          )
        }
      />

      {/* Empty-state: no brand selected → honest, never demo data. */}
      {ready && !activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Upload className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">No contacts yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Import CSV / CRM / Stripe / WhatsApp to populate the vault. AI scoring runs the moment data lands —
            every contact gets RFM, LTV, churn and intent scores automatically.
          </p>
          <p className="mt-3 text-xs text-slate-600">Add a brand from the switcher to see the engine score a sample base.</p>
        </div>
      )}

      {busy && !report && (
        <div className="card p-10 text-center text-sm text-slate-400">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-400" />
          <p className="mt-3">Scoring contacts…</p>
        </div>
      )}

      {activeBrand && report && (
        <>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Contacts" value={`${report.totalContacts}`} sub={report.live ? "imported records" : "demo sample scored"} />
            <StatCard label="Lifetime value" value={`£${report.totalLtvGbp.toLocaleString()}`} tone="good" sub={`${Math.round(report.consentedShare * 100)}% consented`} />
            <StatCard label="Hot leads now" value={`${report.hot}`} tone="good" />
            <StatCard label="At churn risk" value={`${report.atRisk}`} tone="warn" sub="risk ≥ 60" />
          </div>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-3 font-display font-bold text-white">Vault by segment</h2>
              {donutData.length ? (
                <DonutChart size={185} centerValue={`${report.totalContacts}`} centerLabel="contacts" data={donutData} />
              ) : (
                <p className="text-sm text-slate-500">No segments yet.</p>
              )}
            </div>
            <div className="card p-5">
              <h2 className="mb-4 font-display font-bold text-white">Lifetime value — top customers</h2>
              {topLtv.length ? (
                <HBarList
                  valuePrefix="£"
                  data={topLtv.map((c) => ({ label: c.name, value: c.ltvGbp, note: `${c.orders} orders` }))}
                />
              ) : (
                <p className="text-sm text-slate-500">No customers yet.</p>
              )}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Segment</th>
                  <th className="px-4 py-3 text-right font-semibold">Spend</th>
                  <th className="px-4 py-3 text-right font-semibold">Orders</th>
                  <th className="px-4 py-3 text-right font-semibold">LTV</th>
                  <th className="px-4 py-3 text-right font-semibold">Intent</th>
                  <th className="px-4 py-3 text-right font-semibold">Churn risk</th>
                  <th className="px-4 py-3 text-right font-semibold">Last order</th>
                </tr>
              </thead>
              <tbody>
                {report.customers.map((c) => (
                  <tr key={c.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-850/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.consent ? "marketing-eligible" : "no consent"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={c.churnRisk >= 60 ? "warn" : c.purchaseIntent >= 75 ? "good" : "neutral"}>{c.segmentLabel}</Pill>
                    </td>
                    <td className="px-4 py-3 text-right font-display font-bold text-white">£{c.spendGbp.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{c.orders}</td>
                    <td className="px-4 py-3 text-right font-display font-bold text-emerald-300">£{c.ltvGbp.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-display font-bold ${c.purchaseIntent >= 75 ? "text-emerald-400" : c.purchaseIntent >= 50 ? "text-amber-400" : "text-slate-500"}`}>
                      {c.purchaseIntent}
                    </td>
                    <td className={`px-4 py-3 text-right font-display font-bold ${c.churnRisk >= 60 ? "text-rose-400" : c.churnRisk >= 30 ? "text-amber-400" : "text-emerald-400"}`}>
                      {c.churnRisk}%
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {c.lastOrderDaysAgo === null ? "—" : c.lastOrderDaysAgo === 0 ? "today" : `${c.lastOrderDaysAgo}d ago`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-600">{report.note}</p>
        </>
      )}
    </div>
  );
}
