"use client";

// Reusable branded export control. Drop it on any surface that has data the
// user produced — it downloads that data as CSV / JSON / a printable branded
// report, always stamped with the ACTIVE brand (name, logo, colours).
//
//   <ExportButton dataset="customer-vault" rows={contacts} />              // CSV + JSON
//   <ExportButton dataset="roi-plan" report={{ title, bodyHtml }} />       // branded report
//
// Provide `rows` for tabular exports, and/or `report` for a branded document.
// Whatever is provided shows as a menu option; nothing is faked.

import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, FileJson, FileSpreadsheet } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { exportCsv, exportJson, exportBrandedReport } from "@/frontend/export";

export default function ExportButton({
  dataset,
  rows,
  json,
  report,
  columns,
  label = "Export",
  disabled,
}: {
  dataset: string;
  rows?: Record<string, unknown>[];
  json?: unknown;
  report?: { title: string; bodyHtml: string };
  columns?: string[];
  label?: string;
  disabled?: boolean;
}) {
  const { activeBrand } = useActiveBrand();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const hasRows = Array.isArray(rows) && rows.length > 0;
  const hasJson = json !== undefined || hasRows;
  const isDisabled = disabled || (!hasRows && json === undefined && !report);

  const brand = activeBrand ? { name: activeBrand.name, logoUrl: activeBrand.logoUrl, brandColours: activeBrand.brandColours } : undefined;

  const doCsv = () => { if (hasRows) exportCsv(rows!, { dataset, brand, columns }); setOpen(false); };
  const doJson = () => { exportJson(json !== undefined ? json : rows, { dataset, brand }); setOpen(false); };
  const doReport = () => { if (report) exportBrandedReport({ ...report, dataset, brand }); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isDisabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-ink-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/40 disabled:opacity-40"
        title={isDisabled ? "Nothing to export yet" : "Export with your brand"}
      >
        <Download className="h-3.5 w-3.5" /> {label} <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && !isDisabled && (
        <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-white/[0.1] bg-ink-950 shadow-xl">
          {hasRows && (
            <button onClick={doCsv} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-emerald-500/10">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" /> CSV (spreadsheet)
            </button>
          )}
          {hasJson && (
            <button onClick={doJson} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-emerald-500/10">
              <FileJson className="h-3.5 w-3.5 text-sky-400" /> JSON (data)
            </button>
          )}
          {report && (
            <button onClick={doReport} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-emerald-500/10">
              <FileText className="h-3.5 w-3.5 text-amber-400" /> Branded report (PDF)
            </button>
          )}
          <p className="border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-slate-500">
            Stamped with {activeBrand?.name ? <span className="font-semibold text-slate-400">{activeBrand.name}</span> : "your brand"}
          </p>
        </div>
      )}
    </div>
  );
}
