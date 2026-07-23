"use client";

// Collaboration & Approvals — real workflow board (no external key). Create an
// item, submit it for review, and move it through approve / request-changes /
// reject / publish. Every action is validated by the shared state machine and
// appended to an immutable history. Brand-scoped via authedFetch.

import { useCallback, useEffect, useState } from "react";
import { Loader2, GitPullRequestArrow, Plus, MessageSquare, CheckCircle2, Send } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { PageHeader, Pill } from "@/components/ui";
import { actionsFor, ACTION_META, STATE_META, PIPELINE, type ApprovalItem, type ApprovalAction } from "@/shared/approvals";

async function api(action: string, body: Record<string, unknown>) {
  const res = await authedFetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, nowISO: new Date().toISOString(), ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const toneClass: Record<string, string> = {
  neutral: "bg-slate-500/15 text-slate-300", info: "bg-sky-500/15 text-sky-300",
  warn: "bg-amber-500/15 text-amber-300", good: "bg-emerald-500/15 text-emerald-300", bad: "bg-rose-500/15 text-rose-300",
};
const btnTone: Record<string, string> = {
  primary: "bg-emerald-500 text-ink-950 hover:bg-emerald-400", good: "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30", bad: "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30",
  neutral: "bg-ink-800 text-slate-300 hover:bg-ink-700 border border-ink-700",
};

export default function ApprovalsPage() {
  const { activeBrand } = useActiveBrand();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!activeBrand) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { const d = await api("list", { brandId: activeBrand.id }); setItems(Array.isArray(d.items) ? d.items : []); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [activeBrand]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!activeBrand || !title.trim()) return;
    setBusy(true); setError(null);
    try { await api("create", { brandId: activeBrand.id, title, description: desc, assetUrl }); setTitle(""); setDesc(""); setAssetUrl(""); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function act(item: ApprovalItem, workflowAction: ApprovalAction) {
    if (!activeBrand) return;
    const note = noteFor[item.id] || "";
    setBusy(true); setError(null);
    try {
      await api("transition", { brandId: activeBrand.id, id: item.id, act: workflowAction, actor: "you", note });
      setNoteFor((m) => ({ ...m, [item.id]: "" }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function comment(item: ApprovalItem) {
    if (!activeBrand) return;
    const note = (noteFor[item.id] || "").trim();
    if (!note) return;
    setBusy(true); setError(null);
    try { await api("comment", { brandId: activeBrand.id, id: item.id, actor: "you", note }); setNoteFor((m) => ({ ...m, [item.id]: "" })); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Collaboration"
        title="Collaboration & Approvals"
        subtitle="Route work through review — creator → editor → manager → client → publish. Every decision is logged."
        actions={<Pill tone="good">Live · no key needed</Pill>}
      />

      {/* Pipeline legend */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {PIPELINE.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            <span className="rounded-full bg-ink-800 px-2.5 py-1 font-semibold capitalize text-slate-300">{p}</span>
            {i < PIPELINE.length - 1 && <span className="text-slate-600">→</span>}
          </span>
        ))}
      </div>

      {!activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <GitPullRequestArrow className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
          <h2 className="font-display text-lg font-bold text-white">Add a brand to start an approval workflow</h2>
          <p className="mt-1 text-sm text-slate-400">Approvals are scoped to a brand — pick or create one first.</p>
        </div>
      )}

      {activeBrand && (
        <>
          {/* Create */}
          <div className="card mb-6 p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-white"><Plus className="h-4 w-4 text-emerald-400" /> New item for review</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. 'Spring campaign hero video'" />
              <input className="input" value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)} placeholder="Asset link (optional) — https://…" />
              <textarea className="input sm:col-span-2 min-h-[64px]" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is it / what to check (optional)" />
            </div>
            <button className="btn-primary mt-3" onClick={create} disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to board
            </button>
          </div>

          {error && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

          {/* Board */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>
          ) : items.length === 0 ? (
            <div className="card p-10 text-center text-sm text-slate-400">No items yet — add the first one above.</div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const meta = STATE_META[item.state];
                const legal = actionsFor(item.state);
                return (
                  <div key={item.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-base font-bold text-white">{item.title}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneClass[meta.tone]}`}>{meta.label}</span>
                        </div>
                        {item.description && <p className="mt-1 text-sm text-slate-400">{item.description}</p>}
                        {item.assetUrl && <a href={item.assetUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-xs text-emerald-300 underline hover:text-emerald-200">{item.assetUrl}</a>}
                      </div>
                    </div>

                    {/* Note field (used by request-changes / reject / comment) */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        className="input flex-1 min-w-[200px]"
                        value={noteFor[item.id] || ""}
                        onChange={(e) => setNoteFor((m) => ({ ...m, [item.id]: e.target.value }))}
                        placeholder="Add a note (required to request changes or reject)…"
                      />
                      <button onClick={() => comment(item)} disabled={busy || !(noteFor[item.id] || "").trim()} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${btnTone.neutral} disabled:opacity-50`}>
                        <MessageSquare className="h-3.5 w-3.5" /> Comment
                      </button>
                    </div>

                    {/* Workflow actions legal from the current state */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {legal.map((a) => {
                        const am = ACTION_META[a];
                        return (
                          <button key={a} onClick={() => act(item, a)} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold ${btnTone[am.tone]} disabled:opacity-50`}>
                            {a === "approve" || a === "publish" ? <CheckCircle2 className="h-3.5 w-3.5" /> : a === "submit" ? <Send className="h-3.5 w-3.5" /> : null}
                            {am.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* History */}
                    {item.history.length > 0 && (
                      <details className="mt-3 group">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-300">History ({item.history.length})</summary>
                        <div className="mt-2 space-y-1.5 border-l border-ink-700 pl-3">
                          {item.history.map((h, i) => (
                            <div key={i} className="text-xs text-slate-400">
                              <span className="font-semibold text-slate-300">{h.actor}</span>{" "}
                              {h.from === h.to ? "commented" : <>moved <span className="text-slate-300">{h.from.replace(/_/g, " ")}</span> → <span className="text-emerald-300">{h.to.replace(/_/g, " ")}</span></>}
                              {h.note && <span className="text-slate-500"> — “{h.note}”</span>}
                              <span className="ml-1 text-slate-600">{new Date(h.at).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
