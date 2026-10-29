"use client";

// WHAT WE PAY, AND WHAT THAT MAKES THE CUSTOMER PAY.
//
// THE QUESTION THIS SCREEN ANSWERS. Comparing our presenter price to HeyGen's:
// *"they are very very cheap compared to the price you are telling me."* Part
// of that gap is structural and cannot be closed — HeyGen builds its own avatar
// models and we resell them, so we pay retail and they pay GPU-seconds. The
// rest of it was a guess: every provider cost in this platform is an ESTIMATE,
// written before anybody had an invoice and deliberately set high, because
// under-costing breaches the margin floor silently while over-costing only
// leaves money on the table.
//
// A high estimate is a high price. This screen is where the estimate stops
// being a guess: type the real per-unit rate off a vendor invoice and every
// price derived from it re-derives immediately, on this server and everywhere
// within a minute, with no deploy.
//
// WHAT IT CANNOT DO, and the field says so before you type: a correction sets
// the believed COST. The price is still the pricing law — the higher of 4x that
// cost and the minimum that clears 100% net profit once infrastructure, Stripe
// and overhead are counted. So a cheaper invoice makes the platform cheaper,
// and no number typed here can make it unprofitable.

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, RefreshCw, RotateCcw, Route } from "lucide-react";
import { Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";

type Line = {
  key: string; costGbp: number; corrected: boolean; updatedAt?: string;
  priceAcu: number; priceGbp: number; markup: number | null; unit: string;
};
type PoolMember = {
  id: string; label: string; configured: boolean; costPerMinuteGbp: number;
  roster: boolean; translation: boolean; chosen: boolean;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Read the inventory by CHECKING it, not by asserting the wire's shape. */
function fromWire(raw: unknown): { lines: Line[]; pool: PoolMember[]; note: string; error?: string } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (typeof o.error === "string") return { lines: [], pool: [], note: "", error: o.error };
  const lines = (Array.isArray(o.lines) ? o.lines : []).map((row) => {
    const l = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      key: str(l.key), costGbp: num(l.costGbp), corrected: l.corrected === true,
      ...(typeof l.updatedAt === "string" ? { updatedAt: l.updatedAt } : {}),
      priceAcu: num(l.priceAcu), priceGbp: num(l.priceGbp),
      markup: typeof l.markup === "number" ? l.markup : null,
      unit: str(l.unit) || "per unit",
    };
  });
  const pool = (Array.isArray(o.pool) ? o.pool : []).map((row) => {
    const p = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      id: str(p.id), label: str(p.label), configured: p.configured === true,
      costPerMinuteGbp: num(p.costPerMinuteGbp),
      roster: p.roster === true, translation: p.translation === true, chosen: p.chosen === true,
    };
  });
  return { lines, pool, note: str(o.note) };
}

