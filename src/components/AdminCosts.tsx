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
import { AlertTriangle, Calculator, Coins, Loader2, Receipt, RefreshCw, RotateCcw, Route } from "lucide-react";
import { Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";

type Line = {
  key: string; costGbp: number; corrected: boolean; updatedAt?: string; from?: string;
  priceAcu: number; priceGbp: number; markup: number | null; unit: string;
};
type UnitLine = { key: string; unit: string; units: number; source: "counted" | "derived" | "none"; how: string; caveat?: string };
type Measured = { totalUsd: number; unpaidUsd: number; calls: number; usdPerCall: number | null };
type Units = { month: string; lines: UnitLine[]; measured: Measured | null; walletsScanned: number; walletsCapped: boolean; note: string };
type Preview = {
  key: string; units: number; invoiceAmount: number; currency: string; fxToGbp: number; invoiceGbp: number;
  costPerUnitGbp: number; currentCostGbp: number; currentPriceAcu: number; newPriceAcu: number;
  direction: "cheaper" | "dearer" | "same"; changePct: number; verdict: string;
};
type PoolMember = {
  id: string; label: string; configured: boolean; costPerMinuteGbp: number;
  roster: boolean; translation: boolean; chosen: boolean;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Read a figure a person typed off a PDF.
 *
 * Thousands separators and a currency symbol come with the territory — the unit
 * count is even shown to them with commas in it. `Number("48,300")` is NaN, and
 * a NaN here would silently fall back to a DIFFERENT denominator than the one
 * they typed, so the separators are stripped and anything still unreadable is
 * reported rather than replaced.
 */
const typedNumber = (s: string) => Number((s || "").replace(/[,\s£$€]/g, ""));

/** Read the inventory by CHECKING it, not by asserting the wire's shape. */
function fromWire(raw: unknown): { lines: Line[]; pool: PoolMember[]; note: string; months: string[]; units: Units | null; error?: string } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (typeof o.error === "string") return { lines: [], pool: [], note: "", months: [], units: null, error: o.error };
  const lines = (Array.isArray(o.lines) ? o.lines : []).map((row) => {
    const l = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      key: str(l.key), costGbp: num(l.costGbp), corrected: l.corrected === true,
      ...(typeof l.updatedAt === "string" ? { updatedAt: l.updatedAt } : {}),
      ...(typeof l.from === "string" ? { from: l.from } : {}),
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
  const u = o.units && typeof o.units === "object" ? (o.units as Record<string, unknown>) : null;
  const units: Units | null = u
    ? {
        month: str(u.month),
        lines: (Array.isArray(u.lines) ? u.lines : []).map((row) => {
          const x = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
          const source = x.source === "counted" ? "counted" : x.source === "derived" ? "derived" : "none";
          return {
            key: str(x.key), unit: str(x.unit), units: num(x.units), source, how: str(x.how),
            ...(typeof x.caveat === "string" ? { caveat: x.caveat } : {}),
          } as UnitLine;
        }),
        measured: u.measured && typeof u.measured === "object"
          ? (() => {
              const m = u.measured as Record<string, unknown>;
              return { totalUsd: num(m.totalUsd), unpaidUsd: num(m.unpaidUsd), calls: num(m.calls), usdPerCall: typeof m.usdPerCall === "number" ? m.usdPerCall : null };
            })()
          : null,
        walletsScanned: num(u.walletsScanned),
        walletsCapped: u.walletsCapped === true,
        note: str(u.note),
      }
    : null;
  return {
    lines, pool, note: str(o.note), units,
    months: (Array.isArray(o.months) ? o.months : []).filter((m): m is string => typeof m === "string"),
  };
}

/**
 * Read a preview by CHECKING it. The numbers in here are about to be read as
 * "this is what customers will pay" — an undefined rendered as `NaN%` beside an
 * Apply button is worse than no preview at all.
 */
function previewFromWire(raw: unknown): Preview | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.key !== "string" || typeof p.verdict !== "string") return null;
  const direction = p.direction === "cheaper" ? "cheaper" : p.direction === "dearer" ? "dearer" : "same";
  return {
    key: p.key, units: num(p.units), invoiceAmount: num(p.invoiceAmount),
    currency: str(p.currency) || "GBP", fxToGbp: num(p.fxToGbp), invoiceGbp: num(p.invoiceGbp),
    costPerUnitGbp: num(p.costPerUnitGbp), currentCostGbp: num(p.currentCostGbp),
    currentPriceAcu: num(p.currentPriceAcu), newPriceAcu: num(p.newPriceAcu),
    direction, changePct: num(p.changePct), verdict: p.verdict,
  };
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

  // Reconciliation: the month, what we bought in it, and the invoice.
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState("");
  const [units, setUnits] = useState<Units | null>(null);
  const [recKey, setRecKey] = useState("");
  const [invoice, setInvoice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [fx, setFx] = useState("0.79");
  const [unitsOverride, setUnitsOverride] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const load = useCallback(async (forMonth?: string) => {
    setError(null);
    try {
      const qs = forMonth ? `?month=${encodeURIComponent(forMonth)}` : "";
      const res = await authedFetch(`/api/admin/costs${qs}`);
      const parsed = fromWire(await res.json());
      if (!res.ok || parsed.error) throw new Error(parsed.error || `Could not read the costs (${res.status})`);
      setLines(parsed.lines); setPool(parsed.pool); setNote(parsed.note);
      setMonths(parsed.months);
      setUnits(parsed.units);
      if (parsed.units?.month) setMonth(parsed.units.month);
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

  // THE DENOMINATOR for the line being reconciled: whatever the ledgers counted
  // for the chosen month, unless the owner typed a number over it. An override is
  // allowed because the vendor's own invoice often states the unit count, and the
  // vendor's count beats ours.
  const countedFor = (key: string) => units?.lines.find((l) => l.key === key) || null;
  const recLine = recKey ? countedFor(recKey) : null;
  const overrideTyped = (unitsOverride || "").trim().length > 0;
  const overrideN = typedNumber(unitsOverride);
  const overrideOk = Number.isFinite(overrideN) && overrideN > 0;
  const usingOverride = overrideTyped && overrideOk;
  const effectiveUnits = usingOverride ? overrideN : recLine?.units || 0;
  const invoiceTyped = invoice.trim().length > 0;
  const invoiceN = typedNumber(invoice);
  const invoiceOk = Number.isFinite(invoiceN) && invoiceN >= 0;

  async function reconcile(action: "preview" | "reconcile") {
    if (!recKey) { setError("Pick a cost line to reconcile."); return; }
    const amount = typedNumber(invoice);
    if (!Number.isFinite(amount) || amount < 0) { setError("The invoice total has to be a number, zero or more."); return; }
    if (overrideTyped && !overrideOk) {
      setError(`"${unitsOverride.trim()}" is not a unit count. Clear the field to divide by what the platform recorded, or type the number the vendor's invoice states.`);
      return;
    }
    setBusy(action === "preview" ? "preview" : "apply");
    setError(null);
    try {
      const res = await authedFetch("/api/admin/costs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, key: recKey, month,
          units: effectiveUnits,
          invoiceAmount: amount,
          currency: currency.trim().toUpperCase() || "GBP",
          fxToGbp: typedNumber(fx),
        }),
      });
      // Read through the checking helpers rather than asserting a shape onto
      // `res.json()`, which is `any` — an annotation here is a promise nobody
      // verified, and these numbers are about to be read as money.
      const b = await res.json();
      if (!res.ok) throw new Error(str(b?.error) || "The reconciliation was refused.");
      if (action === "reconcile") {
        // The preview is cleared on a successful apply. Leaving it up would
        // leave a button reading "apply it" beside a cost that already has it,
        // and the cost table itself now shows the line as corrected with the
        // division it came from.
        setPreview(null);
        setSaid((s) => ({ ...s, [recKey]: str(b?.note) }));
        await load(month);
      } else {
        setPreview(previewFromWire(b?.preview));
      }
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "The reconciliation was refused.");
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

      {/* ------------------------------------------------------------------
          RECONCILIATION — the invoice, and the denominator it needs.
          Every "we pay" above is a guess until an invoice replaces it, and the
          arithmetic is one division: invoice total ÷ units bought in the same
          month. The second number was the hard one. It was on no screen
          anywhere; it is the table below.
      ------------------------------------------------------------------- */}
      <div className="mt-5 rounded-xl border border-white/10 bg-ink-900/40 p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">Reconcile a line against a real invoice</h3>
          </div>
          {months.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              Month
              <select
                value={month}
                onChange={(e) => { setMonth(e.target.value); setPreview(null); setUnitsOverride(""); void load(e.target.value); }}
                className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-white outline-none focus:border-emerald-500/60"
              >
                {months.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
          Cost per unit is <span className="font-semibold text-slate-300">invoice total ÷ units bought in the same month</span>.
          Both halves have to be right, so the unit counts the platform actually recorded are below — counted where a
          ledger counted the thing itself, and marked <span className="font-semibold">derived</span> where the number is
          inferred from ACUs charged instead. A derived figure is exact only while the price has not moved.
        </p>

        {units && units.lines.length === 0 && (
          <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[11px] text-amber-200">{units.note}</p>
        )}

        {units && units.lines.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">Line</th>
                    <th className="py-1 pr-2">We bought</th>
                    <th className="py-1">Where that number comes from</th>
                  </tr>
                </thead>
                <tbody>
                  {units.lines.map((l) => (
                    <tr key={l.key} className={`border-t border-white/[0.06] ${l.key === recKey ? "bg-emerald-500/[0.05]" : ""}`}>
                      <td className="py-1.5 pr-2 align-top font-mono font-semibold text-white">{l.key}</td>
                      <td className="py-1.5 pr-2 align-top whitespace-nowrap">
                        <span className={l.units > 0 ? "font-semibold text-slate-100" : "text-slate-500"}>{l.units.toLocaleString("en-GB")}</span>
                        <span className="ml-1 text-slate-500">{l.unit}</span>
                        <span className="ml-1.5 align-middle">
                          {l.source === "counted"
                            ? <Pill tone="good">counted</Pill>
                            : l.source === "derived"
                              ? <Pill tone="warn">derived</Pill>
                              : <Pill tone="neutral">nothing recorded</Pill>}
                        </span>
                      </td>
                      <td className="py-1.5 align-top text-slate-400">
                        {l.how}
                        {l.caveat && <span className="block text-[10px] text-amber-300/90">{l.caveat}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{units.note}</p>
            {units.walletsCapped && (
              <p className="mt-1 flex items-start gap-1.5 text-[10px] text-amber-300">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                The wallet scan hit its cap, so every derived line is a floor rather than a total. Dividing an invoice by
                a floor OVERSTATES the cost per unit, which raises the price — type the vendor&apos;s own unit count
                over it instead.
              </p>
            )}

            {/* OUR OWN METER, which has never been on a screen. It is not the
                invoice — it is what the gateway thought it was spending — and
                the gap between the two is the thing worth looking at. */}
            {units.measured && (
              <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3">
                <p className="text-[11px] font-semibold text-sky-200">What our own meter recorded for {units.month}</p>
                <p className="mt-1 text-[11px] text-slate-300">
                  ${units.measured.totalUsd.toFixed(2)} across {units.measured.calls} AI calls
                  {units.measured.usdPerCall !== null && <> — ${units.measured.usdPerCall.toFixed(5)} a call</>}
                  {units.measured.unpaidUsd > 0 && <>, of which ${units.measured.unpaidUsd.toFixed(2)} was not billed to a wallet</>}.
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  This is the gateway&apos;s own estimate, not a bill. Where it disagrees with the invoice, the invoice
                  is right and the difference is what this screen exists to correct.
                </p>
              </div>
            )}
          </>
        )}

        {/* --- the division ------------------------------------------------ */}
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Line
            <select
              value={recKey}
              onChange={(e) => { setRecKey(e.target.value); setPreview(null); setUnitsOverride(""); }}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white outline-none focus:border-emerald-500/60"
            >
              <option value="">Pick one…</option>
              {lines.map((l) => <option key={l.key} value={l.key}>{l.key}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Invoice total
            <input
              inputMode="decimal" value={invoice}
              onChange={(e) => { setInvoice(e.target.value); setPreview(null); }}
              placeholder="e.g. 412.80"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white outline-none focus:border-emerald-500/60"
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Currency
            <input
              value={currency}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().slice(0, 3);
                setCurrency(v); setPreview(null);
                if (v === "GBP") setFx("1");
              }}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white outline-none focus:border-emerald-500/60"
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            £ per {currency || "unit"}
            <input
              inputMode="decimal" value={fx}
              onChange={(e) => { setFx(e.target.value); setPreview(null); }}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white outline-none focus:border-emerald-500/60"
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Units
            <input
              inputMode="decimal" value={unitsOverride}
              onChange={(e) => { setUnitsOverride(e.target.value); setPreview(null); }}
              placeholder={recLine ? recLine.units.toLocaleString("en-GB") : "—"}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white outline-none focus:border-emerald-500/60"
            />
          </label>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          Our cost table is in pounds and almost every provider bills in dollars, so the rate is required rather than
          assumed — a total pasted without one is wrong by roughly a fifth, in a direction nobody notices, on every
          customer&apos;s price. Leave <span className="font-semibold">Units</span> blank to divide by the{" "}
          {recLine ? `${recLine.source === "counted" ? "counted" : recLine.source === "derived" ? "derived" : "recorded"} ${recLine.units} ${recLine.unit}` : "recorded count"} for {month || "the month"};
          type a number to use the vendor&apos;s own count instead.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button" onClick={() => void reconcile("preview")}
            disabled={busy !== "" || !recKey || !invoiceTyped || !invoiceOk || (overrideTyped && !overrideOk)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
            Work out the cost per unit
          </button>
          {/* WHAT IT WILL ACTUALLY DIVIDE BY, before the button is pressed. A
              figure that cannot be read is named rather than quietly replaced
              by the recorded count. */}
          {invoiceTyped && !invoiceOk && (
            <span className="text-[10px] text-amber-300">&ldquo;{invoice.trim()}&rdquo; is not an invoice total.</span>
          )}
          {overrideTyped && !overrideOk && (
            <span className="text-[10px] text-amber-300">&ldquo;{unitsOverride.trim()}&rdquo; is not a unit count — clear it to use the recorded one.</span>
          )}
          {effectiveUnits > 0 && invoiceTyped && invoiceOk && !(overrideTyped && !overrideOk) && (
            <span className="text-[10px] text-slate-500">
              dividing by {effectiveUnits.toLocaleString("en-GB")} {recLine?.unit || "units"}{usingOverride ? " (your count)" : ""}
            </span>
          )}
        </div>

        {preview && (
          <div className={`mt-3 rounded-lg border p-3 ${preview.direction === "dearer" ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-emerald-500/30 bg-emerald-500/[0.06]"}`}>
            <p className="font-mono text-[11px] text-slate-300">
              {preview.currency} {preview.invoiceAmount} × {preview.fxToGbp} = £{preview.invoiceGbp.toFixed(2)} ÷ {preview.units.toLocaleString("en-GB")} ={" "}
              {/* FIVE PLACES, not the table's four. An AI call costs a third of
                  a penny, and 4dp rounds £0.002981 to £0.0030 — a figure being
                  checked against an invoice should not be rounded into
                  disagreeing with it. */}
              <span className="font-bold text-white">£{preview.costPerUnitGbp.toFixed(5)}</span> per unit
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-200">{preview.verdict}</p>
            <p className="mt-1 text-[10px] text-slate-500">
              We believe £{preview.currentCostGbp.toFixed(4)} today, charging {preview.currentPriceAcu} ACUs.
              Applying this charges {preview.newPriceAcu} ACUs.
            </p>
            <button
              type="button" onClick={() => void reconcile("reconcile")}
              disabled={busy !== ""}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-ink-950 transition hover:bg-emerald-400 disabled:opacity-40"
            >
              {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Apply it — {preview.key} becomes £{preview.costPerUnitGbp.toFixed(5)}, customers pay {preview.newPriceAcu} ACUs
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
