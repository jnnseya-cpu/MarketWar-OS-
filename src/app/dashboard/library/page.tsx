"use client";

// The Work Library — every plan, campaign and piece of copy the OS has produced
// for this brand, in one place.
//
// This page exists because there was nowhere to find them. A 7-day content plan
// was generated, ACUs were spent, the customer clicked another link, and the
// work was gone with no history and no way back. Keeping the output is only half
// the fix; the other half is a page you can actually open.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Library, Search, Pin, PinOff, Trash2, Copy, Check, AlertTriangle, FileText } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { mdToHtml } from "@/frontend/markdown";

type WorkItem = {
  id: string; brandId: string; kind: string; source: string; sourceName: string;
  title: string; output: string; input: Record<string, string>;
  createdAt: string; updatedAt: string; pinned: boolean; note?: string;
};

const when = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

export default function LibraryPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [durable, setDurable] = useState(true);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (brandId: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/work?brandId=${encodeURIComponent(brandId)}&limit=200`);
      const d = await res.json().catch(() => ({}));
      setItems(Array.isArray(d.items) ? d.items : []);
      setDurable(d.durable !== false);
      setNote(typeof d.note === "string" ? d.note : "");
    } catch { setItems([]); } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (ready && activeBrand) load(activeBrand.id);
    else if (ready) setItems([]);
  }, [ready, activeBrand, load]);

  async function togglePin(item: WorkItem) {
    if (!activeBrand) return;
    setItems((cur) => cur.map((w) => (w.id === item.id ? { ...w, pinned: !w.pinned } : w)));
    await authedFetch("/api/work", {
      method: "POST", headers: { "content-type": "application/json", "x-now": new Date().toISOString() },
      body: JSON.stringify({ action: "update", brandId: activeBrand.id, id: item.id, pinned: !item.pinned }),
    }).catch(() => {});
    await load(activeBrand.id);
  }

  async function remove(item: WorkItem) {
    if (!activeBrand) return;
    if (!confirm(`Delete “${item.title}”? This cannot be undone — export it first if you might need it.`)) return;
    await authedFetch(`/api/work?brandId=${encodeURIComponent(activeBrand.id)}&id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    await load(activeBrand.id);
  }

  async function copy(item: WorkItem) {
    try {
      await navigator.clipboard.writeText(item.output);
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1500);
    } catch { /* clipboard blocked — the text is on screen anyway */ }
  }

  function download(item: WorkItem) {
    const blob = new Blob([item.output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(item.title || item.sourceName).replace(/[^\w\s-]+/g, "").trim().slice(0, 60) || "work"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((w) =>
      w.title.toLowerCase().includes(needle) ||
      w.sourceName.toLowerCase().includes(needle) ||
      w.output.toLowerCase().includes(needle));
  }, [items, q]);

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of items) m.set(w.sourceName || w.source, (m.get(w.sourceName || w.source) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  return (
    <div>
      <PageHeader
        kicker="Work Library"
        title="Everything the OS has made for you"
        subtitle="Every plan, campaign and piece of copy is saved automatically the moment it is generated — per brand, searchable, and yours to export. Nothing you paid for disappears because you clicked away."
        actions={<Pill tone="info">{items.length} saved</Pill>}
      />

      {ready && !activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Library className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Pick a brand first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Work is kept per brand, so choose one in the switcher to see its library.</p>
        </div>
      )}

      {activeBrand && (
        <>
          {!durable && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{note || "Durable storage is not configured on this deployment, so saved work lasts only for the current session. Export anything you need to keep."}</p>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and content…" />
            </div>
            {bySource.slice(0, 6).map(([name, n]) => (
              <button key={name} onClick={() => setQ(name)} className="rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1 text-[11px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300">
                {name} <span className="text-slate-500">{n}</span>
              </button>
            ))}
          </div>

          {busy && !items.length && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…</p>}

          {!busy && !items.length && (
            <div className="card p-10 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-400"><FileText className="h-5 w-5" /></span>
              <h2 className="mt-4 font-display text-lg font-bold text-white">Nothing saved yet for {activeBrand.name}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                Run any engine — Content Factory, Email Commander, Campaign Warfare — and the result lands here on its own. You do not have to remember to save.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((item) => (
              <div key={item.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId((c) => (c === item.id ? null : item.id))}>
                    <p className="truncate font-display text-sm font-bold text-white">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {item.sourceName} · {when(item.updatedAt || item.createdAt)}
                      {item.pinned && <span className="ml-2 text-amber-300">pinned</span>}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button title={item.pinned ? "Unpin" : "Pin to the top"} onClick={() => togglePin(item)} className="rounded p-1.5 text-slate-500 hover:bg-ink-850 hover:text-amber-300">
                      {item.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button title="Copy the whole thing" onClick={() => copy(item)} className="rounded p-1.5 text-slate-500 hover:bg-ink-850 hover:text-emerald-300">
                      {copied === item.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button title="Download as Markdown" onClick={() => download(item)} className="rounded p-1.5 text-slate-500 hover:bg-ink-850 hover:text-sky-300">
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                    <button title="Delete" onClick={() => remove(item)} className="rounded p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {openId === item.id && (
                  <div className="mt-3 border-t border-ink-700 pt-3">
                    <div className="prose-mw max-w-none text-sm" dangerouslySetInnerHTML={{ __html: mdToHtml(item.output) }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {Boolean(items.length) && !filtered.length && (
            <p className="mt-4 text-center text-xs text-slate-500">Nothing matches “{q}”.</p>
          )}
        </>
      )}
    </div>
  );
}
