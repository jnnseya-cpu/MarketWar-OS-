"use client";

// THE BOARD (§95's surface).
//
// The radar has ranked opportunities transparently for a long time and had
// nowhere to put the result. With no state, a topic nobody had looked at and one
// quietly abandoned were the same thing, and the list only ever grew.
//
// WHAT HAS NOT MOVED IS SHOWN FIRST. The real failure of a board is not the
// wrong column — it is the middle column nobody has touched since March, so the
// stalled items are at the top rather than buried in a lane.
//
// A move that needs a reason ASKS FOR ONE before sending. Dropping something
// silently is how the same idea comes back in six weeks with nobody able to say
// why it was abandoned; the server refuses it either way, and asking here saves
// a round trip to be told off.

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, Clock, Plus, LayoutGrid } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { BOARD_COLUMNS, COLUMN_LABEL, allowedFrom, type Column } from "@/shared/opportunity-board";

type Item = {
  id: string; topic: string; opportunityScore?: number; column: Column; daysInColumn: number;
  // Trend Intelligence §5. Optional, and the difference matters on screen:
  // absent means NOT ASSESSED, which is not the same as assessed and low.
  confidence?: number; band?: string; vetoes?: string[]; briefId?: string;
};
type View = { columns: { column: Column; label: string; items: Item[] }[]; stalled: Item[]; headline: string };

// Which moves require a written reason. The server enforces this; the screen
// asks so nobody types a decision twice.
const NEEDS_NOTE: Column[] = ["dropped", "won", "lost"];

export default function OpportunityBoard() {
  const { activeBrand } = useActiveBrand();
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");

  const call = useCallback(async (body: Record<string, unknown>) => {
    if (!activeBrand) return null;
    const res = await authedFetch("/api/opportunity-radar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, ...body }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "That did not go through.");
    return d;
  }, [activeBrand]);

  const load = useCallback(async () => {
    if (!activeBrand) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setView((await call({ action: "board" })) as View); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [activeBrand, call]);

  useEffect(() => { load(); }, [load]);

  async function adopt() {
    if (!topic.trim()) return;
    setBusy(true); setError(null);
    try {
      await call({ action: "adopt", id: `op_${Date.now().toString(36)}`, topic: topic.trim() });
      setTopic(""); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function moveTo(item: Item, to: Column) {
    let note: string | undefined;
    if (NEEDS_NOTE.includes(to)) {
      const asked = window.prompt(
        to === "dropped"
          ? "Why is this being dropped? Without a reason the same idea comes back in six weeks and nobody remembers this happened."
          : `What actually happened? A ${to} with no reason teaches nothing.`,
      );
      if (asked === null) return;           // cancelled — not a silent drop
      note = asked.trim();
      if (!note) { setError("A reason is required for that move."); return; }
    }
    setBusy(true); setError(null);
    try { await call({ action: "move", id: item.id, to, note }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!activeBrand) return null;

  return (
    <div className="card mb-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">Opportunity board</h2>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Every opportunity has a state, so one nobody has looked at and one quietly abandoned are no longer the same thing.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); void adopt(); }} className="mb-4 flex flex-wrap gap-2">
        <input className="input min-w-[220px] flex-1" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="An opportunity worth tracking" aria-label="Opportunity" />
        <button type="submit" className="btn-primary" disabled={busy || !topic.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </form>

      {error && <p className="mb-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>}

      {view && (
        <>
          <p className="mb-4 text-sm text-slate-300">{view.headline}</p>

          {/* FIRST, deliberately. The middle column nobody has touched is the
              actual failure mode of every board. */}
          {view.stalled.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-300">
                <Clock className="h-3.5 w-3.5" /> Not moved in a while
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
                {view.stalled.map((i) => (
                  <li key={i.id}>{i.topic} — {i.daysInColumn} days in {COLUMN_LABEL[i.column]}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {view.columns.map((col) => (
              <div key={col.column} className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  {col.label} <span className="text-slate-600">({col.items.length})</span>
                </p>
                {col.items.length === 0 ? (
                  <p className="text-xs text-slate-600">—</p>
                ) : (
                  <ul className="space-y-2">
                    {col.items.map((i) => (
                      <li key={i.id} className="rounded-md border border-ink-800 bg-ink-900/60 p-2">
                        <p className="text-sm text-slate-200">{i.topic}</p>
                        <p className="mt-0.5 text-[10px] text-slate-600">
                          {i.daysInColumn} day{i.daysInColumn === 1 ? "" : "s"} here
                          {typeof i.opportunityScore === "number" && <> · scored {i.opportunityScore}/100 by the radar</>}
                        </p>

                        {/* THE ACTIVATION SIDE, and the distinction the numbers
                            alone cannot make. A radar score of 92 beside
                            nothing else reads as permission; it is not. What
                            decides whether anything may change is the
                            confidence in the EVIDENCE and whether anything is
                            vetoed — so when an item carries those, they are
                            shown next to the score rather than a screen away.

                            An item with no confidence shows NOTHING here. A "0"
                            for "nobody assessed it" is read as "assessed, and
                            worthless", which is a different and wrong claim. */}
                        {typeof i.confidence === "number" && (
                          <p className="mt-1 text-[10px]">
                            <span className={i.confidence >= 75 ? "text-emerald-300" : i.confidence >= 55 ? "text-amber-300" : "text-slate-500"}>
                              confidence {Math.round(i.confidence)}/100
                            </span>
                            {i.band && (
                              <span className="text-slate-500">
                                {" · "}
                                {i.band === "auto_eligible" ? "may act automatically"
                                  : i.band === "brief" ? "can become a reviewable brief"
                                  : i.band === "watch" ? "watch or draft internally"
                                  : "archived"}
                              </span>
                            )}
                            {i.confidence <= 69 && (
                              <span className="block text-slate-600">
                                One source family caps confidence at 69, so no live change on this alone.
                              </span>
                            )}
                          </p>
                        )}
                        {i.vetoes && i.vetoes.length > 0 && (
                          <p className="mt-1 text-[10px] text-rose-300">
                            held: {i.vetoes.join(", ")} — a veto is not a low score, so no score clears it
                          </p>
                        )}
                        {i.briefId && (
                          <p className="mt-1 text-[10px] text-emerald-300/80">brief {i.briefId} issued</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {allowedFrom(i.column).map((to) => (
                            <button
                              key={to} onClick={() => moveTo(i, to)} disabled={busy}
                              className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-100 disabled:opacity-50"
                            >
                              → {COLUMN_LABEL[to]}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-600">
            Only legal moves are offered: nothing reaches {COLUMN_LABEL[BOARD_COLUMNS[3]]} without passing through work.
          </p>
        </>
      )}
    </div>
  );
}
