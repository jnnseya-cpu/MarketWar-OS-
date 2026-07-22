"use client";

// Multi-brand switcher — one account, one bill, multiple brands (docs/ai-os/02
// §U1a). Backed by the shared active-brand context: switching re-skins every
// module form + agent call for the selected brand, and the choice persists.
// Adding OR editing a brand captures the essentials the engines need; no
// third-party key is involved. Brands can be renamed, edited and removed.

import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus, X, Pencil, Trash2 } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";

const BLANK = { name: "", industry: "", product: "", audience: "", location: "", offer: "", website: "", goal: "" };

export default function BrandSwitcher() {
  const { brands, activeBrand, setActive, addBrand, updateBrand, removeBrand } = useActiveBrand();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  const active = activeBrand ?? brands[0];

  function startAdd() {
    setEditingId(null);
    setForm({ ...BLANK });
    setAdding(true);
  }

  function startEdit(id: string) {
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    setForm({
      name: b.name || "", industry: b.industry || "", product: b.product || "",
      audience: b.audience || "", location: b.location || "", offer: b.offer || "",
      website: b.website || "", goal: b.goal || "",
    });
    setEditingId(id);
    setAdding(true);
  }

  function submit() {
    if (!form.name.trim()) return;
    if (editingId) {
      updateBrand(editingId, form);
    } else {
      addBrand(form);
    }
    setForm({ ...BLANK });
    setEditingId(null);
    setAdding(false);
    setOpen(false);
  }

  function del(id: string) {
    removeBrand(id);
    setConfirmDel(null);
  }

  return (
    <div className="relative border-b border-ink-700/60 px-3 py-3">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (brands.length === 0) startAdd(); else { setAdding(false); setEditingId(null); } }}
        className="flex w-full items-center gap-2.5 rounded-lg border border-ink-700/60 bg-ink-850 px-2.5 py-2 text-left transition hover:border-emerald-500/40"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white" style={{ background: `${active?.color ?? "#199e70"}26`, color: active?.color ?? "#199e70" }}>
          {brands.length === 0 ? <Plus className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{active?.name ?? "Add your first brand"}</span>
          <span className="block truncate text-[10px] text-slate-500">{brands.length === 0 ? "one account · one bill · many brands" : `${brands.length} brand${brands.length === 1 ? "" : "s"} · one account · one bill`}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div className="absolute inset-x-3 top-full z-50 mt-1 rounded-lg border border-ink-700 bg-ink-900 p-1.5 shadow-xl shadow-black/40">
          {!adding ? (
            <>
              <div className="max-h-72 overflow-y-auto">
                {brands.map((b) => (
                  <div key={b.id} className={`group flex items-center gap-1 rounded-md pr-1 transition ${b.id === active?.id ? "bg-emerald-500/10" : "hover:bg-ink-850"}`}>
                    <button
                      type="button"
                      onClick={() => { setActive(b.id); setOpen(false); }}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${b.id === active?.id ? "text-white" : "text-slate-300"}`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded" style={{ background: `${b.color}26`, color: b.color }}>
                        <Building2 className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{b.name}</span>
                        <span className="block truncate text-[10px] text-slate-500">{b.industry || "—"}{b.bvi ? ` · BVI ${b.bvi}` : ""}</span>
                      </span>
                      {b.id === active?.id && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                    </button>
                    <button type="button" title="Edit brand" onClick={() => startEdit(b.id)} className="shrink-0 rounded p-1 text-slate-500 hover:bg-ink-800 hover:text-emerald-300">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Remove brand" onClick={() => setConfirmDel(b.id)} className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {confirmDel && (
                <div className="mt-1 rounded-md border border-rose-500/25 bg-rose-500/[0.06] p-2 text-xs text-rose-100">
                  Remove <span className="font-semibold">{brands.find((b) => b.id === confirmDel)?.name}</span>? Its saved details are deleted.
                  <div className="mt-1.5 flex gap-1.5">
                    <button type="button" onClick={() => del(confirmDel)} className="rounded bg-rose-500 px-2 py-1 font-bold text-white hover:bg-rose-400">Remove</button>
                    <button type="button" onClick={() => setConfirmDel(null)} className="rounded border border-ink-700 px-2 py-1 text-slate-200 hover:border-slate-500">Cancel</button>
                  </div>
                </div>
              )}

              <div className="mt-1 border-t border-ink-700/60 pt-1">
                <button type="button" onClick={startAdd} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-emerald-400 transition hover:bg-ink-850">
                  <Plus className="h-3.5 w-3.5" /> Add a brand
                </button>
              </div>
            </>
          ) : (
            <div className="p-1.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-white">{editingId ? "Edit brand" : "New brand"}</p>
                <button type="button" onClick={() => { setAdding(false); setEditingId(null); }} className="text-slate-500 hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="space-y-1.5">
                {([
                  ["name", "Brand / business name *"],
                  ["industry", "Industry"],
                  ["product", "What you sell"],
                  ["audience", "Who you want"],
                  ["location", "Location"],
                  ["offer", "Current offer"],
                  ["goal", "Current goal"],
                  ["website", "Website"],
                ] as const).map(([k, label]) => (
                  <input
                    key={k}
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    placeholder={label}
                    className="w-full rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50"
                  />
                ))}
                <button type="button" onClick={submit} disabled={!form.name.trim()} className="mt-1 w-full rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-40">
                  {editingId ? "Save changes" : "Create brand"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
