"use client";

// Reusable "previous versions" dropdown for any generated output. Shows the last
// snapshots (newest first) with a timestamp; clicking one restores it. Pairs with
// pushVersion() in use-autosave — so a regenerate never loses the earlier version.

import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { listVersions, type Version } from "@/frontend/use-autosave";

export default function VersionHistory<T>({ storeKey, onRestore, refreshToken }: {
  storeKey: string;
  onRestore: (data: T) => void;
  refreshToken?: unknown; // change this (e.g. after saving a new version) to reload the list
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version<T>[]>([]);

  useEffect(() => { setVersions(listVersions<T>(storeKey)); }, [storeKey, refreshToken]);

  if (!versions.length) return null;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-emerald-500/40 hover:text-white">
        <History className="h-3.5 w-3.5" /> History ({versions.length})
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-lg border border-ink-700 bg-ink-900 p-1.5 shadow-xl shadow-black/40">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Previous versions</p>
          <div className="max-h-72 overflow-y-auto">
            {versions.map((v, i) => (
              <button key={v.id} type="button"
                onClick={() => { onRestore(v.data); setOpen(false); }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-ink-850">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-white">{v.label || `Version ${versions.length - i}`}</span>
                  <span className="block text-[10px] text-slate-500">{fmt(v.at)}</span>
                </span>
                <RotateCcw className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  // Render without constructing new Date() from scratch (allowed: parse a given string).
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso.slice(0, 16).replace("T", " "); }
}
