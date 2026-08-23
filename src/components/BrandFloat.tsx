"use client";

// THE FLOAT, WHERE THE BRAND CAN SEE AND ADD THE MONEY.
//
// Custody existed with nothing rendering it, so a brand could not fund a mission
// even though the machinery was there. This is the screen.
//
// It shows three numbers and what each one means, because "balance" on its own
// invites the wrong question. Money reserved against a live mission has been
// PROMISED to creators and cannot be taken back while it runs — a brand needs to
// know that before they add money, not when they try to withdraw it.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet, AlertTriangle, ArrowUpRight } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type FloatView = {
  availablePence: number; heldPence: number; paidOutPence: number;
  toppedUpPence: number; refundedPence: number;
  summary: string; canTopUp: boolean; note: string;
};

const money = (p: number) => `£${(Math.max(0, p) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BrandFloat() {
  const { activeBrand } = useActiveBrand();
  const [view, setView] = useState<FloatView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("100");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeBrand) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const res = await authedFetch(`/api/brand-float?brandId=${encodeURIComponent(activeBrand.id)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not read the float.");
      setView(d as FloatView);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [activeBrand]);

  useEffect(() => { load(); }, [load]);

  async function topUp() {
    if (!activeBrand) return;
    const gbp = Number(amount);
    if (!Number.isFinite(gbp) || gbp < 1) { setError("Enter an amount of £1 or more."); return; }
    setBusy(true); setError(null);
    try {
      const res = await authedFetch("/api/brand-float", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand.id, gbp }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error || "Could not start the payment.");
      // Stripe's own page. Nothing is credited until Stripe confirms it to the
      // webhook — coming back to this page does not mean the money arrived.
      window.location.href = d.url as string;
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  if (!activeBrand) return null;

  return (
    <div className="card mb-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">Commission float</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        Creator commissions are paid from this. A mission cannot promise more than is available here — which is what makes
        &ldquo;held for this mission&rdquo; on a creator&rsquo;s card mean something.
      </p>

      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>}
      {error && <p className="mb-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}

      {view && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Available</p>
              <p className="font-display text-xl font-bold text-white">{money(view.availablePence)}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Free to reserve against a new mission.</p>
            </div>
            <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Reserved</p>
              <p className="font-display text-xl font-bold text-amber-300">{money(view.heldPence)}</p>
              {/* The thing a brand needs to know BEFORE they add money. */}
              <p className="mt-0.5 text-[11px] text-slate-500">Promised to creators on live missions. Not refundable while they run.</p>
            </div>
            <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Paid to creators</p>
              <p className="font-display text-xl font-bold text-emerald-300">{money(view.paidOutPence)}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Earned on verified sales and released.</p>
            </div>
          </div>

          {view.canTopUp ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-400">Add</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-400">£</span>
                <input
                  className="input w-28" inputMode="decimal" value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  aria-label="Amount to add in pounds"
                />
              </div>
              <button className="btn-primary" onClick={topUp} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />} Top up
              </button>
              <span className="text-[11px] text-slate-600">Card payment via Stripe. The balance updates when Stripe confirms it, not when you return.</span>
            </div>
          ) : (
            // Says which variable, because otherwise the button is simply absent
            // and nobody can tell whether that is a bug.
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-200">{view.note}</p>
          )}
        </>
      )}
    </div>
  );
}
