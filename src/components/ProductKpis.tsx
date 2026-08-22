"use client";

// WHAT WE CANNOT YET SEE ABOUT OUR OWN PRODUCT (§98's surface).
//
// The admin console measures the money — revenue, provider cost, gross margin.
// It has never measured whether the PRODUCT works: how long a new account takes
// to get a campaign out, how long until it produces a lead, how often generated
// work is thrown away, how often a publish lands.
//
// THIS PANEL WILL MOSTLY SHOW "NOT ENOUGH YET", AND THAT IS THE POINT.
//
// Three of the four are not instrumented: nothing records signup-to-first-
// campaign, the gateway logs one action for a generation and a regeneration
// alike, and the publication ledger has no listing function. A panel that says
// so — naming what each figure needs — is worth more than four invented numbers
// that would look like measurement.
//
// It is the same rule the whole platform runs on, pointed at ourselves.

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, Gauge } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { formatKpiValue } from "@/shared/platform-kpis";

type Kpi = { id: string; label: string; value: number | null; unit: "days" | "percent"; observations: number; required: number; note: string };
type Payload = {
  kpis: Kpi[]; measured: number; headline: string;
  instrumentation: { measured: string[]; missing: string[] };
};

export default function ProductKpis() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await authedFetch("/api/admin-economics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "product-kpis" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not load the product KPIs.");
      setData(d as Payload);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">Does the product work?</h2>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Not the money — whether people get anywhere. At nought customers the revenue line is nought either way, so these are the four that matter.
      </p>

      {error && <p className="flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>}

      {data && (
        <>
          <p className="mb-4 text-sm text-slate-300">{data.headline}</p>

          <div className="space-y-3">
            {data.kpis.map((k) => (
              <div key={k.id} className="border-b border-ink-800/70 pb-3 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-slate-200">{k.label}</span>
                  {/* A withheld figure is shown as withheld, never as zero. */}
                  <span className={k.value === null ? "text-xs font-semibold text-slate-500" : "font-display text-lg font-bold text-white"}>
                    {formatKpiValue(k)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{k.note}</p>
              </div>
            ))}
          </div>

          {/* The gap, stated. This is the useful half while the figures are empty. */}
          <div className="mt-4 rounded-lg border border-ink-700 bg-ink-900/50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">What is instrumented</p>
            <ul className="mt-1.5 space-y-1 text-xs text-slate-400">
              {data.instrumentation.measured.map((m) => <li key={m}>· {m}</li>)}
            </ul>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-400/80">Still needed</p>
            <ul className="mt-1.5 space-y-1 text-xs text-amber-100/70">
              {data.instrumentation.missing.map((m) => <li key={m}>· {m}</li>)}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