export default function AdminCosts() {
  const [lines, setLines] = useState<Line[]>([]);
  const [pool, setPool] = useState<PoolMember[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [said, setSaid] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/admin/costs");
      const parsed = fromWire(await res.json());
      if (!res.ok || parsed.error) throw new Error(parsed.error || `Could not read the costs (${res.status})`);
      setLines(parsed.lines); setPool(parsed.pool); setNote(parsed.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the costs.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(key: string) {
    const v = Number((draft[key] || "").trim());
    if (!Number.isFinite(v) || v < 0) { setError("That is not a number of pounds."); return; }
    setBusy(key); setError(null);
    try {
      const res = await authedFetch("/api/admin/costs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, costGbp: v }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(str((b as Record<string, unknown>)?.error) || `Could not save ${key}`);
      setDraft((d) => ({ ...d, [key]: "" }));
      setSaid((s) => ({ ...s, [key]: str((b as Record<string, unknown>)?.note) }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not save ${key}.`);
    } finally { setBusy(""); }
  }

  async function reset(key: string) {
    setBusy(key); setError(null);
    try {
      const res = await authedFetch(`/api/admin/costs?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      const b = await res.json();
      if (!res.ok) throw new Error(str((b as Record<string, unknown>)?.error) || `Could not reset ${key}`);
      setSaid((s) => ({ ...s, [key]: str((b as Record<string, unknown>)?.note) }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not reset ${key}.`);
    } finally { setBusy(""); }
  }

  if (loading) {
    return <div className="card flex items-center gap-2 p-5 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Reading the cost table…</div>;
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          <h2 className="font-display font-bold text-white">What we pay, and what that makes customers pay</h2>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-slate-500">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        Type the real per-unit rate off a vendor invoice and every price derived from it re-derives immediately — no
        deploy. A correction sets the believed <span className="font-semibold">cost</span>; the price stays the higher
        of 4× that cost and the minimum that clears 100% net profit, so a cheaper invoice makes us cheaper and nothing
        typed here can make us unprofitable.
      </p>
      {note && <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-200">{note}</p>}
      {error && <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">{error}</p>}

      {pool.length > 0 && (
        <div className="mb-4 rounded-lg border border-white/10 bg-ink-900/40 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Route className="h-3.5 w-3.5 text-sky-400" />
            <p className="text-xs font-semibold text-white">The presenter pool routes on cost</p>
          </div>
          <ul className="space-y-1">
            {pool.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={p.chosen ? "font-bold text-emerald-300" : "text-slate-300"}>{p.label}</span>
                <span className="text-slate-500">£{p.costPerMinuteGbp.toFixed(2)}/min</span>
                {p.configured ? <Pill tone={p.chosen ? "good" : "neutral"}>{p.chosen ? "renders your videos" : "configured"}</Pill> : <Pill tone="neutral">no key</Pill>}
                {p.roster && <span className="text-[10px] text-slate-500">roster</span>}
                {p.translation && <span className="text-[10px] text-slate-500">lip-synced translation</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            The cheapest configured provider renders, and the presenter price follows it — so adding a cheaper supplier
            lowers what customers pay rather than widening the margin. Only HeyGen publishes a roster or re-renders a
            mouth, so those two jobs go to HeyGen whatever else is set.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-1.5 pr-2">Line</th>
              <th className="py-1.5 pr-2">We pay</th>
              <th className="py-1.5 pr-2">They pay</th>
              <th className="py-1.5 pr-2">Markup</th>
              <th className="py-1.5">Correct it</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-t border-white/[0.06]">
                <td className="py-2 pr-2 align-top">
                  <p className="font-mono text-[11px] font-semibold text-white">{l.key}</p>
                  <p className="text-[10px] text-slate-500">{l.unit}</p>
                </td>
                <td className="py-2 pr-2 align-top">
                  <span className="text-slate-200">£{l.costGbp.toFixed(4)}</span>
                  {l.corrected
                    ? <Pill tone="good">from an invoice</Pill>
                    : <span className="ml-1 text-[10px] text-amber-300">estimate</span>}
                </td>
                <td className="py-2 pr-2 align-top text-slate-200">
                  {l.priceAcu} ACU<span className="block text-[10px] text-slate-500">£{l.priceGbp.toFixed(2)}</span>
                </td>
                <td className="py-2 pr-2 align-top text-slate-400">{l.markup === null ? "—" : `${l.markup}×`}</td>
                <td className="py-2 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      inputMode="decimal" value={draft[l.key] || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [l.key]: e.target.value }))}
                      placeholder={`£ ${l.unit}`}
                      className="w-28 rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-white outline-none focus:border-amber-500/60"
                    />
                    <button
                      type="button" onClick={() => void save(l.key)}
                      disabled={busy === l.key || !(draft[l.key] || "").trim()}
                      className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-ink-950 transition hover:bg-amber-400 disabled:opacity-40"
                    >
                      {busy === l.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </button>
                    {l.corrected && (
                      <button
                        type="button" onClick={() => void reset(l.key)} disabled={busy === l.key}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-slate-500 disabled:opacity-40"
                        title="Back to the built-in estimate"
                      >
                        <RotateCcw className="h-3 w-3" /> Reset
                      </button>
                    )}
                  </div>
                  {said[l.key] && <p className="mt-1 text-[10px] text-emerald-300">{said[l.key]}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
