"use client";

// Lead Recovery Center — LIVE surface.
// Reads the active brand, calls the AI Customer Resurrection engine
// (/api/recovery) and renders REAL computed output: recoverable cohorts with
// recoverable £ values (LTV × win-back probability, consented only), a
// per-cohort multi-wave touch plan with message templates, and the
// highest-value recoverable contacts. No static demo arrays, no hardcoded
// recoverable total. On a clean slate (no brand) it shows an honest empty-state.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCcw, Upload } from "lucide-react";
import { BarChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import ExportButton from "@/components/ExportButton";
import { authedFetch } from "@/frontend/api-client";
import { type Brand } from "@/shared/brand";

type Touch = { wave: number; channel: string; timing: string; message: string };
type Contact = { name: string; ltvGbp: number; recoveryGbp: number; lastOrderDaysAgo: number | null; churnRisk: number; orders: number };
type Cohort = {
  key: string;
  label: string;
  description: string;
  size: number;
  consentedSize: number;
  recoverableGbp: number;
  recoveryProbability: number;
  avgLtvGbp: number;
  waves: Touch[];
  topContacts: Contact[];
};
type RecoveryReport = {
  business: string;
  live: boolean;
  totalRecoverableGbp: number;
  totalRecoverableContacts: number;
  cohorts: Cohort[];
  note: string;
};

export default function RecoveryPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [report, setReport] = useState<RecoveryReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (brand: Brand) => {
    setBusy(true);
    try {
      const res = await authedFetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: { id: brand.id, name: brand.name } }),
      });
      setReport(await res.json());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (activeBrand) run(activeBrand);
    else setReport(null);
  }, [ready, activeBrand, run]);

  return (
    <div>
      <PageHeader
        kicker="AI Customer Resurrection Engine"
        title="Lead Recovery Center"
        subtitle="Recover money from the database you already own before spending a penny on cold ads. Every recoverable £ is computed from the contact's scored lifetime value × the cohort's win-back probability — consented contacts only."
        actions={
          <div className="flex items-center gap-2">
            {report ? <Pill tone="good">Live records</Pill> : <Pill tone="neutral">No workspace</Pill>}
            {report && report.cohorts.length > 0 && (
              <ExportButton
                dataset="lead-recovery"
                label="Export recovery"
                columns={["label", "size", "consentedSize", "recoverableGbp", "recoveryProbability", "avgLtvGbp"]}
                rows={report.cohorts.map((c) => ({
                  label: c.label, size: c.size, consentedSize: c.consentedSize,
                  recoverableGbp: c.recoverableGbp, recoveryProbability: c.recoveryProbability, avgLtvGbp: c.avgLtvGbp,
                }))}
              />
            )}
          </div>
        }
      />

      {ready && !activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Upload className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Nothing to recover yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Import CSV / CRM / Stripe / WhatsApp to populate the vault. The recovery engine sorts your contacts into
            win-back cohorts and computes recoverable revenue the moment data lands.
          </p>
          <p className="mt-3 text-xs text-slate-600">Add a brand from the switcher, then import its contacts to see real recoverable revenue.</p>
        </div>
      )}

      {activeBrand && report && report.cohorts.length === 0 && !busy && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Upload className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Nothing to recover yet — your vault is empty</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            {report.note || "Import this brand's contacts and the engine computes recoverable revenue from your real database, never a sample."}
          </p>
          <Link
            href="/dashboard/customers"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-emerald-400"
          >
            <Upload className="h-4 w-4" /> Import contacts to Customer Vault
          </Link>
        </div>
      )}

      {busy && !report && (
        <div className="card p-10 text-center text-sm text-slate-400">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-400" />
          <p className="mt-3">Computing recoverable revenue…</p>
        </div>
      )}

      {activeBrand && report && report.cohorts.length > 0 && (
        <>
          <div className="mb-8 card border-emerald-500/40 bg-emerald-500/5 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">AI Revenue Recovery Score™</p>
            <p className="mt-2 font-display text-4xl font-bold text-white">
              £{report.totalRecoverableGbp.toLocaleString()} <span className="text-lg font-semibold text-slate-400">recoverable</span>
            </p>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              {report.totalRecoverableContacts} recoverable contacts across {report.cohorts.length} cohorts, ranked by recoverable value.
              Every figure is computed from scored LTV × the cohort win-back probability — not a spend of cold ad budget.
            </p>
          </div>

          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <StatCard label="Total recoverable" value={`£${report.totalRecoverableGbp.toLocaleString()}`} tone="good" sub="zero ad cost" />
            <StatCard label="Recoverable contacts" value={`${report.totalRecoverableContacts}`} sub={`${report.cohorts.length} cohorts`} />
            <StatCard
              label="Top cohort"
              value={report.cohorts[0] ? `£${report.cohorts[0].recoverableGbp.toLocaleString()}` : "—"}
              tone="warn"
              sub={report.cohorts[0]?.label}
            />
          </div>

          {report.cohorts.length > 0 && (
            <div className="mb-8 card p-5">
              <h2 className="mb-3 font-display font-bold text-white">Recoverable revenue by cohort</h2>
              <BarChart
                colorByEntity
                valuePrefix="£"
                height={210}
                data={report.cohorts.map((c) => ({ label: c.label.split(" ")[0], value: c.recoverableGbp }))}
              />
            </div>
          )}

          <div className="space-y-6">
            {report.cohorts.map((c) => (
              <div key={c.key} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-white">{c.label}</span>
                      <Pill tone="neutral">{c.consentedSize}/{c.size} consented</Pill>
                    </div>
                    <p className="mt-1 max-w-xl text-sm text-slate-400">{c.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-bold text-emerald-400">£{c.recoverableGbp.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-500">{Math.round(c.recoveryProbability * 100)}% win-back · avg LTV £{c.avgLtvGbp.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Wave plan</h3>
                    <div className="space-y-2.5">
                      {c.waves.map((w) => (
                        <div key={w.wave} className="rounded-lg bg-ink-850 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-200">Wave {w.wave}</span>
                            <div className="flex items-center gap-2">
                              <Pill tone="info">{w.channel}</Pill>
                              <span className="text-[11px] text-slate-500">{w.timing}</span>
                            </div>
                          </div>
                          <p className="mt-1.5 text-sm text-slate-400">&ldquo;{w.message}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Highest-value recoverable contacts</h3>
                    <div className="space-y-2.5">
                      {c.topContacts.map((ct, i) => (
                        <div key={`${c.key}-${i}`} className="flex items-center gap-3 rounded-lg bg-ink-850 p-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                            <RefreshCcw className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white">{ct.name}</p>
                            <p className="text-xs text-slate-500">
                              {ct.orders} orders · £{ct.ltvGbp.toLocaleString()} LTV
                              {ct.lastOrderDaysAgo !== null && ` · silent ${ct.lastOrderDaysAgo}d`} · churn {ct.churnRisk}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-display font-bold text-emerald-400">£{ct.recoveryGbp.toLocaleString()}</p>
                            <p className="text-[11px] text-slate-500">est. recovery</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-slate-600">{report.note}</p>
        </>
      )}
    </div>
  );
}
