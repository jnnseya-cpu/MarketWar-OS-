"use client";

// Multi-brand switcher (owner ruling 2026-07-11: one account, one bill,
// multiple brands running simultaneously — docs/ai-os/02 §U1a). Every
// dashboard surface is brand-scoped; in demo mode switching highlights the
// selection while all modules render the active demo brand. Live data
// scoping arrives with Firestore (businesses.ownerId).

import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { demoAccountBrands } from "@/shared/demo";

export default function BrandSwitcher() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(demoAccountBrands[0].id);
  const active = demoAccountBrands.find((b) => b.id === activeId) ?? demoAccountBrands[0];

  return (
    <div className="relative border-b border-ink-700/60 px-3 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-ink-700/60 bg-ink-850 px-2.5 py-2 text-left transition hover:border-emerald-500/40"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{active.name}</span>
          <span className="block truncate text-[10px] text-slate-500">
            {demoAccountBrands.length} brands · one account · one bill
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div className="absolute inset-x-3 top-full z-50 mt-1 rounded-lg border border-ink-700 bg-ink-900 p-1.5 shadow-xl shadow-black/40">
          {demoAccountBrands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setActiveId(b.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
                b.id === activeId ? "bg-emerald-500/10 text-white" : "text-slate-300 hover:bg-ink-850"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.name}</span>
                <span className="block truncate text-[10px] text-slate-500">
                  {b.industry} · BVI {b.bvi}
                </span>
              </span>
              {b.id === activeId && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
            </button>
          ))}
          <div className="mt-1 border-t border-ink-700/60 pt-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-emerald-400 transition hover:bg-ink-850"
            >
              <Plus className="h-3.5 w-3.5" /> Add a brand — 1 slot free on your plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
